/**
 * server.js - Servidor principal del Proyecto Automatización
 * Express + SSE para consola virtual en tiempo real
 */

const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// ─── Middlewares ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── SSE – Cola global de logs ────────────────────────────────────────────────
const sseClients = [];

/**
 * Emite un mensaje a todos los clientes SSE conectados.
 * También intercepta los console.log del proceso.
 */
function broadcastLog(level, ...args) {
  const message = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ');
  const payload = JSON.stringify({ level, message, ts: new Date().toISOString() });
  sseClients.forEach(res => {
    try { res.write(`data: ${payload}\n\n`); } catch (_) {}
  });
}

// Interceptar console.log / console.error / console.warn globalmente
const _origLog   = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn  = console.warn.bind(console);

console.log   = (...a) => { _origLog(...a);   broadcastLog('info',  ...a); };
console.error = (...a) => { _origError(...a); broadcastLog('error', ...a); };
console.warn  = (...a) => { _origWarn(...a);  broadcastLog('warn',  ...a); };

// Exponer broadcastLog para controladores
app.locals.broadcastLog = broadcastLog;

// ─── Ruta SSE ─────────────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Ping cada 20 s para mantener la conexión viva
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) { clearInterval(ping); }
  }, 20000);

  sseClients.push(res);
  console.log(`[SSE] Cliente conectado. Total: ${sseClients.length}`);

  req.on('close', () => {
    clearInterval(ping);
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
    console.log(`[SSE] Cliente desconectado. Total: ${sseClients.length}`);
  });
});

// ─── Rutas de módulos ─────────────────────────────────────────────────────────
app.use('/api/fanfic',    require('./routes/fanfic'));
app.use('/api/youtube',   require('./routes/youtube'));
app.use('/api/fusion',    require('./routes/fusion'));
app.use('/api/guion-voz', require('./routes/guion'));

// ─── Ruta comodín → SPA ──────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Arranque ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Módulos: Fanfic | YouTube | Fusión de Audios`);
});
