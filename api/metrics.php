<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/metrics.php
   Métricas de fluxo da equipe ativa:
     • Throughput (concluídos por semana)
     • Lead time  (criação → conclusão)
     • Cycle time (1ª movimentação → conclusão)
     • Fluxo cumulativo (criados × concluídos ao longo do tempo)
   Conclusão = último evento de card_history contendo "conclu"
   (cai para updated_at quando o card está 100% e não há histórico).
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/teams.php';

$u = require_login();
$action = $_GET['action'] ?? 'flow';
if ($action !== 'flow') error_response('action_invalida', 400);

$teamId = (string)($_GET['team_id'] ?? '');
if ($teamId === '') error_response('team_id_obrigatorio', 400);
if (!is_team_member($teamId, $u['user_id']) && !in_array($u['role'], ['ti','suporte'], true)) {
    error_response('Sem permissão para ver as métricas desta equipe.', 403);
}

$period = (string)($_GET['period'] ?? '90d');
$days   = ['30d' => 30, '90d' => 90, '180d' => 180][$period] ?? null;   // null = tudo
$sinceTs = $days !== null ? strtotime(gmdate('Y-m-d')) - ($days - 1) * 86400 : null;

/* ─── Todos os cards da equipe (inclui arquivados p/ métricas de conclusão) ─── */
$cards = all("SELECT id, created_at, updated_at, progress FROM cards WHERE team_id = ?", [$teamId]);

/* ─── Eventos de conclusão e 1ª movimentação (via card_history) ─── */
$doneAtRows = all(
    "SELECT h.card_id AS id, MAX(h.timestamp) AS done_at
     FROM card_history h JOIN cards c ON c.id = h.card_id
     WHERE c.team_id = ? AND (h.action LIKE '%conclu%')
     GROUP BY h.card_id", [$teamId]);
$doneAt = [];
foreach ($doneAtRows as $r) $doneAt[$r['id']] = (string)$r['done_at'];

$firstMoveRows = all(
    "SELECT h.card_id AS id, MIN(h.timestamp) AS first_move
     FROM card_history h JOIN cards c ON c.id = h.card_id
     WHERE c.team_id = ? AND h.action LIKE 'Movido%'
     GROUP BY h.card_id", [$teamId]);
$firstMove = [];
foreach ($firstMoveRows as $r) $firstMove[$r['id']] = (string)$r['first_move'];

/* ─── Percorre cards: monta conclusões, lead/cycle e séries ─── */
$completions = [];   // [ts => count] por dia (timestamp 00:00)
$createdByDay = [];  // 'Y-m-d' => count
$leadDays = [];
$cycleDays = [];

foreach ($cards as $c) {
    $createdTs = strtotime((string)$c['created_at']);
    if ($createdTs !== false) {
        $d = gmdate('Y-m-d', $createdTs);
        $createdByDay[$d] = ($createdByDay[$d] ?? 0) + 1;
    }

    // Conclusão: evento de histórico, ou updated_at se o card está 100%
    $doneTs = null;
    if (isset($doneAt[$c['id']])) {
        $doneTs = strtotime($doneAt[$c['id']]);
    } elseif ((int)$c['progress'] >= 100) {
        $doneTs = strtotime((string)$c['updated_at']);
    }
    if ($doneTs === false || $doneTs === null) continue;

    $dayKey = gmdate('Y-m-d', $doneTs);
    $completions[$dayKey] = ($completions[$dayKey] ?? 0) + 1;

    if ($createdTs !== false && $doneTs >= $createdTs) {
        $leadDays[] = ($doneTs - $createdTs) / 86400.0;
    }
    $fmTs = isset($firstMove[$c['id']]) ? strtotime($firstMove[$c['id']]) : false;
    if ($fmTs !== false && $doneTs >= $fmTs) {
        $cycleDays[] = ($doneTs - $fmTs) / 86400.0;
    }
}

/* ─── Throughput por semana (ISO) dentro da janela ─── */
$throughputMap = [];
foreach ($completions as $day => $n) {
    $ts = strtotime($day);
    if ($sinceTs !== null && $ts < $sinceTs) continue;
    $wk = gmdate('o-\WW', $ts);
    $throughputMap[$wk] = ($throughputMap[$wk] ?? 0) + $n;
}
ksort($throughputMap);
$throughput = [];
foreach ($throughputMap as $wk => $n) $throughput[] = ['week' => $wk, 'count' => $n];
$throughput = array_slice($throughput, -16);   // no máx. 16 semanas

/* ─── Fluxo cumulativo diário (criados × concluídos) ─── */
$startTs = $sinceTs;
if ($startTs === null) {
    // tudo: começa no card mais antigo
    $allDays = array_merge(array_keys($createdByDay), array_keys($completions));
    $minDay = $allDays ? min($allDays) : gmdate('Y-m-d');
    $startTs = strtotime($minDay);
}
$endTs = strtotime(gmdate('Y-m-d'));
$cum = [];
$cumCreated = 0; $cumDone = 0;
// Pré-conta o que veio ANTES da janela (para a linha começar no nível certo)
foreach ($createdByDay as $d => $n) { if (strtotime($d) < $startTs) $cumCreated += $n; }
foreach ($completions as $d => $n) { if (strtotime($d) < $startTs) $cumDone += $n; }
// Limita o nº de pontos (1 por dia; agrega se janela muito grande)
$span = max(1, (int)round(($endTs - $startTs) / 86400) + 1);
$step = $span > 120 ? (int)ceil($span / 120) : 1;   // no máx ~120 pontos
for ($ts = $startTs, $i = 0; $ts <= $endTs; $ts += 86400, $i++) {
    $d = gmdate('Y-m-d', $ts);
    $cumCreated += $createdByDay[$d] ?? 0;
    $cumDone    += $completions[$d] ?? 0;
    if ($i % $step === 0 || $ts + 86400 > $endTs) {
        $cum[] = ['date' => $d, 'created' => $cumCreated, 'done' => $cumDone];
    }
}

/* ─── Estatística (média / mediana) ─── */
function _stats(array $vals): array {
    if (!$vals) return ['avg' => null, 'median' => null, 'count' => 0];
    sort($vals);
    $n = count($vals);
    $avg = array_sum($vals) / $n;
    $mid = intdiv($n, 2);
    $median = ($n % 2) ? $vals[$mid] : ($vals[$mid - 1] + $vals[$mid]) / 2;
    return ['avg' => round($avg, 1), 'median' => round($median, 1), 'count' => $n];
}

/* ─── Previsão de entrega (forecast) a partir do throughput recente ─── */
$openCount = (int)scalar("SELECT COUNT(*) FROM cards WHERE team_id=? AND archived=0 AND progress<100", [$teamId]);
$recent = array_slice($throughput, -8);
$tvals = array_map(fn($x) => (int)$x['count'], $recent);
$forecast = ['openCount' => $openCount, 'avgPerWeek' => 0, 'weeks' => null];
if ($tvals) {
    $avg = array_sum($tvals) / count($tvals);
    $mx = max($tvals); $mn = min($tvals);
    $todayMid = strtotime(gmdate('Y-m-d'));
    $fmtW = fn($w) => $w === null ? null : gmdate('Y-m-d', $todayMid + (int)ceil($w * 7) * 86400);
    if ($avg > 0) {
        $weeks = $openCount / $avg;
        $wOpt  = $mx > 0 ? $openCount / $mx : null;
        $wPes  = $mn > 0 ? $openCount / $mn : null;
        $forecast = [
            'openCount'  => $openCount,
            'avgPerWeek' => round($avg, 1),
            'weeks'      => round($weeks, 1),
            'weeksOpt'   => $wOpt !== null ? round($wOpt, 1) : null,
            'weeksPes'   => $wPes !== null ? round($wPes, 1) : null,
            'date'       => $fmtW($weeks),
            'dateOpt'    => $fmtW($wOpt),
            'datePes'    => $fmtW($wPes),
        ];
    }
}

/* ─── Aging: cards ativos parados (sem movimentação) há N dias ─── */
$lastMoveRows = all(
    "SELECT h.card_id AS id, MAX(h.timestamp) AS last_move
     FROM card_history h JOIN cards c ON c.id = h.card_id
     WHERE c.team_id = ? AND h.action LIKE 'Movido%'
     GROUP BY h.card_id", [$teamId]);
$lastMove = [];
foreach ($lastMoveRows as $r) $lastMove[$r['id']] = (string)$r['last_move'];

$activeCards = all(
    "SELECT c.id, c.title, c.assignee, c.created_at, col.name AS column_name
     FROM cards c LEFT JOIN columns col ON col.id = c.column_id
     WHERE c.team_id = ? AND c.archived = 0 AND c.progress < 100", [$teamId]);
$todayMid = strtotime(gmdate('Y-m-d'));
$aging = [];
foreach ($activeCards as $c) {
    $ref = $lastMove[$c['id']] ?? $c['created_at'];
    $refTs = strtotime((string)$ref);
    if ($refTs === false) continue;
    $daysIdle = (int)floor(($todayMid - $refTs) / 86400);
    if ($daysIdle >= 4) {
        $aging[] = [
            'id'       => $c['id'],
            'title'    => $c['title'],
            'assignee' => $c['assignee'] ?? '',
            'column'   => $c['column_name'] ?? '',
            'days'     => $daysIdle,
        ];
    }
}
usort($aging, fn($a, $b) => $b['days'] <=> $a['days']);
$aging = array_slice($aging, 0, 15);

json_out([
    'period'     => $period,
    'throughput' => $throughput,
    'cumulative' => $cum,
    'lead'       => _stats($leadDays),
    'cycle'      => _stats($cycleDays),
    'totalDone'  => array_sum($completions),
    'forecast'   => $forecast,
    'aging'      => $aging,
]);
