/* ═══ SyncroFlow — js/ui/column-manager.js
   Gerenciador de colunas reutilizável (board + Gerenciar Equipe).
   Opera sobre um array `cols` (mutado in-place) de uma equipe `teamId`.
   Chama onChange() após cada alteração para repintar quem usa. */
import { api } from '../core/api.js';
import { toast } from './toast.js';
import { escapeHTML } from '../core/dom.js';

/* Paleta de emojis curada para colunas (o sistema já entrega — sem buscar no Google). */
const COL_EMOJIS = ['📋','📝','🗂️','📥','📤','📦','⚙️','🛠️','🔧','🧪','🚧','🔬','✅','✔️','🏁','🎯','🚀','🔥','⏳','⏰','📅','🧊','❄️','💡','⭐','🌟','📌','📍','👀','✍️','🖊️','📊','📈','📉','💬','🗣️','🐛','❗','‼️','⚠️','🟢','🟡','🟠','🔴','🔵','🟣','⚫','⚪','🏗️','🧱','♻️','💰','🤝','🧠','🎉','🏆','💪','👍','🚩','🔒','🔓'];
let _emojiPop = null;
function closeEmojiPalette() { if (_emojiPop) { _emojiPop.remove(); _emojiPop = null; document.removeEventListener('mousedown', _emojiOutside, true); } }
function _emojiOutside(e) { if (_emojiPop && !_emojiPop.contains(e.target) && !e.target.classList?.contains('colmgr-icon')) closeEmojiPalette(); }
function openEmojiPalette(input) {
  closeEmojiPalette();
  const pop = document.createElement('div');
  pop.className = 'emoji-pop';
  pop.innerHTML = COL_EMOJIS.map(e => `<button type="button" class="emoji-pop-item" data-emoji="${e}">${e}</button>`).join('');
  document.body.appendChild(pop);
  const r = input.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.left = Math.min(r.left, window.innerWidth - 250) + 'px';
  pop.style.top = (r.bottom + 4) + 'px';
  pop.style.zIndex = 9999;
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-emoji]'); if (!b) return;
    input.value = b.dataset.emoji;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    closeEmojiPalette(); input.focus();
  });
  setTimeout(() => document.addEventListener('mousedown', _emojiOutside, true), 0);
}

export async function openColumnManager({ teamId, cols, onChange = () => {} }) {
  const { openModal } = await import('./modal.js');
  const { confirmDialog } = await import('./confirm.js');

  const sorted = () => cols.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  function bodyHTML() {
    const list = sorted();
    return `
      <p class="colmgr-intro">Reordene com ▲▼, edite ícone, nome e cor. Marque com <strong>✓</strong> qual coluna é a de <strong>Concluído</strong> (cards que chegam nela viram 100%). Colunas padrão têm 🔒 e não podem ser excluídas. Tudo salva automaticamente.</p>
      <div class="colmgr-list">
        <div class="colmgr-headrow">
          <span></span><span>Ícone</span><span>Nome da coluna</span><span>Cor</span><span>Concl.</span><span></span>
        </div>
        ${list.map((c, i) => {
          const isDone = !!Number(c.is_done);
          const isDef  = !!Number(c.is_default);
          return `
          <div class="colmgr-row" data-col="${escapeHTML(c.id)}">
            <div class="colmgr-ord">
              <button class="colmgr-mini" data-up="${escapeHTML(c.id)}" ${i===0?'disabled':''} title="Subir">▲</button>
              <button class="colmgr-mini" data-down="${escapeHTML(c.id)}" ${i===list.length-1?'disabled':''} title="Descer">▼</button>
            </div>
            <input class="colmgr-icon" data-icon="${escapeHTML(c.id)}" value="${escapeHTML(c.icon||'📋')}" maxlength="2" aria-label="Ícone">
            <input class="colmgr-name" data-name="${escapeHTML(c.id)}" value="${escapeHTML(c.name)}" maxlength="40" placeholder="Nome da coluna">
            <label class="colmgr-colorwrap" title="Cor da coluna">
              <span class="colmgr-colordot" style="background:${escapeHTML(/^#/.test(c.color||'')?c.color:'#6b7280')}"></span>
              <input type="color" class="colmgr-color" data-color="${escapeHTML(c.id)}" value="${escapeHTML(/^#/.test(c.color||'')?c.color:'#6b7280')}">
            </label>
            <button class="colmgr-done ${isDone?'is-on':''}" data-done="${escapeHTML(c.id)}" ${isDone?'disabled':''} title="${isDone?'Esta é a coluna de Concluído':'Marcar como coluna de Concluído'}">✓</button>
            ${isDef
              ? `<span class="colmgr-lock" title="Coluna padrão — não pode ser excluída">🔒</span>`
              : `<button class="colmgr-del" data-del="${escapeHTML(c.id)}" title="Remover coluna">✕</button>`}
          </div>`; }).join('') || '<div class="mp-empty">Nenhuma coluna ainda. Adicione a primeira abaixo.</div>'}
      </div>
      <div class="colmgr-add">
        <input class="colmgr-icon" id="colmgr-new-icon" value="📋" maxlength="2" aria-label="Ícone da nova coluna">
        <input class="colmgr-name" id="colmgr-new-name" placeholder="Nome da nova coluna…" maxlength="40">
        <button class="btn btn-primary btn-sm" id="colmgr-add-btn">+ Adicionar</button>
      </div>`;
  }

  openModal({
    wide: true,
    title: `<span class="modal-title-kicker">Quadro</span><span style="color:var(--text);">Gerenciar colunas</span>`,
    body: bodyHTML(),
    footer: `<button class="btn btn-ghost" id="colmgr-reset" title="Restaura as 3 colunas padrão (A Fazer · Em Andamento · Concluído)">↺ Voltar ao padrão</button>
             <button class="btn btn-secondary" data-close>Fechar</button>`,
  });

  const refresh = () => { const b = document.querySelector('.modal-body'); if (b) b.innerHTML = bodyHTML(); wire(); onChange(); };

  const resetBtn = document.getElementById('colmgr-reset');
  if (resetBtn) resetBtn.onclick = async () => {
    const ok = await confirmDialog({
      title: 'Voltar ao padrão',
      message: 'Isto restaura as 3 colunas padrão (A Fazer · Em Andamento · Concluído). As colunas extras serão removidas e seus cards movidos para "A Fazer". Continuar?',
      confirmText: 'Restaurar padrão', danger: true,
    });
    if (!ok) return;
    try {
      const r = await api.call('columns.php', 'reset', { teamId });
      cols.length = 0;
      (r?.columns || []).forEach(c => cols.push(c));
      refresh();
      toast('Colunas restauradas ao padrão.', 'success');
    } catch (e) { toast(e.message || 'Não foi possível restaurar.', 'error'); }
  };

  function setLocal(id, patch) { const c = cols.find(x => x.id === id); if (c) Object.assign(c, patch); }

  async function save(id, patch) {
    setLocal(id, patch); onChange();
    try { await api.call('columns.php', 'update', { id, ...patch }); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function move(id, dir) {
    const list = sorted();
    const i = list.findIndex(c => c.id === id), j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((c, k) => setLocal(c.id, { position: k }));
    refresh();
    try { await api.call('columns.php', 'reorder', { order: list.map(c => c.id) }); }
    catch (e) { toast(e.message, 'error'); }
  }

  function wire() {
    document.querySelectorAll('[data-name]').forEach(inp => inp.onchange = () => save(inp.dataset.name, { name: inp.value.trim() || 'Coluna' }));
    document.querySelectorAll('[data-icon]:not(#colmgr-new-icon)').forEach(inp => inp.onchange = () => save(inp.dataset.icon, { icon: inp.value.trim() || '📋' }));
    // Seletor de emojis: clicar em qualquer campo de ícone abre a paleta curada
    document.querySelectorAll('.colmgr-icon').forEach(inp => {
      inp.readOnly = true; inp.style.cursor = 'pointer'; inp.title = 'Clique para escolher um emoji';
      inp.onclick = () => openEmojiPalette(inp);
    });
    document.querySelectorAll('[data-color]').forEach(inp => {
      inp.oninput = () => { const dot = inp.parentElement.querySelector('.colmgr-colordot'); if (dot) dot.style.background = inp.value; };
      inp.onchange = () => save(inp.dataset.color, { color: inp.value });
    });
    document.querySelectorAll('[data-up]').forEach(b => b.onclick = () => move(b.dataset.up, -1));
    document.querySelectorAll('[data-down]').forEach(b => b.onclick = () => move(b.dataset.down, 1));
    document.querySelectorAll('[data-done]').forEach(b => b.onclick = async () => {
      if (b.disabled) return;
      try {
        const r = await api.call('columns.php', 'set_done', { id: b.dataset.done });
        if (r?.columns) { cols.length = 0; r.columns.forEach(c => cols.push(c)); }
        refresh();
        toast('Coluna de "Concluído" definida.', 'success');
      } catch (e) { toast(e.message || 'Não foi possível definir.', 'error'); }
    });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const ok = await confirmDialog({ title:'Remover coluna', message:'Remover esta coluna do quadro? (não é possível se houver cards nela)', confirmText:'Remover', danger:true });
      if (!ok) return;
      try {
        await api.call('columns.php', 'delete', { id: b.dataset.del });
        const i = cols.findIndex(c => c.id === b.dataset.del); if (i >= 0) cols.splice(i, 1);
        refresh();
      } catch (e) { toast(e.message || 'Não foi possível remover (há cards nesta coluna).', 'error'); }
    });
    const addBtn = document.getElementById('colmgr-add-btn');
    if (addBtn) addBtn.onclick = async () => {
      const name = document.getElementById('colmgr-new-name').value.trim();
      if (!name) { toast('Informe o nome da coluna.', 'warn'); return; }
      const icon = document.getElementById('colmgr-new-icon').value.trim() || '📋';
      try {
        const r = await api.call('columns.php', 'create', { teamId, name, icon });
        cols.push(r?.column || { id:'tmp-'+Date.now(), team_id:teamId, name, icon, color:'#6b7280', position: cols.length });
        refresh();
      } catch (e) { toast(e.message, 'error'); }
    };
  }
  wire();
}
