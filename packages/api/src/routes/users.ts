import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth';
import { createUser, loadAuthUser } from '../services/auth';

export const usersRouter = Router();

usersRouter.use(authenticate, requireAdmin, requireSuperAdmin);

usersRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, email, name, is_super_admin, created_at, updated_at FROM users ORDER BY created_at DESC').all();
  res.json(rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      isSuperAdmin: r.is_super_admin === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }));
});

usersRouter.post('/', async (req: Request, res: Response) => {
  const { email, password, name, isSuperAdmin } = req.body;
  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password, and name are required' });
    return;
  }

  try {
    const user = await createUser(String(email), String(password), String(name), !!isSuperAdmin);
    res.status(201).json(loadAuthUser(user.id));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create user' });
  }
});

usersRouter.delete('/:id', (req: Request, res: Response) => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_super_admin = 1').get() as { count: number };
  const target = db.prepare('SELECT is_super_admin FROM users WHERE id = ?').get(req.params.id) as { is_super_admin: number } | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (target.is_super_admin === 1 && count.count <= 1) {
    res.status(400).json({ error: 'Cannot delete the last super admin' });
    return;
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.status(204).end();
});
