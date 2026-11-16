import { BasicRollPromptApp } from "./basic-roll-prompt-app.mjs";
import { UniversalRollOrchestrator } from "../../../core/orchestrator.mjs";

/**
 * Specialized prompt for Call of Cthulhu 7e Skill, Characteristic, and Luck checks.
 * Inherits core 1d100 rolling, Luck expenditure, and Pushing from BasicRollPromptApp,
 * adding difficulty selection and automatic skill improvement checkmarks.
 */
export class SkillCheckPromptApp extends BasicRollPromptApp {
    static DEFAULT_OPTIONS = {
        actions: {
            setDifficulty: SkillCheckPromptApp.#onSetDifficulty
        }
    };

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const sys = this.session;
        const p = sys?.participants?.[0];

        const difficulty = sys?.difficulty || "regular";
        const baseTarget = Number(p?.targetValue ?? 0);
        const effectiveTarget = this._getDifficultyThreshold(baseTarget, difficulty);

        return {
            ...context,
            displayTarget: effectiveTarget,
            canChangeDifficulty: Boolean(sys?.canChangeDifficulty) && !p?.hasRolled && context.canRoll,
            difficultyLabel: game.i18n.localize(`ROE.Difficulty.${difficulty.capitalize()}`)
        };
    }

    /**
     * Cycles through Regular -> Hard -> Extreme difficulty and synchronizes it
     * across all participating clients via the session ChatMessage.
     */
    static async #onSetDifficulty() {
        const sys = this.session;
        const p = sys?.participants?.[0];
        if (!sys || p?.hasRolled || !sys.canChangeDifficulty) return;

        const order = ["regular", "hard", "extreme"];
        const next = order[(order.indexOf(sys.difficulty) + 1) % order.length];
        await UniversalRollOrchestrator.setSessionDifficulty(this._messageId, next);
    }
}
