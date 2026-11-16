import { BasicRollPromptApp } from "./basic-roll-prompt-app.mjs";
import { UniversalRollOrchestrator } from "../../../core/orchestrator.mjs";

export class SkillCheckPromptApp extends BasicRollPromptApp {
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
            difficulty: game.i18n.localize(`ROE.Difficulty.${difficulty.capitalize()}`)
        };
    }
}
