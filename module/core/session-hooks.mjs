import { MODULE_ID, SOCKET_NAME } from "./constants.mjs";
import { SessionStore } from "./session-store.mjs";
import { SessionTransport } from "./session-transport.mjs";
import { RollPromptStackManager } from "./stack-manager.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";
import { SessionCardRenderer } from "./card-renderer.mjs";

export class SessionHooks {
    static #resolvedTimers = new Map();
    static #resolvedSessions = new Set();

    static register(mutator) {
        SessionCardRenderer.registerHooks();

        const mutate = (payload, method, ...args) =>
            mutator.runSerialized(payload.messageId, () => mutator[method](payload.messageId, ...args));

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

        Hooks.on("updateChatMessage", (msg, changes = {}) => {
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

        const configuredDuration = Number(game.settings.get(MODULE_ID, "rollPromptResultDuration"));
        const duration = Number.isFinite(configuredDuration) ? Math.max(0, configuredDuration) : 10;
        if (duration === 0) {
            this.#closeResolvedPrompt(message.id);
            return;
        }

        Hooks.callAll("roeRollSessionUpdated", message, session);
        if (!RollPromptStackManager.hasByMessageId(message.id)) {
            this.#openPromptIfParticipant(message, true);
        }
        const delay = Math.min(duration * 1000, 2147483647);
        this.#resolvedTimers.set(message.id, setTimeout(() => this.#closeResolvedPrompt(message.id), delay));
    }

    static #closeResolvedPrompt(messageId) {
        clearTimeout(this.#resolvedTimers.get(messageId));
        this.#resolvedTimers.delete(messageId);
        RollPromptStackManager.closeByMessageId(messageId);
    }

    static #forgetResolvedPrompt(messageId) {
        if (!this.#resolvedSessions.delete(messageId)) return;
        clearTimeout(this.#resolvedTimers.get(messageId));
        this.#resolvedTimers.delete(messageId);
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
