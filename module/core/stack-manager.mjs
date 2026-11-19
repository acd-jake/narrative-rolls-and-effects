import { MODULE_ID } from "./constants.mjs";

/**
 * Manages docking, dynamic viewport-based sizing, vertical stacking,
 * and lifecycle cleanup of active RollPromptApp instances.
 */
export class RollPromptStackManager {
    /** @type {Set<ApplicationV2>} */
    static #dockedApps = new Set();

    /** @type {Set<ApplicationV2>} */
    static #allActiveApps = new Set();

    /** @type {WeakMap<ApplicationV2, number>} */
    static #sequenceNumbers = new WeakMap();

    static MARGIN = 16;
    static STACK_GAP = 10;
    static MIN_WIDTH = 200;

    /**
     * Registers a prompt in the dock stack and tracks it globally for lifecycle cleanup.
     * @param {ApplicationV2} app
     */
    static register(app) {
        this.track(app);
        this.#dockedApps.add(app);
        requestAnimationFrame(() => this.reflow());
    }

    /**
     * Tracks an app for lifecycle cleanup and enforces the client's open prompt limit.
     * @param {ApplicationV2} app
     */
    static track(app) {
        const isNew = !this.#allActiveApps.has(app);
        if (isNew && !this.#sequenceNumbers.has(app)) {
            let highestOpen = 0;
            for (const activeApp of this.#allActiveApps) {
                highestOpen = Math.max(highestOpen, this.#sequenceNumbers.get(activeApp) ?? 0);
            }
            this.#sequenceNumbers.set(app, highestOpen + 1);
        }
        this.#allActiveApps.add(app);
        if (isNew) {
            this.enforceMaxOpenLimit();
            this.refreshSequenceBadges();
        }
    }

    /**
     * Closes the oldest open prompts when the client's maximum simultaneous prompt count is exceeded.
     */
    static enforceMaxOpenLimit() {
        const maxOpen = Math.max(0, Math.round(Number(globalThis.game?.settings?.get(MODULE_ID, "maxOpenPrompts")) || 0));
        if (maxOpen <= 0) return;

        const active = Array.from(this.#allActiveApps);
        const excessCount = active.length - maxOpen;
        if (excessCount <= 0) return;

        for (let i = 0; i < excessCount; i++) {
            const oldestApp = active[i];
            this.untrack(oldestApp);
            oldestApp.close?.();
        }
    }

    /**
     * Removes an app from the dock stack (e.g., when manually dragged)
     * without removing it from global lifecycle tracking until closed.
     * @param {ApplicationV2} app
     */
    static unregister(app) {
        if (this.#dockedApps.delete(app)) {
            requestAnimationFrame(() => this.reflow());
        }
    }

    /**
     * Completely removes a closed app from both tracking sets.
     * @param {ApplicationV2} app
     */
    static untrack(app) {
        this.#allActiveApps.delete(app);
        this.unregister(app);
        this.refreshSequenceBadges();
    }

    /**
     * Returns the visible sequence number for a prompt, or null when it should be hidden.
     * @param {ApplicationV2} app
     * @returns {number|null}
     */
    static getDisplaySequenceNumber(app) {
        const number = this.#sequenceNumbers.get(app) ?? null;
        if (!number) return null;
        if (this.#allActiveApps.size > 1 || number > 1) return number;
        return null;
    }

    /** Updates the sequence badge visibility across all open prompt windows. */
    static refreshSequenceBadges() {
        for (const app of this.#allActiveApps) {
            app.syncSequenceNumberBadge?.();
        }
    }

    static hasByMessageId(messageId) {
        return Array.from(this.#allActiveApps).some((app) => app.messageId === messageId);
    }

    /**
     * Closes all open prompt windows linked to a deleted session message.
     * @param {string} messageId
     */
    static closeByMessageId(messageId) {
        if (!messageId) return;

        for (const app of Array.from(this.#allActiveApps)) {
            if (app.messageId === messageId) {
                app.close();
            }
        }
    }
    /**
     * Positions and sizes all currently docked prompts from bottom to top,
     * keeping the newest prompt at the very bottom.
     */
    /**
     * Positions and sizes all currently docked prompts according to the configured
     * stack direction, keeping the newest prompt at the anchor corner.
     */
    static reflow() {
        const apps = Array.from(this.#dockedApps).filter((app) => app.element);
        if (apps.length === 0) return;

        const width = this.#computeTargetWidth();
        const anchor = this.#computeAnchorCoordinates(width);
        const direction = game.settings?.get(MODULE_ID, "rollPromptStackDirection") ?? "vertical";

        if (direction === "horizontal") {
            this.#reflowHorizontal(apps, width, anchor);
            return;
        }
        this.#reflowVertical(apps, width, anchor);
    }

    static #reflowVertical(apps, width, { positionMode, left, rightEdge, bottomStart }) {
        const topMargin = 12;
        const goesRight = positionMode === "players-top";
        let currentBottom = bottomStart;
        let currentLeft = left;
        let columnMaxWidth = width;
        let itemsInColumn = 0;

        for (let i = apps.length - 1; i >= 0; i--) {
            const app = apps[i];
            app.setPosition({ width });

            const rect = app.element.getBoundingClientRect();
            const actualWidth = Math.max(width, Math.round(rect.width || width));
            const height = rect.height || 180;

            if (!goesRight && itemsInColumn === 0 && i < apps.length - 1) {
                currentLeft = Math.max(this.MARGIN, currentLeft - (actualWidth - width));
            }

            if (itemsInColumn > 0 && currentBottom - height < topMargin) {
                currentBottom = bottomStart;
                currentLeft = goesRight
                    ? Math.min(Math.max(this.MARGIN, rightEdge - actualWidth), currentLeft + columnMaxWidth + this.STACK_GAP)
                    : Math.max(this.MARGIN, currentLeft - actualWidth - this.STACK_GAP);
                columnMaxWidth = actualWidth;
                itemsInColumn = 0;
            }

            const top = Math.max(topMargin, Math.round(currentBottom - height));
            const clampedLeft = Math.max(this.MARGIN, Math.round(currentLeft));
            app.setPosition({ left: clampedLeft, top, width });

            columnMaxWidth = Math.max(columnMaxWidth, actualWidth);
            currentBottom = top - this.STACK_GAP;
            itemsInColumn += 1;
        }
    }

    static #reflowHorizontal(apps, width, { positionMode, left, rightEdge, bottomStart }) {
        const goesRight = positionMode === "players-top";
        const minX = this.MARGIN;
        const maxX = rightEdge;
        let currentX = goesRight ? left : rightEdge - width;
        let currentBottom = bottomStart;
        let rowMaxHeight = 0;

        for (let i = apps.length - 1; i >= 0; i--) {
            const app = apps[i];
            app.setPosition({ width });

            const rect = app.element.getBoundingClientRect();
            const actualWidth = Math.max(width, Math.round(rect.width || width));
            const height = rect.height || 180;

            if (!goesRight && i === apps.length - 1) {
                currentX = rightEdge - actualWidth;
            }

            const overflowsRow = goesRight
                ? currentX + actualWidth > maxX && currentX > minX
                : currentX < minX && currentX + actualWidth < maxX;

            if (overflowsRow) {
                currentBottom = Math.max(12, Math.round(currentBottom - rowMaxHeight - this.STACK_GAP));
                rowMaxHeight = 0;
                currentX = goesRight ? left : rightEdge - actualWidth;
            }

            const clampedLeft = Math.max(minX, Math.round(currentX));
            const top = Math.max(12, Math.round(currentBottom - height));
            app.setPosition({ left: clampedLeft, top, width });

            rowMaxHeight = Math.max(rowMaxHeight, height);
            currentX = goesRight
                ? clampedLeft + actualWidth + this.STACK_GAP
                : clampedLeft - actualWidth - this.STACK_GAP;
        }
    }

    /**
     * Calculates pixel width based on the configured viewport percentage.
     * @returns {number}
     */
    static #computeTargetWidth() {
        const percent = game.settings?.get(MODULE_ID, "rollPromptWidthPercent") ?? 15;
        const rawWidth = Math.round((window.innerWidth * percent) / 100);
        return Math.max(this.MIN_WIDTH, rawWidth);
    }

    /**
     * Determines horizontal `left` and vertical `bottomStart` coordinates
     * based on the chosen dock position setting.
     * @param {number} width
     * @returns {{ left: number, bottomStart: number }}
     */
    static #computeAnchorCoordinates(width) {
        const positionMode = game.settings?.get(MODULE_ID, "rollPromptPosition") ?? "sidebar-left";

        if (positionMode === "players-top") {
            const playersEl = document.getElementById("players");
            const rect = playersEl?.getBoundingClientRect();
            const left = Math.max(12, rect ? Math.round(rect.left) : this.MARGIN);
            const bottomStart = rect ? Math.round(rect.top - this.STACK_GAP) : window.innerHeight - 60;
            const sidebar = document.getElementById("sidebar");
            const rightEdge = Math.round((sidebar ? sidebar.getBoundingClientRect().left : window.innerWidth) - this.MARGIN);
            return { positionMode, left, rightEdge, bottomStart };
        }

        // Default: "sidebar-left"
        const sidebar = document.getElementById("sidebar");
        const sidebarLeft = sidebar ? sidebar.getBoundingClientRect().left : window.innerWidth;
        const rightEdge = Math.round(sidebarLeft - this.MARGIN);
        const left = Math.max(12, Math.round(rightEdge - width));
        const bottomStart = window.innerHeight - this.MARGIN;

        return { positionMode, left, rightEdge, bottomStart };
    }
}
