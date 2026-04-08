// Neon Postgres client for server-side use (API routes only)
// Import this in api/ files, never in src/ client-side code

import { neon } from '@neondatabase/serverless';

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}
