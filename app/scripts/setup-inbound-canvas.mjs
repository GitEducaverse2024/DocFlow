#!/usr/bin/env node
/**
 * Setup Script: CatFlow Revisión Diaria Inbound v4
 *
 * Creates all entities needed for the Inbound canvas:
 * - 6 CatPaws (Lector, Clasificador, Procesador, Maquetador, Ejecutor, Redactor Informe)
 * - 1 Skill (Leads y Funnel InfoEduca)
 * - 1 Gmail connector placeholder (requires manual OAuth2 config)
 * - 1 Canvas with complete flow_data (15 nodes, ITERATOR loop)
 * - All paw↔skill and paw↔connector links
 *
 * Run: node app/scripts/setup-inbound-canvas.mjs
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'docflow.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

function uid() { return crypto.randomUUID(); }

console.log('🔧 Setup Inbound Canvas v4\n');

// ─────────────────────────────────────────────
// 1. SKILL: Leads y Funnel InfoEduca
// ─────────────────────────────────────────────

const SKILL_LEADS_ID = uid();

const skillExists = db.prepare("SELECT id FROM skills WHERE name = 'Leads y Funnel InfoEduca'").get();
const skillLeadsId = skillExists?.id || SKILL_LEADS_ID;

if (!skillExists) {
  db.prepare(`INSERT INTO skills (id, name, description, instructions, category, tags) VALUES (?, ?, ?, ?, ?, ?)`).run(
    skillLeadsId,
    'Leads y Funnel InfoEduca',
    'Inteligencia comercial Educa360: 6 productos, 8 tipos de lead, reglas reply_mode, mapeo producto→plantilla',
    `# Leads y Funnel InfoEduca

## Productos Educa360
1. **K12** — Plataforma educativa para colegios (primaria y secundaria)
2. **REVI** — Plataforma de realidad virtual educativa inmersiva
3. **Simulator** — Simulador de escenarios formativos para empresas
4. **EducaVerse** — Metaverso educativo para universidades
5. **Campus360** — LMS cloud para formación corporativa
6. **Educa360 (genérico)** — Consulta general → asignar K12 por defecto

## Tipos de Lead y Acción
| Categoría | Descripción | Acción |
|-----------|-------------|--------|
| A — Lead caliente | Solicita demo, precio o reunión | responder_rag |
| B — Lead tibio | Pide información general de producto | responder_rag |
| C — Registro free | Se registró en trial/freemium | responder_rag |
| D — Consulta soporte | Problema técnico o duda de uso | derivar → soporte |
| E — Proveedor/partner | Propuesta comercial entrante | derivar → dirección |
| F — Institucional | Administración pública, ministerio | derivar → dirección |
| G — Newsletter/spam | Publicidad, newsletters | ignorar |
| H — Interno | Email de empleado o sistema | ignorar |

## Reglas de reply_mode
- **REPLY_HILO**: Emails directos (from = persona real). Usar gmail_reply_to_message con el messageId original.
- **EMAIL_NUEVO**: Formularios (from = sistema tipo BlastFunnels, Typeform, etc). Usar gmail_send_email a reply_to_email.

## Extracción de reply_to_email
- Si from es persona real → reply_to_email = from
- Si from es sistema (blastfunnels, typeform, hubspot, mailchimp) → buscar campo "E-mail:", "Email:", "Correo:" en el body
- Si no se encuentra email en body → reply_to_email = null, puede_responder = false

## Mapeo Producto → Plantilla
| Producto | Plantilla recomendada | Tiene bloques instruction |
|----------|----------------------|--------------------------|
| K12 | Respuesta Comercial | Sí |
| REVI | Respuesta Comercial | Sí |
| Simulator | Respuesta Comercial | Sí |
| EducaVerse | Respuesta Comercial | Sí |
| Campus360 | Respuesta Comercial | Sí |
| Genérico | Respuesta Comercial | Sí |

## Directivos para derivación/informes
- Antonio (CEO): antonio@educa360.com
- Fran (CTO): fran@educa360.com
- Fen (COO): fen@educa360.com
- Adriano (CMO): adriano@educa360.com

## Equipos para derivación
- Soporte técnico: soporte@educa360.com
- Dirección: antonio@educa360.com, fran@educa360.com`,
    'sales',
    'leads,funnel,inbound,educa360,clasificacion'
  );
  console.log('✅ Skill "Leads y Funnel InfoEduca" creada');
} else {
  console.log('⏭️  Skill "Leads y Funnel InfoEduca" ya existe');
}

// ─────────────────────────────────────────────
// 2. GMAIL CONNECTOR (placeholder — requires manual OAuth2)
// ─────────────────────────────────────────────

const GMAIL_CONN_ID = 'conn-gmail-info-educa360';
const gmailExists = db.prepare("SELECT id FROM connectors WHERE id = ?").get(GMAIL_CONN_ID);

if (!gmailExists) {
  db.prepare(`INSERT INTO connectors (id, name, type, emoji, description, is_active) VALUES (?, ?, ?, ?, ?, ?)`).run(
    GMAIL_CONN_ID,
    'Info Educa360 (Gmail)',
    'gmail',
    '📧',
    'Gmail OAuth2 para info@educa360.com — REQUIERE CONFIGURACIÓN MANUAL de OAuth2 en /catpower/connectors',
    0  // inactive until OAuth2 is configured
  );
  console.log('✅ Connector Gmail creado (⚠️  INACTIVO — configurar OAuth2 manualmente)');
} else {
  console.log('⏭️  Connector Gmail ya existe');
}

// ─────────────────────────────────────────────
// 3. CATPAWS (6 agentes del equipo inbound)
// ─────────────────────────────────────────────

const PAWS = {
  lector: { id: uid(), name: 'Lector Inbound', emoji: '📬', department: 'Negocio', mode: 'chat', temp: 0.1, tokens: 4096,
    prompt: `Eres un lector de buzón de email. Tu ÚNICA tarea es buscar emails sin respuesta y devolver un array JSON.

PROTOCOLO:
1. Calcular fecha hace 7 días (formato YYYY/MM/DD)
2. gmail_search_emails con query "in:inbox after:{fecha}" → obtener lista inbox
3. gmail_search_emails con query "in:sent after:{fecha}" → obtener lista sent
4. Extraer threadIds de sent en un Set
5. Filtrar inbox: solo emails cuyo threadId NO esté en el Set de sent
6. Para cada email filtrado: gmail_read_email para obtener body completo
7. Recortar body a 500 caracteres

OUTPUT obligatorio — JSON puro, sin texto adicional:
[
  {
    "messageId": "id exacto del email",
    "threadId": "id exacto del hilo",
    "from": "remitente exacto",
    "subject": "asunto exacto",
    "body": "primeros 500 chars del body",
    "date": "fecha del email"
  }
]

Si no hay emails sin respuesta: devolver []`
  },
  clasificador: { id: uid(), name: 'Clasificador Inbound', emoji: '🏷️', department: 'Negocio', mode: 'processor', temp: 0.1, tokens: 8192,
    prompt: `Eres un clasificador de emails entrantes. Recibes UN email en JSON y devuelves el MISMO objeto con campos de clasificación añadidos.

PROTOCOLO:
1. Leer el email recibido (un solo objeto JSON)
2. Clasificar según la skill "Leads y Funnel InfoEduca" (categorías A-H)
3. Determinar producto Educa360 mencionado (K12, REVI, Simulator, EducaVerse, Campus360, o genérico→K12)
4. Determinar reply_mode (REPLY_HILO o EMAIL_NUEVO) según las reglas de la skill
5. Extraer reply_to_email según las reglas (from directo o campo Email del body para formularios)
6. Generar rag_query específica para el producto detectado

OUTPUT — JSON puro del objeto original + campos nuevos:
{
  ...campos_originales_intactos,
  "categoria": "A",
  "categoria_desc": "Lead caliente - solicita demo",
  "accion": "responder_rag",
  "producto": "K12",
  "reply_mode": "REPLY_HILO",
  "reply_to_email": "email@exacto.com",
  "rag_query": "información sobre K12 para colegios, precios y demo"
}

REGLA: Si no puedes extraer reply_to_email → "reply_to_email": null, "accion": "derivar"`
  },
  procesador: { id: uid(), name: 'Procesador Inbound', emoji: '⚡', department: 'Negocio', mode: 'chat', temp: 0.5, tokens: 8192,
    prompt: `Eres un agente de respuesta comercial de Educa360. Recibes UN email clasificado con contexto RAG y redactas la respuesta.

PROTOCOLO:
1. Leer el email clasificado (un solo objeto JSON)
2. Si accion = "ignorar" → devolver el objeto con puede_responder: false, motivo: "ignorar"
3. Si accion = "derivar" → devolver el objeto con puede_responder: false, motivo: "derivar"
4. Si accion = "responder_rag":
   a. Consultar el CatBrain vinculado usando rag_query para obtener contexto del producto
   b. Redactar respuesta personalizada usando el contexto RAG
   c. Tono: profesional, cercano, orientado a siguiente paso (demo, reunión, llamada)
   d. Máximo 150 palabras de cuerpo
   e. Incluir CTA claro (agendar demo, solicitar más info, etc.)

OUTPUT — JSON puro:
{
  ...campos_originales_intactos,
  "contexto_rag": "contexto obtenido del CatBrain",
  "puede_responder": true,
  "cuerpo_respuesta": "texto de la respuesta redactada",
  "asunto_respuesta": "Re: asunto original o asunto nuevo",
  "confianza": 0.9
}

REGLA ABSOLUTA: NUNCA inventar messageId, threadId ni reply_to_email. Copiar EXACTAMENTE del input.`
  },
  maquetador: { id: uid(), name: 'Maquetador Inbound', emoji: '🎨', department: 'Negocio', mode: 'chat', temp: 0.3, tokens: 8192,
    prompt: `Eres un maquetador de emails HTML. Recibes UN email con cuerpo redactado y lo conviertes en HTML profesional usando plantillas.

PROTOCOLO:
1. Leer el email (un solo objeto JSON)
2. Si puede_responder = false → devolver el objeto sin modificar
3. Si puede_responder = true:
   a. list_email_templates → obtener plantillas disponibles
   b. Seleccionar plantilla según la skill "Maquetador de Email" y el producto
   c. get_email_template con el ID seleccionado
   d. render_email_template con variables: asunto, cuerpo, nombre del lead, producto
   e. Si la plantilla no tiene bloques instruction → generar HTML directo profesional

OUTPUT — JSON puro:
{
  ...campos_originales_intactos,
  "plantilla_usada": "nombre de la plantilla",
  "html_body": "<html>...</html>"
}

REGLA: Si render falla, generar HTML mínimo con el cuerpo_respuesta. NUNCA devolver sin html_body si puede_responder=true.`
  },
  ejecutor: { id: uid(), name: 'Ejecutor Inbound', emoji: '🚀', department: 'Negocio', mode: 'chat', temp: 0.1, tokens: 4096,
    prompt: `Eres un ejecutor de acciones Gmail. Recibes UN email procesado y ejecutas la acción correspondiente.

PROTOCOLO según acción:
1. Si puede_responder = true Y html_body existe:
   - Si reply_mode = "REPLY_HILO" → gmail_reply_to_message(messageId, html_body como body)
   - Si reply_mode = "EMAIL_NUEVO" → gmail_send_email(to=reply_to_email, subject=asunto_respuesta, html_body=html_body)
   - Luego: gmail_mark_as_read(messageId)

2. Si accion = "derivar":
   - gmail_send_email(to=email_derivacion, subject="[Derivado] " + subject, body=resumen del email)
   - gmail_mark_as_read(messageId)

3. Si accion = "ignorar":
   - gmail_mark_as_read(messageId)

OUTPUT — JSON puro:
{
  ...campos_originales_intactos,
  "accion_tomada": "respondido|derivado|ignorado",
  "enviado": true,
  "destinatario_final": "email al que se envió"
}

REGLAS ABSOLUTAS:
- NUNCA usar el campo "from" como destinatario. SIEMPRE usar reply_to_email.
- Para html_body: usar html_body, NO cuerpo_respuesta (que es texto plano).
- Si reply_to_email es null → accion_tomada: "derivado", enviar a antonio@educa360.com`
  },
  redactor: { id: uid(), name: 'Redactor Informe Inbound', emoji: '📊', department: 'Negocio', mode: 'chat', temp: 0.3, tokens: 8192,
    prompt: `Eres un redactor de informes ejecutivos. Recibes los resultados acumulados del procesamiento de emails y generas un informe HTML para el equipo directivo.

PROTOCOLO:
1. Parsear el array de resultados (cada item es un email procesado con su accion_tomada)
2. list_email_templates → buscar "Informe de Leads"
3. get_email_template con el ID del informe
4. Preparar contenido del informe:
   - Resumen: X emails procesados, Y respondidos, Z derivados, W ignorados
   - Tabla: Contacto | Producto | Categoría | Acción tomada | Destinatario
   - Leads destacados (categoría A con confianza > 0.8)
   - Alertas si algún email no pudo procesarse
5. render_email_template con las variables del informe

OUTPUT — JSON puro:
{
  "html_body": "<html>informe renderizado</html>",
  "asunto": "📊 Informe Inbound Diario — {fecha} — {N} emails procesados",
  "to": "antonio@educa360.com,fran@educa360.com,fen@educa360.com,adriano@educa360.com"
}`
  },
};

// Insert CatPaws
const insertPaw = db.prepare(`
  INSERT OR IGNORE INTO cat_paws (id, name, description, avatar_emoji, department_tags, system_prompt, mode, model, temperature, max_tokens, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

for (const [key, p] of Object.entries(PAWS)) {
  const existing = db.prepare("SELECT id FROM cat_paws WHERE name = ?").get(p.name);
  if (existing) {
    PAWS[key].id = existing.id;
    console.log(`⏭️  CatPaw "${p.name}" ya existe`);
  } else {
    insertPaw.run(p.id, p.name, `Equipo Inbound Educa360 — ${p.emoji}`, p.emoji, p.department, p.prompt, p.mode, 'gemini-main', p.temp, p.tokens);
    console.log(`✅ CatPaw "${p.name}" creado`);
  }
}

// ─────────────────────────────────────────────
// 4. LINKS: CatPaw ↔ Skills, CatPaw ↔ Connectors
// ─────────────────────────────────────────────

const linkSkill = db.prepare('INSERT OR IGNORE INTO cat_paw_skills (paw_id, skill_id) VALUES (?, ?)');
const linkConn = db.prepare('INSERT OR IGNORE INTO cat_paw_connectors (paw_id, connector_id, usage_hint) VALUES (?, ?, ?)');

// Maquetador skill
const maquetadorSkill = db.prepare("SELECT id FROM skills WHERE name LIKE '%Maquetador%Email%'").get();

// Lector → Gmail
linkConn.run(PAWS.lector.id, GMAIL_CONN_ID, 'Leer emails de info@educa360.com');
// Clasificador → Skill Leads (NO gmail, NO template — R08)
linkSkill.run(PAWS.clasificador.id, skillLeadsId);
// Procesador → Skill Leads
linkSkill.run(PAWS.procesador.id, skillLeadsId);
// Maquetador → Template connector + Maquetador skill
linkConn.run(PAWS.maquetador.id, 'seed-email-template', 'Renderizar plantillas de email');
if (maquetadorSkill) linkSkill.run(PAWS.maquetador.id, maquetadorSkill.id);
// Ejecutor → Gmail
linkConn.run(PAWS.ejecutor.id, GMAIL_CONN_ID, 'Enviar emails desde info@educa360.com');
// Redactor Informe → Template connector
linkConn.run(PAWS.redactor.id, 'seed-email-template', 'Renderizar plantilla de informe');
// Ejecutor Informe reuses Ejecutor Gmail paw

console.log('✅ Links skill↔paw y connector↔paw creados');

// ─────────────────────────────────────────────
// 5. CANVAS: Revisión Diaria Inbound v4
// ─────────────────────────────────────────────

const CANVAS_ID = '9366fa92-99c6-4ec9-8cf8-7c627ccd1d97';

// Node IDs
const N = {
  start:         'n-start',
  lector:        'n-lector',
  condition:     'n-condition',
  outputEmpty:   'n-output-empty',
  clasificador:  'n-clasificador',
  iterator:      'n-iterator',
  iteratorEnd:   'n-iterator-end',
  procesador:    'n-procesador',
  maquetador:    'n-maquetador',
  ejecutor:      'n-ejecutor',
  storage:       'n-storage',
  redactor:      'n-redactor',
  ejecutorInf:   'n-ejecutor-informe',
  output:        'n-output',
};

const nodes = [
  // Row 1: Start → Lector → Condition
  { id: N.start, type: 'start', position: { x: 0, y: 300 }, data: {
    label: 'Inicio Diario',
    initialInput: '',
    schedule_config: { type: 'weekly', days: [1,2,3,4,5], time: '10:00', is_active: false },
  }},
  { id: N.lector, type: 'agent', position: { x: 280, y: 300 }, data: {
    label: 'Lector Emails',
    agentId: PAWS.lector.id, agentName: PAWS.lector.name, model: 'gemini-main', mode: 'chat',
    instructions: '',  // uses CatPaw system_prompt
  }},
  { id: N.condition, type: 'condition', position: { x: 560, y: 300 }, data: {
    label: '¿Hay emails?',
    condition: '¿El array JSON tiene al menos 1 elemento? Si es [] o está vacío, responde NO.',
  }},
  { id: N.outputEmpty, type: 'output', position: { x: 560, y: 520 }, data: {
    label: 'Sin emails',
    outputName: 'Sin emails nuevos sin respuesta',
    format: 'markdown', notify_on_complete: true,
  }},

  // Row 2: Clasificador → ITERATOR
  { id: N.clasificador, type: 'agent', position: { x: 840, y: 220 }, data: {
    label: 'Clasificador',
    agentId: PAWS.clasificador.id, agentName: PAWS.clasificador.name, model: 'gemini-main', mode: 'processor',
    instructions: 'Clasifica CADA email del array individualmente. Devuelve el MISMO array con campos de clasificación añadidos. JSON puro.',
  }},
  { id: N.iterator, type: 'iterator', position: { x: 1120, y: 220 }, data: {
    label: 'Por cada email',
    separator: '',  // auto-detect JSON array
    limit_mode: 'rounds', max_rounds: 20, max_time: 600,
    iteratorEndId: N.iteratorEnd,
  }},

  // Iterator loop body: Procesador → Maquetador → Ejecutor
  { id: N.procesador, type: 'agent', position: { x: 1420, y: 140 }, data: {
    label: 'Procesador',
    agentId: PAWS.procesador.id, agentName: PAWS.procesador.name, model: 'gemini-main', mode: 'chat',
    instructions: '',  // uses CatPaw system_prompt
  }},
  { id: N.maquetador, type: 'agent', position: { x: 1720, y: 140 }, data: {
    label: 'Maquetador',
    agentId: PAWS.maquetador.id, agentName: PAWS.maquetador.name, model: 'gemini-main', mode: 'chat',
    instructions: '',  // uses CatPaw system_prompt
  }},
  { id: N.ejecutor, type: 'agent', position: { x: 2020, y: 140 }, data: {
    label: 'Ejecutor Gmail',
    agentId: PAWS.ejecutor.id, agentName: PAWS.ejecutor.name, model: 'gemini-main', mode: 'chat',
    instructions: '',  // uses CatPaw system_prompt
  }},
  { id: N.iteratorEnd, type: 'iterator_end', position: { x: 2280, y: 140 }, data: {
    label: 'Fin iteración',
    iteratorId: N.iterator,
  }},

  // Post-loop: Storage → Redactor → Ejecutor Informe → Output
  { id: N.storage, type: 'storage', position: { x: 2280, y: 380 }, data: {
    label: 'Log Diario',
    storage_mode: 'local',
    filename_template: 'inbound_{date}.md',
    subdir: 'inbound',
    use_llm_format: true,
    format_instructions: 'Formatea como tabla markdown: | Contacto | Email | Producto | Categoría | Acción | Resultado |. Usa datos reales del array (reply_to_email, producto, categoria_desc, accion_tomada). NO uses IDs técnicos.',
    format_model: 'gemini-main',
  }},
  { id: N.redactor, type: 'agent', position: { x: 2560, y: 380 }, data: {
    label: 'Redactor Informe',
    agentId: PAWS.redactor.id, agentName: PAWS.redactor.name, model: 'gemini-main', mode: 'chat',
    instructions: '',  // uses CatPaw system_prompt
  }},
  { id: N.ejecutorInf, type: 'agent', position: { x: 2840, y: 380 }, data: {
    label: 'Ejecutor Informe',
    agentId: PAWS.ejecutor.id, agentName: PAWS.ejecutor.name, model: 'gemini-main', mode: 'chat',
    instructions: 'Recibes {html_body, asunto, to}. Envía con gmail_send_email usando html_body. Los destinatarios están separados por comas — envía a TODOS.',
  }},
  { id: N.output, type: 'output', position: { x: 3120, y: 380 }, data: {
    label: 'Completado',
    outputName: 'Revisión Inbound completada',
    format: 'markdown', notify_on_complete: true,
  }},
];

const edges = [
  // Main flow
  { id: 'e-start-lector',     source: N.start,        target: N.lector },
  { id: 'e-lector-condition',  source: N.lector,       target: N.condition },
  // Condition branches
  { id: 'e-cond-no',          source: N.condition,     target: N.outputEmpty,  sourceHandle: 'no' },
  { id: 'e-cond-yes',         source: N.condition,     target: N.clasificador, sourceHandle: 'yes' },
  // Clasificador → Iterator
  { id: 'e-clasif-iter',      source: N.clasificador,  target: N.iterator },
  // Iterator loop body (element handle)
  { id: 'e-iter-proc',        source: N.iterator,      target: N.procesador,   sourceHandle: 'element' },
  { id: 'e-proc-maq',         source: N.procesador,    target: N.maquetador },
  { id: 'e-maq-ejec',         source: N.maquetador,    target: N.ejecutor },
  { id: 'e-ejec-iterend',     source: N.ejecutor,      target: N.iteratorEnd },
  // Post-loop
  { id: 'e-iterend-storage',  source: N.iteratorEnd,   target: N.storage },
  { id: 'e-storage-redactor', source: N.storage,       target: N.redactor },
  { id: 'e-redactor-ejecinf', source: N.redactor,      target: N.ejecutorInf },
  { id: 'e-ejecinf-output',   source: N.ejecutorInf,   target: N.output },
];

// Add edge type defaults
const edgesWithType = edges.map(e => ({ ...e, type: 'default' }));

const canvasExists = db.prepare("SELECT id FROM canvases WHERE id = ?").get(CANVAS_ID);
if (canvasExists) {
  db.prepare('UPDATE canvases SET flow_data = ?, node_count = ?, updated_at = datetime("now") WHERE id = ?')
    .run(JSON.stringify({ nodes, edges: edgesWithType }), nodes.length, CANVAS_ID);
  console.log('✅ Canvas actualizado con flow v4');
} else {
  db.prepare(`INSERT INTO canvases (id, name, description, emoji, mode, status, flow_data, node_count, listen_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(CANVAS_ID, 'Revisión Diaria Inbound', 'Automatización diaria del buzón info@educa360.com — v4 con ITERATOR', '📬', 'mixed', 'idle',
      JSON.stringify({ nodes, edges: edgesWithType }), nodes.length, 0);
  console.log('✅ Canvas "Revisión Diaria Inbound" creado con flow v4');
}

// ─────────────────────────────────────────────
// 6. SUMMARY
// ─────────────────────────────────────────────

console.log('\n═══════════════════════════════════════');
console.log('  SETUP COMPLETADO');
console.log('═══════════════════════════════════════');
console.log(`  Canvas:   ${CANVAS_ID}`);
console.log(`  Nodos:    ${nodes.length}`);
console.log(`  Edges:    ${edges.length}`);
console.log(`  CatPaws:  ${Object.keys(PAWS).length}`);
console.log(`  Skills:   1 (Leads y Funnel InfoEduca)`);
console.log('');
console.log('⚠️  PASOS MANUALES REQUERIDOS:');
console.log('  1. Configurar OAuth2 en el conector Gmail:');
console.log('     → /catpower/connectors → "Info Educa360 (Gmail)" → OAuth2');
console.log('     → Client ID y Secret del proyecto Google Cloud "Educa360 Login"');
console.log('     → Cuenta: info@educa360.com');
console.log('');
console.log('  2. Crear CatBrain "Educa360" con documentos de producto:');
console.log('     → /catbrains → Nuevo → Subir PDFs/URLs de K12, REVI, Simulator, etc.');
console.log('     → Procesar e indexar RAG');
console.log('     → Vincular al CatPaw "Procesador Inbound" en /agents');
console.log('');
console.log('  3. Activar schedule en el canvas:');
console.log('     → /canvas/' + CANVAS_ID + ' → Nodo Start → Schedule → Activar');
console.log('');

db.close();
