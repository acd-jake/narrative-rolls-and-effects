import { SessionStore } from "../../../core/session-store.mjs";
import { BasicRollStrategy } from "./basic-roll-strategy.mjs";
import { SkillCheckPromptApp } from "../prompts/skill-check-prompt-app.mjs";

/**
 * Strategy for Call of Cthulhu 7e Skill, Characteristic, and Luck checks.
 * Opens SkillCheckPromptApp and automatically marks Skill items for improvement upon success.
 */
export class SkillRollStrategy extends BasicRollStrategy {
  /** @override */
  renderPrompt(options) {
    new SkillCheckPromptApp(options).render(true);
  }

  /** @override */
  async onRollApplied(participant, state) {
    await super.onRollApplied(participant, state);
    if (!participant?.isSuccess || !participant?.itemId) return;

    const actor =
      SessionStore.resolveActor(participant);
    const item = actor?.items.get(participant.itemId);

    if (item?.type === "skill" && !item.system.flags?.developement) {
      await item.update({ "system.flags.developement": true });
    }
  }
}
