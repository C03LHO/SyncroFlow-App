/* ═══ SyncroFlow — js/ui/sprint-manager.js (#6)
   Sprints da equipe: criar, editar prazo/meta, fechar/excluir e
   ESCOLHER quais cards entram no sprint. Gestor/TI da equipe.
   ═══════════════════════════════════════════════════════════ */
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { toast } from './toast.js';
import { escapeHTML } from '../core/dom.js';
import { attachDatePicker, setDatePickerValue } from './datepicker.js';

function daysLabel(end) {
  if (!end) return '';
  const d = Math.ceil((new Date(end + 'T23:59:59') - new Date()) / 86400000);
  if (d > 1)  return `faltam ${d} dias`;
  if (d === 1) return 'falta 1 dia';
  if (d === 0) return 'vence hoje';
  return `venceu há ${-d} dia(s)`;
}
function fmtBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export async function openSprintManager({ teamId, onChange = () => {} }) {
  const { openModal, closeModal } = await import('./modal.js');
  const { confirmDialog } = await import('./confirm.js');

  let sprints = [];
  let screen = { mode: 'list', sprintId: null };
  let editingId = null;   // sprint em edição (reaproveita o formulário de baixo)

  async function load() {
    try { sprints = (await api.call('sprints.php', 'list', { team: teamId }, 'GET')).sprints || []; }
    catch (e) { toast(e.message, 'error'); sprints = []; }
  }

  function listHTML() {
    const editing = editingId ? sprints.find(s => s.id === editingId) : null;
    return `
      <p class="colmgr-intro">Um sprint agrupa entregas com um prazo. Defina o prazo (ex.: 29/08) e escolha quais cards entram. Cards na coluna de Concluído contam como feitos.</p>${editing ? '<p class="colmgr-intro" style="color:var(--primary);font-weight:600;">✏️ Editando “' + escapeHTML(editing.name) + '”. Ajuste abaixo e salve.</p>' : ''}
      <div class="spr-list">
        ${sprints.map(s => {
          const overdue = s.end_date && new Date(s.end_date + 'T23:59:59') < new Date() && s.progress < 100;
          return `
          <div class="spr-card">
            <div class="spr-card-head">
              <span class="spr-name">🏃 ${escapeHTML(s.name)}</span>
              ${s.end_date ? `<span class="spr-due ${overdue?'over':''}">${escapeHTML(fmtBR(s.end_date))} · ${escapeHTML(daysLabel(s.end_date))}</span>` : '<span class="spr-due">sem prazo</span>'}
            </div>
            <div class="spr-bar"><div class="spr-bar-fill" style="width:${s.progress}%;"></div></div>
            <div class="spr-meta">
              <span>${s.concluded}/${s.item_count ?? s.card_count} feitos${s.subtask_count ? ` (${s.card_count} cards + ${s.subtask_count} subtarefas)` : ''} · ${s.progress}%${s.goal ? ` · meta ${s.goal}` : ''}</span>
              <span class="spr-acts">
                <button class="btn btn-sm btn-secondary" data-pick="${escapeHTML(s.id)}">📋 Escolher cards</button>
                <button class="btn btn-sm btn-ghost" data-edit="${escapeHTML(s.id)}" title="Editar nome, prazo e meta">✏️</button>
                <button class="btn btn-sm btn-ghost" data-del="${escapeHTML(s.id)}" title="Excluir sprint" style="color:var(--danger);">✕</button>
              </span>
            </div>
          </div>`;
        }).join('') || '<div class="mp-empty">Nenhum sprint ainda. Crie o primeiro abaixo.</div>'}
      </div>
      <div class="spr-add">
        <input class="input" id="spr-new-name" placeholder="Nome (ex.: Sprint Agosto)" maxlength="60" value="${editing ? escapeHTML(editing.name) : ''}">
        <input class="input" type="text" id="spr-new-end" placeholder="dd/mm/aaaa" autocomplete="off" title="Prazo de entrega">
        <input class="input" type="number" id="spr-new-goal" placeholder="Meta" min="0" style="width:90px;" title="Meta de cards (opcional)" value="${editing && editing.goal ? editing.goal : ''}">
        <button class="btn btn-primary btn-sm" id="spr-add-btn">${editing ? '💾 Salvar' : '+ Criar sprint'}</button>
        ${editing ? '<button class="btn btn-ghost btn-sm" id="spr-cancel-edit">Cancelar</button>' : ''}
      </div>`;
  }

  function pickHTML() {
    const s = sprints.find(x => x.id === screen.sprintId);
    if (!s) return listHTML();
    const cards = (state.cards || []).filter(c => !c.archived);
    const colName = (id) => (state.columns.find(x => x.id === id)?.name) || '';
    return `
      <button class="btn btn-sm btn-ghost" id="spr-back">← Voltar aos sprints</button>
      <p class="colmgr-intro" style="margin-top:10px;">Marque os cards que entram no <strong>${escapeHTML(s.name)}</strong>.</p>
      <div class="spr-pick-list">
        ${cards.map(c => `
          <label class="spr-pick-row">
            <input type="checkbox" data-cardpick="${escapeHTML(c.id)}" ${c.sprintId === s.id ? 'checked' : ''}>
            <span class="spr-pick-title">${escapeHTML(c.title || 'Sem título')}</span>
            <span class="spr-pick-col">${escapeHTML(colName(c.columnId))}</span>
          </label>`).join('') || '<div class="mp-empty">Esta equipe ainda não tem cards.</div>'}
      </div>
      <div class="spr-pick-foot">
        <button class="btn btn-secondary" id="spr-pick-cancel">Cancelar</button>
        <button class="btn btn-primary" id="spr-pick-save">Salvar seleção</button>
      </div>`;
  }

  function body() { return screen.mode === 'pick' ? pickHTML() : listHTML(); }

  await load();
  openModal({
    wide: true,
    title: `<span class="modal-title-kicker">Quadro</span><span style="color:var(--text);">Sprints</span>`,
    body: body(),
    footer: `<button class="btn btn-secondary" data-close>Fechar</button>`,
    onClose: () => onChange(),
  });

  const refresh = () => { const b = document.querySelector('.modal-body'); if (b) { b.innerHTML = body(); wire(); } };

  function wire() {
    if (screen.mode === 'pick') {
      document.getElementById('spr-back').onclick   = () => { screen = { mode: 'list' }; refresh(); };
      document.getElementById('spr-pick-cancel').onclick = () => { screen = { mode: 'list' }; refresh(); };
      document.getElementById('spr-pick-save').onclick = async () => {
        const ids = [...document.querySelectorAll('[data-cardpick]:checked')].map(i => i.dataset.cardpick);
        try {
          const sid = screen.sprintId;
          await api.call('sprints.php', 'set_cards', { id: sid, card_ids: ids });
          // Atualiza o estado local na hora (sem esperar o polling): marca os
          // selecionados e limpa os que saíram deste sprint.
          (state.cards || []).forEach(c => {
            if (ids.includes(c.id)) c.sprintId = sid;
            else if (c.sprintId === sid) c.sprintId = null;
          });
          toast('Cards do sprint atualizados.', 'success');
          await load(); screen = { mode: 'list' }; refresh(); onChange();
        } catch (e) { toast(e.message, 'error'); }
      };
      return;
    }
    const endInput = document.getElementById('spr-new-end');
    if (endInput) {
      attachDatePicker(endInput);   // calendário temático (segue o CSS), re-anexado a cada refresh
      if (editingId) { const ed = sprints.find(s => s.id === editingId); if (ed && ed.end_date) setDatePickerValue(endInput, ed.end_date); }
    }
    const addBtn = document.getElementById('spr-add-btn');
    if (addBtn) addBtn.onclick = async () => {
      const name = document.getElementById('spr-new-name').value.trim();
      if (!name) { toast('Informe o nome do sprint.', 'warn'); return; }
      const end_date = document.getElementById('spr-new-end').dataset.iso || '';
      const goal = parseInt(document.getElementById('spr-new-goal').value, 10) || 0;
      try {
        if (editingId) {
          await api.call('sprints.php', 'update', { id: editingId, name, end_date, goal });
          editingId = null;
          await load(); refresh(); onChange();
          toast('Sprint atualizado.', 'success');
        } else {
          await api.call('sprints.php', 'create', { team_id: teamId, name, end_date, goal });
          await load(); refresh(); onChange();
          toast('Sprint criado.', 'success');
        }
      } catch (e) { toast(e.message, 'error'); }
    };
    document.getElementById('spr-cancel-edit')?.addEventListener('click', () => { editingId = null; refresh(); });
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { editingId = b.dataset.edit; refresh(); document.getElementById('spr-new-name')?.focus(); });
    document.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { editingId = null; screen = { mode: 'pick', sprintId: b.dataset.pick }; refresh(); });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const ok = await confirmDialog({ title: 'Excluir sprint', message: 'Excluir este sprint? Os cards continuam, apenas perdem a marcação de sprint.', confirmText: 'Excluir', danger: true });
      if (!ok) return;
      try {
        await api.call('sprints.php', 'delete', { id: b.dataset.del });
        await load(); refresh(); onChange();
      } catch (e) { toast(e.message, 'error'); }
    });
  }
  wire();
}
