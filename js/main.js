/* ═══ SyncroFlow — js/main.js
   Entry point. Lê window.__STATE__ injetado pelo PHP (boot sem fetch
   inicial), monta a UI e inicia o polling. */

import { initState, state, switchTeam, activeRoleInfo } from './core/state.js';
import { applyTheme } from './core/theme.js';
import { startPolling } from './core/poll.js';
import { switchView, registerView } from './core/router.js';
import { wireKeyboard, VIEW_KEYS, VIEW_LABELS } from './ui/keyboard.js';
import { setupNotificationsPanel } from './ui/notifications-panel.js';
import { openThemePicker } from './ui/theme-picker.js';
import { maybeStartOnboarding, startOnboarding } from './ui/onboarding.js';
import { initCardPreview } from './ui/card-preview.js';
import { $, $$, escapeHTML } from './core/dom.js';
import { toast } from './ui/toast.js';
import { on } from './core/events.js';
import './a11y/index.js';   // acessibilidade: skip link, painel ♿, modos visuais, live regions

import { board } from './views/board.js';
import { archived } from './views/archived.js';
import { meudia } from './views/meudia.js';
import { ferias } from './views/ferias.js';
import { dashboard } from './views/dashboard.js';
import { gantt } from './views/gantt.js';
import { ranking } from './views/ranking.js';
import { metrics } from './views/metrics.js';
import { calendar } from './views/calendar.js';
import { mypanel } from './views/mypanel.js';
import { usuarios } from './views/usuarios.js';
import { equipes } from './views/equipes.js';
import { guia } from './views/guia.js';
import { sobre } from './views/sobre.js';

/* ─── Inicialização ─── */
initState(window.__STATE__ || {});
applyTheme(localStorage.getItem('syncro_theme') || 'light');

registerView('board',     board);
registerView('meudia',    meudia);
registerView('ferias',    ferias);
registerView('dashboard', dashboard);
registerView('gantt',     gantt);
registerView('ranking',   ranking);
registerView('metrics',   metrics);
registerView('calendar',  calendar);
registerView('archived',  archived);
registerView('mypanel',   mypanel);
registerView('usuarios',  usuarios);
registerView('equipes',   equipes);
registerView('guia',      guia);
registerView('sobre',     sobre);

/* ─── Seletor de equipe (topbar) ─── */
setupTeamSwitcher();
function setupTeamSwitcher() {
  const wrap = $('#team-switcher');
  const btn  = $('#team-switcher-btn');
  const menu = $('#team-switcher-menu');
  if (!wrap || !btn || !menu) return;

  // restaura última equipe escolhida
  const saved = localStorage.getItem('syncro_team');
  if (saved && (state.teams || []).some(t => t.id === saved)) {
    state.currentTeamId = saved;
  }

  // Quadro pessoal desativado (preferência do usuário): some do seletor e,
  // se for a equipe ativa, cai para a primeira equipe não-pessoal.
  const personalHidden = () => localStorage.getItem('syncro_hide_personal') === '1';
  if (personalHidden()) {
    const cur = (state.teams || []).find(t => t.id === state.currentTeamId);
    if (!cur || cur.type === 'personal') {
      const alt = (state.teams || []).find(t => t.type !== 'personal');
      if (alt) state.currentTeamId = alt.id;
    }
  }

  function renderBtn() {
    const t = (state.teams || []).find(x => x.id === state.currentTeamId) || (state.teams || [])[0];
    if (!t) { wrap.hidden = true; return; }
    wrap.hidden = false;
    $('#team-switcher-icon').textContent = t.icon || (t.type === 'personal' ? '👤' : '👥');
    $('#team-switcher-name').textContent = t.name || 'Equipe';
    updateSidebarRoleBadge();
  }
  // Atualiza o distintivo de cargo no rodapé do sidebar conforme a equipe ativa
  function updateSidebarRoleBadge() {
    const badge = document.querySelector('#btn-go-mypanel .role-badge');
    if (!badge) return;
    const info = activeRoleInfo();
    badge.textContent = info.label;
    badge.className = 'role-badge ' + info.cls;
    badge.title = info.scope === 'team' ? 'Seu cargo na equipe ativa' : 'Seu nível no sistema';
  }
  function renderMenu() {
    const groups = { personal: [], default: [], team: [] };
    (state.teams || []).forEach(t => (groups[t.type] || groups.team).push(t));
    if (personalHidden()) groups.personal = [];   // Quadro pessoal desativado
    const sec = (label, list) => list.length ? `
      <div class="ts-section-label">${label}</div>
      ${list.map(t => `
        <button class="ts-item ${t.id===state.currentTeamId?'active':''}" data-team="${escapeHTML(t.id)}">
          <span class="ts-item-icon">${escapeHTML(t.icon || (t.type==='personal'?'👤':'👥'))}</span>
          <span class="ts-item-name">${escapeHTML(t.name)}</span>
          <span class="ts-item-role">${escapeHTML((t.my_role||'').toUpperCase())}</span>
        </button>`).join('')}` : '';
    const hasPersonal = (state.teams || []).some(t => t.type === 'personal');
    menu.innerHTML =
      sec('Pessoal', groups.personal) +
      sec('Organização', groups.default) +
      sec('Equipes', groups.team) +
      `<a class="ts-item ts-manage" href="#" data-go-equipes>＋ Ver todas as equipes</a>` +
      (hasPersonal ? `<button class="ts-item ts-toggle-personal" data-toggle-personal>${personalHidden() ? '👤 Mostrar Quadro Pessoal' : '🙈 Ocultar Quadro Pessoal'}</button>` : '');
    menu.querySelectorAll('[data-team]').forEach(b => {
      b.onclick = async () => {
        closeMenu();
        if (b.dataset.team === state.currentTeamId) return;
        try {
          await switchTeam(b.dataset.team);
          renderBtn();
          // Mantém SEMPRE a aba atual (Quadro/Gantt/Meu Painel/Usuários/…) e
          // apenas re-renderiza com os dados da nova equipe.
          switchView(state.view || 'board');
          toast('Equipe: ' + ($('#team-switcher-name').textContent), 'info');
        } catch (e) { toast(e.message, 'error'); }
      };
    });
    menu.querySelector('[data-go-equipes]').onclick = (e) => { e.preventDefault(); closeMenu(); switchView('equipes'); };
    const tp = menu.querySelector('[data-toggle-personal]');
    if (tp) tp.onclick = (e) => {
      e.preventDefault();
      const nowHidden = !personalHidden();
      localStorage.setItem('syncro_hide_personal', nowHidden ? '1' : '0');
      // Se estava no Quadro Pessoal e acabou de ocultar, cai para outra equipe.
      if (nowHidden) {
        const cur = (state.teams || []).find(t => t.id === state.currentTeamId);
        if (cur && cur.type === 'personal') {
          const alt = (state.teams || []).find(t => t.type !== 'personal');
          if (alt) { switchTeam(alt.id).then(() => { renderBtn(); switchView(state.view || 'board'); }).catch(() => {}); }
        }
      }
      renderMenu();   // re-renderiza a lista do menu (mantém aberto)
      renderBtn();
      toast(nowHidden ? 'Quadro pessoal ocultado.' : 'Quadro pessoal visível.', 'info');
    };
  }
  function openMenu() { renderMenu(); menu.hidden = false; btn.setAttribute('aria-expanded','true'); }
  function closeMenu() { menu.hidden = true; btn.setAttribute('aria-expanded','false'); }

  btn.onclick = (e) => { e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); };
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) closeMenu(); });

  // Qualquer troca de equipe (inclusive vinda de outras telas) atualiza topbar + badge
  on('team:changed', renderBtn);

  renderBtn();

  // Se havia uma equipe salva diferente da carregada no boot, recarrega
  if (saved && saved !== 'team-default' && (state.teams || []).some(t => t.id === saved)) {
    switchTeam(saved).then(() => { renderBtn(); switchView(state.view || 'board'); }).catch(() => {});
  }
}

/* ─── UI shell wiring ─── */
$('#btn-theme')?.addEventListener('click', (e) => {
  e.stopPropagation();
  openThemePicker(e.currentTarget);
});

// Export CSV
$('#btn-export')?.addEventListener('click', () => {
  const url = (window.__CONFIG__?.apiBase || '/api') + '/reports.php?action=cards_csv';
  const a = document.createElement('a');
  a.href = url; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
  toast('Download de CSV iniciado.', 'success');
});

// Ajuda (atalhos) — modal
$('#btn-help')?.addEventListener('click', () => openHelpModal());

function openHelpModal() {
  import('./ui/modal.js').then(({ openModal }) => {
    const row = (label, keys) =>
      `<div class="shortcut-row"><span>${label}</span><span class="keys">${keys.map(k=>`<kbd>${k}</kbd>`).join('<span class="kbd-plus">+</span>')}</span></div>`;
    // Navegação 1..9 derivada da FONTE ÚNICA (keyboard.js) → sempre correta.
    const navRows = VIEW_KEYS.map((v, i) => row(VIEW_LABELS[v] || v, [String(i + 1)])).join('');
    openModal({
      title: `<span class="modal-title-kicker">Atalhos</span><span style="color:var(--text);">Atalhos de teclado</span>`,
      body: `
        <div class="shortcut-section">Navegação</div>
        <div class="shortcut-list">
          ${navRows}
          ${row('Buscar', ['/'])}
          ${row('Paleta de comandos', ['Ctrl','K'])}
        </div>
        <div class="shortcut-section">Ações</div>
        <div class="shortcut-list">
          ${row('Novo card', ['N'])}
          ${row('Exportar CSV', ['E'])}
          ${row('Trocar tema', ['T'])}
        </div>
        <div class="shortcut-section">Geral</div>
        <div class="shortcut-list">
          ${row('Acessibilidade', ['Alt','A'])}
          ${row('Rever tour', ['Shift','T'])}
          ${row('Esta ajuda', ['Shift','?'])}
          ${row('Fechar / cancelar', ['Esc'])}
        </div>
        <p class="shortcut-foot">Os atalhos ficam desativados enquanto você digita em campos de texto.</p>`,
      footer: `<button class="btn btn-secondary" data-close>Fechar</button>`,
    });
  });
}
// Atalho Shift+? para abrir help
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input','textarea','select'].includes(tag) || e.target.isContentEditable) return;
  if (e.shiftKey && e.key === '?') { e.preventDefault(); openHelpModal(); }
  if (e.shiftKey && (e.key === 'T' || e.key === 't')) { e.preventDefault(); startOnboarding({ force: true }); }
});
// Clique no cartão do usuário (rodapé do sidebar) abre o Meu Painel
$('#btn-go-mypanel')?.addEventListener('click', () => {
  switchView('mypanel');
  $('#sidebar')?.classList.remove('open');
});
$('#btn-sidebar-toggle')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('open'));
$('#btn-sidebar-close')?.addEventListener('click', () => $('#sidebar')?.classList.remove('open'));
$('#sidebar-backdrop')?.addEventListener('click', () => $('#sidebar')?.classList.remove('open'));
$$('.nav-item[data-view]').forEach(b => b.onclick = () => switchView(b.dataset.view));
setupNotificationsPanel();
wireKeyboard();

// 🌋 Conquista oculta "Terremoto": sacudir a rolagem da barra lateral (onde vive o
// Tobi) rápido p/ cima e p/ baixo várias vezes → tremor na cena + fala secreta.
(function wireTobiQuake() {
  async function triggerQuake() {
    try { window.Tobi && window.Tobi.quake && window.Tobi.quake(); } catch {}
    if (localStorage.getItem('sf_terremoto') === '1') return;
    localStorage.setItem('sf_terremoto', '1');
    try {
      const [toastMod, trMod] = await Promise.all([
        import('./ui/achievement-toast.js'), import('./core/trophies.js')]);
      const tr = (trMod.TROPHIES_DEF || []).find(t => t.id === 'terremoto');
      if (tr && toastMod.showAchievementToast) toastMod.showAchievementToast(tr);
    } catch {}
  }
  function attach(el) {
    let last = el.scrollTop, dirLast = 0, rev = 0, t = 0;
    el.addEventListener('scroll', () => {
      const now = Date.now(), top = el.scrollTop;
      const d = top > last ? 1 : top < last ? -1 : 0;
      if (d && d !== dirLast) {
        rev = (now - t < 700) ? rev + 1 : 1; t = now; dirLast = d;
        if (rev >= 6) { rev = 0; triggerQuake(); }
      }
      last = top;
    }, { passive: true });
  }
  [document.getElementById('sidebar'), document.querySelector('#sidebar .nav')]
    .filter(Boolean).forEach(attach);
})();

// Atualiza o título da página no topbar conforme a view
const PAGE_TITLES = {
  board:'Quadro', dashboard:'Dashboard', gantt:'Gantt', calendar:'Calendário',
  ferias:'Férias', mypanel:'Meu Painel', equipes:'Equipes', usuarios:'Usuários',
  guia:'Guia', sobre:'Sobre',
};
import('./core/events.js').then(({ on }) => {
  on('view:changed', (name) => {
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = PAGE_TITLES[name] || 'Quadro';
  });
});

// Busca global → propaga para os filtros e força a view Board
const searchEl = $('#global-search');
if (searchEl) {
  searchEl.addEventListener('input', () => {
    state.filters = { ...(state.filters || {}), search: searchEl.value };
    if (state.view !== 'board') switchView('board');
    else import('./views/board.js').then(m => m.board.render(document.getElementById('main')));
  });
}

/* ─── Banner de manutenção (sempre visível quando ativo) ─── */
(function showMaintenanceBar() {
  const m = state.maintenanceMode;
  if (!m?.enabled) return;
  const fmt = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); };
  const times = [];
  if (m.scheduled_start) times.push('Início: ' + fmt(m.scheduled_start));
  if (m.expected_return) times.push('Retorno previsto: ' + fmt(m.expected_return));
  const bar = document.createElement('div');
  bar.className = 'maint-bar';
  bar.innerHTML = `
    <span class="maint-ico">⚙️</span>
    <div class="maint-text">
      <strong>Modo manutenção ativo.</strong>
      ${escapeHTML(m.message || 'O sistema pode ficar temporariamente instável. Salve seu trabalho com frequência.')}
      ${times.length ? `<span class="maint-times">${escapeHTML(times.join(' · '))}</span>` : ''}
    </div>`;
  const main = $('.main');
  if (main) main.prepend(bar); else document.body.prepend(bar);
})();

/* ─── Boot da view ─── */
switchView(localStorage.getItem('syncro_last_view') || 'board');

/* ─── Polling ─── */
startPolling();

/* ─── Status online/offline (substitui o antigo modo Visualização) ─── */
(function setupPresence() {
  const pill = $('#sb-mode-pill');
  const pillText = $('#sb-mode-text');
  const connDot = $('#conn-dot');
  const connText = $('#conn-text');
  let online = navigator.onLine !== false;
  const apply = () => {
    if (pill) { pill.classList.toggle('online', online); pill.classList.toggle('offline', !online); pill.classList.remove('view'); }
    if (pillText) pillText.textContent = online ? 'Online' : 'Offline';
    if (connDot) { connDot.classList.toggle('conn-ok', online); connDot.classList.toggle('conn-error', !online); }
    if (connText) connText.textContent = online ? 'Conectado' : 'Sem conexão';
  };
  apply();
  import('./core/events.js').then(({ on }) => {
    on('conn:status', ({ online: o }) => { if (o !== online) { online = o; apply(); } });
  });
  window.addEventListener('online',  () => { online = true;  apply(); });
  window.addEventListener('offline', () => { online = false; apply(); });
})();

/* ─── Pré-visualização de cards ao passar o mouse ─── */
initCardPreview();

/* ─── Tour de onboarding (primeiro acesso) ─── */
maybeStartOnboarding();
window.SyncroTour = startOnboarding;   // permite reabrir (ex.: pela Guia)

/* ─── Boas-vindas discreto ─── */
queueMicrotask(() => {
  if (state.currentUser?.name) {
    console.log(`%cSyncroFlow ${window.__CONFIG__?.version} — logado como ${state.currentUser.name} (${state.currentUser.role})`,
      'color:#0a8f84;font-weight:bold;');
  }
});

/* ─── Conquistas: toast no canto ao desbloquear ───
   Seed silencioso no boot (não celebra o que já tinha) e, a cada mudança
   de estado (poll/ações), checa de forma debounced se algo novo apareceu. */
import('./ui/achievement-toast.js').then(({ celebrateNewAchievements }) => {
  celebrateNewAchievements(true);   // seed silencioso
  let t = null;
  const debounced = () => { clearTimeout(t); t = setTimeout(() => celebrateNewAchievements(false), 1200); };
  on('state:changed', debounced);
  on('poll:applied', debounced);
  on('view:changed', debounced);
});

// Global handler: transforma forms com `data-confirm` em diálogos estilizados
// Prefer interceptar o clique (captura) para evitar submissões diretas
document.addEventListener('click', (e) => {
  if (e.defaultPrevented) return;
  const btn = e.target.closest('button, input[type="submit"]');
  if (!btn) return;
  const form = btn.closest('form');
  if (!form) return;
  const msg = form.dataset.confirm;
  if (!msg) return;
  // só botões de disparo (ignora type=button)
  const btType = (btn.getAttribute('type') || 'submit').toLowerCase();
  if (btType === 'button') return;
  e.preventDefault();
  import('./ui/confirm.js').then(({ confirmDialog }) => {
    confirmDialog({ title: 'Confirmar', message: msg, confirmText: 'OK', cancelText: 'Cancelar', danger: !!form.querySelector('.stx-danger') })
      .then(ok => {
        if (!ok) return;
        // preserva name/value do botão clicado quando possível
        let tmp = null;
        try {
          if (btn.name) {
            tmp = document.createElement('input'); tmp.type = 'hidden'; tmp.name = btn.name; tmp.value = btn.value || '';
            form.appendChild(tmp);
          }
          form.submit();
        } finally {
          if (tmp) tmp.remove();
        }
      });
  }).catch(() => {
    if (confirm(msg)) form.submit();
  });
}, true);

// Fallback: também intercepta submit (alguns scripts podem disparar diretamente)
document.addEventListener('submit', (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  const msg = form.dataset.confirm;
  if (!msg) return;
  e.preventDefault();
  import('./ui/confirm.js').then(({ confirmDialog }) => {
    confirmDialog({ title: 'Confirmar', message: msg, confirmText: 'OK', cancelText: 'Cancelar', danger: !!form.querySelector('.stx-danger') })
      .then(ok => { if (ok) form.submit(); });
  }).catch(() => { if (confirm(msg)) form.submit(); });
});
