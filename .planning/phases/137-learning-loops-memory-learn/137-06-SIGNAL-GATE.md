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

## RUN 1 — YYYY-MM-DD HH:MM

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
