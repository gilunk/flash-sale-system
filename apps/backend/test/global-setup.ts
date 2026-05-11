import { execSync } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// Loaded once before any test runs. Applies the latest migrations to the
// throwaway test DB so integration tests start from a clean, current schema.
export default async function globalSetup() {
  loadEnv({ path: resolve(__dirname, '../.env.test') });

  if (!process.env.DATABASE_URL?.includes('flashsale_test')) {
    throw new Error(
      'Refusing to run migrations: DATABASE_URL is not pointing at flashsale_test. ' +
        'Make sure apps/backend/.env.test is loaded.',
    );
  }

  execSync('npx prisma migrate deploy', {
    env: process.env as NodeJS.ProcessEnv,
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
  });
}
