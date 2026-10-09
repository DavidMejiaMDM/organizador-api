const express = require("express");
const cors = require("cors");
const { noEncontrada, manejarErrores } = require("./middleware/errores");
const { requiereAuth } = require("./middleware/auth");

const app = express();

app.use(cors());
app.use(express.json());

// Rutas públicas
app.get("/", (req, res) => {
  res.json({
    servicio: "Organizador UA API",
    estado: "ok",
    rutas: { health: "/api/v1/health", registro: "/api/v1/auth/register", login: "/api/v1/auth/login" },
  });
});
app.get("/api/v1/health", (req, res) => {
  res.json({ estado: "ok", servicio: "Organizador UA API", hora: new Date() });
});
app.use("/api/v1/auth", require("./routes/authRoutes"));

// Rutas protegidas: solo con sesión iniciada
app.use("/api/v1/tasks", requiereAuth, require("./routes/tareaRoutes"));
app.use("/api/v1/clases", requiereAuth, require("./routes/claseRoutes"));

// Siempre al final
app.use(noEncontrada);
app.use(manejarErrores);

module.exports = app;