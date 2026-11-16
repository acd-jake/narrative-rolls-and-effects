import { MODULE_ID } from "./core/constants.mjs";
import { CoreSettings } from "./core/settings.mjs";
import { AdapterRegistry } from "./core/adapter-registry.mjs";
import { UniversalRollOrchestrator } from "./core/orchestrator.mjs";
import { EffectsEngine } from "./core/effects-engine.mjs";
import { RollRequestComposerApp } from "./core/roll-request-composer-app.mjs";
import { PromptClassFactory } from "./core/prompt-factory.mjs";
import { SessionStore } from "./core/session-store.mjs";
import { RollVisibilityPolicy } from "./core/visibility-policy.mjs";
import { ActorTargetSelectorApp } from "./core/actor-target-selector-app.mjs";
import { DiceVisualizer } from "./core/dice-visualizer.mjs";

Hooks.once("init", async () => {
    CoreSettings.register();
    UniversalRollOrchestrator.registerHooks();
    EffectsEngine.registerHooks();

    await foundry.applications.handlebars.loadTemplates({
        roeModifierSlider: `modules/${MODULE_ID}/templates/core/prompts/partials/modifier-slider.hbs`,
        roeResultDefault: `modules/${MODULE_ID}/templates/core/prompts/partials/result-default.hbs`,
        roeRollResolvedResult: `modules/${MODULE_ID}/templates/core/prompts/partials/resolved-roll-result.hbs`,
        roeRollModifierPreparation: `modules/${MODULE_ID}/templates/core/prompts/partials/modifier-preparation.hbs`,
        roeDiceVisuals: `modules/${MODULE_ID}/templates/core/prompts/partials/dice-visuals.hbs`,
        roeDiceDisplay: `modules/${MODULE_ID}/templates/core/prompts/partials/dice-display.hbs`,
        roePushFailurePhase: `modules/${MODULE_ID}/templates/core/prompts/partials/push-failure-phase.hbs`,
        roePromptDescription: `modules/${MODULE_ID}/templates/core/prompts/partials/prompt-description.hbs`
    });

    Hooks.callAll("nre.registerAdapters", {
        registerAdapter: (systemId, adapter) => AdapterRegistry.register(systemId, adapter),
        createPromptClass: (definition) => PromptClassFactory.create(definition),
        extendPromptClass: (baseClass, definition) => PromptClassFactory.extend(baseClass, definition),
        session: SessionStore,
        orchestrator: UniversalRollOrchestrator,
        visibility: RollVisibilityPolicy,
        effects: EffectsEngine,
        actorSelector: ActorTargetSelectorApp,
        diceVisualizer: DiceVisualizer
    });
});

Hooks.once("ready", async () => {
    const adapter = AdapterRegistry.activate(game.system.id);
    if (!adapter) {
        console.warn(`${MODULE_ID} | No adapter registered for system "${game.system.id}".`);
    }

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
