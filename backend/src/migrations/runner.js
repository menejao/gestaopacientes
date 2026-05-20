/**
 * Migration runner for Postgres mode.
 * No-ops in file mode (migrations are only needed for schema changes in Postgres).
 *
 * Usage: called from server.js when RUN_MIGRATIONS=true.
 *
 * Each migration file exports:
 *   export const id = "001_create_app_state";
 *   export async function up(client) { ... }
 */

import { Pool } from "pg";

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

// AWS RDS uses an AWS-issued CA. Setting rejectUnauthorized=false allows SSL
// without requiring the AWS bundle to be in the Node trust store.
// Override with DB_SSL_REJECT_UNAUTHORIZED=true if your env has the cert bundle.
const DB_SSL_REJECT_UNAUTHORIZED =
  String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "false").trim().toLowerCase() === "true";

function buildSslConfig() {
  if (!DATABASE_URL) return undefined;
  return { rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED };
}

async function runMigrations() {
  if (!DATABASE_URL) {
    console.log("[migration] modo arquivo — sem migrations SQL");
    return;
  }

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: buildSslConfig(),
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
  });

  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { migrations } = await import("./index.js");

    for (const migration of migrations) {
      const { rows } = await client.query(
        "SELECT id FROM schema_migrations WHERE id = $1",
        [migration.id]
      );
      if (rows.length > 0) {
        console.log(`[migration] ${migration.id} — já aplicada, pulando`);
        continue;
      }

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
        throw new Error(`Migration ${migration.id} falhou: ${err.message}`);
      }
    }

    console.log("[migration] todas as migrations aplicadas");
  } finally {
    client.release();
    await pool.end();
  }
}

export { runMigrations };
