<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/revision.php
   Cada mutação loga uma linha em revision_log. MAX(revision)
   é o cursor do polling.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

/** Loga uma mutação e retorna o número de revisão criado. */
function bump_revision(string $entity_type, ?string $entity_id, string $action): int {
    $u = current_user();
    q("INSERT INTO revision_log
        (modified_at, modified_by_user_id, modified_by_name, entity_type, entity_id, action)
       VALUES (?,?,?,?,?,?)", [
        now_iso(),
        $u['user_id'] ?? null,
        $u['name']    ?? 'Sistema',
        $entity_type,
        $entity_id,
        $action,
    ]);
    return (int)db()->lastInsertId();
}

/** Revisão atual (maior valor em revision_log). */
function current_revision(): int {
    return (int)scalar("SELECT COALESCE(MAX(revision), 0) FROM revision_log");
}
