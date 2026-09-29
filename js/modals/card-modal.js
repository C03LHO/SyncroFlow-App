/* ═══ SyncroFlow — js/modals/card-modal.js (v12)
   Layout grid 2 colunas (esquerda: título/sugestões/descrição/ganhos/
   subtarefas/comentários · direita: status/responsável/datas/colapsáveis).
   ═══════════════════════════════════════════════════════════ */
import { openModal, closeModal } from '../ui/modal.js';
import { confirmDialog } from '../ui/confirm.js';
import { attachDatePicker, setDatePickerValue } from '../ui/datepicker.js';
import { toast } from '../ui/toast.js';
import { state, cardById } from '../core/state.js';
import { api } from '../core/api.js';
import { escapeHTML, $ } from '../core/dom.js';
import { fmtDate, fmtSmart, fmtDateTime } from '../core/format.js';
import { can } from '../core/rbac.js';
import { makeDropdown } from '../ui/dropdown.js';
import {
  CHECKLIST_TEMPLATES, COLOR_PALETTE, paletteHex,
  generateDescription, generateSmartTags, buildPlanningSuggestions,
} from '../core/cardhelpers.js';

/* ── Config de campos do card (admin → state.system.card_fields) ── */
const CARD_FIELD_LABELS = {
  description:'Descrição', assignee:'Responsável', priority:'Prioridade',
  startDate:'Data de início', dueDate:'Prazo', tags:'Tags', label:'Etiqueta',
  gains:'Ganhos', subtasks:'Subtarefas', links:'Links', dependencies:'Dependências',
};
function cardFieldMode(key) {
  const cfg = state.system?.card_fields || {};
  return cfg[key] || 'optional'; // required | optional | hidden
}
/** Aplica visibilidade + estrelas de obrigatório após render. */
function applyCardFieldConfig() {
  Object.keys(CARD_FIELD_LABELS).forEach(key => {
    const mode = cardFieldMode(key);
    document.querySelectorAll(`[data-cf="${key}"]`).forEach(el => {
      el.style.display = mode === 'hidden' ? 'none' : '';
    });
    const star = document.querySelector(`[data-cf-star="${key}"]`);
    if (star) star.textContent = mode === 'required' ? ' *' : '';
    if (star) star.className = mode === 'required' ? 'cm-req-star' : 'cf-star';
  });
  // colapsáveis que agrupam vários campos: oculta só se TODOS ocultos
  document.querySelectorAll('[data-cf-group]').forEach(el => {
    const keys = el.dataset.cfGroup.split(',');
    if (keys.every(k => cardFieldMode(k) === 'hidden')) el.style.display = 'none';
  });
}
/** Retorna lista de labels de campos obrigatórios não preenchidos. */
function missingRequiredFields(c, local) {
  const miss = [];
  const check = (key, filled) => { if (cardFieldMode(key) === 'required' && !filled) miss.push(CARD_FIELD_LABELS[key]); };
  check('description', ($('#m-desc')?.value || '').trim());
  check('assignee',    ($('#m-assignee')?.value || '').trim());
  check('priority',    $('#m-priority')?.value);
  check('startDate',   $('#m-start')?.dataset.iso);
  check('dueDate',     $('#m-due')?.dataset.iso);
  check('tags',        local.tags.length);
  check('label',       local.color);
  check('gains',       ['#m-g-hm','#m-g-ha','#m-g-em','#m-g-ea'].some(s => ($(s)?.value || '').trim()));
  check('subtasks',    (c.subtasks?.length || local.localSubtasks?.length));
  check('links',       (c.links?.length));
  check('dependencies',((c.blockedBy?.length||0) + (c.blocks?.length||0)));
  return miss;
}

export async function openCardModal(cardId) {
  const isNew = !cardId;
  let card = isNew
    ? { id:null, title:'', description:'', assignee:(state.currentUser?.name || ''), columnId:(state.columns[0]?.id||'backlog'),
        priority:'media', projectionStatus:'no-prazo', progress:0, progressMode:'manual',
        vision:'', color:'', tags:[], requestedBy:[], helpers:[], subtasks:[], comments:[],
        history:[], links:[], blockedBy:[], blocks:[], archived:false, revision:0 }
    : JSON.parse(JSON.stringify(cardById(cardId) || {}));
  if (!isNew && !card.id) { toast('Card não encontrado.', 'error'); return; }

  ['tags','requestedBy','helpers','subtasks','comments','history','links','blockedBy','blocks']
    .forEach(k => { card[k] = card[k] || []; });

  const role = state.currentUser?.role;
  const canEdit = isNew ? can(role,'create') : can(role,'edit');

  // estado local editável
  const local = {
    tags: card.tags.slice(),
    requestedBy: card.requestedBy.slice(),
    helpers: card.helpers.slice(),
    color: card.color || '',
    localSubtasks: [], // só para card novo
  };

  // Assinatura do estado do formulário. O snapshot é tirado DEPOIS de montar e
  // preencher tudo (mesma função), então não há falso "alterações não salvas".
  const _cvSig = () => { try { return JSON.stringify(collectCustomValues(card)); } catch (e) { return ''; } };
  const readState = () => JSON.stringify({
    t:  $('#m-title')?.value || '',
    d:  $('#m-desc')?.value || '',
    a:  $('#m-assignee')?.value || '',
    c:  $('#m-column')?.value || '',
    p:  $('#m-priority')?.value || '',
    pr: parseInt($('#m-progress')?.value || '0', 10),
    sd: $('#m-start')?.dataset.iso || '',
    dd: $('#m-due')?.dataset.iso || '',
    tg: local.tags.slice().sort().join(','),
    rb: local.requestedBy.slice().sort().join(','),
    hp: local.helpers.slice().sort().join(','),
    cl: local.color || '',
    cv: _cvSig(),
  });
  let snapshot = null;   // definido após wireForm

  openModal({
    wide: true,
    title: isNew
      ? `<span class="modal-title-kicker">Novo card</span><span style="color:var(--text);">Criar card</span>`
      : `<span class="modal-title-kicker">Card · ${escapeHTML((state.teams||[]).find(t=>t.id===card.teamId)?.name || '')}</span><span style="color:var(--text);">${escapeHTML(card.title || '(sem título)')}</span>`,
    body: buildBody(card, canEdit, isNew, local),
    footer: buildFooter(card, isNew, canEdit),
    // Só pede confirmação se o usuário REALMENTE mudou algo após abrir.
    guard: () => canEdit && snapshot !== null && readState() !== snapshot,
  });

  wireForm(card, isNew, canEdit, local);
  applyCardFieldConfig();
  snapshot = readState();   // estado inicial real (com datas/campos já preenchidos)
  setTimeout(() => $('#m-title')?.focus(), 60);
}

/* ═══════════════ BODY ═══════════════ */
function buildBody(c, canEdit, isNew, local) {
  const canComment = can(state.currentUser?.role, 'comment');
  const g = {};
  ['horasMes','horasAno','economiaMes','economiaAno'].forEach(k => {
    const v = (c.gains||{})[k];
    g[k] = (v !== null && v !== undefined && v !== '') ? v : '';
  });
  const qual = (c.gains||{}).qualitativo || [];
  const subPct = subtaskPct(c.subtasks);

  return `
  <div class="cm2-grid">
    <!-- ESQUERDA -->
    <div class="cm2-left">
      ${isNew && canEdit ? `<div id="m-tpl-bar" class="m-tpl-bar" hidden></div>` : ''}
      <input id="m-title" class="cm-title-input" type="text" maxlength="200"
             placeholder="Título do projeto…" value="${escapeHTML(c.title)}" ${canEdit?'':'disabled'}>

      ${isNew ? `<div id="m-planning"></div>` : ''}

      <div class="form-section" data-cf="description">
        <div class="form-section-title">📝 Descrição<span class="cf-star" data-cf-star="description"></span></div>
        <textarea id="m-desc" class="cm-desc" placeholder="Detalhes, escopo, observações…" ${canEdit?'':'disabled'}>${escapeHTML(c.description||'')}</textarea>
        ${canEdit ? `<button type="button" id="m-gen-desc" class="btn btn-secondary btn-sm" style="margin-top:8px;">✨ Gerar descrição</button>` : ''}
      </div>

      <details class="form-section-collapsible" data-cf="gains">
        <summary>💰 Ganhos do Projeto</summary>
        <div class="fsc-body">
          <div class="gains-form-grid">
            <div class="gains-form-row"><label>⏱ Horas economizadas/mês</label>
              <input id="m-g-hm" type="number" min="0" step="0.5" value="${g.horasMes}" placeholder="Ex: 12" ${canEdit?'':'disabled'}></div>
            <div class="gains-form-row"><label>⏱ Horas economizadas/ano</label>
              <input id="m-g-ha" type="number" min="0" step="0.5" value="${g.horasAno}" placeholder="Ex: 100" ${canEdit?'':'disabled'}></div>
            <div class="gains-form-row"><label>💰 Economia mensal (R$)</label>
              <input id="m-g-em" type="number" min="0" step="100" value="${g.economiaMes}" placeholder="Ex: 1500" ${canEdit?'':'disabled'}></div>
            <div class="gains-form-row"><label>💰 Economia anual (R$)</label>
              <input id="m-g-ea" type="number" min="0" step="100" value="${g.economiaAno}" placeholder="Ex: 18000" ${canEdit?'':'disabled'}></div>
            <div class="gains-form-row"><label>⏳ Esforço estimado (h)</label>
              <input id="m-est" type="number" min="0" step="0.5" value="${c.estHours ?? ''}" placeholder="Ex: 8" ${canEdit?'':'disabled'}></div>
            <div class="gains-form-row"><label>⌛ Esforço realizado (h)</label>
              <input id="m-spent" type="number" min="0" step="0.5" value="${c.spentHours ?? ''}" placeholder="Ex: 6" ${canEdit?'':'disabled'}></div>
          </div>
          <div style="margin-top:10px;">
            <label class="gains-lbl">✨ Ganhos qualitativos</label>
            <div class="gains-qual-wrap" id="m-qual-wrap">
              ${qual.map(t => qualTag(t)).join('')}
              <input type="text" class="gains-qual-input" id="m-qual-input" placeholder="Ex: Redução de erros — Enter para adicionar" ${canEdit?'':'disabled'}>
            </div>
            ${canEdit ? `<div class="gains-qual-sugs" id="m-qual-sugs">
              ${QUAL_SUGGESTIONS.map(s => `<button type="button" class="gains-qual-sug" data-qsug="${escapeHTML(s)}">+ ${escapeHTML(s)}</button>`).join('')}
            </div>` : ''}
          </div>
        </div>
      </details>

      <div class="form-section" data-cf="subtasks">
        <div class="form-section-title" style="display:flex;align-items:center;gap:8px;">
          ☑ Subtarefas<span class="cf-star" data-cf-star="subtasks"></span> <span id="m-sub-count" style="color:var(--text-muted);font-weight:500;text-transform:none;"></span>
        </div>
        <div class="subtask-progress"><div class="subtask-progress-bar" id="m-sub-progress" style="width:${subPct}%"></div></div>
        <div class="subtask-list" id="m-sub-list"></div>
        ${canEdit ? `
          <div class="subtask-add">
            <input id="m-sub-input" type="text" placeholder="Adicionar subtarefa…">
            <button class="btn btn-secondary btn-sm" id="m-sub-add">Adicionar</button>
            <button class="btn btn-ghost btn-sm" id="m-tpl-btn" type="button">📋 Templates</button>
          </div>` : ''}
      </div>

      <div class="form-section">
        <div class="form-section-title">💬 Comentários (<span id="m-comments-count">${c.comments.length}</span>)</div>
        <div id="m-comments">${renderComments(c)}</div>
        ${isNew
          ? `<div class="text-muted text-sm" style="padding:6px 0;">Salve o card para comentar.</div>`
          : (canComment ? `
          <div class="cm-new-comment">
            <textarea id="m-new-comment" rows="2" placeholder="Escreva um comentário…  Use @nome para mencionar  (Enter envia · Shift+Enter quebra linha)"></textarea>
            <button class="btn btn-primary btn-sm" id="m-add-comment" style="align-self:flex-end;">Comentar</button>
          </div>` : `<div class="text-muted text-sm" style="padding:6px 0;">Você não tem permissão para comentar neste quadro.</div>`)}
      </div>
    </div>

    <!-- DIREITA -->
    <div class="cm2-right">
      <div class="form-section cm-box">
        <div class="form-section-title">Status</div>
        <div class="cm-field"><label>Coluna</label>
          <select id="m-column" ${canEdit?'':'disabled'}>
            ${state.columns.map(col => `<option value="${escapeHTML(col.id)}" ${c.columnId===col.id?'selected':''}>${escapeHTML(col.icon||'')} ${escapeHTML(col.name)}</option>`).join('')}
          </select>
        </div>
        ${(state.sprints && state.sprints.length) ? `
        <div class="cm-field"><label>Sprint</label>
          <select id="m-sprint" ${canEdit?'':'disabled'}>
            <option value="">— Sem sprint —</option>
            ${state.sprints.map(sp => `<option value="${escapeHTML(sp.id)}" ${c.sprintId===sp.id?'selected':''}>${escapeHTML(sp.name)}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="cm-field-row">
          <div class="cm-field" data-cf="priority"><label>Prioridade<span class="cf-star" data-cf-star="priority"></span></label>
            <select id="m-priority" ${canEdit?'':'disabled'}>
              ${[['baixa','Baixa'],['media','Média'],['alta','Alta'],['urgente','Urgente']].map(([p,l])=>`<option value="${p}" ${c.priority===p?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
          <div class="cm-field"><label>Projeção</label>
            <select id="m-status" ${canEdit?'':'disabled'}>
              ${[['no-prazo','No prazo'],['em-risco','Em risco'],['atrasado','Atrasado']].map(([v,l])=>`<option value="${v}" ${c.projectionStatus===v?'selected':''}>${l}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="cm-field">
          <div class="progress-mode-toggle">
            <label style="margin:0;">Progresso (<span id="m-progress-val">${c.progress||0}</span>%)</label>
            <button type="button" class="pm-btn ${c.progressMode==='auto'?'active':''}" id="m-pm-auto" ${(!c.subtasks.length)?'disabled title="Adicione subtarefas"':''}>Auto</button>
            <button type="button" class="pm-btn ${c.progressMode!=='auto'?'active':''}" id="m-pm-manual">Manual</button>
          </div>
          <div class="m-prog" id="m-prog">
            <div class="m-prog-rail"></div>
            <div class="m-prog-fill" id="m-prog-fill"></div>
            <div class="m-prog-knob" id="m-prog-knob"></div>
            <input id="m-progress" type="range" min="0" max="100" step="5" value="${Number(c.progress)||0}" aria-label="Progresso" ${(c.progressMode==='auto'||!canEdit)?'disabled':''}>
          </div>
        </div>
      </div>

      <div class="form-section cm-box" data-cf="assignee">
        <div class="form-section-title">👤 Responsável<span class="cf-star" data-cf-star="assignee"></span></div>
        <input type="hidden" id="m-assignee" value="${escapeHTML(c.assignee)}">
        <div id="m-assignee-dd" class="cm-dd${canEdit?'':' is-disabled'}"></div>
        <div class="cm-assignee-hint" id="m-assignee-hint">Padrão: você. Pode delegar a qualquer membro da equipe.</div>
      </div>

      <div class="form-section cm-box">
        <div class="form-section-title">📅 Datas</div>
        <div class="cm-field-row">
          <div class="cm-field" data-cf="startDate"><label>Início<span class="cf-star" data-cf-star="startDate"></span></label>
            <input id="m-start" type="text" class="cm-date-input" data-iso="${escapeHTML(c.startDate||'')}" placeholder="dd/mm/aaaa" ${canEdit?'':'disabled'}></div>
          <div class="cm-field" data-cf="dueDate"><label>Término<span class="cf-star" data-cf-star="dueDate"></span></label>
            <input id="m-due" type="text" class="cm-date-input" data-iso="${escapeHTML(c.dueDate||'')}" placeholder="dd/mm/aaaa" ${canEdit?'':'disabled'}></div>
          <div class="cm-field"><label>🔁 Recorrência</label>
            <select id="m-recurrence" ${canEdit?'':'disabled'}>
              ${[['none','Não repete'],['daily','Diária'],['weekly','Semanal'],['monthly','Mensal']].map(([v,l])=>`<option value="${v}" ${ (c.recurrence||'none')===v ? 'selected':''}>${l}</option>`).join('')}
            </select></div>
        </div>
        <p class="text-muted text-sm" style="margin:6px 0 0;">Recorrente: ao concluir, o sistema cria automaticamente a próxima ocorrência com o prazo adiantado.</p>
      </div>

      <details class="form-section-collapsible"${(c.requestedBy?.length || c.helpers?.length) ? ' open' : ''}>
        <summary>👥 Pessoas &amp; Solicitantes</summary>
        <div class="fsc-body">
          <label class="gains-lbl">Solicitado por</label>
          <div class="cm-dd" id="m-requested"><div class="text-muted text-sm" style="padding:8px 12px;">Carregando membros…</div></div>
          <label class="gains-lbl" style="margin-top:10px;">Ajudantes</label>
          <div class="cm-dd" id="m-helpers"><div class="text-muted text-sm" style="padding:8px 12px;">Carregando membros…</div></div>
        </div>
      </details>

      ${renderTeamFields(c, canEdit)}

      <details class="form-section-collapsible" data-cf-group="tags,label">
        <summary>🏷️ Tags &amp; Etiqueta</summary>
        <div class="fsc-body">
          <div data-cf="tags">
            <label class="gains-lbl">Tags<span class="cf-star" data-cf-star="tags"></span></label>
            <div class="tag-input-wrap" id="m-tag-wrap">
              ${local.tags.map(t => tagChip(t)).join('')}
              <input id="m-tag-input" type="text" placeholder="Tag + Enter…" ${canEdit?'':'disabled'}>
            </div>
            ${canEdit ? `<button type="button" id="m-gen-tags" class="btn btn-secondary btn-sm" style="margin-top:8px;">✨ Gerar tags</button>` : ''}
          </div>
          <div data-cf="label">
            <label class="gains-lbl" style="margin-top:12px;">Cor da etiqueta</label>
            <div class="color-picker" id="m-color-picker">
              ${COLOR_PALETTE.map(p => `<div class="color-swatch ${p.id===local.color?'selected':''} ${p.id===''?'none':''}" data-color="${p.id}" title="${p.label}" style="${p.hex?`background:${p.hex}`:''}"></div>`).join('')}
              <label class="color-swatch color-custom ${(local.color||'').startsWith('#')?'selected':''}" title="Cor personalizada" style="${(local.color||'').startsWith('#')?`background:${local.color}`:''}">
                <input type="color" id="m-color-custom" value="${(local.color||'').startsWith('#')?local.color:'#0E2A2A'}" ${canEdit?'':'disabled'}>
                <span class="color-custom-plus">🎨</span>
              </label>
            </div>
            <div class="color-hex-row">
              <span class="color-preview-dot" id="m-color-dot" style="background:${paletteHex(local.color)||'transparent'};${paletteHex(local.color)?'':'border:1px dashed var(--border);'}"></span>
              <input type="text" id="m-color-hex" placeholder="#RRGGBB" value="${(local.color||'').startsWith('#')?escapeHTML(local.color):''}" maxlength="7" ${canEdit?'':'disabled'}>
              <span class="color-hex-help">cole/digite um hex</span>
            </div>
          </div>
        </div>
      </details>

      <details class="form-section-collapsible" data-cf="links"${c.links.length?' open':''}>
        <summary>🔗 Links externos${c.links.length?` (${c.links.length})`:''}</summary>
        <div class="fsc-body">
          <div id="m-links-list">${renderLinks(c)}</div>
          ${(!isNew && canEdit) ? `
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
              <input type="url" id="m-link-url" placeholder="https://…" style="flex:1;min-width:160px;">
              <input type="text" id="m-link-title" placeholder="Título (opcional)" style="flex:1;min-width:120px;">
              <button class="btn btn-secondary btn-sm" id="m-add-link">+ Link</button>
            </div>` : (isNew ? `<div class="text-muted text-sm">Salve o card para anexar links.</div>` : '')}
        </div>
      </details>

      <details class="form-section-collapsible" data-cf="dependencies">
        <summary>🔗 Dependências &amp; Histórico</summary>
        <div class="fsc-body">
          <div style="margin-bottom:10px;">
            <div class="dep-lbl" style="color:var(--danger);">🔒 Bloqueado por</div>
            <div class="dep-chips">${depChips(c.blockedBy)}</div>
          </div>
          <div style="margin-bottom:10px;">
            <div class="dep-lbl" style="color:var(--warning);">⛔ Bloqueia</div>
            <div class="dep-chips">${depChips(c.blocks)}</div>
          </div>
          <div class="form-section-title" style="margin-top:8px;">🕘 Histórico</div>
          <ul class="history-list">
            ${(c.history||[]).slice().reverse().map(h => `
              <li><span class="hl-action">${escapeHTML(h.action)}</span>
                  <span class="when">${escapeHTML(h.user)} · ${escapeHTML(fmtSmart(h.timestamp,true))}</span></li>`).join('')
              || '<li class="text-muted">Sem histórico.</li>'}
          </ul>
        </div>
      </details>
    </div>
  </div>`;
}

function buildFooter(c, isNew, canEdit) {
  const role = state.currentUser?.role;
  const canArchive = !isNew && can(role,'archive');
  const canDelete  = !isNew && can(role,'delete');
  return `
    <div style="display:flex;gap:8px;margin-right:auto;">
      ${canEdit ? `<button class="btn btn-ghost btn-sm" id="m-save-tpl" title="Salvar este card como modelo reutilizável">📋 Salvar modelo</button>` : ''}
      ${!isNew ? `<button class="btn btn-ghost btn-sm" id="m-watch" title="Receber avisos deste card">👁 Seguir</button>` : ''}
      ${canArchive ? `<button class="btn btn-ghost btn-sm" id="m-archive">${c.archived?'📤 Desarquivar':'📦 Arquivar'}</button>` : ''}
      ${(!isNew && canEdit) ? `<button class="btn btn-ghost btn-sm" id="m-duplicate">⧉ Duplicar</button>` : ''}
      ${canDelete  ? `<button class="btn btn-danger btn-sm" id="m-delete">🗑 Excluir</button>` : ''}
    </div>
    <button class="btn btn-secondary" data-close>Cancelar</button>
    ${canEdit ? `<button class="btn btn-primary" id="m-save">${isNew?'+ Criar':'💾 Salvar'}</button>` : ''}
  `;
}

/* ═══════════════ render helpers ═══════════════ */
/* makeDropdown vive em js/ui/dropdown.js (reutilizado por perfil, etc.) */

/* Campos personalizados da equipe (modulares). Renderiza os visíveis;
   ocultos são preservados em silêncio no save. */
function renderTeamFields(c, canEdit) {
  const fields = (state.customFields || []).filter(f => !Number(f.hidden));
  if (!fields.length) return '';
  const cv = c.customValues || {};
  const body = fields.map(f => {
    const v = cv[f.id] != null ? String(cv[f.id]) : '';
    const req = Number(f.required) ? ' <span style="color:var(--danger)">*</span>' : '';
    const a = `id="m-cf-${escapeHTML(f.id)}" data-cf-id="${escapeHTML(f.id)}" data-cf-req="${Number(f.required)?1:0}" ${canEdit?'':'disabled'}`;
    let ctrl;
    if (f.type === 'select') {
      let opts = []; try { opts = JSON.parse(f.options || '[]'); } catch {}
      ctrl = `<select class="select" ${a}><option value="">${Number(f.required)?'Selecione…':'— Nenhum —'}</option>${opts.map(o=>`<option value="${escapeHTML(o)}" ${v===o?'selected':''}>${escapeHTML(o)}</option>`).join('')}</select>`;
    } else if (f.type === 'number') {
      ctrl = `<input class="input" type="number" value="${escapeHTML(v)}" ${a}>`;
    } else if (f.type === 'date') {
      ctrl = `<input class="input" type="date" value="${escapeHTML(v)}" ${a}>`;
    } else {
      ctrl = `<input class="input" type="text" value="${escapeHTML(v)}" ${a}>`;
    }
    return `<div class="cm-field" style="margin-bottom:8px;"><label>${escapeHTML(f.name)}${req}</label>${ctrl}</div>`;
  }).join('');
  return `<details class="form-section-collapsible" open>
    <summary>🧩 Campos da equipe</summary>
    <div class="fsc-body">${body}</div>
  </details>`;
}
/* Vincula um par de inputs mensal↔anual (fator = anual/mensal, ex.: 12).
   Digitar de um lado calcula o outro e o desabilita; limpar reabre ambos. */
function wireGainPair(mEl, aEl, factor) {
  if (!mEl || !aEl) return;
  const recalc = (driver) => {
    const mV = mEl.value.trim(), aV = aEl.value.trim();
    if (driver === 'm') {
      if (mV === '') { mEl.disabled = false; aEl.disabled = false; return; }
      aEl.value = +(parseFloat(mV) * factor).toFixed(2); aEl.disabled = true; mEl.disabled = false;
    } else {
      if (aV === '') { mEl.disabled = false; aEl.disabled = false; return; }
      mEl.value = +(parseFloat(aV) / factor).toFixed(2); mEl.disabled = true; aEl.disabled = false;
    }
  };
  mEl.addEventListener('input', () => recalc('m'));
  aEl.addEventListener('input', () => recalc('a'));
  const mF = mEl.value.trim() !== '', aF = aEl.value.trim() !== '';
  if (mF && !aF) recalc('m');
  else if (aF && !mF) recalc('a');   // se ambos ou nenhum: deixa os dois livres (não mexe em legado)
}

/* Coleta valores dos campos personalizados (mantém os ocultos já existentes). */
function collectCustomValues(c) {
  const cv = { ...(c.customValues || {}) };
  document.querySelectorAll('[data-cf-id]').forEach(el => { cv[el.dataset.cfId] = el.value || ''; });
  return cv;
}
function qualTag(t)  { return `<span class="gains-qual-tag">${escapeHTML(t)} <button type="button" data-qtag="${escapeHTML(t)}">×</button></span>`; }
/* Sugestões rápidas de ganhos qualitativos (padroniza a entrada e facilita agregação no dashboard). */
const QUAL_SUGGESTIONS = ['Redução de erros','Padronização','Mais agilidade','Satisfação do cliente','Segurança','Rastreabilidade','Menos retrabalho','Melhor comunicação','Conformidade','Experiência do usuário'];
function tagChip(t)  { return `<span class="tag-chip">#${escapeHTML(t)} <button type="button" data-rmtag="${escapeHTML(t)}">×</button></span>`; }
function depChips(ids){ if(!ids||!ids.length) return '<span class="text-muted text-sm">Nenhuma.</span>';
  return ids.map(id => { const cc = cardById(id); return `<span class="dep-chip">${escapeHTML(cc?cc.title.slice(0,24):id)}</span>`; }).join(''); }
function peopleChecks(prefix, selected) {
  const people = (state.people || []).map(p => p.name);
  if (!people.length) return '<span class="text-muted text-sm">Nenhuma pessoa cadastrada.</span>';
  const sel = new Set(selected);
  return people.map(n => `
    <label class="cm-check"><input type="checkbox" data-${prefix}="${escapeHTML(n)}" ${sel.has(n)?'checked':''}> ${escapeHTML(n)}</label>`).join('');
}
function renderLinks(c) {
  if (!c.links.length) return '<div class="text-muted text-sm">Nenhum link.</div>';
  return c.links.map(l => `
    <div class="cm-link-row" style="display:flex;align-items:center;gap:8px;position:relative;">
      <a href="${escapeHTML(l.url)}" target="_blank" rel="noopener" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🔗 ${escapeHTML(l.title || l.url)}</a>
      <button type="button" class="icon-btn cm-link-del" data-rmlink="${escapeHTML(l.id)}"
              title="Remover link" aria-label="Remover link"
              style="flex:none;cursor:pointer;position:relative;z-index:2;">✕</button>
    </div>`).join('');
}
function subtaskPct(subs) {
  let done=0, total=0;
  const walk = (list) => list.forEach(s => { total++; if (s.done) done++; if (s.subtasks) walk(s.subtasks); });
  walk(subs || []);
  return total ? Math.round(done/total*100) : 0;
}
/* (Anexos de card removidos — o sistema não guarda mais arquivos em cards.) */

/* ═══════════════ comments (thread) ═══════════════ */
function renderComments(c) {
  if (!c.comments.length) return '<div class="text-muted text-sm" style="padding:6px 0;">Sem comentários ainda.</div>';
  const me = (state.currentUser?.name || '').toLowerCase();
  const canComment = can(state.currentUser?.role, 'comment');
  const root = c.comments.filter(cm => !cm.parentId);
  const byParent = {};
  c.comments.forEach(cm => { if (cm.parentId) (byParent[cm.parentId]=byParent[cm.parentId]||[]).push(cm); });
  const countDescendants = (id) => {
    const kids = byParent[id] || [];
    return kids.reduce((n, k) => n + 1 + countDescendants(k.id), 0);
  };
  const one = (cm, depth = 0) => {
    const mine = (cm.user||'').toLowerCase() === me;
    const reactions = cm.reactions && typeof cm.reactions==='object' ? cm.reactions : {};
    const chips = Object.entries(reactions).map(([em,us]) => {
      const arr = Array.isArray(us)?us:[]; const isMe = arr.map(x=>x.toLowerCase()).includes(me);
      return `<button class="reaction-chip ${isMe?'me':''}" data-react="${escapeHTML(cm.id)}|${escapeHTML(em)}">${escapeHTML(em)} ${arr.length}</button>`;
    }).join('');
    const kids = byParent[cm.id] || [];
    const replies = kids.map(k => one(k, depth + 1)).join('');
    const total = countDescendants(cm.id);
    const initial = escapeHTML((cm.user||'?')[0].toUpperCase());
    return `<div class="comment ${depth>0?'is-reply':''} ${kids.length?'collapsed':''}" data-cmid="${escapeHTML(cm.id)}">
      <div class="comment-gutter">
        <div class="avatar sm">${initial}</div>
        ${kids.length ? `<button class="comment-collapse" data-collapse="${escapeHTML(cm.id)}" title="Mostrar/ocultar respostas"><span class="cc-line"></span></button>` : ''}
      </div>
      <div class="comment-content">
        <div class="comment-head">
          <span class="who">${escapeHTML(cm.user)}</span>
          <span class="when" title="${escapeHTML(fmtDateTime(cm.timestamp))}">${escapeHTML(fmtSmart(cm.timestamp,true))}</span>
          ${kids.length ? `<button class="comment-collapse-pill" data-collapse="${escapeHTML(cm.id)}" title="Mostrar/ocultar respostas">▸ ${total} resposta${total>1?'s':''}</button>` : ''}
        </div>
        <div class="comment-text" id="ct-${escapeHTML(cm.id)}">${escapeHTML(cm.text)}</div>
        <div class="comment-reactions">${chips}${canComment?`<button class="reaction-chip" data-react-add="${escapeHTML(cm.id)}">+</button>`:''}</div>
        <div class="comment-actions">
          ${canComment?`<button class="comment-action-btn" data-reply="${escapeHTML(cm.id)}">↩ Responder</button>`:''}
          ${mine?`<button class="comment-action-btn" data-edit="${escapeHTML(cm.id)}">✏️ Editar</button>`:''}
          ${mine?`<button class="comment-action-btn" data-del="${escapeHTML(cm.id)}" style="color:var(--danger);">🗑 Apagar</button>`:''}
        </div>
        ${replies?`<div class="comment-replies">${replies}</div>`:''}
      </div></div>`;
  };
  return `<div class="comment-list">${root.map(cm => one(cm, 0)).join('')}</div>`;
}

/* ═══════════════ WIRING ═══════════════ */
function wireForm(c, isNew, canEdit, local) {
  // ── Save ──
  $('#m-save') && ($('#m-save').onclick = () => save(c, isNew, local));

  // ── Date pickers temáticos ──
  if (canEdit) { attachDatePicker($('#m-start')); attachDatePicker($('#m-due')); }

  // ── Responsável + Solicitado/Ajudantes: membros da equipe ──
  const TEAM_ROLE_LBL = { gestor:'Gestor', ti:'TI da equipe', analista:'Analista', visitante:'Visitante' };
  local.teamMembers = null; // null = ainda não carregado (não valida)
  (async () => {
    const teamId = (isNew ? state.currentTeamId : c.teamId) || state.currentTeamId;
    if (!teamId) return;
    let members = [];
    try {
      members = (await api.call('teams.php', 'members', { team_id: teamId }, 'GET')).members || [];
    } catch { return; }
    const names = members.map(m => m.name).filter(Boolean);
    local.teamMembers = names;

    // value = m.name (chave canônica usada nos cards); label = nome de exibição.
    const memberOpts = members.map(m => ({ value: m.name, label: m.display || m.name, sub: TEAM_ROLE_LBL[m.role] || m.role }));
    const nameToDisplay = {}; members.forEach(m => { nameToDisplay[m.name] = m.display || m.name; });

    // Pessoas externas da equipe (não-usuárias) cadastradas em Gerenciar › Configurações
    try {
      const team = (state.teams || []).find(t => t.id === teamId);
      const extra = team ? (JSON.parse(team.extra_people || '[]') || []) : [];
      extra.forEach(p => {
        const nm = typeof p === 'string' ? p : (p && p.name);   // novo formato: {name, userId, email}
        if (nm && !names.includes(nm)) { names.push(nm); memberOpts.push({ value: nm, label: nm, sub: 'externo' }); }
      });
    } catch (e) {}
    // Agora que temos a lista completa, re-renderiza as subtarefas para o seletor
    // de "responsável da subtarefa" oferecer todos os membros da equipe.
    local.teamMembers = names.slice();
    try { renderSubtaskList(c, isNew, canEdit, local); } catch (e) {}

    // Responsável (dropdown customizado, single, com cargo ao lado)
    const assigneeHost = $('#m-assignee-dd');
    if (assigneeHost) {
      const cur = c.assignee || '';
      const opts = [{ value: '', label: '— Sem responsável —' }, ...memberOpts];
      if (cur && !names.includes(cur)) opts.splice(1, 0, { value: cur, label: cur, sub: 'fora da equipe' });
      local._assigneeDD = makeDropdown(assigneeHost, {
        multi: false, placeholder: '— Sem responsável —', value: cur, options: opts, disabled: !canEdit,
        onChange: v => { const h = $('#m-assignee'); if (h) h.value = v; },
      });
    }

    // Solicitado por / Ajudantes (dropdowns multi-seleção customizados)
    const reqEl = $('#m-requested');
    if (reqEl) makeDropdown(reqEl, { multi: true, placeholder: 'Selecione quem solicitou…', value: local.requestedBy, options: memberOpts, disabled: !canEdit,
      onChange: v => { local.requestedBy = [...v]; } });
    const helpEl = $('#m-helpers');
    if (helpEl) makeDropdown(helpEl, { multi: true, placeholder: 'Selecione os ajudantes…', value: local.helpers, options: memberOpts, disabled: !canEdit,
      onChange: v => { local.helpers = [...v]; } });
  })();

  // ── Planning suggestions (novo) ──
  if (isNew) {
    let timer = null;
    const renderPlan = (titleVal) => {
      const cont = $('#m-planning'); if (!cont) return;
      const sug = buildPlanningSuggestions(titleVal);
      if (!sug.length) { cont.innerHTML=''; return; }
      cont.innerHTML = `
        <div class="planning-assistant">
          <div class="planning-assistant-header">💡 Sugestões de planejamento</div>
          <div class="planning-chips">${sug.map((s,i)=>`<button class="suggestion-chip" data-sug="${i}" type="button">${escapeHTML(s.label)}</button>`).join('')}</div>
          <button class="planning-accept-all" id="m-accept-all" type="button">Aplicar todas</button>
        </div>`;
      const apply = (s) => {
        if (s.field==='priority') { const e=$('#m-priority'); if(e) e.value=s.val; }
        else if (s.field==='assignee') { const e=$('#m-assignee'); if(e) e.value=s.val; local._assigneeDD?.set(s.val); }
        else if (s.field==='dueDate') { const e=$('#m-due'); if(e) setDatePickerValue(e, s.val); }
        else if (s.field==='tag') { if(!local.tags.includes(s.val)){ local.tags.push(s.val); refreshTags(local); } }
      };
      cont.querySelectorAll('.suggestion-chip').forEach(b => b.onclick = () => { apply(sug[+b.dataset.sug]); b.classList.add('accepted'); });
      $('#m-accept-all').onclick = () => { sug.forEach(apply); cont.querySelectorAll('.suggestion-chip').forEach(b=>b.classList.add('accepted')); };
    };
    renderPlan('');
    $('#m-title')?.addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => renderPlan(e.target.value), 400); });
  }

  // ── Gerar descrição ──
  $('#m-gen-desc') && ($('#m-gen-desc').onclick = async () => {
    const colName = (state.columns.find(x => x.id === $('#m-column').value)?.name) || '';
    const desc = generateDescription({
      title: $('#m-title').value, vision: $('#m-vision')?.value || '',
      priority: $('#m-priority').value, columnId: $('#m-column').value, columnName: colName,
      subtasks: isNew ? local.localSubtasks : c.subtasks,
      assignee: $('#m-assignee').value.trim(),
      startDate: $('#m-start')?.dataset.iso || '', dueDate: $('#m-due')?.dataset.iso || '',
      tags: local.tags,
      gains: {
        horasMes: $('#m-g-hm')?.value, horasAno: $('#m-g-ha')?.value,
        economiaMes: $('#m-g-em')?.value, economiaAno: $('#m-g-ea')?.value,
      },
    });
    if (!desc) { toast('Preencha o título primeiro.', 'warn'); return; }
    if ($('#m-desc').value.trim()) {
      const ok = await confirmDialog({ title:'Gerar descrição', message:'Substituir a descrição atual pela versão gerada?', confirmText:'Substituir', cancelText:'Manter' });
      if (!ok) return;
    }
    $('#m-desc').value = desc;
    toast('Descrição gerada.', 'success');
  });

  // ── Gerar tags ──
  $('#m-gen-tags') && ($('#m-gen-tags').onclick = () => {
    const newTags = generateSmartTags({ title: $('#m-title').value, description: $('#m-desc').value });
    newTags.forEach(t => { if (!local.tags.includes(t)) local.tags.push(t); });
    refreshTags(local);
    toast(newTags.length ? 'Tags geradas.' : 'Nada a sugerir.', newTags.length?'success':'info');
  });

  // ── Tags input ──
  const tagInput = $('#m-tag-input');
  tagInput && tagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const v = tagInput.value.trim().replace(/^#/,''); if (v && !local.tags.includes(v)) { local.tags.push(v); refreshTags(local); } tagInput.value=''; }
  });
  $('#m-tag-wrap')?.addEventListener('click', e => {
    const b = e.target.closest('[data-rmtag]'); if (!b) return;
    local.tags = local.tags.filter(t => t !== b.dataset.rmtag); refreshTags(local);
  });

  // ── Cor da etiqueta (paleta + hex personalizado) ──
  const colorDot = $('#m-color-dot');
  const hexInput = $('#m-color-hex');
  const customSw = $('#m-color-picker')?.querySelector('.color-custom');
  const customInp = $('#m-color-custom');
  const syncColorUI = () => {
    const hex = paletteHex(local.color);
    if (colorDot) { colorDot.style.background = hex || 'transparent'; colorDot.style.border = hex ? 'none' : '1px dashed var(--border)'; }
    const isCustom = (local.color||'').startsWith('#');
    $('#m-color-picker')?.querySelectorAll('.color-swatch[data-color]').forEach(s => s.classList.toggle('selected', s.dataset.color === local.color));
    if (customSw) { customSw.classList.toggle('selected', isCustom); if (isCustom) customSw.style.background = local.color; }
  };
  // swatches da paleta
  $('#m-color-picker')?.querySelectorAll('.color-swatch[data-color]').forEach(sw => sw.onclick = () => {
    local.color = sw.dataset.color;
    if (hexInput) hexInput.value = '';
    syncColorUI();
  });
  // input de cor nativo (custom)
  customInp && customInp.addEventListener('input', () => {
    local.color = customInp.value;
    if (hexInput) hexInput.value = customInp.value;
    syncColorUI();
  });
  // hex digitado/colado
  hexInput && hexInput.addEventListener('input', () => {
    let v = hexInput.value.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
      local.color = v;
      if (customInp && v.length === 7) customInp.value = v;
      syncColorUI();
    }
  });

  // ── Ganhos qualitativos ──
  const qi = $('#m-qual-input');
  const addQual = (v) => {
    v = (v || '').trim(); if (!v) return;
    // evita duplicados (case-insensitive)
    const exists = Array.from(document.querySelectorAll('#m-qual-wrap .gains-qual-tag'))
      .some(t => t.textContent.replace('×','').trim().toLowerCase() === v.toLowerCase());
    if (exists) return;
    const sp = document.createElement('span'); sp.className = 'gains-qual-tag';
    sp.innerHTML = `${escapeHTML(v)} <button type="button" data-qtag="${escapeHTML(v)}">×</button>`;
    qi.before(sp);
  };
  qi && qi.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addQual(qi.value); qi.value = ''; }
  });
  $('#m-qual-wrap')?.addEventListener('click', e => { const b=e.target.closest('[data-qtag]'); if (b) b.parentElement.remove(); });
  $('#m-qual-sugs')?.addEventListener('click', e => { const b=e.target.closest('[data-qsug]'); if (b) { addQual(b.dataset.qsug); qi?.focus(); } });

  // ── Ganhos: vínculo mensal ↔ anual (×12). Digitar num lado calcula e
  //    desabilita o outro; limpar reabre os dois. Não mexe em cards legados
  //    que já tenham os dois preenchidos (só vincula se exatamente um estiver). ──
  wireGainPair($('#m-g-hm'), $('#m-g-ha'), 12);
  wireGainPair($('#m-g-em'), $('#m-g-ea'), 12);

  // ── Pessoas: solicitado por / ajudantes são geridos pelos dropdowns
  //    customizados (makeDropdown) via onChange → local.requestedBy / local.helpers.

  // ── Progress mode ──
  const progEl = $('#m-progress');
  const progWrap = $('#m-prog'), progFill = $('#m-prog-fill'), progKnob = $('#m-prog-knob');
  // Slider CUSTOMIZADO: a bolinha encosta nas pontas (0% = início, 100% = fim).
  // translateX(-pct%) mantém o knob DENTRO da trilha usando a própria largura dele.
  const paintProg = () => {
    const pct = Math.max(0, Math.min(100, Number(progEl?.value) || 0));
    if (progFill) progFill.style.width = pct + '%';
    if (progKnob) { progKnob.style.left = pct + '%'; progKnob.style.transform = `translateX(-${pct}%)`; }
    if (progWrap) progWrap.classList.toggle('is-disabled', !!(progEl && progEl.disabled));
  };
  paintProg();
  $('#m-pm-auto') && ($('#m-pm-auto').onclick = () => {
    if ($('#m-pm-auto').disabled) return;
    c.progressMode = 'auto';
    $('#m-pm-auto').classList.add('active'); $('#m-pm-manual').classList.remove('active');
    progEl.disabled = true;
    const pct = subtaskPct(c.subtasks); progEl.value = pct; $('#m-progress-val').textContent = pct; paintProg();
  });
  $('#m-pm-manual') && ($('#m-pm-manual').onclick = () => {
    c.progressMode = 'manual';
    $('#m-pm-manual').classList.add('active'); $('#m-pm-auto').classList.remove('active');
    progEl.disabled = !canEdit;
  });
  progEl && progEl.addEventListener('input', () => { $('#m-progress-val').textContent = progEl.value; paintProg(); });

  // ── Subtasks ──
  renderSubtaskList(c, isNew, canEdit, local);
  $('#m-sub-add') && ($('#m-sub-add').onclick = () => addSubtask(c, isNew, canEdit, local));
  $('#m-sub-input') && $('#m-sub-input').addEventListener('keydown', e => { if (e.key==='Enter'){ e.preventDefault(); addSubtask(c, isNew, canEdit, local); } });
  // Templates dropdown — painel FIXO criado no body (o dropdown absoluto era
  // cortado pelo overflow do modal quando abria na parte de baixo do card).
  const tplBtn = $('#m-tpl-btn');
  if (tplBtn) {
    let tplPanel = null;
    function posTpl() {
      if (!tplPanel) return;
      const r = tplBtn.getBoundingClientRect(); const margin = 8;
      tplPanel.style.minWidth = Math.max(220, r.width) + 'px';
      const w = tplPanel.offsetWidth || 220;
      tplPanel.style.left = Math.max(margin, r.right - w) + 'px';
      tplPanel.style.right = 'auto';
      const below = window.innerHeight - r.bottom - margin, above = r.top - margin;
      const full = tplPanel.scrollHeight || 200;
      if (below >= Math.min(full, 260) || below >= above) {
        tplPanel.style.top = (r.bottom + 4) + 'px';
        tplPanel.style.maxHeight = Math.max(120, Math.min(260, below)) + 'px';
      } else {
        const h = Math.max(120, Math.min(260, above));
        tplPanel.style.maxHeight = h + 'px';
        tplPanel.style.top = (r.top - h - 4) + 'px';
      }
    }
    function outsideTpl(e) { if (tplPanel && !tplPanel.contains(e.target) && !tplBtn.contains(e.target)) closeTpl(); }
    function closeTpl() {
      if (!tplPanel) return;
      tplPanel.remove(); tplPanel = null;
      window.removeEventListener('scroll', posTpl, true);
      window.removeEventListener('resize', posTpl);
      document.removeEventListener('mousedown', outsideTpl, true);
      tplBtn.setAttribute('aria-expanded', 'false');
    }
    function openTpl() {
      tplPanel = document.createElement('div');
      tplPanel.className = 'template-dropdown';
      tplPanel.style.cssText = 'position:fixed;overflow-y:auto;z-index:9998;';
      tplPanel.innerHTML = CHECKLIST_TEMPLATES.map((t,i)=>`<button type="button" data-tpl="${i}">${escapeHTML(t.name)} <span>(${t.items.length})</span></button>`).join('');
      document.body.appendChild(tplPanel);
      posTpl();
      tplPanel.querySelectorAll('[data-tpl]').forEach(b => b.onclick = async () => {
        const tpl = CHECKLIST_TEMPLATES[+b.dataset.tpl];
        closeTpl();
        for (const item of tpl.items) await addSubtaskValue(c, isNew, local, item);
        renderSubtaskList(c, isNew, canEdit, local);
        toast(`Template "${tpl.name}" aplicado.`, 'success');
      });
      window.addEventListener('scroll', posTpl, true);
      window.addEventListener('resize', posTpl);
      setTimeout(() => document.addEventListener('mousedown', outsideTpl, true), 0);
      tplBtn.setAttribute('aria-expanded', 'true');
    }
    tplBtn.onclick = (e) => { e.stopPropagation(); tplPanel ? closeTpl() : openTpl(); };
  }

  // ── Comments ──
  const postNewComment = async () => {
    const ta = $('#m-new-comment'); if (!ta) return;
    const text = (ta.value||'').trim(); if (!text) return;
    const btn = $('#m-add-comment'); if (btn) btn.disabled = true;
    try { await api.call('comments.php','create',{cardId:c.id,text}); ta.value=''; ta.style.height=''; await reload(c); refreshComments(c); }
    catch (e) { toast(e.message,'error'); }
    finally { if (btn) btn.disabled = false; $('#m-new-comment')?.focus(); }
  };
  $('#m-add-comment') && ($('#m-add-comment').onclick = postNewComment);
  // Enter publica · Shift+Enter quebra linha (estilo chat)
  $('#m-new-comment') && ($('#m-new-comment').onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postNewComment(); }
  });
  wireComments(c);

  // ── Links ──
  const addLink = async () => {
    const url = $('#m-link-url').value.trim(); if (!url) return;
    try { await api.call('links.php','create',{cardId:c.id,url,title:$('#m-link-title').value.trim()}); $('#m-link-url').value=''; $('#m-link-title').value=''; await reload(c); refreshLinks(c); }
    catch (e) { toast(e.message,'error'); }
  };
  $('#m-add-link') && ($('#m-add-link').onclick = addLink);
  ['m-link-url','m-link-title'].forEach(id => $('#'+id)?.addEventListener('keydown', e => { if (e.key==='Enter'){ e.preventDefault(); addLink(); } }));
  $('#m-links-list')?.addEventListener('click', async e => {
    const b = e.target.closest('[data-rmlink]'); if (!b) return;
    try { await api.call('links.php','delete',{id:b.dataset.rmlink}); await reload(c); refreshLinks(c); }
    catch (er) { toast(er.message,'error'); }
  });

  // (Anexos removidos do sistema.)

  // ── Archive / delete / duplicate ──
  // Seguir / deixar de seguir (watchers)
  const watchBtn = $('#m-watch');
  if (watchBtn && !isNew) {
    let watching = false;
    const paintW = () => { watchBtn.innerHTML = watching ? '✅ Seguindo' : '👁 Seguir'; watchBtn.classList.toggle('is-watching', watching); };
    api.call('cards.php', 'watch_status', { id: c.id }, 'GET').then(r => { watching = !!r.watching; paintW(); }).catch(() => {});
    watchBtn.onclick = async () => {
      try { const r = await api.call('cards.php', 'watch', { id: c.id, on: !watching }); watching = !!r.watching; paintW();
        toast(watching ? 'Você está seguindo este card.' : 'Você deixou de seguir.', 'success'); }
      catch (e) { toast(e.message, 'error'); }
    };
  }
  // Modelos de card (salvar / aplicar)
  const collectTpl = () => ({
    title: $('#m-title').value.trim(),
    description: $('#m-desc').value,
    priority: $('#m-priority')?.value || 'media',
    tags: local.tags.slice(),
    estHours: numOrNull($('#m-est')?.value),
    subtasks: (isNew ? local.localSubtasks : (c.subtasks || [])).map(s => s.title).filter(Boolean),
  });
  $('#m-save-tpl') && ($('#m-save-tpl').onclick = async () => {
    const teamId = (isNew ? state.currentTeamId : c.teamId) || state.currentTeamId;
    const { openModal, closeModal } = await import('../ui/modal.js');
    openModal({
      title: '<span class="modal-title-kicker">Modelo</span><span style="color:var(--text);">Salvar como modelo</span>',
      body: `<div class="field"><label>Nome do modelo</label><input class="input" id="tpl-name" maxlength="60" placeholder="Ex.: Checklist de implantação"></div>`,
      footer: '<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" id="tpl-ok">Salvar</button>',
    });
    const inp = document.getElementById('tpl-name'); setTimeout(() => inp?.focus(), 40);
    const go = async () => {
      const name = (inp.value || '').trim(); if (!name) return;
      try { await api.call('templates.php', 'create', { team_id: teamId, name, data: collectTpl() }); closeModal(true); toast('Modelo salvo.', 'success'); }
      catch (e) { toast(e.message, 'error'); }
    };
    document.getElementById('tpl-ok').onclick = go;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  });
  if (isNew && $('#m-tpl-bar')) {
    const bar = $('#m-tpl-bar');
    api.call('templates.php', 'list', { team_id: state.currentTeamId || 'team-default' }, 'GET').then(r => {
      const tpls = r.templates || []; if (!tpls.length) return;
      bar.hidden = false;
      bar.innerHTML = `<label class="m-tpl-lbl">📋 Usar modelo:</label>
        <select id="m-tpl-sel"><option value="">— escolher —</option>${tpls.map(t => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.name)}</option>`).join('')}</select>`;
      bar.querySelector('#m-tpl-sel').onchange = (e) => {
        const t = tpls.find(x => x.id === e.target.value); if (!t) return;
        let d = {}; try { d = JSON.parse(t.data || '{}') || {}; } catch (err) {}
        if (d.title && !$('#m-title').value.trim()) $('#m-title').value = d.title;
        if (d.description) $('#m-desc').value = d.description;
        if (d.priority && $('#m-priority')) $('#m-priority').value = d.priority;
        if ($('#m-est') && d.estHours != null) $('#m-est').value = d.estHours;
        if (Array.isArray(d.tags)) { d.tags.forEach(tg => { if (!local.tags.includes(tg)) local.tags.push(tg); }); refreshTags(local); }
        if (Array.isArray(d.subtasks)) {
          d.subtasks.forEach(tt => local.localSubtasks.push({ id: 'tmp-' + Math.random().toString(36).slice(2), title: tt, done: false, subtasks: [] }));
          c.subtasks = local.localSubtasks; renderSubtaskList(c, isNew, canEdit, local);
        }
        toast('Modelo aplicado.', 'success');
      };
    }).catch(() => {});
  }
  $('#m-archive') && ($('#m-archive').onclick = async () => {
    try { const r = await api.call('cards.php', c.archived?'unarchive':'archive', {id:c.id});
      const i = state.cards.findIndex(x=>x.id===c.id); if(i>=0&&r?.card) state.cards[i]=r.card;
      toast(c.archived?'Desarquivado.':'Arquivado.','success'); closeModal(true); reRender();
    } catch (e) { toast(e.message,'error'); }
  });
  $('#m-delete') && ($('#m-delete').onclick = async () => {
    const ok = await confirmDialog({ title:'Excluir card', message:`Excluir "${c.title || 'este card'}" permanentemente? Esta ação não pode ser desfeita.`, confirmText:'Excluir', danger:true });
    if (!ok) return;
    try { await api.call('cards.php','delete',{id:c.id}); state.cards=state.cards.filter(x=>x.id!==c.id);
      toast('Card excluído.','success'); closeModal(true); reRender();
    } catch (e) { toast(e.message,'error'); }
  });
  $('#m-duplicate') && ($('#m-duplicate').onclick = async () => {
    try { const r = await api.call('cards.php','duplicate',{id:c.id}); if(r?.card) state.cards.push(r.card);
      toast('Card duplicado.','success'); closeModal(true); reRender();
    } catch (e) { toast(e.message,'error'); }
  });
}

function reRender() { import('../core/router.js').then(m => m.switchView(state.view)); }

function refreshTags(local) {
  const wrap = $('#m-tag-wrap'); if (!wrap) return;
  const input = $('#m-tag-input');
  wrap.querySelectorAll('.tag-chip').forEach(c => c.remove());
  local.tags.forEach(t => input.insertAdjacentHTML('beforebegin', tagChip(t)));
}
function refreshComments(c) {
  const el = $('#m-comments');
  if (el) { el.innerHTML = renderComments(c); wireComments(c); }
  const cnt = $('#m-comments-count');
  if (cnt) cnt.textContent = c.comments.length;
}
function refreshLinks(c) { const el = $('#m-links-list'); if (el) el.innerHTML = renderLinks(c); }

/* subtasks */
async function addSubtask(c, isNew, canEdit, local) {
  const inp = $('#m-sub-input'); const t = (inp.value||'').trim(); if (!t) return;
  await addSubtaskValue(c, isNew, local, t);
  inp.value=''; renderSubtaskList(c, isNew, canEdit, local);
}
async function addSubtaskValue(c, isNew, local, title) {
  if (isNew) { local.localSubtasks.push({ id:'tmp-'+Math.random().toString(36).slice(2), title, done:false, subtasks:[] }); c.subtasks = local.localSubtasks; }
  else { try { await api.call('subtasks.php','create',{cardId:c.id,title}); await reload(c); const fresh=cardById(c.id); if(fresh) c.subtasks=fresh.subtasks; } catch(e){ toast(e.message,'error'); } }
}
/* Pessoas oferecidas como responsável da subtarefa: equipe (se carregada) +
   quem já está no card (responsável, solicitantes, ajudantes). */
function subtaskPeople(c, local) {
  const set = new Set();
  if (local && Array.isArray(local.teamMembers)) local.teamMembers.forEach(n => n && set.add(n));
  if (c.assignee) set.add(c.assignee);
  (c.helpers || []).forEach(n => n && set.add(n));
  (local && local.helpers || []).forEach(n => n && set.add(n));
  (c.requestedBy || []).forEach(n => n && set.add(n));
  return [...set];
}

function renderSubtaskList(c, isNew, canEdit, local) {
  const listEl = $('#m-sub-list'); if (!listEl) return;
  const subs = isNew ? local.localSubtasks : c.subtasks;
  const people = subtaskPeople(c, local);
  const sprints = (state.sprints || []);
  // Detalhes (responsável/prazo/sprint) só em subtarefa JÁ salva e com permissão.
  const metaHTML = (s) => {
    if (isNew || !canEdit) return '';
    const personOpts = ['<option value="">👤 responsável…</option>']
      .concat(people.map(n => `<option value="${escapeHTML(n)}" ${s.assignee === n ? 'selected' : ''}>${escapeHTML(n)}</option>`)).join('');
    const sprintSel = sprints.length ? `
      <select class="select st-mini st-sprint" data-st-sprint="${escapeHTML(s.id)}" title="Incluir esta subtarefa num sprint">
        <option value="">🏃 sprint…</option>
        ${sprints.map(sp => `<option value="${escapeHTML(sp.id)}" ${s.sprintId === sp.id ? 'selected' : ''}>${escapeHTML(sp.name)}</option>`).join('')}
      </select>` : '';
    return `<div class="st-meta">
      <select class="select st-mini st-assignee" data-st-assignee="${escapeHTML(s.id)}" title="Responsável pela subtarefa">${personOpts}</select>
      <input class="input st-mini st-due" data-st-due="${escapeHTML(s.id)}" type="text" placeholder="📅 prazo" autocomplete="off">
      ${sprintSel}
    </div>`;
  };
  listEl.innerHTML = subs.map(s => `
    <div class="subtask-row${(isNew||!canEdit)?'':' has-meta'}">
      <div class="st-main">
        <input type="checkbox" data-st="${escapeHTML(s.id)}" ${s.done?'checked':''} ${canEdit?'':'disabled'}>
        <span class="st-title" style="${s.done?'text-decoration:line-through;opacity:.6;':''}">${escapeHTML(s.title)}</span>
        ${s.sprintId ? '<span class="st-badge" title="No sprint">🏃</span>' : ''}
        ${canEdit?`<button class="icon-btn" data-st-del="${escapeHTML(s.id)}" title="Remover">✕</button>`:''}
      </div>
      ${metaHTML(s)}
    </div>`).join('') || '<div class="text-muted text-sm" style="padding:4px 0;">Nenhuma subtarefa.</div>';
  const pct = subtaskPct(subs);
  $('#m-sub-progress') && ($('#m-sub-progress').style.width = pct + '%');
  $('#m-sub-count') && ($('#m-sub-count').textContent = subs.length ? `${subs.filter(s=>s.done).length}/${subs.length}` : '');
  // auto-progress
  if (c.progressMode === 'auto') { const pe=$('#m-progress'); if(pe){pe.value=pct; $('#m-progress-val').textContent=pct;} }
  // enable auto button if has subs
  const autoBtn = $('#m-pm-auto'); if (autoBtn) autoBtn.disabled = subs.length === 0;

  // Prazo da subtarefa (datepicker temático). Pré-preenche ANTES de ligar o
  // change para não disparar um save espúrio.
  listEl.querySelectorAll('.st-due').forEach(inp => {
    attachDatePicker(inp);
    const st = subs.find(x => x.id === inp.dataset.stDue);
    if (st && st.dueDate) setDatePickerValue(inp, st.dueDate);
    inp.addEventListener('change', async () => {
      const st2 = subs.find(x => x.id === inp.dataset.stDue);
      try { await api.call('subtasks.php','update',{ id: inp.dataset.stDue, dueDate: inp.dataset.iso || '' }); if (st2) st2.dueDate = inp.dataset.iso || null; }
      catch(e){ toast(e.message,'error'); }
    });
  });
  // Responsável da subtarefa
  listEl.querySelectorAll('.st-assignee').forEach(sel => sel.onchange = async () => {
    const st = subs.find(x => x.id === sel.dataset.stAssignee);
    try { await api.call('subtasks.php','update',{ id: sel.dataset.stAssignee, assignee: sel.value }); if (st) st.assignee = sel.value; }
    catch(e){ toast(e.message,'error'); }
  });
  // Sprint da subtarefa
  listEl.querySelectorAll('.st-sprint').forEach(sel => sel.onchange = async () => {
    const st = subs.find(x => x.id === sel.dataset.stSprint);
    try {
      await api.call('subtasks.php','update',{ id: sel.dataset.stSprint, sprintId: sel.value });
      if (st) st.sprintId = sel.value || null;
      renderSubtaskList(c, isNew, canEdit, local);   // atualiza o selo 🏃
      toast(sel.value ? 'Subtarefa incluída no sprint.' : 'Subtarefa removida do sprint.', 'success');
    } catch(e){ toast(e.message,'error'); }
  });

  listEl.querySelectorAll('[data-st]').forEach(cb => cb.onclick = async () => {
    if (isNew) { const s = local.localSubtasks.find(x=>x.id===cb.dataset.st); if(s) s.done=cb.checked; renderSubtaskList(c,isNew,canEdit,local); }
    else { try { await api.call('subtasks.php','toggle',{id:cb.dataset.st}); await reload(c); const f=cardById(c.id); if(f) c.subtasks=f.subtasks; renderSubtaskList(c,isNew,canEdit,local); } catch(e){ toast(e.message,'error'); cb.checked=!cb.checked; } }
  });
  listEl.querySelectorAll('[data-st-del]').forEach(b => b.onclick = async () => {
    if (isNew) { local.localSubtasks = local.localSubtasks.filter(x=>x.id!==b.dataset.stDel); c.subtasks=local.localSubtasks; renderSubtaskList(c,isNew,canEdit,local); }
    else { try { await api.call('subtasks.php','delete',{id:b.dataset.stDel}); await reload(c); const f=cardById(c.id); if(f) c.subtasks=f.subtasks; renderSubtaskList(c,isNew,canEdit,local); } catch(e){ toast(e.message,'error'); } }
  });
}

/* comments wiring */
function wireComments(c) {
  document.querySelectorAll('[data-collapse]').forEach(b => b.onclick = () => {
    const node = document.querySelector(`.comment[data-cmid="${CSS.escape(b.dataset.collapse)}"]`);
    if (!node) return;
    const collapsed = node.classList.toggle('collapsed');
    node.querySelectorAll(`[data-collapse="${CSS.escape(b.dataset.collapse)}"] `).forEach(()=>{});
    const pill = node.querySelector('.comment-collapse-pill');
    if (pill) pill.textContent = (collapsed ? '▸ ' : '▾ ') + pill.textContent.replace(/^[▸▾]\s*/, '');
  });
  document.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => replyEditor(b.dataset.reply, c));
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => inlineEdit(b.dataset.edit, c));
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const ok = await confirmDialog({ title:'Apagar comentário', message:'Deseja apagar este comentário?', confirmText:'Apagar', danger:true });
    if (!ok) return;
    try { await api.call('comments.php','delete',{id:b.dataset.del}); await reload(c); refreshComments(c); } catch(e){ toast(e.message,'error'); }
  });
  document.querySelectorAll('[data-react]').forEach(b => b.onclick = async () => {
    const [id,em]=b.dataset.react.split('|');
    try { await api.call('reactions.php','toggle',{commentId:id,emoji:em}); await reload(c); refreshComments(c); } catch(e){ toast(e.message,'error'); }
  });
  document.querySelectorAll('[data-react-add]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    document.querySelectorAll('.react-pop').forEach(p => p.remove());
    const emojis = ['👍','❤️','🎉','✅','👀','🔥','🙏','😄','🚀','💡'];
    const pop = document.createElement('div');
    pop.className = 'react-pop';
    pop.innerHTML = emojis.map(em => `<button type="button" data-emo="${em}">${em}</button>`).join('');
    document.body.appendChild(pop);
    const r = b.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
    pop.style.top  = (r.bottom + 4) + 'px';
    pop.querySelectorAll('[data-emo]').forEach(x => x.onclick = async () => {
      pop.remove();
      try { await api.call('reactions.php','toggle',{commentId:b.dataset.reactAdd,emoji:x.dataset.emo}); await reload(c); refreshComments(c); }
      catch (err) { toast(err.message, 'error'); }
    });
    const off = (ev) => { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', off, true); } };
    setTimeout(() => document.addEventListener('mousedown', off, true), 0);
  });
}
function replyEditor(parentId, c) {
  const node = document.querySelector(`.comment[data-cmid="${CSS.escape(parentId)}"] .comment-content`);
  if (!node || node.querySelector('.reply-wrap')) return;
  const w = document.createElement('div'); w.className='reply-wrap'; w.style.marginTop='8px';
  w.innerHTML = `<textarea rows="2" placeholder="Resposta…"></textarea>
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px;">
      <button class="btn btn-sm btn-ghost" data-c>Cancelar</button><button class="btn btn-sm btn-primary" data-s>Responder</button></div>`;
  node.appendChild(w);
  const ta = w.querySelector('textarea'); ta.focus();
  const submit = async () => {
    const text = ta.value.trim(); if(!text) return;
    try { await api.call('comments.php','create',{cardId:c.id,text,parentId}); await reload(c); refreshComments(c); } catch(e){ toast(e.message,'error'); }
  };
  w.querySelector('[data-c]').onclick = () => w.remove();
  w.querySelector('[data-s]').onclick = submit;
  ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === 'Escape') w.remove(); };
}
function inlineEdit(cmId, c) {
  const cm = c.comments.find(x=>x.id===cmId); if(!cm) return;
  const el = $('#ct-'+CSS.escape(cmId)); if(!el) return;
  el.innerHTML = `<textarea rows="3" style="width:100%;">${escapeHTML(cm.text)}</textarea>
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px;">
      <button class="btn btn-sm btn-ghost" data-c>Cancelar</button><button class="btn btn-sm btn-primary" data-s>Salvar</button></div>`;
  el.querySelector('[data-c]').onclick = () => refreshComments(c);
  el.querySelector('[data-s]').onclick = async () => {
    const text = el.querySelector('textarea').value.trim(); if(!text){toast('Vazio.','warn');return;}
    try { await api.call('comments.php','update',{id:cmId,text}); await reload(c); refreshComments(c); } catch(e){ toast(e.message,'error'); }
  };
}

async function reload(cardOrId) {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId?.id;
  if (!id) return;
  try {
    const d = await api.call('cards.php','get',{id},'GET');
    if (d?.card) {
      const i = state.cards.findIndex(x => x.id === id);
      if (i >= 0) state.cards[i] = d.card; else state.cards.push(d.card);
      // IMPORTANTE: atualiza o próprio objeto do modal (que é um clone),
      // senão a UI re-renderiza com dados antigos (ex.: comentário deletado).
      if (cardOrId && typeof cardOrId === 'object') {
        Object.keys(cardOrId).forEach(k => { delete cardOrId[k]; });
        Object.assign(cardOrId, d.card);
      }
    }
  } catch {}
}

/* ═══════════════ SAVE ═══════════════ */
async function save(c, isNew, local) {
  const title = $('#m-title').value.trim();
  if (!title) { toast('Título é obrigatório.', 'warn'); $('#m-title').focus(); return; }
  // Campos personalizados obrigatórios da equipe
  for (const el of document.querySelectorAll('[data-cf-id][data-cf-req="1"]')) {
    if (!String(el.value || '').trim()) {
      toast('Preencha os campos obrigatórios da equipe.', 'warn'); el.focus(); return;
    }
  }
  const missing = missingRequiredFields(c, local);
  if (missing.length) {
    toast(`Preencha: ${missing.join(', ')}.`, 'warn');
    return;
  }
  // Responsável precisa ser membro da equipe (se a lista foi carregada)
  const assigneeVal = $('#m-assignee').value.trim();
  if (assigneeVal && Array.isArray(local.teamMembers) && local.teamMembers.length
      && !local.teamMembers.some(n => n.toLowerCase() === assigneeVal.toLowerCase())) {
    toast('O responsável precisa ser um membro da equipe.', 'warn');
    $('#m-assignee').focus();
    return;
  }
  const gains = {
    horasMes:    numOrNull($('#m-g-hm')?.value),
    horasAno:    numOrNull($('#m-g-ha')?.value),
    economiaMes: numOrNull($('#m-g-em')?.value),
    economiaAno: numOrNull($('#m-g-ea')?.value),
    qualitativo: Array.from(document.querySelectorAll('#m-qual-wrap .gains-qual-tag')).map(t => t.textContent.replace('×','').trim()).filter(Boolean),
  };
  const body = {
    title,
    description: $('#m-desc').value,
    assignee: $('#m-assignee').value.trim(),
    columnId: $('#m-column').value,
    customValues: collectCustomValues(c),
    priority: $('#m-priority').value,
    projectionStatus: $('#m-status').value,
    progress: parseInt($('#m-progress').value,10)||0,
    progressMode: c.progressMode || 'manual',
    startDate: $('#m-start').dataset.iso || null,
    dueDate: $('#m-due').dataset.iso || null,
    tags: local.tags,
    requestedBy: local.requestedBy,
    helpers: local.helpers,
    color: local.color,
    estHours: numOrNull($('#m-est')?.value),
    spentHours: numOrNull($('#m-spent')?.value),
    recurrence: $('#m-recurrence')?.value || 'none',
    sprintId: $('#m-sprint') ? ($('#m-sprint').value || '') : (c.sprintId || ''),
    gains,
  };
  try {
    if (isNew) {
      body.teamId = state.currentTeamId || 'team-default';
      const res = await api.call('cards.php','create', body);
      const newId = res?.card?.id;
      // cria subtarefas locais
      if (newId && local.localSubtasks.length) {
        for (const s of local.localSubtasks) { try { await api.call('subtasks.php','create',{cardId:newId,title:s.title}); } catch {} }
      }
      if (res?.card) state.cards.push(res.card);
      toast('Card criado!','success');
    } else {
      const prevDone = _isDoneCol(c.columnId);
      const res = await api.call('cards.php','update', { ...body, id:c.id, revisionSeen:c.revision });
      if (res?.card) { const i=state.cards.findIndex(x=>x.id===res.card.id); if(i>=0) state.cards[i]=res.card; }
      toast('Salvo.','success');
      // 🎉 concluiu pelo modal (entrou na coluna final) → confete + Tobi comemora
      if (!prevDone && _isDoneCol(body.columnId)) {
        import('../ui/celebrate.js').then(m => m.celebrate(innerWidth/2, innerHeight*0.4)).catch(()=>{});
        window.Tobi && window.Tobi.cheer();
      }
    }
    closeModal(true);
    reRender();
  } catch (e) {
    if (e.status === 409 && e.payload?.current) {
      toast('Conflito: outro usuário editou. Recarregando…','warn');
      const i = state.cards.findIndex(x=>x.id===e.payload.current.id); if(i>=0) state.cards[i]=e.payload.current;
      closeModal(true); openCardModal(e.payload.current.id);
    } else toast(e.message,'error');
  }
}
function numOrNull(v) { return (v===''||v==null) ? null : (Number(v)||0); }
/* coluna "concluído": definida pela flag is_done (fallback: 'concluido' / maior posição) */
function _isDoneCol(colId) {
  const cols = state.columns || [];
  const col = cols.find(c => c.id === colId);
  if (col) return !!Number(col.is_done);
  if (colId === 'concluido') return true;
  if (!cols.length) return false;
  const flagged = cols.find(c => Number(c.is_done));
  if (flagged) return flagged.id === colId;
  const last = cols.reduce((a,b) => (b.position > a.position ? b : a), cols[0]);
  return !!last && last.id === colId;
}
