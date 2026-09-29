/* ═══ SyncroFlow — js/ui/dropdown.js
   Dropdown customizado (single ou multi) — substitui o <select> nativo para
   que a LISTA de opções use o CSS do site (e não o visual do navegador).
   Reutilizável: card-modal (Responsável/Solicitado/Ajudantes), perfil, etc.
   options: [{ value, label, sub }]. Retorna API { value, set(v) }. */
import { escapeHTML } from '../core/dom.js';

export function makeDropdown(host, { multi = false, placeholder = 'Selecione…', value, options = [], disabled = false, emptyText = 'Nenhuma opção disponível.', onChange } = {}) {
  let val = multi ? [...(value || [])] : (value || '');
  host.className = 'cm-dd' + (disabled ? ' is-disabled' : '');
  host.innerHTML = '';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'cm-dd-btn'; btn.disabled = !!disabled;
  const lbl = document.createElement('span'); lbl.className = 'cm-dd-label';
  const caret = document.createElement('span'); caret.className = 'cm-dd-caret'; caret.textContent = '▾';
  btn.append(lbl, caret);
  const panel = document.createElement('div'); panel.className = 'cm-dd-panel'; panel.hidden = true;
  const showSearch = options.length > 5;
  const searchWrap = document.createElement('div'); searchWrap.className = 'cm-dd-search-wrap';
  searchWrap.innerHTML = `<span class="cm-dd-search-ico">🔎</span><input type="text" class="cm-dd-search" placeholder="Buscar…" autocomplete="off">`;
  const list = document.createElement('div'); list.className = 'cm-dd-list';
  if (showSearch) panel.appendChild(searchWrap);
  panel.appendChild(list);
  const searchInput = searchWrap.querySelector('.cm-dd-search');
  let filterText = '';
  host.append(btn, panel);

  const labelOf = v => { const o = options.find(o => o.value === v); return o ? o.label : v; };
  function renderLabel() {
    if (multi) {
      lbl.innerHTML = (!val.length)
        ? `<span class="cm-dd-ph">${escapeHTML(placeholder)}</span>`
        : val.map(v => `<span class="cm-dd-chip">${escapeHTML(labelOf(v))}<button type="button" data-rm="${escapeHTML(v)}" title="Remover">×</button></span>`).join('');
    } else {
      const o = options.find(o => o.value === val);
      lbl.innerHTML = (o && o.value !== '') ? escapeHTML(o.label)
        : (val ? escapeHTML(val) : `<span class="cm-dd-ph">${escapeHTML(placeholder)}</span>`);
    }
  }
  function renderPanel() {
    const q = filterText.trim().toLowerCase();
    const shown = options.filter(o => !q || (o.label + ' ' + (o.sub || '')).toLowerCase().includes(q));
    if (!options.length) { list.innerHTML = `<div class="cm-dd-empty">${escapeHTML(emptyText)}</div>`; return; }
    list.innerHTML = shown.length ? shown.map(o => {
      const on = multi ? val.includes(o.value) : (val === o.value);
      return `<div class="cm-dd-opt${on ? ' on' : ''}" data-val="${escapeHTML(o.value)}" role="option" aria-selected="${on}">
        ${multi ? `<span class="cm-dd-box">${on ? '✓' : ''}</span>` : ''}
        <span class="cm-dd-opt-label">${escapeHTML(o.label)}</span>
        ${o.sub ? `<span class="cm-dd-opt-sub">${escapeHTML(o.sub)}</span>` : ''}
      </div>`;
    }).join('') : `<div class="cm-dd-empty">Nada encontrado para “${escapeHTML(filterText)}”.</div>`;
  }
  if (searchInput) searchInput.addEventListener('input', () => { filterText = searchInput.value; renderPanel(); if (!panel.hidden) position(); });
  function position() {
    const r = btn.getBoundingClientRect();
    const margin = 8;
    panel.style.position = 'fixed';
    panel.style.left = r.left + 'px';
    panel.style.right = 'auto';
    panel.style.width = r.width + 'px';
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    const full = panel.scrollHeight || 240;
    if (below >= Math.min(full, 240) || below >= above) {
      panel.style.top = (r.bottom + 4) + 'px';
      panel.style.maxHeight = Math.max(120, Math.min(240, below)) + 'px';
    } else {
      const h = Math.max(120, Math.min(240, above));
      panel.style.maxHeight = h + 'px';
      panel.style.top = (r.top - h - 4) + 'px';
    }
  }
  function open() {
    if (btn.disabled) return;
    filterText = ''; if (searchInput) searchInput.value = '';
    renderPanel();
    document.body.appendChild(panel);
    panel.hidden = false; position();
    btn.setAttribute('aria-expanded', 'true'); host.classList.add('open');
    if (searchInput) setTimeout(() => searchInput.focus(), 30);
    document.addEventListener('mousedown', outside, true);
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
  }
  function close() {
    panel.hidden = true;
    if (panel.parentNode === document.body) host.appendChild(panel);
    panel.style.position = ''; panel.style.left = panel.style.top = panel.style.width = panel.style.right = panel.style.maxHeight = '';
    btn.setAttribute('aria-expanded', 'false'); host.classList.remove('open');
    document.removeEventListener('mousedown', outside, true);
    window.removeEventListener('scroll', position, true);
    window.removeEventListener('resize', position);
  }
  function outside(e) { if (!host.contains(e.target) && !panel.contains(e.target)) close(); }

  btn.addEventListener('click', e => { e.stopPropagation(); panel.hidden ? open() : close(); });
  panel.addEventListener('click', e => {
    const opt = e.target.closest('.cm-dd-opt'); if (!opt) return;
    const v = opt.dataset.val;
    if (multi) { val = val.includes(v) ? val.filter(x => x !== v) : [...val, v]; renderLabel(); renderPanel(); if (!panel.hidden) position(); onChange && onChange(val); }
    else { val = v; renderLabel(); close(); onChange && onChange(val); }
  });
  lbl.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]'); if (!rm) return;
    e.stopPropagation(); val = val.filter(x => x !== rm.dataset.rm); renderLabel(); onChange && onChange(val);
  });
  renderLabel();
  return { get value() { return val; }, set(v) { val = multi ? [...(v || [])] : (v || ''); renderLabel(); } };
}
