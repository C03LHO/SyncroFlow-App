/* ═══ SyncroFlow — js/a11y/panel.js
   Botão flutuante (FAB) + painel de acessibilidade do usuário.
   - É um dialog modal: trava de foco, Esc fecha, foco volta ao FAB.
   - Cada toggle é um <button> com aria-pressed (nome + papel corretos).
   - Sincroniza com preferences.js (inclusive no "Restaurar padrão"). */

import {
  getPrefs, setPref, stepFont, resetPrefs, subscribe, applyPreset,
  FONT_MIN, FONT_MAX, FONT_STEP,
} from './preferences.js';
import { announce } from './announcer.js';
import { trapFocus } from './focus-trap.js';
import { pauseAllAudio } from './audio-player.js';
import { ttsSupported } from './read-aloud.js';

let fab = null;
let releaseTrap = null;
let backdrop = null;
let unsubscribe = null;

/* Definição declarativa dos toggles (preferência ↔ rótulo). */
const TOGGLES = [
  { section: 'Visão',            key: 'contrast',       ico: '◐', label: 'Alto contraste',     desc: 'Cores fortes para melhor leitura' },
  { section: 'Visão',            key: 'readableFont',   ico: 'Aa', label: 'Fonte mais legível', desc: 'Tipografia de alta legibilidade' },
  { section: 'Visão',            key: 'reading',        img: 'modo-leitura.webp', label: 'Modo leitura',       desc: 'Remove distrações e centraliza o conteúdo' },
  { section: 'Leitura e foco',   key: 'links',          ico: '🔗', label: 'Destacar links',     desc: 'Sublinha e realça os links' },
  { section: 'Leitura e foco',   key: 'focusHighlight', img: 'destacar-foco.webp', label: 'Destacar foco',      desc: 'Anel de foco reforçado ao navegar por teclado' },
  { section: 'Leitura e foco',   key: 'spacing',        ico: '↔', label: 'Espaçamento de texto', desc: 'Mais espaço entre linhas, letras e palavras' },
  { section: 'Movimento e som',  key: 'reduceMotion',   img: 'reduzir-animacoes.webp', label: 'Reduzir animações',  desc: 'Minimiza transições e efeitos' },
  { section: 'Mascote',          key: 'mascot',         ico: '🦫', label: 'Mascote Tobi',       desc: 'Mostra o castor no rodapé da barra lateral' },
];

/* Renderiza o ícone de uma linha: PNG mascarado (assume a cor do tema) ou emoji. */
const rowIcon = (t) => t.img
  ? `<span class="a11y-ico sf-ico" style="-webkit-mask-image:url('imagens/icones/${t.img}');mask-image:url('imagens/icones/${t.img}')" aria-hidden="true"></span>`
  : `<span class="a11y-ico">${t.ico}</span>`;

export function initA11yPanel() {
  if (fab) return;
  fab = document.createElement('button');
  fab.id = 'a11y-fab';
  fab.type = 'button';
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-label', 'Abrir opções de acessibilidade');
  fab.setAttribute('aria-keyshortcuts', 'Alt+A');
  fab.title = 'Acessibilidade (Alt+A)';
  fab.innerHTML = '<img src="imagens/icones/acessibilidade.webp" alt="" aria-hidden="true" class="a11y-fab-icon">';
  fab.addEventListener('click', openA11yPanel);
  document.body.appendChild(fab);

  // "Espia" sozinho 1x ao abrir a página (a não ser que o usuário peça
  // menos movimento), para sinalizar que está ali — depois recolhe.
  if (!getPrefs().reduceMotion) {
    requestAnimationFrame(() => {
      fab.classList.add('is-peek');
      setTimeout(() => fab.classList.remove('is-peek'), 2600);
    });
  }
}

/** Mostra/esconde o painel (usado pelo atalho Alt+A). */
export function toggleA11yPanel() {
  backdrop ? closeA11yPanel() : openA11yPanel();
}

export function openA11yPanel() {
  if (backdrop) return;
  const prefs = getPrefs();

  backdrop = document.createElement('div');
  backdrop.className = 'a11y-backdrop';

  const panel = document.createElement('div');
  panel.className = 'a11y-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'a11y-panel-title');

  panel.innerHTML = `
    <div class="a11y-panel-head">
      <h2 id="a11y-panel-title"><img src="imagens/icones/acessibilidade.webp" alt="" aria-hidden="true" class="a11y-title-icon"> Acessibilidade</h2>
      <button type="button" class="a11y-panel-close" aria-label="Fechar painel de acessibilidade">✕</button>
    </div>

    <div class="a11y-section-label">Perfis rápidos</div>
    <div class="a11y-presets" role="group" aria-label="Perfis de acessibilidade">
      <button type="button" class="a11y-preset" data-preset="lowVision"><span class="pico sf-ico" style="-webkit-mask-image:url('imagens/icones/baixa-visao.webp');mask-image:url('imagens/icones/baixa-visao.webp')" aria-hidden="true"></span>Baixa visão</button>
      <button type="button" class="a11y-preset" data-preset="calmReading"><span class="pico sf-ico" style="-webkit-mask-image:url('imagens/icones/leitura-tranquila.webp');mask-image:url('imagens/icones/leitura-tranquila.webp')" aria-hidden="true"></span>Leitura tranquila</button>
      <button type="button" class="a11y-preset" data-preset="keyboard"><span class="pico sf-ico" style="-webkit-mask-image:url('imagens/icones/foco-teclado.webp');mask-image:url('imagens/icones/foco-teclado.webp')" aria-hidden="true"></span>Foco no teclado</button>
    </div>

    <div class="a11y-section-label">Tamanho do conteúdo</div>
    <div class="a11y-row">
      <span class="a11y-row-label"><span class="a11y-ico sf-ico" style="-webkit-mask-image:url('imagens/icones/tamanho-fonte.webp');mask-image:url('imagens/icones/tamanho-fonte.webp')" aria-hidden="true"></span> Tamanho da fonte</span>
      <span class="a11y-stepper">
        <button type="button" data-font="down" aria-label="Diminuir fonte">−</button>
        <output data-font-out aria-live="polite">100%</output>
        <button type="button" data-font="up" aria-label="Aumentar fonte">+</button>
      </span>
    </div>

    ${renderSections()}

    <div class="a11y-section-label">Som e mídia</div>

    <div class="a11y-row">
      <span class="a11y-row-label"><span class="a11y-ico">🗣</span> Ler ao passar o mouse
        <span class="a11y-row-desc">${ttsSupported() ? 'Fala o texto sob o cursor ou em foco (teclado)' : 'Leitura em voz não suportada neste navegador'}</span></span>
      <button type="button" class="a11y-switch" role="switch" aria-checked="false" aria-pressed="false"
              data-toggle="readOnHover" aria-label="Ler ao passar o mouse"${ttsSupported() ? '' : ' disabled'}></button>
    </div>

    <div class="a11y-row">
      <span class="a11y-row-label"><span class="a11y-ico">⏸</span> Pausar sons automáticos
        <span class="a11y-row-desc">Para qualquer áudio/vídeo em reprodução</span></span>
      <button type="button" class="btn btn-secondary" data-act="pause-sounds">Pausar</button>
    </div>

    ${document.querySelector('.aplayer-transcript-toggle') ? `
    <div class="a11y-row">
      <span class="a11y-row-label"><span class="a11y-ico">📄</span> Transcrição
        <span class="a11y-row-desc">Abre a transcrição do áudio desta página</span></span>
      <button type="button" class="btn btn-secondary" data-act="open-transcript">Abrir</button>
    </div>` : ''}

    <div class="a11y-actions">
      <button type="button" class="a11y-reset" data-act="reset">↺ Restaurar padrão</button>
    </div>
    <p class="a11y-kbd-hint">Atalho: <kbd>Alt</kbd> + <kbd>A</kbd> abre e fecha este painel. As preferências ficam salvas neste dispositivo.</p>
  `;

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  fab.setAttribute('aria-expanded', 'true');

  // Fecha ao clicar fora ou no ✕.
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeA11yPanel(); });
  panel.querySelector('.a11y-panel-close').addEventListener('click', closeA11yPanel);
  document.addEventListener('keydown', onEsc, true);

  wirePanel(panel);
  syncControls(panel, prefs);

  // Mantém os controles em dia se as prefs mudarem (ex.: reset).
  unsubscribe = subscribe((p) => syncControls(panel, p));

  // Trava de foco + foco inicial no botão fechar.
  releaseTrap = trapFocus(panel, { initialFocus: panel.querySelector('.a11y-panel-close') });
  announce('Painel de acessibilidade aberto.');
}

export function closeA11yPanel() {
  if (!backdrop) return;
  document.removeEventListener('keydown', onEsc, true);
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (releaseTrap) { releaseTrap(); releaseTrap = null; }   // devolve foco ao FAB
  backdrop.remove();
  backdrop = null;
  if (fab) fab.setAttribute('aria-expanded', 'false');
}

function onEsc(e) { if (e.key === 'Escape') { e.preventDefault(); closeA11yPanel(); } }

function renderSections() {
  const bySection = {};
  TOGGLES.forEach(t => { (bySection[t.section] ||= []).push(t); });
  return Object.entries(bySection).map(([section, items]) => `
    <div class="a11y-section-label">${section}</div>
    ${items.map(t => `
      <div class="a11y-row">
        <span class="a11y-row-label">${rowIcon(t)} ${t.label}
          <span class="a11y-row-desc">${t.desc}</span></span>
        <button type="button" class="a11y-switch" role="switch" aria-checked="false" aria-pressed="false"
                data-toggle="${t.key}" aria-label="${t.label}"></button>
      </div>`).join('')}
  `).join('');
}

function wirePanel(panel) {
  // Fonte +/-
  panel.querySelector('[data-font="down"]').addEventListener('click', () => {
    const p = stepFont(-FONT_STEP); announce(`Fonte ${Math.round(p.fontScale * 100)} por cento.`);
  });
  panel.querySelector('[data-font="up"]').addEventListener('click', () => {
    const p = stepFont(+FONT_STEP); announce(`Fonte ${Math.round(p.fontScale * 100)} por cento.`);
  });

  // Perfis rápidos
  const PRESET_LABEL = { lowVision: 'Baixa visão', calmReading: 'Leitura tranquila', keyboard: 'Foco no teclado' };
  panel.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
    applyPreset(b.dataset.preset);
    announce(`Perfil ${PRESET_LABEL[b.dataset.preset] || ''} aplicado.`, { assertive: true });
  }));

  // Toggles
  panel.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      const next = !getPrefs()[key];
      setPref(key, next);
      const label = btn.getAttribute('aria-label');
      announce(`${label} ${next ? 'ativado' : 'desativado'}.`);
    });
  });

  // Ações
  panel.querySelector('[data-act="pause-sounds"]').addEventListener('click', () => {
    const n = pauseAllAudio();
    announce(n ? `${n} mídia(s) pausada(s).` : 'Nenhum som tocando agora.', { assertive: true });
  });

  // (A "Leitura ao passar o mouse" é um switch data-toggle="readOnHover",
  //  tratado pelo wiring genérico de toggles + o subscribe em index.js.)

  // Transcrição — a linha só existe quando há áudio com transcrição na página.
  const openTr = panel.querySelector('[data-act="open-transcript"]');
  if (openTr) openTr.addEventListener('click', () => {
    const toggle = document.querySelector('.aplayer-transcript-toggle');
    if (!toggle) { announce('Nenhum áudio com transcrição nesta página.', { assertive: true }); return; }
    if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    closeA11yPanel();
    toggle.scrollIntoView({ block: 'center' });
    toggle.focus();
  });

  panel.querySelector('[data-act="reset"]').addEventListener('click', () => {
    resetPrefs();
    announce('Preferências de acessibilidade restauradas ao padrão.', { assertive: true });
  });
}

/** Reflete o estado atual das preferências nos controles do painel. */
function syncControls(panel, prefs) {
  const out = panel.querySelector('[data-font-out]');
  if (out) out.textContent = `${Math.round(prefs.fontScale * 100)}%`;
  const down = panel.querySelector('[data-font="down"]');
  const up = panel.querySelector('[data-font="up"]');
  if (down) down.disabled = prefs.fontScale <= FONT_MIN + 1e-6;
  if (up) up.disabled = prefs.fontScale >= FONT_MAX - 1e-6;

  panel.querySelectorAll('[data-toggle]').forEach(btn => {
    const on = !!prefs[btn.dataset.toggle];
    btn.setAttribute('aria-checked', String(on));
    btn.setAttribute('aria-pressed', String(on));
  });
}
