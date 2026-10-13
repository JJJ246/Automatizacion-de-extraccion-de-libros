/**
 * controllers/fusionController.js
 * Módulo 3: Fusión de MP3 con multer + FFmpeg concat (sin recodificar)
 *
 * Flujo:
 *  1. multer recibe los archivos y los guarda en /temp
 *  2. ffmpegConcat crea lista_unir.txt, ejecuta ffmpeg -y -f concat -safe 0 -c copy
 *  3. El .mp3 final se guarda en la carpeta Descargas del usuario (os.homedir()/Downloads)
 *  4. /temp y lista_unir.txt se eliminan SIEMPRE en el bloque finally
 *  5. res.json({ success: true, message, outputPath }) confirma al frontend
 */

const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { ffmpegConcat }     = require('../utils/ffmpegRunner');
const { sanitizeFilename } = require('../utils/sanitize');

// ─── Destino automático: carpeta Descargas del usuario ───────────────────────
function getDownloadsDir() {
  // Funciona en Windows, macOS y Linux
  return path.join(os.homedir(), 'Downloads');
}

// ─── Carpeta temporal del proyecto ───────────────────────────────────────────
const TEMP_DIR = path.join(__dirname, '..', 'temp');
fs.mkdirSync(TEMP_DIR, { recursive: true });

// ─── Multer: almacenamiento en /temp ─────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TEMP_DIR),
  filename: (_req, file, cb) => {
    const safeName = sanitizeFilename(path.parse(file.originalname).name);
    cb(null, `${Date.now()}_${safeName}.mp3`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    // Acepta todos los mimetypes posibles para .mp3 según el SO/navegador
    const ok = ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg', 'application/octet-stream']
                 .includes(file.mimetype)
               || file.originalname.toLowerCase().endsWith('.mp3');
    ok ? cb(null, true)
       : cb(new Error(`Archivo rechazado: "${file.originalname}". Solo se aceptan .mp3`));
  },
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB por archivo
}).array('audioFiles', 50);

// ─── Helper: elimina archivos temporales silenciosamente ─────────────────────
function cleanupFiles(paths) {
  paths.forEach(p => {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
  });
}

// ─── Controlador ─────────────────────────────────────────────────────────────
function fusionAudios(req, res) {

  // Paso 1: multer procesa los archivos multipart
  upload(req, res, async (uploadErr) => {

    if (uploadErr) {
      console.error(`[Fusión] ❌ Error multer: ${uploadErr.message}`);
      return res.status(400).json({ error: uploadErr.message });
    }

    const filename      = (req.body.filename || '').trim();
    const uploadedFiles = req.files || [];
    const tempPaths     = uploadedFiles.map(f => f.path);

    // ── Validaciones ─────────────────────────────────────────────────────────
    if (uploadedFiles.length < 2) {
      cleanupFiles(tempPaths);
      return res.status(400).json({
        error: `Se necesitan al menos 2 archivos MP3. Recibidos: ${uploadedFiles.length}`,
      });
    }

    if (!filename) {
      cleanupFiles(tempPaths);
      return res.status(400).json({ error: 'El campo "filename" es obligatorio.' });
    }

    // ── Construir ruta de salida (Descargas del usuario) ──────────────────────
    const safeFilename  = sanitizeFilename(filename);
    const downloadsDir  = getDownloadsDir();
    const outputPath    = path.join(downloadsDir, `${safeFilename}.mp3`);

    // Garantizar que la carpeta Descargas existe
    fs.mkdirSync(downloadsDir, { recursive: true });

    // ── Respuesta inmediata al frontend ───────────────────────────────────────
    res.json({
      success: true,
      message: `Fusionando ${uploadedFiles.length} archivo(s) → Descargas/${safeFilename}.mp3`,
    });

    // ── Proceso FFmpeg asíncrono en background ────────────────────────────────
    (async () => {
      try {
        console.log(`[Fusión] 📂 ${uploadedFiles.length} archivos recibidos en /temp:`);
        uploadedFiles.forEach((f, i) => {
          console.log(`  ${i + 1}. ${f.originalname}  (${(f.size / 1024).toFixed(1)} KB)`);
        });
        console.log(`[Fusión] 🎯 Destino: ${outputPath}`);

        // Paso 2: ffmpegConcat escribe lista_unir.txt, ejecuta FFmpeg y lo borra
        // Equivale a: ffmpeg -y -f concat -safe 0 -i lista.txt -c copy output.mp3
        await ffmpegConcat(tempPaths, outputPath);

        console.log(`[Fusión] 🎉 ¡Completado! → ${outputPath}`);

      } catch (err) {
        console.error(`[Fusión] ❌ FFmpeg falló: ${err.message}`);
      } finally {
        // Paso 4: limpiar /temp SIEMPRE (éxito o error)
        console.log(`[Fusión] 🗑️  Limpiando ${tempPaths.length} temporal(es)…`);
        cleanupFiles(tempPaths);
        console.log('[Fusión] ✅ /temp limpiado.');
      }
    })();
  });
}

module.exports = { fusionAudios };
