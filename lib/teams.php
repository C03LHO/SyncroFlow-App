<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/teams.php (v12)
   Helpers de equipe: associação, papéis por equipe, permissões.

   Papel GLOBAL (users.role) define o que a pessoa pode no sistema:
     - ti      : super-admin, bypass em tudo
     - gestor  : pode CRIAR equipes e convidar
     - analista: participa de equipes (pode pedir entrada)
     - visitante: leitura

   Papel POR EQUIPE (team_members.role) define o que pode DENTRO da equipe:
     - gestor  : gerencia membros, colunas e cards da equipe
     - analista: cria e edita cards
     - visitante: só vê
   Fora das suas equipes, um gestor entra como 'analista' (regra do produto).
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/db.php';

const TEAM_PERMISSIONS = [
    // Gestor: dono operacional da equipe (cards + membros + colunas + config).
    'gestor'    => ['view','create','edit','archive','comment','manage_members','manage_columns','manage_team','delete'],
    // TI (de equipe): admin técnico da equipe — faz tudo operacional (cards) E
    // de configuração (membros, colunas, perfil, campos). Só não exclui a equipe.
    'ti'        => ['view','create','edit','archive','comment','manage_members','manage_columns','manage_team'],
    'analista'  => ['view','create','edit','comment'],
    'visitante' => ['view'],
];

const TEAM_ROLE_LABELS = [
    'gestor'    => 'Gestor',
    'ti'        => 'TI da equipe',
    'analista'  => 'Analista',
    'visitante' => 'Visitante',
];

/** Papéis válidos por equipe (para selects). */
function team_roles(): array { return array_keys(TEAM_PERMISSIONS); }

/** Permissão dentro de uma equipe. */
function can_in_team(string $teamRole, string $action): bool {
    return in_array($action, TEAM_PERMISSIONS[$teamRole] ?? [], true);
}

/** Equipes das quais o usuário é membro (com o papel dele em cada). */
function user_teams(string $userId): array {
    return all(
        "SELECT t.*, tm.role AS my_role
         FROM team_members tm
         JOIN teams t ON t.id = tm.team_id
         WHERE tm.user_id = ? AND t.archived = 0
         ORDER BY
           CASE t.type WHEN 'personal' THEN 0 WHEN 'default' THEN 1 ELSE 2 END,
           t.name",
        [$userId]
    );
}

/** Papel do usuário numa equipe específica (ou null se não-membro). */
function team_role(string $teamId, string $userId): ?string {
    $r = scalar("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?", [$teamId, $userId]);
    return $r === false ? null : $r;
}

/** Verifica se é membro. */
function is_team_member(string $teamId, string $userId): bool {
    return team_role($teamId, $userId) !== null;
}

/**
 * Papel efetivo numa equipe considerando o bypass global do TI.
 * TI sempre age como 'gestor' em qualquer equipe.
 */
function effective_team_role(string $teamId, array $user): ?string {
    // TI – Dev e TI (suporte) administram qualquer equipe (bypass → gestor).
    if (in_array($user['role'] ?? '', ['ti','suporte'], true)) return 'gestor';
    return team_role($teamId, $user['user_id']);
}

/** A equipe pessoal de um usuário. */
function personal_team_id(string $userId): string {
    return 'personal-' . $userId;
}

/** Id da coluna "concluído" de uma equipe (maior position; fallback 'concluido'). */
function team_done_column_id(string $teamId): string {
    $id = scalar("SELECT id FROM columns WHERE team_id = ? AND is_done = 1 ORDER BY position DESC LIMIT 1", [$teamId]);
    if ($id !== false && $id) return $id;
    $id = scalar("SELECT id FROM columns WHERE team_id = ? ORDER BY position DESC LIMIT 1", [$teamId]);
    return ($id !== false && $id) ? $id : 'concluido';
}
/** Ids de TODAS as colunas "concluído" do sistema (1 por equipe) + 'concluido'.
    Prioriza a flag is_done; equipe sem nenhuma marcada cai para a de maior posição. */
function all_done_column_ids(): array {
    $byTeam = [];
    foreach (all("SELECT id, team_id, position, is_done FROM columns") as $c) {
        $t = (string)($c['team_id'] ?? '');
        if ((int)$c['is_done'] === 1) { $byTeam[$t] = $c; continue; }            // a flag sempre vence
        if (isset($byTeam[$t]) && (int)$byTeam[$t]['is_done'] === 1) continue;   // equipe já tem uma marcada
        if (!isset($byTeam[$t]) || (int)$c['position'] > (int)$byTeam[$t]['position']) $byTeam[$t] = $c;
    }
    $ids = ['concluido'];
    foreach ($byTeam as $c) $ids[] = (string)$c['id'];
    return array_values(array_unique($ids));
}

/** Throughput semanal (cards concluídos por semana) das últimas N semanas.
    Índice 0 = semana mais recente. Base: cards na coluna "concluído" por updated_at. */
function team_throughput_weeks(string $teamId, int $weeks = 12): array {
    $doneCol = team_done_column_id($teamId);
    $rows = all("SELECT updated_at FROM cards
                 WHERE team_id=? AND archived=0 AND column_id=? AND updated_at IS NOT NULL",
                 [$teamId, $doneCol]);
    $now = time();
    $buckets = array_fill(0, max(1, $weeks), 0);
    foreach ($rows as $r) {
        $t = strtotime((string)$r['updated_at']); if (!$t) continue;
        $wa = (int)floor(($now - $t) / (7 * 86400));
        if ($wa >= 0 && $wa < $weeks) $buckets[$wa]++;
    }
    return $buckets;
}

/** Meta INTELIGENTE: analisa o histórico e sugere metas realistas e motivadoras,
    adaptando-se à tendência recente (se o ritmo caiu, ancora no recente). */
function smart_goal_suggestion(string $teamId): array {
    $w = team_throughput_weeks($teamId, 12);
    $total = array_sum($w);
    if ($total === 0) {
        return ['weekly' => 0, 'monthly' => 0, 'hasData' => false,
                'basis' => 'Ainda sem histórico de conclusões. Conclua alguns cards e gere a meta depois.'];
    }
    $recent4  = array_slice($w, 0, 4);
    $avgRecent = array_sum($recent4) / 4;
    $avgAll    = $total / 12;
    $declining = $avgRecent < $avgAll * 0.85;
    $base   = $declining ? $avgRecent : max($avgRecent, $avgAll);
    $weekly = max(1, (int)ceil($base * 1.1));        // ~10% de desafio, realista
    $monthly = (int)round($weekly * 52 / 12);
    $trend  = $avgRecent > $avgAll * 1.1 ? 'subindo' : ($declining ? 'caindo' : 'estável');
    return [
        'weekly' => $weekly, 'monthly' => $monthly, 'hasData' => true,
        'avgRecent' => round($avgRecent, 1), 'avgAll' => round($avgAll, 1), 'trend' => $trend,
        'basis' => 'Média recente: ' . round($avgRecent, 1) . ' cards/semana (tendência ' . $trend . '). '
                 . 'Sugerimos ' . $weekly . '/semana (~' . $monthly . '/mês) — realista, com um leve desafio.',
    ];
}

/**
 * Estatísticas agregadas de uma equipe (sem expor cards individuais).
 * Usado pelo Perfil da Equipe e para avaliar os troféus de equipe.
 */
function team_stats(string $teamId): array {
    $doneCol = team_done_column_id($teamId);
    $row = one("SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN archived=0 THEN 1 ELSE 0 END) AS active_total,
            SUM(CASE WHEN archived=0 AND column_id=? THEN 1 ELSE 0 END) AS concluded,
            SUM(CASE WHEN archived=0 AND column_id!=? THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN archived=0 AND column_id!=? AND due_date IS NOT NULL AND due_date!='' AND due_date < ? THEN 1 ELSE 0 END) AS overdue,
            COALESCE(SUM(CASE WHEN archived=0 THEN gains_economia_mes ELSE 0 END),0) AS economy_month,
            COALESCE(SUM(CASE WHEN archived=0 THEN gains_horas_mes ELSE 0 END),0) AS hours_month,
            MIN(created_at) AS first_card_at
        FROM cards WHERE team_id = ?",
        [$doneCol, $doneCol, $doneCol, date('Y-m-d'), $teamId]);

    $subsDone = (int)scalar(
        "SELECT COUNT(*) FROM subtasks s JOIN cards c ON c.id=s.card_id
         WHERE c.team_id=? AND c.archived=0 AND s.done=1", [$teamId]);
    $comments = (int)scalar(
        "SELECT COUNT(*) FROM comments cm JOIN cards c ON c.id=cm.card_id
         WHERE c.team_id=?", [$teamId]);
    $members = (int)scalar("SELECT COUNT(*) FROM team_members WHERE team_id=?", [$teamId]);
    $contributors = (int)scalar(
        "SELECT COUNT(DISTINCT assignee) FROM cards
         WHERE team_id=? AND archived=0 AND column_id=? AND assignee IS NOT NULL AND assignee!=''", [$teamId, $doneCol]);

    $firstDays = 0;
    if (!empty($row['first_card_at'])) {
        $firstDays = (int)floor((time() - strtotime($row['first_card_at'])) / 86400);
    }

    return [
        'total'        => (int)($row['total'] ?? 0),
        'concluded'    => (int)($row['concluded'] ?? 0),
        'active'       => (int)($row['active'] ?? 0),
        'overdue'      => (int)($row['overdue'] ?? 0),
        'economyMonth' => (float)($row['economy_month'] ?? 0),
        'hoursMonth'   => (float)($row['hours_month'] ?? 0),
        'subtasksDone' => $subsDone,
        'comments'     => $comments,
        'members'      => $members,
        'contributors' => $contributors,
        'ageDays'      => $firstDays,
    ];
}

/** Hidrata uma equipe com contagem de membros e cards. */
/**
 * Meta inteligente AUTOMÁTICA: se a equipe ativou `smart_goal_auto` e já há
 * histórico suficiente, recalcula e PERSISTE a meta (semanal/mensal) a partir
 * do desempenho — ajustando ao longo do tempo. Sem histórico, não faz nada
 * (a flag continua ligada, esperando dados). Retorna o array $t atualizado.
 */
function maybe_autoupdate_goal(array $t): array {
    if (empty($t['smart_goal_auto'])) return $t;
    $s = smart_goal_suggestion($t['id']);
    if (empty($s['hasData'])) return $t;
    if ((int)$t['goal_weekly'] !== (int)$s['weekly'] || (int)$t['goal_monthly'] !== (int)$s['monthly']) {
        try {
            q("UPDATE teams SET goal_weekly=?, goal_monthly=? WHERE id=?",
              [(int)$s['weekly'], (int)$s['monthly'], $t['id']]);
        } catch (Throwable $e) { /* best-effort */ }
        $t['goal_weekly']  = (int)$s['weekly'];
        $t['goal_monthly'] = (int)$s['monthly'];
    }
    return $t;
}

function hydrate_team(array $t): array {
    $t = maybe_autoupdate_goal($t);   // 🤖 auto-ajuste da meta inteligente, se ligado
    $t['member_count'] = (int)scalar("SELECT COUNT(*) FROM team_members WHERE team_id = ?", [$t['id']]);
    $t['card_count']   = (int)scalar("SELECT COUNT(*) FROM cards WHERE team_id = ? AND archived = 0", [$t['id']]);
    // Pedidos de entrada pendentes (para o selo "Gerenciar equipe" no quadro).
    $t['pending_requests'] = (int)scalar("SELECT COUNT(*) FROM team_invites WHERE team_id = ? AND status='pending' AND direction='request'", [$t['id']]);
    $t['archived']     = (int)($t['archived'] ?? 0);
    // dono(s)/gestores
    $t['managers'] = array_column(
        all("SELECT u.name FROM team_members tm JOIN users u ON u.user_id = tm.user_id
             WHERE tm.team_id = ? AND tm.role = 'gestor' ORDER BY u.name", [$t['id']]),
        'name'
    );
    // Categorias/tags da equipe (N:N — hoje 1, modelo aceita várias)
    $t['tags'] = all("SELECT tg.id, tg.name, tg.color
                      FROM team_tag_map m JOIN team_tags tg ON tg.id = m.tag_id
                      WHERE m.team_id = ? ORDER BY tg.name", [$t['id']]);
    return $t;
}

