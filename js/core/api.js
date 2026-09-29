/* ═══ SyncroFlow — js/core/api.js ═══ */
const BASE = window.__CONFIG__?.apiBase || '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}/${path}`, {
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    ...opts,
  });
  if (res.status === 304) return null;
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  get:  (file, params) => {
    const qs = params ? '&' + new URLSearchParams(params).toString() : '';
    return request(`${file}${qs}`);
  },
  call: (file, action, body, method = 'POST') => {
    if (method === 'GET') {
      // Em GET, parâmetros vão na query string (não no body)
      const qs = new URLSearchParams({ action, ...(body || {}) }).toString();
      return request(`${file}?${qs}`, { method: 'GET' });
    }
    return request(
      `${file}?action=${encodeURIComponent(action)}`,
      { method, body: JSON.stringify(body || {}) }
    );
  },
  upload: (file, fd) => request(file, { method: 'POST', body: fd }),
};
