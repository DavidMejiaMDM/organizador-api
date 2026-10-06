require("dotenv").config();
const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const mongoose = require("mongoose");
const Clase = require("./models/Clase");
const Tarea = require("./models/Tarea");

const enHoras = (h) => new Date(Date.now() + h * 60 * 60 * 1000);

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Conectado");

  await Clase.deleteMany({});
  await Tarea.deleteMany({});

  const [eda, bd, is2, redes] = await Clase.insertMany([
    {
      nombreMateria: "Estructuras de Datos y Algoritmos",
      docente: "Ing. Carlos Meneses",
      salon: "Lab 302",
      edificio: "Edificio Central",
      color: "#004A98",
      horarios: [
        { diaSemana: "MIERCOLES", horaInicio: "10:00", horaFin: "12:00" },
        { diaSemana: "VIERNES", horaInicio: "10:00", horaFin: "12:00" },
      ],
    },
    {
      nombreMateria: "Bases de Datos I",
      docente: "Dra. Elena Burbano",
      salon: "Aula 104",
      edificio: "Bloque B",
      color: "#4F46E5",
      horarios: [
        { diaSemana: "LUNES", horaInicio: "14:00", horaFin: "16:00" },
        { diaSemana: "MIERCOLES", horaInicio: "14:00", horaFin: "16:00" },
      ],
    },
    {
      nombreMateria: "Ingeniería de Software II",
      docente: "Msc. Julián Gómez",
      salon: "Sala 201",
      edificio: "Bloque A",
      color: "#0284C7",
      horarios: [
        { diaSemana: "MARTES", horaInicio: "08:00", horaFin: "10:00" },
        { diaSemana: "JUEVES", horaInicio: "08:00", horaFin: "10:00" },
      ],
    },
    {
      nombreMateria: "Redes de Computadores",
      docente: "Ing. Mauricio Paz",
      salon: "Laboratorio CISCO",
      edificio: "",
      color: "#0F766E",
      horarios: [{ diaSemana: "VIERNES", horaInicio: "16:00", horaFin: "18:00" }],
    },
  ]);

  await Tarea.insertMany([
    {
      claseId: eda._id,
      titulo: "Parcial Primer 30%: Árboles y Grafos",
      tipo: "PARCIAL",
      fechaEntrega: enHoras(18),
      porcentaje: 30,
      modalidad: "Presencial",
      notas: "Unidades 1 y 2. Se permite hoja de apuntes manuscrita.",
    },
    {
      claseId: bd._id,
      titulo: "Taller Consultas SQL complejas",
      tipo: "TALLER",
      fechaEntrega: enHoras(72),
      modalidad: "Campus Virtual",
      notas: "Entregar script .sql",
    },
    {
      claseId: is2._id,
      titulo: "Diseño Arquitectura Microservicios",
      tipo: "TAREA",
      fechaEntrega: enHoras(120),
      modalidad: "Entrega grupal",
    },
    {
      claseId: redes._id,
      titulo: "Informe de laboratorio VLAN",
      tipo: "TAREA",
      fechaEntrega: enHoras(-24), // ya vencida, solo para probar estados
      completada: true,
    },
  ]);

  console.log("🌱 Datos de ejemplo creados: 4 clases y 4 tareas");
  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error("❌ Error en seed:", e.message);
  process.exit(1);
});