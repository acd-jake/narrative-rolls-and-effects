import assert from "assert";
import { describe, it } from "vitest";
import { RollPromptStackManager } from "../module/core/stack-manager.mjs";

describe("RollPromptStackManager sequence numbering", () => {
    it("assigns chronological numbers, shows them when needed, and resets to 1 when empty", () => {
        const createMockPrompt = (id) => {
            let badgeText = "";
            return {
                messageId: id,
                syncSequenceNumberBadge() {
                    const num = RollPromptStackManager.getDisplaySequenceNumber(this);
                    badgeText = num ? ` (${num})` : "";
                },
                get badge() {
                    return badgeText;
                }
            };
        };

        const p1 = createMockPrompt("m1");
        RollPromptStackManager.track(p1);
        assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p1), null);
        assert.equal(p1.badge, "");

        const p2 = createMockPrompt("m2");
        RollPromptStackManager.track(p2);
        assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p1), 1);
        assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p2), 2);
        assert.equal(p1.badge, " (1)");
        assert.equal(p2.badge, " (2)");

        RollPromptStackManager.untrack(p1);
        assert.equal(RollPromptStackManager.getDisplaySequenceNumber(p2), 2);
        assert.equal(p2.badge, " (2)");

        const p3 = createMockPrompt("m3");
        RollPromptStackManager.track(p3);
        assert.equal(p2.badge, " (2)");
        assert.equal(p3.badge, " (3)");

        RollPromptStackManager.untrack(p3);
        RollPromptStackManager.untrack(p2);

        const pFresh = createMockPrompt("m4");
        RollPromptStackManager.track(pFresh);
        assert.equal(RollPromptStackManager.getDisplaySequenceNumber(pFresh), null);
        assert.equal(pFresh.badge, "");

        RollPromptStackManager.untrack(pFresh);
    });
});
