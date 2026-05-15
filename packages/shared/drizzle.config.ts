import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error('TURSO_DATABASE_URL is required');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'turso',
  dbCredentials: {
    url,
    authToken,
  },
  strict: true,
  verbose: true,
});
