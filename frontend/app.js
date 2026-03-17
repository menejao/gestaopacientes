const API_URL = window.__APP_CONFIG?.apiUrl || "http://localhost:3001";

const state = {
  token: null, user: null, users: [], patients: [],
  selectedPatient: null, appointments: [], tasks: [],
  messages: [], auditLogs: [], history: [],
  protocolSummary: null, protocolTemplates: [], publicTeams: [],
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
  logoutBtn:                document.getElementById("logoutBtn"),
  userName:                 document.getElementById("userName"),
  userRole:                 document.getElementById("userRole"),
  userAvatar:               document.getElementById("userAvatar"),
  topbarPatient:            document.getElementById("topbarPatient"),
  patientPanel:             document.getElementById("patientPanel"),
  newPatientPanel:          document.getElementById("newPatientPanel"),
  patientList:              document.getElementById("patientList"),
  patientCount:             document.getElementById("patientCount"),
  searchInput:              document.getElementById("searchInput"),
  showNewPatientBtn:        document.getElementById("showNewPatientBtn"),
  cancelNewPatientBtn:      document.getElementById("cancelNewPatientBtn"),
  filterMicroArea:          document.getElementById("filterMicroArea"),
  filterAcs:                document.getElementById("filterAcs"),
  filterCategory:           document.getElementById("filterCategory"),
  applyFilterBtn:           document.getElementById("applyFilterBtn"),
  pName:                    document.getElementById("pName"),
  pPhone:                   document.getElementById("pPhone"),
  pDoc:                     document.getElementById("pDoc"),
  pAddress:                 document.getElementById("pAddress"),
  pMicroArea:               document.getElementById("pMicroArea"),
  pAcs:                     document.getElementById("pAcs"),
  pCareCategory:            document.getElementById("pCareCategory"),
  pComorb:                  document.getElementById("pComorb"),
  pMeds:                    document.getElementById("pMeds"),
  pAllergies:               document.getElementById("pAllergies"),
  createPatientBtn:         document.getElementById("createPatientBtn"),
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
};

// -- Toast --------------------------------------------------------------------
let _toastTimer = null;
function showToast(msg, type = "default", ms = 3000) {
  el.toast.textContent = msg;
  el.toast.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.toast.classList.add("hidden"), ms);
}

// -- Helpers ------------------------------------------------------------------
const isManager = () => state.user?.role === "nurse_manager";
const isDoctor  = () => state.user?.role === "doctor";
const isAcs     = () => state.user?.role === "acs";
const canAcsUpdateTask = t => isAcs() && t.assigneeId === state.user.id;
const acsNameById  = id => state.users.find(u => u.id === id)?.name || "Nao atribuido";
const catLabel     = cat => state.protocolTemplates.find(t => t.category === cat)?.label || "Geral";

// -- API ----------------------------------------------------------------------
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Erro na requisicao");
  }
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
  if (!state.user) { el.logoutBtn.classList.add("hidden"); return; }
  const roleMap = { nurse_manager: "Enf. Gestora", doctor: "Medico(a)", acs: "ACS" };
  el.userName.textContent  = state.user.name;
  el.userRole.textContent  = roleMap[state.user.role] || state.user.role;
  el.userAvatar.textContent = state.user.name.charAt(0).toUpperCase();
  el.logoutBtn.classList.remove("hidden");
}

el.logoutBtn?.addEventListener("click", () => {
  Object.assign(state, { token: null, user: null, patients: [], selectedPatient: null });
  el.appScreen.classList.add("hidden");
  el.authScreen.classList.remove("hidden");
  el.patientPanel.classList.add("hidden");
  el.emptyState.classList.remove("hidden");
  el.patientContent.classList.add("hidden");
  updateSessionView();
});

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
  sel.innerHTML = "";
  if (withAll) sel.appendChild(Object.assign(document.createElement("option"), { value:"", textContent:"Todas" }));
  state.protocolTemplates.forEach(t => sel.appendChild(Object.assign(document.createElement("option"), { value:t.category, textContent:t.label })));
}
function fillAcsSelect(sel, withAll=false) {
  sel.innerHTML = "";
  if (withAll) sel.appendChild(Object.assign(document.createElement("option"), { value:"", textContent:"Todos" }));
  state.users.filter(u => u.role === "acs").forEach(u => sel.appendChild(Object.assign(document.createElement("option"), { value:u.id, textContent:u.name })));
}
function fillTeamSelect() {
  el.registerTeam.innerHTML = "";
  state.publicTeams.forEach(t => el.registerTeam.appendChild(Object.assign(document.createElement("option"), { value:t.id, textContent:t.name })));
}

// -- Role permissions ----------------------------------------------------------
function applyRolePermissions() {
  const mgrFields = ["pName","pPhone","pDoc","pAddress","pComorb","pMeds","pAllergies","pMicroArea","pAcs","pCareCategory","tTitle","tNotes","tDue","tAssignee"];
  const clinFields = ["aDate","aSummary","aConduct","aNext"];

  if (isManager()) {
    el.showNewPatientBtn.classList.remove("hidden");
    el.addAppointmentBtn.classList.remove("hidden");
    el.addTaskBtn.classList.remove("hidden");
    el.auditTab.classList.remove("hidden");
    el.appointmentFormCard.classList.remove("hidden");
    el.taskFormCard.classList.remove("hidden");
    mgrFields.forEach(id => { document.getElementById(id).disabled = false; });
    clinFields.forEach(id => { document.getElementById(id).disabled = false; });
    [...el.rType.options].forEach(o => { o.disabled = false; });
    el.filterAcs.disabled = false;
    return;
  }
  el.showNewPatientBtn.classList.add("hidden");
  el.addTaskBtn.classList.add("hidden");
  el.auditTab.classList.add("hidden");
  el.taskFormCard.classList.add("hidden");
  mgrFields.forEach(id => { document.getElementById(id).disabled = true; });

  if (isDoctor()) {
    el.addAppointmentBtn.classList.remove("hidden");
    el.appointmentFormCard.classList.remove("hidden");
    clinFields.forEach(id => { document.getElementById(id).disabled = false; });
    [...el.rType.options].forEach(o => { o.disabled = o.value === "visit"; });
    if (el.rType.value === "visit") el.rType.value = "consultation";
    el.filterAcs.disabled = false;
    return;
  }
  // ACS
  el.addAppointmentBtn.classList.add("hidden");
  el.appointmentFormCard.classList.add("hidden");
  clinFields.forEach(id => { document.getElementById(id).disabled = true; });
  el.filterAcs.value = state.user.id;
  el.filterAcs.disabled = true;
  [...el.rType.options].forEach(o => { o.disabled = !["visit","note"].includes(o.value); });
  el.rType.value = "visit";
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
  el.patientList.innerHTML = "";
  const q = (el.searchInput?.value || "").toLowerCase();
  const list = q ? state.patients.filter(p => p.name.toLowerCase().includes(q)) : state.patients;
  el.patientCount.textContent = `${list.length} paciente${list.length !== 1 ? "s" : ""}`;
  if (!list.length) {
    el.patientList.innerHTML = '<div class="empty-msg">Nenhum paciente encontrado.</div>';
    return;
  }
  list.forEach(p => {
    const div = document.createElement("div");
    div.className = `patient-item${state.selectedPatient?.id === p.id ? " active" : ""}`;
    div.innerHTML = `
      <div class="pi-name">${p.name}</div>
      <div class="pi-meta">
        <span class="pi-cat">${catLabel(p.careCategory)}</span>
        ${p.microArea ? `<span>MA ${p.microArea}</span>` : ""}
        ${p.phone ? `<span>${p.phone}</span>` : ""}
      </div>`;
    div.addEventListener("click", () => selectPatient(p));
    el.patientList.appendChild(div);
  });
}

// -- Render: patient header -----------------------------------------------------
function renderPatientHeader() {
  if (!state.selectedPatient) {
    el.emptyState.classList.remove("hidden");
    el.patientContent.classList.add("hidden");
    el.topbarPatient.innerHTML = "";
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

  const vaccines = (s.vaccines?.recommended||[]).map(v=>`
    <li class="vaccine-item">
      <span class="vaccine-badge ${v.done?"done":"pending"}">${v.done?"OK":"!"}</span>
      ${v.name}
    </li>`).join("") || "<li class='vaccine-item'>Sem vacinas recomendadas.</li>";

  el.protocolSummary.innerHTML = `
    ${statsHtml}
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
        try { await api(`/tasks/${t.id}`, { method:"PATCH", body:JSON.stringify({ status:sel.value }) }); showToast("Status atualizado.","ok"); await refreshSelectedPatientData(); }
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

// -- Sidebar new patient toggle -------------------------------------------------
el.showNewPatientBtn?.addEventListener("click", () => {
  el.patientPanel.classList.add("hidden");
  el.newPatientPanel.classList.remove("hidden");
});
el.cancelNewPatientBtn?.addEventListener("click", () => {
  el.newPatientPanel.classList.add("hidden");
  el.patientPanel.classList.remove("hidden");
});

// -- Search --------------------------------------------------------------------
el.searchInput?.addEventListener("input", renderPatients);

// -- Vaccine field -------------------------------------------------------------
el.rType?.addEventListener("change", () => {
  el.vaccineNameWrap.classList.toggle("hidden", el.rType.value !== "vaccine");
});

// -- Filter --------------------------------------------------------------------
function applyPatientFilterValues() {
  state.filters.microArea    = el.filterMicroArea.value.trim();
  state.filters.acsId        = el.filterAcs.value;
  state.filters.careCategory = el.filterCategory.value;
}

// -- Load data -----------------------------------------------------------------
async function loadPatients() {
  const p = new URLSearchParams();
  if (state.filters.microArea)    p.set("microArea",    state.filters.microArea);
  if (state.filters.acsId)        p.set("acsId",        state.filters.acsId);
  if (state.filters.careCategory) p.set("careCategory", state.filters.careCategory);
  const q = p.toString();
  state.patients = await api(`/patients${q ? `?${q}` : ""}`);
  if (state.selectedPatient && !state.patients.some(p => p.id === state.selectedPatient.id)) {
    state.selectedPatient = null;
    renderPatientHeader();
  }
  renderPatients();
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
  state.selectedPatient = patient;
  renderPatients();
  renderPatientHeader();
  switchToTab("panelProtocol");
  await refreshSelectedPatientData();
}

// -- Bootstrap -----------------------------------------------------------------
async function bootstrapAfterLogin() {
  const [users, templates] = await Promise.all([api("/users"), api("/protocol/templates")]);
  state.users = users; state.protocolTemplates = templates;
  fillAcsSelect(el.tAssignee); fillAcsSelect(el.pAcs); fillAcsSelect(el.filterAcs, true);
  fillCategorySelect(el.pCareCategory); fillCategorySelect(el.filterCategory, true);
  el.authScreen.classList.add("hidden");
  el.appScreen.classList.remove("hidden");
  el.patientPanel.classList.remove("hidden");
  if (isAcs()) { el.filterAcs.value = state.user.id; state.filters.acsId = state.user.id; }
  applyRolePermissions();
  await loadPatients();
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
  updateSessionView(); await bootstrapAfterLogin();
}));

el.registerBtn.addEventListener("click", withSpinner(el.registerBtn, async () => {
  const role = el.registerRole.value;
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
  updateSessionView(); await bootstrapAfterLogin();
}));

el.registerRole.addEventListener("change", updateRegisterFormVisibility);
el.registerCouncilNumber.addEventListener("input", () => {
  el.registerCouncilNumber.value = el.registerCouncilNumber.value.replace(/\D/g,"").slice(0, el.registerRole.value==="doctor"?8:10);
});
el.registerCouncilUf.addEventListener("input", () => {
  el.registerCouncilUf.value = el.registerCouncilUf.value.replace(/[^a-zA-Z]/g,"").toUpperCase().slice(0,2);
});

el.applyFilterBtn.addEventListener("click", async () => {
  try { applyPatientFilterValues(); await loadPatients(); }
  catch (e) { showToast(e.message,"error"); }
});

el.createPatientBtn.addEventListener("click", async () => {
  if (!isManager()) return;
  try {
    await api("/patients", { method:"POST", body:JSON.stringify({
      name:el.pName.value, phone:el.pPhone.value, cnsCpf:el.pDoc.value,
      address:el.pAddress.value, microArea:el.pMicroArea.value,
      careCategory:el.pCareCategory.value, assignedAcsId:el.pAcs.value,
      comorbidities:el.pComorb.value, medications:el.pMeds.value, allergies:el.pAllergies.value
    })});
    ["pName","pPhone","pDoc","pAddress","pMicroArea","pComorb","pMeds","pAllergies"].forEach(id=>{document.getElementById(id).value="";});
    showToast("Paciente cadastrado com sucesso!","ok");
    el.newPatientPanel.classList.add("hidden");
    el.patientPanel.classList.remove("hidden");
    await loadPatients();
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

// -- Init ----------------------------------------------------------------------
bootstrapBeforeLogin();

