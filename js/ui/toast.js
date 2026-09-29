/* ═══ SyncroFlow — js/ui/toast.js ═══ */
import { $, el, escapeHTML } from '../core/dom.js';

export function toast(message, type = 'info', durationMs = 3500) {
  const root = $('#toasts');
  if (!root) return;
  const node = el(`<div class="toast ${type}">${escapeHTML(message)}</div>`);
  root.appendChild(node);
  setTimeout(() => { node.style.opacity = '0'; node.style.transition = 'opacity .3s'; }, durationMs - 300);
  setTimeout(() => node.remove(), durationMs);
}
