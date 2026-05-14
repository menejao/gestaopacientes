import express from "express";
import { readDb, readDbForBackup, withDb } from "../db.js";
import { BACKUP_EXPORT_KEY } from "../config.js";
import {
  ensureDbShape, getProtocolTemplateMap, sanitizeUser, getTeamNameById,
  DEFAULT_CARE_PROTOCOLS, DEMO_POPULATE_SIZE_COMPLETE, DEMO_POPULATE_SIZE_INCOMPLETE
} from "../utils/domain.js";
import { canonicalRole, isManager, isDoctor } from "../utils/helpers.js";
import { buildMonthlyDemandMetric, buildDataQualityMetric } from "../utils/metrics.js";
import { getAllowedPatients } from "../utils/patients.js";
import {
  buildSeedPatient, buildSeedClinicalRecords, buildSeedAppointments,
  buildSeedMessages, buildSeedTasks, pickRandom
} from "../utils/seed.js";
import { addAuditLog } from "../services/audit.js";
import { getCouncilIntegrationConfig } from "../utils/council.js";
import { requireAuth } from "../middlewares/auth.js";
import { getMetrics } from "../middlewares/logging.js";


const router = express.Router();

router.get("/admin/backup/export", async (req, res) => {
  const providedKey = String(req.headers["x-backup-key"] || "").trim();
  if (!BACKUP_EXPORT_KEY || providedKey !== BACKUP_EXPORT_KEY) {
    return res.status(403).json({ error: "Acesso negado para exportação de backup" });
  }

  const snapshot = await readDbForBackup();
  const generatedAt = new Date().toISOString();
  const fileName = `backup-saudeubs-${generatedAt.slice(0, 10)}.json`;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  return res.json({
    generatedAt,
    driver: process.env.DATABASE_URL ? "postgres" : "file",
    encryptedSnapshot: snapshot
  });
});

router.get("/bootstrap", requireAuth, async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);

  const isGestorUser = canonicalRole(req.user?.role) === "gestor";
  const patients = getAllowedPatients(db, req.user, {});
  const users = db.users
    .filter((u) => isGestorUser || u.teamId === req.user.teamId)
    .map((u) => sanitizeUser(u, db));
  const protocolTemplates = Object.values(getProtocolTemplateMap(db, req.user.teamId));
  const teamPatientIds = new Set(patients.map((p) => p.id));
  const tasks = db.tasks.filter((t) => teamPatientIds.has(t.patientId));
  const demandMonthly = (isManager(req.user) || isDoctor(req.user))
    ? buildMonthlyDemandMetric(db, req.user.teamId)
    : null;
  const dataQuality = (isManager(req.user) || isDoctor(req.user))
    ? buildDataQualityMetric(db, req.user.teamId)
    : null;

  return res.json({
    serverTime: new Date().toISOString(),
    user: { ...req.user, teamName: getTeamNameById(db, req.user.teamId) },
    patients,
    users,
    tasks,
    protocolTemplates,
    demandMonthly,
    dataQuality
  });
});

router.get("/integrations/council/status", requireAuth, (_req, res) => {
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

router.post("/admin/patients/reset-populate", requireAuth, async (req, res) => {
  const role = canonicalRole(req.user?.role);
  if (!["gestor", "nurse_manager"].includes(role)) {
    return res.status(403).json({ error: "Somente gestor ou enfermeira podem executar esta rotina" });
  }

  const requiredKey = String(process.env.ADMIN_SEED_KEY || "").trim();
  const sentKey = String(req.headers["x-admin-seed-key"] || "").trim();
  if (requiredKey && sentKey !== requiredKey) {
    return res.status(401).json({ error: "Chave administrativa inválida para população da base" });
  }

  const counts = {
    complete: DEMO_POPULATE_SIZE_COMPLETE,
    incomplete: DEMO_POPULATE_SIZE_INCOMPLETE
  };

  const result = await withDb((db) => {
    ensureDbShape(db);

    const users = Array.isArray(db.users) ? db.users : [];
    const teams = Array.isArray(db.teams) ? db.teams : [];
    const teamIds = teams.map((t) => String(t.id || "").trim()).filter(Boolean);
    const acsUsers = users.filter((u) => canonicalRole(u?.role) === "acs");
    const staffUsers = users.filter((u) => ["nurse_manager", "doctor", "gestor"].includes(canonicalRole(u?.role)));
    const acsIds = acsUsers.map((u) => u.id);

    const templateMapByTeam = new Map();
    const getTemplateMap = (teamId) => {
      const key = String(teamId || "");
      if (!templateMapByTeam.has(key)) {
        templateMapByTeam.set(key, getProtocolTemplateMap(db, teamId));
      }
      return templateMapByTeam.get(key);
    };

    db.patients = [];
    db.appointments = [];
    db.tasks = [];
    db.messages = [];
    db.clinicalRecords = [];
    db.privacyRequests = [];

    const allPatients = [];
    const total = counts.complete + counts.incomplete;
    for (let i = 0; i < total; i += 1) {
      allPatients.push(buildSeedPatient({
        index: i,
        teamIds: teamIds.length ? teamIds : [req.user.teamId],
        acsIds,
        incomplete: i >= counts.complete
      }));
    }

    allPatients.forEach((patient, index) => {
      patient.cnsCpf = patient.cpf || patient.cns || "";
      db.patients.push(patient);

      const bucket = index < 20 ? "ok" : (index < 45 ? "progress" : "critical");
      const protocolMap = getTemplateMap(patient.teamId || req.user.teamId);
      const template = protocolMap[patient.careCategory] || DEFAULT_CARE_PROTOCOLS[patient.careCategory] || DEFAULT_CARE_PROTOCOLS.general;

      const records = buildSeedClinicalRecords(patient, template, bucket, staffUsers);
      db.clinicalRecords.push(...records);
      db.appointments.push(...buildSeedAppointments(patient, pickRandom(staffUsers)?.id || req.user.id));
      db.messages.push(...buildSeedMessages(patient, staffUsers));
      db.tasks.push(...buildSeedTasks(patient, acsIds, pickRandom(staffUsers)?.id || req.user.id));
    });

    const removedCount = allPatients.length;
    addAuditLog(db, req.user, "admin.patients.reset_populate", "patient", "bulk", {
      totalPatients: db.patients.length,
      completePatients: counts.complete,
      incompletePatients: counts.incomplete,
      clinicalRecords: db.clinicalRecords.length,
      appointments: db.appointments.length,
      tasks: db.tasks.length,
      messages: db.messages.length,
      note: `Substituição completa de base clínica anterior por ${removedCount} pacientes demo`
    });

    return {
      totalPatients: db.patients.length,
      completePatients: counts.complete,
      incompletePatients: counts.incomplete,
      clinicalRecords: db.clinicalRecords.length,
      appointments: db.appointments.length,
      tasks: db.tasks.length,
      messages: db.messages.length
    };
  });

  return res.json({ ok: true, ...result });
});

router.get("/metrics/internal", requireAuth, (req, res) => {
  const role = canonicalRole(req.user?.role);
  if (!["gestor", "nurse_manager"].includes(role)) {
    return res.status(403).json({ error: "Acesso restrito a gestores" });
  }
  return res.json(getMetrics());
});

export default router;
