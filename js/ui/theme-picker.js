/* ═══ SyncroFlow — js/ui/theme-picker.js
   Popover de seleção de tema.
   - Duas seções: Claros e Escuros
   - Click numa opção aplica imediatamente (sem botão confirmar)
   - Click fora ou Esc fecha
   - Reabre na mesma posição se já estiver aberto (toggle) */
import { applyTheme, currentTheme } from '../core/theme.js';
import { escapeHTML } from '../core/dom.js';

const THEMES = {
  light: [
    { id: 'light',   name: 'Padrão', bg: '#EEF3F6', ring: '#0E5C56' },
    { id: 'sage',    name: 'Sage',          bg: '#EBF0E8', ring: '#2E7D4A' },
    { id: 'dusk',    name: 'Dusk',          bg: '#EEE8F5', ring: '#6244A0' },
    { id: 'sand',    name: 'Sand',          bg: '#EFE8DC', ring: '#8B5E2A' },
  ],
  dark: [
    { id: 'dark',      name: 'Padrão',     bg: '#102329', ring: null },
    { id: 'dracula',   name: 'Dracula',    bg: '#282a36', ring: '#bd93f9' },
    { id: 'cyberpunk', name: 'Cyberpunk',  bg: '#0d0221', ring: '#ff0080' },
    { id: 'abyss',     name: 'Really Dark',bg: '#000814', ring: '#3b82f6' },
  ],
  // Modo sério: mesmas cores dos padrões (Claro/Escuro), sem o mascote Tobi.
  exec: [
    { id: 'exec-light', name: 'Executivo Claro',  bg: '#EEF3F6', ring: '#334155' },
    { id: 'exec-dark',  name: 'Executivo Escuro', bg: '#102329', ring: '#64748b' },
  ],
};

let openPopover = null;

export function openThemePicker(anchorBtn) {
  // Toggle: se já está aberto, fecha
  if (openPopover) {
    closeThemePicker();
    return;
  }
  // Localiza âncora — argumento ou o botão #btn-theme
  const anchor = anchorBtn || document.getElementById('btn-theme');
  if (!anchor) return;

  const cur = currentTheme();

  const pop = document.createElement('div');
  pop.className = 'theme-popover';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Escolher tema');

  const renderSection = (label, items) => `
    <div class="theme-popover-label">${escapeHTML(label)}</div>
    <div class="theme-options">
      ${items.map(t => `
        <button type="button"
                class="theme-option ${t.id === cur ? 'active' : ''}"
                data-theme-set="${t.id}">
          <span class="theme-swatch"
                style="background:${t.bg};${t.ring ? `box-shadow: inset 0 0 0 2px ${t.ring}` : ''}"></span>
          <span>${escapeHTML(t.name)}</span>
        </button>
      `).join('')}
    </div>
  `;

  pop.innerHTML = `
    <div class="theme-popover-label" style="font-size:13px;font-weight:800;color:var(--text);letter-spacing:0;text-transform:none;margin-bottom:4px;">Tema</div>
    ${renderSection('Claros',  THEMES.light)}
    ${renderSection('Escuros', THEMES.dark)}
    ${renderSection('Executivos (sério, sem mascote)', THEMES.exec)}
  `;

  document.body.appendChild(pop);
  positionPopover(pop, anchor);
  openPopover = pop;

  // Click em opção → aplica imediatamente + atualiza .active
  pop.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-set]');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.dataset.themeSet;
    applyTheme(id);
    pop.querySelectorAll('.theme-option').forEach(o =>
      o.classList.toggle('active', o.dataset.themeSet === id));
  });

  // Click fora fecha
  setTimeout(() => {
    document.addEventListener('click', clickOutsideHandler, { capture: true });
    document.addEventListener('keydown', escHandler);
    window.addEventListener('resize', closeThemePicker);
    window.addEventListener('scroll', closeThemePicker, true);
  }, 0);
}

function positionPopover(pop, anchor) {
  const rect = anchor.getBoundingClientRect();
  // Posiciona ABAIXO e alinhado à direita do botão
  // Quando estiver na sidebar (esquerda), abre para a direita; quando estiver na topbar, abre para baixo/esquerda
  const inSidebar = !!anchor.closest('.sidebar');
  if (inSidebar) {
    pop.style.left = (rect.right + 8) + 'px';
    pop.style.bottom = (window.innerHeight - rect.bottom) + 'px';
  } else {
    pop.style.top = (rect.bottom + 8) + 'px';
    pop.style.right = (window.innerWidth - rect.right) + 'px';
  }
  // Garante visibilidade (corrige bordas direita, esquerda, baixo e cima)
  requestAnimationFrame(() => {
    let popRect = pop.getBoundingClientRect();
    if (popRect.right > window.innerWidth - 8) {
      pop.style.left = 'auto';
      pop.style.right = '12px';
    }
    popRect = pop.getBoundingClientRect();
    if (popRect.left < 8) {
      pop.style.right = 'auto';
      pop.style.left = '12px';
    }
    if (popRect.bottom > window.innerHeight - 8) {
      pop.style.top = 'auto';
      pop.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    }
    popRect = pop.getBoundingClientRect();
    if (popRect.top < 8) {
      pop.style.bottom = 'auto';
      pop.style.top = '12px';
    }
  });
}

function clickOutsideHandler(e) {
  if (!openPopover) return;
  if (openPopover.contains(e.target)) return;
  // Não fechar se o click foi no próprio botão do tema (será toggle)
  if (e.target.closest('#btn-theme')) return;
  closeThemePicker();
}

function escHandler(e) {
  if (e.key === 'Escape') closeThemePicker();
}

export function closeThemePicker() {
  if (!openPopover) return;
  openPopover.remove();
  openPopover = null;
  document.removeEventListener('click', clickOutsideHandler, { capture: true });
  document.removeEventListener('keydown', escHandler);
  window.removeEventListener('resize', closeThemePicker);
  window.removeEventListener('scroll', closeThemePicker, true);
}
