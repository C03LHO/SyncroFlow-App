/* ═══ SyncroFlow — js/ui/onboarding.js
   Tour de boas-vindas estilo "spotlight" (coach-marks): destaca elementos reais da interface com recorte
   + tooltip posicionado ao lado, passo a passo. Cai para um cartão
   central quando o alvo não está visível (ex.: telas pequenas). */
import { state } from '../core/state.js';
import { api } from '../core/api.js';

let _step = 0;
let _steps = [];
let _onResize = null;
let _canSkip = false;   // 1º tour não pode pular; só ao rever com Shift+T

/* Quanto cada imagem deve "descer" para o castor encostar na borda do cartão.
   Calculado a partir da margem transparente inferior de cada imagem (medida
   real). Valor = sobreposição em px. */
const TOBI_DROP = {
  'atividades.webp': 18, 'feliz.webp': 22, 'esperto.webp': 23,
  'duvida.webp': 23, 'joinha.webp': 20,
};

function buildSteps(role) {
  const isDev = role === 'ti';
  const isGestor = role === 'gestor';
  const all = [
    { target: null, icon: '👋', title: `Bem-vindo(a) ao SyncroFlow!`, img: 'feliz.webp',
      body: 'O Kanban para organizar iniciativas, acompanhar prazos e mostrar resultados. Vou te mostrar o essencial em poucos passos.', placement: 'center' },
    { target: '[data-view="board"]', icon: '🗂️', title: 'O Quadro', img: 'atividades.webp',
      body: 'Aqui ficam os cartões da equipe, organizados por colunas de progresso. Arraste para mudar o status e clique para abrir os detalhes.', placement: 'right' },
    { target: '#team-switcher', icon: '🏢', title: 'Alternar equipe', img: 'esperto.webp',
      body: isGestor || isDev
        ? 'Use este seletor para alternar entre suas equipes. Você pode criar novas equipes e convidar pessoas na aba Equipes.'
        : 'Use este seletor para alternar entre as equipes de que você participa.', placement: 'bottom' },
    { target: '[data-view="mypanel"]', icon: '👤', title: 'Meu Painel', img: 'joinha.webp',
      body: 'Seu espaço pessoal: seus cards, próximas entregas, mapa de atividade, burndown do mês, conquistas e edição de perfil (foto, capa e dados).', placement: 'right' },
    { target: '[data-view="equipes"]', icon: '👥', title: 'Equipes', img: 'feliz.webp',
      body: isGestor || isDev
        ? 'Crie equipes, convide membros e gerencie colunas, mural e permissões de cada uma.'
        : 'Encontre equipes e peça entrada — um gestor aprova seu acesso.', placement: 'right' },
    { target: '[data-view="usuarios"]', icon: '🪪', title: 'Usuários', img: 'esperto.webp',
      body: 'Veja todas as pessoas do sistema e abra o perfil de cada uma (cargo, equipes, atividade e estatísticas).', placement: 'right' },
    { target: '#global-search', icon: '🔎', title: 'Busca rápida', img: 'duvida.webp',
      body: 'Pressione <kbd>/</kbd> a qualquer momento para buscar cards, tags e pessoas. Use <kbd>N</kbd> para criar um card.', placement: 'bottom' },
    { target: '#btn-notifications', icon: '🔔', title: 'Notificações', img: 'atividades.webp',
      body: 'Acompanhe menções, convites de equipe e <strong>pedidos para aceitar/recusar</strong> — tudo em tempo real.', placement: 'bottom' },
    { target: '#tobi-scene', icon: '🦫', title: 'Esse é o Tobi!', img: 'feliz.webp',
      body: 'O castor mascote do SyncroFlow. Ele trabalha, toma café e cochila aqui no rodapé — <strong>comemora</strong> quando você conclui um card e fica <strong>assustado</strong> com prazos atrasados. Clique nele pra uma palhinha!<br><br>Não curte mascote? Você pode <strong>desativar o Tobi</strong> quando quiser em <strong>♿ Acessibilidade</strong> (<kbd>Alt</kbd>+<kbd>A</kbd>).',
      placement: 'top', tobi: true },
    { target: null, icon: '⚡', title: 'Login automático?', img: 'duvida.webp', autologin: true,
      body: 'Quer entrar <strong>direto neste dispositivo</strong>, sem digitar a senha toda vez? É seguro (usamos um token, nunca guardamos sua senha) e você pode <strong>desativar quando quiser</strong> no seu perfil (Meu Painel → Editar perfil).', placement: 'center' },
    { target: null, icon: '🚀', title: 'Tudo pronto!', img: 'joinha.webp',
      body: roleBlurb(role) + '<br><br>Você pode rever este tour quando quiser com <kbd>Shift</kbd>+<kbd>T</kbd>. Bom trabalho!', placement: 'center' },
  ];
  // Remove passos cujo alvo não existe OU está oculto (ex.: seletor de equipe
  // escondido, ou itens da sidebar fora de tela no mobile → vira passo central).
  return all.filter(s => {
    if (!s.target) return true;
    const el = document.querySelector(s.target);
    if (!el) return false;
    if (el.offsetParent === null && el.getClientRects().length === 0) {
      // alvo presente porém oculto: mantém como passo central
      s.target = null; s.placement = 'center';
    }
    return true;
  });
}

function roleBlurb(role) {
  switch (role) {
    case 'ti': return 'Você é <strong>TI – Dev</strong>: controle total do sistema — todas as equipes, configurações globais, usuários, manutenção e backups.';
    case 'gestor': return 'Você é <strong>Gestor</strong>: cria equipes, convida pessoas e gerencia cards, colunas e o mural das suas equipes.';
    case 'analista': return 'Você é <strong>Analista</strong>: cria, edita e comenta cards nas equipes em que participa.';
    default: return 'Você é <strong>Visitante</strong>: acesso de leitura aos quadros e relatórios das equipes em que participa.';
  }
}

/* ── elementos do overlay ── */
function ensureNodes() {
  let hl = document.getElementById('ont-highlight');
  let tip = document.getElementById('ont-tooltip');
  if (!hl) { hl = document.createElement('div'); hl.id = 'ont-highlight'; hl.className = 'onboarding-highlight'; document.body.appendChild(hl); }
  if (!tip) { tip = document.createElement('div'); tip.id = 'ont-tooltip'; tip.className = 'onboarding-tooltip'; document.body.appendChild(tip); }
  return { hl, tip };
}

function cleanup() {
  document.getElementById('ont-highlight')?.remove();
  document.getElementById('ont-tooltip')?.remove();
  if (_onResize) { window.removeEventListener('resize', _onResize); window.removeEventListener('scroll', _onResize, true); _onResize = null; }
  document.removeEventListener('keydown', onKey, true);
}

function visibleRect(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const vw = innerWidth, vh = innerHeight;
  if (r.width === 0 || r.height === 0) return null;
  if (r.bottom < 8 || r.top > vh - 8 || r.right < 8 || r.left > vw - 8) return null; // fora da tela
  return r;
}

function paint() {
  const { hl, tip } = ensureNodes();
  const step = _steps[_step];
  if (!step) return finish();
  const total = _steps.length;
  const target = step.target ? document.querySelector(step.target) : null;
  const rect = step.placement === 'center' ? null : visibleRect(target);

  // recorte / destaque
  if (rect) {
    const pad = 6;
    hl.style.display = 'block';
    hl.style.cssText = `display:block;left:${rect.left - pad}px;top:${rect.top - pad}px;width:${rect.width + pad*2}px;height:${rect.height + pad*2}px;`;
  } else {
    hl.style.display = 'none';
    hl.style.boxShadow = '0 0 0 9999px rgba(7,18,18,.62)';
  }

  const isLast = _step === total - 1;
  const isFirst = _step === 0;
  tip.classList.toggle('has-tobi', !!step.img);
  const drop = TOBI_DROP[step.img] ?? 22;
  tip.innerHTML = `
    ${step.img ? `<img class="ont-tobi" src="imagens/mascote/${step.img}" alt="Tobi" draggable="false" style="bottom:calc(100% - ${drop}px)">` : ''}
    <div class="ont-head">
      <span class="ont-icon">${step.icon || '✨'}</span>
      <span class="ont-step">Passo ${_step + 1} de ${total}</span>
      ${_canSkip ? `<button class="ont-skip" data-act="skip" title="Pular">Pular ✕</button>` : ''}
    </div>
    <div class="ont-title">${step.title}</div>
    <div class="ont-body">${step.body}</div>
    <div class="ont-footer">
      <div class="ont-dots">${_steps.map((_, i) => `<span class="ont-dot ${i===_step?'active':''}" data-dot="${i}"></span>`).join('')}</div>
      <div class="ont-actions">
        ${step.autologin ? `
          <button class="btn btn-secondary btn-sm" data-act="al-no">Agora não</button>
          <button class="btn btn-primary btn-sm" data-act="al-yes">⚡ Ativar</button>
        ` : `
          ${!isFirst ? `<button class="btn btn-secondary btn-sm" data-act="prev">Anterior</button>` : ''}
          <button class="btn btn-primary btn-sm" data-act="next">${isLast ? 'Concluir 🚀' : 'Próximo'}</button>
        `}
      </div>
    </div>`;

  // posicionamento
  tip.style.transform = 'none';
  tip.style.visibility = 'hidden';
  tip.style.left = '0px'; tip.style.top = '0px';
  const tw = tip.offsetWidth || 326;
  const th = tip.offsetHeight || 210;
  const vw = innerWidth, vh = innerHeight, gap = 14, m = 8;
  const topRoom = step.img ? 110 : m;   // reserva espaço p/ o Tobi que aparece acima do cartão
  if (!rect) {
    tip.style.left = Math.round((vw - tw) / 2) + 'px';
    tip.style.top = Math.round(Math.max(topRoom, (vh - th) / 2)) + 'px';
  } else {
    let left, top;
    if (step.placement === 'right')       { left = rect.right + gap; top = rect.top + rect.height/2 - th/2; }
    else if (step.placement === 'left')   { left = rect.left - tw - gap; top = rect.top + rect.height/2 - th/2; }
    else if (step.placement === 'top')    { left = rect.left + rect.width/2 - tw/2; top = rect.top - th - gap; }
    else                                  { left = rect.left + rect.width/2 - tw/2; top = rect.bottom + gap; }
    // se não cabe à direita (tela estreita), joga pra baixo
    if (step.placement === 'right' && left + tw > vw - m) { left = rect.left + rect.width/2 - tw/2; top = rect.bottom + gap; }
    left = Math.max(m, Math.min(left, vw - tw - m));
    top  = Math.max(topRoom, Math.min(top,  vh - th - m));
    tip.style.left = Math.round(left) + 'px';
    tip.style.top  = Math.round(top) + 'px';
  }
  tip.style.visibility = 'visible';

  // 🦫 quando o passo é sobre o Tobi, ele comemora pra se apresentar
  if (step.tobi && window.Tobi) { try { window.Tobi.cheer('oi, eu sou o Tobi! 🦫'); } catch (e) {} }
}

function onKey(e) {
  if (e.key === 'Escape') { if (_canSkip) { e.preventDefault(); finish(); } }  // 1º tour não fecha no Esc
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
}
function next() { if (_step >= _steps.length - 1) return finish(); _step++; paint(); }
function prev() { _step = Math.max(0, _step - 1); paint(); }

async function finish() {
  cleanup();
  try {
    await api.call('achievements.php', 'set_onboarding', { done: true });
    if (state.currentUser) state.currentUser.onboarding_done = 1;
  } catch {}
}

export function startOnboarding(opts = {}) {
  cleanup();
  _canSkip = !!opts.force;   // só permite pular quando reaberto (Shift+T)
  _step = 0;
  _steps = buildSteps(state.currentUser?.role || 'visitante');
  // pré-carrega as imagens do Tobi p/ não piscar ao trocar de passo
  [...new Set(_steps.map(s => s.img).filter(Boolean))].forEach(f => { const im = new Image(); im.src = 'imagens/mascote/' + f; });
  const { tip } = ensureNodes();
  tip.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'next') next();
    else if (act === 'prev') prev();
    else if (act === 'skip') finish();
    else if (act === 'al-no') next();
    else if (act === 'al-yes') {
      try { await api.call('auth.php', 'enable_autologin', {}); } catch {}
      try { const { toast } = await import('./toast.js'); toast('Login automático ativado neste dispositivo.', 'success'); } catch {}
      next();
    }
    const dot = e.target.closest('[data-dot]');
    if (dot) { _step = +dot.dataset.dot; paint(); }
  });
  _onResize = () => paint();
  window.addEventListener('resize', _onResize);
  window.addEventListener('scroll', _onResize, true);
  document.addEventListener('keydown', onKey, true);
  paint();
}

/** Dispara o tour no primeiro acesso. */
export function maybeStartOnboarding() {
  const done = state.currentUser?.onboarding_done ?? state.currentUser?.onboardingDone;
  if (!done) setTimeout(() => startOnboarding(), 650);
}
