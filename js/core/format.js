/* ═══ SyncroFlow — js/core/format.js
   Formatadores centralizados (corrige o bug "12T14:37:28.496Z/05/2026"
   herdado do legado). Sempre testar com:
     fmtDate("2026-05-12T14:37:28.496Z") → "12/05/2026"
     fmtSmart(iso, true) → "Hoje às 14:37" / "Ontem às ..." / "12/05/2026 às 14:37"
   ═════════════════════════════════════════════════════════════ */

export function fmtDate(input) {
  if (!input) return '';
  const s = String(input);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

export function fmtDateTime(input) {
  if (!input) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(input))) return fmtDate(input);
  const dt = new Date(input);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' }) +
    ' às ' + dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

export function fmtSmart(input, withTime = false) {
  if (!input) return '';
  const dt = new Date(input);
  if (isNaN(dt.getTime())) return '';
  const now = new Date();
  const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.floor((startOfDay(now) - startOfDay(dt)) / 86400000);
  const time = dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
  let base;
  if (diff === 0) base = 'Hoje';
  else if (diff === 1) base = 'Ontem';
  else if (diff > 1 && diff < 7) base = `há ${diff} dias`;
  else base = dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  return withTime ? `${base} às ${time}` : base;
}

export function fmtMoney(v) {
  const n = Number(v) || 0;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
export function fmtNumber(v) {
  return Number(v || 0).toLocaleString('pt-BR');
}

/* Rótulos amigáveis (capitalizados, com acento) */
const _PRIO = { baixa:'Baixa', media:'Média', alta:'Alta', urgente:'Urgente' };
const _STATUS = { 'no-prazo':'No prazo', 'em-risco':'Em risco', 'atrasado':'Atrasado' };
export function prioLabel(p)   { return _PRIO[p] || (p ? p.charAt(0).toUpperCase()+p.slice(1) : ''); }
export function statusLabel(s) { return _STATUS[s] || (s ? s.charAt(0).toUpperCase()+s.slice(1) : ''); }
