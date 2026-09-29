/* ═══ SyncroFlow — js/a11y/index.js
   Ponto de entrada do sistema de acessibilidade. Importado uma vez
   por js/main.js. Inicializa preferências + painel e expõe a API
   global window.A11y para uso em qualquer view/módulo. */

import { initPrefs, getPrefs, setPref, setPrefs, resetPrefs, subscribe } from './preferences.js';
import { initA11yPanel, openA11yPanel, toggleA11yPanel } from './panel.js';
import { announce } from './announcer.js';
import { createAudioPlayer, pauseAllAudio } from './audio-player.js';
import { setHoverReading, isHoverReading, stopReading } from './read-aloud.js';

/** Comportamentos que reagem às preferências (além das classes CSS). */
function applyDynamic(prefs) {
  // Tobi respeita "Reduzir animações".
  if (window.Tobi && typeof window.Tobi.setReducedMotion === 'function') {
    window.Tobi.setReducedMotion(!!prefs.reduceMotion);
  }
  // Leitura por apontamento/foco.
  setHoverReading(!!prefs.readOnHover);
}

function boot() {
  // 1) Reaplica as preferências salvas (o _head.php já aplicou antes do
  //    paint; aqui garantimos consistência caso o módulo carregue depois).
  initPrefs();

  // 2) Alvo do skip link precisa ser focável programaticamente.
  const main = document.getElementById('main');
  if (main && !main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');

  // 3) Botão flutuante + painel.
  initA11yPanel();

  // 4) Comportamentos dinâmicos — agora e a cada mudança de preferência.
  document.addEventListener('tobi:ready', () => applyDynamic(getPrefs()));
  applyDynamic(getPrefs());
  subscribe(applyDynamic);

  // 5) Atalho global: Alt+A abre/fecha o painel (funciona até dentro de inputs).
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      toggleA11yPanel();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

/* API pública reutilizável em todo o app. */
window.A11y = {
  announce,                 // A11y.announce('Card salvo')  /  { assertive:true }
  openPanel: openA11yPanel,
  pauseAllAudio,
  createAudioPlayer,        // A11y.createAudioPlayer({ src, title, transcript })
  // Leitura por apontamento/foco (TTS)
  setHoverReading, isHoverReading, stopReading,
  getPrefs, setPref, setPrefs, resetPrefs,
};

export { announce, createAudioPlayer, pauseAllAudio, openA11yPanel };
