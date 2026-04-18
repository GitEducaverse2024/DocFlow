#!/usr/bin/env node
/**
 * kb-sync — CLI de mantenimiento del Knowledge Base (.docflow-kb/).
 *
 * Comandos:
 *   --full-rebuild                        Regenera _index.json desde frontmatters.
 *   --audit-stale                         Genera .docflow-kb/_audit_stale.md.
 *   --archive --confirm                   Mueve elegibles a _archived/YYYY-MM-DD/.
 *   --purge --confirm --older-than-archived=365d   Borra físicamente archivos viejos de _archived/.
 *
 * Flags destructivos requieren --confirm explícito. Sin él, aborta exit 1.
 *
 * Phase 149 — Plan 04 (KB-05). Workflow completo de mantenimiento. NO lee DB
 * (eso es Fase 2 del PRD: `--full-rebuild --source db`). Comando rechaza
 * --source db con mensaje "Not implemented — Fase 2 del PRD".
 *
 * Sin deps npm: parser YAML mínimo duplicado de scripts/validate-kb.cjs (Plan 02).
 * Si en el futuro se añade AJV/js-yaml al repo, unificar los tres (validate-kb.cjs,
 * knowledge-sync.ts, kb-sync.cjs) en un único paquete interno.
 *
 * Umbrales:
 *   WARNING_THRESHOLD_DAYS = 150    (aviso informativo)
 *   VISIBLE_WARNING_DAYS   = 170    (aviso visible en dashboard: warning_visible=true)
 *   ARCHIVE_THRESHOLD_DAYS = 180    (elegible para archivado)
 */
const fs = require('fs');
const path = require('path');

const KB_ROOT = path.resolve(__dirname, '..', '.docflow-kb');
const ARCHIVE_THRESHOLD_DAYS = 180;
const WARNING_THRESHOLD_DAYS = 150;
const VISIBLE_WARNING_DAYS = 170;

const EXCLUDED_FILENAMES = new Set(['_header.md', '_manual.md', '_audit_stale.md']);
const EXCLUDED_DIRS = new Set(['_archived', '_schema']);

// ---------------------------------------------------------------------------
// YAML parser mínimo (duplicado de validate-kb.cjs; subset usado por el KB)
// ---------------------------------------------------------------------------

function parseYAML(yamlText) {
  const lines = yamlText.split('\n');
  const result = {};
  let i = 0;

  function parseScalar(v) {
    v = v.trim();
    if (v === '' || v === 'null' || v === '~') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
    if (v.startsWith('[') && v.endsWith(']')) return parseInlineList(v);
    if (v.startsWith('{') && v.endsWith('}')) return parseInlineDict(v);
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      return v.slice(1, -1);
    }
    return v;
  }

  function parseInlineList(v) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    const items = smartSplit(inner, ',');
    return items.map((x) => parseScalar(x));
  }

  function parseInlineDict(v) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return {};
    const pairs = smartSplit(inner, ',');
    const d = {};
    for (const pair of pairs) {
      const colonIdx = findTopLevelColon(pair);
      if (colonIdx === -1) continue;
      const k = pair.slice(0, colonIdx).trim();
      const val = pair.slice(colonIdx + 1).trim();
      d[k] = parseScalar(val);
    }
    return d;
  }

  function smartSplit(s, sep) {
    const out = [];
    let buf = '';
    let depthBracket = 0;
    let depthBrace = 0;
    let inQuote = null;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (inQuote) {
        if (c === inQuote) inQuote = null;
        buf += c;
        continue;
      }
      if (c === '"' || c === "'") { inQuote = c; buf += c; continue; }
      if (c === '[') depthBracket++;
      else if (c === ']') depthBracket--;
      else if (c === '{') depthBrace++;
      else if (c === '}') depthBrace--;
      if (c === sep && depthBracket === 0 && depthBrace === 0) {
        out.push(buf.trim());
        buf = '';
      } else {
        buf += c;
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function findTopLevelColon(s) {
    let depthBracket = 0;
    let depthBrace = 0;
    let inQuote = null;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (inQuote) { if (c === inQuote) inQuote = null; continue; }
      if (c === '"' || c === "'") { inQuote = c; continue; }
      if (c === '[') depthBracket++;
      else if (c === ']') depthBracket--;
      else if (c === '{') depthBrace++;
      else if (c === '}') depthBrace--;
      else if (c === ':' && depthBracket === 0 && depthBrace === 0) return k;
    }
    return -1;
  }

  function getIndent(line) {
    const m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  function parseBlock(startI, parentIndent) {
    const out = {};
    const list = [];
    let mode = null;
    let j = startI;

    while (j < lines.length) {
      const line = lines[j];
      if (!line.trim() || line.trim().startsWith('#')) { j++; continue; }
      const indent = getIndent(line);
      if (indent <= parentIndent) break;

      const trimmed = line.trim();

      if (trimmed.startsWith('- ')) {
        if (mode === 'dict') break;
        mode = 'list';
        const itemStr = trimmed.slice(2);
        if (itemStr.trim().startsWith('{') && itemStr.trim().endsWith('}')) {
          list.push(parseScalar(itemStr.trim()));
          j++;
          continue;
        }
        const colonIdx = findTopLevelColon(itemStr);
        if (colonIdx !== -1) {
          const firstKey = itemStr.slice(0, colonIdx).trim();
          const firstVal = itemStr.slice(colonIdx + 1).trim();
          const itemDict = {};
          if (firstVal) {
            itemDict[firstKey] = parseScalar(firstVal);
          } else {
            const sub = parseBlock(j + 1, indent + 1);
            itemDict[firstKey] = sub.value;
            j = sub.nextI - 1;
          }
          j++;
          const itemIndent = indent;
          while (j < lines.length) {
            const nline = lines[j];
            if (!nline.trim() || nline.trim().startsWith('#')) { j++; continue; }
            const nindent = getIndent(nline);
            if (nindent <= itemIndent) break;
            const ntrim = nline.trim();
            if (ntrim.startsWith('- ')) break;
            const ncol = findTopLevelColon(ntrim);
            if (ncol === -1) { j++; continue; }
            const nkey = ntrim.slice(0, ncol).trim();
            const nval = ntrim.slice(ncol + 1).trim();
            if (nval) {
              itemDict[nkey] = parseScalar(nval);
              j++;
            } else {
              const sub = parseBlock(j + 1, nindent);
              itemDict[nkey] = sub.value;
              j = sub.nextI;
            }
          }
          list.push(itemDict);
          continue;
        }
        list.push(parseScalar(itemStr));
        j++;
        continue;
      }

      if (mode === 'list') break;
      mode = 'dict';
      const colonIdx = findTopLevelColon(trimmed);
      if (colonIdx === -1) { j++; continue; }
      const key = trimmed.slice(0, colonIdx).trim();
      const valStr = trimmed.slice(colonIdx + 1).trim();
      if (valStr) {
        out[key] = parseScalar(valStr);
        j++;
      } else {
        const sub = parseBlock(j + 1, indent);
        out[key] = sub.value;
        j = sub.nextI;
      }
    }

    return { value: mode === 'list' ? list : out, nextI: j };
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
    const indent = getIndent(line);
    if (indent > 0) { i++; continue; }

    const trimmed = line.trim();
    const colonIdx = findTopLevelColon(trimmed);
    if (colonIdx === -1) { i++; continue; }
    const key = trimmed.slice(0, colonIdx).trim();
    const valStr = trimmed.slice(colonIdx + 1).trim();

    if (valStr) {
      result[key] = parseScalar(valStr);
      i++;
    } else {
      const sub = parseBlock(i + 1, 0);
      result[key] = sub.value;
      i = sub.nextI;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// YAML serializer mínimo — produce bytes compatibles con el parser anterior
// ---------------------------------------------------------------------------

function serializeYAML(fm) {
  const lines = [];
  const ORDER = [
    'id', 'type', 'subtype', 'lang',
    'title', 'summary',
    'tags', 'audience', 'status',
    'created_at', 'created_by', 'version',
    'updated_at', 'updated_by',
    'last_accessed_at', 'access_count',
    'deprecated_at', 'deprecated_by', 'deprecated_reason', 'superseded_by',
    'source_of_truth', 'enriched_fields', 'related', 'search_hints',
    'change_log',
    'ttl',
    // audit-specific
    'generated_at', 'eligible_for_purge', 'warning_only', 'warning_visible',
  ];
  const seen = new Set();
  const keys = [...ORDER.filter((k) => k in fm), ...Object.keys(fm).filter((k) => !ORDER.includes(k))];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const v = fm[key];
    lines.push(...serializeKV(key, v, 0));
  }
  return lines.join('\n');
}

function needsQuoting(s) {
  if (typeof s !== 'string') return false;
  if (s === '') return true;
  // Valores con : seguido de espacio, o trailing :
  if (/:\s/.test(s)) return true;
  if (s.endsWith(':')) return true;
  // Strings que empiezan por chars reservados
  if (/^[!&*?|>@`%#,[\]{}]/.test(s)) return true;
  // Palabras reservadas que se parsearían como bool/null
  if (/^(true|false|null|~|yes|no)$/i.test(s)) return true;
  return false;
}

function formatScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (needsQuoting(v)) return `"${v.replace(/"/g, '\\"')}"`;
    return v;
  }
  return String(v);
}

function isInlineDict(d) {
  // Un dict es inline si todos sus valores son scalars y no hay más de ~4 keys
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const entries = Object.entries(d);
  if (entries.length === 0) return true;
  if (entries.length > 6) return false;
  return entries.every(([, v]) => v === null || typeof v !== 'object' || Array.isArray(v) === false && typeof v === 'string');
}

function serializeInlineDict(d) {
  const entries = Object.entries(d).map(([k, v]) => `${k}: ${formatScalar(v)}`);
  return `{ ${entries.join(', ')} }`;
}

function serializeKV(key, value, indentLevel) {
  const indent = '  '.repeat(indentLevel);
  const out = [];
  if (value === null || value === undefined) {
    out.push(`${indent}${key}: null`);
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push(`${indent}${key}: []`);
      return out;
    }
    // Si todos los elementos son scalars, inline list
    if (value.every((x) => x === null || typeof x !== 'object')) {
      const items = value.map(formatScalar).join(', ');
      out.push(`${indent}${key}: [${items}]`);
      return out;
    }
    // Lista de dicts → multiline con `- { k: v, ... }` o `- k: v\n  k2: v2`
    out.push(`${indent}${key}:`);
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        if (isInlineDict(item)) {
          out.push(`${indent}  - ${serializeInlineDict(item)}`);
        } else {
          const entries = Object.entries(item);
          if (entries.length === 0) {
            out.push(`${indent}  - {}`);
            continue;
          }
          const [firstK, firstV] = entries[0];
          out.push(`${indent}  - ${firstK}: ${formatScalar(firstV)}`);
          for (let k = 1; k < entries.length; k++) {
            const [ek, ev] = entries[k];
            if (ev && typeof ev === 'object') {
              out.push(...serializeKV(ek, ev, indentLevel + 2));
            } else {
              out.push(`${indent}    ${ek}: ${formatScalar(ev)}`);
            }
          }
        }
      } else {
        out.push(`${indent}  - ${formatScalar(item)}`);
      }
    }
    return out;
  }
  if (typeof value === 'object') {
    // Dict multiline
    const entries = Object.entries(value);
    if (entries.length === 0) {
      out.push(`${indent}${key}: {}`);
      return out;
    }
    out.push(`${indent}${key}:`);
    for (const [k, v] of entries) {
      if (v && typeof v === 'object') {
        out.push(...serializeKV(k, v, indentLevel + 1));
      } else {
        out.push(`${indent}  ${k}: ${formatScalar(v)}`);
      }
    }
    return out;
  }
  out.push(`${indent}${key}: ${formatScalar(value)}`);
  return out;
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

function walkKB(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  function recurse(dir) {
    for (const name of fs.readdirSync(dir)) {
      if (EXCLUDED_DIRS.has(name)) continue;
      const p = path.join(dir, name);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) recurse(p);
      else if (name.endsWith('.md') && !EXCLUDED_FILENAMES.has(name)) out.push(p);
    }
  }
  recurse(root);
  return out;
}

function readFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    throw new Error(`archivo sin frontmatter (no empieza con ---)`);
  }
  const lines = content.split('\n');
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIdx = i; break; }
  }
  if (endIdx === -1) throw new Error(`frontmatter sin cierre ---`);
  const yamlText = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  const frontmatter = parseYAML(yamlText);
  return { frontmatter, body };
}

/**
 * writeFrontmatter(targetPath, fm, body) — si targetPath es null, devuelve string.
 * Si targetPath es path, escribe al disco y devuelve undefined.
 */
function writeFrontmatter(targetPath, fm, body) {
  const yamlText = serializeYAML(fm);
  const out = `---\n${yamlText}\n---\n${body.startsWith('\n') ? body.slice(1) : body}`;
  if (targetPath === null || targetPath === undefined) return out;
  fs.writeFileSync(targetPath, out);
}

// ---------------------------------------------------------------------------
// Cálculo de días
// ---------------------------------------------------------------------------

function daysSince(isoDateString) {
  if (!isoDateString) return Infinity;
  const then = new Date(isoDateString).getTime();
  if (Number.isNaN(then)) return Infinity;
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Eligibilidad — criterio §5.3 del PRD
// ---------------------------------------------------------------------------

function buildIncomingRefs(files) {
  const incomingRefs = {};
  for (const f of files) {
    try {
      const { frontmatter } = readFrontmatter(f);
      if (Array.isArray(frontmatter.related)) {
        for (const r of frontmatter.related) {
          if (typeof r === 'string') incomingRefs[r] = (incomingRefs[r] || 0) + 1;
        }
      }
    } catch { /* skip files that don't parse */ }
  }
  return incomingRefs;
}

function extractTitle(frontmatter) {
  const t = frontmatter.title;
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object') return t.es || t.en || '(no title)';
  return '(no title)';
}

// ---------------------------------------------------------------------------
// _header.md regeneration (Phase 150 Plan 04 — closes RESEARCH §Don't-Hand-Roll gap)
// ---------------------------------------------------------------------------

function regenerateHeaderFile(kbRoot, idx) {
  const counts = (idx && idx.header && idx.header.counts) || {};
  const topTags = (idx && idx.header && idx.header.top_tags) || [];
  const lines = [];
  lines.push('# KB Header (auto-generated)');
  lines.push('');
  lines.push(`**Generado:** ${idx.generated_at || new Date().toISOString()}`);
  lines.push(`**Entradas totales:** ${idx.entry_count || 0}`);
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push(`- CatPaws activos: ${counts.catpaws_active || 0}`);
  lines.push(`- Connectors activos: ${counts.connectors_active || 0}`);
  lines.push(`- CatBrains activos: ${counts.catbrains_active || 0}`);
  lines.push(`- Email templates activos: ${counts.templates_active || 0}`);
  lines.push(`- Skills activas: ${counts.skills_active || 0}`);
  lines.push(`- Canvases activos: ${counts.canvases_active || 0}`);
  lines.push(`- Reglas: ${counts.rules || 0}`);
  lines.push(`- Incidentes resueltos: ${counts.incidents_resolved || 0}`);
  lines.push(`- Features documentados: ${counts.features_documented || 0}`);
  lines.push('');
  lines.push('## Top tags');
  lines.push('');
  if (!topTags.length) {
    lines.push('_(ninguno — KB vacío)_');
  } else {
    for (const t of topTags) lines.push(`- \`${t}\``);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    '> Este archivo se regenera automáticamente por `kb-sync.cjs --full-rebuild`. No editar manualmente.'
  );
  lines.push('');
  fs.writeFileSync(path.join(kbRoot, '_header.md'), lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Comando: --full-rebuild
// ---------------------------------------------------------------------------

function cmdFullRebuild(args, { kbRoot = KB_ROOT } = {}) {
  // --source db (Phase 150): delegate to kb-sync-db-source.cjs.populateFromDb
  const hasSourceDb = args.some((a, i) => {
    if (a === '--source' && args[i + 1] === 'db') return true;
    if (a === '--source=db') return true;
    return false;
  });
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  // --only <subtype> (Phase 150): restrict populate to one entity subtype
  let onlySubtype = null;
  const onlyIdx = args.indexOf('--only');
  if (onlyIdx !== -1) {
    onlySubtype = args[onlyIdx + 1];
    const VALID_SUBTYPES = [
      'catpaw',
      'connector',
      'skill',
      'catbrain',
      'email-template',
      'canvas',
    ];
    if (!onlySubtype || !VALID_SUBTYPES.includes(onlySubtype)) {
      console.error(
        `ERROR: --only must be one of: ${VALID_SUBTYPES.join(
          '|'
        )}. Got: ${onlySubtype == null ? '(missing)' : onlySubtype}`
      );
      process.exit(2);
    }
  }

  if (hasSourceDb) {
    let populateFromDb;
    try {
      ({ populateFromDb } = require(path.join(__dirname, 'kb-sync-db-source.cjs')));
    } catch (e) {
      console.error(`ERROR: failed to load kb-sync-db-source.cjs: ${e.message}`);
      process.exit(3);
    }
    let report;
    try {
      report = populateFromDb({
        kbRoot,
        subtypes: onlySubtype ? [onlySubtype] : undefined,
        dryRun,
        verbose,
      });
    } catch (e) {
      if (e && (e.code === 'SQLITE_CANTOPEN' || /DB not found/.test(e.message || ''))) {
        console.error(`ERROR: cannot open DB: ${e.message}`);
        process.exit(3);
      }
      throw e;
    }
    console.log(
      `PLAN: ${report.created} to create, ${report.updated} to update, ${report.unchanged} unchanged, ${report.orphans} orphans, ${report.skipped} skipped`
    );
    if (dryRun) {
      // Dry-run: do NOT regenerate _index.json, do NOT touch disk further.
      return;
    }
    // When --only is set, fall through to the global walker — it re-indexes
    // the whole KB, which is the correct behavior (subtype-scoped population
    // with full-index consistency).
  }

  const files = walkKB(kbRoot);
  const entries = [];
  const byType = {};
  const byTag = {};
  const byAudience = {};

  for (const f of files) {
    const rel = path.relative(kbRoot, f);
    try {
      const { frontmatter } = readFrontmatter(f);
      if (!frontmatter.id) continue;
      const entry = {
        id: frontmatter.id,
        path: rel,
        type: frontmatter.type,
        subtype: frontmatter.subtype ?? null,
        title: frontmatter.title,
        summary: frontmatter.summary,
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        audience: Array.isArray(frontmatter.audience) ? frontmatter.audience : [],
        status: frontmatter.status,
        updated: frontmatter.updated_at ?? frontmatter.created_at,
        search_hints: frontmatter.search_hints ?? null,
      };
      entries.push(entry);
      (byType[entry.type] = byType[entry.type] || []).push(entry.id);
      for (const t of entry.tags) (byTag[t] = byTag[t] || []).push(entry.id);
      for (const a of entry.audience) (byAudience[a] = byAudience[a] || []).push(entry.id);
    } catch (e) {
      console.warn(`WARN ${rel}: ${e.message}`);
    }
  }

  const counts = {
    catpaws_active: entries.filter((e) => e.subtype === 'catpaw' && e.status === 'active').length,
    connectors_active: entries.filter((e) => e.subtype === 'connector' && e.status === 'active').length,
    catbrains_active: entries.filter((e) => e.subtype === 'catbrain' && e.status === 'active').length,
    templates_active: entries.filter((e) => e.subtype === 'email-template' && e.status === 'active').length,
    skills_active: entries.filter((e) => e.subtype === 'skill' && e.status === 'active').length,
    canvases_active: entries.filter((e) => e.subtype === 'canvas' && e.status === 'active').length,
    rules: entries.filter((e) => e.type === 'rule').length,
    incidents_resolved: entries.filter((e) => e.type === 'incident' && e.status === 'active').length,
    features_documented: entries.filter((e) => e.type === 'feature').length,
  };

  const topTags = Object.entries(byTag)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([t]) => t);

  const idx = {
    schema_version: '2.0',
    generated_at: new Date().toISOString(),
    generated_by: 'kb-sync-cli',
    entry_count: entries.length,
    header: { counts, top_tags: topTags, last_changes: [] },
    entries,
    indexes: { by_type: byType, by_tag: byTag, by_audience: byAudience },
  };

  fs.writeFileSync(path.join(kbRoot, '_index.json'), JSON.stringify(idx, null, 2));
  regenerateHeaderFile(kbRoot, idx); /* Plan 150-04 — closes RESEARCH §Don't-Hand-Roll gap */
  console.log(`OK: _index.json + _header.md regenerados con ${entries.length} entries`);

  // Phase 150 Plan 04 — spawn validate-kb.cjs at end of --source db rebuild.
  // Only when hasSourceDb: other --full-rebuild paths keep Phase 149 semantics
  // (regenerate index-only) to avoid touching Phase 149 tests.
  if (hasSourceDb) {
    const { spawnSync } = require('child_process');
    const validator = path.resolve(__dirname, 'validate-kb.cjs');
    const result = spawnSync(process.execPath, [validator], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      console.error('FAIL: validate-kb.cjs rejected the generated KB');
      if (result.stdout) console.error(result.stdout);
      if (result.stderr) console.error(result.stderr);
      process.exit(1);
    }
    console.log('OK: validate-kb.cjs exit 0 (all generated files schema-compliant)');
  }
}

// ---------------------------------------------------------------------------
// Comando: --audit-stale
// ---------------------------------------------------------------------------

function cmdAuditStale({ kbRoot = KB_ROOT } = {}) {
  const files = walkKB(kbRoot);
  const incomingRefs = buildIncomingRefs(files);

  const eligible = [];
  const warning = [];

  for (const f of files) {
    try {
      const { frontmatter } = readFrontmatter(f);
      if (frontmatter.status !== 'deprecated') continue;
      const days = daysSince(frontmatter.last_accessed_at);
      const refs = incomingRefs[frontmatter.id] || 0;
      const rec = {
        id: frontmatter.id,
        title: extractTitle(frontmatter),
        deprecated_at: frontmatter.deprecated_at || null,
        last_access: frontmatter.last_accessed_at || null,
        days,
        refs,
        path: path.relative(kbRoot, f),
      };
      if (days >= ARCHIVE_THRESHOLD_DAYS && refs === 0) {
        eligible.push(rec);
      } else if (days >= WARNING_THRESHOLD_DAYS) {
        warning.push(rec);
      }
    } catch { /* skip */ }
  }

  const now = new Date();
  const isoDate = now.toISOString().slice(0, 10);
  const warningVisible = warning.some((w) => w.days >= VISIBLE_WARNING_DAYS);

  const fm = {
    id: `audit-stale-${isoDate}`,
    type: 'audit',
    subtype: null,
    lang: 'es',
    title: `Audit stale ${isoDate}`,
    summary: 'Archivos elegibles para archivado/purga',
    tags: ['ops'],
    audience: ['developer'],
    status: 'active',
    created_at: now.toISOString(),
    created_by: 'kb-sync-cli',
    version: '1.0.0',
    updated_at: now.toISOString(),
    updated_by: 'kb-sync-cli',
    source_of_truth: null,
    change_log: [
      { version: '1.0.0', date: isoDate, author: 'kb-sync-cli', change: 'Generado por --audit-stale' },
    ],
    ttl: 'never',
    eligible_for_purge: eligible.length,
    warning_only: warning.length,
    warning_visible: warningVisible,
  };

  const bodyLines = [];
  bodyLines.push('');
  bodyLines.push(`# Audit de archivos stale — ${isoDate}`);
  bodyLines.push('');
  bodyLines.push('## Elegibles para archivado (180+ días sin acceso, deprecated)');
  bodyLines.push('');
  bodyLines.push('| ID | Title | Deprecated since | Last access | Refs in-coming | Action |');
  bodyLines.push('|----|-------|------------------|-------------|----------------|--------|');
  if (eligible.length === 0) {
    bodyLines.push('| _(ninguno)_ | | | | | |');
  } else {
    for (const e of eligible) {
      const deprDays = e.deprecated_at ? `${daysSince(e.deprecated_at)}d` : '?';
      bodyLines.push(`| ${e.id} | ${e.title} | ${e.deprecated_at || '?'} (${deprDays}) | ${e.last_access || '?'} | ${e.refs} | **Elegible archivar** |`);
    }
  }
  bodyLines.push('');
  bodyLines.push('## Warning only (150+ días, aviso previo)');
  bodyLines.push('');
  if (warning.length === 0) {
    bodyLines.push('_(ninguno)_');
  } else {
    bodyLines.push('| ID | Title | Días | Action |');
    bodyLines.push('|----|-------|------|--------|');
    for (const w of warning) {
      bodyLines.push(`| ${w.id} | ${w.title} | ${w.days} | ${w.days >= VISIBLE_WARNING_DAYS ? '**Warning visible**' : 'Aviso informativo'} |`);
    }
  }
  bodyLines.push('');
  bodyLines.push('---');
  bodyLines.push('');
  bodyLines.push('**Para archivar los elegibles:**');
  bodyLines.push('');
  bodyLines.push('    node scripts/kb-sync.cjs --archive --confirm');
  bodyLines.push('');

  const auditPath = path.join(kbRoot, '_audit_stale.md');
  writeFrontmatter(auditPath, fm, bodyLines.join('\n'));
  console.log(`OK: _audit_stale.md generado (${eligible.length} elegibles, ${warning.length} warnings${warningVisible ? ', warning_visible=true' : ''})`);
}

// ---------------------------------------------------------------------------
// Comando: --archive --confirm
// ---------------------------------------------------------------------------

function cmdArchive(args, { kbRoot = KB_ROOT } = {}) {
  if (!args.includes('--confirm')) {
    console.error('ERROR: --archive requiere --confirm explícito. Aborted.');
    console.error('Uso: node scripts/kb-sync.cjs --archive --confirm');
    process.exit(1);
  }

  const files = walkKB(kbRoot);
  const incomingRefs = buildIncomingRefs(files);

  const isoDate = new Date().toISOString().slice(0, 10);
  const archiveDir = path.join(kbRoot, '_archived', isoDate);
  let moved = 0;

  for (const f of files) {
    try {
      const { frontmatter, body } = readFrontmatter(f);
      if (frontmatter.status !== 'deprecated') continue;
      const days = daysSince(frontmatter.last_accessed_at);
      const refs = incomingRefs[frontmatter.id] || 0;
      if (days < ARCHIVE_THRESHOLD_DAYS || refs > 0) continue;

      fs.mkdirSync(archiveDir, { recursive: true });
      frontmatter.status = 'archived';
      const newPath = path.join(archiveDir, path.basename(f));
      writeFrontmatter(newPath, frontmatter, body);
      fs.unlinkSync(f);
      console.log(`ARCHIVED: ${path.relative(kbRoot, f)} -> _archived/${isoDate}/${path.basename(f)}`);
      moved++;
    } catch (e) {
      console.warn(`WARN ${path.relative(kbRoot, f)}: ${e.message}`);
    }
  }

  console.log(`OK: ${moved} archivos archivados a _archived/${isoDate}/`);
  // Mantener _index.json consistente
  cmdFullRebuild([], { kbRoot });
}

// ---------------------------------------------------------------------------
// Comando: --purge --confirm --older-than-archived=365d
// ---------------------------------------------------------------------------

function cmdPurge(args, { kbRoot = KB_ROOT } = {}) {
  if (!args.includes('--confirm')) {
    console.error('ERROR: --purge requiere --confirm explícito. Aborted.');
    console.error('Uso: node scripts/kb-sync.cjs --purge --confirm --older-than-archived=365d');
    process.exit(1);
  }
  let thresholdDays = 365;
  const flag = args.find((a) => a.startsWith('--older-than-archived='));
  if (flag) {
    const m = flag.match(/--older-than-archived=(\d+)d?/);
    if (m) thresholdDays = parseInt(m[1], 10);
  }
  const archiveRoot = path.join(kbRoot, '_archived');
  if (!fs.existsSync(archiveRoot)) {
    console.log('OK: _archived/ no existe — nada que purgar');
    return;
  }
  let purged = 0;
  for (const dateDir of fs.readdirSync(archiveRoot)) {
    const dirPath = path.join(archiveRoot, dateDir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    // dateDir esperado en formato YYYY-MM-DD
    const iso = `${dateDir}T00:00:00Z`;
    const days = daysSince(iso);
    if (days < thresholdDays) continue;
    const filesInDir = fs.readdirSync(dirPath);
    for (const f of filesInDir) {
      fs.unlinkSync(path.join(dirPath, f));
      console.log(`PURGED: _archived/${dateDir}/${f}`);
      purged++;
    }
    // Borrar el dir si quedó vacío
    if (fs.readdirSync(dirPath).length === 0) {
      fs.rmdirSync(dirPath);
    }
  }
  console.log(`OK: ${purged} archivos purgados físicamente (>${thresholdDays}d en _archived)`);
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

function printUsage() {
  console.error('Uso:');
  console.error('  node scripts/kb-sync.cjs --full-rebuild');
  console.error('  node scripts/kb-sync.cjs --audit-stale');
  console.error('  node scripts/kb-sync.cjs --archive --confirm');
  console.error('  node scripts/kb-sync.cjs --purge --confirm --older-than-archived=365d');
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }
  if (args.includes('--full-rebuild')) return cmdFullRebuild(args);
  if (args.includes('--audit-stale')) return cmdAuditStale();
  if (args.includes('--archive')) return cmdArchive(args);
  if (args.includes('--purge')) return cmdPurge(args);
  printUsage();
  process.exit(1);
}

main();
