import { useEffect, useMemo, useRef, useState } from "react";
import {
  aiTeamAsk, aiTeamDataQuality, aiTeamPriorities, aiTeamReport,
  bootstrap, createProtocolTemplate, createAppointment, createPatient,
  createRecord, createTask, createUser, deleteAppointment, deletePatient,
  deleteProtocolTemplate, deleteRecord, deleteUser, getUserUsage,
  getPatientHistory, getPatientProtocolSummary, getProtocolSummaries,
  listAppointments, listMessages, listPatients, listProtocolTemplates,
  listTasks, listUsers, login, listPublicTeams, register, sendMessage,
  updateProtocolTemplate, updatePatient, updateUser, updateTaskStatus,
} from "./api";

// patchMe — PATCH /me (pode não existir na api.js ainda, definido inline abaixo)
async function patchMeRequest(token, payload) {
  const { api } = await import("./api");
  return api("/me", { method: "PATCH", body: JSON.stringify(payload) }, token);
}

/* â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const SESSION_KEY      = "saudeubs_react_session";
const UI_STATE_KEY     = "saudeubs_react_ui";
const AGENDA_KEY       = "saudeubs_agenda_v1";
const RECEPTION_KEY    = "saudeubs_reception_v1";

// Recepcionistas locais
const RECEPTION_USERS = [
  { id:"rc1", name:"Ana (Administradora)",  email:"ana@clinica.local",    password:"123456",      role:"receptionist" },
  { id:"rc2", name:"Recepcionista",          email:"recepcao@ubs.local",   password:"recepcao123", role:"receptionist" },
];
function readReceptionSession()  { try { const r=localStorage.getItem(RECEPTION_KEY); return r?JSON.parse(r):null; } catch { return null; } }
function saveReceptionSession(s) { try { if(s) localStorage.setItem(RECEPTION_KEY,JSON.stringify(s)); else localStorage.removeItem(RECEPTION_KEY); } catch {} }
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
  patients:   <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  protocols:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.4"/><path d="M10 2v3h3M6 7h4M6 10h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  acs:        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1 13c0-2.761 2.239-5 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M12 7v3M10.5 8.5l1.5 1.5 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  doctors:    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3 13c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M8 10v4M6 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  ai:         <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 3h3l-2.5 2 1 3L8 7.5 5 9l1-3L3.5 4h3L8 1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M3 12h10M5 14h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  vaccines:   <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M10 2l4 4-1.5 1.5-1-1-5 5 1 1L6 14l-4-4 1.5-1.5 1 1 5-5-1-1L10 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M2 14l2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  pharmacy:   <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M6 8h4M8 6v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M5 3V2M11 3V2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  agenda:     <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 1.5v2M11.5 1.5v2M1.5 6.5h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M5 10h2M9 10h2M5 12.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  queue:      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M1 14c0-2.5 1.8-4 4-4s4 1.5 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M11 7h4M11 10h3M11 13h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  referrals:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  reports:    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 2h10v12H3z" stroke="currentColor" strokeWidth="1.4"/><path d="M6 6h5M6 8.5h5M6 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M5 5.5l.5.5 1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

/* â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readSession() {
  try { const r = localStorage.getItem(SESSION_KEY); const p = r ? JSON.parse(r) : null; if (p && typeof p.token === 'string' && p.user) return p; return null; } catch { return null; }
}
function readUiState() {
  try { const r = localStorage.getItem(UI_STATE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function roleLabel(role) {
  return { nurse_manager: "Enfermeira", doctor: "Médico(a)", acs: "ACS", pharmacist: "Farmacêutico(a)", nursing_tech: "Téc. Enfermagem", receptionist: "Recepcionista" }[String(role||"").toLowerCase()] || role || "-";
}
function onlyDigits(v) { return String(v||"").replace(/\D/g,""); }
function formatCpf(v)  { const d=onlyDigits(v).slice(0,11); return d.replace(/^(\d{3})(\d)/,"$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/,"$1.$2.$3").replace(/\.(\d{3})(\d)/,".$1-$2"); }
function formatPhone(v) { const d=onlyDigits(v).slice(0,11); return d.length<=10 ? d.replace(/^(\d{2})(\d)/g,"($1) $2").replace(/(\d{4})(\d)/,"$1-$2") : d.replace(/^(\d{2})(\d)/g,"($1) $2").replace(/(\d{5})(\d)/,"$1-$2"); }
function formatCep(v)  { const d=onlyDigits(v).slice(0,8); return d.replace(/^(\d{5})(\d)/,"$1-$2"); }
function formatCns(v)  { return onlyDigits(v).slice(0,15); }
function parseDateSafe(t) { const d=new Date(t||""); return isNaN(d.getTime())?null:d; }
function toBoundedInt(v,min,max) { if(v===undefined||v===null||v==="") return null; const n=parseInt(String(v),10); return isNaN(n)?null:Math.min(max,Math.max(min,n)); }
function initials(name) { return String(name||"?").trim().split(" ").slice(0,2).map(w=>w[0]||"").join("").toUpperCase()||"?"; }
function fmtDate(v) { if(!v) return "-"; try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return v; } }

function gestationalAgeInfo(patient) {
  if(!patient) return null;
  const today=new Date(), usgRef=parseDateSafe(patient.usgDate1), usgW=toBoundedInt(patient.gestationalAgeUsgWeeks,0,45), usgD=toBoundedInt(patient.gestationalAgeUsgDays,0,6)??0;
  if(usgRef&&usgW!==null){const base=usgW*7+usgD,elapsed=Math.max(0,Math.floor((today-usgRef)/86400000)),total=base+elapsed;return{weeks:Math.floor(total/7),days:total%7,source:"1ª USG"};}
  const dum=parseDateSafe(patient.pregnancyStartDate);
  if(dum){const elapsed=Math.max(0,Math.floor((today-dum)/86400000));return{weeks:Math.floor(elapsed/7),days:elapsed%7,source:"DUM"};}
  const dumW=toBoundedInt(patient.gestationalAgeDumWeeks,0,45),dumD=toBoundedInt(patient.gestationalAgeDumDays,0,6)??0;
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
    const severity=overdue>=1?"high":(daysLeft!==null&&daysLeft<=7?"medium":"low");
    out.push({id:`sch-${key}`,title:`${label}: ${Number(s.pending||0)} pendente(s)`,detail:overdue>=1?`Atrasado ${overdue} dia(s)`:(daysLeft!==null?`${Math.max(daysLeft,0)} dia(s) para o prazo`:"Sem prazo"),severity});
  }
  return out;
}

function protocolChip(summary) {
  if(!summary) return{text:"Sem status",tone:"muted"};
  const alerts=deriveProtocolAlerts(summary);
  const pending=summary.pending||{};
  const total=Number(pending.visits||0)+Number(pending.consultations||0)+Number(pending.vaccines||0);
  const targets=summary.targets||{},completed=summary.completed||{};
  const doneTotal=Number(completed.visits||0)+Number(completed.consultations||0)+Number(completed.vaccines||0);
  const targetTotal=Number(targets.visits||0)+Number(targets.consultations||0)+Number(targets.vaccines||0);
  const overdueCount=alerts.filter(a=>a.severity==="high").length;
  const nearCount=alerts.filter(a=>a.severity==="medium").length;
  if(overdueCount>0) return{text:`Crítico (${overdueCount} vencido${overdueCount>1?"s":""})`,tone:"danger"};
  if(nearCount>0) return{text:`Atenção (${nearCount} próximo${nearCount>1?"s":""})`,tone:"warn"};
  if(total<=0) return{text:`Em dia`,tone:"ok"};
  return{text:`Em andamento (${doneTotal}/${targetTotal})`,tone:"warn"};
}

function catLabel(templates,category) {
  return templates.find(t=>t.category===category)?.label||category||"Geral";
}

function canManage(user) { return["nurse_manager","doctor"].includes(String(user?.role||"")); }
function isManager(user) { return String(user?.role||"")==="nurse_manager"; }
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
    return { date: today.toISOString().slice(0,10), reason: "Nenhuma visita registrada ainda.", overdue: true, pendingVisits };
  }

  const lastVisit = new Date(visits[0].date); lastVisit.setHours(0,0,0,0);
  const daysSince = Math.floor((today - lastVisit) / 86400000);
  const nextDate = new Date(lastVisit);
  nextDate.setDate(nextDate.getDate() + Math.max(intervalDays, 30));
  const daysUntil = Math.floor((nextDate - today) / 86400000);
  const overdue = daysUntil < 0;

  return {
    date: (overdue ? today : nextDate).toISOString().slice(0,10),
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


function isAcs(user)          { return String(user?.role||"")==="acs"; }
function isPharmacist(user)   { return String(user?.role||"")==="pharmacist"; }
function isNursingTech(user)  { return String(user?.role||"")==="nursing_tech"; }
function isAdmin(user)        { try { return String(user?.email||"").toLowerCase()==="ana@clinica.local"; } catch { return false; } }

// O que cada perfil pode ver/fazer
function canManagePatients(user)  { return ["nurse_manager","doctor","nursing_tech"].includes(String(user?.role||"")); }
function canWriteRecords(user)    { return ["nurse_manager","doctor","nursing_tech","acs"].includes(String(user?.role||"")); }
function canAccessPharmacy(user)  { return isAdmin(user) || isPharmacist(user); }
function canAccessAI(user)        { return ["nurse_manager","doctor"].includes(String(user?.role||"")) || isAdmin(user); }
function canManageUsers(user)     { return isManager(user) || isAdmin(user); }

// Nav items por perfil
function buildNavItems(user, canManageUser) {
  const admin = isAdmin(user);
  const items = [];
  // Recepcionistas têm app próprio — não aparecem no nav geral
  if (isReceptionist(user) && !admin) return items;
  if (!isPharmacist(user) || admin) items.push({ id:"dashboard",  label:"Painel" });
  // Fila/Agenda: visíveis no nav apenas para admin — para recepção usa ReceptionistApp
  if (admin) items.push({ id:"queue",  label:"Fila / Recepção" });
  if (admin) items.push({ id:"agenda", label:"Agenda" });
  if (!isPharmacist(user) || admin) items.push({ id:"patients",   label:"Pacientes" });
  if (canManageUser && !isNursingTech(user)) items.push({ id:"protocols", label:"Protocolos" });
  if (canManageUser && !isNursingTech(user)) { items.push({ id:"acs", label:"ACS" }); items.push({ id:"doctors", label:"Médicos" }); }
  if (!isPharmacist(user) || admin) items.push({ id:"vaccines",   label:"Vacinas" });
  items.push({ id:"pharmacy",  label:"Farmácia" });
  if (!isPharmacist(user) || admin) items.push({ id:"referrals",  label:"Encaminhamentos" });
  if (canManageUser || admin) items.push({ id:"reports", label:"Relatórios" });
  if (canAccessAI(user)) items.push({ id:"ai", label:"IA Assistida" });
  return items;
}
function isChildCategory(category) {
  const c = String(category||"").toLowerCase();
  return c === "puericulture" || c === "child_followup";
}

function emptyPatientForm() {
  return{name:"",motherName:"",cpf:"",cns:"",birthDate:"",phone:"",phoneAlt:"",careCategory:"general",assignedAcsId:"",zipCode:"",address:"",number:"",complement:"",neighborhood:"",city:"",state:"",sex:"",maritalStatus:"",allergies:"",comorbidities:"",medications:"",pregnancyStartDate:"",expectedDeliveryDate:"",gestationalAgeDumWeeks:"",gestationalAgeDumDays:"",gestationalAgeUsgWeeks:"",gestationalAgeUsgDays:"",usgDate1:"",usgDate2:"",usgDate3:""};
}

/* â”€â”€ SVG Icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   AUTH SCREEN
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */


function AuthScreen({ onLogin, onRegister, publicTeams, error, busy }) {
  const [authTab, setAuthTab] = useState("login");
  const [email, setEmail] = useState("ana@clinica.local");
  const [password, setPassword] = useState("123456");
  const [reg, setReg] = useState({ name:"",email:"",password:"",role:"nurse_manager",teamId:"",councilNumber:"",councilUf:"SP" });

  return (
    <main className="auth-screen">
      {/* Left panel */}
      <section className="auth-left">
        <div className="auth-brand">
          <div className="auth-brand-icon"><IconLogo/></div>
          <span className="brand-name">SaudeUBS</span>
        </div>

        <div className="auth-hero">
          <div className="auth-eyebrow">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M5 3v2l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Plataforma clínica
          </div>
          <h1>Gestão clínica<br/><em>para atenção básica</em></h1>
          <p>Prontuários, protocolos e comunicação entre enfermagem, ACS e médicos - em tempo real.</p>
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
          ) : (
            <form className="auth-form" onSubmit={e=>{e.preventDefault();onRegister(reg);}}>
              <label>Nome completo<input value={reg.name} onChange={e=>setReg(s=>({...s,name:e.target.value}))} placeholder="Maria da Silva"/></label>
              <label>E-mail<input type="email" value={reg.email} onChange={e=>setReg(s=>({...s,email:e.target.value}))} placeholder="você@unidade.local"/></label>
              <label>Senha<input type="password" value={reg.password} onChange={e=>setReg(s=>({...s,password:e.target.value}))} placeholder="Mínimo 8 caracteres"/></label>
              <label>Perfil
                <select value={reg.role} onChange={e=>setReg(s=>({...s,role:e.target.value}))}>
                  <option value="nurse_manager">Enfermeira</option>
                  <option value="doctor">Médico(a)</option>
                  <option value="nursing_tech">Téc. de Enfermagem</option>
                  <option value="pharmacist">Farmacêutico(a)</option>
                  <option value="receptionist">Recepcionista</option>
                </select>
              </label>
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
              <label>Conselho<input value={reg.councilNumber} onChange={e=>setReg(s=>({...s,councilNumber:onlyDigits(e.target.value).slice(0,12)}))}/></label>
              <label>UF do conselho<input maxLength={2} value={reg.councilUf} onChange={e=>setReg(s=>({...s,councilUf:e.target.value.toUpperCase()}))}/></label>
              {error && <p className="error">{error}</p>}
              <button type="submit" disabled={busy}>{busy?"Criando...":"Criar cadastro"}</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   SIDEBAR
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Sidebar({ tab, setTab, mobileOpen, setMobileOpen, query, setQuery, user, canManageUser }) {
  const navItems = buildNavItems(user, canManageUser);

  return (
    <aside className={`sidebar${mobileOpen?" mobile-open":""}`}>
      <div className="sidebar-inner">
        {/* Search */}
        <div className="sidebar-search-wrap">
          <span className="sidebar-search-ico"><IconSearch/></span>
          <input className="sidebar-search-input" placeholder="Buscar..." value={query} onChange={e=>setQuery(e.target.value)}/>
        </div>

        <div className="sidebar-section-label">Menu</div>

        <nav className="nav-links">
          {navItems.map(item => (
            <button key={item.id}
              className={`nav-link${tab===item.id?" active":""}`}
              onClick={()=>{ setTab(item.id); setMobileOpen(false); if(item.id!=="patients") setSelectedPatientId(""); }}>
              {NAV_ICON[item.id]}
              {item.label}
            </button>
          ))}
        </nav>
    </div>
  </aside>
);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TOPBAR
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Topbar({ user, selectedPatient, templates, mobileOpen, setMobileOpen, onLogout, onOpenProfile, patients, protocolByPatient, onNavigatePatient }) {
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
        <div className="topbar-brand-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v12M2 8h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <h2>SaudeUBS</h2>
      </div>

      <div className="topbar-center"/>

      <div className="topbar-right">
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DASHBOARD
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Dashboard({ patients, users, templates, protocolByPatient, onNavigate, setTab }) {
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
        <KpiCard label="Pacientes ativos"   value={patients.length}  foot="Total cadastrado"/>
        <KpiCard label="Com ACS definido"   value={assigned}         foot={`Sem ACS: ${unassigned}`}/>
        <KpiCard label="Protocolos críticos" value={pc.critical}     foot={`Atenção: ${pc.attention} • Em dia: ${pc.ok}`}/>
        <KpiCard label="Profissionais"       value={users.length}    foot={`ACS: ${acsCount} • Médicos: ${docCount}`}/>
      </section>

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
            <span className="card-title">Pacientes prioritários</span>
            <Chip tone="danger">{pc.critical} crítico{pc.critical!==1?"s":""}</Chip>
          </div>
          <div className="card-body">
            {!critical.length
              ? <p className="muted" style={{fontSize:".84rem"}}>Nenhum paciente com protocolo crítico. ðŸŽ‰</p>
              : <ul className="stack-list">
                  {critical.map(p=>{
                    const chip=protocolChip(protocolByPatient[p.id]);
                    const acsName=users.find(u=>u.id===p.assignedAcsId)?.name||"Sem ACS";
                    return(
                      <li key={p.id}>
                        <div>
                          <p><strong>{p.name}</strong></p>
                          <p className="muted small">{catLabel(templates,p.careCategory)} • {acsName}</p>
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

/* â”€â”€ Shared micro-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function KpiCard({ label, value, foot }) {
  return (
    <article className="home-kpi-card">
      <p className="home-kpi-label">{label}</p>
      <p className="home-kpi-value">{value}</p>
      <p className="home-kpi-foot">{foot}</p>
    </article>
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PATIENTS TABLE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function PatientsTab({ patients,users,templates,protocolByPatient,query,setQuery,categoryFilter,setCategoryFilter,acsFilter,setAcsFilter,selectedPatientId,setSelectedPatientId,canManageUser,canWriteRecords,onEdit,onDelete,onView,patientTab,setPatientTab,appointments,tasks,messages,history,patientProtocolSummary,sortedSpecialAlerts,recordForm,setRecordForm,recordVaccines,setRecordVaccines,appointmentForm,setAppointmentForm,taskForm,setTaskForm,messageText,setMessageText,onSubmitRecord,onSubmitAppointment,onSubmitTask,onSubmitMessage,onDeleteRecord,onDeleteAppointment,onStatusChange,selectedPatient,userObj,token }) {
  const [page, setPage] = useState(1);
  const acsUsers=users.filter(u=>u.role==="acs");
  const catOpts=templates.map(t=>({value:t.category,label:t.label}));
  const filtered=patients
    .filter(p=>{ const q=query.trim().toLowerCase(); if(!q) return true; const acsName=users.find(u=>u.id===p.assignedAcsId)?.name||""; const cat=catLabel(templates,p.careCategory); return`${p.name||""} ${p.phone||""} ${acsName} ${cat}`.toLowerCase().includes(q); })
    .filter(p=>categoryFilter?p.careCategory===categoryFilter:true)
    .filter(p=>acsFilter?p.assignedAcsId===acsFilter:true);

  useEffect(()=>{ setPage(1); },[query,categoryFilter,acsFilter,patients.length]);
  useEffect(()=>{
    if(selectedPatientId && !filtered.some((p)=>p.id===selectedPatientId)) setSelectedPatientId("");
  },[filtered,selectedPatientId,setSelectedPatientId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PATIENTS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PATIENTS_PAGE_SIZE;
  const pagedPatients = filtered.slice(pageStart, pageStart + PATIENTS_PAGE_SIZE);

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
                            <div className="user-avatar" style={{width:28,height:28,fontSize:".7rem",flexShrink:0}}>{initials(p.name)}</div>
                            <div>
                              <strong>{p.name}</strong>
                              <div className="muted small">{p.phone||"-"}</div>
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
            acsUsers={users.filter(u=>u.role==="acs")} canManageUser={canManageUser} canWriteRecords={canWriteRecords??canManageUser} userObj={userObj} token={token}
          />
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PATIENT DETAIL (right panel)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
/* ═══════════════════════════════════════════════════════════════════
   EXAMS TAB
═══════════════════════════════════════════════════════════════════ */
const EXAM_TYPES = ["Hemograma","Glicemia","HbA1c","Colesterol total","Triglicerídeos","Creatinina","TSH","Urina rotina","Raio-X","Ultrassonografia","ECG","Outros"];

function ExamsTab({ patientId, canManageUser, token }) {
  const [exams, setExams]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm]     = useState({ type: "Hemograma", name: "", date: "", notes: "" });
  const [files, setFiles]   = useState([]);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState("");
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const authHeader = { "Authorization": `Bearer ${token}` };

  async function loadExams() {
    setLoading(true);
    try {
      const res = await fetch(`/patients/${patientId}/exams`, { headers: authHeader });
      if (res.ok) setExams(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { loadExams(); }, [patientId]);

  async function handleSubmit(e) {
    e.preventDefault();
    const title = form.type === "Outros" ? form.name.trim() : form.type;
    if (!title || !form.date) { setError("Preencha o tipo e a data do exame."); return; }
    setBusy(true); setError("");
    try {
      // 1. Create exam record
      const res = await fetch(`/patients/${patientId}/exams`, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ title, date: form.date, notes: form.notes.trim() }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Erro ao criar exame"); }
      const created = await res.json();

      // 2. Upload each file
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await fetch(`/patients/${patientId}/exams/${created.id}/attachments`, {
          method: "POST",
          headers: authHeader,
          body: fd,
        });
        if (!up.ok) { const e = await up.json(); throw new Error(e.error || "Erro ao enviar arquivo"); }
      }

      setForm({ type: "Hemograma", name: "", date: "", notes: "" });
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      await loadExams();
    } catch (err) { setError(err.message || "Erro ao salvar exame."); }
    finally { setBusy(false); }
  }

  async function handleDelete(examId) {
    if (!confirm("Excluir este exame e seus anexos?")) return;
    try {
      await fetch(`/patients/${patientId}/exams/${examId}`, { method: "DELETE", headers: authHeader });
      await loadExams();
    } catch { setError("Erro ao excluir exame."); }
  }

  function handleFileChange(e) {
    const chosen = Array.from(e.target.files || []);
    const tooBig = chosen.filter(f => f.size > 15 * 1024 * 1024);
    if (tooBig.length) { setError("Arquivo(s) muito grande(s): máx 15MB cada."); return; }
    setError("");
    setFiles(chosen);
  }

  function isImage(type) { return String(type || "").startsWith("image/"); }
  function fmtSize(bytes) { return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`; }

  return (
    <div className="panel-block">
      {canManageUser && (
        <form className="inline-form" onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".78rem", fontWeight: 600, color: "var(--slate-700)" }}>
              Tipo de exame
              <select value={form.type} onChange={e => setForm(s => ({ ...s, type: e.target.value }))}>
                {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".78rem", fontWeight: 600, color: "var(--slate-700)" }}>
              Data do exame
              <input type="date" value={form.date} onChange={e => setForm(s => ({ ...s, date: e.target.value }))} />
            </label>
          </div>
          {form.type === "Outros" && (
            <input placeholder="Nome do exame" value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))} style={{ marginTop: ".35rem" }} />
          )}
          <textarea placeholder="Observações / resultado resumido (opcional)" value={form.notes} onChange={e => setForm(s => ({ ...s, notes: e.target.value }))} style={{ minHeight: 52, marginTop: ".35rem" }} />
          <label style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".78rem", fontWeight: 600, color: "var(--slate-700)", marginTop: ".35rem" }}>
            Anexar arquivo (imagem ou PDF, máx 15MB)
            <input type="file" ref={fileRef} accept="image/*,application/pdf" multiple onChange={handleFileChange} style={{ fontSize: ".78rem", padding: ".3rem 0" }} />
          </label>
          {files.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".35rem", marginTop: ".35rem" }}>
              {files.map((f, i) => (
                <span key={i} style={{ fontSize: ".72rem", padding: ".15rem .45rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 999, color: "var(--text-2)" }}>
                  {f.name} · {fmtSize(f.size)}
                </span>
              ))}
            </div>
          )}
          {error && <p className="error" style={{ marginTop: ".25rem" }}>{error}</p>}
          <button type="submit" disabled={busy} style={{ marginTop: ".5rem", alignSelf: "flex-start" }}>
            {busy ? "Salvando..." : "Registrar exame"}
          </button>
        </form>
      )}

      {loading
        ? <p className="muted" style={{ fontSize: ".84rem" }}>Carregando exames...</p>
        : !exams.length
          ? <EmptyState message="Nenhum exame registrado" />
          : exams.map(exam => (
            <div key={exam.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: ".75rem .9rem", marginBottom: ".5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: ".5rem" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: ".85rem", color: "var(--ink)" }}>{exam.title}</div>
                  <div style={{ fontSize: ".74rem", color: "var(--text-3)", marginTop: ".1rem", fontFamily: "IBM Plex Mono" }}>{fmtDate(exam.date)}</div>
                </div>
                <div style={{ display: "flex", gap: ".35rem", alignItems: "center", flexShrink: 0 }}>
                  {Array.isArray(exam.attachments) && exam.attachments.length > 0 && (
                    <span style={{ fontSize: ".7rem", color: "var(--teal-700)", background: "var(--teal-50)", border: "1px solid var(--teal-100)", padding: ".1rem .45rem", borderRadius: 999 }}>
                      {exam.attachments.length} anexo{exam.attachments.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {canManageUser && (
                    <button className="icon-btn" title="Excluir exame" onClick={() => handleDelete(exam.id)}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                  )}
                </div>
              </div>
              {exam.details && <p style={{ fontSize: ".8rem", color: "var(--text-2)", marginTop: ".4rem", lineHeight: 1.5 }}>{exam.details}</p>}
              {Array.isArray(exam.attachments) && exam.attachments.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginTop: ".55rem" }}>
                  {exam.attachments.map((att, i) => (
                    <button key={i} type="button"
                      onClick={() => setPreview(att)}
                      style={{ display: "flex", alignItems: "center", gap: ".35rem", padding: ".3rem .6rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer", fontSize: ".75rem", color: "var(--text-1)", transition: "background .1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-3)"}
                      onMouseLeave={e => e.currentTarget.style.background = "var(--surface)"}>
                      {isImage(att.contentType)
                        ? <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><circle cx="5.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M1.5 11l3.5-3 3 3 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        : <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.3" /><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.3" /></svg>
                      }
                      {att.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
      }

      {/* Preview modal */}
      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)} style={{ zIndex: 600 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: ".75rem", padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: ".88rem", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>{preview.name}</span>
              <div style={{ display: "flex", gap: ".4rem", flexShrink: 0 }}>
                <a href={preview.url} download={preview.name} target="_blank" rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: ".3rem", fontSize: ".78rem", padding: ".3rem .7rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", color: "var(--text-1)", textDecoration: "none" }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                  Baixar
                </a>
                <button className="icon-btn" onClick={() => setPreview(null)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
            <div style={{ overflow: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", flex: 1 }}>
              {isImage(preview.contentType)
                ? <img src={preview.url} alt={preview.name} style={{ maxWidth: "100%", maxHeight: "75vh", borderRadius: "var(--r-md)", objectFit: "contain" }} />
                : <iframe src={preview.url} title={preview.name} style={{ width: "70vw", height: "75vh", border: "none", borderRadius: "var(--r-md)" }} />
              }
            </div>
          </div>
        </div>
      )}
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
    {id:"followup",     label:"Acompanhamento",       icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>},
    {id:"chart",        label:"Prontuário",   icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 2h10v12H3z" stroke="currentColor" strokeWidth="1.3"/><path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>},
    {id:"appointments", label:"Atendimentos", icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 2v3M11 2v3M2.5 6.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>},
    {id:"tasks",        label:"Tarefas",      icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>},
    {id:"exams",        label:"Exames",       icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.3"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.3"/><path d="M5 8h2M5 10.5h5M5 6h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="11.5" cy="11.5" r="2.5" fill="var(--surface)" stroke="currentColor" strokeWidth="1.2"/><path d="M10.5 11.5h2M11.5 10.5v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>},
    {id:"messages",     label:"Mensagens",    icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H9l-3 2v-2H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>},
  ];

  return (
    <>
      {/* Patient header */}
      <div style={{padding:"1.1rem 1.25rem",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",gap:".75rem"}}>
        <div className="user-avatar" style={{width:40,height:40,fontSize:"1rem",flexShrink:0}}>{initials(patient.name)}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:".95rem",color:"var(--text-1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{patient.name}</div>
          <div style={{fontSize:".75rem",color:"var(--text-2)",display:"flex",gap:".5rem",flexWrap:"wrap",marginTop:".15rem"}}>
            <span>{catLabel(templates,patient.careCategory)}</span>
            <span>•</span>
            <span>{acsName}</span>
          </div>
        </div>
        {canManageUser&&(
          <div style={{display:"flex",gap:".35rem",flexShrink:0}}>
            <button onClick={()=>setShowPatientCard(true)} title="Cartão do paciente" style={{fontSize:".7rem",padding:".25rem .5rem",background:"var(--teal-50)",border:"1px solid var(--teal-200)",borderRadius:"var(--r-md)",color:"var(--teal-700)"}}>🪪 Cartão</button>
            <button onClick={()=>setDocType("comparecimento")} title="Declaração de comparecimento" style={{fontSize:".7rem",padding:".25rem .5rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>📄 Decl.</button>
            <button onClick={()=>setDocType("atestado")} title="Atestado médico" style={{fontSize:".7rem",padding:".25rem .5rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>📋 Atestado</button>
          </div>
        )}
      </div>

      {g && (
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

        {/* â”€â”€ PROTOCOL â”€â”€ */}
        {patientTab==="protocol"&&(
          <div className="panel-block">
            {!patientProtocolSummary
              ? <p className="muted">Sem resumo de protocolo.</p>
              : <>
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
                </>
            }
          </div>
        )}

        {/* ── FOLLOW UP ── */}
        {patientTab==="followup"&&(
          <div className="panel-block">
            <h4>Acompanhamento clínico</h4>
            <form className="inline-form" onSubmit={onSubmitRecord}>

              {/* Tipo */}
              {isAcs(userObj) ? (
                <input value="Visita domiciliar" disabled/>
              ) : (
                <select value={recordForm.type} onChange={e=>{
                  const t=e.target.value;
                  setRecordForm(s=>({...s, type:t, title:""}));
                  setRecordVaccines([]);
                }}>
                  <option value="visit">Visita domiciliar</option>
                  <option value="consultation">Consulta</option>
                  <option value="vaccine">Vacina</option>
                  <option value="procedure">Procedimento</option>
                  <option value="note">Observação</option>
                </select>
              )}

              {/* Data */}
              <input type="date" value={recordForm.date} onChange={e=>setRecordForm(s=>({...s,date:e.target.value}))}/>

              {/* Título fixo por tipo */}
              {!isAcs(userObj) && recordForm.type==="visit" && (
                <select value={recordForm.title} onChange={e=>setRecordForm(s=>({...s,title:e.target.value}))}>
                  <option value="">Selecione o título</option>
                  <option value="Visita ACS">Visita ACS</option>
                </select>
              )}

              {!isAcs(userObj) && recordForm.type==="consultation" && (
                <select value={recordForm.title} onChange={e=>setRecordForm(s=>({...s,title:e.target.value}))}>
                  <option value="">Selecione o título</option>
                  <option value="Consulta médica">Consulta médica</option>
                  <option value="Consulta de enfermagem">Consulta de enfermagem</option>
                  <option value="Consulta odontológica">Consulta odontológica</option>
                </select>
              )}

              {!isAcs(userObj) && (recordForm.type==="procedure"||recordForm.type==="note") && (
                <input placeholder="Título" value={recordForm.title} onChange={e=>setRecordForm(s=>({...s,title:e.target.value}))}/>
              )}

              {isAcs(userObj) && (
                <input value="Visita ACS" disabled/>
              )}

              {/* Vacinas — checkboxes, sem Ctrl/Cmd */}
              {!isAcs(userObj) && recordForm.type==="vaccine" && (
                <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                  <span style={{fontSize:".75rem",color:"var(--accent)",fontWeight:500}}>
                    Clique para selecionar — pode marcar mais de uma vacina
                  </span>
                  <div style={{
                    display:"grid", gridTemplateColumns:"1fr 1fr",
                    gap:".3rem", background:"var(--surface-2)",
                    border:"1px solid var(--border)", borderRadius:"var(--r-md)",
                    padding:".65rem .75rem", maxHeight:220, overflowY:"auto",
                  }}>
                    {VACCINE_OPTIONS.map(v=>(
                      <label key={v} style={{
                        display:"flex", alignItems:"center", gap:".45rem",
                        fontSize:".83rem", color:"var(--text-1)", cursor:"pointer",
                        padding:".28rem .4rem", borderRadius:"var(--r-sm)",
                        background: recordVaccines.includes(v) ? "var(--teal-50,#f0fdfa)" : "transparent",
                        border: recordVaccines.includes(v) ? "1px solid var(--teal-200,#99f6e4)" : "1px solid transparent",
                        transition:"all .1s",
                      }}>
                        <input
                          type="checkbox"
                          checked={recordVaccines.includes(v)}
                          onChange={e=>setRecordVaccines(prev=>
                            e.target.checked ? [...prev,v] : prev.filter(x=>x!==v)
                          )}
                          style={{accentColor:"var(--accent)",width:14,height:14,cursor:"pointer",flexShrink:0}}
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                  {recordVaccines.length>0 && (
                    <span style={{fontSize:".75rem",color:"var(--text-3)"}}>
                      {recordVaccines.length} vacina{recordVaccines.length>1?"s":""} selecionada{recordVaccines.length>1?"s":""}
                    </span>
                  )}
                </div>
              )}

              <textarea placeholder="Detalhes (opcional)" value={recordForm.details} onChange={e=>setRecordForm(s=>({...s,details:e.target.value}))} style={{minHeight:56}}/>
              <button type="submit">Salvar acompanhamento</button>
            </form>
          </div>
        )}

        {/* â”€â”€ CHART â”€â”€ */}
        {patientTab==="chart"&&(
          <div className="panel-block">
            {!history.length
              ? <EmptyState message="Sem registros no prontuário"/>
              : <div className="chart-list">
                  {history.map(item=>(
                    <article key={item.id} className="chart-entry">
                      <div className="chart-entry-head">
                        <div className="chart-entry-main">
                          <span className="chart-entry-title">{item.title||item.type}</span>
                          <span className="chart-entry-type">{item.type}</span>
                        </div>
                        <span className="chart-entry-date">{fmtDate(item.date)}</span>
                      </div>
                      {item.details&&<p className="chart-entry-details">{item.details}</p>}
                      <div className="chart-entry-foot">
                        <span>Origem: {item.source||"-"}</span>
                        {item.createdAt&&<span>• Lançado em {fmtDate(item.createdAt)}</span>}
                      </div>
                      {item.source==="clinicalRecord"&&canManageUser&&(
                        <button className="danger-btn chart-delete-btn" onClick={()=>onDeleteRecord(item.id)}>
                          Excluir
                        </button>
                      )}
                    </article>
                  ))}
                </div>
            }
          </div>
        )}

        {/* â”€â”€ APPOINTMENTS â”€â”€ */}
        {patientTab==="appointments"&&(
          <div className="panel-block">
            {(canManageUser||canWriteRecords)&&(
              <form className="inline-form" onSubmit={onSubmitAppointment}>
                <input type="date" value={appointmentForm.date} onChange={e=>setAppointmentForm(s=>({...s,date:e.target.value}))}/>
                <select value={appointmentForm.demandType} onChange={e=>setAppointmentForm(s=>({...s,demandType:e.target.value}))}>
                  <option value="scheduled">Programada</option>
                  <option value="spontaneous">Espontânea</option>
                </select>
                <input placeholder="Resumo" value={appointmentForm.summary} onChange={e=>setAppointmentForm(s=>({...s,summary:e.target.value}))}/>
                <textarea placeholder="Conduta" value={appointmentForm.conduct} onChange={e=>setAppointmentForm(s=>({...s,conduct:e.target.value}))} style={{minHeight:48}}/>
                <textarea placeholder="Próximo passo" value={appointmentForm.nextStep} onChange={e=>setAppointmentForm(s=>({...s,nextStep:e.target.value}))} style={{minHeight:48}}/>
                <button type="submit">Registrar atendimento</button>
              </form>
            )}
            {!appointments.length
              ? <EmptyState message="Sem atendimentos registrados"/>
              : appointments.map(a=>(
                  <div key={a.id} style={{padding:".7rem .85rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",marginBottom:".5rem"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:".25rem"}}>
                      <strong style={{fontSize:".83rem"}}>{a.summary||"Atendimento"}</strong>
                      <span style={{fontSize:".72rem",color:"var(--text-3)",fontFamily:"IBM Plex Mono"}}>{fmtDate(a.date)}</span>
                    </div>
                    <Chip tone={a.demandType==="scheduled"?"muted":"warn"}>{a.demandType==="scheduled"?"Programada":"Espontânea"}</Chip>
                    {a.conduct&&<p style={{fontSize:".78rem",color:"var(--text-2)",marginTop:".3rem"}}><strong>Conduta:</strong> {a.conduct}</p>}
                    {a.nextStep&&<p style={{fontSize:".78rem",color:"var(--text-2)"}}><strong>Próximo:</strong> {a.nextStep}</p>}
                    {canManageUser&&<button className="danger-btn" style={{marginTop:".4rem",padding:".25rem .6rem",fontSize:".72rem"}} onClick={()=>onDeleteAppointment(a.id)}>Excluir</button>}
                  </div>
                ))
            }
          </div>
        )}

        {/* â”€â”€ TASKS â”€â”€ */}
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
          <ExamsTab patientId={patient.id} canManageUser={canManageUser} token={token}/>
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   AI TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

/* ═══════════════════════════════════════════════════════════════════
═══════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════════
   SHARED LOCAL STORAGE HELPERS — Agenda, Fila, Encaminhamentos
══════════════════════════════════════════════════════════════════ */
function readLS(key, def) { try { const r=localStorage.getItem(key); return r?JSON.parse(r):def; } catch { return def; } }
function writeLS(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

/* ══════════════════════════════════════════════════════════════════
   NOTIFICATIONS SYSTEM
══════════════════════════════════════════════════════════════════ */
function buildProactiveAlerts(patients, protocolByPatient, pharmacyStock, agenda) {
  const alerts = [];
  const today = new Date(); today.setHours(0,0,0,0);

  // Gestantes passadas da DPP
  patients.forEach(p => {
    if (String(p.careCategory||"").toLowerCase() !== "pregnant") return;
    const dpp = p.expectedDeliveryDate ? new Date(p.expectedDeliveryDate) : null;
    if (dpp && dpp < today) {
      const days = Math.floor((today - dpp) / 86400000);
      alerts.push({ id:"dpp-"+p.id, type:"danger", icon:"🤰", title:"DPP ultrapassada", detail:`${p.name} — ${days}d além da DPP`, patientId:p.id });
    }
  });

  // Pacientes com protocolo crítico
  patients.forEach(p => {
    const chip = protocolChip(protocolByPatient[p.id]);
    if (chip.tone === "danger") {
      alerts.push({ id:"prot-"+p.id, type:"warn", icon:"⚠️", title:"Protocolo crítico", detail:p.name+" — "+chip.text, patientId:p.id });
    }
  });

  // Estoque zerado ou abaixo do mínimo
  (pharmacyStock||[]).forEach(s => {
    if (s.qty === 0) alerts.push({ id:"stock0-"+s.id, type:"danger", icon:"💊", title:"Medicamento zerado", detail:s.name });
    else if (s.qty <= s.minQty) alerts.push({ id:"stocklow-"+s.id, type:"warn", icon:"📦", title:"Estoque baixo", detail:`${s.name} — ${s.qty} restante(s)` });
  });

  // Consultas de hoje sem confirmação
  const todayStr = today.toISOString().slice(0,10);
  (agenda||[]).filter(a => a.date === todayStr && a.status === "scheduled").forEach(a => {
    alerts.push({ id:"agenda-"+a.id, type:"info", icon:"📅", title:"Consulta hoje", detail:`${a.patientName} — ${a.time||"sem horário"} com ${a.doctorName||"profissional"}` });
  });

  return alerts.slice(0, 20);
}

function NotificationBell({ patients, protocolByPatient, pharmacyStock, agenda, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const alerts = useMemo(() =>
    buildProactiveAlerts(patients, protocolByPatient, pharmacyStock, agenda),
    [patients, protocolByPatient, pharmacyStock, agenda]
  );
  const dangerCount = alerts.filter(a => a.type === "danger").length;
  const total = alerts.length;

  return (
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={()=>setOpen(v=>!v)}
        style={{position:"relative",width:34,height:34,borderRadius:"var(--r-md)",background:"var(--surface-2)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5a5 5 0 00-5 5v3l-1.5 2h13L13 9.5v-3a5 5 0 00-5-5z" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        {total > 0 && (
          <span style={{position:"absolute",top:-4,right:-4,minWidth:16,height:16,borderRadius:999,background:dangerCount>0?"#dc2626":"var(--amber-500)",color:"#fff",fontSize:".6rem",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",lineHeight:1}}>
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,width:320,maxHeight:420,overflowY:"auto",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-lg)",boxShadow:"0 8px 30px rgba(0,0,0,.12)",zIndex:600}}>
          <div style={{padding:".7rem 1rem",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontWeight:700,fontSize:".82rem",color:"var(--ink)"}}>Alertas do sistema</span>
            <span style={{fontSize:".72rem",color:"var(--text-3)"}}>{total} aviso{total!==1?"s":""}</span>
          </div>
          {!total && <p style={{padding:"1.5rem",textAlign:"center",color:"var(--text-3)",fontSize:".82rem"}}>Nenhum alerta no momento ✓</p>}
          {alerts.map(a => (
            <div key={a.id} onClick={()=>{ if(a.patientId&&onNavigate) onNavigate(a.patientId); setOpen(false); }}
              style={{padding:".65rem 1rem",borderBottom:"1px solid var(--border-soft)",display:"flex",gap:".65rem",alignItems:"flex-start",
                background:a.type==="danger"?"#fff5f5":a.type==="warn"?"#fffbeb":"var(--surface)",
                cursor:a.patientId?"pointer":"default",transition:"filter .1s"}}
              onMouseEnter={e=>{ if(a.patientId) e.currentTarget.style.filter="brightness(.97)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.filter="none"; }}>
              <span style={{fontSize:"1rem",flexShrink:0,marginTop:".1rem"}}>{a.icon}</span>
              <div style={{minWidth:0}}>
                <div style={{fontWeight:700,fontSize:".76rem",color:a.type==="danger"?"#be123c":a.type==="warn"?"var(--amber-700)":"var(--teal-700)"}}>{a.title}</div>
                <div style={{fontSize:".73rem",color:"var(--text-2)",marginTop:".1rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.detail}</div>
              </div>
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

  function submit(e) {
    e.preventDefault();
    const u = RECEPTION_USERS.find(u =>
      u.email.toLowerCase() === email.toLowerCase().trim() && u.password === pw
    );
    if (!u) { setErr("E-mail ou senha incorretos."); return; }
    onLogin(u);
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
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••"/>
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
    const lq = search.toLowerCase().replace(/[.\-\/]/g,"");
    return patients.filter(p => {
      const name = p.name.toLowerCase();
      const cpf  = String(p.cpf||"").replace(/\D/g,"");
      const cns  = String(p.cns||"").replace(/\D/g,"");
      return name.includes(search.toLowerCase()) || cpf.includes(lq) || cns.includes(lq);
    }).slice(0,8);
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
        const age = pat?.birthDate ? Math.floor((new Date()-new Date(pat.birthDate))/31557600000) : null;
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
    const pa=PRIORITY_COLORS[a.priority]?.order??4, pb=PRIORITY_COLORS[b.priority]?.order??4;
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
    { id:"agenda",  label:"Agenda",  icon:"📅" },
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
          <span style={{fontWeight:800,fontSize:".9rem",color:"var(--ink)"}}>SaudeUBS</span>
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
                <div style={{fontWeight:700,fontSize:".95rem",marginBottom:"1rem"}}>Nenhum paciente na fila</div>
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
                return(
                  <button key={d} onClick={()=>setSelectedDate(d)}
                    style={{flex:"1 0 70px",minWidth:70,padding:".6rem .4rem",borderRadius:"var(--r-md)",
                      border:`2px solid ${isSel?"var(--teal-500)":"var(--border)"}`,
                      background:isSel?"var(--teal-600)":isToday?"var(--teal-50)":"var(--surface)",
                      color:isSel?"#fff":isToday?"var(--teal-700)":"var(--text-2)",cursor:"pointer",textAlign:"center"}}>
                    <div style={{fontSize:".65rem",fontWeight:600,textTransform:"uppercase",opacity:.8}}>{dt.toLocaleDateString("pt-BR",{weekday:"short"})}</div>
                    <div style={{fontSize:"1.15rem",fontWeight:900,lineHeight:1.2}}>{dt.getDate()}</div>
                    {countByDay[d]>0&&<div style={{fontSize:".62rem",marginTop:".1rem",opacity:.85,fontWeight:600}}>{countByDay[d]} aptos.</div>}
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
              <button onClick={()=>openAgendaNew()} style={{fontSize:".8rem",display:"flex",alignItems:"center",gap:".35rem"}}>
                + Novo agendamento
              </button>
            </div>

            {/* Appointments */}
            {!dayAppts.length ? (
              <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
                <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>📅</div>
                <div style={{fontWeight:600,fontSize:".9rem",marginBottom:"1rem"}}>Nenhum agendamento neste dia</div>
                <button onClick={()=>openAgendaNew()}>+ Agendar consulta</button>
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
                        <button onClick={()=>openAgendaEdit(appt)} style={{padding:".3rem .55rem",fontSize:".72rem",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>✏️</button>
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
                placeholder="Buscar paciente por nome, CPF ou CNS…"
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
                      style={{display:"flex",alignItems:"center",gap:"1rem",padding:".85rem 1.1rem",borderRadius:"var(--r-md)",background:"var(--surface)",border:"1px solid var(--border)",cursor:"pointer",textAlign:"left",transition:"border-color .12s,background .12s"}}
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
                          {g&&<span style={{color:"var(--teal-700)",fontWeight:600}}>IG {g.weeks}s{g.days}d</span>}
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
                          <span style={{color:"#be123c",fontWeight:600,background:"#fff1f2",padding:".2rem .5rem",borderRadius:"var(--r-md)",border:"1px solid #fecdd3"}}>⚠️ Alergias: {selectedPatient.allergies}</span>
                        )}
                        {gestationalAgeInfo(selectedPatient)&&(()=>{
                          const g=gestationalAgeInfo(selectedPatient);
                          return <span style={{color:"var(--teal-700)",fontWeight:600,background:"var(--teal-50)",padding:".2rem .5rem",borderRadius:"var(--r-md)",border:"1px solid var(--teal-200)"}}>🤰 IG: {g.weeks}s {g.days}d</span>;
                        })()}
                        {!String(selectedPatient.allergies||"").trim()&&!gestationalAgeInfo(selectedPatient)&&<span style={{color:"var(--text-3)"}}>Nenhum alerta</span>}
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

function AgendaPage({ patients, users, user }) {
  const [agenda, setAgenda]         = useState(()=>readLS(AGENDA_KEY,[]));
  const [selectedDate, setSelectedDate] = useState(()=>new Date().toISOString().slice(0,10));
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ patientId:"", doctorId:"", date:"", time:"", type:"consultation", notes:"", status:"scheduled" });
  const [editId, setEditId]         = useState(null);
  const [filterDoc, setFilterDoc]   = useState("");

  const doctors = users.filter(u=>["doctor","nurse_manager","nursing_tech"].includes(u.role));

  function saveAgenda(newA) { setAgenda(newA); writeLS(AGENDA_KEY, newA); }

  function openNew(time="", date=selectedDate) {
    setForm({ patientId:"", doctorId:"", date, time, type:"consultation", notes:"", status:"scheduled" });
    setEditId(null); setShowForm(true);
  }
  function openEdit(appt) {
    setForm({ patientId:appt.patientId, doctorId:appt.doctorId, date:appt.date, time:appt.time, type:appt.type, notes:appt.notes||"", status:appt.status });
    setEditId(appt.id); setShowForm(true);
  }
  function submit(e) {
    e.preventDefault();
    if (!form.patientId || !form.date || !form.time) return;
    const pat = patients.find(p=>p.id===form.patientId);
    const doc = users.find(u=>u.id===form.doctorId);
    const entry = { ...form, id: editId||("ag"+Date.now()), patientName:pat?.name||"?", doctorName:doc?.name||"", createdAt: new Date().toISOString() };
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
      <section className="home-hero" style={{margin:"1.5rem 1.5rem .75rem"}}>
        <div><p className="home-kicker">Gestão de Horários</p><h1 className="home-title">Agenda</h1><p className="home-sub">Agendamentos, confirmações e controle de presença.</p></div>
        <button onClick={()=>openNew()} style={{flexShrink:0,display:"flex",alignItems:"center",gap:".4rem"}}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Novo agendamento
        </button>
      </section>

      {/* Week strip */}
      <div style={{display:"flex",gap:".3rem",padding:"0 1.5rem .75rem",overflowX:"auto"}}>
        {weekDays.map(d=>{
          const dt=new Date(d+"T12:00:00");
          const isToday=d===new Date().toISOString().slice(0,10);
          const isSel=d===selectedDate;
          return (
            <button key={d} onClick={()=>setSelectedDate(d)}
              style={{flex:"1 0 60px",padding:".55rem .4rem",borderRadius:"var(--r-md)",border:`1px solid ${isSel?"var(--teal-500)":"var(--border)"}`,
                background:isSel?"var(--teal-600)":"var(--surface)",color:isSel?"#fff":isToday?"var(--teal-600)":"var(--text-2)",
                cursor:"pointer",textAlign:"center",minWidth:60}}>
              <div style={{fontSize:".65rem",fontWeight:600,textTransform:"uppercase",opacity:.8}}>{dt.toLocaleDateString("pt-BR",{weekday:"short"})}</div>
              <div style={{fontSize:"1.05rem",fontWeight:800,lineHeight:1.2}}>{dt.getDate()}</div>
              {countByDay[d]>0&&<div style={{fontSize:".6rem",marginTop:".1rem",opacity:.85}}>{countByDay[d]}×</div>}
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
        {!dayAppts.length ? (
          <div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--text-3)"}}>
            <div style={{fontSize:"2.5rem",marginBottom:".75rem"}}>📅</div>
            <div style={{fontWeight:600,fontSize:".9rem"}}>Nenhum agendamento neste dia</div>
            <button onClick={()=>openNew()} style={{marginTop:"1rem",fontSize:".8rem"}}>+ Agendar consulta</button>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
            {dayAppts.map(appt=>{
              const ss=statusStyle[appt.status]||statusStyle.scheduled;
              return (
                <div key={appt.id} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".75rem 1rem",borderRadius:"var(--r-md)",background:ss.bg,border:`1px solid ${ss.border}`}}>
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
                    <select value={appt.status} onChange={e=>updateStatus(appt.id,e.target.value)}
                      style={{fontSize:".72rem",padding:".2rem .4rem",borderRadius:999,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,fontWeight:700,cursor:"pointer"}}>
                      {Object.entries(statusStyle).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={()=>openEdit(appt)} style={{padding:".25rem .5rem",fontSize:".71rem",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"var(--r-md)"}}>✏️</button>
                    <button onClick={()=>remove(appt.id)} style={{padding:".25rem .5rem",fontSize:".71rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"#be123c"}}>✕</button>
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
                <select value={form.patientId} onChange={e=>setForm(s=>({...s,patientId:e.target.value}))}>
                  <option value="">Selecionar paciente...</option>
                  {[...patients].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Data *
                <input type="date" value={form.date} onChange={e=>setForm(s=>({...s,date:e.target.value}))}/>
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

function QueuePage({ patients, users, user }) {
  const [queue, setQueue]     = useState(()=>readLS(QUEUE_KEY,[]));
  const [form, setForm]       = useState({ patientId:"", priority:"normal", reason:"" });
  const [showForm, setShowForm] = useState(false);

  function saveQueue(q) { setQueue(q); writeLS(QUEUE_KEY,q); }

  function addToQueue(e) {
    e.preventDefault();
    if (!form.patientId) return;
    const pat = patients.find(p=>p.id===form.patientId);
    // Auto-detect priority from category
    let prio = form.priority;
    if (prio==="normal") {
      const cat = String(pat?.careCategory||"").toLowerCase();
      if (cat==="pregnant") prio="pregnant";
      else {
        const age = pat?.birthDate ? Math.floor((new Date()-new Date(pat.birthDate))/31557600000) : null;
        if (age!==null && age>=60) prio="elderly";
        else if (age!==null && age<12) prio="child";
      }
    }
    const entry = { id:"q"+Date.now(), patientId:form.patientId, patientName:pat?.name||"?", priority:prio, reason:form.reason, arrivedAt:new Date().toISOString(), status:"waiting" };
    saveQueue([...queue, entry]);
    setForm({ patientId:"", priority:"normal", reason:"" });
    setShowForm(false);
  }

  function updateStatus(id, status) { saveQueue(queue.map(q=>q.id===id?{...q,status,updatedAt:new Date().toISOString()}:q)); }
  function removeFromQueue(id) { saveQueue(queue.filter(q=>q.id!==id)); }
  function clearDone() { saveQueue(queue.filter(q=>q.status==="waiting"||q.status==="attending")); }

  const sorted = [...queue].sort((a,b)=>{
    if (a.status==="done"&&b.status!=="done") return 1;
    if (b.status==="done"&&a.status!=="done") return -1;
    const po=PRIORITY_COLORS,pa=po[a.priority]?.order??4,pb=po[b.priority]?.order??4;
    if(pa!==pb)return pa-pb;
    return a.arrivedAt.localeCompare(b.arrivedAt);
  });

  const waiting  = sorted.filter(q=>q.status==="waiting").length;
  const attending = sorted.filter(q=>q.status==="attending").length;

  function fmtTime(iso) {
    if(!iso)return"";
    const d=new Date(iso);
    return d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  }
  function waitMins(iso) {
    const mins = Math.floor((new Date()-new Date(iso))/60000);
    return mins<60?`${mins}min`:`${Math.floor(mins/60)}h${String(mins%60).padStart(2,"0")}`;
  }

  const alreadyInQueue = queue.filter(q=>q.status!=="done").map(q=>q.patientId);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <section className="home-hero" style={{margin:"1.5rem 1.5rem .75rem"}}>
        <div><p className="home-kicker">Recepção</p><h1 className="home-title">Fila de Atendimento</h1><p className="home-sub">Triagem, prioridade e fluxo de pacientes no dia.</p></div>
        <button onClick={()=>setShowForm(true)} style={{flexShrink:0,display:"flex",alignItems:"center",gap:".4rem"}}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Dar entrada
        </button>
      </section>

      {/* KPIs */}
      <div style={{display:"flex",gap:".75rem",padding:"0 1.5rem .75rem"}}>
        {[["Aguardando","⏳",waiting,"#1d4ed8","#eff6ff"],["Em atendimento","🩺",attending,"#c2410c","#fff7ed"],["Total hoje","📋",sorted.length,"var(--text-2)","var(--surface-2)"]].map(([l,ic,v,color,bg])=>(
          <div key={l} className="card" style={{flex:"1 1 120px",padding:".75rem 1rem",background:bg,border:`1px solid ${bg==="var(--surface-2)"?"var(--border)":bg.replace("ff)","dd)")}}`}}>
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
            <div style={{fontWeight:600,fontSize:".9rem"}}>Nenhum paciente na fila</div>
            <button onClick={()=>setShowForm(true)} style={{marginTop:"1rem",fontSize:".8rem"}}>+ Dar entrada</button>
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
                    </div>
                    <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".15rem"}}>
                      Entrada: {fmtTime(q.arrivedAt)} · Aguardando: {waitMins(q.arrivedAt)}
                      {q.reason&&" · "+q.reason}
                    </div>
                  </div>
                  {!isDone&&(
                    <div style={{display:"flex",gap:".35rem",flexShrink:0}}>
                      {q.status==="waiting"&&<button onClick={()=>updateStatus(q.id,"attending")} style={{fontSize:".71rem",padding:".25rem .6rem",background:"var(--teal-600)",color:"#fff",border:"none",borderRadius:"var(--r-md)"}}>🩺 Chamar</button>}
                      {q.status==="attending"&&<button onClick={()=>updateStatus(q.id,"done")} style={{fontSize:".71rem",padding:".25rem .6rem",background:"#15803d",color:"#fff",border:"none",borderRadius:"var(--r-md)"}}>✓ Concluir</button>}
                      <button onClick={()=>removeFromQueue(q.id)} style={{fontSize:".71rem",padding:".25rem .5rem",background:"var(--surface)",border:"1px solid #fecdd3",borderRadius:"var(--r-md)",color:"#be123c"}}>✕</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add modal */}
      {showForm&&(
        <div className="modal-backdrop" onClick={()=>setShowForm(false)}>
          <div className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <h3 style={{margin:0}}>Dar entrada na fila</h3>
              <button className="icon-btn" onClick={()=>setShowForm(false)}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            <form onSubmit={addToQueue} style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Paciente *
                <select value={form.patientId} onChange={e=>setForm(s=>({...s,patientId:e.target.value}))}>
                  <option value="">Selecionar paciente...</option>
                  {[...patients].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(p=>(
                    <option key={p.id} value={p.id} disabled={alreadyInQueue.includes(p.id)}>{p.name}{alreadyInQueue.includes(p.id)?" (já na fila)":""}</option>
                  ))}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Prioridade
                <select value={form.priority} onChange={e=>setForm(s=>({...s,priority:e.target.value}))}>
                  {Object.entries(PRIORITY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
                Motivo / queixa principal
                <input value={form.reason} onChange={e=>setForm(s=>({...s,reason:e.target.value}))} placeholder="Dor de cabeça, retorno, renovação de receita..."/>
              </label>
              <div style={{display:"flex",gap:".5rem",marginTop:".25rem"}}>
                <button type="button" onClick={()=>setShowForm(false)} style={{flex:1,background:"var(--surface-2)",color:"var(--text-1)",border:"1px solid var(--border)"}}>Cancelar</button>
                <button type="submit" style={{flex:2}}>Confirmar entrada</button>
              </div>
            </form>
          </div>
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
      <section className="home-hero" style={{margin:"1.5rem 1.5rem .75rem"}}>
        <div><p className="home-kicker">Referência e Contrarreferência</p><h1 className="home-title">Encaminhamentos</h1><p className="home-sub">Controle de encaminhamentos para especialistas e serviços.</p></div>
        <button onClick={openNew} style={{flexShrink:0,display:"flex",alignItems:"center",gap:".4rem"}}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Novo encaminhamento
        </button>
      </section>

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
      <section className="home-hero" style={{margin:"1.5rem 1.5rem .75rem"}}>
        <div><p className="home-kicker">Gestão e Monitoramento</p><h1 className="home-title">Relatórios</h1><p className="home-sub">Indicadores operacionais e de saúde para prestação de contas.</p></div>
        <div style={{display:"flex",gap:".4rem",flexShrink:0}}>
          {[["month","Mês"],["quarter","Trimestre"],["year","Ano"]].map(([k,l])=>(
            <button key={k} onClick={()=>setPeriod(k)} style={{fontSize:".75rem",padding:".3rem .65rem",background:period===k?"var(--teal-600)":"var(--surface-2)",color:period===k?"#fff":"var(--text-2)",border:period===k?"none":"1px solid var(--border)"}}>
              {l}
            </button>
          ))}
          <button onClick={()=>window.print()} style={{fontSize:".75rem",padding:".3rem .65rem",marginLeft:".25rem"}}>🖨️ Exportar</button>
        </div>
      </section>

      {/* Sub tabs */}
      <div style={{display:"flex",gap:0,padding:"0 1.5rem",borderBottom:"1px solid var(--border)",marginBottom:"1rem"}}>
        {[["overview","Visão Geral"],["patients","Pacientes"],["production","Produção"],["pharmacy","Farmácia"],["esus","e-SUS / RNDS"]].map(([k,l])=>(
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
              <StatBox label="Encaminhamentos" value={referralsPeriod.length} color="#7e22ce" bg="#faf5ff" sub={`Pendentes: ${referralsPeriod.filter(r=>r.status==="pending").length}`}/>
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
      </div>
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
          <strong style={{color:"var(--text-2)"}}>⚠️ Importante:</strong> Este espelho é gerado automaticamente a partir dos dados registrados no SaudeUBS e serve como <strong>referência de apoio</strong> para o lançamento no e-SUS APS, RNDS e outros sistemas federais. Sempre confira os dados com a equipe antes do envio oficial.
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
    const lq=q.toLowerCase().replace(/[.\-\/]/g,"");
    return patients.filter(p=>{
      const name=p.name.toLowerCase();
      const cpf=String(p.cpf||"").replace(/\D/g,"");
      const cns=String(p.cns||"").replace(/\D/g,"");
      const phone=String(p.phone||"").replace(/\D/g,"");
      return name.includes(q.toLowerCase())||cpf.includes(lq)||cns.includes(lq)||phone.includes(lq);
    }).slice(0,8);
  },[q,patients]);

  function select(p) { onNavigate(p.id); setOpen(false); setQ(""); }

  return (
    <>
      <button onClick={()=>setOpen(true)} style={{display:"flex",alignItems:"center",gap:".5rem",padding:".35rem .75rem",borderRadius:"var(--r-md)",background:"var(--surface-2)",border:"1px solid var(--border)",cursor:"pointer",color:"var(--text-3)",fontSize:".78rem",minWidth:160}}>
        <IconSearch/> Buscar paciente…
        <span style={{marginLeft:"auto",fontSize:".65rem",background:"var(--surface-3)",padding:".1rem .3rem",borderRadius:4,color:"var(--text-3)"}}>⌘K</span>
      </button>
      {open&&(
        <div style={{position:"fixed",inset:0,zIndex:900,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"10vh",background:"rgba(15,23,42,.45)",backdropFilter:"blur(3px)"}} onClick={()=>setOpen(false)}>
          <div ref={ref} style={{width:"100%",maxWidth:520,background:"var(--surface)",borderRadius:"var(--r-lg)",boxShadow:"0 20px 60px rgba(0,0,0,.2)",border:"1px solid var(--border)",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:".75rem",padding:".85rem 1rem",borderBottom:"1px solid var(--border)"}}>
              <IconSearch/>
              <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Nome, CPF, CNS ou telefone…" style={{flex:1,border:"none",outline:"none",background:"transparent",fontSize:".92rem",color:"var(--ink)"}}/>
              <button className="icon-btn" onClick={()=>setOpen(false)}><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
            </div>
            {q.length>=2&&!results.length&&<p style={{padding:"1.5rem",textAlign:"center",color:"var(--text-3)",fontSize:".84rem"}}>Nenhum paciente encontrado.</p>}
            {results.map(p=>{
              const g=gestationalAgeInfo(p);
              return(
                <button key={p.id} onClick={()=>select(p)} style={{display:"flex",alignItems:"center",gap:".75rem",width:"100%",padding:".75rem 1rem",border:"none",background:"transparent",cursor:"pointer",textAlign:"left",borderBottom:"1px solid var(--border-soft)"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--surface-2)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div className="user-avatar" style={{width:34,height:34,fontSize:".8rem",flexShrink:0}}>{initials(p.name)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:".88rem",color:"var(--ink)"}}>{p.name}</div>
                    <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".1rem"}}>
                      {p.cpf&&<span>CPF {p.cpf} · </span>}
                      <span>{templates.find(t=>t.category===p.careCategory)?.label||p.careCategory||"Geral"}</span>
                      {g&&<span> · IG {g.weeks}s{g.days}d</span>}
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
  // ── CRIANÇA ─────────────────────────────────────────────────────
  { id:"bcg",           name:"BCG",                        doses:1, doseLabel:"Dose única",  ageGroup:"Criança", ageMinMonths:0,   ageMaxMonths:1,   aliases:["bcg"] },
  { id:"hepb-rn",       name:"Hepatite B (RN)",            doses:1, doseLabel:"Ao nascer",   ageGroup:"Criança", ageMinMonths:0,   ageMaxMonths:1,   aliases:["hepatite b","hepb"] },
  { id:"penta-1",       name:"Pentavalente",               doses:3, doseLabel:"D1 (2m)",     ageGroup:"Criança", ageMinMonths:2,   ageMaxMonths:7,   aliases:["penta","pentavalente","dtphb"] },
  { id:"vip-1",         name:"VIP (Polio inativada)",      doses:4, doseLabel:"D1 (2m)",     ageGroup:"Criança", ageMinMonths:2,   ageMaxMonths:60,  aliases:["vip","polio inativada","poliomielite"] },
  { id:"vorh-1",        name:"Rotavírus (VORH)",           doses:2, doseLabel:"D1 (2m)",     ageGroup:"Criança", ageMinMonths:2,   ageMaxMonths:8,   aliases:["rota","rotavirus","vorh"] },
  { id:"pneumo10-1",    name:"Pneumocócica 10v",           doses:3, doseLabel:"D1 (2m)",     ageGroup:"Criança", ageMinMonths:2,   ageMaxMonths:15,  aliases:["pneumo 10","pneumococica 10","pneumo10"] },
  { id:"meningo-c-1",   name:"Meningocócica C",            doses:2, doseLabel:"D1 (3m)",     ageGroup:"Criança", ageMinMonths:3,   ageMaxMonths:15,  aliases:["meningo","meningococica c","meningococica"] },
  { id:"influenza-c",   name:"Influenza",                  doses:2, doseLabel:"D1 (6m)",     ageGroup:"Criança", ageMinMonths:6,   ageMaxMonths:72,  aliases:["influenza","gripe"] },
  { id:"covid-c",       name:"COVID-19 (Pfizer Baby)",     doses:3, doseLabel:"D1 (6m)",     ageGroup:"Criança", ageMinMonths:6,   ageMaxMonths:60,  aliases:["covid","covid-19","pfizer baby"] },
  { id:"fa-c",          name:"Febre Amarela",              doses:2, doseLabel:"D1 (9m)",     ageGroup:"Criança", ageMinMonths:9,   ageMaxMonths:60,  aliases:["febre amarela"] },
  { id:"scr-1",         name:"Tríplice Viral (SRC)",       doses:1, doseLabel:"D1 (9m)",     ageGroup:"Criança", ageMinMonths:9,   ageMaxMonths:15,  aliases:["triplice viral","src","scr","sarampo caxumba rubeola"] },
  { id:"hepa-c",        name:"Hepatite A",                 doses:1, doseLabel:"Dose única (12m)", ageGroup:"Criança", ageMinMonths:12, ageMaxMonths:24, aliases:["hepatite a","hepa"] },
  { id:"meningo-acwy",  name:"Meningocócica ACWY",         doses:1, doseLabel:"Reforço (12m)", ageGroup:"Criança", ageMinMonths:11, ageMaxMonths:15,  aliases:["acwy","meningococica acwy"] },
  { id:"dtp-1r",        name:"DTP — 1º Reforço",          doses:1, doseLabel:"1º reforço (15m)", ageGroup:"Criança", ageMinMonths:15, ageMaxMonths:24, aliases:["dtp","triple bacteriana"] },
  { id:"scrv",          name:"Tetra Viral (SCRV)",         doses:1, doseLabel:"Dose única (15m)", ageGroup:"Criança", ageMinMonths:15, ageMaxMonths:24, aliases:["tetra viral","scrv","sarampo caxumba rubeola varicela"] },
  { id:"varicela-2",    name:"Varicela — 2ª dose",        doses:1, doseLabel:"2ª dose (4a)", ageGroup:"Criança", ageMinMonths:48, ageMaxMonths:60,  aliases:["varicela","catapora"] },
  { id:"dtp-2r",        name:"DTP — 2º Reforço",          doses:1, doseLabel:"2º reforço (4a)", ageGroup:"Criança", ageMinMonths:48, ageMaxMonths:60, aliases:["dtp reforco","dtp 2"] },
  // ── ADOLESCENTE (9–19 anos) ─────────────────────────────────────
  { id:"hpv",           name:"HPV Quadrivalente",          doses:1, doseLabel:"Dose única (9–14a)", ageGroup:"Adolescente", ageMinMonths:108, ageMaxMonths:180, aliases:["hpv","papilomavirus"] },
  { id:"meningo-acwy-adol", name:"Meningocócica ACWY",     doses:1, doseLabel:"Dose única (11–14a)", ageGroup:"Adolescente", ageMinMonths:132, ageMaxMonths:180, aliases:["acwy","meningococica acwy"] },
  // ── ADULTO (20–59 anos) ─────────────────────────────────────────
  { id:"hepb-a",        name:"Hepatite B",                 doses:3, doseLabel:"3 doses",     ageGroup:"Adulto",  ageMinMonths:240, ageMaxMonths:719, aliases:["hepatite b","hepb"] },
  { id:"dt-a",          name:"Dupla Adulto (dT)",          doses:3, doseLabel:"3 doses ou reforço", ageGroup:"Adulto", ageMinMonths:240, ageMaxMonths:719, aliases:["dt","dupla adulto","difteria tetano"] },
  { id:"fa-a",          name:"Febre Amarela",              doses:1, doseLabel:"Dose única",   ageGroup:"Adulto",  ageMinMonths:240, ageMaxMonths:719, aliases:["febre amarela"] },
  { id:"scr-a",         name:"Tríplice Viral (SCR)",       doses:2, doseLabel:"2 doses (até 29a) / 1 dose (30–59a)", ageGroup:"Adulto", ageMinMonths:240, ageMaxMonths:719, aliases:["triplice viral","scr","src"] },
  // ── GESTANTE ────────────────────────────────────────────────────
  { id:"hepb-g",        name:"Hepatite B",                 doses:3, doseLabel:"3 doses",     ageGroup:"Gestante", ageMinMonths:0, ageMaxMonths:999, aliases:["hepatite b","hepb"] },
  { id:"dt-g",          name:"dT / dTpa",                  doses:1, doseLabel:"Doses/reforço", ageGroup:"Gestante", ageMinMonths:0, ageMaxMonths:999, aliases:["dt","dtpa","difteria tetano","dTpa"] },
  { id:"influenza-g",   name:"Influenza",                  doses:1, doseLabel:"1/gestação",   ageGroup:"Gestante", ageMinMonths:0, ageMaxMonths:999, aliases:["influenza","gripe"] },
  { id:"covid-g",       name:"COVID-19",                   doses:1, doseLabel:"1/gestação",   ageGroup:"Gestante", ageMinMonths:0, ageMaxMonths:999, aliases:["covid","covid-19"] },
  // ── IDOSO (60+) ──────────────────────────────────────────────────
  { id:"hepb-i",        name:"Hepatite B",                 doses:3, doseLabel:"3 doses",     ageGroup:"Idoso",   ageMinMonths:720, ageMaxMonths:null, aliases:["hepatite b","hepb"] },
  { id:"dt-i",          name:"Dupla Adulto (dT)",          doses:1, doseLabel:"Doses/reforço", ageGroup:"Idoso",  ageMinMonths:720, ageMaxMonths:null, aliases:["dt","dupla adulto","difteria tetano"] },
  { id:"influenza-i",   name:"Influenza",                  doses:1, doseLabel:"1 dose anual", ageGroup:"Idoso",   ageMinMonths:720, ageMaxMonths:null, aliases:["influenza","gripe"] },
  { id:"covid-i",       name:"COVID-19",                   doses:1, doseLabel:"1 dose + reforços", ageGroup:"Idoso", ageMinMonths:720, ageMaxMonths:null, aliases:["covid","covid-19"] },
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
  // Show all groups the person has passed through or is currently in
  const groupsToShow = [];
  const order = ["Criança","Adolescente","Adulto","Idoso"];
  const idx = order.indexOf(base);
  // Always show all groups up to and including current
  for (let i = 0; i <= idx; i++) groupsToShow.push(order[i]);
  // If child/adolescent, show future groups too (full lifetime calendar)
  // Actually: always show the FULL calendar for their trajectory
  // For a 0m baby: show Criança, Adolescente, Adulto, Idoso (full life)
  // This is "carteira de vacinas da vida" — show all they'll ever need
  return PNI_CALENDAR.filter(v =>
    groupsToShow.includes(v.ageGroup) &&
    v.ageGroup !== "Gestante" // condition vaccines shown separately
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

function vaccineApplied(vaccine, appliedList) {
  const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g," ").replace(/\s+/g," ").trim();
  return appliedList.some(a =>
    vaccine.aliases.some(alias => norm(a.title).includes(norm(alias)))
  );
}


/* ══════════════════════════════════════════════════════════════════
   PHARMACY — Controle de Farmácia da UBS
══════════════════════════════════════════════════════════════════ */

const PHARMACY_KEY  = "saudeubs_pharmacy_v1";
const PHARMA_LOG_KEY = "saudeubs_pharmalog_v1";
const PHARMA_AUTH_KEY = "saudeubs_pharmaauth_v1";

// Farmacêuticos cadastrados (em produção viria do backend)
const PHARMA_USERS = [
  { id: "ph1", name: "Ana (Administradora)", email: "ana@clinica.local", password: "123456", role: "pharmacist" },
  { id: "ph2", name: "Farmacêutico(a)",       email: "farmacia@ubs.local", password: "farmacia123", role: "pharmacist" },
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
function savePharmacyStock(stock) {
  try { localStorage.setItem(PHARMACY_KEY, JSON.stringify(stock)); } catch {}
}
function readPharmaLog() {
  try { const r = localStorage.getItem(PHARMA_LOG_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function savePharmaLog(log) {
  try { localStorage.setItem(PHARMA_LOG_KEY, JSON.stringify(log)); } catch {}
}
function readPharmaSession() {
  try { const r = localStorage.getItem(PHARMA_AUTH_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function savePharmaSession(s) {
  try { if(s) localStorage.setItem(PHARMA_AUTH_KEY, JSON.stringify(s)); else localStorage.removeItem(PHARMA_AUTH_KEY); } catch {}
}
function isAdminUser(user) {
  return String(user?.email||"").toLowerCase() === "ana@clinica.local";
}

const PHARMA_CATEGORIES = [
  "Todas","Analgésico","Anti-inflamatório","Antibiótico","Cardiovascular",
  "Diabetes","Saúde Mental","Respiratório","Alergia","Gestante",
  "Gastrointestinal","Soros","Suplemento",
];


/* ══════════════════════════════════════════════════════════════════
   CARTÃO DO PACIENTE — Resumo imprimível
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
                {patient.birthDate&&<span>Nasc.: {fmtDate(patient.birthDate)}</span>}
                {patient.cpf&&<span>CPF: {patient.cpf}</span>}
                {patient.cns&&<span>CNS: {patient.cns}</span>}
                {patient.sex&&<span>Sexo: {patient.sex}</span>}
              </div>
            </div>
            <div style={{textAlign:"right",fontSize:".72rem",color:"var(--text-3)"}}>
              <div style={{fontWeight:700,color:"var(--teal-600)",fontSize:".8rem"}}>{catName}</div>
              <div>ACS: {acsName}</div>
              {g&&<div style={{color:"var(--teal-700)",fontWeight:600}}>IG: {g.weeks}s{g.days}d ({g.source})</div>}
            </div>
          </div>

          {/* Grid de info */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1rem"}}>

            {/* Contato */}
            <div>
              <div style={{fontWeight:700,fontSize:".75rem",color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:".4rem"}}>Contato</div>
              <div style={{fontSize:".8rem",color:"var(--text-2)",display:"flex",flexDirection:"column",gap:".2rem"}}>
                {patient.phone&&<span>📱 {patient.phone}</span>}
                {patient.phoneAlt&&<span>📞 {patient.phoneAlt}</span>}
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

  function submit(e) {
    e.preventDefault();
    const u = PHARMA_USERS.find(u => u.email.toLowerCase()===email.toLowerCase().trim() && u.password===pw);
    if (!u) { setErr("E-mail ou senha incorretos."); return; }
    onLogin(u);
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
              <div style={{fontSize:".72rem",color:"var(--text-3)"}}>Somente farmacêuticos autorizados</div>
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
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••"/>
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
  const [pw, setPw]         = useState("");
  const [qty, setQty]       = useState(1);
  const [patient, setPatient] = useState("");
  const [prescriber, setPrescriber] = useState("");
  const [notes, setNotes]   = useState("");
  const [err, setErr]       = useState("");

  function submit(e) {
    e.preventDefault();
    if (!pw) { setErr("Digite sua senha para confirmar."); return; }
    const u = PHARMA_USERS.find(u => u.id === pharmaUser.id && u.password === pw);
    if (!u) { setErr("Senha incorreta."); return; }
    if (qty < 1 || qty > item.qty) { setErr(`Quantidade inválida (máx. ${item.qty}).`); return; }
    if (!patient.trim()) { setErr("Informe o nome do paciente."); return; }
    if (!prescriber.trim()) { setErr("Informe o nome do prescritor."); return; }
    onConfirm({ qty: Number(qty), patient: patient.trim(), prescriber: prescriber.trim(), notes: notes.trim() });
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
        <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:".65rem"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".65rem"}}>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Paciente *
              <input value={patient} onChange={e=>setPatient(e.target.value)} placeholder="Nome do paciente"/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Quantidade *
              <input type="number" min={1} max={item.qty} value={qty} onChange={e=>setQty(e.target.value)}/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Prescritor *
              <input value={prescriber} onChange={e=>setPrescriber(e.target.value)} placeholder="Dr(a). Nome"/>
            </label>
            <label style={{display:"flex",flexDirection:"column",gap:".2rem",fontSize:".78rem",fontWeight:600}}>
              Observações
              <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Posologia, lote..."/>
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

  function submit(e) {
    e.preventDefault();
    if (!pw) { setErr("Senha obrigatória para alterar estoque."); return; }
    const u = PHARMA_USERS.find(u => u.id === pharmaUser.id && u.password === pw);
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
  // Se o usuário logado já é farmacêutico ou admin, entra direto
  const autoUser = isAdminUser(user) ? PHARMA_USERS[0]
                 : (user?.role === "pharmacist" ? (PHARMA_USERS.find(p=>p.email===user.email)||PHARMA_USERS[1]) : null);
  const [pharmaUser, setPharmaUser] = useState(()=> {
    const s = readPharmaSession();
    if (s) return s;
    if (autoUser) return autoUser;
    return null;
  });
  // Outros perfis veem tela de acesso negado
  const isBlockedRole = !isAdminUser(user) && user?.role !== "pharmacist";
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
    const newLog = [{ ...entry, id: Date.now().toString(), ts: new Date().toISOString(), pharma: pharmaUser?.name || "?" }, ...log];
    setLog(newLog);
    savePharmaLog(newLog);
  }

  function handleDispense({ qty, patient, prescriber, notes }) {
    const newStock = stock.map(s =>
      s.id === dispenseItem.id ? { ...s, qty: s.qty - qty } : s
    );
    setStock(newStock);
    savePharmacyStock(newStock);
    addLogEntry({
      type: "dispensa",
      itemId: dispenseItem.id,
      itemName: dispenseItem.name,
      qty, patient, prescriber, notes,
    });
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
    } else if (mode === "add") {
      const newItem = { ...form, id: "s" + Date.now(), qty: Number(form.qty), minQty: Number(form.minQty) };
      const newStock = [...stock, newItem];
      setStock(newStock);
      savePharmacyStock(newStock);
      addLogEntry({ type:"cadastro", itemName:form.name, qty:Number(form.qty) });
    } else {
      const newStock = stock.map(s => s.id === editItem.item.id ? { ...s, ...form, qty:Number(form.qty), minQty:Number(form.minQty) } : s);
      setStock(newStock);
      savePharmacyStock(newStock);
      addLogEntry({ type:"edicao", itemName:form.name });
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

  // Acesso bloqueado para não-farmacêuticos
  if (isBlockedRole) {
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:"1rem",color:"var(--text-3)",textAlign:"center",padding:"3rem"}}>
        <div style={{width:64,height:64,borderRadius:16,background:"#fff1f2",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:".5rem"}}>
          <svg width="28" height="28" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="1.5" stroke="#be123c" strokeWidth="1.4"/><path d="M5 7V5a3 3 0 016 0v2" stroke="#be123c" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="11" r="1" fill="#be123c"/></svg>
        </div>
        <div style={{fontWeight:700,fontSize:"1.05rem",color:"#be123c"}}>Acesso Restrito</div>
        <div style={{fontSize:".85rem",maxWidth:320,color:"var(--text-2)",lineHeight:1.6}}>
          A Farmácia é acessível somente a <strong>farmacêuticos autorizados</strong>.<br/>
          Entre em contato com a administração para solicitar acesso.
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Header */}
      <section className="home-hero" style={{margin:"1.5rem 1.5rem .75rem"}}>
        <div style={{flex:1}}>
          <p className="home-kicker">Gestão de Medicamentos</p>
          <h1 className="home-title">Farmácia UBS</h1>
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
          { label:"Total de itens", value:totalItems, icon:"📦", color:"var(--teal-600)" },
          { label:"Estoque baixo",  value:lowStock.length, icon:"⚠️", color:lowStock.length>0?"var(--amber-600)":"var(--text-3)", warn:lowStock.length>0 },
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
                {showLowOnly?"⚠️ Só baixo":"⚠️ Filtrar baixo"}
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
                                title="Dispensar"
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
            <div style={{marginBottom:"1rem"}}>
              <div style={{position:"relative",maxWidth:380}}>
                <span style={{position:"absolute",left:".6rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)"}}>
                  <IconSearch/>
                </span>
                <input value={logSearch} onChange={e=>setLogSearch(e.target.value)}
                  placeholder="Buscar por medicamento, paciente..."
                  style={{paddingLeft:"1.8rem",width:"100%",boxSizing:"border-box"}}/>
              </div>
            </div>
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <table className="patients-table" style={{width:"100%"}}>
                <thead>
                  <tr>
                    <th style={{width:130}}>Data / hora</th>
                    <th style={{width:100}}>Tipo</th>
                    <th>Medicamento</th>
                    <th>Detalhe</th>
                    <th>Farmacêutico</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.length === 0 && (
                    <tr><td colSpan={5} style={{textAlign:"center",padding:"2rem",color:"var(--text-3)",fontSize:".84rem"}}>Nenhuma movimentação registrada.</td></tr>
                  )}
                  {filteredLog.map(l => (
                    <tr key={l.id}>
                      <td style={{fontSize:".75rem",color:"var(--text-3)",whiteSpace:"nowrap"}}>{fmtTs(l.ts)}</td>
                      <td>{logTypeBadge(l.type)}</td>
                      <td>
                        <div style={{fontWeight:600,fontSize:".82rem"}}>{l.itemName}</div>
                      </td>
                      <td style={{fontSize:".78rem",color:"var(--text-2)"}}>
                        {l.type==="dispensa" && <>
                          <span style={{fontWeight:600}}>{l.qty}x</span> → <span style={{fontWeight:600}}>{l.patient}</span>
                          {l.prescriber && <span style={{color:"var(--text-3)"}}> · Rx: {l.prescriber}</span>}
                          {l.notes && <span style={{color:"var(--text-3)"}}> · {l.notes}</span>}
                        </>}
                        {l.type==="ajuste" && <>
                          <span style={{fontWeight:600,color:l.delta>=0?"#15803d":"#be123c"}}>{l.delta>=0?"+":""}{l.delta}</span>
                          {l.reason && <span style={{color:"var(--text-3)"}}> · {l.reason}</span>}
                        </>}
                        {l.type==="cadastro" && <span>Estoque inicial: {l.qty}</span>}
                        {l.type==="edicao" && <span>Dados atualizados</span>}
                      </td>
                      <td style={{fontSize:".78rem",color:"var(--text-3)"}}>{l.pharma}</td>
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
function VaccinesPage({ patients, users, templates, token, canManageUser }) {
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
  let ageMonths = null, ageGroup = "Adulto", lifeVaccines = [], condVaccines = [];
  if (selectedPatient) {
    ageMonths    = ageInMonths(selectedPatient.birthDate);
    ageGroup     = getAgeGroup(ageMonths, selectedPatient.careCategory);
    lifeVaccines = getAllLifetimeVaccines(ageMonths);
    condVaccines = getConditionVaccines(selectedPatient.careCategory);
  }
  const lifePending = lifeVaccines.filter(v => !vaccineApplied(v, appliedList));
  const lifeDone    = lifeVaccines.filter(v =>  vaccineApplied(v, appliedList));
  const condPending = condVaccines.filter(v => !vaccineApplied(v, appliedList));
  const condDone    = condVaccines.filter(v =>  vaccineApplied(v, appliedList));
  const totalPending = lifePending.length + condPending.length;

  const filtered = patients.filter(p => {
    if (!search.trim()) return true;
    return p.name.toLowerCase().includes(search.trim().toLowerCase());
  });

  const gc = AGE_GROUP_COLOR[ageGroup] || AGE_GROUP_COLOR["Adulto"];

  // Acesso bloqueado para não-farmacêuticos
  if (isBlockedRole) {
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:"1rem",color:"var(--text-3)",textAlign:"center",padding:"3rem"}}>
        <div style={{width:64,height:64,borderRadius:16,background:"#fff1f2",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:".5rem"}}>
          <svg width="28" height="28" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="1.5" stroke="#be123c" strokeWidth="1.4"/><path d="M5 7V5a3 3 0 016 0v2" stroke="#be123c" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="11" r="1" fill="#be123c"/></svg>
        </div>
        <div style={{fontWeight:700,fontSize:"1.05rem",color:"#be123c"}}>Acesso Restrito</div>
        <div style={{fontSize:".85rem",maxWidth:320,color:"var(--text-2)",lineHeight:1.6}}>
          A Farmácia é acessível somente a <strong>farmacêuticos autorizados</strong>.<br/>
          Entre em contato com a administração para solicitar acesso.
        </div>
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Header */}
      <section className="home-hero" style={{margin:"1.5rem 1.5rem .75rem"}}>
        <div>
          <p className="home-kicker">Calendário Nacional de Vacinação</p>
          <h1 className="home-title">Carteira de Vacinas</h1>
          <p className="home-sub">Indicações baseadas no Calendário Nacional de Vacinação — Ministério da Saúde.</p>
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
                          cursor:"pointer",textAlign:"left",transition:"background .12s"}}>
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
                      {applying?"Cancelar":"+ Registrar vacina"}
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
                      <button type="submit" disabled={applyBusy}>{applyBusy?"Salvando...":"Registrar"}</button>
                    </form>
                  </div>
                )}

                {card?.loading
                  ? <p style={{padding:"2rem",textAlign:"center",color:"var(--text-3)",fontSize:".84rem"}}>Carregando...</p>
                  : (
                    <div style={{padding:"1rem 1.1rem",display:"flex",flexDirection:"column",gap:"1.5rem"}}>

                      {lifeVaccines.length === 0 && condVaccines.length === 0 && (
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
                                      const applied = vaccineApplied(v, appliedList);
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
                                const applied = vaccineApplied(v, appliedList);
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
                            <Chip tone={item?.risk?.level==="high"?"danger":"warn"}>{String(item?.risk?.level||"-").toUpperCase()} • {item?.risk?.score||0}pts</Chip>
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
      <div className="card">
        <SectionHeader
          title={title}
          count={users.length}
          action={isManagerUser&&<button onClick={onEdit(null)}>+ Novo</button>}
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PROTOCOLS TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MODALS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MAIN APP
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export function App() {
  const session = useMemo(()=>readSession(),[]);
  const uiState = useMemo(()=>readUiState(),[]);

  const [token,  setToken]  = useState(String(session?.token||""));
  const [user,   setUser]   = useState(session?.user||null);
  const [patients,  setPatients]  = useState([]);
  const [users,     setUsers]     = useState([]);
  const [templates, setTemplates] = useState([]);
  const [protocolByPatient, setProtocolByPatient] = useState({});
  const [tab,  setTab]  = useState(uiState?.tab||"dashboard");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [patientTab, setPatientTab] = useState(uiState?.patientTab==="history"?"chart":(uiState?.patientTab||"protocol"));
  const [appointments, setAppointments] = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const [messages, setMessages] = useState([]);
  const [history,  setHistory]  = useState([]);
  const [patientProtocolSummary, setPatientProtocolSummary] = useState(null);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  const [publicTeams,  setPublicTeams]  = useState([]);
  const [query,          setQuery]          = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [acsFilter,      setAcsFilter]      = useState("");
  const [editingPatient, setEditingPatient] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [viewPatient, setViewPatient] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [form,     setForm]     = useState(emptyPatientForm);
  const [recordForm, setRecordForm] = useState({type:"consultation",title:"",date:"",details:""});
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
  const sortedSpecialAlerts = useMemo(()=>{
    const rank={high:0,medium:1,low:2};
    return [...deriveProtocolAlerts(patientProtocolSummary)].sort((a,b)=>{
      const ra=rank[String(a?.severity||"").toLowerCase()]??3, rb=rank[String(b?.severity||"").toLowerCase()]??3;
      return ra!==rb?ra-rb:String(a?.title||"").localeCompare(String(b?.title||""),"pt-BR");
    });
  },[patientProtocolSummary]);

  useEffect(()=>{ if(token) loadAll(); },[token]);
  useEffect(()=>{
    listPublicTeams().then(arr=>{ const a=Array.isArray(arr)?arr:[]; setPublicTeams(a); }).catch(()=>setPublicTeams([]));
  },[token]);
  useEffect(()=>{ localStorage.setItem(UI_STATE_KEY,JSON.stringify({tab,patientTab})); },[tab,patientTab]);
  useEffect(()=>{
    if(!token||!selectedPatientId){setAppointments([]);setTasks([]);setMessages([]);setHistory([]);setPatientProtocolSummary(null);return;}
    loadSelectedPatientData(selectedPatientId);
  },[token,selectedPatientId]);

  /* â”€â”€ Auth handlers â”€â”€ */
  async function handleLogin(email,password) {
    setError(""); setBusy(true);
    try {
      const payload=await login(email.trim(),password);
      if(payload?.twoFactorRequired) throw new Error("2FA ativo: tela React ainda não implementa desafio.");
      setToken(payload.token); setUser(payload.user);
      localStorage.setItem(SESSION_KEY,JSON.stringify({token:payload.token,user:payload.user}));
    } catch(_backendErr) {
      // Fallback: usuários locais (recepção e farmácia)
      const em = email.trim().toLowerCase();
      const found = [...RECEPTION_USERS, ...PHARMA_USERS]
        .find(u => u.email.toLowerCase()===em && u.password===password);
      if (found) {
        const fakeToken = "local_" + found.id;
        setToken(fakeToken); setUser(found);
        localStorage.setItem(SESSION_KEY, JSON.stringify({token:String(fakeToken), user:found}));
      } else {
        setError("E-mail ou senha incorretos.");
      }
    } finally { setBusy(false); }
  }

  async function handleRegister(reg) {
    setError(""); setBusy(true);
    try {
      const payload=await register({name:reg.name.trim(),email:reg.email.trim(),password:reg.password,role:reg.role,teamId:reg.teamId,councilNumber:onlyDigits(reg.councilNumber),councilUf:String(reg.councilUf||"").toUpperCase()});
      setToken(payload.token); setUser(payload.user);
      localStorage.setItem(SESSION_KEY,JSON.stringify({token:payload.token,user:payload.user}));
    } catch(e){ setError(e.message||"Falha no cadastro"); } finally{ setBusy(false); }
  }

  /* â”€â”€ Data â”€â”€ */
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
      if(pts.length){
        const sums=await getProtocolSummaries(token,pts.map(p=>p.id).filter(Boolean));
        setProtocolByPatient(sums?.summaries||{});
      } else setProtocolByPatient({});
    } catch(e){ setError(e.message||"Falha ao carregar dados"); } finally{ setBusy(false); }
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
    } catch(e){ setError(e.message||"Falha ao carregar dados do paciente"); }
  }

  function logout() {
    setToken(""); setUser(null); setPatients([]); setUsers([]); setTemplates([]); setProtocolByPatient({}); setSelectedPatientId("");
    localStorage.removeItem(SESSION_KEY); localStorage.removeItem(UI_STATE_KEY); localStorage.removeItem(RECEPTION_KEY);
  }

  /* â”€â”€ Patient handlers â”€â”€ */
  function openEditPatient(p) {
    return ()=>{
      setEditingPatient(p);
      setForm(p?{name:String(p?.name||""),motherName:String(p?.motherName||""),cpf:String(p?.cpf||""),cns:String(p?.cns||""),birthDate:String(p?.birthDate||""),phone:String(p?.phone||""),phoneAlt:String(p?.phoneAlt||""),careCategory:String(p?.careCategory||"general"),assignedAcsId:String(p?.assignedAcsId||""),zipCode:String(p?.zipCode||""),address:String(p?.address||""),number:String(p?.number||""),complement:String(p?.complement||""),neighborhood:String(p?.neighborhood||""),city:String(p?.city||""),state:String(p?.state||""),sex:String(p?.sex||""),maritalStatus:String(p?.maritalStatus||""),allergies:String(p?.allergies||""),comorbidities:String(p?.comorbidities||""),medications:String(p?.medications||""),pregnancyStartDate:String(p?.pregnancyStartDate||""),expectedDeliveryDate:String(p?.expectedDeliveryDate||""),gestationalAgeDumWeeks:String(p?.gestationalAgeDumWeeks??""),gestationalAgeDumDays:String(p?.gestationalAgeDumDays??""),gestationalAgeUsgWeeks:String(p?.gestationalAgeUsgWeeks??""),gestationalAgeUsgDays:String(p?.gestationalAgeUsgDays??""),usgDate1:String(p?.usgDate1||""),usgDate2:String(p?.usgDate2||""),usgDate3:String(p?.usgDate3||"")}:emptyPatientForm());
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
      const payload={name:form.name.trim(),motherName:form.motherName.trim(),cpf:form.cpf.trim(),cns:form.cns.trim(),birthDate:form.birthDate||"",phone:form.phone.trim(),phoneAlt:form.phoneAlt.trim(),careCategory:form.careCategory||"general",assignedAcsId:form.assignedAcsId||"",zipCode:form.zipCode.trim(),address:form.address.trim(),number:form.number.trim(),complement:form.complement.trim(),neighborhood:form.neighborhood.trim(),city:form.city.trim(),state:form.state.trim().toUpperCase(),sex:form.sex.trim(),maritalStatus:form.maritalStatus.trim(),allergies:form.allergies.trim(),comorbidities:form.comorbidities.trim(),medications:form.medications.trim(),pregnancyStartDate:form.pregnancyStartDate||"",expectedDeliveryDate:form.expectedDeliveryDate||"",gestationalAgeDumWeeks:form.gestationalAgeDumWeeks===""?null:Number(form.gestationalAgeDumWeeks),gestationalAgeDumDays:form.gestationalAgeDumDays===""?null:Number(form.gestationalAgeDumDays),gestationalAgeUsgWeeks:form.gestationalAgeUsgWeeks===""?null:Number(form.gestationalAgeUsgWeeks),gestationalAgeUsgDays:form.gestationalAgeUsgDays===""?null:Number(form.gestationalAgeUsgDays),usgDate1:form.usgDate1||"",usgDate2:form.usgDate2||"",usgDate3:form.usgDate3||""};
      editingPatient?.id?await updatePatient(token,editingPatient.id,payload):await createPatient(token,payload);
      setShowModal(false); await loadAll();
    } catch(e){ setError(e.message||"Erro ao salvar paciente"); } finally{ setBusy(false); }
  }

  async function removePatient(p) {
    if(!token||!p||!confirm(`Excluir '${p.name}'?`)) return;
    setBusy(true); setError("");
    try { await deletePatient(token,p.id); if(selectedPatientId===p.id) setSelectedPatientId(""); await loadAll(); }
    catch(e){ setError(e.message||"Erro ao excluir"); } finally{ setBusy(false); }
  }

  /* â”€â”€ User handlers â”€â”€ */
  function openEditUser(u) {
    return ()=>{
      setEditingUser(u);
      setUserForm(u?{role:u?.role==="doctor"?"doctor":"acs",name:String(u?.name||""),email:String(u?.email||""),password:"",councilNumber:String(u?.councilNumber||""),councilUf:String(u?.councilUf||"")}:{role:"acs",name:"",email:"",password:"",councilNumber:"",councilUf:""});
      setShowUserModal(true);
    };
  }

  async function submitUser(e) {
    e.preventDefault(); if(!token||!isManager(user)) return;
    if(!userForm.name.trim()||!userForm.email.trim()){setError("Nome e e-mail são obrigatórios.");return;}
    if(!editingUser&&!userForm.password.trim()){setError("Senha obrigatória.");return;}
    setBusy(true); setError("");
    try {
      const payload={role:userForm.role,name:userForm.name.trim(),email:userForm.email.trim(),...(userForm.password.trim()?{password:userForm.password.trim()}:{}),...(userForm.role==="doctor"?{councilNumber:userForm.councilNumber.trim(),councilUf:userForm.councilUf.trim().toUpperCase()}:{})};
      editingUser?.id?await updateUser(token,editingUser.id,payload):await createUser(token,payload);
      setShowUserModal(false); await loadAll();
    } catch(e){ setError(e.message||"Erro ao salvar usuário"); } finally{ setBusy(false); }
  }

  async function removeUser(u) {
    if(!token||!isManager(user)||!u?.id) return;
    if(u.id===user.id){setError("Não é possível excluir sua própria conta.");return;}
    setBusy(true); setError("");
    try {
      const usage=await getUserUsage(token,u.id);
      if(!usage?.canDelete) throw new Error(`Vínculos ativos impedem a exclusão (pacientes=${usage.assignedPatients||0}, tarefas=${usage.openTasksAssigned||0}).`);
      if(!confirm(`Excluir '${u.name}'?`)) return;
      await deleteUser(token,u.id); await loadAll();
    } catch(e){ setError(e.message||"Erro ao excluir"); } finally{ setBusy(false); }
  }

  /* â”€â”€ Template handlers â”€â”€ */
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
    } catch(e){ setError(e.message||"Erro ao salvar protocolo"); } finally{ setBusy(false); }
  }

  async function removeTemplate(t) {
    if(!token||!canManage(user)||!t?.category||!confirm(`Excluir '${t.label||t.category}'?`)) return;
    setBusy(true); setError("");
    try { await deleteProtocolTemplate(token,t.category); await loadAll(); }
    catch(e){ setError(e.message||"Erro ao excluir"); } finally{ setBusy(false); }
  }

  /* â”€â”€ AI â”€â”€ */
  async function loadAiPriorities(){if(!token)return;setBusy(true);setError("");try{setAiView("priorities");setAiData(await aiTeamPriorities(token));}catch(e){setError(e.message||"Erro");}finally{setBusy(false);}}
  async function loadAiQuality(){if(!token)return;setBusy(true);setError("");try{setAiView("quality");setAiData(await aiTeamDataQuality(token));}catch(e){setError(e.message||"Erro");}finally{setBusy(false);}}
  async function loadAiReport(){if(!token)return;setBusy(true);setError("");try{setAiView("report");setAiData(await aiTeamReport(token));}catch(e){setError(e.message||"Erro");}finally{setBusy(false);}}
  async function submitAiQuestion(e){e.preventDefault();if(!token||!aiQuestion.trim())return;setBusy(true);setError("");try{setAiView("chat");setAiData(await aiTeamAsk(token,aiQuestion.trim()));}catch(e2){setError(e2.message||"Erro");}finally{setBusy(false);}}

  /* â”€â”€ Record / Appointment / Task / Message â”€â”€ */
  async function submitRecord(e) {
    e.preventDefault(); if(!selectedPatientId) return;
    const type=isAcs(user)?"visit":recordForm.type, title=isAcs(user)?"Visita ACS":recordForm.title;
    if(!type||!recordForm.date||(type!=="vaccine"&&!title)){setError("Preencha tipo, data e título.");return;}
    if(type==="vaccine"&&!recordVaccines.length){setError("Selecione ao menos uma vacina.");return;}
    try {
      if(type==="vaccine"){
        for(const vaccine of recordVaccines)
          await createRecord(token,selectedPatientId,{type:"vaccine",date:recordForm.date,title:vaccine,details:recordForm.details});
      } else {
        await createRecord(token,selectedPatientId,{type,date:recordForm.date,title,details:recordForm.details});
      }
      setRecordForm({type:isAcs(user)?"visit":"consultation",title:isAcs(user)?"Visita ACS":"",date:"",details:""});
      setRecordVaccines([]); await loadSelectedPatientData(selectedPatientId); await loadAll();
    } catch(e){setError(e.message||"Erro ao criar registro");}
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
    } catch(e){setError(e.message||"Erro ao registrar atendimento");}
  }

  async function submitTask(e) {
    e.preventDefault(); if(!selectedPatientId) return;
    if(!taskForm.title){setError("Título obrigatório.");return;}
    try {
      await createTask(token,{patientId:selectedPatientId,assigneeId:taskForm.assigneeId||"",title:taskForm.title,notes:taskForm.notes,dueDate:taskForm.dueDate});
      setTaskForm({title:"",notes:"",dueDate:"",assigneeId:""});
      await loadSelectedPatientData(selectedPatientId); await loadAll();
    } catch(e){setError(e.message||"Erro ao criar tarefa");}
  }

  async function submitMessage(e) {
    e.preventDefault(); if(!selectedPatientId||!messageText.trim()) return;
    try { await sendMessage(token,selectedPatientId,messageText.trim()); setMessageText(""); await loadSelectedPatientData(selectedPatientId); }
    catch(e){setError(e.message||"Erro ao enviar mensagem");}
  }

  async function handleDeleteRecord(recordId) {
    await deleteRecord(token,selectedPatientId,recordId);
    await loadSelectedPatientData(selectedPatientId); await loadAll();
  }

  async function handleDeleteAppointment(apptId) {
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
          onLogout={()=>{ setToken(""); setUser(null); setPatients([]); localStorage.removeItem(SESSION_KEY); localStorage.removeItem(RECEPTION_KEY); }}/>
      </div>
    );
  }

  // Farmacêutico, enfermeira, médico, ACS, téc. enf., admin → app clínico
  // buildNavItems limita o menu conforme o perfil

  const catOpts=templates.map(t=>({value:t.category,label:t.label}));

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
      let updated;
      try {
        updated = await patchMeRequest(token, payload);
      } catch {
        updated = await updateUser(token, user.id, payload);
      }
      const newUser = { ...user, ...payload, ...(updated?.user || updated || {}) };
      setUser(newUser);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user: newUser }));
      setShowProfileModal(false);
    } catch (err) {
      setProfileError(err.message || "Erro ao salvar perfil.");
    } finally {
      setProfileBusy(false);
    }
  }

  return (
    <main className="app">
      <Topbar
        user={user} selectedPatient={selectedPatient} templates={templates}
        mobileOpen={mobileNavOpen} setMobileOpen={setMobileNavOpen}
        onLogout={logout} onOpenProfile={openProfile}
        patients={patients} protocolByPatient={protocolByPatient}
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
        />

        <section className="main-area">
          {error&&<div className="error" style={{margin:"1rem 2rem 0"}}>{error}<button className="icon-btn" style={{marginLeft:".5rem"}} onClick={()=>setError("")}><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button></div>}

          {tab==="dashboard"&&<Dashboard patients={patients} users={users} templates={templates} protocolByPatient={protocolByPatient} onNavigate={(id)=>{ setTab("patients"); setSelectedPatientId(id); }} setTab={setTab}/>}

          {tab==="queue"&&<QueuePage patients={patients} users={users} user={user}/>}
          {tab==="agenda"&&<AgendaPage patients={patients} users={users} user={user}/>}
          {tab==="referrals"&&<ReferralsPage patients={patients} users={users} user={user}/>}
          {tab==="reports"&&<ReportsPage patients={patients} users={users} templates={templates} protocolByPatient={protocolByPatient}/>}

          {tab==="patients"&&(
            <PatientsTab
              patients={patients} users={users} templates={templates} protocolByPatient={protocolByPatient}
              query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
              acsFilter={acsFilter} setAcsFilter={setAcsFilter}
              selectedPatientId={selectedPatientId} setSelectedPatientId={setSelectedPatientId}
              canManageUser={canManage(user)} canWriteRecords={canWriteRecords(user)} onEdit={openEditPatient} onDelete={removePatient} onView={openViewPatient}
              patientTab={patientTab} setPatientTab={setPatientTab}
              appointments={appointments} tasks={tasks} messages={messages} history={history}
              patientProtocolSummary={patientProtocolSummary} sortedSpecialAlerts={sortedSpecialAlerts}
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
            <VaccinesPage patients={patients} users={users} templates={templates} token={token} canManageUser={canManage(user)}/>
          )}

          {tab==="pharmacy"&&(
            <PharmacyPage user={user}/>
          )}

          {tab==="ai"&&(
            <AiTab aiView={aiView} aiData={aiData} aiQuestion={aiQuestion} setAiQuestion={setAiQuestion}
              onPriorities={loadAiPriorities} onQuality={loadAiQuality} onReport={loadAiReport}
              onAsk={submitAiQuestion} busy={busy}/>
          )}

        </section>
      </div>

      {/* â”€â”€ Patient modal â”€â”€ */}
      {showModal&&(
        <div className="modal-backdrop" onClick={()=>setShowModal(false)}>
          <form className="modal patient-modal" onSubmit={submitPatient} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <h3>{editingPatient?"Editar paciente":"Novo paciente"}</h3>
              <button type="button" className="icon-btn" onClick={()=>setShowModal(false)}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div className="field-grid">
              {[["Nome","name","text"],["Data de nascimento","birthDate","date"],["CPF","cpf","text"],["CNS","cns","text"],["Telefone","phone","text"],["Telefone 2","phoneAlt","text"],["CEP","zipCode","text"],["Rua","address","text"],["Número","number","text"],["Complemento","complement","text"],["Bairro","neighborhood","text"],["Cidade","city","text"],["Estado (UF)","state","text"]].map(([label,field,type])=>(
                <label key={field}>
                  {label}
                  <input type={type} value={form[field]} onBlur={field==="zipCode"?lookupCepAndFillAddress:undefined} onChange={e=>{
                    let v=e.target.value;
                    if(field==="cpf") v=formatCpf(v);
                    else if(field==="phone"||field==="phoneAlt") v=formatPhone(v);
                    else if(field==="zipCode") v=formatCep(v);
                    else if(field==="cns") v=formatCns(v);
                    else if(field==="state") v=v.toUpperCase().slice(0,2);
                    setForm(s=>({...s,[field]:v}));
                  }}/>
                </label>
              ))}
              {isChildCategory(form.careCategory)&&(
                <label>Nome do responsável<input value={form.motherName} onChange={e=>setForm(s=>({...s,motherName:e.target.value}))}/></label>
              )}
              <label>Sexo<select value={form.sex} onChange={e=>setForm(s=>({...s,sex:e.target.value}))}><option value="">Não informado</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label>
              {!isChildCategory(form.careCategory)&&<label>Estado civil<input value={form.maritalStatus} onChange={e=>setForm(s=>({...s,maritalStatus:e.target.value}))}/></label>}
              <label>Categoria<select value={form.careCategory} onChange={e=>setForm(s=>({...s,careCategory:e.target.value}))}>{catOpts.length?catOpts.map(c=><option key={c.value} value={c.value}>{c.label}</option>):<option value="general">Geral</option>}</select></label>
              {String(form.careCategory||"").toLowerCase()==="pregnant"&&<>
                <label>DUM<input type="date" value={form.pregnancyStartDate} onChange={e=>setForm(s=>({...s,pregnancyStartDate:e.target.value}))}/></label>
                <label>DPP<input type="date" value={form.expectedDeliveryDate} onChange={e=>setForm(s=>({...s,expectedDeliveryDate:e.target.value}))}/></label>
                <label>IG DUM (sem)<input type="number" min="0" max="45" value={form.gestationalAgeDumWeeks} onChange={e=>setForm(s=>({...s,gestationalAgeDumWeeks:e.target.value}))}/></label>
                <label>IG DUM (dias)<input type="number" min="0" max="6" value={form.gestationalAgeDumDays} onChange={e=>setForm(s=>({...s,gestationalAgeDumDays:e.target.value}))}/></label>
                <label>Data 1ª USG<input type="date" value={form.usgDate1} onChange={e=>setForm(s=>({...s,usgDate1:e.target.value}))}/></label>
                <label>IG USG (sem)<input type="number" min="0" max="45" value={form.gestationalAgeUsgWeeks} onChange={e=>setForm(s=>({...s,gestationalAgeUsgWeeks:e.target.value}))}/></label>
                <label>IG USG (dias)<input type="number" min="0" max="6" value={form.gestationalAgeUsgDays} onChange={e=>setForm(s=>({...s,gestationalAgeUsgDays:e.target.value}))}/></label>
                <label>Data 2ª USG<input type="date" value={form.usgDate2} onChange={e=>setForm(s=>({...s,usgDate2:e.target.value}))}/></label>
                <label>Data 3ª USG<input type="date" value={form.usgDate3} onChange={e=>setForm(s=>({...s,usgDate3:e.target.value}))}/></label>
              </>}
              <label>ACS responsável<select value={form.assignedAcsId} onChange={e=>setForm(s=>({...s,assignedAcsId:e.target.value}))}><option value="">Não atribuído</option>{users.filter(u=>u.role==="acs").map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
              <label className="field-span-2">Alergias<textarea value={form.allergies} onChange={e=>setForm(s=>({...s,allergies:e.target.value}))} style={{minHeight:56}}/></label>
              <label className="field-span-2">Comorbidades<textarea value={form.comorbidities} onChange={e=>setForm(s=>({...s,comorbidities:e.target.value}))} style={{minHeight:56}}/></label>
              <label className="field-span-2">Medicamentos em uso<textarea value={form.medications} onChange={e=>setForm(s=>({...s,medications:e.target.value}))} style={{minHeight:56}}/></label>
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
            {[["Nome",viewPatient.name],["Data de nascimento",fmtDate(viewPatient.birthDate)],["CPF",viewPatient.cpf],["CNS",viewPatient.cns],["Telefone",viewPatient.phone],["Telefone 2",viewPatient.phoneAlt],["CEP",viewPatient.zipCode],["Rua",viewPatient.address],["Número",viewPatient.number],["Complemento",viewPatient.complement],["Bairro",viewPatient.neighborhood],["Cidade",viewPatient.city],["Estado (UF)",viewPatient.state],["Categoria",catLabel(templates,viewPatient.careCategory)],["Sexo",viewPatient.sex],["Estado civil",viewPatient.maritalStatus],["Nome do responsável",viewPatient.motherName],["Alergias",viewPatient.allergies],["Comorbidades",viewPatient.comorbidities],["Medicamentos em uso",viewPatient.medications]].map(([label,val])=>(
              <label key={String(label)} className={["Alergias","Comorbidades","Medicamentos em uso"].includes(String(label))?"field-span-2":""}>
                {label}
                <input value={String(val||"-")} disabled />
              </label>
            ))}
          </div>
        </Modal>
      )}

      {/* â”€â”€ User modal â”€â”€ */}
      {showUserModal&&(
        <Modal title={editingUser?"Editar usuário":"Novo usuário"} onClose={()=>setShowUserModal(false)}>
          <form onSubmit={submitUser} style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
            <label>Perfil<select value={userForm.role} disabled={Boolean(editingUser)} onChange={e=>setUserForm(s=>({...s,role:e.target.value}))}><option value="acs">ACS</option><option value="nursing_tech">Téc. de Enfermagem</option><option value="doctor">Médico(a)</option><option value="pharmacist">Farmacêutico(a)</option><option value="receptionist">Recepcionista</option></select></label>
            <label>Nome<input value={userForm.name} onChange={e=>setUserForm(s=>({...s,name:e.target.value}))}/></label>
            <label>E-mail<input type="email" value={userForm.email} onChange={e=>setUserForm(s=>({...s,email:e.target.value}))}/></label>
            <label>{editingUser?"Nova senha (opcional)":"Senha"}<input type="password" value={userForm.password} onChange={e=>setUserForm(s=>({...s,password:e.target.value}))}/></label>
            {userForm.role==="doctor"&&<>
              <label>Número do conselho<input value={userForm.councilNumber} onChange={e=>setUserForm(s=>({...s,councilNumber:onlyDigits(e.target.value).slice(0,12)}))}/></label>
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

      {/* â”€â”€ Template modal â”€â”€ */}
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

              {["nurse_manager","doctor"].includes(user?.role) && (
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

