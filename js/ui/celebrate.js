/* ═══ SyncroFlow — js/ui/celebrate.js
   Pequena explosão de confete para celebrar a conclusão de um card.
   Sem dependências; respeita "prefers-reduced-motion". */

const COLORS = ['#10b981', '#22d3ee', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#ec4899'];
let styleInjected = false;

function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .sf-confetti-layer { position: fixed; inset: 0; pointer-events: none; z-index: 99999; overflow: hidden; }
    .sf-confetti {
      position: absolute; width: 9px; height: 14px; border-radius: 2px;
      will-change: transform, opacity; opacity: 0.95;
      animation: sf-confetti-fall var(--dur) cubic-bezier(.18,.7,.4,1) forwards;
    }
    @keyframes sf-confetti-fall {
      0%   { transform: translate(0,0) rotate(0deg) scale(1); opacity: 1; }
      100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(.7); opacity: 0; }
    }
    .sf-burst {
      position: fixed; z-index: 99998; pointer-events: none;
      font-size: 30px; transform: translate(-50%, -50%);
      animation: sf-burst-pop .9s ease-out forwards;
    }
    @keyframes sf-burst-pop {
      0%   { transform: translate(-50%,-50%) scale(.3); opacity: 0; }
      30%  { transform: translate(-50%,-70%) scale(1.15); opacity: 1; }
      100% { transform: translate(-50%,-130%) scale(1); opacity: 0; }
    }`;
  document.head.appendChild(s);
}

/**
 * Dispara a celebração a partir de um ponto (x, y) na viewport.
 * @param {number} x
 * @param {number} y
 * @param {object} [opts] { count, emoji }
 */
export function celebrate(x, y, opts = {}) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  injectStyle();
  const count = opts.count || 36;
  const cx = x ?? innerWidth / 2;
  const cy = y ?? innerHeight / 2;

  const layer = document.createElement('div');
  layer.className = 'sf-confetti-layer';
  document.body.appendChild(layer);

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'sf-confetti';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 90 + Math.random() * 170;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist + 120 + Math.random() * 80; // tende a cair
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    p.style.background = COLORS[i % COLORS.length];
    p.style.setProperty('--dx', dx.toFixed(0) + 'px');
    p.style.setProperty('--dy', dy.toFixed(0) + 'px');
    p.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
    p.style.setProperty('--dur', (0.9 + Math.random() * 0.7).toFixed(2) + 's');
    layer.appendChild(p);
  }

  // emoji "pop" central
  const burst = document.createElement('div');
  burst.className = 'sf-burst';
  burst.textContent = opts.emoji || '🎉';
  burst.style.left = cx + 'px';
  burst.style.top = cy + 'px';
  document.body.appendChild(burst);

  setTimeout(() => { layer.remove(); burst.remove(); }, 1900);
}
