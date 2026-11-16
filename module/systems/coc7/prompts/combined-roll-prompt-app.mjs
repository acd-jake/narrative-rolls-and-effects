import { SessionStore } from "../../../core/session-store.mjs";
import { BasePromptApp } from "../../../core/base-prompt-app.mjs";
import { UniversalRollOrchestrator } from "../../../core/orchestrator.mjs";
import { CoC7CheckResolver } from "../coc7-check-resolver.mjs";
import { RollVisibilityPolicy } from "../../../core/visibility-policy.mjs";

export class CombinedRollPromptApp extends BasePromptApp {
    static DEFAULT_OPTIONS = {
        actions: {
            executeCombinedRoll: CombinedRollPromptApp.#onExecuteCombinedRoll
        }
    };

    static PARTS = {
        prompt: {
            template: "modules/narrative-rolls-and-effects/templates/prompts/combined-roll-prompt.hbs"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const sys = this.session;
        const [first, second] = sys?.participants ?? [];

        const firstOpts = this._evaluateParticipantOptions(first, sys);
        const secondOpts = this._evaluateParticipantOptions(second, sys);

        // Push is available if the combined check failed overall and neither part was pushed yet
        const overallPassed =
            sys?.combinedMode === "or"
                ? Boolean(first?.isSuccess || second?.isSuccess)
                : Boolean(first?.isSuccess && second?.isSuccess);

        const canPushCombined = Boolean(
            first?.hasRolled &&
            !sys?.isResolved &&
            !overallPassed &&
            (firstOpts.canPush || secondOpts.canPush)
        );

        const modDice = sys?.participants?.[0]?.modifierDice ?? 0;

        return {
            ...context,
            actorName: first?.actorName?.toUpperCase() ?? "",
            combinedModeLabel: game.i18n.localize(
                sys?.combinedMode === "or" ? "ROE.RollSession.ModeOr" : "ROE.RollSession.ModeAnd"
            ),
            first: first ? { ...first, ...firstOpts } : null,
            second: second ? { ...second, ...secondOpts } : null,
            canPushCombined,
            modifierDice: modDice,
            canRoll: Boolean(first && !first.hasRolled && (game.user.isGM || SessionStore.resolveActor(first)?.isOwner)),
            isDelegatedToPlayer: this._isDelegatedToActivePlayer(first)
        };
    }

    static async #onExecuteCombinedRoll() {
        const sys = this.session;
        const [first, second] = sys?.participants ?? [];
        if (!first || !second || first.hasRolled) return;

        const modifierDice = first.modifierDice ?? 0;
        const formula = CoC7CheckResolver.buildRollFormula(modifierDice);
        const roll = await new Roll(formula).evaluate();
        const total = roll.total === 0 ? 100 : roll.total;
        const rank = CoC7CheckResolver.LEVEL_RANK;
        const reqRank = rank[sys.difficulty] ?? 2;

        for (const part of [first, second]) {
            const successLevel = CoC7CheckResolver.evaluateResult(total, part.targetValue);
            const isSuccess = (rank[successLevel] ?? 0) >= reqRank;
            const rollBreakdown = CoC7CheckResolver.buildBreakdown(roll, Number(part.targetValue), successLevel, { modifierDice });

            await UniversalRollOrchestrator.submitParticipantRoll(this._messageId, part.key, {
                total,
                successLevel,
                isSuccess,
                modifierDice,
                rollMode: RollVisibilityPolicy.getCurrentRollMode(),
                rollerUserId: game.user.id,
                rollBreakdown
            });
        }
    }
}
