import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import {
  authenticate,
  requireAdmin,
  requireSuperAdmin,
  requireWebsiteAccess,
  requireWebsiteManage,
  getAdminUser,
} from '../middleware/auth';
import {
  createUser,
  generateSiteApiKey,
  hashSiteApiKey,
  loadAuthUser,
  userCanAccessWebsite,
  userCanManageWebsite,
} from '../services/auth';

export const websitesRouter = Router();

websitesRouter.use(authenticate, requireAdmin);

websitesRouter.get('/', (req: Request, res: Response) => {
  const db = getDb();
  const user = getAdminUser(req)!;

  let rows;
  if (user.isSuperAdmin) {
    rows = db.prepare('SELECT * FROM websites ORDER BY created_at DESC').all();
  } else {
    const placeholders = user.websiteIds.map(() => '?').join(',');
    if (user.websiteIds.length === 0) {
      res.json([]);
      return;
    }
    rows = db.prepare(`SELECT * FROM websites WHERE id IN (${placeholders}) ORDER BY created_at DESC`).all(...user.websiteIds);
  }

  res.json(rows.map(formatWebsite));
});

websitesRouter.post('/', requireSuperAdmin, (req: Request, res: Response) => {
  const db = getDb();
  const { name, domain, slug, description, defaultModel, defaultLanguage } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Website name is required' });
    return;
  }

  const websiteId = uuidv4();
  const projectId = uuidv4();
  const now = new Date().toISOString();
  const websiteSlug = slug || slugify(String(name));

  const existingSlug = db.prepare('SELECT id FROM websites WHERE slug = ?').get(websiteSlug);
  if (existingSlug) {
    res.status(400).json({ error: 'Slug already in use' });
    return;
  }

  db.prepare(`
    INSERT INTO websites (id, name, domain, slug, default_project_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(websiteId, name, domain || null, websiteSlug, projectId, now, now);

  db.prepare(`
    INSERT INTO projects (id, name, description, wordpress_url, website_id, default_model, default_language, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    projectId,
    `${name} Project`,
    description || null,
    domain || null,
    websiteId,
    defaultModel || 'gemini-3.6-flash',
    defaultLanguage || 'en',
    now,
    now
  );

  const row = db.prepare('SELECT * FROM websites WHERE id = ?').get(websiteId);
  res.status(201).json(formatWebsite(row));
});

websitesRouter.get('/:id', requireWebsiteAccess('id'), (req: Request, res: Response) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM websites WHERE id = ?').get(req.params.id);
  if (!row) {
    res.status(404).json({ error: 'Website not found' });
    return;
  }
  res.json(formatWebsite(row));
});

websitesRouter.put('/:id', requireWebsiteManage('id'), (req: Request, res: Response) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM websites WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Website not found' });
    return;
  }

  const { name, domain, slug, settings } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE websites SET name = ?, domain = ?, slug = ?, settings = ?, updated_at = ? WHERE id = ?
  `).run(
    name ?? existing.name,
    domain !== undefined ? domain : existing.domain,
    slug ?? existing.slug,
    settings !== undefined ? JSON.stringify(settings) : String(existing.settings ?? '{}'),
    now,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM websites WHERE id = ?').get(req.params.id);
  res.json(formatWebsite(row));
});

websitesRouter.delete('/:id', requireSuperAdmin, (req: Request, res: Response) => {
  const db = getDb();
  const website = db.prepare('SELECT default_project_id FROM websites WHERE id = ?').get(req.params.id) as { default_project_id: string } | undefined;
  if (!website) {
    res.status(404).json({ error: 'Website not found' });
    return;
  }

  db.prepare('DELETE FROM projects WHERE website_id = ?').run(req.params.id);
  db.prepare('DELETE FROM websites WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

websitesRouter.get('/:id/projects', requireWebsiteAccess('id'), (req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects WHERE website_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows.map(formatProjectSummary));
});

// ─── Members ────────────────────────────────────────────────

websitesRouter.get('/:id/members', requireWebsiteManage('id'), (req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT m.id, m.user_id, m.website_id, m.role, m.created_at, u.email, u.name, u.is_super_admin
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.website_id = ?
    ORDER BY m.created_at ASC
  `).all(req.params.id);

  res.json(rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id,
      userId: r.user_id,
      websiteId: r.website_id,
      role: r.role,
      email: r.email,
      name: r.name,
      isSuperAdmin: r.is_super_admin === 1,
      createdAt: r.created_at,
    };
  }));
});

websitesRouter.post('/:id/members', requireWebsiteManage('id'), async (req: Request, res: Response) => {
  const db = getDb();
  const { email, name, password, role, userId } = req.body;
  const websiteId = req.params.id;
  const memberRole = role || 'website_admin';

  if (!['website_admin', 'editor', 'viewer'].includes(memberRole)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }

  let targetUserId = userId as string | undefined;

  if (!targetUserId) {
    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, name, and password are required for new users' });
      return;
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase()) as { id: string } | undefined;
    if (existing) {
      targetUserId = existing.id;
    } else {
      const created = await createUser(String(email), String(password), String(name), false);
      targetUserId = created.id;
    }
  }

  const membershipId = uuidv4();
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO memberships (id, user_id, website_id, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(membershipId, targetUserId, websiteId, memberRole, now);
  } catch {
    res.status(400).json({ error: 'User is already a member of this website' });
    return;
  }

  const user = loadAuthUser(targetUserId);
  res.status(201).json({
    id: membershipId,
    userId: targetUserId,
    websiteId,
    role: memberRole,
    email: user?.email,
    name: user?.name,
    createdAt: now,
  });
});

websitesRouter.delete('/:id/members/:memberId', requireWebsiteManage('id'), (req: Request, res: Response) => {
  const db = getDb();
  db.prepare('DELETE FROM memberships WHERE id = ? AND website_id = ?').run(req.params.memberId, req.params.id);
  res.status(204).end();
});

// ─── Site API Keys ──────────────────────────────────────────

websitesRouter.get('/:id/api-keys', requireWebsiteManage('id'), (req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, website_id, label, last_used_at, revoked_at, created_at
    FROM site_api_keys WHERE website_id = ? ORDER BY created_at DESC
  `).all(req.params.id);

  res.json(rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id,
      websiteId: r.website_id,
      label: r.label,
      lastUsedAt: r.last_used_at,
      revokedAt: r.revoked_at,
      createdAt: r.created_at,
      isRevoked: !!r.revoked_at,
    };
  }));
});

websitesRouter.post('/:id/api-keys', requireWebsiteManage('id'), (req: Request, res: Response) => {
  const db = getDb();
  const website = db.prepare('SELECT id FROM websites WHERE id = ?').get(req.params.id);
  if (!website) {
    res.status(404).json({ error: 'Website not found' });
    return;
  }

  const key = generateSiteApiKey();
  const keyId = uuidv4();
  const now = new Date().toISOString();
  const label = req.body.label || 'WordPress Site';

  db.prepare(`
    INSERT INTO site_api_keys (id, website_id, key_hash, label, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(keyId, req.params.id, hashSiteApiKey(key), label, now);

  res.status(201).json({
    id: keyId,
    websiteId: req.params.id,
    label,
    apiKey: key,
    createdAt: now,
    message: 'Copy this API key now. It will not be shown again.',
  });
});

websitesRouter.delete('/:id/api-keys/:keyId', requireWebsiteManage('id'), (req: Request, res: Response) => {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE site_api_keys SET revoked_at = ? WHERE id = ? AND website_id = ?
  `).run(now, req.params.keyId, req.params.id);
  res.status(204).end();
});

// ─── Site context (for WP plugin) ───────────────────────────

websitesRouter.get('/:id/context', requireWebsiteAccess('id'), (req: Request, res: Response) => {
  const db = getDb();
  const website = db.prepare('SELECT * FROM websites WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!website) {
    res.status(404).json({ error: 'Website not found' });
    return;
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(String(website.default_project_id)) as Record<string, unknown> | undefined;

  res.json({
    websiteId: website.id,
    websiteName: website.name,
    projectId: website.default_project_id,
    projectName: project?.name,
    domain: website.domain,
  });
});

function formatWebsite(row: unknown) {
  const r = row as Record<string, unknown>;
  return {
    id: r.id,
    name: r.name,
    domain: r.domain,
    slug: r.slug,
    defaultProjectId: r.default_project_id,
    settings: r.settings ? JSON.parse(String(r.settings)) : {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function formatProjectSummary(row: unknown) {
  const r = row as Record<string, unknown>;
  return {
    id: r.id,
    name: r.name,
    websiteId: r.website_id,
    defaultModel: r.default_model,
    createdAt: r.created_at,
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `website-${Date.now()}`;
}
