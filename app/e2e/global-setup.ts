import { FullConfig } from '@playwright/test';
import Database from 'better-sqlite3';
import path from 'path';
import { CLEANUP_TARGETS } from './helpers/test-data';

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3500';

  // Wait for app to be ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${baseURL}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ready) {
    throw new Error('App not ready at ' + baseURL);
  }

  // Pre-clean any leftover [TEST] data
  const dbPath =
    process['env']['DATABASE_PATH'] ||
    path.join(process.cwd(), 'data', 'docflow.db');
  const db = new Database(dbPath);

  for (const { table, column } of CLEANUP_TARGETS) {
    try {
      db.prepare(`DELETE FROM ${table} WHERE ${column} LIKE '[TEST]%'`).run();
    } catch {
      // Table may not exist yet
    }
  }

  // Clean related data from catbrains (was projects)
  try {
    db.prepare(
      "DELETE FROM sources WHERE project_id IN (SELECT id FROM catbrains WHERE name LIKE '[TEST]%')"
    ).run();
  } catch {
    // Table may not exist
  }

  // Clean cat_paw relation tables
  try {
    db.prepare(
      "DELETE FROM cat_paw_skills WHERE paw_id IN (SELECT id FROM cat_paws WHERE name LIKE '[TEST]%')"
    ).run();
    db.prepare(
      "DELETE FROM cat_paw_catbrains WHERE paw_id IN (SELECT id FROM cat_paws WHERE name LIKE '[TEST]%')"
    ).run();
    db.prepare(
      "DELETE FROM cat_paw_connectors WHERE paw_id IN (SELECT id FROM cat_paws WHERE name LIKE '[TEST]%')"
    ).run();
    db.prepare(
      "DELETE FROM cat_paw_agents WHERE paw_id IN (SELECT id FROM cat_paws WHERE name LIKE '[TEST]%')"
    ).run();
  } catch {
    // Tables may not exist
  }

  try {
    db.prepare("DELETE FROM notifications WHERE title LIKE '[TEST]%'").run();
  } catch {
    // Table may not exist
  }

  db.close();
  console.log('Global setup complete: app ready, [TEST] data pre-cleaned');
}

export default globalSetup;
