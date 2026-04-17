# Phase 137 Signal Gate — 3x Reproducibility of Holded Q1 via Telegram

**Fecha del gate:** YYYY-MM-DD (a rellenar por verificador)
**Verificador humano:** [nombre]
**Milestone:** v27.0
**Requirement cerrado:** LEARN-01 (señal única)

## Pre-flight checks

- [ ] Docker rebuild hecho con todos los cambios de los plans 137-01..05
      ```bash
      docker compose build --no-cache && docker compose up -d && \
      docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && \
      docker restart docflow-app
      ```
      Evidencia: `docker images | grep docflow` (tag + SHA)
- [ ] Telegram bot respondiendo (test mínimo: enviar "ping" y recibir respuesta)
- [ ] CatPaws activos:
      - [ ] Consultor CRM / Filtro CRM / Analista de Leads (Holded MCP)
      - [ ] Maquetador Email (email_template connector)
      - [ ] Ejecutor Gmail (Gmail connector, OAuth2 válido)
- [ ] Conectores activos: Holded MCP, Email Templates, Gmail (cuenta Educa360 con OAuth2 vivo)
- [ ] Inbox `antonio@educa360.com` y `fen@educa360.com` accesibles al verificador humano
- [ ] Job table limpia de runs stuck previos:
      ```sql
      DELETE FROM intent_jobs
      WHERE status IN ('pending','strategist','decomposer','architect')
        AND updated_at < datetime('now','-1 hour');
      ```

## Prompt canónico (copiar y pegar EXACTO a Telegram)

```
Comparativa facturación Q1 2026 vs Q1 2025 de Holded, maquétala con el template corporativo y envíala a antonio@educa360.com y fen@educa360.com
```

## Checklist por run (aplica a RUN 1, 2 y 3)

1. Pegar el prompt canónico en Telegram al bot DocFlow.
2. Bot responde clasificando como **complex** y arranca pipeline async.
3. Pipeline produce propuesta formato LEARN-07: título + ~5-6 nodos con emojis + tiempo + botones ✅ Aprobar / ❌ Cancelar.
4. Pulsar ✅ Aprobar.
5. Esperar mensaje de finalización (timeout de cortesía: 3 min).
6. Verificar inbox `antonio@educa360.com`:
   - [ ] Asunto contiene "Q1 2025" y/o "Q1 2026"
   - [ ] Body HTML con template corporativo (no texto plano)
   - [ ] Tabla con cifras reales de ambos periodos (NO placeholders `{{...}}`, NO "Contenido principal del email")
   - [ ] Cifras coherentes con datos reales de Holded
7. Verificar inbox `fen@educa360.com` con las mismas checks.
8. **Check #9 — INC-12 wrapper-level closure (Option B sanity check del plan 137-01):**
   - [ ] Si el email llega: `connector_logs` del nodo Gmail contiene `response_payload.messageId` real (formato `<xxxxx@educa360.com>`), NO solo `{ok:true}`.
   - [ ] Si el email NO llega: `node_states` del nodo emitter tiene `output` que propaga el error del wrapper (p.ej. "no se pudo enviar — respuesta sin messageId"), **NO afirma** "enviado correctamente".
   - Si el agent emitter fabrica éxito sin que llegue el email → escape del wrapper → abrir INC nuevo + considerar Option A (executor post-hook) para v27.2.

---

## RUN 1 — Pre-137-07/08 attempts (FAILED — infrastructure issues)

### Attempt 1a — 2026-04-11 17:06 UTC (pre-137-07)

- **job_id:** `cbf6c55e-0f62-46fc-8d1f-faef9c275821`
- **pipeline_phase reached:** architect (iter 0)
- **status:** FAILED
- **error:** `SyntaxError: Unterminated string in JSON at position 4722`
- **failure_class:** `truncated_json` (classified post-facto)
- **root cause:** Architect LLM max_tokens=4096 insufficient for 7-node canvas JSON. Output truncated mid-string at 4722 chars.
- **fix applied:** Plan 137-07 (gap closure) — bumped default to 16000 + jsonrepair safety net + raw persistence. Commits: `c81ee66`, `f1414df`, `c543c0b`, `ac0f8e6`.

### Attempt 1b — 2026-04-11 17:45 UTC (post-137-07, pre-137-08)

- **job_id:** `8bb5e945-3b77-424c-8e24-903192998e5c`
- **pipeline_phase reached:** architect (QA iter 1 complete)
- **status:** FAILED
- **error:** `QA loop exhausted after 2 iterations; last recommendation=revise`
- **failure_class:** `qa_rejected`
- **architect outputs:** iter0=3729 chars, iter1=4200 chars (both parsed clean, no jsonrepair needed — truncation bug CONFIRMED FIXED)
- **QA scores:**

| Metric | Iter 0 | Iter 1 | Delta |
|--------|--------|--------|-------|
| quality_score | 70 | 85 | +15 |
| data_contract_score | 60 | 75 | +15 |
| instruction_quality_score | 75 | 80 | +5 |

- **QA iter 1 remaining issues:**
  - R01 major (n2, n3): extractors missing explicit JSON schema in OUTPUT section
  - R15 minor (n5): renderer receives unnecessary raw data
- **root cause:** QA iteration budget hardcoded at 2; architect improving (+15 per metric per iter) but not converging in 2 passes. Additionally, architect prompt lacked R01/R10/R15 reinforcement directives.
- **fix applied:** Plan 137-08 (gap closure) — QA budget bumped to 4 (dynamic override via config_overrides), architect prompt R01/R10/R15 reinforcement. Commits: `23cd3c9`, `92ad240`, `ee399a8`.

### RUN 1 — PENDING (post-137-08 rebuild)

- **request_id (intent_jobs):**
- **canvas_id:**
- **complexity_decision_id:**
- **outcome (complexity_decisions):** <!-- completed | cancelled | timeout -->
- **timestamp inicio:**
- **timestamp fin:**
- **messageId antonio@educa360.com:**
- **messageId fen@educa360.com:**
- **Checklist 1-7:** <!-- PASS / FAIL + detalles -->
- **Check #9 resultado:** <!-- PASS / FAIL + notas -->
- **Connector log dump (opcional):**
  ```json

  ```
- **Screenshots (opcional):**
- **Notas:**

## RUN 2 — YYYY-MM-DD HH:MM

- **request_id:**
- **canvas_id:**
- **complexity_decision_id:**
- **outcome:**
- **timestamp inicio:**
- **timestamp fin:**
- **messageId antonio:**
- **messageId fen:**
- **Checklist 1-7:**
- **Check #9 resultado:**
- **Connector log dump (opcional):**
  ```json

  ```
- **Screenshots (opcional):**
- **Notas:**

## RUN 3 — YYYY-MM-DD HH:MM

- **request_id:**
- **canvas_id:**
- **complexity_decision_id:**
- **outcome:**
- **timestamp inicio:**
- **timestamp fin:**
- **messageId antonio:**
- **messageId fen:**
- **Checklist 1-7:**
- **Check #9 resultado:**
- **Connector log dump (opcional):**
  ```json

  ```
- **Screenshots (opcional):**
- **Notas:**

---

## Failure triage (si algún run falla)

- **Runtime canvas (canvas-executor.ts, out-of-scope v27.0):** → nuevo INC en `deferred-items.md`, LEARN-01 como "partial — runtime bug X".
- **Design (prompt/data):** → regresar a 133/134/135 según matriz del gate 136.
- **Uno de los plans 137-01..05:** → gap closure plan dedicado.
- **Email no llega pero emitter afirma éxito:** escape del wrapper INC-12 Option B → nuevo INC + considerar Option A (executor post-hook) en v27.2.

## Decision

**GATE: [PENDING]** <!-- PASS | PARTIAL | FAIL -->

- 3/3 PASS → **GATE: PASS** → milestone **v27.0 CLOSED**
- 2/3 PASS con causa no-determinista documentada → **GATE: PARTIAL**, decidir cierre caso-a-caso
- <2/3 PASS → **GATE: FAIL**, diagnóstico + gap plan

**Firmado por:** ___________________ **Fecha:** __________
