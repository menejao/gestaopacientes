function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function buildExecutiveSummary({
  productionMetrics = {},
  careMetrics = {},
  pharmacyMetrics = {},
  registrationMetrics = {},
  qualitySummary = {},
} = {}) {
  return [
    {
      id: "production",
      label: "Produção",
      value: (productionMetrics.totalAppointments || 0) + (productionMetrics.totalIndividualRecords || 0),
      sub: `${productionMetrics.scheduledAppointments || 0} programados · ${productionMetrics.spontaneousAppointments || 0} espontâneos`,
      tone: "indigo",
    },
    {
      id: "followup",
      label: "Acompanhamento ativo",
      value: (careMetrics.pregnantPatients || 0) + (careMetrics.childFollowupPatients || 0) + (careMetrics.chronicPatients || 0),
      sub: `${careMetrics.attentionPatients || 0} em atenção`,
      tone: "teal",
    },
    {
      id: "critical",
      label: "Pacientes críticos",
      value: careMetrics.criticalPatients || 0,
      sub: `${qualitySummary.overdueProtocols || 0} com atraso de protocolo`,
      tone: "rose",
    },
    {
      id: "registration",
      label: "Qualidade cadastral",
      value: registrationMetrics.incompleteRegistrations || 0,
      sub: `${registrationMetrics.unlinkedPatients || 0} sem ACS`,
      tone: "amber",
    },
    {
      id: "pharmacy",
      label: "Alertas de farmácia",
      value: pharmacyMetrics.criticalItems || 0,
      sub: `${pharmacyMetrics.zeroStockItems || 0} em ruptura`,
      tone: "purple",
    },
  ];
}

export function buildCsvLikeReport({
  productionMetrics = {},
  careMetrics = {},
  registrationMetrics = {},
  qualitySummary = {},
  teamPerformance = [],
  professionalPerformance = [],
} = {}) {
  return [
    ["secao", "indicador", "valor"],
    ["producao", "total_atendimentos", productionMetrics.totalAppointments || 0],
    ["producao", "agendados", productionMetrics.scheduledAppointments || 0],
    ["producao", "espontaneos", productionMetrics.spontaneousAppointments || 0],
    ["cuidado", "pacientes_criticos", careMetrics.criticalPatients || 0],
    ["cadastro", "cadastros_incompletos", registrationMetrics.incompleteRegistrations || 0],
    ["qualidade", "protocolos_atrasados", qualitySummary.overdueProtocols || 0],
    ...asArray(teamPerformance).map((team) => ["equipe", team.teamName, team.productivityScore]),
    ...asArray(professionalPerformance).map((professional) => ["profissional", professional.name, professional.production]),
  ];
}

export function buildPrintFriendlySummary({
  executiveSummary = [],
  insights = [],
  teamPerformance = [],
} = {}) {
  return {
    title: "Resumo executivo de APS",
    generatedAt: new Date().toISOString(),
    executiveSummary: asArray(executiveSummary),
    insights: asArray(insights).slice(0, 8),
    topTeams: asArray(teamPerformance).slice(0, 5),
  };
}

