<?php
require_once __DIR__ . '/_bootstrap.php';
$u = require_login(); require_role('export');
$action = $_GET['action'] ?? '';

function _csv(array $rows): void {
    $stamp = date('Ymd_His');
    header('Content-Type: text/csv; charset=utf-8');
    header("Content-Disposition: attachment; filename=syncroflow_{$stamp}.csv");
    echo "\xEF\xBB\xBF"; // BOM (Excel pt-BR)
    $out = fopen('php://output', 'w');
    foreach ($rows as $r) fputcsv($out, $r, ';');
    fclose($out);
    exit;
}

switch ($action) {
case 'cards_csv': {
    $rows = [['ID','Título','Coluna','Responsável','Início','Previsão','Status','Prioridade','Progresso','Tags','Arquivado','Subtarefas','Comentários']];
    foreach (all("SELECT * FROM cards ORDER BY column_id, title") as $c) {
        $tags = scalar("SELECT GROUP_CONCAT(tag,', ') FROM card_tags WHERE card_id=?",[$c['id']]) ?: '';
        $subs = scalar("SELECT COUNT(*) FROM subtasks WHERE card_id=?",[$c['id']]);
        $cmts = scalar("SELECT COUNT(*) FROM comments WHERE card_id=?",[$c['id']]);
        $rows[] = [
            $c['id'], $c['title'], $c['column_id'], $c['assignee'],
            $c['start_date'], $c['due_date'], $c['projection_status'], $c['priority'],
            $c['progress'].'%', $tags,
            $c['archived'] ? 'sim' : 'não',
            $subs, $cmts,
        ];
    }
    _csv($rows);
}
case 'standup_csv': {
    $rows = [['Data','Usuário','Card','Ação']];
    foreach (all("SELECT h.timestamp, h.user_name, c.title, h.action
                  FROM card_history h LEFT JOIN cards c ON c.id = h.card_id
                  WHERE h.timestamp > datetime('now','-1 day')
                  ORDER BY h.timestamp DESC") as $h) {
        $rows[] = [$h['timestamp'], $h['user_name'], $h['title'] ?? '', $h['action']];
    }
    _csv($rows);
}
default: error_response('action_invalida', 400);
}
