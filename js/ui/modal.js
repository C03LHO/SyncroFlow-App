/* ═══ SyncroFlow — js/ui/modal.js
   Modal com guarda anti-perda-de-dados: se o
   conteúdo estiver "sujo" (editado), clicar fora / Esc / ✕ pede
   confirmação antes de fechar. Saves explícitos usam closeModal(true). */
import { $, el } from '../core/dom.js';
import { confirmDialog } from './confirm.js';
import { trapFocus } from '../a11y/focus-trap.js';

let activeModal = null;
let modalSeq = 0;

export function openModal({ title = '', body = '', footer = '', onClose, guard = null, wide = false }) {
  closeModal(true);
  const mount = $('#modal-mount');
  const titleId = `modal-title-${++modalSeq}`;
  const backdrop = el(`
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}"${wide ? ' style="max-width:min(960px,calc(100vw - 32px));"' : ''}>
        <div class="modal-header">
          <h2 id="${titleId}"></h2>
          <button class="icon-btn modal-close" data-close title="Fechar" aria-label="Fechar">✕</button>
        </div>
        <div class="modal-body"></div>
        ${footer ? `<div class="modal-footer"></div>` : ''}
      </div>
    </div>
  `);

  // Título aceita HTML (kicker, ícones, etc.)
  backdrop.querySelector('h2').innerHTML = title;

  const bodyEl = backdrop.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);

  if (footer) {
    const f = backdrop.querySelector('.modal-footer');
    if (typeof footer === 'string') f.innerHTML = footer;
    else f.appendChild(footer);
  }

  backdrop.addEventListener('click', e => {
    if (e.target === backdrop || e.target.closest('[data-close]')) {
      e.preventDefault();
      attemptClose();
    }
  });
  document.addEventListener('keydown', escClose);

  mount.appendChild(backdrop);

  // Acessibilidade: prende o foco no diálogo, dá foco inicial ao 1º campo
  // (ou ao botão fechar) e devolve o foco ao gatilho quando fechar.
  const dialog = backdrop.querySelector('.modal');
  const firstField = dialog.querySelector('.modal-body input, .modal-body select, .modal-body textarea, .modal-body button, .modal-body [tabindex]');
  const release = trapFocus(dialog, { initialFocus: firstField || backdrop.querySelector('.modal-close') });

  activeModal = { backdrop, onClose, guard, release };
  return backdrop;
}

function escClose(e) { if (e.key === 'Escape') attemptClose(); }

/** Tenta fechar; se houver guarda "suja", confirma antes. */
async function attemptClose() {
  if (!activeModal) return;
  const { guard } = activeModal;
  if (typeof guard === 'function') {
    let dirty = false;
    try { dirty = !!guard(); } catch { dirty = false; }
    if (dirty) {
      const ok = await confirmDialog({
        title: 'Alterações não salvas',
        message: 'Você tem alterações que ainda não foram salvas. Deseja descartá-las e fechar?',
        confirmText: 'Descartar e fechar',
        cancelText: 'Continuar editando',
        danger: true,
      });
      if (!ok) return; // mantém o modal aberto
    }
  }
  closeModal(true);
}

/** Fecha o modal. force=true pula a guarda (usado por Save). */
export function closeModal(force = false) {
  if (!activeModal) return;
  if (!force) { attemptClose(); return; }
  const { backdrop, onClose, release } = activeModal;
  activeModal = null;
  if (typeof release === 'function') { try { release(); } catch {} }   // devolve o foco ao gatilho
  backdrop.remove();
  document.removeEventListener('keydown', escClose);
  try { onClose && onClose(); } catch {}
}
