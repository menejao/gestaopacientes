import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Pool } from "pg";

const DB_PATH = process.env.TEST_DB_PATH
  ? path.resolve(process.env.TEST_DB_PATH)
  : path.resolve(process.cwd(), "data", "db.json");
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const DB_DRIVER = DATABASE_URL ? "postgres" : "file";
const DATA_ENCRYPTION_KEY = String(process.env.DATA_ENCRYPTION_KEY || "").trim();
const ENC_PREFIX = "enc1:";
const SENSITIVE_PATIENT_FIELDS = ["cpf", "cns", "cnsCpf"];
const SENSITIVE_USER_FIELDS = ["twoFactorSecret", "twoFactorPendingSecret"];

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: true
    })
  : null;

let initialized = false;

function getEncryptionKey() {
  if (!DATA_ENCRYPTION_KEY) return null;
  return crypto.createHash("sha256").update(DATA_ENCRYPTION_KEY).digest();
}

function isEncryptedText(value) {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

function encryptText(value, key) {
  const raw = String(value || "");
  if (!raw) return "";
  if (!key) return raw;
  if (isEncryptedText(raw)) return raw;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${encrypted.toString("base64")}:${tag.toString("base64")}`;
}

function decryptText(value, key) {
  const raw = String(value || "");
  if (!raw) return "";
  if (!isEncryptedText(raw)) return raw;
  if (!key) throw new Error("DATA_ENCRYPTION_KEY ausente para descriptografar dados sensíveis");

  const [, payload] = raw.split(ENC_PREFIX);
  const [ivB64, encB64, tagB64] = String(payload || "").split(":");
  if (!ivB64 || !encB64 || !tagB64) throw new Error("Formato inválido de dado criptografado");
  const iv = Buffer.from(ivB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const tag = Buffer.from(tagB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function cloneState(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function transformSensitiveState(state, mode) {
  const key = getEncryptionKey();
  const data = cloneState(state || {});
  const transform = mode === "encrypt"
    ? (value) => encryptText(value, key)
    : (value) => decryptText(value, key);

  if (Array.isArray(data.patients)) {
    data.patients = data.patients.map((patient) => {
      const next = { ...patient };
      for (const field of SENSITIVE_PATIENT_FIELDS) {
        next[field] = transform(next[field]);
      }
      return next;
    });
  }

  if (Array.isArray(data.users)) {
    data.users = data.users.map((user) => {
      const next = { ...user };
      for (const field of SENSITIVE_USER_FIELDS) {
        next[field] = transform(next[field]);
      }
      return next;
    });
  }

  return data;
}

function serializeStateForStorage(state) {
  return transformSensitiveState(state, "encrypt");
}

function deserializeStateFromStorage(state) {
  return transformSensitiveState(state, "decrypt");
}

function hashDefaultPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `s1$${salt}$${key}`;
}

function buildDefaultState() {
  const now = new Date().toISOString();
  const protocolTemplates = [
    { category: "general", label: "Geral", targets: { visits: 2, consultations: 2, vaccines: 1 }, vaccines: ["Influenza"], authority: "Ministerio da Saude", reference: "https://bvsms.saude.gov.br/bvs/publicacoes/politica_nacional_atencao_basica_2017.pdf", version: "PNAB-2017" },
    { category: "pregnant", label: "Gestante", targets: { visits: 6, consultations: 7, vaccines: 3 }, vaccines: ["dTpa", "Hepatite B", "Influenza"], authority: "Ministerio da Saude", reference: "https://bvsms.saude.gov.br/bvs/saudelegis/gm/2011/prt1459_24_06_2011.html", version: "Rede Cegonha" },
    { category: "puerperal", label: "Puerpera", targets: { visits: 2, consultations: 2, vaccines: 1 }, vaccines: ["dTpa"], authority: "Ministerio da Saude", reference: "https://bvsms.saude.gov.br/bvs/saudelegis/gm/2011/prt1459_24_06_2011.html", version: "Rede Cegonha" },
    { category: "pap_only", label: "Somente Papanicolau", targets: { visits: 1, consultations: 1, vaccines: 0 }, vaccines: [], authority: "Ministerio da Saude", reference: "https://www.inca.gov.br/controle-do-cancer-do-colo-do-utero/acoes-de-controle/rastreamento", version: "Rastreamento vigente" },
    { category: "child_followup", label: "Puericultura", targets: { visits: 4, consultations: 6, vaccines: 6 }, vaccines: ["BCG", "Pentavalente", "Polio", "Rotavirus", "Pneumococica", "Meningococica"], authority: "Ministerio da Saude", reference: "https://www.gov.br/saude/pt-br/vacinacao/calendario", version: "Calendario PNI" },
    { category: "chronic", label: "Condicao Cronica", targets: { visits: 3, consultations: 3, vaccines: 2 }, vaccines: ["Influenza", "COVID-19"], authority: "Ministerio da Saude", reference: "https://bvsms.saude.gov.br/bvs/publicacoes/plano_acoes_estrategicas_enfrentamento_dc_nt_2021_2030.pdf", version: "DCNT 2021-2030" }
  ];

  return {
    protocolTemplates,
    teams: [
      {
        id: "team-ana",
        name: "Equipe Enfermeira Ana",
        managerUserId: "u1",
        createdAt: now
      }
    ],
    users: [
      {
        id: "u1",
        name: "Enfermeira Ana",
        role: "nurse_manager",
        email: "ana@clinica.local",
        password: hashDefaultPassword("123456"),
        teamId: "team-ana",
        councilType: "COREN",
        councilNumber: "123456",
        councilUf: "SP",
        createdAt: now
      },
      {
        id: "u2",
        name: "ACS Carlos",
        role: "acs",
        email: "carlos@clinica.local",
        password: hashDefaultPassword("123456"),
        teamId: "team-ana",
        createdAt: now
      }
    ],
    patients: [],
    appointments: [],
    tasks: [],
    messages: [],
    privacyRequests: [],
    auditLogs: [],
    clinicalRecords: []
  };
}

async function readDbFromFile() {
  const raw = (await fs.readFile(DB_PATH, "utf-8")).replace(/^﻿/, "");
  return deserializeStateFromStorage(JSON.parse(raw));
}

async function readDbSnapshotFromFileStorage() {
  const raw = (await fs.readFile(DB_PATH, "utf-8")).replace(/^﻿/, "");
  return JSON.parse(raw);
}

async function writeDbToFile(data) {
  const safeData = serializeStateForStorage(data);
  await fs.writeFile(DB_PATH, JSON.stringify(safeData, null, 2), "utf-8");
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
    [JSON.stringify(buildDefaultState())]
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
  const data = deserializeStateFromStorage(result.rows[0]?.data || {});

  // Self-heal previously empty state created by earlier deployments.
  const usersEmpty = !Array.isArray(data.users) || data.users.length === 0;
  const patientsEmpty = !Array.isArray(data.patients) || data.patients.length === 0;
  if (usersEmpty || patientsEmpty) {
    let seeded = buildDefaultState();
    try {
      const fileSnapshot = await readDbFromFile();
      const hasUsersInFile = Array.isArray(fileSnapshot?.users) && fileSnapshot.users.length > 0;
      const hasPatientsInFile = Array.isArray(fileSnapshot?.patients) && fileSnapshot.patients.length > 0;
      if (hasUsersInFile || hasPatientsInFile) {
        seeded = fileSnapshot;
      }
    } catch {
      // Se não conseguir ler o arquivo local, segue com estado padrão.
    }
    await pool.query(
      "UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1",
      [JSON.stringify(seeded)]
    );
    return seeded;
  }

  return data;
}

async function readDb() {
  if (DB_DRIVER === "postgres") {
    return readDbFromPostgres();
  }
  return readDbFromFile();
}

async function readDbForBackup() {
  if (DB_DRIVER === "postgres") {
    await initialize();
    const result = await pool.query("SELECT data FROM app_state WHERE id = 1");
    return result.rows[0]?.data || {};
  }
  return readDbSnapshotFromFileStorage();
}

async function withDb(mutator) {
  if (DB_DRIVER === "postgres") {
    await initialize();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query("SELECT data FROM app_state WHERE id = 1 FOR UPDATE");
      const db = deserializeStateFromStorage(result.rows[0]?.data || {});

      const mutatorResult = await mutator(db);

      await client.query(
        "UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1",
        [JSON.stringify(serializeStateForStorage(db))]
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

export { readDb, readDbForBackup, withDb };


