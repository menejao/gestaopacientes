import app from "./app.js";
import { PORT } from "./config.js";
import { migrateLegacyPlaintextPasswords } from "./services/startup.js";

async function startServer() {
  try {
    await migrateLegacyPlaintextPasswords();
    app.listen(PORT, () => {
      console.log(`API rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Falha ao inicializar API com seguranca de credenciais:", error);
    process.exit(1);
  }
}

startServer();
