#!/usr/bin/env node
/**
 * Setup Script: CatFlow Email Classifier Pilot
 *
 * Creates:
 * - 4 email templates Pro-* (Pro-K12, Pro-Simulator, Pro-REVI, Pro-Educaverse)
 *   with real content blocks (header/saludo/propuesta/CTA/footer)
 * - 1 Canvas "Email Classifier Pilot" with 8 nodes and 9 edges
 *   (START -> Normalizador -> Clasificador -> Condition -> RAG -> Respondedor -> Gmail -> OUTPUT)
 *
 * Idempotent: safe to run multiple times.
 *
 * Run: node app/scripts/setup-email-classifier-pilot.mjs
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

console.log('Setup Email Classifier Pilot\n');

// ─────────────────────────────────────────────
// 1. TEMPLATES Pro-*
// ─────────────────────────────────────────────

const TEMPLATES = {
  'bc03e496': {
    name: 'Pro-K12',
    description: 'Plantilla comercial para producto K12 - Plataforma educativa para colegios',
    category: 'comercial',
    propuesta: 'K12 es nuestra plataforma educativa integral para colegios de primaria y secundaria. Incluye gamificacion interactiva que motiva a los alumnos, seguimiento personalizado del progreso de cada estudiante, reportes automaticos para padres y tutores, y un panel de control para el profesorado. Con K12, los colegios transforman su modelo pedagogico con herramientas digitales que se adaptan al ritmo de cada alumno.',
    tagline: 'Plataforma educativa para colegios',
    color: '#2563eb',
  },
  'd7cc4227': {
    name: 'Pro-Simulator',
    description: 'Plantilla comercial para producto Simulator - Simulador formativo empresarial',
    category: 'comercial',
    propuesta: 'Simulator es nuestro simulador de escenarios formativos disenado para empresas. Ofrece aprendizaje experiencial con situaciones realistas, metricas de rendimiento detalladas por participante, escenarios personalizables por sector (ventas, atencion al cliente, liderazgo), y analisis de competencias con recomendaciones de mejora. Simulator reduce el tiempo de onboarding un 40% y mejora la retencion del conocimiento.',
    tagline: 'Simulador formativo para empresas',
    color: '#059669',
  },
  '9f97f705': {
    name: 'Pro-REVI',
    description: 'Plantilla comercial para producto REVI - Realidad Virtual Educativa Inmersiva',
    category: 'comercial',
    propuesta: 'REVI es nuestra plataforma de realidad virtual educativa inmersiva. Permite crear laboratorios virtuales seguros para practicas de ciencias, ingenieria y medicina, experiencias 360 grados que transportan al alumno a cualquier lugar del mundo, contenido inmersivo compatible con cascos VR y dispositivos moviles, y evaluacion automatica de habilidades practicas en entorno controlado. REVI hace posible aprender haciendo, sin riesgos ni limites fisicos.',
    tagline: 'Realidad Virtual Educativa Inmersiva',
    color: '#7c3aed',
  },
  '155c955e': {
    name: 'Pro-Educaverse',
    description: 'Plantilla comercial para producto Educaverse - Metaverso educativo universitario',
    category: 'comercial',
    propuesta: 'Educaverse es nuestro metaverso educativo disenado para universidades. Incluye aulas virtuales 3D donde profesores y alumnos interactuan con avatares, colaboracion remota en tiempo real con pizarras compartidas y laboratorios virtuales, campus digital personalizable con la identidad de cada universidad, y analiticas de engagement y participacion por sesion. Educaverse conecta la experiencia presencial con la flexibilidad digital.',
    tagline: 'Metaverso educativo para universidades',
    color: '#dc2626',
  },
};

function buildTemplateStructure(tpl) {
  return {
    sections: {
      header: {
        rows: [
          {
            id: 'r-header',
            columns: [{
              id: 'c-header',
              width: '100%',
              block: {
                type: 'text',
                content: `**Educa360 | ${tpl.name}**\n_${tpl.tagline}_`,
              },
            }],
          },
        ],
      },
      body: {
        rows: [
          {
            id: 'r-saludo',
            columns: [{
              id: 'c-saludo',
              width: '100%',
              block: {
                type: 'instruction',
                text: `Saludo personalizado: Hola {{nombre}}, gracias por tu interes en ${tpl.name}. Adapta el saludo al contexto del email recibido.`,
              },
            }],
          },
          {
            id: 'r-propuesta',
            columns: [{
              id: 'c-propuesta',
              width: '100%',
              block: {
                type: 'instruction',
                text: `Propuesta de valor: ${tpl.propuesta}. Personaliza con contexto RAG si esta disponible.`,
              },
            }],
          },
          {
            id: 'r-cta',
            columns: [{
              id: 'c-cta',
              width: '100%',
              block: {
                type: 'text',
                content: '**[Agendar Demo](https://calendly.com/educa360/demo)**\n\nResponde a este email o reserva directamente en el enlace.',
              },
            }],
          },
        ],
      },
      footer: {
        rows: [
          {
            id: 'r-footer',
            columns: [{
              id: 'c-footer',
              width: '100%',
              block: {
                type: 'text',
                content: 'Un saludo,\n**Equipo Comercial Educa360**\n\n[educa360.com](https://educa360.com) | [LinkedIn](https://linkedin.com/company/educa360) | [Twitter](https://twitter.com/educa360)\n\n_Este email ha sido generado automaticamente. Si no deseas recibir mas comunicaciones, responde con BAJA._',
              },
            }],
          },
        ],
      },
    },
    styles: {
      backgroundColor: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      primaryColor: tpl.color,
      textColor: '#333333',
      maxWidth: 600,
    },
  };
}

let templatesCreated = 0;
let templatesUpdated = 0;

for (const [id, tpl] of Object.entries(TEMPLATES)) {
  const existing = db.prepare('SELECT id, structure FROM email_templates WHERE id = ?').get(id);
  const structure = JSON.stringify(buildTemplateStructure(tpl));

  if (!existing) {
    db.prepare(`INSERT INTO email_templates (id, name, description, category, structure, is_active) VALUES (?, ?, ?, ?, ?, 1)`)
      .run(id, tpl.name, tpl.description, tpl.category, structure);
    templatesCreated++;
    console.log(`  [CREATED] Template "${tpl.name}" (${id})`);
  } else {
    // Check if structure has real content (more than seed placeholder)
    const existingStructure = JSON.parse(existing.structure);
    const bodyRows = existingStructure?.sections?.body?.rows || [];
    const hasRealContent = bodyRows.length >= 3;

    if (!hasRealContent) {
      db.prepare("UPDATE email_templates SET structure = ?, description = ?, updated_at = datetime('now') WHERE id = ?")
        .run(structure, tpl.description, id);
      templatesUpdated++;
      console.log(`  [UPDATED] Template "${tpl.name}" (${id}) — added real content blocks`);
    } else {
      console.log(`  [SKIP] Template "${tpl.name}" (${id}) — already has content`);
    }
  }
}

console.log(`\nTemplates: ${templatesCreated} created, ${templatesUpdated} updated\n`);

// ─────────────────────────────────────────────
// 2. CATFLOW EMAIL CLASSIFIER PILOT — 8 nodes, 9 edges
// ─────────────────────────────────────────────

// Lookup real agentIds from DB — NEVER invent UUIDs
const pawClasificador = db.prepare("SELECT id, name FROM cat_paws WHERE name LIKE '%Clasificador Inbound%'").get();
const pawRespondedor = db.prepare("SELECT id, name FROM cat_paws WHERE name LIKE '%Respondedor Inbound%'").get();
const pawEjecutor = db.prepare("SELECT id, name FROM cat_paws WHERE name LIKE '%Ejecutor%Gmail%' OR name LIKE '%Ejecutor Inbound%'").get();

// For Normalizador: use Lector Inbound (reads/normalizes emails)
const pawLector = db.prepare("SELECT id, name FROM cat_paws WHERE name LIKE '%Lector Inbound%'").get();

// For Respondedor: if no specific one, look broader
const pawRespondedorFinal = pawRespondedor || db.prepare("SELECT id, name FROM cat_paws WHERE name LIKE '%Procesador Inbound%'").get();

// Gmail connector
const gmailConnector = db.prepare("SELECT id, name FROM connectors WHERE type = 'gmail'").get();

// CatBrain DoCatFlow
const catbrainDoCatFlow = db.prepare("SELECT id, name FROM catbrains WHERE name LIKE '%DoCatFlow%'").get();
const catbrainEduca = catbrainDoCatFlow || db.prepare("SELECT id, name FROM catbrains WHERE name LIKE '%Educa%'").get();

console.log('Agent lookup:');
console.log(`  Normalizador -> ${pawLector ? pawLector.name + ' (' + pawLector.id + ')' : 'NOT FOUND — will use LLM direct'}`);
console.log(`  Clasificador -> ${pawClasificador ? pawClasificador.name + ' (' + pawClasificador.id + ')' : 'NOT FOUND — will use LLM direct'}`);
console.log(`  Respondedor  -> ${pawRespondedorFinal ? pawRespondedorFinal.name + ' (' + pawRespondedorFinal.id + ')' : 'NOT FOUND — will use LLM direct'}`);
console.log(`  Gmail exec   -> ${pawEjecutor ? pawEjecutor.name + ' (' + pawEjecutor.id + ')' : 'NOT FOUND'}`);
console.log(`  Gmail conn   -> ${gmailConnector ? gmailConnector.name + ' (' + gmailConnector.id + ')' : 'NOT FOUND'}`);
console.log(`  CatBrain     -> ${catbrainEduca ? catbrainEduca.name + ' (' + catbrainEduca.id + ')' : 'NOT FOUND — manual step required'}`);
console.log('');

// Node IDs
const N = {
  start:         uid(),
  normalizador:  uid(),
  clasificador:  uid(),
  condition:     uid(),
  rag:           uid(),
  respondedor:   uid(),
  gmail:         uid(),
  output:        uid(),
};

// 3 test emails in initialInput
const testEmails = JSON.stringify([
  {
    messageId: 'msg-pilot-001',
    threadId: 'thread-pilot-001',
    from: 'maria.garcia@colegio-sanmiguel.edu',
    subject: 'Solicitud de demo plataforma K12 para 3 sedes',
    body: 'Buenos dias, soy Maria Garcia, directora del Colegio San Miguel. Tenemos 3 sedes con 2000 alumnos y estamos buscando una plataforma educativa digital. Nos interesa K12 por las funcionalidades de gamificacion y seguimiento de alumnos. Podrian agendarnos una demo? Gracias.',
    date: '2026-04-16T09:15:00Z',
  },
  {
    messageId: 'msg-pilot-002',
    threadId: 'thread-pilot-002',
    from: 'j.fernandez@universidad-autonoma.edu',
    subject: 'Informacion sobre REVI para Facultad de Medicina',
    body: 'Hola, soy el Dr. Fernandez de la Facultad de Medicina. Estamos evaluando soluciones de realidad virtual para practicas de anatomia y cirugia. Vi que tienen REVI y me gustaria conocer precios y compatibilidad con nuestros equipos Meta Quest. Podrian enviarnos un dossier?',
    date: '2026-04-16T14:30:00Z',
  },
  {
    messageId: 'msg-pilot-003',
    threadId: 'thread-pilot-003',
    from: 'noreply@newsletter-marketing.com',
    subject: 'Top 10 EdTech Trends 2026 - Download our free report!',
    body: 'Hi there! Check out the latest trends in educational technology. Download our exclusive report with insights from 500+ institutions. Click here to unsubscribe.',
    date: '2026-04-16T18:00:00Z',
  },
], null, 2);

const nodes = [
  // 1. START
  {
    id: N.start,
    type: 'start',
    position: { x: 0, y: 300 },
    data: {
      label: 'Emails Entrantes',
      initialInput: testEmails,
    },
  },

  // 2. Normalizador
  {
    id: N.normalizador,
    type: 'agent',
    position: { x: 280, y: 300 },
    data: {
      label: 'Normalizador',
      agentId: pawLector?.id || null,
      agentName: pawLector?.name || 'LLM Directo',
      model: 'canvas-formatter',
      mode: 'processor',
      instructions: `Extrae de cada email un JSON con exactamente estos 6 campos:
{ "from": "remitente", "subject": "asunto", "date": "fecha", "body_plain": "texto plano primeros 500 chars", "has_attachments": false, "message_id": "id unico" }
Si recibes multiples emails, devuelve un array JSON. Cada email es un objeto independiente.
Manten TODOS los campos originales (messageId, threadId) intactos y anade los 6 campos normalizados.`,
    },
  },

  // 3. Clasificador
  {
    id: N.clasificador,
    type: 'agent',
    position: { x: 560, y: 300 },
    data: {
      label: 'Clasificador',
      agentId: pawClasificador?.id || null,
      agentName: pawClasificador?.name || 'LLM Directo',
      model: 'canvas-classifier',
      mode: 'processor',
      instructions: `Clasifica cada email. Input: JSON del normalizador. Output por email:
{ ...campos_originales, "producto": "K12|Simulator|REVI|Educaverse|otro|spam", "template_id": "UUID de plantilla Pro-*", "reply_mode": "REPLY_HILO|EMAIL_NUEVO", "confianza": 0.9, "razon": "..." }

Mapeo producto->template_id:
- K12 -> bc03e496
- Simulator -> d7cc4227
- REVI -> 9f97f705
- Educaverse -> 155c955e
- otro -> bc03e496 (default K12)
- spam -> null

Reglas reply_mode:
- Si from contiene blastfunnels/typeform/hubspot/noreply/newsletter -> reply_mode=EMAIL_NUEVO, buscar reply_to_email real en el body
- Si from es persona real -> reply_mode=REPLY_HILO, reply_to_email=from

Devuelve el MISMO array JSON con campos de clasificacion anadidos. Manten TODOS los originales intactos.`,
    },
  },

  // 4. Condition (spam filter)
  {
    id: N.condition,
    type: 'condition',
    position: { x: 840, y: 300 },
    data: {
      label: 'Spam?',
      condition: 'Si TODOS los emails del array tienen producto "spam", responde NO. Si al menos uno tiene producto distinto de "spam", responde SI.',
    },
  },

  // 5. RAG (CatBrain)
  {
    id: N.rag,
    type: 'catbrain',
    position: { x: 1120, y: 200 },
    data: {
      label: 'RAG Producto',
      catbrainId: catbrainEduca?.id || null,
      catbrainName: catbrainEduca?.name || 'DoCatFlow (pendiente)',
      input_mode: 'pipeline',
      ragQuery: '',
    },
  },

  // 6. Respondedor
  {
    id: N.respondedor,
    type: 'agent',
    position: { x: 1400, y: 200 },
    data: {
      label: 'Respondedor',
      agentId: pawRespondedorFinal?.id || null,
      agentName: pawRespondedorFinal?.name || 'LLM Directo',
      model: 'canvas-writer',
      mode: 'processor',
      instructions: `Genera email de respuesta comercial. Input: contexto RAG + datos del clasificador.
Usa la plantilla Pro-* correspondiente al template_id. Estructura: saludo personalizado, propuesta de valor del producto con contexto RAG, CTA (agendar demo/llamada), despedida.

Output por cada email no-spam:
{ ...campos_originales, "cuerpo_respuesta": "texto del email", "asunto_respuesta": "Re: {subject}" }

Maximo 200 palabras por respuesta. Tono profesional y cercano.
Emails con producto "spam" pasan sin modificar con cuerpo_respuesta: null.
Manten TODOS los campos originales intactos.`,
    },
  },

  // 7. Gmail (connector)
  {
    id: N.gmail,
    type: 'connector',
    position: { x: 1680, y: 200 },
    data: {
      label: 'Gmail Envio',
      connectorId: gmailConnector?.id || null,
      connectorName: gmailConnector?.name || 'Gmail (pendiente)',
      instructions: `Envia el email usando el conector Gmail.
Si reply_mode=REPLY_HILO, usa reply con message_id original.
Si reply_mode=EMAIL_NUEVO, usa send a reply_to_email.
Emails con producto "spam" se ignoran (no enviar).`,
    },
  },

  // 8. OUTPUT
  {
    id: N.output,
    type: 'output',
    position: { x: 1960, y: 300 },
    data: {
      label: 'Pipeline Completado',
      outputName: 'Email Classifier Pilot completado',
      format: 'json',
      notify_on_complete: true,
    },
  },
];

const edges = [
  // start -> normalizador
  { id: `e-${N.start.slice(0,8)}-norm`,   source: N.start,        target: N.normalizador, type: 'default' },
  // normalizador -> clasificador
  { id: `e-norm-clasif`,                    source: N.normalizador, target: N.clasificador, type: 'default' },
  // clasificador -> condition
  { id: `e-clasif-cond`,                    source: N.clasificador, target: N.condition,    type: 'default' },
  // condition (yes = has non-spam) -> rag
  { id: `e-cond-yes-rag`,                   source: N.condition,    target: N.rag,          type: 'default', sourceHandle: 'yes' },
  // condition (no = all spam) -> output
  { id: `e-cond-no-output`,                 source: N.condition,    target: N.output,       type: 'default', sourceHandle: 'no' },
  // rag -> respondedor
  { id: `e-rag-resp`,                        source: N.rag,          target: N.respondedor,  type: 'default' },
  // respondedor -> gmail
  { id: `e-resp-gmail`,                      source: N.respondedor,  target: N.gmail,        type: 'default' },
  // gmail -> output
  { id: `e-gmail-output`,                    source: N.gmail,        target: N.output,       type: 'default' },
];

// Canvas name
const CANVAS_NAME = 'Email Classifier Pilot';
const CANVAS_ID = uid();

const canvasExists = db.prepare("SELECT id FROM canvases WHERE name = ?").get(CANVAS_NAME);

if (canvasExists) {
  db.prepare("UPDATE canvases SET flow_data = ?, node_count = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify({ nodes, edges }), nodes.length, canvasExists.id);
  console.log(`[UPDATED] Canvas "${CANVAS_NAME}" (${canvasExists.id})`);
} else {
  db.prepare(`INSERT INTO canvases (id, name, description, emoji, mode, status, flow_data, node_count, listen_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(CANVAS_ID, CANVAS_NAME, 'Piloto de clasificacion de emails: normaliza, clasifica por producto Educa360, busca contexto RAG, genera respuesta con plantilla Pro-*, envia via Gmail', '📧', 'mixed', 'idle',
      JSON.stringify({ nodes, edges }), nodes.length, 0);
  console.log(`[CREATED] Canvas "${CANVAS_NAME}" (${CANVAS_ID})`);
}

const finalCanvasId = canvasExists?.id || CANVAS_ID;

// ─────────────────────────────────────────────
// 3. SUMMARY
// ─────────────────────────────────────────────

// Verify results
const verifyTemplates = db.prepare('SELECT id, name FROM email_templates WHERE id IN (?, ?, ?, ?)').all('bc03e496', 'd7cc4227', '9f97f705', '155c955e');
const verifyCanvas = db.prepare('SELECT id, name, node_count FROM canvases WHERE id = ?').get(finalCanvasId);
const verifyFlow = JSON.parse(db.prepare('SELECT flow_data FROM canvases WHERE id = ?').get(finalCanvasId).flow_data);

console.log('\n========================================');
console.log('  SETUP COMPLETADO');
console.log('========================================');
console.log(`  Canvas ID:    ${finalCanvasId}`);
console.log(`  Canvas Name:  ${verifyCanvas.name}`);
console.log(`  Nodos:        ${verifyFlow.nodes.length}`);
console.log(`  Edges:        ${verifyFlow.edges.length}`);
console.log(`  Templates:    ${verifyTemplates.length}/4 Pro-*`);
console.log('');
console.log('  Templates verificadas:');
for (const t of verifyTemplates) {
  const s = JSON.parse(db.prepare('SELECT structure FROM email_templates WHERE id = ?').get(t.id).structure);
  const bodyRows = s?.sections?.body?.rows || [];
  console.log(`    ${t.name} (${t.id}): ${bodyRows.length} body blocks`);
}
console.log('');
console.log('  Nodos del canvas:');
for (const n of verifyFlow.nodes) {
  const agentInfo = n.data.agentId ? `agentId=${n.data.agentId.slice(0,8)}...` : 'sin agente';
  const modelInfo = n.data.model ? `model=${n.data.model}` : '';
  console.log(`    ${n.data.label} (${n.type}) ${modelInfo} ${agentInfo}`);
}
console.log('');
console.log('  AgentIds usados (todos de BD):');
const usedAgents = verifyFlow.nodes.filter(n => n.data.agentId).map(n => `    ${n.data.label}: ${n.data.agentId}`);
if (usedAgents.length > 0) {
  usedAgents.forEach(a => console.log(a));
} else {
  console.log('    Ninguno (todos LLM directo)');
}

// Manual steps
const manualSteps = [];
if (!catbrainEduca) {
  manualSteps.push('Crear CatBrain "DoCatFlow" con documentos de producto Educa360 y vincular al nodo RAG del canvas');
}
if (!gmailConnector || !db.prepare("SELECT is_active FROM connectors WHERE id = ?").get(gmailConnector.id)?.is_active) {
  manualSteps.push('Configurar OAuth2 en el conector Gmail: /catpower/connectors -> Info Educa360 (Gmail)');
}
if (!pawRespondedor) {
  manualSteps.push('Crear CatPaw "Respondedor Inbound" o vincular uno existente al nodo Respondedor del canvas');
}

if (manualSteps.length > 0) {
  console.log('\n  PASOS MANUALES REQUERIDOS:');
  manualSteps.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
}

console.log('');
db.close();
