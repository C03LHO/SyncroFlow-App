<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/search.php
   Busca global (paleta Ctrl+K): cards das equipes do usuário,
   equipes e pessoas. Só leitura.
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/teams.php';

$u = require_login();
$action = $_GET['action'] ?? 'query';
if ($action !== 'query') error_response('action_invalida', 400);

$q = trim((string)($_GET['q'] ?? ''));
if (mb_strlen($q) < 2) json_out(['cards' => [], 'teams' => [], 'people' => []]);

$like = '%' . $q . '%';

// ── Equipes do usuário (escopo dos cards) ──
$myTeams = user_teams($u['user_id']);
$teamIds = array_column($myTeams, 'id');
$teamNameById = [];
foreach ($myTeams as $t) $teamNameById[$t['id']] = $t['name'];

// ── Cards (título, descrição, responsável ou tag) ──
$cards = [];
if ($teamIds) {
    $ph = implode(',', array_fill(0, count($teamIds), '?'));
    $params = array_merge($teamIds, [$like, $like, $like, $like]);
    $rows = all(
        "SELECT id, title, team_id, assignee, column_id, archived
         FROM cards
         WHERE team_id IN ($ph)
           AND ( title LIKE ? OR description LIKE ? OR assignee LIKE ?
                 OR id IN (SELECT card_id FROM card_tags WHERE tag LIKE ?) )
         ORDER BY archived ASC, updated_at DESC
         LIMIT 25",
        $params
    );
    foreach ($rows as $r) {
        $cards[] = [
            'id'       => $r['id'],
            'title'    => $r['title'],
            'teamId'   => $r['team_id'],
            'teamName' => $teamNameById[$r['team_id']] ?? '',
            'assignee' => $r['assignee'],
            'archived' => (int)$r['archived'],
        ];
    }
}

// ── Equipes (por nome) ──
$teams = all(
    "SELECT id, name, icon FROM teams
     WHERE type != 'personal' AND archived = 0 AND name LIKE ?
     ORDER BY name LIMIT 10",
    [$like]
);

// ── Pessoas (usuários ativos por nome ou ID) ──
$people = all(
    "SELECT user_id, name, role FROM users
     WHERE is_active = 1 AND (name LIKE ? OR user_id LIKE ?)
     ORDER BY name LIMIT 10",
    [$like, $like]
);

json_out(['cards' => $cards, 'teams' => $teams, 'people' => $people]);
