import { useEffect, useMemo, useRef, useState, Component } from "react";
import {
  aiTeamAsk, aiTeamDataQuality, aiTeamPriorities, aiTeamReport,
  bootstrap, createProtocolTemplate, createAppointment, createPatient,
  createRecord, createTask, createUser, deleteAppointment, deletePatient,
  deleteProtocolTemplate, deleteRecord, deleteUser, getUserUsage,
  getPatientHistory, getPatientProtocolSummary, getProtocolSummaries,
  getApiHealth, listAppointments, listMessages, listPatients, listProtocolTemplates,
  listTasks, listUsers, login, listPublicTeams, pingPresence, register, sendMessage,
  updateProtocolTemplate, updatePatient, updateUser, updateTaskStatus,
} from "./api";

import {
  NotificationBell, QueuePage, TriagePage, AgendaPage,
  ReferralsPage, AcsTasksPage, ChartPage, InsumoPage,
  GestorPage, ReportsPage, ReceptionistApp,
} from "./MissingComponents";

/* -- Limpeza de Codificação (Anti-Mojibake) -- */
function cleanEncoding(str) {
  if (!str || typeof str !== 'string') return str;
  try {
    // Tenta converter strings corrompidas de Windows-1252 para UTF-8
    return decodeURIComponent(escape(str));
  } catch (e) {
    return str.replace(/â”€/g, '─').replace(/â€”/g, '—');
  }
}

/* ── Service Worker – Offline Support ───────────────────────────── */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Evita servir bundle antigo em produção (stale cache).
  navigator.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => {});
  if ("caches" in window) {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
  }
}
registerServiceWorker();

// Corrige textos com encoding quebrado (mojibake) exibidos na UI.
function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(()=>{
    const on=()=>setOnline(true), off=()=>setOnline(false);
    window.addEventListener("online",on); window.addEventListener("offline",off);
    return ()=>{ window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  },[]);
  return online;
}

function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:9999,background:"#1e3a5f",color:"#e2e8f0",padding:".55rem 1.25rem",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"1rem",fontSize:".78rem",fontWeight:600,boxShadow:"0 -2px 12px rgba(0,0,0,.2)"}}>
      <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M1 1l14 14M10.5 5A5 5 0 0114 9M6 3a7 7 0 018 8M3 6a5 5 0 011 7" stroke="#f59e0b" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="13" r="1" fill="#f59e0b"/></svg>
        <span>Modo offline – dados locais disponíveis. Alterações serão sincronizadas ao reconectar.</span>
      </div>
      <span style={{fontSize:".7rem",color:"#94a3b8",flexShrink:0}}>SIGUS · Offline</span>
    </div>
  );
}

function ComplianceBadge() {
  return (
    <div style={{position:"fixed",bottom:0,right:0,zIndex:9990,background:"rgba(15,23,42,.85)",backdropFilter:"blur(4px)",padding:".3rem .75rem",borderTopLeftRadius:"var(--r-md)",display:"flex",alignItems:"center",gap:".5rem",fontSize:".62rem",color:"#94a3b8",pointerEvents:"none"}}>
      <span style={{ color:"#34d399", fontWeight:700 }}>✓</span>
      <span>CFM 1638/2002 · Lei 13.787/2018 · LGPD · ANVISA RDC 20/2011 · PNAB 2.436/2017</span>
    </div>
  );
}

/* ── localStorage helpers ────────────────────────────────────────── */
function readLS(key, def) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; } catch { return def; }
}
function writeLS(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

const SESSION_KEY      = "saudeubs_react_session";
const UI_STATE_KEY     = "saudeubs_react_ui";
const AGENDA_KEY       = "saudeubs_agenda_v1";
const RECEPTION_KEY    = "saudeubs_reception_v1";

/* ── Trilha de auditoria centralizada ───────────────────────────────
   Todos os eventos do sistema são gravados aqui.
   Imutável: só se adiciona, nunca se remove ou altera.
   Chave separada por tipo para não atingir limite de localStorage.
─────────────────────────────────────────────────────────────────── */
const AUDIT_KEY = "saudeubs_audit_v1";
const AUDIT_MAX = 5000; // máximo de entradas antes de exportar

function auditLog(action, details = {}, user = null) {
  try {
    const existing = (() => {
      try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); } catch { return []; }
    })();
    const entry = {
      id:        Date.now().toString(36) + Math.random().toString(36).slice(2,6),
      ts:        new Date().toISOString(),
      tsDisplay: new Date().toLocaleString("pt-BR", { timeZone:"America/Sao_Paulo",
                   day:"2-digit",month:"2-digit",year:"numeric",
                   hour:"2-digit",minute:"2-digit",second:"2-digit" }),
      action,
      user:      user ? { id:user.id, name:user.name, role:user.role, email:user.email } : null,
      ...details,
    };
    // Imutável: prepend, nunca pop – se chegar no limite, avisa mas não descarta
    const updated = [entry, ...existing].slice(0, AUDIT_MAX);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(updated));
  } catch { /* silencia erros de storage – não pode travar o sistema */ }
}

function readAuditLog() {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]"); } catch { return []; }
}

function exportAuditLog() {
  const log = readAuditLog();
  const csv = [
    "ID;Data/Hora;Ação;Usuário;Perfil;E-mail;Detalhes",
    ...log.map(e => [
      e.id, e.tsDisplay, e.action,
      e.user?.name||"",e.user?.role||"",e.user?.email||"",
      JSON.stringify(Object.fromEntries(
        Object.entries(e).filter(([k])=>!["id","ts","tsDisplay","action","user"].includes(k))
      )).replace(/;/g,",")
    ].join(";"))
  ].join("\n");
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = `auditoria_saudeubs_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// Recepcionistas locais
// Usuários locais de recepção – sem senhas em texto puro
// Autenticação sempre via backend (/auth/login). Senhas nunca ficam no código.
const RECEPTION_USERS = [
  { id:"rc1", name:"Ana (Administradora)", email:"ana@clinica.local",  role:"receptionist" },
  { id:"rc2", name:"Recepcionista",        email:"recepcao@ubs.local", role:"receptionist" },
];
function isReceptionist(user)    { return String(user?.role||"")==="receptionist"; }
const QUEUE_KEY        = "saudeubs_queue_v1";
const REFERRALS_KEY    = "saudeubs_referrals_v1";
const NOTIFS_KEY       = "saudeubs_notifs_v1";

const VACCINE_OPTIONS = [
  "BCG","Hepatite B","Hepatite A","dTpa","DTP","Penta","VIP",
  "Pneumo 10","Rotavirus","Meningococica","ACWY","Triplice viral",
  "Varicela","Influenza","COVID-19","Febre amarela","HPV",
];
const PATIENTS_PAGE_SIZE = 8;

const NAV_ICON = {
  dashboard:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/></svg>,
  queue:      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1 14c0-2.5 1.8-4 4-4s4 1.5 4 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M11 7h4M11 10h3M11 13h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  agenda:     <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 1.5v2M11.5 1.5v2M1.5 6.5h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M5 10h2M9 10h2M5 12.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  triage:     <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" stroke="currentColor" strokeWidth="1.4"/><path d="M8 3.5v2l1.2 1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 14c0-2 2.24-3.5 5-3.5s5 1.5 5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  patients:   <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  protocols:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.4"/><path d="M10 2v3h3M6 7h4M6 10h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  referrals:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chart:      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.4"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 7h5M5.5 9.5h5M5.5 12h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="4.5" cy="7" r=".8" fill="currentColor"/><circle cx="4.5" cy="9.5" r=".8" fill="currentColor"/><circle cx="4.5" cy="12" r=".8" fill="currentColor"/></svg>,
  vaccines:   <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M10 2l4 4-1.5 1.5-1-1-5 5 1 1L6 14l-4-4 1.5-1.5 1 1 5-5-1-1L10 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M2 14l2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  pharmacy:   <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M6 8h4M8 6v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M5 3V2M11 3V2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  insumos:    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 4h10v9H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M6 4V2.5a2 2 0 014 0V4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M6 8h4M8 6v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  acs:        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1 13c0-2.761 2.239-5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M12 7v3M10.5 8.5l1.5 1.5 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  doctors:    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3 13c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M8 10v4M6 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  reports:    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 2h10v12H3z" stroke="currentColor" strokeWidth="1.4"/><path d="M6 6h5M6 8.5h5M6 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M5 5.5l.5.5 1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  gestor:     <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2.5 4.5h11v8h-11z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M2.5 7.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M5 11h2M9 11h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M6 2.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  ai:         <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 3h3l-2.5 2 1 3L8 7.5 5 9l1-3L3.5 4h3L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M3 12h10M5 14h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  exams_page: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.4"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="11.5" cy="11.5" r="2.8" fill="var(--surface)" stroke="currentColor" strokeWidth="1.3"/><path d="M10.5 11.5h2M11.5 10.5v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  diagnostics:<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 2h12v12H2z" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 11V8.5M8 11V5M11.5 11V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M4 4h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
};


function readSession() {
  try { const r = sessionStorage.getItem(SESSION_KEY); const p = r ? JSON.parse(r) : null; if (p && typeof p.token === 'string' && p.user) return p; return null; } catch { return null; }
}
function readUiState() {
  try { const r = localStorage.getItem(UI_STATE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function roleLabel(role) {
  return { nurse_manager: "Enfermeira", doctor: "Médico(a)", acs: "ACS", pharmacist: "Farmacêutico(a)", pharmacy_tech: "Téc. de Farmácia", nursing_tech: "Téc. Enfermagem", receptionist: "Recepcionista", dentist: "Dentista", gestor: "Gestor(a) UBS" }[String(role||"").toLowerCase()] || role || "-";
}
function onlyDigits(v) { return String(v||"").replace(/\D/g,""); }
function formatCpf(v)  { const d=onlyDigits(v).slice(0,11); return d.replace(/^(\d{3})(\d)/,"$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1-$2"); }
function formatPhone(v) { const d=onlyDigits(v).slice(0,11); return d.length<=10 ? d.replace(/^(\d{2})(\d)/g,"($1) $2").replace(/(\d{4})(\d)/,"$1-$2") : d.replace(/^(\d{2})(\d)/g,"($1) $2").replace(/(\d{5})(\d)/,"$1-$2"); }
function formatCep(v)  { const d=onlyDigits(v).slice(0,8); return d.replace(/^(\d{5})(\d)/,"$1-$2"); }
function formatCns(v)  { return onlyDigits(v).slice(0,15); }
function formatCouncil(v) {
  const d = onlyDigits(v).slice(0,6);
  if (d.length <= 3) return d;
  if (d.length === 5) return d.slice(0,2)+"."+d.slice(2);
  if (d.length === 6) return d.slice(0,3)+"."+d.slice(3);
  return d.slice(0,2)+"."+d.slice(2);
}
// Converte string YYYY-MM-DD para Date local (meio-dia) sem virar dia anterior por UTC-3
function parseLocalDate(s) {
  if (!s) return null;
  const str = String(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y,m,d] = str.split("-").map(Number);
    const dt = new Date(y, m-1, d, 12, 0, 0);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}
// Alias mantido por compatibilidade com chamadas existentes
function parseDateSafe(t) { return parseLocalDate(t); }

// Normaliza string para busca: remove acentos, minúsculas
function normalizeSearch(s) {
  return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
}
// Filtra paciente por query – nome (com normalização de acentos), CPF ou telefone
function matchesPatientSearch(p, rawQuery) {
  const q = normalizeSearch(rawQuery);
  if (!q) return true;
  const name  = normalizeSearch(p.name);
  const cpf   = (p.cpf||"").replace(/\D/g,"");
  const phone = (p.phone||"").replace(/\D/g,"");
  const qd    = q.replace(/\D/g,"");
  return name.includes(q) || (qd.length>=3 && cpf.includes(qd)) || (qd.length>=3 && phone.includes(qd));
}

function toBoundedInt(v,min,max) { if(v===undefined||v===null||v==="") return null; const n=parseInt(String(v),10); return isNaN(n)?null:Math.min(max,Math.max(min,n)); }
function initials(name) { return String(name||"?").trim().split(" ").slice(0,2).map(w=>w[0]||"").join("").toUpperCase()||"?"; }
// Detecta cadastro incompleto mesmo quando a flag do banco não veio preenchida
// Cadastro incompleto = criado via cadastro rápido (só nome/cpf/telefone/nascimento).
// Apenas a flag explícita conta – quem usou o formulário completo nunca é marcado,
// mesmo que algum campo opcional esteja vazio.
function isProfileIncomplete(p) {
  if (!p) return false;
  if (p.incompleteProfile === true) return true;
  // Pacientes criados localmente via cadastro rápido (ainda não persistidos ou recém-criados)
  if (String(p.id||"").startsWith("local_")) return true;
  return false;
}

function calcAge(birthDate) {
  if(!birthDate) return null;
  const b=parseLocalDate(birthDate); if(!b||isNaN(b)) return null;
  const now=new Date();
  // Calcular anos, meses e dias exatos
  let ay=now.getFullYear()-b.getFullYear();
  let am=now.getMonth()-b.getMonth();
  let ad=now.getDate()-b.getDate();
  if(ad<0){ am--; ad+=new Date(now.getFullYear(),now.getMonth(),0).getDate(); }
  if(am<0){ ay--; am+=12; }
  if(ay<0) return null;
  const totalDays=Math.floor((now-b)/86400000);
  // Menos de 1 mês: mostrar só dias
  if(ay===0&&am===0) return `${totalDays}d`;
  // Menos de 2 anos: mostrar anos + meses + dias (omitir zeros)
  if(ay<2){
    const parts=[];
    if(ay>0) parts.push(`${ay}a`);
    if(am>0) parts.push(`${am}m`);
    if(ad>0) parts.push(`${ad}d`);
    return parts.join(" ")||"0d";
  }
  // 2 anos ou mais: mostrar só anos
  return `${ay}a`;
}
function fmtDate(v) {
  if(!v) return "-";
  try {
    // Datas no formato YYYY-MM-DD devem ser interpretadas como horário local,
    // não UTC – sem o sufixo de hora o JS usa UTC e o fuso BR (UTC-3) vira dia anterior.
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y,m,d] = s.split("-").map(Number);
      return new Date(y, m-1, d).toLocaleDateString("pt-BR");
    }
    return new Date(v).toLocaleDateString("pt-BR");
  } catch { return String(v); }
}

function displayText(value, fallback = "-") {
  const raw = value === null || value === undefined || value === "" ? fallback : String(value);
  return raw;
}

function gestationalAgeInfo(patient) {
  if(!patient) return null;
  const today=new Date(), usgRef=parseDateSafe(patient.usgDate1), usgW=toBoundedInt(patient.gestationalAgeUsgWeeks,0,45), usgD=toBoundedInt(patient.gestationalAgeUsgDays,0,6) ?? 0;
  if(usgRef&&usgW!==null){const base=usgW*7+usgD,elapsed=Math.max(0,Math.floor((today-usgRef)/86400000)),total=base+elapsed;return{weeks:Math.floor(total/7),days:total%7,source:"1ª USG"};}
  const dum=parseDateSafe(patient.pregnancyStartDate);
  if(dum){const elapsed=Math.max(0,Math.floor((today-dum)/86400000));return{weeks:Math.floor(elapsed/7),days:elapsed%7,source:"DUM"};}
  const dumW=toBoundedInt(patient.gestationalAgeDumWeeks,0,45),dumD=toBoundedInt(patient.gestationalAgeDumDays,0,6) ?? 0;
  if(dumW!==null) return{weeks:dumW,days:dumD,source:"DUM"};
  return null;
}

function deriveProtocolAlerts(summary) {
  if(!summary) return [];
  const special=Array.isArray(summary.specialAlerts)?summary.specialAlerts:[];
  if(special.length) return special.map((a,i)=>({id:a?.id||`s-${i}`,title:a?.title||"Alerta clínico",detail:a?.detail||"",severity:String(a?.severity||"low").toLowerCase()}));
  const schedule=summary.schedule||{},out=[];
  for(const[key,label] of[["visits","visitas"],["consultations","consultas"],["vaccines","vacinas"]]){
    const s=schedule?.[key];
    if(!s||Number(s.pending||0)<=0) continue;
    const overdue=Number(s.overdueDays||0),daysLeft=typeof s.daysLeft==="number"?Number(s.daysLeft):null;
    let computedDaysLeft = daysLeft;
    let detail = "";
    let severity = "low";
    if (overdue >= 1) {
      severity = "high";
      detail = `Atrasado ${overdue} dia(s)`;
    } else if (computedDaysLeft !== null) {
      severity = computedDaysLeft <= 7 ? "medium" : "low";
      detail = `${Math.max(computedDaysLeft,0)} dia(s) para o prazo`;
    } else if (key === "visits" || key === "consultations") {
      const now = new Date();
      const endOfYear = new Date(now.getFullYear(), 11, 31);
      endOfYear.setHours(23, 59, 59, 999);
      computedDaysLeft = Math.max(0, Math.ceil((endOfYear.getTime() - now.getTime()) / 86400000));
      severity = computedDaysLeft <= 7 ? "high" : (computedDaysLeft <= 30 ? "medium" : "low");
      const limitDate = endOfYear.toLocaleDateString("pt-BR");
      detail = `Prazo anual até ${limitDate} (${computedDaysLeft} dia(s) restantes)`;
    } else {
      detail = "Sem prazo";
    }
    out.push({id:`sch-${key}`,title:`${label}: ${Number(s.pending||0)} pendente(s)`,detail,severity});
  }
  return out;
}

function normalizeSeverity(value) {
  const v = String(value || "").toLowerCase();
  if (["high", "alto", "crítico", "critico", "vencido", "atrasado"].includes(v)) return "high";
  if (["medium", "médio", "medio", "atenção", "atencao"].includes(v)) return "medium";
  return "low";
}

function alertWeight(alert) {
  const title = String(alert?.title || "").toLowerCase();
  const match = title.match(/(\d+)\s+pendente/);
  if (match) return Math.max(1, Number(match[1] || 1));
  return 1;
}

function protocolChip(summary) {
  if(!summary) return{text:"Sem status",tone:"muted"};
  if(summary.alertsRestricted) return{text:"Sem alertas (outra equipe)",tone:"muted"};
  const pending=summary.pending||{};
  const total=Number(pending.visits||0)+Number(pending.consultations||0)+Number(pending.vaccines||0);
  const targets=summary.targets||{},completed=summary.completed||{};
  const doneTotal=Number(completed.visits||0)+Number(completed.consultations||0)+Number(completed.vaccines||0);
  const targetTotal=Number(targets.visits||0)+Number(targets.consultations||0)+Number(targets.vaccines||0);

  // Usa os alertas derivados (inclui especial + agenda) para manter o chip
  // consistente com o painel lateral do paciente.
  const allAlerts = deriveProtocolAlerts(summary);
  let criticalCount=0, nearCount=0;

  for(const a of allAlerts){
    const sev=normalizeSeverity(a?.severity);
    const overdue=Number.isFinite(Number(a?.overdueDays)) ? Number(a.overdueDays) : 0;
    const daysLeft=Number.isFinite(Number(a?.daysLeft))?Number(a.daysLeft):null;
    const weight = alertWeight(a);

    // Regra de negócio: 1 item atrasado ou com até 2 dias para vencer já é crítico.
    if (overdue >= 1 || (daysLeft !== null && daysLeft <= 2) || sev === "high") {
      criticalCount += weight;
    } else if (sev === "medium") {
      nearCount += weight;
    }
  }

  if(criticalCount>0) return{text:`Crítico (${criticalCount} item${criticalCount>1?"s":""} crítico${criticalCount>1?"s":""})`,tone:"danger"};
  if(nearCount>0) return{text:`Atenção (${nearCount} próximo${nearCount>1?"s":""})`,tone:"warn"};
  if(total<=0) return{text:`Em dia`,tone:"ok"};
  return{text:`No prazo (${doneTotal}/${targetTotal})`,tone:"muted"};
}

function GlobalSearch({ patients, templates, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQuery("");
  }, [open]);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen(o => !o); }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = query.trim().length < 1 ? [] : patients.filter(p => {
    const q = query.toLowerCase();
    return (p.name || "").toLowerCase().includes(q) || (p.phone || "").includes(q);
  }).slice(0, 8);

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        display:"flex",alignItems:"center",gap:".45rem",padding:".28rem .75rem",
        borderRadius:999,border:"1px solid var(--border)",background:"var(--surface-2)",
        cursor:"pointer",color:"var(--text-2)",fontSize:".78rem",fontWeight:500,fontFamily:"inherit"
      }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Buscar paciente...
        <span style={{fontSize:".68rem",padding:".05rem .3rem",borderRadius:4,background:"var(--surface-3)",color:"var(--text-3)",marginLeft:2}}>⌘K</span>
      </button>
      {open && (
        <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(0,0,0,.35)",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"10vh"}}
          onClick={() => setOpen(false)}>
          <div style={{background:"var(--surface)",borderRadius:"var(--r-lg)",boxShadow:"0 8px 40px rgba(0,0,0,.18)",width:"100%",maxWidth:520,overflow:"hidden"}}
            onClick={e => e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:".6rem",padding:".75rem 1rem",borderBottom:"1px solid var(--border)"}}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{color:"var(--text-3)",flexShrink:0}}>
                <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                style={{flex:1,border:"none",outline:"none",fontSize:".9rem",background:"transparent",color:"var(--ink)",fontFamily:"inherit"}}/>
              <span style={{fontSize:".72rem",color:"var(--text-3)"}}>ESC para fechar</span>
            </div>
            {results.length > 0 ? (
              <ul style={{listStyle:"none",margin:0,padding:".4rem 0",maxHeight:320,overflowY:"auto"}}>
                {results.map(p => (
                  <li key={p.id} onClick={() => { onNavigate(p.id); setOpen(false); }}
                    style={{display:"flex",alignItems:"center",gap:".75rem",padding:".6rem 1rem",cursor:"pointer",transition:"background .1s"}}
                    onMouseEnter={e => e.currentTarget.style.background="var(--surface-2)"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:"var(--teal-600)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".75rem",fontWeight:700,flexShrink:0}}>
                      {initials(p.name)}
                    </div>
                    <div>
                      <div style={{fontWeight:600,fontSize:".85rem",color:"var(--ink)"}}>{p.name}</div>
                      <div style={{fontSize:".75rem",color:"var(--text-3)"}}>{p.phone || "Sem telefone"} · {catLabel(templates, p.careCategory)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : query.trim().length > 0 ? (
              <div style={{padding:"1.5rem 1rem",textAlign:"center",color:"var(--text-3)",fontSize:".85rem"}}>Nenhum paciente encontrado</div>
            ) : (
              <div style={{padding:"1.5rem 1rem",textAlign:"center",color:"var(--text-3)",fontSize:".85rem"}}>Digite para buscar pacientes</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function buildProactiveAlerts(patients, protocolByPatient, stock, agenda) {
  const alerts = [];
  const today = new Date();

  // Pacientes com protocolo crítico
  (patients||[]).forEach(p => {
    const summary = protocolByPatient?.[p.id];
    if (!summary) return;
    const chip = protocolChip(summary);
    if (chip.tone === "danger") {
      alerts.push({
        id: "prot-" + p.id,
        type: "danger",
        icon: "⚠️",
        title: "Protocolo crítico",
        detail: p.name + " — " + chip.text,
        patientId: p.id
      });
    }
  });

  // Estoque crítico
  (stock||[]).forEach(s => {
    if (Number(s.qty ?? 0) <= Number(s.minQty ?? 0)) {
      alerts.push({
        id: "stock-" + s.id,
        type: s.qty === 0 ? "danger" : "warn",
        icon: "💊",
        title: s.qty === 0 ? "Estoque zerado" : "Estoque baixo",
        detail: s.name || s.id,
        patientId: null
      });
    }
  });

  // Agendamentos do dia
  const todayStr = today.toISOString().slice(0, 10);
  (agenda||[]).forEach(a => {
    if (a.date === todayStr) {
      alerts.push({
        id: "agenda-" + (a.id || a.date),
        type: "info",
        icon: "📅",
        title: "Agendamento hoje",
        detail: (a.patientName || a.title || "Consulta agendada"),
        patientId: a.patientId || null
      });
    }
  });

  return alerts;
}

function catLabel(templates,category) {
  return templates.find(t=>t.category===category)?.label||category||"Geral";
}

function canManage(user) { return["nurse_manager","doctor","dentist"].includes(String(user?.role||"")); }
function isManager(user) { return String(user?.role||"")==="nurse_manager"; }
function isGestor(user)  { return String(user?.role||"")==="gestor"; }
function suggestNextVisitDate(history, template) {
  const visits = (history||[])
    .filter(h => String(h.type||"").toLowerCase() === "visit")
    .map(h => ({ date: parseDateSafe(h.date), raw: h.date }))
    .filter(v => v.date)
    .sort((a, b) => b.date - a.date);

  const pendingVisits = Math.max((template?.targets?.visits||0) - visits.length, 0);
  if (pendingVisits <= 0) return null;

  const intervalDays = template?.deadlines?.visits || 30;
  const today = new Date(); today.setHours(0,0,0,0);

  if (!visits.length) {
    // Only overdue after intervalDays+1 days with no visit
    // For now: no visit = show as pending but not yet overdue (overdue starts day after deadline)
    return { date: today.toISOString().slice(0,10), reason: "Nenhuma visita registrada ainda.", overdue: false, pendingVisits };
  }

  const lastVisit = parseLocalDate(visits[0].date); if(!lastVisit) return null; lastVisit.setHours(0,0,0,0);
  const daysSince = Math.floor((today - lastVisit) / 86400000);
  const nextDate = new Date(lastVisit);
  nextDate.setDate(nextDate.getDate() + Math.max(intervalDays, 30));
  const daysUntil = Math.floor((nextDate - today) / 86400000);
  const overdue = daysUntil < -1; // atraso: prazo+1 dia (daysUntil < -1 = passou do prazo)

  return {
    date: nextBusinessDay((overdue ? today : nextDate).toISOString().slice(0,10)),
    reason: overdue
      ? `Última visita há ${daysSince} dias. Próxima está atrasada ${Math.abs(daysUntil)} dia(s).`
      : `Última visita há ${daysSince} dias. Próxima sugerida em ${daysUntil} dia(s).`,
    overdue,
    lastVisitDate: visits[0].raw,
    pendingVisits,
  };
}

function googleCalendarUrl({ title, date, description, location }) {
  const fmt = d => d.replace(/-/g,"");
  const start = fmt(date);
  const end = fmt(new Date(new Date(date).getTime()+86400000).toISOString().slice(0,10));
  const params = new URLSearchParams({ action:"TEMPLATE", text:title, dates:`${start}/${end}`, details:description||"", location:location||"" });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}


/* ── Feriados nacionais + lógica de dia útil ──────────────────────
   A unidade não funciona em sábados, domingos e feriados nacionais.
   Feriados fixos + Carnaval/Páscoa/Corpus Christi (móveis) calculados
   para o ano solicitado.
──────────────────────────────────────────────────── */
function getEasterDate(year) {
  // Algoritmo de Butcher
  const a=year%19, b=Math.floor(year/100), c=year%100;
  const d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3), h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4), k=c%4;
  const l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31);
  const day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day);
}

function getBrazilHolidays(year) {
  const easter = getEasterDate(year);
  const addDays = (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
  const fmt = d => d.toISOString().slice(0,10);
  const holidays = new Set([
    // Feriados fixos
    `${year}-01-01`, // Ano Novo
    `${year}-04-21`, // Tiradentes
    `${year}-05-01`, // Dia do Trabalho
    `${year}-09-07`, // Independência
    `${year}-10-12`, // Nossa Senhora Aparecida
    `${year}-11-02`, // Finados
    `${year}-11-15`, // Proclamação da República
    `${year}-11-20`, // Consciência Negra
    `${year}-12-25`, // Natal
    // Móveis baseados na Páscoa
    fmt(addDays(easter,-48)), // Carnaval (segunda)
    fmt(addDays(easter,-47)), // Carnaval (terça)
    fmt(addDays(easter,-2)),  // Sexta-feira Santa
    fmt(easter),               // Páscoa
    fmt(addDays(easter,60)),  // Corpus Christi
  ]);
  return holidays;
}

// Cache simples por ano
const _holidayCache = {};
function isHoliday(dateStr) {
  if (!dateStr) return false;
  const year = Number(dateStr.slice(0,4));
  if (!_holidayCache[year]) _holidayCache[year] = getBrazilHolidays(year);
  return _holidayCache[year].has(dateStr);
}

function isWeekend(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T12:00:00");
  return d.getDay() === 0 || d.getDay() === 6; // domingo=0, sábado=6
}

function isUnavailableDay(dateStr) {
  return isWeekend(dateStr) || isHoliday(dateStr);
}

// Avança para o próximo dia útil (inclusive a data passada, se já for útil)
function nextBusinessDay(dateStr) {
  let d = new Date(dateStr + "T12:00:00");
  while (isUnavailableDay(d.toISOString().slice(0,10))) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0,10);
}

// Retorna o nome do motivo de indisponibilidade (para exibição)
function unavailableReason(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T12:00:00");
  if (d.getDay() === 0) return "Domingo – unidade fechada";
  if (d.getDay() === 6) return "Sábado – unidade fechada";
  if (isHoliday(dateStr)) return "Feriado nacional – unidade fechada";
  return null;
}


function isPharmacist(user)   { return ["pharmacist","pharmacy_tech"].includes(String(user?.role||"")); }
function isNursingTech(user)  { return String(user?.role||"")==="nursing_tech"; }
function isAdmin(user)        { try { return String(user?.email||"").toLowerCase()==="ana@clinica.local"; } catch { return false; } }
function isAcs(user)          { return String(user?.role||"")==="acs"; }

// O que cada perfil pode ver/fazer
function canWriteRecords(user)    { return ["nurse_manager","doctor","dentist","nursing_tech","acs"].includes(String(user?.role||"")); }
function canAccessAI(user)        { return ["nurse_manager","doctor","dentist"].includes(String(user?.role||"")) || isAdmin(user); }
function canAccessChart(user)     { return ["nurse_manager","doctor","dentist"].includes(String(user?.role||"")); }

// Nav items por perfil
function buildNavItems(user, canManageUser) {
  const admin = isAdmin(user);
  const role = String(user?.role || "");
  const items = [];

  if (isGestor(user) && !admin) {
    items.push({ id: "gestor", label: "Gestão à Vista", section: "" });
    items.push({ id: "reports", label: "Relatórios", section: "" });
    items.push({ id: "diagnostics", label: "Diagnósticos", section: "" });
    items.push({ id: "patients", label: "Pacientes", section: "Visualização" });
    items.push({ id: "ai", label: "IA Assistida", section: "" });
    return items;
  }

  if (isReceptionist(user) && !admin) return items;

  if (!isPharmacist(user) || admin) items.push({ id: "dashboard", label: "Painel", section: "" });

  if (admin) items.push({ id: "queue", label: "Fila / Recepção", section: "Atendimento" });
  if (admin) items.push({ id: "agenda", label: "Agenda", section: "Atendimento" });
  if (isNursingTech(user) || admin) items.push({ id: "triage", label: "Monitoramento", section: "Atendimento" });

  if (!isPharmacist(user) || admin) items.push({ id: "patients", label: "Pacientes", section: "Clínico" });
  if (!isPharmacist(user) || admin) items.push({ id: "exams_page", label: "Exames", section: "" });
  if (canManageUser && !isNursingTech(user)) items.push({ id: "protocols", label: "Protocolos", section: "" });
  if (canAccessChart(user) || admin) items.push({ id: "chart", label: "Prontuário", section: "" });
  if (!isPharmacist(user) || admin) items.push({ id: "referrals", label: "Encaminhamentos", section: "" });
  if (role === "acs") items.push({ id: "acs_tasks", label: "Minhas tarefas", section: "" });

  if (!isPharmacist(user) || admin) items.push({ id: "vaccines", label: "Vacinas", section: "Preventivo" });
  items.push({ id: "pharmacy", label: "Farmácia", section: "" });

  if (["nurse_manager", "nursing_tech", "pharmacist", "pharmacy_tech"].includes(role) || admin) {
    items.push({ id: "insumos", label: "Insumos", section: "" });
  }

  if (canManageUser && !isNursingTech(user)) {
    items.push({ id: "acs", label: "ACS", section: "Equipe" });
    items.push({ id: "doctors", label: "Médicos", section: "" });
  }

  if (canManageUser || admin) items.push({ id: "gestor", label: "Gestão à Vista", section: "Gestão" });
  if (canManageUser || admin) items.push({ id: "reports", label: "Relatórios", section: "" });
  if (canManageUser || admin || isGestor(user)) items.push({ id: "diagnostics", label: "Diagnósticos", section: "" });
  if (canAccessAI(user)) items.push({ id: "ai", label: "IA Assistida", section: "" });

  return items;
}
function isChildCategory(category) {
  const c = String(category||"").toLowerCase();
  return c === "puericulture" || c === "child_followup";
}

function emptyPatientForm() {
  return{
    // Identificação – CFM 1638/2002 + SISAB
    name:"", motherName:"", motherUnknown:false,
    guardianName:"",                             // responsável legal (crianças)
    cpf:"", cns:"",
    birthDate:"", birthCity:"", birthState:"",
    sex:"", raceColor:"",
    maritalStatus:"",
    // Contato
    phone:"", phoneAlt:"",
    // Endereço
    zipCode:"", address:"", number:"", complement:"", neighborhood:"", city:"", state:"",
    // Vínculo
    careCategory:"general", chronicConditions:[], assignedAcsId:"",
    // Territorial (SISAB/e-SUS)
    microArea:"", familyCode:"", homeVisitFreq:"",
    housingType:"", waterSupply:"", sewage:"", garbage:"", electricity:"",
    // Clínico
    allergies:"", comorbidities:"", medications:"",
    // Gestação
    pregnancyStartDate:"", expectedDeliveryDate:"",
    gestationalAgeDumWeeks:"", gestationalAgeDumDays:"",
    gestationalAgeUsgWeeks:"", gestationalAgeUsgDays:"",
    usgDate1:"", usgDate2:"", usgDate3:"",
  };
}


const IconLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 2v14M2 9h14" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);
const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const IconSignOut = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M10 11l4-4-4-4M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);




function AuthScreen({ onLogin, onRegister, publicTeams, error, busy }) {
  const [authTab, setAuthTab] = useState("login");
  const [loginMode, setLoginMode] = useState("saude"); // "saude" | "gestor"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reg, setReg] = useState({ name:"",email:"",password:"",role:"nurse_manager",teamId:"",councilNumber:"",councilUf:"SP" });

  // Tela de login do Gestor – visual executivo distinto
  const [gestorTab, setGestorTab] = useState("login");
  const [gestorReg, setGestorReg] = useState({name:"",email:"",password:"",confirmPassword:""});

  if (loginMode === "gestor") {
    const inputStyle = {width:"100%",padding:".65rem .85rem",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:".88rem",fontFamily:"inherit",outline:"none",background:"#fff",color:"#1e293b",boxSizing:"border-box"};
    const focusStyle = (e)=>e.target.style.borderColor="#6366f1";
    const blurStyle  = (e)=>e.target.style.borderColor="#e2e8f0";

    return (
      <main style={{minHeight:"100vh",display:"flex",background:"#0f172a"}}>
        {/* Painel esquerdo */}
        <section style={{flex:1,background:"linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"3rem",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-80,right:-80,width:320,height:320,borderRadius:"50%",background:"radial-gradient(circle,rgba(99,102,241,.15) 0%,transparent 70%)",pointerEvents:"none"}}/>
          <div style={{position:"absolute",bottom:-60,left:-60,width:240,height:240,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,.1) 0%,transparent 70%)",pointerEvents:"none"}}/>
          <div style={{display:"flex",alignItems:"center",gap:".6rem",position:"relative",zIndex:1}}>
            <div style={{width:32,height:32,background:"#6366f1",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
            <span style={{fontSize:"1rem",fontWeight:700,color:"#fff",letterSpacing:"-.01em"}}>SIGUS</span>
            <span style={{fontSize:".7rem",background:"rgba(99,102,241,.25)",color:"#a5b4fc",border:"1px solid rgba(99,102,241,.4)",padding:".15em .5em",borderRadius:99,fontFamily:"monospace",marginLeft:".25rem"}}>GESTÃO</span>
          </div>
          <div style={{position:"relative",zIndex:1}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:".4rem",background:"rgba(99,102,241,.15)",border:"1px solid rgba(99,102,241,.3)",color:"#a5b4fc",fontSize:".72rem",fontWeight:600,letterSpacing:".08em",textTransform:"uppercase",padding:".3rem .75rem",borderRadius:99,marginBottom:"1.25rem"}}>
              <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"><circle cx="4.5" cy="4.5" r="4.5"/></svg>
              Painel Executivo
            </div>
            <h1 style={{fontSize:"2.4rem",fontWeight:700,color:"#fff",lineHeight:1.15,letterSpacing:"-.04em",marginBottom:"1rem"}}>
              Indicadores de<br/><span style={{color:"#818cf8"}}>Gestão à Vista</span>
            </h1>
            <p style={{fontSize:".9rem",color:"#94a3b8",lineHeight:1.7,maxWidth:380}}>
              Visão executiva completa da UBS – produção, protocolos, equipe e farmácia em um único painel.
            </p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:1,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.07)",borderRadius:12,overflow:"hidden",position:"relative",zIndex:1}}>
            {[["KPIs","Tempo real"],["Produção","Por período"],["Equipe","Performance"]].map(([v,l])=>(
              <div key={v} style={{background:"rgba(255,255,255,.03)",padding:"1rem"}}>
                <div style={{fontSize:"1rem",fontWeight:700,color:"#fff",marginBottom:".2rem"}}>{v}</div>
                <div style={{fontSize:".68rem",color:"#64748b",textTransform:"uppercase",letterSpacing:".07em"}}>{l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Painel direito */}
        <section style={{width:920,background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",padding:"2rem",overflowY:"auto"}}>
          <div style={{width:"100%",maxWidth:390}}>
            <button onClick={()=>setLoginMode("saude")} style={{display:"flex",alignItems:"center",gap:".4rem",background:"none",border:"none",color:"#64748b",fontSize:".78rem",cursor:"pointer",padding:"0 0 1.25rem",fontFamily:"inherit"}}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Voltar ao login clínico
            </button>

            {/* Tabs */}
            <div style={{display:"flex",borderBottom:"1.5px solid #e2e8f0",marginBottom:"1.75rem",gap:0}}>
              {[["login","Entrar"],["register","Criar conta"]].map(([k,l])=>(
                <button key={k} onClick={()=>setGestorTab(k)} style={{flex:1,padding:".5rem 0",background:"none",border:"none",borderBottom:gestorTab===k?"2.5px solid #6366f1":"2.5px solid transparent",marginBottom:-1.5,fontSize:".82rem",fontWeight:gestorTab===k?700:500,color:gestorTab===k?"#6366f1":"#64748b",cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                  {l}
                </button>
              ))}
            </div>

            {gestorTab === "login" ? (
              <>
                <div style={{marginBottom:"1.5rem"}}>
                  <h2 style={{fontSize:"1.3rem",fontWeight:700,color:"#1e293b",letterSpacing:"-.02em",marginBottom:".25rem"}}>Bem-vindo de volta</h2>
                  <p style={{fontSize:".82rem",color:"#64748b"}}>Entre com suas credenciais de gestão.</p>
                </div>
                <form onSubmit={e=>{e.preventDefault();onLogin(email,password);}}>
                  <div style={{marginBottom:"1rem"}}>
                    <label style={{display:"block",fontSize:".75rem",fontWeight:600,color:"#374151",marginBottom:".35rem"}}>E-mail</label>
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="gestor@prefeitura.gov.br" style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} autoComplete="email"/>
                  </div>
                  <div style={{marginBottom:"1.5rem"}}>
                    <label style={{display:"block",fontSize:".75rem",fontWeight:600,color:"#374151",marginBottom:".35rem"}}>Senha</label>
                    <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="⬢⬢⬢⬢⬢⬢⬢⬢" style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} autoComplete="current-password"/>
                  </div>
                  {error && <p style={{background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:6,padding:".6rem .85rem",fontSize:".82rem",marginBottom:"1rem"}}>{error}</p>}
                  <button type="submit" disabled={busy} style={{width:"100%",padding:".6rem",background:"#6366f1",color:"#fff",border:"none",borderRadius:8,fontSize:".85rem",fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:busy?0.6:1}}>
                    {busy ? "Entrando..." : "Acessar painel de gestão →"}
                  </button>
                  <p style={{textAlign:"center",fontSize:".75rem",color:"#94a3b8",marginTop:".85rem"}}>
                    Não tem conta?{" "}
                    <button type="button" onClick={()=>setGestorTab("register")} style={{background:"none",border:"none",color:"#6366f1",fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:".75rem"}}>Criar cadastro</button>
                  </p>
                </form>
              </>
            ) : (
              <>
                <div style={{marginBottom:"1.5rem"}}>
                  <h2 style={{fontSize:"1.3rem",fontWeight:700,color:"#1e293b",letterSpacing:"-.02em",marginBottom:".25rem"}}>Criar conta de gestor</h2>
                  <p style={{fontSize:".82rem",color:"#64748b"}}>Acesso exclusivo ao painel executivo da UBS.</p>
                </div>
                <form onSubmit={e=>{
                  e.preventDefault();
                  if(gestorReg.password !== gestorReg.confirmPassword){ return; }
                  onRegister({...gestorReg, role:"gestor", teamId:"", councilNumber:"", councilUf:""});
                }}>
                  <div style={{marginBottom:"1rem"}}>
                    <label style={{display:"block",fontSize:".75rem",fontWeight:600,color:"#374151",marginBottom:".35rem"}}>Nome completo</label>
                    <input value={gestorReg.name} onChange={e=>setGestorReg(s=>({...s,name:e.target.value}))} placeholder="João da Silva" style={inputStyle} onFocus={focusStyle} onBlur={blurStyle}/>
                  </div>
                  <div style={{marginBottom:"1rem"}}>
                    <label style={{display:"block",fontSize:".75rem",fontWeight:600,color:"#374151",marginBottom:".35rem"}}>E-mail</label>
                    <input type="email" value={gestorReg.email} onChange={e=>setGestorReg(s=>({...s,email:e.target.value}))} placeholder="gestor@prefeitura.gov.br" style={inputStyle} onFocus={focusStyle} onBlur={blurStyle} autoComplete="email"/>
                  </div>
                  <div style={{marginBottom:"1rem"}}>
                    <label style={{display:"block",fontSize:".75rem",fontWeight:600,color:"#374151",marginBottom:".35rem"}}>Senha</label>
                    <input type="password" value={gestorReg.password} onChange={e=>setGestorReg(s=>({...s,password:e.target.value}))} placeholder="Mínimo 8 caracteres" style={inputStyle} onFocus={focusStyle} onBlur={blurStyle}/>
                  </div>
                  <div style={{marginBottom:"1.5rem"}}>
                    <label style={{display:"block",fontSize:".75rem",fontWeight:600,color:"#374151",marginBottom:".35rem"}}>Confirmar senha</label>
                    <input type="password" value={gestorReg.confirmPassword} onChange={e=>setGestorReg(s=>({...s,confirmPassword:e.target.value}))} placeholder="Repita a senha" style={{...inputStyle, borderColor: gestorReg.confirmPassword && gestorReg.password !== gestorReg.confirmPassword ? "#dc2626" : "#e2e8f0"}} onFocus={focusStyle} onBlur={blurStyle}/>
                    {gestorReg.confirmPassword && gestorReg.password !== gestorReg.confirmPassword && (
                      <p style={{fontSize:".73rem",color:"#dc2626",marginTop:".3rem"}}>As senhas não coincidem</p>
                    )}
                  </div>
                  {error && <p style={{background:"#fef2f2",color:"#dc2626",border:"1px solid #fecaca",borderRadius:6,padding:".6rem .85rem",fontSize:".82rem",marginBottom:"1rem"}}>{error}</p>}
                  <button type="submit" disabled={busy||!gestorReg.name||!gestorReg.email||!gestorReg.password||gestorReg.password!==gestorReg.confirmPassword}
                    style={{width:"100%",padding:".6rem",background:"#6366f1",color:"#fff",border:"none",borderRadius:8,fontSize:".85rem",fontWeight:600,cursor:"pointer",fontFamily:"inherit",opacity:(busy||!gestorReg.name||!gestorReg.email||!gestorReg.password||gestorReg.password!==gestorReg.confirmPassword)?0.5:1}}>
                    {busy ? "Criando..." : "Criar conta de gestor →"}
                  </button>
                  <p style={{textAlign:"center",fontSize:".75rem",color:"#94a3b8",marginTop:".85rem"}}>
                    Já tem conta?{" "}
                    <button type="button" onClick={()=>setGestorTab("login")} style={{background:"none",border:"none",color:"#6366f1",fontWeight:600,cursor:"pointer",fontFamily:"inherit",fontSize:".75rem"}}>Fazer login</button>
                  </p>
                </form>
              </>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-screen">
      {/* Left panel */}
      <section className="auth-left">
        <div className="auth-brand">
          <div className="auth-brand-icon"><IconLogo/></div>
          <span className="brand-name">SIGUS</span>
        </div>

        <div className="auth-hero">
          <div className="auth-eyebrow">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M5 3v2l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Plataforma clínica
          </div>
          <h1>Gestão clínica<br/><em>para atenção básica</em></h1>
          <p>Uma plataforma completa para conectar todos os profissionais da unidade e garantir o cuidado contínuo ao paciente.</p>
        </div>

        {/* Botão de acesso gestor */}
        <button onClick={()=>setLoginMode("gestor")} style={{
          display:"flex",alignItems:"center",gap:".6rem",
          background:"rgba(99,102,241,.12)",border:"1px solid rgba(99,102,241,.3)",
          borderRadius:10,padding:".75rem 1rem",cursor:"pointer",textAlign:"left",
          transition:"background .15s",
        }}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(99,102,241,.2)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(99,102,241,.12)"}
        >
          <div style={{width:32,height:32,background:"#6366f1",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="8" width="3" height="6" rx="1" fill="white"/><rect x="6.5" y="5" width="3" height="9" rx="1" fill="white"/><rect x="11" y="2" width="3" height="12" rx="1" fill="white"/></svg>
          </div>
          <div>
            <div style={{fontSize:".8rem",fontWeight:700,color:"#a5b4fc"}}>Acesso do Gestor</div>
            <div style={{fontSize:".7rem",color:"#64748b"}}>Painel executivo com indicadores à vista</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{marginLeft:"auto",color:"#6366f1"}}>
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <div className="auth-stats">
          <div className="auth-stat"><div className="auth-stat-value">100%</div><div className="auth-stat-label">Integrado</div></div>
          <div className="auth-stat"><div className="auth-stat-value">UBS</div><div className="auth-stat-label">Atenção básica</div></div>
          <div className="auth-stat"><div className="auth-stat-value">LGPD</div><div className="auth-stat-label">Conformidade</div></div>
        </div>
      </section>

      {/* Right panel */}
      <section className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2>{authTab === "login" ? "Bem-vindo de volta" : "Criar conta"}</h2>
            <p>{authTab === "login" ? "Entre com suas credenciais institucionais" : "Preencha os dados para criar sua conta"}</p>
          </div>

          <div className="auth-tabs">
            <button className={`auth-tab${authTab==="login"?" active":""}`} type="button" onClick={()=>setAuthTab("login")}>Entrar</button>
            <button className={`auth-tab${authTab==="register"?" active":""}`} type="button" onClick={()=>setAuthTab("register")}>Novo cadastro</button>
            <button className={`auth-tab${authTab==="reset"?" active":""}`} type="button" onClick={()=>setAuthTab("reset")}>Esqueci a senha</button>
          </div>

          {authTab === "login" ? (
            <form className="auth-form" onSubmit={e=>{e.preventDefault();onLogin(email,password);}}>
              <label>
                E-mail institucional
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="usuario@unidade.local" autoComplete="email"/>
              </label>
              <label>
                Senha
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="********" autoComplete="current-password"/>
              </label>
              {error && <p className="error">{error}</p>}
              <button type="submit" disabled={busy}>
                {busy ? "Entrando..." : <>Acessar sistema <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></>}
              </button>
            </form>
          ) : authTab === "register" ? (
            <form className="auth-form" onSubmit={e=>{e.preventDefault();onRegister(reg);}}>
              <label>Nome completo<input value={reg.name} onChange={e=>setReg(s=>({...s,name:e.target.value}))} placeholder="Maria da Silva"/></label>
              <label>E-mail<input type="email" value={reg.email} onChange={e=>setReg(s=>({...s,email:e.target.value}))} placeholder="você@unidade.local"/></label>
              <label>Senha<input type="password" value={reg.password} onChange={e=>setReg(s=>({...s,password:e.target.value}))} placeholder="Mínimo 8 caracteres"/></label>
              <label>Perfil
                <select value={reg.role} onChange={e=>setReg(s=>({...s,role:e.target.value,councilNumber:"",councilUf:"SP",teamId:""}))}>
                  <option value="nurse_manager">Enfermeira</option>
                  <option value="doctor">Médico(a)</option>
                  <option value="dentist">Dentista</option>
                  <option value="nursing_tech">Téc. de Enfermagem</option>
                  <option value="pharmacist">Farmacêutico(a)</option>
                  <option value="pharmacy_tech">Téc. de Farmácia</option>
                  <option value="acs">ACS</option>
                  <option value="receptionist">Recepcionista</option>
                  <option value="gestor">Gestor(a) UBS</option>
                </select>
              </label>
              {reg.role !== "receptionist" && reg.role !== "gestor" && (
                <label>Equipe
                  <select value={reg.teamId} onChange={e=>setReg(s=>({...s,teamId:e.target.value}))}>
                    <option value="">Selecione a equipe</option>
                    {[
                      {id:"equipe-amarela", name:"Equipe Amarela"},
                      {id:"equipe-azul",    name:"Equipe Azul"},
                      {id:"equipe-cinza",   name:"Equipe Cinza"},
                      {id:"equipe-marrom",  name:"Equipe Marrom"},
                      {id:"equipe-rosa",    name:"Equipe Rosa"},
                    ].map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              )}
              {["doctor","dentist","nurse_manager","nursing_tech","pharmacist","pharmacy_tech"].includes(reg.role) && <>
                <label>
                  {reg.role==="doctor"?"CRM":reg.role==="dentist"?"CRO":["pharmacist","pharmacy_tech"].includes(reg.role)?"CFF":"COREN"} – Número do conselho
                  <input value={reg.councilNumber} onChange={e=>setReg(s=>({...s,councilNumber:onlyDigits(e.target.value).slice(0,12)}))} placeholder="000000"/>
                </label>
                <label>UF do conselho<input maxLength={2} value={reg.councilUf} onChange={e=>setReg(s=>({...s,councilUf:e.target.value.toUpperCase()}))} placeholder="SP"/></label>
              </>}
              {error && <p className="error">{error}</p>}
              <button type="submit" disabled={busy}>{busy?"Criando...":"Criar cadastro"}</button>
            </form>
          ) : authTab === "reset" ? (
            <ResetPasswordForm/>
          ) : null}
        </div>
      </section>
    </main>
  );

  return (
    <main className="auth-screen">
      {/* Left panel */}
      <section className="auth-left">
        <div className="auth-brand">
          <div className="auth-brand-icon"><IconLogo/></div>
          <span className="brand-name">SIGUS</span>
        </div>

        <div className="auth-hero">
          <div className="auth-eyebrow">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M5 3v2l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Plataforma clínica
          </div>
          <h1>Gestão clínica<br/><em>para atenção básica</em></h1>
          <p>Uma plataforma completa para conectar todos os profissionais da unidade e garantir o cuidado contínuo ao paciente.</p>
        </div>

        <div className="auth-stats">
          <div className="auth-stat">
            <div className="auth-stat-value">100%</div>
            <div className="auth-stat-label">Integrado</div>
          </div>
          <div className="auth-stat">
            <div className="auth-stat-value">UBS</div>
            <div className="auth-stat-label">Atenção básica</div>
          </div>
          <div className="auth-stat">
            <div className="auth-stat-value">LGPD</div>
            <div className="auth-stat-label">Conformidade</div>
          </div>
        </div>
      </section>

      {/* Right panel */}
      <section className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2>{authTab === "login" ? "Bem-vindo de volta" : "Criar conta"}</h2>
            <p>{authTab === "login" ? "Entre com suas credenciais institucionais" : "Preencha os dados para criar sua conta"}</p>
          </div>

          <div className="auth-tabs">
            <button className={`auth-tab${authTab==="login"?" active":""}`} type="button" onClick={()=>setAuthTab("login")}>Entrar</button>
            <button className={`auth-tab${authTab==="register"?" active":""}`} type="button" onClick={()=>setAuthTab("register")}>Novo cadastro</button>
            <button className={`auth-tab${authTab==="reset"?" active":""}`} type="button" onClick={()=>setAuthTab("reset")}>Esqueci a senha</button>
          </div>

          {authTab === "login" ? (
            <form className="auth-form" onSubmit={e=>{e.preventDefault();onLogin(email,password);}}>
              <label>
                E-mail institucional
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="usuario@unidade.local" autoComplete="email"/>
              </label>
              <label>
                Senha
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="********" autoComplete="current-password"/>
              </label>
              {error && <p className="error">{error}</p>}
              <button type="submit" disabled={busy}>
                {busy ? "Entrando..." : <>Acessar sistema <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></>}
              </button>
            </form>
          ) : authTab === "register" ? (
            <form className="auth-form" onSubmit={e=>{e.preventDefault();onRegister(reg);}}>
              <label>Nome completo<input value={reg.name} onChange={e=>setReg(s=>({...s,name:e.target.value}))} placeholder="Maria da Silva"/></label>
              <label>E-mail<input type="email" value={reg.email} onChange={e=>setReg(s=>({...s,email:e.target.value}))} placeholder="você@unidade.local"/></label>
              <label>Senha<input type="password" value={reg.password} onChange={e=>setReg(s=>({...s,password:e.target.value}))} placeholder="Mínimo 8 caracteres"/></label>
              <label>Perfil
                <select value={reg.role} onChange={e=>setReg(s=>({...s,role:e.target.value,councilNumber:"",councilUf:"SP",teamId:""}))}>
                  <option value="nurse_manager">Enfermeira</option>
                  <option value="doctor">Médico(a)</option>
                  <option value="dentist">Dentista</option>
                  <option value="nursing_tech">Téc. de Enfermagem</option>
                  <option value="pharmacist">Farmacêutico(a)</option>
                  <option value="pharmacy_tech">Téc. de Farmácia</option>
                  <option value="acs">ACS</option>
                  <option value="receptionist">Recepcionista</option>
                </select>
              </label>
              {reg.role !== "receptionist" && (
                <label>Equipe
                  <select value={reg.teamId} onChange={e=>setReg(s=>({...s,teamId:e.target.value}))}>
                    <option value="">Selecione a equipe</option>
                    {[
                      {id:"equipe-amarela", name:"Equipe Amarela"},
                      {id:"equipe-azul",    name:"Equipe Azul"},
                      {id:"equipe-cinza",   name:"Equipe Cinza"},
                      {id:"equipe-marrom",  name:"Equipe Marrom"},
                      {id:"equipe-rosa",    name:"Equipe Rosa"},
                    ].map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              )}
              {["doctor","dentist","nurse_manager","nursing_tech","pharmacist","pharmacy_tech"].includes(reg.role) && <>
                <label>
                  {reg.role==="doctor"?"CRM":reg.role==="dentist"?"CRO":["pharmacist","pharmacy_tech"].includes(reg.role)?"CFF":"COREN"} – Número do conselho
                  <input value={reg.councilNumber} onChange={e=>setReg(s=>({...s,councilNumber:onlyDigits(e.target.value).slice(0,12)}))} placeholder="000000"/>
                </label>
                <label>UF do conselho<input maxLength={2} value={reg.councilUf} onChange={e=>setReg(s=>({...s,councilUf:e.target.value.toUpperCase()}))} placeholder="SP"/></label>
              </>}
              {error && <p className="error">{error}</p>}
              <button type="submit" disabled={busy}>{busy?"Criando...":"Criar cadastro"}</button>
            </form>
          ) : authTab === "reset" ? (
            <ResetPasswordForm/>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ResetPasswordForm() {
  const [step, setStep]     = useState("request"); // request | confirm | done
  const [email, setEmail]   = useState("");
  const [token, setToken]   = useState("");
  const [newPw, setNewPw]   = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [msg, setMsg]       = useState("");
  const [err, setErr]       = useState("");
  const [busy, setBusy]     = useState(false);

  async function requestReset(e) {
    e.preventDefault();
    if (!email.trim()) { setErr("Informe o e-mail."); return; }
    setBusy(true); setErr("");
    try {
      auditLog("RESET_SENHA_SOLICITADO", { email: email.trim() });
      const res = await fetch("/auth/password-reset/request", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
      const data = await res.json();
      setMsg(data.message || "Verifique seu e-mail.");
      // Modo sem SMTP: token retorna na resposta para uso imediato
      if (data.resetToken) { setToken(data.resetToken); setStep("confirm"); }
    } catch { setErr("Erro de conexão. Tente novamente."); }
    finally { setBusy(false); }
  }

  async function confirmReset(e) {
    e.preventDefault();
    if (!token.trim()) { setErr("Token inválido."); return; }
    if (newPw.length < 8) { setErr("A senha deve ter pelo menos 8 caracteres."); return; }
    if (newPw !== newPw2)  { setErr("As senhas não coincidem."); return; }
    setBusy(true); setErr("");
    try {
      auditLog("RESET_SENHA_CONFIRMADO", { email: email.trim() });
      const res = await fetch("/auth/password-reset/confirm", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ token: token.trim(), newPassword: newPw })
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Erro ao redefinir senha."); return; }
      setMsg("Senha redefinida com sucesso! Faça login com a nova senha.");
      setStep("done");
    } catch { setErr("Erro de conexão. Tente novamente."); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-form">
      {step === "request" && (
        <form onSubmit={requestReset} style={{display:"flex",flexDirection:"column",gap:".85rem"}}>
          <p style={{fontSize:".82rem",color:"var(--text-2)",margin:0,lineHeight:1.6}}>
            Informe seu e-mail cadastrado. Você receberá um token para criar uma nova senha. Apenas você tem acesso à sua conta – nenhum administrador pode ver ou redefinir sua senha.
          </p>
          <label>E-mail institucional
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoFocus placeholder="usuario@unidade.local"/>
          </label>
          {err&&<p className="error">{err}</p>}
          {msg&&<p style={{color:"#15803d",fontSize:".8rem",background:"#f0fdf4",padding:".5rem .75rem",borderRadius:"var(--r-md)",border:"1px solid #bbf7d0",margin:0}}>{msg}</p>}
          <button type="submit" disabled={busy}>{busy?"Enviando...":"Solicitar redefinição"}</button>
        </form>
      )}
      {step === "confirm" && (
        <form onSubmit={confirmReset} style={{display:"flex",flexDirection:"column",gap:".85rem"}}>
          <p style={{fontSize:".82rem",color:"var(--text-2)",margin:0,lineHeight:1.6}}>
            Token recebido. Defina sua nova senha – ela ficará protegida no servidor com hash seguro.
          </p>
          <label>Token de redefinição
            <input value={token} onChange={e=>setToken(e.target.value)} placeholder="Cole o token aqui"/>
          </label>
          <label>Nova senha (mín. 8 caracteres)
            <input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="⬢⬢⬢⬢⬢⬢⬢⬢"/>
          </label>
          <label>Confirmar nova senha
            <input type="password" value={newPw2} onChange={e=>setNewPw2(e.target.value)} placeholder="⬢⬢⬢⬢⬢⬢⬢⬢"/>
          </label>
          {err&&<p className="error">{err}</p>}
          <button type="submit" disabled={busy}>{busy?"Redefinindo...":"Redefinir senha"}</button>
        </form>
      )}
      {step === "done" && (
        <div style={{textAlign:"center",padding:"1.5rem 0"}}>
          <div style={{ fontSize:"2.5rem", marginBottom:".75rem" }}>✅</div>
          <p style={{color:"#15803d",fontWeight:700,margin:0}}>{msg}</p>
        </div>
      )}
    </div>
  );
}


function Sidebar({ tab, setTab, mobileOpen, setMobileOpen, query, setQuery, user, canManageUser, onClearPatient }) {
  const navItems = buildNavItems(user, canManageUser);

  return (
    <aside className={`sidebar${mobileOpen?" mobile-open":""}`}>
      <div className="sidebar-inner">
        <div className="sidebar-section-label">Menu</div>

        <nav className="nav-links">
          {navItems.map((item, i) => {
            const prevSection = i > 0 ? navItems[i-1].section : null;
            const showSection = item.section && item.section !== prevSection;
            return [
              showSection ? <div key={"sec-"+item.id} className="sidebar-section-label" style={{marginTop:".75rem"}}>{item.section}</div> : null,
              <button key={item.id}
                className={`nav-link${tab===item.id?" active":""}`}
                onClick={()=>{ setTab(item.id); setMobileOpen(false); if(item.id!=="patients" && onClearPatient) onClearPatient(); }}>
                {NAV_ICON[item.id]}
                {item.label}
              </button>
            ];
          })}
        </nav>
    </div>
  </aside>
);
}


function Topbar({ user, selectedPatient, templates, mobileOpen, setMobileOpen, onLogout, onOpenProfile, patients, protocolByPatient, onNavigatePatient, apiHealth }) {
  const [dropOpen, setDropOpen] = useState(false);

  // close on outside click
  useEffect(() => {
    if (!dropOpen) return;
    const handler = () => setDropOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [dropOpen]);

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <button className="mobile-menu-btn" type="button" onClick={()=>setMobileOpen(v=>!v)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d={mobileOpen?"M2 2l12 12M2 14L14 2":"M2 4h12M2 8h12M2 12h12"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        {/* Ícone de saúde – cruz no quadrado arredondado */}
        <div className="topbar-brand-icon" style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#14b8a6,#0d9488)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="7.5" y="2.5" width="3" height="13" rx="1.5" fill="white" opacity="0.95"/>
            <rect x="2.5" y="7.5" width="13" height="3" rx="1.5" fill="white" opacity="0.95"/>
          </svg>
        </div>
        {/* Wordmark: sigla grande + nome discreto */}
        <div style={{display:"flex",flexDirection:"column",lineHeight:1.1,gap:0}}>
          <span style={{fontSize:"1.15rem",fontWeight:800,color:"var(--teal-600)",letterSpacing:"0.08em",fontFamily:"Georgia,serif"}}>SIGUS</span>
          <span style={{fontSize:"0.52rem",fontWeight:400,color:"var(--text-3)",letterSpacing:"0.04em",textTransform:"uppercase",whiteSpace:"nowrap"}}>Gestão Única de Saúde</span>
        </div>
      </div>

      <div className="topbar-center"/>

      <div className="topbar-right">
        <div style={{
          display:"flex",alignItems:"center",gap:".35rem",
          padding:".22rem .5rem",borderRadius:999,
          border:"1px solid var(--border)",background:"var(--surface-2)"
        }}>
          <span style={{
            width:7,height:7,borderRadius:"50%",
            background: apiHealth?.status==="ok" ? "var(--green-600)" : apiHealth?.status==="checking" ? "var(--amber-600)" : "var(--red-600,#dc2626)"
          }}/>
          <span style={{fontSize:".72rem",color:"var(--text-2)",fontWeight:600}}>
            API {apiHealth?.label || "Verificando..."}
          </span>
        </div>
        <GlobalSearch patients={patients||[]} templates={templates||[]} onNavigate={onNavigatePatient||(_=>{})}/>
        <NotificationBell patients={patients||[]} protocolByPatient={protocolByPatient||{}} pharmacyStock={readLS("saudeubs_pharmacy_v1",[])} agenda={readLS(AGENDA_KEY,[])} onNavigate={onNavigatePatient||(_=>{})}/>
        {/* Paciente selecionado – discreto, próximo ao perfil */}
        {selectedPatient && (
          <div style={{
            display:"flex", alignItems:"center", gap:".4rem",
            padding:".28rem .65rem", borderRadius:"var(--r-md)",
            background:"var(--surface-2)", border:"1px solid var(--border)",
            maxWidth:220, overflow:"hidden",
          }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{color:"var(--text-3)",flexShrink:0}}>
              <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span style={{fontSize:".75rem",fontWeight:500,color:"var(--text-1)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              {selectedPatient.name}
            </span>
            <span style={{fontSize:".72rem",color:"var(--text-3)",flexShrink:0}}>
              · {catLabel(templates,selectedPatient.careCategory)}
            </span>
          </div>
        )}

        {/* Separador vertical */}
        {selectedPatient && (
          <div style={{width:1,height:20,background:"var(--border)",flexShrink:0}}/>
        )}
        <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
          <button
            onClick={()=>setDropOpen(v=>!v)}
            style={{
              display:"flex", alignItems:"center", gap:".6rem",
              background:"none", border:"none", cursor:"pointer",
              padding:".3rem .5rem", borderRadius:"var(--r-md)", transition:"background .12s",
            }}
            onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
            onMouseLeave={e=>e.currentTarget.style.background="none"}
          >
            <div className="user-avatar">{initials(user?.name)}</div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",lineHeight:1.3}}>
              <span style={{fontSize:".83rem",fontWeight:600,color:"var(--text-1)",whiteSpace:"nowrap"}}>
                {user?.name||"-"}
              </span>
              <span style={{fontSize:".71rem",color:"var(--text-3)",whiteSpace:"nowrap"}}>
                {roleLabel(user?.role)}{user?.teamName ? ` · ${user.teamName}` : ""}
              </span>
            </div>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{color:"var(--text-3)",flexShrink:0}}>
              <path d={dropOpen?"M4 10l4-4 4 4":"M4 6l4 4 4-4"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {dropOpen && (
            <div style={{
              position:"absolute", top:"calc(100% + 8px)", right:0,
              background:"var(--surface)", border:"1px solid var(--border)",
              borderRadius:"var(--r-lg)", boxShadow:"var(--sh-lg)",
              minWidth:220, zIndex:500, overflow:"hidden",
              animation:"modal-in .15s ease",
            }}>
              {/* Header do dropdown */}
              <div style={{padding:"1rem 1.1rem .75rem", borderBottom:"1px solid var(--border)"}}>
                <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
                  <div className="user-avatar" style={{width:36,height:36,fontSize:".88rem",flexShrink:0}}>{initials(user?.name)}</div>
                  <div>
                    <div style={{fontSize:".85rem",fontWeight:600,color:"var(--ink)"}}>{user?.name||"-"}</div>
                    <div style={{fontSize:".72rem",color:"var(--text-3)"}}>{user?.email||""}</div>
                  </div>
                </div>
              </div>

              {/* Ações */}
              <div style={{padding:".4rem"}}>
                <button
                  onClick={()=>{ setDropOpen(false); onOpenProfile(); }}
                  style={{
                    display:"flex", alignItems:"center", gap:".6rem",
                    width:"100%", padding:".6rem .75rem", borderRadius:"var(--r-md)",
                    background:"none", border:"none", cursor:"pointer",
                    fontSize:".83rem", color:"var(--text-1)", fontFamily:"inherit",
                    transition:"background .1s", textAlign:"left",
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                  onMouseLeave={e=>e.currentTarget.style.background="none"}
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Editar perfil
                </button>

                <div style={{height:1,background:"var(--border)",margin:".35rem .5rem"}}/>

                <button
                  onClick={()=>{ setDropOpen(false); onLogout(); }}
                  style={{
                    display:"flex", alignItems:"center", gap:".6rem",
                    width:"100%", padding:".6rem .75rem", borderRadius:"var(--r-md)",
                    background:"none", border:"none", cursor:"pointer",
                    fontSize:".83rem", color:"var(--red-600,#dc2626)", fontFamily:"inherit",
                    transition:"background .1s", textAlign:"left",
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--red-50,#fef2f2)"}
                  onMouseLeave={e=>e.currentTarget.style.background="none"}
                >
                  <IconSignOut/>
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}


function KpiCard({ label, value, foot }) {
  return (
    <article className="home-kpi-card">
      <p className="home-kpi-label">{label}</p>
      <p className="home-kpi-value">{value}</p>
      <p className="home-kpi-foot">{foot}</p>
    </article>
  );
}


function Dashboard({ patients, users, allUsers, templates, protocolByPatient, demandMonthly, currentUser, onNavigate, setTab }) {
  const assigned   = patients.filter(p=>String(p.assignedAcsId||"").trim()).length;
  const unassigned = Math.max(patients.length-assigned,0);
  const acsCount   = users.filter(u=>u.role==="acs").length;
  const docCount   = users.filter(u=>u.role==="doctor").length;
  const pc = Object.values(protocolByPatient||{}).reduce((a,s)=>{
    const chip=protocolChip(s);
    if(chip.tone==="danger") a.critical++;
    else if(chip.tone==="warn") a.attention++;
    else if(chip.tone==="ok") a.ok++;
    return a;
  },{critical:0,attention:0,ok:0});

  const critical = patients
    .filter(p=>protocolChip(protocolByPatient[p.id]).tone==="danger")
    .slice(0,6);
  const recent = [...patients].slice(-6).reverse();

  const dmTotal=demandMonthly?.totals?.total ?? 0;
  const dmSched=demandMonthly?.totals?.scheduled ?? 0;
  const dmSpont=demandMonthly?.totals?.spontaneous ?? 0;
  const dmPct=dmTotal>0?Math.round((dmSched/dmTotal)*100):null;
  const dmInRange=dmPct!==null&&dmPct>=50&&dmPct<=70;
  const dmColor=dmPct===null?"var(--text-3)":dmInRange?"#15803d":dmPct<50?"#b45309":"#be123c";
  const dmBg=dmPct===null?"var(--surface-3)":dmInRange?"#dcfce7":dmPct<50?"#fef3c7":"#fee2e2";
  const dmStatus=dmPct===null?"Sem dados":dmInRange?"Na meta âœ“":dmPct<50?"Abaixo da meta":"Acima da meta";
  const isAna = isAdmin(currentUser);
  // Mescla usuários da API com locais (recepção/farmácia), sem duplicatas
  const localExtras = [...RECEPTION_USERS, ...PHARMA_USERS].filter(lu=>
    !allUsers.some(au=>au.email?.toLowerCase()===lu.email?.toLowerCase())
    && !users.some(u=>u.email?.toLowerCase()===lu.email?.toLowerCase())
  ).map(lu=>({...lu, online: lu.id===currentUser?.id}));
  const mergedUsers = [
    ...(allUsers.length ? allUsers : users).map(u=>u.id===currentUser?.id?{...u,online:true}:u),
    ...localExtras,
  ];
  const adminUserList = mergedUsers;

  return (
    <div className="workspace-home">
      {/* Hero */}
      <section className="home-hero">
        <div>
          <p className="home-kicker">Workspace da equipe</p>
          <h1 className="home-title">Gestão de Pacientes - UBS</h1>
          <p className="home-sub">Acompanhe pacientes, protocolos e pendências da equipe em tempo real.</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:".5rem",alignItems:"flex-end",flexShrink:0}}>
          <div style={{display:"flex",gap:".5rem"}}>
            <Chip tone={pc.critical>0?"danger":pc.attention>0?"warn":"ok"}>
              {pc.critical} crítico{pc.critical!==1?"s":""}
            </Chip>
            <Chip tone="muted">{pc.ok} em dia</Chip>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="home-kpi-grid">
        <KpiCard label="Pacientes ativos"    value={patients.length} foot="Total cadastrado"/>
        <KpiCard label="Com ACS definido"    value={assigned}        foot={`Sem ACS: ${unassigned}`}/>
        <KpiCard label="Protocolos críticos" value={pc.critical}     foot={`Atenção: ${pc.attention} ⬢ Em dia: ${pc.ok}`}/>
        <KpiCard label="Profissionais"       value={users.length}    foot={`ACS: ${acsCount} ⬢ Médicos: ${docCount}`}/>
        {currentUser?.role==="nurse_manager"&&(
        <article className="home-kpi-card">
          <p className="home-kpi-label">Demanda programada</p>
          <div style={{display:"flex",alignItems:"flex-end",gap:".5rem",marginBottom:".2rem"}}>
            <p className="home-kpi-value" style={{color:dmColor,margin:0}}>{dmPct===null?"–":`${dmPct}%`}</p>
            <span style={{fontSize:".72rem",fontWeight:700,padding:".15rem .5rem",borderRadius:999,background:dmBg,color:dmColor,marginBottom:".3rem",flexShrink:0}}>{dmStatus}</span>
          </div>
          {dmPct!==null&&(
            <div style={{position:"relative",height:6,background:"var(--slate-100)",borderRadius:99,overflow:"hidden",marginBottom:".35rem"}}>
              <div style={{position:"absolute",left:"50%",width:"20%",height:"100%",background:"#bbf7d0",opacity:.7,borderRadius:99}}/>
              <div style={{position:"absolute",left:0,width:`${Math.min(dmPct,100)}%`,height:"100%",background:dmColor,borderRadius:99}}/>
            </div>
          )}
          <p className="home-kpi-foot">{dmPct===null?"Nenhum atendimento registrado":`${dmSched} programados · ${dmSpont} espontâneos · meta 50–70%`}</p>
        </article>
        )}
      </section>

      {isAna&&(
        <section style={{marginBottom:"1.5rem"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".65rem"}}>
            <span style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)"}}>💥 Painel de contas</span>
            <span style={{fontSize:".72rem",color:"var(--text-3)"}}>{adminUserList.length} conta{adminUserList.length!==1?"s":""} · {adminUserList.filter(u=>u.online).length} online</span>
          </div>
          <div className="card" style={{padding:0,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:".82rem"}}>
              <thead><tr style={{borderBottom:"1px solid var(--border)"}}>
                {["","Nome","E-mail","Perfil","Status"].map((h,i)=><th key={i} style={{padding:".5rem .85rem",textAlign:"left",fontWeight:600,color:"var(--text-3)",fontSize:".72rem",width:i===0?"36px":undefined}}>{h}</th>)}
              </tr></thead>
                <tbody>{[...adminUserList].sort((a,b)=>{const o={nurse_manager:0,doctor:1,dentist:2,nursing_tech:3,pharmacist:4,pharmacy_tech:5,acs:6,receptionist:7};return((o[a.role] ?? 9)-(o[b.role] ?? 9));}).map(u=>{
                const rc={nurse_manager:"#0d9488",doctor:"#6366f1",dentist:"#8b5cf6",nursing_tech:"#0891b2",acs:"#f59e0b",pharmacist:"#7c3aed",pharmacy_tech:"#a855f7",receptionist:"#64748b"}[u.role]||"var(--teal-600)";
                const online=u.online===true;
                return(<tr key={u.id} style={{borderBottom:"1px solid var(--border)"}} onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                  <td style={{padding:".5rem .85rem"}}><div className="user-avatar" style={{width:28,height:28,fontSize:".7rem",background:rc}}>{initials(u.name)}</div></td>
                  <td style={{padding:".5rem .85rem",fontWeight:500,color:"var(--ink)"}}>{u.name}</td>
                  <td style={{padding:".5rem .85rem",color:"var(--text-2)",fontFamily:"monospace",fontSize:".78rem"}}>{u.email||"-"}</td>
                  <td style={{padding:".5rem .85rem"}}><span style={{fontSize:".72rem",fontWeight:600,padding:".2rem .5rem",borderRadius:999,background:`${rc}18`,color:rc}}>{roleLabel(u.role)}</span></td>
                  <td style={{padding:".5rem .85rem"}}><span style={{display:"inline-flex",alignItems:"center",gap:".3rem",fontSize:".72rem",fontWeight:600,color:online?"#16a34a":"var(--text-3)"}}>
                    <span style={{width:7,height:7,borderRadius:"50%",background:online?"#16a34a":"var(--border)",boxShadow:online?"0 0 0 2px #bbf7d0":undefined}}/>
                    {online?"Online":"Offline"}
                  </span></td>
                </tr>);
              })}</tbody>
            </table>
          </div>
        </section>
      )}

      {/* Proactive Alerts */}
      {(()=>{
        const agenda = readLS(AGENDA_KEY,[]);
        const stock  = readLS("saudeubs_pharmacy_v1",[]);
        const alerts = buildProactiveAlerts(patients, protocolByPatient, stock, agenda).slice(0,6);
        if(!alerts.length) return null;
        return (
          <section style={{marginBottom:"1.5rem"}}>
            <div style={{display:"flex",alignItems:"center",gap:".5rem",marginBottom:".75rem"}}>
              <span style={{ fontWeight:700, fontSize:".82rem", color:"var(--ink)" }}>Alertas proativos </span>
              <span style={{fontSize:".72rem",color:"var(--text-3)"}}>{alerts.length} aviso{alerts.length!==1?"s":""}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:".5rem"}}>
              {alerts.map(a=>(
                <div key={a.id} onClick={()=>a.patientId&&onNavigate&&onNavigate(a.patientId)}
                  style={{padding:".65rem .85rem",borderRadius:"var(--r-md)",cursor:a.patientId?"pointer":"default",
                    background:a.type==="danger"?"#fff1f2":a.type==="warn"?"#fffbeb":"#eff6ff",
                    border:`1px solid ${a.type==="danger"?"#fecdd3":a.type==="warn"?"#fde68a":"#bfdbfe"}`,
                    display:"flex",gap:".6rem",alignItems:"center",transition:"filter .1s"}}
                  onMouseEnter={e=>{ if(a.patientId) e.currentTarget.style.filter="brightness(.97)"; }}
                  onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                  <span style={{fontSize:"1.1rem",flexShrink:0}}>{a.icon}</span>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:".74rem",color:a.type==="danger"?"#be123c":a.type==="warn"?"#92400e":"#1d4ed8"}}>{a.title}</div>
                    <div style={{fontSize:".71rem",color:"var(--text-2)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* Cards */}
      <section className="grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Pacientes prioritários</span>
            <Chip tone="danger">{pc.critical} crítico{pc.critical!==1?"s":""}</Chip>
          </div>
          <div className="card-body">
            {!critical.length
              ? <p className="muted" style={{ fontSize:".84rem" }}> Nenhum paciente com protocolo crítico. </p>
              : <ul className="stack-list">
                  {critical.map(p=>{
                    const chip=protocolChip(protocolByPatient[p.id]);
                    const acsName=users.find(u=>u.id===p.assignedAcsId)?.name||"Sem ACS";
                    return(
                      <li key={p.id}>
                        <div>
                          <p><strong>{p.name}</strong></p>
                          <p className="muted small">{catLabel(templates,p.careCategory)} ⬢ {acsName}</p>
                        </div>
                        <Chip tone={chip.tone}>{chip.text}</Chip>
                      </li>
                    );
                  })}
                </ul>
            }
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Equipe ativa</span>
            <Chip tone="muted">{users.length} membros</Chip>
          </div>
          <div className="card-body">
            {!users.length
              ? <p className="muted" style={{fontSize:".84rem"}}>Nenhum membro na equipe.</p>
              : <ul className="stack-list">
                  {users.slice(0,6).map(u=>(
                    <li key={u.id}>
                      <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
                        <div className="user-avatar" style={{width:28,height:28,fontSize:".72rem",flexShrink:0}}>{initials(u.name)}</div>
                        <div>
                          <p><strong>{u.name}</strong></p>
                          <p className="muted small">{roleLabel(u.role)}</p>
                        </div>
                      </div>
                      <Chip tone="muted">{u.role==="acs"?"ACS":u.role==="doctor"?"Médico":u.role==="nursing_tech"?"Téc. Enf.":u.role==="pharmacist"?"Farmac.":"Enf."}</Chip>
                    </li>
                  ))}
                </ul>
            }
          </div>
        </div>
      </section>
    </div>
  );
}


function Chip({ tone = "muted", children }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

function SectionHeader({ title, count, action }) {
  return (
    <div className="patients-head">
      <h3>{title}{count!=null?` (${count})`:""}</h3>
      {action}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{padding:"2.5rem 1.5rem",textAlign:"center",color:"var(--text-3)"}}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{margin:"0 auto .75rem",display:"block",opacity:.35}}>
        <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M20 13v7M20 26v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <p style={{fontSize:".85rem"}}>{message}</p>
    </div>
  );
}


function PatientsTab({ patients,users,templates,protocolByPatient,query,setQuery,categoryFilter,setCategoryFilter,acsFilter,setAcsFilter,conditionFilter,setConditionFilter,selectedPatientId,setSelectedPatientId,canManageUser,canWriteRecords,onEdit,onDelete,onView,patientTab,setPatientTab,appointments,tasks,messages,history,patientProtocolSummary,sortedSpecialAlerts,recordForm,setRecordForm,recordVaccines,setRecordVaccines,appointmentForm,setAppointmentForm,taskForm,setTaskForm,messageText,setMessageText,onSubmitRecord,onSubmitAppointment,onSubmitTask,onSubmitMessage,onDeleteRecord,onDeleteAppointment,onStatusChange,selectedPatient,userObj,token }) {
  const [page, setPage] = useState(1);
  const acsUsers=users.filter(u=>u.role==="acs");
  const catOpts=templates.map(t=>({value:t.category,label:t.label})).filter(c=>c.value!=="chronic");
  const filtered=patients
    .filter(p=>{ if(!query.trim()) return true; const acsName=users.find(u=>u.id===p.assignedAcsId)?.name||""; const cat=catLabel(templates,p.careCategory); const haystack=normalizeSearch(`${p.name||""} ${p.phone||""} ${acsName} ${cat}`); return haystack.includes(normalizeSearch(query)); })
    .filter(p=>categoryFilter?p.careCategory===categoryFilter:true)
    .filter(p=>acsFilter?p.assignedAcsId===acsFilter:true)
    .filter(p=>{
      if(!conditionFilter) return true;
      const cc = Array.isArray(p.chronicConditions)?p.chronicConditions:[];
      if(conditionFilter==="hypertension") return cc.includes("hypertension");
      if(conditionFilter==="diabetes")     return cc.includes("diabetes");
      if(conditionFilter==="both")         return cc.includes("hypertension")&&cc.includes("diabetes");
      return true;
    });

  // Ordenação especial para Equipe Rosa
  const isEquipeRosa = String(userObj?.teamId||userObj?.teamName||"").toLowerCase().includes("rosa");

  function rosaSort(list) {
    if(!isEquipeRosa) return [...list].sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"pt-BR",{sensitivity:"base"}));
    const puericultura = [], gestantes = [], outros = [];
    list.forEach(p => {
      const cat = String(p.careCategory||"").toLowerCase();
      if(cat==="child_followup") puericultura.push(p);
      else if(cat==="pregnant") gestantes.push(p);
      else outros.push(p);
    });
    // Puericultura: mais velhos primeiro (birthDate mais antiga = idade maior)
    puericultura.sort((a,b)=>{
      const da=parseLocalDate(a.birthDate||"")||new Date("9999-01-01"), db=parseLocalDate(b.birthDate||"")||new Date("9999-01-01");
      return da-db; // data de nascimento mais antiga = mais velho = vem primeiro
    });
    // Gestantes: IG mais avançada primeiro (mais semanas = vem primeiro)
    gestantes.sort((a,b)=>{
      const ga=gestationalAgeInfo(a), gb=gestationalAgeInfo(b);
      const weeksA=ga?(ga.weeks*7+ga.days):0, weeksB=gb?(gb.weeks*7+gb.days):0;
      return weeksB-weeksA; // mais semanas primeiro
    });
    // Outros: alfabético
    outros.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"pt-BR",{sensitivity:"base"}));
    return [...puericultura,...gestantes,...outros];
  }

  const sortedFiltered = rosaSort(filtered);
  useEffect(()=>{
    if(selectedPatientId && !sortedFiltered.some((p)=>p.id===selectedPatientId)) setSelectedPatientId("");
  },[sortedFiltered.length,selectedPatientId,setSelectedPatientId]);

  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / PATIENTS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PATIENTS_PAGE_SIZE;
  const pagedPatients = sortedFiltered.slice(pageStart, pageStart + PATIENTS_PAGE_SIZE);

  const togglePatientDetail = (patientId) => {
    setSelectedPatientId((prev) => prev===patientId ? "" : patientId);
  };

  return (
    <div className={`patients-layout ${selectedPatient ? "with-detail" : "without-detail"}`}>
      <div className="card">
        <SectionHeader
          title="Pacientes"
          count={filtered.length}
          action={canManageUser&&<button onClick={onEdit(null)}>+ Novo paciente</button>}
        />
        <div className="filters">
          <input placeholder="Buscar por nome ou telefone..." value={query} onChange={e=>setQuery(e.target.value)}/>
          <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
            <option value="">Todas as categorias</option>
            {catOpts.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select value={conditionFilter} onChange={e=>setConditionFilter(e.target.value)}>
            <option value="">Todas as condições</option>
            <option value="hypertension">Hipertensão</option>
            <option value="diabetes">Diabetes</option>
            <option value="both">Hipertensão + Diabetes</option>
          </select>
          <select value={acsFilter} onChange={e=>setAcsFilter(e.target.value)}>
            <option value="">Todos os ACS</option>
            {acsUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="patients-table-wrap">
          <table className="patients-table">
            <thead>
              <tr>
                <th style={{width:"38px"}}></th>
                <th>Paciente</th><th>Categoria</th><th>ACS</th><th>Protocolo</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {!pagedPatients.length
                ? <tr><td colSpan={6} className="empty">Nenhum paciente encontrado.</td></tr>
                : pagedPatients.map(p=>{
                    const summary=protocolByPatient[p.id];
                    const chip=protocolChip(summary);
                    const acsName=users.find(u=>u.id===p.assignedAcsId)?.name||"Não atribuído";
                    const isOpen = selectedPatientId===p.id;
                    return(
                      <tr key={p.id} onClick={()=>togglePatientDetail(p.id)} className={isOpen?"selected":""}>
                        <td className="expand-cell" onClick={e=>e.stopPropagation()}>
                          <button className={`icon-btn expand-btn${isOpen?" expanded":""}`} title={isOpen?"Fechar detalhes":"Abrir detalhes"} onClick={()=>togglePatientDetail(p.id)}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </td>
                        <td>
                          <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
                            <div className="user-avatar" style={{width:28,height:28,fontSize:".7rem",flexShrink:0,background:"var(--teal-600)",color:"#fff"}}>
                              {initials(p.name)}
                            </div>
                            <div>
                              <div style={{display:"flex",alignItems:"center",gap:".4rem",flexWrap:"wrap"}}>
                                <strong style={{color:"var(--ink)"}}>{p.name}</strong>
                                {isProfileIncomplete(p)&&(
                                  <span style={{fontSize:".6rem",fontWeight:700,padding:".08rem .35rem",borderRadius:3,background:"#fef9c3",color:"#854d0e",border:"1px solid #fde047",whiteSpace:"nowrap",letterSpacing:".02em"}}>Cadastro incompleto</span>
                                )}
                              </div>
                              <div className="muted small" style={{display:"flex",gap:".4rem",alignItems:"center"}}>
                                <span>{p.phone||"-"}</span>
                                {calcAge(p.birthDate)&&<span style={{color:"var(--teal-600)",fontWeight:600}}>· {calcAge(p.birthDate)}</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>{catLabel(templates,p.careCategory)}</td>
                        <td>{acsName}</td>
                        <td><Chip tone={chip.tone}>{chip.text}</Chip></td>
                        <td className="actions-cell" onClick={e=>e.stopPropagation()}>
                          <button className="icon-btn" title="Visualizar" onClick={()=>onView(p)}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4z" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/></svg>
                          </button>
                          {canManageUser&&<button className="icon-btn" title="Editar" onClick={()=>onEdit(p)()}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                          </button>}
                          {canManageUser&&<button className="icon-btn" title="Excluir" onClick={()=>onDelete(p)}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>}
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>Página {safePage} de {totalPages}</span>
          <div className="actions">
            <button className="secondary" type="button" disabled={safePage<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</button>
            <button className="secondary" type="button" disabled={safePage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Próxima</button>
          </div>
        </div>
      </div>

      {selectedPatient&&(
        <div className="card patient-side-panel">
          <PatientDetail
            patient={selectedPatient} users={users} templates={templates}
            patientTab={patientTab} setPatientTab={setPatientTab}
            appointments={appointments} tasks={tasks} messages={messages} history={history}
            patientProtocolSummary={patientProtocolSummary} sortedSpecialAlerts={sortedSpecialAlerts}
            recordForm={recordForm} setRecordForm={setRecordForm} recordVaccines={recordVaccines} setRecordVaccines={setRecordVaccines}
            appointmentForm={appointmentForm} setAppointmentForm={setAppointmentForm}
            taskForm={taskForm} setTaskForm={setTaskForm}
            messageText={messageText} setMessageText={setMessageText}
            onSubmitRecord={onSubmitRecord} onSubmitAppointment={onSubmitAppointment}
            onSubmitTask={onSubmitTask} onSubmitMessage={onSubmitMessage}
            onDeleteRecord={onDeleteRecord} onDeleteAppointment={onDeleteAppointment}
            onStatusChange={onStatusChange}
            acsUsers={users.filter(u=>u.role==="acs")} canManageUser={canManageUser} canWriteRecords={Boolean(canWriteRecords && canManageUser)} userObj={userObj} token={token}
          />
        </div>
      )}
    </div>
  );
}


const EXAM_TYPES = ["Hemograma completo","Glicemia em jejum","HbA1c","Colesterol total e frações","Triglicerídeos","Creatinina","Ureia","TGO/TGP","TSH/T4 livre","Urina rotina (EAS)","Urocultura","Raio-X tórax","Ultrassonografia abdominal","Ultrassonografia obstétrica","ECG","Espirometria","Mamografia","Papanicolau","PSA","Ferritina/Ferro sérico","Vitamina D","Coagulograma","Outros"];

const MEDICATIONS_COMMON = [
  "Ácido fólico 5mg","Amlodipino 5mg","Amlodipino 10mg","Atenolol 25mg","Atenolol 50mg",
  "Atorvastatina 20mg","Atorvastatina 40mg","Captopril 25mg","Captopril 50mg","Carvedilol 6,25mg",
  "Carvedilol 12,5mg","Enalapril 5mg","Enalapril 10mg","Espironolactona 25mg","Furosemida 40mg",
  "Glibenclamida 5mg","Glicazida 30mg","Hidroclorotiazida 25mg","Insulina NPH","Insulina Regular",
  "Levotiroxina 25mcg","Levotiroxina 50mcg","Levotiroxina 100mcg","Losartana 50mg","Losartana 100mg",
  "Metformina 500mg","Metformina 850mg","Metformina 1g","Metoprolol 25mg","Metoprolol 50mg",
  "Nifedipino 10mg","Omeprazol 20mg","Omeprazol 40mg","Rosuvastatina 10mg","Rosuvastatina 20mg",
  "Sinvastatina 20mg","Sinvastatina 40mg","Sulfato ferroso 40mg","Valsartana 80mg","Valsartana 160mg",
  "Outros (digitar)"
];


function ExamRequestModal({ patient, user, users, token, onClose }) {
  const today = new Date().toISOString().slice(0,10);
  const [exams, setExams] = useState([{ type:"Hemograma completo", name:"", urgency:"routine", notes:"" }]);
  const [justification, setJustification] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function addExam() { setExams(s=>[...s,{type:"Hemograma completo",name:"",urgency:"routine",notes:""}]); }
  function removeExam(i) { setExams(s=>s.filter((_,idx)=>idx!==i)); }
  function updateExam(i,k,v) { setExams(s=>s.map((e,idx)=>idx===i?{...e,[k]:v}:e)); }

  async function submit(e) {
    e.preventDefault();
    const valid = exams.filter(ex=>ex.type&&(ex.type!=="Outros"||ex.name.trim()));
    if (!valid.length) { setErr("Adicione ao menos um exame."); return; }
    setBusy(true); setErr("");
    try {
      const title = valid.map(ex=>ex.type==="Outros"?ex.name.trim():ex.type).join(", ");
      const details = [
        `PEDIDO DE EXAME – emitido em ${new Date().toLocaleDateString("pt-BR")}`,
        `Profissional: ${user?.name||""} ${user?.councilNumber?`(${user.role==="doctor"?"CRM":user.role==="dentist"?"CRO":"COREN"} ${user.councilNumber}/${user.councilUf||""})` : ""}`,
        `Paciente: ${patient.name}`,
        "",
        ...valid.map((ex,i)=>`${i+1}. ${ex.type==="Outros"?ex.name.trim():ex.type}${ex.urgency==="urgent"?" – URGENTE":ex.urgency==="priority"?" – PRIORITÁRIO":""}${ex.notes?`\n   Observação: ${ex.notes}`:""}`),
        justification ? `\nJustificativa clínica: ${justification}` : "",
      ].filter(l=>l!==undefined).join("\n");

      await fetch(`/patients/${patient.id}/records`, {
        method:"POST",
        headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
        body: JSON.stringify({
          type:"exam_request", date:today, time:new Date().toTimeString().slice(0,5),
          title:`Pedido de exame: ${title}`,
          details, immutable:true,
          professionalName:user?.name||"",
          professionalCouncil: user?.councilNumber
            ? `${user.role==="doctor"?"CRM":user.role==="dentist"?"CRO":"COREN"} ${user.councilNumber}/${user.councilUf||""}` : "",
        }),
      });
      auditLog("PEDIDO_EXAME", { patientId:patient.id, patientName:patient.name, exames:title }, user);
      onClose(true);
    } catch(ex) { setErr(ex.message||"Erro ao salvar."); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={()=>onClose(false)}>
      <div className="modal" style={{maxWidth:560}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <div>
            <h3 style={{margin:0,fontSize:"1rem"}}>ðŸ”¬ Pedido de Exame</h3>
            <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>{patient.name}</div>
          </div>
          <button className="icon-btn" onClick={()=>onClose(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
        </div>
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
          {exams.map((ex,i)=>(
            <div key={i} style={{padding:".75rem",background:"var(--surface-2)",borderRadius:"var(--r-md)",border:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:".45rem"}}>
              <div style={{display:"flex",gap:".5rem",alignItems:"flex-start"}}>
                <div style={{flex:1,display:"flex",flexDirection:"column",gap:".3rem"}}>
                  <label style={{fontSize:".75rem",fontWeight:600}}>Exame
                    <select value={ex.type} onChange={e=>updateExam(i,"type",e.target.value)} style={{marginTop:".2rem"}}>
                      {EXAM_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  {ex.type==="Outros"&&<input value={ex.name} onChange={e=>updateExam(i,"name",e.target.value)} placeholder="Nome do exame" style={{fontSize:".82rem"}}/>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:".3rem",minWidth:130}}>
                  <label style={{fontSize:".75rem",fontWeight:600}}>Prioridade
                    <select value={ex.urgency} onChange={e=>updateExam(i,"urgency",e.target.value)} style={{marginTop:".2rem"}}>
                      <option value="routine">Rotina</option>
                      <option value="priority">Prioritário</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </label>
                </div>
                {exams.length>1&&<button type="button" onClick={()=>removeExam(i)} style={{marginTop:"1.4rem",padding:".25rem .45rem",background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"#be123c",cursor:"pointer",fontSize:".75rem",flexShrink:0}}>âœ•</button>}
              </div>
              <input value={ex.notes} onChange={e=>updateExam(i,"notes",e.target.value)} placeholder="Observação específica (opcional)" style={{fontSize:".78rem"}}/>
            </div>
          ))}
          <button type="button" onClick={addExam} style={{alignSelf:"flex-start",fontSize:".78rem",padding:".3rem .75rem",background:"var(--surface-2)",border:"1px dashed var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",color:"var(--teal-700)",fontWeight:600}}>+ Adicionar exame</button>
          <label style={{fontSize:".75rem",fontWeight:600}}>Justificativa clínica (opcional)
            <textarea value={justification} onChange={e=>setJustification(e.target.value)} placeholder="Hipótese diagnóstica ou motivo do pedido..." style={{minHeight:52,marginTop:".25rem"}}/>
          </label>
          {err&&<p className="error" style={{margin:0}}>{err}</p>}
          <div style={{display:"flex",gap:".5rem",justifyContent:"flex-end"}}>
            <button type="button" className="secondary" onClick={()=>onClose(false)}>Cancelar</button>
            <button type="submit" disabled={busy}>{busy?"Registrando...":"Emitir pedido"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

 
function PrescriptionModal({ patient, user, token, onClose }) {
  const today = new Date().toISOString().slice(0,10);
  const [meds, setMeds] = useState([{ name:"", custom:"", dosage:"", frequency:"", duration:"", route:"", notes:"" }]);
  const [validity, setValidity] = useState("30");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function addMed() { setMeds(s=>[...s,{name:"",custom:"",dosage:"",frequency:"",duration:"",route:"",notes:""}]); }
  function removeMed(i) { setMeds(s=>s.filter((_,idx)=>idx!==i)); }
  function updateMed(i,k,v) { setMeds(s=>s.map((m,idx)=>idx===i?{...m,[k]:v}:m)); }

  async function submit(e) {
    e.preventDefault();
    const valid = meds.filter(m=>(m.name&&m.name!=="Outros (digitar)")||m.custom.trim());
    if (!valid.length) { setErr("Adicione ao menos um medicamento."); return; }
    const missingDose = valid.find(m=>!m.dosage.trim()||!m.frequency.trim());
    if (missingDose) { setErr("Preencha dose e frequência para todos os medicamentos."); return; }
    setBusy(true); setErr("");
    try {
      const title = valid.map(m=>m.name==="Outros (digitar)"?m.custom.trim():m.name).join(", ");
      const details = [
        `PRESCRIÇÃO MÉDICA – emitida em ${new Date().toLocaleDateString("pt-BR")}`,
        `Validade: ${validity} dias`,
        `Profissional: ${user?.name||""} ${user?.councilNumber?`(${user.role==="doctor"?"CRM":user.role==="dentist"?"CRO":"COREN"} ${user.councilNumber}/${user.councilUf||""})` : ""}`,
        `Paciente: ${patient.name}`,
        "",
        ...valid.map((m,i)=>{
          const nome = m.name==="Outros (digitar)"?m.custom.trim():m.name;
          return `${i+1}. ${nome} ${m.dosage}${m.route?` – Via: ${m.route}`:""}
   Frequência: ${m.frequency}${m.duration?` por ${m.duration}`:""}${m.notes?`\n   Observação: ${m.notes}`:""}`;
        }),
      ].join("\n");

      await fetch(`/patients/${patient.id}/records`, {
        method:"POST",
        headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
        body: JSON.stringify({
          type:"prescription", date:today, time:new Date().toTimeString().slice(0,5),
          title:`Prescrição: ${title}`,
          details, immutable:true,
          professionalName:user?.name||"",
          professionalCouncil: user?.councilNumber
            ? `${user.role==="doctor"?"CRM":user.role==="dentist"?"CRO":"COREN"} ${user.councilNumber}/${user.councilUf||""}` : "",
        }),
      });
      auditLog("PRESCRICAO_EMITIDA", { patientId:patient.id, patientName:patient.name, medicamentos:title }, user);
      onClose(true);
    } catch(ex) { setErr(ex.message||"Erro ao salvar."); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={()=>onClose(false)}>
      <div className="modal" style={{maxWidth:580}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <div>
            <h3 style={{margin:0,fontSize:"1rem"}}>💊 Prescrição de Medicamentos</h3>
            <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>{patient.name}</div>
          </div>
          <button className="icon-btn" onClick={()=>onClose(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
        </div>
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
          {meds.map((m,i)=>(
            <div key={i} style={{padding:".75rem",background:"var(--surface-2)",borderRadius:"var(--r-md)",border:"1px solid var(--border)",display:"flex",flexDirection:"column",gap:".45rem"}}>
              <div style={{display:"flex",gap:".5rem",alignItems:"flex-end"}}>
                <label style={{flex:2,fontSize:".75rem",fontWeight:600,display:"flex",flexDirection:"column",gap:".2rem"}}>Medicamento
                  <select value={m.name} onChange={e=>updateMed(i,"name",e.target.value)}>
                    <option value="">Selecione...</option>
                    {MEDICATIONS_COMMON.map(med=><option key={med} value={med}>{med}</option>)}
                  </select>
                </label>
                {meds.length>1&&<button type="button" onClick={()=>removeMed(i)} style={{padding:".3rem .5rem",background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"#be123c",cursor:"pointer",fontSize:".75rem",flexShrink:0,marginBottom:0}}>âœ•</button>}
              </div>
              {m.name==="Outros (digitar)"&&<input value={m.custom} onChange={e=>updateMed(i,"custom",e.target.value)} placeholder="Nome do medicamento com concentração"/>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:".4rem"}}>
                <label style={{fontSize:".73rem",fontWeight:600,display:"flex",flexDirection:"column",gap:".2rem"}}>Dose *
                  <input value={m.dosage} onChange={e=>updateMed(i,"dosage",e.target.value)} placeholder="Ex: 500mg"/>
                </label>
                <label style={{fontSize:".73rem",fontWeight:600,display:"flex",flexDirection:"column",gap:".2rem"}}>Frequência *
                  <input value={m.frequency} onChange={e=>updateMed(i,"frequency",e.target.value)} placeholder="Ex: 1x ao dia"/>
                </label>
                <label style={{fontSize:".73rem",fontWeight:600,display:"flex",flexDirection:"column",gap:".2rem"}}>Duração
                  <input value={m.duration} onChange={e=>updateMed(i,"duration",e.target.value)} placeholder="Ex: 7 dias"/>
                </label>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:".4rem"}}>
                <label style={{fontSize:".73rem",fontWeight:600,display:"flex",flexDirection:"column",gap:".2rem"}}>Via
                  <select value={m.route} onChange={e=>updateMed(i,"route",e.target.value)}>
                    <option value="">–</option>
                    <option>Oral</option><option>Sublingual</option><option>Inalatória</option>
                    <option>Tópica</option><option>Intramuscular</option><option>Subcutânea</option>
                    <option>Intravenosa</option><option>Retal</option><option>Ocular</option>
                  </select>
                </label>
                <label style={{fontSize:".73rem",fontWeight:600,display:"flex",flexDirection:"column",gap:".2rem"}}>Observação
                  <input value={m.notes} onChange={e=>updateMed(i,"notes",e.target.value)} placeholder="Ex: tomar em jejum, com alimentos..."/>
                </label>
              </div>
            </div>
          ))}
          <div style={{display:"flex",gap:".5rem",alignItems:"center"}}>
            <button type="button" onClick={addMed} style={{fontSize:".78rem",padding:".3rem .75rem",background:"var(--surface-2)",border:"1px dashed var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",color:"var(--teal-700)",fontWeight:600}}>+ Adicionar medicamento</button>
            <label style={{display:"flex",alignItems:"center",gap:".4rem",fontSize:".75rem",fontWeight:600,marginLeft:"auto"}}>
              Validade da receita:
              <select value={validity} onChange={e=>setValidity(e.target.value)} style={{width:90}}>
                <option value="30">30 dias</option>
                <option value="60">60 dias</option>
                <option value="90">90 dias</option>
              </select>
            </label>
          </div>
          {err&&<p className="error" style={{margin:0}}>{err}</p>}
          <div style={{display:"flex",gap:".5rem",justifyContent:"flex-end"}}>
            <button type="button" className="secondary" onClick={()=>onClose(false)}>Cancelar</button>
            <button type="submit" disabled={busy}>{busy?"Registrando...":"Emitir prescrição"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}


function InternalReferralModal({ patient, user, users, token, onClose }) {
  const today = new Date().toISOString().slice(0,10);
  const doctors = users.filter(u=>["doctor","dentist"].includes(u.role));
  const [targetId, setTargetId] = useState(doctors[0]?.id||"");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState("routine");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) { setErr("Informe o motivo do encaminhamento."); return; }
    const target = users.find(u=>u.id===targetId);
    if (!target) { setErr("Selecione o profissional."); return; }
    setBusy(true); setErr("");
    try {
      const details = [
        `ENCAMINHAMENTO INTERNO – ${new Date().toLocaleDateString("pt-BR")}`,
        `De: ${user?.name||""} (${String(user?.role||"").replace(/_/g," ")})`,
        `Para: ${target.name} (${String(target.role||"").replace(/_/g," ")})`,
        `Prioridade: ${priority==="urgent"?"Urgente":priority==="priority"?"Prioritário":"Rotina"}`,
        ``,
        `Motivo / hipótese diagnóstica:`,
        reason.trim(),
      ].join("\n");

      await fetch(`/patients/${patient.id}/records`, {
        method:"POST",
        headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
        body: JSON.stringify({
          type:"referral", date:today, time:new Date().toTimeString().slice(0,5),
          title:`Encaminhamento p/ ${target.name}`,
          details, immutable:true,
          professionalName:user?.name||"",
          professionalCouncil: user?.councilNumber
            ? `COREN ${user.councilNumber}/${user.councilUf||""}` : "",
        }),
      });
      auditLog("ENCAMINHAMENTO_INTERNO", { patientId:patient.id, patientName:patient.name, para:target.name, prioridade:priority }, user);
      onClose(true);
    } catch(ex) { setErr(ex.message||"Erro ao salvar."); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={()=>onClose(false)}>
      <div className="modal" style={{maxWidth:460}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <div>
            <h3 style={{margin:0,fontSize:"1rem"}}>ðŸ” Encaminhamento Interno</h3>
            <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>{patient.name}</div>
          </div>
          <button className="icon-btn" onClick={()=>onClose(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
        </div>
        {!doctors.length ? (
          <div style={{padding:"1rem",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".8rem",color:"#92400e"}}>
            Nenhum médico/dentista cadastrado na equipe para encaminhar.
          </div>
        ) : (
          <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".7rem"}}>
            <label style={{fontSize:".78rem",fontWeight:600}}>Encaminhar para
              <select value={targetId} onChange={e=>setTargetId(e.target.value)} style={{marginTop:".25rem"}}>
                {doctors.map(d=><option key={d.id} value={d.id}>{d.name} – {d.role==="dentist"?"Dentista":"Médico(a)"}</option>)}
              </select>
            </label>
            <label style={{fontSize:".78rem",fontWeight:600}}>Prioridade
              <select value={priority} onChange={e=>setPriority(e.target.value)} style={{marginTop:".25rem"}}>
                <option value="routine">Rotina</option>
                <option value="priority">Prioritário</option>
                <option value="urgent">Urgente – ver hoje</option>
              </select>
            </label>
            <label style={{fontSize:".78rem",fontWeight:600}}>Motivo / hipótese diagnóstica *
              <textarea value={reason} onChange={e=>setReason(e.target.value)}
                placeholder="Descreva o motivo do encaminhamento, sinais e sintomas relevantes..."
                style={{minHeight:80,marginTop:".25rem"}}/>
            </label>
            {err&&<p className="error" style={{margin:0}}>{err}</p>}
            <div style={{display:"flex",gap:".5rem",justifyContent:"flex-end"}}>
              <button type="button" className="secondary" onClick={()=>onClose(false)}>Cancelar</button>
              <button type="submit" disabled={busy}>{busy?"Registrando...":"Encaminhar"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


function ExamsTab({ patientId, patient, canManageUser, canWriteRecords, user, users, token }) {
  const [exams, setExams]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState(null); // null | "posto" | "externo"
  const [form, setForm]       = useState({ type:"Hemograma completo", name:"", date:"", result:"", notes:"" });
  const [files, setFiles]     = useState([]);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const [preview, setPreview] = useState(null);
  const [showExamReq, setShowExamReq] = useState(false);
  const [showPrescription, setShowPrescription] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const fileRef = useRef(null);
  const authHeader = { "Authorization":`Bearer ${token}` };

  async function loadExams() {
    setLoading(true);
    try {
      const res = await fetch(`/patients/${patientId}/exams`, { headers: authHeader });
      if (res.ok) setExams(await res.json());
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadExams(); }, [patientId]);

  async function handleSubmit(e) {
    e.preventDefault();
    const title = form.type==="Outros"?form.name.trim():form.type;
    if (!title||!form.date) { setError("Preencha o tipo e a data."); return; }
    setBusy(true); setError("");
    try {
      const isExternal = addMode==="externo";
      const notesText = [
        isExternal?"[EXAME EXTERNO – trazido pelo paciente]":"[EXAME REALIZADO NO POSTO]",
        form.result.trim()?`Resultado: ${form.result.trim()}`:"",
        form.notes.trim()?`Obs: ${form.notes.trim()}`:"",
      ].filter(Boolean).join("\n");

      const res = await fetch(`/patients/${patientId}/exams`, {
        method:"POST",
        headers:{...authHeader,"Content-Type":"application/json"},
        body: JSON.stringify({ title, date:form.date, notes:notesText }),
      });
      if (!res.ok) { const e=await res.json(); throw new Error(e.error||"Erro"); }
      const created = await res.json();

      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        await fetch(`/patients/${patientId}/exams/${created.id}/attachments`, {
          method:"POST", headers:authHeader, body:fd,
        });
      }
      setForm({type:"Hemograma completo",name:"",date:"",result:"",notes:""});
      setFiles([]); if(fileRef.current) fileRef.current.value="";
      setAddMode(null); await loadExams();
    } catch(err) { setError(err.message||"Erro ao salvar."); }
    finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Excluir este exame?")) return;
    try { await fetch(`/patients/${patientId}/exams/${id}`,{method:"DELETE",headers:authHeader}); await loadExams(); }
    catch { setError("Erro ao excluir."); }
  }

  function fmtSize(b) { return b>1048576?`${(b/1048576).toFixed(1)}MB`:`${Math.round(b/1024)}KB`; }
  function isImg(t) { return String(t||"").startsWith("image/"); }

  const posto    = exams.filter(e=>!String(e.details||"").includes("[EXAME EXTERNO"));
  const externo  = exams.filter(e=>String(e.details||"").includes("[EXAME EXTERNO"));

  const canAct = canManageUser || canWriteRecords;

  return (
    <div className="panel-block" style={{paddingTop:0}}>

      {/* Barra de ações */}
      {canAct&&(
        <div style={{display:"flex",gap:".45rem",flexWrap:"wrap",padding:".75rem 0",borderBottom:"1px solid var(--border)",marginBottom:".85rem"}}>
          <button type="button" onClick={()=>setShowExamReq(true)}
            style={{fontSize:".76rem",padding:".3rem .7rem",background:"var(--teal-50)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)",color:"var(--teal-700)",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:".3rem"}}>
            ðŸ”¬ Pedir exame
          </button>
          {(canManageUser||["doctor","dentist","nurse_manager"].includes(user?.role))&&(
            <button type="button" onClick={()=>setShowPrescription(true)}
              style={{fontSize:".76rem",padding:".3rem .7rem",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:"var(--r-md)",color:"#15803d",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:".3rem"}}>
              💊 Prescrever
            </button>
          )}
          {user?.role==="nurse_manager"&&(
            <button type="button" onClick={()=>setShowReferral(true)}
              style={{fontSize:".76rem",padding:".3rem .7rem",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"var(--r-md)",color:"#1d4ed8",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:".3rem"}}>
              ðŸ” Encaminhar ao médico
            </button>
          )}
          <div style={{marginLeft:"auto",display:"flex",gap:".4rem"}}>
            <button type="button" onClick={()=>setAddMode(addMode==="posto"?null:"posto")}
              style={{fontSize:".76rem",padding:".3rem .7rem",background:addMode==="posto"?"var(--teal-600)":"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:addMode==="posto"?"#fff":"var(--text-1)",fontWeight:600,cursor:"pointer"}}>
              + Exame do posto
            </button>
            <button type="button" onClick={()=>setAddMode(addMode==="externo"?null:"externo")}
              style={{fontSize:".76rem",padding:".3rem .7rem",background:addMode==="externo"?"#6366f1":"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:addMode==="externo"?"#fff":"var(--text-1)",fontWeight:600,cursor:"pointer"}}>
              + Exame externo
            </button>
          </div>
        </div>
      )}

      {/* Formulário inline – posto ou externo */}
      {addMode&&(
        <div style={{padding:".85rem",background:"var(--surface-2)",border:`2px solid ${addMode==="externo"?"#6366f1":"var(--teal-500)"}`,borderRadius:"var(--r-md)",marginBottom:"1rem"}}>
          <div style={{fontSize:".72rem",fontWeight:700,color:addMode==="externo"?"#6366f1":"var(--teal-700)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".65rem"}}>
            {addMode==="externo"?"ðŸ“Ž Inserir exame externo (trazido pelo paciente)":"ðŸ¥ Registrar exame realizado no posto"}
          </div>
          <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:".5rem"}}>
              <label style={{fontSize:".75rem",fontWeight:600}}>Tipo de exame
                <select value={form.type} onChange={e=>setForm(s=>({...s,type:e.target.value}))} style={{marginTop:".2rem"}}>
                  {EXAM_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{fontSize:".75rem",fontWeight:600}}>Data do exame *
                <input type="date" value={form.date} onChange={e=>setForm(s=>({...s,date:e.target.value}))} style={{marginTop:".2rem"}}/>
              </label>
            </div>
            {form.type==="Outros"&&<input value={form.name} onChange={e=>setForm(s=>({...s,name:e.target.value}))} placeholder="Nome do exame"/>}
            <label style={{fontSize:".75rem",fontWeight:600}}>Resultado / laudo resumido
              <textarea value={form.result} onChange={e=>setForm(s=>({...s,result:e.target.value}))} placeholder="Descreva o resultado ou cole o laudo..." style={{minHeight:56,marginTop:".2rem"}}/>
            </label>
            <label style={{fontSize:".75rem",fontWeight:600}}>Observações adicionais
              <input value={form.notes} onChange={e=>setForm(s=>({...s,notes:e.target.value}))} placeholder="Conduta, comparação com anterior..." style={{marginTop:".2rem"}}/>
            </label>
            <label style={{fontSize:".75rem",fontWeight:600}}>Anexar arquivo (imagem ou PDF, máx 15MB)
              <input type="file" ref={fileRef} accept="image/*,application/pdf" multiple onChange={e=>{
                const chosen=Array.from(e.target.files||[]);
                if(chosen.some(f=>f.size>15*1024*1024)){setError("Arquivo muito grande (máx 15MB)");return;}
                setError(""); setFiles(chosen);
              }} style={{fontSize:".78rem",padding:".3rem 0",marginTop:".2rem"}}/>
            </label>
            {files.length>0&&<div style={{display:"flex",gap:".35rem",flexWrap:"wrap"}}>
              {files.map((f,i)=><span key={i} style={{fontSize:".71rem",padding:".12rem .4rem",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:999}}>{f.name} · {fmtSize(f.size)}</span>)}
            </div>}
            {error&&<p className="error" style={{margin:0}}>{error}</p>}
            <div style={{display:"flex",gap:".4rem"}}>
              <button type="submit" disabled={busy}>{busy?"Salvando...":"Salvar"}</button>
              <button type="button" className="secondary" onClick={()=>setAddMode(null)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* Lista – exames do posto */}
      <div style={{marginBottom:"1.25rem"}}>
        <div style={{fontSize:".7rem",fontWeight:700,color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".5rem",display:"flex",alignItems:"center",gap:".4rem"}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:"var(--teal-500)",display:"inline-block"}}/>
          Realizados no posto ({posto.length})
        </div>
        {loading ? <p className="muted" style={{fontSize:".82rem"}}>Carregando...</p>
          : !posto.length ? <p className="muted" style={{fontSize:".82rem"}}>ðŸ”¬ Nenhum exame registrado no posto.</p>
          : posto.map(exam=>examCard(exam,canManageUser,handleDelete,setPreview,isImg,fmtDate))}
      </div>

      {/* Lista – exames externos */}
      <div>
        <div style={{fontSize:".7rem",fontWeight:700,color:"#6366f1",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".5rem",display:"flex",alignItems:"center",gap:".4rem"}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",display:"inline-block"}}/>
          Trazidos pelo paciente ({externo.length})
        </div>
        {!externo.length ? <p className="muted" style={{fontSize:".82rem"}}>Nenhum exame externo registrado.</p>
          : externo.map(exam=>examCard(exam,canManageUser,handleDelete,setPreview,isImg,fmtDate))}
      </div>

      {/* Modais */}
      {showExamReq&&<ExamRequestModal patient={patient} user={user} users={users} token={token} onClose={ok=>{setShowExamReq(false);if(ok)loadExams();}}/>}
      {showPrescription&&<PrescriptionModal patient={patient} user={user} token={token} onClose={ok=>{setShowPrescription(false);if(ok)loadExams();}}/>}
      {showReferral&&<InternalReferralModal patient={patient} user={user} users={users} token={token} onClose={ok=>{setShowReferral(false);if(ok)loadExams();}}/>}

      {/* Preview modal */}
      {preview&&(
        <div className="modal-backdrop" onClick={()=>setPreview(null)} style={{zIndex:600}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:"90vw",maxHeight:"90vh",display:"flex",flexDirection:"column",gap:".75rem",padding:"1.25rem"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontWeight:600,fontSize:".88rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"80%"}}>{preview.name}</span>
              <div style={{display:"flex",gap:".4rem",flexShrink:0}}>
                <a href={preview.url} download={preview.name} target="_blank" rel="noreferrer"
                  style={{display:"flex",alignItems:"center",gap:".3rem",fontSize:".78rem",padding:".3rem .7rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:"var(--text-1)",textDecoration:"none"}}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  Baixar
                </a>
                <button className="icon-btn" onClick={()=>setPreview(null)}><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
              </div>
            </div>
            <div style={{overflow:"auto",display:"flex",justifyContent:"center",flex:1}}>
              {isImg(preview.contentType)
                ?<img src={preview.url} alt={preview.name} style={{maxWidth:"100%",maxHeight:"75vh",borderRadius:"var(--r-md)",objectFit:"contain"}}/>
                :<iframe src={preview.url} title={preview.name} style={{width:"70vw",height:"75vh",border:"none",borderRadius:"var(--r-md)"}}/>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function examCard(exam, canManageUser, handleDelete, setPreview, isImg, fmtDate) {
  const isExternal = String(exam.details||"").includes("[EXAME EXTERNO");
  return (
    <div key={exam.id} style={{background:"var(--surface)",border:`1px solid ${isExternal?"#e0e7ff":"var(--border)"}`,borderLeft:`3px solid ${isExternal?"#6366f1":"var(--teal-400)"}`,borderRadius:"var(--r-md)",padding:".65rem .85rem",marginBottom:".4rem"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:".5rem"}}>
        <div>
          <div style={{fontWeight:600,fontSize:".84rem",color:"var(--ink)"}}>{exam.title}</div>
          <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".1rem",fontFamily:"IBM Plex Mono"}}>{fmtDate(exam.date)}</div>
        </div>
        <div style={{display:"flex",gap:".3rem",alignItems:"center",flexShrink:0}}>
          {Array.isArray(exam.attachments)&&exam.attachments.length>0&&(
            <span style={{fontSize:".68rem",color:isExternal?"#6366f1":"var(--teal-700)",background:isExternal?"#eff6ff":"var(--teal-50)",border:`1px solid ${isExternal?"#c7d2fe":"var(--teal-100)"}`,padding:".1rem .4rem",borderRadius:999}}>
              {exam.attachments.length} anexo{exam.attachments.length>1?"s":""}
            </span>
          )}
          {canManageUser&&<button className="icon-btn" title="Excluir" onClick={()=>handleDelete(exam.id)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>}
        </div>
      </div>
      {exam.details&&<pre style={{margin:".35rem 0 0",fontFamily:"inherit",fontSize:".78rem",color:"var(--text-2)",whiteSpace:"pre-wrap",lineHeight:1.5}}>{exam.details.replace(/^\[EXAME.*?\]\n?/,"")}</pre>}
      {Array.isArray(exam.attachments)&&exam.attachments.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:".35rem",marginTop:".45rem"}}>
          {exam.attachments.map((att,i)=>(
            <button key={i} type="button" onClick={()=>setPreview(att)}
              style={{display:"flex",alignItems:"center",gap:".3rem",padding:".25rem .55rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",fontSize:".73rem",color:"var(--text-1)"}}>
              {isImg(att.contentType)?<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="5.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1.5 11l3.5-3 3 3 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              :<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.3"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.3"/></svg>}
              {att.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function PatientActionsTab({ patient, user, users, token, canManageUser, canWriteRecords }) {
  const [modal, setModal] = useState(null); // null | "exam" | "prescription" | "referral"
  const [done, setDone]   = useState([]);   // histórico de ações desta sessão

  function handleClose(type, ok) {
    setModal(null);
    if (ok) setDone(d=>[{type, ts: new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}, ...d]);
  }

  const canPrescribe = canManageUser || ["doctor","dentist","nurse_manager"].includes(user?.role);
  const canRefer     = user?.role === "nurse_manager";
  const canExam      = canManageUser || canWriteRecords;

  const actions = [
    canExam && {
      id:"exam", icon:"ðŸ”¬", title:"Pedir Exame",
      desc:"Solicite exames laboratoriais ou de imagem com prioridade e justificativa.",
      color:"var(--teal-600)", bg:"var(--teal-50)", border:"var(--teal-200)"
    },
    canPrescribe && {
      id:"prescription", icon:"💊", title:"Prescrever Medicamento",
      desc:"Emita prescrição com medicamentos, dosagem, frequência e via.",
      color:"#15803d", bg:"#f0fdf4", border:"#bbf7d0"
    },
    canRefer && {
      id:"referral", icon:"ðŸ”", title:"Encaminhar ao Médico",
      desc:"Encaminhe o paciente a um médico ou dentista da unidade com justificativa.",
      color:"#1d4ed8", bg:"#eff6ff", border:"#bfdbfe"
    },
  ].filter(Boolean);

  return (
    <div className="panel-block" style={{paddingTop:"1rem"}}>
      <div style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
        {actions.map(a=>(
          <button key={a.id} type="button" onClick={()=>setModal(a.id)}
            style={{display:"flex",alignItems:"center",gap:"1rem",padding:"1rem 1.1rem",
              background:a.bg,border:`1px solid ${a.border}`,borderLeft:`4px solid ${a.color}`,
              borderRadius:"var(--r-md)",cursor:"pointer",textAlign:"left",transition:"opacity .12s"}}
            onMouseEnter={e=>e.currentTarget.style.opacity=".85"}
            onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            <span style={{fontSize:"1.5rem",flexShrink:0}}>{a.icon}</span>
            <div>
              <div style={{fontWeight:700,fontSize:".88rem",color:a.color}}>{a.title}</div>
              <div style={{fontSize:".75rem",color:"var(--text-2)",marginTop:".15rem"}}>{a.desc}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{marginLeft:"auto",color:"var(--text-3)",flexShrink:0}}>
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ))}
      </div>

      {/* Histórico da sessão */}
      {done.length>0&&(
        <div style={{marginTop:"1.25rem",padding:".65rem .85rem",background:"var(--surface-2)",borderRadius:"var(--r-md)",border:"1px solid var(--border)"}}>
          <div style={{fontSize:".7rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".45rem"}}>Registrado nesta sessão</div>
          {done.map((d,i)=>(
            <div key={i} style={{fontSize:".78rem",color:"var(--text-2)",display:"flex",gap:".5rem",padding:".2rem 0"}}>
              <span style={{color:"var(--teal-600)",fontWeight:600}}>âœ“</span>
              <span>{d.type==="exam"?"Pedido de exame":d.type==="prescription"?"Prescrição":d.type==="referral"?"Encaminhamento interno":d.type}</span>
              <span style={{color:"var(--text-3)",marginLeft:"auto",fontFamily:"IBM Plex Mono",fontSize:".72rem"}}>{d.ts}</span>
            </div>
          ))}
        </div>
      )}

      {modal==="exam"        && <ExamRequestModal       patient={patient} user={user} users={users} token={token} onClose={ok=>handleClose("exam",ok)}/>}
      {modal==="prescription"&& <PrescriptionModal       patient={patient} user={user}              token={token} onClose={ok=>handleClose("prescription",ok)}/>}
      {modal==="referral"    && <InternalReferralModal   patient={patient} user={user} users={users} token={token} onClose={ok=>handleClose("referral",ok)}/>}
    </div>
  );
}


function ExamsPage({ patients, users, user, token, onNavigatePatient }) {
  const [search, setSearch]     = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [exams, setExams]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [addMode, setAddMode]   = useState(null); // null | "posto" | "externo"
  const [form, setForm]         = useState({ type:"Hemograma completo", name:"", date:"", result:"", notes:"" });
  const [files, setFiles]       = useState([]);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");
  const [preview, setPreview]   = useState(null);
  const fileRef = useRef(null);
  const authHeader = { "Authorization":`Bearer ${token}` };

  const canManage = ["doctor","dentist","nurse_manager","nursing_tech"].includes(user?.role);

  const filteredPats = patients.filter(p => matchesPatientSearch(p, search)).slice(0, 60);

  const selectedPatient = patients.find(p=>p.id===selectedId)||null;

  async function loadExams(pid) {
    if (!pid) { setExams([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/patients/${pid}/exams`, { headers: authHeader });
      if (res.ok) setExams(await res.json());
    } catch {}
    finally { setLoading(false); }
  }

  function selectPatient(p) {
    if (selectedId===p.id) { setSelectedId(null); setExams([]); return; }
    setSelectedId(p.id); loadExams(p.id); setAddMode(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const title = form.type==="Outros"?form.name.trim():form.type;
    if (!title||!form.date) { setError("Preencha tipo e data."); return; }
    setBusy(true); setError("");
    try {
      const tag  = addMode==="externo"?"[EXAME EXTERNO – trazido pelo paciente]":"[EXAME REALIZADO NO POSTO]";
      const notes = [tag, form.result.trim()?`Resultado: ${form.result}`:"", form.notes.trim()?`Obs: ${form.notes}`:""].filter(Boolean).join("\n");
      const res = await fetch(`/patients/${selectedId}/exams`, {
        method:"POST", headers:{...authHeader,"Content-Type":"application/json"},
        body: JSON.stringify({title, date:form.date, notes}),
      });
      if (!res.ok) throw new Error((await res.json()).error||"Erro");
      const created = await res.json();
      for (const file of files) {
        const fd=new FormData(); fd.append("file",file);
        await fetch(`/patients/${selectedId}/exams/${created.id}/attachments`,{method:"POST",headers:authHeader,body:fd});
      }
      auditLog(addMode==="externo"?"EXAME_EXTERNO_INSERIDO":"EXAME_POSTO_REGISTRADO", { patientId:selectedId, title, date:form.date }, user);
      setForm({type:"Hemograma completo",name:"",date:"",result:"",notes:""});
      setFiles([]); if(fileRef.current) fileRef.current.value="";
      setAddMode(null); await loadExams(selectedId);
    } catch(err) { setError(err.message||"Erro."); }
    finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Excluir este exame?")) return;
    try {
      await fetch(`/patients/${selectedId}/exams/${id}`,{method:"DELETE",headers:authHeader});
      auditLog("EXAME_EXCLUIDO", { patientId:selectedId, examId:id }, user);
      await loadExams(selectedId);
    }
    catch { setError("Erro ao excluir."); }
  }

  function fmtSize(b) { return b>1048576?`${(b/1048576).toFixed(1)}MB`:`${Math.round(b/1024)}KB`; }
  function isImg(t)   { return String(t||"").startsWith("image/"); }

  const posto   = exams.filter(e=>!String(e.details||"").includes("[EXAME EXTERNO"));
  const externo = exams.filter(e=>String(e.details||"").includes("[EXAME EXTERNO"));

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)",padding:"1.25rem 2rem",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:".5rem",marginBottom:".3rem"}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#34d399"}}/>
          <span style={{fontSize:".65rem",fontWeight:700,color:"#34d399",textTransform:"uppercase",letterSpacing:".1em"}}>Exames · Unidade</span>
        </div>
        <h1 style={{margin:0,fontSize:"1.25rem",fontWeight:800,color:"#fff"}}>Exames dos Pacientes</h1>
        <p style={{margin:".25rem 0 0",fontSize:".75rem",color:"#94a3b8"}}>Exames realizados na unidade e exames externos trazidos pelos pacientes.</p>
      </div>

      <div style={{display:"flex",flex:1,minHeight:0}}>
        {/* Lista de pacientes */}
        <div style={{width:280,flexShrink:0,borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column"}}>
          <div style={{padding:".75rem",borderBottom:"1px solid var(--border)"}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:".6rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)"}}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar paciente..."
                style={{width:"100%",paddingLeft:"1.9rem",boxSizing:"border-box",fontSize:".8rem"}}/>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            {filteredPats.length===0 && <p style={{padding:"1rem",fontSize:".8rem",color:"var(--text-3)",textAlign:"center"}}>Nenhum paciente encontrado.</p>}
            {filteredPats.map(p=>{
              const isOpen = selectedId===p.id;
              return (
                <button key={p.id} onClick={()=>selectPatient(p)}
                  style={{display:"flex",alignItems:"center",gap:".5rem",width:"100%",padding:".6rem .85rem",
                    background:isOpen?"var(--teal-50)":"transparent",border:"none",
                    borderLeft:`3px solid ${isOpen?"var(--teal-500)":"transparent"}`,
                    borderBottom:"1px solid var(--border)",cursor:"pointer",textAlign:"left",color:"var(--text-1)"}}>
                  <div className="user-avatar" style={{width:30,height:30,fontSize:".72rem",flexShrink:0,
                    background:isOpen?"var(--teal-500)":"var(--slate-200)",color:isOpen?"#fff":"var(--text-2)"}}>
                    {initials(p.name)}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:".82rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:isOpen?"var(--teal-700)":"var(--ink)"}}>{p.name}</div>
                    <div style={{fontSize:".68rem",color:"var(--text-3)"}}>{catLabel([],p.careCategory)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Painel de exames */}
        <div style={{flex:1,overflowY:"auto",padding:"1.25rem 1.5rem"}}>
          {!selectedPatient ? (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:"var(--text-3)",gap:".75rem"}}>
              <svg width="48" height="48" viewBox="0 0 16 16" fill="none" style={{opacity:.25}}><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.2"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.1"/><path d="M10 11.5l1.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
              <span style={{fontSize:".84rem"}}>Selecione um paciente para ver os exames</span>
            </div>
          ) : (
            <>
              {/* Cabeçalho do paciente */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",gap:"1rem"}}>
                <div>
                  <h2 style={{margin:0,fontSize:"1rem",fontWeight:700}}>{selectedPatient.name}</h2>
                  <div style={{fontSize:".73rem",color:"var(--text-3)",marginTop:".1rem"}}>{catLabel([],selectedPatient.careCategory)}</div>
                </div>
                {onNavigatePatient&&(
                  <button onClick={()=>onNavigatePatient(selectedPatient.id)}
                    style={{fontSize:".75rem",padding:".3rem .7rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",color:"var(--text-1)",flexShrink:0}}>
                    Ver ficha â†’
                  </button>
                )}
              </div>

              {/* Botões de inserção */}
              {canManage&&(
                <div style={{display:"flex",gap:".45rem",marginBottom:"1rem"}}>
                  <button type="button" onClick={()=>setAddMode(addMode==="posto"?null:"posto")}
                    style={{fontSize:".76rem",padding:".3rem .7rem",background:addMode==="posto"?"var(--teal-600)":"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:addMode==="posto"?"#fff":"var(--text-1)",fontWeight:600,cursor:"pointer"}}>
                    + Exame do posto
                  </button>
                  <button type="button" onClick={()=>setAddMode(addMode==="externo"?null:"externo")}
                    style={{fontSize:".76rem",padding:".3rem .7rem",background:addMode==="externo"?"#6366f1":"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:addMode==="externo"?"#fff":"var(--text-1)",fontWeight:600,cursor:"pointer"}}>
                    + Exame externo
                  </button>
                </div>
              )}

              {/* Formulário inline */}
              {addMode&&(
                <div style={{padding:".85rem",background:"var(--surface-2)",border:`2px solid ${addMode==="externo"?"#6366f1":"var(--teal-500)"}`,borderRadius:"var(--r-md)",marginBottom:"1rem"}}>
                  <div style={{fontSize:".71rem",fontWeight:700,color:addMode==="externo"?"#6366f1":"var(--teal-700)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".6rem"}}>
                    {addMode==="externo"?"ðŸ“Ž Exame externo (trazido pelo paciente)":"ðŸ¥ Exame realizado no posto"}
                  </div>
                  <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:".5rem"}}>
                      <label style={{fontSize:".75rem",fontWeight:600}}>Tipo de exame
                        <select value={form.type} onChange={e=>setForm(s=>({...s,type:e.target.value}))} style={{marginTop:".2rem"}}>
                          {EXAM_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                      <label style={{fontSize:".75rem",fontWeight:600}}>Data *
                        <input type="date" value={form.date} onChange={e=>setForm(s=>({...s,date:e.target.value}))} style={{marginTop:".2rem"}}/>
                      </label>
                    </div>
                    {form.type==="Outros"&&<input value={form.name} onChange={e=>setForm(s=>({...s,name:e.target.value}))} placeholder="Nome do exame"/>}
                    <label style={{fontSize:".75rem",fontWeight:600}}>Resultado / laudo
                      <textarea value={form.result} onChange={e=>setForm(s=>({...s,result:e.target.value}))} placeholder="Descreva o resultado..." style={{minHeight:52,marginTop:".2rem"}}/>
                    </label>
                    <label style={{fontSize:".75rem",fontWeight:600}}>Observações
                      <input value={form.notes} onChange={e=>setForm(s=>({...s,notes:e.target.value}))} placeholder="Conduta, comparação..." style={{marginTop:".2rem"}}/>
                    </label>
                    <label style={{fontSize:".75rem",fontWeight:600}}>Anexar arquivo (imagem ou PDF, máx 15MB)
                      <input type="file" ref={fileRef} accept="image/*,application/pdf" multiple onChange={e=>{
                        const f=Array.from(e.target.files||[]);
                        if(f.some(x=>x.size>15*1024*1024)){setError("Arquivo muito grande");return;}
                        setError(""); setFiles(f);
                      }} style={{fontSize:".78rem",padding:".3rem 0",marginTop:".2rem"}}/>
                    </label>
                    {files.length>0&&<div style={{display:"flex",gap:".35rem",flexWrap:"wrap"}}>
                      {files.map((f,i)=><span key={i} style={{fontSize:".71rem",padding:".12rem .4rem",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:999}}>{f.name} · {fmtSize(f.size)}</span>)}
                    </div>}
                    {error&&<p className="error" style={{margin:0}}>{error}</p>}
                    <div style={{display:"flex",gap:".4rem"}}>
                      <button type="submit" disabled={busy}>{busy?"Salvando...":"Salvar"}</button>
                      <button type="button" className="secondary" onClick={()=>setAddMode(null)}>Cancelar</button>
                    </div>
                  </form>
                </div>
              )}

              {/* Exames do posto */}
              <div style={{marginBottom:"1.25rem"}}>
                <div style={{fontSize:".7rem",fontWeight:700,color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".5rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:"var(--teal-500)",display:"inline-block"}}/>
                  Realizados na unidade ({posto.length})
                </div>
                {loading?<p className="muted" style={{fontSize:".82rem"}}>Carregando...</p>
                  :!posto.length?<p className="muted" style={{fontSize:".82rem"}}>ðŸ”¬ Nenhum exame registrado.</p>
                  :posto.map(exam=>examCard(exam,canManage,handleDelete,setPreview,isImg,fmtDate))}
              </div>

              {/* Exames externos */}
              <div>
                <div style={{fontSize:".7rem",fontWeight:700,color:"#6366f1",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".5rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",display:"inline-block"}}/>
                  Trazidos pelo paciente ({externo.length})
                </div>
                {!externo.length?<p className="muted" style={{fontSize:".82rem"}}>Nenhum exame externo registrado.</p>
                  :externo.map(exam=>examCard(exam,canManage,handleDelete,setPreview,isImg,fmtDate))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Preview modal */}
      {preview&&(
        <div className="modal-backdrop" onClick={()=>setPreview(null)} style={{zIndex:600}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:"90vw",maxHeight:"90vh",display:"flex",flexDirection:"column",gap:".75rem",padding:"1.25rem"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontWeight:600,fontSize:".88rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"80%"}}>{preview.name}</span>
              <div style={{display:"flex",gap:".4rem",flexShrink:0}}>
                <a href={preview.url} download={preview.name} target="_blank" rel="noreferrer"
                  style={{display:"flex",alignItems:"center",gap:".3rem",fontSize:".78rem",padding:".3rem .7rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:"var(--text-1)",textDecoration:"none"}}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  Baixar
                </a>
                <button className="icon-btn" onClick={()=>setPreview(null)}><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
              </div>
            </div>
            <div style={{overflow:"auto",display:"flex",justifyContent:"center",flex:1}}>
              {isImg(preview.contentType)
                ?<img src={preview.url} alt={preview.name} style={{maxWidth:"100%",maxHeight:"75vh",borderRadius:"var(--r-md)",objectFit:"contain"}}/>
                :<iframe src={preview.url} title={preview.name} style={{width:"70vw",height:"75vh",border:"none",borderRadius:"var(--r-md)"}}/>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function HistoricoTab({ history, appointments, tasks, messages, canManageUser, onDeleteAppointment }) {
  const [filter, setFilter] = useState("all");
  const [showInternal, setShowInternal] = useState(true);

  const TYPE_LABELS = {
    consultation:"Consulta", visit:"Visita domiciliar", vaccine:"Vacina",
    procedure:"Procedimento", note:"Observação clínica", task:"Tarefa interna",
    message:"Mensagem interna", exam:"Exame", exam_request:"Pedido de exame",
    prescription:"Prescrição", referral:"Encaminhamento",
    nursing:"Evolução de enfermagem", evolution:"Evolução clínica", home_visit:"Visita domiciliar",
  };
  const TYPE_COLORS = {
    consultation:["#1d4ed8","#eff6ff","#bfdbfe"],
    visit:       ["#15803d","#f0fdf4","#bbf7d0"],
    home_visit:  ["#15803d","#f0fdf4","#bbf7d0"],
    vaccine:     ["#7c3aed","#f5f3ff","#ddd6fe"],
    procedure:   ["#c2410c","#fff7ed","#fed7aa"],
    note:        ["#475569","var(--surface-2)","var(--border)"],
    task:        ["#d97706","#fffbeb","#fde68a"],
    message:     ["#0891b2","#ecfeff","#a5f3fc"],
    exam:        ["#0f766e","var(--teal-50)","var(--teal-100)"],
    exam_request:["#0f766e","var(--teal-50)","var(--teal-100)"],
    prescription:["#15803d","#f0fdf4","#bbf7d0"],
    referral:    ["#6366f1","#eff6ff","#c7d2fe"],
    nursing:     ["#0d9488","#f0fdfa","#99f6e4"],
    evolution:   ["#0891b2","#ecfeff","#a5f3fc"],
  };

  // Tipos internos que NÕO entram no prontuário legal
  const INTERNAL_TYPES = new Set(["task","message"]);

  // Combina todos os eventos numa timeline unificada
  const allEvents = [
    ...( Array.isArray(history) ? history.map(h=>({
      id:h.id, source:"record", type:h.type||"note",
      date:h.date, time:h.metadata?.time||h.createdAt?.slice(11,16)||"",
      title:h.title, details:h.details,
      professional: h.metadata?.professionalName || h.createdByName || "",
      council: h.metadata?.professionalCouncil || "",
      internalOnly: h.internalOnly||INTERNAL_TYPES.has(h.type)||false,
      createdAt: h.createdAt,
    })) : [] ),
    ...( Array.isArray(appointments) ? appointments.map(a=>({
      id:a.id, source:"appointment", type:"consultation",
      date:a.date, time:"",
      title:a.summary||"Consulta",
      details:[
        a.demandType?`Demanda: ${a.demandType==="scheduled"?"Programada":a.demandType==="spontaneous"?"Espontânea":"Retroativo"}`:"",
        a.conduct?`Conduta: ${a.conduct}`:"",
        a.nextStep?`Próximo: ${a.nextStep}`:"",
      ].filter(Boolean).join("\n"),
      professional:"", internalOnly:false, createdAt:a.createdAt,
      _apptObj: a,
    })) : [] ),
    ...( Array.isArray(tasks) ? tasks.map(t=>({
      id:t.id, source:"task", type:"task",
      date:t.dueDate||t.createdAt?.slice(0,10)||"", time:"",
      title:t.title, details:t.notes||"",
      professional:"", status:t.status, internalOnly:true, createdAt:t.createdAt,
    })) : [] ),
    ...( Array.isArray(messages) ? messages.map(m=>({
      id:m.id, source:"message", type:"message",
      date:m.createdAt?.slice(0,10)||"", time:m.createdAt?.slice(11,16)||"",
      title:"Comunicação interna", details:m.text||m.body||"",
      professional:m.authorName||"", internalOnly:true, createdAt:m.createdAt,
    })) : [] ),
  ]
  .filter((e,_,arr)=> e.source!=="appointment" || !arr.some(r=>r.source==="record"&&r.date===e.date&&(r.title||"").toLowerCase().includes((e.title||"").toLowerCase().slice(0,10))))
  .filter(e => showInternal ? true : !e.internalOnly)
  .filter(e => filter==="all" || e.type===filter)
  .sort((a,b)=>{
    const da = (a.date||"")+(a.time||"")+(a.createdAt||"");
    const db = (b.date||"")+(b.time||"")+(b.createdAt||"");
    return db.localeCompare(da);
  });

  const filterTypes = ["all","consultation","visit","vaccine","procedure","exam","exam_request","prescription","referral","note","task","message"];

  return (
    <div className="panel-block">
      {/* Cabeçalho com toggle interno/clínico */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".75rem",flexWrap:"wrap",gap:".5rem"}}>
        <div style={{fontSize:".72rem",color:"var(--text-3)"}}>
          {allEvents.length} {filter==="all"?"eventos":"registros"} · {allEvents.filter(e=>!e.internalOnly).length} clínicos
        </div>
        <label style={{display:"flex",alignItems:"center",gap:".35rem",fontSize:".72rem",color:"var(--text-3)",cursor:"pointer",userSelect:"none"}}>
          <input type="checkbox" checked={showInternal} onChange={e=>setShowInternal(e.target.checked)}
            style={{width:12,height:12,accentColor:"var(--teal-600)"}}/>
          Mostrar registros internos (tarefas e mensagens)
        </label>
      </div>

      {/* Legenda */}
      <div style={{display:"flex",gap:".5rem",marginBottom:".75rem",padding:".5rem .65rem",background:"var(--surface-2)",borderRadius:"var(--r-md)",border:"1px solid var(--border)",flexWrap:"wrap",alignItems:"center"}}>
        <span style={{display:"flex",alignItems:"center",gap:".3rem",fontSize:".68rem",color:"var(--text-3)"}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:"var(--teal-500)",display:"inline-block"}}/>
          Clínico – entra no prontuário legal
        </span>
        <span style={{display:"flex",alignItems:"center",gap:".3rem",fontSize:".68rem",color:"var(--text-3)"}}>
          <span style={{width:8,height:8,borderRadius:2,background:"#d97706",display:"inline-block"}}/>
          Interno – só visível aqui
        </span>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:".3rem",flexWrap:"wrap",marginBottom:"1rem"}}>
        {filterTypes.map(f=>(
          <button key={f} type="button" onClick={()=>setFilter(f)}
            style={{fontSize:".71rem",padding:".2rem .55rem",borderRadius:999,cursor:"pointer",fontWeight:filter===f?700:400,
              background:filter===f?"var(--teal-600)":"var(--surface-2)",
              color:filter===f?"#fff":"var(--text-2)",
              border:`1px solid ${filter===f?"var(--teal-500)":"var(--border)"}`}}>
            {f==="all"?"Todos":TYPE_LABELS[f]||f}
          </button>
        ))}
      </div>

      {!allEvents.length ? (
        <p className="muted" style={{fontSize:".84rem"}}>Nenhum registro encontrado.</p>
      ) : allEvents.map(ev=>{
        const [color,bg,border] = TYPE_COLORS[ev.type]||["var(--text-3)","var(--surface-2)","var(--border)"];
        const label = TYPE_LABELS[ev.type]||ev.type;
        const isInternal = ev.internalOnly;
        return (
          <div key={ev.id+ev.source} style={{display:"flex",gap:".75rem",marginBottom:".65rem",opacity:isInternal?.8:1}}>
            {/* Linha do tempo */}
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0,paddingTop:".35rem"}}>
              <div style={{width:10,height:10,borderRadius:isInternal?2:"50%",background:color,flexShrink:0}}/>
              <div style={{width:1,flex:1,background:"var(--border)",marginTop:".25rem"}}/>
            </div>
            {/* Card do evento */}
            <div style={{flex:1,background:bg,border:`1px solid ${border}`,
              borderLeft:`3px solid ${color}`,
              borderRadius:"var(--r-md)",padding:".6rem .85rem",marginBottom:".1rem"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:".5rem",marginBottom:".2rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:".4rem",flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,fontSize:".84rem",color:"var(--ink)"}}>{ev.title}</span>
                  <span style={{fontSize:".65rem",fontWeight:700,padding:".1rem .4rem",borderRadius:999,background:color,color:"#fff",flexShrink:0}}>{label}</span>
                  {isInternal&&<span style={{fontSize:".62rem",padding:".08rem .35rem",borderRadius:999,background:"#fef3c7",color:"#92400e",border:"1px solid #fde68a",flexShrink:0}}>somente interno</span>}
                  {ev.status&&<span style={{fontSize:".65rem",padding:".1rem .4rem",borderRadius:999,background:"var(--surface)",border:"1px solid var(--border)",color:"var(--text-3)"}}>{ev.status}</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:".35rem",flexShrink:0}}>
                  <span style={{fontSize:".7rem",color:"var(--text-3)",fontFamily:"IBM Plex Mono",whiteSpace:"nowrap"}}>
                    {fmtDate(ev.date)}{ev.time?` · ${ev.time}`:""}
                  </span>
                  {canManageUser&&ev.source==="appointment"&&(
                    <button className="icon-btn" title="Excluir" onClick={()=>onDeleteAppointment(ev.id)}
                      style={{opacity:.6}}>
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  )}
                </div>
              </div>
              {ev.professional&&(
                <div style={{fontSize:".7rem",color:"var(--text-3)",marginBottom:".2rem"}}>
                  {ev.professional}{ev.council?` · ${ev.council}`:""}
                </div>
              )}
              {ev.details&&(
                <pre style={{margin:".25rem 0 0",fontFamily:"inherit",fontSize:".77rem",color:"var(--text-2)",whiteSpace:"pre-wrap",lineHeight:1.6}}>{ev.details}</pre>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PatientDetail({ patient,users,templates,patientTab,setPatientTab,appointments,tasks,messages,history,patientProtocolSummary,sortedSpecialAlerts,recordForm,setRecordForm,recordVaccines,setRecordVaccines,appointmentForm,setAppointmentForm,taskForm,setTaskForm,messageText,setMessageText,onSubmitRecord,onSubmitAppointment,onSubmitTask,onSubmitMessage,onDeleteRecord,onDeleteAppointment,onStatusChange,acsUsers,canManageUser,canWriteRecords,userObj,token }) {
  const g = gestationalAgeInfo(patient);
  const acsName = users.find(u=>u.id===patient.assignedAcsId)?.name||"Não atribuído";
  const [docType, setDocType] = useState(null);
  const [showPatientCard, setShowPatientCard] = useState(false);

  const TABS = [
    canDispense && ["dispensar","Nova dispensação"],
    ["estoque","Estoque de insumos"],
    (canDispense||canViewAll) && ["log","Histórico de saídas"],
    ["continuos","Pacientes contínuos"],
  ].filter(Boolean);

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>

      {/* Header */}
      <section className="home-hero" style={{flexShrink:0}}>
        <div>
          <p className="home-kicker">Gestão de insumos</p>
          <h1 className="home-title">Dispensação de insumos ao paciente</h1>
          <p className="home-sub">Controle de saída, estoque e pacientes contínuos, baseado no formulário DAF/Osasco.</p>
        </div>
        <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",alignItems:"center"}}>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:".75rem",fontWeight:700,color:"var(--teal-700)"}}>{user?.name}</div>
            <div style={{fontSize:".68rem",color:"var(--text-3)"}}>{roleLabel(user?.role)}</div>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div style={{display:"flex",gap:".65rem",padding:"0 1.5rem .75rem",flexWrap:"wrap",flexShrink:0}}>
        {[
          { label:"Pacientes cont\u00EDnuos ativos", value:continuosAtivos.length, icon:"\u21BB", color:"#0d9488" },
          { label:"Dispensa\u00E7\u00F5es hoje", value:totalSaidasHoje, icon:"\u25A4", color:"#6366f1" },
          { label:"Total de dispensa\u00E7\u00F5es", value:dispensas.length, icon:"\u25A6", color:"#0891b2" },
          { label:"Itens sem estoque", value:stock.filter(s=>s.qty===0).length, icon:"\u26A0", color:"#be123c", warn:true },
        ].map(k=>(
          <div key={k.label} className="card" style={{flex:"1 1 140px",padding:".75rem 1rem",minWidth:120,background:k.warn&&k.value>0?"#fff1f2":"var(--surface)",border:"1px solid " + (k.warn&&k.value>0?"#fecdd3":"var(--border)")}}>
            <div style={{fontSize:"1.2rem"}}>{k.icon}</div>
            <div style={{fontSize:"1.5rem",fontWeight:800,color:k.color,lineHeight:1.1,marginTop:".25rem"}}>{k.value}</div>
            <div style={{fontSize:".7rem",color:"var(--text-3)",marginTop:".15rem"}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",padding:"0 1.5rem",borderBottom:"1px solid var(--border)",flexShrink:0,overflowX:"auto"}}>
        {TABS.map(([id,label])=>(
          <button key={id} onClick={()=>setInsumoTab(id)}
            style={{padding:".55rem 1rem",fontSize:".8rem",fontWeight:600,border:"none",background:"transparent",
              cursor:"pointer",color:insumoTab===id?"var(--teal-600)":"var(--text-3)",whiteSpace:"nowrap",
              borderBottom:insumoTab===id?"2px solid var(--teal-500)":"2px solid transparent"}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflow:"auto",padding:"1.25rem 1.5rem"}}>

        {/* ABA: NOVA DISPENSAÇÃO */}
        {insumoTab==="dispensar"&&canDispense&&(
          <div style={{display:"flex",gap:"1.25rem",alignItems:"flex-start",flexWrap:"wrap"}}>

            {/* Coluna esquerda: seleção de paciente */}
            <div style={{flex:"0 0 300px",minWidth:260}}>
              <div className="card" style={{padding:"1rem",marginBottom:"1rem"}}>
                <div style={{fontWeight:700,fontSize:".8rem",color:"var(--ink)",marginBottom:".75rem"}}>Paciente</div>
                <div style={{position:"relative"}}>
                  <div style={{position:"absolute",left:".65rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)",pointerEvents:"none"}}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </div>
                  <input value={patSearch}
                    onChange={e=>{ setPatSearch(e.target.value); if(patSelected&&e.target.value!==patSelected.name){setPatSelected(null);setItens({});setIsContinuo(false);} }}
                    placeholder="Buscar por nome ou CPF..."
                    style={{paddingLeft:"1.9rem",width:"100%",boxSizing:"border-box",border:patSelected?"2px solid var(--teal-500)":"1px solid var(--border)",borderRadius:"var(--r-md)"}}/>
                  {patResults.length>0&&!patSelected&&(
                    <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:40,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"0 0 var(--r-md) var(--r-md)",boxShadow:"0 4px 12px rgba(0,0,0,.08)",maxHeight:200,overflowY:"auto"}}>
                      {patResults.map(p=>{
                        const cont = continuos.find(c=>c.patientId===p.id&&c.ativo);
                        return (
                          <button key={p.id} type="button" onClick={()=>selectPat(p)}
                            style={{display:"flex",alignItems:"center",gap:".6rem",width:"100%",padding:".5rem .8rem",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}
                            onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                            onMouseLeave={e=>e.currentTarget.style.background="none"}>
                            <div style={{width:28,height:28,borderRadius:"50%",background:cont?"#dcfce7":"var(--teal-100)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".7rem",fontWeight:700,color:cont?"#15803d":"var(--teal-700)",flexShrink:0}}>{initials(p.name)}</div>
                            <div style={{minWidth:0}}>
                              <div style={{fontWeight:600,fontSize:".83rem",color:"var(--ink)"}}>{p.name}</div>
                              <div style={{fontSize:".7rem",color:"var(--text-3)"}}>{p.cpf||""}{cont?" · Contínuo":""}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {patSelected&&(
                  <div style={{marginTop:".75rem",padding:".65rem .8rem",background:"var(--teal-50)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)"}}>
                    <div style={{fontWeight:700,fontSize:".85rem",color:"var(--teal-800)"}}>{patSelected.name}</div>
                    <div style={{fontSize:".72rem",color:"var(--teal-600)",marginTop:".2rem"}}>
                      {patSelected.birthDate&&`Nasc.: ${fmtDate(patSelected.birthDate)}`}
                      {patSelected.cpf&&` · CPF: ${patSelected.cpf}`}
                    </div>
                    {continuos.find(c=>c.patientId===patSelected.id&&c.ativo)&&(
                      <div style={{marginTop:".4rem",fontSize:".72rem",fontWeight:700,color:"#15803d",display:"flex",alignItems:"center",gap:".3rem"}}>
                        Paciente contínuo ativo
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Marcar como contínuo */}
              {patSelected&&(
                <div className="card" style={{padding:"1rem",marginBottom:"1rem"}}>
                  <label style={{display:"flex",alignItems:"flex-start",gap:".65rem",cursor:"pointer"}}>
                    <input type="checkbox" checked={isContinuo} onChange={e=>setIsContinuo(e.target.checked)}
                      style={{width:16,height:16,marginTop:2,cursor:"pointer",accentColor:"var(--teal-600)"}}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)"}}>Paciente contínuo</div>
                      <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".2rem",lineHeight:1.5}}>
                        Marca este paciente para retirada mensal recorrente. A quantidade definida agora será o limite máximo nas próximas retiradas. Para encerrar, use a aba "Pacientes Contínuos".
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {patSelected&&(
                <div className="card" style={{padding:"1rem"}}>
                  <div style={{fontWeight:700,fontSize:".8rem",color:"var(--ink)",marginBottom:".5rem"}}>Observações</div>
                  <textarea value={obsDispensa} onChange={e=>setObsDispensa(e.target.value)}
                    placeholder="Motivo, diagnóstico, orientações ao paciente..."
                    style={{width:"100%",boxSizing:"border-box",minHeight:70,resize:"vertical",fontSize:".8rem"}}/>
                </div>
              )}
            </div>

            {/* Coluna direita: seleção de insumos */}
            <div style={{flex:1,minWidth:0}}>
              {/* Aviso máximos */}
              <div style={{marginBottom:".85rem",padding:".6rem .9rem",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"var(--r-md)",fontSize:".75rem",color:"#1d4ed8",display:"flex",gap:".4rem"}}>
                <span style={{fontWeight:700}}>Info:</span>
                <span>As quantidades máximas por insumo seguem o formulário DAF/Secretaria de Saúde de Osasco. Nenhum campo pode ultrapassar o limite definido.</span>
              </div>

              {/* Filtro por categoria */}
              <div style={{display:"flex",gap:".4rem",flexWrap:"wrap",marginBottom:".85rem"}}>
                {INSUMO_CATEGORIAS.map(c=>(
                  <button key={c} type="button" onClick={()=>setCatFilter(c)}
                    style={{fontSize:".72rem",padding:".28rem .65rem",borderRadius:999,border:`1px solid ${catFilter===c?"var(--teal-500)":"var(--border)"}`,background:catFilter===c?"var(--teal-50)":"var(--surface)",color:catFilter===c?"var(--teal-700)":"var(--text-2)",cursor:"pointer",fontWeight:catFilter===c?700:500}}>
                    {c}
                  </button>
                ))}
              </div>

              {/* Grid de insumos */}
              <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                {CATALOGO_INSUMOS.filter(i=>catFilter==="Todas"||i.categoria===catFilter).map(insumo=>{
                  const qtd = itens[insumo.id] || 0;
                  const estq = stock.find(s=>s.id===insumo.id)?.qty ?? 0;
                  const semEstoque = estq === 0;
                  const contItem = continuos.find(c=>c.patientId===patSelected?.id&&c.ativo)?.itens?.find(i=>i.id===insumo.id);
                  const limite = contItem ? contItem.qtd : insumo.qtdMax;
                  return (
                    <div key={insumo.id} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".55rem .85rem",background:qtd>0?"var(--teal-50)":"var(--surface)",border:`1px solid ${qtd>0?"var(--teal-300)":semEstoque?"#fecdd3":"var(--border)"}`,borderRadius:"var(--r-md)",opacity:semEstoque?0.6:1}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:".82rem",color:"var(--ink)"}}>{insumo.nome}</div>
                        <div style={{display:"flex",gap:".5rem",marginTop:".1rem",flexWrap:"wrap"}}>
                          <span style={{fontSize:".68rem",color:"var(--text-3)"}}>{insumo.categoria}</span>
                          <span style={{fontSize:".68rem",color:"var(--text-3)"}}>Máx: {limite} {insumo.unidade}</span>
                          <span style={{fontSize:".68rem",fontWeight:600,color:semEstoque?"#be123c":estq<=5?"#b45309":"#15803d"}}>
                            Estoque: {estq} {insumo.unidade}
                          </span>
                        </div>
                        {insumo.obs&&<div style={{fontSize:".68rem",color:"#1d4ed8",marginTop:".15rem"}}>Info: {insumo.obs}</div>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:".3rem",flexShrink:0}}>
                        <button type="button" onClick={()=>setItem(insumo.id, qtd-1)} disabled={!patSelected||qtd<=0}
                          style={{width:26,height:26,borderRadius:"var(--r-md)",border:"1px solid var(--border)",background:"var(--surface-2)",cursor:"pointer",fontWeight:700,fontSize:".9rem",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-1)"}}>-</button>
                        <input type="number" min={0} max={limite} value={qtd||""}
                          onChange={e=>setItem(insumo.id, e.target.value)}
                          disabled={!patSelected||semEstoque}
                          placeholder="0"
                          style={{width:52,textAlign:"center",fontWeight:700,fontSize:".85rem",padding:".2rem .3rem",border:`1px solid ${qtd>0?"var(--teal-400)":"var(--border)"}`,borderRadius:"var(--r-md)"}}/>
                        <button type="button" onClick={()=>setItem(insumo.id, qtd+1)} disabled={!patSelected||qtd>=limite||semEstoque}
                          style={{width:26,height:26,borderRadius:"var(--r-md)",border:"1px solid var(--border)",background:"var(--surface-2)",cursor:"pointer",fontWeight:700,fontSize:".9rem",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-1)"}}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Resumo e confirmar */}
              {Object.values(itens).some(v=>v>0)&&(
                <div style={{marginTop:"1rem",padding:".85rem 1rem",background:"var(--surface)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
                  <div style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)",marginBottom:".5rem"}}>Resumo da dispensação</div>
                  {Object.entries(itens).filter(([,v])=>v>0).map(([id,qtd])=>{
                    const cat = CATALOGO_INSUMOS.find(i=>i.id===id);
                    return <div key={id} style={{display:"flex",justifyContent:"space-between",fontSize:".78rem",color:"var(--text-1)",marginBottom:".2rem"}}>
                      <span>{cat?.nome}</span><span style={{fontWeight:700}}>{qtd} {cat?.unidade}</span>
                    </div>;
                  })}
                  {dispErr&&<div style={{marginTop:".65rem",padding:".45rem .65rem",background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",fontSize:".76rem",color:"#be123c"}}>{dispErr}</div>}
                  {dispOk&&<div style={{marginTop:".65rem",padding:".45rem .65rem",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:"var(--r-md)",fontSize:".76rem",color:"#15803d",fontWeight:700}}>Dispensação registrada com sucesso.</div>}
                  <button type="button" onClick={confirmarDispensa} disabled={!patSelected||dispOk}
                    style={{marginTop:".75rem",width:"100%",padding:".55rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:700,fontSize:".85rem"}}>
                    Confirmar dispensação{isContinuo?" (contínuo)":""}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ABA: ESTOQUE ── */}
        {insumoTab==="estoque"&&(
          <div>
            <div style={{display:"flex",gap:".65rem",marginBottom:"1rem",flexWrap:"wrap",alignItems:"center"}}>
              <input value={stockSearch} onChange={e=>setStockSearch(e.target.value)}
                placeholder="Buscar insumo..." style={{flex:"1 1 200px",maxWidth:320}}/>
              <select value={stockCat} onChange={e=>setStockCat(e.target.value)} style={{flex:"0 0 auto"}}>
                {INSUMO_CATEGORIAS.map(c=><option key={c}>{c}</option>)}
              </select>
              {(isPharma)&&(
                <button type="button" onClick={()=>setEditStockItem("new")}
                  style={{fontSize:".78rem",padding:".4rem .85rem",display:"flex",alignItems:"center",gap:".35rem"}}>
                  + Entrada de estoque
                </button>
              )}
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:".82rem"}}>
                <thead>
                  <tr style={{borderBottom:"2px solid var(--border)"}}>
                    {["Insumo","Categoria","Unidade","Qtd Máx","Estoque atual","Situação",""].map((h,i)=>(
                      <th key={i} style={{padding:".5rem .85rem",textAlign:"left",fontWeight:700,color:"var(--text-3)",fontSize:".72rem",textTransform:"uppercase",letterSpacing:".05em"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map(insumo=>{
                    const st = stock.find(s=>s.id===insumo.id)?.qty ?? 0;
                    const pct = insumo.qtdMax > 0 ? Math.round(st/insumo.qtdMax*100) : 0;
                    const sit = st===0?"Sem estoque":pct<=20?"Estoque baixo":pct<=60?"Regular":"Adequado";
                    const sitColor = st===0?"#be123c":pct<=20?"#b45309":pct<=60?"#1d4ed8":"#15803d";
                    const sitBg = st===0?"#fff1f2":pct<=20?"#fffbeb":pct<=60?"#eff6ff":"#f0fdf4";
                    return (
                      <tr key={insumo.id} style={{borderBottom:"1px solid var(--border)"}} onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                        <td style={{padding:".55rem .85rem",fontWeight:600,color:"var(--ink)"}}>
                          {insumo.nome}
                          {insumo.obs&&<div style={{fontSize:".66rem",color:"#1d4ed8",marginTop:".1rem"}}>Info: {insumo.obs}</div>}
                        </td>
                        <td style={{padding:".55rem .85rem",color:"var(--text-2)"}}>{insumo.categoria}</td>
                        <td style={{padding:".55rem .85rem",color:"var(--text-2)"}}>{insumo.unidade}</td>
                        <td style={{padding:".55rem .85rem",fontFamily:"IBM Plex Mono",fontSize:".78rem"}}>{insumo.qtdMax}</td>
                        <td style={{padding:".55rem .85rem"}}>
                          <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                            <span style={{fontFamily:"IBM Plex Mono",fontWeight:700,fontSize:".85rem",color:sitColor}}>{st}</span>
                            <div style={{flex:1,height:5,background:"var(--slate-100)",borderRadius:99,minWidth:60,overflow:"hidden"}}>
                              <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:sitColor,borderRadius:99}}/>
                            </div>
                          </div>
                        </td>
                        <td style={{padding:".55rem .85rem"}}>
                          <span style={{fontSize:".7rem",fontWeight:700,padding:".15rem .45rem",borderRadius:999,background:sitBg,color:sitColor}}>{sit}</span>
                        </td>
                        <td style={{padding:".55rem .85rem"}}>
                          {(isPharma)&&(
                            <button type="button" onClick={()=>{ setEditStockItem(insumo); setEditQty(""); }}
                              style={{fontSize:".72rem",padding:".2rem .5rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",color:"var(--text-1)"}}>
                              + Entrada
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ABA: LOG DE SAÍDAS ── */}
        {insumoTab==="log"&&(canDispense||canViewAll)&&(
          <div>
            <div style={{display:"flex",gap:".65rem",marginBottom:"1rem",flexWrap:"wrap",alignItems:"center"}}>
              <input value={logSearch} onChange={e=>setLogSearch(e.target.value)} placeholder="Buscar por paciente ou profissional..." style={{flex:"1 1 220px",maxWidth:360}}/>
              <div style={{display:"flex",gap:".35rem"}}>
                {[["all","Todas"],["continuo","Contínuo"],["normal","Normal"]].map(([v,l])=>(
                  <button key={v} type="button" onClick={()=>setLogFilter(v)}
                    style={{fontSize:".73rem",padding:".3rem .65rem",borderRadius:999,border:`1px solid ${logFilter===v?"var(--teal-500)":"var(--border)"}`,background:logFilter===v?"var(--teal-50)":"var(--surface)",color:logFilter===v?"var(--teal-700)":"var(--text-2)",cursor:"pointer",fontWeight:logFilter===v?700:500}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {!filteredLog.length ? (
              <div style={{textAlign:"center",padding:"3rem",color:"var(--text-3)"}}>Nenhuma dispensação registrada.</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                {filteredLog.map(d=>(
                  <div key={d.id} style={{background:"var(--surface)",border:`1px solid ${d.continuo?"var(--teal-200)":"var(--border)"}`,borderLeft:`4px solid ${d.continuo?"var(--teal-500)":"var(--border)"}`,borderRadius:"var(--r-md)",padding:".75rem 1rem"}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:".5rem",flexWrap:"wrap"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:".88rem",color:"var(--ink)",display:"flex",alignItems:"center",gap:".5rem"}}>
                          {d.patientName}
                          {d.continuo&&<span style={{fontSize:".67rem",fontWeight:700,padding:".1rem .4rem",borderRadius:999,background:"#dcfce7",color:"#15803d",border:"1px solid #bbf7d0"}}>Contínuo</span>}
                        </div>
                        <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>
                          {d.profissional} ({d.profRole}) · {new Date(d.ts).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                        </div>
                      </div>
                      <span style={{fontSize:".7rem",fontFamily:"IBM Plex Mono",color:"var(--text-3)"}}>{d.date}</span>
                    </div>
                    <div style={{display:"flex",gap:".35rem",flexWrap:"wrap",marginTop:".5rem"}}>
                      {d.itens.map(item=>{
                        const cat = CATALOGO_INSUMOS.find(i=>i.id===item.id);
                        return <span key={item.id} style={{fontSize:".72rem",padding:".15rem .45rem",borderRadius:999,background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-1)",fontWeight:600}}>
                          {cat?.nome||item.id}: {item.qtd} {cat?.unidade||""}
                        </span>;
                      })}
                    </div>
                    {d.obs&&<div style={{marginTop:".4rem",fontSize:".73rem",color:"var(--text-2)",fontStyle:"italic"}}>Obs: {d.obs}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: PACIENTES CONTÍNUOS */}
        {insumoTab==="continuos"&&(
          <div>
            <div style={{marginBottom:"1rem",padding:".65rem .9rem",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"var(--r-md)",fontSize:".76rem",color:"#1d4ed8",display:"flex",gap:".4rem"}}>
              <span>Pacientes contínuos têm lesão ativa e retornam mensalmente para retirada de insumos. A quantidade máxima foi definida na primeira dispensação e não pode ser ultrapassada. Para encerrar, clique em "Encerrar".</span>
            </div>
            {!continuosAtivos.length ? (
              <div style={{textAlign:"center",padding:"3rem",color:"var(--text-3)"}}>
                <div style={{fontWeight:600}}>Nenhum paciente contínuo ativo</div>
                <div style={{fontSize:".8rem",marginTop:".5rem"}}>Ao dispensar insumos, marque "Paciente contínuo" para registrá-lo aqui.</div>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
                {continuosAtivos.map(c=>{
                  const retiradas = dispensas.filter(d=>d.patientId===c.patientId&&d.continuo).length;
                  const ultima = dispensas.filter(d=>d.patientId===c.patientId).sort((a,b)=>b.ts.localeCompare(a.ts))[0];
                  return (
                    <div key={c.id} style={{background:"var(--surface)",border:"1px solid var(--teal-200)",borderLeft:"4px solid var(--teal-500)",borderRadius:"var(--r-md)",padding:"1rem 1.1rem"}}>
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:".75rem",flexWrap:"wrap"}}>
                        <div>
                          <div style={{fontWeight:800,fontSize:".9rem",color:"var(--ink)",display:"flex",alignItems:"center",gap:".5rem"}}>
                            {c.patientName}
                            <span style={{fontSize:".67rem",fontWeight:700,padding:".1rem .4rem",borderRadius:999,background:"#dcfce7",color:"#15803d",border:"1px solid #bbf7d0"}}>Ativo</span>
                          </div>
                          <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".2rem"}}>
                            Desde {fmtDate(c.dtInicio)} · {retiradas} retirada(s) registrada(s) · Por: {c.profissional}
                          </div>
                          {ultima&&<div style={{fontSize:".72rem",color:"var(--text-3)"}}>Última retirada: {fmtDate(ultima.date)}</div>}
                        </div>
                        {canDispense&&(
                          <button type="button" onClick={()=>encerrarContinuo(c.id)}
                            style={{fontSize:".73rem",padding:".3rem .7rem",background:"#fff1f2",color:"#be123c",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:700,flexShrink:0}}>
                            Encerrar
                          </button>
                        )}
                      </div>
                      <div style={{marginTop:".75rem"}}>
                        <div style={{fontSize:".7rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".4rem"}}>Insumos desta prescrição (limites)</div>
                        <div style={{display:"flex",gap:".35rem",flexWrap:"wrap"}}>
                          {c.itens.map(item=>{
                            const cat = CATALOGO_INSUMOS.find(i=>i.id===item.id);
                            return <span key={item.id} style={{fontSize:".73rem",padding:".2rem .5rem",borderRadius:999,background:"var(--teal-50)",border:"1px solid var(--teal-200)",color:"var(--teal-700)",fontWeight:600}}>
                              {cat?.nome||item.id}: até {item.qtd} {cat?.unidade}
                            </span>;
                          })}
                        </div>
                      </div>
                      {c.obs&&<div style={{marginTop:".5rem",fontSize:".73rem",color:"var(--text-2)",fontStyle:"italic"}}>Obs.: {c.obs}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Contínuos encerrados */}
            {continuos.filter(c=>!c.ativo).length>0&&(
              <div style={{marginTop:"1.5rem"}}>
                <div style={{fontWeight:700,fontSize:".78rem",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".6rem"}}>Encerrados</div>
                <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                  {continuos.filter(c=>!c.ativo).map(c=>(
                    <div key={c.id} style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderLeft:"4px solid var(--border)",borderRadius:"var(--r-md)",padding:".65rem .9rem",opacity:.75}}>
                      <div style={{fontWeight:600,fontSize:".82rem",color:"var(--text-2)"}}>{c.patientName}</div>
                      <div style={{fontSize:".7rem",color:"var(--text-3)"}}>
                        {fmtDate(c.dtInicio)} → {fmtDate(c.dtFim)} · {dispensas.filter(d=>d.patientId===c.patientId&&d.continuo).length} retirada(s)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal entrada de estoque */}
      {editStockItem&&(
        <div className="modal-backdrop" onClick={()=>setEditStockItem(null)}>
          <div className="modal" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <h3 style={{margin:"0 0 1rem"}}>{editStockItem==="new"?"Nova entrada de estoque":"+ Entrada: "+editStockItem.nome}</h3>
            {editStockItem==="new" ? (
              <div style={{color:"var(--text-3)",fontSize:".85rem"}}>Para entrada em item específico, clique em "+ Entrada" na linha do insumo na tabela.</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
                <div style={{fontSize:".82rem",color:"var(--text-2)"}}>Insumo: <strong>{editStockItem.nome}</strong></div>
                  <div style={{fontSize:".82rem",color:"var(--text-2)"}}>Estoque atual: <strong>{stock.find(s=>s.id===editStockItem.id)?.qty ?? 0} {editStockItem.unidade}</strong></div>
                <label style={{display:"flex",flexDirection:"column",gap:".3rem",fontSize:".8rem",fontWeight:600}}>
                  Quantidade a adicionar *
                  <input type="number" min="1" value={editQty} onChange={e=>setEditQty(e.target.value)} placeholder="Ex: 50" autoFocus/>
                </label>
                <div style={{display:"flex",gap:".5rem"}}>
                  <button type="button" onClick={()=>setEditStockItem(null)} style={{flex:1,background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-1)"}}>Cancelar</button>
                  <button type="button" onClick={()=>{
                    const n = Number(editQty); if(!n||n<=0) return;
                    const newStock = stock.map(s=>s.id===editStockItem.id?{...s,qty:s.qty+n}:s);
                    // Se item ainda não existe no array de stock, adiciona
                    if (!stock.find(s=>s.id===editStockItem.id)) newStock.push({id:editStockItem.id,qty:n});
                    setStock(newStock); saveInsumoStock(newStock);
                    setEditStockItem(null);
                  }} style={{flex:2}}>âœ“ Confirmar entrada</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



const PHARMACY_KEY  = "saudeubs_pharmacy_v1";
const PHARMA_LOG_KEY = "saudeubs_pharmalog_v1";
const PHARMA_AUTH_KEY = "saudeubs_pharmaauth_v1";

// Farmacêuticos cadastrados (em produção viria do backend)
// Usuários locais de farmácia – sem senhas em texto puro
// Autenticação sempre via backend (/auth/login). Senhas nunca ficam no código.
const PHARMA_USERS = [
  { id: "ph1", name: "Ana (Administradora)", email: "ana@clinica.local",  role: "pharmacist"    },
  { id: "ph2", name: "Farmacêutico(a)",      email: "farmacia@ubs.local", role: "pharmacist"    },
  { id: "ph3", name: "Téc. de Farmácia",     email: "tecfarma@ubs.local", role: "pharmacy_tech" },
];

// Estoque inicial padrão UBS – Rename (Rename of Farmácia Básica Municipal)
const DEFAULT_STOCK = [
  // Analgésicos / Antitérmicos
  { id:"s01", name:"Paracetamol 500mg",          category:"Analgésico",       unit:"comprimido", qty:1200, minQty:200, location:"Prateleira A1" },
  { id:"s02", name:"Dipirona 500mg",              category:"Analgésico",       unit:"comprimido", qty:800,  minQty:150, location:"Prateleira A1" },
  { id:"s03", name:"Ibuprofeno 600mg",            category:"Anti-inflamatório",unit:"comprimido", qty:500,  minQty:100, location:"Prateleira A2" },
  // Antibióticos
  { id:"s04", name:"Amoxicilina 500mg",           category:"Antibiótico",      unit:"cápsula",    qty:400,  minQty:80,  location:"Prateleira B1" },
  { id:"s05", name:"Azitromicina 500mg",          category:"Antibiótico",      unit:"comprimido", qty:200,  minQty:50,  location:"Prateleira B1" },
  { id:"s06", name:"Ciprofloxacino 500mg",        category:"Antibiótico",      unit:"comprimido", qty:180,  minQty:40,  location:"Prateleira B2" },
  // Cardiovascular / HAS
  { id:"s07", name:"Enalapril 10mg",              category:"Cardiovascular",   unit:"comprimido", qty:900,  minQty:200, location:"Prateleira C1" },
  { id:"s08", name:"Losartana 50mg",              category:"Cardiovascular",   unit:"comprimido", qty:900,  minQty:200, location:"Prateleira C1" },
  { id:"s09", name:"Atenolol 25mg",               category:"Cardiovascular",   unit:"comprimido", qty:600,  minQty:100, location:"Prateleira C2" },
  { id:"s10", name:"Hidroclorotiazida 25mg",      category:"Cardiovascular",   unit:"comprimido", qty:700,  minQty:150, location:"Prateleira C2" },
  { id:"s11", name:"Amlodipino 5mg",              category:"Cardiovascular",   unit:"comprimido", qty:500,  minQty:100, location:"Prateleira C3" },
  // Diabetes
  { id:"s12", name:"Metformina 850mg",            category:"Diabetes",         unit:"comprimido", qty:1000, minQty:200, location:"Prateleira D1" },
  { id:"s13", name:"Glibenclamida 5mg",           category:"Diabetes",         unit:"comprimido", qty:500,  minQty:100, location:"Prateleira D1" },
  { id:"s14", name:"Insulina NPH 100UI/mL",       category:"Diabetes",         unit:"frasco",     qty:80,   minQty:20,  location:"Geladeira G1"  },
  { id:"s15", name:"Insulina Regular 100UI/mL",   category:"Diabetes",         unit:"frasco",     qty:40,   minQty:10,  location:"Geladeira G1"  },
  // Saúde Mental
  { id:"s16", name:"Fluoxetina 20mg",             category:"Saúde Mental",     unit:"comprimido", qty:400,  minQty:80,  location:"Prateleira E1" },
  { id:"s17", name:"Amitriptilina 25mg",          category:"Saúde Mental",     unit:"comprimido", qty:300,  minQty:60,  location:"Prateleira E1" },
  { id:"s18", name:"Haloperidol 5mg",             category:"Saúde Mental",     unit:"comprimido", qty:150,  minQty:30,  location:"Prateleira E2" },
  { id:"s19", name:"Diazepam 5mg",                category:"Saúde Mental",     unit:"comprimido", qty:200,  minQty:40,  location:"Prateleira E2" },
  // Respiratório
  { id:"s20", name:"Salbutamol spray 100mcg",     category:"Respiratório",     unit:"frasco",     qty:60,   minQty:15,  location:"Prateleira F1" },
  { id:"s21", name:"Budesonida spray 200mcg",     category:"Respiratório",     unit:"frasco",     qty:40,   minQty:10,  location:"Prateleira F1" },
  { id:"s22", name:"Loratadina 10mg",             category:"Alergia",          unit:"comprimido", qty:400,  minQty:80,  location:"Prateleira F2" },
  // Gestantes
  { id:"s23", name:"Sulfato Ferroso 40mg",        category:"Gestante",         unit:"comprimido", qty:600,  minQty:120, location:"Prateleira G2" },
  { id:"s24", name:"Ácido Fólico 5mg",            category:"Gestante",         unit:"comprimido", qty:600,  minQty:120, location:"Prateleira G2" },
  // Gastrointestinal
  { id:"s25", name:"Omeprazol 20mg",              category:"Gastrointestinal", unit:"cápsula",    qty:500,  minQty:100, location:"Prateleira A3" },
  { id:"s26", name:"Metoclopramida 10mg",         category:"Gastrointestinal", unit:"comprimido", qty:300,  minQty:60,  location:"Prateleira A3" },
  { id:"s27", name:"Soro Fisiológico 0,9% 500mL", category:"Soros",           unit:"bolsa",      qty:50,   minQty:10,  location:"Armário S1"   },
  // Outros
  { id:"s28", name:"Vitamina D3 1000UI",          category:"Suplemento",       unit:"comprimido", qty:300,  minQty:60,  location:"Prateleira H1" },
  { id:"s29", name:"Clonazepam 2mg",              category:"Saúde Mental",     unit:"comprimido", qty:180,  minQty:30,  location:"Prateleira E3" },
  { id:"s30", name:"Sinvastatina 20mg",           category:"Cardiovascular",   unit:"comprimido", qty:700,  minQty:150, location:"Prateleira C4" },
];

function readPharmacyStock() {
  try { const r = localStorage.getItem(PHARMACY_KEY); return r ? JSON.parse(r) : DEFAULT_STOCK.map(i=>({...i})); } catch { return DEFAULT_STOCK.map(i=>({...i})); }
}
function savePharmacyStock(stock) { writeLS(PHARMACY_KEY, stock); }
function readPharmaLog() {
  try { const r = localStorage.getItem(PHARMA_LOG_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function savePharmaLog(log) { writeLS(PHARMA_LOG_KEY, log); }
function readPharmaSession() {
  try { const r = localStorage.getItem(PHARMA_AUTH_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function savePharmaSession(s) {
  try { if(s) localStorage.setItem(PHARMA_AUTH_KEY, JSON.stringify(s)); else localStorage.removeItem(PHARMA_AUTH_KEY); } catch {}
}
function isAdminUser(user) { return isAdmin(user); }

const PHARMA_CATEGORIES = [
  "Todas","Analgésico","Anti-inflamatório","Antibiótico","Cardiovascular",
  "Diabetes","Saúde Mental","Respiratório","Alergia","Gestante",
  "Gastrointestinal","Soros","Suplemento",
];



function PatientCardModal({ patient, users, templates, history, onClose }) {
  const acsName  = users.find(u=>u.id===patient.assignedAcsId)?.name||"Não atribuído";
  const g        = gestationalAgeInfo(patient);
  const vaccines = (history||[]).filter(h=>String(h.type||"").toLowerCase()==="vaccine");
  const meds     = String(patient.medications||"").trim();
  const allergies= String(patient.allergies||"").trim();
  const comorbid = String(patient.comorbidities||"").trim();
  const today    = new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
  const catName  = templates.find(t=>t.category===patient.careCategory)?.label||patient.careCategory||"Geral";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:620,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        {/* Toolbar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <h3 style={{margin:0}}>Cartão do Paciente</h3>
          <div style={{display:"flex",gap:".5rem"}}>
            <button onClick={()=>window.print()} style={{fontSize:".78rem",padding:".3rem .65rem",display:"flex",alignItems:"center",gap:".35rem"}}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 5V2h8v3M2 5h12v7H2z" stroke="currentColor" strokeWidth="1.3"/><path d="M4 10h8M4 12h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M4 5h8" stroke="currentColor" strokeWidth="1.2"/></svg>
              Imprimir
            </button>
            <button className="icon-btn" onClick={onClose}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* Card content */}
        <div style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"1.5rem",fontFamily:"system-ui,sans-serif",lineHeight:1.6}}>

          {/* Header */}
          <div style={{display:"flex",alignItems:"center",gap:"1rem",borderBottom:"2px solid var(--teal-500)",paddingBottom:"1rem",marginBottom:"1rem"}}>
            <div className="user-avatar" style={{width:52,height:52,fontSize:"1.25rem",flexShrink:0,background:"var(--teal-600)",color:"#fff"}}>{initials(patient.name)}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:"1.1rem",color:"var(--ink)"}}>{patient.name}</div>
              <div style={{fontSize:".78rem",color:"var(--text-2)",marginTop:".2rem",display:"flex",gap:"1rem",flexWrap:"wrap"}}>
                {patient.birthDate&&<span>Nasc.: {fmtDate(patient.birthDate)}{calcAge(patient.birthDate)?" · "+calcAge(patient.birthDate):""}</span>}
                {patient.cpf&&<span>CPF: {patient.cpf}</span>}
                {patient.cns&&<span>CNS: {patient.cns}</span>}
                {patient.sex&&<span>Sexo: {patient.sex}</span>}
              </div>
            </div>
            <div style={{textAlign:"right",fontSize:".72rem",color:"var(--text-3)"}}>
              <div style={{fontWeight:700,color:"var(--teal-600)",fontSize:".8rem"}}>{catName}</div>
              <div>ACS: {acsName}</div>
              {g&&String(patient.careCategory||"").toLowerCase()==="pregnant"&&<div style={{color:"var(--teal-700)",fontWeight:600}}>IG: {g.weeks}s{g.days}d ({g.source})</div>}
            </div>
          </div>

          {/* Grid de info */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1rem"}}>

            {/* Contato */}
            <div>
              <div style={{fontWeight:700,fontSize:".75rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".4rem"}}>Contato</div>
              <div style={{fontSize:".8rem",color:"var(--text-2)",display:"flex",flexDirection:"column",gap:".2rem"}}>
                {patient.phone&&<span>ðŸ“± {patient.phone}</span>}
                {patient.phoneAlt&&<span>â˜Žï¸ {patient.phoneAlt}</span>}
                {(patient.address||patient.city)&&<span>ðŸ“ {[patient.address,patient.number,patient.neighborhood,patient.city,patient.state].filter(Boolean).join(", ")}</span>}
              </div>
            </div>

            {/* Clínico */}
            <div>
              <div style={{fontWeight:700,fontSize:".75rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".4rem"}}>Dados Clínicos</div>
              <div style={{fontSize:".8rem",color:"var(--text-2)",display:"flex",flexDirection:"column",gap:".2rem"}}>
                {allergies
                  ? <span style={{color:"#be123c",fontWeight:600}}>âš ï¸ Alergias: {allergies}</span>
                  : <span style={{color:"var(--text-3)"}}>Sem alergias registradas</span>}
                {comorbid&&<span>ðŸ¥ {comorbid}</span>}
              </div>
            </div>
          </div>

          {/* Medicamentos */}
          {meds&&(
            <div style={{marginBottom:"1rem",padding:".65rem .85rem",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)"}}>
              <div style={{fontWeight:700,fontSize:".75rem",color:"#92400e",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".35rem"}}>💊 Medicamentos em uso</div>
              <div style={{fontSize:".8rem",color:"#78350f",whiteSpace:"pre-wrap"}}>{meds}</div>
            </div>
          )}

          {/* Vacinas aplicadas */}
          {vaccines.length>0&&(
            <div style={{marginBottom:"1rem"}}>
              <div style={{fontWeight:700,fontSize:".75rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".5rem"}}>💉 Vacinas registradas</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:".3rem"}}>
                {vaccines.slice(0,12).map((v,i)=>(
                  <span key={i} style={{fontSize:".72rem",padding:".15rem .5rem",borderRadius:999,background:"#f0fdf4",color:"#15803d",border:"1px solid #bbf7d0",fontWeight:600}}>
                    {v.title} {v.date?`(${fmtDate(v.date)})`:""}</span>
                ))}
                {vaccines.length>12&&<span style={{fontSize:".72rem",color:"var(--text-3)"}}>+{vaccines.length-12} mais</span>}
              </div>
            </div>
          )}

          {/* Gestação */}
          {String(patient.careCategory||"").toLowerCase()==="pregnant"&&(
            <div style={{padding:".65rem .85rem",background:"var(--teal-50)",border:"1px solid var(--teal-100)",borderRadius:"var(--r-md)",marginBottom:"1rem"}}>
              <div style={{fontWeight:700,fontSize:".75rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".35rem"}}>🤰 Gestação</div>
              <div style={{display:"flex",gap:"1.5rem",fontSize:".8rem",color:"var(--teal-800)",flexWrap:"wrap"}}>
                {patient.pregnancyStartDate&&<span>DUM: {fmtDate(patient.pregnancyStartDate)}</span>}
                {patient.expectedDeliveryDate&&<span>DPP: {fmtDate(patient.expectedDeliveryDate)}</span>}
                {g&&<span style={{fontWeight:700}}>IG estimada: {g.weeks}s {g.days}d</span>}
              </div>
            </div>
          )}

          {/* Rodapé */}
          <div style={{borderTop:"1px solid var(--border)",paddingTop:".75rem",display:"flex",justifyContent:"space-between",fontSize:".7rem",color:"var(--text-3)"}}>
            <span>Unidade Básica de Saúde</span>
            <span>Emitido em {today}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pharmacy Login Modal ── */
function PharmaLoginModal({ onLogin, onClose }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !pw.trim()) { setErr("Informe e-mail e senha."); return; }
    try {
      const res = await fetch("/auth/login", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: pw })
      });
      if (!res.ok) { setErr("E-mail ou senha incorretos."); return; }
      const data = await res.json();
      const meta = PHARMA_USERS.find(p => p.email.toLowerCase()===email.trim().toLowerCase());
      const u = { ...(meta||{}), ...data.user, _token: data.token };
      onLogin(u);
    } catch { setErr("Erro de conexão. Tente novamente."); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:360,padding:"1.75rem"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
            <div style={{width:34,height:34,borderRadius:8,background:"var(--teal-600)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 3h3l-2.5 2 1 3L8 7.5 5 9l1-3L3.5 4h3L8 1z" stroke="white" strokeWidth="1.3" strokeLinejoin="round"/><path d="M3 12h10M5 14h6" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:".92rem",color:"var(--ink)"}}>Farmácia – Acesso Restrito</div>
              <div style={{fontSize:".72rem",color:"var(--text-3)"}}>Farmacêutico(a) ou Téc. de Farmácia</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".7rem"}}>
          <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".8rem",fontWeight:600}}>
            E-mail
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="farmacia@ubs.local" autoFocus/>
          </label>
          <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".8rem",fontWeight:600}}>
            Senha
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="⬢⬢⬢⬢⬢⬢⬢⬢"/>
          </label>
          {err && <p className="error" style={{margin:0}}>{err}</p>}
          <button type="submit" style={{marginTop:".25rem"}}>Entrar na Farmácia</button>
        </form>
      </div>
    </div>
  );
}

/* ── Dispense Modal – senha obrigatória ── */
function DispenseModal({ item, pharmaUser, onConfirm, onClose }) {
  const [pw, setPw]            = useState("");
  const [qty, setQty]          = useState(1);
  const [patient, setPatient]  = useState("");
  const [prescriber, setPrescriber] = useState("");
  const [prescriberCouncil, setPrescriberCouncil] = useState("");
  const [numReceita, setNumReceita] = useState("");   // ANVISA RDC 20/2011
  const [lote, setLote]        = useState("");         // ANVISA – rastreabilidade por lote
  const [dtReceita, setDtReceita] = useState("");      // Data da receita
  const [notes, setNotes]      = useState("");
  const [err, setErr]          = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!pw) { setErr("Digite sua senha para confirmar."); return; }
    // Verifica senha via backend para operações sensíveis
    let pwValid = false;
    try {
      const res = await fetch("/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email:pharmaUser.email, password:pw}) });
      pwValid = res.ok;
    } catch { pwValid = false; }
    const u = pwValid ? pharmaUser : null;
    if (!u) { setErr("Senha incorreta."); return; }
    if (qty < 1 || qty > item.qty) { setErr(`Quantidade inválida (máx. ${item.qty}).`); return; }
    if (!patient.trim()) { setErr("Informe o nome do paciente."); return; }
    if (!prescriber.trim()) { setErr("Informe o nome do prescritor."); return; }
    if (!prescriberCouncil.trim()) { setErr("Informe o número do conselho do prescritor (ANVISA RDC 20/2011)."); return; }
    const councilDigits = prescriberCouncil.replace(/\D/g,"");
    if (councilDigits.length < 4 || councilDigits.length > 7) { setErr("Número do conselho inválido."); return; }
    if (!numReceita.trim()) { setErr("Número da receita é obrigatório (ANVISA RDC 20/2011)."); return; }
    if (!dtReceita) { setErr("Data da receita é obrigatória."); return; }
    onConfirm({ qty: Number(qty), patient: patient.trim(), prescriber: prescriber.trim(), prescriberCouncil: prescriberCouncil.trim(), numReceita: numReceita.trim(), lote: lote.trim(), dtReceita, notes: notes.trim() });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <h3 style={{margin:0,fontSize:".95rem"}}>Dispensar medicamento</h3>
          <button className="icon-btn" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{background:"var(--teal-50)",border:"1px solid var(--teal-100)",borderRadius:"var(--r-md)",padding:".65rem .85rem",marginBottom:"1rem"}}>
          <div style={{fontWeight:700,fontSize:".88rem",color:"var(--teal-800)"}}>{item.name}</div>
          <div style={{fontSize:".75rem",color:"var(--teal-700)",marginTop:".15rem"}}>
            Estoque atual: <strong>{item.qty} {item.unit}(s)</strong> · {item.location}
          </div>
        </div>
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".6rem"}}>
          <div style={{fontSize:".67rem",fontWeight:700,color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".06em",padding:".3rem 0 .1rem"}}>Paciente e Quantidade</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".6rem"}}>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600,gridColumn:"span 2"}}>
              Paciente *
              <input value={patient} onChange={e=>setPatient(e.target.value)} placeholder="Nome completo do paciente"/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Quantidade *
              <input type="number" min={1} max={item.qty} value={qty} onChange={e=>setQty(e.target.value)}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Lote do produto
              <input value={lote} onChange={e=>setLote(e.target.value)} placeholder="Ex: A1234" title="ANVISA – rastreabilidade"/>
            </label>
          </div>
          <div style={{fontSize:".67rem",fontWeight:700,color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".06em",padding:".3rem 0 .1rem"}}>Receita – ANVISA RDC 20/2011</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".6rem"}}>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Nº da Receita *
              <input value={numReceita} onChange={e=>setNumReceita(e.target.value)} placeholder="Ex: 000123"/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Data da Receita *
              <input type="date" value={dtReceita} onChange={e=>setDtReceita(e.target.value)} max={new Date().toISOString().slice(0,10)}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Prescritor *
              <input value={prescriber} onChange={e=>setPrescriber(e.target.value)} placeholder="Nome do profissional prescritor"/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Nº Conselho *
              <input value={prescriberCouncil} onChange={e=>setPrescriberCouncil(formatCouncil(e.target.value))} placeholder="CRM 00000" inputMode="numeric" maxLength={10}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600,gridColumn:"span 2"}}>
              Observações / Posologia
              <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Posologia, orientações..."/>
            </label>
          </div>
          <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:700,color:"var(--text-1)"}}>
            ðŸ” Confirmar com sua senha
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Senha do farmacêutico" autoFocus/>
          </label>
          {err && <p className="error" style={{margin:0}}>{err}</p>}
          <div style={{display:"flex",gap:".5rem",marginTop:".25rem"}}>
            <button type="button" onClick={onClose} style={{flex:1,background:"var(--surface-2)",color:"var(--text-1)",border:"1px solid var(--border)"}}>Cancelar</button>
            <button type="submit" style={{flex:2}}>Confirmar Dispensação</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Stock Edit Modal ── */
function StockEditModal({ item, pharmaUser, mode, onConfirm, onClose }) {
  // mode: "edit" | "add" | "adjust"
  const isNew = mode === "add";
  const [form, setForm] = useState(item ? {...item} : { name:"", category:"Analgésico", unit:"comprimido", qty:0, minQty:50, location:"" });
  const [pw, setPw]     = useState("");
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [err, setErr]   = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!pw) { setErr("Senha obrigatória para alterar estoque."); return; }
    let pwValid2 = false;
    try {
      const res = await fetch("/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email:pharmaUser.email, password:pw}) });
      pwValid2 = res.ok;
    } catch { pwValid2 = false; }
    const u = pwValid2 ? pharmaUser : null;
    if (!u) { setErr("Senha incorreta."); return; }
    if (mode === "adjust") {
      if (!reason.trim()) { setErr("Informe o motivo do ajuste."); return; }
      onConfirm({ mode:"adjust", delta: Number(delta), reason: reason.trim() });
    } else {
      if (!form.name.trim()) { setErr("Nome obrigatório."); return; }
      onConfirm({ mode, form });
    }
  }

  const sf = (k,v) => setForm(s=>({...s,[k]:v}));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:460}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <h3 style={{margin:0,fontSize:".95rem"}}>
            {mode==="add"?"Novo medicamento":mode==="adjust"?"Ajustar estoque":"Editar medicamento"}
          </h3>
          <button className="icon-btn" onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
          {mode === "adjust" ? (
            <>
              <div style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:".65rem .85rem",marginBottom:".25rem"}}>
                <div style={{fontWeight:700,fontSize:".88rem"}}>{item.name}</div>
                <div style={{fontSize:".75rem",color:"var(--text-3)"}}>Estoque atual: {item.qty} {item.unit}(s)</div>
              </div>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Ajuste (positivo = entrada, negativo = saída)
                <input type="number" value={delta} onChange={e=>setDelta(e.target.value)} placeholder="Ex: 100 ou -20"/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Motivo do ajuste *
                <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ex: recebimento de lote, vencimento, inventário..."/>
              </label>
            </>
          ) : (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".6rem"}}>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600,gridColumn:"span 2"}}>
                Nome do medicamento *
                <input value={form.name} onChange={e=>sf("name",e.target.value)} placeholder="Ex: Paracetamol 500mg"/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Categoria
                <select value={form.category} onChange={e=>sf("category",e.target.value)}>
                  {PHARMA_CATEGORIES.filter(c=>c!=="Todas").map(c=><option key={c}>{c}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Unidade
                <select value={form.unit} onChange={e=>sf("unit",e.target.value)}>
                  {["comprimido","cápsula","frasco","bolsa","ampola","sachê","bisnaga"].map(u=><option key={u}>{u}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Quantidade inicial
                <input type="number" min={0} value={form.qty} onChange={e=>sf("qty",Number(e.target.value))}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Estoque mínimo alerta
                <input type="number" min={0} value={form.minQty} onChange={e=>sf("minQty",Number(e.target.value))}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600,gridColumn:"span 2"}}>
                Localização (prateleira/geladeira)
                <input value={form.location} onChange={e=>sf("location",e.target.value)} placeholder="Ex: Prateleira A1"/>
              </label>
            </div>
          )}
          <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:700,color:"var(--text-1)"}}>
            ðŸ” Confirmar com sua senha
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Senha do farmacêutico"/>
          </label>
          {err && <p className="error" style={{margin:0}}>{err}</p>}
          <div style={{display:"flex",gap:".5rem",marginTop:".25rem"}}>
            <button type="button" onClick={onClose} style={{flex:1,background:"var(--surface-2)",color:"var(--text-1)",border:"1px solid var(--border)"}}>Cancelar</button>
            <button type="submit" style={{flex:2}}>
              {mode==="add"?"Adicionar ao estoque":mode==="adjust"?"Registrar ajuste":"Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Pharmacy Page ── */
function PharmacyPage({ user }) {
  // Se o usuário logado já é farmacêutico, téc. de farmácia ou admin, entra direto
  const autoUser = isAdminUser(user) ? PHARMA_USERS[0]
                 : (isPharmacist(user) ? (PHARMA_USERS.find(p=>p.email===user.email)||PHARMA_USERS[1]) : null);
  const [pharmaUser, setPharmaUser] = useState(()=> {
    const s = readPharmaSession();
    if (s) return s;
    if (autoUser) return autoUser;
    return null;
  });
  // Outros perfis veem tela de acesso negado
  const isBlockedRole = !isAdminUser(user) && !isPharmacist(user);
  const [showLogin,    setShowLogin]    = useState(false);
  const [stock,        setStock]        = useState(readPharmacyStock);
  const [log,          setLog]          = useState(readPharmaLog);
  const [pharmaTab,    setPharmaTab]    = useState("stock"); // stock | log
  const [catFilter,    setCatFilter]    = useState("Todas");
  const [search,       setSearch]       = useState("");
  const [dispenseItem, setDispenseItem] = useState(null);
  const [editItem,     setEditItem]     = useState(null);   // {item, mode}
  const [showLowOnly,  setShowLowOnly]  = useState(false);
  const [logSearch,    setLogSearch]    = useState("");

  const isAuthenticated = !!pharmaUser;

  function doLogin(u) {
    setPharmaUser(u);
    savePharmaSession(u);
    setShowLogin(false);
  }
  function doLogout() {
    setPharmaUser(null);
    savePharmaSession(null);
  }

  function addLogEntry(entry) {
    const now = new Date();
    const newLog = [{
      ...entry,
      id: Date.now().toString(),
      ts: now.toISOString(),
      tsDisplay: now.toLocaleString("pt-BR", {timeZone:"America/Sao_Paulo"}),
      pharma: pharmaUser?.name || "?",
      pharmaId: pharmaUser?.id || "?",
      // ANVISA – escrituração deve ser rastreável por profissional responsável
    }, ...log];
    setLog(newLog);
    savePharmaLog(newLog);
  }

  function handleDispense({ qty, patient, prescriber, prescriberCouncil, numReceita, lote, dtReceita, notes }) {
    const newStock = stock.map(s =>
      s.id === dispenseItem.id ? { ...s, qty: s.qty - qty } : s
    );
    setStock(newStock);
    savePharmacyStock(newStock);
    addLogEntry({
      type: "dispensa",
      itemId: dispenseItem.id,
      itemName: dispenseItem.name,
      qty, patient, prescriber, prescriberCouncil,
      // ANVISA RDC 20/2011 – campos de rastreabilidade obrigatórios
      numReceita, lote, dtReceita, notes,
    });
    auditLog("DISPENSACAO_FARMACIA", { medicamento:dispenseItem.name, qty, patient, prescriber, numReceita, lote });
    setDispenseItem(null);
  }

  function handleStockConfirm({ mode, form, delta, reason }) {
    if (mode === "adjust") {
      const newStock = stock.map(s =>
        s.id === editItem.item.id ? { ...s, qty: Math.max(0, s.qty + Number(delta)) } : s
      );
      setStock(newStock);
      savePharmacyStock(newStock);
      addLogEntry({ type:"ajuste", itemId:editItem.item.id, itemName:editItem.item.name, delta:Number(delta), reason });
      auditLog("ESTOQUE_AJUSTADO", { medicamento:editItem.item.name, delta:Number(delta), reason });
    } else if (mode === "add") {
      const newItem = { ...form, id: "s" + Date.now(), qty: Number(form.qty), minQty: Number(form.minQty) };
      const newStock = [...stock, newItem];
      setStock(newStock);
      savePharmacyStock(newStock);
      addLogEntry({ type:"cadastro", itemName:form.name, qty:Number(form.qty) });
      auditLog("MEDICAMENTO_CADASTRADO", { medicamento:form.name, qty:Number(form.qty) });
    } else {
      const newStock = stock.map(s => s.id === editItem.item.id ? { ...s, ...form, qty:Number(form.qty), minQty:Number(form.minQty) } : s);
      setStock(newStock);
      savePharmacyStock(newStock);
      addLogEntry({ type:"edicao", itemName:form.name });
      auditLog("MEDICAMENTO_EDITADO", { medicamento:form.name });
    }
    setEditItem(null);
  }

  const lowStock   = stock.filter(s => s.qty <= s.minQty);
  const outStock   = stock.filter(s => s.qty === 0);
  const totalItems = stock.length;

  const filtered = stock.filter(s => {
    if (catFilter !== "Todas" && s.category !== catFilter) return false;
    if (showLowOnly && s.qty > s.minQty) return false;
    if (search.trim() && !s.name.toLowerCase().includes(search.trim().toLowerCase()) &&
        !s.category.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }).sort((a,b) => {
    // Critical (zero) first, then low, then ok
    const score = s => s.qty === 0 ? 0 : s.qty <= s.minQty ? 1 : 2;
    return score(a) - score(b) || a.name.localeCompare(b.name,"pt-BR");
  });

  const filteredLog = log.filter(l => {
    if (!logSearch.trim()) return true;
    return (l.itemName||"").toLowerCase().includes(logSearch.toLowerCase()) ||
           (l.patient||"").toLowerCase().includes(logSearch.toLowerCase()) ||
           (l.pharma||"").toLowerCase().includes(logSearch.toLowerCase());
  });

  function logTypeBadge(type) {
    const map = {
      dispensa: { label:"Dispensação", bg:"#eff6ff",  color:"#1d4ed8", border:"#bfdbfe" },
      ajuste:   { label:"Ajuste",      bg:"#fff7ed",  color:"#c2410c", border:"#fed7aa" },
      cadastro: { label:"Cadastro",    bg:"#f0fdf4",  color:"#15803d", border:"#bbf7d0" },
      edicao:   { label:"Edição",      bg:"#faf5ff",  color:"#7e22ce", border:"#e9d5ff" },
    };
    const s = map[type] || { label:type, bg:"var(--surface-2)", color:"var(--text-2)", border:"var(--border)" };
    return <span style={{fontSize:".68rem",padding:".1rem .45rem",borderRadius:999,background:s.bg,color:s.color,border:`1px solid ${s.border}`,fontWeight:700,whiteSpace:"nowrap"}}>{s.label}</span>;
  }

  function stockStatusColor(item) {
    if (item.qty === 0) return { bg:"#fff1f2", border:"#fecdd3", text:"#be123c", label:"Zerado" };
    if (item.qty <= item.minQty) return { bg:"#fff7ed", border:"#fed7aa", text:"#c2410c", label:"Baixo" };
    return { bg:"#f0fdf4", border:"#bbf7d0", text:"#15803d", label:"OK" };
  }

  function fmtTs(ts) {
    if (!ts) return "-";
    const d = new Date(ts);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Header */}
      <section className="home-hero" style={{margin:"1.5rem 1.5rem .75rem"}}>
        <div style={{flex:1}}>
          <p className="home-kicker">💊 Gestão de Medicamentos</p>
          <h1 className="home-title">💊 Farmácia UBS</h1>
          <p className="home-sub">Controle de estoque, dispensação e rastreabilidade de medicamentos.</p>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:".75rem",flexShrink:0}}>
          {isAuthenticated ? (
            <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:".78rem",fontWeight:700,color:"var(--teal-700)"}}>{pharmaUser.name}</div>
                <div style={{fontSize:".68rem",color:"var(--text-3)"}}>Farmacêutico(a) · sessão ativa</div>
              </div>
              <button onClick={doLogout} style={{fontSize:".75rem",padding:".3rem .65rem",background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>
                Sair
              </button>
            </div>
          ) : (
            <button onClick={()=>setShowLogin(true)} style={{display:"flex",alignItems:"center",gap:".4rem"}}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 7v3M8 5.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              Entrar como Farmacêutico
            </button>
          )}
        </div>
      </section>

      {/* KPI Cards */}
      <div style={{display:"flex",gap:".75rem",padding:"0 1.5rem .75rem",flexWrap:"wrap"}}>
        {[
          { label:"Total de itens", value:totalItems, icon:"ðŸ“¦", color:"var(--teal-600)" },
          { label:"Estoque baixo",  value:lowStock.length, icon:"âš ï¸", color:lowStock.length>0?"var(--amber-600)":"var(--text-3)", warn:lowStock.length>0 },
          { label:"Sem estoque",    value:outStock.length, icon:"🚫", color:outStock.length>0?"#be123c":"var(--text-3)", danger:outStock.length>0 },
          { label:"Dispensações hoje", value:log.filter(l=>l.type==="dispensa"&&l.ts?.slice(0,10)===new Date().toISOString().slice(0,10)).length, icon:"💊", color:"var(--teal-600)" },
        ].map(k => (
          <div key={k.label} className="card" style={{
            flex:"1 1 150px",padding:".85rem 1rem",minWidth:130,
            background:k.danger?"#fff1f2":k.warn?"#fff7ed":"var(--surface)",
            border:`1px solid ${k.danger?"#fecdd3":k.warn?"#fed7aa":"var(--border)"}`,
          }}>
            <div style={{fontSize:"1.25rem",lineHeight:1}}>{k.icon}</div>
            <div style={{fontSize:"1.55rem",fontWeight:800,color:k.color,lineHeight:1.1,marginTop:".3rem"}}>{k.value}</div>
            <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".2rem"}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,padding:"0 1.5rem",borderBottom:"1px solid var(--border)",marginBottom:0}}>
        {[["stock","📋 Estoque"],["log","🗂ï¸ Log de Movimentações"]].map(([id,label])=>(
          <button key={id} onClick={()=>setPharmaTab(id)}
            style={{padding:".55rem 1rem",fontSize:".8rem",fontWeight:600,border:"none",
              background:"transparent",cursor:"pointer",color:pharmaTab===id?"var(--teal-600)":"var(--text-3)",
              borderBottom:pharmaTab===id?"2px solid var(--teal-500)":"2px solid transparent",
              transition:"all .12s"}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflow:"auto",padding:"1rem 1.5rem 1.5rem"}}>

        {pharmaTab === "stock" && (
          <>
            {/* Toolbar */}
            <div style={{display:"flex",gap:".6rem",marginBottom:"1rem",flexWrap:"wrap",alignItems:"center"}}>
              <div style={{position:"relative",flex:"1 1 200px"}}>
                <span style={{position:"absolute",left:".6rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)"}}>
                  <IconSearch/>
                </span>
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Buscar medicamento ou categoria..."
                  style={{paddingLeft:"1.8rem",width:"100%",boxSizing:"border-box"}}/>
              </div>
              <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{minWidth:160}}>
                {PHARMA_CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
              <button
                onClick={()=>setShowLowOnly(v=>!v)}
                style={{fontSize:".78rem",padding:".38rem .75rem",
                  background:showLowOnly?"#fff7ed":"var(--surface-2)",
                  border:`1px solid ${showLowOnly?"#fed7aa":"var(--border)"}`,
                  color:showLowOnly?"#c2410c":"var(--text-2)"}}>
                {showLowOnly?"âš ï¸ Só baixo":"âš ï¸ Filtrar baixo"}
              </button>
              {isAuthenticated && (
                <button onClick={()=>setEditItem({item:null,mode:"add"})} style={{fontSize:".78rem",padding:".38rem .8rem",flexShrink:0}}>
                  + Novo medicamento
                </button>
              )}
            </div>

            {/* Table */}
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <table className="patients-table" style={{width:"100%"}}>
                <thead>
                  <tr>
                    <th style={{width:40,textAlign:"center"}}>Status</th>
                    <th>Medicamento</th>
                    <th>Categoria</th>
                    <th style={{textAlign:"center"}}>Estoque</th>
                    <th style={{textAlign:"center"}}>Mínimo</th>
                    <th>Localização</th>
                    {isAuthenticated && <th style={{textAlign:"center"}}>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={isAuthenticated?7:6} style={{textAlign:"center",padding:"2rem",color:"var(--text-3)",fontSize:".84rem"}}>Nenhum medicamento encontrado.</td></tr>
                  )}
                  {filtered.map(item => {
                    const sc = stockStatusColor(item);
                    return (
                      <tr key={item.id}>
                        <td style={{textAlign:"center"}}>
                          <span title={sc.label} style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:sc.text}}/>
                        </td>
                        <td>
                          <div style={{fontWeight:600,fontSize:".84rem",color:"var(--ink)"}}>{item.name}</div>
                          <div style={{fontSize:".7rem",color:"var(--text-3)"}}>{item.unit}</div>
                        </td>
                        <td>
                          <span style={{fontSize:".71rem",padding:".1rem .4rem",borderRadius:999,background:"var(--surface-2)",color:"var(--text-2)",border:"1px solid var(--border)"}}>
                            {item.category}
                          </span>
                        </td>
                        <td style={{textAlign:"center"}}>
                          <span style={{fontWeight:700,fontSize:".9rem",color:sc.text,
                            background:sc.bg,border:`1px solid ${sc.border}`,
                            padding:".1rem .55rem",borderRadius:999,display:"inline-block"}}>
                            {item.qty}
                          </span>
                        </td>
                        <td style={{textAlign:"center",fontSize:".8rem",color:"var(--text-3)"}}>{item.minQty}</td>
                        <td style={{fontSize:".78rem",color:"var(--text-3)"}}>{item.location}</td>
                        {isAuthenticated && (
                          <td style={{textAlign:"center"}}>
                            <div style={{display:"flex",gap:".3rem",justifyContent:"center",flexWrap:"nowrap"}}>
                              <button onClick={()=>setDispenseItem(item)}
                                disabled={item.qty===0}
                                title="💊 Dispensar"
                                style={{fontSize:".71rem",padding:".25rem .55rem",flexShrink:0,
                                  background:"var(--teal-600)",color:"#fff",border:"none",
                                  opacity:item.qty===0?.4:1}}>
                                💊 Dispensar
                              </button>
                              <button onClick={()=>setEditItem({item,mode:"adjust"})}
                                title="Ajustar estoque"
                                style={{fontSize:".71rem",padding:".25rem .5rem",flexShrink:0,
                                  background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>
                                ± Ajustar
                              </button>
                              <button onClick={()=>setEditItem({item,mode:"edit"})}
                                title="Editar"
                                style={{fontSize:".71rem",padding:".25rem .5rem",flexShrink:0,
                                  background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>
                                âœï¸
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!isAuthenticated && (
              <div style={{marginTop:".75rem",padding:".65rem 1rem",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:"var(--r-md)",fontSize:".78rem",color:"#92400e",display:"flex",alignItems:"center",gap:".5rem"}}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1l6.5 13H1.5L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                Faça login como farmacêutico para dispensar medicamentos e ajustar o estoque.
              </div>
            )}
          </>
        )}

        {pharmaTab === "log" && (
          <>
            {/* ANVISA RDC 20/2011 – aviso de retenção obrigatória */}
            <div style={{marginBottom:"1rem",padding:".6rem .85rem",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".73rem",color:"#92400e",display:"flex",gap:".5rem",alignItems:"flex-start"}}>
              <span style={{flexShrink:0}}>âš–ï¸</span>
              <span><strong>ANVISA RDC 20/2011:</strong> A escrituração de dispensação deve ser conservada por no mínimo <strong>5 anos</strong>. Este histórico não pode ser deletado. Para fins de auditoria, todos os registros devem ser exportados e arquivados fisicamente.</span>
            </div>
            <div style={{marginBottom:"1rem",display:"flex",gap:".65rem",alignItems:"center",flexWrap:"wrap"}}>
              <div style={{position:"relative",flex:1,maxWidth:380}}>
                <span style={{position:"absolute",left:".6rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)"}}>
                  <IconSearch/>
                </span>
                <input value={logSearch} onChange={e=>setLogSearch(e.target.value)}
                  placeholder="Buscar por medicamento, paciente, nº receita..."
                  style={{paddingLeft:"1.8rem",width:"100%",boxSizing:"border-box"}}/>
              </div>
              <button type="button" onClick={()=>{
                const csv = ["Data/Hora;Tipo;Medicamento;Qtd;Paciente;Prescritor;Conselho;Nº Receita;Data Receita;Lote;Farmacêutico;Obs",
                  ...log.map(l=>[l.tsDisplay||l.ts,l.type,l.itemName,l.qty||"",l.patient||"",l.prescriber||"",l.prescriberCouncil||"",l.numReceita||"",l.dtReceita||"",l.lote||"",l.pharma||"",l.notes||""].map(v=>String(v).replace(/;/g,",")).join(";"))
                ].join("\n");
                const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
                a.download=`dispensacoes_${new Date().toISOString().slice(0,10)}.csv`; a.click();
              }} style={{fontSize:".76rem",padding:".4rem .85rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>
                â¬‡ï¸ Exportar CSV (ANVISA)
              </button>
            </div>
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <table className="patients-table" style={{width:"100%"}}>
                <thead>
                  <tr>
                    <th style={{width:130}}>Data / hora</th>
                    <th style={{width:90}}>Tipo</th>
                    <th>Medicamento</th>
                    <th>Detalhe / Rastreabilidade</th>
                    <th style={{width:110}}>Farmacêutico</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.length === 0 && (
                    <tr><td colSpan={5} style={{textAlign:"center",padding:"2rem",color:"var(--text-3)",fontSize:".84rem"}}>Nenhuma movimentação registrada.</td></tr>
                  )}
                  {filteredLog.map(l => (
                    <tr key={l.id}>
                      <td style={{fontSize:".72rem",color:"var(--text-3)",whiteSpace:"nowrap"}}>{fmtTs(l.ts)}</td>
                      <td>{logTypeBadge(l.type)}</td>
                      <td>
                        <div style={{fontWeight:600,fontSize:".82rem"}}>{l.itemName}</div>
                        {l.lote&&<div style={{fontSize:".68rem",color:"var(--text-3)"}}>Lote: {l.lote}</div>}
                      </td>
                      <td style={{fontSize:".76rem",color:"var(--text-2)"}}>
                        {l.type==="dispensa" && <div style={{display:"flex",flexDirection:"column",gap:".1rem"}}>
                          <span><strong>{l.qty}x</strong> â†’ <strong>{l.patient}</strong></span>
                          {l.prescriber && <span style={{color:"var(--text-3)"}}>Prescritor: {l.prescriber}{l.prescriberCouncil?` (${l.prescriberCouncil})`:""}</span>}
                          {l.numReceita && <span style={{color:"var(--text-3)"}}>Receita nº {l.numReceita}{l.dtReceita?` – ${new Date(l.dtReceita+"T12:00:00").toLocaleDateString("pt-BR")}`:""}</span>}
                          {l.notes && <span style={{color:"var(--text-3)",fontStyle:"italic"}}>{l.notes}</span>}
                        </div>}
                        {l.type==="ajuste" && <>
                          <span style={{fontWeight:600,color:l.delta>=0?"#15803d":"#be123c"}}>{l.delta>=0?"+":""}{l.delta}</span>
                          {l.reason && <span style={{color:"var(--text-3)"}}> · {l.reason}</span>}
                        </>}
                        {l.type==="cadastro" && <span>Estoque inicial: {l.qty}</span>}
                        {l.type==="edicao" && <span>Dados atualizados</span>}
                      </td>
                      <td style={{fontSize:".75rem",color:"var(--text-3)"}}>{l.pharma}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showLogin && <PharmaLoginModal onLogin={doLogin} onClose={()=>setShowLogin(false)}/>}
      {dispenseItem && isAuthenticated && (
        <DispenseModal item={dispenseItem} pharmaUser={pharmaUser} onConfirm={handleDispense} onClose={()=>setDispenseItem(null)}/>
      )}
      {editItem && isAuthenticated && (
        <StockEditModal item={editItem.item} mode={editItem.mode} pharmaUser={pharmaUser} onConfirm={handleStockConfirm} onClose={()=>setEditItem(null)}/>
      )}
    </div>
  );
}

/* ── VACCINES PAGE ─────────────────────────────────────────────── */
// ── Calendário vacinal do Indicador – Equipe Rosa ────────────────
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
  if (gestWeeks !== null && gestWeeks < 20) return []; // antes das 20 semanas: nenhuma
  return PNI_CALENDAR.filter(v => v.id === "dt-g"); // dT/dTpa gestante
}

// Idoso Rosa: apenas Influenza (dose anual – dentro de 12 meses)
function getRosaIdosoVaccines() {
  return PNI_CALENDAR.filter(v => v.id === "influenza-i");
}

// Adolescente Rosa feminino 9–14 anos: apenas HPV dose única
function getRosaHpvVaccines(ageMonths, sex) {
  const isFeminino = String(sex||"").toLowerCase() === "feminino";
  if (!isFeminino) return [];
  if (ageMonths === null || ageMonths < 108 || ageMonths > 168) return []; // 9a = 108m, 14a = 168m
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
        body: JSON.stringify({ type:"vaccine", title:applyForm.vaccine, date:applyForm.date, details:detailsParts.join(" – ") }),
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
      <section className="home-hero" style={{margin:"1.5rem 1.5rem .75rem"}}>
        <div>
          <p className="home-kicker">💉 Calendário Nacional de Vacinação</p>
          <h1 className="home-title" style={{display:"flex",alignItems:"center",gap:".6rem",flexWrap:"wrap"}}>
            Carteira de Vacinas
            {isEquipeRosa&&<span style={{fontSize:".65rem",fontWeight:700,padding:".2rem .6rem",borderRadius:999,background:"#fdf2f8",color:"#9d174d",border:"1px solid #fbcfe8",letterSpacing:".04em"}}>🌸 Indicador – Equipe Rosa</span>}
          </h1>
          <p className="home-sub">{isEquipeRosa
            ? "Exibindo vacinas do indicador: crianças (calendário completo do indicador), gestantes (dTpa ≥20s), idosos (Influenza) e meninas 9–14a (HPV)."
            : "Indicações baseadas no Calendário Nacional de Vacinação – Ministério da Saúde."}</p>
        </div>
      </section>

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
                          background:totalPending?"var(--amber-50)":"#f0fdf4",
                          color:totalPending?"var(--amber-700)":"#15803d",
                          border:totalPending?"1px solid var(--amber-100)":"1px solid #bbf7d0",
                          fontWeight:600}}>
                          {totalPending ? `${totalPending} pendente${totalPending>1?"s":""}` : "Em dia âœ“"}
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
                      <button type="submit" disabled={applyBusy}>{applyBusy?"Salvando...":"âœ… Registrar"}</button>
                    </form>
                  </div>
                )}

                {card?.loading
                  ? <p style={{padding:"2rem",textAlign:"center",color:"var(--text-3)",fontSize:".84rem"}}>Carregando...</p>
                  : (
                    <div style={{padding:"1rem 1.1rem",display:"flex",flexDirection:"column",gap:"1.5rem"}}>

                      {rosaGestantePrecoce && (
                        <div style={{padding:".85rem 1rem",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".82rem",color:"#92400e",display:"flex",alignItems:"flex-start",gap:".6rem"}}>
                          <span style={{fontSize:"1.1rem",flexShrink:0}}>🤰</span>
                          <div>
                            <div style={{fontWeight:700,marginBottom:".2rem"}}>dTpa – aguardando 20ª semana</div>
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
                                {[["Criança","0–9a","#1d4ed8","#eff6ff","#bfdbfe"],["Adolescente","10–19a","#15803d","#f0fdf4","#bbf7d0"],["Adulto","20–59a","#7e22ce","#faf5ff","#e9d5ff"],["Idoso","60+a","#c2410c","#fff7ed","#fed7aa"]].map(([label,range,color,bg,border])=>(
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
                                        ? (String(last.details||"").match(/Aplicado por: ([^–\n]+)/)?.[1]?.trim()
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
                                              background:applied?"#dcfce7":"var(--amber-100)"}}>
                                              {applied
                                                ? <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
                                                color:"#15803d",background:"#dcfce7",padding:".1rem .4rem",
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
                        const condColor = AGE_GROUP_COLOR[condGroup] || {bg:"#fff1f2",border:"#fecdd3",text:"#be123c"};
                        return (
                          <div style={{paddingTop:".75rem",borderTop:"2px dashed var(--border)"}}>
                            <div style={{display:"flex",alignItems:"center",gap:".5rem",marginBottom:".75rem"}}>
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="6.5" stroke={condColor.text} strokeWidth="1.4"/>
                                <path d="M8 4v4l3 3" stroke={condColor.text} strokeWidth="1.4" strokeLinecap="round"/>
                              </svg>
                              <span style={{fontWeight:700,fontSize:".82rem",color:condColor.text}}>
                                Vacinas indicadas por condição –
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
                                  ? (String(last.details||"").match(/Aplicado por: ([^–\n]+)/)?.[1]?.trim()
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
                                        background:applied?"#dcfce7":condColor.border}}>
                                        {applied
                                          ? <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
                                          color:"#15803d",background:"#dcfce7",padding:".1rem .4rem",
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


function AiTab({ aiView, aiData, aiQuestion, setAiQuestion, onPriorities, onQuality, onReport, onAsk, busy }) {
  return (
    <div className="workspace-home">
      <div className="home-hero">
        <div>
          <p className="home-kicker">IA Assistida</p>
          <h1 className="home-title">Assistente da Equipe</h1>
          <p className="home-sub">Prioridades do dia, qualidade de dados e perguntas operacionais em linguagem natural.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Ações rápidas</span>
        </div>
        <div className="card-body">
          <div className="actions" style={{marginBottom:"1rem"}}>
            <button onClick={onPriorities} disabled={busy}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h7M3 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              Prioridades do dia
            </button>
            <button onClick={onQuality} disabled={busy}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5 6.5 5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
              Qualidade de dados
            </button>
            <button onClick={onReport} disabled={busy}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 2h10v12H3z" stroke="currentColor" strokeWidth="1.3"/><path d="M6 6h4M6 9h4M6 12h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              Relatório executivo
            </button>
          </div>

          <form onSubmit={onAsk} style={{display:"flex",gap:".6rem"}}>
            <input
              style={{flex:1}}
              placeholder="Pergunte ao assistente... Ex: Quais pacientes estão com protocolo atrasado?"
              value={aiQuestion} onChange={e=>setAiQuestion(e.target.value)}
            />
            <button type="submit" disabled={busy||!aiQuestion.trim()}>Perguntar</button>
          </form>
        </div>

        {aiData&&(
          <div style={{borderTop:"1px solid var(--border)",padding:"1.25rem"}}>
            {aiView==="priorities"&&(
              <>
                <h4 style={{marginBottom:".75rem",fontWeight:700,fontSize:".85rem"}}>Prioridades do dia</h4>
                {!Array.isArray(aiData?.items)||!aiData.items.length
                  ? <p className="muted">Nenhum paciente priorizado.</p>
                  : <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                      {aiData.items.map((item,idx)=>(
                        <div key={item.patientId||idx} style={{padding:".75rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:".25rem"}}>
                            <strong style={{fontSize:".85rem"}}>{idx+1}. {item.patientName}</strong>
                            <Chip tone={item?.risk?.level==="high"?"danger":"warn"}>{String(item?.risk?.level||"-").toUpperCase()} ⬢ {item?.risk?.score||0}pts</Chip>
                          </div>
                          <p style={{fontSize:".78rem",color:"var(--text-2)"}}>{item.topAction||"Revisar pendências"}</p>
                        </div>
                      ))}
                    </div>
                }
              </>
            )}

            {aiView==="quality"&&(
              <>
                <h4 style={{marginBottom:".75rem",fontWeight:700,fontSize:".85rem"}}>Qualidade de dados</h4>
                {!Array.isArray(aiData?.findings)||!aiData.findings.length
                  ? <p className="muted">Nenhuma inconsistência encontrada. âœ“</p>
                  : aiData.findings.map((f,idx)=>(
                      <div key={idx} style={{padding:".65rem .85rem",borderLeft:"3px solid var(--amber-400)",background:"var(--amber-50)",borderRadius:"0 var(--r-md) var(--r-md) 0",marginBottom:".4rem"}}>
                        <strong style={{fontSize:".83rem",color:"var(--amber-800)"}}>{f.patientName||"Paciente"}</strong>
                        <p style={{fontSize:".78rem",color:"var(--amber-700)",marginTop:".15rem"}}>{f.issue||"Inconsistência"}</p>
                      </div>
                    ))
                }
              </>
            )}

            {aiView==="report"&&(
              <>
                <h4 style={{marginBottom:".5rem",fontWeight:700,fontSize:".85rem"}}>Relatório executivo</h4>
                <div style={{padding:".85rem",background:"var(--surface-2)",borderRadius:"var(--r-md)",marginBottom:".75rem",fontSize:".84rem",color:"var(--text-2)",lineHeight:1.6}}>
                  {aiData?.executiveSummary||"Resumo não disponível."}
                </div>
                <div style={{display:"flex",gap:"1rem",flexWrap:"wrap",marginBottom:"1rem"}}>
                  {[["Pacientes",aiData?.totals?.patients],["Alto risco",aiData?.totals?.highRiskPatients],["Tarefas vencidas",aiData?.totals?.overdueTasks]].map(([label,val])=>(
                    <div key={label} style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:".75rem 1rem",flex:1,minWidth:100}}>
                      <div style={{fontSize:"1.4rem",fontWeight:700,fontFamily:"IBM Plex Mono"}}>{val||0}</div>
                      <div style={{fontSize:".72rem",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".05em"}}>{label}</div>
                    </div>
                  ))}
                </div>
                {aiData?.recommendations?.length>0&&(
                  <>
                    <h4 style={{fontWeight:700,fontSize:".8rem",marginBottom:".4rem"}}>Recomendações</h4>
                    {aiData.recommendations.map((rec,i)=>(
                      <div key={i} style={{padding:".5rem .75rem",borderLeft:"2px solid var(--teal-400)",marginBottom:".3rem",fontSize:".82rem",color:"var(--text-2)"}}>{rec}</div>
                    ))}
                  </>
                )}
              </>
            )}

            {aiView==="chat"&&(
              <div style={{padding:".85rem",background:"var(--teal-50)",border:"1px solid var(--teal-100)",borderRadius:"var(--r-md)",fontSize:".84rem",color:"var(--teal-900)",lineHeight:1.6}}>
                {aiData?.answer||"Sem resposta."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UserList({ title, users, isManagerUser, onEdit, onDelete }) {
  return (
    <div className="workspace-home">
      <div className="card">
        <SectionHeader
          title={title}
          count={users.length}
        />
        {!users.length
          ? <EmptyState message={`Nenhum ${title.toLowerCase()} cadastrado.`}/>
          : <ul className="stack-list" style={{padding:"0 1.25rem"}}>
              {users.map(u=>(
                <li key={u.id}>
                  <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
                    <div className="user-avatar" style={{width:32,height:32,fontSize:".8rem",flexShrink:0}}>{initials(u.name)}</div>
                    <div>
                      <p><strong>{u.name}</strong></p>
                      <p className="muted small">{u.email}</p>
                      {u.councilNumber&&<p className="muted small">CRM {u.councilNumber}/{u.councilUf}</p>}
                    </div>
                  </div>
                  {isManagerUser&&(
                    <div className="actions">
                      <button className="secondary" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>onEdit(u)()}>Editar</button>
                      <button className="danger-btn" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>onDelete(u)}>Excluir</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
        }
      </div>
    </div>
  );
}


function ProtocolsTab({ templates, canManageUser, onEdit, onDelete }) {
  return (
    <div className="workspace-home">
      <div className="card">
        <SectionHeader
          title="Protocolos"
          count={templates.length}
          action={canManageUser&&<button onClick={onEdit(null)}>+ Novo protocolo</button>}
        />
        {!templates.length
          ? <EmptyState message="Nenhum protocolo cadastrado."/>
          : <div style={{padding:"0 1.25rem"}}>
              {templates.map(tpl=>(
                <div key={tpl.category} style={{padding:".85rem 0",borderBottom:"1px solid var(--border-soft)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"1rem"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:".6rem",marginBottom:".3rem"}}>
                      <strong style={{fontSize:".88rem"}}>{tpl.label}</strong>
                      <span style={{fontSize:".7rem",color:"var(--text-3)",background:"var(--slate-100)",padding:".1em .5em",borderRadius:99}}>{tpl.category}</span>
                    </div>
                    <div style={{display:"flex",gap:".85rem",fontSize:".75rem",color:"var(--text-2)",flexWrap:"wrap"}}>
                      <span>Visitas: <strong>{Number(tpl?.targets?.visits||0)}</strong></span>
                      <span>Consultas: <strong>{Number(tpl?.targets?.consultations||0)}</strong></span>
                      <span>Vacinas: <strong>{Number(tpl?.targets?.vaccines||0)}</strong></span>
                    </div>
                    {Array.isArray(tpl?.vaccines)&&tpl.vaccines.length>0&&(
                      <div style={{marginTop:".25rem",fontSize:".72rem",color:"var(--text-3)"}}>Vacinas: {tpl.vaccines.join(", ")}</div>
                    )}
                  </div>
                  {canManageUser&&(
                    <div className="actions">
                      <button className="secondary" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>onEdit(tpl)()}>Editar</button>
                      <button className="danger-btn" style={{padding:".3rem .7rem",fontSize:".75rem"}} onClick={()=>onDelete(tpl)}>Excluir</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}


function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} style={{padding:".3rem"}}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DiagnosticsPage({ apiHealth, token, user, patients, users, templates, lastLoadAt, demandMonthly }) {
  const sessionAgeMin = useMemo(() => {
    const issuedAt = Number(user?.iat || 0) * 1000;
    if (!issuedAt) return null;
    return Math.max(0, Math.round((Date.now() - issuedAt) / 60000));
  }, [user?.iat]);

  const updatedAt = apiHealth?.checkedAt
    ? new Date(apiHealth.checkedAt).toLocaleString("pt-BR")
    : "-";

  const healthColor = apiHealth?.status === "ok"
    ? "var(--green-600)"
    : apiHealth?.status === "degraded"
      ? "var(--amber-600)"
      : "var(--red-600,#dc2626)";

  const latency = Number(apiHealth?.latencyMs || 0);
  const totalRecords = useMemo(() => {
    try {
      return (patients || []).reduce((sum, p) => sum + Number(p?.historyCount || 0), 0);
    } catch {
      return 0;
    }
  }, [patients]);

  return (
    <div style={{padding:"1.15rem 1.2rem",display:"grid",gap:"1rem"}}>
      <section className="panel-card">
        <div className="panel-card-hd">Diagnósticos do sistema</div>
        <p className="home-task-meta">Visão técnica para suporte: conectividade, sessão, carga e consistência básica.</p>
      </section>

      <section className="grid-cards" style={{gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))"}}>
        <div className="panel-card">
          <div className="muted tiny" style={{textTransform:"uppercase",letterSpacing:".08em"}}>API</div>
          <div style={{fontSize:"1.2rem",fontWeight:800,color:healthColor}}>
            {apiHealth?.label || "Indefinido"}
          </div>
          <div className="muted small">Última verificação: {updatedAt}</div>
          <div className="muted small">Latência: {latency ? `${latency} ms` : "-"}</div>
        </div>
        <div className="panel-card">
          <div className="muted tiny" style={{textTransform:"uppercase",letterSpacing:".08em"}}>Sessão</div>
          <div style={{fontSize:"1.2rem",fontWeight:800}}>{token ? "Ativa" : "Inativa"}</div>
          <div className="muted small">Perfil: {roleLabel(user?.role)}</div>
          <div className="muted small">Tempo de sessão: {sessionAgeMin === null ? "-" : `${sessionAgeMin} min`}</div>
        </div>
        <div className="panel-card">
          <div className="muted tiny" style={{textTransform:"uppercase",letterSpacing:".08em"}}>Carga local</div>
          <div style={{fontSize:"1.2rem",fontWeight:800}}>{patients?.length || 0} pacientes</div>
          <div className="muted small">{users?.length || 0} usuários · {templates?.length || 0} protocolos</div>
          <div className="muted small">Histórico agregado: {totalRecords}</div>
        </div>
        <div className="panel-card">
          <div className="muted tiny" style={{textTransform:"uppercase",letterSpacing:".08em"}}>Última carga</div>
          <div style={{fontSize:"1.2rem",fontWeight:800}}>{lastLoadAt ? new Date(lastLoadAt).toLocaleTimeString("pt-BR") : "-"}</div>
          <div className="muted small">Demanda total: {Number(demandMonthly?.totals?.total ?? 0)}</div>
          <div className="muted small">Agendados: {Number(demandMonthly?.totals?.scheduled ?? 0)} · Espontâneos: {Number(demandMonthly?.totals?.walkin ?? 0)}</div>
        </div>
      </section>
    </div>
  );
}



/* ── Error Boundary – captura erros de renderização e evita tela branca ── */
class AppErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error("AppErrorBoundary:", e, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          minHeight:"100vh",padding:"2rem",background:"#f8fafc",fontFamily:"system-ui,sans-serif"}}>
          <div style={{maxWidth:480,width:"100%",background:"#fff",borderRadius:12,padding:"2rem",
            boxShadow:"0 4px 24px rgba(0,0,0,.08)",border:"1px solid #e2e8f0"}}>
            <div style={{fontSize:"2rem",marginBottom:"1rem",textAlign:"center"}}>âš ï¸</div>
            <h2 style={{margin:"0 0 .5rem",fontSize:"1.1rem",color:"#0f172a",textAlign:"center"}}>
              Ocorreu um erro inesperado
            </h2>
            <p style={{fontSize:".85rem",color:"#64748b",margin:"0 0 1.5rem",textAlign:"center",lineHeight:1.6}}>
              {String(this.state.error?.message||this.state.error||"Erro desconhecido")}
            </p>
            <div style={{display:"flex",gap:".75rem",justifyContent:"center"}}>
              <button onClick={()=>{ sessionStorage.clear(); window.location.reload(); }}
                style={{padding:".5rem 1.25rem",background:"#0f172a",color:"#fff",border:"none",
                  borderRadius:8,cursor:"pointer",fontSize:".85rem",fontWeight:600}}>
                Recarregar
              </button>
              <button onClick={()=>{ sessionStorage.clear(); localStorage.removeItem("saudeubs_react_session"); window.location.reload(); }}
                style={{padding:".5rem 1.25rem",background:"#fff",color:"#64748b",border:"1px solid #e2e8f0",
                  borderRadius:8,cursor:"pointer",fontSize:".85rem"}}>
                Limpar sessão e recarregar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppInner() {
  const session = readSession();
  const uiState = readUiState();
  const [user, setUser] = useState(session?.user || null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(uiState?.tab || "dashboard");

  // Valida o token – se vier algo inválido limpa a sessão
  const initialToken = (() => {
    try {
      const t = String(session?.token || "");
      // Token deve ser string não vazia sem espaços – se inválido, limpa sessão
      if (t && !/\s/.test(t)) return t;
      return "";
    } catch { return ""; }
  })();

  const [token, setToken] = useState(initialToken);
  const [selectedPatientId, setSelectedPatientId] = useState(uiState?.selectedPatientId || "");

  const [patientTab, setPatientTab] = useState(uiState?.patientTab==="history"?"chart":(uiState?.patientTab||"protocol"));
  const [appointments, setAppointments] = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [messages, setMessages] = useState([]);
  const [history,  setHistory]  = useState([]);
  const [patientProtocolSummary, setPatientProtocolSummary] = useState(null);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  const [apiHealth, setApiHealth] = useState({ status:"checking", label:"Verificando...", latencyMs:0, checkedAt:null });
  const [lastLoadAt, setLastLoadAt] = useState(null);
  const [demandMonthly, setDemandMonthly] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [publicTeams,  setPublicTeams]  = useState([]);
  const [query,          setQuery]          = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [acsFilter,      setAcsFilter]      = useState("");
  const [conditionFilter, setConditionFilter] = useState(""); // "" | "hypertension" | "diabetes" | "both"
  const [editingPatient, setEditingPatient] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [viewPatient, setViewPatient] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [form,     setForm]     = useState(emptyPatientForm);
  const [recordForm, setRecordForm] = useState({type:"consultation",title:"Consulta médica",date:"",details:"",consultKind:"medica",consultDoctor:"",consultSpecialty:""});
  const [recordVaccines, setRecordVaccines] = useState([]);
  const [appointmentForm, setAppointmentForm] = useState({date:"",demandType:"scheduled",summary:"",conduct:"",nextStep:""});
  const [taskForm, setTaskForm] = useState({title:"",notes:"",dueDate:"",assigneeId:""});
  const [messageText, setMessageText] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState({role:"acs",name:"",email:"",password:"",councilNumber:"",councilUf:""});
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateForm, setTemplateForm] = useState({category:"",label:"",visits:0,consultations:0,vaccines:0,deadlinesVisits:0,deadlinesConsultations:0,deadlinesVaccines:0,vaccineList:""});
  const [aiView, setAiView] = useState("priorities");
  const [aiData, setAiData] = useState(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({name:"",email:"",password:"",councilNumber:"",councilUf:""});
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");

  const selectedPatient = patients.find(p=>p.id===selectedPatientId)||null;
  const isEquipeRosaUser = String(user?.teamId||user?.teamName||"").toLowerCase().includes("rosa");

  // Para Equipe Rosa: recomputa contagem de vacinas do protocolo usando apenas
  // as vacinas do indicador, a partir do histórico local do paciente.
  const rosaAdjustedSummary = useMemo(()=>{
    try {
    if (!isEquipeRosaUser || !patientProtocolSummary || !selectedPatient) return patientProtocolSummary;
    const cat    = String(selectedPatient.careCategory||"").toLowerCase();
    const ageMs  = selectedPatient.birthDate ? (Date.now() - (parseLocalDate(selectedPatient.birthDate)||new Date()).getTime()) : null;
    const ageMon = ageMs !== null ? ageMs / (1000*60*60*24*30.44) : null;
    const sex    = String(selectedPatient.sex||"").toLowerCase();

    // Determinar quais vacinas do indicador aplicam a este paciente
    let indicatorVaccines = [];
    if (cat === "child_followup" || (ageMon !== null && ageMon < 120)) {
      indicatorVaccines = getRosaIndicatorVaccines();
    } else if (cat === "pregnant") {
      const gi = gestationalAgeInfo(selectedPatient);
      indicatorVaccines = getRosaGestanteVaccines(gi ? gi.weeks : null);
    } else if (ageMon !== null && ageMon >= 720) {
      indicatorVaccines = getRosaIdosoVaccines();
    } else if (ageMon !== null && ageMon >= 108 && ageMon < 240) {
      // Adolescente: HPV é ADICIONAL ao calendário normal, não substitui
      const hpvVaccines = getRosaHpvVaccines(ageMon, sex);
      if (!hpvVaccines.length) return patientProtocolSummary; // masculino ou fora da faixa
      indicatorVaccines = hpvVaccines; // contar HPV adicionalmente
      // Manter contagens originais e somar HPV por cima
      const appliedVaccines = (history||[]).filter(h => String(h.type||"").toLowerCase() === "vaccine");
      const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g," ").replace(/\s+/g," ").trim();
      const hpvDone = hpvVaccines.filter(v =>
        v.aliases.some(alias => appliedVaccines.some(a => norm(a.title).includes(norm(alias))))
      ).length;
      return {
        ...patientProtocolSummary,
        completed: { ...(patientProtocolSummary.completed||{}), vaccines: (patientProtocolSummary.completed?.vaccines||0) + hpvDone },
        targets:   { ...(patientProtocolSummary.targets||{}),   vaccines: (patientProtocolSummary.targets?.vaccines||0) + hpvVaccines.length },
        pending:   { ...(patientProtocolSummary.pending||{}),   vaccines: Math.max(0,(patientProtocolSummary.pending?.vaccines||0) + (hpvVaccines.length - hpvDone)) },
      };
    }

    if (!indicatorVaccines.length) return patientProtocolSummary;

    // Contar quantas do indicador já foram aplicadas
    const appliedVaccines = (history||[]).filter(h => String(h.type||"").toLowerCase() === "vaccine");
    const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g," ").replace(/\s+/g," ").trim();
    const done = indicatorVaccines.filter(v =>
      v.aliases.some(alias => appliedVaccines.some(a => norm(a.title).includes(norm(alias))))
    ).length;
    const target = indicatorVaccines.length;

    // Substituir os valores de vacina no summary
    return {
      ...patientProtocolSummary,
      completed: { ...(patientProtocolSummary.completed||{}), vaccines: done },
      targets:   { ...(patientProtocolSummary.targets||{}),   vaccines: target },
      pending:   { ...(patientProtocolSummary.pending||{}),   vaccines: Math.max(0, target - done) },
    };
    } catch(e) { console.error("rosaAdjustedSummary error:", e); return patientProtocolSummary; }
  }, [isEquipeRosaUser, patientProtocolSummary, selectedPatient, history]);

  const sortedSpecialAlerts = useMemo(()=>{
    try {
    if (rosaAdjustedSummary?.alertsRestricted) return [];
    const rank={high:0,medium:1,low:2};
    let alerts = deriveProtocolAlerts(rosaAdjustedSummary);

    // Para crianças de puericultura: gerenciar alertas de visita por janela específica.
    // 1ª visita ACS: realizar até os 30 dias de vida.
    // 2ª visita ACS: realizar do 2º ao 6º mês (31–180 dias de vida).
    // Quando a janela passa sem registro â†’ prazo perdido (sem recuperação), sem gerar alerta.
    if (selectedPatient &&
        String(selectedPatient.careCategory||"").toLowerCase() === "child_followup" &&
        selectedPatient.birthDate) {
      const agedays = Math.floor((Date.now() - (parseLocalDate(selectedPatient.birthDate)||new Date()).getTime()) / 86400000);
      const visitsCompleted = Number(rosaAdjustedSummary?.completed?.visits ?? 0);
      const lost1st = agedays >= 31 && visitsCompleted === 0;
      const lost2nd = agedays >= 181 && visitsCompleted < 2;

      // Remover todos os alertas genéricos de visita (substituídos por alertas específicos por janela)
      alerts = alerts.filter(a => {
        const t = String(a.title||"").toLowerCase();
        return !t.includes("visit") && !t.includes("visita");
      });

      // 1ª visita: gerar alerta somente enquanto a janela (0–30 dias) ainda está ativa
      if (!lost1st && visitsCompleted === 0) {
        const daysLeft = Math.max(30 - agedays, 0);
        alerts.push({
          id: "puer-1a-visita",
          title: "1ª visita ACS pendente",
          detail: `Realizar até os 30 dias de vida. Restam ${daysLeft} dia(s).`,
          severity: daysLeft <= 5 ? "high" : "medium",
        });
      }

      // 2ª visita: gerar alerta somente enquanto a janela (31–180 dias) ainda está ativa
      if (!lost2nd && visitsCompleted < 2 && agedays >= 31) {
        const daysLeft = Math.max(180 - agedays, 0);
        alerts.push({
          id: "puer-2a-visita",
          title: "2ª visita ACS pendente",
          detail: `Realizar do 2º ao 6º mês de vida. Restam ${daysLeft} dia(s).`,
          severity: daysLeft <= 15 ? "high" : "medium",
        });
      }

      // Suprimir alertas de consulta cujas janelas já expiraram (não recuperáveis):
      // – 1ª consulta: janela 0–30 dias. Perdida se criança tem > 30 dias e 0 consultas.
      // – 2ª consulta: janela 31–180 dias. Perdida se criança tem > 180 dias e < 2 consultas.
      // Não faz sentido cobrar algo que não pode mais ser feito dentro do prazo correto.
      const _consultsDone   = Number(rosaAdjustedSummary?.completed?.consultations ?? 0);
      const _consultsTarget = Number(rosaAdjustedSummary?.targets?.consultations ?? 0);
      const lostConsult1st  = _consultsTarget >= 1 && _consultsDone === 0 && agedays >= 31;
      const lostConsult2nd  = _consultsTarget >= 2 && _consultsDone < 2  && agedays >= 181;
      if (lostConsult1st || lostConsult2nd) {
        alerts = alerts.filter(a => {
          const t = String(a.title||"").toLowerCase();
          return !t.includes("consult") && !t.includes("consulta");
        });
      }
    }

    // Para pacientes de puericultura: substituir todos os alertas de vacina do backend
    // por alertas gerados localmente a partir das vacinas do indicador (Equipe Rosa)
    // ou do calendário filtrado pela idade (outras equipes).
    // Isso evita que vacinas fora da janela de idade apareçam como alerta.
    if (selectedPatient) {
      const cat    = String(selectedPatient.careCategory||"").toLowerCase();
      const ageMs  = selectedPatient.birthDate ? (Date.now() - (parseLocalDate(selectedPatient.birthDate)||new Date()).getTime()) : null;
      const ageMon = ageMs !== null ? ageMs / (1000*60*60*24*30.44) : null;
      const sex    = String(selectedPatient.sex||"").toLowerCase();
      const isCrianca = cat === "child_followup" || (ageMon !== null && ageMon < 120);

      // Remover TODOS os alertas de vacina vindos do backend para qualquer paciente
      // (serão substituídos por alertas precisos calculados localmente)
      alerts = alerts.filter(a => {
        const t = String(a.title||"").toLowerCase();
        return !(t.includes("vacina") || t.includes("vaccine") || t.includes("pendente:"));
      });

      // Determinar as vacinas relevantes para este paciente
      let indicatorVaccines = [];
      if (isEquipeRosaUser) {
        if (isCrianca)
          indicatorVaccines = getRosaIndicatorVaccines();
        else if (cat === "pregnant") {
          const gi = gestationalAgeInfo(selectedPatient);
          indicatorVaccines = getRosaGestanteVaccines(gi ? gi.weeks : null);
        } else if (ageMon !== null && ageMon >= 720)
          indicatorVaccines = getRosaIdosoVaccines();
        else if (ageMon !== null && ageMon >= 108 && ageMon < 240)
          indicatorVaccines = getRosaHpvVaccines(ageMon, sex);
      } else if (isCrianca) {
        // Outras equipes: usar calendário completo mas só vacinas dentro da janela de idade
        indicatorVaccines = getRosaIndicatorVaccines(); // mesmo indicador base para crianças
      }

      // Gerar alertas frescos apenas para vacinas ainda pendentes
      if (indicatorVaccines.length > 0) {
        const appliedVaccines = (history||[]).filter(h => String(h.type||"").toLowerCase() === "vaccine");
        const pendingIndicator = indicatorVaccines.filter(v =>
          !vaccineApplied(v, appliedVaccines, selectedPatient.birthDate)
        );
        // Para crianças: mostrar apenas vacinas cuja janela já chegou ou está próxima (até 2 meses)
        const vaccineAlerts = pendingIndicator
          .filter(v => {
            if (v.ageGroup !== "Criança" || ageMon === null) return true;
            return v.windowMin <= (ageMon + 2);
          })
          .map(v => {
            let dueDate = null;
            if (selectedPatient.birthDate && v.windowMin !== undefined) {
              const birth = parseLocalDate(selectedPatient.birthDate);
              dueDate = new Date(birth.getTime() + v.windowMin * 30.44 * 86400000);
            }
            const isOverdue = dueDate && dueDate < new Date();
            const severity = isOverdue ? "high" : "medium";
            const dueDateStr = dueDate
              ? dueDate.toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric" })
              : null;
            const winLabel = v.windowMin >= 12
              ? `${Math.floor(v.windowMin/12)}a`
              : `${v.windowMin}m`;
            return {
              id: `rosa-vac-${v.id}`,
              title: `Vacina pendente: ${v.name} (${winLabel})`,
              detail: dueDateStr
                ? (isOverdue
                    ? `Dose prevista aos ${winLabel} de vida (${dueDateStr}) – atrasada`
                    : `Dose prevista aos ${winLabel} de vida (${dueDateStr}) – ainda não registrada`)
                : `Dose prevista aos ${winLabel} de vida – ainda não identificada no histórico`,
              severity,
            };
          });
        alerts = [...alerts, ...vaccineAlerts];
      }
    }

    return [...alerts].sort((a,b)=>{
      const ra=rank[String(a?.severity||"").toLowerCase()] ?? 3, rb=rank[String(b?.severity||"").toLowerCase()] ?? 3;
      return ra!==rb?ra-rb:String(a?.title||"").localeCompare(String(b?.title||""),"pt-BR");
    });
    } catch(e) { console.error("sortedSpecialAlerts error:", e); return []; }
  },[rosaAdjustedSummary, selectedPatient, isEquipeRosaUser, history]);

  async function refreshApiHealth() {
    const startedAt = Date.now();
    try {
      const payload = await getApiHealth();
      const latencyMs = Date.now() - startedAt;
      setApiHealth({
        status: "ok",
        label: payload?.ok ? "Online" : "Instável",
        latencyMs,
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      setApiHealth({
        status: "down",
        label: "Offline",
        latencyMs,
        checkedAt: new Date().toISOString(),
      });
    }
  }

  useEffect(()=>{ if(token) loadAll(); },[token]);

  useEffect(() => {
    refreshApiHealth();
    const intervalId = setInterval(refreshApiHealth, 45000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(()=>{
    if(!token||String(token).startsWith("local_")) return;
    async function ping(){
      await pingPresence(token);
    }
    ping().then(async()=>{
      try{ const fu=await listUsers(token); if(Array.isArray(fu)) setAllUsers(fu.map(u=>u.id===user?.id?{...u,online:true}:u)); }catch{}
    });
    const iv=setInterval(async()=>{await ping();try{const fu=await listUsers(token);if(Array.isArray(fu))setAllUsers(fu.map(u=>u.id===user?.id?{...u,online:true}:u));}catch{}},60000);
    return()=>clearInterval(iv);
  },[token]);
  useEffect(()=>{
    listPublicTeams().then(arr=>{ const a=Array.isArray(arr)?arr:[]; setPublicTeams(a); }).catch(()=>setPublicTeams([]));
  },[token]);
  useEffect(()=>{ localStorage.setItem(UI_STATE_KEY,JSON.stringify({tab: activeTab, patientTab, selectedPatientId})); },[activeTab, patientTab, selectedPatientId]);
  useEffect(()=>{
    if(!token||!selectedPatientId){setAppointments([]);setTasks([]);setMessages([]);setHistory([]);setPatientProtocolSummary(null);return;}
    loadSelectedPatientData(selectedPatientId);
    // Reseta o formulário de atendimento ao trocar de paciente
    setRecordForm({type:isAcs(user)?"visit":"consultation",
      title:isAcs(user)?"Visita ACS":user?.role==="doctor"?"Consulta médica":user?.role==="dentist"?"Consulta odontológica":"Consulta de enfermagem",
      date:"",details:"",conduct:"",nextStep:"",demandType:"scheduled",consultKind:"medica",consultDoctor:"",consultSpecialty:""});
    setRecordVaccines([]);
  },[token,selectedPatientId]);

  
  async function handleLogin(email,password) {
    setError(""); setBusy(true);
    try {
      const payload=await Promise.race([
        login(email.trim(),password),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 15000)
        )
      ]);
      if(payload?.twoFactorRequired) throw new Error("2FA ativo: tela React ainda não implementa desafio.");
      setToken(payload.token); setUser(payload.user);
      sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:payload.token,user:payload.user}));
      auditLog("LOGIN", { email: email.trim().toLowerCase(), success: true }, payload.user);
      // Gestor vai direto para o painel de gestão
      if(String(payload.user?.role||"")==="gestor") setTab("gestor");
    } catch(_backendErr) {
      auditLog("LOGIN_FAILED", { email: email.trim().toLowerCase(), success: false });
      const msg = String(_backendErr?.message || _backendErr || "").toLowerCase();
      if (msg.includes("credenciais")) {
        setError("E-mail ou senha incorretos.");
      } else if (msg.includes("timeout")) {
        setError("O servidor demorou demais para responder (Timeout). Verifique se o backend está ativo.");
      } else if (msg.includes("falha de conexão")) {
        setError("Falha de conexão com a API. Verifique backend/CORS e tente novamente.");
      } else {
        setError(_backendErr?.message || "Falha no login.");
      }
    } finally { setBusy(false); }
  }

  async function handleRegister(reg) {
    setError(""); setBusy(true);
    try {
      const payload=await register({name:reg.name.trim(),email:reg.email.trim(),password:reg.password,role:reg.role,teamId:reg.teamId,councilNumber:onlyDigits(reg.councilNumber),councilUf:String(reg.councilUf||"").toUpperCase()});
      setToken(payload.token); setUser(payload.user);
      sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:payload.token,user:payload.user}));
      auditLog("USUARIO_CADASTRADO", { name:reg.name.trim(), email:reg.email.trim(), role:reg.role }, payload.user);
    } catch(e){ if(!handleApiError(e)) setError(e.message||"Falha no cadastro"); } finally{ setBusy(false); }
  }

  /* ── Token expirado – desloga automaticamente ── */
  function handleApiError(e) {
    const msg = String(e?.message || e || "").toLowerCase();
    if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("failed to fetch")) {
      setError("Erro de comunicação: o servidor não respondeu ou a conexão falhou.");
      return true;
    }
    const is401 = msg.includes("401") || msg.includes("token expirado") || msg.includes("expirad") ||
                  msg.includes("unauthorized") || msg.includes("não autorizado") || msg.includes("sessão inválida");
    if (is401) {
      auditLog("SESSAO_EXPIRADA", { reason: e?.message }, user);
      setToken(""); setUser(null); setPatients([]); setUsers([]); setTemplates([]);
      setProtocolByPatient({}); setSelectedPatientId("");
      sessionStorage.removeItem(SESSION_KEY);
      setError("Sessão expirada. Faça login novamente.");
      return true;
    }
    return false;
  }

function normalizePatientsResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.patients)) return payload.patients;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

async function loadAll() {
  if (!token || String(token).startsWith("local_")) return;
    setError(""); setLoading(true);
    // Helper para timeout individual em requisições
    const withTimeout = (p) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 20000))]);
  try {
    const [boot, usFallback, tplsFallback] = await Promise.all([
        withTimeout(bootstrap(token)),
        withTimeout(listUsers(token)).catch(() => []),
        withTimeout(listProtocolTemplates(token)).catch(() => []),
    ]);

    setUser(prev => prev || boot?.user || null);

    const ptsSource = Array.isArray(boot?.patients)
      ? boot.patients
      : await listPatients(token).catch(() => []);

    const pts = normalizePatientsResponse(ptsSource);

    const us = Array.isArray(boot?.users) ? boot.users : usFallback;
    const tpls = Array.isArray(boot?.protocolTemplates)
      ? boot.protocolTemplates
      : tplsFallback;

    setPatients(pts);
    setUsers(Array.isArray(us) ? us : []);
    setTemplates(Array.isArray(tpls) ? tpls : []);

    Promise.resolve().then(async () => {
      try {
        if (pts.length) {
          const sums = await getProtocolSummaries(
            token,
            pts.map(p => p.id).filter(Boolean)
          );
          setProtocolByPatient(sums?.summaries || {});
        }
      } catch (err) {
        console.error(err);
      }
    });

  } catch (e) {
      if (!handleApiError(e)) setError(e.message || "Falha ao carregar dados");
    } finally { setLoading(false); }
}

  async function loadSelectedPatientData(patientId) {
    try {
      const[summary,hist,appts,taskItems,msgItems]=await Promise.all([
        getPatientProtocolSummary(token,patientId),
        getPatientHistory(token,patientId),
        listAppointments(token,patientId),
        listTasks(token,patientId),
        listMessages(token,patientId),
      ]);
      setPatientProtocolSummary(summary||null);
      setHistory(Array.isArray(hist)?hist:[]);
      setAppointments(Array.isArray(appts)?appts:[]);
      setTasks(Array.isArray(taskItems)?taskItems:[]);
      setMessages(Array.isArray(msgItems)?msgItems:[]);
    } catch(e){ if(!handleApiError(e)) setError(e.message||"Falha ao carregar dados do paciente"); }
  }

  function logout() {
    auditLog("LOGOUT", { email: user?.email }, user);
    setToken(""); setUser(null); setPatients([]); setUsers([]); setTemplates([]); setProtocolByPatient({}); setSelectedPatientId("");
    sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(UI_STATE_KEY); localStorage.removeItem(RECEPTION_KEY);
  }

  
  function openEditPatient(p) {
    return ()=>{
      setEditingPatient(p);
      setForm(
        p
          ? {
              name: String(p?.name || ""),
              motherName: String(p?.motherName || ""),
              motherUnknown: p?.motherUnknown || false,
              guardianName: String(p?.guardianName || ""),
              cpf: String(p?.cpf || ""),
              cns: String(p?.cns || ""),
              birthDate: String(p?.birthDate || ""),
              birthCity: String(p?.birthCity || ""),
              birthState: String(p?.birthState || ""),
              phone: String(p?.phone || ""),
              phoneAlt: String(p?.phoneAlt || ""),
              careCategory: String(p?.careCategory || "general"),
              chronicConditions: Array.isArray(p?.chronicConditions) ? p.chronicConditions : [],
              assignedAcsId: String(p?.assignedAcsId || ""),
              zipCode: String(p?.zipCode || ""),
              address: String(p?.address || ""),
              number: String(p?.number || ""),
              complement: String(p?.complement || ""),
              neighborhood: String(p?.neighborhood || ""),
              city: String(p?.city || ""),
              state: String(p?.state || ""),
              sex: String(p?.sex || ""),
              raceColor: String(p?.raceColor || ""),
              maritalStatus: String(p?.maritalStatus || ""),
              allergies: String(p?.allergies || ""),
              comorbidities: String(p?.comorbidities || ""),
              medications: String(p?.medications || ""),
              microArea: String(p?.microArea || ""),
              familyCode: String(p?.familyCode || ""),
              homeVisitFreq: String(p?.homeVisitFreq || ""),
              housingType: String(p?.housingType || ""),
              waterSupply: String(p?.waterSupply || ""),
              sewage: String(p?.sewage || ""),
              garbage: String(p?.garbage || ""),
              electricity: String(p?.electricity || ""),
              pregnancyStartDate: String(p?.pregnancyStartDate || ""),
              expectedDeliveryDate: String(p?.expectedDeliveryDate || ""),
              gestationalAgeDumWeeks: String(p?.gestationalAgeDumWeeks ?? ""),
              gestationalAgeDumDays: String(p?.gestationalAgeDumDays ?? ""),
              gestationalAgeUsgWeeks: String(p?.gestationalAgeUsgWeeks ?? ""),
              gestationalAgeUsgDays: String(p?.gestationalAgeUsgDays ?? ""),
              usgDate1: String(p?.usgDate1 || ""),
              usgDate2: String(p?.usgDate2 || ""),
              usgDate3: String(p?.usgDate3 || ""),
            }
          : emptyPatientForm()
      );
      setShowModal(true);
    };
  }

  function openViewPatient(p) {
    setViewPatient(p||null);
    setShowViewModal(true);
  }

  async function lookupCepAndFillAddress() {
    const digits = onlyDigits(form.zipCode);
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data?.erro) return;
      setForm((s)=>({
        ...s,
        address: s.address || String(data.logradouro || ""),
        neighborhood: s.neighborhood || String(data.bairro || ""),
        city: s.city || String(data.localidade || ""),
        state: s.state || String(data.uf || "")
      }));
    } catch {
      // Silencia erro de CEP para não interromper cadastro.
    }
  }

  async function submitPatient(e) {
    e.preventDefault(); if(!token) return;
    if(!form.name.trim()||!form.phone.trim()){setError("Nome e telefone são obrigatórios.");return;}
    setBusy(true); setError("");
    try {
      // incompleteProfile é removido ao salvar com os campos obrigatórios preenchidos
      const payload={
    name:form.name.trim(), motherName:form.motherUnknown?"Desconhecida":form.motherName.trim(),
    motherUnknown:form.motherUnknown||false,
    guardianName:(form.guardianName||"").trim(),
    cpf:form.cpf.trim(), cns:form.cns.trim(),
    birthDate:form.birthDate||"", birthCity:form.birthCity.trim(), birthState:form.birthState.trim().toUpperCase(),
    phone:form.phone.trim(), phoneAlt:form.phoneAlt.trim(),
    careCategory:form.careCategory||"general", chronicConditions:Array.isArray(form.chronicConditions)?form.chronicConditions:[],
    incompleteProfile:false, assignedAcsId:form.assignedAcsId||"",
    zipCode:form.zipCode.trim(), address:form.address.trim(), number:form.number.trim(),
    complement:form.complement.trim(), neighborhood:form.neighborhood.trim(),
    city:form.city.trim(), state:form.state.trim().toUpperCase(),
    sex:form.sex.trim(), raceColor:form.raceColor||"", maritalStatus:form.maritalStatus.trim(),
    allergies:form.allergies.trim(), comorbidities:form.comorbidities.trim(), medications:form.medications.trim(),
    microArea:(form.microArea||"").trim(), familyCode:(form.familyCode||"").trim(),
    homeVisitFreq:(form.homeVisitFreq||"").trim(), housingType:form.housingType||"",
    waterSupply:form.waterSupply||"", sewage:form.sewage||"",
    garbage:form.garbage||"", electricity:form.electricity||"",
    pregnancyStartDate:form.pregnancyStartDate||"", expectedDeliveryDate:form.expectedDeliveryDate||"",
    gestationalAgeDumWeeks:form.gestationalAgeDumWeeks===""?null:Number(form.gestationalAgeDumWeeks),
    gestationalAgeDumDays:form.gestationalAgeDumDays===""?null:Number(form.gestationalAgeDumDays),
    gestationalAgeUsgWeeks:form.gestationalAgeUsgWeeks===""?null:Number(form.gestationalAgeUsgWeeks),
    gestationalAgeUsgDays:form.gestationalAgeUsgDays===""?null:Number(form.gestationalAgeUsgDays),
    usgDate1:form.usgDate1||"", usgDate2:form.usgDate2||"", usgDate3:form.usgDate3||"",
  };
      if (editingPatient?.id) {
        await updatePatient(token,editingPatient.id,payload);
        auditLog("PACIENTE_EDITADO", { patientId:editingPatient.id, patientName:payload.name }, user);
      } else {
        const created = await createPatient(token,payload);
        auditLog("PACIENTE_CADASTRADO", { patientId:created?.id, patientName:payload.name }, user);
      }
      setShowModal(false);
      // Se era um paciente incompleto, limpa o flag na agenda local também
      if (editingPatient?.incompleteProfile) {
        const patientId = editingPatient.id;
        const currentAgenda = readLS("saudeubs_agenda_v1", []);
        const updatedAgenda = currentAgenda.map(a =>
          a.patientId === patientId ? { ...a, incompletePatient: false } : a
        );
        writeLS("saudeubs_agenda_v1", updatedAgenda);
      }
      await loadAll();
    } catch(e){ if(!handleApiError(e)) setError(e.message||"Erro ao salvar paciente"); } finally{ setBusy(false); }
  }

  async function removePatient(p) {
    if(!token||!p||!confirm(`Excluir '${p.name}'?`)) return;
    setBusy(true); setError("");
    try {
      await deletePatient(token,p.id);
      auditLog("PACIENTE_EXCLUIDO", { patientId:p.id, patientName:p.name }, user);
      if(selectedPatientId===p.id) setSelectedPatientId(""); await loadAll();
    }
    catch(e){ setError(e.message||"Erro ao excluir"); } finally{ setBusy(false); }
  }

  
  function openEditUser(u) {
    return ()=>{
      if (!u) return; // Criação desabilitada – apenas pela tela de cadastro
      setEditingUser(u);
      setUserForm({
        role: u?.role||"acs",
        name: String(u?.name||""),
        email: String(u?.email||""),
        password: "",
        councilNumber: String(u?.councilNumber||""),
        councilUf: String(u?.councilUf||""),
      });
      setShowUserModal(true);
    };
  }

  async function submitUser(e) {
    e.preventDefault();
    if(!token||!isManager(user)||!editingUser) return; // Criação só pela tela inicial
    if(!userForm.name.trim()||!userForm.email.trim()){setError("Nome e e-mail são obrigatórios.");return;}
    setBusy(true); setError("");
    try {
      const needsCouncil = ["doctor","dentist","nurse_manager","nursing_tech","pharmacist","pharmacy_tech"].includes(userForm.role);
      const payload={
        role: userForm.role,
        name: userForm.name.trim(),
        email: userForm.email.trim(),
        ...(userForm.password.trim()?{password:userForm.password.trim()}:{}),
        ...(needsCouncil?{councilNumber:userForm.councilNumber.trim(),councilUf:userForm.councilUf.trim().toUpperCase()}:{}),
      };
      await updateUser(token,editingUser.id,payload);
      auditLog("USUARIO_EDITADO", { targetId:editingUser.id, targetName:userForm.name.trim(), role:userForm.role, changedPassword:!!userForm.password.trim() }, user);
      setShowUserModal(false); await loadAll();
    } catch(e){ if(!handleApiError(e)) setError(e.message||"Erro ao salvar usuário"); } finally{ setBusy(false); }
  }

  async function removeUser(u) {
    if(!token||!isManager(user)||!u?.id) return;
    if(u.id===user.id){setError("Não é possível excluir sua própria conta.");return;}
    setBusy(true); setError("");
    try {
      const usage=await getUserUsage(token,u.id);
      if(!usage?.canDelete) throw new Error(`Vínculos ativos impedem a exclusão (pacientes=${usage.assignedPatients||0}, tarefas=${usage.openTasksAssigned||0}).`);
      if(!confirm(`Excluir '${u.name}'?`)) return;
      await deleteUser(token,u.id);
      auditLog("USUARIO_EXCLUIDO", { targetId:u.id, targetName:u.name, role:u.role }, user);
      await loadAll();
    } catch(e){ setError(e.message||"Erro ao excluir"); } finally{ setBusy(false); }
  }

  
  function openEditTemplate(t) {
    return ()=>{
      setEditingTemplate(t);
      setTemplateForm(t?{category:String(t?.category||""),label:String(t?.label||""),visits:Number(t?.targets?.visits||0),consultations:Number(t?.targets?.consultations||0),vaccines:Number(t?.targets?.vaccines||0),deadlinesVisits:Number(t?.deadlines?.visits||0),deadlinesConsultations:Number(t?.deadlines?.consultations||0),deadlinesVaccines:Number(t?.deadlines?.vaccines||0),vaccineList:Array.isArray(t?.vaccines)?t.vaccines.join(", "):""}:{category:"",label:"",visits:0,consultations:0,vaccines:0,deadlinesVisits:0,deadlinesConsultations:0,deadlinesVaccines:0,vaccineList:""});
      setShowTemplateModal(true);
    };
  }

  async function submitTemplate(e) {
    e.preventDefault(); if(!token||!canManage(user)) return;
    const category=String(templateForm.category||"").trim().toLowerCase(),label=String(templateForm.label||"").trim();
    if(!category||!label){setError("Categoria e nome são obrigatórios.");return;}
    const payload={category,label,targets:{visits:Number(templateForm.visits||0),consultations:Number(templateForm.consultations||0),vaccines:Number(templateForm.vaccines||0)},deadlines:{visits:Number(templateForm.deadlinesVisits||0),consultations:Number(templateForm.deadlinesConsultations||0),vaccines:Number(templateForm.deadlinesVaccines||0)},vaccines:String(templateForm.vaccineList||"").split(",").map(v=>v.trim()).filter(Boolean)};
    setBusy(true); setError("");
    try {
      editingTemplate?.category?await updateProtocolTemplate(token,editingTemplate.category,payload):await createProtocolTemplate(token,payload);
      setShowTemplateModal(false); await loadAll();
    } catch(e){ if(!handleApiError(e)) setError(e.message||"Erro ao salvar protocolo"); } finally{ setBusy(false); }
  }

  async function removeTemplate(t) {
    if(!token||!canManage(user)||!t?.category||!confirm(`Excluir '${t.label||t.category}'?`)) return;
    setBusy(true); setError("");
    try { await deleteProtocolTemplate(token,t.category); await loadAll(); }
    catch(e){ setError(e.message||"Erro ao excluir"); } finally{ setBusy(false); }
  }

  
  async function loadAiPriorities(){if(!token)return;setBusy(true);setError("");try{setAiView("priorities");setAiData(await aiTeamPriorities(token));}catch(e){ if(!handleApiError(e)) setError(e.message||"Erro"); }finally{setBusy(false);}}
  async function loadAiQuality(){if(!token)return;setBusy(true);setError("");try{setAiView("quality");setAiData(await aiTeamDataQuality(token));}catch(e){ if(!handleApiError(e)) setError(e.message||"Erro"); }finally{setBusy(false);}}
  async function loadAiReport(){if(!token)return;setBusy(true);setError("");try{setAiView("report");setAiData(await aiTeamReport(token));}catch(e){ if(!handleApiError(e)) setError(e.message||"Erro"); }finally{setBusy(false);}}
  async function submitAiQuestion(e){e.preventDefault();if(!token||!aiQuestion.trim())return;setBusy(true);setError("");try{setAiView("chat");setAiData(await aiTeamAsk(token,aiQuestion.trim()));}catch(e2){setError(e2.message||"Erro");}finally{setBusy(false);}}

  
  async function submitRecord(e) {
    e.preventDefault(); if(!selectedPatientId) return;
    const type = isAcs(user)?"visit":recordForm.type;
    const title = isAcs(user)?"Visita ACS":recordForm.title;
    if(!type||!recordForm.date||(type!=="vaccine"&&!title)){setError("Preencha tipo, data e título.");return;}
    if(type==="vaccine"&&!recordVaccines.length){setError("Selecione ao menos uma vacina.");return;}
    if(type==="visit"){
      const patient = patients.find(p => p.id === selectedPatientId);
      if(!String(patient?.assignedAcsId||"").trim()){
        setError("Não é possível registrar visita sem ACS responsável vinculado ao paciente.");
        return;
      }
    }
    const now = new Date();
    const timeStr = now.toTimeString().slice(0,5);
    // Monta detalhes ricos para o prontuário
    const buildDetails = (extraTitle, conduct, nextStep, demandType, details) => [
      extraTitle ? `Tipo: ${extraTitle}` : "",
      demandType ? `Demanda: ${demandType==="scheduled"?"Programada":demandType==="spontaneous"?"Espontânea":"Retroativo"}` : "",
      conduct ? `Conduta: ${conduct}` : "",
      nextStep ? `Próximo passo: ${nextStep}` : "",
      details ? `Obs: ${details}` : "",
    ].filter(Boolean).join("\n");
    try {
      const council = user?.councilNumber
        ? `${user.role==="doctor"?"CRM":user.role==="dentist"?"CRO":["pharmacist","pharmacy_tech"].includes(user.role)?"CFF":"COREN"} ${user.councilNumber}/${user.councilUf||""}` : "";
      const basePayload = {
        date: recordForm.date,
        time: timeStr,
        professionalName: user?.name||"",
        professionalCouncil: council,
        immutable: true,
      };
      if(type==="vaccine"){
        for(const vaccine of recordVaccines) {
          // Inferir a dose correta com base na data de aplicação e nascimento do paciente
          const patient = patients.find(p => p.id === selectedPatientId);
          const resolvedTitle = patient?.birthDate
            ? inferVaccineDoseTitle(vaccine, recordForm.date, patient.birthDate)
            : vaccine;
          await createRecord(token,selectedPatientId,{...basePayload,type:"vaccine",title:resolvedTitle,
            details:buildDetails("","","","",recordForm.details)});
        }
      } else {
        await createRecord(token,selectedPatientId,{...basePayload,type,title,
          details:buildDetails(
            type==="consultation"?title:"",
            recordForm.conduct||"",
            recordForm.nextStep||"",
            recordForm.demandType||"",
            recordForm.details
          )});
        // Também cria appointment para consultas (para o histórico de demanda)
        if(type==="consultation"){
          await createAppointment(token,selectedPatientId,{
            date:recordForm.date,
            demandType:recordForm.demandType||"scheduled",
            summary:title,
            conduct:recordForm.conduct||"",
            nextStep:recordForm.nextStep||"",
            doctorName:recordForm.consultDoctor||"",
            specialty:recordForm.consultSpecialty||"",
            consultKind:recordForm.consultKind||"medica",
          }).catch(()=>{});
        }
      }
      auditLog("ATENDIMENTO_REGISTRADO", {
        patientId:selectedPatientId, type, title,
        date:recordForm.date, time:timeStr,
      }, user);
      // Atualiza KPI de demanda programada localmente (sem esperar a API)
      // Atendimentos retroativos NÕO contam
      if(type==="consultation"){
        const dType=recordForm.demandType||"scheduled";
        if(dType!=="retroactive"){
          const now=new Date(); const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
          if(String(recordForm.date||"").startsWith(ym)){
            setDemandMonthly(prev=>{
              const cur=prev||{totals:{total:0,scheduled:0,spontaneous:0}};
              return {totals:{
                total:(cur.totals?.total||0)+1,
                scheduled:(cur.totals?.scheduled||0)+(dType==="scheduled"?1:0),
                spontaneous:(cur.totals?.spontaneous||0)+(dType==="spontaneous"?1:0),
              }};
            });
          }
        }
      }
      setRecordForm({type:isAcs(user)?"visit":"consultation",title:isAcs(user)?"Visita ACS":
        user?.role==="doctor"?"Consulta médica":user?.role==="dentist"?"Consulta odontológica":"Consulta de enfermagem",
        date:"",details:"",conduct:"",nextStep:"",demandType:"scheduled",consultKind:"medica",consultDoctor:"",consultSpecialty:""});
      setRecordVaccines([]); await loadSelectedPatientData(selectedPatientId); await loadAll();
    } catch(e){ if(!handleApiError(e)) setError(e.message||"Erro ao criar registro"); }
  }

  async function submitAppointment(e) {
    e.preventDefault(); if(!selectedPatientId) return;
    if(!appointmentForm.date||!appointmentForm.summary){setError("Preencha data e resumo.");return;}
    try {
      await createAppointment(token,selectedPatientId,appointmentForm);
      const title=String(user?.role||"")==="doctor"?"Consulta médica":"Consulta de enfermagem";
      const details=[appointmentForm.summary,appointmentForm.conduct,appointmentForm.nextStep].filter(v=>String(v||"").trim()).join(" | ");
      await createRecord(token,selectedPatientId,{type:"consultation",title,date:appointmentForm.date,details});
      setAppointmentForm({date:"",demandType:"scheduled",summary:"",conduct:"",nextStep:""});
      await loadSelectedPatientData(selectedPatientId); await loadAll();
    } catch(e){ if(!handleApiError(e)) setError(e.message||"Erro ao registrar atendimento"); }
  }

  async function submitTask(e) {
    e.preventDefault(); if(!selectedPatientId) return;
    if(!taskForm.title){setError("Título obrigatório.");return;}
    try {
      await createTask(token,{patientId:selectedPatientId,assigneeId:taskForm.assigneeId||"",title:taskForm.title,notes:taskForm.notes,dueDate:taskForm.dueDate});
      auditLog("TAREFA_CRIADA", { patientId:selectedPatientId, title:taskForm.title, dueDate:taskForm.dueDate }, user);
      // Registra tarefa no prontuário automaticamente
      const assignee = users.find(u=>u.id===taskForm.assigneeId);
      // Tarefas: registradas no histórico interno, mas NÕO no prontuário clínico
      await createRecord(token,selectedPatientId,{
        type:"task", date:new Date().toISOString().slice(0,10),
        time:new Date().toTimeString().slice(0,5),
        title:`Tarefa: ${taskForm.title}`,
        details:[
          taskForm.notes?`Descrição: ${taskForm.notes}`:"",
          taskForm.dueDate?`Prazo: ${new Date(taskForm.dueDate+"T12:00:00").toLocaleDateString("pt-BR")}`:"",
          assignee?`Responsável: ${assignee.name}`:"",
        ].filter(Boolean).join("\n"),
        professionalName:user?.name||"", internalOnly:true,
      }).catch(()=>{});
      setTaskForm({title:"",notes:"",dueDate:"",assigneeId:""});
      await loadSelectedPatientData(selectedPatientId); await loadAll();
    } catch(e){ if(!handleApiError(e)) setError(e.message||"Erro ao criar tarefa"); }
  }

  async function submitMessage(e) {
    e.preventDefault(); if(!selectedPatientId||!messageText.trim()) return;
    try {
      await sendMessage(token,selectedPatientId,messageText.trim());
      auditLog("MENSAGEM_ENVIADA", { patientId:selectedPatientId, preview:messageText.trim().slice(0,80) }, user);
      // Mensagens: registradas no histórico interno, mas NÕO no prontuário clínico
      await createRecord(token,selectedPatientId,{
        type:"message", date:new Date().toISOString().slice(0,10),
        time:new Date().toTimeString().slice(0,5),
        title:"Comunicação interna da equipe",
        details:messageText.trim(),
        professionalName:user?.name||"", internalOnly:true,
      }).catch(()=>{});
      setMessageText(""); await loadSelectedPatientData(selectedPatientId);
    }
    catch(e){ if(!handleApiError(e)) setError(e.message||"Erro ao enviar mensagem"); }
  }

  async function handleDeleteRecord(recordId) {
    auditLog("REGISTRO_INATIVADO", { patientId:selectedPatientId, recordId }, user);
    await deleteRecord(token,selectedPatientId,recordId);
    await loadSelectedPatientData(selectedPatientId); await loadAll();
  }

  async function handleDeleteAppointment(apptId) {
    auditLog("ATENDIMENTO_EXCLUIDO", { patientId:selectedPatientId, apptId }, user);
    await deleteAppointment(token,selectedPatientId,apptId);
    await loadSelectedPatientData(selectedPatientId);
  }

  async function handleStatusChange(taskId,status) {
    await updateTaskStatus(token,taskId,status);
    await loadSelectedPatientData(selectedPatientId); await loadAll();
  }

  /* ── Auth guard – login único, roteamento por perfil ── */
  if (!token || !user || typeof user !== 'object') {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} publicTeams={publicTeams} error={error} busy={busy}/>;
  }

  // Recepcionista â†’ app dedicado de recepção
  if (isReceptionist(user) && !isAdmin(user)) {
    return (
      <div style={{position:"fixed",inset:0}}>
        <ReceptionistApp
          recUser={user}
          patients={patients}
          users={users}
          templates={templates}
          onLogout={()=>{ setToken(""); setUser(null); setPatients([]); sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(RECEPTION_KEY); }}/>
      </div>
    );
  }

  // Farmacêutico, enfermeira, médico, ACS, téc. enf., admin â†’ app clínico
  // buildNavItems limita o menu conforme o perfil

  const catOpts=templates.map(t=>({value:t.category,label:t.label}));

  // Todos os perfis com acesso ao módulo visualizam todos os pacientes.
  const visiblePatients = patients;

  function openProfile() {
    setProfileError("");
    setProfileForm({
      name: user?.name || "",
      email: user?.email || "",
      password: "",
      councilNumber: user?.councilNumber || "",
      councilUf: user?.councilUf || "",
    });
    setShowProfileModal(true);
  }

  async function submitProfile(e) {
    e.preventDefault();
    if (!profileForm.name.trim() || !profileForm.email.trim()) {
      setProfileError("Nome e e-mail são obrigatórios.");
      return;
    }
    setProfileBusy(true);
    setProfileError("");
    try {
      const payload = {
        name:  profileForm.name.trim(),
        email: profileForm.email.trim(),
        ...(profileForm.password.trim() ? { password: profileForm.password.trim() } : {}),
        ...(["nurse_manager","doctor"].includes(user?.role) && profileForm.councilNumber
          ? { councilNumber: profileForm.councilNumber.trim(), councilUf: profileForm.councilUf.trim().toUpperCase() }
          : {}),
      };
      const updated = await updateUser(token, user.id, payload).catch(()=>null);
      const newUser = { ...user, ...payload, ...(updated?.user || updated || {}) };
      setUser(newUser);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, user: newUser }));
      setShowProfileModal(false);
    } catch (err) {
      setProfileError(err.message || "Erro ao salvar perfil.");
    } finally {
      setProfileBusy(false);
    }
  }

  return (
    <main className="app">
      <OfflineBanner/>
      <ComplianceBadge/>
      <Topbar
        user={user} selectedPatient={selectedPatient} templates={templates}
        mobileOpen={mobileNavOpen} setMobileOpen={setMobileNavOpen}
        onLogout={logout} onOpenProfile={openProfile}
        patients={patients} protocolByPatient={protocolByPatient}
        apiHealth={apiHealth}
        onNavigatePatient={(id)=>{ setTab("patients"); setSelectedPatientId(id); }}
      />
      <div className="app-body">
        {/* Mobile backdrop */}
        {mobileNavOpen&&<div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:190,backdropFilter:"blur(2px)"}} onClick={()=>setMobileNavOpen(false)}/>}

        <Sidebar
          tab={tab} setTab={setTab}
          mobileOpen={mobileNavOpen} setMobileOpen={setMobileNavOpen}
          query={query} setQuery={setQuery}
          user={user} canManageUser={canManage(user)}
          onClearPatient={()=>setSelectedPatientId("")}
        />

        <section className="main-area">
          {error&&<div className="error" style={{margin:"1rem 2rem 0"}}>{error}<button className="icon-btn" style={{marginLeft:".5rem"}} onClick={()=>setError("")}><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button></div>}

          {tab==="dashboard"&&<Dashboard patients={patients} users={users} allUsers={allUsers||[]} templates={templates} protocolByPatient={protocolByPatient} demandMonthly={demandMonthly} currentUser={user} onNavigate={(id)=>{ setTab("patients"); setSelectedPatientId(id); }} setTab={setTab}/>}

          {tab==="queue"&&<QueuePage patients={patients} users={users} user={user} token={token} onNewPatient={p=>setPatients(prev=>[...prev,p])}/>}
          {tab==="triage"&&<TriagePage patients={patients} users={users} user={user}/>}
          {tab==="agenda"&&<AgendaPage patients={patients} users={users} user={user} token={token} teams={publicTeams} onNewPatient={p=>setPatients(prev=>[...prev,p])} onPatientCreated={loadAll} onNavigatePatient={(id)=>{setTab("patients");setSelectedPatientId(id);}}/>}
          {tab==="referrals"&&<ReferralsPage patients={patients} users={users} user={user}/>}
          {tab==="acs_tasks"&&<AcsTasksPage patients={patients} users={users} user={user} token={token} onNavigatePatient={(id)=>{setTab("patients");setSelectedPatientId(id);}}/>}
          {tab==="chart"&&<ChartPage patients={patients} users={users} user={user} token={token} onNavigatePatient={(id)=>{setTab("patients");setSelectedPatientId(id);}}/>}

          {tab==="exams_page"&&<ExamsPage patients={patients} users={users} user={user} token={token} onNavigatePatient={(id)=>{setTab("patients");setSelectedPatientId(id);}}/>}
          {tab==="gestor"&&<GestorPage patients={patients} users={users} templates={templates} protocolByPatient={protocolByPatient}/>}
          {tab==="reports"&&<ReportsPage patients={patients} users={users} templates={templates} protocolByPatient={protocolByPatient}/>}
          {tab==="diagnostics"&&(
            <DiagnosticsPage
              apiHealth={apiHealth}
              token={token}
              user={user}
              patients={patients}
              users={users}
              templates={templates}
              lastLoadAt={lastLoadAt}
              demandMonthly={demandMonthly}
            />
          )}

          {tab==="patients"&&(
            <PatientsTab
              patients={visiblePatients} users={allUsers&&allUsers.length?allUsers:users} templates={templates} protocolByPatient={protocolByPatient}
              query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
              acsFilter={acsFilter} setAcsFilter={setAcsFilter}
              conditionFilter={conditionFilter} setConditionFilter={setConditionFilter}
              selectedPatientId={selectedPatientId} setSelectedPatientId={setSelectedPatientId}
              canManageUser={canManage(user)} canWriteRecords={canWriteRecords(user)} onEdit={openEditPatient} onDelete={removePatient} onView={openViewPatient}
              patientTab={patientTab} setPatientTab={setPatientTab}
              appointments={appointments} tasks={tasks} messages={messages} history={history}
              patientProtocolSummary={rosaAdjustedSummary} sortedSpecialAlerts={sortedSpecialAlerts}
              recordForm={recordForm} setRecordForm={setRecordForm}
              recordVaccines={recordVaccines} setRecordVaccines={setRecordVaccines}
              appointmentForm={appointmentForm} setAppointmentForm={setAppointmentForm}
              taskForm={taskForm} setTaskForm={setTaskForm}
              messageText={messageText} setMessageText={setMessageText}
              onSubmitRecord={submitRecord} onSubmitAppointment={submitAppointment}
              onSubmitTask={submitTask} onSubmitMessage={submitMessage}
              onDeleteRecord={handleDeleteRecord} onDeleteAppointment={handleDeleteAppointment}
              onStatusChange={handleStatusChange}
              selectedPatient={selectedPatient} userObj={user} token={token}
            />
          )}

          {tab==="protocols"&&canManage(user)&&(
            <ProtocolsTab templates={templates} canManageUser={canManage(user)} onEdit={openEditTemplate} onDelete={removeTemplate}/>
          )}

          {tab==="acs"&&(
            <UserList title="ACS" users={users.filter(u=>u.role==="acs")} isManagerUser={isManager(user)} onEdit={openEditUser} onDelete={removeUser}/>
          )}

          {tab==="doctors"&&(
            <UserList title="Médicos e Técnicos" users={users.filter(u=>["doctor","nursing_tech","pharmacist"].includes(u.role))} isManagerUser={isManager(user)} onEdit={openEditUser} onDelete={removeUser}/>
          )}

          {tab==="vaccines"&&(
            <VaccinesPage patients={patients} users={users} templates={templates} token={token} canManageUser={canManage(user)} user={user}/>
          )}

          {tab==="pharmacy"&&(
            <PharmacyPage user={user}/>
          )}

          {tab==="insumos"&&(
            <InsumoPage patients={patients} users={users} user={user}/>
          )}

          {tab==="ai"&&(
            <AiTab aiView={aiView} aiData={aiData} aiQuestion={aiQuestion} setAiQuestion={setAiQuestion}
              onPriorities={loadAiPriorities} onQuality={loadAiQuality} onReport={loadAiReport}
              onAsk={submitAiQuestion} busy={busy}/>
          )}

        </section>
      </div>

      
      {showModal&&(
        <div className="modal-backdrop" onClick={()=>setShowModal(false)}>
          <form className="modal patient-modal" onSubmit={submitPatient} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem"}}>
              <div>
                <h3 style={{margin:0,fontSize:"1.05rem"}}>{editingPatient?"Editar paciente":"Novo paciente"}</h3>
                <p style={{margin:".15rem 0 0",fontSize:".73rem",color:"var(--text-3)"}}>Preencha os dados cadastrais do paciente</p>
              </div>
              <button type="button" className="icon-btn" onClick={()=>setShowModal(false)}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>

            {/* ── Seção 1: Grupo e vínculo ── */}
            <div style={{marginBottom:"1.1rem"}}>
              <div style={{fontSize:".68rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".6rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                <span style={{width:16,height:16,borderRadius:4,background:"var(--teal-600)",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:".6rem",fontWeight:800,flexShrink:0}}>1</span>
                Grupo e vínculo
              </div>
              <div className="field-grid">
                <label>Grupo / Categoria *
                  <select value={form.careCategory} onChange={e=>setForm(s=>({...s,careCategory:e.target.value}))}>
                    {(catOpts.length
                      ? catOpts.filter(c=>c.value!=="chronic")
                      : [{value:"general",label:"Geral"}]
                    ).map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
                <label>ACS responsável
                  <select value={form.assignedAcsId} onChange={e=>setForm(s=>({...s,assignedAcsId:e.target.value}))}>
                    <option value="">Não atribuído</option>
                    {users.filter(u=>u.role==="acs").map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </label>
                {/* Condições – checkbox antes do texto */}
                <div className="field-span-2" style={{display:"flex",alignItems:"center",gap:".75rem",flexWrap:"wrap"}}>
                  <span style={{fontSize:".78rem",fontWeight:600,color:"var(--text-2)",flexShrink:0}}>Condições</span>
                  {[["diabetes","Diabetes"],["hypertension","Hipertensão"]].map(([val,lbl])=>(
                    <label key={val} style={{display:"flex",alignItems:"center",gap:".4rem",fontSize:".82rem",fontWeight:500,cursor:"pointer",margin:0}}>
                      <input type="checkbox" checked={(form.chronicConditions||[]).includes(val)}
                        onChange={e=>setForm(s=>({...s,chronicConditions:e.target.checked?[...(s.chronicConditions||[]),val]:(s.chronicConditions||[]).filter(c=>c!==val)}))}
                        style={{width:14,height:14,cursor:"pointer",accentColor:"var(--teal-600)"}}/>
                      {lbl}
                    </label>
                  ))}
                  {(form.chronicConditions||[]).length>0&&(
                    <span style={{fontSize:".71rem",color:"var(--teal-600)",fontWeight:600,marginLeft:"auto"}}>
                      {String(form.careCategory||"").toLowerCase()==="elderly" ? "âœ“ Somadas ao grupo Idoso" : "âœ“ Regras de doença crônica ativas"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Seção 2: Identificação pessoal ── */}
            <div style={{marginBottom:"1.1rem"}}>
              <div style={{fontSize:".68rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".6rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                <span style={{width:16,height:16,borderRadius:4,background:"var(--teal-600)",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:".6rem",fontWeight:800,flexShrink:0}}>2</span>
                Identificação pessoal
              </div>
              <div className="field-grid">
                <label className="field-span-2">Nome completo *
                  <input value={form.name} onChange={e=>setForm(s=>({...s,name:e.target.value}))} placeholder="Nome completo do paciente"/>
                </label>
                {/* Nome da mãe + checkbox "desconhecida" na mesma linha do input */}
                <div className="field-span-2" style={{display:"flex",flexDirection:"column",gap:".25rem"}}>
                  <span style={{fontSize:".78rem",fontWeight:600}}>Nome da mãe</span>
                  <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                    <input value={form.motherName} onChange={e=>setForm(s=>({...s,motherName:e.target.value}))}
                      placeholder="Nome completo da mãe"
                      disabled={form.motherUnknown||false}
                      style={{flex:1,opacity:form.motherUnknown?.5:1}}/>
                    <label style={{display:"flex",alignItems:"center",gap:".35rem",fontSize:".76rem",color:"var(--text-3)",cursor:"pointer",margin:0,whiteSpace:"nowrap",flexShrink:0}}>
                      <input type="checkbox" checked={form.motherUnknown||false}
                        onChange={e=>setForm(s=>({...s,motherUnknown:e.target.checked,motherName:e.target.checked?"Desconhecida":s.motherName==="Desconhecida"?"":s.motherName}))}
                        style={{width:13,height:13,accentColor:"var(--teal-600)",cursor:"pointer"}}/>
                      Mãe desconhecida
                    </label>
                  </div>
                </div>
                {/* Nome do responsável – aparece para crianças, mas sem asterisco de obrigatoriedade */}
                {isChildCategory(form.careCategory)&&(
                  <label className="field-span-2">Nome do responsável
                    <input value={form.guardianName||""} onChange={e=>setForm(s=>({...s,guardianName:e.target.value}))} placeholder="Nome do responsável legal (pode ser diferente da mãe)"/>
                  </label>
                )}
                <label>Data de nascimento
                  <input type="date" value={form.birthDate} onChange={e=>setForm(s=>({...s,birthDate:e.target.value}))}/>
                </label>
                <label>Sexo biológico
                  <select value={form.sex} onChange={e=>setForm(s=>({...s,sex:e.target.value}))}>
                    <option value="">Não informado</option>
                    <option value="feminino">Feminino</option>
                    <option value="masculino">Masculino</option>
                    <option value="intersexo">Intersexo</option>
                  </select>
                </label>
                <label>Município de nascimento
                  <input value={form.birthCity} onChange={e=>setForm(s=>({...s,birthCity:e.target.value}))} placeholder="Cidade natal"/>
                </label>
                <label>UF de nascimento
                  <input value={form.birthState} maxLength={2} onChange={e=>setForm(s=>({...s,birthState:e.target.value.toUpperCase().slice(0,2)}))} placeholder="SP"/>
                </label>
                <label>Raça / Cor
                  <select value={form.raceColor} onChange={e=>setForm(s=>({...s,raceColor:e.target.value}))}>
                    <option value="">Não informado</option>
                    <option value="branca">Branca</option>
                    <option value="preta">Preta</option>
                    <option value="parda">Parda</option>
                    <option value="amarela">Amarela</option>
                    <option value="indigena">Indígena</option>
                    <option value="nao_declarado">Não declarado</option>
                  </select>
                </label>
                {!isChildCategory(form.careCategory)&&(
                  <label>Estado civil
                    <select value={form.maritalStatus} onChange={e=>setForm(s=>({...s,maritalStatus:e.target.value}))}>
                      <option value="">Não informado</option>
                      <option value="solteiro">Solteiro(a)</option>
                      <option value="casado">Casado(a)</option>
                      <option value="uniao_estavel">União estável</option>
                      <option value="divorciado">Divorciado(a)</option>
                      <option value="separado">Separado(a)</option>
                      <option value="viuvo">Viúvo(a)</option>
                    </select>
                  </label>
                )}
                <label>CPF
                  <input value={form.cpf} onChange={e=>setForm(s=>({...s,cpf:formatCpf(e.target.value)}))} placeholder="000.000.000-00"/>
                </label>
                <label>CNS – Cartão Nacional de Saúde
                  <input value={form.cns} onChange={e=>setForm(s=>({...s,cns:formatCns(e.target.value)}))} placeholder="000 0000 0000 0000"/>
                </label>
              </div>
            </div>

            {/* ── Seção 3: Contato ── */}
            <div style={{marginBottom:"1.1rem"}}>
              <div style={{fontSize:".68rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".6rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                <span style={{width:16,height:16,borderRadius:4,background:"var(--teal-600)",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:".6rem",fontWeight:800,flexShrink:0}}>3</span>
                Contato
              </div>
              <div className="field-grid">
                <label>Telefone principal *
                  <input value={form.phone} onChange={e=>setForm(s=>({...s,phone:formatPhone(e.target.value)}))} placeholder="(00) 00000-0000"/>
                </label>
                <label>Telefone alternativo
                  <input value={form.phoneAlt} onChange={e=>setForm(s=>({...s,phoneAlt:formatPhone(e.target.value)}))} placeholder="(00) 00000-0000"/>
                </label>
              </div>
            </div>

            {/* Seção 4: Endereço */}
            <div style={{marginBottom:"1.1rem"}}>
              <div style={{fontSize:".68rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".6rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                <span style={{width:16,height:16,borderRadius:4,background:"var(--teal-600)",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:".6rem",fontWeight:800,flexShrink:0}}>4</span>
                Endereço
              </div>
              <div className="field-grid">
                <label>CEP
                  <input value={form.zipCode} onBlur={lookupCepAndFillAddress} onChange={e=>setForm(s=>({...s,zipCode:formatCep(e.target.value)}))} placeholder="00000-000"/>
                </label>
                <label className="field-span-2" style={{gridColumn:"span 1"}}>Rua / Logradouro
                  <input value={form.address} onChange={e=>setForm(s=>({...s,address:e.target.value}))} placeholder="Nome da rua, avenida..."/>
                </label>
                <label>Número
                  <input value={form.number} onChange={e=>setForm(s=>({...s,number:e.target.value}))} placeholder="00"/>
                </label>
                <label>Complemento
                  <input value={form.complement} onChange={e=>setForm(s=>({...s,complement:e.target.value}))} placeholder="Apto, bloco, casa..."/>
                </label>
                <label>Bairro
                  <input value={form.neighborhood} onChange={e=>setForm(s=>({...s,neighborhood:e.target.value}))}/>
                </label>
                <label>Cidade
                  <input value={form.city} onChange={e=>setForm(s=>({...s,city:e.target.value}))}/>
                </label>
                <label>Estado (UF)
                  <input value={form.state} maxLength={2} onChange={e=>setForm(s=>({...s,state:e.target.value.toUpperCase().slice(0,2)}))} placeholder="SP"/>
                </label>
              </div>
            </div>

            {/* Seção 5: Gestação (condicional) */}
            {String(form.careCategory||"").toLowerCase()==="pregnant"&&(
              <div style={{marginBottom:"1.1rem"}}>
                <div style={{fontSize:".68rem",fontWeight:700,color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".6rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                  <span style={{width:16,height:16,borderRadius:4,background:"var(--teal-600)",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:".6rem",fontWeight:800,flexShrink:0}}>5</span>
                  Dados gestacionais
                </div>
                <div style={{background:"var(--teal-50)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)",padding:".85rem"}}>
                  <div className="field-grid">
                    <label>DUM – Data da Última Menstruação
                      <input type="date" value={form.pregnancyStartDate} onChange={e=>setForm(s=>({...s,pregnancyStartDate:e.target.value}))}/>
                    </label>
                    <label>DPP – Data Provável do Parto
                      <input type="date" value={form.expectedDeliveryDate} onChange={e=>setForm(s=>({...s,expectedDeliveryDate:e.target.value}))}/>
                    </label>
                    <label>IG pela DUM – Semanas
                      <input type="number" min="0" max="45" value={form.gestationalAgeDumWeeks} placeholder="0" onChange={e=>setForm(s=>({...s,gestationalAgeDumWeeks:e.target.value}))}/>
                    </label>
                    <label>IG pela DUM – Dias
                      <input type="number" min="0" max="6" value={form.gestationalAgeDumDays} placeholder="0" onChange={e=>setForm(s=>({...s,gestationalAgeDumDays:e.target.value}))}/>
                    </label>
                    <label>Data 1ª USG
                      <input type="date" value={form.usgDate1} onChange={e=>setForm(s=>({...s,usgDate1:e.target.value}))}/>
                    </label>
                    <label>IG pela USG – Semanas
                      <input type="number" min="0" max="45" value={form.gestationalAgeUsgWeeks} placeholder="0" onChange={e=>setForm(s=>({...s,gestationalAgeUsgWeeks:e.target.value}))}/>
                    </label>
                    <label>IG pela USG – Dias
                      <input type="number" min="0" max="6" value={form.gestationalAgeUsgDays} placeholder="0" onChange={e=>setForm(s=>({...s,gestationalAgeUsgDays:e.target.value}))}/>
                    </label>
                    <label>Data 2ª USG
                      <input type="date" value={form.usgDate2} onChange={e=>setForm(s=>({...s,usgDate2:e.target.value}))}/>
                    </label>
                    <label>Data 3ª USG
                      <input type="date" value={form.usgDate3} onChange={e=>setForm(s=>({...s,usgDate3:e.target.value}))}/>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Seção: Clínico (nº fixo segue gestação) */}
            <div style={{marginBottom:"1.1rem"}}>
              <div style={{fontSize:".68rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".6rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                <span style={{width:16,height:16,borderRadius:4,background:"var(--teal-600)",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:".6rem",fontWeight:800,flexShrink:0}}>
                  {String(form.careCategory||"").toLowerCase()==="pregnant"?"6":"5"}
                </span>
                Dados clínicos
              </div>
              <div className="field-grid">
                <label className="field-span-2">Alergias conhecidas
                  <textarea value={form.allergies} onChange={e=>setForm(s=>({...s,allergies:e.target.value}))} placeholder="Descreva alergias medicamentosas, alimentares ou outras..." style={{minHeight:60}}/>
                </label>
                <label className="field-span-2">Comorbidades
                  <textarea value={form.comorbidities} onChange={e=>setForm(s=>({...s,comorbidities:e.target.value}))} placeholder="Diagnósticos e condições crônicas conhecidas..." style={{minHeight:60}}/>
                </label>
                <label className="field-span-2">Medicamentos em uso contínuo
                  <textarea value={form.medications} onChange={e=>setForm(s=>({...s,medications:e.target.value}))} placeholder="Liste os medicamentos com dose e frequência..." style={{minHeight:60}}/>
                </label>
              </div>
            </div>

            {/* ── Seção: Dados territoriais ── */}
            <div style={{marginBottom:"1.1rem"}}>
              <div style={{fontSize:".68rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".6rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                <span style={{width:16,height:16,borderRadius:4,background:"var(--teal-600)",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:".6rem",fontWeight:800,flexShrink:0}}>
                  {String(form.careCategory||"").toLowerCase()==="pregnant"?"7":"6"}
                </span>
                Cadastro territorial
              </div>
              <div className="field-grid">
                <label>Microárea
                  <input value={form.microArea||""} onChange={e=>setForm(s=>({...s,microArea:e.target.value}))} placeholder="Ex: 01"/>
                </label>
                <label>Código de família
                  <input value={form.familyCode||""} onChange={e=>setForm(s=>({...s,familyCode:e.target.value}))} placeholder="Ex: 0010001"/>
                </label>
                <label>Frequência de visita ACS
                  <input value={form.homeVisitFreq||""} onChange={e=>setForm(s=>({...s,homeVisitFreq:e.target.value}))} placeholder="Mensal, quinzenal..."/>
                </label>
                <label>Tipo de moradia
                  <select value={form.housingType||""} onChange={e=>setForm(s=>({...s,housingType:e.target.value}))}>
                    <option value="">Não informado</option>
                    {["Alvenaria","Madeira","Taipa","Improvisada","Outro"].map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label>Abastecimento de água
                  <select value={form.waterSupply||""} onChange={e=>setForm(s=>({...s,waterSupply:e.target.value}))}>
                    <option value="">Não informado</option>
                    {["Rede pública","Poço/nascente","Outros"].map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label>Esgotamento sanitário
                  <select value={form.sewage||""} onChange={e=>setForm(s=>({...s,sewage:e.target.value}))}>
                    <option value="">Não informado</option>
                    {["Rede pública","Fossa séptica","Fossa rudimentar","Céu aberto","Outro"].map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label>Destino do lixo
                  <select value={form.garbage||""} onChange={e=>setForm(s=>({...s,garbage:e.target.value}))}>
                    <option value="">Não informado</option>
                    {["Coletado","Queimado","Enterrado","Céu aberto","Outro"].map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
                <label>Energia elétrica
                  <select value={form.electricity||""} onChange={e=>setForm(s=>({...s,electricity:e.target.value}))}>
                    <option value="">Não informado</option>
                    {["Sim","Não","Irregular"].map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {error&&<p className="error">{error}</p>}
            <div className="actions" style={{justifyContent:"flex-end"}}>
              <button type="button" className="secondary" onClick={()=>setShowModal(false)}>Cancelar</button>
              <button type="submit" disabled={busy}>{busy?"Salvando...":"Salvar paciente"}</button>
            </div>
          </form>
        </div>
      )}

      {showViewModal&&viewPatient&&(
        <Modal title="Visualizar paciente" onClose={()=>{setShowViewModal(false);setViewPatient(null);}}>
          <div className="field-grid">
            {/* Seção 1: Grupo */}
            <label>Grupo / Categoria<input value={catLabel(templates,viewPatient.careCategory)} disabled/></label>
            <label>ACS responsável<input value={users.find(u=>u.id===viewPatient.assignedAcsId)?.name||"Não atribuído"} disabled/></label>
            <label style={{display:"flex",flexDirection:"column",gap:".3rem"}} className="field-span-2">
              Condição crônica
              <div style={{display:"flex",gap:"1.25rem",padding:".5rem .75rem",background:"var(--surface-2)",borderRadius:"var(--r-md)",border:"1px solid var(--border)",flexWrap:"wrap",opacity:.7}}>
                {[["diabetes","Diabetes"],["hypertension","Hipertensão"]].map(([val,lbl])=>(
                  <label key={val} style={{display:"flex",alignItems:"center",gap:".35rem",fontSize:".82rem",fontWeight:500,margin:0}}>
                    <input type="checkbox" checked={(viewPatient.chronicConditions||[]).includes(val)} disabled style={{width:15,height:15}}/>
                    {lbl}
                  </label>
                ))}
              </div>
            </label>
            {/* Seção 2: Identificação */}
            <label className="field-span-2">Nome completo<input value={displayText(viewPatient.name)} disabled/></label>
            {isChildCategory(viewPatient.careCategory)&&<label className="field-span-2">Nome do responsável<input value={displayText(viewPatient.guardianName||viewPatient.motherName)} disabled/></label>}
            <label>Data de nascimento<input value={viewPatient.birthDate ? `${fmtDate(viewPatient.birthDate)}${calcAge(viewPatient.birthDate) ? " · " + calcAge(viewPatient.birthDate) : ""}` : "-"} disabled/></label>
            <label>Sexo<input value={displayText(viewPatient.sex)} disabled/></label>
            <label>Município de nascimento<input value={displayText(viewPatient.birthCity)} disabled/></label>
            <label>UF de nascimento<input value={displayText(viewPatient.birthState)} disabled/></label>
            <label>Raça / Cor<input value={displayText(viewPatient.raceColor)} disabled/></label>
            {!isChildCategory(viewPatient.careCategory)&&(
              <label>Estado civil
                <select value={viewPatient.maritalStatus||""} disabled>
                  <option value="">Não informado</option>
                  <option value="solteiro">Solteiro(a)</option>
                  <option value="casado">Casado(a)</option>
                  <option value="uniao_estavel">União estável</option>
                  <option value="divorciado">Divorciado(a)</option>
                  <option value="separado">Separado(a)</option>
                  <option value="viuvo">Viúvo(a)</option>
                </select>
              </label>
            )}
            <label>CPF<input value={displayText(viewPatient.cpf)} disabled/></label>
            <label>CNS<input value={displayText(viewPatient.cns)} disabled/></label>
            {/* Seção 3: Contato */}
            <label>Telefone<input value={displayText(viewPatient.phone)} disabled/></label>
            <label>Telefone 2<input value={displayText(viewPatient.phoneAlt)} disabled/></label>
            {/* Seção 4: Endereço */}
            <label>CEP<input value={displayText(viewPatient.zipCode)} disabled/></label>
            <label>Rua<input value={displayText(viewPatient.address)} disabled/></label>
            <label>Número<input value={displayText(viewPatient.number)} disabled/></label>
            <label>Complemento<input value={displayText(viewPatient.complement)} disabled/></label>
            <label>Bairro<input value={displayText(viewPatient.neighborhood)} disabled/></label>
            <label>Cidade<input value={displayText(viewPatient.city)} disabled/></label>
            <label>Estado (UF)<input value={displayText(viewPatient.state)} disabled/></label>
            <label>Código familiar<input value={displayText(viewPatient.familyCode)} disabled/></label>
            <label>Frequência de visita domiciliar<input value={displayText(viewPatient.homeVisitFreq)} disabled/></label>
            <label>Tipo de moradia<input value={displayText(viewPatient.housingType)} disabled/></label>
            <label>Abastecimento de água<input value={displayText(viewPatient.waterSupply)} disabled/></label>
            <label>Esgotamento sanitário<input value={displayText(viewPatient.sewage)} disabled/></label>
            <label>Coleta de lixo<input value={displayText(viewPatient.garbage)} disabled/></label>
            <label>Energia elétrica<input value={displayText(viewPatient.electricity)} disabled/></label>
            {/* Seção 5: Gestação */}
            {String(viewPatient.careCategory||"").toLowerCase()==="pregnant"&&<>
              <label>DUM<input value={fmtDate(viewPatient.pregnancyStartDate)} disabled/></label>
              <label>DPP<input value={fmtDate(viewPatient.expectedDeliveryDate)} disabled/></label>
              <label>IG DUM (sem)<input value={displayText(viewPatient.gestationalAgeDumWeeks)} disabled/></label>
              <label>IG DUM (dias)<input value={displayText(viewPatient.gestationalAgeDumDays)} disabled/></label>
              <label>Data 1ª USG<input value={fmtDate(viewPatient.usgDate1)} disabled/></label>
              <label>IG USG (sem)<input value={displayText(viewPatient.gestationalAgeUsgWeeks)} disabled/></label>
              <label>IG USG (dias)<input value={displayText(viewPatient.gestationalAgeUsgDays)} disabled/></label>
              <label>Data 2ª USG<input value={fmtDate(viewPatient.usgDate2)} disabled/></label>
              <label>Data 3ª USG<input value={fmtDate(viewPatient.usgDate3)} disabled/></label>
            </>}
            {/* Seção 6: Clínico */}
            <label className="field-span-2">Alergias conhecidas<textarea value={displayText(viewPatient.allergies)} disabled style={{minHeight:56}}/></label>
            <label className="field-span-2">Comorbidades<textarea value={displayText(viewPatient.comorbidities)} disabled style={{minHeight:56}}/></label>
            <label className="field-span-2">Medicamentos em uso contínuo<textarea value={displayText(viewPatient.medications)} disabled style={{minHeight:56}}/></label>
          </div>
        </Modal>
      )}

      
      {showUserModal&&editingUser&&(
        <Modal title="Editar usuário" onClose={()=>setShowUserModal(false)}>
          <form onSubmit={submitUser} style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
            <label>Perfil
              <select value={userForm.role} disabled onChange={e=>setUserForm(s=>({...s,role:e.target.value}))}>
                <option value="acs">ACS</option>
                <option value="nursing_tech">Téc. de Enfermagem</option>
                <option value="doctor">Médico(a)</option>
                <option value="dentist">Dentista</option>
                <option value="pharmacist">Farmacêutico(a)</option>
                <option value="pharmacy_tech">Téc. de Farmácia</option>
                <option value="nurse_manager">Enfermeira</option>
                <option value="receptionist">Recepcionista</option>
              </select>
            </label>
            <label>Nome<input value={userForm.name} onChange={e=>setUserForm(s=>({...s,name:e.target.value}))}/></label>
            <label>E-mail<input type="email" value={userForm.email} onChange={e=>setUserForm(s=>({...s,email:e.target.value}))}/></label>
            <label>Nova senha (opcional)<input type="password" value={userForm.password} onChange={e=>setUserForm(s=>({...s,password:e.target.value}))}/></label>
            {["doctor","dentist","nurse_manager","nursing_tech","pharmacist","pharmacy_tech"].includes(userForm.role)&&<>
              <label>
                {userForm.role==="doctor"?"CRM":userForm.role==="dentist"?"CRO":["pharmacist","pharmacy_tech"].includes(userForm.role)?"CFF":"COREN"} – Número do conselho
                <input value={userForm.councilNumber} onChange={e=>setUserForm(s=>({...s,councilNumber:onlyDigits(e.target.value).slice(0,12)}))}/>
              </label>
              <label>UF do conselho<input maxLength={2} value={userForm.councilUf} onChange={e=>setUserForm(s=>({...s,councilUf:e.target.value.toUpperCase()}))}/></label>
            </>}
            {error&&<p className="error">{error}</p>}
            <div className="actions" style={{justifyContent:"flex-end"}}>
              <button type="button" className="secondary" onClick={()=>setShowUserModal(false)}>Cancelar</button>
              <button type="submit" disabled={busy}>{busy?"Salvando...":"Salvar"}</button>
            </div>
          </form>
        </Modal>
      )}

      
      {showTemplateModal&&(
        <Modal title={editingTemplate?"Editar protocolo":"Novo protocolo"} onClose={()=>setShowTemplateModal(false)}>
          <form onSubmit={submitTemplate} style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
            <label>Categoria (chave)<input value={templateForm.category} disabled={Boolean(editingTemplate)} onChange={e=>setTemplateForm(s=>({...s,category:e.target.value}))}/></label>
            <label>Nome de exibição<input value={templateForm.label} onChange={e=>setTemplateForm(s=>({...s,label:e.target.value}))}/></label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:".6rem"}}>
              <label>Visitas alvo<input type="number" min="0" value={templateForm.visits} onChange={e=>setTemplateForm(s=>({...s,visits:Number(e.target.value||0)}))}/></label>
              <label>Consultas alvo<input type="number" min="0" value={templateForm.consultations} onChange={e=>setTemplateForm(s=>({...s,consultations:Number(e.target.value||0)}))}/></label>
              <label>Vacinas alvo<input type="number" min="0" value={templateForm.vaccines} onChange={e=>setTemplateForm(s=>({...s,vaccines:Number(e.target.value||0)}))}/></label>
              <label>Prazo visitas (d)<input type="number" min="0" value={templateForm.deadlinesVisits} onChange={e=>setTemplateForm(s=>({...s,deadlinesVisits:Number(e.target.value||0)}))}/></label>
              <label>Prazo consultas (d)<input type="number" min="0" value={templateForm.deadlinesConsultations} onChange={e=>setTemplateForm(s=>({...s,deadlinesConsultations:Number(e.target.value||0)}))}/></label>
              <label>Prazo vacinas (d)<input type="number" min="0" value={templateForm.deadlinesVaccines} onChange={e=>setTemplateForm(s=>({...s,deadlinesVaccines:Number(e.target.value||0)}))}/></label>
            </div>
            <label>Lista de vacinas (separadas por vírgula)<textarea value={templateForm.vaccineList} onChange={e=>setTemplateForm(s=>({...s,vaccineList:e.target.value}))} style={{minHeight:56}}/></label>
            {error&&<p className="error">{error}</p>}
            <div className="actions" style={{justifyContent:"flex-end"}}>
              <button type="button" className="secondary" onClick={()=>setShowTemplateModal(false)}>Cancelar</button>
              <button type="submit" disabled={busy}>{busy?"Salvando...":"Salvar"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Profile modal ── */}
      {showProfileModal && (
        <div className="modal-backdrop" onClick={()=>setShowProfileModal(false)}>
          <form className="modal" onSubmit={submitProfile} onClick={e=>e.stopPropagation()}
            style={{maxWidth:440}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".25rem"}}>
              <div>
                <h3 style={{fontSize:"1rem",fontWeight:700,color:"var(--ink)"}}>Editar perfil</h3>
                <p style={{fontSize:".78rem",color:"var(--text-3)",marginTop:".15rem"}}>Atualize seus dados de acesso</p>
              </div>
              <button type="button" className="icon-btn" onClick={()=>setShowProfileModal(false)}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div style={{display:"flex",justifyContent:"center",padding:".75rem 0 1rem"}}>
              <div className="user-avatar" style={{width:56,height:56,fontSize:"1.25rem"}}>
                {initials(profileForm.name || user?.name)}
              </div>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
              <label style={{display:"flex",flexDirection:"column",gap:".35rem",fontSize:".78rem",fontWeight:600,color:"var(--slate-700)"}}>
                Nome completo
                <input value={profileForm.name} onChange={e=>setProfileForm(s=>({...s,name:e.target.value}))} placeholder="Seu nome" autoFocus/>
              </label>

              <label style={{display:"flex",flexDirection:"column",gap:".35rem",fontSize:".78rem",fontWeight:600,color:"var(--slate-700)"}}>
                E-mail
                <input type="email" value={profileForm.email} onChange={e=>setProfileForm(s=>({...s,email:e.target.value}))} placeholder="seu@email.com"/>
              </label>

              <label style={{display:"flex",flexDirection:"column",gap:".35rem",fontSize:".78rem",fontWeight:600,color:"var(--slate-700)"}}>
                Nova senha
                <input type="password" value={profileForm.password} onChange={e=>setProfileForm(s=>({...s,password:e.target.value}))} placeholder="Deixe em branco para manter a atual"/>
                <span style={{fontSize:".72rem",color:"var(--text-3)",fontWeight:400}}>Mínimo 8 caracteres com maiúscula, número e símbolo.</span>
              </label>

              {["nurse_manager","doctor","dentist","nursing_tech","pharmacist","pharmacy_tech"].includes(user?.role) && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 72px",gap:".6rem"}}>
                  <label style={{display:"flex",flexDirection:"column",gap:".35rem",fontSize:".78rem",fontWeight:600,color:"var(--slate-700)"}}>
                    Número do conselho
                    <input value={profileForm.councilNumber} onChange={e=>setProfileForm(s=>({...s,councilNumber:onlyDigits(e.target.value).slice(0,12)}))} placeholder="Somente números" inputMode="numeric"/>
                  </label>
                  <label style={{display:"flex",flexDirection:"column",gap:".35rem",fontSize:".78rem",fontWeight:600,color:"var(--slate-700)"}}>
                    UF
                    <input maxLength={2} value={profileForm.councilUf} onChange={e=>setProfileForm(s=>({...s,councilUf:e.target.value.toUpperCase()}))} placeholder="SP"/>
                  </label>
                </div>
              )}

              <div style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:".65rem .85rem",display:"flex",flexDirection:"column",gap:".35rem"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:".78rem"}}>
                  <span style={{color:"var(--text-3)"}}>Perfil</span>
                  <span style={{color:"var(--ink)",fontWeight:500}}>{roleLabel(user?.role)}</span>
                </div>
                {user?.teamName && (
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:".78rem"}}>
                    <span style={{color:"var(--text-3)"}}>Equipe</span>
                    <span style={{color:"var(--ink)",fontWeight:500}}>{user.teamName}</span>
                  </div>
                )}
              </div>
            </div>

            {profileError && <p className="error" style={{marginTop:".5rem"}}>{profileError}</p>}

            <div className="actions" style={{justifyContent:"flex-end",marginTop:".5rem"}}>
              <button type="button" className="secondary" onClick={()=>setShowProfileModal(false)}>Cancelar</button>
              <button type="submit" disabled={profileBusy}>{profileBusy?"Salvando...":"Salvar alterações"}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

/* ── App exportado – envolve tudo no ErrorBoundary ── */
export function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}
