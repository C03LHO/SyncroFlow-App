<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/hydrate.php
   Funções de hidratação: pegam o estado normalizado do banco
   e devolvem objetos no formato que o frontend antigo esperava
   (com camelCase, subtasks recursivas, reactions em dict, etc.).
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/notices.php';   // _notice_visible_now

/** Hidrata um card por id, com todas as relações. Retorna null se não existir. */
function hydrate_card(string $id): ?array {
    $row = one("SELECT * FROM cards WHERE id = ?", [$id]);
    if (!$row) return null;
    return _card_row_to_object($row);
}

/** Hidrata todos os cards (filtros opcionais: archived, team_id). */
function hydrate_cards(array $opts = []): array {
    $where = [];
    $params = [];
    if (isset($opts['archived'])) {
        $where[] = 'archived = ?';
        $params[] = (int)(bool)$opts['archived'];
    }
    if (isset($opts['team_id'])) {
        $where[] = 'team_id = ?';
        $params[] = (string)$opts['team_id'];
    }
    $sql = "SELECT * FROM cards";
    if ($where) $sql .= " WHERE " . implode(' AND ', $where);
    $sql .= " ORDER BY column_id, id";
    $rows = all($sql, $params);

    if (!$rows) return [];

    $ids = array_column($rows, 'id');
    $_in = _qmarks($ids);   // placeholders "?, ?, ..." reutilizados nos prefetch
    // Pré-carrega N:N de uma vez (evita N+1 em bases grandes)
    $tags          = _group_by('card_id', all("SELECT card_id, tag FROM card_tags WHERE card_id IN ($_in)", $ids));
    $reqs          = _group_by('card_id', all("SELECT card_id, person_name FROM card_requested_by WHERE card_id IN ($_in)", $ids));
    $helpers       = _group_by('card_id', all("SELECT card_id, person_name FROM card_helpers WHERE card_id IN ($_in)", $ids));
    $blocksRows    = all("SELECT blocker_card_id, blocked_card_id FROM card_blocks
                          WHERE blocker_card_id IN ($_in) OR blocked_card_id IN ($_in)",
                          array_merge($ids, $ids));
    $blocksBy      = []; $blocksOf = [];
    foreach ($blocksRows as $b) {
        $blocksOf[$b['blocker_card_id']][] = $b['blocked_card_id'];
        $blocksBy[$b['blocked_card_id']][] = $b['blocker_card_id'];
    }
    $subsRaw       = all("SELECT * FROM subtasks WHERE card_id IN ($_in) ORDER BY card_id, position", $ids);
    $subsByCard    = [];
    foreach ($subsRaw as $s) $subsByCard[$s['card_id']][] = $s;
    $cmsRaw        = all("SELECT * FROM comments WHERE card_id IN ($_in) ORDER BY timestamp ASC", $ids);
    $cmsByCard     = [];
    foreach ($cmsRaw as $cm) $cmsByCard[$cm['card_id']][] = $cm;
    $cmIds = array_column($cmsRaw, 'id');
    $reactsByCm = [];
    if ($cmIds) {
        $rin = _qmarks($cmIds);
        foreach (all("SELECT comment_id, user_name, emoji FROM comment_reactions WHERE comment_id IN ($rin)", $cmIds) as $r) {
            $reactsByCm[$r['comment_id']][$r['emoji']][] = $r['user_name'];
        }
    }
    $histByCard    = [];
    foreach (all("SELECT * FROM card_history WHERE card_id IN ($_in) ORDER BY timestamp ASC", $ids) as $h) {
        $histByCard[$h['card_id']][] = $h;
    }
    $lnkByCard = [];
    foreach (all("SELECT * FROM links WHERE card_id IN ($_in)", $ids) as $l) {
        $lnkByCard[$l['card_id']][] = $l;
    }
    $cvByCard = [];
    foreach (all("SELECT * FROM card_custom_values WHERE card_id IN ($_in)", $ids) as $cv) {
        $cvByCard[$cv['card_id']][$cv['field_id']] = $cv['value'];
    }

    $out = [];
    foreach ($rows as $r) {
        $out[] = _card_row_to_object($r, [
            'tags'        => array_column($tags[$r['id']]    ?? [], 'tag'),
            'requestedBy' => array_column($reqs[$r['id']]    ?? [], 'person_name'),
            'helpers'     => array_column($helpers[$r['id']] ?? [], 'person_name'),
            'blocks'      => $blocksOf[$r['id']] ?? [],
            'blockedBy'   => $blocksBy[$r['id']] ?? [],
            'subtasks'    => _build_subtask_tree($subsByCard[$r['id']] ?? []),
            'comments'    => array_map(function ($cm) use ($reactsByCm) {
                return [
                    'id'        => $cm['id'],
                    'user'      => $cm['user_name'],
                    'timestamp' => $cm['timestamp'],
                    'text'      => $cm['text'],
                    'parentId'  => $cm['parent_id'] ?? null,
                    'reactions' => $reactsByCm[$cm['id']] ?? new stdClass(),
                ];
            }, $cmsByCard[$r['id']] ?? []),
            'history'     => array_map(fn($h) => [
                'user' => $h['user_name'], 'timestamp' => $h['timestamp'], 'action' => $h['action'],
            ], $histByCard[$r['id']] ?? []),
            'links'       => array_map(fn($l) => [
                'id' => $l['id'], 'url' => $l['url'], 'title' => $l['title'],
                'addedAt' => $l['added_at'], 'addedBy' => $l['added_by'],
            ], $lnkByCard[$r['id']] ?? []),
            'customValues' => $cvByCard[$r['id']] ?? new stdClass(),
        ]);
    }
    return $out;
}

/** Snapshot completo do estado para o frontend (usado por state.php e app.php). */
function build_initial_state(array $currentUser, ?string $teamId = null): array {
    require_once __DIR__ . '/revision.php';
    require_once __DIR__ . '/teams.php';

    // Equipes do usuário + equipe ativa
    $myTeams = array_map('hydrate_team', user_teams($currentUser['user_id']));
    $teamIds = array_column($myTeams, 'id');
    $activeTeam = ($teamId && in_array($teamId, $teamIds, true)) ? $teamId : null;
    if (!$activeTeam) {
        $activeTeam = in_array('team-default', $teamIds, true) ? 'team-default' : ($teamIds[0] ?? 'team-default');
    }

    // Cards da equipe ativa (não arquivados + arquivados do próprio usuário)
    $myName = strtolower(trim($currentUser['name'] ?? ''));
    $all = hydrate_cards(['team_id' => $activeTeam]);
    $cards = array_values(array_filter($all, function ($c) use ($myName) {
        if (!$c['archived']) return true;
        return strtolower(trim($c['archivedBy'] ?? '')) === $myName;
    }));
    // Valores dos campos personalizados (mapa field_id => value) por card
    $cardIds = array_column($cards, 'id');
    $cvByCard = [];
    if ($cardIds) {
        $ph = implode(',', array_fill(0, count($cardIds), '?'));
        foreach (all("SELECT card_id, field_id, value FROM card_custom_values WHERE card_id IN ($ph)", $cardIds) as $r) {
            $cvByCard[$r['card_id']][$r['field_id']] = $r['value'];
        }
    }
    foreach ($cards as &$_c) { $_c['customValues'] = (object)($cvByCard[$_c['id']] ?? []); }
    unset($_c);

    $users = all("SELECT user_id, name, role, color, profile_title, active_title,
                         onboarding_done, last_standup_date
                  FROM users WHERE is_active = 1");
    // Reformata para dict indexado por user_id
    $usersDict = [];
    foreach ($users as $u) {
        $usersDict[$u['user_id']] = [
            'name' => $u['name'], 'role' => $u['role'],
            'color' => $u['color'], 'profileTitle' => $u['profile_title'],
        ];
    }

    // Achievements por usuário (formato antigo)
    $achievements = [];
    foreach ($users as $u) {
        $vid = $u['user_id'];
        $trophies = [];
        foreach (all("SELECT trophy_id, unlocked_at FROM trophies WHERE user_id=?",[$vid]) as $t) {
            $trophies[$t['trophy_id']] = ['unlockedAt' => $t['unlocked_at']];
        }
        $titles = [];
        foreach (all("SELECT title_id, unlocked_at FROM titles WHERE user_id=?",[$vid]) as $t) {
            $titles[$t['title_id']] = ['unlockedAt' => $t['unlocked_at']];
        }
        $achievements[$vid] = [
            'trophies' => $trophies,
            'titles'   => $titles,
            'activeTitle'     => $u['active_title'],
            'onboardingDone'  => (bool)$u['onboarding_done'],
            'lastStandupDate' => $u['last_standup_date'],
        ];
    }

    // Monthly performance: dict {user_id: {month: {...}}}
    $monthly = [];
    foreach (all("SELECT * FROM monthly_performance") as $r) {
        $monthly[$r['user_id']][$r['month']] = [
            'concluded'   => (int)$r['concluded'],
            'economy'     => (float)$r['economy'],
            'hoursSaved'  => (float)$r['hours_saved'],
            'avgProgress' => (float)$r['avg_progress'],
        ];
    }

    // system_config -> dict
    $sysCfg = [];
    foreach (all("SELECT key, value FROM system_config") as $r) {
        $v = $r['value'];
        $j = json_decode($v, true);
        $sysCfg[$r['key']] = $j !== null && (is_array($j) || is_object($j)) ? $j : $v;
    }

    // ── Configuração POR EQUIPE (metas, campos do card, campo extra) ──
    // Lê a config da equipe ativa; cai para os globais legados se vazia.
    $activeRow = one("SELECT goal_weekly, goal_monthly, card_fields, extra_field FROM teams WHERE id = ?", [$activeTeam]) ?: [];

    // Campo extra (antiga "Visão") — por equipe
    $extraRaw = json_decode($activeRow['extra_field'] ?? '', true);
    if (is_array($extraRaw) && array_key_exists('enabled', $extraRaw)) {
        $vision = [
            'enabled'  => (bool)$extraRaw['enabled'],
            'label'    => $extraRaw['label'] ?? 'Campo extra',
            'required' => (bool)($extraRaw['required'] ?? false),
            'options'  => $extraRaw['options'] ?? [],
        ];
    } else {
        // fallback global (legado)
        $vision = one("SELECT * FROM vision_config WHERE id = 1");
        if ($vision) {
            $vision['enabled']  = (bool)$vision['enabled'];
            $vision['required'] = (bool)$vision['required'];
            $vision['options']  = json_decode($vision['options'] ?: '[]', true) ?: [];
        }
    }

    // Campos do card — por equipe (sobrescreve o global em $sysCfg)
    $teamCardFields = json_decode($activeRow['card_fields'] ?? '', true);
    if (is_array($teamCardFields) && $teamCardFields) {
        $sysCfg['card_fields'] = $teamCardFields;
    }

    // Metas — por equipe
    $teamGoal = [
        'weekly'  => (int)($activeRow['goal_weekly'] ?? 0),
        'monthly' => (int)($activeRow['goal_monthly'] ?? 0),
    ];
    $mainten = one("SELECT * FROM maintenance_mode WHERE id = 1");
    if ($mainten) {
        $mainten['enabled']     = (bool)$mainten['enabled'];
        $mainten['dismissedBy'] = json_decode($mainten['dismissed_by'] ?: '[]', true) ?: [];
        unset($mainten['dismissed_by']);
    }
    $dup = one("SELECT * FROM duplicate_detection WHERE id = 1");
    if ($dup) $dup['enabled'] = (bool)$dup['enabled'];

    // Notices: filtra expirados + escopo (global ou equipes do usuário)
    $nowI = now_iso();
    $myTeamIds = $teamIds; // já calculado acima
    $ph = $myTeamIds ? implode(',', array_fill(0, count($myTeamIds), '?')) : "''";
    // Não-recorrente vive até expires_at; recorrente vive até recur_until (o
    // expires_at recorrente é só a "janela" do dia, então não serve de corte).
    $notices = all("SELECT n.*, t.name AS team_name FROM notices n
                    LEFT JOIN teams t ON t.id = n.team_id
                    WHERE (
                            (IFNULL(n.recurrence,'none') =  'none' AND (n.expires_at  IS NULL OR n.expires_at  = '' OR n.expires_at  > ?))
                         OR (IFNULL(n.recurrence,'none') <> 'none' AND (n.recur_until IS NULL OR n.recur_until = '' OR n.recur_until > ?))
                          )
                      AND (n.team_id IS NULL OR n.team_id IN ($ph))
                    ORDER BY n.created_at DESC", array_merge([$nowI, $nowI], $myTeamIds));

    // Auto-exclusão: notificações já LIDAS há mais de 3 dias somem sozinhas.
    try {
        q("DELETE FROM notifications WHERE read = 1 AND read_at IS NOT NULL AND read_at <> '' AND read_at < ?",
          [gmdate('Y-m-d\TH:i:s.000\Z', time() - 3 * 86400)]);
    } catch (Throwable $e) { /* best-effort */ }

    $notifs = all("SELECT * FROM notifications
                   WHERE for_user IS NULL OR for_user = ?
                   ORDER BY created_at DESC LIMIT 200", [$currentUser['name']]);

    return [
        'revision'    => current_revision(),
        'currentUser' => $currentUser,
        'teams'         => $myTeams,
        'currentTeamId' => $activeTeam,
        'columns'     => all("SELECT * FROM columns WHERE team_id = ? ORDER BY position", [$activeTeam]),
        'sprints'     => all("SELECT * FROM sprints WHERE team_id = ? AND status = 'active' ORDER BY end_date", [$activeTeam]),
        'cards'       => $cards,
        'users'       => $usersDict,
        'people'      => all("SELECT * FROM people ORDER BY name"),
        'customFields'=> all("SELECT id, team_id, name, type, options, required, hidden, as_filter, show_on_card, position
                              FROM custom_fields WHERE team_id = ? ORDER BY position, name", [$activeTeam]),
        'notices'     => array_map('_notice_format', $notices),
        'notifications' => array_map('_notif_format', $notifs),
        'teamGoal'    => $teamGoal,
        'visionConfig'=> $vision,
        'maintenanceMode' => $mainten,
        'duplicateDetection' => $dup,
        'achievements' => $achievements,
        'monthlyPerformance' => $monthly,
        'system'      => $sysCfg,
        'serverTime'  => $nowI,
    ];
}

/* ─── Helpers internos ─── */

function _qmarks(array $items): string {
    return implode(',', array_fill(0, count($items), '?'));
}

function _group_by(string $key, array $rows): array {
    $out = [];
    foreach ($rows as $r) { $out[$r[$key]][] = $r; }
    return $out;
}

/** Projeção calculada a partir do estado atual — fonte única para TODAS as telas.
 *  Concluído (progress >= 100) → sempre "no-prazo" (nunca em-risco/atrasado).
 *  Caso contrário, calcula pela distância até o prazo. */
function _sf_calc_projection(array $r): string {
    $prog = (int)($r['progress'] ?? 0);
    if ($prog >= 100) return 'no-prazo';
    $due = trim((string)($r['due_date'] ?? ''));
    if ($due === '') return 'no-prazo';
    $dueTs = strtotime($due);
    if ($dueTs === false) return 'no-prazo';
    $dl = (int)floor(($dueTs - strtotime(gmdate('Y-m-d'))) / 86400);
    if ($dl < 0) return 'atrasado';
    if ($dl <= 2) return 'em-risco';
    if ($dl <= 5 && $prog < 50) return 'em-risco';
    return 'no-prazo';
}

function _card_row_to_object(array $r, array $relations = []): array {
    $card = [
        'id'                => $r['id'],
        'teamId'            => $r['team_id'] ?? null,
        'columnId'          => $r['column_id'],
        'title'             => $r['title'],
        'description'       => $r['description'],
        'assignee'          => $r['assignee'],
        'startDate'         => $r['start_date'],
        'dueDate'           => $r['due_date'],
        'projectionStatus'  => $r['projection_status'],
        'priority'          => $r['priority'],
        'progress'          => (int)$r['progress'],
        'progressMode'      => $r['progress_mode'],
        'estHours'          => $r['est_hours'] !== null ? (float)$r['est_hours'] : null,
        'spentHours'        => $r['spent_hours'] !== null ? (float)$r['spent_hours'] : null,
        'recurrence'        => $r['recurrence'] ?? 'none',
        'sprintId'          => $r['sprint_id'] ?? null,
        'vision'            => $r['vision'],
        'color'             => $r['color'],
        'archived'          => (bool)$r['archived'],
        'archivedBy'        => $r['archived_by'],
        'archivedAt'        => $r['archived_at'],
        'awaitingApproval'  => (bool)$r['awaiting_approval'],
        'approvalRequestedBy' => $r['approval_requested_by'],
        'approvalRequestedAt' => $r['approval_requested_at'],
        'gains' => [
            'horasMes'    => $r['gains_horas_mes']    !== null ? (float)$r['gains_horas_mes']    : null,
            'horasAno'    => $r['gains_horas_ano']    !== null ? (float)$r['gains_horas_ano']    : null,
            'horasSource' => $r['gains_horas_source'],
            'economiaMes' => $r['gains_economia_mes'] !== null ? (float)$r['gains_economia_mes'] : null,
            'economiaAno' => $r['gains_economia_ano'] !== null ? (float)$r['gains_economia_ano'] : null,
            'econSource'  => $r['gains_econ_source'],
            'qualitativo' => json_decode($r['gains_qualitativo'] ?: '[]', true) ?: [],
        ],
        'revision'   => (int)$r['revision'],
        'createdAt'  => $r['created_at'],
        'updatedAt'  => $r['updated_at'],
    ];
    // Relações (vêm pré-carregadas pelo hydrate_cards; aqui carregamos sob demanda se vazias)
    if (!$relations) {
        $relations = _load_card_relations($r['id']);
    }
    return array_merge($card, $relations);
}

function _load_card_relations(string $id): array {
    $subs = all("SELECT * FROM subtasks WHERE card_id = ? ORDER BY position", [$id]);
    $cms  = all("SELECT * FROM comments WHERE card_id = ? ORDER BY timestamp ASC", [$id]);
    $reactsByCm = [];
    if ($cms) {
        $cmIds = array_column($cms, 'id');
        $rin   = _qmarks($cmIds);
        foreach (all("SELECT * FROM comment_reactions WHERE comment_id IN ($rin)", $cmIds) as $r) {
            $reactsByCm[$r['comment_id']][$r['emoji']][] = $r['user_name'];
        }
    }
    $hist = all("SELECT * FROM card_history WHERE card_id = ? ORDER BY timestamp ASC", [$id]);
    $lnk  = all("SELECT * FROM links WHERE card_id = ?", [$id]);
    $cv   = [];
    foreach (all("SELECT field_id, value FROM card_custom_values WHERE card_id = ?", [$id]) as $r) {
        $cv[$r['field_id']] = $r['value'];
    }
    $blocksOf = []; $blockedBy = [];
    foreach (all("SELECT blocker_card_id, blocked_card_id FROM card_blocks WHERE blocker_card_id = ? OR blocked_card_id = ?", [$id, $id]) as $b) {
        if ($b['blocker_card_id'] === $id) $blocksOf[] = $b['blocked_card_id'];
        else                                $blockedBy[] = $b['blocker_card_id'];
    }
    return [
        'tags'        => array_column(all("SELECT tag FROM card_tags WHERE card_id = ?", [$id]), 'tag'),
        'requestedBy' => array_column(all("SELECT person_name FROM card_requested_by WHERE card_id = ?", [$id]), 'person_name'),
        'helpers'     => array_column(all("SELECT person_name FROM card_helpers WHERE card_id = ?", [$id]), 'person_name'),
        'blocks'      => $blocksOf,
        'blockedBy'   => $blockedBy,
        'subtasks'    => _build_subtask_tree($subs),
        'comments'    => array_map(function ($cm) use ($reactsByCm) {
            return [
                'id'        => $cm['id'],
                'user'      => $cm['user_name'],
                'timestamp' => $cm['timestamp'],
                'text'      => $cm['text'],
                'parentId'  => $cm['parent_id'] ?? null,
                'reactions' => $reactsByCm[$cm['id']] ?? new stdClass(),
            ];
        }, $cms),
        'history'     => array_map(fn($h) => [
            'user' => $h['user_name'], 'timestamp' => $h['timestamp'], 'action' => $h['action'],
        ], $hist),
        'links'       => array_map(fn($l) => [
            'id' => $l['id'], 'url' => $l['url'], 'title' => $l['title'],
            'addedAt' => $l['added_at'], 'addedBy' => $l['added_by'],
        ], $lnk),
        'customValues' => $cv ?: new stdClass(),
    ];
}

function _build_subtask_tree(array $flat): array {
    $byParent = [];
    foreach ($flat as $s) {
        $byParent[$s['parent_subtask_id'] ?? ''][] = $s;
    }
    $build = function ($parentId) use (&$build, $byParent) {
        $children = $byParent[$parentId] ?? ($parentId === '' ? ($byParent[null] ?? []) : []);
        $out = [];
        foreach ($children as $s) {
            $out[] = [
                'id'       => $s['id'],
                'title'    => $s['title'],
                'done'     => (bool)$s['done'],
                'assignee' => $s['assignee'],
                'dueDate'  => $s['due_date'],
                'sprintId' => $s['sprint_id'] ?? null,
                'subtasks' => $build($s['id']),
            ];
        }
        return $out;
    };
    // Subtarefas raiz têm parent_subtask_id NULL
    $byParent[''] = $byParent[null] ?? [];
    return $build('');
}

function _notice_format(array $r): array {
    return [
        'id' => $r['id'], 'text' => $r['text'], 'type' => $r['type'],
        'author' => $r['author'], 'authorId' => $r['author_id'] ?? '',
        'createdAt' => $r['created_at'],
        'startsAt' => $r['starts_at'] ?? null,
        'expiresAt' => $r['expires_at'], 'editedAt' => $r['edited_at'],
        'editedBy' => $r['edited_by'],
        'recurrence' => $r['recurrence'] ?? 'none', 'recurUntil' => $r['recur_until'] ?? null,
        // Está visível AGORA? (respeita agendamento/recorrência) — o front usa isto
        // para não mostrar avisos agendados antes da hora (só quem edita os vê, marcados).
        'active' => _notice_visible_now($r, time()) ? 1 : 0,
        'teamId' => $r['team_id'] ?? null, 'teamName' => $r['team_name'] ?? null,
    ];
}
function _notif_format(array $r): array {
    return [
        'id' => $r['id'], 'message' => $r['message'], 'type' => $r['type'],
        'targetCardId' => $r['target_card_id'], 'actionLabel' => $r['action_label'],
        'forUser' => $r['for_user'], 'timestamp' => $r['created_at'],
        'read' => (bool)$r['read'], 'readAt' => $r['read_at'],
        'kind' => $r['kind'] ?? '', 'refId' => $r['ref_id'] ?? '',
    ];
}
