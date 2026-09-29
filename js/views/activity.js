/* ═══ SyncroFlow — js/views/activity.js
   A aba "Atividade" foi removida da navegação: o histórico agora vive
   dentro da Equipe (Gerenciar equipe › Histórico). Este módulo exporta
   helpers reutilizáveis para renderizar o feed cronológico de uma lista
   de cards. */
import { escapeHTML } from '../core/dom.js';
import { fmtSmart, fmtDateTime } from '../core/format.js';

/** Constrói o HTML do feed de atividade a partir de uma lista de cards. */
export function activityHTML(cards, { cap = 300, emptyText = 'Sem atividade registrada.' } = {}) {
  const events = [];
  (cards || []).forEach(c => {
    (c.history || []).forEach(h => {
      if (!h?.timestamp) return;
      events.push({ ...h, cardId: c.id, cardTitle: c.title });
    });
  });
  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  if (!events.length) return `<div class="mp-empty">${escapeHTML(emptyText)}</div>`;
  const capped = events.slice(0, cap);
  return `
    ${capped.length < events.length ? `<div class="banner warn" style="margin-bottom:10px;">Exibindo os ${cap} eventos mais recentes (de ${events.length}).</div>` : ''}
    <div class="activity-list">
      ${capped.map(ev => `
        <div class="activity-item" data-card-id="${escapeHTML(ev.cardId)}">
          <div class="activity-time" title="${escapeHTML(fmtDateTime(ev.timestamp))}">${escapeHTML(fmtSmart(ev.timestamp, true))}</div>
          <div class="activity-body">
            <span class="who">${escapeHTML(ev.user || '—')}</span>
            <span class="what"> ${escapeHTML(ev.action || '')}</span>
            <span class="target"> → ${escapeHTML(ev.cardTitle || '(card removido)')}</span>
          </div>
        </div>`).join('')}
    </div>`;
}

/** Liga o clique dos itens para abrir o card. */
export function wireActivity(container) {
  container.querySelectorAll('.activity-item[data-card-id]').forEach(el => {
    el.onclick = () => import('../modals/card-modal.js').then(m => m.openCardModal(el.dataset.cardId));
  });
}
