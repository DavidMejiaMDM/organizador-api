const express = require("express");
const router = express.Router();
const c = require("../controllers/authController");
const { requiereAuth } = require("../middleware/auth");
const { limitarPorIp } = require("../middleware/limitador");

// Límites por IP (generosos: muchos estudiantes pueden compartir la misma red de la universidad).
// El control fino —enfriamiento, envíos por hora e intentos del código— va por correo, en la base de datos.
const limitarOlvido = limitarPorIp({
  nombre: "recuperación", max: 20, ventanaMs: 15 * 60 * 1000,
  mensaje: "Demasiadas solicitudes de recuperación desde esta red.",
});
const limitarRestablecer = limitarPorIp({
  nombre: "restablecer", max: 30, ventanaMs: 15 * 60 * 1000,
  mensaje: "Demasiados intentos desde esta red.",
});

router.post("/register", c.registrar);
router.post("/login", c.entrar);
router.post("/forgot-password", limitarOlvido, c.olvidePassword);
router.post("/reset-password", limitarRestablecer, c.restablecerPassword);
router.get("/me", requiereAuth, c.yo);
router.patch("/me", requiereAuth, c.actualizarPerfil);
router.put("/password", requiereAuth, c.cambiarPassword);
router.delete("/me", requiereAuth, c.eliminarCuenta);

module.exports = router;