<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/leagues.php
   Estado da liga do usuário + classificação semanal da sua liga.
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/leagues.php';

$u = require_login();
$action = $_GET['action'] ?? 'standings';

$isTiDev = ($u['role'] ?? '') === 'ti';

/* ── Reiniciar o ranking — EXCLUSIVO do TI-Dev ── */
if ($action === 'reset') {
    if (!$isTiDev) error_response('Apenas o TI-Dev pode reiniciar o ranking.', 403);
    $res = league_reset((string)($u['user_id'] ?? ''));
    json_out($res);
}

if ($action !== 'standings') error_response('action_invalida', 400);

$me = $u['user_id'];
$myTier = (int)(scalar("SELECT league_tier FROM users WHERE user_id = ?", [$me]) ?: 1);
$myTier = max(1, min(10, $myTier));

// XP da semana de liga corrente (sexta → quinta; vira toda sexta)
$weekStart = _league_week_start_ts(time());
$xp = league_week_xp($weekStart);

// Membros da MINHA liga, ordenados por XP
$members = all(
    "SELECT user_id, name, display_name, color, avatar_url
     FROM users WHERE is_active = 1 AND league_tier = ?",
    [$myTier]
);
$standings = array_map(function ($m) use ($xp, $me) {
    return [
        'name'    => (string)$m['name'],
        'display' => (string)($m['display_name'] ?? '') ?: (string)$m['name'],
        'color'   => (string)($m['color'] ?? '') ?: '#00796D',
        'avatar'  => (string)($m['avatar_url'] ?? ''),
        'xp'      => (int)($xp[$m['user_id']] ?? 0),
        'isMe'    => $m['user_id'] === $me,
    ];
}, $members);
usort($standings, fn($a, $b) => $b['xp'] <=> $a['xp'] ?: strcasecmp($a['display'], $b['display']));
foreach ($standings as $i => &$row) { $row['rank'] = $i + 1; }
unset($row);

$n = count($standings);                 // nº de pessoas NESTA liga
// Só contam como quórum as pessoas ATIVAS (XP > 0). Ter 10 membros mas só 2
// pontuando não faz uma liga — as zonas de subida/descida só existem com ≥10 ativos.
$activeN = 0;
foreach ($standings as $s) if ((int)$s['xp'] > 0) $activeN++;
$tierHasQuorum = $activeN >= LEAGUE_MIN_PER_TIER;
$missingForQuorum = max(0, LEAGUE_MIN_PER_TIER - $activeN);
$promoteZone = ($tierHasQuorum && $myTier < 10) ? min(LEAGUE_PROMOTE, intdiv($activeN, 3) ?: 1) : 0;
$demoteZone  = ($tierHasQuorum && $myTier > 1)  ? min(LEAGUE_DEMOTE,  intdiv($activeN, 3) ?: 1) : 0;

// Resumo da última virada (para a nota no rodapé)
$quorum = league_quorum_status();

// Escada completa das 10 ligas (para exibir o caminho)
$ladder = [];
foreach (LEAGUES as $tier => $info) {
    $ladder[] = league_meta($tier);   // inclui img (WebP)
}

// Texto-resumo da regra de virada (rodapé), claro e direto.
if (!$tierHasQuorum) {
    $weekEndsHint = 'Esta liga precisa de pelo menos ' . LEAGUE_MIN_PER_TIER
        . ' pessoas pontuando (XP > 0) para a virada valer — hoje há ' . $activeN . '. '
        . 'O ranking também reinicia sozinho na virada do ano.';
} else {
    $weekEndsHint = 'Virada toda sexta-feira: os ' . $promoteZone . ' primeiros sobem de liga'
        . ($demoteZone ? ' e os ' . $demoteZone . ' últimos (sem XP) descem' : '') . '. '
        . 'Reinicia sozinho na virada do ano.';
}

json_out([
    'me'          => (string)$u['name'],
    'myTier'      => $myTier,
    'myLeague'    => league_meta($myTier),
    'ladder'      => $ladder,
    'standings'   => $standings,
    'promoteZone' => $promoteZone,
    'demoteZone'  => $demoteZone,
    'canReset'    => $isTiDev,
    'quorum'      => $quorum,
    'tierHasQuorum' => $tierHasQuorum,
    'myLeagueMembers' => $n,
    'activeMembers' => $activeN,
    'minPerTier'  => LEAGUE_MIN_PER_TIER,
    'missingForQuorum' => $missingForQuorum,
    'weekEndsHint'=> $weekEndsHint,
]);
