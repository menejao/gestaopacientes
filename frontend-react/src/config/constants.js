export const SESSION_KEY      = "saudeubs_react_session";
export const UI_STATE_KEY     = "saudeubs_react_ui";
export const AGENDA_KEY       = "saudeubs_agenda_v1";
export const RECEPTION_KEY    = "saudeubs_reception_v1";
export const AUDIT_KEY        = "saudeubs_audit_v1";
export const AUDIT_MAX        = 5000;
export const QUEUE_KEY        = "saudeubs_queue_v1";
export const REFERRALS_KEY    = "saudeubs_referrals_v1";
export const NOTIFS_KEY       = "saudeubs_notifs_v1";
export const PATIENTS_PAGE_SIZE = 8;

export const VACCINE_OPTIONS = [
  "BCG","Hepatite B","Hepatite A","dTpa","DTP","Penta","VIP",
  "Pneumo 10","Rotavirus","Meningococica","ACWY","Triplice viral",
  "Varicela","Influenza","COVID-19","Febre amarela","HPV",
];

export const RECEPTION_USERS = [
  { id:"rc1", name:"Ana (Administradora)", email:"ana@clinica.local",  role:"receptionist" },
  { id:"rc2", name:"Recepcionista",        email:"recepcao@ubs.local", role:"receptionist" },
];

export const PHARMA_USERS = [
  { id: "ph1", name: "Ana (Administradora)", email: "ana@clinica.local",  role: "pharmacist"    },
  { id: "ph2", name: "Farmacêutico(a)",      email: "farmacia@ubs.local", role: "pharmacist"    },
  { id: "ph3", name: "Téc. de Farmácia",     email: "tecfarma@ubs.local", role: "pharmacy_tech" },
];

export const TRIAGE_VITALS_KEY = "saudeubs_triage_vitals_v1";

export const PRIORITY_LABELS = { urgent:"Urgente", elderly:"Idoso/PCD", pregnant:"Gestante", child:"Criança", normal:"Normal" };
export const PRIORITY_COLORS = {
  urgent:   { bg:"var(--rose-50)",   border:"var(--rose-200)",   text:"var(--rose-700)",   order:0 },
  elderly:  { bg:"var(--orange-50)", border:"var(--orange-200)", text:"var(--orange-700)", order:1 },
  pregnant: { bg:"#fdf4ff",          border:"var(--purple-200)", text:"var(--purple-800)", order:2 },
  child:    { bg:"var(--blue-50)",   border:"var(--blue-200)",   text:"var(--blue-700)",   order:3 },
  normal:   { bg:"var(--surface-2)", border:"var(--border)",     text:"var(--text-2)",     order:4 },
};
