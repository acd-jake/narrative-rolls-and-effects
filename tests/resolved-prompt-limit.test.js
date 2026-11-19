import assert from "assert";
import { describe, it } from "vitest";
import { MODULE_ID } from "../module/core/constants.mjs";
import { SessionHooks } from "../module/core/session-hooks.mjs";
import { RollPromptStackManager } from "../module/core/stack-manager.mjs";

describe("SessionHooks maxOpenResolvedPrompts", () => {
    it("starts close timers on oldest resolved prompts when limit is exceeded and pins on click", () => {
        let maxOpen = 2;
        let duration = 10;
        const hooks = new Map();
        const messages = new Map();

        globalThis.Hooks = {
            on: (name, fn) => {
                if (!hooks.has(name)) hooks.set(name, []);
                hooks.get(name).push(fn);
            },
            once: () => {},
            off: () => {},
            callAll: (name, ...args) => {
                for (const fn of hooks.get(name) ?? []) fn(...args);
            }
        };

        globalThis.game = {
            user: { id: "gm", isGM: true },
            messages: { get: (id) => messages.get(id) ?? null },
            settings: {
                get: (mod, key) => {
                    if (mod !== MODULE_ID) return undefined;
                    if (key === "maxOpenResolvedPrompts") return maxOpen;
                    if (key === "rollPromptResultDuration") return duration;
                    return undefined;
                }
            }
        };

        const createPromptMock = (messageId) => ({
            messageId,
            element: { getBoundingClientRect: () => ({ width: 260, height: 180 }) },
            setPosition: () => {},
            close: async function () {
                RollPromptStackManager.untrack(this);
                SessionHooks.notifyPromptClosed(messageId);
            }
        });

        SessionHooks.register({ runSerialized: async (_id, fn) => fn() });

        const resolveMessage = (id) => {
            const msg = {
                id,
                getFlag: () => ({ isResolved: true, hasPlayerParticipants: true, participants: [] })
            };
            messages.set(id, msg);
            RollPromptStackManager.track(createPromptMock(id));
            for (const fn of hooks.get("updateChatMessage") ?? []) fn(msg);
        };

        resolveMessage("m1");
        resolveMessage("m2");
        assert.equal(SessionHooks.getResolvedDeadline("m1"), null);
        assert.equal(SessionHooks.getResolvedDeadline("m2"), null);

        resolveMessage("m3");
        assert.notEqual(SessionHooks.getResolvedDeadline("m1"), null);
        assert.equal(SessionHooks.getResolvedDeadline("m2"), null);
        assert.equal(SessionHooks.getResolvedDeadline("m3"), null);

        SessionHooks.pinResolvedPrompt("m2");
        assert.equal(SessionHooks.getResolvedDeadline("m2"), null);

        resolveMessage("m4");
        assert.equal(SessionHooks.getResolvedDeadline("m3"), null);
        assert.equal(SessionHooks.getResolvedDeadline("m4"), null);

        for (const id of ["m1", "m2", "m3", "m4"]) SessionHooks.notifyPromptClosed(id);
    });
});
