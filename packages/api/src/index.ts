import './load-env';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { apiRouter } from './routes/api';
import { authRouter } from './routes/auth';
import { websitesRouter } from './routes/websites';
import { usersRouter } from './routes/users';
import { connectDb } from './db';
import { ensureBootstrapAdmin } from './services/bootstrap';

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.1.0', database: 'postgresql' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.1.0', database: 'postgresql' });
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

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set. Copy .env.example to .env and configure PostgreSQL.');
    process.exit(1);
  }

  try {
    await connectDb();
    console.log('Connected to PostgreSQL');
  } catch (err) {
    console.error('Failed to connect to PostgreSQL:', err instanceof Error ? err.message : err);
    console.error('Run: npm run db:migrate');
    process.exit(1);
  }

  await ensureBootstrapAdmin();

  app.listen(PORT, () => {
    console.log(`AI Content Automation API running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
