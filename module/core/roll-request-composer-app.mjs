import { MODULE_ID } from "./constants.mjs";
import { UniversalRollOrchestrator } from "./orchestrator.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RollRequestComposerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    #rollType = "skill";
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
        this.element.querySelector("select[name='actorA']")?.addEventListener("change", (ev) => {
            this.#actorAId = ev.target.value;
            this.render();
        });
        this.element.querySelector("select[name='actorB']")?.addEventListener("change", (ev) => {
            this.#actorBId = ev.target.value;
            this.render();
        });
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const adapter = AdapterRegistry.active;
        const actors = this.#getAvailableActors();
        const actorA = actors.find((a) => a.id === this.#actorAId) ?? actors[0] ?? null;
        const actorB = actors.find((a) => a.id === this.#actorBId) ?? actors[1] ?? actorA;

        const tabs = [
            { id: "skill", icon: "fa-dice-d20", label: game.i18n.localize("ROE.RollSession.Types.skill") },
            { id: "sanity", icon: "fa-brain", label: game.i18n.localize("ROE.RollSession.Types.sanity") },
            { id: "combined", icon: "fa-code-merge", label: game.i18n.localize("ROE.RollSession.Types.combined") },
            { id: "opposed", icon: "fa-scale-balanced", label: game.i18n.localize("ROE.RollSession.Types.opposed") },
            { id: "other", icon: "fa-cubes", label: game.i18n.localize("ROE.RollSession.Types.other") }
        ].map((t) => ({ ...t, active: t.id === this.#rollType }));

        return {
            ...context,
            tabs,
            isSkill: this.#rollType === "skill",
            isSanity: this.#rollType === "sanity",
            isCombined: this.#rollType === "combined",
            isOpposed: this.#rollType === "opposed",
            isOther: this.#rollType === "other",
            actors: actors.map((a) => ({ id: a.id, name: a.name, selectedA: a.id === actorA?.id, selectedB: a.id === actorB?.id })),
            checksA: actorA && adapter ? adapter.collectActorChecks(actorA, { includeSpecial: this.#rollType === "skill" }) : [],
            checksB: actorB && adapter ? adapter.collectActorChecks(actorB, { includeSpecial: false }) : []
        };
    }

    static #onSelectType(event, target) {
        const nextType = target.dataset.type;
        if (nextType && nextType !== this.#rollType) {
            this.#rollType = nextType;
            this.render();
        }
    }

    static async #onDispatchRequest(event) {
        const form = this.element;
        const prepareModifiers = Boolean(game.user.isGM && event.shiftKey);
        const actors = this.#getAvailableActors();
        const actorA = actors.find((a) => a.id === form.querySelector("select[name='actorA']")?.value);
        if (!actorA) return;

        if (this.#rollType === "skill") {
            const parsed = this.#parseCheckOption(form.querySelector("select[name='skillCheck']")?.value);
            const difficulty = form.querySelector("select[name='difficulty']")?.value || "regular";
            const item = parsed.itemId ? actorA.items.get(parsed.itemId) : null;
            await UniversalRollOrchestrator.startSkillCheck({
                actor: actorA,
                item,
                label: parsed.label,
                targetValue: parsed.targetValue,
                difficulty: parsed.isLuck ? "regular" : difficulty,
                canChangeDifficulty: !parsed.isLuck,
                canPush: !parsed.isLuck && item?.system?.properties?.push !== false,
                prepareModifiers
            });
        } else if (this.#rollType === "sanity") {
            const label = form.querySelector("input[name='sanityLabel']")?.value.trim() || game.i18n.localize("ROE.Resources.Sanity");
            const lossSuccess = form.querySelector("input[name='lossSuccess']")?.value.trim() || "0";
            const lossFailure = form.querySelector("input[name='lossFailure']")?.value.trim() || "1d6";
            await UniversalRollOrchestrator.startSanityCheck({ actor: actorA, label, lossSuccess, lossFailure, prepareModifiers });
        } else if (this.#rollType === "combined") {
            const check1 = this.#parseCheckOption(form.querySelector("select[name='combinedCheck1']")?.value);
            const check2 = this.#parseCheckOption(form.querySelector("select[name='combinedCheck2']")?.value);
            const combinedMode = form.querySelector("select[name='combinedMode']")?.value || "and";
            const difficulty = form.querySelector("select[name='difficulty']")?.value || "regular";
            await UniversalRollOrchestrator.startCombinedRoll({ actor: actorA, checks: [check1, check2], combinedMode, difficulty, prepareModifiers });
        } else if (this.#rollType === "opposed") {
            const actorB = actors.find((a) => a.id === form.querySelector("select[name='actorB']")?.value);
            if (!actorB) return;
            const checkA = this.#parseCheckOption(form.querySelector("select[name='opposedCheckA']")?.value);
            const checkB = this.#parseCheckOption(form.querySelector("select[name='opposedCheckB']")?.value);
            const title = form.querySelector("input[name='opposedTitle']")?.value.trim() || `${checkA.label} vs. ${checkB.label}`;
            await UniversalRollOrchestrator.startOpposedRoll({
                title,
                prepareModifiers,
                contestants: [
                    { actor: actorA, label: checkA.label, targetValue: checkA.targetValue },
                    { actor: actorB, label: checkB.label, targetValue: checkB.targetValue }
                ]
            });
        } else if (this.#rollType === "other") {
            const label = form.querySelector("input[name='otherLabel']")?.value.trim() || game.i18n.localize("ROE.RollSession.Types.other");
            const diceFormula = form.querySelector("input[name='diceFormula']")?.value.trim() || "1d100";
            await UniversalRollOrchestrator.startBasicOrOtherRoll({ actor: actorA, label, diceFormula, isOther: true, prepareModifiers });
        }
        this.close();
    }

    #getAvailableActors() {
        const tokenActors = canvas?.tokens?.placeables?.map((t) => t.actor).filter(Boolean) ?? [];
        const worldActors = game.actors.filter((a) => a.hasPlayerOwner || a.type === "character" || a.type === "investigator" || a.type === "npc");
        const unique = new Map();
        for (const actor of [...tokenActors, ...worldActors]) unique.set(actor.id, actor);
        return Array.from(unique.values());
    }

    #parseCheckOption(raw) {
        const [kind, itemId, label, val] = (raw ?? "char||Check|50").split("|");
        return { isLuck: kind === "luck", itemId: itemId || null, label: label || "Check", targetValue: Number(val) || 50 };
    }
}
