import { useEffect, useMemo, useState } from "react";
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

/* â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const SESSION_KEY = "saudeubs_react_session";
const UI_STATE_KEY = "saudeubs_react_ui";

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
};

/* â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function readSession() {
  try { const r = localStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function readUiState() {
  try { const r = localStorage.getItem(UI_STATE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
function roleLabel(role) {
  return { nurse_manager: "Enfermeira", doctor: "Médico(a)", acs: "ACS" }[String(role||"").toLowerCase()] || role || "-";
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
function isAcs(user)     { return String(user?.role||"")==="acs"; }

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
                </select>
              </label>
              <label>Equipe
                <select value={reg.teamId} onChange={e=>setReg(s=>({...s,teamId:e.target.value}))}>
                  {publicTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
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
  const navItems = [
    { id: "dashboard", label: "Painel" },
    { id: "patients",  label: "Pacientes" },
    ...(canManageUser ? [{ id: "protocols", label: "Protocolos" }] : []),
    { id: "acs",     label: "ACS" },
    { id: "doctors", label: "Médicos" },
    { id: "ai",      label: "IA Assistida" },
  ];

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
              onClick={()=>{ setTab(item.id); setMobileOpen(false); }}>
              {NAV_ICON[item.id]}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer user */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-user">
            <div className="user-avatar" style={{width:28,height:28,fontSize:".72rem"}}>{initials(user?.name)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:".78rem",fontWeight:600,color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.name||"-"}</div>
              <div style={{fontSize:".68rem",color:"#64748b"}}>{roleLabel(user?.role)}</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   TOPBAR
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Topbar({ user, selectedPatient, templates, mobileOpen, setMobileOpen, onLogout }) {
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

      <div className="topbar-center">
        {selectedPatient && (
          <div className="topbar-patient-inline">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <span className="topbar-patient-name">{selectedPatient.name}</span>
            <span className="topbar-sep">•</span>
            <span>{catLabel(templates,selectedPatient.careCategory)}</span>
          </div>
        )}
      </div>

      <div className="topbar-right">
        <div className="topbar-user">
          <div className="user-avatar">{initials(user?.name)}</div>
          <div className="user-info">
            <span id="userName">{user?.name||"-"}</span>
            <span className="user-role">{roleLabel(user?.role)}{user?.teamName?` • ${user.teamName}`:""}</span>
          </div>
        </div>
        <button className="btn-ghost" onClick={onLogout}><IconSignOut/>Sair</button>
      </div>
    </header>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DASHBOARD
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Dashboard({ patients, users, templates, protocolByPatient }) {
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
                      <Chip tone="muted">{u.role==="acs"?"ACS":u.role==="doctor"?"Médico":"Enf."}</Chip>
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
function PatientsTab({ patients,users,templates,protocolByPatient,query,setQuery,categoryFilter,setCategoryFilter,acsFilter,setAcsFilter,selectedPatientId,setSelectedPatientId,canManageUser,onEdit,onDelete,patientTab,setPatientTab,appointments,tasks,messages,history,patientProtocolSummary,sortedSpecialAlerts,recordForm,setRecordForm,recordVaccines,setRecordVaccines,appointmentForm,setAppointmentForm,taskForm,setTaskForm,messageText,setMessageText,onSubmitRecord,onSubmitAppointment,onSubmitTask,onSubmitMessage,onDeleteRecord,onDeleteAppointment,onStatusChange,selectedPatient,userObj }) {
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
            acsUsers={users.filter(u=>u.role==="acs")} canManageUser={canManageUser} userObj={userObj}
          />
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PATIENT DETAIL (right panel)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function PatientDetail({ patient,users,templates,patientTab,setPatientTab,appointments,tasks,messages,history,patientProtocolSummary,sortedSpecialAlerts,recordForm,setRecordForm,recordVaccines,setRecordVaccines,appointmentForm,setAppointmentForm,taskForm,setTaskForm,messageText,setMessageText,onSubmitRecord,onSubmitAppointment,onSubmitTask,onSubmitMessage,onDeleteRecord,onDeleteAppointment,onStatusChange,acsUsers,canManageUser,userObj }) {
  const g = gestationalAgeInfo(patient);
  const acsName = users.find(u=>u.id===patient.assignedAcsId)?.name||"Não atribuído";

  const TABS = [
    {id:"protocol",label:"Protocolo",icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.4"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.4"/></svg>},
    {id:"followup",label:"Acompanhamento",icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>},
    {id:"chart",label:"Prontuário",icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 2h10v12H3z" stroke="currentColor" strokeWidth="1.3"/><path d="M5 5h6M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>},
    {id:"appointments",label:"Atendimentos",icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M5 2v3M11 2v3M2.5 6.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>},
    {id:"tasks",label:"Tarefas",icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>},
    {id:"messages",label:"Mensagens",icon:<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H9l-3 2v-2H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>},
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
      </div>

      {g && (
        <div style={{padding:".6rem 1.25rem",background:"var(--teal-50)",borderBottom:"1px solid var(--teal-100)",fontSize:".75rem",color:"var(--teal-700)",display:"flex",alignItems:"center",gap:".4rem"}}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
          IG estimada: <strong>{g.weeks}s {g.days}d</strong> (ref: {g.source})
        </div>
      )}

      {/* Tabs */}
      <div className="tabs small-tabs">
        {TABS.map(t=><button key={t.id} className={`tab${patientTab===t.id?" active":""}`} onClick={()=>setPatientTab(t.id)}><span className="tab-ico">{t.icon}</span>{t.label}</button>)}
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

        {/* â”€â”€ FOLLOW UP â”€â”€ */}
        {patientTab==="followup"&&(
          <div className="panel-block">
            <h4>Acompanhamento clínico</h4>
            <form className="inline-form" onSubmit={onSubmitRecord}>
              {isAcs(userObj) ? <input value="Visita ACS" disabled/> : (
                <select value={recordForm.type} onChange={e=>{ const t=e.target.value; setRecordForm(s=>({...s,type:t,title:t==="vaccine"?"":s.title})); if(t!=="vaccine") setRecordVaccines([]); }}>
                  <option value="visit">Visita domiciliar</option>
                  <option value="consultation">Consulta</option>
                  <option value="vaccine">Vacina</option>
                  <option value="procedure">Procedimento</option>
                  <option value="note">Observação</option>
                </select>
              )}
              <input type="date" value={recordForm.date} onChange={e=>setRecordForm(s=>({...s,date:e.target.value}))}/>
              {!isAcs(userObj)&&recordForm.type==="vaccine"
                ? <select multiple size={6} value={recordVaccines} onChange={e=>setRecordVaccines(Array.from(e.target.selectedOptions).map(o=>o.value))}>
                    {VACCINE_OPTIONS.map(v=><option key={v} value={v}>{v}</option>)}
                  </select>
                : <input placeholder="Título" value={isAcs(userObj)?"Visita ACS":recordForm.title} disabled={isAcs(userObj)} onChange={e=>setRecordForm(s=>({...s,title:e.target.value}))}/>
              }
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
            {canManageUser&&(
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
            {canManageUser&&(
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
                  return(
                    <div key={t.id} style={{padding:".7rem .85rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",marginBottom:".5rem"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:".3rem"}}>
                        <strong style={{fontSize:".83rem"}}>{t.title}</strong>
                        <Chip tone={tone}>{t.status==="done"?"Concluída":t.status==="in_progress"?"Em andamento":"Pendente"}</Chip>
                      </div>
                      {t.notes&&<p style={{fontSize:".78rem",color:"var(--text-2)",marginBottom:".3rem"}}>{t.notes}</p>}
                      {t.dueDate&&<p style={{fontSize:".72rem",color:"var(--text-3)"}}>Prazo: {fmtDate(t.dueDate)}</p>}
                      {canManageUser&&(
                        <select style={{marginTop:".4rem",fontSize:".78rem",padding:".3rem .6rem",width:"auto"}} value={t.status||"pending"} onChange={e=>onStatusChange(t.id,e.target.value)}>
                          <option value="pending">Pendente</option>
                          <option value="in_progress">Em andamento</option>
                          <option value="done">Concluída</option>
                        </select>
                      )}
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* â”€â”€ MESSAGES â”€â”€ */}
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
    </>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   AI TAB
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

  const [token,  setToken]  = useState(session?.token||"");
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
    } catch(e){ setError(e.message||"Falha no login"); } finally{ setBusy(false); }
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
    if(!token) return; setBusy(true); setError("");
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
    localStorage.removeItem(SESSION_KEY); localStorage.removeItem(UI_STATE_KEY);
  }

  /* â”€â”€ Patient handlers â”€â”€ */
  function openEditPatient(p) {
    return ()=>{
      setEditingPatient(p);
      setForm(p?{name:String(p?.name||""),motherName:String(p?.motherName||""),cpf:String(p?.cpf||""),cns:String(p?.cns||""),birthDate:String(p?.birthDate||""),phone:String(p?.phone||""),phoneAlt:String(p?.phoneAlt||""),careCategory:String(p?.careCategory||"general"),assignedAcsId:String(p?.assignedAcsId||""),zipCode:String(p?.zipCode||""),address:String(p?.address||""),number:String(p?.number||""),complement:String(p?.complement||""),neighborhood:String(p?.neighborhood||""),city:String(p?.city||""),state:String(p?.state||""),sex:String(p?.sex||""),maritalStatus:String(p?.maritalStatus||""),allergies:String(p?.allergies||""),comorbidities:String(p?.comorbidities||""),medications:String(p?.medications||""),pregnancyStartDate:String(p?.pregnancyStartDate||""),expectedDeliveryDate:String(p?.expectedDeliveryDate||""),gestationalAgeDumWeeks:String(p?.gestationalAgeDumWeeks??""),gestationalAgeDumDays:String(p?.gestationalAgeDumDays??""),gestationalAgeUsgWeeks:String(p?.gestationalAgeUsgWeeks??""),gestationalAgeUsgDays:String(p?.gestationalAgeUsgDays??""),usgDate1:String(p?.usgDate1||""),usgDate2:String(p?.usgDate2||""),usgDate3:String(p?.usgDate3||"")}:emptyPatientForm());
      setShowModal(true);
    };
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
      if(type==="vaccine"){for(const vaccine of recordVaccines) await createRecord(token,selectedPatientId,{type:"vaccine",date:recordForm.date,title:vaccine,details:recordForm.details});}
      else await createRecord(token,selectedPatientId,{type,date:recordForm.date,title,details:recordForm.details});
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

  /* â”€â”€ Auth guard â”€â”€ */
  if(!token||!user) {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} publicTeams={publicTeams} error={error} busy={busy}/>;
  }

  const catOpts=templates.map(t=>({value:t.category,label:t.label}));

  return (
    <main className="app">
      <Topbar
        user={user} selectedPatient={selectedPatient} templates={templates}
        mobileOpen={mobileNavOpen} setMobileOpen={setMobileNavOpen} onLogout={logout}
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

          {tab==="dashboard"&&<Dashboard patients={patients} users={users} templates={templates} protocolByPatient={protocolByPatient}/>}

          {tab==="patients"&&(
            <PatientsTab
              patients={patients} users={users} templates={templates} protocolByPatient={protocolByPatient}
              query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
              acsFilter={acsFilter} setAcsFilter={setAcsFilter}
              selectedPatientId={selectedPatientId} setSelectedPatientId={setSelectedPatientId}
              canManageUser={canManage(user)} onEdit={openEditPatient} onDelete={removePatient}
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
              selectedPatient={selectedPatient} userObj={user}
            />
          )}

          {tab==="protocols"&&canManage(user)&&(
            <ProtocolsTab templates={templates} canManageUser={canManage(user)} onEdit={openEditTemplate} onDelete={removeTemplate}/>
          )}

          {tab==="acs"&&(
            <UserList title="ACS" users={users.filter(u=>u.role==="acs")} isManagerUser={isManager(user)} onEdit={openEditUser} onDelete={removeUser}/>
          )}

          {tab==="doctors"&&(
            <UserList title="Médicos" users={users.filter(u=>u.role==="doctor")} isManagerUser={isManager(user)} onEdit={openEditUser} onDelete={removeUser}/>
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
                  <input type={type} value={form[field]} onChange={e=>{
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
              {String(form.careCategory||"").toLowerCase()==="puericulture"&&(
                <label>Nome do responsável<input value={form.motherName} onChange={e=>setForm(s=>({...s,motherName:e.target.value}))}/></label>
              )}
              <label>Sexo<select value={form.sex} onChange={e=>setForm(s=>({...s,sex:e.target.value}))}><option value="">Não informado</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option></select></label>
              {String(form.careCategory||"").toLowerCase()!=="puericulture"&&<label>Estado civil<input value={form.maritalStatus} onChange={e=>setForm(s=>({...s,maritalStatus:e.target.value}))}/></label>}
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

      {/* â”€â”€ User modal â”€â”€ */}
      {showUserModal&&(
        <Modal title={editingUser?"Editar usuário":"Novo usuário"} onClose={()=>setShowUserModal(false)}>
          <form onSubmit={submitUser} style={{display:"flex",flexDirection:"column",gap:".75rem"}}>
            <label>Perfil<select value={userForm.role} disabled={Boolean(editingUser)} onChange={e=>setUserForm(s=>({...s,role:e.target.value}))}><option value="acs">ACS</option><option value="doctor">Médico(a)</option></select></label>
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
    </main>
  );
}









