/* ═══ SyncroFlow — js/views/mypanel.js
   Meu Painel completo, adaptativo por role (TI, Gestor, Analista, Visitante)
   com aba interna de Arquivados. */
import { state, switchTeam, activeRoleInfo } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { fmtDate, fmtSmart, fmtMoney, prioLabel } from '../core/format.js';
import { switchView } from '../core/router.js';
import { toast } from '../ui/toast.js';
import { heatmapSection } from '../ui/heatmap.js';
import { makeDropdown } from '../ui/dropdown.js';

const TEAM_ROLE_LABEL = { gestor:'Gestor', ti:'TI da equipe', analista:'Analista', visitante:'Visitante' };
const teamRoleBadge = (r) => r==='gestor'?'role-gestor':r==='ti'?'role-ti':r==='visitante'?'role-visitante':'role-analista';
import { TROPHIES_DEF, TITLES_DEF, RARITY_COLORS, getUnlockedTrophies, getUnlockedTitles, computeUserStats, claimLimitedTrophies } from '../core/trophies.js';

let tab = 'overview'; // 'overview' | 'cards' | 'archived' | 'trophies' | 'role'

/* ── Visão geral AGREGADA de todas as equipes do usuário ──
   O Meu Painel não deve depender da equipe ativa: agregamos os cards de
   todas as equipes (1 snapshot por equipe) para alimentar heatmap, KPIs,
   ganhos e burndown com uma visão completa. */
let _agg = null;          // array de cards de todas as equipes
let _aggDone = new Set(); // ids das colunas "concluído" de cada equipe
let _aggLoading = false;

function isDoneCol(colId) { return colId === 'concluido' || _aggDone.has(colId); }

async function loadAggregated() {
  if (_aggLoading) return;
  _aggLoading = true;
  const base = window.__CONFIG__?.apiBase || '/api';
  const teamIds = (state.teams || []).map(t => t.id);
  try {
    const snaps = await Promise.all(teamIds.map(id =>
      fetch(`${base}/state.php?team=${encodeURIComponent(id)}`, { credentials: 'same-origin' })
        .then(r => r.ok ? r.json() : null).catch(() => null)));
    const map = new Map();
    const done = new Set(['concluido']);
    snaps.forEach(snap => {
      if (!snap) return;
      const cols = snap.columns || [];
      const flagged = cols.filter(c => Number(c.is_done));
      if (flagged.length) flagged.forEach(c => done.add(c.id));   // coluna concluída por flag
      else if (cols.length) {                                     // fallback: maior posição
        const last = cols.reduce((a, b) => (b.position > a.position ? b : a), cols[0]);
        if (last) done.add(last.id);
      }
      (snap.cards || []).forEach(c => map.set(c.id, c)); // dedup por id
    });
    _agg = [...map.values()];
    _aggDone = done;
  } finally {
    _aggLoading = false;
  }
}

export const mypanel = {
  render(mount) {
    paint(mount);
    // Carrega/atualiza a visão agregada em segundo plano e repinta quando pronto.
    loadAggregated().then(() => {
      if (state.view === 'mypanel' && mount && mount.isConnected) paint(mount);
    });
  }
};

function paint(mount) {
  const me      = state.currentUser?.name || '';
  const userId  = state.currentUser?.user_id || '';
  // Cargo CONTEXTUAL: papel na equipe ativa (TI/Suporte do sistema mantêm seu painel)
  const globalRole = state.currentUser?.role || 'visitante';
  const activeTeam = (state.teams || []).find(t => t.id === state.currentTeamId);
  const teamRole   = (activeTeam && activeTeam.type === 'team') ? (activeTeam.my_role || null) : null;
  const role    = (globalRole === 'ti' || globalRole === 'suporte') ? globalRole : (teamRole || globalRole);
  const roleInfo = activeRoleInfo();
  const displayName = state.currentUser?.display_name || me;
  const activeTitleId = state.currentUser?.active_title || 'novato';
  const title   = (TITLES_DEF.find(t => t.id === activeTitleId)?.name) || 'Novato';
  const avatarUrl = state.currentUser?.avatar_url || '';
  const initial = (displayName[0] || '?').toUpperCase();

  // Fonte agregada (todas as equipes) quando disponível; senão a equipe ativa.
  const allCards = _agg || state.cards;
  const aggregated = _agg !== null;
  const myCards = allCards.filter(c => !c.archived && c.assignee === me);
  // Arquivados continuam por equipe ativa (snapshots não trazem arquivados).
  const myArchived = state.cards.filter(c => c.archived
    && (c.archivedBy || '').toLowerCase() === me.toLowerCase());
  const concluded = myCards.filter(c => isDoneCol(c.columnId)).length;
  const active    = myCards.filter(c => !isDoneCol(c.columnId)).length;
  const overdue   = myCards.filter(c => c.dueDate && !isDoneCol(c.columnId)
                                        && new Date(c.dueDate + 'T23:59:59') < new Date()).length;
  const pendingSub = myCards.reduce((acc, c) =>
    acc + (c.subtasks || []).filter(s => !s.done).length, 0);
  const myEcon  = myCards.reduce((s,c) => s + (Number(c.gains?.economiaMes)||0), 0);
  const myHours = myCards.reduce((s,c) => s + (Number(c.gains?.horasMes)||0), 0);
  const myEconAno  = myCards.reduce((s,c) => s + (Number(c.gains?.economiaAno)||0), 0);
  const myHoursAno = myCards.reduce((s,c) => s + (Number(c.gains?.horasAno)||0), 0);
  const cardsComGanho = myCards.filter(c => (Number(c.gains?.economiaMes)||0) > 0 || (Number(c.gains?.horasMes)||0) > 0).length;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5)  return 'Boa madrugada';
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  })();
  const clock = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

  // Role-specific extras
  const roleTabContent = renderRoleTab(role, me);
  const showRoleTab = role !== 'visitante';

  mount.innerHTML = `
    <div class="mp-page">
      <!-- HEADER -->
      <div class="mp-header-card">
        <div class="mp-avatar">${avatarUrl ? `<img src="${escapeHTML(avatarUrl)}" alt="">` : escapeHTML(initial)}</div>
        <div class="mp-user-info">
          <div class="mp-user-name">${escapeHTML(displayName)}</div>
          ${title ? `<div class="mp-user-title">${escapeHTML(title)}</div>` : ''}
          <div class="mp-user-id">
            <span class="role-badge" title="${roleInfo.scope==='team'?'Seu cargo na equipe ativa':'Seu nível no sistema'}" style="margin-left:8px;background:rgba(255,255,255,0.18);color:#fff;border:1px solid rgba(255,255,255,0.25);">${escapeHTML(roleInfo.label)}</span>
            ${roleInfo.scope==='team' && activeTeam ? `<span class="role-badge" style="margin-left:6px;background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.2);font-weight:600;">${escapeHTML(activeTeam.icon||'👥')} ${escapeHTML(activeTeam.name)}</span>` : ''}
          </div>
          <div class="mp-greeting">${greeting}, ${escapeHTML(displayName.split(' ')[0])}! 👋</div>
        </div>
        <button class="mp-edit-profile" id="mp-edit-profile" title="Editar perfil">✏️ Editar perfil</button>
        <div class="mp-clock">${clock}</div>
      </div>

      <!-- Escopo da visão -->
      <div class="mp-scope-note">
        ${aggregated
          ? `🌐 Visão consolidada de <strong>todas as suas equipes</strong>`
          : `<span class="mp-scope-loading">⏳ Carregando visão de todas as equipes…</span>`}
      </div>

      <!-- KPI strip -->
      <div class="mp-kpi-grid">
        <div class="mp-kpi">
          <div class="mp-kpi-label">Cards ativos</div>
          <div class="mp-kpi-value">${active}</div>
          <div class="mp-kpi-sub">Sob sua responsabilidade</div>
        </div>
        <div class="mp-kpi success">
          <div class="mp-kpi-label">Concluídos</div>
          <div class="mp-kpi-value">${concluded}</div>
          <div class="mp-kpi-sub">Entregues por você</div>
        </div>
        <div class="mp-kpi ${overdue ? 'danger' : ''}">
          <div class="mp-kpi-label">Atrasados</div>
          <div class="mp-kpi-value">${overdue}</div>
          <div class="mp-kpi-sub">${overdue ? 'Atenção!' : 'Tudo no prazo'}</div>
        </div>
        <div class="mp-kpi ${pendingSub > 5 ? 'warning' : ''}">
          <div class="mp-kpi-label">Subtarefas</div>
          <div class="mp-kpi-value">${pendingSub}</div>
          <div class="mp-kpi-sub">Pendentes</div>
        </div>
      </div>

      <!-- TABS internas -->
      <div class="mp-tabs">
        <button class="mp-tab ${tab==='overview'?'active':''}" data-mp-tab="overview"><img class="mp-tab-ico" src="imagens/icones/visao-geral.webp" alt="" aria-hidden="true"> Visão geral</button>
        <button class="mp-tab ${tab==='cards'?'active':''}" data-mp-tab="cards"><img class="mp-tab-ico" src="imagens/icones/meus-cards.webp" alt="" aria-hidden="true"> Meus cards <span class="mp-tab-count">${myCards.length}</span></button>
        <button class="mp-tab ${tab==='archived'?'active':''}" data-mp-tab="archived"><img class="mp-tab-ico" src="imagens/icones/arquivados.webp" alt="" aria-hidden="true"> Arquivados <span class="mp-tab-count">${myArchived.length}</span></button>
        <button class="mp-tab ${tab==='trophies'?'active':''}" data-mp-tab="trophies"><img class="mp-tab-ico" src="imagens/icones/conquistas.webp" alt="" aria-hidden="true"> Conquistas <span class="mp-tab-count">${getUnlockedTrophies(me).length}/${TROPHIES_DEF.length}</span></button>
        ${showRoleTab ? `<button class="mp-tab ${tab==='role'?'active':''}" data-mp-tab="role">${roleTabIcon(role)} ${roleTabTitle(role)}</button>` : ''}
      </div>

      <!-- TAB CONTENT -->
      <div class="mp-tab-panel" id="mp-tab-content">
        ${renderTabContent(tab, { me, role, myCards, myArchived, myEcon, myHours, myEconAno, myHoursAno, cardsComGanho, allCards, aggregated })}
        ${tab === 'role' ? roleTabContent : ''}
      </div>
    </div>`;

  // Wire
  mount.querySelectorAll('[data-mp-tab]').forEach(b => {
    b.onclick = () => { tab = b.dataset.mpTab; paint(mount); };
  });
  mount.querySelectorAll('[data-card-id]').forEach(el => {
    el.onclick = () => import('../modals/card-modal.js').then(m => m.openCardModal(el.dataset.cardId));
  });
  mount.querySelectorAll('[data-goto-view]').forEach(el => {
    el.onclick = (e) => { e.preventDefault(); switchView(el.dataset.gotoView); };
  });
  mount.querySelectorAll('[data-team-open]').forEach(el => {
    el.onclick = async () => { try { await switchTeam(el.dataset.teamOpen); switchView('board'); } catch (e) { toast(e.message, 'error'); } };
  });
  mount.querySelectorAll('[data-team-manage]').forEach(el => {
    el.onclick = () => switchView('equipes');
  });
  // "Ver equipe" → abre Usuários já filtrado por aquela equipe
  mount.querySelectorAll('[data-users-team]').forEach(el => {
    el.onclick = () => { sessionStorage.setItem('usuarios_filter_team', el.dataset.usersTeam); switchView('usuarios'); };
  });
  mount.querySelector('#mp-edit-profile')?.addEventListener('click', () => openProfileEdit(mount));
}

/* ─────────────────────────────────────────────
   Editar perfil — nome, título, email, bio, senha, foto e capa
   (foto/capa via 2º SQLite em api/photos.php)
   ───────────────────────────────────────────── */
async function openProfileEdit(mount) {
  const { openModal, closeModal } = await import('../ui/modal.js');
  const { api } = await import('../core/api.js');
  const { toast } = await import('../ui/toast.js');
  const u = state.currentUser || {};
  const unlockedTitles = getUnlockedTitles(u.name || u.display_name || '');
  const curTitleId = u.active_title || 'novato';
  const _ini = { nm: (u.display_name||u.name||''), em: (u.email||''), bo: (u.bio||''), ti: curTitleId };
  openModal({
    // barreira: confirma antes de fechar se algo foi alterado/digitado
    guard: () => {
      const g = id => (document.getElementById(id)?.value || '');
      if (g('pe-cur') || g('pe-new') || g('pe-new2')) return true;          // mexeu na senha
      return g('pe-name').trim() !== _ini.nm || g('pe-email').trim() !== _ini.em
          || g('pe-bio').trim() !== _ini.bo || (document.getElementById('pe-title')?.value || _ini.ti) !== _ini.ti;
    },
    title: `<span class="modal-title-kicker">Meu Painel</span><span style="color:var(--text);">Editar perfil</span>`,
    body: `
      <div class="pe-photos">
        <div class="pe-photo-field">
          <label>Foto de perfil</label>
          <div class="pe-avatar-prev" id="pe-avatar-prev">${u.avatar_url ? `<img src="${escapeHTML(u.avatar_url)}">` : escapeHTML((u.display_name||u.name||'?')[0].toUpperCase())}</div>
          <input type="file" id="pe-avatar-file" accept="image/*" hidden>
          <div class="pe-photo-btns">
            <button class="btn btn-secondary btn-sm" id="pe-avatar-btn" disabled title="Envio de foto temporariamente desativado">Trocar</button>
            ${u.avatar_url ? `<button class="btn btn-ghost btn-sm" id="pe-avatar-del" disabled title="Envio de foto temporariamente desativado">Remover</button>` : ''}
          </div>
          <div class="pe-dim">Quadrada · 400×400px</div>
        </div>
      </div>
      <div class="field"><label>Nome de exibição</label><input class="input" id="pe-name" value="${escapeHTML(u.display_name||u.name||'')}"></div>
      <div class="field">
        <label>Título <span style="font-weight:600;text-transform:none;letter-spacing:0;color:var(--text-muted);">(desbloqueado por conquistas)</span></label>
        <input type="hidden" id="pe-title" value="${escapeHTML(curTitleId)}">
        <div class="cm-dd" id="pe-title-dd"></div>
        <div class="cm-assignee-hint">Você tem ${unlockedTitles.length} de ${TITLES_DEF.length} títulos. Conclua mais cards e conquiste troféus para desbloquear novos.</div>
      </div>
      <div class="field"><label>Email</label><input class="input" id="pe-email" type="email" value="${escapeHTML(u.email||'')}"></div>
      <div class="field"><label>Bio</label><textarea id="pe-bio" rows="2" placeholder="Uma breve descrição…">${escapeHTML(u.bio||'')}</textarea></div>
      <details class="pe-pass"><summary>🔒 Alterar senha</summary>
        <div class="field"><label>Senha atual</label><input class="input" id="pe-cur" type="password" autocomplete="current-password"></div>
        <div class="field"><label>Nova senha</label><input class="input" id="pe-new" type="password" autocomplete="new-password"></div>
        <div class="field"><label>Confirmar nova senha</label><input class="input" id="pe-new2" type="password" autocomplete="new-password"></div>
      </details>
      <details class="pe-pass"><summary>⚡ Login automático (neste dispositivo)</summary>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;margin-top:4px;">
          <input type="checkbox" id="pe-autologin" style="width:auto;accent-color:var(--primary);">
          <span>Entrar automaticamente neste dispositivo, sem digitar a senha.</span>
        </label>
        <div class="cm-assignee-hint">Usa um token seguro (a senha nunca é guardada). Desligar revoga o acesso automático deste dispositivo.</div>
      </details>
      <details class="pe-pass"><summary>🗂️ Quadro pessoal</summary>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;margin-top:4px;">
          <input type="checkbox" id="pe-personal-board" style="width:auto;accent-color:var(--primary);">
          <span>Mostrar o meu <strong>Quadro pessoal</strong> no seletor de equipes.</span>
        </label>
        <div class="cm-assignee-hint">Desligue se você não usa o quadro pessoal — ele some do seletor. Você pode reativar aqui quando quiser.</div>
      </details>
      <details class="pe-pass"><summary>📧 Notificações por e-mail</summary>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;margin-top:4px;">
          <input type="checkbox" id="pe-notif-master" style="width:auto;accent-color:var(--primary);">
          <span>Receber notificações por e-mail</span>
        </label>
        <div class="cm-assignee-hint">Desativado por padrão. Os avisos vão para <strong>${escapeHTML(u.email || 'seu e-mail (cadastre acima)')}</strong>.</div>
        <div id="pe-notif-subs" style="margin-top:10px;padding-left:10px;border-left:2px solid var(--border);">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;margin:8px 0;">
            <input type="checkbox" id="pe-notif-assign" style="width:auto;accent-color:var(--primary);">
            <span>Quando eu for <strong>designado</strong> para um card</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;margin:8px 0;">
            <input type="checkbox" id="pe-notif-due" style="width:auto;accent-color:var(--primary);">
            <span>Quando um card meu estiver <strong>perto de vencer</strong> ou vencido</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;margin:8px 0;">
            <input type="checkbox" id="pe-notif-digest" style="width:auto;accent-color:var(--primary);">
            <span><strong>Resumo semanal</strong> dos meus cards (toda segunda)</span>
          </label>
        </div>
      </details>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="pe-save">Salvar</button>`,
    size: 'md',
  });

  // ⚡ Login automático (lembrar-me): reflete o estado e liga/desliga via API
  (async () => {
    const chk = document.getElementById('pe-autologin');
    if (!chk) return;
    try { const r = await api.call('auth.php', 'autologin_status', {}, 'GET'); chk.checked = !!r.enabled; } catch {}
    chk.addEventListener('change', async () => {
      try {
        await api.call('auth.php', chk.checked ? 'enable_autologin' : 'disable_autologin', {});
        toast(chk.checked ? 'Login automático ativado neste dispositivo.' : 'Login automático desativado.', 'success');
      } catch (e) { chk.checked = !chk.checked; toast(e.message || 'Falha ao alterar.', 'error'); }
    });
  })();

  // 🗂️ Quadro pessoal: liga/desliga a exibição no seletor de equipes (preferência local).
  (function () {
    const pb = document.getElementById('pe-personal-board');
    if (!pb) return;
    pb.checked = localStorage.getItem('syncro_hide_personal') !== '1';   // marcado = mostrar
    pb.addEventListener('change', () => {
      if (pb.checked) {
        localStorage.removeItem('syncro_hide_personal');
        toast('Quadro pessoal reativado.', 'success');
      } else {
        localStorage.setItem('syncro_hide_personal', '1');
        const cur = (state.teams || []).find(t => t.id === state.currentTeamId);
        toast('Quadro pessoal desativado.', 'info');
        // Se estava no quadro pessoal, recarrega para cair numa equipe válida.
        if (cur && cur.type === 'personal') setTimeout(() => location.reload(), 500);
      }
    });
  })();

  // 📧 Notificações por e-mail: reflete o estado atual e habilita/desabilita
  // as subopções conforme o interruptor mestre (salvas no botão "Salvar").
  (function () {
    const master = document.getElementById('pe-notif-master');
    const subs   = document.getElementById('pe-notif-subs');
    const asg    = document.getElementById('pe-notif-assign');
    const due    = document.getElementById('pe-notif-due');
    const dig    = document.getElementById('pe-notif-digest');
    if (!master) return;
    const onOff = v => v == null ? false : !!Number(v);
    master.checked = onOff(u.notify_email);
    asg.checked    = u.notify_email_assign == null ? true : onOff(u.notify_email_assign);
    due.checked    = u.notify_email_due    == null ? true : onOff(u.notify_email_due);
    if (dig) dig.checked = u.notify_email_digest == null ? true : onOff(u.notify_email_digest);
    const sync = () => {
      const on = master.checked;
      subs.style.opacity = on ? '1' : '.45';
      asg.disabled = due.disabled = !on;
      if (dig) dig.disabled = !on;
    };
    sync();
    master.addEventListener('change', sync);
  })();

  // DESABILITADO: upload da FOTO de perfil (avatar) — usuário não tem capa
  /* ╔╗╔╗╔═══════════════════════════════════════════════════════════╗
     ╚╚╚║  FUNÇÕES DE UPLOAD DE FOTOS COMENTADAS (ERRO HTTP 500)  ║╚
         ║  - uploadPhoto()                                        ║
         ║  - onclick pe-avatar-btn                               ║
         ║  - onchange pe-avatar-file                             ║
         ║  - delPhoto()                                          ║
         ║  - addEventListener pe-avatar-del                      ║
         ║  Data: 2026-06-09 - Investigação em andamento          ║
         ╚═══════════════════════════════════════════════════════════╝
  async function uploadPhoto(kind, fileInput, previewSetter) {
    const f = fileInput.files?.[0]; fileInput.value = ''; if (!f) return;
    const { openImageCrop } = await import('../ui/image-crop.js');
    const blob = await openImageCrop({ file: f, aspect: 1, outW: 400, outH: 400, round: true, title: 'Ajustar foto de perfil' });
    if (!blob) return;
    const fd = new FormData();
    fd.append('file', blob, 'avatar.jpg'); fd.append('t', 'user'); fd.append('o', u.user_id); fd.append('k', 'avatar');
    try {
      const d = await api.upload(`photos.php?action=upload`, fd);
      state.currentUser.avatar_url = d.url; previewSetter(`<img src="${d.url}">`);
      toast('Foto enviada.', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }
  document.getElementById('pe-avatar-btn').onclick = () => document.getElementById('pe-avatar-file').click();
  document.getElementById('pe-avatar-file').onchange = (e) =>
    uploadPhoto('avatar', e.target, (html)=>{ document.getElementById('pe-avatar-prev').innerHTML = html; });
  async function delPhoto(kind) {
    const fd = new FormData(); fd.append('t','user'); fd.append('o', u.user_id); fd.append('k', kind);
    return api.upload('photos.php?action=delete', fd);
  }
  document.getElementById('pe-avatar-del')?.addEventListener('click', async () => {
    try { await delPhoto('avatar'); state.currentUser.avatar_url=''; document.getElementById('pe-avatar-prev').innerHTML = escapeHTML((u.display_name||u.name||'?')[0].toUpperCase()); toast('Foto removida.','success'); } catch(e){ toast(e.message,'error'); }
  });
  */

  // Título: dropdown customizado (lista com o CSS do site, não do navegador)
  makeDropdown(document.getElementById('pe-title-dd'), {
    value: curTitleId,
    options: unlockedTitles.map(t => ({ value: t.id, label: t.name })),
    placeholder: 'Selecione um título',
    onChange: v => { document.getElementById('pe-title').value = v; },
  });

  document.getElementById('pe-save').onclick = async () => {
    const cur = document.getElementById('pe-cur').value;
    const np  = document.getElementById('pe-new').value;
    const np2 = document.getElementById('pe-new2').value;
    const nm = document.getElementById('pe-name').value.trim();
    const ti = document.getElementById('pe-title').value; // id do título desbloqueado
    const em = document.getElementById('pe-email').value.trim();
    const bo = document.getElementById('pe-bio').value.trim();
    const nMaster = document.getElementById('pe-notif-master')?.checked ? 1 : 0;
    const nAssign = document.getElementById('pe-notif-assign')?.checked ? 1 : 0;
    const nDue    = document.getElementById('pe-notif-due')?.checked ? 1 : 0;
    const nDigest = document.getElementById('pe-notif-digest')?.checked ? 1 : 0;
    if (nMaster && !em) { toast('Cadastre um e-mail para receber notificações.', 'warn'); return; }
    try {
      const r = await api.call('users.php','me_update',{
        displayName: nm, activeTitle: ti, email: em, bio: bo,
        notifyEmail: nMaster, notifyEmailAssign: nAssign, notifyEmailDue: nDue, notifyEmailDigest: nDigest,
      });
      if (r?.user) Object.assign(state.currentUser, r.user, { active_title: ti });
      else Object.assign(state.currentUser, { display_name: nm, active_title: ti, email: em, bio: bo });
      if (np || np2 || cur) {
        if (np !== np2) { toast('As senhas novas não coincidem.', 'warn'); return; }
        if (np.length < 6) { toast('Nova senha muito curta.', 'warn'); return; }
        await api.call('auth.php','change_password',{ old_password: cur, new_password: np });
      }
      toast('Perfil atualizado.', 'success');
      closeModal(true);
      paint(mount);
    } catch (e) { toast(e.message, 'error'); }
  };
}

function renderTabContent(tab, ctx) {
  if (tab === 'overview') return renderOverview(ctx);
  if (tab === 'cards')    return renderCards(ctx);
  if (tab === 'archived') return renderArchived(ctx);
  if (tab === 'trophies') return renderTrophies(ctx);
  return '';
}

function renderTrophies(ctx) {
  const { me } = ctx;
  const unlocked = getUnlockedTrophies(me);
  const unlockedIds = new Set(unlocked.map(t => t.id));
  const unlockedTitles = getUnlockedTitles(me);
  const stats = computeUserStats(me);

  // Agrupa por raridade
  const byRarity = { copa:[], lendario:[], epico:[], raro:[], incomum:[], comum:[], vergonha:[] };
  TROPHIES_DEF.forEach(t => {
    if (byRarity[t.rarity]) byRarity[t.rarity].push(t);
  });
  const RARITY_ORDER = ['copa','lendario','epico','raro','incomum','comum','vergonha'];

  // Conquistas de edição limitada (Copa "Artilheiro", só 3 vagas): reivindica no
  // servidor em 2º plano e repinta o painel se algo for concedido agora.
  if (me === (state.currentUser?.name)) {
    claimLimitedTrophies(me).then(granted => {
      if (granted && granted.length) document.querySelector('[data-mp-tab="trophies"]')?.click();
    }).catch(() => {});
  }

  return `
    <!-- Resumo de conquistas -->
    <div class="trophy-summary">
      <div class="trophy-summary-card">
        <div class="trophy-summary-num">${unlocked.length}</div>
        <div class="trophy-summary-lbl">Troféus desbloqueados</div>
        <div class="trophy-summary-sub">de ${TROPHIES_DEF.length} totais</div>
        <div class="trophy-progress-bar"><div style="width:${(unlocked.length/TROPHIES_DEF.length)*100}%"></div></div>
      </div>
      <div class="trophy-summary-card">
        <div class="trophy-summary-num">${unlockedTitles.length}</div>
        <div class="trophy-summary-lbl">Títulos disponíveis</div>
        <div class="trophy-summary-sub">de ${TITLES_DEF.length}</div>
      </div>
      <div class="trophy-summary-card">
        <div class="trophy-summary-num">${stats.totalConcluded}</div>
        <div class="trophy-summary-lbl">Cards concluídos</div>
        <div class="trophy-summary-sub">total na sua conta</div>
      </div>
      <div class="trophy-summary-card">
        <div class="trophy-summary-num">${fmtMoney(stats.totalEconomy).replace('R$ ','')}</div>
        <div class="trophy-summary-lbl">R$ Economia/mês</div>
        <div class="trophy-summary-sub">acumulada</div>
      </div>
    </div>

    <!-- Títulos -->
    <div class="mp-section">
      <div class="mp-section-header">
        <h3 class="mp-section-title">🎖️ Títulos disponíveis</h3>
        <span style="font-size:11px;color:var(--text-muted);">${unlockedTitles.length}/${TITLES_DEF.length}</span>
      </div>
      <div class="mp-section-body" style="padding:14px 18px;">
        <div class="title-grid">
          ${TITLES_DEF.map(t => {
            const got = unlockedTitles.find(u => u.id === t.id);
            return `
              <div class="title-card ${got?'unlocked':'locked'}" title="${escapeHTML(t.condition)}">
                <div class="title-name">${escapeHTML(t.name)}</div>
                <div class="title-cond">${escapeHTML(t.condition)}</div>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Troféus por raridade -->
    ${RARITY_ORDER.map(rarity => {
      const items = byRarity[rarity];
      if (!items.length) return '';
      const meta = RARITY_COLORS[rarity];
      const gotCount = items.filter(t => unlockedIds.has(t.id)).length;
      return `
        <div class="mp-section trophy-section">
          <div class="mp-section-header" style="border-left:4px solid ${meta.bg};">
            <h3 class="mp-section-title">${getRarityIcon(rarity)} ${meta.label} <span style="color:var(--text-muted);font-weight:600;font-size:11px;">${gotCount}/${items.length}</span></h3>
          </div>
          <div class="mp-section-body" style="padding:14px 18px;">
            <div class="trophy-grid">
              ${items.map(t => {
                const got = unlockedIds.has(t.id);
                const masked = t.hidden && !got;   // conquista oculta: mascara até desbloquear
                return `
                  <div class="trophy-card ${got?'unlocked':'locked'} ${masked?'is-hidden':''} rarity-${rarity}" title="${escapeHTML(masked?'Conquista oculta — descubra jogando!':t.description)}">
                    <div class="trophy-icon">${masked?'❓':escapeHTML(t.icon)}</div>
                    <div class="trophy-name">${escapeHTML(masked?'???':t.name)}</div>
                    <div class="trophy-desc">${escapeHTML(masked?'Conquista oculta':t.description)}</div>
                    <span class="trophy-rarity" style="background:${meta.bg};">${escapeHTML(meta.label)}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>
        </div>`;
    }).join('')}
  `;
}

function getRarityIcon(r) {
  return { lendario:'👑', epico:'💎', raro:'⭐', incomum:'🔷', comum:'⚪', vergonha:'💀' }[r] || '🏆';
}

/* ── Minhas equipes ── */
function teamCardHTML(t) {
  const isDev = state.currentUser?.role === 'ti';
  const manage = t.my_role === 'gestor' || t.my_role === 'ti' || isDev;
  const active = t.id === state.currentTeamId;
  const color = escapeHTML(t.color || '#00796D');
  const cover = t.cover_url
    ? `background-image:linear-gradient(120deg,${color}cc,rgba(14,42,42,.55)),url('${escapeHTML(t.cover_url)}');background-size:cover;background-position:center;`
    : `background:linear-gradient(120deg,${color},var(--ink));`;
  return `
    <div class="mp-team-card ${active?'is-active':''}">
      <div class="mp-team-cover" style="${cover}">
        <span class="mp-team-emoji">${t.avatar_url ? `<img src="${escapeHTML(t.avatar_url)}" alt="">` : escapeHTML(t.icon||'👥')}</span>
        ${active ? `<span class="mp-team-active-tag">ATIVA</span>` : ''}
        <span class="role-badge ${teamRoleBadge(t.my_role)} mp-team-rolebadge">${escapeHTML(TEAM_ROLE_LABEL[t.my_role]||t.my_role)}</span>
      </div>
      <div class="mp-team-body">
        <div class="mp-team-name">${escapeHTML(t.name)}</div>
        <div class="mp-team-desc">${escapeHTML(t.description || 'Sem descrição.')}</div>
        <div class="mp-team-stats">
          <span title="Membros">👤 ${t.member_count||0}</span>
          <span title="Cards">🗂️ ${t.card_count||0}</span>
          ${t.managers && t.managers.length ? `<span title="Gestores">⭐ ${escapeHTML(t.managers.slice(0,2).join(', '))}</span>` : ''}
        </div>
        <div class="mp-team-actions">
          <button class="btn btn-sm ${active?'btn-ghost':'btn-secondary'}" data-team-open="${escapeHTML(t.id)}">${active?'Em uso':'Abrir quadro'}</button>
          ${manage ? `<button class="btn btn-sm btn-primary" data-team-manage="${escapeHTML(t.id)}">Gerenciar</button>` : ''}
        </div>
      </div>
    </div>`;
}

function renderMyTeams() {
  const teams = (state.teams || []).filter(t => t.type !== 'personal');
  const isDev = state.currentUser?.role === 'ti';
  if (!teams.length) {
    return `
      <div class="mp-section" style="margin-bottom:14px;">
        <div class="mp-section-header"><h3 class="mp-section-title">🏢 Minhas equipes</h3></div>
        <div class="mp-section-body">
          <div class="mp-empty" style="text-align:center;padding:26px;">
            <div style="font-size:30px;margin-bottom:6px;">🏢</div>
            Você ainda não participa de nenhuma equipe.<br>
            <button class="btn btn-primary btn-sm" data-goto-view="equipes" style="margin-top:12px;">Encontrar equipes →</button>
          </div>
        </div>
      </div>`;
  }
  const managed = teams.filter(t => t.my_role === 'gestor' || t.my_role === 'ti' || isDev);
  const member  = teams.filter(t => !(t.my_role === 'gestor' || t.my_role === 'ti' || isDev));
  const order = { gestor:0, ti:1, analista:2, visitante:3 };
  const byName = (a,b) => (order[a.my_role]??9)-(order[b.my_role]??9) || a.name.localeCompare(b.name);
  managed.sort(byName); member.sort(byName);

  const grid = (list) => `<div class="mp-teams-grid">${list.map(teamCardHTML).join('')}</div>`;
  return `
    <div class="mp-section" style="margin-bottom:14px;">
      <div class="mp-section-header">
        <h3 class="mp-section-title">🏢 Minhas equipes</h3>
        <span class="mp-section-aside">${teams.length}</span>
      </div>
      <div class="mp-section-body" style="padding:16px 18px;">
        ${managed.length ? `<div class="mp-teams-sublabel">⭐ ${isDev ? 'Equipes (acesso total)' : 'Equipes que gerencio'} (${managed.length})</div>${grid(managed)}` : ''}
        ${member.length ? `<div class="mp-teams-sublabel" style="margin-top:16px;">Participo (${member.length})</div>${grid(member)}` : ''}
      </div>
    </div>`;
}

/* ── Heatmap de atividade (contribution graph, ~6 meses) ── */
function dayKey(d) {
  // chave YYYY-MM-DD em horário local (evita desalinhamento por fuso)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function collectActivity(me) {
  // conta interações do usuário por dia: histórico de cards, comentários,
  // e criação/atualização dos cards sob sua responsabilidade.
  const counts = {};
  const bump = (iso) => { if (!iso) return; const k = String(iso).slice(0,10); if (/^\d{4}-\d{2}-\d{2}$/.test(k)) counts[k] = (counts[k]||0)+1; };
  state.cards.forEach(c => {
    const mine = c.assignee === me || c.createdBy === me;
    (c.history || []).forEach(h => { if (!h.user || h.user === me) bump(h.timestamp || h.at); });
    (c.comments || []).forEach(cm => {
      const author = cm.user || cm.author;
      if (author === me) bump(cm.timestamp || cm.createdAt);
      (cm.replies || []).forEach(r => { if ((r.user || r.author) === me) bump(r.timestamp || r.createdAt); });
    });
    if (mine) { bump(c.createdAt); bump(c.updatedAt); }
  });
  return counts;
}

const MES_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function renderHeatmap() {
  const me = state.currentUser?.name || '';
  const counts = collectActivity(me);
  const WEEKS = 26;
  const today = new Date(); today.setHours(0,0,0,0);
  // alinhamento: termina no sábado da semana atual, começa no domingo WEEKS atrás
  const end = new Date(today); end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end); start.setDate(start.getDate() - (WEEKS*7 - 1));

  const weeks = []; let max = 0, total = 0, activeDays = 0, best = { v:0, d:null };
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    for (let dow = 0; dow < 7; dow++) {
      const d = new Date(start); d.setDate(start.getDate() + w*7 + dow);
      const future = d > today;
      const v = future ? -1 : (counts[dayKey(d)] || 0);
      if (v > 0) { total += v; activeDays++; if (v > max) max = v; if (v > best.v) best = { v, d:new Date(d) }; }
      col.push({ d, v, future });
    }
    weeks.push(col);
  }
  const level = (v) => v <= 0 ? 0 : max <= 1 ? 1 : v >= Math.ceil(max*0.75) ? 4 : v >= Math.ceil(max*0.5) ? 3 : v >= Math.ceil(max*0.25) ? 2 : 1;

  // streak atual (dias consecutivos com atividade terminando hoje/ontem)
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if ((counts[dayKey(d)] || 0) > 0) streak++;
    else if (i === 0) continue;  // tolera "hoje ainda sem atividade"
    else break;
  }

  // rótulos de mês: marca a coluna onde o mês muda
  const monthCells = weeks.map((col, i) => {
    const m = col[0].d.getMonth();
    const prev = i > 0 ? weeks[i-1][0].d.getMonth() : -1;
    return (m !== prev) ? MES_ABBR[m] : '';
  });

  const wd = ['', 'Seg', '', 'Qua', '', 'Sex', '']; // rótulos esparsos
  const bestTxt = best.d ? `${best.v} em ${best.d.getDate()}/${best.d.getMonth()+1}` : '—';

  return `
    <div class="mp-section" style="margin-bottom:14px;">
      <div class="mp-section-header">
        <h3 class="mp-section-title">🔥 Sua atividade</h3>
        <span class="mp-section-aside">${total} interaç${total===1?'ão':'ões'} · ${WEEKS} semanas</span>
      </div>
      <div class="mp-section-body">
        <div class="hm-stats">
          <div class="hm-stat"><span class="hm-stat-val">${total}</span><span class="hm-stat-lbl">Interações</span></div>
          <div class="hm-stat"><span class="hm-stat-val">${activeDays}</span><span class="hm-stat-lbl">Dias ativos</span></div>
          <div class="hm-stat"><span class="hm-stat-val">🔥 ${streak}</span><span class="hm-stat-lbl">Sequência (dias)</span></div>
          <div class="hm-stat"><span class="hm-stat-val">${bestTxt}</span><span class="hm-stat-lbl">Melhor dia</span></div>
        </div>
        <div class="hm-scroll">
          <div class="hm-grid" style="--weeks:${WEEKS};">
            <div class="hm-corner"></div>
            <div class="hm-months">${monthCells.map(m => `<span class="hm-month">${m}</span>`).join('')}</div>
            <div class="hm-weekdays">${wd.map(l => `<span class="hm-wd">${l}</span>`).join('')}</div>
            <div class="hm-weeks">
              ${weeks.map(col => `<div class="hm-week">${col.map(c =>
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
        </div>
      </div>
    </div>`;
}

/* ── Burndown do mês (ideal × real) ── */
function renderBurndown(ctx) {
  const me = state.currentUser?.name || '';
  const srcCards = (ctx && ctx.allCards) || state.cards;
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const monthStart = new Date(y, m, 1);
  const monthEnd = new Date(y, m, daysInMonth);
  // escopo: cards do usuário (todas as equipes) com vencimento neste mês
  const scope = srcCards.filter(c => !c.archived && c.assignee === me && c.dueDate
    && new Date(c.dueDate) >= monthStart && new Date(c.dueDate) <= monthEnd);
  const total = scope.length;
  if (!total) {
    return `
      <div class="mp-section" style="margin-bottom:14px;">
        <div class="mp-section-header"><h3 class="mp-section-title">📉 Burndown do mês</h3></div>
        <div class="mp-section-body"><div class="mp-empty">Sem entregas com prazo neste mês.</div></div>
      </div>`;
  }
  const doneByDay = new Array(daysInMonth + 1).fill(0);
  scope.forEach(c => {
    if (isDoneCol(c.columnId)) {
      const dt = c.completedAt || c.updatedAt || c.dueDate;
      const day = Math.min(daysInMonth, Math.max(1, new Date(dt).getDate()));
      if (new Date(dt).getMonth() === m && new Date(dt).getFullYear() === y) doneByDay[day]++;
      else doneByDay[1]++; // concluído antes deste mês
    }
  });
  const todayDay = now.getMonth() === m ? now.getDate() : daysInMonth;
  const W = 640, H = 200, padL = 34, padB = 24, padT = 12, padR = 12;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const x = (day) => padL + (plotW * (day-1) / (daysInMonth-1 || 1));
  const yv = (val) => padT + plotH * (1 - val/total);
  // ideal: linha de total→0
  const ideal = `M ${x(1)} ${yv(total)} L ${x(daysInMonth)} ${yv(0)}`;
  // real: remaining acumulado, só até hoje
  let remaining = total; const realPts = [`${x(1)},${yv(total)}`];
  for (let d = 1; d <= todayDay; d++) { remaining -= doneByDay[d] || 0; realPts.push(`${x(d)},${yv(Math.max(0,remaining))}`); }
  const concluded = total - remaining;
  const yGrid = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const val = Math.round(total*f);
    return `<line x1="${padL}" y1="${yv(val)}" x2="${W-padR}" y2="${yv(val)}" class="bd-grid"/><text x="${padL-6}" y="${yv(val)+3}" class="bd-axis" text-anchor="end">${val}</text>`;
  }).join('');
  return `
    <div class="mp-section" style="margin-bottom:14px;">
      <div class="mp-section-header">
        <h3 class="mp-section-title">📉 Burndown do mês</h3>
        <span class="mp-section-aside">${concluded}/${total} concluídos · ${Math.max(0,remaining)} restantes</span>
      </div>
      <div class="mp-section-body" style="overflow-x:auto;padding:16px 18px;">
        <svg class="burndown" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
          ${yGrid}
          <path d="${ideal}" class="bd-ideal"/>
          <polyline points="${realPts.join(' ')}" class="bd-real"/>
          <text x="${x(1)}" y="${H-6}" class="bd-axis">1</text>
          <text x="${x(daysInMonth)}" y="${H-6}" class="bd-axis" text-anchor="end">${daysInMonth}</text>
          ${todayDay<daysInMonth?`<line x1="${x(todayDay)}" y1="${padT}" x2="${x(todayDay)}" y2="${padT+plotH}" class="bd-today"/>`:''}
        </svg>
        <div class="bd-legend"><span class="bd-key bd-key-ideal"></span> Ideal <span class="bd-key bd-key-real"></span> Real</div>
      </div>
    </div>`;
}

function renderOverview(ctx) {
  const { myCards, allCards } = ctx;
  const last5 = state.notifications.slice(0, 6);
  const upcoming = myCards.filter(c => c.dueDate && !isDoneCol(c.columnId))
    .sort((a,b)=> new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 5);

  return `
    ${renderMyTeams()}
    ${heatmapSection(state.currentUser?.name || '', allCards)}
    ${renderGains(ctx)}
    ${renderBurndown(ctx)}
    <div class="mp-two-col">
      <div class="mp-section">
        <div class="mp-section-header">
          <h3 class="mp-section-title">📅 Próximas entregas</h3>
        </div>
        <div class="mp-section-body">
          ${upcoming.map(c => {
            const ov = new Date(c.dueDate + 'T23:59:59') < new Date();
            return `
              <div class="mp-card-row" data-card-id="${escapeHTML(c.id)}">
                <div class="mp-card-color" style="background:${c.priority==='urgente'?'var(--danger)':'var(--primary)'};"></div>
                <div class="mp-card-info">
                  <div class="mp-card-title">${escapeHTML(c.title)}</div>
                  <div class="mp-card-meta">
                    <span class="mp-due-badge ${ov?'overdue':'ok'}">${escapeHTML(fmtDate(c.dueDate))}</span>
                    <span>${escapeHTML(prioLabel(c.priority))}</span>
                  </div>
                </div>
              </div>`;
          }).join('') || '<div class="mp-empty">Sem entregas próximas.</div>'}
        </div>
      </div>

      <div class="mp-section">
        <div class="mp-section-header">
          <h3 class="mp-section-title">🔔 Notificações recentes</h3>
        </div>
        <div class="mp-section-body">
          ${last5.map(n => `
            <div class="mp-notif-row ${n.read?'':'unread'}">
              <div class="mp-notif-dot ${n.read?'read':''}"></div>
              <div class="mp-notif-body">
                <div class="mp-notif-text">${escapeHTML(n.message)}</div>
                <div class="mp-notif-meta">${escapeHTML(fmtSmart(n.timestamp, true))}</div>
              </div>
            </div>
          `).join('') || '<div class="mp-empty">Sem notificações.</div>'}
        </div>
      </div>
    </div>
  `;
}

/* ── 💰 Seus ganhos registrados (redesenhado) ── */
function renderGains(ctx) {
  const { myEcon, myHours, myEconAno, myHoursAno, cardsComGanho } = ctx;
  if (!(myEcon > 0 || myHours > 0)) {
    return `
      <div class="mp-section mp-gains" style="margin-bottom:14px;">
        <div class="mp-section-header"><h3 class="mp-section-title">💰 Seus ganhos registrados</h3></div>
        <div class="mp-section-body" style="padding:16px 18px;">
          <div class="mp-empty">Você ainda não registrou ganhos. Preencha <strong>economia</strong> ou <strong>horas poupadas</strong> nos seus cards para acompanhar o impacto aqui.</div>
        </div>
      </div>`;
  }
  // estimativa anual: usa o valor anual informado ou projeta ×12
  const econAno  = myEconAno  > 0 ? myEconAno  : myEcon  * 12;
  const horasAno = myHoursAno > 0 ? myHoursAno : myHours * 12;
  const tile = (cls, ico, label, value, sub) => `
    <div class="mp-gain-tile ${cls}">
      <div class="mp-gain-ico">${ico}</div>
      <div class="mp-gain-body">
        <div class="mp-gain-label">${label}</div>
        <div class="mp-gain-value">${value}</div>
        ${sub ? `<div class="mp-gain-sub">${sub}</div>` : ''}
      </div>
    </div>`;
  return `
    <div class="mp-section mp-gains" style="margin-bottom:14px;">
      <div class="mp-section-header">
        <h3 class="mp-section-title">💰 Seus ganhos registrados</h3>
        <span class="mp-section-aside">${cardsComGanho} card(s) com ganho</span>
      </div>
      <div class="mp-section-body" style="padding:16px 18px;">
        <div class="mp-gains-grid">
          ${tile('econ', '💵', 'Economia / mês', escapeHTML(fmtMoney(myEcon)), `≈ ${escapeHTML(fmtMoney(econAno))} / ano`)}
          ${tile('hours', '⏱️', 'Horas / mês', `${myHours.toFixed(myHours % 1 ? 1 : 0)}h`, `≈ ${horasAno.toFixed(0)}h / ano`)}
          ${tile('days', '📆', 'Dias úteis / ano', `${(horasAno/8).toFixed(0)}`, 'equivalente a 8h/dia')}
        </div>
      </div>
    </div>`;
}

function renderCards(ctx) {
  const { myCards } = ctx;
  if (!myCards.length) return `
    <div class="empty-state" style="padding:50px;">
      <div style="font-size:48px;margin-bottom:8px;">🗂️</div>
      <h3>Nenhum card por aqui ainda</h3>
      <p style="color:var(--text-muted);">Quando você for responsável por um card em qualquer equipe, ele aparece aqui.</p>
    </div>`;
  // Agrupa por EQUIPE (os cards podem vir de várias equipes na visão agregada)
  const teamsById = {};
  (state.teams || []).forEach(t => { teamsById[t.id] = t; });
  const byTeam = {};
  myCards.forEach(c => { (byTeam[c.teamId || '—'] = byTeam[c.teamId || '—'] || []).push(c); });
  // ordem: equipe ativa primeiro, depois alfabética
  const teamIds = Object.keys(byTeam).sort((a, b) => {
    if (a === state.currentTeamId) return -1;
    if (b === state.currentTeamId) return 1;
    return (teamsById[a]?.name || '').localeCompare(teamsById[b]?.name || '');
  });
  const row = (c) => {
    const done = isDoneCol(c.columnId);
    const ov = c.dueDate && !done && new Date(c.dueDate + 'T23:59:59') < new Date();
    const badge = c.dueDate ? `<span class="mp-due-badge ${ov?'overdue':'ok'}">${escapeHTML(fmtDate(c.dueDate))}</span>` : '';
    return `
      <div class="mp-card-row${done?' is-done':''}" data-card-id="${escapeHTML(c.id)}">
        <div class="mp-card-color" style="background:${c.priority==='urgente'?'var(--danger)':c.priority==='alta'?'var(--warning)':'var(--primary)'};"></div>
        <div class="mp-card-info">
          <div class="mp-card-title">${done?'✓ ':''}${escapeHTML(c.title)}</div>
          <div class="mp-card-meta">
            <span>${escapeHTML(prioLabel(c.priority))}</span>
            ${badge}
            ${(c.tags||[]).slice(0,2).map(t=>`<span class="chip">#${escapeHTML(t)}</span>`).join('')}
          </div>
        </div>
        <div class="mp-card-progress"><div class="mp-card-progress-fill" style="width:${c.progress||0}%"></div></div>
      </div>`;
  };
  return `
    <div class="mp-section">
      <div class="mp-section-body" style="padding:0;">
        ${teamIds.map(tid => {
          const t = teamsById[tid];
          const list = byTeam[tid].slice().sort((a,b) => Number(isDoneCol(a.columnId)) - Number(isDoneCol(b.columnId)));
          return `
            <div class="mp-col-group">${escapeHTML(t?.icon || '👥')} ${escapeHTML(t?.name || 'Equipe')} · ${list.length}</div>
            ${list.map(row).join('')}`;
        }).join('')}
      </div>
    </div>`;
}

function renderArchived(ctx) {
  const { myArchived } = ctx;
  if (!myArchived.length) {
    return `
      <div class="empty-state" style="padding:50px;">
        <div style="font-size:48px;margin-bottom:8px;">📦</div>
        <h3>Você não tem cards arquivados</h3>
        <p style="color:var(--text-muted);">Cards que <strong>você</strong> arquivar aparecem aqui. Os arquivados por outras pessoas ficam invisíveis para você.</p>
      </div>`;
  }
  return `
    <div class="mp-section">
      <div class="mp-section-header">
        <h3 class="mp-section-title">📦 Seus cards arquivados</h3>
        <span style="font-size:11px;color:var(--text-muted);">Apenas você vê estes</span>
      </div>
      <div class="mp-section-body">
        ${myArchived.map(c => `
          <div class="mp-card-row" data-card-id="${escapeHTML(c.id)}" style="opacity:.85;">
            <div class="mp-card-color" style="background:var(--text-soft);"></div>
            <div class="mp-card-info">
              <div class="mp-card-title">${escapeHTML(c.title)}</div>
              <div class="mp-card-meta">
                <span style="color:var(--text-muted);">📦 Arquivado ${escapeHTML(fmtSmart(c.archivedAt, true))}</span>
                ${c.dueDate ? `<span>📅 ${escapeHTML(fmtDate(c.dueDate))}</span>` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
}

function roleTabIcon(role) {
  if (role === 'ti') return `<img class="mp-tab-ico" src="imagens/icones/painel-ti.webp" alt="" aria-hidden="true">`;
  return { gestor: '👔', analista: '📊', visitante: '👀' }[role] || '👤';
}
function roleTabTitle(role) {
  return { ti: 'Painel TI', gestor: 'Painel Gestor', analista: 'Resumo Analista', visitante: 'Acesso' }[role] || 'Específico';
}

function renderRoleTab(role, me) {
  if (role === 'ti') {
    const pendingRR = 0; // backend retorna no admin
    const totalUsers = Object.keys(state.users || {}).length;
    const totalCards = state.cards.filter(c => !c.archived).length;
    const colsCount = state.columns.length;
    const maint = state.maintenanceMode?.enabled ? 'ATIVA' : 'desligada';
    return `
      <div class="mp-section" style="margin-top:14px;">
        <div class="mp-section-header"><h3 class="mp-section-title">🛡️ Atalhos de administração</h3></div>
        <div class="mp-section-body" style="padding:18px 22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;">
          <div class="mp-role-stat"><div class="mp-role-label">Usuários cadastrados</div><div class="mp-role-value">${totalUsers}</div></div>
          <div class="mp-role-stat"><div class="mp-role-label">Cards no sistema</div><div class="mp-role-value">${totalCards}</div></div>
          <div class="mp-role-stat"><div class="mp-role-label">Colunas configuradas</div><div class="mp-role-value">${colsCount}</div></div>
          <div class="mp-role-stat"><div class="mp-role-label">Modo manutenção</div><div class="mp-role-value" style="font-size:14px;">${maint}</div></div>
        </div>
        <div style="padding:0 22px 18px;">
          <a href="admin.php" class="btn btn-primary" style="margin-right:8px;">⚙️ Abrir admin</a>
          <button class="btn btn-secondary" data-goto-view="equipes">👥 Ir para Equipes</button>
          <button class="btn btn-secondary" data-goto-view="usuarios">👤 Usuários</button>
        </div>
      </div>`;
  }
  if (role === 'gestor') {
    const pendingApproval = state.cards.filter(c => !c.archived && c.awaitingApproval).length;
    // Equipes que o usuário gerencia (gestor ou TI da equipe), exceto pessoais
    const managed = (state.teams || []).filter(t =>
      t.type !== 'personal' && ['gestor','ti'].includes(t.my_role));
    const teamsBlock = managed.length ? `
      <div style="margin-top:18px;">
        <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;margin-bottom:8px;">Equipes que você gerencia</div>
        <div class="mp-team-manage-list">
          ${managed.map(t => `
            <div class="mp-team-manage-row">
              <span class="mp-team-manage-ic">${escapeHTML(t.icon || '👥')}</span>
              <span class="mp-team-manage-name">${escapeHTML(t.name)}</span>
              <span class="mp-team-manage-role">${escapeHTML((TEAM_ROLE_LABEL[t.my_role] || t.my_role).toUpperCase())}</span>
              <button class="btn btn-secondary btn-sm" data-users-team="${escapeHTML(t.name)}" title="Ver membros desta equipe">👥 Ver equipe</button>
            </div>`).join('')}
        </div>
      </div>` : `
      <div style="margin-top:14px;font-size:13px;color:var(--text-muted);">Você ainda não gerencia nenhuma equipe.</div>`;
    return `
      <div class="mp-section" style="margin-top:14px;">
        <div class="mp-section-header"><h3 class="mp-section-title">👔 Painel do Gestor</h3></div>
        <div class="mp-section-body" style="padding:18px 22px;">
          <div style="display:flex;gap:24px;flex-wrap:wrap;">
            <div>
              <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;">Aguardando aprovação</div>
              <div style="font-size:28px;font-weight:800;color:${pendingApproval?'var(--warning)':'var(--text)'};">${pendingApproval}</div>
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-muted);font-weight:700;text-transform:uppercase;">Você pode aprovar, arquivar e delegar</div>
              <div style="font-size:13px;color:var(--text-2);margin-top:4px;">Use o modal do card para tomar decisões. Atalho <kbd style="font-family:monospace;background:var(--surface-3);padding:1px 6px;border-radius:4px;">N</kbd> cria novo card.</div>
            </div>
          </div>
          ${teamsBlock}
          <div style="margin-top:16px;">
            <button class="btn btn-primary" data-goto-view="board">📋 Ir ao Quadro</button>
          </div>
        </div>
      </div>`;
  }
  if (role === 'analista') {
    return `
      <div class="mp-section" style="margin-top:14px;">
        <div class="mp-section-header"><h3 class="mp-section-title">📊 Resumo do Analista</h3></div>
        <div class="mp-section-body" style="padding:18px 22px;">
          <p style="font-size:13px;color:var(--text-2);line-height:1.6;">
            Como <strong>Analista</strong>, você pode <strong>criar e editar cards</strong>, mover entre colunas,
            adicionar subtarefas, comentar e marcar progresso. Para arquivar ou aprovar, peça a um Gestor.
          </p>
          <div style="margin-top:12px;">
            <button class="btn btn-primary" data-goto-view="board">+ Criar card no Quadro</button>
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin-top:10px;line-height:1.5;">
            💡 As promoções de nível acontecem <strong>dentro de cada equipe</strong>: o gestor ou o TI da equipe ajusta seu cargo em <em>Equipes › Gerenciar › Membros</em>.
          </p>
        </div>
      </div>`;
  }
  return '';
}
