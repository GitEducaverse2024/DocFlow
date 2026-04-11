---
phase: 137-learning-loops-memory-learn
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - app/src/lib/catbot-db.ts
  - app/src/lib/services/catbot-prompt-assembler.ts
  - app/src/lib/services/catbot-tools.ts
  - app/src/lib/services/catbot-user-profile.ts
  - app/data/knowledge/catboard.json
  - app/data/knowledge/catpaw.json
  - app/src/lib/__tests__/catbot-prompt-assembler.test.ts
  - app/src/lib/__tests__/catbot-user-patterns.test.ts
autonomous: true
requirements: [LEARN-01, LEARN-02, LEARN-03, LEARN-04, LEARN-08]
must_haves:
  truths:
    - "Existe un skill 'Protocolo de creación de CatPaw' categoria='system' en la DB al arrancar el contenedor"
    - "CatBot lee ese skill en cualquier conversación donde intent relacionado con crear CatPaw aparezca"
    - "Existe mecanismo de persistencia de patterns por usuario (tabla user_interaction_patterns en catbot.db)"
    - "CatBot lee los patterns del usuario actual y los inyecta en el system prompt"
    - "Hay tools CatBot para leer/escribir patterns con permission gate"
    - "CatBot puede consultar el % de peticiones complex completadas con éxito vía get_complexity_outcome_stats (LEARN-08 oracle)"
    - "Knowledge tree (catboard.json + catpaw.json) incluye referencia al skill, la tabla y las tools nuevas"
  artifacts:
    - path: "app/src/lib/catbot-db.ts"
      provides: "user_interaction_patterns table + skills seed del 'Protocolo de creación de CatPaw'"
      contains: "CREATE TABLE IF NOT EXISTS user_interaction_patterns"
    - path: "app/src/lib/services/catbot-prompt-assembler.ts"
      provides: "injection de user_patterns summary y del skill system en el system prompt"
    - path: "app/src/lib/services/catbot-tools.ts"
      provides: "tools list_user_patterns, write_user_pattern, get_user_patterns_summary, get_complexity_outcome_stats"
    - path: "app/data/knowledge/catboard.json"
      provides: "documentación del protocolo, de la tabla y de las tools nuevas"
    - path: "app/data/knowledge/catpaw.json"
      provides: "howto + common_error referenciando el skill del sistema"
  key_links:
    - from: "catbot-prompt-assembler.ts assembleSystemPrompt"
      to: "user_interaction_patterns rows (catbot.db)"
      via: "SELECT WHERE user_id = ? ORDER BY confidence DESC"
      pattern: "user_interaction_patterns"
    - from: "catbot-prompt-assembler.ts assembleSystemPrompt"
      to: "skills WHERE category='system' AND name LIKE 'Protocolo%CatPaw%'"
      via: "always-inject system skill"
      pattern: "category.*=.*'system'"
    - from: "catbot-tools.ts write_user_pattern"
      to: "user_interaction_patterns INSERT"
      via: "permission-gated (action_key: manage_user_patterns)"
      pattern: "manage_user_patterns"
    - from: "catbot-tools.ts get_complexity_outcome_stats"
      to: "complexity_decisions GROUP BY outcome"
      via: "always_allowed readonly query"
      pattern: "SELECT outcome, COUNT"
---

<objective>
Introducir los 4 requirements de "CatBot intelligence" (LEARN-01/02/03/04) + la tool oracle de LEARN-08 (get_complexity_outcome_stats): un skill del sistema que protocoliza la creación de CatPaws, la adherencia del bot a ese protocolo cuando detecta `needs_cat_paws` o petición explícita del usuario, un mecanismo de memoria de patterns por usuario con lectura automática en el system prompt, y una tool oracle para que CatBot pueda auto-verificar LEARN-08.

**IMPORTANTE — DB location resuelto (lección de INC-10 del Phase 135-03):**
Las tablas CatBot-owned (user_profiles, user_memory, intents, intent_jobs, complexity_decisions) viven en `app/src/lib/catbot-db.ts` (catbot.db), NO en `app/src/lib/db.ts` (docflow.db). `catbot-tools.ts` importa `catbotDb` y los helpers `updateComplexityOutcome`, `upsertProfile`, etc. desde `@/lib/catbot-db`. Por tanto `user_interaction_patterns` DEBE crearse en `catbot-db.ts` y los helpers (`getUserPatterns`, `writeUserPattern`, `getSystemSkillInstructions`) leer/escribir usando `catbotDb`. Esta decisión está tomada en firme — los tests deben mockear `catbotDb`, NO `db`. Referencia: commit `b66cc61 fix(135-03): buildActiveSets reads @/lib/db (docflow.db), not catbotDb` (INC-10, dirección inversa pero misma clase de fallo si se elige mal el handle).

**Nota sobre el skill seed:** la tabla `skills` (canonical) vive en `app/src/lib/db.ts`. Por tanto el seed del skill "Protocolo de creación de CatPaw" se hace en `db.ts` (docflow.db), y la tabla `user_interaction_patterns` en `catbot-db.ts` (catbot.db). Son dos módulos distintos, cada uno con su responsabilidad clara. Los tests del seed del skill mockean `db` (docflow.db); los tests de patterns mockean `catbotDb` (catbot.db).

**LEARN-01** — Skill del sistema `categoria='system'` "Protocolo de creación de CatPaw" con los 5 pasos (identificar función, skills necesarias, conectores, system prompt ROL/MISIÓN/PROCESO/CASOS/OUTPUT, plan al usuario antes de ejecutar `create_cat_paw`). Se persiste como fila en `skills` table de docflow.db, inyectable en prompts. **IMPORTANTE: LEARN-01 es el skill en sí, no la señal de reproducibilidad 3x (eso se verifica en el plan 137-06 gate).**

**LEARN-02** — CatBot sigue el protocolo automáticamente cuando:
  a) El architect emite `needs_cat_paws[]` y llega un turno de conversación tras ese aviso
  b) El usuario dice "crea un CatPaw para X"
En ambos casos, antes de ejecutar `create_cat_paw`, CatBot presenta un plan estructurado siguiendo los 5 pasos.

**LEARN-03** — Tabla `user_interaction_patterns` en catbot.db con columnas `(id, user_id, pattern_type, pattern_key, pattern_value, confidence, last_seen, created_at)`. CatBot puede escribir patterns observacionales ("usuario prefiere Q1/Q2", "destinatarios habituales: antonio+fen").

**LEARN-04** — CatBot lee los patterns del usuario actual y los inyecta como un bloque P2 en el system prompt personalizando respuestas.

**LEARN-08 oracle (sumado a este plan para respetar el protocolo CatBot-como-oráculo de CLAUDE.md):** Plan 137-02 añade `complexity_decisions.outcome`. Para que CatBot pueda verificar la feature, este plan añade la tool `get_complexity_outcome_stats` (always_allowed, readonly) que devuelve el histograma de outcomes por ventana temporal.

Purpose: Sin LEARN-01/02 la repetibilidad de la señal única se rompe en cuanto aparece un CatPaw nuevo. Sin LEARN-03/04 CatBot no aprende de las preferencias del usuario (Q1 Holded → antonio+fen es un pattern) y vuelve a preguntar cada vez. Sin la tool oracle, LEARN-08 queda sin verificación por CatBot.
Output: Skill del sistema + tabla + tools (4 incluyendo oracle) + prompt assembler wiring + knowledge tree (catboard.json + catpaw.json) + tests.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/MILESTONE-CONTEXT.md
@./CLAUDE.md
@app/src/lib/db.ts
@app/src/lib/catbot-db.ts
@app/src/lib/services/catbot-prompt-assembler.ts
@app/src/lib/services/catbot-tools.ts
@app/src/lib/services/catbot-user-profile.ts
@app/data/knowledge/catboard.json
@app/data/knowledge/catpaw.json

<interfaces>
Skills table (from db.ts — docflow.db):

```sql
skills (id TEXT PK, name TEXT, description TEXT, category TEXT, tags TEXT,
        instructions TEXT, output_template TEXT, example_input TEXT,
        example_output TEXT, constraints TEXT, source TEXT, version TEXT,
        author TEXT, is_featured INTEGER, times_used INTEGER,
        created_at TEXT, updated_at TEXT)
```
Seed pattern: `INSERT OR IGNORE INTO skills (...) VALUES (...)` inside db.ts init block.

catbot-db.ts (catbot.db) ya aloja:
- user_profiles, user_memory, conversation_log, summaries, knowledge_learned, knowledge_gaps
- intents, intent_jobs, complexity_decisions
- Exporta: catbotDb (default), getProfile, upsertProfile, saveKnowledgeGap, createIntent, createIntentJob, updateIntentJob, updateComplexityOutcome, listComplexityDecisionsByUser, countComplexTimeoutsLast24h, ...

complexity_decisions schema (catbot-db.ts L156-170):
- id TEXT PK, request_id TEXT, user_id TEXT, classification TEXT, outcome TEXT, async_path_taken INTEGER, reason TEXT, estimated_duration_s INTEGER, created_at TEXT
- outcome puede ser 'completed' | 'failed' | 'timeout' | null (pending)

CatBot tools pattern (from catbot-tools.ts):
- `TOOLS: ToolDefinition[]` — array of {name, description, input_schema, ...}
- `executeTool(name, args, ctx): Promise<string>` — switch case per tool
- Permission gating: función `isToolAllowed(name, allowedActions)` que mapea tool names a action_keys (p.ej. `manage_intents`, `manage_canvas`). `always_allowed` se gestiona implícitamente al devolver el string del tool sin consultar permisos.
- USER_SCOPED_TOOLS array incluye tools que operan sobre el usuario actual (ej: get_user_profile, update_user_profile, list_my_recipes).

CatBot prompt assembler (from catbot-prompt-assembler.ts):
- Sections P0-P3 con token budgets
- P0: identity + core rules
- P1: tools + navigation
- P2: knowledge + user context ← aquí van user_patterns + system skill
- P3: conversation history
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: LEARN-01 + LEARN-03 — schema migration (user_interaction_patterns en catbot.db + seed system skill en docflow.db)</name>
  <files>
    app/src/lib/catbot-db.ts,
    app/src/lib/db.ts,
    app/src/lib/__tests__/catbot-user-patterns.test.ts
  </files>
  <behavior>
    - Test 1 (LEARN-03): Al inicializar catbot-db.ts, la tabla `user_interaction_patterns` existe con columnas: id, user_id, pattern_type, pattern_key, pattern_value, confidence (INTEGER default 1), last_seen (TEXT default datetime('now')), created_at (TEXT default datetime('now')). La tabla vive en catbot.db (accesible vía `catbotDb.prepare`).
    - Test 2 (LEARN-01): Al inicializar db.ts, existe una fila en `skills` (docflow.db) con `name='Protocolo de creación de CatPaw'`, `category='system'`, `instructions` conteniendo las secciones "PASO 1", "PASO 2", "PASO 3", "PASO 4", "PASO 5", y mencionando "ROL/MISIÓN/PROCESO/CASOS/OUTPUT".
    - Test 3 (LEARN-03): Insertar y leer un pattern sencillo (`INSERT INTO user_interaction_patterns ... VALUES ('pat1','u1','delivery_preference','recipients','antonio+fen', 3, ...)` + SELECT vía `catbotDb`) funciona.
    - Test 4 (LEARN-01): El skill seed es idempotente — importar db.ts dos veces no duplica la fila (uso de INSERT OR IGNORE con id determinista).
    - Test 5 (cross-db sanity): Los tests que mockean `catbotDb` NO rompen el seed del skill (y viceversa) — confirma la separación clara de responsabilidades.
  </behavior>
  <action>
    PASO 1 — **user_interaction_patterns en catbot-db.ts.** Abrir `app/src/lib/catbot-db.ts`, localizar el bloque `catbotDb.exec` donde se crean las otras tablas CatBot-owned (L35-170, junto a user_profiles, complexity_decisions, etc.). Añadir:
    ```typescript
    catbotDb.exec(`
      CREATE TABLE IF NOT EXISTS user_interaction_patterns (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        pattern_type TEXT NOT NULL,
        pattern_key TEXT NOT NULL,
        pattern_value TEXT NOT NULL,
        confidence INTEGER NOT NULL DEFAULT 1,
        last_seen TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_user_patterns_user ON user_interaction_patterns(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_patterns_type ON user_interaction_patterns(user_id, pattern_type);
    `);
    ```
    Nota: revisar el pattern exacto que usa catbot-db.ts — si hay un único `catbotDb.exec` con todas las tablas concatenadas, añadir al string; si son `.exec` separados por tabla, añadir uno nuevo.

    PASO 2 — **Seed del skill en db.ts (docflow.db).** Localizar el bloque de init en `app/src/lib/db.ts` (buscar otros `INSERT OR IGNORE` o `db.prepare(...).run` en el bootstrap). Añadir:
    ```typescript
    const CATPAW_PROTOCOL_SKILL_ID = 'skill-system-catpaw-protocol-v1';
    const CATPAW_PROTOCOL_INSTRUCTIONS = `PROTOCOLO DE CREACIÓN DE CATPAW (obligatorio seguir al crear uno nuevo)

PASO 1 — Identifica la función del CatPaw:
  ¿Es para el Canvas (debe ser mode: processor)?
  ¿Qué tipo de tarea: extractor | transformer | synthesizer | renderer | emitter?
  Declara el 'role' dentro de la taxonomía de 7 roles del milestone v27.0.

PASO 2 — Identifica las skills que necesita:
  Escritura/redacción → skill "Redacción Ejecutiva" o "Copywriting Comercial"
  Análisis → skill "Investigación Profunda" o "Marco de Decisión"
  Email con template → skill "Maquetador de Email"
  Formato de output → skill "Output Estructurado"

PASO 3 — Identifica los conectores necesarios:
  ¿Gmail? → vincular conector Gmail tras crear
  ¿Drive? → vincular Educa360Drive
  ¿Holded? → vincular Holded MCP

PASO 4 — Genera el system prompt con estructura ROL/MISIÓN/PROCESO/CASOS/OUTPUT:
  Temperatura 0.1-0.2 para clasificación/filtrado, 0.4-0.6 para redacción.
  Formato 'json' si el output alimenta a otro nodo; 'md' si el output es para un humano.

PASO 5 — Presenta el plan al usuario antes de ejecutar create_cat_paw:
  "Voy a crear el CatPaw 'X' con mode: processor, skills [Y], conector 'Z', temperatura 0.2, output json. ¿Procedo?"
  NUNCA llamar create_cat_paw sin aprobación explícita del usuario.`;

    db.prepare(`INSERT OR IGNORE INTO skills
      (id, name, description, category, tags, instructions, output_template,
       example_input, example_output, constraints, source, version, author,
       is_featured, times_used, created_at, updated_at)
      VALUES (?, ?, ?, 'system', ?, ?, '', '', '', '', 'built-in', '1.0', 'DoCatFlow',
              1, 0, ?, ?)`).run(
      CATPAW_PROTOCOL_SKILL_ID,
      'Protocolo de creación de CatPaw',
      'Skill del sistema que protocoliza la creación de un CatPaw nuevo en 5 pasos. Se aplica cuando el architect emite needs_cat_paws o el usuario pide crear un CatPaw.',
      JSON.stringify(['system','catpaw','creation','protocol','v27.0']),
      CATPAW_PROTOCOL_INSTRUCTIONS,
      new Date().toISOString(),
      new Date().toISOString(),
    );
    ```

    PASO 3 — Tests `catbot-user-patterns.test.ts`: importar `@/lib/catbot-db` (dispara init), importar `@/lib/db` para el test del skill seed. Usar el mismo pattern de mocks de better-sqlite3 de otros tests del proyecto. Assertar los 5 comportamientos. Los tests de la tabla mockean `catbotDb.prepare`; el test del skill mockea `db.prepare`.

    PASO 4 — Verificar idempotencia manualmente tras los tests pasando. El `INSERT OR IGNORE` + el id determinista `skill-system-catpaw-protocol-v1` garantiza.

    PASO 5 — **NO** hacer migration con ALTER aquí — las dos cosas son CREATE TABLE IF NOT EXISTS + INSERT OR IGNORE, ambas idempotentes.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- catbot-user-patterns</automated>
  </verify>
  <done>
    - Tabla user_interaction_patterns creada con índices en catbot.db
    - Skill "Protocolo de creación de CatPaw" sembrado con category='system' en docflow.db
    - Tests de schema y seed verdes
    - Cross-db separation confirmada (ningún test rompe el otro)
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: LEARN-02 + LEARN-04 + LEARN-08 oracle — prompt assembler injection + catbot tools (patterns + complexity stats)</name>
  <files>
    app/src/lib/services/catbot-prompt-assembler.ts,
    app/src/lib/services/catbot-tools.ts,
    app/src/lib/services/catbot-user-profile.ts,
    app/data/knowledge/catboard.json,
    app/data/knowledge/catpaw.json,
    app/src/lib/__tests__/catbot-prompt-assembler.test.ts
  </files>
  <behavior>
    - Test 1 (LEARN-04): Dado un userId con 3 filas en user_interaction_patterns, assembleSystemPrompt(userId) contiene una sección "## Preferencias observadas del usuario" con las 3 patterns listadas.
    - Test 2 (LEARN-04): Usuario sin patterns → la sección no aparece (ni vacía ni placeholder).
    - Test 3 (LEARN-04): Patterns se ordenan por confidence DESC + last_seen DESC; top 10 se inyectan (budget).
    - Test 4 (LEARN-02): assembleSystemPrompt siempre incluye las instructions del skill category='system' name='Protocolo de creación de CatPaw' (inject incondicional — es un skill de sistema, no gated).
    - Test 5 (LEARN-03 tools): `executeTool('list_user_patterns', { user_id: 'u1' })` devuelve JSON array con las filas del user.
    - Test 6 (LEARN-03 tools): `executeTool('write_user_pattern', { user_id, pattern_type, pattern_key, pattern_value })` inserta fila y devuelve success.
    - Test 7: `write_user_pattern` está permission-gated con action_key `manage_user_patterns` — `isToolAllowed('write_user_pattern', [])` devuelve true, `isToolAllowed('write_user_pattern', ['manage_canvas'])` devuelve false, `isToolAllowed('write_user_pattern', ['manage_user_patterns'])` devuelve true.
    - Test 8: `list_user_patterns` es always_allowed (consulta readonly de patterns del user actual).
    - Test 9 (LEARN-08 oracle): `executeTool('get_complexity_outcome_stats', {})` devuelve JSON con histograma `{ completed, failed, timeout, pending, total, success_rate }` y una propiedad `window_days` reflejando el default (30).
    - Test 10 (LEARN-08 oracle): `get_complexity_outcome_stats` filtra por `window_days` param — valores < 1 se normalizan a 1; valores > 365 se clampean a 365.
  </behavior>
  <action>
    PASO 1 — En `catbot-user-profile.ts` añadir helpers nuevos (importando `catbotDb` — verificar que ya lo importa; si no, añadir el import):
    ```typescript
    export interface UserInteractionPattern {
      id: string;
      user_id: string;
      pattern_type: string;
      pattern_key: string;
      pattern_value: string;
      confidence: number;
      last_seen: string;
      created_at: string;
    }

    export function getUserPatterns(userId: string, limit = 10): UserInteractionPattern[] {
      return catbotDb.prepare(
        'SELECT * FROM user_interaction_patterns WHERE user_id = ? ORDER BY confidence DESC, last_seen DESC LIMIT ?'
      ).all(userId, limit) as UserInteractionPattern[];
    }

    export function writeUserPattern(p: Omit<UserInteractionPattern, 'id' | 'created_at' | 'last_seen'> & { id?: string }): UserInteractionPattern {
      const id = p.id ?? crypto.randomUUID();
      const now = new Date().toISOString();
      catbotDb.prepare(
        'INSERT INTO user_interaction_patterns (id, user_id, pattern_type, pattern_key, pattern_value, confidence, last_seen, created_at) VALUES (?,?,?,?,?,?,?,?)'
      ).run(id, p.user_id, p.pattern_type, p.pattern_key, p.pattern_value, p.confidence ?? 1, now, now);
      return { id, user_id: p.user_id, pattern_type: p.pattern_type, pattern_key: p.pattern_key, pattern_value: p.pattern_value, confidence: p.confidence ?? 1, last_seen: now, created_at: now };
    }

    export function getSystemSkillInstructions(name: string): string | null {
      // NOTE: skills viven en docflow.db, no en catbot.db. Import db desde @/lib/db si no está ya.
      const row = db.prepare(
        "SELECT instructions FROM skills WHERE category = 'system' AND name = ? LIMIT 1"
      ).get(name) as { instructions: string } | undefined;
      return row?.instructions ?? null;
    }

    export function getComplexityOutcomeStats(windowDays: number = 30): {
      window_days: number;
      total: number;
      completed: number;
      failed: number;
      timeout: number;
      pending: number;
      success_rate: number;
    } {
      const w = Math.max(1, Math.min(365, Math.floor(windowDays)));
      const rows = catbotDb.prepare(
        `SELECT outcome, COUNT(*) AS cnt
         FROM complexity_decisions
         WHERE created_at > datetime('now', ?)
         GROUP BY outcome`
      ).all(`-${w} days`) as Array<{ outcome: string | null; cnt: number }>;
      const bucket = { completed: 0, failed: 0, timeout: 0, pending: 0 };
      for (const r of rows) {
        const key = (r.outcome ?? 'pending') as keyof typeof bucket;
        if (key in bucket) bucket[key] += r.cnt;
        else bucket.pending += r.cnt;
      }
      const total = bucket.completed + bucket.failed + bucket.timeout + bucket.pending;
      const success_rate = total > 0 ? bucket.completed / total : 0;
      return { window_days: w, total, ...bucket, success_rate };
    }
    ```
    **DB LOCATION — resuelto:** `user_interaction_patterns` y `complexity_decisions` en `catbotDb`, `skills` en `db`. Sin ambigüedad.

    PASO 2 — En `catbot-prompt-assembler.ts` localizar el builder de la sección P2 (user context / knowledge). Añadir:
    ```typescript
    // LEARN-04: inject user interaction patterns summary
    const patterns = getUserPatterns(userId, 10);
    if (patterns.length > 0) {
      sections.push({
        priority: 'P2',
        title: 'Preferencias observadas del usuario',
        content: patterns.map(p => `- [${p.pattern_type}] ${p.pattern_key}: ${p.pattern_value} (confianza ${p.confidence})`).join('\n'),
      });
    }

    // LEARN-02: always inject "Protocolo de creación de CatPaw" system skill
    const catpawProtocol = getSystemSkillInstructions('Protocolo de creación de CatPaw');
    if (catpawProtocol) {
      sections.push({
        priority: 'P1',
        title: 'Protocolo obligatorio: creación de CatPaw',
        content: catpawProtocol,
      });
    }
    ```
    Ajustar a la API real del prompt assembler (el shape de sections puede ser distinto — usar el pattern existente del módulo).

    PASO 3 — En `catbot-tools.ts` añadir 4 tools a `TOOLS` array:
    ```typescript
    {
      name: 'list_user_patterns',
      description: 'Lista los patterns observados del usuario actual (preferencias, estilo de petición, tareas frecuentes).',
      input_schema: { type: 'object', properties: { limit: { type: 'number', default: 10 } } },
    },
    {
      name: 'write_user_pattern',
      description: 'Registra un pattern observado del usuario (p.ej. "usuario prefiere Q1/Q2", "destinatarios habituales antonio+fen"). Se aplica para personalizar futuras respuestas.',
      input_schema: {
        type: 'object',
        required: ['pattern_type', 'pattern_key', 'pattern_value'],
        properties: {
          pattern_type: { type: 'string', enum: ['delivery_preference', 'request_style', 'frequent_task', 'recipient', 'other'] },
          pattern_key: { type: 'string' },
          pattern_value: { type: 'string' },
          confidence: { type: 'number', default: 1 },
        },
      },
    },
    {
      name: 'get_user_patterns_summary',
      description: 'Devuelve un resumen de texto libre de los patterns del usuario actual, formateado para conversación.',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'get_complexity_outcome_stats',
      description: 'LEARN-08 oracle: devuelve el histograma de outcomes (completed/failed/timeout/pending) del pipeline async en una ventana temporal configurable. Útil para responder "qué % de peticiones complex completan con éxito".',
      input_schema: {
        type: 'object',
        properties: { window_days: { type: 'number', default: 30, description: 'Ventana en días (1-365)' } },
      },
    },
    ```
    Implementar los 4 `case` en `executeTool`. Para `list_user_patterns` y `get_user_patterns_summary` usar el `userId` del ctx (el caller tiene el userId en el contexto de la sesión). Para `get_complexity_outcome_stats` no se requiere filtro por usuario en esta iteración — devuelve stats globales del sistema (es el oracle del milestone).

    PASO 4 — Permission gate en `isToolAllowed` (L~1255 de catbot-tools.ts, donde ya están `retry_intent`/`abandon_intent`/`update_alias_routing`). Añadir:
    ```typescript
    if (name === 'list_user_patterns') return true;          // always_allowed (readonly del user actual)
    if (name === 'get_user_patterns_summary') return true;   // always_allowed
    if (name === 'get_complexity_outcome_stats') return true; // always_allowed (readonly oracle)
    if (name === 'write_user_pattern' && (allowedActions.includes('manage_user_patterns') || !allowedActions.length)) return true;
    ```
    Añadir `list_user_patterns`, `get_user_patterns_summary`, `write_user_pattern` al `USER_SCOPED_TOOLS` array si existe (L~1342) para que el userId del ctx se inyecte automáticamente. `get_complexity_outcome_stats` NO es user-scoped (es un oracle global del sistema).

    PASO 5 — Actualizar `app/data/knowledge/catboard.json` (es donde vive la knowledge de CatBot meta, no existe catbot.json):
    - Añadir al array `tools`: `list_user_patterns`, `write_user_pattern`, `get_user_patterns_summary`, `get_complexity_outcome_stats`
    - Añadir al array `concepts`: `user_interaction_patterns: tabla de patterns observacionales del usuario en catbot.db — persistencia de preferencias (destinatarios habituales, formatos, estilos) que CatBot lee automáticamente`
    - Añadir al array `concepts`: `Protocolo de creación de CatPaw: skill del sistema (category='system') en docflow.db que CatBot consulta automáticamente al recibir needs_cat_paws o petición de crear CatPaw`
    - Añadir al array `concepts`: `complexity_decisions.outcome: campo que registra el resultado final del pipeline async (completed/failed/timeout) — consultable vía get_complexity_outcome_stats para métricas de salud`
    - Añadir al array `howto`: "Para saber el % de peticiones complex que completan con éxito: CatBot llama get_complexity_outcome_stats con window_days opcional (default 30)"
    - Añadir al array `howto`: "CatBot recuerda preferencias del usuario leyendo user_interaction_patterns en cada turno (vía prompt assembler) y puede registrar nuevas vía write_user_pattern (permission-gated manage_user_patterns)"
    - Actualizar `sources` con ruta a este PLAN.md y a deferred-items.md
    - Actualizar `updated_at` a la fecha actual

    PASO 6 — Actualizar `app/data/knowledge/catpaw.json`:
    - Añadir al array `howto`: "Crear un CatPaw nuevo: CatBot sigue el skill system 'Protocolo de creación de CatPaw' (5 pasos: función → skills → conectores → system prompt ROL/MISIÓN/PROCESO/CASOS/OUTPUT → plan de aprobación) antes de llamar create_cat_paw"
    - Añadir al array `common_errors`: `{error: "CatPaw creado sin system prompt estructurado", cause: "No se siguió el protocolo de 5 pasos", solution: "Reescribir system prompt con secciones ROL/MISIÓN/PROCESO/CASOS/OUTPUT; ver skill 'Protocolo de creación de CatPaw'"}`
    - Añadir al array `common_errors`: `{error: "CatPaw llama a send_email sin to/subject/body y obtiene {ok:true}", cause: "INC-12 (pre-137) — wrapper aceptaba args incompletos", solution: "Cerrado en Phase 137-01: el wrapper Gmail valida to/subject/body y exige messageId en response. Ver .planning/deferred-items.md INC-12."}`
    - Actualizar `sources` con ruta al PLAN.md del skill protocol (`.planning/phases/137-learning-loops-memory-learn/137-03-catbot-intelligence-PLAN.md`)
    - Actualizar `updated_at`

    PASO 7 — Tests en `catbot-prompt-assembler.test.ts` (extender si existe, crear si no):
    - Mockear `getUserPatterns` para devolver fixtures
    - Mockear `getSystemSkillInstructions` para devolver un texto conocido
    - Mockear `getComplexityOutcomeStats` para devolver fixtures en tests del tool
    - Mockear `catbotDb.prepare(...).all(...)` con filas sintéticas para `get_complexity_outcome_stats`
    - Assertar los 10 behaviors
    - Grep asserts en los JSON knowledge para cerrar el loop: `grep -q "list_user_patterns" app/data/knowledge/catboard.json` y `grep -q "Protocolo de creación de CatPaw" app/data/knowledge/catpaw.json`

    PASO 8 — (OPCIONAL) Si existe `catbot-permissions.ts` o una constante central de action_keys, añadir `manage_user_patterns` al set para que la UI de Settings → Permissions lo muestre. Si no existe tal set central, omitir este paso.
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- catbot-prompt-assembler catbot-tools &amp;&amp; grep -q "list_user_patterns" app/data/knowledge/catboard.json &amp;&amp; grep -q "get_complexity_outcome_stats" app/data/knowledge/catboard.json &amp;&amp; grep -q "Protocolo de creación de CatPaw" app/data/knowledge/catpaw.json</automated>
  </verify>
  <done>
    - getUserPatterns + writeUserPattern + getSystemSkillInstructions + getComplexityOutcomeStats exportados
    - assembleSystemPrompt inyecta patterns y protocolo CatPaw
    - 4 tools nuevos registrados con permisos correctos (3 always_allowed + 1 permission-gated)
    - Knowledge tree actualizado (catboard.json + catpaw.json per CLAUDE.md)
    - 10 tests verdes
  </done>
</task>

</tasks>

<verification>
1. `cd app && npm test -- catbot-prompt-assembler catbot-tools catbot-user-patterns` → verde
2. `cd app && npm test` → suite completa sin regresiones
3. Knowledge tree asserts: `grep -q "list_user_patterns" app/data/knowledge/catboard.json` y `grep -q "get_complexity_outcome_stats" app/data/knowledge/catboard.json`
4. CatBot oracle (post docker rebuild): preguntar "¿qué patterns tienes registrados sobre mí?" → responde usando list_user_patterns
5. CatBot oracle: preguntar "crea un CatPaw para redactar emails" → CatBot presenta el plan estructurado (5 pasos) antes de llamar create_cat_paw
6. CatBot oracle (LEARN-08): preguntar "¿qué porcentaje de peticiones complex están completando con éxito?" → CatBot llama get_complexity_outcome_stats y responde con el histograma real
</verification>

<success_criteria>
- LEARN-01: skill system visible en `skills WHERE category='system'` (docflow.db)
- LEARN-02: CatBot sigue protocolo cuando detecta needs_cat_paws o petición de creación
- LEARN-03: tabla en catbot.db + tools para persistir/leer patterns
- LEARN-04: patterns inyectados en system prompt automáticamente
- LEARN-08 oracle: CatBot puede consultar complexity outcome stats
- Knowledge tree actualizado per CLAUDE.md protocol (catboard.json + catpaw.json)
</success_criteria>

<output>
After completion, create `.planning/phases/137-learning-loops-memory-learn/137-03-SUMMARY.md`
</output>
</content>
</invoke>