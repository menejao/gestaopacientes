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

const el = {
  sessionInfo: document.getElementById("sessionInfo"),
  loginCard: document.getElementById("loginCard"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginBtn: document.getElementById("loginBtn"),
  registerName: document.getElementById("registerName"),
  registerEmail: document.getElementById("registerEmail"),
  registerPassword: document.getElementById("registerPassword"),
  registerRole: document.getElementById("registerRole"),
  registerBtn: document.getElementById("registerBtn"),
  registerTeam: document.getElementById("registerTeam"),
  registerTeamName: document.getElementById("registerTeamName"),
  registerCouncilNumber: document.getElementById("registerCouncilNumber"),
  registerCouncilUf: document.getElementById("registerCouncilUf"),
  registerTeamWrap: document.getElementById("registerTeamWrap"),
  registerTeamNameWrap: document.getElementById("registerTeamNameWrap"),
  registerCouncilNumberWrap: document.getElementById("registerCouncilNumberWrap"),
  registerCouncilUfWrap: document.getElementById("registerCouncilUfWrap"),
  patientPanel: document.getElementById("patientPanel"),
  patientList: document.getElementById("patientList"),
  newPatientPanel: document.getElementById("newPatientPanel"),
  createPatientBtn: document.getElementById("createPatientBtn"),
  selectedPatientTitle: document.getElementById("selectedPatientTitle"),
  selectedPatientInfo: document.getElementById("selectedPatientInfo"),
  patientContent: document.getElementById("patientContent"),
  appointmentList: document.getElementById("appointmentList"),
  taskList: document.getElementById("taskList"),
  messageList: document.getElementById("messageList"),
  historyList: document.getElementById("historyList"),
  protocolSummary: document.getElementById("protocolSummary"),
  tAssignee: document.getElementById("tAssignee"),
  pAcs: document.getElementById("pAcs"),
  pCareCategory: document.getElementById("pCareCategory"),
  addAppointmentBtn: document.getElementById("addAppointmentBtn"),
  addTaskBtn: document.getElementById("addTaskBtn"),
  addRecordBtn: document.getElementById("addRecordBtn"),
  sendMsgBtn: document.getElementById("sendMsgBtn"),
  applyFilterBtn: document.getElementById("applyFilterBtn"),
  filterMicroArea: document.getElementById("filterMicroArea"),
  filterAcs: document.getElementById("filterAcs"),
  filterCategory: document.getElementById("filterCategory"),
  pMicroArea: document.getElementById("pMicroArea"),
  auditPanel: document.getElementById("auditPanel"),
  auditList: document.getElementById("auditList")
};

function isManager() {
  return state.user?.role === "nurse_manager";
}

function isDoctor() {
  return state.user?.role === "doctor";
}

function isAcs() {
  return state.user?.role === "acs";
}

function canAcsUpdateTask(task) {
  return isAcs() && task.assigneeId === state.user.id;
}

function acsNameById(id) {
  return state.users.find((u) => u.id === id)?.name || "Nao atribuido";
}

function categoryLabel(category) {
  return state.protocolTemplates.find((t) => t.category === category)?.label || "Geral";
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Erro na requisicao");
  }

  return response.json();
}

function updateSessionView() {
  if (!state.user) {
    el.sessionInfo.textContent = "Nao autenticado";
    return;
  }

  const roleLabelMap = {
    nurse_manager: "Enfermeira Gestora",
    doctor: "Medica",
    acs: "ACS"
  };
  const roleLabel = roleLabelMap[state.user.role] || state.user.role;
  el.sessionInfo.textContent = `${state.user.name} (${roleLabel}) - ${state.user.teamName || "Sem equipe"}`;
}

function fillCategorySelect(selectEl, includeAllOption = false) {
  selectEl.innerHTML = "";
  if (includeAllOption) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Todas";
    selectEl.appendChild(opt);
  }

  state.protocolTemplates.forEach((template) => {
    const option = document.createElement("option");
    option.value = template.category;
    option.textContent = template.label;
    selectEl.appendChild(option);
  });
}

function fillAcsSelect(selectEl, withAnyOption = false) {
  selectEl.innerHTML = "";

  if (withAnyOption) {
    const anyOption = document.createElement("option");
    anyOption.value = "";
    anyOption.textContent = "Todos";
    selectEl.appendChild(anyOption);
  }

  state.users
    .filter((u) => u.role === "acs")
    .forEach((u) => {
      const option = document.createElement("option");
      option.value = u.id;
      option.textContent = u.name;
      selectEl.appendChild(option);
    });
}

function fillTeamSelect() {
  el.registerTeam.innerHTML = "";
  state.publicTeams.forEach((team) => {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = team.name;
    el.registerTeam.appendChild(option);
  });
}

function updateRegisterFormVisibility() {
  const role = el.registerRole.value;
  const needsCouncil = ["doctor", "nurse_manager"].includes(role);
  const managerRole = role === "nurse_manager";
  const councilType = role === "doctor" ? "CRM" : "COREN";

  el.registerCouncilNumberWrap.classList.toggle("hidden", !needsCouncil);
  el.registerCouncilUfWrap.classList.toggle("hidden", !needsCouncil);
  el.registerTeamNameWrap.classList.toggle("hidden", !managerRole);
  el.registerTeamWrap.classList.toggle("hidden", managerRole);

  if (needsCouncil) {
    el.registerCouncilNumberWrap.firstChild.textContent = `Numero do conselho (${councilType})`;
    el.registerCouncilNumber.placeholder = councilType === "CRM" ? "4 a 8 digitos" : "4 a 10 digitos";
    el.registerCouncilNumber.maxLength = councilType === "CRM" ? 8 : 10;
  }
}

function isSequentialDigits(input) {
  let asc = true;
  let desc = true;
  for (let i = 1; i < input.length; i += 1) {
    if (Number(input[i]) !== Number(input[i - 1]) + 1) asc = false;
    if (Number(input[i]) !== Number(input[i - 1]) - 1) desc = false;
  }
  return asc || desc;
}

function isRepeatedDigits(input) {
  return /^(\d)\1+$/.test(input);
}

function validateCouncilClient(role, number, uf) {
  if (!["doctor", "nurse_manager"].includes(role)) {
    return { ok: true };
  }

  const digits = String(number || "").replace(/\D/g, "");
  const normalizedUf = String(uf || "").trim().toUpperCase();
  const minLen = role === "doctor" ? 4 : 4;
  const maxLen = role === "doctor" ? 8 : 10;
  const validUf = /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/;

  if (digits.length < minLen || digits.length > maxLen) {
    return { ok: false, message: `Conselho deve ter entre ${minLen} e ${maxLen} digitos` };
  }

  if (isRepeatedDigits(digits)) {
    return { ok: false, message: "Conselho invalido: digitos repetidos" };
  }

  if (isSequentialDigits(digits)) {
    return { ok: false, message: "Conselho invalido: sequencia numerica" };
  }

  if (!validUf.test(normalizedUf)) {
    return { ok: false, message: "UF do conselho invalida" };
  }

  return { ok: true, number: digits, uf: normalizedUf };
}

function applyRolePermissions() {
  const managerOnlyFields = [
    "pName",
    "pPhone",
    "pDoc",
    "pAddress",
    "pComorb",
    "pMeds",
    "pAllergies",
    "pMicroArea",
    "pAcs",
    "pCareCategory",
    "tTitle",
    "tNotes",
    "tDue",
    "tAssignee"
  ];
  const clinicalFields = ["aDate", "aSummary", "aConduct", "aNext"];
  const recordType = document.getElementById("rType");

  if (isManager()) {
    el.newPatientPanel.classList.remove("hidden");
    el.addAppointmentBtn.classList.remove("hidden");
    el.addTaskBtn.classList.remove("hidden");
    el.auditPanel.classList.remove("hidden");
    managerOnlyFields.forEach((fieldId) => {
      document.getElementById(fieldId).disabled = false;
    });
    clinicalFields.forEach((fieldId) => {
      document.getElementById(fieldId).disabled = false;
    });
    [...recordType.options].forEach((opt) => {
      opt.disabled = false;
    });
    el.filterAcs.disabled = false;
    return;
  }

  el.newPatientPanel.classList.add("hidden");
  el.addTaskBtn.classList.add("hidden");
  el.auditPanel.classList.add("hidden");
  managerOnlyFields.forEach((fieldId) => {
    document.getElementById(fieldId).disabled = true;
  });

  if (isDoctor()) {
    el.addAppointmentBtn.classList.remove("hidden");
    clinicalFields.forEach((fieldId) => {
      document.getElementById(fieldId).disabled = false;
    });
    [...recordType.options].forEach((opt) => {
      opt.disabled = ["visit"].includes(opt.value);
    });
    if (recordType.value === "visit") {
      recordType.value = "consultation";
    }
    el.filterAcs.disabled = false;
    return;
  }

  el.addAppointmentBtn.classList.add("hidden");
  clinicalFields.forEach((fieldId) => {
    document.getElementById(fieldId).disabled = true;
  });
  el.filterAcs.value = state.user.id;
  el.filterAcs.disabled = true;
  [...recordType.options].forEach((opt) => {
    opt.disabled = !["visit", "note"].includes(opt.value);
  });
  recordType.value = "visit";
}

function renderPatients() {
  el.patientList.innerHTML = "";

  if (!state.patients.length) {
    el.patientList.innerHTML = '<p class="small">Nenhum paciente encontrado para os filtros.</p>';
    return;
  }

  state.patients.forEach((p) => {
    const item = document.createElement("div");
    item.className = `patient-item ${state.selectedPatient?.id === p.id ? "active" : ""}`;
    item.innerHTML = `
      <strong>${p.name}</strong><br />
      <span class="small">${p.phone || "Sem telefone"}</span><br />
      <span class="small">Categoria: ${categoryLabel(p.careCategory)}</span><br />
      <span class="small">Microarea: ${p.microArea || "-"} | ACS: ${acsNameById(p.assignedAcsId)}</span>
    `;
    item.addEventListener("click", () => selectPatient(p));
    el.patientList.appendChild(item);
  });
}

function renderPatientHeader() {
  if (!state.selectedPatient) {
    el.selectedPatientTitle.textContent = "Selecione um paciente";
    el.selectedPatientInfo.textContent = "";
    el.patientContent.classList.add("hidden");
    return;
  }

  const p = state.selectedPatient;
  el.selectedPatientTitle.textContent = p.name;
  el.selectedPatientInfo.textContent = `Categoria: ${categoryLabel(p.careCategory)} | Telefone: ${p.phone || "-"} | CNS/CPF: ${p.cnsCpf || "-"} | Endereco: ${p.address || "-"} | Microarea: ${p.microArea || "-"} | ACS: ${acsNameById(p.assignedAcsId)}`;
  el.patientContent.classList.remove("hidden");
}

function renderProtocolSummary() {
  el.protocolSummary.innerHTML = "";

  if (!state.protocolSummary) {
    el.protocolSummary.innerHTML = '<p class="small">Sem resumo de protocolo.</p>';
    return;
  }

  const s = state.protocolSummary;
  const vaccines = s.vaccines.recommended
    .map((v) => `<li>${v.done ? "[OK]" : "[ ]"} ${v.name}</li>`)
    .join("");

  el.protocolSummary.innerHTML = `
    <div class="summary-grid">
      <div class="summary-box"><strong>Visitas</strong><br /><span>${s.completed.visits}/${s.targets.visits}</span></div>
      <div class="summary-box"><strong>Consultas</strong><br /><span>${s.completed.consultations}/${s.targets.consultations}</span></div>
      <div class="summary-box"><strong>Vacinas</strong><br /><span>${s.completed.vaccines}/${s.targets.vaccines}</span></div>
    </div>
    <p class="small">Categoria ativa: ${s.categoryLabel}</p>
    <p class="small">Pendencias: visitas ${s.pending.visits}, consultas ${s.pending.consultations}, vacinas ${s.pending.vaccines}</p>
    <p class="small">Checklist de vacinas recomendadas:</p>
    <ul class="small protocol-list">${vaccines || "<li>Sem vacinas recomendadas para esta categoria.</li>"}</ul>
  `;
}

function renderAppointments() {
  el.appointmentList.innerHTML = "";
  if (!state.appointments.length) {
    el.appointmentList.innerHTML = '<p class="small">Sem atendimentos.</p>';
    return;
  }

  state.appointments.forEach((a) => {
    const div = document.createElement("div");
    div.className = "task";
    div.innerHTML = `
      <strong>${new Date(a.date).toLocaleString("pt-BR")}</strong>
      <p>${a.summary}</p>
      <p class="small">Conduta: ${a.conduct || "-"}</p>
      <p class="small">Proximo passo: ${a.nextStep || "-"}</p>
    `;
    el.appointmentList.appendChild(div);
  });
}

function statusText(status) {
  if (status === "done") return "Concluida";
  if (status === "in_progress") return "Em andamento";
  return "Pendente";
}

function renderTasks() {
  el.taskList.innerHTML = "";
  if (!state.tasks.length) {
    el.taskList.innerHTML = '<p class="small">Sem tarefas.</p>';
    return;
  }

  state.tasks.forEach((t) => {
    const owner = acsNameById(t.assigneeId);
    const wrap = document.createElement("div");
    wrap.className = "task";
    wrap.innerHTML = `
      <strong>${t.title}</strong>
      <span class="badge">${statusText(t.status)}</span>
      <p class="small">Responsavel: ${owner} | Prazo: ${t.dueDate || "-"}</p>
      <p>${t.notes || ""}</p>
    `;

    const statusSelect = document.createElement("select");
    [
      { value: "pending", label: "Pendente" },
      { value: "in_progress", label: "Em andamento" },
      { value: "done", label: "Concluida" }
    ].forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      o.selected = opt.value === t.status;
      statusSelect.appendChild(o);
    });

    statusSelect.disabled = !(isManager() || canAcsUpdateTask(t));

    statusSelect.addEventListener("change", async () => {
      try {
        await api(`/tasks/${t.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: statusSelect.value })
        });
        await refreshSelectedPatientData();
      } catch (error) {
        alert(error.message);
      }
    });

    wrap.appendChild(statusSelect);
    el.taskList.appendChild(wrap);
  });
}

function renderMessages() {
  el.messageList.innerHTML = "";
  if (!state.messages.length) {
    el.messageList.innerHTML = '<p class="small">Sem mensagens.</p>';
    return;
  }

  state.messages.forEach((m) => {
    const div = document.createElement("div");
    div.className = "msg";
    div.innerHTML = `
      <strong>${m.authorName}</strong>
      <span class="small">${new Date(m.createdAt).toLocaleString("pt-BR")}</span>
      <p>${m.text}</p>
    `;
    el.messageList.appendChild(div);
  });
}

function renderHistory() {
  el.historyList.innerHTML = "";

  if (!state.history.length) {
    el.historyList.innerHTML = '<p class="small">Sem historico clinico.</p>';
    return;
  }

  state.history.forEach((record) => {
    const div = document.createElement("div");
    div.className = "audit-item";
    div.innerHTML = `
      <strong>${record.type.toUpperCase()} - ${record.title}</strong>
      <span class="small">${new Date(record.date).toLocaleString("pt-BR")}</span>
      <p class="small">${record.details || "Sem detalhes"}</p>
      <p class="small">Origem: ${record.source}</p>
    `;
    el.historyList.appendChild(div);
  });
}

function renderAuditLogs() {
  if (!isManager()) return;

  el.auditList.innerHTML = "";
  if (!state.auditLogs.length) {
    el.auditList.innerHTML = '<p class="small">Sem registros de auditoria para este paciente.</p>';
    return;
  }

  state.auditLogs.slice(0, 20).forEach((log) => {
    const div = document.createElement("div");
    div.className = "audit-item";
    div.innerHTML = `
      <strong>${log.action}</strong>
      <span class="small">${new Date(log.createdAt).toLocaleString("pt-BR")}</span>
      <p class="small">${log.userName} (${log.userRole})</p>
    `;
    el.auditList.appendChild(div);
  });
}

function applyPatientFilterValues() {
  state.filters.microArea = el.filterMicroArea.value.trim();
  state.filters.acsId = el.filterAcs.value;
  state.filters.careCategory = el.filterCategory.value;
}

async function loadPatients() {
  const params = new URLSearchParams();
  if (state.filters.microArea) params.set("microArea", state.filters.microArea);
  if (state.filters.acsId) params.set("acsId", state.filters.acsId);
  if (state.filters.careCategory) params.set("careCategory", state.filters.careCategory);

  const query = params.toString();
  state.patients = await api(`/patients${query ? `?${query}` : ""}`);

  if (state.selectedPatient && !state.patients.some((p) => p.id === state.selectedPatient.id)) {
    state.selectedPatient = null;
    state.appointments = [];
    state.tasks = [];
    state.messages = [];
    state.history = [];
    state.protocolSummary = null;
    state.auditLogs = [];

    renderPatientHeader();
    renderAppointments();
    renderTasks();
    renderMessages();
    renderHistory();
    renderProtocolSummary();
    renderAuditLogs();
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
  await Promise.all([
    loadAppointments(),
    loadTasks(),
    loadMessages(),
    loadHistory(),
    loadProtocolSummary(),
    loadAuditLogs()
  ]);
}

async function selectPatient(patient) {
  state.selectedPatient = patient;
  renderPatients();
  renderPatientHeader();
  await refreshSelectedPatientData();
}

async function bootstrapAfterLogin() {
  const [users, templates] = await Promise.all([
    api("/users"),
    api("/protocol/templates")
  ]);

  state.users = users;
  state.protocolTemplates = templates;

  fillAcsSelect(el.tAssignee);
  fillAcsSelect(el.pAcs);
  fillAcsSelect(el.filterAcs, true);
  fillCategorySelect(el.pCareCategory);
  fillCategorySelect(el.filterCategory, true);

  el.loginCard.classList.add("hidden");
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
  } catch (error) {
    alert(error.message);
  }
}

el.loginBtn.addEventListener("click", async () => {
  try {
    const payload = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: el.loginEmail.value.trim(),
        password: el.loginPassword.value
      })
    });

    state.user = payload.user;
    state.token = payload.token;
    updateSessionView();
    await bootstrapAfterLogin();
  } catch (error) {
    alert(error.message);
  }
});

el.registerBtn.addEventListener("click", async () => {
  try {
    const role = el.registerRole.value;
    const councilCheck = validateCouncilClient(
      role,
      el.registerCouncilNumber.value,
      el.registerCouncilUf.value
    );

    if (!councilCheck.ok) {
      alert(councilCheck.message);
      return;
    }

    const payload = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: el.registerName.value.trim(),
        email: el.registerEmail.value.trim(),
        password: el.registerPassword.value,
        role,
        teamId: role === "nurse_manager" ? "" : el.registerTeam.value,
        teamName: role === "nurse_manager" ? el.registerTeamName.value.trim() : "",
        councilNumber: councilCheck.number || "",
        councilUf: councilCheck.uf || ""
      })
    });

    state.user = payload.user;
    state.token = payload.token;
    updateSessionView();
    await bootstrapAfterLogin();
  } catch (error) {
    alert(error.message);
  }
});

el.registerRole.addEventListener("change", () => {
  updateRegisterFormVisibility();
});

el.registerCouncilNumber.addEventListener("input", () => {
  const digits = el.registerCouncilNumber.value.replace(/\D/g, "");
  const role = el.registerRole.value;
  const maxLength = role === "doctor" ? 8 : 10;
  el.registerCouncilNumber.value = digits.slice(0, maxLength);
});

el.registerCouncilUf.addEventListener("input", () => {
  el.registerCouncilUf.value = el.registerCouncilUf.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
});

el.applyFilterBtn.addEventListener("click", async () => {
  try {
    applyPatientFilterValues();
    await loadPatients();
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("createPatientBtn").addEventListener("click", async () => {
  if (!isManager()) return;

  try {
    await api("/patients", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("pName").value,
        phone: document.getElementById("pPhone").value,
        cnsCpf: document.getElementById("pDoc").value,
        address: document.getElementById("pAddress").value,
        microArea: document.getElementById("pMicroArea").value,
        careCategory: document.getElementById("pCareCategory").value,
        assignedAcsId: document.getElementById("pAcs").value,
        comorbidities: document.getElementById("pComorb").value,
        medications: document.getElementById("pMeds").value,
        allergies: document.getElementById("pAllergies").value
      })
    });

    ["pName", "pPhone", "pDoc", "pAddress", "pMicroArea", "pComorb", "pMeds", "pAllergies"].forEach((id) => {
      document.getElementById(id).value = "";
    });

    await loadPatients();
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("addRecordBtn").addEventListener("click", async () => {
  if (!state.selectedPatient) return;

  try {
    const type = document.getElementById("rType").value;
    const vaccineName = document.getElementById("rVaccineName").value.trim();

    await api(`/patients/${state.selectedPatient.id}/records`, {
      method: "POST",
      body: JSON.stringify({
        type,
        date: document.getElementById("rDate").value,
        title: document.getElementById("rTitle").value,
        details: document.getElementById("rDetails").value,
        protocolTag: state.selectedPatient.careCategory,
        metadata: vaccineName ? { vaccineName } : {}
      })
    });

    ["rDate", "rTitle", "rDetails", "rVaccineName"].forEach((id) => {
      document.getElementById(id).value = "";
    });

    await refreshSelectedPatientData();
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("addAppointmentBtn").addEventListener("click", async () => {
  if (!state.selectedPatient || !isManager()) return;

  try {
    await api(`/patients/${state.selectedPatient.id}/appointments`, {
      method: "POST",
      body: JSON.stringify({
        date: document.getElementById("aDate").value,
        summary: document.getElementById("aSummary").value,
        conduct: document.getElementById("aConduct").value,
        nextStep: document.getElementById("aNext").value
      })
    });

    ["aDate", "aSummary", "aConduct", "aNext"].forEach((id) => {
      document.getElementById(id).value = "";
    });

    await refreshSelectedPatientData();
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("addTaskBtn").addEventListener("click", async () => {
  if (!state.selectedPatient || !isManager()) return;

  try {
    await api("/tasks", {
      method: "POST",
      body: JSON.stringify({
        patientId: state.selectedPatient.id,
        assigneeId: document.getElementById("tAssignee").value,
        title: document.getElementById("tTitle").value,
        notes: document.getElementById("tNotes").value,
        dueDate: document.getElementById("tDue").value
      })
    });

    ["tTitle", "tNotes", "tDue"].forEach((id) => {
      document.getElementById(id).value = "";
    });

    await refreshSelectedPatientData();
  } catch (error) {
    alert(error.message);
  }
});

document.getElementById("sendMsgBtn").addEventListener("click", async () => {
  if (!state.selectedPatient) return;

  const textEl = document.getElementById("mText");
  try {
    await api(`/patients/${state.selectedPatient.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: textEl.value })
    });

    textEl.value = "";
    await refreshSelectedPatientData();
  } catch (error) {
    alert(error.message);
  }
});

updateSessionView();
bootstrapBeforeLogin();

