import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, get } from "./helpers.js";

const TEST_BACKUP_KEY = process.env.BACKUP_EXPORT_KEY || "test-backup-key-for-integration-tests";

describe("Backup export endpoint", () => {
  let base;
  before(async () => { base = await startTestServer(); });
  after(stopTestServer);

  it("GET /admin/backup/export without key returns 403", async () => {
    const { status } = await get("/admin/backup/export");
    assert.equal(status, 403);
  });

  it("GET /admin/backup/export with wrong key returns 403", async () => {
    const res = await fetch(`${base}/admin/backup/export`, {
      headers: { "x-backup-key": "completely-wrong-key" }
    });
    assert.equal(res.status, 403);
  });

  it("GET /admin/backup/export with correct key returns valid backup JSON", async () => {
    const res = await fetch(`${base}/admin/backup/export`, {
      headers: { "x-backup-key": TEST_BACKUP_KEY }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.generatedAt, "Missing generatedAt");
    assert.ok(body.encryptedSnapshot !== undefined, "Missing encryptedSnapshot");
    assert.ok(body.driver === "file" || body.driver === "postgres", `Invalid driver: ${body.driver}`);
  });
});
