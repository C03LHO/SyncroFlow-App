/* ═══ SyncroFlow — js/a11y/focus-trap.js
   Utilitário de armadilha de foco para overlays MODAIS (dialog,
   drawer do painel). Use SOMENTE quando o conteúdo for realmente
   modal — menus/tooltips não devem prender o foco. */

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])', 'audio[controls]', 'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

/** Lista os elementos focáveis e visíveis dentro de um contêiner. */
export function getFocusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE))
    .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
}

/**
 * Prende o foco dentro de `container` (Tab/Shift+Tab circulam).
 * Move o foco inicial para o primeiro focável (ou `initialFocus`).
 * Ao liberar, devolve o foco ao elemento que estava ativo antes.
 *
 * @returns {() => void} função para liberar a armadilha.
 */
export function trapFocus(container, { initialFocus = null } = {}) {
  const previouslyFocused = document.activeElement;

  const focusFirst = () => {
    const target = initialFocus || getFocusable(container)[0] || container;
    // Contêineres não-focáveis recebem tabindex=-1 para poderem receber foco.
    if (target === container && !container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
    }
    try { target.focus({ preventScroll: true }); } catch {}
  };

  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const items = getFocusable(container);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !container.contains(active))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); first.focus();
    }
  }

  document.addEventListener('keydown', onKeydown, true);
  focusFirst();

  return function release() {
    document.removeEventListener('keydown', onKeydown, true);
    // Devolve o foco a quem chamou (WCAG 2.4.3 — foco previsível).
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try { previouslyFocused.focus({ preventScroll: true }); } catch {}
    }
  };
}
