import { SessionStore } from "./session-store.mjs";
import { SessionMutator } from "./session-mutator.mjs";
import { SessionHooks } from "./session-hooks.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";

export class UniversalRollOrchestrator {
    static #mutator = new SessionMutator();

    static #mutate(messageId, method, ...args) {
        return this.#mutator.runSerialized(messageId, () => this.#mutator[method](messageId, ...args));
    }

    static registerHooks() {
        SessionHooks.register(this.#mutator);
    }

    // Session creation delegates payload construction to the active system adapter.
    static startSystemRoll = (type, cfg) => SessionStore.create(AdapterRegistry.active.buildSessionPayload(type, cfg));

    // Session mutations
    static submitParticipantRoll = (id, key, data) => this.#mutate(id, "submitRoll", key, data);
    static executePostRollAction = (id, key, actionId, payload) => this.#mutate(id, "executePostRollAction", key, actionId, payload);
    static setParticipantModifier = (id, key, mod) => this.#mutate(id, "setModifier", key, mod);
    static updateSessionPatch = (id, patch) => this.#mutate(id, "updateSessionPatch", patch);
    static publishPreparedRoll = (id) => this.#mutate(id, "publishPreparedRoll");
    static applySessionConsequences = (id) => this.#mutate(id, "applyConsequences");
    static resolveSession = (id) => this.#mutate(id, "resolve");
}