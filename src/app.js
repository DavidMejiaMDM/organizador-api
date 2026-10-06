const express = require("express");
const cors = require("cors");
const { noEncontrada, manejarErrores } = require("./middleware/errores");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/v1/health", (req, res) => {
  res.json({ estado: "ok", servicio: "Organizador UA API", hora: new Date() });
});

app.use("/api/v1/tasks", require("./routes/tareaRoutes"));


// Siempre al final
app.use("/api/v1/clases", require("./routes/claseRoutes"));
app.use(noEncontrada);
app.use(manejarErrores);

module.exports = app;