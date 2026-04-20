---
title: Auditoría — Pipeline Architect + QA Loop + Side-Effect Guards
scope: Phases 130, 131, 132 + hotfixes post-132
created: 2026-04-11
status: working-document
purpose: Inventario técnico, casuística de fallos, estado actual y planteamiento para la siguiente iteración. Insumo para decidir Phase 133.
---

# Auditoría — Calidad del Pipeline de Generación de CatFlows

> Documento de trabajo previo a planificar Phase 133.
> No es un plan. No contiene tareas. Solo diagnóstico + enfoque conceptual.

---

## 1. Contexto y alcance

### Qué abarca esta auditoría
- El **Pipeline Architect asíncrono** que transforma una petición compleja del usuario (vía Telegram o web) en un canvas ejecutable.
- Las 3 fases LLM del pipeline: `strategist → decomposer → architect`.
- El **QA loop** introducido en Phase 132 (architect ↔ reviewer, max 2 iteraciones).
- Los **side-effect guards** auto-insertados antes de nodos destructivos.
- El **auto-repair** runtime cuando un guard falla.
- La propagación de **channel_ref** para notificar al usuario en el canal originario.
- Los **prompts** que alimentan cada fase (`STRATEGIST_PROMPT`, `DECOMPOSER_PROMPT`, `ARCHITECT_PROMPT`, `CANVAS_QA_PROMPT`, `AGENT_AUTOFIX_PROMPT`).

### Qué NO abarca
- Canvas executor interno (`canvas-executor.ts`) — funciona, no lo tocamos.
- CatBot chat general, Telegram bot routing, sudo, permisos.
- Knowledge tree / RAG / Discovery.
- UI de `/catflow` y editor visual (Phase 24).

### Caso de referencia canónico
Petición real del usuario vía Telegram:
> "Extrae la facturación Q1 2026 de Holded, haz lo mismo con Q1 2025, genera una comparativa contable ejecutiva, maquétala con el template corporativo, y envía el correo a antonio@educa360.com y fen@educa360.com"

Este caso es el que motivó Phase 132 y el que seguimos sin cerrar. Todo lo que sigue se evalúa contra él.

---

## 2. Inventario técnico — qué hemos construido

### Phase 130 — Pipeline async base (funciona)
**Objetivo:** dejar de colgar a CatBot durante tareas de 3+ minutos; mover la generación de canvas a un worker con estado persistente.

**Entregas:**
- `intent_jobs` tabla con state machine (`pending → strategist → decomposer → architect → awaiting_approval/awaiting_user/failed`).
- `IntentJobExecutor` singleton con tick de 30s y BOOT_DELAY de 60s.
- 3 prompts LLM independientes, cada uno con `response_format: json_object`.
- `validateFlowData` (validator estructural del output del architect).
- `scanCanvasResources` (inventario de CatPaws/CatBrains/skills/connectors disponibles para el architect).
- Propuesta al usuario vía inline keyboard de Telegram al finalizar (aprobar/cancelar).

**Estado:** sólido. Los tests unitarios cubren state machine y parsing. Zero regressions conocidas.

---

### Phase 131 — Channel propagation + progress reporter (funciona)
**Objetivo:** el usuario debe recibir actualizaciones de progreso durante la ejecución sin spam.

**Entregas:**
- `intent_jobs.channel` y `intent_jobs.channel_ref` persistidos en el enqueue.
- `notifyProgress` con throttling de 60s por jobId.
- Flag `force=true` para eventos críticos (fin de fase, error).
- Limpieza de throttle Map en transiciones terminales.

**Estado:** sólido. El gap era que la ruta `exhaustion` del QA loop no llama `notifyProgress`, ver §4-caso-5.

---

### Phase 132 — QA loop + rules index + side-effect guards
**Objetivo:** que los canvases generados sean de calidad profesional (no válidos-pero-vacíos como en el fallo Holded Q1 original).

**Entregas:**

#### 132-01 — Rules index infra
- `app/data/knowledge/canvas-rules-index.md` (32 reglas, R01-R25 + SE01-SE03 + DA01-DA04, ≤100 chars cada una).
- `canvas-rules.ts` con `loadRulesIndex()` + `getCanvasRule(id)` cacheados.
- Parseo de R01-R25 desde `.planning/knowledge/canvas-nodes-catalog.md` para expansión long-form.

#### 132-02 — Prompts rewrite + QA loop
- `ARCHITECT_PROMPT` reescrito con `{{RULES_INDEX}}` placeholder + campo `needs_rule_details` para expansion pass on-demand.
- `CANVAS_QA_PROMPT` nuevo con schema JSON `{quality_score, issues[], data_contract_analysis, recommendation}`.
- `AGENT_AUTOFIX_PROMPT` nuevo para auto-repair runtime.
- `runArchitectQALoop` con `MAX_QA_ITERATIONS=2` + expansion pass intra-iteración.
- Integración en `runFullPipeline` y (hotfix) en `runArchitectRetry`.

#### 132-03 — Side-effect guards + auto-repair
- `isSideEffectNode(node, ctx)` — clasificador puro por tipo + data + connector context.
- `insertSideEffectGuards(flowData, ctxResolver)` — post-procesador que inserta `condition + reporter` antes de cada nodo destructivo. Excluye el body de iteradores.
- `canvas-auto-repair.ts` con `attemptNodeRepair` — resuelve canvas_run activo, contador `repair_attempts`, un reintento, logKnowledgeGap en exhaustion.
- Tool interna `_internal_attempt_node_repair` (gated por prefijo `_internal_`).
- Reporter nodes auto-insertados como `agent` con `data.agentId=null + data.auto_inserted=true + data.tools=[...]`.

#### 132-04 — UAT oracle placeholders
- `132-VERIFICATION.md` con 8/8 observable truths verified por unit tests.
- `132-UAT.md` con casos que requieren runtime real (auto-aprobados en yolo mode).
- `deferred-items.md` con 9 tests pre-existentes que fallan en módulos no relacionados.

**Estado al cerrar Phase 132 (2026-04-10):** 95/95 tests del suite de 132 verdes. Build limpio. Infraestructura completa.

---

### Hotfix post-132-A — 3 limitaciones conocidas (commit `216136b`)
Cerró los 3 anti-patterns que quedaron documentados como INFO en `132-VERIFICATION.md`:

1. **ctxResolver inyectado en `finalizeDesign`** — `buildConnectorCtxResolver()` cachea lookup `connectors.type` por `data.connectorId`. Connectors Gmail/SMTP/http_api/mcp_server sin `mode`/`action` explícito ahora reciben guard.
2. **Columnas first-class `channel` + `channel_ref` en `notifications`** — ALTER TABLE idempotente. `createNotification` las expone como params. `notifyUserIrreparable` además hace push directo a `telegramBotService.sendMessage` cuando el pipeline originó en Telegram.
3. **`runArchitectRetry` envuelto en `runArchitectQALoop`** — la ruta de reanudación tras aprobación de CatPaws pasa por el mismo gating de calidad que pipelines frescos.

**Estado:** tests 95/95 verdes. Commit verificado.

---

### Hotfix post-132-B — expuesto por primera ejecución real (sin commit aún)
Al lanzar el caso Holded Q1 real vía Telegram el 2026-04-10 23:06 UTC, surgieron 2 fallos nuevos:

1. **`docker-entrypoint.sh` no copiaba `.md`** — solo `*.json`. El rules index nunca llegó al volumen montado. Pipeline falló con ENOENT en architect phase. **Fix aplicado** en `docker-entrypoint.sh` (añadido `cp -u *.md`).
2. **`VALID_NODE_TYPES` desincronizado con el executor** — faltaban `start`, `merge`, `output`, `storage`, `iterator_end`. El executor los maneja desde Phase 130, pero `validateFlowData` los rechazaba. Expuesto porque el QA loop de 132 empezó a generar canvases más ricos que usaban estos tipos. **Fix aplicado** en `canvas-flow-designer.ts` (+5 tipos, test actualizado).

**Estado:** builds locales OK, 67/67 tests verdes, contenedor rebuildado y desplegado. Sin commit todavía (pendiente de decisión sobre Phase 133).

---

## 3. Objetivo del producto (por qué existe todo esto)

El usuario quiere poder decir en lenguaje natural, por Telegram o por web, **una tarea compleja** que involucre:
- Extracción de datos de sistemas externos (Holded, Drive, email)
- Transformación/análisis (comparativas, resúmenes, enriquecimientos)
- Renderizado (templates HTML, PDFs)
- Emisión a canales externos (email, almacenamiento, webhook)

Y recibir el resultado **en el mismo canal** donde hizo la petición, **sin**:
- Tener que diseñar el canvas manualmente en el editor visual
- Quedarse sin feedback durante la ejecución
- Recibir un resultado vacío o estructuralmente válido pero inútil
- Tener que reintentarlo manualmente cuando algo falla arriba

**Métrica cualitativa de éxito:** un contable/administrador no-técnico puede pedir "comparativa Q1 + envío email" y el email llega con contenido real.

**Métrica cuantitativa observable:** el caso Holded Q1 de referencia debe producir un email con:
- Cifras reales de ambos periodos
- Template corporativo HTML aplicado
- Los 2 destinatarios configurados
- Sin placeholders ni texto lorem

---

## 4. Casuística de fallos reales (5 casos, de más antiguo a más reciente)

### Caso 1 — Holded Q1 original (motivador de Phase 132)
**Fecha:** pre-132
**Síntoma:** canvas estructuralmente válido, 5 nodos, ejecutado en 3m 15s y 82K tokens. Email enviado a 1 destinatario, sin template aplicado, con contenido vacío.
**Causa raíz:** instructions de los nodos no declaraban contratos de datos. El maquetador no sabía qué campos esperar del resumidor. El emitter Gmail leyó el destinatario de texto libre en vez de un campo.
**Solución intentada:** toda Phase 132 (rules index + QA loop + guards + auto-repair).
**Estado:** parcialmente. La infraestructura está, pero los prompts no son lo bastante expresivos como para producir instructions profesionales (ver caso 4).

---

### Caso 2 — `ENOENT: canvas-rules-index.md`
**Fecha:** 2026-04-10 23:07 UTC (primera ejecución real post-hotfix-A)
**Síntoma:** pipeline llega a fase architect y crashea leyendo el rules index.
**Causa raíz:** `docker-entrypoint.sh` solo sincronizaba `*.json` al volumen montado. El `.md` nuevo de Phase 132 nunca entró al contenedor en Docker deployments.
**Solución aplicada:** entrypoint actualizado para también copiar `*.md`. `docker cp` manual para desbloquear el contenedor corriendo sin esperar rebuild.
**Estado:** cerrado. Pendiente commit.

---

### Caso 3 — `validateFlowData` rechaza `start`/`merge`
**Fecha:** 2026-04-10 23:12 UTC (segunda ejecución, tras fix del caso 2)
**Síntoma:** QA loop converge a accept (iter 1, score 95), pero `finalizeDesign` rechaza el canvas con `node start has invalid type start; node n3 has invalid type merge`.
**Causa raíz:** `VALID_NODE_TYPES` de Phase 130 listaba 9 tipos; el executor maneja 14 desde siempre. El validator nunca se sincronizó. Phase 132 lo expuso porque el architect mejorado empezó a generar canvases con los 5 tipos faltantes.
**Solución aplicada:** `VALID_NODE_TYPES` extendido a 14 tipos (`start`, `iterator_end`, `merge`, `storage`, `output` añadidos). Test actualizado.
**Estado:** cerrado. Pendiente commit.

---

### Caso 4 — R10 over-strict en nodos emitter (CRÍTICO — no resuelto)
**Fecha:** 2026-04-10 23:18-23:19 UTC (tercera ejecución, tras fix del caso 3)
**Síntoma:** QA loop ejecuta 2 iteraciones completas (scores 70 → 75, ambas `revise`). Exhaustion. `knowledge_gap` logged. Usuario no recibe email.

**Issues reportados por el reviewer (extractos del knowledge_gap):**
```
severity: major, rule_id: R10, node_id: n3
  "El nodo no mantiene los campos originales del input en su output"
  fix_hint: "Añade 'facturacion_q1_2025' y 'facturacion_q1_2026' al OUTPUT de n3"

severity: major, rule_id: R10, node_id: n4
  "El nodo no mantiene los campos originales del input en su output"
  fix_hint: "Añade 'comparativa_ejecutiva' al OUTPUT de n4"

severity: major, rule_id: R10, node_id: n5 (el Gmail emitter)
  "El nodo no mantiene los campos originales del input en su output"
```

**Causa raíz:** R10 dice "JSON in → JSON out, mantén todos los campos". El reviewer lo aplica mecánicamente a **n5 (Gmail send_email)** que es un emitter terminal cuyo output es un `ack` de envío, no un JSON enriquecido. El architect recibe el feedback pero no sabe cómo responder porque R10 aplicado a un emitter es contradictorio. Itera, no mejora, agota.

**El patrón subyacente:** ni el architect ni el reviewer distinguen entre **roles funcionales** de nodos:
- Extractor (inicio, sin input → genera data)
- Transformer (data in → data in + enriquecida)
- Synthesizer (varios in → resumen)
- Renderer (data in → artefacto HTML/PDF)
- Emitter (artefacto in → ack, terminal)
- Guard (data in → yes/no)
- Reporter (auto-insertado)

R10 aplica a **transformer** y parcialmente a **synthesizer**. **No aplica** a extractor/renderer/emitter/guard/reporter. El reviewer no lo sabe. El architect no lo sabe. Los prompts no lo enseñan.

**Solución aplicada:** ninguna todavía. Es lo que motiva esta auditoría.
**Estado:** ABIERTO. Blocker del caso Holded Q1.

---

### Caso 5 — Exhaustion silenciosa (no hay notificación al usuario)
**Fecha:** 2026-04-10 23:19 UTC (detectado durante el caso 4)
**Síntoma:** pipeline falla con `QA loop exhausted after 2 iterations`. El usuario queda esperando. No recibe nada por Telegram. La única evidencia es el row en `intent_jobs` y el `knowledge_gap`.
**Causa raíz:** `runArchitectQALoop` en el path de exhaustion hace `updateIntentJob(status='failed') + saveKnowledgeGap + markTerminal` pero **no llama `notifyProgress`**. Solo el `catch(err)` de `tick()` lo hace, y este path no lanza excepción — retorna null.

El hotfix post-132-A arregló `notifyUserIrreparable` (auto-repair runtime failure) con first-class `channel_ref`, pero ese fix **no cubre esta ruta** porque es una función distinta.

**Solución aplicada:** ninguna.
**Estado:** ABIERTO. Aunque arreglemos el caso 4, si en el futuro el QA agota legítimamente, el usuario debe saber.

---

## 5. Estado actual del sistema — lo que funciona y lo que no

### Componentes sólidos (NO tocar en Phase 133)
| Componente | Estado | Evidencia |
|------------|--------|-----------|
| State machine `intent_jobs` | ✅ | 23/23 tests, ejecución real OK hasta architect phase |
| `strategist` y `decomposer` prompts | ✅ | Producen goal + tasks coherentes en el caso Holded real |
| `scanCanvasResources` | ✅ | Inventario de recursos correcto |
| `loadRulesIndex` / `getCanvasRule` | ✅ | 12/12 tests, lookup case-insensitive |
| `runArchitectQALoop` infra (iteraciones, expansion pass, accept/revise) | ✅ | 23/23 tests, ejecución real muestra loop funcionando |
| `isSideEffectNode` + `insertSideEffectGuards` | ✅ | 36/36 tests |
| `attemptNodeRepair` + tool gating | ✅ | 7/7 tests |
| Channel propagation + notifyProgress throttling | ✅ | Usuario recibe updates de progreso real por Telegram |
| `ctxResolver` para connector lookup | ✅ | 67/67 tests tras hotfix |
| `validateFlowData` (tras hotfix) | ✅ | 14 tipos sincronizados con executor |

### Componentes frágiles (core de Phase 133)
| Componente | Problema | Impacto |
|------------|----------|---------|
| `ARCHITECT_PROMPT` | No enseña a escribir instructions profesionales. No declara roles. Ejemplos ausentes. | Instructions débiles → QA flaggea → arquitect no sabe corregir → exhaustion |
| `CANVAS_QA_PROMPT` | Aplica reglas mecánicamente por `type` declarado, no por rol funcional. `quality_score` único sin separar contratos de instructions. | Falsos positivos R10 en emitters/guards. Rechaza canvases válidos. |
| Taxonomía de roles | No existe. | No hay vocabulario compartido entre architect/reviewer/executor para razonar sobre el rol de un nodo |
| Exhaustion notification | No llama `notifyProgress` | Usuario no sabe que el pipeline falló |

### Gaps secundarios (menores, pero listar)
- `canvas-nodes-catalog.md` (fuente long-form de R01-R25) no está dentro del contenedor Docker → la expansión on-demand `getCanvasRule(R01)` devuelve null en producción. Degradación silenciosa.
- Tests de prompts no tienen casos sintéticos que reproduzcan fallos reales (ej: "canvas emitter sin preservación de campos → NO debe flaggear R10").
- `deferred-items.md` acumula 9 fallos pre-existentes en otros módulos (task-scheduler, holded-tools, knowledge-tree) que no bloquean pero ensucian.

---

## 6. Aprendizajes y anti-patterns detectados

### Aprendizaje 1 — Validators deben estar sincronizados con executors por diseño
El fallo del caso 3 (`VALID_NODE_TYPES` desincronizado) es un bug estructural. Cualquier constante que duplica conocimiento del executor es deuda esperando a explotar. Próxima vez: o lo derivamos del switch del executor, o lo leemos de una fuente única (ej: catalog JSON).

### Aprendizaje 2 — Infraestructura de despliegue no es "ya funcionará"
El fallo del caso 2 (`.md` no copiado) nos costó un ciclo completo. Archivos nuevos en `data/knowledge/` deben validarse explícitamente dentro del contenedor antes de marcar una fase como verificada. El checklist de verificación de Phase 132 no incluía "¿existe en `/app/data/knowledge/` dentro del contenedor?".

### Aprendizaje 3 — Los tests unitarios no cazan fallos de prompt engineering
Todos los tests de Phase 132 pasan. El caso 4 (R10 over-strict) no se detecta porque los tests mockean el LLM con respuestas canned. Los fallos de prompt solo se ven en ejecución contra LiteLLM real. Necesitamos una clase de tests que haga prompt replay contra un modelo determinista (seed, temp=0) con casos sintéticos.

### Aprendizaje 4 — El QA loop funciona, pero el feedback no es accionable
Ver al reviewer producir `recommendation=revise` con `fix_hint="Añade X al OUTPUT"` **y el architect no mejorar en la segunda iter** demuestra que el loop está sano pero el canal de feedback es ruido. El architect no sabe qué hacer con un fix_hint que contradice el propósito del nodo.

### Aprendizaje 5 — Patches aislados amplifican riesgo
Llevamos 2 hotfixes post-132. Cada uno resolvió un síntoma visible. Ninguno atacó el problema de fondo (prompts sin taxonomía de roles). El usuario lo señaló correctamente: "no centrar en mejorar los prompts de creación de nodos". **Stop patching, start re-designing.**

### Anti-pattern detectado — R10 como regla universal
R10 está escrita como si aplicara a todos los nodos. Los prompts la inyectan sin condicionales. El reviewer la aplica sin contexto. El resultado es un falso positivo por diseño. **Regla sin scope = regla mal escrita.**

---

## 7. Objetivo de la siguiente iteración

### Resultado observable del usuario
El caso Holded Q1 debe completarse end-to-end con éxito. El usuario envía la petición por Telegram y recibe en su inbox un email con cifras reales comparativas, template HTML corporativo aplicado, y los 2 destinatarios. Sin intervención manual.

### Resultado observable del sistema
- El QA loop debe converger en ≤ 2 iteraciones para el caso Holded Q1.
- Ningún falso positivo de R10 en nodos emitter/guard/reporter.
- Si una ejecución legítimamente agota el QA loop, el usuario recibe notificación por el canal original con los top issues.
- Los prompts del architect producen instructions que un humano experto validaría como profesionales (contexto, entrada, proceso, salida, herramientas, fallos).

### Lo que NO es objetivo
- Añadir tipos de nodo nuevos.
- Cambiar el executor.
- Rediseñar el auto-repair.
- Tocar la UI del canvas.
- Llegar al 100% de casos — solo necesitamos que el caso de referencia funcione y que los casos análogos (otros emitters, otros transformers) hereden la mejora sin esfuerzo adicional.

---

## 8. Planteamiento conceptual para alcanzarlo

El núcleo de la idea es introducir **taxonomía de roles funcionales** como vocabulario compartido entre architect, reviewer y (opcionalmente) executor. Los prompts dejan de razonar sobre `node.type` (estructural) y empiezan a razonar sobre `node.data.role` (funcional).

### Los 7 roles propuestos

| Rol | Ejemplos típicos | Input | Output | R10 | R01 |
|-----|------------------|-------|--------|-----|-----|
| **extractor** | start, Holded fetch, Drive list, Gmail list_inbox | trigger | datos crudos | ❌ (no hay input que preservar) | ✅ (declarar output) |
| **transformer** | agent normalizador, mapper | data | data enriquecida | ✅ estricto | ✅ |
| **synthesizer** | resumidor, comparador, analizador | varios data | resumen con nuevos campos | ⚠️ parcial (puede añadir, no perder esenciales) | ✅ |
| **renderer** | maquetador template, PDF builder | data + template id | artefacto (HTML string, bytes) | ❌ (output es artefacto, no JSON) | ✅ (declarar artefacto esperado) |
| **emitter** | send_email, storage write, http POST, multiagent dispatch | artefacto | ack de envío | ❌ (output es terminal) | ✅ (guard pre-condition) |
| **guard** | condition node | cualquier | yes / no | ❌ | ❌ (solo evalúa) |
| **reporter** | auto-insertado en guard.false | context del fallo | llama tools + termina | ❌ | ❌ |

### Principios que gobiernan el rediseño de los prompts

1. **El architect declara rol por nodo.** Cada nodo en `flow_data.nodes[].data.role` con uno de los 7 valores. Si no lo declara → el reviewer asume `transformer` (el más estricto) como default conservador.
2. **Instructions deben tener estructura fija según rol.** Por ejemplo todo `renderer` debe tener secciones `CONTEXTO / ENTRADA / TEMPLATE / PROCESO / SALIDA / HERRAMIENTAS / FALLO SI`. El architect recibe templates de instruction por rol en su prompt.
3. **El reviewer aplica reglas condicionalmente por rol.** R10 solo se evalúa si rol ∈ {transformer, synthesizer}. R01 se evalúa en todos salvo guard/reporter. Se introduce separación entre `data_contract_score` y `instruction_quality_score`.
4. **Ejemplos contrastados en el prompt.** Para cada rol crítico (renderer, emitter), 1 ejemplo "good" y 1 "bad" con explicación de por qué. Los ejemplos son el insumo de más alto apalancamiento en prompt engineering.
5. **El reviewer recomienda `accept` con warnings.** Si `data_contract_score >= 80` y no hay issues de severity `blocker`, aunque haya `major` en instruction_quality → accept. Los `major` se guardan como warnings no-bloqueantes. Esto evita el bucle "revise forever" que vimos en el caso 4.
6. **Exhaustion notifica al usuario** con los top-2 issues del último qa_report, por el canal original. (Fix del caso 5, bundle pequeño.)

### Por qué este enfoque y no otros

| Alternativa | Por qué descartada |
|-------------|---------------------|
| Subir `MAX_QA_ITERATIONS` a 3+ | Más LLM calls sin resolver el problema subyacente. El architect seguirá sin saber cómo corregir. |
| Modelo más potente (GPT-4o en vez de gemini-main) | No es un problema de capacidad, es de vocabulario. Un modelo potente sin taxonomía sigue aplicando R10 mecánicamente. |
| Quitar R10 completamente | Reintroducimos el fallo original del caso 1 (datos que se pierden entre nodos intermedios). |
| Validador programático post-architect | Duplica trabajo del reviewer. El LLM puede razonar mejor sobre roles si le damos el vocabulario. |
| Checkpoint humano obligatorio antes de emitter | El usuario explícitamente pidió automatización con fallback, no checkpoint manual. |

---

## 9. Riesgos conocidos del enfoque propuesto

| Riesgo | Mitigación |
|--------|------------|
| Prompts más grandes → más tokens / más latencia | Medir antes/después. Si pasamos de ~4K a ~8K tokens en el ARCHITECT_PROMPT, es aceptable dado que reduce iteraciones. |
| Rol mal declarado por el architect → regla mal aplicada | Default a `transformer` (más estricto) cuando el rol sea ambiguo o no esté declarado. |
| Ejemplos en el prompt sesgan al LLM a copiarlos literalmente | Rotar 2-3 ejemplos distintos por rol. Variar dominios (Holded, Drive, Gmail, genérico). |
| La taxonomía de 7 roles se queda corta cuando aparezcan nuevos casos | Diseñar con "other/generic" como fallback. Añadir roles es cambio aditivo, no breaking. |
| Tests unitarios siguen sin cazar regresiones reales de prompt | Añadir una categoría de **tests de replay contra LiteLLM real** con seed y temperatura 0, corriendo solo en demanda (no en CI) con 3 casos sintéticos canonizados. |
| Dos cambios grandes al mismo prompt a la vez (roles + exhaustion) inflan el riesgo | Separar en dos plans secuenciales. Primero roles (architect + QA), segundo exhaustion notification (10 líneas). |

---

## 10. Decisiones pendientes antes de planificar Phase 133

Preguntas explícitas que el usuario debe responder para fijar el scope del plan:

1. **¿Declaración explícita del rol por nodo en el canvas, o inferencia automática?**
   - Opción A: el architect declara `data.role` y lo persistimos en el canvas (hace el rol visible en UI y auditable).
   - Opción B: inferencia automática desde `data.mode`/`data.tool_name`/`data.extraConnectors` (cero cambios en schema del canvas).
   - Mi recomendación: **A**. Es más explícito y el architect ya lo está razonando internamente.

2. **¿Separar `quality_score` en dos sub-scores en el QA reviewer output?**
   - Opción A: sí, `data_contract_score` y `instruction_quality_score`. Más señal, más ruido.
   - Opción B: mantener `quality_score` único y añadir un campo `blockers_only_count`.
   - Mi recomendación: **A**, con threshold de accept en `data_contract_score >= 80 && blockers == 0`.

3. **¿Tests de prompt replay contra LiteLLM real?**
   - Son lentos (~30s cada uno) y costosos (consume API). Valen la pena solo si la Phase 133 debe garantizar no-regresión.
   - Mi recomendación: **sí, pero detrás de un flag** (`npm run test:prompts` separado de `npm run test`), con 3 casos canonizados (Holded, simple emitter, iterator con transformers).

4. **¿Arreglar el gap secundario de `canvas-nodes-catalog.md` no estando en el contenedor?**
   - Opción A: añadir un build step que lo copie a `app/data/knowledge/` como seed.
   - Opción B: dejar la degradación silenciosa (el architect tiene el index inline, la expansión on-demand solo se usa ocasionalmente).
   - Mi recomendación: **A**, es trivial (5 líneas en Dockerfile) y elimina un modo de fallo latente.

5. **¿Commit pendiente del hotfix-B (entrypoint .md + VALID_NODE_TYPES)?**
   - Antes de empezar Phase 133, commit ahora para tener baseline limpio.
   - O esperamos a que Phase 133 lo absorba en un commit mayor.
   - Mi recomendación: **commit ahora**, aislado, para no mezclar fixes de infra con cambios de prompt engineering.

---

## 11. Apéndice — referencias y archivos relevantes

### Archivos de código (orden de relevancia para Phase 133)
- `app/src/lib/services/catbot-pipeline-prompts.ts` — los prompts a reescribir
- `app/src/lib/services/intent-job-executor.ts` — `runArchitectQALoop`, exhaustion path
- `app/src/lib/services/canvas-flow-designer.ts` — `VALID_NODE_TYPES`, `isSideEffectNode`, `insertSideEffectGuards`
- `app/src/lib/services/canvas-rules.ts` — rules index loader
- `app/data/knowledge/canvas-rules-index.md` — rules index actual
- `app/src/lib/services/canvas-auto-repair.ts` — no tocar, solo referencia
- `app/src/lib/__tests__/catbot-pipeline-prompts.test.ts` — tests de prompts actuales
- `app/src/lib/__tests__/intent-job-executor.test.ts` — tests del QA loop

### Documentos de planning relevantes
- `.planning/phases/132-.../132-RESEARCH.md`
- `.planning/phases/132-.../132-VERIFICATION.md`
- `.planning/phases/132-.../deferred-items.md`
- `.planning/knowledge/canvas-nodes-catalog.md` — fuente long-form R01-R25 (fuera del contenedor actualmente)
- `skill_orquestador_catbot_enriched.md` — protocolo de decisión CatBot (referencia conceptual)

### Commits relevantes del arco
- Phase 130: `intent-jobs` state machine + async pipeline
- Phase 131: channel_ref propagation + progress throttling
- `f2f27c3` feat(132-01): rules index loader
- `1e4b65c` feat(132-02): ARCHITECT + CANVAS_QA + AGENT_AUTOFIX prompts
- `e6c53fd` feat(132-02): runArchitectQALoop + expansion pass
- `286760c` feat(132-03): isSideEffectNode + insertSideEffectGuards
- `764ea7a` feat(132-03): canvas-auto-repair + _internal_attempt_node_repair
- `26d245a` docs: phase 132 verification
- `216136b` fix(132): close 3 known limitations (ctxResolver + channel routing + retry QA)
- **(pendiente)** hotfix-B: entrypoint .md + VALID_NODE_TYPES

### Casos sintéticos canonizados (para futuros tests de prompt)
1. **Holded Q1** — extractor x2 + synthesizer + renderer + emitter. Rol crítico: renderer correctamente formateado + emitter sin R10 falso positivo.
2. **Inbox digest diario** — extractor (list emails) + iterator + transformer x1 body + synthesizer final + emitter (send_email). Rol crítico: R10 aplica en body del iterator pero no en emitter final.
3. **Drive file sync** — extractor (list files) + iterator + transformer (metadata) + storage (emitter). Rol crítico: storage clasificado como emitter, no como transformer.

---

_Documento generado el 2026-04-11 como insumo para decidir el scope de Phase 133._
_Autor: Claude (Opus 4.6) + usuario._
_Revisar y responder las 5 decisiones pendientes de §10 antes de escribir el plan._
