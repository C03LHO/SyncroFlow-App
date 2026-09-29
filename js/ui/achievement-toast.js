/* ═══ SyncroFlow — js/ui/achievement-toast.js
   Notificação animada no canto da tela quando o usuário DESBLOQUEIA
   uma conquista nova. Detecta o "novo" comparando com um conjunto
   já celebrado (localStorage). Na 1ª execução faz um "seed" silencioso
   (não dispara toasts para conquistas que o usuário já tinha). */
import { state } from '../core/state.js';
import { getUnlockedTrophies, RARITY_COLORS } from '../core/trophies.js';
import { escapeHTML } from '../core/dom.js';

const KEY = 'sf_celebrated_trophies';
let _layer = null;

function _load() { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } }
function _save(set) { try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch {} }

function _ensureLayer() {
  if (_layer) return _layer;
  _layer = document.createElement('div');
  _layer.className = 'ach-toast-layer';
  document.body.appendChild(_layer);
  return _layer;
}

/** Mostra um toast para um troféu. */
export function showAchievementToast(tr) {
  const meta = RARITY_COLORS[tr.rarity] || RARITY_COLORS.comum;
  const layer = _ensureLayer();
  const fx = RARITY_FX[tr.rarity] || RARITY_FX.comum;
  const el = document.createElement('div');
  el.className = 'ach-toast ach-r-' + (tr.rarity || 'comum') + (fx.shame ? ' ach-shame' : '');
  el.style.setProperty('--rar', meta.bg);
  el.innerHTML = `
    <div class="ach-toast-glow"></div>
    <div class="ach-toast-shine"></div>
    <div class="ach-toast-icon">${escapeHTML(tr.icon || '🏆')}</div>
    <div class="ach-toast-body">
      <div class="ach-toast-kicker">${fx.kicker}</div>
      <div class="ach-toast-name">${escapeHTML(tr.name || '')}</div>
      <div class="ach-toast-rar" style="color:${meta.bg}">${fx.emoji} ${escapeHTML(meta.label)}</div>
    </div>
    <div class="ach-toast-conf"></div>`;
  layer.appendChild(el);

  // Confete proporcional à raridade (épico/lendário/copa = festa; vergonha = caquinhos)
  if (fx.confetti > 0) _spawnConfetti(el.querySelector('.ach-toast-conf'), fx.confetti, fx.copa);
  if (fx.shame)        _spawnShame(el.querySelector('.ach-toast-conf'));

  // duração maior para raridades altas (deixa a comemoração respirar)
  const dur = 4500 + Math.max(0, fx.tier) * 1200;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 420); };
  el.addEventListener('click', close);
  setTimeout(close, dur);
}

/* Configuração de comemoração por raridade (quanto mais raro, maior a festa) */
const RARITY_FX = {
  comum:    { kicker: '🎉 Conquista desbloqueada', tier: 0, confetti: 0,  emoji: '⚪' },
  incomum:  { kicker: '🎉 Conquista desbloqueada', tier: 1, confetti: 0,  emoji: '🔷' },
  raro:     { kicker: '🌟 Conquista RARA!',         tier: 2, confetti: 16, emoji: '⭐' },
  epico:    { kicker: '✨ Conquista ÉPICA!',         tier: 3, confetti: 30, emoji: '💎' },
  lendario: { kicker: '👑 CONQUISTA LENDÁRIA!',     tier: 4, confetti: 50, emoji: '🏆' },
  copa:     { kicker: '⚽ CONQUISTA DA COPA!',       tier: 4, confetti: 50, emoji: '🏆', copa: true },
  vergonha: { kicker: '💀 Que vergonha…',           tier: 0, confetti: 0,  emoji: '💀', shame: true },
};
const CONF_COLORS = ['#d97757', '#00796D', '#f4c542', '#5ad1c0', '#ff8fb0', '#9be15d', '#a855f7'];
const COPA_COLORS = ['#009c3b', '#ffdf00', '#ffffff', '#009c3b', '#ffdf00'];

function _spawnConfetti(host, n, copa) {
  if (!host) return;
  const cols = copa ? COPA_COLORS : CONF_COLORS;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'ach-conf';
    p.style.background = cols[i % cols.length];
    p.style.setProperty('--dx', (Math.random() * 320 - 160).toFixed(0) + 'px');
    p.style.setProperty('--dy', (-40 - Math.random() * 120).toFixed(0) + 'px');
    p.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
    p.style.animationDelay = (Math.random() * 0.25).toFixed(2) + 's';
    p.style.left = (Math.random() * 100) + '%';
    host.appendChild(p);
  }
}
function _spawnShame(host) {
  if (!host) return;
  for (let i = 0; i < 6; i++) {
    const p = document.createElement('i');
    p.className = 'ach-shame-drop';
    p.style.setProperty('--dx', (Math.random() * 40 - 20).toFixed(0) + 'px');
    p.style.left = (10 + Math.random() * 80) + '%';
    p.style.animationDelay = (Math.random() * 0.4).toFixed(2) + 's';
    host.appendChild(p);
  }
}

/**
 * Verifica se há conquistas novas para o usuário logado e dispara toasts.
 * @param {boolean} silentSeed quando true, só registra o estado sem toasts.
 */
export function celebrateNewAchievements(silentSeed = false) {
  const me = state.currentUser?.name;
  if (!me) return;
  let unlocked;
  try { unlocked = getUnlockedTrophies(me); } catch { return; }
  const seen = _load();
  const firstRun = seen.size === 0;
  const fresh = unlocked.filter(t => !seen.has(t.id));
  if (!fresh.length) return;
  fresh.forEach(t => seen.add(t.id));
  _save(seen);
  // Não enche a tela: no 1º carregamento (ou seed) só registra.
  if (silentSeed || firstRun) return;
  // Ordena por raridade (mostra a mais "valiosa" por último = topo)
  const order = ['comum','incomum','raro','epico','lendario','vergonha','copa'];
  fresh.sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
  fresh.slice(0, 4).forEach((t, i) => setTimeout(() => showAchievementToast(t), i * 650));
}
