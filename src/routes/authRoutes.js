const express = require("express");
const router = express.Router();
const c = require("../controllers/authController");
const { requiereAuth } = require("../middleware/auth");

router.post("/register", c.registrar);
router.post("/login", c.entrar);
router.get("/me", requiereAuth, c.yo);
router.delete("/me", requiereAuth, c.eliminarCuenta);

module.exports = router;