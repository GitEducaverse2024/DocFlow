/**
 * knowledge-sync.ts — Sincronización bidireccional DB ↔ `.docflow-kb/`.
 *
 * Phase 149 Plan 03 (KB-04).
 *
 * Responsabilidades:
 *   - Escribir/actualizar archivos .md desde rows de DB (create, update).
 *   - Soft-delete via markDeprecated (status: deprecated).
 *   - Auto-sync de `_index.json` y `_header.md` tras cada op.
 *   - `detectBumpLevel` según §5.2 del PRD (patch/minor/major).
 *   - `touchAccess` — incrementa access_count para TTL management.
 *
 * NO responsabilidades en esta fase (Phase 149):
 *   - Integración real con prompt-assembler (cache invalidation) → Fase 4 PRD.
 *   - Lectura directa de DB (el servicio recibe rows ya leídas).
 *
 * Convenciones del proyecto:
 *   - No leer `process.env.X` directo; recibir `kbRoot` por context.
 *   - No importar `better-sqlite3`; el servicio opera sólo sobre filesystem.
 *   - Errores: `throw new Error(msg)`; el caller decide logging.
 *
 * Contract:
 *   El YAML generado satisface `scripts/validate-kb.cjs` (exit 0) para todos
 *   los archivos que este servicio produce o modifica.
 */
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Entity =
  | 'catpaw'
  | 'connector'
  | 'catbrain'
  | 'template'
  | 'skill'
  | 'canvas';

export type Op = 'create' | 'update' | 'delete' | 'access';

export type BumpLevel = 'patch' | 'minor' | 'major';

export interface DBRow {
  id: string;
  name?: string;
  description?: string;
  mode?: string;
  model?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  is_active?: boolean | number;
  department?: string;
  [k: string]: unknown;
}

export interface SyncContext {
  author?: string;
  kbRoot?: string;
  reason?: string;
  superseded_by?: string;
}

// ---------------------------------------------------------------------------
// Config maps
// ---------------------------------------------------------------------------

const DEFAULT_KB_ROOT = path.resolve(__dirname, '../../../../.docflow-kb');

function getKbRoot(ctx?: SyncContext): string {
  return ctx?.kbRoot ?? DEFAULT_KB_ROOT;
}

const ENTITY_SUBDIR: Record<Entity, string> = {
  catpaw: 'resources/catpaws',
  connector: 'resources/connectors',
  catbrain: 'resources/catbrains',
  template: 'resources/email-templates',
  skill: 'resources/skills',
  canvas: 'resources/canvases',
};

const FIELDS_FROM_DB: Record<Entity, string[]> = {
  catpaw: [
    'name',
    'description',
    'mode',
    'model',
    'system_prompt',
    'temperature',
    'max_tokens',
    'is_active',
    'department',
  ],
  connector: ['name', 'description', 'type', 'is_active', 'times_used', 'test_status'],
  catbrain: ['name', 'description', 'collection', 'is_active'],
  template: ['name', 'description', 'subject', 'body', 'product'],
  skill: ['name', 'description', 'category', 'is_active'],
  canvas: ['name', 'description', 'canvas_data', 'is_active'],
};

const ENTITY_TO_TABLE: Record<Entity, string> = {
  catpaw: 'cat_paws',
  connector: 'connectors',
  catbrain: 'catbrains',
  template: 'email_templates',
  skill: 'skills',
  canvas: 'canvases',
};

// ---------------------------------------------------------------------------
// Slug / id helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return (name || 'unnamed')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'unnamed';
}

function idShort(id: string): string {
  return id.slice(0, 8);
}

function kbFilePath(
  kbRoot: string,
  entity: Entity,
  row: { id: string; name?: string }
): string {
  const subdir = ENTITY_SUBDIR[entity];
  const slug = slugify(row.name ?? 'unnamed');
  const fname = `${idShort(row.id)}-${slug}.md`;
  return path.join(kbRoot, subdir, fname);
}

function findExistingFileByIdShort(
  kbRoot: string,
  entity: Entity,
  id: string
): string | null {
  const subdir = path.join(kbRoot, ENTITY_SUBDIR[entity]);
  if (!fs.existsSync(subdir)) return null;
  const prefix = idShort(id);
  const files = fs.readdirSync(subdir);
  const match = files.find(
    (f) => f.startsWith(`${prefix}-`) && f.endsWith('.md')
  );
  return match ? path.join(subdir, match) : null;
}

// ---------------------------------------------------------------------------
// YAML subset parser (ported from scripts/validate-kb.cjs to TypeScript)
// ---------------------------------------------------------------------------

type YamlValue = unknown;

function smartSplit(s: string, sep: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depthBracket = 0;
  let depthBrace = 0;
  let inQuote: string | null = null;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (inQuote) {
      if (c === inQuote) inQuote = null;
      buf += c;
      continue;
    }
    if (c === '"' || c === "'") {
      inQuote = c;
      buf += c;
      continue;
    }
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

function findTopLevelColon(s: string): number {
  let depthBracket = 0;
  let depthBrace = 0;
  let inQuote: string | null = null;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (inQuote) {
      if (c === inQuote) inQuote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inQuote = c;
      continue;
    }
    if (c === '[') depthBracket++;
    else if (c === ']') depthBracket--;
    else if (c === '{') depthBrace++;
    else if (c === '}') depthBrace--;
    else if (c === ':' && depthBracket === 0 && depthBrace === 0) return k;
  }
  return -1;
}

function parseScalar(v: string): YamlValue {
  v = v.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if (v.startsWith('[') && v.endsWith(']')) return parseInlineList(v);
  if (v.startsWith('{') && v.endsWith('}')) return parseInlineDict(v);
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function parseInlineList(v: string): YamlValue[] {
  const inner = v.slice(1, -1).trim();
  if (!inner) return [];
  return smartSplit(inner, ',').map((x) => parseScalar(x));
}

function parseInlineDict(v: string): Record<string, YamlValue> {
  const inner = v.slice(1, -1).trim();
  const d: Record<string, YamlValue> = {};
  if (!inner) return d;
  for (const pair of smartSplit(inner, ',')) {
    const colonIdx = findTopLevelColon(pair);
    if (colonIdx === -1) continue;
    const k = pair.slice(0, colonIdx).trim();
    const val = pair.slice(colonIdx + 1).trim();
    d[k] = parseScalar(val);
  }
  return d;
}

function getIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function parseYAML(yamlText: string): Record<string, YamlValue> {
  const lines = yamlText.split('\n');

  function parseBlock(
    startI: number,
    parentIndent: number
  ): { value: YamlValue; nextI: number } {
    const out: Record<string, YamlValue> = {};
    const list: YamlValue[] = [];
    let mode: 'list' | 'dict' | null = null;
    let j = startI;

    while (j < lines.length) {
      const line = lines[j];
      if (!line.trim() || line.trim().startsWith('#')) {
        j++;
        continue;
      }
      const indent = getIndent(line);
      if (indent <= parentIndent) break;

      const trimmed = line.trim();

      if (trimmed.startsWith('- ') || trimmed === '-') {
        if (mode === 'dict') break;
        mode = 'list';
        const itemStr = trimmed === '-' ? '' : trimmed.slice(2);
        if (
          itemStr.trim().startsWith('{') &&
          itemStr.trim().endsWith('}')
        ) {
          list.push(parseScalar(itemStr.trim()));
          j++;
          continue;
        }
        const colonIdx = findTopLevelColon(itemStr);
        if (colonIdx !== -1) {
          const firstKey = itemStr.slice(0, colonIdx).trim();
          const firstVal = itemStr.slice(colonIdx + 1).trim();
          const itemDict: Record<string, YamlValue> = {};
          if (firstVal) {
            itemDict[firstKey] = parseScalar(firstVal);
            j++;
          } else {
            const sub = parseBlock(j + 1, indent + 1);
            itemDict[firstKey] = sub.value;
            j = sub.nextI;
          }
          const itemIndent = indent;
          while (j < lines.length) {
            const nline = lines[j];
            if (!nline.trim() || nline.trim().startsWith('#')) {
              j++;
              continue;
            }
            const nindent = getIndent(nline);
            if (nindent <= itemIndent) break;
            const ntrim = nline.trim();
            if (ntrim.startsWith('- ') || ntrim === '-') break;
            const ncol = findTopLevelColon(ntrim);
            if (ncol === -1) {
              j++;
              continue;
            }
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
      if (colonIdx === -1) {
        j++;
        continue;
      }
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

  const result: Record<string, YamlValue> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    const indent = getIndent(line);
    if (indent > 0) {
      i++;
      continue;
    }
    const trimmed = line.trim();
    const colonIdx = findTopLevelColon(trimmed);
    if (colonIdx === -1) {
      i++;
      continue;
    }
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

function parseFrontmatter(fileContent: string): {
  frontmatter: Record<string, YamlValue>;
  body: string;
} {
  if (
    !fileContent.startsWith('---\n') &&
    !fileContent.startsWith('---\r\n')
  ) {
    return { frontmatter: {}, body: fileContent };
  }
  const lines = fileContent.split('\n');
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return { frontmatter: {}, body: fileContent };
  const yamlText = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  return { frontmatter: parseYAML(yamlText), body };
}

// ---------------------------------------------------------------------------
// YAML serializer — determinístico, orden canónico
// ---------------------------------------------------------------------------

const FIELD_ORDER = [
  'id',
  'type',
  'subtype',
  'lang',
  'mode',
  'title',
  'summary',
  'tags',
  'audience',
  'status',
  'created_at',
  'created_by',
  'version',
  'updated_at',
  'updated_by',
  'last_accessed_at',
  'access_count',
  'deprecated_at',
  'deprecated_by',
  'deprecated_reason',
  'superseded_by',
  'source_of_truth',
  'enriched_fields',
  'related',
  'search_hints',
  'sync_snapshot',
  'change_log',
  'ttl',
];

function needsQuoting(s: string): boolean {
  // Quote cuando un string bare-scalar causaría ambigüedad de parseo YAML.
  // Regla: sólo quotar si es realmente necesario (para permitir regexes de test
  // que asumen valores como `user:antonio` sin comillas).
  if (!s) return true;
  if (/^(true|false|null|~)$/.test(s)) return true;
  if (/^-?\d+(\.\d+)?$/.test(s)) return true;
  // Indicadores YAML a inicio de scalar
  if (/^[\[\]\{\}\,\&\*\#\?\|\<\>\=\!\%\@\`]/.test(s)) return true;
  if (s.startsWith('- ')) return true;
  // Colon sólo es problemático si va seguido de espacio (key: value)
  if (/:\s/.test(s) || s.endsWith(':')) return true;
  // Doble quote sin escapar causaría ruptura
  if (s.includes('"')) return true;
  // Leading/trailing whitespace
  if (/^\s|\s$/.test(s)) return true;
  // Hash introduce comentario
  if (/ #/.test(s)) return true;
  return false;
}

function yamlQuote(s: string): string {
  // Escape double quotes y backslashes
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function serializeScalar(v: YamlValue): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (needsQuoting(v)) return yamlQuote(v);
    return v;
  }
  // fallback (arrays/dicts no deberían caer aquí)
  return JSON.stringify(v);
}

function isPrimitive(v: unknown): boolean {
  return (
    v === null ||
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean'
  );
}

function serializeInlineList(arr: YamlValue[]): string {
  return '[' + arr.map((x) => serializeScalar(x)).join(', ') + ']';
}

function serializeInlineDict(d: Record<string, YamlValue>): string {
  const parts = Object.keys(d).map((k) => `${k}: ${serializeScalar(d[k])}`);
  return '{ ' + parts.join(', ') + ' }';
}

function serializeValue(
  key: string,
  value: YamlValue,
  indent = 0
): string {
  const pad = ' '.repeat(indent);

  if (value === null || value === undefined) {
    return `${pad}${key}: null\n`;
  }

  if (isPrimitive(value)) {
    return `${pad}${key}: ${serializeScalar(value)}\n`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}${key}: []\n`;
    const allPrimitives = value.every((x) => isPrimitive(x));
    if (allPrimitives) {
      return `${pad}${key}: ${serializeInlineList(value)}\n`;
    }
    // Array de objetos — usar formato multiline con dicts inline si son pequeños,
    // o multiline dicts si son grandes.
    let out = `${pad}${key}:\n`;
    for (const item of value) {
      if (isPrimitive(item)) {
        out += `${pad}  - ${serializeScalar(item)}\n`;
      } else if (Array.isArray(item)) {
        out += `${pad}  - ${serializeInlineList(item)}\n`;
      } else if (typeof item === 'object' && item !== null) {
        // Si todos los valores son primitivos, inline; si no, multiline
        const rec = item as Record<string, YamlValue>;
        const allPrim = Object.values(rec).every((x) => isPrimitive(x));
        if (allPrim) {
          out += `${pad}  - ${serializeInlineDict(rec)}\n`;
        } else {
          // Multiline dict: primer key inline tras `- `
          const entries = Object.entries(rec);
          if (entries.length === 0) {
            out += `${pad}  - {}\n`;
          } else {
            const [firstK, firstV] = entries[0];
            if (isPrimitive(firstV)) {
              out += `${pad}  - ${firstK}: ${serializeScalar(firstV)}\n`;
            } else if (Array.isArray(firstV)) {
              if (firstV.every((x) => isPrimitive(x))) {
                out += `${pad}  - ${firstK}: ${serializeInlineList(firstV)}\n`;
              } else {
                out += `${pad}  - ${firstK}:\n`;
                out += serializeArrayItems(firstV, indent + 4);
              }
            } else {
              out += `${pad}  - ${firstK}:\n`;
              out += serializeDictEntries(
                firstV as Record<string, YamlValue>,
                indent + 4
              );
            }
            for (const [k, v] of entries.slice(1)) {
              if (isPrimitive(v)) {
                out += `${pad}    ${k}: ${serializeScalar(v)}\n`;
              } else if (Array.isArray(v)) {
                if (v.every((x) => isPrimitive(x))) {
                  out += `${pad}    ${k}: ${serializeInlineList(v)}\n`;
                } else {
                  out += `${pad}    ${k}:\n`;
                  out += serializeArrayItems(v, indent + 6);
                }
              } else {
                out += `${pad}    ${k}:\n`;
                out += serializeDictEntries(
                  v as Record<string, YamlValue>,
                  indent + 6
                );
              }
            }
          }
        }
      }
    }
    return out;
  }

  if (typeof value === 'object') {
    const rec = value as Record<string, YamlValue>;
    const allPrim = Object.values(rec).every((x) => isPrimitive(x));
    if (allPrim && Object.keys(rec).length <= 2 && key === 'title') {
      // title: { es: ..., en: ... } — mejor multilinea para legibilidad
      let out = `${pad}${key}:\n`;
      for (const [k, v] of Object.entries(rec)) {
        out += `${pad}  ${k}: ${serializeScalar(v)}\n`;
      }
      return out;
    }
    let out = `${pad}${key}:\n`;
    out += serializeDictEntries(rec, indent + 2);
    return out;
  }

  return `${pad}${key}: ${JSON.stringify(value)}\n`;
}

function serializeDictEntries(
  rec: Record<string, YamlValue>,
  indent: number
): string {
  const pad = ' '.repeat(indent);
  let out = '';
  for (const [k, v] of Object.entries(rec)) {
    if (isPrimitive(v)) {
      out += `${pad}${k}: ${serializeScalar(v)}\n`;
    } else if (Array.isArray(v)) {
      if (v.every((x) => isPrimitive(x))) {
        out += `${pad}${k}: ${serializeInlineList(v)}\n`;
      } else {
        out += `${pad}${k}:\n`;
        out += serializeArrayItems(v, indent + 2);
      }
    } else if (typeof v === 'object' && v !== null) {
      out += `${pad}${k}:\n`;
      out += serializeDictEntries(v as Record<string, YamlValue>, indent + 2);
    } else {
      out += `${pad}${k}: null\n`;
    }
  }
  return out;
}

function serializeArrayItems(arr: YamlValue[], indent: number): string {
  const pad = ' '.repeat(indent);
  let out = '';
  for (const item of arr) {
    if (isPrimitive(item)) {
      out += `${pad}- ${serializeScalar(item)}\n`;
    } else if (Array.isArray(item)) {
      out += `${pad}- ${serializeInlineList(item)}\n`;
    } else if (typeof item === 'object' && item !== null) {
      const rec = item as Record<string, YamlValue>;
      const allPrim = Object.values(rec).every((x) => isPrimitive(x));
      if (allPrim) {
        out += `${pad}- ${serializeInlineDict(rec)}\n`;
      } else {
        const entries = Object.entries(rec);
        if (entries.length === 0) {
          out += `${pad}- {}\n`;
        } else {
          const [firstK, firstV] = entries[0];
          out += `${pad}- ${firstK}: ${
            isPrimitive(firstV)
              ? serializeScalar(firstV)
              : Array.isArray(firstV)
                ? serializeInlineList(firstV as YamlValue[])
                : JSON.stringify(firstV)
          }\n`;
          for (const [k, v] of entries.slice(1)) {
            if (isPrimitive(v)) {
              out += `${pad}  ${k}: ${serializeScalar(v)}\n`;
            } else if (Array.isArray(v)) {
              out += `${pad}  ${k}: ${serializeInlineList(v as YamlValue[])}\n`;
            } else {
              out += `${pad}  ${k}: ${JSON.stringify(v)}\n`;
            }
          }
        }
      }
    }
  }
  return out;
}

function serializeFrontmatter(fm: Record<string, YamlValue>): string {
  const ordered: Record<string, YamlValue> = {};
  for (const key of FIELD_ORDER) {
    if (fm[key] !== undefined) ordered[key] = fm[key];
  }
  // Append any keys not in FIELD_ORDER (future-proof)
  for (const key of Object.keys(fm)) {
    if (!(key in ordered)) ordered[key] = fm[key];
  }
  let body = '---\n';
  for (const [k, v] of Object.entries(ordered)) {
    body += serializeValue(k, v, 0);
  }
  body += '---\n';
  return body;
}

// ---------------------------------------------------------------------------
// Bump detection — precedence major > minor > patch
// ---------------------------------------------------------------------------

function arrayShallowEqual(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function detectBumpLevel(
  rawCurrent: Record<string, unknown>,
  newRow: DBRow
): BumpLevel {
  // Desanidar `sync_snapshot` al nivel top para homogeneizar comparaciones
  // (se guarda ahí para no contaminar el top-level del frontmatter).
  const snapshot =
    typeof rawCurrent.sync_snapshot === 'object' &&
    rawCurrent.sync_snapshot !== null
      ? (rawCurrent.sync_snapshot as Record<string, unknown>)
      : {};
  const current: Record<string, unknown> = { ...snapshot, ...rawCurrent };

  // -------- MAJOR --------
  // status → deprecated (detectado via is_active: 0 / false)
  if (
    current.status === 'active' &&
    (newRow.is_active === 0 || newRow.is_active === false)
  ) {
    return 'major';
  }
  // subtype cambió
  if (
    newRow.subtype !== undefined &&
    current.subtype !== undefined &&
    current.subtype !== newRow.subtype
  ) {
    return 'major';
  }
  // mode cambió
  if (
    newRow.mode !== undefined &&
    current.mode !== undefined &&
    current.mode !== newRow.mode
  ) {
    return 'major';
  }
  // contract I/O incompatible (detectado via io_contract_hash)
  if (
    (newRow as Record<string, unknown>).io_contract_hash !== undefined &&
    current.io_contract_hash !== undefined &&
    (newRow as Record<string, unknown>).io_contract_hash !==
      current.io_contract_hash
  ) {
    return 'major';
  }

  // -------- MINOR --------
  // system_prompt cambió
  if (
    newRow.system_prompt !== undefined &&
    current.system_prompt !== undefined &&
    current.system_prompt !== newRow.system_prompt
  ) {
    return 'minor';
  }
  // connectors_linked cambió
  if (
    (newRow as Record<string, unknown>).connectors_linked !== undefined &&
    !arrayShallowEqual(
      current.connectors_linked,
      (newRow as Record<string, unknown>).connectors_linked
    )
  ) {
    return 'minor';
  }
  // skills_linked cambió
  if (
    (newRow as Record<string, unknown>).skills_linked !== undefined &&
    !arrayShallowEqual(
      current.skills_linked,
      (newRow as Record<string, unknown>).skills_linked
    )
  ) {
    return 'minor';
  }
  // related cambió (diffs no triviales)
  if (
    (newRow as Record<string, unknown>).related !== undefined &&
    !arrayShallowEqual(
      current.related,
      (newRow as Record<string, unknown>).related
    )
  ) {
    return 'minor';
  }
  // lang: es → es+en (traducción añadida)
  const newLang = (newRow as Record<string, unknown>).lang;
  if (
    current.lang === 'es' &&
    typeof newLang === 'string' &&
    newLang === 'es+en'
  ) {
    return 'minor';
  }

  // -------- PATCH (default) --------
  return 'patch';
}

function bumpVersion(current: string, level: BumpLevel): string {
  const parts = current.split('.').map((x) => parseInt(x, 10));
  const M = Number.isNaN(parts[0]) ? 1 : parts[0];
  const m = Number.isNaN(parts[1]) ? 0 : parts[1];
  const p = Number.isNaN(parts[2]) ? 0 : parts[2];
  if (level === 'major') return `${M + 1}.0.0`;
  if (level === 'minor') return `${M}.${m + 1}.0`;
  return `${M}.${m}.${p + 1}`;
}

function truncateChangeLog(log: unknown): Array<Record<string, YamlValue>> {
  if (!Array.isArray(log)) return [];
  return log.slice(-5) as Array<Record<string, YamlValue>>;
}

// Keys whose values shift on every update even when nothing structural changed.
// stripVolatile removes them from the frontmatter shape for the isNoopUpdate
// comparison so a syncResource('update') on an unchanged DB row is a true no-op
// (no version bump, no updated_at rewrite, no change_log growth).
const VOLATILE_UPDATE_KEYS: ReadonlySet<string> = new Set([
  'updated_at',
  'updated_by',
  'change_log',
  'version',
  'sync_snapshot',
]);

function stripVolatile(
  fm: Record<string, YamlValue>
): Record<string, YamlValue> {
  const out: Record<string, YamlValue> = {};
  for (const [k, v] of Object.entries(fm)) {
    if (!VOLATILE_UPDATE_KEYS.has(k)) out[k] = v;
  }
  return out;
}

function isNoopUpdate(
  currentFm: Record<string, YamlValue>,
  projectedFm: Record<string, YamlValue>,
  currentBody: string,
  projectedBody: string
): boolean {
  const a = JSON.stringify(stripVolatile(currentFm));
  const b = JSON.stringify(stripVolatile(projectedFm));
  return a === b && currentBody.trimEnd() === projectedBody.trimEnd();
}

// ---------------------------------------------------------------------------
// Frontmatter builders
// ---------------------------------------------------------------------------

function inferTags(entity: Entity, row: DBRow): string[] {
  const tags: string[] = [entity];
  if (row.mode && typeof row.mode === 'string') tags.push(row.mode);
  if (row.department && typeof row.department === 'string') {
    tags.push(String(row.department));
  }
  // Dedup sin depender de iteración de Set (compat con TS target más bajo)
  const seen: Record<string, true> = {};
  const out: string[] = [];
  for (const t of tags) {
    if (!seen[t]) {
      seen[t] = true;
      out.push(t);
    }
  }
  return out;
}

// Snapshot de campos críticos usados por detectBumpLevel (guardados en
// frontmatter para que updates futuros puedan comparar contra el estado
// previo persistido).
const SNAPSHOT_FIELDS = [
  'system_prompt',
  'connectors_linked',
  'skills_linked',
  'io_contract_hash',
] as const;

function buildSyncSnapshot(row: DBRow): Record<string, YamlValue> {
  const snap: Record<string, YamlValue> = {};
  for (const k of SNAPSHOT_FIELDS) {
    const v = row[k];
    if (v === undefined) continue;
    if (typeof v === 'string') {
      // Truncar system_prompt a 500 chars en snapshot (no necesitamos el full)
      snap[k] = v.length > 500 ? v.slice(0, 500) : v;
    } else if (Array.isArray(v)) {
      snap[k] = [...v] as YamlValue[];
    } else {
      snap[k] = v as YamlValue;
    }
  }
  return snap;
}

function buildFrontmatterForCreate(
  entity: Entity,
  row: DBRow,
  ctx: SyncContext
): Record<string, YamlValue> {
  const now = new Date().toISOString();
  const author = ctx.author ?? 'unknown';
  const isActive = !(row.is_active === 0 || row.is_active === false);
  const summaryText = String(row.description ?? '').slice(0, 200) ||
    `${entity} ${row.id}`;
  const fm: Record<string, YamlValue> = {
    id: `${entity}-${idShort(row.id)}`,
    type: 'resource',
    subtype: entity,
    lang: 'es',
    title: String(row.name ?? `Unnamed ${entity}`),
    summary: summaryText,
    tags: inferTags(entity, row),
    audience: ['catbot', 'architect', 'developer'],
    status: isActive ? 'active' : 'deprecated',
    created_at: now,
    created_by: author,
    version: '1.0.0',
    updated_at: now,
    updated_by: author,
    last_accessed_at: now,
    access_count: 0,
    source_of_truth: [
      {
        db: ENTITY_TO_TABLE[entity],
        id: row.id,
        fields_from_db: FIELDS_FROM_DB[entity],
      },
    ],
    enriched_fields: [],
    related: [],
    change_log: [
      {
        version: '1.0.0',
        date: now.slice(0, 10),
        author,
        change: `Creado automáticamente por knowledge-sync (${author})`,
      },
    ],
    ttl: 'managed',
  };

  // Snapshot de campos críticos (system_prompt, connectors_linked, etc.)
  const snap = buildSyncSnapshot(row);
  if (Object.keys(snap).length > 0) {
    fm.sync_snapshot = snap;
  }
  // Mode/lang se guardan también para que detectBumpLevel pueda comparar
  if (row.mode !== undefined) fm.mode = row.mode as YamlValue;

  // Phase 156 KB-42 (search_hints extension) — populate search_hints con los
  // nombres de los conectores + skills vinculadas cuando el caller enriqueció
  // el row. searchKb scorea hints con +1 (ver kb-index-cache.ts:349), así que
  // `search_kb({search:"holded"})` encuentra CatPaws vinculados a Holded aunque
  // no aparezca en title/summary/tags.
  const hints = buildSearchHints(entity, row);
  if (hints && hints.length > 0) fm.search_hints = hints as YamlValue;
  return fm;
}

/**
 * Phase 156 KB-42 (search_hints extension) — Calcula el array `search_hints`
 * para el frontmatter a partir de campos enriched del row. Hoy sólo aplica
 * a catpaw: incluye los nombres de conectores + skills vinculadas cuando el
 * caller los pasa. Dedup case-insensitive + sort ASC para que `isNoopUpdate`
 * vea un JSON estable. Devuelve `undefined` si no hay nada que enriquecer
 * (el caller decide si mantener el valor previo o limpiar el campo).
 */
function buildSearchHints(entity: Entity, row: DBRow): string[] | undefined {
  if (entity !== 'catpaw') return undefined;
  const linkedConnectors =
    (row as unknown as { linked_connectors?: Array<{ id: string; name: string }> })
      .linked_connectors;
  const linkedSkills =
    (row as unknown as { linked_skills?: Array<{ id: string; name: string }> })
      .linked_skills;
  if (!Array.isArray(linkedConnectors) && !Array.isArray(linkedSkills)) return undefined;

  const hints: string[] = [];
  if (Array.isArray(linkedConnectors)) {
    for (const c of linkedConnectors) {
      if (c && typeof c.name === 'string' && c.name.trim() !== '') hints.push(c.name);
    }
  }
  if (Array.isArray(linkedSkills)) {
    for (const s of linkedSkills) {
      if (s && typeof s.name === 'string' && s.name.trim() !== '') hints.push(s.name);
    }
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const h of hints) {
    const k = h.toLowerCase();
    if (!seen.has(k)) { seen.add(k); unique.push(h); }
  }
  unique.sort((a, b) => a.localeCompare(b));
  return unique;
}

/**
 * Phase 156 KB-42 — Renderiza una sección de lista vinculada (conectores o
 * skills) como string markdown, devuelto sin leading/trailing newlines para
 * que {@link replaceOrAppendSection} controle el envoltorio. Formato:
 *   `- **<name>** (\`<id>\`)` por cada item; placeholder `_(sin …)_` cuando
 * el array está vacío. Caller debe pasar items sorted por name ASC para
 * mantener isNoopUpdate determinístico (Pitfall 3).
 */
function renderLinkedSection(
  items: Array<{ id: string; name: string }>,
  emptyLabel: string,
): string {
  if (items.length === 0) {
    return `_(${emptyLabel})_`;
  }
  return items.map((i) => `- **${i.name}** (\`${i.id}\`)`).join('\n');
}

/**
 * Phase 156 KB-42 — Reemplaza el contenido de una sección markdown `## …`
 * hasta el siguiente `## ` o fin del archivo, con `body`. Si la sección no
 * existe, la append al final con separador en blanco. Usado por syncResource
 * update para mantener las secciones "## Conectores vinculados" y
 * "## Skills vinculadas" en sincronía con el row enriquecido del caller.
 */
function replaceOrAppendSection(
  content: string,
  header: string,
  body: string,
): string {
  // Construye regex que captura:
  //   header \n \n body \n ( trailing \n ) (?= `## ` | $ )
  const escHeader = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRegex = new RegExp(
    `${escHeader}\\n\\n[\\s\\S]*?(?=\\n## |$)`,
  );
  const replacement = `${header}\n\n${body}\n`;
  if (sectionRegex.test(content)) {
    return content.replace(sectionRegex, replacement);
  }
  // Section missing — append al final
  const trimmed = content.replace(/\s+$/, '');
  return `${trimmed}\n\n${replacement}`;
}

function buildBody(
  entity: Entity,
  row: DBRow,
  fm: Record<string, YamlValue>
): string {
  const title =
    typeof fm.title === 'string'
      ? fm.title
      : (fm.title as Record<string, string>)?.es ?? String(row.name ?? entity);
  const summary =
    typeof fm.summary === 'string'
      ? fm.summary
      : (fm.summary as Record<string, string>)?.es ?? '';
  const lines: string[] = [];
  lines.push('');
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(summary);
  lines.push('');
  if (entity === 'catpaw') {
    lines.push(
      `**Modo:** ${row.mode ?? 'n/a'} | **Modelo:** ${row.model ?? 'n/a'} | **Departamento:** ${row.department ?? 'n/a'}`
    );
    lines.push('');
    if (row.system_prompt) {
      lines.push('## System prompt');
      lines.push('');
      lines.push('```');
      lines.push(String(row.system_prompt).slice(0, 1000));
      lines.push('```');
      lines.push('');
    }
    if (row.temperature !== undefined || row.max_tokens !== undefined) {
      lines.push('## Configuración');
      lines.push('');
      if (row.temperature !== undefined) {
        lines.push(`- Temperature: ${row.temperature}`);
      }
      if (row.max_tokens !== undefined) {
        lines.push(`- Max tokens: ${row.max_tokens}`);
      }
      lines.push('');
    }

    // Phase 156 KB-42 — linked relations sections. Opción A (RESEARCH §D):
    // el caller pasa linked_connectors + linked_skills pre-enriquecidos en el
    // row; este servicio sigue siendo pure-filesystem (sin DB import). El
    // caller debe pasar arrays sorted por name ASC para que isNoopUpdate
    // detecte re-links idempotentes como no-op (Pitfall 3).
    const linkedConnectors =
      (row as unknown as { linked_connectors?: Array<{ id: string; name: string }> })
        .linked_connectors ?? [];
    const linkedSkills =
      (row as unknown as { linked_skills?: Array<{ id: string; name: string }> })
        .linked_skills ?? [];

    lines.push('## Conectores vinculados');
    lines.push('');
    lines.push(renderLinkedSection(linkedConnectors, 'sin conectores vinculados'));
    lines.push('');
    lines.push('## Skills vinculadas');
    lines.push('');
    lines.push(renderLinkedSection(linkedSkills, 'sin skills vinculadas'));
    lines.push('');
  }
  return lines.join('\n');
}

// Merge: sobrescribe sólo fields_from_db; preserva resto (incluye enriched_fields + body)
function mergeRowIntoFrontmatter(
  entity: Entity,
  current: Record<string, YamlValue>,
  row: DBRow
): {
  merged: Record<string, YamlValue>;
  dbOverwroteHumanEdit: boolean;
  changedFields: string[];
} {
  const merged: Record<string, YamlValue> = { ...current };
  const changedFields: string[] = [];
  let dbOverwroteHumanEdit = false;

  for (const k of FIELDS_FROM_DB[entity]) {
    if (row[k] === undefined) continue;
    const newVal = row[k];
    // Campos derivados: name → title, description → summary
    if (k === 'name' && typeof newVal === 'string') {
      if (merged.title !== newVal) {
        if (merged.title !== undefined && merged.title !== String(row.name ?? '')) {
          dbOverwroteHumanEdit = true;
        }
        merged.title = newVal;
        changedFields.push('title');
      }
    } else if (k === 'description' && typeof newVal === 'string') {
      const summaryFromDB = newVal.slice(0, 200);
      if (merged.summary !== summaryFromDB) {
        if (merged.summary !== undefined) {
          dbOverwroteHumanEdit = true;
        }
        merged.summary = summaryFromDB;
        changedFields.push('summary');
      }
    } else if (k === 'is_active') {
      const isActive = !(newVal === 0 || newVal === false);
      const newStatus = isActive ? 'active' : 'deprecated';
      if (merged.status !== newStatus) {
        merged.status = newStatus;
        changedFields.push('status');
      }
    }
  }

  return { merged, dbOverwroteHumanEdit, changedFields };
}

// ---------------------------------------------------------------------------
// Public ops
// ---------------------------------------------------------------------------

export async function syncResource(
  entity: Entity,
  op: Op,
  row: DBRow | { id: string },
  context?: SyncContext
): Promise<void> {
  const ctx = context ?? {};
  const kbRoot = getKbRoot(ctx);

  switch (op) {
    case 'create': {
      const dbRow = row as DBRow;
      const fm = buildFrontmatterForCreate(entity, dbRow, ctx);
      const fpath = kbFilePath(kbRoot, entity, dbRow);
      fs.mkdirSync(path.dirname(fpath), { recursive: true });
      const body = buildBody(entity, dbRow, fm);
      fs.writeFileSync(fpath, serializeFrontmatter(fm) + body);
      break;
    }
    case 'update': {
      const existingPath = findExistingFileByIdShort(kbRoot, entity, row.id);
      if (!existingPath) {
        // Idempotencia: si no existe, crear.
        await syncResource(entity, 'create', row as DBRow, ctx);
        return;
      }
      const existing = fs.readFileSync(existingPath, 'utf8');
      const { frontmatter: current, body } = parseFrontmatter(existing);
      const dbRow = row as DBRow;

      // Build the projected merged frontmatter (without touching version /
      // updated_at / change_log) so we can detect a true no-op before writing.
      const { merged, dbOverwroteHumanEdit } = mergeRowIntoFrontmatter(
        entity,
        current,
        dbRow
      );

      // Refresh sync_snapshot with the new DB values — same projection as
      // the write path below, done here so the noop comparison sees the
      // real post-merge shape (minus the volatile keys that stripVolatile
      // removes, including sync_snapshot itself).
      const newSnapshot = buildSyncSnapshot(dbRow);
      const prevSnapshot =
        typeof current.sync_snapshot === 'object' && current.sync_snapshot !== null
          ? (current.sync_snapshot as Record<string, YamlValue>)
          : {};
      const mergedSnapshot = { ...prevSnapshot, ...newSnapshot };
      if (Object.keys(mergedSnapshot).length > 0) {
        merged.sync_snapshot = mergedSnapshot;
      }
      // Mantener `mode` top-level para detectBumpLevel en siguientes updates
      if (dbRow.mode !== undefined) merged.mode = dbRow.mode as YamlValue;

      // Sincronizar fields_from_db específicos al body para catpaw (system_prompt)
      let newBody = body;
      if (entity === 'catpaw' && dbRow.system_prompt !== undefined) {
        // Si el body tiene un bloque ``` de system_prompt, sustituirlo
        const sysPromptBlock = /```[\s\S]*?```/;
        const systemPromptSectionRegex = /(## System prompt\n\n)(```[\s\S]*?```)/;
        if (systemPromptSectionRegex.test(newBody)) {
          newBody = newBody.replace(
            systemPromptSectionRegex,
            `$1\`\`\`\n${String(dbRow.system_prompt).slice(0, 1000)}\n\`\`\``
          );
        } else if (sysPromptBlock.test(newBody)) {
          // bloque triple-backtick sin header formal
          newBody = newBody.replace(
            sysPromptBlock,
            `\`\`\`\n${String(dbRow.system_prompt).slice(0, 1000)}\n\`\`\``
          );
        }
      }

      // Phase 156 KB-42 — Sincronizar secciones linked relations al body del
      // catpaw cuando el caller pasa linked_connectors/linked_skills (Opción A
      // de RESEARCH §D). Reemplaza cada sección completa (desde el header
      // hasta el siguiente `## ` o EOF) con el render actual. Si la sección
      // no existe (archivo pre-Phase-156), append al final.
      if (entity === 'catpaw') {
        const linkedConnectors =
          (dbRow as unknown as { linked_connectors?: Array<{ id: string; name: string }> })
            .linked_connectors;
        const linkedSkills =
          (dbRow as unknown as { linked_skills?: Array<{ id: string; name: string }> })
            .linked_skills;

        if (linkedConnectors !== undefined) {
          newBody = replaceOrAppendSection(
            newBody,
            '## Conectores vinculados',
            renderLinkedSection(linkedConnectors, 'sin conectores vinculados'),
          );
        }
        if (linkedSkills !== undefined) {
          newBody = replaceOrAppendSection(
            newBody,
            '## Skills vinculadas',
            renderLinkedSection(linkedSkills, 'sin skills vinculadas'),
          );
        }

        // Phase 156 KB-42 (search_hints extension) — si el caller enriqueció
        // linked_*, regenerar search_hints desde esos arrays. Si no, respetar
        // el valor previo (updates de otros tools no tocan esta info).
        if (linkedConnectors !== undefined || linkedSkills !== undefined) {
          const hints = buildSearchHints(entity, dbRow);
          if (hints && hints.length > 0) {
            merged.search_hints = hints as YamlValue;
          } else {
            delete merged.search_hints;
          }
        }
      }

      // Idempotence short-circuit: if the projected merged frontmatter and
      // body are structurally identical to the existing file (ignoring
      // volatile keys like updated_at/change_log/version/sync_snapshot), the
      // update is a no-op. Return without writing, without bumping version,
      // without refreshing _index.json or _header.md (nothing changed on
      // disk so those are still correct).
      if (isNoopUpdate(current, merged, body, newBody)) {
        return;
      }

      // Real change detected → compute bump, bump version, update metadata,
      // append change_log entry, persist.
      const bump = detectBumpLevel(current, dbRow);
      const newVersion = bumpVersion(String(current.version ?? '1.0.0'), bump);
      const now = new Date().toISOString();

      merged.version = newVersion;
      merged.updated_at = now;
      merged.updated_by = ctx.author ?? 'unknown';

      // change_log
      const prevLog = Array.isArray(current.change_log)
        ? (current.change_log as YamlValue[])
        : [];
      const changeDescription = dbOverwroteHumanEdit
        ? `Auto-sync ${bump} bump (warning: DB overwrote local human edit in fields_from_db)`
        : `Auto-sync ${bump} bump`;
      const nextLog = truncateChangeLog([
        ...prevLog,
        {
          version: newVersion,
          date: now.slice(0, 10),
          author: ctx.author ?? 'unknown',
          change: changeDescription,
        },
      ]);
      merged.change_log = nextLog;

      fs.writeFileSync(
        existingPath,
        serializeFrontmatter(merged) + newBody
      );
      break;
    }
    case 'delete': {
      const existingPath = findExistingFileByIdShort(kbRoot, entity, row.id);
      if (!existingPath) return; // nada que deprecar
      await markDeprecated(
        existingPath,
        row,
        ctx.author ?? 'unknown',
        ctx.reason,
        ctx.superseded_by
      );
      break;
    }
    case 'access': {
      const existingPath = findExistingFileByIdShort(kbRoot, entity, row.id);
      if (!existingPath) return;
      await touchAccess(existingPath);
      break;
    }
  }

  await updateIndexFull(kbRoot);
  await regenerateHeader(kbRoot);
  await invalidateLLMCache();
}

export async function touchAccess(filePath: string): Promise<void> {
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  const prev =
    typeof frontmatter.access_count === 'number'
      ? frontmatter.access_count
      : 0;
  frontmatter.access_count = prev + 1;
  frontmatter.last_accessed_at = new Date().toISOString();
  fs.writeFileSync(filePath, serializeFrontmatter(frontmatter) + body);
}

export async function markDeprecated(
  filePath: string,
  row: { id: string },
  author: string,
  reason?: string,
  supersededBy?: string
): Promise<void> {
  const content = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);
  const now = new Date().toISOString();
  const newVersion = bumpVersion(
    String(frontmatter.version ?? '1.0.0'),
    'major'
  );
  frontmatter.status = 'deprecated';
  frontmatter.deprecated_at = now;
  frontmatter.deprecated_by = author;
  frontmatter.deprecated_reason = reason ?? `DB row removed at ${now}`;
  if (supersededBy) frontmatter.superseded_by = supersededBy;
  frontmatter.version = newVersion;
  frontmatter.updated_at = now;
  frontmatter.updated_by = author;
  const prevLog = Array.isArray(frontmatter.change_log)
    ? (frontmatter.change_log as YamlValue[])
    : [];
  frontmatter.change_log = truncateChangeLog([
    ...prevLog,
    {
      version: newVersion,
      date: now.slice(0, 10),
      author,
      change: `DEPRECATED — ${reason ?? 'DB row removed'}`,
    },
  ]);
  // Mantener referencia de id por defensa (si el row no está en frontmatter)
  void row;
  fs.writeFileSync(filePath, serializeFrontmatter(frontmatter) + body);
}

// ---------------------------------------------------------------------------
// Index + header regeneration
// ---------------------------------------------------------------------------

function walkKB(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === '_archived') continue;
    if (name === '_schema') continue;
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walkKB(p, acc);
    else if (
      name.endsWith('.md') &&
      name !== '_header.md' &&
      name !== '_manual.md' &&
      name !== '_migration-log.md' &&
      name !== 'README.md'
    ) {
      acc.push(p);
    }
  }
  return acc;
}

interface IndexEntry {
  id: string;
  path: string;
  type: string;
  subtype: string | null;
  title: string;
  summary: string;
  tags: string[];
  audience: string[];
  status: string;
  updated: string;
  search_hints: unknown;
}

async function updateIndexFull(kbRoot: string): Promise<void> {
  const idxPath = path.join(kbRoot, '_index.json');
  const files = walkKB(kbRoot);
  const entries: IndexEntry[] = [];
  const byType: Record<string, string[]> = {};
  const byTag: Record<string, string[]> = {};
  const byAudience: Record<string, string[]> = {};
  const counts: Record<string, number> = {
    catpaws_active: 0,
    connectors_active: 0,
    catbrains_active: 0,
    templates_active: 0,
    skills_active: 0,
    rules: 0,
    incidents_resolved: 0,
    features_documented: 0,
  };
  const tagFreq: Record<string, number> = {};
  const lastChanges: Array<{ id: string; updated: string }> = [];

  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const { frontmatter } = parseFrontmatter(content);
    if (!frontmatter.id) continue;
    const rel = path.relative(kbRoot, f);
    const fm = frontmatter as Record<string, unknown>;
    const titleRaw = fm.title;
    const title =
      typeof titleRaw === 'string'
        ? titleRaw
        : typeof titleRaw === 'object' && titleRaw !== null
          ? String((titleRaw as Record<string, string>).es ?? '')
          : '';
    const summaryRaw = fm.summary;
    const summary =
      typeof summaryRaw === 'string'
        ? summaryRaw
        : typeof summaryRaw === 'object' && summaryRaw !== null
          ? String((summaryRaw as Record<string, string>).es ?? '')
          : '';
    const entry: IndexEntry = {
      id: String(fm.id),
      path: rel,
      type: String(fm.type ?? 'unknown'),
      subtype: fm.subtype ? String(fm.subtype) : null,
      title,
      summary,
      tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
      audience: Array.isArray(fm.audience) ? (fm.audience as string[]) : [],
      status: String(fm.status ?? 'unknown'),
      updated: String(fm.updated_at ?? ''),
      search_hints: fm.search_hints ?? null,
    };
    entries.push(entry);

    // Indexes
    byType[entry.type] ??= [];
    byType[entry.type].push(entry.id);
    for (const t of entry.tags) {
      byTag[t] ??= [];
      byTag[t].push(entry.id);
      tagFreq[t] = (tagFreq[t] ?? 0) + 1;
    }
    for (const a of entry.audience) {
      byAudience[a] ??= [];
      byAudience[a].push(entry.id);
    }

    // Counts
    if (entry.status === 'active') {
      if (entry.subtype === 'catpaw') counts.catpaws_active++;
      else if (entry.subtype === 'connector') counts.connectors_active++;
      else if (entry.subtype === 'catbrain') counts.catbrains_active++;
      else if (entry.subtype === 'template') counts.templates_active++;
      else if (entry.subtype === 'skill') counts.skills_active++;
    }
    if (entry.type === 'rule') counts.rules++;
    if (entry.type === 'incident' && entry.status === 'active')
      counts.incidents_resolved++;
    if (entry.type === 'feature') counts.features_documented++;

    if (entry.updated) {
      lastChanges.push({ id: entry.id, updated: entry.updated });
    }
  }

  // top_tags: top 5 tags por frecuencia
  const topTags = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  lastChanges.sort((a, b) => (a.updated < b.updated ? 1 : -1));

  const idx = {
    schema_version: '2.0',
    generated_at: new Date().toISOString(),
    generated_by: 'knowledge-sync',
    entry_count: entries.length,
    header: {
      counts,
      top_tags: topTags,
      last_changes: lastChanges.slice(0, 10),
    },
    entries,
    indexes: {
      by_type: byType,
      by_tag: byTag,
      by_audience: byAudience,
    },
  };
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2));
}

async function regenerateHeader(kbRoot: string): Promise<void> {
  const idxPath = path.join(kbRoot, '_index.json');
  const headerPath = path.join(kbRoot, '_header.md');
  if (!fs.existsSync(idxPath)) return;
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  const counts = idx.header?.counts ?? {};
  const topTags: string[] = idx.header?.top_tags ?? [];
  const lines: string[] = [];
  lines.push('# KB Header (auto-generated)');
  lines.push('');
  lines.push(`**Generado:** ${idx.generated_at ?? new Date().toISOString()}`);
  lines.push(`**Entradas totales:** ${idx.entry_count ?? 0}`);
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push(`- CatPaws activos: ${counts.catpaws_active ?? 0}`);
  lines.push(`- Connectors activos: ${counts.connectors_active ?? 0}`);
  lines.push(`- CatBrains activos: ${counts.catbrains_active ?? 0}`);
  lines.push(`- Email templates activos: ${counts.templates_active ?? 0}`);
  lines.push(`- Skills activas: ${counts.skills_active ?? 0}`);
  lines.push(`- Canvases activos: ${counts.canvases_active ?? 0}`);
  lines.push(`- Reglas: ${counts.rules ?? 0}`);
  lines.push(`- Incidentes resueltos: ${counts.incidents_resolved ?? 0}`);
  lines.push(`- Features documentados: ${counts.features_documented ?? 0}`);
  lines.push('');
  lines.push('## Top tags');
  lines.push('');
  if (topTags.length === 0) {
    lines.push('_(ninguno — KB vacío)_');
  } else {
    for (const t of topTags) lines.push(`- \`${t}\``);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    '> Este archivo se regenera automáticamente por `knowledge-sync.ts` cada vez que se llama a `syncResource()`. No editar manualmente.'
  );
  lines.push('');
  fs.writeFileSync(headerPath, lines.join('\n'));
}

async function invalidateLLMCache(): Promise<void> {
  // TODO: wired in Fase 4 del PRD (prompt-assembler cache invalidation).
  // Phase 149 lo deja como no-op documentado.
  return;
}
