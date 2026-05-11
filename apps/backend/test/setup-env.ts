import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// Loaded into every Jest worker before any test code runs. Required because
// the global-setup hook only runs once at the parent process level and Jest
// workers don't inherit those env mutations reliably.
loadEnv({ path: resolve(__dirname, '../.env.test') });
