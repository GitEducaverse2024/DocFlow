import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

const KNOWLEDGE_DIR = path.join(process.cwd(), 'data', 'knowledge');
const CATBOT_TOOLS_PATH = path.join(process.cwd(), 'src', 'lib', 'services', 'catbot-tools.ts');

// Files to exclude from tool sync checks
const EXCLUDE_FILES = ['_index.json', '_template.json'];

/**
 * Extract tool names from catbot-tools.ts by parsing the TOOLS array.
 * We parse the file instead of importing to avoid pulling in heavy DB dependencies.
 */
function extractToolNamesFromSource(): string[] {
  const source = fs.readFileSync(CATBOT_TOOLS_PATH, 'utf-8');
  const toolNames: string[] = [];
  // Match name: 'tool_name' patterns inside the TOOLS array
  const regex = /name:\s*'([a-z_]+)'/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    toolNames.push(match[1]);
  }
  return toolNames;
}

function getAllKnowledgeToolNames(): Set<string> {
  const allTools = new Set<string>();
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.json') && !EXCLUDE_FILES.includes(f));

  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (Array.isArray(raw.tools)) {
      for (const tool of raw.tools) {
        allTools.add(tool);
      }
    }
  }

  return allTools;
}

function getToolsByArea(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.json') && !EXCLUDE_FILES.includes(f));

  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (Array.isArray(raw.tools)) {
      map.set(file, raw.tools);
    }
  }

  return map;
}

describe('Knowledge Tree <-> CatBot Tools Bidirectional Sync', () => {
  const tsToolNames = extractToolNamesFromSource();

  it('extracts a reasonable number of tools from catbot-tools.ts', () => {
    expect(tsToolNames.length).toBeGreaterThan(40);
  });

  it('every TOOLS[] tool appears in at least one knowledge JSON', () => {
    const knowledgeTools = getAllKnowledgeToolNames();
    const missing = tsToolNames.filter(name => !knowledgeTools.has(name));

    expect(
      missing,
      `Tools in TOOLS[] but missing from all knowledge JSONs:\n${missing.join('\n')}`
    ).toEqual([]);
  });

  it('every knowledge JSON tool exists in TOOLS[]', () => {
    const knowledgeTools = getAllKnowledgeToolNames();
    const tsToolSet = new Set(tsToolNames);
    const phantoms = [...knowledgeTools].filter(name => !tsToolSet.has(name));

    expect(
      phantoms,
      `Phantom tools in knowledge JSONs (not in TOOLS[]):\n${phantoms.join('\n')}`
    ).toEqual([]);
  });

  it('no duplicate tool names across knowledge JSONs (warn)', () => {
    const toolsByArea = getToolsByArea();
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const [file, tools] of toolsByArea) {
      for (const tool of tools) {
        if (seen.has(tool)) {
          duplicates.push(`"${tool}" in both ${seen.get(tool)} and ${file}`);
        } else {
          seen.set(tool, file);
        }
      }
    }

    if (duplicates.length > 0) {
      console.warn(`Duplicate tools across JSONs:\n${duplicates.join('\n')}`);
    }
  });
});
