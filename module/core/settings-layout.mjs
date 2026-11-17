import { MODULE_ID } from "./constants.mjs";

const SETTINGS_SECTIONS = [
    {
        label: "ROE.Settings.Sections.RollBehavior",
        keys: ["playerPromptPhaseMode", "autoApplyRollConsequences", "autoResolveCompletedRolls"]
    },
    {
        label: "ROE.Settings.Sections.PromptPresentation",
        keys: ["rollPromptResultDuration", "rollPromptTheme"]
    },
    {
        label: "ROE.Settings.Sections.PromptLayout",
        keys: ["rollPromptWidthPercent", "rollPromptPosition", "rollPromptStackDirection"]
    },
    {
        label: "ROE.Settings.Sections.Feedback",
        keys: ["fumbleSound", "criticalSound", "lowResourceSound", "enableVisualEffects"]
    }
];

/** Groups core settings into localized sections in Foundry's settings window. */
export class CoreSettingsLayout {
    /** Applies the settings sections to Foundry's rendered settings form. */
    static apply(html) {
        const root = html instanceof HTMLElement ? html : html?.[0];
        if (!root || root.querySelector(".roe-settings-heading")) return;

        const findGroup = (key) => root
            .querySelector(`[name="${MODULE_ID}.${key}"]`)
            ?.closest(".form-group") ?? null;
        const firstGroup = SETTINGS_SECTIONS
            .flatMap((section) => section.keys)
            .map(findGroup)
            .find(Boolean);
        if (!firstGroup) return;

        const placeholder = document.createComment("roe-settings-sections");
        firstGroup.before(placeholder);

        const fragment = document.createDocumentFragment();
        for (const section of SETTINGS_SECTIONS) {
            const groups = section.keys.map(findGroup).filter(Boolean);
            if (!groups.length) continue;

            const heading = document.createElement("h4");
            heading.className = "divider roe-settings-heading";
            heading.textContent = game.i18n.localize(section.label);
            fragment.append(heading, ...groups);
        }
        placeholder.replaceWith(fragment);
    }
}
