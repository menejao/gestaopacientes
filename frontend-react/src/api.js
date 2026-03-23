const API_URL = import.meta.env.VITE_API_URL || "https://saude-backend-gkj7.onrender.com";

export async function api(path, options = {}, token = "") {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || "Erro na API");
  }
  return response.json();
}

export async function login(email, password) {
  return api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function register(payload) {
  return api("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listPublicTeams() {
  return api("/teams/public", { method: "GET" });
}

export async function bootstrap(token) {
  return api("/bootstrap", { method: "GET" }, token);
}

export async function listPatients(token) {
  return api("/patients", { method: "GET" }, token);
}

export async function createPatient(token, payload) {
  return api("/patients", { method: "POST", body: JSON.stringify(payload) }, token);
}

export async function updatePatient(token, id, payload) {
  return api(`/patients/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token);
}

export async function deletePatient(token, id) {
  return api(`/patients/${id}`, { method: "DELETE" }, token);
}

export async function listProtocolTemplates(token) {
  return api("/protocol/templates", { method: "GET" }, token);
}

export async function createProtocolTemplate(token, payload) {
  return api("/protocol/templates", { method: "POST", body: JSON.stringify(payload) }, token);
}

export async function updateProtocolTemplate(token, category, payload) {
  return api(`/protocol/templates/${encodeURIComponent(category)}`, { method: "PUT", body: JSON.stringify(payload) }, token);
}

export async function deleteProtocolTemplate(token, category) {
  return api(`/protocol/templates/${encodeURIComponent(category)}`, { method: "DELETE" }, token);
}

export async function getProtocolSummaries(token, ids) {
  const query = encodeURIComponent(ids.join(","));
  return api(`/patients/protocol-summaries?ids=${query}`, { method: "GET" }, token);
}

export async function getPatientProtocolSummary(token, patientId) {
  return api(`/patients/${patientId}/protocol-summary`, { method: "GET" }, token);
}

export async function getPatientHistory(token, patientId) {
  return api(`/patients/${patientId}/history`, { method: "GET" }, token);
}

export async function listAppointments(token, patientId) {
  return api(`/patients/${patientId}/appointments`, { method: "GET" }, token);
}

export async function createAppointment(token, patientId, payload) {
  return api(`/patients/${patientId}/appointments`, { method: "POST", body: JSON.stringify(payload) }, token);
}

export async function deleteAppointment(token, patientId, appointmentId) {
  return api(`/patients/${patientId}/appointments/${appointmentId}`, { method: "DELETE" }, token);
}

export async function listTasks(token, patientId) {
  return api(`/tasks?patientId=${encodeURIComponent(patientId)}`, { method: "GET" }, token);
}

export async function createTask(token, payload) {
  return api("/tasks", { method: "POST", body: JSON.stringify(payload) }, token);
}

export async function updateTaskStatus(token, taskId, status) {
  return api(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) }, token);
}

export async function listMessages(token, patientId) {
  return api(`/patients/${patientId}/messages`, { method: "GET" }, token);
}

export async function sendMessage(token, patientId, text) {
  return api(`/patients/${patientId}/messages`, { method: "POST", body: JSON.stringify({ text }) }, token);
}

export async function createRecord(token, patientId, payload) {
  return api(`/patients/${patientId}/records`, { method: "POST", body: JSON.stringify(payload) }, token);
}

export async function deleteRecord(token, patientId, recordId) {
  return api(`/patients/${patientId}/records/${recordId}`, { method: "DELETE" }, token);
}

export async function listUsers(token) {
  return api("/users", { method: "GET" }, token);
}

export async function createUser(token, payload) {
  return api("/users", { method: "POST", body: JSON.stringify(payload) }, token);
}

export async function updateUser(token, userId, payload) {
  return api(`/users/${userId}`, { method: "PUT", body: JSON.stringify(payload) }, token);
}

export async function getUserUsage(token, userId) {
  return api(`/users/${userId}/usage`, { method: "GET" }, token);
}

export async function deleteUser(token, userId) {
  return api(`/users/${userId}`, { method: "DELETE" }, token);
}

export async function aiTeamPriorities(token) {
  return api("/ai/team/priorities", { method: "POST", body: JSON.stringify({}) }, token);
}

export async function aiTeamDataQuality(token) {
  return api("/ai/team/data-quality", { method: "POST", body: JSON.stringify({}) }, token);
}

export async function aiTeamReport(token) {
  return api("/ai/team/report", { method: "POST", body: JSON.stringify({}) }, token);
}

export async function aiTeamAsk(token, question) {
  return api("/ai/chat", { method: "POST", body: JSON.stringify({ question }) }, token);
}

export async function pingPresence(token) {
  try {
    const res = await fetch(`${API_URL}/me/presence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
    // 404 = endpoint não disponível neste deploy, ignora silenciosamente
    if (!res.ok && res.status !== 404) throw new Error("presence failed");
  } catch {}
}
