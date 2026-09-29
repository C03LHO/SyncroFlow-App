<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/db.php
   Conexão PDO singleton + helpers de query:
   PDO direto, sem ORM, sem Composer.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/helpers.php';

/**
 * Conexão PDO SQLite singleton.
 * - Cria a pasta do banco se necessário.
 * - Liga foreign keys, WAL e synchronous=NORMAL.
 */
function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dbPath = cfg('database.path');
    if (!$dbPath) {
        throw new RuntimeException("config.json: 'database.path' não definido.");
    }
    // Diretório utilizável = existe (ou foi criado) E é gravável.
    $usable = function (string $dir): bool {
        if ($dir === '') return false;
        if (!is_dir($dir)) @mkdir($dir, 0777, true);
        return is_dir($dir) && is_writable($dir);
    };
    $dbDir = dirname($dbPath);
    if (!$usable($dbDir)) {
        // Fallback robusto: usa a pasta ./data dentro do projeto (evita HTTP 500
        // quando o caminho do config — ex.: um caminho de produção — não existe / sem permissão).
        $fallbackDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
        if ($usable($fallbackDir)) {
            error_log("SyncroFlow[db]: pasta '$dbDir' indisponível; usando fallback '$fallbackDir'.");
            $dbDir  = $fallbackDir;
            $dbPath = $fallbackDir . DIRECTORY_SEPARATOR . basename($dbPath);
        } else {
            throw new RuntimeException("Pasta do banco indisponível: $dbDir (fallback também falhou: $fallbackDir)");
        }
    }

    $pdo = new PDO("sqlite:$dbPath", null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    // Pragmas — performance e integridade
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA synchronous  = NORMAL');

    // ──────────────────────────────────────────────────────────
    // Auto-init: na PRIMEIRA conexão da request,
    // o schema é garantido (cria se não existe, atualiza se faltam
    // colunas, popula colunas padrão e o admin inicial).
    // Em runs subsequentes na mesma request, a função é cacheada
    // e custa ~0ms. Isso significa que o usuário nunca precisa
    // rodar init_db.php manualmente antes do primeiro acesso.
    // ──────────────────────────────────────────────────────────
    require_once __DIR__ . '/schema.php';
    ensure_schema($pdo);

    // ──────────────────────────────────────────────────────────
    // Hook de backup automático: registra para rodar APÓS a
    // resposta HTTP ser enviada (via register_shutdown_function).
    // Qualquer request — login, abrir board, polling de 5s — passa
    // por aqui. A função verifica se já passou o intervalo e cria
    // o backup só se for o caso. Usuário não percebe a latência.
    // ──────────────────────────────────────────────────────────
    if (PHP_SAPI !== 'cli') {
        require_once __DIR__ . '/backup.php';
        register_auto_backup_hook();
        // Mesma ideia para os lembretes de vencimento por e-mail: a varredura
        // roda após a resposta e só de fato envia se passou o intervalo
        // (throttle interno) e houver usuários com a notificação ligada.
        require_once __DIR__ . '/notify_mail.php';
        register_due_check_hook();
        // Resumo semanal (digest): mesma ideia — roda após a resposta e só
        // envia 1x por semana ISO, a partir do dia/hora configurados.
        register_weekly_digest_hook();
        // Ligas (estilo Duolingo): virada semanal — promove/rebaixa ao mudar a semana.
        require_once __DIR__ . '/leagues.php';
        register_league_rollover_hook();
    }

    return $pdo;
}

/** Prepara e executa em uma chamada, retornando o PDOStatement. */
function q(string $sql, array $params = []): PDOStatement {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

/** Primeira linha (assoc) ou null. */
function one(string $sql, array $params = []) {
    $row = q($sql, $params)->fetch();
    return $row === false ? null : $row;
}

/** Todas as linhas (array de assoc). */
function all(string $sql, array $params = []): array {
    return q($sql, $params)->fetchAll();
}

/** Primeiro valor da primeira linha (escalar). */
function scalar(string $sql, array $params = []) {
    return q($sql, $params)->fetchColumn();
}

/** Executa uma transação. Reverte em qualquer exceção. */
function tx(callable $fn) {
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = $fn($pdo);
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}
