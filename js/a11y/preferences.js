/* ═══ SyncroFlow — js/a11y/preferences.js
   Fonte única de verdade das preferências de acessibilidade.
   Persiste em localStorage; se o ambiente bloquear, cai para memória.
   A função applyPrefsToDOM() é a MESMA lógica replicada inline em
   partials/_head.php (para aplicar antes do paint, sem "flash"). Se
   mudar o mapeamento de classes aqui, atualize lá também. */

const STORAGE_KEY = 'syncro_a11y';

/* Mapeamento preferência → classe no <html>. */
export const A11Y_FLAGS = {
  contrast:       'a11y-contrast',
  readableFont:   'a11y-readable-font',
  links:          'a11y-links',
  focusHighlight: 'a11y-focus',
  spacing:        'a11y-spacing',
  reading:        'a11y-reading',
  reduceMotion:   'a11y-reduce-motion',
};

export const FONT_MIN = 0.9;
export const FONT_MAX = 1.8;
export const FONT_STEP = 0.1;

const DEFAULTS = Object.freeze({
  fontScale: 1,
  contrast: false,
  readableFont: false,
  links: false,
  focusHighlight: false,
  spacing: false,
  reading: false,
  reduceMotion: false,
  readOnHover: false,   // leitura em voz do elemento sob o mouse/foco (comportamental, sem classe)
  mascot: true,         // mascote Tobi visível (false → esconde via classe .tobi-off no <html>)
});

let memoryFallback = null;       // usado quando localStorage não está disponível
let current = null;
const listeners = new Set();

function readRaw() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return memoryFallback;       // modo privado / storage bloqueado
  }
}
function writeRaw(obj) {
  memoryFallback = obj;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch { /* mantém em memória */ }
}

function clampFont(n) {
  n = Number(n);
  if (!isFinite(n)) return 1;
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n * 100) / 100));
}

/** Lê as preferências (mescladas com os padrões). */
export function getPrefs() {
  if (!current) current = { ...DEFAULTS, ...(readRaw() || {}) };
  current.fontScale = clampFont(current.fontScale);
  return { ...current };
}

/** Aplica um objeto de preferências ao <html> (classes + variável de zoom). */
export function applyPrefsToDOM(prefs) {
  const html = document.documentElement;
  for (const [key, cls] of Object.entries(A11Y_FLAGS)) {
    html.classList.toggle(cls, !!prefs[key]);
  }
  // Mascote Tobi: lógica INVERSA (classe presente quando DESLIGADO).
  html.classList.toggle('tobi-off', prefs.mascot === false);
  html.style.setProperty('--a11y-zoom', String(clampFont(prefs.fontScale)));
}

function commit(next) {
  current = { ...next, fontScale: clampFont(next.fontScale) };
  writeRaw(current);
  applyPrefsToDOM(current);
  listeners.forEach(fn => { try { fn(getPrefs()); } catch {} });
}

/** Define uma preferência específica. */
export function setPref(key, value) {
  const next = { ...getPrefs(), [key]: value };
  commit(next);
  return getPrefs();
}

/** Define várias de uma vez. */
export function setPrefs(partial) {
  commit({ ...getPrefs(), ...partial });
  return getPrefs();
}

/** Aumenta/diminui a fonte por um delta (ex.: +0.1 / -0.1). */
export function stepFont(delta) {
  return setPref('fontScale', clampFont(getPrefs().fontScale + delta));
}

/** Restaura tudo ao padrão. */
export function resetPrefs() {
  commit({ ...DEFAULTS });
  return getPrefs();
}

/* Perfis prontos — cada um parte do padrão e liga só o que faz sentido. */
export const PRESETS = {
  lowVision:   { contrast: true,  readableFont: true, fontScale: 1.4, focusHighlight: true, links: true },
  calmReading: { reading: true,   spacing: true,      readableFont: true, reduceMotion: true },
  keyboard:    { focusHighlight: true, reduceMotion: true, links: true },
};

/** Aplica um perfil (limpa o resto para um estado previsível). */
export function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return getPrefs();
  commit({ ...DEFAULTS, ...preset });
  return getPrefs();
}

/** Inscreve um observador; retorna a função para cancelar. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Aplica o estado salvo agora (idempotente). */
export function initPrefs() {
  applyPrefsToDOM(getPrefs());
  return getPrefs();
}
