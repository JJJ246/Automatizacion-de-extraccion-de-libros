/**
 * controllers/guionController.js
 * Módulo 4: Generador de Audio desde Guion Escrito
 */

const { execFile }  = require('child_process');
const { promisify } = require('util');
const fs            = require('fs');
const path          = require('path');
const { sanitizeFilename } = require('../utils/sanitize');
const { ffmpegConcat }     = require('../utils/ffmpegRunner');

const execFileAsync = promisify(execFile);
const OUTPUT_DIR = path.join(__dirname, '..', 'output', 'guiones');
const CHUNK_SIZE = 3000;

function splitIntoChunks(text, size = CHUNK_SIZE) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;
    if (end < text.length) {
      const sp = text.lastIndexOf(' ', end);
      if (sp > start) end = sp;
    }
    chunks.push(text.slice(start, end).trim());
    start = end + 1;
  }
  return chunks.filter(c => c.length > 0);
}

async function textToSpeechCLI(text, voice, outputPath) {
  const tmpTxt = outputPath.replace(/\.mp3$/i, '_tts_tmp.txt');
  fs.writeFileSync(tmpTxt, text, 'utf-8');

  try {
    await execFileAsync('edge-tts', [
      '--file', tmpTxt,
      '--voice', voice,
      '--write-media', outputPath,
    ], {
      timeout: 120000,
    });
    console.log(`[Guion] ✔ Guardando... → ${path.basename(outputPath)}`);
  } finally {
    try { fs.unlinkSync(tmpTxt); } catch (_) {}
  }
}

async function processGuion(req, res) {
  const { texto, filename, voice = 'es-MX-JorgeNeural' } = req.body;

  if (!texto || !filename) {
    return res.status(400).json({ error: 'Se requieren "texto" y "filename".' });
  }

  const safeFilename = sanitizeFilename(filename);

  res.json({ ok: true, message: `Procesando guion...`, filename: safeFilename });

  (async () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const allSegmentFiles = [];

    try {
      console.log(`\n[Guion] 🚀 Procesando...`);
      console.log(`[Guion] Voz: ${voice}`);

      const chunks = splitIntoChunks(texto, CHUNK_SIZE);
      console.log(`[Guion] ✔ Texto dividido en ${chunks.length} bloques`);

      for (let i = 0; i < chunks.length; i++) {
        const segLabel = `${i + 1}/${chunks.length}`;
        console.log(`[Guion] ━━ Bloque ${segLabel} ━━`);

        const segFile = path.join(
          OUTPUT_DIR,
          `${safeFilename}_seg${String(i + 1).padStart(3, '0')}.mp3`
        );
        await textToSpeechCLI(chunks[i], voice, segFile);

        allSegmentFiles.push(segFile);
        console.log(`[Guion] ✅ Bloque ${segLabel} completo`);
      }

      const finalOutput = path.join(OUTPUT_DIR, `${safeFilename}.mp3`);
      console.log(`\n[Guion] 🔗 Ensamblando ${allSegmentFiles.length} segmentos…`);
      await ffmpegConcat(allSegmentFiles, finalOutput);

      allSegmentFiles.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
      console.log(`[Guion] 🎉 PROCESO COMPLETO → ${finalOutput}`);

    } catch (err) {
      console.error(`[Guion] ❌ Error fatal: ${err.message}`);
      allSegmentFiles.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
    }
  })();
}

module.exports = { processGuion };
