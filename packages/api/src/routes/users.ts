import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth';
import { createUser, hashPassword, loadAuthUser } from '../services/auth';

export const usersRouter = Router();

usersRouter.use(authenticate, requireAdmin, requireSuperAdmin);

usersRouter.get('/', async (_req: Request, res: Response) => {
  const rows = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      memberships: {
        include: {
          website: { select: { id: true, name: true } },
        },
      },
    },
  });
  res.json(rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    isSuperAdmin: u.isSuperAdmin,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    memberships: u.memberships.map((m) => ({
      id: m.id,
      websiteId: m.websiteId,
      websiteName: m.website.name,
      role: m.role,
    })),
  })));
});

usersRouter.post('/', async (req: Request, res: Response) => {
  const { email, password, name, isSuperAdmin } = req.body;
  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password, and name are required' });
    return;
  }

  try {
    const user = await createUser(String(email), String(password), String(name), !!isSuperAdmin);
    const authUser = await loadAuthUser(user.id);
    res.status(201).json(authUser);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create user' });
  }
});

usersRouter.put('/:id', async (req: Request, res: Response) => {
  const { name, email, password, isSuperAdmin } = req.body;
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (isSuperAdmin === false && target.isSuperAdmin) {
    const superAdminCount = await prisma.user.count({ where: { isSuperAdmin: true } });
    if (superAdminCount <= 1) {
      res.status(400).json({ error: 'Cannot demote the last super admin' });
      return;
    }
  }

  if (email && String(email).toLowerCase() !== target.email) {
    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (existing && existing.id !== target.id) {
      res.status(400).json({ error: 'Email is already in use' });
      return;
    }
  }

  const data: {
    name?: string;
    email?: string;
    passwordHash?: string;
    isSuperAdmin?: boolean;
  } = {};

  if (name !== undefined) data.name = String(name);
  if (email !== undefined) data.email = String(email).toLowerCase();
  if (password) data.passwordHash = await hashPassword(String(password));
  if (isSuperAdmin !== undefined) data.isSuperAdmin = !!isSuperAdmin;

  await prisma.user.update({
    where: { id: target.id },
    data,
  });

  const authUser = await loadAuthUser(target.id);
  res.json(authUser);
});

usersRouter.delete('/:id', async (req: Request, res: Response) => {
  const superAdminCount = await prisma.user.count({ where: { isSuperAdmin: true } });
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.isSuperAdmin && superAdminCount <= 1) {
    res.status(400).json({ error: 'Cannot delete the last super admin' });
    return;
  }
  await prisma.user.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
