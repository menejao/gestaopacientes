import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const DB_PATH = path.resolve(process.cwd(), "data", "db.json");
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const DB_DRIVER = DATABASE_URL ? "postgres" : "file";

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

let initialized = false;

async function readDbFromFile() {
  const raw = await fs.readFile(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

async function writeDbToFile(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

async function ensurePostgresState(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(
    `
      INSERT INTO app_state (id, data)
      VALUES (1, $1::jsonb)
      ON CONFLICT (id) DO NOTHING
    `,
    [JSON.stringify({})]
  );
}

async function initialize() {
  if (initialized) return;

  if (DB_DRIVER === "postgres") {
    const client = await pool.connect();
    try {
      await ensurePostgresState(client);
    } finally {
      client.release();
    }
  }

  initialized = true;
}

async function readDbFromPostgres() {
  await initialize();
  const result = await pool.query("SELECT data FROM app_state WHERE id = 1");
  return result.rows[0]?.data || {};
}

async function readDb() {
  if (DB_DRIVER === "postgres") {
    return readDbFromPostgres();
  }
  return readDbFromFile();
}

async function withDb(mutator) {
  if (DB_DRIVER === "postgres") {
    await initialize();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query("SELECT data FROM app_state WHERE id = 1 FOR UPDATE");
      const db = result.rows[0]?.data || {};

      const mutatorResult = await mutator(db);

      await client.query(
        "UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1",
        [JSON.stringify(db)]
      );

      await client.query("COMMIT");
      return mutatorResult;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const db = await readDbFromFile();
  const result = await mutator(db);
  await writeDbToFile(db);
  return result;
}

export { readDb, withDb };
