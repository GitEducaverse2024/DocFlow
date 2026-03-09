import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process['env']['DATABASE_PATH'] || path.join(process.cwd(), 'data', 'docflow.db');

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    purpose TEXT,
    tech_stack TEXT,
    status TEXT DEFAULT 'draft',
    agent_id TEXT,
    current_version INTEGER DEFAULT 0,
    rag_enabled INTEGER DEFAULT 0,
    rag_collection TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    file_path TEXT,
    file_type TEXT,
    file_size INTEGER,
    url TEXT,
    youtube_id TEXT,
    content_text TEXT,
    status TEXT DEFAULT 'pending',
    extraction_log TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    order_index INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS processing_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    agent_id TEXT,
    status TEXT DEFAULT 'queued',
    input_sources TEXT,
    output_path TEXT,
    output_format TEXT DEFAULT 'md',
    tokens_used INTEGER,
    duration_seconds INTEGER,
    error_log TEXT,
    instructions TEXT,
    started_at TEXT,
    completed_at TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS custom_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🤖',
    model TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Add new columns if they don't exist
try {
  db.exec('ALTER TABLE projects ADD COLUMN bot_created INTEGER DEFAULT 0');
} catch {
  // Column might already exist
}

try {
  db.exec('ALTER TABLE projects ADD COLUMN bot_agent_id TEXT');
} catch {
  // Column might already exist
}

export default db;
