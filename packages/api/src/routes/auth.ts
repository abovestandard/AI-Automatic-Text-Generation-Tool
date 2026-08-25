import { Router, Request, Response } from 'express';
import {
  authenticateUser,
  createUser,
  getUserCount,
  loadAuthUser,
  signToken,
} from '../services/auth';
import { authenticate, requireAdmin } from '../middleware/auth';

export const authRouter = Router();

authRouter.post('/bootstrap', async (req: Request, res: Response) => {
  if (getUserCount() > 0) {
    res.status(403).json({ error: 'Bootstrap is only available when no users exist' });
    return;
  }

  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password, and name are required' });
    return;
  }
  if (String(password).length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const user = await createUser(String(email), String(password), String(name), true);
    const token = signToken({ sub: user.id });
    res.status(201).json({
      token,
      user: loadAuthUser(user.id),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Bootstrap failed' });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = await authenticateUser(String(email), String(password));
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = signToken({ sub: user.id });
  res.json({ token, user });
});

authRouter.get('/me', authenticate, requireAdmin, (req: Request, res: Response) => {
  const user = loadAuthUser(req.auth!.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    websiteIds: user.websiteIds,
    rolesByWebsite: user.rolesByWebsite,
  });
});

authRouter.get('/status', (_req: Request, res: Response) => {
  res.json({
    needsBootstrap: getUserCount() === 0,
    userCount: getUserCount(),
  });
});
