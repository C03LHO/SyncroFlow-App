<?php
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/hydrate.php';
require_once __DIR__ . '/../lib/revision.php';

$u = require_login();
$since   = (int)($_GET['since'] ?? 0);
$current = current_revision();

if ($since >= $current) {
    http_response_code(304);
    header('X-Revision: ' . $current);
    exit;
}

$changes = all(
    "SELECT revision, modified_at, modified_by_name, entity_type, entity_id, action
     FROM revision_log WHERE revision > ? ORDER BY revision ASC LIMIT 500",
    [$since]
);

// Consolida por entidade: só o último estado importa
$consolidated = [];
foreach ($changes as $c) {
    $key = $c['entity_type'] . ':' . ($c['entity_id'] ?? '_global');
    $consolidated[$key] = $c;
}

$events = [];
foreach ($consolidated as $c) {
    $event = [
        'type'      => $c['entity_type'] . '.' . $c['action'],
        'revision'  => (int)$c['revision'],
        'actor'     => $c['modified_by_name'],
        'at'        => $c['modified_at'],
        'entityId'  => $c['entity_id'],
        'entityType'=> $c['entity_type'],
        'action'    => $c['action'],
    ];
    if ($c['action'] !== 'delete' && $c['entity_id']) {
        switch ($c['entity_type']) {
            case 'card':
                $card = hydrate_card($c['entity_id']);
                // Filtra arquivado de outro usuário
                if ($card && $card['archived']) {
                    $owner = strtolower(trim($card['archivedBy'] ?? ''));
                    $me    = strtolower(trim($u['name'] ?? ''));
                    if ($owner !== '' && $owner !== $me) $card = null;
                }
                if ($card) $event['payload'] = $card;
                break;
            case 'column':
                $event['payload'] = one("SELECT * FROM columns WHERE id = ?", [$c['entity_id']]);
                break;
            case 'notice':
                $row = one("SELECT * FROM notices WHERE id = ?", [$c['entity_id']]);
                if ($row) $event['payload'] = _notice_format($row);
                break;
            case 'notification':
                $row = one("SELECT * FROM notifications WHERE id = ?", [$c['entity_id']]);
                if ($row && (!$row['for_user'] || $row['for_user'] === $u['name'])) {
                    $event['payload'] = _notif_format($row);
                }
                break;
            case 'user':
                $event['payload'] = one("SELECT user_id, name, role, color FROM users WHERE user_id = ?",
                                        [$c['entity_id']]);
                break;
        }
    }
    $events[] = $event;
}

json_out(['revision' => $current, 'events' => $events]);
