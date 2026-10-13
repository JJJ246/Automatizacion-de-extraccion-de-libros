/**
 * utils/sanitize.js
 * Saneamiento global de nombres de archivos para Windows.
 * Reemplaza caracteres prohibidos por guiones medios.
 */

const FORBIDDEN_CHARS = /[:\\*?"<>|]/g;

/**
 * @param {string} name - Nombre de archivo a sanear
 * @returns {string} - Nombre seguro para Windows
 */
function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'output';
  return name
    .replace(FORBIDDEN_CHARS, '-')  // reemplaza caracteres prohibidos
    .replace(/\s+/g, '_')           // reemplaza espacios por guiones bajos
    .replace(/-{2,}/g, '-')         // colapsa múltiples guiones
    .trim();
}

module.exports = { sanitizeFilename };
