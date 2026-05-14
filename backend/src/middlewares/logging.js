import crypto from "node:crypto";
import { REQUEST_LOG_ENABLED } from "../config.js";
import { getClientIp } from "../utils/helpers.js";

function requestLoggingMiddleware(req, res, next) {
  req.requestId = crypto.randomUUID();
  req.requestStartedAt = Date.now();
  res.setHeader("X-Request-Id", req.requestId);

  res.on("finish", () => {
    if (!REQUEST_LOG_ENABLED) return;
    const durationMs = Date.now() - req.requestStartedAt;
    const safeUserId = req.user?.id || "-";
    const ip = getClientIp(req);
    console.log(
      `[req:${req.requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms user=${safeUserId} ip=${ip}`
    );
  });

  next();
}

export { requestLoggingMiddleware };
