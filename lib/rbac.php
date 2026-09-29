<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/rbac.php
   4 papéis: ti, gestor, analista, visitante
   Espelha o ROLE_PERMISSIONS do index.html original.
   ═══════════════════════════════════════════════════════════ */

const ROLE_PERMISSIONS = [
    // TI – Dev: super-admin global ("dono" do sistema). Bypassa tudo.
    'ti' => [
        'view','export','create','edit','delete','archive','comment',
        'manage_users','manage_columns','manage_fields','manage_teams','approve',
        'delegate','maintenance','manage_system',
    ],
    // TI (suporte de sistema): poderes operacionais amplos, SEM config crítica
    // do sistema (manutenção, backups, campos do card, Visão) nem exclusões.
    'suporte' => [
        'view','export','create','edit','archive','comment',
        'manage_users','manage_columns','manage_teams','approve','delegate','create_teams',
    ],
    'gestor' => [
        'view','export','create','edit','archive','comment','approve','delegate',
        'create_teams',
    ],
    'analista' => [
        'view','export','create','edit','comment',
    ],
    'visitante' => [
        'view','export',
    ],
];

const ROLE_LABELS = [
    'ti'        => 'TI – Dev',
    'suporte'   => 'TI - Sup',
    'gestor'    => 'Gestor',
    'analista'  => 'Analista',
    'visitante' => 'Visitante',
];

/** Rótulo curto para badges. */
const ROLE_BADGE = [
    'ti'        => 'TI–Dev',
    'suporte'   => 'TI-Sup',
    'gestor'    => 'Gestor',
    'analista'  => 'Analista',
    'visitante' => 'Visitante',
];

/** Verifica se um papel tem permissão para uma ação. */
function can(string $role, string $action): bool {
    $perms = ROLE_PERMISSIONS[$role] ?? [];
    return in_array($action, $perms, true);
}

/** Lista de todos os papéis válidos (para combo boxes etc.). */
function all_roles(): array {
    return array_keys(ROLE_PERMISSIONS);
}
