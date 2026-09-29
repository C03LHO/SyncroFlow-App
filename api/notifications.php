<?php
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
$u = require_login();
$action = $_GET['action'] ?? 'list';
$body = json_in();

switch ($action) {
case 'list':
    json_out(['notifications' => all(
        "SELECT * FROM notifications WHERE for_user IS NULL OR for_user = ?
         ORDER BY created_at DESC LIMIT 200", [$u['name']])]);
case 'create': {
    $id = uid();
    q("INSERT INTO notifications (id, message, type, target_card_id, action_label, for_user, created_at)
       VALUES (?,?,?,?,?,?,?)", [
        $id,
        (string)($body['message'] ?? ''),
        (string)($body['type'] ?? 'info'),
        $body['targetCardId'] ?? null,
        $body['actionLabel']  ?? null,
        $body['forUser']      ?? null,
        now_iso(),
    ]);
    bump_revision('notification', $id, 'create');
    json_out(['ok'=>true], 201);
}
case 'mark_read': {
    $id = (string)($body['id'] ?? '');
    q("UPDATE notifications SET read = 1, read_at = ? WHERE id = ? AND (for_user IS NULL OR for_user = ?)",
      [now_iso(), $id, $u['name']]);
    json_out(['ok'=>true]);
}
case 'mark_all_read': {
    q("UPDATE notifications SET read = 1, read_at = ? WHERE read = 0 AND (for_user IS NULL OR for_user = ?)",
      [now_iso(), $u['name']]);
    json_out(['ok'=>true]);
}
case 'delete': {
    $id = (string)($body['id'] ?? '');
    q("DELETE FROM notifications WHERE id = ? AND (for_user = ? OR for_user IS NULL)",
      [$id, $u['name']]);
    json_out(['ok'=>true]);
}
default: error_response('action_invalida', 400);
}
