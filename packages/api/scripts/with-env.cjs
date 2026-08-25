/**
 * Loads .env from repo root, then runs the given command.
 * Usage: node scripts/with-env.cjs prisma migrate dev
 */
const { config } = require('dotenv');
const { spawnSync } = require('child_process');
const path = require('path');

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '../..');

config({ path: path.join(repoRoot, '.env') });
config({ path: path.join(apiRoot, '.env') });

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node scripts/with-env.cjs <command> [args...]');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  console.error(`Create ${path.join(repoRoot, '.env')} from .env.example and set DATABASE_URL.`);
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: true,
  cwd: apiRoot,
  env: process.env,
});

process.exit(result.status ?? 1);
