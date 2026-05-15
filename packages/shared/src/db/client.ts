import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error('TURSO_DATABASE_URL is required');
}

const sqlite = authToken ? createClient({ url, authToken }) : createClient({ url });

export const db = drizzle(sqlite, { schema });

export type Database = typeof db;
export * from './schema.js';
