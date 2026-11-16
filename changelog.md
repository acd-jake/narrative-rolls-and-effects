# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org).

## [Unreleased]

### Changed
- Renamed module to Narrative Rolls and Effects (`narrative-rolls-and-effects`).
- Removed duplicate optional Luck improvement setting and wired Luck improvement directly to the `CoC7` system setting.

### Added
- System-agnostic core roll overlay engine with docked `ApplicationV2` prompt windows, synchronized chat cards, and socket transport.
- Visual effects engine supporting full-screen vignettes, critical/fumble pulses, screen shake, token particle bursts, and configurable sound cues.
- Call of Cthulhu 7e (`CoC7`) system adapter supporting skill, characteristic, Luck, Sanity, combined, opposed, melee, and ranged combat prompts.
- Character sheet click interception and journal enricher link interception for `CoC7`.
- GM Roll Request Composer in the token scene controls and GM modifier preparation mode (`Shift` + click).
- Actor Target Selector dialog with quick toggles for all PCs and all NPCs when triggering journal roll links without a selected token.
- English and German localizations (`en`, `de`).
