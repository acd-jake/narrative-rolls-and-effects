# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to Semantic Versioning.

## [0.2.0] - 2026-11-20

### Added
- Highlight the focused roll prompt and bring it visually to the front when interacting with it.

## [0.1.1] - 2026-11-20

### Added
- Drag prompt windows out of the dock and return them by dropping them in the dock area.
- Keep prompts within the viewport while dragging, resizing, or expanding their content.

## [0.1.0] - 2026-11-19

### Added
- Allow system adapters to handle GM-only decisions about pending consequences.
- Added the opt-in `autoResolveCompletedRolls` world setting to resolve completed sessions when no decisions or consequences remain.
- Hook-based adapter registration and a declarative prompt class factory.
- System-scoped chat cards and adapter-provided request composer forms.
- Adapter-selected modifier-preparation header and details within the core-managed prompt.
- Formula-based dice visuals and system-registerable particle presets.
- A shared modifier summary for system prompts.
- Adapter-selected header and body partials for resolved roll prompts via `getResolvedResultPartials(session)`.
- Added a bottom-right countdown badge on resolved roll prompts showing the remaining seconds until automatic closing.
- Client setting (`rollPromptStackDirection`) to stack roll prompts either vertically (bottom to top) or horizontally (from the outer screen edge inward).
- Client setting (`maxOpenPrompts`) to cap the total number of simultaneously open roll prompts, automatically closing the oldest prompt window when exceeded even if unresolved.
- Client setting (`maxOpenResolvedPrompts`) to keep a configurable number of resolved prompts open without starting their auto-close timer until newer resolved prompts exceed the limit, plus click-to-pin on resolved prompts.
- Chronological sequence numbers in parentheses after prompt titles whenever multiple prompts are open or a prompt's number exceeds 1, resetting to 1 once all prompts are closed.
- Automatic multi-column wrapping when vertically stacked roll prompts reach the top edge of the viewport.

### Changed
- Resolved chat cards can display the same results as their system's prompts.
- Organized the module settings into logical sections in Foundry's settings window.
- The core module now provides system-neutral roll prompts, session handling, and visual effects.
- System-specific integrations are loaded through companion modules.
- System-specific result-display settings are owned by companion modules.
- Kept player roll prompts open until session resolution and provided `getPlayerWaitingHint(session)` with a core fallback message.
- Allowed adapters to format participant chat badges for revealed roll phases independently of roll-detail visibility, while restricting roll-breakdown inspection to authorized viewers.
- Displayed rolled face values directly on the dice icons inside the roll-inspection drawer, highlighting kept versus dropped modifier dice.
- Made the prompt close button (`×`) opaque, higher-contrast, and clickable across its entire hit area.

### Removed
- Moved system-specific rules, prompt templates, and bonus/penalty dice assets out of the core module.
