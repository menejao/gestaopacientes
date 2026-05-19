import app from "./app.js";
import { PORT } from "./config.js";
import { migrateLegacyPlaintextPasswords, alignJoaoTeamOnStartup } from "./services/startup.js";
import { seedDemoTeamRosa } from "./services/seed-demo.js";
import { runMigrations } from "./migrations/runner.js";

function withTimeout(label, promise, ms = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[startup] TIMEOUT após ${ms}ms em: ${label}`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

async function startServer() {
  try {
    console.log("[startup] iniciando servidor");

    console.log("[startup] runMigrations — início");
    await withTimeout("runMigrations", runMigrations());
    console.log("[startup] runMigrations — OK");

    console.log("[startup] migrateLegacyPlaintextPasswords — início");
    await withTimeout("migrateLegacyPlaintextPasswords", migrateLegacyPlaintextPasswords());
    console.log("[startup] migrateLegacyPlaintextPasswords — OK");

    console.log("[startup] alignJoaoTeamOnStartup — início");
    await withTimeout("alignJoaoTeamOnStartup", alignJoaoTeamOnStartup());
    console.log("[startup] alignJoaoTeamOnStartup — OK");

    if (process.env.SEED_DEMO_DATA === "true") {
      console.log("[startup] seedDemoTeamRosa — início");
      await withTimeout("seedDemoTeamRosa", seedDemoTeamRosa());
      console.log("[startup] seedDemoTeamRosa — OK");
    }

    console.log("[startup] app.listen — chamando");
    app.listen(PORT, () => {
      console.log(`[startup] app.listen — OK — API rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Falha ao inicializar API:", error);
    process.exit(1);
  }
}

startServer();
