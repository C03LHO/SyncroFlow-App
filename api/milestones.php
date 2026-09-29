<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/milestones.php
   Marcos (milestones) por equipe, exibidos no Gantt.
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/teams.php';

$u = require_login();
$action = $_GET['action'] ?? 'list';
$body = json_in();

function _ms_can(array $u, string $teamId): bool {
    return in_array($u['role'], ['ti','suporte'], true) || is_team_member($teamId, $u['user_id']);
}

switch ($action) {

case 'list': {
    $teamId = (string)($_GET['team_id'] ?? $body['team_id'] ?? '');
    if ($teamId === '') json_out(['milestones' => []]);
    json_out(['milestones' => all(
        "SELECT id, name, date, color FROM milestones WHERE team_id = ? ORDER BY date", [$teamId])]);
}

case 'create': {
    $teamId = (string)($body['team_id'] ?? '');
    $name   = trim((string)($body['name'] ?? ''));
    $date   = trim((string)($body['date'] ?? ''));
    if ($teamId === '' || $name === '') error_response('Equipe e nome obrigatórios.', 400);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) error_response('Data inválida (AAAA-MM-DD).', 400);
    if (!_ms_can($u, $teamId)) error_response('Sem permissão.', 403);
    $id = 'ms-' . bin2hex(random_bytes(5));
    $color = preg_match('/^#[0-9a-fA-F]{6}$/', (string)($body['color'] ?? '')) ? $body['color'] : '#d97757';
    q("INSERT INTO milestones (id, team_id, name, date, color, created_at) VALUES (?,?,?,?,?,?)",
      [$id, $teamId, mb_substr($name, 0, 60), $date, $color, now_iso()]);
    json_out(['ok' => true, 'id' => $id], 201);
}

case 'update': {
    $id = (string)($body['id'] ?? '');
    $m = one("SELECT team_id FROM milestones WHERE id=?", [$id]);
    if (!$m) error_response('Marco não encontrado.', 404);
    if (!_ms_can($u, (string)$m['team_id'])) error_response('Sem permissão.', 403);
    $set = []; $p = [];
    if (array_key_exists('name', $body)) { $n = trim((string)$body['name']); if ($n === '') error_response('Nome obrigatório.', 400); $set[] = 'name=?'; $p[] = mb_substr($n, 0, 60); }
    if (array_key_exists('date', $body)) { $d = trim((string)$body['date']); if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) error_response('Data inválida.', 400); $set[] = 'date=?'; $p[] = $d; }
    if (array_key_exists('color', $body)) { $c = (string)$body['color']; $set[] = 'color=?'; $p[] = preg_match('/^#[0-9a-fA-F]{6}$/', $c) ? $c : '#d97757'; }
    if ($set) { $p[] = $id; q("UPDATE milestones SET " . implode(',', $set) . " WHERE id=?", $p); }
    json_out(['ok' => true]);
}

case 'delete': {
    $id = (string)($body['id'] ?? '');
    $m = one("SELECT team_id FROM milestones WHERE id=?", [$id]);
    if ($m && !_ms_can($u, (string)$m['team_id'])) error_response('Sem permissão.', 403);
    q("DELETE FROM milestones WHERE id=?", [$id]);
    json_out(['ok' => true]);
}

default: error_response('action_invalida', 400);
}
