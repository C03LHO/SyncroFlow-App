<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/vacations.php (#10 → Controle de Ausências)
   Ausências GLOBAIS por pessoa (Férias, Atestado, Licença, Folga…).
   A pessoa ESCOLHE qual equipe aprova — os Gestores/TI dessa equipe
   decidem. Sobreposição é só um AVISO que o gestor pode ignorar.
   O TIPO é config-driven (lib/absences.php). Só tipos com usesBalance
   (hoje só Férias) consomem saldo e o limite de 3 períodos.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
require_once __DIR__ . '/../lib/teams.php';
require_once __DIR__ . '/../lib/absences.php';

$u      = require_login();
$action = $_GET['action'] ?? 'list';
$body   = json_in();
$param  = fn($k, $d = null) => $body[$k] ?? $_GET[$k] ?? $d;

function _vac_notify(string $name, string $msg, string $type = 'info'): void {
    if (trim($name) === '') return;
    q("INSERT INTO notifications (id, message, type, for_user, created_at) VALUES (?,?,?,?,?)",
      [uid(), $msg, $type, $name, now_iso()]);
}
function _vac_days(string $s, string $e): int {
    $a = strtotime($s); $b = strtotime($e);
    if ($a === false || $b === false || $b < $a) return 0;
    return (int)floor(($b - $a) / 86400) + 1;
}
/** Nomes (users.name) dos Gestores/TI de uma equipe — quem aprova. */
function _vac_team_managers(string $teamId): array {
    return array_column(all(
        "SELECT us.name FROM team_members tm JOIN users us ON us.user_id = tm.user_id
         WHERE tm.team_id = ? AND tm.role IN ('gestor','ti')", [$teamId]), 'name');
}
/** Pode APROVAR/RECUSAR esta solicitação? Gestor/TI da equipe que ela escolheu
 *  (ou admin). Ninguém aprova as PRÓPRIAS férias — outra pessoa decide. */
function _vac_can_decide_vac(array $vac, array $u): bool {
    if (($vac['user_id'] ?? '') === ($u['user_id'] ?? '')) return false;     // ninguém aprova as próprias
    if (in_array($u['role'] ?? '', ['ti', 'suporte'], true)) return true;     // admin do sistema
    $r = team_role((string)($vac['team_id'] ?? ''), $u['user_id']);
    return $r === 'gestor' || $r === 'ti';
}
/** Pode GERIR (cancelar/alterar) férias desta equipe? Gestor/TI da equipe que
 *  aprova, ou admin do sistema — INCLUSIVE as próprias (o Gestor/TI da equipe tem
 *  poder sobre as férias do time, as suas inclusive). Ao contrário de decidir,
 *  aqui o dono NÃO é excluído. */
function _vac_can_manage_team_vac(array $vac, array $u): bool {
    if (in_array($u['role'] ?? '', ['ti', 'suporte'], true)) return true;     // admin do sistema
    $r = team_role((string)($vac['team_id'] ?? ''), $u['user_id']);
    return $r === 'gestor' || $r === 'ti';
}
/** Pode gerir o saldo da pessoa? Admin ou Gestor/TI de alguma equipe dela. */
function _vac_manages_person(string $owner, array $u): bool {
    if (in_array($u['role'] ?? '', ['ti', 'suporte'], true)) return true;
    if ($owner === ($u['user_id'] ?? '')) return false;
    return (int)scalar(
        "SELECT COUNT(*) FROM team_members tm
         JOIN team_members mgr ON mgr.team_id = tm.team_id AND mgr.user_id = ? AND mgr.role IN ('gestor','ti')
         WHERE tm.user_id = ?", [$u['user_id'], $owner]) > 0;
}

/** Máximo de períodos de férias ATIVOS (pendentes/aprovados) por pessoa. */
const VAC_MAX_PERIODS = 3;
/** Saldo (dias) de férias da pessoa (padrão 30). */
function _vac_balance(string $userId): int {
    return (int)(scalar("SELECT vacation_days FROM users WHERE user_id = ?", [$userId]) ?: 30);
}
/** Soma dos dias de férias ATIVAS (pendentes+aprovadas) da pessoa, exceto um id. */
function _vac_active_days(string $userId, string $excludeId = ''): int {
    return (int)scalar("SELECT COALESCE(SUM(days),0) FROM vacations
                        WHERE user_id = ? AND id <> ? AND status IN ('pending','approved')",
                       [$userId, $excludeId]);
}
/** Quantidade de períodos de férias ATIVOS (pendentes+aprovados), exceto um id. */
function _vac_active_count(string $userId, string $excludeId = ''): int {
    return (int)scalar("SELECT COUNT(*) FROM vacations
                        WHERE user_id = ? AND id <> ? AND status IN ('pending','approved')",
                       [$userId, $excludeId]);
}

switch ($action) {

/* Mapa da equipe ativa: membros + suas férias GLOBAIS + saldo global. */
case 'list': {
    $teamId = (string)$param('team', $param('team_id', ''));
    if ($teamId === '') error_response('equipe_obrigatoria', 400);
    $role = effective_team_role($teamId, $u);
    if (!$role) error_response('forbidden', 403);
    $year = (int)$param('year', (int)date('Y'));

    $members = all("SELECT tm.user_id, tm.role,
                           COALESCE(NULLIF(TRIM(us.display_name),''), us.name) AS name,
                           us.avatar_url, us.vacation_days
                    FROM team_members tm JOIN users us ON us.user_id = tm.user_id
                    WHERE tm.team_id = ? ORDER BY us.name", [$teamId]);
    $ids = array_column($members, 'user_id');

    $vacs = [];
    if ($ids) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $vacs = all("SELECT v.*, COALESCE(NULLIF(TRIM(us.display_name),''), us.name) AS name,
                            t.name AS team_name
                     FROM vacations v
                     JOIN users us ON us.user_id = v.user_id
                     LEFT JOIN teams t ON t.id = v.team_id
                     WHERE v.user_id IN ($ph) AND substr(v.start_date,1,4) = ?
                     ORDER BY v.start_date", array_merge($ids, [(string)$year]));
    }

    // Só FÉRIAS aprovadas consomem o saldo de dias (atestado/licença/folga não).
    $usedBy = [];
    foreach ($vacs as $v)
        if ($v['status'] === 'approved' && absence_type_norm($v['type'] ?? 'ferias') === 'ferias')
            $usedBy[$v['user_id']] = ($usedBy[$v['user_id']] ?? 0) + (int)$v['days'];

    $balances = array_map(function ($m) use ($usedBy, $u) {
        $total = (int)$m['vacation_days']; $used = (int)($usedBy[$m['user_id']] ?? 0);
        return ['user_id' => $m['user_id'], 'name' => $m['name'], 'role' => $m['role'], 'avatar_url' => $m['avatar_url'],
                'total' => $total, 'used' => $used, 'remaining' => max(0, $total - $used),
                'can_edit' => _vac_manages_person($m['user_id'], $u)];
    }, $members);

    $out = array_map(function ($v) use ($u, $vacs) {
        $with = [];
        foreach ($vacs as $o) {
            if ($o['id'] === $v['id'] || $o['user_id'] === $v['user_id'] || $o['status'] === 'rejected') continue;
            if (!($o['end_date'] < $v['start_date'] || $o['start_date'] > $v['end_date'])) $with[] = $o['name'];
        }
        return [
            'id' => $v['id'], 'user_id' => $v['user_id'], 'name' => $v['name'],
            'start_date' => $v['start_date'], 'end_date' => $v['end_date'], 'days' => (int)$v['days'],
            'status' => $v['status'], 'reason' => $v['reason'], 'decided_by' => $v['decided_by'],
            'team_id' => $v['team_id'], 'team_name' => $v['team_name'] ?? '',
            'type' => absence_type_norm($v['type'] ?? 'ferias'),
            'overlap' => count($with) > 0, 'overlap_with' => array_values(array_unique($with)),
            'overlap_ack' => (int)($v['overlap_ack'] ?? 0),
            'can_decide' => _vac_can_decide_vac($v, $u),
            'can_manage' => _vac_can_manage_team_vac($v, $u),
        ];
    }, $vacs);

    json_out([
        'vacations' => $out, 'balances' => $balances, 'year' => $year,
        'me' => $u['user_id'], 'team_role' => $role,
        'types' => absence_types(),   // registro central → front monta filtro/legenda/cores
    ]);
}

/* Solicitar férias — GLOBAL (1x). A pessoa escolhe a equipe que aprova. */
case 'request': {
    $teamId = (string)$param('team_id', '');   // equipe ESCOLHIDA para aprovar
    $t = one("SELECT type FROM teams WHERE id = ? AND archived = 0", [$teamId]);
    if (!$t) error_response('Equipe de aprovação inválida.', 400);
    if ($t['type'] === 'personal') error_response('O Quadro Pessoal não aprova férias — escolha uma equipe.', 400);
    $myRole = team_role($teamId, $u['user_id']);
    if (!$myRole) error_response('Você não participa da equipe escolhida para aprovar.', 403);
    if ($myRole === 'visitante') error_response('Visitantes não solicitam férias.', 403);

    $type = absence_type_norm($param('type', 'ferias'));
    $tLabel = absence_type_label($type);
    $start = trim((string)$param('start_date', '')); $end = trim((string)$param('end_date', ''));
    if ($start === '' || $end === '') error_response('Informe início e fim.', 400);
    $days = _vac_days($start, $end);
    if ($days <= 0) error_response('Período inválido (a data final é anterior à inicial).', 400);
    // sobreposição com QUALQUER período próprio (não dá para ter duas ausências ao mesmo tempo)
    $clash = one("SELECT id FROM vacations WHERE user_id = ? AND status IN ('pending','approved')
                  AND NOT (end_date < ? OR start_date > ?)", [$u['user_id'], $start, $end]);
    if ($clash) error_response('Você já tem uma ausência que se sobrepõe a essas datas.', 409);
    // Limite de 3 períodos + saldo: SÓ para tipos que consomem saldo (hoje só Férias).
    if (absence_type_uses_balance($type)) {
        if (_vac_active_count($u['user_id']) >= VAC_MAX_PERIODS)
            error_response('Você já tem ' . VAC_MAX_PERIODS . ' períodos de férias (pendentes ou aprovados). Cancele um antes de pedir outro.', 409);
        $bal = _vac_balance($u['user_id']);
        $reserved = _vac_active_days($u['user_id']);
        if ($reserved + $days > $bal)
            error_response("Este pedido ($days dias) ultrapassa o seu saldo de $bal dias — você já tem $reserved reservado(s).", 409);
    }

    $id = 'vac-' . uid();
    q("INSERT INTO vacations (id, team_id, user_id, type, start_date, end_date, days, status, reason, created_at)
       VALUES (?,?,?,?,?,?,?, 'pending', ?, ?)",
      [$id, $teamId, $u['user_id'], $type, $start, $end, $days, trim((string)$param('reason', '')), now_iso()]);
    $tn = (string)(scalar("SELECT name FROM teams WHERE id = ?", [$teamId]) ?: 'equipe');
    foreach (_vac_team_managers($teamId) as $nm)
        if (strcasecmp($nm, $u['name']) !== 0)
            _vac_notify($nm, $u['name'] . ' solicitou ' . $tLabel . ' de ' . $start . ' a ' . $end . ' (aprovação por "' . $tn . '").', 'info');
    bump_revision('vacation', $id, 'request');
    json_out(['ok' => true, 'id' => $id], 201);
}

/* Aprovar/recusar — Gestor/TI da equipe escolhida (ou admin). */
case 'respond': {
    $id = (string)$param('id', '');
    $v = one("SELECT * FROM vacations WHERE id = ?", [$id]);
    if (!$v) error_response('Solicitação não encontrada.', 404);
    if (!_vac_can_decide_vac($v, $u)) error_response('Sem permissão para decidir estas férias.', 403);
    if ($v['status'] !== 'pending') error_response('Esta solicitação já foi respondida.', 400);
    $ok = (string)$param('decision', '') === 'approve';
    $reason = trim((string)$param('reason', ''));
    $ack = !empty($param('ack')) ? 1 : (int)($v['overlap_ack'] ?? 0);
    if ($reason !== '') {
        q("UPDATE vacations SET status=?, decided_by=?, decided_at=?, overlap_ack=?, reason=? WHERE id=?",
          [$ok ? 'approved' : 'rejected', $u['name'], now_iso(), $ack, $reason, $id]);
    } else {
        q("UPDATE vacations SET status=?, decided_by=?, decided_at=?, overlap_ack=? WHERE id=?",
          [$ok ? 'approved' : 'rejected', $u['name'], now_iso(), $ack, $id]);
    }
    $un = (string)(scalar("SELECT name FROM users WHERE user_id = ?", [$v['user_id']]) ?: '');
    $tLabel = absence_type_label($v['type'] ?? 'ferias');
    _vac_notify($un, 'Sua ausência — ' . $tLabel . ' (' . $v['start_date'] . ' a ' . $v['end_date'] . ') foi '
        . ($ok ? 'APROVADA ✅' : 'recusada' . ($reason !== '' ? ': ' . $reason : '')) . '.',
        $ok ? 'success' : 'warn');
    bump_revision('vacation', $id, 'respond');
    json_out(['ok' => true]);
}

/* Gestor marca "ok, sem problema" para a sobreposição de um período. */
case 'acknowledge': {
    $id = (string)$param('id', '');
    $v = one("SELECT * FROM vacations WHERE id = ?", [$id]);
    if (!$v) error_response('Não encontrada.', 404);
    if (!_vac_can_decide_vac($v, $u)) error_response('Sem permissão.', 403);
    q("UPDATE vacations SET overlap_ack = 1 WHERE id = ?", [$id]);
    bump_revision('vacation', $id, 'ack');
    json_out(['ok' => true]);
}

/* Saldo GLOBAL de dias por pessoa (users.vacation_days). */
case 'set_balance': {
    $vid = (string)$param('user_id', '');
    if (!_vac_manages_person($vid, $u)) error_response('Sem permissão.', 403);
    if (!one("SELECT 1 FROM users WHERE user_id = ?", [$vid])) error_response('Usuário não encontrado.', 404);
    $days = max(0, min(365, (int)$param('days', 30)));
    q("UPDATE users SET vacation_days = ? WHERE user_id = ?", [$days, $vid]);
    bump_revision('vacation', $vid, 'balance');
    json_out(['ok' => true, 'days' => $days]);
}

/* Cancelar/remover férias:
   - Gestor/TI da equipe (e admin): a qualquer momento, INCLUSIVE as próprias.
   - Membro comum (dono): só o PRÓPRIO pedido e apenas enquanto pendente. */
case 'cancel': {
    $id = (string)$param('id', '');
    $v = one("SELECT * FROM vacations WHERE id = ?", [$id]);
    if (!$v) error_response('Não encontrada.', 404);
    $isOwner   = $v['user_id'] === $u['user_id'];
    $canManage = _vac_can_manage_team_vac($v, $u);
    if (!$isOwner && !$canManage) error_response('Sem permissão.', 403);
    if ($isOwner && !$canManage && $v['status'] !== 'pending')
        error_response('Só dá para cancelar enquanto está pendente.', 400);
    q("DELETE FROM vacations WHERE id = ?", [$id]);
    bump_revision('vacation', $id, 'cancel');
    json_out(['ok' => true]);
}

/* Editar datas/observação de um período:
   - Gestor/TI da equipe (e admin): a qualquer momento, INCLUSIVE as próprias.
   - Membro comum (dono): só o PRÓPRIO pedido e apenas enquanto pendente.
   Mantém o status atual (uma aprovada editada pelo gestor continua aprovada). */
case 'edit': {
    $id = (string)$param('id', '');
    $v = one("SELECT * FROM vacations WHERE id = ?", [$id]);
    if (!$v) error_response('Não encontrada.', 404);
    if (($v['status'] ?? '') === 'rejected') error_response('Não dá para editar férias recusadas — faça um novo pedido.', 400);
    $isOwner   = $v['user_id'] === $u['user_id'];
    $canManage = _vac_can_manage_team_vac($v, $u);
    if (!$isOwner && !$canManage) error_response('Sem permissão.', 403);
    if ($isOwner && !$canManage && $v['status'] !== 'pending')
        error_response('Só dá para editar enquanto está pendente.', 400);

    $type  = $param('type', null) !== null ? absence_type_norm($param('type')) : absence_type_norm($v['type'] ?? 'ferias');
    $start = trim((string)$param('start_date', $v['start_date']));
    $end   = trim((string)$param('end_date', $v['end_date']));
    if ($start === '' || $end === '') error_response('Informe início e fim.', 400);
    $days = _vac_days($start, $end);
    if ($days <= 0) error_response('Período inválido (a data final é anterior à inicial).', 400);
    // sobreposição com OUTROS períodos próprios
    $clash = one("SELECT id FROM vacations WHERE user_id = ? AND id <> ? AND status IN ('pending','approved')
                  AND NOT (end_date < ? OR start_date > ?)", [$v['user_id'], $id, $start, $end]);
    if ($clash) error_response('Essas datas se sobrepõem a outra ausência sua.', 409);
    // saldo: só para tipos que consomem saldo (Férias)
    if (absence_type_uses_balance($type)) {
        $bal = _vac_balance($v['user_id']);
        $reserved = _vac_active_days($v['user_id'], $id);
        if ($reserved + $days > $bal)
            error_response("As novas datas ($days dias) ultrapassam o saldo de $bal dias — há $reserved reservado(s) em outros períodos.", 409);
    }

    $reason = $param('reason', null);
    if ($reason !== null)
        q("UPDATE vacations SET type=?, start_date=?, end_date=?, days=?, reason=? WHERE id=?", [$type, $start, $end, $days, trim((string)$reason), $id]);
    else
        q("UPDATE vacations SET type=?, start_date=?, end_date=?, days=? WHERE id=?", [$type, $start, $end, $days, $id]);
    bump_revision('vacation', $id, 'edit');
    json_out(['ok' => true, 'days' => $days]);
}

/* Lançar férias de OUTRA pessoa (Gestor/TI da equipe, ou admin). Entra já
   APROVADA — é um registro administrativo (ex.: migrar as férias da planilha).
   Respeita os mesmos limites da pessoa: 3 períodos e saldo. */
case 'create_for': {
    $teamId = (string)$param('team_id', '');
    $vid    = (string)$param('user_id', '');
    if (!one("SELECT 1 FROM teams WHERE id = ?", [$teamId])) error_response('Equipe não encontrada.', 404);
    // Permissão: Gestor/TI da equipe (ou TI-Dev/Sup do sistema).
    $er = effective_team_role($teamId, $u);
    $isMgr = in_array($u['role'] ?? '', ['ti','suporte'], true) || $er === 'gestor' || $er === 'ti';
    if (!$isMgr) error_response('Só o Gestor ou o TI da equipe pode lançar férias de outras pessoas.', 403);
    if (!is_team_member($teamId, $vid)) error_response('A pessoa não é membro desta equipe.', 400);

    $type = absence_type_norm($param('type', 'ferias'));
    $start = trim((string)$param('start_date', '')); $end = trim((string)$param('end_date', ''));
    if ($start === '' || $end === '') error_response('Informe início e fim.', 400);
    $days = _vac_days($start, $end);
    if ($days <= 0) error_response('Período inválido (a data final é anterior à inicial).', 400);
    // sobreposição sempre; limite de períodos e saldo só para tipos que consomem saldo (Férias)
    $clash = one("SELECT id FROM vacations WHERE user_id = ? AND status IN ('pending','approved')
                  AND NOT (end_date < ? OR start_date > ?)", [$vid, $start, $end]);
    if ($clash) error_response('Essa pessoa já tem uma ausência que se sobrepõe a essas datas.', 409);
    if (absence_type_uses_balance($type)) {
        if (_vac_active_count($vid) >= VAC_MAX_PERIODS)
            error_response('Essa pessoa já tem ' . VAC_MAX_PERIODS . ' períodos de férias. Cancele um antes de lançar outro.', 409);
        $bal = _vac_balance($vid); $reserved = _vac_active_days($vid);
        if ($reserved + $days > $bal)
            error_response("Este período ($days dias) ultrapassa o saldo de $bal dias dessa pessoa (já reservados: $reserved).", 409);
    }

    $id = 'vac-' . uid();
    q("INSERT INTO vacations (id, team_id, user_id, type, start_date, end_date, days, status, reason, decided_by, decided_at, created_at)
       VALUES (?,?,?,?,?,?,?, 'approved', ?, ?, ?, ?)",
      [$id, $teamId, $vid, $type, $start, $end, $days, trim((string)$param('reason', '')), $u['name'], now_iso(), now_iso()]);
    $un = (string)(scalar("SELECT name FROM users WHERE user_id = ?", [$vid]) ?: '');
    if ($un) _vac_notify($un, $u['name'] . ' registrou sua ausência — ' . absence_type_label($type) . ' de ' . $start . ' a ' . $end . ' (já aprovada).', 'success');
    bump_revision('vacation', $id, 'create_for');
    json_out(['ok' => true, 'id' => $id, 'days' => $days], 201);
}

default:
    error_response('action_invalida', 400);
}
