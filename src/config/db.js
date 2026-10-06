const mongoose = require("mongoose");
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

async function conectarDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(" MongoDB conectado");
  } catch (error) {
    console.error(" Error conectando a MongoDB:", error.message);
    process.exit(1);
  }
}

module.exports = conectarDB;