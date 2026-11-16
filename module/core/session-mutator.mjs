import { SessionStore } from "./session-store.mjs";
import { SessionTransport } from "./session-transport.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";

export class SessionMutator {
    #pendingMutations = new Map();

    async runSerialized(messageId, operation) {
        const previous = this.#pendingMutations.get(messageId) ?? Promise.resolve();
        const current = previous.catch(() => { }).then(operation);
        this.#pendingMutations.set(messageId, current);
        try {
            return await current;
        } finally {
            if (this.#pendingMutations.get(messageId) === current) this.#pendingMutations.delete(messageId);
        }
    }

    async submitRoll(messageId, participantKey, rollData) {
        if (!game.user.isGM) {
            return SessionTransport.emitToGM("submitUniversalRoll", { messageId, participantKey, rollData });
        }
        const message = this.#getActiveSessionMessage(messageId);
        const session = SessionStore.getSession(message);
        if (!session || session.isPreparingModifiers) return;

        const participant = session.participants.find((e) => e.key === participantKey);
        if (!participant || participant.hasRolled) return;

        const adapter = AdapterRegistry.active;
        if (adapter && !adapter.validateSubmittedRoll(session, participant, rollData)) return;

        const participants = session.participants.map((p) =>
            p.key === participantKey ? { ...p, ...rollData, modifierDice: p.modifierDice ?? 0, hasRolled: true } : p
        );
        await this.#finalizeStep(message, session, participants, participantKey);
    }

    async executePostRollAction(messageId, participantKey, actionId, payload = {}) {
        if (!game.user.isGM) {
            return SessionTransport.emitToGM("executePostRollAction", { messageId, participantKey, actionId, payload });
        }
        const message = this.#getActiveSessionMessage(messageId);
        const session = SessionStore.getSession(message);
        const adapter = AdapterRegistry.active;
        if (!session || !adapter) return;

        const result = await adapter.handlePostRollAction(session, participantKey, actionId, payload);
        if (!result) return;

        if (result.finalize) {
            await this.#finalizeStep(message, result.session, result.session.participants, participantKey);
        } else {
            await SessionStore.save(message, result.session);
        }
    }

    async setModifier(messageId, participantKey, modifierDice) {
        const clamped = Math.clamp(Number(modifierDice) || 0, -2, 2);
        if (!game.user.isGM) {
            const session = SessionStore.getSession(game.messages.get(messageId));
            const participant = session?.participants?.find((p) => p.key === participantKey);
            if (!participant || participant.hasRolled || !SessionStore.resolveActor(participant)?.isOwner) return;
            return SessionTransport.emitToGM("setParticipantModifier", { messageId, participantKey, modifierDice: clamped });
        }
        const message = this.#getActiveSessionMessage(messageId);
        const session = SessionStore.getSession(message);
        const participant = session?.participants?.find((p) => p.key === participantKey);
        if (!participant || participant.hasRolled) return;

        const modifierKeys = AdapterRegistry.active?.getModifierParticipantKeys?.(session, participantKey) ?? [participantKey];
        const participants = session.participants.map((p) =>
            modifierKeys.includes(p.key) ? { ...p, modifierDice: clamped } : p
        );
        await SessionStore.save(message, { ...session, participants });
    }

    async updateSessionPatch(messageId, patch) {
        if (!game.user.isGM) {
            return SessionTransport.emitToGM("updateSessionPatch", { messageId, patch });
        }
        const message = this.#getActiveSessionMessage(messageId);
        const session = SessionStore.getSession(message);
        if (!session) return;

        const adapter = AdapterRegistry.active;
        const nextSession = adapter?.transformSessionPatch
            ? await adapter.transformSessionPatch(session, patch)
            : { ...session, ...patch };

        await SessionStore.save(message, nextSession);
    }

    async publishPreparedRoll(messageId) {
        const message = this.#getActiveSessionMessage(messageId, true);
        const session = SessionStore.getSession(message);
        if (!session || !session.isPreparingModifiers) return;
        await SessionStore.save(message, { ...session, isPreparingModifiers: false });
    }

    async applyConsequences(messageId) {
        const message = this.#getActiveSessionMessage(messageId, true);
        const session = SessionStore.getSession(message);
        if (!session || session.consequencesApplied) return;

        const strategy = AdapterRegistry.active?.getStrategy(session.rollType);
        if (strategy) await strategy.applyConsequences(session);

        await SessionStore.save(message, {
            ...session,
            hasPendingConsequences: false,
            consequencesApplied: true
        });
    }

    async resolve(messageId) {
        const message = this.#getActiveSessionMessage(messageId, true);
        const session = SessionStore.getSession(message);
        const adapter = AdapterRegistry.active;
        if (!session || !session.participants.length || !session.participants.every((p) => p.hasRolled)) return;
        if (adapter?.canResolveSession?.(session) === false) return;

        const strategy = adapter?.getStrategy(session.rollType);
        const resolution = strategy ? strategy.evaluateResolution(session) : { winnerKey: "", outcomeHeadline: "" };

        await SessionStore.save(message, {
            ...session,
            phase: "resolved",
            winnerKey: resolution.winnerKey,
            outcomeHeadline: resolution.outcomeHeadline || session.outcomeHeadline,
            isResolved: true
        });
    }

    async #finalizeStep(message, session, participants, activeKey) {
        const strategy = AdapterRegistry.active?.getStrategy(session.rollType);
        const updated = participants.find((p) => p.key === activeKey);

        const workingState = { ...session, participants };
        const extraParticipants = strategy ? await strategy.onRollApplied(updated, workingState) : [];

        const finalParticipants = Array.isArray(extraParticipants) && extraParticipants.length > 0
            ? [...workingState.participants, ...extraParticipants]
            : workingState.participants;

        const allRolled = finalParticipants.length > 0 && finalParticipants.every((p) => p.hasRolled);
        const resolution = allRolled && strategy
            ? strategy.evaluateResolution({ ...workingState, participants: finalParticipants })
            : { winnerKey: "", outcomeHeadline: "" };

        await SessionStore.save(message, {
            ...workingState,
            participants: finalParticipants,
            phase: AdapterRegistry.active?.getSessionPhase?.(workingState, allRolled)
                ?? (allRolled ? "awaitingResolution" : "rolling"),
            winnerKey: resolution.winnerKey,
            outcomeHeadline: resolution.outcomeHeadline,
            isResolved: false
        });
    }

    #getActiveSessionMessage(messageId, gmOnly = false) {
        if ((gmOnly && !game.user.isGM) || !messageId) return null;
        const message = game.messages.get(messageId);
        const session = SessionStore.getSession(message);
        return session && !session.isResolved ? message : null;
    }
}
