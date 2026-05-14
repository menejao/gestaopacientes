import express from "express";
import { v4 as uuidv4 } from "uuid";
import { readDb, withDb } from "../db.js";
import { validate, PatientCreateSchema, PatientUpdateSchema, AppointmentCreateSchema, RecordCreateSchema } from "../schemas.js";
import { requireManagerOrDoctor } from "../middlewares/auth.js";
import {
  ensureDbShape, getProtocolTemplateMap, normalizeCategory, normalizeChronicConditions
} from "../utils/domain.js";
import {
  isManager, isDoctor, isAcs, normalizeDemandType,
  detectConsultationSpecialtyFromTitle, normalizeConsultationTitle
} from "../utils/helpers.js";
import {
  getAllowedPatients, canAccessPatient, getPatientOrError, buildPatientHistory
} from "../utils/patients.js";
import { buildProtocolSummary, restrictSummaryAlertsForForeignTeam } from "../utils/protocol-eval.js";
import { validateClinicalRecordPayload, buildMonthlyDemandMetric, buildDataQualityMetric } from "../utils/metrics.js";
import { addAuditLog } from "../services/audit.js";

const router = express.Router();

router.get("/patients", async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const patients = getAllowedPatients(db, req.user, req.query);
  res.json(patients);
});

router.get("/patients/protocol-summaries", async (req, res) => {
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
    const summary = buildProtocolSummary(patient, history, protocolMap);
    summaries[patient.id] = patient.teamId && patient.teamId !== req.user.teamId
      ? restrictSummaryAlertsForForeignTeam(summary)
      : summary;
  }

  return res.json({
    count: Object.keys(summaries).length,
    summaries
  });
});

router.post("/patients", requireManagerOrDoctor, validate(PatientCreateSchema), async (req, res) => {
  const payload = req.body;
  const db = await readDb();
  ensureDbShape(db);
  const protocolMap = getProtocolTemplateMap(db, req.user.teamId);

  if (!payload.name || !payload.phone) {
    return res.status(400).json({ error: "Nome e telefone são obrigatórios" });
  }

  const requestedTeamId = String(payload.teamId || "").trim();
  const patientTeamId = requestedTeamId || req.user.teamId;
  if (!patientTeamId) {
    return res.status(400).json({ error: "Equipe responsável é obrigatória" });
  }
  const teamExists = db.teams.some((t) => t.id === patientTeamId);
  if (!teamExists) {
    return res.status(400).json({ error: "Equipe responsável inválida" });
  }

  const patient = {
    id: uuidv4(),
    teamId: patientTeamId,
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
    incompleteProfile: Boolean(payload.incompleteProfile),
    sexAtBirth: payload.sexAtBirth ? String(payload.sexAtBirth).trim().toLowerCase() : "",
    genderIdentity: payload.genderIdentity ? String(payload.genderIdentity).trim().toLowerCase() : "",
    birthDate: payload.birthDate ? String(payload.birthDate).trim() : "",
    pregnancyStartDate: payload.pregnancyStartDate ? String(payload.pregnancyStartDate).trim() : "",
    expectedDeliveryDate: payload.expectedDeliveryDate ? String(payload.expectedDeliveryDate).trim() : "",
    gestationalAgeDumWeeks: Number.isFinite(Number(payload.gestationalAgeDumWeeks))
      ? Math.max(0, Math.min(45, Number(payload.gestationalAgeDumWeeks)))
      : "",
    gestationalAgeDumDays: Number.isFinite(Number(payload.gestationalAgeDumDays))
      ? Math.max(0, Math.min(6, Number(payload.gestationalAgeDumDays)))
      : "",
    gestationalAgeUsgWeeks: Number.isFinite(Number(payload.gestationalAgeUsgWeeks))
      ? Math.max(0, Math.min(45, Number(payload.gestationalAgeUsgWeeks)))
      : "",
    gestationalAgeUsgDays: Number.isFinite(Number(payload.gestationalAgeUsgDays))
      ? Math.max(0, Math.min(6, Number(payload.gestationalAgeUsgDays)))
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

  await withDb((db) => {
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

router.put("/patients/:id", validate(PatientUpdateSchema), async (req, res) => {
  const { id } = req.params;
  const payload = req.body;

  if (!(isManager(req.user) || isDoctor(req.user))) {
    return res.status(403).json({ error: "Sem permissão para editar paciente" });
  }

  const updated = await withDb((db) => {
    ensureDbShape(db);
    const index = db.patients.findIndex((p) => p.id === id);
    if (index < 0) return null;

    const current = db.patients[index];
    if (!canAccessPatient(req.user, current)) return "forbidden";
    const protocolMap = getProtocolTemplateMap(db, req.user.teamId);
    const doctorAllowed = new Set([
      "phone", "phoneAlt", "address", "comorbidities", "medications", "allergies",
      "birthDate", "pregnancyStartDate", "expectedDeliveryDate",
      "gestationalAgeDumWeeks", "gestationalAgeDumDays",
      "gestationalAgeUsgWeeks", "gestationalAgeUsgDays",
      "usgDate1", "usgDate2", "usgDate3", "prenatalStartDate", "postpartumStartDate",
      "incompleteProfile"
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
      incompleteProfile: safePayload?.incompleteProfile !== undefined
        ? Boolean(safePayload.incompleteProfile)
        : Boolean(current.incompleteProfile),
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
      gestationalAgeDumDays: safePayload?.gestationalAgeDumDays !== undefined
        ? (Number.isFinite(Number(safePayload.gestationalAgeDumDays))
          ? Math.max(0, Math.min(6, Number(safePayload.gestationalAgeDumDays)))
          : "")
        : (Number.isFinite(Number(current.gestationalAgeDumDays)) ? Number(current.gestationalAgeDumDays) : ""),
      gestationalAgeUsgWeeks: safePayload?.gestationalAgeUsgWeeks !== undefined
        ? (Number.isFinite(Number(safePayload.gestationalAgeUsgWeeks))
          ? Math.max(0, Math.min(45, Number(safePayload.gestationalAgeUsgWeeks)))
          : "")
        : (Number.isFinite(Number(current.gestationalAgeUsgWeeks)) ? Number(current.gestationalAgeUsgWeeks) : ""),
      gestationalAgeUsgDays: safePayload?.gestationalAgeUsgDays !== undefined
        ? (Number.isFinite(Number(safePayload.gestationalAgeUsgDays))
          ? Math.max(0, Math.min(6, Number(safePayload.gestationalAgeUsgDays)))
          : "")
        : (Number.isFinite(Number(current.gestationalAgeUsgDays)) ? Number(current.gestationalAgeUsgDays) : ""),
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
  if (updated === "forbidden") {
    return res.status(403).json({ error: "Sem permissão para editar paciente" });
  }

  return res.json(updated);
});

router.delete("/patients/:id", requireManagerOrDoctor, async (req, res) => {
  const { id } = req.params;

  const result = await withDb((db) => {
    ensureDbShape(db);
    const patientIndex = db.patients.findIndex((p) => p.id === id);
    if (patientIndex < 0) return { error: "Paciente não encontrado" };

    const patient = db.patients[patientIndex];
    if (!canAccessPatient(req.user, patient)) return { error: "Sem permissão para excluir paciente" };
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

  if (result?.error) {
    const status = String(result.error).toLowerCase().includes("permissão") ? 403 : 404;
    return res.status(status).json({ error: result.error });
  }
  return res.json(result);
});

router.get("/patients/:id/appointments", async (req, res) => {
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

router.post("/patients/:id/appointments", validate(AppointmentCreateSchema), async (req, res) => {
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

  await withDb((mutableDb) => {
    ensureDbShape(mutableDb);
    mutableDb.appointments.push(appointment);
    addAuditLog(mutableDb, req.user, "appointment.created", "appointment", appointment.id, {
      patientId: id
    });
  });

  return res.status(201).json(appointment);
});

router.delete("/patients/:id/appointments/:appointmentId", async (req, res) => {
  const patientId = String(req.params.id || "").trim();
  const appointmentId = String(req.params.appointmentId || "").trim();

  if (!(isManager(req.user) || isDoctor(req.user))) {
    return res.status(403).json({ error: "Sem permissão para excluir atendimento" });
  }

  const result = await withDb((db) => {
    ensureDbShape(db);
    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) return { error: { status: 404, message: "Paciente não encontrado" } };
    if (!canAccessPatient(req.user, patient)) return { error: { status: 403, message: "Sem permissão para este paciente" } };

    const index = db.appointments.findIndex((a) => a.id === appointmentId && a.patientId === patientId);
    if (index < 0) return { error: { status: 404, message: "Atendimento não encontrado" } };

    const removed = db.appointments[index];
    db.appointments.splice(index, 1);
    addAuditLog(db, req.user, "appointment.deleted", "appointment", appointmentId, {
      patientId,
      summary: removed.summary || ""
    });
    return { ok: true };
  });

  if (result?.error) return res.status(result.error.status).json({ error: result.error.message });
  return res.json({ ok: true });
});

router.post("/patients/:id/records", validate(RecordCreateSchema), async (req, res) => {
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

  const integrityCheck = validateClinicalRecordPayload({
    user: req.user,
    patient: lookup.patient,
    type,
    title: payload.title,
    date: payload.date,
    details: payload.details,
    metadata: payload.metadata
  });
  if (!integrityCheck.ok) {
    return res.status(400).json({ error: integrityCheck.error });
  }

  const incomingMetadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  const consultationSpecialty = type === "consultation"
    ? detectConsultationSpecialtyFromTitle(payload.title)
    : "";
  const normalizedTitle = type === "consultation"
    ? normalizeConsultationTitle(payload.title, consultationSpecialty)
    : String(payload.title);

  const record = {
    id: uuidv4(),
    patientId: id,
    type,
    title: normalizedTitle,
    details: payload.details ? String(payload.details) : "",
    date: String(payload.date),
    protocolTag: payload.protocolTag
      ? normalizeCategory(String(payload.protocolTag), getProtocolTemplateMap(db, req.user.teamId))
      : normalizeCategory(lookup.patient.careCategory, getProtocolTemplateMap(db, req.user.teamId)),
    metadata: {
      ...incomingMetadata,
      ...(type === "consultation" ? { specialty: consultationSpecialty } : {})
    },
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };

  await withDb((mutableDb) => {
    ensureDbShape(mutableDb);
    mutableDb.clinicalRecords.push(record);
    addAuditLog(mutableDb, req.user, "clinical_record.created", "clinical_record", record.id, {
      patientId: id,
      type: record.type,
      protocolTag: record.protocolTag
    });
  });

  return res.status(201).json({
    ...record,
    warning: integrityCheck.warning || ""
  });
});

router.delete("/patients/:id/records/:recordId", async (req, res) => {
  const patientId = String(req.params.id || "").trim();
  const recordId = String(req.params.recordId || "").trim();

  const result = await withDb((db) => {
    ensureDbShape(db);
    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) return { error: { status: 404, message: "Paciente não encontrado" } };
    if (!canAccessPatient(req.user, patient)) return { error: { status: 403, message: "Sem permissão para este paciente" } };

    const index = db.clinicalRecords.findIndex((r) => r.id === recordId && r.patientId === patientId);
    if (index < 0) return { error: { status: 404, message: "Registro não encontrado" } };

    const current = db.clinicalRecords[index];
    if (isAcs(req.user)) {
      const canDeleteOwnVisit = current.type === "visit" && current.createdBy === req.user.id;
      if (!canDeleteOwnVisit) {
        return { error: { status: 403, message: "ACS pode excluir apenas visita própria registrada por ele" } };
      }
    } else if (!(isManager(req.user) || isDoctor(req.user))) {
      return { error: { status: 403, message: "Sem permissão para excluir registro" } };
    }

    db.clinicalRecords.splice(index, 1);
    addAuditLog(db, req.user, "clinical_record.deleted", "clinical_record", recordId, {
      patientId,
      type: current.type
    });
    return { ok: true };
  });

  if (result?.error) return res.status(result.error.status).json({ error: result.error.message });
  return res.json({ ok: true });
});

router.get("/patients/:id/history", async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  ensureDbShape(db);

  const lookup = getPatientOrError(db, req.user, id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  return res.json(buildPatientHistory(db, id));
});

router.get("/patients/:id/protocol-summary", async (req, res) => {
  const { id } = req.params;
  const db = await readDb();
  ensureDbShape(db);

  const lookup = getPatientOrError(db, req.user, id);
  if (lookup.error) return res.status(lookup.error.status).json({ error: lookup.error.message });

  const history = buildPatientHistory(db, id);
  const summary = buildProtocolSummary(lookup.patient, history, getProtocolTemplateMap(db, req.user.teamId));
  if (lookup.patient.teamId && lookup.patient.teamId !== req.user.teamId) {
    return res.json(restrictSummaryAlertsForForeignTeam(summary));
  }
  return res.json(summary);
});

router.get("/patients/:id/messages", async (req, res) => {
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

router.post("/patients/:id/messages", async (req, res) => {
  const { id } = req.params;
  const payload = req.body;

  if (isAcs(req.user)) {
    return res.status(403).json({ error: "ACS não pode enviar mensagens neste módulo" });
  }

  if (!payload.text) {
    return res.status(400).json({ error: "text é obrigatório" });
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

  await withDb((mutableDb) => {
    ensureDbShape(mutableDb);
    mutableDb.messages.push(message);
    addAuditLog(mutableDb, req.user, "message.created", "message", message.id, {
      patientId: id
    });
  });

  return res.status(201).json(message);
});

router.get("/metrics/demand/monthly", async (req, res) => {
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

router.get("/metrics/data-quality", async (req, res) => {
  if (!(isManager(req.user) || isDoctor(req.user))) {
    return res.status(403).json({ error: "Apenas enfermeira e médica podem acessar qualidade de dados" });
  }
  const db = await readDb();
  ensureDbShape(db);
  return res.json(buildDataQualityMetric(db, req.user.teamId));
});

export default router;
