/* ═══ SyncroFlow — js/ui/command-palette.js
   Busca global estilo "command palette" (Ctrl/Cmd+K).
   Acha cards (em todas as equipes do usuário), equipes e pessoas;
   navega por teclado e abre o item escolhido. */
import { state, switchTeam } from '../core/state.js';
import { switchView } from '../core/router.js';
import { api } from '../core/api.js';
import { escapeHTML } from '../core/dom.js';
import { toast } from './toast.js';

let isOpen = false;
let results = [];
let sel = 0;
let reqSeq = 0;

export function openCommandPalette() {
  if (isOpen) return;
  isOpen = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'cmdp-backdrop';
  backdrop.innerHTML = `
    <div class="cmdp" role="dialog" aria-label="Busca global">
      <div class="cmdp-input-wrap">
        <span class="cmdp-ico">🔎</span>
        <input class="cmdp-input" type="text" autocomplete="off" spellcheck="false"
               placeholder="Buscar cards, equipes, pessoas…">
        <kbd class="cmdp-kbd">esc</kbd>
      </div>
      <div class="cmdp-results" role="listbox"></div>
      <div class="cmdp-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>↵</kbd> abrir</span><span><kbd>esc</kbd> fechar</span></div>
    </div>`;
  (document.querySelector('#modal-mount') || document.body).appendChild(backdrop);

  const input = backdrop.querySelector('.cmdp-input');
  const list  = backdrop.querySelector('.cmdp-results');
  let timer = null;

  const close = () => {
    isOpen = false; results = []; sel = 0;
    document.removeEventListener('keydown', onKey, true);
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 120);
  };

  function render(items, q) {
    results = items; sel = 0;
    if (!items.length) {
      list.innerHTML = `<div class="cmdp-empty">${q.length < 2 ? 'Digite ao menos 2 letras para buscar…' : 'Nada encontrado para “' + escapeHTML(q) + '”.'}</div>`;
      return;
    }
    list.innerHTML = items.map((it, i) => `
      <div class="cmdp-item ${i === 0 ? 'sel' : ''}" data-i="${i}" role="option">
        <span class="cmdp-item-ico">${it.icon}</span>
        <span class="cmdp-item-main">
          <span class="cmdp-item-title">${escapeHTML(it.title)}</span>
          ${it.sub ? `<span class="cmdp-item-sub">${escapeHTML(it.sub)}</span>` : ''}
        </span>
        <span class="cmdp-item-kind">${escapeHTML(it.kindLabel)}</span>
      </div>`).join('');
    list.querySelectorAll('.cmdp-item').forEach(el => {
      el.addEventListener('mousemove', () => setSel(+el.dataset.i));
      el.addEventListener('click', () => activate(+el.dataset.i));
    });
  }

  function setSel(i) {
    sel = i;
    list.querySelectorAll('.cmdp-item').forEach((el, idx) => el.classList.toggle('sel', idx === i));
    list.querySelector('.cmdp-item.sel')?.scrollIntoView({ block: 'nearest' });
  }

  async function activate(i) {
    const it = results[i];
    if (!it) return;
    close();
    try { await it.run(); } catch (e) { toast(e.message || 'Falha ao abrir.', 'error'); }
  }

  async function doSearch(q) {
    const seq = ++reqSeq;
    let d;
    try { d = await api.call('search.php', 'query', { q }, 'GET'); }
    catch { return; }
    if (seq !== reqSeq || !isOpen) return;   // resposta obsoleta

    const items = [];
    (d.cards || []).forEach(c => items.push({
      icon: '📇',
      title: c.title || '(sem título)',
      sub: [c.teamName, c.assignee || ''].filter(Boolean).join(' · ') + (c.archived ? ' · arquivado' : ''),
      kindLabel: 'Card',
      run: async () => {
        if (c.teamId && c.teamId !== state.currentTeamId) { try { await switchTeam(c.teamId); } catch (e) {} }
        switchView('board');
        const m = await import('../modals/card-modal.js');
        m.openCardModal(c.id);
      },
    }));
    (d.teams || []).forEach(t => items.push({
      icon: t.icon || '👥',
      title: t.name,
      sub: 'Abrir quadro da equipe',
      kindLabel: 'Equipe',
      run: async () => { await switchTeam(t.id); switchView('board'); },
    }));
    (d.people || []).forEach(p => items.push({
      icon: '🧑',
      title: p.name,
      sub: '@' + p.user_id,
      kindLabel: 'Pessoa',
      run: async () => { switchView('usuarios'); },
    }));
    render(items, q);
  }

  function onKey(e) {
    if (!isOpen) return;
    if (e.key === 'Escape')         { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(sel + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(Math.max(sel - 1, 0)); }
    else if (e.key === 'Enter')     { e.preventDefault(); activate(sel); }
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 2) { render([], q); return; }
    timer = setTimeout(() => doSearch(q), 180);
  });
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) close(); });

  render([], '');
  requestAnimationFrame(() => backdrop.classList.add('open'));
  setTimeout(() => input.focus(), 30);
}
