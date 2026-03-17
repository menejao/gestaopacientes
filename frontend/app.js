const API_URL = window.__APP_CONFIG?.apiUrl || "http://localhost:3001";
const SESSION_KEY = "saudeubs_session";
const SESSION_INACTIVITY_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_TOUCH_THROTTLE_MS = 30000;

const state = {
  token: null, user: null, users: [], patients: [],
  selectedPatient: null, appointments: [], tasks: [],
  globalTasks: [],
  messages: [], auditLogs: [], history: [],
  protocolSummary: null, protocolTemplates: [], publicTeams: [],
  protocolByPatient: {},
  editingPatientId: null,
  editingProtocolCategory: null,
  navSection: "patients",
  workspaceTab: "dashboard",
  dashboardQuery: "",
  dashboardSort: "name_asc",
  dashboardPage: 1,
  dashboardPageSize: 8,
  dashboardCategory: "",
  dashboardAcsId: "",
  dashboardProtocolStatus: "all",
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
  userName:                 document.getElementById("userName"),
  userRole:                 document.getElementById("userRole"),
  userAvatar:               document.getElementById("userAvatar"),
  topbarSearchInput:        document.getElementById("topbarSearchInput"),
  topbarFilterBtn:          document.getElementById("topbarFilterBtn"),
  topbarPatient:            document.getElementById("topbarPatient"),
  patientList:              document.getElementById("patientList"),
  patientCount:             document.getElementById("patientCount"),
  navPatientsBtn:           document.getElementById("navPatientsBtn"),
  navProtocolsBtn:          document.getElementById("navProtocolsBtn"),
  navAcsBtn:                document.getElementById("navAcsBtn"),
  navDoctorsBtn:            document.getElementById("navDoctorsBtn"),
  navAiBtn:                 document.getElementById("navAiBtn"),
  openPatientModalBtn:      document.getElementById("openPatientModalBtn"),
  openCreateUserModalBtn:   document.getElementById("openCreateUserModalBtn"),
  pName:                    document.getElementById("pName"),
  pPhone:                   document.getElementById("pPhone"),
  pDoc:                     document.getElementById("pDoc"),
  pCep:                     document.getElementById("pCep"),
  pStreet:                  document.getElementById("pStreet"),
  pNeighborhood:            document.getElementById("pNeighborhood"),
  pCity:                    document.getElementById("pCity"),
  pState:                   document.getElementById("pState"),
  pAcs:                     document.getElementById("pAcs"),
  pCareCategory:            document.getElementById("pCareCategory"),
  pComorb:                  document.getElementById("pComorb"),
  pMeds:                    document.getElementById("pMeds"),
  pAllergies:               document.getElementById("pAllergies"),
  createPatientBtn:         document.getElementById("createPatientBtn"),
  patientModal:             document.getElementById("patientModal"),
  patientModalTitle:        document.getElementById("patientModalTitle"),
  closePatientModalBtn:     document.getElementById("closePatientModalBtn"),
  cancelPatientModalBtn:    document.getElementById("cancelPatientModalBtn"),
  editPatientBtn:           document.getElementById("editPatientBtn"),
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
  rTitle:                   document.getElementById("rTitle"),
  rDetails:                 document.getElementById("rDetails"),
  rVaccineName:             document.getElementById("rVaccineName"),
  vaccineNameWrap:          document.getElementById("vaccineNameWrap"),
  addRecordBtn:             document.getElementById("addRecordBtn"),
  aDate:                    document.getElementById("aDate"),
  aSummary:                 document.getElementById("aSummary"),
  aConduct:                 document.getElementById("aConduct"),
  aNext:                    document.getElementById("aNext"),
  addAppointmentBtn:        document.getElementById("addAppointmentBtn"),
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
  kpiPatientsTotal:         document.getElementById("kpiPatientsTotal"),
  kpiPatientsAssigned:      document.getElementById("kpiPatientsAssigned"),
  kpiTasksOpen:             document.getElementById("kpiTasksOpen"),
  kpiCategories:            document.getElementById("kpiCategories"),
  categorySummaryList:      document.getElementById("categorySummaryList"),
  priorityTaskList:         document.getElementById("priorityTaskList"),
  homePatientSortSelect:    document.getElementById("homePatientSortSelect"),
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

// -- Toast --------------------------------------------------------------------
let _toastTimer = null;
let _lastSessionTouchAt = 0;
let _inactivityTimer = null;
function showToast(msg, type = "default", ms = 3000) {
  el.toast.textContent = msg;
  el.toast.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.toast.classList.add("hidden"), ms);
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
  clearSessionStore();
  updateSessionView();
  if (showReason) showToast("Sessao encerrada por inatividade.", "error", 3500);
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
const canAcsUpdateTask = t => isAcs() && t.assigneeId === state.user.id;
const acsNameById  = id => state.users.find(u => u.id === id)?.name || "Nao atribuido";
const catLabel     = cat => state.protocolTemplates.find(t => t.category === cat)?.label || "Geral";
const taskOpen     = t => ["pending", "in_progress"].includes(t.status);
const prettyJson   = (obj) => JSON.stringify(obj, null, 2);
const onlyDigits   = (v) => String(v || "").replace(/\D/g, "");
const passwordStrong = (v) => /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(String(v || ""));

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

function formatCns(value) {
  const d = onlyDigits(value).slice(0, 15);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3)}`;
  if (d.length <= 11) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)} ${d.slice(11)}`;
}

function formatDocument(value) {
  const d = onlyDigits(value);
  return d.length <= 11 ? formatCpf(d) : formatCns(d);
}

function formatCep(value) {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function splitAddress(address) {
  const raw = String(address || "").trim();
  if (!raw) return { street: "", neighborhood: "", city: "", state: "", cep: "" };

  let street = "";
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
  if (pipePairs.rua || pipePairs.bairro || pipePairs.cidade || pipePairs.uf || pipePairs.cep) {
    street = pipePairs.rua || "";
    neighborhood = pipePairs.bairro || "";
    city = pipePairs.cidade || "";
    state = pipePairs.uf || "";
    cep = formatCep(pipePairs.cep || "");
    return { street, neighborhood, city, state, cep };
  }

  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  street = parts[0] || "";
  neighborhood = parts[1] || "";
  city = parts[2] || "";
  state = parts[3] || "";

  if (!state && city && city.includes("/")) {
    const [cityPart, ufPart] = city.split("/").map((part) => part.trim());
    city = cityPart || "";
    state = ufPart || "";
  }

  return { street, neighborhood, city, state, cep };
}

function buildAddress() {
  const street = String(el.pStreet?.value || "").trim();
  const neighborhood = String(el.pNeighborhood?.value || "").trim();
  const city = String(el.pCity?.value || "").trim();
  const stateUf = String(el.pState?.value || "").trim().toUpperCase();
  const cep = formatCep(el.pCep?.value || "");
  const parts = [];
  if (street) parts.push(`Rua: ${street}`);
  if (neighborhood) parts.push(`Bairro: ${neighborhood}`);
  if (city) parts.push(`Cidade: ${city}`);
  if (stateUf) parts.push(`UF: ${stateUf}`);
  if (cep) parts.push(`CEP: ${cep}`);
  return parts.join(" | ");
}

// -- API ----------------------------------------------------------------------
async function api(path, options = {}) {
  touchSession();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const res = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal }).finally(() => clearTimeout(timeout));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Erro na requisicao");
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
    el.homeBtn.classList.add("hidden");
    el.profileBtn.classList.add("hidden");
    return;
  }
  const roleMap = { nurse_manager: "Enf. Gestora", doctor: "Medico(a)", acs: "ACS" };
  el.userName.textContent  = state.user.name;
  el.userRole.textContent  = roleMap[state.user.role] || state.user.role;
  el.userAvatar.textContent = state.user.name.charAt(0).toUpperCase();
  el.logoutBtn.classList.remove("hidden");
  el.homeBtn.classList.remove("hidden");
  el.profileBtn.classList.remove("hidden");
}

el.logoutBtn?.addEventListener("click", () => logoutUser(false));

// -- Register visibility -------------------------------------------------------
function updateRegisterFormVisibility() {
  const role = el.registerRole.value;
  const needsCouncil = ["doctor","nurse_manager"].includes(role);
  const isNM = role === "nurse_manager";
  const cType = role === "doctor" ? "CRM" : "COREN";
  el.registerCouncilNumberWrap.classList.toggle("hidden", !needsCouncil);
  el.registerCouncilUfWrap.classList.toggle("hidden", !needsCouncil);
  el.registerTeamNameWrap.classList.toggle("hidden", !isNM);
  el.registerTeamWrap.classList.toggle("hidden", isNM);
  if (needsCouncil) {
    el.councilNumLabel.textContent = `Numero do conselho (${cType})`;
    el.registerCouncilNumber.placeholder = cType === "CRM" ? "4 a 8 digitos" : "4 a 10 digitos";
    el.registerCouncilNumber.maxLength = cType === "CRM" ? 8 : 10;
  }
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
  if (isRepDigits(d)) return { ok:false, message:"Conselho invalido: digitos repetidos" };
  if (isSeqDigits(d)) return { ok:false, message:"Conselho invalido: sequencia numerica" };
  if (!validUf.test(u)) return { ok:false, message:"UF do conselho invalida" };
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
  el.registerTeam.innerHTML = "";
  state.publicTeams.forEach(t => el.registerTeam.appendChild(Object.assign(document.createElement("option"), { value:t.id, textContent:t.name })));
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
  const patientFields = ["pName","pPhone","pDoc","pCep","pStreet","pNeighborhood","pCity","pState","pComorb","pMeds","pAllergies","pAcs","pCareCategory"];
  const taskFields = ["tTitle","tNotes","tDue","tAssignee"];
  const mgrFields = ["pName","pPhone","pDoc","pCep","pStreet","pNeighborhood","pCity","pState","pComorb","pMeds","pAllergies","pAcs","pCareCategory","tTitle","tNotes","tDue","tAssignee"];
  const clinFields = ["aDate","aSummary","aConduct","aNext"];

  if (isManager()) {
    el.addAppointmentBtn.classList.remove("hidden");
    el.addTaskBtn.classList.remove("hidden");
    el.editPatientBtn.classList.remove("hidden");
    el.auditTab.classList.remove("hidden");
    el.appointmentFormCard.classList.remove("hidden");
    el.taskFormCard.classList.remove("hidden");
    mgrFields.forEach(id => { document.getElementById(id).disabled = false; });
    clinFields.forEach(id => { document.getElementById(id).disabled = false; });
    [...el.rType.options].forEach(o => { o.disabled = false; });
    el.topFilterAcs?.closest(".field-group")?.classList.remove("hidden");
    return;
  }
  el.addTaskBtn.classList.add("hidden");
  el.auditTab.classList.add("hidden");
  el.taskFormCard.classList.add("hidden");
  mgrFields.forEach(id => { document.getElementById(id).disabled = true; });

  if (isDoctor()) {
    el.addAppointmentBtn.classList.remove("hidden");
    el.editPatientBtn.classList.remove("hidden");
    el.appointmentFormCard.classList.remove("hidden");
    clinFields.forEach(id => { document.getElementById(id).disabled = false; });
    patientFields.forEach(id => { document.getElementById(id).disabled = false; });
    taskFields.forEach(id => { document.getElementById(id).disabled = true; });
    [...el.rType.options].forEach(o => { o.disabled = o.value === "visit"; });
    if (el.rType.value === "visit") el.rType.value = "consultation";
    el.topFilterAcs?.closest(".field-group")?.classList.add("hidden");
    return;
  }
  // ACS
  el.editPatientBtn.classList.add("hidden");
  el.addAppointmentBtn.classList.add("hidden");
  el.appointmentFormCard.classList.add("hidden");
  clinFields.forEach(id => { document.getElementById(id).disabled = true; });
  [...el.rType.options].forEach(o => { o.disabled = !["visit","note"].includes(o.value); });
  el.rType.value = "visit";
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
    el.priorityTaskList.innerHTML = '<div class="empty-msg">Sem pendencias prioritarias.</div>';
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

  renderProtocolAdminList();
  renderDashboardFilterOptions();
  renderHomePatientTable();
}

function protocolStatusInfo(summary) {
  if (!summary) {
    return { key: "loading", label: "Carregando...", className: "status progress" };
  }

  const pendingTotal = Number(summary.pending?.visits || 0)
    + Number(summary.pending?.consultations || 0)
    + Number(summary.pending?.vaccines || 0);

  const doneTotal = Number(summary.completed?.visits || 0)
    + Number(summary.completed?.consultations || 0)
    + Number(summary.completed?.vaccines || 0);

  const targetTotal = Number(summary.targets?.visits || 0)
    + Number(summary.targets?.consultations || 0)
    + Number(summary.targets?.vaccines || 0);

  if (pendingTotal <= 0) {
    return { key: "ok", label: `Em dia (${doneTotal}/${targetTotal || doneTotal || 0})`, className: "status done" };
  }

  const completion = targetTotal > 0 ? doneTotal / targetTotal : 0;
  if (completion < 0.4) {
    return { key: "critical", label: `Atraso critico (${doneTotal}/${targetTotal || 0})`, className: "status alert" };
  }

  return { key: "attention", label: `Atraso leve (${doneTotal}/${targetTotal || 0})`, className: "status pending" };
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
  const list = getFilteredDashboardPatients();
  const total = list.length;
  const totalPages = Math.max(Math.ceil(total / state.dashboardPageSize), 1);
  if (state.dashboardPage > totalPages) state.dashboardPage = totalPages;
  const start = (state.dashboardPage - 1) * state.dashboardPageSize;
  const pageItems = list.slice(start, start + state.dashboardPageSize);

  if (!pageItems.length) {
    el.homePatientTableBody.innerHTML = '<tr><td colspan="6"><div class="empty-msg">Nenhum paciente encontrado para esse filtro.</div></td></tr>';
  } else {
    el.homePatientTableBody.innerHTML = pageItems.map((p) => {
      const summary = state.protocolByPatient[p.id];
      const statusInfo = protocolStatusInfo(summary);
      return `
        <tr>
          <td><strong>${p.name}</strong><div class="home-task-meta">${p.phone || "-"}</div></td>
          <td>${catLabel(p.careCategory)}</td>
          <td>${p.microArea || "-"}</td>
          <td>${acsNameById(p.assignedAcsId)}</td>
          <td><span class="${statusInfo.className}">${statusInfo.label}</span></td>
          <td><button class="btn-secondary home-open-patient-btn" data-patient-id="${p.id}">Abrir</button></td>
        </tr>`;
    }).join("");
  }

  el.homePatientPageInfo.textContent = `Pagina ${state.dashboardPage} de ${totalPages} | ${total} paciente(s)`;
  el.homePatientPrevBtn.disabled = state.dashboardPage <= 1;
  el.homePatientNextBtn.disabled = state.dashboardPage >= totalPages;

  document.querySelectorAll(".home-open-patient-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const patient = state.patients.find((p) => p.id === btn.dataset.patientId);
      if (patient) await selectPatient(patient);
    });
  });
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

  const header = ["Paciente", "Telefone", "Microarea", "Categoria", "ACS", "Status Protocolo"];
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
  if (!state.patients.length) {
    state.protocolByPatient = {};
    renderHomePatientTable();
    return;
  }
  const items = state.patients.slice(0, 120);
  const entries = await Promise.all(items.map(async (p) => {
    try {
      const summary = await api(`/patients/${p.id}/protocol-summary`);
      return [p.id, summary];
    } catch {
      return [p.id, null];
    }
  }));
  state.protocolByPatient = Object.fromEntries(entries);
  renderHomePatientTable();
}

function goHomeDashboard() {
  switchNavSection("patients");
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
    el.profileCouncilNumber.value = state.user.councilNumber || "";
    el.profileCouncilUf.value = state.user.councilUf || "";
  }
  el.profileModal.classList.remove("hidden");
}

function closeProfileModal() {
  el.profileModal.classList.add("hidden");
}

function requireSelectedPatientForAi() {
  if (!state.selectedPatient) {
    showToast("Selecione um paciente para usar IA.", "error");
    switchNavSection("patients");
    return false;
  }
  return true;
}

async function runTeamAi(path, payload = {}) {
  try {
    const data = await api(path, { method: "POST", body: JSON.stringify(payload) });
    el.aiHubOutput.textContent = prettyJson(data);
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function runPatientAi(path, payload = {}) {
  if (!requireSelectedPatientForAi()) return;
  try {
    const data = await api(`/ai/patients/${state.selectedPatient.id}${path}`, { method: "POST", body: JSON.stringify(payload) });
    el.aiPatientOutput.textContent = prettyJson(data);
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
  el.homeDashboardPane.classList.toggle("hidden", state.workspaceTab !== "dashboard");
  el.protocolAdminSection.classList.toggle("hidden", state.workspaceTab !== "protocols");
}

function renderTeamUsersLists() {
  const acsUsers = state.users.filter((u) => u.role === "acs");
  const doctorUsers = state.users.filter((u) => u.role === "doctor");

  el.acsList.innerHTML = acsUsers.length
    ? acsUsers.map((u) => `<div class="home-list-row"><span class="home-list-main">${u.name}</span><span class="home-task-meta">${u.email}</span></div>`).join("")
    : '<div class="empty-msg">Nenhum ACS cadastrado.</div>';

  el.doctorList.innerHTML = doctorUsers.length
    ? doctorUsers.map((u) => `<div class="home-list-row"><span class="home-list-main">${u.name}</span><span class="home-task-meta">${u.email}</span></div>`).join("")
    : '<div class="empty-msg">Nenhum medico cadastrado.</div>';
}

function switchNavSection(section) {
  const isMgr = isManager();
  const next = String(section || "patients");
  const allowed = ["patients", "protocols", "acs", "doctors", "ai"];
  state.navSection = allowed.includes(next) ? next : "patients";

  if (!isMgr && ["protocols", "acs", "doctors", "ai"].includes(state.navSection)) {
    state.navSection = "patients";
  }

  el.navPatientsBtn.classList.toggle("active", state.navSection === "patients");
  el.navProtocolsBtn.classList.toggle("active", state.navSection === "protocols");
  el.navAcsBtn.classList.toggle("active", state.navSection === "acs");
  el.navDoctorsBtn.classList.toggle("active", state.navSection === "doctors");
  el.navAiBtn.classList.toggle("active", state.navSection === "ai");

  el.navProtocolsBtn.classList.toggle("hidden", !isMgr);
  el.navAcsBtn.classList.toggle("hidden", !isMgr);
  el.navDoctorsBtn.classList.toggle("hidden", !isMgr);
  el.navAiBtn.classList.toggle("hidden", !isMgr);

  el.openPatientModalBtn.classList.toggle("hidden", !isMgr);
  el.openCreateUserModalBtn.classList.toggle("hidden", !isMgr);

  el.homeDashboardPane.classList.toggle("hidden", state.navSection !== "patients");
  el.protocolAdminSection.classList.toggle("hidden", state.navSection !== "protocols");
  el.acsAdminSection.classList.toggle("hidden", state.navSection !== "acs");
  el.doctorsAdminSection.classList.toggle("hidden", state.navSection !== "doctors");
  el.aiHubSection.classList.toggle("hidden", state.navSection !== "ai");

  if (state.navSection === "patients") switchWorkspaceTab("dashboard");
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
    vaccines: el.protocolVaccinesListInput.value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
    authority: el.protocolAuthorityInput.value.trim() || "Ministerio da Saude",
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
  el.protocolVaccinesListInput.value = "";
  el.protocolAuthorityInput.value = "Ministerio da Saude";
  el.protocolReferenceInput.value = "";
  el.protocolVersionInput.value = "1.0";
  el.createProtocolBtn.textContent = "Confirmar";
  el.protocolModalTitle.textContent = "Novo protocolo";
}

function renderProtocolAdminList() {
  if (!el.protocolAdminList) return;
  if (!isManager()) {
    el.protocolAdminList.innerHTML = '<div class="empty-msg">Somente a enfermeira gestora administra protocolos.</div>';
    return;
  }

  el.protocolAdminList.innerHTML = state.protocolTemplates
    .map((t) => {
      const isTeamOwned = Boolean(t.teamId);
      return `
      <div class="home-task-row">
        <div>
          <p class="home-task-title">${t.label} <span class="home-task-meta">(${t.category})${isTeamOwned ? "" : " [base]"}</span></p>
          <p class="home-task-meta">Metas: ${t.targets.visits} visitas | ${t.targets.consultations} consultas | ${t.targets.vaccines} vacinas</p>
          <p class="home-task-meta">Norma: ${t.authority || "Ministerio da Saude"} | Ref: ${t.reference ? `<a href="${t.reference}" target="_blank" rel="noopener noreferrer">link oficial</a>` : "-"} | Versao: ${t.version || "1.0"}</p>
        </div>
        <div class="inline-actions">
          <button class="btn-secondary protocol-edit-btn" data-category="${t.category}">Editar</button>
          ${isTeamOwned ? `<button class="btn-secondary protocol-delete-btn" data-category="${t.category}">Excluir</button>` : ""}
        </div>
      </div>`;
    })
    .join("");

  document.querySelectorAll(".protocol-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const category = btn.dataset.category;
      const template = state.protocolTemplates.find((t) => t.category === category);
      if (!template) return;
      state.editingProtocolCategory = category;
      el.protocolCategoryInput.value = template.category;
      el.protocolCategoryInput.disabled = true;
      el.protocolLabelInput.value = template.label;
      el.protocolVisitsInput.value = String(template.targets.visits || 0);
      el.protocolConsultationsInput.value = String(template.targets.consultations || 0);
      el.protocolVaccinesTargetInput.value = String(template.targets.vaccines || 0);
      el.protocolVaccinesListInput.value = (template.vaccines || []).join(", ");
      el.protocolAuthorityInput.value = template.authority || "Ministerio da Saude";
      el.protocolReferenceInput.value = template.reference || "";
      el.protocolVersionInput.value = template.version || "1.0";
      el.createProtocolBtn.textContent = "Confirmar alteracoes";
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
          showToast(`Acao bloqueada: ${usage.patientCount} pacientes e ${usage.recordsCount} registros usam esta categoria.`, "error", 5000);
          return;
        }

        if (!confirm(`Excluir categoria '${category}'? Esta acao e critica e nao pode ser desfeita.`)) return;
        await api(`/protocol/templates/${category}`, { method: "DELETE" });
        showToast("Categoria excluida.", "ok");
        resetProtocolForm();
        await reloadTemplateData();
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
  el.pPhone.value = formatPhone(p.phone || "");
  el.pDoc.value = formatDocument(p.cnsCpf || "");
  const addressParts = splitAddress(p.address || "");
  el.pStreet.value = addressParts.street;
  el.pNeighborhood.value = addressParts.neighborhood;
  el.pCity.value = addressParts.city;
  el.pState.value = String(addressParts.state || "").toUpperCase().slice(0, 2);
  el.pCep.value = addressParts.cep || "";
  el.pAcs.value = p.assignedAcsId || "";
  el.pCareCategory.value = p.careCategory || "general";
  el.pComorb.value = p.comorbidities || "";
  el.pMeds.value = p.medications || "";
  el.pAllergies.value = p.allergies || "";
  el.createPatientBtn.textContent = "Salvar alteracoes";
  el.patientModalTitle.textContent = "Editar paciente";
  el.patientModal.classList.remove("hidden");
}

// -- Tab switching -------------------------------------------------------------
document.querySelectorAll(".ptab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".ptab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.panel;
    document.querySelectorAll(".panel").forEach(p => {
      p.classList.toggle("active", p.id === target);
      p.classList.toggle("hidden", p.id !== target);
    });
  });
});

function switchToTab(panelId) {
  document.querySelectorAll(".ptab").forEach(t => t.classList.remove("active"));
  document.querySelector(`.ptab[data-panel="${panelId}"]`)?.classList.add("active");
  document.querySelectorAll(".panel").forEach(p => {
    p.classList.toggle("active", p.id === panelId);
    p.classList.toggle("hidden", p.id !== panelId);
  });
}

// -- Render: protocol summary ---------------------------------------------------
function renderProtocolSummary() {
  el.protocolSummary.innerHTML = "";
  if (!state.protocolSummary) {
    el.protocolSummary.innerHTML = '<div class="empty-msg">Sem resumo de protocolo.</div>';
    return;
  }
  const s = state.protocolSummary;
  const stats = [
    { label:"Visitas",   done:s.completed.visits,       total:s.targets.visits,       pending:s.pending.visits },
    { label:"Consultas", done:s.completed.consultations, total:s.targets.consultations, pending:s.pending.consultations },
    { label:"Vacinas",   done:s.completed.vaccines,      total:s.targets.vaccines,      pending:s.pending.vaccines },
  ];
  const statsHtml = `<div class="proto-stats">${stats.map(b=>`
    <div class="proto-stat${b.pending>0?" warn":" ok"}">
      <div class="proto-stat-label">${b.label}</div>
      <div class="proto-stat-value">${b.done}<span style="font-size:.85rem;color:var(--text-muted)">/${b.total}</span></div>
      <div class="proto-stat-sub">${b.pending>0?`${b.pending} pendente${b.pending!==1?"s":""}`:"Em dia"}</div>
    </div>`).join("")}</div>`;

  const alerts = stats.filter(b=>b.pending>0).map(b=>`<span class="proto-alert warn">? ${b.pending} ${b.label.toLowerCase()}</span>`).join("");
  const allOk  = !alerts ? `<span class="proto-alert ok">? Protocolo em dia</span>` : "";
  const critical = stats.filter((b) => b.pending > 0);
  const criticalBox = critical.length
    ? `<div class="protocol-critical-box">Falta concluir: ${critical.map((b) => `${b.pending} ${b.label.toLowerCase()}`).join(" | ")}</div>`
    : `<div class="protocol-ok-box">Tudo em dia para esta categoria.</div>`;

  const vaccines = (s.vaccines?.recommended||[]).map(v=>`
    <li class="vaccine-item">
      <span class="vaccine-badge ${v.done?"done":"pending"}">${v.done?"OK":"!"}</span>
      ${v.name}
    </li>`).join("") || "<li class='vaccine-item'>Sem vacinas recomendadas.</li>";

  el.protocolSummary.innerHTML = `
    ${statsHtml}
    ${criticalBox}
    <div class="proto-alerts">${alerts||allOk}</div>
    ${s.categoryLabel?`<div class="proto-section-label">Categoria ativa: ${s.categoryLabel}</div>`:""}
    <div class="proto-section-label">Checklist de vacinas</div>
    <ul class="vaccine-list">${vaccines}</ul>`;
}

// -- Render: appointments -------------------------------------------------------
function renderAppointments() {
  el.appointmentList.innerHTML = "";
  if (!state.appointments.length) { el.appointmentList.innerHTML='<div class="empty-msg">Nenhum atendimento.</div>'; return; }
  state.appointments.forEach(a => {
    const d = document.createElement("div");
    d.className = "record-card";
    d.innerHTML = `
      <div class="record-hd">
        <span class="record-title">${a.summary || "Atendimento"}</span>
        <span class="record-date">${new Date(a.date).toLocaleString("pt-BR")}</span>
      </div>
      <div class="record-body">
        ${a.conduct  ? `<p><strong>Conduta:</strong> ${a.conduct}</p>` : ""}
        ${a.nextStep ? `<p><strong>Proximo:</strong> ${a.nextStep}</p>` : ""}
      </div>`;
    el.appointmentList.appendChild(d);
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
    if (isManager() || canAcsUpdateTask(t)) {
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
const typeLabel = { visit:"Visita", consultation:"Consulta", vaccine:"Vacina", procedure:"Procedimento", note:"Observacao" };

function renderHistory() {
  el.historyList.innerHTML = "";
  if (!state.history.length) { el.historyList.innerHTML='<div class="empty-msg">Sem historico.</div>'; return; }
  state.history.forEach(r => {
    const d = document.createElement("div");
    d.className = "tl-item";
    const dt = new Date(r.date);
    d.innerHTML = `
      <div class="tl-date">${dt.toLocaleDateString("pt-BR")}<br>${dt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div>
      <div class="tl-spine"><div class="tl-dot"></div><div class="tl-line"></div></div>
      <div class="tl-body">
        <div class="tl-type">${typeLabel[r.type]||r.type}</div>
        <div class="tl-title">${r.title||"-"}</div>
        ${r.details ? `<div class="tl-detail">${r.details}</div>` : ""}
        <div class="tl-source">Origem: ${r.source||"-"}</div>
      </div>`;
    el.historyList.appendChild(d);
  });
}

// -- Render: audit --------------------------------------------------------------
function renderAuditLogs() {
  if (!isManager()) return;
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

// -- Vaccine field -------------------------------------------------------------
el.rType?.addEventListener("change", () => {
  el.vaccineNameWrap.classList.toggle("hidden", el.rType.value !== "vaccine");
});

// -- Load data -----------------------------------------------------------------
async function loadPatients() {
  const p = new URLSearchParams();
  if (state.filters.microArea)    p.set("microArea",    state.filters.microArea);
  if (state.filters.acsId)        p.set("acsId",        state.filters.acsId);
  if (state.filters.careCategory) p.set("careCategory", state.filters.careCategory);
  const q = p.toString();
  state.patients = await api(`/patients${q ? `?${q}` : ""}`);
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
  loadProtocolStatusesForDashboard().catch(() => {
    showToast("Nao foi possivel atualizar status de protocolo agora.", "error", 2500);
  });
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
async function loadAppointments()    { if (!state.selectedPatient) return; state.appointments   = await api(`/patients/${state.selectedPatient.id}/appointments`);    renderAppointments(); }
async function loadTasks()           { if (!state.selectedPatient) return; state.tasks          = await api(`/tasks?patientId=${state.selectedPatient.id}`);          renderTasks(); }
async function loadMessages()        { if (!state.selectedPatient) return; state.messages       = await api(`/patients/${state.selectedPatient.id}/messages`);        renderMessages(); }
async function loadHistory()         { if (!state.selectedPatient) return; state.history        = await api(`/patients/${state.selectedPatient.id}/history`);         renderHistory(); }
async function loadProtocolSummary() { if (!state.selectedPatient) return; state.protocolSummary= await api(`/patients/${state.selectedPatient.id}/protocol-summary`);renderProtocolSummary(); }
async function loadAuditLogs()       { if (!state.selectedPatient||!isManager()) return; state.auditLogs = await api(`/audit-logs?patientId=${state.selectedPatient.id}`); renderAuditLogs(); }

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
}

// -- Bootstrap -----------------------------------------------------------------
async function bootstrapAfterLogin() {
  touchSession(true);
  setupInactivityWatcher();
  const [users] = await Promise.all([api("/users")]);
  state.users = users;
  fillAcsSelect(el.tAssignee);
  fillAcsSelect(el.pAcs);
  fillAcsSelect(el.topFilterAcs, true);
  await reloadTemplateData();
  el.authScreen.classList.add("hidden");
  el.appScreen.classList.remove("hidden");
  if (isAcs()) { state.filters.acsId = state.user.id; }
  applyRolePermissions();
  resetProtocolForm();
  renderProtocolAdminList();
  renderTeamUsersLists();
  state.dashboardQuery = "";
  state.dashboardSort = "name_asc";
  state.dashboardPage = 1;
  state.dashboardCategory = "";
  state.dashboardAcsId = "";
  state.dashboardProtocolStatus = "all";
  state.workspaceTab = "dashboard";
  if (el.topbarSearchInput) el.topbarSearchInput.value = "";
  if (el.homePatientSortSelect) el.homePatientSortSelect.value = "name_asc";
  if (el.homePatientCategoryFilter) el.homePatientCategoryFilter.value = "";
  if (el.homePatientAcsFilter) el.homePatientAcsFilter.value = "";
  if (el.homePatientProtocolStatusFilter) el.homePatientProtocolStatusFilter.value = "all";
  if (el.topFilterMicroArea) el.topFilterMicroArea.value = "";
  if (el.topFilterAcs) el.topFilterAcs.value = "";
  if (el.topFilterCategory) el.topFilterCategory.value = "";
  switchWorkspaceTab("dashboard");
  switchNavSection("patients");
  await loadPatients();
  await loadGlobalTasks();
  renderWorkspaceHome();
}

async function bootstrapBeforeLogin() {
  try { state.publicTeams = await api("/teams/public"); fillTeamSelect(); updateRegisterFormVisibility(); }
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
  const payload = await api("/auth/login", { method:"POST", body:JSON.stringify({ email:el.loginEmail.value.trim(), password:el.loginPassword.value }) });
  state.user = payload.user; state.token = payload.token;
  persistSession();
  updateSessionView(); await bootstrapAfterLogin();
}));

el.registerBtn.addEventListener("click", withSpinner(el.registerBtn, async () => {
  const role = el.registerRole.value;
  if (!passwordStrong(el.registerPassword.value)) {
    throw new Error("Senha fraca: minimo 8 caracteres, 1 maiuscula, 1 numero e 1 especial.");
  }
  const check = validateCouncil(role, el.registerCouncilNumber.value, el.registerCouncilUf.value);
  if (!check.ok) { showToast(check.message, "error"); throw new Error(check.message); }
  const payload = await api("/auth/register", { method:"POST", body:JSON.stringify({
    name: el.registerName.value.trim(), email: el.registerEmail.value.trim(),
    password: el.registerPassword.value, role,
    teamId: role==="nurse_manager" ? "" : el.registerTeam.value,
    teamName: role==="nurse_manager" ? el.registerTeamName.value.trim() : "",
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

el.registerRole.addEventListener("change", updateRegisterFormVisibility);
el.registerCouncilNumber.addEventListener("input", () => {
  el.registerCouncilNumber.value = el.registerCouncilNumber.value.replace(/\D/g,"").slice(0, el.registerRole.value==="doctor"?8:10);
});
el.registerCouncilUf.addEventListener("input", () => {
  el.registerCouncilUf.value = el.registerCouncilUf.value.replace(/[^a-zA-Z]/g,"").toUpperCase().slice(0,2);
});
el.profileCouncilNumber?.addEventListener("input", () => {
  el.profileCouncilNumber.value = el.profileCouncilNumber.value.replace(/\D/g,"").slice(0,10);
});
el.profileCouncilUf?.addEventListener("input", () => {
  el.profileCouncilUf.value = el.profileCouncilUf.value.replace(/[^a-zA-Z]/g,"").toUpperCase().slice(0,2);
});

el.quickSelectFirstPatientBtn?.addEventListener("click", async () => {
  if (!state.patients.length) {
    showToast("Nenhum paciente disponivel.", "error");
    return;
  }
  await selectPatient(state.patients[0]);
});

el.navPatientsBtn?.addEventListener("click", () => switchNavSection("patients"));
el.navProtocolsBtn?.addEventListener("click", () => switchNavSection("protocols"));
el.navAcsBtn?.addEventListener("click", () => switchNavSection("acs"));
el.navDoctorsBtn?.addEventListener("click", () => switchNavSection("doctors"));
el.navAiBtn?.addEventListener("click", () => switchNavSection("ai"));

  el.openPatientModalBtn?.addEventListener("click", () => {
  state.editingPatientId = null;
  el.patientModalTitle.textContent = "Novo cadastro de paciente";
  el.createPatientBtn.textContent = "Salvar";
  ["pName","pPhone","pDoc","pCep","pStreet","pNeighborhood","pCity","pState","pComorb","pMeds","pAllergies"].forEach((id) => {
    const ref = document.getElementById(id);
    if (ref) ref.value = "";
  });
  el.pAcs.value = "";
  el.pCareCategory.value = "general";
  el.patientModal.classList.remove("hidden");
});
el.closePatientModalBtn?.addEventListener("click", () => el.patientModal.classList.add("hidden"));
el.cancelPatientModalBtn?.addEventListener("click", () => el.patientModal.classList.add("hidden"));
el.patientModal?.addEventListener("click", (e) => {
  if (e.target === el.patientModal) el.patientModal.classList.add("hidden");
});

function updateCreateUserRoleVisibility() {
  const isDoctorRole = el.managerCreateRole.value === "doctor";
  el.managerCreateCouncilWrap.classList.toggle("hidden", !isDoctorRole);
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
      throw new Error("Senha fraca: minimo 8 caracteres, 1 maiuscula, 1 numero e 1 especial.");
    }

    const payload = {
      role: el.managerCreateRole.value,
      name: el.managerCreateName.value.trim(),
      email: el.managerCreateEmail.value.trim(),
      password: el.managerCreatePassword.value
    };

    if (payload.role === "doctor") {
      payload.councilNumber = onlyDigits(el.managerCreateCouncilNumber.value);
      payload.councilUf = String(el.managerCreateCouncilUf.value || "").toUpperCase().trim();
    }

    await api("/users", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    showToast("Usuario cadastrado com sucesso.", "ok");
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

el.pPhone?.addEventListener("input", () => { el.pPhone.value = formatPhone(el.pPhone.value); });
el.pDoc?.addEventListener("input", () => { el.pDoc.value = formatDocument(el.pDoc.value); });
el.pCep?.addEventListener("input", () => { el.pCep.value = formatCep(el.pCep.value); });
el.pState?.addEventListener("input", () => { el.pState.value = String(el.pState.value || "").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2); });
el.managerCreateCouncilNumber?.addEventListener("input", () => { el.managerCreateCouncilNumber.value = onlyDigits(el.managerCreateCouncilNumber.value).slice(0, 10); });
el.managerCreateCouncilUf?.addEventListener("input", () => { el.managerCreateCouncilUf.value = String(el.managerCreateCouncilUf.value || "").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0,2); });

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
    // Ignora falha de CEP para nao travar cadastro.
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

el.profileBtn?.addEventListener("click", openProfileModal);
el.closeProfileBtn?.addEventListener("click", closeProfileModal);
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
      payload.councilNumber = el.profileCouncilNumber.value.trim();
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
    const payload = {
      name:el.pName.value, phone:el.pPhone.value, cnsCpf:el.pDoc.value,
      address:buildAddress(),
      careCategory:el.pCareCategory.value, assignedAcsId:el.pAcs.value,
      comorbidities:el.pComorb.value, medications:el.pMeds.value, allergies:el.pAllergies.value
    };

    if (editingId) {
      await api(`/patients/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("Paciente atualizado com sucesso!","ok");
    } else {
      if (!isManager()) {
        showToast("Somente enfermeira gestora pode criar paciente.", "error");
        return;
      }
      await api("/patients", { method:"POST", body:JSON.stringify(payload)});
      showToast("Paciente cadastrado com sucesso!","ok");
    }

    ["pName","pPhone","pDoc","pStreet","pNeighborhood","pCity","pState","pComorb","pMeds","pAllergies"].forEach(id=>{document.getElementById(id).value="";});
    el.pCep.value = "";
    el.pAcs.value = "";
    el.pCareCategory.value = "general";
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
    await api(`/patients/${state.selectedPatient.id}/records`, { method:"POST", body:JSON.stringify({
      type:el.rType.value, date:el.rDate.value, title:el.rTitle.value,
      details:el.rDetails.value, protocolTag:state.selectedPatient.careCategory,
      metadata:el.rVaccineName.value ? { vaccineName:el.rVaccineName.value.trim() } : {}
    })});
    ["rDate","rTitle","rDetails","rVaccineName"].forEach(id=>{document.getElementById(id).value="";});
    showToast("Registro salvo.","ok");
    await refreshSelectedPatientData();
  } catch(e) { showToast(e.message,"error"); }
});

el.addAppointmentBtn.addEventListener("click", async () => {
  if (!state.selectedPatient || (!isManager()&&!isDoctor())) return;
  try {
    await api(`/patients/${state.selectedPatient.id}/appointments`, { method:"POST", body:JSON.stringify({
      date:el.aDate.value, summary:el.aSummary.value, conduct:el.aConduct.value, nextStep:el.aNext.value
    })});
    ["aDate","aSummary","aConduct","aNext"].forEach(id=>{document.getElementById(id).value="";});
    showToast("Atendimento registrado.","ok");
    await refreshSelectedPatientData();
  } catch(e) { showToast(e.message,"error"); }
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
  await bootstrapBeforeLogin();
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.expiresAt || Date.now() > Number(parsed.expiresAt)) {
      clearSessionStore();
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
  }
}

initApp();





