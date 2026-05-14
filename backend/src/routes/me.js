import express from "express";
import { readDb, withDb } from "../db.js";
import { requireAuth } from "../middlewares/auth.js";
import { ensureDbShape, sanitizeUser } from "../utils/domain.js";
import {
  canonicalRole, roleNeedsCouncil, councilTypeForRole,
  isValidEmail, isStrongPassword, getClientIp
} from "../utils/helpers.js";
import { validateCouncilData, verifyCouncilExternally } from "../utils/council.js";
import { hashPassword } from "../services/crypto.js";
import { generateTotpSecret, verifyTotpCode, buildOtpAuthUrl, normalizeTotpSecret } from "../services/totp.js";
import { createToken } from "../services/tokens.js";
import { addAuditLog } from "../services/audit.js";

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
  return res.json(sanitizeUser(user, db));
});

router.get("/me/2fa/status", requireAuth, async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
  return res.json({
    enabled: Boolean(user.twoFactorEnabled && user.twoFactorSecret),
    pendingSetup: Boolean(user.twoFactorPendingSecret)
  });
});

router.post("/me/2fa/setup", requireAuth, async (req, res) => {
  const result = await withDb((db) => {
    ensureDbShape(db);
    const index = db.users.findIndex((u) => u.id === req.user.id);
    if (index < 0) return { error: { status: 404, message: "Usuário não encontrado" } };
    const user = db.users[index];
    const secret = generateTotpSecret();
    db.users[index].twoFactorPendingSecret = secret;
    db.users[index].twoFactorPendingCreatedAt = new Date().toISOString();
    db.users[index].updatedAt = new Date().toISOString();
    addAuditLog(db, user, "auth.2fa_setup_started", "user", user.id, {});
    return {
      secret,
      otpauthUrl: buildOtpAuthUrl(user, secret)
    };
  });
  if (result?.error) return res.status(result.error.status).json({ error: result.error.message });
  return res.json(result);
});

router.post("/me/2fa/enable", requireAuth, async (req, res) => {
  const code = String(req.body?.code || "").replace(/\D+/g, "");
  if (code.length !== 6) return res.status(400).json({ error: "Código 2FA inválido" });

  const result = await withDb((db) => {
    ensureDbShape(db);
    const index = db.users.findIndex((u) => u.id === req.user.id);
    if (index < 0) return { error: { status: 404, message: "Usuário não encontrado" } };
    const user = db.users[index];
    const pendingSecret = normalizeTotpSecret(user.twoFactorPendingSecret || "");
    if (!pendingSecret) {
      return { error: { status: 400, message: "Inicie a configuração 2FA antes de confirmar" } };
    }
    if (!verifyTotpCode(pendingSecret, code)) {
      return { error: { status: 401, message: "Código 2FA inválido para ativação" } };
    }
    db.users[index].twoFactorSecret = pendingSecret;
    db.users[index].twoFactorEnabled = true;
    db.users[index].twoFactorPendingSecret = "";
    db.users[index].twoFactorPendingCreatedAt = "";
    db.users[index].updatedAt = new Date().toISOString();
    addAuditLog(db, user, "auth.2fa_enabled", "user", user.id, {});
    return { user: db.users[index], db };
  });
  if (result?.error) return res.status(result.error.status).json({ error: result.error.message });
  const token = createToken(result.user, result.db);
  return res.json({ user: sanitizeUser(result.user, result.db), token });
});

router.post("/me/2fa/disable", requireAuth, async (req, res) => {
  const code = String(req.body?.code || "").replace(/\D+/g, "");
  if (code.length !== 6) return res.status(400).json({ error: "Código 2FA inválido" });

  const result = await withDb((db) => {
    ensureDbShape(db);
    const index = db.users.findIndex((u) => u.id === req.user.id);
    if (index < 0) return { error: { status: 404, message: "Usuário não encontrado" } };
    const user = db.users[index];
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return { error: { status: 400, message: "2FA já está desativado" } };
    }
    if (!verifyTotpCode(user.twoFactorSecret, code)) {
      return { error: { status: 401, message: "Código 2FA inválido" } };
    }

    db.users[index].twoFactorEnabled = false;
    db.users[index].twoFactorSecret = "";
    db.users[index].twoFactorPendingSecret = "";
    db.users[index].twoFactorPendingCreatedAt = "";
    db.users[index].updatedAt = new Date().toISOString();
    addAuditLog(db, user, "auth.2fa_disabled", "user", user.id, {});
    return { user: db.users[index], db };
  });

  if (result?.error) return res.status(result.error.status).json({ error: result.error.message });
  const token = createToken(result.user, result.db);
  return res.json({ user: sanitizeUser(result.user, result.db), token });
});

router.post("/me/presence", requireAuth, async (req, res) => {
  const nowIso = new Date().toISOString();
  await withDb((db) => {
    ensureDbShape(db);
    const idx = db.users.findIndex((u) => u.id === req.user.id);
    if (idx >= 0) {
      db.users[idx].lastSeenAt = nowIso;
      db.users[idx].lastSeenIp = getClientIp(req);
      db.users[idx].updatedAt = nowIso;
    }
  });
  return res.json({ ok: true, lastSeenAt: nowIso });
});

router.patch("/me", requireAuth, async (req, res) => {
  const payload = req.body || {};

  const result = await withDb(async (db) => {
    ensureDbShape(db);
    const index = db.users.findIndex((u) => u.id === req.user.id);
    if (index < 0) return { error: { status: 404, message: "Usuário não encontrado" } };

    const current = db.users[index];
    const next = { ...current };

    if (payload.name !== undefined) {
      const name = String(payload.name || "").trim();
      if (!name) return { error: { status: 400, message: "Nome não pode ficar vazio" } };
      next.name = name;
    }

    if (payload.email !== undefined) {
      const email = String(payload.email || "").trim().toLowerCase();
      if (!email) return { error: { status: 400, message: "Email não pode ficar vazio" } };
      if (!isValidEmail(email)) return { error: { status: 400, message: "E-mail inválido" } };
      const exists = db.users.some((u) => u.id !== current.id && String(u.email).toLowerCase() === email);
      if (exists) return { error: { status: 409, message: "E-mail já em uso por outro usuário" } };
      next.email = email;
    }

    if (payload.password !== undefined) {
      const password = String(payload.password || "");
      if (!isStrongPassword(password)) {
        return { error: { status: 400, message: "Senha fraca: mínimo de 8 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial" } };
      }
      next.password = hashPassword(password);
    }

    const role = canonicalRole(current.role);
    if (roleNeedsCouncil(role) && (payload.councilNumber !== undefined || payload.councilUf !== undefined)) {
      const candidateNumber = payload.councilNumber !== undefined ? payload.councilNumber : current.councilNumber;
      const candidateUf = payload.councilUf !== undefined ? payload.councilUf : current.councilUf;

      const localCheck = validateCouncilData(role, candidateNumber, candidateUf);
      if (!localCheck.ok) return { error: { status: 400, message: localCheck.message } };

      const councilType = councilTypeForRole(role);
      const duplicated = db.users.some((u) => {
        if (u.id === current.id) return false;
        return String(u.councilType || "").toUpperCase() === councilType
          && String(u.councilNumber || "") === localCheck.councilNumber
          && String(u.councilUf || "").toUpperCase() === localCheck.councilUf;
      });

      if (duplicated) {
        return { error: { status: 409, message: `${councilType} já cadastrado para outro usuário` } };
      }

      const unchangedCouncil = String(current.councilType || "").toUpperCase() === String(councilType || "").toUpperCase()
        && String(current.councilNumber || "") === String(localCheck.councilNumber || "")
        && String(current.councilUf || "").toUpperCase() === String(localCheck.councilUf || "").toUpperCase();

      if (!unchangedCouncil) {
        const external = await verifyCouncilExternally({
          role,
          councilType,
          councilNumber: localCheck.councilNumber,
          councilUf: localCheck.councilUf,
          name: next.name,
          email: next.email
        });

        if (!external.valid) {
          return { error: { status: 400, message: external.error || "Conselho não validado no provedor externo" } };
        }

        next.councilVerification = {
          checked: external.checked,
          provider: external.provider,
          status: external.status,
          verifiedAt: new Date().toISOString()
        };
      }

      next.councilType = councilType;
      next.councilNumber = localCheck.councilNumber;
      next.councilUf = localCheck.councilUf;
    }

    next.updatedAt = new Date().toISOString();
    db.users[index] = next;

    addAuditLog(db, next, "user.profile_updated", "user", next.id, {
      changedFields: Object.keys(payload || {})
    });

    const safeUser = sanitizeUser(next, db);
    const token = createToken(next, db);
    return { user: safeUser, token };
  });

  if (result.error) return res.status(result.error.status).json({ error: result.error.message });
  return res.json(result);
});

export default router;
