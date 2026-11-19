import assert from "assert";
import { RollPromptStackManager } from "../module/core/stack-manager.mjs";

const createMockPrompt = (id) => {
    let badgeText = "";
    const app = {
        messageId: id,
        syncSequenceNumberBadge() {
            const num = RollPromptStackManager.getDisplaySequenceNumber(this);
            badgeText = num ? ` (${num})` : "";
        },
        get badge() {
            return badgeText;
        }
    };
    return app;
};

// 1. Single open prompt gets #1, hidden while it is the only prompt with #1
const p1 = createMockPrompt("m1");
RollPromptStackManager.track(p1);
assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p1), null);
assert.equal(p1.badge, "");

// 2. Opening a second prompt assigns #2 and reveals (1) on the first and (2) on the second
const p2 = createMockPrompt("m2");
RollPromptStackManager.track(p2);
assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p1), 1);
assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p2), 2);
assert.equal(p1.badge, " (1)");
assert.equal(p2.badge, " (2)");

// 3. Closing prompt #1 leaves prompt #2 open; #2 keeps its number and still displays (2) because number > 1
RollPromptStackManager.untrack(p1);
assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p2), 2);
assert.equal(p2.badge, " (2)");

// 4. Opening a third prompt while #2 is open assigns #3 (highest open + 1)
const p3 = createMockPrompt("m3");
RollPromptStackManager.track(p3);
assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p2), 2);
assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p3), 3);
assert.equal(p2.badge, " (2)");
assert.equal(p3.badge, " (3)");

// 5. Closing #3 leaves only #2 open; #2 still displays (2)
RollPromptStackManager.untrack(p3);
assert.equal(p2.badge, " (2)");

// 6. Closing #2 leaves no prompts open; the next prompt starts back at #1 (hidden until a second opens)
RollPromptStackManager.untrack(p2);
const pFresh = createMockPrompt("m4");
RollPromptStackManager.track(pFresh);
assert.equal(RollPromptStackManager.getDisplaySequenceNumber(pFresh), null);
assert.equal(pFresh.badge, "");

// Clean up
RollPromptStackManager.untrack(pFresh);
console.log("Prompt sequence numbering checks passed.");
