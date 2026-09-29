/* ═══ SyncroFlow — js/core/router.js ═══ */
import { state } from './state.js';
import { $, $$, clear } from './dom.js';
import { emit } from './events.js';

const views = {};
export function registerView(name, mod) { views[name] = mod; }

export async function switchView(name) {
  if (!views[name]) name = 'board';
  state.view = name;
  localStorage.setItem('syncro_last_view', name);
  $$('.nav-item[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === name ? 'true' : 'false'));
  const main = $('#main');
  clear(main);
  try {
    await views[name].render(main);
  } catch (e) {
    console.error('view error', e);
    main.innerHTML = `<div class="empty-state"><h3>Falha ao renderizar a view</h3><p>${e.message}</p></div>`;
  }
  // Animação de entrada da view (re-dispara a cada troca de aba)
  if (main) { main.classList.remove('view-enter'); void main.offsetWidth; main.classList.add('view-enter'); }
  emit('view:changed', name);
}
