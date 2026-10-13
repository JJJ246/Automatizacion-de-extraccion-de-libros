/**
 * utils/ffmpegRunner.js
 * Wrapper para ejecutar FFmpeg mediante child_process.spawn
 * Reemplaza fluent-ffmpeg (deprecado) con llamadas directas sin dependencias adicionales.
 */

const { spawn } = require('child_process');
const fs        = require('fs');
const path      = require('path');
const os        = require('os');

/**
 * Ejecuta FFmpeg en modo concat (sin recodificar).
 * @param {string[]} inputFiles  - Rutas absolutas de los MP3 a concatenar
 * @param {string}   outputFile  - Ruta de salida del MP3 final
 * @returns {Promise<void>}
 */
function ffmpegConcat(inputFiles, outputFile) {
  return new Promise((resolve, reject) => {
    // Crear lista temporal .txt para FFmpeg
    const listFile    = path.join(os.tmpdir(), `concat_list_${Date.now()}.txt`);
    const listContent = inputFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(listFile, listContent, 'utf8');

    console.log(`[FFmpeg] Lista temporal: ${listFile}`);
    console.log(`[FFmpeg] Ensamblando ${inputFiles.length} archivo(s) → ${path.basename(outputFile)}`);

    const args = [
      '-y',                  // sobrescribir sin preguntar
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c', 'copy',
      outputFile,
    ];

    console.log(`[FFmpeg] Comando: ffmpeg ${args.join(' ')}`);

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';

    proc.stderr.on('data', chunk => {
      const line = chunk.toString();
      stderr += line;
      // Filtrar solo las líneas de progreso relevantes
      if (line.includes('time=') || line.includes('size=')) {
        process.stdout.write(`\r[FFmpeg] ${line.trim()}`);
      }
    });

    proc.on('close', code => {
      // Eliminar lista temporal siempre
      try { fs.unlinkSync(listFile); } catch (_) {}

      if (code === 0) {
        console.log(`\n[FFmpeg] ✅ Completado → ${outputFile}`);
        resolve();
      } else {
        const errMsg = stderr.split('\n').slice(-5).join('\n');
        reject(new Error(`FFmpeg salió con código ${code}:\n${errMsg}`));
      }
    });

    proc.on('error', err => {
      try { fs.unlinkSync(listFile); } catch (_) {}
      if (err.code === 'ENOENT') {
        reject(new Error('FFmpeg no encontrado. Asegúrate de que está instalado y en el PATH del sistema.'));
      } else {
        reject(err);
      }
    });
  });
}

module.exports = { ffmpegConcat };
