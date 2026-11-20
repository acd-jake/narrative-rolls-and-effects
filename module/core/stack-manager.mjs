import { MODULE_ID } from "./constants.mjs";

/**
 * Manages docking and stacking of active roll prompts so multiple prompts
 * appear neatly ordered without overlapping.
 */
export class RollPromptStackManager {
    /** @type {Set<ApplicationV2>} */
    static #dockedApps = new Set();

    /** @type {Set<ApplicationV2>} */
    static #allActiveApps = new Set();

    /** @type {WeakMap<ApplicationV2, number>} */
    static #sequenceNumbers = new WeakMap();

    /** @type {ApplicationV2|null} */
    static #focusedApp = null;

    static MARGIN = 16;
    static STACK_GAP = 10;
    static MIN_WIDTH = 200;
    static DOCK_SNAP_PADDING = 48;

    /** Registers a prompt in the dock stack and tracks it globally for lifecycle cleanup. */
    static register(app) {
        this.track(app);
        this.#dockedApps.add(app);
        requestAnimationFrame(() => this.reflow());
    }

    /** Marks the given prompt as focused and brings it visually to the front. */
    static setFocused(app) {
        if (!app || this.#focusedApp === app) return;
        if (this.#focusedApp?.element) {
            this.#focusedApp.element.classList.remove("is-focused");
        }
        this.#focusedApp = app;
        if (app.element) {
            app.element.classList.add("is-focused");
        }
    }

    static syncFocusClass(app) {
        app?.element?.classList.toggle("is-focused", this.#focusedApp === app);
    }

    /** Tracks an app for lifecycle cleanup and assigns a stable chronological sequence number. */
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

    /** Closes the oldest open prompts when the client's maximum simultaneous prompt count is exceeded. */
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

    /** Removes an app from the dock stack (e.g., when manually dragged) without removing lifecycle tracking. */
    static unregister(app) {
        if (this.#dockedApps.delete(app)) {
            requestAnimationFrame(() => this.reflow());
        }
    }

    /** Completely removes a closed app from both tracking sets. */
    static untrack(app) {
        this.#allActiveApps.delete(app);
        this.unregister(app);
        this.refreshSequenceBadges();
    }

    /** Returns the visible sequence number for a prompt, or null when it should be hidden. */
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

    /** Returns whether an app is currently tracked as active. */
    static isTracked(app) {
        return this.#allActiveApps.has(app);
    }

    /** Returns whether a prompt for the given chat message ID is currently open. */
    static hasByMessageId(messageId) {
        for (const app of this.#allActiveApps) {
            if (app.messageId === messageId) return true;
        }
        return false;
    }
    /** Closes all open prompt windows associated with the given chat message ID. */
    static closeByMessageId(messageId) {
        for (const app of Array.from(this.#allActiveApps)) {
            if (app.messageId === messageId) app.close();
        }
    }

    /** Shifts a prompt window inside the viewport whenever expanding details push it past an edge. */
    static clampToViewport(app) {
        const el = app?.element;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        const width = Math.round(rect.width || app.position?.width || 340);
        const height = Math.round(rect.height || 180);
        const currentLeft = Number.isFinite(app.position?.left) ? app.position.left : rect.left;
        const currentTop = Number.isFinite(app.position?.top) ? app.position.top : rect.top;

        const maxLeft = Math.max(this.MARGIN, window.innerWidth - width - this.MARGIN);
        const maxTop = Math.max(this.MARGIN, window.innerHeight - height - this.MARGIN);
        const nextLeft = Math.round(Math.min(Math.max(this.MARGIN, currentLeft), maxLeft));
        const nextTop = Math.round(Math.min(Math.max(this.MARGIN, currentTop), maxTop));

        if (nextLeft !== Math.round(currentLeft) || nextTop !== Math.round(currentTop)) {
            app.setPosition({ left: nextLeft, top: nextTop });
        }
    }

    /** Returns true when a dragged prompt was released inside the stack manager's dock area. */
    static isInsideDockZone(app) {
        const el = app?.element;
        if (!el) return false;

        const width = this.#computeTargetWidth();
        const anchor = this.#computeAnchorCoordinates(width);
        const direction = game.settings?.get(MODULE_ID, "rollPromptStackDirection") ?? "vertical";
        const rect = el.getBoundingClientRect();
        const pad = this.DOCK_SNAP_PADDING;

        const zoneLeft = direction === "horizontal"
            ? this.MARGIN
            : Math.max(this.MARGIN, anchor.left - pad);
        const zoneRight = direction === "horizontal"
            ? anchor.rightEdge + pad
            : Math.min(window.innerWidth - this.MARGIN, anchor.left + width + pad);
        const zoneTop = direction === "vertical"
            ? this.MARGIN
            : Math.max(this.MARGIN, anchor.bottomStart - rect.height - pad);
        const zoneBottom = Math.min(window.innerHeight, anchor.bottomStart + pad);

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return centerX >= zoneLeft && centerX <= zoneRight && centerY >= zoneTop && centerY <= zoneBottom;
    }

    /** Re-computes positions for all currently docked prompts. */
    static reflow() {
        const apps = Array.from(this.#dockedApps).filter((app) => app.element);
        if (apps.length === 0) return;

        const width = this.#computeTargetWidth();
        const anchor = this.#computeAnchorCoordinates(width);
        const direction = game.settings?.get(MODULE_ID, "rollPromptStackDirection") ?? "vertical";

        if (direction === "horizontal") {
            this.#reflowHorizontal(apps, width, anchor);
        } else {
            this.#reflowVertical(apps, width, anchor);
        }

        for (const app of apps) this.clampToViewport(app);
    }

    static #computeTargetWidth() {
        const pct = Math.clamp(Number(game.settings?.get(MODULE_ID, "rollPromptWidthPercent")) || 22, 10, 50);
        return Math.max(this.MIN_WIDTH, Math.round(window.innerWidth * (pct / 100)));
    }

    static #computeAnchorCoordinates(width) {
        const positionMode = game.settings?.get(MODULE_ID, "rollPromptPosition") ?? "sidebar-left";
        const sidebarRect = document.getElementById("sidebar")?.getBoundingClientRect();
        const hotbarRect = document.getElementById("hotbar")?.getBoundingClientRect();
        const playersRect = document.getElementById("players")?.getBoundingClientRect();

        const rightEdge = (sidebarRect && sidebarRect.width > 0 ? sidebarRect.left : window.innerWidth) - this.MARGIN;
        const bottomStart = (hotbarRect && hotbarRect.height > 0 ? hotbarRect.top : window.innerHeight) - this.MARGIN;

        if (positionMode === "players-top") {
            const left = Math.max(this.MARGIN, Math.round(playersRect?.left ?? this.MARGIN));
            const topAnchor = playersRect && playersRect.height > 0 ? playersRect.top - this.MARGIN : bottomStart;
            return { positionMode, left, rightEdge, bottomStart: topAnchor };
        }

        const left = Math.max(this.MARGIN, Math.round(rightEdge - width));
        return { positionMode, left, rightEdge, bottomStart };
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
        let currentX = goesRight ? left : rightEdge;

        for (let i = apps.length - 1; i >= 0; i--) {
            const app = apps[i];
            app.setPosition({ width });

            const rect = app.element.getBoundingClientRect();
            const actualWidth = Math.max(width, Math.round(rect.width || width));
            const height = rect.height || 180;
            const top = Math.max(12, Math.round(bottomStart - height));

            if (goesRight) {
                if (currentX + actualWidth > rightEdge) break;
                app.setPosition({ left: Math.round(currentX), top, width });
                currentX += actualWidth + this.STACK_GAP;
            } else {
                const targetLeft = Math.round(currentX - actualWidth);
                if (targetLeft < this.MARGIN) break;
                app.setPosition({ left: targetLeft, top, width });
                currentX = targetLeft - this.STACK_GAP;
            }
        }
    }
}
