import express from 'express';
import cors from 'cors';
import path from 'path';
import { apiRouter } from './routes/api';
import { authRouter } from './routes/auth';
import { websitesRouter } from './routes/websites';
import { usersRouter } from './routes/users';
import { ensureBootstrapAdmin } from './services/bootstrap';

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

app.use('/api/auth', authRouter);
app.use('/api/websites', websitesRouter);
app.use('/api/users', usersRouter);
app.use('/api', apiRouter);

const adminDist = path.join(__dirname, '../../admin/dist');
app.use(express.static(adminDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') return next();
  res.sendFile(path.join(adminDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, async () => {
  await ensureBootstrapAdmin();
  console.log(`AI Content Automation API running on http://localhost:${PORT}`);
});
