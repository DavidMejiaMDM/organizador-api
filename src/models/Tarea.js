const mongoose = require("mongoose");

const TIPOS = ["TAREA", "PARCIAL", "TALLER"];

const tareaSchema = new mongoose.Schema(
  {
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true, index: true },
    claseId: { type: mongoose.Schema.Types.ObjectId, ref: "Clase", required: [true, "La asignatura es obligatoria"] },
    titulo: { type: String, required: [true, "El título es obligatorio"], trim: true },
    tipo: { type: String, enum: TIPOS, default: "TAREA" },
    fechaEntrega: { type: Date, required: [true, "La fecha de entrega es obligatoria"] },
    completada: { type: Boolean, default: false },
    porcentaje: { type: Number, min: 0, max: 100 },
    modalidad: { type: String, trim: true, default: "" },
    notas: { type: String, trim: true, default: "" },
  },
  { timestamps: true, collection: "tareas" }
);

tareaSchema.index({ claseId: 1, fechaEntrega: 1 });
tareaSchema.index({ completada: 1, fechaEntrega: 1 });

module.exports = mongoose.model("Tarea", tareaSchema);
module.exports.TIPOS = TIPOS;