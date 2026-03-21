---
phase: 61-export-system
plan: "03"
subsystem: export-templates
tags: [docker, install, runner, templates, bundle]
dependency_graph:
  requires: [61-01]
  provides: [docker-compose-template, install-scripts, runner-html, bundle-templates]
  affects: [bundle-generator]
tech_stack:
  added: []
  patterns: [template-generator-functions, string-template-composition]
key_files:
  created:
    - app/src/lib/export-templates/docker-compose.yml.ts
    - app/src/lib/export-templates/install-scripts.ts
    - app/src/lib/export-templates/runner-html.ts
    - app/src/lib/export-templates/export-templates.test.ts
  modified:
    - app/src/lib/services/bundle-generator.ts
decisions:
  - "Template generators are pure functions returning strings -- no side effects, easy to test"
  - "escapeHtml in runner-html.ts prevents XSS in embedded task names"
  - "App version read from package.json with try-catch fallback to 0.1.0"
metrics:
  duration: "221s"
  completed: "2026-03-21"
  tasks: 4
  files: 5
---

# Phase 61 Plan 03: Docker Templates + Install Scripts + Runner HTML Summary

Export bundle template generators with pinned Docker image tags, cross-platform install scripts, and dark-themed runner HTML with 2s polling.

## Tasks Completed

| Task | Description | Commit | Key Files |
|------|-------------|--------|-----------|
| 1 | Docker compose + install script templates | 3c08d1f | docker-compose.yml.ts, install-scripts.ts |
| 2 | Runner HTML template (dark theme, polling) | c4df894 | runner-html.ts |
| 3 | Bundle generator integration + tests | 1c5b8d1 | bundle-generator.ts, export-templates.test.ts |
| 4 | Build validation | -- | vitest 11/11 pass, tsc clean for our files |

## What Was Built

### Docker Compose Template (`docker-compose.yml.ts`)
- `generateDockerCompose(services, credentials, appVersion)` -- conditional service blocks
- Pinned image tags: docflow/app:v{version}, litellm:1.63.14, qdrant:v1.12.6, ollama:0.5.7
- No `build:` directives -- all `image:` references

### Install Scripts (`install-scripts.ts`)
- `generateInstallSh()` -- Bash: checks docker/compose, runs wizard, pulls, starts
- `generateInstallPs1()` -- PowerShell: same flow with Write-Host, Get-Command
- `generateSetupWizard(credentials)` -- Node.js readline script: prompts for each credential, writes docker/.env

### Runner HTML (`runner-html.ts`)
- `generateRunnerHtml(taskId, taskName)` -- standalone HTML page
- Dark theme (#0a0a0a bg, #7c3aed violet accent)
- POST execute, GET status polling every 2s via setInterval
- Step progress with colored left borders (pending=gray, running=amber, completed=green, failed=red)
- Progress bar, result display, download button
- XSS protection via escapeHtml on task name/id

### Bundle Generator Integration
- All template imports added to bundle-generator.ts
- ZIP now includes: docker/docker-compose.yml, install/install.sh, install/install.ps1, install/setup-wizard.js, runner/index.html
- App version read from package.json with fallback

### Tests
- 11 unit tests covering all generators
- Docker compose: service inclusion, version pinning, credential mapping
- Install scripts: Docker check, compose commands, credential prompts
- Runner HTML: task ID, polling interval, theme colors, XSS escaping

## Deviations from Plan

None -- plan executed exactly as written.

## Notes

- Pre-existing build failure exists in `bundle-importer.ts` (unused variable `_agentIdMap`). Not caused by this plan. Logged to deferred-items.md.
- TypeScript compilation for all files in this plan is clean (`tsc --noEmit` shows zero errors in our files).

## Self-Check: PASSED

All 5 files found. All 3 commits verified.
