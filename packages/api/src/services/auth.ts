import crypto from 'crypto';
import { prisma } from '../db';

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

export async function getUserCount(): Promise<number> {
  return prisma.user.count();
}

export async function createUser(
  email: string,
  password: string,
  name: string,
  isSuperAdmin = false
): Promise<{ id: string; email: string; name: string }> {
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
      isSuperAdmin,
    },
  });
  return { id: user.id, email: user.email, name: user.name ?? name };
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!row) return null;
  const valid = await verifyPassword(password, row.passwordHash);
  if (!valid) return null;
  return loadAuthUser(row.id);
}

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: true },
  });
  if (!row) return null;

  const websiteIds: string[] = [];
  const rolesByWebsite: Record<string, UserRole> = {};
  for (const m of row.memberships) {
    websiteIds.push(m.websiteId);
    rolesByWebsite[m.websiteId] = m.role as UserRole;
  }

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isSuperAdmin: row.isSuperAdmin,
    websiteIds,
    rolesByWebsite,
  };
}

export async function authenticateSiteKey(key: string): Promise<{
  websiteId: string;
  projectId: string;
  siteKeyId: string;
} | null> {
  if (!key.startsWith(SITE_KEY_PREFIX)) return null;

  const keyHash = hashSiteApiKey(key);
  const row = await prisma.siteApiKey.findUnique({
    where: { keyHash },
    include: { website: true },
  });

  if (!row || row.revokedAt || !row.website.defaultProjectId) return null;

  await prisma.siteApiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    websiteId: row.websiteId,
    projectId: row.website.defaultProjectId,
    siteKeyId: row.id,
  };
}

export function userCanAccessWebsite(user: AuthUser, websiteId: string): boolean {
  if (user.isSuperAdmin) return true;
  return user.websiteIds.includes(websiteId);
}

export async function userCanAccessProject(user: AuthUser, projectId: string): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { websiteId: true },
  });
  if (!project?.websiteId) return false;
  return user.websiteIds.includes(project.websiteId);
}

export function userCanManageWebsite(user: AuthUser, websiteId: string): boolean {
  if (user.isSuperAdmin) return true;
  return user.rolesByWebsite[websiteId] === 'website_admin';
}
