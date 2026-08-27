import dotenv from 'dotenv';
import path from 'path';

// Load .env from repo root, then packages/api (Prisma CLI uses the latter)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
