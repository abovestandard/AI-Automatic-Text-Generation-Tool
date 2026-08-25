import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export type UserRole = 'super_admin' | 'website_admin' | 'editor' | 'viewer';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SITE_KEY_PREFIX = 'aica_';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
  websiteIds: string[];
  rolesByWebsite: Record<string, UserRole>;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt);
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = await scrypt(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

function scrypt(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('hex'));
    });
  });
}

export function signToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generateSiteApiKey(): string {
  return `${SITE_KEY_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
}

export function hashSiteApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function getUserCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return row.count;
}

export async function createUser(
  email: string,
  password: string,
  name: string,
  isSuperAdmin = false
): Promise<{ id: string; email: string; name: string }> {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, is_super_admin, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase(), passwordHash, name, isSuperAdmin ? 1 : 0, now, now);
  return { id, email: email.toLowerCase(), name };
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as Record<string, unknown> | undefined;
  if (!row) return null;
  const valid = await verifyPassword(password, String(row.password_hash));
  if (!valid) return null;
  return loadAuthUser(String(row.id));
}

export function loadAuthUser(userId: string): AuthUser | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const memberships = db.prepare(`
    SELECT website_id, role FROM memberships WHERE user_id = ?
  `).all(userId) as Array<{ website_id: string; role: string }>;

  const websiteIds: string[] = [];
  const rolesByWebsite: Record<string, UserRole> = {};
  for (const m of memberships) {
    websiteIds.push(m.website_id);
    rolesByWebsite[m.website_id] = m.role as UserRole;
  }

  return {
    id: String(row.id),
    email: String(row.email),
    name: row.name ? String(row.name) : null,
    isSuperAdmin: row.is_super_admin === 1,
    websiteIds,
    rolesByWebsite,
  };
}

export function authenticateSiteKey(key: string): {
  websiteId: string;
  projectId: string;
  siteKeyId: string;
} | null {
  if (!key.startsWith(SITE_KEY_PREFIX)) return null;
  const db = getDb();
  const keyHash = hashSiteApiKey(key);
  const row = db.prepare(`
    SELECT sak.id, sak.website_id, sak.revoked_at, w.default_project_id
    FROM site_api_keys sak
    JOIN websites w ON w.id = sak.website_id
    WHERE sak.key_hash = ?
  `).get(keyHash) as Record<string, unknown> | undefined;

  if (!row || row.revoked_at) return null;
  if (!row.default_project_id) return null;

  const now = new Date().toISOString();
  db.prepare('UPDATE site_api_keys SET last_used_at = ? WHERE id = ?').run(now, String(row.id));

  return {
    websiteId: String(row.website_id),
    projectId: String(row.default_project_id),
    siteKeyId: String(row.id),
  };
}

export function userCanAccessWebsite(user: AuthUser, websiteId: string): boolean {
  if (user.isSuperAdmin) return true;
  return user.websiteIds.includes(websiteId);
}

export function userCanAccessProject(user: AuthUser, projectId: string): boolean {
  if (user.isSuperAdmin) return true;
  const db = getDb();
  const row = db.prepare('SELECT website_id FROM projects WHERE id = ?').get(projectId) as { website_id: string } | undefined;
  if (!row?.website_id) return false;
  return user.websiteIds.includes(row.website_id);
}

export function userCanManageWebsite(user: AuthUser, websiteId: string): boolean {
  if (user.isSuperAdmin) return true;
  const role = user.rolesByWebsite[websiteId];
  return role === 'website_admin';
}

export function getProjectWebsiteId(projectId: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT website_id FROM projects WHERE id = ?').get(projectId) as { website_id: string } | undefined;
  return row?.website_id ?? null;
}
