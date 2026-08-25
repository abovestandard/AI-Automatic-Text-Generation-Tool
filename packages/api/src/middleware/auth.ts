import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';
import {
  verifyToken,
  authenticateSiteKey,
  loadAuthUser,
  userCanAccessWebsite,
  userCanManageWebsite,
  AuthUser,
} from '../services/auth';

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (token.startsWith('aica_')) {
    const site = await authenticateSiteKey(token);
    if (!site) {
      res.status(401).json({ error: 'Invalid site API key' });
      return;
    }
    req.auth = {
      type: 'site',
      websiteId: site.websiteId,
      projectId: site.projectId,
      siteKeyId: site.siteKeyId,
    };
    next();
    return;
  }

  const payload = verifyToken(token);
  if (!payload?.sub) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const user = await loadAuthUser(String(payload.sub));
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  req.auth = {
    type: 'admin',
    userId: user.id,
    email: user.email,
    name: user.name ?? undefined,
    isSuperAdmin: user.isSuperAdmin,
    websiteIds: user.websiteIds,
    rolesByWebsite: user.rolesByWebsite,
  };
  next();
}

export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req);
  if (!token) {
    next();
    return;
  }

  if (token.startsWith('aica_')) {
    const site = await authenticateSiteKey(token);
    if (site) {
      req.auth = {
        type: 'site',
        websiteId: site.websiteId,
        projectId: site.projectId,
        siteKeyId: site.siteKeyId,
      };
    }
    next();
    return;
  }

  const payload = verifyToken(token);
  if (payload?.sub) {
    const user = await loadAuthUser(String(payload.sub));
    if (user) {
      req.auth = {
        type: 'admin',
        userId: user.id,
        email: user.email,
        name: user.name ?? undefined,
        isSuperAdmin: user.isSuperAdmin,
        websiteIds: user.websiteIds,
        rolesByWebsite: user.rolesByWebsite,
      };
    }
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.type !== 'admin') {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.type !== 'admin' || !req.auth.isSuperAdmin) {
    res.status(403).json({ error: 'Super admin access required' });
    return;
  }
  next();
}

export function requireAdminOrSiteKey(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

/** Build AuthUser from request context (no extra DB call). */
export function getAdminUser(req: Request): AuthUser | null {
  if (req.auth?.type !== 'admin' || !req.auth.userId) return null;
  return {
    id: req.auth.userId,
    email: req.auth.email ?? '',
    name: req.auth.name ?? null,
    isSuperAdmin: !!req.auth.isSuperAdmin,
    websiteIds: req.auth.websiteIds ?? [],
    rolesByWebsite: req.auth.rolesByWebsite ?? {},
  };
}

export function requireProjectAccess(paramName = 'id') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const projectId = req.params[paramName] || req.params.projectId;
    if (!projectId) {
      res.status(400).json({ error: 'Project ID required' });
      return;
    }

    if (req.auth?.type === 'site') {
      if (req.auth.projectId !== projectId) {
        res.status(403).json({ error: 'Access denied to this project' });
        return;
      }
      next();
      return;
    }

    if (req.auth?.type === 'admin') {
      const user = getAdminUser(req);
      if (!user) {
        res.status(403).json({ error: 'Access denied to this project' });
        return;
      }
      if (user.isSuperAdmin) {
        next();
        return;
      }
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { websiteId: true },
      });
      if (project?.websiteId && user.websiteIds.includes(project.websiteId)) {
        next();
        return;
      }
      res.status(403).json({ error: 'Access denied to this project' });
      return;
    }

    res.status(401).json({ error: 'Authentication required' });
  };
}

export function requireWebsiteAccess(paramName = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const websiteId = req.params[paramName] || req.params.websiteId;
    if (!websiteId) {
      res.status(400).json({ error: 'Website ID required' });
      return;
    }

    if (req.auth?.type === 'site') {
      if (req.auth.websiteId !== websiteId) {
        res.status(403).json({ error: 'Access denied to this website' });
        return;
      }
      next();
      return;
    }

    if (req.auth?.type === 'admin') {
      const user = getAdminUser(req);
      if (!user || !userCanAccessWebsite(user, websiteId)) {
        res.status(403).json({ error: 'Access denied to this website' });
        return;
      }
      next();
      return;
    }

    res.status(401).json({ error: 'Authentication required' });
  };
}

export function requireWebsiteManage(paramName = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const websiteId = req.params[paramName] || req.params.websiteId;
    if (!websiteId) {
      res.status(400).json({ error: 'Website ID required' });
      return;
    }

    if (req.auth?.type !== 'admin') {
      res.status(401).json({ error: 'Admin authentication required' });
      return;
    }

    const user = getAdminUser(req);
    if (!user || !userCanManageWebsite(user, websiteId)) {
      res.status(403).json({ error: 'Website management access required' });
      return;
    }
    next();
  };
}

export function blockSiteKey(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.type === 'site') {
    res.status(403).json({ error: 'This action requires CRM admin access' });
    return;
  }
  next();
}

async function adminCanAccessProject(req: Request, projectId: string): Promise<boolean> {
  const user = getAdminUser(req);
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { websiteId: true },
  });
  return !!(project?.websiteId && user.websiteIds.includes(project.websiteId));
}

export async function canAccessProject(req: Request, projectId: string): Promise<boolean> {
  if (req.auth?.type === 'site') {
    return req.auth.projectId === projectId;
  }
  if (req.auth?.type === 'admin') {
    return adminCanAccessProject(req, projectId);
  }
  return false;
}
