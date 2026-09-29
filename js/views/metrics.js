/* ═══ SyncroFlow — js/views/metrics.js
   Métricas de fluxo: lead time, cycle time, throughput (concluídos por
   semana), fluxo cumulativo (criados × concluídos) e WIP por coluna. */
import { state } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { api } from '../core/api.js';

let period = '90d';
const PERIODS = [['30d', '30 dias'], ['90d', '90 dias'], ['180d', '180 dias'], ['all', 'Tudo']];

export const metrics = {
  async render(mount) {
    mount.innerHTML = `<div class="boot-loader">Calculando métricas…</div>`;
    await paint(mount);
  }
};

async function paint(mount) {
  let d;
  try { d = await api.call('metrics.php', 'flow', { team_id: state.currentTeamId, period }, 'GET'); }
  catch (e) { mount.innerHTML = `<div class="empty-state"><h3>Erro</h3><p>${escapeHTML(e.message)}</p></div>`; return; }

  const fmtD = (v) => v == null ? '—' : (v >= 10 ? Math.round(v) : v) + 'd';
  const lead = d.lead || {}, cycle = d.cycle || {};

  mount.innerHTML = `
    <div class="mt-page">
      <div class="mt-pagehead">
        <div>
          <h1>📈 Métricas de fluxo</h1>
          <p>Tempo de entrega, vazão e fluxo de trabalho da equipe ao longo do tempo.</p>
        </div>
        <div class="mt-seg" id="mt-period">
          ${PERIODS.map(([v, l]) => `<button data-period="${v}" class="${period === v ? 'active' : ''}">${l}</button>`).join('')}
        </div>
      </div>

      <div class="mt-kpis">
        ${kpi('⏳', 'Lead time', fmtD(lead.avg), `mediana ${fmtD(lead.median)} · ${lead.count || 0} cards`, 'Da criação até a conclusão', '#6366f1')}
        ${kpi('🔄', 'Cycle time', fmtD(cycle.avg), `mediana ${fmtD(cycle.median)} · ${cycle.count || 0} cards`, 'Da 1ª movimentação até a conclusão', '#0ea5e9')}
        ${kpi('✅', 'Concluídos', String(d.totalDone || 0), 'no período', 'Total de cards finalizados', '#16a34a')}
        ${kpi('⚡', 'Vazão / semana', throughputAvg(d.throughput), 'média recente', 'Cards concluídos por semana', '#8b5cf6')}
      </div>

      ${forecastPanel(d.forecast)}

      <div class="mt-grid2">
        <div class="mt-panel">
          <div class="mt-panel-head"><h2>⚡ Throughput</h2><span class="mt-panel-sub">concluídos por semana</span></div>
          ${throughputChart(d.throughput || [])}
        </div>
        <div class="mt-panel">
          <div class="mt-panel-head"><h2>📊 WIP por coluna</h2><span class="mt-panel-sub">trabalho em andamento agora</span></div>
          ${wipChart()}
        </div>
      </div>

      <div class="mt-panel">
        <div class="mt-panel-head"><h2>🌊 Fluxo cumulativo</h2><span class="mt-panel-sub">criados × concluídos ao longo do tempo</span></div>
        ${cfdChart(d.cumulative || [])}
        <div class="mt-legend">
          <span><i class="mt-sw mt-sw-created"></i> Criados (acumulado)</span>
          <span><i class="mt-sw mt-sw-done"></i> Concluídos (acumulado)</span>
          <span><i class="mt-sw mt-sw-band"></i> Em andamento (WIP)</span>
        </div>
      </div>

      <div class="mt-panel">
        <div class="mt-panel-head"><h2>🧊 Cards parados</h2><span class="mt-panel-sub">ativos sem movimentação há 4+ dias</span></div>
        ${agingPanel(d.aging || [])}
      </div>
    </div>`;

  mount.querySelectorAll('#mt-period [data-period]').forEach(b => b.onclick = () => { period = b.dataset.period; paint(mount); });
  mount.querySelectorAll('[data-aging-card]').forEach(el => el.onclick = () =>
    import('../modals/card-modal.js').then(m => m.openCardModal(el.dataset.agingCard)));
}

function kpi(icon, label, value, sub, title, color) {
  return `<div class="mt-kpi" title="${escapeHTML(title)}" style="--kc:${color}">
    <div class="mt-kpi-ico">${icon}</div>
    <div class="mt-kpi-body">
      <div class="mt-kpi-label">${escapeHTML(label)}</div>
      <div class="mt-kpi-value">${escapeHTML(value)}</div>
      <div class="mt-kpi-sub">${escapeHTML(sub)}</div>
    </div>
  </div>`;
}

function throughputAvg(tp) {
  if (!tp || !tp.length) return '0';
  const recent = tp.slice(-8);
  const avg = recent.reduce((a, b) => a + b.count, 0) / recent.length;
  return (avg >= 10 ? Math.round(avg) : avg.toFixed(1)).toString();
}

function _fmtBR(iso) { if (!iso) return '—'; const p = String(iso).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; }

function forecastPanel(f) {
  if (!f) return '';
  const head = '<div class="mt-panel-head"><h2>🔮 Previsão de entrega</h2><span class="mt-panel-sub">no ritmo das últimas semanas</span></div>';
  if (!f.openCount) return `<div class="mt-panel mt-forecast">${head}<div class="mt-empty">Sem cards abertos — backlog zerado! 🎉</div></div>`;
  if (f.weeks == null || !f.avgPerWeek) return `<div class="mt-panel mt-forecast">${head}<div class="mt-empty">${f.openCount} card(s) aberto(s), mas ainda sem ritmo de conclusão para projetar.</div></div>`;
  const w = f.weeks;
  return `
    <div class="mt-panel mt-forecast">${head}
      <div class="mt-fc-grid">
        <div class="mt-fc-main">
          <div class="mt-fc-big">${w <= 1 ? '~1 semana' : '~' + Math.round(w) + ' semanas'}</div>
          <div class="mt-fc-date">conclusão prevista: <strong>${_fmtBR(f.date)}</strong></div>
        </div>
        <div class="mt-fc-stats">
          <div><span>${f.openCount}</span>cards abertos</div>
          <div><span>${f.avgPerWeek}</span>por semana</div>
        </div>
      </div>
      <div class="mt-fc-range">🟢 otimista <strong>${_fmtBR(f.dateOpt)}</strong> &nbsp;·&nbsp; 🔴 pessimista <strong>${_fmtBR(f.datePes)}</strong></div>
    </div>`;
}

function agingPanel(list) {
  if (!list.length) return `<div class="mt-empty">Nenhum card parado. Fluxo saudável! ✅</div>`;
  return `<div class="mt-aging">${list.map(c => `
    <div class="mt-aging-row" data-aging-card="${escapeHTML(c.id)}" title="Abrir card">
      <span class="mt-aging-days ${c.days >= 10 ? 'crit' : c.days >= 7 ? 'warn' : ''}">${c.days}d</span>
      <span class="mt-aging-title">${escapeHTML(c.title || '(sem título)')}</span>
      <span class="mt-aging-meta">${escapeHTML([c.column, c.assignee].filter(Boolean).join(' · '))}</span>
    </div>`).join('')}</div>`;
}

function throughputChart(tp) {
  if (!tp.length) return `<div class="mt-empty">Sem conclusões no período.</div>`;
  const max = Math.max(1, ...tp.map(t => t.count));
  const avg = tp.reduce((a, b) => a + b.count, 0) / tp.length;
  const avgPct = Math.round((avg / max) * 100);
  return `<div class="mt-bars-wrap">
    <div class="mt-bars" style="--avg:${avgPct}%">
      <span class="mt-bars-avgline" title="Média do período: ${avg.toFixed(1)}/semana"></span>
      ${tp.map(t => {
        const h = Math.round((t.count / max) * 100);
        const wk = t.week.replace(/^\d+-W/, 'S');
        return `<div class="mt-bar-col" title="Semana ${escapeHTML(t.week)}: ${t.count} concluído(s)">
          <div class="mt-bar-val">${t.count}</div>
          <div class="mt-bar" style="height:${Math.max(h, 4)}%"></div>
          <div class="mt-bar-lbl">${escapeHTML(wk)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function cfdChart(cum) {
  if (cum.length < 2) return `<div class="mt-empty">Dados insuficientes para o gráfico (conclua e crie alguns cards).</div>`;
  const W = 720, H = 260, PL = 38, PR = 12, PT = 12, PB = 26;
  const maxY = Math.max(1, ...cum.map(p => p.created));
  const n = cum.length;
  const x = (i) => PL + (i / (n - 1)) * (W - PL - PR);
  const y = (v) => PT + (1 - v / maxY) * (H - PT - PB);
  const base = y(0);

  const ptsCreated = cum.map((p, i) => `${x(i).toFixed(1)},${y(p.created).toFixed(1)}`).join(' ');
  const ptsDone = cum.map((p, i) => `${x(i).toFixed(1)},${y(p.done).toFixed(1)}`).join(' ');
  const areaCreated = `${x(0).toFixed(1)},${base.toFixed(1)} ${ptsCreated} ${x(n - 1).toFixed(1)},${base.toFixed(1)}`;
  const areaDone = `${x(0).toFixed(1)},${base.toFixed(1)} ${ptsDone} ${x(n - 1).toFixed(1)},${base.toFixed(1)}`;

  // Eixo Y — 4 marcas
  let yAxis = '';
  for (let g = 0; g <= 4; g++) {
    const v = Math.round((maxY / 4) * g);
    const yy = y(v).toFixed(1);
    yAxis += `<line x1="${PL}" y1="${yy}" x2="${W - PR}" y2="${yy}" class="mt-grid"/><text x="${PL - 7}" y="${(+yy + 3.5).toFixed(1)}" class="mt-axis" text-anchor="end">${v}</text>`;
  }
  // Eixo X — ~4 datas em dd/mm
  const br = (iso) => { const p = String(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] : iso; };
  let xAxis = '';
  const ticks = Math.min(4, n);
  for (let t = 0; t < ticks; t++) {
    const i = Math.round((t / (ticks - 1)) * (n - 1));
    const anchor = t === 0 ? 'start' : (t === ticks - 1 ? 'end' : 'middle');
    xAxis += `<text x="${x(i).toFixed(1)}" y="${H - 7}" class="mt-axis" text-anchor="${anchor}">${escapeHTML(br(cum[i].date))}</text>`;
  }

  return `<svg class="mt-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Fluxo cumulativo">
    <defs>
      <linearGradient id="mtGradCreated" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2563eb" stop-opacity="0.34"/>
        <stop offset="100%" stop-color="#2563eb" stop-opacity="0.04"/>
      </linearGradient>
      <linearGradient id="mtGradDone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#16a34a" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="#16a34a" stop-opacity="0.08"/>
      </linearGradient>
    </defs>
    ${yAxis}
    <polygon points="${areaCreated}" fill="url(#mtGradCreated)"/>
    <polygon points="${areaDone}" fill="url(#mtGradDone)"/>
    <polyline points="${ptsCreated}" class="mt-line mt-line-created"/>
    <polyline points="${ptsDone}" class="mt-line mt-line-done"/>
    ${xAxis}
  </svg>`;
}

const WIP_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#8b5cf6', '#ec4899', '#f97316', '#64748b'];
function wipChart() {
  const cols = (state.columns || []).slice().sort((a, b) => a.position - b.position);
  const cards = (state.cards || []).filter(c => !c.archived);
  const counts = {};
  cards.forEach(c => { counts[c.columnId] = (counts[c.columnId] || 0) + 1; });
  const max = Math.max(1, ...cols.map(c => counts[c.id] || 0));
  if (!cols.length) return `<div class="mt-empty">Sem colunas.</div>`;
  return `<div class="mt-wip">${cols.map((c, idx) => {
    const n = counts[c.id] || 0;
    const w = Math.round((n / max) * 100);
    const wip = c.wip_limit && n > c.wip_limit;
    const col = wip ? 'var(--danger)' : WIP_COLORS[idx % WIP_COLORS.length];
    return `<div class="mt-wip-row">
      <span class="mt-wip-name">${c.icon ? escapeHTML(c.icon) + ' ' : ''}${escapeHTML(c.name)}</span>
      <span class="mt-wip-track"><span class="mt-wip-fill" style="width:${Math.max(w, 2)}%;background:${col}"></span></span>
      <span class="mt-wip-n ${wip ? 'over' : ''}">${n}${c.wip_limit ? ' / ' + c.wip_limit : ''}</span>
    </div>`;
  }).join('')}</div>`;
}
