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
    q("INSERT INTO links (id, card_id, url, title, added_at, added_by) VALUES (?,?,?,?,?,?)",
      [$id, $cid, (string)($body['url'] ?? ''), (string)($body['title'] ?? ''), now_iso(), $u['name']]);
    bump_revision('card', $cid, 'update');
    json_out(['link' => one("SELECT * FROM links WHERE id=?",[$id])], 201);
}
case 'delete': {
    $id = (string)($body['id'] ?? '');
    $cid = scalar("SELECT card_id FROM links WHERE id=?",[$id]);
    q("DELETE FROM links WHERE id=?",[$id]);
    if ($cid) bump_revision('card', $cid, 'update');
    json_out(['ok'=>true]);
}
default: error_response('action_invalida', 400);
}
