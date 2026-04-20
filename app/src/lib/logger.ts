import fs from 'fs';
import path from 'path';

export type LogLevel = 'info' | 'warn' | 'error';

export type LogSource =
  | 'processing' | 'chat' | 'rag' | 'catbot'
  | 'tasks' | 'canvas' | 'connectors' | 'system'
  | 'agents' | 'workers' | 'skills' | 'settings'
  | 'notifications' | 'cat-paws' | 'websearch'
  | 'scheduler' | 'drive' | 'drive-polling'
  | 'linkedin'
  | 'telegram'
  | 'discovery'
  | 'mid'
  | 'alerts'
  | 'alias-routing'
  | 'health'
  | 'intent-worker'
  | 'intent-job-executor'
  | 'kb-sync'
  | 'SummaryService';

const LOG_DIR = process['env']['LOG_DIR'] || '/app/data/logs';

// Ensure log directory exists on module load
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // Ignore errors (e.g. read-only filesystem in test environments)
}

// Rotate logs older than 7 days on module load
function rotateLogs(): void {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    for (const file of files) {
      const match = file.match(/^app-(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (!match) continue;

      const fileDate = new Date(match[1]).getTime();
      if (!isNaN(fileDate) && now - fileDate > sevenDaysMs) {
        try {
          fs.unlinkSync(path.join(LOG_DIR, file));
        } catch {
          // Ignore individual file deletion errors
        }
      }
    }
  } catch {
    // Ignore errors reading the log directory
  }
}

rotateLogs();

function getLogPath(): string {
  const dateStr = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `app-${dateStr}.jsonl`);
}

function writeLog(level: LogLevel, source: LogSource, message: string, metadata?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    source,
    message,
    ...(metadata ? { metadata } : {}),
  };
  try {
    fs.appendFileSync(getLogPath(), JSON.stringify(entry) + '\n');
  } catch {
    process.stderr.write(`[logger-fallback] ${JSON.stringify(entry)}\n`);
  }
}

export const logger = {
  info: (source: LogSource, msg: string, meta?: Record<string, unknown>) => writeLog('info', source, msg, meta),
  warn: (source: LogSource, msg: string, meta?: Record<string, unknown>) => writeLog('warn', source, msg, meta),
  error: (source: LogSource, msg: string, meta?: Record<string, unknown>) => writeLog('error', source, msg, meta),
};
