/**
 * controllers/fanficController.js
 * Módulo 1: Extracción multi-sitio (FanFiction.net + Wattpad),
 * traducción forzada al español (google-translate-api-x) y
 * TTS con edge-tts CLI via child_process (con fallback al SDK).
 */

const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const translate     = require('google-translate-api-x');
const edgeTTS       = require('edge-tts-universal');
const { execFile }  = require('child_process');
const { promisify } = require('util');
const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { sanitizeFilename } = require('../utils/sanitize');
const { ffmpegConcat }     = require('../utils/ffmpegRunner');

const execFileAsync = promisify(execFile);

puppeteer.use(StealthPlugin());

const OUTPUT_DIR = path.join(__dirname, '..', 'output', 'fanfic');
const VOICE      = 'es-MX-JorgeNeural';
const CHUNK_SIZE = 3000;

// ══════════════════════════════════════════════════════════════════════════════
// DETECCIÓN DE SITIO
// ══════════════════════════════════════════════════════════════════════════════

function detectSite(url) {
  if (/fanfiction\.net/i.test(url)) return 'fanfiction';
  if (/wattpad\.com/i.test(url))    return 'wattpad';
  return 'unknown';
}

// ══════════════════════════════════════════════════════════════════════════════
// EXTRACTORES
// ══════════════════════════════════════════════════════════════════════════════

async function extractFanfiction(page, url) {
  console.log('[Fanfic] 🌐 Sitio: FanFiction.net');
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#storytext', { timeout: 60000 });
  return page.$eval('#storytext', el => el.innerText.trim());
}

async function extractWattpad(page, url) {
  console.log('[Fanfic] 🌐 Sitio: Wattpad (Extracción Controlada en Node.js)');
  await page.goto(url, { waitUntil: 'networkidle2' });

  await new Promise(r => setTimeout(r, 2000));
  await page.focus('body');

  let allUniqueTexts = [];
  let seenFingerprints = new Set();
  let sameLengthCount = 0;

  console.log('[Fanfic] ⬇️ Iniciando bucle de PageDown y recolección a Node.js...');

  // Bucle de lectura: se detendrá si pasa ~6 segundos sin encontrar NADA nuevo
  while (sameLengthCount < 6) {
      // Avanzamos por la página como un humano
      await page.keyboard.press('PageDown');
      await page.keyboard.press('PageDown'); // Doble salto para mayor velocidad
      await new Promise(r => setTimeout(r, 1000)); // Esperamos a que Wattpad cargue

      // Extraemos TODO el texto de los párrafos que existan en el DOM en este segundo
      // [MEJORA]: Dividimos el innerText por saltos de línea para evitar el efecto "bola de nieve" 
      // causado por contenedores (<pre> o similares) que crecen dinámicamente concatenando texto.
      const rawParagraphs = await page.evaluate(() => {
          const elements = document.querySelectorAll('.part-content p, .part-content pre, p[data-p-id]');
          let texts = [];
          elements.forEach(el => {
              const lines = el.innerText.split('\n');
              lines.forEach(line => {
                  const trimmed = line.trim();
                  if (trimmed.length > 0) {
                      texts.push(trimmed);
                  }
              });
          });
          return texts;
      });

      let newTextFound = false;

      // Pasamos el texto por nuestro "colador" en Node.js
      for (const text of rawParagraphs) {
          // Creamos la huella digital: solo letras minúsculas y números, sin espacios ni tildes
          const fingerprint = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, '').toLowerCase();

          // Si el párrafo es válido y su huella NUNCA ha sido vista, lo guardamos
          if (fingerprint.length > 5 && !seenFingerprints.has(fingerprint)) {
              seenFingerprints.add(fingerprint);
              allUniqueTexts.push(text);
              newTextFound = true;
          }
      }

      // Control de salida del bucle
      if (newTextFound) {
          sameLengthCount = 0; // Encontramos texto fresco, reseteamos el reloj
      } else {
          sameLengthCount++; // No hay nada nuevo, el reloj avanza hacia la salida
      }

      // Si Wattpad inyecta un botón de "Continuar leyendo", lo presionamos
      await page.evaluate(() => {
          const btn = document.querySelector('.load-more-page, .continue-reading, .next-part-link');
          if (btn) btn.click();
      });
  }

  // Unimos todos los párrafos limpios y únicos para la traducción/narración
  const extractedText = allUniqueTexts.join('\n\n');

  if (!extractedText || extractedText.length < 50) {
    throw new Error('Texto de Wattpad vacío o insuficiente (¿Capítulo privado o de pago?)');
  }

  console.log(`[Fanfic] ✔ Extracción finalizada de manera óptima (${extractedText.length} caracteres).`);
  return extractedText;
}

async function extractText(page, url) {
  switch (detectSite(url)) {
    case 'fanfiction': return extractFanfiction(page, url);
    case 'wattpad':    return extractWattpad(page, url);
    default:
      console.warn(`[Fanfic] ⚠️ Sitio desconocido. Extracción genérica: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2' });
      const body = await page.$eval('body', el => el.innerText.trim());
      if (!body || body.length < 100) throw new Error(`Extracción genérica fallida: ${url}`);
      return body;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILIDADES DE TEXTO
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// TRADUCCIÓN — google-translate-api-x con reintentos
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Traduce un bloque de texto al español usando google-translate-api-x.
 * Reintenta hasta 4 veces con espera exponencial ante errores de red/rate-limit.
 * @param {string} text  Texto a traducir (máx ~5000 chars)
 * @param {number} [retries=4]
 * @returns {Promise<string>} Texto traducido al español
 */
async function translateChunk(text, retries = 4) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`[Fanfic]   → Traduciendo bloque (${text.length} chars, intento ${attempt + 1})…`);

      const result = await translate(text, {
        to:         'es',     // idioma destino: español
        forceBatch: false,    // una solicitud por bloque para mayor confiabilidad
        autoCorrect: false,
      });

      // google-translate-api-x puede devolver un objeto único o un array
      let translated;
      if (Array.isArray(result)) {
        translated = result.map(r => r.text).join(' ');
      } else {
        translated = result.text;
      }

      if (!translated || translated.trim().length === 0) {
        throw new Error('La traducción devolvió texto vacío');
      }

      console.log(`[Fanfic]   ✔ Traducción OK (${translated.length} chars)`);
      return translated.trim();

    } catch (err) {
      const waitMs = 2000 * Math.pow(2, attempt); // espera exponencial: 2s, 4s, 8s, 16s
      console.warn(`[Fanfic]   ⚠️ Traducción fallida (intento ${attempt + 1}/${retries}): ${err.message}`);
      if (attempt < retries - 1) {
        console.warn(`[Fanfic]   Esperando ${waitMs / 1000}s antes de reintentar…`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw new Error(`Traducción fallida después de ${retries} intentos. Revisa tu conexión.`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEXT-TO-SPEECH
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Detecta si el ejecutable edge-tts está disponible en el PATH del sistema.
 * @returns {Promise<boolean>}
 */
async function isEdgeTtsCLIAvailable() {
  try {
    await execFileAsync('edge-tts', ['--help'], { timeout: 5000 });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * TTS via CLI (edge-tts Python package).
 * Escribe el texto en un archivo .txt temporal para evitar todos los
 * problemas de escape de caracteres en PowerShell/CMD de Windows.
 *
 * Equivale a:
 *   edge-tts --text-file <tmp.txt> --voice es-MX-JorgeNeural --write-media <output.mp3>
 */
async function textToSpeechCLI(text, outputPath) {
  const tmpTxt = outputPath.replace(/\.mp3$/i, '_tts_tmp.txt');
  fs.writeFileSync(tmpTxt, text, 'utf-8');

  try {
    await execFileAsync('edge-tts', [
      '--file',      tmpTxt,       // edge-tts 7.x usa --file (no --text-file)
      '--voice',     VOICE,
      '--write-media', outputPath,
    ], {
      timeout: 120000,
    });
    console.log(`[Fanfic] ✔ TTS CLI OK → ${path.basename(outputPath)}`);
  } finally {
    try { fs.unlinkSync(tmpTxt); } catch (_) {}
  }
}

/**
 * TTS via SDK (edge-tts-universal).
 * Fallback cuando el CLI no está disponible.
 * API real: new EdgeTTS(text, voice).synthesize() → { audio: Blob|Buffer }
 */
async function textToSpeechSDK(text, outputPath) {
  const tts    = new edgeTTS.EdgeTTS(text, VOICE, { rate: '+0%', volume: '+0%', pitch: '+0Hz' });
  const result = await tts.synthesize();

  if (!result || !result.audio) throw new Error('TTS SDK no devolvió audio');

  // Normalizar Blob/Uint8Array/Buffer a Buffer de Node.js
  let buf;
  if (Buffer.isBuffer(result.audio))                       buf = result.audio;
  else if (result.audio instanceof Uint8Array)             buf = Buffer.from(result.audio);
  else if (typeof result.audio.arrayBuffer === 'function') buf = Buffer.from(await result.audio.arrayBuffer());
  else throw new Error('Tipo de audio desconocido del SDK TTS');

  if (buf.length === 0) throw new Error('TTS SDK generó audio vacío');

  fs.writeFileSync(outputPath, buf);
  console.log(`[Fanfic] ✔ TTS SDK OK → ${path.basename(outputPath)} (${(buf.length / 1024).toFixed(1)} KB)`);
}

/**
 * Punto de entrada de TTS: intenta CLI primero, cae al SDK si no está disponible.
 */
let _cliAvailable = null; // cache para no repetir la detección en cada bloque

async function textToSpeech(text, outputPath) {
  console.log(`[Fanfic] 🔊 TTS → ${path.basename(outputPath)}`);

  if (_cliAvailable === null) {
    _cliAvailable = await isEdgeTtsCLIAvailable();
    console.log(`[Fanfic] TTS engine: ${_cliAvailable ? 'edge-tts CLI (Python)' : 'edge-tts-universal SDK'}`);
  }

  if (_cliAvailable) {
    await textToSpeechCLI(text, outputPath);
  } else {
    await textToSpeechSDK(text, outputPath);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTROLADOR PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

async function processFanfic(req, res) {
  const { urls, filename, traducirTexto = true } = req.body;

  if (!urls || !filename) {
    return res.status(400).json({ error: 'Se requieren "urls" y "filename".' });
  }

  const safeFilename = sanitizeFilename(filename);
  const urlList      = urls.split(',').map(u => u.trim()).filter(Boolean);

  res.json({ ok: true, message: `Procesando ${urlList.length} URL(s)…`, filename: safeFilename });

  (async () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    let browser;
    const allSegmentFiles = [];

    try {
      console.log('[Fanfic] 🚀 Iniciando Puppeteer (stealth) con Brave Browser...');
      browser = await puppeteer.launch({
        headless: "new", // Puedes cambiar a false si quieres ver a Brave trabajar en pantalla
        executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ],
        defaultViewport: null,
        timeout: 0,
      });

      for (let urlIdx = 0; urlIdx < urlList.length; urlIdx++) {
        const url = urlList[urlIdx];
        console.log(`\n[Fanfic] 📖 URL ${urlIdx + 1}/${urlList.length}: ${url}`);

        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(0);

        // ── 1. EXTRACCIÓN ────────────────────────────────────────────────────
        const rawText = await extractText(page, url);
        console.log(`[Fanfic] ✔ Texto extraído: ${rawText.length} chars`);
        await page.close();

        // ── 2. DIVIDIR EN BLOQUES ────────────────────────────────────────────
        const chunks = splitIntoChunks(rawText, CHUNK_SIZE);
        console.log(`[Fanfic] ✔ Bloques: ${chunks.length} × ~${CHUNK_SIZE} chars`);

        // ── 3. TRADUCCIÓN + TTS por bloque ───────────────────────────────────
        for (let i = 0; i < chunks.length; i++) {
          const segLabel = `${i + 1}/${chunks.length}`;
          console.log(`\n[Fanfic] ━━ Bloque ${segLabel} ━━`);

          // 3a. Traducción al español (Opcional)
          let finalChunk = chunks[i];
          if (traducirTexto) {
            finalChunk = await translateChunk(chunks[i]);
          } else {
            console.log(`[Fanfic]   → Traducción omitida (idioma original)`);
          }

          // 3b. Generación de audio MP3 con sistema de Reintento Único y Delay Dinámico
          const segFile = path.join(
            OUTPUT_DIR,
            `${safeFilename}_url${urlIdx + 1}_seg${String(i + 1).padStart(3, '0')}.mp3`
          );

          try {
            await textToSpeech(finalChunk, segFile);
          } catch (err) {
            console.warn(`[Fanfic] ⚠️ Error en TTS. Esperando 5 segundos para Reintento Único...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            // Reintento único
            try {
               await textToSpeech(finalChunk, segFile);
            } catch (retryErr) {
               throw new Error(`Fallo definitivo en TTS tras reintento en bloque ${segLabel}: ${retryErr.message}`);
            }
          }

          allSegmentFiles.push(segFile);
          console.log(`[Fanfic] ✅ Bloque ${segLabel} completo`);

          console.log(`[Fanfic] ⏳ Pausa de seguridad de 4 segundos...`);
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
      }

      // ── 4. ENSAMBLAJE CON FFMPEG ─────────────────────────────────────────
      const finalOutput = path.join(OUTPUT_DIR, `${safeFilename}.mp3`);
      console.log(`\n[Fanfic] 🔗 Ensamblando ${allSegmentFiles.length} segmentos…`);
      await ffmpegConcat(allSegmentFiles, finalOutput);

      // ── 5. LIMPIEZA DE SEGMENTOS TEMPORALES ──────────────────────────────
      allSegmentFiles.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
      console.log(`[Fanfic] 🎉 PROCESO COMPLETO → ${finalOutput}`);

    } catch (err) {
      console.error(`[Fanfic] ❌ Error fatal: ${err.message}`);
      allSegmentFiles.forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
    } finally {
      if (browser) { try { await browser.close(); } catch (_) {} }
    }
  })();
}

module.exports = { processFanfic };
