import { isDoneColumn } from '../core/state.js';
/* ═══ SyncroFlow — js/views/gantt.js
   Gantt: 3 zooms (dia/semana/mês), agrupamento
   por Coluna/Responsável/Prioridade, filtro por responsável,
   linha "hoje" vertical, barras com progress + assignee + ícones,
   auto-scroll, sem cards mostra timeline vazia mesmo assim. */
import { state } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { api } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/confirm.js';
import { attachDatePicker, setDatePickerValue } from '../ui/datepicker.js';

let zoom = 'week';   // 'dia' | 'week' | 'month'
let anchor = new Date();
let groupBy = 'column';   // 'column' | 'assignee' | 'priority'
let filterAssignee = '';
let _milestones = [];
let _msTeam = null;
let showBacklog = localStorage.getItem('syncro_gantt_backlog') !== '0'; // padrão: mostra
let showDone = localStorage.getItem('syncro_gantt_done') === '1';       // padrão: OCULTA concluídos

const MES_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const WD_SHORT  = ['dom','seg','ter','qua','qui','sex','sáb'];

export const gantt = {
  render(mount) {
    paint(mount);
    if (_msTeam !== state.currentTeamId) {
      _msTeam = state.currentTeamId;
      api.call('milestones.php', 'list', { team_id: state.currentTeamId }, 'GET')
        .then(r => { _milestones = r.milestones || []; paint(mount); })
        .catch(() => { _milestones = []; });
    }
  }
};

function paint(mount) {
  const today = new Date(); today.setHours(0,0,0,0);

  // Colunas de backlog desta equipe (por flag is_backlog OU id/nome "backlog")
  const backlogCols = new Set(
    (state.columns || [])
      .filter(col => col.is_backlog || /backlog/i.test(col.id) || /backlog/i.test(col.name || ''))
      .map(col => col.id)
  );
  // Cards com data (Backlog é opcional, configurável pelo usuário)
  let cards = state.cards.filter(c =>
    !c.archived && (c.startDate || c.dueDate)
    && (showBacklog || !backlogCols.has(c.columnId))
    && (showDone || !isDoneColumn(c.columnId)));   // oculta concluídos por padrão (anti-poluição)
  if (filterAssignee) cards = cards.filter(c => c.assignee === filterAssignee);

  // Range
  const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  let rangeStart, rangeEnd, cellW;
  if (zoom === 'dia') {
    rangeStart = addDays(a, -6);
    rangeEnd   = addDays(a, 7);
    cellW = 72;
  } else if (zoom === 'week') {
    const day = a.getDay();
    rangeStart = addDays(a, -day - 7);
    rangeEnd   = addDays(rangeStart, 6 * 7 - 1);
    cellW = 36;
  } else {
    rangeStart = new Date(a.getFullYear(), a.getMonth() - 1, 1);
    rangeEnd   = new Date(a.getFullYear(), a.getMonth() + 3, 0);
    cellW = 16;
  }
  const totalDays = diffDays(rangeStart, rangeEnd) + 1;
  const tlWidth   = totalDays * cellW;

  // Só mostra cards cuja barra INTERSECTA a janela visível — evita "linhas vazias"
  // de cards antigos (já concluídos há tempos) que não têm barra na faixa atual.
  cards = cards.filter(c => {
    const sd = parseYMD(c.startDate), ed = parseYMD(c.dueDate);
    let s = sd || ed, e = ed || sd;
    if (!s || !e) return false;
    if (s > e) { const t = s; s = e; e = t; }
    return e >= rangeStart && s <= rangeEnd;
  });

  // Cabeçalho da timeline (mês acima quando faz sentido, dia embaixo)
  let headHTML = '';
  let lastMonthShown = -1;
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(rangeStart, i);
    const isWE = d.getDay() === 0 || d.getDay() === 6;
    const isToday = d.getTime() === today.getTime();
    const isMonthStart = d.getDate() === 1;
    let monthLabel;
    if (zoom === 'dia') {
      monthLabel = WD_SHORT[d.getDay()];
    } else {
      monthLabel = (d.getMonth() !== lastMonthShown && (zoom === 'month' || isMonthStart || i === 0))
        ? MES_SHORT[d.getMonth()] + (zoom === 'month' ? '/' + String(d.getFullYear()).slice(2) : '')
        : '';
      if (monthLabel) lastMonthShown = d.getMonth();
    }
    const dayLabel = (zoom === 'week' || zoom === 'dia')
      ? d.getDate()
      : (d.getDate() === 1 ? d.getDate() : (d.getDate() % 5 === 0 ? d.getDate() : ''));
    headHTML += `
      <div class="gantt-tl-cell${isWE?' weekend':''}${isMonthStart?' month-start':''}${isToday?' is-today':''}" style="width:${cellW}px;">
        ${monthLabel ? `<span class="tl-month">${escapeHTML(monthLabel)}</span>` : '<span class="tl-month">&nbsp;</span>'}
        <span class="tl-day">${dayLabel || '&nbsp;'}</span>
      </div>`;
  }

  // Agrupamento
  const groupMap = {};
  const groups = [];
  if (groupBy === 'column') {
    state.columns.slice().sort((x,y)=>x.position-y.position).forEach((col, idx) => {
      groupMap[col.id] = { id: col.id, name: col.name, icon: col.icon, color: col.color || columnColor(col.id), idx, cards: [] };
    });
    cards.forEach(c => {
      if (groupMap[c.columnId]) groupMap[c.columnId].cards.push(c);
    });
    Object.values(groupMap).filter(g => g.cards.length).sort((x,y)=>x.idx-y.idx).forEach(g => groups.push(g));
  } else if (groupBy === 'assignee') {
    cards.forEach(c => {
      const k = c.assignee || '(sem responsável)';
      if (!groupMap[k]) groupMap[k] = { id: k, name: k, color: 'var(--primary)', cards: [] };
      groupMap[k].cards.push(c);
    });
    Object.values(groupMap).sort((x,y)=>x.name.localeCompare(y.name)).forEach(g => groups.push(g));
  } else if (groupBy === 'priority') {
    const ord = { urgente:0, alta:1, media:2, baixa:3 };
    const col = { urgente:'var(--danger)', alta:'var(--warning)', media:'var(--info)', baixa:'var(--success)' };
    const lbl = { urgente:'Urgente', alta:'Alta prioridade', media:'Média prioridade', baixa:'Baixa prioridade' };
    cards.forEach(c => {
      const k = c.priority || 'media';
      if (!groupMap[k]) groupMap[k] = { id:k, name: lbl[k]||k, idx: ord[k]??9, color: col[k]||'var(--primary)', cards: [] };
      groupMap[k].cards.push(c);
    });
    Object.values(groupMap).sort((x,y)=>(x.idx??9)-(y.idx??9)).forEach(g => groups.push(g));
  }

  // Linhas (grupo + cards)
  let bodyHTML = '';
  if (groups.length === 0) {
    bodyHTML = `
      <div class="gantt-row-left"></div>
      <div class="gantt-row-right">
        <div class="gantt-empty">📅 Nenhum card com data cadastrada. Defina <strong>Início</strong> ou <strong>Previsão</strong> nos cards para vê-los aqui.</div>
      </div>`;
  } else {
    let altRow = false;
    groups.forEach(g => {
      bodyHTML += `
        <div class="gantt-group-row">
          <span class="gantt-group-inner">
            <span class="gantt-group-dot" style="background:${g.color};"></span>
            ${g.icon ? escapeHTML(g.icon) + ' ' : ''}${escapeHTML(g.name)} <span style="color:var(--text-muted);font-weight:600;">· ${g.cards.length}</span>
          </span>
        </div>`;
      // Ordena
      g.cards.sort((a, b) => {
        const sa = parseYMD(a.startDate || a.dueDate) || new Date(0);
        const sb = parseYMD(b.startDate || b.dueDate) || new Date(0);
        return sa - sb;
      });
      g.cards.forEach(c => {
        const sd = parseYMD(c.startDate);
        const ed = parseYMD(c.dueDate);
        let start = sd || ed, end = ed || sd;
        if (start > end) { const t = start; start = end; end = t; }

        const visStart = start < rangeStart ? rangeStart : start;
        const visEnd   = end   > rangeEnd   ? rangeEnd   : end;

        let barHTML = '';
        if (visStart && visEnd && visStart <= visEnd) {
          const offsetDays = diffDays(rangeStart, visStart);
          const spanDays   = diffDays(visStart, visEnd) + 1;
          const overdue = ed && ed < today && !isDoneColumn(c.columnId);
          const done    = isDoneColumn(c.columnId);
          const left    = offsetDays * cellW;
          const width   = Math.max(spanDays * cellW - 4, 18);
          const progress = Math.max(0, Math.min(100, Number(c.progress) || 0));
          const initials = c.assignee
            ? `<span class="gantt-bar-avatar" title="${escapeHTML(c.assignee)}">${escapeHTML(c.assignee.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase())}</span>`
            : '';
          const startFmt = (c.startDate || c.dueDate || '').slice(5);
          const endFmt   = (c.dueDate   || c.startDate || '').slice(5);
          const tooltip = `${c.title} · ${startFmt} → ${endFmt}${c.assignee?' · '+c.assignee:''}${overdue?' (atrasado)':''}`;
          barHTML = `
            <div class="gantt-bar ${overdue?'is-overdue':''} ${done?'is-done':''}"
                 style="left:${left}px;width:${width}px;background:${getBarColor(c)};"
                 data-card-id="${escapeHTML(c.id)}"
                 title="${escapeHTML(tooltip)}">
              ${progress > 0 && progress < 100 ? `<span class="bar-progress" style="width:${progress}%;"></span>` : ''}
              ${initials}
              ${overdue ? '<span class="bar-icon">⚠</span>' : ''}
              ${done    ? '<span class="bar-icon">✓</span>' : ''}
              ${progress > 0 && progress < 100 ? `<span class="bar-meta">${progress}%</span>` : ''}
              <span class="bar-label">${escapeHTML(c.title.slice(0, 40))}${c.title.length>40?'…':''}</span>
            </div>`;
        }
        const metaParts = [];
        if (c.assignee) metaParts.push(escapeHTML(c.assignee));
        if (c.startDate || c.dueDate) {
          metaParts.push(escapeHTML((c.startDate ? c.startDate.slice(5) : '?') + ' → ' + (c.dueDate ? c.dueDate.slice(5) : '?')));
        }
        const subTotal = (c.subtasks||[]).length;
        const subDone  = (c.subtasks||[]).filter(s=>s.done).length;
        if (subTotal) metaParts.push(`Sub: ${Math.round((subDone/subTotal)*100)}%`);

        bodyHTML += `
          <div class="gantt-row-left ${altRow?'alt':''}" data-card-id="${escapeHTML(c.id)}">
            <div class="gantt-row-title">${escapeHTML(c.title)}</div>
            ${metaParts.length ? `<div class="gantt-row-meta">${metaParts.join(' · ')}</div>` : ''}
          </div>
          <div class="gantt-row-right ${altRow?'alt':''}">${barHTML}</div>`;
        altRow = !altRow;
      });
    });
  }

  // Linha do "hoje" vertical
  let todayLineHTML = '';
  if (today >= rangeStart && today <= rangeEnd) {
    const left = (diffDays(rangeStart, today) * cellW) + (cellW / 2);
    todayLineHTML = `<div class="gantt-today-line" style="left:calc(240px + ${left}px);" title="Hoje"></div>`;
  }

  // Marcos (milestones) verticais
  let msHTML = '';
  _milestones.forEach(m => {
    const md = parseYMD(m.date);
    if (!md || md < rangeStart || md > rangeEnd) return;
    const left = (diffDays(rangeStart, md) * cellW) + (cellW / 2);
    const color = /^#[0-9a-fA-F]{6}$/.test(m.color || '') ? m.color : '#d97757';
    msHTML += `<div class="gantt-ms-line" style="left:calc(240px + ${left}px);--msc:${color};" title="${escapeHTML(m.name)} — ${escapeHTML(m.date)}">
      <span class="gantt-ms-flag" data-ms-id="${escapeHTML(m.id)}" data-ms-name="${escapeHTML(m.name)}">◆ ${escapeHTML(m.name)}</span></div>`;
  });

  // Título + sub
  const rangeTitle = `${MES_SHORT[rangeStart.getMonth()]}/${String(rangeStart.getFullYear()).slice(2)} — ${MES_SHORT[rangeEnd.getMonth()]}/${String(rangeEnd.getFullYear()).slice(2)}`;
  const subTitle = `${cards.length} card${cards.length===1?'':'s'} com data · ${groups.length} ${groups.length===1?'grupo':'grupos'}`;

  // Filtro de responsável
  const allAssignees = Array.from(new Set(
    state.cards.filter(c => !c.archived && (c.startDate||c.dueDate) && c.assignee).map(c => c.assignee)
  )).sort();

  mount.innerHTML = `
    <div class="gantt-toolbar">
      <button class="btn btn-secondary btn-sm" id="gantt-prev" title="Anterior">‹</button>
      <button class="btn btn-secondary btn-sm" id="gantt-today">Hoje</button>
      <button class="btn btn-secondary btn-sm" id="gantt-next" title="Próximo">›</button>
      <div class="gantt-title-block">
        <span class="gantt-title-range">${escapeHTML(rangeTitle)}</span>
        <span class="gantt-title-sub">${escapeHTML(subTitle)}</span>
      </div>
      <div class="gantt-zoom-switch">
        <button data-zoom="dia"   class="${zoom==='dia'?'active':''}">Dia</button>
        <button data-zoom="week"  class="${zoom==='week'?'active':''}">Semana</button>
        <button data-zoom="month" class="${zoom==='month'?'active':''}">Mês</button>
      </div>
      <button class="btn btn-secondary btn-sm" id="gantt-add-ms" title="Adicionar marco" style="margin-left:8px;">◆ Marco</button>
    </div>

    <div class="gantt-filter-bar">
      <span class="gantt-filter-label">Agrupar por</span>
      <select id="gantt-group-sel">
        <option value="column"   ${groupBy==='column'?'selected':''}>Coluna</option>
        <option value="assignee" ${groupBy==='assignee'?'selected':''}>Responsável</option>
        <option value="priority" ${groupBy==='priority'?'selected':''}>Prioridade</option>
      </select>
      ${allAssignees.length ? `
        <span class="gantt-filter-label" style="margin-left:14px;">Responsável</span>
        <select id="gantt-assignee-sel">
          <option value="">Todos</option>
          ${allAssignees.map(a => `<option value="${escapeHTML(a)}" ${filterAssignee===a?'selected':''}>${escapeHTML(a)}</option>`).join('')}
        </select>
      ` : ''}
      <label class="gantt-backlog-toggle" title="Mostrar/ocultar cards na coluna Backlog" style="margin-left:auto;">
        <input type="checkbox" id="gantt-backlog" ${showBacklog?'checked':''}>
        <span>Mostrar Backlog</span>
      </label>
      <label class="gantt-backlog-toggle" title="Mostrar/ocultar cards já concluídos (ocultos por padrão para não poluir a linha do tempo)">
        <input type="checkbox" id="gantt-done" ${showDone?'checked':''}>
        <span>Mostrar concluídos</span>
      </label>
    </div>

    <div class="gantt-wrap" id="gantt-wrap" style="--gantt-cell-w:${cellW}px;">
      <div class="gantt-table" style="grid-template-columns: 240px ${tlWidth}px;">
        <div class="gantt-th-left">Card</div>
        <div class="gantt-th-right"><div class="gantt-timeline-head">${headHTML}</div></div>
        ${bodyHTML}
      </div>
      ${todayLineHTML}
      ${msHTML}
    </div>

    <div class="gantt-legend">
      <span class="gantt-legend-item"><span class="gantt-legend-swatch" style="background:#2563eb;"></span> Em andamento</span>
      <span class="gantt-legend-item"><span class="gantt-legend-swatch" style="background:var(--sf-green);"></span> Em pausa</span>
      <span class="gantt-legend-item"><span class="gantt-legend-swatch" style="background:var(--success);"></span> Concluído</span>
      <span class="gantt-legend-item"><span class="gantt-legend-swatch" style="background:var(--text-soft);"></span> Backlog</span>
      <span class="gantt-legend-item"><span class="gantt-legend-swatch" style="background:var(--danger);"></span> Atrasado</span>
      <span class="gantt-legend-item" title="Barra preenchida = progresso">
        <span class="gantt-legend-swatch" style="background:linear-gradient(to right, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.15) 100%);border:1px solid var(--border);"></span>
        Progresso
      </span>
    </div>
  `;

  // Wire
  const stepDays = zoom === 'month' ? 30 : zoom === 'dia' ? 7 : 7;
  mount.querySelector('#gantt-prev').onclick = () => { anchor = addDays(anchor, -stepDays); paint(mount); };
  mount.querySelector('#gantt-next').onclick = () => { anchor = addDays(anchor, stepDays); paint(mount); };
  mount.querySelector('#gantt-today').onclick = () => { anchor = new Date(); paint(mount); };
  mount.querySelectorAll('[data-zoom]').forEach(b => {
    b.onclick = () => { zoom = b.dataset.zoom; paint(mount); };
  });
  const groupSel = mount.querySelector('#gantt-group-sel');
  if (groupSel) groupSel.onchange = (e) => { groupBy = e.target.value; paint(mount); };
  const assSel = mount.querySelector('#gantt-assignee-sel');
  if (assSel) assSel.onchange = (e) => { filterAssignee = e.target.value; paint(mount); };
  const blSel = mount.querySelector('#gantt-backlog');
  if (blSel) blSel.onchange = (e) => { showBacklog = e.target.checked; localStorage.setItem('syncro_gantt_backlog', showBacklog?'1':'0'); paint(mount); };
  const dnSel = mount.querySelector('#gantt-done');
  if (dnSel) dnSel.onchange = (e) => { showDone = e.target.checked; localStorage.setItem('syncro_gantt_done', showDone?'1':'0'); paint(mount); };
  mount.querySelectorAll('[data-card-id]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      import('../modals/card-modal.js').then(m => m.openCardModal(el.dataset.cardId));
    };
  });

  // Marcos: adicionar
  const addMsBtn = mount.querySelector('#gantt-add-ms');
  if (addMsBtn) addMsBtn.onclick = () => openMilestoneModal(mount);

  // Marcos: clicar na bandeira → excluir
  mount.querySelectorAll('.gantt-ms-flag').forEach(f => {
    f.onclick = async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog({
        title: 'Excluir marco',
        message: `Remover o marco «${f.dataset.msName}»?`,
        confirmText: 'Excluir', danger: true, icon: '◆',
      });
      if (!ok) return;
      try {
        await api.call('milestones.php', 'delete', { id: f.dataset.msId });
        _milestones = _milestones.filter(x => x.id !== f.dataset.msId);
        toast('Marco removido.', 'success');
        paint(mount);
      } catch (err) { toast(err.message || 'Erro ao remover.', 'error'); }
    };
  });

  // Auto-scroll para mostrar "hoje"
  const wrap = mount.querySelector('#gantt-wrap');
  const todayLine = wrap?.querySelector('.gantt-today-line');
  if (wrap && todayLine) {
    const m = (todayLine.style.left || '').match(/(\d+(?:\.\d+)?)px\)?$/);
    if (m) {
      const lineLeft = parseFloat(m[1]) + 240;
      wrap.scrollLeft = Math.max(0, lineLeft - wrap.clientWidth / 2);
    }
  }
}

/* ─── Modal de novo marco ─── */
function openMilestoneModal(mount) {
  const teamId = state.currentTeamId;
  const safeColor = (c) => /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#d97757';
  import('../ui/modal.js').then(({ openModal }) => {
    let editingId = null;
    const renderList = () => _milestones.length
      ? _milestones.map(m => `<div class="ms-row">
          <span class="ms-dot" style="background:${safeColor(m.color)}"></span>
          <span class="ms-row-name">${escapeHTML(m.name)}</span>
          <span class="ms-row-date">${escapeHTML((m.date || '').split('-').reverse().join('/'))}</span>
          <button class="btn btn-xs btn-ghost" data-msedit="${escapeHTML(m.id)}" title="Editar">✏️</button>
          <button class="btn btn-xs btn-ghost" data-msdel="${escapeHTML(m.id)}" title="Excluir" style="color:var(--danger)">🗑</button>
        </div>`).join('')
      : '<div class="text-muted text-sm">Nenhum marco criado ainda.</div>';

    openModal({
      title: '◆ Marcos do Gantt',
      body: `
        <div id="ms-list" class="ms-list">${renderList()}</div>
        <div class="ms-form">
          <div class="field"><label id="ms-form-title">Novo marco</label>
            <input id="ms-name" class="input" maxlength="60" placeholder="Ex.: Entrega final, Go-live…"></div>
          <div class="ms-form-grid">
            <div class="field"><label>Data</label>
              <input id="ms-date" class="input cm-date-input" type="text" data-iso="" placeholder="dd/mm/aaaa"></div>
            <div class="field"><label>Cor</label>
              <input id="ms-color" class="input" type="color" value="#d97757" style="width:56px;height:38px;padding:2px;"></div>
          </div>
        </div>`,
      footer: `
        <button class="btn btn-secondary" data-close>Fechar</button>
        <button class="btn btn-primary" id="ms-save">Adicionar marco</button>`,
    });
    const root = document.querySelector('#modal-mount') || document;
    const nameI = root.querySelector('#ms-name');
    const dateI = root.querySelector('#ms-date');
    const colorI = root.querySelector('#ms-color');
    const saveBtn = root.querySelector('#ms-save');
    const titleEl = root.querySelector('#ms-form-title');
    attachDatePicker(dateI);

    const resetForm = () => {
      editingId = null; nameI.value = ''; setDatePickerValue(dateI, ''); colorI.value = '#d97757';
      titleEl.textContent = 'Novo marco'; saveBtn.textContent = 'Adicionar marco';
    };
    const refreshList = () => { root.querySelector('#ms-list').innerHTML = renderList(); wireList(); };
    function wireList() {
      root.querySelectorAll('[data-msdel]').forEach(b => b.onclick = async () => {
        const ok = await confirmDialog({ title: 'Excluir marco', message: 'Remover este marco?', confirmText: 'Excluir', danger: true, icon: '◆' });
        if (!ok) return;
        try {
          await api.call('milestones.php', 'delete', { id: b.dataset.msdel });
          _milestones = _milestones.filter(x => x.id !== b.dataset.msdel);
          if (editingId === b.dataset.msdel) resetForm();
          refreshList(); paint(mount); toast('Marco removido.', 'success');
        } catch (e) { toast(e.message, 'error'); }
      });
      root.querySelectorAll('[data-msedit]').forEach(b => b.onclick = () => {
        const m = _milestones.find(x => x.id === b.dataset.msedit); if (!m) return;
        editingId = m.id; nameI.value = m.name || ''; setDatePickerValue(dateI, m.date || ''); colorI.value = safeColor(m.color);
        titleEl.textContent = '✏️ Editar marco'; saveBtn.textContent = 'Salvar alterações'; nameI.focus();
      });
    }
    wireList();
    saveBtn.onclick = async () => {
      const name = (nameI.value || '').trim();
      const date = dateI.dataset.iso || '';
      const color = colorI.value || '#d97757';
      if (!name) { toast('Informe um nome.', 'error'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Escolha uma data.', 'error'); return; }
      saveBtn.disabled = true;
      try {
        if (editingId) {
          await api.call('milestones.php', 'update', { id: editingId, name, date, color });
          const m = _milestones.find(x => x.id === editingId); if (m) { m.name = name; m.date = date; m.color = color; }
          toast('Marco atualizado.', 'success');
        } else {
          const r = await api.call('milestones.php', 'create', { team_id: teamId, name, date, color });
          _milestones.push({ id: r.id, name, date, color });
          toast('Marco criado.', 'success');
        }
        _milestones.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        saveBtn.disabled = false; resetForm(); refreshList(); paint(mount);
      } catch (err) { saveBtn.disabled = false; toast(err.message || 'Erro ao salvar.', 'error'); }
    };
  });
}

/* ─── Utilities ─── */
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  r.setHours(0,0,0,0);
  return r;
}
function diffDays(a, b) {
  return Math.round((b - a) / 86400000);
}
function parseYMD(s) {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}
function columnColor(colId) {
  const c = state.columns.find(x => x.id === colId);
  return (c && c.color) || 'var(--primary)';
}
function getBarColor(card) {
  if (isDoneColumn(card.columnId)) return 'var(--success)';
  if (card.columnId === 'backlog')   return 'var(--text-soft)';
  return columnColor(card.columnId);
}
