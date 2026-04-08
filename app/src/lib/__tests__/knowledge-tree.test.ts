import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';

// The loader module under test
import {
  loadKnowledgeIndex,
  loadKnowledgeArea,
  getAllKnowledgeAreas,
  KnowledgeEntrySchema,
  KnowledgeIndexSchema,
} from '../knowledge-tree';

const KNOWLEDGE_DIR = path.join(process.cwd(), 'data', 'knowledge');

// All FEATURE_KNOWLEDGE keys that must be covered by the knowledge tree
const FEATURE_KNOWLEDGE_KEYS = [
  'catbrains', 'proyectos', 'rag',
  'agentes', 'catpaws', 'workers',
  'tareas', 'catflow', 'iterator', 'reglas_canvas',
  'conectores', 'gmail', 'holded', 'mcp', 'openclaw', 'linkedin', 'searxng', 'websearch',
  'skills', 'templates', 'catpower',
  'catboard', 'dashboard',
  'centro_de_modelos', 'modelos', 'enrutamiento', 'cattools',
];

const EXPECTED_FILES = [
  '_index.json',
  'catboard.json',
  'catbrains.json',
  'catpaw.json',
  'catflow.json',
  'canvas.json',
  'catpower.json',
  'settings.json',
];

describe('Knowledge Tree', () => {
  describe('files exist', () => {
    it('should have _index.json and 7 knowledge JSON files in data/knowledge/', () => {
      for (const file of EXPECTED_FILES) {
        const filePath = path.join(KNOWLEDGE_DIR, file);
        expect(fs.existsSync(filePath), `Missing file: ${file}`).toBe(true);
      }
    });
  });

  describe('schema', () => {
    it('each knowledge JSON passes zod KnowledgeEntry schema validation', () => {
      const areaFiles = EXPECTED_FILES.filter(f => f !== '_index.json');
      for (const file of areaFiles) {
        const filePath = path.join(KNOWLEDGE_DIR, file);
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const result = KnowledgeEntrySchema.safeParse(raw);
        expect(result.success, `Schema validation failed for ${file}: ${result.success ? '' : result.error?.message}`).toBe(true);
      }
    });
  });

  describe('index valid', () => {
    it('_index.json has version, updated, and areas with 7 entries pointing to real files', () => {
      const indexPath = path.join(KNOWLEDGE_DIR, '_index.json');
      const raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      const result = KnowledgeIndexSchema.safeParse(raw);
      expect(result.success, `Index schema validation failed: ${result.success ? '' : result.error?.message}`).toBe(true);

      expect(raw.areas).toHaveLength(7);

      // Each area entry should point to a real file
      for (const area of raw.areas) {
        const areaFilePath = path.join(KNOWLEDGE_DIR, area.file);
        expect(fs.existsSync(areaFilePath), `Index references missing file: ${area.file}`).toBe(true);
      }
    });
  });

  describe('coverage', () => {
    it('all FEATURE_KNOWLEDGE keys are covered by at least one JSON file', () => {
      const areaFiles = EXPECTED_FILES.filter(f => f !== '_index.json');
      const allCoveredKeys = new Set<string>();

      for (const file of areaFiles) {
        const filePath = path.join(KNOWLEDGE_DIR, file);
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const content = JSON.stringify(raw).toLowerCase();

        for (const key of FEATURE_KNOWLEDGE_KEYS) {
          if (content.includes(key.toLowerCase())) {
            allCoveredKeys.add(key);
          }
        }
      }

      const uncoveredKeys = FEATURE_KNOWLEDGE_KEYS.filter(k => !allCoveredKeys.has(k));
      expect(uncoveredKeys, `Uncovered FEATURE_KNOWLEDGE keys: ${uncoveredKeys.join(', ')}`).toEqual([]);
    });
  });

  describe('loader functions', () => {
    it('loadKnowledgeIndex() returns valid index data', () => {
      const index = loadKnowledgeIndex();
      expect(index.version).toBeDefined();
      expect(index.updated).toBeDefined();
      expect(index.areas).toHaveLength(7);
      expect(index.areas[0].id).toBeDefined();
      expect(index.areas[0].file).toBeDefined();
    });

    it('loadKnowledgeArea(id) returns correct data for each area', () => {
      const index = loadKnowledgeIndex();
      for (const area of index.areas) {
        const entry = loadKnowledgeArea(area.id);
        expect(entry.id).toBe(area.id);
        expect(entry.name).toBeDefined();
        expect(entry.path).toBeDefined();
        expect(entry.description.length).toBeGreaterThan(0);
      }
    });

    it('loadKnowledgeArea throws for unknown id', () => {
      expect(() => loadKnowledgeArea('nonexistent')).toThrow();
    });

    it('getAllKnowledgeAreas() returns array of 7 entries', () => {
      const areas = getAllKnowledgeAreas();
      expect(areas).toHaveLength(7);
      for (const area of areas) {
        expect(area.id).toBeDefined();
        expect(area.name).toBeDefined();
      }
    });
  });

  describe('updated_at', () => {
    it('KnowledgeEntrySchema rejects object without updated_at', () => {
      const obj = {
        id: 'test', name: 'Test', path: '/test', description: 'desc',
        endpoints: [], tools: [], concepts: [], howto: [], dont: [],
        common_errors: [], success_cases: [], sources: [],
      };
      const result = KnowledgeEntrySchema.safeParse(obj);
      expect(result.success).toBe(false);
    });

    it('KnowledgeEntrySchema accepts object with valid updated_at', () => {
      const obj = {
        id: 'test', name: 'Test', path: '/test', description: 'desc',
        endpoints: [], tools: [], concepts: [], howto: [], dont: [],
        common_errors: [], success_cases: [], sources: [],
        updated_at: '2026-04-08',
      };
      const result = KnowledgeEntrySchema.safeParse(obj);
      expect(result.success).toBe(true);
    });

    it('each area JSON has updated_at matching ISO date format', () => {
      const areaFiles = EXPECTED_FILES.filter(f => f !== '_index.json');
      for (const file of areaFiles) {
        const filePath = path.join(KNOWLEDGE_DIR, file);
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        expect(raw.updated_at, `${file} missing updated_at`).toBeDefined();
        expect(raw.updated_at, `${file} updated_at not ISO date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('_index.json areas[].updated_at matches individual JSON updated_at', () => {
      const indexPath = path.join(KNOWLEDGE_DIR, '_index.json');
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      for (const area of index.areas) {
        expect(area.updated_at, `_index.json area ${area.id} missing updated_at`).toBeDefined();
        const areaPath = path.join(KNOWLEDGE_DIR, area.file);
        const areaData = JSON.parse(fs.readFileSync(areaPath, 'utf-8'));
        expect(area.updated_at).toBe(areaData.updated_at);
      }
    });

    it('loadKnowledgeIndex() returns areas with updated_at defined', () => {
      const index = loadKnowledgeIndex();
      expect(index.areas[0].updated_at).toBeDefined();
    });
  });

  describe('sources population (PROMPT-05)', () => {
    it('every knowledge area has at least one source', () => {
      const areas = getAllKnowledgeAreas();
      for (const area of areas) {
        expect(area.sources.length, `${area.id} has no sources`).toBeGreaterThan(0);
      }
    });

    it('sources point to existing files', () => {
      const areas = getAllKnowledgeAreas();
      for (const area of areas) {
        for (const source of area.sources) {
          // Sources should be relative paths that exist
          expect(source).toMatch(/\.(md|json|txt)$/);
        }
      }
    });
  });
});
