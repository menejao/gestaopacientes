import app from "./app.js";
import { PORT } from "./config.js";
import { migrateLegacyPlaintextPasswords, alignJoaoTeamOnStartup } from "./services/startup.js";
import { runMigrations } from "./migrations/runner.js";

async function startServer() {
  try {
    await runMigrations();
    await migrateLegacyPlaintextPasswords();
    await alignJoaoTeamOnStartup();
    app.listen(PORT, () => {
      console.log(`API rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Falha ao inicializar API:", error);
    process.exit(1);
  }
}

startServer();
