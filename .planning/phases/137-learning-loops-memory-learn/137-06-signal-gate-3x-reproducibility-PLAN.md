---
phase: 137-learning-loops-memory-learn
plan: 06
type: execute
wave: 4
depends_on: [137-01, 137-02, 137-03, 137-04, 137-05]
files_modified:
  - .planning/phases/137-learning-loops-memory-learn/137-06-SIGNAL-GATE.md
autonomous: false
requirements: [LEARN-01]
must_haves:
  truths:
    - "El usuario envía por Telegram 'Comparativa facturación Q1 2026 vs Q1 2025 de Holded, maquétala con el template corporativo y envíala a antonio@educa360.com y fen@educa360.com'"
    - "El sistema clasifica como complex y corre el pipeline async sin intervención"
    - "El architect produce un canvas con roles declarados y sin R10 falsos positivos"
    - "El usuario recibe la propuesta por Telegram con el formato LEARN-07 (título + nodos + tiempo)"
    - "El usuario aprueba tocando el botón ✅ Aprobar"
    - "El canvas ejecuta extractores Holded → merge → comparador → renderer → Gmail sin fallos de runtime"
    - "Ambos destinatarios reales reciben un email con template HTML corporativo y cifras reales de Q1 2025 y Q1 2026"
    - "Si en algún run el wrapper Gmail falla (args incompletos o response sin messageId), el agent emitter propaga el error en su output textual — NO fabrica 'enviado correctamente' (verificación de cierre INC-12 a nivel wrapper per plan 137-01 Option B)"
    - "Este flujo completo es REPRODUCIBLE 3 VECES CONSECUTIVAS sin intervención manual, sin reintentos, sin edición de DB"
  artifacts:
    - path: ".planning/phases/137-learning-loops-memory-learn/137-06-SIGNAL-GATE.md"
      provides: "Evidencia de las 3 ejecuciones: request IDs, canvas IDs, timestamps, messageIds de los emails recibidos, screenshots/dumps de cada run"
      contains: "RUN 1 / RUN 2 / RUN 3"
  key_links:
    - from: "Telegram request"
      to: "email delivery to antonio+fen"
      via: "pipeline async → canvas execution → Gmail send_email with real messageId"
      pattern: "3x reproducible sin intervención"
    - from: "connector_logs.response_payload (post INC-13)"
      to: "agent emitter output text"
      via: "post-mortem check — si no hay messageId, output NO afirma envío exitoso"
      pattern: "messageId ↔ output narrative alignment"
---

<objective>
**LA SEÑAL ÚNICA DEL MILESTONE v27.0** (MILESTONE-CONTEXT PART 7):

```
Usuario envía por Telegram:
"Comparativa facturación Q1 2026 vs Q1 2025 de Holded,
 maquétala con el template corporativo y envíala a
 antonio@educa360.com y fen@educa360.com"

Sistema:
→ Clasifica como complex
→ Pipeline async: strategist → decomposer → architect → QA (≤2 iter) → propuesta
→ Usuario aprueba
→ Canvas ejecuta: extractor×2 → merge → comparador → renderer → Gmail

Resultado:
✓ Email llega a ambos destinatarios
✓ Template HTML corporativo aplicado
✓ Cifras reales de Q1 2025 y Q1 2026 en la tabla (no placeholders)
✓ Sin intervención manual
✓ Sin reintentos
✓ REPRODUCIBLE EN 3 EJECUCIONES CONSECUTIVAS
```

Este plan es un checkpoint:human-verify puro. No hay código nuevo. Es el gate final del milestone que valida que las fases 133-137 suman end-to-end.

**Depends on TODO lo anterior** — sin INC-11/12/13 el renderer/Gmail fallarán. Sin LEARN-05/06/08 el canvas no arranca con contexto de propósito y el outcome no se cierra. Sin LEARN-07 la aprobación es frágil. Sin 137-03 CatBot no respeta preferencias del usuario en iteraciones futuras.

**INC-12 wrapper-level closure verification (per plan 137-01 Option B):**
Plan 137-01 cierra INC-12 a nivel wrapper (Gmail executor valida args + exige messageId en response). El criterio de cierre #2 de INC-12 ("executor marca emitter failed cuando response_payload no trae messageId") se verifica aquí end-to-end, NO en canvas-executor.ts. La lógica: si el wrapper devuelve `{error:'...messageId...'}`, el agent LLM recibe ese error en su histórico de tool-calls y no puede fabricar un output de éxito sin contradecir la tool response. El signal-gate valida esto observando la verdad end-to-end (el email llega o no llega).

Purpose: Cerrar el milestone con evidencia real, no con tests unitarios.
Output: `137-06-SIGNAL-GATE.md` con evidencia de las 3 ejecuciones y decisión PASS/FAIL.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/MILESTONE-CONTEXT.md
@.planning/deferred-items.md
@.planning/phases/136-end-to-end-validation-validation-gate/136-VERIFICATION.md
@.planning/phases/137-learning-loops-memory-learn/137-01-runtime-connector-contracts-PLAN.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Prepare gate environment and pre-flight checks</name>
  <files>
    .planning/phases/137-learning-loops-memory-learn/137-06-SIGNAL-GATE.md
  </files>
  <action>
    PASO 1 — Pre-flight:
    1. Docker rebuild con todos los cambios de los plans 01-05: `docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app`
    2. Verificar que el Telegram bot está conectado (test mínimo: enviar "ping" a CatBot vía Telegram y recibir respuesta).
    3. Verificar que existen los CatPaws y conectores necesarios:
       - CatPaw Consultor CRM / Filtro CRM / Analista de Leads (Holded MCP)
       - CatPaw Maquetador Email (email_template connector)
       - CatPaw Ejecutor Gmail (Gmail connector) — conector debe estar vinculado y oauth2 válido
    4. Verificar que antonio@educa360.com y fen@educa360.com son direcciones reales con inbox accesible al verificador humano.
    5. Limpiar job table de runs previos stuck: `DELETE FROM intent_jobs WHERE status IN ('pending','strategist','decomposer','architect') AND updated_at < now-1hr` (manual vía CatBot sudo o directamente).

    PASO 2 — Crear `137-06-SIGNAL-GATE.md` con el siguiente esqueleto (a rellenar por Task 2):
    ```markdown
    # Phase 137 Signal Gate — 3x Reproducibility of Holded Q1 via Telegram

    **Fecha del gate:** YYYY-MM-DD
    **Verificador humano:** [nombre]
    **Milestone:** v27.0
    **Requirement cerrado:** LEARN-01 (señal única)

    ## Pre-flight checks
    - [ ] Docker rebuild done: `docker images | grep docflow`
    - [ ] Telegram bot responding
    - [ ] CatPaws activos: Consultor CRM, Maquetador Email, Ejecutor Gmail
    - [ ] Conectores activos: Holded MCP, Email Templates, Gmail Antonio Educa360
    - [ ] Inbox antonio+fen accessible

    ## RUN 1 — YYYY-MM-DD HH:MM
    (filled below)

    ## RUN 2 — YYYY-MM-DD HH:MM
    (filled below)

    ## RUN 3 — YYYY-MM-DD HH:MM
    (filled below)

    ## Decision

    **GATE: [PASS | FAIL | PARTIAL]**
    ```
  </action>
  <verify>
    <automated>test -f .planning/phases/137-learning-loops-memory-learn/137-06-SIGNAL-GATE.md &amp;&amp; grep -q "Pre-flight checks" .planning/phases/137-learning-loops-memory-learn/137-06-SIGNAL-GATE.md</automated>
  </verify>
  <done>
    - Docker rebuild verificado
    - Pre-flight checks passing
    - Skeleton del gate doc creado
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Execute 3 consecutive Telegram runs and capture evidence</name>
  <files>
    .planning/phases/137-learning-loops-memory-learn/137-06-SIGNAL-GATE.md
  </files>
  <action>
    Este task es checkpoint:human-verify — el humano ejecuta los 3 runs por Telegram y rellena el SIGNAL-GATE.md con la evidencia. Claude NO puede automatizar este paso porque requiere:
    - Interacción Telegram real (app móvil o cliente)
    - Inspección manual de inbox de antonio+fen
    - Observación del flujo de aprobación

    Claude prepara el docker environment (Task 1), espera al verificador, y al recibir "approved" / "partial" / "failed" transcribe la evidencia final al SIGNAL-GATE.md y decide el GATE outcome.
  </action>
  <what-built>
    Las 5 fases del milestone v27.0 están desplegadas en runtime:
    - Phase 133: tooling async depurable, test-pipeline.mjs operativo
    - Phase 134: architect data layer enriquecida
    - Phase 135: architect + QA prompts role-aware con validador determinístico
    - Phase 136: design layer validado (deferred-runtime por INC-11/12/13)
    - Phase 137 plans 01-05: INC-11/12/13 cerrados (INC-12 a nivel wrapper per Option B, verificación E2E aquí), runtime wiring (goal→initialInput, condition multilingüe, outcome loop), CatBot intelligence (protocolo CatPaw + user patterns + oracle tool complexity stats), Telegram proposal UX, experimento fusion
    Todo compone la señal única: el caso Holded Q1 vía Telegram end-to-end.
  </what-built>
  <how-to-verify>
    **EJECUTAR 3 VECES CONSECUTIVAS, sin intervención manual entre runs, sin editar DB, sin reintentos:**

    **RUN 1:**
    1. Abrir Telegram → chat con el bot DocFlow
    2. Enviar literalmente (copiar y pegar exacto):
       `Comparativa facturación Q1 2026 vs Q1 2025 de Holded, maquétala con el template corporativo y envíala a antonio@educa360.com y fen@educa360.com`
    3. Esperar la respuesta del bot — debe clasificar como complex y empezar el pipeline async (mensaje: "Analizando tu petición..." o similar).
    4. Esperar la propuesta (formato LEARN-07): título "Comparativa Facturación Q1..." + lista de ~5-6 nodos con emojis + tiempo estimado + botones ✅ Aprobar / ❌ Cancelar.
    5. Pulsar ✅ Aprobar.
    6. Esperar mensaje de finalización (o timeout 3 minutos).
    7. Abrir inbox antonio@educa360.com — verificar email recibido:
       - [ ] Asunto contiene "Q1 2025" y/o "Q1 2026"
       - [ ] Body HTML con template corporativo (no texto plano, header estilizado)
       - [ ] Tabla con cifras reales de ambos periodos (NO placeholders "{{...}}", NO "Contenido principal del email")
       - [ ] Cifras coherentes con los datos reales de Holded
    8. Abrir inbox fen@educa360.com (o el destinatario real de test si "fen" no existe) — mismas checks
    9. **INC-12 wrapper-level closure verification** (por cada run — sanity check del Option B de plan 137-01):
       - [ ] Si el email llega: abrir connector_logs del nodo Gmail y confirmar que `response_payload` contiene `messageId` real (formato `<xxxxx@educa360.com>`). NO debe contener solo `{ok:true}`.
       - [ ] Si el email NO llega: abrir `node_states` del nodo emitter y confirmar que su `output` textual **NO afirma** "enviado correctamente". El output debe propagar el error del wrapper (p.ej. "no se pudo enviar — respuesta sin messageId"), NO fabricar éxito. Si el agent emitter fabrica éxito sin que llegue el email, es un escape del wrapper y se abre un INC nuevo.
    10. Anotar en `137-06-SIGNAL-GATE.md` bajo "RUN 1":
       - request_id del intent_job
       - canvas_id generado
       - complexity_decision_id (del intent_jobs row, post-137-02)
       - outcome final en complexity_decisions (completed/cancelled/timeout)
       - timestamp inicio/fin
       - messageId del email recibido en ambos inboxes
       - (opcional) dump del connector_log del Gmail send_email con request+response_payload
       - screenshots (opcional)

    **RUN 2:** Repetir los pasos 1-10 SIN hacer ninguna edición entre runs. Anotar bajo "RUN 2".

    **RUN 3:** Repetir los pasos 1-10 de nuevo. Anotar bajo "RUN 3".

    **Criterio de éxito:** Las 3 ejecuciones completan con ✓ en todos los checks de arriba, sin intervención humana entre runs. El check #9 cierra el criterio de INC-12 wrapper-level.

    **Si cualquier run falla:**
    - Determinar si el fallo es runtime (→ nuevo INC en deferred-items.md, milestone no se cierra end-to-end pero LEARN-01 como "partial — runtime bug X")
    - Determinar si el fallo es design (→ regresar a 133/134/135 según matriz del gate 136)
    - Determinar si el fallo es de uno de los plans 137-01..05 (→ gap closure plan)
    - **Si el fallo es "email no llega pero agent emitter afirma éxito"** → es escape del wrapper INC-12 Option B. Documentar en nuevo INC y considerar implementar Option A (executor post-hook) en v27.2.

    **Gate decision:**
    - Si 3/3 PASS → GATE: PASS → milestone v27.0 cerrado
    - Si 2/3 PASS con fallo no-determinista → GATE: PARTIAL, documentar causa y decidir si v27.0 cierra
    - Si <2/3 PASS → GATE: FAIL, diagnosticar y crear gap plan
  </how-to-verify>
  <verify>
    <automated>grep -q "GATE: PASS\|GATE: PARTIAL\|GATE: FAIL" .planning/phases/137-learning-loops-memory-learn/137-06-SIGNAL-GATE.md</automated>
  </verify>
  <done>
    - 3 runs documentados en SIGNAL-GATE.md con request_id, canvas_id, messageIds, complexity_decision_id, outcome
    - Check #9 (INC-12 wrapper escape verification) ejecutado en cada run
    - GATE decision registrada (PASS/PARTIAL/FAIL)
    - Si PASS: milestone v27.0 marcado como completo
  </done>
  <resume-signal>Type "approved" si las 3 runs pasan con evidencia en 137-06-SIGNAL-GATE.md, "partial" si 2/3, o describe el fallo para diagnóstico y creación de gap plan.</resume-signal>
</task>

</tasks>

<verification>
1. Archivo `137-06-SIGNAL-GATE.md` con secciones RUN 1, RUN 2, RUN 3 rellenadas
2. Cada run con evidencia: request_id, canvas_id, complexity_decision_id, outcome, messageIds de emails
3. Cada run con check #9 (INC-12 wrapper escape sanity check)
4. Sección "Decision" con GATE: PASS | PARTIAL | FAIL
5. Si PASS → milestone v27.0 se cierra
</verification>

<success_criteria>
- LEARN-01 cerrado: señal única del milestone reproducible 3x
- INC-12 wrapper-level closure verificado end-to-end (messageId ↔ agent output narrative alignment)
- Evidencia documentada en el gate file
- Si PASS: milestone v27.0 COMPLETE
</success_criteria>

<output>
After completion, create `.planning/phases/137-learning-loops-memory-learn/137-06-SUMMARY.md` y actualizar `.planning/STATE.md` con el milestone cerrado.
</output>
</content>
</invoke>