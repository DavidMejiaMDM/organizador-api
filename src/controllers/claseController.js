const mongoose = require("mongoose");
const { DateTime } = require("luxon");
const pdfParse = require("pdf-parse");
const Clase = require("../models/Clase");
const Tarea = require("../models/Tarea");
const { parsearHorario, normalizar } = require("../utils/parserHorario");

const { DIAS } = Clase;
const ZONA = "America/Bogota";
const CAMPOS_PERMITIDOS = ["nombreMateria", "docente", "salon", "edificio", "periodo", "color", "horarios"];

// ---------- Utilidades ----------
const idValido = (id) => mongoose.Types.ObjectId.isValid(id);
const error = (res, status, codigo, mensaje, campo) =>
  res.status(status).json({ error: codigo, mensaje, ...(campo && { campo }) });

const aMinutos = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

const normalizarDia = (texto) =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

const filtrarCampos = (body) =>
  Object.fromEntries(Object.entries(body || {}).filter(([k]) => CAMPOS_PERMITIDOS.includes(k)));

function validarHorarios(horarios) {
  if (!Array.isArray(horarios)) return null;
  for (const h of horarios) {
    if (typeof h.horaInicio === "string" && typeof h.horaFin === "string" &&
        aMinutos(h.horaFin) <= aMinutos(h.horaInicio)) {
      return `La hora de fin debe ser posterior a la de inicio (${h.diaSemana} ${h.horaInicio}-${h.horaFin})`;
    }
  }
  return null;
}

// ---------- GET /clases  (opcional ?dia=miercoles) ----------
exports.listar = async (req, res, next) => {
  try {
    const { dia } = req.query;
    const base = { usuarioId: req.usuarioId };

    if (!dia) {
      const clases = await Clase.find(base).sort({ nombreMateria: 1 });
      return res.json(clases);
    }

    const diaNorm = normalizarDia(dia);
    if (!DIAS.includes(diaNorm)) return error(res, 400, "DATO_INVALIDO", "El día no es válido", "dia");

    const clases = await Clase.find({ ...base, "horarios.diaSemana": diaNorm });
    const sesiones = clases
      .map((c) => ({ ...c.toObject(), sesion: c.horarios.find((h) => h.diaSemana === diaNorm) }))
      .sort((a, b) => aMinutos(a.sesion.horaInicio) - aMinutos(b.sesion.horaInicio));
    res.json(sesiones);
  } catch (err) { next(err); }
};

// ---------- GET /clases/today  (opcional ?simular=2026-10-07T10:30) ----------
exports.hoy = async (req, res, next) => {
  try {
    const usuarioId = req.usuarioId;
    let ahora = DateTime.now().setZone(ZONA);

    if (req.query.simular) {
      const sim = DateTime.fromISO(req.query.simular, { zone: ZONA });
      if (!sim.isValid) return error(res, 400, "FORMATO_FECHA", "El parámetro simular no es válido", "simular");
      ahora = sim;
    }

    const dia = DIAS[ahora.weekday - 1];
    const minAhora = ahora.hour * 60 + ahora.minute;

    const clases = await Clase.find({ usuarioId, "horarios.diaSemana": dia });

    const sesiones = clases
      .flatMap((c) =>
        c.horarios
          .filter((h) => h.diaSemana === dia)
          .map((h) => ({
            claseId: c._id,
            nombreMateria: c.nombreMateria,
            docente: c.docente,
            salon: c.salon,
            edificio: c.edificio,
            color: c.color,
            diaSemana: h.diaSemana,
            horaInicio: h.horaInicio,
            horaFin: h.horaFin,
            inicioMin: aMinutos(h.horaInicio),
            finMin: aMinutos(h.horaFin),
          }))
      )
      .sort((a, b) => a.inicioMin - b.inicioMin);

    const clasesHoy = sesiones.map(({ inicioMin, finMin, ...s }) => ({
      ...s,
      estado: finMin <= minAhora ? "PASADA" : inicioMin <= minAhora ? "EN_CURSO" : "PROXIMA",
    }));

    const actual = sesiones.find((s) => s.inicioMin <= minAhora && minAhora < s.finMin);
    const proxima = sesiones.find((s) => s.inicioMin > minAhora);

    let claseActual = null;
    if (actual) {
      const duracion = actual.finMin - actual.inicioMin;
      const { inicioMin, finMin, ...datos } = actual;
      claseActual = {
        ...datos,
        minutosRestantes: finMin - minAhora,
        progreso: Math.round(((minAhora - inicioMin) / duracion) * 100),
        tareasPendientes: await Tarea.countDocuments({ claseId: actual.claseId, usuarioId, completada: false }),
      };
    }

    let proximaClase = null;
    if (proxima) {
      const { inicioMin, finMin, ...datos } = proxima;
      proximaClase = { ...datos, minutosParaInicio: inicioMin - minAhora };
    }

    let estadoDia;
    if (claseActual) estadoDia = "EN_CURSO";
    else if (proximaClase) estadoDia = "ENTRE_CLASES";
    else if (clasesHoy.length > 0) estadoDia = "TERMINADO";
    else estadoDia = (await Clase.countDocuments({ usuarioId })) === 0 ? "SIN_HORARIO" : "SIN_CLASES";

    res.json({ ahora: ahora.toISO(), diaSemana: dia, estadoDia, claseActual, proximaClase, clasesHoy });
  } catch (err) { next(err); }
};

// ---------- GET /clases/:id  (clase + sus tareas) ----------
exports.obtener = async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return error(res, 400, "DATO_INVALIDO", "El id no es válido", "id");
    const clase = await Clase.findOne({ _id: req.params.id, usuarioId: req.usuarioId });
    if (!clase) return error(res, 404, "NO_ENCONTRADA", "La asignatura no existe");

    const tareas = await Tarea.find({ claseId: clase._id, usuarioId: req.usuarioId }).sort({ fechaEntrega: 1 });
    res.json({
      ...clase.toObject(),
      tareas,
      totalTareas: tareas.length,
      tareasPendientes: tareas.filter((t) => !t.completada).length,
    });
  } catch (err) { next(err); }
};

// ---------- POST /clases  (agregar clase manualmente) ----------
exports.crear = async (req, res, next) => {
  try {
    const datos = filtrarCampos(req.body);
    const problema = validarHorarios(datos.horarios);
    if (problema) return error(res, 400, "HORARIO_INVALIDO", problema, "horarios");

    const clase = await Clase.create({ ...datos, usuarioId: req.usuarioId });
    res.status(201).json(clase);
  } catch (err) { next(err); }
};

// ---------- PUT /clases/:id ----------
exports.actualizar = async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return error(res, 400, "DATO_INVALIDO", "El id no es válido", "id");
    const clase = await Clase.findOne({ _id: req.params.id, usuarioId: req.usuarioId });
    if (!clase) return error(res, 404, "NO_ENCONTRADA", "La asignatura no existe");

    const datos = filtrarCampos(req.body);
    const problema = validarHorarios(datos.horarios);
    if (problema) return error(res, 400, "HORARIO_INVALIDO", problema, "horarios");

    clase.set(datos);
    await clase.save();
    res.json(clase);
  } catch (err) { next(err); }
};

// ---------- DELETE /clases/:id  (borra también sus tareas) ----------
exports.eliminar = async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return error(res, 400, "DATO_INVALIDO", "El id no es válido", "id");
    const clase = await Clase.findOneAndDelete({ _id: req.params.id, usuarioId: req.usuarioId });
    if (!clase) return error(res, 404, "NO_ENCONTRADA", "La asignatura no existe");

    const { deletedCount } = await Tarea.deleteMany({ claseId: clase._id, usuarioId: req.usuarioId });
    res.json({ mensaje: "Asignatura eliminada", tareasEliminadas: deletedCount });
  } catch (err) { next(err); }
};

// ---------- POST /clases/upload  (PDF de Moodle) ----------
// ?guardar=false   -> solo vista previa, no guarda
// ?reemplazar=true -> borra TUS clases y tareas antes de guardar
// ?debug=true      -> devuelve el texto leído del PDF
exports.subirPDF = async (req, res, next) => {
  try {
    const usuarioId = req.usuarioId;

    if (!req.file) {
      return error(res, 400, "ARCHIVO_REQUERIDO", "Debes adjuntar un archivo PDF en el campo 'pdf'", "pdf");
    }

    let texto, paginas;
    try {
      const lectura = await pdfParse(req.file.buffer);
      texto = lectura.text || "";
      paginas = lectura.numpages;
    } catch {
      return error(res, 422, "PDF_ILEGIBLE", "No pudimos leer el PDF. Verifica que sea el horario de Moodle.", "pdf");
    }

    if (req.query.debug === "true") {
      const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      return res.json({ paginas, totalLineas: lineas.length, lineas: lineas.slice(0, 300) });
    }

    const detectadas = parsearHorario(texto);
    if (detectadas.length === 0) {
      return error(
        res, 422, "SIN_CLASES_DETECTADAS",
        "No encontramos clases en el PDF. Verifica que sea el horario correcto o agrégalas manualmente.", "pdf"
      );
    }

    if (req.query.guardar === "false") {
      return res.json({ guardado: false, total: detectadas.length, clases: detectadas });
    }

    if (req.query.reemplazar === "true") {
      await Tarea.deleteMany({ usuarioId });
      await Clase.deleteMany({ usuarioId });
    }

    // Evita duplicar materias que este usuario ya tiene
    const existentes = await Clase.find({ usuarioId }, "nombreMateria");
    const nombres = new Set(existentes.map((c) => normalizar(c.nombreMateria)));
    const nuevas = detectadas.filter((c) => !nombres.has(normalizar(c.nombreMateria)));
    const creadas = nuevas.length
      ? await Clase.insertMany(nuevas.map((c) => ({ ...c, usuarioId })))
      : [];

    res.status(201).json({
      guardado: true,
      total: detectadas.length,
      creadas: creadas.length,
      omitidas: detectadas.length - creadas.length,
      clases: creadas,
    });
  } catch (err) { next(err); }
};