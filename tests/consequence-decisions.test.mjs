import assert from "assert";
import { AdapterRegistry } from "../module/core/adapter-registry.mjs";
import { SessionMutator } from "../module/core/session-mutator.mjs";
import { UniversalRollOrchestrator } from "../module/core/orchestrator.mjs";

let state = {
    rollType: "combat", isResolved: false, consequencesApplied: false,
    hasPendingConsequences: true, hasPlayerParticipants: true, participants: []
};
let saved = 0;
const message = {
    getFlag: () => state,
    async update(changes) {
        state = changes["flags.narrative-rolls-and-effects.session"];
        saved++;
    }
};
globalThis.game = {
    user: { isGM: true }, users: [], actors: new Map(),
    messages: new Map([["message", message]]),
    settings: { get: () => false }
};
globalThis.foundry = { applications: { handlebars: { renderTemplate: async () => "" } } };
const adapter = {
    initialize() {},
    enrichSessionForTemplate: (session) => session,
    handleConsequenceDecision: async (session, decision) => ({ ...session, handled: decision.action })
};
AdapterRegistry.register("test", adapter);
AdapterRegistry.activate("test");
const mutator = new SessionMutator();
await mutator.applyConsequences("message", { action: "decline" });
assert.equal(saved, 1);
assert.equal(state.handled, "decline");
assert.equal(state.consequencesApplied, false);
await UniversalRollOrchestrator.submitConsequenceDecision("message", { action: "apply" });
assert.equal(saved, 2);
assert.equal(state.handled, "apply");

game.user.isGM = false;
await UniversalRollOrchestrator.submitConsequenceDecision("message", { action: "decline" });
assert.equal(saved, 2);
assert.equal(state.handled, "apply");

game.user.isGM = true;
adapter.canApplySessionConsequences = () => false;
adapter.getStrategy = () => { throw new Error("Generic application must be blocked."); };
await mutator.applyConsequences("message");
assert.equal(saved, 2);
adapter.handleConsequenceDecision = async () => null;
await assert.rejects(mutator.applyConsequences("message", { action: "apply" }), /invalid consequence decision session/);
assert.equal(saved, 2);
delete adapter.handleConsequenceDecision;
await assert.rejects(mutator.applyConsequences("message", { action: "apply" }), /does not support consequence decisions/);
console.log("GM-only consequence decision checks passed.");
