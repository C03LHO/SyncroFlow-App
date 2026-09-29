/* ═══ SyncroFlow — js/auth-theme.js
   Seletor de tema AUTÔNOMO (sem ES Modules) para as páginas de
   login e cadastro. Aplica o tema salvo e oferece um popover de
   troca, reaproveitando as classes .theme-popover do main.css.
   O tema é salvo em localStorage('syncro_theme') — o MESMO que o
   app usa — então a escolha persiste do login até dentro do sistema. */
(function () {
  'use strict';
  var KEY = 'syncro_theme';
  // Temas Executivos: mesma paleta dos padrões (Claro/Escuro) + modo sério.
  var EXEC = { 'exec-light': 'light', 'exec-dark': 'dark' };
  var THEMES = {
    Claros: [
      { id: 'light', name: 'Padrão', bg: '#EEF3F6', ring: '#0E5C56' },
      { id: 'sage',  name: 'Sage',          bg: '#EBF0E8', ring: '#2E7D4A' },
      { id: 'dusk',  name: 'Dusk',          bg: '#EEE8F5', ring: '#6244A0' },
      { id: 'sand',  name: 'Sand',          bg: '#EFE8DC', ring: '#8B5E2A' },
    ],
    Escuros: [
      { id: 'dark',      name: 'Padrão',      bg: '#102329', ring: null },
      { id: 'dracula',   name: 'Dracula',     bg: '#282a36', ring: '#bd93f9' },
      { id: 'cyberpunk', name: 'Cyberpunk',   bg: '#0d0221', ring: '#ff0080' },
      { id: 'abyss',     name: 'Really Dark', bg: '#000814', ring: '#3b82f6' },
    ],
    Executivos: [
      { id: 'exec-light', name: 'Executivo Claro',  bg: '#EEF3F6', ring: '#334155' },
      { id: 'exec-dark',  name: 'Executivo Escuro', bg: '#102329', ring: '#64748b' },
    ],
  };
  var VALID = [];
  Object.keys(THEMES).forEach(function (k) { THEMES[k].forEach(function (t) { VALID.push(t.id); }); });

  function cur() {
    try { return localStorage.getItem(KEY) || document.documentElement.getAttribute('data-theme') || 'light'; }
    catch (e) { return document.documentElement.getAttribute('data-theme') || 'light'; }
  }
  function apply(id) {
    if (VALID.indexOf(id) < 0) id = 'light';
    var base = EXEC[id] || id;                       // exec-* usa a paleta do padrão
    var html = document.documentElement;
    html.setAttribute('data-theme', base);
    if (html.classList) html.classList.toggle('exec-mode', !!EXEC[id]);
    try { localStorage.setItem(KEY, id); } catch (e) {}   // guarda o id ESCOLHIDO (exec-*)
  }

  // aplica o tema salvo o quanto antes (caso o inline do <head> não tenha rodado)
  try { apply(localStorage.getItem(KEY) || 'light'); } catch (e) {}

  var pop = null;
  function close() {
    if (!pop) return;
    pop.remove(); pop = null;
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', esc);
  }
  function outside(e) { if (pop && !pop.contains(e.target) && !e.target.closest('#auth-theme-btn')) close(); }
  function esc(e) { if (e.key === 'Escape') close(); }

  function open(btn) {
    if (pop) { close(); return; }
    var c = cur();
    pop = document.createElement('div');
    pop.className = 'theme-popover';
    var html = '<div class="theme-popover-label" style="font-size:13px;font-weight:800;color:var(--text);letter-spacing:0;text-transform:none;margin-bottom:4px;">Tema</div>';
    Object.keys(THEMES).forEach(function (sec) {
      html += '<div class="theme-popover-label">' + sec + '</div><div class="theme-options">';
      THEMES[sec].forEach(function (t) {
        html += '<button type="button" class="theme-option' + (t.id === c ? ' active' : '') +
          '" data-theme-set="' + t.id + '"><span class="theme-swatch" style="background:' + t.bg +
          (t.ring ? ';box-shadow: inset 0 0 0 2px ' + t.ring : '') + '"></span><span>' + t.name + '</span></button>';
      });
      html += '</div>';
    });
    pop.innerHTML = html;
    document.body.appendChild(pop);
    // posiciona abaixo do botão, alinhado à direita
    var r = btn.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.top = (r.bottom + 8) + 'px';
    pop.style.right = Math.max(12, (window.innerWidth - r.right)) + 'px';
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('[data-theme-set]'); if (!b) return;
      apply(b.dataset.themeSet);
      pop.querySelectorAll('.theme-option').forEach(function (o) {
        o.classList.toggle('active', o.dataset.themeSet === b.dataset.themeSet);
      });
    });
    setTimeout(function () {
      document.addEventListener('click', outside, true);
      document.addEventListener('keydown', esc);
    }, 0);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('auth-theme-btn');
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); open(btn); });
  });
})();
