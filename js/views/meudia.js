/* ═══ SyncroFlow — js/views/meudia.js
   "Meu Dia": tarefas atribuídas a mim em TODAS as equipes, agrupadas por
   urgência de prazo. Usa o endpoint my_cross_team. */
import { state, switchTeam } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { api } from '../core/api.js';
import { fmtDate, prioLabel } from '../core/format.js';

export const meudia = {
  async render(mount) {
    mount.innerHTML = `<div class="boot-loader">Carregando suas tarefas…</div>`;
    let data;
    try { data = await api.call('cards.php', 'my_cross_team', {}, 'GET'); }
    catch (e) { mount.innerHTML = `<div class="empty-state"><h3>Erro</h3><p>${escapeHTML(e.message)}</p></div>`; return; }

    const cards = (data.cards || []).filter(c => c.bucket !== 'done');   // só pendentes
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const wkEnd = new Date(today); wkEnd.setDate(today.getDate() + (7 - today.getDay()));

    const g = { atrasado: [], hoje: [], semana: [], depois: [], semprazo: [] };
    cards.forEach(c => {
      if (!c.dueDate) { g.semprazo.push(c); return; }
      const d = new Date(c.dueDate + 'T00:00:00');
      if (d < today) g.atrasado.push(c);
      else if (d.getTime() === today.getTime()) g.hoje.push(c);
      else if (d <= wkEnd) g.semana.push(c);
      else g.depois.push(c);
    });

    const cardRow = (c) => `
      <div class="md-card" data-card="${escapeHTML(c.id)}" data-team="${escapeHTML(c.teamId || '')}">
        <span class="md-card-team" style="--tc:${escapeHTML(c.teamColor || '#00796D')}">${escapeHTML(c.teamIcon || '👥')} ${escapeHTML(c.teamName || '')}</span>
        <span class="md-card-title">${escapeHTML(c.title || '(sem título)')}</span>
        <span class="md-card-meta">${c.dueDate ? '📅 ' + escapeHTML(fmtDate(c.dueDate)) + ' · ' : ''}${escapeHTML(prioLabel(c.priority))}</span>
      </div>`;
    const sect = (key, title, icon, cls) => {
      const list = g[key]; if (!list.length) return '';
      list.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
      return `<div class="md-sect">
        <div class="md-sect-head ${cls || ''}">${icon} ${title} <span class="md-count">${list.length}</span></div>
        <div class="md-list">${list.map(cardRow).join('')}</div>
      </div>`;
    };

    const total = cards.length;
    mount.innerHTML = `
      <div class="md-page">
        <div class="md-header">
          <h1>☀️ Meu Dia</h1>
          <p>${total} tarefa${total !== 1 ? 's' : ''} pendente${total !== 1 ? 's' : ''} atribuída${total !== 1 ? 's' : ''} a você, em todas as suas equipes.</p>
        </div>
        ${total === 0 ? `<div class="empty-state" style="padding:50px;"><h3>Tudo em dia! 🎉</h3><p>Você não tem tarefas pendentes.</p></div>` : ''}
        ${sect('atrasado', 'Atrasados', '⏰', 'is-overdue')}
        ${sect('hoje', 'Para hoje', '🔆', 'is-today')}
        ${sect('semana', 'Esta semana', '🗓️')}
        ${sect('depois', 'Mais tarde', '📌')}
        ${sect('semprazo', 'Sem prazo', '❔')}
      </div>`;

    mount.querySelectorAll('.md-card').forEach(el => el.onclick = async () => {
      const tid = el.dataset.team;
      if (tid && tid !== state.currentTeamId) { try { await switchTeam(tid); } catch (e) {} }
      const m = await import('../modals/card-modal.js');
      m.openCardModal(el.dataset.card);
    });
  }
};
