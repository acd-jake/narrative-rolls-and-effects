import { MODULE_ID } from "./constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Prompts the GM to select target actors from the current scene and player-owned actors
 * before dispatching a roll prompt.
 */
export class ActorTargetSelectorApp extends HandlebarsApplicationMixin(ApplicationV2) {
    #title;
    #selectedIds = new Set();
    #candidates = [];
    #resolve;

    constructor({ title = "", candidates = [] }, resolve) {
        super();
        this.#title = title;
        this.#candidates = candidates;
        this.#resolve = resolve;
        this.#preselectPlayerCharacters();
    }

    static DEFAULT_OPTIONS = {
        id: "roe-actor-target-selector",
        tag: "div",
        classes: ["roe-overlay", "gm-request-dialog"],
        position: { width: 380, height: "auto" },
        window: {
            title: "ROE.ActorSelector.WindowTitle",
            resizable: false,
            frame: true,
            positioned: true
        },
        actions: {
            toggleAllPCs: ActorTargetSelectorApp.#onToggleAllPCs,
            toggleAllNPCs: ActorTargetSelectorApp.#onToggleAllNPCs,
            toggleActor: ActorTargetSelectorApp.#onToggleActor,
            confirmSelection: ActorTargetSelectorApp.#onConfirmSelection
        }
    };

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/dialogs/actor-target-selector.hbs`
        }
    };

    /**
     * Opens the selector dialog and resolves with the chosen Actor documents.
     * @param {{ title?: string }} options
     * @returns {Promise<Actor[]>}
     */
    static async prompt({ title = "" } = {}) {
        const candidates = this.collectAvailableActors();
        if (candidates.length === 0) {
            ui.notifications.warn(game.i18n.localize("ROE.Warnings.NoActiveCharacter"));
            return [];
        }

        return new Promise((resolve) => this.#openSingleInstance(title, candidates, resolve));
    }

    static #openSingleInstance(title, candidates, resolve) {
        const existing = foundry.applications.instances.get("roe-actor-target-selector");
        if (existing) existing.close();
        new ActorTargetSelectorApp({ title, candidates }, resolve).render({ force: true });
    }

    /**
     * Collects deduplicated actors from the active scene and all player-owned world actors.
     * @returns {Array<{ id: string, actor: Actor, name: string, img: string, isPC: boolean }>}
     */
    static collectAvailableActors() {
        const actorMap = new Map();
        this.#collectSceneActors(actorMap);
        this.#collectPlayerOwnedActors(actorMap);
        return Array.from(actorMap.values()).sort(this.#compareCandidates);
    }

    static #collectSceneActors(actorMap) {
        for (const tokenDoc of canvas?.scene?.tokens ?? []) {
            const actor = tokenDoc.actor;
            if (actor && !actorMap.has(actor.id)) {
                actorMap.set(actor.id, this.#toCandidate(actor, Boolean(actor.hasPlayerOwner)));
            }
        }
    }

    static #collectPlayerOwnedActors(actorMap) {
        for (const actor of game.actors ?? []) {
            if (actor.hasPlayerOwner && !actorMap.has(actor.id)) {
                actorMap.set(actor.id, this.#toCandidate(actor, true));
            }
        }
    }

    static #toCandidate(actor, isPC) {
        return { id: actor.id, actor, name: actor.name, img: actor.img, isPC };
    }

    static #compareCandidates(a, b) {
        if (a.isPC !== b.isPC) return a.isPC ? -1 : 1;
        return a.name.localeCompare(b.name, game.i18n.lang);
    }

    #preselectPlayerCharacters() {
        for (const candidate of this.#candidates) {
            if (candidate.isPC) this.#selectedIds.add(candidate.id);
        }
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const pcs = this.#candidates.filter((c) => c.isPC);
        const npcs = this.#candidates.filter((c) => !c.isPC);

        return {
            ...context,
            checkTitle: this.#title,
            hasPCs: pcs.length > 0,
            hasNPCs: npcs.length > 0,
            allPCsSelected: pcs.length > 0 && pcs.every((c) => this.#selectedIds.has(c.id)),
            allNPCsSelected: npcs.length > 0 && npcs.every((c) => this.#selectedIds.has(c.id)),
            hasSelection: this.#selectedIds.size > 0,
            actors: this.#candidates.map((c) => this.#formatCandidateForView(c))
        };
    }

    #formatCandidateForView(candidate) {
        return {
            id: candidate.id,
            name: candidate.name,
            img: candidate.img,
            isPC: candidate.isPC,
            selected: this.#selectedIds.has(candidate.id)
        };
    }

    #toggleGroup(isPC) {
        const group = this.#candidates.filter((c) => c.isPC === isPC);
        const allSelected = group.every((c) => this.#selectedIds.has(c.id));
        for (const candidate of group) {
            if (allSelected) this.#selectedIds.delete(candidate.id);
            else this.#selectedIds.add(candidate.id);
        }
        this.render();
    }

    static #onToggleAllPCs() {
        this.#toggleGroup(true);
    }

    static #onToggleAllNPCs() {
        this.#toggleGroup(false);
    }

    static #onToggleActor(event, target) {
        const actorId = target.dataset.actorId;
        if (!actorId) return;
        if (this.#selectedIds.has(actorId)) this.#selectedIds.delete(actorId);
        else this.#selectedIds.add(actorId);
        this.render();
    }

    static #onConfirmSelection() {
        const chosen = this.#candidates
            .filter((c) => this.#selectedIds.has(c.id))
            .map((c) => c.actor);
        this.#finish(chosen);
    }

    #finish(actors) {
        const resolve = this.#resolve;
        this.#resolve = null;
        this.close();
        resolve?.(actors);
    }

    async close(options = {}) {
        if (this.#resolve) {
            const resolve = this.#resolve;
            this.#resolve = null;
            resolve([]);
        }
        return super.close(options);
    }
}
