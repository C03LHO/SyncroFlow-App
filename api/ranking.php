<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/ranking.php
   Ranking (placar) de produtividade + sequências (streaks).
   Concluído = card com progress >= 100. Sequência = dias distintos
   consecutivos com evento de conclusão no card_history.
   Escopo: equipe ativa (padrão) ou todas; período: 7d/30d/90d/all.
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/teams.php';

$u = require_login();
$action = $_GET['action'] ?? 'list';

if ($action !== 'list') error_response('action_invalida', 400);

$scope  = (string)($_GET['scope']  ?? 'team');           // team | all
$period = (string)($_GET['period'] ?? '30d');            // 7d | 30d | 90d | all
$teamId = (string)($_GET['team_id'] ?? '');

$days = ['7d' => 7, '30d' => 30, '90d' => 90][$period] ?? null;  // null = all
$since = $days !== null ? gmdate('Y-m-d\TH:i:s.000\Z', time() - $days * 86400) : null;

$useTeam = ($scope === 'team' && $teamId !== '');

/* ─── Placar: concluídos por responsável ─── */
$where = ["c.progress >= 100", "c.assignee IS NOT NULL", "c.assignee != ''"];
$params = [];
if ($useTeam)        { $where[] = "c.team_id = ?";    $params[] = $teamId; }
if ($since !== null) { $where[] = "c.updated_at >= ?"; $params[] = $since; }
$whereSql = implode(' AND ', $where);

$rows = all(
    "SELECT c.assignee AS name,
            COUNT(*) AS done,
            SUM(CASE WHEN c.due_date IS NOT NULL AND c.due_date != ''
                      AND substr(c.updated_at,1,10) <= c.due_date THEN 1 ELSE 0 END) AS on_time
     FROM cards c
     WHERE $whereSql
     GROUP BY lower(c.assignee)
     ORDER BY done DESC, on_time DESC",
    $params
);

/* ─── Sequências (streaks) a partir do card_history ─── */
$hWhere = ["(h.action LIKE '%conclu%' OR h.action LIKE '%Conclu%' OR h.action LIKE '%100%%')"];
$hParams = [];
$joinTeam = '';
if ($useTeam)        { $joinTeam = "JOIN cards c2 ON c2.id = h.card_id"; $hWhere[] = "c2.team_id = ?"; $hParams[] = $teamId; }
$hWhereSql = implode(' AND ', $hWhere);

$events = all(
    "SELECT DISTINCT h.user_name AS name, substr(h.timestamp,1,10) AS day
     FROM card_history h $joinTeam
     WHERE $hWhereSql
     ORDER BY h.user_name, day",
    $hParams
);

// Agrupa dias por usuário (nome em minúsculas → conjunto de dias)
$daysByUser = [];
foreach ($events as $e) {
    $k = mb_strtolower(trim((string)$e['name']));
    if ($k === '') continue;
    $daysByUser[$k][] = (string)$e['day'];
}

function _streaks(array $days): array {
    // dias 'YYYY-MM-DD' únicos e ordenados
    $days = array_values(array_unique($days));
    sort($days);
    if (!$days) return ['current' => 0, 'best' => 0];
    $best = 1; $run = 1;
    for ($i = 1; $i < count($days); $i++) {
        $prev = strtotime($days[$i - 1]);
        $cur  = strtotime($days[$i]);
        $run = (round(($cur - $prev) / 86400) == 1) ? $run + 1 : 1;
        if ($run > $best) $best = $run;
    }
    // Sequência atual: conta para trás a partir de hoje (ou ontem)
    $set = array_flip($days);
    $today = strtotime(gmdate('Y-m-d'));
    $anchor = isset($set[gmdate('Y-m-d', $today)]) ? $today
            : (isset($set[gmdate('Y-m-d', $today - 86400)]) ? $today - 86400 : null);
    $current = 0;
    if ($anchor !== null) {
        $d = $anchor;
        while (isset($set[gmdate('Y-m-d', $d)])) { $current++; $d -= 86400; }
    }
    return ['current' => $current, 'best' => $best];
}

/* ─── Junta com dados de usuário (display/cor/avatar) ─── */
$userInfo = [];
foreach (all("SELECT name, display_name, color, avatar_url FROM users WHERE is_active = 1") as $usr) {
    $userInfo[mb_strtolower(trim((string)$usr['name']))] = $usr;
}

$ranking = [];
$rank = 0;
foreach ($rows as $r) {
    $rank++;
    $key = mb_strtolower(trim((string)$r['name']));
    $info = $userInfo[$key] ?? [];
    $st = _streaks($daysByUser[$key] ?? []);
    $done = (int)$r['done'];
    $onTime = (int)$r['on_time'];
    $ranking[] = [
        'rank'    => $rank,
        'name'    => (string)$r['name'],
        'display' => (string)($info['display_name'] ?? '') ?: (string)$r['name'],
        'color'   => (string)($info['color'] ?? '') ?: '#00796D',
        'avatar'  => (string)($info['avatar_url'] ?? ''),
        'done'    => $done,
        'onTime'  => $onTime,
        'points'  => $done * 10 + $onTime * 5,
        'streak'      => $st['current'],
        'bestStreak'  => $st['best'],
        'isMe'    => strcasecmp((string)$r['name'], (string)$u['name']) === 0,
    ];
}

// Reordena por pontos (concluídos + pontualidade) e renumera o rank
usort($ranking, fn($a, $b) => $b['points'] <=> $a['points'] ?: $b['done'] <=> $a['done']);
foreach ($ranking as $i => &$row) { $row['rank'] = $i + 1; }
unset($row);

json_out([
    'ranking' => $ranking,
    'me'      => (string)$u['name'],
    'scope'   => $scope,
    'period'  => $period,
]);
