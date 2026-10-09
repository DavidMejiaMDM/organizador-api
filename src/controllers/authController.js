const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");
const Clase = require("../models/Clase");
const Tarea = require("../models/Tarea");

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const error = (res, status, codigo, mensaje, campo) =>
  res.status(status).json({ error: codigo, mensaje, ...(campo && { campo }) });

const firmar = (u) =>
  jwt.sign({ sub: u._id.toString() }, process.env.JWT_SECRET, {
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