import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth';
import { createUser, loadAuthUser } from '../services/auth';

export const usersRouter = Router();

usersRouter.use(authenticate, requireAdmin, requireSuperAdmin);

usersRouter.get('/', async (_req: Request, res: Response) => {
  const rows = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      isSuperAdmin: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json(rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    isSuperAdmin: u.isSuperAdmin,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
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
