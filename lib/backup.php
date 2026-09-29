<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/backup.php
   Funções compartilhadas de backup:
   - create_backup_file()      → cria uma cópia do .db
   - prune_old_backups()       → mantém só os N últimos
   - maybe_auto_backup()       → checa intervalo e roda se devido
   - register_auto_backup_hook → agenda checagem para o final da request
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/crypto.php';

/**
 * Cria uma cópia do .db atual em backups.path com timestamp.
 * Se a criptografia estiver disponível, grava como .db.enc (AES-256-GCM)
 * e remove o plaintext — backup protegido em repouso.
 * Devolve metadados do backup criado.
 */
function create_backup_file(string $label, bool $auto, ?string $createdBy = null): array {
    $dbPath = cfg('database.path');
    $bkpDir = cfg('backups.path');
    ensure_dir($bkpDir);

    $stamp = date('Ymd_His');
    $useEnc = crypto_available() && (bool)cfg('backups.encrypt', true);
    $fname  = "syncroflow_{$stamp}.db" . ($useEnc ? '.enc' : '');
    $path   = rtrim($bkpDir, '/\\') . DIRECTORY_SEPARATOR . $fname;

    if ($useEnc) {
        // Copia para temp, criptografa para .enc, remove o temp
        $tmp = $path . '.tmp';
        if (!@copy($dbPath, $tmp)) throw new RuntimeException("Falha ao copiar o banco.");
        crypto_encrypt_file($tmp, $path, true);
    } else {
        if (!@copy($dbPath, $path)) {
            throw new RuntimeException("Falha ao copiar o banco para $path");
        }
    }

    $id  = uid();
    $rev = (int)scalar("SELECT COALESCE(MAX(revision),0) FROM revision_log");
    $cc  = (int)scalar("SELECT COUNT(*) FROM cards");
    q("INSERT INTO backups (id, label, created_at, created_by, revision, card_count, file_path, auto)
       VALUES (?,?,?,?,?,?,?,?)",
       [$id, $label, now_iso(), $createdBy ?? 'Sistema',
        $rev, $cc, $path, $auto ? 1 : 0]);

    prune_old_backups();
    return ['id' => $id, 'file_path' => $path, 'revision' => $rev, 'cards' => $cc];
}

/**
 * Mantém apenas os N backups mais recentes (config: backups.keep_count, default 30).
 */
function prune_old_backups(): void {
    $keep = (int)cfg('backups.keep_count', 30);
    if ($keep <= 0) return;
    $rows = all("SELECT id, file_path FROM backups ORDER BY created_at DESC");
    if (count($rows) <= $keep) return;
    foreach (array_slice($rows, $keep) as $b) {
        @unlink($b['file_path']);
        q("DELETE FROM backups WHERE id = ?", [$b['id']]);
    }
}

/**
 * Verifica se passou do intervalo de backup automático e, se sim, cria.
 * Retorna true se um backup foi criado nesta chamada.
 */
function maybe_auto_backup(): bool {
    $hours = (float)cfg('backups.auto_interval_hours', 2);
    if ($hours <= 0) return false;

    $lastAuto = scalar("SELECT MAX(created_at) FROM backups WHERE auto = 1");
    if ($lastAuto) {
        $elapsed = (time() - strtotime($lastAuto)) / 3600.0;
        if ($elapsed < $hours) return false;
    }
    try {
        create_backup_file('Auto', true);
        return true;
    } catch (Throwable $e) {
        // Silencioso — backup é best-effort, não pode quebrar request
        error_log('[SyncroFlow auto-backup] ' . $e->getMessage());
        return false;
    }
}

/**
 * Registra a checagem de backup automático para rodar APÓS a resposta HTTP
 * ser enviada ao usuário. Isso evita atraso visível ao cliente.
 *
 * Chamado uma vez por request (via lib/db.php em db()).
 */
function register_auto_backup_hook(): void {
    static $registered = false;
    if ($registered) return;
    $registered = true;

    register_shutdown_function(function () {
        // Garante que a resposta foi enviada antes de copiar arquivo grande
        if (function_exists('fastcgi_finish_request')) {
            @fastcgi_finish_request();
        } elseif (function_exists('flush')) {
            @flush();
        }
        try {
            maybe_auto_backup();
        } catch (Throwable $e) {
            error_log('[SyncroFlow shutdown backup] ' . $e->getMessage());
        }
    });
}
