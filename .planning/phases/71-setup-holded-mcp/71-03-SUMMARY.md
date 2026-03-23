---
phase: 71
plan: 03
subsystem: holded-mcp
tags: [systemd, deployment, installer, holded]
dependency_graph:
  requires: [71-01, 71-02]
  provides: [holded-mcp-systemd-service, holded-mcp-installer]
  affects: [holded-mcp-deployment]
tech_stack:
  added: [systemd-user-service]
  patterns: [service-template-placeholders, bash-installer]
key_files:
  created:
    - scripts/holded-mcp/holded-mcp.service
    - scripts/holded-mcp/setup.sh
    - scripts/holded-mcp/README.md
  modified: []
decisions:
  - "RestartSec=5 (lighter than LinkedIn's 15s since no browser)"
  - "/usr/bin/node for ExecStart (more reliable than npx for systemd)"
  - "EnvironmentFile reads HOLDED_API_KEY from docflow app .env"
metrics:
  duration: 92s
  completed: "2026-03-23"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 71 Plan 03: Systemd Service + Script de Instalacion Summary

Systemd user service template with placeholder substitution and bash installer that clones, builds, validates Node >= 22, checks .env for API key, and registers the service.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Crear template de servicio systemd | 682acf8 | scripts/holded-mcp/holded-mcp.service |
| 2 | Crear setup.sh + README | 7833431 | scripts/holded-mcp/setup.sh, scripts/holded-mcp/README.md |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- [x] `scripts/holded-mcp/holded-mcp.service` exists with correct placeholders
- [x] `scripts/holded-mcp/setup.sh` is executable and has valid syntax
- [x] Script checks Node >= 22 before proceeding
- [x] Script checks for HOLDED_API_KEY in .env
- [x] Script installs and starts systemd service
- [x] README with clear instructions

## Self-Check: PASSED

- FOUND: scripts/holded-mcp/holded-mcp.service
- FOUND: scripts/holded-mcp/setup.sh
- FOUND: scripts/holded-mcp/README.md
- FOUND: commit 682acf8
- FOUND: commit 7833431
