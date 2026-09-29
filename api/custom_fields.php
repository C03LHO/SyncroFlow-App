<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/custom_fields.php (v23)
   Campos personalizados MODULARES por equipe. Cada equipe define
   seus próprios campos do card (nome, tipo, opções, obrigatório,
   oculto, posição). Quem gerencia: Gestor / TI da equipe / TI-Dev.
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
require_once __DIR__ . '/../lib/teams.php';

$u = require_login();
$action = $_GET['action'] ?? 'list';
$body = json_in();

/** Pode gerenciar os campos desta equipe? (gestor / TI da equipe / TI-Dev) */
function _can_manage_fields(array $u, string $teamId): bool {
    if (($u['role'] ?? '') === 'ti') return true;                 // TI-Dev: bypass
    $er = effective_team_role($teamId, $u);
    return $er && can_in_team($er, 'manage_team');
}
const CF_TYPES = ['text','number','date','select'];  // bate com o CHECK do schema
const CF_MAX_ON_CARD = 2;   // no máx. 2 campos destacados no card

/** Quantos campos da equipe já estão marcados como "destaque no card" (excluindo um id). */
function _cf_oncard_count(string $teamId, string $excludeId = ''): int {
    return (int)scalar(
        "SELECT COUNT(*) FROM custom_fields WHERE team_id = ? AND show_on_card = 1 AND id <> ?",
        [$teamId, $excludeId]
    );
}

switch ($action) {

/* Lista os campos de uma equipe (qualquer membro logado pode ler — usado p/ render). */
case 'list': {
    $teamId = (string)($_GET['team_id'] ?? $body['team_id'] ?? '');
    if ($teamId === '') json_out(['customFields' => []]);
    json_out(['customFields' => all(
        "SELECT id, team_id, name, type, options, required, hidden, as_filter, show_on_card, position
         FROM custom_fields WHERE team_id = ? ORDER BY position, name", [$teamId])]);
}

case 'create': {
    $teamId = (string)($body['team_id'] ?? '');
    if ($teamId === '') error_response('Equipe obrigatória.', 400);
    if (!_can_manage_fields($u, $teamId)) error_response('Sem permissão para configurar campos desta equipe.', 403);
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '') error_response('Nome do campo é obrigatório.', 400);
    $type = (string)($body['type'] ?? 'text');
    if (!in_array($type, CF_TYPES, true)) $type = 'text';
    $onCard = !empty($body['showOnCard']) ? 1 : 0;
    if ($onCard && _cf_oncard_count($teamId) >= CF_MAX_ON_CARD)
        error_response('Só é possível destacar até ' . CF_MAX_ON_CARD . ' campos no card. Desmarque um antes.', 400);
    $id  = uid();
    $pos = (int)scalar("SELECT COALESCE(MAX(position),-1)+1 FROM custom_fields WHERE team_id=?", [$teamId]);
    q("INSERT INTO custom_fields (id, team_id, name, type, options, required, hidden, as_filter, show_on_card, created_by, created_at, position)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
        $id, $teamId, $name, $type,
        json_encode(array_values(array_filter((array)($body['options'] ?? []))), JSON_UNESCAPED_UNICODE),
        !empty($body['required']) ? 1 : 0,
        !empty($body['hidden'])   ? 1 : 0,
        !empty($body['asFilter']) ? 1 : 0,
        $onCard,
        $u['name'], now_iso(), $pos,
    ]);
    bump_revision('team', $teamId, 'fields');
    json_out(['field' => one("SELECT * FROM custom_fields WHERE id=?", [$id])], 201);
}

case 'update': {
    $id = (string)($body['id'] ?? '');
    $f  = one("SELECT * FROM custom_fields WHERE id=?", [$id]);
    if (!$f) error_response('Campo não encontrado.', 404);
    if (!_can_manage_fields($u, (string)$f['team_id'])) error_response('Sem permissão.', 403);
    $name = trim((string)($body['name'] ?? $f['name']));
    if ($name === '') error_response('Nome do campo é obrigatório.', 400);
    $type = (string)($body['type'] ?? $f['type']);
    if (!in_array($type, CF_TYPES, true)) $type = $f['type'];
    $onCard = array_key_exists('showOnCard', $body) ? (!empty($body['showOnCard']) ? 1 : 0) : (int)($f['show_on_card'] ?? 0);
    if ($onCard && _cf_oncard_count((string)$f['team_id'], $id) >= CF_MAX_ON_CARD)
        error_response('Só é possível destacar até ' . CF_MAX_ON_CARD . ' campos no card. Desmarque um antes.', 400);
    q("UPDATE custom_fields SET name=?, type=?, options=?, required=?, hidden=?, as_filter=?, show_on_card=? WHERE id=?", [
        $name, $type,
        json_encode(array_values(array_filter((array)($body['options'] ?? json_decode($f['options'] ?: '[]', true)))), JSON_UNESCAPED_UNICODE),
        !empty($body['required']) ? 1 : 0,
        !empty($body['hidden'])   ? 1 : 0,
        array_key_exists('asFilter', $body) ? (!empty($body['asFilter']) ? 1 : 0) : (int)($f['as_filter'] ?? 0),
        $onCard,
        $id,
    ]);
    bump_revision('team', (string)$f['team_id'], 'fields');
    json_out(['field' => one("SELECT * FROM custom_fields WHERE id=?", [$id])]);
}

case 'reorder': {
    $teamId = (string)($body['team_id'] ?? '');
    $ids = (array)($body['ids'] ?? []);
    if (!$teamId || !$ids) error_response('Dados inválidos.', 400);
    if (!_can_manage_fields($u, $teamId)) error_response('Sem permissão.', 403);
    tx(function () use ($ids, $teamId) {
        foreach (array_values($ids) as $i => $fid) {
            q("UPDATE custom_fields SET position=? WHERE id=? AND team_id=?", [$i, $fid, $teamId]);
        }
    });
    bump_revision('team', $teamId, 'fields');
    json_out(['ok' => true]);
}

case 'delete': {
    $id = (string)($body['id'] ?? '');
    $f  = one("SELECT team_id FROM custom_fields WHERE id=?", [$id]);
    if (!$f) json_out(['ok' => true]);
    if (!_can_manage_fields($u, (string)$f['team_id'])) error_response('Sem permissão.', 403);
    q("DELETE FROM custom_fields WHERE id=?", [$id]);   // card_custom_values cai por FK
    bump_revision('team', (string)$f['team_id'], 'fields');
    json_out(['ok' => true]);
}

default: error_response('action_invalida', 400);
}
