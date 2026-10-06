// Lector del "Horario académico" en PDF de la Uniautónoma del Cauca (Moodle).
// Formato de la tabla: HORA | CURSO | JORNADA | GRUPO | FECHA INICIO | FECHA FINAL | DOCENTE
// La columna HORA trae una o varias sesiones, por ejemplo:
//   "Lunes -Salón:603 Campus principal( 8:00AM a 9:00AM), Viernes -Salón:603 Campus principal( 9:00AM a 11:00AM)"
//   "Miercoles ( 9:00AM a 11:00AM)"            (sin salón)

const COLORES = ["#004A98", "#4F46E5", "#0284C7", "#0F766E", "#B45309", "#9333EA", "#BE123C", "#475569"];

const MESES = {
  january: 1, enero: 1, february: 2, febrero: 2, march: 3, marzo: 3, april: 4, abril: 4,
  may: 5, mayo: 5, june: 6, junio: 6, july: 7, julio: 7, august: 8, agosto: 8,
  september: 9, septiembre: 9, october: 10, octubre: 10, november: 11, noviembre: 11,
  december: 12, diciembre: 12,
};

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "para", "a", "al", "con", "por"]);

const HORA = "(\\d{1,2}):(\\d{2})\\s*([AaPp]\\.?\\s?[Mm]\\.?)";

// Una sesión: día + (salón y sede opcionales) + ( hora inicio a hora fin )
const REGEX_SESION = new RegExp(
  `(Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|S[aá]bado|Domingo)\\s*(?:-\\s*Sal.{1,2}n\\s*:\\s*([^()]*?)\\s*)?\\(\\s*${HORA}\\s*(?:a|-|–)\\s*${HORA}\\s*\\)`,
  "gi"
);

// Fechas del curso: "Monday, 03 de August de 2026"
const REGEX_FECHA =
  /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s*,\s*(\d{1,2})\s*de\s*([A-Za-záéíóú]+)\s*de\s*(\d{4})/gi;

const REGEX_JORNADA =
  /^(.*?)\s*(DIURNO|DIURNA|NOCTURNO|NOCTURNA|SABATINO|SABATINA|DOMINICAL|MIXTO|MIXTA)\s*([A-Za-z0-9]{1,3})?\s*$/i;

// ---------- Utilidades ----------
const normalizar = (t) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function aTitulo(texto) {
  return texto
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((p, i) => {
      if (/^(i{1,3}|iv|v|vi{1,3}|ix|x)$/.test(p)) return p.toUpperCase(); // números romanos
      if (i > 0 && MINUSCULAS.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

function a24h(h, m, sufijo) {
  let hora = parseInt(h, 10);
  const min = parseInt(m, 10);
  if (hora > 23 || min > 59) return null;
  const s = (sufijo || "").toLowerCase().replace(/[^ap]/g, ""); // "a" o "p"
  if (s === "p" && hora < 12) hora += 12;
  if (s === "a" && hora === 12) hora = 0;
  return `${String(hora).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function aFecha(f) {
  const mes = MESES[f[2].toLowerCase()];
  return mes ? new Date(Date.UTC(parseInt(f[3], 10), mes - 1, parseInt(f[1], 10))) : null;
}

// Lee lo que hay después de las sesiones de una fila:
// CURSO + JORNADA + GRUPO + FECHA INICIO + FECHA FINAL + DOCENTE
function parsearFila(segmento) {
  const fechas = [...segmento.matchAll(REGEX_FECHA)];
  if (fechas.length === 0) return null;

  const antes = segmento.slice(0, fechas[0].index).replace(/^[\s,)]+/, "").trim();
  const ultima = fechas[Math.min(1, fechas.length - 1)];
  const docente = segmento
    .slice(ultima.index + ultima[0].length)
    .split(/Si observa|C[oó]digo ICFES|www\./i)[0]
    .replace(/\s+/g, " ")
    .trim();

  const j = antes.match(REGEX_JORNADA);
  return {
    curso: j ? j[1].trim() : antes,
    jornada: j ? j[2].toUpperCase() : "",
    grupo: j && j[3] ? j[3].toUpperCase() : "",
    docente,
    fechaInicio: aFecha(fechas[0]),
    fechaFin: fechas.length > 1 ? aFecha(fechas[1]) : null,
  };
}

// ---------- Función principal ----------
function parsearHorario(texto) {
  // Todo el texto en una sola línea: así no importa cómo el lector del PDF
  // haya partido los renglones de la tabla.
  const plano = texto.replace(/\s+/g, " ").trim();
  const sesiones = [...plano.matchAll(REGEX_SESION)];
  if (sesiones.length === 0) return [];

  // Cada fila = sus sesiones (1 o más) + los datos que vienen después de la última
  const filas = [];
  let pendientes = [];
  sesiones.forEach((m, i) => {
    const horaInicio = a24h(m[3], m[4], m[5]);
    const horaFin = a24h(m[6], m[7], m[8]);
    if (horaInicio && horaFin && horaFin > horaInicio) {
      pendientes.push({
        diaSemana: normalizar(m[1]).toUpperCase(),
        horaInicio,
        horaFin,
        ubicacion: (m[2] || "").trim(),
      });
    }
    const desde = m.index + m[0].length;
    const hasta = i + 1 < sesiones.length ? sesiones[i + 1].index : plano.length;
    const fila = parsearFila(plano.slice(desde, hasta));
    if (fila) {
      filas.push({ ...fila, sesiones: pendientes });
      pendientes = [];
    }
  });

  // Convierte las filas en clases
  const mapa = new Map();
  for (const f of filas) {
    const nombre = aTitulo(f.curso) || "Asignatura sin nombre";
    const clave = `${normalizar(nombre)}|${f.grupo}`;
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        nombreMateria: nombre,
        docente: aTitulo(f.docente),
        salon: "",
        edificio: "",
        grupo: f.grupo,
        jornada: f.jornada,
        ...(f.fechaInicio && { fechaInicio: f.fechaInicio }),
        ...(f.fechaFin && { fechaFin: f.fechaFin }),
        ...(f.fechaInicio && {
          periodo: `${f.fechaInicio.getUTCFullYear()}-${f.fechaInicio.getUTCMonth() < 6 ? 1 : 2}`,
        }),
        horarios: [],
      });
    }
    const clase = mapa.get(clave);

    for (const s of f.sesiones) {
      // "603 Campus principal" -> salón "603", sede "Campus principal"
      if (!clase.salon && s.ubicacion) {
        const partes = s.ubicacion.match(/^(\S+)\s*(.*)$/);
        if (partes) {
          clase.salon = partes[1];
          clase.edificio = partes[2].trim();
        }
      }
      const repetido = clase.horarios.some(
        (h) => h.diaSemana === s.diaSemana && h.horaInicio === s.horaInicio && h.horaFin === s.horaFin
      );
      if (!repetido) clase.horarios.push({ diaSemana: s.diaSemana, horaInicio: s.horaInicio, horaFin: s.horaFin });
    }
  }

  return [...mapa.values()].map((c, i) => ({ ...c, color: COLORES[i % COLORES.length] }));
}

module.exports = { parsearHorario, normalizar };