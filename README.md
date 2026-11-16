# Narrative Rolls and Effects

An extensible Foundry VTT v14 module that provides synchronized, multi-phase roll prompts, interactive chat cards, visual effects, and audio cues.

## Features

- Docked `ApplicationV2` roll prompts with synchronized session state.
- System adapters registered through the `nre.registerAdapters` hook.
- Core dice visualization and dice-face assets, with adapter-provided extensions for system-specific dice.
- Declarative prompt class creation and extension through `PromptClassFactory`.
- GM roll requests, modifier preparation, actor selection, and configurable result presentation.
- Client-side vignettes, result pulses, screen shake, token particles, and audio cues.
- System-scoped prompt and chat-card styling through `data-nre-system`.

System-specific rules, templates, and assets are provided by companion modules. The core module does not import system plugins directly.
Adapters can extend the core dice visuals by implementing `extendDiceVisuals(dice, session, modifierDice)`.

## Installation

1. Install Narrative Rolls and Effects from its manifest.
2. Enable it in the world's Module Management settings.
3. Install and enable any companion module required by the active game system.

## Configuration

Configure audio cues, visual effects, and prompt layout under **Configure Settings -> Narrative Rolls and Effects**. System-specific options are provided by companion modules.

## License

This is an independent community project and is not affiliated with any game publisher.
