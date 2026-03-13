import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import Database from 'better-sqlite3';
import path from 'path';
import { randomUUID } from 'crypto';

class SqliteReporter implements Reporter {
  private startTime = 0;
  private testResults: Array<{
    title: string;
    file: string;
    status: string;
    duration: number;
  }> = [];

  onBegin(_config: FullConfig, _suite: Suite) {
    this.startTime = Date.now();
    this.testResults = [];
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.testResults.push({
      title: test.title,
      file: test.location.file,
      status: result.status,
      duration: result.duration,
    });
  }

  onEnd(result: FullResult) {
    try {
      const dbPath =
        process['env']['DATABASE_PATH'] ||
        path.join(process.cwd(), 'data', 'docflow.db');
      const db = new Database(dbPath);

      // Ensure table exists
      db.exec(`CREATE TABLE IF NOT EXISTS test_runs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        section TEXT,
        status TEXT NOT NULL,
        total INTEGER DEFAULT 0,
        passed INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        skipped INTEGER DEFAULT 0,
        duration_seconds REAL DEFAULT 0,
        results_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);

      const duration = (Date.now() - this.startTime) / 1000;
      const total = this.testResults.length;
      const passed = this.testResults.filter(
        (r) => r.status === 'passed'
      ).length;
      const failed = this.testResults.filter(
        (r) => r.status === 'failed'
      ).length;
      const skipped = this.testResults.filter(
        (r) => r.status === 'skipped'
      ).length;

      const id = randomUUID();

      db.prepare(
        `INSERT INTO test_runs (id, type, section, status, total, passed, failed, skipped, duration_seconds, results_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        'full',
        null,
        result.status,
        total,
        passed,
        failed,
        skipped,
        duration,
        JSON.stringify(this.testResults)
      );

      db.close();
    } catch (err) {
      console.error('SqliteReporter: failed to write test results', err);
    }
  }
}

export default SqliteReporter;
