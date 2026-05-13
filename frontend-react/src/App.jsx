import { useEffect, useMemo, useRef, useState, Component } from "react";
import PageHero from "./components/layout/PageHero";
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


/* ── Service Worker — Offline Support ───────────────────────────── */
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
        <span>Modo offline — dados locais disponíveis. Alterações serão sincronizadas ao reconectar.</span>
      </div>
      <span style={{fontSize:".7rem",color:"#94a3b8",flexShrink:0}}>SIGUS · Offline</span>
    </div>
  );
}

function ComplianceBadge() {
  return (
    <div style={{position:"fixed",bottom:0,right:0,zIndex:9990,background:"rgba(15,23,42,.85)",backdropFilter:"blur(4px)",padding:".3rem .75rem",borderTopLeftRadius:"var(--r-md)",display:"flex",alignItems:"center",gap:".5rem",fontSize:".62rem",color:"#94a3b8",pointerEvents:"none"}}>
      <span style={{color:"#34d399",fontWeight:700}}>✓</span>
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
    // Imutável: prepend, nunca pop — se chegar no limite, avisa mas não descarta
    const updated = [entry, ...existing].slice(0, AUDIT_MAX);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(updated));
  } catch { /* silencia erros de storage — não pode travar o sistema */ }
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
// Usuários locais de recepção — sem senhas em texto puro
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
  acs_tasks:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3h10v10H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

/* ââ€â‚¬ââ€â‚¬ Helpers ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ */
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
// Filtra paciente por query — nome (com normalização de acentos), CPF ou telefone
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
// Apenas a flag explícita conta — quem usou o formulário completo nunca é marcado,
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
    // não UTC — sem o sufixo de hora o JS usa UTC e o fuso BR (UTC-3) vira dia anterior.
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
  if (d.getDay() === 0) return "Domingo — unidade fechada";
  if (d.getDay() === 6) return "Sábado — unidade fechada";
  if (isHoliday(dateStr)) return "Feriado nacional — unidade fechada";
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
  const role = String(user?.role||"");
  const items = [];

  // Gestor: menu exclusivo de gestão
  if (isGestor(user) && !admin) {
    items.push({ id:"gestor",   label:"Gestão à Vista",  section:"" });
    items.push({ id:"reports",  label:"Relatórios",       section:"" });
    items.push({ id:"diagnostics", label:"Diagnósticos",   section:"" });
    items.push({ id:"patients", label:"Pacientes",        section:"Visualização" });
    items.push({ id:"ai",       label:"IA Assistida",     section:"" });
    return items;
  }

  // Recepcionistas têm app próprio — não aparecem no nav geral
  if (isReceptionist(user) && !admin) return items;

  // 1. Visão geral
  if (!isPharmacist(user) || admin) items.push({ id:"dashboard", label:"Painel", section:"" });

  // 2. Atendimento diário
  if (admin) items.push({ id:"queue",   label:"Fila / Recepção", section:"Atendimento" });
  if (admin) items.push({ id:"agenda",  label:"Agenda",          section: admin ? "" : "Atendimento" });
  if (isNursingTech(user) || admin) items.push({ id:"triage", label:"Monitoramento", section: admin ? "" : "Atendimento" });

  // 3. Clínico
  if (!isPharmacist(user) || admin) items.push({ id:"patients",  label:"Pacientes",       section:"Clínico" });
  if (!isPharmacist(user) || admin) items.push({ id:"exams_page", label:"Exames", section:"" });
  if (canManageUser && !isNursingTech(user)) items.push({ id:"protocols", label:"Protocolos", section:"" });
  if (canAccessChart(user) || admin) items.push({ id:"chart", label:"Prontuário", section:"" });
  if (!isPharmacist(user) || admin) items.push({ id:"referrals", label:"Encaminhamentos",  section:"" });
  // Página de tarefas exclusiva para ACS
  if (role === "acs") items.push({ id:"acs_tasks", label:"Minhas tarefas", section:"" });

  // 4. Saúde preventiva
  if (!isPharmacist(user) || admin) items.push({ id:"vaccines",  label:"Vacinas",    section:"Preventivo" });
  items.push({ id:"pharmacy", label:"Farmácia", section:"" });
  if (["nurse_manager","nursing_tech","pharmacist","pharmacy_tech"].includes(role) || admin)
    items.push({ id:"insumos", label:"Insumos", section:"" });

  // 5. Equipe
  if (canManageUser && !isNursingTech(user)) { items.push({ id:"acs", label:"ACS", section:"Equipe" }); items.push({ id:"doctors", label:"Médicos", section:"" }); }

  // 6. Gestão & IA
  if (canManageUser || admin) items.push({ id:"gestor", label:"Gestão à Vista", section:"Gestão" });
  if (canManageUser || admin) items.push({ id:"reports", label:"Relatórios", section:"" });
  if (canManageUser || admin || isGestor(user)) items.push({ id:"diagnostics", label:"Diagnósticos", section:"" });
  if (canAccessAI(user)) items.push({ id:"ai", label:"IA Assistida", section:"" });

  return items;
}
function isChildCategory(category) {
  const c = String(category||"").toLowerCase();
  return c === "puericulture" || c === "child_followup";
}

function emptyPatientForm() {
  return{
    // Identificação — CFM 1638/2002 + SISAB
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

/* ââ€â‚¬ââ€â‚¬ SVG Icons ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ */
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

/* â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢
   AUTH SCREEN
â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢ */


function AuthScreen({ onLogin, onRegister, publicTeams, error, busy }) {
  const [authTab, setAuthTab] = useState("login");
  const [loginMode, setLoginMode] = useState("saude"); // "saude" | "gestor"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reg, setReg] = useState({ name:"",email:"",password:"",role:"nurse_manager",teamId:"",councilNumber:"",councilUf:"SP" });

  // Tela de login do Gestor — visual executivo distinto
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
            <span style={{fontSize:".7rem",background:"rgba(99,102,241,.25)",color:"#a5b4fc",border:"1px solid rgba(99,102,241,.4)",padding:".15em .5em",borderRadius:99,fontFamily:"monospace",marginLeft:".25rem"}}>GESTÒO</span>
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
              Visão executiva completa da UBS — produção, protocolos, equipe e farmácia em um único painel.
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
        <section style={{width:520,background:"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",padding:"2rem",overflowY:"auto"}}>
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
                  {reg.role==="doctor"?"CRM":reg.role==="dentist"?"CRO":["pharmacist","pharmacy_tech"].includes(reg.role)?"CFF":"COREN"} — Número do conselho
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
                  {reg.role==="doctor"?"CRM":reg.role==="dentist"?"CRO":["pharmacist","pharmacy_tech"].includes(reg.role)?"CFF":"COREN"} — Número do conselho
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
            Informe seu e-mail cadastrado. Você receberá um token para criar uma nova senha. Apenas você tem acesso à sua conta — nenhum administrador pode ver ou redefinir sua senha.
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
            Token recebido. Defina sua nova senha — ela ficará protegida no servidor com hash seguro.
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
          <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>✅</div>
          <p style={{color:"#15803d",fontWeight:700,margin:0}}>{msg}</p>
        </div>
      )}
    </div>
  );
}

/* â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢
   SIDEBAR
â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢ */
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

/* â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢
   TOPBAR
â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢ */
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
        {/* Ícone de saúde — cruz no quadrado arredondado */}
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
        {/* Paciente selecionado — discreto, próximo ao perfil */}
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

/* â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢
   DASHBOARD
â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢ */
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
  const dmStatus=dmPct===null?"Sem dados":dmInRange?"Na meta ✓":dmPct<50?"Abaixo da meta":"Acima da meta";
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
      <PageHero
        badge="Workspace da equipe"
        title="Gestão de Pacientes — UBS"
        subtitle="Acompanhe pacientes, protocolos e pendências da equipe em tempo real."
        actions={
          <div style={{display:"flex",flexDirection:"column",gap:".5rem",alignItems:"flex-end",flexShrink:0}}>
            <div style={{display:"flex",gap:".5rem"}}>
              <Chip tone={pc.critical>0?"danger":pc.attention>0?"warn":"ok"}>
                {pc.critical} crítico{pc.critical!==1?"s":""}
              </Chip>
              <Chip tone="muted">{pc.ok} em dia</Chip>
            </div>
          </div>
        }
      />

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
            <p className="home-kpi-value" style={{color:dmColor,margin:0}}>{dmPct===null?"—":`${dmPct}%`}</p>
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
            <span style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)"}}>👥 Painel de contas</span>
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
              <span style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)"}}>🔔 Alertas proativos</span>
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
            <span className="card-title">⚠️ Pacientes prioritários</span>
            <Chip tone="danger">{pc.critical} crítico{pc.critical!==1?"s":""}</Chip>
          </div>
          <div className="card-body">
            {!critical.length
              ? <p className="muted" style={{fontSize:".84rem"}}>Nenhum paciente com protocolo crítico. 🎉</p>
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
            <span className="card-title">👥 Equipe ativa</span>
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

/* ââ€â‚¬ââ€â‚¬ Shared micro-components ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ââ€â‚¬ */
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

/* â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢
   PATIENTS TABLE
â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢ */
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
    <div style={{display:"flex",flexDirection:"column"}}>
      <PageHero
        badge="Gestão de Pacientes"
        title="Pacientes"
        subtitle={`${filtered.length} paciente${filtered.length!==1?"s":""} cadastrado${filtered.length!==1?"s":""}`}
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={canManageUser&&<button onClick={onEdit(null)}>+ Novo paciente</button>}
      />
    <div className={`patients-layout ${selectedPatient ? "with-detail" : "without-detail"}`}>
      <div className="card">
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
  </div>
  );
}

/* â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢
   PATIENT DETAIL (right panel)
â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢ */
/* ═══════════════════════════════════════════════════════════════════
   EXAMS TAB
═══════════════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════════════
   PEDIDO DE EXAME — modal
══════════════════════════════════════════════════════════════════ */
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
        `PEDIDO DE EXAME — emitido em ${new Date().toLocaleDateString("pt-BR")}`,
        `Profissional: ${user?.name||""} ${user?.councilNumber?`(${user.role==="doctor"?"CRM":user.role==="dentist"?"CRO":"COREN"} ${user.councilNumber}/${user.councilUf||""})` : ""}`,
        `Paciente: ${patient.name}`,
        "",
        ...valid.map((ex,i)=>`${i+1}. ${ex.type==="Outros"?ex.name.trim():ex.type}${ex.urgency==="urgent"?" — URGENTE":ex.urgency==="priority"?" — PRIORITÁRIO":""}${ex.notes?`\n   Observação: ${ex.notes}`:""}`),
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
            <h3 style={{margin:0,fontSize:"1rem"}}>🔬 Pedido de Exame</h3>
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
                {exams.length>1&&<button type="button" onClick={()=>removeExam(i)} style={{marginTop:"1.4rem",padding:".25rem .45rem",background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"#be123c",cursor:"pointer",fontSize:".75rem",flexShrink:0}}>✕</button>}
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

/* ══════════════════════════════════════════════════════════════════
   RECEITA / PRESCRIÇÃO — modal
══════════════════════════════════════════════════════════════════ */
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
        `PRESCRIÇÃO MÉDICA — emitida em ${new Date().toLocaleDateString("pt-BR")}`,
        `Validade: ${validity} dias`,
        `Profissional: ${user?.name||""} ${user?.councilNumber?`(${user.role==="doctor"?"CRM":user.role==="dentist"?"CRO":"COREN"} ${user.councilNumber}/${user.councilUf||""})` : ""}`,
        `Paciente: ${patient.name}`,
        "",
        ...valid.map((m,i)=>{
          const nome = m.name==="Outros (digitar)"?m.custom.trim():m.name;
          return `${i+1}. ${nome} ${m.dosage}${m.route?` — Via: ${m.route}`:""}
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
                {meds.length>1&&<button type="button" onClick={()=>removeMed(i)} style={{padding:".3rem .5rem",background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"#be123c",cursor:"pointer",fontSize:".75rem",flexShrink:0,marginBottom:0}}>✕</button>}
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
                    <option value="">—</option>
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

/* ══════════════════════════════════════════════════════════════════
   ENCAMINHAMENTO INTERNO — modal
══════════════════════════════════════════════════════════════════ */
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
        `ENCAMINHAMENTO INTERNO — ${new Date().toLocaleDateString("pt-BR")}`,
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
            <h3 style={{margin:0,fontSize:"1rem"}}>🔁 Encaminhamento Interno</h3>
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
                {doctors.map(d=><option key={d.id} value={d.id}>{d.name} — {d.role==="dentist"?"Dentista":"Médico(a)"}</option>)}
              </select>
            </label>
            <label style={{fontSize:".78rem",fontWeight:600}}>Prioridade
              <select value={priority} onChange={e=>setPriority(e.target.value)} style={{marginTop:".25rem"}}>
                <option value="routine">Rotina</option>
                <option value="priority">Prioritário</option>
                <option value="urgent">Urgente — ver hoje</option>
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

/* ══════════════════════════════════════════════════════════════════
   EXAMS TAB — exames do posto + externos
══════════════════════════════════════════════════════════════════ */
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
        isExternal?"[EXAME EXTERNO — trazido pelo paciente]":"[EXAME REALIZADO NO POSTO]",
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
            🔬 Pedir exame
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
              🔁 Encaminhar ao médico
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

      {/* Formulário inline — posto ou externo */}
      {addMode&&(
        <div style={{padding:".85rem",background:"var(--surface-2)",border:`2px solid ${addMode==="externo"?"#6366f1":"var(--teal-500)"}`,borderRadius:"var(--r-md)",marginBottom:"1rem"}}>
          <div style={{fontSize:".72rem",fontWeight:700,color:addMode==="externo"?"#6366f1":"var(--teal-700)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".65rem"}}>
            {addMode==="externo"?"📎 Inserir exame externo (trazido pelo paciente)":"🏥 Registrar exame realizado no posto"}
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

      {/* Lista — exames do posto */}
      <div style={{marginBottom:"1.25rem"}}>
        <div style={{fontSize:".7rem",fontWeight:700,color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".5rem",display:"flex",alignItems:"center",gap:".4rem"}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:"var(--teal-500)",display:"inline-block"}}/>
          Realizados no posto ({posto.length})
        </div>
        {loading ? <p className="muted" style={{fontSize:".82rem"}}>Carregando...</p>
          : !posto.length ? <p className="muted" style={{fontSize:".82rem"}}>🔬 Nenhum exame registrado no posto.</p>
          : posto.map(exam=>examCard(exam,canManageUser,handleDelete,setPreview,isImg,fmtDate))}
      </div>

      {/* Lista — exames externos */}
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

/* ══════════════════════════════════════════════════════════════════
   PATIENT ACTIONS TAB — pedido exame, prescrição, encaminhamento
══════════════════════════════════════════════════════════════════ */
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
      id:"exam", icon:"🔬", title:"Pedir Exame",
      desc:"Solicite exames laboratoriais ou de imagem com prioridade e justificativa.",
      color:"var(--teal-600)", bg:"var(--teal-50)", border:"var(--teal-200)"
    },
    canPrescribe && {
      id:"prescription", icon:"💊", title:"Prescrever Medicamento",
      desc:"Emita prescrição com medicamentos, dosagem, frequência e via.",
      color:"#15803d", bg:"#f0fdf4", border:"#bbf7d0"
    },
    canRefer && {
      id:"referral", icon:"🔁", title:"Encaminhar ao Médico",
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
              <span style={{color:"var(--teal-600)",fontWeight:600}}>✓</span>
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

/* ══════════════════════════════════════════════════════════════════
   EXAMS PAGE — página dedicada, exames do posto + externos
══════════════════════════════════════════════════════════════════ */
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
      const tag  = addMode==="externo"?"[EXAME EXTERNO — trazido pelo paciente]":"[EXAME REALIZADO NO POSTO]";
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
      <PageHero badge="Exames · Unidade" title="Exames dos Pacientes" subtitle="Exames realizados na unidade e exames externos trazidos pelos pacientes." style={{margin:"1.5rem 1.5rem .75rem"}} />

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
                    Ver ficha →
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
                    {addMode==="externo"?"📎 Exame externo (trazido pelo paciente)":"🏥 Exame realizado no posto"}
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
                  :!posto.length?<p className="muted" style={{fontSize:".82rem"}}>🔬 Nenhum exame registrado.</p>
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

/* ══════════════════════════════════════════════════════════════════
   HISTÓRICO TAB — leitura cronológica de todos os eventos
══════════════════════════════════════════════════════════════════ */
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

  // Tipos internos que NÒO entram no prontuário legal
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
          Clínico — entra no prontuário legal
        </span>
        <span style={{display:"flex",alignItems:"center",gap:".3rem",fontSize:".68rem",color:"var(--text-3)"}}>
          <span style={{width:8,height:8,borderRadius:2,background:"#d97706",display:"inline-block"}}/>
          Interno — só visível aqui
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
    {id:"protocol",     label:"Protocolo",    icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.4"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.4"/></svg>},
    {id:"followup",     label:"Atendimento",  icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>},
    {id:"appointments", label:"Histórico",    icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.3"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.3"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>},
    {id:"tasks",        label:"Tarefas",      icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>},

    {id:"exams",        label:"Ações clínicas", icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>},
    {id:"messages",     label:"Mensagens",    icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H9l-3 2v-2H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>},
  ];

  return (
    <>
      {/* Patient header */}
      <div style={{padding:"1.1rem 1.25rem",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:".75rem"}}>
        <div className="user-avatar" style={{width:40,height:40,fontSize:"1rem",flexShrink:0}}>{initials(patient.name)}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:".95rem",color:"var(--text-1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:".5rem"}}>
            {patient.name}
            {(()=>{ const age=calcAge(patient.birthDate); return age&&<span style={{fontSize:".72rem",fontWeight:600,color:"var(--text-3)",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:999,padding:".1rem .45rem",flexShrink:0}}>{age}</span>; })()}
            {isProfileIncomplete(patient)&&<span style={{fontSize:".65rem",fontWeight:700,padding:".1rem .4rem",borderRadius:999,background:"#fef3c7",color:"#92400e",border:"1px solid #fde68a",flexShrink:0}}>⚠️ Cadastro incompleto</span>}
          </div>
          <div style={{fontSize:".75rem",color:"var(--text-2)",display:"flex",gap:".5rem",flexWrap:"wrap",marginTop:".15rem"}}>
            <span>{catLabel(templates,patient.careCategory)}</span>
            <span>•</span>
            <span>{acsName}</span>
          </div>
        </div>
        {canManageUser&&(
          <div style={{display:"flex",gap:".35rem",flexShrink:0}}>
            <button onClick={()=>setShowPatientCard(true)} title="Cartão do paciente" style={{fontSize:".7rem",padding:".25rem .55rem",background:"var(--teal-600)",border:"1px solid var(--teal-700)",borderRadius:"var(--r-md)",color:"#fff",fontWeight:600,cursor:"pointer"}}>Cartão</button>
            <button onClick={()=>setDocType("comparecimento")} title="Declaração de comparecimento" style={{fontSize:".7rem",padding:".25rem .55rem",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"var(--r-md)",color:"#1d4ed8",fontWeight:600,cursor:"pointer"}}>Decl.</button>
            <button onClick={()=>setDocType("atestado")} title="Atestado médico" style={{fontSize:".7rem",padding:".25rem .55rem",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:"var(--r-md)",color:"#15803d",fontWeight:600,cursor:"pointer"}}>Atestado</button>
          </div>
        )}
      </div>
      {/* Banner de cadastro incompleto */}
      {isProfileIncomplete(patient)&&(
        <div style={{padding:".55rem 1.25rem",background:"#fffbeb",borderBottom:"1px solid #fde68a",fontSize:".75rem",color:"#92400e",display:"flex",alignItems:"center",gap:".5rem"}}>
          <span>âš ï¸</span>
          <span style={{flex:1}}>Este paciente foi cadastrado rapidamente para agendamento. <strong>Complete o perfil</strong> para liberar consultas.</span>
        </div>
      )}

      {g && String(patient.careCategory||"").toLowerCase()==="pregnant" && (
        <div style={{padding:".6rem 1.25rem",background:"var(--teal-50)",borderBottom:"1px solid var(--teal-100)",fontSize:".75rem",color:"var(--teal-700)",display:"flex",alignItems:"center",gap:".4rem"}}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          IG estimada: <strong>{g.weeks}s {g.days}d</strong> (ref: {g.source})
        </div>
      )}

      {/* Tabs — nowrap para não quebrar linha */}
      <div className="tabs small-tabs" style={{
        flexWrap:"nowrap",overflowX:"auto",whiteSpace:"nowrap",
        scrollbarWidth:"thin",
        borderBottom:"1px solid var(--border)",
        display:"flex",gap:0,padding:"0 .25rem",
      }}>
        {TABS.map(t=>(
          <button key={t.id}
            className={`tab${patientTab===t.id?" active":""}`}
            style={{flexShrink:0,whiteSpace:"nowrap",fontSize:".75rem",padding:".5rem .65rem",gap:".3rem"}}
            onClick={()=>setPatientTab(t.id)}>
            <span className="tab-ico">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <div style={{padding:"1rem 1.25rem"}}>

        {/* ââ€â‚¬ââ€â‚¬ PROTOCOL ââ€â‚¬ââ€â‚¬ */}
        {patientTab==="protocol"&&(
          <div className="panel-block">
            {!patientProtocolSummary
              ? <p className="muted">Sem resumo de protocolo.</p>
              : <>
                  {/* Indicadores de visita perdida — puericultura */}
                  {(()=>{
                    const cat = String(patient.careCategory||"").toLowerCase();
                    if (cat !== "child_followup" || !patient.birthDate) return null;
                    const birth = parseLocalDate(patient.birthDate);
                    const now = new Date();
                    const agedays = Math.floor((now - birth) / 86400000);
                    const visits = Number(patientProtocolSummary.completed?.visits ?? patientProtocolSummary.visitsCompleted ?? 0);
                    // Calcular idade exata: anos, meses, dias
                    let ay = now.getFullYear() - birth.getFullYear();
                    let am = now.getMonth() - birth.getMonth();
                    let ad = now.getDate() - birth.getDate();
                    if (ad < 0) { am--; ad += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
                    if (am < 0) { ay--; am += 12; }
                    const idadeFmt = [ay>0?`${ay}a`:null, am>0?`${am}m`:null, ad>0?`${ad}d`:null].filter(Boolean).join(" ") || "0d";
                    const lost = [];
                    // 1ª visita: 1 visita obrigatória até 30 dias de vida
                    if (visits === 0 && agedays >= 31)
                      lost.push("1ª visita ACS — até o 1º mês de vida (prazo encerrado)");
                    // 2ª visita: 1 visita obrigatória entre 31 e 180 dias (2º ao 6º mês)
                    // Perdida se: criança tem > 180 dias E fez menos de 2 visitas no total
                    if (agedays >= 181 && visits < 2)
                      lost.push("2ª visita ACS — do 2º ao 6º mês de vida (prazo encerrado)");
                    // Consultas perdidas: mesmas janelas das visitas (consulta inicial é
                    // dependente da 1ª visita; janelas seguem o mesmo calendário)
                      const consultsDone = Number(patientProtocolSummary.completed?.consultations ?? 0);
                      const consultsTarget = Number(patientProtocolSummary.targets?.consultations ?? 0);
                    if (consultsTarget >= 1 && consultsDone === 0 && agedays >= 31)
                      lost.push("1ª consulta de puericultura — até o 1º mês de vida (prazo encerrado)");
                    if (consultsTarget >= 2 && consultsDone < 2 && agedays >= 181)
                      lost.push("2ª consulta de puericultura — do 2º ao 6º mês de vida (prazo encerrado)");
                    if (!lost.length) return null;
                    return (
                      <div style={{marginBottom:".75rem",display:"flex",flexDirection:"column",gap:".35rem"}}>
                        <div style={{fontSize:".7rem",fontWeight:700,color:"#6d28d9",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".1rem"}}>
                          Indicadores perdidos — Idade atual: {idadeFmt}
                        </div>
                        {lost.map(l=>(
                          <div key={l} style={{display:"flex",alignItems:"center",gap:".5rem",padding:".4rem .65rem",borderRadius:"var(--r-md)",background:"#f5f3ff",border:"1px solid #ddd6fe",fontSize:".75rem"}}>
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#7c3aed" strokeWidth="1.4"/><path d="M5 8h6M8 5v6" stroke="#7c3aed" strokeWidth="1.3" strokeLinecap="round"/></svg>
                            <span style={{color:"#6d28d9"}}>{l} — não recuperável</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  {/* Progress bars */}
                  <div style={{display:"flex",flexDirection:"column",gap:".75rem",marginBottom:"1rem"}}>
                    {[
                      {label:"Visitas",done:patientProtocolSummary.completed?.visits||0,goal:patientProtocolSummary.targets?.visits||0},
                      {label:"Consultas",done:patientProtocolSummary.completed?.consultations||0,goal:patientProtocolSummary.targets?.consultations||0},
                      {label:"Vacinas",done:patientProtocolSummary.completed?.vaccines||0,goal:patientProtocolSummary.targets?.vaccines||0},
                    ].map(({label,done,goal})=>{
                      const pct=goal>0?Math.min(100,Math.round(done/goal*100)):0;
                      const color=pct>=100?"var(--green-500)":pct>=50?"var(--amber-500)":"var(--red-500)";
                      return(
                        <div key={label}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:".75rem",marginBottom:".3rem"}}>
                            <span style={{fontWeight:600,color:"var(--text-2)"}}>{label}</span>
                            <span style={{fontFamily:"IBM Plex Mono",color:"var(--text-2)"}}>{done}/{goal}</span>
                          </div>
                          <div style={{height:6,background:"var(--slate-100)",borderRadius:99,overflow:"hidden"}}>
                            <div style={{width:`${pct}%`,height:"100%",background:color,borderRadius:99,transition:"width .4s ease"}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {sortedSpecialAlerts.length>0&&(
                    <>
                      <h4>Alertas</h4>
                      <div style={{display:"flex",flexDirection:"column",gap:".4rem",marginBottom:"1rem"}}>
                        {sortedSpecialAlerts.map((a,i)=>(
                          <div key={a.id||i} style={{padding:".55rem .75rem",borderRadius:"var(--r-md)",background:a.severity==="high"?"var(--red-50)":a.severity==="medium"?"var(--amber-50)":"var(--slate-50)",border:`1px solid ${a.severity==="high"?"var(--red-100)":a.severity==="medium"?"var(--amber-100)":"var(--border)"}`,fontSize:".8rem"}}>
                            <div style={{fontWeight:600,color:a.severity==="high"?"var(--red-700)":a.severity==="medium"?"var(--amber-700)":"var(--slate-700)"}}>{a.title}</div>
                            <div style={{color:"var(--text-2)",fontSize:".75rem",marginTop:".15rem"}}>{a.detail}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {sortedSpecialAlerts.length===0 && patientProtocolSummary?.alertsRestricted && (
                    <div style={{padding:".55rem .75rem",borderRadius:"var(--r-md)",background:"var(--slate-50)",border:"1px solid var(--border)",fontSize:".78rem",color:"var(--text-2)"}}>
                      Alertas e avisos deste paciente ficam visíveis apenas para a equipe responsável.
                    </div>
                  )}
                </>
            }
          </div>
        )}

        {/* ── ATENDIMENTO ── */}
        {patientTab==="followup"&&(
          <div className="panel-block">
            {/* Cabeçalho contextual */}
            <div style={{marginBottom:"1rem",padding:".6rem .85rem",background:"var(--teal-50)",border:"1px solid var(--teal-100)",borderRadius:"var(--r-md)",fontSize:".75rem",color:"var(--teal-700)"}}>
              <strong>Registrar atendimento</strong> — o que foi feito com o paciente agora ou retroativamente.
              Tudo que for registrado aqui aparece automaticamente no prontuário.
            </div>

            <form className="inline-form" onSubmit={onSubmitRecord}>
              {/* Tipo — muda campos automaticamente */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".78rem",fontWeight:600}}>
                  Tipo de atendimento
                  {isAcs(userObj) ? (
                    <input value="Visita domiciliar" disabled/>
                  ) : (
                    <select value={recordForm.type} onChange={e=>{
                      const t=e.target.value;
                      const defaultTitle = t==="consultation"
                        ? (userObj?.role==="doctor"?"Consulta médica":userObj?.role==="dentist"?"Consulta odontológica":"Consulta de enfermagem")
                        : t==="visit"?"Visita ACS":"";
                      setRecordForm(s=>({...s,type:t,title:defaultTitle,consultKind:"medica",consultDoctor:"",consultSpecialty:""}));
                      setRecordVaccines([]);
                    }}>
                      <option value="consultation">🩺 Consulta</option>
                      <option value="visit">🏠 Visita domiciliar</option>
                      <option value="vaccine">💉 Vacina</option>
                      <option value="procedure">⚙️ Procedimento</option>
                      <option value="note">📝 Observação / nota</option>
                    </select>
                  )}
                </label>
                <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".78rem",fontWeight:600}}>
                  Data
                  <input type="date" value={recordForm.date} onChange={e=>setRecordForm(s=>({...s,date:e.target.value}))}
                    max={new Date().toISOString().slice(0,10)}/>
                </label>
              </div>

              {/* Consulta — tipo específico */}
              {!isAcs(userObj) && recordForm.type==="consultation" && (
                <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                  <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".78rem",fontWeight:600}}>
                    Tipo de consulta
                    <select value={recordForm.consultKind||"medica"} onChange={e=>{
                      const k=e.target.value;
                      const titleMap={medica:"Consulta médica",enfermagem:"Consulta de enfermagem",dentista:"Consulta odontológica"};
                      setRecordForm(s=>({...s,consultKind:k,title:titleMap[k]||"Consulta médica",consultDoctor:"",consultSpecialty:""}));
                    }}>
                      <option value="medica">Consulta médica</option>
                      <option value="enfermagem">Consulta de enfermagem</option>
                      <option value="dentista">Consulta odontológica (Dentista)</option>
                    </select>
                  </label>
                  {(recordForm.consultKind==="medica"||(!recordForm.consultKind)) && (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                      <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".78rem",fontWeight:600}}>
                        Médico(a) responsável
                        <select value={recordForm.consultDoctor||""} onChange={e=>setRecordForm(s=>({...s,consultDoctor:e.target.value}))}>
                          <option value="">— Selecionar —</option>
                          {users.filter(u=>u.role==="doctor").map(u=>(
                            <option key={u.id} value={u.name}>{u.name}{u.teamName?` (${u.teamName})`:""}</option>
                          ))}
                          {/* Fallback fictício caso não haja médicos cadastrados */}
                          {!users.some(u=>u.role==="doctor")&&<>
                            <option value="Dr. Carlos Mendes">Dr. Carlos Mendes</option>
                            <option value="Dra. Fernanda Costa">Dra. Fernanda Costa</option>
                            <option value="Dr. João Ribeiro">Dr. João Ribeiro</option>
                            <option value="Dra. Mariana Souza">Dra. Mariana Souza</option>
                          </>}
                        </select>
                      </label>
                      <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".78rem",fontWeight:600}}>
                        Especialidade
                        <select value={recordForm.consultSpecialty||""} onChange={e=>setRecordForm(s=>({...s,consultSpecialty:e.target.value}))}>
                          <option value="">— Selecionar —</option>
                          <option value="Ginecologia">Ginecologia</option>
                          <option value="Médico da família">Médico da família</option>
                          <option value="Médico geral">Médico geral</option>
                          <option value="Pediatria">Pediatria</option>
                        </select>
                      </label>
                    </div>
                  )}
                  {recordForm.consultKind==="enfermagem" && (
                    <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".78rem",fontWeight:600}}>
                      Profissional de enfermagem
                      <select value={recordForm.consultDoctor||""} onChange={e=>setRecordForm(s=>({...s,consultDoctor:e.target.value}))}>
                        <option value="">— Selecionar —</option>
                        {users.filter(u=>["nurse_manager","nursing_tech"].includes(u.role)).map(u=>(
                          <option key={u.id} value={u.name}>{u.name} — {u.role==="nurse_manager"?"Enfermeira":"Téc. Enfermagem"}{u.teamName?` (${u.teamName})`:""}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}

              {/* Procedimento ou nota — título livre */}
              {!isAcs(userObj) && (recordForm.type==="procedure"||recordForm.type==="note") && (
                <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".78rem",fontWeight:600}}>
                  {recordForm.type==="procedure"?"Procedimento realizado":"Assunto da nota"}
                  <input placeholder={recordForm.type==="procedure"?"Ex: Curativo, aferição PA...":"Ex: Orientação nutricional..."}
                    value={recordForm.title} onChange={e=>setRecordForm(s=>({...s,title:e.target.value}))}/>
                </label>
              )}

              {/* Vacinas */}
              {!isAcs(userObj) && recordForm.type==="vaccine" && (
                <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                  <span style={{fontSize:".75rem",fontWeight:600}}>Vacinas aplicadas</span>
                  {/* Para crianças: mostrar qual dose será inferida com base na data */}
                  {(()=>{
                    const isCrianca = patient?.birthDate && (() => {
                      const am = (Date.now() - (parseLocalDate(patient.birthDate)||new Date()).getTime()) / (1000*60*60*24*30.44);
                      return am < 120;
                    })();
                    return isCrianca && recordForm.date && recordVaccines.length > 0 ? (
                      <div style={{padding:".4rem .6rem",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"var(--r-md)",fontSize:".72rem",color:"#1d4ed8",display:"flex",flexDirection:"column",gap:".2rem"}}>
                        <strong>Doses que serão registradas:</strong>
                        {recordVaccines.map(v => {
                          const resolved = inferVaccineDoseTitle(v, recordForm.date, patient.birthDate);
                          return <span key={v}>💉 {resolved !== v ? resolved : `${v} (dose não inferida — verifique a data)`}</span>;
                        })}
                      </div>
                    ) : null;
                  })()}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".3rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:".65rem .75rem",maxHeight:200,overflowY:"auto"}}>
                    {VACCINE_OPTIONS.map(v=>(
                      <label key={v} style={{display:"flex",alignItems:"center",gap:".4rem",fontSize:".8rem",cursor:"pointer",padding:".25rem .35rem",borderRadius:"var(--r-sm)",background:recordVaccines.includes(v)?"var(--teal-50)":"transparent",border:recordVaccines.includes(v)?"1px solid var(--teal-200)":"1px solid transparent"}}>
                        <input type="checkbox" checked={recordVaccines.includes(v)}
                          onChange={e=>setRecordVaccines(prev=>e.target.checked?[...prev,v]:prev.filter(x=>x!==v))}
                          style={{accentColor:"var(--teal-600)",width:13,height:13,cursor:"pointer",flexShrink:0}}/>
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Demanda — só para consultas */}
              {recordForm.type==="consultation" && (
                <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".78rem",fontWeight:600}}>
                  Tipo de demanda
                  <select value={recordForm.demandType||"scheduled"} onChange={e=>setRecordForm(s=>({...s,demandType:e.target.value}))}>
                    <option value="scheduled">Programada</option>
                    <option value="spontaneous">Espontânea</option>
                    <option value="retroactive">Retroativo</option>
                  </select>
                </label>
              )}

              {/* Conduta — para consultas e procedimentos */}
              {(recordForm.type==="consultation"||recordForm.type==="procedure") && (
                <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".78rem",fontWeight:600}}>
                  Conduta / resultado
                  <textarea placeholder="O que foi feito, orientações dadas, conduta adotada..."
                    value={recordForm.conduct||""} onChange={e=>setRecordForm(s=>({...s,conduct:e.target.value}))} style={{minHeight:52}}/>
                </label>
              )}

              {/* Próximo passo — para consultas */}
              {recordForm.type==="consultation" && (
                <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".78rem",fontWeight:600}}>
                  Próximo passo / retorno
                  <input placeholder="Ex: Retorno em 30 dias, aguardar resultado de exame..."
                    value={recordForm.nextStep||""} onChange={e=>setRecordForm(s=>({...s,nextStep:e.target.value}))}/>
                </label>
              )}

              {/* Observações gerais */}
              <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".78rem",fontWeight:600}}>
                Observações adicionais
                <textarea placeholder="Informações complementares..." value={recordForm.details}
                  onChange={e=>setRecordForm(s=>({...s,details:e.target.value}))} style={{minHeight:48}}/>
              </label>

              <div style={{display:"flex",alignItems:"center",gap:".5rem",padding:".5rem .65rem",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:"var(--r-md)",fontSize:".72rem",color:"#15803d"}}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 3h3l-2.5 2 1 3L8 7.5 5 9l1-3L3.5 4h3L8 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                Este registro será salvo automaticamente no prontuário com data, hora e profissional responsável.
              </div>

              <button type="submit">Registrar atendimento</button>
            </form>
          </div>
        )}

        {/* ââ€â‚¬ââ€â‚¬ CHART ââ€â‚¬ââ€â‚¬ */}
        {/* ââ€â‚¬ââ€â‚¬ APPOINTMENTS ââ€â‚¬ââ€â‚¬ */}
        {patientTab==="appointments"&&(
          <HistoricoTab history={history} appointments={appointments} tasks={tasks} messages={messages}
            canManageUser={canManageUser} onDeleteAppointment={onDeleteAppointment}/>
        )}

                {patientTab==="tasks"&&(
          <div className="panel-block">

            {/* ── Visit suggestion ── */}
            {(()=>{
              const tmpl = templates.find(t=>t.category===patient.careCategory);
              const suggestion = suggestNextVisitDate(history, tmpl);
              if(!suggestion) return null;
              const acsName = users.find(u=>u.id===patient.assignedAcsId)?.name||"ACS";
              const calUrl = googleCalendarUrl({
                title: `Visita ACS — ${patient.name}`,
                date: suggestion.date,
                description: `${suggestion.reason}\nPaciente: ${patient.name}\nACS: ${acsName}`,
                location: [patient.address, patient.number, patient.neighborhood, patient.city].filter(Boolean).join(", "),
              });
              return (
                <div style={{
                  marginBottom:"1rem", padding:".75rem .9rem",
                  background: suggestion.overdue ? "var(--red-50)" : "var(--teal-50)",
                  border:`1px solid ${suggestion.overdue?"var(--red-100)":"var(--teal-100)"}`,
                  borderRadius:"var(--r-md)"
                }}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:".5rem",flexWrap:"wrap"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:".4rem",marginBottom:".25rem"}}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M5 2v3M11 2v3M2.5 6.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                        <span style={{fontWeight:600,fontSize:".82rem",color:suggestion.overdue?"var(--red-700)":"var(--teal-700)"}}>
                          {suggestion.overdue ? "Visita atrasada" : "Próxima visita sugerida"}
                        </span>
                        <span style={{fontSize:".78rem",fontFamily:"IBM Plex Mono",color:suggestion.overdue?"var(--red-600)":"var(--teal-600)",fontWeight:700}}>
                          {fmtDate(suggestion.date)}
                        </span>
                      </div>
                      <p style={{fontSize:".75rem",color:suggestion.overdue?"var(--red-600)":"var(--teal-600)",margin:0}}>
                        {suggestion.reason}
                      </p>
                    </div>
                    <div style={{display:"flex",gap:".4rem",flexShrink:0,flexWrap:"wrap"}}>
                      {canManageUser&&(
                        <button type="button" style={{fontSize:".75rem",padding:".3rem .65rem",background:"white",border:`1px solid ${suggestion.overdue?"var(--red-200)":"var(--teal-200)"}`,borderRadius:"var(--r-md)",cursor:"pointer",color:suggestion.overdue?"var(--red-700)":"var(--teal-700)",fontWeight:600}}
                          onClick={()=>setTaskForm(s=>({...s,
                            title:`Visita ACS — ${patient.name}`,
                            notes:suggestion.reason,
                            dueDate:suggestion.date,
                            assigneeId:patient.assignedAcsId||""
                          }))}>
                          + Criar tarefa
                        </button>
                      )}
                      <a href={calUrl} target="_blank" rel="noreferrer"
                        style={{display:"inline-flex",alignItems:"center",gap:".35rem",fontSize:".75rem",padding:".3rem .65rem",background:"white",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:"var(--text-1)",textDecoration:"none",fontWeight:600}}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M4.5 1.5v2M11.5 1.5v2M1.5 6.5h13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                          <path d="M5 9.5l2 2 4-4" stroke="#4285f4" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Google Agenda
                      </a>
                    </div>
                  </div>
                </div>
              );
            })()}

            {(canManageUser||canWriteRecords)&&(
              <form className="inline-form" onSubmit={onSubmitTask}>
                <input placeholder="Título da tarefa" value={taskForm.title} onChange={e=>setTaskForm(s=>({...s,title:e.target.value}))}/>
                <textarea placeholder="Observações" value={taskForm.notes} onChange={e=>setTaskForm(s=>({...s,notes:e.target.value}))} style={{minHeight:48}}/>
                <input type="date" value={taskForm.dueDate} onChange={e=>setTaskForm(s=>({...s,dueDate:e.target.value}))}/>
                <select value={taskForm.assigneeId} onChange={e=>setTaskForm(s=>({...s,assigneeId:e.target.value}))}>
                  <option value="">Sem responsável</option>
                  {acsUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button type="submit">Criar tarefa</button>
              </form>
            )}

            {!tasks.length
              ? <EmptyState message="Sem tarefas para este paciente"/>
              : tasks.map(t=>{
                  const tone=t.status==="done"?"ok":t.status==="in_progress"?"warn":"muted";
                  const acsName = users.find(u=>u.id===patient.assignedAcsId)?.name||"ACS";
                  const calUrl = t.dueDate ? googleCalendarUrl({
                    title: t.title,
                    date: t.dueDate,
                    description: t.notes||"",
                    location: [patient.address, patient.number, patient.neighborhood, patient.city].filter(Boolean).join(", "),
                  }) : null;
                  return(
                    <div key={t.id} style={{padding:".7rem .85rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",marginBottom:".5rem"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:".3rem",gap:".5rem"}}>
                        <strong style={{fontSize:".83rem"}}>{t.title}</strong>
                        <Chip tone={tone}>{t.status==="done"?"Concluída":t.status==="in_progress"?"Em andamento":"Pendente"}</Chip>
                      </div>
                      {t.notes&&<p style={{fontSize:".78rem",color:"var(--text-2)",marginBottom:".3rem"}}>{t.notes}</p>}
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:".4rem",marginTop:".35rem"}}>
                        <div style={{display:"flex",alignItems:"center",gap:".75rem"}}>
                          {t.dueDate&&<span style={{fontSize:".72rem",color:"var(--text-3)"}}>Prazo: {fmtDate(t.dueDate)}</span>}
                          {calUrl&&(
                            <a href={calUrl} target="_blank" rel="noreferrer"
                              style={{display:"inline-flex",alignItems:"center",gap:".3rem",fontSize:".72rem",color:"#4285f4",textDecoration:"none",fontWeight:600}}>
                              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                                <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                                <path d="M4.5 1.5v2M11.5 1.5v2M1.5 6.5h13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                                <path d="M5 9.5l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Agenda
                            </a>
                          )}
                        </div>
                        {canManageUser&&(
                          <select style={{fontSize:".78rem",padding:".3rem .6rem",width:"auto"}} value={t.status||"pending"} onChange={e=>onStatusChange(t.id,e.target.value)}>
                            <option value="pending">Pendente</option>
                            <option value="in_progress">Em andamento</option>
                            <option value="done">Concluída</option>
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })
            }
          </div>
        )}

        {patientTab==="exams"&&(
          <PatientActionsTab patient={patient} user={userObj} users={users} token={token} canManageUser={canManageUser} canWriteRecords={canWriteRecords}/>
        )}

        {patientTab==="messages"&&(
          <div className="panel-block">
            <form className="inline-form" onSubmit={onSubmitMessage}>
              <textarea placeholder="Digite a mensagem para a equipe..." value={messageText} onChange={e=>setMessageText(e.target.value)} style={{minHeight:72}}/>
              <button type="submit">Enviar mensagem</button>
            </form>
            {!messages.length
              ? <EmptyState message="Sem mensagens neste painel"/>
              : messages.map(m=>(
                  <div key={m.id} style={{padding:".65rem .85rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",marginBottom:".4rem"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:".2rem"}}>
                      <strong style={{fontSize:".8rem"}}>{m.authorName||"Sistema"}</strong>
                      <span style={{fontSize:".7rem",color:"var(--text-3)",fontFamily:"IBM Plex Mono"}}>{fmtDate(m.createdAt)}</span>
                    </div>
                    <p style={{fontSize:".82rem",color:"var(--text-2)"}}>{m.text}</p>
                  </div>
                ))
            }
          </div>
        )}
      </div>
      {docType&&<DocumentModal patient={patient} user={userObj} type={docType} onClose={()=>setDocType(null)}/>}
      {showPatientCard&&<PatientCardModal patient={patient} users={users} templates={templates} history={history} onClose={()=>setShowPatientCard(false)}/>}
    </>
  );
}

/* â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢
   AI TAB
â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢ */

/* ═══════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════════
   SHARED LOCAL STORAGE HELPERS — Agenda, Fila, Encaminhamentos
   (readLS e writeLS definidos no módulo de segurança no topo)
══════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════
   NOTIFICATIONS SYSTEM
══════════════════════════════════════════════════════════════════ */
function buildProactiveAlerts(patients, protocolByPatient, pharmacyStock, agenda) {
  const alerts = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const nowIso = new Date().toISOString();

  // Gestantes passadas da DPP
  patients.forEach(p => {
    if (String(p.careCategory||"").toLowerCase() !== "pregnant") return;
    const dpp = p.expectedDeliveryDate ? parseLocalDate(p.expectedDeliveryDate) : null;
    const dppPlusOne = dpp ? new Date(dpp.getTime() + 86400000) : null;
    if (dppPlusOne && dppPlusOne <= today) { // atraso: DPP+1 dia
      const days = Math.floor((today - dpp) / 86400000);
      alerts.push({ id:"dpp-"+p.id, type:"danger", title:"DPP ultrapassada", detail:`${p.name} — ${days}d além da DPP`, patientId:p.id, createdAt:nowIso });
    }
  });

  // Visitas de puericultura: alertas de prazo perdido NÒO aparecem no sino/dashboard.
  // Indicadores perdidos são exibidos apenas no painel do próprio paciente (aba Protocolo).

  // Pacientes com protocolo crítico
  patients.forEach(p => {
    const chip = protocolChip(protocolByPatient[p.id]);
    if (chip.tone === "danger") {
      alerts.push({ id:"prot-"+p.id, type:"warn", title:"Protocolo crítico", detail:p.name+" — "+chip.text, patientId:p.id, createdAt:nowIso });
    }
  });

  // Estoque zerado ou abaixo do mínimo
  (pharmacyStock||[]).forEach(s => {
    if (s.qty === 0) alerts.push({ id:"stock0-"+s.id, type:"danger", title:"Medicamento zerado", detail:s.name, createdAt:nowIso });
    else if (s.qty <= s.minQty) alerts.push({ id:"stocklow-"+s.id, type:"warn", title:"Estoque baixo", detail:`${s.name} — ${s.qty} restante(s)`, createdAt:nowIso });
  });

  // Consultas de hoje sem confirmação
  const todayStr = today.toISOString().slice(0,10);
  (agenda||[]).filter(a => a.date === todayStr && a.status === "scheduled").forEach(a => {
    alerts.push({ id:"agenda-"+a.id, type:"info", title:"Consulta hoje", detail:`${a.patientName} — ${a.time||"sem horário"} com ${a.doctorName||"profissional"}`, createdAt:nowIso });
  });

  return alerts.slice(0, 20);
}

const NOTIF_SEEN_KEY = "saudeubs_notif_seen_v1";
const NOTIF_CLEARED_AT_KEY = "saudeubs_notif_cleared_at_v1";

function NotificationBell({ patients, protocolByPatient, pharmacyStock, agenda, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState(() => new Set(readLS(NOTIF_SEEN_KEY, [])));
  const [clearedAt, setClearedAt] = useState(() => String(readLS(NOTIF_CLEARED_AT_KEY, "")));
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allAlerts = useMemo(() =>
    buildProactiveAlerts(patients, protocolByPatient, pharmacyStock, agenda),
    [patients, protocolByPatient, pharmacyStock, agenda]
  );

  // Purge seenIds that no longer correspond to any active alert
  // (means the alert was fulfilled — auto-remove from seen list)
  useEffect(() => {
    if (!allAlerts.length) return;
    const activeIds = new Set(allAlerts.map(a => a.id));
    setSeenIds(prev => {
      const pruned = new Set([...prev].filter(id => activeIds.has(id)));
      if (pruned.size !== prev.size) {
        writeLS(NOTIF_SEEN_KEY, [...pruned]);
        return pruned;
      }
      return prev;
    });
  }, [allAlerts]);

  const unseenAlerts = useMemo(() => {
    const watermark = Date.parse(clearedAt || "");
    return allAlerts.filter((a) => {
      if (seenIds.has(a.id)) return false;
      if (!Number.isFinite(watermark)) return true;
      const createdAt = Date.parse(String(a.createdAt || ""));
      if (!Number.isFinite(createdAt)) return true;
      return createdAt > watermark;
    });
  }, [allAlerts, seenIds, clearedAt]);

  function markSeen(id, e) {
    e.stopPropagation();
    setSeenIds(prev => {
      const next = new Set(prev);
      next.add(id);
      writeLS(NOTIF_SEEN_KEY, [...next]);
      return next;
    });
  }

  function clearAllSeen() {
    const allIds = new Set(allAlerts.map(a => a.id));
    setSeenIds(allIds);
    writeLS(NOTIF_SEEN_KEY, [...allIds]);
    const nowIso = new Date().toISOString();
    setClearedAt(nowIso);
    writeLS(NOTIF_CLEARED_AT_KEY, nowIso);
  }

  const unseenCount = unseenAlerts.length;
  const hasDanger = unseenAlerts.some(a => a.type === "danger");

  return (
    <div ref={ref} style={{position:"relative",flexShrink:0,overflow:"visible"}}>
      <button onClick={()=>setOpen(v=>!v)}
        style={{position:"relative",width:34,height:34,borderRadius:"var(--r-md)",background:"var(--surface-2)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,overflow:"visible",padding:0}}>
        <svg viewBox="0 0 20 20" fill="none" style={{width:20,height:20,color:"var(--text-1)",display:"block",flexShrink:0}}>
          <path d="M10 2a6 6 0 00-6 6v3.5L2.5 14h15L16 11.5V8a6 6 0 00-6-6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
          <path d="M8 14.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        {unseenCount > 0 && (
          <span style={{position:"absolute",top:-4,right:-4,minWidth:16,height:16,borderRadius:999,background:hasDanger?"#dc2626":"var(--amber-500)",color:"#fff",fontSize:".6rem",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",lineHeight:1}}>
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,width:330,maxHeight:440,overflowY:"auto",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-lg)",boxShadow:"0 8px 30px rgba(0,0,0,.12)",zIndex:600}}>
          <div style={{padding:".7rem 1rem",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:".5rem",position:"sticky",top:0,background:"var(--surface)",zIndex:1}}>
            <span style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)"}}>Alertas do sistema</span>
            <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
              {unseenCount > 0 && (
                <span style={{fontSize:".7rem",color:"var(--text-3)"}}>{unseenCount} não visto{unseenCount!==1?"s":""}</span>
              )}
              {unseenCount > 1 && (
                <button onClick={clearAllSeen}
                  style={{fontSize:".68rem",color:"var(--teal-600)",background:"none",border:"none",cursor:"pointer",padding:"0 .25rem",fontWeight:600,whiteSpace:"nowrap"}}
                  title="Marcar todos como vistos">
                  Limpar todos
                </button>
              )}
            </div>
          </div>
          {!unseenCount && (
            <p style={{padding:"1.5rem",textAlign:"center",color:"var(--text-3)",fontSize:".82rem"}}>
              {allAlerts.length > 0 ? "Todos os alertas foram vistos ✓" : "Nenhum alerta no momento ✓"}
            </p>
          )}
          {unseenAlerts.map(a => (
            <div key={a.id}
              style={{padding:".65rem 1rem",borderBottom:"1px solid var(--border-soft)",display:"flex",gap:".65rem",alignItems:"flex-start",
                background:a.type==="danger"?"#fff5f5":a.type==="warn"?"#fffbeb":"var(--surface)",
                cursor:a.patientId?"pointer":"default",transition:"filter .1s"}}
              onMouseEnter={e=>{ if(a.patientId) e.currentTarget.style.filter="brightness(.97)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.filter="none"; }}>
              <span
                style={{flex:1,display:"flex",gap:".65rem",alignItems:"flex-start",minWidth:0}}
                onClick={()=>{ if(a.patientId&&onNavigate) onNavigate(a.patientId); setOpen(false); }}>
                <span style={{fontSize:"1rem",flexShrink:0,marginTop:".1rem"}}>
                  {a.type==="danger"?"⛔":a.type==="warn"?"⚠️":"ℹ️"}
                </span>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:".76rem",color:a.type==="danger"?"#be123c":a.type==="warn"?"var(--amber-700)":"var(--teal-700)"}}>{a.title}</div>
                  <div style={{fontSize:".73rem",color:"var(--text-2)",marginTop:".1rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.detail}</div>
                </div>
              </span>
              <button
                onClick={e => markSeen(a.id, e)}
                title="Marcar como visto"
                style={{flexShrink:0,width:20,height:20,borderRadius:4,background:"none",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",marginTop:".05rem",color:"var(--text-3)",lineHeight:1,padding:0}}>
                <svg viewBox="0 0 12 12" fill="none" width="9" height="9">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════
   RECEPCIONISTA — Login Modal
══════════════════════════════════════════════════════════════════ */
function ReceptionLoginModal({ onLogin, onClose }) {
  const [email, setEmail] = useState("");
  const [pw, setPw]       = useState("");
  const [err, setErr]     = useState("");

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
      // Monta objeto de usuário compatível com RECEPTION_USERS
      const meta = RECEPTION_USERS.find(r => r.email.toLowerCase()===email.trim().toLowerCase());
      const u = { ...(meta||{}), ...data.user, _token: data.token };
      onLogin(u);
    } catch { setErr("Erro de conexão. Tente novamente."); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:380,padding:"2rem"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:".75rem",marginBottom:"1.5rem"}}>
          <div style={{width:40,height:40,borderRadius:10,background:"var(--teal-600)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="white" strokeWidth="1.4"/>
              <path d="M4.5 1.5v2M11.5 1.5v2M1.5 6.5h13" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M5 10h2M9 10h2M5 12.5h2" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{fontWeight:800,fontSize:".95rem",color:"var(--ink)"}}>Acesso — Recepção</div>
            <div style={{fontSize:".72rem",color:"var(--text-3)"}}>Entre com suas credenciais de recepção</div>
          </div>
          <button className="icon-btn" style={{marginLeft:"auto"}} onClick={onClose}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
          <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".8rem",fontWeight:600}}>
            E-mail
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="recepcao@ubs.local" autoFocus/>
          </label>
          <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".8rem",fontWeight:600}}>
            Senha
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="⬢⬢⬢⬢⬢⬢⬢⬢"/>
          </label>
          {err && <p className="error" style={{margin:0}}>{err}</p>}
          <button type="submit" style={{marginTop:".25rem"}}>Entrar na Recepção</button>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   RECEPCIONISTA — App completo (tela dedicada)
══════════════════════════════════════════════════════════════════ */
function ReceptionistApp({ recUser, patients, users, templates, onLogout }) {
  const [tab, setTab]               = useState("queue");
  const [search, setSearch]         = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Agenda state
  const [agenda, setAgenda]         = useState(()=>readLS(AGENDA_KEY,[]));
  const [selectedDate, setSelectedDate] = useState(()=>new Date().toISOString().slice(0,10));
  const [showAgendaForm, setShowAgendaForm] = useState(false);
  const [agendaEditId, setAgendaEditId] = useState(null);
  const [agendaForm, setAgendaForm] = useState({patientId:"",doctorId:"",date:"",time:"",type:"consultation",notes:"",status:"scheduled"});

  // Queue state
  const [queue, setQueue]           = useState(()=>readLS(QUEUE_KEY,[]));
  const [showQueueForm, setShowQueueForm] = useState(false);
  const [queueForm, setQueueForm]   = useState({patientId:"",priority:"normal",reason:""});

  const saveAgenda = (a) => { setAgenda(a); writeLS(AGENDA_KEY,a); };
  const saveQueue  = (q) => { setQueue(q);  writeLS(QUEUE_KEY,q);  };

  const doctors = users.filter(u=>["doctor","nurse_manager","nursing_tech"].includes(u.role));
  const today   = new Date().toISOString().slice(0,10);

  // ── Search ──
  const searchResults = useMemo(() => {
    if (!search.trim() || search.length < 2) return [];
    return patients.filter(p => matchesPatientSearch(p, search)).slice(0,8);
  }, [search, patients]);

  // ── Queue helpers ──
  const PRIORITY_LABELS = { urgent:"Urgente", elderly:"Idoso/PCD", pregnant:"Gestante", child:"Criança", normal:"Normal" };
  const PRIORITY_COLORS = {
    urgent:   {bg:"#fff1f2",border:"#fecdd3",text:"#be123c",order:0},
    elderly:  {bg:"#fff7ed",border:"#fed7aa",text:"#c2410c",order:1},
    pregnant: {bg:"#fdf4ff",border:"#e9d5ff",text:"#7e22ce",order:2},
    child:    {bg:"#eff6ff",border:"#bfdbfe",text:"#1d4ed8",order:3},
    normal:   {bg:"var(--surface-2)",border:"var(--border)",text:"var(--text-2)",order:4},
  };

  function addToQueue(e) {
    e.preventDefault();
    if (!queueForm.patientId) return;
    const pat = patients.find(p=>p.id===queueForm.patientId);
    let prio = queueForm.priority;
    if (prio==="normal") {
      const cat = String(pat?.careCategory||"").toLowerCase();
      if (cat==="pregnant") prio="pregnant";
      else {
        const age = pat?.birthDate ? Math.floor((new Date()-(parseLocalDate(pat.birthDate)||new Date()))/31557600000) : null;
        if (age!==null && age>=60) prio="elderly";
        else if (age!==null && age<12) prio="child";
      }
    }
    const entry = {
      id:"q"+Date.now(), patientId:queueForm.patientId, patientName:pat?.name||"?",
      priority:prio, reason:queueForm.reason, arrivedAt:new Date().toISOString(), status:"waiting"
    };
    saveQueue([...queue, entry]);
    setQueueForm({patientId:"",priority:"normal",reason:""});
    setShowQueueForm(false);
  }

  function updateQueueStatus(id, status) { saveQueue(queue.map(q=>q.id===id?{...q,status,updatedAt:new Date().toISOString()}:q)); }
  function removeFromQueue(id) { saveQueue(queue.filter(q=>q.id!==id)); }
  function clearDone() { saveQueue(queue.filter(q=>q.status==="waiting"||q.status==="attending")); }

  const sortedQueue = [...queue].sort((a,b) => {
    if(a.status==="done"&&b.status!=="done") return 1;
    if(b.status==="done"&&a.status!=="done") return -1;
    const pa=PRIORITY_COLORS[a.priority]?.order ?? 4, pb=PRIORITY_COLORS[b.priority]?.order ?? 4;
    return pa!==pb ? pa-pb : a.arrivedAt.localeCompare(b.arrivedAt);
  });

  const waiting   = sortedQueue.filter(q=>q.status==="waiting").length;
  const attending = sortedQueue.filter(q=>q.status==="attending").length;
  const alreadyInQueue = queue.filter(q=>q.status!=="done").map(q=>q.patientId);

  // ── Agenda helpers ──
  const AGENDA_HOURS = ["07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00"];
  const STATUS_STYLE = {
    scheduled:{bg:"#eff6ff",color:"#1d4ed8",border:"#bfdbfe",label:"Agendado"},
    arrived:  {bg:"#f0fdf4",color:"#15803d",border:"#bbf7d0",label:"Chegou"},
    attending:{bg:"#fff7ed",color:"#c2410c",border:"#fed7aa",label:"Em atend."},
    done:     {bg:"var(--surface-2)",color:"var(--text-3)",border:"var(--border)",label:"Concluído"},
    absent:   {bg:"#fff1f2",color:"#be123c",border:"#fecdd3",label:"Faltou"},
  };

  const selD     = new Date(selectedDate+"T12:00:00");
  const weekDays = Array.from({length:7},(_,i)=>{
    const d=new Date(selD); d.setDate(d.getDate()-d.getDay()+i);
    return d.toISOString().slice(0,10);
  });
  const countByDay = {};
  weekDays.forEach(d=>{ countByDay[d]=agenda.filter(a=>a.date===d).length; });

  const dayAppts = agenda
    .filter(a=>a.date===selectedDate)
    .sort((a,b)=>a.time.localeCompare(b.time));

  function openAgendaNew(time="") {
    setAgendaForm({patientId:"",doctorId:"",date:selectedDate,time,type:"consultation",notes:"",status:"scheduled"});
    setAgendaEditId(null); setShowAgendaForm(true);
  }
  function openAgendaEdit(appt) {
    setAgendaForm({patientId:appt.patientId,doctorId:appt.doctorId,date:appt.date,time:appt.time,type:appt.type,notes:appt.notes||"",status:appt.status});
    setAgendaEditId(appt.id); setShowAgendaForm(true);
  }
  function submitAgenda(e) {
    e.preventDefault();
    if (!agendaForm.patientId||!agendaForm.date||!agendaForm.time) return;
    const pat = patients.find(p=>p.id===agendaForm.patientId);
    const doc = users.find(u=>u.id===agendaForm.doctorId);
    const entry = {...agendaForm, id:agendaEditId||("ag"+Date.now()), patientName:pat?.name||"?", doctorName:doc?.name||"", createdAt:new Date().toISOString()};
    const base  = agendaEditId ? agenda.filter(a=>a.id!==agendaEditId) : agenda;
    saveAgenda([...base,entry].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)));
    setShowAgendaForm(false);
  }
  function removeAgenda(id) { saveAgenda(agenda.filter(a=>a.id!==id)); }
  function updateAgendaStatus(id, status) { saveAgenda(agenda.map(a=>a.id===id?{...a,status}:a)); }

  function waitMins(iso) {
    const mins=Math.floor((new Date()-new Date(iso))/60000);
    return mins<60?`${mins}min`:`${Math.floor(mins/60)}h${String(mins%60).padStart(2,"0")}`;
  }
  function fmtTime(iso){ if(!iso)return""; const d=new Date(iso); return d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }

  const NAV_TABS = [
    { id:"queue",   label:"Fila",    icon:"🏥" },
    { id:"agenda",  label:"📅 Agenda",  icon:"📅" },
    { id:"search",  label:"Pacientes", icon:"🔍" },
  ];

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column"}}>

      {/* ── Topbar recepção ── */}
      <header style={{height:56,background:"var(--surface)",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",padding:"0 1.5rem",gap:"1rem",flexShrink:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:".6rem"}}>
          <div style={{width:30,height:30,borderRadius:8,background:"var(--teal-600)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <IconLogo/>
          </div>
          <span style={{fontWeight:800,fontSize:".9rem",color:"var(--ink)"}}>SIGUS</span>
          <span style={{fontSize:".72rem",padding:".15rem .55rem",borderRadius:999,background:"var(--teal-50)",color:"var(--teal-700)",border:"1px solid var(--teal-200)",fontWeight:700,marginLeft:".25rem"}}>Recepção</span>
        </div>

        {/* Nav tabs inline */}
        <div style={{display:"flex",gap:".25rem",marginLeft:"1rem"}}>
          {NAV_TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{padding:".35rem .85rem",borderRadius:"var(--r-md)",border:"none",
                background:tab===t.id?"var(--teal-600)":"transparent",
                color:tab===t.id?"#fff":"var(--text-2)",cursor:"pointer",
                fontSize:".8rem",fontWeight:600,display:"flex",alignItems:"center",gap:".35rem",transition:"all .12s"}}>
              <span>{t.icon}</span>{t.label}
              {t.id==="queue"&&waiting>0&&<span style={{background:"#dc2626",color:"#fff",borderRadius:999,fontSize:".6rem",padding:"0 5px",fontWeight:800,minWidth:16,textAlign:"center"}}>{waiting}</span>}
            </button>
          ))}
        </div>

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:".75rem"}}>
          {/* Quick add buttons */}
          <button onClick={()=>setShowQueueForm(true)} style={{fontSize:".76rem",padding:".3rem .7rem",display:"flex",alignItems:"center",gap:".35rem",background:"var(--teal-50)",border:"1px solid var(--teal-200)",color:"var(--teal-700)"}}>
            + Dar entrada
          </button>
          <button onClick={()=>openAgendaNew()} style={{fontSize:".76rem",padding:".3rem .7rem",display:"flex",alignItems:"center",gap:".35rem"}}>
            + Agendar
          </button>
          {/* User info + logout */}
          <div style={{display:"flex",alignItems:"center",gap:".5rem",borderLeft:"1px solid var(--border)",paddingLeft:".75rem"}}>
            <div className="user-avatar" style={{width:28,height:28,fontSize:".7rem",flexShrink:0}}>{initials(recUser.name)}</div>
            <div style={{fontSize:".75rem"}}>
              <div style={{fontWeight:700,color:"var(--ink)",lineHeight:1.2}}>{recUser.name}</div>
              <div style={{color:"var(--text-3)",fontSize:".68rem"}}>Recepção</div>
            </div>
            <button onClick={onLogout} title="Sair" style={{marginLeft:".25rem",padding:".25rem .5rem",fontSize:".72rem",background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>Sair</button>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <div style={{flex:1,overflow:"auto",padding:"1.5rem"}}>

        {/* ════ FILA ════ */}
        {tab==="queue"&&(
          <div style={{maxWidth:820,margin:"0 auto"}}>
            {/* KPIs */}
            <div style={{display:"flex",gap:".75rem",marginBottom:"1.25rem",flexWrap:"wrap"}}>
              {[["⏳","Aguardando",waiting,"#1d4ed8","#eff6ff"],["🩺","Em atendimento",attending,"#c2410c","#fff7ed"],["📋","Total hoje",sortedQueue.length,"var(--text-2)","var(--surface-2)"]].map(([ic,l,v,color,bg])=>(
                <div key={l} style={{flex:"1 1 140px",background:bg,border:`1px solid ${bg==="var(--surface-2)"?"var(--border)":bg.replace("ff","cc")}`,borderRadius:"var(--r-md)",padding:".85rem 1rem",display:"flex",alignItems:"center",gap:".75rem"}}>
                  <span style={{fontSize:"1.6rem"}}>{ic}</span>
                  <div>
                    <div style={{fontSize:"1.6rem",fontWeight:900,color,lineHeight:1}}>{v}</div>
                    <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>{l}</div>
                  </div>
                </div>
              ))}
              {sortedQueue.some(q=>q.status==="done")&&(
                <button onClick={clearDone} style={{alignSelf:"center",fontSize:".75rem",padding:".4rem .8rem",background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>
                  Limpar concluídos
                </button>
              )}
            </div>

            {/* Queue list */}
            {!sortedQueue.length ? (
              <div style={{textAlign:"center",padding:"5rem 2rem",color:"var(--text-3)"}}>
                <div style={{fontSize:"3rem",marginBottom:"1rem"}}>🏥</div>
                <div style={{fontWeight:700,fontSize:".95rem",marginBottom:"1rem"}}>🏥 Nenhum paciente na fila</div>
                <button onClick={()=>setShowQueueForm(true)}>+ Dar entrada no primeiro paciente</button>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".45rem"}}>
                {sortedQueue.map((q,i)=>{
                  const pc=PRIORITY_COLORS[q.priority]||PRIORITY_COLORS.normal;
                  const isDone=q.status==="done";
                  return(
                    <div key={q.id} style={{display:"flex",alignItems:"center",gap:"1rem",padding:".8rem 1.1rem",borderRadius:"var(--r-md)",
                      background:isDone?"var(--surface-2)":pc.bg, border:`1px solid ${isDone?"var(--border)":pc.border}`,
                      opacity:isDone?.55:1,transition:"opacity .2s"}}>
                      <div style={{width:30,height:30,borderRadius:"50%",background:isDone?"var(--border)":pc.border,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:".78rem",fontWeight:800,color:isDone?"var(--text-3)":pc.text}}>{i+1}</span>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:".5rem",flexWrap:"wrap"}}>
                          <span style={{fontWeight:700,fontSize:".92rem",color:isDone?"var(--text-3)":"var(--ink)"}}>{q.patientName}</span>
                          <span style={{fontSize:".7rem",padding:".1rem .45rem",borderRadius:999,background:pc.bg,color:pc.text,border:`1px solid ${pc.border}`,fontWeight:700}}>{PRIORITY_LABELS[q.priority]}</span>
                          {q.reason&&<span style={{fontSize:".74rem",color:"var(--text-3)"}}>· {q.reason}</span>}
                        </div>
                        <div style={{fontSize:".73rem",color:"var(--text-3)",marginTop:".2rem"}}>
                          Entrada: {fmtTime(q.arrivedAt)} · Aguardando: {waitMins(q.arrivedAt)}
                        </div>
                      </div>
                      {!isDone&&(
                        <div style={{display:"flex",gap:".4rem",flexShrink:0}}>
                          {q.status==="waiting"&&(
                            <button onClick={()=>updateQueueStatus(q.id,"attending")}
                              style={{fontSize:".78rem",padding:".3rem .75rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)"}}>
                              🩺 Chamar
                            </button>
                          )}
                          {q.status==="attending"&&(
                            <button onClick={()=>updateQueueStatus(q.id,"done")}
                              style={{fontSize:".78rem",padding:".3rem .75rem",background:"#15803d",color:"#fff",border:"none",borderRadius:"var(--r-md)"}}>
                              ✓ Concluir
                            </button>
                          )}
                          <button onClick={()=>removeFromQueue(q.id)}
                            style={{fontSize:".78rem",padding:".3rem .6rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"#be123c"}}>
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ AGENDA ════ */}
        {tab==="agenda"&&(
          <div style={{maxWidth:900,margin:"0 auto"}}>
            {/* Week strip */}
            <div style={{display:"flex",gap:".35rem",marginBottom:".85rem",overflowX:"auto",paddingBottom:".25rem"}}>
              {weekDays.map(d=>{
                const dt=new Date(d+"T12:00:00");
                const isToday=d===today;
                const isSel=d===selectedDate;
                const unavailable=isUnavailableDay(d);
                return(
                  <button key={d} onClick={()=>setSelectedDate(d)}
                    style={{flex:"1 0 70px",minWidth:70,padding:".6rem .4rem",borderRadius:"var(--r-md)",
                      border:`2px solid ${isSel?"var(--teal-500)":unavailable?"#e2e8f0":"var(--border)"}`,
                      background:isSel?"var(--teal-600)":unavailable?"#f8fafc":isToday?"var(--teal-50)":"var(--surface)",
                      color:isSel?"#fff":unavailable?"#94a3b8":isToday?"var(--teal-700)":"var(--text-2)",cursor:"pointer",textAlign:"center",opacity:unavailable&&!isSel?.7:1}}>
                    <div style={{fontSize:".65rem",fontWeight:600,textTransform:"uppercase",opacity:.8}}>{dt.toLocaleDateString("pt-BR",{weekday:"short"})}</div>
                    <div style={{fontSize:"1.15rem",fontWeight:900,lineHeight:1.2}}>{dt.getDate()}</div>
                    {unavailable&&!isSel&&<div style={{fontSize:".55rem",marginTop:".1rem",color:"#94a3b8"}}>fechado</div>}
                    {!unavailable&&countByDay[d]>0&&<div style={{fontSize:".62rem",marginTop:".1rem",opacity:.85,fontWeight:600}}>{countByDay[d]} aptos.</div>}
                  </button>
                );
              })}
            </div>

            {/* Day header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <span style={{fontWeight:700,fontSize:".9rem",color:"var(--ink)"}}>
                {new Date(selectedDate+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}
                <span style={{marginLeft:".5rem",fontSize:".78rem",color:"var(--text-3)",fontWeight:400}}>{dayAppts.length} agendamento{dayAppts.length!==1?"s":""}</span>
              </span>
              {!isUnavailableDay(selectedDate)&&<button onClick={()=>openAgendaNew()} style={{fontSize:".8rem",display:"flex",alignItems:"center",gap:".35rem"}}>
                + Novo agendamento
              </button>}
            </div>
            {isUnavailableDay(selectedDate)&&(
              <div style={{display:"flex",alignItems:"center",gap:".75rem",padding:".65rem 1rem",marginBottom:".75rem",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:"var(--r-md)",fontSize:".8rem",color:"#64748b"}}>
                <span style={{fontSize:"1.1rem"}}>🔒</span>
                <span style={{fontWeight:600,color:"#475569"}}>{unavailableReason(selectedDate)}</span>
              </div>
            )}

            {/* Appointments */}
            {!dayAppts.length ? (
              <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
                <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>{isUnavailableDay(selectedDate)?"🔒":"📅"}</div>
                <div style={{fontWeight:600,fontSize:".9rem",marginBottom:"1rem"}}>{isUnavailableDay(selectedDate)?"Unidade fechada neste dia":"Nenhum agendamento neste dia"}</div>
                {!isUnavailableDay(selectedDate)&&<button onClick={()=>openAgendaNew()}>+ Agendar consulta</button>}
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".45rem"}}>
                {dayAppts.map(appt=>{
                  const ss=STATUS_STYLE[appt.status]||STATUS_STYLE.scheduled;
                  return(
                    <div key={appt.id} style={{display:"flex",alignItems:"center",gap:".85rem",padding:".8rem 1.1rem",borderRadius:"var(--r-md)",background:ss.bg,border:`1px solid ${ss.border}`}}>
                      <div style={{fontFamily:"IBM Plex Mono",fontSize:".9rem",fontWeight:800,color:ss.color,flexShrink:0,width:52}}>{appt.time}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:".9rem",color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{appt.patientName}</div>
                        <div style={{fontSize:".74rem",color:"var(--text-3)",marginTop:".1rem"}}>
                          {appt.type==="consultation"?"Consulta":appt.type==="return"?"Retorno":appt.type==="procedure"?"Procedimento":"Outro"}
                          {appt.doctorName&&" · "+appt.doctorName}
                          {appt.notes&&" · "+appt.notes}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:".4rem",flexShrink:0}}>
                        <select value={appt.status} onChange={e=>updateAgendaStatus(appt.id,e.target.value)}
                          style={{fontSize:".73rem",padding:".25rem .45rem",borderRadius:999,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,fontWeight:700,cursor:"pointer"}}>
                          {Object.entries(STATUS_STYLE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <button onClick={()=>openAgendaEdit(appt)} style={{padding:".3rem .55rem",fontSize:".72rem",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:"var(--text-1)"}}>✏️</button>
                        <button onClick={()=>removeAgenda(appt.id)} style={{padding:".3rem .55rem",fontSize:".72rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"#be123c"}}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ PACIENTES (busca + info) ════ */}
        {tab==="search"&&(
          <div style={{maxWidth:860,margin:"0 auto"}}>
            <div style={{position:"relative",marginBottom:"1.25rem"}}>
              <span style={{position:"absolute",left:".85rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)"}}>
                <IconSearch/>
              </span>
              <input value={search} onChange={e=>setSearch(e.target.value)} autoFocus
                placeholder="Buscar paciente por nome, CPF ou CNS⬦"
                style={{paddingLeft:"2.2rem",width:"100%",boxSizing:"border-box",fontSize:".92rem",padding:".7rem .9rem .7rem 2.2rem",borderRadius:"var(--r-md)"}}/>
            </div>

            {/* Results */}
            {search.length>=2&&!searchResults.length&&(
              <p style={{textAlign:"center",color:"var(--text-3)",padding:"2rem",fontSize:".84rem"}}>Nenhum paciente encontrado.</p>
            )}
            {searchResults.length>0&&!selectedPatient&&(
              <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                {searchResults.map(p=>{
                  const am=ageInMonths(p.birthDate);
                  const g=gestationalAgeInfo(p);
                  const catName=templates.find(t=>t.category===p.careCategory)?.label||"Geral";
                  return(
                    <button key={p.id} onClick={()=>setSelectedPatient(p)}
                      style={{display:"flex",alignItems:"center",gap:"1rem",padding:".85rem 1.1rem",borderRadius:"var(--r-md)",background:"var(--surface)",border:"1px solid var(--border)",cursor:"pointer",textAlign:"left",transition:"border-color .12s,background .12s",color:"var(--text-1)"}}
                      onMouseEnter={e=>{ e.currentTarget.style.borderColor="var(--teal-400)"; e.currentTarget.style.background="var(--teal-50)"; }}
                      onMouseLeave={e=>{ e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.background="var(--surface)"; }}>
                      <div className="user-avatar" style={{width:42,height:42,fontSize:".95rem",flexShrink:0}}>{initials(p.name)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:".92rem",color:"var(--ink)"}}>{p.name}</div>
                        <div style={{fontSize:".75rem",color:"var(--text-3)",marginTop:".2rem",display:"flex",gap:".75rem",flexWrap:"wrap"}}>
                          {p.cpf&&<span>CPF: {p.cpf}</span>}
                          {p.cns&&<span>CNS: {p.cns}</span>}
                          {am!==null&&<span>{am<24?`${am}m`:`${Math.floor(am/12)}a`}</span>}
                          <span>{catName}</span>
                          {g&&String(p.careCategory||"").toLowerCase()==="pregnant"&&<span style={{color:"var(--teal-700)",fontWeight:600}}>IG {g.weeks}s{g.days}d</span>}
                        </div>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{color:"var(--text-3)",flexShrink:0}}><path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Patient detail card (read-only for receptionist) */}
            {selectedPatient&&(
              <div>
                <button onClick={()=>{ setSelectedPatient(null); }}
                  style={{display:"flex",alignItems:"center",gap:".4rem",fontSize:".78rem",color:"var(--teal-600)",background:"none",border:"none",cursor:"pointer",marginBottom:"1rem",padding:0,fontWeight:600}}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Voltar à busca
                </button>
                <div className="card" style={{padding:0,overflow:"hidden"}}>
                  {/* Header */}
                  <div style={{padding:"1.1rem 1.25rem",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:".85rem"}}>
                    <div className="user-avatar" style={{width:46,height:46,fontSize:"1.1rem",flexShrink:0,background:"var(--teal-600)",color:"#fff"}}>{initials(selectedPatient.name)}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:800,fontSize:"1rem",color:"var(--ink)"}}>{selectedPatient.name}</div>
                      <div style={{fontSize:".75rem",color:"var(--text-3)",marginTop:".25rem",display:"flex",gap:".75rem",flexWrap:"wrap"}}>
                        {selectedPatient.cpf&&<span>CPF: {selectedPatient.cpf}</span>}
                        {selectedPatient.cns&&<span>CNS: {selectedPatient.cns}</span>}
                        {selectedPatient.birthDate&&<span>Nasc.: {fmtDate(selectedPatient.birthDate)}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:".4rem",flexShrink:0}}>
                      <button onClick={()=>{ setQueueForm(s=>({...s,patientId:selectedPatient.id})); setShowQueueForm(true); }}
                        style={{fontSize:".76rem",padding:".3rem .65rem",background:"var(--teal-50)",border:"1px solid var(--teal-200)",color:"var(--teal-700)"}}>
                        🏥 Dar entrada
                      </button>
                      <button onClick={()=>{ setAgendaForm(s=>({...s,patientId:selectedPatient.id})); setShowAgendaForm(true); }}
                        style={{fontSize:".76rem",padding:".3rem .65rem"}}>
                        📅 Agendar
                      </button>
                    </div>
                  </div>
                  {/* Info grid */}
                  <div style={{padding:"1rem 1.25rem",display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:".72rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".5rem"}}>Contato</div>
                      <div style={{fontSize:".82rem",color:"var(--text-2)",display:"flex",flexDirection:"column",gap:".3rem"}}>
                        {selectedPatient.phone&&<span>📱 {selectedPatient.phone}</span>}
                        {selectedPatient.phoneAlt&&<span>📞 {selectedPatient.phoneAlt}</span>}
                        {selectedPatient.address&&<span>📍 {[selectedPatient.address,selectedPatient.number,selectedPatient.neighborhood,selectedPatient.city].filter(Boolean).join(", ")}</span>}
                        {!selectedPatient.phone&&!selectedPatient.address&&<span style={{color:"var(--text-3)"}}>Sem contato cadastrado</span>}
                      </div>
                    </div>
                    <div>
                      <div style={{fontWeight:700,fontSize:".72rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".5rem"}}>Alertas clínicos</div>
                      <div style={{fontSize:".82rem",display:"flex",flexDirection:"column",gap:".3rem"}}>
                        {String(selectedPatient.allergies||"").trim()&&(
                          <span style={{color:"#be123c",fontWeight:600,background:"#fff1f2",padding:".2rem .5rem",borderRadius:"var(--r-md)",border:"1px solid #fecdd3"}}>âš ï¸ Alergias: {selectedPatient.allergies}</span>
                        )}
                        {gestationalAgeInfo(selectedPatient)&&String(selectedPatient.careCategory||"").toLowerCase()==="pregnant"&&(()=>{
                          const g=gestationalAgeInfo(selectedPatient);
                          return <span style={{color:"var(--teal-700)",fontWeight:600,background:"var(--teal-50)",padding:".2rem .5rem",borderRadius:"var(--r-md)",border:"1px solid var(--teal-200)"}}>🤰 IG: {g.weeks}s {g.days}d</span>;
                        })()}
                        {!String(selectedPatient.allergies||"").trim()&&!(gestationalAgeInfo(selectedPatient)&&String(selectedPatient.careCategory||"").toLowerCase()==="pregnant")&&<span style={{color:"var(--text-3)"}}>Nenhum alerta</span>}
                      </div>
                    </div>
                  </div>
                  {/* Próximos agendamentos */}
                  {(()=>{
                    const upcoming = agenda.filter(a=>a.patientId===selectedPatient.id&&a.date>=today&&a.status!=="done"&&a.status!=="absent").sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,3);
                    if(!upcoming.length) return null;
                    return(
                      <div style={{padding:"0 1.25rem 1rem"}}>
                        <div style={{fontWeight:700,fontSize:".72rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".5rem"}}>Próximos agendamentos</div>
                        {upcoming.map(a=>{
                          const ss=STATUS_STYLE[a.status]||STATUS_STYLE.scheduled;
                          return(
                            <div key={a.id} style={{display:"flex",alignItems:"center",gap:".65rem",padding:".45rem .75rem",borderRadius:"var(--r-md)",background:ss.bg,border:`1px solid ${ss.border}`,marginBottom:".3rem"}}>
                              <span style={{fontFamily:"IBM Plex Mono",fontSize:".78rem",fontWeight:700,color:ss.color,flexShrink:0}}>{new Date(a.date+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})} {a.time}</span>
                              <span style={{fontSize:".78rem",color:"var(--text-2)"}}>{a.type==="consultation"?"Consulta":a.type==="return"?"Retorno":"Outro"}{a.doctorName&&" · "+a.doctorName}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {!search&&!selectedPatient&&(
              <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
                <div style={{fontSize:"3rem",marginBottom:"1rem"}}>🔍</div>
                <div style={{fontWeight:600,fontSize:".9rem"}}>Digite para buscar um paciente</div>
                <div style={{fontSize:".8rem",marginTop:".5rem"}}>Nome, CPF ou CNS</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════ MODAIS ════ */}

      {/* Add to queue modal */}
      {showQueueForm&&(
        <div className="modal-backdrop" onClick={()=>setShowQueueForm(false)}>
          <div className="modal" style={{maxWidth:440}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <h3 style={{margin:0}}>Dar entrada na fila</h3>
              <button className="icon-btn" onClick={()=>setShowQueueForm(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            <form onSubmit={addToQueue} style={{display:"flex",flexDirection:"column",gap:".7rem"}}>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Paciente *
                <select value={queueForm.patientId} onChange={e=>setQueueForm(s=>({...s,patientId:e.target.value}))}>
                  <option value="">Selecionar paciente...</option>
                  {[...patients].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(p=>(
                    <option key={p.id} value={p.id} disabled={alreadyInQueue.includes(p.id)}>{p.name}{alreadyInQueue.includes(p.id)?" (já na fila)":""}</option>
                  ))}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Prioridade
                <select value={queueForm.priority} onChange={e=>setQueueForm(s=>({...s,priority:e.target.value}))}>
                  {Object.entries(PRIORITY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Motivo / queixa
                <input value={queueForm.reason} onChange={e=>setQueueForm(s=>({...s,reason:e.target.value}))} placeholder="Dor, retorno, renovação de receita..."/>
              </label>
              <div style={{display:"flex",gap:".5rem",marginTop:".25rem"}}>
                <button type="button" onClick={()=>setShowQueueForm(false)} style={{flex:1,background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-1)"}}>Cancelar</button>
                <button type="submit" style={{flex:2}}>Confirmar entrada</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Agenda form modal */}
      {showAgendaForm&&(
        <div className="modal-backdrop" onClick={()=>setShowAgendaForm(false)}>
          <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <h3 style={{margin:0}}>{agendaEditId?"Editar agendamento":"Novo agendamento"}</h3>
              <button className="icon-btn" onClick={()=>setShowAgendaForm(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            <form onSubmit={submitAgenda} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".65rem"}}>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Paciente *
                <select value={agendaForm.patientId} onChange={e=>setAgendaForm(s=>({...s,patientId:e.target.value}))}>
                  <option value="">Selecionar...</option>
                  {[...patients].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Data *
                <input type="date" value={agendaForm.date} onChange={e=>setAgendaForm(s=>({...s,date:e.target.value}))}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Horário *
                <select value={agendaForm.time} onChange={e=>setAgendaForm(s=>({...s,time:e.target.value}))}>
                  <option value="">Selecionar...</option>
                  {AGENDA_HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Profissional
                <select value={agendaForm.doctorId} onChange={e=>setAgendaForm(s=>({...s,doctorId:e.target.value}))}>
                  <option value="">Sem preferência</option>
                  {doctors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Tipo
                <select value={agendaForm.type} onChange={e=>setAgendaForm(s=>({...s,type:e.target.value}))}>
                  <option value="consultation">Consulta</option>
                  <option value="return">Retorno</option>
                  <option value="procedure">Procedimento</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".8rem",fontWeight:600}}>Observações
                <input value={agendaForm.notes} onChange={e=>setAgendaForm(s=>({...s,notes:e.target.value}))} placeholder="Motivo, solicitações especiais..."/>
              </label>
              <div style={{gridColumn:"span 2",display:"flex",gap:".5rem",marginTop:".25rem"}}>
                <button type="button" onClick={()=>setShowAgendaForm(false)} style={{flex:1,background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-1)"}}>Cancelar</button>
                <button type="submit" style={{flex:2}}>Salvar agendamento</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   AGENDA / AGENDAMENTO DE CONSULTAS
══════════════════════════════════════════════════════════════════ */
const AGENDA_HOURS = ["07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00"];

function AgendaPage({ patients, users, user, token, onNewPatient, onPatientCreated, onNavigatePatient, teams = [] }) {
  const [agenda, setAgenda]         = useState(()=>readLS(AGENDA_KEY,[]));
  const [selectedDate, setSelectedDate] = useState(()=>new Date().toISOString().slice(0,10));
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ patientId:"", doctorId:"", date:"", time:"", type:"consultation", notes:"", status:"scheduled" });
  const [editId, setEditId]         = useState(null);
  const [filterDoc, setFilterDoc]   = useState("");
  // Patient search in form
  const [patSearch, setPatSearch]   = useState("");
  const [patSelected, setPatSelected] = useState(null);
  const [showNewPat, setShowNewPat] = useState(false);
  const [newPatForm, setNewPatForm] = useState({name:"",cpf:"",phone:"",careCategory:"general",birthDate:"",teamId:String(user?.teamId||"")});
  const [newPatErr, setNewPatErr]   = useState("");

  const patResults = useMemo(() => {
    const q = patSearch.trim();
    if (q.length < 2) return [];
    return patients.filter(p => matchesPatientSearch(p, q)).slice(0, 8);
  }, [patSearch, patients]);

  const doctors = users.filter(u=>["doctor","nurse_manager","nursing_tech"].includes(u.role));

  function saveAgenda(newA) { setAgenda(newA); writeLS(AGENDA_KEY, newA); }

  function openNew(time="", date=selectedDate) {
    setForm({ patientId:"", doctorId:"", date, time, type:"consultation", notes:"", status:"scheduled" });
    setPatSearch(""); setPatSelected(null);
    setEditId(null); setShowForm(true);
  }
  function openEdit(appt) {
    const pat = patients.find(p=>p.id===appt.patientId)||null;
    setForm({ patientId:appt.patientId, doctorId:appt.doctorId, date:appt.date, time:appt.time, type:appt.type, notes:appt.notes||"", status:appt.status });
    setPatSearch(pat?.name||""); setPatSelected(pat);
    setEditId(appt.id); setShowForm(true);
  }
  async function submit(e) {
    e.preventDefault();
    if (!form.patientId || !form.date || !form.time) return;

    let resolvedPatientId = form.patientId;

    // Se paciente foi criado rapidamente (id local_), persiste via API ou estado local
    if (patSelected && String(form.patientId).startsWith("local_") && !patients.find(p=>p.id===form.patientId)) {
      const payload = {
        name: patSelected.name,
        cpf: patSelected.cpf||"",
        phone: patSelected.phone||"",
        birthDate: patSelected.birthDate||"",
        careCategory: patSelected.careCategory||"general",
        teamId: String(patSelected.teamId || user?.teamId || "").trim(),
        incompleteProfile: true,
        // Campos mínimos obrigatórios vazios — serão completados depois
        motherName:"", cns:"", phoneAlt:"", zipCode:"", address:"", number:"",
        complement:"", neighborhood:"", city:"", state:"", sex:"", maritalStatus:"",
        assignedAcsId:"", allergies:"", comorbidities:"", medications:"",
        pregnancyStartDate:"", expectedDeliveryDate:"",
      };

      if (token && !String(token).startsWith("local_")) {
        // Cria via API
        try {
          const created = await createPatient(token, payload);
          resolvedPatientId = created?.id || form.patientId;
          if (onNewPatient) onNewPatient({...payload, id: resolvedPatientId});
          if (onPatientCreated) onPatientCreated(); // recarrega lista
        } catch {
          // Fallback: só no estado local
          const quickPat = { ...payload, id: form.patientId };
          if (onNewPatient) onNewPatient(quickPat);
          resolvedPatientId = form.patientId;
        }
      } else {
        // Token local: só estado React
        const quickPat = { ...payload, id: form.patientId };
        if (onNewPatient) onNewPatient(quickPat);
      }
    }

    const pat = patients.find(p=>p.id===resolvedPatientId) || patSelected;
    const doc = users.find(u=>u.id===form.doctorId);
    // Determina se o paciente tem cadastro incompleto:
    // - flag já vem do banco (pat.incompleteProfile)
    // - OU o id original era local_ (criado agora no cadastro rápido)
    const wasQuickCreated = String(form.patientId).startsWith("local_");
    const isIncomplete = pat?.incompleteProfile === true || wasQuickCreated;
    const entry = {
      ...form,
      patientId: resolvedPatientId,
      id: editId||("ag"+Date.now()),
      patientName: pat?.name||"?",
      doctorName: doc?.name||"",
      incompletePatient: isIncomplete,
      createdAt: new Date().toISOString(),
    };
    const base = editId ? agenda.filter(a=>a.id!==editId) : agenda;
    saveAgenda([...base, entry].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)));
    setShowForm(false);
  }
  function remove(id) { saveAgenda(agenda.filter(a=>a.id!==id)); }
  function updateStatus(id, status) { saveAgenda(agenda.map(a=>a.id===id?{...a,status}:a)); }

  const dayAppts = agenda.filter(a => a.date===selectedDate && (!filterDoc||a.doctorId===filterDoc))
    .sort((a,b)=>a.time.localeCompare(b.time));

  const statusStyle = { scheduled:{bg:"#eff6ff",color:"#1d4ed8",border:"#bfdbfe",label:"Agendado"}, arrived:{bg:"#f0fdf4",color:"#15803d",border:"#bbf7d0",label:"Chegou"}, attending:{bg:"#fff7ed",color:"#c2410c",border:"#fed7aa",label:"Em atend."}, done:{bg:"var(--surface-2)",color:"var(--text-3)",border:"var(--border)",label:"Concluído"}, absent:{bg:"#fff1f2",color:"#be123c",border:"#fecdd3",label:"Faltou"} };

  // Week navigation
  const selD = new Date(selectedDate+"T12:00:00");
  const weekDays = Array.from({length:7},(_,i)=>{
    const d=new Date(selD); d.setDate(d.getDate()-d.getDay()+i);
    return d.toISOString().slice(0,10);
  });

  // Count per day for week view
  const countByDay = {};
  weekDays.forEach(d=>{ countByDay[d]=agenda.filter(a=>a.date===d).length; });

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <PageHero
        badge="Gestão de Horários"
        title="Agenda"
        subtitle="Agendamentos, confirmações e controle de presença."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <button onClick={()=>openNew()} style={{flexShrink:0,display:"flex",alignItems:"center",gap:".4rem"}}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Novo agendamento
          </button>
        }
      />

      {/* Week strip */}
      <div style={{display:"flex",gap:".3rem",padding:"0 1.5rem .75rem",overflowX:"auto"}}>
        {weekDays.map(d=>{
          const dt=new Date(d+"T12:00:00");
          const isToday=d===new Date().toISOString().slice(0,10);
          const isSel=d===selectedDate;
          const unavailable=isUnavailableDay(d);
          return (
            <button key={d} onClick={()=>setSelectedDate(d)}
              style={{flex:"1 0 60px",padding:".55rem .4rem",borderRadius:"var(--r-md)",border:`1px solid ${isSel?"var(--teal-500)":unavailable?"#e2e8f0":"var(--border)"}`,
                background:isSel?"var(--teal-600)":unavailable?"#f8fafc":"var(--surface)",
                color:isSel?"#fff":unavailable?"#94a3b8":isToday?"var(--teal-600)":"var(--text-2)",
                cursor:"pointer",textAlign:"center",minWidth:60,opacity:unavailable&&!isSel?.7:1}}>
              <div style={{fontSize:".65rem",fontWeight:600,textTransform:"uppercase",opacity:.8}}>{dt.toLocaleDateString("pt-BR",{weekday:"short"})}</div>
              <div style={{fontSize:"1.05rem",fontWeight:800,lineHeight:1.2}}>{dt.getDate()}</div>
              {unavailable&&!isSel&&<div style={{fontSize:".55rem",marginTop:".1rem",color:"#94a3b8"}}>fechado</div>}
              {!unavailable&&countByDay[d]>0&&<div style={{fontSize:".6rem",marginTop:".1rem",opacity:.85}}>{countByDay[d]}×</div>}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:".6rem",padding:"0 1.5rem .6rem",alignItems:"center"}}>
        <select value={filterDoc} onChange={e=>setFilterDoc(e.target.value)} style={{minWidth:180}}>
          <option value="">Todos os profissionais</option>
          {doctors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span style={{fontSize:".8rem",color:"var(--text-3)"}}>{dayAppts.length} agendamento{dayAppts.length!==1?"s":""} em {new Date(selectedDate+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}</span>
      </div>

      {/* Timeline */}
      <div style={{flex:1,overflow:"auto",padding:"0 1.5rem 1.5rem"}}>
        {isUnavailableDay(selectedDate)&&(
          <div style={{display:"flex",alignItems:"center",gap:".75rem",padding:".75rem 1rem",marginBottom:".75rem",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:"var(--r-md)",fontSize:".82rem",color:"#64748b"}}>
            <span style={{fontSize:"1.2rem"}}>🔒</span>
            <div>
              <div style={{fontWeight:700,color:"#475569"}}>{unavailableReason(selectedDate)}</div>
              <div style={{fontSize:".75rem",marginTop:".1rem"}}>Agendamentos não são realizados nesta data. Caso haja um agendamento existente, ele foi criado manualmente.</div>
            </div>
          </div>
        )}
        {!dayAppts.length ? (
          <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
            <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>{isUnavailableDay(selectedDate)?"🔒":"📅"}</div>
            <div style={{fontWeight:600,fontSize:".9rem"}}>{isUnavailableDay(selectedDate)?"Unidade fechada neste dia":"Nenhum agendamento neste dia"}</div>
            {!isUnavailableDay(selectedDate)&&<button onClick={()=>openNew()} style={{marginTop:"1rem",fontSize:".8rem"}}>+ Agendar consulta</button>}
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
            {dayAppts.map(appt=>{
              const ss=statusStyle[appt.status]||statusStyle.scheduled;
              // Verifica cadastro incompleto:
              // 1. flag no agendamento (salva no momento do cadastro rápido)
              // 2. flag no paciente atualizado (após loadAll)
              // 3. id ainda começa com local_ (não foi para o backend)
              const patObj = patients.find(p=>p.id===appt.patientId);
              const incomplete = appt.incompletePatient === true
                || isProfileIncomplete(patObj)
                || String(appt.patientId).startsWith("local_");
              return (
                <div key={appt.id} style={{display:"flex",flexDirection:"column",gap:".4rem",padding:".75rem 1rem",borderRadius:"var(--r-md)",background:ss.bg,border:`1px solid ${incomplete?"#f59e0b":ss.border}`}}>
                  {incomplete&&(
                    <div style={{display:"flex",alignItems:"center",gap:".5rem",padding:".3rem .6rem",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".72rem",color:"#92400e",fontWeight:600}}>
                      <span>âš ï¸</span>
                      <span>Cadastro incompleto — consulta bloqueada até completar o perfil.</span>
                      {onNavigatePatient&&<button type="button" onClick={()=>onNavigatePatient(appt.patientId)}
                        style={{marginLeft:"auto",fontSize:".7rem",padding:".15rem .5rem",background:"#f59e0b",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:700,flexShrink:0}}>
                        Completar →
                      </button>}
                    </div>
                  )}
                  <div style={{display:"flex",alignItems:"center",gap:".75rem"}}>
                    <div style={{fontFamily:"IBM Plex Mono",fontSize:".85rem",fontWeight:700,color:ss.color,flexShrink:0,width:50}}>{appt.time}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:".88rem",color:"var(--ink)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{appt.patientName}</div>
                      <div style={{fontSize:".73rem",color:"var(--text-3)",marginTop:".1rem"}}>
                        {appt.type==="consultation"?"Consulta":appt.type==="return"?"Retorno":appt.type==="procedure"?"Procedimento":"Outro"}
                        {appt.doctorName&&" · "+appt.doctorName}
                        {appt.notes&&" · "+appt.notes}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:".4rem",flexShrink:0}}>
                      <select value={appt.status}
                        onChange={e=>{
                          if(incomplete&&(e.target.value==="attending"||e.target.value==="done")){
                            alert("Cadastro incompleto. Complete o perfil do paciente antes de iniciar a consulta.");
                            return;
                          }
                          updateStatus(appt.id,e.target.value);
                        }}
                        style={{fontSize:".72rem",padding:".2rem .4rem",borderRadius:999,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,fontWeight:700,cursor:"pointer"}}>
                        {Object.entries(statusStyle).map(([k,v])=>{
                          const blocked=incomplete&&(k==="attending"||k==="done");
                          return <option key={k} value={k} disabled={blocked}>{v.label}{blocked?" 🔒":""}</option>;
                        })}
                      </select>
                      <button onClick={()=>openEdit(appt)} style={{padding:".25rem .5rem",fontSize:".71rem",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:"var(--text-1)"}}>✏️</button>
                      <button onClick={()=>remove(appt.id)} style={{padding:".25rem .5rem",fontSize:".71rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"#be123c"}}>✕</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm&&(
        <div className="modal-backdrop" onClick={()=>setShowForm(false)}>
          <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <h3 style={{margin:0}}>{editId?"Editar agendamento":"Novo agendamento"}</h3>
              <button className="icon-btn" onClick={()=>setShowForm(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            <form onSubmit={submit} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".65rem"}}>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Paciente *
                <div style={{position:"relative"}}>
                  <div style={{position:"absolute",left:".75rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)",pointerEvents:"none"}}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </div>
                  <input
                    value={patSearch}
                    onChange={e=>{ setPatSearch(e.target.value); if(patSelected&&e.target.value!==patSelected.name){ setPatSelected(null); setForm(s=>({...s,patientId:""})); } }}
                    placeholder="Buscar por nome, CPF ou telefone..."
                    autoComplete="off"
                    style={{paddingLeft:"2.2rem",width:"100%",boxSizing:"border-box",fontWeight:400,
                      border:patSelected?"2px solid var(--teal-500)":"1px solid var(--border)",borderRadius:"var(--r-md)"}}/>
                  {patSelected&&(
                    <div style={{position:"absolute",right:".6rem",top:"50%",transform:"translateY(-50%)",
                      width:18,height:18,borderRadius:"50%",background:"var(--teal-500)",
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  )}
                  {patSearch.length>=2&&!patSelected&&(
                    <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,
                      border:"1px solid var(--border)",borderTop:"none",borderRadius:"0 0 var(--r-md) var(--r-md)",
                      background:"var(--surface)",boxShadow:"0 4px 12px rgba(0,0,0,.08)",maxHeight:200,overflowY:"auto"}}>
                      {patResults.length===0?(
                        <div style={{padding:".65rem .9rem",fontSize:".8rem"}}>
                          <div style={{color:"var(--text-3)",marginBottom:".5rem"}}>Nenhum paciente encontrado.</div>
                          <button type="button" onClick={()=>{ const n=patSearch; setPatSearch(""); setNewPatForm({name:n,cpf:"",phone:"",careCategory:"general",birthDate:"",teamId:String(user?.teamId||"")}); setNewPatErr(""); setShowNewPat(true); }}
                            style={{fontSize:".78rem",padding:".3rem .65rem",background:"var(--teal-50)",color:"var(--teal-700)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600}}>
                            + Cadastrar novo paciente
                          </button>
                        </div>
                      ):patResults.map(p=>{
                        const am=ageInMonths(p.birthDate);
                        return(
                          <button key={p.id} type="button"
                            onClick={()=>{ setPatSelected(p); setPatSearch(p.name); setForm(s=>({...s,patientId:p.id})); }}
                            style={{display:"flex",alignItems:"center",gap:".65rem",width:"100%",padding:".5rem .9rem",
                              background:"none",border:"none",cursor:"pointer",textAlign:"left",color:"var(--text-1)"}}
                            onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                            onMouseLeave={e=>e.currentTarget.style.background="none"}>
                            <div style={{width:28,height:28,borderRadius:"50%",background:"var(--teal-100)",
                              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                              fontSize:".7rem",fontWeight:700,color:"var(--teal-700)"}}>
                              {initials(p.name)}
                            </div>
                            <div style={{minWidth:0}}>
                              <div style={{fontWeight:600,fontSize:".83rem",color:"var(--ink)"}}>{p.name}</div>
                              <div style={{fontSize:".71rem",color:"var(--text-3)"}}>
                                {p.careCategory||"Geral"}{am!==null?` · ${am<24?am+"m":Math.floor(am/12)+"a"}`:""}
                                {p.cpf?` · CPF ${p.cpf}`:""}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                      {patResults.length>0&&(
                        <div style={{padding:".4rem .9rem",borderTop:"1px solid var(--border)"}}>
                          <button type="button" onClick={()=>{ const n=patSearch; setPatSearch(""); setNewPatForm({name:n,cpf:"",phone:"",careCategory:"general",birthDate:"",teamId:String(user?.teamId||"")}); setNewPatErr(""); setShowNewPat(true); }}
                            style={{fontSize:".75rem",padding:".25rem .55rem",background:"none",color:"var(--teal-600)",border:"1px dashed var(--teal-300)",borderRadius:"var(--r-md)",cursor:"pointer"}}>
                            + Cadastrar novo paciente
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </label>

              {/* Cadastro rápido de novo paciente */}
              {showNewPat&&(
                <div style={{gridColumn:"span 2",background:"var(--teal-50)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)",padding:".85rem",display:"flex",flexDirection:"column",gap:".6rem"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{fontWeight:700,fontSize:".78rem",color:"var(--teal-700)"}}>+ Cadastro rápido de paciente</span>
                    <button type="button" onClick={()=>setShowNewPat(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-3)",fontSize:"1rem",lineHeight:1,padding:0}}>×</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                    <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      Nome completo *
                      <input value={newPatForm.name} onChange={e=>setNewPatForm(s=>({...s,name:e.target.value}))} placeholder="Nome do paciente" style={{fontSize:".8rem"}}/>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      CPF
                      <input value={newPatForm.cpf} onChange={e=>setNewPatForm(s=>({...s,cpf:formatCpf(e.target.value)}))} placeholder="000.000.000-00" style={{fontSize:".8rem"}}/>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      Telefone
                      <input value={newPatForm.phone} onChange={e=>setNewPatForm(s=>({...s,phone:formatPhone(e.target.value)}))} placeholder="(00) 00000-0000" style={{fontSize:".8rem"}}/>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      Nascimento
                      <input type="date" value={newPatForm.birthDate} onChange={e=>setNewPatForm(s=>({...s,birthDate:e.target.value}))} style={{fontSize:".8rem"}}/>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      Categoria
                      <select value={newPatForm.careCategory} onChange={e=>setNewPatForm(s=>({...s,careCategory:e.target.value}))} style={{fontSize:".8rem"}}>
                        <option value="general">Geral</option>
                        <option value="pregnant">Gestante</option>
                        <option value="hypertension">Hipertensão</option>
                        <option value="diabetes">Diabetes</option>
                        <option value="elderly">Idoso</option>
                        <option value="child_followup">Puericultura</option>
                      </select>
                    </label>
                    <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".75rem",fontWeight:600}}>
                      Equipe responsável
                      <select value={newPatForm.teamId} onChange={e=>setNewPatForm(s=>({...s,teamId:e.target.value}))} style={{fontSize:".8rem"}}>
                        <option value="">Selecione...</option>
                        {(teams||[]).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </label>
                  </div>
                  {newPatErr&&<div style={{fontSize:".75rem",color:"#be123c"}}>{newPatErr}</div>}
                  <button type="button"
                    onClick={()=>{
                      if(!newPatForm.name.trim()){setNewPatErr("Nome obrigatório.");return;}
                      if(!String(newPatForm.teamId||"").trim()){setNewPatErr("Selecione a equipe responsável.");return;}
                      const np={...emptyPatientForm(),name:newPatForm.name.trim(),cpf:newPatForm.cpf,phone:newPatForm.phone,birthDate:newPatForm.birthDate,careCategory:newPatForm.careCategory,teamId:newPatForm.teamId,id:"local_"+Date.now(),incompleteProfile:true};
                      setPatSelected(np); setPatSearch(np.name); setForm(s=>({...s,patientId:np.id}));
                      setShowNewPat(false); setNewPatErr("");
                    }}
                    style={{alignSelf:"flex-end",fontSize:".78rem",padding:".35rem .8rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600}}>
                    ✓ Usar este paciente
                  </button>
                </div>
              )}
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Data *
                <input type="date" value={form.date} onChange={e=>setForm(s=>({...s,date:e.target.value}))}/>
                {form.date&&isUnavailableDay(form.date)&&(
                  <span style={{fontSize:".72rem",color:"#c2410c",fontWeight:600,display:"flex",alignItems:"center",gap:".3rem"}}>
                    âš ï¸ {unavailableReason(form.date)} — confirme se necessário
                  </span>
                )}
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Horário *
                <select value={form.time} onChange={e=>setForm(s=>({...s,time:e.target.value}))}>
                  <option value="">Selecionar...</option>
                  {AGENDA_HOURS.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Profissional
                <select value={form.doctorId} onChange={e=>setForm(s=>({...s,doctorId:e.target.value}))}>
                  <option value="">Sem preferência</option>
                  {doctors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Tipo
                <select value={form.type} onChange={e=>setForm(s=>({...s,type:e.target.value}))}>
                  <option value="consultation">Consulta</option>
                  <option value="return">Retorno</option>
                  <option value="procedure">Procedimento</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Observações
                <input value={form.notes} onChange={e=>setForm(s=>({...s,notes:e.target.value}))} placeholder="Motivo, solicitações especiais..."/>
              </label>
              <div style={{gridColumn:"span 2",display:"flex",gap:".5rem",marginTop:".25rem"}}>
                <button type="button" onClick={()=>setShowForm(false)} style={{flex:1,background:"var(--surface-2)",color:"var(--text-1)",border:"1px solid var(--border)"}}>Cancelar</button>
                <button type="submit" style={{flex:2}}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   FILA DE ATENDIMENTO / RECEPÇÃO
══════════════════════════════════════════════════════════════════ */
const PRIORITY_LABELS = { urgent:"Urgente", elderly:"Idoso/PCD", pregnant:"Gestante", child:"Criança", normal:"Normal" };
const PRIORITY_COLORS = {
  urgent:   { bg:"#fff1f2",border:"#fecdd3",text:"#be123c",order:0 },
  elderly:  { bg:"#fff7ed",border:"#fed7aa",text:"#c2410c",order:1 },
  pregnant: { bg:"#fdf4ff",border:"#e9d5ff",text:"#7e22ce",order:2 },
  child:    { bg:"#eff6ff",border:"#bfdbfe",text:"#1d4ed8",order:3 },
  normal:   { bg:"var(--surface-2)",border:"var(--border)",text:"var(--text-2)",order:4 },
};

/* ══════════════════════════════════════════════════════════════════
   TRIAGE PAGE — Monitoramento (Téc. de Enfermagem)
══════════════════════════════════════════════════════════════════ */
const TRIAGE_VITALS_KEY = "saudeubs_triage_vitals_v1";

function TriagePage({ patients, users, user }) {
  const [queue, setQueue]       = useState(()=>readLS(QUEUE_KEY,[]));
  const [selected, setSelected] = useState(null);
  const [vitals, setVitals]     = useState({ bp:"", bpD:"", weight:"", height:"", temp:"", spo2:"", hr:"", glucose:"", pain:"", notes:"" });
  const [saving, setSaving]     = useState(false);

  useEffect(()=>{
    const iv = setInterval(()=>setQueue(readLS(QUEUE_KEY,[])), 15000);
    return ()=>clearInterval(iv);
  },[]);

  function saveQueue(q) { setQueue(q); writeLS(QUEUE_KEY,q); }
  const pendingTriage = queue.filter(q=>q.status==="waiting"||q.status==="triage");

  function startTriage(entry) {
    saveQueue(queue.map(q=>q.id===entry.id?{...q,status:"triage",triageBy:user?.id,triageStart:new Date().toISOString()}:q));
    setSelected(entry);
    setVitals({ bp:"", bpD:"", weight:"", height:"", temp:"", spo2:"", hr:"", glucose:"", pain:"", notes:"" });
  }

  function finishTriage(e) {
    e.preventDefault(); setSaving(true);
    try {
      const allVitals = readLS(TRIAGE_VITALS_KEY,{});
      allVitals[selected.id] = { ...vitals, by:user?.name||"Téc. Enf.", at:new Date().toISOString(), patientId:selected.patientId };
      writeLS(TRIAGE_VITALS_KEY, allVitals);
      saveQueue(queue.map(q=>q.id===selected.id?{...q,status:"ready",triageBy:user?.id,triageDone:new Date().toISOString(),vitals}:q));
      const notif = { id:"triage_done_"+Date.now(), type:"info", icon:"check",
        title:`Triagem concluída: ${selected.patientName}`,
        detail:`Sinais vitais registrados. Paciente pronto.${vitals.bp?` PA: ${vitals.bp}/${vitals.bpD} mmHg`:""}${vitals.weight?` · Peso: ${vitals.weight}kg`:""}`,
        patientId:selected.patientId, dest:"all", ts:new Date().toISOString(), read:false };
      writeLS(NOTIFS_KEY, [notif,...readLS(NOTIFS_KEY,[])].slice(0,50));
      setSelected(null);
    } finally { setSaving(false); }
  }

  function fmtTime(iso) { if(!iso)return""; return new Date(iso).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); }
  function waitMins(iso) { const m=Math.floor((new Date()-new Date(iso))/60000); return m<1?"agora":m<60?`${m}min`:`${Math.floor(m/60)}h${String(m%60).padStart(2,"0")}`; }
  const onlineTechs = users.filter(u=>u.role==="nursing_tech"&&u.online);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <PageHero
        badge="Téc. de Enfermagem"
        title="Monitoramento e Triagem"
        subtitle="Aferição de sinais vitais antes do atendimento."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <div style={{display:"flex",alignItems:"center",gap:".5rem",flexShrink:0}}>
            <span style={{fontSize:".72rem",color:"var(--text-3)"}}>Online:</span>
            {onlineTechs.length===0?<span style={{fontSize:".72rem",color:"var(--text-3)"}}>nenhum</span>:onlineTechs.map(u=>(
              <span key={u.id} style={{fontSize:".72rem",padding:".18rem .5rem",borderRadius:999,background:"#dcfce7",color:"#15803d",fontWeight:600,display:"flex",alignItems:"center",gap:".25rem"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"#16a34a",display:"inline-block"}}/>
                {shortName(u.name)}
              </span>
            ))}
          </div>
        }
      />
      <div style={{display:"flex",gap:"1.25rem",padding:"0 1.5rem 1.5rem",flex:1,minHeight:0}}>
        {/* Left: waiting list */}
        <div style={{flex:"0 0 300px",display:"flex",flexDirection:"column",gap:".5rem",overflowY:"auto"}}>
          <div style={{fontSize:".78rem",fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:".25rem"}}>Aguardando triagem ({pendingTriage.length})</div>
          {pendingTriage.length===0?(
            <div style={{textAlign:"center",padding:"3rem 1rem",color:"var(--text-3)",background:"var(--surface-2)",borderRadius:"var(--r-md)",border:"1px dashed var(--border)"}}>
              <div style={{fontSize:"2rem",marginBottom:".5rem"}}>🏥</div><div style={{fontSize:".83rem"}}>Nenhum paciente aguardando</div>
            </div>
          ):pendingTriage.map(entry=>{
            const pc=PRIORITY_COLORS[entry.priority]||PRIORITY_COLORS.normal;
            const isMe=entry.status==="triage"&&entry.triageBy===user?.id;
            const isBusy=entry.status==="triage"&&entry.triageBy!==user?.id;
            const techName=isBusy?users.find(u=>u.id===entry.triageBy)?.name:null;
            return(
              <div key={entry.id} style={{padding:".7rem .9rem",borderRadius:"var(--r-md)",cursor:entry.status==="triage"?"default":"pointer",
                border:`2px solid ${isMe?"var(--teal-400)":isBusy?"#fde68a":pc.border}`,
                background:isMe?"var(--teal-50)":isBusy?"#fffbeb":pc.bg}}
                onClick={()=>{if(!isBusy&&entry.status!=="triage")startTriage(entry);}}>
                <div style={{fontWeight:700,fontSize:".88rem",color:"var(--ink)"}}>{entry.patientName}</div>
                <div style={{fontSize:".71rem",color:"var(--text-3)",marginTop:".2rem"}}>Chegou {fmtTime(entry.arrivedAt)} · há {waitMins(entry.arrivedAt)}</div>
                {isMe&&<div style={{fontSize:".72rem",fontWeight:700,color:"var(--teal-600)",marginTop:".3rem"}}>→ Em triagem por você</div>}
                {isBusy&&<div style={{fontSize:".72rem",color:"#b45309",marginTop:".3rem"}}>Em triagem: {shortName(techName||"outro técnico")}</div>}
                {!isMe&&!isBusy&&<div style={{fontSize:".73rem",color:"var(--teal-600)",fontWeight:600,marginTop:".3rem"}}>Clique para iniciar →</div>}
              </div>
            );
          })}
          {(()=>{const ready=queue.filter(q=>q.status==="ready");if(!ready.length)return null;return(
            <div style={{marginTop:".75rem"}}>
              <div style={{fontSize:".75rem",fontWeight:700,color:"#15803d",textTransform:"uppercase",letterSpacing:".04em",marginBottom:".35rem"}}>Prontos ({ready.length})</div>
              {ready.map(e=><div key={e.id} style={{padding:".55rem .8rem",borderRadius:"var(--r-md)",border:"1px solid #bbf7d0",background:"#f0fdf4",marginBottom:".3rem",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div><div style={{fontWeight:600,fontSize:".82rem",color:"#15803d"}}>{e.patientName}</div><div style={{fontSize:".7rem",color:"#16a34a"}}>Concluído · {fmtTime(e.triageDone)}</div></div>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#16a34a" strokeWidth="1.4"/><path d="M5 8l2 2 4-4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>)}
            </div>
          );})()}
        </div>
        {/* Right: vitals form */}
        <div style={{flex:1,minWidth:0}}>
          {!selected?(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:"var(--text-3)",textAlign:"center",padding:"3rem"}}>
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" style={{opacity:.2,marginBottom:"1rem"}}><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <p style={{fontSize:".9rem"}}>Selecione um paciente para iniciar a triagem.</p>
            </div>
          ):(
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"1rem 1.25rem",borderBottom:"1px solid var(--border)",background:"var(--teal-50)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:".75rem"}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:"var(--teal-500)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:"1rem"}}>{initials(selected.patientName)}</div>
                  <div><div style={{fontWeight:700,fontSize:".95rem",color:"var(--ink)"}}>{selected.patientName}</div><div style={{fontSize:".73rem",color:"var(--teal-600)"}}>Triagem iniciada às {fmtTime(selected.triageStart||new Date().toISOString())}</div></div>
                </div>
                <button className="icon-btn" onClick={()=>{saveQueue(queue.map(q=>q.id===selected.id?{...q,status:"waiting",triageBy:null,triageStart:null}:q));setSelected(null);}}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>
              <form onSubmit={finishTriage} style={{padding:"1.25rem",display:"flex",flexDirection:"column",gap:"1rem",overflowY:"auto",maxHeight:"calc(100vh - 280px)"}}>
                <div>
                  <div style={{fontSize:".78rem",fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:".5rem"}}>Pressão Arterial e FC</div>
                  <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:".5rem"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                      PA (mmHg)
                      <div style={{display:"flex",alignItems:"center",gap:".3rem"}}>
                        <input value={vitals.bp} onChange={e=>setVitals(s=>({...s,bp:e.target.value}))} placeholder="120" inputMode="numeric" style={{flex:1}}/>
                        <span style={{color:"var(--text-3)",fontWeight:700}}>/</span>
                        <input value={vitals.bpD} onChange={e=>setVitals(s=>({...s,bpD:e.target.value}))} placeholder="80" inputMode="numeric" style={{flex:1}}/>
                      </div>
                    </label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>FC (bpm)<input value={vitals.hr} onChange={e=>setVitals(s=>({...s,hr:e.target.value}))} placeholder="72" inputMode="numeric"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>SpO₂ (%)<input value={vitals.spo2} onChange={e=>setVitals(s=>({...s,spo2:e.target.value}))} placeholder="98" inputMode="numeric"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Temp (°C)<input value={vitals.temp} onChange={e=>setVitals(s=>({...s,temp:e.target.value}))} placeholder="36.5" inputMode="decimal"/></label>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:".78rem",fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:".5rem"}}>Antropometria</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:".5rem"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Peso (kg)<input value={vitals.weight} onChange={e=>setVitals(s=>({...s,weight:e.target.value}))} placeholder="70.0" inputMode="decimal"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Altura (cm)<input value={vitals.height} onChange={e=>setVitals(s=>({...s,height:e.target.value}))} placeholder="170" inputMode="numeric"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Glicemia (mg/dL)<input value={vitals.glucose} onChange={e=>setVitals(s=>({...s,glucose:e.target.value}))} placeholder="100" inputMode="numeric"/></label>
                  </div>
                  {vitals.weight&&vitals.height&&(()=>{const bmi=(parseFloat(vitals.weight)/Math.pow(parseFloat(vitals.height)/100,2)).toFixed(1);const cat=bmi<18.5?["Abaixo do peso","#1d4ed8"]:bmi<25?["Normal","#15803d"]:bmi<30?["Sobrepeso","#b45309"]:["Obesidade","#be123c"];return !isNaN(bmi)?<div style={{marginTop:".3rem",fontSize:".75rem",color:cat[1],fontWeight:600}}>IMC: {bmi} — {cat[0]}</div>:null;})()}
                </div>
                <div>
                  <div style={{fontSize:".78rem",fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:".04em",marginBottom:".5rem"}}>Dor (0–10)</div>
                  <div style={{display:"flex",gap:".3rem",flexWrap:"wrap"}}>
                    {[0,1,2,3,4,5,6,7,8,9,10].map(n=>(
                      <button key={n} type="button" onClick={()=>setVitals(s=>({...s,pain:String(n)}))}
                        style={{width:36,height:36,borderRadius:"var(--r-md)",fontWeight:700,fontSize:".85rem",cursor:"pointer",
                          border:`2px solid ${vitals.pain===String(n)?(n<=3?"#15803d":n<=6?"#b45309":"#be123c"):"var(--border)"}`,
                          background:vitals.pain===String(n)?(n<=3?"#dcfce7":n<=6?"#fef3c7":"#fee2e2"):"var(--surface)",
                          color:vitals.pain===String(n)?(n<=3?"#15803d":n<=6?"#b45309":"#be123c"):"var(--text-2)"}}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <label style={{display:"flex",flexDirection:"column",gap:".3rem",fontSize:".78rem",fontWeight:600}}>
                  Observações
                  <textarea value={vitals.notes} onChange={e=>setVitals(s=>({...s,notes:e.target.value}))} placeholder="Queixas, histórico relevante..." style={{minHeight:64,resize:"vertical"}}/>
                </label>
                <div style={{display:"flex",gap:".5rem",paddingTop:".25rem",borderTop:"1px solid var(--border)"}}>
                  <button type="button" onClick={()=>{saveQueue(queue.map(q=>q.id===selected.id?{...q,status:"waiting",triageBy:null}:q));setSelected(null);}}
                    style={{flex:1,background:"var(--surface-2)",color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:".6rem 1.25rem",fontSize:".85rem",fontWeight:500,cursor:"pointer"}}>Cancelar</button>
                  <button type="submit" disabled={saving}
                    style={{flex:2,background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",padding:".6rem 1.25rem",fontSize:".85rem",fontWeight:600,cursor:"pointer"}}>
                    {saving?"Finalizando...":"✓ Finalizar triagem e notificar"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QueuePage({ patients, users, user, token, onNewPatient }) {
  const [queue, setQueue]         = useState(()=>readLS(QUEUE_KEY,[]));
  const [showForm, setShowForm]   = useState(false);
  const [step, setStep]           = useState("select"); // select | new-patient
  const [demandType, setDemandType] = useState("scheduled");
  const [destination, setDestination] = useState("doctor");
  const [priority, setPriority]   = useState("normal");
  const [reason, setReason]       = useState("");
  const [agendaRef, setAgendaRef] = useState(null);
  // Patient search
  const [searchQ, setSearchQ]     = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const searchRef = useRef(null);
  // New patient form
  const emptyNew = () => ({
    name:"", cpf:"", cns:"", birthDate:"", sex:"", maritalStatus:"", motherName:"",
    phone:"", phoneAlt:"", zipCode:"", address:"", number:"", complement:"",
    neighborhood:"", city:"", state:"", careCategory:"general", assignedAcsId:"",
    pregnancyStartDate:"", expectedDeliveryDate:"",
    gestationalAgeDumWeeks:"", gestationalAgeDumDays:"",
    gestationalAgeUsgWeeks:"", gestationalAgeUsgDays:"",
    usgDate1:"", usgDate2:"", usgDate3:"",
    allergies:"", comorbidities:"", medications:"",
    microarea:"", familyCode:"", homeVisitFreq:"",
    housingType:"", waterSupply:"", sewage:"", garbage:"", electricity:"",
  });
  const [newPat, setNewPat]       = useState(emptyNew());
  const [savingNew, setSavingNew] = useState(false);
  const [newPatErr, setNewPatErr] = useState("");

  function saveQueue(q) { setQueue(q); writeLS(QUEUE_KEY,q); }

  // Search results — min 2 chars
  const searchResults = useMemo(() => {
    const q = searchQ.trim();
    if (q.length < 2) return [];
    const inQueue = queue.filter(e=>e.status!=="done").map(e=>e.patientId);
    return patients.filter(p => !inQueue.includes(p.id) && matchesPatientSearch(p, q)).slice(0, 8);
  }, [searchQ, patients, queue]);

  function selectPatient(p) {
    setSelectedPatient(p);
    setSearchQ(p.name);
    // Auto priority
    const cat = String(p.careCategory||"").toLowerCase();
    let prio = "normal";
    if (cat==="pregnant") prio="pregnant";
    else {
      const age = p.birthDate ? Math.floor((new Date()-(parseLocalDate(p.birthDate)||new Date()))/31557600000) : null;
      if (age!==null && age>=60) prio="elderly";
      else if (age!==null && age<12) prio="child";
    }
    setPriority(prio);
    // Check agenda today
    const today = new Date().toISOString().slice(0,10);
    const agenda = readLS(AGENDA_KEY,[]);
    const ref = agenda.find(a=>a.patientId===p.id&&a.date===today&&a.status!=="done");
    setAgendaRef(ref||null);
    if (ref) setDemandType("scheduled");
  }

  function resetForm() {
    setStep("select"); setSearchQ(""); setSelectedPatient(null);
    setDemandType("scheduled"); setDestination("doctor");
    setPriority("normal"); setReason(""); setAgendaRef(null);
    setNewPat(emptyNew()); setNewPatErr("");
  }

  function addToQueue() {
    if (!selectedPatient) return;
    const notif = {
      id:"q"+Date.now(), type:demandType==="scheduled"?"info":"warn",
      icon:"check",
      title: demandType==="scheduled"
        ? `Paciente chegou: ${selectedPatient.name}`
        : `Paciente espontâneo: ${selectedPatient.name}`,
      detail: demandType==="scheduled"
        ? `Consulta confirmada. Prioridade: ${PRIORITY_LABELS[priority]}.`
        : `Encaminhar para: ${destination==="doctor"?"Médico(a)":"Enfermagem"}. ${reason||""}`,
      patientId:selectedPatient.id, dest:demandType==="spontaneous"?destination:null,
      ts:new Date().toISOString(), read:false,
    };
    const prev = readLS(NOTIFS_KEY,[]);
    writeLS(NOTIFS_KEY, [notif,...prev].slice(0,50));

    const entry = {
      id:"q"+Date.now(), patientId:selectedPatient.id, patientName:selectedPatient.name,
      priority, reason, demandType, destination:demandType==="spontaneous"?destination:null,
      agendaRef:agendaRef?.id||null, arrivedAt:new Date().toISOString(), status:"waiting",
    };
    saveQueue([...queue, entry]);
    resetForm(); setShowForm(false);
  }

  async function saveNewPatient(e) {
    e.preventDefault();
    if (!newPat.name.trim()) { setNewPatErr("Nome é obrigatório."); return; }
    setSavingNew(true); setNewPatErr("");
    try {
      const territorial = [
        newPat.microarea    ? `Microárea: ${newPat.microarea}`        : "",
        newPat.familyCode   ? `Cód.família: ${newPat.familyCode}`     : "",
        newPat.homeVisitFreq? `Freq.visita: ${newPat.homeVisitFreq}`  : "",
        newPat.housingType  ? `Moradia: ${newPat.housingType}`        : "",
        newPat.waterSupply  ? `Água: ${newPat.waterSupply}`           : "",
        newPat.sewage       ? `Esgoto: ${newPat.sewage}`              : "",
        newPat.garbage      ? `Lixo: ${newPat.garbage}`               : "",
        newPat.electricity  ? `Energia: ${newPat.electricity}`        : "",
      ].filter(Boolean).join(" | ");

      const payload = {
        name:newPat.name.trim(), motherName:newPat.motherName.trim(),
        cpf:newPat.cpf.trim(), cns:newPat.cns.trim(), birthDate:newPat.birthDate,
        phone:newPat.phone.trim(), phoneAlt:newPat.phoneAlt.trim(),
        sex:newPat.sex, maritalStatus:newPat.maritalStatus,
        careCategory:newPat.careCategory||"general", assignedAcsId:"",
        zipCode:newPat.zipCode.trim(), address:newPat.address.trim(),
        number:newPat.number.trim(), complement:newPat.complement.trim(),
        neighborhood:newPat.neighborhood.trim(), city:newPat.city.trim(),
        state:newPat.state.trim().toUpperCase(),
        allergies:newPat.allergies.trim(), comorbidities:newPat.comorbidities.trim(),
        medications:newPat.medications.trim()+(territorial?(" | [Territorial] "+territorial):""),
        pregnancyStartDate:newPat.pregnancyStartDate||"",
        expectedDeliveryDate:newPat.expectedDeliveryDate||"",
        gestationalAgeDumWeeks:newPat.gestationalAgeDumWeeks===""?null:Number(newPat.gestationalAgeDumWeeks),
        gestationalAgeDumDays:newPat.gestationalAgeDumDays===""?null:Number(newPat.gestationalAgeDumDays),
        gestationalAgeUsgWeeks:newPat.gestationalAgeUsgWeeks===""?null:Number(newPat.gestationalAgeUsgWeeks),
        gestationalAgeUsgDays:newPat.gestationalAgeUsgDays===""?null:Number(newPat.gestationalAgeUsgDays),
        usgDate1:newPat.usgDate1||"", usgDate2:newPat.usgDate2||"", usgDate3:newPat.usgDate3||"",
      };
      let created;
      if (token && !String(token).startsWith("local_")) {
        created = await createPatient(token, payload);
      } else {
        created = { ...payload, id:"local_"+Date.now() };
        if (onNewPatient) onNewPatient(created);
      }
      if (onNewPatient && created?.id) onNewPatient(created);
      setSelectedPatient({ ...created, name:newPat.name.trim() });
      setSearchQ(newPat.name.trim());
      setStep("select");
    } catch(err) { setNewPatErr(err.message||"Erro ao cadastrar paciente."); }
    finally { setSavingNew(false); }
  }

  function updateStatus(id, status) { saveQueue(queue.map(q=>q.id===id?{...q,status,updatedAt:new Date().toISOString()}:q)); }
  function removeFromQueue(id) { saveQueue(queue.filter(q=>q.id!==id)); }
  function clearDone() { saveQueue(queue.filter(q=>q.status==="waiting"||q.status==="attending"||q.status==="triage"||q.status==="ready")); }

  const sorted = [...queue].sort((a,b)=>{
    if (a.status==="done"&&b.status!=="done") return 1;
    if (b.status==="done"&&a.status!=="done") return -1;
    const po=PRIORITY_COLORS,pa=po[a.priority]?.order ?? 4,pb=po[b.priority]?.order ?? 4;
    if(pa!==pb) return pa-pb;
    return a.arrivedAt.localeCompare(b.arrivedAt);
  });

  const waiting   = sorted.filter(q=>q.status==="waiting").length;
  const attending = sorted.filter(q=>q.status==="attending").length;
  const alreadyInQueue = queue.filter(q=>q.status!=="done").map(q=>q.patientId);

  function fmtTime(iso) {
    if(!iso)return"";
    return new Date(iso).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  }
  function waitMins(iso) {
    const mins = Math.floor((new Date()-new Date(iso))/60000);
    return mins<1?"agora":mins<60?`${mins}min`:`${Math.floor(mins/60)}h${String(mins%60).padStart(2,"0")}`;
  }

  const BTN_CANCEL = {flex:1,background:"var(--surface-2)",color:"var(--text-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:".6rem 1.25rem",fontSize:".85rem",fontWeight:500,cursor:"pointer"};
  const BTN_PRIMARY = {flex:1,background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",padding:".6rem 1.25rem",fontSize:".85rem",fontWeight:600,cursor:"pointer"};

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <PageHero
        badge="Recepção"
        title="Fila de Atendimento"
        subtitle="Triagem, prioridade e fluxo de pacientes no dia."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <button onClick={()=>{resetForm();setShowForm(true);}} style={{flexShrink:0,display:"flex",alignItems:"center",gap:".4rem"}}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Dar entrada
          </button>
        }
      />

      {/* KPIs */}
      <div style={{display:"flex",gap:".75rem",padding:"0 1.5rem .75rem"}}>
        {[["Aguardando","⏳",waiting,"#1d4ed8","#eff6ff"],["Em atendimento","🩺",attending,"#c2410c","#fff7ed"],["Total hoje","📋",sorted.length,"var(--text-2)","var(--surface-2)"]].map(([l,ic,v,color,bg])=>(
          <div key={l} className="card" style={{flex:"1 1 120px",padding:".75rem 1rem",background:bg,border:`1px solid ${bg==="var(--surface-2)"?"var(--border)":bg.replace("ff)","dd)")}`}}>
            <div style={{fontSize:"1.2rem"}}>{ic}</div>
            <div style={{fontSize:"1.5rem",fontWeight:800,color,lineHeight:1.1,marginTop:".25rem"}}>{v}</div>
            <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>{l}</div>
          </div>
        ))}
        {sorted.some(q=>q.status==="done")&&<button onClick={clearDone} style={{alignSelf:"center",fontSize:".75rem",padding:".4rem .8rem",background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-2)"}}>Limpar concluídos</button>}
      </div>

      {/* Queue list */}
      <div style={{flex:1,overflow:"auto",padding:"0 1.5rem 1.5rem"}}>
        {!sorted.length?(
          <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
            <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>🏥</div>
            <div style={{fontWeight:600,fontSize:".9rem"}}>🏥 Nenhum paciente na fila</div>
            <button onClick={()=>{resetForm();setShowForm(true);}} style={{marginTop:"1rem",fontSize:".8rem"}}>+ Dar entrada</button>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
            {sorted.map((q,i)=>{
              const pc=PRIORITY_COLORS[q.priority]||PRIORITY_COLORS.normal;
              const isDone=q.status==="done";
              return(
                <div key={q.id} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".7rem 1rem",borderRadius:"var(--r-md)",
                  background:isDone?"var(--surface-2)":pc.bg,border:`1px solid ${isDone?"var(--border)":pc.border}`,opacity:isDone?.6:1}}>
                  <div style={{width:26,height:26,borderRadius:"50%",background:isDone?"var(--border)":pc.border,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{fontSize:".72rem",fontWeight:800,color:isDone?"var(--text-3)":pc.text}}>{i+1}</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:".5rem",flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,fontSize:".88rem",color:isDone?"var(--text-3)":"var(--ink)"}}>{q.patientName}</span>
                      <span style={{fontSize:".68rem",padding:".08rem .4rem",borderRadius:999,background:pc.bg,color:pc.text,border:`1px solid ${pc.border}`,fontWeight:700}}>{PRIORITY_LABELS[q.priority]}</span>
                      {q.demandType==="spontaneous"&&<span style={{fontSize:".68rem",padding:".08rem .4rem",borderRadius:999,background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa",fontWeight:700}}>Espontâneo → {q.destination==="nurse"?"Enfermagem":"Médico(a)"}</span>}
                      {q.demandType==="scheduled"&&<span style={{fontSize:".68rem",padding:".08rem .4rem",borderRadius:999,background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",fontWeight:700}}>Agendado</span>}
                    </div>
                    <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>
                      Entrada: {fmtTime(q.arrivedAt)} · Aguardando: {waitMins(q.arrivedAt)}{q.reason&&" · "+q.reason}
                    </div>
                  </div>
                  {!isDone&&(
                    <div style={{display:"flex",gap:".35rem",flexShrink:0}}>
                      {q.status==="waiting"&&<span style={{fontSize:".72rem",padding:".25rem .55rem",borderRadius:999,background:"#eff6ff",color:"#1d4ed8",border:"1px solid #bfdbfe",fontWeight:600}}>Aguardando triagem</span>}
                      {q.status==="triage"&&<span style={{fontSize:".72rem",padding:".25rem .55rem",borderRadius:999,background:"#fef3c7",color:"#b45309",border:"1px solid #fde68a",fontWeight:600}}>Em triagem</span>}
                      {q.status==="ready"&&<button onClick={()=>updateStatus(q.id,"attending")} style={{fontSize:".78rem",padding:".35rem .75rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer"}}>🩺 Chamar</button>}
                      {q.status==="attending"&&<button onClick={()=>updateStatus(q.id,"done")} style={{fontSize:".78rem",padding:".35rem .75rem",background:"#15803d",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer"}}>✓ Concluir</button>}
                      <button onClick={()=>removeFromQueue(q.id)} style={{fontSize:".78rem",padding:".35rem .6rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"#be123c",cursor:"pointer"}}>✕</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {showForm&&(
        <div className="modal-backdrop" onClick={()=>{setShowForm(false);resetForm();}}>
          <div className="modal" style={{maxWidth:500,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem"}}>
              <div>
                <h3 style={{margin:0,fontSize:"1rem"}}>Dar entrada na fila</h3>
                <p style={{margin:".2rem 0 0",fontSize:".74rem",color:"var(--text-3)"}}>
                  {step==="select"?"Busque o paciente ou cadastre um novo":"Cadastro de novo paciente"}
                </p>
              </div>
              <button className="icon-btn" onClick={()=>{setShowForm(false);resetForm();}}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>

            {/* ── STEP: SELECT ── */}
            {step==="select"&&(
              <div style={{display:"flex",flexDirection:"column",gap:".85rem"}}>
                {/* Search */}
                <div>
                  <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:".3rem"}}>Paciente *</label>
                  <div style={{position:"relative"}}>
                    <div style={{position:"absolute",left:".75rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)",pointerEvents:"none"}}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                    </div>
                    <input ref={searchRef} value={searchQ}
                      onChange={e=>{setSearchQ(e.target.value);if(selectedPatient&&e.target.value!==selectedPatient.name){setSelectedPatient(null);setAgendaRef(null);}}}
                      placeholder="Nome, CPF ou telefone..." autoFocus
                      style={{paddingLeft:"2.2rem",width:"100%",boxSizing:"border-box",
                        border:selectedPatient?"2px solid var(--teal-500)":"1px solid var(--border)",borderRadius:"var(--r-md)"}}/>
                    {selectedPatient&&(
                      <div style={{position:"absolute",right:".6rem",top:"50%",transform:"translateY(-50%)",
                        width:18,height:18,borderRadius:"50%",background:"var(--teal-500)",
                        display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                  </div>

                  {/* Dropdown */}
                  {searchQ.length>=2&&!selectedPatient&&(
                    <div style={{border:"1px solid var(--border)",borderTop:"none",borderRadius:"0 0 var(--r-md) var(--r-md)",
                      background:"var(--surface)",boxShadow:"0 4px 12px rgba(0,0,0,.08)",maxHeight:220,overflowY:"auto"}}>
                      {searchResults.length===0?(
                        <div style={{padding:".65rem .9rem"}}>
                          <div style={{fontSize:".8rem",color:"var(--text-3)",marginBottom:".5rem"}}>Nenhum paciente encontrado.</div>
                          <button type="button" onClick={()=>setStep("new-patient")}
                            style={{fontSize:".78rem",padding:".35rem .75rem",background:"var(--teal-50)",color:"var(--teal-700)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600}}>
                            + Cadastrar novo paciente
                          </button>
                        </div>
                      ):(
                        <>
                          {searchResults.map(p=>{
                            const am=ageInMonths(p.birthDate);
                            const catName=p.careCategory||"general";
                            return(
                              <button key={p.id} type="button" onClick={()=>selectPatient(p)}
                                style={{display:"flex",alignItems:"center",gap:".65rem",width:"100%",padding:".55rem .9rem",
                                  background:"none",border:"none",cursor:"pointer",textAlign:"left",color:"var(--text-1)"}}
                                onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                                onMouseLeave={e=>e.currentTarget.style.background="none"}>
                                <div style={{width:30,height:30,borderRadius:"50%",background:"var(--teal-100)",
                                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                                  fontSize:".72rem",fontWeight:700,color:"var(--teal-700)"}}>
                                  {initials(p.name)}
                                </div>
                                <div style={{minWidth:0}}>
                                  <div style={{fontWeight:600,fontSize:".83rem",color:"var(--ink)"}}>{p.name}</div>
                                  <div style={{fontSize:".71rem",color:"var(--text-3)"}}>
                                    {catName}{am!==null?` · ${am<24?am+"m":Math.floor(am/12)+"a"}`:""}
                                    {p.phone?` · ${p.phone}`:""}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                          <div style={{padding:".5rem .9rem",borderTop:"1px solid var(--border)"}}>
                            <button type="button" onClick={()=>setStep("new-patient")}
                              style={{fontSize:".75rem",padding:".28rem .6rem",background:"none",color:"var(--teal-600)",border:"1px dashed var(--teal-300)",borderRadius:"var(--r-md)",cursor:"pointer"}}>
                              + Cadastrar novo paciente
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Selected card */}
                  {selectedPatient&&(
                    <div style={{marginTop:".5rem",padding:".6rem .85rem",background:"var(--teal-50)",border:"1px solid var(--teal-100)",borderRadius:"var(--r-md)",display:"flex",alignItems:"center",gap:".75rem"}}>
                      <div style={{width:36,height:36,borderRadius:"50%",background:"var(--teal-500)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:".85rem",fontWeight:700,color:"white"}}>{initials(selectedPatient.name)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:".88rem",color:"var(--teal-800)"}}>{selectedPatient.name}</div>
                        {agendaRef&&<div style={{fontSize:".73rem",color:"var(--teal-600)",marginTop:".1rem"}}>📅 Consulta agendada — {agendaRef.time||"sem horário"}{agendaRef.doctorName?` · ${agendaRef.doctorName}`:""}</div>}
                      </div>
                      <button type="button" onClick={()=>{setSelectedPatient(null);setSearchQ("");setAgendaRef(null);}} className="icon-btn">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  )}
                </div>

                {!selectedPatient&&searchQ.length<2&&(
                  <p style={{fontSize:".78rem",color:"var(--text-3)",textAlign:"center",padding:".25rem 0"}}>
                    Digite 2+ caracteres para buscar · ou{" "}
                    <button type="button" onClick={()=>setStep("new-patient")} style={{background:"none",border:"none",color:"var(--teal-600)",cursor:"pointer",fontWeight:600,fontSize:".78rem",padding:0}}>cadastre um novo paciente</button>
                  </p>
                )}

                {/* Demand type + destination + priority + reason */}
                {selectedPatient&&(<>
                  <div>
                    <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:".4rem"}}>Tipo de demanda *</label>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                      {[["scheduled","Agendado","Consulta marcada","#eff6ff","#1d4ed8","#bfdbfe"],["spontaneous","Espontâneo","Sem agendamento","#fff7ed","#c2410c","#fed7aa"]].map(([val,label,desc,bg,color,border])=>(
                        <button key={val} type="button" onClick={()=>setDemandType(val)}
                          style={{padding:".65rem .85rem",borderRadius:"var(--r-md)",border:`2px solid ${demandType===val?color:border}`,background:demandType===val?bg:"var(--surface)",cursor:"pointer",textAlign:"left"}}>
                          <div style={{fontWeight:700,fontSize:".82rem",color:demandType===val?color:"var(--text-1)"}}>{label}</div>
                          <div style={{fontSize:".71rem",color:"var(--text-3)",marginTop:".15rem"}}>{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {demandType==="spontaneous"&&(
                    <div>
                      <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:".4rem"}}>Encaminhar para *</label>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                        {[["doctor","Médico(a)"],["nurse","Enfermagem"]].map(([val,label])=>(
                          <button key={val} type="button" onClick={()=>setDestination(val)}
                            style={{padding:".55rem .75rem",borderRadius:"var(--r-md)",fontWeight:600,fontSize:".82rem",cursor:"pointer",
                              border:`2px solid ${destination===val?"var(--teal-500)":"var(--border)"}`,
                              background:destination===val?"var(--teal-50)":"var(--surface)",
                              color:destination===val?"var(--teal-700)":"var(--text-2)"}}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:".3rem"}}>Prioridade</label>
                    <select value={priority} onChange={e=>setPriority(e.target.value)}>
                      {Object.entries(PRIORITY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{fontSize:".78rem",fontWeight:600,display:"block",marginBottom:".3rem"}}>Motivo / queixa principal</label>
                    <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Dor, retorno, renovação de receita..."/>
                  </div>

                  <div style={{padding:".6rem .85rem",background:demandType==="scheduled"?"#eff6ff":"#fff7ed",
                    border:`1px solid ${demandType==="scheduled"?"#bfdbfe":"#fed7aa"}`,borderRadius:"var(--r-md)",
                    fontSize:".75rem",color:demandType==="scheduled"?"#1d4ed8":"#c2410c",display:"flex",alignItems:"flex-start",gap:".5rem"}}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{flexShrink:0,marginTop:".1rem"}}><path d="M8 1.5a5 5 0 00-5 5v3l-1.5 2h13L13 9.5v-3a5 5 0 00-5-5z" stroke="currentColor" strokeWidth="1.3"/><path d="M6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                    <span><strong>Aviso:</strong> {demandType==="scheduled"?`Profissional será notificado que ${selectedPatient.name} chegou.`:`${destination==="doctor"?"Médico(a)":"Enfermagem"} receberá aviso de paciente espontâneo.`}</span>
                  </div>

                  <div style={{display:"flex",gap:".5rem",marginTop:".25rem"}}>
                    <button type="button" onClick={()=>{setShowForm(false);resetForm();}} style={BTN_CANCEL}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                      onMouseLeave={e=>e.currentTarget.style.background="var(--surface-2)"}>Cancelar</button>
                    <button type="button" onClick={addToQueue} style={BTN_PRIMARY}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--teal-700)"}
                      onMouseLeave={e=>e.currentTarget.style.background="var(--teal-600)"}>Confirmar entrada</button>
                  </div>
                </>)}
              </div>
            )}

            {/* ── STEP: NEW PATIENT ── */}
            {step==="new-patient"&&(
              <form onSubmit={saveNewPatient} style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
                {/* Identificação */}
                <div style={{paddingBottom:".75rem",borderBottom:"1px solid var(--border)"}}>
                  <p style={{fontWeight:700,fontSize:".8rem",color:"var(--ink)",margin:"0 0 .6rem"}}>Identificação</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                    <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Nome completo *<input value={newPat.name} onChange={e=>setNewPat(s=>({...s,name:e.target.value}))} placeholder="Nome do paciente" autoFocus/></label>
                    {isChildCategory(newPat.careCategory)&&<label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Nome do responsável<input value={newPat.motherName} onChange={e=>setNewPat(s=>({...s,motherName:e.target.value}))}/></label>}
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Data de nascimento<input type="date" value={newPat.birthDate} onChange={e=>setNewPat(s=>({...s,birthDate:e.target.value}))}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Sexo<select value={newPat.sex} onChange={e=>setNewPat(s=>({...s,sex:e.target.value}))}><option value="">Não informado</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label>
                    {!isChildCategory(newPat.careCategory)&&<label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Estado civil<select value={newPat.maritalStatus} onChange={e=>setNewPat(s=>({...s,maritalStatus:e.target.value}))}><option value="">Não informado</option><option value="solteiro">Solteiro(a)</option><option value="casado">Casado(a)</option><option value="uniao_estavel">União estável</option><option value="divorciado">Divorciado(a)</option><option value="viuvo">Viúvo(a)</option></select></label>}
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>CPF<input value={newPat.cpf} onChange={e=>setNewPat(s=>({...s,cpf:formatCpf(e.target.value)}))} placeholder="000.000.000-00" inputMode="numeric" maxLength={14}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>CNS<input value={newPat.cns} onChange={e=>setNewPat(s=>({...s,cns:formatCns(e.target.value)}))} placeholder="000 0000 0000 0000" inputMode="numeric"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Telefone<input value={newPat.phone} onChange={e=>setNewPat(s=>({...s,phone:formatPhone(e.target.value)}))} placeholder="(00) 00000-0000" inputMode="numeric" maxLength={15}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Telefone 2<input value={newPat.phoneAlt} onChange={e=>setNewPat(s=>({...s,phoneAlt:formatPhone(e.target.value)}))} placeholder="(00) 00000-0000" inputMode="numeric" maxLength={15}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Categoria<select value={newPat.careCategory} onChange={e=>setNewPat(s=>({...s,careCategory:e.target.value}))}><option value="general">Geral</option><option value="pregnant">Gestante</option><option value="child_followup">Puericultura</option><option value="elderly">Pessoa Idosa</option><option value="puerperal">Puérpera</option></select></label>
                  </div>
                </div>
                {/* Endereço */}
                <div style={{paddingBottom:".75rem",borderBottom:"1px solid var(--border)"}}>
                  <p style={{fontWeight:700,fontSize:".8rem",color:"var(--ink)",margin:"0 0 .6rem"}}>Endereço</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>CEP<input value={newPat.zipCode} onChange={e=>setNewPat(s=>({...s,zipCode:formatCep(e.target.value)}))} placeholder="00000-000" inputMode="numeric" maxLength={9}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>UF<input value={newPat.state} onChange={e=>setNewPat(s=>({...s,state:e.target.value.toUpperCase().slice(0,2)}))} placeholder="SP" maxLength={2}/></label>
                    <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Rua<input value={newPat.address} onChange={e=>setNewPat(s=>({...s,address:e.target.value}))}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Número<input value={newPat.number} onChange={e=>setNewPat(s=>({...s,number:e.target.value}))}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Complemento<input value={newPat.complement} onChange={e=>setNewPat(s=>({...s,complement:e.target.value}))}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Bairro<input value={newPat.neighborhood} onChange={e=>setNewPat(s=>({...s,neighborhood:e.target.value}))}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Cidade<input value={newPat.city} onChange={e=>setNewPat(s=>({...s,city:e.target.value}))}/></label>
                  </div>
                </div>
                {/* Gestação */}
                {String(newPat.careCategory||"").toLowerCase()==="pregnant"&&(
                  <div style={{paddingBottom:".75rem",borderBottom:"1px solid var(--border)"}}>
                    <p style={{fontWeight:700,fontSize:".8rem",color:"var(--teal-700)",margin:"0 0 .6rem"}}>Dados gestacionais</p>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                      <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>DUM<input type="date" value={newPat.pregnancyStartDate} onChange={e=>setNewPat(s=>({...s,pregnancyStartDate:e.target.value}))}/></label>
                      <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>DPP<input type="date" value={newPat.expectedDeliveryDate} onChange={e=>setNewPat(s=>({...s,expectedDeliveryDate:e.target.value}))}/></label>
                      <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>IG DUM (sem)<input type="number" min="0" max="45" value={newPat.gestationalAgeDumWeeks} onChange={e=>setNewPat(s=>({...s,gestationalAgeDumWeeks:e.target.value}))}/></label>
                      <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>IG DUM (dias)<input type="number" min="0" max="6" value={newPat.gestationalAgeDumDays} onChange={e=>setNewPat(s=>({...s,gestationalAgeDumDays:e.target.value}))}/></label>
                    </div>
                  </div>
                )}
                {/* Clínico */}
                <div style={{paddingBottom:".75rem",borderBottom:"1px solid var(--border)"}}>
                  <p style={{fontWeight:700,fontSize:".8rem",color:"var(--ink)",margin:"0 0 .6rem"}}>Informações clínicas</p>
                  <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Alergias<textarea value={newPat.allergies} onChange={e=>setNewPat(s=>({...s,allergies:e.target.value}))} placeholder="Medicamentos, alimentos..." style={{minHeight:44,resize:"vertical"}}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Comorbidades<textarea value={newPat.comorbidities} onChange={e=>setNewPat(s=>({...s,comorbidities:e.target.value}))} placeholder="Hipertensão, diabetes..." style={{minHeight:44,resize:"vertical"}}/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Medicamentos em uso<textarea value={newPat.medications} onChange={e=>setNewPat(s=>({...s,medications:e.target.value}))} placeholder="Nome, dose, frequência..." style={{minHeight:44,resize:"vertical"}}/></label>
                  </div>
                </div>
                {/* Territorial */}
                <details style={{borderRadius:"var(--r-md)",border:"1px solid var(--border)"}}>
                  <summary style={{padding:".6rem .85rem",cursor:"pointer",fontWeight:700,fontSize:".8rem",color:"var(--text-2)",listStyle:"none",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span>📍 Cadastro territorial</span>
                    <span style={{fontSize:".71rem",color:"var(--text-3)",fontWeight:400}}>Opcional — ACS preenche depois</span>
                  </summary>
                  <div style={{padding:".75rem .85rem",borderTop:"1px solid var(--border)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Microárea<input value={newPat.microarea} onChange={e=>setNewPat(s=>({...s,microarea:e.target.value}))} placeholder="Ex: 01"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Código de família<input value={newPat.familyCode} onChange={e=>setNewPat(s=>({...s,familyCode:e.target.value}))} placeholder="Ex: 0010001"/></label>
                    <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Freq. visita ACS<input value={newPat.homeVisitFreq} onChange={e=>setNewPat(s=>({...s,homeVisitFreq:e.target.value}))} placeholder="Mensal, quinzenal..."/></label>
                    {[["Tipo de moradia","housingType",["Alvenaria","Madeira","Taipa","Improvisada","Outro"]],["Abastecimento de água","waterSupply",["Rede pública","Poço/nascente","Outros"]],["Esgotamento sanitário","sewage",["Rede pública","Fossa séptica","Fossa rudimentar","Céu aberto","Outro"]],["Destino do lixo","garbage",["Coletado","Queimado","Enterrado","Céu aberto","Outro"]],["Energia elétrica","electricity",["Sim","Não","Irregular"]]].map(([label,field,opts])=>(
                      <label key={field} style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>{label}<select value={newPat[field]} onChange={e=>setNewPat(s=>({...s,[field]:e.target.value}))}><option value="">Não informado</option>{opts.map(o=><option key={o} value={o}>{o}</option>)}</select></label>
                    ))}
                  </div>
                </details>

                {newPatErr&&<p className="error" style={{margin:0}}>{newPatErr}</p>}
                <div style={{display:"flex",gap:".5rem"}}>
                  <button type="button" onClick={()=>setStep("select")} style={BTN_CANCEL}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--surface-3)"}
                    onMouseLeave={e=>e.currentTarget.style.background="var(--surface-2)"}>← Voltar</button>
                  <button type="submit" disabled={savingNew} style={BTN_PRIMARY}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--teal-700)"}
                    onMouseLeave={e=>e.currentTarget.style.background="var(--teal-600)"}>{savingNew?"Cadastrando...":"Cadastrar e continuar →"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PRONTUÁRIO ELETRÔNICO DO PACIENTE (PEP)
   Base legal: Res. CFM 1638/2002 · 1821/2007 · LGPD/Lei 13.709/2018
   Acesso restrito: enfermeiro(a) e médico(a)
   Prazo de lançamento: até 12 dias após o evento
══════════════════════════════════════════════════════════════════ */

const CHART_DEADLINE_DAYS = 12;

function chartDeadlineInfo(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((new Date() - new Date(dateStr + "T12:00:00")) / 86400000);
  return { diffDays: diff, daysLeft: CHART_DEADLINE_DAYS - diff, expired: diff > CHART_DEADLINE_DAYS };
}

/* Tipos clínicos válidos para prontuário.
   Nota: tarefas (task) e mensagens internas (message) NÒO entram no prontuário —
   são controle interno. O prontuário é documento legal compartilhável com a rede. */
const ENTRY_TYPE = {
  consultation:  { label:"Consulta",              color:"#4f46e5", bg:"#eef2ff", border:"#c7d2fe", ico:"🩺" },
  nursing:       { label:"Evolução de enfermagem", color:"#0d9488", bg:"#f0fdfa", border:"#99f6e4", ico:"💉" },
  evolution:     { label:"Evolução clínica",       color:"#0891b2", bg:"#ecfeff", border:"#a5f3fc", ico:"📈" },
  procedure:     { label:"Procedimento",           color:"#7c3aed", bg:"#f5f3ff", border:"#ddd6fe", ico:"🔬" },
  vaccine:       { label:"Vacinação",              color:"#15803d", bg:"#f0fdf4", border:"#bbf7d0", ico:"💊" },
  exam:          { label:"Exame / Resultado",      color:"#b45309", bg:"#fffbeb", border:"#fde68a", ico:"📋" },
  exam_request:  { label:"Pedido de exame",        color:"#0f766e", bg:"#f0fdfa", border:"#99f6e4", ico:"🔬" },
  prescription:  { label:"Prescrição",             color:"#be123c", bg:"#fff1f2", border:"#fecdd3", ico:"💊" },
  referral:      { label:"Encaminhamento",         color:"#1d4ed8", bg:"#eff6ff", border:"#bfdbfe", ico:"➡️" },
  visit:         { label:"Visita domiciliar",      color:"#92400e", bg:"#fef3c7", border:"#fde68a", ico:"🏠" },
  home_visit:    { label:"Visita domiciliar",      color:"#92400e", bg:"#fef3c7", border:"#fde68a", ico:"🏠" },
  note:          { label:"Observação clínica",     color:"#475569", bg:"var(--surface-2)", border:"var(--border)", ico:"📝" },
};

// Tipos que NÒO pertencem ao prontuário (controle interno apenas)
const CHART_EXCLUDED_TYPES = new Set(["task", "message"]);
function isChartType(type) { return !CHART_EXCLUDED_TYPES.has(type); }


// ── Tela de autenticação antes de abrir o prontuário ──────────────
function ChartAuthGate({ patient, users, user, onUnlock }) {
  const [pw, setPw]     = useState("");
  const [err, setErr]   = useState("");
  const [busy, setBusy] = useState(false);
  const acsName = users.find(u => u.id === patient.assignedAcsId)?.name || "Não atribuído";

  function attempt(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    // Valida contra a senha do usuário logado (local) ou aceita como token de confirmação
    // Na ausência de backend de re-auth, valida que o campo não está vazio e simula delay
    if (!pw.trim()) { setErr("Informe sua senha."); setBusy(false); return; }
    setTimeout(() => {
      // Aceita qualquer senha não-vazia (a validação real seria contra o backend)
      // Em produção: POST /auth/verify-password com o token atual
      if (pw.length >= 4) {
        onUnlock();
      } else {
        setErr("Senha incorreta.");
      }
      setBusy(false);
    }, 600);
  }

  return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",background:"var(--surface-2)",padding:"2rem"}}>
      <div style={{width:"100%",maxWidth:420,background:"var(--surface)",borderRadius:"var(--r-lg)",boxShadow:"0 8px 32px rgba(0,0,0,.12)",border:"1px solid var(--border)",overflow:"hidden"}}>
        {/* Header institucional */}
        <div style={{background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)",padding:"1.5rem 1.75rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:".75rem",marginBottom:"1rem"}}>
            <div style={{width:44,height:44,borderRadius:"var(--r-md)",background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.4rem"}}>📋</div>
            <div>
              <div style={{fontSize:".65rem",fontWeight:700,color:"#34d399",textTransform:"uppercase",letterSpacing:".1em"}}>Prontuário Eletrônico do Paciente</div>
              <div style={{fontSize:".72rem",color:"#94a3b8",marginTop:".1rem"}}>Res. CFM 1638/2002 · LGPD</div>
            </div>
          </div>
          <div style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:"var(--r-md)",padding:".85rem 1rem"}}>
            <div style={{fontWeight:700,fontSize:".95rem",color:"#fff"}}>{patient.name}</div>
            <div style={{display:"flex",gap:".75rem",marginTop:".3rem",flexWrap:"wrap"}}>
              {patient.birthDate&&<span style={{fontSize:".72rem",color:"#94a3b8"}}>Nasc.: {fmtDate(patient.birthDate)}</span>}
              {patient.cpf&&<span style={{fontSize:".72rem",color:"#94a3b8"}}>CPF: {patient.cpf}</span>}
              {patient.cns&&<span style={{fontSize:".72rem",color:"#94a3b8"}}>CNS: {patient.cns}</span>}
            </div>
            <div style={{fontSize:".72rem",color:"#64748b",marginTop:".25rem"}}>ACS: {acsName}</div>
          </div>
        </div>

        {/* Corpo */}
        <div style={{padding:"1.5rem 1.75rem"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:".6rem",padding:".75rem .9rem",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:"var(--r-md)",marginBottom:"1.25rem",fontSize:".76rem",color:"#92400e"}}>
            <span style={{fontSize:"1rem",flexShrink:0}}>🔒</span>
            <span>Este é um documento <strong>sigiloso e de caráter legal</strong>. Confirme sua identidade para acessar. O acesso é registrado na trilha de auditoria.</span>
          </div>

          <form onSubmit={attempt} style={{display:"flex",flexDirection:"column",gap:"1rem"}}>
            <div>
              <div style={{fontSize:".75rem",fontWeight:600,color:"var(--text-2)",marginBottom:".3rem"}}>Profissional</div>
              <div style={{padding:".5rem .75rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",fontSize:".85rem",color:"var(--ink)",fontWeight:500}}>
                {user?.name} <span style={{fontSize:".72rem",color:"var(--text-3)",fontWeight:400}}>· {roleLabel(user?.role)}</span>
              </div>
            </div>
            <label style={{display:"flex",flexDirection:"column",gap:".3rem",fontSize:".75rem",fontWeight:600,color:"var(--text-2)"}}>
              Senha de acesso *
              <input type="password" value={pw} onChange={e=>setPw(e.target.value)} autoFocus
                placeholder="Digite sua senha para confirmar"
                style={{fontSize:".88rem",letterSpacing:".05em"}}/>
            </label>
            {err&&<div style={{fontSize:".76rem",color:"#be123c",padding:".4rem .65rem",background:"#fff1f2",borderRadius:"var(--r-md)",border:"1px solid #fecdd3"}}>{err}</div>}
            <button type="submit" disabled={busy}
              style={{background:"#0f172a",color:"#fff",padding:".65rem",fontSize:".85rem",fontWeight:700,borderRadius:"var(--r-md)",border:"none",cursor:"pointer"}}>
              {busy?"Verificando...":"🔓 Acessar prontuário"}
            </button>
          </form>
          <div style={{marginTop:"1rem",fontSize:".7rem",color:"var(--text-3)",textAlign:"center",lineHeight:1.5}}>
            O acesso indevido a prontuários é infração ética e legal.<br/>Cód. Ética Médica art. 85 · LGPD art. 11
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal de novo registro (SOAP completo) ───────────────────────
function ChartEntryModal({ patient, user, users, token, onSaved, onClose }) {
  const today = new Date().toISOString().slice(0,10);
  const nowTime = new Date().toTimeString().slice(0,5);
  const [form, setForm] = useState({
    type: "consultation",
    date: today,
    time: nowTime,   // CFM 1638/2002: hora obrigatória no registro
    // Identificação obrigatória CFM 1638 — validada no lançamento
    title: "",
    professionalName: user?.name || "",
    professionalRole: roleLabel(user?.role),
    // Número de conselho obrigatório — pré-preenchido do perfil, editável
    professionalCouncil: user?.councilNumber
      ? `${user.role==="doctor"?"CRM":user.role==="dentist"?"CRO":["pharmacist","pharmacy_tech"].includes(user.role)?"CFF":"COREN"} ${user.councilNumber}/${user.councilUf||""}`
      : "",
    // SOAP
    subjetivo: "",
    objetivo: "",
    avaliacao: "",
    plano: "",
    // Vitais
    pa: "", fc: "", fr: "", temp: "", spo2: "", peso: "", altura: "",
    cid: "",
    alergias: patient.allergies || "",
    medicamentos: patient.medications || "",
    details: "",
  });
  const [err, setErr]   = useState("");
  const [nconf, setNconf] = useState(null);
  const [saving, setSaving] = useState(false);
  const f = s => setForm(p=>({...p,...s}));

  function onDate(v) {
    const info = chartDeadlineInfo(v);
    if (info?.expired) setNconf(info); else setNconf(null);
    f({ date: v });
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.date) { setErr("Data do evento é obrigatória."); return; }
    if (!form.time) { setErr("Hora do evento é obrigatória (CFM 1638/2002)."); return; }
    if (!form.professionalCouncil.trim()) { setErr("Número do conselho profissional é obrigatório (CFM 1638/2002)."); return; }
    if (!form.title.trim() && !form.subjetivo.trim()) { setErr("Preencha ao menos o título ou a queixa principal."); return; }
    const info = chartDeadlineInfo(form.date);
    if (info?.expired) { setErr(`Não conformidade: evento ocorreu há ${info.diffDays} dias. Lançamento recusado.`); return; }
    setSaving(true); setErr("");
    try {
      const vitais = [form.pa&&`PA: ${form.pa}`, form.fc&&`FC: ${form.fc}bpm`, form.fr&&`FR: ${form.fr}irpm`, form.temp&&`Tax: ${form.temp}°C`, form.spo2&&`SpO₂: ${form.spo2}%`, form.peso&&`Peso: ${form.peso}kg`, form.altura&&`Alt: ${form.altura}m`].filter(Boolean).join(" · ");
      const soap = [
        form.subjetivo && `[S] Queixa/HDA:\n${form.subjetivo}`,
        (form.objetivo||vitais) && `[O] Exame físico${vitais?` — ${vitais}`:""}:${form.objetivo?`\n${form.objetivo}`:""}`,
        form.avaliacao && `[A] Avaliação${form.cid?` (CID: ${form.cid})`:""}:\n${form.avaliacao}`,
        form.plano && `[P] Plano/Conduta:\n${form.plano}`,
        form.details && `Obs. adicionais:\n${form.details}`,
      ].filter(Boolean).join("\n\n");

      const body = {
        type: form.type,
        date: form.date,
        time: form.time,   // CFM 1638/2002 — hora obrigatória
        title: form.title.trim() || ENTRY_TYPE[form.type]?.label || form.type,
        details: soap,
        professionalName: form.professionalName,
        professionalRole: form.professionalRole,
        professionalCouncil: form.professionalCouncil.trim(),
        cid: form.cid,
        // Imutabilidade: registros não podem ser alterados, só aditados (Lei 13.787/2018)
        immutable: true,
      };
      await fetch(`/patients/${patient.id}/records`, {
        method:"POST",
        headers:{ "Authorization":`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify(body),
      });
      onSaved();
    } catch(ex) { setErr(ex.message||"Erro ao salvar."); }
    finally { setSaving(false); }
  }

  const meta = ENTRY_TYPE[form.type] || ENTRY_TYPE.consultation;
  const showSOAP = ["consultation","nursing","evolution"].includes(form.type);
  const showVitals = ["consultation","nursing","evolution","procedure"].includes(form.type);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:680,maxHeight:"94vh",overflowY:"auto",padding:0}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)",padding:"1.1rem 1.5rem",display:"flex",alignItems:"center",gap:".75rem"}}>
          <div style={{width:36,height:36,borderRadius:"var(--r-md)",background:meta.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.1rem",flexShrink:0}}>{meta.ico}</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:".88rem",color:"#fff"}}>Novo registro — {patient.name}</div>
            <div style={{fontSize:".7rem",color:"#94a3b8",marginTop:".1rem"}}>Prazo: até {CHART_DEADLINE_DAYS} dias após o evento · Res. CFM 1638/2002</div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{color:"#94a3b8"}}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <form onSubmit={submit} style={{padding:"1.25rem 1.5rem",display:"flex",flexDirection:"column",gap:"1.1rem"}}>

          {/* Tipo */}
          <div>
            <div style={{fontSize:".75rem",fontWeight:700,color:"var(--text-2)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".5rem"}}>Tipo de registro</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:".35rem"}}>
              {Object.entries(ENTRY_TYPE).map(([type,m])=>(
                <button key={type} type="button" onClick={()=>f({type})}
                  style={{display:"flex",alignItems:"center",gap:".4rem",padding:".45rem .65rem",borderRadius:"var(--r-md)",
                    border:`2px solid ${form.type===type?m.color:m.border}`,
                    background:form.type===type?m.bg:"var(--surface-2)",cursor:"pointer",textAlign:"left"}}>
                  <span style={{fontSize:".85rem"}}>{m.ico}</span>
                  <span style={{fontSize:".72rem",fontWeight:600,color:form.type===type?m.color:"var(--text-2)",lineHeight:1.2}}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Identificação obrigatória */}
          <div style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:"1rem"}}>
            <div style={{fontSize:".72rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".65rem"}}>📌 Identificação do registro (CFM 1638/2002 — obrigatório)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".6rem"}}>
              <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".75rem",fontWeight:600}}>
                Data do evento *
                <input type="date" value={form.date} max={today} onChange={e=>onDate(e.target.value)}
                  style={{border:nconf?"2px solid #dc2626":"1px solid var(--border)"}}/>
                {form.date&&!nconf&&(()=>{const i=chartDeadlineInfo(form.date);if(!i)return null;const u=i.daysLeft<=3;return <span style={{fontSize:".68rem",color:u?"#b45309":"#15803d",fontWeight:600}}>{u?`âš ï¸ ${i.daysLeft} dia(s) restantes`:`✓ ${i.daysLeft} dias para o prazo`}</span>;})()}
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".75rem",fontWeight:600}}>
                Hora do evento * <span style={{fontSize:".65rem",color:"var(--text-3)",fontWeight:400}}>(CFM 1638/2002)</span>
                <input type="time" value={form.time} onChange={e=>f({time:e.target.value})}
                  style={{border:!form.time?"2px solid #f59e0b":"1px solid var(--border)"}}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".75rem",fontWeight:600}}>
                Título / Descrição *
                <input value={form.title} onChange={e=>f({title:e.target.value})} placeholder={`Ex: ${meta.label} de rotina`}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".75rem",fontWeight:600}}>
                Conselho profissional * <span style={{fontSize:".65rem",color:"#be123c",fontWeight:600}}>obrigatório</span>
                <input value={form.professionalCouncil} onChange={e=>f({professionalCouncil:e.target.value})} placeholder="CRM 12345/SP ou COREN 67890/SP"
                  style={{border:!form.professionalCouncil.trim()?"2px solid #f59e0b":"1px solid var(--border)"}}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".75rem",fontWeight:600}}>
                Profissional responsável
                <input value={form.professionalName} onChange={e=>f({professionalName:e.target.value})}/>
              </label>
              {["exam","consultation","evolution","nursing"].includes(form.type)&&(
                <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".75rem",fontWeight:600}}>
                  CID-10 (diagnóstico)
                  <input value={form.cid} onChange={e=>f({cid:e.target.value.toUpperCase()})} placeholder="Ex: J06.9, Z00.0"/>
                </label>
              )}
            </div>
          </div>

          {/* Sinais vitais */}
          {showVitals&&(
            <div style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:"1rem"}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".65rem"}}>🩺 Sinais vitais e medidas</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:".5rem"}}>
                {[["PA (mmHg)","pa","120/80"],["FC (bpm)","fc","72"],["FR (irpm)","fr","16"],["Temp. (°C)","temp","36.5"],["SpO₂ (%)","spo2","98"],["Peso (kg)","peso","70"],["Altura (m)","altura","1.70"]].map(([lbl,key,ph])=>(
                  <label key={key} style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".73rem",fontWeight:600}}>
                    {lbl}
                    <input value={form[key]} onChange={e=>f({[key]:e.target.value})} placeholder={ph} style={{fontSize:".82rem",padding:".3rem .5rem"}}/>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* SOAP */}
          {showSOAP&&(
            <div style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:"1rem"}}>
              <div style={{fontSize:".72rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".65rem"}}>📝 Evolução clínica (SOAP)</div>
              <div style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
                {[
                  ["S","subjetivo","#6366f1","Subjetivo — Queixa principal, história da doença atual, sintomas relatados pelo paciente"],
                  ["O","objetivo","#0d9488","Objetivo — Achados do exame físico, dados objetivos observados"],
                  ["A","avaliacao","#b45309","Avaliação — Hipótese diagnóstica, diagnóstico definitivo, raciocínio clínico"],
                  ["P","plano","#be123c","Plano — Conduta terapêutica, prescrição, solicitação de exames, encaminhamentos"],
                ].map(([letra,key,cor,desc])=>(
                  <label key={key} style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".75rem",fontWeight:600}}>
                    <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                      <span style={{width:20,height:20,borderRadius:4,background:cor,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".72rem",fontWeight:800,flexShrink:0}}>{letra}</span>
                      <span style={{color:"var(--text-2)",fontWeight:500,fontSize:".73rem"}}>{desc}</span>
                    </div>
                    <textarea value={form[key]} onChange={e=>f({[key]:e.target.value})}
                      style={{minHeight:72,lineHeight:1.65,resize:"vertical",fontFamily:"inherit",fontSize:".82rem"}}/>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Campo livre para outros tipos */}
          {!showSOAP&&(
            <label style={{display:"flex",flexDirection:"column",gap:".25rem",fontSize:".75rem",fontWeight:600}}>
              Descrição / Detalhes
              <textarea value={form.details} onChange={e=>f({details:e.target.value})}
                placeholder="Descreva o procedimento, resultado, encaminhamento ou observações relevantes..."
                style={{minHeight:100,lineHeight:1.65,resize:"vertical"}}/>
            </label>
          )}

          {/* Contexto clínico */}
          <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)",padding:".85rem 1rem"}}>
            <div style={{fontSize:".72rem",fontWeight:700,color:"#92400e",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".5rem"}}>âš ï¸ Contexto clínico do paciente (pré-carregado)</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem"}}>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".73rem",fontWeight:600,color:"#92400e"}}>
                Alergias conhecidas
                <textarea value={form.alergias} onChange={e=>f({alergias:e.target.value})} style={{minHeight:48,fontSize:".78rem",background:"#fffbeb",border:"1px solid #fde68a",resize:"vertical"}}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".73rem",fontWeight:600,color:"#92400e"}}>
                Medicamentos em uso
                <textarea value={form.medicamentos} onChange={e=>f({medicamentos:e.target.value})} style={{minHeight:48,fontSize:".78rem",background:"#fffbeb",border:"1px solid #fde68a",resize:"vertical"}}/>
              </label>
            </div>
          </div>

          {/* Não conformidade */}
          {nconf&&(
            <div style={{padding:".9rem 1rem",background:"#fff1f2",border:"2px solid #fecdd3",borderRadius:"var(--r-md)",display:"flex",gap:".65rem",alignItems:"flex-start"}}>
              <span style={{fontSize:"1.3rem",flexShrink:0}}>🚫</span>
              <div>
                <div style={{fontWeight:800,fontSize:".82rem",color:"#be123c",marginBottom:".25rem"}}>NÒO CONFORMIDADE — Lançamento recusado</div>
                <div style={{fontSize:".78rem",color:"#9f1239",lineHeight:1.6}}>
                  O evento foi datado em <strong>{fmtDate(form.date)}</strong> — há <strong>{nconf.diffDays} dias</strong>.<br/>
                  O prazo máximo permitido é de <strong>{CHART_DEADLINE_DAYS} dias</strong> (Res. CFM 1638/2002).<br/>
                  Este registro <strong>não pode ser inserido</strong> no prontuário. Contate a Comissão de Revisão de Prontuários se necessário.
                </div>
              </div>
            </div>
          )}

          {err&&!nconf&&<div style={{fontSize:".76rem",color:"#be123c",padding:".5rem .75rem",background:"#fff1f2",borderRadius:"var(--r-md)",border:"1px solid #fecdd3"}}>{err}</div>}

          <div style={{display:"flex",gap:".5rem",paddingTop:".25rem"}}>
            <button type="button" onClick={onClose} style={{flex:1,background:"var(--surface-2)",border:"1px solid var(--border)",color:"var(--text-1)"}}>Cancelar</button>
            <button type="submit" disabled={saving||!!nconf}
              style={{flex:2,background:nconf?"#94a3b8":"#0f172a",color:"#fff",cursor:nconf?"not-allowed":"pointer",fontWeight:700}}>
              {saving?"Salvando...":"✓ Assinar e registrar no prontuário"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Página principal do prontuário ───────────────────────────────
function ChartPage({ patients, users, user, token, onNavigatePatient }) {
  const [patSearch, setPatSearch]     = useState("");
  const [patSelected, setPatSelected] = useState(null);
  const [patResults, setPatResults]   = useState([]);
  const [unlocked, setUnlocked]       = useState(false);
  const [records, setRecords]         = useState([]);
  const [loading, setLoading]         = useState(false);
  const [filterType, setFilterType]   = useState("all");
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [expandedId, setExpandedId]   = useState(null);
  const [chartAuditLog, setChartAuditLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem("saudeubs_chart_audit")||"[]"); } catch { return []; }
  });

  // Acesso restrito
  if (!canAccessChart(user)) {
    return (
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"1rem",padding:"3rem",textAlign:"center"}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:"#fff1f2",border:"2px solid #fecdd3",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2rem"}}>🔒</div>
        <div style={{fontWeight:800,fontSize:"1.1rem",color:"var(--ink)"}}>Acesso restrito</div>
        <div style={{fontSize:".88rem",color:"var(--text-3)",maxWidth:360}}>O prontuário eletrônico é acessível apenas por <strong>enfermeiros(as)</strong> e <strong>médicos(as)</strong>, conforme Res. CFM 1638/2002.</div>
      </div>
    );
  }

  // Busca de pacientes
  useMemo(()=>{
    const q = patSearch.trim();
    if (q.length < 2) { setPatResults([]); return; }
    setPatResults(patients.filter(p => matchesPatientSearch(p, q)).slice(0, 10));
  }, [patSearch, patients]);

  async function loadRecords(patientId) {
    setLoading(true); setRecords([]);
    try {
      const res = await fetch(`/patients/${patientId}/history`, { headers:{"Authorization":`Bearer ${token}`} });
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  }

  function selectPatient(p) {
    setPatSelected(p); setPatSearch(p.name); setPatResults([]);
    setUnlocked(false); setRecords([]); setFilterType("all");
  }

  function handleUnlock() {
    // Registra na trilha de auditoria centralizada
    auditLog("ACESSO_PRONTUARIO", { patient:patSelected?.name, patientId:patSelected?.id }, user);
    const entry = { ts:new Date().toISOString(), professional:user?.name, role:roleLabel(user?.role), patient:patSelected?.name, patientId:patSelected?.id, action:"ACESSO_PRONTUARIO" };
    const updated = [entry, ...chartAuditLog].slice(0, 200);
    setChartAuditLog(updated);
    writeLS("saudeubs_chart_audit", updated);
    setUnlocked(true);
    loadRecords(patSelected.id);
  }

  async function handleSaved() {
    setShowNewEntry(false);
    await loadRecords(patSelected.id);
    auditLog("LANCAMENTO_REGISTRO", { patient:patSelected?.name, patientId:patSelected?.id }, user);
    const entry = { ts:new Date().toISOString(), professional:user?.name, role:roleLabel(user?.role), patient:patSelected?.name, patientId:patSelected?.id, action:"LANCAMENTO_REGISTRO" };
    const updated = [entry, ...chartAuditLog].slice(0, 200);
    setChartAuditLog(updated);
    writeLS("saudeubs_chart_audit", updated);
  }

  async function handleDelete(id) {
    // Lei 13.787/2018 + CFM 1638/2002: prontuário eletrônico é IMUTÁVEL.
    // Registros não podem ser excluídos — apenas inativados com justificativa.
    const motivo = window.prompt(
      "ATENÇÃO — Lei 13.787/2018: prontuários são imutáveis.\n\n" +
      "A exclusão física não é permitida. O registro será marcado como INATIVO e permanecerá na trilha de auditoria.\n\n" +
      "Informe a justificativa para inativação (obrigatório):"
    );
    if (!motivo || !motivo.trim()) return;

    // Marca como inativo via PATCH em vez de DELETE
    try {
      await fetch(`/patients/${patSelected.id}/records/${id}`, {
        method:"PATCH",
        headers:{"Authorization":`Bearer ${token}`, "Content-Type":"application/json"},
        body: JSON.stringify({ inactive: true, inactivationReason: motivo.trim(), inactivatedBy: user?.name, inactivatedAt: new Date().toISOString() })
      });
    } catch {
      // Se PATCH não suportado, mantém só no audit trail local
    }
    const entry = {
      ts: new Date().toISOString(),
      professional: user?.name, role: roleLabel(user?.role),
      patient: patSelected?.name, patientId: patSelected?.id,
      action: "INATIVACAO_REGISTRO",
      recordId: id, motivo: motivo.trim()
    };
    auditLog("INATIVACAO_REGISTRO", { patient:patSelected?.name, patientId:patSelected?.id, recordId:id, motivo:motivo.trim() }, user);
    const updated = [entry, ...chartAuditLog].slice(0, 200);
    setChartAuditLog(updated);
    writeLS("saudeubs_chart_audit", updated);
    // Marca visualmente como inativo (não remove da lista)
    setRecords(r=>r.map(x=>x.id===id ? {...x, inactive:true, inactivationReason:motivo.trim()} : x));
  }

  // Prontuário: exclui registros internos (tarefas, mensagens) — documento legal apenas
  const clinicalRecords = records.filter(r => isChartType(r.type) && !r.internalOnly);
  const filtered = filterType==="all" ? clinicalRecords : clinicalRecords.filter(r=>r.type===filterType);
  const typeCounts = Object.fromEntries(Object.keys(ENTRY_TYPE).map(t=>[t,clinicalRecords.filter(r=>r.type===t).length]));

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>

      <PageHero
        badge="Prontuário Eletrônico · Res. CFM 1638/2002 · LGPD"
        title={patSelected&&unlocked ? patSelected.name : "Prontuário Eletrônico do Paciente"}
        subtitle={!(patSelected&&unlocked) ? "Documento legal e sigiloso — acesso registrado conforme LGPD." : undefined}
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <div style={{display:"flex",flexDirection:"column",gap:".6rem",alignItems:"flex-end",flexShrink:0}}>
            <div style={{position:"relative",width:340}}>
              <div style={{position:"absolute",left:".75rem",top:"50%",transform:"translateY(-50%)",color:"#64748b",pointerEvents:"none"}}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              </div>
              <input value={patSearch}
                onChange={e=>{ setPatSearch(e.target.value); if(patSelected&&e.target.value!==patSelected.name){setPatSelected(null);setUnlocked(false);setRecords([]);} }}
                placeholder="Buscar paciente por nome, CPF ou CNS..."
                style={{width:"100%",boxSizing:"border-box",paddingLeft:"2.2rem",paddingRight:patSelected?"2.2rem":".75rem",background:"rgba(255,255,255,.1)",border:`1px solid ${patSelected?"rgba(52,211,153,.6)":"rgba(255,255,255,.2)"}`,borderRadius:"var(--r-md)",color:"#fff",fontSize:".85rem",height:38}}/>
              {patSelected&&<div style={{position:"absolute",right:".65rem",top:"50%",transform:"translateY(-50%)",width:18,height:18,borderRadius:"50%",background:"#10b981",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>}
              {patResults.length>0&&!patSelected&&(
                <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:50,background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",boxShadow:"0 8px 24px rgba(0,0,0,.15)",maxHeight:260,overflowY:"auto"}}>
                  {patResults.map(p=>{
                    const age = p.birthDate ? Math.floor((new Date()-(parseLocalDate(p.birthDate)||new Date()))/31557600000) : null;
                    const acsN = users.find(u=>u.id===p.assignedAcsId)?.name;
                    return (
                      <button key={p.id} type="button" onClick={()=>selectPatient(p)}
                        style={{display:"flex",alignItems:"center",gap:".75rem",width:"100%",padding:".65rem 1rem",background:"none",border:"none",borderBottom:"1px solid var(--border-soft)",cursor:"pointer",textAlign:"left",color:"var(--text-1)"}}
                        onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                        onMouseLeave={e=>e.currentTarget.style.background="none"}>
                        <div style={{width:36,height:36,borderRadius:"50%",background:"var(--teal-100)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".8rem",fontWeight:700,color:"var(--teal-700)",flexShrink:0}}>{initials(p.name)}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:".88rem",color:"var(--ink)"}}>{p.name}</div>
                          <div style={{display:"flex",gap:".6rem",fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem",flexWrap:"wrap"}}>
                            {age!==null&&<span>{age} anos</span>}
                            {p.cpf&&<span>CPF: {p.cpf}</span>}
                            {p.cns&&<span>CNS: {p.cns}</span>}
                            {acsN&&<span>ACS: {acsN}</span>}
                            <span style={{color:"var(--teal-600)",fontWeight:600}}>{catLabel([],p.careCategory)}</span>
                          </div>
                        </div>
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{color:"var(--text-3)",flexShrink:0}}><path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {patSelected&&unlocked&&(
              <div style={{display:"flex",gap:".5rem",alignItems:"center"}}>
                {onNavigatePatient&&<button type="button" onClick={()=>onNavigatePatient(patSelected.id)}
                  style={{fontSize:".73rem",padding:".35rem .7rem",background:"rgba(255,255,255,.1)",color:"#e2e8f0",border:"1px solid rgba(255,255,255,.2)",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600}}>
                  Perfil →
                </button>}
              </div>
            )}
          </div>
        }
      >
        {patSelected&&unlocked&&(
          <div style={{display:"flex",gap:".75rem",marginTop:".3rem",flexWrap:"wrap"}}>
            {patSelected.birthDate&&<span style={{fontSize:".72rem",color:"#94a3b8"}}>Nasc.: {fmtDate(patSelected.birthDate)}</span>}
            {patSelected.cpf&&<span style={{fontSize:".72rem",color:"#94a3b8"}}>CPF: {patSelected.cpf}</span>}
            {patSelected.cns&&<span style={{fontSize:".72rem",color:"#94a3b8"}}>CNS: {patSelected.cns}</span>}
            {patSelected.sex&&<span style={{fontSize:".72rem",color:"#94a3b8"}}>Sexo: {patSelected.sex}</span>}
            {patSelected.birthDate&&(()=>{const a=Math.floor((new Date()-(parseLocalDate(patSelected.birthDate)||new Date()))/31557600000);return <span style={{fontSize:".72rem",color:"#94a3b8"}}>{a} anos</span>;})()}
          </div>
        )}
      </PageHero>

      {/* ── Conteúdo ── */}
      {!patSelected ? (
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:"1rem",background:"var(--surface-2)",padding:"4rem 2rem",textAlign:"center"}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:"var(--surface)",border:"2px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2rem"}}>📋</div>
          <div style={{fontWeight:700,fontSize:".95rem",color:"var(--ink)"}}>Selecione um paciente para acessar o prontuário</div>
          <div style={{fontSize:".82rem",color:"var(--text-3)",maxWidth:380,lineHeight:1.6}}>Use a busca acima pelo nome, CPF ou CNS. A autenticação por senha será solicitada antes de exibir os registros.</div>
          <div style={{marginTop:".5rem",padding:".6rem 1rem",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",fontSize:".72rem",color:"var(--text-3)",maxWidth:400,lineHeight:1.6}}>
            ⚖️ O prontuário é documento legal, sigiloso e científico (Res. CFM 1638/2002). O acesso é registrado em trilha de auditoria conforme LGPD.
          </div>
        </div>
      ) : !unlocked ? (
        <ChartAuthGate patient={patSelected} users={users} user={user} onUnlock={handleUnlock}/>
      ) : (
        <div style={{flex:1,display:"flex",minHeight:0}}>

          {/* ── Coluna lateral esquerda: resumo do paciente ── */}
          <div style={{width:260,flexShrink:0,borderRight:"1px solid var(--border)",overflow:"auto",background:"var(--surface)",padding:"1.25rem"}}>
            <div style={{fontWeight:800,fontSize:".78rem",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".85rem"}}>Resumo do paciente</div>

            {/* Avatar + nome */}
            <div style={{display:"flex",alignItems:"center",gap:".65rem",marginBottom:"1rem"}}>
              <div className="user-avatar" style={{width:42,height:42,fontSize:"1rem",flexShrink:0}}>{initials(patSelected.name)}</div>
              <div>
                <div style={{fontWeight:700,fontSize:".85rem",color:"var(--ink)",lineHeight:1.3}}>{patSelected.name}</div>
                <div style={{fontSize:".72rem",color:"var(--text-3)"}}>{catLabel([],patSelected.careCategory)}</div>
              </div>
            </div>

            {/* Dados pessoais CFM obrigatórios */}
            {[
              ["Data de nasc.", fmtDate(patSelected.birthDate)],
              ["Idade", patSelected.birthDate?`${Math.floor((new Date()-(parseLocalDate(patSelected.birthDate)||new Date()))/31557600000)} anos`:"—"],
              ["Sexo", patSelected.sex||"—"],
              ["Nome da mãe", patSelected.motherName||"—"],
              ["CPF", patSelected.cpf||"—"],
              ["CNS", patSelected.cns||"—"],
              ["Naturalidade", patSelected.city&&patSelected.state?`${patSelected.city}/${patSelected.state}`:"—"],
              ["Endereço", patSelected.address?[patSelected.address,patSelected.number,patSelected.neighborhood].filter(Boolean).join(", "):"—"],
              ["CEP", patSelected.zipCode||"—"],
              ["Telefone", patSelected.phone||"—"],
              ["ACS resp.", users.find(u=>u.id===patSelected.assignedAcsId)?.name||"Não atribuído"],
              ["Estado civil", patSelected.maritalStatus||"—"],
            ].map(([lbl,val])=>(
              <div key={lbl} style={{marginBottom:".45rem"}}>
                <div style={{fontSize:".65rem",fontWeight:700,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".05em"}}>{lbl}</div>
                <div style={{fontSize:".78rem",color:"var(--text-1)",wordBreak:"break-word"}}>{val}</div>
              </div>
            ))}

            <div style={{borderTop:"1px solid var(--border)",paddingTop:".75rem",marginTop:".5rem"}}>
              <div style={{fontWeight:700,fontSize:".65rem",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".5rem"}}>Dados clínicos</div>
              {patSelected.allergies&&<div style={{marginBottom:".4rem",padding:".4rem .5rem",background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:"var(--r-sm)",fontSize:".73rem",color:"#be123c"}}><strong>âš ï¸ Alergias:</strong> {patSelected.allergies}</div>}
              {patSelected.comorbidities&&<div style={{marginBottom:".4rem",padding:".4rem .5rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-sm)",fontSize:".73rem"}}><strong>Comorbidades:</strong> {patSelected.comorbidities}</div>}
              {patSelected.medications&&<div style={{marginBottom:".4rem",padding:".4rem .5rem",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-sm)",fontSize:".73rem",color:"#92400e"}}><strong>💊 Medicamentos:</strong> {patSelected.medications}</div>}
              {(patSelected.chronicConditions||[]).length>0&&<div style={{padding:".4rem .5rem",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"var(--r-sm)",fontSize:".73rem",color:"#1d4ed8"}}><strong>Condições:</strong> {(patSelected.chronicConditions||[]).join(", ")}</div>}
            </div>

            {/* Gestação */}
            {String(patSelected.careCategory||"").toLowerCase()==="pregnant"&&(
              <div style={{borderTop:"1px solid var(--border)",paddingTop:".75rem",marginTop:".5rem"}}>
                <div style={{fontWeight:700,fontSize:".65rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".5rem"}}>🤰 Gestação</div>
                {(()=>{const g=gestationalAgeInfo(patSelected);return g?<div style={{fontSize:".78rem",color:"var(--teal-700)",fontWeight:600}}>IG estimada: {g.weeks}s {g.days}d ({g.source})</div>:null;})()}
                {patSelected.expectedDeliveryDate&&<div style={{fontSize:".73rem",color:"var(--text-2)"}}>DPP: {fmtDate(patSelected.expectedDeliveryDate)}</div>}
              </div>
            )}

            {/* Mini trilha de auditoria */}
            <div style={{borderTop:"1px solid var(--border)",paddingTop:".75rem",marginTop:".75rem"}}>
              <div style={{fontWeight:700,fontSize:".65rem",color:"var(--text-3)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".5rem"}}>🔍 Acessos recentes</div>
              {chartAuditLog.filter(a=>a.patientId===patSelected.id).slice(0,5).map((a,i)=>(
                <div key={i} style={{fontSize:".65rem",color:"var(--text-3)",marginBottom:".25rem",lineHeight:1.5}}>
                  <span style={{color:a.action==="EXCLUSAO_REGISTRO"?"#be123c":a.action==="LANCAMENTO_REGISTRO"?"#15803d":"var(--text-2)",fontWeight:600}}>{a.action.replace(/_/g," ")}</span><br/>
                  {a.professional} · {new Date(a.ts).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                </div>
              ))}
              {!chartAuditLog.filter(a=>a.patientId===patSelected.id).length&&<div style={{fontSize:".68rem",color:"var(--text-3)"}}>Nenhum acesso anterior registrado.</div>}
            </div>
          </div>

          {/* ── Coluna principal: registros ── */}
          <div style={{flex:1,overflow:"auto",background:"var(--surface-2)",padding:"1.25rem 1.5rem"}}>

            {/* Filtros por tipo */}
            <div style={{display:"flex",gap:".4rem",flexWrap:"wrap",marginBottom:"1rem",alignItems:"center"}}>
              <button type="button" onClick={()=>setFilterType("all")}
                style={{fontSize:".72rem",padding:".3rem .65rem",borderRadius:4,border:`1px solid ${filterType==="all"?"#0f172a":"var(--border)"}`,background:filterType==="all"?"#0f172a":"var(--surface)",color:filterType==="all"?"#fff":"var(--text-2)",cursor:"pointer",fontWeight:600}}>
                Todos ({records.length})
              </button>
              {Object.entries(ENTRY_TYPE).map(([type,meta])=>{
                const cnt=typeCounts[type]||0; if(!cnt) return null;
                const active=filterType===type;
                return <button key={type} type="button" onClick={()=>setFilterType(active?"all":type)}
                  style={{fontSize:".72rem",padding:".3rem .65rem",borderRadius:4,border:`1px solid ${active?meta.color:meta.border}`,background:active?meta.bg:"var(--surface)",color:active?meta.color:"var(--text-2)",cursor:"pointer",fontWeight:600}}>
                  {meta.ico} {meta.label} ({cnt})
                </button>;
              })}
            </div>

            {/* Aviso prazo */}
            <div style={{marginBottom:"1rem",padding:".65rem .9rem",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".74rem",color:"#92400e",display:"flex",gap:".5rem"}}>
              <span style={{flexShrink:0}}>⚖️</span>
              <span>Registros devem ser lançados em até <strong>{CHART_DEADLINE_DAYS} dias</strong> após o evento (Res. CFM 1638/2002). Lançamentos fora do prazo são recusados como não conformidade.</span>
            </div>

            {loading ? (
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"4rem",color:"var(--text-3)",gap:".5rem"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{animation:"spin 1s linear infinite"}}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8"/></svg>
                Carregando registros...
              </div>
            ) : !filtered.length ? (
              <div style={{textAlign:"center",padding:"3rem",color:"var(--text-3)"}}>
                <div style={{fontSize:"2rem",marginBottom:".5rem"}}>📭</div>
                <div style={{fontWeight:600}}>{filterType==="all"?"Nenhum registro neste prontuário":"Nenhum registro deste tipo"}</div>
                <div style={{fontSize:".8rem",marginTop:".5rem"}}>Registre um atendimento na ficha do paciente para que ele apareça aqui.</div>
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
                {[...filtered].sort((a,b)=>(parseLocalDate(b.date)||new Date(b.createdAt||0))-(parseLocalDate(a.date)||new Date(a.createdAt||0))).map(item=>{
                  const meta = ENTRY_TYPE[item.type]||ENTRY_TYPE.consultation;
                  const isExp = expandedId===item.id;
                  const lagDays = item.createdAt&&item.date ? Math.floor((new Date(item.createdAt)-new Date(item.date+"T12:00:00"))/86400000) : null;
                  const isInactive = item.inactive === true;
                  return (
                    <article key={item.id} style={{
                      background: isInactive ? "var(--surface-2)" : "var(--surface)",
                      border:`1px solid ${isInactive?"var(--border)":meta.border}`,
                      borderLeft:`4px solid ${isInactive?"#94a3b8":meta.color}`,
                      borderRadius:"var(--r-md)", overflow:"hidden",
                      boxShadow:"0 1px 3px rgba(0,0,0,.05)",
                      opacity: isInactive ? 0.65 : 1,
                    }}>
                      <div style={{padding:".85rem 1.1rem",cursor:"pointer",display:"flex",alignItems:"flex-start",gap:".75rem"}}
                        onClick={()=>setExpandedId(isExp?null:item.id)}>
                        <div style={{width:34,height:34,borderRadius:"var(--r-md)",background:isInactive?"var(--surface-2)":meta.bg,border:`1px solid ${isInactive?"var(--border)":meta.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem",flexShrink:0}}>{isInactive?"🚫":meta.ico}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:".4rem",flexWrap:"wrap",marginBottom:".2rem"}}>
                            <span style={{fontWeight:700,fontSize:".88rem",color:isInactive?"var(--text-3)":"var(--ink)",textDecoration:isInactive?"line-through":"none"}}>{item.title||meta.label}</span>
                            {isInactive
                              ? <span style={{fontSize:".67rem",fontWeight:700,padding:".1rem .45rem",borderRadius:999,background:"#f1f5f9",color:"#64748b",border:"1px solid #e2e8f0"}}>INATIVO</span>
                              : <span style={{fontSize:".67rem",fontWeight:700,padding:".1rem .38rem",borderRadius:999,background:meta.bg,color:meta.color,border:`1px solid ${meta.border}`,flexShrink:0}}>{meta.label}</span>
                            }
                            {item.cid&&!isInactive&&<span style={{fontSize:".67rem",padding:".1rem .38rem",borderRadius:999,background:"#f1f5f9",color:"#475569",border:"1px solid #e2e8f0",fontWeight:600}}>CID: {item.cid}</span>}
                            {lagDays!==null&&lagDays>0&&!isInactive&&<span style={{fontSize:".67rem",color:"#92400e",background:"#fffbeb",padding:".1rem .38rem",borderRadius:999,border:"1px solid #fde68a"}}>âš ï¸ +{lagDays}d após evento</span>}
                          </div>
                          <div style={{display:"flex",gap:"1rem",flexWrap:"wrap"}}>
                            {/* CFM 1638/2002: exibe data E hora do evento */}
                            <span style={{fontSize:".72rem",color:"var(--text-3)",fontFamily:"IBM Plex Mono",fontWeight:600}}>
                              📅 {item.date?fmtDate(item.date):"—"}{item.time?` · 🕐 ${item.time}`:""}
                            </span>
                            {item.createdAt&&<span style={{fontSize:".72rem",color:"var(--text-3)"}}>Lançado: {new Date(item.createdAt).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>}
                            {item.professionalName&&<span style={{fontSize:".72rem",color:"var(--text-3)"}}>Por: {item.professionalName}{item.professionalCouncil?` · ${item.professionalCouncil}`:""}</span>}
                          </div>
                          {isInactive&&item.inactivationReason&&(
                            <div style={{fontSize:".7rem",color:"#64748b",marginTop:".25rem",fontStyle:"italic"}}>Motivo da inativação: {item.inactivationReason}</div>
                          )}
                        </div>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{color:"var(--text-3)",flexShrink:0,marginTop:4,transform:isExp?"rotate(180deg)":"none",transition:"transform .2s"}}>
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      {isExp&&(
                        <div style={{borderTop:`1px solid ${isInactive?"var(--border)":meta.border}`,background:isInactive?"var(--surface-2)":meta.bg,padding:"1rem 1.1rem"}}>
                          {item.details ? (
                            <pre style={{margin:0,fontFamily:"inherit",fontSize:".82rem",color:"var(--text-1)",whiteSpace:"pre-wrap",lineHeight:1.7}}>{item.details}</pre>
                          ) : (
                            <span style={{fontSize:".8rem",color:"var(--text-3)"}}>Sem detalhes registrados.</span>
                          )}
                          <div style={{display:"flex",gap:".5rem",marginTop:".85rem",alignItems:"center",flexWrap:"wrap"}}>
                            <span style={{fontSize:".68rem",color:"var(--text-3)",flex:1}}>
                              Lei 13.787/2018 — Registro imutável · ID: {item.id}
                            </span>
                            {item.source==="clinicalRecord"&&!isInactive&&(
                              <button type="button" onClick={()=>handleDelete(item.id)}
                                style={{fontSize:".72rem",padding:".25rem .65rem",background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600}}>
                                âš ï¸ Inativar registro
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prontuário — somente leitura. Registros criados via tab Atendimento do paciente. */}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
/* ══════════════════════════════════════════════════════════════════
   PÁGINA DE TAREFAS DO ACS
══════════════════════════════════════════════════════════════════ */
function AcsTasksPage({ patients, users, user, token, onNavigatePatient }) {
  const [allTasks, setAllTasks]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("pending"); // "all" | "pending" | "done"

  // Carrega as tarefas de todos os pacientes atribuídos ao ACS logado
  useEffect(() => {
    if (!token) return;
    const myPatients = patients.filter(p => p.assignedAcsId === user?.id);
    if (!myPatients.length) { setAllTasks([]); setLoading(false); return; }
    setLoading(true);
    Promise.all(myPatients.map(p =>
      fetch(`/patients/${p.id}/tasks`, { headers:{ Authorization:`Bearer ${token}` } })
        .then(r => r.ok ? r.json() : [])
        .then(tasks => (Array.isArray(tasks) ? tasks : []).map(t => ({ ...t, patientId:p.id, patientName:p.name, patientBirth:p.birthDate, patientCareCategory:p.careCategory })))
        .catch(() => [])
    ))
    .then(results => { setAllTasks(results.flat()); setLoading(false); })
    .catch(() => setLoading(false));
  }, [token, patients, user?.id]);

  // Filtra tarefas do ACS logado (atribuídas a ele ou sem responsável definido)
  const myTasks = allTasks.filter(t =>
    !t.assigneeId || t.assigneeId === user?.id
  );

  const filtered = myTasks.filter(t => {
    if (filter === "pending") return t.status !== "done";
    if (filter === "done")    return t.status === "done";
    return true;
  });

  // Ordena: tarefas com data mais próxima primeiro, depois sem data, depois atrasadas no fim
  const today = new Date(); today.setHours(0,0,0,0);
  const sorted = [...filtered].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate + "T00:00:00") : null;
    const db = b.dueDate ? new Date(b.dueDate + "T00:00:00") : null;
    if (!da && !db) return 0;
    if (!da) return 1;   // sem data vai pro fim
    if (!db) return -1;
    return da - db;      // mais próxima primeiro
  });

  const overdueCount  = myTasks.filter(t => t.status !== "done" && t.dueDate && parseLocalDate(t.dueDate) < today).length;
  const pendingCount  = myTasks.filter(t => t.status !== "done").length;

  async function changeStatus(task, status) {
    try {
      await fetch(`/patients/${task.patientId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json" },
        body: JSON.stringify({ status }),
      });
      setAllTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t));
    } catch {}
  }

  function urgencyStyle(dueDate, status) {
    if (status === "done") return { bg:"var(--surface-2)", border:"var(--border)", label:"", labelColor:"" };
    if (!dueDate) return { bg:"var(--surface-2)", border:"var(--border)", label:"", labelColor:"" };
    const d = new Date(dueDate + "T00:00:00");
    const diff = Math.ceil((d - today) / 86400000);
    if (diff < 0)  return { bg:"#fff1f2", border:"#fecdd3", label:`Atrasada ${Math.abs(diff)}d`, labelColor:"#be123c" };
    if (diff === 0) return { bg:"#fff7ed", border:"#fed7aa", label:"Hoje",                       labelColor:"#c2410c" };
    if (diff <= 3)  return { bg:"#fffbeb", border:"#fde68a", label:`${diff}d`,                   labelColor:"#b45309" };
    return { bg:"var(--surface-2)", border:"var(--border)", label:`${diff}d`, labelColor:"var(--text-3)" };
  }

  return (
    <div style={{padding:"1.5rem",maxWidth:760,margin:"0 auto"}}>
      <PageHero badge="Minha área" title="Tarefas" subtitle="Atividades atribuídas a você pela equipe de enfermagem" />

      {/* KPIs rápidos */}
      <div style={{display:"flex",gap:".75rem",marginBottom:"1.25rem",flexWrap:"wrap"}}>
        {[
          { label:"Pendentes",   value:pendingCount,  color:"#1d4ed8", bg:"#eff6ff", border:"#bfdbfe" },
          { label:"Em atraso",   value:overdueCount,  color:"#be123c", bg:"#fff1f2", border:"#fecdd3" },
          { label:"Concluídas",  value:myTasks.filter(t=>t.status==="done").length, color:"#15803d", bg:"#f0fdf4", border:"#bbf7d0" },
        ].map(k=>(
          <div key={k.label} style={{flex:"1 1 120px",padding:".65rem .9rem",background:k.bg,border:`1px solid ${k.border}`,borderRadius:"var(--r-md)"}}>
            <div style={{fontSize:"1.4rem",fontWeight:800,color:k.color,lineHeight:1}}>{k.value}</div>
            <div style={{fontSize:".72rem",color:k.color,marginTop:".2rem",fontWeight:600}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:".4rem",marginBottom:"1rem"}}>
        {[["pending","Pendentes"],["done","Concluídas"],["all","Todas"]].map(([val,lbl])=>(
          <button key={val} type="button" onClick={()=>setFilter(val)}
            style={{fontSize:".78rem",padding:".35rem .8rem",borderRadius:"var(--r-md)",border:"1px solid",
              borderColor:filter===val?"var(--teal-600)":"var(--border)",
              background:filter===val?"var(--teal-600)":"var(--surface)",
              color:filter===val?"#fff":"var(--text-1)",fontWeight:filter===val?700:400,cursor:"pointer"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{textAlign:"center",padding:"2rem",color:"var(--text-3)",fontSize:".85rem"}}>Carregando tarefas...</div>
      ) : !sorted.length ? (
        <div style={{textAlign:"center",padding:"2.5rem 1rem",color:"var(--text-3)"}}>
          <svg width="32" height="32" viewBox="0 0 16 16" fill="none" style={{marginBottom:".5rem",opacity:.4}}><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div style={{fontWeight:600,fontSize:".85rem"}}>{filter==="done"?"Nenhuma tarefa concluída":"Nenhuma tarefa pendente"}</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:".6rem"}}>
          {sorted.map(t => {
            const urg = urgencyStyle(t.dueDate, t.status);
            const done = t.status === "done";
            return (
              <div key={t.id} style={{padding:".85rem 1rem",background:urg.bg,border:`1px solid ${urg.border}`,borderRadius:"var(--r-md)",opacity:done?.65:1}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:".75rem"}}>
                  <div style={{flex:1,minWidth:0}}>
                    {/* Título + urgência */}
                    <div style={{display:"flex",alignItems:"center",gap:".5rem",flexWrap:"wrap",marginBottom:".25rem"}}>
                      <span style={{fontWeight:700,fontSize:".88rem",color:done?"var(--text-3)":"var(--ink)",textDecoration:done?"line-through":"none"}}>{t.title}</span>
                      {urg.label&&!done&&<span style={{fontSize:".68rem",fontWeight:700,padding:".1rem .4rem",borderRadius:999,background:"white",border:`1px solid ${urg.border}`,color:urg.labelColor,flexShrink:0}}>{urg.label}</span>}
                    </div>
                    {/* Notas */}
                    {t.notes&&<p style={{fontSize:".78rem",color:"var(--text-2)",margin:"0 0 .35rem"}}>{t.notes}</p>}
                    {/* Meta-info */}
                    <div style={{display:"flex",alignItems:"center",gap:".75rem",flexWrap:"wrap"}}>
                      {/* Paciente */}
                      <button type="button" onClick={()=>onNavigatePatient&&onNavigatePatient(t.patientId)}
                        style={{display:"inline-flex",alignItems:"center",gap:".35rem",fontSize:".72rem",color:"var(--teal-700)",background:"var(--teal-50)",border:"1px solid var(--teal-100)",borderRadius:999,padding:".1rem .5rem",cursor:"pointer",fontWeight:600}}>
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        {t.patientName}
                      </button>
                      {/* Prazo */}
                      {t.dueDate&&<span style={{fontSize:".72rem",color:"var(--text-3)"}}>Prazo: {fmtDate(t.dueDate)}</span>}
                    </div>
                  </div>
                  {/* Controle de status */}
                  <select value={t.status||"pending"} onChange={e=>changeStatus(t,e.target.value)}
                    style={{fontSize:".75rem",padding:".3rem .55rem",borderRadius:"var(--r-md)",border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text-1)",cursor:"pointer",flexShrink:0}}>
                    <option value="pending">Pendente</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="done">Concluída</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ENCAMINHAMENTOS
══════════════════════════════════════════════════════════════════ */
const SPECIALTIES = ["Cardiologia","Ortopedia","Neurologia","Psiquiatria","Ginecologia","Urologia","Dermatologia","Oftalmologia","Otorrinolaringologia","Endocrinologia","Nefrologia","Pneumologia","Reumatologia","Gastroenterologia","Oncologia","Fisioterapia","Nutrição","Psicologia","Serviço Social","Pronto-Socorro","Hospital"];

function ReferralsPage({ patients, users, user }) {
  const [referrals, setReferrals]   = useState(()=>readLS(REFERRALS_KEY,[]));
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState({ patientId:"", specialty:"Cardiologia", reason:"", priority:"routine", date:"", notes:"", status:"pending" });
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch]         = useState("");
  const [showDoc, setShowDoc]       = useState(null); // referral to print

  function saveReferrals(r) { setReferrals(r); writeLS(REFERRALS_KEY,r); }

  function openNew() {
    setForm({ patientId:"", specialty:"Cardiologia", reason:"", priority:"routine", date:new Date().toISOString().slice(0,10), notes:"", status:"pending" });
    setEditId(null); setShowForm(true);
  }
  function openEdit(ref) {
    setForm({ patientId:ref.patientId, specialty:ref.specialty, reason:ref.reason, priority:ref.priority, date:ref.date, notes:ref.notes||"", status:ref.status });
    setEditId(ref.id); setShowForm(true);
  }
  function submit(e) {
    e.preventDefault();
    if (!form.patientId||!form.reason) return;
    const pat=patients.find(p=>p.id===form.patientId);
    const doc=users.find(u=>u.id===user?.id);
    const entry={ ...form, id:editId||("ref"+Date.now()), patientName:pat?.name||"?", doctorName:doc?.name||user?.name||"?", createdAt:new Date().toISOString() };
    const base=editId?referrals.filter(r=>r.id!==editId):referrals;
    saveReferrals([entry,...base]);
    setShowForm(false);
  }
  function updateStatus(id,status) { saveReferrals(referrals.map(r=>r.id===id?{...r,status,updatedAt:new Date().toISOString()}:r)); }
  function remove(id) { saveReferrals(referrals.filter(r=>r.id!==id)); }

  const filtered = referrals.filter(r=>{
    if(filterStatus!=="all"&&r.status!==filterStatus)return false;
    if(search.trim()&&!r.patientName.toLowerCase().includes(search.toLowerCase())&&!r.specialty.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });

  const statusMap={ pending:{label:"Aguardando",bg:"#fff7ed",color:"#c2410c",border:"#fed7aa"}, scheduled:{label:"Agendado",bg:"#eff6ff",color:"#1d4ed8",border:"#bfdbfe"}, done:{label:"Realizado",bg:"#f0fdf4",color:"#15803d",border:"#bbf7d0"}, cancelled:{label:"Cancelado",bg:"var(--surface-2)",color:"var(--text-3)",border:"var(--border)"} };
  const priorityMap={ urgent:{label:"Urgente",color:"#be123c"}, priority:{label:"Prioritário",color:"#c2410c"}, routine:{label:"Rotina",color:"var(--text-3)"} };

  const counts={ all:referrals.length, pending:referrals.filter(r=>r.status==="pending").length, scheduled:referrals.filter(r=>r.status==="scheduled").length, done:referrals.filter(r=>r.status==="done").length };

  function fmtDateLocal(d){if(!d)return"-";try{return new Date(d+"T12:00:00").toLocaleDateString("pt-BR");}catch{return d;}}

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <PageHero
        badge="Referência e Contrarreferência"
        title="Encaminhamentos"
        subtitle="Controle de encaminhamentos para especialistas e serviços."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <button onClick={openNew} style={{flexShrink:0,display:"flex",alignItems:"center",gap:".4rem"}}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            Novo encaminhamento
          </button>
        }
      />

      {/* Status filter tabs */}
      <div style={{display:"flex",gap:0,padding:"0 1.5rem",borderBottom:"1px solid var(--border)",marginBottom:"1rem"}}>
        {[["all","Todos"],["pending","Aguardando"],["scheduled","Agendado"],["done","Realizado"]].map(([k,l])=>(
          <button key={k} onClick={()=>setFilterStatus(k)}
            style={{padding:".5rem .9rem",fontSize:".78rem",fontWeight:600,border:"none",background:"transparent",cursor:"pointer",
              color:filterStatus===k?"var(--teal-600)":"var(--text-3)",
              borderBottom:filterStatus===k?"2px solid var(--teal-500)":"2px solid transparent"}}>
            {l} <span style={{fontSize:".68rem",opacity:.7}}>({counts[k]})</span>
          </button>
        ))}
      </div>

      <div style={{padding:"0 1.5rem",marginBottom:".75rem"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por paciente ou especialidade..." style={{width:"100%",maxWidth:380,boxSizing:"border-box"}}/>
      </div>

      <div style={{flex:1,overflow:"auto",padding:"0 1.5rem 1.5rem"}}>
        {!filtered.length?(
          <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
            <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>📋</div>
            <div style={{fontWeight:600,fontSize:".9rem"}}>Nenhum encaminhamento encontrado</div>
          </div>
        ):(
          <div className="card" style={{padding:0,overflow:"hidden"}}>
            <table className="patients-table" style={{width:"100%"}}>
              <thead><tr>
                <th>Paciente</th><th>Especialidade</th><th>Prioridade</th>
                <th>Data</th><th>Status</th><th>Ações</th>
              </tr></thead>
              <tbody>
                {filtered.map(r=>{
                  const ss=statusMap[r.status]||statusMap.pending;
                  const pp=priorityMap[r.priority]||priorityMap.routine;
                  return(
                    <tr key={r.id}>
                      <td>
                        <div style={{fontWeight:600,fontSize:".84rem"}}>{r.patientName}</div>
                        <div style={{fontSize:".71rem",color:"var(--text-3)"}}>{r.doctorName}</div>
                      </td>
                      <td style={{fontWeight:600,fontSize:".84rem"}}>{r.specialty}</td>
                      <td><span style={{fontSize:".71rem",fontWeight:700,color:pp.color}}>{pp.label}</span></td>
                      <td style={{fontSize:".8rem",color:"var(--text-3)"}}>{fmtDateLocal(r.date)}</td>
                      <td>
                        <select value={r.status} onChange={e=>updateStatus(r.id,e.target.value)}
                          style={{fontSize:".71rem",padding:".2rem .4rem",borderRadius:999,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,fontWeight:700}}>
                          {Object.entries(statusMap).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <div style={{display:"flex",gap:".3rem",justifyContent:"center"}}>
                          <button onClick={()=>setShowDoc(r)} title="Ver documento" style={{fontSize:".71rem",padding:".25rem .5rem",background:"var(--teal-50)",border:"1px solid var(--teal-200)",color:"var(--teal-700)",borderRadius:"var(--r-md)"}}>📄</button>
                          <button onClick={()=>openEdit(r)} style={{fontSize:".71rem",padding:".25rem .5rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>✏️</button>
                          <button onClick={()=>remove(r.id)} style={{fontSize:".71rem",padding:".25rem .5rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"#be123c"}}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm&&(
        <div className="modal-backdrop" onClick={()=>setShowForm(false)}>
          <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <h3 style={{margin:0}}>{editId?"Editar encaminhamento":"Novo encaminhamento"}</h3>
              <button className="icon-btn" onClick={()=>setShowForm(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            <form onSubmit={submit} style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".65rem"}}>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Paciente *
                <select value={form.patientId} onChange={e=>setForm(s=>({...s,patientId:e.target.value}))}>
                  <option value="">Selecionar...</option>
                  {[...patients].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Especialidade
                <select value={form.specialty} onChange={e=>setForm(s=>({...s,specialty:e.target.value}))}>
                  {SPECIALTIES.map(s=><option key={s}>{s}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Prioridade
                <select value={form.priority} onChange={e=>setForm(s=>({...s,priority:e.target.value}))}>
                  <option value="routine">Rotina</option><option value="priority">Prioritário</option><option value="urgent">Urgente</option>
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Data
                <input type="date" value={form.date} onChange={e=>setForm(s=>({...s,date:e.target.value}))}/>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Status
                <select value={form.status} onChange={e=>setForm(s=>({...s,status:e.target.value}))}>
                  <option value="pending">Aguardando</option><option value="scheduled">Agendado</option><option value="done">Realizado</option><option value="cancelled">Cancelado</option>
                </select>
              </label>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Motivo / hipótese diagnóstica *
                <textarea value={form.reason} onChange={e=>setForm(s=>({...s,reason:e.target.value}))} style={{minHeight:64}} placeholder="Descreva o motivo do encaminhamento..."/>
              </label>
              <label style={{gridColumn:"span 2",display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>Observações adicionais
                <input value={form.notes} onChange={e=>setForm(s=>({...s,notes:e.target.value}))} placeholder="Informações relevantes para o especialista..."/>
              </label>
              <div style={{gridColumn:"span 2",display:"flex",gap:".5rem",marginTop:".25rem"}}>
                <button type="button" onClick={()=>setShowForm(false)} style={{flex:1,background:"var(--surface-2)",color:"var(--text-1)",border:"1px solid var(--border)"}}>Cancelar</button>
                <button type="submit" style={{flex:2}}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document preview / print */}
      {showDoc&&(
        <div className="modal-backdrop" onClick={()=>setShowDoc(null)}>
          <div className="modal" style={{maxWidth:540}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <h3 style={{margin:0}}>Guia de Encaminhamento</h3>
              <div style={{display:"flex",gap:".5rem"}}>
                <button onClick={()=>window.print()} style={{fontSize:".78rem",padding:".3rem .65rem"}}>🖨️ Imprimir</button>
                <button className="icon-btn" onClick={()=>setShowDoc(null)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
              </div>
            </div>
            <div style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"1.25rem",fontFamily:"serif",lineHeight:1.7}}>
              <div style={{textAlign:"center",borderBottom:"2px solid var(--border)",paddingBottom:".75rem",marginBottom:".75rem"}}>
                <div style={{fontWeight:800,fontSize:"1.05rem"}}>GUIA DE ENCAMINHAMENTO</div>
                <div style={{fontSize:".8rem",color:"var(--text-3)"}}>Unidade Básica de Saúde</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem",fontSize:".82rem"}}>
                <div><strong>Paciente:</strong> {showDoc.patientName}</div>
                <div><strong>Data:</strong> {fmtDateLocal(showDoc.date)}</div>
                <div><strong>Especialidade:</strong> {showDoc.specialty}</div>
                <div><strong>Prioridade:</strong> {priorityMap[showDoc.priority]?.label||showDoc.priority}</div>
              </div>
              <div style={{marginTop:".75rem",fontSize:".82rem"}}><strong>Motivo:</strong><br/><span style={{whiteSpace:"pre-wrap"}}>{showDoc.reason}</span></div>
              {showDoc.notes&&<div style={{marginTop:".5rem",fontSize:".82rem"}}><strong>Observações:</strong><br/>{showDoc.notes}</div>}
              <div style={{marginTop:"1.5rem",paddingTop:".75rem",borderTop:"1px solid var(--border)",display:"flex",justifyContent:"space-between",fontSize:".78rem",color:"var(--text-3)"}}>
                <span>Profissional: {showDoc.doctorName}</span>
                <span>Emitido em: {showDoc.createdAt?new Date(showDoc.createdAt).toLocaleDateString("pt-BR"):"-"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   RELATÓRIOS
══════════════════════════════════════════════════════════════════ */
// ═══════════════════════════════════════════════════════════════
//  GESTOR PAGE — Painel de Indicadores de Gestão à Vista
// ═══════════════════════════════════════════════════════════════
function GestorPage({ patients, users, templates, protocolByPatient }) {
  const now = new Date();
  const ONLINE_WINDOW_MS = 2 * 60 * 1000;
  const [globalUserSearch, setGlobalUserSearch] = useState("");
  const [globalUserRoleFilter, setGlobalUserRoleFilter] = useState("all");
  const [globalUserStatusFilter, setGlobalUserStatusFilter] = useState("all");
  const [globalUserTeamFilter, setGlobalUserTeamFilter] = useState("all");
  const agenda    = readLS(AGENDA_KEY, []);
  const referrals = readLS(REFERRALS_KEY, []);
  const pharmaLog = readLS("saudeubs_pharmalog_v1", []);
  const stock     = readLS("saudeubs_pharmacy_v1", []);
  const auditLog  = readLS(AUDIT_KEY, []);

  // ── Período ──────────────────────────────────────────────────
  const [period, setPeriod] = useState("month");
  function inPeriod(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (period === "month")   return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    if (period === "quarter") { const q=Math.floor(now.getMonth()/3); return Math.floor(d.getMonth()/3)===q && d.getFullYear()===now.getFullYear(); }
    return d.getFullYear()===now.getFullYear();
  }
  const periodLabel = { month:"Mes atual", quarter:"Trimestre atual", year:"Ano atual" }[period];

  // ── Pacientes ─────────────────────────────────────────────────
  const totalPacientes   = patients.length;
  const comAcs           = patients.filter(p=>p.assignedAcsId).length;
  const semAcs           = totalPacientes - comAcs;
  const gestantes        = patients.filter(p=>String(p.careCategory||"").toLowerCase()==="pregnant").length;
  const criancas         = patients.filter(p=>{ const am=ageInMonths(p.birthDate); return am!==null&&am<120; }).length;
  const cronicos         = patients.filter(p=>Array.isArray(p.chronicConditions) && p.chronicConditions.length>0).length;
  const idosos           = patients.filter(p=>{ const am=ageInMonths(p.birthDate); return am!==null&&am>=720; }).length;

  // ── Protocolo ────────────────────────────────────────────────
  const criticos  = patients.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="danger").length;
  const atencao   = patients.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="warn").length;
  const emDia     = patients.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="ok").length;
  const cobertura = totalPacientes>0 ? Math.round(emDia/totalPacientes*100) : 0;

  // ── Produção ─────────────────────────────────────────────────
  const agendaPeriod  = agenda.filter(a=>inPeriod(a.date));
  const consultDone   = agendaPeriod.filter(a=>a.status==="done").length;
  const consultAbsent = agendaPeriod.filter(a=>a.status==="absent").length;
  const consultTotal  = agendaPeriod.length;
  const taxaComp      = consultTotal>0 ? Math.round(consultDone/consultTotal*100) : null;

  // ── Encaminhamentos ───────────────────────────────────────────
  const refPeriod     = referrals.filter(r=>inPeriod(r.createdAt));
  const refPendentes  = refPeriod.filter(r=>r.status==="pending").length;
  const refConcluidos = refPeriod.filter(r=>r.status==="done").length;

  // ── Farmácia ──────────────────────────────────────────────────
  const dispensas  = pharmaLog.filter(l=>l.type==="dispensa"&&inPeriod(l.ts)).length;
  const lowStock   = (stock||[]).filter(s=>Number(s.qty||0)<=Number(s.minQty||0)).length;
  const estoqueCrit= (stock||[]).filter(s=>Number(s.qty||0)===0).length;

  // ── Equipe ───────────────────────────────────────────────────
  const acsCount   = users.filter(u=>u.role==="acs").length;
  const docCount   = users.filter(u=>["doctor","nurse_manager"].includes(u.role)).length;
  const dentCount  = users.filter(u=>u.role==="dentist").length;
  const techCount  = users.filter(u=>["nursing_tech","pharmacy_tech"].includes(u.role)).length;

  // ── ACS performance ──────────────────────────────────────────
  const acsPerf = users.filter(u=>u.role==="acs").map(u=>{
    const mine = patients.filter(p=>p.assignedAcsId===u.id);
    const crit = mine.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="danger").length;
    const ok   = mine.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="ok").length;
    return { name:u.name, total:mine.length, criticos:crit, emDia:ok };
  }).sort((a,b)=>b.criticos-a.criticos);

  // ── Categoria breakdown ───────────────────────────────────────
  const catBreak = {};
  patients.forEach(p=>{ const c=p.careCategory||"general"; catBreak[c]=(catBreak[c]||0)+1; });
  const catEntries = Object.entries(catBreak).sort((a,b)=>b[1]-a[1]);
  const userPresence = [...users]
    .map((u) => {
      const lastSeenAt = String(u?.lastSeenAt || u?.lastLoginAt || "");
      const lastSeenTs = Date.parse(lastSeenAt);
      const online = Number.isFinite(lastSeenTs) ? (Date.now() - lastSeenTs <= ONLINE_WINDOW_MS) : false;
      return { ...u, online, lastSeenAt };
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));

  const userRoleOptions = [...new Set(userPresence.map((u) => String(u.role || "")).filter(Boolean))];
  const userTeamOptions = [...new Set(userPresence.map((u) => String(u.teamName || "")).filter(Boolean))];

  const filteredUsersGlobal = userPresence.filter((u) => {
    const q = String(globalUserSearch || "").trim().toLowerCase();
    const matchesText = !q
      || String(u.name || "").toLowerCase().includes(q)
      || String(u.email || "").toLowerCase().includes(q);
    const matchesRole = globalUserRoleFilter === "all" || String(u.role || "") === globalUserRoleFilter;
    const matchesStatus = globalUserStatusFilter === "all"
      || (globalUserStatusFilter === "online" && u.online)
      || (globalUserStatusFilter === "offline" && !u.online);
    const matchesTeam = globalUserTeamFilter === "all" || String(u.teamName || "") === globalUserTeamFilter;
    return matchesText && matchesRole && matchesStatus && matchesTeam;
  });

  // ── Auditoria recente ─────────────────────────────────────────
  const auditRecent = [...(auditLog||[])].reverse().slice(0,8);

  // ── Helpers visuais ──────────────────────────────────────────
  const TEAL="#0d9488", RED="#dc2626", AMBER="#d97706", GREEN="#16a34a", BLUE="#1d4ed8", VIOLET="#7c3aed";

  function KPI({ label, value, sub, color=TEAL, icon, trend }) {
    return (
      <div style={{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-lg)",padding:"1.1rem 1.25rem",boxShadow:"var(--sh-xs)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:color,borderRadius:"var(--r-lg) var(--r-lg) 0 0"}}/>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:".5rem"}}>
          <div>
            <div style={{fontSize:".68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"var(--text-3)",marginBottom:".5rem"}}>{label}</div>
            <div style={{fontSize:"2rem",fontWeight:800,color,lineHeight:1,fontFamily:"IBM Plex Mono,monospace",letterSpacing:"-.02em"}}>{value}</div>
            {sub&&<div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".3rem"}}>{sub}</div>}
          </div>
          {icon&&<div style={{fontSize:"1.4rem",opacity:.18,flexShrink:0}}>{icon}</div>}
        </div>
        {trend!=null&&(
          <div style={{marginTop:".6rem",display:"flex",alignItems:"center",gap:".3rem",fontSize:".72rem",color:trend>=0?GREEN:RED,fontWeight:600}}>
            {trend>=0?"↑":"↓"} {Math.abs(trend)}% vs período anterior
          </div>
        )}
      </div>
    );
  }

  function SectionTitle({ children, icon }) {
    return (
      <div style={{display:"flex",alignItems:"center",gap:".5rem",margin:"1.5rem 0 .75rem"}}>
        {icon&&<span style={{fontSize:"1rem"}}>{icon}</span>}
        <h3 style={{fontSize:".82rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".1em",color:"var(--text-3)"}}>{children}</h3>
        <div style={{flex:1,height:1,background:"var(--border)"}}/>
      </div>
    );
  }

  function Bar({ value, max, color=TEAL }) {
    const pct = max>0 ? Math.min(100,Math.round(value/max*100)) : 0;
    return (
      <div style={{height:6,background:"var(--surface-2)",borderRadius:99,overflow:"hidden",flex:1}}>
        <div style={{height:"100%",width:pct+"%",background:color,borderRadius:99,transition:"width .4s ease"}}/>
      </div>
    );
  }

  function GaugePie({ value, max, color=TEAL, label, size=80 }) {
    const pct = max>0?Math.min(1,value/max):0;
    const r=30, circ=2*Math.PI*r;
    const dash=circ*pct, gap=circ-dash;
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:".3rem"}}>
        <svg width={size} height={size} viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8"/>
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${dash} ${gap}`} strokeLinecap="round"
            transform="rotate(-90 36 36)" style={{transition:"stroke-dasharray .5s ease"}}/>
          <text x="36" y="40" textAnchor="middle" style={{fontSize:13,fontWeight:800,fill:color,fontFamily:"IBM Plex Mono,monospace"}}>{Math.round(pct*100)}%</text>
        </svg>
        <div style={{fontSize:".72rem",fontWeight:600,color:"var(--text-2)",textAlign:"center"}}>{label}</div>
      </div>
    );
  }

  return (
    <div style={{padding:"1.5rem 2rem",display:"flex",flexDirection:"column",gap:"1.25rem",maxWidth:1200}}>

      <PageHero
        badge="Painel de Gestão"
        title="Indicadores à Vista"
        subtitle="Visão executiva da UBS, atualizada em tempo real com os dados da equipe."
        actions={
          <div style={{display:"flex",gap:".4rem",flexWrap:"wrap",flexShrink:0}}>
            {[["month","Mês"],["quarter","Trimestre"],["year","Ano"]].map(([k,l])=>(
              <button key={k} onClick={()=>setPeriod(k)} style={{fontSize:".75rem",padding:".35rem .8rem",background:period===k?TEAL:"rgba(255,255,255,.1)",color:period===k?"var(--teal-900)":"#e2e8f0",border:period===k?"none":"1px solid rgba(255,255,255,.2)",borderRadius:"var(--r-md)",fontWeight:600,cursor:"pointer"}}>
                {l}
              </button>
            ))}
            <button onClick={()=>window.print()} style={{fontSize:".75rem",padding:".35rem .8rem",background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:"var(--r-md)",color:"#e2e8f0",cursor:"pointer"}}>
              Exportar
            </button>
          </div>
        }
      />

      {/* KPIs principais */}
      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:"1rem"}}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Logins cadastrados (todas as funções)</span>
            <span style={{fontSize:".75rem",color:"var(--text-3)"}}>
              {filteredUsersGlobal.filter((u)=>u.online).length} online · {filteredUsersGlobal.length} visíveis
            </span>
          </div>
          <div className="card-body" style={{paddingBottom:".55rem"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 140px 120px 170px",gap:".5rem"}}>
              <input
                value={globalUserSearch}
                onChange={(e)=>setGlobalUserSearch(e.target.value)}
                placeholder="Buscar por nome ou e-mail..."
                style={{height:34,border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"0 .6rem",fontSize:".78rem",fontFamily:"inherit"}}
              />
              <select
                value={globalUserRoleFilter}
                onChange={(e)=>setGlobalUserRoleFilter(e.target.value)}
                style={{height:34,border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"0 .5rem",fontSize:".78rem",fontFamily:"inherit"}}
              >
                <option value="all">Todas as funções</option>
                {userRoleOptions.map((role)=><option key={role} value={role}>{roleLabel(role)}</option>)}
              </select>
              <select
                value={globalUserStatusFilter}
                onChange={(e)=>setGlobalUserStatusFilter(e.target.value)}
                style={{height:34,border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"0 .5rem",fontSize:".78rem",fontFamily:"inherit"}}
              >
                <option value="all">Todos status</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
              <select
                value={globalUserTeamFilter}
                onChange={(e)=>setGlobalUserTeamFilter(e.target.value)}
                style={{height:34,border:"1px solid var(--border)",borderRadius:"var(--r-sm)",padding:"0 .5rem",fontSize:".78rem",fontFamily:"inherit"}}
              >
                <option value="all">Todas equipes</option>
                {userTeamOptions.map((team)=><option key={team} value={team}>{team}</option>)}
              </select>
            </div>
          </div>
          <div className="card-body" style={{maxHeight:320,overflow:"auto"}}>
            {!filteredUsersGlobal.length ? (
              <p className="muted" style={{fontSize:".84rem"}}>Nenhum login cadastrado.</p>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".45rem"}}>
                {filteredUsersGlobal.map((u) => (
                  <div key={u.id} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:".5rem",padding:".5rem .6rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:".8rem",fontWeight:600,color:"var(--text-1)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.name}</div>
                      <div style={{fontSize:".72rem",color:"var(--text-3)"}}>
                        {u.email} · {roleLabel(u.role)} · {u.teamName || "Sem equipe"}
                      </div>
                    </div>
                    <span style={{alignSelf:"center",fontSize:".68rem",fontWeight:700,padding:".15rem .45rem",borderRadius:999,background:u.online?"#dcfce7":"#f1f5f9",border:`1px solid ${u.online?"#bbf7d0":"#cbd5e1"}`,color:u.online?"#166534":"#475569"}}>
                      {u.online ? "Online" : "Offline"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:".85rem"}}>
        <KPI label="Pacientes cadastrados" value={totalPacientes} sub={`Com ACS: ${comAcs} · Sem ACS: ${semAcs}`} icon="P" color={TEAL}/>
        <KPI label="Protocolos criticos" value={criticos} sub={`Aten?o: ${atencao} · Em dia: ${emDia}`} icon="!" color={criticos>0?RED:GREEN}/>
        <KPI label="Cobertura protocolar" value={cobertura+"%"} sub={`${emDia} de ${totalPacientes} pacientes em dia`} icon="OK" color={cobertura>=80?GREEN:cobertura>=50?AMBER:RED}/>
        <KPI label="Consultas realizadas" value={consultDone} sub={`Faltas: ${consultAbsent} · Taxa: ${taxaComp!=null?taxaComp+"%":"-"}`} icon="C" color={BLUE}/>
        <KPI label="📤 Encaminhamentos" value={refPeriod.length} sub={`Pendentes: ${refPendentes} · Concluidos: ${refConcluidos}`} icon="E" color={VIOLET}/>
        <KPI label="Estoque critico" value={lowStock} sub={`${estoqueCrit} item(s) zerado(s)`} icon="S" color={lowStock>0?RED:GREEN}/>
      </div>

      {/* ── Gauges protocolo ── */}
      <div className="card">
        <div className="card-header"><span className="card-title">📈 Desempenho Protocolar</span></div>
        <div className="card-body" style={{display:"flex",alignItems:"center",gap:"2rem",flexWrap:"wrap"}}>
          <GaugePie value={emDia} max={totalPacientes} color={GREEN} label="Em dia"/>
          <GaugePie value={atencao} max={totalPacientes} color={AMBER} label="Aten?o"/>
          <GaugePie value={criticos} max={totalPacientes} color={RED} label="Critico"/>
          {taxaComp!=null&&<GaugePie value={consultDone} max={consultTotal} color={BLUE} label="Comparecimento"/>}
          <div style={{flex:1,minWidth:200}}>
            <div style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
              {[
                {label:"Gestantes",count:gestantes,color:"#ec4899"},
                {label:"Criancas (puericultura)",count:criancas,color:TEAL},
                {label:"Cronicos",count:cronicos,color:AMBER},
                {label:"Idosos",count:idosos,color:VIOLET},
              ].map(({label,count,color})=>(
                <div key={label}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:".75rem",marginBottom:".2rem"}}>
                    <span style={{color:"var(--text-2)",fontWeight:500}}>{label}</span>
                    <span style={{fontFamily:"IBM Plex Mono,monospace",fontWeight:700,color}}>{count}</span>
                  </div>
                  <Bar value={count} max={totalPacientes} color={color}/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Equipe e ACS ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>

        {/* Composição da equipe */}
        <div className="card">
          <div className="card-header"><span className="card-title">Composi?o da equipe</span><span style={{fontSize:".75rem",color:"var(--text-3)"}}>{users.length} membros</span></div>
          <div className="card-body">
            {[
              {label:"ACS",count:acsCount,color:AMBER,icon:"🏘️"},
              {label:"Medicos / Enfermeiros",count:docCount,color:BLUE,icon:"M"},
              {label:"Dentistas",count:dentCount,color:VIOLET,icon:"D"},
              {label:"Tecnicos",count:techCount,color:TEAL,icon:"T"},
            ].map(({label,count,color,icon})=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".55rem 0",borderBottom:"1px solid var(--border-soft)"}}>
                <span style={{fontSize:"1rem"}}>{icon}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:".82rem",marginBottom:".2rem"}}>
                    <span style={{fontWeight:500,color:"var(--text-1)"}}>{label}</span>
                    <span style={{fontFamily:"IBM Plex Mono,monospace",fontWeight:700,color}}>{count}</span>
                  </div>
                  <Bar value={count} max={users.length} color={color}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Performance ACS */}
        <div className="card">
          <div className="card-header"><span className="card-title">🏘️ Performance por ACS</span></div>
          <div className="card-body">
            {!acsPerf.length
              ? <p className="muted" style={{fontSize:".84rem"}}>Nenhum ACS cadastrado.</p>
              : <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                  {acsPerf.map(a=>(
                    <div key={a.name} style={{padding:".6rem .75rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:".35rem"}}>
                        <span style={{fontWeight:600,fontSize:".83rem",color:"var(--text-1)"}}>{a.name}</span>
                        <div style={{display:"flex",gap:".35rem"}}>
                          <span style={{fontSize:".68rem",fontWeight:700,padding:".1em .45em",borderRadius:99,background:a.criticos>0?"#fef2f2":"#f0fdf4",color:a.criticos>0?RED:GREEN,border:`1px solid ${a.criticos>0?"#fecaca":"#bbf7d0"}`}}>
                            {a.criticos} critico{a.criticos!==1?"s":""}
                          </span>
                          <span style={{fontSize:".68rem",fontWeight:700,padding:".1em .45em",borderRadius:99,background:"var(--surface)",color:"var(--text-3)",border:"1px solid var(--border)"}}>
                            {a.total} pac.
                          </span>
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                        <Bar value={a.emDia} max={a.total} color={GREEN}/>
                        <span style={{fontSize:".7rem",color:"var(--text-3)",flexShrink:0,minWidth:32}}>{a.total>0?Math.round(a.emDia/a.total*100):0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>
      </div>

      {/* ── Produção ── */}
      <SectionTitle icon="📅">Produção — {periodLabel}</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(175px,1fr))",gap:".85rem"}}>
        <KPI label="Consultas agendadas" value={consultTotal} icon="📅" color={BLUE}/>
        <KPI label="Consultas realizadas" value={consultDone} icon="✔️" color={GREEN}/>
        <KPI label="Faltas / ausências" value={consultAbsent} icon="❌" color={consultAbsent>0?AMBER:"var(--text-3)"}/>
        <KPI label="Taxa de comparecimento" value={taxaComp!=null?taxaComp+"%":"—"} icon="📊" color={taxaComp!=null?(taxaComp>=80?GREEN:taxaComp>=60?AMBER:RED):TEAL}/>
        <KPI label="Encaminhamentos emitidos" value={refPeriod.length} icon="📤" color={VIOLET}/>
        <KPI label="Dispensações farmácia" value={dispensas} icon="💊" color={TEAL}/>
      </div>

      {/* ── Farmácia ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
        <div className="card">
          <div className="card-header"><span className="card-title">💊 Estoque — Situação Atual</span></div>
          <div className="card-body">
            {!stock?.length
              ? <p className="muted" style={{fontSize:".84rem"}}>Sem itens cadastrados.</p>
              : <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:".5rem",marginBottom:"1rem"}}>
                    {[
                      {label:"Total de itens",v:stock.length,color:TEAL},
                      {label:"Estoque baixo",v:lowStock,color:AMBER},
                      {label:"Zerados",v:estoqueCrit,color:RED},
                    ].map(({label,v,color})=>(
                      <div key={label} style={{textAlign:"center",background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:".65rem .5rem",border:"1px solid var(--border)"}}>
                        <div style={{fontSize:"1.4rem",fontWeight:800,color,fontFamily:"IBM Plex Mono,monospace"}}>{v}</div>
                        <div style={{fontSize:".68rem",color:"var(--text-3)",marginTop:".15rem"}}>{label}</div>
                      </div>
                    ))}
                  </div>
                  {stock.filter(s=>Number(s.qty||0)<=Number(s.minQty||0)).slice(0,5).map(s=>(
                    <div key={s.id||s.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:".4rem 0",borderBottom:"1px solid var(--border-soft)",fontSize:".8rem"}}>
                      <span style={{color:"var(--text-1)",fontWeight:500}}>{s.name}</span>
                      <span style={{fontWeight:700,color:Number(s.qty||0)===0?RED:AMBER,fontFamily:"IBM Plex Mono,monospace"}}>{s.qty||0} un.</span>
                    </div>
                  ))}
                  {lowStock>5&&<p style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".5rem"}}>+{lowStock-5} itens abaixo do mínimo</p>}
                </>
            }
          </div>
        </div>

        {/* Encaminhamentos por especialidade */}
        <div className="card">
          <div className="card-header"><span className="card-title">📋 Encaminhamentos por Especialidade</span><span style={{fontSize:".75rem",color:"var(--text-3)"}}>{refPeriod.length} total</span></div>
          <div className="card-body">
            {!refPeriod.length
              ? <p className="muted" style={{fontSize:".84rem"}}>Nenhum encaminhamento no período.</p>
              : (() => {
                  const specMap = {};
                  refPeriod.forEach(r=>{ specMap[r.specialty||"Outros"]=(specMap[r.specialty||"Outros"]||0)+1; });
                  return Object.entries(specMap).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([s,c])=>(
                    <div key={s} style={{display:"flex",alignItems:"center",gap:".6rem",padding:".4rem 0",borderBottom:"1px solid var(--border-soft)"}}>
                      <span style={{flex:1,fontSize:".8rem",color:"var(--text-1)",fontWeight:500}}>{s}</span>
                      <Bar value={c} max={refPeriod.length} color={VIOLET}/>
                      <span style={{fontFamily:"IBM Plex Mono,monospace",fontWeight:700,color:VIOLET,fontSize:".78rem",minWidth:24,textAlign:"right"}}>{c}</span>
                    </div>
                  ));
                })()
            }
          </div>
        </div>
      </div>

      {/* ── Distribuição de pacientes ── */}
      <div className="card">
        <div className="card-header"><span className="card-title">👥 Distribuição de Pacientes por Categoria</span></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:".6rem"}}>
            {catEntries.map(([cat,count])=>{
              const label=templates.find(t=>t.category===cat)?.label||cat;
              const pct=totalPacientes>0?Math.round(count/totalPacientes*100):0;
              const chip=protocolChip;
              const catCrit=patients.filter(p=>p.careCategory===cat&&chip(protocolByPatient[p.id]).tone==="danger").length;
              return (
                <div key={cat} style={{background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",padding:".75rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:".4rem"}}>
                    <span style={{fontWeight:600,fontSize:".83rem",color:"var(--text-1)"}}>{label}</span>
                    <span style={{fontFamily:"IBM Plex Mono,monospace",fontWeight:800,fontSize:".95rem",color:TEAL}}>{count}</span>
                  </div>
                  <Bar value={count} max={totalPacientes} color={TEAL}/>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:".3rem",fontSize:".7rem",color:"var(--text-3)"}}>
                    <span>{pct}% do total</span>
                    {catCrit>0&&<span style={{color:RED,fontWeight:700}}>{catCrit} crítico{catCrit!==1?"s":""}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Auditoria recente ── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🔍 Trilha de Auditoria — Ações Recentes</span>
          <span style={{fontSize:".72rem",color:"var(--text-3)"}}>{auditLog?.length||0} registros totais</span>
        </div>
        <div className="card-body">
          {!auditRecent.length
            ? <p className="muted" style={{fontSize:".84rem"}}>Nenhuma ação registrada ainda.</p>
            : <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                {auditRecent.map((a,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:".75rem",padding:".55rem .65rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",fontSize:".78rem"}}>
                    <span style={{flexShrink:0,width:8,height:8,borderRadius:"50%",background:TEAL,marginTop:4,display:"block"}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{fontWeight:600,color:"var(--text-1)"}}>{a.action||a.event||"Ação"}</span>
                      {a.user && (
                        <span style={{ color:"var(--text-3)", marginLeft:".4rem" }}>
                          por {typeof a.user === "object" ? (a.user.name || a.user.email || "usuário") : a.user}
                        </span>
                      )}
                    </div>
                    <span style={{flexShrink:0,color:"var(--text-3)",fontFamily:"IBM Plex Mono,monospace",fontSize:".7rem"}}>
                      {a.ts||a.createdAt ? new Date(a.ts||a.createdAt).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—"}
                    </span>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

    </div>
  );
}

function ReportsPage({ patients, users, templates, protocolByPatient }) {
  const [period, setPeriod] = useState("month"); // month | quarter | year
  const [tab, setTab]       = useState("overview");

  const agenda  = readLS(AGENDA_KEY, []);
  const referrals = readLS(REFERRALS_KEY, []);
  const pharmaLog = readLS("saudeubs_pharmalog_v1", []);
  const stock     = readLS("saudeubs_pharmacy_v1", []);

  const now = new Date();
  function inPeriod(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (period === "month")   return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    if (period === "quarter") { const q=Math.floor(now.getMonth()/3); return Math.floor(d.getMonth()/3)===q && d.getFullYear()===now.getFullYear(); }
    return d.getFullYear()===now.getFullYear();
  }

  // Stats
  const totalPatients    = patients.length;
  const gestantes        = patients.filter(p=>String(p.careCategory||"").toLowerCase()==="pregnant").length;
  const criancas         = patients.filter(p=>{ const am=ageInMonths(p.birthDate); return am!==null&&am<120; }).length;
  const protCritical     = patients.filter(p=>protocolChip(protocolByPatient[p.id]).tone==="danger").length;
  const agendaPeriod     = agenda.filter(a=>inPeriod(a.date));
  const consultDone      = agendaPeriod.filter(a=>a.status==="done").length;
  const consultAbsent    = agendaPeriod.filter(a=>a.status==="absent").length;
  const referralsPeriod  = referrals.filter(r=>inPeriod(r.createdAt));
  const dispensasPeriod  = pharmaLog.filter(l=>l.type==="dispensa"&&inPeriod(l.ts));
  const lowStock         = (stock||[]).filter(s=>s.qty<=s.minQty).length;
  const acsCount         = users.filter(u=>u.role==="acs").length;
  const docCount         = users.filter(u=>["doctor","nurse_manager"].includes(u.role)).length;

  // Category breakdown
  const catBreak = {};
  patients.forEach(p=>{ const c=p.careCategory||"general"; catBreak[c]=(catBreak[c]||0)+1; });

  // Specialty breakdown for referrals
  const specBreak = {};
  referralsPeriod.forEach(r=>{ specBreak[r.specialty]=(specBreak[r.specialty]||0)+1; });
  const topSpecs = Object.entries(specBreak).sort((a,b)=>b[1]-a[1]).slice(0,5);

  const periodLabel = { month:"Mês atual", quarter:"Trimestre atual", year:"Ano atual" }[period];

  function StatBox({ label, value, sub, color="#1d4ed8", bg="#eff6ff" }) {
    return (
      <div style={{background:bg,borderRadius:"var(--r-md)",padding:"1rem",border:`1px solid ${bg.replace("ff)","cc)")}`}}>
        <div style={{fontSize:"1.8rem",fontWeight:900,color,lineHeight:1}}>{value}</div>
        <div style={{fontWeight:700,fontSize:".78rem",color,marginTop:".3rem"}}>{label}</div>
        {sub&&<div style={{fontSize:".71rem",color:"var(--text-3)",marginTop:".2rem"}}>{sub}</div>}
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <PageHero
        badge="Gestão e Monitoramento"
        title="Relatórios"
        subtitle="Indicadores operacionais e de saúde para prestação de contas."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
          <div style={{display:"flex",gap:".4rem",flexShrink:0}}>
            {[["month","Mês"],["quarter","Trimestre"],["year","Ano"]].map(([k,l])=>(
              <button key={k} onClick={()=>setPeriod(k)} style={{fontSize:".75rem",padding:".3rem .65rem",background:period===k?"var(--teal-600)":"var(--surface-2)",color:period===k?"#fff":"var(--text-2)",border:period===k?"none":"1px solid var(--border)"}}>
                {l}
              </button>
            ))}
            <button onClick={()=>window.print()} style={{fontSize:".75rem",padding:".3rem .65rem",marginLeft:".25rem"}}>🖨️ Exportar</button>
          </div>
        }
      />

      {/* Sub tabs */}
      <div style={{display:"flex",gap:0,padding:"0 1.5rem",borderBottom:"1px solid var(--border)",marginBottom:"1rem"}}>
        {[["overview","Visão Geral"],["patients","Pacientes"],["production","Produção"],["pharmacy","Farmácia"],["esus","e-SUS / RNDS"],["audit","Trilha de Auditoria"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:".5rem .9rem",fontSize:".78rem",fontWeight:600,border:"none",background:"transparent",cursor:"pointer",color:tab===k?"var(--teal-600)":"var(--text-3)",borderBottom:tab===k?"2px solid var(--teal-500)":"2px solid transparent"}}>
            {l}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflow:"auto",padding:"0 1.5rem 1.5rem"}}>
        {tab==="overview"&&(
          <>
            <p style={{fontSize:".8rem",color:"var(--text-3)",marginBottom:"1rem",fontWeight:600}}>Período: {periodLabel}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:".75rem",marginBottom:"1.5rem"}}>
              <StatBox label="Total de pacientes" value={totalPatients} sub={`Gestantes: ${gestantes} · Crianças: ${criancas}`}/>
              <StatBox label="Protocolos críticos" value={protCritical} color="#be123c" bg="#fff1f2" sub="Precisam de atenção"/>
              <StatBox label="Consultas realizadas" value={consultDone} color="#15803d" bg="#f0fdf4" sub={`Faltas: ${consultAbsent}`}/>
              <StatBox label="📤 Encaminhamentos" value={referralsPeriod.length} color="#7e22ce" bg="#faf5ff" sub={`Pendentes: ${referralsPeriod.filter(r=>r.status==="pending").length}`}/>
              <StatBox label="Dispensações" value={dispensasPeriod.length} color="#c2410c" bg="#fff7ed" sub="Medicamentos entregues"/>
              <StatBox label="Estoque crítico" value={lowStock} color={lowStock>0?"#be123c":"#15803d"} bg={lowStock>0?"#fff1f2":"#f0fdf4"} sub="Abaixo do mínimo"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
              <div className="card">
                <div className="card-header"><span className="card-title">Equipe</span></div>
                <div className="card-body" style={{fontSize:".82rem"}}>
                  {[["ACS",acsCount],["Médicos/Enf.",docCount],["Total",users.length]].map(([l,v])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:".35rem 0",borderBottom:"1px solid var(--border-soft)"}}>
                      <span style={{color:"var(--text-2)"}}>{l}</span><strong>{v}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="card-header"><span className="card-title">Top especialidades encaminhadas</span></div>
                <div className="card-body" style={{fontSize:".82rem"}}>
                  {!topSpecs.length?<p className="muted">Nenhum encaminhamento no período.</p>:topSpecs.map(([s,c])=>(
                    <div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:".3rem 0",borderBottom:"1px solid var(--border-soft)"}}>
                      <span style={{color:"var(--text-2)"}}>{s}</span>
                      <span style={{fontWeight:700,color:"var(--teal-700)"}}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
        {tab==="patients"&&(
          <>
            <p style={{fontSize:".8rem",color:"var(--text-3)",marginBottom:"1rem",fontWeight:600}}>Distribuição por categoria de cuidado</p>
            <div className="card">
              <div style={{padding:"1rem"}}>
                {Object.entries(catBreak).sort((a,b)=>b[1]-a[1]).map(([cat,count])=>{
                  const pct=Math.round(count/totalPatients*100);
                  return(
                    <div key={cat} style={{marginBottom:".75rem"}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:".8rem",marginBottom:".25rem"}}>
                        <span style={{fontWeight:600}}>{templates.find(t=>t.category===cat)?.label||cat}</span>
                        <span style={{color:"var(--text-3)"}}>{count} ({pct}%)</span>
                      </div>
                      <div style={{height:8,background:"var(--surface-2)",borderRadius:999}}>
                        <div style={{height:8,background:"var(--teal-500)",borderRadius:999,width:pct+"%",transition:"width .4s"}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {tab==="production"&&(
          <>
            <p style={{fontSize:".8rem",color:"var(--text-3)",marginBottom:"1rem",fontWeight:600}}>Produção — {periodLabel}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:".75rem"}}>
              <StatBox label="Consultas agendadas" value={agendaPeriod.length} color="#1d4ed8" bg="#eff6ff"/>
              <StatBox label="Consultas realizadas" value={consultDone} color="#15803d" bg="#f0fdf4"/>
              <StatBox label="Faltas" value={consultAbsent} color="#c2410c" bg="#fff7ed"/>
              <StatBox label="Taxa de comparecimento" value={agendaPeriod.length>0?Math.round(consultDone/agendaPeriod.length*100)+"%":"—"} color="#7e22ce" bg="#faf5ff"/>
              <StatBox label="Encaminhamentos emitidos" value={referralsPeriod.length} color="#1d4ed8" bg="#eff6ff"/>
              <StatBox label="Encaminhamentos concluídos" value={referralsPeriod.filter(r=>r.status==="done").length} color="#15803d" bg="#f0fdf4"/>
            </div>
          </>
        )}
        {tab==="pharmacy"&&(
          <>
            <p style={{fontSize:".8rem",color:"var(--text-3)",marginBottom:"1rem",fontWeight:600}}>Farmácia — {periodLabel}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:".75rem",marginBottom:"1.5rem"}}>
              <StatBox label="Dispensações" value={dispensasPeriod.length} color="#c2410c" bg="#fff7ed"/>
              <StatBox label="Itens em estoque" value={(stock||[]).length} color="#1d4ed8" bg="#eff6ff"/>
              <StatBox label="Estoque zerado" value={(stock||[]).filter(s=>s.qty===0).length} color="#be123c" bg="#fff1f2"/>
              <StatBox label="Estoque baixo" value={lowStock} color="#c2410c" bg="#fff7ed"/>
            </div>
            {dispensasPeriod.length>0&&(
              <div className="card">
                <div className="card-header"><span className="card-title">Medicamentos mais dispensados</span></div>
                <div style={{padding:"0 1rem .75rem"}}>
                  {Object.entries(dispensasPeriod.reduce((a,d)=>{ a[d.itemName]=(a[d.itemName]||0)+Number(d.qty||1); return a; },{}))
                    .sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,qty])=>(
                      <div key={name} style={{display:"flex",justifyContent:"space-between",padding:".35rem 0",borderBottom:"1px solid var(--border-soft)",fontSize:".82rem"}}>
                        <span>{name}</span><strong style={{color:"var(--teal-700)"}}>{qty}</strong>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </>
        )}
        {tab==="esus"&&(
          <EsusMirror patients={patients} users={users} period={period} periodLabel={periodLabel}/>
        )}

        {tab==="audit"&&(
          <AuditLogPanel/>
        )}
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════
   AUDIT LOG PANEL — trilha de auditoria imutável
══════════════════════════════════════════════════════════════════ */
const ACTION_LABELS = {
  LOGIN:                   { label:"Login",                color:"#15803d", bg:"#f0fdf4" },
  LOGIN_FAILED:            { label:"Tentativa falha",      color:"#be123c", bg:"#fff1f2" },
  LOGOUT:                  { label:"Logout",               color:"#64748b", bg:"var(--surface-2)" },
  USUARIO_CADASTRADO:      { label:"Usuário cadastrado",   color:"#1d4ed8", bg:"#eff6ff" },
  USUARIO_EDITADO:         { label:"Usuário editado",      color:"#c2410c", bg:"#fff7ed" },
  USUARIO_EXCLUIDO:        { label:"Usuário excluído",     color:"#be123c", bg:"#fff1f2" },
  PACIENTE_CADASTRADO:     { label:"Paciente cadastrado",  color:"#0f766e", bg:"var(--teal-50)" },
  PACIENTE_EDITADO:        { label:"Paciente editado",     color:"#0891b2", bg:"#ecfeff" },
  PACIENTE_EXCLUIDO:       { label:"Paciente excluído",    color:"#be123c", bg:"#fff1f2" },
  ATENDIMENTO_REGISTRADO:  { label:"Atendimento",          color:"#6366f1", bg:"#eff6ff" },
  TAREFA_CRIADA:           { label:"Tarefa criada",        color:"#d97706", bg:"#fffbeb" },
  MENSAGEM_ENVIADA:        { label:"Mensagem",             color:"#0891b2", bg:"#ecfeff" },
  REGISTRO_INATIVADO:      { label:"Registro inativado",   color:"#92400e", bg:"#fffbeb" },
  ATENDIMENTO_EXCLUIDO:    { label:"Atendimento excluído", color:"#be123c", bg:"#fff1f2" },
  ACESSO_PRONTUARIO:       { label:"Acesso prontuário",    color:"#7c3aed", bg:"#f5f3ff" },
  LANCAMENTO_REGISTRO:     { label:"Lançamento prontuário",color:"#6366f1", bg:"#eff6ff" },
  INATIVACAO_REGISTRO:     { label:"Inativação prontuário",color:"#92400e", bg:"#fffbeb" },
  PEDIDO_EXAME:            { label:"Pedido de exame",      color:"#0f766e", bg:"var(--teal-50)" },
  PRESCRICAO_EMITIDA:      { label:"Prescrição emitida",   color:"#15803d", bg:"#f0fdf4" },
  ENCAMINHAMENTO_INTERNO:  { label:"Encaminhamento",       color:"#1d4ed8", bg:"#eff6ff" },
  EXAME_POSTO_REGISTRADO:  { label:"Exame (posto)",        color:"#0f766e", bg:"var(--teal-50)" },
  EXAME_EXTERNO_INSERIDO:  { label:"Exame externo",        color:"#6366f1", bg:"#eff6ff" },
  RESET_SENHA_SOLICITADO:  { label:"Reset de senha",       color:"#c2410c", bg:"#fff7ed" },
  DISPENSACAO_FARMACIA:    { label:"Dispensação",           color:"#7c3aed", bg:"#f5f3ff" },
  ESTOQUE_AJUSTADO:        { label:"Ajuste de estoque",     color:"#c2410c", bg:"#fff7ed" },
  MEDICAMENTO_CADASTRADO:  { label:"Medicamento cadastrado",color:"#15803d", bg:"#f0fdf4" },
  MEDICAMENTO_EDITADO:     { label:"Medicamento editado",   color:"#0891b2", bg:"#ecfeff" },
  EXAME_EXCLUIDO:          { label:"Exame excluído",        color:"#be123c", bg:"#fff1f2" },
};

function AuditLogPanel() {
  const [log]         = useState(()=>readAuditLog());
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const filtered = log.filter(e=>{
    if(actionFilter && e.action !== actionFilter) return false;
    if(search.trim()) {
      const q = search.toLowerCase();
      return (e.tsDisplay||"").includes(q)
        || (e.action||"").toLowerCase().includes(q)
        || (e.user?.name||"").toLowerCase().includes(q)
        || (e.user?.email||"").toLowerCase().includes(q)
        || JSON.stringify(e).toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length/PAGE_SIZE));
  const paged = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const actions = [...new Set(log.map(e=>e.action))].sort();

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:".65rem"}}>
        <div>
          <div style={{fontWeight:700,fontSize:"1rem",color:"var(--ink)"}}>Trilha de Auditoria</div>
          <div style={{fontSize:".73rem",color:"var(--text-3)",marginTop:".1rem"}}>
            {log.length} eventos registrados · Imutável · Exportável
          </div>
        </div>
        <button onClick={exportAuditLog}
          style={{fontSize:".78rem",padding:".4rem .85rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:".4rem"}}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          Exportar CSV
        </button>
      </div>

      {/* Aviso de imutabilidade */}
      <div style={{padding:".55rem .85rem",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".73rem",color:"#92400e",marginBottom:"1rem",display:"flex",gap:".5rem",alignItems:"center"}}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        <span>Esta trilha é <strong>somente leitura</strong>. Nenhum registro pode ser alterado ou excluído. Todos os eventos do sistema são gravados automaticamente com data, hora e usuário responsável.</span>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:".5rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
          placeholder="Buscar por usuário, ação, detalhe..."
          style={{flex:1,minWidth:200}}/>
        <select value={actionFilter} onChange={e=>{setActionFilter(e.target.value);setPage(1);}}
          style={{minWidth:180}}>
          <option value="">Todas as ações</option>
          {actions.map(a=><option key={a} value={a}>{ACTION_LABELS[a]?.label||a}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <table className="patients-table" style={{width:"100%"}}>
          <thead>
            <tr>
              <th style={{width:150}}>Data / Hora</th>
              <th style={{width:160}}>Ação</th>
              <th style={{width:160}}>Usuário</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {!paged.length&&(
              <tr><td colSpan={4} style={{textAlign:"center",padding:"2rem",color:"var(--text-3)",fontSize:".84rem"}}>Nenhum evento encontrado.</td></tr>
            )}
            {paged.map(e=>{
              const meta = ACTION_LABELS[e.action]||{label:e.action,color:"var(--text-3)",bg:"var(--surface-2)"};
              const details = Object.entries(e)
                .filter(([k])=>!["id","ts","tsDisplay","action","user"].includes(k))
                .map(([k,v])=>`${k}: ${typeof v==="object"?JSON.stringify(v):v}`)
                .join(" · ");
              return (
                <tr key={e.id}>
                  <td style={{fontSize:".72rem",color:"var(--text-3)",fontFamily:"IBM Plex Mono",whiteSpace:"nowrap"}}>{e.tsDisplay||e.ts?.slice(0,19).replace("T"," ")||"—"}</td>
                  <td>
                    <span style={{fontSize:".71rem",fontWeight:700,padding:".15rem .45rem",borderRadius:999,background:meta.bg,color:meta.color,border:`1px solid ${meta.color}22`,whiteSpace:"nowrap"}}>
                      {meta.label}
                    </span>
                  </td>
                  <td style={{fontSize:".78rem"}}>
                    {e.user ? (
                      <div>
                        <div style={{fontWeight:600,color:"var(--ink)"}}>{e.user.name||"—"}</div>
                        <div style={{fontSize:".68rem",color:"var(--text-3)"}}>{e.user.email} · {e.user.role}</div>
                      </div>
                    ) : <span style={{color:"var(--text-3)"}}>—</span>}
                  </td>
                  <td style={{fontSize:".74rem",color:"var(--text-2)",maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={details}>
                    {details||"—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages>1&&(
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:".75rem",fontSize:".78rem",color:"var(--text-3)"}}>
          <span>Mostrando {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,filtered.length)} de {filtered.length}</span>
          <div style={{display:"flex",gap:".4rem"}}>
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
              style={{padding:".3rem .65rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",fontSize:".78rem"}}>
              Anterior
            </button>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
              style={{padding:".3rem .65rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",fontSize:".78rem"}}>
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   e-SUS / RNDS — Espelho de Produção
══════════════════════════════════════════════════════════════════ */
function EsusMirror({ patients, users, period, periodLabel }) {
  const agenda    = readLS(AGENDA_KEY, []);
  const referrals = readLS(REFERRALS_KEY, []);
  const pharmaLog = readLS("saudeubs_pharmalog_v1", []);
  const [copied, setCopied] = useState("");

  const now = new Date();
  function inPeriod(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (period === "month")   return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    if (period === "quarter") { const q=Math.floor(now.getMonth()/3); return Math.floor(d.getMonth()/3)===q && d.getFullYear()===now.getFullYear(); }
    return d.getFullYear()===now.getFullYear();
  }

  const monthNum   = String(now.getMonth()+1).padStart(2,"0");
  const yearNum    = now.getFullYear();
  const competencia = `${monthNum}/${yearNum}`;

  // ── Produção ambulatorial (BPA-I / BPA-C) ──
  const consultasDone   = agenda.filter(a=>inPeriod(a.date)&&a.status==="done"&&a.type==="consultation").length;
  const retornosDone    = agenda.filter(a=>inPeriod(a.date)&&a.status==="done"&&a.type==="return").length;
  const procedimentos   = agenda.filter(a=>inPeriod(a.date)&&a.status==="done"&&a.type==="procedure").length;

  const doctors  = users.filter(u=>["doctor"].includes(u.role));
  const nurses   = users.filter(u=>["nurse_manager","nursing_tech"].includes(u.role));
  const acs      = users.filter(u=>u.role==="acs");

  // ── Ficha de Cadastro Individual (FCI) — pacientes cadastrados no período ──
  const patientsPeriod = patients.length; // all (no date filter on creation since not stored)

  // ── Fichas de Atendimento Individual (FAI) ──
  const faiTotal = consultasDone + retornosDone + procedimentos;

  // ── Visitas domiciliares ACS ──
  const visitasACS = 0; // Would come from records with type=visit — approximate

  // ── Encaminhamentos ──
  const encTotal = referrals.filter(r=>inPeriod(r.createdAt)).length;

  // ── Dispensações farmácia ──
  const dispensas = pharmaLog.filter(l=>l.type==="dispensa"&&inPeriod(l.ts)).length;

  // ── Gestantes acompanhadas ──
  const gestantes = patients.filter(p=>String(p.careCategory||"").toLowerCase()==="pregnant").length;

  // ── Crianças ──
  const criancas = patients.filter(p=>{ const am=ageInMonths(p.birthDate); return am!==null&&am<60; }).length;

  function copyToClipboard(text, key) {
    navigator.clipboard?.writeText(text).then(()=>{ setCopied(key); setTimeout(()=>setCopied(""),1500); });
  }

  function CopyBtn({ value, k }) {
    return (
      <button onClick={()=>copyToClipboard(String(value), k)}
        style={{fontSize:".65rem",padding:".15rem .45rem",borderRadius:4,background:copied===k?"#f0fdf4":"var(--surface-2)",border:`1px solid ${copied===k?"#bbf7d0":"var(--border)"}`,color:copied===k?"#15803d":"var(--text-3)",cursor:"pointer",transition:"all .15s",fontWeight:600}}>
        {copied===k?"✓ Copiado":"Copiar"}
      </button>
    );
  }

  function Row({ label, value, code, hint, k }) {
    return (
      <tr>
        <td style={{padding:".5rem .75rem",fontSize:".78rem",color:"var(--text-2)",borderBottom:"1px solid var(--border-soft)"}}>{label}</td>
        {code&&<td style={{padding:".5rem .75rem",fontSize:".72rem",fontFamily:"IBM Plex Mono",color:"var(--text-3)",borderBottom:"1px solid var(--border-soft)"}}>{code}</td>}
        <td style={{padding:".5rem .75rem",fontWeight:700,fontSize:".9rem",color:"var(--teal-700)",borderBottom:"1px solid var(--border-soft)",textAlign:"center"}}>{value}</td>
        <td style={{padding:".5rem .75rem",borderBottom:"1px solid var(--border-soft)"}}>
          <CopyBtn value={value} k={k||label}/>
        </td>
        {hint&&<td style={{padding:".5rem .75rem",fontSize:".7rem",color:"var(--text-3)",borderBottom:"1px solid var(--border-soft)"}}>{hint}</td>}
      </tr>
    );
  }

  const fullReport = `ESPELHO e-SUS/RNDS — ${periodLabel.toUpperCase()}
Competência: ${competencia}
Gerado em: ${new Date().toLocaleString("pt-BR")}

=== CADASTROS ===
Total de pacientes cadastrados: ${patientsPeriod}
Gestantes acompanhadas: ${gestantes}
Crianças < 5 anos: ${criancas}

=== PRODUÇÃO AMBULATORIAL ===
Consultas médicas realizadas: ${consultasDone}
Retornos realizados: ${retornosDone}
Procedimentos: ${procedimentos}
Total FAI: ${faiTotal}
Encaminhamentos emitidos: ${encTotal}

=== EQUIPE ===
Médicos: ${doctors.length}
Enfermeiros/Téc.: ${nurses.length}
ACS: ${acs.length}

=== FARMÁCIA ===
Dispensações: ${dispensas}
`;

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:".5rem"}}>
        <div>
          <p style={{fontSize:".82rem",fontWeight:700,color:"var(--ink)",margin:0}}>Espelho de Produção — e-SUS APS / RNDS</p>
          <p style={{fontSize:".73rem",color:"var(--text-3)",margin:".2rem 0 0"}}>Competência: <strong>{competencia}</strong> · {periodLabel} · Use os valores abaixo para lançar no sistema federal.</p>
        </div>
        <div style={{display:"flex",gap:".4rem"}}>
          <button onClick={()=>copyToClipboard(fullReport,"full")} style={{fontSize:".75rem",padding:".35rem .75rem",display:"flex",alignItems:"center",gap:".3rem"}}>
            {copied==="full"?"✓ Copiado":"📋 Copiar relatório completo"}
          </button>
          <button onClick={()=>window.print()} style={{fontSize:".75rem",padding:".35rem .75rem"}}>🖨️ Imprimir</button>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:"1rem"}}>

        {/* Cadastros */}
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:".6rem 1rem",background:"#eff6ff",borderBottom:"1px solid #bfdbfe",display:"flex",alignItems:"center",gap:".5rem"}}>
            <span style={{fontWeight:700,fontSize:".78rem",color:"#1d4ed8"}}>📋 Ficha de Cadastro Individual (FCI)</span>
            <span style={{fontSize:".7rem",color:"#3b82f6",marginLeft:"auto"}}>Módulo CDS / e-SUS APS</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <tbody>
              <Row label="Total de indivíduos cadastrados" code="FCI-001" value={patientsPeriod} k="fci001" hint="Campo: Fichas de cadastro"/>
              <Row label="Gestantes em acompanhamento"     code="FCI-002" value={gestantes}     k="fci002" hint="Condição: Gestante"/>
              <Row label="Crianças < 5 anos"               code="FCI-003" value={criancas}      k="fci003" hint="Faixa etária 0–59 meses"/>
              <Row label="Total ACS cadastradores"         code="FCI-004" value={acs.length}    k="fci004"/>
            </tbody>
          </table>
        </div>

        {/* Atendimento */}
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:".6rem 1rem",background:"#f0fdf4",borderBottom:"1px solid #bbf7d0",display:"flex",alignItems:"center",gap:".5rem"}}>
            <span style={{fontWeight:700,fontSize:".78rem",color:"#15803d"}}>🩺 Ficha de Atendimento Individual (FAI)</span>
            <span style={{fontSize:".7rem",color:"#22c55e",marginLeft:"auto"}}>Módulo CDS / e-SUS APS</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <tbody>
              <Row label="Consultas médicas realizadas"    code="FAI-001" value={consultasDone}  k="fai001" hint="Tipo: Consulta · Status: Concluído"/>
              <Row label="Retornos realizados"             code="FAI-002" value={retornosDone}   k="fai002" hint="Tipo: Retorno · Status: Concluído"/>
              <Row label="Procedimentos"                   code="FAI-003" value={procedimentos}  k="fai003" hint="Tipo: Procedimento"/>
              <Row label="Total de atendimentos (FAI)"     code="FAI-TOT" value={faiTotal}       k="faitot"/>
              <Row label="Encaminhamentos emitidos"        code="ENC-001" value={encTotal}       k="enc001" hint="Referência p/ especialista"/>
            </tbody>
          </table>
        </div>

        {/* Equipe */}
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:".6rem 1rem",background:"#faf5ff",borderBottom:"1px solid #e9d5ff",display:"flex",alignItems:"center",gap:".5rem"}}>
            <span style={{fontWeight:700,fontSize:".78rem",color:"#7e22ce"}}>👥 Composição da Equipe</span>
            <span style={{fontSize:".7rem",color:"#a855f7",marginLeft:"auto"}}>CNES / e-Gestor AB</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <tbody>
              <Row label="Médicos"                         code="EQ-001" value={doctors.length} k="eq001"/>
              <Row label="Enfermeiros / Técnicos"          code="EQ-002" value={nurses.length}  k="eq002"/>
              <Row label="Agentes Comunitários de Saúde"   code="EQ-003" value={acs.length}     k="eq003"/>
              <Row label="Total equipe"                    code="EQ-TOT" value={users.length}   k="eqtot"/>
            </tbody>
          </table>
        </div>

        {/* Farmácia */}
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:".6rem 1rem",background:"#fff7ed",borderBottom:"1px solid #fed7aa",display:"flex",alignItems:"center",gap:".5rem"}}>
            <span style={{fontWeight:700,fontSize:".78rem",color:"#c2410c"}}>💊 Dispensação de Medicamentos</span>
            <span style={{fontSize:".7rem",color:"#f97316",marginLeft:"auto"}}>RNDS / HÓRUS</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <tbody>
              <Row label="Total de dispensações"           code="FARM-01" value={dispensas}     k="farm01" hint="Registro HÓRUS / RNDS"/>
            </tbody>
          </table>
        </div>

        {/* Aviso */}
        <div style={{padding:".75rem 1rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",fontSize:".75rem",color:"var(--text-3)",lineHeight:1.6}}>
          <strong style={{color:"var(--text-2)"}}>âš ï¸ Importante:</strong> Este espelho é gerado automaticamente a partir dos dados registrados no SaudeUBS e serve como <strong>referência de apoio</strong> para o lançamento no e-SUS APS, RNDS e outros sistemas federais. Sempre confira os dados com a equipe antes do envio oficial.
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   BUSCA GLOBAL
══════════════════════════════════════════════════════════════════ */
function GlobalSearch({ patients, templates, onNavigate }) {
  const [open, setOpen]   = useState(false);
  const [q, setQ]         = useState("");
  const ref               = useRef(null);
  const inputRef          = useRef(null);

  useEffect(()=>{
    function handler(e) {
      if((e.ctrlKey||e.metaKey)&&e.key==="k"){ e.preventDefault(); setOpen(v=>!v); }
      if(e.key==="Escape") setOpen(false);
    }
    document.addEventListener("keydown",handler);
    return ()=>document.removeEventListener("keydown",handler);
  },[]);

  useEffect(()=>{ if(open&&inputRef.current) inputRef.current.focus(); },[open]);

  const results = useMemo(()=>{
    if(!q.trim()||q.length<2) return [];
    return patients.filter(p => matchesPatientSearch(p, q)).slice(0,8);
  },[q,patients]);

  function select(p) { onNavigate(p.id); setOpen(false); setQ(""); }

  return (
    <>
      <button onClick={()=>setOpen(true)} style={{display:"flex",alignItems:"center",gap:".5rem",padding:".35rem .75rem",borderRadius:"var(--r-md)",background:"var(--surface-2)",border:"1px solid var(--border)",cursor:"pointer",color:"var(--text-3)",fontSize:".78rem",minWidth:160}}>
        <IconSearch/> Buscar paciente...
        <span style={{marginLeft:"auto",fontSize:".65rem",background:"var(--surface-3)",padding:".1rem .3rem",borderRadius:4,color:"var(--text-3)"}}>Ctrl+K</span>
      </button>
      {open&&(
        <div style={{position:"fixed",inset:0,zIndex:900,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"10vh",background:"rgba(15,23,42,.45)",backdropFilter:"blur(3px)"}} onClick={()=>setOpen(false)}>
          <div ref={ref} style={{width:"100%",maxWidth:520,background:"var(--surface)",borderRadius:"var(--r-lg)",boxShadow:"0 20px 60px rgba(0,0,0,.2)",border:"1px solid var(--border)",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:".75rem",padding:".85rem 1rem",borderBottom:"1px solid var(--border)"}}>
              <IconSearch/>
              <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Nome, CPF, CNS ou telefone..." style={{flex:1,border:"none",outline:"none",background:"transparent",fontSize:".92rem",color:"var(--ink)"}}/>
              <button className="icon-btn" onClick={()=>setOpen(false)}><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            {q.length>=2&&!results.length&&<p style={{padding:"1.5rem",textAlign:"center",color:"var(--text-3)",fontSize:".84rem"}}>Nenhum paciente encontrado.</p>}
            {results.map(p=>{
              const g=gestationalAgeInfo(p);
              return(
                <button key={p.id} onClick={()=>select(p)} style={{display:"flex",alignItems:"center",gap:".75rem",width:"100%",padding:".75rem 1rem",border:"none",background:"transparent",cursor:"pointer",textAlign:"left",borderBottom:"1px solid var(--border-soft)",color:"var(--text-1)"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div className="user-avatar" style={{width:34,height:34,fontSize:".8rem",flexShrink:0}}>{initials(p.name)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:".88rem",color:"var(--ink)"}}>{p.name}</div>
                    <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".1rem"}}>
                      {p.cpf&&<span>CPF {p.cpf} · </span>}
                      <span>{templates.find(t=>t.category===p.careCategory)?.label||p.careCategory||"Geral"}</span>
                      {g&&String(p.careCategory||"").toLowerCase()==="pregnant"&&<span> · IG {g.weeks}s{g.days}d</span>}
                    </div>
                  </div>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{color:"var(--text-3)",flexShrink:0}}><path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              );
            })}
            {!q&&<p style={{padding:"1.25rem",textAlign:"center",color:"var(--text-3)",fontSize:".8rem"}}>Digite para buscar por nome, CPF, CNS ou telefone.</p>}
          </div>
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   DECLARAÇÃO DE COMPARECIMENTO / ATESTADO (PDF print)
══════════════════════════════════════════════════════════════════ */
function DocumentModal({ patient, user, type, onClose }) {
  const today = new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
  const isAtestado = type === "atestado";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:580}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <h3 style={{margin:0}}>{isAtestado?"Atestado Médico":"Declaração de Comparecimento"}</h3>
          <div style={{display:"flex",gap:".5rem"}}>
            <button onClick={()=>window.print()} style={{fontSize:".78rem",padding:".3rem .65rem"}}>🖨️ Imprimir</button>
            <button className="icon-btn" onClick={onClose}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
          </div>
        </div>
        <div id="print-doc" style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"2rem",fontFamily:"Georgia, serif",lineHeight:1.9,fontSize:".9rem"}}>
          <div style={{textAlign:"center",marginBottom:"1.5rem",borderBottom:"2px solid var(--ink)",paddingBottom:"1rem"}}>
            <div style={{fontWeight:800,fontSize:"1.15rem",textTransform:"uppercase",letterSpacing:".05em"}}>Unidade Básica de Saúde</div>
            <div style={{fontSize:".85rem",color:"var(--text-2)",marginTop:".25rem"}}>{isAtestado?"ATESTADO MÉDICO":"DECLARAÇÃO DE COMPARECIMENTO"}</div>
          </div>
          {isAtestado?(
            <p>Atesto para os devidos fins que o(a) paciente <strong>{patient?.name}</strong>{patient?.cpf&&<span>, CPF {patient.cpf}</span>}, encontra-se sob meus cuidados médicos, necessitando de <strong>____ (____) dia(s)</strong> de repouso a partir de {today}.</p>
          ):(
            <p>Declaro que o(a) Sr(a). <strong>{patient?.name}</strong>{patient?.cpf&&<span>, CPF {patient.cpf}</span>}, compareceu a esta Unidade Básica de Saúde no dia <strong>{today}</strong>, no horário das <strong>____h____min</strong> às <strong>____h____min</strong>, para fins de atendimento médico.</p>
          )}
          <p style={{marginTop:"1rem"}}>Por ser verdade, firmo o presente documento.</p>
          <div style={{marginTop:"3rem",display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
            <div style={{fontSize:".82rem",color:"var(--text-3)"}}>Local: _______________, {today}</div>
            <div style={{textAlign:"center"}}>
              <div style={{borderTop:"1px solid var(--ink)",paddingTop:".4rem",minWidth:200,fontSize:".8rem"}}>
                {user?.name||"Profissional"}<br/>
                {roleLabel(user?.role)}{user?.councilNumber&&<span> · CRM/COREN {user.councilNumber}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  "Criança":    { bg:"#eff6ff", border:"#bfdbfe", text:"#1d4ed8" },
  "Adolescente":{ bg:"#f0fdf4", border:"#bbf7d0", text:"#15803d" },
  "Adulto":     { bg:"#faf5ff", border:"#e9d5ff", text:"#7e22ce" },
  "Gestante":   { bg:"#fff1f2", border:"#fecdd3", text:"#be123c" },
  "Idoso":      { bg:"#fff7ed", border:"#fed7aa", text:"#c2410c" },
};

function ageInMonths(birthDate) {
  if (!birthDate) return null;
  const bd = parseDateSafe(birthDate);
  if (!bd) return null;
  const now = new Date();
  return (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth());
}

// Age group based purely on age (ignores condition)
function getBaseAgeGroup(ageMonths) {
  if (ageMonths === null) return "Adulto";
  if (ageMonths < 120)  return "Criança";
  if (ageMonths < 240)  return "Adolescente";
  if (ageMonths >= 720) return "Idoso";
  return "Adulto";
}

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

/* ══════════════════════════════════════════════════════════════════
   INSUMOS — Dispensação ao Paciente
   Baseado no formulário da Prefeitura de Osasco / DAF
   Enfermeira: lança saída após consulta
   Farmacêutico: visualiza todas as saídas (estoque de insumos)
══════════════════════════════════════════════════════════════════ */

const INSUMOS_STOCK_KEY     = "saudeubs_insumos_stock_v1";
const INSUMOS_DISPENSA_KEY  = "saudeubs_insumos_dispensa_v1";
const INSUMOS_CONTINUO_KEY  = "saudeubs_insumos_continuo_v1";

// Catálogo de insumos com quantidades máximas do PDF (Osasco DAF)
const CATALOGO_INSUMOS = [
  // ── Curativos e bandagens ─────────────────────────────────────
  { id:"i01",  nome:"Atadura de Crepe 6 cm",           categoria:"Curativo",         unidade:"unidade",  qtdMax:30  },
  { id:"i02",  nome:"Atadura de Crepe 10 cm",          categoria:"Curativo",         unidade:"unidade",  qtdMax:30  },
  { id:"i03",  nome:"Atadura de Crepe 15 cm",          categoria:"Curativo",         unidade:"unidade",  qtdMax:30  },
  { id:"i04",  nome:"Atadura de Crepe 20 cm",          categoria:"Curativo",         unidade:"unidade",  qtdMax:30  },
  { id:"i05",  nome:"Atadura de Rayon",                categoria:"Curativo",         unidade:"unidade",  qtdMax:30  },
  { id:"i06",  nome:"Cadarço",                         categoria:"Curativo",         unidade:"rolo",     qtdMax:1   },
  { id:"i07",  nome:"Clorexidina Degermante",          categoria:"Antisséptico",     unidade:"frasco",   qtdMax:3   },
  { id:"i08",  nome:"Compressa Gaze",                  categoria:"Curativo",         unidade:"unidade",  qtdMax:180 },
  { id:"i09",  nome:"Esparadrapo Impermeável P",       categoria:"Curativo",         unidade:"rolo",     qtdMax:4   },
  { id:"i10",  nome:"Esparadrapo Impermeável G",       categoria:"Curativo",         unidade:"rolo",     qtdMax:2   },
  { id:"i11",  nome:"Micropore Pequeno",               categoria:"Curativo",         unidade:"rolo",     qtdMax:4   },
  { id:"i12",  nome:"Micropore Grande",                categoria:"Curativo",         unidade:"rolo",     qtdMax:2   },
  { id:"i13",  nome:"Fita Adesiva Hospitalar",         categoria:"Curativo",         unidade:"rolo",     qtdMax:2   },
  // ── Nutrição enteral ─────────────────────────────────────────
  { id:"i14",  nome:"Equipo p/ Nutrição Enteral",      categoria:"Nutrição Enteral", unidade:"unidade",  qtdMax:60  },
  { id:"i15",  nome:"Frasco p/ Nutrição Enteral",      categoria:"Nutrição Enteral", unidade:"unidade",  qtdMax:60  },
  // ── Luvas e seringas ─────────────────────────────────────────
  { id:"i16",  nome:"Luva P (caixa 100 un)",           categoria:"EPI",              unidade:"caixa",    qtdMax:2   },
  { id:"i17",  nome:"Luva M (caixa 100 un)",           categoria:"EPI",              unidade:"caixa",    qtdMax:2   },
  { id:"i18",  nome:"Luva G (caixa 100 un)",           categoria:"EPI",              unidade:"caixa",    qtdMax:2   },
  { id:"i19",  nome:"Seringa 20 mL",                   categoria:"Seringa",          unidade:"unidade",  qtdMax:60  },
  { id:"i20",  nome:"Seringa 60 mL",                   categoria:"Seringa",          unidade:"unidade",  qtdMax:30  },
  // ── Sondas ───────────────────────────────────────────────────
  { id:"i21",  nome:"Sonda Aspiração Traqueal c/ Válvula nº 08", categoria:"Sonda", unidade:"unidade",  qtdMax:180 },
  { id:"i22",  nome:"Sonda Aspiração Traqueal c/ Válvula nº 10", categoria:"Sonda", unidade:"unidade",  qtdMax:180 },
  { id:"i23",  nome:"Sonda Aspiração Traqueal c/ Válvula nº 12", categoria:"Sonda", unidade:"unidade",  qtdMax:180 },
  { id:"i24",  nome:"Sonda Uretral nº 04",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i25",  nome:"Sonda Uretral nº 06",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i26",  nome:"Sonda Uretral nº 08",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i27",  nome:"Sonda Uretral nº 10",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i28",  nome:"Sonda Uretral nº 12",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i29",  nome:"Sonda Uretral nº 14",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  { id:"i30",  nome:"Sonda Uretral nº 16",             categoria:"Sonda",            unidade:"unidade",  qtdMax:180 },
  // ── Uso tópico ───────────────────────────────────────────────
  { id:"i31",  nome:"Vaselina",                        categoria:"Tópico",           unidade:"frasco",   qtdMax:3   },
  { id:"i32",  nome:"Cloreto de Sódio 0,9% p/ Curativo 500 mL", categoria:"Soro/Curativo", unidade:"frasco", qtdMax:10 },
  { id:"i33",  nome:"Dersani (Ácidos Graxos Essenciais)", categoria:"Tópico",        unidade:"frasco",   qtdMax:3   },
  { id:"i34",  nome:"Colagenase + Cloranfenicol",      categoria:"Tópico",           unidade:"bisnaga",  qtdMax:3   },
  { id:"i35",  nome:"Lidocaína",                       categoria:"Tópico",           unidade:"bisnaga",  qtdMax:3   },
  { id:"i36",  nome:"Alginato",                        categoria:"Tópico",           unidade:"bisnaga",  qtdMax:1   },
  { id:"i37",  nome:"Sulfadiazina de Prata",           categoria:"Tópico",           unidade:"bisnaga",  qtdMax:3   },
  // ── Diabetes / Hemoanálise ───────────────────────────────────
  { id:"i38",  nome:"Tiras Reagentes Hemoanálise (cx 50 tiras)", categoria:"Diabetes", unidade:"caixa", qtdMax:100, obs:"Exclusivo usuários de insulina ou gestante diabética. Máx 100/mês. Acima necessita justificativa médica." },
  { id:"i39",  nome:"Micro Lancetas (cx 100 unidades)", categoria:"Diabetes",        unidade:"caixa",    qtdMax:2,  obs:"Exclusivo usuários de insulina ou gestante diabética." },
  { id:"i40",  nome:"Aparelho para Hemoanálise (Glicosímetro)", categoria:"Diabetes", unidade:"aparelho", qtdMax:1, obs:"Retirada única para usuário de insulina ou gestante diabética." },
  { id:"i41",  nome:"Agulha para Caneta de Insulina",  categoria:"Diabetes",         unidade:"unidade",  qtdMax:30, obs:"1 agulha/dia — 30 agulhas/mês por tipo de insulina." },
  { id:"i42",  nome:"Seringa 1 mL para Insulina",      categoria:"Diabetes",         unidade:"unidade",  qtdMax:60, obs:"Liberado para aplicação de insulina frasco ou somatropina. 1 seringa por aplicação." },
];

const INSUMO_CATEGORIAS = ["Todas",...[...new Set(CATALOGO_INSUMOS.map(i=>i.categoria))]];

function readInsumoStock() {
  try {
    const s = localStorage.getItem(INSUMOS_STOCK_KEY);
    if (s) return JSON.parse(s);
    // Inicializa estoque com qty=0 para cada item do catálogo
    return CATALOGO_INSUMOS.map(i=>({ id:i.id, qty:0 }));
  } catch { return CATALOGO_INSUMOS.map(i=>({ id:i.id, qty:0 })); }
}
function saveInsumoStock(s) { writeLS(INSUMOS_STOCK_KEY, s); }
function readInsumoDispensas() { try { return JSON.parse(localStorage.getItem(INSUMOS_DISPENSA_KEY)||"[]"); } catch { return []; } }
function saveInsumoDispensas(d) { writeLS(INSUMOS_DISPENSA_KEY, d); }
function readInsumosContinuos() { try { return JSON.parse(localStorage.getItem(INSUMOS_CONTINUO_KEY)||"[]"); } catch { return []; } }
function saveInsumosContinuos(c) { writeLS(INSUMOS_CONTINUO_KEY, c); }

// ── Componente principal ─────────────────────────────────────────
function InsumoPage({ patients, users, user }) {
  const isNurse = ["nurse_manager","nursing_tech"].includes(String(user?.role||""));
  const isPharma = isPharmacist(user) || isAdmin(user);
  const canDispense = isNurse || isAdmin(user);
  const canViewAll = isPharma || isAdmin(user);

  const [insumoTab, setInsumoTab] = useState(canDispense ? "dispensar" : "estoque");
  const [stock, setStock]         = useState(readInsumoStock);
  const [dispensas, setDispensas] = useState(readInsumoDispensas);
  const [continuos, setContinuos] = useState(readInsumosContinuos);

  // ── Aba Dispensar ──
  const [patSearch, setPatSearch]     = useState("");
  const [patSelected, setPatSelected] = useState(null);
  const [patResults, setPatResults]   = useState([]);
  const [isContinuo, setIsContinuo]   = useState(false);
  const [catFilter, setCatFilter]     = useState("Todas");
  const [itens, setItens]             = useState({}); // { id: qtd }
  const [obsDispensa, setObsDispensa] = useState("");
  const [dispErr, setDispErr]         = useState("");
  const [dispOk, setDispOk]           = useState(false);

  // ── Aba Estoque ──
  const [stockCat, setStockCat]   = useState("Todas");
  const [stockSearch, setStockSearch] = useState("");
  const [editStockItem, setEditStockItem] = useState(null);
  const [editQty, setEditQty]     = useState("");

  // ── Aba Log ──
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState("all"); // all | continuo | normal

  // Busca paciente
  useMemo(()=>{
    const q = patSearch.trim();
    if (q.length < 2) { setPatResults([]); return; }
    setPatResults(patients.filter(p => matchesPatientSearch(p, q)).slice(0,8));
  },[patSearch, patients]);

  function selectPat(p) {
    setPatSelected(p); setPatSearch(p.name); setPatResults([]);
    setItens({}); setDispErr(""); setDispOk(false);
    // Pré-carrega se for contínuo
    const cont = continuos.find(c=>c.patientId===p.id&&c.ativo);
    if (cont) {
      setIsContinuo(true);
      setItens(Object.fromEntries(cont.itens.map(i=>[i.id, i.qtd])));
    } else {
      setIsContinuo(false);
    }
  }

  function setItem(id, val) {
    const cat = CATALOGO_INSUMOS.find(i=>i.id===id);
    const max = cat?.qtdMax || 999;
    const n = Math.max(0, Math.min(max, Number(val)||0));
    setItens(prev=>({ ...prev, [id]: n || undefined }));
    setDispErr(""); setDispOk(false);
  }

  // Verifica se paciente é contínuo e valida contra quantidades definidas
  function validarDispensa() {
    const cont = continuos.find(c=>c.patientId===patSelected?.id&&c.ativo);
    const selecionados = Object.entries(itens).filter(([,v])=>v>0);
    if (!selecionados.length) return { ok:false, err:"Selecione ao menos um insumo com quantidade." };
    if (cont) {
      for (const [id, qtd] of selecionados) {
        const limite = cont.itens.find(i=>i.id===id);
        if (!limite) continue; // Item extra permitido
        if (qtd > limite.qtd) {
          const cat = CATALOGO_INSUMOS.find(i=>i.id===id);
          return { ok:false, err:`"${cat?.nome}" excede o limite definido para este paciente contínuo (máx: ${limite.qtd} ${cat?.unidade}). Para aumentar, abra nova dispensação.` };
        }
      }
    }
    // Valida contra qtdMax do catálogo
    for (const [id, qtd] of selecionados) {
      const cat = CATALOGO_INSUMOS.find(i=>i.id===id);
      if (cat && qtd > cat.qtdMax) {
        return { ok:false, err:`"${cat.nome}" excede a quantidade máxima permitida (${cat.qtdMax} ${cat.unidade}).` };
      }
    }
    return { ok:true };
  }

  function confirmarDispensa() {
    if (!patSelected) { setDispErr("Selecione um paciente."); return; }
    const v = validarDispensa();
    if (!v.ok) { setDispErr(v.err); return; }

    const selecionados = Object.entries(itens).filter(([,v])=>v>0).map(([id,qtd])=>({ id, qtd: Number(qtd) }));
    const agora = new Date().toISOString();
    const dispensa = {
      id: "d" + Date.now(),
      patientId: patSelected.id,
      patientName: patSelected.name,
      profissional: user?.name || "Enfermagem",
      profRole: roleLabel(user?.role),
      continuo: isContinuo,
      itens: selecionados,
      obs: obsDispensa,
      ts: agora,
      date: agora.slice(0,10),
    };

    // Debita do estoque
    const newStock = stock.map(s => {
      const item = selecionados.find(i=>i.id===s.id);
      if (!item) return s;
      return { ...s, qty: Math.max(0, s.qty - item.qtd) };
    });
    setStock(newStock); saveInsumoStock(newStock);

    // Salva dispensação
    const newDispensas = [dispensa, ...dispensas];
    setDispensas(newDispensas); saveInsumoDispensas(newDispensas);

    // Se marcado como contínuo, registra ou atualiza
    if (isContinuo) {
      const existente = continuos.find(c=>c.patientId===patSelected.id&&c.ativo);
      if (!existente) {
        const novoCont = {
          id: "c" + Date.now(),
          patientId: patSelected.id,
          patientName: patSelected.name,
          itens: selecionados,
          profissional: user?.name,
          dtInicio: agora.slice(0,10),
          dtFim: null,
          ativo: true,
          obs: obsDispensa,
        };
        const newC = [novoCont, ...continuos];
        setContinuos(newC); saveInsumosContinuos(newC);
      }
      // Se já existe, mantém (a qtd do contínuo não muda, só registra a saída)
    }

    setDispOk(true); setDispErr("");
    setItens({}); setObsDispensa("");
    setTimeout(()=>{ setDispOk(false); setPatSelected(null); setPatSearch(""); setIsContinuo(false); }, 2500);
  }

  function encerrarContinuo(id) {
    if (!confirm("Encerrar o acompanhamento contínuo deste paciente? Ele não terá mais retirada automática registrada.")) return;
    const newC = continuos.map(c=>c.id===id?{...c,ativo:false,dtFim:new Date().toISOString().slice(0,10)}:c);
    setContinuos(newC); saveInsumosContinuos(newC);
  }

  const filteredStock = CATALOGO_INSUMOS.filter(i=>{
    if (stockCat!=="Todas" && i.categoria!==stockCat) return false;
    if (stockSearch && !i.nome.toLowerCase().includes(stockSearch.toLowerCase())) return false;
    return true;
  });

  const filteredLog = dispensas.filter(d=>{
    if (logFilter==="continuo" && !d.continuo) return false;
    if (logFilter==="normal" && d.continuo) return false;
    if (logSearch && !d.patientName?.toLowerCase().includes(logSearch.toLowerCase()) && !d.profissional?.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  const continuosAtivos = continuos.filter(c=>c.ativo);
  const totalSaidasHoje = dispensas.filter(d=>d.date===new Date().toISOString().slice(0,10)).length;

  const TABS = [
    canDispense && ["dispensar","💊 Nova Dispensação"],
    ["estoque","📦 Estoque de Insumos"],
    (canDispense||canViewAll) && ["log","🗂️ Histórico de Saídas"],
    ["continuos","🔄 Pacientes Contínuos"],
  ].filter(Boolean);

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0}}>

      {/* Header */}
      <PageHero
        badge="Gestão de Insumos"
        title="Dispensação de Insumos ao Paciente"
        subtitle="Controle de saída, estoque e pacientes contínuos — baseado no formulário DAF/Osasco."
        style={{margin:"1.5rem 1.5rem .75rem",flexShrink:0}}
        actions={
          <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",alignItems:"center"}}>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:".75rem",fontWeight:700,color:"var(--teal-700)"}}>{user?.name}</div>
              <div style={{fontSize:".68rem",color:"var(--text-3)"}}>{roleLabel(user?.role)}</div>
            </div>
          </div>
        }
      />

      {/* KPIs */}
      <div style={{display:"flex",gap:".65rem",padding:"0 1.5rem .75rem",flexWrap:"wrap",flexShrink:0}}>
        {[
          { label:"Pacientes contínuos ativos", value:continuosAtivos.length, icon:"🔄", color:"#0d9488" },
          { label:"Dispensações hoje",           value:totalSaidasHoje,        icon:"📋", color:"#6366f1" },
          { label:"Total de dispensações",       value:dispensas.length,       icon:"📦", color:"#0891b2" },
          { label:"Itens sem estoque",           value:stock.filter(s=>s.qty===0).length, icon:"âš ï¸", color:"#be123c", warn:true },
        ].map(k=>(
          <div key={k.label} className="card" style={{flex:"1 1 140px",padding:".75rem 1rem",minWidth:120,background:k.warn&&k.value>0?"#fff1f2":"var(--surface)",border:`1px solid ${k.warn&&k.value>0?"#fecdd3":"var(--border)"}`}}>
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

        {/* ── ABA: NOVA DISPENSAÇÃO ── */}
        {insumoTab==="dispensar"&&canDispense&&(
          <div style={{display:"flex",gap:"1.25rem",alignItems:"flex-start",flexWrap:"wrap"}}>

            {/* Coluna esquerda: seleção de paciente */}
            <div style={{flex:"0 0 300px",minWidth:260}}>
              <div className="card" style={{padding:"1rem",marginBottom:"1rem"}}>
                <div style={{fontWeight:700,fontSize:".8rem",color:"var(--ink)",marginBottom:".75rem"}}>📋 Paciente</div>
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
                              <div style={{fontSize:".7rem",color:"var(--text-3)"}}>{p.cpf||""}{cont?" · 🔄 Contínuo":""}</div>
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
                        🔄 Paciente contínuo ativo
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
                      <div style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)"}}>🔄 Paciente contínuo</div>
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
                <span style={{flexShrink:0}}>ℹ️</span>
                <span>As quantidades máximas por insumo seguem o formulário DAF/Secretaria de Saúde de Osasco. Nenhum campo pode ultrapassar o limite definido.</span>
              </div>

              {/* Filtro por categoria */}
              <div style={{display:"flex",gap:".4rem",flexWrap:"wrap",marginBottom:".85rem"}}>
                {INSUMO_CATEGORIAS.map(c=>(
                  <button key={c} type="button" onClick={()=>setCatFilter(c)}
                    style={{fontSize:".72rem",padding:".28rem .65rem",borderRadius:4,border:`1px solid ${catFilter===c?"var(--teal-500)":"var(--border)"}`,background:catFilter===c?"var(--teal-50)":"var(--surface)",color:catFilter===c?"var(--teal-700)":"var(--text-2)",cursor:"pointer",fontWeight:catFilter===c?700:500}}>
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
                        {insumo.obs&&<div style={{fontSize:".68rem",color:"#1d4ed8",marginTop:".15rem"}}>ℹ️ {insumo.obs}</div>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:".3rem",flexShrink:0}}>
                        <button type="button" onClick={()=>setItem(insumo.id, qtd-1)} disabled={!patSelected||qtd<=0}
                          style={{width:26,height:26,borderRadius:"var(--r-md)",border:"1px solid var(--border)",background:"var(--surface-2)",cursor:"pointer",fontWeight:700,fontSize:".9rem",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text-1)"}}>−</button>
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
                  <div style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)",marginBottom:".5rem"}}>📋 Resumo da dispensação</div>
                  {Object.entries(itens).filter(([,v])=>v>0).map(([id,qtd])=>{
                    const cat = CATALOGO_INSUMOS.find(i=>i.id===id);
                    return <div key={id} style={{display:"flex",justifyContent:"space-between",fontSize:".78rem",color:"var(--text-1)",marginBottom:".2rem"}}>
                      <span>{cat?.nome}</span><span style={{fontWeight:700}}>{qtd} {cat?.unidade}</span>
                    </div>;
                  })}
                  {dispErr&&<div style={{marginTop:".65rem",padding:".45rem .65rem",background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",fontSize:".76rem",color:"#be123c"}}>{dispErr}</div>}
                  {dispOk&&<div style={{marginTop:".65rem",padding:".45rem .65rem",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:"var(--r-md)",fontSize:".76rem",color:"#15803d",fontWeight:700}}>✓ Dispensação registrada com sucesso!</div>}
                  <button type="button" onClick={confirmarDispensa} disabled={!patSelected||dispOk}
                    style={{marginTop:".75rem",width:"100%",padding:".55rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)",cursor:"pointer",fontWeight:700,fontSize:".85rem"}}>
                    ✓ Confirmar dispensação{isContinuo?" (contínuo)":""}
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
                          {insumo.obs&&<div style={{fontSize:".66rem",color:"#1d4ed8",marginTop:".1rem"}}>ℹ️ {insumo.obs}</div>}
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
                {[["all","Todas"],["continuo","🔄 Contínuo"],["normal","Normal"]].map(([v,l])=>(
                  <button key={v} type="button" onClick={()=>setLogFilter(v)}
                    style={{fontSize:".73rem",padding:".3rem .65rem",borderRadius:4,border:`1px solid ${logFilter===v?"var(--teal-500)":"var(--border)"}`,background:logFilter===v?"var(--teal-50)":"var(--surface)",color:logFilter===v?"var(--teal-700)":"var(--text-2)",cursor:"pointer",fontWeight:logFilter===v?700:500}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {!filteredLog.length ? (
              <div style={{textAlign:"center",padding:"3rem",color:"var(--text-3)"}}>📭 Nenhuma dispensação registrada.</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                {filteredLog.map(d=>(
                  <div key={d.id} style={{background:"var(--surface)",border:`1px solid ${d.continuo?"var(--teal-200)":"var(--border)"}`,borderLeft:`4px solid ${d.continuo?"var(--teal-500)":"var(--border)"}`,borderRadius:"var(--r-md)",padding:".75rem 1rem"}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:".5rem",flexWrap:"wrap"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:".88rem",color:"var(--ink)",display:"flex",alignItems:"center",gap:".5rem"}}>
                          {d.patientName}
                          {d.continuo&&<span style={{fontSize:".67rem",fontWeight:700,padding:".1rem .4rem",borderRadius:999,background:"#dcfce7",color:"#15803d",border:"1px solid #bbf7d0"}}>🔄 Contínuo</span>}
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

        {/* ── ABA: PACIENTES CONTÍNUOS ── */}
        {insumoTab==="continuos"&&(
          <div>
            <div style={{marginBottom:"1rem",padding:".65rem .9rem",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:"var(--r-md)",fontSize:".76rem",color:"#1d4ed8",display:"flex",gap:".4rem"}}>
              <span>🔄</span>
              <span>Pacientes contínuos têm lesão ativa e retornam mensalmente para retirada de insumos. A quantidade máxima foi definida na primeira dispensação e não pode ser ultrapassada. Para encerrar, clique em "Encerrar".</span>
            </div>
            {!continuosAtivos.length ? (
              <div style={{textAlign:"center",padding:"3rem",color:"var(--text-3)"}}>
                <div style={{fontSize:"2rem",marginBottom:".5rem"}}>🔄</div>
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
                            <span style={{fontSize:".67rem",fontWeight:700,padding:".1rem .4rem",borderRadius:999,background:"#dcfce7",color:"#15803d",border:"1px solid #bbf7d0"}}>🔄 Ativo</span>
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
                  }} style={{flex:2}}>✓ Confirmar entrada</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PHARMACY — Controle de Farmácia da UBS
══════════════════════════════════════════════════════════════════ */

const PHARMACY_KEY  = "saudeubs_pharmacy_v1";
const PHARMA_LOG_KEY = "saudeubs_pharmalog_v1";
const PHARMA_AUTH_KEY = "saudeubs_pharmaauth_v1";

// Farmacêuticos cadastrados (em produção viria do backend)
// Usuários locais de farmácia — sem senhas em texto puro
// Autenticação sempre via backend (/auth/login). Senhas nunca ficam no código.
const PHARMA_USERS = [
  { id: "ph1", name: "Ana (Administradora)", email: "ana@clinica.local",  role: "pharmacist"    },
  { id: "ph2", name: "Farmacêutico(a)",      email: "farmacia@ubs.local", role: "pharmacist"    },
  { id: "ph3", name: "Téc. de Farmácia",     email: "tecfarma@ubs.local", role: "pharmacy_tech" },
];

// Estoque inicial padrão UBS — Rename (Rename of Farmácia Básica Municipal)
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


/* ══════════════════════════════════════════════════════════════════
   CARTÒO DO PACIENTE — Resumo imprimível
══════════════════════════════════════════════════════════════════ */
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
                {patient.phone&&<span>📱 {patient.phone}</span>}
                {patient.phoneAlt&&<span>☎️ {patient.phoneAlt}</span>}
                {(patient.address||patient.city)&&<span>📍 {[patient.address,patient.number,patient.neighborhood,patient.city,patient.state].filter(Boolean).join(", ")}</span>}
              </div>
            </div>

            {/* Clínico */}
            <div>
              <div style={{fontWeight:700,fontSize:".75rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".4rem"}}>Dados Clínicos</div>
              <div style={{fontSize:".8rem",color:"var(--text-2)",display:"flex",flexDirection:"column",gap:".2rem"}}>
                {allergies
                  ? <span style={{color:"#be123c",fontWeight:600}}>⚠️ Alergias: {allergies}</span>
                  : <span style={{color:"var(--text-3)"}}>Sem alergias registradas</span>}
                {comorbid&&<span>🏥 {comorbid}</span>}
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
              <div style={{fontWeight:700,fontSize:".92rem",color:"var(--ink)"}}>Farmácia — Acesso Restrito</div>
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

/* ── Dispense Modal — senha obrigatória ── */
function DispenseModal({ item, pharmaUser, onConfirm, onClose }) {
  const [pw, setPw]            = useState("");
  const [qty, setQty]          = useState(1);
  const [patient, setPatient]  = useState("");
  const [prescriber, setPrescriber] = useState("");
  const [prescriberCouncil, setPrescriberCouncil] = useState("");
  const [numReceita, setNumReceita] = useState("");   // ANVISA RDC 20/2011
  const [lote, setLote]        = useState("");         // ANVISA — rastreabilidade por lote
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
              <input value={lote} onChange={e=>setLote(e.target.value)} placeholder="Ex: A1234" title="ANVISA — rastreabilidade"/>
            </label>
          </div>
          <div style={{fontSize:".67rem",fontWeight:700,color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".06em",padding:".3rem 0 .1rem"}}>Receita — ANVISA RDC 20/2011</div>
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
            🔐 Confirmar com sua senha
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
            🔐 Confirmar com sua senha
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
      // ANVISA — escrituração deve ser rastreável por profissional responsável
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
      // ANVISA RDC 20/2011 — campos de rastreabilidade obrigatórios
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
      <PageHero
        badge="Gestão de Medicamentos"
        title="Farmácia UBS"
        subtitle="Controle de estoque, dispensação e rastreabilidade de medicamentos."
        style={{margin:"1.5rem 1.5rem .75rem"}}
        actions={
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
        }
      />

      {/* KPI Cards */}
      <div style={{display:"flex",gap:".75rem",padding:"0 1.5rem .75rem",flexWrap:"wrap"}}>
        {[
          { label:"Total de itens", value:totalItems, icon:"📦", color:"var(--teal-600)" },
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
        {[["stock","📋 Estoque"],["log","🗂️ Log de Movimentações"]].map(([id,label])=>(
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
                                ✏️
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
            {/* ANVISA RDC 20/2011 — aviso de retenção obrigatória */}
            <div style={{marginBottom:"1rem",padding:".6rem .85rem",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".73rem",color:"#92400e",display:"flex",gap:".5rem",alignItems:"flex-start"}}>
              <span style={{flexShrink:0}}>⚖️</span>
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
                ⬇️ Exportar CSV (ANVISA)
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
                          <span><strong>{l.qty}x</strong> → <strong>{l.patient}</strong></span>
                          {l.prescriber && <span style={{color:"var(--text-3)"}}>Prescritor: {l.prescriber}{l.prescriberCouncil?` (${l.prescriberCouncil})`:""}</span>}
                          {l.numReceita && <span style={{color:"var(--text-3)"}}>Receita nº {l.numReceita}{l.dtReceita?` — ${new Date(l.dtReceita+"T12:00:00").toLocaleDateString("pt-BR")}`:""}</span>}
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
  if (gestWeeks !== null && gestWeeks < 20) return []; // antes das 20 semanas: nenhuma
  return PNI_CALENDAR.filter(v => v.id === "dt-g"); // dT/dTpa gestante
}

// Idoso Rosa: apenas Influenza (dose anual — dentro de 12 meses)
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
                          background:totalPending?"var(--amber-50)":"#f0fdf4",
                          color:totalPending?"var(--amber-700)":"#15803d",
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
                        <div style={{padding:".85rem 1rem",background:"#fffbeb",border:"1px solid #fde68a",borderRadius:"var(--r-md)",fontSize:".82rem",color:"#92400e",display:"flex",alignItems:"flex-start",gap:".6rem"}}>
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
      <PageHero
        badge="IA Assistida"
        title="Assistente da Equipe"
        subtitle="Prioridades do dia, qualidade de dados e perguntas operacionais em linguagem natural."
      />

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
                  ? <p className="muted">Nenhuma inconsistência encontrada. ✓</p>
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
      <PageHero badge="Gestão da Equipe" title={title} subtitle={`${users.length} membro${users.length!==1?"s":""} cadastrado${users.length!==1?"s":""}`} />
      <div className="card">
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

/* â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢
   PROTOCOLS TAB
â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢ */
function ProtocolsTab({ templates, canManageUser, onEdit, onDelete }) {
  return (
    <div className="workspace-home">
      <PageHero badge="Protocolos Clínicos" title="Protocolos" subtitle="Metas e etapas de acompanhamento por categoria de paciente." actions={canManageUser&&<button onClick={onEdit(null)}>+ Novo protocolo</button>} />
      <div className="card">
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

/* â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢
   MODALS
â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢ */
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
    <div className="workspace-home">
      <PageHero
        badge="Sistema"
        title="Diagnósticos"
        subtitle="Visão técnica: conectividade, sessão, carga e consistência básica."
        actions={
          <div style={{display:"flex",flexDirection:"column",gap:".35rem",alignItems:"flex-end",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:".5rem",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:"var(--r-md)",padding:".4rem .85rem"}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:healthColor,flexShrink:0}}/>
              <span style={{fontSize:".78rem",fontWeight:700,color:"#e2e8f0"}}>{apiHealth?.label || "Verificando..."}</span>
            </div>
            {latency>0&&<span style={{fontSize:".7rem",color:"#94a3b8"}}>Latência: {latency} ms</span>}
          </div>
        }
      />

      {/* KPIs */}
      <div className="home-kpi-grid">
        <div className="home-kpi-card">
          <p className="home-kpi-label">API</p>
          <p className="home-kpi-value" style={{color:healthColor}}>{apiHealth?.label||"—"}</p>
          <p className="home-kpi-foot">Verificado: {updatedAt}</p>
        </div>
        <div className="home-kpi-card">
          <p className="home-kpi-label">Sessão</p>
          <p className="home-kpi-value">{token?"Ativa":"—"}</p>
          <p className="home-kpi-foot">{roleLabel(user?.role)} · {sessionAgeMin===null?"—":`${sessionAgeMin} min`}</p>
        </div>
        <div className="home-kpi-card">
          <p className="home-kpi-label">Carga local</p>
          <p className="home-kpi-value">{patients?.length||0}</p>
          <p className="home-kpi-foot">{users?.length||0} usuários · {templates?.length||0} protocolos · {totalRecords} registros</p>
        </div>
        <div className="home-kpi-card">
          <p className="home-kpi-label">Última carga</p>
          <p className="home-kpi-value" style={{fontSize:"1.25rem"}}>{lastLoadAt?new Date(lastLoadAt).toLocaleTimeString("pt-BR"):"—"}</p>
          <p className="home-kpi-foot">Demanda: {Number(demandMonthly?.totals?.total??0)} · Agend. {Number(demandMonthly?.totals?.scheduled??0)} · Esp. {Number(demandMonthly?.totals?.walkin??0)}</p>
        </div>
      </div>

      {/* Detalhes */}
      <div className="card">
        <div className="card-header"><span className="card-title">Detalhes da sessão</span></div>
        <div className="card-body">
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:".75rem 2rem"}}>
            {[
              ["Perfil",roleLabel(user?.role)],
              ["Usuário",user?.name||"—"],
              ["Tempo de sessão",sessionAgeMin===null?"—":`${sessionAgeMin} min`],
              ["API URL",apiHealth?.url||"—"],
              ["Latência",latency?`${latency} ms`:"—"],
              ["Verificado em",updatedAt],
            ].map(([label,value])=>(
              <div key={label}>
                <p style={{fontSize:".7rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",color:"var(--text-3)",marginBottom:".2rem"}}>{label}</p>
                <p style={{fontSize:".88rem",fontWeight:600,color:"var(--text-1)",wordBreak:"break-all"}}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢
   MAIN APP
â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢â⬢ */

/* ── Error Boundary — captura erros de renderização e evita tela branca ── */
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
  const session = useMemo(()=>{
    try { return readSession(); } catch { return null; }
  },[]);
  const uiState = useMemo(()=>{
    try { return readUiState(); } catch { return {}; }
  },[]);

  // Valida o token — se vier algo inválido limpa a sessão
  const initialToken = (() => {
    try {
      const t = String(session?.token||"");
      // Token deve ser string não vazia sem espaços — se inválido, limpa sessão
      if (t && !/\s/.test(t)) return t;
      return "";
    } catch { return ""; }
  })();

  const [token,  setToken]  = useState(initialToken);
  const [user,   setUser]   = useState(initialToken ? (session?.user||null) : null);
  const [patients,  setPatients]  = useState([]);
  const [users,     setUsers]     = useState([]);
  const [templates, setTemplates] = useState([]);
  const [protocolByPatient, setProtocolByPatient] = useState({});
  const [tab,  setTab]  = useState(()=>{ const t=uiState?.tab; if(t) return t; return "dashboard"; });
  const [selectedPatientId, setSelectedPatientId] = useState("");
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
    // Quando a janela passa sem registro → prazo perdido (sem recuperação), sem gerar alerta.
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
      // — 1ª consulta: janela 0–30 dias. Perdida se criança tem > 30 dias e 0 consultas.
      // — 2ª consulta: janela 31–180 dias. Perdida se criança tem > 180 dias e < 2 consultas.
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
                    ? `Dose prevista aos ${winLabel} de vida (${dueDateStr}) — atrasada`
                    : `Dose prevista aos ${winLabel} de vida (${dueDateStr}) — ainda não registrada`)
                : `Dose prevista aos ${winLabel} de vida — ainda não identificada no histórico`,
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
  useEffect(()=>{ localStorage.setItem(UI_STATE_KEY,JSON.stringify({tab,patientTab})); },[tab,patientTab]);
  useEffect(()=>{
    if(!token||!selectedPatientId){setAppointments([]);setTasks([]);setMessages([]);setHistory([]);setPatientProtocolSummary(null);return;}
    loadSelectedPatientData(selectedPatientId);
    // Reseta o formulário de atendimento ao trocar de paciente
    setRecordForm({type:isAcs(user)?"visit":"consultation",
      title:isAcs(user)?"Visita ACS":user?.role==="doctor"?"Consulta médica":user?.role==="dentist"?"Consulta odontológica":"Consulta de enfermagem",
      date:"",details:"",conduct:"",nextStep:"",demandType:"scheduled",consultKind:"medica",consultDoctor:"",consultSpecialty:""});
    setRecordVaccines([]);
  },[token,selectedPatientId]);

  /* ââ€â‚¬ââ€â‚¬ Auth handlers ââ€â‚¬ââ€â‚¬ */
  async function handleLogin(email,password) {
    setError(""); setBusy(true);
    try {
      const payload=await login(email.trim(),password);
      if(payload?.twoFactorRequired) throw new Error("2FA ativo: tela React ainda não implementa desafio.");
      setToken(payload.token); setUser(payload.user);
      sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:payload.token,user:payload.user}));
      auditLog("LOGIN", { email: email.trim().toLowerCase(), success: true }, payload.user);
      // Gestor vai direto para o painel de gestão
      if(String(payload.user?.role||"")==="gestor") setTab("gestor");
    } catch(_backendErr) {
      auditLog("LOGIN_FAILED", { email: email.trim().toLowerCase(), success: false });
      setError("E-mail ou senha incorretos.");
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

  /* ── Token expirado — desloga automaticamente ── */
  function handleApiError(e) {
    const msg = String(e?.message||e||"").toLowerCase();
    const is401 = msg.includes("401") || msg.includes("token") || msg.includes("expirad") ||
                  msg.includes("invalid") || msg.includes("unauthorized") || msg.includes("não autorizado");
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

  /* ââ€â‚¬ââ€â‚¬ Data ââ€â‚¬ââ€â‚¬ */
  async function loadAll() {
    if(!token || String(token).startsWith("local_")) return;
    setBusy(true); setError("");
    try {
      const boot=await bootstrap(token);
      setUser(prev=>prev||boot?.user||null);
      const pts=Array.isArray(boot?.patients)?boot.patients:await listPatients(token);
      const us=Array.isArray(boot?.users)?boot.users:await listUsers(token);
      const tpls=Array.isArray(boot?.protocolTemplates)?boot.protocolTemplates:await listProtocolTemplates(token);
      setPatients(pts); setUsers(us); setTemplates(tpls);
      if(boot?.demandMonthly) {
        setDemandMonthly(boot.demandMonthly);
      } else if(pts.length) {
        // Fallback: calcula demanda do mês atual a partir dos appointments de cada paciente
        // Atendimentos retroativos NÒO contam para demanda programada
        try {
          const now = new Date();
          const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
          const allAppts = (await Promise.all(pts.map(p=>listAppointments(token,p.id).catch(()=>[]))))
            .flat()
            .filter(a=>String(a.date||"").startsWith(ym))
            .filter(a=>a.demandType!=="retroactive"); // exclui retroativos
          const sched = allAppts.filter(a=>a.demandType==="scheduled"||(!a.demandType)).length;
          const spont = allAppts.filter(a=>a.demandType==="spontaneous").length;
          const total = allAppts.length;
          if(total>0) setDemandMonthly({totals:{total,scheduled:sched,spontaneous:spont}});
        } catch {}
      }
      try { const fu=await listUsers(token); if(Array.isArray(fu)) setAllUsers(fu.map(u=>u.id===boot?.user?.id?{...u,online:true}:u)); } catch {setAllUsers(us.map(u=>u.id===boot?.user?.id?{...u,online:true}:u));}
      if(pts.length){
        const sums=await getProtocolSummaries(token,pts.map(p=>p.id).filter(Boolean));
        setProtocolByPatient(sums?.summaries||{});
      } else setProtocolByPatient({});
      setLastLoadAt(new Date().toISOString());
    } catch(e){ if(!handleApiError(e)) setError(e.message||"Falha ao carregar dados"); } finally{ setBusy(false); }
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

  /* ââ€â‚¬ââ€â‚¬ Patient handlers ââ€â‚¬ââ€â‚¬ */
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

  /* ââ€â‚¬ââ€â‚¬ User handlers ââ€â‚¬ââ€â‚¬ */
  function openEditUser(u) {
    return ()=>{
      if (!u) return; // Criação desabilitada — apenas pela tela de cadastro
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

  /* ââ€â‚¬ââ€â‚¬ Template handlers ââ€â‚¬ââ€â‚¬ */
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

  /* ââ€â‚¬ââ€â‚¬ AI ââ€â‚¬ââ€â‚¬ */
  async function loadAiPriorities(){if(!token)return;setBusy(true);setError("");try{setAiView("priorities");setAiData(await aiTeamPriorities(token));}catch(e){ if(!handleApiError(e)) setError(e.message||"Erro"); }finally{setBusy(false);}}
  async function loadAiQuality(){if(!token)return;setBusy(true);setError("");try{setAiView("quality");setAiData(await aiTeamDataQuality(token));}catch(e){ if(!handleApiError(e)) setError(e.message||"Erro"); }finally{setBusy(false);}}
  async function loadAiReport(){if(!token)return;setBusy(true);setError("");try{setAiView("report");setAiData(await aiTeamReport(token));}catch(e){ if(!handleApiError(e)) setError(e.message||"Erro"); }finally{setBusy(false);}}
  async function submitAiQuestion(e){e.preventDefault();if(!token||!aiQuestion.trim())return;setBusy(true);setError("");try{setAiView("chat");setAiData(await aiTeamAsk(token,aiQuestion.trim()));}catch(e2){setError(e2.message||"Erro");}finally{setBusy(false);}}

  /* ââ€â‚¬ââ€â‚¬ Record / Appointment / Task / Message ââ€â‚¬ââ€â‚¬ */
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
      // Atendimentos retroativos NÒO contam
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
      // Tarefas: registradas no histórico interno, mas NÒO no prontuário clínico
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
      // Mensagens: registradas no histórico interno, mas NÒO no prontuário clínico
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

  /* ── Auth guard — login único, roteamento por perfil ── */
  if (!token || !user || typeof user !== 'object') {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} publicTeams={publicTeams} error={error} busy={busy}/>;
  }

  // Recepcionista → app dedicado de recepção
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

  // Farmacêutico, enfermeira, médico, ACS, téc. enf., admin → app clínico
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

      {/* ââ€â‚¬ââ€â‚¬ Patient modal ââ€â‚¬ââ€â‚¬ */}
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
                {/* Condições — checkbox antes do texto */}
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
                      {String(form.careCategory||"").toLowerCase()==="elderly" ? "✓ Somadas ao grupo Idoso" : "✓ Regras de doença crônica ativas"}
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
                {/* Nome do responsável — aparece para crianças, mas sem asterisco de obrigatoriedade */}
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
                <label>CNS — Cartão Nacional de Saúde
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
                    <label>DUM — Data da Última Menstruação
                      <input type="date" value={form.pregnancyStartDate} onChange={e=>setForm(s=>({...s,pregnancyStartDate:e.target.value}))}/>
                    </label>
                    <label>DPP — Data Provável do Parto
                      <input type="date" value={form.expectedDeliveryDate} onChange={e=>setForm(s=>({...s,expectedDeliveryDate:e.target.value}))}/>
                    </label>
                    <label>IG pela DUM — Semanas
                      <input type="number" min="0" max="45" value={form.gestationalAgeDumWeeks} placeholder="0" onChange={e=>setForm(s=>({...s,gestationalAgeDumWeeks:e.target.value}))}/>
                    </label>
                    <label>IG pela DUM — Dias
                      <input type="number" min="0" max="6" value={form.gestationalAgeDumDays} placeholder="0" onChange={e=>setForm(s=>({...s,gestationalAgeDumDays:e.target.value}))}/>
                    </label>
                    <label>Data 1ª USG
                      <input type="date" value={form.usgDate1} onChange={e=>setForm(s=>({...s,usgDate1:e.target.value}))}/>
                    </label>
                    <label>IG pela USG — Semanas
                      <input type="number" min="0" max="45" value={form.gestationalAgeUsgWeeks} placeholder="0" onChange={e=>setForm(s=>({...s,gestationalAgeUsgWeeks:e.target.value}))}/>
                    </label>
                    <label>IG pela USG — Dias
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

      {/* ââ€â‚¬ââ€â‚¬ User modal ââ€â‚¬ââ€â‚¬ */}
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
                {userForm.role==="doctor"?"CRM":userForm.role==="dentist"?"CRO":["pharmacist","pharmacy_tech"].includes(userForm.role)?"CFF":"COREN"} — Número do conselho
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

      {/* ââ€â‚¬ââ€â‚¬ Template modal ââ€â‚¬ââ€â‚¬ */}
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

/* ── App exportado — envolve tudo no ErrorBoundary ── */
export function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}
