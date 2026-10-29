const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");
const Clase = require("../models/Clase");
const Tarea = require("../models/Tarea");

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Esta restringido Solo para correos institucionales.
// NOTA: para cambiar el dominio, se puede definir DOMINIO_PERMITIDO en el .env como en el Render.
const DOMINIO = (process.env.DOMINIO_PERMITIDO || "uniautonoma.edu.co").trim().toLowerCase();

const error = (res, status, codigo, mensaje, campo) =>
  res.status(status).json({ error: codigo, mensaje, ...(campo && { campo }) });

// "v" se usa para la versión de sesión: si la persona cambia su contraseña, sube, y los tokens viejos dejan de valer
const firmar = (u) =>
  jwt.sign({ sub: u._id.toString(), v: u.versionSesion || 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || "30d",
  });

const publico = (u) => ({ id: u._id, nombre: u.nombre, email: u.email });

// POST /auth/register
exports.registrar = async (req, res, next) => {
  try {
    const body = req.body || {};
    const nombre = String(body.nombre || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (nombre.length < 2) return error(res, 400, "VALIDACION", "Escribe tu nombre", "nombre");
    if (!REGEX_EMAIL.test(email)) return error(res, 400, "VALIDACION", "Escribe un correo válido", "email");

    // REGLA DE NEGOCIO: solo correos institucionales.
    // REGEX_EMAIL garantiza una única "@", así que lo que sigue es el dominio completo
    // (rechaza "x@uniautonoma.edu.co.otro.com" y subdominios como "x@sub.uniautonoma.edu.co").
    if (email.split("@")[1] !== DOMINIO) {
      return error(
        res, 400, "CORREO_NO_INSTITUCIONAL",
        `Solo se permiten correos institucionales (@${DOMINIO})`, "email"
      );
    }

    if (password.length < 8) {
      return error(res, 400, "VALIDACION", "La contraseña debe tener al menos 8 caracteres", "password");
    }
    if (await Usuario.exists({ email })) {
      return error(res, 409, "EMAIL_REGISTRADO", "Ya existe una cuenta con ese correo", "email");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const usuario = await Usuario.create({ nombre, email, passwordHash });
    res.status(201).json({ token: firmar(usuario), usuario: publico(usuario) });
  } catch (err) {
    next(err);
  }
};

// POST /auth/login
// (el inicio de sesión NO exige el dominio: las cuentas creadas antes de esa regla siguen funcionando)
exports.entrar = async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!email || !password) {
      return error(res, 400, "VALIDACION", "Escribe tu correo y tu contraseña");
    }

    const usuario = await Usuario.findOne({ email });
    const correcta = usuario ? await bcrypt.compare(password, usuario.passwordHash) : false;
    // Mismo mensaje si falla el correo o la contraseña: no revela cuál de los dos está mal
    if (!correcta) return error(res, 401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos");

    res.json({ token: firmar(usuario), usuario: publico(usuario) });
  } catch (err) {
    next(err);
  }
};

// GET /auth/me
exports.yo = (req, res) => res.json(publico(req.usuario));

// PATCH /auth/me  -> cambia el nombre (el correo no se puede cambiar)
exports.actualizarPerfil = async (req, res, next) => {
  try {
    const nombre = String((req.body || {}).nombre || "").trim().replace(/\s+/g, " ");

    if (nombre.length < 2) return error(res, 400, "VALIDACION", "Escribe tu nombre", "nombre");
    if (nombre.length > 60) {
      return error(res, 400, "VALIDACION", "El nombre no puede tener más de 60 caracteres", "nombre");
    }

    const usuario = await Usuario.findByIdAndUpdate(req.usuarioId, { nombre }, { new: true });
    if (!usuario) return error(res, 404, "NO_ENCONTRADA", "La cuenta no existe");

    res.json({ usuario: publico(usuario) });
  } catch (err) {
    next(err);
  }
};

// PUT /auth/password  -> cambia la contraseña y cierra las demás sesiones
exports.cambiarPassword = async (req, res, next) => {
  try {
    const body = req.body || {};
    const actual = String(body.passwordActual || "");
    const nueva = String(body.passwordNueva || "");

    if (!actual) return error(res, 400, "VALIDACION", "Escribe tu contraseña actual", "passwordActual");
    if (nueva.length < 8) {
      return error(res, 400, "VALIDACION", "La nueva contraseña debe tener al menos 8 caracteres", "passwordNueva");
    }
    if (nueva === actual) {
      return error(res, 400, "VALIDACION", "La nueva contraseña debe ser distinta a la actual", "passwordNueva");
    }

    const usuario = await Usuario.findById(req.usuarioId);
    if (!usuario) return error(res, 404, "NO_ENCONTRADA", "La cuenta no existe");

    // Se responde 400 y NO 401: un 401 haría que la app interprete "sesión vencida" y cierre la sesión
    if (!(await bcrypt.compare(actual, usuario.passwordHash))) {
      return error(res, 400, "CLAVE_ACTUAL_INCORRECTA", "La contraseña actual no es correcta", "passwordActual");
    }

    usuario.passwordHash = await bcrypt.hash(nueva, 10);
    usuario.versionSesion = (usuario.versionSesion || 0) + 1;   // invalida los tokens anteriores
    await usuario.save();

    // Token nuevo para el dispositivo que hizo el cambio: este sigue dentro
    res.json({
      token: firmar(usuario),
      usuario: publico(usuario),
      mensaje: "Contraseña actualizada. Se cerraron las demás sesiones.",
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /auth/me  (borra la cuenta y todos sus datos)
exports.eliminarCuenta = async (req, res, next) => {
  try {
    await Tarea.deleteMany({ usuarioId: req.usuarioId });
    await Clase.deleteMany({ usuarioId: req.usuarioId });
    await Usuario.deleteOne({ _id: req.usuarioId });
    res.json({ mensaje: "Cuenta eliminada" });
  } catch (err) {
    next(err);
  }
};