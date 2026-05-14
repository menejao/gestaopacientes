import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../config.js";
import { canonicalRole, hasRole } from "../utils/helpers.js";

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token ausente" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });
    req.user = {
      ...payload,
      role: canonicalRole(payload.role),
      requestId: req.requestId || ""
    };
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

function requireManager(req, res, next) {
  if (!hasRole(req.user, ["nurse_manager"])) {
    return res.status(403).json({ error: "Somente enfermeira pode executar esta ação" });
  }
  return next();
}

function requireManagerOrDoctor(req, res, next) {
  if (!hasRole(req.user, ["nurse_manager", "doctor"])) {
    return res.status(403).json({ error: "Apenas enfermeira ou médica podem executar esta ação" });
  }
  return next();
}

function requireRoles(allowedRoles = [], errorMessage = "Sem permissão para esta ação") {
  return (req, res, next) => {
    if (!hasRole(req.user, allowedRoles)) {
      return res.status(403).json({ error: errorMessage });
    }
    return next();
  };
}

export { requireAuth, requireManager, requireManagerOrDoctor, requireRoles };
