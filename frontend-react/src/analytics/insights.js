function insight(id, type, title, message, recommendation, priority) {
  return { id, type, title, message, recommendation, priority };
}

export function generateManagementInsights({
  productionMetrics = {},
  careMetrics = {},
  pharmacyMetrics = {},
  registrationMetrics = {},
  qualitySummary = {},
  teamPerformance = [],
} = {}) {
  const insights = [];

  if ((careMetrics.criticalPatients || 0) > 0) {
    insights.push(insight(
      "critical-care-load",
      careMetrics.criticalPatients >= 10 ? "danger" : "warning",
      "Carga crítica assistencial relevante",
      `${careMetrics.criticalPatients} paciente(s) estão em condição crítica ou com alta pendência de seguimento.`,
      "Revisar agenda protegida e busca ativa da equipe multiprofissional para os casos mais graves.",
      1
    ));
  }

  if ((registrationMetrics.incompleteRegistrations || 0) > 0) {
    insights.push(insight(
      "registration-quality-gap",
      registrationMetrics.incompleteRegistrations >= 12 ? "danger" : "warning",
      "Qualidade cadastral abaixo do ideal",
      `${registrationMetrics.incompleteRegistrations} cadastro(s) apresentam inconsistências que reduzem a visibilidade gerencial e a elegibilidade de indicadores.`,
      "Concentrar mutirão de qualificação cadastral com recepção e ACS nas microáreas mais frágeis.",
      2
    ));
  }

  if ((registrationMetrics.unlinkedPatients || 0) > 0) {
    insights.push(insight(
      "acs-linkage-gap",
      registrationMetrics.unlinkedPatients >= 10 ? "warning" : "info",
      "Vínculo territorial incompleto",
      `${registrationMetrics.unlinkedPatients} paciente(s) estão sem ACS vinculado.`,
      "Revisar territorialização e redistribuir os pacientes sem referência comunitária.",
      2
    ));
  }

  if ((pharmacyMetrics.zeroStockItems || 0) > 0 || (pharmacyMetrics.criticalItems || 0) > 0) {
    insights.push(insight(
      "pharmacy-risk",
      pharmacyMetrics.zeroStockItems > 0 ? "danger" : "warning",
      "Risco de descontinuidade na farmácia",
      `${pharmacyMetrics.zeroStockItems || 0} item(ns) estão em ruptura e ${pharmacyMetrics.lowStockItems || 0} estão em estoque baixo.`,
      "Acionar reposição e ajustar dispensação dos itens sensíveis ao cuidado crônico e à agenda programada.",
      1
    ));
  }

  const attendanceRate = Number(productionMetrics.attendanceRate);
  if (Number.isFinite(attendanceRate) && attendanceRate < 75) {
    insights.push(insight(
      "attendance-rate-low",
      "warning",
      "Aproveitamento da agenda abaixo do esperado",
      `A taxa de comparecimento estimada está em ${attendanceRate}%.`,
      "Reforçar confirmação prévia e revisar a proporção entre agenda programada e demanda espontânea.",
      3
    ));
  }

  if ((productionMetrics.spontaneousAppointments || 0) > (productionMetrics.scheduledAppointments || 0)) {
    insights.push(insight(
      "spontaneous-demand-high",
      "warning",
      "Demanda espontânea predominando sobre o programado",
      `Foram identificados mais atendimentos espontâneos do que programados no período analisado.`,
      "Avaliar acolhimento, proteção de agenda e priorização dos grupos acompanhados por protocolo.",
      3
    ));
  }

  if ((qualitySummary.overdueProtocols || 0) > 0) {
    insights.push(insight(
      "overdue-protocols",
      qualitySummary.overdueProtocols >= 10 ? "danger" : "warning",
      "Seguimento populacional com atraso",
      `${qualitySummary.overdueProtocols} paciente(s) apresentam protocolo atrasado ou alerta assistencial ativo.`,
      "Revisar carteiras por equipe e usar busca ativa para gestantes, crianças e crônicos atrasados.",
      1
    ));
  }

  const weakestTeam = [...teamPerformance].sort((a, b) => a.productivityScore - b.productivityScore)[0];
  if (weakestTeam && weakestTeam.status !== "good") {
    insights.push(insight(
      "team-support-needed",
      weakestTeam.status === "attention" ? "warning" : "info",
      "Equipe precisando de suporte gerencial",
      `${weakestTeam.teamName} apresenta menor score de produtividade e ${weakestTeam.criticalPatients} caso(s) crítico(s) na carteira.`,
      "Acompanhar gargalos operacionais da equipe e revisar distribuição de agenda, casos críticos e vínculos territoriais.",
      2
    ));
  }

  if ((registrationMetrics.microAreaCoverage || 0) >= 90 && (qualitySummary.incompletePatients || 0) === 0) {
    insights.push(insight(
      "stable-territory",
      "success",
      "Base territorial consistente",
      "A unidade mantém boa cobertura de microárea e baixa incidência de cadastros incompletos.",
      "Sustentar a rotina de atualização cadastral e concentrar o esforço em seguimento clínico.",
      4
    ));
  }

  return insights.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, "pt-BR"));
}

