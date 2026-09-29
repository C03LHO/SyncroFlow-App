import { isDoneColumn } from '../core/state.js';
/* ═══ SyncroFlow — js/ui/card-preview.js
   Pré-visualização rica ao passar o mouse sobre qualquer card
   (quadro, calendário, listas). */
import { state, cardById } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { fmtDate, prioLabel, statusLabel } from '../core/format.js';
import { paletteHex } from '../core/cardhelpers.js';

let tip = null, showTimer = null, hideTimer = null, curId = null;

function ensureTip() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.className = 'card-preview';
  tip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  tip.addEventListener('mouseleave', () => scheduleHide());
  (document.querySelector('#modal-mount') || document.body).appendChild(tip);
  return tip;
}

function countSubs(list){ return Array.isArray(list)?list.reduce((s,x)=>s+1+countSubs(x.subtasks),0):0; }
function countSubsDone(list){ return Array.isArray(list)?list.reduce((s,x)=>s+(x.done?1:0)+countSubsDone(x.subtasks),0):0; }
function dueRel(iso, overdue) {
  if (!iso) return '';
  const t = new Date(); t.setHours(0,0,0,0);
  const d = new Date(iso + 'T00:00:00'); const days = Math.round((d - t)/86400000);
  if (overdue) return `${Math.abs(days)}d atrasado`;
  if (days === 0) return 'hoje'; if (days === 1) return 'amanhã';
  if (days > 1) return `em ${days}d`; return '';
}
function initials(n){ return (n||'').trim().split(/\s+/).map(p=>p[0]).slice(0,2).join('').toUpperCase()||'?'; }

function build(c) {
  const overdue = c.dueDate && !isDoneColumn(c.columnId) && new Date(c.dueDate+'T23:59:59') < new Date();
  const labelHex = paletteHex(c.color);
  const progress = Math.max(0, Math.min(100, Number(c.progress)||0));
  const col = (state.columns||[]).find(x => x.id === c.columnId);
  const subTotal = countSubs(c.subtasks), subDone = countSubsDone(c.subtasks);
  const comments = (c.comments||[]).length, links = (c.links||[]).length;
  const tags = c.tags || [];
  const g = c.gains || {}; const hm = Number(g.horasMes)||0, em = Number(g.economiaMes)||0;
  const visionOn = state.visionConfig?.enabled && c.vision;
  const blockedBy = (c.blockedBy||[]).filter(id => { const d = cardById(id); return d && !isDoneColumn(d.columnId); });

  return `
    ${labelHex ? `<div class="cp-strip" style="background:${escapeHTML(labelHex)}"></div>` : ''}
    <div class="cp-head">
      <div class="cp-title">${escapeHTML(c.title || '(sem título)')}</div>
      ${visionOn ? `<span class="cp-vision">${escapeHTML(c.vision)}</span>` : ''}
    </div>
    <div class="cp-badges">
      <span class="ct-pri ct-pri-${escapeHTML(c.priority)}">${escapeHTML(prioLabel(c.priority))}</span>
      <span class="ct-status ct-status-${escapeHTML(c.projectionStatus||'no-prazo')}">${escapeHTML(statusLabel(c.projectionStatus||'no-prazo'))}</span>
      ${col ? `<span class="cp-col">${escapeHTML(col.icon||'')} ${escapeHTML(col.name)}</span>` : ''}
      ${blockedBy.length ? `<span class="ct-blocked">🔒 ${blockedBy.length}</span>` : ''}
    </div>
    ${c.description ? `<div class="cp-desc">${escapeHTML(c.description.slice(0,180))}${c.description.length>180?'…':''}</div>` : ''}
    <div class="cp-rows">
      ${c.assignee ? `<div class="cp-row"><span class="cp-ico">👤</span><span class="cp-avatar">${escapeHTML(initials(c.assignee))}</span>${escapeHTML(c.assignee)}</div>` : ''}
      ${c.dueDate ? `<div class="cp-row ${overdue?'is-overdue':''}"><span class="cp-ico">📅</span>${escapeHTML(fmtDate(c.dueDate))}${dueRel(c.dueDate,overdue)?` · ${dueRel(c.dueDate,overdue)}`:''}</div>` : ''}
      ${(hm||em) ? `<div class="cp-row"><span class="cp-ico">💰</span>${hm?`${hm}h/mês`:''}${hm&&em?' · ':''}${em?`R$ ${em>=1000?(em/1000).toFixed(em%1000===0?0:1)+'K':em}/mês`:''}</div>` : ''}
    </div>
    ${tags.length ? `<div class="cp-tags">${tags.slice(0,5).map(t=>`<span class="ct-tag">#${escapeHTML(t)}</span>`).join('')}${tags.length>5?`<span class="ct-tag">+${tags.length-5}</span>`:''}</div>` : ''}
    ${progress>0 ? `<div class="cp-progress"><div class="cp-progress-track"><div class="cp-progress-fill" style="width:${progress}%;background:${isDoneColumn(c.columnId)?'var(--success)':overdue?'var(--danger)':'var(--primary)'}"></div></div><span>${progress}%</span></div>` : ''}
    <div class="cp-foot">
      ${subTotal ? `<span title="Subtarefas">☑ ${subDone}/${subTotal}</span>` : ''}
      ${comments ? `<span title="Comentários">💬 ${comments}</span>` : ''}
      ${links ? `<span title="Links">🔗 ${links}</span>` : ''}
      ${(c.requestedBy||[]).length ? `<span title="Solicitantes">🙋 ${(c.requestedBy||[]).length}</span>` : ''}
      ${(c.helpers||[]).length ? `<span title="Ajudantes">🤝 ${(c.helpers||[]).length}</span>` : ''}
    </div>`;
}

function position(el) {
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth || 320, h = tip.offsetHeight || 200;
  const gap = 10, m = 8;
  let left = r.right + gap, top = r.top;
  if (left + w > innerWidth - m) left = r.left - w - gap;   // sem espaço à direita → esquerda
  if (left < m) left = Math.max(m, (innerWidth - w) / 2);    // sem espaço → centraliza
  top = Math.max(m, Math.min(top, innerHeight - h - m));
  tip.style.left = Math.round(left) + 'px';
  tip.style.top = Math.round(top) + 'px';
}

function show(el, id) {
  const c = cardById(id); if (!c) return;
  ensureTip();
  tip.innerHTML = build(c);
  tip.style.visibility = 'hidden'; tip.classList.add('show');
  position(el);
  tip.style.visibility = 'visible';
}
function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(() => { tip && tip.classList.remove('show'); curId = null; }, 140); }

export function initCardPreview() {
  document.addEventListener('mouseover', (e) => {
    if (document.querySelector('.dragging')) return;       // não mostra durante drag
    const el = e.target.closest('[data-card-id], .cal-card-mini[data-card]');
    if (!el) return;
    const id = el.dataset.cardId || el.dataset.card;
    if (!id) return;
    clearTimeout(hideTimer); clearTimeout(showTimer);
    if (id === curId && tip?.classList.contains('show')) return;
    showTimer = setTimeout(() => { curId = id; show(el, id); }, 320);
  });
  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest('[data-card-id], .cal-card-mini[data-card]');
    if (!el) return;
    clearTimeout(showTimer);
    scheduleHide();
  });
  // some ao rolar/clicar
  window.addEventListener('scroll', () => { clearTimeout(showTimer); tip && tip.classList.remove('show'); curId = null; }, true);
  document.addEventListener('click', () => { tip && tip.classList.remove('show'); curId = null; });
}
