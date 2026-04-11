#!/usr/bin/env node
/**
 * test-pipeline.mjs — Phase 133 gate tooling (FOUND-08/09)
 *
 * Ejercita el pipeline async CatBot (strategist → decomposer → architect+QA loop)
 * contra LiteLLM real en un único comando, inspeccionando los 6 outputs intermedios
 * que Plan 04 persiste en intent_jobs:
 *   strategist_output, decomposer_output,
 *   architect_iter0, qa_iter0, architect_iter1, qa_iter1
 *
 * El script inserta una fila sintética en catbot.db con tool_name='__description__'
 * (el executor la reconoce como job iniciado por texto libre) y polla hasta que
 * la IntentJobExecutor ya corriendo en el server Next.js la conduzca a terminal
 * state. No importa código TypeScript: mantiene el mismo patrón que
 * setup-inbound-canvas.mjs — Node ESM + better-sqlite3 puro.
 *
 * Prerequisitos:
 *   - Stack DocFlow arriba (docker compose up -d) — IntentJobExecutor corre en el
 *     contenedor Next.js con pickup cada 30s y drivea el pipeline.
 *   - LiteLLM accesible desde el contenedor en http://litellm:4000
 *   - catbot.db existe (se crea automáticamente al primer boot del stack)
 *
 * Uso:
 *   node app/scripts/test-pipeline.mjs --case holded-q1
 *   node app/scripts/test-pipeline.mjs --case holded-q1 --goal "override libre"
 *   node app/scripts/test-pipeline.mjs --case holded-q1 --save-baseline
 *   node app/scripts/test-pipeline.mjs --case holded-q1 --diff app/scripts/.baselines/holded-q1.json
 *
 * Exit codes:
 *   0 — pipeline terminó en estado terminal no-failed
 *   1 — error de CLI / fixture no encontrado
 *   2 — timeout (> 120s sin alcanzar estado terminal)
 *   3 — job sintético desapareció durante el polling
 *   4 — pipeline terminó en estado failed
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');

// ───────────────────────────────────────────────────────────────────────────
// CLI parse
// ───────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getFlag(name, fallback = null) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

const caseName = getFlag('case');
const goalOverride = getFlag('goal');
const saveBaseline = getFlag('save-baseline') === true;
const diffPath = getFlag('diff');

if (!caseName || caseName === true) {
  console.error('test-pipeline: --case <name> requerido. Disponibles: holded-q1, inbox-digest, drive-sync');
  process.exit(1);
}

const fixturePath = path.join(__dirname, 'pipeline-cases', `${caseName}.json`);
if (!fs.existsSync(fixturePath)) {
  console.error(`test-pipeline: fixture no encontrado: ${fixturePath}`);
  process.exit(1);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const originalRequest = (typeof goalOverride === 'string' && goalOverride) || fixture.original_request;

if (!originalRequest) {
  console.error(`test-pipeline: fixture ${caseName} no tiene original_request`);
  process.exit(1);
}

console.log(`▶ test-pipeline: case=${caseName}`);
console.log(`  original_request: ${String(originalRequest).slice(0, 160)}${originalRequest.length > 160 ? '…' : ''}`);

// ───────────────────────────────────────────────────────────────────────────
// DB connect (mirror setup-inbound-canvas.mjs)
//
// Default priority: CATBOT_DB_PATH env > docker-compose volume mount
// (~/docflow-data/catbot.db) > dev-local fallback (app/data/catbot.db).
// ───────────────────────────────────────────────────────────────────────────
function resolveDbPath() {
  if (process.env.CATBOT_DB_PATH) return process.env.CATBOT_DB_PATH;
  const dockerMount = path.join(process.env.HOME || '/home/deskmath', 'docflow-data', 'catbot.db');
  if (fs.existsSync(dockerMount)) return dockerMount;
  return path.join(APP_ROOT, 'data', 'catbot.db');
}
const dbPath = resolveDbPath();

if (!fs.existsSync(dbPath)) {
  console.error(`test-pipeline: catbot.db no existe en ${dbPath}. Arranca el stack primero: docker compose up -d`);
  process.exit(1);
}

console.log(`  db: ${dbPath}`);
const db = new Database(dbPath, { readonly: false, fileMustExist: true });
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// ───────────────────────────────────────────────────────────────────────────
// Insert synthetic job
// ───────────────────────────────────────────────────────────────────────────
const jobId = `test-${caseName}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const toolArgs = JSON.stringify({
  description: originalRequest,
  original_request: originalRequest,
});

db.prepare(`
  INSERT INTO intent_jobs (id, user_id, channel, pipeline_phase, tool_name, tool_args, status)
  VALUES (?, ?, ?, 'pending', '__description__', ?, 'pending')
`).run(jobId, 'test-pipeline', fixture.channel || 'web', toolArgs);

console.log(`  job inserted: id=${jobId}`);
console.log(`  awaiting pickup by IntentJobExecutor (30s tick interval)…`);

// ───────────────────────────────────────────────────────────────────────────
// Poll until terminal state
// ───────────────────────────────────────────────────────────────────────────
const TERMINAL = new Set(['awaiting_user', 'awaiting_approval', 'completed', 'failed', 'cancelled']);
const TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 1000;

function cleanup() {
  try {
    db.prepare('DELETE FROM intent_jobs WHERE id = ?').run(jobId);
  } catch (err) {
    console.error(`cleanup failed: ${err?.message || err}`);
  }
}

process.on('SIGINT', () => {
  console.error('\ntest-pipeline: interrupted, cleaning up job…');
  cleanup();
  process.exit(130);
});

const startMs = Date.now();
let lastPhase = '';
let row = null;

while (true) {
  const elapsed = Date.now() - startMs;
  if (elapsed > TIMEOUT_MS) {
    // Do NOT cleanup on timeout — leave the row intact for post-mortem inspection
    // of whatever intermediate outputs the pipeline persisted before we gave up.
    // Only SIGINT and terminal-state finish paths delete the synthetic row.
    console.error(`test-pipeline: timeout > ${TIMEOUT_MS}ms (last pipeline_phase='${lastPhase}')`);
    console.error(`  job row preserved: id=${jobId} — inspect intent_jobs columns directly`);
    db.close();
    process.exit(2);
  }

  row = db.prepare('SELECT * FROM intent_jobs WHERE id = ?').get(jobId);
  if (!row) {
    console.error(`test-pipeline: job ${jobId} desaparecido antes de terminal`);
    process.exit(3);
  }

  if (row.pipeline_phase && row.pipeline_phase !== lastPhase) {
    lastPhase = row.pipeline_phase;
    console.log(`  [${(elapsed / 1000).toFixed(1)}s] phase=${lastPhase} status=${row.status}`);
  }

  if (TERMINAL.has(row.status)) break;
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
}

const finalMs = Date.now() - startMs;

// ───────────────────────────────────────────────────────────────────────────
// Pretty-print results
// ───────────────────────────────────────────────────────────────────────────
function tryParse(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

const result = {
  case: caseName,
  job_id: jobId,
  final_status: row.status,
  pipeline_phase: row.pipeline_phase,
  error: row.error || null,
  duration_ms: finalMs,
  duration_s: Number((finalMs / 1000).toFixed(1)),
  canvas_id: row.canvas_id || null,
  strategist_output: tryParse(row.strategist_output),
  decomposer_output: tryParse(row.decomposer_output),
  architect_iter0: tryParse(row.architect_iter0),
  qa_iter0: tryParse(row.qa_iter0),
  architect_iter1: tryParse(row.architect_iter1),
  qa_iter1: tryParse(row.qa_iter1),
};

console.log('\n===== PIPELINE RESULT =====');
console.log(JSON.stringify(result, null, 2));
console.log(`\n⏱  duration: ${result.duration_s}s`);
console.log(`   final_status: ${result.final_status}`);
console.log(`   pipeline_phase: ${result.pipeline_phase}`);
if (result.error) console.log(`   error: ${result.error}`);

// Print roles per node from the final architect design (iter1 preferred, else iter0)
const finalDesign = result.architect_iter1 || result.architect_iter0;
if (finalDesign && typeof finalDesign === 'object') {
  const nodes = finalDesign?.flow_data?.nodes || [];
  if (Array.isArray(nodes) && nodes.length > 0) {
    console.log('\n===== FINAL flow_data (roles per node) =====');
    for (const n of nodes) {
      const role = n?.data?.role ?? '(no role)';
      const instRaw = n?.data?.instruction;
      const inst = typeof instRaw === 'string' ? instRaw.slice(0, 80) : '';
      console.log(`  ${n.id} [${n.type}] role=${role} — ${inst}`);
    }
  }
}

// Print qa report summary (iter1 preferred, else iter0)
const finalQa = result.qa_iter1 || result.qa_iter0;
if (finalQa && typeof finalQa === 'object') {
  console.log('\n===== FINAL qa_report summary =====');
  console.log(`  quality_score: ${finalQa.quality_score ?? '(n/a)'}`);
  console.log(`  recommendation: ${finalQa.recommendation ?? '(n/a)'}`);
  const issues = Array.isArray(finalQa.issues) ? finalQa.issues : [];
  console.log(`  issues: ${issues.length}`);
}

// ───────────────────────────────────────────────────────────────────────────
// Baseline save / diff
// ───────────────────────────────────────────────────────────────────────────
const baselineDir = path.join(__dirname, '.baselines');

if (saveBaseline) {
  fs.mkdirSync(baselineDir, { recursive: true });
  const blPath = path.join(baselineDir, `${caseName}.json`);
  fs.writeFileSync(blPath, JSON.stringify(result, null, 2));
  console.log(`\n✔ baseline saved: ${blPath}`);
}

if (typeof diffPath === 'string' && diffPath) {
  if (!fs.existsSync(diffPath)) {
    console.log(`\n===== DIFF vs baseline =====`);
    console.log(`(baseline ${diffPath} no existe)`);
  } else {
    const baseline = JSON.parse(fs.readFileSync(diffPath, 'utf8'));
    const diffs = [];
    if (baseline.final_status !== result.final_status) {
      diffs.push(`final_status: ${baseline.final_status} -> ${result.final_status}`);
    }
    if (baseline.pipeline_phase !== result.pipeline_phase) {
      diffs.push(`pipeline_phase: ${baseline.pipeline_phase} -> ${result.pipeline_phase}`);
    }
    const durDelta = result.duration_s - baseline.duration_s;
    if (Math.abs(durDelta) > 5) {
      diffs.push(`duration_s: ${baseline.duration_s} -> ${result.duration_s} (Δ${durDelta >= 0 ? '+' : ''}${durDelta.toFixed(1)}s)`);
    }
    const baseNodes = baseline?.architect_iter1?.flow_data?.nodes?.length ?? baseline?.architect_iter0?.flow_data?.nodes?.length ?? 0;
    const curNodes = result?.architect_iter1?.flow_data?.nodes?.length ?? result?.architect_iter0?.flow_data?.nodes?.length ?? 0;
    if (baseNodes !== curNodes) {
      diffs.push(`node_count: ${baseNodes} -> ${curNodes}`);
    }
    console.log('\n===== DIFF vs baseline =====');
    console.log(diffs.length === 0 ? '(no diffs)' : diffs.join('\n'));
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Cleanup
// ───────────────────────────────────────────────────────────────────────────
cleanup();
console.log(`\n✔ cleanup: job ${jobId} removed`);

db.close();
process.exit(result.final_status === 'failed' ? 4 : 0);
