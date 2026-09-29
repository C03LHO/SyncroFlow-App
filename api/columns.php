<?php
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
require_once __DIR__ . '/../lib/teams.php';
$u = require_login();
$action = $_GET['action'] ?? 'list';
$body = json_in();

function _col_team(string $colId): ?string {
    $t = scalar("SELECT team_id FROM columns WHERE id = ?", [$colId]);
    if ($t === false) return null;
    return $t ?: 'team-default';
}
function _col_guard(string $teamId, array $u): void {
    $r = effective_team_role($teamId, $u);
    if (!$r || !can_in_team($r, 'manage_columns')) {
        error_response('Sem permissão para gerenciar colunas desta equipe.', 403);
    }
}

switch ($action) {
case 'list': {
    $teamId = (string)($_GET['team'] ?? 'team-default');
    json_out(['columns' => all("SELECT * FROM columns WHERE team_id = ? ORDER BY position", [$teamId])]);
}

case 'create': {
    $teamId = (string)($body['teamId'] ?? 'team-default');
    _col_guard($teamId, $u);
    $id = (string)(($body['id'] ?? '') ?: uid());
    $pos = (int)scalar("SELECT COALESCE(MAX(position),-1)+1 FROM columns WHERE team_id = ?", [$teamId]);
    q("INSERT INTO columns (id, team_id, name, wip_limit, is_backlog, color, icon, position)
       VALUES (?,?,?,?,?,?,?,?)", [
        $id, $teamId, (string)($body['name'] ?? 'Nova coluna'),
        isset($body['wipLimit']) ? (int)$body['wipLimit'] : null,
        (int)(bool)($body['isBacklog'] ?? false),
        (string)($body['color'] ?? '#10b981'),
        (string)($body['icon']  ?? '📂'),
        $pos,
    ]);
    bump_revision('column', $id, 'create');
    json_out(['column' => one("SELECT * FROM columns WHERE id=?", [$id])], 201);
}
case 'update': {
    $id = (string)($body['id'] ?? '');
    if (!$id) error_response('id_obrigatorio', 400);
    _col_guard(_col_team($id), $u);
    $set=[]; $params=[];
    foreach (['name','color','icon','wipLimit','isBacklog'] as $k) {
        if (!array_key_exists($k,$body)) continue;
        $col = ['name'=>'name','color'=>'color','icon'=>'icon','wipLimit'=>'wip_limit','isBacklog'=>'is_backlog'][$k];
        $val = $k==='wipLimit' ? (isset($body[$k]) ? (int)$body[$k] : null)
             : ($k==='isBacklog' ? (int)(bool)$body[$k] : (string)$body[$k]);
        $set[]="$col = ?"; $params[]=$val;
    }
    if ($set) {
        $params[]=$id;
        q("UPDATE columns SET ".implode(', ',$set)." WHERE id=?", $params);
    }
    bump_revision('column', $id, 'update');
    json_out(['column' => one("SELECT * FROM columns WHERE id=?", [$id])]);
}
case 'delete': {
    $id = (string)($body['id'] ?? '');
    _col_guard(_col_team($id), $u);
    $col = one("SELECT is_default FROM columns WHERE id=?", [$id]);
    if (!$col) error_response('coluna_nao_encontrada', 404);
    if ((int)$col['is_default'] === 1) {
        error_response('Esta é uma coluna padrão e não pode ser excluída (você pode renomear e mudar cor/ícone).', 400);
    }
    if ((int)scalar("SELECT COUNT(*) FROM cards WHERE column_id=? AND archived=0",[$id]) > 0) {
        error_response('coluna_tem_cards_ativos', 400);
    }
    q("DELETE FROM columns WHERE id=?",[$id]);
    bump_revision('column', $id, 'delete');
    json_out(['ok'=>true]);
}
/* Define QUAL coluna é a de "Concluído" (apenas uma por equipe). */
case 'set_done': {
    $id = (string)($body['id'] ?? '');
    if (!$id) error_response('id_obrigatorio', 400);
    $teamId = _col_team($id);
    _col_guard($teamId, $u);
    tx(function () use ($teamId, $id) {
        q("UPDATE columns SET is_done = 0 WHERE team_id = ?", [$teamId]);
        q("UPDATE columns SET is_done = 1, is_default = 1 WHERE id = ?", [$id]);  // a coluna concluída fica protegida
    });
    bump_revision('column', $id, 'set_done');
    json_out(['columns' => all("SELECT * FROM columns WHERE team_id = ? ORDER BY position", [$teamId])]);
}
case 'reorder': {
    $order = $body['order'] ?? [];
    if ($order) _col_guard(_col_team((string)$order[0]), $u);
    foreach ($order as $i => $cid) {
        q("UPDATE columns SET position=? WHERE id=?", [(int)$i, (string)$cid]);
    }
    bump_revision('column', null, 'reorder');
    json_out(['ok'=>true]);
}
/* Voltar ao padrão: restaura as 3 colunas padrão da equipe.
   Cards em colunas removidas são movidos para o backlog (1ª coluna). */
case 'reset': {
    $teamId = (string)($body['teamId'] ?? '');
    if (!$teamId) error_response('teamId_obrigatorio', 400);
    _col_guard($teamId, $u);
    $defs = [
        ['id'=>"$teamId-col0", 'name'=>'A Fazer',      'bl'=>1, 'dn'=>0, 'pos'=>0, 'cor'=>'#6b7280', 'ic'=>'📋'],
        ['id'=>"$teamId-col1", 'name'=>'Em Andamento', 'bl'=>0, 'dn'=>0, 'pos'=>1, 'cor'=>'#f59e0b', 'ic'=>'⚙️'],
        ['id'=>"$teamId-col2", 'name'=>'Concluído',    'bl'=>0, 'dn'=>1, 'pos'=>2, 'cor'=>'#10b981', 'ic'=>'✅'],
    ];
    $keepIds = array_column($defs, 'id');
    tx(function () use ($teamId, $defs, $keepIds) {
        // (Re)cria/atualiza as colunas padrão para os valores canônicos
        foreach ($defs as $d) {
            q("INSERT INTO columns (id, team_id, name, wip_limit, is_backlog, is_done, is_default, color, icon, position)
               VALUES (?,?,?,?,?,?,1,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                 name=excluded.name, is_backlog=excluded.is_backlog, is_done=excluded.is_done,
                 is_default=1, color=excluded.color, icon=excluded.icon, position=excluded.position, wip_limit=NULL",
              [$d['id'], $teamId, $d['name'], null, $d['bl'], $d['dn'], $d['cor'], $d['ic'], $d['pos']]);
        }
        // Move cards de colunas que serão removidas para o backlog
        $ph = implode(',', array_fill(0, count($keepIds), '?'));
        q("UPDATE cards SET column_id=? WHERE team_id=? AND column_id NOT IN ($ph)",
          array_merge(["$teamId-col0", $teamId], $keepIds));
        // Remove colunas extras
        q("DELETE FROM columns WHERE team_id=? AND id NOT IN ($ph)",
          array_merge([$teamId], $keepIds));
    });
    bump_revision('column', null, 'reset');
    json_out(['columns' => all("SELECT * FROM columns WHERE team_id = ? ORDER BY position", [$teamId])]);
}
default: error_response('action_invalida', 400);
}
