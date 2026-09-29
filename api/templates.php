<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/templates.php
   Modelos de card por equipe (título, descrição, prioridade, tags,
   subtarefas, esforço). Gestor / TI da equipe / TI-Dev gerenciam.
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/teams.php';

$u = require_login();
$action = $_GET['action'] ?? 'list';
$body = json_in();

function _tpl_can(array $u, string $teamId): bool {
    return in_array($u['role'], ['ti','suporte'], true) || is_team_member($teamId, $u['user_id']);
}

switch ($action) {

case 'list': {
    $teamId = (string)($_GET['team_id'] ?? $body['team_id'] ?? '');
    if ($teamId === '') json_out(['templates' => []]);
    json_out(['templates' => all(
        "SELECT id, name, data FROM card_templates WHERE team_id = ? ORDER BY name", [$teamId])]);
}

case 'create': {
    $teamId = (string)($body['team_id'] ?? '');
    $name   = trim((string)($body['name'] ?? ''));
    if ($teamId === '' || $name === '') error_response('Equipe e nome são obrigatórios.', 400);
    if (!_tpl_can($u, $teamId)) error_response('Sem permissão.', 403);
    $data = is_array($body['data'] ?? null) ? $body['data'] : [];
    $id = 'tpl-' . bin2hex(random_bytes(5));
    q("INSERT INTO card_templates (id, team_id, name, data, created_by, created_at) VALUES (?,?,?,?,?,?)",
      [$id, $teamId, mb_substr($name, 0, 60), json_encode($data, JSON_UNESCAPED_UNICODE), $u['name'], now_iso()]);
    json_out(['ok' => true, 'id' => $id], 201);
}

case 'delete': {
    $id = (string)($body['id'] ?? '');
    $t = one("SELECT team_id FROM card_templates WHERE id=?", [$id]);
    if ($t && !_tpl_can($u, (string)$t['team_id'])) error_response('Sem permissão.', 403);
    q("DELETE FROM card_templates WHERE id=?", [$id]);
    json_out(['ok' => true]);
}

default: error_response('action_invalida', 400);
}
