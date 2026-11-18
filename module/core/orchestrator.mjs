import { SessionStore } from "./session-store.mjs";
import { SessionMutator } from "./session-mutator.mjs";
import { SessionHooks } from "./session-hooks.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";
import { MODULE_ID } from "./constants.mjs";

/** Coordinates session mutations and exposes the public roll orchestration API. */
export class UniversalRollOrchestrator {
    static #mutator = new SessionMutator();

    static #mutate(messageId, method, ...args) {
        return this.#mutator.runSerialized(messageId, () => this.#mutator[method](messageId, ...args));
    }

    static async #mutateAndMaybeResolve(messageId, method, ...args) {
        const result = await this.#mutate(messageId, method, ...args);
        await this.#resolveWhenReady(messageId);
        return result;
    }

    static async #resolveWhenReady(messageId) {
        if (!game.user.isGM) return;
        const message = game.messages.get(messageId);
        const state = SessionStore.getSession(message);
        const adapter = AdapterRegistry.active;
        if (!this.#canAutoResolve(state, adapter)) return;
        await this.resolveSession(messageId);
    }

    static #canAutoResolve(state, adapter) {
        if (!game.settings?.get(MODULE_ID, "autoResolveCompletedRolls")) return false;
        if (!state || state.isResolved || state.isPreparingModifiers) return false;
        if (state.hasPendingConsequences || state.pushFailurePending) return false;

        const participants = state.participants ?? [];
        if (!participants.length || !participants.every((participant) => participant.hasRolled === true)) return false;
        return !participants.some((participant) =>
            Boolean(adapter?.evaluateParticipantOptions?.(participant, state, false)?.hasPendingAction)
        );
    }

    static registerHooks() {
        SessionHooks.register(this.#mutator, (messageId) => this.#resolveWhenReady(messageId));
    }

    // Session creation delegates payload construction to the active system adapter.
    static startSystemRoll = (type, cfg) => SessionStore.create(AdapterRegistry.active.buildSessionPayload(type, cfg));

    // Session mutations
    /** Submits a participant roll and resolves the session when all automatic-resolution conditions pass. */
    static submitParticipantRoll = (id, key, data) => this.#mutateAndMaybeResolve(id, "submitRoll", key, data);
    /** Executes a post-roll choice and resolves the session when no decisions or consequences remain. */
    static executePostRollAction = (id, key, actionId, payload) => this.#mutateAndMaybeResolve(id, "executePostRollAction", key, actionId, payload);
    static setParticipantModifier = (id, key, mod) => this.#mutate(id, "setModifier", key, mod);
    static updateSessionPatch = (id, patch) => this.#mutate(id, "updateSessionPatch", patch);
    static publishPreparedRoll = (id) => this.#mutate(id, "publishPreparedRoll");
    /** Applies pending consequences and resolves the session when no further actions remain. */
    static applySessionConsequences = (id) => this.#mutateAndMaybeResolve(id, "applyConsequences");
    /** Submits a GM-only adapter consequence decision and checks automatic resolution. */
    static submitConsequenceDecision = (id, decision) => this.#mutateAndMaybeResolve(id, "applyConsequences", decision);
    static resolveSession = (id) => this.#mutate(id, "resolve");
}