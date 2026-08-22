import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'platform.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      wordpress_url TEXT,
      wordpress_api_key TEXT,
      openai_api_key TEXT,
      default_model TEXT DEFAULT 'gpt-4o',
      default_language TEXT DEFAULT 'en',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      system_prompt TEXT NOT NULL,
      user_prompt_template TEXT NOT NULL,
      output_fields TEXT NOT NULL DEFAULT '[]',
      model TEXT,
      supports_vision INTEGER DEFAULT 0,
      response_format TEXT DEFAULT 'json',
      variables TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS field_mappings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      ai_output_key TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_field TEXT NOT NULL,
      target_selector TEXT,
      content_type TEXT,
      term_taxonomy TEXT
    );

    CREATE TABLE IF NOT EXISTS source_fields (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_field TEXT NOT NULL,
      include_in_prompt INTEGER DEFAULT 1,
      send_as_image INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS generation_results (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      prompt_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      status TEXT NOT NULL,
      generated_content TEXT,
      mapped_fields TEXT,
      raw_response TEXT,
      error TEXT,
      tokens_used INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bulk_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      prompt_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      apply_mode TEXT NOT NULL DEFAULT 'preview',
      items TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project_id);
    CREATE INDEX IF NOT EXISTS idx_mappings_project ON field_mappings(project_id);
    CREATE INDEX IF NOT EXISTS idx_mappings_prompt ON field_mappings(prompt_id);
    CREATE INDEX IF NOT EXISTS idx_results_project ON generation_results(project_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_project ON bulk_jobs(project_id);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
