/* ═══ SyncroFlow — js/core/events.js — event bus mínimo ═══ */
const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name).add(fn);
  return () => off(name, fn);
}
export function off(name, fn) {
  handlers.get(name)?.delete(fn);
}
export function emit(name, payload) {
  const set = handlers.get(name);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); } catch (e) { console.error(`[${name}]`, e); }
  }
}
