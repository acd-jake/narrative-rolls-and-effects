import { BasePromptApp } from "./base-prompt-app.mjs";

export class PromptClassFactory {
    static create(definition = {}) {
        return this.extend(BasePromptApp, definition);
    }

    static extend(ParentPromptClass, definition = {}) {
        const parentOptions = ParentPromptClass.DEFAULT_OPTIONS ?? {};
        const actions = { ...parentOptions.actions, ...definition.actions };
        const defaultOptions = { ...parentOptions, ...definition.defaultOptions, actions };

        return class GeneratedPromptApp extends ParentPromptClass {
            static DEFAULT_OPTIONS = defaultOptions;

            static PARTS = {
                prompt: { template: definition.template ?? ParentPromptClass.PARTS?.prompt?.template }
            };

            async _prepareContext(options) {
                const context = await super._prepareContext(options);
                return definition.prepareContext
                    ? definition.prepareContext.call(this, context, options)
                    : context;
            }

            _getPhases(sys) {
                return definition.getPhases
                    ? definition.getPhases.call(this, sys)
                    : super._getPhases(sys);
            }

            _buildPhaseSummary(sys) {
                return definition.buildPhaseSummary
                    ? definition.buildPhaseSummary.call(this, sys)
                    : super._buildPhaseSummary(sys);
            }

            _hasPendingPlayerAction() {
                return definition.hasPendingPlayerAction
                    ? definition.hasPendingPlayerAction.call(this)
                    : super._hasPendingPlayerAction();
            }

            _onRender(context, options) {
                super._onRender(context, options);
                definition.onRender?.call(this, context, options);
            }

            _onModifierSliderChange(value, participantKey) {
                return definition.onModifierSliderChange
                    ? definition.onModifierSliderChange.call(this, value, participantKey)
                    : super._onModifierSliderChange(value, participantKey);
            }
        };
    }
}
