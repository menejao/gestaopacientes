import { useEffect, useMemo, useRef, useState } from "react";
import {
  aiTeamAsk, aiTeamDataQuality, aiTeamPriorities, aiTeamReport,
  bootstrap, createProtocolTemplate, createAppointment, createPatient,
  createRecord, createTask, createUser, deleteAppointment, deletePatient,
  deleteProtocolTemplate, deleteRecord, deleteUser, getUserUsage,
  getPatientHistory, getPatientProtocolSummary, getProtocolSummaries,
  getApiHealth, listAppointments, listMessages, listPatients, listProtocolTemplates,
  listTasks, listUsers, login, listPublicTeams, logoutApi, pingPresence, refreshSession,
  register, sendMessage, updateProtocolTemplate, updatePatient, updateUser, updateTaskStatus,
} from "./api";

import {
  SESSION_KEY, UI_STATE_KEY, AGENDA_KEY, RECEPTION_KEY,
  QUEUE_KEY, REFERRALS_KEY, NOTIFS_KEY,
  PATIENTS_PAGE_SIZE, VACCINE_OPTIONS, RECEPTION_USERS, PHARMA_USERS,
  TRIAGE_VITALS_KEY, PRIORITY_LABELS, PRIORITY_COLORS,
} from "./config/constants";
import { readLS, writeLS, readSession, readUiState, auditLog, readAuditLog, exportAuditLog } from "./utils/storage";
import {
  onlyDigits, formatCpf, formatPhone, formatCep, formatCns, formatCouncil,
  fmtDate, displayText, toBoundedInt,
} from "./utils/formatting";
import {
  parseLocalDate, parseDateSafe, isHoliday, isWeekend, isUnavailableDay,
  nextBusinessDay, unavailableReason, googleCalendarUrl,
} from "./utils/dates";
import {
  roleLabel, isReceptionist, isPharmacist, isNursingTech, isAdmin, isAdminUser,
  isAcs, canManage, isManager, isGestor, canWriteRecords, canAccessAI, canAccessChart,
} from "./utils/roles";
import {
  normalizeSearch, matchesPatientSearch, isProfileIncomplete, calcAge,
  gestationalAgeInfo, catLabel, isChildCategory, emptyPatientForm,
  suggestNextVisitDate, deriveProtocolAlerts, normalizeSeverity,
  alertWeight, protocolChip, ageInMonths, getBaseAgeGroup, buildProactiveAlerts,
} from "./utils/clinical";
import AccessRequestsPage from "./pages/AccessRequestsPage";
import AuditLogPanel from "./pages/AuditLogPanel";
import AcsTasksPage from "./pages/AcsTasksPage";
import ReferralsPage from "./pages/ReferralsPage";
import ReportsPage from "./pages/ReportsPage";
import GestorPage from "./pages/GestorPage";
import AiTab from "./pages/AiTab";
import DiagnosticsPage from "./pages/DiagnosticsPage";
import Modal from "./components/ui/Modal";
import UserList from "./components/UserList";
import ProtocolsTab from "./components/ProtocolsTab";
import AppShell from "./components/layout/AppShell";
import Sidebar from "./components/layout/Sidebar";
import Dashboard from "./pages/Dashboard";
import GlobalSearch from "./components/ui/GlobalSearch";
import NotificationBell from "./components/ui/NotificationBell";
import Topbar from "./components/layout/Topbar";
import TriagePage from "./pages/TriagePage";
import QueuePage from "./pages/QueuePage";
import RecordsPage from "./pages/RecordsPage";
import DocumentModal from "./components/DocumentModal";
import InsumoPage from "./pages/InsumoPage";
import PharmacyPage, { PatientCardModal } from "./pages/PharmacyPage";
import VaccinesPage, { inferVaccineDoseTitle, vaccineApplied } from "./pages/VaccinesPage";
import ExamsPage from "./pages/ExamsPage";
import AgendaPage from "./pages/AgendaPage";
import ReceptionistApp from "./pages/ReceptionistApp";
import AuthScreen from "./pages/AuthScreen";
import PatientsPage from "./pages/PatientsPage";
import AppErrorBoundary from "./components/feedback/AppErrorBoundary";
import OfflineBanner from "./components/feedback/OfflineBanner";
import ComplianceBadge from "./components/feedback/ComplianceBadge";
import PatientModal from "./components/modals/PatientModal";
import ProfileModal from "./components/modals/ProfileModal";
import UserModal from "./components/modals/UserModal";
import TemplateModal from "./components/modals/TemplateModal";
import PatientDetailsPanel from "./components/patients/PatientDetailsPanel";
import registerServiceWorker from "./services/registerServiceWorker";

registerServiceWorker();
function AppInner() {
  const session = useMemo(()=>{
    try { return readSession(); } catch { return null; }
  },[]);
  const uiState = useMemo(()=>{
    try { return readUiState(); } catch { return {}; }
  },[]);

  // Valida o token â€” se vier algo invÃ¡lido limpa a sessÃ£o
  const initialToken = (() => {
    try {
      const t = String(session?.token||"");
      // Token deve ser string nÃ£o vazia sem espaÃ§os â€” se invÃ¡lido, limpa sessÃ£o
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
  const [recordForm, setRecordForm] = useState({type:"consultation",title:"Consulta mÃ©dica",date:"",details:"",consultKind:"medica",consultDoctor:"",consultSpecialty:""});
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
  // as vacinas do indicador, a partir do histÃ³rico local do paciente.
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
      // Adolescente: HPV Ã© ADICIONAL ao calendÃ¡rio normal, nÃ£o substitui
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

    // Contar quantas do indicador jÃ¡ foram aplicadas
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

    // Para crianÃ§as de puericultura: gerenciar alertas de visita por janela especÃ­fica.
    // 1Âª visita ACS: realizar atÃ© os 30 dias de vida.
    // 2Âª visita ACS: realizar do 2Âº ao 6Âº mÃªs (31â€“180 dias de vida).
    // Quando a janela passa sem registro â†’ prazo perdido (sem recuperaÃ§Ã£o), sem gerar alerta.
    if (selectedPatient &&
        String(selectedPatient.careCategory||"").toLowerCase() === "child_followup" &&
        selectedPatient.birthDate) {
      const agedays = Math.floor((Date.now() - (parseLocalDate(selectedPatient.birthDate)||new Date()).getTime()) / 86400000);
      const visitsCompleted = Number(rosaAdjustedSummary?.completed?.visits ?? 0);
      const lost1st = agedays >= 31 && visitsCompleted === 0;
      const lost2nd = agedays >= 181 && visitsCompleted < 2;

      // Remover todos os alertas genÃ©ricos de visita (substituÃ­dos por alertas especÃ­ficos por janela)
      alerts = alerts.filter(a => {
        const t = String(a.title||"").toLowerCase();
        return !t.includes("visit") && !t.includes("visita");
      });

      // 1Âª visita: gerar alerta somente enquanto a janela (0â€“30 dias) ainda estÃ¡ ativa
      if (!lost1st && visitsCompleted === 0) {
        const daysLeft = Math.max(30 - agedays, 0);
        alerts.push({
          id: "puer-1a-visita",
          title: "1Âª visita ACS pendente",
          detail: `Realizar atÃ© os 30 dias de vida. Restam ${daysLeft} dia(s).`,
          severity: daysLeft <= 5 ? "high" : "medium",
        });
      }

      // 2Âª visita: gerar alerta somente enquanto a janela (31â€“180 dias) ainda estÃ¡ ativa
      if (!lost2nd && visitsCompleted < 2 && agedays >= 31) {
        const daysLeft = Math.max(180 - agedays, 0);
        alerts.push({
          id: "puer-2a-visita",
          title: "2Âª visita ACS pendente",
          detail: `Realizar do 2Âº ao 6Âº mÃªs de vida. Restam ${daysLeft} dia(s).`,
          severity: daysLeft <= 15 ? "high" : "medium",
        });
      }

      // Suprimir alertas de consulta cujas janelas jÃ¡ expiraram (nÃ£o recuperÃ¡veis):
      // â€” 1Âª consulta: janela 0â€“30 dias. Perdida se crianÃ§a tem > 30 dias e 0 consultas.
      // â€” 2Âª consulta: janela 31â€“180 dias. Perdida se crianÃ§a tem > 180 dias e < 2 consultas.
      // NÃ£o faz sentido cobrar algo que nÃ£o pode mais ser feito dentro do prazo correto.
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
    // ou do calendÃ¡rio filtrado pela idade (outras equipes).
    // Isso evita que vacinas fora da janela de idade apareÃ§am como alerta.
    if (selectedPatient) {
      const cat    = String(selectedPatient.careCategory||"").toLowerCase();
      const ageMs  = selectedPatient.birthDate ? (Date.now() - (parseLocalDate(selectedPatient.birthDate)||new Date()).getTime()) : null;
      const ageMon = ageMs !== null ? ageMs / (1000*60*60*24*30.44) : null;
      const sex    = String(selectedPatient.sex||"").toLowerCase();
      const isCrianca = cat === "child_followup" || (ageMon !== null && ageMon < 120);

      // Remover TODOS os alertas de vacina vindos do backend para qualquer paciente
      // (serÃ£o substituÃ­dos por alertas precisos calculados localmente)
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
        // Outras equipes: usar calendÃ¡rio completo mas sÃ³ vacinas dentro da janela de idade
        indicatorVaccines = getRosaIndicatorVaccines(); // mesmo indicador base para crianÃ§as
      }

      // Gerar alertas frescos apenas para vacinas ainda pendentes
      if (indicatorVaccines.length > 0) {
        const appliedVaccines = (history||[]).filter(h => String(h.type||"").toLowerCase() === "vaccine");
        const pendingIndicator = indicatorVaccines.filter(v =>
          !vaccineApplied(v, appliedVaccines, selectedPatient.birthDate)
        );
        // Para crianÃ§as: mostrar apenas vacinas cuja janela jÃ¡ chegou ou estÃ¡ prÃ³xima (atÃ© 2 meses)
        const vaccineAlerts = pendingIndicator
          .filter(v => {
            if (v.ageGroup !== "CrianÃ§a" || ageMon === null) return true;
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
                    ? `Dose prevista aos ${winLabel} de vida (${dueDateStr}) â€” atrasada`
                    : `Dose prevista aos ${winLabel} de vida (${dueDateStr}) â€” ainda nÃ£o registrada`)
                : `Dose prevista aos ${winLabel} de vida â€” ainda nÃ£o identificada no histÃ³rico`,
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
        label: payload?.ok ? "Online" : "InstÃ¡vel",
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
    // Reseta o formulÃ¡rio de atendimento ao trocar de paciente
    setRecordForm({type:isAcs(user)?"visit":"consultation",
      title:isAcs(user)?"Visita ACS":user?.role==="doctor"?"Consulta mÃ©dica":user?.role==="dentist"?"Consulta odontolÃ³gica":"Consulta de enfermagem",
      date:"",details:"",conduct:"",nextStep:"",demandType:"scheduled",consultKind:"medica",consultDoctor:"",consultSpecialty:""});
    setRecordVaccines([]);
  },[token,selectedPatientId]);

  /* Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Auth handlers Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  async function handleLogin(email,password) {
    setError(""); setBusy(true);
    try {
      const payload=await login(email.trim(),password);
      if(payload?.twoFactorRequired) throw new Error("2FA ativo: tela React ainda nÃ£o implementa desafio.");
      setToken(payload.token); setUser(payload.user);
      sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:payload.token,user:payload.user,refreshToken:payload.refreshToken||""}));
      auditLog("LOGIN", { email: email.trim().toLowerCase(), success: true }, payload.user);
      // Gestor vai direto para o painel de gestÃ£o
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
      sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:payload.token,user:payload.user,refreshToken:payload.refreshToken||""}));
      auditLog("USUARIO_CADASTRADO", { name:reg.name.trim(), email:reg.email.trim(), role:reg.role }, payload.user);
    } catch(e){ if(!(await handleApiError(e))) setError(e.message||"Falha no cadastro"); } finally{ setBusy(false); }
  }

  /* â”€â”€ Token expirado â€” tenta refresh, senÃ£o desloga â”€â”€ */
  async function handleApiError(e) {
    const msg = String(e?.message||e||"").toLowerCase();
    const is401 = e?.status === 401 || msg.includes("token ausente") || msg.includes("token invÃ¡lido") ||
                  msg.includes("expirad") || msg.includes("nÃ£o autorizado");
    if (is401) {
      const sess = readSession();
      if (sess?.refreshToken) {
        try {
          const payload = await refreshSession(sess.refreshToken);
          setToken(payload.token);
          setUser(payload.user);
          sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            token: payload.token,
            user: payload.user,
            refreshToken: payload.refreshToken || ""
          }));
          return true;
        } catch {}
      }
      auditLog("SESSAO_EXPIRADA", { reason: e?.message }, user);
      setToken(""); setUser(null); setPatients([]); setUsers([]); setTemplates([]);
      setProtocolByPatient({}); setSelectedPatientId("");
      sessionStorage.removeItem(SESSION_KEY);
      setError("SessÃ£o expirada. FaÃ§a login novamente.");
      return true;
    }
    return false;
  }

  /* Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Data Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
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
        // Fallback: calcula demanda do mÃªs atual a partir dos appointments de cada paciente
        // Atendimentos retroativos NÃ’O contam para demanda programada
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
    } catch(e){ if(!(await handleApiError(e))) setError(e.message||"Falha ao carregar dados"); } finally{ setBusy(false); }
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
    } catch(e){ if(!(await handleApiError(e))) setError(e.message||"Falha ao carregar dados do paciente"); }
  }

  function logout() {
    const sess = readSession();
    if (sess?.refreshToken && token) logoutApi(token, sess.refreshToken).catch(()=>{});
    auditLog("LOGOUT", { email: user?.email }, user);
    setToken(""); setUser(null); setPatients([]); setUsers([]); setTemplates([]); setProtocolByPatient({}); setSelectedPatientId("");
    sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(UI_STATE_KEY); localStorage.removeItem(RECEPTION_KEY);
  }

  /* Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Patient handlers Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
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
      // Silencia erro de CEP para nÃ£o interromper cadastro.
    }
  }

  async function submitPatient(e) {
    e.preventDefault(); if(!token) return;
    if(!form.name.trim()||!form.phone.trim()){setError("Nome e telefone sÃ£o obrigatÃ³rios.");return;}
    setBusy(true); setError("");
    try {
      // incompleteProfile Ã© removido ao salvar com os campos obrigatÃ³rios preenchidos
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
      // Se era um paciente incompleto, limpa o flag na agenda local tambÃ©m
      if (editingPatient?.incompleteProfile) {
        const patientId = editingPatient.id;
        const currentAgenda = readLS("saudeubs_agenda_v1", []);
        const updatedAgenda = currentAgenda.map(a =>
          a.patientId === patientId ? { ...a, incompletePatient: false } : a
        );
        writeLS("saudeubs_agenda_v1", updatedAgenda);
      }
      await loadAll();
    } catch(e){ if(!(await handleApiError(e))) setError(e.message||"Erro ao salvar paciente"); } finally{ setBusy(false); }
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

  /* Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ User handlers Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  function openEditUser(u) {
    return ()=>{
      if (!u) return; // CriaÃ§Ã£o desabilitada â€” apenas pela tela de cadastro
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
    if(!token||!isManager(user)||!editingUser) return; // CriaÃ§Ã£o sÃ³ pela tela inicial
    if(!userForm.name.trim()||!userForm.email.trim()){setError("Nome e e-mail sÃ£o obrigatÃ³rios.");return;}
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
    } catch(e){ if(!(await handleApiError(e))) setError(e.message||"Erro ao salvar usuÃ¡rio"); } finally{ setBusy(false); }
  }

  async function removeUser(u) {
    if(!token||!isManager(user)||!u?.id) return;
    if(u.id===user.id){setError("NÃ£o Ã© possÃ­vel excluir sua prÃ³pria conta.");return;}
    setBusy(true); setError("");
    try {
      const usage=await getUserUsage(token,u.id);
      if(!usage?.canDelete) throw new Error(`VÃ­nculos ativos impedem a exclusÃ£o (pacientes=${usage.assignedPatients||0}, tarefas=${usage.openTasksAssigned||0}).`);
      if(!confirm(`Excluir '${u.name}'?`)) return;
      await deleteUser(token,u.id);
      auditLog("USUARIO_EXCLUIDO", { targetId:u.id, targetName:u.name, role:u.role }, user);
      await loadAll();
    } catch(e){ setError(e.message||"Erro ao excluir"); } finally{ setBusy(false); }
  }

  /* Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Template handlers Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
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
    if(!category||!label){setError("Categoria e nome sÃ£o obrigatÃ³rios.");return;}
    const payload={category,label,targets:{visits:Number(templateForm.visits||0),consultations:Number(templateForm.consultations||0),vaccines:Number(templateForm.vaccines||0)},deadlines:{visits:Number(templateForm.deadlinesVisits||0),consultations:Number(templateForm.deadlinesConsultations||0),vaccines:Number(templateForm.deadlinesVaccines||0)},vaccines:String(templateForm.vaccineList||"").split(",").map(v=>v.trim()).filter(Boolean)};
    setBusy(true); setError("");
    try {
      editingTemplate?.category?await updateProtocolTemplate(token,editingTemplate.category,payload):await createProtocolTemplate(token,payload);
      setShowTemplateModal(false); await loadAll();
    } catch(e){ if(!(await handleApiError(e))) setError(e.message||"Erro ao salvar protocolo"); } finally{ setBusy(false); }
  }

  async function removeTemplate(t) {
    if(!token||!canManage(user)||!t?.category||!confirm(`Excluir '${t.label||t.category}'?`)) return;
    setBusy(true); setError("");
    try { await deleteProtocolTemplate(token,t.category); await loadAll(); }
    catch(e){ setError(e.message||"Erro ao excluir"); } finally{ setBusy(false); }
  }

  /* Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ AI Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  async function loadAiPriorities(){if(!token)return;setBusy(true);setError("");try{setAiView("priorities");setAiData(await aiTeamPriorities(token));}catch(e){ if(!(await handleApiError(e))) setError(e.message||"Erro"); }finally{setBusy(false);}}
  async function loadAiQuality(){if(!token)return;setBusy(true);setError("");try{setAiView("quality");setAiData(await aiTeamDataQuality(token));}catch(e){ if(!(await handleApiError(e))) setError(e.message||"Erro"); }finally{setBusy(false);}}
  async function loadAiReport(){if(!token)return;setBusy(true);setError("");try{setAiView("report");setAiData(await aiTeamReport(token));}catch(e){ if(!(await handleApiError(e))) setError(e.message||"Erro"); }finally{setBusy(false);}}
  async function submitAiQuestion(e){e.preventDefault();if(!token||!aiQuestion.trim())return;setBusy(true);setError("");try{setAiView("chat");setAiData(await aiTeamAsk(token,aiQuestion.trim()));}catch(e2){setError(e2.message||"Erro");}finally{setBusy(false);}}

  /* Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Record / Appointment / Task / Message Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬Ã¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */
  async function submitRecord(e) {
    e.preventDefault(); if(!selectedPatientId) return;
    const type = isAcs(user)?"visit":recordForm.type;
    const title = isAcs(user)?"Visita ACS":recordForm.title;
    if(!type||!recordForm.date||(type!=="vaccine"&&!title)){setError("Preencha tipo, data e tÃ­tulo.");return;}
    if(type==="vaccine"&&!recordVaccines.length){setError("Selecione ao menos uma vacina.");return;}
    if(type==="visit"){
      const patient = patients.find(p => p.id === selectedPatientId);
      if(!String(patient?.assignedAcsId||"").trim()){
        setError("NÃ£o Ã© possÃ­vel registrar visita sem ACS responsÃ¡vel vinculado ao paciente.");
        return;
      }
    }
    const now = new Date();
    const timeStr = now.toTimeString().slice(0,5);
    // Monta detalhes ricos para o prontuÃ¡rio
    const buildDetails = (extraTitle, conduct, nextStep, demandType, details) => [
      extraTitle ? `Tipo: ${extraTitle}` : "",
      demandType ? `Demanda: ${demandType==="scheduled"?"Programada":demandType==="spontaneous"?"EspontÃ¢nea":"Retroativo"}` : "",
      conduct ? `Conduta: ${conduct}` : "",
      nextStep ? `PrÃ³ximo passo: ${nextStep}` : "",
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
          // Inferir a dose correta com base na data de aplicaÃ§Ã£o e nascimento do paciente
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
        // TambÃ©m cria appointment para consultas (para o histÃ³rico de demanda)
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
      // Atendimentos retroativos NÃ’O contam
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
        user?.role==="doctor"?"Consulta mÃ©dica":user?.role==="dentist"?"Consulta odontolÃ³gica":"Consulta de enfermagem",
        date:"",details:"",conduct:"",nextStep:"",demandType:"scheduled",consultKind:"medica",consultDoctor:"",consultSpecialty:""});
      setRecordVaccines([]); await loadSelectedPatientData(selectedPatientId); await loadAll();
    } catch(e){ if(!(await handleApiError(e))) setError(e.message||"Erro ao criar registro"); }
  }

  async function submitAppointment(e) {
    e.preventDefault(); if(!selectedPatientId) return;
    if(!appointmentForm.date||!appointmentForm.summary){setError("Preencha data e resumo.");return;}
    try {
      await createAppointment(token,selectedPatientId,appointmentForm);
      const title=String(user?.role||"")==="doctor"?"Consulta mÃ©dica":"Consulta de enfermagem";
      const details=[appointmentForm.summary,appointmentForm.conduct,appointmentForm.nextStep].filter(v=>String(v||"").trim()).join(" | ");
      await createRecord(token,selectedPatientId,{type:"consultation",title,date:appointmentForm.date,details});
      setAppointmentForm({date:"",demandType:"scheduled",summary:"",conduct:"",nextStep:""});
      await loadSelectedPatientData(selectedPatientId); await loadAll();
    } catch(e){ if(!(await handleApiError(e))) setError(e.message||"Erro ao registrar atendimento"); }
  }

  async function submitTask(e) {
    e.preventDefault(); if(!selectedPatientId) return;
    if(!taskForm.title){setError("TÃ­tulo obrigatÃ³rio.");return;}
    try {
      await createTask(token,{patientId:selectedPatientId,assigneeId:taskForm.assigneeId||"",title:taskForm.title,notes:taskForm.notes,dueDate:taskForm.dueDate});
      auditLog("TAREFA_CRIADA", { patientId:selectedPatientId, title:taskForm.title, dueDate:taskForm.dueDate }, user);
      // Registra tarefa no prontuÃ¡rio automaticamente
      const assignee = users.find(u=>u.id===taskForm.assigneeId);
      // Tarefas: registradas no histÃ³rico interno, mas NÃ’O no prontuÃ¡rio clÃ­nico
      await createRecord(token,selectedPatientId,{
        type:"task", date:new Date().toISOString().slice(0,10),
        time:new Date().toTimeString().slice(0,5),
        title:`Tarefa: ${taskForm.title}`,
        details:[
          taskForm.notes?`DescriÃ§Ã£o: ${taskForm.notes}`:"",
          taskForm.dueDate?`Prazo: ${new Date(taskForm.dueDate+"T12:00:00").toLocaleDateString("pt-BR")}`:"",
          assignee?`ResponsÃ¡vel: ${assignee.name}`:"",
        ].filter(Boolean).join("\n"),
        professionalName:user?.name||"", internalOnly:true,
      }).catch(()=>{});
      setTaskForm({title:"",notes:"",dueDate:"",assigneeId:""});
      await loadSelectedPatientData(selectedPatientId); await loadAll();
    } catch(e){ if(!(await handleApiError(e))) setError(e.message||"Erro ao criar tarefa"); }
  }

  async function submitMessage(e) {
    e.preventDefault(); if(!selectedPatientId||!messageText.trim()) return;
    try {
      await sendMessage(token,selectedPatientId,messageText.trim());
      auditLog("MENSAGEM_ENVIADA", { patientId:selectedPatientId, preview:messageText.trim().slice(0,80) }, user);
      // Mensagens: registradas no histÃ³rico interno, mas NÃ’O no prontuÃ¡rio clÃ­nico
      await createRecord(token,selectedPatientId,{
        type:"message", date:new Date().toISOString().slice(0,10),
        time:new Date().toTimeString().slice(0,5),
        title:"ComunicaÃ§Ã£o interna da equipe",
        details:messageText.trim(),
        professionalName:user?.name||"", internalOnly:true,
      }).catch(()=>{});
      setMessageText(""); await loadSelectedPatientData(selectedPatientId);
    }
    catch(e){ if(!(await handleApiError(e))) setError(e.message||"Erro ao enviar mensagem"); }
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

  /* â”€â”€ Auth guard â€” login Ãºnico, roteamento por perfil â”€â”€ */
  if (!token || !user || typeof user !== 'object') {
    return <AuthScreen onLogin={handleLogin} error={error} busy={busy}/>;
  }

  // Recepcionista â†’ app dedicado de recepÃ§Ã£o
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

  // FarmacÃªutico, enfermeira, mÃ©dico, ACS, tÃ©c. enf., admin â†’ app clÃ­nico
  // buildNavItems limita o menu conforme o perfil

  const catOpts=templates.map(t=>({value:t.category,label:t.label}));

  // Todos os perfis com acesso ao mÃ³dulo visualizam todos os pacientes.
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
      setProfileError("Nome e e-mail sÃ£o obrigatÃ³rios.");
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
      const sess = readSession();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, user: newUser, refreshToken: sess?.refreshToken || "" }));
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
      <AppShell
        mobileNavOpen={mobileNavOpen}
        onCloseMobileNav={()=>setMobileNavOpen(false)}
        topbar={<Topbar
          user={user} selectedPatient={selectedPatient} templates={templates}
          mobileOpen={mobileNavOpen} setMobileOpen={setMobileNavOpen}
          onLogout={logout} onOpenProfile={openProfile}
          patients={patients} protocolByPatient={protocolByPatient}
          apiHealth={apiHealth}
          onNavigatePatient={(id)=>{ setTab("patients"); setSelectedPatientId(id); }}
        />}
        sidebar={<Sidebar
          tab={tab} setTab={setTab}
          mobileOpen={mobileNavOpen} setMobileOpen={setMobileNavOpen}
          query={query} setQuery={setQuery}
          user={user} canManageUser={canManage(user)}
          onClearPatient={()=>setSelectedPatientId("")}
        />}
      >
        <section className="main-area">
          {error&&<div className="error error-banner">{error}<button className="icon-btn error-banner__close" onClick={()=>setError("")}><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button></div>}

          {tab==="dashboard"&&<Dashboard patients={patients} users={users} allUsers={allUsers||[]} templates={templates} protocolByPatient={protocolByPatient} demandMonthly={demandMonthly} currentUser={user} onNavigate={(id)=>{ setTab("patients"); setSelectedPatientId(id); }} setTab={setTab}/>}

          {tab==="queue"&&<QueuePage patients={patients} users={users} user={user} token={token} onNewPatient={p=>setPatients(prev=>[...prev,p])}/>}
          {tab==="triage"&&<TriagePage patients={patients} users={users} user={user}/>}
          {tab==="agenda"&&<AgendaPage patients={patients} users={users} user={user} token={token} teams={publicTeams} onNewPatient={p=>setPatients(prev=>[...prev,p])} onPatientCreated={loadAll} onNavigatePatient={(id)=>{setTab("patients");setSelectedPatientId(id);}}/>}
          {tab==="referrals"&&<ReferralsPage patients={patients} users={users} user={user}/>}
          {tab==="acs_tasks"&&<AcsTasksPage patients={patients} users={users} user={user} token={token} onNavigatePatient={(id)=>{setTab("patients");setSelectedPatientId(id);}}/>}
          {tab==="chart"&&<RecordsPage patients={patients} users={users} user={user} token={token} selectedPatientId={selectedPatientId} onSelectPatientId={setSelectedPatientId} onNavigatePatient={(id)=>{setTab("patients");setSelectedPatientId(id);}}/>}

          {tab==="exams_page"&&<ExamsPage patients={patients} users={users} user={user} token={token} onNavigatePatient={(id)=>{setTab("patients");setSelectedPatientId(id);}}/>}
          {tab==="gestor"&&<GestorPage patients={patients} users={users} templates={templates} protocolByPatient={protocolByPatient}/>}
          {tab==="access_requests"&&(isAdmin(user)||isGestor(user))&&<AccessRequestsPage token={token} user={user}/>}
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
            <PatientsPage
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
            <UserList title="MÃ©dicos e TÃ©cnicos" users={users.filter(u=>["doctor","nursing_tech","pharmacist"].includes(u.role))} isManagerUser={isManager(user)} onEdit={openEditUser} onDelete={removeUser}/>
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
      </AppShell>

      <PatientModal
        open={showModal}
        editingPatient={editingPatient}
        form={form}
        setForm={setForm}
        users={users}
        catOpts={catOpts}
        isChildCategory={isChildCategory}
        lookupCepAndFillAddress={lookupCepAndFillAddress}
        formatPhone={formatPhone}
        formatCep={formatCep}
        formatCpf={formatCpf}
        formatCns={formatCns}
        error={error}
        busy={busy}
        onClose={() => setShowModal(false)}
        onSubmit={submitPatient}
      />

      {showViewModal&&viewPatient&&(
        <Modal title="Visualizar paciente" onClose={()=>{setShowViewModal(false);setViewPatient(null);}}>
          <PatientDetailsPanel
            patient={viewPatient}
            users={users}
            templates={templates}
            catLabel={catLabel}
            displayText={displayText}
            isChildCategory={isChildCategory}
            fmtDate={fmtDate}
            calcAge={calcAge}
          />
        </Modal>
      )}

      <UserModal
        open={showUserModal}
        editingUser={editingUser}
        userForm={userForm}
        setUserForm={setUserForm}
        onlyDigits={onlyDigits}
        error={error}
        busy={busy}
        onClose={() => setShowUserModal(false)}
        onSubmit={submitUser}
      />

      <TemplateModal
        open={showTemplateModal}
        editingTemplate={editingTemplate}
        templateForm={templateForm}
        setTemplateForm={setTemplateForm}
        error={error}
        busy={busy}
        onClose={() => setShowTemplateModal(false)}
        onSubmit={submitTemplate}
      />

      <ProfileModal
        open={showProfileModal}
        user={user}
        profileForm={profileForm}
        setProfileForm={setProfileForm}
        profileError={profileError}
        profileBusy={profileBusy}
        roleLabel={roleLabel}
        onlyDigits={onlyDigits}
        onClose={() => setShowProfileModal(false)}
        onSubmit={submitProfile}
      />
    </main>
  );
}

/* â”€â”€ App exportado â€” envolve tudo no ErrorBoundary â”€â”€ */
export function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}



