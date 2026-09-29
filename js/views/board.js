/* ═══ SyncroFlow — js/views/board.js
   Quadro com filtros completos: período, responsável,
   prioridade, status, visão, incompletos, tag, chips removíveis. */
import { state, cardById } from '../core/state.js';
import { escapeHTML, $, $$ } from '../core/dom.js';
import { fmtDate, prioLabel } from '../core/format.js';
import { api } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { openCardModal } from '../modals/card-modal.js';
import { can } from '../core/rbac.js';
import { on } from '../core/events.js';
import { paletteHex } from '../core/cardhelpers.js';
import { attachDatePicker } from '../ui/datepicker.js';

const PERIOD_OPTIONS = [
  { value:'all',    label:'Todos' },
  { value:'7d',     label:'Últimos 7 dias' },
  { value:'30d',    label:'Últimos 30 dias' },
  { value:'90d',    label:'Últimos 90 dias' },
  { value:'thisMonth', label:'Este mês' },
];

let mountEl = null;

// ── Seleção múltipla / ações em massa ──
let selectMode = false;
const selected = new Set();

// ── Popover "Filtros" (filtros secundários agrupados) ──
let filtersOpen = false;

// ── Barra de filtros retrátil (lembra a escolha entre sessões) ──
let filterBarHidden = (() => { try { return localStorage.getItem('syncro_filterbar_hidden') === '1'; } catch { return false; } })();

let _listenersBound = false;
export const board = {
  async render(mount) {
    mountEl = mount;
    paint();
    // Registra os listeners UMA única vez (evita acúmulo e o bug de mountEl nulo).
    if (!_listenersBound) {
      _listenersBound = true;
      on('state:changed', repaintIfMounted);
    }
  }
};

function repaintIfMounted() {
  if (state.view === 'board' && mountEl && mountEl.isConnected) paint();
}

function _isPersonalActive() {
  const t = (state.teams || []).find(x => x.id === state.currentTeamId);
  return t?.type === 'personal';
}

function paint() {
  if (!mountEl) return;
  // 🌐 visão "todas as minhas equipes" — SÓ no Meu Quadro (equipe pessoal)
  if (getAllTeams() && _isPersonalActive()) { paintCrossTeam(); return; }
  const role  = state.currentUser?.role;
  // Criar respeita o papel NA EQUIPE ativa (espelha o backend): TI/Suporte
  // (bypass) ou quem é gestor/analista na equipe. TI-da-equipe e visitante não criam.
  const myTeam = (state.teams || []).find(t => t.id === state.currentTeamId);
  const isSysAdmin = role === 'ti' || role === 'suporte';
  const canCreate = can(role, 'create') && (isSysAdmin || !myTeam || ['gestor','analista'].includes(myTeam.my_role));
  const cards = state.cards.filter(c => !c.archived).filter(matchesFilters);
  const byCol = {};
  for (const c of cards) (byCol[c.columnId] = byCol[c.columnId] || []).push(c);

  const swim = getSwim();
  const sortedCols = state.columns.slice().sort((a,b)=>a.position-b.position);
  const boardBody = (swim !== 'none')
    ? renderSwimlanes(cards, swim, sortedCols)
    : `<div class="board-grid" id="board-grid">
        ${sortedCols.map(col => renderColumn(col, byCol[col.id] || [])).join('')}
      </div>`;

  const html = `
    ${renderNoticesBar(role)}
    ${renderKpiStrip(cards)}
    ${filterBarHidden ? collapsedFilterBarHTML() : renderFilterBar()}
    ${boardBody}
    ${canCreate ? `<button class="btn btn-primary fab-new-card" id="btn-new-card" title="Criar card (atalho: N)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg> Novo card</button>` : ''}
    ${_canBulk() ? bulkBarHTML() : ''}
  `;
  mountEl.innerHTML = html;
  mountEl.classList.toggle('board--select', selectMode);

  mountEl.querySelectorAll('.card-tile').forEach(el => {
    el.onclick = (e) => {
      if (selectMode) { e.preventDefault(); e.stopPropagation(); toggleSelect(el.dataset.cardId, el); return; }
      openCardModal(el.dataset.cardId);
    };
  });
  wireBulkBar();
  maybeScareTobi();  // 🦫 Tobi se assusta se houver card atrasado (com moderação)
  // Recolher/expandir colunas
  mountEl.querySelectorAll('[data-collapse]').forEach(b => {
    b.onclick = (e) => { e.stopPropagation(); toggleCollapse(b.dataset.collapse); };
  });
  // Clicar em qualquer parte do cabeçalho de uma coluna recolhida expande-a
  mountEl.querySelectorAll('.column.is-collapsed .column-header').forEach(h => {
    h.onclick = () => toggleCollapse(h.closest('.column').dataset.colId);
  });
  setupDnd();
  wireFilters();
  wireNoticesBar();
  // Swimlanes (raias): seletor + recolher/expandir cada raia
  mountEl.querySelector('#f-swimlane')?.addEventListener('change', e => setSwim(e.target.value));
  mountEl.querySelectorAll('[data-swim-toggle]').forEach(h => {
    h.onclick = () => toggleSwimLane(h.dataset.swimToggle);
  });
  mountEl.querySelector('#btn-new-card')?.addEventListener('click', () => openCardModal(null));
}

/* ── Mural de avisos (global + equipe ativa) ── */
function renderNoticesBar(role) {
  const dismissed = JSON.parse(localStorage.getItem('syncro_dismissed_notices') || '[]');
  const activeTeam = state.currentTeamId;
  const myTeam = (state.teams || []).find(t => t.id === activeTeam);
  const isSysAdmin = role === 'ti' || role === 'suporte';
  // Espelha o backend (_can_post_notice): TI/Suporte (bypass→gestor) e gestor da equipe ativa.
  const canPost = isSysAdmin || myTeam?.my_role === 'gestor';
  // Editar/excluir: SÓ quem publicou o aviso (author_id) — o TI-Dev mantém override de admin.
  const myId = state.currentUser?.user_id;
  const canEditNotice = (n) => (role === 'ti') || (!!myId && (n.authorId ?? n.author_id) === myId);
  // Um aviso agendado/fora de janela (active=0) só aparece para quem pode editá-lo,
  // marcado como "agendado" — assim ele nunca surge cedo para os demais, mas o autor
  // consegue vê-lo para editar/cancelar (era um buraco: não dava para gerenciá-lo).
  const noticeActive = (n) => (n.active ?? n._active ?? 1) != 0;
  const list = (state.notices || [])
    .filter(n => !n.teamId || n.teamId === activeTeam)   // global + equipe ativa
    .filter(n => !dismissed.includes(n.id))
    .filter(n => noticeActive(n) || canEditNotice(n));
  const canCols = isSysAdmin || ['gestor','ti'].includes(myTeam?.my_role);
  // Gerenciar equipe: gestor/TI da equipe (ou TI do sistema), exceto quadro pessoal
  const canManageTeam = myTeam && myTeam.type !== 'personal' && (isSysAdmin || ['gestor','ti'].includes(myTeam?.my_role));
  if (!list.length && !canPost && !canCols && !canManageTeam) return '';
  const items = list.map(n => `
    <div class="notice-banner notice-${escapeHTML(n.type||'info')}${noticeActive(n) ? '' : ' notice-scheduled'}" data-notice="${escapeHTML(n.id)}">
      <span class="notice-scope">${n.teamId ? escapeHTML(n.teamName||'Equipe') : '🌐 Global'}</span>
      ${noticeActive(n) ? '' : '<span class="notice-sched-tag" title="Agendado — ainda não está visível para os outros">⏰ agendado</span>'}
      <span class="notice-text">${escapeHTML(n.text)}</span>
      <span class="notice-author">— ${escapeHTML(n.author)}${n.editedAt ? ' <span class="notice-edited">(editado)</span>' : ''}</span>
      ${canEditNotice(n) ? `<button class="notice-edit" data-edit-notice="${escapeHTML(n.id)}" title="Editar aviso">✏️</button>` : ''}
      ${canEditNotice(n) ? `<button class="notice-del" data-del-notice="${escapeHTML(n.id)}" title="Excluir aviso">🗑️</button>` : ''}
      <button class="notice-dismiss" data-dismiss="${escapeHTML(n.id)}" title="Dispensar (só para você)">✕</button>
    </div>`).join('');
  // Progressive disclosure: as ações de gestão vão para um único menu "Gerenciar",
  // deixando o Quadro com um só destaque primário (o FAB "Novo card").
  const pending = (myTeam?.pending_requests > 0) ? myTeam.pending_requests : 0;
  const menuItems = [
    canPost       ? `<button class="bmp-item" id="btn-post-notice">📢 Publicar aviso</button>` : '',
    canCols       ? `<button class="bmp-item" id="btn-manage-cols">🗂️ Gerenciar colunas</button>` : '',
    canManageTeam ? `<button class="bmp-item" id="btn-sprints">🏃 Sprints</button>` : '',
    canManageTeam ? `<button class="bmp-item" id="btn-manage-team">⚙️ Gerenciar equipe${pending ? ` <span class="req-badge">${pending}</span>` : ''}</button>` : '',
  ].filter(Boolean).join('');
  const tools = menuItems ? `
    <div class="board-toolbar">
      <div class="board-manage-wrap">
        <button class="btn btn-ghost btn-sm" id="btn-manage-menu" aria-haspopup="true" aria-expanded="false" title="Gerenciar o quadro">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
          Gerenciar${pending ? ` <span class="req-badge" title="${pending} pedido(s) de entrada pendente(s)">${pending}</span>` : ''}
        </button>
        <div class="board-manage-pop" id="board-manage-pop" hidden>${menuItems}</div>
      </div>
    </div>` : '';
  return `<div class="notices-wrap">${items}${tools}</div>`;
}

function wireNoticesBar() {
  mountEl.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => {
    const dismissed = JSON.parse(localStorage.getItem('syncro_dismissed_notices') || '[]');
    dismissed.push(b.dataset.dismiss);
    localStorage.setItem('syncro_dismissed_notices', JSON.stringify(dismissed));
    b.closest('[data-notice]').remove();
  });
  // Menu "Gerenciar" (abre/fecha; fecha ao escolher um item ou clicar fora)
  const mgWrap = mountEl.querySelector('.board-manage-wrap');
  const mgBtn  = mountEl.querySelector('#btn-manage-menu');
  const mgPop  = mountEl.querySelector('#board-manage-pop');
  if (mgBtn && mgPop) {
    mgBtn.onclick = (e) => { e.stopPropagation(); const open = mgPop.hidden; mgPop.hidden = !open; mgBtn.setAttribute('aria-expanded', String(open)); };
    mgPop.querySelectorAll('.bmp-item').forEach(it => it.addEventListener('click', () => { mgPop.hidden = true; mgBtn.setAttribute('aria-expanded', 'false'); }));
    if (mountEl._mgDocHandler) document.removeEventListener('click', mountEl._mgDocHandler);
    mountEl._mgDocHandler = (e) => { if (mgWrap && !mgWrap.contains(e.target)) { mgPop.hidden = true; mgBtn.setAttribute('aria-expanded', 'false'); } };
    document.addEventListener('click', mountEl._mgDocHandler);
  }
  mountEl.querySelector('#btn-post-notice')?.addEventListener('click', openPostNotice);
  mountEl.querySelectorAll('[data-edit-notice]').forEach(b => b.onclick = () => openEditNotice(b.dataset.editNotice));
  mountEl.querySelectorAll('[data-del-notice]').forEach(b => b.onclick = async () => {
    const id = b.dataset.delNotice;
    const { confirmDialog } = await import('../ui/confirm.js');
    const ok = await confirmDialog({ title: 'Excluir aviso', message: 'Excluir este aviso para todos? Esta ação não pode ser desfeita.', confirmText: 'Excluir', cancelText: 'Cancelar', danger: true });
    if (!ok) return;
    try {
      await api.call('notices.php', 'delete', { id });
      state.notices = (state.notices || []).filter(x => x.id !== id);
      toast('Aviso excluído.', 'success');
      paint();
    } catch (e) { toast(e.message, 'error'); }
  });
  mountEl.querySelector('#btn-manage-cols')?.addEventListener('click', async () => {
    const { openColumnManager } = await import('../ui/column-manager.js');
    openColumnManager({ teamId: state.currentTeamId, cols: state.columns, onChange: () => { if (state.view === 'board') paint(); } });
  });
  mountEl.querySelector('#btn-manage-team')?.addEventListener('click', async () => {
    const { openManageModal } = await import('./equipes.js');
    openManageModal(state.currentTeamId, mountEl);
  });
  mountEl.querySelector('#btn-sprints')?.addEventListener('click', async () => {
    const { openSprintManager } = await import('../ui/sprint-manager.js');
    openSprintManager({ teamId: state.currentTeamId, onChange: () => { if (state.view === 'board') paint(); } });
  });
}

// Selects de hora e minuto (passo de 5 min), 100% no tema do site — sem picker nativo.
function _timeSelectsHTML(prefix, defH = 0, defM = 0) {
  const pad = n => String(n).padStart(2, '0');
  const hours = Array.from({ length: 24 }, (_, h) => `<option value="${pad(h)}" ${h === defH ? 'selected' : ''}>${pad(h)}</option>`).join('');
  const mins  = Array.from({ length: 12 }, (_, i) => { const m = i * 5; return `<option value="${pad(m)}" ${m === defM ? 'selected' : ''}>${pad(m)}</option>`; }).join('');
  return `<div class="nt-time"><select class="select" id="${prefix}-h" aria-label="Hora">${hours}</select><span class="nt-time-sep">:</span><select class="select" id="${prefix}-m" aria-label="Minuto">${mins}</select></div>`;
}
// Combina data (ISO YYYY-MM-DD) + hora/min LOCAIS → ISO UTC correto. Vazio = null.
function _combineDT(iso, hh, mm) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, Number(hh) || 0, Number(mm) || 0, 0, 0).toISOString();
}

async function openPostNotice() {
  const { openModal, closeModal } = await import('../ui/modal.js');
  let teams = [];
  try { teams = (await api.call('notices.php','postable_teams',{},'GET')).teams || []; } catch {}
  openModal({
    guard: () => !!(document.getElementById('nt-text')?.value.trim()),   // barreira se escreveu algo
    title: `<span class="modal-title-kicker">Mural</span><span style="color:var(--text);">Publicar aviso</span>`,
    body: `
      <div class="field"><label>Destino</label>
        <select class="select" id="nt-team">${teams.map(t=>`<option value="${escapeHTML(t.id)}">${escapeHTML(t.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Tipo</label>
        <select class="select" id="nt-type">
          <option value="info">ℹ️ Informativo</option>
          <option value="warn">⚠️ Importante</option>
          <option value="error">🚨 Urgente</option>
        </select>
      </div>
      <div class="field"><label>Mensagem</label><textarea id="nt-text" rows="3" placeholder="Texto do aviso…"></textarea></div>
      <div class="nt-sched-grid">
        <div class="field"><label>Início (agendar)</label>
          <div class="nt-dt"><input class="input" id="nt-start" type="text" placeholder="dd/mm/aaaa" autocomplete="off">${_timeSelectsHTML('nt-start', 0, 0)}</div>
          <small class="field-hint">Vazio = publica já · o horário vale se houver data</small>
        </div>
        <div class="field"><label>Término</label>
          <div class="nt-dt"><input class="input" id="nt-exp" type="text" placeholder="dd/mm/aaaa" autocomplete="off">${_timeSelectsHTML('nt-exp', 23, 55)}</div>
          <small class="field-hint">Vazio = fica até o limite máximo da equipe (padrão 48h)</small>
        </div>
      </div>
      <div class="nt-sched-grid">
        <div class="field"><label>Recorrência</label>
          <select class="select" id="nt-rec">
            <option value="none">Não repetir</option>
            <option value="daily">Diariamente</option>
            <option value="weekly">Semanalmente</option>
            <option value="monthly">Mensalmente</option>
          </select>
        </div>
        <div class="field" id="nt-recuntil-wrap" style="display:none"><label>Repetir até</label><input class="input" id="nt-recuntil" type="text" placeholder="dd/mm/aaaa" autocomplete="off"></div>
      </div>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="nt-save">📢 Publicar</button>`,
  });
  const recSel = document.getElementById('nt-rec');
  recSel.onchange = () => { document.getElementById('nt-recuntil-wrap').style.display = recSel.value === 'none' ? 'none' : ''; };
  // Calendário customizado (segue o tema) — agendamento por DIA.
  attachDatePicker(document.getElementById('nt-start'));
  attachDatePicker(document.getElementById('nt-exp'));
  attachDatePicker(document.getElementById('nt-recuntil'));
  document.getElementById('nt-save').onclick = async () => {
    const text = document.getElementById('nt-text').value.trim();
    if (!text) { toast('Escreva a mensagem.', 'warn'); return; }
    const startV = document.getElementById('nt-start').dataset.iso || '';
    const expV   = document.getElementById('nt-exp').dataset.iso || '';
    const rec    = recSel.value;
    const recUntilV = document.getElementById('nt-recuntil').dataset.iso || '';
    try {
      await api.call('notices.php','create',{
        teamId: document.getElementById('nt-team').value,
        type: document.getElementById('nt-type').value,
        text,
        startsAt: _combineDT(startV, document.getElementById('nt-start-h').value, document.getElementById('nt-start-m').value),
        expiresAt: _combineDT(expV, document.getElementById('nt-exp-h').value, document.getElementById('nt-exp-m').value),
        recurrence: rec,
        recurUntil: _combineDT(recUntilV, 23, 59),
      });
      // recarrega notices no estado (manage:1 → traz também os agendados, p/ o autor gerenciar)
      const d = await api.call('notices.php','list',{ manage: '1' },'GET');
      state.notices = d.notices.map(n => ({
        ...n, teamId: n.team_id, teamName: n.team_name, createdAt: n.created_at,
        authorId: n.author_id, editedAt: n.edited_at, editedBy: n.edited_by,
        startsAt: n.starts_at, expiresAt: n.expires_at, recurUntil: n.recur_until, active: n._active,
      }));
      toast('Aviso publicado.', 'success');
      closeModal(true);
      paint();
    } catch (e) { toast(e.message, 'error'); }
  };
}

/* Editar um aviso já publicado (mesma permissão de publicar). */
async function openEditNotice(id) {
  const n = (state.notices || []).find(x => x.id === id);
  if (!n) { toast('Aviso não encontrado.', 'warn'); return; }
  const { openModal, closeModal } = await import('../ui/modal.js');
  openModal({
    guard: () => (document.getElementById('nt-text')?.value.trim() || '') !== (n.text || ''),
    title: `<span class="modal-title-kicker">Mural</span><span style="color:var(--text);">Editar aviso</span>`,
    body: `
      <div class="field"><label>Tipo</label>
        <select class="select" id="nt-type">
          <option value="info"  ${n.type === 'info'  ? 'selected' : ''}>ℹ️ Informativo</option>
          <option value="warn"  ${n.type === 'warn'  ? 'selected' : ''}>⚠️ Importante</option>
          <option value="error" ${n.type === 'error' ? 'selected' : ''}>🚨 Urgente</option>
        </select>
      </div>
      <div class="field"><label>Mensagem</label><textarea id="nt-text" rows="3">${escapeHTML(n.text)}</textarea></div>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="nt-save">Salvar</button>`,
  });
  document.getElementById('nt-save').onclick = async () => {
    const text = document.getElementById('nt-text').value.trim();
    const type = document.getElementById('nt-type').value;
    if (!text) { toast('Escreva a mensagem.', 'warn'); return; }
    try {
      await api.call('notices.php', 'update', { id, type, text });
      n.text = text; n.type = type; n.editedAt = new Date().toISOString();   // atualiza local
      toast('Aviso atualizado.', 'success');
      closeModal(true); paint();
    } catch (e) { toast(e.message, 'error'); }
  };
}

function _kpiExpanded() { try { return localStorage.getItem('syncro_kpi_expanded') === '1'; } catch { return false; } }

function renderKpiStrip(filteredCards) {
  const total = filteredCards.length;
  const ativos = filteredCards.filter(c => !_isDoneColumn(c.columnId)).length;
  const concluidos = filteredCards.filter(c => _isDoneColumn(c.columnId)).length;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const fimHoje = new Date(); fimHoje.setHours(23,59,59,999);
  const atrasados = filteredCards.filter(c => {
    if (!c.dueDate || _isDoneColumn(c.columnId)) return false;
    return new Date(c.dueDate + 'T23:59:59') < new Date();
  }).length;
  const venceHoje = filteredCards.filter(c => {
    if (!c.dueDate || _isDoneColumn(c.columnId)) return false;
    const d = new Date(c.dueDate + 'T12:00:00');
    return d >= hoje && d <= fimHoje;
  }).length;
  const urgentes = filteredCards.filter(c => c.priority === 'urgente' && !_isDoneColumn(c.columnId)).length;
  // Bloqueados: cards ativos com dependências ainda não concluídas
  const bloqueados = filteredCards.filter(c => {
    if (_isDoneColumn(c.columnId)) return false;
    return (c.blockedBy || []).some(id => { const d = cardById(id); return d && !_isDoneColumn(d.columnId); });
  }).length;
  const taxa = total ? Math.round((concluidos / total) * 100) : 0;

  // ── Carga cognitiva reduzida: 3 indicadores ESSENCIAIS sempre visíveis
  //    (quanto trabalho há · o que está atrasado · quanto já foi concluído).
  //    Os demais ficam atrás de "+ mais" (progressive disclosure). ──
  const sec = [
    { label: 'Concluídos', value: concluidos, cls: 'success' },
    { label: 'Vence hoje', value: venceHoje,  cls: venceHoje ? 'warning' : '' },
    { label: 'Bloqueados', value: bloqueados, cls: bloqueados ? 'danger' : '' },
    { label: 'Urgentes',   value: urgentes,   cls: urgentes ? 'warning' : '' },
  ];
  const expanded = _kpiExpanded();
  return `
    <div class="kpi-strip">
      <div class="kpi" title="Cards em andamento (não concluídos)">
        <div class="kpi-label">Ativos</div>
        <div class="kpi-value">${ativos}</div>
        <div class="kpi-sub">de ${total}</div>
      </div>
      <div class="kpi ${atrasados ? 'danger' : ''}" title="Cards vencidos e ainda não concluídos">
        <div class="kpi-label">Atrasados</div>
        <div class="kpi-value">${atrasados}</div>
      </div>
      <div class="kpi" title="Percentual de cards concluídos no filtro atual">
        <div class="kpi-label">Conclusão</div>
        <div class="kpi-value">${taxa}<span style="font-size:.6em;">%</span></div>
        <div class="kpi-bar"><div class="kpi-bar-fill" style="width:${taxa}%;"></div></div>
      </div>
      ${expanded ? sec.map(k => `<div class="kpi ${k.cls}"><div class="kpi-label">${escapeHTML(k.label)}</div><div class="kpi-value">${k.value}</div></div>`).join('') : ''}
    </div>
    <div class="kpi-more-row">
      <button class="kpi-more" id="kpi-more" aria-expanded="${expanded}" title="${expanded ? 'Mostrar menos indicadores' : 'Mostrar mais indicadores'}">${expanded ? '− menos indicadores' : '+ mais indicadores'}</button>
    </div>`;
}

/* Barra de filtros recolhida → só um botão para mostrar de novo (com selo de ativos). */
function collapsedFilterBarHTML() {
  const f = state.filters || {};
  const active = Object.keys(f).filter(k => f[k]).length + (getSwim() !== 'none' ? 1 : 0);
  return `<div class="filter-bar-collapsed">
    <button class="btn btn-sm btn-secondary" id="f-bar-show" title="Mostrar a barra de filtros">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
      Mostrar filtros${active ? ` <span class="req-badge">${active}</span>` : ''}
    </button>
  </div>`;
}

function renderFilterBar() {
  const f = state.filters || {};
  const tags = Array.from(new Set(state.cards.flatMap(c => c.tags||[]))).sort();
  const assignees = Array.from(new Set(state.cards.map(c => c.assignee).filter(Boolean))).sort();
  const currentPeriod = f.period || 'all';

  // Chips ativos
  const activeFilters = [
    f.search    && { k:'search',     l:`Busca: "${f.search}"` },
    f.assignee  && { k:'assignee',   l:`Resp: ${f.assignee}` },
    f.priority  && { k:'priority',   l:`Prioridade: ${prioLabel(f.priority)}` },
    f.status    && { k:'status',     l:`Status: ${f.status}` },
    f.tag       && { k:'tag',        l:`#${f.tag}` },
    f.sprint    && { k:'sprint',     l:`🏃 ${(state.sprints||[]).find(s=>s.id===f.sprint)?.name || 'Sprint'}` },
    f.incomplete&& { k:'incomplete', l:'⚠ Incompletos' },
  ].filter(Boolean);

  // Quantos filtros SECUNDÁRIOS (dentro do popover) estão ativos → selo no botão
  const cfActive = Object.keys(f).filter(k => k.indexOf('cf_') === 0 && f[k]).length;
  const secCount = [
    (f.period && f.period !== 'all'),
    (getSwim() !== 'none'),
    f.status, f.incomplete, f.tag,
  ].filter(Boolean).length + cfActive;
  const cfHTML = customFilterSelectsHTML(f);

  return `
    <div class="filter-bar">
      <!-- Filtros primários (sempre visíveis) -->
      <select id="f-assignee" title="Responsável">
        <option value="">Todos responsáveis</option>
        ${assignees.map(a => `<option value="${escapeHTML(a)}" ${a===f.assignee?'selected':''}>${escapeHTML(a)}</option>`).join('')}
      </select>
      <select id="f-priority" title="Prioridade">
        <option value="">Todas prioridades</option>
        ${[['urgente','Urgente'],['alta','Alta'],['media','Média'],['baixa','Baixa']].map(([p,l]) => `<option value="${p}" ${p===f.priority?'selected':''}>${l}</option>`).join('')}
      </select>
      ${(state.sprints||[]).length ? `<select id="f-sprint" title="Filtrar pelos cards de um sprint">
        <option value="">Todos os sprints</option>
        ${(state.sprints||[]).map(s => `<option value="${escapeHTML(s.id)}" ${s.id===f.sprint?'selected':''}>🏃 ${escapeHTML(s.name)}</option>`).join('')}
      </select>` : ''}

      <!-- Filtros secundários agrupados num popover -->
      <div class="filter-more-wrap">
        <button class="btn btn-sm btn-secondary" id="f-more-btn" aria-expanded="${filtersOpen}" title="Mais filtros e agrupamento">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
          Filtros${secCount ? ` <span class="req-badge">${secCount}</span>` : ''}
        </button>
        <div class="filter-more-pop" id="f-more-pop" ${filtersOpen ? '' : 'hidden'}>
          <div class="fmp-row"><label for="f-period">🕒 Período</label>
            <select id="f-period">${PERIOD_OPTIONS.map(o => `<option value="${o.value}" ${o.value===currentPeriod?'selected':''}>${escapeHTML(o.label)}</option>`).join('')}</select>
          </div>
          <div class="fmp-row"><label for="f-swimlane">🏊 Raias (agrupar)</label>
            <select id="f-swimlane">${[['none','Desativado'],['assignee','Por responsável'],['priority','Por prioridade'],['requestedBy','Por solicitante']]
              .map(([v,l]) => `<option value="${v}" ${v===getSwim()?'selected':''}>${l}</option>`).join('')}</select>
          </div>
          <div class="fmp-row"><label for="f-status">📊 Status</label>
            <select id="f-status">
              <option value="">Todos status</option>
              ${[['no-prazo','No prazo'],['em-risco','Em risco'],['atrasado','Atrasado']].map(([v,l]) => `<option value="${v}" ${v===f.status?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="fmp-row"><label for="f-incomplete">⚠ Completude</label>
            <select id="f-incomplete">
              <option value="">Todos os cards</option>
              <option value="1" ${f.incomplete?'selected':''}>Só incompletos</option>
            </select>
          </div>
          ${tags.length ? `<div class="fmp-row"><label for="f-tag">🏷️ Tag</label>
            <select id="f-tag">
              <option value="">Todas tags</option>
              ${tags.map(t => `<option value="${escapeHTML(t)}" ${t===f.tag?'selected':''}>#${escapeHTML(t)}</option>`).join('')}
            </select></div>` : ''}
          ${cfHTML ? `<div class="fmp-custom">${cfHTML}</div>` : ''}
        </div>
      </div>

      ${_isPersonalActive() ? `
      <label class="board-allteams-toggle" title="Ver e mover os SEUS cards de todas as suas equipes num quadro só">
        <input type="checkbox" id="f-allteams" ${getAllTeams() ? 'checked' : ''}>
        <span>🌐 Meus cards (todas as equipes)</span>
      </label>` : ''}

      ${activeFilters.length ? '<div class="filter-divider"></div>' : ''}
      ${activeFilters.map(af => `<span class="chip-removable" data-clr="${af.k}">${escapeHTML(af.l)} <button>×</button></span>`).join('')}
      ${activeFilters.length ? `<button class="btn btn-sm btn-ghost" id="f-clear-all">Limpar todos</button>` : ''}
      <div class="filter-divider"></div>
      ${getSavedViews().map((v,i) => `<span class="chip-view" data-view="${i}" title="Aplicar visão salva">⭐ ${escapeHTML(v.name)} <button class="chip-view-x" data-view-del="${i}" title="Remover visão">×</button></span>`).join('')}
      <button class="btn btn-sm btn-ghost" id="f-save-view" title="Salvar os filtros atuais como uma visão">💾 Salvar visão</button>
      ${_canBulk() ? `<button class="btn btn-sm btn-ghost ${selectMode?'is-active':''}" id="f-select-mode" title="Selecionar vários cards para ações em massa">☑️ ${selectMode?'Sair da seleção':'Selecionar'}</button>` : ''}
      <button class="btn btn-sm btn-ghost f-bar-hide-btn" id="f-bar-hide" title="Ocultar a barra de filtros">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg> Ocultar
      </button>
    </div>`;
}

function _viewsKey() { return 'syncro_views_' + (state.currentTeamId || 'default'); }
function getSavedViews() { try { return JSON.parse(localStorage.getItem(_viewsKey()) || '[]'); } catch { return []; } }
function setSavedViews(v) { try { localStorage.setItem(_viewsKey(), JSON.stringify(v)); } catch (e) {} }

/* ═══ Ações em massa (multi-seleção) ═══ */
function _canBulk() {
  const role = state.currentUser?.role;
  if (role === 'ti' || role === 'suporte') return true;
  const myTeam = (state.teams || []).find(t => t.id === state.currentTeamId);
  return ['gestor', 'analista', 'ti'].includes(myTeam?.my_role);
}

function bulkBarHTML() {
  return `
    <div class="bulk-bar ${selectMode ? 'is-on' : ''}" id="bulk-bar" role="toolbar" aria-label="Ações em massa">
      <span class="bulk-count"><strong id="bulk-n">${selected.size}</strong> selecionado(s)</span>
      <span class="bulk-sep"></span>
      <button class="btn btn-sm btn-secondary" data-bulk="move">↔ Mover</button>
      <button class="btn btn-sm btn-secondary" data-bulk="assign">👤 Responsável</button>
      <button class="btn btn-sm btn-secondary" data-bulk="priority">🚩 Prioridade</button>
      <button class="btn btn-sm btn-secondary" data-bulk="archive">📦 Arquivar</button>
      <span class="bulk-sep"></span>
      <button class="btn btn-sm btn-ghost" data-bulk="all">Todos</button>
      <button class="btn btn-sm btn-ghost" data-bulk="none">Limpar</button>
      <button class="btn btn-sm btn-ghost" id="bulk-exit">✕ Sair</button>
    </div>`;
}

function updateBulkUI() {
  const n = mountEl?.querySelector('#bulk-n');
  if (n) n.textContent = String(selected.size);
}

function toggleSelect(id, el) {
  if (selected.has(id)) { selected.delete(id); el?.classList.remove('is-selected'); }
  else { selected.add(id); el?.classList.add('is-selected'); }
  updateBulkUI();
}

function enterSelectMode(on) {
  selectMode = on;
  if (!on) selected.clear();
  paint();
}

function wireBulkBar() {
  mountEl.querySelector('#f-select-mode')?.addEventListener('click', () => enterSelectMode(!selectMode));
  mountEl.querySelector('#bulk-exit')?.addEventListener('click', () => enterSelectMode(false));
  mountEl.querySelectorAll('[data-bulk]').forEach(b => {
    b.onclick = () => {
      const op = b.dataset.bulk;
      if (op === 'none') { selected.clear(); mountEl.querySelectorAll('.card-tile.is-selected').forEach(t => t.classList.remove('is-selected')); updateBulkUI(); return; }
      if (op === 'all') {
        mountEl.querySelectorAll('.card-tile[data-card-id]').forEach(t => { selected.add(t.dataset.cardId); t.classList.add('is-selected'); });
        updateBulkUI(); return;
      }
      runBulk(op);
    };
  });
}

// Pequeno seletor modal — devolve o valor escolhido ou null (cancelar).
async function pickFromModal(title, options) {
  const { openModal, closeModal } = await import('../ui/modal.js');
  return new Promise(resolve => {
    let resolved = false;
    openModal({
      title: escapeHTML(title),
      body: `<div class="field"><select class="select" id="bulk-pick" autofocus>
               ${options.map(o => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('')}
             </select></div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="bulk-pick-ok">Aplicar</button>`,
      onClose: () => { if (!resolved) { resolved = true; resolve(null); } },
    });
    document.getElementById('bulk-pick-ok').onclick = () => {
      resolved = true;
      const v = document.getElementById('bulk-pick')?.value ?? null;
      closeModal(true);
      resolve(v);
    };
  });
}

async function runBulk(op) {
  const ids = Array.from(selected);
  if (!ids.length) { toast('Selecione ao menos um card.', 'warn'); return; }
  let extra = {};

  if (op === 'archive') {
    const { confirmDialog } = await import('../ui/confirm.js');
    const ok = await confirmDialog({ title: 'Arquivar cards', message: `Arquivar ${ids.length} card(s) selecionado(s)?`, confirmText: 'Arquivar', icon: '📦' });
    if (!ok) return;
  } else if (op === 'move') {
    const cols = state.columns.slice().sort((a, b) => a.position - b.position)
      .map(c => ({ value: c.id, label: (c.icon ? c.icon + ' ' : '') + c.name }));
    const col = await pickFromModal('Mover para a coluna', cols);
    if (col == null) return; extra = { columnId: col };
  } else if (op === 'priority') {
    const p = await pickFromModal('Definir prioridade',
      [['urgente', '🔴 Urgente'], ['alta', '🟠 Alta'], ['media', '🟡 Média'], ['baixa', '🟢 Baixa']].map(([v, l]) => ({ value: v, label: l })));
    if (p == null) return; extra = { priority: p };
  } else if (op === 'assign') {
    let members = [];
    try { members = (await api.call('teams.php', 'members', { team_id: state.currentTeamId }, 'GET')).members || []; } catch {}
    const opts = [{ value: '', label: '— Remover responsável —' }, ...members.map(m => ({ value: m.name, label: m.display || m.name }))];
    const who = await pickFromModal('Definir responsável', opts);
    if (who == null) return; extra = { assignee: who };
  }

  try {
    const r = await api.call('cards.php', 'bulk', { ids, op, ...extra });
    if (Array.isArray(r.cards)) {
      for (const c of r.cards) {
        const i = state.cards.findIndex(x => x.id === c.id);
        if (i >= 0) state.cards[i] = c; else state.cards.push(c);
      }
    }
    toast(`${r.count} card(s) atualizado(s)${r.skipped ? ` · ${r.skipped} sem permissão` : ''}.`, 'success');
    enterSelectMode(false);
  } catch (e) {
    toast(e.message || 'Falha na ação em massa.', 'error');
  }
}

function wireFilters() {
  const setF = (k, v) => { state.filters = { ...(state.filters||{}), [k]: v }; paint(); };

  // ── Barra retrátil (ocultar/mostrar) ──
  const setBarHidden = (hide) => { filterBarHidden = hide; try { localStorage.setItem('syncro_filterbar_hidden', hide ? '1' : '0'); } catch {} paint(); };
  mountEl.querySelector('#f-bar-hide')?.addEventListener('click', () => setBarHidden(true));
  mountEl.querySelector('#f-bar-show')?.addEventListener('click', () => setBarHidden(false));

  // ── KPIs: "+ mais / − menos" (progressive disclosure) ──
  mountEl.querySelector('#kpi-more')?.addEventListener('click', () => {
    try { localStorage.setItem('syncro_kpi_expanded', _kpiExpanded() ? '0' : '1'); } catch {}
    paint();
  });

  // ── Popover "Filtros" (abre/fecha; estado persiste entre repaints) ──
  const moreWrap = mountEl.querySelector('.filter-more-wrap');
  const moreBtn  = mountEl.querySelector('#f-more-btn');
  const morePop  = mountEl.querySelector('#f-more-pop');
  if (moreBtn && morePop) {
    moreBtn.onclick = (e) => {
      e.stopPropagation();
      filtersOpen = !filtersOpen;
      morePop.hidden = !filtersOpen;
      moreBtn.setAttribute('aria-expanded', String(filtersOpen));
    };
    // clique dentro do popover não fecha
    morePop.addEventListener('click', (e) => e.stopPropagation());
    // fecha ao clicar fora — um único listener por vez (evita acúmulo entre repaints)
    if (mountEl._filterDocHandler) document.removeEventListener('click', mountEl._filterDocHandler);
    mountEl._filterDocHandler = (e) => {
      if (filtersOpen && moreWrap && !moreWrap.contains(e.target)) {
        filtersOpen = false;
        const p = mountEl.querySelector('#f-more-pop'); if (p) p.hidden = true;
      }
    };
    document.addEventListener('click', mountEl._filterDocHandler);
  }

  ['period','assignee','priority','status','tag','incomplete','sprint'].forEach(k => {
    const el = mountEl.querySelector('#f-'+k);
    if (el) el.onchange = (e) => setF(k, e.target.value);
  });
  mountEl.querySelectorAll('[data-cf-filter]').forEach(sel => {
    sel.onchange = (e) => setF('cf_' + sel.dataset.cfFilter, e.target.value);
  });
  mountEl.querySelectorAll('.chip-removable[data-clr]').forEach(c => {
    c.querySelector('button').onclick = () => setF(c.dataset.clr, '');
  });
  mountEl.querySelector('#f-clear-all')?.addEventListener('click', () => {
    state.filters = {};
    paint();
  });
  mountEl.querySelector('#f-allteams')?.addEventListener('change', (e) => {
    setAllTeams(e.target.checked); _crossData = null; paint();
  });
  // ── Visões salvas ──
  mountEl.querySelector('#f-save-view')?.addEventListener('click', async () => {
    const { openModal, closeModal } = await import('../ui/modal.js');
    openModal({
      title: '<span class="modal-title-kicker">Filtros</span><span style="color:var(--text);">Salvar visão</span>',
      body: `<div class="field"><label>Nome da visão</label><input class="input" id="sv-name" maxlength="40" autocomplete="off" placeholder="Ex.: Meus atrasados"></div>
             <p class="text-muted text-sm" style="margin:6px 0 0;">Guarda os filtros atuais para reaplicar com um clique (só neste dispositivo).</p>`,
      footer: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="sv-ok">Salvar</button>',
    });
    const inp = document.getElementById('sv-name'); setTimeout(() => inp?.focus(), 40);
    const save = () => {
      const name = (inp.value || '').trim(); if (!name) return;
      const views = getSavedViews();
      views.push({ name: name.slice(0, 40), filters: { ...(state.filters || {}) } });
      setSavedViews(views); closeModal(true); paint();
    };
    document.getElementById('sv-ok').onclick = save;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  });
  mountEl.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', (e) => {
    if (e.target.closest('[data-view-del]')) return;
    const v = getSavedViews()[+b.dataset.view];
    if (v) { state.filters = { ...(v.filters || {}) }; paint(); }
  }));
  mountEl.querySelectorAll('[data-view-del]').forEach(x => x.addEventListener('click', (e) => {
    e.stopPropagation();
    const views = getSavedViews(); views.splice(+x.dataset.viewDel, 1); setSavedViews(views); paint();
  }));
}

/* Selects de filtro para campos personalizados marcados "Usar como filtro". */
function customFilterSelectsHTML(f) {
  const fields = (state.customFields || []).filter(cf => Number(cf.as_filter) && !Number(cf.hidden));
  if (!fields.length) return '';
  return fields.map(cf => {
    let opts = [];
    if (cf.type === 'select') { try { opts = JSON.parse(cf.options || '[]') || []; } catch { opts = []; } }
    else {
      const set = new Set();
      (state.cards || []).forEach(c => { const v = (c.customValues || {})[cf.id]; if (v != null && String(v).trim() !== '') set.add(String(v)); });
      opts = [...set].sort();
    }
    if (!opts.length) return '';
    const cur = (f || {})['cf_' + cf.id] || '';
    return `<select data-cf-filter="${escapeHTML(cf.id)}" title="Filtrar por ${escapeHTML(cf.name)}">
      <option value="">${escapeHTML(cf.name)}: todos</option>
      ${opts.map(o => `<option value="${escapeHTML(o)}" ${o === cur ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('')}
    </select>`;
  }).join('');
}

function matchesFilters(c) {
  const f = state.filters || {};
  // Filtros de campos personalizados (chaves cf_<id>)
  for (const k in f) {
    if (k.indexOf('cf_') === 0 && f[k]) {
      const fid = k.slice(3);
      if (String((c.customValues || {})[fid] ?? '') !== String(f[k])) return false;
    }
  }
  if (f.search) {
    const s = f.search.toLowerCase();
    const hay = [c.title, c.description, ...(c.tags||[]), c.assignee||''].join(' ').toLowerCase();
    if (!hay.includes(s)) return false;
  }
  if (f.priority && autoPriority(c) !== f.priority) return false;
  if (f.assignee && c.assignee !== f.assignee) return false;
  if (f.tag && !(c.tags||[]).includes(f.tag)) return false;
  if (f.sprint && c.sprintId !== f.sprint) return false;
  if (f.status && autoProjection(c) !== f.status) return false;
  if (f.vision && c.vision !== f.vision) return false;
  if (f.incomplete) {
    const incomplete = !c.title || !c.assignee || !c.dueDate;
    if (!incomplete) return false;
  }
  if (f.period && f.period !== 'all') {
    // Filtra pela DATA DE INÍCIO do card (fallback: data de criação).
    // Cards sem nenhuma data não são escondidos.
    const ref = c.startDate || c.createdAt;
    if (ref) {
      const t = new Date(ref).getTime();
      if (!isNaN(t)) {
        if (f.period === 'thisMonth') {
          const now = new Date(), dt = new Date(t);
          if (dt.getMonth() !== now.getMonth() || dt.getFullYear() !== now.getFullYear()) return false;
        } else {
          const days = { '7d':7, '30d':30, '90d':90 }[f.period];
          if (days && t < Date.now() - days*86400000) return false;
        }
      }
    }
  }
  return true;
}

function renderColumn(col, cards) {
  const wip = col.wip_limit
    ? `<span class="column-count ${cards.length>col.wip_limit?'wip-over':''}" title="WIP limit">${cards.length}/${col.wip_limit}</span>`
    : `<span class="column-count">${cards.length}</span>`;
  const collapsed = getCollapsed().has(col.id);
  return `
    <section class="column${collapsed?' is-collapsed':''}" data-col-id="${escapeHTML(col.id)}">
      <header class="column-header"${collapsed?` title="Clique para expandir ${escapeHTML(col.name)}"`:''}>
        <div class="column-title-wrap">
          <span class="column-dot" style="background:${escapeHTML(col.color || 'var(--text-soft)')};"></span>
          <span class="column-title">${escapeHTML(col.name)}</span>
        </div>
        <div class="column-header-right">
          ${wip}
          <button class="col-collapse-btn" data-collapse="${escapeHTML(col.id)}" title="${collapsed?'Expandir':'Recolher'} coluna" aria-label="${collapsed?'Expandir':'Recolher'} coluna">${collapsed?'›':'‹'}</button>
        </div>
      </header>
      <div class="column-body" data-drop-col="${escapeHTML(col.id)}">
        ${cards.map(renderCard).join('') || `<div class="column-empty">Arraste um card para cá</div>`}
      </div>
    </section>`;
}

/* ── Recolher/expandir colunas (persistente por equipe) ── */
function _collapsedKey() { return 'syncro_collapsed_cols_' + (state.currentTeamId || 'default'); }
function getCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(_collapsedKey()) || '[]')); }
  catch { return new Set(); }
}
function toggleCollapse(colId) {
  const s = getCollapsed();
  s.has(colId) ? s.delete(colId) : s.add(colId);
  localStorage.setItem(_collapsedKey(), JSON.stringify([...s]));
  paint();
}

/* ── Swimlanes / raias (agrupar cards por responsável, prioridade ou solicitante)
   A marcação reaproveita .column-body[data-drop-col] para que
   o drag-and-drop existente funcione dentro das raias sem código extra. ── */
function _swimKey() { return 'syncro_swimlane_' + (state.currentTeamId || 'default'); }
function _swimCollapsedKey() { return 'syncro_swimlane_collapsed_' + (state.currentTeamId || 'default'); }
function getSwim() { try { return localStorage.getItem(_swimKey()) || 'none'; } catch { return 'none'; } }
function setSwim(v) { try { localStorage.setItem(_swimKey(), v); } catch {} paint(); }
function getSwimCollapsed() { try { return new Set(JSON.parse(localStorage.getItem(_swimCollapsedKey()) || '[]')); } catch { return new Set(); } }
function toggleSwimLane(key) {
  const s = getSwimCollapsed();
  s.has(key) ? s.delete(key) : s.add(key);
  localStorage.setItem(_swimCollapsedKey(), JSON.stringify([...s]));
  paint();
}
function _swimGroups(cards, groupBy) {
  const groups = {};
  const priOrder = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  cards.forEach(c => {
    let key;
    if (groupBy === 'assignee') key = c.assignee || '(Sem responsável)';
    else if (groupBy === 'priority') key = c.priority || 'media';
    else if (groupBy === 'requestedBy') key = (c.requestedBy || [])[0] || '(Sem solicitante)';
    else key = c.columnId;
    (groups[key] = groups[key] || []).push(c);
  });
  return Object.entries(groups).sort(([a], [b]) => {
    if (groupBy === 'priority') return (priOrder[a] ?? 2) - (priOrder[b] ?? 2);
    return a.localeCompare(b, 'pt-BR');
  });
}
function _swimLabel(key, groupBy) {
  if (groupBy === 'priority') return prioLabel(key) + ' prioridade';
  return key;
}
function renderSwimlanes(cards, groupBy, cols) {
  const groups = _swimGroups(cards, groupBy);
  const collapsed = getSwimCollapsed();
  if (!groups.length) return `<div class="board-swimlanes" id="board-grid"><div class="column-empty">Nenhum card neste filtro.</div></div>`;
  return `<div class="board-swimlanes" id="board-grid">
    ${groups.map(([key, gcards]) => {
      const isC = collapsed.has(key);
      return `<section class="swimlane${isC ? ' collapsed' : ''}" data-swimlane="${escapeHTML(key)}">
        <header class="swimlane-header" data-swim-toggle="${escapeHTML(key)}" title="Recolher/expandir raia">
          <span class="swimlane-chevron">▾</span>
          <span class="swimlane-label">${escapeHTML(_swimLabel(key, groupBy))}</span>
          <span class="swimlane-count">${gcards.length} card${gcards.length !== 1 ? 's' : ''}</span>
        </header>
        <div class="swimlane-body">
          ${cols.map(col => {
            const cc = gcards.filter(c => c.columnId === col.id);
            return `<div class="swimlane-col">
              <div class="swimlane-col-head">
                <span class="column-dot" style="background:${escapeHTML(col.color || 'var(--text-soft)')};"></span>
                ${escapeHTML(col.name)} <span class="swimlane-col-n">${cc.length}</span>
              </div>
              <div class="column-body" data-drop-col="${escapeHTML(col.id)}">
                ${cc.map(renderCard).join('') || `<div class="column-empty">—</div>`}
              </div>
            </div>`;
          }).join('')}
        </div>
      </section>`;
    }).join('')}
  </div>`;
}

/* ── 🌐 Visão "todas as minhas equipes" (Meu Quadro unificado) ──
   Mostra os cards atribuídos ao usuário de TODAS as equipes em 3 baldes
   normalizados (A fazer / Em andamento / Concluído), com selo da equipe.
   Arrastar move o card dentro da PRÓPRIA equipe (resolve o balde → coluna). */
function _allTeamsKey() { return 'syncro_allteams_' + (state.currentUser?.user_id || 'x'); }
function getAllTeams() { try { return localStorage.getItem(_allTeamsKey()) === '1'; } catch { return false; } }
function setAllTeams(on) { try { localStorage.setItem(_allTeamsKey(), on ? '1' : '0'); } catch {} }
let _crossData = null;

async function paintCrossTeam() {
  mountEl.innerHTML = `
    <div class="filter-bar">
      <label class="board-allteams-toggle" title="Voltar ao quadro da equipe ativa">
        <input type="checkbox" id="f-allteams" checked>
        <span>🌐 Meus cards (todas as equipes)</span>
      </label>
      <span class="text-muted text-sm" style="margin-left:6px;">Seus cards agrupados por equipe. Arraste dentro da faixa da equipe para mudar a etapa.</span>
    </div>
    <div id="cross-board"><div class="boot-loader">Carregando seus cards…</div></div>`;
  mountEl.querySelector('#f-allteams')?.addEventListener('change', (e) => { setAllTeams(e.target.checked); _crossData = null; paint(); });
  if (!_crossData) {
    try { _crossData = await api.call('cards.php', 'my_cross_team', {}, 'GET'); }
    catch (e) { const b = document.getElementById('cross-board'); if (b) b.innerHTML = `<div class="mp-empty">Erro ao carregar: ${escapeHTML(e.message)}</div>`; return; }
  }
  renderCrossBoard();
}

const CROSS_BUCKETS = [['todo','📋 A fazer'], ['doing','⚙️ Em andamento'], ['done','✅ Concluído']];

function renderCrossBoard() {
  const board = mountEl.querySelector('#cross-board'); if (!board || !_crossData) return;
  const cards = _crossData.cards || [];

  // Agrupa por EQUIPE → cada equipe vira uma faixa (swimlane) com as 3 etapas.
  const byTeam = new Map();
  cards.forEach(c => {
    if (!byTeam.has(c.teamId)) byTeam.set(c.teamId, {
      name: c.teamName || 'Equipe', color: c.teamColor || '#00796D', icon: c.teamIcon || '👥', cards: [],
    });
    byTeam.get(c.teamId).cards.push(c);
  });

  board.className = 'cross-swimlanes';
  if (!byTeam.size) { board.innerHTML = `<div class="mp-empty">Você não tem cards atribuídos em nenhuma equipe.</div>`; return; }

  board.innerHTML = [...byTeam.entries()].map(([teamId, t]) => {
    const bk = { todo: [], doing: [], done: [] };
    t.cards.forEach(c => (bk[c.bucket] || bk.todo).push(c));
    return `
      <section class="cross-lane" style="--tc:${escapeHTML(t.color)};">
        <div class="cross-lane-head">
          <span class="cross-lane-icon">${escapeHTML(t.icon)}</span>
          <span class="cross-lane-name">${escapeHTML(t.name)}</span>
          <span class="cross-lane-count">${t.cards.length} card${t.cards.length!==1?'s':''}</span>
        </div>
        <div class="cross-lane-cols">
          ${CROSS_BUCKETS.map(([b, label]) => `
            <div class="cross-col">
              <div class="cross-col-head"><span>${label}</span><span class="cross-col-n">${bk[b].length}</span></div>
              <div class="cross-col-body column-body" data-bucket="${b}" data-team="${escapeHTML(teamId)}">
                ${bk[b].map(c => { c._crossTeam = true; c._crossNoBadge = true; return renderCard(c); }).join('') || `<div class="column-empty">—</div>`}
              </div>
            </div>`).join('')}
        </div>
      </section>`;
  }).join('');
  board.querySelectorAll('.card-tile').forEach(el => { el.onclick = () => openCardModal(el.dataset.cardId); });
  _setupCrossDnd();
}

function _setupCrossDnd() {
  let dragId = null;
  mountEl.querySelectorAll('#cross-board .card-tile').forEach(el => {
    el.addEventListener('dragstart', () => { dragId = el.dataset.cardId; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragId = null; });
  });
  mountEl.querySelectorAll('#cross-board .column-body').forEach(body => {
    body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('drag-over'); });
    body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
    body.addEventListener('drop', async (e) => {
      e.preventDefault(); body.classList.remove('drag-over');
      if (!dragId) return;
      const bucket = body.dataset.bucket;
      const card = (_crossData.cards || []).find(c => c.id === dragId);
      if (!card) return;
      // Só pode mover dentro da faixa da PRÓPRIA equipe do card.
      if (body.dataset.team && body.dataset.team !== card.teamId) {
        toast('Mova o card dentro da faixa da própria equipe.', 'warn'); return;
      }
      if (card.bucket === bucket) return;
      if (!can(state.currentUser?.role, 'edit')) { toast('Sem permissão para mover.', 'error'); return; }
      const target = _crossData.teams?.[card.teamId]?.buckets?.[bucket];
      if (!target) { toast('Esta equipe não tem coluna equivalente.', 'warn'); return; }
      const prevBucket = card.bucket, prevCol = card.columnId;
      card.bucket = bucket; card.columnId = target; renderCrossBoard();   // otimista
      if (bucket === 'done') { import('../ui/celebrate.js').then(m => m.celebrate(e.clientX, e.clientY)).catch(()=>{}); window.Tobi && window.Tobi.cheer(); }
      try { await api.call('cards.php', 'move', { id: dragId, columnId: target }); }
      catch (err) { card.bucket = prevBucket; card.columnId = prevCol; renderCrossBoard(); toast(err.message || 'Falha ao mover. Revertido.', 'error'); }
    });
  });
}

/* helpers de card */
function _initials(name) { return (name||'').trim().split(/\s+/).map(p=>p[0]).slice(0,2).join('').toUpperCase() || '?'; }
function _countSubs(list){ return Array.isArray(list)?list.reduce((s,x)=>s+1+_countSubs(x.subtasks),0):0; }
function _countSubsDone(list){ return Array.isArray(list)?list.reduce((s,x)=>s+(x.done?1:0)+_countSubsDone(x.subtasks),0):0; }
function _dueText(c, overdue) {
  if (!c.dueDate) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(c.dueDate + 'T00:00:00');
  const days = Math.round((due - today) / 86400000);
  if (overdue) return `${Math.abs(days)}d atrasado`;
  if (days === 0) return 'hoje'; if (days === 1) return 'amanhã';
  if (days > 1) return `em ${days}d`; return '';
}
const PRIO_LABEL = { urgente:'Urgente', alta:'Alta', media:'Média', baixa:'Baixa' };
const STATUS_LABEL = { 'no-prazo':'No prazo', 'em-risco':'Em risco', 'atrasado':'Atrasado' };
const PRIO_ICON   = { urgente:'🚨', alta:'🔴', media:'🟡', baixa:'🟢' };
const STATUS_ICON = { 'no-prazo':'✅', 'em-risco':'⚠️', 'atrasado':'⏰' };

/* ── Projeção e prioridade AUTOMÁTICAS pela data (recalculadas ao exibir) ── */
const _PRIO_RANK    = { baixa:0, media:1, alta:2, urgente:3 };
const _PRIO_BY_RANK = ['baixa','media','alta','urgente'];
function _daysLeft(c) {
  if (!c.dueDate) return null;
  const due = new Date(c.dueDate + 'T23:59:59');
  if (isNaN(due)) return null;
  return (due - Date.now()) / 86400000;
}
/** Projeção: concluído→no-prazo, vencido→atrasado, perto+pouco progresso→em-risco. */
/** Card concluído = está na coluna final OU já está 100% concluído. */
function _isCardDone(c) {
  return _isDoneColumn(c.columnId) || (Number(c.progress) || 0) >= 100;
}
function autoProjection(c) {
  if (_isCardDone(c)) return 'no-prazo';     // concluído nunca fica "em risco"/"atrasado"
  const dl = _daysLeft(c);
  if (dl === null) return 'no-prazo';        // sem prazo → no prazo (não herda valor antigo)
  const prog = Number(c.progress) || 0;
  if (dl < 0) return 'atrasado';
  if (dl <= 2 && prog < 100) return 'em-risco';
  if (dl <= 5 && prog < 50)  return 'em-risco';
  return 'no-prazo';
}
/** Prioridade efetiva: nunca abaixa a do usuário; sobe conforme o prazo aperta. */
function autoPriority(c) {
  let r = _PRIO_RANK[c.priority] ?? 1;
  if (!_isCardDone(c)) {
    const dl = _daysLeft(c);
    if (dl !== null) {
      if (dl < 0)       r = Math.max(r, 3);   // atrasado → urgente
      else if (dl <= 2) r = Math.max(r, 2);   // ≤2 dias → ao menos alta
      else if (dl <= 5) r = Math.max(r, 1);   // ≤5 dias → ao menos média
    }
  }
  return _PRIO_BY_RANK[r];
}

/** Etiquetas de campos personalizados marcados como "destaque no card" (máx. 2). */
function _cardFieldBadges(c) {
  const fields = (state.customFields || []).filter(f => Number(f.show_on_card));
  if (!fields.length) return '';
  const cv = c.customValues || {};
  return fields.map(f => {
    const v = cv[f.id];
    if (v == null || String(v).trim() === '') return '';
    return `<span class="ct-cf-badge" title="${escapeHTML(f.name)}">${escapeHTML(String(v))}</span>`;
  }).filter(Boolean).join('');
}

function renderCard(c) {
  const overdue = c.dueDate && !_isDoneColumn(c.columnId)
    && new Date(c.dueDate + 'T23:59:59') < new Date();
  const done = _isDoneColumn(c.columnId);
  const labelHex = paletteHex(c.color);
  const progress = Math.max(0, Math.min(100, Number(c.progress)||0));

  // dependências bloqueando (ainda não concluídas)
  const blockedBy = (c.blockedBy||[]).filter(id => { const d = cardById(id); return d && !_isDoneColumn(d.columnId); });
  const isBlocked = blockedBy.length > 0;

  const subTotal = _countSubs(c.subtasks), subDone = _countSubsDone(c.subtasks);
  const comments = (c.comments||[]).length;
  const links = (c.links||[]).length;
  const tags = c.tags||[];
  const status = autoProjection(c);          // projeção recalculada pela data
  const prio   = autoPriority(c);            // prioridade efetiva (sobe com o prazo)
  const incomplete = !c.assignee || !c.dueDate;

  // ── Card enxuto: UM selo só quando o card pede atenção. Card no prazo e
  //    prioridade normal fica CALMO (sem selo) — o olho vai só ao que importa.
  //    Ganhos, esforço e campo extra ficam no modal/preview (progressive disclosure). ──
  const signal = done                     ? null
    : overdue                             ? { cls: 'ct-pri-urgente',     ico: '⏰',  label: 'Atrasado' }
    : prio === 'urgente'                  ? { cls: 'ct-pri-urgente',     ico: '🚨', label: 'Urgente' }
    : prio === 'alta'                     ? { cls: 'ct-pri-alta',        ico: '🔴', label: 'Alta' }
    : status === 'em-risco'               ? { cls: 'ct-status-em-risco', ico: '⚠️', label: 'Em risco' }
    : null;
  const sp = c.sprintId && (state.sprints||[]).find(s => s.id === c.sprintId);
  const badges = [
    (c._crossTeam && !c._crossNoBadge) ? `<span class="ct-team-badge" style="--tc:${escapeHTML(c.teamColor||'#00796D')};">${escapeHTML(c.teamName||'Equipe')}</span>` : '',
    signal ? `<span class="ct-pri ${signal.cls}"><span class="ct-badge-ico">${signal.ico}</span>${signal.label}</span>` : '',
    sp ? `<span class="ct-sprint" title="Sprint">🏃 ${escapeHTML(sp.name)}</span>` : '',
    isBlocked ? `<span class="ct-blocked" title="Bloqueado por ${blockedBy.length} card(s)">🔒 ${blockedBy.length}</span>` : '',
  ].filter(Boolean).join('');

  return `
    <article class="card-tile ${labelHex?'has-label':''} ${overdue?'is-overdue':''} ${isBlocked?'is-blocked':''} ${selected.has(c.id)?'is-selected':''}" draggable="true"
             data-card-id="${escapeHTML(c.id)}" title="${escapeHTML(c.title)}"
             ${labelHex?`style="--label-color:${escapeHTML(labelHex)};"`:''}>
      <span class="ct-check" aria-hidden="true">✓</span>
      ${labelHex?`<span class="card-label-bar"></span>`:''}

      <div class="ct-top">
        <h4>${escapeHTML(c.title)}</h4>
        ${_cardFieldBadges(c)}
      </div>

      ${badges ? `<div class="ct-badges">${badges}</div>` : ''}

      <div class="ct-meta">
        ${c.assignee?`<span class="ct-assignee" title="${escapeHTML(c.assignee)}"><span class="ct-avatar">${escapeHTML(_initials(c.assignee))}</span>${escapeHTML(c.assignee)}</span>`:''}
        ${c.dueDate?`<span class="ct-due ${overdue?'is-overdue':''}" title="Prazo">📅 ${escapeHTML(fmtDate(c.dueDate))}${_dueText(c,overdue)?` · ${_dueText(c,overdue)}`:''}</span>`:''}
      </div>

      ${tags.length?`<div class="ct-tags">${tags.slice(0,2).map(t=>`<span class="ct-tag">#${escapeHTML(t)}</span>`).join('')}${tags.length>2?`<span class="ct-tag ct-tag-more">+${tags.length-2}</span>`:''}</div>`:''}

      ${(progress>0||subTotal)?`<div class="ct-progress">
        <div class="ct-progress-track"><div class="ct-progress-fill ${done?'done':overdue?'over':''}" style="width:${progress}%"></div></div>
        <span class="ct-progress-pct">${progress}%</span>
      </div>`:''}

      ${(subTotal||comments||links||incomplete)?`<div class="ct-footer">
        <div class="ct-ind">
          ${subTotal?`<span title="Subtarefas">☑ ${subDone}/${subTotal}</span>`:''}
          ${comments?`<span title="Comentários">💬 ${comments}</span>`:''}
          ${links?`<span title="${links} link(s)">🔗 ${links}</span>`:''}
        </div>
        ${incomplete?`<span class="ct-incomplete" title="Preencha responsável e/ou prazo">⚠ Incompleto</span>`:''}
      </div>`:''}
    </article>`;
}

/* 🦫 Tobi reage a atrasos:
   - tela do notebook fica piscando em vermelho enquanto houver atraso (persistente);
   - corre assustado de vez em quando (no máx. 1x a cada 2 min, p/ não cansar). */
let _lastScare = 0;
function maybeScareTobi() {
  if (!window.Tobi) return;
  const overdue = state.cards.some(c =>
    !c.archived && !_isDoneColumn(c.columnId) && c.dueDate &&
    new Date(c.dueDate + 'T23:59:59') < new Date());
  window.Tobi.alert && window.Tobi.alert(overdue);   // tela vermelha persistente
  const now = Date.now();
  if (overdue && window.Tobi.scare && now - _lastScare > 120000) {
    _lastScare = now; setTimeout(() => window.Tobi.scare(), 900);
  }
}

/* Coluna "concluído" do quadro atual: id literal 'concluido' ou a de maior posição. */
function _isDoneColumn(colId) {
  const cols = state.columns || [];
  const col = cols.find(c => c.id === colId);
  if (col) return !!Number(col.is_done);   // "Concluído" é definido por flag, não por posição
  // Fallbacks: legado 'concluido', coluna marcada, ou maior posição.
  if (colId === 'concluido') return true;
  if (!cols.length) return false;
  const flagged = cols.find(c => Number(c.is_done));
  if (flagged) return flagged.id === colId;
  const last = cols.reduce((a, b) => (b.position > a.position ? b : a), cols[0]);
  return last && last.id === colId;
}

function setupDnd() {
  let dragId = null;
  mountEl.querySelectorAll('.card-tile').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      dragId = el.dataset.cardId;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragId = null; });
  });
  mountEl.querySelectorAll('.column-body').forEach(body => {
    body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('drag-over'); });
    body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
    body.addEventListener('drop', async (e) => {
      e.preventDefault();
      body.classList.remove('drag-over');
      if (!dragId) return;
      const target = body.dataset.dropCol;
      const card = cardById(dragId);
      if (!card || card.columnId === target) return;
      if (!can(state.currentUser?.role, 'edit')) { toast('Sem permissão para mover.', 'error'); return; }
      // ── Atualização OTIMISTA: move já na tela; sincroniza em 2º plano ──
      const prevCol = card.columnId;
      const movingId = dragId;
      // Celebração ao concluir (entrar na coluna final, vindo de outra)
      if (_isDoneColumn(target) && !_isDoneColumn(prevCol)) {
        import('../ui/celebrate.js').then(m => m.celebrate(e.clientX, e.clientY)).catch(()=>{});
        window.Tobi && window.Tobi.cheer();   // 🦫 Tobi comemora junto
      }
      card.columnId = target;
      paint();                       // resposta instantânea
      api.call('cards.php', 'move', { id: movingId, columnId: target })
        .then(res => {
          if (res?.card) {
            const idx = state.cards.findIndex(c => c.id === movingId);
            if (idx >= 0) { state.cards[idx] = res.card; if (state.view === 'board') paint(); }
          }
        })
        .catch(err => {
          const cur = cardById(movingId); if (cur) cur.columnId = prevCol; // reverte
          paint();
          toast(err.message || 'Falha ao mover. Revertido.', 'error');
        });
    });
  });
}
