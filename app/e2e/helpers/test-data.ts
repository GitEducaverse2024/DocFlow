export const TEST_PREFIX = '[TEST]';

export function testName(base: string): string {
  return `${TEST_PREFIX} ${base}`;
}

// Tables and columns to clean [TEST] data from
export const CLEANUP_TARGETS = [
  { table: 'projects', column: 'name' },
  { table: 'custom_agents', column: 'name' },
  { table: 'docs_workers', column: 'name' },
  { table: 'skills', column: 'name' },
  { table: 'tasks', column: 'name' },
  { table: 'canvases', column: 'name' },
  { table: 'connectors', column: 'name' },
] as const;
