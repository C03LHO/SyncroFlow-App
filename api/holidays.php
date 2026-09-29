<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/holidays.php
   Leitura dos feriados/dias facultativos para o calendário.
   (A edição é feita em admin.php — TI-Dev e TI-Sup.)
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/holidays.php';

require_login();
$action = $_GET['action'] ?? 'list';

switch ($action) {
    case 'list':
        json_out([
            'holidays' => holidays_all(),
            'cities'   => holidays_cities(),
        ]);
    default:
        error_response('action_invalida', 400);
}
