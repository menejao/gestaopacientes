import { useState } from "react";
import { parseLocalDate } from "../utils/dates";
import { gestationalAgeInfo, ageInMonths, getBaseAgeGroup, matchesPatientSearch } from "../utils/clinical";
import { initials, fmtDate } from "../utils/formatting";
import { VACCINE_OPTIONS } from "../config/constants";
import PageHero from "../components/layout/PageHero";

const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

// Cada entrada: { id, name, doses, ageGroup, ageMinMonths, ageMaxMonths, aliases, note? }
// ageMinMonths/ageMaxMonths = janela de indicação. null = sem limite superior.
const PNI_CALENDAR = [
  // ─────────────────────────────────────────────────────────────────
  // CRIANÇA — cada entrada = uma dose em uma janela de idade específica
  // windowMin/windowMax = faixa de meses em que ESSA dose deve ser aplicada
  // (usado para checar se a aplicação registrada pertence a esta janela)
  // ─────────────────────────────────────────────────────────────────

  // Ao nascer (0–1m)
  { id:"bcg",         name:"BCG",               doseLabel:"Ao nascer",      ageGroup:"Criança", ageMinMonths:0,  ageMaxMonths:1,   windowMin:0,  windowMax:1,  aliases:["bcg"] },
  { id:"hepb-rn",     name:"Hepatite B",         doseLabel:"Ao nascer",      ageGroup:"Criança", ageMinMonths:0,  ageMaxMonths:1,   windowMin:0,  windowMax:1,  aliases:["hepatite b","hepb"] },

  // 2 meses
  { id:"penta-1",     name:"Pentavalente D1",    doseLabel:"D1 (2m)",        ageGroup:"Criança", ageMinMonths:2,  ageMaxMonths:3,   windowMin:2,  windowMax:3,  aliases:["penta","pentavalente","dtp"] },
  { id:"vip-1",       name:"Polio (VIP) D1",     doseLabel:"D1 (2m)",        ageGroup:"Criança", ageMinMonths:2,  ageMaxMonths:3,   windowMin:2,  windowMax:3,  aliases:["vip","polio inativada","poliomielite","polio"] },
  { id:"pneumo-1",    name:"Pneumo 10 D1",        doseLabel:"D1 (2m)",        ageGroup:"Criança", ageMinMonths:2,  ageMaxMonths:3,   windowMin:2,  windowMax:3,  aliases:["pneumo 10","pneumococica 10","pneumo10","pneumococica"] },
  { id:"rota-1",      name:"Rotavírus D1",        doseLabel:"D1 (2m)",        ageGroup:"Criança", ageMinMonths:2,  ageMaxMonths:3,   windowMin:2,  windowMax:3,  aliases:["rota","rotavirus","vorh"] },

  // 3 meses
  { id:"meningo-1",   name:"Meningocócica C D1",  doseLabel:"D1 (3m)",        ageGroup:"Criança", ageMinMonths:3,  ageMaxMonths:4,   windowMin:3,  windowMax:4,  aliases:["meningo","meningococica c","meningococica"] },

  // 4 meses
  { id:"penta-2",     name:"Pentavalente D2",    doseLabel:"D2 (4m)",        ageGroup:"Criança", ageMinMonths:4,  ageMaxMonths:5,   windowMin:4,  windowMax:5,  aliases:["penta","pentavalente","dtp"] },
  { id:"vip-2",       name:"Polio (VIP) D2",     doseLabel:"D2 (4m)",        ageGroup:"Criança", ageMinMonths:4,  ageMaxMonths:5,   windowMin:4,  windowMax:5,  aliases:["vip","polio inativada","poliomielite","polio"] },
  { id:"pneumo-2",    name:"Pneumo 10 D2",        doseLabel:"D2 (4m)",        ageGroup:"Criança", ageMinMonths:4,  ageMaxMonths:5,   windowMin:4,  windowMax:5,  aliases:["pneumo 10","pneumococica 10","pneumo10","pneumococica"] },
  { id:"rota-2",      name:"Rotavírus D2",        doseLabel:"D2 (4m)",        ageGroup:"Criança", ageMinMonths:4,  ageMaxMonths:5,   windowMin:4,  windowMax:5,  aliases:["rota","rotavirus","vorh"] },

  // 5 meses
  { id:"meningo-2",   name:"Meningocócica C D2",  doseLabel:"D2 (5m)",        ageGroup:"Criança", ageMinMonths:5,  ageMaxMonths:6,   windowMin:5,  windowMax:6,  aliases:["meningo","meningococica c","meningococica"] },

  // 6 meses
  { id:"penta-3",     name:"Pentavalente D3",    doseLabel:"D3 (6m)",        ageGroup:"Criança", ageMinMonths:6,  ageMaxMonths:7,   windowMin:6,  windowMax:7,  aliases:["penta","pentavalente","dtp"] },
  { id:"vip-3",       name:"Polio (VIP) D3",     doseLabel:"D3 (6m)",        ageGroup:"Criança", ageMinMonths:6,  ageMaxMonths:7,   windowMin:6,  windowMax:7,  aliases:["vip","polio inativada","poliomielite","polio"] },
  { id:"influenza-1", name:"Influenza D1",        doseLabel:"D1 (6m)",        ageGroup:"Criança", ageMinMonths:6,  ageMaxMonths:7,   windowMin:6,  windowMax:7,  aliases:["influenza","gripe"] },
  { id:"covid-1",     name:"COVID-19 D1",         doseLabel:"D1 (6m)",        ageGroup:"Criança", ageMinMonths:6,  ageMaxMonths:7,   windowMin:6,  windowMax:7,  aliases:["covid","covid-19","pfizer baby"] },

  // 7 meses
  { id:"covid-2",     name:"COVID-19 D2",         doseLabel:"D2 (7m)",        ageGroup:"Criança", ageMinMonths:7,  ageMaxMonths:8,   windowMin:7,  windowMax:8,  aliases:["covid","covid-19","pfizer baby"] },

  // 9 meses
  { id:"covid-3",     name:"COVID-19 D3",         doseLabel:"D3 (9m)",        ageGroup:"Criança", ageMinMonths:9,  ageMaxMonths:10,  windowMin:9,  windowMax:10, aliases:["covid","covid-19","pfizer baby"] },
  { id:"fa-1",        name:"Febre Amarela D1",    doseLabel:"D1 (9m)",        ageGroup:"Criança", ageMinMonths:9,  ageMaxMonths:10,  windowMin:9,  windowMax:10, aliases:["febre amarela"] },

  // 12 meses
  { id:"pneumo-ref",  name:"Pneumo 10 Reforço",   doseLabel:"Reforço (12m)",  ageGroup:"Criança", ageMinMonths:12, ageMaxMonths:13,  windowMin:12, windowMax:13, aliases:["pneumo 10","pneumococica 10","pneumo10","pneumococica"] },
  { id:"meningo-acwy",name:"Meningocócica ACWY",  doseLabel:"Reforço (12m)",  ageGroup:"Criança", ageMinMonths:12, ageMaxMonths:13,  windowMin:12, windowMax:13, aliases:["acwy","meningococica acwy"] },
  { id:"scr-1",       name:"Tríplice Viral D1",   doseLabel:"D1 (12m)",       ageGroup:"Criança", ageMinMonths:12, ageMaxMonths:13,  windowMin:12, windowMax:13, aliases:["triplice viral","src","scr","sarampo caxumba rubeola"] },

  // 15 meses
  { id:"dtp-1r",      name:"DTP 1º Reforço",      doseLabel:"1º Ref (15m)",   ageGroup:"Criança", ageMinMonths:15, ageMaxMonths:18,  windowMin:15, windowMax:18, aliases:["dtp","triple bacteriana"] },
  { id:"vip-ref",     name:"Polio (VIP) Reforço", doseLabel:"Reforço (15m)",  ageGroup:"Criança", ageMinMonths:15, ageMaxMonths:18,  windowMin:15, windowMax:18, aliases:["vip","polio inativada","poliomielite","polio"] },
  { id:"scrv",        name:"Tríplice Viral D2",    doseLabel:"D2 (15m)",       ageGroup:"Criança", ageMinMonths:15, ageMaxMonths:18,  windowMin:15, windowMax:18, aliases:["triplice viral","src","scr","sarampo caxumba rubeola","tetra viral","scrv"] },
  { id:"varicela-1",  name:"Varicela D1",          doseLabel:"D1 (15m)",       ageGroup:"Criança", ageMinMonths:15, ageMaxMonths:18,  windowMin:15, windowMax:18, aliases:["varicela","catapora"] },
  { id:"hepa-c",      name:"Hepatite A",           doseLabel:"Dose única (15m)",ageGroup:"Criança", ageMinMonths:15, ageMaxMonths:18,  windowMin:15, windowMax:18, aliases:["hepatite a","hepa"] },

  // 4 anos
  { id:"dtp-2r",      name:"DTP 2º Reforço",      doseLabel:"2º Ref (4a)",    ageGroup:"Criança", ageMinMonths:48, ageMaxMonths:60,  windowMin:48, windowMax:60, aliases:["dtp reforco","dtp 2","triple bacteriana","dtp"] },
  { id:"varicela-2",  name:"Varicela D2",          doseLabel:"D2 (4a)",        ageGroup:"Criança", ageMinMonths:48, ageMaxMonths:60,  windowMin:48, windowMax:60, aliases:["varicela","catapora"] },

  // ── ADOLESCENTE (9–19 anos)
  { id:"hpv",              name:"HPV Quadrivalente",    doseLabel:"Dose única (9–14a)", ageGroup:"Adolescente", ageMinMonths:108, ageMaxMonths:180, windowMin:108, windowMax:180, aliases:["hpv","papilomavirus"] },
  { id:"meningo-acwy-adol",name:"Meningocócica ACWY",   doseLabel:"Dose única (11–14a)",ageGroup:"Adolescente", ageMinMonths:132, ageMaxMonths:168, windowMin:132, windowMax:168, aliases:["acwy","meningococica acwy"] },

  // ── ADULTO (20–59 anos)
  { id:"hepb-a",  name:"Hepatite B",        doseLabel:"3 doses",              ageGroup:"Adulto",  ageMinMonths:240, ageMaxMonths:719, windowMin:240, windowMax:719, aliases:["hepatite b","hepb"] },
  { id:"dt-a",    name:"Dupla Adulto (dT)", doseLabel:"3 doses ou reforço",   ageGroup:"Adulto",  ageMinMonths:240, ageMaxMonths:719, windowMin:240, windowMax:719, aliases:["dt","dupla adulto","difteria tetano"] },
  { id:"fa-a",    name:"Febre Amarela",     doseLabel:"Dose única",           ageGroup:"Adulto",  ageMinMonths:240, ageMaxMonths:719, windowMin:240, windowMax:719, aliases:["febre amarela"] },
  { id:"scr-a",   name:"Tríplice Viral",    doseLabel:"2 doses/1 dose",       ageGroup:"Adulto",  ageMinMonths:240, ageMaxMonths:719, windowMin:240, windowMax:719, aliases:["triplice viral","scr","src"] },

  // ── GESTANTE
  { id:"hepb-g",     name:"Hepatite B",  doseLabel:"3 doses",   ageGroup:"Gestante", ageMinMonths:0, ageMaxMonths:999, windowMin:0, windowMax:999, aliases:["hepatite b","hepb"] },
  { id:"dt-g",       name:"dT / dTpa",   doseLabel:"Reforço",   ageGroup:"Gestante", ageMinMonths:0, ageMaxMonths:999, windowMin:0, windowMax:999, aliases:["dt","dtpa","difteria tetano","dTpa"] },
  { id:"influenza-g",name:"Influenza",   doseLabel:"1/gestação",ageGroup:"Gestante", ageMinMonths:0, ageMaxMonths:999, windowMin:0, windowMax:999, aliases:["influenza","gripe"] },
  { id:"covid-g",    name:"COVID-19",    doseLabel:"1/gestação",ageGroup:"Gestante", ageMinMonths:0, ageMaxMonths:999, windowMin:0, windowMax:999, aliases:["covid","covid-19"] },

  // ── IDOSO (60+)
  { id:"hepb-i",     name:"Hepatite B",        doseLabel:"3 doses",     ageGroup:"Idoso", ageMinMonths:720, ageMaxMonths:null, windowMin:720, windowMax:9999, aliases:["hepatite b","hepb"] },
  { id:"dt-i",       name:"Dupla Adulto (dT)", doseLabel:"Reforço",     ageGroup:"Idoso", ageMinMonths:720, ageMaxMonths:null, windowMin:720, windowMax:9999, aliases:["dt","dupla adulto","difteria tetano"] },
  { id:"influenza-i",name:"Influenza",         doseLabel:"1 dose anual",ageGroup:"Idoso", ageMinMonths:720, ageMaxMonths:null, windowMin:720, windowMax:9999, aliases:["influenza","gripe"] },
  { id:"covid-i",    name:"COVID-19",           doseLabel:"Reforços",    ageGroup:"Idoso", ageMinMonths:720, ageMaxMonths:null, windowMin:720, windowMax:9999, aliases:["covid","covid-19"] },
];

const AGE_GROUP_ORDER = ["Criança","Adolescente","Adulto","Gestante","Idoso"];
const AGE_GROUP_COLOR = {
  "Criança":    { bg:"var(--blue-50)", border:"var(--blue-200)", text:"var(--blue-700)" },
  "Adolescente":{ bg:"var(--green-50)", border:"var(--green-200)", text:"var(--green-700)" },
  "Adulto":     { bg:"var(--purple-50)", border:"var(--purple-200)", text:"var(--purple-800)" },
  "Gestante":   { bg:"var(--rose-50)", border:"var(--rose-200)", text:"var(--rose-700)" },
  "Idoso":      { bg:"var(--orange-50)", border:"var(--orange-200)", text:"var(--orange-700)" },
};


// Condition-based extra group (returns null if none)
function getConditionGroup(careCategory) {
  const c = String(careCategory||"").toLowerCase();
  if (c === "pregnant") return "Gestante";
  return null;
}

// For list badge: primary group label
function getAgeGroup(ageMonths, careCategory) {
  const cond = getConditionGroup(careCategory);
  if (cond) return cond;
  return getBaseAgeGroup(ageMonths);
}

// ALL vaccines the person should receive throughout life based on age trajectory
// Shows the full calendar up to their age group, plus any future groups that apply
function getAllLifetimeVaccines(ageMonths) {
  const base = getBaseAgeGroup(ageMonths);
  const order = ["Criança","Adolescente","Adulto","Idoso"];
  const idx = order.indexOf(base);
  const groupsToShow = [];
  for (let i = 0; i <= idx; i++) groupsToShow.push(order[i]);
  // Full trajectory calendar — all doses they'll ever need
  return PNI_CALENDAR.filter(v =>
    groupsToShow.includes(v.ageGroup) &&
    v.ageGroup !== "Gestante"
  );
}

// Vaccines specific to a condition (Gestante, etc)
function getConditionVaccines(careCategory) {
  const cond = getConditionGroup(careCategory);
  if (!cond) return [];
  return PNI_CALENDAR.filter(v => v.ageGroup === cond);
}

function getIndicatedVaccines(ageMonths, ageGroup) {
  return PNI_CALENDAR.filter(v => {
    if (v.ageGroup !== ageGroup) return false;
    if (ageMonths === null) return true;
    if (ageMonths < v.ageMinMonths) return false;
    if (v.ageMaxMonths !== null && ageMonths > v.ageMaxMonths + 12) return false;
    return true;
  });
}

function vaccineApplied(vaccine, appliedList, birthDate) {
  // Normalise text for matching
  const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g," ").replace(/\s+/g," ").trim();

  return appliedList.some(a => {
    // Must match by alias name
    const nameMatch = vaccine.aliases.some(alias => norm(a.title).includes(norm(alias)));
    if (!nameMatch) return false;

    // For non-child groups (or no birthDate), name match is enough
    if (vaccine.ageGroup !== "Criança" || !birthDate || !a.date) return true;

    // For children: check that the application date falls within this dose's window
    const birth = parseLocalDate(birthDate);
    const applied = parseLocalDate(a.date);
    if (isNaN(birth.getTime()) || isNaN(applied.getTime())) return true;

    const appliedAgeMonths = (applied - birth) / (1000 * 60 * 60 * 24 * 30.44);
    const wMin = vaccine.windowMin ?? 0;
    const wMax = vaccine.windowMax ?? 9999;

    // Allow 1 month tolerance on each side for flexibility
    return appliedAgeMonths >= (wMin - 1) && appliedAgeMonths <= (wMax + 1);
  });
}


/**
 * Dado um nome genérico de vacina (ex: "Penta"), a data de aplicação e a data de
 * nascimento do paciente, retorna o título correto com a dose inferida pelo PNI_CALENDAR.
 * Ex: "Penta" aplicada aos 4m → "Pentavalente D2 (4m)"
 * Se não conseguir inferir, retorna o nome original.
 */
function inferVaccineDoseTitle(genericName, applicationDate, birthDate) {
  const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g," ").replace(/\s+/g," ").trim();
  const normName = norm(genericName);

  if (!applicationDate || !birthDate) return genericName;
  const birth = parseLocalDate(birthDate);
  const applied = parseLocalDate(applicationDate);
  if (isNaN(birth.getTime()) || isNaN(applied.getTime())) return genericName;

  const appliedAgeMonths = (applied - birth) / (1000 * 60 * 60 * 24 * 30.44);

  // Procura no PNI_CALENDAR a entrada que melhor casa com o nome + janela de idade
  const candidates = PNI_CALENDAR.filter(v =>
    v.ageGroup === "Criança" &&
    v.aliases.some(alias => normName.includes(norm(alias)) || norm(alias).includes(normName)) &&
    appliedAgeMonths >= (v.windowMin - 1) &&
    appliedAgeMonths <= ((v.windowMax ?? 9999) + 1)
  );

  if (!candidates.length) return genericName;

  // Preferir o candidato cuja janela é mais próxima da idade de aplicação
    candidates.sort((a, b) => {
      const midA = (a.windowMin + (a.windowMax ?? a.windowMin)) / 2;
      const midB = (b.windowMin + (b.windowMax ?? b.windowMin)) / 2;
    return Math.abs(appliedAgeMonths - midA) - Math.abs(appliedAgeMonths - midB);
  });

  const best = candidates[0];
  return `${best.name} — ${best.doseLabel}`;
}

/* ── VACCINES PAGE ─────────────────────────────────────────────── */
// ── Calendário vacinal do Indicador — Equipe Rosa ────────────────
// Apenas as vacinas que compõem o indicador de cobertura vacinal da equipe.
// IDs devem corresponder aos IDs do PNI_CALENDAR.
const ROSA_INDICATOR_IDS = new Set([
  "bcg", "hepb-rn",                          // Ao nascer
  "penta-1","vip-1","rota-1","pneumo-1",      // 2 meses
  "meningo-1",                                // 3 meses
  "penta-2","vip-2","rota-2","pneumo-2",      // 4 meses
  "meningo-2",                                // 5 meses
  "penta-3","vip-3",                          // 6 meses
  "fa-1",                                     // 9 meses
  "pneumo-ref","scr-1",                       // 12 meses
  "dtp-1r","vip-ref","scrv",                  // 15 meses
]);

function getRosaIndicatorVaccines() {
  return PNI_CALENDAR.filter(v => ROSA_INDICATOR_IDS.has(v.id));
}

// Gestante Rosa: apenas dTpa a partir da 20ª semana (≥ 20 semanas de IG)
// Retorna a entrada do PNI_CALENDAR correspondente à dTpa, ou [] se < 20s
function getRosaGestanteVaccines(gestWeeks) {
  if (gestWeeks === null || gestWeeks < 20) return [];
  return PNI_CALENDAR.filter(v => v.id === "dt-g"); // dT/dTpa gestante
}

function getRosaIdosoVaccines() {
  return PNI_CALENDAR.filter(v => v.id === "influenza-i");
}

function getRosaHpvVaccines(ageMonths, sex) {
  // HPV apenas para meninas/feminino de 9–14 anos (108–168 meses)
  const isFemale = String(sex||"").toLowerCase().includes("f");
  if (!isFemale || ageMonths < 108 || ageMonths > 168) return [];
  return PNI_CALENDAR.filter(v => v.id === "hpv");
}

function VaccinesPage({ patients, users, templates, token, canManageUser, user }) {
  const [search, setSearch]       = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [card, setCard]           = useState(null);
  const [applying, setApplying]   = useState(false);
  const [applyForm, setApplyForm] = useState({ vaccine:"", date:"", appliedBy:"", details:"" });
  const [applyError, setApplyError] = useState("");
  const [applyBusy, setApplyBusy]   = useState(false);

  const authHeader = { "Authorization": `Bearer ${token}` };

  const selectedPatient = patients.find(p => p.id === selectedId) || null;

  async function openPatient(p) {
    if (selectedId === p.id) { setSelectedId(null); setCard(null); return; }
    setSelectedId(p.id);
    setCard({ history:[], loading:true });
    setApplying(false);
    setApplyError("");
    setApplyForm({ vaccine:"", date:"", appliedBy:"", details:"" });
    try {
      const res = await fetch(`/patients/${p.id}/history`, { headers: authHeader });
      const data = res.ok ? await res.json() : [];
      setCard({ history: Array.isArray(data) ? data : [], loading:false });
    } catch { setCard({ history:[], loading:false }); }
  }

  async function submitApply(e) {
    e.preventDefault();
    if (!applyForm.vaccine || !applyForm.date) { setApplyError("Vacina e data são obrigatórios."); return; }
    setApplyBusy(true); setApplyError("");
    try {
      const detailsParts = [
        applyForm.appliedBy ? `Aplicado por: ${applyForm.appliedBy}` : "",
        applyForm.details,
      ].filter(Boolean);
      const res = await fetch(`/patients/${selectedId}/records`, {
        method:"POST",
        headers:{ ...authHeader, "Content-Type":"application/json" },
        body: JSON.stringify({ type:"vaccine", title:applyForm.vaccine, date:applyForm.date, details:detailsParts.join(" — ") }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Erro ao registrar"); }
      const r2 = await fetch(`/patients/${selectedId}/history`, { headers: authHeader });
      const data2 = r2.ok ? await r2.json() : [];
      setCard({ history: Array.isArray(data2) ? data2 : [], loading:false });
      setApplying(false);
      setApplyForm({ vaccine:"", date:"", appliedBy:"", details:"" });
    } catch(err) { setApplyError(err.message); }
    finally { setApplyBusy(false); }
  }

  const appliedList = (card?.history||[]).filter(h => String(h.type||"").toLowerCase() === "vaccine");

  // Compute full lifetime vaccines + condition vaccines
  const isEquipeRosa = String(user?.teamId||user?.teamName||"").toLowerCase().includes("rosa");

  let ageMonths = null, ageGroup = "Adulto", lifeVaccines = [], condVaccines = [];
  if (selectedPatient) {
    ageMonths = ageInMonths(selectedPatient.birthDate);
    ageGroup  = getAgeGroup(ageMonths, selectedPatient.careCategory);

    if (isEquipeRosa) {
      const cat    = String(selectedPatient.careCategory||"").toLowerCase();
      const isCrianca    = ageMonths !== null && ageMonths < 120;
      const isIdoso      = ageMonths !== null && ageMonths >= 720;
      const isAdolesc    = ageMonths !== null && ageMonths >= 108 && ageMonths < 240;
      const isGestante   = cat === "pregnant";

      if (isGestante) {
        // Gestante: apenas dTpa a partir da 20ª semana
        const gi = gestationalAgeInfo(selectedPatient);
        const gestWeeks = gi ? gi.weeks : null;
        lifeVaccines = getRosaGestanteVaccines(gestWeeks);
        condVaccines = []; // condVaccines normais omitidos no modo indicador
      } else if (isCrianca) {
        lifeVaccines = getRosaIndicatorVaccines();
        condVaccines = [];
      } else if (isIdoso) {
        // Idoso: apenas Influenza
        lifeVaccines = getRosaIdosoVaccines();
        condVaccines = [];
      } else if (isAdolesc) {
        // Adolescente feminino 9–14a: apenas HPV
        lifeVaccines = getRosaHpvVaccines(ageMonths, selectedPatient.sex);
        condVaccines = [];
      } else {
        // Adulto (15–59a) sem indicador específico: calendário completo
        lifeVaccines = getAllLifetimeVaccines(ageMonths);
        condVaccines = getConditionVaccines(selectedPatient.careCategory);
      }
    } else {
      lifeVaccines = getAllLifetimeVaccines(ageMonths);
      condVaccines = getConditionVaccines(selectedPatient.careCategory);
    }
  }
  const lifePending = lifeVaccines.filter(v => !vaccineApplied(v, appliedList, selectedPatient?.birthDate));
  const lifeDone    = lifeVaccines.filter(v =>  vaccineApplied(v, appliedList, selectedPatient?.birthDate));
  const condPending = condVaccines.filter(v => !vaccineApplied(v, appliedList, selectedPatient?.birthDate));
  const condDone    = condVaccines.filter(v =>  vaccineApplied(v, appliedList, selectedPatient?.birthDate));
  const totalPending = lifePending.length + condPending.length;

  // Mensagem especial: gestante Rosa antes das 20 semanas
  const rosaGestantePrecoce = isEquipeRosa &&
    selectedPatient &&
    String(selectedPatient.careCategory||"").toLowerCase() === "pregnant" &&
    lifeVaccines.length === 0;

  const filtered = patients.filter(p => {
    if (!search.trim()) return true;
    return matchesPatientSearch(p, search);
  });

  const gc = AGE_GROUP_COLOR[ageGroup] || AGE_GROUP_COLOR["Adulto"];

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Header */}
      <PageHero
        badge="Calendário Nacional de Vacinação"
        title={
          <span style={{display:"flex",alignItems:"center",gap:".6rem",flexWrap:"wrap"}}>
            Carteira de Vacinas
            {isEquipeRosa&&<span style={{fontSize:".65rem",fontWeight:700,padding:".2rem .6rem",borderRadius:999,background:"#fdf2f8",color:"#9d174d",border:"1px solid #fbcfe8",letterSpacing:".04em"}}>Indicador — Equipe Rosa</span>}
          </span>
        }
        subtitle={isEquipeRosa
          ? "Exibindo vacinas do indicador: crianças (calendário completo do indicador), gestantes (dTpa ≥20s), idosos (Influenza) e meninas 9–14a (HPV)."
          : "Indicações baseadas no Calendário Nacional de Vacinação — Ministério da Saúde."}
        style={{margin:"1.5rem 1.5rem .75rem"}}
      />

      <div style={{display:"flex",gap:"1.25rem",padding:"0 1.5rem 1.5rem",flex:1,alignItems:"flex-start",minHeight:0}}>

        {/* ── Patient list ── */}
        <div style={{flex:"0 0 300px",minWidth:0}}>
          <div className="card" style={{padding:0,overflow:"hidden"}}>
            <div style={{padding:".65rem .85rem",borderBottom:"1px solid var(--border)"}}>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:".6rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)"}}>
                  <IconSearch/>
                </span>
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Buscar paciente..."
                  style={{paddingLeft:"1.8rem",width:"100%",boxSizing:"border-box"}}/>
              </div>
            </div>
            <div style={{maxHeight:"72vh",overflowY:"auto"}}>
              {!filtered.length
                ? <p style={{padding:"1.5rem",textAlign:"center",color:"var(--text-3)",fontSize:".83rem"}}>Nenhum paciente.</p>
                : filtered.map(p => {
                    const isOpen = selectedId === p.id;
                    const am = ageInMonths(p.birthDate);
                    const ag = getAgeGroup(am, p.careCategory);
                    const agc = AGE_GROUP_COLOR[ag] || AGE_GROUP_COLOR["Adulto"];
                    return (
                      <button key={p.id} onClick={()=>openPatient(p)}
                        style={{display:"flex",alignItems:"center",gap:".5rem",width:"100%",
                          padding:".6rem .85rem",background:isOpen?"var(--teal-50)":"transparent",
                          borderBottom:"1px solid var(--border)",border:"none",
                          borderLeft:`3px solid ${isOpen?"var(--teal-500)":"transparent"}`,
                          cursor:"pointer",textAlign:"left",transition:"background .12s",
                          color:"var(--text-1)"}}>
                        <div className="user-avatar" style={{width:32,height:32,fontSize:".78rem",flexShrink:0,
                          background:isOpen?"var(--teal-500)":"var(--slate-200)",
                          color:isOpen?"#fff":"var(--text-2)"}}>
                          {initials(p.name)}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,fontSize:".84rem",color:isOpen?"var(--teal-700)":"var(--ink)",
                            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
                            maxWidth:"100%"}}>{p.name}</div>
                          <div style={{display:"flex",alignItems:"center",gap:".3rem",marginTop:".2rem",flexWrap:"nowrap"}}>
                            <span style={{fontSize:".69rem",padding:".08rem .38rem",borderRadius:999,
                              background:agc.bg,color:agc.text,border:`1px solid ${agc.border}`,fontWeight:600,
                              whiteSpace:"nowrap",flexShrink:0}}>
                              {ag}
                            </span>
                            {am !== null && (
                              <span style={{fontSize:".69rem",color:"var(--text-3)",flexShrink:0}}>
                                {am < 24 ? `${am}m` : `${Math.floor(am/12)}a`}
                              </span>
                            )}
                          </div>
                        </div>
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none"
                          style={{color:isOpen?"var(--teal-500)":"var(--text-3)",flexShrink:0,
                            transform:isOpen?"rotate(90deg)":"none",transition:"transform .15s"}}>
                          <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    );
                  })
              }
            </div>
          </div>
        </div>

        {/* ── Vaccine card ── */}
        <div style={{flex:1,minWidth:0}}>
          {!selectedPatient
            ? (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"5rem 2rem",color:"var(--text-3)",textAlign:"center"}}>
                <svg width="52" height="52" viewBox="0 0 16 16" fill="none" style={{opacity:.2,marginBottom:"1rem"}}>
                  <path d="M10 2l4 4-1.5 1.5-1-1-5 5 1 1L6 14l-4-4 1.5-1.5 1 1 5-5-1-1L10 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  <path d="M2 14l2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <p style={{fontSize:".9rem"}}>Selecione um paciente para ver a carteira de vacinas.</p>
              </div>
            )
            : (
              <div className="card" style={{padding:0,overflow:"hidden"}}>
                {/* Card header */}
                <div style={{padding:"1rem 1.1rem",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:".75rem",flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:".75rem"}}>
                    <div className="user-avatar" style={{width:40,height:40,fontSize:"1rem",flexShrink:0}}>{initials(selectedPatient.name)}</div>
                    <div>
                      <div style={{fontWeight:700,fontSize:".95rem",color:"var(--ink)"}}>{selectedPatient.name}</div>
                      <div style={{display:"flex",alignItems:"center",gap:".5rem",marginTop:".2rem",flexWrap:"wrap"}}>
                        {selectedPatient.birthDate && (
                          <span style={{fontSize:".73rem",color:"var(--text-3)"}}>Nasc. {fmtDate(selectedPatient.birthDate)}</span>
                        )}
                        <span style={{fontSize:".73rem",fontWeight:700,padding:".12rem .45rem",borderRadius:999,
                          background:gc.bg,color:gc.text,border:`1px solid ${gc.border}`}}>
                          {ageGroup}{ageMonths !== null ? ` · ${ageMonths<24?`${ageMonths}m`:`${Math.floor(ageMonths/12)}a`}` : ""}
                        </span>
                        <span style={{fontSize:".73rem",padding:".12rem .45rem",borderRadius:999,
                          background:totalPending?"var(--amber-50)":"var(--green-50)",
                          color:totalPending?"var(--amber-700)":"var(--green-700)",
                          border:totalPending?"1px solid var(--amber-100)":"1px solid #bbf7d0",
                          fontWeight:600}}>
                          {totalPending ? `${totalPending} pendente${totalPending>1?"s":""}` : "Em dia ✓"}
                        </span>
                      </div>
                    </div>
                  </div>
                  {canManageUser && (
                    <button onClick={()=>setApplying(v=>!v)} style={{fontSize:".78rem",padding:".35rem .75rem",flexShrink:0}}>
                      {applying?"Cancelar":"💉 Registrar vacina"}
                    </button>
                  )}
                </div>

                {/* Apply form */}
                {applying && (
                  <div style={{padding:"1rem 1.1rem",borderBottom:"1px solid var(--border)",background:"var(--surface-2)"}}>
                    <p style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)",marginBottom:".6rem"}}>Registrar aplicação</p>
                    <form onSubmit={submitApply}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem",marginBottom:".5rem"}}>
                        <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                          Vacina
                          <select value={applyForm.vaccine} onChange={e=>setApplyForm(s=>({...s,vaccine:e.target.value}))}>
                            <option value="">Selecionar...</option>
                            {/* Pending first, then all */}
                            {lifePending.length > 0 && <optgroup label="── Pendentes (calendário) ──">
                              {lifePending.map(v=><option key={v.id} value={v.name}>{v.name}</option>)}
                            </optgroup>}
                            {condPending.length > 0 && <optgroup label="── Pendentes (condição) ──">
                              {condPending.map(v=><option key={v.id} value={v.name}>{v.name}</option>)}
                            </optgroup>}
                            <optgroup label="── Todas as vacinas ──">
                              {VACCINE_OPTIONS.map(v=><option key={v} value={v}>{v}</option>)}
                            </optgroup>
                          </select>
                        </label>
                        <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                          Data de aplicação
                          <input type="date" value={applyForm.date} onChange={e=>setApplyForm(s=>({...s,date:e.target.value}))}/>
                        </label>
                        <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                          Aplicado por (opcional)
                          <input placeholder="Profissional" value={applyForm.appliedBy} onChange={e=>setApplyForm(s=>({...s,appliedBy:e.target.value}))}/>
                        </label>
                        <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                          Obs. (lote, fabricante...)
                          <input placeholder="Opcional" value={applyForm.details} onChange={e=>setApplyForm(s=>({...s,details:e.target.value}))}/>
                        </label>
                      </div>
                      {applyError && <p className="error" style={{margin:".25rem 0 .4rem"}}>{applyError}</p>}
                      <button type="submit" disabled={applyBusy}>{applyBusy?"Salvando...":"✅ Registrar"}</button>
                    </form>
                  </div>
                )}

                {card?.loading
                  ? <p style={{padding:"2rem",textAlign:"center",color:"var(--text-3)",fontSize:".84rem"}}>Carregando...</p>
                  : (
                    <div style={{padding:"1rem 1.1rem",display:"flex",flexDirection:"column",gap:"1.5rem"}}>

                      {rosaGestantePrecoce && (
                        <div style={{padding:".85rem 1rem",background:"var(--amber-50)",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".82rem",color:"var(--amber-700)",display:"flex",alignItems:"flex-start",gap:".6rem"}}>
                          <span style={{fontSize:"1.1rem",flexShrink:0}}>🤰</span>
                          <div>
                            <div style={{fontWeight:700,marginBottom:".2rem"}}>dTpa — aguardando 20ª semana</div>
                            <div>O indicador da Equipe Rosa prevê apenas a vacina dTpa para gestantes, a partir da 20ª semana de gestação. Registre a IG da paciente para liberar o indicador.</div>
                          </div>
                        </div>
                      )}

                      {!rosaGestantePrecoce && lifeVaccines.length === 0 && condVaccines.length === 0 && (
                        <p style={{color:"var(--text-3)",fontSize:".84rem",textAlign:"center",padding:"1rem 0"}}>
                          {selectedPatient.birthDate
                            ? "Nenhuma vacina indicada no calendário PNI para esta faixa."
                            : "Cadastre a data de nascimento para ver as vacinas indicadas."}
                        </p>
                      )}

                      {/* ── CALENDÁRIO BASE DA VIDA ── */}
                      {lifeVaccines.length > 0 && (()=>{
                        const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g," ").trim();
                        // Group by ageGroup for structured display
                        const groups = ["Criança","Adolescente","Adulto","Idoso"].filter(g =>
                          lifeVaccines.some(v => v.ageGroup === g)
                        );
                        return (
                          <div>
                            <div style={{display:"flex",alignItems:"center",gap:".4rem",marginBottom:".75rem",
                              paddingBottom:".5rem",borderBottom:"1px solid var(--border)"}}>
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                <path d="M10 2l4 4-1.5 1.5-1-1-5 5 1 1L6 14l-4-4 1.5-1.5 1 1 5-5-1-1L10 2z" stroke="var(--teal-600)" strokeWidth="1.3" strokeLinejoin="round"/>
                                <path d="M2 14l2-2" stroke="var(--teal-600)" strokeWidth="1.3" strokeLinecap="round"/>
                              </svg>
                              <span style={{fontWeight:700,fontSize:".82rem",color:"var(--teal-700)"}}>
                                Calendário vacinal
                              </span>
                              <div style={{marginLeft:"auto",display:"flex",gap:".3rem",flexWrap:"wrap",justifyContent:"flex-end"}}>
                                {[["Criança","0–9a","var(--blue-700)","var(--blue-50)","var(--blue-200)"],["Adolescente","10–19a","var(--green-700)","var(--green-50)","var(--green-200)"],["Adulto","20–59a","var(--purple-800)","var(--purple-50)","var(--purple-200)"],["Idoso","60+a","var(--orange-700)","var(--orange-50)","var(--orange-200)"]].map(([label,range,color,bg,border])=>(
                                  <span key={label} style={{fontSize:".65rem",padding:".1rem .4rem",borderRadius:999,background:bg,color,border:`1px solid ${border}`,fontWeight:600,whiteSpace:"nowrap"}}>
                                    {label} <span style={{fontWeight:400,opacity:.8}}>{range}</span>
                                  </span>
                                ))}
                              </div>

                            </div>
                            {groups.map(g => {
                              const gc2 = AGE_GROUP_COLOR[g] || AGE_GROUP_COLOR["Adulto"];
                              const gVaccines = lifeVaccines.filter(v => v.ageGroup === g);
                              return (
                                <div key={g} style={{marginBottom:"1rem"}}>
                                  <div style={{display:"inline-flex",alignItems:"center",gap:".35rem",
                                    fontSize:".71rem",fontWeight:700,padding:".18rem .55rem",borderRadius:999,
                                    background:gc2.bg,color:gc2.text,border:`1px solid ${gc2.border}`,
                                    marginBottom:".45rem",textTransform:"uppercase",letterSpacing:".04em"}}>
                                    {g}
                                    <span style={{fontWeight:400,opacity:.75,fontSize:".65rem"}}>
                                      {g==="Criança"?"0–9a":g==="Adolescente"?"10–19a":g==="Adulto"?"20–59a":g==="Idoso"?"60+a":""}
                                    </span>
                                  </div>
                                  <div style={{display:"flex",flexDirection:"column",gap:".3rem"}}>
                                    {gVaccines.map(v => {
                                      const applied = vaccineApplied(v, appliedList, selectedPatient?.birthDate);
                                      const records = appliedList.filter(a =>
                                        v.aliases.some(alias => norm(a.title).includes(norm(alias)))
                                      ).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
                                      const last = records[0];
                                      const who = last
                                        ? (String(last.details||"").match(/Aplicado por: ([^—\n]+)/)?.[1]?.trim()
                                           || users.find(u=>u.id===last.createdBy)?.name || null)
                                        : null;
                                      return (
                                        <div key={v.id} style={{display:"flex",alignItems:"center",
                                          justifyContent:"space-between",gap:".5rem",
                                          padding:".5rem .75rem",borderRadius:"var(--r-md)",
                                          background:applied?"var(--surface-2)":"var(--amber-50)",
                                          border:`1px solid ${applied?"var(--border)":"var(--amber-100)"}`}}>
                                          <div style={{display:"flex",alignItems:"center",gap:".55rem",minWidth:0}}>
                                            <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,
                                              display:"flex",alignItems:"center",justifyContent:"center",
                                              background:applied?"var(--green-100)":"var(--amber-100)"}}>
                                              {applied
                                                ? <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="var(--green-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                : <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" stroke="var(--amber-600)" strokeWidth="1.5"/><path d="M8 5.5v2.5M8 10v.5" stroke="var(--amber-600)" strokeWidth="1.4" strokeLinecap="round"/></svg>
                                              }
                                            </div>
                                            <div style={{minWidth:0}}>
                                              <div style={{fontWeight:600,fontSize:".82rem",
                                                color:applied?"var(--ink)":"var(--amber-900)"}}>{v.name}</div>
                                              <div style={{fontSize:".7rem",color:applied?"var(--text-3)":"var(--amber-700)"}}>
                                                {v.doseLabel}
                                              </div>
                                            </div>
                                          </div>
                                          {applied && last?.date ? (
                                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:".1rem",flexShrink:0}}>
                                              <span style={{fontSize:".72rem",fontFamily:"IBM Plex Mono",fontWeight:600,
                                                color:"var(--green-700)",background:"var(--green-100)",padding:".1rem .4rem",
                                                borderRadius:999,border:"1px solid #bbf7d0"}}>
                                                {fmtDate(last.date)}
                                              </span>
                                              {who && <span style={{fontSize:".67rem",color:"var(--text-3)"}}>por {who}</span>}
                                            </div>
                                          ) : (
                                            <span style={{fontSize:".69rem",padding:".12rem .4rem",borderRadius:999,
                                              background:"var(--amber-100)",color:"var(--amber-700)",
                                              fontWeight:600,flexShrink:0,border:"1px solid var(--amber-200)"}}>
                                              Não aplicada
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* ── VACINAS POR CONDIÇÃO (gestante, etc) ── */}
                      {condVaccines.length > 0 && (()=>{
                        const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g," ").trim();
                        const condGroup = getConditionGroup(selectedPatient.careCategory);
                        const condColor = AGE_GROUP_COLOR[condGroup] || {bg:"var(--rose-50)",border:"var(--rose-200)",text:"var(--rose-700)"};
                        return (
                          <div style={{paddingTop:".75rem",borderTop:"2px dashed var(--border)"}}>
                            <div style={{display:"flex",alignItems:"center",gap:".5rem",marginBottom:".75rem"}}>
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="6.5" stroke={condColor.text} strokeWidth="1.4"/>
                                <path d="M8 4v4l3 3" stroke={condColor.text} strokeWidth="1.4" strokeLinecap="round"/>
                              </svg>
                              <span style={{fontWeight:700,fontSize:".82rem",color:condColor.text}}>
                                Vacinas indicadas por condição —
                              </span>
                              <span style={{fontSize:".75rem",fontWeight:700,padding:".12rem .5rem",borderRadius:999,
                                background:condColor.bg,color:condColor.text,border:`1px solid ${condColor.border}`}}>
                                {condGroup}
                              </span>
                            </div>
                            <p style={{fontSize:".75rem",color:"var(--text-3)",marginBottom:".6rem",lineHeight:1.5}}>
                              Estas vacinas são indicadas especificamente em razão da condição atual do paciente e não fazem parte do calendário base por idade.
                            </p>
                            <div style={{display:"flex",flexDirection:"column",gap:".3rem"}}>
                              {condVaccines.map(v => {
                                const applied = vaccineApplied(v, appliedList, selectedPatient?.birthDate);
                                const records = appliedList.filter(a =>
                                  v.aliases.some(alias => String(a.title||"").toLowerCase().includes(alias))
                                ).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
                                const last = records[0];
                                const who = last
                                  ? (String(last.details||"").match(/Aplicado por: ([^—\n]+)/)?.[1]?.trim()
                                     || users.find(u=>u.id===last.createdBy)?.name || null)
                                  : null;
                                return (
                                  <div key={v.id} style={{display:"flex",alignItems:"center",
                                    justifyContent:"space-between",gap:".5rem",
                                    padding:".5rem .75rem",borderRadius:"var(--r-md)",
                                    background:applied?"var(--surface-2)":condColor.bg,
                                    border:`1px solid ${applied?"var(--border)":condColor.border}`}}>
                                    <div style={{display:"flex",alignItems:"center",gap:".55rem",minWidth:0}}>
                                      <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,
                                        display:"flex",alignItems:"center",justifyContent:"center",
                                        background:applied?"var(--green-100)":condColor.border}}>
                                        {applied
                                          ? <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="var(--green-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                          : <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" stroke={condColor.text} strokeWidth="1.5"/><path d="M8 5.5v2.5M8 10v.5" stroke={condColor.text} strokeWidth="1.4" strokeLinecap="round"/></svg>
                                        }
                                      </div>
                                      <div style={{minWidth:0}}>
                                        <div style={{fontWeight:600,fontSize:".82rem",color:applied?"var(--ink)":condColor.text}}>{v.name}</div>
                                        <div style={{fontSize:".7rem",color:applied?"var(--text-3)":condColor.text,opacity:.85}}>{v.doseLabel}</div>
                                      </div>
                                    </div>
                                    {applied && last?.date ? (
                                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:".1rem",flexShrink:0}}>
                                        <span style={{fontSize:".72rem",fontFamily:"IBM Plex Mono",fontWeight:600,
                                          color:"var(--green-700)",background:"var(--green-100)",padding:".1rem .4rem",
                                          borderRadius:999,border:"1px solid #bbf7d0"}}>
                                          {fmtDate(last.date)}
                                        </span>
                                        {who && <span style={{fontSize:".67rem",color:"var(--text-3)"}}>por {who}</span>}
                                      </div>
                                    ) : (
                                      <span style={{fontSize:".69rem",padding:".12rem .4rem",borderRadius:999,
                                        background:condColor.border,color:condColor.text,
                                        fontWeight:600,flexShrink:0,border:`1px solid ${condColor.text}22`}}>
                                        Não aplicada
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── OUTRAS APLICAÇÕES (fora do PNI) ── */}
                      {(()=>{
                        const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g," ").trim();
                        const extra = appliedList.filter(a =>
                          !PNI_CALENDAR.some(v => v.aliases.some(alias => norm(a.title).includes(norm(alias))))
                        );
                        if (!extra.length) return null;
                        return (
                          <div style={{paddingTop:".75rem",borderTop:"1px solid var(--border)"}}>
                            <div style={{fontWeight:700,fontSize:".75rem",color:"var(--text-2)",
                              textTransform:"uppercase",letterSpacing:".04em",marginBottom:".5rem"}}>
                              Outras aplicações registradas
                            </div>
                            <div style={{display:"flex",flexDirection:"column",gap:".3rem"}}>
                              {extra.map((a,i)=>(
                                <div key={a.id||i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                                  padding:".45rem .75rem",background:"var(--surface-2)",border:"1px solid var(--border)",
                                  borderRadius:"var(--r-md)"}}>
                                  <span style={{fontSize:".81rem",fontWeight:500,color:"var(--ink)"}}>{a.title}</span>
                                  <span style={{fontSize:".72rem",color:"var(--text-3)",fontFamily:"IBM Plex Mono"}}>{fmtDate(a.date)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                    </div>
                  )
                }
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

export { VaccinesPage as default, inferVaccineDoseTitle, vaccineApplied };
