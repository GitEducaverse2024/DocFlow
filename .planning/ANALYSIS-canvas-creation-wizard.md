# ANALYSIS — Canvas Creation Wizard

**Fecha:** 2026-04-18
**Autor:** Antonio + CatBot (análisis conjunto)
**Estado:** Propuesta para discusión — NO es un plan de implementación aún
**Evidencia base:** intent_job `24738d3b-77c1-4cc3-88ab-9d42c0732cea` (Telegram, 17/04)

---

## TL;DR

El pipeline async actual (strategist → decomposer → architect → QA) produce canvases que **no podrían ejecutarse en runtime** por datos críticos (email destinatario, template_id, tool MCP real) que nunca se materializan en campos tipados. El LLM del architect diseña estructuras internamente plausibles pero desconectadas de la realidad.

La propuesta: anteponer un **wizard conversacional de 3 fases** (Resource Analyst → Builder Planner → Staged Build) que resuelve recursos ANTES de llamar al architect y construye el canvas por etapas validables, reutilizando toda la infraestructura existente (tools, pipeline, dos capas del Agent node).

**Principio central:** reutilizar recursos cuando el match sea alto, extender con canvas-level extras cuando sea parcial, clonar y potenciar solo cuando sea necesario. La "dos capas" de los Agent nodes ya soporta este modelo nativamente.

---

## 1. Contexto y evidencia del problema

### 1.1 Autopsia del job real

Petición: *"Comparativa facturación Q1 2026 vs Q1 2025 de Holded, maquétala con el template corporativo y envíala a antonio@educa360.com"* (Telegram, 17/04).

**Resultado:** 4 iteraciones del QA loop, todas rechazadas. Job abortado. Cero canvas entregado al usuario.

### 1.2 Los 5 fallos observables en iter 3 (la mejor versión)

| # | Fallo | Evidencia concreta |
|---|-------|-------------------|
| 1 | **START vacío** | `INPUT:{}` `OUTPUT:{}` — el nodo inicial no propaga nada |
| 2 | **Fechas en prosa** | *"consultar las facturas de Q1 2025"* como texto, no como campo ISO ni timestamp Unix |
| 3 | **Email destinatario y `template_id` fantasmas** | Aparecen en el OUTPUT del renderer pero NO están en ningún INPUT upstream ni en START. El canvas no tiene **cómo** saber dónde enviar |
| 4 | **Synthesizer viola R10 explícitamente** | PROCESO dice *"Filtra los arrays originales para no pasarlos al renderer"* — el architect sabe que infringe pero no sabe cómo dividir el nodo |
| 5 | **Tool MCP inventado** | Usa `holded_search_facturas` — tool que **no existe**. El real es `list_documents({docType:"invoice", starttmp, endtmp})` con timestamps Unix |

### 1.3 Patrón de fallo sistémico

No son errores aleatorios. Son **síntomas de una misma causa:** el pipeline procesa una petición en lenguaje natural sin resolverla a recursos concretos **antes** de diseñar la estructura. El architect inventa porque no tiene contra qué contrastar.

Incluso si resolviéramos los 5 fallos por heurística, el mismo patrón reaparece con otras peticiones. La solución tiene que ser **estructural**, no parche.

---

## 2. La propuesta — distilada

El usuario propone 3 fases encadenadas antes del pipeline actual:

### 2.1 Fase 0 — **Resource Analyst** (análisis + informe + preguntas concretas)

1. Recibe petición en lenguaje natural.
2. Entiende el dominio (sabe qué son CatPaws, connectors, skills, CatBrains, templates, MCP tools).
3. **Descompone la petición** en tipos de operación (extracción, análisis, maquetación, emisión, etc.).
4. **Escanea recursos** ejecutando `list_*` tools y `mcp_bridge.discover_tools`.
5. **Scorea matches** entre cada operación y los recursos disponibles.
6. Identifica gaps y ambigüedades (2+ candidatos, recursos faltantes, deixis no resuelta).
7. **Emite informe estructurado en .md** mostrando lo que tiene, lo que propone, lo que falta.
8. **Pregunta al usuario solo lo necesario** — preguntas concretas y pocas (no entrevista larga).

### 2.2 Fase 1 — **Builder Planner** (estructuración en etapas)

1. Recibe recursos resueltos + informe validado por el usuario.
2. Divide la construcción del canvas en **etapas pequeñas y validables**.
3. Explica al usuario la estrategia: *"voy a construir y validar la sección A, luego B, luego C"*.
4. Cada etapa declara: nodos a construir, contrato I/O, guard de validación, recursos usados.

### 2.3 Fase 2 — **Staged Build** (ejecución GSD-style por fases)

Para cada etapa:

1. CatBot relee el contexto de esa etapa (no todo el canvas).
2. Formula 0-2 preguntas solo si surgen ambigüedades nuevas.
3. Propone **placeholder test** (estructura real + contenido ficticio en efectos laterales) para que el usuario valide la forma de los datos.
4. Usuario valida → promueve a ejecución real.
5. Verifica outputs reales contra el contrato declarado.
6. Avanza a la siguiente etapa.

### 2.4 Principios rectores

- **Reutilizar arquitectura existente:** strategist / decomposer / architect / QA **no se tiran**. Reciben input ya tipado y pre-resuelto → menos iteraciones, menos tokens.
- **Eficiencia de tokens:** cada LLM call tiene que justificar su coste. Cachear, reducir prompts, evitar scans redundantes.
- **Validación por contrato, no por heurística:** el usuario ve qué se va a construir ANTES de construirlo; valida ANTES de ejecutar.
- **Placeholder = estructura real + contenido ficticio:** nunca UUIDs inventados. Lo único "fake" es el contenido de efectos laterales (subject del email de prueba, cuerpo), no la estructura.

---

## 3. El problema central — ¿nodo genérico o especializado?

Esta es la decisión más importante del Resource Analyst y donde se juega la calidad del canvas final.

### 3.1 El dilema

Cuando el Analyst encuentra candidatos para una operación, hay 4 outcomes posibles:

| Outcome | Cuándo | Cómo se materializa |
|---------|--------|---------------------|
| **Reuse as-is** | Match alto en todas las dimensiones | `{type:"agent", data:{agentId:"<uuid>"}}` — sin extras |
| **Reuse + canvas extras** | Match alto en system_prompt; falta skill/conector/catbrain puntual | `{type:"agent", data:{agentId:"<uuid>", extraConnectors:[...], skills:[...], extraCatBrains:[...]}}` — **ya existe en canvas-executor:517-524** |
| **Clone + enhance** | Match alto en dominio pero system_prompt necesita cambios estructurales | Crear CatPaw nuevo clonando → editar system_prompt → incluir en canvas |
| **Create new** | Ningún match razonable | `needs_cat_paws[]` wizard: specs del user → create_cat_paw → usar |

### 3.2 Por qué "Reuse + canvas extras" es el caso más interesante

El modelo **dos capas** del Agent node está implementado hace tiempo y lo usa el canvas-executor:

```typescript
// canvas-executor.ts:516-524
const extraSkillIds = (data.skills as string[]) || [];
const extraConnectorIds = (data.extraConnectors as string[]) || [];
const extraCatBrainIds = (data.extraCatBrains as string[]) || [];
const pawResult = await executeCatPaw(agentId, pawInput, {
  ...(extraSkillIds.length > 0 ? { extraSkillIds } : {}),
  ...(extraConnectorIds.length > 0 ? { extraConnectorIds } : {}),
  ...(extraCatBrainIds.length > 0 ? { extraCatBrainIds } : {}),
});
```

Significa: **puedo reutilizar un CatPaw base sin mutarlo**, añadiéndole conectores/skills/CatBrains solo para este canvas. Ejemplos concretos:

- **"Analista de Facturas"** sin skill específica de comparativas trimestrales → reuse + `skills:["analisis-trimestral"]` a nivel canvas.
- **"Operador Holded"** generalista → reuse + `extraCatBrains:[...]` con documentación específica de facturación.
- **"Maquetador Email"** sin el template corporativo vinculado → reuse + `extraConnectors:["<template-connector-id>"]`.

**Consecuencia arquitectónica:** el Resource Analyst debe PREFERIR "reuse + extras" sobre "clone + enhance" siempre que sea viable. Razón: evitamos duplicación de CatPaws en la DB, mantenemos una sola fuente de verdad para el agente base, y la modificación vive solo en este canvas.

### 3.3 Framework de scoring (propuesta)

Por cada operación requerida por la petición, computar un score contra cada CatPaw candidato:

| Dimensión | Peso | Cómo se mide |
|-----------|------|--------------|
| **Tools match** | 30% | % de tools que necesita la operación y están en `tools_available[]` |
| **System prompt alignment** | 25% | Embedding similarity entre descripción de la operación y `system_prompt` |
| **best_for match** | 20% | Embedding similarity con el campo `best_for` (si existe) |
| **Skills relevancia** | 10% | % de skills asignadas relevantes para la tarea |
| **Connectors relevancia** | 10% | Conectores vinculados útiles para la operación |
| **Mode/model fit** | 5% | `processor` + modelo adecuado para la complejidad |

**Umbrales de decisión:**

- Score ≥ 85% → **Reuse as-is** (sin preguntar)
- 70% ≤ Score < 85% → **Reuse + canvas extras** (sugerir qué extras añadir, preguntar si hay duda)
- 50% ≤ Score < 70% → **Clone + enhance** (requiere confirmación del user)
- Score < 50% → **Create new** (wizard de creación)

Si **2+ candidatos** tienen score ≥ 85%, preguntar al usuario cuál prefiere (es una ambigüedad real).

### 3.4 Identificación de gap específico que cierra

Esta decisión HOY la toma el LLM del architect basándose solo en `best_for` como señal principal, sin scoring estructurado. Por eso en el job 24738d3b acabó usando `b63164ed` (Consultor CRM, rígido) en vez de `53f19c51` (Operador Holded, generalista) — porque el architect no los compara contra la operación, los elige por proximidad semántica cruda.

---

## 4. Contraste con lo que YA existe

Uno de los principios: no reinventar. Mapeo exhaustivo de piezas existentes y cómo se reutilizan.

### 4.1 Tooling de descubrimiento — COMPLETO ✅

| Tool | Archivo | Uso en wizard |
|------|---------|---------------|
| `list_cat_paws` | catbot-tools.ts:1552 | Resource Analyst escanea candidatos |
| `list_connectors` | (via prompt assembler) | Conectores de todos los tipos |
| `list_email_connectors` | catbot-tools.ts:1739 | Filtro Gmail |
| `list_email_templates` | catbot-tools.ts:434 | Filtro templates con categoría |
| `list_skills` | catbot-tools.ts:1985 | Skills disponibles |
| `list_catbrains` | catbot-tools.ts:1522 | CatBrains disponibles |
| `mcp_bridge.discover_tools` | catbot-sudo-tools.ts (sudo) | Enumera tools reales de un MCP server |
| `get_skill` | catbot-tools.ts:1948 | Lee protocolo de una skill |

**Cero trabajo nuevo en tooling.** Todo está.

### 4.2 Dos capas del Agent node — IMPLEMENTADO ✅

- Base: CatPaw con sus skills/connectors/CatBrains en DB.
- Canvas extras: `data.skills`, `data.extraConnectors`, `data.extraCatBrains` aplicados en runtime.
- Se mergean sin duplicados.
- No muta el CatPaw base.

Esto es la piedra angular del modelo "Reuse + canvas extras". Ya funciona.

### 4.3 Pipeline async — REUTILIZABLE ✅

Los 4 prompts existentes (STRATEGIST_PROMPT, DECOMPOSER_PROMPT, ARCHITECT_PROMPT, CANVAS_QA_PROMPT) **no hay que tocarlos semánticamente**. Lo que cambia es QUÉ reciben:

- **Hoy:** goal en lenguaje natural ambiguo.
- **Con wizard:** JSON tipado con recursos ya resueltos a UUIDs, fechas a ISO, entidades a IDs.

Consecuencia: el architect deja de inventar porque recibe constrainments explícitos. QA loop converge en 1-2 iteraciones en vez de 4+.

### 4.4 `needs_cat_paws[]` del architect — PARCIAL ⚠️

Existe el mecanismo para que el architect pida CatPaws que no existen ([catbot-pipeline-prompts.ts:60](app/src/lib/services/catbot-pipeline-prompts.ts#L60)). Problema: es **post-hoc** (después de intentar diseñar), no **preventivo**.

El wizard lo convierte en preventivo: el Analyst detecta "falta un CatPaw que haga X" ANTES de llamar al architect → abre wizard de creación → crea el CatPaw → el architect recibe el UUID ya existente.

### 4.5 State machine de `intent_jobs` — EXTENSIBLE ✅

Fases actuales en `intent-job-executor.ts:128`:

```
pending → strategist → decomposer → architect → architect_retry → awaiting_approval/awaiting_user/failed
```

Propuesta de nuevas fases (no rompen las existentes):

```
pending → resource_scan → clarification → stage_plan → [stage_execute × N] → awaiting_approval
```

O híbrido (más conservador):

```
pending → resource_scan → clarification → stage_plan
       → strategist → decomposer → architect → qa (como hoy, pero con input tipado)
       → stage_validate
       → awaiting_approval
```

El recomendable es el híbrido — conserva el pipeline existente como **motor interno** de cada etapa.

### 4.6 GSD como patrón mental — APLICA ✅

El usuario explícitamente invoca GSD. Las paralelas son claras:

| GSD | Canvas Wizard |
|-----|---------------|
| `/gsd:new-project` → requirements | Resource Analyst → informe + preguntas |
| `/gsd:plan-milestone` → roadmap | Builder Planner → etapas |
| `/gsd:plan-phase` → PLAN.md | Cada etapa define contratos I/O |
| `/gsd:execute-phase` → ejecutar + verificar | Staged Build → placeholder test → real |
| Verification loop | Validación por usuario entre etapas |

No hay que construir el patrón, hay que aplicarlo al dominio de canvas.

### 4.7 Skills como mecanismo de protocolo — DISPONIBLE ✅

La infraestructura de skills ([catbot-prompt-assembler.ts:281-308](app/src/lib/services/catbot-prompt-assembler.ts#L281)) permite:

- Inyección condicional al detectar intent.
- `get_skill(name)` para cargar el protocolo completo on-demand.
- Skills definidas en markdown, fáciles de versionar.

El wizard se puede implementar como **3 skills nuevas** + **1 modificación del prompt assembler** (para auto-invocar la primera).

---

## 5. Arquitectura propuesta

### 5.1 Vista de alto nivel

```
┌──────────────────────────────────────────────────────────────────┐
│ USER: "Crea un CatFlow que <petición en lenguaje natural>"       │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ Complexity gate (modificado):                                    │
│   • SI detecta intent de creación canvas → invocar skill wizard  │
│   • NO ir directo a queue_intent_job                             │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ FASE 0 — Resource Analyst Agent (CatBot tool loop, sync)         │
│                                                                  │
│ 1. Parse petición → lista de operaciones abstractas              │
│ 2. list_cat_paws + list_connectors + list_email_templates +      │
│    list_skills + list_catbrains + mcp_bridge.discover_tools      │
│ 3. Score cada operación × cada candidato                         │
│ 4. Clasifica: reuse-as-is / reuse-extras / clone / create        │
│ 5. Identifica deixis y ambigüedades                              │
│ 6. Emite informe .md + preguntas concretas (min)                 │
│                                                                  │
│ Output: `resource_resolution_report.md` + lista de preguntas     │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
              ┌────────── USER RESPONDE ──────────┐
              │ (validación del .md + respuestas) │
              └───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ FASE 1 — Builder Planner Agent (CatBot tool loop, sync)          │
│                                                                  │
│ 1. Consolida recursos resueltos → `initialInput` tipado          │
│ 2. Divide canvas en etapas (típicamente 2-4):                    │
│    Stage A: extracción (nodos extractor)                         │
│    Stage B: análisis (nodos transformer/synthesizer)             │
│    Stage C: emisión (nodos renderer + emitter + guard)           │
│ 3. Cada stage declara: nodos, contratos I/O, placeholder mode    │
│ 4. Presenta plan al usuario para confirmación                    │
│                                                                  │
│ Output: `canvas_build_plan.json` con etapas ordenadas            │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
              ┌──────── USER APRUEBA PLAN ────────┐
              └───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ FASE 2 — Staged Build Executor (por etapa, sync + async híbrido) │
│                                                                  │
│ POR CADA etapa del plan:                                         │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 2.1 Micro-strategist: refina goal solo de ESTA etapa         │ │
│ │ 2.2 Micro-architect: diseña nodos de ESTA etapa usando       │ │
│ │     - ARCHITECT_PROMPT existente                             │ │
│ │     - initialInput ya resuelto                               │ │
│ │     - Constraint: usar IDs reales de recursos                │ │
│ │ 2.3 Micro-QA: valida contratos de ESTA etapa                 │ │
│ │ 2.4 Persist stage → inserta nodos en flow_data                │ │
│ │ 2.5 Placeholder test: ejecuta etapa con side effects         │ │
│ │     mockeados (send_email marca [TEST])                      │ │
│ │ 2.6 User valida shape de output real → aprueba o pide fix   │ │
│ │ 2.7 Siguiente etapa                                          │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ AL FINAL: canvas completo, probado por etapas, listo para        │
│           ejecución real en `/catflow`                           │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 Integración con código existente

| Componente | Cambio | Esfuerzo estimado |
|------------|--------|-------------------|
| Tooling (list_*) | Ninguno | 0 |
| `canvas-executor.ts` | Ninguno | 0 |
| `intent-job-executor.ts` | Añadir fases `resource_scan`, `clarification`, `stage_plan`, `stage_execute` | Medio |
| `catbot-prompt-assembler.ts` | Auto-inject skill `Resource Analyst` al detectar intent creación | Bajo |
| `catbot-pipeline-prompts.ts` | Ajustar ARCHITECT_PROMPT para aceptar `initialInput` tipado | Bajo |
| `app/data/skills/resource-analyst.md` | **Nuevo**: skill con protocolo + framework de scoring | Medio (prompt eng.) |
| `app/data/skills/builder-planner.md` | **Nuevo**: skill con protocolo de etapas | Medio |
| `app/data/skills/staged-executor.md` | **Nuevo**: skill por-etapa | Medio |
| `app/data/knowledge/canvas-rules-index.md` | Añadir reglas sobre placeholder/test mode | Bajo |
| DB: `intent_jobs` schema | Añadir columnas `resource_report`, `stage_plan`, `current_stage` | Bajo |
| DB: tabla nueva `canvas_build_stages` | Opcional — trazabilidad por etapa | Bajo |

**Código de runtime NO TOCAR:** canvas-executor, executeCatPaw, MCP bridge, connector contracts. Todo lo que es el motor actual sigue intacto.

---

## 6. El mecanismo de placeholder

### 6.1 Regla semántica (clarificación del usuario)

> *"esto de reales y placeholder no te confundas de que debemos recrear lo que pasa, esto va mas por si analizamos o enviamos correos puede ser el contenido ficticio pero el resto de cosas deben ser reales para verificar bien"*

**Interpretación:** Placeholder **no** significa mock de todo el sistema. Significa:

- ✅ Reales: todos los IDs, UUIDs, conectores, fechas, estructuras de datos, llamadas a APIs de lectura.
- 🧪 Placeholder: solo el contenido de **efectos laterales observables por terceros** — subject/body de emails, mensajes de Slack, llamadas HTTP outbound con carga útil.

### 6.2 Implementación propuesta

Añadir a Agent/Connector nodes un flag de diseño:

```json
{
  "type": "connector",
  "data": {
    "role": "emitter",
    "connectorId": "<gmail-uuid-real>",
    "test_mode": {
      "enabled": true,
      "payload_override": {
        "subject": "[TEST] {original_subject}",
        "body_prefix": "---- EJECUCIÓN DE PRUEBA ----\nSi recibes este email...\n---\n"
      }
    }
  }
}
```

**Comportamiento en runtime** (canvas-executor extension, pequeña):

- Si `test_mode.enabled === true`, canvas-executor modifica el payload antes de llamar al connector.
- El resto del flujo (lectura de Holded, análisis, synthesizer, renderer) se ejecuta con datos reales.
- El receptor verá "[TEST]" en el subject.

### 6.3 Promoción a real

Cuando el usuario valida la etapa:

- Toggle `test_mode.enabled = false` (o eliminar el campo).
- Re-ejecutar (esta vez el email llega normal).
- Validación final y avance a siguiente etapa.

### 6.4 Ventajas

- Cero mocks ficticios del sistema — todas las integraciones reales se prueban.
- El usuario ve la forma real del output.
- No hay riesgo de "funciona en test pero falla en prod" porque **test y prod son la misma configuración** salvo el marcador en el payload.
- El mecanismo se generaliza a cualquier emitter con un payload override simple.

---

## 7. Eficiencia de tokens

Presupuesto estimado por petición (comparado con el flujo actual):

### 7.1 Flujo actual (job 24738d3b — fallido)

| Fase | Tokens estimados | Coste |
|------|------------------|-------|
| Complexity gate | ~500 | Barato |
| Strategist | ~1.5K | Barato |
| Decomposer | ~2.5K | Medio |
| Architect iter 0 | ~8K | Alto |
| QA iter 0 | ~4K | Medio |
| Architect iter 1 | ~8K | Alto |
| QA iter 1 | ~4K | Medio |
| Architect iter 2 | ~8K | Alto |
| QA iter 2 | ~4K | Medio |
| Architect iter 3 | ~8K | Alto |
| QA iter 3 | ~4K | Medio |
| **Total** | **~52K tokens** | **~$0.40 wasted** (job falló) |

### 7.2 Flujo con wizard (estimado)

| Fase | Tokens estimados | Cómo se optimiza |
|------|------------------|------------------|
| Resource Analyst (1 call) | ~6K | Llama list_* (sync), devuelve .md. Input pequeño (petición + inventarios comprimidos) |
| Clarification (0-2 Q&A) | ~1K | Preguntas cortas, respuestas cortas |
| Builder Planner | ~3K | Recibe recursos resueltos, emite plan (JSON ligero) |
| Staged Build (3 etapas típicas) | ~10K total | Cada etapa: architect micro (~2K) + QA micro (~1K). Menos iteraciones por input tipado |
| Placeholder test execution | 0 LLM | Runtime puro |
| **Total esperado** | **~20K tokens** | **~$0.15 con canvas entregado** |

**Ahorro esperado: ~60%** + éxito garantizado vs fallo.

### 7.3 Tácticas concretas de ahorro

1. **Inventario comprimido para Resource Analyst:** pasar solo `{id, name, tags}` de CatPaws/connectors, no system_prompts completos. El Analyst pide detalle solo del top-3 candidato.
2. **Caché de scoring:** si el usuario hace 3 canvases similares, reusar scores entre sesiones (hash del tipo-de-operación).
3. **Lazy discovery:** `mcp_bridge.discover_tools` solo si la operación **necesita** un MCP (no descubrir siempre todos).
4. **Stage-scoped context:** cada Staged Build solo ve su stage, no todo el canvas.
5. **Batch de stages simples:** si dos stages tienen <3 nodos y sin ambigüedad, ejecutarlas en la misma llamada al architect.

---

## 8. Gaps e implementación por fases (preview)

**Nota:** esto NO es un plan de implementación — es un preview de cómo se podría fasear si apruebas el análisis.

### Fase propuesta 1 — Resource Analyst MVP
- Skill `resource-analyst.md` con protocolo de escaneo + scoring.
- Auto-invocación al detectar verbos de creación (crea, diseña, construye) + objeto (catflow, canvas, pipeline).
- Generación del informe .md en el panel CatBot.
- Sin cambios de DB ni de runtime.
- **Probable 1 fase GSD.**

### Fase propuesta 2 — Clarification Loop + Typed initialInput
- Ciclo Q&A estructurado (no chat libre — botones o slots).
- Actualización de ARCHITECT_PROMPT para aceptar `initialInput` tipado.
- Adaptación del START schema (campo `structured_input`).
- **Probable 1 fase GSD.**

### Fase propuesta 3 — Builder Planner + Stage Plan
- Skill `builder-planner.md`.
- Nuevas columnas en `intent_jobs` (o tabla nueva `canvas_build_stages`).
- UI para visualizar el plan de etapas al usuario (opcional: terminal inicial).
- **Probable 1 fase GSD.**

### Fase propuesta 4 — Staged Build + Placeholder Test
- Skill `staged-executor.md`.
- Runtime extension para `test_mode` en Agent/Connector emitters.
- Integración con el pipeline existente (strategist/decomposer/architect como motor por-etapa).
- **Probable 2 fases GSD** (por el cambio runtime).

### Fase propuesta 5 — Self-learning (opcional, futuro)
- Registrar qué canvases se aprobaron / rechazaron / modificaron.
- Alimentar `best_for` y scoring con datos reales.
- Identificar patrones de "qué pide el usuario que NO existe y acaba creándose" → sugerir creación de CatPaws base.

---

## 9. Riesgos y decisiones pendientes

### 9.1 Riesgos identificados

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| El wizard añade fricción para peticiones simples | Alta | Umbral de complejidad: canvas con ≤3 nodos y 0 ambigüedades → bypass del wizard, ir directo |
| El scoring semántico (embeddings) requiere servicio nuevo | Media | MVP puede usar matching léxico (keywords) o LLM-as-judge sobre inventario comprimido |
| El user responde "no sé" a las preguntas | Media | Fallback: el wizard elige por default razonado y lo deja marcado para modificación post-ejecución |
| Etapas muy pequeñas → overhead | Media | Heurística mínima: no partir canvas de <5 nodos en etapas |
| El placeholder test puede ocultar bugs reales | Baja | Forzar al menos 1 ejecución no-placeholder antes de cerrar el canvas |
| Dependencia fuerte del LLM del Analyst | Alta | Framework de scoring **debe** ser calculado en código (no LLM) — el LLM solo genera el informe a partir de los scores |

### 9.2 Decisiones pendientes (para discutir)

1. **Granularidad de etapas:** ¿hasta qué punto dividir? Propuesta: 1 etapa = 1 responsabilidad funcional (extracción / análisis / emisión). Máximo 4 etapas. Mínimo 1 (canvas simple = sin stages).

2. **¿Dónde vive el informe .md del Analyst?** Opciones:
   - En memoria de conversación (no persistido).
   - En una tabla `canvas_build_reports` (auditable).
   - En `.planning/reports/canvas-{id}-analysis.md` (consistente con GSD pero mezcla con planning del proyecto).

3. **¿Quién puede saltar el wizard?** Propuesta: nadie por default. Añadir flag `--skip-wizard` solo para usuarios con sudo + flag explícito.

4. **¿Qué hacer si el user cambia de opinión mid-stages?** Opciones:
   - Rehacer desde stage actual.
   - Versionar el canvas y bifurcar (requiere trabajo de DB).

5. **Modelo del Analyst:** ¿Sonnet (buen razonamiento, medio coste) o Opus (calidad pero caro)? Propuesta: Sonnet como default; Opus solo si complexity clasifica >= 8.

---

## 10. Resumen ejecutivo

### Lo que cambia conceptualmente

De: *"Pipeline async que adivina y falla → user recibe o nada o un canvas roto."*
A: *"Wizard que descubre, resuelve, pregunta lo justo, construye por etapas validadas → user aprueba cada paso."*

### Lo que NO cambia

- Motor de ejecución de canvas (canvas-executor).
- Tools de descubrimiento (todas existen).
- Pipeline strategist/decomposer/architect/QA (se reutiliza por-etapa).
- Modelo dos capas del Agent node (pilar de "reuse + extras").
- GSD como patrón mental.

### Lo que se gana

1. **Canvases ejecutables desde la primera vez** — no fabricación de IDs/emails/templates.
2. **Tokens reducidos ~60%** en peticiones complejas.
3. **Usuario en el loop** con preguntas concretas, sin entrevistas largas.
4. **Validación progresiva** — no "todo o nada".
5. **Reutilización real de recursos** — el scoring evita clonar CatPaws innecesariamente.

### El ancla central

El framework "Reuse as-is / Reuse + extras / Clone / Create" con scoring explícito. Es lo que convierte el sistema de "LLM adivina" a "sistema razona contra inventario real". Es lo que hay que implementar bien. Si eso falla, el wizard no aporta nada.

---

## Apéndice A — Ejemplo trazado con la petición real

Petición: *"Crea un CatFlow que envíe un informe comparativo de facturación Q1 2025 vs Q2 2026 de Holded con análisis financiero y lo envíe con template corporativo a antonio@educa360.com"*.

### Fase 0 — Resource Analyst

**Parse → operaciones abstractas:**
1. `extract:invoices:Q1_2025` (extractor desde MCP Holded)
2. `extract:invoices:Q2_2026` (extractor desde MCP Holded, en paralelo con 1)
3. `analyze:financial_comparison` (transformer/synthesizer)
4. `render:corporate_email` (renderer)
5. `send:email:recipient=antonio@educa360.com` (emitter)

**Scoring CatPaws:**

| Operación | Candidato | Score | Decisión |
|-----------|-----------|-------|----------|
| extract:invoices | Operador Holded (53f19c51) | 92% (tools ✓, best_for ✓) | reuse-as-is |
| extract:invoices | Consultor CRM (b63164ed) | 78% (rígido) | descartado |
| analyze:comparison | Analista de Facturas (a3c5df1e) | 88% (sin skill específica) | reuse + extras |
| render:corporate_email | Maquetador Email (e9860d40) | 80% (template no vinculado) | reuse + extras |

**Scoring Connectors:**

| Operación | Candidatos |
|-----------|------------|
| MCP Holded | `seed-holded-mcp` (único) → auto-resolved |
| Gmail sender | Info (67d945f0) ⭐, Antonio (43cbe742), Sierra (ac75321f), Auth (1d3c7b77) → **preguntar** |
| Email template | Plantilla Corporativa (seed-tem), Corporativa Educa360 (seed-tpl) → **preguntar** |

**MCP tool real (via discover_tools):** `list_documents({docType:"invoice", starttmp, endtmp})` — único que cubre facturas.

**Deixis resuelta:**
- Q1 2025 → `{start:"2025-01-01", end:"2025-03-31", starttmp:1735689600, endtmp:1743379199}`
- Q2 2026 → `{start:"2026-04-01", end:"2026-06-30", starttmp:1774003200, endtmp:1782777599}`
- antonio@educa360.com → literal, destinatario

**Informe .md emitido:**

```markdown
# Análisis de canvas — Comparativa Facturación Q1 2025 vs Q2 2026

## Operaciones detectadas: 5
1. Extracción Q1 2025 (Holded MCP)
2. Extracción Q2 2026 (Holded MCP, en paralelo)
3. Análisis financiero comparativo
4. Maquetación con template corporativo
5. Envío email a antonio@educa360.com

## Recursos propuestos (reutilización)
- **Extractores:** Operador Holded (53f19c51) × 2 instancias
- **Analista:** Analista de Facturas (a3c5df1e) + skill de comparativas trimestrales (a añadir a canvas)
- **Maquetador:** Maquetador Email (e9860d40) + template corporativo (a decidir)
- **MCP tool:** list_documents(docType=invoice, starttmp, endtmp)

## Preguntas para ti
1. **¿Desde qué cuenta Gmail envío?**
   - [ ] info@educa360.com (sugerido — corporativa)
   - [ ] antonio@educa360.com
   - [ ] Antonio Sierra Sánchez
   - [ ] Info_Auth_Educa360

2. **¿Qué template de los dos "corporativos"?**
   - [ ] Plantilla Corporativa (genérica)
   - [ ] Corporativa Educa360 (específica)

3. **¿Q2 2026 se entiende como abril-junio 2026?** (para confirmar fechas ISO)

## Estructura propuesta (4 nodos + 1 guard)
START → [Extract Q1 2025 ∥ Extract Q2 2026] → Analyze → Render → Guard → Send
```

### Fase 1 — Builder Planner (después de respuestas del user)

```yaml
stages:
  - name: "Extracción paralela de facturas"
    nodes: [n1, n2]
    contract_in: { periods }
    contract_out: { invoices_q1_2025[], invoices_q2_2026[] }
    test_mode: false
  - name: "Análisis comparativo"
    nodes: [n3]
    contract_in: { invoices_q1_2025[], invoices_q2_2026[] }
    contract_out: { invoices_q1_2025[], invoices_q2_2026[], totals, deltas, narrative }
    test_mode: false
  - name: "Maquetación + Envío"
    nodes: [n4, n_guard, n5]
    contract_in: { narrative, totals, deltas }
    contract_out: { status, message_id }
    test_mode: true  # placeholder en el primer run
```

### Fase 2 — Staged Build (por stage)

Stage 1 → construido, ejecutado con datos reales de Holded, validado por user.
Stage 2 → construido, ejecutado con outputs de stage 1, validado.
Stage 3 → construido, ejecutado en test_mode (email llega a antonio con `[TEST]` en subject), validado. Toggle test_mode → re-ejecutar → envío real.

**Canvas final:** validado por etapas, recursos reales, ejecutable reproduciblemente.

---

## Apéndice B — Snapshots de código relevantes

**Dos capas Agent node — canvas-executor.ts:516-524**

```typescript
const extraSkillIds = (data.skills as string[]) || [];
const extraConnectorIds = (data.extraConnectors as string[]) || [];
const extraCatBrainIds = (data.extraCatBrains as string[]) || [];
const pawResult = await executeCatPaw(agentId, pawInput, {
  ...(extraSkillIds.length > 0 ? { extraSkillIds } : {}),
  ...(extraConnectorIds.length > 0 ? { extraConnectorIds } : {}),
  ...(extraCatBrainIds.length > 0 ? { extraCatBrainIds } : {}),
});
```

**State machine intent_jobs — intent-job-executor.ts:128,375-444**

```typescript
private static readonly STALE_PHASES = ['strategist', 'decomposer', 'architect'] as const;
// ... transitions:
updateIntentJob(job.id, { pipeline_phase: 'strategist' });   // line 375
updateIntentJob(job.id, { pipeline_phase: 'decomposer' });   // line 388
updateIntentJob(job.id, { pipeline_phase: 'architect' });    // line 405, 444
```

Extensible añadiendo fases sin romper lo existente.

---

*Documento abierto para discusión. Ningún commit de código implementacional pendiente.*
