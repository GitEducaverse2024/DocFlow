> **⚠️ MOVED to `.docflow-kb/incidents/INC-01-agent-sin-catpaw.md .. INC-10-buildactivesets-wrong-db.md (10 archivos)`** during Phase 151 (2026-04-20).
>
> New locations:
> - `.docflow-kb/incidents/INC-01-agent-sin-catpaw.md .. INC-10-buildactivesets-wrong-db.md (10 archivos)`
>
> The content below is preserved for reference only — new edits MUST happen in the KB, not here.
> Eliminación física de este archivo: Phase 155 (cleanup final).

---
# Incidencias Conectores en Canvas
**Registro de problemas detectados y soluciones aplicadas**
**Actualizado:** 2026-03-31

---

## INC-01: Nodo Agent sin CatPaw no tiene acceso a tools de conectores

**Fecha:** 2026-03-31
**Severidad:** CRITICA — bloquea cualquier canvas que use Gmail/Drive/Holded

**Sintoma:** Un nodo Agent del canvas con `agentId: null` e `instructions` que piden usar `gmail_search_emails` o `drive_read_file` no ejecuta las herramientas. El LLM responde con un JSON describiendo lo que haria pero no lo hace.

**Causa raiz:** Cuando `agentId` es null, el canvas executor usa llamada LLM directa (`callLLM`) que NO tiene tool-calling. Las tools de Gmail/Drive/MCP solo se inyectan cuando hay un CatPaw vinculado que pasa por `executeCatPaw()`.

**Solucion:**
1. Crear CatPaws utilitarios con los conectores vinculados:
   - **Ejecutor Gmail** (id: `65e3a722-9e43-43fc-ab8a-e68261c6d3da`) — conector Info Educa360 Gmail
   - **Operador Drive** (id: `e05f112e-f245-4a3b-b42b-bb830dd1ac27`) — conector Educa360Drive
2. Asignar estos CatPaws como `agentId` en todos los nodos Agent que necesiten operar con conectores

**Regla para el futuro:** NUNCA crear un nodo Agent en canvas con `agentId: null` si necesita usar herramientas de conectores. Siempre vincular un CatPaw que tenga el conector linkado.

---

## INC-02: executeCatPaw() skipea Gmail — tools no disponibles en canvas

**Fecha:** 2026-03-31
**Severidad:** CRITICA — incluso con CatPaw vinculado, Gmail no funcionaba

**Sintoma:** Un nodo Agent con CatPaw que tiene conector Gmail vinculado ejecuta el CatPaw pero las tools de Gmail no aparecen. El agente no puede buscar, leer ni enviar emails.

**Causa raiz:** En `execute-catpaw.ts` linea 119:
```typescript
if (['google_drive', 'gmail'].includes(conn.connector_type)) {
  // Skip connector types that require specialized clients
  continue;
}
```
El codigo skipea Gmail y Drive en la fase de invocacion de conectores. Drive ya tenia tool-calling implementado mas abajo, pero Gmail no.

**Solucion aplicada:**
1. Importar `getGmailToolsForPaw` y `executeGmailToolCall` en execute-catpaw.ts
2. Cargar Gmail tools junto a Drive tools en la seccion 5 (build tool definitions)
3. Añadir Gmail dispatch en el tool-calling loop (seccion 6)
4. El skip ahora solo evita la invocacion directa del conector pero las tools se cargan correctamente

**Archivos modificados:** `app/src/lib/services/execute-catpaw.ts`

**Estado:** RESUELTO — requirio docker rebuild para desplegar

---

## INC-03: Nodo Connector (type=connector) es pass-through, no lee datos

**Fecha:** 2026-03-31
**Severidad:** DISEÑO — no es un bug, es comportamiento esperado que confunde

**Sintoma:** Se diseñaron canvas donde un nodo Connector leia emails o archivos de Drive. El nodo Connector NO lee — solo envia/ejecuta como efecto secundario y pasa el output del nodo anterior sin modificar.

**Causa raiz:** El nodo Connector esta diseñado como side-effect: toma el output del predecesor, lo usa como payload (ej: enviar email), y devuelve ese mismo output al siguiente nodo. NO genera output propio.

**Solucion:** Para LEER datos de Gmail o Drive, usar un nodo Agent con CatPaw que tenga las tools del conector. El nodo Connector solo sirve para ENVIAR (email, upload, webhook).

**Patron correcto:**
- Leer emails → Agent con CatPaw Ejecutor Gmail + instructions "usa gmail_search_emails..."
- Enviar email → Connector con conector Gmail (recibe JSON {to, subject, body} del nodo anterior)
- Leer archivo Drive → Agent con CatPaw Operador Drive + instructions "usa drive_read_file..."
- Subir archivo → Storage con connectorId de Drive, o Connector con Drive

---

## INC-04: Storage solo escribe, no lee

**Fecha:** 2026-03-31
**Severidad:** DISEÑO — comportamiento correcto pero no intuitivo

**Sintoma:** Se diseñaron canvas donde un nodo Storage leia un JSON de storage previo. El nodo Storage solo ESCRIBE.

**Solucion:** Para leer archivos previamente guardados:
- Si estan en disco local: no hay forma directa desde canvas (el Storage escribe en PROJECTS_PATH/storage/)
- Si estan en Drive: usar Agent con CatPaw Operador Drive + `drive_read_file`
- Si estan en ambos (storage_mode=both): leer desde Drive con Agent

---

## INC-05: Deploy Docker necesario tras cambios en execute-catpaw.ts

**Fecha:** 2026-03-31
**Severidad:** OPERATIVA

**Sintoma:** Tras corregir execute-catpaw.ts localmente, los canvas en Docker seguian sin funcionar.

**Causa raiz:** La app corre en Docker. Los cambios en el codigo fuente local no se reflejan hasta hacer `docker compose build && docker compose up -d`.

**Protocolo de deploy:**
```bash
cd ~/docflow
docker compose build --no-cache
docker compose up -d
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
docker restart docflow-app
```

---

## RESUMEN DE REGLAS PARA CANVAS

### Como usar cada tipo de conector en Canvas

| Operacion | Nodo correcto | CatPaw necesario | Conector vinculado a |
|-----------|--------------|------------------|---------------------|
| **Leer emails** | Agent | Ejecutor Gmail | Info Educa360 (Gmail) |
| **Enviar email** | Agent (genera JSON) → Connector (envia) | Ejecutor Gmail | Info Educa360 (Gmail) |
| **Responder en hilo** | Agent con gmail_reply_to_message | Ejecutor Gmail | Info Educa360 (Gmail) |
| **Marcar como leido** | Agent con gmail_mark_as_read | Ejecutor Gmail | Info Educa360 (Gmail) |
| **Leer archivo Drive** | Agent con drive_read_file | Operador Drive | Educa360Drive |
| **Subir archivo Drive** | Storage (mode=both) o Agent | Operador Drive | Educa360Drive |
| **Consultar Holded** | Agent | Consultor CRM (u otro con Holded) | Holded MCP |
| **Busqueda web** | CatBrain (WebSearch) o Agent con SearXNG | — | SearXNG |
| **Consulta RAG** | CatBrain | — | — |

### CatPaws utilitarios para Canvas

| CatPaw | ID | Conector | Uso |
|--------|-----|----------|-----|
| Ejecutor Gmail | `65e3a722-9e43-43fc-ab8a-e68261c6d3da` | Info Educa360 (Gmail) | Leer, buscar, enviar, responder, marcar emails |
| Operador Drive | `e05f112e-f245-4a3b-b42b-bb830dd1ac27` | Educa360Drive | Listar, buscar, leer, subir archivos |
| Consultor CRM | `b63164ed-83ae-40d0-950e-3a62826bc76f` | Holded MCP | Buscar contactos, leads, facturas, pipeline |

### Errores comunes a evitar

1. **NO** crear nodos Agent con agentId=null si necesitan tools de conectores
2. **NO** usar nodo Connector para LEER datos (solo para ENVIAR como side-effect)
3. **NO** usar nodo Storage para LEER datos previamente guardados
4. **NO** olvidar que los cambios en execute-catpaw.ts requieren Docker rebuild
5. **SIEMPRE** vincular el conector al CatPaw, no al nodo Agent directamente (el campo connectorIds del nodo Agent no se usa en la ejecucion)

---

## INC-06: Nodos borrados reaparecen en el Canvas UI

**Fecha:** 2026-03-31
**Severidad:** CRITICA — impide editar canvas correctamente

**Sintoma:** Al borrar un nodo del canvas, desaparece pero reaparece a los pocos segundos.

**Causa raiz:** Doble merge que re-añade nodos eliminados:
1. **Cliente** (canvas-editor.tsx): antes de guardar, fetch al servidor y re-añade nodos que el servidor tiene pero el cliente no (los que acaba de borrar)
2. **Servidor** (PATCH /api/canvas/[id]): compara incoming contra DB y re-añade nodos "missing"

**Solucion aplicada:**
1. Eliminado el pre-merge del cliente (ya no hace fetch al servidor antes de guardar)
2. Añadido flag `force_overwrite: true` que el cliente envia al servidor
3. El servidor skipea el merge cuando recibe `force_overwrite: true`

**Archivos modificados:**
- `app/src/components/canvas/canvas-editor.tsx` — eliminado bloque de pre-merge
- `app/src/app/api/canvas/[id]/route.ts` — añadido condicional `if (!force_overwrite)` al merge

---

## INC-07: Nodos fantasma del auto-create causan fallos de ejecucion

**Fecha:** 2026-03-31
**Severidad:** ALTA — canvas falla con "Model input cannot be empty"

**Sintoma:** Al crear un canvas via POST, se genera automaticamente un nodo Start default. Al hacer PATCH con nuestros nodos, el merge del servidor re-añade el Start default y otros nodos fantasma. Estos nodos no tienen datos validos y causan errores al ejecutar.

**Solucion:** Limpiar nodos fantasma de los 4 canvas (IDs no reconocidos eliminados). Prevenido a futuro con el fix de INC-06 (force_overwrite).

---

## INC-08: IMAP list_emails devuelve subject/from vacios

**Fecha:** 2026-03-31
**Severidad:** CRITICA — Gmail via App Password no lee cabeceras de emails

**Sintoma:** gmail_list_emails y gmail_search_emails devuelven todos los emails con subject="(sin asunto)" y from="" a pesar de que los emails tienen asunto y remitente reales visibles en Gmail.

**Causa raiz:** imap-simple devuelve los headers de `HEADER.FIELDS (FROM SUBJECT DATE)` como **objeto** `{from: ['...'], subject: ['...'], date: ['...']}`, no como string raw. El codigo parseaba con regex asumiendo string, y cuando hacia `JSON.stringify(header)` el formato `{"from":["..."]}` no matcheaba con `/Subject:\s*(.+)/`.

**Solucion aplicada en gmail-reader.ts:**
- Detectar si `header` es objeto o string
- Si objeto: acceder directamente a `header.subject[0]`, `header.from[0]`, `header.date[0]`
- Si string: parsear con regex (fallback)

---

## INC-09: IMAP search con query "is:unread" no funciona

**Fecha:** 2026-03-31
**Severidad:** ALTA — busqueda de no leidos devuelve resultados incorrectos

**Sintoma:** gmail_search_emails con query "is:unread" no devuelve resultados o devuelve todos. El query Gmail "is:unread" no es valido en IMAP.

**Causa raiz:** El codigo IMAP traducia cualquier query a `OR SUBJECT "query" FROM "query"`. El string "is:unread" se buscaba literalmente en subject/from, lo cual no tiene sentido.

**Solucion aplicada en gmail-reader.ts:**
- Traduccion de queries Gmail-style a criterios IMAP:
  - `is:unread` → `UNSEEN`
  - `from:email@x.com` → `FROM email@x.com`
  - `subject:"texto"` → `SUBJECT texto`
  - Texto generico → `OR SUBJECT texto FROM texto`

---

## INC-10: `buildActiveSets` consultaba la BD equivocada — validator determinista rechazaba todos los UUIDs reales

**Fecha:** 2026-04-11
**Severidad:** CRITICA — bloqueaba TODA generacion de canvas post-Phase 135 en runtime

**Sintoma:** Tras desplegar Phase 135 (deterministic pre-LLM validator), todos los pipelines terminaban en validator-reject en iteracion 0. El validator marcaba cada `agentId` y `connectorId` del canvas generado por el architect como "unknown or inactive", aunque scanCanvasResources acababa de leerlos de la BD y pasarselos al architect como UUIDs validos. 147/147 tests unitarios verdes. Produccion completamente rota.

**Causa raiz:** `buildActiveSets()` en `intent-job-executor.ts` (Phase 135 Plan 03) se cableo a `catbotDb`:

```ts
const paws = catbotDb.prepare('SELECT id FROM cat_paws WHERE is_active = 1').all();
const conns = catbotDb.prepare('SELECT id FROM connectors WHERE is_active = 1').all();
```

Pero las tablas `cat_paws` y `connectors` viven en **`docflow.db`** (accesible via `@/lib/db`), no en `catbot.db`. `catbot.db` solo contiene `intents`, `intent_jobs`, `conversation_log`, `knowledge_*`, `user_*`, `complexity_decisions`, `summaries`. La query lanzaba `SqliteError: no such table: cat_paws`, caia al `catch`, retornaba `{activeCatPaws: new Set(), activeConnectors: new Set()}`, y el validator rechazaba cualquier UUID real que le llegase.

Todos los otros readers de esas tablas (`task-executor.ts`, `execute-catpaw.ts`, `bundle-generator.ts`, `catbot-tools.ts`, `catbot-prompt-assembler.ts`, `canvas-flow-designer.ts`'s `scanCanvasResources`, etc.) usaban `db from '@/lib/db'` correctamente. El Plan 03 era el outlier.

**Por que los tests no lo detectaron:** Toda la suite de tests ARCH-PROMPT-13 reemplazaba `buildActiveSets` con un spy (`vi.spyOn(...).mockReturnValue({activeCatPaws: new Set([...]), activeConnectors: new Set([...])})`) — el query real contra el handle de BD nunca se ejercitaba. Los tests validaban el contrato funcional del validator dado un set cualquiera, pero no el wiring entre la funcion y la BD real.

**Solucion aplicada:**
1. `intent-job-executor.ts:898-904`: `catbotDb` → `db` en ambas queries de `buildActiveSets`
2. Actualizado el JSDoc de la funcion (decia "build active id sets from catbotDb" → "from docflow.db")
3. **Test de regresion nuevo** en `intent-job-executor.test.ts` → `describe('buildActiveSets DB handle (gap closure)')`. Restaura el spy por defecto con `vi.restoreAllMocks()`, configura `dbPrepareMock` con `mockImplementation` para retornar filas especificas cuando el SQL contiene `FROM cat_paws` o `FROM connectors`, invoca el `buildActiveSets` REAL y verifica que los Sets contienen esos ids y que `dbPrepareMock` recibio las queries esperadas. Si alguien revierte a `catbotDb`, el mock de `@/lib/db` es bypasseado, el handle real de `catbot-test.db` in-memory (que tampoco tiene `cat_paws`) tira error, el catch retorna vacio, y el test falla con `expected Set { 'paw-uuid-real-1' } to have size 0` — forzando a mantener el handle correcto.

**Archivos modificados:**
- `app/src/lib/services/intent-job-executor.ts` (2 lineas + comentario)
- `app/src/lib/__tests__/intent-job-executor.test.ts` (nuevo describe, +70 lineas)

**Commit:** `b66cc61 fix(135-03): buildActiveSets reads @/lib/db (docflow.db), not catbotDb`

**Verificacion post-fix:** Pipeline `holded-q1` re-ejecutado contra LiteLLM real → reached `awaiting_approval` en 120s con `recommendation:accept`, `quality_score:95`, `data_contract_score:100`, `0 issues`, los 7 nodos con `data.role` valido, y el nodo terminal `connector/emitter` sin R10. Los success criteria #2 y #3 del ROADMAP de Phase 135 quedaron confirmados en runtime.

**Estado:** RESUELTO — requirio docker rebuild (`dfdeploy`) para desplegar.

### Regla de oro (extraida de esta incidencia)

**Cualquier funcion que consulte la BD debe tener al menos un test de integracion que invoque la funcion REAL contra un handle real (in-memory o mock configurado), no solo tests con la funcion mockeada.** Los tests spy-only validan el contrato de la funcion pero ocultan bugs de wiring (handle equivocado, tabla equivocada, tipo de parametro equivocado, falta de join). El patron es: "tests unitarios verdes + produccion rota", y es exactamente lo que el audit de milestone v27.0 identifico como clase-de-bug recurrente en DocFlow.

**Como aplicar:** cuando un agente ejecute un plan que toca la BD, al menos un test debe:
1. NO mockear `@/lib/db` (o restaurar el mock con `vi.restoreAllMocks()` al inicio del test)
2. Configurar `dbPrepareMock` o semillar una BD in-memory con las tablas reales
3. Invocar la funcion sin spies encima
4. Aserrar sobre el resultado real, no sobre la senal del spy

Si el plan no puede hacer esto (p.ej. por aislamiento de modulos), documentarlo como riesgo en el SUMMARY y marcar el criterio correspondiente como `human_needed` para verificacion runtime obligatoria.

---
