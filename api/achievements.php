<?php
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
$u = require_login();
$action = $_GET['action'] ?? '';
$body = json_in();

switch ($action) {
case 'get_my':
case 'get_user': {
    $vid = $action === 'get_my' ? $u['user_id'] : (string)($_GET['user_id'] ?? '');
    $trophies = []; $titles = [];
    foreach (all("SELECT trophy_id, unlocked_at FROM trophies WHERE user_id=?",[$vid]) as $t)
        $trophies[$t['trophy_id']] = ['unlockedAt' => $t['unlocked_at']];
    foreach (all("SELECT title_id, unlocked_at FROM titles WHERE user_id=?",[$vid]) as $t)
        $titles[$t['title_id']]   = ['unlockedAt' => $t['unlocked_at']];
    $u2 = one("SELECT active_title, onboarding_done, last_standup_date, seen_achievements
               FROM users WHERE user_id=?", [$vid]);
    json_out([
        'trophies' => $trophies, 'titles' => $titles,
        'activeTitle' => $u2['active_title'] ?? 'novato',
        'onboardingDone' => (bool)($u2['onboarding_done'] ?? 0),
        'lastStandupDate' => $u2['last_standup_date'] ?? '',
        'seenAchievements' => json_decode($u2['seen_achievements'] ?? '[]', true) ?: [],
    ]);
}
case 'unlock_trophy': {
    $tid = (string)($body['trophyId'] ?? '');
    q("INSERT OR IGNORE INTO trophies (user_id, trophy_id, unlocked_at) VALUES (?,?,?)",
      [$u['user_id'], $tid, now_iso()]);
    bump_revision('user', $u['user_id'], 'unlock_trophy');
    json_out(['ok'=>true]);
}
/* Conquistas de EDIÇÃO LIMITADA (ex.: Copa "Artilheiro" — só 3 no sistema).
   O servidor é a fonte da verdade: concede por ordem de chegada até o limite.
   Resposta: granted=true se o usuário tem (ou acabou de ganhar) a conquista. */
case 'claim_limited': {
    $tid   = (string)($body['trophyId'] ?? '');
    $limit = max(1, (int)($body['limit'] ?? 3));
    if ($tid === '') error_response('trophyId_obrigatorio', 400);
    $granted = tx(function () use ($u, $tid, $limit) {
        // já tem?
        if (scalar("SELECT 1 FROM trophies WHERE user_id=? AND trophy_id=?", [$u['user_id'], $tid])) return true;
        $count = (int)scalar("SELECT COUNT(DISTINCT user_id) FROM trophies WHERE trophy_id=?", [$tid]);
        if ($count >= $limit) return false;          // vagas esgotadas
        q("INSERT OR IGNORE INTO trophies (user_id, trophy_id, unlocked_at) VALUES (?,?,?)",
          [$u['user_id'], $tid, now_iso()]);
        return true;
    });
    if ($granted) bump_revision('user', $u['user_id'], 'claim_limited');
    $taken = (int)scalar("SELECT COUNT(DISTINCT user_id) FROM trophies WHERE trophy_id=?", [$tid]);
    json_out(['ok'=>true, 'granted'=>$granted, 'taken'=>$taken, 'limit'=>$limit, 'slotsLeft'=>max(0, $limit - $taken)]);
}
case 'unlock_title': {
    $tid = (string)($body['titleId'] ?? '');
    q("INSERT OR IGNORE INTO titles (user_id, title_id, unlocked_at) VALUES (?,?,?)",
      [$u['user_id'], $tid, now_iso()]);
    bump_revision('user', $u['user_id'], 'unlock_title');
    json_out(['ok'=>true]);
}
case 'set_showcase': {
    // Destaque do perfil: até 3 conquistas individuais + 2 troféus de equipe.
    $t  = array_values(array_filter(array_map('strval', (array)($body['t']  ?? [])), 'strlen'));
    $tt = array_values(array_filter(array_map('strval', (array)($body['tt'] ?? [])), 'strlen'));
    $t  = array_slice(array_values(array_unique($t)),  0, 3);
    $tt = array_slice(array_values(array_unique($tt)), 0, 2);
    q("UPDATE users SET showcase=? WHERE user_id=?",
      [json_encode(['t' => $t, 'tt' => $tt], JSON_UNESCAPED_UNICODE), $u['user_id']]);
    bump_revision('user', $u['user_id'], 'set_showcase');
    json_out(['ok' => true, 't' => $t, 'tt' => $tt]);
}
case 'set_active_title': {
    q("UPDATE users SET active_title=? WHERE user_id=?",
      [(string)($body['titleId'] ?? 'novato'), $u['user_id']]);
    bump_revision('user', $u['user_id'], 'set_active_title');
    json_out(['ok'=>true]);
}
case 'mark_seen': {
    $list = $body['seen'] ?? [];
    q("UPDATE users SET seen_achievements=? WHERE user_id=?", [json_encode($list), $u['user_id']]);
    json_out(['ok'=>true]);
}
case 'set_onboarding': {
    q("UPDATE users SET onboarding_done=? WHERE user_id=?",
      [(int)(bool)($body['done'] ?? true), $u['user_id']]);
    json_out(['ok'=>true]);
}
case 'set_standup_today': {
    q("UPDATE users SET last_standup_date=? WHERE user_id=?",
      [date('Y-m-d'), $u['user_id']]);
    json_out(['ok'=>true]);
}
default: error_response('action_invalida', 400);
}
