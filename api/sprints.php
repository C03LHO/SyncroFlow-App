<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/sprints.php (#6)
   Sprints por equipe: criar, editar, fechar/excluir e escolher
   quais cards entram no sprint. Gestão: Gestor/TI da equipe.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
require_once __DIR__ . '/../lib/teams.php';

$u = require_login();
$action = $_GET['action'] ?? 'list';
$body  = json_in();
$param = fn($k, $d = null) => $body[$k] ?? $_GET[$k] ?? $d;

function _sprint_team(string $id): ?string {
    $t = scalar("SELECT team_id FROM sprints WHERE id = ?", [$id]);
    return $t === false ? null : (string)$t;
}
function _sprint_guard(?string $teamId, array $u): void {
    if (!$teamId) error_response('sprint_nao_encontrado', 404);
    $r = effective_team_role($teamId, $u);
    if (!$r || !can_in_team($r, 'manage_team')) {
        error_response('Sem permissão para gerenciar sprints desta equipe.', 403);
    }
}
/** Sprint + progresso. ITENS do sprint = cards + subtarefas marcadas no sprint
 *  (controle de progresso mais fino). Concluído: card na coluna de Concluído ou
 *  subtarefa marcada como feita. */
function _sprint_hydrate(array $s): array {
    $done = team_done_column_id((string)$s['team_id']);
    $cardTotal = (int)scalar("SELECT COUNT(*) FROM cards WHERE sprint_id = ? AND archived = 0", [$s['id']]);
    $cardConcl = (int)scalar("SELECT COUNT(*) FROM cards WHERE sprint_id = ? AND archived = 0 AND column_id = ?", [$s['id'], $done]);
    $subTotal = (int)scalar("SELECT COUNT(*) FROM subtasks st JOIN cards c ON c.id = st.card_id
                             WHERE st.sprint_id = ? AND c.archived = 0", [$s['id']]);
    $subConcl = (int)scalar("SELECT COUNT(*) FROM subtasks st JOIN cards c ON c.id = st.card_id
                             WHERE st.sprint_id = ? AND c.archived = 0 AND st.done = 1", [$s['id']]);
    $total = $cardTotal + $subTotal;
    $concl = $cardConcl + $subConcl;
    $s['card_count']    = $cardTotal;
    $s['subtask_count'] = $subTotal;
    $s['item_count']    = $total;
    $s['concluded']     = $concl;
    $s['progress']      = $total ? (int)round($concl / $total * 100) : 0;
    return $s;
}

switch ($action) {

case 'list': {
    $teamId = (string)$param('team', $param('team_id', ''));
    $rows = all("SELECT * FROM sprints WHERE team_id = ?
                 ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, end_date", [$teamId]);
    json_out(['sprints' => array_map('_sprint_hydrate', $rows)]);
}

case 'create': {
    $teamId = (string)$param('team_id', '');
    _sprint_guard($teamId, $u);
    $name = trim((string)$param('name', ''));
    if ($name === '') error_response('Nome do sprint é obrigatório.', 400);
    $id = 'sprint-' . uid();
    q("INSERT INTO sprints (id, team_id, name, start_date, end_date, goal, status, created_at)
       VALUES (?,?,?,?,?,?, 'active', ?)", [
        $id, $teamId, $name,
        ((string)$param('start_date', '')) ?: null,
        ((string)$param('end_date', '')) ?: null,
        (int)$param('goal', 0),
        now_iso(),
    ]);
    bump_revision('sprint', $id, 'create');
    json_out(['sprint' => _sprint_hydrate(one("SELECT * FROM sprints WHERE id = ?", [$id]))], 201);
}

case 'update': {
    $id = (string)$param('id', '');
    _sprint_guard(_sprint_team($id), $u);
    $set = []; $p = [];
    foreach (['name','start_date','end_date','goal','status'] as $k) {
        if (!array_key_exists($k, $body)) continue;
        if ($k === 'goal')        { $set[] = "goal = ?";   $p[] = (int)$body[$k]; }
        elseif ($k === 'name')    { $set[] = "name = ?";   $p[] = trim((string)$body[$k]) ?: 'Sprint'; }
        elseif ($k === 'status')  { $set[] = "status = ?"; $p[] = in_array($body[$k], ['active','closed'], true) ? $body[$k] : 'active'; }
        else                      { $set[] = "$k = ?";     $p[] = ((string)$body[$k]) ?: null; }
    }
    if ($set) { $p[] = $id; q("UPDATE sprints SET " . implode(', ', $set) . " WHERE id = ?", $p); }
    bump_revision('sprint', $id, 'update');
    json_out(['sprint' => _sprint_hydrate(one("SELECT * FROM sprints WHERE id = ?", [$id]))]);
}

case 'delete': {
    $id = (string)$param('id', '');
    _sprint_guard(_sprint_team($id), $u);
    tx(function () use ($id) {
        q("UPDATE cards SET sprint_id = NULL WHERE sprint_id = ?", [$id]);
        q("UPDATE subtasks SET sprint_id = NULL WHERE sprint_id = ?", [$id]);
        q("DELETE FROM sprints WHERE id = ?", [$id]);
    });
    bump_revision('sprint', $id, 'delete');
    json_out(['ok' => true]);
}

/* Define EXATAMENTE quais cards pertencem ao sprint (replace-all). */
case 'set_cards': {
    $id = (string)$param('id', '');
    $teamId = _sprint_team($id);
    _sprint_guard($teamId, $u);
    $cardIds = $param('card_ids', []);
    if (!is_array($cardIds)) $cardIds = [];
    // Cards afetados = os que JÁ estavam no sprint + os novos válidos selecionados.
    $affected = array_column(all("SELECT id FROM cards WHERE sprint_id = ?", [$id]), 'id');
    tx(function () use ($id, $teamId, $cardIds, &$affected) {
        q("UPDATE cards SET sprint_id = NULL WHERE sprint_id = ?", [$id]);
        foreach ($cardIds as $cid) {
            $cid = (string)$cid;
            if (scalar("SELECT id FROM cards WHERE id = ? AND team_id = ?", [$cid, $teamId]) === false) continue;
            q("UPDATE cards SET sprint_id = ? WHERE id = ?", [$id, $cid]);
            $affected[] = $cid;
        }
    });
    // Propaga como mudança de CADA card para o polling atualizar o quadro de todos.
    // (O front só aplica eventos de 'card'; sem isto o sprintId ficava velho na tela
    //  até reabrir o card — era exatamente o bug relatado.)
    foreach (array_unique($affected) as $cid) bump_revision('card', $cid, 'update');
    bump_revision('sprint', $id, 'set_cards');
    json_out([
        'sprint'   => _sprint_hydrate(one("SELECT * FROM sprints WHERE id = ?", [$id])),
        'affected' => array_values(array_unique($affected)),
    ]);
}

default: error_response('action_invalida', 400);
}
