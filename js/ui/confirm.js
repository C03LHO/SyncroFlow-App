/* ═══ SyncroFlow — js/ui/confirm.js
   Diálogo de confirmação no estilo do sistema (substitui o confirm()
   nativo do navegador). Retorna uma Promise<boolean>. */
import { escapeHTML } from '../core/dom.js';

let openCount = 0;

export function confirmDialog({
  title = 'Confirmar',
  message = '',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  danger = false,
  icon = null,
} = {}) {
  return new Promise(resolve => {
    const mount = document.querySelector('#modal-mount') || document.body;
    const backdrop = document.createElement('div');
    const dialogId = `confirm-dialog-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const titleId = `${dialogId}-title`;
    const messageId = `${dialogId}-message`;
    backdrop.className = 'confirm-backdrop';
    backdrop.innerHTML = `
      <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${messageId}" tabindex="-1">
        <div class="confirm-icon ${danger ? 'danger' : ''}">${icon ?? (danger ? '⚠️' : '❔')}</div>
        <div class="confirm-body">
          <h3 id="${titleId}" class="confirm-title">${escapeHTML(title)}</h3>
          <p id="${messageId}" class="confirm-message">${escapeHTML(message)}</p>
        </div>
        <div class="confirm-actions">
          <button class="btn btn-secondary" data-act="cancel">${escapeHTML(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${escapeHTML(confirmText)}</button>
        </div>
      </div>`;

    let done = false;
    const previousOverflow = document.body.style.overflow;
    const finish = (val) => {
      if (done) return; done = true;
      backdrop.classList.add('closing');
      document.removeEventListener('keydown', onKey, true);
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.body.style.overflow = previousOverflow;
      setTimeout(() => { backdrop.remove(); }, 150);
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
    };

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(false);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') finish(false);
      if (act === 'ok') finish(true);
    });
    document.addEventListener('keydown', onKey, true);

    mount.appendChild(backdrop);
    openCount++;
    if (openCount === 1) document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => backdrop.classList.add('open'));
    setTimeout(() => backdrop.querySelector('[data-act="ok"]')?.focus(), 40);
  });
}
