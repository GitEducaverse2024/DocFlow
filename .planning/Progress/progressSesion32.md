# Sesion 32 — CatDev v30.1: Honestidad operativa y robustez del pipeline

**Fecha:** 2026-04-22
**Estado:** COMPLETADO

---

## Resumen

Sesion mixta de migracion metodologica + primer milestone bajo el nuevo protocolo. Dos tracks ejecutados en el mismo dia: (1) transicion GSD → CatDev Protocol con cierre formal de v30.0 (LLM Self-Service), archivo de 42 fases pre-v25 y consolidacion de deuda tecnica en `tech-debt-backlog.md`; (2) primer milestone CatDev v30.1 con 4 fases que resuelven 3 defectos infraestructurales descubiertos en el run `e9679f28` del canvas test-inbound (KB EACCES, alias fallback silencioso, RAG embedding overflow) e introducen el skill comportamental "Auditor de Runs" para que CatBot cruce el plano de outputs con el plano de infraestructura tras cada ejecucion. Las 4 fases entregadas en ~1h35min de reloj (estimado original 5-7h). Las 3/4 verificaciones del oracle final pasaron automaticamente via tools nuevas.

---

## Bloque 1 — Transicion GSD → CatDev Protocol

### Motivacion

GSD fragmentaba la planificacion en 4 ficheros (PROJECT + REQUIREMENTS + ROADMAP + STATE) y requeria 7 documentos de analisis del codebase que Claude Code ya podia leer directamente. CatDev colapsa a un unico `.catdev/spec.md` + progressSesion final, con el ciclo plan/execute/verify/done sin paradas artificiales entre pasos.

### Entregables del protocolo

Cuatro comandos slash instalados en `.claude/commands/catdev/`:

| Comando | Proposito |
|---------|-----------|
| `/catdev:new` | Lee contexto, extrae lean spec, confirma, arranca |
| `/catdev:go` | Implementa una fase completa en un solo giro con build limpio |
| `/catdev:verify` | Build + API + DB + CatBot oracle |
| `/catdev:done` | Genera progressSesion + marca spec complete + actualiza STATE/ROADMAP |

Directorio de estado `.catdev/` con `README.md` + `spec.md` (generado por el flujo).

Script de utilidades `scripts/catdev-utils.sh` con helpers bash: `next_session`, `check_build`, `catbot_check`, `db_query`, `catbrain_query`, `api_get`.

Documento compartido `.claude/commands/catdev/_shared/knowledge-sources.md` que detalla el acceso agil al KB (`_header.md`, `_manual.md`, `_index.json`, `search_kb`), al indice de fases y al CatBrain RAG. Los 4 comandos lo referencian explicitamente.

### GSD desinstalado a nivel proyecto

`.planning/config.json` → archivado como `.planning/gsd-legacy-config.json` con frontmatter de contexto. `Skill(gsd:*)` removido del allowlist en `.claude/settings.json`. Documentado en `.planning/GSD-LEGACY-NOTE.md`. El plugin global `~/.claude/get-shit-done/` + `~/.claude/commands/gsd/` se mantienen intactos para otros proyectos (holded-mcp, linkedin-mcp).

### Historico preservado

- `.planning/phases/` conserva las 101 fases recientes (v20-v30)
- `.planning/phases-archive/` creado para 42 fases pre-v25 (01-55) movidas via `git mv`
- `.planning/milestones/` con REQUIREMENTS/ROADMAP/AUDIT de milestones shipped
- `.planning/Progress/progressSesion*.md` intacto (1-31)

---

## Bloque 2 — Cierre formal v30.0 (LLM Self-Service)

### Audit ya existente

`v30.0-MILESTONE-AUDIT.md` (2026-04-22) ya estaba completo con status `tech_debt` — 21/21 requirements satisfied, 4/4 phases passed, 3/4 E2E flows complete + 1 deferred (Gap B-stream). La recomendacion del audit fue "Option A: accept tech debt, complete milestone".

### Actualizaciones aplicadas

`MILESTONES.md`: entrada v30.0 rellenada con key accomplishments por cada Phase 158-161.
`ROADMAP.md` reescrito completo (tenia basura `</content></invoke>` residual al final) — v30.0 ✅ shipped 2026-04-22.
`PROJECT.md`: requirements validados movidos (CAT-01..03, CFG-01..03, PASS-01..04, TOOL-01..04, UI-01..03, VER-01..04); `Current Milestone` vacio.
`STATE.md`: frontmatter migrado al schema CatDev (`methodology: catdev`, `last_milestone: v30.0`, `active_milestone: null`); Current Position marca "No active milestone".

### Decisiones tomadas sobre v29.0 (partial)

- **Phase 145 Operador Holded** → `won't do` (tech-debt-backlog §1). El CatPaw existe en DB pero su caso de uso (Phase 146 canvas Inbound+CRM manual) nunca se materializo; el patron Inbound real acabo en Phase `CatFlow Inbound v4c` con arquitectura distinta (Connector Gmail determinista).
- **Phases 146/147/148** → scope migrado al backlog activo de CatDev (§3). Funcionalmente resueltos por el pipeline de produccion.

---

## Bloque 3 — P1: KB filesystem permissions (quick win)

### Causa

El contenedor Docker corre como usuario `nextjs` (UID 1001, GID nogroup 65534). El volumen bind-mounted `.docflow-kb` pertenecia a `deskmath:deskmath` (UID 1000) en el host. Al intentar `syncResource` tras PATCH a `/api/canvas/[id]`, los hooks de Phase 153 devolvian `EACCES: permission denied` en 10/10 iteraciones del run `e9679f28`. El chown en `Dockerfile` no basta porque los bind-mounts preservan UIDs del host al montarse.

### Fix

Extension del `docflow-init` service (patron existente para `/app/data` y `/app/openclaw`):

```yaml
docflow-init:
  image: busybox
  volumes:
    - ${HOME}/.openclaw:/app/openclaw
    - ${HOME}/docflow-data:/app/data
    - ./.docflow-kb:/docflow-kb
  command: sh -c "chown -R 1001:1001 /app/openclaw /app/data && chmod -R u+rw /app/openclaw /app/data && chmod -R a+rwX /docflow-kb"
```

### Decision clave

Use `chmod -R a+rwX` sin tocar ownership en vez de `chown 1001:1001` (patron de `/app/data`). El KB vive en git, se edita desde host via `kb-sync.cjs`, commits, ediciones manuales. Cambiar owner a 1001 romperia el workflow host. `a+rwX` da escritura al container (via `other`) manteniendo `deskmath:deskmath` como owner. Permisos finales: dirs 777, files 666.

**Archivo:** `docker-compose.yml`

---

## Bloque 4 — P2: Discovery + alias routing claude-sonnet-4

### Causa (diagnosticada en ~3 min)

El alias `chat-rag` en `model_aliases` apuntaba al FQN `anthropic/claude-sonnet-4` (Elite tier en `model_intelligence`). Sin embargo, LiteLLM Discovery solo expone 12 modelos via `/api/models`, todos shortcuts (`claude-opus`, `claude-sonnet`, `gemini-main`, `gemma-local`, variantes `openai/*` del gateway). El FQN no aparecia. Resolver activaba same-tier Elite fallback → `claude-opus` (el unico Elite visible con reasoning).

### Fix

`PATCH /api/alias-routing` con body `{alias: "chat-rag", model_key: "claude-sonnet", reasoning_effort: "medium"}`. El validador Phase 159-03 aprobo la transicion.

### Verificacion end-to-end

Log `alias-routing` tras trigger CatBrain chat: `alias=chat-rag resolved=claude-sonnet fallback=False reason=` — objetivo cumplido sin fallback.

**Nuevo tech debt capturado (UX-04):** la UI Enrutamiento permite seleccionar FQN sin aviso de que Discovery no lo vera. Registrado como item LOW en `tech-debt-backlog.md`.

**Archivos:** ninguno (cambio de datos via PATCH API). Seed de `seedAliases()` en `alias-routing.ts` no tocado — `gemini-main` sigue siendo default valido para fresh installs sin API key Claude.

---

## Bloque 5 — P3: RAG embedding context overflow (CRITICAL)

### Causa

CatBrain Educa360 (`9cc58dee-...`) tiene `rag_model = 'mxbai-embed-large'` con contexto nativo de 512 tokens. En `execute-catbrain.ts:69` se llama `ollama.getEmbedding(input.query, embModel)` sin proteccion. El Respondedor del canvas test-inbound construia queries de 1685+ chars (email body + metadata). Ollama devolvia `400: input length exceeds context length` en 10/10 iteraciones → 0 contexto RAG recuperado → respuesta al lead sin datos del KB.

### Fix

Truncate defensivo en la capa del servicio, no del caller. En `ollama.ts`:

```typescript
const EMBEDDING_CHAR_LIMITS: Record<string, number> = {
  'mxbai-embed-large': 1200,  // 512 ctx × 2.3 chars/token × 0.9 margen
  'nomic-embed-text': 18000,  // 8192 ctx, generoso
  'bge-large': 1200,
  // ... 15 entradas cubriendo familias conocidas
};

function truncateForEmbedding(text: string, model: string) {
  const baseModel = model.split(':')[0];
  const limit = EMBEDDING_CHAR_LIMITS[baseModel];
  if (!limit || text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit), truncated: true, limit };
}

async getEmbedding(text: string, model = 'nomic-embed-text') {
  const { text: inputText, truncated, limit } = truncateForEmbedding(text, model);
  if (truncated) logger.warn('chat', 'Embedding query truncated to model context limit', {
    model, originalLength: text.length, truncatedLength: inputText.length, limit
  });
  // ... fetch con inputText
}
```

### Decision clave

Fix en `ollama.ts`, no en `execute-catbrain.ts`. Cobertura automatica para todos los callers actuales y futuros. Evita frago de modificar callers uno a uno.

### Desviacion del plan

Heuristica inicial fue `1800 chars = 3 chars/token × 512 × 0.9`. Smoke test con query 2920 → truncate a 1800 → AUN devolvio 400. Espanol denso tiene ~2.3-2.5 chars/token (acentos). Baje a 1200 chars. Segundo smoke → HTTP 200. Fix robusto.

**Archivo:** `app/src/lib/services/ollama.ts` (+41 lineas)

---

## Bloque 6 — P4: CatBot observability + skill Auditor de Runs

### Motivacion

CatBot solo veia el plano de outputs de nodos. Los errores criticos del run `e9679f28` (RAG overflow, alias fallback, EACCES) vivian en logs JSONL y nunca aparecian en `node_states` de `canvas_runs`. Sin herramientas para leerlos, CatBot reportaba "10/10 OK" de buena fe pero incompleta.

### Tools nuevas

**`inspect_canvas_run(runId)`** — cruza `canvas_runs` table con JSONL log del dia del run, filtrando por `runId` + `canvas_id`. Devuelve:

```typescript
{
  output_plane: {
    runId, canvasId, status, nodeCount, nodeStatesSummary,
    totalTokens, totalDurationMs, startedAt, completedAt
  },
  infrastructure_plane: {
    errors: [...],        // level=error filtered
    fallbacks: [...],     // logs con fallback_used=true
    kbSyncFailures: [...],// EACCES en metadata.err
    embeddingErrors: [...],// 'embedding' | 'context length' en err
    outliers: [...],       // nodos con duration > 5× p50
    degraded: boolean      // hay algo en cualquier array de arriba
  }
}
```

**`get_recent_errors(minutes = 15, filter?)`** — lee JSONL del dia, filtra `level === 'error'` y `ts >= now - minutes`, aplica filter string-contains contra message+metadata, agrupa por `source + message` devolviendo `{source, message, count, sample, lastTs}` ordenado por `count DESC`.

Ambas tools auto-allowed tras anadir `name.startsWith('inspect_')` al visibility rule junto a los prefijos `list_`/`get_` existentes (hotfix aplicado cuando el smoke test revelo que CatBot no veia la tool).

### Skill "Auditor de Runs" (system skill)

Seed `skill-system-auditor-runs-v1` en `db.ts` (INSERT OR IGNORE, category='system', 3318 chars). Instrucciones:

- **Protocolo post-ejecucion:** tras capturar un runId, invocar `inspect_canvas_run` INMEDIATAMENTE, antes de reportar. Si `degraded=true`, escalar enumerando cada categoria explicitamente.
- **Protocolo de deteccion de patrones:** usar `get_recent_errors` con filters dirigidos (`embedding`, `EACCES`, `fallback`, `rate_limit`) cuando se sospeche problema repetitivo.
- **Reglas absolutas:** nunca reportar "100% funcional" sin inspect_canvas_run; `status=completed` no implica "sin problemas".

Inyectado en `catbot-prompt-assembler.ts` como seccion `auditor_protocol` priority P1 (patron byte-symmetric de Phase 160-04 `buildModelosProtocolSection`).

### Verificacion del oracle final (3/4 pasaron automaticamente)

| Check | Resultado | Evidencia |
|-------|-----------|-----------|
| inspect_canvas_run(e9679f28) detecta degraded=true | ✅ | 14 errors, 10 kbSyncFailures, 1 outlier — coincide con documento original |
| chat-rag resuelve sin fallback | ✅ | P2 log: `resolved=claude-sonnet fallback=False` |
| Respondedor menciona KB Educa360 | ⏭ | Pendiente re-ejecutar canvas con emails reales (manual) |
| get_recent_errors(docflow-kb) = 0 | ✅ | 0 ocurrencias en 60 min — P1 confirmado end-to-end |

**Archivos:**
- `app/src/lib/services/catbot-tools.ts` — +34 tool defs + ~170 LOC handlers + 1 linea visibility
- `app/src/lib/db.ts` — +~70 lineas seed block Auditor
- `app/src/lib/services/catbot-prompt-assembler.ts` — +19 lineas helper + P1 push

---

## Resumen de archivos modificados

| Archivo | Cambio |
|---------|--------|
| `docker-compose.yml` | Extended docflow-init volume + command para `/docflow-kb` (chmod a+rwX) |
| `app/src/lib/services/ollama.ts` | EMBEDDING_CHAR_LIMITS + truncateForEmbedding + integracion en getEmbedding con logger.warn |
| `app/src/lib/services/catbot-tools.ts` | 2 tool defs (inspect_canvas_run + get_recent_errors) + handlers + inspect_* en visibility allowlist |
| `app/src/lib/db.ts` | Seed idempotente skill-system-auditor-runs-v1 (category=system, 3318 chars) |
| `app/src/lib/services/catbot-prompt-assembler.ts` | buildAuditorProtocolSection + P1 push auditor_protocol |
| `.planning/MILESTONES.md` | v30.0 key accomplishments rellenados + v29.0 partial documentado |
| `.planning/ROADMAP.md` | Reescrito completo (basura final eliminada) + v30.0 shipped + pointers a tech-debt |
| `.planning/PROJECT.md` | v30.0 requirements validados movidos + metodologia CatDev documentada |
| `.planning/STATE.md` | Frontmatter migrado a schema CatDev + Current Position = "no active milestone" |
| `.planning/tech-debt-backlog.md` | **NUEVO** — won't-do / aceptado / backlog / incidentes / legacy tests |
| `.planning/GSD-LEGACY-NOTE.md` | **NUEVO** — notas de desinstalacion con instrucciones de rollback |
| `.planning/gsd-legacy-config.json` | Renombrado desde `config.json` + frontmatter de archivo |
| `.catdev/README.md` | **NUEVO** — proposito + lifecycle del directorio |
| `.catdev/spec.md` | **NUEVO** — spec del milestone v30.1 con 4 fases + notas de sesion detalladas |
| `.claude/commands/catdev/{new,go,verify,done}.md` | **NUEVOS** — 4 comandos CatDev |
| `.claude/commands/catdev/_shared/knowledge-sources.md` | **NUEVO** — guia central del KB + phases + CatBot oracle |
| `scripts/catdev-utils.sh` | **NUEVO** — bash helpers (next_session, catbot_check, db_query, api_get, etc.) |
| `.planning/phases-archive/01-55/*` | **NUEVOS** — 42 fases pre-v25 movidas via git mv (preservan historia) |
| `.claude/settings.json` | `Skill(gsd:*)` removido del allowlist local |

---

## Tips y lecciones aprendidas

### Bind-mounts Docker preservan UIDs del host
Un `chown -R nextjs:nodejs` en el Dockerfile se sobrescribe cuando el volumen se monta en runtime. Para volumenes bind-mounted, la solucion correcta es un init container pre-app (ya existia el patron en `docflow-init` para `/app/data`). Replicar el patron es ~1 linea de volume + 1 linea de command.

### chmod a+rwX vs chown 1001:1001 para repos versionados en git
Para directorios que vive en el repo (y por tanto se editan desde host, hacen commits, corren scripts), usar `chmod a+rwX` mantiene al user del host como owner y da escritura al container via `other`. Usar `chown 1001:1001` (como hace `/app/data`) rompe el workflow host. No todas las soluciones "correctas" son la misma.

### Embedding context limits varian mucho y los limites teoricos pueden fallar
`mxbai-embed-large` tiene 512 tokens de contexto. Heuristica `3 chars/token × 512 = 1536` falla con espanol denso. En realidad espanol con acentos es ~2.3-2.5 chars/token. Mejor ser conservador (factor 2.3) + margen de seguridad 0.9. El fix pertenece a la capa del servicio (`ollama.ts`), no al caller, porque solo el servicio conoce los limites reales por modelo.

### Alias resolver y el namespace mismatch Discovery vs model_intelligence
LiteLLM Discovery expone shortcuts (`claude-sonnet`, `gemini-main`). `model_intelligence` puede tener tanto shortcuts como FQNs (`anthropic/claude-sonnet-4`). Si un alias apunta a FQN no-shortcut, el resolver activa same-tier fallback silenciosamente. La UI Enrutamiento permite seleccionar FQN sin advertir — trampa real. Mitigacion: cambiar el alias a shortcut. Fix UX pendiente (UX-04 en backlog).

### Tool visibility rule necesita prefijo explicito
CatBot filtra tools por allowlist: `list_*`, `get_*`, y nombres enumerados. Una tool nueva con prefijo no-listado (`inspect_*`) no se inyecta en el prompt y CatBot no la ve — reporta "no se encuentra expuesta en mi lista". Hotfix: `name.startsWith('inspect_')` anadido al allowlist. Pattern: nombrar nuevas tools con prefijos ya aprobados (list/get/search/canvas) evita este paso.

### Skill de sistema como protocolo comportamental
El skill "Auditor de Runs" no anade capacidad tecnica — anade una regla obligatoria de comportamiento. Sin el skill, tools inspect_canvas_run y get_recent_errors existen pero CatBot no las invoca proactivamente. Con el skill inyectado en P1 del prompt, CatBot cruza output_plane con infrastructure_plane automaticamente. El seed sigue el patron Phase 160-04 (byte-symmetric), probado y estable.

### Costo de system prompt growth
La skill Auditor anade 3318 chars al system prompt (~6%). Aceptable para el valor entregado (protocolo critico). Si se anaden varias skills sistema asi, hay que pensar en compactacion (ver Phase E del draft CATDEV-MILESTONE, marcada won't-do en este milestone).

### CatDev acelera iteration cycles
Estimated 5-7h, actual ~1h35min para 4 fases. Principal ganancia: ciclo plan/execute/verify sin paradas artificiales. `.catdev/spec.md` se actualiza incrementalmente; no hay re-plan entre fases. El formato "notas de sesion" se rellena al ejecutar, no al final. CatDev escala mejor para milestones chicos (2-5 fases) que GSD.

---

## Metricas de la sesion

- **Milestones cerrados:** 2 (v30.0 cierre formal + v30.1 shipped)
- **Fases ejecutadas:** 4 (P1/P2/P3/P4 de v30.1)
- **Fases archivadas:** 42 (pre-v25 a phases-archive)
- **Ficheros modificados:** 7 de codigo + 10 de docs + 2 de config
- **Ficheros nuevos:** 9 (tech-debt-backlog, GSD-LEGACY-NOTE, catdev commands x4 + shared, spec, scripts/catdev-utils.sh, progressSesion32)
- **Tools CatBot nuevas:** 2 (`inspect_canvas_run`, `get_recent_errors`)
- **Skills nuevos:** 1 (`skill-system-auditor-runs-v1` — Auditor de Runs)
- **Bugs corregidos:** 3 (KB EACCES, alias fallback silencioso, RAG embedding overflow)
- **Tech debt items capturados:** 2 nuevos (UX-04 UI Enrutamiento warning, embedding retry progresivo)
- **Tech debt items mitigados incidentalmente:** 1 (Gap C de v30.0 parcial — shortcuts chat-rag ahora sin fallback)
- **Build verificado:** Si (en cada phase)
- **Verificacion CatBot:** 3/4 CHECKs del oracle PASAN automaticamente via las nuevas tools. CHECK 3 (respuesta KB Educa360) requiere re-ejecutar canvas con emails reales — pendiente validacion manual del usuario.
- **Docker rebuilds:** 4 (P1, P3, P4 x2 para visibility hotfix)
- **Tiempo real de reloj v30.1:** ~1h35min
