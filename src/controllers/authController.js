const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");
const Clase = require("../models/Clase");
const Tarea = require("../models/Tarea");
const CodigoRecuperacion = require("../models/CodigoRecuperacion");
const { enviarCodigoRecuperacion } = require("../services/correo");

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Solo se permiten correos institucionales.
// Si algún día cambia el dominio, se puede definir DOMINIO_PERMITIDO en el .env / en Render.
const DOMINIO = (process.env.DOMINIO_PERMITIDO || "uniautonoma.edu.co").trim().toLowerCase();

// ---- Recuperación de contraseña ----
const CODIGO_VIGENCIA_MS = 10 * 60 * 1000;   // el código vale 10 minutos
const ENFRIAMIENTO_MS = 60 * 1000;           // mínimo 60 s entre un envío y el siguiente
const VENTANA_ENVIOS_MS = 60 * 60 * 1000;    // los envíos se cuentan por hora
const MAX_ENVIOS_POR_HORA = 5;
const MAX_INTENTOS_CODIGO = 5;               // intentos de usar un mismo código
const MENSAJE_ENVIO = "Si el correo está registrado, te enviamos un código de 6 dígitos. Vence en 10 minutos.";

const error = (res, status, codigo, mensaje, campo) =>
  res.status(status).json({ error: codigo, mensaje, ...(campo && { campo }) });

// "v" es la versión de sesión: si la persona cambia su contraseña, sube, y los tokens viejos dejan de valer
const firmar = (u) =>
  jwt.sign({ sub: u._id.toString(), v: u.versionSesion || 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || "30d",
  });

const publico = (u) => ({ id: u._id, nombre: u.nombre, email: u.email });

// El código se guarda como HMAC (con el secreto del servidor): ni la base de datos lo revela
const hashCodigo = (email, codigo) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${email}:${codigo}`).digest("hex");

const coincide = (a, b) => {
  const x = Buffer.from(String(a), "hex");
  const y = Buffer.from(String(b), "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

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
    await CodigoRecuperacion.deleteOne({ email: usuario.email });   // un código pendiente ya no sirve

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

// POST /auth/forgot-password  -> envía un código de 6 dígitos al correo
// Responde SIEMPRE lo mismo, exista o no el correo, para no revelar quién tiene cuenta.
exports.olvidePassword = async (req, res, next) => {
  const respuesta = () =>
    res.json({ mensaje: MENSAJE_ENVIO, reenviarEnSegundos: ENFRIAMIENTO_MS / 1000 });

  try {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    if (!REGEX_EMAIL.test(email)) return error(res, 400, "VALIDACION", "Escribe un correo válido", "email");

    const usuario = await Usuario.findOne({ email });
    if (!usuario) return respuesta();

    const ahora = new Date();
    let reg = await CodigoRecuperacion.findOne({ email });
    if (reg) {
      if (ahora - reg.ventanaInicio > VENTANA_ENVIOS_MS) {   // empieza una hora nueva
        reg.ventanaInicio = ahora;
        reg.envios = 0;
      }
      if (ahora - reg.ultimoEnvio < ENFRIAMIENTO_MS) return respuesta();   // demasiado pronto
      if (reg.envios >= MAX_ENVIOS_POR_HORA) return respuesta();            // tope por hora
    } else {
      reg = new CodigoRecuperacion({ email, ventanaInicio: ahora, envios: 0 });
    }

    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    reg.codigoHash = hashCodigo(email, codigo);
    reg.expiraEn = new Date(ahora.getTime() + CODIGO_VIGENCIA_MS);
    reg.intentos = 0;
    reg.ultimoEnvio = ahora;
    reg.envios += 1;
    reg.borrarEn = new Date(ahora.getTime() + VENTANA_ENVIOS_MS);
    await reg.save();

    // No se espera el envío: así la respuesta tarda lo mismo exista o no el correo
    enviarCodigoRecuperacion({ destino: email, nombre: usuario.nombre, codigo }).catch((e) =>
      console.error("❌ No se pudo enviar el código de recuperación:", e.message)
    );

    return respuesta();
  } catch (err) {
    if (err && err.code === 11000) return respuesta();   // dos peticiones a la vez para el mismo correo
    next(err);
  }
};

// POST /auth/reset-password  -> cambia la contraseña con el código recibido y deja la sesión iniciada
exports.restablecerPassword = async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    const codigo = String(body.codigo || "").trim();
    const nueva = String(body.passwordNueva || "");

    // Estas validaciones no gastan intentos del código
    if (!REGEX_EMAIL.test(email)) return error(res, 400, "VALIDACION", "Escribe un correo válido", "email");
    if (!/^\d{6}$/.test(codigo)) return error(res, 400, "VALIDACION", "Escribe el código de 6 dígitos", "codigo");
    if (nueva.length < 8) {
      return error(res, 400, "VALIDACION", "La nueva contraseña debe tener al menos 8 caracteres", "passwordNueva");
    }

    const invalido = () =>
      error(res, 400, "CODIGO_INVALIDO", "El código no es correcto o ya venció. Pide uno nuevo.", "codigo");

    // Se consume un intento de forma atómica ANTES de comparar: con muchas peticiones simultáneas
    // solo las primeras MAX_INTENTOS_CODIGO llegan a comparar el código.
    const reg = await CodigoRecuperacion.findOneAndUpdate(
      { email, expiraEn: { $gt: new Date() }, intentos: { $lt: MAX_INTENTOS_CODIGO } },
      { $inc: { intentos: 1 } },
      { new: true }
    );
    if (!reg || !coincide(reg.codigoHash, hashCodigo(email, codigo))) return invalido();

    const usuario = await Usuario.findOne({ email });
    if (!usuario) return invalido();

    usuario.passwordHash = await bcrypt.hash(nueva, 10);
    usuario.versionSesion = (usuario.versionSesion || 0) + 1;   // cierra todas las sesiones anteriores
    await usuario.save();
    await CodigoRecuperacion.deleteOne({ email });               // el código solo sirve una vez

    res.json({
      token: firmar(usuario),
      usuario: publico(usuario),
      mensaje: "Contraseña restablecida. Se cerraron las demás sesiones.",
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
    await CodigoRecuperacion.deleteOne({ email: req.usuario.email });
    await Usuario.deleteOne({ _id: req.usuarioId });
    res.json({ mensaje: "Cuenta eliminada" });
  } catch (err) {
    next(err);
  }
};