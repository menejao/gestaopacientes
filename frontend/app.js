const API_URL = window.__APP_CONFIG?.apiUrl || "http://localhost:3001";

const state = {
  token: null,
  user: null,
  users: [],
  patients: [],
  selectedPatient: null,
  appointments: [],
  tasks: [],
  messages: [],
  auditLogs: [],
  history: [],
  protocolSummary: null,
  protocolTemplates: [],
  publicTeams: [],
  filters: {
    microArea: "",
    acsId: "",
    careCategory: ""
  }
};

// ─── Element refs ────────────────────────────────────────────────────────────
const el = {
  sessionText:              document.getElementById("sessionText"),
  logoutBtn:                document.getElementById("logoutBtn"),
  authScreen:               document.getElementById("authScreen"),
  appScreen:                document.getElementById("appScreen"),

  // Auth
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

  // Sidebar
  sidebar:                  document.getElementById("sidebar"),
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

  // Content
  emptyState:               document.getElementById("emptyState"),
  patientContent:           document.getElementById("patientContent"),
  selectedPatientTitle:     document.getElementById("selectedPatientTitle"),
  selectedPatientMeta:      document.getElementById("selectedPatientMeta"),
  patientAvatar:            document.getElementById("patientAvatar"),
  patientHeaderBadge:       document.getElementById("patientHeaderBadge"),

  // Panel contents
  protocolSummary:          document.getElementById("protocolSummary"),
  appointmentList:          document.getElementById("appointmentList"),
  taskList:                 document.getElementById("taskList"),
  messageList:              document.getElementById("messageList"),
  historyList:              document.getElementById("historyList"),
  auditList:                document.getElementById("auditList"),

  // Forms
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
  tTitle:                   document.getElementById("tTitle"),
  tNotes:                   document.getElementById("tNotes"),
  tDue:                     document.getElementById("tDue"),
  tAssignee:                document.getElementById("tAssignee"),
  addTaskBtn:               document.getElementById("addTaskBtn"),
  mText:                    document.getElementById("mText"),
  sendMsgBtn:               document.getElementById("sendMsgBtn"),

  // Panel containers
  appointmentFormCard:      document.getElementById("appointmentFormCard"),
  taskFormCard:             document.getElementById("taskFormCard"),
  auditTab:                 document.querySelector(".audit-tab"),

  // Toast
  toast:                    document.getElementById("toast")
};

// ─── Toast ───────────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type = "default", duration = 3000) {
  el.toast.textContent = msg;
  el.toast.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.toast.classList.add("hidden");
  }, duration);
}

// ─── Role helpers ─────────────────────────────────────────────────────────────
function isManager() { return state.user?.role === "nurse_manager"; }
function isDoctor()  { return state.user?.role === "doctor"; }
function isAcs()     { return state.user?.role === "acs"; }
function canAcsUpdateTask(task) { return isAcs() && task.assigneeId === state.user.id; }

function acsNameById(id) {
  return state.users.find(u => u.id === id)?.name || "Não atribuído";
}
function categoryLabel(category) {
  return state.protocolTemplates.find(t => t.category === category)?.label || "Geral";
}

// ─── API wrapper ─────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Erro na requisição");
  }
  return response.json();
}

// ─── Auth tabs ────────────────────────────────────────────────────────────────
document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    document.getElementById("loginTab").classList.toggle("hidden", target !== "login");
    document.getElementById("registerTab").classList.toggle("hidden", target !== "register");
  });
});

// ─── Password toggle ─────────────────────────────────────────────────────────
document.querySelector(".toggle-pass")?.addEventListener("click", () => {
  const inp = el.loginPassword;
  inp.type = inp.type === "password" ? "text" : "password";
});

// ─── Session view ────────────────────────────────────────────────────────────
function updateSessionView() {
  if (!state.user) {
    el.sessionText.textContent = "Não autenticado";
    el.logoutBtn.classList.add("hidden");
    return;
  }
  const roleMap = { nurse_manager: "Enfermeira Gestora", doctor: "Médica", acs: "ACS" };
  const roleLabel = roleMap[state.user.role] || state.user.role;
  el.sessionText.textContent = `${state.user.name} · ${roleLabel}`;
  el.logoutBtn.classList.remove("hidden");
}

el.logoutBtn?.addEventListener("click", () => {
  state.token = null;
  state.user = null;
  state.patients = [];
  state.selectedPatient = null;
  el.appScreen.classList.add("hidden");
  el.authScreen.classList.remove("hidden");
  updateSessionView();
});

// ─── Selects ────────────────────────────────────────────────────────────────
function fillCategorySelect(selectEl, includeAllOption = false) {
  selectEl.innerHTML = "";
  if (includeAllOption) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "Todas";
    selectEl.appendChild(opt);
  }
  state.protocolTemplates.forEach(t => {
    const o = document.createElement("option");
    o.value = t.category; o.textContent = t.label;
    selectEl.appendChild(o);
  });
}

function fillAcsSelect(selectEl, withAnyOption = false) {
  selectEl.innerHTML = "";
  if (withAnyOption) {
    const o = document.createElement("option");
    o.value = ""; o.textContent = "Todos";
    selectEl.appendChild(o);
  }
  state.users.filter(u => u.role === "acs").forEach(u => {
    const o = document.createElement("option");
    o.value = u.id; o.textContent = u.name;
    selectEl.appendChild(o);
  });
}

function fillTeamSelect() {
  el.registerTeam.innerHTML = "";
  state.publicTeams.forEach(team => {
    const o = document.createElement("option");
    o.value = team.id; o.textContent = team.name;
    el.registerTeam.appendChild(o);
  });
}

// ─── Register form visibility ────────────────────────────────────────────────
function updateRegisterFormVisibility() {
  const role = el.registerRole.value;
  const needsCouncil = ["doctor", "nurse_manager"].includes(role);
  const isNurseManager = role === "nurse_manager";
  const councilType = role === "doctor" ? "CRM" : "COREN";

  el.registerCouncilNumberWrap.classList.toggle("hidden", !needsCouncil);
  el.registerCouncilUfWrap.classList.toggle("hidden", !needsCouncil);
  el.registerTeamNameWrap.classList.toggle("hidden", !isNurseManager);
  el.registerTeamWrap.classList.toggle("hidden", isNurseManager);

  if (needsCouncil) {
    const lbl = el.registerCouncilNumberWrap.querySelector("label");
    if (lbl) lbl.textContent = `Número do conselho (${councilType})`;
    el.registerCouncilNumber.placeholder = councilType === "CRM" ? "4 a 8 dígitos" : "4 a 10 dígitos";
    el.registerCouncilNumber.maxLength = councilType === "CRM" ? 8 : 10;
  }
}

// ─── Council validation ──────────────────────────────────────────────────────
function isSequentialDigits(input) {
  let asc = true, desc = true;
  for (let i = 1; i < input.length; i++) {
    if (Number(input[i]) !== Number(input[i-1]) + 1) asc = false;
    if (Number(input[i]) !== Number(input[i-1]) - 1) desc = false;
  }
  return asc || desc;
}
function isRepeatedDigits(input) { return /^(\d)\1+$/.test(input); }
function validateCouncilClient(role, number, uf) {
  if (!["doctor", "nurse_manager"].includes(role)) return { ok: true };
  const digits = String(number || "").replace(/\D/g, "");
  const normalizedUf = String(uf || "").trim().toUpperCase();
  const minLen = 4;
  const maxLen = role === "doctor" ? 8 : 10;
  const validUf = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;
  if (digits.length < minLen || digits.length > maxLen) return { ok: false, message: `Conselho deve ter entre ${minLen} e ${maxLen} dígitos` };
  if (isRepeatedDigits(digits)) return { ok: false, message: "Conselho inválido: dígitos repetidos" };
  if (isSequentialDigits(digits)) return { ok: false, message: "Conselho inválido: sequência numérica" };
  if (!validUf.test(normalizedUf)) return { ok: false, message: "UF do conselho inválida" };
  return { ok: true, number: digits, uf: normalizedUf };
}

// ─── Role permissions ────────────────────────────────────────────────────────
function applyRolePermissions() {
  const managerOnlyFields = ["pName","pPhone","pDoc","pAddress","pComorb","pMeds","pAllergies","pMicroArea","pAcs","pCareCategory","tTitle","tNotes","tDue","tAssignee"];
  const clinicalFields = ["aDate","aSummary","aConduct","aNext"];
  const recordType = el.rType;

  if (isManager()) {
    el.showNewPatientBtn.classList.remove("hidden");
    el.addAppointmentBtn.classList.remove("hidden");
    el.addTaskBtn.classList.remove("hidden");
    el.auditTab.classList.remove("hidden");
    el.appointmentFormCard.classList.remove("hidden");
    el.taskFormCard.classList.remove("hidden");
    managerOnlyFields.forEach(id => { document.getElementById(id).disabled = false; });
    clinicalFields.forEach(id => { document.getElementById(id).disabled = false; });
    [...recordType.options].forEach(opt => { opt.disabled = false; });
    el.filterAcs.disabled = false;
    return;
  }

  el.showNewPatientBtn.classList.add("hidden");
  el.addTaskBtn.classList.add("hidden");
  el.auditTab.classList.add("hidden");
  el.taskFormCard.classList.add("hidden");
  managerOnlyFields.forEach(id => { document.getElementById(id).disabled = true; });

  if (isDoctor()) {
    el.addAppointmentBtn.classList.remove("hidden");
    el.appointmentFormCard.classList.remove("hidden");
    clinicalFields.forEach(id => { document.getElementById(id).disabled = false; });
    [...recordType.options].forEach(opt => { opt.disabled = opt.value === "visit"; });
    if (recordType.value === "visit") recordType.value = "consultation";
    el.filterAcs.disabled = false;
    return;
  }

  // ACS
  el.addAppointmentBtn.classList.add("hidden");
  el.appointmentFormCard.classList.add("hidden");
  clinicalFields.forEach(id => { document.getElementById(id).disabled = true; });
  el.filterAcs.value = state.user.id;
  el.filterAcs.disabled = true;
  [...recordType.options].forEach(opt => { opt.disabled = !["visit","note"].includes(opt.value); });
  recordType.value = "visit";
}

// ─── Render: Patients ────────────────────────────────────────────────────────
function renderPatients() {
  el.patientList.innerHTML = "";
  const query = el.searchInput?.value.toLowerCase() || "";
  const filtered = query
    ? state.patients.filter(p => p.name.toLowerCase().includes(query))
    : state.patients;

  el.patientCount.textContent = `${filtered.length} paciente${filtered.length !== 1 ? "s" : ""}`;

  if (!filtered.length) {
    el.patientList.innerHTML = '<div class="empty-msg">Nenhum paciente encontrado.</div>';
    return;
  }

  filtered.forEach(p => {
    const item = document.createElement("div");
    item.className = `patient-item ${state.selectedPatient?.id === p.id ? "active" : ""}`;
    item.innerHTML = `
      <div class="patient-item-name">${p.name}</div>
      <div class="patient-item-meta">
        <span class="patient-item-cat">${categoryLabel(p.careCategory)}</span>
        ${p.microArea ? `<span>📍 ${p.microArea}</span>` : ""}
        ${p.phone ? `<span>📞 ${p.phone}</span>` : ""}
      </div>
    `;
    item.addEventListener("click", () => selectPatient(p));
    el.patientList.appendChild(item);
  });
}

// ─── Render: Patient Header ───────────────────────────────────────────────────
function renderPatientHeader() {
  if (!state.selectedPatient) {
    el.emptyState.classList.remove("hidden");
    el.patientContent.classList.add("hidden");
    return;
  }
  el.emptyState.classList.add("hidden");
  el.patientContent.classList.remove("hidden");

  const p = state.selectedPatient;
  el.selectedPatientTitle.textContent = p.name;
  el.patientAvatar.textContent = p.name.charAt(0).toUpperCase();

  const chips = [
    { label: categoryLabel(p.careCategory), cls: "primary" },
    p.microArea && { label: `📍 ${p.microArea}`, cls: "" },
    p.phone     && { label: `📞 ${p.phone}`, cls: "" },
    p.cnsCpf    && { label: `🪪 ${p.cnsCpf}`, cls: "" },
    { label: `👤 ACS: ${acsNameById(p.assignedAcsId)}`, cls: "" },
  ].filter(Boolean);

  el.selectedPatientMeta.innerHTML = chips
    .map(c => `<span class="chip ${c.cls}">${c.label}</span>`)
    .join("");
}

// ─── Patient Tabs ─────────────────────────────────────────────────────────────
document.querySelectorAll(".ptab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".ptab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.panel;
    document.querySelectorAll(".patient-panel").forEach(p => {
      p.classList.toggle("active", p.id === target);
      p.classList.toggle("hidden", p.id !== target);
    });
  });
});

// ─── Render: Protocol Summary ─────────────────────────────────────────────────
function renderProtocolSummary() {
  el.protocolSummary.innerHTML = "";
  if (!state.protocolSummary) {
    el.protocolSummary.innerHTML = '<div class="empty-msg">Sem resumo de protocolo disponível.</div>';
    return;
  }
  const s = state.protocolSummary;

  const statBoxes = [
    { label: "Visitas",   done: s.completed.visits,        total: s.targets.visits,        pending: s.pending.visits },
    { label: "Consultas", done: s.completed.consultations,  total: s.targets.consultations,  pending: s.pending.consultations },
    { label: "Vacinas",   done: s.completed.vaccines,       total: s.targets.vaccines,       pending: s.pending.vaccines },
  ];

  const statsHtml = `
    <div class="protocol-summary-grid">
      ${statBoxes.map(b => `
        <div class="protocol-stat-box">
          <span class="stat-label">${b.label}</span>
          <span class="stat-value">${b.done}/${b.total}</span>
          <span class="stat-sub">${b.pending > 0 ? `${b.pending} pendente${b.pending !== 1 ? "s" : ""}` : "Em dia ✓"}</span>
        </div>
      `).join("")}
    </div>
  `;

  const pendingChips = statBoxes
    .filter(b => b.pending > 0)
    .map(b => `<span class="alert-chip warn">⚠ ${b.pending} ${b.label.toLowerCase()}</span>`)
    .join("");

  const allDoneChip = pendingChips === ""
    ? `<span class="alert-chip ok">✓ Protocolo em dia</span>`
    : "";

  const vaccines = (s.vaccines?.recommended || [])
    .map(v => `
      <li>
        <span class="vaccine-check ${v.done ? "done" : "pending"}">${v.done ? "✓" : "·"}</span>
        ${v.name}
      </li>
    `).join("") || "<li>Sem vacinas recomendadas para esta categoria.</li>";

  el.protocolSummary.innerHTML = `
    ${statsHtml}
    <div class="pending-alerts">${pendingChips || allDoneChip}</div>
    ${s.categoryLabel ? `<p class="protocol-section-title" style="margin-top:1.25rem">Categoria: ${s.categoryLabel}</p>` : ""}
    <p class="protocol-section-title">Checklist de vacinas</p>
    <ul class="vaccine-checklist">${vaccines}</ul>
  `;
}

// ─── Render: Appointments ────────────────────────────────────────────────────
function renderAppointments() {
  el.appointmentList.innerHTML = "";
  if (!state.appointments.length) {
    el.appointmentList.innerHTML = '<div class="empty-msg">Nenhum atendimento registrado.</div>';
    return;
  }
  state.appointments.forEach(a => {
    const div = document.createElement("div");
    div.className = "record-item";
    div.innerHTML = `
      <div class="record-item-header">
        <span class="record-item-title">${a.summary || "Atendimento"}</span>
        <span class="record-item-date">${new Date(a.date).toLocaleString("pt-BR")}</span>
      </div>
      <div class="record-item-body">
        ${a.conduct  ? `<p><strong>Conduta:</strong> ${a.conduct}</p>` : ""}
        ${a.nextStep ? `<p><strong>Próximo passo:</strong> ${a.nextStep}</p>` : ""}
      </div>
    `;
    el.appointmentList.appendChild(div);
  });
}

// ─── Render: Tasks ───────────────────────────────────────────────────────────
function statusText(status) {
  return { done: "Concluída", in_progress: "Em andamento", pending: "Pendente" }[status] || "Pendente";
}
function statusClass(status) {
  return { done: "done", in_progress: "progress", pending: "pending" }[status] || "pending";
}

function renderTasks() {
  el.taskList.innerHTML = "";
  if (!state.tasks.length) {
    el.taskList.innerHTML = '<div class="empty-msg">Nenhuma tarefa criada.</div>';
    return;
  }
  state.tasks.forEach(t => {
    const wrap = document.createElement("div");
    wrap.className = "record-item";
    wrap.innerHTML = `
      <div class="record-item-header">
        <span class="record-item-title">${t.title}</span>
        <span class="status-badge ${statusClass(t.status)}">${statusText(t.status)}</span>
      </div>
      <div class="record-item-body">
        <p>Responsável: ${acsNameById(t.assigneeId)} · Prazo: ${t.dueDate || "—"}</p>
        ${t.notes ? `<p>${t.notes}</p>` : ""}
      </div>
    `;

    const canUpdate = isManager() || canAcsUpdateTask(t);
    if (canUpdate) {
      const footer = document.createElement("div");
      footer.className = "record-item-footer";
      const statusWrap = document.createElement("div");
      statusWrap.className = "status-select-wrap";
      statusWrap.innerHTML = `<label>Atualizar status:</label>`;

      const sel = document.createElement("select");
      [
        { value: "pending",     label: "Pendente" },
        { value: "in_progress", label: "Em andamento" },
        { value: "done",        label: "Concluída" }
      ].forEach(opt => {
        const o = document.createElement("option");
        o.value = opt.value; o.textContent = opt.label;
        o.selected = opt.value === t.status;
        sel.appendChild(o);
      });

      sel.addEventListener("change", async () => {
        try {
          await api(`/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: sel.value }) });
          showToast("Status da tarefa atualizado.", "ok");
          await refreshSelectedPatientData();
        } catch (err) {
          showToast(err.message, "error");
        }
      });

      statusWrap.appendChild(sel);
      footer.appendChild(statusWrap);
      wrap.appendChild(footer);
    }

    el.taskList.appendChild(wrap);
  });
}

// ─── Render: Messages ────────────────────────────────────────────────────────
function renderMessages() {
  el.messageList.innerHTML = "";
  if (!state.messages.length) {
    el.messageList.innerHTML = '<div class="empty-msg">Nenhuma mensagem ainda.</div>';
    return;
  }
  state.messages.forEach(m => {
    const div = document.createElement("div");
    div.className = "message-item";
    div.innerHTML = `
      <div class="message-meta">
        <span class="message-author">${m.authorName}</span>
        <span class="message-time">${new Date(m.createdAt).toLocaleString("pt-BR")}</span>
      </div>
      <div class="message-text">${m.text}</div>
    `;
    el.messageList.appendChild(div);
  });
  el.messageList.scrollTop = el.messageList.scrollHeight;
}

// ─── Render: History ─────────────────────────────────────────────────────────
const typeLabel = {
  visit:        "Visita",
  consultation: "Consulta",
  vaccine:      "Vacina",
  procedure:    "Procedimento",
  note:         "Observação"
};

function renderHistory() {
  el.historyList.innerHTML = "";
  if (!state.history.length) {
    el.historyList.innerHTML = '<div class="empty-msg">Sem histórico clínico registrado.</div>';
    return;
  }
  state.history.forEach(record => {
    const div = document.createElement("div");
    div.className = "timeline-item";
    div.innerHTML = `
      <div class="timeline-date">
        ${new Date(record.date).toLocaleDateString("pt-BR")}<br>
        <span style="font-size:.7rem">${new Date(record.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div class="timeline-body">
        <div class="timeline-type">${typeLabel[record.type] || record.type}</div>
        <div class="timeline-title">${record.title || "—"}</div>
        ${record.details ? `<div class="timeline-details">${record.details}</div>` : ""}
        <div class="timeline-source">Origem: ${record.source || "—"}</div>
      </div>
    `;
    el.historyList.appendChild(div);
  });
}

// ─── Render: Audit ───────────────────────────────────────────────────────────
function renderAuditLogs() {
  if (!isManager()) return;
  el.auditList.innerHTML = "";
  if (!state.auditLogs.length) {
    el.auditList.innerHTML = '<div class="empty-msg">Sem registros de auditoria.</div>';
    return;
  }
  state.auditLogs.slice(0, 20).forEach(log => {
    const div = document.createElement("div");
    div.className = "audit-entry";
    div.innerHTML = `
      <div>
        <div class="audit-action">${log.action}</div>
        <div class="audit-who">${log.userName} · ${log.userRole}</div>
      </div>
      <div class="audit-when">${new Date(log.createdAt).toLocaleString("pt-BR")}</div>
    `;
    el.auditList.appendChild(div);
  });
}

// ─── Patient new / cancel ─────────────────────────────────────────────────────
el.showNewPatientBtn?.addEventListener("click", () => {
  el.patientPanel.classList.add("hidden");
  el.newPatientPanel.classList.remove("hidden");
});
el.cancelNewPatientBtn?.addEventListener("click", () => {
  el.newPatientPanel.classList.add("hidden");
  el.patientPanel.classList.remove("hidden");
});

// ─── Search ──────────────────────────────────────────────────────────────────
el.searchInput?.addEventListener("input", renderPatients);

// ─── Vaccine field visibility ─────────────────────────────────────────────────
el.rType?.addEventListener("change", () => {
  el.vaccineNameWrap.classList.toggle("hidden", el.rType.value !== "vaccine");
});

// ─── Filter ───────────────────────────────────────────────────────────────────
function applyPatientFilterValues() {
  state.filters.microArea    = el.filterMicroArea.value.trim();
  state.filters.acsId        = el.filterAcs.value;
  state.filters.careCategory = el.filterCategory.value;
}

// ─── API: Load data ───────────────────────────────────────────────────────────
async function loadPatients() {
  const params = new URLSearchParams();
  if (state.filters.microArea)    params.set("microArea",    state.filters.microArea);
  if (state.filters.acsId)        params.set("acsId",        state.filters.acsId);
  if (state.filters.careCategory) params.set("careCategory", state.filters.careCategory);
  const query = params.toString();
  state.patients = await api(`/patients${query ? `?${query}` : ""}`);

  if (state.selectedPatient && !state.patients.some(p => p.id === state.selectedPatient.id)) {
    state.selectedPatient = null;
    renderPatientHeader();
    el.appointmentList.innerHTML = "";
    el.taskList.innerHTML = "";
    el.messageList.innerHTML = "";
    el.historyList.innerHTML = "";
    el.auditList.innerHTML = "";
    el.protocolSummary.innerHTML = "";
  }
  renderPatients();
}

async function loadAppointments() {
  if (!state.selectedPatient) return;
  state.appointments = await api(`/patients/${state.selectedPatient.id}/appointments`);
  renderAppointments();
}
async function loadTasks() {
  if (!state.selectedPatient) return;
  state.tasks = await api(`/tasks?patientId=${state.selectedPatient.id}`);
  renderTasks();
}
async function loadMessages() {
  if (!state.selectedPatient) return;
  state.messages = await api(`/patients/${state.selectedPatient.id}/messages`);
  renderMessages();
}
async function loadHistory() {
  if (!state.selectedPatient) return;
  state.history = await api(`/patients/${state.selectedPatient.id}/history`);
  renderHistory();
}
async function loadProtocolSummary() {
  if (!state.selectedPatient) return;
  state.protocolSummary = await api(`/patients/${state.selectedPatient.id}/protocol-summary`);
  renderProtocolSummary();
}
async function loadAuditLogs() {
  if (!state.selectedPatient || !isManager()) return;
  state.auditLogs = await api(`/audit-logs?patientId=${state.selectedPatient.id}`);
  renderAuditLogs();
}

async function refreshSelectedPatientData() {
  if (!state.selectedPatient) return;
  await Promise.all([loadAppointments(), loadTasks(), loadMessages(), loadHistory(), loadProtocolSummary(), loadAuditLogs()]);
}

async function selectPatient(patient) {
  state.selectedPatient = patient;
  renderPatients();
  renderPatientHeader();
  // Switch to Protocol tab
  document.querySelectorAll(".ptab").forEach(t => t.classList.remove("active"));
  document.querySelector(".ptab[data-panel='panelProtocol']")?.classList.add("active");
  document.querySelectorAll(".patient-panel").forEach(p => {
    p.classList.toggle("active", p.id === "panelProtocol");
    p.classList.toggle("hidden", p.id !== "panelProtocol");
  });
  await refreshSelectedPatientData();
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrapAfterLogin() {
  const [users, templates] = await Promise.all([api("/users"), api("/protocol/templates")]);
  state.users = users;
  state.protocolTemplates = templates;

  fillAcsSelect(el.tAssignee);
  fillAcsSelect(el.pAcs);
  fillAcsSelect(el.filterAcs, true);
  fillCategorySelect(el.pCareCategory);
  fillCategorySelect(el.filterCategory, true);

  el.authScreen.classList.add("hidden");
  el.appScreen.classList.remove("hidden");
  el.patientPanel.classList.remove("hidden");

  if (isAcs()) {
    el.filterAcs.value = state.user.id;
    state.filters.acsId = state.user.id;
  }

  applyRolePermissions();
  await loadPatients();
}

async function bootstrapBeforeLogin() {
  try {
    state.publicTeams = await api("/teams/public");
    fillTeamSelect();
    updateRegisterFormVisibility();
  } catch (err) {
    console.warn("Could not load public teams:", err.message);
  }
}

// ─── Event listeners ─────────────────────────────────────────────────────────
el.loginBtn.addEventListener("click", async () => {
  const span = el.loginBtn.querySelector(".btn-label");
  const spin = el.loginBtn.querySelector(".btn-spinner");
  try {
    el.loginBtn.disabled = true;
    span.classList.add("hidden");
    spin.classList.remove("hidden");

    const payload = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: el.loginEmail.value.trim(), password: el.loginPassword.value })
    });
    state.user = payload.user;
    state.token = payload.token;
    updateSessionView();
    await bootstrapAfterLogin();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    el.loginBtn.disabled = false;
    span.classList.remove("hidden");
    spin.classList.add("hidden");
  }
});

el.registerBtn.addEventListener("click", async () => {
  const span = el.registerBtn.querySelector(".btn-label");
  const spin = el.registerBtn.querySelector(".btn-spinner");
  try {
    const role = el.registerRole.value;
    const councilCheck = validateCouncilClient(role, el.registerCouncilNumber.value, el.registerCouncilUf.value);
    if (!councilCheck.ok) { showToast(councilCheck.message, "error"); return; }

    el.registerBtn.disabled = true;
    span.classList.add("hidden");
    spin.classList.remove("hidden");

    const payload = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name:          el.registerName.value.trim(),
        email:         el.registerEmail.value.trim(),
        password:      el.registerPassword.value,
        role,
        teamId:        role === "nurse_manager" ? "" : el.registerTeam.value,
        teamName:      role === "nurse_manager" ? el.registerTeamName.value.trim() : "",
        councilNumber: councilCheck.number || "",
        councilUf:     councilCheck.uf || ""
      })
    });
    state.user = payload.user;
    state.token = payload.token;
    updateSessionView();
    await bootstrapAfterLogin();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    el.registerBtn.disabled = false;
    span.classList.remove("hidden");
    spin.classList.add("hidden");
  }
});

el.registerRole.addEventListener("change", updateRegisterFormVisibility);

el.registerCouncilNumber.addEventListener("input", () => {
  const digits = el.registerCouncilNumber.value.replace(/\D/g, "");
  const maxLength = el.registerRole.value === "doctor" ? 8 : 10;
  el.registerCouncilNumber.value = digits.slice(0, maxLength);
});
el.registerCouncilUf.addEventListener("input", () => {
  el.registerCouncilUf.value = el.registerCouncilUf.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
});

el.applyFilterBtn.addEventListener("click", async () => {
  try { applyPatientFilterValues(); await loadPatients(); }
  catch (err) { showToast(err.message, "error"); }
});

el.createPatientBtn.addEventListener("click", async () => {
  if (!isManager()) return;
  try {
    await api("/patients", {
      method: "POST",
      body: JSON.stringify({
        name:           el.pName.value,
        phone:          el.pPhone.value,
        cnsCpf:         el.pDoc.value,
        address:        el.pAddress.value,
        microArea:      el.pMicroArea.value,
        careCategory:   el.pCareCategory.value,
        assignedAcsId:  el.pAcs.value,
        comorbidities:  el.pComorb.value,
        medications:    el.pMeds.value,
        allergies:      el.pAllergies.value
      })
    });
    ["pName","pPhone","pDoc","pAddress","pMicroArea","pComorb","pMeds","pAllergies"].forEach(id => {
      document.getElementById(id).value = "";
    });
    showToast("Paciente cadastrado com sucesso!", "ok");
    el.newPatientPanel.classList.add("hidden");
    el.patientPanel.classList.remove("hidden");
    await loadPatients();
  } catch (err) { showToast(err.message, "error"); }
});

el.addRecordBtn.addEventListener("click", async () => {
  if (!state.selectedPatient) return;
  try {
    const type = el.rType.value;
    await api(`/patients/${state.selectedPatient.id}/records`, {
      method: "POST",
      body: JSON.stringify({
        type,
        date:        el.rDate.value,
        title:       el.rTitle.value,
        details:     el.rDetails.value,
        protocolTag: state.selectedPatient.careCategory,
        metadata:    el.rVaccineName.value ? { vaccineName: el.rVaccineName.value.trim() } : {}
      })
    });
    ["rDate","rTitle","rDetails","rVaccineName"].forEach(id => { document.getElementById(id).value = ""; });
    showToast("Registro clínico salvo.", "ok");
    await refreshSelectedPatientData();
  } catch (err) { showToast(err.message, "error"); }
});

el.addAppointmentBtn.addEventListener("click", async () => {
  if (!state.selectedPatient || (!isManager() && !isDoctor())) return;
  try {
    await api(`/patients/${state.selectedPatient.id}/appointments`, {
      method: "POST",
      body: JSON.stringify({
        date:     el.aDate.value,
        summary:  el.aSummary.value,
        conduct:  el.aConduct.value,
        nextStep: el.aNext.value
      })
    });
    ["aDate","aSummary","aConduct","aNext"].forEach(id => { document.getElementById(id).value = ""; });
    showToast("Atendimento registrado.", "ok");
    await refreshSelectedPatientData();
  } catch (err) { showToast(err.message, "error"); }
});

el.addTaskBtn.addEventListener("click", async () => {
  if (!state.selectedPatient || !isManager()) return;
  try {
    await api("/tasks", {
      method: "POST",
      body: JSON.stringify({
        patientId:  state.selectedPatient.id,
        assigneeId: el.tAssignee.value,
        title:      el.tTitle.value,
        notes:      el.tNotes.value,
        dueDate:    el.tDue.value
      })
    });
    ["tTitle","tNotes","tDue"].forEach(id => { document.getElementById(id).value = ""; });
    showToast("Tarefa criada.", "ok");
    await refreshSelectedPatientData();
  } catch (err) { showToast(err.message, "error"); }
});

el.sendMsgBtn.addEventListener("click", async () => {
  if (!state.selectedPatient) return;
  try {
    await api(`/patients/${state.selectedPatient.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: el.mText.value })
    });
    el.mText.value = "";
    await refreshSelectedPatientData();
  } catch (err) { showToast(err.message, "error"); }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
updateSessionView();
bootstrapBeforeLogin();
