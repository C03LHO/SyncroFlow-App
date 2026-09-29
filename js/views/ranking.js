/* ═══ SyncroFlow — js/views/ranking.js
   Placar de produtividade (concluídos + pontualidade), sequências
   (streaks) reais do histórico, e os selos/troféus já conquistados. */
import { state } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { api } from '../core/api.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/confirm.js';
import { getUnlockedTrophies, TROPHIES_DEF, RARITY_COLORS } from '../core/trophies.js';

let period = '30d';
let scope = 'team';

const PERIODS = [['7d', '7 dias'], ['30d', '30 dias'], ['90d', '90 dias'], ['all', 'Tudo']];

export const ranking = {
  async render(mount) {
    mount.innerHTML = `<div class="boot-loader">Carregando ranking…</div>`;
    await paint(mount);
  }
};

async function paint(mount) {
  let data;
  try {
    data = await api.call('ranking.php', 'list', { scope, period, team_id: state.currentTeamId }, 'GET');
  } catch (e) {
    mount.innerHTML = `<div class="empty-state"><h3>Erro</h3><p>${escapeHTML(e.message)}</p></div>`;
    return;
  }

  let lg = null;
  try {
    lg = await api.call('leagues.php', 'standings', {}, 'GET');
  } catch (e) {
    console.warn('Ranking: failed to load leagues data', e);
    lg = { error: true, message: e.message || 'Erro na API de ligas.' };
  }

  const rows = data.ranking || [];
  const me = data.me || state.currentUser?.name || '';
  const mine = rows.find(r => r.isMe);
  const medal = (r) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `<span class="rk-num">${r}</span>`;

  const rankRow = (r) => `
    <div class="rk-row ${r.isMe ? 'is-me' : ''} ${r.rank <= 3 ? 'is-top' : ''}">
      <span class="rk-pos">${medal(r.rank)}</span>
      <span class="rk-avatar" style="--ac:${escapeHTML(r.color)}">${r.avatar ? `<img src="${escapeHTML(r.avatar)}" alt="">` : escapeHTML((r.display || '?')[0].toUpperCase())}</span>
      <span class="rk-name">${escapeHTML(r.display)}${r.isMe ? ' <span class="rk-you">você</span>' : ''}</span>
      <span class="rk-streak" title="Sequência atual de dias com conclusões">${r.streak > 0 ? '🔥 ' + r.streak + 'd' : '—'}</span>
      <span class="rk-stat" title="Concluídos no prazo">⏱ ${r.onTime}</span>
      <span class="rk-stat" title="Total concluído">✅ ${r.done}</span>
      <span class="rk-points">${r.points} pts</span>
    </div>`;

  // ── Selos do usuário (reaproveita o sistema de troféus, client-side) ──
  let unlocked = [];
  try { unlocked = getUnlockedTrophies(me); } catch {}
  const totalTrophies = TROPHIES_DEF.filter(t => !t.hidden).length;
  const seloChip = (t) => {
    const rc = RARITY_COLORS[t.rarity] || RARITY_COLORS.comum;
    return `<span class="rk-selo" style="--rc:${rc.bg}" title="${escapeHTML(t.description)} · ${escapeHTML(rc.label)}">
      <span class="rk-selo-ico">${t.icon}</span><span class="rk-selo-name">${escapeHTML(t.name)}</span></span>`;
  };
  const visibleUnlocked = unlocked.filter(t => !t.hidden || true); // mostra todos os conquistados

  mount.innerHTML = `
    <div class="rk-page">
      <div class="rk-pagehead">
        <div>
          <h1>🏆 Ranking &amp; Ligas</h1>
          <p>Suba de liga concluindo cards na semana. <strong>XP</strong> = concluídos ×10 + no prazo ×5.</p>
        </div>
        <div class="rk-filters">
          <div class="rk-seg" id="rk-scope">
            <button data-scope="team" class="${scope === 'team' ? 'active' : ''}">Esta equipe</button>
            <button data-scope="all" class="${scope === 'all' ? 'active' : ''}">Todas</button>
          </div>
          <div class="rk-seg" id="rk-period">
            ${PERIODS.map(([v, l]) => `<button data-period="${v}" class="${period === v ? 'active' : ''}">${l}</button>`).join('')}
          </div>
        </div>
      </div>

      ${lg ? renderLeague(lg) : ''}

      ${mine ? `
      <div class="rk-mecard">
        <div class="rk-me-pos">${medal(mine.rank)}</div>
        <div class="rk-me-main">
          <div class="rk-me-name">${escapeHTML(mine.display)}</div>
          <div class="rk-me-sub">${mine.done} concluído(s) · ${mine.onTime} no prazo</div>
        </div>
        <div class="rk-me-streak"><span>🔥 ${mine.streak}</span><small>sequência atual</small></div>
        <div class="rk-me-streak"><span>🏅 ${mine.bestStreak}</span><small>melhor sequência</small></div>
        <div class="rk-me-streak"><span>${mine.points}</span><small>pontos</small></div>
      </div>` : ''}

      <div class="rk-board">
        <div class="rk-row rk-head">
          <span class="rk-pos">#</span><span class="rk-avatar"></span><span class="rk-name">Pessoa</span>
          <span class="rk-streak">Seq.</span><span class="rk-stat">No prazo</span><span class="rk-stat">Total</span><span class="rk-points">Pontos</span>
        </div>
        ${rows.length ? rows.map(rankRow).join('') : `<div class="rk-empty">Nenhuma conclusão no período selecionado.</div>`}
      </div>

      <div class="rk-selos-box">
        <h2>🎖️ Meus selos <span class="rk-selos-count">${unlocked.length}/${totalTrophies}</span></h2>
        ${visibleUnlocked.length
          ? `<div class="rk-selos">${visibleUnlocked.map(seloChip).join('')}</div>`
          : `<p class="rk-empty" style="margin:8px 0 0;">Você ainda não desbloqueou selos. Conclua cards para começar! 💪</p>`}
        <p class="text-muted text-sm" style="margin:10px 0 0;">Veja a coleção completa em <strong>Meu Painel</strong>.</p>
      </div>
    </div>`;

  mount.querySelectorAll('#rk-scope [data-scope]').forEach(b => b.onclick = () => { scope = b.dataset.scope; paint(mount); });
  mount.querySelectorAll('#rk-period [data-period]').forEach(b => b.onclick = () => { period = b.dataset.period; paint(mount); });

  // Reiniciar ranking — só o TI-Dev vê este botão (o backend também valida).
  const resetBtn = mount.querySelector('#lg-reset');
  if (resetBtn) resetBtn.onclick = async () => {
    const ok = await confirmDialog({
      title: 'Reiniciar ranking',
      message: 'Todos voltam à liga mais baixa (Girino) e a competição da semana recomeça do zero. Esta ação não pode ser desfeita. Continuar?',
      confirmText: 'Reiniciar tudo', danger: true, icon: '↺',
    });
    if (!ok) return;
    resetBtn.disabled = true;
    try {
      const r = await api.call('leagues.php', 'reset', {});
      toast(`Ranking reiniciado — ${r.affected || 0} pessoa(s) voltaram ao Girino.`, 'success');
      paint(mount);
    } catch (e) { resetBtn.disabled = false; toast(e.message || 'Erro ao reiniciar.', 'error'); }
  };
}

/* ─── Bloco de Ligas (estilo Duolingo, temático aquático) ─── */
function renderLeague(lg) {
  if (!lg) return '';
  if (lg.error) {
    return `
      <div class="lg-error">
        <strong>Não foi possível carregar as ligas.</strong>
        <p>${escapeHTML(lg.message)}</p>
      </div>`;
  }

  const myTier = Number.isInteger(lg.myTier) ? lg.myTier : (parseInt(lg.myTier, 10) || 1);
  const L = lg.myLeague || {};
  const n = (lg.standings || []).length;
  const pz = lg.promoteZone || 0, dz = lg.demoteZone || 0;
  const next = (lg.ladder || []).find(t => t.tier === myTier + 1);
  const qm = lg.quorum || {};

  // Banner: a liga precisa de um número mínimo de participantes para competir.
  let quorumBanner = '';
  if (lg.tierHasQuorum === false) {
    const min = lg.minPerTier || 10;
    const faltam = lg.missingForQuorum != null ? lg.missingForQuorum : Math.max(0, min - n);
    quorumBanner = `
      <div class="lg-quorum">
        <span class="lg-quorum-ico">⏳</span>
        <div class="lg-quorum-txt">
          <strong>Ranking ainda não está valendo nesta liga</strong>
          <p>Para promover ou rebaixar, a liga precisa de <b>${min} participantes</b>. Hoje são <b>${n}</b> — faltam <b>${faltam}</b>. Até lá, ninguém sobe nem desce.</p>
        </div>
      </div>`;
  }

  // Resumo da última virada (se houver).
  let lastNote = '';
  const lr = qm.lastResult;
  if (lr && lr.status) {
    if (lr.status === 'reset') lastNote = `Ranking reiniciado por TI-Dev — ${lr.affected || 0} pessoa(s) ao Girino.`;
    else if (lr.status === 'applied') lastNote = `Última virada: ⬆ ${lr.promoted || 0} subiram · ⬇ ${lr.demoted || 0} desceram.`;
  }

  const leagueIco = (t, big) => t.img
    ? `<img class="${big ? 'lg-badge-img' : 'lg-step-img'}" src="${escapeHTML(t.img)}" alt="${escapeHTML(t.name)}" onerror="this.replaceWith(document.createTextNode('${t.icon || '🏅'}'))">`
    : (t.icon || '🏅');

  // Só mostra a liga ANTERIOR, a ATUAL e a PRÓXIMA (não a escada inteira).
  const byTier = {}; (lg.ladder || []).forEach(t => { byTier[t.tier] = t; });
  const prevL = byTier[myTier - 1];
  const currL = byTier[myTier] || L;
  const nextL = byTier[myTier + 1];
  const step = (t, role, tag) => t
    ? `<div class="lg-step lg-step-${role}" title="${escapeHTML(t.name)} (liga ${11 - t.tier}ª de 10)" style="--lc:${escapeHTML(t.color || '#888')}">
         <span class="lg-step-ico">${leagueIco(t, false)}</span>
         <span class="lg-step-name">${escapeHTML(t.name)}</span>
         <span class="lg-step-tag">${tag}</span>
       </div>`
    : `<div class="lg-step lg-step-empty">
         <span class="lg-step-ico">∅</span>
         <span class="lg-step-name">${role === 'prev' ? 'nenhuma' : 'no topo'}</span>
         <span class="lg-step-tag">${role === 'prev' ? 'liga mínima' : 'liga máxima'}</span>
       </div>`;
  const ladder = `
    ${step(prevL, 'prev', 'anterior')}
    <span class="lg-step-arrow">›</span>
    ${step(currL, 'current', 'você está aqui')}
    <span class="lg-step-arrow">›</span>
    ${step(nextL, 'next', 'próxima')}`;

  const stand = n ? lg.standings.map(r => {
    const zone = r.rank <= pz ? 'is-promote' : (dz && r.rank > n - dz ? 'is-demote' : '');
    return `<div class="lg-row ${r.isMe ? 'is-me' : ''} ${zone}">
      <span class="lg-rank">${r.rank}</span>
      <span class="lg-avatar" style="--ac:${escapeHTML(r.color)}">${r.avatar ? `<img src="${escapeHTML(r.avatar)}" alt="">` : escapeHTML((r.display || '?')[0].toUpperCase())}</span>
      <span class="lg-name">${escapeHTML(r.display)}${r.isMe ? ' <span class="rk-you">você</span>' : ''}</span>
      <span class="lg-xp">${r.xp} XP</span>
    </div>`;
  }).join('') : `<div class="rk-empty">Ninguém pontuou nesta liga ainda esta semana. Conclua cards para abrir vantagem! 💪</div>`;

  return `
    <div class="lg-hero" style="--lc:${escapeHTML(L.color || '#888')}">
      <div class="lg-badge">${leagueIco(L, true)}</div>
      <div class="lg-hero-info">
        <div class="lg-hero-kicker">Sua liga · ${11 - lg.myTier}ª de 10 · semana atual</div>
        <div class="lg-hero-name">Liga ${escapeHTML(L.name || '')}</div>
        <div class="lg-hero-sub">
          ${myTier >= 10
            ? 'Você está na <b>liga máxima — o Ferro</b> 🔩. Segure o topo!'
            : (pz
                ? `Os <b>${pz}</b> primeiros sobem${next ? ' para <b>' + escapeHTML(next.name) + '</b>' : ''}.${dz ? ` Os <b>${dz}</b> últimos descem.` : ''}`
                : `Conclua cards para subir${next ? ' para a <b>' + escapeHTML(next.name) + '</b>' : ' de liga'}.`)}
        </div>
      </div>
    </div>
    ${quorumBanner}
    <div class="lg-ladder">${ladder}</div>
    <div class="lg-standings">
      ${pz ? '<div class="lg-zlabel is-promote">⬆ Zona de promoção</div>' : ''}
      ${stand}
    </div>
    <div class="lg-legend">
      ${pz ? '<span><i class="lg-sw is-promote"></i> sobe de liga</span>' : ''}
      ${dz ? '<span><i class="lg-sw is-demote"></i> desce de liga</span>' : ''}
      <span class="text-muted">${escapeHTML(lg.weekEndsHint || 'A virada acontece toda sexta-feira.')}</span>
      ${lastNote ? `<span class="lg-lastnote text-muted">· ${escapeHTML(lastNote)}</span>` : ''}
      ${lg.canReset ? '<button class="btn btn-xs btn-ghost lg-reset-btn" id="lg-reset" title="Apenas o TI-Dev">↺ Reiniciar ranking</button>' : ''}
    </div>`;
}
