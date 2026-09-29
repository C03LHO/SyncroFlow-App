/* ═══ SyncroFlow — js/core/state.js ═══ */
import { emit } from './events.js';

export const state = {
  revision: 0,
  currentUser: null,
  teams: [],
  currentTeamId: 'team-default',
  columns: [],
  sprints: [],
  cards: [],
  users: {},
  people: [],
  customFields: [],
  notices: [],
  notifications: [],
  teamGoal: null,
  visionConfig: null,
  maintenanceMode: null,
  duplicateDetection: null,
  achievements: {},
  monthlyPerformance: {},
  system: {},
  view: 'board',
  filters: {},
};

export function initState(snapshot) {
  Object.assign(state, snapshot || {});
  state.cards   = snapshot?.cards || [];
  state.columns = snapshot?.columns || [];
  emit('state:ready', state);
}

/** Aplica um evento delta recebido do polling. */
export function applyEvent(ev) {
  const id = ev.entityId;
  switch (ev.entityType) {
    case 'card': {
      const idx = state.cards.findIndex(c => c.id === id);
      if (ev.action === 'delete') {
        if (idx >= 0) state.cards.splice(idx, 1);
      } else if (ev.payload) {
        // Só aplica cards da equipe ativa (não polui o board com outra equipe)
        if (ev.payload.teamId && ev.payload.teamId !== state.currentTeamId) {
          if (idx >= 0) state.cards.splice(idx, 1);
          break;
        }
        if (idx >= 0) state.cards[idx] = ev.payload;
        else state.cards.push(ev.payload);
      } else {
        // Sem payload + ação não-delete → o servidor filtrou (ex: outro usuário
        // arquivou um card que não nos pertence). Remove do nosso cache local.
        if (idx >= 0) state.cards.splice(idx, 1);
      }
      break;
    }
    case 'column': {
      const idx = state.columns.findIndex(c => c.id === id);
      if (ev.action === 'delete') {
        if (idx >= 0) state.columns.splice(idx, 1);
      } else if (ev.payload) {
        // Só aplica colunas da equipe ativa (não mistura colunas de outras
        // equipes nem do quadro pessoal no board atual).
        const tid = ev.payload.teamId ?? ev.payload.team_id;
        if (tid && tid !== state.currentTeamId) {
          if (idx >= 0) state.columns.splice(idx, 1);
          break;
        }
        if (idx >= 0) state.columns[idx] = ev.payload;
        else state.columns.push(ev.payload);
      }
      break;
    }
    case 'notice': {
      const idx = state.notices.findIndex(n => n.id === id);
      if (ev.action === 'delete') { if (idx>=0) state.notices.splice(idx,1); }
      else if (ev.payload) {
        if (idx>=0) state.notices[idx] = ev.payload;
        else state.notices.unshift(ev.payload);
      }
      break;
    }
    case 'notification': {
      if (ev.action === 'delete') {
        const idx = state.notifications.findIndex(n => n.id === id);
        if (idx>=0) state.notifications.splice(idx,1);
      } else if (ev.payload) {
        state.notifications.unshift(ev.payload);
      }
      break;
    }
  }
  emit('state:changed', { event: ev });
}

/** Card por id (helper). */
export function cardById(id) { return state.cards.find(c => c.id === id); }

/**
 * Coluna "concluído" da EQUIPE ATIVA: id literal 'concluido' OU a coluna de
 * MAIOR posição (equipes customizadas têm ids tipo '<equipe>-concluido').
 * Centraliza a detecção para KPIs, atraso, calendário, gantt, etc.
 */
export function isDoneColumn(colId) {
  if (!colId) return false;
  if (colId === 'concluido') return true;
  const cols = state.columns || [];
  if (!cols.length) return false;
  let last = cols[0];
  for (const c of cols) if ((c.position ?? 0) > (last.position ?? 0)) last = c;
  return !!last && last.id === colId;
}

/* Rótulos */
const TEAM_ROLE_LABELS   = { gestor:'Gestor', ti:'TI da equipe', analista:'Analista', visitante:'Visitante' };
const GLOBAL_ROLE_LABELS = { ti:'TI - Dev', suporte:'TI - Sup' };

/**
 * Cargo CONTEXTUAL: o papel do usuário NA equipe ativa do team-switcher.
 * Em equipes mostra Gestor/TI da equipe/Analista/Visitante; em quadros
 * pessoais/organização cai para o nível global (TI - Dev / TI - Sup / Usuário Padrão).
 * Retorna { label, cls, scope:'team'|'global' }.
 */
export function activeRoleInfo() {
  const t = (state.teams || []).find(x => x.id === state.currentTeamId);
  const gRole = state.currentUser?.role || '';
  // Só equipes "de verdade" definem cargo contextual; pessoal/organização usam o nível global.
  if (t && t.type === 'team' && t.my_role) {
    return { label: TEAM_ROLE_LABELS[t.my_role] || t.my_role, cls: 'role-' + t.my_role, scope: 'team' };
  }
  return {
    label: GLOBAL_ROLE_LABELS[gRole] || 'Usuário Padrão',
    cls: 'role-' + (gRole || 'analista'),
    scope: 'global',
  };
}

/** Troca a equipe ativa: recarrega cards/colunas daquela equipe. */
export async function switchTeam(teamId) {
  const base = window.__CONFIG__?.apiBase || '/api';
  const res = await fetch(`${base}/state.php?team=${encodeURIComponent(teamId)}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Falha ao trocar de equipe.');
  const snap = await res.json();
  state.currentTeamId = snap.currentTeamId || teamId;
  state.columns = snap.columns || [];
  state.sprints = snap.sprints || [];
  state.cards   = snap.cards || [];
  state.teams   = snap.teams || state.teams;
  state.revision = snap.revision || state.revision;
  // Config POR EQUIPE — atualiza ao trocar de equipe
  if (snap.teamGoal) state.teamGoal = snap.teamGoal;
  if (snap.visionConfig !== undefined) state.visionConfig = snap.visionConfig;
  if (snap.system) state.system = snap.system;
  state.customFields = snap.customFields || [];   // campos personalizados da equipe ativa
  localStorage.setItem('syncro_team', state.currentTeamId);
  emit('team:changed', state.currentTeamId);
  emit('state:changed', { event: { entityType: 'team', action: 'switch' } });
}
