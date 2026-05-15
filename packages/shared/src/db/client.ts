import { type Client, createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';

import * as schema from './schema';

// Lazy initialisation: defer the env check + sqlite client creation
// until the first `db.*` call. Keeps the package import-safe in build
// environments that load the module for type collection but never run
// a query.
let dbInstance: LibSQLDatabase<typeof schema> | null = null;
let sqliteInstance: Client | null = null;

function getSqlite(): Client {
  if (sqliteInstance !== null) return sqliteInstance;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw new Error('TURSO_DATABASE_URL is required');
  }
  sqliteInstance = authToken ? createClient({ url, authToken }) : createClient({ url });
  return sqliteInstance;
}

function getDb(): LibSQLDatabase<typeof schema> {
  if (dbInstance !== null) return dbInstance;
  dbInstance = drizzle(getSqlite(), { schema });
  return dbInstance;
}

export const db: LibSQLDatabase<typeof schema> = new Proxy({} as LibSQLDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    return real[prop];
  },
});

export type Database = LibSQLDatabase<typeof schema>;
export * from './schema';
