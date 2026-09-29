/* ═══ SyncroFlow — js/core/holidays.js
   Feriados brasileiros: os NACIONAIS fixos e os MÓVEIS (Carnaval, Páscoa,
   Corpus Christi…) são CALCULADOS aqui (Gauss). Os MUNICIPAIS, FACULTATIVOS
   e COMPENSAÇÕES vêm do banco (editáveis em admin.php), carregados via API.

   Filtro por cidade:
     getHolidays(year, '')        → TODAS as cidades (cada um rotulado)
     getHolidays(year, 'São Paulo')  → só São Paulo + os que valem para todas ('') */
import { api } from './api.js';

const PREF_KEY = 'syncroflow_holidays_city';

/** Obtém a cidade salva no localStorage para o filtro de feriados. */
export function getSavedCity() {
  try { return localStorage.getItem(PREF_KEY) || 'all'; } catch (e) { return 'all'; }
}

/** Salva a cidade preferida para o filtro de feriados. */
export function saveCity(city) {
  try { localStorage.setItem(PREF_KEY, city || 'all'); } catch (e) {}
}

function getEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/* ── Camada editável (banco) — carregada da API e cacheada ── */
let _extra = null;        // null = ainda não carregado
let _cities = [];
let _loadPromise = null;

/** Carrega (1x) os feriados editáveis do banco. Idempotente; nunca lança. */
export async function loadHolidays(force) {
  if (_loadPromise && !force) return _loadPromise;
  _loadPromise = api.call('holidays.php', 'list', {}, 'GET')
    .then(dt => {
      _extra = (dt.holidays || []).map(h => ({
        name: h.name,
        kind: h.kind || 'feriado',
        scope: h.scope || '',
        city: h.city || '',
        recurring: Number(h.recurring) === 1,
        month: h.month != null ? Number(h.month) : null,
        day: h.day != null ? Number(h.day) : null,
        date: h.date || '',
      }));
      _cities = dt.cities || [];
      return _extra;
    })
    .catch(() => { if (!_extra) _extra = []; return _extra; });
  return _loadPromise;
}

/** Cidades com feriado cadastrado (para o filtro). */
export function getCities() { return _cities.slice(); }

function _norm(s) { return (s || '').trim().toLowerCase(); }
function _parseISO(s) { return new Date(s + 'T00:00:00'); }

function _cityMatches(city, filter) {
  if (filter == null || filter === '' || filter === 'all') return true;  // todas
  if (!city) return true;                                                // vale p/ todas
  return _norm(city) === _norm(filter);
}

/** Feriados de um ano (nacionais calculados + extras do banco), filtrados por cidade. */
export function getHolidays(year, filter = getSavedCity()) {
  const easter = getEaster(year);
  const DAY = 86400000;
  const national = [
    { date: new Date(year, 0, 1),                  name: 'Ano Novo',                 kind: 'feriado', city: '', scope: 'nacional' },
    { date: new Date(easter.getTime() - 47 * DAY), name: 'Carnaval',                 kind: 'feriado', city: '', scope: 'nacional' },
    { date: new Date(easter.getTime() - 2 * DAY),  name: 'Sexta-feira Santa',        kind: 'feriado', city: '', scope: 'nacional' },
    { date: easter,                                name: 'Páscoa',                   kind: 'feriado', city: '', scope: 'nacional' },
    { date: new Date(year, 3, 21),                 name: 'Tiradentes',               kind: 'feriado', city: '', scope: 'nacional' },
    { date: new Date(year, 4, 1),                  name: 'Dia do Trabalhador',       kind: 'feriado', city: '', scope: 'nacional' },
    { date: new Date(easter.getTime() + 60 * DAY), name: 'Corpus Christi',           kind: 'feriado', city: '', scope: 'nacional' },
    { date: new Date(year, 8, 7),                  name: 'Independência',            kind: 'feriado', city: '', scope: 'nacional' },
    { date: new Date(year, 9, 12),                 name: 'N. Sra. Aparecida',        kind: 'feriado', city: '', scope: 'nacional' },
    { date: new Date(year, 10, 2),                 name: 'Finados',                  kind: 'feriado', city: '', scope: 'nacional' },
    { date: new Date(year, 10, 15),                name: 'Proclamação da República', kind: 'feriado', city: '', scope: 'nacional' },
    { date: new Date(year, 11, 25),                name: 'Natal',                    kind: 'feriado', city: '', scope: 'nacional' },
  ];

  const extras = (_extra || [])
    .filter(e => _cityMatches(e.city, filter))
    .map(e => {
      const date = e.recurring
        ? new Date(year, (e.month || 1) - 1, e.day || 1)
        : (e.date ? _parseISO(e.date) : null);
      return date ? { date, name: e.name, kind: e.kind, city: e.city, scope: e.scope } : null;
    })
    .filter(Boolean)
    .filter(e => e.date.getFullYear() === year);

  const seen = new Set();
  return national.concat(extras).filter(h => {
    const k = h.date.toDateString() + '|' + _norm(h.name) + '|' + _norm(h.city);
    if (seen.has(k)) return false; seen.add(k); return true;
  }).sort((a, b) => a.date - b.date);
}

/** Todos os feriados de um dia específico (já filtrados por cidade). */
export function getHolidaysOn(date, filter) {
  return getHolidays(date.getFullYear(), filter)
    .filter(h => h.date.toDateString() === date.toDateString());
}
export function isHoliday(date, filter) { return getHolidaysOn(date, filter).length > 0; }
export function getHolidayName(date, filter) {
  const a = getHolidaysOn(date, filter);
  return a.length ? a[0].name : null;
}

/* ── COPAS DO MUNDO (2026 + edições futuras já salvas) ──
   2026: EUA/Canadá/México (11/jun → 19/jul). Jogos do Brasil dependem do sorteio.
   2030: Marrocos/Portugal/Espanha (centenário; abertura na América do Sul). Datas a confirmar.
   2034: Arábia Saudita. Datas a confirmar pela FIFA.

   Campos por evento: { date:'YYYY-MM-DD', name, time, brazil, result }
   • result (opcional): placar final, ex.: '3 × 0'. Se preenchido, o calendário
     mostra o placar no lugar do horário. Preencha à mão após o jogo — a busca
     automática de placar exige uma API externa de esportes com internet de
     saída, que muitos servidores bloqueiam. */
export const COPA_EVENTS = [
  // 2026
  { date: '2026-06-11', name: 'Abertura da Copa 2026', time: '', brazil: false },
  { date: '2026-07-19', name: 'Final da Copa 2026',    time: '', brazil: false },
  { date: '2026-06-13', name: 'Brasil x Marrocos (1ª rodada)', time: '19:00', brazil: true },
  { date: '2026-06-19', name: 'Brasil x Haiti (2ª rodada)',    time: '21:30', brazil: true },
  { date: '2026-06-24', name: 'Escócia x Brasil (3ª rodada)',  time: '19:00', brazil: true },
  // 2030 (previsão — confirmar quando a FIFA divulgar)
  { date: '2030-06-13', name: 'Abertura da Copa 2030 (previsão)', time: '', brazil: false },
  { date: '2030-07-21', name: 'Final da Copa 2030 (previsão)',    time: '', brazil: false },
  // 2034 (previsão — confirmar quando a FIFA divulgar)
  { date: '2034-06-10', name: 'Abertura da Copa 2034 (previsão)', time: '', brazil: false },
  { date: '2034-07-18', name: 'Final da Copa 2034 (previsão)',    time: '', brazil: false },
];
// compat
export const COPA_2026 = COPA_EVENTS;

/* ── Camada editável (banco): jogos da Copa geridos no admin (admin.php) ──
   _copa = null → ainda não carregado; usa COPA_EVENTS como fallback.
   Depois de carregado, respeita o "Modo Copa" (_copaEnabled). */
let _copa = null, _copaEnabled = false, _copaPromise = null;

/** Carrega (1x) os jogos da Copa do banco. Idempotente; nunca lança. */
export async function loadCopa(force) {
  if (_copaPromise && !force) return _copaPromise;
  _copaPromise = api.call('worldcup.php', 'list', {}, 'GET')
    .then(dt => {
      _copaEnabled = !!dt.enabled;
      _copa = (dt.matches || []).map(m => ({
        date: m.match_date, name: m.name, time: m.match_time || '',
        brazil: Number(m.brazil) === 1, result: m.result || '', stage: m.stage || '',
      }));
      return _copa;
    })
    .catch(() => { if (!_copa) _copa = null; return _copa; });
  return _copaPromise;
}
/** "Modo Copa" ligado? (false enquanto não carregou). */
export function isCopaEnabled() { return _copa !== null ? _copaEnabled : false; }
/** Jogos carregados (vazio se desligado/sem dados). */
export function getCopaMatches() { return (_copa !== null && _copaEnabled) ? _copa.slice() : []; }

export function getCopaEvent(date) {
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (_copa !== null) {                 // dados do banco já carregados
    if (!_copaEnabled) return null;     // Modo Copa desligado → nada no calendário
    return _copa.find(e => e.date === iso) || null;
  }
  return COPA_EVENTS.find(e => e.date === iso) || null;   // fallback (API indisponível)
}
export function isCopaDay(date) { return !!getCopaEvent(date); }
export function isCopaSeason(date = new Date()) {
  const t = date.getTime();
  return t >= _parseISO('2026-06-11').getTime() && t <= new Date('2026-07-19T23:59:59').getTime();
}
