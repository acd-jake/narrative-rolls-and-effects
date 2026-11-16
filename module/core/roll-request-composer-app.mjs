import { MODULE_ID } from "./constants.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RollRequestComposerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    #rollType = "";
    #actorAId = "";
    #actorBId = "";

    constructor(options = {}) {
        super(options);
        const actors = this.#getAvailableActors();
        this.#actorAId = actors[0]?.id ?? "";
        this.#actorBId = actors[1]?.id ?? actors[0]?.id ?? "";
    }

    static DEFAULT_OPTIONS = {
        id: "roe-roll-request-composer",
        tag: "form",
        classes: ["roe-overlay", "gm-request-dialog"],
        position: { width: 450, height: "auto" },
        window: { title: "ROE.RollRequest.WindowTitle", resizable: false },
        actions: {
            selectType: RollRequestComposerApp.#onSelectType,
            dispatchRequest: RollRequestComposerApp.#onDispatchRequest
        }
    };

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/dialogs/roll-request-composer.hbs`
        }
    };

    _onRender(context, options) {
        super._onRender(context, options);
        this.element.dataset.nreSystem = game.system.id;
        this.element.querySelector("select[name='actorA']")?.addEventListener("change", this.#onActorChange.bind(this));
        this.element.querySelector("select[name='actorB']")?.addEventListener("change", this.#onActorChange.bind(this));
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const adapter = AdapterRegistry.active;
        const availableTabs = adapter?.getRequestComposerTabs?.() ?? [];
        if (!availableTabs.some((tab) => tab.id === this.#rollType)) {
            this.#rollType = availableTabs[0]?.id ?? "";
        }
        const actors = this.#getAvailableActors();
        const actorA = actors.find((actor) => actor.id === this.#actorAId) ?? actors[0] ?? null;
        const actorB = actors.find((actor) => actor.id === this.#actorBId) ?? actors[1] ?? actorA;
        const requestContext = {
            actors: actors.map((actor) => ({
                id: actor.id,
                name: actor.name,
                selectedA: actor.id === actorA?.id,
                selectedB: actor.id === actorB?.id
            })),
            actorA,
            actorB
        };
        const adapterContext = await adapter?.getRequestComposerContext?.(this.#rollType, requestContext) ?? {};
        const tabs = availableTabs.map((tab) => ({
            ...tab,
            active: tab.id === this.#rollType
        }));
        const requestTemplate = adapter?.getRequestComposerTemplate?.();
        const requestContent = requestTemplate
            ? await foundry.applications.handlebars.renderTemplate(requestTemplate, { ...requestContext, ...adapterContext })
            : "";

        return {
            ...context,
            tabs,
            requestContent,
            rollType: this.#rollType
        };
    }

    #onActorChange(event) {
        const select = event.currentTarget;
        if (select.name === "actorA") this.#actorAId = select.value;
        if (select.name === "actorB") this.#actorBId = select.value;
        this.render();
    }

    static #onSelectType(event, target) {
        const nextType = target.dataset.type;
        if (!nextType || nextType === this.#rollType) return;
        this.#rollType = nextType;
        this.render();
    }

    static async #onDispatchRequest(event) {
        const adapter = AdapterRegistry.active;
        const prepareModifiers = Boolean(game.user.isGM && event.shiftKey);
        const dispatched = await adapter?.dispatchRequestComposer?.(this.#rollType, this.element, { prepareModifiers });
        if (dispatched !== false) this.close();
    }

    #getAvailableActors() {
        const tokenActors = canvas?.tokens?.placeables?.map((token) => token.actor).filter(Boolean) ?? [];
        const worldActors = game.actors.filter((actor) => actor.hasPlayerOwner);
        const unique = new Map();
        for (const actor of [...tokenActors, ...worldActors]) unique.set(actor.id, actor);
        return Array.from(unique.values());
    }
}
