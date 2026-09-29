<?php
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
$u = require_login(); require_role('edit');
$action = $_GET['action'] ?? '';
$body = json_in();

switch ($action) {
case 'create': {
    $id = uid();
    $cid = (string)($body['cardId'] ?? '');
    $pos = (int)scalar("SELECT COALESCE(MAX(position),-1)+1 FROM subtasks WHERE card_id=?",[$cid]);
    q("INSERT INTO subtasks (id, card_id, parent_subtask_id, title, done, assignee, due_date, sprint_id, position)
       VALUES (?,?,?,?,0,?,?,?,?)", [
        $id, $cid, $body['parentId'] ?? null,
        (string)($body['title'] ?? ''),
        (string)($body['assignee'] ?? ''),
        ($body['dueDate'] ?? '') ?: null,
        ($body['sprintId'] ?? '') ?: null,
        $pos,
    ]);
    bump_revision('card', $cid, 'update');
    json_out(['subtask' => one("SELECT * FROM subtasks WHERE id=?", [$id])], 201);
}
case 'update': {
    $id = (string)($body['id'] ?? '');
    foreach (['title'=>'title','assignee'=>'assignee','dueDate'=>'due_date','sprintId'=>'sprint_id'] as $bk=>$col) {
        if (array_key_exists($bk,$body)) {
            q("UPDATE subtasks SET $col=? WHERE id=?", [$body[$bk] ?: null, $id]);
        }
    }
    $cid = scalar("SELECT card_id FROM subtasks WHERE id=?", [$id]);
    if ($cid) bump_revision('card', $cid, 'update');
    json_out(['ok'=>true]);
}
case 'toggle': {
    $id = (string)($body['id'] ?? '');
    q("UPDATE subtasks SET done = 1 - done WHERE id=?", [$id]);
    $cid = scalar("SELECT card_id FROM subtasks WHERE id=?", [$id]);
    if ($cid) bump_revision('card', $cid, 'update');
    json_out(['subtask' => one("SELECT * FROM subtasks WHERE id=?", [$id])]);
}
case 'delete': {
    $id = (string)($body['id'] ?? '');
    $cid = scalar("SELECT card_id FROM subtasks WHERE id=?", [$id]);
    q("DELETE FROM subtasks WHERE id=?", [$id]);
    if ($cid) bump_revision('card', $cid, 'update');
    json_out(['ok'=>true]);
}
default: error_response('action_invalida', 400);
}
