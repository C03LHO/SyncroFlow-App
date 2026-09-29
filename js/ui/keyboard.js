/* ═══ SyncroFlow — js/ui/keyboard.js
   Atalhos: / (busca), Ctrl/Cmd+K (paleta), T (tema), E (exportar),
   N (novo card), 1..9 (views). A aba de Atalhos (main.js) é gerada a
   partir de VIEW_KEYS/VIEW_LABELS daqui → nunca sai de sincronia.
   ═══════════════════════════════════════════════════════════ */
import { $ } from '../core/dom.js';
import { switchView } from '../core/router.js';
import { openThemePicker } from './theme-picker.js';

/** Views acessíveis pelas teclas 1..9 (nesta ordem, seguindo os grupos da
    sidebar: Trabalho → Análise → Pessoas). FONTE ÚNICA (alimenta o modal de atalhos). */
export const VIEW_KEYS = ['board','meudia','mypanel','calendar','ferias','dashboard','metrics','gantt','equipes'];
export const VIEW_LABELS = {
  board: 'Quadro', meudia: 'Meu Dia', mypanel: 'Meu Painel', calendar: 'Calendário',
  ferias: 'Ausências', dashboard: 'Dashboard', metrics: 'Métricas', gantt: 'Gantt',
  equipes: 'Equipes',
};

export function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Paleta de comandos (Ctrl/Cmd + K) — funciona em qualquer lugar, até em inputs
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      import('./command-palette.js').then(m => m.openCommandPalette());
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input','textarea','select'].includes(tag) || e.target.isContentEditable) return;

    if (e.key === '/') { e.preventDefault(); $('#global-search')?.focus(); return; }

    // As teclas simples abaixo não disparam com Ctrl/Alt/Cmd (evita conflito
    // com Alt+A da acessibilidade e atalhos do SO).
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    if ((e.key === 't' || e.key === 'T') && !e.shiftKey) { openThemePicker(); return; }
    if ((e.key === 'e' || e.key === 'E') && !e.shiftKey) { e.preventDefault(); $('#btn-export')?.click(); return; }
    if ((e.key === 'n' || e.key === 'N') && !e.shiftKey) {
      import('../modals/card-modal.js').then(m => m.openCardModal(null));
      return;
    }
    const idx = parseInt(e.key, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= VIEW_KEYS.length) {
      switchView(VIEW_KEYS[idx - 1]);
    }
  });
}
