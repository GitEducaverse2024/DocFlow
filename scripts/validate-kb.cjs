#!/usr/bin/env node
/**
 * validate-kb.cjs — Valida todos los archivos .md de .docflow-kb/ contra el schema.
 * Uso: node scripts/validate-kb.cjs
 * Exit 0 si todo OK, exit 1 si algún archivo incumple.
 *
 * No usa dependencias npm — parser YAML mínimo inline + validación manual del schema.
 * Para el futuro, si se añade AJV al repo, reemplazar validateAgainstSchema() por AJV.compile().
 *
 * Scope:
 *   - Recorre .docflow-kb/**\/*.md
 *   - Excluye subdirectorio _archived/
 *   - Excluye stubs _header.md y _manual.md (no llevan frontmatter universal)
 *
 * Reglas validadas (subset del §3.3 del PRD + tag taxonomy §3.4):
 *   - 16 campos requeridos top-level (id, type, lang, title, summary, tags, audience,
 *     status, created_at, created_by, version, updated_at, updated_by, source_of_truth,
 *     change_log, ttl)
 *   - Enums: type, lang, status, ttl, audience
 *   - version semver M.m.p
 *   - Reglas condicionales: status=deprecated ⇒ deprecated_at/by/reason;
 *     ttl=managed ⇒ last_accessed_at + access_count;
 *     lang=es+en ⇒ title y summary son dict {es,en}
 *   - tags contra tag-taxonomy.json (un tag es válido si aparece en alguna categoría)
 *
 * Nota: la validación estricta del $ref/allOf de resource.schema.json se deja para
 * cuando se integre AJV como dependencia del repo. Esta fase cubre lo que exigen
 * KB-02 y KB-03 (frontmatter universal + tag taxonomy).
 */
const fs = require('fs');
const path = require('path');

const KB_ROOT = path.resolve(__dirname, '..', '.docflow-kb');
const SCHEMA_PATH = path.join(KB_ROOT, '_schema', 'frontmatter.schema.json');
const TAG_TAXONOMY_PATH = path.join(KB_ROOT, '_schema', 'tag-taxonomy.json');

// Archivos excluidos del validador (stubs y archived)
const EXCLUDED_FILENAMES = new Set(['_header.md', '_manual.md', '_sync_failures.md']);
const EXCLUDED_DIRS = new Set(['_archived']);

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const name of fs.readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walk(p, results);
    else if (name.endsWith('.md') && !EXCLUDED_FILENAMES.has(name)) results.push(p);
  }
  return results;
}

/**
 * Parser YAML mínimo — soporta el subset usado en el frontmatter universal del KB:
 *   - claves kebab/snake con valor scalar (string, number, bool, null)
 *   - listas inline: `key: [a, b, c]`
 *   - listas multiline de escalares: `key:\n  - item1\n  - item2`
 *   - listas multiline de dicts inline: `key:\n  - { k: v, k2: v2 }`
 *   - listas multiline de dicts multilinea: `key:\n  - k1: v1\n    k2: v2`
 *   - dicts nested 1 nivel: `key:\n  sub1: v1\n  sub2: v2`
 *   - dicts con valores que son listas: `key:\n  es: [a, b]\n  en: [c, d]`
 *   - fechas ISO como strings (no quoted)
 *   - strings quoted con " o '
 *
 * No soporta: anchors/aliases, multiline strings (| o >), flow style anidado profundo.
 */
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
    // Split por comas respetando corchetes/llaves/quotes
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

  // Split respetando anidamiento de [], {}, y quotes
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

  // Encuentra el primer `:` a nivel top (fuera de [], {}, quotes)
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

  // Parsea un bloque indentado (lista o dict) arrancando en el índice `i` con indent mínimo `minIndent`.
  // Devuelve { value, nextI }.
  function parseBlock(startI, parentIndent) {
    const out = {};
    const list = [];
    let mode = null; // 'list' | 'dict'
    let j = startI;

    while (j < lines.length) {
      const line = lines[j];
      if (!line.trim() || line.trim().startsWith('#')) { j++; continue; }
      const indent = getIndent(line);
      if (indent <= parentIndent) break;

      const trimmed = line.trim();

      if (trimmed.startsWith('- ')) {
        if (mode === 'dict') break; // cambio inesperado, abortamos
        mode = 'list';
        const itemStr = trimmed.slice(2);
        // ¿Es dict inline { ... }?
        if (itemStr.trim().startsWith('{') && itemStr.trim().endsWith('}')) {
          list.push(parseScalar(itemStr.trim()));
          j++;
          continue;
        }
        // ¿Empieza como "key: value" seguido de más líneas con mayor indent?
        const colonIdx = findTopLevelColon(itemStr);
        if (colonIdx !== -1) {
          // Dict multiline dentro de la lista
          const firstKey = itemStr.slice(0, colonIdx).trim();
          const firstVal = itemStr.slice(colonIdx + 1).trim();
          const itemDict = {};
          if (firstVal) {
            itemDict[firstKey] = parseScalar(firstVal);
          } else {
            const sub = parseBlock(j + 1, indent + 1);
            itemDict[firstKey] = sub.value;
            j = sub.nextI - 1; // ajustamos porque incrementaremos abajo
          }
          j++;
          // Leer líneas siguientes con indent > indent del `- ` y sin `- ` inicial → más campos del dict
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
        // Escalar simple
        list.push(parseScalar(itemStr));
        j++;
        continue;
      }

      // Clave: valor (dict)
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
        // Valor multiline — recurse
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
    if (indent > 0) { i++; continue; } // defensivo: seguir adelante

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

function extractFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { error: 'archivo sin frontmatter (no empieza con ---)', frontmatter: null };
  }
  // Buscar el segundo delimitador --- en su propia línea
  const lines = content.split('\n');
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIdx = i; break; }
  }
  if (endIdx === -1) return { error: 'frontmatter sin cierre ---', frontmatter: null };
  const yamlText = lines.slice(1, endIdx).join('\n');
  try {
    return { error: null, frontmatter: parseYAML(yamlText) };
  } catch (e) {
    return { error: `YAML parse error: ${e.message}`, frontmatter: null };
  }
}

function validateAgainstSchema(fm, schema, tagTaxonomy) {
  const errors = [];
  // Campos requeridos top-level
  for (const req of schema.required || []) {
    if (fm[req] === undefined) errors.push(`Falta campo requerido: ${req}`);
  }
  // Enum type
  const typeEnum = (schema.properties && schema.properties.type && schema.properties.type.enum) || [];
  if (fm.type !== undefined && typeEnum.length > 0 && !typeEnum.includes(fm.type)) {
    errors.push(`type "${fm.type}" fuera del enum`);
  }
  if (fm.lang !== undefined && !['es', 'en', 'es+en'].includes(fm.lang)) {
    errors.push(`lang "${fm.lang}" fuera del enum`);
  }
  if (fm.status !== undefined && !['active', 'deprecated', 'draft', 'experimental', 'archived'].includes(fm.status)) {
    errors.push(`status "${fm.status}" fuera del enum`);
  }
  if (fm.ttl !== undefined && !['never', 'managed', '30d', '180d'].includes(fm.ttl)) {
    errors.push(`ttl "${fm.ttl}" fuera del enum`);
  }
  // Condicionales: deprecated
  if (fm.status === 'deprecated') {
    for (const req of ['deprecated_at', 'deprecated_by', 'deprecated_reason']) {
      if (fm[req] === undefined || fm[req] === null || fm[req] === '') {
        errors.push(`status=deprecated requiere ${req}`);
      }
    }
  }
  // Condicionales: ttl managed
  if (fm.ttl === 'managed') {
    if (fm.last_accessed_at === undefined) errors.push(`ttl=managed requiere last_accessed_at`);
    if (fm.access_count === undefined) errors.push(`ttl=managed requiere access_count`);
  }
  // Condicionales: lang bilingüe ⇒ title/summary dict
  if (fm.lang === 'es+en') {
    if (typeof fm.title !== 'object' || !fm.title || Array.isArray(fm.title) || !fm.title.es || !fm.title.en) {
      errors.push(`lang=es+en requiere title como dict {es, en}`);
    }
    if (typeof fm.summary !== 'object' || !fm.summary || Array.isArray(fm.summary) || !fm.summary.es || !fm.summary.en) {
      errors.push(`lang=es+en requiere summary como dict {es, en}`);
    }
  }
  // Audience enum
  const audienceAllowed = ['catbot', 'architect', 'developer', 'user', 'onboarding'];
  if (Array.isArray(fm.audience)) {
    for (const a of fm.audience) {
      if (!audienceAllowed.includes(a)) errors.push(`audience "${a}" fuera del enum`);
    }
  }
  // Version semver
  if (fm.version !== undefined && typeof fm.version === 'string' && !/^\d+\.\d+\.\d+$/.test(fm.version)) {
    errors.push(`version "${fm.version}" no es semver M.m.p`);
  }
  // Tags contra taxonomía
  const allTags = new Set([
    ...(tagTaxonomy.domains || []),
    ...(tagTaxonomy.entities || []),
    ...(tagTaxonomy.modes || []),
    ...(tagTaxonomy.connectors || []),
    ...(tagTaxonomy.roles || []),
    ...(tagTaxonomy.departments || []),
    ...(tagTaxonomy.rules || []),
    ...(tagTaxonomy.cross_cutting || []),
  ]);
  if (Array.isArray(fm.tags)) {
    for (const t of fm.tags) {
      if (typeof t === 'string' && !allTags.has(t)) {
        errors.push(`tag "${t}" no está en tag-taxonomy.json`);
      }
    }
  }
  return errors;
}

function main() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`ERROR: ${SCHEMA_PATH} no existe`);
    process.exit(1);
  }
  if (!fs.existsSync(TAG_TAXONOMY_PATH)) {
    console.error(`ERROR: ${TAG_TAXONOMY_PATH} no existe`);
    process.exit(1);
  }
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const tagTaxonomy = JSON.parse(fs.readFileSync(TAG_TAXONOMY_PATH, 'utf8'));

  const files = walk(KB_ROOT);
  let errorsTotal = 0;
  for (const f of files) {
    const rel = path.relative(KB_ROOT, f);
    const { error, frontmatter } = extractFrontmatter(f);
    if (error) {
      console.error(`FAIL ${rel}: ${error}`);
      errorsTotal++;
      continue;
    }
    const errs = validateAgainstSchema(frontmatter, schema, tagTaxonomy);
    if (errs.length > 0) {
      console.error(`FAIL ${rel}:`);
      for (const e of errs) console.error(`  - ${e}`);
      errorsTotal++;
    }
  }
  if (errorsTotal > 0) {
    console.error(`\nFAILED: ${errorsTotal}/${files.length} archivos no cumplen el schema`);
    process.exit(1);
  }
  console.log(`OK: ${files.length} archivos validados`);
  process.exit(0);
}

main();
