const mongoose = require("mongoose");
const Tarea = require("../models/Tarea");
const Clase = require("../models/Clase");

const CAMPOS_PERMITIDOS = ["claseId", "titulo", "tipo", "fechaEntrega", "completada", "porcentaje", "modalidad", "notas"];
const HORA_MS = 60 * 60 * 1000;

// ---------- Utilidades ----------
const idValido = (id) => mongoose.Types.ObjectId.isValid(id);

const error = (res, status, codigo, mensaje, campo) =>
  res.status(status).json({ error: codigo, mensaje, ...(campo && { campo }) });

// Selecciona solo los campos permitidos del body
const filtrarCampos = (body) =>
  Object.fromEntries(Object.entries(body).filter(([k]) => CAMPOS_PERMITIDOS.includes(k)));

// REGLA DE NEGOCIO: devuelve un mensaje de error si la fecha no es válida o es pasada
function validarFecha(valor) {
  const fecha = new Date(valor);
  if (isNaN(fecha.getTime())) {
    return { codigo: "FORMATO_FECHA", mensaje: "La fecha de entrega no tiene un formato válido." };
  }
  if (fecha < new Date()) {
    return { codigo: "FECHA_PASADA", mensaje: "No puedes programar una entrega con fecha en el pasado. Elige una fecha futura." };
  }
  return null;
}

// Da forma a la respuesta: claseId como texto + objeto clase + indicador de urgencia
function formatear(doc) {
  const t = doc.toObject();
  const clase = t.claseId && t.claseId._id ? t.claseId : null;
  const msRestantes = new Date(t.fechaEntrega) - new Date();
  return {
    ...t,
    claseId: clase ? clase._id : t.claseId,
    clase,
    horasRestantes: Math.round((msRestantes / HORA_MS) * 10) / 10,
    urgente: !t.completada && msRestantes > 0 && msRestantes <= 24 * HORA_MS,
  };
}

const POPULATE_CLASE = { path: "claseId", select: "nombreMateria color docente salon edificio" };

// ---------- GET /tasks ----------
exports.listar = async (req, res, next) => {
  try {
    const { classId, estado, tipo, urgentes } = req.query;
    const filtro = {};

    if (classId) {
      if (!idValido(classId)) return error(res, 400, "DATO_INVALIDO", "classId no es válido", "classId");
      filtro.claseId = classId;
    }
    if (estado === "pendiente") filtro.completada = false;
    if (estado === "completada") filtro.completada = true;
    if (tipo) filtro.tipo = tipo.toUpperCase();

    // Alerta de proximidad: pendientes que vencen en las próximas 24 horas
    if (urgentes === "true") {
      const ahora = new Date();
      filtro.completada = false;
      filtro.fechaEntrega = { $gte: ahora, $lte: new Date(ahora.getTime() + 24 * HORA_MS) };
    }

    const tareas = await Tarea.find(filtro).populate(POPULATE_CLASE).sort({ fechaEntrega: 1 });
    res.json(tareas.map(formatear));
  } catch (err) { next(err); }
};

// ---------- GET /tasks/:id ----------
exports.obtener = async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return error(res, 400, "DATO_INVALIDO", "El id no es válido", "id");
    const tarea = await Tarea.findById(req.params.id).populate(POPULATE_CLASE);
    if (!tarea) return error(res, 404, "NO_ENCONTRADA", "La tarea no existe");
    res.json(formatear(tarea));
  } catch (err) { next(err); }
};

// ---------- POST /tasks ----------
exports.crear = async (req, res, next) => {
  try {
    const datos = filtrarCampos(req.body);

    if (!datos.titulo || !datos.titulo.trim()) return error(res, 400, "VALIDACION", "El título es obligatorio", "titulo");
    if (!datos.claseId || !idValido(datos.claseId)) return error(res, 400, "VALIDACION", "La asignatura es obligatoria", "claseId");
    if (!datos.fechaEntrega) return error(res, 400, "VALIDACION", "La fecha de entrega es obligatoria", "fechaEntrega");

    // Regla de negocio: bloqueo de fechas pasadas
    const problema = validarFecha(datos.fechaEntrega);
    if (problema) return error(res, 400, problema.codigo, problema.mensaje, "fechaEntrega");

    if (!(await Clase.exists({ _id: datos.claseId }))) {
      return error(res, 404, "CLASE_NO_ENCONTRADA", "La asignatura indicada no existe", "claseId");
    }

    const tarea = await Tarea.create(datos);
    await tarea.populate(POPULATE_CLASE);
    res.status(201).json(formatear(tarea));
  } catch (err) { next(err); }
};

// ---------- PUT /tasks/:id ----------
exports.actualizar = async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return error(res, 400, "DATO_INVALIDO", "El id no es válido", "id");
    const tarea = await Tarea.findById(req.params.id);
    if (!tarea) return error(res, 404, "NO_ENCONTRADA", "La tarea no existe");

    const datos = filtrarCampos(req.body);

    // Solo validamos la fecha si realmente cambió. Así se puede marcar como
    // completada o editar el título de una tarea que ya venció.
    if (datos.fechaEntrega !== undefined) {
      const nueva = new Date(datos.fechaEntrega);
      const cambio = isNaN(nueva.getTime()) || nueva.getTime() !== tarea.fechaEntrega.getTime();
      if (cambio) {
        const problema = validarFecha(datos.fechaEntrega);
        if (problema) return error(res, 400, problema.codigo, problema.mensaje, "fechaEntrega");
      }
    }

    if (datos.claseId !== undefined) {
      if (!idValido(datos.claseId) || !(await Clase.exists({ _id: datos.claseId }))) {
        return error(res, 404, "CLASE_NO_ENCONTRADA", "La asignatura indicada no existe", "claseId");
      }
    }

    tarea.set(datos);
    await tarea.save();
    await tarea.populate(POPULATE_CLASE);
    res.json(formatear(tarea));
  } catch (err) { next(err); }
};

// ---------- PATCH /tasks/:id/completar ----------
exports.completar = async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return error(res, 400, "DATO_INVALIDO", "El id no es válido", "id");
    const tarea = await Tarea.findById(req.params.id);
    if (!tarea) return error(res, 404, "NO_ENCONTRADA", "La tarea no existe");

    tarea.completada = req.body.completada === undefined ? true : Boolean(req.body.completada);
    await tarea.save();
    await tarea.populate(POPULATE_CLASE);
    res.json(formatear(tarea));
  } catch (err) { next(err); }
};

// ---------- DELETE /tasks/:id ----------
exports.eliminar = async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return error(res, 400, "DATO_INVALIDO", "El id no es válido", "id");
    const tarea = await Tarea.findByIdAndDelete(req.params.id);
    if (!tarea) return error(res, 404, "NO_ENCONTRADA", "La tarea no existe");
    res.status(204).send();
  } catch (err) { next(err); }
};