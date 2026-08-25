import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'platform.db');

let db: DatabaseSync;

export type PlatformDatabase = DatabaseSync;

export function getDb(): DatabaseSync {
  if (!db) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
  }
  return db;
}

function migrate(database: DatabaseSync): void {
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

  // Migrations for existing databases
  try {
    database.exec(`ALTER TABLE projects ADD COLUMN gemini_api_key TEXT`);
  } catch {
    // Column already exists
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS websites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT,
      slug TEXT UNIQUE,
      default_project_id TEXT,
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      is_super_admin INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      website_id TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'website_admin',
      created_at TEXT NOT NULL,
      UNIQUE(user_id, website_id)
    );

    CREATE TABLE IF NOT EXISTS site_api_keys (
      id TEXT PRIMARY KEY,
      website_id TEXT NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
      key_hash TEXT NOT NULL UNIQUE,
      label TEXT,
      last_used_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
    CREATE INDEX IF NOT EXISTS idx_memberships_website ON memberships(website_id);
    CREATE INDEX IF NOT EXISTS idx_site_keys_website ON site_api_keys(website_id);
    CREATE INDEX IF NOT EXISTS idx_site_keys_hash ON site_api_keys(key_hash);
  `);

  try {
    database.exec(`ALTER TABLE projects ADD COLUMN website_id TEXT REFERENCES websites(id)`);
  } catch {
    // Column already exists
  }

  migrateLegacyProjects(database);
}

function migrateLegacyProjects(database: DatabaseSync): void {
  const unlinked = database.prepare(`
    SELECT id, name, wordpress_url, description FROM projects WHERE website_id IS NULL
  `).all() as Array<{ id: string; name: string; wordpress_url: string | null; description: string | null }>;

  if (unlinked.length === 0) return;

  const now = new Date().toISOString();
  const insertWebsite = database.prepare(`
    INSERT INTO websites (id, name, domain, slug, default_project_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const linkProject = database.prepare(`UPDATE projects SET website_id = ? WHERE id = ?`);

  for (const project of unlinked) {
    const websiteId = crypto.randomUUID();
    const slug = `site-${project.id.slice(0, 8)}`;
    insertWebsite.run(
      websiteId,
      project.name || 'Migrated Website',
      project.wordpress_url,
      slug,
      project.id,
      now,
      now
    );
    linkProject.run(websiteId, project.id);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
