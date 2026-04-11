import { describe, it, expect, beforeAll, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Phase 137-07 (gap closure): architect self-healing failure classifier.
//
// Task 1 RED:
//   1. intent_jobs must gain 4 new nullable TEXT columns on import (idempotent):
//      failure_class, config_overrides, architect_iter0_raw, parent_job_id
//   2. classifyArchitectFailure helper must bucket any architect error into
//      one of: truncated_json | parse_error | qa_rejected | llm_error | other
//
// The test uses a temp DB so the real catbot.db is never touched.
// ---------------------------------------------------------------------------

vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodePath = require('path');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeOs = require('os');
  const tmpDir = nodeFs.mkdtempSync(
    nodePath.join(nodeOs.tmpdir(), 'catbot-137-07-classifier-test-'),
  );
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmpDir, 'catbot-test.db');
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

type DbModule = typeof import('@/lib/catbot-db');
type ClassifierModule = typeof import('@/lib/services/intent-job-failure-classifier');

let catbotDbRef: DbModule['catbotDb'];
let classifyArchitectFailure: ClassifierModule['classifyArchitectFailure'];

beforeAll(async () => {
  const dbMod = await import('@/lib/catbot-db');
  catbotDbRef = dbMod.catbotDb;
  const clsMod = await import('@/lib/services/intent-job-failure-classifier');
  classifyArchitectFailure = clsMod.classifyArchitectFailure;
});

describe('Phase 137-07 Task 1 — intent_jobs self-healing schema', () => {
  it('adds failure_class column to intent_jobs', () => {
    const cols = catbotDbRef
      .prepare('PRAGMA table_info(intent_jobs)')
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('failure_class');
  });

  it('adds config_overrides column to intent_jobs', () => {
    const cols = catbotDbRef
      .prepare('PRAGMA table_info(intent_jobs)')
      .all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('config_overrides');
  });

  it('adds architect_iter0_raw column to intent_jobs', () => {
    const cols = catbotDbRef
      .prepare('PRAGMA table_info(intent_jobs)')
      .all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('architect_iter0_raw');
  });

  it('adds parent_job_id column to intent_jobs', () => {
    const cols = catbotDbRef
      .prepare('PRAGMA table_info(intent_jobs)')
      .all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('parent_job_id');
  });

  it('columns are nullable and writable', () => {
    const id = 'job-137-07-schema-1';
    catbotDbRef
      .prepare(
        `INSERT INTO intent_jobs (id, user_id, tool_name, failure_class, config_overrides, architect_iter0_raw, parent_job_id)
         VALUES (?, 'u', 'test', ?, ?, ?, ?)`,
      )
      .run(id, 'truncated_json', '{"architect_max_tokens":16000}', '{"partial":"json...', 'job-parent-1');
    const row = catbotDbRef
      .prepare('SELECT failure_class, config_overrides, architect_iter0_raw, parent_job_id FROM intent_jobs WHERE id = ?')
      .get(id) as {
        failure_class: string;
        config_overrides: string;
        architect_iter0_raw: string;
        parent_job_id: string;
      };
    expect(row.failure_class).toBe('truncated_json');
    expect(row.config_overrides).toContain('architect_max_tokens');
    expect(row.architect_iter0_raw).toContain('partial');
    expect(row.parent_job_id).toBe('job-parent-1');
  });
});

// ---------------------------------------------------------------------------
// Phase 137-08 Task 1 RED: additional iteration columns.
// ---------------------------------------------------------------------------
describe('Phase 137-08 Task 1 — intent_jobs extra iteration columns', () => {
  it('adds architect_iter2 column to intent_jobs', () => {
    const cols = catbotDbRef
      .prepare('PRAGMA table_info(intent_jobs)')
      .all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('architect_iter2');
  });

  it('adds qa_iter2 column to intent_jobs', () => {
    const cols = catbotDbRef
      .prepare('PRAGMA table_info(intent_jobs)')
      .all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('qa_iter2');
  });

  it('adds architect_iter3 column to intent_jobs', () => {
    const cols = catbotDbRef
      .prepare('PRAGMA table_info(intent_jobs)')
      .all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('architect_iter3');
  });

  it('adds qa_iter3 column to intent_jobs', () => {
    const cols = catbotDbRef
      .prepare('PRAGMA table_info(intent_jobs)')
      .all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('qa_iter3');
  });

  it('extra iteration columns are nullable and writable', () => {
    const id = 'job-137-08-schema-1';
    catbotDbRef
      .prepare(
        `INSERT INTO intent_jobs (id, user_id, tool_name, architect_iter2, qa_iter2, architect_iter3, qa_iter3)
         VALUES (?, 'u', 'test', ?, ?, ?, ?)`,
      )
      .run(id, '{"name":"iter2"}', '{"qa":"iter2"}', '{"name":"iter3"}', '{"qa":"iter3"}');
    const row = catbotDbRef
      .prepare('SELECT architect_iter2, qa_iter2, architect_iter3, qa_iter3 FROM intent_jobs WHERE id = ?')
      .get(id) as {
        architect_iter2: string;
        qa_iter2: string;
        architect_iter3: string;
        qa_iter3: string;
      };
    expect(row.architect_iter2).toContain('iter2');
    expect(row.qa_iter2).toContain('iter2');
    expect(row.architect_iter3).toContain('iter3');
    expect(row.qa_iter3).toContain('iter3');
  });
});

describe('Phase 137-07 Task 1 — classifyArchitectFailure', () => {
  it('returns truncated_json when error mentions Unterminated string', () => {
    const result = classifyArchitectFailure({
      error: 'SyntaxError: Unterminated string in JSON at position 4722',
    });
    expect(result).toBe('truncated_json');
  });

  it('returns truncated_json when error mentions Unexpected end', () => {
    const result = classifyArchitectFailure({
      error: 'SyntaxError: Unexpected end of JSON input',
    });
    expect(result).toBe('truncated_json');
  });

  it('returns truncated_json when finishReason is length', () => {
    const result = classifyArchitectFailure({
      error: 'parse failed',
      finishReason: 'length',
    });
    expect(result).toBe('truncated_json');
  });

  it('returns truncated_json when raw output ends without matching braces', () => {
    const rawOutput = '{"nodes":[{"id":"a","data":{"instructions":"start working on the first';
    const result = classifyArchitectFailure({
      error: 'SyntaxError: ...',
      rawOutput,
    });
    expect(result).toBe('truncated_json');
  });

  it('returns parse_error on other JSON parse failures', () => {
    const result = classifyArchitectFailure({
      error: 'SyntaxError: Unexpected token } in JSON at position 42',
    });
    expect(result).toBe('parse_error');
  });

  it('returns qa_rejected when QA loop exhausted', () => {
    const result = classifyArchitectFailure({
      error: 'QA loop exhausted after 2 iterations without accept',
    });
    expect(result).toBe('qa_rejected');
  });

  it('returns llm_error on timeout', () => {
    const result = classifyArchitectFailure({
      error: 'litellm timeout (90s): LLM call aborted before response',
    });
    expect(result).toBe('llm_error');
  });

  it('returns llm_error on ECONNRESET', () => {
    const result = classifyArchitectFailure({
      error: 'fetch failed: ECONNRESET',
    });
    expect(result).toBe('llm_error');
  });

  it('returns llm_error on HTTP 5xx', () => {
    const result = classifyArchitectFailure({
      error: 'litellm 502: upstream error',
    });
    expect(result).toBe('llm_error');
  });

  it('returns other for unrecognized errors', () => {
    const result = classifyArchitectFailure({
      error: 'something totally unexpected',
    });
    expect(result).toBe('other');
  });
});
