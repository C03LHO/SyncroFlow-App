/* ═══ SyncroFlow — js/ui/datepicker.js
   Date picker temático: feriados nacionais (não-selecionáveis),
   navegação rápida (ano + seletor de mês), segue o tema do sistema.
   Opera sobre <input type="text" readonly> guardando o ISO em
   dataset.iso e exibindo dd/mm/aaaa em .value. */

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

function isoToBR(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const pad = (n) => String(n).padStart(2, '0');

/* ── Feriados nacionais (BR), incluindo móveis baseados na Páscoa ── */
function easterDate(y) {
  const a=y%19, b=Math.floor(y/100), c=y%100, d=Math.floor(b/4), e=b%4,
        f=Math.floor((b+8)/25), g=Math.floor((b-f+1)/3),
        h=(19*a+b-d-g+15)%30, i=Math.floor(c/4), k=c%4,
        l=(32+2*e+2*i-h-k)%7, m=Math.floor((a+11*h+22*l)/451),
        mo=Math.floor((h+l-7*m+114)/31), da=((h+l-7*m+114)%31)+1;
  return new Date(y, mo-1, da);
}
const _holidayCache = {};
function holidaysFor(y) {
  if (_holidayCache[y]) return _holidayCache[y];
  const map = {};
  const add = (mo, da, name) => { map[`${y}-${pad(mo)}-${pad(da)}`] = name; };
  add(1,1,'Confraternização Universal');
  add(4,21,'Tiradentes');
  add(5,1,'Dia do Trabalho');
  add(9,7,'Independência do Brasil');
  add(10,12,'N. Sra. Aparecida');
  add(11,2,'Finados');
  add(11,15,'Proclamação da República');
  add(12,25,'Natal');
  const easter = easterDate(y);
  const off = (days, name) => { const d = new Date(easter); d.setDate(d.getDate()+days); map[`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`] = name; };
  off(-48,'Carnaval');
  off(-47,'Carnaval');
  off(-2,'Sexta-feira Santa');
  off(60,'Corpus Christi');
  _holidayCache[y] = map;
  return map;
}

/** Define o valor (ISO YYYY-MM-DD) de um input gerenciado pelo picker. */
export function setDatePickerValue(input, iso) {
  input.dataset.iso = iso || '';
  input.value = isoToBR(iso);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Liga o picker a um input. */
export function attachDatePicker(input) {
  if (!input || input._dpAttached) return;
  input._dpAttached = true;
  input.readOnly = true;
  input.autocomplete = 'off';
  input.value = isoToBR(input.dataset.iso || '');
  input.classList.add('cm-date-input');
  input.addEventListener('click', (e) => { e.preventDefault(); open(input); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(input); }
    if (e.key === 'Backspace' || e.key === 'Delete') setDatePickerValue(input, '');
  });
}

let _pop = null;
function close() {
  if (_pop) { _pop.remove(); _pop = null; document.removeEventListener('click', onDocClick, true); document.removeEventListener('keydown', onKey, true); }
}
function onDocClick(e) { if (_pop && !_pop.contains(e.target) && e.target !== _pop._input) close(); }
function onKey(e) { if (e.key === 'Escape') close(); }

function open(input) {
  close();
  const cur = /^\d{4}-\d{2}-\d{2}/.test(input.dataset.iso || '') ? input.dataset.iso.slice(0,10) : todayISO();
  let [vy, vm] = cur.split('-').map(Number); vm -= 1;
  let mode = 'days'; // 'days' | 'months'

  const pop = document.createElement('div');
  pop.className = 'dp-pop';
  pop._input = input;
  _pop = pop;

  function renderDays() {
    const first = new Date(vy, vm, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(vy, vm + 1, 0).getDate();
    const tISO = todayISO();
    const hol = holidaysFor(vy);
    let cells = '';
    for (let i = 0; i < startDow; i++) cells += `<span class="dp-day dp-empty"></span>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${vy}-${pad(vm+1)}-${pad(d)}`;
      const holName = hol[iso];
      const dow = new Date(vy, vm, d).getDay();
      const cls = [
        'dp-day',
        iso === tISO ? 'dp-today' : '',
        iso === (input.dataset.iso||'').slice(0,10) ? 'dp-sel' : '',
        holName ? 'dp-holiday' : '',
        (dow===0||dow===6) ? 'dp-weekend' : '',
      ].filter(Boolean).join(' ');
      if (holName) cells += `<span class="${cls}" title="Feriado: ${holName}">${d}</span>`;
      else cells += `<button type="button" class="${cls}" data-iso="${iso}">${d}</button>`;
    }
    pop.innerHTML = `
      <div class="dp-head">
        <button type="button" class="dp-nav" data-nav="y-1" title="Ano anterior">«</button>
        <button type="button" class="dp-nav" data-nav="m-1" title="Mês anterior">‹</button>
        <button type="button" class="dp-title" data-act="months" title="Escolher mês/ano">${MESES[vm]} ${vy}</button>
        <button type="button" class="dp-nav" data-nav="m1" title="Próximo mês">›</button>
        <button type="button" class="dp-nav" data-nav="y1" title="Próximo ano">»</button>
      </div>
      <div class="dp-wd">${WD.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="dp-grid">${cells}</div>
      <div class="dp-foot">
        <button type="button" class="dp-foot-btn" data-act="clear">Limpar</button>
        <button type="button" class="dp-foot-btn dp-today-btn" data-act="today">Hoje</button>
      </div>`;
    wireDays();
  }
  function renderMonths() {
    pop.innerHTML = `
      <div class="dp-head">
        <button type="button" class="dp-nav" data-nav="y-1" title="Ano anterior">‹</button>
        <button type="button" class="dp-title" data-act="days">${vy}</button>
        <button type="button" class="dp-nav" data-nav="y1" title="Próximo ano">›</button>
      </div>
      <div class="dp-months">
        ${MESES_ABBR.map((m,i) => `<button type="button" class="dp-month ${i===vm?'sel':''}" data-month="${i}">${m}</button>`).join('')}
      </div>`;
    wireMonths();
  }
  function shift(nav) {
    if (nav === 'm-1') { vm--; if (vm<0){vm=11;vy--;} }
    else if (nav === 'm1') { vm++; if (vm>11){vm=0;vy++;} }
    else if (nav === 'y-1') vy--;
    else if (nav === 'y1') vy++;
  }
  function wireDays() {
    pop.querySelectorAll('[data-nav]').forEach(b => b.onclick = (e) => { e.stopPropagation(); shift(b.dataset.nav); renderDays(); });
    pop.querySelector('[data-act="months"]').onclick = (e) => { e.stopPropagation(); mode='months'; renderMonths(); };
    pop.querySelectorAll('.dp-day[data-iso]').forEach(b => b.onclick = (e) => { e.stopPropagation(); setDatePickerValue(input, b.dataset.iso); close(); });
    pop.querySelector('[data-act="clear"]').onclick = (e) => { e.stopPropagation(); setDatePickerValue(input, ''); close(); };
    pop.querySelector('[data-act="today"]').onclick = (e) => { e.stopPropagation(); setDatePickerValue(input, todayISO()); close(); };
  }
  function wireMonths() {
    pop.querySelectorAll('[data-nav]').forEach(b => b.onclick = (e) => { e.stopPropagation(); shift(b.dataset.nav); renderMonths(); });
    pop.querySelector('[data-act="days"]').onclick = (e) => { e.stopPropagation(); mode='days'; renderDays(); };
    pop.querySelectorAll('[data-month]').forEach(b => b.onclick = (e) => { e.stopPropagation(); vm = +b.dataset.month; mode='days'; renderDays(); position(pop, input); });
  }

  document.body.appendChild(pop);
  renderDays();
  position(pop, input);
  setTimeout(() => { document.addEventListener('click', onDocClick, true); document.addEventListener('keydown', onKey, true); }, 0);
}

function position(pop, input) {
  const r = input.getBoundingClientRect();
  const pw = pop.offsetWidth || 264, ph = pop.offsetHeight || 290;
  let top = r.bottom + 6, left = r.left;
  if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  if (left + pw > innerWidth - 8) left = Math.max(8, innerWidth - pw - 8);
  pop.style.top = Math.round(top) + 'px';
  pop.style.left = Math.round(left) + 'px';
}
