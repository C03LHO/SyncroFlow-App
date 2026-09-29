/* ═══ SyncroFlow — js/a11y/read-aloud.js
   Leitura por APONTAMENTO (hover) e por FOCO — estilo "explorar com o
   toque". Quando ativo, fala o nome acessível do elemento sob o mouse
   ou que recebeu foco por teclado. Recurso complementar (não substitui
   um leitor de tela), usando a Web Speech API. */

import { announce } from './announcer.js';

let hoverOn = false;
let curTarget = null;
let hl = null;
let timer = null;

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}
export function isHoverReading() { return hoverOn; }

export function stopReading() { if (ttsSupported()) window.speechSynthesis.cancel(); }

/* Remove emojis e símbolos decorativos (ícones) para não serem lidos em voz.
   Ex.: "🗣 Ler ao passar o mouse" → "Ler ao passar o mouse". */
export function cleanForSpeech(text) {
  return String(text || '')
    // emojis / pictogramas (♿, 🗣, 👁, ⏸, 🔠 …) e bandeiras
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ' ')
    // setas, símbolos técnicos/geométricos, símbolos diversos e dingbats (↔, ◐, ⏹, ◆, ✕ …)
    .replace(/[←-⇿⌀-⏿■-➿⬀-⯿]/g, ' ')
    // seletor de variação, ZWJ e combinador de keycap
    .replace(/[︀-️‍⃣]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function speak(text) {
  if (!ttsSupported()) return;
  const clean = cleanForSpeech(text);
  if (!clean) return;                       // só ícone/emoji → não fala nada
  window.speechSynthesis.cancel();          // sempre fala o alvo ATUAL (responsivo)
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = document.documentElement.lang || 'pt-BR';
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

/* Nome acessível "humano" de um elemento, sem ruído. */
function accessibleText(el) {
  if (!el || el.nodeType !== 1) return '';

  const aria = el.getAttribute && el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();

  const labelledby = el.getAttribute && el.getAttribute('aria-labelledby');
  if (labelledby) {
    const t = labelledby.split(/\s+/).map(id => (document.getElementById(id) || {}).innerText || '').join(' ').replace(/\s+/g, ' ').trim();
    if (t) return t;
  }

  const tag = el.tagName;
  if (tag === 'IMG') return (el.getAttribute('alt') || '').trim() || 'imagem sem descrição';

  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    const id = el.id;
    let lab = null;
    try { lab = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null; } catch {}
    if (!lab && el.closest) lab = el.closest('label');
    const labelText = (lab && lab.innerText.trim()) || el.getAttribute('placeholder') || el.getAttribute('name') || 'campo';
    if (el.type === 'password') return `${labelText}, campo de senha`;
    if (el.type === 'checkbox' || el.type === 'radio') return `${labelText}, ${el.checked ? 'marcado' : 'não marcado'}`;
    const val = (el.value || '').trim();
    return val ? `${labelText}: ${val}` : `${labelText}, campo`;
  }

  const own = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  if (/^(BUTTON|A)$/.test(tag) && own) return own + (tag === 'A' ? ', link' : ', botão');
  return own;
}

/* Sobe a árvore até um alvo significativo e enxuto (evita ler blocos enormes). */
function meaningfulTarget(el) {
  let node = el;
  for (let i = 0; i < 6 && node && node !== document.body; i++) {
    const tag = node.tagName;
    const role = node.getAttribute && node.getAttribute('role');
    if (/^(BUTTON|A|LABEL|INPUT|TEXTAREA|SELECT|SUMMARY|H[1-6]|LI|TD|TH|OPTION|IMG)$/.test(tag)
        || (node.getAttribute && node.getAttribute('aria-label'))
        || role === 'button' || role === 'switch' || role === 'tab') {
      return node;
    }
    const own = (node.innerText || '').replace(/\s+/g, ' ').trim();
    if (own && own.length <= 180 && node.children.length === 0) return node;  // folha textual
    node = node.parentElement;
  }
  return el;
}

function highlight(el) {
  if (hl && hl !== el && hl.classList) hl.classList.remove('a11y-reading-target');
  hl = el;
  if (el && el.classList) el.classList.add('a11y-reading-target');
}

function onPointer(e) {
  const raw = e.target;
  if (!raw || raw.nodeType !== 1 || raw === document.body) return;
  const target = meaningfulTarget(raw);
  if (target === curTarget) return;
  curTarget = target;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const text = accessibleText(target);
    if (text && text.length <= 320) { highlight(target); speak(text); }
  }, 300);   // pequena espera: não lê tudo ao varrer a tela
}

function onFocus(e) {
  const raw = e.target;
  if (!raw || raw === document.body) return;
  const target = meaningfulTarget(raw);
  curTarget = target;
  clearTimeout(timer);
  const text = accessibleText(target);
  if (text) { highlight(target); speak(text); }   // foco por teclado fala imediatamente
}

/** Liga/desliga o modo de leitura por apontamento + foco. */
export function setHoverReading(on) {
  on = !!on;
  if (on === hoverOn) return hoverOn;
  hoverOn = on;
  if (on) {
    if (!ttsSupported()) { announce('Leitura em voz não é suportada neste navegador.', { assertive: true }); }
    document.addEventListener('mouseover', onPointer, true);
    document.addEventListener('focusin', onFocus, true);
    document.documentElement.classList.add('a11y-read-hover');
    announce('Leitura ao passar o mouse ativada.');
  } else {
    document.removeEventListener('mouseover', onPointer, true);
    document.removeEventListener('focusin', onFocus, true);
    document.documentElement.classList.remove('a11y-read-hover');
    clearTimeout(timer);
    curTarget = null;
    if (hl && hl.classList) hl.classList.remove('a11y-reading-target');
    hl = null;
    stopReading();
  }
  return hoverOn;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { try { window.speechSynthesis.cancel(); } catch {} });
}
