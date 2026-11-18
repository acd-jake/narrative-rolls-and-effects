# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to Semantic Versioning.

## [Unreleased]

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

### Changed
- Resolved chat cards can display the same results as their system's prompts.
- Organized the module settings into logical sections in Foundry's settings window.
- The core module now provides system-neutral roll prompts, session handling, and visual effects.
- System-specific integrations are loaded through companion modules.
- System-specific result-display settings are owned by companion modules.
- Kept player roll prompts open until session resolution and provided `getPlayerWaitingHint(session)` with a core fallback message.
- Allowed adapters to format participant chat badges for revealed roll phases independently of roll-detail visibility, while restricting roll-breakdown inspection to authorized viewers.

### Removed
- Moved system-specific rules, prompt templates, and bonus/penalty dice assets out of the core module.
