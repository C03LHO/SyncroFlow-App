import { isDoneColumn } from '../core/state.js';
/* ═══ SyncroFlow — js/views/dashboard.js
   Dashboard. */
import { state } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { fmtMoney, fmtDate, prioLabel } from '../core/format.js';
import { api } from '../core/api.js';

let period = '30d';
let showQual = localStorage.getItem('syncro_db_qual') === '1';  // ganhos qualitativos: OFF por padrão

/* #8 — Gestor/TI veem o comparativo entre equipes (visão "overviewer"). */
const isOverviewer = () => ['gestor','ti','suporte'].includes(state.currentUser?.role);
let compareMode = false;          // está na tela de comparação?
let cmpA = '', cmpB = '';          // equipes escolhidas
let cmpTeams = null;               // catálogo de equipes (lazy)

const PERIOD_OPTS = [
  ['7d','7 dias'], ['14d','14 dias'], ['30d','30 dias'],
  ['90d','90 dias'], ['year','Este ano'],
];

export const dashboard = {
  render(mount) { (compareMode && isOverviewer()) ? renderCompare(mount) : paint(mount); }
};

function paint(mount) {
  const cardsAll = state.cards.filter(c => !c.archived);
  const active = cardsAll.filter(c => !isDoneColumn(c.columnId));

  // Period cutoff
  const now = Date.now();
  const periodMs = { '7d':7, '14d':14, '30d':30, '90d':90, 'year': 365 }[period] * 86400000;
  const cutoff = now - periodMs;
  const donePeriod = cardsAll.filter(c => isDoneColumn(c.columnId)
    && (c.updatedAt ? new Date(c.updatedAt).getTime() : 0) > cutoff).length;
  const donePrev = cardsAll.filter(c => isDoneColumn(c.columnId)
    && (c.updatedAt ? new Date(c.updatedAt).getTime() : 0) > (cutoff - periodMs)
    && (c.updatedAt ? new Date(c.updatedAt).getTime() : 0) <= cutoff).length;

  const overdue = active.filter(c => c.dueDate && new Date(c.dueDate+'T23:59:59') < new Date());
  const atRisk  = active.filter(c => c.projectionStatus === 'em-risco');
  const taxa = (donePeriod + active.length) > 0
    ? Math.round(donePeriod / (donePeriod + active.length) * 100) : 0;
  const taxaPrev = (donePrev + active.length) > 0
    ? Math.round(donePrev / (donePrev + active.length) * 100) : 0;

  // Ganhos
  const horasMesCards = cardsAll.filter(c => c.gains?.horasMes != null);
  const econMesCards  = cardsAll.filter(c => c.gains?.economiaMes != null);
  const totHorasMes = horasMesCards.reduce((s,c) => s + Number(c.gains.horasMes), 0);
  const totEconMes  = econMesCards.reduce((s,c)  => s + Number(c.gains.economiaMes), 0);
  const totHorasAno = totHorasMes * 12;
  const totEconAno  = totEconMes * 12;

  // Carga por pessoa (cards ativos por responsável)
  const _wl = {};
  active.forEach(c => { const a = (c.assignee || '').trim() || '— Sem responsável'; _wl[a] = (_wl[a] || 0) + 1; });
  const wlRows = Object.entries(_wl).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const wlMax = wlRows.length ? wlRows[0][1] : 1;

  // Ganhos qualitativos: frequência + quais cards tiveram cada ganho (p/ tooltip)
  const qualFreq = {};
  const qualCards = {};
  cardsAll.forEach(c => (c.gains?.qualitativo || []).forEach(q => {
    const k = String(q).trim(); if (!k) return;
    qualFreq[k] = (qualFreq[k] || 0) + 1;
    (qualCards[k] = qualCards[k] || []).push(c.title || '(sem título)');
  }));
  const qualEntries = Object.entries(qualFreq).sort((a,b) => b[1]-a[1]);
  const qualTop  = qualEntries.slice(0, 18);
  const qualMore = qualEntries.length - qualTop.length;
  const qualMax  = qualTop.length ? qualTop[0][1] : 1;
  const qualCardCount = cardsAll.filter(c => (c.gains?.qualitativo || []).length).length;

  // Distribuição por coluna
  const byCol = {};
  state.columns.forEach(col => { byCol[col.id] = { name: col.name, color: col.color || '#00796D', icon: col.icon, count: 0 }; });
  active.forEach(c => { if (byCol[c.columnId]) byCol[c.columnId].count++; });
  const donutSegs = Object.values(byCol).filter(s => s.count > 0);
  const colTotal = donutSegs.reduce((s,d)=>s+d.count, 0) || 1;

  // Throughput por semana (8 semanas)
  const throughput = computeThroughput(cardsAll, 8);
  const maxTp = Math.max(...throughput.map(w => w.count), 1);

  // Top responsáveis
  const byAssignee = {};
  active.forEach(c => { if (c.assignee) byAssignee[c.assignee] = (byAssignee[c.assignee]||0)+1; });
  const topAssignees = Object.entries(byAssignee).sort((a,b)=>b[1]-a[1]).slice(0, 8);
  const maxAss = topAssignees[0]?.[1] || 1;

  // Próximas entregas
  const upcoming = cardsAll.filter(c => !isDoneColumn(c.columnId) && c.dueDate)
    .sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);

  // Cards atrasados
  const overdueList = overdue.slice(0, 6);

  // Health Score (0-100): 100 = todos no prazo, sem urgentes, taxa alta
  const overdueP   = active.length > 0 ? (overdue.length / active.length) * 100 : 0;
  const riskP      = active.length > 0 ? (atRisk.length / active.length) * 100 : 0;
  const noAssign   = active.filter(c => !c.assignee).length;
  const noAssignP  = active.length > 0 ? (noAssign / active.length) * 100 : 0;
  const healthScore = Math.max(0, Math.round(100 - overdueP * 1.8 - riskP * 0.8 - noAssignP * 0.5));
  const healthColor = healthScore >= 80 ? 'var(--success)' : healthScore >= 50 ? 'var(--warning)' : 'var(--danger)';
  const healthLabel = healthScore >= 80 ? 'Excelente' : healthScore >= 60 ? 'Bom' : healthScore >= 40 ? 'Atenção' : 'Crítico';

  // Insights automáticos
  const insights = [];
  if (overdue.length >= 3) insights.push({ icon:'⏰', type:'danger', msg:`${overdue.length} cards atrasados — priorize estes antes de pegar novos.` });
  if (atRisk.length >= 3)  insights.push({ icon:'🚩', type:'warning', msg:`${atRisk.length} cards em risco — revise prazos e capacidade.` });
  if (noAssign >= 2)       insights.push({ icon:'👻', type:'info', msg:`${noAssign} cards sem responsável atribuído.` });
  const urgentes = active.filter(c => c.priority === 'urgente').length;
  if (urgentes >= 3)       insights.push({ icon:'🔥', type:'danger', msg:`${urgentes} cards urgentes ativos — pode estar havendo sobrecarga.` });
  if (donePeriod > donePrev * 1.5 && donePrev > 0) insights.push({ icon:'🚀', type:'success', msg:`Throughput acelerou ${Math.round((donePeriod/donePrev - 1) * 100)}% vs período anterior!` });
  if (insights.length === 0) insights.push({ icon:'✨', type:'success', msg:'Quadro saudável. Sem alertas no momento.' });

  mount.innerHTML = `
    <div class="dash-page">
      <!-- Period selector + exportações -->
      <div class="db-topbar">
        <span class="db-topbar-label">Período:</span>
        <div class="db-period-pills">
          ${PERIOD_OPTS.map(([k,l]) =>
            `<button class="db-period-btn ${period===k?'active':''}" data-period="${k}">${escapeHTML(l)}</button>`
          ).join('')}
        </div>
        ${(() => {
          const base = (window.__CONFIG__?.apiBase || '/api');
          const tid = encodeURIComponent(state.currentTeamId || '');
          return `<div class="board-manage-wrap">
            <button class="btn btn-sm btn-secondary" id="db-actions-btn" aria-haspopup="true" aria-expanded="false" title="Exportar e comparar">📥 Exportar</button>
            <div class="board-manage-pop" id="db-actions-pop" hidden>
              <a class="bmp-item" href="${base}/export.php?type=cards_csv&team=${tid}" title="Planilha de cards (abre no Excel)">📊 Cards (CSV)</a>
              <a class="bmp-item" href="${base}/export.php?type=gains_csv&team=${tid}" title="Consolidado de ganhos">💰 Ganhos (CSV)</a>
              <a class="bmp-item" href="${base}/export.php?type=report&team=${tid}" target="_blank" rel="noopener" title="Relatório imprimível (PDF)">🖨️ Relatório (PDF)</a>
              ${isOverviewer() ? `<button class="bmp-item" id="db-compare-btn">⚖️ Comparar equipes</button>` : ''}
            </div>
          </div>`;
        })()}
        <label class="db-qual-toggle" title="Mostrar ou ocultar o painel de ganhos qualitativos">
          <input type="checkbox" id="db-qual-toggle" ${showQual ? 'checked' : ''}>
          <span>✨ Ganhos qualitativos</span>
        </label>
      </div>

      <!-- Health Score + Insights -->
      <div class="db-health-row">
        <div class="db-health-card">
          <div class="db-health-gauge">
            <svg viewBox="0 0 100 60" width="180" height="108">
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="var(--surface-3)" stroke-width="10" stroke-linecap="round"/>
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="${healthColor}" stroke-width="10" stroke-linecap="round"
                stroke-dasharray="${(healthScore/100)*126} 126"/>
              <text x="50" y="48" text-anchor="middle" fill="var(--text)" style="font-size:22px;font-weight:800;">${healthScore}</text>
            </svg>
            <div class="db-health-label" style="color:${healthColor};">${healthLabel}</div>
            <div class="db-health-sub">Health Score do Quadro</div>
          </div>
        </div>
        <div class="db-insights-panel">
          <div class="panel-header">
            <h3>💡 Insights automáticos</h3>
            <span class="panel-sub">${insights.length} ${insights.length>1?'alertas':'alerta'}</span>
          </div>
          <div class="db-insights-list">
            ${insights.map(i => `
              <div class="db-insight db-insight-${i.type}">
                <span class="db-insight-icon">${i.icon}</span>
                <span>${escapeHTML(i.msg)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- 5 KPIs -->
      <div class="kpi-strip">
        ${kpi('Cards Ativos', active.length, 'não concluídos', '', '📋', 'brand')}
        ${kpi('Concluídos no Período', donePeriod, deltaHtml(donePeriod, donePrev), 'success', '✓', 'success')}
        ${kpi('Em Atraso', overdue.length, 'prazo vencido', overdue.length?'danger':'', '⏰', 'danger')}
        ${kpi('Em Risco', atRisk.length, 'requerem atenção', atRisk.length?'warning':'', '🚩', 'warning')}
        ${kpi('Taxa de Conclusão', taxa+'%', deltaHtml(taxa, taxaPrev), '', '⚡', 'brand')}
      </div>

      <!-- 4 cards de ganhos -->
      <div class="db-gains-row">
        ${gainCard('Horas Salvas / Mês', horasMesCards.length ? totHorasMes.toFixed(0)+'h' : '—', `de ${horasMesCards.length} card${horasMesCards.length!==1?'s':''}`)}
        ${gainCard('Horas Salvas / Ano', horasMesCards.length ? totHorasAno.toFixed(0)+'h' : '—', 'projeção anual')}
        ${gainCard('Economia Mensal', econMesCards.length ? fmtMoney(totEconMes) : '—', `de ${econMesCards.length} card${econMesCards.length!==1?'s':''}`, true)}
        ${gainCard('Economia Anual', econMesCards.length ? fmtMoney(totEconAno) : '—', 'projeção anual', true)}
      </div>

      <!-- Ganhos qualitativos (oculto por padrão; toggle no topo) -->
      ${showQual ? `<div class="panel db-qual-panel">
        <div class="panel-header">
          <h3>✨ Ganhos qualitativos</h3>
          <span class="panel-sub">${qualCardCount ? `mencionados em ${qualCardCount} card${qualCardCount!==1?'s':''}` : 'nenhum registrado ainda'}</span>
        </div>
        ${qualTop.length ? `<div class="db-qual-cloud">
          ${qualTop.map(([tag,n]) => {
            const list = qualCards[tag] || [];
            const shown = list.slice(0, 10);
            const moreC = list.length - shown.length;
            const tip = `${tag}\n\nEm ${n} card${n!==1?'s':''}:\n• ${shown.join('\n• ')}${moreC>0?`\n+${moreC} card(s)`:''}`;
            const disp = tag.length > 34 ? tag.slice(0, 33) + '…' : tag;
            return `<span class="db-qual-chip" style="--w:${(n/qualMax)}" title="${escapeHTML(tip)}"><span class="db-qual-txt">${escapeHTML(disp)}</span> <b>${n}</b></span>`;
          }).join('')}
          ${qualMore > 0 ? `<span class="db-qual-chip db-qual-more" title="Há mais ${qualMore} tipo(s) de ganho qualitativo">+${qualMore} outros</span>` : ''}
        </div>` : `<div class="db-qual-empty">Adicione ganhos qualitativos nos cards (aba 💰 Ganhos do Projeto) para vê-los aqui.</div>`}
      </div>` : ''}

      <!-- Carga por pessoa -->
      <div class="panel">
        <div class="panel-header">
          <h3>👥 Carga por pessoa</h3>
          <span class="panel-sub">cards ativos por responsável</span>
        </div>
        ${wlRows.length ? `<div class="db-wl">
          ${wlRows.map(([name, n]) => {
            const over = n >= 8;   // sinaliza possível sobrecarga
            return `<div class="db-wl-row" title="${escapeHTML(name)}: ${n} card${n!==1?'s':''} ativo${n!==1?'s':''}">
              <span class="db-wl-name">${escapeHTML(name)}</span>
              <span class="db-wl-bar"><span class="db-wl-fill ${over?'over':''}" style="width:${Math.max(6, Math.round(n/wlMax*100))}%"></span></span>
              <span class="db-wl-num ${over?'over':''}">${n}</span>
            </div>`;
          }).join('')}
        </div>` : `<div class="db-qual-empty">Nenhum card ativo com responsável.</div>`}
      </div>

      <!-- Chart row: Throughput + Donut -->
      <div class="db-chart-row">
        <div class="panel">
          <div class="panel-header">
            <h3>Throughput Semanal</h3>
            <span class="panel-sub">cards concluídos por semana</span>
          </div>
          <div class="db-tp-chart">
            ${throughput.map(w => `
              <div class="db-tp-bar-wrap">
                <div class="db-tp-bar" style="height:${maxTp ? (w.count/maxTp)*100 : 0}%" title="${w.label}: ${w.count} cards">
                  ${w.count > 0 ? `<span class="db-tp-num">${w.count}</span>` : ''}
                </div>
                <div class="db-tp-lbl">${escapeHTML(w.label)}</div>
              </div>
            `).join('')}
          </div>
          ${throughput.every(w => w.count === 0) ? `
            <div class="db-empty-overlay">
              <div style="font-size:32px;margin-bottom:6px;">📊</div>
              <span>Nenhum card concluído neste período</span>
            </div>
          ` : ''}
        </div>

        <div class="panel">
          <div class="panel-header">
            <h3>Distribuição por Coluna</h3>
            <span class="panel-sub">cards ativos</span>
          </div>
          ${donutSegs.length ? `
            <div class="donut-wrap">
              ${donutSvg(donutSegs, colTotal)}
              <div class="donut-legend" style="margin-top:12px;flex:1;">
                ${donutSegs.map(s => {
                  const pct = Math.round((s.count / colTotal) * 100);
                  return `
                    <div class="donut-legend-item">
                      <span class="donut-legend-swatch" style="background:${s.color}"></span>
                      <span class="donut-legend-name">${escapeHTML(s.icon||'')} ${escapeHTML(s.name)}</span>
                      <span class="donut-legend-val">${s.count} <small style="color:var(--text-muted);font-weight:400;">(${pct}%)</small></span>
                    </div>`;
                }).join('')}
              </div>
            </div>
          ` : `
            <div class="db-empty-overlay" style="height:200px;">
              <div style="font-size:32px;margin-bottom:6px;">📊</div>
              <span>Nenhum card ativo</span>
            </div>
          `}
        </div>
      </div>

      <!-- Bottom: próximas entregas + atrasados + top responsáveis -->
      <div class="db-bottom-row">
        <div class="panel">
          <div class="panel-header">
            <h3>📅 Próximas entregas</h3>
            <span class="panel-sub">${upcoming.length} cards</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${upcoming.map(c => {
              const ov = new Date(c.dueDate+'T23:59:59') < new Date();
              return `
                <div class="db-up-row" data-card-id="${escapeHTML(c.id)}">
                  <div style="flex:1;min-width:0;">
                    <div class="db-up-title">${escapeHTML(c.title)}</div>
                    <div class="db-up-sub">${escapeHTML(c.assignee || '—')} · ${escapeHTML(prioLabel(c.priority))}</div>
                  </div>
                  <span class="db-up-date ${ov?'overdue':''}">${escapeHTML(fmtDate(c.dueDate))}</span>
                </div>`;
            }).join('') || `<div class="empty-state" style="padding:20px;">Nenhuma entrega próxima.</div>`}
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h3>⚠️ Cards atrasados</h3>
            <span class="panel-sub">${overdueList.length} de ${overdue.length}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${overdueList.map(c => {
              const days = Math.floor((Date.now() - new Date(c.dueDate+'T23:59:59'))/86400000);
              return `
                <div class="db-up-row" data-card-id="${escapeHTML(c.id)}">
                  <div style="flex:1;min-width:0;">
                    <div class="db-up-title">${escapeHTML(c.title)}</div>
                    <div class="db-up-sub">${escapeHTML(c.assignee || '—')}</div>
                  </div>
                  <span class="db-up-date overdue">${days}d</span>
                </div>`;
            }).join('') || `<div class="empty-state" style="padding:20px;">Sem cards atrasados! 🎉</div>`}
          </div>
        </div>
      </div>
    </div>`;

  // Wire
  mount.querySelectorAll('[data-period]').forEach(b => {
    b.onclick = () => { period = b.dataset.period; paint(mount); };
  });
  const qualTgl = mount.querySelector('#db-qual-toggle');
  if (qualTgl) qualTgl.onchange = (e) => { showQual = e.target.checked; localStorage.setItem('syncro_db_qual', showQual ? '1' : '0'); paint(mount); };
  const cmpBtn = mount.querySelector('#db-compare-btn');
  if (cmpBtn) cmpBtn.onclick = () => { compareMode = true; renderCompare(mount); };
  // Menu "Exportar" (abre/fecha; fecha ao escolher item ou clicar fora)
  const dbActBtn = mount.querySelector('#db-actions-btn');
  const dbActPop = mount.querySelector('#db-actions-pop');
  if (dbActBtn && dbActPop) {
    dbActBtn.onclick = (e) => { e.stopPropagation(); const open = dbActPop.hidden; dbActPop.hidden = !open; dbActBtn.setAttribute('aria-expanded', String(open)); };
    dbActPop.querySelectorAll('.bmp-item').forEach(it => it.addEventListener('click', () => { dbActPop.hidden = true; dbActBtn.setAttribute('aria-expanded', 'false'); }));
    if (mount._dbActDoc) document.removeEventListener('click', mount._dbActDoc);
    mount._dbActDoc = (e) => { if (dbActBtn.parentElement && !dbActBtn.parentElement.contains(e.target)) { dbActPop.hidden = true; dbActBtn.setAttribute('aria-expanded', 'false'); } };
    document.addEventListener('click', mount._dbActDoc);
  }
  mount.querySelectorAll('[data-card-id]').forEach(el => {
    el.onclick = () => import('../modals/card-modal.js').then(m => m.openCardModal(el.dataset.cardId));
  });
}

/* ═══ #8 — Comparativo entre equipes (visão overviewer do Gestor/TI) ═══ */
async function renderCompare(mount) {
  if (!cmpTeams) {
    mount.innerHTML = `<div class="boot-loader">Carregando equipes…</div>`;
    try { cmpTeams = (await api.call('teams.php', 'all_teams', {}, 'GET')).teams.filter(t => t.type !== 'personal'); }
    catch (e) { cmpTeams = []; }
  }
  // Defaults: equipe ativa + a primeira diferente
  if (!cmpA) cmpA = state.currentTeamId || (cmpTeams[0]?.id || '');
  if (!cmpB) cmpB = (cmpTeams.find(t => t.id !== cmpA)?.id || '');

  const opt = (sel) => cmpTeams.map(t => `<option value="${escapeHTML(t.id)}" ${t.id===sel?'selected':''}>${escapeHTML(t.name)}</option>`).join('');
  mount.innerHTML = `
    <div class="dash-page">
      <div class="db-topbar">
        <button class="btn btn-sm btn-ghost" id="cmp-back">← Voltar ao dashboard</button>
        <span class="db-topbar-label" style="margin-left:8px;">Comparar:</span>
        <select class="input cmp-sel" id="cmp-a">${opt(cmpA)}</select>
        <span class="cmp-vs">×</span>
        <select class="input cmp-sel" id="cmp-b">${opt(cmpB)}</select>
      </div>
      <div id="cmp-body"><div class="boot-loader">Carregando comparação…</div></div>
    </div>`;

  mount.querySelector('#cmp-back').onclick = () => { compareMode = false; paint(mount); };
  const reload = () => loadCompare(mount.querySelector('#cmp-body'));
  mount.querySelector('#cmp-a').onchange = (e) => { cmpA = e.target.value; reload(); };
  mount.querySelector('#cmp-b').onchange = (e) => { cmpB = e.target.value; reload(); };
  reload();
}

async function loadCompare(body) {
  if (!cmpA || !cmpB) { body.innerHTML = `<div class="mp-empty">Escolha duas equipes para comparar.</div>`; return; }
  body.innerHTML = `<div class="boot-loader">Carregando comparação…</div>`;
  let res;
  try { res = await api.call('teams.php', 'compare', { a: cmpA, b: cmpB }, 'GET'); }
  catch (e) { body.innerHTML = `<div class="mp-empty">Erro: ${escapeHTML(e.message)}</div>`; return; }
  const A = res.a, B = res.b;
  if (!A || !B) { body.innerHTML = `<div class="mp-empty">Não foi possível carregar uma das equipes.</div>`; return; }

  const taxa = (s) => (s.concluded + s.active) > 0 ? Math.round(s.concluded / (s.concluded + s.active) * 100) : 0;
  const rows = [
    ['✅ Concluídos',        A.stats.concluded,            B.stats.concluded,            'higher'],
    ['📋 Ativos',            A.stats.active,               B.stats.active,               'none'],
    ['📈 Taxa de conclusão', taxa(A.stats),                taxa(B.stats),                'higher', '%'],
    ['⏰ Atrasados',         A.stats.overdue,              B.stats.overdue,              'lower'],
    ['💰 Economia/mês',      A.stats.economyMonth,         B.stats.economyMonth,         'higher', 'money'],
    ['⏱️ Horas/mês',         A.stats.hoursMonth,           B.stats.hoursMonth,           'higher', 'h'],
    ['☑️ Subtarefas feitas', A.stats.subtasksDone,         B.stats.subtasksDone,         'higher'],
    ['💬 Comentários',       A.stats.comments,             B.stats.comments,             'none'],
    ['👥 Membros',           A.stats.members,              B.stats.members,              'none'],
    ['🙌 Contribuidores',    A.stats.contributors,         B.stats.contributors,         'higher'],
    ['📅 Idade (dias)',      A.stats.ageDays,              B.stats.ageDays,              'none'],
  ];
  const fmt = (v, unit) => unit === 'money' ? fmtMoney(v) : unit === '%' ? v + '%' : unit === 'h' ? Number(v).toLocaleString('pt-BR') + 'h' : Number(v).toLocaleString('pt-BR');
  const winCls = (a, b, dir) => {
    if (dir === 'none' || a === b) return ['', ''];
    const aWins = dir === 'higher' ? a > b : a < b;
    return aWins ? ['cmp-win', ''] : ['', 'cmp-win'];
  };
  const head = (T) => `
    <div class="cmp-team-head" style="--c:${escapeHTML(T.team.color || '#00796D')};">
      <span class="cmp-team-ico">${escapeHTML(T.team.icon || '👥')}</span>
      <span class="cmp-team-name">${escapeHTML(T.team.name)}</span>
      ${(T.team.tags && T.team.tags[0]) ? `<span class="eqs-tag" style="--tag:${escapeHTML(T.team.tags[0].color||'#00796D')};">${escapeHTML(T.team.tags[0].name)}</span>` : ''}
    </div>`;

  body.innerHTML = `
    <div class="cmp-grid">
      <div class="cmp-col-label"></div>
      ${head(A)}
      ${head(B)}
      ${rows.map(([label, a, b, dir, unit]) => {
        const [ca, cb] = winCls(a, b, dir);
        return `
          <div class="cmp-metric">${label}</div>
          <div class="cmp-val ${ca}">${fmt(a, unit)}</div>
          <div class="cmp-val ${cb}">${fmt(b, unit)}</div>`;
      }).join('')}
    </div>
    <p class="cmp-foot">Visão de overviewer: você vê os números das equipes mesmo sem ser membro. Destaque em <span class="cmp-win-legend">verde</span> = melhor desempenho na linha.</p>`;
}

function kpi(label, value, sub, variant, icon, iconCls) {
  return `
    <div class="kpi ${variant||''}">
      <span class="kpi-label">${escapeHTML(label)}</span>
      <span class="kpi-value">${escapeHTML(String(value))}</span>
      <span class="kpi-sub">${sub}</span>
      <span class="kpi-icon ${iconCls||'brand'}">${escapeHTML(icon||'')}</span>
    </div>`;
}

function gainCard(label, value, sub, isPrimary) {
  return `
    <div class="db-gain-card" ${isPrimary?'style="border-left-color:var(--primary);"':''}>
      <span class="db-gain-label">${escapeHTML(label)}</span>
      <span class="db-gain-value" ${isPrimary?'style="color:var(--primary);"':''}>${escapeHTML(value)}</span>
      <span class="db-gain-sub">${escapeHTML(sub)}</span>
    </div>`;
}

function deltaHtml(cur, prev) {
  if (prev === 0 && cur === 0) return 'sem comparação';
  if (prev === 0) return `<span style="color:var(--success);">+${cur} vs período anterior</span>`;
  const diff = cur - prev;
  if (diff === 0) return 'sem variação';
  const pct = Math.abs(Math.round((diff/prev)*100));
  return diff > 0
    ? `<span style="color:var(--success);">▲ ${pct}% vs anterior</span>`
    : `<span style="color:var(--danger);">▼ ${pct}% vs anterior</span>`;
}

function computeThroughput(cards, weeks) {
  const now = new Date();
  const startMon = new Date(now);
  // domingo desta semana
  startMon.setDate(now.getDate() - now.getDay());
  startMon.setHours(0,0,0,0);

  const result = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const wStart = new Date(startMon); wStart.setDate(startMon.getDate() - i*7);
    const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate() + 7);
    const count = cards.filter(c => isDoneColumn(c.columnId) && c.updatedAt
      && new Date(c.updatedAt) >= wStart && new Date(c.updatedAt) < wEnd).length;
    result.push({
      label: `${String(wStart.getDate()).padStart(2,'0')}/${String(wStart.getMonth()+1).padStart(2,'0')}`,
      count,
    });
  }
  return result;
}

function donutSvg(items, total) {
  const cx = 80, cy = 80, r = 60, sw = 22;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = items.map(it => {
    const len = (it.count / total) * circ;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${it.color}" stroke-width="${sw}"
      stroke-dasharray="${len} ${circ - len}"
      stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += len;
    return arc;
  }).join('');
  return `
    <svg class="donut-svg" width="180" height="180" viewBox="0 0 160 160">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${sw}"/>
      ${arcs}
      <text x="${cx}" y="${cy-4}" text-anchor="middle" fill="var(--text)" style="font-size:24px;font-weight:800;">${total}</text>
      <text x="${cx}" y="${cy+18}" text-anchor="middle" fill="var(--text-muted)" style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">cards</text>
    </svg>`;
}
