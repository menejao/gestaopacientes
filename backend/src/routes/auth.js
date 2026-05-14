import express from "express";
import { v4 as uuidv4 } from "uuid";
import { readDb, withDb } from "../db.js";
import { TWOFA_CHALLENGE_TTL_MS, TWOFA_MAX_ATTEMPTS } from "../config.js";
import { validate, LoginSchema, RegisterSchema } from "../schemas.js";
import { authRateLimit } from "../middlewares/rate-limits.js";
import { requireAuth } from "../middlewares/auth.js";
import {
  canonicalRole, isStrongPassword, isValidEmail, roleNeedsCouncil,
  councilTypeForRole, getClientIp, ALLOWED_SELF_REGISTER_ROLES
} from "../utils/helpers.js";
import { ensureDbShape, sanitizeUser } from "../utils/domain.js";
import { validateCouncilData, verifyCouncilExternally } from "../utils/council.js";
import { hashPassword, isHashedPassword, verifyPassword, hashToken } from "../services/crypto.js";
import { verifyTotpCode } from "../services/totp.js";
import { createToken, createRefreshToken } from "../services/tokens.js";
import { addAuditLog } from "../services/audit.js";
import { ensureDemoManagerIfNeeded } from "../services/startup.js";
import { trackLoginAttempt } from "../middlewares/logging.js";

const router = express.Router();

router.post("/auth/register", authRateLimit, validate(RegisterSchema), async (req, res) => {
  const payload = req.body || {};
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const role = canonicalRole(payload.role);
  const councilType = councilTypeForRole(role);

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password e role são obrigatórios" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "E-mail inválido" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Senha fraca: mínimo de 8 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial" });
  }
  if (!ALLOWED_SELF_REGISTER_ROLES.includes(role)) {
    return res.status(400).json({ error: "Cadastro público permitido apenas para enfermeira, médica e gestor" });
  }

  const councilValidation = validateCouncilData(role, payload.councilNumber, payload.councilUf);
  if (!councilValidation.ok) {
    return res.status(400).json({ error: councilValidation.message });
  }

  const externalCheck = roleNeedsCouncil(role)
    ? await verifyCouncilExternally({
      role,
      councilType,
      councilNumber: councilValidation.councilNumber || "",
      councilUf: councilValidation.councilUf || "",
      name,
      email
    })
    : {
      checked: false,
      valid: true,
      provider: "not-required",
      status: "skipped"
    };
  if (!externalCheck.valid) {
    return res.status(400).json({
      error: externalCheck.error || "Conselho não validado no provedor externo"
    });
  }

  const result = await withDb((db) => {
    ensureDbShape(db);
    if (db.users.some((u) => String(u.email || "").toLowerCase() === email)) {
      return { error: "E-mail já cadastrado", status: 409 };
    }

    const duplicatedCouncil = roleNeedsCouncil(role) && db.users.some((u) => {
      const uRole = canonicalRole(u.role);
      return roleNeedsCouncil(uRole)
        && String(u.councilType || "").toUpperCase() === councilType
        && String(u.councilNumber || "") === councilValidation.councilNumber
        && String(u.councilUf || "").toUpperCase() === councilValidation.councilUf;
    });
    if (duplicatedCouncil) {
      return { error: `${councilType} já cadastrado para outro usuário`, status: 409 };
    }

    const requiresTeam = role !== "gestor";
    const teamId = String(payload.teamId || "").trim();
    const team = requiresTeam ? db.teams.find((t) => t.id === teamId) : null;
    if (requiresTeam && !teamId) {
      return { error: "teamId é obrigatório para cadastro", status: 400 };
    }
    if (requiresTeam && !team) {
      return { error: "Equipe informada não existe", status: 400 };
    }

    const user = {
      id: uuidv4(),
      name,
      role,
      email,
      password: hashPassword(password),
      teamId: requiresTeam ? teamId : "",
      councilType,
      councilNumber: councilValidation.councilNumber || "",
      councilUf: councilValidation.councilUf || "",
      councilVerification: {
        checked: externalCheck.checked,
        provider: externalCheck.provider,
        status: externalCheck.status,
        verifiedAt: new Date().toISOString()
      },
      twoFactorEnabled: false,
      twoFactorSecret: "",
      twoFactorPendingSecret: "",
      twoFactorPendingCreatedAt: "",
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      lastSeenIp: getClientIp(req)
    };
    db.users.push(user);
    if (role === "nurse_manager" && !team.managerUserId) {
      team.managerUserId = user.id;
      team.updatedAt = new Date().toISOString();
    }
    const rtResult = createRefreshToken(user.id, getClientIp(req), db);
    addAuditLog(db, user, "auth.register", "auth", rtResult.sessionId, { userId: user.id });
    return { user, db, raw: rtResult.raw };
  });

  if (result?.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }
  const safeUser = sanitizeUser(result.user, result.db);
  const token = createToken(result.user, result.db);
  return res.status(201).json({ user: safeUser, token, refreshToken: result.raw });
});

router.post("/auth/register/request-code", authRateLimit, async (_req, res) => {
  return res.status(410).json({ error: "Fluxo de código desativado. Use /auth/register." });
});

router.post("/auth/register/confirm", authRateLimit, async (_req, res) => {
  return res.status(410).json({ error: "Fluxo de código desativado. Use /auth/register." });
});

router.post("/auth/login", authRateLimit, validate(LoginSchema), async (req, res) => {
  const { email, password } = req.body || {};
  let db = await readDb();
  ensureDbShape(db);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const inputPassword = String(password || "");
  let user = db.users.find(
    (u) => String(u.email || "").toLowerCase() === normalizedEmail && verifyPassword(inputPassword, u.password)
  );

  if (!user) {
    const recovered = await ensureDemoManagerIfNeeded(email, password);
    if (recovered?.user) {
      user = recovered.user;
      db = recovered.db;
    }
  }
  if (!user) {
    trackLoginAttempt(false);
    return res.status(401).json({ error: "Credenciais inválidas" });
  }

  if (!isHashedPassword(user.password)) {
    await withDb((mutableDb) => {
      ensureDbShape(mutableDb);
      const idx = mutableDb.users.findIndex((u) => u.id === user.id);
      if (idx >= 0) {
        mutableDb.users[idx].password = hashPassword(inputPassword);
        mutableDb.users[idx].updatedAt = new Date().toISOString();
      }
    });
    db = await readDb();
    ensureDbShape(db);
    user = db.users.find((u) => u.id === user.id) || user;
  }

  const nowIso = new Date().toISOString();

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const challenge = await withDb((mutableDb) => {
      ensureDbShape(mutableDb);
      const idx = mutableDb.users.findIndex((u) => u.id === user.id);
      if (idx < 0) return null;
      const expiresAt = new Date(Date.now() + TWOFA_CHALLENGE_TTL_MS).toISOString();
      const challengeItem = {
        id: uuidv4(),
        userId: user.id,
        createdAt: nowIso,
        expiresAt,
        attempts: 0,
        consumed: false
      };
      mutableDb.loginChallenges = (mutableDb.loginChallenges || [])
        .filter((item) => !item.consumed)
        .filter((item) => String(item.userId || "") !== String(user.id))
        .slice(-50);
      mutableDb.loginChallenges.push(challengeItem);
      mutableDb.users[idx].lastSeenAt = nowIso;
      mutableDb.users[idx].lastSeenIp = getClientIp(req);
      mutableDb.users[idx].updatedAt = nowIso;
      addAuditLog(mutableDb, user, "auth.login_challenge_created", "auth", challengeItem.id, {
        userId: user.id
      });
      return challengeItem;
    });

    return res.json({
      twoFactorRequired: true,
      challengeId: challenge?.id || "",
      challengeExpiresAt: challenge?.expiresAt || ""
    });
  }

  const { raw: loginRefreshToken } = await withDb((mutableDb) => {
    ensureDbShape(mutableDb);
    const idx = mutableDb.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      mutableDb.users[idx].lastLoginAt = nowIso;
      mutableDb.users[idx].lastSeenAt = nowIso;
      mutableDb.users[idx].lastSeenIp = getClientIp(req);
      mutableDb.users[idx].updatedAt = nowIso;
    }
    const rtResult = createRefreshToken(user.id, getClientIp(req), mutableDb);
    addAuditLog(mutableDb, user, "auth.login", "auth", rtResult.sessionId, { userId: user.id });
    return rtResult;
  });
  {
    const latestDb = await readDb();
    ensureDbShape(latestDb);
    user = latestDb.users.find((u) => u.id === user.id) || user;
    db = latestDb;
  }

  trackLoginAttempt(true);
  const safeUser = sanitizeUser(user, db);
  const token = createToken(user, db);
  return res.json({ user: safeUser, token, refreshToken: loginRefreshToken });
});

router.post("/auth/login/verify", authRateLimit, async (req, res) => {
  const challengeId = String(req.body?.challengeId || "").trim();
  const code = String(req.body?.code || "").replace(/\D+/g, "");
  if (!challengeId || code.length !== 6) {
    return res.status(400).json({ error: "challengeId e code (6 dígitos) são obrigatórios" });
  }

  const result = await withDb((db) => {
    ensureDbShape(db);
    const challengeIndex = db.loginChallenges.findIndex((item) => String(item.id || "") === challengeId);
    if (challengeIndex < 0) return { error: { status: 404, message: "Desafio de login não encontrado" } };
    const challenge = db.loginChallenges[challengeIndex];
    if (challenge.consumed) return { error: { status: 400, message: "Desafio de login já utilizado" } };
    if (Date.parse(String(challenge.expiresAt || "")) < Date.now()) {
      challenge.consumed = true;
      return { error: { status: 401, message: "Desafio de login expirado" } };
    }

    const userIndex = db.users.findIndex((u) => u.id === challenge.userId);
    if (userIndex < 0) return { error: { status: 404, message: "Usuário do desafio não encontrado" } };
    const user = db.users[userIndex];
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return { error: { status: 400, message: "2FA não está habilitado para este usuário" } };
    }

    const ok = verifyTotpCode(user.twoFactorSecret, code);
    if (!ok) {
      challenge.attempts = Number(challenge.attempts || 0) + 1;
      if (challenge.attempts >= TWOFA_MAX_ATTEMPTS) {
        challenge.consumed = true;
      }
      return { error: { status: 401, message: "Código 2FA inválido" } };
    }

    challenge.consumed = true;
    const nowIso = new Date().toISOString();
    db.users[userIndex].lastLoginAt = nowIso;
    db.users[userIndex].lastSeenAt = nowIso;
    db.users[userIndex].lastSeenIp = getClientIp(req);
    db.users[userIndex].updatedAt = nowIso;
    const rtResult = createRefreshToken(user.id, getClientIp(req), db);
    addAuditLog(db, user, "auth.login_2fa_verified", "auth", challengeId, { userId: user.id, sessionId: rtResult.sessionId });
    return { user: db.users[userIndex], db, raw: rtResult.raw };
  });

  if (result?.error) {
    trackLoginAttempt(false);
    return res.status(result.error.status).json({ error: result.error.message });
  }
  trackLoginAttempt(true);
  const safeUser = sanitizeUser(result.user, result.db);
  const token = createToken(result.user, result.db);
  return res.json({ user: safeUser, token, refreshToken: result.raw });
});

router.post("/auth/refresh", authRateLimit, async (req, res) => {
  const rawToken = String(req.body?.refreshToken || "").trim();
  if (!rawToken) return res.status(400).json({ error: "refreshToken é obrigatório" });

  const result = await withDb((db) => {
    ensureDbShape(db);
    const hash = hashToken(rawToken);
    const idx = db.refreshTokens.findIndex((t) => t.tokenHash === hash);
    if (idx < 0) return { error: { status: 401, message: "Refresh token inválido" } };

    const record = db.refreshTokens[idx];
    if (record.revokedAt) return { error: { status: 401, message: "Sessão encerrada" } };
    if (new Date(record.expiresAt) < new Date()) {
      db.refreshTokens[idx].revokedAt = new Date().toISOString();
      return { error: { status: 401, message: "Sessão expirada" } };
    }

    const user = db.users.find((u) => u.id === record.userId);
    if (!user) return { error: { status: 401, message: "Usuário não encontrado" } };

    db.refreshTokens[idx].revokedAt = new Date().toISOString();
    const rtResult = createRefreshToken(user.id, record.ip, db);
    addAuditLog(db, user, "auth.refresh", "auth", rtResult.sessionId, { prevSession: record.id });
    return { user, db, raw: rtResult.raw };
  });

  if (result?.error) return res.status(result.error.status).json({ error: result.error.message });
  const safeUser = sanitizeUser(result.user, result.db);
  const token = createToken(result.user, result.db);
  return res.json({ user: safeUser, token, refreshToken: result.raw });
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  const rawToken = String(req.body?.refreshToken || "").trim();
  await withDb((db) => {
    ensureDbShape(db);
    if (rawToken) {
      const hash = hashToken(rawToken);
      const idx = db.refreshTokens.findIndex(
        (t) => t.tokenHash === hash && t.userId === req.user.id
      );
      if (idx >= 0 && !db.refreshTokens[idx].revokedAt) {
        db.refreshTokens[idx].revokedAt = new Date().toISOString();
      }
    }
    addAuditLog(db, req.user, "auth.logout", "auth", req.user.id, {
      hadRefreshToken: Boolean(rawToken)
    });
  });
  return res.json({ ok: true });
});

export default router;
