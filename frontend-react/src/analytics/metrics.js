const CARE_CATEGORIES = ["general", "pregnant", "puerperal", "child_followup", "elderly", "chronic"];

function normalizeCareCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  return CARE_CATEGORIES.includes(normalized) ? normalized : "general";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPatientLookup(patients) {
  const map = new Map();
  asArray(patients).forEach((patient) => {
    if (patient?.id) map.set(patient.id, patient);
  });
  return map;
}

function getTeamNameMap(users, teams = []) {
  const map = new Map();
  asArray(teams).forEach((team) => {
    if (team?.id) map.set(team.id, team.name || team.label || `Equipe ${team.id}`);
  });
  asArray(users).forEach((user) => {
    if (user?.teamId && user?.teamName && !map.has(user.teamId)) map.set(user.teamId, user.teamName);
  });
  return map;
}

function countBy(items, getKey, getSeed = () => 0) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    if (!key) return acc;
    if (!(key in acc)) acc[key] = getSeed(item);
    acc[key] += 1;
    return acc;
  }, {});
}

function countByProfessional(entries, users) {
  const userMap = new Map(asArray(users).map((user) => [user.id, user]));
  return entries.reduce((acc, entry) => {
    const professionalId = entry?.createdBy || entry?.authorId || entry?.professionalId || entry?.userId || null;
    const label = userMap.get(professionalId)?.name || entry?.professionalName || "Não identificado";
    if (!acc[label]) {
      acc[label] = {
        professionalId: professionalId || null,
        name: label,
        total: 0,
      };
    }
    acc[label].total += 1;
    return acc;
  }, {});
}

function countByTeam(entries, patientLookup, users, teams) {
  const teamNameMap = getTeamNameMap(users, teams);
  return entries.reduce((acc, entry) => {
    const patient = patientLookup.get(entry?.patientId);
    const teamId = patient?.teamId || entry?.teamId || null;
    const key = teamId || "sem-equipe";
    if (!acc[key]) {
      acc[key] = {
        teamId: teamId || null,
        teamName: teamNameMap.get(teamId) || (teamId ? `Equipe ${teamId}` : "Sem equipe"),
        total: 0,
      };
    }
    acc[key].total += 1;
    return acc;
  }, {});
}

function countByCategoryFromEntries(entries, patientLookup) {
  return entries.reduce((acc, entry) => {
    const patient = patientLookup.get(entry?.patientId);
    const category = normalizeCareCategory(patient?.careCategory);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
}

function inferAttendanceRate(appointments) {
  const items = asArray(appointments);
  if (!items.length) return null;
  const statusAware = items.filter((item) => item?.status || item?.outcome || item?.attendanceStatus);
  if (!statusAware.length) return null;
  const attended = statusAware.filter((item) => {
    const status = String(item.status || item.outcome || item.attendanceStatus || "").toLowerCase();
    return ["done", "completed", "attended", "realized", "realizado", "compareceu"].includes(status);
  }).length;
  return Math.round((attended / statusAware.length) * 100);
}

function normalizeDemandType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["walkin", "spontaneous", "demanda_espontanea", "espontaneo", "espontânea", "spontaneous_demand"].includes(normalized)) return "spontaneous";
  if (["scheduled", "agendado", "agenda"].includes(normalized)) return "scheduled";
  return normalized || "unspecified";
}

export function getProductionMetrics({
  patients = [],
  records = [],
  appointments = [],
  agenda = [],
  messages = [],
  tasks = [],
  users = [],
  teams = [],
} = {}) {
  const patientLookup = getPatientLookup(patients);
  const appointmentItems = asArray(appointments);
  const agendaItems = asArray(agenda);
  const recordItems = asArray(records);
  const productionEntries = [...appointmentItems, ...recordItems];

  const scheduledAppointments = appointmentItems.filter((item) => normalizeDemandType(item?.demandType) === "scheduled").length
    + agendaItems.filter((item) => normalizeDemandType(item?.demandType || item?.kind) !== "spontaneous").length;
  const spontaneousAppointments = appointmentItems.filter((item) => normalizeDemandType(item?.demandType) === "spontaneous").length
    + agendaItems.filter((item) => normalizeDemandType(item?.demandType || item?.kind) === "spontaneous").length;

  const totalByProfessional = countByProfessional(productionEntries, users);
  const totalByTeam = countByTeam(productionEntries, patientLookup, users, teams);
  const totalByCategory = countByCategoryFromEntries(productionEntries, patientLookup);

  return {
    totalAppointments: appointmentItems.length + agendaItems.length,
    scheduledAppointments,
    spontaneousAppointments,
    attendanceRate: inferAttendanceRate(appointmentItems),
    totalVisits: recordItems.filter((item) => String(item?.type || "").toLowerCase() === "visit").length,
    totalProcedures: recordItems.filter((item) => String(item?.type || "").toLowerCase() === "procedure").length,
    totalVaccines: recordItems.filter((item) => ["vaccine", "vaccination"].includes(String(item?.type || "").toLowerCase())).length,
    totalIndividualRecords: recordItems.length,
    totalByProfessional: Object.values(totalByProfessional).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR")),
    totalByTeam: Object.values(totalByTeam).sort((a, b) => b.total - a.total || a.teamName.localeCompare(b.teamName, "pt-BR")),
    totalByCategory,
    totalTasksLinked: asArray(tasks).length,
    totalMessagesLinked: asArray(messages).length,
  };
}

function classifyPatient(summary, patient) {
  const pending = Number(summary?.pending?.visits || 0)
    + Number(summary?.pending?.consultations || 0)
    + Number(summary?.pending?.vaccines || 0);
  const status = String(patient?.status || "").toLowerCase();
  const specialAlerts = asArray(summary?.specialAlerts);
  const hasCriticalAlert = specialAlerts.some((alert) => String(alert?.severity || "").toLowerCase() === "high");
  const hasAttentionAlert = specialAlerts.some((alert) => ["medium", "warning"].includes(String(alert?.severity || "").toLowerCase()));
  if (status === "risk" || hasCriticalAlert || pending >= 3) return "critical";
  if (pending > 0 || hasAttentionAlert || status === "inactive") return "attention";
  return "ok";
}

export function getCareMetrics({
  patients = [],
  protocolByPatient = {},
  templates = [],
} = {}) {
  const items = asArray(patients);
  const patientsByCategory = CARE_CATEGORIES.reduce((acc, category) => ({ ...acc, [category]: 0 }), {});
  let criticalPatients = 0;
  let attentionPatients = 0;
  let okPatients = 0;

  items.forEach((patient) => {
    const category = normalizeCareCategory(patient?.careCategory);
    patientsByCategory[category] = (patientsByCategory[category] || 0) + 1;
    const status = classifyPatient(protocolByPatient?.[patient.id], patient);
    if (status === "critical") criticalPatients += 1;
    else if (status === "attention") attentionPatients += 1;
    else okPatients += 1;
  });

  const knownCategories = new Set(asArray(templates).map((template) => normalizeCareCategory(template?.category)));
  return {
    totalPatients: items.length,
    criticalPatients,
    attentionPatients,
    okPatients,
    pregnantPatients: patientsByCategory.pregnant || 0,
    childFollowupPatients: patientsByCategory.child_followup || 0,
    chronicPatients: patientsByCategory.chronic || 0,
    elderlyPatients: patientsByCategory.elderly || 0,
    patientsWithIncompleteProfile: items.filter((patient) => !!patient?.incompleteProfile).length,
    patientsWithoutAcs: items.filter((patient) => !String(patient?.assignedAcsId || "").trim()).length,
    patientsByCategory,
    categoriesWithoutTemplate: Object.keys(patientsByCategory).filter((category) => patientsByCategory[category] > 0 && !knownCategories.has(category)),
  };
}

export function getPharmacyMetrics({
  stock = [],
} = {}) {
  const items = asArray(stock);
  const zeroStockItems = items.filter((item) => Number(item?.qty || 0) <= 0).length;
  const lowStockItems = items.filter((item) => {
    const qty = Number(item?.qty || 0);
    const minQty = Number(item?.minQty || 0);
    return qty > 0 && minQty > 0 && qty <= minQty;
  }).length;
  const criticalItems = items.filter((item) => {
    const qty = Number(item?.qty || 0);
    const minQty = Number(item?.minQty || 0);
    return qty <= 0 || (minQty > 0 && qty <= Math.ceil(minQty * 0.5));
  }).length;
  return {
    totalItems: items.length,
    criticalItems,
    zeroStockItems,
    lowStockItems,
  };
}

export function getRegistrationMetrics({
  patients = [],
  users = [],
  teams = [],
} = {}) {
  const items = asArray(patients);
  const acsMap = new Map(asArray(users).filter((user) => user?.role === "acs").map((user) => [user.id, user]));
  const teamNameMap = getTeamNameMap(users, teams);
  const patientsByAcs = {};
  const patientsByTeam = {};

  items.forEach((patient) => {
    const acsId = String(patient?.assignedAcsId || "").trim();
    const acsName = acsMap.get(acsId)?.name || (acsId ? `ACS ${acsId}` : "Sem ACS");
    if (!patientsByAcs[acsName]) patientsByAcs[acsName] = 0;
    patientsByAcs[acsName] += 1;

    const teamId = patient?.teamId || null;
    const teamName = teamNameMap.get(teamId) || (teamId ? `Equipe ${teamId}` : "Sem equipe");
    if (!patientsByTeam[teamName]) patientsByTeam[teamName] = 0;
    patientsByTeam[teamName] += 1;
  });

  const linkedPatients = items.filter((patient) => !!String(patient?.assignedAcsId || "").trim()).length;
  const unlinkedPatients = items.length - linkedPatients;
  const incompleteRegistrations = items.filter((patient) => {
    return !!patient?.incompleteProfile
      || !String(patient?.cpf || "").trim()
      || !String(patient?.cns || "").trim()
      || !String(patient?.address || "").trim()
      || !String(patient?.microArea || "").trim();
  }).length;

  return {
    totalRegisteredPatients: items.length,
    linkedPatients,
    unlinkedPatients,
    patientsByAcs,
    patientsByTeam,
    incompleteRegistrations,
    microAreaCoverage: items.length ? Math.round((items.filter((patient) => !!String(patient?.microArea || "").trim()).length / items.length) * 100) : null,
  };
}

