/* ═══ SyncroFlow — js/views/ferias.js → Controle de AUSÊNCIAS
   Ausências GLOBAIS por pessoa (Férias, Atestado, Licença, Folga…).
   Os TIPOS são config-driven: vêm do backend (data.types, de lib/absences.php),
   então filtro, legenda, cores e cartões se atualizam sozinhos ao adicionar um
   tipo novo. Só Férias consome saldo/limite de 3 períodos. */
import { state } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { api } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { attachDatePicker, setDatePickerValue } from '../ui/datepicker.js';

let data = null;
let year = new Date().getFullYear();
let mountEl = null;
let filterType = 'all';   // 'all' | id do tipo — persiste entre repaints
let search = '';

const MES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const fmtBR = (iso) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };

// Espelho de segurança do registro do backend (fallback se data.types não vier).
const DEFAULT_TYPES = [
  { id:'ferias',   label:'Férias',   color:'#2563eb', striped:false, icon:'🏖️', usesBalance:true },
  { id:'atestado', label:'Atestado', color:'#dc2626', striped:true,  icon:'🩺', usesBalance:false },
  { id:'licenca',  label:'Licença',  color:'#ea580c', striped:false, icon:'📄', usesBalance:false },
  { id:'folga',    label:'Folga',    color:'#16a34a', striped:false, icon:'☕', usesBalance:false },
];
const typeList = () => (data && Array.isArray(data.types) && data.types.length ? data.types : DEFAULT_TYPES);
const typeMeta = (id) => typeList().find(t => t.id === id) || typeList()[0];
const daysBetween = (si, ei) => Math.floor((new Date(ei) - new Date(si)) / 86400000) + 1;

export const ferias = {
  async render(mount) {
    mountEl = mount;
    const team = (state.teams || []).find(t => t.id === state.currentTeamId);
    if (!team || team.type === 'personal') {
      mount.innerHTML = `<div class="empty-state" style="padding:48px;">
        <h3>🗓️ Ausências da equipe</h3>
        <p>Selecione uma <strong>equipe</strong> no seletor do topo (o Quadro Pessoal não tem controle de ausências) para planejar e ver as ausências do time.</p></div>`;
      return;
    }
    mount.innerHTML = `<div class="boot-loader">Carregando ausências…</div>`;
    await load();
    paint();
  },
};

async function load() {
  try { data = await api.call('vacations.php', 'list', { team: state.currentTeamId, year }, 'GET'); }
  catch (e) { data = null; toast(e.message || 'Falha ao carregar ausências.', 'error'); }
}

function paint() {
  if (!mountEl) return;
  if (!data) { mountEl.innerHTML = `<div class="empty-state" style="padding:40px;"><h3>Não foi possível carregar as ausências</h3></div>`; return; }
  const me = data.me;
  const myBal = (data.balances || []).find(b => b.user_id === me);
  const canRequest = data.team_role && data.team_role !== 'visitante';
  const canManageTeam = data.team_role === 'gestor' || data.team_role === 'ti'
    || ['ti', 'suporte'].includes(state.currentUser?.role);
  const pendingMine = (data.vacations || []).filter(v => v.status === 'pending' && v.can_decide);
  const flagged = (data.vacations || []).filter(v => v.can_decide && v.overlap && !v.overlap_ack);
  const canEditAny = (data.balances || []).some(b => b.can_edit);

  mountEl.innerHTML = `
    <div class="vac-page">
      ${headerHTML(canRequest, canManageTeam)}
      ${filterBarHTML()}
      ${statsHTML()}
      ${myBal ? myBalanceHTML(myBal) : ''}
      ${pendingMine.length ? pendingHTML(pendingMine) : ''}
      ${flagged.length ? overlapsHTML(flagged) : ''}
      ${ganttHTML()}
      ${canEditAny ? balancesEditorHTML(data.balances) : ''}
      ${myAbsencesHTML(me)}
    </div>`;
  wire();
}

function headerHTML(canRequest, canManageTeam) {
  return `<div class="vac-header">
    <div class="vac-title-block">
      <h2 class="vac-title">🗓️ Ausências da equipe</h2>
      <div class="vac-year-nav">
        <button class="btn btn-sm btn-ghost" data-year="-1" title="Ano anterior">←</button>
        <span class="vac-year">${year}</span>
        <button class="btn btn-sm btn-ghost" data-year="1" title="Próximo ano">→</button>
      </div>
    </div>
    <div class="vac-header-acts">
      ${canManageTeam ? `<button class="btn btn-secondary" id="vac-add-for" title="Lançar uma ausência já aprovada de um membro (ex.: migrar da planilha)">➕ Lançar p/ alguém</button>` : ''}
      ${canRequest ? `<button class="btn btn-primary" id="vac-request">+ Nova ausência</button>` : ''}
    </div>
  </div>`;
}

/* Barra de filtro = também a LEGENDA (cada chip mostra a cor + nome do tipo).
   Atualiza sozinha quando um tipo novo é cadastrado no backend. */
function filterBarHTML() {
  const chips = [`<button class="abs-chip${filterType === 'all' ? ' active' : ''}" data-filter-type="all">Todas</button>`]
    .concat(typeList().map(t =>
      `<button class="abs-chip${filterType === t.id ? ' active' : ''}" data-filter-type="${escapeHTML(t.id)}" style="--tc:${escapeHTML(t.color)}" title="${escapeHTML(t.label)}">
        <span class="abs-chip-dot"></span>${escapeHTML(t.icon || '')} ${escapeHTML(t.label)}
      </button>`)).join('');
  return `<div class="abs-filterbar">
    <div class="abs-chips" role="tablist" aria-label="Filtrar por tipo de ausência">${chips}</div>
    <div class="abs-filter-tools">
      <div class="abs-search"><span aria-hidden="true">🔎</span><input type="search" id="abs-search" placeholder="Buscar pessoa…" value="${escapeHTML(search)}" aria-label="Buscar pessoa"></div>
      <button class="btn btn-sm btn-secondary" id="abs-today" title="Ir para o ano atual e destacar hoje">Hoje</button>
    </div>
  </div>`;
}

/* Painel "Por tipo de ausência" — cartões coloridos com a contagem do ano.
   Clicáveis: filtram a página pelo tipo. */
function statsHTML() {
  const vacs = (data.vacations || []).filter(v => v.status !== 'rejected');
  const counts = {};
  vacs.forEach(v => { const t = v.type || 'ferias'; counts[t] = (counts[t] || 0) + 1; });
  return `<div class="vac-section">
    <div class="vac-section-title">📈 Por tipo de ausência <span class="text-muted" style="font-weight:500;text-transform:none;letter-spacing:0;">— registros em ${year} · clique para filtrar</span></div>
    <div class="abs-stats">
      ${typeList().map(t => `
        <button class="abs-stat${filterType === t.id ? ' active' : ''}" data-filter-type="${escapeHTML(t.id)}" style="--tc:${escapeHTML(t.color)}">
          <span class="abs-stat-ico">${escapeHTML(t.icon || '')}</span>
          <span class="abs-stat-body">
            <span class="abs-stat-n">${counts[t.id] || 0}</span>
            <span class="abs-stat-lbl">${escapeHTML(t.label)}</span>
          </span>
        </button>`).join('')}
    </div>
  </div>`;
}

function myBalanceHTML(b) {
  const pct = b.total ? Math.min(100, Math.round(b.used / b.total * 100)) : 0;
  return `<div class="vac-mybal">
    <div class="vac-mybal-info">
      <span class="vac-mybal-label">🏖️ Seu saldo de férias (${year}) <span class="text-muted" style="font-weight:500;">· só Férias consome saldo</span></span>
      <span class="vac-mybal-nums"><strong>${b.remaining}</strong> de ${b.total} dias disponíveis · ${b.used} usados</span>
    </div>
    <div class="vac-mybal-bar"><div class="vac-mybal-fill" style="width:${pct}%"></div></div>
  </div>`;
}

function pendingHTML(pending) {
  return `<div class="vac-section">
    <div class="vac-section-title">⏳ Pedidos para você decidir (${pending.length})</div>
    ${pending.map(v => `
      <div class="vac-pend-row" data-vac="${escapeHTML(v.id)}">
        <span class="vac-pend-name">${escapeHTML(v.name)} ${typeBadge(v.type)}</span>
        <span class="vac-pend-period">${fmtBR(v.start_date)} → ${fmtBR(v.end_date)} <em>(${v.days} dias)</em>
          ${v.overlap ? `<span class="vac-overlap-note" title="Sobreposição (não impede aprovar)">🟠 também ausente: ${escapeHTML(v.overlap_with.join(', '))}</span>` : ''}
        </span>
        ${v.reason ? `<span class="vac-pend-reason" title="${escapeHTML(v.reason)}">“${escapeHTML(v.reason)}”</span>` : '<span></span>'}
        <span class="vac-pend-acts">
          <button class="btn btn-sm btn-primary" data-approve="${escapeHTML(v.id)}">Aprovar</button>
          <button class="btn btn-sm btn-danger" data-reject="${escapeHTML(v.id)}">Recusar</button>
        </span>
      </div>`).join('')}
  </div>`;
}

function overlapsHTML(flagged) {
  return `<div class="vac-section vac-overlaps">
    <div class="vac-section-title">🟠 Sobreposições de ausências (${flagged.length}) <span class="text-muted" style="font-weight:500;text-transform:none;letter-spacing:0;">— pode não ser problema; você decide</span></div>
    ${flagged.map(v => `
      <div class="vac-pend-row">
        <span class="vac-pend-name">${escapeHTML(v.name)} ${typeBadge(v.type)}</span>
        <span class="vac-pend-period">${fmtBR(v.start_date)} → ${fmtBR(v.end_date)} · também ausente: <strong>${escapeHTML(v.overlap_with.join(', '))}</strong></span>
        <span></span>
        <span class="vac-pend-acts"><button class="btn btn-sm btn-secondary" data-ack="${escapeHTML(v.id)}">Marcar como OK</button></span>
      </div>`).join('')}
  </div>`;
}

/* Pílula colorida do tipo (badge) — usada em listas. */
function typeBadge(typeId) {
  const t = typeMeta(typeId || 'ferias');
  return `<span class="abs-type-badge${t.striped ? ' striped' : ''}" style="--tc:${escapeHTML(t.color)}">${escapeHTML(t.icon || '')} ${escapeHTML(t.label)}</span>`;
}

function ganttHTML() {
  const q = search.trim().toLowerCase();
  const balances0 = data.balances || [];
  const balances = q ? balances0.filter(b => (b.name || '').toLowerCase().includes(q)) : balances0;
  const vacs = (data.vacations || []).filter(v => v.status !== 'rejected' && (filterType === 'all' || (v.type || 'ferias') === filterType));
  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd   = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
  const span = yearEnd - yearStart;
  const monthBands = MES.map((_, i) => `<span class="vac-monthband${i % 2 ? ' alt' : ''}" style="left:${(i / 12 * 100).toFixed(4)}%;width:${(100 / 12).toFixed(4)}%"></span>`).join('');
  const monthLines = MES.map((_, i) => i === 0 ? '' : `<span class="vac-gridline" style="left:${(i / 12 * 100).toFixed(4)}%"></span>`).join('');
  const now = new Date();
  const todayLeft = now.getFullYear() === year ? Math.min(100, Math.max(0, (now.getTime() - yearStart) / span * 100)) : null;
  const todayMark = todayLeft != null ? `<span class="vac-today" style="left:${todayLeft.toFixed(3)}%" title="Hoje"></span>` : '';

  const rows = balances.map(b => {
    const mine = vacs.filter(v => v.user_id === b.user_id);
    const usedYear = mine.reduce((sum, v) => sum + (v.days || 0), 0);
    const bars = mine.map(v => {
      const meta = typeMeta(v.type || 'ferias');
      const s = new Date(v.start_date + 'T00:00:00').getTime();
      const e = new Date(v.end_date + 'T23:59:59').getTime();
      const left  = Math.max(0, (s - yearStart) / span) * 100;
      const right = Math.min(100, (e - yearStart) / span * 100);
      const width = Math.max(0.8, right - left);
      const showOverlap = v.overlap && !v.overlap_ack;
      const manageable = !!v.can_manage;
      const cls = [
        v.status === 'pending' ? 'is-pending' : 'is-approved',
        meta.striped ? 'striped' : '',
        showOverlap ? 'is-overlap' : '',
        manageable ? 'is-clickable' : '',
      ].filter(Boolean).join(' ');
      const title = `${b.name} — ${meta.label}: ${fmtBR(v.start_date)}–${fmtBR(v.end_date)} (${v.days} dias) · ${v.status === 'pending' ? 'pendente' : 'aprovada'}`
        + (showOverlap ? ` · 🟠 também ausente: ${v.overlap_with.join(', ')}` : '')
        + (manageable ? ' · clique para gerenciar' : '');
      const label = width > 6 ? `<span class="vac-bar-lbl">${v.days}d</span>` : '';
      const mattr = manageable ? ` data-manage-vac="${escapeHTML(v.id)}"` : '';
      return `<div class="vac-bar ${cls}"${mattr} style="--bar-color:${escapeHTML(meta.color)};left:${left.toFixed(3)}%;width:${width.toFixed(3)}%" title="${escapeHTML(title)}">${label}</div>`;
    }).join('');
    return `<div class="vac-grow-row">
      <div class="vac-grow-name" title="${escapeHTML(b.name)}">
        <span class="vac-grow-nm">${escapeHTML(b.name)}</span>
        <span class="vac-grow-days${usedYear ? '' : ' zero'}" title="Dias ausente em ${year}">${usedYear}d</span>
      </div>
      <div class="vac-grow-track">${monthBands}${monthLines}${todayMark}${bars}</div>
    </div>`;
  }).join('');

  const anyManageable = (data.vacations || []).some(v => v.can_manage && v.status !== 'rejected');
  return `<div class="vac-section">
    <div class="vac-section-title">📊 Mapa de ausências ${year}
      <span class="vac-legend">
        <span class="vac-lg vac-lg-pendmark"></span>mais claro = pendente
        <span class="vac-lg vac-lg-over"></span>sobreposição
        ${todayLeft != null ? '<span class="vac-lg vac-lg-today"></span>hoje' : ''}
      </span>
    </div>
    ${anyManageable ? `<p class="vac-map-hint">💡 Gestor/TI: clique numa barra para <strong>editar</strong> ou <strong>cancelar</strong> a ausência de qualquer pessoa.</p>` : ''}
    <div class="vac-gantt">
      <div class="vac-grow-row vac-grow-head">
        <div class="vac-grow-name"></div>
        <div class="vac-grow-track vac-months">${MES.map(m => `<span class="vac-month">${m}</span>`).join('')}</div>
      </div>
      ${rows || `<div class="vac-empty">Nenhum registro ${filterType !== 'all' ? 'deste tipo ' : ''}${search ? 'para essa busca ' : ''}em ${year}.</div>`}
    </div>
  </div>`;
}

function balancesEditorHTML(balances) {
  return `<div class="vac-section">
    <div class="vac-section-title">🎚️ Saldo de férias por funcionário <span class="text-muted" style="font-weight:500;text-transform:none;letter-spacing:0;">— dias de FÉRIAS por ano (atestado/licença/folga não consomem)</span></div>
    <div class="vac-bal-list">
      ${balances.map(b => `
        <div class="vac-bal-row">
          <span class="vac-bal-name">${escapeHTML(b.name)} <span class="text-muted" style="font-size:11px;">${escapeHTML(b.role)}</span></span>
          <span class="vac-bal-used">${b.used} usados</span>
          <input class="input vac-bal-input" type="number" min="0" max="365" value="${b.total}" data-bal-for="${escapeHTML(b.user_id)}" ${b.can_edit ? '' : 'disabled title="Sem permissão para alterar"'}>
          ${b.can_edit ? `<button class="btn btn-sm btn-secondary" data-bal-save="${escapeHTML(b.user_id)}">Salvar</button>` : '<span></span>'}
        </div>`).join('')}
    </div>
  </div>`;
}

function myAbsencesHTML(me) {
  // "Minhas ausências" é sempre suas → aqui vale só o filtro de TIPO (a busca por
  // pessoa é do mapa; buscar um colega não deve esvaziar a sua própria lista).
  const byType = (v) => filterType === 'all' || (v.type || 'ferias') === filterType;
  const mineAll = (data.vacations || []).filter(v => v.user_id === me);
  const mine = mineAll.filter(byType);
  const total = mineAll.length;
  if (!total) return '';
  const badge = (s) => s === 'approved' ? '<span class="vac-badge appr">Aprovada</span>'
    : s === 'pending' ? '<span class="vac-badge pend">Pendente</span>'
    : '<span class="vac-badge rej">Recusada</span>';
  return `<div class="vac-section">
    <div class="vac-section-title">🧳 Minhas ausências (${year})${filterType !== 'all' ? ` <span class="text-muted" style="font-weight:500;text-transform:none;letter-spacing:0;">— ${mine.length} de ${total} (filtro: ${escapeHTML(typeMeta(filterType).label)})</span>` : ''}</div>
    ${mine.length ? mine.map(v => `
      <div class="vac-my-row">
        <span>${typeBadge(v.type)} ${fmtBR(v.start_date)} → ${fmtBR(v.end_date)} <em class="text-muted">(${v.days} dias)</em>${v.status === 'pending' && v.team_name ? ` <span class="text-muted" style="font-size:11px;">· aprovação: ${escapeHTML(v.team_name)}</span>` : ''}</span>
        ${badge(v.status)}
        ${(v.status === 'pending' || v.can_manage)
          ? `<span class="vac-my-acts">
               <button class="btn btn-sm btn-secondary" data-edit-vac="${escapeHTML(v.id)}" title="Editar esta ausência">Editar</button>
               <button class="btn btn-sm btn-ghost vac-cancel" data-cancel="${escapeHTML(v.id)}" title="${v.can_manage ? 'Cancelar esta ausência' : 'Cancelar o pedido (só dá enquanto está pendente)'}">Cancelar</button>
             </span>`
          : v.status === 'rejected'
            ? (v.reason ? `<span class="text-muted" style="font-size:12px;">${escapeHTML(v.reason)}</span>` : '<span></span>')
            : `<span class="text-muted" style="font-size:11px;">Para alterar, fale com o gestor</span>`}
      </div>`).join('') : `<div class="vac-empty">Nenhuma ausência sua para o filtro atual.</div>`}
  </div>`;
}

function wire() {
  mountEl.querySelectorAll('[data-year]').forEach(b => b.onclick = async () => {
    year += parseInt(b.dataset.year, 10); await load(); paint();
  });
  // Filtro por tipo (chips + cartões de estatística)
  mountEl.querySelectorAll('[data-filter-type]').forEach(b => b.onclick = () => {
    const t = b.dataset.filterType;
    filterType = (filterType === t && t !== 'all') ? 'all' : t;   // clicar de novo limpa
    paint();
  });
  // Busca (preserva foco/cursor)
  const searchEl = mountEl.querySelector('#abs-search');
  if (searchEl) searchEl.oninput = () => {
    const pos = searchEl.selectionStart; search = searchEl.value;
    paint();
    const s2 = mountEl.querySelector('#abs-search');
    if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch {} }
  };
  // "Hoje" — vai para o ano atual e rola o mapa até o marcador
  mountEl.querySelector('#abs-today')?.addEventListener('click', async () => {
    const cy = new Date().getFullYear();
    if (year !== cy) { year = cy; await load(); }
    paint();
    const mark = mountEl.querySelector('.vac-today');
    if (mark) { mark.scrollIntoView({ behavior: 'smooth', block: 'center' }); mark.classList.add('flash'); setTimeout(() => mark.classList.remove('flash'), 1200); }
  });
  mountEl.querySelector('#vac-request')?.addEventListener('click', openRequestModal);
  mountEl.querySelector('#vac-add-for')?.addEventListener('click', openAdminVacationModal);
  mountEl.querySelectorAll('[data-manage-vac]').forEach(b => b.onclick = () => {
    const v = (data.vacations || []).find(x => x.id === b.dataset.manageVac);
    if (v) openManageVacationModal(v);
  });
  mountEl.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => respond(b.dataset.approve, 'approve'));
  mountEl.querySelectorAll('[data-reject]').forEach(b => b.onclick = () => rejectFlow(b.dataset.reject));
  mountEl.querySelectorAll('[data-ack]').forEach(b => b.onclick = async () => {
    try { await api.call('vacations.php', 'acknowledge', { id: b.dataset.ack }); toast('Sobreposição marcada como OK.', 'success'); await load(); paint(); }
    catch (e) { toast(e.message, 'error'); }
  });
  mountEl.querySelectorAll('[data-bal-save]').forEach(b => b.onclick = async () => {
    const vid = b.dataset.balSave;
    const inp = mountEl.querySelector(`[data-bal-for="${CSS.escape(vid)}"]`);
    const days = parseInt(inp?.value, 10) || 0;
    try {
      await api.call('vacations.php', 'set_balance', { user_id: vid, days });
      toast('Saldo atualizado.', 'success'); await load(); paint();
    } catch (e) { toast(e.message, 'error'); }
  });
  mountEl.querySelectorAll('[data-edit-vac]').forEach(b => b.onclick = () => {
    const v = (data.vacations || []).find(x => x.id === b.dataset.editVac);
    if (v) openEditVacationModal(v);
  });
  mountEl.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
    const { confirmDialog } = await import('../ui/confirm.js');
    const ok = await confirmDialog({ title: 'Cancelar ausência', message: 'Remover este período de ausência? Esta ação não pode ser desfeita.', confirmText: 'Remover', cancelText: 'Voltar', danger: true });
    if (!ok) return;
    try { await api.call('vacations.php', 'cancel', { id: b.dataset.cancel }); toast('Ausência removida.', 'success'); await load(); paint(); }
    catch (e) { toast(e.message, 'error'); }
  });
}

async function respond(id, decision) {
  try {
    await api.call('vacations.php', 'respond', { id, decision, ack: 1 });
    toast(decision === 'approve' ? 'Ausência aprovada.' : 'Solicitação recusada.', decision === 'approve' ? 'success' : 'info');
    await load(); paint();
  } catch (e) { toast(e.message, 'error'); }
}

async function rejectFlow(id) {
  const { openModal, closeModal } = await import('../ui/modal.js');
  openModal({
    title: 'Recusar ausência',
    body: `<div class="field"><label>Motivo (opcional)</label><input class="input" id="vac-rej-reason" maxlength="160" placeholder="Ex.: conflito com uma entrega importante"></div>`,
    footer: `<button class="btn btn-secondary" data-close>Voltar</button><button class="btn btn-danger" id="vac-rej-ok">Recusar</button>`,
  });
  document.getElementById('vac-rej-ok').onclick = async () => {
    const reason = document.getElementById('vac-rej-reason').value.trim();
    closeModal(true);
    try { await api.call('vacations.php', 'respond', { id, decision: 'reject', reason }); toast('Solicitação recusada.', 'info'); await load(); paint(); }
    catch (e) { toast(e.message, 'error'); }
  };
}

/* Options do <select> de tipo (a partir do registro central). */
function typeOptions(selected = 'ferias') {
  return typeList().map(t => `<option value="${escapeHTML(t.id)}" ${t.id === selected ? 'selected' : ''}>${escapeHTML(t.icon || '')} ${escapeHTML(t.label)}</option>`).join('');
}

async function openRequestModal() {
  const { openModal, closeModal } = await import('../ui/modal.js');
  const myBal = (data.balances || []).find(b => b.user_id === data.me);
  const myActive = (data.vacations || []).filter(v => v.user_id === data.me && (v.type || 'ferias') === 'ferias' && (v.status === 'pending' || v.status === 'approved'));
  const usedDays = myActive.reduce((sum, v) => sum + (v.days || 0), 0);
  const balTotal = myBal ? myBal.total : 30;
  const remaining = Math.max(0, balTotal - usedDays);
  const eligible = (state.teams || []).filter(t => t.type !== 'personal' && t.my_role && t.my_role !== 'visitante');
  if (!eligible.length) { toast('Você precisa estar numa equipe (como membro) para solicitar uma ausência.', 'warn'); return; }
  openModal({
    title: `<span class="modal-title-kicker">Ausência</span><span style="color:var(--text);">Nova ausência</span>`,
    body: `
      <div class="field"><label>Tipo de ausência</label>
        <select class="select" id="vac-type">${typeOptions('ferias')}</select>
      </div>
      <p class="text-muted text-sm" id="vac-type-hint" style="margin:-2px 0 4px;"></p>
      <div class="field"><label>Quem aprova este pedido?</label>
        <select class="select" id="vac-approver">
          ${eligible.map(t => `<option value="${escapeHTML(t.id)}" ${t.id === state.currentTeamId ? 'selected' : ''}>${escapeHTML(t.icon || '👥')} ${escapeHTML(t.name)}</option>`).join('')}
        </select>
        <small class="field-hint">Os Gestores/TI dessa equipe vão aprovar. A ausência aparece em todas as suas equipes.</small>
      </div>
      <div class="vac-req-grid">
        <div class="field"><label>Início</label><input class="input" type="text" id="vac-start" placeholder="dd/mm/aaaa" autocomplete="off"></div>
        <div class="field"><label>Fim</label><input class="input" type="text" id="vac-end" placeholder="dd/mm/aaaa" autocomplete="off"></div>
      </div>
      <div class="field"><label>Observação (opcional)</label><input class="input" id="vac-reason" maxlength="160" placeholder="Ex.: viagem em família"></div>
      <p class="vac-req-calc" id="vac-calc"></p>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="vac-send">Solicitar</button>`,
  });
  const typeSel = document.getElementById('vac-type');
  const hint = document.getElementById('vac-type-hint');
  const s = document.getElementById('vac-start'), e = document.getElementById('vac-end'), calc = document.getElementById('vac-calc');
  attachDatePicker(s); attachDatePicker(e);
  const refreshHint = () => {
    const m = typeMeta(typeSel.value);
    hint.innerHTML = m.usesBalance
      ? `Saldo restante <strong>${remaining}</strong> de ${balTotal} dias · ${myActive.length}/3 períodos. Férias consome saldo.`
      : `<strong>${escapeHTML(m.label)}</strong> não consome saldo de férias nem o limite de períodos.`;
  };
  const upd = () => {
    const si = s.dataset.iso, ei = e.dataset.iso;
    const usesBal = typeMeta(typeSel.value).usesBalance;
    if (si && ei) {
      const days = daysBetween(si, ei);
      if (days <= 0) calc.textContent = '⚠ A data final é anterior à inicial.';
      else if (usesBal && days > remaining) calc.textContent = `${days} dia(s) — ⚠ ultrapassa seu saldo de férias (${remaining}).`;
      else calc.textContent = `${days} dia(s) corridos.`;
    } else calc.textContent = '';
  };
  typeSel.onchange = () => { refreshHint(); upd(); };
  s.onchange = upd; e.onchange = upd; refreshHint();
  document.getElementById('vac-send').onclick = async () => {
    const si = s.dataset.iso, ei = e.dataset.iso;
    if (!si || !ei) { toast('Escolha início e fim.', 'warn'); return; }
    try {
      await api.call('vacations.php', 'request', {
        type: typeSel.value,
        team_id: document.getElementById('vac-approver')?.value || state.currentTeamId,
        start_date: si, end_date: ei,
        reason: document.getElementById('vac-reason').value.trim(),
      });
      toast('Pedido de ausência enviado para aprovação.', 'success');
      closeModal(true); await load(); paint();
    } catch (err) { toast(err.message, 'error'); }
  };
}

/* Editar uma ausência existente (dono enquanto pendente, ou Gestor/TI a qualquer momento).
   Permite trocar o TIPO e as datas. */
async function openEditVacationModal(v) {
  const { openModal, closeModal } = await import('../ui/modal.js');
  const balTotal = (data.balances || []).find(b => b.user_id === v.user_id)?.total || 30;
  const otherDays = (data.vacations || [])
    .filter(x => x.user_id === v.user_id && x.id !== v.id && (x.type || 'ferias') === 'ferias' && (x.status === 'pending' || x.status === 'approved'))
    .reduce((sum, x) => sum + (x.days || 0), 0);
  const remaining = Math.max(0, balTotal - otherDays);
  openModal({
    title: `<span class="modal-title-kicker">Ausência</span><span style="color:var(--text);">Editar ausência</span>`,
    body: `
      <div class="field"><label>Tipo de ausência</label>
        <select class="select" id="vac-e-type">${typeOptions(v.type || 'ferias')}</select>
      </div>
      <div class="vac-req-grid">
        <div class="field"><label>Início</label><input class="input" type="text" id="vac-e-start" placeholder="dd/mm/aaaa" autocomplete="off"></div>
        <div class="field"><label>Fim</label><input class="input" type="text" id="vac-e-end" placeholder="dd/mm/aaaa" autocomplete="off"></div>
      </div>
      <div class="field"><label>Observação (opcional)</label><input class="input" id="vac-e-reason" maxlength="160" value="${escapeHTML(v.reason || '')}"></div>
      <p class="vac-req-calc" id="vac-e-calc"></p>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="vac-e-save">Salvar alterações</button>`,
  });
  const typeSel = document.getElementById('vac-e-type');
  const s = document.getElementById('vac-e-start'), e = document.getElementById('vac-e-end'), calc = document.getElementById('vac-e-calc');
  attachDatePicker(s); attachDatePicker(e);
  setDatePickerValue(s, v.start_date); setDatePickerValue(e, v.end_date);
  const upd = () => {
    const si = s.dataset.iso, ei = e.dataset.iso;
    const usesBal = typeMeta(typeSel.value).usesBalance;
    if (si && ei) {
      const days = daysBetween(si, ei);
      if (days <= 0) calc.textContent = '⚠ A data final é anterior à inicial.';
      else if (usesBal && days > remaining) calc.textContent = `${days} dia(s) — ⚠ ultrapassa o saldo de férias (${remaining}).`;
      else calc.textContent = `${days} dia(s) corridos.`;
    } else calc.textContent = '';
  };
  typeSel.onchange = upd; s.onchange = upd; e.onchange = upd; upd();
  document.getElementById('vac-e-save').onclick = async () => {
    const si = s.dataset.iso, ei = e.dataset.iso;
    if (!si || !ei) { toast('Escolha início e fim.', 'warn'); return; }
    try {
      await api.call('vacations.php', 'edit', {
        id: v.id, type: typeSel.value, start_date: si, end_date: ei,
        reason: document.getElementById('vac-e-reason').value.trim(),
      });
      toast('Ausência atualizada.', 'success');
      closeModal(true); await load(); paint();
    } catch (err) { toast(err.message, 'error'); }
  };
}

/* Gerenciar a ausência de qualquer pessoa a partir do mapa (Gestor/TI): editar ou cancelar. */
async function openManageVacationModal(v) {
  const { openModal, closeModal } = await import('../ui/modal.js');
  openModal({
    title: `<span class="modal-title-kicker">Ausência</span><span style="color:var(--text);">Gerenciar ausência</span>`,
    body: `
      <p style="margin-top:0;font-size:14px;"><strong>${escapeHTML(v.name)}</strong> ${typeBadge(v.type)}</p>
      <p class="text-muted text-sm" style="margin-top:-6px;">${fmtBR(v.start_date)} → ${fmtBR(v.end_date)} · ${v.days} dias · ${v.status === 'pending' ? '⏳ pendente' : '✅ aprovada'}</p>
      <p class="text-muted text-sm">Editar ajusta <strong>tipo e datas</strong>. Para lançar para <strong>outra pessoa</strong>, cancele aqui e use “➕ Lançar p/ alguém”.</p>`,
    footer: `<button class="btn btn-secondary" data-close>Fechar</button>
             <button class="btn btn-danger" id="vac-mg-cancel">🗑️ Cancelar</button>
             <button class="btn btn-primary" id="vac-mg-edit">✏️ Editar</button>`,
  });
  document.getElementById('vac-mg-edit').onclick = () => { closeModal(true); openEditVacationModal(v); };
  document.getElementById('vac-mg-cancel').onclick = async () => {
    const { confirmDialog } = await import('../ui/confirm.js');
    const ok = await confirmDialog({ title: 'Cancelar ausência', message: `Remover a ausência de ${v.name} (${fmtBR(v.start_date)}–${fmtBR(v.end_date)})? Esta ação não pode ser desfeita.`, confirmText: 'Remover', cancelText: 'Voltar', danger: true });
    if (!ok) return;
    try {
      await api.call('vacations.php', 'cancel', { id: v.id });
      toast('Ausência removida.', 'success');
      closeModal(true); await load(); paint();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* Gestor/TI LANÇA uma ausência já aprovada de um membro (migrar planilha, etc.). */
async function openAdminVacationModal() {
  const { openModal, closeModal } = await import('../ui/modal.js');
  const members = (data.balances || []);
  if (!members.length) { toast('Nenhum membro na equipe.', 'warn'); return; }
  openModal({
    title: `<span class="modal-title-kicker">Ausência</span><span style="color:var(--text);">Lançar ausência de alguém</span>`,
    body: `
      <p class="text-muted text-sm" style="margin-top:0;">Registra uma ausência <strong>já aprovada</strong> de um membro (ex.: trazendo da planilha). Férias respeita saldo e limite de 3 períodos.</p>
      <div class="vac-req-grid">
        <div class="field"><label>Pessoa</label>
          <select class="select" id="vac-af-person">
            ${members.map(b => `<option value="${escapeHTML(b.user_id)}" data-remaining="${b.remaining}" data-total="${b.total}">${escapeHTML(b.name)} — ${b.remaining}/${b.total} dias livres</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Tipo</label><select class="select" id="vac-af-type">${typeOptions('ferias')}</select></div>
      </div>
      <div class="vac-req-grid">
        <div class="field"><label>Início</label><input class="input" type="text" id="vac-af-start" placeholder="dd/mm/aaaa" autocomplete="off"></div>
        <div class="field"><label>Fim</label><input class="input" type="text" id="vac-af-end" placeholder="dd/mm/aaaa" autocomplete="off"></div>
      </div>
      <div class="field"><label>Observação (opcional)</label><input class="input" id="vac-af-reason" maxlength="160" placeholder="Ex.: 1ª parte / migrado da planilha"></div>
      <p class="vac-req-calc" id="vac-af-calc"></p>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="vac-af-save">Lançar (já aprovada)</button>`,
  });
  const sel = document.getElementById('vac-af-person');
  const typeSel = document.getElementById('vac-af-type');
  const s = document.getElementById('vac-af-start'), e = document.getElementById('vac-af-end'), calc = document.getElementById('vac-af-calc');
  attachDatePicker(s); attachDatePicker(e);
  const upd = () => {
    const si = s.dataset.iso, ei = e.dataset.iso;
    const opt = sel.selectedOptions[0];
    const rem = opt ? (parseInt(opt.dataset.remaining, 10) || 0) : 0;
    const usesBal = typeMeta(typeSel.value).usesBalance;
    if (si && ei) {
      const days = daysBetween(si, ei);
      if (days <= 0) calc.textContent = '⚠ A data final é anterior à inicial.';
      else if (usesBal && days > rem) calc.textContent = `${days} dia(s) — ⚠ ultrapassa o saldo de férias da pessoa (${rem}).`;
      else calc.textContent = `${days} dia(s) corridos.`;
    } else calc.textContent = '';
  };
  sel.onchange = upd; typeSel.onchange = upd; s.onchange = upd; e.onchange = upd;
  document.getElementById('vac-af-save').onclick = async () => {
    const si = s.dataset.iso, ei = e.dataset.iso;
    if (!si || !ei) { toast('Escolha início e fim.', 'warn'); return; }
    try {
      await api.call('vacations.php', 'create_for', {
        team_id: state.currentTeamId,
        user_id: sel.value, type: typeSel.value,
        start_date: si, end_date: ei,
        reason: document.getElementById('vac-af-reason').value.trim(),
      });
      toast('Ausência lançada e aprovada.', 'success');
      closeModal(true); await load(); paint();
    } catch (err) { toast(err.message, 'error'); }
  };
}
