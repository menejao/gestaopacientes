const TENANT_HOSTNAME_MAP = {
  "gestaopacientes.meneguccijao.workers.dev": "ubs",
  "localhost": "ubs",
  "127.0.0.1": "ubs",
};

export function resolveTenantType() {
  const hostname = window.location.hostname;
  if (TENANT_HOSTNAME_MAP[hostname]) return TENANT_HOSTNAME_MAP[hostname];
  const parts = hostname.split(".");
  if (parts.length >= 2 && ["ubs","upa","caps","ceo","amb"].includes(parts[1])) return parts[1];
  return "ubs";
}

export function tenantKey(suffix) {
  return `sigus_${resolveTenantType()}_${suffix}`;
}

export const UBS_CONFIG = {
  type: "ubs", label: "UBS", fullName: "Unidade Básica de Saúde",
  texts: {
    dashboardTitle:       "Gestão à Vista",
    patientListTitle:     "Gestão de Pacientes - UBS",
    pharmacyTitle:        "Farmácia UBS",
    gestorLabel:          "Gestor(a) UBS",
    loginHeroEyebrow:     "Plataforma clínica",
    loginHeroTitle:       "Gestão clínica para atenção básica",
    loginHeroSubtitle:    "Uma plataforma completa para conectar todos os profissionais da unidade e garantir o cuidado contínuo ao paciente.",
    loginStatLabel:       "Atenção básica",
    gestorHeroEyebrow:    "Painel Executivo",
    gestorHeroTitle:      "Indicadores de Gestão à Vista",
    gestorHeroSubtitle:   "Visão executiva completa da UBS — produção, protocolos, equipe e farmácia em um único painel.",
    gestorStatLabel:      "Produção",
    gestorRegisterNote:   "Acesso exclusivo ao painel executivo da UBS.",
    dashboardSubtitle:    "Visão executiva da UBS, atualizada em tempo real com os dados da equipe.",
    auditFilePrefix:      "auditoria_ubs",
    offlineBrand:         "SIGUS · UBS · Offline",
    complianceBadge:      "CFM 1638/2002 · Lei 13.787/2018 · LGPD · ANVISA RDC 20/2011 · PNAB 2.436/2017",
    reportWatermark:      "Este espelho é gerado automaticamente a partir dos dados registrados no SIGUS e serve como referência de apoio para o lançamento no e-SUS APS, RNDS e outros sistemas federais.",
    emailPlaceholderReception: "recepcao@ubs.local",
    emailPlaceholderPharmacy:  "farmacia@ubs.local",
  },
  modules: [
    "dashboard","queue","agenda","triage","patients","exams_page","protocols",
    "chart","referrals","acs_tasks","vaccines","pharmacy","insumos","team",
    "gestor","reports","diagnostics","ai",
  ],
  roles: ["nurse_manager","doctor","dentist","nursing_tech","pharmacist","pharmacy_tech","acs","receptionist","gestor"],
  rules: {
    hasTerritory: true, hasPrenatal: true, hasVaccines: true, hasDentalCare: true,
    hasAcs: true, hasManchester: false, hasMentalHealth: false, hasEmergency: false,
    hasPharmacy: true, hasInsumos: true, hasEsus: true, hasSisab: true,
  },
};

export const TENANT_CONFIGS = { ubs: UBS_CONFIG };
