/* ═══ SyncroFlow — js/views/equipes.js (v13)
   Lista equipes (cards com capa/avatar), criar, pedir entrada, abrir
   quadro e GERENCIAR (Geral · Membros · Histórico). */
import { state, switchTeam } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { api } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { openModal, closeModal } from '../ui/modal.js';
import { confirmDialog } from '../ui/confirm.js';
import { switchView } from '../core/router.js';
import { activityHTML, wireActivity } from './activity.js';
import { getTeamTrophies, TEAM_TROPHIES, TEAM_TROPHY_RARITY } from '../core/team-trophies.js';

const TEAM_ROLES = { gestor:'Gestor', ti:'TI da equipe', analista:'Analista', visitante:'Visitante' };
const roleLabel = (r) => TEAM_ROLES[r] || r;
const roleBadgeClass = (r) => r === 'gestor' ? 'role-gestor' : r === 'ti' ? 'role-ti' : r === 'visitante' ? 'role-visitante' : 'role-analista';

/* Filtro de categoria (persiste na sessão). Default: Coordenação. */
const TAG_FILTER_KEY = 'syncro_team_tag_filter';
function getTagFilter() { try { return localStorage.getItem(TAG_FILTER_KEY) || 'tag-coordenacao'; } catch { return 'tag-coordenacao'; } }
function setTagFilter(v) { try { localStorage.setItem(TAG_FILTER_KEY, v); } catch {} }
function tagBadgesHTML(tags) {
  if (!tags || !tags.length) return '';
  return `<div class="eqs-tags">${tags.map(tg =>
    `<span class="eqs-tag" style="--tag:${escapeHTML(tg.color || '#00796D')};">${escapeHTML(tg.name)}</span>`).join('')}</div>`;
}

export const equipes = {
  async render(mount) {
    mount.innerHTML = `<div class="boot-loader">Carregando equipes…</div>`;
    let teams = [], allTags = [];
    try {
      const d = await api.call('teams.php', 'all_teams', {}, 'GET');
      teams = d.teams || [];
    } catch (e) { mount.innerHTML = `<div class="empty-state"><h3>Erro</h3><p>${escapeHTML(e.message)}</p></div>`; return; }
    try { const tg = await api.call('teams.php', 'tags_list', {}, 'GET'); allTags = tg.tags || []; } catch {}

    const role = state.currentUser?.role;
    const canCreate = !!role && role !== 'visitante';   // qualquer usuário (não-visitante) pode criar equipe
    const isTIglobal = role === 'ti' || role === 'suporte';  // só TI define os NOMES das categorias
    const myId = state.currentUser?.user_id;
    const personal = teams.find(t => t.type === 'personal' && (t.id === 'personal-' + myId || t.owner_user_id === myId));

    // Filtro por categoria (chips). Se a categoria salva não existe mais, cai para "Todas".
    let activeTag = getTagFilter();
    if (activeTag !== 'all' && !allTags.some(t => t.id === activeTag)) activeTag = 'all';
    const matchTag = (t) => activeTag === 'all' || (t.tags || []).some(tg => tg.id === activeTag);
    const mine   = teams.filter(t => t.is_member && t.type !== 'personal' && matchTag(t));
    const others = teams.filter(t => !t.is_member && t.type !== 'personal' && matchTag(t));
    const filterBar = `
      <div class="eqs-tagbar">
        <button class="eqs-chip ${activeTag==='all'?'on':''}" data-tagf="all">Todas</button>
        ${allTags.map(tg => `<button class="eqs-chip ${activeTag===tg.id?'on':''}" data-tagf="${escapeHTML(tg.id)}" style="--tag:${escapeHTML(tg.color||'#00796D')};">${escapeHTML(tg.name)}</button>`).join('')}
        ${isTIglobal ? `<button class="eqs-chip eqs-chip-manage" id="eq-tagmgr" title="Criar/editar categorias">⚙ Categorias</button>` : ''}
      </div>`;

    mount.innerHTML = `
      <div class="eqs-page">
        <div class="eqs-header">
          <div>
            <h1 class="eqs-title">👥 Equipes</h1>
            <p class="eqs-sub">Participe de equipes, peça entrada ou crie a sua.</p>
          </div>
          <div class="eqs-header-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
            ${canCreate ? `<button class="btn btn-primary" id="eq-create">＋ Criar equipe</button>` : ''}
          </div>
        </div>

        ${filterBar}

        ${personal ? `
        <div class="eqs-section-label">📌 Meu Quadro</div>
        <div class="eqs-grid">
          <div class="eqs-card" style="--team-color:#6244A0;">
            <div class="eqs-cover" style="background:linear-gradient(135deg,#6244A0 0%,var(--ink) 120%);">
              <span class="eqs-cover-icon">👤</span>
            </div>
            <div class="eqs-colorbar"></div>
            <div class="eqs-body">
              <div class="eqs-card-title">${escapeHTML(personal.name || 'Meu Quadro')}</div>
              <div class="eqs-card-desc">Seu quadro pessoal. Configure colunas e campos do card só para você (obrigatório, oculto, etc.).</div>
              <div class="eqs-actions">
                <button class="btn btn-sm btn-primary" data-open="${escapeHTML(personal.id)}">Abrir quadro</button>
                <button class="btn btn-sm btn-ghost" data-manage="${escapeHTML(personal.id)}">⚙ Configurar</button>
              </div>
            </div>
          </div>
        </div>` : ''}

        <div class="eqs-section-label" style="margin-top:22px;">Minhas equipes (${mine.length})</div>
        <div class="eqs-grid">
          ${mine.map(t => card(t, role)).join('') || `<div class="mp-empty">Você ainda não participa de nenhuma equipe. Peça entrada em uma abaixo${canCreate ? ' ou crie a sua' : ''}.</div>`}
        </div>

        ${others.length ? `
          <div class="eqs-section-label" style="margin-top:22px;">Outras equipes (${others.length})</div>
          <div class="eqs-grid">${others.map(t => card(t, role)).join('')}</div>` : ''}
      </div>`;

    if (canCreate) mount.querySelector('#eq-create').onclick = () => openCreateModal(mount, allTags);
    mount.querySelectorAll('[data-tagf]').forEach(b => b.onclick = () => {
      setTagFilter(b.dataset.tagf); equipes.render(mount);
    });
    const tagMgrBtn = mount.querySelector('#eq-tagmgr');
    if (tagMgrBtn) tagMgrBtn.onclick = () => openTagManager(mount, allTags);
    mount.querySelectorAll('[data-open]').forEach(b => b.onclick = async () => {
      try { await switchTeam(b.dataset.open); switchView('board'); toast('Quadro aberto.', 'success'); }
      catch (e) { toast(e.message, 'error'); }
    });
    mount.querySelectorAll('[data-join]').forEach(b => b.onclick = async () => {
      try { await api.call('teams.php', 'request_join', { team_id: b.dataset.join });
        toast('Pedido enviado ao gestor da equipe.', 'success'); this.render(mount); }
      catch (e) { toast(e.message, 'error'); }
    });
    mount.querySelectorAll('[data-manage]').forEach(b => b.onclick = () => openManageModal(b.dataset.manage, mount));
    mount.querySelectorAll('[data-profile]').forEach(b => b.onclick = () => openTeamProfileModal(b.dataset.profile, mount));
    mount.querySelectorAll('[data-leave]').forEach(b => b.onclick = async () => {
      const ok = await confirmDialog({ title:'Sair da equipe', message:'Tem certeza que deseja sair desta equipe? Você perderá o acesso ao quadro dela.', confirmText:'Sair', cancelText:'Cancelar', danger:true });
      if (!ok) return;
      try { await api.call('teams.php', 'leave', { team_id: b.dataset.leave }); toast('Você saiu da equipe.', 'info'); equipes.render(mount); }
      catch (e) { toast(e.message, 'error'); }
    });
    // Menu "⋯" por card de equipe (abre um, fecha os outros; fecha ao clicar fora)
    mount.querySelectorAll('.eqs-more-btn').forEach(btn => btn.onclick = (e) => {
      e.stopPropagation();
      const pop = mount.querySelector(`[data-morepop="${CSS.escape(btn.dataset.moreid)}"]`);
      const willOpen = pop && pop.hidden;
      mount.querySelectorAll('.eqs-more-pop').forEach(p => p.hidden = true);
      mount.querySelectorAll('.eqs-more-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
      if (pop) { pop.hidden = !willOpen; btn.setAttribute('aria-expanded', String(willOpen)); }
    });
    mount.querySelectorAll('.eqs-more-pop .bmp-item').forEach(it => it.addEventListener('click', () =>
      mount.querySelectorAll('.eqs-more-pop').forEach(p => p.hidden = true)));
    if (mount._eqMoreDoc) document.removeEventListener('click', mount._eqMoreDoc);
    mount._eqMoreDoc = () => { mount.querySelectorAll('.eqs-more-pop').forEach(p => p.hidden = true); mount.querySelectorAll('.eqs-more-btn').forEach(b => b.setAttribute('aria-expanded', 'false')); };
    document.addEventListener('click', mount._eqMoreDoc);
  }
};

/* ═══ Perfil da Equipe (overview público — sem cards) ═══ */
async function openTeamProfileModal(teamId, mount) {
  let data;
  try { data = await api.call('teams.php', 'profile', { id: teamId }, 'GET'); }
  catch (e) { toast(e.message, 'error'); return; }
  const t = data.team, members = data.members || [], s = data.stats || {};
  const earned = getTeamTrophies(s);
  const earnedIds = new Set(earned.map(x => x.id));
  const color = escapeHTML(t.color || '#00796D');
  const coverStyle = t.cover_url
    ? `background-image:linear-gradient(120deg,${color}cc,rgba(14,42,42,.6)),url('${escapeHTML(t.cover_url)}');background-size:cover;background-position:center;`
    : `background:linear-gradient(120deg,${color},var(--ink));`;
  const money = (v) => 'R$ ' + Number(v||0).toLocaleString('pt-BR');
  const pct = s.total ? Math.round((s.concluded / s.total) * 100) : 0;

  openModal({
    wide: true,
    title: `<span class="modal-title-kicker">Equipe</span><span style="color:var(--text);">${escapeHTML(t.name)}</span>`,
    body: `
      <div class="prof-cover" style="${coverStyle}">
        <div class="prof-avatar" style="font-size:34px;">${t.avatar_url ? `<img src="${escapeHTML(t.avatar_url)}">` : escapeHTML(t.icon||'👥')}</div>
      </div>
      <div class="prof-head">
        <div class="prof-name">${escapeHTML(t.name)}</div>
        ${data.my_role ? `<span class="role-badge ${roleBadgeClass(data.my_role)}">${escapeHTML(roleLabel(data.my_role))}</span>` : ''}
      </div>
      <p class="prof-bio">${escapeHTML(t.description || 'Sem descrição.')}</p>

      <div class="prof-stats">
        <div class="prof-stat"><div class="prof-stat-val">${s.concluded||0}</div><div class="prof-stat-lbl">Concluídos</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${s.active||0}</div><div class="prof-stat-lbl">Ativos</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${pct}%</div><div class="prof-stat-lbl">Taxa de conclusão</div></div>
        <div class="prof-stat"><div class="prof-stat-val">${s.members||0}</div><div class="prof-stat-lbl">Membros</div></div>
      </div>
      <div class="prof-info-grid">
        <div><span>Economia/mês</span><strong>${money(s.economyMonth)}</strong></div>
        <div><span>Horas/mês</span><strong>${(s.hoursMonth||0).toLocaleString('pt-BR')}h</strong></div>
        <div><span>Subtarefas feitas</span><strong>${s.subtasksDone||0}</strong></div>
        <div><span>Comentários</span><strong>${s.comments||0}</strong></div>
        <div><span>Atrasados</span><strong style="${s.overdue?'color:var(--danger);':''}">${s.overdue||0}</strong></div>
        <div><span>Idade</span><strong>${s.ageDays||0} dias</strong></div>
      </div>

      <div class="prof-teams">
        <div class="form-section-title">🏆 Troféus da equipe <span class="text-muted" style="font-weight:600;">(${earned.length}/${TEAM_TROPHIES.length})</span></div>
        <div class="tt-grid">
          ${TEAM_TROPHIES.map(tr => {
            const got = earnedIds.has(tr.id);
            const rc = TEAM_TROPHY_RARITY[tr.rarity];
            return `<div class="tt-card ${got?'tt-got':'tt-locked'}" title="${escapeHTML(tr.description)}" style="${got?`--tt:${rc.bg};`:''}">
              <div class="tt-icon">${got?tr.icon:'🔒'}</div>
              <div class="tt-name">${escapeHTML(tr.name)}</div>
              <div class="tt-rarity" style="${got?`color:${rc.bg};`:''}">${rc.label}</div>
              <div class="tt-desc">${escapeHTML(tr.description)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <div class="prof-teams">
        <div class="form-section-title">👥 Membros (${members.length})</div>
        ${members.map(m => `
          <div class="prof-team-row">
            <div class="avatar sm">${m.avatar_url?`<img src="${escapeHTML(m.avatar_url)}" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;">`:escapeHTML((m.name||'?')[0].toUpperCase())}</div>
            <span style="flex:1;">${escapeHTML(m.name)}${m.job_title?` <span class="text-muted" style="font-size:11px;">· ${escapeHTML(m.job_title)}</span>`:''}</span>
            <span class="role-badge ${roleBadgeClass(m.role)}">${escapeHTML(roleLabel(m.role))}</span>
          </div>`).join('')}
      </div>`,
    footer: `${data.my_role ? `<button class="btn btn-primary" id="tp-open">Abrir quadro</button>` : ''}<button class="btn btn-secondary" data-close>Fechar</button>`,
  });
  document.getElementById('tp-open')?.addEventListener('click', async () => {
    try { await switchTeam(teamId); closeModal(true); switchView('board'); } catch (e) { toast(e.message, 'error'); }
  });
}

function card(t, role) {
  const cover = t.cover_url
    ? `style="background-image:url('${escapeHTML(t.cover_url)}');background-size:cover;background-position:center;"`
    : `style="background:linear-gradient(135deg, ${escapeHTML(t.color||'#00796D')} 0%, var(--ink) 120%);"`;
  const canManage = role === 'ti' || t.my_role === 'gestor' || t.my_role === 'ti';
  return `
    <div class="eqs-card" style="--team-color:${escapeHTML(t.color||'#00796D')};">
      <div class="eqs-cover" ${cover}>
        <span class="eqs-cover-icon">${t.avatar_url ? `<img src="${escapeHTML(t.avatar_url)}" alt="">` : escapeHTML(t.icon || '👥')}</span>
      </div>
      <div class="eqs-colorbar" title="Cor da equipe"></div>
      <div class="eqs-body">
        <div class="eqs-card-title">${escapeHTML(t.name)}</div>
        ${tagBadgesHTML(t.tags)}
        <div class="eqs-card-desc">${escapeHTML(t.description || 'Sem descrição.')}</div>
        <div class="eqs-meta">
          <span title="Membros">👤 ${t.member_count}</span>
          <span title="Cards">🗂️ ${t.card_count}</span>
          ${t.managers && t.managers.length ? `<span title="Gestores">⭐ ${escapeHTML(t.managers.slice(0,2).join(', '))}</span>` : ''}
        </div>
        <div class="eqs-actions">
          ${t.is_member
            ? `<button class="btn btn-sm btn-primary" data-open="${escapeHTML(t.id)}">Abrir quadro</button>`
            : (t.has_pending
                ? `<button class="btn btn-sm btn-ghost" disabled>Pedido pendente…</button>`
                : `<button class="btn btn-sm btn-secondary" data-join="${escapeHTML(t.id)}">Pedir entrada</button>`)}
          ${t.is_member ? `<span class="role-badge ${roleBadgeClass(t.my_role)}" style="align-self:center;">${escapeHTML(roleLabel(t.my_role))}</span>` : ''}
          <div class="eqs-more-wrap">
            <button class="btn btn-sm btn-ghost eqs-more-btn" data-moreid="${escapeHTML(t.id)}" aria-haspopup="true" aria-expanded="false" title="Mais ações">⋯</button>
            <div class="eqs-more-pop board-manage-pop" data-morepop="${escapeHTML(t.id)}" hidden>
              <button class="bmp-item" data-profile="${escapeHTML(t.id)}">👁️ Ver equipe</button>
              ${canManage ? `<button class="bmp-item" data-manage="${escapeHTML(t.id)}">⚙️ Gerenciar</button>` : ''}
              ${(t.is_member && t.type === 'team' && t.owner_user_id !== (state.currentUser && state.currentUser.user_id))
                ? `<button class="bmp-item" data-leave="${escapeHTML(t.id)}" style="color:var(--danger);">🚪 Sair da equipe</button>` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

const TEAM_ICONS  = ['👥','🏢','🚀','📊','💡','🎯','⚙️','🛠️','🔬','📦','🌎','⚡','🧩','📈','🏗️','🛡️','💼','🤝','🧪','🔧'];
const TEAM_COLORS = ['#00796D','#2563EB','#7C3AED','#DB2777','#DC2626','#EA580C','#D97706','#16A34A','#0891B2','#475569'];

function openCreateModal(mount, allTags = []) {
  let icon = '👥', color = '#00796D';
  openModal({
    wide: true,
    // barreira: só pede confirmação se o usuário digitou nome/descrição
    guard: () => !!(document.getElementById('nt-name')?.value.trim() || document.getElementById('nt-desc')?.value.trim()),
    title: `<span class="modal-title-kicker">Nova equipe</span><span style="color:var(--text);">Criar equipe</span>`,
    body: `
      <div class="nt-grid">
        <div class="nt-form">
          <div class="field"><label>Nome da equipe *</label>
            <input class="input" id="nt-name" placeholder="Ex: Projeto Expansão Norte" maxlength="60" autocomplete="off">
          </div>
          <div class="field"><label>Descrição</label>
            <textarea id="nt-desc" rows="2" placeholder="O objetivo desta equipe…" maxlength="240"></textarea>
          </div>
          <div class="field"><label>Categoria</label>
            <select class="input" id="nt-tag">
              ${(allTags.length ? allTags : [{id:'tag-coordenacao',name:'Coordenação'}]).map(tg =>
                `<option value="${escapeHTML(tg.id)}" ${tg.id==='tag-coordenacao'?'selected':''}>${escapeHTML(tg.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Ícone</label>
            <div class="nt-icons" id="nt-icons">
              ${TEAM_ICONS.map((e,i) => `<button type="button" class="nt-icon ${i===0?'sel':''}" data-icon="${e}">${e}</button>`).join('')}
            </div>
          </div>
          <div class="field"><label>Cor</label>
            <div class="nt-colors" id="nt-colors">
              ${TEAM_COLORS.map((c,i) => `<button type="button" class="nt-color ${i===0?'sel':''}" data-color="${c}" style="background:${c};"></button>`).join('')}
            </div>
          </div>
        </div>
        <div class="nt-preview-wrap">
          <label class="nt-preview-label">Pré-visualização</label>
          <div class="eqs-card nt-preview">
            <div class="eqs-cover" id="nt-pv-cover" style="background:linear-gradient(135deg, ${color} 0%, var(--ink) 120%);">
              <span class="eqs-cover-icon" id="nt-pv-icon">${icon}</span>
            </div>
            <div class="eqs-body">
              <div class="eqs-card-title" id="nt-pv-name">Nome da equipe</div>
              <div class="eqs-card-desc" id="nt-pv-desc">Sem descrição.</div>
              <div class="eqs-meta"><span>👤 1</span><span>🗂️ 0</span><span>⭐ você</span></div>
            </div>
          </div>
          <p class="nt-hint">Você entra automaticamente como <strong>Gestor</strong> da equipe e poderá convidar pessoas, criar colunas e o mural.</p>
        </div>
      </div>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="nt-save">＋ Criar equipe</button>`,
  });

  const $ = (id) => document.getElementById(id);
  const updatePreview = () => {
    const name = $('nt-name').value.trim();
    const desc = $('nt-desc').value.trim();
    $('nt-pv-name').textContent = name || 'Nome da equipe';
    $('nt-pv-desc').textContent = desc || 'Sem descrição.';
    $('nt-pv-icon').textContent = icon;
    $('nt-pv-cover').style.background = `linear-gradient(135deg, ${color} 0%, var(--ink) 120%)`;
  };
  $('nt-name').addEventListener('input', updatePreview);
  $('nt-desc').addEventListener('input', updatePreview);
  $('nt-icons').querySelectorAll('[data-icon]').forEach(b => b.onclick = () => {
    icon = b.dataset.icon;
    $('nt-icons').querySelectorAll('.nt-icon').forEach(x => x.classList.toggle('sel', x===b));
    updatePreview();
  });
  $('nt-colors').querySelectorAll('[data-color]').forEach(b => b.onclick = () => {
    color = b.dataset.color;
    $('nt-colors').querySelectorAll('.nt-color').forEach(x => x.classList.toggle('sel', x===b));
    updatePreview();
  });
  $('nt-name').focus();

  $('nt-save').onclick = async () => {
    const name = $('nt-name').value.trim();
    if (!name) { toast('Informe o nome da equipe.', 'warn'); $('nt-name').focus(); return; }
    const btn = $('nt-save'); btn.disabled = true;
    try {
      await api.call('teams.php', 'create', {
        name, description: $('nt-desc').value.trim(), icon, color,
        tag_id: $('nt-tag')?.value || 'tag-coordenacao',
      });
      toast('Equipe criada!', 'success');
      closeModal(true);
      equipes.render(mount);
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; }
  };
}

/* ─── Gerenciar CATEGORIAS de equipe (só TI-Dev/TI-Sup definem os nomes) ─── */
function openTagManager(mount, allTags) {
  let tags = (allTags || []).slice();
  const render = () => `
    <p class="colmgr-intro">Categorias servem para filtrar as equipes. Só TI-Dev/TI-Sup definem os nomes; cada equipe escolhe a sua na criação ou em <strong>Gerenciar → Geral</strong>.</p>
    <div class="tagmgr-list">
      ${tags.map(t => `
        <div class="tagmgr-row">
          <span class="eqs-tag" style="--tag:${escapeHTML(t.color||'#00796D')};">${escapeHTML(t.name)}</span>
          ${t.id==='tag-coordenacao'
            ? `<span class="colmgr-lock" title="Categoria padrão — não pode ser excluída">🔒</span>`
            : `<button class="colmgr-del" data-deltag="${escapeHTML(t.id)}" title="Excluir categoria">✕</button>`}
        </div>`).join('') || '<div class="mp-empty">Nenhuma categoria além da padrão.</div>'}
    </div>
    <div class="tagmgr-add">
      <input class="input" id="tagmgr-name" placeholder="Nova categoria… (ex: Panqueca)" maxlength="40">
      <input type="color" id="tagmgr-color" value="#00796D" class="tagmgr-color" title="Cor">
      <button class="btn btn-primary btn-sm" id="tagmgr-add">+ Criar</button>
    </div>`;
  openModal({
    title: `<span class="modal-title-kicker">Equipes</span><span style="color:var(--text);">Categorias</span>`,
    body: render(),
    footer: `<button class="btn btn-secondary" data-close>Fechar</button>`,
    onClose: () => equipes.render(mount),   // atualiza os chips ao fechar
  });
  const refresh = () => { const b = document.querySelector('.modal-body'); if (b) { b.innerHTML = render(); wire(); } };
  function wire() {
    const addBtn = document.getElementById('tagmgr-add');
    if (addBtn) addBtn.onclick = async () => {
      const name = document.getElementById('tagmgr-name').value.trim();
      if (!name) { toast('Informe o nome da categoria.', 'warn'); return; }
      const color = document.getElementById('tagmgr-color').value || '#00796D';
      try {
        const r = await api.call('teams.php', 'tag_create', { name, color });
        if (r?.tag) tags.push(r.tag);
        refresh(); toast('Categoria criada.', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
    document.querySelectorAll('[data-deltag]').forEach(b => b.onclick = async () => {
      const ok = await confirmDialog({ title:'Excluir categoria', message:'Excluir esta categoria? As equipes que a usavam ficam sem ela.', confirmText:'Excluir', danger:true });
      if (!ok) return;
      try {
        await api.call('teams.php', 'tag_delete', { id: b.dataset.deltag });
        tags = tags.filter(t => t.id !== b.dataset.deltag);
        refresh();
      } catch (e) { toast(e.message, 'error'); }
    });
  }
  wire();
}

let manageTab = 'membros';
export async function openManageModal(teamId, mount) {
  let team = null, members = [], requests = [], allUsers = [], allTags = [];
  try {
    team     = (await api.call('teams.php', 'get', { id: teamId }, 'GET')).team;
    members  = (await api.call('teams.php', 'members', { team_id: teamId }, 'GET')).members || [];
    requests = (await api.call('teams.php', 'pending_requests', {}, 'GET')).requests || [];
    allUsers = (await api.call('teams.php', 'users', {}, 'GET')).users || [];
    try { allTags = (await api.call('teams.php', 'tags_list', {}, 'GET')).tags || []; } catch {}
  } catch (e) { toast(e.message, 'error'); return; }
  requests = requests.filter(r => r.team_id === teamId);
  const memberIds = new Set(members.map(m => m.user_id));
  const isTI = ['ti', 'suporte'].includes(state.currentUser?.role);   // TI-Dev e TI-Sup têm bypass
  const myRole = isTI ? 'gestor' : (members.find(m => m.user_id === state.currentUser?.user_id)?.role || 'analista');
  const canManageTeam = isTI || myRole === 'gestor' || myRole === 'ti';
  // Quadro pessoal: só faz sentido a aba de Configurações (sem membros/geral/histórico de equipe).
  const isPersonal = team?.type === 'personal';
  if (isPersonal) manageTab = 'config';

  const tabBtn = (id, label) => `<button class="cm-tab ${manageTab===id?'active':''}" data-mtab="${id}">${label}</button>`;

  openModal({
    wide: true,
    title: `<span class="modal-title-kicker">${isPersonal ? 'Configurar' : 'Gerenciar'}</span><span style="color:var(--text);">${escapeHTML(team?.name || 'Equipe')}</span>`,
    body: `
      <div class="cm-tabs" style="margin:-4px 0 16px;${isPersonal ? 'display:none;' : ''}">
        ${tabBtn('membros', `👥 Membros (${members.length})`)}
        ${canManageTeam ? tabBtn('geral', '⚙️ Geral') : ''}
        ${canManageTeam ? tabBtn('config', '🎛️ Configurações') : ''}
        ${tabBtn('historico', '🕘 Histórico')}
      </div>
      <div id="mtab-body"></div>`,
    footer: `<button class="btn btn-secondary" data-close>Fechar</button>`,
  });

  const reload = () => { closeModal(true); openManageModal(teamId, mount); };
  const body = document.getElementById('mtab-body');

  function paintTab() {
    if (manageTab === 'geral' && canManageTeam) body.innerHTML = generalTabHTML(team, allTags);
    else if (manageTab === 'config' && canManageTeam) body.innerHTML = configTabHTML(team);
    else if (manageTab === 'historico') body.innerHTML = historyTabHTML(teamId);
    else body.innerHTML = membersTabHTML(members, requests, allUsers, memberIds, isTI, canManageTeam);
    wireTab();
  }

  function wireTab() {
    document.querySelectorAll('[data-mtab]').forEach(b => b.onclick = () => { manageTab = b.dataset.mtab; document.querySelectorAll('[data-mtab]').forEach(x=>x.classList.toggle('active', x.dataset.mtab===manageTab)); paintTab(); });

    if (manageTab === 'historico') { wireActivity(body); return; }

    if (manageTab === 'geral' && canManageTeam) {
      let selIcon = team.icon || '👥';
      let selColor = team.color || '#00796D';
      const pvIcon = document.getElementById('tg-avatar-prev');
      const dot = document.getElementById('tg-color-dot');
      const hex = document.getElementById('tg-color-hex');
      const customInp = document.getElementById('tg-color-custom');
      const customSw = document.querySelector('#tg-colors .nt-color-custom');
      const syncColor = () => {
        if (dot) dot.style.background = selColor;
        if (pvIcon && !team.avatar_url) pvIcon.style.background = selColor;
        const inPalette = [...document.querySelectorAll('#tg-colors .nt-color[data-color]')].some(b => {
          const on = b.dataset.color.toLowerCase() === selColor.toLowerCase();
          b.classList.toggle('sel', on); return on;
        });
        if (customSw) { customSw.classList.toggle('sel', !inPalette); if (!inPalette) customSw.style.background = selColor; }
      };
      document.querySelectorAll('#tg-icons [data-icon]').forEach(b => b.onclick = () => {
        selIcon = b.dataset.icon;
        document.querySelectorAll('#tg-icons .nt-icon').forEach(x => x.classList.toggle('sel', x===b));
        if (pvIcon && !team.avatar_url) pvIcon.textContent = selIcon;
      });
      document.querySelectorAll('#tg-colors .nt-color[data-color]').forEach(b => b.onclick = () => {
        selColor = b.dataset.color; if (hex) hex.value = ''; syncColor();
      });
      customInp && customInp.addEventListener('input', () => { selColor = customInp.value; if (hex) hex.value = customInp.value; syncColor(); });
      hex && hex.addEventListener('input', () => {
        let v = hex.value.trim(); if (v && !v.startsWith('#')) v = '#'+v;
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) { selColor = v; if (customInp && v.length===7) customInp.value = v; syncColor(); }
      });
      document.getElementById('tg-save').onclick = async () => {
        try {
          await api.call('teams.php', 'update', {
            team_id: teamId,
            name: document.getElementById('tg-name').value.trim(),
            description: document.getElementById('tg-desc').value.trim(),
            icon: selIcon || '👥',
            color: selColor,
          });
          const tagSel = document.getElementById('tg-tag');
          if (tagSel) await api.call('teams.php', 'set_tags', { team_id: teamId, tag_ids: tagSel.value ? [tagSel.value] : [] });
          toast('Equipe atualizada.', 'success'); reload();
        } catch (e) { toast(e.message, 'error'); }
      };
      // DESABILITADO: funções de upload de fotos da equipe (ERRO HTTP 500)
      /* ╔╗╔╗╔═══════════════════════════════════════════════════════════╗
         ╚╚╚║  FUNÇÕES DE UPLOAD DE FOTOS DA EQUIPE COMENTADAS       ║╚
             ║  - uploadTeamPhoto()                                  ║
             ║  - onclick tg-avatar-btn & tg-cover-btn              ║
             ║  - onchange tg-avatar-file & tg-cover-file           ║
             ║  - delTeamPhoto()                                    ║
             ║  - addEventListener para delete                      ║
             ║  Data: 2026-06-09 - Investigação em andamento        ║
             ╚═══════════════════════════════════════════════════════════╝
      const uploadTeamPhoto = async (kind, input) => {
        const f = input.files?.[0]; input.value = ''; if (!f) return;
        const { openImageCrop } = await import('../ui/image-crop.js');
        const cfg = kind === 'avatar'
          ? { aspect: 1, outW: 400, outH: 400, round: true, title: 'Ajustar foto da equipe' }
          : { aspect: 4, outW: 1200, outH: 300, round: false, title: 'Ajustar capa da equipe' };
        const blob = await openImageCrop({ file: f, ...cfg });
        if (!blob) return;
        const fd = new FormData(); fd.append('file', blob, kind+'.jpg'); fd.append('t','team'); fd.append('o', teamId); fd.append('k', kind);
        try { await api.upload('photos.php?action=upload', fd); toast('Imagem enviada.', 'success'); reload(); }
        catch (e) { toast(e.message, 'error'); }
      };
      document.getElementById('tg-avatar-btn').onclick = () => document.getElementById('tg-avatar-file').click();
      document.getElementById('tg-avatar-file').onchange = (e) => uploadTeamPhoto('avatar', e.target);
      document.getElementById('tg-cover-btn').onclick = () => document.getElementById('tg-cover-file').click();
      document.getElementById('tg-cover-file').onchange = (e) => uploadTeamPhoto('cover', e.target);
      const delTeamPhoto = async (kind) => {
        const fd = new FormData(); fd.append('t','team'); fd.append('o', teamId); fd.append('k', kind);
        try { await api.upload('photos.php?action=delete', fd); toast('Imagem removida.', 'info'); reload(); }
        catch (e) { toast(e.message, 'error'); }
      };
      document.getElementById('tg-avatar-del')?.addEventListener('click', () => delTeamPhoto('avatar'));
      document.getElementById('tg-cover-del')?.addEventListener('click', () => delTeamPhoto('cover'));
      */
      document.getElementById('tg-archive')?.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: team.archived?'Desarquivar':'Arquivar equipe', message: team.archived?'Reativar esta equipe?':'Arquivar esta equipe? Ela some das listas ativas.', confirmText: team.archived?'Desarquivar':'Arquivar', danger: !team.archived });
        if (!ok) return;
        try { await api.call('teams.php','archive',{ team_id: teamId }); toast('Pronto.', 'success'); closeModal(true); equipes.render(mount); }
        catch (e) { toast(e.message, 'error'); }
      });
      document.getElementById('tg-cols')?.addEventListener('click', async () => {
        try {
          const d = await api.call('columns.php', 'list', { team: teamId }, 'GET');
          const cols = d.columns || [];
          const { openColumnManager } = await import('../ui/column-manager.js');
          openColumnManager({ teamId, cols, onChange: () => {} });
        } catch (e) { toast(e.message, 'error'); }
      });
      return;
    }

    if (manageTab === 'config' && canManageTeam) {
      // Metas: semana ↔ mês (~4,33 semanas/mês). Digitar de um lado calcula e trava o outro.
      (function () {
        const w = document.getElementById('tcfg-weekly'), m = document.getElementById('tcfg-monthly');
        if (!w || !m) return;
        const WPM = 52 / 12;
        const recalc = (drv) => {
          if (drv === 'w') {
            if (w.value.trim() === '') { w.disabled = false; m.disabled = false; return; }
            m.value = Math.round(parseFloat(w.value) * WPM); m.disabled = true; w.disabled = false;
          } else {
            if (m.value.trim() === '') { w.disabled = false; m.disabled = false; return; }
            w.value = Math.round(parseFloat(m.value) / WPM); w.disabled = true; m.disabled = false;
          }
        };
        w.addEventListener('input', () => recalc('w'));
        m.addEventListener('input', () => recalc('m'));
        const wF = Number(w.value) > 0, mF = Number(m.value) > 0;
        if (wF && !mF) recalc('w'); else if (mF && !wF) recalc('m');
      })();
      // Toggle "Meta inteligente automática": liga/desliga e trava os campos manuais
      document.getElementById('tcfg-smart-auto')?.addEventListener('change', (e) => {
        const on = e.target.checked;
        const w = document.getElementById('tcfg-weekly'), m = document.getElementById('tcfg-monthly');
        const btn = document.getElementById('tcfg-smart'), info = document.getElementById('tcfg-smart-info');
        if (w) w.disabled = on; if (m) m.disabled = on; if (btn) btn.disabled = on;
        if (info) info.textContent = on
          ? 'Modo automático ligado: a meta é recalculada sozinha quando houver histórico.'
          : 'O sistema analisa o histórico da equipe e sugere uma meta realista.';
      });
      // Meta inteligente: busca sugestão baseada no histórico e preenche
      document.getElementById('tcfg-smart')?.addEventListener('click', async () => {
        const btn = document.getElementById('tcfg-smart'); const info = document.getElementById('tcfg-smart-info');
        btn.disabled = true; const old = btn.textContent; btn.textContent = 'Analisando…';
        try {
          const r = await api.call('teams.php', 'smart_goal', { team_id: teamId }, 'GET');
          const s = r.suggestion || {};
          if (!s.hasData) { if (info) info.textContent = s.basis || 'Sem histórico suficiente.'; }
          else {
            const w = document.getElementById('tcfg-weekly'), m = document.getElementById('tcfg-monthly');
            w.disabled = false; m.disabled = false;
            w.value = s.weekly; w.dispatchEvent(new Event('input', { bubbles: true })); // recalcula/trava o mês
            if (info) info.textContent = s.basis;
            toast('Meta inteligente sugerida — revise e salve.', 'success');
          }
        } catch (e) { toast(e.message, 'error'); }
        finally { btn.disabled = false; btn.textContent = old; }
      });
      // segmented control dos campos
      document.querySelectorAll('.tcf-seg').forEach(seg => seg.addEventListener('change', () => {
        seg.querySelectorAll('.tcf-opt').forEach(o => o.classList.toggle('active', o.querySelector('input').checked));
      }));
      document.getElementById('tcfg-save').onclick = async () => {
        const cardFields = {};
        document.querySelectorAll('.tcf-seg').forEach(seg => {
          const f = seg.dataset.field; const v = seg.querySelector('input:checked')?.value || 'optional';
          cardFields[f] = v;
        });
        try {
          const smartAuto = document.getElementById('tcfg-smart-auto')?.checked ? 1 : 0;
          const noticeMaxEl = document.getElementById('tcfg-notice-max');
          const r = await api.call('teams.php', 'update_config', {
            team_id: teamId,
            goalWeekly: parseInt(document.getElementById('tcfg-weekly').value,10)||0,
            goalMonthly: parseInt(document.getElementById('tcfg-monthly').value,10)||0,
            smartGoalAuto: smartAuto,
            cardFields,
            extraPeople,
            // Só enviado quando o campo está habilitado (TI da equipe); o backend re-valida.
            ...(noticeMaxEl && !noticeMaxEl.disabled ? { noticeMaxHours: parseInt(noticeMaxEl.value,10)||48 } : {}),
          });
          // Reflete a meta que o auto-ajuste possa ter aplicado
          if (smartAuto && r && document.getElementById('tcfg-weekly')) {
            document.getElementById('tcfg-weekly').value = r.goalWeekly || 0;
            document.getElementById('tcfg-monthly').value = r.goalMonthly || 0;
          }
          toast(smartAuto ? 'Configurações salvas. Meta inteligente automática ativada.' : 'Configurações da equipe salvas.', 'success');
          if (teamId === state.currentTeamId) { try { await switchTeam(teamId); } catch {} }
        } catch (e) { toast(e.message, 'error'); }
      };

      // ── Pessoas externas (lista gerenciada: nome + e-mail) ──
      let extraPeople = (() => {
        try {
          return (JSON.parse(team.extra_people || '[]') || []).map(p =>
            typeof p === 'string' ? { name: p, userId: '', email: '' }
                                   : { name: p.name || '', userId: p.userId || '', email: p.email || '' });
        } catch { return []; }
      })();
      const renderPeople = () => {
        const box = document.getElementById('tcfg-people-list');
        if (!box) return;
        box.innerHTML = extraPeople.length
          ? extraPeople.map((p, i) => {
              const meta = [p.userId ? 'ID ' + p.userId : '', p.email].filter(Boolean).join(' · ');
              return `<div class="tep-row">
                <span class="tep-name">${escapeHTML(p.name)}</span>
                <span class="tep-meta">${escapeHTML(meta || '— sem ID/e-mail —')}</span>
                <button type="button" class="btn btn-xs btn-ghost" data-tep-del="${i}" title="Remover" style="color:var(--danger)">✕</button>
              </div>`;
            }).join('')
          : '<div class="text-muted text-sm">Nenhuma pessoa externa cadastrada.</div>';
        box.querySelectorAll('[data-tep-del]').forEach(b => b.onclick = () => {
          extraPeople.splice(Number(b.dataset.tepDel), 1); renderPeople();
        });
      };
      renderPeople();
      // Auto-preenche o nome quando o e-mail já é de um usuário cadastrado.
      document.getElementById('tep-email')?.addEventListener('change', async (e) => {
        const email = (e.target.value || '').trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
        try {
          const r = await api.call('users.php', 'find_by_email', { email }, 'GET');
          if (r && r.user) {
            const nm = document.getElementById('tep-name');
            if (nm && !nm.value.trim()) nm.value = r.user.display_name || r.user.name || '';
            toast('Usuário encontrado — nome preenchido.', 'success');
          }
        } catch {}
      });
      document.getElementById('tep-add')?.addEventListener('click', () => {
        const name = document.getElementById('tep-name').value.trim();
        const email = document.getElementById('tep-email').value.trim();
        if (!name) { toast('Informe o nome da pessoa.', 'warn'); return; }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Informe um e-mail válido.', 'warn'); return; }
        if (extraPeople.some(p => p.name.toLowerCase() === name.toLowerCase())) { toast('Já existe alguém com esse nome.', 'warn'); return; }
        extraPeople.push({ name, email });
        document.getElementById('tep-name').value = '';
        document.getElementById('tep-email').value = '';
        renderPeople();
      });

      // ── Campos personalizados (modulares) da equipe ──
      const optsWrap = document.getElementById('tcf-new-opts-wrap');
      document.getElementById('tcf-new-type')?.addEventListener('change', (e) => {
        if (optsWrap) optsWrap.style.display = e.target.value === 'select' ? '' : 'none';
      });
      async function loadTeamFields() {
        const box = document.getElementById('tcf-custom-list');
        if (!box) return;
        try {
          const r = await api.call('custom_fields.php', 'list', { team_id: teamId }, 'GET');
          const fields = r.customFields || [];
          box.innerHTML = fields.length ? fields.map(f => {
            const TY = { text:'Texto', number:'Número', date:'Data', select:'Seleção' };
            const tags = [TY[f.type]||f.type, Number(f.required)?'obrigatório':'', Number(f.as_filter)?'🔎 filtro':'', Number(f.show_on_card)?'⭐ destaque no card':''].filter(Boolean).join(' · ');
            return `<div class="tcf-field-row" data-fid="${escapeHTML(f.id)}">
              <div style="flex:1;min-width:0;"><strong>${escapeHTML(f.name)}</strong>
                <div class="text-muted text-sm">${escapeHTML(tags)}</div></div>
              <button class="btn btn-xs btn-ghost" data-fedit title="Editar">✏️</button>
              <button class="btn btn-xs btn-ghost" data-fup title="Subir">▲</button>
              <button class="btn btn-xs btn-ghost" data-fdown title="Descer">▼</button>
              <button class="btn btn-xs btn-ghost" data-fdel style="color:var(--danger);" title="Remover">🗑</button>
            </div>`;
          }).join('') : '<div class="text-muted text-sm">Nenhum campo personalizado ainda.</div>';
          // remover
          box.querySelectorAll('[data-fdel]').forEach(b => b.onclick = async () => {
            const fid = b.closest('[data-fid]').dataset.fid;
            if (!await confirmDialog({ title:'Remover campo', message:'Remover este campo e seus valores em todos os cards?', confirmText:'Remover', danger:true })) return;
            try { await api.call('custom_fields.php','delete',{ id: fid }); await loadTeamFields(); if (teamId===state.currentTeamId) { try{ await switchTeam(teamId);}catch{} } }
            catch(e){ toast(e.message,'error'); }
          });
          // reordenar (sobe/desce → reorder)
          const reorder = async (fromIdx, toIdx) => {
            if (toIdx < 0 || toIdx >= fields.length) return;
            const ids = fields.map(f => f.id);
            const [m] = ids.splice(fromIdx, 1); ids.splice(toIdx, 0, m);
            try { await api.call('custom_fields.php','reorder',{ team_id: teamId, ids }); await loadTeamFields(); if (teamId===state.currentTeamId){try{await switchTeam(teamId);}catch{}} }
            catch(e){ toast(e.message,'error'); }
          };
          box.querySelectorAll('[data-fup]').forEach((b,i) => b.onclick = () => reorder(i, i-1));
          box.querySelectorAll('[data-fdown]').forEach((b,i) => b.onclick = () => reorder(i, i+1));
          // editar campo existente → preenche o formulário
          box.querySelectorAll('[data-fedit]').forEach(b => b.onclick = () => {
            const f = fields.find(x => x.id === b.closest('[data-fid]').dataset.fid);
            if (f) { fillFieldForm(f); document.getElementById('tcf-new-name')?.focus(); }
          });
        } catch (e) { box.innerHTML = `<div class="text-muted text-sm">Erro ao carregar campos: ${escapeHTML(e.message)}</div>`; }
      }
      // ── Estado de edição de campo personalizado ──
      let editingFieldId = null;
      const resetFieldForm = () => {
        editingFieldId = null;
        document.getElementById('tcf-new-name').value = '';
        document.getElementById('tcf-new-opts').value = '';
        document.getElementById('tcf-new-type').value = 'text';
        if (optsWrap) optsWrap.style.display = 'none';
        document.getElementById('tcf-new-req').checked = false;
        document.getElementById('tcf-new-filter').checked = false;
        document.getElementById('tcf-new-oncard').checked = false;
        document.getElementById('tcf-add-btn').textContent = '➕ Criar este campo';
        document.getElementById('tcf-cancel-btn').style.display = 'none';
      };
      const fillFieldForm = (f) => {
        editingFieldId = f.id;
        document.getElementById('tcf-new-name').value = f.name || '';
        document.getElementById('tcf-new-type').value = f.type || 'text';
        if (optsWrap) optsWrap.style.display = f.type === 'select' ? '' : 'none';
        let opts = []; try { opts = JSON.parse(f.options || '[]'); } catch {}
        document.getElementById('tcf-new-opts').value = (opts || []).join('\n');
        document.getElementById('tcf-new-req').checked = !!Number(f.required);
        document.getElementById('tcf-new-filter').checked = !!Number(f.as_filter);
        document.getElementById('tcf-new-oncard').checked = !!Number(f.show_on_card);
        document.getElementById('tcf-add-btn').textContent = '💾 Salvar alterações';
        document.getElementById('tcf-cancel-btn').style.display = '';
      };
      document.getElementById('tcf-cancel-btn')?.addEventListener('click', resetFieldForm);
      loadTeamFields();
      document.getElementById('tcf-add-btn')?.addEventListener('click', async () => {
        const name = document.getElementById('tcf-new-name').value.trim();
        if (!name) { toast('Dê um nome ao campo.', 'warn'); return; }
        const type = document.getElementById('tcf-new-type').value;
        const options = type === 'select'
          ? document.getElementById('tcf-new-opts').value.split(/[\r\n]+/).map(s=>s.trim()).filter(Boolean) : [];
        const payload = {
          name, type, options,
          required: document.getElementById('tcf-new-req').checked,
          asFilter: document.getElementById('tcf-new-filter').checked,
          showOnCard: document.getElementById('tcf-new-oncard').checked,
        };
        const isEdit = !!editingFieldId;
        try {
          if (isEdit) await api.call('custom_fields.php','update',{ id: editingFieldId, ...payload });
          else        await api.call('custom_fields.php','create',{ team_id: teamId, ...payload });
          resetFieldForm();
          await loadTeamFields();
          if (teamId === state.currentTeamId) { try { await switchTeam(teamId); } catch {} }
          toast(isEdit ? 'Campo atualizado.' : 'Campo adicionado.', 'success');
        } catch (e) { toast(e.message, 'error'); }
      });

      // ── Automações (no-code) ──
      const ACT_LBL = { set_assignee: 'definir responsável', set_priority: 'definir prioridade', add_tag: 'adicionar etiqueta', notify: 'notificar', move_column: 'mover de coluna', comment: 'comentar', set_due: 'definir prazo', set_progress: 'definir progresso' };
      const TRG_LBL = { enter_column: 'entra em', progress_100: 'chega a 100%', card_created: 'é criado' };
      const colOptsHtml = (state.columns || []).slice().sort((a, b) => a.position - b.position)
        .map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML((c.icon ? c.icon + ' ' : '') + c.name)}</option>`).join('');
      const auTrigColSel = document.getElementById('tau-trigcol');
      const auActColSel = document.getElementById('tau-actcol');
      if (auTrigColSel) auTrigColSel.innerHTML = colOptsHtml;
      if (auActColSel) auActColSel.innerHTML = colOptsHtml;
      const auTrigSel = document.getElementById('tau-trigger');
      const auTrigWrap = document.getElementById('tau-trigcol-wrap');
      const auActSel = document.getElementById('tau-action');
      const auValInput = document.getElementById('tau-value');
      const auValWrap = document.getElementById('tau-value-wrap');
      const auActColWrap = document.getElementById('tau-actcol-wrap');
      // Lista de membros (checkboxes) para "definir responsável" / "notificar".
      const auMembersBox = document.getElementById('tau-members');
      if (auMembersBox) auMembersBox.innerHTML = (members || []).length
        ? members.map(m => `<label class="tau-mbox"><input type="checkbox" value="${escapeHTML(m.name)}"><span>${escapeHTML(m.name)}</span></label>`).join('')
        : '<span class="text-muted text-sm">Esta equipe ainda não tem membros.</span>';

      const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
      const syncAuForm = () => {
        if (auTrigWrap) auTrigWrap.style.display = auTrigSel.value === 'enter_column' ? '' : 'none';
        const act = auActSel.value;
        const isMembers = act === 'set_assignee' || act === 'notify';
        const isPrio = act === 'set_priority';
        const isNum  = act === 'set_progress' || act === 'set_due';
        const isMove = act === 'move_column';
        show(document.getElementById('tau-members-wrap'), isMembers);
        show(document.getElementById('tau-prio-wrap'), isPrio);
        show(document.getElementById('tau-num-wrap'), isNum);
        show(auActColWrap, isMove);
        show(auValWrap, !isMembers && !isPrio && !isNum && !isMove);   // add_tag / comment
        const memLabel = document.getElementById('tau-members-label');
        if (memLabel) memLabel.textContent = act === 'notify'
          ? 'Notificar (escolha 1 ou mais)'
          : 'Responsável (escolha 1 ou mais — o 1º assume; todos são avisados)';
        const numLabel = document.getElementById('tau-num-label');
        const numInput = document.getElementById('tau-num');
        if (numLabel) numLabel.textContent = act === 'set_progress' ? 'Progresso (0 a 100)' : 'Dias a partir de hoje';
        if (numInput) { numInput.max = act === 'set_progress' ? '100' : ''; numInput.placeholder = act === 'set_progress' ? '0 a 100' : 'ex.: 7'; }
        if (auValInput) auValInput.placeholder = act === 'add_tag' ? 'Nome da etiqueta' : 'Texto do comentário';
      };
      auTrigSel?.addEventListener('change', syncAuForm);
      auActSel?.addEventListener('change', syncAuForm);
      syncAuForm();
      async function loadAutomations() {
        const box = document.getElementById('tau-list');
        if (!box) return;
        try {
          const list = (await api.call('automations.php', 'list', { team_id: teamId }, 'GET')).automations || [];
          const colNm = (id) => { const c = (state.columns || []).find(x => x.id === id); return c ? c.name : id; };
          box.innerHTML = list.length ? list.map(a => {
            const trg = a.trigger_type === 'enter_column' ? `entra em "${escapeHTML(colNm(a.trigger_value))}"` : (TRG_LBL[a.trigger_type] || a.trigger_type);
            const actVal = a.action_type === 'move_column' ? colNm(a.action_value) : a.action_value;
            const act = `${ACT_LBL[a.action_type] || a.action_type}${actVal ? ': ' + escapeHTML(actVal) : ''}`;
            return `<div class="tau-row ${Number(a.enabled) ? '' : 'is-off'}" data-aid="${escapeHTML(a.id)}">
              <div style="flex:1;min-width:0;"><strong>${escapeHTML(a.name)}</strong>
                <div class="text-muted text-sm">Quando ${trg} → ${act}</div></div>
              <button class="btn btn-xs btn-ghost" data-atoggle title="Ligar/desligar">${Number(a.enabled) ? '⏸' : '▶'}</button>
              <button class="btn btn-xs btn-ghost" data-adel style="color:var(--danger);" title="Remover">🗑</button>
            </div>`;
          }).join('') : '<div class="text-muted text-sm">Nenhuma automação ainda.</div>';
          box.querySelectorAll('[data-adel]').forEach(b => b.onclick = async () => {
            const id = b.closest('[data-aid]').dataset.aid;
            if (!await confirmDialog({ title: 'Remover automação', message: 'Remover esta regra?', confirmText: 'Remover', danger: true })) return;
            try { await api.call('automations.php', 'delete', { id }); await loadAutomations(); } catch (e) { toast(e.message, 'error'); }
          });
          box.querySelectorAll('[data-atoggle]').forEach(b => b.onclick = async () => {
            const row = b.closest('[data-aid]');
            const on = !row.classList.contains('is-off');
            try { await api.call('automations.php', 'update', { id: row.dataset.aid, enabled: on ? 0 : 1 }); await loadAutomations(); } catch (e) { toast(e.message, 'error'); }
          });
        } catch (e) { box.innerHTML = `<div class="text-muted text-sm">Erro: ${escapeHTML(e.message)}</div>`; }
      }
      loadAutomations();
      document.getElementById('tau-add-btn')?.addEventListener('click', async () => {
        const name = (document.getElementById('tau-name').value || '').trim();
        if (!name) { toast('Dê um nome à automação.', 'warn'); return; }
        const triggerType = auTrigSel.value;
        const triggerValue = triggerType === 'enter_column' ? (auTrigColSel?.value || '') : '';
        const actionType = auActSel.value;
        let actionValue = '';
        if (actionType === 'move_column') actionValue = auActColSel?.value || '';
        else if (actionType === 'set_priority') actionValue = document.getElementById('tau-prio').value;
        else if (actionType === 'set_progress' || actionType === 'set_due') actionValue = (document.getElementById('tau-num').value || '').trim();
        else if (actionType === 'set_assignee' || actionType === 'notify')
          actionValue = [...document.querySelectorAll('#tau-members input:checked')].map(c => c.value).join(', ');
        else actionValue = (auValInput.value || '').trim();
        if (!actionValue) {
          toast(actionType === 'set_assignee' || actionType === 'notify' ? 'Escolha ao menos um membro.' : 'Informe o valor da ação.', 'warn');
          return;
        }
        try {
          await api.call('automations.php', 'create', { team_id: teamId, name, triggerType, triggerValue, actionType, actionValue });
          document.getElementById('tau-name').value = ''; auValInput.value = '';
          document.getElementById('tau-num').value = '';
          document.querySelectorAll('#tau-members input:checked').forEach(c => c.checked = false);
          await loadAutomations();
          toast('Automação criada.', 'success');
        } catch (e) { toast(e.message, 'error'); }
      });

      // ── Excluir equipe (confirmação digitando o nome) ──
      document.getElementById('tg-delete')?.addEventListener('click', () => openDeleteTeamModal(team, teamId));
      return;
    }

    // ── Membros ──
    document.querySelectorAll('[data-req-accept]').forEach(b => b.onclick = async () => {
      try { await api.call('teams.php', 'respond_request', { id: b.dataset.reqAccept, decision: 'accept' }); toast('Aceito.', 'success'); reload(); }
      catch (e) { toast(e.message, 'error'); }
    });
    document.querySelectorAll('[data-req-reject]').forEach(b => b.onclick = async () => {
      try { await api.call('teams.php', 'respond_request', { id: b.dataset.reqReject, decision: 'reject' }); toast('Recusado.', 'info'); reload(); }
      catch (e) { toast(e.message, 'error'); }
    });
    document.querySelectorAll('[data-role-for]').forEach(sel => sel.onchange = async () => {
      try { await api.call('teams.php', 'change_member_role', { team_id: teamId, user_id: sel.dataset.roleFor, role: sel.value }); toast('Papel atualizado.', 'success'); }
      catch (e) { toast(e.message, 'error'); reload(); }
    });
    document.querySelectorAll('[data-remove]').forEach(b => b.onclick = async () => {
      const ok = await confirmDialog({ title:'Remover membro', message:'Remover este membro da equipe?', confirmText:'Remover', danger:true });
      if (!ok) return;
      try { await api.call('teams.php', 'remove_member', { team_id: teamId, user_id: b.dataset.remove }); toast('Removido.', 'info'); reload(); }
      catch (e) { toast(e.message, 'error'); }
    });
    const _addVal = () => ({ vid: document.getElementById('eqm-add-user')?.value, role: document.getElementById('eqm-add-role')?.value });
    const directBtn = document.getElementById('eqm-add-direct');
    if (directBtn) directBtn.onclick = async () => {
      const { vid, role } = _addVal();
      if (!vid) { toast('Selecione um usuário.', 'warn'); return; }
      try { await api.call('teams.php', 'add_member', { team_id: teamId, user_id: vid, role }); toast('Adicionado à equipe.', 'success'); reload(); }
      catch (e) { toast(e.message, 'error'); }
    };
    const inviteBtn = document.getElementById('eqm-add-invite');
    if (inviteBtn) inviteBtn.onclick = async () => {
      const { vid, role } = _addVal();
      if (!vid) { toast('Selecione um usuário.', 'warn'); return; }
      try { await api.call('teams.php', 'invite', { team_id: teamId, user_id: vid, role }); toast('Convite enviado.', 'success'); reload(); }
      catch (e) { toast(e.message, 'error'); }
    };
  }

  paintTab();
}

function membersTabHTML(members, requests, allUsers, memberIds, isTI, canManage) {
  const roleSelect = (vid, current) => `
    <select class="adm-select-inline" data-role-for="${escapeHTML(vid)}" ${canManage?'':'disabled'}>
      ${Object.entries(TEAM_ROLES).map(([r,l]) => `<option value="${r}" ${current===r?'selected':''}>${l}</option>`).join('')}
    </select>`;
  return `
    ${requests.length ? `
      <div class="form-section">
        <div class="form-section-title">🙋 Pedidos pendentes (${requests.length})</div>
        ${requests.map(r => `
          <div class="eqm-row">
            <div class="avatar sm">${escapeHTML((r.user_name||'?')[0].toUpperCase())}</div>
            <span style="flex:1;">${escapeHTML(r.user_name)}</span>
            <button class="btn btn-sm btn-primary" data-req-accept="${escapeHTML(r.id)}">Aceitar</button>
            <button class="btn btn-sm btn-danger" data-req-reject="${escapeHTML(r.id)}">Recusar</button>
          </div>`).join('')}
      </div>` : ''}

    <div class="form-section">
      <div class="form-section-title">👥 Membros (${members.length})</div>
      ${members.map(m => `
        <div class="eqm-row">
          <div class="avatar sm">${m.avatar_url?`<img src="${escapeHTML(m.avatar_url)}" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;">`:escapeHTML((m.name||'?')[0].toUpperCase())}</div>
          <span style="flex:1;">${escapeHTML(m.name)} <span style="color:var(--text-muted);font-size:11px;">${escapeHTML(m.user_id)}</span></span>
          ${roleSelect(m.user_id, m.role)}
          ${canManage ? `<button class="btn btn-sm btn-ghost" data-remove="${escapeHTML(m.user_id)}" title="Remover">✕</button>` : ''}
        </div>`).join('')}
    </div>

    ${canManage ? `
    <div class="form-section">
      <div class="form-section-title">➕ Adicionar / convidar usuário</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <select class="select" id="eqm-add-user" style="flex:1;min-width:180px;">
          <option value="">Selecione um usuário…</option>
          ${allUsers.filter(usr => !memberIds.has(usr.user_id)).map(usr =>
            `<option value="${escapeHTML(usr.user_id)}">${escapeHTML(usr.name)} (${escapeHTML(usr.user_id)})</option>`).join('')}
        </select>
        <select class="select" id="eqm-add-role" style="width:150px;">
          ${Object.entries(TEAM_ROLES).map(([r,l]) => `<option value="${r}" ${r==='analista'?'selected':''}>${l}</option>`).join('')}
        </select>
        <button class="btn btn-primary"   id="eqm-add-direct" title="Coloca a pessoa na equipe na hora, sem precisar de aceite">➕ Adicionar direto</button>
        <button class="btn btn-secondary" id="eqm-add-invite" title="Envia um convite que a pessoa precisa aceitar">✉️ Convidar</button>
      </div>
      <small class="field-hint" style="display:block;margin-top:6px;">"Adicionar direto" entra sem aceite (bypass de Gestor/TI). "Convidar" depende da pessoa aceitar.</small>
    </div>` : ''}`;
}

const CARD_FIELD_DEFS = {
  description:'📝 Descrição', assignee:'👤 Responsável', priority:'🚩 Prioridade',
  startDate:'📅 Início', dueDate:'⏰ Prazo', tags:'🏷️ Tags', label:'🎨 Etiqueta',
  gains:'💰 Ganhos', subtasks:'☑️ Subtarefas', links:'🔗 Links', dependencies:'🔀 Dependências',
};
function configTabHTML(team) {
  const cf = (() => { try { return JSON.parse(team.card_fields || '{}') || {}; } catch { return {}; } })();
  const ef = (() => { try { return JSON.parse(team.extra_field || '{}') || {}; } catch { return {}; } })();
  const efLabel = ef.label || 'Campo extra';
  const efOpts = Array.isArray(ef.options) ? ef.options.join('\n') : '';
  // Só o TI da equipe (ou TI-Dev/Sup do sistema) altera o teto de duração dos avisos.
  const isTeamTI = team.my_role === 'ti' || ['ti','suporte'].includes(state.currentUser?.role);
  const noticeMax = Number(team.notice_max_hours) || 48;
  return `
    <div class="form-section">
      <div class="form-section-title">🎯 Metas da equipe</div>
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;margin-bottom:10px;">
        <input type="checkbox" id="tcfg-smart-auto" style="width:auto;accent-color:var(--primary);" ${Number(team.smart_goal_auto)?'checked':''}>
        <span><strong>🤖 Meta inteligente automática</strong> — o sistema define e <strong>ajusta sozinho</strong> a meta conforme o histórico. Pode deixar ligado mesmo sem dados: assim que houver histórico suficiente, ele cria e vai ajustando.</span>
      </label>
      <div class="form-grid">
        <div class="field"><label>Meta semanal (cards/semana)</label><input class="input" id="tcfg-weekly" type="number" min="0" value="${Number(team.goal_weekly)||0}" ${Number(team.smart_goal_auto)?'disabled':''}></div>
        <div class="field"><label>Meta mensal (cards/mês)</label><input class="input" id="tcfg-monthly" type="number" min="0" value="${Number(team.goal_monthly)||0}" ${Number(team.smart_goal_auto)?'disabled':''}></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" id="tcfg-smart" type="button" ${Number(team.smart_goal_auto)?'disabled':''}>🤖 Sugerir agora</button>
        <span class="text-muted text-sm" id="tcfg-smart-info">${Number(team.smart_goal_auto)?'Modo automático ligado: a meta é recalculada sozinha.':'O sistema analisa o histórico da equipe e sugere uma meta realista.'}</span>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">🗂️ Campos do card</div>
      <p class="adm-hint" style="margin:0 0 12px;">Defina como cada campo aparece no modal de card desta equipe: <strong>Obrigatório</strong>, <strong>Opcional</strong> ou <strong>Oculto</strong>. O título é sempre obrigatório.</p>
      <div class="tcf-grid">
        ${Object.entries(CARD_FIELD_DEFS).map(([key,label]) => {
          const cur = cf[key] || 'optional';
          return `<div class="tcf-row">
            <span class="tcf-label">${label}</span>
            <div class="tcf-seg" data-field="${key}">
              ${[['required','Obrigatório'],['optional','Opcional'],['hidden','Oculto']].map(([v,t])=>`
                <label class="tcf-opt tcf-${v} ${cur===v?'active':''}"><input type="radio" name="tcf_${key}" value="${v}" ${cur===v?'checked':''}>${t}</label>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">🧑‍🤝‍🧑 Pessoas externas</div>
      <p class="adm-hint" style="margin:0 0 12px;">Pessoas que <strong>ainda não são usuárias</strong> do sistema mas participam dos cards desta equipe. Ficam disponíveis como <strong>Responsável</strong>, <strong>Solicitante</strong> e <strong>Ajudante</strong>. Informe o <strong>e-mail</strong>: quando a pessoa se cadastrar com ele, entra <strong>automaticamente</strong> nesta equipe. (Gestor / TI da equipe — salve com o botão abaixo.)</p>
      <div id="tcfg-people-list" class="tep-list"></div>
      <div class="tep-add">
        <input class="input" id="tep-name" placeholder="Nome *" maxlength="60">
        <input class="input" id="tep-email" type="email" placeholder="E-mail *">
        <button type="button" class="btn btn-secondary btn-sm" id="tep-add">➕ Adicionar pessoa</button>
      </div>
      <p class="text-muted text-sm" style="margin:6px 0 0;">Obrigatório: nome + e-mail.</p>
    </div>

    <div class="form-section">
      <div class="form-section-title">🧩 Campos personalizados</div>
      <p class="adm-hint" style="margin:0 0 12px;">Crie campos para os cards desta equipe (nome, tipo, obrigatório, filtro). Use <strong>⭐ Destacar no card</strong> para mostrar o valor como etiqueta no quadro (máx. 2). Clique em ✏️ para editar um campo. (Gestor / TI da equipe)</p>
      <div id="tcf-custom-list"><div class="text-muted text-sm">Carregando campos…</div></div>
      <div class="tcf-add" style="margin-top:12px;border-top:1px dashed var(--border);padding-top:12px;">
        <div class="form-grid">
          <div class="field"><label>Nome do campo</label><input class="input" id="tcf-new-name" maxlength="40" placeholder="Ex.: Eixo estratégico"></div>
          <div class="field"><label>Tipo</label>
            <select class="select" id="tcf-new-type">
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="date">Data</option>
              <option value="select">Seleção (lista)</option>
            </select>
          </div>
        </div>
        <div class="field" id="tcf-new-opts-wrap" style="display:none;"><label>Opções (uma por linha)</label><textarea id="tcf-new-opts" rows="3" placeholder="Opção A&#10;Opção B&#10;Opção C"></textarea></div>
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
          <label class="adm-switch"><input type="checkbox" id="tcf-new-req"><span>Obrigatório</span></label>
          <label class="adm-switch"><input type="checkbox" id="tcf-new-filter"><span>🔎 Usar como filtro no quadro</span></label>
          <label class="adm-switch"><input type="checkbox" id="tcf-new-oncard"><span>⭐ Destacar no card (máx. 2)</span></label>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn btn-secondary btn-sm" id="tcf-add-btn">➕ Criar este campo</button>
          <button class="btn btn-ghost btn-sm" id="tcf-cancel-btn" style="display:none;">Cancelar</button>
        </div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">🤖 Automações</div>
      <p class="adm-hint" style="margin:0 0 12px;">Regras <strong>"quando → faça"</strong> que o sistema executa sozinho. Aplicadas no servidor ao mover/atualizar o card. (Gestor / TI da equipe)</p>
      <div id="tau-list"><div class="text-muted text-sm">Carregando automações…</div></div>
      <div class="tau-add" style="margin-top:12px;border-top:1px dashed var(--border);padding-top:12px;">
        <div class="field"><label>Nome da regra</label><input class="input" id="tau-name" maxlength="60" placeholder="Ex.: Card em Revisão → avisar o gestor"></div>
        <div class="form-grid">
          <div class="field"><label>Quando (gatilho)</label>
            <select class="select" id="tau-trigger">
              <option value="enter_column">Card entra na coluna…</option>
              <option value="progress_100">Card chega a 100%</option>
              <option value="card_created">Card é criado</option>
            </select>
          </div>
          <div class="field" id="tau-trigcol-wrap"><label>Coluna</label>
            <select class="select" id="tau-trigcol"></select>
          </div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Faça (ação)</label>
            <select class="select" id="tau-action">
              <option value="set_assignee">Definir responsável</option>
              <option value="set_priority">Definir prioridade</option>
              <option value="add_tag">Adicionar etiqueta</option>
              <option value="notify">Notificar pessoa</option>
              <option value="move_column">Mover para coluna…</option>
              <option value="comment">Adicionar comentário</option>
              <option value="set_due">Definir prazo (+dias)</option>
              <option value="set_progress">Definir progresso (%)</option>
            </select>
          </div>
          <div class="field" id="tau-value-wrap"><label id="tau-val-label">Valor</label><input class="input" id="tau-value" placeholder="Valor"></div>
          <div class="field" id="tau-actcol-wrap" style="display:none;"><label>Coluna destino</label><select class="select" id="tau-actcol"></select></div>
          <div class="field" id="tau-prio-wrap" style="display:none;"><label>Prioridade</label>
            <select class="select" id="tau-prio">
              <option value="baixa">🟢 Baixa</option><option value="media">🟡 Média</option><option value="alta">🟠 Alta</option><option value="urgente">🔴 Urgente</option>
            </select>
          </div>
          <div class="field" id="tau-num-wrap" style="display:none;"><label id="tau-num-label">Número</label><input class="input" id="tau-num" type="number" min="0" placeholder="0"></div>
          <div class="field" id="tau-members-wrap" style="display:none;grid-column:1/-1;"><label id="tau-members-label">Membros</label>
            <div class="tau-members" id="tau-members" role="group" aria-label="Selecionar membros"></div>
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="tau-add-btn" style="margin-top:8px;">➕ Criar automação</button>
      </div>
    </div>

    <div class="form-section">
      <div class="form-section-title">📢 Avisos</div>
      <p class="adm-hint" style="margin:0 0 12px;">Tempo <strong>máximo</strong> que um aviso pode ficar visível no quadro. Ao publicar ou editar, o término é limitado a esse teto (mesmo sem término definido, o aviso expira). ${isTeamTI ? 'Só o <strong>TI da equipe</strong> altera este valor.' : 'Apenas o <strong>TI da equipe</strong> pode alterar — mostrado aqui para referência.'}</p>
      <div class="form-grid">
        <div class="field"><label>Duração máxima do aviso (horas)</label>
          <input class="input" id="tcfg-notice-max" type="number" min="1" max="720" value="${noticeMax}" ${isTeamTI ? '' : 'disabled'}>
          <small class="field-hint">Padrão: 48h. Entre 1 e 720 (30 dias).</small>
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-top:6px;">
      <button class="btn btn-primary" id="tcfg-save">💾 Salvar configurações</button>
    </div>

    ${team.type!=='personal' ? `
    <div class="eqs-danger-zone">
      <div class="eqs-danger-title">⚠️ Zona de risco</div>
      <div class="eqs-danger-row">
        <div>
          <strong>Excluir equipe</strong>
          <div class="text-muted text-sm">Remove a equipe, seus cards, colunas, anexos e mural permanentemente. Não pode ser desfeito.</div>
        </div>
        <button class="btn btn-danger" id="tg-delete">🗑 Excluir equipe</button>
      </div>
    </div>` : ''}`;
}

function generalTabHTML(team, allTags = []) {
  const curTag = (team.tags && team.tags[0]) ? team.tags[0].id : 'tag-coordenacao';
  const tagOptions = (allTags.length ? allTags : [{id:'tag-coordenacao',name:'Coordenação'}]);
  const coverStyle = team.cover_url ? `background-image:url('${escapeHTML(team.cover_url)}');` : '';
  const icon = team.icon || '👥';
  const color = team.color || '#00796D';
  const isCustomColor = !TEAM_COLORS.includes((color||'').toUpperCase()) && !TEAM_COLORS.includes(color);
  return `
    <div class="pe-photos">
      <div class="pe-photo-field">
        <label>Foto da equipe</label>
        <div class="pe-avatar-prev" id="tg-avatar-prev" style="background:${escapeHTML(color)};">${team.avatar_url?`<img src="${escapeHTML(team.avatar_url)}">`:escapeHTML(icon)}</div>
        <input type="file" id="tg-avatar-file" accept="image/*" hidden>
        <div class="pe-photo-btns">
          <button class="btn btn-secondary btn-sm" id="tg-avatar-btn" disabled title="Envio de foto temporariamente desativado">${team.avatar_url?'Trocar':'Adicionar'} foto</button>
          ${team.avatar_url?`<button class="btn btn-ghost btn-sm" id="tg-avatar-del" disabled title="Envio de foto temporariamente desativado">Remover</button>`:''}
        </div>
        <div class="pe-dim">Quadrada · 400×400px</div>
      </div>
      <div class="pe-photo-field" style="flex:1;">
        <label>Capa</label>
        <div class="pe-cover-prev" id="tg-cover-prev" style="${coverStyle}"></div>
        <input type="file" id="tg-cover-file" accept="image/*" hidden>
        <div class="pe-photo-btns">
          <button class="btn btn-secondary btn-sm" id="tg-cover-btn" disabled title="Envio de foto temporariamente desativado">${team.cover_url?'Trocar':'Adicionar'} capa</button>
          ${team.cover_url?`<button class="btn btn-ghost btn-sm" id="tg-cover-del" disabled title="Envio de foto temporariamente desativado">Remover</button>`:''}
        </div>
        <div class="pe-dim">Panorâmica · 1200×300px (4:1)</div>
      </div>
    </div>
    <div class="field"><label>Nome</label><input class="input" id="tg-name" value="${escapeHTML(team.name||'')}" maxlength="60"></div>
    <div class="field"><label>Descrição</label><textarea id="tg-desc" rows="2">${escapeHTML(team.description||'')}</textarea></div>
    <div class="field"><label>Categoria</label>
      <select class="input" id="tg-tag">
        ${tagOptions.map(tg => `<option value="${escapeHTML(tg.id)}" ${tg.id===curTag?'selected':''}>${escapeHTML(tg.name)}</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label>Ícone ${team.avatar_url?'<span style="font-weight:600;text-transform:none;letter-spacing:0;color:var(--text-muted);">(desativado — a foto está em uso)</span>':''}</label>
      <div class="nt-icons ${team.avatar_url?'is-disabled':''}" id="tg-icons">
        ${TEAM_ICONS.map(e => `<button type="button" class="nt-icon ${e===icon?'sel':''}" data-icon="${e}" ${team.avatar_url?'disabled':''}>${e}</button>`).join('')}
      </div>
      ${team.avatar_url?`<div class="pe-dim" style="text-align:left;">Remova a foto da equipe para voltar a usar um ícone.</div>`:''}
    </div>
    <div class="field"><label>Cor</label>
      <div class="nt-colors" id="tg-colors">
        ${TEAM_COLORS.map(c => `<button type="button" class="nt-color ${(!isCustomColor && c.toLowerCase()===color.toLowerCase())?'sel':''}" data-color="${c}" style="background:${c};"></button>`).join('')}
        <label class="nt-color nt-color-custom ${isCustomColor?'sel':''}" title="Cor personalizada" style="${isCustomColor?`background:${escapeHTML(color)};`:''}">
          <input type="color" id="tg-color-custom" value="${isCustomColor?escapeHTML(color):'#0E2A2A'}">
          <span class="nt-color-plus">🎨</span>
        </label>
      </div>
      <div class="color-hex-row" style="margin-top:8px;">
        <span class="color-preview-dot" id="tg-color-dot" style="background:${escapeHTML(color)};"></span>
        <input type="text" id="tg-color-hex" placeholder="#RRGGBB" maxlength="7" value="${isCustomColor?escapeHTML(color):''}">
        <span class="color-hex-help">ou cole um hex</span>
      </div>
    </div>

    <div class="field" style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px;">
      <label>Colunas do quadro</label>
      <button class="btn btn-secondary" id="tg-cols" type="button">🗂️ Gerenciar colunas desta equipe</button>
    </div>

    <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px;">
      ${team.type==='team' ? `<button class="btn btn-ghost" id="tg-archive">${team.archived?'♻️ Desarquivar':'🗄️ Arquivar equipe'}</button>` : '<span></span>'}
      <button class="btn btn-primary" id="tg-save">💾 Salvar</button>
    </div>`;
}

/* Confirmação de exclusão: precisa digitar o NOME da equipe; botão fica
   bloqueado até bater exatamente. */
function openDeleteTeamModal(team, teamId) {
  const name = (team.name || '').trim();
  openModal({
    title: `<span class="modal-title-kicker" style="color:var(--danger);">Zona de risco</span><span style="color:var(--text);">Excluir equipe</span>`,
    body: `
      <p style="color:var(--text-2);line-height:1.55;margin:0 0 12px;">
        Isso remove <strong>${escapeHTML(name)}</strong> e <strong>todos</strong> os seus cards, colunas,
        anexos e avisos. <strong style="color:var(--danger);">Esta ação não pode ser desfeita.</strong>
      </p>
      <div class="field">
        <label>Para confirmar, digite o nome da equipe: <strong>${escapeHTML(name)}</strong></label>
        <input class="input" id="del-team-input" type="text" autocomplete="off" spellcheck="false" placeholder="${escapeHTML(name)}">
      </div>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button>
             <button class="btn btn-danger" id="del-team-confirm" disabled>🗑 Excluir definitivamente</button>`,
  });
  const inp = document.getElementById('del-team-input');
  const btn = document.getElementById('del-team-confirm');
  const matches = () => inp.value.trim() === name;
  const sync = () => { btn.disabled = !matches(); };
  inp.addEventListener('input', sync);
  setTimeout(() => inp.focus(), 50);
  const doDelete = async () => {
    if (!matches()) return;
    btn.disabled = true; btn.textContent = 'Excluindo…';
    try {
      await api.call('teams.php', 'delete', { team_id: teamId });
      toast('Equipe excluída.', 'success');
      if (state.currentTeamId === teamId) {
        const fallback = (state.teams || []).find(t => t.id !== teamId && t.type !== 'personal') || (state.teams || [])[0];
        if (fallback) { try { await switchTeam(fallback.id); } catch (e) {} }
      }
      closeModal(true);
      switchView('equipes');
    } catch (e) { toast(e.message, 'error'); btn.disabled = false; btn.textContent = '🗑 Excluir definitivamente'; }
  };
  btn.onclick = doDelete;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && matches()) { e.preventDefault(); doDelete(); } });
}

function historyTabHTML(teamId) {
  if (teamId !== state.currentTeamId) {
    return `<div class="mp-empty">Abra o quadro desta equipe para ver o histórico completo de atividade.</div>`;
  }
  return `
    <div class="form-section-title" style="margin-bottom:10px;">🕘 Atividade da equipe</div>
    ${activityHTML(state.cards, { emptyText:'Sem atividade registrada nesta equipe.' })}`;
}
