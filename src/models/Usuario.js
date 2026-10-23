const mongoose = require("mongoose");

const usuarioSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: [true, "El nombre es obligatorio"], trim: true },
    email: {
      type: String,
      required: [true, "El correo es obligatorio"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    // Sube cada vez que se cambia la contraseña: los tokens emitidos con una versión anterior dejan de valer
    versionSesion: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "usuarios" }
);

module.exports = mongoose.model("Usuario", usuarioSchema);