const express = require("express");
const router = express.Router();
const c = require("../controllers/tareaController");

router.get("/", c.listar);
router.post("/", c.crear);
router.get("/:id", c.obtener);
router.put("/:id", c.actualizar);
router.patch("/:id/completar", c.completar);
router.delete("/:id", c.eliminar);

module.exports = router;