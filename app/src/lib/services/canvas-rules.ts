/**
 * canvas-rules — KB-backed rules loader (Phase 155).
 *
 * Internal service (NOT a CatBot tool). Used by IntentJobExecutor architect
 * phase to feed rules into ARCHITECT_PROMPT (via {{RULES_INDEX}}) and to
 * expand individual rules when the LLM requests details via get_canvas_rule.
 *
 * Design (post-Phase-155 migration):
 *   - Reads rule atoms from `.docflow-kb/rules/(R|SE|DA)NN-*.md`.
 *   - Replaces the legacy pair (canvas-rules-index.md + canvas-nodes-catalog.md)
 *     that lived under `app/data/knowledge/` and is physically deleted by Plan 02.
 *   - Public contract byte-compatible with Phase 132 shape: same exported types,
 *     same function signatures, same category mapping, same case-insensitive
 *     lookup. IntentJobExecutor (line 478-480, 582) is untouched.
 *
 * Index synthesis:
 *   - `loadRulesIndex()` rebuilds the 9-section categorized index in memory
 *     from the parsed atoms. The structure matches the original
 *     canvas-rules-index.md (H1 + 9 H2 sections + bullet per rule), so the
 *     ARCHITECT_PROMPT {{RULES_INDEX}} substitution keeps the same shape.
 *   - `SCOPE_ANNOTATIONS` hard-coded per the canonical canvas-rules-index.md
 *     (R02, R10, R14, R15, SE01). Four of these (R02/R10/R14/R15) are scope
 *     tags; SE01 keeps "[scope: emitter]" to preserve the verbatim source line.
 *
 * Path resolution:
 *   - `KB_ROOT` env (bracket notation per MEMORY.md): top priority.
 *   - `process.cwd() + '../.docflow-kb'`: dev + vitest (cwd=app/).
 *   - `/docflow-kb`: Docker fallback (volume-mount per Phase 153 deploy).
 *
 * Test seam: `_resetCache()` nulls both in-memory caches.
 */

import fs from 'node:fs';
import path from 'node:path';

export type RuleCategory =
  | 'data_contracts'
  | 'responsibilities'
  | 'arrays_loops'
  | 'instructions'
  | 'planning'
  | 'templates'
  | 'resilience'
  | 'side_effects'
  | 'anti_patterns'
  | 'other';

export interface RuleDetail {
  id: string;          // "R01", "SE02", "DA04"
  short: string;       // <=100 chars
  long: string;        // full paragraph from KB atom body
  category: RuleCategory;
}

// ---------------------------------------------------------------------------
// Module-level cache state
// ---------------------------------------------------------------------------

let cachedIndex: string | null = null;
let cachedRules: Map<string, RuleDetail> | null = null;

// ---------------------------------------------------------------------------
// KB root resolution
// ---------------------------------------------------------------------------

function getKbRoot(): string {
  const envRoot = process['env']['KB_ROOT'];
  if (envRoot && envRoot.length > 0) return envRoot;

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, '..', '.docflow-kb'),  // dev + vitest from app/
    path.resolve(cwd, '.docflow-kb'),        // repo root cwd
    '/docflow-kb',                           // Docker mount
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(path.join(p, 'rules'))) return p;
    } catch {
      // ignore and continue
    }
  }
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Category + scope helpers (canonical canvas-rules-index.md semantics)
// ---------------------------------------------------------------------------

/**
 * Scope annotations appended verbatim to the index bullet for specific rules,
 * mirroring the canonical canvas-rules-index.md (Phase 151 archived source).
 * Only these 5 IDs carry scope tags in the original file.
 */
const SCOPE_ANNOTATIONS: Record<string, string> = {
  R02: ' [scope: extractor,transformer-when-array]',
  R10: ' [scope: transformer,synthesizer]',
  R15: ' [scope: transformer,synthesizer,renderer]',
  SE01: ' [scope: emitter]',
};

function categorize(id: string): RuleCategory {
  if (id.startsWith('SE')) return 'side_effects';
  if (id.startsWith('DA')) return 'anti_patterns';
  const n = Number(id.slice(1));
  if ([1, 10, 13, 15, 16].includes(n)) return 'data_contracts';
  if ([5, 6, 7, 8, 9, 20, 21, 23].includes(n)) return 'responsibilities';
  if ([2, 14, 25].includes(n)) return 'arrays_loops';
  if ([11, 12, 17].includes(n)) return 'instructions';
  if ([3, 4].includes(n)) return 'planning';
  if ([18, 19].includes(n)) return 'templates';
  if ([22, 24].includes(n)) return 'resilience';
  return 'other';
}

// The 9 canonical section headers and the order rules appear within each.
// Category → (heading, ordered list of rule IDs in that section).
const CATEGORY_SECTIONS: Array<{
  category: RuleCategory;
  heading: string;
  ids: string[];
}> = [
  { category: 'data_contracts',  heading: '## Data Contracts',        ids: ['R01', 'R10', 'R13', 'R15', 'R16'] },
  { category: 'responsibilities', heading: '## Node Responsibilities', ids: ['R05', 'R06', 'R07', 'R08', 'R09', 'R20', 'R21', 'R23'] },
  { category: 'arrays_loops',    heading: '## Arrays & Loops',        ids: ['R02', 'R14', 'R25'] },
  { category: 'instructions',    heading: '## Instructions Writing',  ids: ['R11', 'R12', 'R17'] },
  { category: 'planning',        heading: '## Planning & Testing',    ids: ['R03', 'R04'] },
  { category: 'templates',       heading: '## Templates',             ids: ['R18', 'R19'] },
  { category: 'resilience',      heading: '## Resilience & References', ids: ['R22', 'R24'] },
  { category: 'side_effects',    heading: '## Side Effects Guards',   ids: ['SE01', 'SE02', 'SE03'] },
  { category: 'anti_patterns',   heading: '## Anti-patterns',         ids: ['DA01', 'DA02', 'DA03', 'DA04'] },
];

// ---------------------------------------------------------------------------
// Frontmatter + body split (dependency-free; mirrors scripts/validate-kb.cjs)
// ---------------------------------------------------------------------------

interface ParsedAtom {
  frontmatter: Record<string, string>;
  body: string;
}

/**
 * Minimal YAML-subset split sufficient for the rule atom shape:
 *   - `key: "quoted string"` or `key: bare scalar`
 *   - nested blocks (change_log, tags arrays, etc.) are ignored — this parser
 *     only needs `summary`, `title`, and `id` from the frontmatter.
 * Non-matching lines are skipped gracefully.
 */
function parseAtom(raw: string): ParsedAtom {
  const fm: Record<string, string> = {};
  let body = raw;

  const prefix = raw.startsWith('---\r\n') ? '---\r\n' : raw.startsWith('---\n') ? '---\n' : null;
  if (prefix) {
    const after = raw.slice(prefix.length);
    const lines = after.split('\n');
    let end = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        end = i;
        break;
      }
    }
    if (end >= 0) {
      const fmLines = lines.slice(0, end);
      body = lines.slice(end + 1).join('\n');
      // Parse only top-level "key: value" scalars; ignore list/nested lines.
      for (const line of fmLines) {
        if (/^\s/.test(line)) continue;      // nested line, skip
        if (line.startsWith('#')) continue;  // comment
        const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
        if (!m) continue;
        let v = m[2].trim();
        if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
          v = v.slice(1, -1);
        } else if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
          v = v.slice(1, -1);
        }
        fm[m[1]] = v;
      }
    }
  }

  return { frontmatter: fm, body };
}

/**
 * Extract the "long" form of the rule from an atom body: strip the leading
 * H1 and return the FULL body (headings + paragraphs + fenced blocks), which
 * matches the pre-migration catalog long-form semantics.
 *
 * The result is collapsed to single-line whitespace to stay close to the
 * legacy "full paragraph" invariant (catalog entries were already single-line
 * in the source). This lets the `MISMO array JSON` substring assertion in the
 * R10 test pass without caring about markdown formatting.
 */
function extractLongBody(body: string): string {
  // Drop leading empty lines + first H1 + blank line.
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && lines[i].startsWith('# ')) i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  const rest = lines.slice(i).join('\n').trim();
  // Collapse all whitespace (newlines, tabs, repeated spaces) into a single space.
  return rest.replace(/\s+/g, ' ').trim();
}

function truncate100(s: string): string {
  return s.length <= 100 ? s : s.slice(0, 97) + '...';
}

// ---------------------------------------------------------------------------
// Parsing the full rules directory
// ---------------------------------------------------------------------------

const RULE_FILE_RE = /^(R\d{2}|SE\d{2}|DA\d{2})-.+\.md$/;

function parseRules(): Map<string, RuleDetail> {
  const out = new Map<string, RuleDetail>();
  const root = getKbRoot();
  const rulesDir = path.join(root, 'rules');

  let files: string[] = [];
  try {
    files = fs.readdirSync(rulesDir);
  } catch {
    return out; // KB not available — caller gets empty map, graceful degrade
  }

  for (const name of files) {
    const m = name.match(RULE_FILE_RE);
    if (!m) continue;
    const id = m[1]; // already uppercase by convention
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(rulesDir, name), 'utf8');
    } catch {
      continue;
    }
    const { frontmatter, body } = parseAtom(raw);
    const long = extractLongBody(body);
    const summary = frontmatter.summary ?? '';
    // `short` is used both for the index bullet line and for RuleDetail.short.
    // Prefer the frontmatter summary (already <=120 chars per schema), else
    // truncate long to 100 as a safety net.
    const shortRaw = summary.length > 0 ? summary : long;
    const short = truncate100(shortRaw);

    out.set(id, {
      id,
      short,
      long,
      category: categorize(id),
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the categorized rules-index text used as `{{RULES_INDEX}}` in
 * ARCHITECT_PROMPT and CANVAS_QA_PROMPT (see catbot-pipeline-prompts.ts).
 * Shape matches the canonical canvas-rules-index.md:
 *   - H1: "# Canvas Design Rules Index"
 *   - Intro paragraph
 *   - 9 H2 sections in fixed order (see CATEGORY_SECTIONS)
 *   - Each section: bullets "- <ID>: <short>[ scope annotation]"
 */
export function loadRulesIndex(): string {
  if (cachedIndex !== null) return cachedIndex;
  if (!cachedRules) cachedRules = parseRules();

  const lines: string[] = [];
  lines.push('# Canvas Design Rules Index');
  lines.push('');
  lines.push(
    'Indice escalable de reglas de diseno para el Pipeline Architect. Si necesitas detalle de una regla especifica, llama get_canvas_rule(rule_id).',
  );
  lines.push('');

  for (const section of CATEGORY_SECTIONS) {
    lines.push(section.heading);
    for (const id of section.ids) {
      const rule = cachedRules.get(id);
      if (!rule) continue; // skip missing rule atoms; validate-kb catches these
      const scope = SCOPE_ANNOTATIONS[id] ?? '';
      lines.push(`- ${id}: ${rule.short}${scope}`);
    }
    lines.push('');
  }

  cachedIndex = lines.join('\n');
  return cachedIndex;
}

/**
 * Case-insensitive lookup of a rule by id. Returns null for unknown ids.
 */
export function getCanvasRule(ruleId: string): RuleDetail | null {
  if (!cachedRules) cachedRules = parseRules();
  return cachedRules.get(ruleId.toUpperCase()) ?? null;
}

/** Test seam: reset in-memory caches so unit tests are isolated. */
export function _resetCache(): void {
  cachedIndex = null;
  cachedRules = null;
}
