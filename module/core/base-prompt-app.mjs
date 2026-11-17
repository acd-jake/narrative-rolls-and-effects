import { MODULE_ID, PROMPT_DESCRIPTION_TRANSITION_MS } from "./constants.mjs";
import { RollPromptStackManager } from "./stack-manager.mjs";
import { RollVisibilityPolicy } from "./visibility-policy.mjs";
import { SessionCardRenderer } from "./card-renderer.mjs";
import { UniversalRollOrchestrator } from "./orchestrator.mjs";
import { SessionStore } from "./session-store.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";
import { DiceVisualizer } from "./dice-visualizer.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BasePromptApp extends HandlebarsApplicationMixin(ApplicationV2) {
    _messageId;
    _userDragged = false;
    _isDescriptionExpanded = false;
    #updateHookId;
    #adapterActionElement = null;
    #adapterActionHandler;

    constructor({ messageId }, options = {}) {
        super(options);
        this._messageId = messageId;
        this.#adapterActionHandler = this.#handleAdapterAction.bind(this);
        RollPromptStackManager.track(this);

        this.#updateHookId = Hooks.on("roeRollSessionUpdated", (message, session) => {
            if (message.id !== this._messageId) return;
            this.render(this.rendered ? {} : { force: true });
        });
    }

    get message() {
        return game.messages.get(this._messageId) ?? null;
    }

    get session() {
        return SessionStore.getSession(this.message);
    }

    get messageId() {
        return this._messageId;
    }

    _isCompactView() {
        return !game.user.isGM && game.settings.get(MODULE_ID, "playerPromptPhaseMode") === "active";
    }

    _hasPendingPlayerAction() {
        const sys = this.session;
        if (!sys || sys.isResolved) return false;
        const adapter = AdapterRegistry.active;
        const adapterResult = adapter?.hasPendingPlayerAction?.(this, sys);
        if (adapterResult !== undefined) return Boolean(adapterResult);

        return (sys.participants ?? []).some((p) => {
            const actor = SessionStore.resolveActor(p);
            if (!actor?.isOwner) return false;
            if (!p.hasRolled) return true;
            const opts = adapter?.evaluateParticipantOptions(p, sys, false);
            return Boolean(opts?.hasPendingAction);
        });
    }

    _getPhases(sys) {
        const phases = AdapterRegistry.active?.getPhases?.(sys);
        if (phases) return phases;
        return [{ id: "roll", isActive: !sys?.isResolved, isCompleted: Boolean(sys?.isResolved) }];
    }

    _buildPhaseSummary() {
        return AdapterRegistry.active?.buildPhaseSummary?.(this.session) ?? "";
    }

    static DEFAULT_OPTIONS = {
        classes: ["roe-overlay", "roll-prompt-window"],
        position: { width: 260, height: "auto" },
        window: { frame: false, positioned: true },
        actions: {
            setModifier: BasePromptApp._onSetModifier,
            publishPreparedRoll: BasePromptApp._onPublishPreparedRoll,
            resolveSession: BasePromptApp._onResolveSession,
            closePrompt: BasePromptApp._onClosePrompt,
            applyConsequences: BasePromptApp._onApplyConsequences,
            toggleDescription: BasePromptApp._onToggleDescription
        }
    };

    _onRender(context, options) {
        super._onRender(context, options);
        this.element.dataset.nreSystem = game.system.id;
        this.#bindAdapterActions();

        if (!this._userDragged) RollPromptStackManager.register(this);

        const handle = this.element.querySelector(".prompt-drag-handle");
        if (handle && !handle.dataset.dragBound) {
            handle.dataset.dragBound = "true";
            handle.addEventListener("pointerdown", () => {
                this._userDragged = true;
                RollPromptStackManager.unregister(this);
            });
        }

        this.element.querySelectorAll("input[name='modifierSlider']").forEach((slider) => {
            slider.addEventListener("input", (ev) => {
                const val = Math.clamp(Number(ev.target.value) || 0, -2, 2);
                const effective = Math.clamp(Number(ev.target.dataset.flagBonus || 0) + val, -2, 2);
                const header = ev.target.closest(".slider-control-block")?.previousElementSibling;
                if (header) header.textContent = `${game.i18n.localize("ROE.Roll.ModifierDice")} (${this._formatModifierLabel(effective)})`;
            });
            slider.addEventListener("change", (ev) => {
                const val = Math.clamp(Number(ev.target.value) || 0, -2, 2);
                return this._onModifierSliderChange(val, ev.target.dataset.participantKey);
            });
        });

        this.element.querySelectorAll("[data-inspect-key]").forEach((el) => {
            const key = el.dataset.inspectKey;
            const sys = this.session;
            const participant = sys?.participants?.find((p) => p.key === key);
            if (!participant?.hasRolled || !participant.rollBreakdown) return;
            if (!RollVisibilityPolicy.canViewParticipantRoll(participant, sys)) return;

            el.classList.add("is-inspectable");
            el.title = game.i18n.localize("ROE.Roll.ClickToInspect");
            el.addEventListener("click", (ev) => {
                ev.preventDefault();
                SessionCardRenderer.toggleBreakdownForElement(el.parentElement, participant);
            });
        });
    }

    async _onModifierSliderChange(val, participantKey) {
        const targetKey = participantKey || this.session?.participants?.[0]?.key;
        if (targetKey) await UniversalRollOrchestrator.setParticipantModifier(this._messageId, targetKey, val);
    }

    _onClose(options) {
        super._onClose(options);
        RollPromptStackManager.untrack(this);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const sys = this.session;
        const adapter = AdapterRegistry.active;
        const allRolled = Boolean(sys?.participants?.length && sys.participants.every((p) => p.hasRolled));
        const primaryMod = sys?.participants?.at(0)?.modifierDice ?? 0;
        const compactView = this._isCompactView();
        const phases = sys ? this._getPhases(sys) : [];
        const hasMultiplePhases = phases.length > 1;
        const modifierPreparationPartials = adapter?.getModifierPreparationPartials?.(sys) ?? {};
        const resolvedResultPartials = adapter?.getResolvedResultPartials?.(sys) ?? {};
        const resolvedParticipants = sys?.isResolved ? this._buildResolvedParticipants(sys) : [];
        const canResolve = Boolean(game.user.isGM && allRolled && !sys?.isResolved && adapter?.canResolveSession?.(sys) !== false);
        const theme = game.settings.get(MODULE_ID, "rollPromptTheme");
        const themeColors = {
            "western": "rgba(48, 30, 16, 0.9)",
            "fantasy": "rgba(40, 28, 14, 0.86)",
            "dark-fantasy": "rgba(14, 6, 6, 0.9)",
            "noir": "rgba(0, 0, 0, 0.88)",
            "science-fiction": "rgba(4, 16, 24, 0.82)",
            "cyberpunk": "rgba(14, 6, 30, 0.88)",
            "cosmic-horror": "rgba(10, 16, 12, 0.9)",
            "art-deco": "rgba(10, 10, 12, 0.9)"
        };
        const bgColor = themeColors[theme] || themeColors["western"];

        const showPlayerWaitingHint = Boolean(!game.user.isGM && !sys?.isResolved && !this._hasPendingPlayerAction());
        const playerWaitingHint = showPlayerWaitingHint
            ? (adapter?.getPlayerWaitingHint?.(sys) || game.i18n.localize("ROE.RollSession.AwaitingResolution"))
            : "";

        const promptContext = {
            ...context,
            isGM: game.user.isGM,
            isResolved: Boolean(sys?.isResolved),
            isPreparingModifiers: Boolean(game.user.isGM && sys?.isPreparingModifiers),
            preparationParticipants: adapter?.buildPreparationParticipants?.(sys) ?? this._buildPreparationParticipants(sys),
            preparationTactics: adapter?.buildPreparationTactics?.(sys) ?? [],
            preparationDifficulties: adapter?.buildPreparationDifficulties?.(sys) ?? [],
            modifierPreparationHeaderPartial: modifierPreparationPartials.header ?? null,
            modifierPreparationDetailsPartial: modifierPreparationPartials.details ?? null,
            resolvedResultHeaderPartial: resolvedResultPartials.header ?? null,
            resolvedResultBodyPartial: resolvedResultPartials.body ?? null,
            resolvedTitle: sys?.title ?? "",
            resolvedParticipants,
            resolvedHeadline: resolvedParticipants.every((p) => p.canView) ? sys?.outcomeHeadline ?? "" : "",
            compactView,
            phases,
            hasMultiplePhases,
            showPhaseHeaders: hasMultiplePhases && !compactView,
            phaseSummaryText: compactView && sys ? this._buildPhaseSummary(sys) : "",
            allRolled,
            showPlayerWaitingHint,
            playerWaitingHint,
            canApplyConsequences: Boolean(game.user.isGM && allRolled && sys?.hasPendingConsequences && !sys?.consequencesApplied && !sys?.isResolved),
            canResolve,
            outcomeHeadline: sys?.outcomeHeadline ?? "",
            promptDescriptions: [],
            hasPromptDescription: false,
            isDescriptionExpanded: this._isDescriptionExpanded,
            descriptionTransitionMs: PROMPT_DESCRIPTION_TRANSITION_MS,
            resultPartial: "roeResultDefault",
            modifierDice: primaryMod,
            modifierDisplay: this._formatModifierLabel(primaryMod),
            rollDice: DiceVisualizer.getDiceVisuals(sys, primaryMod),
            theme,
            themeBackgroundColor: bgColor
        };
        return adapter?.preparePromptContext?.(this, sys, promptContext) ?? promptContext;
    }

    _buildPreparationParticipants(sys) {
        if (!sys?.isPreparingModifiers || sys.rollType === "other") return [];
        return (sys.participants ?? []).map((p) => ({
            ...p,
            preparationLabel: p.label,
            modifierDisplay: this._formatModifierLabel(p.modifierDice ?? 0)
        }));
    }

    _buildResolvedParticipants(sys) {
        const adapter = AdapterRegistry.active;
        return (sys.participants ?? []).map((p) => {
            const canView = RollVisibilityPolicy.canViewParticipantRoll(p, sys);
            let result = game.i18n.localize("ROE.RollSession.HiddenRoll");
            const formatted = adapter?.formatResolvedParticipant?.(p, sys);
            if (canView) {
                result = formatted ?? adapter?.formatRollOutcome?.(p) ?? String(p.total ?? "");
            }
            return { key: p.key, actorName: p.actorName, label: p.label, canView, result };
        });
    }
    async close(options = {}) {
        if (options.suspend) {
            await super.close(options);
            RollPromptStackManager.track(this);
            return this;
        }
        Hooks.off("roeRollSessionUpdated", this.#updateHookId);
        this.#adapterActionElement?.removeEventListener("click", this.#adapterActionHandler);
        this.#adapterActionElement = null;
        RollPromptStackManager.untrack(this);
        return super.close(options);
    }
    _evaluateParticipantOptions(participant, sys) {
        const isDelegated = this._isDelegatedToActivePlayer(participant);
        return AdapterRegistry.active?.evaluateParticipantOptions(participant, sys, isDelegated) ?? {
            isDelegatedToPlayer: isDelegated
        };
    }
    _formatModifierLabel(mod) {
        if (mod > 0) {
            const unit = game.i18n.localize(mod === 1 ? "ROE.Roll.BonusDie" : "ROE.Roll.BonusDice");
            return `${mod} ${unit}`;
        }
        if (mod < 0) {
            const abs = Math.abs(mod);
            const unit = game.i18n.localize(abs === 1 ? "ROE.Roll.PenaltyDie" : "ROE.Roll.PenaltyDice");
            return `${abs} ${unit}`;
        }
        return game.i18n.localize("ROE.Roll.BonusPenaltyLabel");
    }

    _formatDiceFormulaLabel(diceArray) {
        if (!Array.isArray(diceArray) || diceArray.length === 0) return "";
        const adapterLabel = AdapterRegistry.active?.formatDiceFormulaLabel?.(diceArray);
        if (adapterLabel !== undefined) return adapterLabel;
        return diceArray
            .map((die) => `${die.count ?? 1} ${game.i18n.localize(die.label)}`)
            .join(", ");
    }
    _isDelegatedToActivePlayer(participant) {
        if (!game.user.isGM || !participant) return false;
        const actor = SessionStore.resolveActor(participant);
        if (!actor) return false;
        return game.users.some((u) => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
    }
    _getDifficultyThreshold(target, difficulty) {
        return AdapterRegistry.active?.getDifficultyThreshold(target, difficulty) ?? target;
    }
    static async _onSetModifier(event, target) {
        const sys = this.session;
        const first = sys?.participants?.[0];
        if (!first || first.hasRolled || sys.isResolved) return;
        const current = first.modifierDice ?? 0;
        const step = Number(target.dataset.step);
        const next = !Number.isNaN(step) ? Math.clamp(current + step, -2, 2) : current >= 2 ? -2 : current + 1;
        await UniversalRollOrchestrator.setParticipantModifier(this._messageId, first.key, next);
    }
    static async _onPublishPreparedRoll() {
        if (game.user.isGM) await UniversalRollOrchestrator.publishPreparedRoll(this._messageId);
    }
    static async _onResolveSession() {
        if (game.user.isGM && this._messageId) await UniversalRollOrchestrator.resolveSession(this._messageId);
    }
    static _onClosePrompt() {
        this.close();
    }
    static async _onApplyConsequences() {
        if (game.user.isGM) await UniversalRollOrchestrator.applySessionConsequences(this._messageId);
    }
    #bindAdapterActions() {
        if (this.#adapterActionElement === this.element) return;
        this.#adapterActionElement?.removeEventListener("click", this.#adapterActionHandler);
        this.#adapterActionElement = this.element;
        this.#adapterActionElement.addEventListener("click", this.#adapterActionHandler);
    }

    #handleAdapterAction(event) {
        const target = event.target.closest("[data-action]");
        const actionName = target?.dataset.action;
        if (!actionName || this.constructor.DEFAULT_OPTIONS.actions?.[actionName]) return;
        AdapterRegistry.active?.handlePromptAction?.(this, actionName, event, target);
    }
    static _onToggleDescription(event) {
        event.stopPropagation();
        this._isDescriptionExpanded = !this._isDescriptionExpanded;
        const frame = this.element?.querySelector(".roe-roll-prompt-frame");
        frame?.querySelector(".prompt-description-drawer")?.classList.toggle("is-expanded", this._isDescriptionExpanded);
        frame?.querySelector("[data-action='toggleDescription']")?.setAttribute("aria-expanded", String(this._isDescriptionExpanded));
        if (!this._userDragged) {
            window.setTimeout(() => RollPromptStackManager.reflow(), PROMPT_DESCRIPTION_TRANSITION_MS + 20);
        }
    }
}