import Database from 'better-sqlite3';
import path from 'path';
import { CLEANUP_TARGETS } from './helpers/test-data';

async function globalTeardown() {
  const dbPath =
    process['env']['DATABASE_PATH'] ||
    path.join(process.cwd(), 'data', 'docflow.db');
  const db = new Database(dbPath);

  // Clean [TEST]-prefixed rows from all target tables
  for (const { table, column } of CLEANUP_TARGETS) {
    try {
      db.prepare(`DELETE FROM ${table} WHERE ${column} LIKE '[TEST]%'`).run();
    } catch {
      // Table may not exist
    }
  }

  // Clean related data: sources belonging to [TEST] projects
  try {
    db.prepare(
      "DELETE FROM sources WHERE project_id IN (SELECT id FROM projects WHERE name LIKE '[TEST]%')"
    ).run();
  } catch {
    // Table may not exist
  }

  // Clean [TEST]-prefixed notifications
  try {
    db.prepare("DELETE FROM notifications WHERE title LIKE '[TEST]%'").run();
  } catch {
    // Table may not exist
  }

  db.close();
  console.log('Global teardown complete: [TEST] data cleaned');
}

export default globalTeardown;
