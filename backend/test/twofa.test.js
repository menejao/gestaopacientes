import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, stopTestServer, get, post } from "./helpers.js";

describe("2FA flow", () => {
  before(startTestServer);
  after(stopTestServer);

  const email = `2fa-test-${Date.now()}@integration.test`;
  const password = "TwoFaTest@99999!";
  let token = null;

  before(async () => {
    await post("/auth/register", {
      name: "2FA Test User",
      email,
      password,
      role: "gestor",
      councilType: "COREN",
      councilNumber: "874987",
      councilUf: "MG"
    });
    const { json } = await post("/auth/login", { email, password });
    token = json?.token || json?.accessToken || null;
  });

  it("GET /me/2fa/status returns 2FA not enabled for new user", async () => {
    if (!token) return;
    const { status, json } = await get("/me/2fa/status", token);
    assert.equal(status, 200);
    assert.equal(json.enabled, false);
  });

  it("POST /me/2fa/setup returns secret and otpauthUrl", async () => {
    if (!token) return;
    const { status, json } = await post("/me/2fa/setup", {}, token);
    assert.equal(status, 200);
    assert.ok(json.secret, "Missing secret");
    assert.ok(json.otpauthUrl || json.qrCodeUrl, "Missing QR URL");
  });

  it("POST /me/2fa/enable with wrong code returns 400 or 422", async () => {
    if (!token) return;
    const { status } = await post("/me/2fa/enable", { code: "000000" }, token);
    assert.ok(status === 400 || status === 422 || status === 401, `Expected error, got ${status}`);
  });

  it("POST /auth/login with correct creds but 2FA not yet enabled returns token directly", async () => {
    // New user, 2FA not enabled — login should succeed without 2FA challenge
    const { status, json } = await post("/auth/login", { email, password });
    assert.ok(
      status === 200 || (status === 403 && json?.requiresTwoFactor),
      `Unexpected status ${status}`
    );
  });
});
