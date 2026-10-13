/**
 * app.js — AutoDash Frontend
 * Cada módulo usa botones type="button" — NUNCA type="submit" —
 * para eliminar por completo el riesgo de envío GET nativo.
 */

'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// UTILIDADES GLOBALES
// ══════════════════════════════════════════════════════════════════════════════

const state = {
  activeModule:      'fanfic',
  terminalCollapsed: false,
  sseConnected:      false,
};

function $(id) { return document.getElementById(id); }

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showResult(id, type, message) {
  const el = $(`result-${id}`);
  if (!el) return;
  el.className = `result-area ${type}`;
  el.textContent = message;
  el.hidden = false;
}

function hideResult(id) {
  const el = $(`result-${id}`);
  if (el) el.hidden = true;
}

function setBtnLoading(btnId, loading) {
  const btn = $(btnId);
  if (!btn) return;
  if (loading) {
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML    = '<span class="btn-icon">⏳</span> Procesando…';
    btn.disabled     = true;
  } else {
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
    btn.disabled  = false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// NAVEGACIÓN
// ══════════════════════════════════════════════════════════════════════════════

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchModule(btn.dataset.module));
});

function switchModule(mod) {
  if (mod === state.activeModule) return;

  $(`panel-${state.activeModule}`).hidden = true;
  $(`nav-${state.activeModule}`).classList.remove('active');
  $(`nav-${state.activeModule}`).setAttribute('aria-selected', 'false');

  state.activeModule = mod;
  const panel = $(`panel-${mod}`);
  panel.hidden = false;
  panel.style.animation = 'none';
  panel.offsetHeight;           // fuerza reflow para reiniciar animación
  panel.style.animation = '';

  $(`nav-${mod}`).classList.add('active');
  $(`nav-${mod}`).setAttribute('aria-selected', 'true');
}

// ══════════════════════════════════════════════════════════════════════════════
// SSE — TERMINAL VIRTUAL
// ══════════════════════════════════════════════════════════════════════════════

const terminalOutput = $('terminal-output');
const termContainer  = document.querySelector('.terminal-container');

function connectSSE() {
  const src = new EventSource('/api/logs');

  src.onopen = () => {
    state.sseConnected = true;
    $('status-dot').className  = 'status-dot connected';
    $('status-text').textContent = 'Servidor conectado';
    appendLog('info', '✅ Conexión SSE establecida');
  };

  src.onmessage = (e) => {
    try {
      const { level, message, ts } = JSON.parse(e.data);
      appendLog(level, message, ts);
    } catch (_) {}
  };

  src.onerror = () => {
    state.sseConnected = false;
    $('status-dot').className  = 'status-dot error';
    $('status-text').textContent = 'Servidor desconectado';
    appendLog('error', '⚠️ SSE desconectado. Reintentando…');
  };
}

function appendLog(level, message, ts) {
  const time = ts
    ? new Date(ts).toLocaleTimeString('es-MX', { hour12: false })
    : new Date().toLocaleTimeString('es-MX', { hour12: false });

  const autoLevel = /✅|🎉|complet/i.test(message) ? 'success' : level;

  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `
    <span class="log-ts">${time}</span>
    <span class="log-msg log-${autoLevel}">${escapeHtml(message)}</span>
  `;
  terminalOutput.appendChild(line);

  // Auto-scroll si está cerca del fondo
  const nearBottom = terminalOutput.scrollHeight - terminalOutput.scrollTop
                   - terminalOutput.clientHeight < 60;
  if (nearBottom) terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

$('btn-clear-terminal').addEventListener('click', (e) => {
  e.stopPropagation();
  terminalOutput.innerHTML = '';
  appendLog('info', 'Consola limpiada');
});

$('btn-toggle-terminal').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleTerminal();
});

document.querySelector('.terminal-header').addEventListener('click', toggleTerminal);

function toggleTerminal() {
  state.terminalCollapsed = !state.terminalCollapsed;
  termContainer.classList.toggle('collapsed', state.terminalCollapsed);
  $('btn-toggle-terminal').textContent =
    state.terminalCollapsed ? '⬆️ Expandir' : '⬇️ Colapsar';
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 1 — FANFIC / NARRACIÓN
// ══════════════════════════════════════════════════════════════════════════════

$('btn-fanfic').addEventListener('click', async () => {
  const urls          = $('fanfic-urls').value.trim();
  const filename      = $('fanfic-filename').value.trim();
  const traducirTexto = $('fanfic-translate').checked;

  hideResult('fanfic');

  if (!urls)     { showResult('fanfic', 'error', '⚠️ Ingresa al menos una URL.'); return; }
  if (!filename) { showResult('fanfic', 'error', '⚠️ Escribe el nombre del archivo.'); return; }

  setBtnLoading('btn-fanfic', true);
  appendLog('info', `[Fanfic] Iniciando → ${filename}`);

  try {
    const res = await fetch('/api/fanfic/process', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ urls, filename, traducirTexto }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showResult('fanfic', 'success', `✅ ${data.message} — monitorea la terminal.`);
    appendLog('info', `[Fanfic] Proceso en curso → ${data.filename}.mp3`);
  } catch (err) {
    showResult('fanfic', 'error', `❌ ${err.message}`);
    appendLog('error', `[Fanfic] Error: ${err.message}`);
  } finally {
    setBtnLoading('btn-fanfic', false);
  }
});

$('btn-fanfic-clear').addEventListener('click', () => {
  $('fanfic-urls').value    = '';
  $('fanfic-filename').value = '';
  hideResult('fanfic');
});

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 2 — DESCARGADOR YOUTUBE
// ══════════════════════════════════════════════════════════════════════════════

$('btn-youtube').addEventListener('click', async () => {
  const url      = $('yt-url').value.trim();
  const format   = $('yt-format').value;
  const filename = $('yt-filename').value.trim();

  hideResult('youtube');

  if (!url)      { showResult('youtube', 'error', '⚠️ Ingresa la URL del video.'); return; }
  if (!filename) { showResult('youtube', 'error', '⚠️ Escribe el nombre de salida.'); return; }

  setBtnLoading('btn-youtube', true);
  appendLog('info', `[YouTube] Descargando ${format.toUpperCase()} → ${filename}`);

  try {
    const res = await fetch('/api/youtube/download', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url, format, filename }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showResult('youtube', 'success', `✅ ${data.message}`);
    appendLog('info', '[YouTube] Descarga iniciada. Monitorea la terminal.');
  } catch (err) {
    showResult('youtube', 'error', `❌ ${err.message}`);
    appendLog('error', `[YouTube] Error: ${err.message}`);
  } finally {
    setBtnLoading('btn-youtube', false);
  }
});

$('btn-youtube-clear').addEventListener('click', () => {
  $('yt-url').value      = '';
  $('yt-filename').value = '';
  hideResult('youtube');
});

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 3 — FUSIÓN DE AUDIOS
// ══════════════════════════════════════════════════════════════════════════════

/** Array<File> que mantiene los MP3 seleccionados en orden */
let fusionFiles = [];

// ── Referencias DOM ──────────────────────────────────────────────────────────
const fusionDropzone = $('fusion-dropzone');
const fusionInput    = $('fusion-audio-input');
const fusionList     = $('fusion-file-list');
const fusionContent  = $('fusion-dropzone-content');

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b) {
  if (b < 1024)         return `${b} B`;
  if (b < 1024 * 1024)  return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function renderFusionList() {
  fusionList.innerHTML = '';

  if (fusionFiles.length === 0) {
    fusionList.hidden = true;
    fusionDropzone.classList.remove('has-files');
    fusionContent.innerHTML = `
      <div class="dropzone-icon">🎵</div>
      <p class="dropzone-title">Arrastra tus MP3 aquí</p>
      <p class="dropzone-subtitle">o haz clic para seleccionar archivos</p>
      <span class="dropzone-hint">Solo .mp3 · Selección múltiple · Orden preservado</span>
    `;
    return;
  }

  fusionDropzone.classList.add('has-files');
  fusionContent.innerHTML = `
    <div class="dropzone-icon">✅</div>
    <span class="dropzone-badge">🎵 ${fusionFiles.length} archivo(s) seleccionado(s)</span>
    <p class="dropzone-subtitle">Haz clic para cambiar la selección</p>
  `;
  fusionList.hidden = false;

  fusionFiles.forEach((file, idx) => {
    const li = document.createElement('li');
    li.className = 'file-list-item';
    li.innerHTML = `
      <span class="file-order">${idx + 1}</span>
      <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
      <span class="file-size">${formatBytes(file.size)}</span>
      <button type="button" class="file-remove" data-idx="${idx}"
              aria-label="Eliminar ${escapeHtml(file.name)}">✕</button>
    `;
    fusionList.appendChild(li);
  });

  fusionList.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      fusionFiles.splice(parseInt(btn.dataset.idx, 10), 1);
      renderFusionList();
    });
  });
}

function addFusionFiles(fileList) {
  const mp3s = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.mp3'));
  mp3s.forEach(f => {
    if (!fusionFiles.find(e => e.name === f.name)) fusionFiles.push(f);
  });
  renderFusionList();
}

// ── Eventos del dropzone ─────────────────────────────────────────────────────

fusionInput.addEventListener('change', (e) => {
  addFusionFiles(e.target.files);
  e.target.value = ''; // permite volver a seleccionar los mismos archivos
});

fusionDropzone.addEventListener('dragover',  (e) => { e.preventDefault(); fusionDropzone.classList.add('drag-over'); });
fusionDropzone.addEventListener('dragleave', (e) => { if (!fusionDropzone.contains(e.relatedTarget)) fusionDropzone.classList.remove('drag-over'); });
fusionDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  fusionDropzone.classList.remove('drag-over');
  addFusionFiles(e.dataTransfer.files);
});
fusionDropzone.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fusionInput.click(); }
});

// ── Limpiar ──────────────────────────────────────────────────────────────────

$('btn-fusion-clear').addEventListener('click', () => {
  fusionFiles = [];
  renderFusionList();
  $('fusion-filename').value = '';
  hideResult('fusion');
});

// ── ENVÍO — type="button", fetch, FormData ────────────────────────────────────
// Sin ningún <form>, sin submit, sin riesgo de GET.

$('btn-fusion').addEventListener('click', async () => {
  hideResult('fusion');

  const filename = $('fusion-filename').value.trim();

  // Validaciones
  if (fusionFiles.length < 2) {
    showResult('fusion', 'error', '⚠️ Selecciona al menos 2 archivos MP3.');
    return;
  }
  if (!filename) {
    showResult('fusion', 'error', '⚠️ Escribe el nombre del archivo final.');
    return;
  }

  setBtnLoading('btn-fusion', true);
  appendLog('info', `[Fusión] Subiendo ${fusionFiles.length} archivo(s) al servidor…`);

  try {
    // Construir FormData — los archivos binarios + el nombre
    const fd = new FormData();
    fusionFiles.forEach(f => fd.append('audioFiles', f, f.name));
    fd.append('filename', filename);

    // POST multipart — NO añadir Content-Type (el navegador lo pone con boundary)
    const res = await fetch('/api/fusion/merge', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    showResult('fusion', 'success', `✅ ${data.message}`);
    appendLog('info', '[Fusión] Proceso iniciado. Monitorea la terminal.');
  } catch (err) {
    showResult('fusion', 'error', `❌ ${err.message}`);
    appendLog('error', `[Fusión] Error al enviar: ${err.message}`);
  } finally {
    setBtnLoading('btn-fusion', false);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO 4 — GENERADOR DE AUDIO DESDE GUION
// ══════════════════════════════════════════════════════════════════════════════

$('btn-guion').addEventListener('click', async () => {
  const texto    = $('guion-texto').value.trim();
  const filename = $('guion-filename').value.trim();
  const voice    = $('guion-voice').value;

  hideResult('guion');

  if (!texto)    { showResult('guion', 'error', '⚠️ Ingresa el texto del guion.'); return; }
  if (!filename) { showResult('guion', 'error', '⚠️ Escribe el nombre del archivo final.'); return; }

  setBtnLoading('btn-guion', true);
  appendLog('info', `[Guion] Iniciando → ${filename}`);

  try {
    const res = await fetch('/api/guion-voz/process', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ texto, filename, voice }),
    });
    
    // Validación para evitar el error "is not valid JSON"
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('La ruta no existe en el backend. Por favor, asegúrate de reiniciar el servidor Node (Ctrl+C y npm start).');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    showResult('guion', 'success', `✅ ${data.message} — monitorea la terminal.`);
    appendLog('info', `[Guion] Proceso en curso → ${data.filename}.mp3`);
  } catch (err) {
    showResult('guion', 'error', `❌ ${err.message}`);
    appendLog('error', `[Guion] Error: ${err.message}`);
  } finally {
    setBtnLoading('btn-guion', false);
  }
});

$('btn-guion-clear').addEventListener('click', () => {
  $('guion-texto').value    = '';
  $('guion-filename').value = '';
  $('guion-voice').value    = 'es-MX-JorgeNeural';
  hideResult('guion');
});

// ══════════════════════════════════════════════════════════════════════════════
// INICIO
// ══════════════════════════════════════════════════════════════════════════════

connectSSE();
