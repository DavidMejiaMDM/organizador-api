const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

async function requiereAuth(req, res, next) {
  try {
    const [tipo, token] = (req.headers.authorization || "").split(" ");
    if (tipo !== "Bearer" || !token) {
      return res.status(401).json({ error: "NO_AUTENTICADO", mensaje: "Debes iniciar sesión." });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "SESION_INVALIDA", mensaje: "Tu sesión expiró. Inicia sesión de nuevo." });
    }

    const usuario = await Usuario.findById(payload.sub).select("nombre email versionSesion");
    if (!usuario) {
      return res.status(401).json({ error: "SESION_INVALIDA", mensaje: "Tu cuenta ya no existe." });
    }

    // Token emitido antes de un cambio de contraseña (los tokens antiguos no traen "v": cuentan como 0)
    if ((payload.v || 0) !== (usuario.versionSesion || 0)) {
      return res.status(401).json({
        error: "SESION_INVALIDA",
        mensaje: "Tu sesión se cerró porque cambió la contraseña. Inicia sesión de nuevo.",
      });
    }

    req.usuario = usuario;
    req.usuarioId = usuario._id;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requiereAuth };