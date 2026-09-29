/* ═══ SyncroFlow — js/core/dom.js ═══ */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function on(el, ev, sel, fn) {
  // Delegação: on(root, 'click', '.btn', fn)
  if (typeof sel === 'function') { el.addEventListener(ev, sel); return; }
  el.addEventListener(ev, (e) => {
    const t = e.target.closest(sel);
    if (t && el.contains(t)) fn.call(t, e, t);
  });
}

export function escapeHTML(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
