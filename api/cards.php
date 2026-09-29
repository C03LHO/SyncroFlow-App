<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/cards.php
   CRUD completo de cards + arquivamento, aprovação, delegação.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/hydrate.php';
require_once __DIR__ . '/../lib/revision.php';
require_once __DIR__ . '/../lib/teams.php';
require_once __DIR__ . '/../lib/notify_mail.php';
require_once __DIR__ . '/../lib/automations.php';

$u      = require_login();
$action = $_GET['action'] ?? 'list';
$body   = json_in();

/** Equipe de um card (default se nulo). */
function _team_of_card(string $cardId): ?string {
    $t = scalar("SELECT team_id FROM cards WHERE id = ?", [$cardId]);
    if ($t === false) return null;
    return $t ?: 'team-default';
}
/** Coluna "concluído": id literal 'concluido' ou a de MAIOR position da equipe. */
function _is_done_column(?string $colId, ?string $teamId): bool {
    if (!$colId) return false;
    if ($colId === 'concluido') return true;
    return $colId === _done_col_id($teamId);
}
/** Id da coluna "concluído" de uma equipe (pela FLAG is_done; fallback: maior position; depois 'concluido'). */
function _done_col_id(?string $teamId): string {
    $tid = $teamId ?: 'team-default';
    $id = scalar("SELECT id FROM columns WHERE team_id = ? AND is_done = 1 ORDER BY position DESC LIMIT 1", [$tid]);
    if ($id !== false && $id) return $id;
    $id = scalar("SELECT id FROM columns WHERE team_id = ? ORDER BY position DESC LIMIT 1", [$tid]);
    return ($id !== false && $id) ? $id : 'concluido';
}
/** Garante que o usuário tem o papel necessário NA EQUIPE (TI = bypass). */
function _team_guard(string $teamId, array $u, string $action): void {
    $r = effective_team_role($teamId, $u);
    if (!$r || !can_in_team($r, $action)) {
        error_response('Sem permissão nesta equipe para: ' . $action, 403);
    }
}

/** Aplica os campos N:N (tags, requestedBy, helpers, blocks) com replace-all. */
function _save_card_n2n(string $cid, array $body): void {
    if (array_key_exists('tags', $body)) {
        q("DELETE FROM card_tags WHERE card_id = ?", [$cid]);
        foreach ($body['tags'] as $t) {
            if ($t === '' || $t === null) continue;
            q("INSERT OR IGNORE INTO card_tags (card_id, tag) VALUES (?,?)", [$cid, (string)$t]);
        }
    }
    if (array_key_exists('requestedBy', $body)) {
        q("DELETE FROM card_requested_by WHERE card_id = ?", [$cid]);
        foreach ($body['requestedBy'] as $p) {
            q("INSERT OR IGNORE INTO card_requested_by (card_id, person_name) VALUES (?,?)", [$cid, (string)$p]);
        }
    }
    if (array_key_exists('helpers', $body)) {
        q("DELETE FROM card_helpers WHERE card_id = ?", [$cid]);
        foreach ($body['helpers'] as $p) {
            q("INSERT OR IGNORE INTO card_helpers (card_id, person_name) VALUES (?,?)", [$cid, (string)$p]);
        }
    }
    if (array_key_exists('blocks', $body)) {
        q("DELETE FROM card_blocks WHERE blocker_card_id = ?", [$cid]);
        foreach ($body['blocks'] as $bid) {
            if ($bid === $cid) continue;
            q("INSERT OR IGNORE INTO card_blocks (blocker_card_id, blocked_card_id) VALUES (?,?)",
              [$cid, (string)$bid]);
        }
    }
    if (array_key_exists('blockedBy', $body)) {
        q("DELETE FROM card_blocks WHERE blocked_card_id = ?", [$cid]);
        foreach ($body['blockedBy'] as $bid) {
            if ($bid === $cid) continue;
            q("INSERT OR IGNORE INTO card_blocks (blocker_card_id, blocked_card_id) VALUES (?,?)",
              [(string)$bid, $cid]);
        }
    }
    if (array_key_exists('customValues', $body) && is_array($body['customValues'])) {
        q("DELETE FROM card_custom_values WHERE card_id = ?", [$cid]);
        foreach ($body['customValues'] as $fid => $val) {
            q("INSERT INTO card_custom_values (card_id, field_id, value) VALUES (?,?,?)",
              [$cid, (string)$fid, is_array($val) ? json_encode($val) : (string)$val]);
        }
    }
}

function _add_history(string $cid, string $user, string $action): void {
    q("INSERT INTO card_history (card_id, user_name, timestamp, action) VALUES (?,?,?,?)",
      [$cid, $user, now_iso(), $action]);
}

/** Cria a próxima ocorrência de um card recorrente (chamado ao concluí-lo). */
function _spawn_next_occurrence(string $cardId): void {
    $src = one("SELECT * FROM cards WHERE id=?", [$cardId]);
    if (!$src) return;
    $rec = $src['recurrence'] ?? 'none';
    if ($rec === 'none' || (int)($src['recur_done'] ?? 0) === 1) return;

    $base = $src['due_date'] ?: gmdate('Y-m-d');
    $step = ['daily' => '+1 day', 'weekly' => '+1 week', 'monthly' => '+1 month'][$rec] ?? '+1 week';
    $newDue = gmdate('Y-m-d', strtotime($step, strtotime($base)));
    $firstCol = scalar("SELECT id FROM columns WHERE team_id=? ORDER BY position ASC LIMIT 1", [$src['team_id']]) ?: $src['column_id'];
    $newId = uid(); $now = now_iso();
    q("INSERT INTO cards (id, team_id, column_id, title, description, assignee, start_date, due_date,
            projection_status, priority, progress, progress_mode, vision, color,
            est_hours, recurrence, revision, created_at, updated_at, updated_by_user_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,1,?,?,?)", [
        $newId, $src['team_id'], $firstCol, $src['title'], $src['description'], $src['assignee'],
        null, $newDue, 'no-prazo', $src['priority'], $src['progress_mode'], $src['vision'], $src['color'],
        $src['est_hours'], $rec, $now, $now, $src['updated_by_user_id'],
    ]);
    foreach (all("SELECT tag FROM card_tags WHERE card_id=?", [$cardId]) as $t)
        q("INSERT OR IGNORE INTO card_tags (card_id, tag) VALUES (?,?)", [$newId, $t['tag']]);
    q("UPDATE cards SET recur_done=1 WHERE id=?", [$cardId]);   // não gera de novo
    _add_history($newId, 'Sistema', 'Gerado automaticamente (card recorrente)');
}

/**
 * 🤖 Auto-conclusão: se o card chegou a 100% e NÃO está na coluna final,
 * move sozinho para a coluna de concluídos da equipe. Devolve true se moveu.
 * Mantém o sistema "inteligente": 100% ⇄ coluna final nas DUAS direções.
 */
function _maybe_autocomplete(string $id, string $actorName): bool {
    $teamId = _team_of_card($id);
    if (!$teamId) return false;
    $c = one("SELECT column_id, progress FROM cards WHERE id=?", [$id]);
    if (!$c || (int)$c['progress'] < 100) return false;
    if (_is_done_column($c['column_id'], $teamId)) return false;
    $doneCol = _done_col_id($teamId);
    if ($doneCol === '' || $doneCol === $c['column_id']) return false;
    q("UPDATE cards SET column_id=?, projection_status='no-prazo', updated_at=? WHERE id=?",
      [$doneCol, now_iso(), $id]);
    _add_history($id, $actorName, 'Concluído automaticamente (100%) → movido para a coluna final');
    $title = (string)(scalar("SELECT title FROM cards WHERE id=?", [$id]) ?: 'card');
    _notify_watchers($id, $actorName . ' concluiu «' . $title . '» (100%).', $actorName);
    try { _spawn_next_occurrence($id); } catch (Throwable $e) {}   // card recorrente
    return true;
}

/** Notifica os seguidores (watchers) do card, exceto quem disparou a ação. */
function _notify_watchers(string $cid, string $msg, string $exceptName = ''): void {
    try {
        foreach (all("SELECT us.name FROM card_watchers w JOIN users us ON us.user_id = w.user_id
                      WHERE w.card_id = ?", [$cid]) as $w) {
            if ($w['name'] !== '' && strcasecmp($w['name'], $exceptName) !== 0)
                notify($w['name'], $msg, 'info', $cid);
        }
    } catch (Throwable $e) { /* best-effort */ }
}

switch ($action) {

case 'list': {
    $teamId = (string)($_GET['team'] ?? $body['team'] ?? 'team-default');
    json_out(['cards' => hydrate_cards(['archived' => false, 'team_id' => $teamId])]);
}

/* Cards do USUÁRIO em TODAS as suas equipes (visão unificada do "Meu Quadro").
   Normaliza a coluna de cada equipe em 3 baldes: todo / doing / done. */
case 'my_cross_team': {
    $myName = strtolower(trim($u['name'] ?? ''));
    $teamsInfo = [];   // teamId => {name,color,buckets:{todo,doing,done}}
    $out = [];
    foreach (user_teams($u['user_id']) as $t) {
        $tid = $t['id'];
        $cols = all("SELECT id, name, position FROM columns WHERE team_id=? ORDER BY position", [$tid]);
        if (!$cols) continue;
        $doneId  = team_done_column_id($tid);
        $firstId = $cols[0]['id'];
        // "doing": primeira coluna que não seja a inicial nem a concluída
        $doingId = $firstId;
        foreach ($cols as $c) { if ($c['id'] !== $firstId && $c['id'] !== $doneId) { $doingId = $c['id']; break; } }
        $teamsInfo[$tid] = [
            'name' => $t['name'], 'color' => $t['color'] ?? '#00796D',
            'buckets' => ['todo' => $firstId, 'doing' => $doingId, 'done' => $doneId],
        ];
        foreach (hydrate_cards(['team_id' => $tid, 'archived' => false]) as $card) {
            if (strtolower(trim($card['assignee'] ?? '')) !== $myName || $myName === '') continue;
            $col = $card['columnId'];
            $card['bucket'] = $col === $doneId ? 'done' : ($col === $firstId ? 'todo' : 'doing');
            $card['teamId'] = $tid;
            $card['teamName'] = $t['name'];
            $card['teamColor'] = $t['color'] ?? '#00796D';
            $card['teamIcon'] = $t['icon'] ?? '👥';
            $out[] = $card;
        }
    }
    json_out(['cards' => $out, 'teams' => $teamsInfo]);
}

case 'get': {
    $id = (string)($_GET['id'] ?? $body['id'] ?? '');
    $c  = hydrate_card($id);
    if (!$c) error_response('card_nao_encontrado', 404);
    if ($c['archived']) {
        $owner = strtolower(trim($c['archivedBy'] ?? ''));
        $me    = strtolower(trim($u['name'] ?? ''));
        if ($owner !== '' && $owner !== $me) error_response('forbidden', 403);
    }
    json_out(['card' => $c]);
}

case 'create': {
    $teamId = (string)($body['teamId'] ?? 'team-default');
    _team_guard($teamId, $u, 'create');
    $id = uid();
    $now = now_iso();
    $g = $body['gains'] ?? [];
    // SLA: se nenhum prazo foi informado, define automaticamente pela prioridade —
    // MAS NÃO no Backlog (é uma "gaveta": cards lá não têm prazo até serem iniciados).
    $prioCreate = (string)($body['priority'] ?? 'media');
    $colCreate  = (string)($body['columnId'] ?? 'backlog');
    $isBacklogCol = $colCreate === 'backlog'
        || (int)scalar("SELECT is_backlog FROM columns WHERE id = ?", [$colCreate]) === 1;
    $dueCreate  = ($body['dueDate'] ?? '') ?: null;
    if ($dueCreate === null && !$isBacklogCol) {
        $slaDays = ['urgente' => 2, 'alta' => 5, 'media' => 10, 'baixa' => 20][$prioCreate] ?? 10;
        $dueCreate = gmdate('Y-m-d', time() + $slaDays * 86400);
    }
    q("INSERT INTO cards (
        id, team_id, column_id, title, description, assignee, start_date, due_date,
        projection_status, priority, progress, progress_mode, vision, color,
        gains_horas_mes, gains_horas_ano, gains_horas_source,
        gains_economia_mes, gains_economia_ano, gains_econ_source, gains_qualitativo,
        est_hours, spent_hours, sprint_id,
        revision, created_at, updated_at, updated_by_user_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)", [
        $id, $teamId, (string)($body['columnId'] ?? 'backlog'),
        (string)($body['title'] ?? 'Sem título'),
        (string)($body['description'] ?? ''),
        (string)($body['assignee'] ?? ''),
        ($body['startDate'] ?? '') ?: null, $dueCreate,
        (string)($body['projectionStatus'] ?? 'no-prazo'),
        $prioCreate,
        (int)($body['progress'] ?? 0),
        (string)($body['progressMode'] ?? 'manual'),
        (string)($body['vision'] ?? ''),
        (string)($body['color'] ?? ''),
        isset($g['horasMes'])    ? (float)$g['horasMes']    : null,
        isset($g['horasAno'])    ? (float)$g['horasAno']    : null,
        (string)($g['horasSource'] ?? ''),
        isset($g['economiaMes']) ? (float)$g['economiaMes'] : null,
        isset($g['economiaAno']) ? (float)$g['economiaAno'] : null,
        (string)($g['econSource'] ?? ''),
        json_encode($g['qualitativo'] ?? []),
        isset($body['estHours'])   && $body['estHours']   !== '' ? (float)$body['estHours']   : null,
        isset($body['spentHours']) && $body['spentHours'] !== '' ? (float)$body['spentHours'] : null,
        (isset($body['sprintId']) && trim((string)$body['sprintId']) !== '') ? (string)$body['sprintId'] : null,
        $now, $now, $u['user_id'],
    ]);
    _save_card_n2n($id, $body);
    _add_history($id, $u['name'], 'Card criado');
    $asg = trim((string)($body['assignee'] ?? ''));
    if ($asg !== '' && strtolower($asg) !== strtolower(trim($u['name'] ?? ''))) {
        notify($asg, $u['name'] . ' criou um card e designou para você: «' . (string)($body['title'] ?? 'card') . '».', 'info', $id);
        mail_notify_assignment($asg, $u['name'], $id, 'created');
    }
    run_automations($id, 'card_created', '', $u['name']);   // 🤖 automações: card criado
    $rev = bump_revision('card', $id, 'create');
    json_out(['card' => hydrate_card($id), 'revision' => $rev], 201);
}

case 'update': {
    $id = (string)($body['id'] ?? '');
    $row = one("SELECT revision, assignee, title FROM cards WHERE id = ?", [$id]);
    if (!$row) error_response('card_nao_encontrado', 404);
    _team_guard(_team_of_card($id), $u, 'edit');
    if (isset($body['revisionSeen']) && (int)$body['revisionSeen'] !== (int)$row['revision']) {
        error_response('conflito', 409, ['current' => hydrate_card($id)]);
    }
    // Lista de campos editáveis
    $set = [];
    $params = [];
    $map = [
        'columnId'        => 'column_id',
        'title'           => 'title',
        'description'     => 'description',
        'assignee'        => 'assignee',
        'startDate'       => 'start_date',
        'dueDate'         => 'due_date',
        'projectionStatus'=> 'projection_status',
        'priority'        => 'priority',
        'progress'        => 'progress',
        'progressMode'    => 'progress_mode',
        'vision'          => 'vision',
        'color'           => 'color',
    ];
    foreach ($map as $bk => $col) {
        if (array_key_exists($bk, $body)) {
            $set[] = "$col = ?";
            $params[] = $body[$bk] === '' && in_array($col,['start_date','due_date']) ? null : $body[$bk];
        }
    }
    // Esforço estimado × realizado (horas) — null quando vazio
    foreach (['estHours' => 'est_hours', 'spentHours' => 'spent_hours'] as $bk => $col) {
        if (array_key_exists($bk, $body)) {
            $set[] = "$col = ?";
            $params[] = ($body[$bk] === '' || $body[$bk] === null) ? null : (float)$body[$bk];
        }
    }
    if (array_key_exists('recurrence', $body)) {
        $rc = in_array($body['recurrence'], ['none','daily','weekly','monthly'], true) ? $body['recurrence'] : 'none';
        $set[] = "recurrence = ?"; $params[] = $rc;
        $set[] = "recur_done = 0";   // mudou a regra → permite gerar de novo
    }
    if (array_key_exists('sprintId', $body)) {
        $sv = trim((string)$body['sprintId']);
        $set[] = "sprint_id = ?"; $params[] = $sv === '' ? null : $sv;
    }
    if (isset($body['gains']) && is_array($body['gains'])) {
        $g = $body['gains'];
        $set[] = "gains_horas_mes = ?";       $params[] = isset($g['horasMes'])    ? (float)$g['horasMes']    : null;
        $set[] = "gains_horas_ano = ?";       $params[] = isset($g['horasAno'])    ? (float)$g['horasAno']    : null;
        $set[] = "gains_horas_source = ?";    $params[] = (string)($g['horasSource'] ?? '');
        $set[] = "gains_economia_mes = ?";    $params[] = isset($g['economiaMes']) ? (float)$g['economiaMes'] : null;
        $set[] = "gains_economia_ano = ?";    $params[] = isset($g['economiaAno']) ? (float)$g['economiaAno'] : null;
        $set[] = "gains_econ_source = ?";     $params[] = (string)($g['econSource'] ?? '');
        $set[] = "gains_qualitativo = ?";     $params[] = json_encode($g['qualitativo'] ?? []);
    }
    $set[] = "revision = revision + 1";
    $set[] = "updated_at = ?";              $params[] = now_iso();
    $set[] = "updated_by_user_id = ?";      $params[] = $u['user_id'];
    $params[] = $id;

    q("UPDATE cards SET " . implode(', ', $set) . " WHERE id = ?", $params);
    _save_card_n2n($id, $body);
    // 🤖 Card inteligente: ao chegar a 100%, vai sozinho para a coluna final.
    if (array_key_exists('progress', $body)) {
        _maybe_autocomplete($id, $u['name']);
        if ((int)$body['progress'] >= 100) run_automations($id, 'progress_100', '', $u['name']);
    }
    if (!empty($body['historyAction'])) {
        _add_history($id, $u['name'], (string)$body['historyAction']);
    }
    // Notifica quando o responsável MUDA para outra pessoa (não o próprio editor).
    if (array_key_exists('assignee', $body)) {
        $newA = trim((string)$body['assignee']);
        $oldA = trim((string)($row['assignee'] ?? ''));
        if ($newA !== '' && strcasecmp($newA, $oldA) !== 0 && strcasecmp($newA, trim($u['name'] ?? '')) !== 0) {
            notify($newA, $u['name'] . ' designou você como responsável pelo card «' . (string)($row['title'] ?? 'card') . '».', 'info', $id);
            mail_notify_assignment($newA, $u['name'], $id, 'assigned');
        }
    }
    $rev = bump_revision('card', $id, 'update');
    json_out(['card' => hydrate_card($id), 'revision' => $rev]);
}

case 'move': {
    $id  = (string)($body['id'] ?? '');
    $col = (string)($body['columnId'] ?? '');
    if (!$id || !$col) error_response('parametros_invalidos', 400);
    $cur = one("SELECT column_id, progress, progress_mode FROM cards WHERE id = ?", [$id]);
    if (!$cur) error_response('card_nao_encontrado', 404);
    $teamId = _team_of_card($id);
    _team_guard($teamId, $u, 'edit');

    // 🤖 Cards mais inteligentes:
    $wasDone = _is_done_column($cur['column_id'], $teamId);
    $nowDone = _is_done_column($col, $teamId);
    $extraSet = ''; $extraVals = [];
    if ($nowDone && (int)$cur['progress'] < 100) {
        // entrou em "Concluído" → preenche 100% (mesmo em modo manual) e zera risco
        $extraSet = ', progress = 100, projection_status = \'no-prazo\'';
        _add_history($id, $u['name'], 'Progresso ajustado para 100% ao concluir');
    } elseif ($wasDone && !$nowDone && (int)$cur['progress'] === 100) {
        // saiu de "Concluído" → não fica 100% num card reaberto; volta a "em andamento"
        $extraSet = ', progress = 50';
        _add_history($id, $u['name'], 'Card reaberto — progresso em 50%');
    }
    q("UPDATE cards SET column_id = ?, revision = revision + 1, updated_at = ?, updated_by_user_id = ?{$extraSet}
       WHERE id = ?", array_merge([$col, now_iso(), $u['user_id']], $extraVals, [$id]));
    _add_history($id, $u['name'], "Movido para coluna {$col}");
    $colName = (string)(scalar("SELECT name FROM columns WHERE id=?", [$col]) ?: $col);
    $mvTitle = (string)(scalar("SELECT title FROM cards WHERE id=?", [$id]) ?: 'card');
    _notify_watchers($id, $u['name'] . ' moveu «' . $mvTitle . '» para ' . $colName . '.', $u['name']);
    if ($nowDone && !$wasDone) { try { _spawn_next_occurrence($id); } catch (Throwable $e) {} }   // card recorrente
    run_automations($id, 'enter_column', $col, $u['name']);                  // 🤖 automações: entrou na coluna
    if ($nowDone) run_automations($id, 'progress_100', '', $u['name']);      // entrou em Concluído ⇒ 100%
    $rev = bump_revision('card', $id, 'move');
    json_out(['card' => hydrate_card($id), 'revision' => $rev]);
}

case 'archive':
case 'unarchive': {
    $id = (string)($body['id'] ?? '');
    _team_guard(_team_of_card($id), $u, 'archive');
    $isArchive = $action === 'archive';
    if ($isArchive) {
        q("UPDATE cards SET archived = 1, archived_by = ?, archived_at = ?,
                            revision = revision + 1, updated_at = ?, updated_by_user_id = ?
           WHERE id = ?", [$u['name'], now_iso(), now_iso(), $u['user_id'], $id]);
        _add_history($id, $u['name'], 'Card arquivado');
    } else {
        // só o autor do arquivamento pode desarquivar
        $row = one("SELECT archived_by FROM cards WHERE id = ?", [$id]);
        if (!$row) error_response('card_nao_encontrado', 404);
        $owner = strtolower(trim($row['archived_by'] ?? ''));
        if ($owner !== '' && $owner !== strtolower(trim($u['name'] ?? ''))) {
            // TI pode desarquivar de qualquer um
            if ($u['role'] !== 'ti') error_response('apenas_autor_do_arquivamento', 403);
        }
        q("UPDATE cards SET archived = 0, archived_by = NULL, archived_at = NULL,
                            revision = revision + 1, updated_at = ?, updated_by_user_id = ?
           WHERE id = ?", [now_iso(), $u['user_id'], $id]);
        _add_history($id, $u['name'], 'Card desarquivado');
    }
    $rev = bump_revision('card', $id, $action);
    json_out(['card' => hydrate_card($id), 'revision' => $rev]);
}

case 'delete': {
    $id = (string)($body['id'] ?? '');
    _team_guard(_team_of_card($id), $u, 'delete');
    q("DELETE FROM cards WHERE id = ?", [$id]);
    $rev = bump_revision('card', $id, 'delete');
    json_out(['ok' => true, 'revision' => $rev]);
}

/* Ações em massa: move / assign / priority / archive / unarchive.
   Permissões verificadas POR CARD sem abortar o lote (cards sem permissão
   são simplesmente ignorados). Devolve os cards atualizados (hidratados). */
case 'bulk': {
    $ids = $body['ids'] ?? [];
    $op  = (string)($body['op'] ?? '');
    if (!is_array($ids) || !$ids || $op === '') error_response('parametros_invalidos', 400);
    if (!in_array($op, ['move','assign','priority','archive','unarchive'], true)) error_response('op_invalida', 400);
    $ids = array_values(array_unique(array_filter(array_map('strval', $ids))));
    if (count($ids) > 300) error_response('muitos_cards', 400);

    // Valida o valor da operação ANTES do laço
    $col = ''; $assignee = ''; $prio = 'media';
    if ($op === 'move') {
        $col = (string)($body['columnId'] ?? '');
        if ($col === '' || !one("SELECT 1 FROM columns WHERE id=?", [$col])) error_response('coluna_invalida', 400);
    } elseif ($op === 'assign') {
        $assignee = (string)($body['assignee'] ?? '');
    } elseif ($op === 'priority') {
        $prio = (string)($body['priority'] ?? 'media');
        if (!in_array($prio, ['baixa','media','alta','urgente'], true)) error_response('prioridade_invalida', 400);
    }
    $needAction = in_array($op, ['archive','unarchive'], true) ? 'archive' : 'edit';

    $updated = []; $skipped = 0; $now = now_iso();
    foreach ($ids as $id) {
        $teamId = _team_of_card($id);
        if (!$teamId) { $skipped++; continue; }
        // Permissão por card (sem encerrar a requisição)
        $r = effective_team_role($teamId, $u);
        if (!$r || !can_in_team($r, $needAction)) { $skipped++; continue; }

        if ($op === 'move') {
            $cur = one("SELECT column_id, progress FROM cards WHERE id=?", [$id]);
            if (!$cur) { $skipped++; continue; }
            $wasDone = _is_done_column($cur['column_id'], $teamId);
            $nowDone = _is_done_column($col, $teamId);
            $extra = '';
            if ($nowDone && (int)$cur['progress'] < 100)                         $extra = ", progress = 100, projection_status = 'no-prazo'";
            elseif ($wasDone && !$nowDone && (int)$cur['progress'] === 100)       $extra = ", progress = 50";
            q("UPDATE cards SET column_id=?, revision=revision+1, updated_at=?, updated_by_user_id=?{$extra} WHERE id=?",
              [$col, $now, $u['user_id'], $id]);
            _add_history($id, $u['name'], "Movido para coluna {$col} (ação em massa)");
            if ($nowDone && !$wasDone) { try { _spawn_next_occurrence($id); } catch (Throwable $e) {} }
            run_automations($id, 'enter_column', $col, $u['name']);              // 🤖 automações (massa)
            if ($nowDone) run_automations($id, 'progress_100', '', $u['name']);
        } elseif ($op === 'assign') {
            q("UPDATE cards SET assignee=?, revision=revision+1, updated_at=?, updated_by_user_id=? WHERE id=?",
              [$assignee, $now, $u['user_id'], $id]);
            _add_history($id, $u['name'], $assignee !== '' ? "Responsável: {$assignee} (ação em massa)" : "Responsável removido (ação em massa)");
        } elseif ($op === 'priority') {
            q("UPDATE cards SET priority=?, revision=revision+1, updated_at=?, updated_by_user_id=? WHERE id=?",
              [$prio, $now, $u['user_id'], $id]);
            _add_history($id, $u['name'], "Prioridade: {$prio} (ação em massa)");
        } elseif ($op === 'archive') {
            q("UPDATE cards SET archived=1, archived_by=?, archived_at=?, revision=revision+1, updated_at=?, updated_by_user_id=? WHERE id=?",
              [$u['name'], $now, $now, $u['user_id'], $id]);
            _add_history($id, $u['name'], 'Card arquivado (ação em massa)');
        } elseif ($op === 'unarchive') {
            $row = one("SELECT archived_by FROM cards WHERE id=?", [$id]);
            $owner = strtolower(trim($row['archived_by'] ?? ''));
            if ($owner !== '' && $owner !== strtolower(trim($u['name'])) && $u['role'] !== 'ti') { $skipped++; continue; }
            q("UPDATE cards SET archived=0, archived_by=NULL, archived_at=NULL, revision=revision+1, updated_at=?, updated_by_user_id=? WHERE id=?",
              [$now, $u['user_id'], $id]);
            _add_history($id, $u['name'], 'Card desarquivado (ação em massa)');
        }
        $updated[] = $id;
    }
    $rev = bump_revision('card', 'bulk', 'bulk_' . $op);
    $cards = array_map(fn($cid) => hydrate_card($cid), $updated);
    json_out(['ok' => true, 'op' => $op, 'count' => count($updated), 'skipped' => $skipped, 'cards' => $cards, 'revision' => $rev]);
}

case 'duplicate': {
    $id  = (string)($body['id'] ?? '');
    $teamId = _team_of_card($id);
    if (!$teamId) error_response('card_nao_encontrado', 404);
    _team_guard($teamId, $u, 'create');
    $src = one("SELECT * FROM cards WHERE id = ?", [$id]);
    if (!$src) error_response('card_nao_encontrado', 404);
    $newId = uid();
    $now   = now_iso();
    tx(function () use ($src, $newId, $now, $u, $teamId, $id) {
        q("INSERT INTO cards (
            id, team_id, column_id, title, description, assignee, start_date, due_date,
            projection_status, priority, progress, progress_mode, vision, color,
            gains_horas_mes, gains_horas_ano, gains_horas_source,
            gains_economia_mes, gains_economia_ano, gains_econ_source, gains_qualitativo,
            revision, created_at, updated_at, updated_by_user_id
          ) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,1,?,?,?)", [
            $newId, $teamId, $src['column_id'], $src['title'] . ' (cópia)', $src['description'],
            '', $src['start_date'], $src['due_date'], $src['projection_status'], $src['priority'],
            $src['progress_mode'], $src['vision'], $src['color'],
            $src['gains_horas_mes'], $src['gains_horas_ano'], $src['gains_horas_source'],
            $src['gains_economia_mes'], $src['gains_economia_ano'], $src['gains_econ_source'],
            $src['gains_qualitativo'], $now, $now, $u['user_id'],
        ]);
        foreach (all("SELECT tag FROM card_tags WHERE card_id = ?", [$id]) as $t) {
            q("INSERT INTO card_tags (card_id, tag) VALUES (?,?)", [$newId, $t['tag']]);
        }
        q("INSERT INTO card_history (card_id, user_name, timestamp, action)
           VALUES (?,?,?,?)", [$newId, $u['name'], $now, 'Card criado por duplicação']);
    });
    $rev = bump_revision('card', $newId, 'create');
    json_out(['card' => hydrate_card($newId), 'revision' => $rev], 201);
}

case 'request_approval': {
    $id = (string)($body['id'] ?? '');
    $teamId = _team_of_card($id);
    _team_guard($teamId, $u, 'edit');
    q("UPDATE cards SET awaiting_approval = 1, approval_requested_by = ?, approval_requested_at = ?,
                        revision = revision + 1, updated_at = ?, updated_by_user_id = ?
       WHERE id = ?", [$u['name'], now_iso(), now_iso(), $u['user_id'], $id]);
    _add_history($id, $u['name'], 'Solicitou aprovação');
    // Notifica os gestores/TI da equipe que há algo para aprovar
    $ctitle = (string)(scalar("SELECT title FROM cards WHERE id=?", [$id]) ?: 'card');
    foreach (all("SELECT us.name FROM team_members tm JOIN users us ON us.user_id = tm.user_id
                  WHERE tm.team_id = ? AND tm.role IN ('gestor','ti')", [$teamId]) as $g) {
        if (strcasecmp($g['name'], $u['name']) !== 0)
            notify($g['name'], $u['name'] . ' pediu aprovação da conclusão do card «' . $ctitle . '».', 'info', $id);
    }
    $rev = bump_revision('card', $id, 'request_approval');
    json_out(['card' => hydrate_card($id), 'revision' => $rev]);
}

case 'approve':
case 'reject': {
    $id = (string)($body['id'] ?? '');
    _team_guard(_team_of_card($id), $u, 'archive'); // aprovar = papel de gestor na equipe
    $isApprove = $action === 'approve';
    $reqBy  = trim((string)(scalar("SELECT approval_requested_by FROM cards WHERE id=?", [$id]) ?: ''));
    $ctitle = (string)(scalar("SELECT title FROM cards WHERE id=?", [$id]) ?: 'card');
    if ($isApprove) {
        $doneCol = _done_col_id(_team_of_card($id));   // coluna final REAL da equipe
        q("UPDATE cards SET awaiting_approval = 0, column_id = ?, progress = 100,
                            projection_status = 'no-prazo',
                            revision = revision + 1, updated_at = ?, updated_by_user_id = ?
           WHERE id = ?", [$doneCol, now_iso(), $u['user_id'], $id]);
        _add_history($id, $u['name'], 'Conclusão aprovada');
    } else {
        q("UPDATE cards SET awaiting_approval = 0,
                            revision = revision + 1, updated_at = ?, updated_by_user_id = ?
           WHERE id = ?", [now_iso(), $u['user_id'], $id]);
        _add_history($id, $u['name'], 'Conclusão rejeitada: ' . (string)($body['reason'] ?? ''));
    }
    // Avisa quem pediu a aprovação
    if ($reqBy !== '' && strcasecmp($reqBy, $u['name']) !== 0) {
        if ($isApprove) {
            notify($reqBy, $u['name'] . ' APROVOU a conclusão do card «' . $ctitle . '». 🎉', 'success', $id);
        } else {
            $reason = trim((string)($body['reason'] ?? ''));
            notify($reqBy, $u['name'] . ' recusou a conclusão do card «' . $ctitle . '».' . ($reason !== '' ? ' Motivo: ' . $reason : ''), 'warn', $id);
        }
    }
    $rev = bump_revision('card', $id, $action);
    json_out(['card' => hydrate_card($id), 'revision' => $rev]);
}

case 'delegate': {
    $id   = (string)($body['id'] ?? '');
    $to   = (string)($body['toUser'] ?? '');
    if (!$id || !$to) error_response('parametros_invalidos', 400);
    _team_guard(_team_of_card($id), $u, 'archive'); // delegar = papel de gestor na equipe
    q("UPDATE cards SET assignee = ?,
                        revision = revision + 1, updated_at = ?, updated_by_user_id = ?
       WHERE id = ?", [$to, now_iso(), $u['user_id'], $id]);
    _add_history($id, $u['name'], "Delegado para {$to}");
    if (strtolower(trim($to)) !== strtolower(trim($u['name'] ?? ''))) {
        notify($to, $u['name'] . ' delegou um card para você: «' . (scalar("SELECT title FROM cards WHERE id=?", [$id]) ?: 'card') . '».', 'info', $id);
        mail_notify_assignment($to, $u['name'], $id, 'delegated');
    }
    $rev = bump_revision('card', $id, 'delegate');
    json_out(['card' => hydrate_card($id), 'revision' => $rev]);
}

/* ─── Seguir / deixar de seguir um card (watchers) ─── */
case 'watch_status': {
    $id = (string)($_GET['id'] ?? $body['id'] ?? '');
    $watching = (int)scalar("SELECT COUNT(*) FROM card_watchers WHERE card_id=? AND user_id=?", [$id, $u['user_id']]) > 0;
    $count    = (int)scalar("SELECT COUNT(*) FROM card_watchers WHERE card_id=?", [$id]);
    json_out(['watching' => $watching, 'count' => $count]);
}
case 'watch': {
    $id = (string)($body['id'] ?? '');
    if (!one("SELECT 1 FROM cards WHERE id=?", [$id])) error_response('card_nao_encontrado', 404);
    $on = !empty($body['on']);
    if ($on) q("INSERT OR IGNORE INTO card_watchers (card_id, user_id, created_at) VALUES (?,?,?)", [$id, $u['user_id'], now_iso()]);
    else     q("DELETE FROM card_watchers WHERE card_id=? AND user_id=?", [$id, $u['user_id']]);
    $count = (int)scalar("SELECT COUNT(*) FROM card_watchers WHERE card_id=?", [$id]);
    json_out(['watching' => $on, 'count' => $count]);
}

default:
    error_response('action_invalida', 400);
}
