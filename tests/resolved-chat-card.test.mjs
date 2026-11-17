import assert from "assert";
import { AdapterRegistry } from "../module/core/adapter-registry.mjs";
import { SessionCardRenderer } from "../module/core/card-renderer.mjs";

globalThis.Actor = class Actor {};
globalThis.game = {
    system: { id: "test" },
    user: { id: "gm", isGM: true },
    actors: new Map(),
    i18n: { localize: (key) => key }
};

const renders = [];
globalThis.foundry = {
    applications: {
        handlebars: {
            renderTemplate: (path, context) => new Promise((resolve, reject) => {
                renders.push({ path, context, resolve, reject });
            })
        }
    }
};

const adapter = {
    initialize() {},
    prepareResolvedChatContext: (session) => ({ resolvedTitle: session.title }),
    getResolvedResultPartials: () => ({ header: "header", body: "body" })
};
AdapterRegistry.register("test", adapter);
AdapterRegistry.activate("test");

const participant = {
    key: "p0", hasRolled: true, rollMode: "blindroll", rollerUserId: "roller",
    rollBreakdown: { total: 25 }
};
const session = { isResolved: true, title: "Test", participants: [participant] };
const message = { getFlag: () => session };
const inspected = {
    dataset: { inspectKey: "p0" },
    classList: { add(value) { this.added = value; } },
    addEventListener(_type, listener) { this.listener = listener; },
    parentElement: {}
};
const card = {
    dataset: {},
    textContent: "",
    innerHTML: "",
    querySelectorAll: () => [inspected]
};
const html = { matches: () => true };
Object.assign(html, card);

SessionCardRenderer.applyClientFormatting(message, html);
assert.equal(html.textContent, "ROE.RollSession.LoadingResult");
assert.equal(renders[0].context.resolvedTitle, "Test");
assert.equal(renders[0].context.resolvedResultHeaderPartial, "header");
assert.equal(renders[0].context.resolvedResultBodyPartial, "body");
assert.ok(renders[0].path.endsWith("templates/chat/resolved-session-result.hbs"));
renders[0].resolve("<div>result</div>");
await new Promise(setImmediate);
assert.equal(html.innerHTML, "<div>result</div>");
assert.equal(inspected.classList.added, "is-inspectable");
assert.equal(inspected.title, "ROE.Roll.ClickToInspect");

let inspectedParticipant;
SessionCardRenderer.toggleBreakdownForElement = (container, entry) => {
    assert.equal(container, inspected.parentElement);
    inspectedParticipant = entry;
};
inspected.listener({ preventDefault() {}, stopPropagation() {} });
assert.equal(inspectedParticipant, participant);

game.user = { id: "other", isGM: false };
inspected.classList.added = undefined;
inspected.listener = undefined;
SessionCardRenderer.applyClientFormatting(message, html);
renders[1].resolve("<div>hidden</div>");
await new Promise(setImmediate);
assert.equal(inspected.listener, undefined);
assert.equal(inspected.classList.added, undefined);

game.user.isGM = true;
SessionCardRenderer.applyClientFormatting(message, html);
SessionCardRenderer.applyClientFormatting(message, html);
renders[3].resolve("new result");
await new Promise(setImmediate);
renders[2].resolve("stale result");
await new Promise(setImmediate);
assert.equal(html.innerHTML, "new result");

const originalError = console.error;
let loggedError;
console.error = (_message, error) => { loggedError = error; };
try {
    SessionCardRenderer.applyClientFormatting(message, html);
    renders[4].reject(new Error("Template failed"));
    await new Promise(setImmediate);
    assert.equal(html.textContent, "ROE.RollSession.ResultRenderError");
    assert.equal(loggedError.message, "Template failed");
} finally {
    console.error = originalError;
}

const originalAdapter = { initialize() {} };
AdapterRegistry.register("original", originalAdapter);
AdapterRegistry.activate("original");
const originalBadge = { textContent: "", className: "" };
const originalCard = { dataset: {} };
const originalHtml = {
    matches: () => false,
    querySelector(selector) {
        if (selector === ".roe-chat-card") return originalCard;
        if (selector.includes(".roll-badge")) return originalBadge;
        return null;
    }
};
participant.total = 25;
participant.rollBreakdown = null;
SessionCardRenderer.applyClientFormatting(message, originalHtml);
assert.equal(originalBadge.textContent, "25");
assert.equal(renders.length, 5);
console.log("Resolved chat card rendering checks passed.");
