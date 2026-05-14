import express from "express";
import { readDb } from "../db.js";
import { requireManagerOrDoctor } from "../middlewares/auth.js";
import { ensureDbShape } from "../utils/domain.js";

const router = express.Router();

router.get("/audit-logs", requireManagerOrDoctor, async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);

  const patientId = req.query.patientId ? String(req.query.patientId) : "";

  const logs = db.auditLogs
    .filter((log) => {
      if (!patientId) return true;
      if (log.entity === "patient" && log.entityId === patientId) return true;
      if (log.details && log.details.patientId === patientId) return true;
      return false;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return res.json(logs.slice(0, 200));
});

router.get("/audit-logs/export", requireManagerOrDoctor, async (req, res) => {
  const db = await readDb();
  ensureDbShape(db);
  const format = String(req.query.format || "json").trim().toLowerCase();
  const patientId = req.query.patientId ? String(req.query.patientId) : "";
  const logs = db.auditLogs
    .filter((log) => {
      if (!patientId) return true;
      if (log.entity === "patient" && log.entityId === patientId) return true;
      if (log.details && log.details.patientId === patientId) return true;
      return false;
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  if (format === "csv") {
    const header = "id,createdAt,action,entity,entityId,userId,userName,userRole,requestId,prevHash,hash";
    const lines = logs.map((item) => ([
      item.id,
      item.createdAt,
      item.action,
      item.entity,
      item.entityId,
      item.userId,
      item.userName,
      item.userRole,
      item.requestId || "",
      item.prevHash || "",
      item.hash || ""
    ].map((value) => `"${String(value || "").replace(/"/g, "\"\"")}"`).join(",")));
    const csv = [header, ...lines].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  }

  return res.json({
    generatedAt: new Date().toISOString(),
    total: logs.length,
    items: logs
  });
});

export default router;
