/* ═══ SyncroFlow — js/views/archived.js
   Mostra SOMENTE cards arquivados pelo usuário atual.
   O backend reforça isso em state.php e poll.php; isto aqui é
   a tela. */
import { state } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { fmtDate, fmtSmart } from '../core/format.js';
import { openCardModal } from '../modals/card-modal.js';

export const archived = {
  render(mount) {
    const me = (state.currentUser?.name || '').toLowerCase();
    const list = state.cards.filter(c => c.archived && (c.archivedBy || '').toLowerCase() === me);
    if (!list.length) {
      mount.innerHTML = `<div class="empty-state">📦<h3>Nenhum card arquivado</h3><p>Cards que você arquivar aparecem aqui.</p></div>`;
      return;
    }
    mount.innerHTML = `
      <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:12px;">
        Mostrando ${list.length} card(s) que você arquivou. Cards arquivados por outros usuários não aparecem aqui.
      </p>
      <div class="board-grid" style="flex-wrap:wrap;">
        ${list.map(c => `
          <article class="card-tile" data-id="${escapeHTML(c.id)}" style="width:300px;">
            <h4>${escapeHTML(c.title)}</h4>
            <div class="card-meta">
              ${c.assignee ? `<span class="chip">${escapeHTML(c.assignee)}</span>` : ''}
              <span class="chip">📦 ${escapeHTML(fmtSmart(c.archivedAt, true))}</span>
              ${c.dueDate ? `<span>📅 ${escapeHTML(fmtDate(c.dueDate))}</span>` : ''}
            </div>
          </article>`).join('')}
      </div>`;
    mount.querySelectorAll('.card-tile').forEach(el => {
      el.onclick = () => openCardModal(el.dataset.id);
    });
  }
};
