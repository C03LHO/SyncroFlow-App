/* ═══════════════════════════════════════════════════════════

Tobi — mascote pixel-art do SyncroFlow 🦫
Vanilla JS autônomo — versão 8-bit videogame
Sem bochecha rosa e sem corações.
═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

const CONFIG = {
SCALE: 3,
WALK_MS: 3000,

RESPECT_REDUCED_MOTION: false,

deskW: 48,
deskRight: 6,
chairGap: 6,
coffeeLeft: 4,
trashGap: 26,
sofaW: 62,
sofaCenterPct: 0.40,

seatDeskGap: 34,
coffeeOtterDx: 14,
sleepOtterDx: 4,

seatRaise: 7,
chairUnderDx: 18,
chairRaise: 0,
napY: -8,

minWSofa: 150,
minWCoffee: 120,
minWTrash: 200,

loop: {
  afterWork: 7000,
  afterCoffee: 6000,
  afterSleep: 6000,
  restart: 7000
}

};

/* ═══════════════════════════════════════════════════════════
   🎉 Temas sazonais do Tobi — cada data comemorativa muda a
   ROUPA (pixel-art), as FALAS e a DECORAÇÃO do ambiente, e
   ativa sozinha na data certa.
   Testar/forçar:  window.TOBI_THEME = 'natal'   (ids abaixo)
                   window.TOBI_THEME = 'none'    (desliga)
                   localStorage.setItem('tobi_theme','natal')
   ═══════════════════════════════════════════════════════════ */

/* ── helpers de data ── */
function _mmdd(d) {
  return ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function _between(d, from, to) {                 // 'MM-DD'..'MM-DD' (aceita virada de ano)
  const s = _mmdd(d);
  return (from <= to) ? (s >= from && s <= to) : (s >= from || s <= to);
}
function _easter(y) {                            // domingo de Páscoa (algoritmo de Computus)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100,
        d = Math.floor(b / 4), e = b % 4,
        f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
        h = (19 * a + b - d - g + 15) % 30,
        i = Math.floor(c / 4), k = c % 4,
        l = (32 + 2 * e + 2 * i - h - k) % 7,
        m = Math.floor((a + 11 * h + 22 * l) / 451),
        mo = Math.floor((h + l - 7 * m + 114) / 31),
        da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, da);
}
function _addDays(dt, n) { const r = new Date(dt); r.setDate(r.getDate() + n); return r; }
function _day(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
function _inDates(now, start, end) { const t = _day(now); return t >= _day(start) && t <= _day(end); }

/* ── decoração: bandeirola (garland) + flutuantes (emoji) ── */
function _mkGarland(scene, colors, bulbs) {
  const g = document.createElement('div');
  g.className = 'tobi-garland' + (bulbs ? ' bulbs' : '');
  for (let i = 0; i < 14; i++) {
    const f = document.createElement('i');
    f.className = 'tf';
    const c = colors[i % colors.length];
    if (bulbs) f.style.background = c; else f.style.borderTopColor = c;
    g.appendChild(f);
  }
  scene.appendChild(g);
}
function _mkFloaters(scene, emojis, n) {
  const w = document.createElement('div');
  w.className = 'tobi-floaters';
  for (let i = 0; i < (n || 6); i++) {
    const s = document.createElement('i');
    s.textContent = emojis[i % emojis.length];
    s.style.left = (6 + Math.random() * 86).toFixed(0) + '%';
    s.style.bottom = (10 + Math.random() * 46).toFixed(0) + 'px';
    s.style.fontSize = (9 + Math.random() * 4).toFixed(0) + 'px';
    s.style.animationDelay = (Math.random() * 2).toFixed(2) + 's';
    w.appendChild(s);
  }
  scene.appendChild(w);
}

const _BR = ['#1ca64c', '#ffdf00', '#2740a6'];   // paleta Brasil

/* ── registro de temas (ordenado por prioridade ao casar a data) ── */
const THEMES = [
  { id: 'worldcup', label: 'Copa do Mundo', priority: 100,
    active: (n) => _inDates(n, new Date(2026, 5, 11), new Date(2026, 6, 19)),
    hideHat: false,
    falas: [
      'GOOOOL do Brasil! ⚽🇧🇷', 'é hexa, é hexa! 🏆', 'vai, Brasil! 💛💚',
      'card no ângulo! ⚽', 'driblei o backlog 🇧🇷', 'sprint da Copa! ⚽',
      'meta batida = gol de placa 🥅', 'tamo na Copa! 🏆', 'pra cima deles! 🇧🇷',
      'quadro canarinho hoje 💛', 'olé, olé, olá 🎶', 'fluxo campeão 🏆',
      'bora pro hexa! 🇧🇷', 'card movido = gol marcado ⚽', 'jogo bonito no quadro 💛💚',
      'futebol e kanban: paixão nacional ⚽', 'na trave! quase um card concluído 😅'
    ],
    costumeBody(g) {
      const { px, rect, Y, o } = g;
      const Yl = '#ffdf00', YlD = '#e0b000', Gr = '#1ca64c', GrD = '#0b6e30', Bl = '#2740a6';
      rect(9, Y(11), 11, Y(13), Yl); px(9, Y(13), YlD); px(11, Y(13), YlD);
      px(9, Y(11), Gr); px(11, Y(11), Gr); px(10, Y(11), GrD); px(10, Y(12), Bl);
      px(7, Y(10), Gr); px(8, Y(10), Yl); px(9, Y(10), Yl); px(10, Y(10), Yl); px(11, Y(10), Gr);
      if (!o.sit && !o.coffee) { px(7, Y(11), Yl); px(6, Y(11), Gr); }
    },
    costumeSleep(s) {
      const { px, rect, Yb } = s;
      rect(5, Yb(13), 10, Yb(13), '#ffdf00'); px(5, Yb(13), '#1ca64c'); px(10, Yb(13), '#1ca64c');
    },
    decorate(scene) { _mkGarland(scene, _BR); }
  },

  { id: 'natal', label: 'Natal', priority: 20,
    active: (n) => _between(n, '12-15', '12-26'),
    hideHat: true,
    falas: [
      'Feliz Natal! 🎄', 'ho ho ho! 🎅', 'card de presente 🎁', 'o quadro tá um Natal! ✨',
      'espírito natalino 🎄', 'quem foi bonzinho com o backlog?', 'sprint sob a árvore 🎁',
      'noite feliz, fluxo feliz ✨', 'meta concluída de presente 🎁', 'tin tin, é Natal! 🔔'
    ],
    costumeHat(g) {
      const { px, rect, Y } = g, R = '#d4322c', RD = '#9e211d', W = '#ffffff', WD = '#e3e3e3';
      rect(5, Y(3), 13, Y(3), W); px(5, Y(3), WD); px(13, Y(3), WD);
      rect(7, Y(2), 12, Y(2), R); px(12, Y(2), RD);
      rect(8, Y(1), 11, Y(1), R); px(11, Y(1), RD);
      rect(9, Y(0), 10, Y(0), R);
      px(13, Y(0), W); px(13, Y(1), W);
    },
    costumeBody(g) {
      const { px, Y } = g, R = '#d4322c', G = '#1ca64c';
      px(8, Y(10), R); px(9, Y(10), R); px(10, Y(10), R); px(11, Y(10), R);
      px(8, Y(11), G); px(8, Y(12), G);
    },
    decorate(scene) { _mkGarland(scene, ['#d4322c', '#1ca64c', '#ffd34d'], true); _mkFloaters(scene, ['❄️', '🎄', '⭐'], 7); }
  },

  { id: 'anonovo', label: 'Ano Novo', priority: 30,
    active: (n) => _between(n, '12-29', '01-04'),   // 7 dias (cobre a volta do recesso)
    hideHat: true,
    falas: [
      'Feliz Ano Novo! 🎆', 'metas novas pra 2026! 🎯', 'retrospectiva do quadro ✨',
      'virou o ano, vamo que vamo!', 'ano novo, sprint nova 🎉', 'resoluções no backlog 📋',
      'tin-tin! 🥂', 'contagem regressiva… 3, 2, 1! 🎆'
    ],
    costumeHat(g) {
      const { px, rect, Y } = g, Gd = '#ffd34d', GdD = '#d9a92e', W = '#ffffff', B = '#2740a6';
      rect(8, Y(2), 11, Y(2), Gd); px(8, Y(2), GdD);
      rect(9, Y(1), 10, Y(1), B);
      px(9, Y(0), Gd); px(10, Y(0), W);
    },
    costumeBody(g) { const { px, Y } = g; px(9, Y(10), '#2740a6'); px(11, Y(10), '#2740a6'); px(10, Y(10), '#ffd34d'); },
    decorate(scene) { _mkGarland(scene, ['#ffd34d', '#ffffff', '#c9a227']); _mkFloaters(scene, ['🎆', '✨', '🎉'], 8); }
  },

  { id: 'carnaval', label: 'Carnaval', priority: 40,
    active: (n) => { const e = _easter(n.getFullYear()); return _inDates(n, _addDays(e, -51), _addDays(e, -46)); },
    hideHat: true,
    falas: [
      'é Carnaval! 🎭', 'quadro no samba 🥁', 'folia e foco 🎉', 'card no bloco! 🎊',
      'pula que é Carnaval!', 'olha a marchinha do kanban 🎶', 'confete no fluxo 🎊', 'ó abre alas pros cards!'
    ],
    costumeHat(g) {
      const { px, rect, Y } = g;
      rect(8, Y(2), 11, Y(2), '#7a3fb0');
      px(8, Y(1), '#ff4d6d'); px(9, Y(1), '#ffd34d'); px(10, Y(1), '#3aa0ff'); px(11, Y(1), '#1ca64c');
      px(8, Y(0), '#ff4d6d'); px(9, Y(0), '#ffd34d'); px(10, Y(0), '#3aa0ff'); px(11, Y(0), '#1ca64c');
    },
    decorate(scene) { _mkGarland(scene, ['#ff4d6d', '#ffd34d', '#3aa0ff', '#1ca64c', '#7a3fb0']); _mkFloaters(scene, ['🎭', '🎉', '🎊'], 8); }
  },

  { id: 'pascoa', label: 'Páscoa', priority: 40,
    active: (n) => { const e = _easter(n.getFullYear()); return _inDates(n, _addDays(e, -2), _addDays(e, 1)); },
    hideHat: true,
    falas: [
      'Feliz Páscoa! 🐰', 'cadê os ovos? digo, os cards 🥚', 'coelhinho organizado 🐰',
      'chocolate e produtividade 🍫', 'caça aos cards! 🥚', 'Páscoa no quadro 🌷', 'ovo recheado de metas 🍫'
    ],
    costumeHat(g) {
      const { px, Y } = g, W = '#ffffff', Pk = '#ffb6c1', Wd = '#e6e6e6';
      px(8, Y(0), W); px(8, Y(1), Pk); px(8, Y(2), W); px(8, Y(3), Wd);
      px(11, Y(0), W); px(11, Y(1), Pk); px(11, Y(2), W); px(11, Y(3), Wd);
    },
    decorate(scene) { _mkGarland(scene, ['#ffc0cb', '#b5ead7', '#ffdac1', '#c7ceea']); _mkFloaters(scene, ['🥚', '🐰', '🌷'], 7); }
  },

  { id: 'festajunina', label: 'Festa Junina', priority: 20,
    active: (n) => _between(n, '06-12', '06-29'),
    hideHat: true,
    falas: [
      'é arraiá! 🎉', 'olha a quadrilha do kanban!', 'quentão e foco ☕', 'card no balão 🎈',
      'anarriê pro Em Progresso!', 'xadrez e produtividade 🤠', 'sprint junina 🌽',
      'olha a fogueira dos prazos! 🔥', 'obá, festança! 🎶', 'milho, pé de moleque e metas 🌽'
    ],
    costumeHat(g) {
      const { px, rect, Y } = g, T = '#d9a441', TD = '#a9742a', TL = '#ecc06a';
      rect(5, Y(3), 15, Y(3), T); px(5, Y(3), TD); px(15, Y(3), TD); px(6, Y(3), TL);
      rect(7, Y(2), 12, Y(2), T); px(7, Y(2), TD);
      rect(8, Y(1), 11, Y(1), T); px(8, Y(1), TL);
      px(10, Y(2), '#7a4f1f');
    },
    costumeBody(g) {
      const { px, rect, Y } = g, C1 = '#cf3b3b', C2 = '#f5e2bd';
      rect(9, Y(11), 11, Y(13), C1);
      px(9, Y(11), C2); px(11, Y(11), C2); px(10, Y(12), C2); px(9, Y(13), C2); px(11, Y(13), C2);
      px(7, Y(10), C1); px(8, Y(10), C2); px(9, Y(10), C1); px(10, Y(10), C2); px(11, Y(10), C1);
    },
    decorate(scene) { _mkGarland(scene, ['#ff4d6d', '#ffd34d', '#3aa0ff', '#1ca64c', '#ff8c42']); _mkFloaters(scene, ['🔥', '🌽', '🎈'], 7); }
  },

  { id: 'independencia', label: 'Independência', priority: 20,
    active: (n) => _between(n, '09-05', '09-08'),
    hideHat: false,
    falas: [
      'Independência! 🇧🇷', '7 de setembro! 💛💚', 'quadro canarinho hoje',
      'liberdade pro backlog!', 'desfile dos cards 🥁', 'orgulho verde-amarelo 💚💛', 'foco e pátria amada 🇧🇷'
    ],
    costumeBody(g) {
      const { px, Y } = g, G = '#1ca64c', Yl = '#ffdf00';
      px(9, Y(10), G); px(9, Y(11), Yl); px(10, Y(11), G); px(10, Y(12), Yl); px(11, Y(12), G); px(11, Y(13), Yl);
    },
    decorate(scene) { _mkGarland(scene, _BR); _mkFloaters(scene, ['🇧🇷', '💛', '💚'], 6); }
  },

  { id: 'criancas', label: 'Dia das Crianças', priority: 20,
    active: (n) => _between(n, '10-11', '10-13'),
    hideHat: true,
    falas: [
      'Dia das Crianças! 🎈', 'bora brincar… depois dos cards 😄', 'pipoca e produtividade 🍿',
      'alegria de criança no quadro 🎈', 'ganhei um card de presente 🎁', 'recreio merecido! 🧸'
    ],
    costumeHat(g) {
      const { px, rect, Y } = g;
      rect(8, Y(2), 11, Y(2), '#3aa0ff');
      rect(9, Y(1), 10, Y(1), '#ff5c8a');
      px(9, Y(0), '#ffd34d'); px(10, Y(0), '#ffffff');
    },
    decorate(scene) { _mkGarland(scene, ['#ff5c8a', '#3aa0ff', '#ffd34d', '#1ca64c']); _mkFloaters(scene, ['🎈', '🎈', '🧸', '🍭'], 8); }
  },

  { id: 'halloween', label: 'Halloween', priority: 20,
    active: (n) => _between(n, '10-29', '11-01'),
    hideHat: true,
    falas: [
      'Boo! 👻 te assustei?', 'doces ou cards? 🍬', 'quadro assombrado de tarefas 🎃',
      'cuidado com os bugs… 🕷️', 'noite das bruxas no kanban 🦇', 'card fantasma no backlog 👻', 'gostosuras pra quem conclui! 🍬'
    ],
    costumeHat(g) {
      const { px, rect, Y } = g, K = '#1c1430', KP = '#6a3fb0', KD = '#0d0a1c';
      rect(5, Y(3), 15, Y(3), K); px(5, Y(3), KD); px(15, Y(3), KD);
      rect(7, Y(2), 12, Y(2), KP);
      rect(8, Y(1), 11, Y(1), K);
      rect(9, Y(0), 10, Y(0), K);
    },
    decorate(scene) { _mkGarland(scene, ['#ff7518', '#1c1430', '#6a3fb0'], true); _mkFloaters(scene, ['🦇', '🎃', '👻'], 7); }
  }
];

function _findTheme(id) { for (let i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i]; return null; }

function activeTheme() {
  // Overrides p/ teste (window ou localStorage)
  let forced = (typeof window.TOBI_THEME === 'string') ? window.TOBI_THEME : null;
  if (forced == null) { try { forced = localStorage.getItem('tobi_theme'); } catch (e) {} }
  // Compatibilidade com o override antigo da Copa
  if (forced == null) {
    if (window.TOBI_WORLDCUP === true) forced = 'worldcup';
    else if (window.TOBI_WORLDCUP === false) forced = 'none';
    else { try { const w = localStorage.getItem('tobi_worldcup'); if (w === '1') forced = 'worldcup'; else if (w === '0') forced = 'none'; } catch (e) {} }
  }
  if (forced === 'none' || forced === 'off') return null;
  if (forced) return _findTheme(forced);

  const now = new Date();
  const matches = THEMES.filter(t => t.enabled !== false && t.active(now));
  matches.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return matches[0] || null;
}

const THEME = activeTheme();

if (window.TOBI_DISABLED) return;

function boot() {
const scene = document.getElementById('tobi-scene');
if (!scene) return;

const otter = document.getElementById('tobi');
const bubble = document.getElementById('tobi-bubble');
const chair = document.getElementById('tobi-chair');
const trash = document.getElementById('tobi-trash');
const cup = document.getElementById('tobi-cup');
const cv = document.getElementById('tobi-canvas');
const desk = scene.querySelector('.tobi-desk');
const coffee = scene.querySelector('.tobi-cm');
const sofa = scene.querySelector('.tobi-sofa');
const backpack = document.getElementById('tobi-backpack');

if (!otter || !cv) return;

let stepDust = scene.querySelector('.tobi-step-dust');

if (!stepDust) {
  stepDust = document.createElement('div');
  stepDust.className = 'tobi-step-dust';
  scene.appendChild(stepDust);
}

let thought = scene.querySelector('.tobi-thought');

if (!thought) {
  thought = document.createElement('div');
  thought.className = 'tobi-thought';
  scene.appendChild(thought);
}

if (!cv.hasAttribute('tabindex')) cv.setAttribute('tabindex', '0');
if (!cv.hasAttribute('role')) cv.setAttribute('role', 'button');

if (!cv.hasAttribute('aria-label')) {
  cv.setAttribute('aria-label', 'Tobi, mascote do SyncroFlow');
}

if (THEME) {
  scene.classList.add('tobi-themed', 'tobi-theme-' + THEME.id);
  if (THEME.decorate) THEME.decorate(scene);
}

const prefersReduced =
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let forceMotion = !!window.TOBI_FORCE_MOTION;

try {
  if (localStorage.getItem('tobi_force_motion') === '1') {
    forceMotion = true;
  }
} catch (e) {}

// Também respeita o "Reduzir animações" do painel de acessibilidade.
let a11yReduce = false;
try { a11yReduce = JSON.parse(localStorage.getItem('syncro_a11y') || '{}').reduceMotion === true; } catch (e) {}

const REDUCED =
  ((CONFIG.RESPECT_REDUCED_MOTION && prefersReduced) || a11yReduce) &&
  !forceMotion;

// Flag mutável: o painel de acessibilidade pode congelar/retomar o Tobi em runtime.
let reducedRuntime = REDUCED;

function makeDrawer(canvas, S) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  return {
    ctx,
    S,

    px: (x, y, c) => {
      if (!c) return;
      ctx.fillStyle = c;
      ctx.fillRect(x * S, y * S, S, S);
    },

    rect: (x0, y0, x1, y1, c) => {
      if (!c) return;
      ctx.fillStyle = c;
      const w = (x1 - x0 + 1) * S;
      const h = (y1 - y0 + 1) * S;
      ctx.fillRect(x0 * S, y0 * S, w, h);
    },

    wipe: () => ctx.clearRect(0, 0, canvas.width, canvas.height)
  };
}

const P = {
  f: '#8c5e3c',
  fd: '#6f4830',
  c: '#e9d3b4',
  tail: '#5a3a26'
};

const N = '#3a241a';
const Z = '#9fe0dd';
const TOOTH = '#fff8e6';

function drawLying(d, o) {
  const { px, rect, wipe, ctx, S } = d;
  wipe();

  const Yb = y => y;

  const OUT = '#24160e';
  const FUR = '#9a6338';
  const FUR_D = '#6f4328';
  const FUR_L = '#b87945';
  const CREAM = '#f0dcc0';
  const CREAM_L = '#fff1d2';
  const TAIL = '#5a3a26';
  const TAIL_L = '#8a5a36';
  const EYE = '#152019';
  const NOSE = '#1f140d';
  const TOOTH_L = '#fff8e6';
  // 💤 TOUQUINHA DE DORMIR (corrigida e proporcional)
  const CAP = '#6f6fd6';
  const CAP_L = '#9a9aff';
  const CAP_D = '#4e4ea8';
  const POM = '#ffffff';

  // base ajustada (mais curta)
  rect(11, Yb(9), 14, Yb(10), CAP);

  // sombra leve
  px(11, Yb(9), CAP_D);
  px(14, Yb(10), CAP_D);

  // luz
  px(12, Yb(9), CAP_L);
  px(13, Yb(9), CAP_L);

  // caída suave da touca (curta e arredondada)
  px(14, Yb(8), CAP);
  px(15, Yb(8), CAP_L);
  px(15, Yb(7), CAP);

  // pompom menor e mais perto
  px(16, Yb(7), POM);

  // 🦫 CAUDA (igual estilo do normal)
  rect(1, Yb(13), 4, Yb(15), TAIL);
  px(2, Yb(14), TAIL_L);
  px(3, Yb(14), TAIL_L);

  // 🦫 CORPO (com volume melhor)
  rect(4, Yb(12), 11, Yb(15), FUR);
  px(4, Yb(12), FUR_D);
  px(11, Yb(12), FUR_D);
  px(5, Yb(12), FUR_L);
  px(6, Yb(12), FUR_L);

  // 🦫 BARRIGA
  rect(6, Yb(13), 10, Yb(14), CREAM);
  px(6, Yb(13), CREAM_L);

  // 🦫 PERNINHAS
  px(6, Yb(15), FUR_D);
  px(8, Yb(15), FUR_D);
  px(10, Yb(15), FUR_D);

  // 🦫 CABEÇA (MAIS DEFINIDA ✅)
  rect(11, Yb(11), 16, Yb(15), FUR);
  px(11, Yb(11), FUR_D);
  px(16, Yb(11), FUR_D);

  // luz na cabeça
  px(12, Yb(11), FUR_L);
  px(13, Yb(11), FUR_L);

  // 🦫 OLHO (fechado estilo coerente)
  px(13, Yb(13), OUT);
  px(14, Yb(13), OUT);

  // 🦫 NARIZ
  px(16, Yb(13), NOSE);
  px(16, Yb(14), NOSE);

  // 🦫 DENTE (marca registrada)
  px(15, Yb(15), TOOTH_L);
  px(16, Yb(15), TOOTH_L);

  px(12, Yb(13), FUR_D);

  px(13, Yb(13), OUT);
  px(14, Yb(13), OUT);
  px(15, Yb(14), OUT); // dá leve curva

  // 🎉 Tema (mantido)
  if (o.theme && o.theme.costumeSleep) {
    o.theme.costumeSleep({ px, rect, Yb, o });
  }

  // 💤 ZZZ
  const Z = '#9fe0dd';
  const zp = o.zzz || 0;

  ctx.fillStyle = Z;
  ctx.font = 'bold ' + (S * 2 - 1) + 'px JetBrains Mono, monospace';
  ctx.fillText('z', 11 * S, (8 - zp) * S);

  ctx.font = 'bold ' + (S * 2) + 'px JetBrains Mono, monospace';
  ctx.fillText('Z', 13 * S, (6 - zp) * S);

  ctx.font = 'bold ' + (S * 2 + 2) + 'px JetBrains Mono, monospace';
  ctx.fillText('Z', 15 * S, (4 - zp) * S);
}

function drawBeaver(d, o) {
  if (o.sleep) {
    drawLying(d, o);
    return;
  }

  const { px, rect, wipe, ctx, S } = d;
  wipe();

  const b = o.bob || 0;
  const Y = y => y + b;

  const OUT = '#24160e';
  const OUT2 = '#342116';

  const FUR = '#9a6338';
  const FUR_D = '#6f4328';
  const FUR_L = '#b87945';

  const CREAM = '#f0dcc0';
  const CREAM_L = '#fff1d2';
  const CREAM_D = '#dec39d';

  const TAIL = '#5a3a26';
  const TAIL_L = '#8a5a36';

  const EYE = '#152019';
  const EYE_L = '#9fe0dd';
  const WHITE = '#ffffff';

  const NOSE = '#1f140d';

  const TOOTH_L = '#fff8e6';
  const TOOTH_D = '#d8c38f';

  const HELMET = '#f4f3ee';
  const HELMET_L = '#fffdf2';
  const HELMET_D = '#cdcbbf';
  const HELMET_SH = '#a8a59a';

  const TEAL = '#00796D';
  const TEAL_L = '#21b8b2';

  const CORAL = '#d97757';
  const CORAL_D = '#a8432f';

  const RED = '#e0524f';
  const TEAR = '#7fd6ff';
  const ZZZ = '#9fe0dd';
  const COFFEE = '#5a3a26';

  const tick = Math.floor((o.t || 0) / 420) % 2;
  const slowTick = Math.floor((o.t || 0) / 850) % 2;

  rect(2, Y(11), 5, Y(11), TAIL);
  rect(1, Y(12), 6, Y(12), TAIL);
  rect(2, Y(13), 5, Y(13), TAIL);

  px(1, Y(12), OUT2);
  px(6, Y(12), OUT2);
  px(2, Y(11), FUR_D);
  px(5, Y(11), FUR_D);
  px(2, Y(13), FUR_D);
  px(5, Y(13), FUR_D);

  px(3, Y(11), TAIL_L);
  px(5, Y(11), FUR_D);
  px(2, Y(12), FUR_D);
  px(4, Y(12), slowTick ? TAIL_L : FUR_D);
  px(3, Y(13), FUR_D);
  px(5, Y(13), TAIL_L);

  if (o.sit) {
    rect(9, Y(14), 11, Y(14), FUR_D);
    px(12, Y(15), FUR_D);
    px(9, Y(15), OUT);
    px(10, Y(15), OUT);
  } else if (o.run) {
    if (o.footPhase) {
      rect(8, Y(14), 8, Y(15), FUR_D);
      rect(10, Y(14), 10, Y(15), FUR_D);
      px(8, Y(15), OUT);
      px(10, Y(15), OUT);
    } else {
      rect(7, Y(14), 7, Y(15), FUR_D);
      rect(11, Y(14), 11, Y(15), FUR_D);
      px(7, Y(15), OUT);
      px(11, Y(15), OUT);
    }
  } else {
    rect(8, Y(14), 8, Y(15), FUR_D);
    rect(10, Y(14), 10, Y(15), FUR_D);
    px(8, Y(15), OUT);
    px(10, Y(15), OUT);
  }

  rect(7, Y(10), 11, Y(13), FUR);

  px(6, Y(10), OUT2);
  px(6, Y(11), OUT2);
  px(6, Y(12), OUT2);
  px(7, Y(14), OUT2);

  px(12, Y(10), OUT2);
  px(12, Y(11), OUT2);
  px(12, Y(12), OUT2);

  px(8, Y(10), FUR_L);
  px(8, Y(11), FUR_L);
  px(11, Y(13), FUR_D);

  rect(9, Y(11), 11, Y(13), CREAM);
  px(9, Y(11), CREAM_L);
  px(10, Y(11), CREAM_L);
  px(11, Y(13), CREAM_D);

  px(7, Y(10), TEAL);
  px(8, Y(10), TEAL_L);
  px(9, Y(10), TEAL);
  px(10, Y(10), CORAL);
  px(11, Y(10), CORAL_D);

  if (!o.sit && !o.coffee) {
    px(7, Y(11), TEAL);
    px(6, Y(11), TEAL_L);
  }

  if (o.sit) {
    const tap = o.armPhase ? 0 : 1;

    rect(11, Y(10), 12, Y(10), FUR);
    px(13, Y(10 + tap), OUT2);
    px(14, Y(10 + tap), FUR_D);
  } else if (o.coffee) {
    if (o.pour) {
      rect(11, Y(10), 12, Y(10), FUR);
      rect(12, Y(9), 13, Y(10), CREAM);

      if (o.level > 0) {
        px(12, Y(9), COFFEE);
        px(13, Y(9), COFFEE);
      }

      const dy = Math.floor((o.t / 110) % 3);
      px(12, Y(6 + dy), COFFEE);
    } else if (o.level < 0) {
      rect(11, Y(10), 12, Y(10), FUR);
      px(12, Y(11), FUR_D);
    } else {
      const lift = o.lift || 0;
      const cupTop = Math.round(11 - lift * 3);

      rect(11, Y(cupTop + 1), 12, Y(cupTop + 1), FUR);
      px(11, Y(cupTop + 2), FUR_D);
      rect(12, Y(cupTop), 13, Y(cupTop + 1), CREAM);

      if (o.level > 0) {
        px(12, Y(cupTop), COFFEE);
        px(13, Y(cupTop), COFFEE);
      }

      if (lift > 0.7) {
        px(14, Y(cupTop), CREAM);
      }
    }
  } else if (o.wake) {
    px(7, Y(8), FUR_D);
    px(6, Y(7), FUR_D);
    px(6, Y(6), FUR);
  } else {
    const ay = (o.run && o.footPhase) ? 12 : 11;
    px(8, Y(ay), FUR_D);
    px(8, Y(ay + 1), FUR_D);
  }

  // 🎉 Tema sazonal — roupa no corpo (camisa/colete/cachecol…)
  const _g = { px, rect, ctx, S, Y, o, tick, slowTick };
  if (o.theme && o.theme.costumeBody) o.theme.costumeBody(_g);

  rect(5, Y(4), 12, Y(4), FUR);
  rect(5, Y(5), 13, Y(8), FUR);
  rect(6, Y(9), 11, Y(9), FUR);

  px(5, Y(4), OUT2);
  px(12, Y(4), OUT2);
  px(4, Y(5), FUR);
  px(4, Y(6), OUT2);
  px(5, Y(8), OUT2);
  px(13, Y(8), OUT2);

  px(6, Y(5), FUR_L);
  px(7, Y(5), FUR_L);
  px(6, Y(6), FUR_L);

  px(4, Y(5), '#9a6a45');
  px(4, Y(6), FUR_D);

  if (o.wake || o.blink || o.sip) {
    px(9, Y(7), NOSE);
    px(10, Y(7), NOSE);
  } else {
    rect(9, Y(6), 10, Y(7), EYE);
    px(9, Y(6), WHITE);

    

    px(8, Y(5), OUT2);
    px(11, Y(5), OUT2);
  }

  px(13, Y(6), NOSE);
  px(13, Y(7), NOSE);
  px(12, Y(7), FUR_D);

  if (!o.angry && !o.cry && !o.faceCoffee && !o.wake) {
    px(11, Y(8), OUT);
    px(12, Y(8), OUT);
  }

  px(11, Y(9), TOOTH_L);
  px(12, Y(9), TOOTH_D);
  px(13, Y(9), TOOTH_L);

  const _hideHat = !!(o.theme && o.theme.hideHat);
  if (!_hideHat) {
    rect(8, Y(0), 11, Y(0), HELMET);
    rect(7, Y(1), 12, Y(1), HELMET);
    rect(7, Y(2), 12, Y(2), '#e8e5da');

    px(8, Y(2), HELMET_D);
    px(11, Y(2), HELMET_D);
    px(7, Y(2), HELMET_SH);
    px(12, Y(2), HELMET_SH);

    px(9, Y(1), TEAL_L);
    px(10, Y(1), TEAL_L);
    px(11, Y(1), CORAL);

    if (tick) {
      px(10, Y(0), WHITE);
      px(11, Y(0), WHITE);
    } else {
      px(9, Y(0), WHITE);
    }

    rect(5, Y(3), 15, Y(3), HELMET);
    px(5, Y(3), HELMET_D);
    px(15, Y(3), HELMET_D);
    px(6, Y(3), HELMET_L);
    px(14, Y(3), HELMET_L);

    px(7, Y(3), OUT2);
    px(8, Y(3), OUT2);
  }

  // 🎉 Tema sazonal — chapéu/acessório de cabeça (por cima da cabeça)
  if (o.theme && o.theme.costumeHat) o.theme.costumeHat(_g);

  if (o.run) {
    if (o.footPhase) {
      px(8, Y(12), FUR_D);
    } else {
      px(11, Y(12), FUR_D);
    }
  }

  if (o.wake) {
    px(9, Y(7), OUT);
    px(10, Y(7), OUT);

    px(12, Y(8), OUT);
    px(13, Y(8), OUT);
    px(12, Y(9), OUT);

    px(14, Y(4), ZZZ);

    if (tick) {
      px(15, Y(4), ZZZ);
    }
  }

  if (o.angry) {
    px(8, Y(5), NOSE);
    px(9, Y(5), NOSE);
    px(13, Y(5), NOSE);
    px(11, Y(8), NOSE);
    px(12, Y(8), NOSE);

    px(6, Y(2), RED);
    px(7, Y(1), RED);
    px(7, Y(3), RED);
  }

  if (o.cry) {
    px(9, Y(7), NOSE);
    px(10, Y(7), NOSE);

    const drop = Math.floor((o.t || 0) / 160) % 3;

    px(9, Y(8 + drop), TEAR);
    px(13, Y(8 + drop), TEAR);
    rect(11, Y(8), 12, Y(8), NOSE);
  }

  if (o.faceCoffee) {
    rect(6, Y(4), 11, Y(5), COFFEE);
    px(6, Y(6), COFFEE);
    px(8, Y(6), COFFEE);
    px(10, Y(6), COFFEE);
    px(12, Y(6), COFFEE);

    const drip = Math.floor((o.t || 0) / 150) % 3;

    px(7, Y(7 + drip), COFFEE);
    px(11, Y(7 + drip), COFFEE);
    px(9, Y(7), NOSE);
    px(10, Y(7), NOSE);
  }

  if (o.sleep) {
    ctx.fillStyle = ZZZ;
    ctx.font = 'bold ' + (S * 2) + 'px JetBrains Mono, monospace';
    ctx.fillText('Z', 13 * S, (Y(1) - (o.zzz || 0)) * S);
  }
}

const dF = makeDrawer(cv, CONFIG.SCALE);

const L = {
  seat: 120,
  coffee: 18,
  sleep: 60,
  W: 0
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(v, max));
}

function layout() {
  const Wd = scene.clientWidth || 217;
  L.W = Wd;

  const maxTobiX = Math.max(0, Wd - 54);

  const deskLeft = clamp(
    Wd - CONFIG.deskW - CONFIG.deskRight,
    0,
    Math.max(0, Wd - CONFIG.deskW)
  );

  const chairRest = deskLeft - CONFIG.chairGap;
  const coffeeLeft = CONFIG.coffeeLeft;
  const trashLeft = coffeeLeft + CONFIG.trashGap;

  const rawSofaLeft = Math.round(Wd * CONFIG.sofaCenterPct - CONFIG.sofaW / 2);
  const sofaLeft = clamp(rawSofaLeft, 0, Math.max(0, Wd - CONFIG.sofaW));

  const showSofa = Wd >= CONFIG.minWSofa;
  const showCoffee = Wd >= CONFIG.minWCoffee;
  const showTrash = Wd >= CONFIG.minWTrash;

  L.seat = clamp(deskLeft - CONFIG.seatDeskGap, 0, maxTobiX);

  L.coffee = showCoffee
    ? clamp(coffeeLeft + CONFIG.coffeeOtterDx, 0, maxTobiX)
    : L.seat;

  L.sleep = showSofa
    ? clamp(sofaLeft + CONFIG.sleepOtterDx, 0, maxTobiX)
    : L.seat;

  if (desk) {
    desk.style.left = deskLeft + 'px';
  }

  if (backpack) {
    backpack.style.left = clamp(deskLeft + 16, 0, Math.max(0, Wd - 11)) + 'px';
  }

  if (coffee) {
    coffee.style.left = coffeeLeft + 'px';
    coffee.style.display = showCoffee ? '' : 'none';
  }

  if (trash) {
    trash.style.left = trashLeft + 'px';
    trash.style.display = showTrash ? '' : 'none';
  }

  if (sofa) {
    sofa.style.left = sofaLeft + 'px';
    sofa.style.display = showSofa ? '' : 'none';
  }

  if (chair) {
    chair.style.left = chairRest + 'px';

    chair.style.setProperty(
      '--chair-out-x',
      ((L.seat + CONFIG.chairUnderDx) - chairRest) + 'px'
    );

    chair.style.setProperty(
      '--chair-out-y',
      (-CONFIG.chairRaise) + 'px'
    );
  }

  scene.style.setProperty('--tobi-seat-y', (-CONFIG.seatRaise) + 'px');
  scene.style.setProperty('--tobi-nap-y', CONFIG.napY + 'px');
}

let cPour = false;
let cSip = false;
let cLevel = 0;
let cLift = 0;

let rAngry = false;
let rCry = false;
let rFace = false;

let lastBlink = 0;
let blinkUntil = 0;
let walk = null;

function updateStepDust() {
  if (!stepDust) return;

  const st = otter.dataset.state;

  if (st !== 'walk' || !walk) {
    stepDust.classList.remove('on', 'dir-left', 'dir-right');
    return;
  }

  const cur = parseFloat(otter.style.left) || 0;
  const goingLeft = walk.to < walk.from;
  const dustX = cur + (goingLeft ? 46 : 8);

  stepDust.style.left = dustX + 'px';
  stepDust.style.bottom = '18px';

  stepDust.classList.toggle('dir-left', goingLeft);
  stepDust.classList.toggle('dir-right', !goingLeft);
  stepDust.classList.add('on');
}

function showThought(text, ms) {
  if (!thought) return;

  const cur = parseFloat(otter.style.left) || 0;

  thought.textContent = text || '...';
  thought.style.left = (cur + 29) + 'px';
  thought.style.bottom = '58px';

  thought.classList.remove('on');
  void thought.offsetWidth;
  thought.classList.add('on');

  clearTimeout(showThought._t);

  showThought._t = setTimeout(() => {
    thought.classList.remove('on');
  }, ms || 1450);
}

function popWakeStars() {
  const layer = document.createElement('div');
  layer.className = 'tobi-wake-stars';
  layer.style.left = ((parseFloat(otter.style.left) || 0) + 30) + 'px';
  layer.style.bottom = '54px';

  for (let i = 0; i < 7; i++) {
    const s = document.createElement('i');

    s.style.setProperty('--sx', (Math.random() * 42 - 21).toFixed(0) + 'px');
    s.style.setProperty('--sy', (-10 - Math.random() * 28).toFixed(0) + 'px');
    s.style.setProperty('--sr', (Math.random() * 280 - 140).toFixed(0) + 'deg');
    s.style.animationDelay = (Math.random() * 0.16).toFixed(2) + 's';

    layer.appendChild(s);
  }

  scene.appendChild(layer);

  setTimeout(() => {
    layer.remove();
  }, 1100);
}

function frame(now) {
  requestAnimationFrame(frame);

  if (reducedRuntime) return;   // acessibilidade: "reduzir animações" congela o Tobi
  if (document.hidden || scene.clientWidth === 0) return;

  if (walk) {
    const dur = walk.dur || CONFIG.WALK_MS;
    const p = Math.min(1, (now - walk.start) / dur);

    const ease = p < 0.5
      ? 2 * p * p
      : 1 - Math.pow(-2 * p + 2, 2) / 2;

    otter.style.left = (walk.from + (walk.to - walk.from) * ease) + 'px';

    updateStepDust();

    if (p >= 1) {
      otter.style.left = walk.to + 'px';
      walk = null;
      updateStepDust();
    }
  } else {
    updateStepDust();
  }

  const st = otter.dataset.state;

  if (st !== 'sleep' && now > lastBlink + 3200) {
    lastBlink = now;
    blinkUntil = now + 150;
  }

  const blink = now < blinkUntil;

  let o = {
    blink,
    t: now,
    theme: THEME
  };

  if (st === 'walk') {
    o.run = true;
    o.footPhase = Math.floor(now / 260) % 2;
    o.bob = Math.floor(now / 260) % 2 ? 0 : -1;
  } else if (st === 'work') {
    o.sit = true;
    o.armPhase = Math.floor(now / 170) % 2;
  } else if (st === 'coffee') {
    o.coffee = true;
    o.pour = cPour;
    o.sip = cSip;
    o.level = cLevel;
    o.lift = cLift;
    o.t = now;
  } else if (st === 'sleep') {
    o.sleep = true;
    o.bob = Math.sin(now / 600) * 0.5;
    o.zzz = Math.floor(now / 600) % 3;
  } else if (st === 'wake') {
    o.wake = true;
    o.t = now;
    o.bob = 0;
  }

  if (rAngry) o.angry = true;

  if (rCry) {
    o.cry = true;
    o.t = now;
  }

  if (rFace) {
    o.faceCoffee = true;
    o.t = now;
  }

  drawBeaver(dF, o);
}

let auto = true;
let timers = [];
let gen = 0;

function later(fn, ms) {
  const id = setTimeout(fn, ms);
  timers.push(id);
  return id;
}

function clearLater() {
  timers.forEach(clearTimeout);
  timers = [];

  if (say._t) {
    clearTimeout(say._t);
    say._t = null;
  }

  if (showThought._t) {
    clearTimeout(showThought._t);
    showThought._t = null;
  }
}

function setState(s) {
  otter.dataset.state = s;
  otter.classList.toggle('walking', s === 'walk');

  if (s !== 'walk' && stepDust) {
    stepDust.classList.remove('on', 'dir-left', 'dir-right');
  }
}

function step(my, fn, ms) {
  return later(() => {
    if (my !== gen) return;
    fn();
  }, ms);
}

function say(t, ms) {
  if (!bubble || !otter) return;

  bubble.textContent = String(t || '');

  otter.classList.remove('talk');
  void otter.offsetWidth;
  otter.classList.add('talk');

  clearTimeout(say._t);

  say._t = setTimeout(() => {
    otter.classList.remove('talk');
  }, ms || 2200);
}

function walkTo(my, x, then) {
  otter.classList.remove(
    'seated',
    'napping',
    'waking',
    'seat-stretch',
    'type-boost',
    'nod',
    'seat-pop'
  );

  scene.classList.remove('typing-boost');

  if (chair) {
    chair.classList.remove('out');
  }

  const cur = parseFloat(otter.style.left) || otter.offsetLeft || 0;
  const maxX = Math.max(0, (scene.clientWidth || L.W || 217) - 54);
  const target = clamp(x, 0, maxX);

  otter.classList.toggle('face-left', target < cur);

  setState('walk');

  walk = {
    from: cur,
    to: target,
    start: performance.now(),
    dur: CONFIG.WALK_MS
  };

  step(my, () => {
    walk = null;
    otter.style.left = target + 'px';
    setState('idle');

    if (then) then();
  }, CONFIG.WALK_MS);
}

function goWork(done) {
  const my = ++gen;

  walkTo(my, L.seat, () => {
    otter.classList.remove('face-left');

    if (chair) {
      chair.classList.add('out');
    }

    step(my, () => {
      setState('work');
      otter.classList.add('seated');
      say('mexendo nos cards');

      if (done) done();
    }, 650);
  });
}

function goCoffee(done) {
  const my = ++gen;
  walkTo(my, L.coffee, () => encherCafe(my, done));
}

function encherCafe(my, done) {
  if (my !== gen) return;

  setState('coffee');

  cPour = true;
  cSip = false;
  cLevel = 0;
  cLift = 0;

  say('enchendo...');

  [1, 2, 3].forEach((lv, i) => {
    step(my, () => {
      cLevel = lv;
    }, 350 + i * 350);
  });

  step(my, () => beberCafe(my, done), 350 + 3 * 350 + 250);
}

function beberCafe(my, done) {
  cPour = false;
  cSip = false;
  cLift = 0;

  say('hmmm');

  const R = 85;
  const SIP = 320;

  let t = 0;

  for (let s = 0; s < 3; s++) {
    const isFinalSip = (s === 2);

    step(my, () => cLift = 0.34, t + R);
    step(my, () => cLift = 0.67, t + R * 2);

    step(my, () => {
      cLift = 1;
      cSip = true;
    }, t + R * 3);

    step(my, () => {
      cLevel = 2 - s;
    }, t + R * 3 + SIP * 0.6);

    step(my, () => {
      cSip = false;
      // No último gole, desce imediatamente. Nos outros, desce gradualmente.
      cLift = isFinalSip ? 0 : 0.67;
    }, t + R * 3 + SIP);

    if (!isFinalSip) {
      step(my, () => cLift = 0.34, t + R * 4 + SIP);
      step(my, () => cLift = 0, t + R * 5 + SIP);
    }

    if (s === 1) {
      step(my, () => say('mmm, café!'), t + R * 3 + 40);
    }

    t += R * 5 + SIP + 240;
  }

  step(my, () => {
    cLift = 0;
    jogarCopo(my, done);
  }, t + 150);
}

function jogarCopo(my, done) {
  cLevel = -1;
  otter.classList.remove('face-left');

  if (cup && trash) {
    cup.style.left = (otter.offsetLeft + 30) + 'px';
    cup.style.bottom = '40px';
    cup.style.display = 'block';

    void cup.offsetWidth;

    cup.classList.add('fly');
    trash.classList.add('open');

    say('joga no lixo!');

    step(my, () => {
      cup.classList.remove('fly');
      cup.style.display = 'none';
      trash.classList.remove('open');
    }, 820);
  } else {
    say('café feito!');
  }

  step(my, () => goWork(done), 1050);
}

function goSleep(done) {
  const my = ++gen;

  walkTo(my, L.sleep, () => {
    otter.classList.remove('face-left');

    setState('sleep');
    otter.classList.add('napping');

    say('hora da soneca');

    if (done) done();
  });
}

function wakeUp(done) {
  const my = ++gen;

  otter.classList.remove('napping', 'seated');

  if (chair) chair.classList.remove('out');

  otter.classList.add('waking');

  setState('wake');
  popWakeStars();
  say('aaah… 🥱', 1600);

  step(my, () => {
    say('bom descanso! ☕', 1400);
  }, 900);

  step(my, () => {
    otter.classList.remove('waking');
    goWork(done);
  }, 1500);
}

function loop() {
  if (!auto) return;

  later(() => {
    if (!auto) return;

    goCoffee(() => {
      later(() => {
        if (!auto) return;

        goSleep(() => {
          later(() => {
            if (!auto) return;

            wakeUp(() => {
              later(loop, CONFIG.loop.afterWork);
            });
          }, CONFIG.loop.afterSleep);
        });
      }, CONFIG.loop.afterCoffee);
    });
  }, CONFIG.loop.afterWork);
}

const falas = [
  'card movido pra Concluído',
  'arrastei pro Em Progresso',
  'quadro organizado!',
  'sprint quase fechada',
  'backlog no controle',
  'fluxo redondo',
  'bora bater a meta',
  'produção sincronizada',
  'cada card no lugar certo',
  'novo card no SyncroFlow',
  'tudo no fluxo',
  'Tobi no comando',
  '#GoFlow',
  'oi! 👋',
  'tô de olho no quadro',
  'que tal um cafézinho? ☕',
  'roendo uns bugs 🦫',
  'WIP sob controle',
  'foco total!',
  'kanban impecável',
  'um dia produtivo!',
  'já moveu seus cards hoje?',
  'organizar é vida 🗂️',
  'partiu concluir mais um',
  'tamo junto 💪',
  'represa de tarefas? não aqui!',
  'cada card no seu lugar',
  'fluxo de mestre 😎'
];

/* Escolhe uma fala ociosa — em data comemorativa, mistura as falas do tema. */
function idleFala() {
  if (THEME && THEME.falas && THEME.falas.length && Math.random() < 0.55) {
    return THEME.falas[Math.floor(Math.random() * THEME.falas.length)];
  }
  return falas[Math.floor(Math.random() * falas.length)];
}

const FALAS_WAKE = [
  'hã?! quem?! 😴',
  'já é hora?! 😱',
  'só mais 5 minutinhos…',
  'acordei, acordei!',
  'tava sonhando com cards…',
  'ué, cadê o sofá? 😵'
];

const FALAS_SPILL = [
  'AAAH meu café! ☕😡',
  'derramei tudo! 😤',
  'que raiva! 💢',
  'não acredito… 😠',
  'meu cafézinho! 😡',
  'grrr! ☕'
];

const FALAS_WORK_CLICK = [
  'opa, tô focado aqui!',
  'só mais esse card...',
  'deixa eu terminar esse fluxo',
  'digitando uma solução...',
  'organizando o quadro!',
  'tô trabalhando, chefe 😄',
  'calma, esse card é delicado',
  'kanban não se arruma sozinho!'
];

const FALAS_THINKING = [
  'hmm...',
  'pensando...',
  'melhor mover esse card?',
  'onde encaixo isso?',
  'prioridade ou backlog?',
  'isso vai pra Em Progresso'
];

const FALAS_CHEER = [
  'boaa! card concluído 🎉',
  'mandou bem!',
  'mais um no Concluído!',
  'tá voando! 🚀',
  'isso! 🎉',
  'meta mais perto!'
];

const FALAS_SCARE = [
  'CARD ATRASADO! 😱',
  'corre, corre! ⏰',
  'tem prazo vencido!',
  'socorrooo, atrasou!',
  'aaah, passou do prazo!',
  'alguém viu esse prazo?! 😰',
  'code red: card atrasado!',
  'o relógio venceu! ⏰',
  'pânico! prazo estourado 😱',
  'rápido, esse tá atrasado!'
];

const FALAS_WORRY = [
  'ainda tem card atrasado, hein… 😟',
  'não esquece do prazo vencido ⏰',
  'aquele card te espera…',
  'bora resolver o atraso? 🙏',
  'o prazo já passou 😬',
  'psiu… tem atraso pra cuidar',
  'foco no card atrasado!',
  'esse prazo não se cumpre sozinho',
  'tá devendo um prazo aí 👀',
  'quanto mais espera, pior 😅',
  'um cafézinho e resolve esse atraso? ☕'
];

let miniReacting = false;
let reacting = false;

function seatedInteract() {
  if (REDUCED || reacting || miniReacting) return;

  miniReacting = true;

  const actions = ['think', 'boost', 'stretch', 'nod', 'pop'];
  const action = actions[Math.floor(Math.random() * actions.length)];

  if (action === 'think') {
    otter.classList.add('nod');

    showThought(
      ['?', '!', '💡', '☕', '#'][Math.floor(Math.random() * 5)],
      1400
    );

    say(
      FALAS_THINKING[Math.floor(Math.random() * FALAS_THINKING.length)],
      1600
    );

    setTimeout(() => {
      otter.classList.remove('nod');
      miniReacting = false;
    }, 900);

    return;
  }

  if (action === 'boost') {
    otter.classList.add('type-boost');
    scene.classList.add('typing-boost');

    say('modo foco ativado ⚡', 1500);

    setTimeout(() => {
      otter.classList.remove('type-boost');
      scene.classList.remove('typing-boost');
      miniReacting = false;
    }, 1400);

    return;
  }

  if (action === 'stretch') {
    otter.classList.add('seat-stretch');

    say('esticando as patinhas...', 1500);

    setTimeout(() => {
      otter.classList.remove('seat-stretch');
      miniReacting = false;
    }, 950);

    return;
  }

  if (action === 'nod') {
    otter.classList.add('nod');

    say('anotado!', 1300);

    setTimeout(() => {
      otter.classList.remove('nod');
      miniReacting = false;
    }, 800);

    return;
  }

  otter.classList.add('seat-pop');

  say(
    FALAS_WORK_CLICK[Math.floor(Math.random() * FALAS_WORK_CLICK.length)],
    1500
  );

  setTimeout(() => {
    otter.classList.remove('seat-pop');
    miniReacting = false;
  }, 650);
}

function poke() {
  const st = otter.dataset.state;

  if (st === 'sleep') {
    wake();
    return;
  }

  if (st === 'work' && otter.classList.contains('seated')) {
    seatedInteract();
    return;
  }

  say(idleFala());
}

function resetPose() {
  otter.classList.remove(
    'seated',
    'napping',
    'cheer',
    'scared',
    'face-left',
    'shake',
    'tumbling',
    'walking',
    'waking',
    'seat-stretch',
    'type-boost',
    'nod',
    'seat-pop'
  );

  scene.classList.remove('typing-boost');

  if (chair) {
    chair.classList.remove('out', 'fallen');
  }

  if (stepDust) {
    stepDust.classList.remove('on', 'dir-left', 'dir-right');
  }

  if (thought) {
    thought.classList.remove('on');
  }

  rAngry = false;
  rCry = false;
  rFace = false;
  miniReacting = false;
}

function resume() {
  if (!auto) return;

  goWork(() => {
    later(loop, CONFIG.loop.afterWork);
  });
}

const CONF_COLORS = [
  '#d97757',
  '#00796D',
  '#f4c542',
  '#5ad1c0',
  '#9be15d'
];

function tobiConfetti(n) {
  const layer = document.createElement('div');
  layer.className = 'tobi-confetti';
  layer.style.left = ((parseFloat(otter.style.left) || 0) + 27) + 'px';
  layer.style.bottom = '46px';

  for (let i = 0; i < (n || 16); i++) {
    const p = document.createElement('i');

    p.style.background = CONF_COLORS[i % CONF_COLORS.length];
    p.style.setProperty('--dx', (Math.random() * 70 - 35).toFixed(0) + 'px');
    p.style.setProperty('--dy', (-34 - Math.random() * 46).toFixed(0) + 'px');
    p.style.setProperty('--rot', (Math.random() * 540 - 270).toFixed(0) + 'deg');
    p.style.animationDelay = (Math.random() * 0.18).toFixed(2) + 's';

    layer.appendChild(p);
  }

  scene.appendChild(layer);

  setTimeout(() => {
    layer.remove();
  }, 1500);
}

function cheer(msg) {
  if (REDUCED || reacting) return;

  reacting = true;
  ++gen;
  clearLater();
  clearWorkQuirk();
  walk = null;

  resetPose();
  setState('cheer');

  otter.classList.add('cheer');
  scene.classList.add('cheering');

  tobiConfetti();

  later(() => {
    tobiConfetti(12);
  }, 380);

  say(
    msg || FALAS_CHEER[Math.floor(Math.random() * FALAS_CHEER.length)],
    2200
  );

  later(() => {
    otter.classList.remove('cheer');
    scene.classList.remove('cheering');
    reacting = false;
    resume();
    scheduleWorkQuirk();
  }, 1750);
}

function worry() {
  if (REDUCED || reacting) return;

  say(
    FALAS_WORRY[Math.floor(Math.random() * FALAS_WORRY.length)],
    2800
  );

  otter.classList.add('scared');

  setTimeout(() => {
    otter.classList.remove('scared');
  }, 1500);
}

let worryTimer = null;
let overdueOn = false;

function stopWorry() {
  if (worryTimer) {
    clearTimeout(worryTimer);
    worryTimer = null;
  }
}

function scheduleWorry() {
  stopWorry();

  worryTimer = setTimeout(function tick() {
    if (!scene.classList.contains('has-overdue')) {
      worryTimer = null;
      return;
    }

    if (!REDUCED && !reacting) {
      if (Math.random() < 0.30) {
        scare();
      } else {
        worry();
      }
    }

    worryTimer = setTimeout(tick, 20000 + Math.random() * 15000);
  }, 20000 + Math.random() * 15000);
}

function alert(on) {
  on = !!on;

  scene.classList.toggle('has-overdue', on);

  if (on === overdueOn) return;

  overdueOn = on;

  if (on && !REDUCED) {
    scheduleWorry();
  } else {
    stopWorry();
  }
}

function scare(msg) {
  if (REDUCED || reacting) return;

  reacting = true;
  ++gen;
  clearLater();
  clearWorkQuirk();
  walk = null;

  resetPose();

  say(
    msg || FALAS_SCARE[Math.floor(Math.random() * FALAS_SCARE.length)],
    2600
  );

  const a = Math.max(2, L.coffee);
  const b = Math.max(a + 20, L.seat);
  const FAST = 520;

  const dash = (x, after) => {
    const cur = parseFloat(otter.style.left) || 0;
    const maxX = Math.max(0, (scene.clientWidth || L.W || 217) - 54);
    const target = clamp(x, 0, maxX);

    otter.classList.toggle('face-left', target < cur);
    otter.classList.add('scared');

    setState('walk');

    walk = {
      from: cur,
      to: target,
      start: performance.now(),
      dur: FAST
    };

    later(() => {
      otter.style.left = target + 'px';

      if (after) after();
    }, FAST);
  };

  dash(b, () => {
    dash(a, () => {
      dash(b, () => {
        dash(a, () => {
          otter.classList.remove('scared');

          setState('idle');

          reacting = false;
          resume();
          scheduleWorkQuirk();
        });
      });
    });
  });
}

function coffeeFace() {
  if (REDUCED || reacting) return;

  reacting = true;
  ++gen;
  clearLater();
  clearWorkQuirk();
  walk = null;

  cPour = false;
  cSip = false;
  cLift = 0;
  cLevel = -1;

  rFace = true;
  rAngry = true;

  otter.classList.add('shake');

  const splash = document.createElement('div');
  splash.className = 'tobi-splash';
  splash.style.left = ((parseFloat(otter.style.left) || 0) + 22) + 'px';
  splash.style.bottom = '38px';

  scene.appendChild(splash);

  say(
    FALAS_SPILL[Math.floor(Math.random() * FALAS_SPILL.length)],
    2400
  );

  later(() => {
    otter.classList.remove('shake');
  }, 800);

  later(() => {
    splash.remove();
  }, 1400);

  later(() => {
    rFace = false;
    rAngry = false;
    reacting = false;

    resume();
    scheduleWorkQuirk();
  }, 2200);
}

function wake() {
  if (REDUCED || reacting) return;

  reacting = true;
  ++gen;
  clearLater();
  clearWorkQuirk();
  walk = null;

  otter.classList.remove('napping', 'seated', 'shake');

  if (chair) {
    chair.classList.remove('out');
  }

  setState('wake');
  otter.classList.add('waking');

  popWakeStars();

  say(
    FALAS_WAKE[Math.floor(Math.random() * FALAS_WAKE.length)],
    1900
  );

  later(() => {
    otter.classList.remove('waking');
    reacting = false;

    goWork(() => {
      scheduleWorkQuirk();
    });
  }, 1500);
}

let workQuirkTimer = null;

function clearWorkQuirk() {
  if (workQuirkTimer) {
    clearTimeout(workQuirkTimer);
    workQuirkTimer = null;
  }
}

function workQuirk() {
  if (
    REDUCED ||
    reacting ||
    miniReacting ||
    otter.dataset.state !== 'work' ||
    !otter.classList.contains('seated')
  ) {
    return;
  }

  const roll = Math.random();

  if (roll < 0.34) {
    showThought(
      ['?', '💡', '☕', '#'][Math.floor(Math.random() * 4)],
      1300
    );

    otter.classList.add('nod');

    setTimeout(() => {
      otter.classList.remove('nod');
    }, 700);

    return;
  }

  if (roll < 0.67) {
    otter.classList.add('type-boost');
    scene.classList.add('typing-boost');

    setTimeout(() => {
      otter.classList.remove('type-boost');
      scene.classList.remove('typing-boost');
    }, 900);

    return;
  }

  otter.classList.add('seat-stretch');

  setTimeout(() => {
    otter.classList.remove('seat-stretch');
  }, 900);
}

function scheduleWorkQuirk() {
  clearWorkQuirk();

  if (REDUCED) return;

  workQuirkTimer = setTimeout(() => {
    workQuirk();
    scheduleWorkQuirk();
  }, 9000 + Math.random() * 9000);
}

function handlePoke() {
  try {
    const total =
      (parseInt(localStorage.getItem('sf_tobi_pokes') || '0', 10) || 0) + 1;

    localStorage.setItem('sf_tobi_pokes', String(total));

    if (
      total > 0 &&
      total % 15 === 0 &&
      otter.dataset.state !== 'coffee' &&
      otter.dataset.state !== 'sleep'
    ) {
      say('você gosta mesmo de cutucar, hein 😄', 2400);
      return;
    }
  } catch (e) {}

  if (otter.dataset.state === 'coffee' && !reacting) {
    coffeeFace();
    return;
  }

  poke();
}

cv.addEventListener('click', handlePoke);

cv.addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    handlePoke();
  }
});

otter.style.transition = 'none';

layout();

if (REDUCED) {
  scene.classList.add('is-static');

  otter.style.transition = 'none';
  otter.style.left = L.seat + 'px';

  setState('work');
  otter.classList.add('seated');

  if (chair) {
    chair.classList.add('out');
  }

  drawBeaver(dF, {
    sit: true,
    armPhase: 0,
    t: performance.now(),
    theme: THEME
  });

  return;
}

otter.style.left = L.seat + 'px';

setState('work');
otter.classList.add('seated');

if (chair) {
  chair.classList.add('out');
}

requestAnimationFrame(frame);

loop();
scheduleWorkQuirk();

let rz;

window.addEventListener('resize', () => {
  clearTimeout(rz);

  rz = setTimeout(() => {
    const beforeState = otter.dataset.state;

    layout();

    const maxX = Math.max(0, (scene.clientWidth || L.W || 217) - 54);
    const cur = parseFloat(otter.style.left) || 0;

    if (beforeState === 'work') {
      otter.style.left = L.seat + 'px';
    } else {
      otter.style.left = clamp(cur, 0, maxX) + 'px';
    }
  }, 150);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    lastBlink = performance.now();
  }
});

// 🌋 Terremoto: tremor forte na cena + fala secreta (conquista oculta).
function quake() {
  if (!scene) return;
  scene.classList.add('tobi-quaking');
  const falas = ['TEERREMOTOOO! 🌋', 'tremeu tudo! 😱', 'segura as metas! 🫨',
                 'abalo sísmico no quadro! 📉', 'cadê meu capacete?! 👷', 'a terra treme! 🪨'];
  try { say(falas[Math.floor(Math.random() * falas.length)]); } catch (e) {}
  setTimeout(() => scene.classList.remove('tobi-quaking'), 1300);
}

window.Tobi = {
  poke,
  cheer,
  scare,
  alert,
  quake,
  goWork,
  goCoffee,
  goSleep,
  wake,
  coffeeFace,
  say,
  seatedInteract,
  workQuirk,

  toggleAuto: () => {
    auto = !auto;

    if (auto) {
      loop();
      scheduleWorkQuirk();
    } else {
      clearLater();
      clearWorkQuirk();
    }

    return auto;
  },

  /* Acessibilidade: congela (on) ou retoma (off) o Tobi em runtime.
     Chamado pelo painel quando "Reduzir animações" muda. */
  setReducedMotion: (on) => {
    reducedRuntime = !!on;
    if (on) {
      auto = false;
      try { clearLater(); clearWorkQuirk(); } catch (e) {}
      if (scene) scene.classList.add('is-static');
      // congela numa pose calma, sentado trabalhando
      try {
        otter.style.transition = 'none';
        otter.style.left = L.seat + 'px';
        setState('work');
        otter.classList.add('seated');
        if (chair) chair.classList.add('out');
        drawBeaver(dF, { sit: true, armPhase: 0, t: performance.now(), theme: THEME });
      } catch (e) {}
    } else {
      if (scene) scene.classList.remove('is-static');
      auto = true;
      requestAnimationFrame(frame);
      loop();
      scheduleWorkQuirk();
    }
    return reducedRuntime;
  }
};

document.dispatchEvent(new CustomEvent('tobi:ready'));

}

if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', boot);
} else {
boot();
}
})();
