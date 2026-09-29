/* ═══ SyncroFlow — js/views/usuarios.js (v12)
   Lista todos os usuários do sistema. Gestor convida para suas
   equipes; TI adiciona direto (bypass). */
import { state } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { api } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { openModal, closeModal } from '../ui/modal.js';
import { TROPHIES_DEF, RARITY_COLORS, getUnlockedTrophies, getUnlockedTitles } from '../core/trophies.js';
import { getTeamTrophies, TEAM_TROPHY_RARITY } from '../core/team-trophies.js';
import { heatmapHTML } from '../ui/heatmap.js';

const ROLE_COLOR = {
  ti:        { bg: 'var(--info-soft)',    color: 'var(--info)' },
  suporte:   { bg: 'var(--primary-soft)', color: 'var(--primary)' },
  gestor:    { bg: 'var(--success-soft)', color: 'var(--success)' },
  analista:  { bg: 'var(--warning-soft)', color: 'var(--warning)' },
  visitante: { bg: 'var(--surface-3)',    color: 'var(--text-muted)' },
};
const ROLE_LABEL_MAP = { ti:'TI – Dev', suporte:'TI - Sup', gestor:'Gestor', analista:'Analista', visitante:'Visitante' };
const SPECIAL_ROLES = ['ti','suporte']; // únicos que têm badge global sempre
const fmtBR = (iso) => { if (!iso) return ''; const [y,m,d] = String(iso).split('-'); return d && m && y ? `${d}/${m}/${y}` : iso; };

export const usuarios = {
  async render(mount) {
    mount.innerHTML = `<div class="boot-loader">Carregando usuários…</div>`;
    let users = [], myTeams = [];
    try {
      users   = (await api.call('teams.php', 'users', {}, 'GET')).users || [];
      myTeams = (state.teams || []).filter(t => t.type !== 'personal' && (t.my_role === 'gestor' || t.my_role === 'ti' || ['ti','suporte'].includes(state.currentUser?.role)));
    } catch (e) { mount.innerHTML = `<div class="empty-state"><h3>Erro</h3><p>${escapeHTML(e.message)}</p></div>`; return; }

    const role = state.currentUser?.role;
    const canInvite = (['ti','suporte','gestor'].includes(role)) && myTeams.length > 0;

    // equipes disponíveis no filtro (união das equipes que têm membros)
    const teamSet = new Map();
    users.forEach(u => (u.teamRoles||[]).forEach(tr => { if (!teamSet.has(tr.team)) teamSet.set(tr.team, tr.icon||'👥'); }));
    const teamNames = [...teamSet.keys()].sort((a,b)=>a.localeCompare(b));

    let filterTeam = '';
    let q = '';
    // Filtro pré-selecionado vindo do "Ver equipe" do Painel do Gestor
    const pendingTeam = sessionStorage.getItem('usuarios_filter_team');
    if (pendingTeam) {
      sessionStorage.removeItem('usuarios_filter_team');
      if (teamNames.includes(pendingTeam)) filterTeam = pendingTeam;
    }

    mount.innerHTML = `
      <div class="usr-page">
        <div class="usr-header">
          <div>
            <h1 class="usr-title">👤 Usuários</h1>
            <p class="usr-sub">${users.length} usuário(s) cadastrado(s) no sistema.</p>
          </div>
          <div class="usr-filters">
            <input class="input usr-search" id="usr-search" type="search" placeholder="🔍 Buscar por nome, ID ou cargo…">
            <select class="select usr-team-filter" id="usr-team">
              <option value="">🏢 Todas as equipes</option>
              ${teamNames.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(teamSet.get(t))} ${escapeHTML(t)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="usr-filter-note" id="usr-note"></div>
        <div class="usr-grid" id="usr-grid"></div>
      </div>`;

    const gridEl = mount.querySelector('#usr-grid');
    const noteEl = mount.querySelector('#usr-note');

    const renderGrid = () => {
      let list = users;
      if (filterTeam) list = list.filter(u => (u.teamRoles||[]).some(tr => tr.team === filterTeam));
      if (q) list = list.filter(u => ((u.display_name||u.name)+' '+u.user_id+' '+(u.job_title||'')+' '+(u.department||'')).toLowerCase().includes(q));
      noteEl.innerHTML = filterTeam
        ? `Mostrando <strong>${list.length}</strong> membro(s) de <strong>${escapeHTML(filterTeam)}</strong> e o cargo de cada um nessa equipe.`
        : `Filtre por equipe para ver o cargo de cada pessoa naquela equipe. Sem filtro, só TI–Dev e TI–Sup exibem distintivo.`;
      gridEl.innerHTML = list.map(u => userCard(u, canInvite, filterTeam)).join('')
        || `<div class="mp-empty" style="grid-column:1/-1;padding:30px;text-align:center;">Nenhum usuário encontrado.</div>`;
      gridEl.querySelectorAll('[data-invite]').forEach(b => b.onclick = () => openInviteModal(b.dataset.invite, myTeams));
      gridEl.querySelectorAll('[data-profile]').forEach(b => b.onclick = () => openProfileModal(b.dataset.profile));
    };

    mount.querySelector('#usr-search').addEventListener('input', (e) => { q = e.target.value.toLowerCase().trim(); renderGrid(); });
    const teamSel = mount.querySelector('#usr-team');
    teamSel.addEventListener('change', (e) => { filterTeam = e.target.value; renderGrid(); });
    if (filterTeam) teamSel.value = filterTeam;   // reflete pré-seleção do Painel do Gestor
    renderGrid();
  }
};

const TEAM_ROLE_LABEL = { gestor:'Gestor', ti:'TI da equipe', analista:'Analista', visitante:'Visitante' };

async function openProfileModal(userId) {
  let data;
  try { data = await api.call('users.php', 'profile', { user_id: userId }, 'GET'); }
  catch (e) { toast(e.message, 'error'); return; }
  const u = data.user, teams = data.teams || [], s = data.stats || {};
  const name = u.display_name || u.name;
  const initial = (name[0] || '?').toUpperCase();
  const rc = ROLE_COLOR[u.role] || ROLE_COLOR.visitante;
  const coverStyle = u.cover_url
    ? `background-image:linear-gradient(120deg,rgba(0,121,109,.82),rgba(14,42,42,.78)),url('${escapeHTML(u.cover_url)}');background-size:cover;background-position:center;`
    : `background:linear-gradient(120deg,var(--primary),var(--ink));`;
  const lastLogin = u.last_login ? new Date(u.last_login).toLocaleString('pt-BR') : '—';
  const since = u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '—';

  // Conquistas individuais (com base nos cards visíveis da equipe ativa)
  const unlocked = getUnlockedTrophies(u.name);
  const unlockedIds = new Set(unlocked.map(t => t.id));
  const titles = getUnlockedTitles(u.name);

  // Troféus de equipe das equipes do usuário (avaliados sobre stats do backend)
  const teamStats = data.teamStats || {};
  const teamTrophies = [];
  teams.forEach(t => {
    getTeamTrophies(teamStats[t.id]).forEach(tr => teamTrophies.push({ ...tr, teamName: t.name, teamIcon: t.icon }));
  });

  // ── Destaque do perfil (prateleira): até 3 conquistas + 2 troféus de equipe ──
  const isOwn = String(userId) === String(state.currentUser?.user_id || '');
  const trophyById = {}; TROPHIES_DEF.forEach(t => { trophyById[t.id] = t; });
  const teamTrophyById = {}; teamTrophies.forEach(t => { teamTrophyById[t.id] = t; });
  let showcase = { t: [], tt: [] };
  try { const sc = typeof u.showcase === 'string' ? JSON.parse(u.showcase || '{}') : (u.showcase || {}); showcase = { t: sc.t || [], tt: sc.tt || [] }; } catch {}
  // só mantém o que o usuário realmente possui
  const scT  = showcase.t.filter(id => unlockedIds.has(id) && trophyById[id]);
  const scTT = showcase.tt.filter(id => teamTrophyById[id]);
  const showcaseItems = [
    ...scT.map(id => { const t = trophyById[id]; const rc = RARITY_COLORS[t.rarity] || RARITY_COLORS.comum; return { icon: t.icon, name: t.name, color: rc.bg, sub: rc.label }; }),
    ...scTT.map(id => { const t = teamTrophyById[id]; const rc = TEAM_TROPHY_RARITY[t.rarity] || {}; return { icon: t.icon, name: t.name, color: rc.bg || 'var(--primary)', sub: (t.teamIcon||'') + ' ' + (t.teamName||'') }; }),
  ];
  const showcaseHTML = `
    <div class="prof-teams prof-showcase-wrap">
      <div class="form-section-title" style="display:flex;align-items:center;gap:8px;">
        ⭐ Destaque
        ${isOwn ? `<button class="btn btn-ghost btn-sm" id="prof-showcase-edit" style="margin-left:auto;">✏️ Editar destaque</button>` : ''}
      </div>
      ${showcaseItems.length ? `<div class="prof-showcase">
        ${showcaseItems.map(it => `<div class="prof-showcase-card" style="--sc:${it.color};" title="${escapeHTML(it.name)}">
          <div class="psc-icon">${it.icon}</div>
          <div class="psc-name">${escapeHTML(it.name)}</div>
          <div class="psc-sub">${escapeHTML(it.sub)}</div>
        </div>`).join('')}
      </div>` : `<div class="prof-showcase-empty">${isOwn ? 'Nenhum destaque ainda. Clique em “Editar destaque” para escolher até 3 conquistas e 2 troféus de equipe.' : 'Sem destaques selecionados.'}</div>`}
    </div>`;

  const trophyCard = (tr) => {
    const got = unlockedIds.has(tr.id);
    const rc = RARITY_COLORS[tr.rarity] || RARITY_COLORS.comum;
    const hidden = tr.hidden && !got;
    return `<div class="tt-card ${got?'tt-got':'tt-locked'}" title="${escapeHTML(hidden?'Conquista oculta':tr.description)}" style="${got?`--tt:${rc.bg};`:''}">
      <div class="tt-icon">${got?tr.icon:(hidden?'❓':'🔒')}</div>
      <div class="tt-name">${escapeHTML(hidden?'???':tr.name)}</div>
      <div class="tt-rarity" style="${got?`color:${rc.bg};`:''}">${rc.label}</div>
    </div>`;
  };

  openModal({
    title: `<span class="modal-title-kicker">Perfil</span><span style="color:var(--text);">${escapeHTML(name)}</span>`,
    body: `
      <div class="prof-cover" style="${coverStyle}">
        <div class="prof-avatar">${u.avatar_url ? `<img src="${escapeHTML(u.avatar_url)}">` : escapeHTML(initial)}</div>
      </div>
      <div class="prof-head">
        <div class="prof-name">${escapeHTML(name)}</div>
        <span class="role-badge" style="background:${rc.bg};color:${rc.color};">${escapeHTML(ROLE_LABEL_MAP[u.role] || (u.role||'').toUpperCase())}</span>
      </div>
      ${u.job_title || u.profile_title ? `<div class="prof-title">${escapeHTML(u.job_title || u.profile_title)}</div>` : ''}
      ${u.bio ? `<p class="prof-bio">${escapeHTML(u.bio)}</p>` : ''}
      <div class="prof-info-grid">
        ${u.department ? `<div><span>Área</span><strong>${escapeHTML(u.department)}</strong></div>` : ''}
        ${u.email ? `<div><span>Email</span><strong>${escapeHTML(u.email)}</strong></div>` : ''}
        <div><span>Membro desde</span><strong>${escapeHTML(since)}</strong></div>
        <div><span>Último acesso</span><strong>${escapeHTML(lastLogin)}</strong></div>
        <div><span>Logins</span><strong>${u.total_logins || 0}</strong></div>
      </div>
      <div class="prof-stats">
        <div class="prof-stat"><div class="prof-stat-val">${s.assigned||0}</div><div class="prof-stat-lbl">Cards ativos</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${s.done||0}</div><div class="prof-stat-lbl">Concluídos</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${s.teams||0}</div><div class="prof-stat-lbl">Equipes</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${s.comments||0}</div><div class="prof-stat-lbl">Comentários</div></div>
      </div>

      <div class="prof-teams">
        <div class="form-section-title">🔥 Atividade <span class="text-muted" style="font-weight:600;">(nesta equipe, últimas 26 semanas)</span></div>
        ${heatmapHTML(u.name, { compact: true })}
      </div>

      ${titles.length ? `
      <div class="prof-teams">
        <div class="form-section-title">🎖️ Títulos (${titles.length})</div>
        <div class="prof-titles">${titles.map(ti => `<span class="prof-title-chip" title="${escapeHTML(ti.condition||'')}">${escapeHTML(ti.name)}</span>`).join('')}</div>
      </div>` : ''}

      ${showcaseHTML}

      <details class="prof-teams prof-ach-dd">
        <summary class="form-section-title prof-ach-sum">
          🏆 Conquistas <span class="text-muted" style="font-weight:600;">(${unlocked.length}/${TROPHIES_DEF.length})</span>
          <span class="prof-ach-caret">▾</span>
        </summary>
        <div class="prof-ach-body">
          ${['copa','lendario','epico','raro','incomum','comum','vergonha'].map(rar => {
            const items = TROPHIES_DEF.filter(t => t.rarity === rar);
            if (!items.length) return '';
            const meta = RARITY_COLORS[rar] || RARITY_COLORS.comum;
            const ico = { copa:'⚽', lendario:'👑', epico:'💎', raro:'⭐', incomum:'🔷', comum:'⚪', vergonha:'💀' }[rar] || '🏆';
            const gotN = items.filter(t => unlockedIds.has(t.id)).length;
            return `<div class="prof-ach-group">
              <div class="prof-ach-rar" style="border-left:3px solid ${meta.bg};">${ico} ${escapeHTML(meta.label)} <span class="text-muted">${gotN}/${items.length}</span></div>
              <div class="tt-grid tt-grid-sm">${items.map(trophyCard).join('')}</div>
            </div>`;
          }).join('')}
        </div>
      </details>

      ${teamTrophies.length ? `
      <div class="prof-teams">
        <div class="form-section-title">🥇 Troféus de equipe (${teamTrophies.length})</div>
        <div class="tt-grid tt-grid-sm">
          ${teamTrophies.map(tr => {
            const rc = TEAM_TROPHY_RARITY[tr.rarity];
            return `<div class="tt-card tt-got" title="${escapeHTML(tr.description)}" style="--tt:${rc.bg};">
              <div class="tt-icon">${tr.icon}</div>
              <div class="tt-name">${escapeHTML(tr.name)}</div>
              <div class="tt-rarity" style="color:${rc.bg};">${escapeHTML(tr.teamIcon||'')} ${escapeHTML(tr.teamName)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <div class="prof-teams">
        <div class="form-section-title">🏢 Equipes (${teams.length})</div>
        ${teams.length ? teams.map(t => `
          <div class="prof-team-row">
            <span class="prof-team-icon" style="background:${escapeHTML(t.color||'#00796D')}22;color:${escapeHTML(t.color||'#00796D')};">${escapeHTML(t.icon||'👥')}</span>
            <span style="flex:1;">${escapeHTML(t.name)}</span>
            <span class="text-muted" style="font-size:12px;">${escapeHTML(TEAM_ROLE_LABEL[t.my_role]||t.my_role)}</span>
          </div>`).join('') : '<div class="mp-empty">Não participa de equipes públicas.</div>'}
      </div>`,
    footer: `<button class="btn btn-secondary" data-close>Fechar</button>`,
  });

  // Editor de destaque (só no próprio perfil)
  if (isOwn) {
    const editBtn = document.getElementById('prof-showcase-edit');
    if (editBtn) editBtn.onclick = () => openShowcaseEditor({
      ownedTrophies: unlocked,                 // conquistas que o usuário tem
      teamTrophies,                            // troféus de equipe do usuário
      current: { t: scT.slice(), tt: scTT.slice() },
      onSaved: () => openProfileModal(userId),  // reabre o perfil já atualizado
    });
  }
}

/* Editor da prateleira de destaque: até 3 conquistas + 2 troféus de equipe,
   selecionados na ordem em que são clicados (a ordem é o destaque). */
function openShowcaseEditor({ ownedTrophies, teamTrophies, current, onSaved }) {
  const selT = current.t.slice();      // ids de conquistas (máx 3)
  const selTT = current.tt.slice();    // ids de troféus de equipe (máx 2)

  const tCard = (t) => {
    const rc = RARITY_COLORS[t.rarity] || RARITY_COLORS.comum;
    const idx = selT.indexOf(t.id);
    return `<button type="button" class="sce-card ${idx>=0?'sel':''}" data-kind="t" data-id="${escapeHTML(t.id)}" style="--sc:${rc.bg};" title="${escapeHTML(t.name)}">
      ${idx>=0?`<span class="sce-order">${idx+1}</span>`:''}
      <span class="sce-ico">${t.icon}</span><span class="sce-nm">${escapeHTML(t.name)}</span></button>`;
  };
  const ttCard = (t) => {
    const rc = TEAM_TROPHY_RARITY[t.rarity] || {};
    const idx = selTT.indexOf(t.id);
    return `<button type="button" class="sce-card ${idx>=0?'sel':''}" data-kind="tt" data-id="${escapeHTML(t.id)}" style="--sc:${rc.bg||'var(--primary)'};" title="${escapeHTML(t.name)}">
      ${idx>=0?`<span class="sce-order">${idx+1}</span>`:''}
      <span class="sce-ico">${t.icon}</span><span class="sce-nm">${escapeHTML(t.name)}</span></button>`;
  };

  const body = () => `
    <p class="sce-hint">Clique para selecionar/ordenar. Máximo: <strong>3 conquistas</strong> + <strong>2 troféus de equipe</strong>. A ordem do clique é a ordem exibida.</p>
    <div class="sce-section-t">🏆 Conquistas <span class="text-muted">(${selT.length}/3)</span></div>
    <div class="sce-grid">${ownedTrophies.map(tCard).join('') || '<div class="mp-empty">Nenhuma conquista desbloqueada ainda.</div>'}</div>
    <div class="sce-section-t" style="margin-top:14px;">🥇 Troféus de equipe <span class="text-muted">(${selTT.length}/2)</span></div>
    <div class="sce-grid">${teamTrophies.map(ttCard).join('') || '<div class="mp-empty">Nenhum troféu de equipe ainda.</div>'}</div>`;

  openModal({
    wide: true,
    title: `<span class="modal-title-kicker">Perfil</span><span style="color:var(--text);">Editar destaque</span>`,
    body: body(),
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="sce-save">Salvar destaque</button>`,
  });

  const refresh = () => { const b = document.querySelector('.modal-body'); if (b) { b.innerHTML = body(); wire(); } };
  function wire() {
    document.querySelectorAll('.sce-card').forEach(btn => btn.onclick = () => {
      const id = btn.dataset.id, arr = btn.dataset.kind === 't' ? selT : selTT, cap = btn.dataset.kind === 't' ? 3 : 2;
      const i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1);
      else { if (arr.length >= cap) { toast(`Máximo de ${cap} nesta categoria.`, 'warn'); return; } arr.push(id); }
      refresh();
    });
  }
  wire();
  document.getElementById('sce-save').onclick = async () => {
    try {
      await api.call('achievements.php', 'set_showcase', { t: selT, tt: selTT });
      toast('Destaque atualizado.', 'success');
      closeModal(true);
      onSaved && onSaved();
    } catch (e) { toast(e.message, 'error'); }
  };
}

function userCard(u, canInvite, filterTeam = '') {
  const name = u.display_name || u.name;
  const initial = (name[0] || '?').toUpperCase();
  const avatar = u.avatar_url
    ? `<img src="${escapeHTML(u.avatar_url)}" alt="" class="usr-avatar-img">`
    : `<div class="usr-avatar">${escapeHTML(initial)}</div>`;
  const isMe = u.user_id === state.currentUser?.user_id;
  const subtitle = u.job_title || u.department || '';
  const tr = Array.isArray(u.teamRoles) ? u.teamRoles : [];

  // ── Badge principal ──
  // Com filtro de equipe: cargo NAQUELA equipe.
  // Sem filtro: só papéis especiais do sistema (TI–Dev / TI–Sup); padrão = sem badge.
  let badge = '';
  if (filterTeam) {
    const m = tr.find(x => x.team === filterTeam);
    if (m) badge = `<span class="role-badge ${teamRoleBadge(m.role)} usr-global-role">${escapeHTML(TEAM_ROLE_LABEL[m.role] || m.role)}</span>`;
  } else if (u.role === 'ti') {
    badge = `<span class="role-badge usr-badge-dev usr-global-role">⭐ TI – Dev</span>`;
  } else if (u.role === 'suporte') {
    badge = `<span class="role-badge usr-badge-sup usr-global-role">🛡️ TI - Sup</span>`;
  }

  // chips de cargo por equipe (destaca a equipe filtrada)
  const shown = tr.slice(0, 3);
  const extra = tr.length - shown.length;
  const teamChips = tr.length
    ? `<div class="usr-teamroles">
        ${shown.map(x => `<span class="usr-tr-chip ${teamRoleBadge(x.role)} ${x.team===filterTeam?'is-filtered':''}" title="${escapeHTML(x.team)} — ${escapeHTML(TEAM_ROLE_LABEL[x.role]||x.role)}">${escapeHTML(x.icon||'👥')} ${escapeHTML(x.team)} · ${escapeHTML(TEAM_ROLE_LABEL[x.role]||x.role)}</span>`).join('')}
        ${extra>0 ? `<span class="usr-tr-more">+${extra}</span>` : ''}
      </div>`
    : `<div class="usr-teamroles"><span class="usr-tr-none">Sem equipes</span></div>`;

  const onVac = !!u.on_vacation;
  const vacChip = onVac
    ? `<span class="usr-vac" title="De férias${u.vacation_until ? ` até ${escapeHTML(fmtBR(u.vacation_until))}` : ''}">🏖️ De férias${u.vacation_until ? ` · até ${escapeHTML(fmtBR(u.vacation_until))}` : ''}</span>`
    : '';

  return `
    <div class="usr-card${onVac ? ' on-vac' : ''}">
      <div class="usr-card-head">
        ${avatar}
        <div class="usr-info">
          <div class="usr-name">${escapeHTML(name)}${isMe?' <span class="usr-you">(você)</span>':''}</div>
          <div class="usr-id">ID ${escapeHTML(u.user_id)}${subtitle?` · ${escapeHTML(subtitle)}`:''}</div>
        </div>
        ${badge}
      </div>
      ${vacChip}
      ${teamChips}
      <div class="usr-card-actions">
        <button class="btn btn-sm btn-ghost" data-profile="${escapeHTML(u.user_id)}" title="Ver perfil">👁 Perfil</button>
        ${(canInvite && !isMe) ? `<button class="btn btn-sm btn-secondary" data-invite="${escapeHTML(u.user_id)}" title="Convidar para equipe">＋ Equipe</button>` : ''}
      </div>
    </div>`;
}

function teamRoleBadge(r){ return r==='gestor'?'role-gestor':r==='ti'?'role-ti':r==='visitante'?'role-visitante':'role-analista'; }

function openInviteModal(userId, myTeams) {
  const isTI = state.currentUser?.role === 'ti';
  openModal({
    title: `<span class="modal-title-kicker">${isTI ? 'Adicionar' : 'Convidar'}</span><span style="color:var(--text);">Vincular à equipe</span>`,
    body: `
      <div class="field">
        <label>Equipe</label>
        <select class="select" id="inv-team">
          ${myTeams.map(t => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.icon||'👥')} ${escapeHTML(t.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Papel na equipe</label>
        <select class="select" id="inv-role">
          <option value="analista">Analista (cria e edita cards)</option>
          <option value="ti">TI da equipe (gerencia + suporte)</option>
          <option value="gestor">Gestor (gerencia a equipe)</option>
          <option value="visitante">Visitante (só vê)</option>
        </select>
      </div>
      <p style="font-size:12px;color:var(--text-muted);">
        ${isTI ? 'Como TI, o usuário é adicionado <strong>imediatamente</strong> (bypass).'
               : 'O usuário receberá um convite e precisa aceitar.'}
      </p>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="inv-send">${isTI?'Adicionar':'Enviar convite'}</button>`,
  });
  document.getElementById('inv-send').onclick = async () => {
    const team_id = document.getElementById('inv-team').value;
    const role = document.getElementById('inv-role').value;
    try {
      if (isTI) await api.call('teams.php', 'add_member', { team_id, user_id: userId, role });
      else      await api.call('teams.php', 'invite', { team_id, user_id: userId, role });
      toast(isTI ? 'Usuário adicionado à equipe.' : 'Convite enviado.', 'success');
      closeModal(true);
    } catch (e) { toast(e.message, 'error'); }
  };
}
