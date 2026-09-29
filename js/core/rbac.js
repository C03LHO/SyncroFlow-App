/* ═══ SyncroFlow — js/core/rbac.js (espelho UI) ═══ */
export const ROLE_PERMISSIONS = {
  ti:        ['view','export','create','edit','delete','archive','comment',
              'manage_users','manage_columns','manage_fields','manage_teams','approve','delegate','maintenance','manage_system'],
  suporte:   ['view','export','create','edit','archive','comment',
              'manage_users','manage_columns','manage_teams','approve','delegate','create_teams'],
  gestor:    ['view','export','create','edit','archive','comment','approve','delegate','create_teams'],
  analista:  ['view','export','create','edit','comment'],
  visitante: ['view','export'],
};
export const ROLE_LABELS = { ti:'TI – Dev', suporte:'TI - Sup', gestor:'Gestor', analista:'Analista', visitante:'Visitante' };
export function can(role, action) {
  return (ROLE_PERMISSIONS[role] || []).includes(action);
}
