/**
 * Migration runner for Postgres mode.
 * No-ops in file mode (migrations are only needed for schema changes in Postgres).
 *
 * Usage: called automatically from server.js before the app starts.
 *
 * Each migration file exports:
 *   export const id = "001_create_app_state";
 *   export async function up(client) { ... }
 */

import { Pool } from "pg";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

async function runMigrations() {
  if (!DATABASE_URL) {
    return; // file mode — nothing to migrate
  }

  const pool = new Pool({ connectionString: DATABASE_URL, ssl: true });
  const client = await pool.connect();

  try {
    // Bootstrap: create the migrations control table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Discover and apply pending migrations in order
    const { migrations } = await import("./index.js");

    for (const migration of migrations) {
      const { rows } = await client.query(
        "SELECT id FROM schema_migrations WHERE id = $1",
        [migration.id]
      );
      if (rows.length > 0) continue; // already applied

      console.log(`[migration] applying ${migration.id}...`);
      await client.query("BEGIN");
      try {
        await migration.up(client);
        await client.query(
          "INSERT INTO schema_migrations (id) VALUES ($1)",
          [migration.id]
        );
        await client.query("COMMIT");
        console.log(`[migration] ${migration.id} — OK`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${migration.id} failed: ${err.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

export { runMigrations };
