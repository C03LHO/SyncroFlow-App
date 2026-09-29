<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/automations.php
   CRUD de regras de automação por equipe. Gerencia: Gestor / TI da
   equipe / TI-Dev.
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/teams.php';
require_once __DIR__ . '/../lib/automations.php';

$u = require_login();
$action = $_GET['action'] ?? 'list';
$body = json_in();

function _auto_can(array $u, string $teamId): bool {
    if (in_array($u['role'], ['ti', 'suporte'], true)) return true;
    $r = effective_team_role($teamId, $u);
    return $r && can_in_team($r, 'manage_team');
}

switch ($action) {

case 'list': {
    $teamId = (string)($_GET['team_id'] ?? $body['team_id'] ?? '');
    if ($teamId === '') json_out(['automations' => []]);
    json_out(['automations' => all(
        "SELECT id, team_id, name, enabled, trigger_type, trigger_value, action_type, action_value
         FROM automations WHERE team_id = ? ORDER BY created_at", [$teamId])]);
}

case 'create': {
    $teamId = (string)($body['team_id'] ?? '');
    if ($teamId === '' || !_auto_can($u, $teamId)) error_response('Sem permissão.', 403);
    $name = trim((string)($body['name'] ?? ''));
    $tt = (string)($body['triggerType'] ?? '');
    $at = (string)($body['actionType'] ?? '');
    if ($name === '') error_response('Dê um nome à automação.', 400);
    if (!in_array($tt, AUTOMATION_TRIGGERS, true)) error_response('Gatilho inválido.', 400);
    if (!in_array($at, AUTOMATION_ACTIONS, true)) error_response('Ação inválida.', 400);
    $id = 'aut-' . bin2hex(random_bytes(5));
    q("INSERT INTO automations (id, team_id, name, enabled, trigger_type, trigger_value, action_type, action_value, created_by, created_at)
       VALUES (?,?,?,1,?,?,?,?,?,?)", [
        $id, $teamId, mb_substr($name, 0, 60), $tt,
        (string)($body['triggerValue'] ?? ''), $at, (string)($body['actionValue'] ?? ''),
        $u['name'], now_iso(),
    ]);
    json_out(['ok' => true, 'id' => $id], 201);
}

case 'update': {
    $id = (string)($body['id'] ?? '');
    $a = one("SELECT team_id FROM automations WHERE id=?", [$id]);
    if (!$a) error_response('Automação não encontrada.', 404);
    if (!_auto_can($u, (string)$a['team_id'])) error_response('Sem permissão.', 403);
    $set = []; $p = [];
    if (array_key_exists('name', $body))        { $set[] = 'name=?';          $p[] = mb_substr(trim((string)$body['name']), 0, 60); }
    if (array_key_exists('enabled', $body))     { $set[] = 'enabled=?';       $p[] = !empty($body['enabled']) ? 1 : 0; }
    if (array_key_exists('triggerType', $body) && in_array($body['triggerType'], AUTOMATION_TRIGGERS, true)) { $set[] = 'trigger_type=?'; $p[] = $body['triggerType']; }
    if (array_key_exists('triggerValue', $body)){ $set[] = 'trigger_value=?'; $p[] = (string)$body['triggerValue']; }
    if (array_key_exists('actionType', $body) && in_array($body['actionType'], AUTOMATION_ACTIONS, true)) { $set[] = 'action_type=?'; $p[] = $body['actionType']; }
    if (array_key_exists('actionValue', $body)) { $set[] = 'action_value=?';  $p[] = (string)$body['actionValue']; }
    if ($set) { $p[] = $id; q("UPDATE automations SET " . implode(',', $set) . " WHERE id=?", $p); }
    json_out(['ok' => true]);
}

case 'delete': {
    $id = (string)($body['id'] ?? '');
    $a = one("SELECT team_id FROM automations WHERE id=?", [$id]);
    if ($a && !_auto_can($u, (string)$a['team_id'])) error_response('Sem permissão.', 403);
    q("DELETE FROM automations WHERE id=?", [$id]);
    json_out(['ok' => true]);
}

default: error_response('action_invalida', 400);
}
