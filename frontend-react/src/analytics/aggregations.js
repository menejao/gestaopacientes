function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeCareCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  return normalized || "general";
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

function getProtocolRisk(patient, protocolByPatient) {
  const summary = protocolByPatient?.[patient?.id];
  if (!summary) return "stable";
  const pending = Number(summary?.pending?.visits || 0)
    + Number(summary?.pending?.consultations || 0)
    + Number(summary?.pending?.vaccines || 0);
  const specialAlerts = asArray(summary?.specialAlerts);
  if (String(patient?.status || "").toLowerCase() === "risk" || specialAlerts.some((alert) => String(alert?.severity || "").toLowerCase() === "high") || pending >= 3) {
    return "critical";
  }
  if (pending > 0 || specialAlerts.some((alert) => ["medium", "warning"].includes(String(alert?.severity || "").toLowerCase()))) {
    return "attention";
  }
  return "stable";
}

export function getTeamPerformance({
  patients = [],
  users = [],
  protocolByPatient = {},
  records = [],
  appointments = [],
  teams = [],
} = {}) {
  const teamNameMap = getTeamNameMap(users, teams);
  const teamIds = new Set([
    ...asArray(patients).map((patient) => patient?.teamId).filter(Boolean),
    ...asArray(users).map((user) => user?.teamId).filter(Boolean),
    ...asArray(teams).map((team) => team?.id).filter(Boolean),
  ]);

  return Array.from(teamIds).map((teamId) => {
    const teamPatients = asArray(patients).filter((patient) => patient?.teamId === teamId);
    const criticalPatients = teamPatients.filter((patient) => getProtocolRisk(patient, protocolByPatient) === "critical").length;
    const teamAppointments = asArray(appointments).filter((item) => teamPatients.some((patient) => patient.id === item?.patientId)).length;
    const teamRecords = asArray(records).filter((item) => teamPatients.some((patient) => patient.id === item?.patientId)).length;
    const productivityScore = Math.round(
      (teamAppointments * 0.45)
      + (teamRecords * 0.35)
      + (teamPatients.length * 0.15)
      - (criticalPatients * 0.2)
    );
    const status = criticalPatients >= Math.max(5, Math.round(teamPatients.length * 0.15))
      ? "attention"
      : productivityScore >= 15
        ? "good"
        : "monitor";

    return {
      teamId,
      teamName: teamNameMap.get(teamId) || `Equipe ${teamId}`,
      totalPatients: teamPatients.length,
      criticalPatients,
      appointments: teamAppointments,
      productivityScore,
      status,
    };
  }).sort((a, b) => b.productivityScore - a.productivityScore || a.teamName.localeCompare(b.teamName, "pt-BR"));
}

export function getProfessionalPerformance({
  users = [],
  records = [],
  appointments = [],
  tasks = [],
} = {}) {
  return asArray(users).map((user) => {
    const authoredRecords = asArray(records).filter((record) => record?.createdBy === user?.id).length;
    const authoredAppointments = asArray(appointments).filter((appointment) => appointment?.createdBy === user?.id).length;
    const tasksCompleted = asArray(tasks).filter((task) => task?.assigneeId === user?.id && String(task?.status || "").toLowerCase() === "done").length;
    const production = authoredRecords + authoredAppointments;
    const status = tasksCompleted >= 5 || production >= 10 ? "high" : production >= 4 ? "attention" : "low";
    return {
      userId: user?.id || null,
      name: user?.name || "Profissional não identificado",
      role: user?.role || "unknown",
      production,
      tasksCompleted,
      status,
    };
  }).sort((a, b) => b.production - a.production || b.tasksCompleted - a.tasksCompleted || a.name.localeCompare(b.name, "pt-BR"));
}

function makeBucketKey(date, mode) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  if (mode === "daily") return `${year}-${month}-${day}`;
  if (mode === "monthly") return `${year}-${month}`;
  const weekStart = new Date(date);
  const dayOfWeek = weekStart.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + diff);
  return `${weekStart.getFullYear()}-W${`${weekStart.getMonth() + 1}`.padStart(2, "0")}-${`${weekStart.getDate()}`.padStart(2, "0")}`;
}

function buildSeries(entries, mode) {
  const buckets = new Map();
  asArray(entries).forEach((entry) => {
    const date = new Date(entry);
    if (Number.isNaN(date.getTime())) return;
    const key = makeBucketKey(date, mode);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });
  return Array.from(buckets.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function getTrendSeries({
  records = [],
  appointments = [],
  period = "month",
} = {}) {
  const now = new Date();
  const maxAgeDays = period === "week" ? 7 : period === "quarter" ? 90 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - maxAgeDays);

  const filteredRecords = asArray(records).filter((record) => {
    const date = new Date(record?.date || record?.createdAt || 0);
    return !Number.isNaN(date.getTime()) && date >= cutoff;
  });
  const filteredAppointments = asArray(appointments).filter((appointment) => {
    const date = new Date(appointment?.date || appointment?.createdAt || 0);
    return !Number.isNaN(date.getTime()) && date >= cutoff;
  });

  return {
    daily: buildSeries([
      ...filteredRecords.map((record) => record?.date || record?.createdAt),
      ...filteredAppointments.map((appointment) => appointment?.date || appointment?.createdAt),
    ], "daily"),
    weekly: buildSeries([
      ...filteredRecords.map((record) => record?.date || record?.createdAt),
      ...filteredAppointments.map((appointment) => appointment?.date || appointment?.createdAt),
    ], "weekly"),
    monthly: buildSeries([
      ...filteredRecords.map((record) => record?.date || record?.createdAt),
      ...filteredAppointments.map((appointment) => appointment?.date || appointment?.createdAt),
    ], "monthly"),
  };
}

