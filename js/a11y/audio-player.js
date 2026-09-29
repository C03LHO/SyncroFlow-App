/* ═══ SyncroFlow — js/a11y/audio-player.js
   Player de áudio acessível, construído SOBRE o <audio> nativo.
   - Sem autoplay.
   - Controles operáveis por teclado (Enter/Espaço no play; setas nos sliders).
   - Tempo, barra de progresso e volume acessíveis.
   - Transcrição textual vinculada (WCAG 1.2.1).
   - Registry global → pauseAllAudio() pausa qualquer som (usado pelo painel). */

import { announce } from './announcer.js';

const players = new Set();
let seq = 0;

/** Pausa TODOS os áudios criados por este módulo. Retorna quantos pausou. */
export function pauseAllAudio() {
  let n = 0;
  players.forEach(({ audio }) => { if (!audio.paused) { audio.pause(); n++; } });
  // Também pausa <audio>/<video> nativos da página, por garantia.
  document.querySelectorAll('audio, video').forEach(m => { if (!m.paused) { m.pause(); n++; } });
  if (n) announce(`${n} mídia(s) pausada(s).`);
  return n;
}

const fmt = (s) => {
  if (!isFinite(s)) return '00:00';
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

/**
 * Cria um player de áudio acessível.
 * @param {Object} opts
 * @param {string} opts.src        URL do áudio (obrigatório).
 * @param {string} [opts.title]    Título acessível do player.
 * @param {string} [opts.type]     MIME (ex.: "audio/mpeg").
 * @param {Array|string} [opts.transcript]  Cues [{t, text, sound}] OU HTML pronto.
 * @returns {HTMLElement} elemento <section> pronto para inserir no DOM.
 */
export function createAudioPlayer({ src, title = 'Áudio', type = '', transcript = null } = {}) {
  const id = `aplayer-${++seq}`;
  const wrap = document.createElement('section');
  wrap.className = 'aplayer';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', `Player de áudio: ${title}`);

  const hasTranscript = transcript != null;
  const transcriptId = `${id}-transcript`;

  wrap.innerHTML = `
    <div class="aplayer-title">🔊 <span>${escapeHTML(title)}</span></div>

    <!-- elemento nativo (fallback total + acessibilidade garantida) -->
    <audio id="${id}-audio" preload="metadata"${type ? '' : ''}>
      <source src="${escapeAttr(src)}"${type ? ` type="${escapeAttr(type)}"` : ''}>
      Seu navegador não suporta áudio incorporado.
      <a href="${escapeAttr(src)}">Baixar o áudio</a>.
    </audio>

    <div class="aplayer-controls">
      <button type="button" class="aplayer-btn" data-act="play"
              aria-label="Reproduzir" aria-pressed="false">▶</button>

      <span class="aplayer-time" aria-hidden="true"><span data-cur>00:00</span> / <span data-dur>00:00</span></span>

      <input class="aplayer-seek" type="range" min="0" max="100" value="0" step="0.5"
             aria-label="Posição da reprodução" aria-valuetext="0 segundos">

      <span class="aplayer-volume-wrap">
        <button type="button" class="aplayer-btn" data-act="mute" aria-label="Silenciar" aria-pressed="false" style="width:36px;height:36px;font-size:15px;">🔉</button>
        <input class="aplayer-volume" type="range" min="0" max="1" value="1" step="0.05" aria-label="Volume">
      </span>
    </div>

    ${hasTranscript ? `
    <button type="button" class="aplayer-transcript-toggle" aria-expanded="false" aria-controls="${transcriptId}">
      📄 Mostrar transcrição
    </button>
    <div class="aplayer-transcript" id="${transcriptId}" hidden>
      <h4>Transcrição</h4>
      ${renderTranscript(transcript)}
    </div>` : ''}
  `;

  const audio   = wrap.querySelector('audio');
  const playBtn = wrap.querySelector('[data-act="play"]');
  const muteBtn = wrap.querySelector('[data-act="mute"]');
  const seek    = wrap.querySelector('.aplayer-seek');
  const vol     = wrap.querySelector('.aplayer-volume');
  const curEl   = wrap.querySelector('[data-cur]');
  const durEl   = wrap.querySelector('[data-dur]');

  players.add({ audio });

  // ── Play / Pause ──
  playBtn.addEventListener('click', () => { audio.paused ? audio.play() : audio.pause(); });
  audio.addEventListener('play', () => {
    playBtn.textContent = '⏸'; playBtn.setAttribute('aria-label', 'Pausar'); playBtn.setAttribute('aria-pressed', 'true');
    announce(`Reproduzindo ${title}.`);
  });
  audio.addEventListener('pause', () => {
    playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', 'Reproduzir'); playBtn.setAttribute('aria-pressed', 'false');
  });
  audio.addEventListener('ended', () => {
    playBtn.textContent = '▶'; playBtn.setAttribute('aria-label', 'Reproduzir'); playBtn.setAttribute('aria-pressed', 'false');
    announce(`${title} terminou.`);
  });

  // ── Tempo + barra de progresso ──
  audio.addEventListener('loadedmetadata', () => { durEl.textContent = fmt(audio.duration); seek.max = String(audio.duration || 100); });
  audio.addEventListener('timeupdate', () => {
    curEl.textContent = fmt(audio.currentTime);
    if (!seek.matches(':active')) seek.value = String(audio.currentTime);
    seek.setAttribute('aria-valuetext', `${fmt(audio.currentTime)} de ${fmt(audio.duration)}`);
  });
  seek.addEventListener('input', () => { audio.currentTime = Number(seek.value); });

  // ── Volume / mudo ──
  vol.addEventListener('input', () => { audio.volume = Number(vol.value); audio.muted = audio.volume === 0; syncMute(); });
  muteBtn.addEventListener('click', () => { audio.muted = !audio.muted; syncMute(); });
  function syncMute() {
    const m = audio.muted || audio.volume === 0;
    muteBtn.textContent = m ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', m ? 'Reativar som' : 'Silenciar');
    muteBtn.setAttribute('aria-pressed', String(m));
  }

  // ── Transcrição ──
  if (hasTranscript) {
    const toggle = wrap.querySelector('.aplayer-transcript-toggle');
    const panel = wrap.querySelector('.aplayer-transcript');
    toggle.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '📄 Ocultar transcrição' : '📄 Mostrar transcrição';
    });
    // Clicar numa marca de tempo da transcrição salta para o trecho.
    panel.querySelectorAll('[data-seek]').forEach(b => {
      b.addEventListener('click', () => { audio.currentTime = Number(b.dataset.seek); audio.play(); });
    });
  }

  return wrap;
}

function renderTranscript(t) {
  if (typeof t === 'string') return t;               // HTML pronto
  if (!Array.isArray(t)) return '';
  return t.map(c => {
    const time = c.t != null
      ? `<button type="button" class="cue-seek" data-seek="${Number(c.t)}" aria-label="Ir para ${fmt(c.t)}"><time>${fmt(c.t)}</time></button>`
      : '';
    const text = c.sound ? `<span class="sound">[${escapeHTML(c.text)}]</span>` : escapeHTML(c.text);
    return `<p class="cue">${time}${text}</p>`;
  }).join('');
}

/* utils locais (sem dependência do core) */
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function escapeAttr(s) { return escapeHTML(s); }
