import { MODULE_ID } from "./constants.mjs";
import { RollPromptStackManager } from "./stack-manager.mjs";
import { SessionHooks } from "./session-hooks.mjs";

/** Registers configuration settings shared by the core roll system. */
export class CoreSettings {
    /** Registers all core module settings with Foundry. */
    static register() {
        this.#registerRollBehaviorSettings();
        this.#registerPromptPresentationSettings();
        this.#registerPromptLayoutSettings();
        this.#registerFeedbackSettings();
    }

    static #registerRollBehaviorSettings() {
        game.settings.register(MODULE_ID, "playerPromptPhaseMode", {
            name: "ROE.Settings.PlayerPromptPhaseMode.Name",
            hint: "ROE.Settings.PlayerPromptPhaseMode.Hint",
            scope: "world",
            config: true,
            type: String,
            default: "all",
            choices: {
                all: "ROE.Settings.PlayerPromptPhaseMode.All",
                active: "ROE.Settings.PlayerPromptPhaseMode.Active"
            }
        });

        game.settings.register(MODULE_ID, "autoApplyRollConsequences", {
            name: "ROE.Settings.AutoApplyConsequences.Name",
            hint: "ROE.Settings.AutoApplyConsequences.Hint",
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        });

        game.settings.register(MODULE_ID, "autoResolveCompletedRolls", {
            name: "ROE.Settings.AutoResolveCompletedRolls.Name",
            hint: "ROE.Settings.AutoResolveCompletedRolls.Hint",
            scope: "world",
            config: true,
            type: Boolean,
            default: false
        });
    }

    static #registerPromptPresentationSettings() {
        game.settings.register(MODULE_ID, "rollPromptResultDuration", {
            name: "ROE.Settings.RollPromptResultDuration.Name",
            hint: "ROE.Settings.RollPromptResultDuration.Hint",
            scope: "world",
            config: true,
            type: Number,
            default: 10
        });

        game.settings.register(MODULE_ID, "rollPromptTheme", {
            name: "ROE.Settings.RollPromptTheme.Name",
            hint: "ROE.Settings.RollPromptTheme.Hint",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "western": "ROE.Settings.RollPromptTheme.Western",
                "fantasy": "ROE.Settings.RollPromptTheme.Fantasy",
                "dark-fantasy": "ROE.Settings.RollPromptTheme.DarkFantasy",
                "noir": "ROE.Settings.RollPromptTheme.Noir",
                "science-fiction": "ROE.Settings.RollPromptTheme.SciFi",
                "cyberpunk": "ROE.Settings.RollPromptTheme.Cyberpunk",
                "cosmic-horror": "ROE.Settings.RollPromptTheme.CosmicHorror",
                "art-deco": "ROE.Settings.RollPromptTheme.ArtDeco"
            },
            default: "western"
        });
    }

    static #registerPromptLayoutSettings() {
        game.settings.register(MODULE_ID, "rollPromptWidthPercent", {
            name: "ROE.Settings.RollPromptWidth.Name",
            hint: "ROE.Settings.RollPromptWidth.Hint",
            scope: "client",
            config: true,
            type: Number,
            range: { min: 10, max: 35, step: 1 },
            default: 15,
            onChange: () => RollPromptStackManager.reflow()
        });

        game.settings.register(MODULE_ID, "rollPromptPosition", {
            name: "ROE.Settings.RollPromptPosition.Name",
            hint: "ROE.Settings.RollPromptPosition.Hint",
            scope: "client",
            config: true,
            type: String,
            choices: {
                "sidebar-left": "ROE.Settings.RollPromptPosition.Choices.SidebarLeft",
                "players-top": "ROE.Settings.RollPromptPosition.Choices.PlayersTop"
            },
            default: "sidebar-left",
            onChange: () => RollPromptStackManager.reflow()
        });

        game.settings.register(MODULE_ID, "rollPromptStackDirection", {
            name: "ROE.Settings.RollPromptStackDirection.Name",
            hint: "ROE.Settings.RollPromptStackDirection.Hint",
            scope: "client",
            config: true,
            type: String,
            choices: {
                vertical: "ROE.Settings.RollPromptStackDirection.Choices.Vertical",
                horizontal: "ROE.Settings.RollPromptStackDirection.Choices.Horizontal"
            },
            default: "vertical",
            onChange: () => RollPromptStackManager.reflow()
        });

        game.settings.register(MODULE_ID, "maxOpenResolvedPrompts", {
            name: "ROE.Settings.MaxOpenResolvedPrompts.Name",
            hint: "ROE.Settings.MaxOpenResolvedPrompts.Hint",
            scope: "client",
            config: true,
            type: Number,
            range: { min: 0, max: 10, step: 1 },
            default: 0,
            onChange: () => SessionHooks.syncResolvedTimers()
        });

    }

    static #registerFeedbackSettings() {
        const soundSettings = [
            { key: "fumbleSound", name: "ROE.Settings.FumbleSound.Name", hint: "ROE.Settings.FumbleSound.Hint" },
            { key: "criticalSound", name: "ROE.Settings.CriticalSound.Name", hint: "ROE.Settings.CriticalSound.Hint" },
            { key: "lowResourceSound", name: "ROE.Settings.LowResourceSound.Name", hint: "ROE.Settings.LowResourceSound.Hint" }
        ];

        for (const setting of soundSettings) {
            game.settings.register(MODULE_ID, setting.key, {
                name: setting.name,
                hint: setting.hint,
                scope: "world",
                config: true,
                type: String,
                default: "",
                filePicker: "audio"
            });
        }

        game.settings.register(MODULE_ID, "enableVisualEffects", {
            name: "ROE.Settings.EnableVisualEffects.Name",
            hint: "ROE.Settings.EnableVisualEffects.Hint",
            scope: "client",
            config: true,
            type: Boolean,
            default: true
        });
    }
}
