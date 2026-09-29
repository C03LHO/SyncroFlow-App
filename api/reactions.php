<?php
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
$u = require_login(); require_role('comment');
$body = json_in();
$action = $_GET['action'] ?? 'toggle';

if ($action !== 'toggle') error_response('action_invalida', 400);
$cmId  = (string)($body['commentId'] ?? '');
$emoji = (string)($body['emoji'] ?? '');
$cid   = scalar("SELECT card_id FROM comments WHERE id=?", [$cmId]);
if (!$cid) error_response('nao_encontrado', 404);

$has = (int)scalar("SELECT COUNT(*) FROM comment_reactions WHERE comment_id=? AND user_name=? AND emoji=?",
                   [$cmId, $u['name'], $emoji]);
if ($has) {
    q("DELETE FROM comment_reactions WHERE comment_id=? AND user_name=? AND emoji=?",
      [$cmId, $u['name'], $emoji]);
    $state = 'removed';
} else {
    q("INSERT INTO comment_reactions (comment_id, user_name, emoji, created_at) VALUES (?,?,?,?)",
      [$cmId, $u['name'], $emoji, now_iso()]);
    $state = 'added';
}
bump_revision('card', $cid, 'update');
json_out(['state' => $state]);
