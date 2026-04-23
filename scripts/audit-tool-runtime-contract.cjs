#!/usr/bin/env node
// v30.9 P1 — Auditoria del contrato tool MCP ↔ runtime canvas-executor.
//
// Problema: el patron "info runtime inaccesible via tool LLM" ha recurrido 6 veces
// (v30.4-v30.8). El executor lee ~45 fields de node.data pero canvas_add_node solo
// expone ~14 top-level. Este script parsea ambos lados, produce whitelist por
// nodeType, y en --verify falla si hay drift no-documentado (uso en CI).
//
// Uso:
//   node scripts/audit-tool-runtime-contract.cjs              # Imprime tabla + resumen
//   node scripts/audit-tool-runtime-contract.cjs --write      # Regenera whitelist JSON
//   node scripts/audit-tool-runtime-contract.cjs --verify     # Exit 1 si drift
//   node scripts/audit-tool-runtime-contract.cjs --json       # Output JSON
//
// Variables: EXECUTOR_PATH, TOOLS_PATH (override defaults repo-relative).

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXECUTOR = process['env']['EXECUTOR_PATH']
  || path.join(REPO_ROOT, 'app/src/lib/services/canvas-executor.ts');
const TOOLS = process['env']['TOOLS_PATH']
  || path.join(REPO_ROOT, 'app/src/lib/services/catbot-tools.ts');
const WHITELIST_OUT = path.join(REPO_ROOT, '.docflow-kb/generated/node-data-whitelist.json');
const WHITELIST_TS_OUT = path.join(REPO_ROOT, 'app/src/lib/generated/node-data-whitelist.ts');

const MODE_WRITE = process.argv.includes('--write');
const MODE_VERIFY = process.argv.includes('--verify');
const MODE_JSON = process.argv.includes('--json');

// ---------------------------------------------------------------------------
// Runtime parsing (canvas-executor.ts)
// ---------------------------------------------------------------------------

/**
 * Parse the dispatchNode switch block and extract data.X references per case.
 * Returns { nodeType: Set<fieldNames> }.
 */
function parseRuntimeCases(src) {
  const cases = {};

  // Locate the dispatchNode function and its switch (node.type) block.
  const switchStart = src.search(/switch\s*\(\s*node\.type\s*\)\s*\{/);
  if (switchStart < 0) {
    throw new Error('switch(node.type) not found in executor — parser needs update');
  }

  // Walk the switch body balancing braces.
  let depth = 0;
  let i = switchStart;
  while (src[i] !== '{') i++;
  const bodyStart = i;
  depth = 1;
  i++;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  const bodyEnd = i;
  const switchBody = src.slice(bodyStart + 1, bodyEnd);

  // Split on `case 'X':` — each segment belongs to that nodeType.
  const caseRegex = /case\s+['"]([a-z_]+)['"]\s*:\s*\{/g;
  const caseStarts = [];
  let m;
  while ((m = caseRegex.exec(switchBody)) !== null) {
    caseStarts.push({ nodeType: m[1], start: m.index, bodyStart: m.index + m[0].length });
  }

  for (let k = 0; k < caseStarts.length; k++) {
    const { nodeType, bodyStart: caseBodyStart } = caseStarts[k];
    // The case body is a `{...}` that ends at matching `}`. Walk balanced.
    let d = 1;
    let j = caseBodyStart;
    while (j < switchBody.length && d > 0) {
      if (switchBody[j] === '{') d++;
      else if (switchBody[j] === '}') d--;
      if (d === 0) break;
      j++;
    }
    const caseSrc = switchBody.slice(caseBodyStart, j);

    // Extract data.X references.
    const fieldRegex = /\bdata\.([a-zA-Z_][a-zA-Z_0-9]*)/g;
    const fields = new Set();
    let fm;
    while ((fm = fieldRegex.exec(caseSrc)) !== null) {
      fields.add(fm[1]);
    }
    if (!cases[nodeType]) cases[nodeType] = new Set();
    for (const f of fields) cases[nodeType].add(f);
  }

  return cases;
}

// ---------------------------------------------------------------------------
// Tool schema parsing (catbot-tools.ts)
// ---------------------------------------------------------------------------

/**
 * Extract the top-level property keys of canvas_add_node parameters.
 */
function parseToolTopLevelFields(src) {
  const m = src.match(/name:\s*'canvas_add_node'[\s\S]*?parameters:\s*\{[\s\S]*?properties:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*required:/);
  if (!m) throw new Error('canvas_add_node parameters.properties block not found');
  const propsBlock = m[1];
  // Keys are lines starting with `  WORD: {`
  const keys = new Set();
  const keyRegex = /^\s{10,}([a-zA-Z_][a-zA-Z_0-9]*)\s*:\s*\{/gm;
  let km;
  while ((km = keyRegex.exec(propsBlock)) !== null) {
    keys.add(km[1]);
  }
  // Fallback / alternative indentation
  if (keys.size === 0) {
    const loose = /^[\s]+([a-zA-Z_][a-zA-Z_0-9]*)\s*:\s*\{\s*type:/gm;
    while ((km = loose.exec(propsBlock)) !== null) keys.add(km[1]);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Translation layer: map tool schema params → node.data keys when different.
// canvas_add_node has aliases (extra_skill_ids → skills, etc.)
// ---------------------------------------------------------------------------

const TOOL_TO_DATA_ALIAS = {
  extra_skill_ids: 'skills',
  extra_connector_ids: 'extraConnectors',
  // Gateway-level params the tool expects but the handler translates:
  // (label, positionX, positionY, insert_between, canvasId, nodeType) are meta,
  // not data.X; filtered out below.
};

const META_TOOL_PARAMS = new Set([
  'canvasId', 'nodeType', 'label', 'nodeId',
  'positionX', 'positionY', 'insert_between',
  'data_extra', // this milestone — the generic escape hatch itself.
]);

/**
 * Convert tool top-level fields set → set of node.data keys they map to.
 */
function translateToolFieldsToDataKeys(toolFields) {
  const dataKeys = new Set();
  for (const f of toolFields) {
    if (META_TOOL_PARAMS.has(f)) continue;
    dataKeys.add(TOOL_TO_DATA_ALIAS[f] || f);
  }
  return dataKeys;
}

// ---------------------------------------------------------------------------
// Filter: runtime fields that aren't meaningful for the whitelist.
// Some fields are *outputs set by the executor at runtime*, not inputs from
// canvas_add_node. Filter these — they don't need data_extra.
// ---------------------------------------------------------------------------

const RUNTIME_ONLY_FIELDS = new Set([
  // Set by executor/UI, not inputs the LLM should pass:
  'executionStatus', 'progress', 'tokens', 'duration_ms',
  // Iterator internal state (managed by executor loop, not user-settable):
  'iterator_state', 'scheduler_counts', 'scheduler_waiting', 'usage',
]);

// ---------------------------------------------------------------------------
// Diff + whitelist generation
// ---------------------------------------------------------------------------

function buildWhitelist(runtimeCases, toolDataKeys) {
  const dataExtraByNodeType = {};
  const allRuntimeFields = new Set();

  for (const [nodeType, fieldsSet] of Object.entries(runtimeCases)) {
    const missing = [];
    for (const field of Array.from(fieldsSet).sort()) {
      if (RUNTIME_ONLY_FIELDS.has(field)) continue;
      allRuntimeFields.add(field);
      if (!toolDataKeys.has(field)) {
        missing.push(field);
      }
    }
    if (missing.length > 0) {
      dataExtraByNodeType[nodeType] = missing;
    }
  }

  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    generated_by: 'scripts/audit-tool-runtime-contract.cjs',
    description: 'Fields de node.data que deben pasarse via data_extra en canvas_add_node/canvas_update_node, organizados por nodeType. Auto-generado — NO editar a mano. Regenerar con --write tras cambios en canvas-executor.ts.',
    top_level_tool_fields: Array.from(toolDataKeys).sort(),
    data_extra_by_nodetype: dataExtraByNodeType,
    runtime_fields_total: allRuntimeFields.size,
    nodetypes_with_gaps: Object.keys(dataExtraByNodeType).length,
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(whitelist) {
  console.log('');
  console.log('=== Tool MCP ↔ Runtime contract audit ===');
  console.log(`executor:  ${EXECUTOR}`);
  console.log(`tools:     ${TOOLS}`);
  console.log('');
  console.log(`Top-level tool data fields (canvas_add_node exposes directly): ${whitelist.top_level_tool_fields.length}`);
  for (const f of whitelist.top_level_tool_fields) console.log(`  ✓ ${f}`);
  console.log('');
  console.log(`Runtime fields by nodeType that need data_extra (gap):`);
  for (const [nt, fields] of Object.entries(whitelist.data_extra_by_nodetype)) {
    console.log(`  [${nt}] ${fields.length} fields: ${fields.join(', ')}`);
  }
  console.log('');
  console.log(`Totals: ${whitelist.runtime_fields_total} runtime fields, ${whitelist.nodetypes_with_gaps} nodeTypes with gaps`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const executorSrc = fs.readFileSync(EXECUTOR, 'utf-8');
  const toolsSrc = fs.readFileSync(TOOLS, 'utf-8');

  const runtimeCases = parseRuntimeCases(executorSrc);
  const toolFields = parseToolTopLevelFields(toolsSrc);
  const toolDataKeys = translateToolFieldsToDataKeys(toolFields);
  const whitelist = buildWhitelist(runtimeCases, toolDataKeys);

  if (MODE_JSON) {
    console.log(JSON.stringify(whitelist, null, 2));
    return;
  }

  if (MODE_WRITE) {
    // 1) Canonical JSON in KB for humans + CI.
    const outDir = path.dirname(WHITELIST_OUT);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(WHITELIST_OUT, JSON.stringify(whitelist, null, 2) + '\n', 'utf-8');
    console.log(`✓ Whitelist written: ${WHITELIST_OUT}`);

    // 2) Mirror TS export inside app/ (inside Docker build context).
    const tsDir = path.dirname(WHITELIST_TS_OUT);
    if (!fs.existsSync(tsDir)) fs.mkdirSync(tsDir, { recursive: true });
    const tsContent = `// AUTO-GENERATED by scripts/audit-tool-runtime-contract.cjs — do not edit.
// Mirror of .docflow-kb/generated/node-data-whitelist.json within the Docker build
// context so catbot-tools.ts can import it at runtime.
// Regenerate with: node scripts/audit-tool-runtime-contract.cjs --write

export type NodeDataWhitelist = {
  version: string;
  generated_at: string;
  generated_by: string;
  description: string;
  top_level_tool_fields: string[];
  data_extra_by_nodetype: Record<string, string[]>;
  runtime_fields_total: number;
  nodetypes_with_gaps: number;
};

export const NODE_DATA_WHITELIST: NodeDataWhitelist = ${JSON.stringify(whitelist, null, 2)};
`;
    fs.writeFileSync(WHITELIST_TS_OUT, tsContent, 'utf-8');
    console.log(`✓ TS mirror written: ${WHITELIST_TS_OUT}`);
    console.log(`  ${whitelist.runtime_fields_total} runtime fields across ${whitelist.nodetypes_with_gaps} nodeTypes with gaps`);
    return;
  }

  if (MODE_VERIFY) {
    if (!fs.existsSync(WHITELIST_OUT)) {
      console.error(`✗ Whitelist not found at ${WHITELIST_OUT}. Run with --write first.`);
      process.exit(1);
    }
    const stored = JSON.parse(fs.readFileSync(WHITELIST_OUT, 'utf-8'));
    const drift = [];
    // Compare data_extra_by_nodetype structurally, ignoring generated_at.
    const cur = whitelist.data_extra_by_nodetype;
    const old = stored.data_extra_by_nodetype || {};
    const allNodeTypes = new Set([...Object.keys(cur), ...Object.keys(old)]);
    for (const nt of allNodeTypes) {
      const curSet = new Set(cur[nt] || []);
      const oldSet = new Set(old[nt] || []);
      const added = [...curSet].filter(f => !oldSet.has(f));
      const removed = [...oldSet].filter(f => !curSet.has(f));
      if (added.length) drift.push(`  [${nt}] ADDED (runtime added field not in whitelist): ${added.join(', ')}`);
      if (removed.length) drift.push(`  [${nt}] REMOVED (runtime no longer uses field): ${removed.join(', ')}`);
    }
    if (drift.length === 0) {
      console.log('✓ Whitelist in sync with runtime.');
      process.exit(0);
    } else {
      console.error('✗ DRIFT detected between runtime and committed whitelist:');
      for (const line of drift) console.error(line);
      console.error('');
      console.error('Fix: run `node scripts/audit-tool-runtime-contract.cjs --write` and commit the regenerated whitelist.');
      process.exit(1);
    }
  }

  printReport(whitelist);
}

try {
  main();
} catch (err) {
  console.error('FATAL:', err.message);
  process.exit(2);
}
