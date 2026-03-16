---
gsd_state_version: 1.0
milestone: v13.0
milestone_name: Conector Gmail
status: active
last_updated: "2026-03-16T19:53:41.000Z"
last_activity: 2026-03-16 — Completed 50-01-PLAN.md (dependencies, types, crypto, DB, EmailService)
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 3
  completed_plans: 1
---

# Project State

## Current Position

Phase: 50 — EmailService + Conector Gmail App Password
Plan: 50-02 (next)
Status: Plan 50-01 complete, ready for 50-02
Last activity: 2026-03-16 — Completed 50-01 (dependencies, types, crypto, DB, EmailService)

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-16)

**Core value:** Turn scattered source documents into a structured, searchable knowledge base with natural language chat.
**Current focus:** v13.0 Conector Gmail — envio de email real via Gmail con App Password/OAuth2, wizard UI, CatBot tools

## Milestone History

### v1.0 — Fix RAG Chat + Mejoras de indexacion (COMPLETE)
- 2 phases, 14 requirements, all complete

### v2.0 — Sistema de Tareas Multi-Agente (COMPLETE)
- 6 phases, 48 requirements, all complete
- Data model, API CRUD, execution engine, task list, wizard, execution view

### v3.0 — Conectores + Dashboard de Operaciones (COMPLETE)
- 6 phases (9-14), 48 requirements, all complete

### v4.0 — Rebranding + CatBot + MCP Bridge + UX Polish (COMPLETE)
- 8 phases (15-22), 52 requirements, all complete

### v5.0 — Canvas Visual de Workflows (COMPLETE)
- 4 phases (23-26), 52 requirements, all complete

### v6.0 — Testing Inteligente + Performance + Estabilizacion (PARTIAL)
- 5 phases allocated (27-31), phase 27 complete (resilience foundations)
- Phases 28-31 superseded by v7.0 detailed spec

### v7.0 — Streaming + Testing + Logging + Notificaciones (COMPLETE)
- 6 phases (32-37), 53 requirements, all complete

### v8.0 — CatBot Diagnosticador + Base de Conocimiento (COMPLETE)
- 1 phase (38), 15 requirements, all complete

### v9.0 — CatBrains (COMPLETE)
- 3 phases (39-41), 23 requirements, all complete

### v10.0 — CatPaw: Unificacion de Agentes (COMPLETE)
- 6 phases (42-47), 50 requirements, all complete

### v11.0 — LinkedIn MCP Connector (COMPLETE)
- 1 phase (47), 7 requirements, all complete

### v12.0 — WebSearch CatBrain (COMPLETE)
- 2 phases (48-49), 28 requirements, all complete

## Decisions

- [50-01] AES-256-GCM with scryptSync for credential encryption (CONNECTOR_SECRET env var)
- [50-01] Default fallback key for dev environments without CONNECTOR_SECRET
- [50-01] Gmail connector type added alongside existing email type (not replacing)
- [50-01] App Password spaces auto-stripped on decrypt for copy-paste tolerance

## Accumulated Context

### v13.0 — Key patterns for Gmail Connector
- Nodemailer: libreria Node.js estandar para envio de emails, npm install nodemailer @types/nodemailer
- googleapis: necesario para OAuth2 flow, npm install googleapis
- AES-256-GCM: cifrado de credenciales con CONNECTOR_SECRET env var, crypto.scryptSync para derivar clave
- App Password: 16 chars, requiere 2FA, smtp.gmail.com:587 (personal) o smtp-relay.gmail.com:587 (workspace)
- OAuth2 OOB: urn:ietf:wg:oauth:2.0:oob para apps self-hosted sin redirect URL
- gmail_subtype column: null (existentes), 'gmail_personal', 'gmail_workspace'
- Rate limit: 500/dia personal, 2000/dia workspace, 10000/dia smtp-relay
- Delay anti-spam: 1s entre envios del mismo conector en executor

### Existing patterns (inherited)
- Sidebar items: Dashboard, CatBrains, CatPaw, Skills, Tareas, Canvas, Conectores, Notificaciones, [Testing], Configuracion, Estado del Sistema
- crypto.randomUUID NOT available in HTTP — use generateId() helper
- DB pattern: CREATE TABLE IF NOT EXISTS + ALTER TABLE try-catch
- process.env: use bracket notation process['env']['VAR']
- Colors: Primary mauve (#8B6D8B), accent violet-500/600, bg zinc-950
- withRetry for all external service calls
- In-memory TTL cache (Map-based)
- Servicio systemd en host: como Host Agent (3501), OpenClaw (18789), LinkedIn MCP (8765)
- Condicionalidad: tarjetas /system y footer dots solo si variable de entorno configurada
