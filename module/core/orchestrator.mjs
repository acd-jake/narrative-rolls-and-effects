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

    // Session-Erstellung (delegiert Payload-Bau an aktiven SystemAdapter)
    static startBasicOrOtherRoll = (cfg) => SessionStore.create(AdapterRegistry.active.buildSessionPayload("basic", cfg));
    static startSkillCheck = (cfg) => SessionStore.create(AdapterRegistry.active.buildSessionPayload("skill", cfg));
    static startCombinedRoll = (cfg) => SessionStore.create(AdapterRegistry.active.buildSessionPayload("combined", cfg));
    static startOpposedRoll = (cfg) => SessionStore.create(AdapterRegistry.active.buildSessionPayload("opposed", cfg));
    static startSanityCheck = (cfg) => SessionStore.create(AdapterRegistry.active.buildSessionPayload("sanity", cfg));
    static startCombatRoll = (cfg) => SessionStore.create(AdapterRegistry.active.buildSessionPayload("combat", cfg));
    static startRangedRoll = (cfg) => SessionStore.create(AdapterRegistry.active.buildSessionPayload("ranged", cfg));

    // Mutationen
    static submitParticipantRoll = (id, key, data) => this.#mutate(id, "submitRoll", key, data);
    static executePostRollAction = (id, key, actionId, payload) => this.#mutate(id, "executePostRollAction", key, actionId, payload);
    static setParticipantModifier = (id, key, mod) => this.#mutate(id, "setModifier", key, mod);
    static setSessionDifficulty = (id, diff) => this.#mutate(id, "setDifficulty", diff);
    static updateSessionPatch = (id, patch) => this.#mutate(id, "updateSessionPatch", patch);
    static publishPreparedRoll = (id) => this.#mutate(id, "publishPreparedRoll");
    static applySessionConsequences = (id) => this.#mutate(id, "applyConsequences");
    static resolveSession = (id) => this.#mutate(id, "resolve");
}