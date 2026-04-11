---
phase: 137-learning-loops-memory-learn
plan: 04
type: execute
wave: 2
depends_on: [137-02]
files_modified:
  - app/src/lib/services/intent-job-executor.ts
  - app/src/lib/__tests__/intent-job-executor-proposal.test.ts
  - app/data/knowledge/catboard.json
autonomous: true
requirements: [LEARN-07]
must_haves:
  truths:
    - "sendProposal(...) envía por Telegram un mensaje con título del canvas"
    - "sendProposal(...) envía una lista de nodos con emoji por rol + descripción breve"
    - "sendProposal(...) incluye tiempo estimado en minutos"
    - "sendProposal(...) mantiene los botones inline aprobar/cancelar"
    - "El mensaje no excede el límite de Telegram (4096 chars)"
    - "Knowledge tree (catboard.json) documenta el nuevo formato de sendProposal"
  artifacts:
    - path: "app/src/lib/services/intent-job-executor.ts"
      provides: "sendProposal rediseñado con canvas name + nodes list + estimated time"
    - path: "app/data/knowledge/catboard.json"
      provides: "documentación del formato nuevo de sendProposal en concepts/howto"
  key_links:
    - from: "sendProposal"
      to: "canvases.flow_data nodes"
      via: "SELECT canvas + parse flow_data"
      pattern: "flow_data.*nodes.*map"
---

<objective>
Rediseñar `sendProposal` (L1144 de `intent-job-executor.ts`) para que el mensaje de Telegram sea informativo: título del canvas + lista de nodos (con emoji por rol) + tiempo estimado + botones aprobar/cancelar.

Hoy el mensaje es genérico ("Objetivo: X. Plan: task1,task2. ¿Ejecutar?"). Queremos el formato de la PARTE 7 del MILESTONE-CONTEXT:

```
📋 CatFlow generado: "Comparativa Holded Q1"

Nodos (6):
  📥 Extractor Q1 2025 — Extrae facturas de Holded
  📥 Extractor Q1 2026 — Extrae facturas de Holded
  🔀 Merge — Combina ambos resultados
  🧠 Comparador — Genera análisis ejecutivo
  🎨 Maquetador — Aplica template corporativo
  📤 Gmail Antonio — Envía informe por email

⏱ Tiempo estimado: ~3 minutos

[✓ Aprobar] [✗ Cancelar]
```

Purpose: El usuario aprueba con visibilidad real del plan, no confiando ciegamente. Es precondición de la señal única — sin esto la aprobación es un paso frágil.
Output: sendProposal rediseñado + tests de spy sobre telegramBotService + knowledge tree (catboard.json) actualizado.

**Depends on 137-02:** porque ese plan muta el flow_data antes del INSERT; este plan lee del canvas ya insertado. Sin conflicto pero orden semántico.

---

**CatBot oracle waiver (per CLAUDE.md oracle protocol):**
LEARN-07 es una feature de UX del canal Telegram que CatBot usa como output primario (no como feature que CatBot opera vía tool). Por tanto, CatBot no requiere un tool específico `verify_proposal_format` — el formato del sendProposal es **auto-verificable** porque Telegram es el canal primario de interacción de CatBot con el usuario, y el signal-gate 137-06 lo verifica end-to-end en Task 2 (human-verify: el usuario real recibe el mensaje con el formato LEARN-07, pulsa Aprobar, y el pipeline arranca). Este waiver está documentado explícitamente aquí y referenciado desde el signal-gate.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@app/src/lib/services/intent-job-executor.ts
@.planning/MILESTONE-CONTEXT.md
@app/data/knowledge/catboard.json

<interfaces>
From intent-job-executor.ts L1144-1181 (current sendProposal):

```typescript
private static async sendProposal(
  job: IntentJobRow,
  canvasId: string,
  goal: unknown,
  tasks: unknown,
): Promise<void>
```

The canvas already exists in `canvases` table at this point (INSERT happens at L851-854).

From telegram-bot.ts:
- `telegramBotService.sendMessageWithInlineKeyboard(chatId: number, text: string, keyboard: InlineKeyboardButton[][]): Promise<void>`
- Telegram message limit: 4096 chars (hard cap).

From canvas flow_data shape (Phase 135):
```typescript
{
  nodes: Array<{
    id: string;
    type: 'start' | 'agent' | 'connector' | 'condition' | 'iterator' | ...;
    data: { label?: string; role?: 'extractor'|'transformer'|'synthesizer'|'renderer'|'emitter'|'guard'|'reporter'; instructions?: string; ... };
  }>;
  edges: Array<{ source: string; target: string }>;
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: LEARN-07 — sendProposal Telegram redesign with title + nodes list + estimated time + knowledge tree update</name>
  <files>
    app/src/lib/services/intent-job-executor.ts,
    app/src/lib/__tests__/intent-job-executor-proposal.test.ts,
    app/data/knowledge/catboard.json
  </files>
  <behavior>
    - Test 1: sendProposal con un flow_data de 5 nodos produce un mensaje que contiene el nombre del canvas (desde `canvases.name`).
    - Test 2: El mensaje contiene "Nodos (5):" seguido de 5 líneas, una por nodo.
    - Test 3: Cada línea de nodo tiene un emoji según role: extractor→📥, transformer→🔁, synthesizer→🧠, renderer→🎨, emitter→📤, guard→🚦, reporter→📊, start→🚀, iterator→🔁, condition→🚦. Nodos sin role declarado reciben un emoji default (•).
    - Test 4: Cada línea contiene `label` o un fallback sensato (instrucciones truncadas a 60 chars).
    - Test 5: El mensaje incluye una línea `⏱ Tiempo estimado: ~N minutos` donde N = número de agent nodes * 30s aprox redondeado a minuto (min 1, max 10). Heurística simple documentada.
    - Test 6: Los botones siguen siendo `[✓ Aprobar][✗ Cancelar]` con callback_data `pipeline:{jobId}:approve|reject` (backward compat con el handler existente de telegram-bot.ts).
    - Test 7: Si el mensaje excede 4000 chars, se trunca la lista de nodos a los primeros 20 con `... y N más` y el mensaje total se mantiene <4096.
    - Test 8: Si `job.channel !== 'telegram'` se sigue enviando el `createNotification` (web fallback) con el cuerpo rico; no romper el path web.
    - Test 9 (knowledge tree): `grep -q "sendProposal\\|CatFlow generado" app/data/knowledge/catboard.json` — el formato LEARN-07 está documentado.
  </behavior>
  <action>
    PASO 1 — Reemplazar la implementación de `sendProposal`. Nueva estructura:
    ```typescript
    private static readonly ROLE_EMOJI: Record<string, string> = {
      extractor: '📥',
      transformer: '🔁',
      synthesizer: '🧠',
      renderer: '🎨',
      emitter: '📤',
      guard: '🚦',
      reporter: '📊',
      start: '🚀',
    };

    private static readonly TYPE_EMOJI: Record<string, string> = {
      iterator: '🔁',
      condition: '🚦',
      connector: '🔌',
      agent: '🤖',
      merge: '🔀',
      start: '🚀',
    };

    private static formatNodeLine(node: { id: string; type?: string; data?: { label?: string; role?: string; instructions?: string; name?: string } }): string {
      const role = node.data?.role ?? '';
      const type = node.type ?? '';
      const emoji = this.ROLE_EMOJI[role] ?? this.TYPE_EMOJI[type] ?? '•';
      const label = node.data?.label ?? node.data?.name ?? node.id;
      const descSrc = node.data?.instructions ?? node.data?.label ?? '';
      const desc = descSrc.length > 60 ? descSrc.slice(0, 57) + '...' : descSrc;
      return `  ${emoji} ${label}${desc ? ' — ' + desc : ''}`;
    }

    private static estimateMinutes(flowData: { nodes: Array<{ type?: string }> }): number {
      const agentCount = flowData.nodes.filter(n => n.type === 'agent' || n.type === 'multiagent').length;
      const raw = Math.ceil((agentCount * 30) / 60); // 30s por agent avg
      return Math.max(1, Math.min(10, raw));
    }

    private static buildProposalBody(canvasName: string, flowData: { nodes: Array<Record<string, unknown>> }, goal: unknown): string {
      const nodes = flowData.nodes as Array<{ id: string; type?: string; data?: Record<string, unknown> }>;
      const count = nodes.length;
      const lines = nodes.slice(0, 20).map(n => this.formatNodeLine(n as Parameters<typeof IntentJobExecutor.formatNodeLine>[0]));
      const truncationNote = count > 20 ? `\n  ... y ${count - 20} nodos más` : '';
      const estMin = this.estimateMinutes(flowData);
      const goalStr = typeof goal === 'string' ? goal : JSON.stringify(goal);

      let body = `📋 CatFlow generado: "${canvasName}"\n\n`;
      body += `**Objetivo:** ${goalStr.length > 200 ? goalStr.slice(0, 197) + '...' : goalStr}\n\n`;
      body += `Nodos (${count}):\n${lines.join('\n')}${truncationNote}\n\n`;
      body += `⏱ Tiempo estimado: ~${estMin} minuto${estMin !== 1 ? 's' : ''}\n\n`;
      body += `¿Ejecutar este CatFlow?`;

      // Safety: hard cap at 4000 chars
      if (body.length > 4000) {
        body = body.slice(0, 3990) + '\n... [truncado]';
      }
      return body;
    }
    ```

    PASO 2 — Reescribir `sendProposal`:
    ```typescript
    private static async sendProposal(
      job: IntentJobRow,
      canvasId: string,
      goal: unknown,
      _tasks: unknown, // no longer used directly; nodes come from flow_data
    ): Promise<void> {
      // Load canvas to get name + flow_data (already persisted in INSERT above)
      let canvasName = 'CatFlow';
      let flowData: { nodes: Array<Record<string, unknown>>; edges: unknown[] } = { nodes: [], edges: [] };
      try {
        const row = db.prepare('SELECT name, flow_data FROM canvases WHERE id = ?').get(canvasId) as { name: string; flow_data: string } | undefined;
        if (row) {
          canvasName = row.name;
          flowData = JSON.parse(row.flow_data);
        }
      } catch (err) {
        logger.warn('intent-job-executor', 'sendProposal canvas load failed', { canvasId, error: String(err) });
      }

      const body = this.buildProposalBody(canvasName, flowData, goal);

      try {
        createNotification({
          type: 'catflow_pipeline',
          title: 'Pipeline listo para aprobar',
          message: body,
          severity: 'info',
          link: `/catflow/${canvasId}`,
        });
      } catch (err) {
        logger.warn('intent-job-executor', 'createNotification sendProposal failed', { error: String(err) });
      }

      if (job.channel === 'telegram' && job.channel_ref) {
        const chatId = parseInt(job.channel_ref, 10);
        if (!Number.isNaN(chatId)) {
          try {
            const { telegramBotService } = await import('./telegram-bot');
            await telegramBotService.sendMessageWithInlineKeyboard(chatId, body, [[
              { text: '✅ Aprobar', callback_data: `pipeline:${job.id}:approve` },
              { text: '❌ Cancelar', callback_data: `pipeline:${job.id}:reject` },
            ]]);
          } catch (err) {
            logger.warn('intent-job-executor', 'sendProposal telegram failed', { error: String(err) });
          }
        }
      }
    }
    ```

    PASO 3 — Tests `intent-job-executor-proposal.test.ts`:
    - Mock `db.prepare(...).get` para devolver canvas sintético con un flow_data conocido de 6 nodos (holded-q1 shape)
    - Spy `telegramBotService.sendMessageWithInlineKeyboard`
    - Llamar `(IntentJobExecutor as unknown as { sendProposal }).sendProposal(job, canvasId, goal, tasks)`
    - Assertar los 9 behaviors (8 de la función + 1 grep del knowledge tree)

    PASO 4 — Verificar: el callback_data preserva los strings `pipeline:{jobId}:approve|reject` — el handler en `telegram-bot.ts` no se cambia. Grep por `pipeline:` en telegram-bot.ts para confirmar el format es el mismo.

    PASO 5 — `buildProposalBody` y `formatNodeLine` se exponen como privadas pero accesibles en tests vía `as unknown as { buildProposalBody, formatNodeLine }` (mismo pattern que qaInternals). No exportarlas públicamente.

    PASO 6 — **Knowledge tree — catboard.json.** Añadir al array `concepts`:
    - `"sendProposal (LEARN-07): el mensaje de aprobación de pipeline en Telegram usa el formato rico — título del canvas + lista de nodos con emoji por rol + tiempo estimado + botones inline ✅ Aprobar / ❌ Cancelar. Emojis: extractor📥 transformer🔁 synthesizer🧠 renderer🎨 emitter📤 guard🚦 reporter📊 start🚀 default•. Callback_data backward-compat: pipeline:{jobId}:approve|reject."`
    - `"Tiempo estimado en sendProposal: heurística ceil(agent_count * 30s / 60) clampeado a [1,10] minutos."`

    Añadir al array `howto`:
    - `"Aprobar un pipeline async desde Telegram: el bot envía un mensaje con el formato LEARN-07 (título + nodos + tiempo + botones). Pulsa ✅ Aprobar para arrancar o ❌ Cancelar para descartar. El handler de telegram-bot.ts responde al callback_data pipeline:{jobId}:approve|reject."`

    Actualizar `sources` con ruta a este PLAN.md y a .planning/MILESTONE-CONTEXT.md (PARTE 7).
    Actualizar `updated_at`.

    NOTA: NO crear catbot.json — ese archivo no existe en el knowledge tree del proyecto. La knowledge meta del bot vive en catboard.json (que ya documenta Tab Pipelines, intent-jobs, alerts, etc.).
  </action>
  <verify>
    <automated>cd app &amp;&amp; npm test -- intent-job-executor-proposal &amp;&amp; grep -q "CatFlow generado\|sendProposal" app/data/knowledge/catboard.json</automated>
  </verify>
  <done>
    - sendProposal produce mensaje con título, nodos y tiempo
    - Botones preservados con callback_data backward-compat
    - Safety cap a 4000 chars
    - Tests verdes (9 behaviors incluyendo knowledge grep)
    - Web fallback (createNotification) también usa el body rico
    - catboard.json documenta el formato LEARN-07
  </done>
</task>

</tasks>

<verification>
1. `cd app && npm test -- intent-job-executor` → suite entera verde (incluye el nuevo proposal test + los 147 existentes)
2. `grep -q "CatFlow generado" app/data/knowledge/catboard.json` → match
3. Tras docker rebuild, un run real (telegram) debe mostrar el mensaje nuevo con emojis por rol — verificación end-to-end delegada al signal-gate 137-06 Task 2
</verification>

<success_criteria>
- LEARN-07 cumplido: sendProposal muestra el plan al usuario antes de aprobar
- callback_data backward-compat (no cambios al handler de botones)
- Knowledge tree (catboard.json) documenta el nuevo formato per CLAUDE.md protocol
- CatBot oracle waiver registrado: LEARN-07 es auto-verificable porque Telegram es el canal primario del bot, gate 137-06 cubre E2E
- 0 regresiones en intent-job-executor tests
</success_criteria>

<output>
After completion, create `.planning/phases/137-learning-loops-memory-learn/137-04-SUMMARY.md`
</output>
</content>
</invoke>