/* ═══ SyncroFlow — js/core/theme.js ═══
   Paletas base (data-theme). Os temas "Executivos" NÃO têm paleta própria:
   reaproveitam exatamente as cores padrão (Claro/Escuro) e apenas ligam o
   MODO EXECUTIVO (classe .exec-mode) — mais sério, sem o mascote Tobi. Assim
   as cores ficam idênticas às padrão e nada mais precisa ser duplicado. */
export const THEMES = ['light','dark','sage','dusk','sand','dracula','cyberpunk','abyss'];
const EXEC = { 'exec-light': 'light', 'exec-dark': 'dark' };

export function applyTheme(name) {
  const isExec = Object.prototype.hasOwnProperty.call(EXEC, name);
  let base = isExec ? EXEC[name] : name;
  if (!THEMES.includes(base)) { base = 'light'; if (!isExec) name = 'light'; }
  const html = document.documentElement;
  html.setAttribute('data-theme', base);
  html.classList.toggle('exec-mode', isExec);   // esconde o Tobi + ar mais sério
  try { localStorage.setItem('syncro_theme', name); } catch {}
}

export function currentTheme() {
  // Devolve o id ESCOLHIDO (inclui exec-*), para o seletor destacar o certo.
  try { return localStorage.getItem('syncro_theme') || document.documentElement.getAttribute('data-theme') || 'light'; }
  catch { return document.documentElement.getAttribute('data-theme') || 'light'; }
}
