# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-26

### Added

- Initial MVP release of `pathport` CLI and programmatic API.
- Read-only filesystem scanner (`scanRepository`) with symlink loop/escape detection, explicit exclusions, `maxDepth`, and `maxDiagnostics` bounds.
- Cross-platform rules `PP001`–`PP011` covering Windows reserved device names, trailing dots/spaces, invalid characters, case-insensitive collisions, Unicode NFC/NFD collisions, Git case-collision warnings, macOS colons, control characters, path length limits, and symlink escapes/loops/broken links.
- Human-readable text reporter and stable JSON reporter (`schemaVersion: "1.0.0"`).
- Comprehensive `node:test` unit and integration suite.
