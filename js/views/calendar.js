import { isDoneColumn } from '../core/state.js';
/* ═══ SyncroFlow — js/views/calendar.js
   Calendário com feriados (nacionais + municipais/facultativos/compensações),
   FILTRO por cidade e por tipo, rótulos visíveis (sem precisar passar o mouse).
   3 modos (Mês/Ano/Agenda), contagem por dia, drag-drop de cards. */
import { state } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { prioLabel } from '../core/format.js';
import { getHolidays, getHolidaysOn, getCopaEvent, getCities, loadHolidays, loadCopa, isCopaEnabled, getCopaMatches } from '../core/holidays.js';
import { api } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { can } from '../core/rbac.js';
import { paletteHex } from '../core/cardhelpers.js';

const pad2 = (n) => String(n).padStart(2, '0');
const PRIORITY_COLOR = { urgente:'var(--danger)', alta:'var(--warning)', media:'var(--primary)', baixa:'var(--text-soft)' };
function cardColor(c) { return paletteHex(c.color) || PRIORITY_COLOR[c.priority] || 'var(--primary)'; }

const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const DIAS_FULL = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

/* tipos de feriado → cor + rótulo */
const KIND = {
  feriado:     { color:'var(--danger)',  label:'Feriado',     icon:'🎉' },
  facultativo: { color:'var(--warning)', label:'Facultativo', icon:'🟡' },
  compensacao: { color:'var(--info)',    label:'Compensação', icon:'🔵' },
};
const kindMeta = (k) => KIND[k] || { color:'var(--primary)', label:k, icon:'📅' };

let cursor = new Date(); cursor.setDate(1);
let mode = 'month';                 // 'month' | 'year' | 'agenda'
let selectedCity = null;            // null = não inicializado; '' = todas
let kindOn = { feriado:true, facultativo:true, compensacao:true };

export const calendar = {
  render(mount) {
    mount.innerHTML = `<div class="boot-loader">Carregando calendário…</div>`;
    Promise.all([loadHolidays(), loadCopa()]).finally(() => {
      if (selectedCity === null) {
        const saved = localStorage.getItem('syncro_cal_city');   // lembra a última cidade escolhida
        selectedCity = saved !== null ? saved : ((state.system && state.system.city) || '');
      }
      paint(mount);
    });
  }
};

/* feriados de um dia, já filtrados por cidade E por tipo ligado */
function dayHols(dt) {
  return getHolidaysOn(dt, selectedCity).filter(h => kindOn[h.kind] !== false);
}
function monthHols(y, m) {
  return getHolidays(y, selectedCity)
    .filter(h => h.date.getMonth() === m && kindOn[h.kind] !== false);
}

function paint(mount) {
  const cities = getCities();
  const kindBtn = (k) => {
    const meta = kindMeta(k);
    return `<button type="button" class="cal-kind ${kindOn[k]?'on':''}" data-kind="${k}" style="--k:${meta.color}">${meta.icon} ${meta.label}</button>`;
  };

  const header = `
    <div class="cal-header">
      <div class="cal-nav-group">
        <button class="cal-nav-btn" id="cal-prev" title="Anterior">←</button>
        <button class="cal-nav-btn" id="cal-today" title="Hoje" style="width:auto;padding:0 14px;font-size:12px;font-weight:700;">Hoje</button>
        <button class="cal-nav-btn" id="cal-next" title="Próximo">→</button>
      </div>
      <div class="cal-title-block"><div class="cal-title" id="cal-title">${getTitle()}</div></div>
      <div class="cal-mode-switch">
        <button data-mode="month"  class="${mode==='month'?'active':''}">Mês</button>
        <button data-mode="year"   class="${mode==='year'?'active':''}">Ano</button>
        <button data-mode="agenda" class="${mode==='agenda'?'active':''}">Agenda</button>
      </div>
    </div>
    <div class="cal-filters">
      <label class="cal-filter-city">🏙️ <span>Cidade:</span>
        <div class="cal-city-combo" id="cal-city-combo">
          <input type="text" class="cal-city-input" id="cal-city-input" placeholder="Todas as cidades"
                 value="${escapeHTML(selectedCity || '')}" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="cal-city-list">
          <span class="cal-city-caret" aria-hidden="true">▾</span>
          <div class="cal-city-list" id="cal-city-list" role="listbox"></div>
        </div>
      </label>
      <div class="cal-kinds">${['feriado','facultativo','compensacao'].map(kindBtn).join('')}</div>
    </div>`;

  let body = '';
  if (mode === 'month')  body = renderMonth();
  if (mode === 'year')   body = renderYear();
  if (mode === 'agenda') body = renderAgenda();

  mount.innerHTML = `<div class="cal-page">${copaBanner()}${header}${body}</div>`;

  mount.querySelector('#cal-prev').onclick = () => {
    if (mode === 'year') cursor.setFullYear(cursor.getFullYear() - 1);
    else cursor.setMonth(cursor.getMonth() - 1);
    paint(mount);
  };
  mount.querySelector('#cal-next').onclick = () => {
    if (mode === 'year') cursor.setFullYear(cursor.getFullYear() + 1);
    else cursor.setMonth(cursor.getMonth() + 1);
    paint(mount);
  };
  mount.querySelector('#cal-today').onclick = () => { cursor = new Date(); cursor.setDate(1); paint(mount); };
  mount.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { mode = b.dataset.mode; paint(mount); }; });
  setupCityCombo(mount, cities);
  mount.querySelectorAll('.cal-kind').forEach(b => {
    b.onclick = () => { kindOn[b.dataset.kind] = !kindOn[b.dataset.kind]; paint(mount); };
  });
  mount.querySelectorAll('.cal-card-mini[data-card]').forEach(el => {
    el.onclick = () => import('../modals/card-modal.js').then(m => m.openCardModal(el.dataset.card));
  });
  mount.querySelectorAll('[data-day-click]').forEach(el => {
    el.onclick = (e) => { if (e.target.closest('.cal-card-mini')) return; showDayDetails(new Date(el.dataset.dayClick)); };
  });
  setupCalendarDnd(mount);
}

/* Combobox de cidade: pesquisável, com o CSS do sistema, sem deformar a página. */
function setupCityCombo(mount, cities) {
  const combo = mount.querySelector('#cal-city-combo');
  if (!combo) return;
  const input = combo.querySelector('#cal-city-input');
  const list = combo.querySelector('#cal-city-list');
  const all = ['', ...cities];
  const labelFor = (c) => c === '' ? 'Todas as cidades' : c;

  const renderList = (q) => {
    const qq = (q || '').trim().toLowerCase();
    const items = all.filter(c => labelFor(c).toLowerCase().includes(qq));
    list.innerHTML = items.length
      ? items.map(c => `<div class="cal-city-opt ${c === selectedCity ? 'is-sel' : ''}" data-city="${escapeHTML(c)}" role="option">${escapeHTML(labelFor(c))}</div>`).join('')
      : `<div class="cal-city-empty">Nenhuma cidade encontrada</div>`;
    list.querySelectorAll('[data-city]').forEach(el => el.addEventListener('mousedown', (e) => {
      e.preventDefault();              // evita o blur antes de registrar o clique
      selectedCity = el.dataset.city;
      localStorage.setItem('syncro_cal_city', selectedCity);
      paint(mount);
    }));
  };
  const openList = () => { combo.classList.add('open'); input.setAttribute('aria-expanded', 'true'); renderList(''); input.select(); };
  const closeList = () => { combo.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); };

  input.addEventListener('focus', openList);
  input.addEventListener('input', () => { combo.classList.add('open'); renderList(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = selectedCity || ''; closeList(); input.blur(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const first = list.querySelector('[data-city]');
      if (first) { selectedCity = first.dataset.city; localStorage.setItem('syncro_cal_city', selectedCity); paint(mount); }
    }
  });
  combo.querySelector('.cal-city-caret')?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (combo.classList.contains('open')) closeList(); else input.focus();
  });
  // Fecha ao clicar fora — um único listener global por vez (evita acúmulo entre repaints).
  if (mount._cityDocHandler) document.removeEventListener('mousedown', mount._cityDocHandler);
  mount._cityDocHandler = (e) => { if (!combo.contains(e.target)) closeList(); };
  document.addEventListener('mousedown', mount._cityDocHandler);
}

function _norm(s) { return (s || '').trim().toLowerCase(); }

/* Arrastar cards para mudar a data de entrega (modo Mês) */
function setupCalendarDnd(mount) {
  let dragId = null;
  mount.querySelectorAll('.cal-card-mini[data-card]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      dragId = el.dataset.card; el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move'; e.stopPropagation();
    });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragId = null; });
  });
  mount.querySelectorAll('[data-drop-date]').forEach(cell => {
    cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('cal-drop'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('cal-drop'));
    cell.addEventListener('drop', async (e) => {
      e.preventDefault(); cell.classList.remove('cal-drop');
      if (!dragId) return;
      const newDate = cell.dataset.dropDate;
      const card = state.cards.find(c => c.id === dragId);
      if (!card || card.dueDate === newDate) return;
      if (!can(state.currentUser?.role, 'edit')) { toast('Sem permissão para mover.', 'error'); return; }
      const prev = card.dueDate; const movingId = dragId;
      card.dueDate = newDate; paint(mount);
      api.call('cards.php', 'update', { id: movingId, dueDate: newDate, revisionSeen: card.revision })
        .then(res => { if (res?.card) { const i = state.cards.findIndex(c => c.id === movingId); if (i>=0) state.cards[i] = res.card; if (state.view==='calendar') paint(mount); } })
        .catch(err => {
          const cur = state.cards.find(c => c.id === movingId); if (cur) cur.dueDate = prev; paint(mount);
          toast(err.status === 409 ? 'Outro usuário editou este card.' : (err.message||'Falha ao mover.'), 'error');
        });
    });
  });
}

function getTitle() {
  if (mode === 'year') return cursor.getFullYear();
  return `${MESES_FULL[cursor.getMonth()]} ${cursor.getFullYear()}`;
}

/* Banner do próximo jogo do Brasil (só com o "Modo Copa" ligado). */
function copaBanner() {
  if (!isCopaEnabled()) return '';
  const games = getCopaMatches().filter(m => m.brazil);
  if (!games.length) return '';
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  const fmtBR = (iso) => { const [, mo, d] = iso.split('-'); return `${d}/${mo}`; };
  const upcoming = games.filter(m => m.date >= todayISO).sort((a,b) => a.date.localeCompare(b.date));
  const past     = games.filter(m => m.date <  todayISO).sort((a,b) => b.date.localeCompare(a.date));
  const next = upcoming[0];
  const last = past.find(m => m.result) || past[0];
  let inner = '';
  if (next) {
    const isToday = next.date === todayISO;
    inner = `<span class="copa-banner-label">${isToday ? '🔥 Hoje tem Brasil!' : 'Próximo jogo do Brasil'}</span>
      <strong class="copa-banner-game">${escapeHTML(next.name)}</strong>
      <span class="copa-banner-when">${fmtBR(next.date)}${next.time ? ' · ' + escapeHTML(next.time) : ''}</span>
      ${next.result ? `<span class="copa-banner-score">${escapeHTML(next.result)}</span>` : ''}`;
  } else if (last) {
    inner = `<span class="copa-banner-label">Último jogo do Brasil</span>
      <strong class="copa-banner-game">${escapeHTML(last.name)}</strong>
      ${last.result ? `<span class="copa-banner-score">${escapeHTML(last.result)}</span>` : `<span class="copa-banner-when">${fmtBR(last.date)}</span>`}`;
  } else { return ''; }
  return `<div class="copa-banner"><span class="copa-banner-flag">🇧🇷</span>${inner}</div>`;
}

/* chip de feriado (com cidade e cor por tipo) */
function holChip(h, compact) {
  const m = kindMeta(h.kind);
  const city = h.city ? `<span class="cal-hol-city">${escapeHTML(h.city)}</span>` : '';
  return `<div class="cal-hol-chip" style="border-left-color:${m.color}" title="${escapeHTML(m.label)}: ${escapeHTML(h.name)}${h.city?' — '+escapeHTML(h.city):' — todas as cidades'}">
    <span class="cal-hol-name">${escapeHTML(h.name)}</span>${compact?'':city}
  </div>`;
}

function renderMonth() {
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const today = new Date();
  const isToday = (d) => d.toDateString() === today.toDateString();

  // mapa dia → feriados (filtrados)
  const holByDay = {};
  monthHols(y, m).forEach(h => { (holByDay[h.date.getDate()] = holByDay[h.date.getDate()] || []).push(h); });

  const byDay = {};
  state.cards.filter(c => !c.archived && c.dueDate).forEach(c => {
    const dt = new Date(c.dueDate + 'T00:00:00');
    if (dt.getFullYear() === y && dt.getMonth() === m) (byDay[dt.getDate()] = byDay[dt.getDate()] || []).push(c);
  });

  const firstWeekday = new Date(y, m, 1).getDay();
  const lastDay = new Date(y, m+1, 0).getDate();
  const prevMonthLast = new Date(y, m, 0).getDate();

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) cells.push({ day: prevMonthLast - i, muted: true });
  for (let i = 1; i <= lastDay; i++) {
    const dt = new Date(y, m, i);
    const hols = holByDay[i] || [];
    const copa = getCopaEvent(dt);
    const weekend = dt.getDay() === 0 || dt.getDay() === 6;
    cells.push({ day: i, dt, muted: false, today: isToday(dt), cards: byDay[i] || [], hols, copa, weekend });
  }
  let next = 1;
  while (cells.length < 42) cells.push({ day: next++, muted: true });

  const totalCards = Object.values(byDay).flat().length;
  const totalHolidays = Object.values(holByDay).flat().length;

  return `
    <div class="cal-summary">
      <div class="cal-summary-item">📋 <strong>${totalCards}</strong> card${totalCards!==1?'s':''} com entrega</div>
      <div class="cal-summary-item">📅 <strong>${totalHolidays}</strong> ${totalHolidays!==1?'datas comemorativas':'data comemorativa'}${selectedCity?` em ${escapeHTML(selectedCity)}`:''}</div>
    </div>
    <div class="cal-grid">
      ${DIAS.map((d,i) => `<div class="cal-day-header ${i===0||i===6?'weekend':''}">${d}</div>`).join('')}
      ${cells.map(c => {
        if (c.muted) return `<div class="cal-day muted"><div class="cal-day-num">${c.day}</div></div>`;
        const cls = [
          c.today ? 'today' : '',
          c.hols.length ? 'holiday' : '',
          c.copa ? (c.copa.brazil ? 'copa copa-brazil' : 'copa') : '',
          c.weekend ? 'weekend' : '',
        ].filter(Boolean).join(' ');
        const visible = c.cards.slice(0, 2);
        const extra = c.cards.length - visible.length;
        const dtISO = c.dt.toISOString();
        const dropKey = `${y}-${pad2(m+1)}-${pad2(c.day)}`;
        const overdueCards = c.cards.filter(card => !isDoneColumn(card.columnId) && new Date(card.dueDate + 'T23:59:59') < new Date());
        const visHols = c.hols.slice(0, 2);
        const moreHols = c.hols.length - visHols.length;
        const dayTitle = [
          ...c.hols.map(h => `${kindMeta(h.kind).label}: ${h.name}${h.city ? ' — ' + h.city : ''}`),
          c.copa ? `⚽ ${c.copa.name}${c.copa.result ? ' · ' + c.copa.result : (c.copa.time ? ' · ' + c.copa.time : '')}` : '',
        ].filter(Boolean).join('\n');
        return `
          <div class="cal-day ${cls}" data-day-click="${dtISO}" data-drop-date="${dropKey}"${dayTitle ? ` title="${escapeHTML(dayTitle)}"` : ''}>
            <div class="cal-day-head">
              <span class="cal-day-num">${c.day}</span>
              ${c.hols.length ? `<span class="cal-day-flag" style="color:${kindMeta(c.hols[0].kind).color}">${kindMeta(c.hols[0].kind).icon}</span>`
                : c.copa ? `<span class="cal-day-flag">${c.copa.brazil ? '🇧🇷' : '⚽'}</span>` : ''}
            </div>
            ${visHols.map(h => holChip(h, false)).join('')}
            ${moreHols > 0 ? `<div class="cal-more-link">+${moreHols} data${moreHols>1?'s':''}</div>` : ''}
            ${c.copa ? `<div class="cal-day-copa-name">⚽ ${escapeHTML(c.copa.name)}${c.copa.result ? ` <b>${escapeHTML(c.copa.result)}</b>` : (c.copa.time ? ` <b>${escapeHTML(c.copa.time)}</b>` : '')}</div>` : ''}
            ${visible.map(card => {
              const overdue = overdueCards.includes(card);
              const done = isDoneColumn(card.columnId);
              const cls2 = done ? 'done' : overdue ? 'overdue' : '';
              const dot = overdue ? '⏰ ' : '';
              return `<div class="cal-card-mini ${cls2}" draggable="true" data-card="${escapeHTML(card.id)}" style="border-left-color:${cardColor(card)}" title="${escapeHTML(card.title)}${overdue?' (atrasado)':''} — arraste para mudar a data">${dot}${escapeHTML(card.title)}</div>`;
            }).join('')}
            ${extra > 0 ? `<div class="cal-more-link">+${extra} card${extra>1?'s':''}</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function renderYear() {
  const y = cursor.getFullYear();
  const today = new Date();
  return `<div class="cal-year-grid">${Array.from({length:12}, (_, m) => renderMiniMonth(y, m, today)).join('')}</div>`;
}

function renderMiniMonth(y, m, today) {
  const firstWeekday = new Date(y, m, 1).getDay();
  const lastDay = new Date(y, m+1, 0).getDate();
  const isCur = today.getFullYear() === y && today.getMonth() === m;

  const holDays = {};
  monthHols(y, m).forEach(h => { holDays[h.date.getDate()] = true; });

  const byDay = {};
  state.cards.filter(c => !c.archived && c.dueDate).forEach(c => {
    const dt = new Date(c.dueDate + 'T00:00:00');
    if (dt.getFullYear() === y && dt.getMonth() === m) byDay[dt.getDate()] = (byDay[dt.getDate()] || 0) + 1;
  });

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let i = 1; i <= lastDay; i++) cells.push(i);

  return `
    <div class="cal-mini-month ${isCur?'cal-mini-current':''}">
      <div class="cal-mini-title">${MESES_FULL[m]}</div>
      <div class="cal-mini-grid">
        ${['D','S','T','Q','Q','S','S'].map(d => `<div class="cal-mini-day-h">${d}</div>`).join('')}
        ${cells.map(d => {
          if (!d) return `<div class="cal-mini-day"></div>`;
          const isToday = isCur && today.getDate() === d;
          const hasCards = byDay[d];
          const cls = [isToday?'today':'', holDays[d]?'holiday':'', hasCards?'has-cards':''].filter(Boolean).join(' ');
          return `<div class="cal-mini-day ${cls}" title="${hasCards?hasCards+' card'+(hasCards>1?'s':''):''}">${d}</div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderAgenda() {
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const today = new Date();

  const cards = state.cards.filter(c => !c.archived && c.dueDate)
    .filter(c => { const dt = new Date(c.dueDate); return dt.getFullYear() === y && dt.getMonth() === m; })
    .sort((a,b) => a.dueDate.localeCompare(b.dueDate));

  const holidays = monthHols(y, m);

  const byDay = {};
  cards.forEach(c => { (byDay[c.dueDate] = byDay[c.dueDate] || []).push(c); });
  holidays.forEach(h => {
    const key = `${h.date.getFullYear()}-${pad2(h.date.getMonth()+1)}-${pad2(h.date.getDate())}`;
    (byDay[key] = byDay[key] || []).unshift({ _hol: h });
  });

  const keys = Object.keys(byDay).sort();
  if (!keys.length) return `<div class="empty-state" style="padding:60px;"><h3>Sem itens neste mês</h3></div>`;

  return `
    <div class="cal-agenda">
      ${keys.map(key => {
        const dt = new Date(key + 'T00:00:00');
        const items = byDay[key];
        const isCurrentToday = dt.toDateString() === today.toDateString();
        return `
          <div class="cal-agenda-group ${isCurrentToday?'today':''}">
            <div class="cal-agenda-date">
              <div class="cal-agenda-day">${dt.getDate()}</div>
              <div class="cal-agenda-weekday">${DIAS_FULL[dt.getDay()]}</div>
              ${isCurrentToday ? '<span class="cal-agenda-today-pill">HOJE</span>' : ''}
            </div>
            <div class="cal-agenda-items">
              ${items.map(it => {
                if (it._hol) {
                  const h = it._hol; const meta = kindMeta(h.kind);
                  return `<div class="cal-agenda-item cal-agenda-holiday" style="border-left:3px solid ${meta.color}">
                    ${meta.icon} <strong>${escapeHTML(h.name)}</strong>
                    <span class="cal-hol-city">${h.city?escapeHTML(h.city):'todas as cidades'}</span>
                    <span style="color:var(--text-muted);margin-left:auto;font-size:11px;">${escapeHTML(meta.label)}</span>
                  </div>`;
                }
                const overdue = !isDoneColumn(it.columnId) && new Date(it.dueDate+'T23:59:59') < new Date();
                const done = isDoneColumn(it.columnId);
                return `
                  <div class="cal-agenda-item ${done?'done':overdue?'overdue':''}" data-card="${escapeHTML(it.id)}">
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(it.title)}</div>
                      <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${escapeHTML(it.assignee||'—')} · ${escapeHTML(prioLabel(it.priority))}</div>
                    </div>
                    <span class="role-badge" style="background:${done?'var(--success-soft)':overdue?'var(--danger-soft)':'var(--primary-soft)'};color:${done?'var(--success)':overdue?'var(--danger)':'var(--primary)'};">
                      ${done?'CONCLUÍDO':overdue?'ATRASADO':'PRÓXIMO'}
                    </span>
                  </div>`;
              }).join('')}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function showDayDetails(dt) {
  const dStr = `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
  const cards = state.cards.filter(c => !c.archived && c.dueDate === dStr);
  const hols = dayHols(dt);
  if (!cards.length && !hols.length) return;

  import('../ui/modal.js').then(({ openModal }) => {
    openModal({
      title: `<span class="modal-title-kicker">${DIAS_FULL[dt.getDay()]}</span><span style="color:var(--text);">${dt.getDate()} de ${MESES_FULL[dt.getMonth()]} ${dt.getFullYear()}</span>`,
      body: `
        ${hols.length ? `
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
            ${hols.map(h => {
              const meta = kindMeta(h.kind);
              return `<div class="banner" style="border-left:4px solid ${meta.color};background:var(--surface-2);display:flex;align-items:center;gap:8px;">
                <span>${meta.icon}</span>
                <strong>${escapeHTML(h.name)}</strong>
                <span class="cal-hol-city">${h.city?escapeHTML(h.city):'todas as cidades'}</span>
                <span style="margin-left:auto;font-size:11px;color:var(--text-muted);">${escapeHTML(meta.label)}</span>
              </div>`;
            }).join('')}
          </div>` : ''}
        ${cards.length ? `
          <h3 style="font-size:13px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">📋 Cards com entrega neste dia (${cards.length})</h3>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${cards.map(c => {
              const overdue = !isDoneColumn(c.columnId) && new Date(c.dueDate+'T23:59:59') < new Date();
              return `
                <div class="db-up-row" data-card-id="${escapeHTML(c.id)}">
                  <div style="flex:1;min-width:0;">
                    <div class="db-up-title">${escapeHTML(c.title)}</div>
                    <div class="db-up-sub">${escapeHTML(c.assignee||'—')} · ${escapeHTML(prioLabel(c.priority))}</div>
                  </div>
                  ${overdue ? '<span class="db-up-date overdue">ATRASADO</span>' : ''}
                </div>`;
            }).join('')}
          </div>` : (hols.length ? '' : '<p style="color:var(--text-muted);">Sem cards com entrega neste dia.</p>')}
      `,
      footer: '<button class="btn btn-secondary" data-close>Fechar</button>',
    });
    document.querySelectorAll('[data-card-id]').forEach(el => {
      el.onclick = () => import('../modals/card-modal.js').then(m => m.openCardModal(el.dataset.cardId));
    });
  });
}
