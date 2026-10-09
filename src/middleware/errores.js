// Ruta no encontrada
function noEncontrada(req, res) {
  res.status(404).json({
    error: "RUTA_NO_ENCONTRADA",
    mensaje: `No existe ${req.method} ${req.originalUrl}`,
  });
}

// Manejador general de errores
function manejarErrores(err, req, res, next) {
  // Errores al subir archivos
  if (err.name === "MulterError") {
    const mensaje =
      err.code === "LIMIT_FILE_SIZE" ? "El archivo supera el máximo de 5 MB" : err.message;
    return res.status(400).json({ error: "ARCHIVO_INVALIDO", campo: "pdf", mensaje });
  }
  if (err.codigo === "SOLO_PDF") {
    return res.status(400).json({ error: "SOLO_PDF", campo: "pdf", mensaje: err.message });
  }

  // Valor duplicado (ej. dos registros casi simultáneos con el mismo correo)
  if (err.code === 11000) {
    const campo = Object.keys(err.keyPattern || {})[0] || "email";
    const mensaje = campo === "email" ? "Ya existe una cuenta con ese correo" : "Ya existe un registro con ese valor";
    return res.status(409).json({ error: "DUPLICADO", campo, mensaje });
  }

  // Errores de validación de Mongoose
  if (err.name === "ValidationError") {
    const primero = Object.values(err.errors)[0];
    return res.status(400).json({ error: "VALIDACION", campo: primero.path, mensaje: primero.message });
  }

  // ID mal formado u otro valor con tipo incorrecto
  if (err.name === "CastError") {
    return res.status(400).json({
      error: "DATO_INVALIDO",
      campo: err.path,
      mensaje: `Valor inválido para ${err.path}`,
    });
  }

  console.error("💥", err);
  res.status(500).json({ error: "ERROR_SERVIDOR", mensaje: "Ocurrió un error inesperado en el servidor" });
}

module.exports = { noEncontrada, manejarErrores };