import express from "express";
import { setupHelmet, setupCors, securityHeadersMiddleware, contentTypeMiddleware } from "./middlewares/security.js";
import { requestLoggingMiddleware } from "./middlewares/logging.js";
import { globalRateLimit } from "./middlewares/rate-limits.js";
import { requireAuth } from "./middlewares/auth.js";
import { globalErrorHandler } from "./middlewares/errors.js";

import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import meRouter from "./routes/me.js";
import usersRouter from "./routes/users.js";
import patientsRouter from "./routes/patients.js";
import tasksRouter from "./routes/tasks.js";
import protocolsRouter from "./routes/protocols.js";
import auditLogsRouter from "./routes/audit-logs.js";
import privacyRouter from "./routes/privacy.js";
import aiRouter from "./routes/ai.js";
import adminRouter from "./routes/admin.js";

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

setupHelmet(app);
setupCors(app);

app.use(securityHeadersMiddleware);
app.use(contentTypeMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(requestLoggingMiddleware);
app.use(globalRateLimit);

app.use(healthRouter);
app.use(authRouter);
app.use(adminRouter);
app.use(usersRouter);

app.use(requireAuth);
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(meRouter);
app.use(patientsRouter);
app.use(tasksRouter);
app.use(protocolsRouter);
app.use(auditLogsRouter);
app.use(privacyRouter);
app.use(aiRouter);

app.use(globalErrorHandler);

export default app;
