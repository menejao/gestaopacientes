export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? "https://saude-backend-gkj7.onrender.com"
    : "http://localhost:5030");

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const COOKIE_SESSION_TOKEN = "__cookie_session__";
const CSRF_COOKIE_NAME = "saudeubs_csrf";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonWithTimeout(response, timeoutMs) {
  return Promise.race([
    response.json().catch(() => ({})),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Tempo de resposta excedido. Tente novamente em instantes.")), timeoutMs)
    )
  ]);
}

function shouldRetryStatus(status, customStatuses) {
  if (Array.isArray(customStatuses) && customStatuses.length > 0) {
    return customStatuses.includes(status);
  }
  return RETRYABLE_STATUSES.has(status);
}

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || "";
}

async function refreshSession() {
  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  const headers = {};
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers
  });
  if (!response.ok) {
    throw new Error("Sessão expirada");
  }
  return response.json().catch(() => ({}));
}

export async function api(path, options = {}, token = "") {
  const {
    retryCount = 0,
    retryDelayMs = 350,
    retryStatuses,
    skipAuthRefresh = false,
    timeoutMs = 20000,
    ...fetchOptions
  } = options || {};

  const headers = { ...(fetchOptions.headers || {}) };
  const isFormData = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token && token !== COOKIE_SESSION_TOKEN) {
    headers.Authorization = `Bearer ${token}`;
  }
  console.log("REQUEST AUTH HEADER", headers.Authorization || "(sem token)");
  const csrfToken = readCookie(CSRF_COOKIE_NAME);
  const method = String(fetchOptions.method || "GET").toUpperCase();
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    let response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 20000));

    try {
      response = await fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        credentials: "include",
        signal: controller.signal,
        headers
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const message = String(err?.message || "");
      if (err?.name === "AbortError") {
        if (attempt < retryCount) {
          const waitMs = retryDelayMs * (attempt + 1) + Math.floor(Math.random() * 120);
          await sleep(waitMs);
          continue;
        }
        throw new Error("Tempo de resposta excedido. Tente novamente em instantes.");
      }
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
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (attempt < retryCount && shouldRetryStatus(response.status, retryStatuses)) {
        const waitMs = retryDelayMs * (attempt + 1) + Math.floor(Math.random() * 120);
        await sleep(waitMs);
        continue;
      }
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && !skipAuthRefresh && path !== "/auth/refresh") {
        try {
          await refreshSession();
          return api(path, { ...options, skipAuthRefresh: true }, COOKIE_SESSION_TOKEN);
        } catch {
          window.dispatchEvent(new CustomEvent("sigus:auth-expired", { detail: { path, message: "Sessão expirada" } }));
          throw new Error("Sessão expirada");
        }
      }

      const error = new Error(body?.error || "Erro na API");
      error.status = response.status;
      error.payload = body;
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("sigus:auth-expired", { detail: { path, message: error.message } }));
      }
      throw error;
    }

    return response.json().catch(() => ({}));
  }

  throw new Error("Erro na API");
}

export async function login(email, password) {
  return api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipAuthRefresh: true,
    retryCount: 0,
    timeoutMs: 45000
  });
}

export const verifyCredentials = login;

export async function verifyLogin2fa(challengeId, code) {
  return api("/auth/login/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId, code })
  });
}

export async function register(payload) {
  return api("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
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

export async function getPatient(token, id) {
  return api(`/patients/${id}`, { method: "GET", retryCount: 2 }, token);
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

export async function inactivatePatient(token, id, reason) {
  return api(`/patients/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }, token);
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

export async function inactivateRecord(token, patientId, recordId, reason) {
  return api(`/patients/${patientId}/records/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify({ inactive: true, inactivationReason: reason })
  }, token);
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

export async function updateMe(token, payload) {
  return api("/me", { method: "PATCH", body: JSON.stringify(payload) }, token);
}

export async function getUserUsage(token, userId) {
  return api(`/users/${userId}/usage`, { method: "GET" }, token);
}

export async function deleteUser(token, userId, payload = {}) {
  return api(`/users/${userId}`, {
    method: "DELETE",
    body: JSON.stringify(payload)
  }, token);
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

export async function getApiHealth() {
  return api("/health", { method: "GET", retryCount: 1, retryDelayMs: 250 });
}

export async function listAuditLogs(token, params = {}) {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.entity) search.set("entity", String(params.entity));
  if (params.action) search.set("action", String(params.action));
  if (params.userId) search.set("userId", String(params.userId));
  const qs = search.toString();
  return api(`/audit/logs${qs ? `?${qs}` : ""}`, { method: "GET", retryCount: 2 }, token);
}

export async function reactivatePatientRecord(token, id) {
  return api(`/patients/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      inactive: false,
      inactivationReason: null,
      inactivatedBy: null,
      inactivatedAt: null
    })
  }, token);
}

export async function pingPresence(token) {
  try {
    await api("/me/presence", { method: "POST", skipAuthRefresh: true, retryStatuses: [] }, token);
  } catch (err) {
    if (import.meta.env.DEV) {
      console.debug("[pingPresence] falha não-crítica:", err?.message);
    }
  }
}

export async function logout() {
  return api("/auth/logout", { method: "POST" });
}

export async function requestPasswordReset(email) {
  return api("/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export async function confirmPasswordReset(token, newPassword) {
  return api("/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ token, newPassword })
  });
}

export async function createExam(token, patientId, payload) {
  return api(`/patients/${patientId}/exams`, {
    method: "POST",
    body: JSON.stringify(payload)
  }, token);
}

export async function listExams(token, patientId) {
  return api(`/patients/${patientId}/exams`, { method: "GET", retryCount: 2 }, token);
}

export async function uploadExamAttachment(token, patientId, examId, formData) {
  return api(`/patients/${patientId}/exams/${examId}/attachments`, {
    method: "POST",
    body: formData
  }, token);
}

export async function deleteExam(token, patientId, examId, reason = "") {
  return api(`/patients/${patientId}/exams/${examId}`, {
    method: "DELETE",
    body: reason ? JSON.stringify({ reason }) : undefined
  }, token);
}


