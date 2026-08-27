import { getUserCount, createUser } from './auth';

/**
 * Creates a default super admin from environment variables on first startup.
 * Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_NAME before first run.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  if ((await getUserCount()) > 0) return;

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Platform Admin';

  if (!email || !password) {
    console.log('No users found. Create the first admin via POST /api/auth/bootstrap or set ADMIN_EMAIL + ADMIN_PASSWORD.');
    return;
  }

  await createUser(email, password, name, true);
  console.log(`Bootstrap admin created: ${email}`);
}
