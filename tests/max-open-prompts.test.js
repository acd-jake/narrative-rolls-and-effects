import assert from "assert";
import { MODULE_ID } from "../module/core/constants.mjs";
import { RollPromptStackManager } from "../module/core/stack-manager.mjs";

let maxSimultaneous = 2;

globalThis.game = {
    settings: {
        get: (mod, key) => (mod === MODULE_ID && key === "maxOpenPrompts" ? maxSimultaneous : undefined)
    }
};

const createPrompt = (id) => {
    let closed = false;
    return {
        messageId: id,
        get isClosed() { return closed; },
        syncSequenceNumberBadge() {},
        close() {
            closed = true;
            RollPromptStackManager.untrack(this);
        }
    };
};

// 1. Opening up to maxOpenPrompts (2) keeps both unresolved prompts open
const p1 = createPrompt("m1");
const p2 = createPrompt("m2");
RollPromptStackManager.track(p1);
RollPromptStackManager.track(p2);
assert.equal(p1.isClosed, false);
assert.equal(p2.isClosed, false);

// 2. Opening a 3rd prompt automatically closes the oldest one (p1), even though unresolved
const p3 = createPrompt("m3");
RollPromptStackManager.track(p3);
assert.equal(p1.isClosed, true);
assert.equal(p2.isClosed, false);
assert.equal(p3.isClosed, false);
assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p2), 2);
assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p3), 3);

// 3. Reducing the setting at runtime immediately closes excess oldest prompts
maxSimultaneous = 1;
RollPromptStackManager.enforceMaxOpenLimit();
assert.equal(p2.isClosed, true);
assert.equal(p3.isClosed, false);

// 4. Setting maxOpenPrompts to 0 allows unlimited open prompts
maxSimultaneous = 0;
const p4 = createPrompt("m4");
RollPromptStackManager.track(p4);
assert.equal(p3.isClosed, false);
assert.equal(p4.isClosed, false);

// Clean up
RollPromptStackManager.untrack(p3);
RollPromptStackManager.untrack(p4);
console.log("Maximum simultaneous open prompts checks passed.");
