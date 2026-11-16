# Narrative Rolls and Effects

An extensible Foundry VTT module that replaces standard roll dialogs with multi-phase, docked roll prompt overlays, interactive chat cards, screen vignettes, token particle bursts, and atmospheric audio cues.

## Features

- **Docked Multi-Phase Roll Prompts**: Interactive `ApplicationV2` prompt windows that dock cleanly to the sidebar or players list and synchronize state across all connected clients.
- **Complete Call of Cthulhu 7e Integration**:
  - Intercepts skill, characteristic, Luck, Sanity, and weapon rolls directly from the character sheet as well as journal enricher links.
  - Supports multi-phase melee and ranged combat (attack, defender reaction/cover, damage, and automatic or GM-confirmed consequences).
  - Supports Sanity checks with automatic loss evaluation, follow-up Intelligence checks, and temporary/indefinite insanity triggers.
  - Supports Spending Luck, Pushing rolls with consequence steps, Combined rolls (AND/OR), and Opposed rolls.
- **GM Roll Request & Actor Selector**:
  - Dedicated scene control tool to request skill, Sanity, combined, opposed, or custom dice rolls from any actor.
  - Automatic actor selection prompt when triggering journal links without a selected token, including quick toggles for all PCs and all NPCs.
  - Hold `Shift` when initiating a roll as GM to prepare bonus/penalty dice and tactical modifiers before releasing the prompt to players.
- **Visual & Audio Effects**:
  - Full-screen vignettes reacting to low Sanity thresholds, brief screen pulses on criticals and fumbles, screen shake on fumbles, and PIXI particle bursts on affected tokens.
  - Configurable sound effects for critical successes, fumbles, and low resource warnings.
- **System-Agnostic Core Architecture**: Built around a decoupled core engine (`module/core/`) and pluggable system adapters (`module/systems/`), ready for upcoming Pathfinder 2e (`pf2e`) support.

## Supported Systems

- **Call of Cthulhu 7th Edition (`CoC7`)**: Supported
- **Pathfinder 2nd Edition (`pf2e`)**: Planned

## Installation

1. Open Foundry VTT (v14+) and navigate to the **Add-on Modules** tab.
2. Click **Install Module** and paste the manifest URL into the **Manifest URL** field.
3. Activate **Narrative Rolls and Effects** inside your world's **Module Management** settings.

## Configuration

All options can be customized under **Configure Settings -> Narrative Rolls and Effects**:

- **Audio Cues**: Configure custom audio files for Fumbles, Critical Successes, and Low Sanity alerts.
- **Visual Effects**: Toggle screen vignettes, critical/fumble pulses, and screen shake per client.
- **Prompt Layout**: Adjust prompt width percentage, dock position (next to sidebar or above players list), post-resolution display duration, and whether players see all phases or only their active phase.
- **Result Formatting**: Display numeric values, success levels (as text or compact symbols), or both.
- **Automation & Optional Rules**: Toggle automatic application of HP/Sanity consequences.

## License

This module is an independent community project and is not affiliated with, endorsed, or sponsored by Chaosium Inc. or Paizo Inc.
