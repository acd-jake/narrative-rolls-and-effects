import { MODULE_ID } from "./core/constants.mjs";
import { CoreSettings } from "./core/settings.mjs";
import { AdapterRegistry } from "./core/adapter-registry.mjs";
import { UniversalRollOrchestrator } from "./core/orchestrator.mjs";
import { EffectsEngine } from "./core/effects-engine.mjs";
import { RollRequestComposerApp } from "./core/roll-request-composer-app.mjs";
import { CoC7Adapter } from "./systems/coc7/coc7-adapter.mjs";

Hooks.once("init", () => {
    CoreSettings.register();

    // System-Adapter registrieren (später hier einfach Pf2eAdapter ergänzen)
    AdapterRegistry.register("CoC7", new CoC7Adapter());

    UniversalRollOrchestrator.registerHooks();
    EffectsEngine.registerHooks();

    foundry.applications.handlebars.loadTemplates({
        roeSkillDifficultyControls: `modules/${MODULE_ID}/templates/core/prompts/partials/skill-difficulty-controls.hbs`,
        roeSanityLossControls: `modules/${MODULE_ID}/templates/core/prompts/partials/sanity-loss-controls.hbs`,
        roeModifierSlider: `modules/${MODULE_ID}/templates/core/prompts/partials/modifier-slider.hbs`,
        roeResultDefault: `modules/${MODULE_ID}/templates/core/prompts/partials/result-default.hbs`,
        roeResultSanity: `modules/${MODULE_ID}/templates/core/prompts/partials/result-sanity.hbs`,
        roeResultCombat: `modules/${MODULE_ID}/templates/core/prompts/partials/result-combat.hbs`,
        roeRollResolvedResult: `modules/${MODULE_ID}/templates/core/prompts/partials/resolved-roll-result.hbs`,
        roeRollModifierPreparation: `modules/${MODULE_ID}/templates/core/prompts/partials/modifier-preparation.hbs`,
        roeDiceVisuals: `modules/${MODULE_ID}/templates/core/prompts/partials/dice-visuals.hbs`,
        roeDiceDisplay: `modules/${MODULE_ID}/templates/core/prompts/partials/dice-display.hbs`,
        roePushFailurePhase: `modules/${MODULE_ID}/templates/core/prompts/partials/push-failure-phase.hbs`,
        roePromptDescription: `modules/${MODULE_ID}/templates/core/prompts/partials/prompt-description.hbs`,
        roePromptLayout: `modules/${MODULE_ID}/templates/core/prompts/partials/prompt-layout.hbs`
    });
});

Hooks.once("ready", async () => {
    const adapter = AdapterRegistry.activate(game.system.id);
    if (!adapter) {
        console.warn(`${MODULE_ID} | Kein Adapter für System "${game.system.id}" registriert.`);
    }

    // Toast-Benachrichtigungen für aktive Session-Karten unterdrücken
    const originalNotify = ui.chat.notify.bind(ui.chat);
    ui.chat.notify = function (message, options) {
        if (message.getFlag(MODULE_ID, "noToast")) return;
        return originalNotify(message, options);
    };
});

Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user?.isGM) return;

    const tokenLayer = controls.tokens ?? Object.values(controls).find((c) => c.layer === "tokens");
    if (!tokenLayer?.tools) return;

    const toolConfig = {
        name: "roeRollRequest",
        title: "ROE.RollRequest.OpenBtn",
        icon: "fa-solid fa-dice-d20",
        order: Object.keys(tokenLayer.tools).length,
        button: true,
        visible: true,
        onChange: () => {
            if (!AdapterRegistry.active) return;
            const existing = foundry.applications.instances.get("roe-roll-request-composer");
            if (existing) {
                existing.render({ force: true });
            } else {
                new RollRequestComposerApp().render({ force: true });
            }
        }
    };

    if (Array.isArray(tokenLayer.tools)) {
        tokenLayer.tools.push(toolConfig);
    } else {
        tokenLayer.tools.roeRollRequest = toolConfig;
    }
});
