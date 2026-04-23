#!/usr/bin/env node
// v30.5 P1 — Auditoría de inyección de skills sistema en catbot-prompt-assembler.ts.
//
// Propósito: detectar skills (especialmente system-category) que están en "lazy-load
// silencioso" — mencionadas como "llama a get_skill(...)" sin inyección literal via
// sections.push + buildXProtocolSection. El LLM ignora esos triggers y las reglas
// nunca llegan al prompt (bug descubierto en sesión 35 post-v30.4).
//
// Uso:
//   node scripts/audit-skill-injection.cjs              # Imprime tabla
//   node scripts/audit-skill-injection.cjs --verify     # Exit code != 0 si regresión
//   node scripts/audit-skill-injection.cjs --json       # Output JSON para tooling
//
// Variables: DATABASE_PATH (default: /home/deskmath/docflow-data/docflow.db),
//            ASSEMBLER_PATH (default: repo-relative).

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DB = process['env']['DATABASE_PATH']
  || (fs.existsSync('/home/deskmath/docflow-data/docflow.db')
      ? '/home/deskmath/docflow-data/docflow.db'
      : path.join(REPO_ROOT, 'app', 'data', 'docflow.db'));
const ASSEMBLER = process['env']['ASSEMBLER_PATH']
  || path.join(REPO_ROOT, 'app/src/lib/services/catbot-prompt-assembler.ts');

function loadSkills() {
  const Database = require(path.join(REPO_ROOT, 'app/node_modules/better-sqlite3'));
  const db = new Database(DEFAULT_DB, { readonly: true });
  return db.prepare(
    `SELECT id, name, category, version, length(instructions) as ilen,
            (rationale_notes IS NOT NULL AND rationale_notes != '[]') AS has_rationale
     FROM skills ORDER BY category DESC, name ASC`
  ).all();
}

function readAssembler() {
  return fs.readFileSync(ASSEMBLER, 'utf-8');
}

function scanLiteralInjections(src) {
  // Find all function buildXSection that call getSystemSkillInstructions('<name>').
  const injections = [];
  const fnRegex = /^function\s+(build\w+Section)\s*\([^)]*\)\s*:\s*string\s*\{[^}]*?getSystemSkillInstructions\(\s*['"]([^'"]+)['"]\s*\)/gms;
  let m;
  while ((m = fnRegex.exec(src)) !== null) {
    const [, fnName, skillName] = m;
    // Find the line number
    const before = src.slice(0, m.index);
    const line = before.split('\n').length;
    injections.push({ builder: fnName, skillName, line });
  }
  // Also scan sections.push(...) to correlate with builder names (so we can report priority + id).
  const pushRegex = /sections\.push\(\{\s*id:\s*['"]([^'"]+)['"]\s*,\s*priority:\s*(\d+)\s*,\s*content:\s*(build\w+Section)\([^)]*\)\s*\}\)/g;
  const sectionPushByBuilder = {};
  let p;
  while ((p = pushRegex.exec(src)) !== null) {
    const [, sectionId, priority, builder] = p;
    sectionPushByBuilder[builder] = { sectionId, priority: Number(priority) };
  }
  // Enrich injections with push info (sectionId, priority).
  for (const inj of injections) {
    const push = sectionPushByBuilder[inj.builder];
    if (push) { inj.sectionId = push.sectionId; inj.priority = push.priority; }
  }
  return injections;
}

function scanLazyMentions(src) {
  // Matches "get_skill(name: \"<NAME>\")" patterns in string literals in the assembler.
  const lazy = [];
  const re = /get_skill\(name:\s*["']([^"']+)["']\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const before = src.slice(0, m.index);
    const line = before.split('\n').length;
    lazy.push({ skillName: m[1], line });
  }
  // Deduplicate by name (same skill may appear multiple times in comments).
  const seen = new Set();
  return lazy.filter(l => {
    if (seen.has(l.skillName)) return false;
    seen.add(l.skillName); return true;
  });
}

function matchSkill(dbName, referencedName) {
  // Strict exact match first.
  if (dbName === referencedName) return true;
  // Prefix / contains fuzzy — the assembler often uses a shorter form
  // (e.g. "Orquestador CatFlow") while DB has the full name
  // (e.g. "Orquestador CatFlow — Creacion Inteligente de Flujos").
  // Reject trivial matches (< 10 chars) to avoid false positives.
  if (referencedName.length < 10) return false;
  if (dbName.startsWith(referencedName)) return true;
  if (dbName.includes(referencedName)) return true;
  // Reverse direction — if the DB name is shorter and the reference is longer.
  if (referencedName.startsWith(dbName) && dbName.length >= 10) return true;
  return false;
}

function classify(skills, literal, lazy) {
  return skills.map(s => {
    const inj = literal.find(i => matchSkill(s.name, i.skillName));
    const lz = lazy.find(l => matchSkill(s.name, l.skillName));
    let status;
    if (inj) status = 'LITERAL';
    else if (lz) status = 'LAZY-LOAD';
    else status = 'NOT-REFERENCED';
    return {
      ...s,
      injection_status: status,
      builder: inj?.builder || null,
      section_id: inj?.sectionId || null,
      priority: inj?.priority != null ? inj.priority : null,
      literal_line: inj?.line || null,
      lazy_mention_line: lz?.line || null,
      match_type: inj || lz
        ? (inj ? ((inj.skillName === s.name) ? 'exact' : 'fuzzy')
              : ((lz.skillName === s.name) ? 'exact' : 'fuzzy'))
        : null,
    };
  });
}

function summarize(classified) {
  const counts = { LITERAL: 0, 'LAZY-LOAD': 0, 'NOT-REFERENCED': 0 };
  const lazyCritical = [];
  for (const c of classified) {
    counts[c.injection_status]++;
    if (c.injection_status === 'LAZY-LOAD' && c.category === 'system') {
      lazyCritical.push(c);
    }
  }
  return { counts, lazyCritical };
}

function renderTable(classified) {
  const rows = [['Skill', 'ID', 'Cat', 'Chars', 'Status', 'Builder / Section', 'Priority', 'Line']];
  for (const c of classified) {
    rows.push([
      c.name,
      c.id.slice(0, 24) + (c.id.length > 24 ? '…' : ''),
      c.category,
      String(c.ilen),
      c.injection_status,
      c.builder ? `${c.builder}() → ${c.section_id}` : (c.lazy_mention_line ? `buildSkillsProtocols` : '—'),
      c.priority != null ? String(c.priority) : '—',
      c.literal_line || c.lazy_mention_line || '—',
    ].map(String));
  }
  const colw = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)));
  return rows.map(r => r.map((cell, i) => cell.padEnd(colw[i])).join(' │ ')).join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const verifyMode = args.includes('--verify');

  const skills = loadSkills();
  const src = readAssembler();
  const literal = scanLiteralInjections(src);
  const lazy = scanLazyMentions(src);
  const classified = classify(skills, literal, lazy);
  const summary = summarize(classified);

  if (jsonMode) {
    console.log(JSON.stringify({ classified, summary }, null, 2));
    return;
  }

  console.log('\n=== AUDIT: skills sistema en catbot-prompt-assembler.ts ===\n');
  console.log(renderTable(classified));
  console.log('\n=== Summary ===');
  console.log(`  LITERAL:       ${summary.counts.LITERAL}`);
  console.log(`  LAZY-LOAD:     ${summary.counts['LAZY-LOAD']}`);
  console.log(`  NOT-REFERENCED: ${summary.counts['NOT-REFERENCED']}`);

  if (summary.lazyCritical.length > 0) {
    console.log('\n⚠ WARNING: skills category=system en LAZY-LOAD silencioso (reglas no llegan al LLM):');
    for (const c of summary.lazyCritical) {
      console.log(`   - "${c.name}" (id: ${c.id}, ${c.ilen} chars) — mencionada @${c.lazy_mention_line}`);
    }
    if (verifyMode) {
      console.error('\nVERIFY FAILED: hay skills sistema en lazy-load silencioso.');
      process.exit(1);
    }
  } else {
    console.log('\n✓ No hay skills sistema en lazy-load silencioso.');
  }
}

main();
