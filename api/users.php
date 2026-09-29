<?php
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
require_once __DIR__ . '/../lib/teams.php';
$u = require_login();
$action = $_GET['action'] ?? 'list';
$body = json_in();

switch ($action) {

/* ─── Perfil do próprio usuário (auto-edição) ─── */
case 'me': {
    json_out(['user' => one("SELECT user_id, name, display_name, email, bio, role,
                                    color, profile_title, active_title, avatar_url, cover_url,
                                    job_title, department,
                                    notify_email, notify_email_assign, notify_email_due, notify_email_digest
                             FROM users WHERE user_id=?", [$u['user_id']])]);
}
case 'me_update': {
    $set = []; $params = [];
    // Campos de texto livre
    foreach (['name'=>'name','displayName'=>'display_name','email'=>'email',
              'bio'=>'bio','jobTitle'=>'job_title','department'=>'department',
              'color'=>'color','activeTitle'=>'active_title'] as $bk=>$col) {
        if (array_key_exists($bk, $body)) { $set[]="$col=?"; $params[]=(string)$body[$bk]; }
    }
    // Preferências de notificação por e-mail (0/1)
    foreach (['notifyEmail'=>'notify_email','notifyEmailAssign'=>'notify_email_assign',
              'notifyEmailDue'=>'notify_email_due','notifyEmailDigest'=>'notify_email_digest'] as $bk=>$col) {
        if (array_key_exists($bk, $body)) { $set[]="$col=?"; $params[]=(int)((bool)$body[$bk]); }
    }
    if ($set) {
        $params[] = $u['user_id'];
        q("UPDATE users SET ".implode(', ',$set)." WHERE user_id=?", $params);
        bump_revision('user', $u['user_id'], 'profile_update');
    }
    json_out(['ok'=>true, 'user'=>one("SELECT user_id,name,display_name,email,bio,role,color,active_title,avatar_url,cover_url,notify_email,notify_email_assign,notify_email_due,notify_email_digest FROM users WHERE user_id=?", [$u['user_id']])]);
}

/* Busca um usuário ativo pelo e-mail (para auto-preencher "Pessoas externas"). */
case 'find_by_email': {
    $email = trim((string)($_GET['email'] ?? $body['email'] ?? ''));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) json_out(['user' => null]);
    $row = one("SELECT user_id, name, display_name FROM users WHERE is_active = 1 AND lower(email) = lower(?) LIMIT 1", [$email]);
    json_out(['user' => $row ?: null]);
}

case 'list':
    json_out(['users' => all("SELECT user_id, name, role, color, profile_title, active_title,
                                     job_title, department, total_logins, last_login, is_active, avatar_url
                              FROM users ORDER BY name")]);
case 'get': {
    $id = (string)($_GET['user_id'] ?? $body['user_id'] ?? '');
    json_out(['user' => one("SELECT * FROM users WHERE user_id=?", [$id])]);
}

/* ─── Perfil público (cartão de perfil) ─── */
case 'profile': {
    require_once __DIR__ . '/../lib/teams.php';
    $id = (string)($_GET['user_id'] ?? $body['user_id'] ?? '');
    $usr = one("SELECT user_id, name, display_name, email, bio, role, color,
                       profile_title, active_title, job_title, department,
                       avatar_url, cover_url, total_logins, last_login, created_at,
                       onboarding_done, showcase
                FROM users WHERE user_id=?", [$id]);
    if (!$usr) error_response('Usuário não encontrado.', 404);

    // equipes em comum / públicas das quais participa (não inclui pessoal)
    $teams = all("SELECT t.id, t.name, t.icon, t.color, tm.role AS my_role
                  FROM team_members tm JOIN teams t ON t.id = tm.team_id
                  WHERE tm.user_id = ? AND t.type != 'personal' AND t.archived = 0
                  ORDER BY t.name", [$id]);

    // estatísticas por equipe → cliente avalia os troféus de equipe
    $teamStats = [];
    foreach ($teams as $t) { $teamStats[$t['id']] = team_stats($t['id']); }

    // estatísticas de cards (por nome do responsável, como no resto do sistema)
    $assigned = (int)scalar("SELECT COUNT(*) FROM cards WHERE assignee=? AND archived=0", [$usr['name']]);
    $doneCols = all_done_column_ids();
    $donePh   = implode(',', array_fill(0, count($doneCols), '?'));
    $done     = (int)scalar("SELECT COUNT(*) FROM cards WHERE assignee=? AND archived=0 AND column_id IN ($donePh)",
                            array_merge([$usr['name']], $doneCols));
    $comments = (int)scalar("SELECT COUNT(*) FROM comments WHERE user_name=?", [$usr['name']]);

    json_out([
        'user'  => $usr,
        'teams' => $teams,
        'teamStats' => $teamStats,
        'stats' => [
            'assigned' => $assigned, 'done' => $done,
            'teams' => count($teams), 'comments' => $comments,
        ],
    ]);
}
case 'update': {
    require_role('manage_users');
    $id = (string)($body['user_id'] ?? '');
    foreach (['name'=>'name','color'=>'color','jobTitle'=>'job_title','department'=>'department',
              'profileTitle'=>'profile_title','activeTitle'=>'active_title'] as $bk=>$col) {
        if (array_key_exists($bk,$body)) {
            q("UPDATE users SET $col=? WHERE user_id=?", [(string)$body[$bk], $id]);
        }
    }
    if (array_key_exists('isActive',$body)) {
        q("UPDATE users SET is_active=? WHERE user_id=?", [(int)(bool)$body['isActive'], $id]);
    }
    bump_revision('user', $id, 'update');
    json_out(['user' => one("SELECT user_id,name,role,color FROM users WHERE user_id=?",[$id])]);
}
case 'change_role': {
    require_role('manage_users');
    $id = (string)($body['user_id'] ?? '');
    $to = (string)($body['role'] ?? '');
    require_once __DIR__ . '/../lib/rbac.php';
    if (!in_array($to, all_roles(), true)) error_response('papel_invalido', 400);
    $row = one("SELECT name, role FROM users WHERE user_id=?", [$id]);
    if (!$row) error_response('nao_encontrado', 404);
    q("UPDATE users SET role=? WHERE user_id=?", [$to, $id]);
    q("INSERT INTO role_history (id, user_id, name, from_role, to_role, changed_by, changed_at, reason)
       VALUES (?,?,?,?,?,?,?,?)",
       [uid(), $id, $row['name'], $row['role'], $to, $u['name'], now_iso(),
        (string)($body['reason'] ?? '')]);
    bump_revision('user', $id, 'change_role');
    json_out(['ok'=>true]);
}
case 'reset_password': {
    require_role('manage_users');
    $id = (string)($body['user_id'] ?? '');
    $pwd = (string)($body['new_password'] ?? '');
    if (strlen($pwd) < 6) error_response('senha_curta', 400);
    $hash = password_hash($pwd, PASSWORD_BCRYPT, ['cost'=>12]);
    q("UPDATE users SET password_hash=? WHERE user_id=?", [$hash, $id]);
    bump_revision('user', $id, 'reset_password');
    json_out(['ok'=>true]);
}
case 'delete': {
    require_role('manage_users');
    $id = (string)($body['user_id'] ?? '');
    if ($id === $u['user_id']) error_response('nao_pode_deletar_proprio_usuario', 400);
    q("UPDATE users SET is_active=0 WHERE user_id=?", [$id]);
    bump_revision('user', $id, 'delete');
    json_out(['ok'=>true]);
}
default: error_response('action_invalida', 400);
}
