<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/teams.php (v12)
   Equipes estilo Trello: criar, convidar, pedir entrada, aprovar,
   bypass do TI, membros, sair, listar usuários.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
require_once __DIR__ . '/../lib/teams.php';

$u = require_login();
$action = $_GET['action'] ?? 'list';
$body   = json_in();
$param  = fn($k, $d = null) => $body[$k] ?? $_POST[$k] ?? $_GET[$k] ?? $d;

function _notify(string $name, string $msg, string $type = 'info', string $kind = '', string $refId = ''): void {
    q("INSERT INTO notifications (id, message, type, for_user, created_at, kind, ref_id) VALUES (?,?,?,?,?,?,?)",
      [uid(), $msg, $type, $name, now_iso(), $kind, $refId]);
}

switch ($action) {

/* ─── Minhas equipes ─── */
case 'list': {
    $teams = array_map('hydrate_team', user_teams($u['user_id']));
    json_out(['teams' => $teams]);
}

/* ─── Todas as equipes (aba Equipes) ─── */
case 'all_teams': {
    $rows = all("SELECT * FROM teams WHERE archived = 0 AND type != 'personal' ORDER BY type, name");
    $out = [];
    foreach ($rows as $t) {
        $h = hydrate_team($t);
        $h['my_role']    = team_role($t['id'], $u['user_id']);   // null se não-membro
        $h['is_member']  = $h['my_role'] !== null;
        $h['has_pending']= (int)scalar(
            "SELECT COUNT(*) FROM team_invites WHERE team_id=? AND user_id=? AND status='pending'",
            [$t['id'], $u['user_id']]) > 0;
        $out[] = $h;
    }
    // Inclui o quadro PESSOAL do usuário (seção "Meu Quadro" em Equipes / config de campos)
    $pt = one("SELECT * FROM teams WHERE id=? AND archived=0", ['personal-' . $u['user_id']]);
    if ($pt) {
        $h = hydrate_team($pt);
        $h['my_role']     = team_role($pt['id'], $u['user_id']) ?: 'gestor';
        $h['is_member']   = true;
        $h['has_pending'] = false;
        $out[] = $h;
    }
    json_out(['teams' => $out]);
}

/* ─── Detalhe de uma equipe ─── */
case 'get': {
    $id = (string)$param('id', '');
    $t = one("SELECT * FROM teams WHERE id = ?", [$id]);
    if (!$t) error_response('equipe_nao_encontrada', 404);
    json_out(['team' => hydrate_team($t)]);
}

/* ─── Categorias/Tags de equipe ─── */
case 'tags_list': {
    json_out(['tags' => all("SELECT id, name, color FROM team_tags ORDER BY name")]);
}
case 'tag_create': {  // só TI-Dev / TI-Sup definem os NOMES das categorias
    if (!in_array($u['role'] ?? '', ['ti','suporte'], true)) error_response('Apenas TI-Dev/TI-Sup podem criar categorias.', 403);
    $name = trim((string)$param('name', ''));
    if ($name === '') error_response('Nome da categoria é obrigatório.', 400);
    if (scalar("SELECT id FROM team_tags WHERE LOWER(name)=LOWER(?)", [$name]) !== false) error_response('Já existe uma categoria com esse nome.', 409);
    $id = 'tag-' . uid();
    q("INSERT INTO team_tags (id, name, color, created_by, created_at) VALUES (?,?,?,?,?)",
      [$id, $name, (string)$param('color', '#00796D'), $u['name'], now_iso()]);
    json_out(['tag' => one("SELECT id, name, color FROM team_tags WHERE id=?", [$id])], 201);
}
case 'tag_delete': {
    if (!in_array($u['role'] ?? '', ['ti','suporte'], true)) error_response('Apenas TI-Dev/TI-Sup podem excluir categorias.', 403);
    $id = (string)$param('id', '');
    if ($id === 'tag-coordenacao') error_response('A categoria padrão "Coordenação" não pode ser excluída.', 400);
    tx(function () use ($id) {
        q("DELETE FROM team_tag_map WHERE tag_id=?", [$id]);
        q("DELETE FROM team_tags WHERE id=?", [$id]);
    });
    json_out(['ok' => true]);
}
case 'set_tags': {  // Gestor/TI da equipe (ou TI global) define a categoria da equipe
    $teamId = (string)$param('team_id', '');
    if (!one("SELECT id FROM teams WHERE id=?", [$teamId])) error_response('equipe_nao_encontrada', 404);
    $r = effective_team_role($teamId, $u);
    if (!$r || !can_in_team($r, 'manage_team')) error_response('Sem permissão para definir a categoria desta equipe.', 403);
    $tagIds = $param('tag_ids', []);
    if (!is_array($tagIds)) $tagIds = [];
    tx(function () use ($teamId, $tagIds) {
        q("DELETE FROM team_tag_map WHERE team_id=?", [$teamId]);
        foreach ($tagIds as $tid) {
            $tid = (string)$tid;
            if ($tid === '' || scalar("SELECT id FROM team_tags WHERE id=?", [$tid]) === false) continue;
            q("INSERT OR IGNORE INTO team_tag_map (team_id, tag_id) VALUES (?,?)", [$teamId, $tid]);
        }
    });
    bump_revision('team', $teamId, 'set_tags');
    json_out(['team' => hydrate_team(one("SELECT * FROM teams WHERE id=?", [$teamId]))]);
}

/* ─── Criar equipe (qualquer usuário, exceto visitante) ─── */
case 'create': {
    if (($u['role'] ?? '') === 'visitante') {
        error_response('Visitantes não podem criar equipes.', 403);
    }
    $name = trim((string)$param('name', ''));
    if ($name === '') error_response('Nome da equipe é obrigatório.', 400);
    $id = 'team-' . uid();
    $now = now_iso();
    tx(function () use ($id, $name, $param, $u, $now) {
        q("INSERT INTO teams (id, name, description, type, owner_user_id, color, icon, created_at)
           VALUES (?,?,?,'team',?,?,?,?)", [
            $id, $name, trim((string)$param('description','')),
            $u['user_id'],
            (string)$param('color', '#00796D'),
            (string)$param('icon', '👥'),
            $now,
        ]);
        // Criador entra como gestor
        q("INSERT INTO team_members (team_id, user_id, role, joined_at, added_by)
           VALUES (?,?, 'gestor', ?, ?)", [$id, $u['user_id'], $now, $u['name']]);
        // 3 colunas padrão (protegidas: is_default=1; "Concluído" recebe is_done=1)
        $cols = [['A Fazer',1,0,0,'#6b7280','📋'],['Em Andamento',0,1,0,'#f59e0b','⚙️'],['Concluído',0,2,1,'#10b981','✅']];
        foreach ($cols as [$cn,$bl,$pos,$dn,$cor,$ic]) {
            q("INSERT INTO columns (id, name, is_backlog, is_done, is_default, position, color, icon, team_id)
               VALUES (?,?,?,?,1,?,?,?,?)", ["$id-col$pos", $cn, $bl, $dn, $pos, $cor, $ic, $id]);
        }
        // Categoria da equipe (default: Coordenação)
        $tag = (string)($param('tag_id') ?: 'tag-coordenacao');
        if (scalar("SELECT id FROM team_tags WHERE id=?", [$tag]) === false) $tag = 'tag-coordenacao';
        q("INSERT OR IGNORE INTO team_tag_map (team_id, tag_id) VALUES (?,?)", [$id, $tag]);
    });
    bump_revision('team', $id, 'create');
    json_out(['team' => hydrate_team(one("SELECT * FROM teams WHERE id=?", [$id]))], 201);
}

/* ─── Gestor da equipe convida um usuário ─── */
case 'invite': {
    $teamId = (string)$param('team_id', '');
    $vid    = (string)$param('user_id', '');
    $role   = (string)$param('role', 'analista');
    if (!in_array($role, team_roles(), true)) $role = 'analista';
    $er = effective_team_role($teamId, $u);
    if (!$er || !can_in_team($er, 'manage_members')) error_response('Sem permissão nesta equipe.', 403);
    if (!one("SELECT 1 FROM users WHERE user_id=? AND is_active=1", [$vid])) error_response('Usuário não encontrado.', 404);
    if (is_team_member($teamId, $vid)) error_response('Usuário já é membro.', 409);
    // remove convites pendentes anteriores e cria novo
    q("DELETE FROM team_invites WHERE team_id=? AND user_id=? AND status='pending'", [$teamId, $vid]);
    $id = uid();
    q("INSERT INTO team_invites (id, team_id, user_id, direction, role, status, created_by, created_at)
       VALUES (?,?,?, 'invite', ?, 'pending', ?, ?)", [$id, $teamId, $vid, $role, $u['name'], now_iso()]);
    $t = one("SELECT name FROM teams WHERE id=?", [$teamId]);
    $un = scalar("SELECT name FROM users WHERE user_id=?", [$vid]);
    if ($un) _notify($un, $u['name'] . ' convidou você para a equipe "' . ($t['name'] ?? '') . '".', 'info', 'team_invite', $id);
    bump_revision('team', $teamId, 'invite');
    json_out(['ok' => true, 'invite_id' => $id], 201);
}

/* ─── Usuário pede para entrar (entra como analista) ─── */
case 'request_join': {
    $teamId = (string)$param('team_id', '');
    $t = one("SELECT * FROM teams WHERE id=? AND archived=0", [$teamId]);
    if (!$t) error_response('Equipe não encontrada.', 404);
    if ($t['type'] === 'personal') error_response('Quadro pessoal não aceita membros.', 400);
    if (is_team_member($teamId, $u['user_id'])) error_response('Você já é membro.', 409);
    $pending = (int)scalar("SELECT COUNT(*) FROM team_invites WHERE team_id=? AND user_id=? AND status='pending'",
                           [$teamId, $u['user_id']]);
    if ($pending) error_response('Você já tem um pedido pendente nesta equipe.', 409);
    $id = uid();
    q("INSERT INTO team_invites (id, team_id, user_id, direction, role, status, created_by, created_at)
       VALUES (?,?,?, 'request', 'analista', 'pending', ?, ?)", [$id, $teamId, $u['user_id'], $u['name'], now_iso()]);
    // notifica Gestores E TI DA EQUIPE (antes só o gestor era avisado — bug #9/#11).
    foreach (all("SELECT u.name FROM team_members tm JOIN users u ON u.user_id=tm.user_id
                  WHERE tm.team_id=? AND tm.role IN ('gestor','ti')", [$teamId]) as $g) {
        _notify($g['name'], $u['name'] . ' pediu para entrar na equipe "' . $t['name'] . '".', 'info', 'team_request', $id);
    }
    bump_revision('team', $teamId, 'request');
    json_out(['ok' => true, 'request_id' => $id], 201);
}

/* ─── Adicionar direto (bypass, sem aceite) — TI do sistema OU Gestor/TI da equipe ─── */
case 'add_member': {
    $teamId = (string)$param('team_id', '');
    $vid    = (string)$param('user_id', '');
    $role   = (string)$param('role', 'analista');
    if (!in_array($role, team_roles(), true)) $role = 'analista';
    if (!one("SELECT 1 FROM teams WHERE id=?", [$teamId])) error_response('Equipe não encontrada.', 404);
    // Permissão: TI do sistema (bypass global) OU Gestor/TI da própria equipe (manage_members).
    $er = effective_team_role($teamId, $u);
    if (!$er || !can_in_team($er, 'manage_members')) error_response('Sem permissão para adicionar membros nesta equipe.', 403);
    if (!one("SELECT 1 FROM users WHERE user_id=? AND is_active=1", [$vid])) error_response('Usuário não encontrado.', 404);
    if (is_team_member($teamId, $vid)) error_response('Usuário já é membro.', 409);
    $isSys = in_array($u['role'] ?? '', ['ti','suporte'], true);
    $addedBy = $u['name'] . ($isSys ? ' (TI bypass)' : ' (adicionado direto)');
    q("INSERT OR REPLACE INTO team_members (team_id, user_id, role, joined_at, added_by)
       VALUES (?,?,?,?,?)", [$teamId, $vid, $role, now_iso(), $addedBy]);
    // Encerra qualquer convite/pedido pendente desse usuário nesta equipe.
    q("UPDATE team_invites SET status='accepted', decided_at=?
       WHERE team_id=? AND user_id=? AND status='pending'", [now_iso(), $teamId, $vid]);
    $un = scalar("SELECT name FROM users WHERE user_id=?", [$vid]);
    $tn = scalar("SELECT name FROM teams WHERE id=?", [$teamId]);
    if ($un) _notify($un, $u['name'] . ' adicionou você à equipe "' . $tn . '".', 'success');
    bump_revision('team', $teamId, 'add_member');
    json_out(['ok' => true]);
}

/* ─── Convidado responde (accept/reject) ─── */
case 'respond_invite': {
    $invId = (string)$param('id', '');
    $decision = (string)$param('decision', '');
    $inv = one("SELECT * FROM team_invites WHERE id=?", [$invId]);
    if (!$inv) error_response('Convite não encontrado.', 404);
    if ($inv['user_id'] !== $u['user_id']) error_response('Este convite não é seu.', 403);
    if ($inv['status'] !== 'pending') error_response('Convite já respondido.', 400);
    if ($decision === 'accept') {
        q("INSERT OR IGNORE INTO team_members (team_id, user_id, role, joined_at, added_by)
           VALUES (?,?,?,?,?)", [$inv['team_id'], $u['user_id'], $inv['role'], now_iso(), $inv['created_by']]);
    }
    q("UPDATE team_invites SET status=?, decided_at=? WHERE id=?",
      [$decision === 'accept' ? 'accepted' : 'rejected', now_iso(), $invId]);
    bump_revision('team', $inv['team_id'], 'invite_response');
    json_out(['ok' => true]);
}

/* ─── Gestor responde pedido de entrada (accept/reject) ─── */
case 'respond_request': {
    $invId = (string)$param('id', '');
    $decision = (string)$param('decision', '');
    $inv = one("SELECT * FROM team_invites WHERE id=?", [$invId]);
    if (!$inv) error_response('Pedido não encontrado.', 404);
    $er = effective_team_role($inv['team_id'], $u);
    if (!$er || !can_in_team($er, 'manage_members')) error_response('Sem permissão.', 403);
    if ($inv['status'] !== 'pending') error_response('Pedido já respondido.', 400);
    if ($decision === 'accept') {
        q("INSERT OR IGNORE INTO team_members (team_id, user_id, role, joined_at, added_by)
           VALUES (?,?, 'analista', ?, ?)", [$inv['team_id'], $inv['user_id'], now_iso(), $u['name']]);
    }
    q("UPDATE team_invites SET status=?, decided_at=? WHERE id=?",
      [$decision === 'accept' ? 'accepted' : 'rejected', now_iso(), $invId]);
    $un = scalar("SELECT name FROM users WHERE user_id=?", [$inv['user_id']]);
    $tn = scalar("SELECT name FROM teams WHERE id=?", [$inv['team_id']]);
    if ($un) _notify($un, 'Seu pedido para entrar em "' . $tn . '" foi ' .
                          ($decision==='accept'?'APROVADO':'recusado') . '.',
                          $decision==='accept'?'success':'warn');
    bump_revision('team', $inv['team_id'], 'request_response');
    json_out(['ok' => true]);
}

/* ─── Membros de uma equipe ─── */
case 'members': {
    $teamId = (string)$param('team_id', $param('id',''));
    $rows = all("SELECT tm.user_id, tm.role, tm.joined_at, u.name, u.avatar_url,
                        COALESCE(NULLIF(TRIM(u.display_name), ''), u.name) AS display
                 FROM team_members tm JOIN users u ON u.user_id = tm.user_id
                 WHERE tm.team_id = ? ORDER BY tm.role, u.name", [$teamId]);
    json_out(['members' => $rows]);
}

/* ─── Mudar papel de um membro (gestor/ti) ─── */
case 'change_member_role': {
    $teamId = (string)$param('team_id', '');
    $vid    = (string)$param('user_id', '');
    $role   = (string)$param('role', 'analista');
    $er = effective_team_role($teamId, $u);
    if (!$er || !can_in_team($er, 'manage_members')) error_response('Sem permissão.', 403);
    if (!in_array($role, team_roles(), true)) error_response('Papel inválido.', 400);
    q("UPDATE team_members SET role=? WHERE team_id=? AND user_id=?", [$role, $teamId, $vid]);
    bump_revision('team', $teamId, 'member_role');
    json_out(['ok' => true]);
}

/* ─── Remover membro (gestor/ti) ─── */
case 'remove_member': {
    $teamId = (string)$param('team_id', '');
    $vid    = (string)$param('user_id', '');
    $er = effective_team_role($teamId, $u);
    if (!$er || !can_in_team($er, 'manage_members')) error_response('Sem permissão.', 403);
    $t = one("SELECT type, owner_user_id FROM teams WHERE id=?", [$teamId]);
    if ($t && $t['owner_user_id'] === $vid) error_response('Não é possível remover o dono da equipe.', 400);
    q("DELETE FROM team_members WHERE team_id=? AND user_id=?", [$teamId, $vid]);
    bump_revision('team', $teamId, 'remove_member');
    json_out(['ok' => true]);
}

/* ─── Sair de uma equipe ─── */
case 'leave': {
    $teamId = (string)$param('team_id', '');
    $t = one("SELECT type, owner_user_id FROM teams WHERE id=?", [$teamId]);
    if (!$t) error_response('Equipe não encontrada.', 404);
    if ($t['type'] === 'personal' || $t['type'] === 'default') error_response('Não é possível sair desta equipe.', 400);
    // Dono saindo: transfere a propriedade para outro membro (prefere gestor → TI → analista),
    // promovendo-o a gestor. Só bloqueia se for o único membro.
    if ($t['owner_user_id'] === $u['user_id']) {
        $succ = one("SELECT user_id FROM team_members
                     WHERE team_id=? AND user_id<>?
                     ORDER BY CASE role WHEN 'gestor' THEN 0 WHEN 'ti' THEN 1 WHEN 'analista' THEN 2 ELSE 3 END, joined_at
                     LIMIT 1", [$teamId, $u['user_id']]);
        if (!$succ) error_response('Você é o único membro. Arquive ou exclua a equipe em vez de sair.', 400);
        q("UPDATE teams SET owner_user_id=? WHERE id=?", [$succ['user_id'], $teamId]);
        q("UPDATE team_members SET role='gestor' WHERE team_id=? AND user_id=?", [$teamId, $succ['user_id']]);
    }
    q("DELETE FROM team_members WHERE team_id=? AND user_id=?", [$teamId, $u['user_id']]);
    bump_revision('team', $teamId, 'leave');
    json_out(['ok' => true]);
}

/* ─── Meus convites/pedidos pendentes ─── */
case 'my_invites': {
    $rows = all("SELECT ti.*, t.name AS team_name, t.icon AS team_icon
                 FROM team_invites ti JOIN teams t ON t.id = ti.team_id
                 WHERE ti.user_id = ? AND ti.status = 'pending' AND ti.direction = 'invite'
                 ORDER BY ti.created_at DESC", [$u['user_id']]);
    json_out(['invites' => $rows]);
}

/* ─── Pedidos pendentes nas equipes que eu gerencio ─── */
case 'pending_requests': {
    // TI-Dev / TI-Sup (admins do sistema) enxergam TODOS os pedidos pendentes,
    // mesmo sem serem membros da equipe — fecha o buraco da "equipe nova" (#11).
    if (in_array($u['role'] ?? '', ['ti','suporte'], true)) {
        $rows = all("SELECT ti.*, t.name AS team_name, usr.name AS user_name
                     FROM team_invites ti
                     JOIN teams t ON t.id = ti.team_id
                     JOIN users usr ON usr.user_id = ti.user_id
                     WHERE ti.status='pending' AND ti.direction='request'
                     ORDER BY ti.created_at DESC");
    } else {
        // Demais: só os pedidos das equipes onde sou Gestor ou TI da equipe.
        $rows = all("SELECT ti.*, t.name AS team_name, usr.name AS user_name
                     FROM team_invites ti
                     JOIN teams t ON t.id = ti.team_id
                     JOIN team_members tm ON tm.team_id = ti.team_id AND tm.user_id = ? AND tm.role IN ('gestor','ti')
                     JOIN users usr ON usr.user_id = ti.user_id
                     WHERE ti.status='pending' AND ti.direction='request'
                     ORDER BY ti.created_at DESC", [$u['user_id']]);
    }
    json_out(['requests' => $rows]);
}

/* ─── Perfil da equipe (overview público p/ logados; sem cards) ─── */
case 'profile': {
    $teamId = (string)$param('team_id', $param('id',''));
    $t = one("SELECT * FROM teams WHERE id=?", [$teamId]);
    if (!$t) error_response('Equipe não encontrada.', 404);
    if ($t['type'] === 'personal') error_response('Quadro pessoal não tem perfil público.', 403);
    $team = hydrate_team($t);
    $members = all("SELECT tm.user_id, tm.role, tm.joined_at, u.name, u.avatar_url, u.job_title
                    FROM team_members tm JOIN users u ON u.user_id = tm.user_id
                    WHERE tm.team_id = ?
                    ORDER BY CASE tm.role WHEN 'gestor' THEN 0 WHEN 'ti' THEN 1 WHEN 'analista' THEN 2 ELSE 3 END, u.name",
                   [$teamId]);
    json_out([
        'team'    => $team,
        'members' => $members,
        'stats'   => team_stats($teamId),
        'my_role' => effective_team_role($teamId, $u),
    ]);
}

/* ─── Comparativo entre equipes (Gestor/TI — visão "overviewer", sem ser membro) ─── */
case 'compare': {
    if (!in_array($u['role'] ?? '', ['gestor','ti','suporte'], true)) {
        error_response('Apenas Gestor e TI podem comparar equipes.', 403);
    }
    $build = function ($tid) {
        $tid = (string)$tid;
        $t = one("SELECT * FROM teams WHERE id=? AND type<>'personal' AND archived=0", [$tid]);
        return $t ? ['team' => hydrate_team($t), 'stats' => team_stats($tid)] : null;
    };
    json_out(['a' => $build($param('a','')), 'b' => $build($param('b',''))]);
}

/* ─── Sugestão de META INTELIGENTE (analisa histórico da equipe) ─── */
case 'smart_goal': {
    $teamId = (string)$param('team_id', $param('id',''));
    if ($teamId === '') error_response('Equipe obrigatória.', 400);
    $er = effective_team_role($teamId, $u);
    if (($u['role'] ?? '') !== 'ti' && !($er && can_in_team($er, 'manage_team')))
        error_response('Sem permissão.', 403);
    json_out(['suggestion' => smart_goal_suggestion($teamId)]);
}

/* ─── Configurações da equipe (metas, campos do card, campo extra) ─── */
case 'update_config': {
    $teamId = (string)$param('team_id', $param('id',''));
    $t = one("SELECT * FROM teams WHERE id=?", [$teamId]);
    if (!$t) error_response('Equipe não encontrada.', 404);
    $er = effective_team_role($teamId, $u);
    if (!$er || !can_in_team($er, 'manage_team')) error_response('Sem permissão para configurar esta equipe.', 403);

    $set = []; $vals = [];
    // Duração máxima do aviso: SÓ o TI da equipe (ou TI-Dev/Sup do sistema) altera —
    // isso impede que um gestor levante o próprio teto ao publicar avisos.
    if ($param('noticeMaxHours', null) !== null) {
        $isTeamTI = ($er === 'ti') || in_array(($u['role'] ?? ''), ['ti','suporte'], true);
        if ($isTeamTI) { $set[]='notice_max_hours=?'; $vals[]=max(1, min(720, (int)$param('noticeMaxHours'))); }
    }
    if ($param('goalWeekly', null) !== null)  { $set[]='goal_weekly=?';  $vals[]=max(0,(int)$param('goalWeekly')); }
    if ($param('goalMonthly', null) !== null) { $set[]='goal_monthly=?'; $vals[]=max(0,(int)$param('goalMonthly')); }
    if ($param('smartGoalAuto', null) !== null) { $set[]='smart_goal_auto=?'; $vals[]=(int)(bool)$param('smartGoalAuto'); }
    if (array_key_exists('cardFields', $body)) {
        $cf = is_array($body['cardFields']) ? $body['cardFields'] : [];
        $clean = [];
        foreach ($cf as $k=>$v) { if (in_array($v,['required','optional','hidden'],true)) $clean[$k]=$v; }
        $set[]='card_fields=?'; $vals[]=json_encode($clean, JSON_UNESCAPED_UNICODE);
    }
    if (array_key_exists('extraField', $body)) {
        $ef = is_array($body['extraField']) ? $body['extraField'] : [];
        $opts = array_values(array_filter(array_map('trim', (array)($ef['options'] ?? []))));
        $clean = [
            'enabled'  => (bool)($ef['enabled'] ?? false),
            'label'    => trim((string)($ef['label'] ?? 'Campo extra')) ?: 'Campo extra',
            'required' => (bool)($ef['required'] ?? false),
            'options'  => $opts,
        ];
        $set[]='extra_field=?'; $vals[]=json_encode($clean, JSON_UNESCAPED_UNICODE);
    }
    if (array_key_exists('extraPeople', $body)) {
        // Pessoas externas (ainda não-usuárias): objetos {name, userId, email}.
        // Compatível com a forma antiga (lista de nomes string).
        $raw = is_array($body['extraPeople']) ? $body['extraPeople'] : [];
        $seen = []; $people = [];
        foreach ($raw as $p) {
            if (is_string($p)) $p = ['name' => $p, 'userId' => '', 'email' => ''];
            if (!is_array($p)) continue;
            $name = trim((string)($p['name'] ?? ''));
            if ($name === '') continue;
            $userId = trim((string)($p['userId'] ?? ''));
            $email  = trim((string)($p['email'] ?? ''));
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $email = '';
            $k = mb_strtolower($name, 'UTF-8');
            if (isset($seen[$k])) continue;
            $seen[$k] = 1;
            $people[] = ['name' => $name, 'userId' => $userId, 'email' => $email];
        }
        $set[]='extra_people=?'; $vals[]=json_encode($people, JSON_UNESCAPED_UNICODE);
    }
    if ($set) { $vals[]=$teamId; q("UPDATE teams SET ".implode(',',$set)." WHERE id=?", $vals); bump_revision('team',$teamId,'config'); }
    // Se a meta inteligente automática estiver ligada e já houver histórico,
    // aplica/ajusta a meta imediatamente.
    $t2 = one("SELECT * FROM teams WHERE id=?", [$teamId]);
    if ($t2) { $t2 = maybe_autoupdate_goal($t2); }
    json_out(['ok'=>true, 'goalWeekly'=>(int)($t2['goal_weekly']??0), 'goalMonthly'=>(int)($t2['goal_monthly']??0), 'noticeMaxHours'=>(int)($t2['notice_max_hours']??48)]);
}

/* ─── Atualizar perfil da equipe (nome, descrição, cor, ícone) ─── */
case 'update': {
    $teamId = (string)$param('team_id', $param('id',''));
    $t = one("SELECT * FROM teams WHERE id=?", [$teamId]);
    if (!$t) error_response('Equipe não encontrada.', 404);
    $er = effective_team_role($teamId, $u);
    if (!$er || !can_in_team($er, 'manage_team')) error_response('Sem permissão para editar esta equipe.', 403);
    if ($t['type'] === 'personal') error_response('O quadro pessoal não é editável aqui.', 400);
    $fields = [];
    $vals = [];
    foreach (['name'=>'name','description'=>'description','color'=>'color','icon'=>'icon'] as $bk=>$col) {
        $v = $param($bk, null);
        if ($v !== null) { $fields[] = "$col=?"; $vals[] = (string)$v; }
    }
    if ($fields) {
        $vals[] = $teamId;
        q("UPDATE teams SET " . implode(',', $fields) . " WHERE id=?", $vals);
        bump_revision('team', $teamId, 'update');
    }
    json_out(['ok' => true, 'team' => hydrate_team(one("SELECT * FROM teams WHERE id=?", [$teamId]))]);
}

/* ─── Arquivar / desarquivar equipe (dono, gestor ou TI) ─── */
case 'archive': {
    $teamId = (string)$param('team_id', $param('id',''));
    $t = one("SELECT * FROM teams WHERE id=?", [$teamId]);
    if (!$t) error_response('Equipe não encontrada.', 404);
    if ($t['type'] !== 'team') error_response('Esta equipe não pode ser arquivada.', 400);
    $er = effective_team_role($teamId, $u);
    if (!$er || !can_in_team($er, 'manage_team')) error_response('Sem permissão.', 403);
    $to = (int)!$t['archived'];
    q("UPDATE teams SET archived=? WHERE id=?", [$to, $teamId]);
    bump_revision('team', $teamId, 'archive');
    json_out(['ok' => true, 'archived' => $to]);
}

/* ─── Excluir equipe PERMANENTEMENTE (gestor, TI da equipe, TI-Dev, TI-Sup) ─── */
case 'delete': {
    require_once __DIR__ . '/../lib/photos.php';
    $teamId = (string)$param('team_id', $param('id',''));
    $t = one("SELECT * FROM teams WHERE id=?", [$teamId]);
    if (!$t) error_response('Equipe não encontrada.', 404);
    if ($t['type'] === 'personal') error_response('O quadro pessoal não pode ser excluído.', 400);
    $er = effective_team_role($teamId, $u);
    // gestor e TI da equipe têm 'manage_team'; TI-Dev/TI-Sup entram via bypass (gestor)
    if (!$er || !can_in_team($er, 'manage_team')) error_response('Sem permissão para excluir esta equipe.', 403);

    $cardIds = array_column(all("SELECT id FROM cards WHERE team_id=?", [$teamId]), 'id');
    tx(function() use ($teamId, $cardIds) {
        if ($cardIds) {
            $ph = implode(',', array_fill(0, count($cardIds), '?'));
            foreach (['subtasks','comments','card_history','card_tags','card_requested_by',
                      'card_helpers','links','attachments','card_custom_values'] as $tbl) {
                try { q("DELETE FROM $tbl WHERE card_id IN ($ph)", $cardIds); } catch (Throwable $e) {}
            }
            try { q("DELETE FROM comment_reactions WHERE comment_id IN (SELECT id FROM comments WHERE card_id IN ($ph))", $cardIds); } catch (Throwable $e) {}
            try { q("DELETE FROM card_blocks WHERE blocker_card_id IN ($ph) OR blocked_card_id IN ($ph)", array_merge($cardIds, $cardIds)); } catch (Throwable $e) {}
        }
        q("DELETE FROM cards        WHERE team_id=?", [$teamId]);
        q("DELETE FROM columns      WHERE team_id=?", [$teamId]);
        q("DELETE FROM team_members WHERE team_id=?", [$teamId]);
        try { q("DELETE FROM team_invites WHERE team_id=?", [$teamId]); } catch (Throwable $e) {}
        try { q("DELETE FROM notices      WHERE team_id=?", [$teamId]); } catch (Throwable $e) {}
        q("DELETE FROM teams        WHERE id=?", [$teamId]);
    });
    // remove BLOBs (anexos + fotos da equipe) no banco de imagens
    foreach ($cardIds as $cid) { try { attach_delete_by_card($cid); } catch (Throwable $e) {} }
    try { photo_delete('team', $teamId, 'avatar'); photo_delete('team', $teamId, 'cover'); } catch (Throwable $e) {}

    bump_revision('team', $teamId, 'delete');
    json_out(['ok' => true, 'deleted' => $teamId]);
}

/* ─── Todos os usuários do sistema (aba Usuários) ─── */
case 'users': {
    $rows = all("SELECT user_id, name, display_name, role, avatar_url, cover_url,
                        department, job_title, active_title, is_active
                 FROM users WHERE is_active = 1 ORDER BY name");
    // cargos por equipe (não-pessoal) de cada usuário → badges contextuais
    $memberships = all("SELECT tm.user_id, tm.role, t.name AS team_name, t.icon AS team_icon
                        FROM team_members tm JOIN teams t ON t.id = tm.team_id
                        WHERE t.type != 'personal' AND t.archived = 0
                        ORDER BY CASE tm.role WHEN 'gestor' THEN 0 WHEN 'ti' THEN 1 WHEN 'analista' THEN 2 ELSE 3 END, t.name");
    $byUser = [];
    foreach ($memberships as $m) {
        $byUser[$m['user_id']][] = ['role'=>$m['role'], 'team'=>$m['team_name'], 'icon'=>$m['team_icon']];
    }
    // Quem está DE FÉRIAS hoje (férias aprovadas que cobrem a data atual).
    $today = date('Y-m-d');
    $onVac = [];
    foreach (all("SELECT user_id, MAX(end_date) AS until FROM vacations
                  WHERE status='approved' AND start_date <= ? AND end_date >= ?
                  GROUP BY user_id", [$today, $today]) as $vv) {
        $onVac[$vv['user_id']] = $vv['until'];
    }
    foreach ($rows as &$r) {
        $r['teamRoles'] = $byUser[$r['user_id']] ?? [];
        $r['on_vacation'] = isset($onVac[$r['user_id']]) ? 1 : 0;
        $r['vacation_until'] = $onVac[$r['user_id']] ?? '';
    }
    unset($r);
    json_out(['users' => $rows]);
}

default:
    error_response('action_invalida', 400);
}
