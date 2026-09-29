/* ═══ SyncroFlow — js/core/poll.js
   Substitui o polling de file system do legado por HTTP a cada
   5s (configurável via window.__CONFIG__.pollInterval). Pausa
   automaticamente quando a aba fica em background. */
import { state, applyEvent } from './state.js';
import { emit } from './events.js';

const INTERVAL = window.__CONFIG__?.pollInterval || 5000;
const API_BASE = window.__CONFIG__?.apiBase || '/api';
let timer = null;

export function startPolling() {
  if (timer) return;
  timer = setInterval(pollOnce, INTERVAL);
  document.addEventListener('visibilitychange', visibilityChanged);
}
export function stopPolling() {
  if (timer) { clearInterval(timer); timer = null; }
  document.removeEventListener('visibilitychange', visibilityChanged);
}
function visibilityChanged() {
  if (document.hidden) { if (timer) { clearInterval(timer); timer = null; } }
  else if (!timer)    { pollOnce(); timer = setInterval(pollOnce, INTERVAL); }
}

async function pollOnce() {
  try {
    const res = await fetch(`${API_BASE}/poll.php?since=${state.revision}`, { credentials:'same-origin' });
    emit('conn:status', { online: true });
    if (res.status === 304) return;
    if (!res.ok) return;
    const data = await res.json();
    if (!data || data.revision <= state.revision) return;
    for (const ev of (data.events || [])) {
      applyEvent(ev);
      emit('ws:event', ev);
    }
    state.revision = data.revision;
    emit('poll:applied', data);
  } catch (e) {
    emit('conn:status', { online: false });
  }
}
