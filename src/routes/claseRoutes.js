const express = require("express");
const multer = require("multer");
const router = express.Router();
const c = require("../controllers/claseController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") return cb(null, true);
    const e = new Error("Solo se permiten archivos PDF");
    e.codigo = "SOLO_PDF";
    cb(e);
  },
});

router.get("/", c.listar);
router.get("/today", c.hoy);
router.post("/upload", upload.single("pdf"), c.subirPDF);
router.post("/", c.crear);
router.get("/:id", c.obtener);
router.put("/:id", c.actualizar);
router.delete("/:id", c.eliminar);

module.exports = router;