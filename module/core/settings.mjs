import { MODULE_ID } from "./constants.mjs";
import { RollPromptStackManager } from "./stack-manager.mjs";

export class CoreSettings {
    static register() {
        const soundSettings = [
            { key: "fumbleSound", name: "ROE.Settings.FumbleSound.Name", hint: "ROE.Settings.FumbleSound.Hint" },
            { key: "criticalSound", name: "ROE.Settings.CriticalSound.Name", hint: "ROE.Settings.CriticalSound.Hint" },
            { key: "lowResourceSound", name: "ROE.Settings.LowResourceSound.Name", hint: "ROE.Settings.LowResourceSound.Hint" }
        ];

        for (const s of soundSettings) {
            game.settings.register(MODULE_ID, s.key, {
                name: s.name,
                hint: s.hint,
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

        game.settings.register(MODULE_ID, "rollPromptResultDuration", {
            name: "ROE.Settings.RollPromptResultDuration.Name",
            hint: "ROE.Settings.RollPromptResultDuration.Hint",
            scope: "world",
            config: true,
            type: Number,
            default: 10
        });

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

        game.settings.register(MODULE_ID, "resultDisplayMode", {
            name: "ROE.Settings.ResultDisplayMode.Name",
            hint: "ROE.Settings.ResultDisplayMode.Hint",
            scope: "world",
            config: true,
            type: String,
            choices: {
                both: "ROE.Settings.ResultDisplayMode.Both",
                numbers: "ROE.Settings.ResultDisplayMode.Numbers",
                level: "ROE.Settings.ResultDisplayMode.Level"
            },
            default: "both"
        });

        game.settings.register(MODULE_ID, "successLevelFormat", {
            name: "ROE.Settings.SuccessLevelFormat.Name",
            hint: "ROE.Settings.SuccessLevelFormat.Hint",
            scope: "world",
            config: true,
            type: String,
            choices: {
                text: "ROE.Settings.SuccessLevelFormat.Text",
                symbols: "ROE.Settings.SuccessLevelFormat.Symbols"
            },
            default: "text"
        });

        game.settings.register(MODULE_ID, "autoApplyRollConsequences", {
            name: "ROE.Settings.AutoApplyConsequences.Name",
            hint: "ROE.Settings.AutoApplyConsequences.Hint",
            scope: "world",
            config: true,
            type: Boolean,
            default: true
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
}
