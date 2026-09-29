/* ═══ SyncroFlow — js/ui/heatmap.js
   Mapa de atividade (contribution graph) reutilizável.
   Recebe o NOME do usuário e calcula a atividade a partir de state.cards
   da equipe ativa (histórico, comentários, criação/atualização). */
import { state } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';

const MES_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function collectActivity(me, cards) {
  const counts = {};
  const bump = (iso) => { if (!iso) return; const k = String(iso).slice(0,10); if (/^\d{4}-\d{2}-\d{2}$/.test(k)) counts[k] = (counts[k]||0)+1; };
  (cards || state.cards || []).forEach(c => {
    const mine = c.assignee === me || c.createdBy === me;
    (c.history || []).forEach(h => { if (!h.user || h.user === me) bump(h.timestamp || h.at); });
    (c.comments || []).forEach(cm => {
      if ((cm.user || cm.author) === me) bump(cm.timestamp || cm.createdAt);
    });
    if (mine) { bump(c.createdAt); bump(c.updatedAt); }
  });
  return counts;
}

/** HTML completo do heatmap (métricas + grade + legenda) para um usuário. */
export function heatmapHTML(userName, { weeks = 26, title = '🔥 Atividade', compact = false, cards = null } = {}) {
  const me = userName || '';
  const counts = collectActivity(me, cards);
  const WEEKS = weeks;
  const today = new Date(); today.setHours(0,0,0,0);
  const end = new Date(today); end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end); start.setDate(start.getDate() - (WEEKS*7 - 1));

  const cols = []; let max = 0, total = 0, activeDays = 0, best = { v:0, d:null };
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    for (let dow = 0; dow < 7; dow++) {
      const d = new Date(start); d.setDate(start.getDate() + w*7 + dow);
      const future = d > today;
      const v = future ? -1 : (counts[dayKey(d)] || 0);
      if (v > 0) { total += v; activeDays++; if (v > max) max = v; if (v > best.v) best = { v, d:new Date(d) }; }
      col.push({ d, v, future });
    }
    cols.push(col);
  }
  const level = (v) => v <= 0 ? 0 : max <= 1 ? 1 : v >= Math.ceil(max*0.75) ? 4 : v >= Math.ceil(max*0.5) ? 3 : v >= Math.ceil(max*0.25) ? 2 : 1;

  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if ((counts[dayKey(d)] || 0) > 0) streak++;
    else if (i === 0) continue;
    else break;
  }

  const monthCells = cols.map((col, i) => {
    const m = col[0].d.getMonth();
    const prev = i > 0 ? cols[i-1][0].d.getMonth() : -1;
    return (m !== prev) ? MES_ABBR[m] : '';
  });
  const wd = ['', 'Seg', '', 'Qua', '', 'Sex', ''];
  const bestTxt = best.d ? `${best.v} em ${best.d.getDate()}/${best.d.getMonth()+1}` : '—';

  const stats = compact ? '' : `
    <div class="hm-stats">
      <div class="hm-stat"><span class="hm-stat-val">${total}</span><span class="hm-stat-lbl">Interações</span></div>
      <div class="hm-stat"><span class="hm-stat-val">${activeDays}</span><span class="hm-stat-lbl">Dias ativos</span></div>
      <div class="hm-stat"><span class="hm-stat-val">🔥 ${streak}</span><span class="hm-stat-lbl">Sequência</span></div>
      <div class="hm-stat"><span class="hm-stat-val">${bestTxt}</span><span class="hm-stat-lbl">Melhor dia</span></div>
    </div>`;

  return `
    ${stats}
    <div class="hm-scroll">
      <div class="hm-grid" style="--weeks:${WEEKS};">
        <div class="hm-corner"></div>
        <div class="hm-months">${monthCells.map(m => `<span class="hm-month">${m}</span>`).join('')}</div>
        <div class="hm-weekdays">${wd.map(l => `<span class="hm-wd">${l}</span>`).join('')}</div>
        <div class="hm-weeks">
          ${cols.map(col => `<div class="hm-week">${col.map(c =>
            c.future
              ? `<span class="hm-cell hm-future"></span>`
              : `<span class="hm-cell hm-l${level(c.v)}" title="${c.d.getDate()}/${c.d.getMonth()+1}/${c.d.getFullYear()} · ${c.v} interaç${c.v===1?'ão':'ões'}"></span>`
          ).join('')}</div>`).join('')}
        </div>
      </div>
    </div>
    <div class="hm-legend">Menos
      <span class="hm-cell hm-l0"></span><span class="hm-cell hm-l1"></span><span class="hm-cell hm-l2"></span><span class="hm-cell hm-l3"></span><span class="hm-cell hm-l4"></span>
      Mais
    </div>`;
}

/** Bloco de seção (mp-section) pronto para o Meu Painel. */
export function heatmapSection(userName, cards = null) {
  return `
    <div class="mp-section" style="margin-bottom:14px;">
      <div class="mp-section-header">
        <h3 class="mp-section-title">🔥 Sua atividade</h3>
        <span class="mp-section-aside">todas as equipes · últimas 26 semanas</span>
      </div>
      <div class="mp-section-body" style="padding:16px 18px;">${heatmapHTML(userName, { cards })}</div>
    </div>`;
}
