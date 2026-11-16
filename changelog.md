# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to Semantic Versioning.

## [Unreleased]

### Added
- Hook-based adapter registration and a declarative prompt class factory.
- System-scoped chat cards and adapter-provided request composer forms.
- Adapter-selected modifier-preparation header and details within the core-managed prompt.

### Changed
- The core module now provides system-neutral roll prompts, session handling, and visual effects.
- System-specific integrations are loaded through companion modules.
- System-specific result-display settings are owned by companion modules.
