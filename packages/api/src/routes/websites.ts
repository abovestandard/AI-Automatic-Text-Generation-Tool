import { Router, Request, Response } from 'express';
import { prisma } from '../db';
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
} from '../services/auth';
import { formatWebsite, formatProjectSummary } from '../lib/formatters';

export const websitesRouter = Router();

websitesRouter.use(authenticate, requireAdmin);

websitesRouter.get('/', async (req: Request, res: Response) => {
  const user = getAdminUser(req)!;
  const rows = user.isSuperAdmin
    ? await prisma.website.findMany({ orderBy: { createdAt: 'desc' } })
    : user.websiteIds.length === 0
      ? []
      : await prisma.website.findMany({
          where: { id: { in: user.websiteIds } },
          orderBy: { createdAt: 'desc' },
        });
  res.json(rows.map(formatWebsite));
});

websitesRouter.post('/', requireSuperAdmin, async (req: Request, res: Response) => {
  const { name, domain, slug, description, defaultModel, defaultLanguage } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Website name is required' });
    return;
  }

  const websiteSlug = slug || slugify(String(name));
  const existingSlug = await prisma.website.findUnique({ where: { slug: websiteSlug } });
  if (existingSlug) {
    res.status(400).json({ error: 'Slug already in use' });
    return;
  }

  const website = await prisma.$transaction(async (tx) => {
    const createdWebsite = await tx.website.create({
      data: {
        name,
        domain: domain || null,
        slug: websiteSlug,
      },
    });

    const project = await tx.project.create({
      data: {
        name: `${name} Project`,
        description: description || null,
        wordpressUrl: domain || null,
        defaultModel: defaultModel || 'gemini-3.6-flash',
        defaultLanguage: defaultLanguage || 'en',
        websiteId: createdWebsite.id,
      },
    });

    return tx.website.update({
      where: { id: createdWebsite.id },
      data: { defaultProjectId: project.id },
    });
  });

  res.status(201).json(formatWebsite(website));
});

websitesRouter.get('/:id', requireWebsiteAccess('id'), async (req: Request, res: Response) => {
  const row = await prisma.website.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: 'Website not found' });
    return;
  }
  res.json(formatWebsite(row));
});

websitesRouter.put('/:id', requireWebsiteManage('id'), async (req: Request, res: Response) => {
  const existing = await prisma.website.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'Website not found' });
    return;
  }

  const { name, domain, slug, settings } = req.body;
  const row = await prisma.website.update({
    where: { id: req.params.id },
    data: {
      name: name ?? existing.name,
      domain: domain !== undefined ? domain : existing.domain,
      slug: slug ?? existing.slug,
      settings: settings !== undefined ? settings : existing.settings,
    },
  });
  res.json(formatWebsite(row));
});

websitesRouter.delete('/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  const website = await prisma.website.findUnique({ where: { id: req.params.id } });
  if (!website) {
    res.status(404).json({ error: 'Website not found' });
    return;
  }
  await prisma.project.deleteMany({ where: { websiteId: req.params.id } });
  await prisma.website.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

websitesRouter.get('/:id/projects', requireWebsiteAccess('id'), async (req: Request, res: Response) => {
  const rows = await prisma.project.findMany({
    where: { websiteId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(rows.map(formatProjectSummary));
});

websitesRouter.get('/:id/members', requireWebsiteManage('id'), async (req: Request, res: Response) => {
  const rows = await prisma.membership.findMany({
    where: { websiteId: req.params.id },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });

  res.json(rows.map((m) => ({
    id: m.id,
    userId: m.userId,
    websiteId: m.websiteId,
    role: m.role,
    email: m.user.email,
    name: m.user.name,
    isSuperAdmin: m.user.isSuperAdmin,
    createdAt: m.createdAt.toISOString(),
  })));
});

websitesRouter.post('/:id/members', requireWebsiteManage('id'), async (req: Request, res: Response) => {
  const { email, name, password, role, userId } = req.body;
  const websiteId = req.params.id;
  const memberRole = role || 'website_admin';

  if (!['website_admin', 'editor', 'viewer'].includes(memberRole)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }

  let targetUserId = userId as string | undefined;

  if (targetUserId) {
    const existingUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existingUser) {
      res.status(400).json({ error: 'User not found' });
      return;
    }
    if (existingUser.isSuperAdmin) {
      res.status(400).json({ error: 'Super admins already have access to all websites' });
      return;
    }
  } else if (!email || !password || !name) {
    res.status(400).json({ error: 'Select an existing user or provide email, name, and password for a new user' });
    return;
  } else {
    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (existing) {
      targetUserId = existing.id;
    } else {
      const created = await createUser(String(email), String(password), String(name), false);
      targetUserId = created.id;
    }
  }

  if (!targetUserId) {
    res.status(400).json({ error: 'User is required' });
    return;
  }

  try {
    const membership = await prisma.membership.create({
      data: {
        userId: targetUserId,
        websiteId,
        role: memberRole,
      },
    });
    const user = await loadAuthUser(targetUserId);
    res.status(201).json({
      id: membership.id,
      userId: targetUserId,
      websiteId,
      role: memberRole,
      email: user?.email,
      name: user?.name,
      createdAt: membership.createdAt.toISOString(),
    });
  } catch {
    res.status(400).json({ error: 'User is already a member of this website' });
  }
});

websitesRouter.put('/:id/members/:memberId', requireWebsiteManage('id'), async (req: Request, res: Response) => {
  const { role } = req.body;
  if (!['website_admin', 'editor', 'viewer'].includes(role)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }

  const membership = await prisma.membership.findFirst({
    where: { id: req.params.memberId, websiteId: req.params.id },
    include: { user: true },
  });

  if (!membership) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: { role },
    include: { user: true },
  });

  res.json({
    id: updated.id,
    userId: updated.userId,
    websiteId: updated.websiteId,
    role: updated.role,
    email: updated.user.email,
    name: updated.user.name,
    createdAt: updated.createdAt.toISOString(),
  });
});

websitesRouter.delete('/:id/members/:memberId', requireWebsiteManage('id'), async (req: Request, res: Response) => {
  await prisma.membership.deleteMany({
    where: { id: req.params.memberId, websiteId: req.params.id },
  });
  res.status(204).end();
});

websitesRouter.get('/:id/api-keys', requireWebsiteManage('id'), async (req: Request, res: Response) => {
  const rows = await prisma.siteApiKey.findMany({
    where: { websiteId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });

  res.json(rows.map((k) => ({
    id: k.id,
    websiteId: k.websiteId,
    label: k.label,
    lastUsedAt: k.lastUsedAt?.toISOString(),
    revokedAt: k.revokedAt?.toISOString(),
    createdAt: k.createdAt.toISOString(),
    isRevoked: !!k.revokedAt,
  })));
});

websitesRouter.post('/:id/api-keys', requireWebsiteManage('id'), async (req: Request, res: Response) => {
  const website = await prisma.website.findUnique({ where: { id: req.params.id } });
  if (!website) {
    res.status(404).json({ error: 'Website not found' });
    return;
  }

  const key = generateSiteApiKey();
  const label = req.body.label || 'WordPress Site';
  const row = await prisma.siteApiKey.create({
    data: {
      websiteId: req.params.id,
      keyHash: hashSiteApiKey(key),
      label,
    },
  });

  res.status(201).json({
    id: row.id,
    websiteId: req.params.id,
    label,
    apiKey: key,
    createdAt: row.createdAt.toISOString(),
    message: 'Copy this API key now. It will not be shown again.',
  });
});

websitesRouter.delete('/:id/api-keys/:keyId', requireWebsiteManage('id'), async (req: Request, res: Response) => {
  await prisma.siteApiKey.updateMany({
    where: { id: req.params.keyId, websiteId: req.params.id },
    data: { revokedAt: new Date() },
  });
  res.status(204).end();
});

websitesRouter.get('/:id/context', requireWebsiteAccess('id'), async (req: Request, res: Response) => {
  const website = await prisma.website.findUnique({ where: { id: req.params.id } });
  if (!website) {
    res.status(404).json({ error: 'Website not found' });
    return;
  }

  const project = website.defaultProjectId
    ? await prisma.project.findUnique({ where: { id: website.defaultProjectId } })
    : null;

  res.json({
    websiteId: website.id,
    websiteName: website.name,
    projectId: website.defaultProjectId,
    projectName: project?.name,
    domain: website.domain,
  });
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || `website-${Date.now()}`;
}
