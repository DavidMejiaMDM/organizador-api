const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("Falta JWT_SECRET (mínimo 32 caracteres). Agrégala al archivo .env");
  process.exit(1);
}

const app = require("./src/app");
const conectarDB = require("./src/config/db");

const PORT = process.env.PORT || 3000;

conectarDB().then(() => {
  app.listen(PORT, () => {
    console.log(`API corriendo en http://localhost:${PORT}/api/v1`);
  });
});