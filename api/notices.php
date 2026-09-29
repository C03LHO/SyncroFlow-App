<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/notices.php (v12.1)
   Mural de avisos com escopo:
   - TI: pode publicar GLOBAL (team_id NULL) ou para uma equipe.
   - Gestor: só para equipes que ele gerencia.
   - Todos veem: avisos globais + avisos das equipes de que participam.
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/revision.php';
require_once __DIR__ . '/../lib/teams.php';

$u = require_login();
$action = $_GET['action'] ?? 'list';
$body = json_in();

/** Pode publicar avisos para esta equipe? */
function _can_post_notice(array $u, ?string $teamId): bool {
    if ($u['role'] === 'ti') return true;                   // TI: global ou qualquer equipe
    if (!$teamId) return false;                              // só TI publica global
    return effective_team_role($teamId, $u) === 'gestor';   // gestor: sua equipe
}

/** Pode editar/excluir ESTE aviso? Apenas quem publicou (author_id) — o TI-Dev
 *  mantém override de administrador para moderação. */
function _can_edit_notice(array $u, array $n): bool {
    if (!empty($n['author_id']) && $n['author_id'] === $u['user_id']) return true;
    return $u['role'] === 'ti';                              // override do administrador
}

/** Duração máxima (horas) de um aviso na equipe. Global (sem equipe) = padrão 48h. */
function _notice_max_hours(?string $teamId): int {
    $def = 48;
    if (!$teamId) return $def;
    $v = (int)(scalar("SELECT notice_max_hours FROM teams WHERE id=?", [$teamId]) ?: $def);
    return $v > 0 ? $v : $def;
}

/** Clampa expires_at para no máximo $maxHours após o início (ou "agora", se sem
 *  início agendado). Vazio vira o teto → nenhum aviso passa da duração máxima. */
function _clamp_notice_expiry(?string $startsAt, ?string $expiresAt, int $maxHours): string {
    $base = $startsAt ? strtotime($startsAt) : time();
    if ($base === false) $base = time();
    $limit = $base + $maxHours * 3600;
    $exp = $expiresAt ? strtotime($expiresAt) : null;
    if ($exp === false) $exp = null;
    if ($exp === null || $exp > $limit) $exp = $limit;
    return gmdate('Y-m-d\TH:i:s.000\Z', $exp);
}

require_once __DIR__ . '/../lib/notices.php';   // _notice_visible_now (compartilhado com a hidratação)

switch ($action) {

case 'list': {
    // Quem gerencia (TI ou gestor da equipe) também vê avisos agendados/fora de janela,
    // marcados com _scheduled, para poder editá-los. Os demais só veem os ativos agora.
    $manage = !empty($body['manage']) || ($_GET['manage'] ?? '') === '1';
    $myTeamIds = array_column(user_teams($u['user_id']), 'id');
    $placeholders = $myTeamIds ? implode(',', array_fill(0, count($myTeamIds), '?')) : "''";
    $params = $myTeamIds;
    $rows = all(
        "SELECT n.*, t.name AS team_name FROM notices n
         LEFT JOIN teams t ON t.id = n.team_id
         WHERE (n.team_id IS NULL OR n.team_id IN ($placeholders))
         ORDER BY n.created_at DESC", $params);
    $nowTs = time();
    $out = [];
    foreach ($rows as $r) {
        $visible = _notice_visible_now($r, $nowTs);
        if (!$visible && !($manage && _can_post_notice($u, $r['team_id']))) continue;
        $r['_active'] = $visible ? 1 : 0;
        $out[] = $r;
    }
    json_out(['notices' => $out]);
}

case 'create': {
    $teamId = $body['teamId'] ?? null;
    if ($teamId === '' ) $teamId = null;
    if (!_can_post_notice($u, $teamId)) {
        error_response('Sem permissão para publicar este aviso.', 403);
    }
    $id = uid();
    $rec = in_array(($body['recurrence'] ?? 'none'), ['none','daily','weekly','monthly'], true)
         ? $body['recurrence'] : 'none';
    // Aplica o teto de duração da equipe (padrão 48h): mesmo sem término, o aviso expira.
    $startsAt = ($body['startsAt'] ?? '') ?: null;
    $expiresAt = _clamp_notice_expiry($startsAt, ($body['expiresAt'] ?? '') ?: null, _notice_max_hours($teamId));
    q("INSERT INTO notices (id, text, type, author, author_id, team_id, created_at, starts_at, expires_at, recurrence, recur_until)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [$id, (string)($body['text'] ?? ''), (string)($body['type'] ?? 'info'),
       $u['name'], $u['user_id'], $teamId, now_iso(),
       $startsAt,
       $expiresAt,
       $rec,
       ($body['recurUntil'] ?? '') ?: null]);
    bump_revision('notice', $id, 'create');
    json_out(['ok'=>true, 'id'=>$id], 201);
}

case 'update': {
    $id = (string)($body['id'] ?? '');
    $n = one("SELECT team_id, author_id FROM notices WHERE id=?", [$id]);
    if (!$n) error_response('nao_encontrado', 404);
    if (!_can_edit_notice($u, $n)) error_response('Apenas quem publicou o aviso pode editá-lo.', 403);
    foreach (['text','type'] as $k) if (array_key_exists($k,$body))
        q("UPDATE notices SET $k=? WHERE id=?", [(string)$body[$k], $id]);
    if (array_key_exists('startsAt',$body))
        q("UPDATE notices SET starts_at=? WHERE id=?", [$body['startsAt'] ?: null, $id]);
    if (array_key_exists('expiresAt',$body))
        q("UPDATE notices SET expires_at=? WHERE id=?", [$body['expiresAt'] ?: null, $id]);
    if (array_key_exists('recurrence',$body)) {
        $rec = in_array($body['recurrence'], ['none','daily','weekly','monthly'], true) ? $body['recurrence'] : 'none';
        q("UPDATE notices SET recurrence=? WHERE id=?", [$rec, $id]);
    }
    if (array_key_exists('recurUntil',$body))
        q("UPDATE notices SET recur_until=? WHERE id=?", [$body['recurUntil'] ?: null, $id]);
    // Reaplica o teto de duração após qualquer edição (padrão 48h).
    $cur = one("SELECT starts_at, expires_at FROM notices WHERE id=?", [$id]);
    q("UPDATE notices SET expires_at=? WHERE id=?",
      [_clamp_notice_expiry($cur['starts_at'] ?? null, $cur['expires_at'] ?? null, _notice_max_hours($n['team_id'])), $id]);
    q("UPDATE notices SET edited_at=?, edited_by=? WHERE id=?", [now_iso(), $u['name'], $id]);
    bump_revision('notice', $id, 'update');
    json_out(['ok'=>true]);
}

case 'delete': {
    $id = (string)($body['id'] ?? '');
    $n = one("SELECT team_id, author_id FROM notices WHERE id=?", [$id]);
    if (!$n) error_response('nao_encontrado', 404);
    if (!_can_edit_notice($u, $n)) error_response('Apenas quem publicou o aviso pode excluí-lo.', 403);
    q("DELETE FROM notices WHERE id=?", [$id]);
    bump_revision('notice', $id, 'delete');
    json_out(['ok'=>true]);
}

/** Equipes em que o usuário pode publicar avisos (para o seletor). */
case 'postable_teams': {
    $teams = [];
    if ($u['role'] === 'ti') $teams[] = ['id' => '', 'name' => '🌐 Todos (global)'];
    foreach (user_teams($u['user_id']) as $t) {
        if ($t['type'] === 'personal') continue;
        if ($u['role'] === 'ti' || $t['my_role'] === 'gestor') {
            $teams[] = ['id' => $t['id'], 'name' => ($t['icon']??'👥') . ' ' . $t['name']];
        }
    }
    json_out(['teams' => $teams]);
}

default: error_response('action_invalida', 400);
}
