import { z } from 'zod';
import path from 'path';
import fs from 'fs';

// --- Zod Schemas ---

const CommonErrorSchema = z.object({
  error: z.string(),
  cause: z.string(),
  solution: z.string(),
});

export const KnowledgeEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  description: z.string(),
  endpoints: z.array(z.string()),
  tools: z.array(z.string()),
  concepts: z.array(z.string()),
  howto: z.array(z.string()),
  dont: z.array(z.string()),
  common_errors: z.array(CommonErrorSchema),
  success_cases: z.array(z.string()),
  sources: z.array(z.string()),
  updated_at: z.string(),
});

export const KnowledgeIndexSchema = z.object({
  version: z.string(),
  updated: z.string(),
  areas: z.array(z.object({
    id: z.string(),
    file: z.string(),
    name: z.string(),
    description: z.string(),
    updated_at: z.string(),
  })),
});

// --- TypeScript Types ---

export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;
export type KnowledgeIndex = z.infer<typeof KnowledgeIndexSchema>;

// --- Module-level cache ---

const indexCache: { value: KnowledgeIndex | null } = { value: null };
const areaCache = new Map<string, KnowledgeEntry>();

// --- Helper ---

function getKnowledgeDir(): string {
  return path.join(process.cwd(), 'data', 'knowledge');
}

// --- Public API ---

/**
 * Load and validate _index.json. Cached in memory after first read.
 */
export function loadKnowledgeIndex(): KnowledgeIndex {
  if (indexCache.value) return indexCache.value;

  const indexPath = path.join(getKnowledgeDir(), '_index.json');
  const raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const parsed = KnowledgeIndexSchema.parse(raw);
  indexCache.value = parsed;
  return parsed;
}

/**
 * Load and validate a single knowledge area by id. Cached in memory after first read.
 * Throws if id is not found in the index.
 */
export function loadKnowledgeArea(id: string): KnowledgeEntry {
  const cached = areaCache.get(id);
  if (cached) return cached;

  const index = loadKnowledgeIndex();
  const areaRef = index.areas.find(a => a.id === id);
  if (!areaRef) {
    throw new Error(`Knowledge area not found: ${id}`);
  }

  const filePath = path.join(getKnowledgeDir(), areaRef.file);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const parsed = KnowledgeEntrySchema.parse(raw);
  areaCache.set(id, parsed);
  return parsed;
}

/**
 * Load all knowledge areas from the index. Each entry is validated individually.
 */
export function getAllKnowledgeAreas(): KnowledgeEntry[] {
  const index = loadKnowledgeIndex();
  return index.areas.map(a => loadKnowledgeArea(a.id));
}
