/**
 * controllers/youtubeController.js
 * Módulo 2: Descarga de videos/audio de YouTube con youtube-dl-exec
 */

const youtubeDl = require('youtube-dl-exec');
const path      = require('path');
const fs        = require('fs');
const { sanitizeFilename } = require('../utils/sanitize');

const OUTPUT_DIR = path.join(__dirname, '..', 'output', 'youtube');

async function downloadYoutube(req, res) {
  const { url, format, filename } = req.body;

  if (!url || !format || !filename) {
    return res.status(400).json({ error: 'Se requieren "url", "format" y "filename".' });
  }

  const safeFilename = sanitizeFilename(filename);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  res.json({ ok: true, message: `Iniciando descarga: ${safeFilename} (${format.toUpperCase()})…` });

  // ─── Opciones base ────────────────────────────────────────────────────────
  // IMPORTANTE: No incluir verbose:false — yt-dlp no acepta --no-verbose
  const options = {
    noPlaylist: true,
    output: path.join(OUTPUT_DIR, `${safeFilename}.%(ext)s`),
  };

  if (format === 'mp3') {
    options.extractAudio = true;
    options.audioFormat  = 'mp3';
    options.audioQuality = 0;          // 0 = mejor calidad VBR
    options.format       = 'bestaudio/best';
    console.log(`[YouTube] 🎵 Descargando audio MP3 → ${safeFilename}.mp3`);
  } else {
    options.format            = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    options.mergeOutputFormat = 'mp4';
    console.log(`[YouTube] 🎬 Descargando video MP4 → ${safeFilename}.mp4`);
  }

  try {
    console.log(`[YouTube] URL: ${url}`);
    console.log(`[YouTube] Opciones activas: ${JSON.stringify(options, null, 2)}`);

    const output = await youtubeDl(url, options);

    if (output) console.log(`[YouTube] Salida yt-dlp:\n${output}`);
    console.log(`[YouTube] ✅ Descarga completada → ${OUTPUT_DIR}\\${safeFilename}.${format === 'mp3' ? 'mp3' : 'mp4'}`);
  } catch (err) {
    console.error(`[YouTube] ❌ Error: ${err.message}`);
    if (err.stderr) console.error(`[YouTube] Stderr:\n${err.stderr}`);
  }
}

module.exports = { downloadYoutube };
