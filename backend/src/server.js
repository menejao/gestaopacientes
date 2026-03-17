import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { readDb, withDb } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "troque-esta-chave-em-producao";

const DEFAULT_CARE_PROTOCOLS = {
  general: {
    category: "general",
    label: "Geral",
    targets: { visits: 2, consultations: 2, vaccines: 1 },
    vaccines: ["Influenza"]
  },
  pregnant: {
    category: "pregnant",
    label: "Gestante",
    targets: { visits: 6, consultations: 7, vaccines: 3 },
    vaccines: ["dTpa", "Hepatite B", "Influenza"]
  },
  puerperal: {
    category: "puerperal",
    label: "Puerpera",
    targets: { visits: 2, consultations: 2, vaccines: 1 },
    vaccines: ["dTpa"]
  },
  pap_only: {
    category: "pap_only",
    label: "Somente Papanicolau",
    targets: { visits: 1, consultations: 1, vaccines: 0 },
    vaccines: []
  },
  child_followup: {
    category: "child_followup",
    label: "Puericultura",
    targets: { visits: 4, consultations: 6, vaccines: 6 },
    vaccines: ["BCG", "Pentavalente", "Polio", "Rotavirus", "Pneumococica", "Meningococica"]
  },
  chronic: {
    category: "chronic",
    label: "Condicao Cronica",
    targets: { visits: 3, consultations: 3, vaccines: 2 },
    vaccines: ["Influenza", "COVID-19"]
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
      reference: "https://www.inca.gov.br/controle-do-cancer-do-colo-do-utero/acoes-de-controle/rastreamento",
      version: "Rastreamento vigente"
    },
    child_followup: {
      reference: "https://www.gov.br/saude/pt-br/vacinacao/calendario",
      version: "Calendario PNI"
    },
    chronic: {
      reference: "https://bvsms.saude.gov.br/bvs/publicacoes/plano_acoes_estrategicas_enfrentamento_dc_nt_2021_2030.pdf",
      version: "DCNT 2021-2030"
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
    vaccines: Array.isArray(template.vaccines) ? template.vaccines : [],
    authority: "Ministerio da Saude",
    reference: ministryRefs[template.category]?.reference || "",
    version: ministryRefs[template.category]?.version || "1.0"
  }));
}

const ALLOWED_SELF_REGISTER_ROLES = ["acs", "doctor", "nurse_manager"];
const VALID_UF = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
]);

app.use(cors());
app.use(express.json());

function canonicalRole(role) {
  const input = String(role || "").trim().toLowerCase();
  if (input === "nurse") return "nurse_manager";
  if (input === "medica") return "doctor";
  if (input === "enfermeiro") return "nurse_manager";
  return input;
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

  if (!db.protocolTemplates.length) {
    db.protocolTemplates = buildDefaultProtocolTemplates();
  } else {
    const defaultsByCategory = Object.fromEntries(buildDefaultProtocolTemplates().map((t) => [t.category, t]));
    db.protocolTemplates = db.protocolTemplates.map((t) => ({
      ...t,
      authority: String(t.authority || "Ministerio da Saude"),
      reference: String(t.reference || defaultsByCategory[t.category]?.reference || ""),
      version: String(t.version || defaultsByCategory[t.category]?.version || "1.0")
    }));
  }
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
      password: demoPassword,
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
    return res.status(401).json({ error: "Token invalido ou expirado" });
  }
}

function requireManager(req, res, next) {
  if (!isManager(req.user)) {
    return res.status(403).json({ error: "Somente enfermeira gestora pode executar esta acao" });
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

function getProtocolTemplateMap(db, teamId = "") {
  ensureDbShape(db);
  const map = {};
  db.protocolTemplates
    .filter((t) => !teamId || !t.teamId || t.teamId === teamId)
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
    return { ok: false, message: "Numero do conselho invalido (digitos repetidos)" };
  }

  if (isSequentialDigits(numberDigits)) {
    return { ok: false, message: "Numero do conselho invalido (sequencia numerica)" };
  }

  if (!VALID_UF.has(uf)) {
    return { ok: false, message: "UF do conselho invalida" };
  }

  return { ok: true, councilNumber: numberDigits, councilUf: uf };
}

function getCouncilIntegrationConfig() {
  const mode = String(process.env.COUNCIL_VERIFY_MODE || "optional").trim().toLowerCase();
  const url = String(process.env.COUNCIL_VERIFY_URL || "").trim();
  const token = String(process.env.COUNCIL_VERIFY_TOKEN || "").trim();
  const timeoutMs = Number(process.env.COUNCIL_VERIFY_TIMEOUT_MS || 7000);
  const provider = String(process.env.COUNCIL_VERIFY_PROVIDER || "generic").trim().toLowerCase();

  return {
    mode: ["off", "optional", "required"].includes(mode) ? mode : "optional",
    provider: ["generic", "n8n", "make"].includes(provider) ? provider : "generic",
    url,
    token,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 1000 ? timeoutMs : 7000
  };
}

function normalizeProviderResponse(provider, data) {
  if (provider === "n8n") {
    const base = Array.isArray(data) ? (data[0] || {}) : data;
    const valid = base.valid === true || base.approved === true || base.status === "approved";
    return {
      valid,
      provider: base.provider || "n8n",
      error: base.error || (valid ? "" : "Conselho nao aprovado no n8n"),
      details: base
    };
  }

  if (provider === "make") {
    const base = data?.result || data;
    const valid = base.valid === true || base.is_valid === true || base.outcome === "approved";
    return {
      valid,
      provider: base.provider || "make",
      error: base.error || (valid ? "" : "Conselho nao aprovado no Make"),
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
        error: "Integracao externa de conselho nao configurada"
      };
    }

    return {
      checked: false,
      valid: true,
      provider: "missing-url",
      status: "skipped"
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json"
    };

    if (config.token) {
      headers.Authorization = `Bearer ${config.token}`;
    }

    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    const normalized = normalizeProviderResponse(config.provider, data);

    if (!response.ok) {
      if (config.mode === "required") {
        return {
          checked: true,
          valid: false,
          provider: normalized.provider,
          status: "error",
          error: normalized.error || "Falha ao validar conselho no provedor externo"
        };
      }

      return {
        checked: true,
        valid: true,
        provider: data.provider || "external-http",
        status: "fallback"
      };
    }

    return {
      checked: true,
      valid: normalized.valid,
      provider: normalized.provider,
      status: normalized.valid ? "verified" : "rejected",
      details: normalized.details
    };
  } catch (_error) {
    if (config.mode === "required") {
      return {
        checked: true,
        valid: false,
        provider: "external-http",
        status: "error",
        error: "Integracao de validacao de conselho indisponivel"
      };
    }

    return {
      checked: true,
      valid: true,
      provider: "external-http",
      status: "fallback"
    };
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeProtocolTemplatePayload(payload, fallbackCategory = "") {
  const rawCategory = String(payload.category || fallbackCategory || "").trim().toLowerCase();
  const category = rawCategory.replace(/[^a-z0-9_]/g, "_");
  const label = String(payload.label || "").trim();
  const targets = payload.targets && typeof payload.targets === "object" ? payload.targets : {};
  const visits = Number(targets.visits);
  const consultations = Number(targets.consultations);
  const vaccinesTarget = Number(targets.vaccines);
  const vaccines = Array.isArray(payload.vaccines) ? payload.vaccines : String(payload.vaccines || "").split(",");
  const authority = String(payload.authority || "Ministerio da Saude").trim();
  const reference = String(payload.reference || "").trim();
  const version = String(payload.version || "").trim();

  const cleanVaccines = [...new Set(vaccines
    .map((v) => String(v || "").trim())
    .filter(Boolean))];

  if (!category || category.length < 2) {
    return { ok: false, error: "category invalida (use letras, numeros e _)" };
  }

  if (!label) {
    return { ok: false, error: "label e obrigatorio" };
  }

  const numbers = [
    ["visits", visits],
    ["consultations", consultations],
    ["vaccines", vaccinesTarget]
  ];

  for (const [key, value] of numbers) {
    if (!Number.isFinite(value) || value < 0 || value > 99) {
      return { ok: false, error: `targets.${key} deve ser numero entre 0 e 99` };
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
  if (!patient) return { error: { status: 404, message: "Paciente nao encontrado" } };
  if (!canAccessPatient(user, patient)) {
    return { error: { status: 403, message: "Sem permissao para este paciente" } };
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
      metadata: {}
    }));

  const clinicalEvents = db.clinicalRecords
    .filter((r) => r.patientId === patientId)
    .map((r) => ({ ...r, source: "clinicalRecord" }));

  return [...appointmentEvents, ...clinicalEvents].sort((a, b) => b.date.localeCompare(a.date));
}

function buildProtocolSummary(patient, history, templateMap) {
  const normalizedCategory = normalizeCategory(patient.careCategory, templateMap);
  const template = templateMap[normalizedCategory] || templateMap.general;

  const completed = {
    visits: history.filter((h) => h.type === "visit").length,
    consultations: history.filter((h) => h.type === "consultation").length,
    vaccines: history.filter((h) => h.type === "vaccine").length
  };

  const appliedVaccineNames = history
    .filter((h) => h.type === "vaccine")
    .map((h) => h.metadata?.vaccineName || h.title || "")
    .filter(Boolean);

  const recommendedVaccines = template.vaccines.map((name) => ({
    name,
    done: appliedVaccineNames.includes(name)
  }));

  return {
    category: template.category,
    categoryLabel: template.label,
    targets: template.targets,
    completed,
    pending: {
      visits: Math.max(template.targets.visits - completed.visits, 0),
      consultations: Math.max(template.targets.consultations - completed.consultations, 0),
      vaccines: Math.max(template.targets.vaccines - completed.vaccines, 0)
    },
    vaccines: {
      recommended: recommendedVaccines,
      appliedNames: [...new Set(appliedVaccineNames)]
    }
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/protocol/templates", requireAuth, async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  res.json(db.protocolTemplates.filter((t) => !t.teamId || t.teamId === req.user.teamId));
});

app.get("/teams/public", async (_req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  res.json(db.teams.map((t) => ({ id: t.id, name: t.name })));
});

app.get("/integrations/council/status", (_req, res) => {
  const config = getCouncilIntegrationConfig();
  return res.json({
    mode: config.mode,
    provider: config.provider,
    configured: Boolean(config.url),
    timeoutMs: config.timeoutMs
  });
});

app.post("/auth/register", async (req, res) => {
  const payload = req.body;
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const role = canonicalRole(payload.role);
  const councilType = councilTypeForRole(role);

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password e role sao obrigatorios" });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Senha fraca: minimo 8 caracteres, 1 letra maiuscula, 1 numero e 1 caractere especial" });
  }

  if (!ALLOWED_SELF_REGISTER_ROLES.includes(role) || role !== "nurse_manager") {
    return res.status(400).json({ error: "Cadastro publico permitido apenas para enfermeira gestora" });
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
      error: externalCheck.error || "Conselho nao validado no provedor externo"
    });
  }

  const result = await withDb((db) => {
    ensureDbShape(db);

    if (db.users.some((u) => String(u.email).toLowerCase() === email)) {
      return { error: "Email ja cadastrado" };
    }

    let teamId = String(payload.teamId || "").trim();

    if (role === "nurse_manager") {
      const teamNameInput = String(payload.teamName || "").trim();
      const teamName = teamNameInput || `Equipe ${name}`;
      const team = {
        id: uuidv4(),
        name: teamName,
        managerUserId: "",
        createdAt: new Date().toISOString()
      };
      db.teams.push(team);
      teamId = team.id;
    } else {
      if (!teamId) {
        return { error: "teamId e obrigatorio para ACS e Medica" };
      }

      const teamExists = db.teams.some((t) => t.id === teamId);
      if (!teamExists) {
        return { error: "Equipe informada nao existe" };
      }
    }

    const duplicatedCouncil = roleNeedsCouncil(role) && db.users.some((u) => {
      const uRole = canonicalRole(u.role);
      return roleNeedsCouncil(uRole)
        && String(u.councilType || "").toUpperCase() === councilType
        && String(u.councilNumber || "") === councilValidation.councilNumber
        && String(u.councilUf || "").toUpperCase() === councilValidation.councilUf;
    });

    if (duplicatedCouncil) {
      return { error: `${councilType} ja cadastrado para outro usuario` };
    }

    const user = {
      id: uuidv4(),
      name,
      role,
      email,
      password,
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

    if (role === "nurse_manager") {
      const team = db.teams.find((t) => t.id === teamId);
      if (team) {
        team.managerUserId = user.id;
      }
    }

    return { user, db };
  });

  if (result.error) {
    return res.status(409).json({ error: result.error });
  }

  const safeUser = sanitizeUser(result.user, result.db);
  const token = createToken(result.user, result.db);
  return res.status(201).json({ user: safeUser, token });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  let db = await readDb();
  ensureDbShape(db);

  let user = db.users.find(
    (u) => String(u.email).toLowerCase() === String(email).trim().toLowerCase() && u.password === String(password)
  );

  if (!user) {
    const recovered = await ensureDemoManagerIfNeeded(email, password);
    if (recovered?.user) {
      user = recovered.user;
      db = recovered.db;
    }
  }

  if (!user) {
    return res.status(401).json({ error: "Credenciais invalidas" });
  }

  const safeUser = sanitizeUser(user, db);
  const token = createToken(user, db);
  return res.json({ user: safeUser, token });
});

app.use(requireAuth);

app.get("/me", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "Usuario nao encontrado" });
  return res.json(sanitizeUser(user, db));
});

app.patch("/me", async (req, res) => {
  const payload = req.body || {};

  const result = await withDb(async (db) => {
    ensureDbShape(db);
    const index = db.users.findIndex((u) => u.id === req.user.id);
    if (index < 0) return { error: { status: 404, message: "Usuario nao encontrado" } };

    const current = db.users[index];
    const next = { ...current };

    if (payload.name !== undefined) {
      const name = String(payload.name || "").trim();
      if (!name) return { error: { status: 400, message: "Nome nao pode ficar vazio" } };
      next.name = name;
    }

    if (payload.email !== undefined) {
      const email = String(payload.email || "").trim().toLowerCase();
      if (!email) return { error: { status: 400, message: "Email nao pode ficar vazio" } };
      const exists = db.users.some((u) => u.id !== current.id && String(u.email).toLowerCase() === email);
      if (exists) return { error: { status: 409, message: "Email ja em uso por outro usuario" } };
      next.email = email;
    }

    if (payload.password !== undefined) {
      const password = String(payload.password || "");
      if (!isStrongPassword(password)) {
        return { error: { status: 400, message: "Senha fraca: minimo 8 caracteres, 1 letra maiuscula, 1 numero e 1 caractere especial" } };
      }
      next.password = password;
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
        return { error: { status: 409, message: `${councilType} ja cadastrado para outro usuario` } };
      }

      const external = await verifyCouncilExternally({
        role,
        councilType,
        councilNumber: localCheck.councilNumber,
        councilUf: localCheck.councilUf,
        name: next.name,
        email: next.email
      });

      if (!external.valid) {
        return { error: { status: 400, message: external.error || "Conselho nao validado no provedor externo" } };
      }

      next.councilType = councilType;
      next.councilNumber = localCheck.councilNumber;
      next.councilUf = localCheck.councilUf;
      next.councilVerification = {
        checked: external.checked,
        provider: external.provider,
        status: external.status,
        verifiedAt: new Date().toISOString()
      };
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

app.get("/protocol/templates/:category/usage", requireManager, async (req, res) => {
  const category = String(req.params.category || "").trim();
  const db = await readDb();
  ensureDbShape(db);
  const template = db.protocolTemplates.find((t) => t.category === category && (!t.teamId || t.teamId === req.user.teamId));
  if (!template) return res.status(404).json({ error: "Categoria de protocolo nao encontrada" });

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
    canDelete: Boolean(template.teamId) && category !== "general" && patientCount === 0 && recordsCount === 0
  });
});

app.post("/protocol/templates", requireManager, async (req, res) => {
  const payloadCheck = sanitizeProtocolTemplatePayload(req.body || {});
  if (!payloadCheck.ok) return res.status(400).json({ error: payloadCheck.error });

  const result = await withDb((db) => {
    ensureDbShape(db);
    const exists = db.protocolTemplates.some((t) => t.category === payloadCheck.template.category && t.teamId === req.user.teamId);
    if (exists) return { error: "Categoria ja existe" };
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

app.put("/protocol/templates/:category", requireManager, async (req, res) => {
  const category = String(req.params.category || "").trim();
  const payloadCheck = sanitizeProtocolTemplatePayload(req.body || {}, category);
  if (!payloadCheck.ok) return res.status(400).json({ error: payloadCheck.error });

  const result = await withDb((db) => {
    ensureDbShape(db);
    const index = db.protocolTemplates.findIndex((t) => t.category === category && t.teamId === req.user.teamId);
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

    const globalTemplate = db.protocolTemplates.find((t) => t.category === category && !t.teamId);
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

  if (!result) return res.status(404).json({ error: "Categoria de protocolo nao encontrada" });
  return res.json(result);
});

app.delete("/protocol/templates/:category", requireManager, async (req, res) => {
  const category = String(req.params.category || "").trim();
  if (category === "general") {
    return res.status(400).json({ error: "Categoria general nao pode ser excluida" });
  }

  const result = await withDb((db) => {
    ensureDbShape(db);
    const index = db.protocolTemplates.findIndex((t) => t.category === category && t.teamId === req.user.teamId);
    if (index < 0) return { error: { status: 404, message: "Categoria de protocolo nao encontrada" } };

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

    db.protocolTemplates.splice(index, 1);
    addAuditLog(db, req.user, "protocol_template.deleted", "protocol_template", category, {});
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
    return res.status(400).json({ error: "name, email, password e role sao obrigatorios" });
  }

  if (!["acs", "doctor"].includes(role)) {
    return res.status(400).json({ error: "A enfermeira pode cadastrar apenas ACS ou Medico(a)" });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Senha fraca: minimo 8 caracteres, 1 letra maiuscula, 1 numero e 1 caractere especial" });
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
      error: externalCheck.error || "Conselho nao validado no provedor externo"
    });
  }

  const result = await withDb((db) => {
    ensureDbShape(db);
    if (db.users.some((u) => String(u.email).toLowerCase() === email)) {
      return { error: "Email ja cadastrado" };
    }

    const duplicatedCouncil = roleNeedsCouncil(role) && db.users.some((u) => {
      const uRole = canonicalRole(u.role);
      return roleNeedsCouncil(uRole)
        && String(u.councilType || "").toUpperCase() === councilType
        && String(u.councilNumber || "") === councilValidation.councilNumber
        && String(u.councilUf || "").toUpperCase() === councilValidation.councilUf;
    });

    if (duplicatedCouncil) {
      return { error: `${councilType} ja cadastrado para outro usuario` };
    }

    const user = {
      id: uuidv4(),
      name,
      role,
      email,
      password,
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

app.get("/patients", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const patients = getAllowedPatients(db, req.user, req.query);
  res.json(patients);
});

app.post("/patients", requireManager, async (req, res) => {
  const payload = req.body;
  const db = await readDb();
  ensureDbShape(db);
  const protocolMap = getProtocolTemplateMap(db, req.user.teamId);

  if (!payload.name || !payload.phone) {
    return res.status(400).json({ error: "Nome e telefone sao obrigatorios" });
  }

  const patient = {
    id: uuidv4(),
    teamId: req.user.teamId,
    name: String(payload.name).trim(),
    cnsCpf: payload.cnsCpf ? String(payload.cnsCpf).trim() : "",
    address: payload.address ? String(payload.address).trim() : "",
    phone: String(payload.phone).trim(),
    microArea: payload.microArea ? String(payload.microArea).trim() : "",
    assignedAcsId: payload.assignedAcsId ? String(payload.assignedAcsId).trim() : "",
    careCategory: normalizeCategory(payload.careCategory, protocolMap),
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
    return res.status(403).json({ error: "Sem permissao para editar paciente" });
  }

  const updated = await withDb((db) => {
    ensureDbShape(db);
    const index = db.patients.findIndex((p) => p.id === id && p.teamId === req.user.teamId);
    if (index < 0) return null;

    const current = db.patients[index];
    const protocolMap = getProtocolTemplateMap(db, req.user.teamId);
    const doctorAllowed = new Set(["phone", "address", "comorbidities", "medications", "allergies"]);
    const safePayload = isDoctor(req.user)
      ? Object.fromEntries(Object.entries(payload || {}).filter(([k]) => doctorAllowed.has(k)))
      : payload;
    const next = {
      ...current,
      ...safePayload,
      teamId: current.teamId,
      careCategory: safePayload?.careCategory ? normalizeCategory(safePayload.careCategory, protocolMap) : current.careCategory,
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
    return res.status(404).json({ error: "Paciente nao encontrado" });
  }

  return res.json(updated);
});

app.get("/patients/:id/appointments", async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  ensureDbShape(db);

  const lookup = getPatientOrError(db, req.user, id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  const appointments = db.appointments
    .filter((a) => a.patientId === id)
    .sort((a, b) => b.date.localeCompare(a.date));

  return res.json(appointments);
});

app.post("/patients/:id/appointments", async (req, res) => {
  const { id } = req.params;
  const payload = req.body;

  if (!(isManager(req.user) || isDoctor(req.user))) {
    return res.status(403).json({ error: "Sem permissao para criar atendimento" });
  }

  if (!payload.date || !payload.summary) {
    return res.status(400).json({ error: "Data e resumo sao obrigatorios" });
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
    return res.status(400).json({ error: "type, date e title sao obrigatorios" });
  }

  const allowedTypes = ["visit", "consultation", "vaccine", "procedure", "note"];
  const type = String(payload.type);

  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ error: "Tipo de registro invalido" });
  }

  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  if (isAcs(req.user) && !["visit", "note"].includes(type)) {
    return res.status(403).json({ error: "ACS pode registrar apenas visita e observacao" });
  }

  if (isDoctor(req.user) && ["visit"].includes(type)) {
    return res.status(403).json({ error: "Medica nao registra visita domiciliar" });
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

app.post("/tasks", requireManager, async (req, res) => {
  const payload = req.body;

  if (!payload.patientId || !payload.assigneeId || !payload.title) {
    return res.status(400).json({ error: "patientId, assigneeId e title sao obrigatorios" });
  }

  const db = await readDb();
  ensureDbShape(db);
  const lookup = getPatientOrError(db, req.user, String(payload.patientId));
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  const assignee = db.users.find((u) => u.id === String(payload.assigneeId));
  if (!assignee || canonicalRole(assignee.role) !== "acs" || assignee.teamId !== req.user.teamId) {
    return res.status(400).json({ error: "Responsavel deve ser ACS da mesma equipe" });
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
      if (current.assigneeId !== req.user.id) return "forbidden";

      const requestedKeys = Object.keys(payload);
      const onlyStatus = requestedKeys.length === 1 && requestedKeys[0] === "status";
      const allowedStatus = ["pending", "in_progress", "done"];
      if (!onlyStatus || !allowedStatus.includes(String(payload.status))) return "forbidden";

      const nextForAcs = {
        ...current,
        status: String(payload.status),
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.id
      };

      db.tasks[index] = nextForAcs;
      addAuditLog(db, req.user, "task.status_updated", "task", id, {
        status: nextForAcs.status
      });
      return nextForAcs;
    }

    if (isManager(req.user)) {
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
    return res.status(403).json({ error: "Sem permissao para atualizar esta tarefa" });
  }

  if (!updated) {
    return res.status(404).json({ error: "Tarefa nao encontrada" });
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

  if (!payload.text) {
    return res.status(400).json({ error: "text e obrigatorio" });
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

app.get("/audit-logs", requireManager, async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});

