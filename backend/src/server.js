import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { readDb, withDb } from "./db.js";
import {
  patientSummary,
  protocolHighlights,
  evolutionDraft,
  acsMessage,
  suggestProtocolCategory,
  transcribePayload,
  teamPriorities,
  dataQualityChecks,
  teamReport,
  chatAnswer
} from "./ai.js";

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
const JWT_SECRET = String(process.env.JWT_SECRET || "").trim() || "dev-only-jwt-secret-change-me";
const FRONTEND_ORIGINS = String(process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const AUTH_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const AUTH_MAX_ATTEMPTS = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || 20);
const authRateMap = new Map();

if (IS_PROD && (!process.env.JWT_SECRET || JWT_SECRET === "dev-only-jwt-secret-change-me")) {
  throw new Error("JWT_SECRET obrigatório em produção");
}

const DEFAULT_CARE_PROTOCOLS = {
  general: {
    category: "general",
    label: "Geral",
    targets: { visits: 2, consultations: 2, vaccines: 1 },
    deadlines: { visits: 0, consultations: 0, vaccines: 0 },
    vaccines: ["Influenza"]
  },
  pregnant: {
    category: "pregnant",
    label: "Gestante",
    targets: { visits: 3, consultations: 7, vaccines: 4 },
    deadlines: { visits: 0, consultations: 0, vaccines: 0 },
    vaccines: ["dTpa", "Influenza", "COVID-19", "Hepatite B"]
  },
  puerperal: {
    category: "puerperal",
    label: "Puérpera",
    targets: { visits: 1, consultations: 1, vaccines: 0 },
    deadlines: { visits: 0, consultations: 0, vaccines: 0 },
    vaccines: []
  },
  pap_only: {
    category: "pap_only",
    label: "Rastreamento Feminino/Trans",
    targets: { visits: 0, consultations: 1, vaccines: 1 },
    deadlines: { visits: 0, consultations: 0, vaccines: 0 },
    vaccines: ["HPV"]
  },
  child_followup: {
    category: "child_followup",
    label: "Puericultura",
    targets: { visits: 2, consultations: 10, vaccines: 0 },
    deadlines: { visits: 0, consultations: 0, vaccines: 0 },
    vaccines: ["BCG", "Hepatite B", "Penta", "VIP", "Pneumo 10", "Rotavírus", "Meningocócica", "Influenza", "COVID", "Febre amarela", "ACWY", "Tríplice viral", "DTP", "Varicela", "Hepatite A"]
  },
  chronic: {
    category: "chronic",
    label: "Condição Crônica",
    targets: { visits: 3, consultations: 3, vaccines: 2 },
    deadlines: { visits: 0, consultations: 0, vaccines: 0 },
    vaccines: ["Influenza", "COVID-19"]
  },
  elderly: {
    category: "elderly",
    label: "Pessoa Idosa",
    targets: { visits: 2, consultations: 1, vaccines: 1 },
    deadlines: { visits: 0, consultations: 0, vaccines: 0 },
    vaccines: ["Influenza"]
  }
};

function buildDefaultProtocolTemplates() {
  const ministryRefs = {
    general: {
      reference: "https://bvsms.saude.gov.br/bvs/publicacoes/politica_nacional_atencao_basica_2017.pdf",
      version: "PNAB-2017"
    },
    pregnant: {
      reference: "https://bvsms.saude.gov.br/bvs/saudelegis/gm/2011/prt1459_24_06_2011.html",
      version: "Rede Cegonha"
    },
    puerperal: {
      reference: "https://bvsms.saude.gov.br/bvs/saudelegis/gm/2011/prt1459_24_06_2011.html",
      version: "Rede Cegonha"
    },
    pap_only: {
      reference: "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/c/cancer-do-colo-do-utero",
      version: "Rastreamento Colo e Mama"
    },
    child_followup: {
      reference: "https://www.gov.br/saude/pt-br/vacinacao/calendario",
      version: "Calendário PNI"
    },
    chronic: {
      reference: "https://bvsms.saude.gov.br/bvs/publicacoes/plano_acoes_estrategicas_enfrentamento_dc_nt_2021_2030.pdf",
      version: "DCNT 2021-2030"
    },
    elderly: {
      reference: "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/saude-da-pessoa-idosa",
      version: "Cuidado da Pessoa Idosa"
    }
  };

  return Object.values(DEFAULT_CARE_PROTOCOLS).map((template) => ({
    category: template.category,
    label: template.label,
    targets: {
      visits: Number(template.targets?.visits || 0),
      consultations: Number(template.targets?.consultations || 0),
      vaccines: Number(template.targets?.vaccines || 0)
    },
    deadlines: {
      visits: Number(template.deadlines?.visits || 0),
      consultations: Number(template.deadlines?.consultations || 0),
      vaccines: Number(template.deadlines?.vaccines || 0)
    },
    vaccines: Array.isArray(template.vaccines) ? template.vaccines : [],
    authority: "Ministério da Saúde",
    reference: ministryRefs[template.category]?.reference || "",
    version: ministryRefs[template.category]?.version || "1.0"
  }));
}

const ALLOWED_SELF_REGISTER_ROLES = ["acs", "doctor", "nurse_manager"];
const PRIVACY_REQUEST_TYPES = new Set(["access", "correction", "deletion"]);
const PRIVACY_REQUEST_STATUS = new Set(["pending", "in_review", "approved", "rejected", "completed"]);
const VALID_UF = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
]);
const DEFAULT_TEAM_COLORS = [
  "Rosa",
  "Azul",
  "Verde",
  "Amarela",
  "Laranja",
  "Roxa"
];

app.use(cors());
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (!FRONTEND_ORIGINS.length) return callback(null, true);
    if (FRONTEND_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error("Origem não permitida por CORS"));
  }
}));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use(express.json({ limit: "1mb" }));

function canonicalRole(role) {
  const input = String(role || "").trim().toLowerCase();
  if (input === "nurse") return "nurse_manager";
  if (input === "medica") return "doctor";
  if (input === "enfermeiro") return "nurse_manager";
  return input;
}

function normalizeDemandType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "spontaneous" || raw === "espontanea" || raw === "espontânea") return "spontaneous";
  return "scheduled";
}

function councilTypeForRole(role) {
  if (role === "doctor") return "CRM";
  if (role === "nurse_manager") return "COREN";
  return "";
}

function roleNeedsCouncil(role) {
  return ["doctor", "nurse_manager"].includes(role);
}

function isStrongPassword(password) {
  const value = String(password || "");
  if (value.length < 8) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/\d/.test(value)) return false;
  if (!/[!@#$%^&*(),.?":{}|<>_\-\\[\]\/+=~`]/.test(value)) return false;
  return true;
}

function isValidEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `s1$${salt}$${key}`;
}

function isHashedPassword(value) {
  return /^s1\$[a-f0-9]{32}\$[a-f0-9]{128}$/i.test(String(value || ""));
}

function verifyPassword(password, stored) {
  const candidate = String(password || "");
  const value = String(stored || "");
  if (!value) return false;
  if (!isHashedPassword(value)) return candidate === value;
  const [, salt, key] = value.split("$");
  const derived = crypto.scryptSync(candidate, salt, 64).toString("hex");
  const left = Buffer.from(derived, "hex");
  const right = Buffer.from(key, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getClientIp(req) {
  const headerIp = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return headerIp || String(req.ip || req.socket?.remoteAddress || "unknown");
}

function cleanupRateMap(now = Date.now()) {
  for (const [key, value] of authRateMap.entries()) {
    if (now - value.firstAt > AUTH_WINDOW_MS) authRateMap.delete(key);
  }
}

function authRateLimit(req, res, next) {
  const now = Date.now();
  cleanupRateMap(now);
  const ip = getClientIp(req);
  const bucket = authRateMap.get(ip) || { count: 0, firstAt: now };
  if (now - bucket.firstAt > AUTH_WINDOW_MS) {
    bucket.count = 0;
    bucket.firstAt = now;
  }
  bucket.count += 1;
  authRateMap.set(ip, bucket);
  if (bucket.count > AUTH_MAX_ATTEMPTS) {
    return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
  }
  return next();
}

function isSequentialDigits(input) {
  const chars = [...input].map((c) => Number(c));
  let asc = true;
  let desc = true;

  for (let i = 1; i < chars.length; i += 1) {
    if (chars[i] !== chars[i - 1] + 1) asc = false;
    if (chars[i] !== chars[i - 1] - 1) desc = false;
  }

  return asc || desc;
}

function isRepeatedDigits(input) {
  return /^(\d)\1+$/.test(input);
}

function isManager(user) {
  return canonicalRole(user?.role) === "nurse_manager";
}

function isDoctor(user) {
  return canonicalRole(user?.role) === "doctor";
}

function isAcs(user) {
  return canonicalRole(user?.role) === "acs";
}

function ensureArray(db, key) {
  if (!Array.isArray(db[key])) {
    db[key] = [];
  }
}

function ensureDbShape(db) {
  ensureArray(db, "teams");
  ensureArray(db, "users");
  ensureArray(db, "patients");
  ensureArray(db, "appointments");
  ensureArray(db, "tasks");
  ensureArray(db, "messages");
  ensureArray(db, "auditLogs");
  ensureArray(db, "clinicalRecords");
  ensureArray(db, "protocolTemplates");
  ensureArray(db, "privacyRequests");
  ensureArray(db, "registerVerifications");
  ensureArray(db, "loginChallenges");

  if (!db.teams.length) {
    const defaultTeamId = "team-default";
    db.teams.push({
      id: defaultTeamId,
      name: "Equipe Enfermeira Ana",
      managerUserId: "u1",
      createdAt: new Date().toISOString()
    });

    db.users = db.users.map((u) => ({ ...u, teamId: u.teamId || defaultTeamId }));
  }

  // Garante equipes base por cor para o auto cadastro público.
  const byId = new Set(db.teams.map((t) => String(t.id || "").trim().toLowerCase()));
  const byName = new Set(db.teams.map((t) => String(t.name || "").trim().toLowerCase()));
  for (const color of DEFAULT_TEAM_COLORS) {
    const id = `team-${color.toLowerCase()}`;
    const name = `Equipe ${color}`;
    if (byId.has(id) || byName.has(name.toLowerCase())) continue;
    db.teams.push({
      id,
      name,
      managerUserId: "",
      createdAt: new Date().toISOString()
    });
    byId.add(id);
    byName.add(name.toLowerCase());
  }

  if (!db.protocolTemplates.length) {
    db.protocolTemplates = buildDefaultProtocolTemplates();
  } else {
    const defaultTemplates = buildDefaultProtocolTemplates();
    const defaultsByCategory = Object.fromEntries(defaultTemplates.map((t) => [t.category, t]));
    db.protocolTemplates = db.protocolTemplates
      .map((t) => ({
        ...t,
        label: defaultsByCategory[t.category]?.label || t.label,
        targets: defaultsByCategory[t.category]?.targets || t.targets,
        deadlines: {
          visits: Number(defaultsByCategory[t.category]?.deadlines?.visits ?? t.deadlines?.visits ?? 0),
          consultations: Number(defaultsByCategory[t.category]?.deadlines?.consultations ?? t.deadlines?.consultations ?? 0),
          vaccines: Number(defaultsByCategory[t.category]?.deadlines?.vaccines ?? t.deadlines?.vaccines ?? 0)
        },
        vaccines: Array.isArray(defaultsByCategory[t.category]?.vaccines)
          ? defaultsByCategory[t.category].vaccines
          : (Array.isArray(t.vaccines) ? t.vaccines : []),
        authority: String(t.authority || "Ministério da Saúde"),
        reference: String(t.reference || defaultsByCategory[t.category]?.reference || ""),
        version: String(t.version || defaultsByCategory[t.category]?.version || "1.0")
      }));

    // Garante que toda categoria padrão exista ao menos no template global.
    const hasGlobalByCategory = new Set(
      db.protocolTemplates
        .filter((t) => !t.teamId)
        .map((t) => String(t.category || ""))
    );
    for (const template of defaultTemplates) {
      if (hasGlobalByCategory.has(template.category)) continue;
      db.protocolTemplates.push({ ...template });
    }
  }

  db.patients = db.patients.map((p) => ({
    ...p,
    cpf: p.cpf ? String(p.cpf) : "",
    cns: p.cns ? String(p.cns) : "",
    cnsCpf: p.cnsCpf ? String(p.cnsCpf) : (p.cpf ? String(p.cpf) : ""),
    careCategory: String(p.careCategory || "general"),
    chronicConditions: normalizeChronicConditions(p.chronicConditions),
    motherName: p.motherName ? String(p.motherName) : "",
    phoneAlt: p.phoneAlt ? String(p.phoneAlt) : "",
    maritalStatus: p.maritalStatus ? String(p.maritalStatus) : "",
    sexAtBirth: p.sexAtBirth ? String(p.sexAtBirth) : "",
    genderIdentity: p.genderIdentity ? String(p.genderIdentity) : "",
    birthDate: p.birthDate ? String(p.birthDate) : "",
    pregnancyStartDate: p.pregnancyStartDate ? String(p.pregnancyStartDate) : "",
    expectedDeliveryDate: p.expectedDeliveryDate ? String(p.expectedDeliveryDate) : "",
    gestationalAgeDumWeeks: Number.isFinite(Number(p.gestationalAgeDumWeeks)) ? Number(p.gestationalAgeDumWeeks) : "",
    gestationalAgeUsgWeeks: Number.isFinite(Number(p.gestationalAgeUsgWeeks)) ? Number(p.gestationalAgeUsgWeeks) : "",
    usgDate1: p.usgDate1 ? String(p.usgDate1) : "",
    usgDate2: p.usgDate2 ? String(p.usgDate2) : "",
    usgDate3: p.usgDate3 ? String(p.usgDate3) : "",
    prenatalStartDate: p.prenatalStartDate ? String(p.prenatalStartDate) : "",
    postpartumStartDate: p.postpartumStartDate ? String(p.postpartumStartDate) : ""
  }));

  db.appointments = db.appointments.map((a) => ({
    ...a,
    demandType: normalizeDemandType(a.demandType)
  }));
}

function getTeamById(db, id) {
  return db.teams.find((t) => t.id === id);
}

function getTeamNameById(db, id) {
  return getTeamById(db, id)?.name || "Sem equipe";
}

function sanitizeUser(user, db) {
  const { password: _password, ...safe } = user;
  const role = canonicalRole(safe.role);
  return {
    ...safe,
    role,
    councilType: safe.councilType || councilTypeForRole(role) || "",
    councilNumber: safe.councilNumber || "",
    councilUf: safe.councilUf || "",
    teamName: getTeamNameById(db, safe.teamId)
  };
}

async function ensureDemoManagerIfNeeded(email, password) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const rawPassword = String(password || "");
  const demoEmail = "ana@clinica.local";
  const demoPassword = "123456";

  if (normalizedEmail !== demoEmail || rawPassword !== demoPassword) {
    return null;
  }

  return withDb(async (db) => {
    ensureDbShape(db);
    const existing = db.users.find(
      (u) => String(u.email || "").trim().toLowerCase() === demoEmail
    );

    if (existing) {
      // Repair mode: garante que a credencial demo volte a funcionar.
      existing.password = hashPassword(demoPassword);
      existing.role = "nurse_manager";
      existing.name = existing.name || "Enfermeira Ana";
      existing.councilType = existing.councilType || "COREN";
      existing.councilNumber = existing.councilNumber || "123456";
      existing.councilUf = existing.councilUf || "SP";
      existing.updatedAt = new Date().toISOString();

      if (!existing.teamId) {
        let fallbackTeam = db.teams[0];
        if (!fallbackTeam) {
          fallbackTeam = {
            id: `team-${uuidv4()}`,
            name: "Equipe Enfermeira Ana",
            managerUserId: "",
            createdAt: new Date().toISOString()
          };
          db.teams.push(fallbackTeam);
        }
        existing.teamId = fallbackTeam.id;
        if (!fallbackTeam.managerUserId) fallbackTeam.managerUserId = existing.id;
      }

      return { user: existing, db };
    }

    let team = db.teams[0];
    if (!team) {
      team = {
        id: `team-${uuidv4()}`,
        name: "Equipe Enfermeira Ana",
        managerUserId: "",
        createdAt: new Date().toISOString()
      };
      db.teams.push(team);
    }

    const demoUser = {
      id: uuidv4(),
      name: "Enfermeira Ana",
      role: "nurse_manager",
      email: demoEmail,
      password: hashPassword(demoPassword),
      teamId: team.id,
      councilType: "COREN",
      councilNumber: "123456",
      councilUf: "SP",
      createdAt: new Date().toISOString()
    };

    db.users.push(demoUser);
    if (!team.managerUserId) {
      team.managerUserId = demoUser.id;
    }
    return { user: demoUser, db };
  });
}

async function migrateLegacyPlaintextPasswords() {
  await withDb((db) => {
    ensureDbShape(db);
    let changed = false;
    db.users = db.users.map((user) => {
      if (!isHashedPassword(user.password)) {
        changed = true;
        return { ...user, password: hashPassword(user.password || ""), updatedAt: new Date().toISOString() };
      }
      return user;
    });
    return changed;
  });
}

function createToken(user, db) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      role: canonicalRole(user.role),
      email: user.email,
      teamId: user.teamId,
      teamName: getTeamNameById(db, user.teamId)
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token ausente" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      ...payload,
      role: canonicalRole(payload.role)
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

function requireManager(req, res, next) {
  if (!isManager(req.user)) {
    return res.status(403).json({ error: "Somente enfermeira pode executar esta ação" });
  }
  return next();
}

function requireManagerOrDoctor(req, res, next) {
  if (!(isManager(req.user) || isDoctor(req.user))) {
    return res.status(403).json({ error: "Apenas enfermeira ou médica podem executar esta ação" });
  }
  return next();
}

function addAuditLog(db, user, action, entity, entityId, details = {}) {
  ensureArray(db, "auditLogs");
  db.auditLogs.push({
    id: uuidv4(),
    action,
    entity,
    entityId,
    userId: user.id,
    userName: user.name,
    userRole: canonicalRole(user.role),
    details,
    createdAt: new Date().toISOString()
  });
}

function isAnonymizedPatient(patient) {
  return Boolean(patient?.privacy?.anonymizedAt);
}

function getPatientActivityDate(db, patientId) {
  const patient = db.patients.find((p) => p.id === patientId);
  const dates = [
    patient?.updatedAt,
    patient?.createdAt,
    ...db.appointments.filter((a) => a.patientId === patientId).map((a) => a.date || a.createdAt),
    ...db.clinicalRecords.filter((r) => r.patientId === patientId).map((r) => r.date || r.createdAt),
    ...db.messages.filter((m) => m.patientId === patientId).map((m) => m.createdAt),
    ...db.tasks.filter((t) => t.patientId === patientId).map((t) => t.updatedAt || t.createdAt)
  ].filter(Boolean);

  if (!dates.length) return null;
  dates.sort((a, b) => String(b).localeCompare(String(a)));
  return dates[0];
}

function buildPatientAccessReport(db, patient) {
  const patientId = patient.id;
  const appointments = db.appointments.filter((a) => a.patientId === patientId);
  const records = db.clinicalRecords.filter((r) => r.patientId === patientId);
  const messages = db.messages.filter((m) => m.patientId === patientId);
  const tasks = db.tasks.filter((t) => t.patientId === patientId);
  const lastActivityAt = getPatientActivityDate(db, patientId);

  return {
    generatedAt: new Date().toISOString(),
    patient: {
      id: patient.id,
      name: patient.name,
      motherName: patient.motherName || "",
      cpf: patient.cpf || "",
      cns: patient.cns || "",
      cnsCpf: patient.cnsCpf || "",
      phone: patient.phone || "",
      phoneAlt: patient.phoneAlt || "",
      address: patient.address || "",
      careCategory: patient.careCategory || "general",
      chronicConditions: normalizeChronicConditions(patient.chronicConditions),
      maritalStatus: patient.maritalStatus || "",
      sexAtBirth: patient.sexAtBirth || "",
      genderIdentity: patient.genderIdentity || "",
      birthDate: patient.birthDate || "",
      pregnancyStartDate: patient.pregnancyStartDate || "",
      expectedDeliveryDate: patient.expectedDeliveryDate || "",
      gestationalAgeDumWeeks: Number.isFinite(Number(patient.gestationalAgeDumWeeks)) ? Number(patient.gestationalAgeDumWeeks) : "",
      gestationalAgeUsgWeeks: Number.isFinite(Number(patient.gestationalAgeUsgWeeks)) ? Number(patient.gestationalAgeUsgWeeks) : "",
      usgDate1: patient.usgDate1 || "",
      usgDate2: patient.usgDate2 || "",
      usgDate3: patient.usgDate3 || "",
      prenatalStartDate: patient.prenatalStartDate || "",
      postpartumStartDate: patient.postpartumStartDate || "",
      assignedAcsId: patient.assignedAcsId || "",
      comorbidities: patient.comorbidities || "",
      medications: patient.medications || "",
      allergies: patient.allergies || ""
    },
    summary: {
      appointments: appointments.length,
      clinicalRecords: records.length,
      messages: messages.length,
      tasks: tasks.length,
      lastActivityAt
    },
    appointments: appointments.map((a) => ({
      id: a.id,
      date: a.date,
      summary: a.summary,
      demandType: normalizeDemandType(a.demandType),
      conduct: a.conduct || "",
      nextStep: a.nextStep || "",
      createdAt: a.createdAt
    })),
    clinicalRecords: records.map((r) => ({
      id: r.id,
      type: r.type,
      date: r.date,
      title: r.title,
      details: r.details || "",
      protocolTag: r.protocolTag || "",
      createdAt: r.createdAt
    })),
    messages: messages.map((m) => ({
      id: m.id,
      text: m.text,
      authorName: m.authorName,
      createdAt: m.createdAt
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes || "",
      status: t.status,
      dueDate: t.dueDate || "",
      createdAt: t.createdAt,
      updatedAt: t.updatedAt || t.createdAt
    }))
  };
}

function applyPatientCorrection(db, user, patient, corrections = {}) {
  const allowed = new Set([
    "name",
    "motherName",
    "phone",
    "phoneAlt",
    "cpf",
    "cns",
    "cnsCpf",
    "address",
    "microArea",
    "assignedAcsId",
    "careCategory",
    "chronicConditions",
    "maritalStatus",
    "sexAtBirth",
    "genderIdentity",
    "birthDate",
    "pregnancyStartDate",
    "expectedDeliveryDate",
    "gestationalAgeDumWeeks",
    "gestationalAgeUsgWeeks",
    "usgDate1",
    "usgDate2",
    "usgDate3",
    "prenatalStartDate",
    "postpartumStartDate",
    "comorbidities",
    "medications",
    "allergies"
  ]);
  const next = { ...patient };
  const changedFields = [];

  for (const [key, value] of Object.entries(corrections || {})) {
    if (!allowed.has(key)) continue;
    if (key === "careCategory") {
      const normalized = normalizeCategory(String(value || "").trim(), getProtocolTemplateMap(db, user.teamId));
      if (next[key] !== normalized) {
        next[key] = normalized;
        changedFields.push(key);
      }
      continue;
    }
    if (key === "chronicConditions") {
      const normalized = normalizeChronicConditions(value);
      const current = normalizeChronicConditions(next[key]);
      if (JSON.stringify(current) !== JSON.stringify(normalized)) {
        next[key] = normalized;
        changedFields.push(key);
      }
      continue;
    }

    const normalized = String(value || "").trim();
    if (String(next[key] || "") !== normalized) {
      next[key] = normalized;
      changedFields.push(key);
    }
  }

  next.updatedAt = new Date().toISOString();
  next.updatedBy = user.id;
  return { next, changedFields };
}

function anonymizePatientBundle(db, user, patient, reason = "", requestId = "") {
  const now = new Date().toISOString();
  const prefix = String(patient.id || "").slice(0, 8);
  const anonymizedName = `Paciente Anonimizado ${prefix}`;
  const idxPatient = db.patients.findIndex((p) => p.id === patient.id);
  if (idxPatient < 0) return { changed: false, stats: {} };

  db.patients[idxPatient] = {
    ...db.patients[idxPatient],
    name: anonymizedName,
    motherName: "",
    cpf: "",
    cns: "",
    cnsCpf: "",
    phone: "",
    phoneAlt: "",
    address: "",
    microArea: "",
    assignedAcsId: "",
    chronicConditions: [],
    maritalStatus: "",
    sexAtBirth: "",
    genderIdentity: "",
    birthDate: "",
    pregnancyStartDate: "",
    expectedDeliveryDate: "",
    gestationalAgeDumWeeks: "",
    gestationalAgeUsgWeeks: "",
    usgDate1: "",
    usgDate2: "",
    usgDate3: "",
    prenatalStartDate: "",
    postpartumStartDate: "",
    comorbidities: "",
    medications: "",
    allergies: "",
    updatedAt: now,
    updatedBy: user.id,
    privacy: {
      anonymizedAt: now,
      anonymizedBy: user.id,
      reason: String(reason || "").slice(0, 300),
      requestId: requestId || ""
    }
  };

  let appointments = 0;
  for (const item of db.appointments) {
    if (item.patientId !== patient.id) continue;
    item.summary = "[ANONIMIZADO]";
    item.conduct = "";
    item.nextStep = "";
    item.updatedAt = now;
    appointments += 1;
  }

  let clinicalRecords = 0;
  for (const item of db.clinicalRecords) {
    if (item.patientId !== patient.id) continue;
    item.title = "[ANONIMIZADO]";
    item.details = "";
    item.updatedAt = now;
    clinicalRecords += 1;
  }

  let messages = 0;
  for (const item of db.messages) {
    if (item.patientId !== patient.id) continue;
    item.text = "[ANONIMIZADO]";
    item.updatedAt = now;
    messages += 1;
  }

  let tasks = 0;
  for (const item of db.tasks) {
    if (item.patientId !== patient.id) continue;
    item.title = "[ANONIMIZADO]";
    item.notes = "";
    item.updatedAt = now;
    tasks += 1;
  }

  addAuditLog(db, user, "privacy.patient_anonymized", "patient", patient.id, {
    reason: String(reason || "").slice(0, 300),
    requestId: requestId || "",
    appointments,
    clinicalRecords,
    messages,
    tasks
  });

  return {
    changed: true,
    stats: { appointments, clinicalRecords, messages, tasks }
  };
}

function getProtocolTemplateMap(db, teamId = "") {
  ensureDbShape(db);
  const map = {};
  const disabledByTeam = new Set(
    db.protocolTemplates
      .filter((t) => t.teamId === teamId && t.deleted)
      .map((t) => String(t.category || ""))
  );
  db.protocolTemplates
    .filter((t) => !t.deleted)
    .filter((t) => !teamId || !t.teamId || t.teamId === teamId)
    .filter((t) => !(!t.teamId && disabledByTeam.has(String(t.category || ""))))
    .forEach((t) => {
      map[String(t.category)] = t;
    });
  if (!map.general) {
    const fallback = buildDefaultProtocolTemplates().find((t) => t.category === "general");
    if (fallback) map.general = fallback;
  }
  return map;
}

function normalizeCategory(value, templateMap = DEFAULT_CARE_PROTOCOLS) {
  if (!value) return "general";
  const next = String(value).trim();
  return templateMap[next] ? next : "general";
}

function normalizeChronicConditions(value) {
  const list = Array.isArray(value) ? value : [];
  const normalized = list
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => ["hypertension", "diabetes"].includes(item));
  return [...new Set(normalized)];
}

function validateCouncilData(role, councilNumber, councilUf) {
  if (!roleNeedsCouncil(role)) {
    return { ok: true };
  }

  const number = String(councilNumber || "").trim();
  const uf = String(councilUf || "").trim().toUpperCase();
  const councilType = councilTypeForRole(role);
  const numberDigits = number.replace(/\D/g, "");

  const minLen = councilType === "CRM" ? 4 : 4;
  const maxLen = councilType === "CRM" ? 8 : 10;

  if (!new RegExp(`^\\d{${minLen},${maxLen}}$`).test(numberDigits)) {
    return {
      ok: false,
      message: `${councilType} deve ter entre ${minLen} e ${maxLen} digitos`
    };
  }

  if (isRepeatedDigits(numberDigits)) {
    return { ok: false, message: "Número do conselho inválido (dígitos repetidos)" };
  }

  if (isSequentialDigits(numberDigits)) {
    return { ok: false, message: "Número do conselho inválido (sequência numérica)" };
  }

  if (!VALID_UF.has(uf)) {
    return { ok: false, message: "UF do conselho inválida" };
  }

  return { ok: true, councilNumber: numberDigits, councilUf: uf };
}

function getCouncilIntegrationConfig() {
  const mode = String(process.env.COUNCIL_VERIFY_MODE || "optional").trim().toLowerCase();
  const url = String(process.env.COUNCIL_VERIFY_URL || "").trim();
  const token = String(process.env.COUNCIL_VERIFY_TOKEN || "").trim();
  const timeoutMs = Number(process.env.COUNCIL_VERIFY_TIMEOUT_MS || 7000);
  const retries = Number(process.env.COUNCIL_VERIFY_RETRIES || 2);
  const provider = String(process.env.COUNCIL_VERIFY_PROVIDER || "generic").trim().toLowerCase();
  const requireEvidence = String(process.env.COUNCIL_VERIFY_REQUIRE_EVIDENCE || "true").trim().toLowerCase();

  return {
    mode: ["off", "optional", "required"].includes(mode) ? mode : "optional",
    provider: ["generic", "n8n", "make"].includes(provider) ? provider : "generic",
    url,
    token,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 1000 ? timeoutMs : 7000,
    retries: Number.isFinite(retries) ? Math.max(0, Math.min(5, Math.floor(retries))) : 2,
    requireEvidence: !["0", "false", "no", "off"].includes(requireEvidence)
  };
}

function normalizeProviderResponse(provider, data) {
  if (provider === "n8n") {
    const base = Array.isArray(data) ? (data[0] || {}) : data;
    const valid = base.valid === true || base.approved === true || base.status === "approved";
    return {
      valid,
      provider: base.provider || "n8n",
      error: base.error || (valid ? "" : "Conselho não aprovado no n8n"),
      details: base
    };
  }

  if (provider === "make") {
    const base = data?.result || data;
    const valid = base.valid === true || base.is_valid === true || base.outcome === "approved";
    return {
      valid,
      provider: base.provider || "make",
      error: base.error || (valid ? "" : "Conselho não aprovado no Make"),
      details: base
    };
  }

  return {
    valid: data && data.valid === true,
    provider: data?.provider || "external-http",
    error: data?.error || "",
    details: data
  };
}

function pickFirstValue(source, keys = []) {
  if (!source || typeof source !== "object") return "";
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function normalizeCouncilEvidence(details = {}) {
  const flat = details && typeof details === "object" ? details : {};
  const numberRaw = pickFirstValue(flat, [
    "councilNumber",
    "council_number",
    "registrationNumber",
    "registration_number",
    "number",
    "crm",
    "coren"
  ]);
  const ufRaw = pickFirstValue(flat, [
    "councilUf",
    "council_uf",
    "registrationUf",
    "registration_uf",
    "uf",
    "state"
  ]);
  const statusRaw = pickFirstValue(flat, [
    "status",
    "registrationStatus",
    "registration_status",
    "situation"
  ]);
  const professionalName = pickFirstValue(flat, [
    "professionalName",
    "professional_name",
    "name",
    "fullName",
    "full_name"
  ]);

  return {
    number: numberRaw.replace(/\D/g, ""),
    uf: ufRaw.toUpperCase(),
    status: statusRaw,
    professionalName
  };
}

async function verifyCouncilExternally(payload) {
  const config = getCouncilIntegrationConfig();

  if (config.mode === "off") {
    return {
      checked: false,
      valid: true,
      provider: "disabled",
      status: "skipped"
    };
  }

  if (!config.url) {
    if (config.mode === "required") {
      return {
        checked: false,
        valid: false,
        provider: "missing-url",
        status: "error",
        error: "Integração externa de conselho não configurada"
      };
    }

    return {
      checked: false,
      valid: true,
      provider: "missing-url",
      status: "skipped"
    };
  }

  const headers = {
    "Content-Type": "application/json"
  };
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  let lastUnavailableError = "";
  const maxAttempts = Math.max(1, config.retries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      const normalized = normalizeProviderResponse(config.provider, data);

      if (!response.ok) {
        const retriable = response.status >= 500 || response.status === 429;
        if (retriable && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          continue;
        }

        if (config.mode === "required") {
          return {
            checked: true,
            valid: false,
            provider: normalized.provider,
            status: "error",
            error: normalized.error || `Falha ao validar conselho no provedor externo (HTTP ${response.status})`
          };
        }

        return {
          checked: true,
          valid: true,
          provider: data.provider || "external-http",
          status: "fallback"
        };
      }

      if (normalized.valid && config.requireEvidence) {
        const evidence = normalizeCouncilEvidence(normalized.details);
        if (!evidence.number || !evidence.uf) {
          return {
            checked: true,
            valid: false,
            provider: normalized.provider,
            status: "rejected",
            error: "Provedor não retornou evidência mínima do conselho"
          };
        }

        const expectedNumber = String(payload.councilNumber || "").replace(/\D/g, "");
        const expectedUf = String(payload.councilUf || "").trim().toUpperCase();
        if (evidence.number !== expectedNumber || evidence.uf !== expectedUf) {
          return {
            checked: true,
            valid: false,
            provider: normalized.provider,
            status: "rejected",
            error: "Conselho retornado pelo provedor não confere com número/UF informados"
          };
        }
      }

      return {
        checked: true,
        valid: normalized.valid,
        provider: normalized.provider,
        status: normalized.valid ? "verified" : "rejected",
        details: normalized.details
      };
    } catch (error) {
      lastUnavailableError = error?.name === "AbortError"
        ? `timeout de ${config.timeoutMs}ms`
        : (error?.message || "erro de rede");

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  if (config.mode === "required") {
    return {
      checked: true,
      valid: false,
      provider: "external-http",
      status: "error",
      error: `Integração de validação de conselho indisponível (${lastUnavailableError || "sem resposta"})`
    };
  }

  return {
    checked: true,
    valid: true,
    provider: "external-http",
    status: "fallback"
  };
}

function sanitizeProtocolTemplatePayload(payload, fallbackCategory = "") {
  const rawCategory = String(payload.category || fallbackCategory || "").trim().toLowerCase();
  const category = rawCategory.replace(/[^a-z0-9_]/g, "_");
  const label = String(payload.label || "").trim();
  const targets = payload.targets && typeof payload.targets === "object" ? payload.targets : {};
  const deadlines = payload.deadlines && typeof payload.deadlines === "object" ? payload.deadlines : {};
  const visits = Number(targets.visits);
  const consultations = Number(targets.consultations);
  const vaccinesTarget = Number(targets.vaccines);
  const deadlineVisits = Number(deadlines.visits);
  const deadlineConsultations = Number(deadlines.consultations);
  const deadlineVaccines = Number(deadlines.vaccines);
  const vaccines = Array.isArray(payload.vaccines) ? payload.vaccines : String(payload.vaccines || "").split(",");
  const authority = String(payload.authority || "Ministério da Saúde").trim();
  const reference = String(payload.reference || "").trim();
  const version = String(payload.version || "").trim();

  const cleanVaccines = [...new Set(vaccines
    .map((v) => String(v || "").trim())
    .filter(Boolean))];

  if (!category || category.length < 2) {
    return { ok: false, error: "category inválida (use letras, numeros e _)" };
  }

  if (!label) {
    return { ok: false, error: "label ? obrigatório" };
  }

  const numbers = [
    ["visits", visits],
    ["consultations", consultations],
    ["vaccines", vaccinesTarget]
  ];

  for (const [key, value] of numbers) {
    if (!Number.isFinite(value) || value < 0 || value > 99) {
      return { ok: false, error: `targets.${key} deve ser número entre 0 e 99` };
    }
  }

  const deadlineNumbers = [
    ["visits", deadlineVisits],
    ["consultations", deadlineConsultations],
    ["vaccines", deadlineVaccines]
  ];

  for (const [key, value] of deadlineNumbers) {
    if (!Number.isFinite(value) || value < 0 || value > 3650) {
      return { ok: false, error: `deadlines.${key} deve ser número entre 0 e 3650 dias` };
    }
  }

  return {
    ok: true,
    template: {
      category,
      label,
      targets: {
        visits: Math.floor(visits),
        consultations: Math.floor(consultations),
        vaccines: Math.floor(vaccinesTarget)
      },
      deadlines: {
        visits: Math.floor(deadlineVisits),
        consultations: Math.floor(deadlineConsultations),
        vaccines: Math.floor(deadlineVaccines)
      },
      vaccines: cleanVaccines
      ,
      authority,
      reference,
      version: version || "1.0"
    }
  };
}

function canAccessPatient(user, patient) {
  if (!patient) return false;
  if (patient.teamId !== user.teamId) return false;
  if (isManager(user) || isDoctor(user)) return true;
  if (isAcs(user)) return patient.assignedAcsId === user.id;
  return false;
}

function getAllowedPatients(db, user, query) {
  const microArea = query.microArea ? String(query.microArea).trim() : "";
  const acsId = query.acsId ? String(query.acsId).trim() : "";
  const careCategory = query.careCategory ? String(query.careCategory).trim() : "";

  return db.patients.filter((p) => {
    if (!canAccessPatient(user, p)) return false;
    if (microArea && p.microArea !== microArea) return false;
    if (acsId && p.assignedAcsId !== acsId) return false;
    if (careCategory && p.careCategory !== careCategory) return false;
    return true;
  });
}

function getPatientOrError(db, user, patientId) {
  const patient = db.patients.find((p) => p.id === patientId);
  if (!patient) return { error: { status: 404, message: "Paciente não encontrado" } };
  if (!canAccessPatient(user, patient)) {
    return { error: { status: 403, message: "Sem permissão para este paciente" } };
  }
  return { patient };
}

function buildPatientHistory(db, patientId) {
  const appointmentEvents = db.appointments
    .filter((a) => a.patientId === patientId)
    .map((a) => ({
      id: a.id,
      patientId,
      date: a.date,
      type: "consultation",
      title: a.summary,
      details: [a.conduct, a.nextStep].filter(Boolean).join(" | "),
      source: "appointment",
      createdBy: a.createdBy,
      createdAt: a.createdAt,
      metadata: { demandType: normalizeDemandType(a.demandType) }
    }));

  const clinicalEvents = db.clinicalRecords
    .filter((r) => r.patientId === patientId)
    .map((r) => ({ ...r, source: "clinicalRecord" }));

  return [...appointmentEvents, ...clinicalEvents].sort((a, b) => {
    const da = eventDate(a);
    const dbDate = eventDate(b);
    if (da && dbDate) return dbDate.getTime() - da.getTime();
    if (da) return -1;
    if (dbDate) return 1;
    return String(b.date || "").localeCompare(String(a.date || ""));
  });
}

function parseFlexibleDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getTime());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const brMatch = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateOnlySafe(value) {
  const d = parseFlexibleDate(value);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysDiff(from, to = new Date()) {
  const left = toDateOnlySafe(from);
  const right = toDateOnlySafe(to);
  if (!left || !right) return null;
  return Math.floor((right.getTime() - left.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(baseDate, days) {
  const d = toDateOnlySafe(baseDate);
  if (!d) return null;
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isDentalText(textValue = "") {
  const text = normalizeText(textValue);
  return /dent|odont|bucal|cirurgiao dentista/.test(text);
}

function isDentalRecord(entry) {
  const text = `${entry?.title || ""} ${entry?.details || ""}`;
  return isDentalText(text);
}

function isMedicalOrNursingConsultationText(textValue = "") {
  const text = normalizeText(textValue);
  if (!text) return false;
  return /consulta/.test(text) && /(medic|enferm|pre natal|prenatal)/.test(text);
}

function isClinicalConsultation(entry) {
  if (!entry || isDentalRecord(entry)) return false;
  if (entry.type === "consultation") return true;

  if (["procedure", "note"].includes(String(entry.type || ""))) {
    const text = `${entry?.title || ""} ${entry?.details || ""}`;
    return isMedicalOrNursingConsultationText(text);
  }

  return false;
}

function parseRapidTestTrimester(text = "") {
  const firstTrimesterPattern = /(?:\b1\s*(?:o|º)?\b|\bprimeir[oa]\b|\bt1\b)\s*(?:trim|trimestre|semestre)|(?:trim|trimestre|semestre)\s*(?:\b1\s*(?:o|º)?\b|\bprimeir[oa]\b|\bt1\b)/;
  const thirdTrimesterPattern = /(?:\b3\s*(?:o|º)?\b|\bterceir[oa]\b|\bt3\b)\s*(?:trim|trimestre|semestre)|(?:trim|trimestre|semestre)\s*(?:\b3\s*(?:o|º)?\b|\bterceir[oa]\b|\bt3\b)/;
  return {
    explicitFirst: firstTrimesterPattern.test(text),
    explicitThird: thirdTrimesterPattern.test(text)
  };
}

function detectRapidTestCoverage(entries, gestationStartDate) {
  const coverage = {
    hivFirst: false,
    sifFirst: false,
    hivThird: false,
    sifThird: false
  };

  for (const entry of entries) {
    const text = normalizeText(`${entry?.title || ""} ${entry?.details || ""}`);
    const metadataTrimester = normalizeText(entry?.metadata?.rapidTestTrimester || "");
    const hasExamContext = /(teste|exame|sorolog|colet|resultado|solicit|avali|procedimento|vdrl|treponem|fta)/.test(text);
    const hasTarget = /(hiv|sifil|vdrl|treponem|fta)/.test(text);
    if (!hasExamContext || !hasTarget) continue;

    const hasHiv = /(hiv|anti hiv|hiv 1|hiv 2)/.test(text);
    const hasSif = /(sifil|sifilis|vdrl|treponem|fta)/.test(text);
    if (!hasHiv && !hasSif) continue;

    const { explicitFirst, explicitThird } = parseRapidTestTrimester(text);
    const explicitFirstByMeta = /(first_trimester|primeiro|1o|1º|t1)/.test(metadataTrimester);
    const explicitThirdByMeta = /(third_trimester|terceiro|3o|3º|t3)/.test(metadataTrimester);
    const finalExplicitFirst = explicitFirst || explicitFirstByMeta;
    const finalExplicitThird = explicitThird || explicitThirdByMeta;
    const d = eventDate(entry);
    const week = d ? Math.floor((daysDiff(gestationStartDate, d) || 0) / 7) : null;
    const weekInFirst = week !== null && week >= 0 && week <= 13;
    const weekInThird = week !== null && week >= 28 && week <= 45;

    const markFirst = finalExplicitFirst || (!finalExplicitThird && weekInFirst);
    const markThird = finalExplicitThird || (!finalExplicitFirst && weekInThird);

    if (markFirst) {
      if (hasHiv) coverage.hivFirst = true;
      if (hasSif) coverage.sifFirst = true;
    }
    if (markThird) {
      if (hasHiv) coverage.hivThird = true;
      if (hasSif) coverage.sifThird = true;
    }
  }

  return coverage;
}

function eventDate(entry) {
  return toDateOnlySafe(entry?.date || entry?.createdAt || "");
}

function filterHistoryByPeriod(history, start, end) {
  const from = toDateOnlySafe(start);
  const until = toDateOnlySafe(end);
  return history.filter((h) => {
    const d = eventDate(h);
    if (!d) return false;
    if (from && d < from) return false;
    if (until && d > until) return false;
    return true;
  });
}

function detectGestationTimeline(patient) {
  const rawStart = toDateOnlySafe(patient?.pregnancyStartDate);
  const rawDue = toDateOnlySafe(patient?.expectedDeliveryDate);
  const usgDates = [patient?.usgDate1, patient?.usgDate2, patient?.usgDate3]
    .map((d) => toDateOnlySafe(d))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());
  const latestUsgDate = usgDates[0] || null;
  const dumWeeks = Number.isFinite(Number(patient?.gestationalAgeDumWeeks))
    ? Number(patient.gestationalAgeDumWeeks)
    : null;
  const usgWeeks = Number.isFinite(Number(patient?.gestationalAgeUsgWeeks))
    ? Number(patient.gestationalAgeUsgWeeks)
    : null;
  const now = toDateOnlySafe(new Date());

  const inferredStartFromUsg = latestUsgDate && usgWeeks !== null
    ? addDays(latestUsgDate, -Math.max(0, Math.floor(usgWeeks * 7)))
    : null;
  const inferredStartFromDumAge = now && dumWeeks !== null
    ? addDays(now, -Math.max(0, Math.floor(dumWeeks * 7)))
    : null;

  const start = rawStart
    || inferredStartFromUsg
    || inferredStartFromDumAge
    || (rawDue ? addDays(rawDue, -280) : null);
  const due = rawDue || (start ? addDays(start, 280) : null);
  const prenatalStart = toDateOnlySafe(patient?.prenatalStartDate);

  const gestationalDays = start ? Math.max(daysDiff(start, now) || 0, 0) : null;
  const gestationalWeeks = gestationalDays !== null ? Math.floor(gestationalDays / 7) : null;
  const daysUntilDue = due ? daysDiff(now, due) : null;

  return {
    start,
    due,
    prenatalStart,
    gestationalDays,
    gestationalWeeks,
    daysUntilDue,
    inferredBy: rawStart ? "dum" : (inferredStartFromUsg ? "usg" : (inferredStartFromDumAge ? "ig_dum" : (rawDue ? "dpp" : "")))
  };
}

function detectPuerperalTimeline(patient) {
  const start = toDateOnlySafe(patient?.postpartumStartDate);
  const now = toDateOnlySafe(new Date());
  const daysAfterBirth = start ? Math.max(daysDiff(start, now) || 0, 0) : null;
  const daysLeft = daysAfterBirth === null ? null : 42 - daysAfterBirth;
  return { start, daysAfterBirth, daysLeft };
}

function makeClinicalAlert({
  id,
  activity,
  title,
  detail,
  severity = "low",
  daysLeft = null,
  overdueDays = 0,
  categoryLabel = "Gestante"
}) {
  return {
    id,
    activity,
    title,
    detail,
    severity,
    severityClass: severity === "high" ? "status alert" : (severity === "medium" ? "status pending" : "status progress"),
    category: categoryLabel,
    daysLeft,
    overdue: Math.max(Number(overdueDays || 0), 0)
  };
}

function evaluatePregnantProtocol(patient, history) {
  const timeline = detectGestationTimeline(patient);
  const alerts = [];
  const categoryLabel = "Gestante";

  if (!timeline.start || !timeline.due) {
    alerts.push(makeClinicalAlert({
      id: "pregnancy-dates-missing",
      activity: "dados gestacionais",
      title: "Definir DUM ou DPP",
      detail: "Sem data-base de gestação. Cadastre DUM ou DPP para calcular prazos e alertas.",
      severity: "high",
      categoryLabel
    }));
    return { timeline, alerts, checklist: {} };
  }

  const pregnancyHistory = filterHistoryByPeriod(history, timeline.start, timeline.due);
  const visits = pregnancyHistory.filter((h) => h.type === "visit");
  const allClinicalConsultations = history.filter((h) => isClinicalConsultation(h));
  const allConsultations = pregnancyHistory.filter((h) => h.type === "consultation");
  const consultations = allConsultations.filter((h) => isClinicalConsultation(h));
  const consultationsTracked = consultations.length > 0 ? consultations : allClinicalConsultations;
  const procedures = pregnancyHistory.filter((h) => h.type === "procedure");
  const vaccines = pregnancyHistory.filter((h) => h.type === "vaccine");
  const consultationDatesAsc = consultationsTracked
    .map((entry) => eventDate(entry))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  const firstConsultDate = consultationDatesAsc.length ? consultationDatesAsc[0] : null;
  const lastConsultDate = consultationDatesAsc.length ? consultationDatesAsc[consultationDatesAsc.length - 1] : null;

  const weeks = Number(timeline.gestationalWeeks || 0);
  const visitPending = Math.max(3 - visits.length, 0);
  if (visitPending > 0) {
    const severity = weeks >= 32 ? "high" : (weeks >= 24 ? "medium" : "low");
    alerts.push(makeClinicalAlert({
      id: "pregnancy-visits",
      activity: "visita ACS",
      title: `Faltam ${visitPending} visita(s) domiciliar(es)`,
      detail: `Meta mínima de 3 visitas durante a gestação. Realizadas: ${visits.length}.`,
      severity,
      daysLeft: timeline.daysUntilDue,
      overdueDays: timeline.daysUntilDue !== null && timeline.daysUntilDue < 0 ? Math.abs(timeline.daysUntilDue) : 0,
      categoryLabel
    }));
  }

  const prenatalStart = timeline.prenatalStart || firstConsultDate;
  if (!prenatalStart) {
    if (weeks >= 12) {
      alerts.push(makeClinicalAlert({
        id: "prenatal-start-missing",
        activity: "início do pré-natal",
        title: "Pré-natal sem data de início",
        detail: "O pré-natal deve iniciar até 12 semanas. Registre a data de início.",
        severity: "high",
        categoryLabel
      }));
    }
  } else {
    const prenatalWeek = Math.floor((daysDiff(timeline.start, prenatalStart) || 0) / 7);
    if (prenatalWeek > 12) {
      alerts.push(makeClinicalAlert({
        id: timeline.prenatalStart ? "prenatal-start-late" : "prenatal-start-late-by-first-consult",
        activity: "início do pré-natal",
        title: `Pré-natal iniciado com ${prenatalWeek} semanas`,
        detail: timeline.prenatalStart
          ? "Início recomendado até 12 semanas de gestação."
          : "Primeira consulta clínica ocorreu após 12 semanas de gestação.",
        severity: "high",
        overdueDays: Math.max((prenatalWeek - 12) * 7, 0),
        categoryLabel
      }));
    }
  }

  const consultPending = Math.max(7 - consultationsTracked.length, 0);
  if (consultPending > 0) {
    const severity = weeks >= 35 ? "high" : (weeks >= 28 ? "medium" : "low");
    alerts.push(makeClinicalAlert({
      id: "pregnancy-consult-total",
      activity: "consultas pré-natais",
      title: `Faltam ${consultPending} consulta(s)`,
      detail: `Meta mínima de 7 consultas durante a gestação. Realizadas: ${consultationsTracked.length}.`,
      severity,
      categoryLabel
    }));
  }

  // Regra operacional: a 1ª consulta já conta como início do pré-natal
  // e também abate do total de consultas da gestação.
  // Após essa primeira consulta, o acompanhamento segue apenas pelo total
  // de consultas pendentes, sem alerta separado de "consulta pré-natal em atraso".
  if (weeks >= 20 && !consultationsTracked.length) {
    alerts.push(makeClinicalAlert({
      id: "pregnancy-consult-first-missing",
      activity: "consultas pré-natais",
      title: "Sem consultas registradas na gestação",
      detail: "Registre consulta médica ou de enfermagem para iniciar o seguimento por faixa de semanas.",
      severity: "high",
      categoryLabel
    }));
  }

  const oralEvents = [...allConsultations, ...procedures].filter((h) => {
    const text = `${h.title || ""} ${h.details || ""}`;
    return isDentalText(text);
  });
  if (!oralEvents.length) {
    const overdueDentalDays = weeks > 35 ? (weeks - 35) * 7 : 0;
    alerts.push(makeClinicalAlert({
      id: "pregnancy-dental",
      activity: "consulta odontológica",
      title: "Falta consulta odontológica",
      detail: "Gestante deve ter pelo menos 1 consulta com cirurgião-dentista durante a gestação.",
      severity: weeks >= 35 ? "high" : (weeks >= 24 ? "medium" : "low"),
      overdueDays: overdueDentalDays,
      categoryLabel
    }));
  }

  const dtpaInWindow = vaccines.some((h) => {
    const d = eventDate(h);
    if (!d) return false;
    const week = Math.floor((daysDiff(timeline.start, d) || 0) / 7);
    const text = normalizeText(`${h.metadata?.vaccineName || ""} ${h.title || ""} ${h.details || ""}`);
    return week >= 20 && week <= 26 && text.includes("dtpa");
  });
  if (!dtpaInWindow && weeks >= 20) {
    const severity = weeks > 26 ? "high" : "medium";
    const overdueDtpaDays = weeks > 26 ? (weeks - 26) * 7 : 0;
    alerts.push(makeClinicalAlert({
      id: "pregnancy-dtpa",
      activity: "vacina dTpa",
      title: weeks > 26 ? "Janela da dTpa vencida" : "Aplicar dTpa entre 20ª e 26ª semana",
      detail: "Não há registro de dTpa na janela recomendada da gestação.",
      severity,
      overdueDays: overdueDtpaDays,
      categoryLabel
    }));
  }

  const hasPregnancyVaccine = (regex) => vaccines.some((h) => {
    const text = normalizeText(`${h.metadata?.vaccineName || ""} ${h.title || ""} ${h.details || ""}`);
    return regex.test(text);
  });
  const influenzaDone = hasPregnancyVaccine(/influenza|gripe/);
  const covidDone = hasPregnancyVaccine(/covid/);
  const hepBDone = hasPregnancyVaccine(/hepatite b|hbv/);

  if (weeks >= 12 && !influenzaDone) {
    alerts.push(makeClinicalAlert({
      id: "pregnancy-influenza",
      activity: "vacina influenza",
      title: "Vacina influenza pendente na gestação",
      detail: "Registrar pelo menos 1 dose de influenza durante a gestação.",
      severity: weeks >= 28 ? "high" : "medium",
      overdueDays: Math.max((weeks - 12) * 7, 0),
      categoryLabel
    }));
  }

  if (weeks >= 12 && !covidDone) {
    alerts.push(makeClinicalAlert({
      id: "pregnancy-covid",
      activity: "vacina COVID-19",
      title: "Vacina COVID-19 pendente na gestação",
      detail: "Registrar pelo menos 1 dose de COVID-19 durante a gestação.",
      severity: weeks >= 28 ? "high" : "medium",
      overdueDays: Math.max((weeks - 12) * 7, 0),
      categoryLabel
    }));
  }

  if (weeks >= 12 && !hepBDone) {
    alerts.push(makeClinicalAlert({
      id: "pregnancy-hepb",
      activity: "vacina hepatite B",
      title: "Vacina hepatite B pendente na gestação",
      detail: "Registrar dose de hepatite B durante a gestação quando não houver comprovação prévia no prontuário.",
      severity: weeks >= 28 ? "high" : "medium",
      overdueDays: Math.max((weeks - 12) * 7, 0),
      categoryLabel
    }));
  }

  const testEntries = [...procedures];
  const rapidTests = detectRapidTestCoverage(testEntries, timeline.start);
  const hivFirst = rapidTests.hivFirst;
  const sifFirst = rapidTests.sifFirst;
  const hivThird = rapidTests.hivThird;
  const sifThird = rapidTests.sifThird;

  if (weeks > 13 && (!hivFirst || !sifFirst)) {
    const overdueFirstTrimesterDays = Math.max((weeks - 13) * 7, 0);
    alerts.push(makeClinicalAlert({
      id: "pregnancy-tests-first-trimester",
      activity: "testes rápidos 1º trimestre",
      title: "Teste rápido pendente no 1º trimestre",
      detail: `Pendência: ${!hivFirst ? "HIV" : ""}${!hivFirst && !sifFirst ? " e " : ""}${!sifFirst ? "sífilis" : ""}.`,
      severity: "high",
      overdueDays: overdueFirstTrimesterDays,
      categoryLabel
    }));
  }

  if (weeks >= 28 && (!hivThird || !sifThird)) {
    const overdueThirdTrimesterDays = Math.max((weeks - 28) * 7, 0);
    alerts.push(makeClinicalAlert({
      id: "pregnancy-tests-third-trimester",
      activity: "testes rápidos 3º trimestre",
      title: "Teste rápido pendente no 3º trimestre",
      detail: `Pendência: ${!hivThird ? "HIV" : ""}${!hivThird && !sifThird ? " e " : ""}${!sifThird ? "sífilis" : ""}.`,
      severity: "high",
      overdueDays: overdueThirdTrimesterDays,
      categoryLabel
    }));
  }

  return {
    timeline,
    alerts,
    checklist: {
      visitsDone: visits.length,
      consultationsDone: consultationsTracked.length,
      dentalDone: oralEvents.length > 0,
      dtpaDone: dtpaInWindow,
      influenzaDone,
      covidDone,
      hepBDone,
      hivFirstTrimesterDone: hivFirst,
      sifilisFirstTrimesterDone: sifFirst,
      hivThirdTrimesterDone: hivThird,
      sifilisThirdTrimesterDone: sifThird
    }
  };
}

function evaluatePuerperalProtocol(patient, history) {
  const timeline = detectPuerperalTimeline(patient);
  const alerts = [];
  const categoryLabel = "Puérpera";

  if (!timeline.start) {
    alerts.push(makeClinicalAlert({
      id: "puerperal-start-missing",
      activity: "início do puerpério",
      title: "Definir data do parto",
      detail: "Cadastre a data do parto para controlar o prazo de 42 dias do puerpério.",
      severity: "high",
      categoryLabel
    }));
    return { timeline, alerts, checklist: {} };
  }

  const periodEnd = addDays(timeline.start, 42);
  const puerperalHistory = filterHistoryByPeriod(history, timeline.start, periodEnd);
  const visits = puerperalHistory.filter((h) => h.type === "visit");
  const consultations = puerperalHistory.filter((h) => isClinicalConsultation(h));
  const overdue = timeline.daysLeft !== null && timeline.daysLeft < 0 ? Math.abs(timeline.daysLeft) : 0;
  const severityByDeadline = overdue > 0 ? "high" : ((timeline.daysLeft || 0) <= 7 ? "high" : ((timeline.daysLeft || 0) <= 14 ? "medium" : "low"));

  if (visits.length < 1) {
    alerts.push(makeClinicalAlert({
      id: "puerperal-visit",
      activity: "visita ACS",
      title: "Visita domiciliar pendente no puerpério",
      detail: "Necessário 1 visita domiciliar do ACS até 42 dias pós-parto.",
      severity: severityByDeadline,
      daysLeft: timeline.daysLeft,
      overdueDays: overdue,
      categoryLabel
    }));
  }

  if (consultations.length < 1) {
    alerts.push(makeClinicalAlert({
      id: "puerperal-consult",
      activity: "consulta puerperal",
      title: "Consulta puerperal pendente",
      detail: "Necessária 1 consulta médica ou de enfermagem até 42 dias pós-parto.",
      severity: severityByDeadline,
      daysLeft: timeline.daysLeft,
      overdueDays: overdue,
      categoryLabel
    }));
  }

  return {
    timeline,
    alerts,
    checklist: {
      visitsDone: visits.length,
      consultationsDone: consultations.length
    }
  };
}

function evaluatePapOnlyProtocol(patient, history) {
  const alerts = [];
  const categoryLabel = "Rastreamento Feminino/Trans";
  const birthDate = toDateOnlySafe(patient?.birthDate);
  const ageYears = yearsFromDate(birthDate, new Date());
  const sexAtBirth = String(patient?.sexAtBirth || "").trim().toLowerCase();
  const genderIdentity = String(patient?.genderIdentity || "").trim().toLowerCase();
  const isFemale = sexAtBirth === "female";
  const isTransMan = genderIdentity === "trans_man";
  const eligiblePapPopulation = isFemale || isTransMan;
  const now = toDateOnlySafe(new Date());

  if (ageYears === null) {
    alerts.push(makeClinicalAlert({
      id: "pap-birthdate-missing",
      activity: "dados demográficos",
      title: "Data de nascimento não informada",
      detail: "Cadastre a data de nascimento para aplicar as regras de idade de rastreamento.",
      severity: "high",
      categoryLabel
    }));
  }
  if (!sexAtBirth && !genderIdentity) {
    alerts.push(makeClinicalAlert({
      id: "pap-sex-gender-missing",
      activity: "dados demográficos",
      title: "Sexo ao nascer/identidade de gênero não informados",
      detail: "Preencha sexo ao nascer e identidade de gênero para aplicar as regras de elegibilidade.",
      severity: "medium",
      categoryLabel
    }));
  }

  const history12 = filterHistoryByPeriod(history, addDays(now, -365), now);
  const history24 = filterHistoryByPeriod(history, addDays(now, -730), now);
  const history36 = filterHistoryByPeriod(history, addDays(now, -1095), now);

  const isRequestedCollectedOrEvaluated = (text) => /solicit|colet|avali/.test(text);

  if (eligiblePapPopulation && ageYears !== null && ageYears >= 25 && ageYears <= 64) {
    const papDone = history36.some((h) => {
      const text = normalizeText(`${h.title || ""} ${h.details || ""}`);
      const isCervicalScreening = /papanicolau|citopat|colo do utero|preventivo|oncotica/.test(text);
      return isCervicalScreening && isRequestedCollectedOrEvaluated(text);
    });
    if (!papDone) {
      alerts.push(makeClinicalAlert({
        id: "pap-screening-36m",
        activity: "rastreamento de colo do útero",
        title: "Papanicolau/citopatológico pendente",
        detail: "Necessário registro coletado, solicitado ou avaliado nos últimos 36 meses (25 a 64 anos).",
        severity: "high",
        categoryLabel
      }));
    }
  }

  if (isFemale && ageYears !== null && ageYears >= 9 && ageYears <= 14) {
    const hpvDose = history.some((h) => {
      if (h.type !== "vaccine") return false;
      const text = normalizeText(`${h.metadata?.vaccineName || ""} ${h.title || ""} ${h.details || ""}`);
      return /hpv/.test(text);
    });
    if (!hpvDose) {
      alerts.push(makeClinicalAlert({
        id: "pap-hpv-9-14",
        activity: "vacina HPV",
        title: "Dose de HPV pendente",
        detail: "Necessária pelo menos 1 dose de HPV para meninas de 9 a 14 anos.",
        severity: "high",
        categoryLabel
      }));
    }
  }

  if (ageYears !== null && ageYears >= 14 && ageYears <= 69) {
    const consultDone = history12.some((h) => isClinicalConsultation(h));
    if (!consultDone) {
      alerts.push(makeClinicalAlert({
        id: "pap-consult-12m",
        activity: "consulta anual",
        title: "Consulta anual pendente",
        detail: "Necessária pelo menos 1 consulta médica ou de enfermagem nos últimos 12 meses (14 a 69 anos).",
        severity: "medium",
        categoryLabel
      }));
    }
  }

  if (ageYears !== null && ageYears >= 50 && ageYears <= 69) {
    const breastDone = history24.some((h) => {
      const text = normalizeText(`${h.title || ""} ${h.details || ""}`);
      const isBreastScreening = /(mamografia|rastreamento de mama|cancer de mama|exame de mama)/.test(text);
      return isBreastScreening && isRequestedCollectedOrEvaluated(text);
    });
    if (!breastDone) {
      alerts.push(makeClinicalAlert({
        id: "pap-breast-24m",
        activity: "rastreamento de mama",
        title: "Rastreamento de mama pendente",
        detail: "Necessário exame de rastreamento de câncer de mama solicitado ou avaliado nos últimos 24 meses (50 a 69 anos).",
        severity: "high",
        categoryLabel
      }));
    }
  }

  return {
    timeline: { birthDate, ageYears },
    alerts,
    checklist: {
      eligiblePapPopulation,
      ageYears
    }
  };
}

function monthsFromDate(startDate, endDate = new Date()) {
  const start = toDateOnlySafe(startDate);
  const end = toDateOnlySafe(endDate);
  if (!start || !end) return null;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(months, 0);
}

function yearsFromDate(startDate, endDate = new Date()) {
  const start = toDateOnlySafe(startDate);
  const end = toDateOnlySafe(endDate);
  if (!start || !end) return null;
  let years = end.getFullYear() - start.getFullYear();
  const monthDelta = end.getMonth() - start.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && end.getDate() < start.getDate())) {
    years -= 1;
  }
  return Math.max(years, 0);
}

function matchesAnyAlias(text, aliases = []) {
  return aliases.some((alias) => text.includes(alias));
}

function evaluateChildProtocol(patient, history) {
  const alerts = [];
  const categoryLabel = "Puericultura";
  const birthDate = toDateOnlySafe(patient?.birthDate);
  if (!birthDate) {
    alerts.push(makeClinicalAlert({
      id: "child-birthdate-missing",
      activity: "dados da criança",
      title: "Definir data de nascimento",
      detail: "Cadastre a data de nascimento para controlar consultas, visitas e vacinas por mês de vida.",
      severity: "high",
      categoryLabel
    }));
    return { timeline: { birthDate: null, ageMonths: null, ageDays: null }, alerts, checklist: {}, acsFocus: [] };
  }

  const ageDays = Math.max(daysDiff(birthDate, new Date()) || 0, 0);
  const ageMonths = monthsFromDate(birthDate, new Date());
  const until2Years = addDays(birthDate, 730);
  const history0to24m = filterHistoryByPeriod(history, birthDate, until2Years);
  const firstMonthEnd = addDays(birthDate, 30);
  const first6MonthsEnd = addDays(birthDate, 183);

  const consultations = history0to24m.filter((h) => isClinicalConsultation(h));
  const visits = history0to24m.filter((h) => h.type === "visit");
  const consultationsFirstMonth = consultations.filter((h) => {
    const d = eventDate(h);
    return d && d <= firstMonthEnd;
  });
  const visitsFirstMonth = visits.filter((h) => {
    const d = eventDate(h);
    return d && d <= firstMonthEnd;
  });
  const visitsFirst6Months = visits.filter((h) => {
    const d = eventDate(h);
    return d && d <= first6MonthsEnd;
  });

  if (ageDays > 30 && consultationsFirstMonth.length < 1) {
    alerts.push(makeClinicalAlert({
      id: "child-consult-first-month",
      activity: "consulta no 1º mês",
      title: "Consulta inicial pendente",
      detail: "Necessária 1 consulta médica ou de enfermagem no primeiro mês de vida.",
      severity: "high",
      categoryLabel
    }));
  }

  const targetConsults = ageMonths >= 24 ? 10 : Math.min(10, Math.max(1, Math.ceil(((ageMonths || 0) / 24) * 9) + 1));
  const consultPending = Math.max(targetConsults - consultations.length, 0);
  if (consultPending > 0) {
    alerts.push(makeClinicalAlert({
      id: "child-consult-total",
      activity: "consultas até 2 anos",
      title: `Faltam ${consultPending} consulta(s) até 2 anos`,
      detail: `Registradas: ${consultations.length}. Esperado para idade atual: ${targetConsults}.`,
      severity: ageMonths >= 18 ? "high" : (ageMonths >= 12 ? "medium" : "low"),
      categoryLabel
    }));
  }

  if (ageDays > 30 && visitsFirstMonth.length < 1) {
    alerts.push(makeClinicalAlert({
      id: "child-visit-first-month",
      activity: "visita ACS 1º mês",
      title: "Visita domiciliar pendente no 1º mês",
      detail: "Necessária 1 visita do ACS dentro do primeiro mês de vida.",
      severity: "high",
      categoryLabel
    }));
  }

  if (ageDays > 183 && visitsFirst6Months.length < 2) {
    const missing = 2 - visitsFirst6Months.length;
    alerts.push(makeClinicalAlert({
      id: "child-visit-first-6m",
      activity: "visitas ACS até 6 meses",
      title: `Falta(m) ${missing} visita(s) do ACS até o 6º mês`,
      detail: `Registradas até 6 meses: ${visitsFirst6Months.length}.`,
      severity: "high",
      categoryLabel
    }));
  }

  const vaccinePlan = [
    { month: 0, vaccine: "bcg", label: "BCG", aliases: ["bcg"], acsHighlight: true },
    { month: 0, vaccine: "hepatite_b", label: "Hepatite B", aliases: ["hepatite b"], acsHighlight: true },
    { month: 2, vaccine: "penta", label: "Penta", aliases: ["penta", "pentavalente"], acsHighlight: true },
    { month: 2, vaccine: "vip", label: "VIP", aliases: ["vip", "polio inativada"], acsHighlight: true },
    { month: 2, vaccine: "pneumo10", label: "Pneumo 10", aliases: ["pneumo 10", "pneumo10", "pneumococ"], acsHighlight: true },
    { month: 2, vaccine: "rotavirus", label: "Rotavírus", aliases: ["rota", "rotavirus"], acsHighlight: true },
    { month: 3, vaccine: "meningo", label: "Meningocócica", aliases: ["meningo"], acsHighlight: false },
    { month: 4, vaccine: "penta", label: "Penta", aliases: ["penta", "pentavalente"], acsHighlight: true },
    { month: 4, vaccine: "vip", label: "VIP", aliases: ["vip", "polio inativada"], acsHighlight: true },
    { month: 4, vaccine: "pneumo10", label: "Pneumo 10", aliases: ["pneumo 10", "pneumo10", "pneumococ"], acsHighlight: true },
    { month: 4, vaccine: "rotavirus", label: "Rotavírus", aliases: ["rota", "rotavirus"], acsHighlight: true },
    { month: 5, vaccine: "meningo", label: "Meningocócica", aliases: ["meningo"], acsHighlight: false },
    { month: 6, vaccine: "penta", label: "Penta", aliases: ["penta", "pentavalente"], acsHighlight: true },
    { month: 6, vaccine: "vip", label: "VIP", aliases: ["vip", "polio inativada"], acsHighlight: true },
    { month: 6, vaccine: "influenza", label: "Influenza", aliases: ["influenza", "gripe"], acsHighlight: false },
    { month: 6, vaccine: "covid", label: "COVID", aliases: ["covid"], acsHighlight: false },
    { month: 7, vaccine: "covid", label: "COVID", aliases: ["covid"], acsHighlight: false },
    { month: 9, vaccine: "covid", label: "COVID", aliases: ["covid"], acsHighlight: false },
    { month: 9, vaccine: "febre_amarela", label: "Febre amarela", aliases: ["febre amarela"], acsHighlight: true },
    { month: 12, vaccine: "pneumo10", label: "Pneumo 10", aliases: ["pneumo 10", "pneumo10", "pneumococ"], acsHighlight: true },
    { month: 12, vaccine: "acwy", label: "ACWY", aliases: ["acwy"], acsHighlight: false },
    { month: 12, vaccine: "triplice_viral", label: "Tríplice viral", aliases: ["triplice viral", "triviral"], acsHighlight: true },
    { month: 15, vaccine: "dtp", label: "DTP", aliases: ["dtp"], acsHighlight: false },
    { month: 15, vaccine: "vip", label: "VIP", aliases: ["vip", "polio inativada"], acsHighlight: true },
    { month: 15, vaccine: "triplice_viral", label: "Tríplice viral", aliases: ["triplice viral", "triviral"], acsHighlight: true },
    { month: 15, vaccine: "varicela", label: "Varicela", aliases: ["varicela"], acsHighlight: false },
    { month: 15, vaccine: "hepatite_a", label: "Hepatite A", aliases: ["hepatite a"], acsHighlight: false }
  ];

  const vaccineEvents = history0to24m
    .filter((h) => h.type === "vaccine")
    .map((h) => ({
      date: eventDate(h),
      text: normalizeText(`${h.metadata?.vaccineName || ""} ${h.title || ""} ${h.details || ""}`)
    }))
    .filter((h) => h.date && h.text);

  const appliedCountByVaccine = {};
  for (const event of vaccineEvents) {
    for (const item of vaccinePlan) {
      if (matchesAnyAlias(event.text, item.aliases)) {
        appliedCountByVaccine[item.vaccine] = (appliedCountByVaccine[item.vaccine] || 0) + 1;
      }
    }
  }

  const requiredByNow = {};
  for (const item of vaccinePlan) {
    if ((ageMonths || 0) >= item.month) {
      requiredByNow[item.vaccine] = (requiredByNow[item.vaccine] || 0) + 1;
    }
  }

  const acsFocus = [];
  const grouped = new Map();
  for (const item of vaccinePlan) {
    if ((ageMonths || 0) < item.month) continue;
    const required = requiredByNow[item.vaccine] || 0;
    const applied = appliedCountByVaccine[item.vaccine] || 0;
    if (applied >= required) continue;
    const key = `${item.vaccine}:${item.month}`;
    grouped.set(key, item);
  }

  for (const item of grouped.values()) {
    const overdueMonths = Math.max((ageMonths || 0) - item.month, 0);
    const severity = overdueMonths >= 3 ? "high" : (overdueMonths >= 1 ? "medium" : "low");
    alerts.push(makeClinicalAlert({
      id: `child-vaccine-${item.vaccine}-${item.month}`,
      activity: "vacina",
      title: `Vacina pendente: ${item.label} (${item.month} mês[es])`,
      detail: `Dose prevista aos ${item.month} mês[es] de vida ainda não identificada no histórico.`,
      severity,
      categoryLabel
    }));
    if (item.acsHighlight) {
      acsFocus.push(`${item.label} (${item.month}m)`);
    }
  }

  return {
    timeline: { birthDate, ageMonths, ageDays },
    alerts,
    acsFocus: [...new Set(acsFocus)],
    checklist: {
      consultationsFirstMonthDone: consultationsFirstMonth.length > 0,
      consultationsDone0to24m: consultations.length,
      visitsFirstMonthDone: visitsFirstMonth.length > 0,
      visitsDone0to6m: visitsFirst6Months.length
    }
  };
}

function evaluateElderlyProtocol(_patient, history) {
  const alerts = [];
  const categoryLabel = "Pessoa Idosa";
  const now = toDateOnlySafe(new Date());
  const periodStart = addDays(now, -365);
  const periodHistory = filterHistoryByPeriod(history, periodStart, now);

  const consultations = periodHistory.filter((h) => isClinicalConsultation(h));
  const visits = periodHistory
    .filter((h) => h.type === "visit")
    .map((h) => eventDate(h))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  const vaccines = periodHistory.filter((h) => h.type === "vaccine");
  const influenzaDone = vaccines.some((h) => {
    const text = normalizeText(`${h.metadata?.vaccineName || ""} ${h.title || ""} ${h.details || ""}`);
    return /influenza|gripe/.test(text);
  });

  if (consultations.length < 1) {
    alerts.push(makeClinicalAlert({
      id: "elderly-consult-12m",
      activity: "consulta em 12 meses",
      title: "Consulta anual pendente",
      detail: "Necessária pelo menos 1 consulta médica ou de enfermagem dentro de 12 meses.",
      severity: "high",
      categoryLabel
    }));
  }

  let visitsWithMinInterval = false;
  if (visits.length >= 2) {
    for (let i = 1; i < visits.length; i += 1) {
      const diff = daysDiff(visits[i - 1], visits[i]);
      if ((diff || 0) >= 30) {
        visitsWithMinInterval = true;
        break;
      }
    }
  }
  if (!visitsWithMinInterval) {
    alerts.push(makeClinicalAlert({
      id: "elderly-visits-12m",
      activity: "visitas ACS em 12 meses",
      title: "Visitas domiciliares pendentes",
      detail: "Necessárias 2 visitas do ACS com intervalo mínimo de 30 dias dentro de 12 meses.",
      severity: "high",
      categoryLabel
    }));
  }

  if (!influenzaDone) {
    alerts.push(makeClinicalAlert({
      id: "elderly-flu-12m",
      activity: "vacina influenza",
      title: "Vacina influenza pendente",
      detail: "Necessária 1 dose de influenza dentro dos últimos 12 meses.",
      severity: "medium",
      categoryLabel
    }));
  }

  return {
    timeline: {
      periodStart,
      periodEnd: now
    },
    alerts,
    checklist: {
      consultationDone12m: consultations.length >= 1,
      visitsDone12m: visits.length,
      visitsWithMin30Days: visitsWithMinInterval,
      influenzaDone12m: influenzaDone
    }
  };
}

function evaluateChronicProtocol(patient, history) {
  const conditions = normalizeChronicConditions(patient?.chronicConditions);
  const alerts = [];
  const categoryLabel = "Condição crônica";
  if (!conditions.length) {
    alerts.push(makeClinicalAlert({
      id: "chronic-conditions-missing",
      activity: "subtipo crônico",
      title: "Selecione hipertensão e/ou diabetes",
      detail: "No cadastro do paciente crônico, marque uma ou as duas condições para ativar as regras de acompanhamento.",
      severity: "medium",
      categoryLabel
    }));
    return { alerts, checklist: { conditions: [] }, timeline: {} };
  }

  const now = toDateOnlySafe(new Date());
  const period6Start = addDays(now, -183);
  const period12Start = addDays(now, -365);
  const history6 = filterHistoryByPeriod(history, period6Start, now);
  const history12 = filterHistoryByPeriod(history, period12Start, now);
  const consultations6 = history6.filter((h) => isClinicalConsultation(h));
  const visits12 = history12
    .filter((h) => h.type === "visit")
    .map((h) => eventDate(h))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  let visitsWithMinInterval = false;
  if (visits12.length >= 2) {
    for (let i = 1; i < visits12.length; i += 1) {
      const diff = daysDiff(visits12[i - 1], visits12[i]);
      if ((diff || 0) >= 30) {
        visitsWithMinInterval = true;
        break;
      }
    }
  }

  for (const condition of conditions) {
    const label = condition === "diabetes" ? "Diabetes" : "Hipertensão";
    if (consultations6.length < 1) {
      alerts.push(makeClinicalAlert({
        id: `chronic-${condition}-consult-6m`,
        activity: "consulta em 6 meses",
        title: `${label}: consulta semestral pendente`,
        detail: "Necessária pelo menos 1 consulta médica ou de enfermagem nos últimos 6 meses.",
        severity: "high",
        categoryLabel
      }));
    }
    if (!visitsWithMinInterval) {
      alerts.push(makeClinicalAlert({
        id: `chronic-${condition}-visits-12m`,
        activity: "visitas ACS em 12 meses",
        title: `${label}: visitas domiciliares pendentes`,
        detail: "Necessárias pelo menos 2 visitas do ACS com intervalo mínimo de 30 dias, dentro de 12 meses.",
        severity: "high",
        categoryLabel
      }));
    }

    if (condition === "diabetes") {
      const diabetesEntries12 = history12.filter((h) => ["consultation", "procedure", "note"].includes(h.type));
      const hasGlycated = diabetesEntries12.some((h) => {
        const text = normalizeText(`${h.title || ""} ${h.details || ""}`);
        return /hemoglobina glicada|hba1c|glicada/.test(text);
      });
      const hasFootAssessment = diabetesEntries12.some((h) => {
        const text = normalizeText(`${h.title || ""} ${h.details || ""}`);
        return /avaliac.*pe|avaliacao dos pes|exame dos pes|inspecao dos pes|pe diabetico/.test(text);
      });

      if (!hasGlycated) {
        alerts.push(makeClinicalAlert({
          id: "chronic-diabetes-hba1c-12m",
          activity: "hemoglobina glicada",
          title: "Diabetes: registro de hemoglobina glicada pendente",
          detail: "Registrar solicitação/realização/avaliação de hemoglobina glicada ao menos 1 vez em 12 meses.",
          severity: "high",
          categoryLabel
        }));
      }
      if (!hasFootAssessment) {
        alerts.push(makeClinicalAlert({
          id: "chronic-diabetes-foot-12m",
          activity: "avaliação dos pés",
          title: "Diabetes: avaliação dos pés pendente",
          detail: "Registrar pelo menos 1 avaliação dos pés em 12 meses.",
          severity: "medium",
          categoryLabel
        }));
      }
    }
  }

  return {
    alerts,
    timeline: { period6Start, period12Start, periodEnd: now },
    checklist: {
      conditions,
      consultationDone6m: consultations6.length >= 1,
      visitsDone12m: visits12.length,
      visitsWithMin30Days12m: visitsWithMinInterval
    }
  };
}

function buildProtocolSummary(patient, history, templateMap) {
  const normalizedCategory = normalizeCategory(patient.careCategory, templateMap);
  const template = templateMap[normalizedCategory] || templateMap.general;

  const completed = {
    visits: history.filter((h) => h.type === "visit").length,
    consultations: history.filter((h) => isClinicalConsultation(h)).length,
    vaccines: history.filter((h) => h.type === "vaccine").length
  };

  const pending = {
    visits: Math.max(template.targets.visits - completed.visits, 0),
    consultations: Math.max(template.targets.consultations - completed.consultations, 0),
    vaccines: Math.max(template.targets.vaccines - completed.vaccines, 0)
  };

  const lastDates = {
    visits: history.find((h) => h.type === "visit")?.date || "",
    consultations: history.find((h) => isClinicalConsultation(h))?.date || "",
    vaccines: history.find((h) => h.type === "vaccine")?.date || ""
  };

  const now = Date.now();
  const scheduleOf = (key) => {
    const intervalDays = Number(template.deadlines?.[key] || 0);
    const lastDate = lastDates[key];
    const lastTs = lastDate ? new Date(lastDate).getTime() : NaN;
    const daysSinceLast = Number.isFinite(lastTs)
      ? Math.max(0, Math.floor((now - lastTs) / (1000 * 60 * 60 * 24)))
      : null;
    const daysLeft = intervalDays > 0
      ? (daysSinceLast === null ? intervalDays : intervalDays - daysSinceLast)
      : null;
    const overdueDays = intervalDays > 0 && daysSinceLast !== null
      ? Math.max(daysSinceLast - intervalDays, 0)
      : 0;
    return {
      intervalDays,
      lastDate,
      daysSinceLast,
      daysLeft,
      overdueDays,
      pending: Number(pending[key] || 0)
    };
  };

  const appliedVaccineNames = history
    .filter((h) => h.type === "vaccine")
    .map((h) => h.metadata?.vaccineName || h.title || "")
    .filter(Boolean);
  const normalizedAppliedVaccineNames = appliedVaccineNames.map((name) => normalizeText(name));
  const vaccineAliases = {
    dtpa: ["dtpa"],
    influenza: ["influenza", "gripe"],
    "covid-19": ["covid-19", "covid 19", "covid"],
    "hepatite b": ["hepatite b", "hbv"],
    bcg: ["bcg"],
    penta: ["penta", "pentavalente"],
    vip: ["vip", "polio inativada"],
    "pneumo 10": ["pneumo 10", "pneumo10", "pneumococ"],
    rotavirus: ["rotavirus", "rota"],
    meningococica: ["meningococica", "meningo"],
    acwy: ["acwy"],
    "triplice viral": ["triplice viral", "triviral"],
    dtp: ["dtp"],
    varicela: ["varicela"],
    "hepatite a": ["hepatite a"],
    hpv: ["hpv"]
  };
  const vaccineDoneByName = (name) => {
    const normalizedName = normalizeText(name);
    const aliases = vaccineAliases[normalizedName] || [normalizedName];
    return normalizedAppliedVaccineNames.some((applied) => aliases.some((alias) => applied.includes(alias)));
  };

  const recommendedVaccines = template.vaccines.map((name) => ({
    name,
    done: vaccineDoneByName(name)
  }));

  let specialMonitoring = null;
  let specialAlerts = [];
  if (template.category === "pregnant") {
    specialMonitoring = evaluatePregnantProtocol(patient, history);
    specialAlerts = specialMonitoring.alerts || [];
  } else if (template.category === "puerperal") {
    specialMonitoring = evaluatePuerperalProtocol(patient, history);
    specialAlerts = specialMonitoring.alerts || [];
  } else if (template.category === "pap_only") {
    specialMonitoring = evaluatePapOnlyProtocol(patient, history);
    specialAlerts = specialMonitoring.alerts || [];
  } else if (template.category === "child_followup") {
    specialMonitoring = evaluateChildProtocol(patient, history);
    specialAlerts = specialMonitoring.alerts || [];
  } else if (template.category === "chronic") {
    specialMonitoring = evaluateChronicProtocol(patient, history);
    specialAlerts = specialMonitoring.alerts || [];
  } else if (template.category === "elderly") {
    specialMonitoring = evaluateElderlyProtocol(patient, history);
    specialAlerts = specialMonitoring.alerts || [];
  }

  return {
    category: template.category,
    categoryLabel: template.label,
    targets: template.targets,
    completed,
    pending,
    deadlines: template.deadlines || { visits: 0, consultations: 0, vaccines: 0 },
    lastDates,
    schedule: {
      visits: scheduleOf("visits"),
      consultations: scheduleOf("consultations"),
      vaccines: scheduleOf("vaccines")
    },
    specialAlerts,
    specialMonitoring,
    vaccines: {
      recommended: recommendedVaccines,
      appliedNames: [...new Set(appliedVaccineNames)]
    }
  };
}


function buildAiPatientContext(db, user, patient) {
  const history = buildPatientHistory(db, patient.id);
  const protocolSummary = buildProtocolSummary(patient, history, getProtocolTemplateMap(db, user.teamId));
  const tasks = db.tasks.filter((t) => t.patientId === patient.id);
  const appointments = db.appointments.filter((a) => a.patientId === patient.id);
  const messages = db.messages.filter((m) => m.patientId === patient.id);
  return {
    patient,
    history,
    tasks,
    appointments,
    messages,
    protocolSummary
  };
}

function buildAiTeamContexts(db, user) {
  const patients = getAllowedPatients(db, user, {});
  return patients.map((patient) => buildAiPatientContext(db, user, patient));
}

function parseMonthPeriod(monthText = "") {
  const now = new Date();
  const fallbackYear = now.getFullYear();
  const fallbackMonth = now.getMonth() + 1;
  const raw = String(monthText || "").trim();
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  const year = match ? Number(match[1]) : fallbackYear;
  const month = match ? Number(match[2]) : fallbackMonth;
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { year, month, start, end, key: `${year}-${String(month).padStart(2, "0")}` };
}

function buildMonthlyDemandMetric(db, teamId, monthText = "") {
  const period = parseMonthPeriod(monthText);
  if (!period) return null;

  const teamPatientIds = new Set(db.patients.filter((p) => p.teamId === teamId).map((p) => p.id));
  const inMonth = db.appointments.filter((a) => {
    if (!teamPatientIds.has(a.patientId)) return false;
    const d = new Date(a.date || a.createdAt || "");
    if (Number.isNaN(d.getTime())) return false;
    return d >= period.start && d < period.end;
  });

  const scheduled = inMonth.filter((a) => normalizeDemandType(a.demandType) === "scheduled").length;
  const spontaneous = inMonth.filter((a) => normalizeDemandType(a.demandType) === "spontaneous").length;
  const total = scheduled + spontaneous;
  const ratioScheduled = total > 0 ? Number(((scheduled / total) * 100).toFixed(2)) : 0;
  const min = 50;
  const max = 70;
  const outOfRange = total > 0 && (ratioScheduled < min || ratioScheduled > max);

  return {
    month: period.key,
    range: {
      start: period.start.toISOString(),
      endExclusive: period.end.toISOString()
    },
    totals: {
      scheduled,
      spontaneous,
      total
    },
    ratioScheduled,
    target: { min, max },
    status: total === 0 ? "no_data" : (outOfRange ? "out_of_range" : "in_range"),
    alert: outOfRange
      ? `Razão programada fora da faixa (50-70%). Atual: ${ratioScheduled.toFixed(2)}%.`
      : ""
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/protocol/templates", requireAuth, async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const disabledByTeam = new Set(
    db.protocolTemplates
      .filter((t) => t.teamId === req.user.teamId && t.deleted)
      .map((t) => String(t.category || ""))
  );
  const items = db.protocolTemplates
    .filter((t) => !t.deleted)
    .filter((t) => !t.teamId || t.teamId === req.user.teamId)
    .filter((t) => !(!t.teamId && disabledByTeam.has(String(t.category || ""))));
  res.json(items);
});

app.get("/teams/public", async (_req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const items = db.teams
    .map((t) => ({ id: t.id, name: t.name }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
  res.json(items);
});

app.get("/integrations/council/status", (_req, res) => {
  const config = getCouncilIntegrationConfig();
  return res.json({
    mode: config.mode,
    provider: config.provider,
    configured: Boolean(config.url),
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    requireEvidence: config.requireEvidence
  });
});

app.post("/auth/register", authRateLimit, async (req, res) => {
  const payload = req.body || {};
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const role = canonicalRole(payload.role);
  const councilType = councilTypeForRole(role);

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password e role são obrigatórios" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Senha fraca: mínimo de 8 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial" });
  }
  if (!ALLOWED_SELF_REGISTER_ROLES.includes(role) || !["nurse_manager", "doctor"].includes(role)) {
    return res.status(400).json({ error: "Cadastro público permitido apenas para enfermeira e médica" });
  }

  const councilValidation = validateCouncilData(role, payload.councilNumber, payload.councilUf);
  if (!councilValidation.ok) {
    return res.status(400).json({ error: councilValidation.message });
  }

  const externalCheck = await verifyCouncilExternally({
    role,
    councilType,
    councilNumber: councilValidation.councilNumber || "",
    councilUf: councilValidation.councilUf || "",
    name,
    email
  });
  if (!externalCheck.valid) {
    return res.status(400).json({
      error: externalCheck.error || "Conselho não validado no provedor externo"
    });
  }

  const result = await withDb((db) => {
    ensureDbShape(db);
    if (db.users.some((u) => String(u.email || "").toLowerCase() === email)) {
      return { error: "E-mail já cadastrado", status: 409 };
    }

    const duplicatedCouncil = roleNeedsCouncil(role) && db.users.some((u) => {
      const uRole = canonicalRole(u.role);
      return roleNeedsCouncil(uRole)
        && String(u.councilType || "").toUpperCase() === councilType
        && String(u.councilNumber || "") === councilValidation.councilNumber
        && String(u.councilUf || "").toUpperCase() === councilValidation.councilUf;
    });
    if (duplicatedCouncil) {
      return { error: `${councilType} já cadastrado para outro usuário`, status: 409 };
    }

    const teamId = String(payload.teamId || "").trim();
    if (!teamId) {
      return { error: "teamId é obrigatório para cadastro", status: 400 };
    }
    const team = db.teams.find((t) => t.id === teamId);
    if (!team) {
      return { error: "Equipe informada não existe", status: 400 };
    }

    const user = {
      id: uuidv4(),
      name,
      role,
      email,
      password: hashPassword(password),
      teamId,
      councilType,
      councilNumber: councilValidation.councilNumber || "",
      councilUf: councilValidation.councilUf || "",
      councilVerification: {
        checked: externalCheck.checked,
        provider: externalCheck.provider,
        status: externalCheck.status,
        verifiedAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    if (role === "nurse_manager" && !team.managerUserId) {
      team.managerUserId = user.id;
      team.updatedAt = new Date().toISOString();
    }
    return { user, db };
  });

  if (result?.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  const safeUser = sanitizeUser(result.user, result.db);
  const token = createToken(result.user, result.db);
  return res.status(201).json({ user: safeUser, token });
});

app.post("/auth/register/request-code", authRateLimit, async (_req, res) => {
  return res.status(410).json({ error: "Fluxo de código desativado. Use /auth/register." });
});

app.post("/auth/register/confirm", authRateLimit, async (_req, res) => {
  return res.status(410).json({ error: "Fluxo de código desativado. Use /auth/register." });
});

app.post("/auth/login", authRateLimit, async (req, res) => {
  const { email, password } = req.body || {};
  let db = await readDb();
  ensureDbShape(db);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const inputPassword = String(password || "");
  let user = db.users.find(
    (u) => String(u.email || "").toLowerCase() === normalizedEmail && verifyPassword(inputPassword, u.password)
  );

  if (!user) {
    const recovered = await ensureDemoManagerIfNeeded(email, password);
    if (recovered?.user) {
      user = recovered.user;
      db = recovered.db;
    }
  }
  if (!user) return res.status(401).json({ error: "Credenciais inválidas" });

  if (!isHashedPassword(user.password)) {
    await withDb((mutableDb) => {
      ensureDbShape(mutableDb);
      const idx = mutableDb.users.findIndex((u) => u.id === user.id);
      if (idx >= 0) {
        mutableDb.users[idx].password = hashPassword(inputPassword);
        mutableDb.users[idx].updatedAt = new Date().toISOString();
      }
    });
    db = await readDb();
    ensureDbShape(db);
    user = db.users.find((u) => u.id === user.id) || user;
  }

  const safeUser = sanitizeUser(user, db);
  const token = createToken(user, db);
  return res.json({ user: safeUser, token });
});

app.post("/auth/login/verify", authRateLimit, async (_req, res) => {
  return res.status(410).json({ error: "Fluxo 2FA desativado. Use /auth/login." });
});

app.use(requireAuth);

app.get("/me", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
  return res.json(sanitizeUser(user, db));
});

app.patch("/me", async (req, res) => {
  const payload = req.body || {};

  const result = await withDb(async (db) => {
    ensureDbShape(db);
    const index = db.users.findIndex((u) => u.id === req.user.id);
    if (index < 0) return { error: { status: 404, message: "Usuário não encontrado" } };

    const current = db.users[index];
    const next = { ...current };

    if (payload.name !== undefined) {
      const name = String(payload.name || "").trim();
      if (!name) return { error: { status: 400, message: "Nome não pode ficar vazio" } };
      next.name = name;
    }

    if (payload.email !== undefined) {
      const email = String(payload.email || "").trim().toLowerCase();
      if (!email) return { error: { status: 400, message: "Email não pode ficar vazio" } };
      if (!isValidEmail(email)) return { error: { status: 400, message: "E-mail inválido" } };
      const exists = db.users.some((u) => u.id !== current.id && String(u.email).toLowerCase() === email);
      if (exists) return { error: { status: 409, message: "E-mail já em uso por outro usuário" } };
      next.email = email;
    }

    if (payload.password !== undefined) {
      const password = String(payload.password || "");
      if (!isStrongPassword(password)) {
        return { error: { status: 400, message: "Senha fraca: mínimo de 8 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial" } };
      }
      next.password = hashPassword(password);
    }

    const role = canonicalRole(current.role);
    if (roleNeedsCouncil(role) && (payload.councilNumber !== undefined || payload.councilUf !== undefined)) {
      const candidateNumber = payload.councilNumber !== undefined ? payload.councilNumber : current.councilNumber;
      const candidateUf = payload.councilUf !== undefined ? payload.councilUf : current.councilUf;

      const localCheck = validateCouncilData(role, candidateNumber, candidateUf);
      if (!localCheck.ok) return { error: { status: 400, message: localCheck.message } };

      const councilType = councilTypeForRole(role);
      const duplicated = db.users.some((u) => {
        if (u.id === current.id) return false;
        return String(u.councilType || "").toUpperCase() === councilType
          && String(u.councilNumber || "") === localCheck.councilNumber
          && String(u.councilUf || "").toUpperCase() === localCheck.councilUf;
      });

      if (duplicated) {
        return { error: { status: 409, message: `${councilType} j? cadastrado para outro usuário` } };
      }

      const unchangedCouncil = String(current.councilType || "").toUpperCase() === String(councilType || "").toUpperCase()
        && String(current.councilNumber || "") === String(localCheck.councilNumber || "")
        && String(current.councilUf || "").toUpperCase() === String(localCheck.councilUf || "").toUpperCase();

      if (!unchangedCouncil) {
        const external = await verifyCouncilExternally({
          role,
          councilType,
          councilNumber: localCheck.councilNumber,
          councilUf: localCheck.councilUf,
          name: next.name,
          email: next.email
        });

        if (!external.valid) {
          return { error: { status: 400, message: external.error || "Conselho não validado no provedor externo" } };
        }

        next.councilVerification = {
          checked: external.checked,
          provider: external.provider,
          status: external.status,
          verifiedAt: new Date().toISOString()
        };
      }

      next.councilType = councilType;
      next.councilNumber = localCheck.councilNumber;
      next.councilUf = localCheck.councilUf;
    }

    next.updatedAt = new Date().toISOString();
    db.users[index] = next;

    addAuditLog(db, next, "user.profile_updated", "user", next.id, {
      changedFields: Object.keys(payload || {})
    });

    const safeUser = sanitizeUser(next, db);
    const token = createToken(next, db);
    return { user: safeUser, token };
  });

  if (result.error) return res.status(result.error.status).json({ error: result.error.message });
  return res.json(result);
});

app.get("/protocol/templates/:category/usage", requireManagerOrDoctor, async (req, res) => {
  const category = String(req.params.category || "").trim();
  const db = await readDb();
  ensureDbShape(db);
  const teamDeleted = db.protocolTemplates.some((t) => t.category === category && t.teamId === req.user.teamId && t.deleted);
  const template = db.protocolTemplates.find((t) => t.category === category && !t.deleted && (!t.teamId || t.teamId === req.user.teamId));
  if (!template) return res.status(404).json({ error: "Categoria de protocolo não encontrada" });

  const patientCount = db.patients.filter(
    (p) => p.teamId === req.user.teamId && p.careCategory === category
  ).length;

  const recordsCount = db.clinicalRecords.filter((r) => {
    if (String(r.protocolTag || "") !== category) return false;
    const patient = db.patients.find((p) => p.id === r.patientId);
    return patient?.teamId === req.user.teamId;
  }).length;

  return res.json({
    category,
    patientCount,
    recordsCount,
    canDelete: !teamDeleted && category !== "general" && patientCount === 0 && recordsCount === 0
  });
});

app.post("/protocol/templates", requireManagerOrDoctor, async (req, res) => {
  const payloadCheck = sanitizeProtocolTemplatePayload(req.body || {});
  if (!payloadCheck.ok) return res.status(400).json({ error: payloadCheck.error });

  const result = await withDb((db) => {
    ensureDbShape(db);
    const exists = db.protocolTemplates.some((t) => t.category === payloadCheck.template.category && t.teamId === req.user.teamId && !t.deleted);
    if (exists) return { error: "Categoria já existe" };
    const deletedIndex = db.protocolTemplates.findIndex((t) => t.category === payloadCheck.template.category && t.teamId === req.user.teamId && t.deleted);
    if (deletedIndex >= 0) db.protocolTemplates.splice(deletedIndex, 1);
    const created = {
      ...payloadCheck.template,
      teamId: req.user.teamId
    };
    db.protocolTemplates.push(created);
    addAuditLog(db, req.user, "protocol_template.created", "protocol_template", created.category, {
      label: created.label
    });
    return created;
  });

  if (result.error) return res.status(409).json({ error: result.error });
  return res.status(201).json(result);
});

app.put("/protocol/templates/:category", requireManagerOrDoctor, async (req, res) => {
  const category = String(req.params.category || "").trim();
  const payloadCheck = sanitizeProtocolTemplatePayload(req.body || {}, category);
  if (!payloadCheck.ok) return res.status(400).json({ error: payloadCheck.error });

  const result = await withDb((db) => {
    ensureDbShape(db);
    const deletedIndex = db.protocolTemplates.findIndex((t) => t.category === category && t.teamId === req.user.teamId && t.deleted);
    if (deletedIndex >= 0) db.protocolTemplates.splice(deletedIndex, 1);
    const index = db.protocolTemplates.findIndex((t) => t.category === category && t.teamId === req.user.teamId && !t.deleted);
    if (index >= 0) {
      const current = db.protocolTemplates[index];
      const next = {
        ...current,
        ...payloadCheck.template,
        category,
        teamId: req.user.teamId
      };
      db.protocolTemplates[index] = next;
      addAuditLog(db, req.user, "protocol_template.updated", "protocol_template", category, {
        changedFields: Object.keys(req.body || {})
      });
      return next;
    }

    const globalTemplate = db.protocolTemplates.find((t) => t.category === category && !t.teamId && !t.deleted);
    if (!globalTemplate) return null;

    const createdOverride = {
      ...globalTemplate,
      ...payloadCheck.template,
      category,
      teamId: req.user.teamId
    };
    db.protocolTemplates.push(createdOverride);
    addAuditLog(db, req.user, "protocol_template.override_created", "protocol_template", category, {
      changedFields: Object.keys(req.body || {})
    });
    return createdOverride;
  });

  if (!result) return res.status(404).json({ error: "Categoria de protocolo não encontrada" });
  return res.json(result);
});

app.delete("/protocol/templates/:category", requireManagerOrDoctor, async (req, res) => {
  const category = String(req.params.category || "").trim();
  if (category === "general") {
    return res.status(400).json({ error: "A categoria geral não pode ser excluída" });
  }

  const result = await withDb((db) => {
    ensureDbShape(db);
    const teamIndex = db.protocolTemplates.findIndex((t) => t.category === category && t.teamId === req.user.teamId && !t.deleted);
    const globalTemplate = db.protocolTemplates.find((t) => t.category === category && !t.teamId && !t.deleted);
    if (teamIndex < 0 && !globalTemplate) return { error: { status: 404, message: "Categoria de protocolo não encontrada" } };

    const patientCount = db.patients.filter(
      (p) => p.teamId === req.user.teamId && p.careCategory === category
    ).length;

    const recordsCount = db.clinicalRecords.filter((r) => {
      if (String(r.protocolTag || "") !== category) return false;
      const patient = db.patients.find((p) => p.id === r.patientId);
      return patient?.teamId === req.user.teamId;
    }).length;

    if (patientCount > 0 || recordsCount > 0) {
      return {
        error: {
          status: 409,
          message: "Categoria em uso. Realoque pacientes/registros antes de excluir.",
          details: { patientCount, recordsCount }
        }
      };
    }

    if (teamIndex >= 0) {
      db.protocolTemplates.splice(teamIndex, 1);
      addAuditLog(db, req.user, "protocol_template.deleted", "protocol_template", category, {
        mode: "team_override_removed"
      });
    } else {
      const existingTombstone = db.protocolTemplates.find((t) => t.category === category && t.teamId === req.user.teamId && t.deleted);
      if (!existingTombstone) {
        db.protocolTemplates.push({
          category,
          label: String(globalTemplate?.label || category),
          teamId: req.user.teamId,
          deleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: req.user.id
        });
      }
      addAuditLog(db, req.user, "protocol_template.deleted", "protocol_template", category, {
        mode: "team_tombstone_on_global"
      });
    }
    return { ok: true };
  });

  if (result.error) return res.status(result.error.status).json({ error: result.error.message, details: result.error.details || {} });
  return res.json({ ok: true });
});

app.get("/users", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);

  const safeUsers = db.users
    .filter((u) => u.teamId === req.user.teamId)
    .map((u) => sanitizeUser(u, db));

  return res.json(safeUsers.map(({ password, ...u }) => u));
});

app.post("/users", requireManager, async (req, res) => {
  const payload = req.body || {};
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const role = canonicalRole(payload.role);

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password e role são obrigatórios" });
  }

  if (!["acs", "doctor"].includes(role)) {
    return res.status(400).json({ error: "A enfermeira pode cadastrar apenas ACS ou Medico(a)" });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Senha fraca: mínimo de 8 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial" });
  }

  const councilType = councilTypeForRole(role);
  const councilValidation = validateCouncilData(role, payload.councilNumber, payload.councilUf);
  if (!councilValidation.ok) {
    return res.status(400).json({ error: councilValidation.message });
  }

  const externalCheck = await verifyCouncilExternally({
    role,
    councilType,
    councilNumber: councilValidation.councilNumber || "",
    councilUf: councilValidation.councilUf || "",
    name,
    email
  });

  if (!externalCheck.valid) {
    return res.status(400).json({
      error: externalCheck.error || "Conselho não validado no provedor externo"
    });
  }

  const result = await withDb((db) => {
    ensureDbShape(db);
    if (db.users.some((u) => String(u.email).toLowerCase() === email)) {
      return { error: "E-mail já cadastrado" };
    }

    const duplicatedCouncil = roleNeedsCouncil(role) && db.users.some((u) => {
      const uRole = canonicalRole(u.role);
      return roleNeedsCouncil(uRole)
        && String(u.councilType || "").toUpperCase() === councilType
        && String(u.councilNumber || "") === councilValidation.councilNumber
        && String(u.councilUf || "").toUpperCase() === councilValidation.councilUf;
    });

    if (duplicatedCouncil) {
      return { error: `${councilType} j? cadastrado para outro usuário` };
    }

    const user = {
      id: uuidv4(),
      name,
      role,
      email,
      password: hashPassword(password),
      teamId: req.user.teamId,
      councilType,
      councilNumber: councilValidation.councilNumber || "",
      councilUf: councilValidation.councilUf || "",
      councilVerification: {
        checked: externalCheck.checked,
        provider: externalCheck.provider,
        status: externalCheck.status,
        verifiedAt: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    };

    db.users.push(user);
    addAuditLog(db, req.user, "user.created_by_manager", "user", user.id, {
      role: user.role,
      teamId: user.teamId
    });
    return { user, db };
  });

  if (result.error) return res.status(409).json({ error: result.error });
  return res.status(201).json(sanitizeUser(result.user, result.db));
});

function getTeamUserUsage(db, userId, teamId) {
  const teamPatientIds = new Set(db.patients.filter((p) => p.teamId === teamId).map((p) => p.id));
  const assignedPatients = db.patients.filter((p) => p.teamId === teamId && p.assignedAcsId === userId).length;
  const openTasksAssigned = db.tasks.filter((t) => teamPatientIds.has(t.patientId) && t.assigneeId === userId && t.status !== "done").length;
  const appointmentsAuthored = db.appointments.filter((a) => teamPatientIds.has(a.patientId) && a.createdBy === userId).length;
  const messagesAuthored = db.messages.filter((m) => teamPatientIds.has(m.patientId) && m.authorId === userId).length;
  const clinicalRecordsAuthored = db.clinicalRecords.filter((r) => teamPatientIds.has(r.patientId) && r.createdBy === userId).length;
  const linkedTotal = assignedPatients + openTasksAssigned + appointmentsAuthored + messagesAuthored + clinicalRecordsAuthored;
  return {
    assignedPatients,
    openTasksAssigned,
    appointmentsAuthored,
    messagesAuthored,
    clinicalRecordsAuthored,
    linkedTotal
  };
}

app.get("/users/:id/usage", requireManager, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const db = await readDb();
  ensureDbShape(db);
  const target = db.users.find((u) => u.id === id && u.teamId === req.user.teamId);
  if (!target) return res.status(404).json({ error: "Usuário não encontrado" });
  if (!["acs", "doctor"].includes(canonicalRole(target.role))) {
    return res.status(400).json({ error: "Somente ACS/Médico podem ser gerenciados nesta tela" });
  }
  const usage = getTeamUserUsage(db, target.id, req.user.teamId);
  return res.json({
    userId: target.id,
    role: canonicalRole(target.role),
    ...usage,
    canDelete: usage.linkedTotal === 0
  });
});

app.put("/users/:id", requireManager, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const payload = req.body || {};
  const result = await withDb(async (db) => {
    ensureDbShape(db);
    const index = db.users.findIndex((u) => u.id === id && u.teamId === req.user.teamId);
    if (index < 0) return { error: { status: 404, message: "Usuário não encontrado" } };
    const current = db.users[index];
    const role = canonicalRole(current.role);
    if (!["acs", "doctor"].includes(role)) {
      return { error: { status: 400, message: "Somente ACS/Médico podem ser editados nesta tela" } };
    }

    const next = { ...current };
    if (payload.name !== undefined) {
      const name = String(payload.name || "").trim();
      if (!name) return { error: { status: 400, message: "Nome não pode ficar vazio" } };
      next.name = name;
    }
    if (payload.email !== undefined) {
      const email = String(payload.email || "").trim().toLowerCase();
      if (!email || !isValidEmail(email)) return { error: { status: 400, message: "E-mail inválido" } };
      const duplicated = db.users.some((u) => u.id !== current.id && String(u.email || "").toLowerCase() === email);
      if (duplicated) return { error: { status: 409, message: "E-mail já em uso por outro usuário" } };
      next.email = email;
    }
    if (payload.password !== undefined) {
      const password = String(payload.password || "");
      if (!password) {
        return { error: { status: 400, message: "Senha não pode ficar vazia" } };
      }
      if (!isStrongPassword(password)) {
        return { error: { status: 400, message: "Senha fraca: mínimo de 8 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial" } };
      }
      next.password = hashPassword(password);
    }

    if (roleNeedsCouncil(role) && (payload.councilNumber !== undefined || payload.councilUf !== undefined)) {
      const candidateNumber = payload.councilNumber !== undefined ? payload.councilNumber : current.councilNumber;
      const candidateUf = payload.councilUf !== undefined ? payload.councilUf : current.councilUf;
      const localCheck = validateCouncilData(role, candidateNumber, candidateUf);
      if (!localCheck.ok) return { error: { status: 400, message: localCheck.message } };
      const councilType = councilTypeForRole(role);
      const duplicatedCouncil = db.users.some((u) => {
        if (u.id === current.id) return false;
        return String(u.councilType || "").toUpperCase() === councilType
          && String(u.councilNumber || "") === localCheck.councilNumber
          && String(u.councilUf || "").toUpperCase() === localCheck.councilUf;
      });
      if (duplicatedCouncil) return { error: { status: 409, message: `${councilType} já cadastrado para outro usuário` } };

      const unchangedCouncil = String(current.councilType || "").toUpperCase() === String(councilType || "").toUpperCase()
        && String(current.councilNumber || "") === String(localCheck.councilNumber || "")
        && String(current.councilUf || "").toUpperCase() === String(localCheck.councilUf || "").toUpperCase();
      if (!unchangedCouncil) {
        const external = await verifyCouncilExternally({
          role,
          councilType,
          councilNumber: localCheck.councilNumber,
          councilUf: localCheck.councilUf,
          name: next.name,
          email: next.email
        });
        if (!external.valid) {
          return { error: { status: 400, message: external.error || "Conselho não validado no provedor externo" } };
        }
        next.councilVerification = {
          checked: external.checked,
          provider: external.provider,
          status: external.status,
          verifiedAt: new Date().toISOString()
        };
      }
      next.councilType = councilType;
      next.councilNumber = localCheck.councilNumber;
      next.councilUf = localCheck.councilUf;
    }

    next.updatedAt = new Date().toISOString();
    db.users[index] = next;
    addAuditLog(db, req.user, "user.updated_by_manager", "user", next.id, {
      changedFields: Object.keys(payload || {})
    });
    return { user: sanitizeUser(next, db) };
  });
  if (result.error) return res.status(result.error.status).json({ error: result.error.message });
  return res.json(result.user);
});

app.delete("/users/:id", requireManager, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (id === req.user.id) {
    return res.status(400).json({ error: "Não é permitido excluir o próprio usuário" });
  }

  const result = await withDb((db) => {
    ensureDbShape(db);
    const index = db.users.findIndex((u) => u.id === id && u.teamId === req.user.teamId);
    if (index < 0) return { error: { status: 404, message: "Usuário não encontrado" } };
    const current = db.users[index];
    const role = canonicalRole(current.role);
    if (!["acs", "doctor"].includes(role)) {
      return { error: { status: 400, message: "Somente ACS/Médico podem ser excluídos nesta tela" } };
    }

    const usage = getTeamUserUsage(db, current.id, req.user.teamId);
    if (usage.linkedTotal > 0) {
      return {
        error: {
          status: 409,
          message: "Ação bloqueada: usuário possui vínculos ativos. Realoque/remova vínculos antes de excluir.",
          details: usage
        }
      };
    }

    db.users.splice(index, 1);
    addAuditLog(db, req.user, "user.deleted_by_manager", "user", current.id, { role });
    return { ok: true };
  });

  if (result.error) return res.status(result.error.status).json({ error: result.error.message, details: result.error.details || {} });
  return res.json({ ok: true });
});

app.get("/patients", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const patients = getAllowedPatients(db, req.user, req.query);
  res.json(patients);
});

app.get("/patients/protocol-summaries", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);

  const idsParam = String(req.query.ids || "").trim();
  const requestedIds = idsParam
    ? idsParam.split(",").map((id) => id.trim()).filter(Boolean)
    : [];
  const requestedSet = new Set(requestedIds);
  const protocolMap = getProtocolTemplateMap(db, req.user.teamId);
  const allowedPatients = getAllowedPatients(db, req.user, req.query)
    .filter((patient) => !requestedSet.size || requestedSet.has(patient.id));

  const summaries = {};
  for (const patient of allowedPatients) {
    const history = buildPatientHistory(db, patient.id);
    summaries[patient.id] = buildProtocolSummary(patient, history, protocolMap);
  }

  return res.json({
    count: Object.keys(summaries).length,
    summaries
  });
});

app.post("/patients", requireManagerOrDoctor, async (req, res) => {
  const payload = req.body;
  const db = await readDb();
  ensureDbShape(db);
  const protocolMap = getProtocolTemplateMap(db, req.user.teamId);

  if (!payload.name || !payload.phone) {
    return res.status(400).json({ error: "Nome e telefone são obrigatórios" });
  }

  const patient = {
    id: uuidv4(),
    teamId: req.user.teamId,
    name: String(payload.name).trim(),
    motherName: payload.motherName ? String(payload.motherName).trim() : "",
    cpf: payload.cpf ? String(payload.cpf).trim() : "",
    cns: payload.cns ? String(payload.cns).trim() : "",
    cnsCpf: payload.cnsCpf
      ? String(payload.cnsCpf).trim()
      : (payload.cpf ? String(payload.cpf).trim() : (payload.cns ? String(payload.cns).trim() : "")),
    address: payload.address ? String(payload.address).trim() : "",
    phone: String(payload.phone).trim(),
    phoneAlt: payload.phoneAlt ? String(payload.phoneAlt).trim() : "",
    microArea: payload.microArea ? String(payload.microArea).trim() : "",
    assignedAcsId: payload.assignedAcsId ? String(payload.assignedAcsId).trim() : "",
    careCategory: normalizeCategory(payload.careCategory, protocolMap),
    chronicConditions: normalizeChronicConditions(payload.chronicConditions),
    maritalStatus: payload.maritalStatus ? String(payload.maritalStatus).trim().toLowerCase() : "",
    sexAtBirth: payload.sexAtBirth ? String(payload.sexAtBirth).trim().toLowerCase() : "",
    genderIdentity: payload.genderIdentity ? String(payload.genderIdentity).trim().toLowerCase() : "",
    birthDate: payload.birthDate ? String(payload.birthDate).trim() : "",
    pregnancyStartDate: payload.pregnancyStartDate ? String(payload.pregnancyStartDate).trim() : "",
    expectedDeliveryDate: payload.expectedDeliveryDate ? String(payload.expectedDeliveryDate).trim() : "",
    gestationalAgeDumWeeks: Number.isFinite(Number(payload.gestationalAgeDumWeeks))
      ? Math.max(0, Math.min(45, Number(payload.gestationalAgeDumWeeks)))
      : "",
    gestationalAgeUsgWeeks: Number.isFinite(Number(payload.gestationalAgeUsgWeeks))
      ? Math.max(0, Math.min(45, Number(payload.gestationalAgeUsgWeeks)))
      : "",
    usgDate1: payload.usgDate1 ? String(payload.usgDate1).trim() : "",
    usgDate2: payload.usgDate2 ? String(payload.usgDate2).trim() : "",
    usgDate3: payload.usgDate3 ? String(payload.usgDate3).trim() : "",
    prenatalStartDate: payload.prenatalStartDate ? String(payload.prenatalStartDate).trim() : "",
    postpartumStartDate: payload.postpartumStartDate ? String(payload.postpartumStartDate).trim() : "",
    comorbidities: payload.comorbidities ? String(payload.comorbidities).trim() : "",
    medications: payload.medications ? String(payload.medications).trim() : "",
    allergies: payload.allergies ? String(payload.allergies).trim() : "",
    createdAt: new Date().toISOString(),
    createdBy: req.user.id
  };

  withDb((db) => {
    ensureDbShape(db);
    db.patients.push(patient);
    addAuditLog(db, req.user, "patient.created", "patient", patient.id, {
      name: patient.name,
      teamId: patient.teamId,
      microArea: patient.microArea,
      assignedAcsId: patient.assignedAcsId,
      careCategory: patient.careCategory
    });
  });

  return res.status(201).json(patient);
});

app.put("/patients/:id", async (req, res) => {
  const { id } = req.params;
  const payload = req.body;

  if (!(isManager(req.user) || isDoctor(req.user))) {
    return res.status(403).json({ error: "Sem permissão para editar paciente" });
  }

  const updated = await withDb((db) => {
    ensureDbShape(db);
    const index = db.patients.findIndex((p) => p.id === id && p.teamId === req.user.teamId);
    if (index < 0) return null;

    const current = db.patients[index];
    const protocolMap = getProtocolTemplateMap(db, req.user.teamId);
    const doctorAllowed = new Set([
      "phone",
      "phoneAlt",
      "address",
      "comorbidities",
      "medications",
      "allergies",
      "birthDate",
      "pregnancyStartDate",
      "expectedDeliveryDate",
      "gestationalAgeDumWeeks",
      "gestationalAgeUsgWeeks",
      "usgDate1",
      "usgDate2",
      "usgDate3",
      "prenatalStartDate",
      "postpartumStartDate"
    ]);
    const safePayload = isDoctor(req.user)
      ? Object.fromEntries(Object.entries(payload || {}).filter(([k]) => doctorAllowed.has(k)))
      : payload;
    const next = {
      ...current,
      ...safePayload,
      teamId: current.teamId,
      motherName: safePayload?.motherName !== undefined
        ? String(safePayload.motherName || "").trim()
        : String(current.motherName || ""),
      phoneAlt: safePayload?.phoneAlt !== undefined
        ? String(safePayload.phoneAlt || "").trim()
        : String(current.phoneAlt || ""),
      cpf: safePayload?.cpf !== undefined
        ? String(safePayload.cpf || "").trim()
        : String(current.cpf || ""),
      cns: safePayload?.cns !== undefined
        ? String(safePayload.cns || "").trim()
        : String(current.cns || ""),
      cnsCpf: safePayload?.cnsCpf !== undefined
        ? String(safePayload.cnsCpf || "").trim()
        : (safePayload?.cpf !== undefined
          ? String(safePayload.cpf || "").trim()
          : String(current.cnsCpf || current.cpf || current.cns || "")),
      careCategory: safePayload?.careCategory ? normalizeCategory(safePayload.careCategory, protocolMap) : current.careCategory,
      chronicConditions: safePayload?.chronicConditions !== undefined
        ? normalizeChronicConditions(safePayload.chronicConditions)
        : normalizeChronicConditions(current.chronicConditions),
      maritalStatus: safePayload?.maritalStatus !== undefined
        ? String(safePayload.maritalStatus || "").trim().toLowerCase()
        : String(current.maritalStatus || ""),
      sexAtBirth: safePayload?.sexAtBirth !== undefined
        ? String(safePayload.sexAtBirth || "").trim().toLowerCase()
        : String(current.sexAtBirth || ""),
      genderIdentity: safePayload?.genderIdentity !== undefined
        ? String(safePayload.genderIdentity || "").trim().toLowerCase()
        : String(current.genderIdentity || ""),
      gestationalAgeDumWeeks: safePayload?.gestationalAgeDumWeeks !== undefined
        ? (Number.isFinite(Number(safePayload.gestationalAgeDumWeeks))
          ? Math.max(0, Math.min(45, Number(safePayload.gestationalAgeDumWeeks)))
          : "")
        : (Number.isFinite(Number(current.gestationalAgeDumWeeks)) ? Number(current.gestationalAgeDumWeeks) : ""),
      gestationalAgeUsgWeeks: safePayload?.gestationalAgeUsgWeeks !== undefined
        ? (Number.isFinite(Number(safePayload.gestationalAgeUsgWeeks))
          ? Math.max(0, Math.min(45, Number(safePayload.gestationalAgeUsgWeeks)))
          : "")
        : (Number.isFinite(Number(current.gestationalAgeUsgWeeks)) ? Number(current.gestationalAgeUsgWeeks) : ""),
      usgDate1: safePayload?.usgDate1 !== undefined
        ? String(safePayload.usgDate1 || "").trim()
        : String(current.usgDate1 || ""),
      usgDate2: safePayload?.usgDate2 !== undefined
        ? String(safePayload.usgDate2 || "").trim()
        : String(current.usgDate2 || ""),
      usgDate3: safePayload?.usgDate3 !== undefined
        ? String(safePayload.usgDate3 || "").trim()
        : String(current.usgDate3 || ""),
      id,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id
    };

    db.patients[index] = next;
    addAuditLog(db, req.user, "patient.updated", "patient", id, {
      changedFields: Object.keys(safePayload || {})
    });

    return next;
  });

  if (!updated) {
    return res.status(404).json({ error: "Paciente não encontrado" });
  }

  return res.json(updated);
});

app.delete("/patients/:id", requireManagerOrDoctor, async (req, res) => {
  const { id } = req.params;

  const result = await withDb((db) => {
    ensureDbShape(db);
    const patientIndex = db.patients.findIndex((p) => p.id === id && p.teamId === req.user.teamId);
    if (patientIndex < 0) return { error: "Paciente não encontrado" };

    const patient = db.patients[patientIndex];
    const teamPatientIds = new Set([patient.id]);

    const appointmentsBefore = db.appointments.length;
    db.appointments = db.appointments.filter((a) => !teamPatientIds.has(a.patientId));
    const appointmentsRemoved = appointmentsBefore - db.appointments.length;

    const tasksBefore = db.tasks.length;
    db.tasks = db.tasks.filter((t) => !teamPatientIds.has(t.patientId));
    const tasksRemoved = tasksBefore - db.tasks.length;

    const messagesBefore = db.messages.length;
    db.messages = db.messages.filter((m) => !teamPatientIds.has(m.patientId));
    const messagesRemoved = messagesBefore - db.messages.length;

    const recordsBefore = db.clinicalRecords.length;
    db.clinicalRecords = db.clinicalRecords.filter((r) => !teamPatientIds.has(r.patientId));
    const recordsRemoved = recordsBefore - db.clinicalRecords.length;

    db.patients.splice(patientIndex, 1);

    addAuditLog(db, req.user, "patient.deleted", "patient", id, {
      name: patient.name,
      appointmentsRemoved,
      tasksRemoved,
      messagesRemoved,
      recordsRemoved
    });

    return {
      ok: true,
      removed: {
        appointments: appointmentsRemoved,
        tasks: tasksRemoved,
        messages: messagesRemoved,
        clinicalRecords: recordsRemoved
      }
    };
  });

  if (result?.error) return res.status(404).json({ error: result.error });
  return res.json(result);
});

app.get("/patients/:id/appointments", async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  ensureDbShape(db);

  const lookup = getPatientOrError(db, req.user, id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  const appointments = db.appointments
    .filter((a) => a.patientId === id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((a) => ({
      ...a,
      demandType: normalizeDemandType(a.demandType)
    }));

  return res.json(appointments);
});

app.post("/patients/:id/appointments", async (req, res) => {
  const { id } = req.params;
  const payload = req.body;

  if (!(isManager(req.user) || isDoctor(req.user))) {
    return res.status(403).json({ error: "Sem permissão para criar atendimento" });
  }

  if (!payload.date || !payload.summary) {
    return res.status(400).json({ error: "Data e resumo são obrigatórios" });
  }

  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  const appointment = {
    id: uuidv4(),
    patientId: id,
    date: String(payload.date),
    summary: String(payload.summary),
    demandType: normalizeDemandType(payload.demandType),
    conduct: payload.conduct ? String(payload.conduct) : "",
    nextStep: payload.nextStep ? String(payload.nextStep) : "",
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };

  withDb((mutableDb) => {
    ensureDbShape(mutableDb);
    mutableDb.appointments.push(appointment);
    addAuditLog(mutableDb, req.user, "appointment.created", "appointment", appointment.id, {
      patientId: id
    });
  });

  return res.status(201).json(appointment);
});

app.post("/patients/:id/records", async (req, res) => {
  const { id } = req.params;
  const payload = req.body;

  if (!payload.type || !payload.date || !payload.title) {
    return res.status(400).json({ error: "type, date e title são obrigatórios" });
  }

  const allowedTypes = ["visit", "consultation", "vaccine", "procedure", "note"];
  const type = String(payload.type);

  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ error: "Tipo de registro inválido" });
  }

  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  if (isAcs(req.user) && type !== "visit") {
    return res.status(403).json({ error: "ACS pode registrar apenas visita domiciliar" });
  }
  if (isAcs(req.user)) {
    const normalizedTitle = String(payload.title || "").trim().toLowerCase();
    if (normalizedTitle !== "visita acs") {
      return res.status(400).json({ error: "ACS deve registrar o título padrão 'Visita ACS'" });
    }
  }

  if (isDoctor(req.user) && ["visit"].includes(type)) {
    return res.status(403).json({ error: "Médica não registra visita domiciliar" });
  }

  const record = {
    id: uuidv4(),
    patientId: id,
    type,
    title: String(payload.title),
    details: payload.details ? String(payload.details) : "",
    date: String(payload.date),
    protocolTag: payload.protocolTag
      ? normalizeCategory(String(payload.protocolTag), getProtocolTemplateMap(db, req.user.teamId))
      : normalizeCategory(lookup.patient.careCategory, getProtocolTemplateMap(db, req.user.teamId)),
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };

  withDb((mutableDb) => {
    ensureDbShape(mutableDb);
    mutableDb.clinicalRecords.push(record);
    addAuditLog(mutableDb, req.user, "clinical_record.created", "clinical_record", record.id, {
      patientId: id,
      type: record.type,
      protocolTag: record.protocolTag
    });
  });

  return res.status(201).json(record);
});

app.get("/patients/:id/history", async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  ensureDbShape(db);

  const lookup = getPatientOrError(db, req.user, id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  return res.json(buildPatientHistory(db, id));
});

app.get("/patients/:id/protocol-summary", async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  ensureDbShape(db);

  const lookup = getPatientOrError(db, req.user, id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  const history = buildPatientHistory(db, id);
  return res.json(buildProtocolSummary(lookup.patient, history, getProtocolTemplateMap(db, req.user.teamId)));
});

app.get("/metrics/demand/monthly", async (req, res) => {
  if (!(isManager(req.user) || isDoctor(req.user))) {
    return res.status(403).json({ error: "Apenas enfermeira e médica podem acessar este indicador" });
  }
  const db = await readDb();
  ensureDbShape(db);
  const month = String(req.query.month || "").trim();
  const metric = buildMonthlyDemandMetric(db, req.user.teamId, month);
  if (!metric) {
    return res.status(400).json({ error: "Parâmetro month inválido. Use YYYY-MM." });
  }
  return res.json(metric);
});

app.get("/tasks", async (req, res) => {
  const { patientId, assigneeId } = req.query;
  const db = await readDb();
  ensureDbShape(db);

  const allowedPatientIds = new Set(getAllowedPatients(db, req.user, {}).map((p) => p.id));

  const filtered = db.tasks.filter((t) => {
    if (!allowedPatientIds.has(t.patientId)) return false;
    if (patientId && t.patientId !== patientId) return false;
    if (assigneeId && t.assigneeId !== assigneeId) return false;
    return true;
  });

  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json(filtered);
});

app.post("/tasks", requireManagerOrDoctor, async (req, res) => {
  const payload = req.body;

  if (!payload.patientId || !payload.assigneeId || !payload.title) {
    return res.status(400).json({ error: "patientId, assigneeId e title são obrigatórios" });
  }

  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, String(payload.patientId));
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  const assignee = db.users.find((u) => u.id === String(payload.assigneeId));
  if (!assignee || canonicalRole(assignee.role) !== "acs" || assignee.teamId !== req.user.teamId) {
    return res.status(400).json({ error: "Responsável deve ser ACS da mesma equipe" });
  }

  const task = {
    id: uuidv4(),
    patientId: String(payload.patientId),
    assigneeId: String(payload.assigneeId),
    title: String(payload.title),
    notes: payload.notes ? String(payload.notes) : "",
    status: payload.status ? String(payload.status) : "pending",
    dueDate: payload.dueDate ? String(payload.dueDate) : "",
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  withDb((mutableDb) => {
    ensureDbShape(mutableDb);
    mutableDb.tasks.push(task);
    addAuditLog(mutableDb, req.user, "task.created", "task", task.id, {
      patientId: task.patientId,
      assigneeId: task.assigneeId
    });
  });

  return res.status(201).json(task);
});

app.patch("/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const payload = req.body;

  const updated = await withDb((db) => {
    ensureDbShape(db);
    const index = db.tasks.findIndex((t) => t.id === id);
    if (index < 0) return null;

    const current = db.tasks[index];
    const patient = db.patients.find((p) => p.id === current.patientId);
    if (!patient || !canAccessPatient(req.user, patient)) return "forbidden";

    if (isAcs(req.user)) {
      return "forbidden";
    }

    if (isManager(req.user) || isDoctor(req.user)) {
      const nextForManager = {
        ...current,
        ...payload,
        id,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.id
      };

      db.tasks[index] = nextForManager;
      addAuditLog(db, req.user, "task.updated", "task", id, {
        changedFields: Object.keys(payload)
      });
      return nextForManager;
    }

    return "forbidden";
  });

  if (updated === "forbidden") {
    return res.status(403).json({ error: "Sem permissão para atualizar esta tarefa" });
  }

  if (!updated) {
    return res.status(404).json({ error: "Tarefa não encontrada" });
  }

  return res.json(updated);
});

app.get("/patients/:id/messages", async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  ensureDbShape(db);

  const lookup = getPatientOrError(db, req.user, id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  const messages = db.messages
    .filter((m) => m.patientId === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return res.json(messages);
});

app.post("/patients/:id/messages", async (req, res) => {
  const { id } = req.params;
  const payload = req.body;

  if (isAcs(req.user)) {
    return res.status(403).json({ error: "ACS não pode enviar mensagens neste módulo" });
  }

  if (!payload.text) {
    return res.status(400).json({ error: "text ? obrigatório" });
  }

  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  const message = {
    id: uuidv4(),
    patientId: id,
    authorId: req.user.id,
    authorName: req.user.name,
    text: String(payload.text),
    createdAt: new Date().toISOString()
  };

  withDb((mutableDb) => {
    ensureDbShape(mutableDb);
    mutableDb.messages.push(message);
    addAuditLog(mutableDb, req.user, "message.created", "message", message.id, {
      patientId: id
    });
  });

  return res.status(201).json(message);
});

app.get("/audit-logs", requireManagerOrDoctor, async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);

  const patientId = req.query.patientId ? String(req.query.patientId) : "";

  const logs = db.auditLogs
    .filter((log) => {
      if (!patientId) return true;
      if (log.entity === "patient" && log.entityId === patientId) return true;
      if (log.details && log.details.patientId === patientId) return true;
      return false;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return res.json(logs.slice(0, 200));
});

app.get("/privacy/requests", requireManager, async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const status = String(req.query.status || "").trim();
  const type = String(req.query.type || "").trim();
  const patientId = String(req.query.patientId || "").trim();

  const items = db.privacyRequests
    .filter((item) => item.teamId === req.user.teamId)
    .filter((item) => !status || item.status === status)
    .filter((item) => !type || item.type === type)
    .filter((item) => !patientId || item.patientId === patientId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return res.json(items.slice(0, 300));
});

app.post("/privacy/requests", requireManager, async (req, res) => {
  const payload = req.body || {};
  const patientId = String(payload.patientId || "").trim();
  const type = String(payload.type || "").trim().toLowerCase();
  const notes = String(payload.notes || "").trim();
  const correctionData = payload.correctionData && typeof payload.correctionData === "object"
    ? payload.correctionData
    : {};

  if (!patientId || !PRIVACY_REQUEST_TYPES.has(type)) {
    return res.status(400).json({ error: "patientId e type (access|correction|deletion) são obrigatórios" });
  }

  if (type === "correction" && !Object.keys(correctionData).length) {
    return res.status(400).json({ error: "correctionData ? obrigatório para solicitação de correção" });
  }

  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, patientId);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  const created = await withDb((mutableDb) => {
    ensureDbShape(mutableDb);
    const requestItem = {
      id: uuidv4(),
      teamId: req.user.teamId,
      patientId,
      type,
      status: "pending",
      notes,
      correctionData: type === "correction" ? correctionData : {},
      createdBy: req.user.id,
      createdByName: req.user.name,
      createdAt: new Date().toISOString(),
      decidedAt: "",
      decidedBy: "",
      completedAt: "",
      result: {}
    };
    mutableDb.privacyRequests.push(requestItem);
    addAuditLog(mutableDb, req.user, "privacy.request_created", "privacy_request", requestItem.id, {
      patientId,
      type
    });
    return requestItem;
  });

  return res.status(201).json(created);
});

app.patch("/privacy/requests/:id", requireManager, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const payload = req.body || {};
  const nextStatus = payload.status !== undefined ? String(payload.status || "").trim().toLowerCase() : "";
  const notes = payload.notes !== undefined ? String(payload.notes || "").trim() : undefined;
  const correctionData = payload.correctionData && typeof payload.correctionData === "object"
    ? payload.correctionData
    : undefined;

  const result = await withDb((db) => {
    ensureDbShape(db);
    const index = db.privacyRequests.findIndex((item) => item.id === id && item.teamId === req.user.teamId);
    if (index < 0) return null;
    const current = db.privacyRequests[index];
    const next = { ...current };

    if (nextStatus) {
      if (!PRIVACY_REQUEST_STATUS.has(nextStatus)) {
        return "invalid_status";
      }
      if (nextStatus === "completed") {
        return "manual_completed_not_allowed";
      }
      next.status = nextStatus;
      next.decidedAt = new Date().toISOString();
      next.decidedBy = req.user.id;
    }

    if (notes !== undefined) next.notes = notes;
    if (correctionData !== undefined && next.type === "correction") next.correctionData = correctionData;

    next.updatedAt = new Date().toISOString();
    next.updatedBy = req.user.id;
    db.privacyRequests[index] = next;

    addAuditLog(db, req.user, "privacy.request_updated", "privacy_request", id, {
      changedFields: Object.keys(payload || {})
    });

    return next;
  });

  if (result === "invalid_status") return res.status(400).json({ error: "status inválido" });
  if (result === "manual_completed_not_allowed") return res.status(400).json({ error: "Use /privacy/requests/:id/execute para concluir a solicitação" });
  if (!result) return res.status(404).json({ error: "Solicitação não encontrada" });
  return res.json(result);
});

app.post("/privacy/requests/:id/execute", requireManager, async (req, res) => {
  const id = String(req.params.id || "").trim();
  const payload = req.body || {};

  const outcome = await withDb((db) => {
    ensureDbShape(db);
    const reqIndex = db.privacyRequests.findIndex((item) => item.id === id && item.teamId === req.user.teamId);
    if (reqIndex < 0) return { error: { status: 404, message: "Solicitação não encontrada" } };

    const requestItem = db.privacyRequests[reqIndex];
    if (requestItem.status === "completed") {
      return { error: { status: 409, message: "Solicitação j? conclu?da" } };
    }
    if (requestItem.status === "rejected") {
      return { error: { status: 409, message: "Solicitação rejeitada. Não pode ser executada." } };
    }

    const patient = db.patients.find((p) => p.id === requestItem.patientId && p.teamId === req.user.teamId);
    if (!patient) return { error: { status: 404, message: "Paciente da solicitação não encontrado" } };

    let result = {};
    if (requestItem.type === "access") {
      const report = buildPatientAccessReport(db, patient);
      result = {
        reportSummary: report.summary,
        generatedAt: report.generatedAt
      };
      requestItem.result = result;
      requestItem.status = "completed";
      requestItem.completedAt = new Date().toISOString();
      requestItem.decidedAt = new Date().toISOString();
      requestItem.decidedBy = req.user.id;
      requestItem.executedBy = req.user.id;

      addAuditLog(db, req.user, "privacy.request_executed_access", "privacy_request", requestItem.id, {
        patientId: patient.id
      });
      db.privacyRequests[reqIndex] = requestItem;
      return { request: requestItem, report };
    }

    if (requestItem.type === "correction") {
      const data = payload.correctionData && typeof payload.correctionData === "object"
        ? payload.correctionData
        : requestItem.correctionData || {};
      const correction = applyPatientCorrection(db, req.user, patient, data);
      const patientIndex = db.patients.findIndex((p) => p.id === patient.id);
      if (patientIndex >= 0) db.patients[patientIndex] = correction.next;

      result = { changedFields: correction.changedFields };
      requestItem.result = result;
      requestItem.status = "completed";
      requestItem.completedAt = new Date().toISOString();
      requestItem.decidedAt = new Date().toISOString();
      requestItem.decidedBy = req.user.id;
      requestItem.executedBy = req.user.id;
      db.privacyRequests[reqIndex] = requestItem;

      addAuditLog(db, req.user, "privacy.request_executed_correction", "privacy_request", requestItem.id, {
        patientId: patient.id,
        changedFields: correction.changedFields
      });
      return { request: requestItem, patient: correction.next };
    }

    if (requestItem.type === "deletion") {
      if (isAnonymizedPatient(patient)) {
        return { error: { status: 409, message: "Paciente já anonimizado anteriormente" } };
      }
      const reason = String(payload.reason || requestItem.notes || "").trim();
      const anonymize = anonymizePatientBundle(db, req.user, patient, reason, requestItem.id);

      result = { anonymized: anonymize.changed, stats: anonymize.stats };
      requestItem.result = result;
      requestItem.status = "completed";
      requestItem.completedAt = new Date().toISOString();
      requestItem.decidedAt = new Date().toISOString();
      requestItem.decidedBy = req.user.id;
      requestItem.executedBy = req.user.id;
      db.privacyRequests[reqIndex] = requestItem;

      addAuditLog(db, req.user, "privacy.request_executed_deletion", "privacy_request", requestItem.id, {
        patientId: patient.id,
        stats: anonymize.stats
      });
      return { request: requestItem };
    }

    return { error: { status: 400, message: "Tipo de solicitação não suportado" } };
  });

  if (outcome.error) return res.status(outcome.error.status).json({ error: outcome.error.message });
  return res.json(outcome);
});

app.post("/privacy/retention/anonymize", requireManager, async (req, res) => {
  const payload = req.body || {};
  const olderThanDays = Number(payload.olderThanDays || 365 * 5);
  const dryRun = Boolean(payload.dryRun);

  if (!Number.isFinite(olderThanDays) || olderThanDays < 30) {
    return res.status(400).json({ error: "olderThanDays deve ser número >= 30" });
  }

  const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
  const cutoffIso = new Date(cutoff).toISOString();

  const result = await withDb((db) => {
    ensureDbShape(db);
    const candidates = db.patients.filter((patient) => {
      if (patient.teamId !== req.user.teamId) return false;
      if (isAnonymizedPatient(patient)) return false;
      const activity = getPatientActivityDate(db, patient.id) || patient.updatedAt || patient.createdAt;
      if (!activity) return false;
      return String(activity) < cutoffIso;
    });

    const sample = candidates.slice(0, 20).map((p) => ({
      id: p.id,
      name: p.name,
      lastActivityAt: getPatientActivityDate(db, p.id) || p.updatedAt || p.createdAt
    }));

    if (dryRun) {
      return {
        dryRun: true,
        cutoffIso,
        candidateCount: candidates.length,
        sample
      };
    }

    let anonymizedCount = 0;
    const stats = {
      appointments: 0,
      clinicalRecords: 0,
      messages: 0,
      tasks: 0
    };

    for (const patient of candidates) {
      const output = anonymizePatientBundle(
        db,
        req.user,
        patient,
        `Retenção automática: sem atividade desde antes de ${cutoffIso}`,
        ""
      );
      if (!output.changed) continue;
      anonymizedCount += 1;
      stats.appointments += output.stats.appointments || 0;
      stats.clinicalRecords += output.stats.clinicalRecords || 0;
      stats.messages += output.stats.messages || 0;
      stats.tasks += output.stats.tasks || 0;
    }

    addAuditLog(db, req.user, "privacy.retention_anonymize_run", "privacy_retention", req.user.teamId, {
      cutoffIso,
      olderThanDays,
      candidates: candidates.length,
      anonymizedCount,
      stats
    });

    return {
      dryRun: false,
      cutoffIso,
      candidateCount: candidates.length,
      anonymizedCount,
      stats,
      sample
    };
  });

  return res.json(result);
});


app.get("/ai/status", requireAuth, (_req, res) => {
  const provider = String(process.env.AI_PROVIDER || "local").trim().toLowerCase();
  return res.json({
    provider,
    mode: provider === "openai" ? "online" : "local-heuristico",
    features: [
      "patient-summary",
      "protocol-highlights",
      "daily-priorities",
      "evolution-draft",
      "acs-message",
      "data-quality",
      "chat",
      "team-report",
      "category-suggestion",
      "transcription-structuring"
    ]
  });
});

app.post("/ai/patients/:id/summary", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, req.params.id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });
  const context = buildAiPatientContext(db, req.user, lookup.patient);
  return res.json(patientSummary(context));
});

app.post("/ai/patients/:id/protocol-highlights", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, req.params.id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });
  const context = buildAiPatientContext(db, req.user, lookup.patient);
  return res.json(protocolHighlights(context));
});

app.post("/ai/patients/:id/evolution-draft", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, req.params.id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });
  const context = buildAiPatientContext(db, req.user, lookup.patient);
  return res.json(evolutionDraft(context, req.body || {}));
});

app.post("/ai/patients/:id/acs-message", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, req.params.id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });
  const context = buildAiPatientContext(db, req.user, lookup.patient);
  return res.json(acsMessage(context));
});

app.post("/ai/patients/:id/suggest-category", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, req.params.id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });
  const context = buildAiPatientContext(db, req.user, lookup.patient);
  return res.json(suggestProtocolCategory(context));
});

app.post("/ai/patients/:id/transcribe", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, req.params.id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });
  return res.json(transcribePayload(req.body || {}));
});

app.post("/ai/team/priorities", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const contexts = buildAiTeamContexts(db, req.user);
  return res.json({ items: teamPriorities(contexts) });
});

app.post("/ai/team/data-quality", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const contexts = buildAiTeamContexts(db, req.user);
  return res.json({ findings: dataQualityChecks(contexts) });
});

app.post("/ai/team/report", async (req, res) => {
  if (!isManager(req.user)) {
    return res.status(403).json({ error: "Somente enfermeira pode gerar relat?rio executivo" });
  }
  const db = await readDb();
  ensureDbShape(db);
  const contexts = buildAiTeamContexts(db, req.user);
  return res.json(teamReport(contexts));
});

app.post("/ai/chat", async (req, res) => {
  const question = String(req.body?.question || "").trim();
  const db = await readDb();
  ensureDbShape(db);
  const contexts = buildAiTeamContexts(db, req.user);
  return res.json(chatAnswer(question, contexts));
});

app.use((err, _req, res, _next) => {
  if (String(err?.message || "").includes("CORS")) {
    return res.status(403).json({ error: "Origem bloqueada por política de segurança" });
  }
  return res.status(500).json({ error: "Erro interno do servidor" });
});

async function startServer() {
  try {
    await migrateLegacyPlaintextPasswords();
    app.listen(PORT, () => {
      console.log(`API rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Falha ao inicializar API com seguranca de credenciais:", error);
    process.exit(1);
  }
}

startServer();






