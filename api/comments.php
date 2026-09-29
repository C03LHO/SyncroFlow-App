<?php
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
$u = require_login(); require_role('comment');
$action = $_GET['action'] ?? '';
$body = json_in();

switch ($action) {
case 'create': {
    $id  = uid();
    $cid = (string)($body['cardId'] ?? '');
    $text= trim((string)($body['text'] ?? ''));
    $parentId = ($body['parentId'] ?? '') ?: null;
    if ($text === '') error_response('texto_vazio', 400);
    // valida que o pai existe e é do mesmo card (resposta de 1 nível ou aninhada)
    if ($parentId && !one("SELECT 1 FROM comments WHERE id=? AND card_id=?", [$parentId, $cid])) $parentId = null;
    q("INSERT INTO comments (id, card_id, user_name, timestamp, text, parent_id) VALUES (?,?,?,?,?,?)",
      [$id, $cid, $u['name'], now_iso(), $text, $parentId]);
    bump_revision('card', $cid, 'update');
    // ── Notificações de comentário ────────────────────────────────
    $me      = trim($u['name'] ?? '');
    $title   = (string)(scalar("SELECT title FROM cards WHERE id=?", [$cid]) ?: 'card');
    $notified = [];
    // 1) Resposta → avisa o autor do comentário-pai
    if ($parentId) {
        $pa = trim((string)(scalar("SELECT user_name FROM comments WHERE id=?", [$parentId]) ?: ''));
        if ($pa !== '' && strcasecmp($pa, $me) !== 0) {
            notify($pa, $me . ' respondeu seu comentário no card «' . $title . '».', 'info', $cid);
            $notified[strtolower($pa)] = true;
        }
    }
    // 2) Comentário no card → avisa o responsável (se não foi quem comentou nem já avisado)
    $asg = trim((string)(scalar("SELECT assignee FROM cards WHERE id=?", [$cid]) ?: ''));
    if ($asg !== '' && strcasecmp($asg, $me) !== 0 && empty($notified[strtolower($asg)])) {
        notify($asg, $me . ' comentou no seu card «' . $title . '».', 'info', $cid);
        $notified[strtolower($asg)] = true;
    }
    // 3) Menções @nome → avisa quem foi citado (membros da equipe + pessoas externas)
    $teamId = (string)(scalar("SELECT team_id FROM cards WHERE id=?", [$cid]) ?: '');
    $cands = [];
    if ($teamId !== '') {
        foreach (all("SELECT u.name FROM team_members tm JOIN users u ON u.user_id=tm.user_id WHERE tm.team_id=?", [$teamId]) as $r)
            if (trim((string)$r['name']) !== '') $cands[$r['name']] = true;
        $ep = scalar("SELECT extra_people FROM teams WHERE id=?", [$teamId]);
        foreach ((array)(json_decode($ep ?: '[]', true) ?: []) as $p) {
            $nm = is_string($p) ? $p : (string)($p['name'] ?? '');   // novo formato: {name, userId, email}
            if (trim($nm) !== '') $cands[$nm] = true;
        }
    }
    foreach (all("SELECT name FROM people WHERE name != ''") as $r) $cands[$r['name']] = true;

    if ($cands) {
        require_once __DIR__ . '/../lib/notify_mail.php';
        // Do nome mais LONGO p/ o mais curto, "consumindo" o trecho casado — assim
        // "@Ana Paula" não dispara também a "Ana", e exige limite de palavra
        // (não casa "Ana" dentro de "@Anabela").
        $work = mb_strtolower($text, 'UTF-8');
        $names = array_keys($cands);
        usort($names, fn($a, $b) => mb_strlen($b) - mb_strlen($a));
        foreach ($names as $nm) {
            if (strcasecmp($nm, $me) === 0 || !empty($notified[strtolower($nm)])) continue;
            $pat = '/@' . preg_quote(mb_strtolower($nm, 'UTF-8'), '/') . '(?![\p{L}\p{N}])/u';
            if (preg_match($pat, $work)) {
                notify($nm, $me . ' mencionou você num comentário do card «' . $title . '».', 'info', $cid);
                try { mail_notify_mention($nm, $me, $cid, $title); } catch (Throwable $e) {}
                $notified[strtolower($nm)] = true;
                $work = preg_replace($pat, str_repeat(' ', mb_strlen($nm) + 1), $work);  // consome
            }
        }
    }
    // 4) Seguidores do card (watchers) — avisa quem segue, exceto os já avisados
    try {
        foreach (all("SELECT us.name FROM card_watchers w JOIN users us ON us.user_id = w.user_id WHERE w.card_id=?", [$cid]) as $w) {
            $wn = trim((string)$w['name']);
            if ($wn !== '' && strcasecmp($wn, $me) !== 0 && empty($notified[strtolower($wn)])) {
                notify($wn, $me . ' comentou no card «' . $title . '» (que você segue).', 'info', $cid);
                $notified[strtolower($wn)] = true;
            }
        }
    } catch (Throwable $e) {}
    json_out(['comment' => one("SELECT * FROM comments WHERE id=?", [$id])], 201);
}
case 'update': {
    $id = (string)($body['id'] ?? '');
    $row = one("SELECT user_name, card_id FROM comments WHERE id=?", [$id]);
    if (!$row) error_response('nao_encontrado', 404);
    if ($row['user_name'] !== $u['name'] && $u['role'] !== 'ti') {
        error_response('apenas_autor_pode_editar', 403);
    }
    $text = trim((string)($body['text'] ?? ''));
    if ($text === '') error_response('texto_vazio', 400);
    q("UPDATE comments SET text=? WHERE id=?", [$text, $id]);
    bump_revision('card', $row['card_id'], 'update');
    json_out(['ok'=>true]);
}
case 'delete': {
    $id = (string)($body['id'] ?? '');
    $row = one("SELECT user_name, card_id FROM comments WHERE id=?", [$id]);
    if (!$row) error_response('nao_encontrado', 404);
    if ($row['user_name'] !== $u['name'] && $u['role'] !== 'ti') {
        error_response('apenas_autor_pode_apagar', 403);
    }
    q("DELETE FROM comments WHERE id=?", [$id]);
    bump_revision('card', $row['card_id'], 'update');
    json_out(['ok'=>true]);
}
default: error_response('action_invalida', 400);
}
