export const API_URL = import.meta.env.VITE_API_URL || "https://saude-backend-gkj7.onrender.com";

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status, customStatuses) {
  if (Array.isArray(customStatuses) && customStatuses.length > 0) {
    return customStatuses.includes(status);
  }
  return RETRYABLE_STATUSES.has(status);
}

export async function api(path, options = {}, token = "") {
  const {
    retryCount = 0,
    retryDelayMs = 350,
    retryStatuses,
    ...fetchOptions
  } = options || {};

  const headers = { ...(fetchOptions.headers || {}) };
  const isFormData = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    let response;

    try {
      response = await fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        headers
      });
    } catch (err) {
      const message = String(err?.message || "");
      if (attempt < retryCount) {
        const waitMs = retryDelayMs * (attempt + 1) + Math.floor(Math.random() * 120);
        await sleep(waitMs);
        continue;
      }
      if (message.toLowerCase().includes("failed to fetch")) {
        throw new Error("Falha de conexão com o servidor");
      }
      throw err;
    }

    if (!response.ok) {
      if (attempt < retryCount && shouldRetryStatus(response.status, retryStatuses)) {
        const waitMs = retryDelayMs * (attempt + 1) + Math.floor(Math.random() * 120);
        await sleep(waitMs);
        continue;
      }
      const body = await response.json().catch(() => ({}));
      const err = new Error(body?.error || "Erro na API");
      err.status = response.status;
      throw err;
    }

    return response.json();
  }

  throw new Error("Erro na API");
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

export async function refreshSession(refreshToken) {
  return api("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });
}

export async function logoutApi(token, refreshToken) {
  return api("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }, token);
}

export async function listPublicTeams() {
  return api("/teams/public", { method: "GET", retryCount: 2 });
}

export async function bootstrap(token) {
  return api("/bootstrap", { method: "GET", retryCount: 2 }, token);
}

export async function listPatients(token) {
  return api("/patients", { method: "GET", retryCount: 2 }, token);
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
  return api("/protocol/templates", { method: "GET", retryCount: 2 }, token);
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
  return api(`/patients/protocol-summaries?ids=${query}`, { method: "GET", retryCount: 2 }, token);
}

export async function getPatientProtocolSummary(token, patientId) {
  return api(`/patients/${patientId}/protocol-summary`, { method: "GET", retryCount: 2 }, token);
}

export async function getPatientHistory(token, patientId) {
  return api(`/patients/${patientId}/history`, { method: "GET", retryCount: 2 }, token);
}

export async function listAppointments(token, patientId) {
  return api(`/patients/${patientId}/appointments`, { method: "GET", retryCount: 2 }, token);
}

export async function createAppointment(token, patientId, payload) {
  return api(`/patients/${patientId}/appointments`, { method: "POST", body: JSON.stringify(payload) }, token);
}

export async function deleteAppointment(token, patientId, appointmentId) {
  return api(`/patients/${patientId}/appointments/${appointmentId}`, { method: "DELETE" }, token);
}

export async function listTasks(token, patientId) {
  return api(`/tasks?patientId=${encodeURIComponent(patientId)}`, { method: "GET", retryCount: 2 }, token);
}

export async function createTask(token, payload) {
  return api("/tasks", { method: "POST", body: JSON.stringify(payload) }, token);
}

export async function updateTaskStatus(token, taskId, status) {
  return api(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) }, token);
}

export async function listMessages(token, patientId) {
  return api(`/patients/${patientId}/messages`, { method: "GET", retryCount: 2 }, token);
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
  return api("/users", { method: "GET", retryCount: 2 }, token);
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
  return api("/ai/team/priorities", { method: "POST", body: JSON.stringify({}), retryCount: 1 }, token);
}

export async function aiTeamDataQuality(token) {
  return api("/ai/team/data-quality", { method: "POST", body: JSON.stringify({}), retryCount: 1 }, token);
}

export async function aiTeamReport(token) {
  return api("/ai/team/report", { method: "POST", body: JSON.stringify({}), retryCount: 1 }, token);
}

export async function aiTeamAsk(token, question) {
  return api("/ai/chat", { method: "POST", body: JSON.stringify({ question }), retryCount: 1 }, token);
}

export async function requestAccess(payload) {
  return api("/auth/access-requests", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listAccessRequests(token) {
  return api("/auth/access-requests", { method: "GET", retryCount: 1 }, token);
}

export async function approveAccessRequest(token, id) {
  return api(`/auth/access-requests/${id}/approve`, { method: "POST", body: JSON.stringify({}) }, token);
}

export async function rejectAccessRequest(token, id) {
  return api(`/auth/access-requests/${id}/reject`, { method: "POST", body: JSON.stringify({}) }, token);
}

export async function getApiHealth() {
  return api("/health", { method: "GET", retryCount: 1, retryDelayMs: 250 });
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
