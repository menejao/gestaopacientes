import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE, ACCESS_EXPIRES_IN, REFRESH_EXPIRES_MS } from "../config.js";
import { hashToken } from "./crypto.js";
import { canonicalRole } from "../utils/helpers.js";
import { getTeamNameById, ensureArray } from "../utils/domain.js";

function createToken(user, db) {
  return jwt.sign(
    {
      jti: uuidv4(),
      id: user.id,
      name: user.name,
      role: canonicalRole(user.role),
      email: user.email,
      teamId: user.teamId,
      teamName: getTeamNameById(db, user.teamId)
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: "HS256"
    }
  );
}

function createRefreshToken(userId, ip, db) {
  ensureArray(db, "refreshTokens");
  const raw = crypto.randomBytes(40).toString("hex");
  const record = {
    id: uuidv4(),
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS).toISOString(),
    createdAt: new Date().toISOString(),
    revokedAt: null,
    ip: String(ip || "")
  };
  db.refreshTokens.push(record);
  if (db.refreshTokens.length > 500) {
    const now = Date.now();
    db.refreshTokens = db.refreshTokens
      .filter((t) => !t.revokedAt && new Date(t.expiresAt).getTime() > now)
      .slice(-400);
    if (!db.refreshTokens.find((t) => t.id === record.id)) {
      db.refreshTokens.push(record);
    }
  }
  return { raw, sessionId: record.id };
}

export { createToken, createRefreshToken };
