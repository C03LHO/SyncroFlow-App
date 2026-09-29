<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/leagues.php
   Sistema de LIGAS estilo Duolingo, com tema aquático.
   10 ligas ascendentes, da mais baixa à mais alta — do GIRINO até o
   LEVIATÃ (o topo). Competição semanal (segunda→domingo) por
   XP: cada card concluído vale 10 XP; concluído no prazo, +5 XP.
   No virar da semana, os melhores SOBEM de liga e os piores DESCEM.
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/notify_mail.php';   // reaproveita app_meta_get/set

/* Tier 1 (mais baixa) … 10 (máxima). Ícone + cor para o broche de cada liga. */
const LEAGUES = [
    1  => ['slug' => 'girino',     'name' => 'Girino',     'icon' => '🐸', 'color' => '#9ca3af'],
    2  => ['slug' => 'peixe',      'name' => 'Peixe',      'icon' => '🐟', 'color' => '#60a5fa'],
    3  => ['slug' => 'caranguejo', 'name' => 'Caranguejo', 'icon' => '🦀', 'color' => '#fb923c'],
    4  => ['slug' => 'tartaruga',  'name' => 'Tartaruga',  'icon' => '🐢', 'color' => '#34d399'],
    5  => ['slug' => 'arraia',     'name' => 'Arraia',     'icon' => '🐠', 'color' => '#22d3ee'],
    6  => ['slug' => 'polvo',      'name' => 'Polvo',      'icon' => '🐙', 'color' => '#a855f7'],
    7  => ['slug' => 'golfinho',   'name' => 'Golfinho',   'icon' => '🐬', 'color' => '#38bdf8'],
    8  => ['slug' => 'tubarao',    'name' => 'Tubarão',    'icon' => '🦈', 'color' => '#0ea5e9'],
    9  => ['slug' => 'kraken',     'name' => 'Kraken',     'icon' => '🦑', 'color' => '#6366f1'],
    10 => ['slug' => 'leviata',    'name' => 'Leviatã',    'icon' => '🐉', 'color' => '#d4502a'],
];

const LEAGUE_PROMOTE = 5;   // sobem (no máx.) por liga ao fim da semana
const LEAGUE_DEMOTE  = 5;   // descem (no máx.) por liga ao fim da semana

/* Quórum: uma liga só promove/rebaixa se tiver participantes suficientes.
   Regra única e simples — cada liga precisa de no mínimo N membros ativos. */
const LEAGUE_MIN_PER_TIER = 10;  // mínimo de pessoas numa MESMA liga p/ a virada valer

function league_meta(int $tier): array {
    $tier = max(1, min(10, $tier));
    $info = LEAGUES[$tier];
    $info['img'] = url('imagens/ligas/' . $info['slug'] . '.webp');
    return ['tier' => $tier] + $info;
}

/** Início da "semana de liga" (SEXTA-FEIRA 00:00 UTC) de um timestamp.
 *  A semana de liga vai de sexta 00:00 até quinta 23:59 — a virada é toda sexta. */
function _league_week_start_ts(int $ts): int {
    $dow = (int)gmdate('N', $ts);             // 1=segunda … 5=sexta … 7=domingo
    $daysSinceFriday = ($dow - 5 + 7) % 7;    // 0 na sexta, 1 sáb, 2 dom … 6 quinta
    $friday = $ts - $daysSinceFriday * 86400;
    return strtotime(gmdate('Y-m-d', $friday) . ' 00:00:00 UTC');
}
/** Identificador da semana de liga (data da sexta de início, ex.: "2026-06-12"). */
function _league_week_id(int $ts): string {
    return gmdate('Y-m-d', _league_week_start_ts($ts));
}

/**
 * XP de cada usuário (user_id => xp) numa semana que começa em $weekStartTs.
 * XP = (cards concluídos na semana × 10) + (concluídos no prazo × 5).
 * "Concluído" = progress >= 100 com updated_at dentro da janela.
 */
function league_week_xp(int $weekStartTs): array {
    $start = gmdate('Y-m-d\T00:00:00.000\Z', $weekStartTs);
    $end   = gmdate('Y-m-d\T23:59:59.999\Z', $weekStartTs + 6 * 86400);
    $rows = all(
        "SELECT assignee AS name, COUNT(*) AS done,
                SUM(CASE WHEN due_date IS NOT NULL AND due_date != '' AND substr(updated_at,1,10) <= due_date THEN 1 ELSE 0 END) AS ontime
         FROM cards
         WHERE progress >= 100 AND assignee IS NOT NULL AND assignee != ''
           AND updated_at >= ? AND updated_at <= ?
         GROUP BY lower(assignee)",
        [$start, $end]
    );
    $byName = [];
    foreach (all("SELECT user_id, lower(name) AS lname FROM users WHERE is_active = 1") as $usr) {
        $byName[$usr['lname']] = $usr['user_id'];
    }
    $xp = [];
    foreach ($rows as $r) {
        $vid = $byName[mb_strtolower(trim((string)$r['name']), 'UTF-8')] ?? null;
        if (!$vid) continue;
        $xp[$vid] = ($xp[$vid] ?? 0) + (int)$r['done'] * 10 + (int)$r['ontime'] * 5;
    }
    return $xp;
}

/**
 * Virada de semana (toda SEXTA): ao detectar uma nova semana de liga, processa
 * a semana ENCERRADA — promove os melhores e rebaixa os piores em cada liga.
 * Idempotente (1x por semana). Best-effort.
 */
function league_weekly_rollover(): void {
    try {
        $current = _league_week_id(time());
        $last = app_meta_get('league_week');
        if ($last === null || $last === '') { app_meta_set('league_week', $current); return; }
        if ($last === $current) return;

        // Semana encerrada = a que começou na sexta anterior (7 dias antes da sexta atual).
        $endedStart = _league_week_start_ts(time()) - 7 * 86400;
        $xp = league_week_xp($endedStart);

        $byTier = [];
        foreach (all("SELECT user_id, league_tier FROM users WHERE is_active = 1") as $usr) {
            $t = max(1, min(10, (int)$usr['league_tier']));
            $byTier[$t][] = ['vid' => $usr['user_id'], 'xp' => $xp[$usr['user_id']] ?? 0];
        }
        $promotedTotal = 0; $demotedTotal = 0; $frozenTiers = 0;
        foreach ($byTier as $tier => $list) {
            $n = count($list);
            // Quórum por liga: só vale se houver ao menos 10 pessoas ATIVAS (XP > 0)
            // na mesma liga. Ter 10 membros mas só 2 pontuando não faz uma liga —
            // então ela fica congelada (não promove nem rebaixa).
            $activeN = 0;
            foreach ($list as $p) if ((int)$p['xp'] > 0) $activeN++;
            if ($activeN < LEAGUE_MIN_PER_TIER) { $frozenTiers++; continue; }
            usort($list, fn($a, $b) => $b['xp'] <=> $a['xp']);
            $promoteN = min(LEAGUE_PROMOTE, intdiv($n, 3) ?: 1);
            $demoteN  = min(LEAGUE_DEMOTE, intdiv($n, 3) ?: 1);
            // Promove o topo (só quem pontuou) — exceto na liga máxima.
            if ($tier < 10) {
                for ($i = 0; $i < $promoteN && $i < $n; $i++) {
                    if ($list[$i]['xp'] > 0) {
                        q("UPDATE users SET league_tier = ? WHERE user_id = ?", [$tier + 1, $list[$i]['vid']]);
                        $promotedTotal++;
                        try { notify_by_userid($list[$i]['vid'], '🎉 Você subiu para a liga ' . LEAGUES[$tier + 1]['name'] . '!', 'success'); } catch (Throwable $e) {}
                    }
                }
            }
            // Rebaixa o fundo (só quem ficou com 0 XP) — exceto na liga mais baixa.
            if ($tier > 1) {
                for ($i = 0; $i < $demoteN && $i < $n; $i++) {
                    $idx = $n - 1 - $i;
                    if ($idx < 0) break;
                    if ((int)$list[$idx]['xp'] === 0) {
                        q("UPDATE users SET league_tier = ? WHERE user_id = ?", [$tier - 1, $list[$idx]['vid']]);
                        $demotedTotal++;
                    }
                }
            }
        }
        app_meta_set('league_week', $current);
        app_meta_set('league_last_result', json_encode([
            'week' => $last, 'at' => now_iso(), 'status' => 'applied',
            'minPerTier' => LEAGUE_MIN_PER_TIER, 'frozenTiers' => $frozenTiers,
            'promoted' => $promotedTotal, 'demoted' => $demotedTotal,
        ], JSON_UNESCAPED_UNICODE));
    } catch (Throwable $e) {
        error_log('[SyncroFlow league-rollover] ' . $e->getMessage());
    }
}

/**
 * Reinicia o ranking: todos voltam à liga mais baixa (Girino) e a semana
 * recomeça do zero. EXCLUSIVO do TI-Dev (validado na camada da API).
 * Retorna um resumo da operação.
 */
function league_reset(string $byUserId = ''): array {
    $affected = (int)scalar("SELECT COUNT(*) FROM users WHERE is_active = 1");
    q("UPDATE users SET league_tier = 1");
    app_meta_set('league_week', _league_week_id(time()));   // zera a competição atual
    app_meta_set('league_last_result', json_encode([
        'week' => _league_week_id(time()), 'at' => now_iso(), 'status' => 'reset',
        'by' => $byUserId, 'affected' => $affected,
    ], JSON_UNESCAPED_UNICODE));
    return ['ok' => true, 'affected' => $affected, 'at' => now_iso()];
}

/**
 * Reinício ANUAL automático: na virada de ano (horário de Brasília, UTC-3) todos
 * voltam à liga mais baixa e a competição recomeça do zero. Idempotente: roda
 * no máximo 1x por ano (guardado em app_meta 'league_year'). Best-effort.
 */
function league_maybe_reset_year(): void {
    try {
        $curYear = gmdate('Y', time() - 3 * 3600);     // ano no fuso de Brasília
        $stored = app_meta_get('league_year');
        if ($stored === null || $stored === '') { app_meta_set('league_year', $curYear); return; }
        if ($stored === $curYear) return;              // mesmo ano — nada a fazer
        league_reset('Reinício anual automático');     // volta todos p/ Girino
        app_meta_set('league_year', $curYear);
    } catch (Throwable $e) {
        error_log('[SyncroFlow league-year-reset] ' . $e->getMessage());
    }
}

/** Resumo da última virada (para exibir na UI). */
function league_quorum_status(): array {
    $last = app_meta_get('league_last_result');
    $lastResult = null;
    if ($last) { $d = json_decode((string)$last, true); if (is_array($d)) $lastResult = $d; }
    return [
        'minPerTier' => LEAGUE_MIN_PER_TIER,
        'lastResult' => $lastResult,
    ];
}

/** Notifica um usuário pelo user_id (resolve o nome). Best-effort. */
function notify_by_userid(string $userId, string $msg, string $type = 'info'): void {
    $name = scalar("SELECT name FROM users WHERE user_id = ?", [$userId]);
    if ($name) notify((string)$name, $msg, $type);
}

/** Registra a virada de liga para rodar APÓS a resposta HTTP (lazy-cron). */
function register_league_rollover_hook(): void {
    static $registered = false;
    if ($registered) return;
    $registered = true;
    register_shutdown_function(function () {
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        elseif (function_exists('flush'))               @flush();
        // 1º o reinício anual (se virou o ano), depois a virada semanal.
        try { league_maybe_reset_year(); league_weekly_rollover(); }
        catch (Throwable $e) { error_log('[SyncroFlow shutdown league] ' . $e->getMessage()); }
    });
}
