/* ═══ SyncroFlow — js/a11y/announcer.js
   Live regions para leitores de tela. Use com CRITÉRIO: só anuncie
   o que for relevante (erros, sucesso, carregamento, mudanças de
   estado importantes). Para mensagens normais o app já tem #toasts
   (role=status, aria-live=polite). */

let politeEl = null;
let assertiveEl = null;

function ensureRegions() {
  if (politeEl && assertiveEl) return;
  const make = (live) => {
    const d = document.createElement('div');
    d.className = 'sr-only';
    d.setAttribute('aria-live', live);
    d.setAttribute('aria-atomic', 'true');
    d.setAttribute('role', live === 'assertive' ? 'alert' : 'status');
    document.body.appendChild(d);
    return d;
  };
  politeEl = make('polite');
  assertiveEl = make('assertive');
}

/**
 * Anuncia uma mensagem ao leitor de tela.
 * @param {string} message
 * @param {{assertive?: boolean}} [opts] assertive=true interrompe a fala atual.
 */
export function announce(message, opts = {}) {
  if (!message) return;
  ensureRegions();
  const region = opts.assertive ? assertiveEl : politeEl;
  // Limpa e reescreve no próximo tick para forçar o reanúncio mesmo
  // que a mensagem seja idêntica à anterior.
  region.textContent = '';
  window.requestAnimationFrame(() => { region.textContent = String(message); });
}
