const API_URL = window.__APP_CONFIG?.apiUrl || "http://localhost:3001";
const SESSION_KEY = "saudeubs_session";
const VIEW_STATE_KEY = "saudeubs_view_state";
const SESSION_INACTIVITY_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_TOUCH_THROTTLE_MS = 30000;
const PRESENCE_PING_MS = 30000;
const BRAZIL_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
  "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
  "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const state = {
  token: null, user: null, users: [], patients: [],
  selectedPatient: null, appointments: [], tasks: [],
  globalTasks: [],
  messages: [], auditLogs: [], history: [],
  protocolSummary: null, protocolTemplates: [], publicTeams: [],
  protocolByPatient: {},
  demandMonthly: null,
  dataQuality: null,
  teamActivityLog: [],
  teamActivityWindowSeconds: 120,
  editingPatientId: null,
  editingProtocolCategory: null,
  editingTeamUserId: null,
  navSection: "dashboard",
  workspaceTab: "dashboard",
  dashboardQuery: "",
  dashboardSort: "name_asc",
  dashboardPage: 1,
  dashboardPageSize: 8,
  dashboardCategory: "",
  dashboardAcsId: "",
  dashboardProtocolStatus: "all",
  selectedPatientIds: new Set(),
  filters: { microArea: "", acsId: "", careCategory: "" }
};

// -- Element refs ------------------------------------------------------------
const el = {
  authScreen:               document.getElementById("authScreen"),
  appScreen:                document.getElementById("appScreen"),
  loginEmail:               document.getElementById("loginEmail"),
  loginPassword:            document.getElementById("loginPassword"),
  loginBtn:                 document.getElementById("loginBtn"),
  registerName:             document.getElementById("registerName"),
  registerEmail:            document.getElementById("registerEmail"),
  registerPassword:         document.getElementById("registerPassword"),
  registerRole:             document.getElementById("registerRole"),
  registerBtn:              document.getElementById("registerBtn"),
  registerTeam:             document.getElementById("registerTeam"),
  registerTeamName:         document.getElementById("registerTeamName"),
  registerCouncilNumber:    document.getElementById("registerCouncilNumber"),
  registerCouncilUf:        document.getElementById("registerCouncilUf"),
  registerTeamWrap:         document.getElementById("registerTeamWrap"),
  registerTeamNameWrap:     document.getElementById("registerTeamNameWrap"),
  registerCouncilNumberWrap:document.getElementById("registerCouncilNumberWrap"),
  registerCouncilUfWrap:    document.getElementById("registerCouncilUfWrap"),
  councilNumLabel:          document.getElementById("councilNumLabel"),
  homeBtn:                  document.getElementById("homeBtn"),
  profileBtn:               document.getElementById("profileBtn"),
  logoutBtn:                document.getElementById("logoutBtn"),
  topbarUser:               document.getElementById("topbarUser"),
  userName:                 document.getElementById("userName"),
  userRole:                 document.getElementById("userRole"),
  userAvatar:               document.getElementById("userAvatar"),
  topbarSearchInput:        document.getElementById("topbarSearchInput"),
  topbarFilterBtn:          document.getElementById("topbarFilterBtn"),
  topbarPatient:            document.getElementById("topbarPatient"),
  mobileMenuBtn:            document.getElementById("mobileMenuBtn"),
  sidebarBackdrop:          document.getElementById("sidebarBackdrop"),
  mobileUserAvatar:         document.getElementById("mobileUserAvatar"),
  mobileUserName:           document.getElementById("mobileUserName"),
  mobileUserRole:           document.getElementById("mobileUserRole"),
  mobileHomeBtn:            document.getElementById("mobileHomeBtn"),
  mobileProfileBtn:         document.getElementById("mobileProfileBtn"),
  mobileLogoutBtn:          document.getElementById("mobileLogoutBtn"),
  sidebar:                  document.querySelector(".sidebar"),
  patientList:              document.getElementById("patientList"),
  patientCount:             document.getElementById("patientCount"),
  navDashboardBtn:          document.getElementById("navDashboardBtn"),
  navPatientsBtn:           document.getElementById("navPatientsBtn"),
  navProtocolsBtn:          document.getElementById("navProtocolsBtn"),
  navAcsBtn:                document.getElementById("navAcsBtn"),
  navDoctorsBtn:            document.getElementById("navDoctorsBtn"),
  navAiBtn:                 document.getElementById("navAiBtn"),
  openPatientModalBtn:      document.getElementById("openPatientModalBtn"),
  openCreateUserModalBtn:   document.getElementById("openCreateUserModalBtn"),
  pName:                    document.getElementById("pName"),
  pMotherNameWrap:          document.getElementById("pMotherNameWrap"),
  pMotherName:              document.getElementById("pMotherName"),
  pPhone:                   document.getElementById("pPhone"),
  pPhoneAlt:                document.getElementById("pPhoneAlt"),
  pCpf:                     document.getElementById("pCpf"),
  pCns:                     document.getElementById("pCns"),
  pCep:                     document.getElementById("pCep"),
  pStreet:                  document.getElementById("pStreet"),
  pNumber:                  document.getElementById("pNumber"),
  pNeighborhood:            document.getElementById("pNeighborhood"),
  pCity:                    document.getElementById("pCity"),
  pState:                   document.getElementById("pState"),
  pAcs:                     document.getElementById("pAcs"),
  pCareCategory:            document.getElementById("pCareCategory"),
  pPregnancyFieldsWrap:     document.getElementById("pPregnancyFieldsWrap"),
  pPuerperalFieldsWrap:     document.getElementById("pPuerperalFieldsWrap"),
  pChronicConditionsWrap:   document.getElementById("pChronicConditionsWrap"),
  pChronicHypertension:     document.getElementById("pChronicHypertension"),
  pChronicDiabetes:         document.getElementById("pChronicDiabetes"),
  pBirthDate:               document.getElementById("pBirthDate"),
  pSexAtBirth:              document.getElementById("pSexAtBirth"),
  pMaritalStatusWrap:       document.getElementById("pMaritalStatusWrap"),
  pMaritalStatus:           document.getElementById("pMaritalStatus"),
  pGenderIdentity:          document.getElementById("pGenderIdentity"),
  pPregnancyStartDate:      document.getElementById("pPregnancyStartDate"),
  pExpectedDeliveryDate:    document.getElementById("pExpectedDeliveryDate"),
  pGestationalAgeDumWeeks:  document.getElementById("pGestationalAgeDumWeeks"),
  pGestationalAgeDumDays:   document.getElementById("pGestationalAgeDumDays"),
  pGestationalAgeUsgWeeks:  document.getElementById("pGestationalAgeUsgWeeks"),
  pGestationalAgeUsgDays:   document.getElementById("pGestationalAgeUsgDays"),
  pUsgDate1:                document.getElementById("pUsgDate1"),
  pUsgDate2:                document.getElementById("pUsgDate2"),
  pUsgDate3:                document.getElementById("pUsgDate3"),
  pPrenatalStartDate:       document.getElementById("pPrenatalStartDate"),
  pPostpartumStartDate:     document.getElementById("pPostpartumStartDate"),
  pComorb:                  document.getElementById("pComorb"),
  pMeds:                    document.getElementById("pMeds"),
  pAllergies:               document.getElementById("pAllergies"),
  createPatientBtn:         document.getElementById("createPatientBtn"),
  patientModal:             document.getElementById("patientModal"),
  patientModalTitle:        document.getElementById("patientModalTitle"),
  closePatientModalBtn:     document.getElementById("closePatientModalBtn"),
  cancelPatientModalBtn:    document.getElementById("cancelPatientModalBtn"),
  editPatientBtn:           document.getElementById("editPatientBtn"),
  deletePatientBtn:         document.getElementById("deletePatientBtn"),
  backToHomeBtn:            document.getElementById("backToHomeBtn"),
  emptyState:               document.getElementById("emptyState"),
  patientContent:           document.getElementById("patientContent"),
  selectedPatientTitle:     document.getElementById("selectedPatientTitle"),
  selectedPatientMeta:      document.getElementById("selectedPatientMeta"),
  patientAvatar:            document.getElementById("patientAvatar"),
  patientHeaderBadge:       document.getElementById("patientHeaderBadge"),
  protocolSummary:          document.getElementById("protocolSummary"),
  appointmentList:          document.getElementById("appointmentList"),
  taskList:                 document.getElementById("taskList"),
  messageList:              document.getElementById("messageList"),
  historyList:              document.getElementById("historyList"),
  auditList:                document.getElementById("auditList"),
  rType:                    document.getElementById("rType"),
  rDate:                    document.getElementById("rDate"),
  rTitleSelectWrap:         document.getElementById("rTitleSelectWrap"),
  rTitleSelect:             document.getElementById("rTitleSelect"),
  rTitleInputWrap:          document.getElementById("rTitleInputWrap"),
  rTitleInput:              document.getElementById("rTitleInput"),
  rDetails:                 document.getElementById("rDetails"),
  rRapidTestTrimesterWrap:  document.getElementById("rRapidTestTrimesterWrap"),
  rRapidTestTrimester:      document.getElementById("rRapidTestTrimester"),
  rVaccineMultiWrap:        document.getElementById("rVaccineMultiWrap"),
  rVaccineMulti:            document.getElementById("rVaccineMulti"),
  addRecordBtn:             document.getElementById("addRecordBtn"),
  aDate:                    document.getElementById("aDate"),
  aDemandType:              document.getElementById("aDemandType"),
  aSummary:                 document.getElementById("aSummary"),
  aConduct:                 document.getElementById("aConduct"),
  aNext:                    document.getElementById("aNext"),
  addAppointmentBtn:        document.getElementById("addAppointmentBtn"),
  addAppointmentAndRecordBtn: document.getElementById("addAppointmentAndRecordBtn"),
  appointmentFormCard:      document.getElementById("appointmentFormCard"),
  tTitle:                   document.getElementById("tTitle"),
  tNotes:                   document.getElementById("tNotes"),
  tDue:                     document.getElementById("tDue"),
  tAssignee:                document.getElementById("tAssignee"),
  addTaskBtn:               document.getElementById("addTaskBtn"),
  taskFormCard:             document.getElementById("taskFormCard"),
  mText:                    document.getElementById("mText"),
  sendMsgBtn:               document.getElementById("sendMsgBtn"),
  auditTab:                 document.querySelector(".audit-tab"),
  toast:                    document.getElementById("toast"),
  togglePass:               document.getElementById("togglePass"),
  quickSelectFirstPatientBtn: document.getElementById("quickSelectFirstPatientBtn"),
  homeTabDashboardBtn:      document.getElementById("homeTabDashboardBtn"),
  homeTabProtocolsBtn:      document.getElementById("homeTabProtocolsBtn"),
  homeDashboardPane:        document.getElementById("homeDashboardPane"),
  homePatientsPane:         document.getElementById("homePatientsPane"),
  kpiPatientsTotal:         document.getElementById("kpiPatientsTotal"),
  kpiPatientsAssigned:      document.getElementById("kpiPatientsAssigned"),
  kpiTasksOpen:             document.getElementById("kpiTasksOpen"),
  kpiCategories:            document.getElementById("kpiCategories"),
  kpiDemandRatio:           document.getElementById("kpiDemandRatio"),
  kpiDemandMeta:            document.getElementById("kpiDemandMeta"),
  kpiDemandAlert:           document.getElementById("kpiDemandAlert"),
  dataQualitySummary:       document.getElementById("dataQualitySummary"),
  dataQualityList:          document.getElementById("dataQualityList"),
  categorySummaryList:      document.getElementById("categorySummaryList"),
  priorityTaskList:         document.getElementById("priorityTaskList"),
  teamActivityCard:         document.getElementById("teamActivityCard"),
  teamActivityList:         document.getElementById("teamActivityList"),
  protocolDeadlineAlertsList: document.getElementById("protocolDeadlineAlertsList"),
  homePatientSortSelect:    document.getElementById("homePatientSortSelect"),
  homePatientNameInput:     document.getElementById("homePatientNameInput"),
  homePatientBulkDeleteBtn: document.getElementById("homePatientBulkDeleteBtn"),
  homePatientSelectAll:     document.getElementById("homePatientSelectAll"),
  homePatientCategoryFilter: document.getElementById("homePatientCategoryFilter"),
  homePatientAcsFilter:     document.getElementById("homePatientAcsFilter"),
  homePatientProtocolStatusFilter: document.getElementById("homePatientProtocolStatusFilter"),
  homePatientExportBtn:     document.getElementById("homePatientExportBtn"),
  homePatientTableBody:     document.getElementById("homePatientTableBody"),
  homePatientPageInfo:      document.getElementById("homePatientPageInfo"),
  homePatientPrevBtn:       document.getElementById("homePatientPrevBtn"),
  homePatientNextBtn:       document.getElementById("homePatientNextBtn"),
  protocolAdminSection:     document.getElementById("protocolAdminSection"),
  acsAdminSection:          document.getElementById("acsAdminSection"),
  doctorsAdminSection:      document.getElementById("doctorsAdminSection"),
  aiHubSection:             document.getElementById("aiHubSection"),
  aiLoadPrioritiesBtn:      document.getElementById("aiLoadPrioritiesBtn"),
  aiLoadQualityBtn:         document.getElementById("aiLoadQualityBtn"),
  aiLoadReportBtn:          document.getElementById("aiLoadReportBtn"),
  aiTeamQuestionInput:      document.getElementById("aiTeamQuestionInput"),
  aiAskTeamBtn:             document.getElementById("aiAskTeamBtn"),
  aiHubOutput:              document.getElementById("aiHubOutput"),
  acsList:                  document.getElementById("acsList"),
  doctorList:               document.getElementById("doctorList"),
  protocolAdminList:        document.getElementById("protocolAdminList"),
  protocolCategoryInput:    document.getElementById("protocolCategoryInput"),
  protocolLabelInput:       document.getElementById("protocolLabelInput"),
  protocolVisitsInput:      document.getElementById("protocolVisitsInput"),
  protocolConsultationsInput: document.getElementById("protocolConsultationsInput"),
  protocolVaccinesTargetInput: document.getElementById("protocolVaccinesTargetInput"),
  protocolVaccinesListInput: document.getElementById("protocolVaccinesListInput"),
  protocolVisitDeadlineInput: document.getElementById("protocolVisitDeadlineInput"),
  protocolConsultationDeadlineInput: document.getElementById("protocolConsultationDeadlineInput"),
  protocolVaccineDeadlineInput: document.getElementById("protocolVaccineDeadlineInput"),
  protocolAuthorityInput:   document.getElementById("protocolAuthorityInput"),
  protocolReferenceInput:   document.getElementById("protocolReferenceInput"),
  protocolVersionInput:     document.getElementById("protocolVersionInput"),
  openProtocolModalBtn:     document.getElementById("openProtocolModalBtn"),
  protocolModal:            document.getElementById("protocolModal"),
  protocolModalTitle:       document.getElementById("protocolModalTitle"),
  closeProtocolModalBtn:    document.getElementById("closeProtocolModalBtn"),
  cancelProtocolModalBtn:   document.getElementById("cancelProtocolModalBtn"),
  createProtocolBtn:        document.getElementById("createProtocolBtn"),
  profileModal:             document.getElementById("profileModal"),
  closeProfileBtn:          document.getElementById("closeProfileBtn"),
  profileName:              document.getElementById("profileName"),
  profileEmail:             document.getElementById("profileEmail"),
  profilePassword:          document.getElementById("profilePassword"),
  profileCouncilWrap:       document.getElementById("profileCouncilWrap"),
  profileCouncilNumber:     document.getElementById("profileCouncilNumber"),
  profileCouncilUf:         document.getElementById("profileCouncilUf"),
  profile2faStatus:         document.getElementById("profile2faStatus"),
  profile2faSetupBtn:       document.getElementById("profile2faSetupBtn"),
  profile2faDisableBtn:     document.getElementById("profile2faDisableBtn"),
  saveProfileBtn:           document.getElementById("saveProfileBtn"),
  createUserModal:          document.getElementById("createUserModal"),
  closeCreateUserModalBtn:  document.getElementById("closeCreateUserModalBtn"),
  cancelCreateUserModalBtn: document.getElementById("cancelCreateUserModalBtn"),
  managerCreateRole:        document.getElementById("managerCreateRole"),
  managerCreateName:        document.getElementById("managerCreateName"),
  managerCreateEmail:       document.getElementById("managerCreateEmail"),
  managerCreatePassword:    document.getElementById("managerCreatePassword"),
  managerCreateCouncilWrap: document.getElementById("managerCreateCouncilWrap"),
  managerCreateCouncilNumber: document.getElementById("managerCreateCouncilNumber"),
  managerCreateCouncilUf:   document.getElementById("managerCreateCouncilUf"),
  saveCreateUserBtn:        document.getElementById("saveCreateUserBtn"),
  editTeamUserModal:        document.getElementById("editTeamUserModal"),
  closeEditTeamUserModalBtn: document.getElementById("closeEditTeamUserModalBtn"),
  cancelEditTeamUserModalBtn: document.getElementById("cancelEditTeamUserModalBtn"),
  editTeamUserRole:         document.getElementById("editTeamUserRole"),
  editTeamUserName:         document.getElementById("editTeamUserName"),
  editTeamUserEmail:        document.getElementById("editTeamUserEmail"),
  editTeamUserPassword:     document.getElementById("editTeamUserPassword"),
  editTeamUserCouncilWrap:  document.getElementById("editTeamUserCouncilWrap"),
  editTeamUserCouncilNumber: document.getElementById("editTeamUserCouncilNumber"),
  editTeamUserCouncilUf:    document.getElementById("editTeamUserCouncilUf"),
  saveEditTeamUserBtn:      document.getElementById("saveEditTeamUserBtn"),
  filterModal:              document.getElementById("filterModal"),
  closeFilterModalBtn:      document.getElementById("closeFilterModalBtn"),
  topFilterMicroArea:       document.getElementById("topFilterMicroArea"),
  topFilterAcs:             document.getElementById("topFilterAcs"),
  topFilterCategory:        document.getElementById("topFilterCategory"),
  applyTopFiltersBtn:       document.getElementById("applyTopFiltersBtn"),
  clearTopFiltersBtn:       document.getElementById("clearTopFiltersBtn"),
  aiPatientSummaryBtn:      document.getElementById("aiPatientSummaryBtn"),
  aiPatientProtocolBtn:     document.getElementById("aiPatientProtocolBtn"),
  aiPatientAcsMsgBtn:       document.getElementById("aiPatientAcsMsgBtn"),
  aiPatientSuggestBtn:      document.getElementById("aiPatientSuggestBtn"),
  aiEvolutionInput:         document.getElementById("aiEvolutionInput"),
  aiEvolutionBtn:           document.getElementById("aiEvolutionBtn"),
  aiTranscriptionInput:     document.getElementById("aiTranscriptionInput"),
  aiTranscriptionBtn:       document.getElementById("aiTranscriptionBtn"),
  aiPatientOutput:          document.getElementById("aiPatientOutput"),
};
const RECORD_TYPE_DEFAULT_OPTIONS = el.rType
  ? [...el.rType.options].map((opt) => ({ value: opt.value, label: opt.textContent || opt.value }))
  : [];

// -- Toast --------------------------------------------------------------------
let _toastTimer = null;
let _lastSessionTouchAt = 0;
let _inactivityTimer = null;
let _protocolStatusesRequestSeq = 0;
let _recordDraftMetadata = null;
let _presencePingTimer = null;
let _activityLogRefreshTimer = null;
function showToast(msg, type = "default", ms = 3000) {
  el.toast.textContent = msg;
  el.toast.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.toast.classList.add("hidden"), ms);
}

function toDateInputValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : "";
}

function persistSession() {
  if (!state.token) return;
  const now = Date.now();
  const expiresAt = now + SESSION_INACTIVITY_MS;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token: state.token, lastActivityAt: now, expiresAt }));
}

function touchSession(force = false) {
  if (!state.token) return;
  const now = Date.now();
  if (!force && now - _lastSessionTouchAt < SESSION_TOUCH_THROTTLE_MS) return;
  _lastSessionTouchAt = now;
  persistSession();
}

function clearSessionStore() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(VIEW_STATE_KEY);
}

function logoutUser(showReason = false) {
  Object.assign(state, { token: null, user: null, patients: [], selectedPatient: null, globalTasks: [] });
  el.appScreen.classList.add("hidden");
  el.authScreen.classList.remove("hidden");
  el.emptyState.classList.remove("hidden");
  el.patientContent.classList.add("hidden");
  el.profileModal.classList.add("hidden");
  el.patientModal?.classList.add("hidden");
  el.createUserModal?.classList.add("hidden");
  el.editTeamUserModal?.classList.add("hidden");
  clearSessionStore();
  if (_presencePingTimer) { clearInterval(_presencePingTimer); _presencePingTimer = null; }
  if (_activityLogRefreshTimer) { clearInterval(_activityLogRefreshTimer); _activityLogRefreshTimer = null; }
  updateSessionView();
  if (showReason) showToast("Sessão encerrada por inatividade.", "error", 3500);
}

function setupInactivityWatcher() {
  if (_inactivityTimer) clearInterval(_inactivityTimer);
  _inactivityTimer = setInterval(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw || !state.token) return;
    try {
      const parsed = JSON.parse(raw);
      const expiresAt = Number(parsed?.expiresAt || 0);
      if (!expiresAt) return;
      if (Date.now() > expiresAt) {
        clearInterval(_inactivityTimer);
        _inactivityTimer = null;
        logoutUser(true);
      }
    } catch {
      // Ignora erros pontuais de parse.
    }
  }, 30000);
}

// -- Helpers ------------------------------------------------------------------
const isManager = () => state.user?.role === "nurse_manager";
const isDoctor  = () => state.user?.role === "doctor";
const isAcs     = () => state.user?.role === "acs";
const isAnaAdminAccount = () =>
  isManager() && String(state.user?.email || "").trim().toLowerCase() === "ana@clinica.local";
const canManageTaskStatus = () => isManager() || isDoctor();
const acsNameById  = id => state.users.find(u => u.id === id)?.name || "Não atribuído";
const catLabel     = cat => state.protocolTemplates.find(t => t.category === cat)?.label || "Geral";
const taskOpen     = t => ["pending", "in_progress"].includes(t.status);
const prettyJson   = (obj) => JSON.stringify(obj, null, 2);
const onlyDigits   = (v) => String(v || "").replace(/\D/g, "");
const passwordStrong = (v) => /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(String(v || ""));

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAiSection(title, bodyHtml) {
  return `<section><h4>${escapeHtml(title)}</h4>${bodyHtml}</section>`;
}

function renderAiReadable(target, data) {
  if (!target) return;
  if (!data || typeof data !== "object") {
    target.innerHTML = `<p>${escapeHtml(data)}</p>`;
    return;
  }

  const sections = [];
  const entries = Object.entries(data);
  for (const [key, value] of entries) {
    if (value === null || value === undefined || value === "") continue;
    const title = key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

    if (Array.isArray(value)) {
      const items = value.map((item) => `<li>${escapeHtml(typeof item === "object" ? prettyJson(item) : item)}</li>`).join("");
      sections.push(renderAiSection(title, `<ul>${items}</ul>`));
      continue;
    }

    if (typeof value === "object") {
      const lines = Object.entries(value)
        .map(([k, v]) => `<p><strong>${escapeHtml(k)}:</strong> ${escapeHtml(typeof v === "object" ? prettyJson(v) : v)}</p>`)
        .join("");
      sections.push(renderAiSection(title, lines || "<p>-</p>"));
      continue;
    }

    sections.push(renderAiSection(title, `<p>${escapeHtml(value)}</p>`));
  }

  target.innerHTML = sections.length ? sections.join("") : `<p>${escapeHtml(prettyJson(data))}</p>`;
}

function riskLabel(level) {
  const raw = String(level || "").toLowerCase();
  if (raw === "alto") return "ALTO";
  if (raw === "moderado") return "MODERADO";
  return "BAIXO";
}

function formatTeamAiOutput(path, data) {
  if (!data || typeof data !== "object") return `<p>${escapeHtml(data)}</p>`;

  if (path === "/ai/team/priorities" && Array.isArray(data.items)) {
    if (!data.items.length) return "<p>Sem pacientes prioritários no momento.</p>";
    const lines = data.items.map((item, idx) => {
      const risk = item?.risk || {};
      const pending = item?.protocol || {};
      return `
        <div class="record-card">
          <div class="record-hd">
            <span class="record-title">${idx + 1}. ${escapeHtml(item.patientName || "-")}</span>
            <span class="status ${String(risk.level || "").toLowerCase() === "alto" ? "alert" : (String(risk.level || "").toLowerCase() === "moderado" ? "pending" : "progress")}">${riskLabel(risk.level)}</span>
          </div>
          <div class="record-body">
            <p><strong>Microárea:</strong> ${escapeHtml(item.microArea || "-")}</p>
            <p><strong>Pendências:</strong> Visitas ${Number(pending.visits || 0)}, Consultas ${Number(pending.consultations || 0)}, Vacinas ${Number(pending.vaccines || 0)}</p>
            <p><strong>Ação sugerida:</strong> ${escapeHtml(item.topAction || "Revisar prontuário.")}</p>
          </div>
        </div>`;
    }).join("");
    return renderAiSection("Prioridades do dia", lines);
  }

  if (path === "/ai/team/data-quality" && Array.isArray(data.findings)) {
    if (!data.findings.length) return "<p>Nenhum problema de qualidade de dados encontrado.</p>";
    const rows = data.findings.map((f, idx) => `
      <div class="home-task-row">
        <div>
          <p class="home-task-title">${idx + 1}. ${escapeHtml(f.patientName || "-")}</p>
          <p class="home-task-meta">${escapeHtml(f.issue || "-")}</p>
        </div>
        <span class="status ${String(f.severity || "").toLowerCase() === "high" ? "alert" : "pending"}">${String(f.severity || "").toUpperCase()}</span>
      </div>
    `).join("");
    return renderAiSection("Qualidade de dados", rows);
  }

  if (path === "/ai/team/report") {
    return `
      ${data.executiveSummary ? renderAiSection("Resumo executivo", `<p>${escapeHtml(data.executiveSummary)}</p>`) : ""}
      ${data.totals ? renderAiSection("Totais", `
        <p><strong>Pacientes:</strong> ${Number(data.totals.patients || 0)}</p>
        <p><strong>Alto risco:</strong> ${Number(data.totals.highRiskPatients || 0)}</p>
        <p><strong>Tarefas atrasadas:</strong> ${Number(data.totals.overdueTasks || 0)}</p>
      `) : ""}
      ${Array.isArray(data.recommendations) ? renderAiSection("Recomendações", `<ul>${data.recommendations.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`) : ""}
    `;
  }

  return null;
}

function formatPhone(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatCpf(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatCep(value) {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatCns(value) {
  const d = onlyDigits(value).slice(0, 15);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 11) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)} ${d.slice(11)}`;
}

function parseWeeksInput(value) {
  const raw = onlyDigits(value).slice(0, 2);
  if (!raw) return "";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return "";
  return Math.max(0, Math.min(parsed, 45));
}

function parseGestationalDaysInput(value) {
  const raw = onlyDigits(value).slice(0, 1);
  if (!raw) return "";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return "";
  return Math.max(0, Math.min(parsed, 6));
}

function splitAddress(address) {
  const raw = String(address || "").trim();
  if (!raw) return { street: "", number: "", neighborhood: "", city: "", state: "", cep: "" };

  let street = "";
  let number = "";
  let neighborhood = "";
  let city = "";
  let state = "";
  let cep = "";

  const pipePairs = Object.fromEntries(
    raw.split("|").map((part) => part.trim()).map((part) => {
      const [k, ...rest] = part.split(":");
      return [String(k || "").trim().toLowerCase(), rest.join(":").trim()];
    })
  );
  if (pipePairs.rua || pipePairs.numero || pipePairs.bairro || pipePairs.cidade || pipePairs.uf || pipePairs.cep) {
    street = pipePairs.rua || "";
    number = pipePairs.numero || "";
    neighborhood = pipePairs.bairro || "";
    city = pipePairs.cidade || "";
    state = pipePairs.uf || "";
    cep = formatCep(pipePairs.cep || "");
    return { street, number, neighborhood, city, state, cep };
  }

  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  street = parts[0] || "";
  if (parts.length >= 5) {
    number = parts[1] || "";
    neighborhood = parts[2] || "";
    city = parts[3] || "";
    state = parts[4] || "";
  } else {
    neighborhood = parts[1] || "";
    city = parts[2] || "";
    state = parts[3] || "";
  }

  if (!state && city && city.includes("/")) {
    const [cityPart, ufPart] = city.split("/").map((part) => part.trim());
    city = cityPart || "";
    state = ufPart || "";
  }

  return { street, number, neighborhood, city, state, cep };
}

function buildAddress() {
  const street = String(el.pStreet?.value || "").trim();
  const number = String(el.pNumber?.value || "").trim();
  const neighborhood = String(el.pNeighborhood?.value || "").trim();
  const city = String(el.pCity?.value || "").trim();
  const stateUf = String(el.pState?.value || "").trim().toUpperCase();
  const cep = formatCep(el.pCep?.value || "");
  const parts = [];
  if (street) parts.push(`Rua: ${street}`);
  if (number) parts.push(`Numero: ${number}`);
  if (neighborhood) parts.push(`Bairro: ${neighborhood}`);
  if (city) parts.push(`Cidade: ${city}`);
  if (stateUf) parts.push(`UF: ${stateUf}`);
  if (cep) parts.push(`CEP: ${cep}`);
  return parts.join(" | ");
}

function getSelectedChronicConditions() {
  const values = [];
  if (el.pChronicHypertension?.checked) values.push("hypertension");
  if (el.pChronicDiabetes?.checked) values.push("diabetes");
  return values;
}

function setSelectedChronicConditions(items = []) {
  const set = new Set(Array.isArray(items) ? items : []);
  if (el.pChronicHypertension) el.pChronicHypertension.checked = set.has("hypertension");
  if (el.pChronicDiabetes) el.pChronicDiabetes.checked = set.has("diabetes");
}

function updateChronicConditionsVisibility() {
  const category = el.pCareCategory?.value || "";
  const isChronic = el.pCareCategory?.value === "chronic";
  el.pChronicConditionsWrap?.classList.toggle("hidden", !isChronic);
  const isChild = category === "child_followup";
  const isPregnant = category === "pregnant";
  const isPuerperal = category === "puerperal";
  el.pMotherNameWrap?.classList.toggle("hidden", !isChild);
  el.pMaritalStatusWrap?.classList.toggle("hidden", isChild);
  if (isChild && el.pMaritalStatus) el.pMaritalStatus.value = "";
  el.pPregnancyFieldsWrap?.classList.toggle("hidden", !isPregnant);
  el.pPuerperalFieldsWrap?.classList.toggle("hidden", !isPuerperal);
}

function setFieldError(field, message = "") {
  if (!field) return;
  field.setCustomValidity(message || "");
  if (message) field.reportValidity();
}

function clearPatientFieldErrors() {
  [
    el.pName, el.pBirthDate, el.pCpf, el.pCns, el.pCep, el.pStreet, el.pNumber,
    el.pNeighborhood, el.pCity, el.pState, el.pPhone, el.pPhoneAlt, el.pSexAtBirth,
    el.pMaritalStatus, el.pMotherName
  ].forEach((field) => setFieldError(field, ""));
}

function validatePatientForm() {
  clearPatientFieldErrors();
  const required = [
    ["Nome", el.pName],
    ["Data de nascimento", el.pBirthDate],
    ["CPF", el.pCpf],
    ["CNS", el.pCns],
    ["CEP", el.pCep],
    ["Rua", el.pStreet],
    ["Numero", el.pNumber],
    ["Bairro", el.pNeighborhood],
    ["Cidade", el.pCity],
    ["Estado", el.pState],
    ["Telefone principal", el.pPhone],
    ["Telefone secundario", el.pPhoneAlt],
    ["Sexo", el.pSexAtBirth]
  ];
  if (el.pCareCategory.value !== "child_followup") required.push(["Estado civil", el.pMaritalStatus]);

  const firstMissing = required.find(([, field]) => !String(field?.value || "").trim());
  if (firstMissing) {
    const [label, field] = firstMissing;
    setFieldError(field, `Campo obrigatório: ${label}`);
    showToast(`Preencha o campo obrigatório: ${label}`, "error");
    return false;
  }

  if (el.pCareCategory.value === "child_followup" && !String(el.pMotherName.value || "").trim()) {
    setFieldError(el.pMotherName, "Nome da mãe é obrigatório para criança.");
    showToast("Para criança, informe o nome da mae.", "error");
    return false;
  }

  return true;
}

// -- API ----------------------------------------------------------------------
async function api(path, options = {}) {
  touchSession();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const res = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal }).finally(() => clearTimeout(timeout));
  const requestId = res.headers.get("X-Request-Id") || "";
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.error || "Erro na requisição";
    throw new Error(requestId ? `${message} [req:${requestId}]` : message);
  }
  touchSession();
  return res.json();
}

// -- Auth tabs -----------------------------------------------------------------
document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const t = tab.dataset.tab;
    document.getElementById("loginTab").classList.toggle("hidden", t !== "login");
    document.getElementById("registerTab").classList.toggle("hidden", t !== "register");
  });
});

// -- Password toggle -----------------------------------------------------------
el.togglePass?.addEventListener("click", () => {
  el.loginPassword.type = el.loginPassword.type === "password" ? "text" : "password";
});

// -- Session view --------------------------------------------------------------
function updateSessionView() {
  if (!state.user) {
    el.logoutBtn.classList.add("hidden");
    el.homeBtn?.classList.add("hidden");
    el.profileBtn?.classList.add("hidden");
    if (el.mobileUserName) el.mobileUserName.textContent = "-";
    if (el.mobileUserRole) el.mobileUserRole.textContent = "-";
    if (el.mobileUserAvatar) el.mobileUserAvatar.textContent = "?";
    return;
  }
  const roleMap = { nurse_manager: "Enfermeira", doctor: "Médico(a)", acs: "ACS" };
  const roleText = roleMap[state.user.role] || state.user.role;
  const teamText = String(state.user.teamName || "").trim();
  const roleWithTeam = teamText ? `${roleText} • ${teamText}` : roleText;
  const avatarText = state.user.name.charAt(0).toUpperCase();
  el.userName.textContent  = state.user.name;
  el.userRole.textContent  = roleWithTeam;
  el.userAvatar.textContent = avatarText;
  if (el.mobileUserName) el.mobileUserName.textContent = state.user.name;
  if (el.mobileUserRole) el.mobileUserRole.textContent = roleWithTeam;
  if (el.mobileUserAvatar) el.mobileUserAvatar.textContent = avatarText;
  el.logoutBtn.classList.remove("hidden");
  el.homeBtn?.classList.add("hidden");
  el.profileBtn?.classList.remove("hidden");
}

function isMobileLayout() {
  return window.matchMedia("(max-width: 960px)").matches;
}

function closeSidebarDrawer() {
  el.sidebar?.classList.remove("open");
  el.sidebarBackdrop?.classList.remove("open");
  el.sidebarBackdrop?.classList.add("hidden");
}

function openSidebarDrawer() {
  if (!isMobileLayout()) return;
  el.sidebar?.classList.add("open");
  el.sidebarBackdrop?.classList.remove("hidden");
  el.sidebarBackdrop?.classList.add("open");
}

function toggleSidebarDrawer() {
  if (!isMobileLayout()) return;
  if (el.sidebar?.classList.contains("open")) {
    closeSidebarDrawer();
    return;
  }
  openSidebarDrawer();
}

el.logoutBtn?.addEventListener("click", () => logoutUser(false));

// -- Register visibility -------------------------------------------------------
function updateRegisterFormVisibility() {
  const role = el.registerRole?.value || "nurse_manager";
  el.registerCouncilNumberWrap.classList.remove("hidden");
  el.registerCouncilUfWrap.classList.remove("hidden");
  el.registerTeamNameWrap?.classList.add("hidden");
  el.registerTeamWrap?.classList.remove("hidden");
  el.councilNumLabel.textContent = "Conselho";
  const maxLen = role === "doctor" ? 8 : 10;
  el.registerCouncilNumber.placeholder = "Somente números";
  el.registerCouncilNumber.maxLength = maxLen + 1;
  el.registerCouncilNumber.value = formatCouncilNumber(el.registerCouncilNumber.value, maxLen);
}

function readViewState() {
  try {
    const raw = localStorage.getItem(VIEW_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function persistViewState() {
  if (!state.token) return;
  const activePatientPanel = document.querySelector(".ptab.active")?.dataset.panel || "panelProtocol";
  const payload = {
    navSection: state.navSection,
    workspaceTab: state.workspaceTab,
    selectedPatientId: state.selectedPatient?.id || "",
    activePatientPanel
  };
  localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(payload));
}

// -- Council validation --------------------------------------------------------
const isSeqDigits = s => { let a=true,d=true; for(let i=1;i<s.length;i++){if(+s[i]!==+s[i-1]+1)a=false;if(+s[i]!==+s[i-1]-1)d=false;} return a||d; };
const isRepDigits = s => /^(\d)\1+$/.test(s);
function validateCouncil(role, num, uf) {
  if (!["doctor","nurse_manager"].includes(role)) return { ok: true };
  const d = String(num||"").replace(/\D/g,"");
  const u = String(uf||"").trim().toUpperCase();
  const maxLen = role === "doctor" ? 8 : 10;
  const validUf = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;
  if (d.length < 4 || d.length > maxLen) return { ok:false, message:`Conselho deve ter entre 4 e ${maxLen} digitos` };
  if (isRepDigits(d)) return { ok:false, message:"Conselho inválido: dígitos repetidos" };
  if (isSeqDigits(d)) return { ok:false, message:"Conselho inválido: sequência numérica" };
  if (!validUf.test(u)) return { ok:false, message:"UF do conselho inválida" };
  return { ok:true, number:d, uf:u };
}

// -- Select helpers ------------------------------------------------------------
function fillCategorySelect(sel, withAll=false) {
  if (!sel) return;
  sel.innerHTML = "";
  if (withAll) sel.appendChild(Object.assign(document.createElement("option"), { value:"", textContent:"Todas" }));
  state.protocolTemplates.forEach(t => sel.appendChild(Object.assign(document.createElement("option"), { value:t.category, textContent:t.label })));
}
function fillAcsSelect(sel, withAll=false) {
  if (!sel) return;
  sel.innerHTML = "";
  if (withAll) sel.appendChild(Object.assign(document.createElement("option"), { value:"", textContent:"Todos" }));
  state.users.filter(u => u.role === "acs").forEach(u => sel.appendChild(Object.assign(document.createElement("option"), { value:u.id, textContent:u.name })));
}
function fillTeamSelect() {
  if (!el.registerTeam) return;
  el.registerTeam.innerHTML = "";
  el.registerTeam.appendChild(Object.assign(document.createElement("option"), { value: "", textContent: "Selecione a equipe" }));
  state.publicTeams.forEach(t => el.registerTeam.appendChild(Object.assign(document.createElement("option"), { value:t.id, textContent:t.name })));
}

function fillUfSelect(sel, emptyLabel = "Selecione UF") {
  if (!sel) return;
  const current = String(sel.value || "").toUpperCase();
  sel.innerHTML = "";
  sel.appendChild(Object.assign(document.createElement("option"), { value: "", textContent: emptyLabel }));
  BRAZIL_UFS.forEach((uf) => {
    sel.appendChild(Object.assign(document.createElement("option"), { value: uf, textContent: uf }));
  });
  if (current && BRAZIL_UFS.includes(current)) sel.value = current;
}

function fillCouncilUfSelects() {
  fillUfSelect(el.registerCouncilUf);
  fillUfSelect(el.managerCreateCouncilUf);
  fillUfSelect(el.profileCouncilUf);
  fillUfSelect(el.editTeamUserCouncilUf);
}

function councilDigits(value, maxLen) {
  return String(value || "").replace(/\D/g, "").slice(0, Number(maxLen || 10));
}

function formatCouncilNumber(value, maxLen) {
  const digits = councilDigits(value, maxLen);
  const splitIndex = Number(maxLen) === 8 ? 4 : 5;
  if (digits.length <= splitIndex) return digits;
  return `${digits.slice(0, splitIndex)} ${digits.slice(splitIndex)}`;
}

async function reloadTemplateData() {
  state.protocolTemplates = await api("/protocol/templates");
  fillCategorySelect(el.pCareCategory);
  fillCategorySelect(el.topFilterCategory, true);
  renderWorkspaceHome();
  renderPatients();
  renderProtocolAdminList();
  if (state.selectedPatient) {
    await loadProtocolSummary();
  }
}

// -- Role permissions ----------------------------------------------------------
function applyRolePermissions() {
  const patientFields = ["pName","pMotherName","pPhone","pPhoneAlt","pCpf","pCns","pCep","pStreet","pNumber","pNeighborhood","pCity","pState","pComorb","pMeds","pAllergies","pAcs","pCareCategory","pBirthDate","pSexAtBirth","pMaritalStatus","pGenderIdentity","pPregnancyStartDate","pExpectedDeliveryDate","pGestationalAgeDumWeeks","pGestationalAgeDumDays","pGestationalAgeUsgWeeks","pGestationalAgeUsgDays","pUsgDate1","pUsgDate2","pUsgDate3","pPrenatalStartDate","pPostpartumStartDate"];
  const taskFields = ["tTitle","tNotes","tDue","tAssignee"];
  const mgrFields = ["pName","pMotherName","pPhone","pPhoneAlt","pCpf","pCns","pCep","pStreet","pNumber","pNeighborhood","pCity","pState","pComorb","pMeds","pAllergies","pAcs","pCareCategory","pBirthDate","pSexAtBirth","pMaritalStatus","pGenderIdentity","pPregnancyStartDate","pExpectedDeliveryDate","pGestationalAgeDumWeeks","pGestationalAgeDumDays","pGestationalAgeUsgWeeks","pGestationalAgeUsgDays","pUsgDate1","pUsgDate2","pUsgDate3","pPrenatalStartDate","pPostpartumStartDate","tTitle","tNotes","tDue","tAssignee"];
  const clinFields = ["aDate","aDemandType","aSummary","aConduct","aNext"];

  if (isManager()) {
    restoreRecordTypeOptions();
    el.addAppointmentBtn.classList.remove("hidden");
    el.addAppointmentAndRecordBtn?.classList.remove("hidden");
    el.addTaskBtn.classList.remove("hidden");
    el.editPatientBtn.classList.remove("hidden");
    el.deletePatientBtn.classList.remove("hidden");
    el.auditTab.classList.remove("hidden");
    el.appointmentFormCard.classList.remove("hidden");
    el.taskFormCard.classList.remove("hidden");
    mgrFields.forEach(id => { document.getElementById(id).disabled = false; });
    clinFields.forEach(id => { document.getElementById(id).disabled = false; });
    [...el.rType.options].forEach(o => { o.disabled = false; });
    el.topFilterAcs?.closest(".field-group")?.classList.remove("hidden");
    el.quickSelectFirstPatientBtn?.classList.remove("hidden");
    el.openPatientModalBtn?.classList.remove("hidden");
    el.sendMsgBtn?.classList.remove("hidden");
    if (el.mText) el.mText.disabled = false;
    return;
  }
  el.addTaskBtn.classList.add("hidden");
  el.auditTab.classList.add("hidden");
  el.taskFormCard.classList.add("hidden");
  mgrFields.forEach(id => { document.getElementById(id).disabled = true; });

  if (isDoctor()) {
    restoreRecordTypeOptions();
    el.addAppointmentBtn.classList.remove("hidden");
    el.addAppointmentAndRecordBtn?.classList.remove("hidden");
    el.addTaskBtn.classList.remove("hidden");
    el.editPatientBtn.classList.remove("hidden");
    el.deletePatientBtn.classList.remove("hidden");
    el.auditTab.classList.remove("hidden");
    el.appointmentFormCard.classList.remove("hidden");
    el.taskFormCard.classList.remove("hidden");
    clinFields.forEach(id => { document.getElementById(id).disabled = false; });
    mgrFields.forEach(id => { document.getElementById(id).disabled = false; });
    [...el.rType.options].forEach(o => { o.disabled = o.value === "visit"; });
    if (el.rType.value === "visit") el.rType.value = "consultation";
    el.topFilterAcs?.closest(".field-group")?.classList.remove("hidden");
    el.quickSelectFirstPatientBtn?.classList.remove("hidden");
    el.openPatientModalBtn?.classList.remove("hidden");
    el.sendMsgBtn?.classList.remove("hidden");
    if (el.mText) el.mText.disabled = false;
    return;
  }
  // ACS
  setAcsRecordTypeOnly();
  el.editPatientBtn.classList.add("hidden");
  el.deletePatientBtn.classList.add("hidden");
  el.addAppointmentBtn.classList.add("hidden");
  el.addAppointmentAndRecordBtn?.classList.add("hidden");
  el.addTaskBtn.classList.add("hidden");
  el.appointmentFormCard.classList.add("hidden");
  el.taskFormCard.classList.add("hidden");
  clinFields.forEach(id => { document.getElementById(id).disabled = true; });
  el.quickSelectFirstPatientBtn?.classList.add("hidden");
  el.openPatientModalBtn?.classList.add("hidden");
  el.sendMsgBtn?.classList.add("hidden");
  if (el.mText) el.mText.disabled = true;
  el.topFilterAcs?.closest(".field-group")?.classList.add("hidden");
}

// -- Topbar patient breadcrumb --------------------------------------------------
function updateTopbarPatient() {
  if (!state.selectedPatient) { el.topbarPatient.innerHTML = ""; return; }
  const p = state.selectedPatient;
  el.topbarPatient.innerHTML = `
    <div class="topbar-patient-info">
      <span class="topbar-sep">|</span>
      <span class="topbar-patient-name">${p.name}</span>
      <span class="topbar-sep">|</span>
      <span>${catLabel(p.careCategory)}</span>
    </div>`;
}

// -- Render: patients ----------------------------------------------------------
function renderPatients() {
  renderHomePatientTable();
}

// -- Render: patient header -----------------------------------------------------
function renderPatientHeader() {
  if (!state.selectedPatient) {
    el.emptyState.classList.remove("hidden");
    el.patientContent.classList.add("hidden");
    el.topbarPatient.innerHTML = "";
    renderWorkspaceHome();
    return;
  }
  el.emptyState.classList.add("hidden");
  el.patientContent.classList.remove("hidden");
  const p = state.selectedPatient;
  el.selectedPatientTitle.textContent = p.name;
  el.patientAvatar.textContent = p.name.charAt(0).toUpperCase();
  const chips = [
    `<span class="chip blue">${catLabel(p.careCategory)}</span>`,
    p.careCategory === "chronic" && Array.isArray(p.chronicConditions) && p.chronicConditions.length
      ? `<span class="chip">${p.chronicConditions.map((c) => c === "diabetes" ? "Diabetes" : "Hipertensão").join(" + ")}</span>`
      : null,
    p.microArea && `<span class="chip">MA ${p.microArea}</span>`,
    p.phone     && `<span class="chip">${p.phone}</span>`,
    p.cnsCpf    && `<span class="chip">${p.cnsCpf}</span>`,
    `<span class="chip teal">ACS: ${acsNameById(p.assignedAcsId)}</span>`,
  ].filter(Boolean);
  el.selectedPatientMeta.innerHTML = chips.join("");
  updateTopbarPatient();
}

function renderWorkspaceHome() {
  if (!el.kpiPatientsTotal) return;
  const totalPatients = state.patients.length;
  const assignedPatients = state.patients.filter(p => p.assignedAcsId).length;
  const openTasks = state.globalTasks.filter(taskOpen);
  const categoryMap = new Map();

  state.patients.forEach(p => {
    const label = catLabel(p.careCategory);
    categoryMap.set(label, (categoryMap.get(label) || 0) + 1);
  });

  const categoryEntries = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);
  const priorityTasks = [...openTasks]
    .sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    })
    .slice(0, 6);

  el.kpiPatientsTotal.textContent = String(totalPatients);
  el.kpiPatientsAssigned.textContent = String(assignedPatients);
  el.kpiTasksOpen.textContent = String(openTasks.length);
  el.kpiCategories.textContent = String(categoryEntries.length);

  if (!categoryEntries.length) {
    el.categorySummaryList.innerHTML = '<div class="empty-msg">Sem categorias com pacientes no momento.</div>';
  } else {
    el.categorySummaryList.innerHTML = categoryEntries.map(([label, count]) => `
      <div class="home-list-row">
        <span class="home-list-main">${label}</span>
        <span class="home-list-pill">${count}</span>
      </div>`).join("");
  }

  if (!priorityTasks.length) {
    el.priorityTaskList.innerHTML = '<div class="empty-msg">Sem pendências prioritárias.</div>';
  } else {
    el.priorityTaskList.innerHTML = priorityTasks.map(t => `
      <div class="home-task-row">
        <div>
          <p class="home-task-title">${t.title}</p>
          <p class="home-task-meta">Paciente: ${(state.patients.find(p => p.id === t.patientId)?.name || "-")} | ACS: ${acsNameById(t.assigneeId)}</p>
        </div>
        <span class="home-task-due">${t.dueDate || "Sem prazo"}</span>
      </div>`).join("");
  }

  renderProtocolDeadlineAlerts();
  renderMonthlyDemandKpi();
  renderDataQualityCard();
  renderTeamActivityLog();
  renderProtocolAdminList();
  renderDashboardFilterOptions();
  renderHomePatientTable();
}

function renderMonthlyDemandKpi() {
  if (!el.kpiDemandRatio || !el.kpiDemandMeta || !el.kpiDemandAlert) return;
  if (!(isManager() || isDoctor())) {
    el.kpiDemandRatio.textContent = "--";
    el.kpiDemandMeta.textContent = "Disponível para enfermeira e médica";
    el.kpiDemandAlert.textContent = "";
    return;
  }

  const metric = state.demandMonthly;
  if (!metric) {
    el.kpiDemandRatio.textContent = "--";
    el.kpiDemandMeta.textContent = "Meta: 50% a 70%";
    el.kpiDemandAlert.textContent = "Carregando indicador mensal...";
    return;
  }

  el.kpiDemandRatio.textContent = `${Number(metric.ratioScheduled || 0).toFixed(2)}%`;
  el.kpiDemandMeta.textContent = `Programada: ${metric.totals?.scheduled || 0} | Espontânea: ${metric.totals?.spontaneous || 0} | Total: ${metric.totals?.total || 0}`;

  if (metric.status === "out_of_range") {
    el.kpiDemandAlert.textContent = "Alerta: fora da meta mensal (50% a 70%).";
    el.kpiDemandAlert.style.color = "#b42318";
  } else if (metric.status === "in_range") {
    el.kpiDemandAlert.textContent = "Dentro da meta mensal.";
    el.kpiDemandAlert.style.color = "#067647";
  } else {
    el.kpiDemandAlert.textContent = "Sem dados de atendimentos no mês.";
    el.kpiDemandAlert.style.color = "";
  }
}

function renderDataQualityCard() {
  if (!el.dataQualitySummary || !el.dataQualityList) return;
  if (!(isManager() || isDoctor())) {
    el.dataQualitySummary.textContent = "Disponível para enfermeira e médica.";
    el.dataQualityList.innerHTML = "";
    return;
  }

  if (!state.dataQuality) {
    el.dataQualitySummary.textContent = "Carregando qualidade de dados...";
    el.dataQualityList.innerHTML = "";
    return;
  }

  const metric = state.dataQuality;
  const stats = metric.stats || {};
  el.dataQualitySummary.textContent = metric.summary || `Qualidade de dados: ${metric.score || 0}/100`;
  const rows = [
    ["Pacientes sem telefone", stats.missingPhone || 0],
    ["Pacientes sem ACS", stats.missingAcs || 0],
    ["CPF duplicado", stats.duplicatedCpfPatients || 0],
    ["CNS duplicado", stats.duplicatedCnsPatients || 0],
    ["Sem endereço", stats.missingAddress || 0],
    ["Sem CPF", stats.missingCpf || 0],
    ["Sem CNS", stats.missingCns || 0]
  ];

  el.dataQualityList.innerHTML = rows.map(([label, value]) => `
    <div class="home-list-row">
      <span class="home-list-main">${label}</span>
      <span class="home-list-pill">${value}</span>
    </div>
  `).join("");
}

function userRoleLabel(role) {
  const map = { nurse_manager: "Enfermeira", doctor: "Médico(a)", acs: "ACS" };
  return map[String(role || "").toLowerCase()] || String(role || "-");
}

function renderTeamActivityLog() {
  if (!el.teamActivityCard || !el.teamActivityList) return;
  const canView = isAnaAdminAccount();
  el.teamActivityCard.classList.toggle("hidden", !canView);
  if (!canView) return;

  const items = Array.isArray(state.teamActivityLog) ? state.teamActivityLog : [];
  if (!items.length) {
    el.teamActivityList.innerHTML = '<div class="empty-msg">Sem dados de atividade no momento.</div>';
    return;
  }

  const onlineLabel = state.teamActivityWindowSeconds
    ? `online <= ${Math.floor(Number(state.teamActivityWindowSeconds || 0) / 60)} min`
    : "online";

  el.teamActivityList.innerHTML = items.map((u) => {
    const online = Boolean(u.online);
    const statusClass = online ? "status done" : "status pending";
    const statusText = online ? "ONLINE" : "OFFLINE";
    const seenText = u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString("pt-BR") : "Sem atividade";
    return `
      <div class="home-task-row">
        <div>
          <p class="home-task-title">${u.name} <span class="home-task-meta">(${userRoleLabel(u.role)})</span></p>
          <p class="home-task-meta">${u.teamName || "Sem equipe"} | ${u.email || "-"}</p>
          <p class="home-task-meta">Última atividade: ${seenText}</p>
        </div>
        <span class="${statusClass}" title="${onlineLabel}">${statusText}</span>
      </div>`;
  }).join("");
}

function renderProtocolDeadlineAlerts() {
  if (!el.protocolDeadlineAlertsList) return;
  const labels = { visits: "visita", consultations: "consulta", vaccines: "vacina" };
  const alerts = [];
  const isVaccineAlertItem = (item = {}) => /vacina/i.test(String(item.activity || item.title || ""));
  const severityLabel = (value) => {
    if (value === "lost") return "PERDIDO";
    if (value === "high") return "ALTO";
    if (value === "medium") return "MÉDIO";
    return "BAIXO";
  };
  const classifyVisitDeadline = (daysLeft, overdue) => {
    if (overdue > 0) return { severity: "lost", severityClass: "status lost" };
    if (daysLeft <= 3) return { severity: "high", severityClass: "status alert" };
    if (daysLeft <= 7) return { severity: "medium", severityClass: "status pending" };
    return { severity: "low", severityClass: "status progress" };
  };
  const classifyVaccineDeadline = (daysLeft, overdue) => {
    if (overdue > 0) return { severity: "high", severityClass: "status alert" };
    if (daysLeft <= 2) return { severity: "medium", severityClass: "status pending" };
    return { severity: "low", severityClass: "status progress" };
  };

  state.patients.forEach((patient) => {
    const summary = state.protocolByPatient[patient.id];
    if (!summary?.schedule) return;
    ["visits", "consultations", "vaccines"].forEach((key) => {
      const item = summary.schedule[key];
      if (!item) return;
      if (Number(item.intervalDays || 0) <= 0) return;
      if (Number(item.pending || 0) <= 0) return;
      if (item.daysLeft === null || item.daysLeft === undefined) return;

      const overdue = Number(item.overdueDays || 0);
      const daysLeft = Number(item.daysLeft || 0);
      let severity = "low";
      let severityClass = "status progress";
      let score = 0;

      if (key === "visits") {
        const visitState = classifyVisitDeadline(daysLeft, overdue);
        severity = visitState.severity;
        severityClass = visitState.severityClass;
        score = overdue > 0 ? 130 + overdue : (daysLeft <= 7 ? 70 - daysLeft : 20 - Math.min(daysLeft, 20));
      } else if (key === "vaccines") {
        const vaccineState = classifyVaccineDeadline(daysLeft, overdue);
        severity = vaccineState.severity;
        severityClass = vaccineState.severityClass;
        score = overdue > 0 ? 120 + overdue : (daysLeft <= 2 ? 65 - daysLeft : 18 - Math.min(daysLeft, 18));
      } else {
        if (overdue > 0) {
          severity = "high";
          severityClass = "status alert";
          score = 100 + overdue;
        } else if (daysLeft <= 3) {
          severity = "high";
          severityClass = "status alert";
          score = 80 - daysLeft;
        } else if (daysLeft <= 7) {
          severity = "medium";
          severityClass = "status pending";
          score = 60 - daysLeft;
        } else {
          score = 20 - Math.min(daysLeft, 20);
        }
      }

      alerts.push({
        source: "interval",
        patientName: patient.name,
        category: summary.categoryLabel || catLabel(patient.careCategory),
        activity: labels[key],
        daysLeft,
        overdue,
        severity,
        severityClass,
        score
      });
    });

    const special = Array.isArray(summary.specialAlerts) ? summary.specialAlerts : [];
    special.forEach((item) => {
      const severity = item.severity || "low";
      const overdue = Number(item.overdue || 0);
      const daysLeft = item.daysLeft === null || item.daysLeft === undefined ? null : Number(item.daysLeft);
      let score = severity === "high" ? 90 : (severity === "medium" ? 70 : 40);
      if (overdue > 0) score += Math.min(overdue, 30);
      if (daysLeft !== null) {
        const threshold = isVaccineAlertItem(item) ? 2 : 7;
        if (daysLeft <= threshold) score += 12;
      }
      alerts.push({
        source: "clinical",
        patientName: patient.name,
        category: item.category || summary.categoryLabel || catLabel(patient.careCategory),
        activity: item.activity || "protocolo clínico",
        title: item.title || "Pendência do protocolo",
        detail: item.detail || "",
        daysLeft,
        overdue,
        severity,
        severityClass: item.severityClass || (severity === "high" ? "status alert" : (severity === "medium" ? "status pending" : "status progress")),
        score
      });
    });
  });

  alerts.sort((a, b) => b.score - a.score);
  const overdueAlerts = alerts.filter((item) => Number(item.overdue || 0) > 0);
  const nonOverdueAlerts = alerts.filter((item) => Number(item.overdue || 0) <= 0);
  const topAlerts = [...overdueAlerts, ...nonOverdueAlerts];
  if (!topAlerts.length) {
    el.protocolDeadlineAlertsList.innerHTML = '<div class="empty-msg">Sem alertas de prazo no momento.</div>';
    return;
  }

  el.protocolDeadlineAlertsList.innerHTML = topAlerts.map((alert) => {
    let deadlineText = "";
    if (alert.overdue > 0) deadlineText = `${alert.overdue} dia(s) em atraso`;
    else if (alert.daysLeft !== null && alert.daysLeft !== undefined) deadlineText = `faltam ${alert.daysLeft} dia(s)`;
    else deadlineText = alert.detail || "Atenção ao protocolo";
    return `
      <div class="home-task-row">
        <div>
          <p class="home-task-title">${alert.patientName} - ${alert.title || alert.activity}</p>
          <p class="home-task-meta">${alert.category} | ${deadlineText}</p>
        </div>
        <span class="${alert.severityClass}">${severityLabel(alert.severity)}</span>
      </div>`;
  }).join("");
}

function protocolStatusInfo(summary) {
  if (!summary) {
    return { key: "loading", label: "Carregando...", className: "status progress" };
  }

  const specialAlerts = Array.isArray(summary.specialAlerts) ? summary.specialAlerts : [];
  const isVaccineAlertItem = (item = {}) => /vacina/i.test(String(item.activity || item.title || ""));
  const overdueSpecial = specialAlerts.filter((a) => Number(a?.overdue || 0) > 0).length;
  const dueSoonSpecial = specialAlerts.filter((a) => {
    const overdue = Number(a?.overdue || 0);
    const rawDaysLeft = a?.daysLeft;
    if (rawDaysLeft === null || rawDaysLeft === undefined || rawDaysLeft === "") return false;
    const daysLeft = Number(rawDaysLeft);
    const threshold = isVaccineAlertItem(a) ? 2 : 7;
    return overdue <= 0 && Number.isFinite(daysLeft) && daysLeft >= 0 && daysLeft <= threshold;
  }).length;

  const doneTotal = Number(summary.completed?.visits || 0)
    + Number(summary.completed?.consultations || 0)
    + Number(summary.completed?.vaccines || 0);

  const targetTotal = Number(summary.targets?.visits || 0)
    + Number(summary.targets?.consultations || 0)
    + Number(summary.targets?.vaccines || 0);

  const schedule = summary.schedule || {};
  const scheduleOverdue = ["visits", "consultations", "vaccines"].reduce((acc, key) => {
    const item = schedule[key] || {};
    return acc + (Number(item.overdueDays || 0) > 0 ? 1 : 0);
  }, 0);
  const scheduleDueSoon = ["visits", "consultations", "vaccines"].reduce((acc, key) => {
    const item = schedule[key] || {};
    const rawDaysLeft = item.daysLeft;
    if (rawDaysLeft === null || rawDaysLeft === undefined || rawDaysLeft === "") return acc;
    const daysLeft = Number(rawDaysLeft);
    const overdue = Number(item.overdueDays || 0);
    if (overdue > 0) return acc;
    if (!Number.isFinite(daysLeft)) return acc;
    const threshold = key === "vaccines" ? 2 : 7;
    return acc + (daysLeft >= 0 && daysLeft <= threshold ? 1 : 0);
  }, 0);

  const overdueCount = overdueSpecial + scheduleOverdue;
  if (overdueCount > 0) {
    return { key: "critical", label: `Atraso crítico (${overdueCount} vencido[s])`, className: "status alert" };
  }

  const dueSoonCount = dueSoonSpecial + scheduleDueSoon;
  if (dueSoonCount > 0) {
    return { key: "attention", label: `Atenção (${dueSoonCount} próximo[s] do prazo)`, className: "status pending" };
  }
  return { key: "ok", label: `Em dia (${doneTotal}/${targetTotal || doneTotal || 0})`, className: "status done" };
}

function sortedPatientsForDashboard(list) {
  const copy = [...list];
  const [key, direction] = state.dashboardSort.split("_");
  const dir = direction === "desc" ? -1 : 1;
  copy.sort((a, b) => {
    if (key === "category") return catLabel(a.careCategory).localeCompare(catLabel(b.careCategory)) * dir;
    if (key === "microarea") return (a.microArea || "").localeCompare(b.microArea || "") * dir;
    return (a.name || "").localeCompare(b.name || "") * dir;
  });
  return copy;
}

function getFilteredDashboardPatients() {
  const query = state.dashboardQuery.trim().toLowerCase();
  let list = state.patients.filter((p) => {
    if (!query) return true;
    const hay = [
      p.name,
      p.phone,
      p.microArea,
      catLabel(p.careCategory),
      acsNameById(p.assignedAcsId)
    ].join(" ").toLowerCase();
    return hay.includes(query);
  });

  if (state.dashboardCategory) list = list.filter((p) => p.careCategory === state.dashboardCategory);
  if (state.dashboardAcsId) list = list.filter((p) => p.assignedAcsId === state.dashboardAcsId);
  if (state.dashboardProtocolStatus !== "all") {
    list = list.filter((p) => protocolStatusInfo(state.protocolByPatient[p.id]).key === state.dashboardProtocolStatus);
  }

  return sortedPatientsForDashboard(list);
}

function renderHomePatientTable() {
  if (!el.homePatientTableBody) return;
  if (el.homePatientNameInput && el.homePatientNameInput.value !== state.dashboardQuery) {
    el.homePatientNameInput.value = state.dashboardQuery;
  }
  const list = getFilteredDashboardPatients();
  const total = list.length;
  const totalPages = Math.max(Math.ceil(total / state.dashboardPageSize), 1);
  if (state.dashboardPage > totalPages) state.dashboardPage = totalPages;
  const start = (state.dashboardPage - 1) * state.dashboardPageSize;
  const pageItems = list.slice(start, start + state.dashboardPageSize);

  if (!pageItems.length) {
    el.homePatientTableBody.innerHTML = '<tr><td colspan="7"><div class="empty-msg">Nenhum paciente encontrado para esse filtro.</div></td></tr>';
  } else {
    el.homePatientTableBody.innerHTML = pageItems.map((p) => {
      const summary = state.protocolByPatient[p.id];
      const statusInfo = protocolStatusInfo(summary);
      const checked = state.selectedPatientIds.has(p.id) ? "checked" : "";
      return `
        <tr class="home-patient-row" data-patient-id="${p.id}">
          <td><input class="home-patient-check" type="checkbox" data-patient-id="${p.id}" ${checked}/></td>
          <td><strong>${p.name}</strong><div class="home-task-meta">${p.phone || "-"}</div></td>
          <td>${catLabel(p.careCategory)}</td>
          <td>${p.microArea || "-"}</td>
          <td>${acsNameById(p.assignedAcsId)}</td>
          <td><span class="${statusInfo.className}">${statusInfo.label}</span></td>
          <td class="inline-actions">
            <button class="btn-secondary home-open-patient-btn" data-patient-id="${p.id}">Abrir</button>
            ${(isManager() || isDoctor()) ? `<button class="btn-secondary home-edit-patient-btn" data-patient-id="${p.id}">Editar</button>` : ""}
            ${(isManager() || isDoctor()) ? `<button class="btn-secondary home-delete-patient-btn" data-patient-id="${p.id}">Excluir</button>` : ""}
          </td>
        </tr>`;
    }).join("");
  }

  el.homePatientPageInfo.textContent = `Página ${state.dashboardPage} de ${totalPages} | ${total} paciente(s)`;
  el.homePatientPrevBtn.disabled = state.dashboardPage <= 1;
  el.homePatientNextBtn.disabled = state.dashboardPage >= totalPages;

  document.querySelectorAll(".home-open-patient-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const patient = state.patients.find((p) => p.id === btn.dataset.patientId);
      if (patient) await selectPatient(patient);
    });
  });

  document.querySelectorAll(".home-delete-patient-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deletePatientsByIds([btn.dataset.patientId]);
    });
  });

  document.querySelectorAll(".home-edit-patient-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const patient = state.patients.find((item) => item.id === btn.dataset.patientId);
      if (!patient) return;
      state.selectedPatient = patient;
      openPatientEdit();
    });
  });

  document.querySelectorAll(".home-patient-check").forEach((check) => {
    check.addEventListener("click", (event) => event.stopPropagation());
    check.addEventListener("change", () => {
      const patientId = check.dataset.patientId;
      if (!patientId) return;
      if (check.checked) state.selectedPatientIds.add(patientId);
      else state.selectedPatientIds.delete(patientId);
      if (el.homePatientSelectAll) {
        const selectable = pageItems.map((item) => item.id);
        el.homePatientSelectAll.checked = selectable.length > 0 && selectable.every((id) => state.selectedPatientIds.has(id));
      }
      if (el.homePatientBulkDeleteBtn) {
        el.homePatientBulkDeleteBtn.classList.toggle("hidden", !(isManager() || isDoctor()) || state.selectedPatientIds.size === 0);
      }
    });
  });

  document.querySelectorAll(".home-patient-row").forEach((row) => {
    row.addEventListener("click", async (event) => {
      if (event.target.closest("button") || event.target.closest("input")) return;
      const patientId = row.dataset.patientId;
      const patient = state.patients.find((item) => item.id === patientId);
      if (patient) await selectPatient(patient);
    });
  });

  if (el.homePatientSelectAll) {
    const selectable = pageItems.map((item) => item.id);
    el.homePatientSelectAll.checked = selectable.length > 0 && selectable.every((id) => state.selectedPatientIds.has(id));
  }
  if (el.homePatientBulkDeleteBtn) {
    el.homePatientBulkDeleteBtn.classList.toggle("hidden", !(isManager() || isDoctor()) || state.selectedPatientIds.size === 0);
  }
}

function exportDashboardPatientsCsv() {
  const list = getFilteredDashboardPatients();
  if (!list.length) {
    showToast("Nada para exportar com os filtros atuais.", "error");
    return;
  }

  const rows = list.map((p) => {
    const info = protocolStatusInfo(state.protocolByPatient[p.id]);
    return [
      p.name || "",
      p.phone || "",
      p.microArea || "",
      catLabel(p.careCategory),
      acsNameById(p.assignedAcsId),
      info.label
    ];
  });

  const header = ["Paciente", "Telefone", "Microárea", "Categoria", "ACS", "Status Protocolo"];
  const csvEscape = (value) => `"${String(value || "").replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pacientes-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("CSV exportado com sucesso.", "ok");
}

async function loadProtocolStatusesForDashboard() {
  const requestSeq = ++_protocolStatusesRequestSeq;
  if (!state.patients.length) {
    state.protocolByPatient = {};
    renderHomePatientTable();
    return;
  }
  const ids = state.patients.slice(0, 200).map((p) => p.id).filter(Boolean);
  if (!ids.length) {
    state.protocolByPatient = {};
    renderHomePatientTable();
    return;
  }
  try {
    const response = await api(`/patients/protocol-summaries?ids=${encodeURIComponent(ids.join(","))}`);
    if (requestSeq !== _protocolStatusesRequestSeq) return;
    state.protocolByPatient = response?.summaries && typeof response.summaries === "object"
      ? response.summaries
      : {};
  } catch {
    if (requestSeq !== _protocolStatusesRequestSeq) return;
    state.protocolByPatient = {};
  }
  renderHomePatientTable();
}

function goHomeDashboard() {
  switchNavSection("dashboard");
  switchWorkspaceTab("dashboard");
  state.selectedPatient = null;
  renderPatients();
  renderPatientHeader();
}

function openProfileModal() {
  if (!state.user) return;
  el.profileName.value = state.user.name || "";
  el.profileEmail.value = state.user.email || "";
  el.profilePassword.value = "";
  const needsCouncil = ["doctor", "nurse_manager"].includes(state.user.role);
  el.profileCouncilWrap.classList.toggle("hidden", !needsCouncil);
  if (needsCouncil) {
    const maxLen = state.user.role === "doctor" ? 8 : 10;
    el.profileCouncilNumber.maxLength = maxLen + 1;
    el.profileCouncilNumber.placeholder = state.user.role === "doctor" ? "Ex: 1234 5678" : "Ex: 12345 67890";
    el.profileCouncilNumber.value = formatCouncilNumber(state.user.councilNumber || "", maxLen);
    el.profileCouncilUf.value = state.user.councilUf || "";
  }
  if (el.profile2faStatus) {
    const enabled = Boolean(state.user.twoFactorEnabled);
    el.profile2faStatus.textContent = enabled
      ? "2FA ativo. O login exige código do app autenticador."
      : "2FA inativo. Recomendado ativar para maior segurança.";
  }
  el.profile2faDisableBtn?.classList.toggle("hidden", !Boolean(state.user.twoFactorEnabled));
  el.profileModal.classList.remove("hidden");
}

function closeProfileModal() {
  el.profileModal.classList.add("hidden");
}

async function startTwoFactorSetup() {
  try {
    const setup = await api("/me/2fa/setup", { method: "POST", body: "{}" });
    const manualKey = String(setup.secret || "").replace(/(.{4})/g, "$1 ").trim();
    alert(
      `2FA iniciado.\n\n1) Abra Google Authenticator/Authy.\n2) Cadastre a chave manual:\n${manualKey}\n\nOu use URL OTP:\n${setup.otpauthUrl}`
    );
    const code = prompt("Digite o código de 6 dígitos do app para confirmar a ativação do 2FA:");
    if (!code) return;
    const result = await api("/me/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code })
    });
    state.user = result.user;
    state.token = result.token;
    persistSession();
    updateSessionView();
    openProfileModal();
    showToast("2FA ativado com sucesso.", "ok");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function disableTwoFactor() {
  try {
    const code = prompt("Digite o código atual de 6 dígitos para desativar o 2FA:");
    if (!code) return;
    const result = await api("/me/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ code })
    });
    state.user = result.user;
    state.token = result.token;
    persistSession();
    updateSessionView();
    openProfileModal();
    showToast("2FA desativado.", "ok");
  } catch (e) {
    showToast(e.message, "error");
  }
}

function requireSelectedPatientForAi() {
  if (!state.selectedPatient) {
    showToast("Selecione um paciente para usar a IA.", "error");
    switchNavSection("patients");
    return false;
  }
  return true;
}

async function runTeamAi(path, payload = {}) {
  try {
    const data = await api(path, { method: "POST", body: JSON.stringify(payload) });
    const specific = formatTeamAiOutput(path, data);
    if (specific) el.aiHubOutput.innerHTML = specific;
    else renderAiReadable(el.aiHubOutput, data);
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function runPatientAi(path, payload = {}) {
  if (!requireSelectedPatientForAi()) return;
  try {
    const data = await api(`/ai/patients/${state.selectedPatient.id}${path}`, { method: "POST", body: JSON.stringify(payload) });
    renderAiReadable(el.aiPatientOutput, data);
    switchToTab("panelAi");
  } catch (e) {
    showToast(e.message, "error");
  }
}

function switchWorkspaceTab(tab) {
  const allowProtocols = isManager();
  state.workspaceTab = tab === "protocols" && allowProtocols ? "protocols" : "dashboard";
  el.homeTabProtocolsBtn.classList.toggle("hidden", !allowProtocols);
  el.homeTabDashboardBtn.classList.toggle("active", state.workspaceTab === "dashboard");
  el.homeTabProtocolsBtn.classList.toggle("active", state.workspaceTab === "protocols");
  if (state.navSection === "dashboard") {
    el.homeDashboardPane.classList.toggle("hidden", state.workspaceTab !== "dashboard");
  }
  persistViewState();
}

function renderTeamUsersLists() {
  const acsUsers = state.users
    .filter((u) => u.role === "acs")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const doctorUsers = state.users
    .filter((u) => u.role === "doctor")
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const teamLine = (user) => user.teamName ? `Equipe: ${user.teamName}` : "Equipe: não informada";
  const allowManageUsers = isManager();

  el.acsList.innerHTML = acsUsers.length
    ? acsUsers.map((u) => `
      <div class="home-list-row">
        <div>
          <span class="home-list-main">${u.name}</span>
          <p class="home-task-meta">${teamLine(u)}</p>
        </div>
        <div class="inline-actions">
          <span class="home-task-meta">${u.email}</span>
          ${allowManageUsers ? `<button class="btn-secondary team-user-edit-btn" data-user-id="${u.id}">Editar</button>` : ""}
          ${allowManageUsers ? `<button class="btn-secondary team-user-delete-btn" data-user-id="${u.id}">Excluir</button>` : ""}
        </div>
      </div>`).join("")
    : '<div class="empty-msg">Nenhum ACS cadastrado.</div>';

  el.doctorList.innerHTML = doctorUsers.length
    ? doctorUsers.map((u) => `
      <div class="home-list-row">
        <div>
          <span class="home-list-main">${u.name}</span>
          <p class="home-task-meta">${teamLine(u)}</p>
        </div>
        <div class="inline-actions">
          <span class="home-task-meta">${u.email}</span>
          ${allowManageUsers ? `<button class="btn-secondary team-user-edit-btn" data-user-id="${u.id}">Editar</button>` : ""}
          ${allowManageUsers ? `<button class="btn-secondary team-user-delete-btn" data-user-id="${u.id}">Excluir</button>` : ""}
        </div>
      </div>`).join("")
    : '<div class="empty-msg">Nenhum médico cadastrado.</div>';

  document.querySelectorAll(".team-user-edit-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = state.users.find((u) => u.id === btn.dataset.userId);
      if (!target) return;
      openEditTeamUserModal(target);
    });
  });

  document.querySelectorAll(".team-user-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = state.users.find((u) => u.id === btn.dataset.userId);
      if (!target) return;
      try {
        const usage = await api(`/users/${target.id}/usage`);
        if (!usage.canDelete) {
          showToast(
            `Ação bloqueada: vínculos ativos (pacientes=${usage.assignedPatients}, tarefas abertas=${usage.openTasksAssigned}, atendimentos=${usage.appointmentsAuthored}, mensagens=${usage.messagesAuthored}, registros=${usage.clinicalRecordsAuthored}).`,
            "error",
            7000
          );
          return;
        }
        const roleLabel = target.role === "doctor" ? "médico(a)" : "ACS";
        const ok = confirm(`Excluir ${roleLabel} '${target.name}'? Esta ação é crítica e não poderá ser desfeita.`);
        if (!ok) return;
        await api(`/users/${target.id}`, { method: "DELETE" });
        showToast("Cadastro excluído.", "ok");
        state.users = await api("/users");
        fillAcsSelect(el.tAssignee);
        fillAcsSelect(el.pAcs);
        fillAcsSelect(el.topFilterAcs, true);
        renderTeamUsersLists();
        renderWorkspaceHome();
      } catch (e) {
        showToast(e.message, "error");
      }
    });
  });
}

function switchNavSection(section) {
  const isMgr = isManager();
  const isDoc = isDoctor();
  const next = String(section || "dashboard");
  const allowed = ["dashboard", "patients", "protocols", "acs", "doctors", "ai"];
  state.navSection = allowed.includes(next) ? next : "dashboard";

  if (!isMgr && !isDoc && ["protocols", "acs", "doctors", "ai"].includes(state.navSection)) {
    state.navSection = "dashboard";
  }

  el.navDashboardBtn?.classList.toggle("active", state.navSection === "dashboard");
  el.navPatientsBtn?.classList.toggle("active", state.navSection === "patients");
  el.navProtocolsBtn?.classList.toggle("active", state.navSection === "protocols");
  el.navAcsBtn?.classList.toggle("active", state.navSection === "acs");
  el.navDoctorsBtn?.classList.toggle("active", state.navSection === "doctors");
  el.navAiBtn?.classList.toggle("active", state.navSection === "ai");

  el.navProtocolsBtn?.classList.toggle("hidden", !isMgr && !isDoc);
  el.navAcsBtn?.classList.toggle("hidden", !isMgr && !isDoc);
  el.navDoctorsBtn?.classList.toggle("hidden", !isMgr && !isDoc);
  el.navAiBtn?.classList.toggle("hidden", !isMgr && !isDoc);

  el.openCreateUserModalBtn?.classList.toggle("hidden", !isMgr);

  // Sempre volta para o workspace da seção ao navegar pelo menu lateral.
  if (state.selectedPatient) {
    state.selectedPatient = null;
    state.appointments = [];
    state.tasks = [];
    state.messages = [];
    state.history = [];
    state.protocolSummary = null;
  }
  el.emptyState?.classList.remove("hidden");
  el.patientContent?.classList.add("hidden");
  renderPatientHeader();

  const showDashboardWorkspace = state.navSection === "dashboard";
  const showPatientsWorkspace = state.navSection === "patients";
  el.homeDashboardPane?.classList.toggle("hidden", !showDashboardWorkspace || state.workspaceTab !== "dashboard");
  el.homePatientsPane?.classList.toggle("hidden", !showPatientsWorkspace);
  el.protocolAdminSection?.classList.toggle("hidden", state.navSection !== "protocols");
  el.acsAdminSection?.classList.toggle("hidden", state.navSection !== "acs");
  el.doctorsAdminSection?.classList.toggle("hidden", state.navSection !== "doctors");
  el.aiHubSection?.classList.toggle("hidden", state.navSection !== "ai");

  if (state.navSection === "dashboard") {
    switchWorkspaceTab("dashboard");
  }
  renderPatients();
  renderWorkspaceHome();
  if (state.navSection === "acs" || state.navSection === "doctors") {
    renderTeamUsersLists();
  }
  if (state.navSection === "protocols") {
    renderProtocolAdminList();
  }
  if (isMobileLayout()) closeSidebarDrawer();
  persistViewState();
}

function openProtocolModal() {
  el.protocolModalTitle.textContent = state.editingProtocolCategory ? "Editar protocolo" : "Novo protocolo";
  el.protocolModal.classList.remove("hidden");
}

function closeProtocolModal() {
  el.protocolModal.classList.add("hidden");
}

function protocolFormPayload() {
  return {
    category: el.protocolCategoryInput.value.trim().toLowerCase(),
    label: el.protocolLabelInput.value.trim(),
    targets: {
      visits: Number(el.protocolVisitsInput.value || 0),
      consultations: Number(el.protocolConsultationsInput.value || 0),
      vaccines: Number(el.protocolVaccinesTargetInput.value || 0)
    },
    deadlines: {
      visits: Number(el.protocolVisitDeadlineInput.value || 0),
      consultations: Number(el.protocolConsultationDeadlineInput.value || 0),
      vaccines: Number(el.protocolVaccineDeadlineInput.value || 0)
    },
    vaccines: el.protocolVaccinesListInput.value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    authority: el.protocolAuthorityInput.value.trim() || "Ministério da Saúde",
    reference: el.protocolReferenceInput.value.trim(),
    version: el.protocolVersionInput.value.trim() || "1.0"
  };
}

function resetProtocolForm() {
  state.editingProtocolCategory = null;
  el.protocolCategoryInput.value = "";
  el.protocolCategoryInput.disabled = false;
  el.protocolLabelInput.value = "";
  el.protocolVisitsInput.value = "0";
  el.protocolConsultationsInput.value = "0";
  el.protocolVaccinesTargetInput.value = "0";
  el.protocolVisitDeadlineInput.value = "0";
  el.protocolConsultationDeadlineInput.value = "0";
  el.protocolVaccineDeadlineInput.value = "0";
  el.protocolVaccinesListInput.value = "";
  el.protocolAuthorityInput.value = "Ministério da Saúde";
  el.protocolReferenceInput.value = "";
  el.protocolVersionInput.value = "1.0";
  el.createProtocolBtn.textContent = "Confirmar";
  el.protocolModalTitle.textContent = "Novo protocolo";
}

function renderProtocolAdminList() {
  if (!el.protocolAdminList) return;
  if (!(isManager() || isDoctor())) {
    el.protocolAdminList.innerHTML = '<div class="empty-msg">Sem permissão para administrar protocolos.</div>';
    return;
  }

  el.protocolAdminList.innerHTML = state.protocolTemplates
    .map((t) => {
      return `
      <div class="home-task-row">
        <div>
          <p class="home-task-title">${t.label} <span class="home-task-meta">(${t.category})${t.teamId ? "" : " [base]"}</span></p>
          <p class="home-task-meta">Metas: ${t.targets.visits} visitas | ${t.targets.consultations} consultas | ${t.targets.vaccines} vacinas</p>
          <p class="home-task-meta">Prazos (dias): visita ${Number(t.deadlines?.visits || 0)} | consulta ${Number(t.deadlines?.consultations || 0)} | vacina ${Number(t.deadlines?.vaccines || 0)}</p>
          <p class="home-task-meta">Norma: ${t.authority || "Ministério da Saúde"} | Ref: ${t.reference ? `<a href="${t.reference}" target="_blank" rel="noopener noreferrer">link oficial</a>` : "-"} | Versão: ${t.version || "1.0"}</p>
        </div>
        <div class="inline-actions">
          <button class="btn-secondary protocol-history-btn" data-category="${t.category}">Histórico</button>
          <button class="btn-secondary protocol-edit-btn" data-category="${t.category}">Editar</button>
          ${t.category !== "general" ? `<button class="btn-secondary protocol-delete-btn" data-category="${t.category}">Excluir</button>` : ""}
        </div>
      </div>`;
    })
    .join("");

  document.querySelectorAll(".protocol-edit-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const category = btn.dataset.category;
      const template = state.protocolTemplates.find((t) => t.category === category);
      if (!template) return;
      try {
        const usage = await api(`/protocol/templates/${category}/usage`);
        const linkedTotal = Number(usage.patientCount || 0) + Number(usage.recordsCount || 0);
        if (linkedTotal > 0) {
          const ok = confirm(
            `Atenção: editar este protocolo pode impactar ${usage.patientCount} paciente(s) e ${usage.recordsCount} registro(s). Deseja continuar?`
          );
          if (!ok) return;
        }
      } catch (_e) {
        // Se não houver endpoint/uso para a categoria, segue com edição.
      }
      state.editingProtocolCategory = category;
      el.protocolCategoryInput.value = template.category;
      el.protocolCategoryInput.disabled = true;
      el.protocolLabelInput.value = template.label;
      el.protocolVisitsInput.value = String(template.targets.visits || 0);
      el.protocolConsultationsInput.value = String(template.targets.consultations || 0);
      el.protocolVaccinesTargetInput.value = String(template.targets.vaccines || 0);
      el.protocolVisitDeadlineInput.value = String(Number(template.deadlines?.visits || 0));
      el.protocolConsultationDeadlineInput.value = String(Number(template.deadlines?.consultations || 0));
      el.protocolVaccineDeadlineInput.value = String(Number(template.deadlines?.vaccines || 0));
      el.protocolVaccinesListInput.value = (template.vaccines || []).join(", ");
      el.protocolAuthorityInput.value = template.authority || "Ministério da Saúde";
      el.protocolReferenceInput.value = template.reference || "";
      el.protocolVersionInput.value = template.version || "1.0";
      el.createProtocolBtn.textContent = "Confirmar alterações";
      el.protocolModalTitle.textContent = "Editar protocolo";
      openProtocolModal();
      showToast("Editando categoria de protocolo.", "ok");
    });
  });

  document.querySelectorAll(".protocol-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const category = btn.dataset.category;
      if (!category) return;
      try {
        const usage = await api(`/protocol/templates/${category}/usage`);
        if (!usage.canDelete) {
          showToast(`Ação bloqueada: ${usage.patientCount} pacientes e ${usage.recordsCount} registros usam esta categoria.`, "error", 5000);
          return;
        }

        if (!confirm(`Excluir categoria '${category}'? Esta ação é crítica e não pode ser desfeita.`)) return;
        await api(`/protocol/templates/${category}`, { method: "DELETE" });
        showToast("Categoria excluída.", "ok");
        resetProtocolForm();
        await reloadTemplateData();
      } catch (e) {
        showToast(e.message, "error");
      }
    });
  });

  document.querySelectorAll(".protocol-history-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const category = String(btn.dataset.category || "").trim();
      if (!category) return;
      try {
        const payload = await api(`/protocol/templates/${category}/history`);
        const items = Array.isArray(payload?.items) ? payload.items : [];
        if (!items.length) {
          showToast("Sem histórico para esta categoria.", "default");
          return;
        }
        const preview = items
          .slice(0, 8)
          .map((item) => {
            const when = item.createdAt ? new Date(item.createdAt).toLocaleString("pt-BR") : "-";
            const who = item.actorUserName || "Sistema";
            const version = item.payload?.version ? ` | versão ${item.payload.version}` : "";
            return `${when} | ${item.action} | ${who}${version}`;
          })
          .join("\n");
        alert(`Histórico do protocolo (${category})\n\n${preview}`);
      } catch (e) {
        showToast(e.message, "error");
      }
    });
  });
}

function renderDashboardFilterOptions() {
  if (!el.homePatientCategoryFilter || !el.homePatientAcsFilter) return;

  const selectedCategory = state.dashboardCategory;
  const selectedAcs = state.dashboardAcsId;

  el.homePatientCategoryFilter.innerHTML = '<option value="">Todas categorias</option>'
    + state.protocolTemplates.map((t) => `<option value="${t.category}">${t.label}</option>`).join("");
  el.homePatientCategoryFilter.value = selectedCategory;

  const acsUsers = state.users.filter((u) => u.role === "acs");
  el.homePatientAcsFilter.innerHTML = '<option value="">Todos ACS</option>'
    + acsUsers.map((u) => `<option value="${u.id}">${u.name}</option>`).join("");
  el.homePatientAcsFilter.value = selectedAcs;

  if (el.homePatientProtocolStatusFilter) {
    el.homePatientProtocolStatusFilter.value = state.dashboardProtocolStatus;
  }
}

function openPatientEdit() {
  if (!state.selectedPatient || !(isManager() || isDoctor())) return;
  state.editingPatientId = state.selectedPatient.id;
  const p = state.selectedPatient;
  el.pName.value = p.name || "";
  el.pMotherName.value = p.motherName || "";
  el.pPhone.value = formatPhone(p.phone || "");
  el.pPhoneAlt.value = formatPhone(p.phoneAlt || "");
  el.pCpf.value = formatCpf(p.cpf || p.cnsCpf || "");
  el.pCns.value = formatCns(p.cns || "");
  const addressParts = splitAddress(p.address || "");
  el.pStreet.value = addressParts.street;
  el.pNumber.value = addressParts.number;
  el.pNeighborhood.value = addressParts.neighborhood;
  el.pCity.value = addressParts.city;
  el.pState.value = String(addressParts.state || "").toUpperCase().slice(0, 2);
  el.pCep.value = addressParts.cep || "";
  el.pAcs.value = p.assignedAcsId || "";
  el.pCareCategory.value = p.careCategory || "general";
  setSelectedChronicConditions(p.chronicConditions || []);
  updateChronicConditionsVisibility();
  el.pBirthDate.value = p.birthDate || "";
  el.pSexAtBirth.value = p.sexAtBirth || "";
  el.pMaritalStatus.value = p.maritalStatus || "";
  el.pGenderIdentity.value = p.genderIdentity || "";
  el.pPregnancyStartDate.value = p.pregnancyStartDate || "";
  el.pExpectedDeliveryDate.value = p.expectedDeliveryDate || "";
  el.pGestationalAgeDumWeeks.value = Number.isFinite(Number(p.gestationalAgeDumWeeks))
    ? String(p.gestationalAgeDumWeeks)
    : "";
  el.pGestationalAgeDumDays.value = Number.isFinite(Number(p.gestationalAgeDumDays))
    ? String(p.gestationalAgeDumDays)
    : "";
  el.pGestationalAgeUsgWeeks.value = Number.isFinite(Number(p.gestationalAgeUsgWeeks))
    ? String(p.gestationalAgeUsgWeeks)
    : "";
  el.pGestationalAgeUsgDays.value = Number.isFinite(Number(p.gestationalAgeUsgDays))
    ? String(p.gestationalAgeUsgDays)
    : "";
  el.pUsgDate1.value = p.usgDate1 || "";
  el.pUsgDate2.value = p.usgDate2 || "";
  el.pUsgDate3.value = p.usgDate3 || "";
  el.pPrenatalStartDate.value = p.prenatalStartDate || "";
  el.pPostpartumStartDate.value = p.postpartumStartDate || "";
  el.pComorb.value = p.comorbidities || "";
  el.pMeds.value = p.medications || "";
  el.pAllergies.value = p.allergies || "";
  el.createPatientBtn.textContent = "Salvar alterações";
  el.patientModalTitle.textContent = "Editar paciente";
  el.patientModal.classList.remove("hidden");
}

async function deleteSelectedPatient() {
  if (!state.selectedPatient) return;
  if (!(isManager() || isDoctor())) {
    showToast("Sem permissão para excluir paciente.", "error");
    return;
  }
  const patientName = state.selectedPatient.name || "este paciente";
  const ok = confirm(`Excluir ${patientName}? Esta ação remove cadastro, atendimentos, tarefas, mensagens e registros.`);
  if (!ok) return;

  try {
    await api(`/patients/${state.selectedPatient.id}`, { method: "DELETE" });
    showToast("Paciente excluído com sucesso.", "ok");
    state.selectedPatient = null;
    state.appointments = [];
    state.tasks = [];
    state.messages = [];
    state.history = [];
    state.protocolSummary = null;
    await loadPatients();
    await loadGlobalTasks();
    renderPatientHeader();
    renderWorkspaceHome();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function deletePatientsByIds(ids = []) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length) return;
  if (!(isManager() || isDoctor())) {
    showToast("Sem permissão para excluir pacientes.", "error");
    return;
  }
  const ok = confirm(`Excluir ${uniqueIds.length} paciente(s)? Esta ação remove todos os dados vinculados.`);
  if (!ok) return;
  try {
    for (const patientId of uniqueIds) {
      await api(`/patients/${patientId}`, { method: "DELETE" });
    }
    showToast(`${uniqueIds.length} paciente(s) excluído(s).`, "ok");
    state.selectedPatientIds = new Set();
    if (state.selectedPatient && uniqueIds.includes(state.selectedPatient.id)) {
      state.selectedPatient = null;
      state.appointments = [];
      state.tasks = [];
      state.messages = [];
      state.history = [];
      state.protocolSummary = null;
    }
    await loadPatients();
    await loadGlobalTasks();
    renderPatientHeader();
    renderWorkspaceHome();
  } catch (e) {
    showToast(e.message, "error");
  }
}

// -- Tab switching -------------------------------------------------------------
document.querySelectorAll(".ptab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".ptab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.panel;
    if (target !== "panelRecord") _recordDraftMetadata = null;
    document.querySelectorAll(".panel").forEach(p => {
      p.classList.toggle("active", p.id === target);
      p.classList.toggle("hidden", p.id !== target);
    });
  });
});

function switchToTab(panelId) {
  if (panelId !== "panelRecord") _recordDraftMetadata = null;
  document.querySelectorAll(".ptab").forEach(t => t.classList.remove("active"));
  document.querySelector(`.ptab[data-panel="${panelId}"]`)?.classList.add("active");
  document.querySelectorAll(".panel").forEach(p => {
    p.classList.toggle("active", p.id === panelId);
    p.classList.toggle("hidden", p.id !== panelId);
  });
  persistViewState();
}

// -- Render: protocol summary ---------------------------------------------------
function renderProtocolSummary() {
  el.protocolSummary.innerHTML = "";
  if (!state.protocolSummary) {
    el.protocolSummary.innerHTML = '<div class="empty-msg">Sem resumo de protocolo.</div>';
    return;
  }
  const s = state.protocolSummary;
  const severityLabel = (value) => {
    if (value === "lost") return "PERDIDO";
    if (value === "high") return "ALTO";
    if (value === "medium") return "MÉDIO";
    return "BAIXO";
  };
  const isVaccineAlertItem = (item = {}) => /vacina/i.test(String(item.activity || item.title || ""));
  const classifyVisitDeadline = (daysLeft, overdue) => {
    if (overdue > 0) return { severity: "lost", severityClass: "status lost" };
    if (daysLeft !== null && daysLeft <= 3) return { severity: "high", severityClass: "status alert" };
    if (daysLeft !== null && daysLeft <= 7) return { severity: "medium", severityClass: "status pending" };
    return { severity: "low", severityClass: "status progress" };
  };
  const classifyVaccineDeadline = (daysLeft, overdue) => {
    if (overdue > 0) return { severity: "high", severityClass: "status alert" };
    if (daysLeft !== null && daysLeft <= 2) return { severity: "medium", severityClass: "status pending" };
    return { severity: "low", severityClass: "status progress" };
  };
  const pluralize = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;
  const stats = [
    { label:"Visitas", nounSingular: "visita", nounPlural: "visitas", done:s.completed.visits,       total:s.targets.visits,       pending:s.pending.visits },
    { label:"Consultas", nounSingular: "consulta", nounPlural: "consultas", done:s.completed.consultations, total:s.targets.consultations, pending:s.pending.consultations },
    { label:"Vacinas", nounSingular: "vacina", nounPlural: "vacinas", done:s.completed.vaccines,      total:s.targets.vaccines,      pending:s.pending.vaccines },
  ];
  const statsHtml = `<div class="proto-stats">${stats.map(b=>`
    <div class="proto-stat${b.pending>0?" warn":" ok"}">
      <div class="proto-stat-label">${b.label}</div>
      <div class="proto-stat-value">${b.done}<span style="font-size:.85rem;color:var(--text-muted)">/${b.total}</span></div>
      <div class="proto-stat-sub">${b.pending>0?`${b.pending} pendente${b.pending!==1?"s":""}`:"Em dia"}</div>
    </div>`).join("")}</div>`;

  const alerts = stats
    .filter((b) => b.pending > 0)
    .map((b) => `<span class="proto-alert warn">• ${pluralize(b.pending, b.nounSingular, b.nounPlural)}</span>`)
    .join("");
  const allOk  = !alerts ? `<span class="proto-alert ok">• Protocolo em dia</span>` : "";
  const critical = stats.filter((b) => b.pending > 0);
  const criticalBox = critical.length
    ? `<div class="protocol-critical-box">Falta concluir: ${critical.map((b) => pluralize(b.pending, b.nounSingular, b.nounPlural)).join(" | ")}</div>`
    : `<div class="protocol-ok-box">Tudo em dia para esta categoria.</div>`;

  const vaccines = (s.vaccines?.recommended||[]).map(v=>`
    <li class="vaccine-item">
      <span class="vaccine-badge ${v.done?"done":"pending"}">${v.done?"OK":"!"}</span>
      ${v.name}
    </li>`).join("") || "<li class='vaccine-item'>Sem vacinas recomendadas.</li>";

  const specialAlerts = Array.isArray(s.specialAlerts) ? s.specialAlerts : [];
  const scheduleAlerts = ["visits", "consultations", "vaccines"]
    .map((key) => ({ key, item: s.schedule?.[key] }))
    .filter(({ item }) => item && Number(item.pending || 0) > 0 && Number(item.intervalDays || 0) > 0)
    .map(({ key, item }) => {
      const labels = { visits: "visita", consultations: "consulta", vaccines: "vacina" };
      const overdue = Number(item.overdueDays || 0);
      const daysLeft = item.daysLeft === null || item.daysLeft === undefined ? null : Number(item.daysLeft);
      let severity = "low";
      let severityClass = "status progress";
      if (key === "visits") {
        const visitState = classifyVisitDeadline(daysLeft, overdue);
        severity = visitState.severity;
        severityClass = visitState.severityClass;
      } else if (key === "vaccines") {
        const vaccineState = classifyVaccineDeadline(daysLeft, overdue);
        severity = vaccineState.severity;
        severityClass = vaccineState.severityClass;
      } else if (overdue > 0) {
        severity = "high";
        severityClass = "status alert";
      } else if (daysLeft !== null && daysLeft <= 3) {
        severity = "high";
        severityClass = "status alert";
      } else if (daysLeft !== null && daysLeft <= 7) {
        severity = "medium";
        severityClass = "status pending";
      }
      const deadlineText = overdue > 0
        ? `${overdue} dia(s) em atraso`
        : (daysLeft !== null ? `faltam ${daysLeft} dia(s)` : "prazo em acompanhamento");
      return {
        title: `Pendência de ${labels[key]} (${item.pending})`,
        detail: `Prazo: ${deadlineText}.`,
        severity,
        severityClass,
        overdue,
        daysLeft
      };
    });
  const allPatientAlerts = [...specialAlerts, ...scheduleAlerts];
  const classifyPatientAlert = (item) => {
    const overdue = Number(item?.overdue || 0);
    const rawDaysLeft = item?.daysLeft;
    const daysLeft = rawDaysLeft === null || rawDaysLeft === undefined || rawDaysLeft === ""
      ? null
      : Number(rawDaysLeft);
    const threshold = isVaccineAlertItem(item) ? 2 : 7;
    const dueSoon = overdue <= 0 && Number.isFinite(daysLeft) && daysLeft >= 0 && daysLeft <= threshold;
    return { overdue, daysLeft, dueSoon };
  };
  allPatientAlerts.sort((a, b) => {
    const ca = classifyPatientAlert(a);
    const cb = classifyPatientAlert(b);
    if (cb.overdue !== ca.overdue) return cb.overdue - ca.overdue;
    if (cb.dueSoon !== ca.dueSoon) return Number(cb.dueSoon) - Number(ca.dueSoon);
    const weight = (x) => (x === "high" ? 3 : (x === "medium" ? 2 : 1));
    return weight(b.severity || "low") - weight(a.severity || "low");
  });
  const overdueItems = allPatientAlerts.filter((item) => Number(item?.overdue || 0) > 0);
  const dueSoonItems = allPatientAlerts.filter((item) => {
    const rawDaysLeft = item?.daysLeft;
    if (rawDaysLeft === null || rawDaysLeft === undefined || rawDaysLeft === "") return false;
    const daysLeft = Number(rawDaysLeft);
    const threshold = isVaccineAlertItem(item) ? 2 : 7;
    return Number(item?.overdue || 0) <= 0 && Number.isFinite(daysLeft) && daysLeft >= 0 && daysLeft <= threshold;
  });
  const priorityBox = (overdueItems.length || dueSoonItems.length)
    ? `<div class="${overdueItems.length ? "protocol-critical-box" : "protocol-ok-box"}">
        ${overdueItems.length ? `${overdueItems.length} item(ns) vencido(s)` : "Nenhum item vencido"}
        ${dueSoonItems.length ? ` | ${dueSoonItems.length} próximo(s) do prazo` : ""}
      </div>`
    : `<div class="protocol-ok-box">Sem itens vencidos ou próximos do prazo.</div>`;
  const gestWeeks = Number(s.specialMonitoring?.timeline?.gestationalWeeks);
  const gestDays = Number(s.specialMonitoring?.timeline?.gestationalDays);
  const puerDays = Number(s.specialMonitoring?.timeline?.daysAfterBirth);
  const timelineBadge = Number.isFinite(gestWeeks)
    ? `<div class="proto-section-label">Idade gestacional estimada: ${gestWeeks} semana(s) e ${Number.isFinite(gestDays) ? (Math.max(0, gestDays % 7)) : 0} dia(s)</div>`
    : (Number.isFinite(puerDays) ? `<div class="proto-section-label">Puerpério: ${puerDays} dia(s) pós-parto</div>` : "");
  const specialHtml = allPatientAlerts.length
    ? `
      <div class="proto-section-label">Alertas clínicos da categoria</div>
      <div class="record-list">
        ${allPatientAlerts.map((item) => `
          <div class="record-card">
            <div class="record-hd">
              <span class="record-title">${item.title || item.activity || "Alerta do protocolo"}</span>
              <span class="${item.severityClass || "status pending"}">${severityLabel(item.severity)}</span>
            </div>
            <div class="record-body">
              <p>${item.detail || "Atenção necessária no protocolo."}</p>
            </div>
          </div>
        `).join("")}
      </div>`
    : "";

  el.protocolSummary.innerHTML = `
    ${statsHtml}
    ${criticalBox}
    <div class="proto-alerts">${alerts||allOk}</div>
    ${priorityBox}
    ${s.categoryLabel?`<div class="proto-section-label">Categoria ativa: ${s.categoryLabel}</div>`:""}
    ${timelineBadge}
    ${specialHtml}
    <div class="proto-section-label">Checklist de vacinas</div>
    <ul class="vaccine-list">${vaccines}</ul>`;
}

// -- Render: appointments -------------------------------------------------------
function buildRecordPayloadFromAppointment(appointment) {
  const sourceAppointmentId = String(appointment?.id || "").trim();
  const title = isDoctor() ? "Consulta médica" : "Consulta de enfermagem";
  return {
    type: "consultation",
    date: toDateInputValue(appointment?.date) || toDateInputValue(new Date()),
    title,
    details: [
      `Origem do atendimento: ${appointment?.summary || "Sem resumo"}`,
      appointment?.conduct ? `Conduta: ${appointment.conduct}` : "",
      appointment?.nextStep ? `Próximo passo: ${appointment.nextStep}` : ""
    ].filter(Boolean).join("\n"),
    protocolTag: state.selectedPatient?.careCategory,
    metadata: {
      sourceAppointmentId,
      sourceDemandType: appointment?.demandType || "",
      sourceAppointmentDate: appointment?.date || ""
    }
  };
}

async function createClinicalRecordFromAppointment(appointment) {
  if (!appointment || !state.selectedPatient) return false;
  const appointmentId = String(appointment.id || "").trim();
  if (!appointmentId) return false;
  const alreadyLinked = (state.history || []).some((h) =>
    h?.source === "clinicalRecord" && String(h?.metadata?.sourceAppointmentId || "").trim() === appointmentId
  );
  if (alreadyLinked) {
    showToast("Este atendimento já possui registro clínico vinculado.", "error");
    return false;
  }
  const payload = buildRecordPayloadFromAppointment(appointment);
  await api(`/patients/${state.selectedPatient.id}/records`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  _recordDraftMetadata = null;
  await refreshSelectedPatientData();
  showToast("Registro clínico criado automaticamente.", "ok");
  return true;
}

function renderAppointments() {
  el.appointmentList.innerHTML = "";
  if (!state.appointments.length) { el.appointmentList.innerHTML='<div class="empty-msg">Nenhum atendimento.</div>'; return; }
  const linkedAppointmentIds = new Set(
    (state.history || [])
      .filter((h) => h?.source === "clinicalRecord")
      .map((h) => String(h?.metadata?.sourceAppointmentId || "").trim())
      .filter(Boolean)
  );
  state.appointments.forEach(a => {
    const demandLabel = a.demandType === "spontaneous" ? "Espontânea" : "Programada";
    const linked = linkedAppointmentIds.has(String(a.id || ""));
    const d = document.createElement("div");
    d.className = "record-card";
    d.innerHTML = `
      <div class="record-hd">
        <span class="record-title">${a.summary || "Atendimento"}</span>
        <span class="record-date">${new Date(a.date).toLocaleString("pt-BR")}</span>
      </div>
      <div class="record-body">
        <p><strong>Demanda:</strong> ${demandLabel}</p>
        ${a.conduct  ? `<p><strong>Conduta:</strong> ${a.conduct}</p>` : ""}
        ${a.nextStep ? `<p><strong>Próximo:</strong> ${a.nextStep}</p>` : ""}
        ${(isManager() || isDoctor()) ? `
          <div class="inline-actions" style="margin-top:.5rem;">
            <button class="btn-secondary appt-to-record-btn" data-appointment-id="${a.id}" ${linked ? "disabled" : ""}>
              ${linked ? "Registro já gerado" : "Gerar registro clínico"}
            </button>
          </div>` : ""}
      </div>`;
    el.appointmentList.appendChild(d);
  });

  document.querySelectorAll(".appt-to-record-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const appointment = state.appointments.find((item) => item.id === btn.dataset.appointmentId);
      if (!appointment) return;
      try {
        await createClinicalRecordFromAppointment(appointment);
      } catch (e) {
        showToast(e.message, "error");
      }
    });
  });
}

// -- Render: tasks --------------------------------------------------------------
const statusLabel = { done:"Concluida", in_progress:"Em andamento", pending:"Pendente" };
const statusClass = { done:"done", in_progress:"progress", pending:"pending" };

function renderTasks() {
  el.taskList.innerHTML = "";
  if (!state.tasks.length) { el.taskList.innerHTML='<div class="empty-msg">Nenhuma tarefa.</div>'; return; }
  state.tasks.forEach(t => {
    const wrap = document.createElement("div");
    wrap.className = "record-card";
    wrap.innerHTML = `
      <div class="record-hd">
        <span class="record-title">${t.title}</span>
        <span class="status ${statusClass[t.status]||"pending"}">${statusLabel[t.status]||"Pendente"}</span>
      </div>
      <div class="record-body">
        <p>Responsavel: ${acsNameById(t.assigneeId)} | Prazo: ${t.dueDate||"-"}</p>
        ${t.notes ? `<p>${t.notes}</p>` : ""}
      </div>`;
    if (canManageTaskStatus()) {
      const row = document.createElement("div");
      row.className = "status-row";
      row.innerHTML = `<label>Status:</label>`;
      const sel = document.createElement("select");
      sel.className = "field-select";
      [["pending","Pendente"],["in_progress","Em andamento"],["done","Concluida"]].forEach(([v,l])=>{
        sel.appendChild(Object.assign(document.createElement("option"), { value:v, textContent:l, selected:v===t.status }));
      });
      sel.addEventListener("change", async () => {
        try {
          await api(`/tasks/${t.id}`, { method:"PATCH", body:JSON.stringify({ status:sel.value }) });
          showToast("Status atualizado.","ok");
          await refreshSelectedPatientData();
          await loadGlobalTasks();
        }
        catch (e) { showToast(e.message,"error"); }
      });
      row.appendChild(sel);
      wrap.appendChild(row);
    }
    el.taskList.appendChild(wrap);
  });
}

// -- Render: messages -----------------------------------------------------------
function renderMessages() {
  el.messageList.innerHTML = "";
  if (!state.messages.length) { el.messageList.innerHTML='<div class="empty-msg">Sem mensagens.</div>'; return; }
  state.messages.forEach(m => {
    const d = document.createElement("div");
    d.className = "msg-item";
    d.innerHTML = `
      <div class="msg-meta">
        <span class="msg-author">${m.authorName}</span>
        <span class="msg-time">${new Date(m.createdAt).toLocaleString("pt-BR")}</span>
      </div>
      <div class="msg-text">${m.text}</div>`;
    el.messageList.appendChild(d);
  });
  el.messageList.scrollTop = el.messageList.scrollHeight;
}

// -- Render: history timeline ---------------------------------------------------
const typeLabel = { visit:"Visita", consultation:"Consulta", appointment:"Atendimento", vaccine:"Vacina", procedure:"Procedimento", note:"Observação" };
const RECORD_TITLES = {
  visit: ["Visita ACS"],
  consultation: ["Consulta médica", "Consulta de enfermagem", "Consulta odontológica"]
};
const MINISTRY_VACCINES = [
  "BCG",
  "Hepatite B",
  "Penta",
  "VIP",
  "Pneumo 10",
  "Rotavírus",
  "Meningocócica",
  "dTpa",
  "DTP",
  "Influenza",
  "COVID-19",
  "Febre amarela",
  "HPV",
  "ACWY",
  "Tríplice viral",
  "Varicela",
  "Hepatite A",
  "SCRV",
  "Dupla adulto (dT)"
];

function fillRecordVaccines() {
  if (!el.rVaccineMulti) return;
  el.rVaccineMulti.innerHTML = MINISTRY_VACCINES
    .map((name) => `<option value="${name}">${name}</option>`)
    .join("");
}

function enableSimpleMultiSelect(selectEl) {
  if (!selectEl || selectEl.dataset.simpleMultiBound === "1") return;
  selectEl.dataset.simpleMultiBound = "1";
  // Permite marcar/desmarcar com clique simples, sem precisar Ctrl/Cmd.
  selectEl.addEventListener("mousedown", (event) => {
    const opt = event.target;
    if (!(opt instanceof HTMLOptionElement)) return;
    event.preventDefault();
    opt.selected = !opt.selected;
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function restoreRecordTypeOptions() {
  if (!el.rType) return;
  const selected = String(el.rType.value || "");
  el.rType.innerHTML = RECORD_TYPE_DEFAULT_OPTIONS
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join("");
  if (selected && [...el.rType.options].some((opt) => opt.value === selected)) {
    el.rType.value = selected;
  }
  el.rType.disabled = false;
}

function setAcsRecordTypeOnly() {
  if (!el.rType) return;
  el.rType.innerHTML = '<option value="visit">Visita domiciliar</option>';
  el.rType.value = "visit";
  el.rType.disabled = true;
}

function selectedVaccineNames() {
  if (!el.rVaccineMulti) return [];
  return [...el.rVaccineMulti.options]
    .filter((opt) => opt.selected)
    .map((opt) => String(opt.value || "").trim())
    .filter(Boolean);
}

function updateRecordTitleControls() {
  const type = el.rType?.value || "visit";
  const titleOptions = RECORD_TITLES[type] || [];
  const useFreeTitle = ["procedure", "note"].includes(type);
  const useVaccineMulti = type === "vaccine";
  const useRapidTestTrimester = type === "procedure";

  el.rTitleSelectWrap?.classList.toggle("hidden", useFreeTitle || useVaccineMulti);
  el.rTitleInputWrap?.classList.toggle("hidden", !useFreeTitle);
  el.rVaccineMultiWrap?.classList.toggle("hidden", !useVaccineMulti);
  el.rRapidTestTrimesterWrap?.classList.toggle("hidden", !useRapidTestTrimester);

  if (el.rTitleSelect && titleOptions.length) {
    el.rTitleSelect.innerHTML = titleOptions.map((title) => `<option value="${title}">${title}</option>`).join("");
  } else if (el.rTitleSelect) {
    el.rTitleSelect.innerHTML = "";
  }
}

function renderHistory() {
  const canDeleteHistoryItem = (entry) => {
    if (!entry) return false;
    if (entry.source === "appointment") {
      return isManager() || isDoctor();
    }
    if (entry.source === "clinicalRecord") {
      if (isManager() || isDoctor()) return true;
      if (isAcs()) return entry.type === "visit" && entry.createdBy === state.user?.id;
    }
    return false;
  };

  el.historyList.innerHTML = "";
  if (!state.history.length) { el.historyList.innerHTML='<div class="empty-msg">Sem histórico.</div>'; return; }
  state.history.forEach(r => {
    const d = document.createElement("div");
    d.className = "tl-item";
    const dt = new Date(r.date);
    const hasTime = String(r.date || "").includes("T");
    d.innerHTML = `
      <div class="tl-date">${dt.toLocaleDateString("pt-BR")}${hasTime ? `<br>${dt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}` : ""}</div>
      <div class="tl-spine"><div class="tl-dot"></div><div class="tl-line"></div></div>
      <div class="tl-body">
        <div class="tl-type">${typeLabel[r.type]||r.type}</div>
        <div class="tl-title">${r.title||"-"}</div>
        ${r.details ? `<div class="tl-detail">${r.details}</div>` : ""}
        <div class="tl-source">Origem: ${r.source||"-"}</div>
        ${canDeleteHistoryItem(r) ? `
          <div class="inline-actions" style="margin-top:.45rem;">
            <button class="btn-secondary history-delete-btn" data-source="${r.source}" data-id="${r.id}" data-type="${r.type || ""}">Excluir</button>
          </div>` : ""}
      </div>`;
    el.historyList.appendChild(d);
  });

  document.querySelectorAll(".history-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!state.selectedPatient) return;
      const source = String(btn.dataset.source || "");
      const id = String(btn.dataset.id || "");
      const kind = source === "appointment" ? "atendimento" : "registro";
      if (!id || !source) return;
      const ok = confirm(`Excluir este ${kind}? Essa ação não pode ser desfeita.`);
      if (!ok) return;
      try {
        if (source === "appointment") {
          await api(`/patients/${state.selectedPatient.id}/appointments/${id}`, { method: "DELETE" });
        } else if (source === "clinicalRecord") {
          await api(`/patients/${state.selectedPatient.id}/records/${id}`, { method: "DELETE" });
        } else {
          showToast("Origem não suportada para exclusão.", "error");
          return;
        }
        showToast(`${kind.charAt(0).toUpperCase()}${kind.slice(1)} excluído com sucesso.`, "ok");
        await refreshSelectedPatientData();
        await Promise.all([loadMonthlyDemandMetric(), loadDataQualityMetric()]);
        await loadGlobalTasks();
      } catch (e) {
        showToast(e.message, "error");
      }
    });
  });
}

// -- Render: audit --------------------------------------------------------------
function renderAuditLogs() {
  if (!(isManager() || isDoctor())) return;
  el.auditList.innerHTML = "";
  if (!state.auditLogs.length) { el.auditList.innerHTML='<div class="empty-msg">Sem registros.</div>'; return; }
  state.auditLogs.slice(0,20).forEach(log => {
    const d = document.createElement("div");
    d.className = "audit-row";
    d.innerHTML = `
      <div><div class="audit-action">${log.action}</div><div class="audit-who">${log.userName} | ${log.userRole}</div></div>
      <div class="audit-when">${new Date(log.createdAt).toLocaleString("pt-BR")}</div>`;
    el.auditList.appendChild(d);
  });
}

// -- Record form behavior ------------------------------------------------------
el.rType?.addEventListener("change", updateRecordTitleControls);

// -- Load data -----------------------------------------------------------------
async function loadPatients(options = {}) {
  const { skipProtocolStatuses = false } = options;
  const p = new URLSearchParams();
  if (state.filters.microArea)    p.set("microArea",    state.filters.microArea);
  if (state.filters.acsId)        p.set("acsId",        state.filters.acsId);
  if (state.filters.careCategory) p.set("careCategory", state.filters.careCategory);
  const q = p.toString();
  state.patients = await api(`/patients${q ? `?${q}` : ""}`);
  const validIds = new Set(state.patients.map((item) => item.id));
  state.selectedPatientIds = new Set([...state.selectedPatientIds].filter((id) => validIds.has(id)));
  if (state.selectedPatient) {
    const fresh = state.patients.find((pItem) => pItem.id === state.selectedPatient.id);
    if (!fresh) {
      state.selectedPatient = null;
      renderPatientHeader();
    } else {
      state.selectedPatient = fresh;
      renderPatientHeader();
    }
  }
  renderPatients();
  renderWorkspaceHome();
  if (isManager() || isDoctor()) {
    loadDataQualityMetric();
  }
  if (!skipProtocolStatuses) {
    loadProtocolStatusesForDashboard().catch(() => {
      showToast("Não foi possível atualizar status de protocolo agora.", "error", 2500);
    });
  }
}
async function loadGlobalTasks() {
  try {
    const allTasks = await api("/tasks");
    state.globalTasks = Array.isArray(allTasks) ? allTasks : [];
  } catch {
    state.globalTasks = [];
  }
  renderWorkspaceHome();
}
async function loadTeamActivityLog() {
  if (!isAnaAdminAccount()) {
    state.teamActivityLog = [];
    renderTeamActivityLog();
    return;
  }
  try {
    const payload = await api("/users/activity-log");
    state.teamActivityLog = Array.isArray(payload?.items) ? payload.items : [];
    state.teamActivityWindowSeconds = Number(payload?.onlineWindowSeconds || 120);
  } catch {
    state.teamActivityLog = [];
  }
  renderTeamActivityLog();
}

async function sendPresencePing() {
  if (!state.token) return;
  try { await api("/me/presence", { method: "POST", body: "{}" }); } catch {}
}

function startPresenceAndActivityTimers() {
  if (_presencePingTimer) clearInterval(_presencePingTimer);
  if (_activityLogRefreshTimer) clearInterval(_activityLogRefreshTimer);

  sendPresencePing();
  _presencePingTimer = setInterval(() => {
    sendPresencePing();
  }, PRESENCE_PING_MS);

  if (isAnaAdminAccount()) {
    loadTeamActivityLog();
    _activityLogRefreshTimer = setInterval(() => {
      loadTeamActivityLog();
    }, PRESENCE_PING_MS);
  }
}
async function loadMonthlyDemandMetric() {
  if (!(isManager() || isDoctor())) {
    state.demandMonthly = null;
    renderWorkspaceHome();
    return;
  }
  try {
    state.demandMonthly = await api("/metrics/demand/monthly");
  } catch {
    state.demandMonthly = null;
  }
  renderWorkspaceHome();
}
async function loadDataQualityMetric() {
  if (!(isManager() || isDoctor())) {
    state.dataQuality = null;
    renderWorkspaceHome();
    return;
  }
  try {
    state.dataQuality = await api("/metrics/data-quality");
  } catch {
    state.dataQuality = null;
  }
  renderWorkspaceHome();
}
async function loadAppointments()    { if (!state.selectedPatient) return; state.appointments   = await api(`/patients/${state.selectedPatient.id}/appointments`);    renderAppointments(); }
async function loadTasks()           { if (!state.selectedPatient) return; state.tasks          = await api(`/tasks?patientId=${state.selectedPatient.id}`);          renderTasks(); }
async function loadMessages()        { if (!state.selectedPatient) return; state.messages       = await api(`/patients/${state.selectedPatient.id}/messages`);        renderMessages(); }
async function loadHistory()         { if (!state.selectedPatient) return; state.history        = await api(`/patients/${state.selectedPatient.id}/history`);         renderHistory(); }
async function loadProtocolSummary() { if (!state.selectedPatient) return; state.protocolSummary= await api(`/patients/${state.selectedPatient.id}/protocol-summary`);renderProtocolSummary(); }
async function loadAuditLogs()       { if (!state.selectedPatient||!(isManager() || isDoctor())) return; state.auditLogs = await api(`/audit-logs?patientId=${state.selectedPatient.id}`); renderAuditLogs(); }

async function refreshSelectedPatientData() {
  if (!state.selectedPatient) return;
  await Promise.all([loadAppointments(), loadTasks(), loadMessages(), loadHistory(), loadProtocolSummary(), loadAuditLogs()]);
}

async function selectPatient(patient) {
  state.editingPatientId = null;
  state.selectedPatient = patient;
  renderPatients();
  renderPatientHeader();
  switchToTab("panelProtocol");
  await refreshSelectedPatientData();
  persistViewState();
}

// -- Bootstrap -----------------------------------------------------------------
async function bootstrapAfterLogin() {
  const savedView = readViewState() || {};
  touchSession(true);
  setupInactivityWatcher();
  startPresenceAndActivityTimers();
  const allowedSections = ["dashboard", "patients", "protocols", "acs", "doctors", "ai"];
  state.navSection = allowedSections.includes(savedView.navSection) ? savedView.navSection : "dashboard";
  state.workspaceTab = savedView.workspaceTab === "protocols" ? "protocols" : "dashboard";
  state.selectedPatient = null;

  if (isAcs()) { state.filters.acsId = state.user.id; }
  applyRolePermissions();
  resetProtocolForm();
  if (!state.dashboardSort) state.dashboardSort = "name_asc";
  if (!Number.isFinite(Number(state.dashboardPage)) || state.dashboardPage < 1) state.dashboardPage = 1;
  if (!state.dashboardProtocolStatus) state.dashboardProtocolStatus = "all";
  if (el.aDemandType) el.aDemandType.value = "scheduled";
  if (el.topbarSearchInput) el.topbarSearchInput.value = state.dashboardQuery || "";
  if (el.homePatientNameInput) el.homePatientNameInput.value = state.dashboardQuery || "";
  if (el.homePatientSortSelect) el.homePatientSortSelect.value = state.dashboardSort || "name_asc";
  if (el.homePatientCategoryFilter) el.homePatientCategoryFilter.value = state.dashboardCategory || "";
  if (el.homePatientAcsFilter) el.homePatientAcsFilter.value = state.dashboardAcsId || "";
  if (el.homePatientProtocolStatusFilter) el.homePatientProtocolStatusFilter.value = state.dashboardProtocolStatus || "all";
  if (el.topFilterMicroArea) el.topFilterMicroArea.value = state.filters.microArea || "";
  if (el.topFilterAcs) el.topFilterAcs.value = state.filters.acsId || "";
  if (el.topFilterCategory) el.topFilterCategory.value = state.filters.careCategory || "";
  switchWorkspaceTab(state.workspaceTab);
  switchNavSection(state.navSection);
  renderWorkspaceHome();
  // Exibe a aplicação somente após restaurar a navegação salva,
  // evitando o "flash" do painel padrão ao atualizar.
  el.authScreen.classList.add("hidden");
  el.appScreen.classList.remove("hidden");

  try {
    const boot = await api("/bootstrap");
    state.patients = Array.isArray(boot?.patients) ? boot.patients : [];
    state.users = Array.isArray(boot?.users) ? boot.users : [];
    state.globalTasks = Array.isArray(boot?.tasks) ? boot.tasks : [];
    state.protocolTemplates = Array.isArray(boot?.protocolTemplates) ? boot.protocolTemplates : [];
    state.demandMonthly = boot?.demandMonthly || null;
    state.dataQuality = boot?.dataQuality || null;
    fillAcsSelect(el.tAssignee);
    fillAcsSelect(el.pAcs);
    fillAcsSelect(el.topFilterAcs, true);
    renderTeamUsersLists();
    renderProtocolAdminList();
    renderPatients();
    renderWorkspaceHome();
  } catch {
    await loadPatients({ skipProtocolStatuses: true });
  }

  if (!state.patients.length) {
    await loadPatients({ skipProtocolStatuses: true });
  }

  if (savedView.selectedPatientId) {
    const savedPatient = state.patients.find((item) => item.id === savedView.selectedPatientId);
    if (savedPatient) {
      await selectPatient(savedPatient);
      if (savedView.activePatientPanel) {
        switchToTab(String(savedView.activePatientPanel));
      }
    }
  }
  loadProtocolStatusesForDashboard().catch(() => {
    showToast("Não foi possível atualizar status de protocolo agora.", "error", 2500);
  });

  Promise.allSettled([api("/users"), reloadTemplateData()])
    .then((results) => {
      const usersResult = results[0];
      if (usersResult?.status === "fulfilled") {
        state.users = usersResult.value;
        fillAcsSelect(el.tAssignee);
        fillAcsSelect(el.pAcs);
        fillAcsSelect(el.topFilterAcs, true);
        renderTeamUsersLists();
      }
      renderProtocolAdminList();
      renderWorkspaceHome();
    })
    .catch(() => {});

  loadGlobalTasks();
  loadMonthlyDemandMetric();
  loadDataQualityMetric();
  persistViewState();
}

async function bootstrapBeforeLogin() {
  try { state.publicTeams = await api("/teams/public"); fillTeamSelect(); fillCouncilUfSelects(); updateRegisterFormVisibility(); }
  catch (e) { console.warn("Could not load teams:", e.message); }
}

// -- Event listeners -----------------------------------------------------------
function withSpinner(btn, fn) {
  return async () => {
    const text = btn.querySelector(".btn-text");
    const spin = btn.querySelector(".btn-spin");
    try { btn.disabled=true; text?.classList.add("hidden"); spin?.classList.remove("hidden"); await fn(); }
    catch (e) { showToast(e.message, "error"); }
    finally { btn.disabled=false; text?.classList.remove("hidden"); spin?.classList.add("hidden"); }
  };
}

el.loginBtn.addEventListener("click", withSpinner(el.loginBtn, async () => {
  const loginAttempt = await api("/auth/login", { method:"POST", body:JSON.stringify({ email:el.loginEmail.value.trim(), password:el.loginPassword.value }) });
  let payload = loginAttempt;
  if (loginAttempt?.twoFactorRequired) {
    const code = prompt("Digite o código de 6 dígitos do seu app autenticador (2FA):");
    if (!code) throw new Error("Login cancelado: código 2FA não informado.");
    payload = await api("/auth/login/verify", {
      method: "POST",
      body: JSON.stringify({
        challengeId: loginAttempt.challengeId,
        code
      })
    });
  }
  state.user = payload.user; state.token = payload.token;
  persistSession();
  updateSessionView(); await bootstrapAfterLogin();
}));

el.registerBtn.addEventListener("click", withSpinner(el.registerBtn, async () => {
  const role = el.registerRole?.value || "nurse_manager";
  if (!passwordStrong(el.registerPassword.value)) {
    throw new Error("Senha fraca: mínimo de 8 caracteres, 1 maiúscula, 1 número e 1 especial.");
  }
  if (!String(el.registerTeam?.value || "").trim()) {
    throw new Error("Selecione a equipe para continuar.");
  }
  const check = validateCouncil(role, el.registerCouncilNumber.value, el.registerCouncilUf.value);
  if (!check.ok) { showToast(check.message, "error"); throw new Error(check.message); }
  const payload = await api("/auth/register", { method:"POST", body:JSON.stringify({
    name: el.registerName.value.trim(), email: el.registerEmail.value.trim(),
    password: el.registerPassword.value, role,
    teamId: el.registerTeam.value,
    councilNumber: check.number||"", councilUf: check.uf||""
  })});
  state.user = payload.user; state.token = payload.token;
  persistSession();
  updateSessionView(); await bootstrapAfterLogin();
}));

function loginWithEnter(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  el.loginBtn.click();
}
el.loginEmail?.addEventListener("keydown", loginWithEnter);
el.loginPassword?.addEventListener("keydown", loginWithEnter);

el.registerRole?.addEventListener("change", updateRegisterFormVisibility);
el.registerCouncilNumber.addEventListener("input", () => {
  const maxLen = (el.registerRole?.value || "") === "doctor" ? 8 : 10;
  el.registerCouncilNumber.value = formatCouncilNumber(el.registerCouncilNumber.value, maxLen);
});
el.profileCouncilNumber?.addEventListener("input", () => {
  const maxLen = state.user?.role === "doctor" ? 8 : 10;
  el.profileCouncilNumber.value = formatCouncilNumber(el.profileCouncilNumber.value, maxLen);
});

function openPatientCreateModal() {
  state.editingPatientId = null;
  el.patientModalTitle.textContent = "Novo cadastro de paciente";
  el.createPatientBtn.textContent = "Salvar";
  ["pName","pMotherName","pPhone","pPhoneAlt","pCpf","pCns","pCep","pStreet","pNumber","pNeighborhood","pCity","pState","pComorb","pMeds","pAllergies","pBirthDate","pPregnancyStartDate","pExpectedDeliveryDate","pGestationalAgeDumWeeks","pGestationalAgeDumDays","pGestationalAgeUsgWeeks","pGestationalAgeUsgDays","pUsgDate1","pUsgDate2","pUsgDate3","pPrenatalStartDate","pPostpartumStartDate"].forEach((id) => {
    const ref = document.getElementById(id);
    if (ref) ref.value = "";
  });
  if (el.pSexAtBirth) el.pSexAtBirth.value = "";
  if (el.pMaritalStatus) el.pMaritalStatus.value = "";
  if (el.pGenderIdentity) el.pGenderIdentity.value = "";
  el.pAcs.value = "";
  el.pCareCategory.value = "general";
  setSelectedChronicConditions([]);
  updateChronicConditionsVisibility();
  el.patientModal.classList.remove("hidden");
}

el.quickSelectFirstPatientBtn?.addEventListener("click", () => {
  if (!(isManager() || isDoctor())) {
    showToast("Sem permissão para cadastrar paciente.", "error");
    return;
  }
  openPatientCreateModal();
});

el.navDashboardBtn?.addEventListener("click", () => switchNavSection("dashboard"));
el.navPatientsBtn?.addEventListener("click", () => switchNavSection("patients"));
el.navProtocolsBtn?.addEventListener("click", () => switchNavSection("protocols"));
el.navAcsBtn?.addEventListener("click", () => switchNavSection("acs"));
el.navDoctorsBtn?.addEventListener("click", () => switchNavSection("doctors"));
el.navAiBtn?.addEventListener("click", () => switchNavSection("ai"));
el.mobileMenuBtn?.addEventListener("click", toggleSidebarDrawer);
el.sidebarBackdrop?.addEventListener("click", closeSidebarDrawer);
el.mobileHomeBtn?.addEventListener("click", () => {
  goHomeDashboard();
  closeSidebarDrawer();
});
el.mobileProfileBtn?.addEventListener("click", () => {
  openProfileModal();
  closeSidebarDrawer();
});
el.mobileLogoutBtn?.addEventListener("click", () => logoutUser(false));
window.addEventListener("resize", () => {
  if (!isMobileLayout()) closeSidebarDrawer();
});

el.openPatientModalBtn?.addEventListener("click", openPatientCreateModal);
el.pCareCategory?.addEventListener("change", updateChronicConditionsVisibility);
el.closePatientModalBtn?.addEventListener("click", () => el.patientModal.classList.add("hidden"));
el.cancelPatientModalBtn?.addEventListener("click", () => el.patientModal.classList.add("hidden"));
el.patientModal?.addEventListener("click", (e) => {
  if (e.target === el.patientModal) el.patientModal.classList.add("hidden");
});

function updateCreateUserRoleVisibility() {
  const isDoctorRole = el.managerCreateRole.value === "doctor";
  el.managerCreateCouncilWrap.classList.toggle("hidden", !isDoctorRole);
  if (isDoctorRole) {
    el.managerCreateCouncilNumber.maxLength = 9;
    el.managerCreateCouncilNumber.placeholder = "Ex: 1234 5678";
    el.managerCreateCouncilNumber.value = formatCouncilNumber(el.managerCreateCouncilNumber.value, 8);
  }
}

function closeEditTeamUserModal() {
  state.editingTeamUserId = null;
  if (el.editTeamUserRole) el.editTeamUserRole.value = "";
  if (el.editTeamUserName) el.editTeamUserName.value = "";
  if (el.editTeamUserEmail) el.editTeamUserEmail.value = "";
  if (el.editTeamUserPassword) el.editTeamUserPassword.value = "";
  if (el.editTeamUserCouncilNumber) el.editTeamUserCouncilNumber.value = "";
  if (el.editTeamUserCouncilUf) el.editTeamUserCouncilUf.value = "";
  el.editTeamUserCouncilWrap?.classList.add("hidden");
  el.editTeamUserModal?.classList.add("hidden");
}

function openEditTeamUserModal(user) {
  if (!user) return;
  state.editingTeamUserId = user.id;
  const role = user.role === "doctor" ? "doctor" : "acs";
  if (el.editTeamUserRole) {
    el.editTeamUserRole.value = role === "doctor" ? "Médico(a)" : "ACS";
  }
  if (el.editTeamUserName) el.editTeamUserName.value = String(user.name || "");
  if (el.editTeamUserEmail) el.editTeamUserEmail.value = String(user.email || "");
  if (el.editTeamUserPassword) el.editTeamUserPassword.value = "";
  const isDoctorRole = role === "doctor";
  el.editTeamUserCouncilWrap?.classList.toggle("hidden", !isDoctorRole);
  if (isDoctorRole) {
    const councilCurrent = formatCouncilNumber(user.councilNumber || "", 8);
    if (el.editTeamUserCouncilNumber) {
      el.editTeamUserCouncilNumber.maxLength = 9;
      el.editTeamUserCouncilNumber.placeholder = "Ex: 1234 5678";
      el.editTeamUserCouncilNumber.value = councilCurrent;
    }
    if (el.editTeamUserCouncilUf) el.editTeamUserCouncilUf.value = String(user.councilUf || "").toUpperCase();
  } else {
    if (el.editTeamUserCouncilNumber) el.editTeamUserCouncilNumber.value = "";
    if (el.editTeamUserCouncilUf) el.editTeamUserCouncilUf.value = "";
  }
  el.editTeamUserModal?.classList.remove("hidden");
}

el.openCreateUserModalBtn?.addEventListener("click", () => {
  el.createUserModal.classList.remove("hidden");
  updateCreateUserRoleVisibility();
});
el.closeCreateUserModalBtn?.addEventListener("click", () => el.createUserModal.classList.add("hidden"));
el.cancelCreateUserModalBtn?.addEventListener("click", () => el.createUserModal.classList.add("hidden"));
el.createUserModal?.addEventListener("click", (e) => {
  if (e.target === el.createUserModal) el.createUserModal.classList.add("hidden");
});
el.managerCreateRole?.addEventListener("change", updateCreateUserRoleVisibility);

el.saveCreateUserBtn?.addEventListener("click", async () => {
  try {
    if (!passwordStrong(el.managerCreatePassword.value)) {
      throw new Error("Senha fraca: mínimo de 8 caracteres, 1 maiúscula, 1 número e 1 especial.");
    }

    const payload = {
      role: el.managerCreateRole.value,
      name: el.managerCreateName.value.trim(),
      email: el.managerCreateEmail.value.trim(),
      password: el.managerCreatePassword.value
    };

    if (payload.role === "doctor") {
      payload.councilNumber = councilDigits(el.managerCreateCouncilNumber.value, 8);
      payload.councilUf = String(el.managerCreateCouncilUf.value || "").toUpperCase().trim();
    }

    await api("/users", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    showToast("Usuário cadastrado com sucesso.", "ok");
    el.managerCreateName.value = "";
    el.managerCreateEmail.value = "";
    el.managerCreatePassword.value = "";
    el.managerCreateCouncilNumber.value = "";
    el.managerCreateCouncilUf.value = "";
    el.createUserModal.classList.add("hidden");

    state.users = await api("/users");
    fillAcsSelect(el.tAssignee);
    fillAcsSelect(el.pAcs);
    fillAcsSelect(el.topFilterAcs, true);
    renderTeamUsersLists();
    renderWorkspaceHome();
  } catch (e) {
    showToast(e.message, "error");
  }
});

el.closeEditTeamUserModalBtn?.addEventListener("click", closeEditTeamUserModal);
el.cancelEditTeamUserModalBtn?.addEventListener("click", closeEditTeamUserModal);
el.editTeamUserModal?.addEventListener("click", (e) => {
  if (e.target === el.editTeamUserModal) closeEditTeamUserModal();
});

el.saveEditTeamUserBtn?.addEventListener("click", async () => {
  const userId = String(state.editingTeamUserId || "").trim();
  if (!userId) {
    showToast("Usuário inválido para edição.", "error");
    return;
  }
  const target = state.users.find((u) => u.id === userId);
  if (!target) {
    showToast("Usuário não encontrado.", "error");
    return;
  }

  try {
    const payload = {
      name: String(el.editTeamUserName?.value || "").trim(),
      email: String(el.editTeamUserEmail?.value || "").trim()
    };
    const password = String(el.editTeamUserPassword?.value || "").trim();
    if (password) {
      if (!passwordStrong(password)) {
        showToast("Senha fraca: mínimo de 8 caracteres, 1 maiúscula, 1 número e 1 especial.", "error");
        return;
      }
      payload.password = password;
    }

    if (target.role === "doctor") {
      const currentCouncil = councilDigits(target.councilNumber || "", 8);
      const nextCouncil = councilDigits(el.editTeamUserCouncilNumber?.value || "", 8);
      const nextUf = String(el.editTeamUserCouncilUf?.value || "").trim().toUpperCase();
      const currentUf = String(target.councilUf || "").trim().toUpperCase();
      if (nextCouncil && (nextCouncil !== currentCouncil || nextUf !== currentUf)) {
        payload.councilNumber = nextCouncil;
        payload.councilUf = nextUf;
      }
    }

    await api(`/users/${target.id}`, { method: "PUT", body: JSON.stringify(payload) });
    showToast("Cadastro atualizado.", "ok");
    closeEditTeamUserModal();
    state.users = await api("/users");
    fillAcsSelect(el.tAssignee);
    fillAcsSelect(el.pAcs);
    fillAcsSelect(el.topFilterAcs, true);
    renderTeamUsersLists();
    renderWorkspaceHome();
  } catch (e) {
    showToast(e.message, "error");
  }
});

el.pPhone?.addEventListener("input", () => { el.pPhone.value = formatPhone(el.pPhone.value); });
el.pPhoneAlt?.addEventListener("input", () => { el.pPhoneAlt.value = formatPhone(el.pPhoneAlt.value); });
el.pCpf?.addEventListener("input", () => { el.pCpf.value = formatCpf(el.pCpf.value); });
el.pCns?.addEventListener("input", () => { el.pCns.value = formatCns(el.pCns.value); });
el.pCep?.addEventListener("input", () => { el.pCep.value = formatCep(el.pCep.value); });
el.pNumber?.addEventListener("input", () => { el.pNumber.value = onlyDigits(el.pNumber.value).slice(0, 10); });
el.pGestationalAgeDumWeeks?.addEventListener("input", () => {
  const parsed = parseWeeksInput(el.pGestationalAgeDumWeeks.value);
  el.pGestationalAgeDumWeeks.value = parsed === "" ? "" : String(parsed);
});
el.pGestationalAgeDumDays?.addEventListener("input", () => {
  const parsed = parseGestationalDaysInput(el.pGestationalAgeDumDays.value);
  el.pGestationalAgeDumDays.value = parsed === "" ? "" : String(parsed);
});
el.pGestationalAgeUsgWeeks?.addEventListener("input", () => {
  const parsed = parseWeeksInput(el.pGestationalAgeUsgWeeks.value);
  el.pGestationalAgeUsgWeeks.value = parsed === "" ? "" : String(parsed);
});
el.pGestationalAgeUsgDays?.addEventListener("input", () => {
  const parsed = parseGestationalDaysInput(el.pGestationalAgeUsgDays.value);
  el.pGestationalAgeUsgDays.value = parsed === "" ? "" : String(parsed);
});
el.pState?.addEventListener("input", () => { el.pState.value = String(el.pState.value || "").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2); });
el.managerCreateCouncilNumber?.addEventListener("input", () => { el.managerCreateCouncilNumber.value = formatCouncilNumber(el.managerCreateCouncilNumber.value, 8); });
el.editTeamUserCouncilNumber?.addEventListener("input", () => { el.editTeamUserCouncilNumber.value = formatCouncilNumber(el.editTeamUserCouncilNumber.value, 8); });

el.pCep?.addEventListener("blur", async () => {
  const cep = onlyDigits(el.pCep.value);
  if (cep.length !== 8) return;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (data.erro) return;
    if (!String(el.pStreet.value || "").trim()) el.pStreet.value = data.logradouro || "";
    if (!String(el.pNeighborhood.value || "").trim()) el.pNeighborhood.value = data.bairro || "";
    if (!String(el.pCity.value || "").trim()) el.pCity.value = data.localidade || "";
    if (!String(el.pState.value || "").trim()) el.pState.value = String(data.uf || "").toUpperCase().slice(0, 2);
  } catch {
    // Ignora falha de CEP para não travar cadastro.
  }
});

el.homeTabDashboardBtn?.addEventListener("click", () => switchWorkspaceTab("dashboard"));
el.homeTabProtocolsBtn?.addEventListener("click", () => switchWorkspaceTab("protocols"));

el.openProtocolModalBtn?.addEventListener("click", () => {
  state.editingProtocolCategory = null;
  resetProtocolForm();
  openProtocolModal();
});
el.closeProtocolModalBtn?.addEventListener("click", closeProtocolModal);
el.cancelProtocolModalBtn?.addEventListener("click", closeProtocolModal);
el.protocolModal?.addEventListener("click", (e) => {
  if (e.target === el.protocolModal) closeProtocolModal();
});

el.topbarSearchInput?.addEventListener("input", () => {
  state.dashboardQuery = el.topbarSearchInput.value || "";
  if (el.homePatientNameInput && el.homePatientNameInput.value !== state.dashboardQuery) {
    el.homePatientNameInput.value = state.dashboardQuery;
  }
  state.dashboardPage = 1;
  renderHomePatientTable();
});

el.homePatientNameInput?.addEventListener("input", () => {
  state.dashboardQuery = el.homePatientNameInput.value || "";
  if (el.topbarSearchInput && el.topbarSearchInput.value !== state.dashboardQuery) {
    el.topbarSearchInput.value = state.dashboardQuery;
  }
  state.dashboardPage = 1;
  renderHomePatientTable();
});

el.homePatientSortSelect?.addEventListener("change", () => {
  state.dashboardSort = el.homePatientSortSelect.value || "name_asc";
  state.dashboardPage = 1;
  renderHomePatientTable();
});

el.homePatientCategoryFilter?.addEventListener("change", () => {
  state.dashboardCategory = el.homePatientCategoryFilter.value || "";
  state.dashboardPage = 1;
  renderHomePatientTable();
});

el.homePatientAcsFilter?.addEventListener("change", () => {
  state.dashboardAcsId = el.homePatientAcsFilter.value || "";
  state.dashboardPage = 1;
  renderHomePatientTable();
});

el.homePatientProtocolStatusFilter?.addEventListener("change", () => {
  state.dashboardProtocolStatus = el.homePatientProtocolStatusFilter.value || "all";
  state.dashboardPage = 1;
  renderHomePatientTable();
});

el.homePatientExportBtn?.addEventListener("click", exportDashboardPatientsCsv);

el.topbarFilterBtn?.addEventListener("click", () => {
  el.topFilterMicroArea.value = state.filters.microArea || "";
  el.topFilterAcs.value = state.filters.acsId || "";
  el.topFilterCategory.value = state.filters.careCategory || "";
  el.filterModal.classList.remove("hidden");
});

el.closeFilterModalBtn?.addEventListener("click", () => el.filterModal.classList.add("hidden"));
el.filterModal?.addEventListener("click", (e) => {
  if (e.target === el.filterModal) el.filterModal.classList.add("hidden");
});

el.applyTopFiltersBtn?.addEventListener("click", async () => {
  state.filters.microArea = el.topFilterMicroArea.value.trim();
  state.filters.acsId = isAcs() ? state.user.id : el.topFilterAcs.value;
  state.filters.careCategory = el.topFilterCategory.value;
  el.filterModal.classList.add("hidden");
  await loadPatients();
});

el.clearTopFiltersBtn?.addEventListener("click", async () => {
  state.filters.microArea = "";
  state.filters.acsId = isAcs() ? state.user.id : "";
  state.filters.careCategory = "";
  el.topFilterMicroArea.value = "";
  el.topFilterAcs.value = "";
  el.topFilterCategory.value = "";
  el.filterModal.classList.add("hidden");
  await loadPatients();
});

el.homePatientPrevBtn?.addEventListener("click", () => {
  state.dashboardPage = Math.max(1, state.dashboardPage - 1);
  renderHomePatientTable();
});

el.homePatientNextBtn?.addEventListener("click", () => {
  state.dashboardPage += 1;
  renderHomePatientTable();
});

el.homePatientSelectAll?.addEventListener("change", () => {
  const pageRows = [...document.querySelectorAll(".home-patient-check")]
    .map((input) => input.dataset.patientId)
    .filter(Boolean);
  if (el.homePatientSelectAll.checked) {
    pageRows.forEach((id) => state.selectedPatientIds.add(id));
  } else {
    pageRows.forEach((id) => state.selectedPatientIds.delete(id));
  }
  renderHomePatientTable();
});

el.homePatientBulkDeleteBtn?.addEventListener("click", async () => {
  await deletePatientsByIds([...state.selectedPatientIds]);
});

el.aiLoadPrioritiesBtn?.addEventListener("click", async () => {
  await runTeamAi("/ai/team/priorities");
});

el.aiLoadQualityBtn?.addEventListener("click", async () => {
  await runTeamAi("/ai/team/data-quality");
});

el.aiLoadReportBtn?.addEventListener("click", async () => {
  await runTeamAi("/ai/team/report");
});

el.aiAskTeamBtn?.addEventListener("click", async () => {
  const question = el.aiTeamQuestionInput.value.trim();
  if (!question) {
    showToast("Digite uma pergunta para o assistente.", "error");
    return;
  }
  await runTeamAi("/ai/chat", { question });
});

el.aiPatientSummaryBtn?.addEventListener("click", async () => {
  await runPatientAi("/summary");
});

el.aiPatientProtocolBtn?.addEventListener("click", async () => {
  await runPatientAi("/protocol-highlights");
});

el.aiPatientAcsMsgBtn?.addEventListener("click", async () => {
  await runPatientAi("/acs-message");
});

el.aiPatientSuggestBtn?.addEventListener("click", async () => {
  await runPatientAi("/suggest-category");
});

el.aiEvolutionBtn?.addEventListener("click", async () => {
  await runPatientAi("/evolution-draft", { freeText: el.aiEvolutionInput.value.trim() });
});

el.aiTranscriptionBtn?.addEventListener("click", async () => {
  await runPatientAi("/transcribe", { transcript: el.aiTranscriptionInput.value.trim() });
});

el.homeBtn?.addEventListener("click", goHomeDashboard);
el.backToHomeBtn?.addEventListener("click", goHomeDashboard);
el.editPatientBtn?.addEventListener("click", openPatientEdit);
el.deletePatientBtn?.addEventListener("click", deleteSelectedPatient);

el.profileBtn?.addEventListener("click", openProfileModal);
el.topbarUser?.addEventListener("click", openProfileModal);
el.closeProfileBtn?.addEventListener("click", closeProfileModal);
el.profile2faSetupBtn?.addEventListener("click", startTwoFactorSetup);
el.profile2faDisableBtn?.addEventListener("click", disableTwoFactor);
el.profileModal?.addEventListener("click", (e) => {
  if (e.target === el.profileModal) closeProfileModal();
});

el.saveProfileBtn?.addEventListener("click", async () => {
  try {
    const payload = {
      name: el.profileName.value.trim(),
      email: el.profileEmail.value.trim()
    };
    if (el.profilePassword.value.trim()) payload.password = el.profilePassword.value.trim();
    if (["doctor", "nurse_manager"].includes(state.user.role)) {
      const maxLen = state.user.role === "doctor" ? 8 : 10;
      payload.councilNumber = councilDigits(el.profileCouncilNumber.value, maxLen);
      payload.councilUf = el.profileCouncilUf.value.trim().toUpperCase();
    }

    const result = await api("/me", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });

    state.user = result.user;
    state.token = result.token;
    persistSession();
    updateSessionView();
    showToast("Perfil atualizado com sucesso.", "ok");
    closeProfileModal();
  } catch (e) {
    showToast(e.message, "error");
  }
});

el.createProtocolBtn?.addEventListener("click", async () => {
  if (!isManager()) return;
  try {
    const payload = protocolFormPayload();
    if (!payload.category || !payload.label) {
      showToast("Preencha categoria e nome.", "error");
      return;
    }

    if (state.editingProtocolCategory) {
      await api(`/protocol/templates/${state.editingProtocolCategory}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      showToast("Protocolo atualizado.", "ok");
    } else {
      await api("/protocol/templates", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      showToast("Categoria de protocolo criada.", "ok");
    }

    resetProtocolForm();
    await reloadTemplateData();
    closeProtocolModal();
    switchWorkspaceTab("protocols");
  } catch (e) {
    showToast(e.message, "error");
  }
});

el.createPatientBtn.addEventListener("click", async () => {
  try {
    const editingId = state.editingPatientId;
    if (!validatePatientForm()) return;

    const payload = {
      name: el.pName.value.trim(),
      motherName: el.pMotherName.value.trim(),
      phone: el.pPhone.value.trim(),
      phoneAlt: el.pPhoneAlt.value.trim(),
      cpf: el.pCpf.value.trim(),
      cns: el.pCns.value.trim(),
      cnsCpf: el.pCpf.value.trim() || el.pCns.value.trim(),
      address:buildAddress(),
      careCategory:el.pCareCategory.value, assignedAcsId:el.pAcs.value,
      chronicConditions: getSelectedChronicConditions(),
      birthDate: el.pBirthDate.value || "",
      sexAtBirth: el.pSexAtBirth.value || "",
      maritalStatus: el.pCareCategory.value === "child_followup" ? "" : (el.pMaritalStatus.value || ""),
      genderIdentity: el.pGenderIdentity.value || "",
      pregnancyStartDate: el.pPregnancyStartDate.value || "",
      expectedDeliveryDate: el.pExpectedDeliveryDate.value || "",
      gestationalAgeDumWeeks: parseWeeksInput(el.pGestationalAgeDumWeeks.value),
      gestationalAgeDumDays: parseGestationalDaysInput(el.pGestationalAgeDumDays.value),
      gestationalAgeUsgWeeks: parseWeeksInput(el.pGestationalAgeUsgWeeks.value),
      gestationalAgeUsgDays: parseGestationalDaysInput(el.pGestationalAgeUsgDays.value),
      usgDate1: el.pUsgDate1.value || "",
      usgDate2: el.pUsgDate2.value || "",
      usgDate3: el.pUsgDate3.value || "",
      prenatalStartDate: el.pPrenatalStartDate.value || "",
      postpartumStartDate: el.pPostpartumStartDate.value || "",
      comorbidities:el.pComorb.value, medications:el.pMeds.value, allergies:el.pAllergies.value
    };

    if (editingId) {
      await api(`/patients/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Paciente atualizado com sucesso!","ok");
    } else {
      if (!(isManager() || isDoctor())) {
        showToast("Sem permissão para criar paciente.", "error");
        return;
      }
      await api("/patients", { method:"POST", body:JSON.stringify(payload)});
      showToast("Paciente cadastrado com sucesso!","ok");
    }

    ["pName","pMotherName","pPhone","pPhoneAlt","pCpf","pCns","pStreet","pNumber","pNeighborhood","pCity","pState","pComorb","pMeds","pAllergies","pBirthDate","pPregnancyStartDate","pExpectedDeliveryDate","pGestationalAgeDumWeeks","pGestationalAgeDumDays","pGestationalAgeUsgWeeks","pGestationalAgeUsgDays","pUsgDate1","pUsgDate2","pUsgDate3","pPrenatalStartDate","pPostpartumStartDate"].forEach(id=>{document.getElementById(id).value="";});
    if (el.pSexAtBirth) el.pSexAtBirth.value = "";
    if (el.pMaritalStatus) el.pMaritalStatus.value = "";
    if (el.pGenderIdentity) el.pGenderIdentity.value = "";
    el.pCep.value = "";
    el.pAcs.value = "";
    el.pCareCategory.value = "general";
    setSelectedChronicConditions([]);
    updateChronicConditionsVisibility();
    state.editingPatientId = null;
    el.createPatientBtn.textContent = "Salvar";
    el.patientModal.classList.add("hidden");
    await loadPatients();
    await loadGlobalTasks();
    if (editingId) {
      const updatedPatient = state.patients.find((p) => p.id === editingId);
      if (updatedPatient) {
        await selectPatient(updatedPatient);
      }
    }
  } catch(e) { showToast(e.message,"error"); }
});

el.addRecordBtn.addEventListener("click", async () => {
  if (!state.selectedPatient) return;
  try {
    const type = isAcs() ? "visit" : el.rType.value;
    const date = String(el.rDate.value || "").trim();
    const details = el.rDetails.value;
    if (!date) {
      showToast("Preencha a data do registro.", "error");
      return;
    }
    if (isAcs() && type !== "visit") {
      showToast("ACS pode registrar apenas visita domiciliar.", "error");
      return;
    }

    if (type === "vaccine") {
      const vaccines = selectedVaccineNames();
      if (!vaccines.length) {
        showToast("Selecione pelo menos uma vacina.", "error");
        return;
      }
      for (const vaccineName of vaccines) {
        await api(`/patients/${state.selectedPatient.id}/records`, {
          method: "POST",
          body: JSON.stringify({
            type,
            date,
            title: vaccineName,
            details,
            protocolTag: state.selectedPatient.careCategory,
            metadata: { vaccineName, ...(_recordDraftMetadata || {}) }
          })
        });
      }
      [...el.rVaccineMulti.options].forEach((opt) => { opt.selected = false; });
      showToast(`${vaccines.length} vacina(s) registrada(s).`, "ok");
    } else {
      let title = type === "procedure" || type === "note"
        ? String(el.rTitleInput.value || "").trim()
        : String(el.rTitleSelect.value || "").trim();
      if (isAcs()) title = "Visita ACS";
      if (!title && type === "note") title = "Observação livre";
      if (!title && type === "procedure") title = "Procedimento";
      if (!title) {
        showToast("Selecione ou preencha o título do registro.", "error");
        return;
      }
      await api(`/patients/${state.selectedPatient.id}/records`, {
        method: "POST",
        body: JSON.stringify({
          type,
          date,
          title,
          details,
          protocolTag: state.selectedPatient.careCategory,
          metadata: {
            ...((type === "procedure" && el.rRapidTestTrimester?.value)
              ? { rapidTestTrimester: el.rRapidTestTrimester.value }
              : {}),
            ...(_recordDraftMetadata || {})
          }
        })
      });
      showToast("Registro salvo.", "ok");
    }

    ["rDate","rDetails","rTitleInput","rRapidTestTrimester"].forEach(id=>{const node = document.getElementById(id); if (node) node.value="";});
    _recordDraftMetadata = null;
    updateRecordTitleControls();
    await refreshSelectedPatientData();
    await loadProtocolStatusesForDashboard();
    renderWorkspaceHome();
  } catch(e) { showToast(e.message,"error"); }
});

async function submitAppointmentAndMaybeGenerateRecord(generateRecord = false) {
  if (!state.selectedPatient || (!isManager() && !isDoctor())) return;
  const payload = {
    date: el.aDate.value,
    demandType: el.aDemandType?.value || "scheduled",
    summary: el.aSummary.value,
    conduct: el.aConduct.value,
    nextStep: el.aNext.value
  };
  const appointment = await api(`/patients/${state.selectedPatient.id}/appointments`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  ["aDate", "aSummary", "aConduct", "aNext"].forEach((id) => { const node = document.getElementById(id); if (node) node.value = ""; });
  if (el.aDemandType) el.aDemandType.value = "scheduled";
  showToast("Atendimento registrado.", "ok");
  await refreshSelectedPatientData();
  await Promise.all([loadMonthlyDemandMetric(), loadDataQualityMetric()]);
  if (generateRecord) await createClinicalRecordFromAppointment(appointment);
}

el.addAppointmentBtn.addEventListener("click", async () => {
  try {
    await submitAppointmentAndMaybeGenerateRecord(false);
  } catch (e) { showToast(e.message, "error"); }
});

el.addAppointmentAndRecordBtn?.addEventListener("click", async () => {
  try {
    await submitAppointmentAndMaybeGenerateRecord(true);
  } catch (e) { showToast(e.message, "error"); }
});

el.addTaskBtn.addEventListener("click", async () => {
  if (!state.selectedPatient || !isManager()) return;
  try {
    await api("/tasks", { method:"POST", body:JSON.stringify({
      patientId:state.selectedPatient.id, assigneeId:el.tAssignee.value,
      title:el.tTitle.value, notes:el.tNotes.value, dueDate:el.tDue.value
    })});
    ["tTitle","tNotes","tDue"].forEach(id=>{document.getElementById(id).value="";});
    showToast("Tarefa criada.","ok");
    await refreshSelectedPatientData();
    await loadGlobalTasks();
  } catch(e) { showToast(e.message,"error"); }
});

el.sendMsgBtn.addEventListener("click", async () => {
  if (!state.selectedPatient) return;
  try {
    await api(`/patients/${state.selectedPatient.id}/messages`, { method:"POST", body:JSON.stringify({ text:el.mText.value }) });
    el.mText.value = "";
    await refreshSelectedPatientData();
  } catch(e) { showToast(e.message,"error"); }
});

["click", "keydown", "mousemove", "scroll", "touchstart"].forEach((eventName) => {
  window.addEventListener(eventName, () => touchSession());
});

// -- Init ----------------------------------------------------------------------
async function initApp() {
  fillRecordVaccines();
  enableSimpleMultiSelect(el.rVaccineMulti);
  updateRecordTitleControls();
  fillCouncilUfSelects();
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    await bootstrapBeforeLogin();
    return;
  }

  // Evita piscar a tela de login durante a validação de sessão.
  // A tela correta (app ou login) será exibida após essa validação.
  el.authScreen.classList.add("hidden");
  el.appScreen.classList.add("hidden");

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.expiresAt || Date.now() > Number(parsed.expiresAt)) {
      clearSessionStore();
      el.appScreen.classList.add("hidden");
      el.authScreen.classList.remove("hidden");
      await bootstrapBeforeLogin();
      return;
    }

    state.token = parsed.token;
    const me = await api("/me");
    state.user = me;
    touchSession(true);
    updateSessionView();
    await bootstrapAfterLogin();
  } catch {
    clearSessionStore();
    state.token = null;
    state.user = null;
    el.appScreen.classList.add("hidden");
    el.authScreen.classList.remove("hidden");
    await bootstrapBeforeLogin();
  }
}

initApp();







