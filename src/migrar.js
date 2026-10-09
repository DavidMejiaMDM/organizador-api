const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

require("dotenv").config();
const mongoose = require("mongoose");
const Usuario = require("./models/Usuario");

async function migrar() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.log("Uso: node src/migrar.js tucorreo@ejemplo.com");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const usuario = await Usuario.findOne({ email });
  if (!usuario) {
    console.log(` No existe una cuenta con el correo ${email}. Regístrate primero.`);
    process.exit(1);
  }

  const db = mongoose.connection.db;
  const sinDueno = { usuarioId: { $exists: false } };
  const c = await db.collection("clases").updateMany(sinDueno, { $set: { usuarioId: usuario._id } });
  const t = await db.collection("tareas").updateMany(sinDueno, { $set: { usuarioId: usuario._id } });

  console.log(` ${c.modifiedCount} clases y ${t.modifiedCount} tareas ahora son de ${email}`);
  await mongoose.disconnect();
}

migrar().catch((e) => {
  console.error("error", e.message);
  process.exit(1);
});