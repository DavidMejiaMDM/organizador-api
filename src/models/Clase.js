const mongoose = require("mongoose");

const DIAS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/; // formato HH:mm

const horarioSchema = new mongoose.Schema(
  {
    diaSemana: { type: String, enum: DIAS, required: true },
    horaInicio: { type: String, required: true, match: REGEX_HORA },
    horaFin: { type: String, required: true, match: REGEX_HORA },
  },
  { _id: false }
);

const claseSchema = new mongoose.Schema(
  {
    nombreMateria: { type: String, required: [true, "El nombre de la materia es obligatorio"], trim: true },
    docente: { type: String, trim: true, default: "" },
    salon: { type: String, trim: true, default: "" },
    edificio: { type: String, trim: true, default: "" },
    periodo: { type: String, trim: true, default: "2026-2" },
    grupo: { type: String, trim: true, default: "" },
    jornada: { type: String, trim: true, default: "" },
    fechaInicio: { type: Date },
    fechaFin: { type: Date },
    color: { type: String, default: "#004A98" },
    horarios: {
      type: [horarioSchema],
      validate: [(h) => h.length > 0, "La clase debe tener al menos un horario"],
    },
  },
  { timestamps: true, collection: "clases" }
);

claseSchema.index({ "horarios.diaSemana": 1 });

module.exports = mongoose.model("Clase", claseSchema);
module.exports.DIAS = DIAS;