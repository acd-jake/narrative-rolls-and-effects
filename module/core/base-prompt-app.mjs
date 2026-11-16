import { MODULE_ID, PROMPT_DESCRIPTION_TRANSITION_MS } from "./constants.mjs";
import { RollPromptStackManager } from "./stack-manager.mjs";
import { RollVisibilityPolicy } from "./visibility-policy.mjs";
import { SessionCardRenderer } from "./card-renderer.mjs";
import { UniversalRollOrchestrator } from "./orchestrator.mjs";
import { SessionStore } from "./session-store.mjs";
import { AdapterRegistry } from "./adapter-registry.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BasePromptApp extends HandlebarsApplicationMixin(ApplicationV2) {
    _messageId;
    _userDragged = false;
    _isDescriptionExpanded = false;
    #updateHookId;

    constructor({ messageId }, options = {}) {
        super(options);
        this._messageId = messageId;
        RollPromptStackManager.track(this);

        this.#updateHookId = Hooks.on("roeRollSessionUpdated", (message, session) => {
            if (message.id !== this._messageId) return;
            if (!session.isResolved && this._isCompactView() && !this._hasPendingPlayerAction()) {
                if (this.rendered) this.close({ suspend: true });
                return;
            }
            this.render(this.rendered ? {} : { force: true });
        });
    }

    get message() {
        return game.messages.get(this._messageId) ?? null;
    }

    get session() {
        return SessionStore.getSession(this.message);
    }

    get combatMessageId() {
        return this._messageId;
    }

    _isCompactView() {
        return !game.user.isGM && game.settings.get(MODULE_ID, "playerPromptPhaseMode") === "active";
    }

    _hasPendingPlayerAction() {
        const sys = this.session;
        if (!sys || sys.isResolved) return false;
        const adapter = AdapterRegistry.active;

        return (sys.participants ?? []).some((p) => {
            const actor = SessionStore.resolveActor(p);
            if (!actor?.isOwner) return false;
            if (!p.hasRolled) return true;
            const opts = adapter?.evaluateParticipantOptions(p, sys, false);
            return Boolean(opts?.canSpendLuck || opts?.canPush);
        });
    }

    _getPhases(sys) {
        if (sys?.pushFailurePending && ["basic", "skill", "combined"].includes(sys.rollType)) {
            return [
                { id: "roll", isActive: false, isCompleted: true },
                { id: "pushConsequences", isActive: true, isCompleted: false }
            ];
        }
        return [{ id: "roll", isActive: !sys?.isResolved, isCompleted: Boolean(sys?.isResolved) }];
    }

    _buildPhaseSummary() {
        return "";
    }

    async render(options, _options) {
        if (!this.rendered && !this.session?.isResolved && this._isCompactView() && !this._hasPendingPlayerAction()) return this;
        return super.render(options, _options);
    }

    static DEFAULT_OPTIONS = {
        classes: ["roe-overlay", "roll-prompt-window"],
        position: { width: 260, height: "auto" },
        window: { frame: false, positioned: true },
        actions: {
            setModifier: BasePromptApp._onSetModifier,
            togglePreparedTactical: BasePromptApp._onTogglePreparedTactical,
            publishPreparedRoll: BasePromptApp._onPublishPreparedRoll,
            spendLuck: BasePromptApp._onSpendLuck,
            declineLuck: BasePromptApp._onDeclineLuck,
            pushRoll: BasePromptApp._onPushRoll,
            resolveSession: BasePromptApp._onResolveSession,
            closePrompt: BasePromptApp._onClosePrompt,
            applyConsequences: BasePromptApp._onApplyConsequences,
            acknowledgePushFailure: BasePromptApp._onAcknowledgePushFailure,
            toggleDescription: BasePromptApp._onToggleDescription
        }
    };

    _onRender(context, options) {
        super._onRender(context, options);

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
                if (header) header.textContent = `${game.i18n.localize("ROE.Combat.AdditionalDice")} (${this._formatModifierLabel(effective)})`;
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
        const resolvedParticipants = sys?.isResolved ? this._buildResolvedParticipants(sys) : [];
        const pushedParticipants = (sys?.participants ?? []).filter((p) => p.isPushed);

        return {
            ...context,
            isGM: game.user.isGM,
            isResolved: Boolean(sys?.isResolved),
            isPreparingModifiers: Boolean(game.user.isGM && sys?.isPreparingModifiers),
            showPushFailurePhase: Boolean(game.user.isGM && sys?.pushFailurePending),
            canViewPushFailure: pushedParticipants.length > 0 && pushedParticipants.every((p) => RollVisibilityPolicy.canViewParticipantRoll(p, sys)),
            preparationParticipants: this._buildPreparationParticipants(sys),
            preparationTactics: this._buildPreparationTactics(sys),
            resolvedTitle: sys?.title ?? "",
            resolvedParticipants,
            resolvedHeadline: resolvedParticipants.every((p) => p.canView) ? sys?.outcomeHeadline ?? "" : "",
            compactView,
            phases,
            hasMultiplePhases,
            showPhaseHeaders: hasMultiplePhases && !compactView,
            phaseSummaryText: compactView && sys ? this._buildPhaseSummary(sys) : "",
            allRolled,
            canApplyConsequences: Boolean(game.user.isGM && allRolled && sys?.hasPendingConsequences && !sys?.consequencesApplied && !sys?.isResolved),
            canResolve: game.user.isGM && allRolled && !sys?.isResolved && !sys?.pushFailurePending,
            outcomeHeadline: sys?.outcomeHeadline ?? "",
            promptDescriptions: [],
            hasPromptDescription: false,
            isDescriptionExpanded: this._isDescriptionExpanded,
            descriptionTransitionMs: PROMPT_DESCRIPTION_TRANSITION_MS,
            resultPartial: "roeResultDefault",
            modifierDice: primaryMod,
            modifierDisplay: this._formatModifierLabel(primaryMod),
            rollDice: adapter?.getDiceVisuals(sys, primaryMod) ?? []
        };
    }

    _buildPreparationParticipants(sys) {
        if (!sys?.isPreparingModifiers || sys.rollType === "other") return [];
        let participants = sys.participants ?? [];
        if (sys.rollType === "combined") participants = participants.slice(0, 1);
        if (sys.rollType === "ranged") participants = participants.filter((p) => p.key === "attacker");
        return participants.map((p) => ({
            ...p,
            preparationLabel: sys.rollType === "combined" ? sys.title : p.label,
            modifierDisplay: this._formatModifierLabel(p.modifierDice ?? 0)
        }));
    }

    _buildPreparationTactics(sys) {
        if (!sys?.isPreparingModifiers || sys.rollType !== "combat") return [];
        const map = { outnumbered: "Outnumbered", surprised: "Surprised", proneTarget: "ProneTarget" };
        return Object.entries(map).map(([key, i18nKey]) => ({
            key,
            label: game.i18n.localize(`ROE.Combat.Tactical.${i18nKey}`),
            active: Boolean(sys.tacticalFlags?.[key])
        }));
    }

    _buildResolvedParticipants(sys) {
        const adapter = AdapterRegistry.active;
        return (sys.participants ?? []).map((p) => {
            const canView = RollVisibilityPolicy.canViewParticipantRoll(p, sys);
            let result = game.i18n.localize("ROE.RollSession.HiddenRoll");
            if (canView && sys.rollType === "ranged" && p.key === "defender") {
                result = game.i18n.localize(p.tookCover ? "ROE.Ranged.CoverTaken" : "ROE.Ranged.NoCover");
            } else if (canView && p.total === null) {
                result = game.i18n.localize("ROE.Combat.DefenseTabs.none");
            } else if (canView && (sys.rollType === "other" || p.key === "damage")) {
                result = String(p.total ?? "");
            } else if (canView) {
                result = adapter ? adapter.formatRollOutcome(p) : String(p.total ?? "");
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
        RollPromptStackManager.untrack(this);
        return super.close(options);
    }
    _evaluateParticipantOptions(participant, sys) {
        const isDelegated = this._isDelegatedToActivePlayer(participant);
        return AdapterRegistry.active?.evaluateParticipantOptions(participant, sys, isDelegated) ?? {
            canSpendLuck: false, canPush: false, isDelegatedToPlayer: isDelegated
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
        
        // Gruppiere die Würfel nach Typ
        let d10Units = 0;
        let d10Tens = 0;
        let bonusCount = 0;
        let penaltyCount = 0;
        let otherDice = [];

        for (const die of diceArray) {
            const label = die.label;
            if (label === "ROE.Dice.D10Units") {
                d10Units += die.count || 1;
            } else if (label === "ROE.Dice.D10Tens") {
                d10Tens += die.count || 1;
            } else if (label === "ROE.Roll.BonusDie") {
                bonusCount += die.count || 1;
            } else if (label === "ROE.Roll.PenaltyDie") {
                penaltyCount += die.count || 1;
            } else {
                otherDice.push(die);
            }
        }

        const parts = [];
        
        // Format: "1d10, 2d10 Zehner (1 Bonuswürfel)"
        if (d10Units > 0) {
            parts.push(`${d10Units}d10`);
        }

        if (d10Tens > 0 || bonusCount > 0 || penaltyCount > 0) {
            // Addiere Bonus/Penalty Würfel zu den Zehner-Würfeln
            const totalTens = d10Tens + bonusCount + penaltyCount;
            let tensPart = `${totalTens}d10 Zehner`;
            
            // Zeige Bonus/Penalty in Klammern an, falls vorhanden
            if (bonusCount > 0 || penaltyCount > 0) {
                const modifiers = [];
                if (bonusCount > 0) {
                    const bonusLabel = game.i18n.localize(bonusCount === 1 ? "ROE.Roll.BonusDie" : "ROE.Roll.BonusDice");
                    modifiers.push(`${bonusCount} ${bonusLabel}`);
                }
                if (penaltyCount > 0) {
                    const penaltyLabel = game.i18n.localize(penaltyCount === 1 ? "ROE.Roll.PenaltyDie" : "ROE.Roll.PenaltyDice");
                    modifiers.push(`${penaltyCount} ${penaltyLabel}`);
                }
                
                if (modifiers.length > 0) {
                    tensPart += ` (${modifiers.join(", ")})`;
                }
            }
            
            parts.push(tensPart);
        }

        // Andere Würfel wie "3d6, 1d8"
        for (const die of otherDice) {
            const count = die.count || 1;
            
            if (count > 1) {
                parts.push(`${count}d${this.#extractDiceSides(die.label)}`);
            } else {
                parts.push(`1d${this.#extractDiceSides(die.label)}`);
            }
        }

        return parts.join(", ");
    }

    #extractDiceSides(label) {
        const matches = label.match(/D(\d+)/i);
        return matches ? matches[1] : "?";
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
    static async _onTogglePreparedTactical(event, target) {
        const sys = this.session;
        const key = target.dataset.flag;
        if (!game.user.isGM || !sys?.isPreparingModifiers || !["outnumbered", "surprised", "proneTarget"].includes(key)) return;
        const tacticalFlags = { ...sys.tacticalFlags, [key]: !sys.tacticalFlags?.[key] };
        await UniversalRollOrchestrator.updateSessionPatch(this._messageId, { tacticalFlags });
    }
    static async _onPublishPreparedRoll() {
        if (game.user.isGM) await UniversalRollOrchestrator.publishPreparedRoll(this._messageId);
    }
    static async _onSpendLuck(event, target) {
        const key = target.dataset.key || this.session?.participants?.[0]?.key;
        const cost = Number(target.dataset.cost);
        const newLevel = target.dataset.level;
        if (!key || !cost || !newLevel) return;
        await UniversalRollOrchestrator.executePostRollAction(this._messageId, key, "spendLuck", { cost, newLevel });
    }
    static async _onDeclineLuck(event, target) {
        const key = target.dataset.key || this.session?.participants?.[0]?.key;
        if (!key) return;
        await UniversalRollOrchestrator.executePostRollAction(this._messageId, key, "declineLuck");
    }
    static async _onPushRoll(event, target) {
        const sys = this.session;
        const key = target.dataset.key || sys?.participants?.[0]?.key;
        const participant = sys?.participants?.find((e) => e.key === key);
        if (!participant || !this._evaluateParticipantOptions(participant, sys).canPush) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("ROE.Roll.PushWarningTitle") },
            content: `<p>${game.i18n.localize("ROE.Roll.PushWarning")}</p>`,
            yes: { label: game.i18n.localize("ROE.Roll.PushRoll") },
            no: { label: game.i18n.localize("ROE.Roll.PushCancel") },
            rejectClose: false
        });
        if (!confirmed) return;
        const rollData = await AdapterRegistry.active.executePushRoll(this.session, key);
        if (rollData) {
            await UniversalRollOrchestrator.executePostRollAction(this._messageId, key, "pushRoll", { rollData });
        }
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
    static async _onAcknowledgePushFailure() {
        if (game.user.isGM) await UniversalRollOrchestrator.executePostRollAction(this._messageId, "p0", "acknowledgePushFailure");
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