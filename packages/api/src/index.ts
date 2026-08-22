import express from 'express';
import cors from 'cors';
import path from 'path';
import { apiRouter } from './routes/api';

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

app.use('/api', apiRouter);

const adminDist = path.join(__dirname, '../../admin/dist');
app.use(express.static(adminDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') return next();
  res.sendFile(path.join(adminDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`AI Content Automation API running on http://localhost:${PORT}`);
});
