function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeCareCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  return normalized || "general";
}

function countOverdueProtocols(patients, protocolByPatient) {
  return asArray(patients).filter((patient) => {
    const summary = protocolByPatient?.[patient.id];
    if (!summary) return false;
    const pending = Number(summary?.pending?.visits || 0)
      + Number(summary?.pending?.consultations || 0)
      + Number(summary?.pending?.vaccines || 0);
    const specialAlerts = asArray(summary?.specialAlerts);
    return pending > 0 || specialAlerts.some((alert) => ["high", "medium"].includes(String(alert?.severity || "").toLowerCase()));
  }).length;
}

function getCriticalStockIssues(stock) {
  return asArray(stock).filter((item) => {
    const qty = Number(item?.qty || 0);
    const minQty = Number(item?.minQty || 0);
    return qty <= 0 || (minQty > 0 && qty <= Math.ceil(minQty * 0.5));
  });
}

export function getDataQualitySummary({
  patients = [],
  records = [],
  appointments = [],
  stock = [],
  users = [],
  protocolByPatient = {},
} = {}) {
  const patientIds = new Set(asArray(patients).map((patient) => patient?.id).filter(Boolean));
  const userIds = new Set(asArray(users).map((user) => user?.id).filter(Boolean));
  const inconsistentRecords = asArray(records).filter((record) => {
    const missingCore = !record?.patientId || !record?.date || !record?.type;
    const invalidRefs = (record?.patientId && !patientIds.has(record.patientId))
      || (record?.createdBy && !userIds.has(record.createdBy));
    return missingCore || invalidRefs;
  }).length + asArray(appointments).filter((appointment) => {
    return !appointment?.patientId || !appointment?.date || (appointment?.patientId && !patientIds.has(appointment.patientId));
  }).length;

  return {
    incompletePatients: asArray(patients).filter((patient) => !!patient?.incompleteProfile).length,
    missingIdentifiers: asArray(patients).filter((patient) => !String(patient?.cpf || "").trim() || !String(patient?.cns || "").trim()).length,
    missingAcsAssignment: asArray(patients).filter((patient) => !String(patient?.assignedAcsId || "").trim()).length,
    missingCareCategory: asArray(patients).filter((patient) => !String(patient?.careCategory || "").trim() || normalizeCareCategory(patient?.careCategory) === "general" && !String(patient?.careCategory || "").trim()).length,
    overdueProtocols: countOverdueProtocols(patients, protocolByPatient),
    inconsistentRecords,
    criticalStockIssues: getCriticalStockIssues(stock).length,
  };
}

export function getDataQualityAlerts({
  patients = [],
  records = [],
  appointments = [],
  stock = [],
  users = [],
  protocolByPatient = {},
} = {}) {
  const summary = getDataQualitySummary({ patients, records, appointments, stock, users, protocolByPatient });
  const alerts = [];

  if (summary.incompletePatients > 0) {
    alerts.push({
      id: "quality-incomplete-patients",
      severity: summary.incompletePatients >= 10 ? "high" : "medium",
      title: "Cadastros incompletos impactando a visibilidade",
      description: `${summary.incompletePatients} paciente(s) têm perfil incompleto e podem comprometer vínculo, estratificação e produção enviada ao e-SUS APS.`,
      action: "Priorizar mutirão de qualificação cadastral na recepção e ACS.",
    });
  }
  if (summary.missingIdentifiers > 0) {
    alerts.push({
      id: "quality-missing-identifiers",
      severity: "high",
      title: "Identificação sem CPF/CNS completo",
      description: `${summary.missingIdentifiers} paciente(s) estão sem identificadores mínimos para rastreabilidade assistencial e auditoria.`,
      action: "Conferir CPF/CNS na próxima oportunidade de contato e atualizar o cadastro.",
    });
  }
  if (summary.missingAcsAssignment > 0) {
    alerts.push({
      id: "quality-missing-acs",
      severity: summary.missingAcsAssignment >= 15 ? "high" : "medium",
      title: "Pacientes sem ACS vinculado",
      description: `${summary.missingAcsAssignment} paciente(s) estão sem referência territorial.`,
      action: "Revisar microárea e distribuir vínculo para a equipe de ACS.",
    });
  }
  if (summary.overdueProtocols > 0) {
    alerts.push({
      id: "quality-overdue-protocols",
      severity: summary.overdueProtocols >= 8 ? "high" : "medium",
      title: "Pendências de protocolo e seguimento",
      description: `${summary.overdueProtocols} paciente(s) apresentam atraso assistencial ou alerta de protocolo.`,
      action: "Revisar fila de cuidado e pactuar busca ativa com a equipe.",
    });
  }
  if (summary.inconsistentRecords > 0) {
    alerts.push({
      id: "quality-inconsistent-records",
      severity: "medium",
      title: "Registros com inconsistência estrutural",
      description: `${summary.inconsistentRecords} item(ns) de produção apresentam ausência de data, tipo ou vínculo com paciente/profissional.`,
      action: "Auditar prontuários e regularizar o registro antes do fechamento do período.",
    });
  }
  if (summary.criticalStockIssues > 0) {
    alerts.push({
      id: "quality-critical-stock",
      severity: "high",
      title: "Estoque crítico comprometendo continuidade do cuidado",
      description: `${summary.criticalStockIssues} item(ns) da farmácia estão em ruptura ou abaixo do nível de segurança.`,
      action: "Acionar reposição e revisar prescrição/dispensação dos itens em risco.",
    });
  }

  return alerts;
}

