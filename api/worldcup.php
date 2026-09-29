<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/worldcup.php (#6)
   Leitura dos jogos da Copa do Mundo (Brasil + placares) para o
   Calendário. A EDIÇÃO é feita no painel admin (admin.php), que
   pode ser usado por TI-Dev e TI-Sup.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/_bootstrap.php';

$u      = require_login();
$action = $_GET['action'] ?? 'list';

switch ($action) {

/* Lista jogos + estado do "Modo Copa" (qualquer usuário logado). */
case 'list': {
    $enabled = scalar("SELECT value FROM system_config WHERE key = 'worldcup_enabled'") === '1';
    $matches = all("SELECT id, match_date, match_time, name, stage, brazil, result
                    FROM worldcup_matches ORDER BY match_date, match_time, position");
    json_out(['enabled' => $enabled, 'matches' => $matches]);
}

default:
    error_response('action_invalida', 400);
}
