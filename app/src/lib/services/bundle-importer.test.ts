import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { validateManifest } from './bundle-importer';

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `bundle-importer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('bundle-importer', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tmpDirs.length = 0;
  });

  describe('validateManifest', () => {
    it('throws when manifest.json does not exist', () => {
      expect(() => validateManifest('/nonexistent/manifest.json')).toThrow(
        'manifest.json not found in bundle'
      );
    });

    it('throws when manifest.json contains invalid JSON', () => {
      const dir = makeTmpDir();
      tmpDirs.push(dir);
      const manifestPath = path.join(dir, 'manifest.json');
      fs.writeFileSync(manifestPath, '{ invalid json }');

      expect(() => validateManifest(manifestPath)).toThrow(
        'manifest.json contains invalid JSON'
      );
    });

    it('throws when bundle_version is missing', () => {
      const dir = makeTmpDir();
      tmpDirs.push(dir);
      const manifestPath = path.join(dir, 'manifest.json');
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          task: { id: '1', name: 'Test' },
        })
      );

      expect(() => validateManifest(manifestPath)).toThrow(
        'manifest.json missing required field: bundle_version'
      );
    });

    it('throws when task field is missing', () => {
      const dir = makeTmpDir();
      tmpDirs.push(dir);
      const manifestPath = path.join(dir, 'manifest.json');
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          bundle_version: '1.0',
        })
      );

      expect(() => validateManifest(manifestPath)).toThrow(
        'manifest.json missing required field: task (with name)'
      );
    });

    it('throws when task.name is missing', () => {
      const dir = makeTmpDir();
      tmpDirs.push(dir);
      const manifestPath = path.join(dir, 'manifest.json');
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          bundle_version: '1.0',
          task: { id: '1' },
        })
      );

      expect(() => validateManifest(manifestPath)).toThrow(
        'manifest.json missing required field: task (with name)'
      );
    });

    it('returns parsed manifest when all required fields present', () => {
      const dir = makeTmpDir();
      tmpDirs.push(dir);
      const manifestPath = path.join(dir, 'manifest.json');
      const validManifest = {
        bundle_version: '1.0',
        docatflow_version: '0.1.0',
        created_at: '2026-03-21T00:00:00Z',
        task: {
          id: 'task-1',
          name: 'My Test Task',
          description: 'A test task',
          execution_mode: 'single',
          execution_count: 0,
          schedule_config: null,
          steps_count: 2,
        },
        resources: {
          agents: [{ id: 'a1', name: 'Agent 1' }],
          canvases: [],
          skills: [],
        },
        docker_services: ['docflow', 'litellm'],
        credentials_needed: ['LITELLM_API_KEY'],
      };
      fs.writeFileSync(manifestPath, JSON.stringify(validManifest));

      const result = validateManifest(manifestPath);
      expect(result.bundle_version).toBe('1.0');
      expect(result.task.name).toBe('My Test Task');
      expect(result.task.steps_count).toBe(2);
      expect(result.resources.agents).toHaveLength(1);
    });

    it('accepts manifest with minimal valid fields', () => {
      const dir = makeTmpDir();
      tmpDirs.push(dir);
      const manifestPath = path.join(dir, 'manifest.json');
      fs.writeFileSync(
        manifestPath,
        JSON.stringify({
          bundle_version: '1.0',
          task: { name: 'Minimal Task' },
        })
      );

      const result = validateManifest(manifestPath);
      expect(result.bundle_version).toBe('1.0');
      expect(result.task.name).toBe('Minimal Task');
    });
  });
});
