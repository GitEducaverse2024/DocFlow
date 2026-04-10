---
phase: 130-async-catflow-pipeline-creaci-n-asistida-de-workflows
verified: 2026-04-10T18:10:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
human_verification:
  - test: "CatBot-as-oracle protocol — trigger async pipeline proposal"
    expected: "Al pedir a CatBot una tarea compleja (>60s), debe proponer queue_intent_job, el pipeline debe avanzar por las 3 fases, y el usuario debe ver la propuesta en el dashboard Pipelines"
    why_human: "Requiere LiteLLM activo, IntentJobExecutor corriendo en produccion y verificacion visual del dashboard. Las dos tareas checkpoint:human-verify de los planes 04 y 05 fueron auto-aprobadas en yolo mode con todos los automated checks passing."
  - test: "Telegram inline keyboard callback — pipeline approve/reject via boton"
    expected: "Al tocar el boton 'Aprobar' en Telegram, processCallbackQuery parsea 'pipeline:<jobId>:approve', POSTea a /api/intent-jobs/[id]/approve, el canvas se ejecuta en background"
    why_human: "Requiere bot de Telegram activo y conexion real con el servidor"
---

# Phase 130: Async CatFlow Pipeline — Verificacion de Goal Achievement

**Phase Goal:** Cuando CatBot detecta una peticion que requiere mas de 60s, propone crear un CatFlow asistido: planifica objetivo, despieza en tareas, disena el canvas reutilizando recursos existentes (o creando CatPaws nuevos si hacen falta), notifica al usuario con la propuesta, y tras aprobacion ejecuta el canvas asincronamente sin bloquear el chat.

**Verified:** 2026-04-10T18:10:00Z
**Status:** passed
**Re-verification:** No — verificacion inicial

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | CatBot recibe instrucciones de cuándo encolar jobs (PIPE-02) | VERIFIED | buildComplexTaskProtocol() exportada y registrada como seccion P1 en catbot-prompt-assembler.ts L658+L772; test catbot-prompt-assembler.test.ts verde |
| 2  | Tabla intent_jobs existe con 14 campos + CRUD exportado (PIPE-01) | VERIFIED | catbot-db.ts L133: CREATE TABLE IF NOT EXISTS intent_jobs; 8 funciones exportadas incluyendo createIntentJob, updateIntentJob, getIntentJob, listJobsByUser, getNextPendingJob, cleanupOrphanJobs, countStuckPipelines |
| 3  | IntentJobExecutor ejecuta pipeline de 3 fases via LLM (PIPE-03) | VERIFIED | intent-job-executor.ts: class IntentJobExecutor L58, BOOT_DELAY=60s L43, callLLM→v1/chat/completions L302, 3 fases: strategist→decomposer→architect, one-per-tick guard, cleanupOrphans on start |
| 4  | Canvas Flow Designer valida node types y maneja needs_cat_paws (PIPE-04) | VERIFIED | canvas-flow-designer.ts: VALID_NODE_TYPES (9 types), validateFlowData, scanCanvasResources; intent-job-executor.ts L249 usa validateFlowData antes de INSERT canvas; branch architect_retry L126 |
| 5  | Propuesta enviada por canal correcto (dashboard + Telegram) al completar diseno (PIPE-05) | VERIFIED | intent-job-executor.ts: sendProposal L380 llama createNotification('catflow_pipeline') + telegramBotService.sendMessageWithInlineKeyboard; notifications.ts L7 incluye 'catflow_pipeline' |
| 6  | Tras aprobacion, canvas se ejecuta en background (PIPE-06) | VERIFIED | approve/route.ts: POST valida pipeline_phase='awaiting_approval', transiciona a 'running', fetch fire-and-forget a /api/canvas/{canvas_id}/execute; processCallbackQuery en telegram-bot.ts wired |
| 7  | post_execution_decision con 3 branches (keep_template, save_recipe, delete) (PIPE-07) | VERIFIED | catbot-tools.ts L3343: case 'post_execution_decision' con 3 branches; test intent-jobs.test.ts verde para los 3 casos |
| 8  | progress_message consultable en tiempo real via list_my_jobs + dashboard (PIPE-08) | VERIFIED | GET /api/intent-jobs/route.ts: force-dynamic, parsea progress_message JSON; tab-pipelines.tsx L148 con auto-refresh 10s; AlertService.checkStuckPipelines L251 registrado en tick() L88 |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/src/lib/catbot-db.ts` | CREATE TABLE intent_jobs + IntentJobRow + CRUD | VERIFIED | L133 tabla; L258 interface; 8 funciones exportadas |
| `app/src/lib/services/catbot-tools.ts` | 7 nuevas tools (6+approve_catpaw_creation) + ASYNC_TOOLS + permission gate | VERIFIED | TOOLS[] L1011-L1130; ASYNC_TOOLS L65; permission gate L1230-1237; USER_SCOPED_TOOLS L1321 |
| `app/data/knowledge/settings.json` | 7 tool names en tools[] | VERIFIED | queue_intent_job, list_my_jobs, cancel_job, approve_pipeline, execute_approved_pipeline, post_execution_decision, approve_catpaw_creation — todos presentes |
| `app/src/lib/services/catbot-pipeline-prompts.ts` | 3 prompts STRATEGIST/DECOMPOSER/ARCHITECT | VERIFIED | 42 lineas, 3 exports, VALID_NODE_TYPES mencionados en ARCHITECT |
| `app/src/lib/services/intent-job-executor.ts` | IntentJobExecutor singleton + 3 fases + architect_retry + orphan cleanup | VERIFIED | 455 lineas, clase completa con todos los branches |
| `app/src/lib/services/canvas-flow-designer.ts` | validateFlowData + VALID_NODE_TYPES + scanCanvasResources | VERIFIED | 117 lineas, 3 exports, 9 node types validos |
| `app/src/lib/services/catbot-prompt-assembler.ts` | buildComplexTaskProtocol() seccion P1 | VERIFIED | L658 funcion, L772 sections.push priority 1 |
| `app/src/instrumentation.ts` | IntentJobExecutor.start() tras IntentWorker | VERIFIED | L47-52: bloque try/await import/IntentJobExecutor.start() |
| `app/src/lib/logger.ts` | 'intent-job-executor' en LogSource | VERIFIED | L20 |
| `app/src/lib/services/notifications.ts` | NotificationType incluye 'catflow_pipeline' | VERIFIED | L7 |
| `app/src/lib/services/telegram-bot.ts` | callback_query, processCallbackQuery, sendMessageWithInlineKeyboard, answerCallbackQuery | VERIFIED | L41 TelegramCallbackQuery, L307 callback_query branch, L708 sendMessageWithInlineKeyboard, L745 answerCallbackQuery, L765 processCallbackQuery |
| `app/src/app/api/intent-jobs/[id]/approve/route.ts` | POST force-dynamic, transiciona a running, invoca canvas execute | VERIFIED | force-dynamic L5; fase check L15; fetch fire-and-forget L33 |
| `app/src/app/api/intent-jobs/[id]/reject/route.ts` | POST force-dynamic, transiciona a cancelled | VERIFIED | directorio existe, force-dynamic |
| `app/src/app/api/intent-jobs/[id]/approve-catpaws/route.ts` | POST force-dynamic, delega a resolveCatPawsForJob | VERIFIED | force-dynamic L5; resolveCatPawsForJob en catpaw-approval.ts L61 flipea a 'architect_retry' con cat_paws_resolved=true |
| `app/src/app/api/intent-jobs/route.ts` | GET force-dynamic, lista jobs por usuario, parsea progress_message | VERIFIED | force-dynamic L5; listJobsByUser; JSON.parse progress_message |
| `app/src/components/settings/catbot-knowledge/tab-pipelines.tsx` | Client component, fetch /api/intent-jobs, phase badge, canvas link | VERIFIED | 148 lineas, useEffect fetch, awaiting_approval link a /catflow/{canvas_id} |
| `app/src/components/settings/catbot-knowledge/catbot-knowledge-shell.tsx` | 4to tab 'Pipelines' con TabPipelines | VERIFIED | L9 import TabPipelines; L15 key:'pipelines'; L71 renderiza |
| `app/src/lib/services/alert-service.ts` | checkStuckPipelines registrado en tick() | VERIFIED | L88 en tick(); L251 implementacion |
| `app/data/knowledge/catboard.json` | tab-pipelines + /api/intent-jobs en tools/endpoints | VERIFIED | L12 endpoint; L29 tab-pipelines concept |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| catbot-tools.ts | catbot-db.ts | import createIntentJob, updateIntentJob, getIntentJob, listJobsByUser | WIRED | L catbot-db import confirmado |
| catbot-tools.ts | context.userId | executeTool cases usan context?.userId | WIRED | L1324, L3234, L3253, L3321 |
| settings.json tools[] | catbot-tools.ts TOOLS[] | 7 nombres nuevos presentes | WIRED | Verificado con grep |
| catbot-tools.ts getToolsForLLM | ASYNC_TOOLS map | sufijo "(ASYNC - estimated Ns)" en description | WIRED | L1208-1215 |
| intent-job-executor.ts | catbot-db.ts | getNextPendingJob, updateIntentJob, getIntentJob, IntentJobRow | WIRED | L36-39 imports |
| intent-job-executor.ts | LiteLLM /v1/chat/completions | fetch directo, NO /api/catbot/chat | WIRED | L302 |
| intent-job-executor.ts | catbot-pipeline-prompts.ts | import STRATEGIST/DECOMPOSER/ARCHITECT_PROMPT | WIRED | L44 |
| instrumentation.ts | intent-job-executor.ts | await import + IntentJobExecutor.start() | WIRED | L47-52 |
| catbot-prompt-assembler.ts | buildComplexTaskProtocol() | sections.push id='complex_task_protocol' priority=1 | WIRED | L772 |
| intent-job-executor.ts | canvas-flow-designer.ts | import validateFlowData, scanCanvasResources | WIRED | L36-39 |
| intent-job-executor.ts | docflow.db canvases | INSERT INTO canvases via validateFlowData + scanCanvasResources | WIRED | L249 validate, L260+ insert |
| telegram-bot.ts processUpdate | processCallbackQuery | if (update.callback_query) branch antes de check message | WIRED | L307-308 |
| telegram-bot.ts processCallbackQuery | /api/intent-jobs/[id]/approve|reject|approve-catpaws | fetch POST con jobId y action | WIRED | L765+ |
| approve/route.ts | /api/canvas/[id]/execute | fetch fire-and-forget POST | WIRED | L33 |
| approve-catpaws/route.ts | IntentJobExecutor (via DB) | resolveCatPawsForJob flipea pipeline_phase='architect_retry' | WIRED | catpaw-approval.ts L61 |
| catbot-tools.ts approve_catpaw_creation | docflow.db cat_paws | INSERT INTO cat_paws | WIRED | L1364 |
| intent-job-executor.ts sendProposal | notifications.ts + telegram-bot.ts | createNotification('catflow_pipeline') + sendMessageWithInlineKeyboard | WIRED | L393, L408-413 |
| tab-pipelines.tsx | /api/intent-jobs | fetch en useEffect on mount | WIRED | componente 148 lineas, fetch wired |
| catbot-knowledge-shell.tsx | tab-pipelines.tsx | import TabPipelines + renderiza | WIRED | L9, L71 |
| alert-service.ts tick() | checkStuckPipelines | try/catch individual en tick | WIRED | L88 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PIPE-01 | 130-01 | Tabla intent_jobs + CRUD en catbot-db.ts | SATISFIED | 8 funciones CRUD exportadas, 3 indices, IntentJobRow interface |
| PIPE-02 | 130-01, 130-02 | CatBot detecta peticiones complejas via ASYNC metadata + instruccion PromptAssembler P1 | SATISFIED | ASYNC_TOOLS map + buildComplexTaskProtocol seccion P1 |
| PIPE-03 | 130-02 | Pipeline 3 fases (estratega→despiezador→arquitecto) via LLM directo | SATISFIED | intent-job-executor.ts: 3 callLLM secuenciales, one-per-tick guard, orphan cleanup |
| PIPE-04 | 130-03 | Canvas Flow Designer + needs_cat_paws pause + architect_retry resume | SATISFIED | canvas-flow-designer.ts validateFlowData; awaiting_user pause; approve-catpaws→architect_retry loop cerrado |
| PIPE-05 | 130-04 | Propuesta enviada al canal original (dashboard + Telegram con botones) | SATISFIED | sendProposal: createNotification('catflow_pipeline') + sendMessageWithInlineKeyboard con botones Aprobar/Rechazar |
| PIPE-06 | 130-04 | Ejecucion en background tras aprobacion | SATISFIED | approve/route.ts: fetch fire-and-forget a /api/canvas/{id}/execute; Telegram callback_query procesado |
| PIPE-07 | 130-01, 130-05 | post_execution_decision 3 branches | SATISFIED | catbot-tools.ts case 'post_execution_decision' con keep_template/save_recipe/delete; test verde |
| PIPE-08 | 130-05 | progress_message en tiempo real via list_my_jobs + dashboard | SATISFIED | GET /api/intent-jobs route; tab-pipelines.tsx auto-refresh 10s; AlertService.checkStuckPipelines |

**Todos los 8 requirements PIPE satisfechos.** No hay orphaned requirements (todos los IDs de los planes estan cubiertos por REQUIREMENTS.md).

---

### Anti-Patterns Found

Ninguno bloqueante. Scan limpio:
- Build exitoso sin errores TypeScript ni ESLint
- 97 + 40 = 137 tests pasan (9 archivos de test)
- No TODO/FIXME/PLACEHOLDER en archivos nuevos relevantes
- No `return null` o implementaciones vacías en paths críticos
- notifyUserCatPawApproval y sendProposal completamente implementados (no stubs) — ambos invocan createNotification y sendMessageWithInlineKeyboard reales

---

### Human Verification Required

#### 1. CatBot-as-oracle: pipeline end-to-end

**Test:** Pedir a CatBot en el chat web: "Quiero procesar todos los documentos del proyecto y crear un report semanal automatizado"
**Expected:** CatBot detecta que execute_catflow es ASYNC (>60s), llama queue_intent_job, devuelve job_id. IntentJobExecutor (tras BOOT_DELAY=60s en produccion) avanza por strategist→decomposer→architect, aparece propuesta en tab "Pipelines" del dashboard Conocimiento. Al aprobar, canvas se ejecuta.
**Why human:** Requiere LiteLLM con modelo CATBOT_PIPELINE_MODEL activo, IntentJobExecutor corriendo (production/Docker), y verificacion visual del dashboard. Las dos tareas checkpoint:human-verify (Plan 04 Task 5 y Plan 05 Task 3) fueron auto-aprobadas en yolo mode con todos los automated checks passing — esto cubre su intent segun las instrucciones del verificador.

#### 2. Telegram callback approval flow

**Test:** Desde Telegram, enviar la misma peticion. Cuando llega el mensaje con botones inline, tocar "Aprobar".
**Expected:** answerCallbackQuery responde "Procesando...", processCallbackQuery parsea 'pipeline:{jobId}:approve', POSTea a /api/intent-jobs/{id}/approve, el job transiciona a 'running' y el canvas se ejecuta.
**Why human:** Requiere bot Telegram activo con token configurado y servidor accesible desde el exterior.

---

### Gaps Summary

No hay gaps. Todos los must-haves de los 5 planes estan implementados y verificados:

- **Plan 01:** Tabla + CRUD + 6+1 tools + ASYNC_TOOLS + settings.json sync — completo
- **Plan 02:** IntentJobExecutor singleton + 3 prompts + buildComplexTaskProtocol P1 + instrumentation + logger — completo
- **Plan 03:** canvas-flow-designer.ts + validateFlowData integrado en executor + needs_cat_paws path — completo
- **Plan 04:** Telegram callback_query, approve/reject/approve-catpaws routes, approve_catpaw_creation tool, sendProposal+notifyUserCatPawApproval completos — completo
- **Plan 05:** AlertService.checkStuckPipelines, GET /api/intent-jobs, tab-pipelines.tsx, catbot-knowledge-shell 4to tab, catboard.json — completo

El goal del phase esta completamente alcanzado: CatBot puede detectar peticiones complejas, encolar jobs, el pipeline de 3 fases LLM se ejecuta en background, se notifica al usuario por web y Telegram, el usuario puede aprobar/rechazar, y los pipelines son visibles en tiempo real desde el dashboard.

---

_Verified: 2026-04-10T18:10:00Z_
_Verifier: Claude (gsd-verifier)_
