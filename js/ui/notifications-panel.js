/* ═══ SyncroFlow — js/ui/notifications-panel.js ═══ */
import { $, escapeHTML } from '../core/dom.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import { fmtSmart } from '../core/format.js';
import { toast } from './toast.js';

export function setupNotificationsPanel() {
  const btn   = $('#btn-notifications');
  const panel = $('#notifications-panel');
  const dot   = $('#notif-dot');
  if (!btn || !panel) return;

  btn.onclick = (e) => {
    e.stopPropagation();
    panel.hidden ? open() : close();
  };
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== btn) close();
  });
  refreshDot();
}

function refreshDot() {
  const dot = $('#notif-dot');
  if (!dot) return;
  const me = state.currentUser?.name;
  const unread = state.notifications.filter(n => !n.read && (!n.forUser || n.forUser === me));
  dot.hidden = unread.length === 0;
}

async function open() {
  const panel = $('#notifications-panel');
  panel.hidden = false;
  const me = state.currentUser?.name;
  const list = state.notifications.filter(n => !n.forUser || n.forUser === me).slice(0, 60);
  const isActionable = n => (n.kind === 'team_request' || n.kind === 'team_invite') && n.refId && !n.read;
  panel.innerHTML = list.length === 0
    ? `<div class="empty-state" style="padding:24px;">Sem notificações</div>`
    : list.map(n => `
        <div class="notif-item ${n.read?'':'unread'} ${isActionable(n)?'notif-request':''}" data-id="${n.id}">
          <button class="notif-del" data-del="${escapeHTML(n.id)}" title="Excluir notificação" aria-label="Excluir notificação">✕</button>
          <div class="notif-msg">${escapeHTML(n.message)}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
            ${escapeHTML(fmtSmart(n.timestamp, true))}
          </div>
          ${isActionable(n) ? `
            <div class="notif-actions">
              <button class="btn btn-sm btn-primary"   data-accept="${escapeHTML(n.id)}">✓ Aceitar</button>
              <button class="btn btn-sm btn-secondary"  data-reject="${escapeHTML(n.id)}">✕ Recusar</button>
            </div>` : ''}
        </div>
      `).join('') +
      `<div style="text-align:right; padding:8px;">
         <button class="btn btn-sm btn-ghost" id="notif-mark-all">Marcar todas como lidas</button>
       </div>`;

  // responder pedido/convite (Aceitar/Recusar)
  const respond = async (id, decision) => {
    const n = state.notifications.find(x => x.id === id);
    if (!n) return;
    const action = n.kind === 'team_request' ? 'respond_request' : 'respond_invite';
    try {
      await api.call('teams.php', action, { id: n.refId, decision });
      await api.call('notifications.php', 'mark_read', { id });
      n.read = true;
      toast(decision === 'accept' ? 'Pedido aceito.' : 'Pedido recusado.', decision === 'accept' ? 'success' : 'info');
      open(); // re-renderiza o painel
    } catch (e) { toast(e.message || 'Falha ao responder.', 'error'); }
    refreshDot();
  };
  panel.querySelectorAll('[data-accept]').forEach(b => b.onclick = (e) => { e.stopPropagation(); respond(b.dataset.accept, 'accept'); });
  panel.querySelectorAll('[data-reject]').forEach(b => b.onclick = (e) => { e.stopPropagation(); respond(b.dataset.reject, 'reject'); });

  // excluir uma notificação
  panel.querySelectorAll('[data-del]').forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    const id = b.dataset.del;
    try { await api.call('notifications.php', 'delete', { id }); } catch {}
    state.notifications = state.notifications.filter(n => n.id !== id);
    b.closest('.notif-item')?.remove();
    refreshDot();
    if (!state.notifications.some(n => !n.forUser || n.forUser === state.currentUser?.name)) open();
  });

  panel.querySelectorAll('.notif-item').forEach(el => {
    el.onclick = async () => {
      const id = el.dataset.id;
      await api.call('notifications.php', 'mark_read', { id });
      const n = state.notifications.find(n => n.id === id);
      if (n) { n.read = true; el.classList.remove('unread'); }
      refreshDot();
    };
  });
  const mark = panel.querySelector('#notif-mark-all');
  if (mark) mark.onclick = async () => {
    await api.call('notifications.php', 'mark_all_read', {});
    state.notifications.forEach(n => n.read = true);
    panel.querySelectorAll('.unread').forEach(el => el.classList.remove('unread'));
    refreshDot();
  };
}
function close() { $('#notifications-panel').hidden = true; }
