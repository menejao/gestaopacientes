import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { canonicalRole } from "../utils/helpers.js";
import { ensureArray } from "../utils/domain.js";

function hashAuditPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function getLastAuditHash(db) {
  const list = Array.isArray(db.auditLogs) ? db.auditLogs : [];
  if (!list.length) return "";
  const last = list[list.length - 1];
  return String(last?.hash || "");
}

function addAuditLog(db, user, action, entity, entityId, details = {}) {
  ensureArray(db, "auditLogs");
  const nowIso = new Date().toISOString();
  const prevHash = getLastAuditHash(db);
  const logEntry = {
    id: uuidv4(),
    action,
    entity,
    entityId,
    userId: user.id,
    userName: user.name,
    userRole: canonicalRole(user.role),
    details,
    requestId: user?.requestId || "",
    createdAt: nowIso
  };
  const hash = hashAuditPayload({ ...logEntry, prevHash });
  db.auditLogs.push({ ...logEntry, prevHash, hash });
}

export { hashAuditPayload, getLastAuditHash, addAuditLog };
