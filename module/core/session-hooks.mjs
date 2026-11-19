import { MODULE_ID, SOCKET_NAME } from "./constants.mjs";
import { SessionStore } from "./session-store.mjs";
import { SessionTransport } from "./session-transport.mjs";
import { RollPromptStackManager } from "./stack-manager.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";
import { SessionCardRenderer } from "./card-renderer.mjs";

/** Connects session mutations and lifecycle hooks to Foundry events and sockets. */
export class SessionHooks {
    static #resolvedTimers = new Map();
    static #resolvedDeadlines = new Map();
    static #resolvedQueue = [];
    static #resolvedSessions = new Set();

    /** Registers core hooks and an optional callback for completed GM-side mutations. */
    static register(mutator, afterMutation = null) {
        SessionCardRenderer.registerHooks();

        const mutate = (payload, method, ...args) =>
            this.#runMutation(mutator, afterMutation, payload, method, args);

        SessionTransport.registerGMListener({
            submitUniversalRoll: (p) => mutate(p, "submitRoll", p.participantKey, p.rollData),
            executePostRollAction: (p) => mutate(p, "executePostRollAction", p.participantKey, p.actionId, p.payload),
            setParticipantModifier: (p) => mutate(p, "setModifier", p.participantKey, p.modifierDice),
            updateSessionPatch: (p) => mutate(p, "updateSessionPatch", p.patch)
        });

        Hooks.on("createChatMessage", (msg) => {
            if (SessionStore.isSessionMessage(msg)) {
                this.#openPromptIfParticipant(msg);
            }
        });

        Hooks.on("updateChatMessage", (msg) => {
            const session = SessionStore.getSession(msg);
            if (!session) return;
            if (!game.user.isGM && session.isPreparingModifiers) return;

            if (session.isResolved) {
                this.#showResolvedPrompt(msg, session);
            } else {
                this.#forgetResolvedPrompt(msg.id);
                Hooks.callAll("roeRollSessionUpdated", msg, session);
                if (!RollPromptStackManager.hasByMessageId(msg.id)) {
                    this.#openPromptIfParticipant(msg);
                }
            }
        });

        Hooks.on("deleteChatMessage", (msg) => {
            if (!SessionStore.isSessionMessage(msg)) return;
            this.#closeResolvedPrompt(msg.id);
            this.#resolvedSessions.delete(msg.id);
        });

        Hooks.on("getChatMessageContextOptions", (_app, options) => {
            const getMessage = (li) => game.messages.get(li?.dataset?.messageId ?? li?.data?.("messageId"));
            options.push({
                name: "ROE.Chat.ReopenPrompt",
                icon: '<i class="fa-solid fa-dice-d20"></i>',
                condition: (li) => {
                    const session = SessionStore.getSession(getMessage(li));
                    return game.user.isGM && session && !session.isResolved;
                },
                callback: (li) => {
                    const msg = getMessage(li);
                    if (!msg) return;
                    game.socket.emit(SOCKET_NAME, { action: "reopenRollPrompt", messageId: msg.id });
                    this.#openPromptIfParticipant(msg, true);
                }
            });
        });

        Hooks.once("ready", () => {
            game.socket.on(SOCKET_NAME, (payload) => {
                if (payload?.action !== "reopenRollPrompt") return;
                const msg = game.messages.get(payload.messageId);
                if (SessionStore.isSessionMessage(msg)) this.#openPromptIfParticipant(msg);
            });
        });
    }
    /** Returns the active auto-close deadline timestamp for a resolved prompt, or null if untimed. */
    static getResolvedDeadline(messageId) {
        return this.#resolvedDeadlines.get(messageId) ?? null;
    }

    /** Pins a resolved prompt when clicked by the user, removing it from the auto-close queue. */
    static pinResolvedPrompt(messageId) {
        if (!messageId) return;
        this.#removeFromQueue(messageId);
        this.cancelResolvedTimer(messageId);
        this.syncResolvedTimers();
    }

    /** Removes a closed prompt from the auto-close queue and updates remaining timers. */
    static notifyPromptClosed(messageId) {
        if (!messageId) return;
        this.#removeFromQueue(messageId);
        this.cancelResolvedTimer(messageId);
        this.syncResolvedTimers();
    }

    /** Stops the scheduled auto-close timer for a resolved prompt without closing it. */
    static cancelResolvedTimer(messageId) {
        clearTimeout(this.#resolvedTimers.get(messageId));
        this.#resolvedTimers.delete(messageId);
        this.#resolvedDeadlines.delete(messageId);
    }

    /** Starts auto-close timers for the oldest resolved prompts exceeding the configured open limit. */
    static syncResolvedTimers() {
        const duration = this.#getResultDurationSeconds();
        if (duration <= 0) return;

        const maxOpen = Math.max(0, Math.round(Number(game.settings?.get(MODULE_ID, "maxOpenResolvedPrompts")) || 0));
        this.#resolvedQueue = this.#resolvedQueue.filter((id) => RollPromptStackManager.hasByMessageId(id));

        const excessCount = Math.max(0, this.#resolvedQueue.length - maxOpen);
        const delay = Math.min(duration * 1000, 2147483647);

        for (let i = 0; i < excessCount; i++) {
            const messageId = this.#resolvedQueue[i];
            if (this.#resolvedTimers.has(messageId)) continue;

            const deadline = Date.now() + delay;
            this.#resolvedDeadlines.set(messageId, deadline);
            this.#resolvedTimers.set(messageId, setTimeout(() => this.#closeResolvedPrompt(messageId), delay));
            Hooks.callAll("roeResolvedTimerStarted", messageId, deadline);
        }
    }

    static #getResultDurationSeconds() {
        const configured = Number(game.settings?.get(MODULE_ID, "rollPromptResultDuration"));
        return Number.isFinite(configured) ? Math.max(0, Math.round(configured)) : 10;
    }

    static #removeFromQueue(messageId) {
        const index = this.#resolvedQueue.indexOf(messageId);
        if (index !== -1) this.#resolvedQueue.splice(index, 1);
    }

    static async #runMutation(mutator, afterMutation, payload, method, args) {
        const result = await mutator.runSerialized(
            payload.messageId,
            () => mutator[method](payload.messageId, ...args)
        );
        if (afterMutation && ["submitRoll", "executePostRollAction"].includes(method)) {
            await afterMutation(payload.messageId);
        }
        return result;
    }

    static #showResolvedPrompt(message, session) {
        if (this.#resolvedSessions.has(message.id)) {
            if (this.#resolvedTimers.has(message.id)) Hooks.callAll("roeRollSessionUpdated", message, session);
            return;
        }
        this.#resolvedSessions.add(message.id);

        if (!game.user.isGM && !session.hasPlayerParticipants) {
            this.#closeResolvedPrompt(message.id);
            return;
        }

        const duration = this.#getResultDurationSeconds();
        if (duration === 0) {
            this.#closeResolvedPrompt(message.id);
            return;
        }

        Hooks.callAll("roeRollSessionUpdated", message, session);
        if (!RollPromptStackManager.hasByMessageId(message.id)) {
            this.#openPromptIfParticipant(message, true);
        }
        if (!this.#resolvedQueue.includes(message.id)) {
            this.#resolvedQueue.push(message.id);
        }
        this.syncResolvedTimers();
    }

    static #closeResolvedPrompt(messageId) {
        this.#removeFromQueue(messageId);
        this.cancelResolvedTimer(messageId);
        RollPromptStackManager.closeByMessageId(messageId);
        this.syncResolvedTimers();
    }

    static #forgetResolvedPrompt(messageId) {
        if (!this.#resolvedSessions.delete(messageId)) return;
        this.#removeFromQueue(messageId);
        this.cancelResolvedTimer(messageId);
        this.syncResolvedTimers();
    }

    static #openPromptIfParticipant(message, force = false) {
        const session = SessionStore.getSession(message);
        const adapter = AdapterRegistry.active;
        if (!session || !adapter) return;
        if (session.isResolved && !force) return;
        if (session.isPreparingModifiers && !game.user.isGM) return;

        const isInitiator = game.user.id === session.initiatorUserId;
        const ownedParticipants = (session.participants ?? []).filter((p) => {
            const actor = SessionStore.resolveActor(p);
            return Boolean(actor?.isOwner);
        });

        if (!force && !isInitiator && ownedParticipants.length === 0) return;
        adapter.getStrategy(session.rollType).renderPrompt({ messageId: message.id, ownedParticipants });
    }
}
