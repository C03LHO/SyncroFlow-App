<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/photos.php (v12)
   Banco SQLite SEPARADO só para imagens (avatar/capa de usuários
   e equipes). Mantém o banco principal leve — quando o produto
   crescer, este arquivo pode migrar sozinho para outro storage
   (S3, Postgres bytea, etc.) sem tocar no banco principal.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/helpers.php';

/** Caminho ABSOLUTO do banco de fotos (resolve relativo contra a raiz do app,
    não o CWD do processo → mesmo arquivo no servidor web e na CLI).
    
    Com fallback robusto: se a pasta configurada não existir / sem permissão,
    usa ./data (mesma estratégia que lib/db.php). */
function photos_db_path(): string {
    $path = cfg('database.photos_path');
    if (!$path) {
        $dbPath = cfg('database.path');
        if (!$dbPath) {
            throw new RuntimeException("config.json: 'database.path' não definido.");
        }
        $path = dirname($dbPath) . DIRECTORY_SEPARATOR . 'photos.db';
    }
    if (!preg_match('#^([A-Za-z]:[\\\\/]|[\\\\/])#', $path)) {
        $path = dirname(__DIR__) . DIRECTORY_SEPARATOR . ltrim($path, './\\');
    }
    
    // Verifica se a pasta é utilizável; fallback para ./data se não for
    $dbDir = dirname($path);
    $usable = function (string $dir): bool {
        if ($dir === '') return false;
        if (!is_dir($dir)) @mkdir($dir, 0777, true);
        return is_dir($dir) && is_writable($dir);
    };
    
    if (!$usable($dbDir)) {
        $fallbackDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
        if ($usable($fallbackDir)) {
            error_log("SyncroFlow[photos]: pasta '$dbDir' indisponível; usando fallback '$fallbackDir'.");
            $path = $fallbackDir . DIRECTORY_SEPARATOR . 'photos.db';
        } else {
            throw new RuntimeException("Pasta do banco de fotos indisponível: $dbDir (fallback também falhou: $fallbackDir)");
        }
    }
    
    return $path;
}

/** Conexão PDO ao banco de fotos (singleton). Cria schema na 1ª vez. */
function photos_db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $path = photos_db_path(); // Já valida e cria pasta se necessário
    $pdo = new PDO("sqlite:$path", null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec("CREATE TABLE IF NOT EXISTS photos (
        id          TEXT PRIMARY KEY,         -- <owner_type>:<owner_id>:<kind>
        owner_type  TEXT NOT NULL,            -- 'user' | 'team'
        owner_id    TEXT NOT NULL,            -- user_id ou team_id
        kind        TEXT NOT NULL,            -- 'avatar' | 'cover'
        mime        TEXT NOT NULL,
        bytes       INTEGER NOT NULL,
        data        BLOB NOT NULL,
        updated_at  TEXT NOT NULL
    )");
    // Anexos de card vivem AQUI também (mesmo banco das imagens), como BLOB.
    $pdo->exec("CREATE TABLE IF NOT EXISTS files (
        id          TEXT PRIMARY KEY,   -- = id do anexo (espelha metadado no banco principal)
        card_id     TEXT NOT NULL,
        team_id     TEXT,               -- p/ contabilizar consumo por equipe
        name        TEXT NOT NULL,
        mime        TEXT NOT NULL,
        bytes       INTEGER NOT NULL,
        data        BLOB NOT NULL,
        uploaded_by TEXT,
        uploaded_at TEXT NOT NULL
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_files_card ON files(card_id)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_files_team ON files(team_id)");
    return $pdo;
}

/* ─── Anexos (BLOB no banco de imagens) ─── */
function attach_store(string $id, string $cardId, ?string $teamId, string $name, string $mime, string $data, string $by): void {
    $stmt = photos_db()->prepare(
        "INSERT INTO files (id, card_id, team_id, name, mime, bytes, data, uploaded_by, uploaded_at)
         VALUES (:id,:c,:t,:n,:m,:b,:d,:by,:u)");
    $stmt->bindValue(':id', $id);
    $stmt->bindValue(':c',  $cardId);
    $stmt->bindValue(':t',  $teamId);
    $stmt->bindValue(':n',  $name);
    $stmt->bindValue(':m',  $mime);
    $stmt->bindValue(':b',  strlen($data), PDO::PARAM_INT);
    $stmt->bindValue(':d',  $data, PDO::PARAM_LOB);
    $stmt->bindValue(':by', $by);
    $stmt->bindValue(':u',  now_iso());
    $stmt->execute();
}
function attach_get(string $id): ?array {
    $r = photos_db()->prepare("SELECT name, mime, bytes, data FROM files WHERE id = ?");
    $r->execute([$id]);
    $row = $r->fetch();
    return $row === false ? null : $row;
}
function attach_delete(string $id): void {
    $d = photos_db()->prepare("DELETE FROM files WHERE id = ?");
    $d->execute([$id]);
}
function attach_delete_by_card(string $cardId): void {
    $d = photos_db()->prepare("DELETE FROM files WHERE card_id = ?");
    $d->execute([$cardId]);
}

function _photo_key(string $ownerType, string $ownerId, string $kind): string {
    return "$ownerType:$ownerId:$kind";
}

/** Salva/atualiza uma foto. Retorna a URL pública para servir. */
function photo_store(string $ownerType, string $ownerId, string $kind, string $mime, string $data): string {
    $id = _photo_key($ownerType, $ownerId, $kind);
    $stmt = photos_db()->prepare(
        "INSERT INTO photos (id, owner_type, owner_id, kind, mime, bytes, data, updated_at)
         VALUES (:id,:ot,:oi,:k,:m,:b,:d,:u)
         ON CONFLICT(id) DO UPDATE SET mime=:m2, bytes=:b2, data=:d2, updated_at=:u2");
    $stmt->bindValue(':id', $id);
    $stmt->bindValue(':ot', $ownerType);
    $stmt->bindValue(':oi', $ownerId);
    $stmt->bindValue(':k',  $kind);
    $stmt->bindValue(':m',  $mime);
    $stmt->bindValue(':b',  strlen($data), PDO::PARAM_INT);
    $stmt->bindValue(':d',  $data, PDO::PARAM_LOB);
    $stmt->bindValue(':u',  now_iso());
    $stmt->bindValue(':m2', $mime);
    $stmt->bindValue(':b2', strlen($data), PDO::PARAM_INT);
    $stmt->bindValue(':d2', $data, PDO::PARAM_LOB);
    $stmt->bindValue(':u2', now_iso());
    $stmt->execute();
    return photo_url($ownerType, $ownerId, $kind);
}

/** Lê uma foto (assoc com mime/data) ou null. */
function photo_get(string $ownerType, string $ownerId, string $kind): ?array {
    $row = photos_db()->prepare("SELECT mime, data, updated_at FROM photos WHERE id = ?");
    $row->execute([_photo_key($ownerType, $ownerId, $kind)]);
    $r = $row->fetch();
    return $r === false ? null : $r;
}

function photo_exists(string $ownerType, string $ownerId, string $kind): bool {
    $c = photos_db()->prepare("SELECT COUNT(*) FROM photos WHERE id = ?");
    $c->execute([_photo_key($ownerType, $ownerId, $kind)]);
    return (int)$c->fetchColumn() > 0;
}

function photo_delete(string $ownerType, string $ownerId, string $kind): void {
    $d = photos_db()->prepare("DELETE FROM photos WHERE id = ?");
    $d->execute([_photo_key($ownerType, $ownerId, $kind)]);
}

/** URL pública para servir a foto (com cache-buster por timestamp). */
function photo_url(string $ownerType, string $ownerId, string $kind, ?string $ts = null): string {
    $base = url('api/photos.php') . '?action=get'
          . '&t=' . rawurlencode($ownerType)
          . '&o=' . rawurlencode($ownerId)
          . '&k=' . rawurlencode($kind);
    if ($ts) $base .= '&v=' . rawurlencode($ts);
    return $base;
}

/* ─── Contabilidade de armazenamento (painel TI-Dev) ─── */
/** Consumo por equipe (anexos + fotos de equipe), totais e tamanho dos arquivos .db. */
function storage_overview(): array {
    $db = photos_db();
    $teams = []; // teamId => ['files','fileCount','photos','total']
    $bump = function(&$t, $id) { if (!isset($t[$id])) $t[$id] = ['files'=>0,'fileCount'=>0,'photos'=>0,'total'=>0]; };

    foreach ($db->query("SELECT team_id, COUNT(*) c, COALESCE(SUM(bytes),0) b FROM files GROUP BY team_id") as $r) {
        $id = $r['team_id'] ?? '—';
        $bump($teams, $id);
        $teams[$id]['files'] = (int)$r['b']; $teams[$id]['fileCount'] = (int)$r['c'];
    }
    $teamPhotos = 0; $userPhotos = 0; $userPhotoCount = 0;
    foreach ($db->query("SELECT owner_type, owner_id, COALESCE(SUM(bytes),0) b, COUNT(*) c FROM photos GROUP BY owner_type, owner_id") as $r) {
        if ($r['owner_type'] === 'team') { $bump($teams, $r['owner_id']); $teams[$r['owner_id']]['photos'] += (int)$r['b']; $teamPhotos += (int)$r['b']; }
        else { $userPhotos += (int)$r['b']; $userPhotoCount += (int)$r['c']; }
    }
    $filesTotal = 0;
    foreach ($teams as $id => &$t) { $t['total'] = $t['files'] + $t['photos']; $filesTotal += $t['files']; }
    unset($t);

    $mainPath = cfg('database.path');
    $photosPath = photos_db_path();

    return [
        'teams' => $teams,
        'userPhotos' => ['bytes' => $userPhotos, 'count' => $userPhotoCount],
        'totals' => ['files' => $filesTotal, 'teamPhotos' => $teamPhotos, 'userPhotos' => $userPhotos,
                     'all' => $filesTotal + $teamPhotos + $userPhotos],
        'dbFiles' => [
            'main'   => is_file($mainPath)   ? (int)filesize($mainPath)   : 0,
            'photos' => is_file($photosPath) ? (int)filesize($photosPath) : 0,
        ],
    ];
}

/** Maiores anexos (para o TI-Dev ver/limpar o que pesa). */
function storage_top_files(int $limit = 25): array {
    $stmt = photos_db()->prepare(
        "SELECT id, card_id, team_id, name, mime, bytes, uploaded_by, uploaded_at
         FROM files ORDER BY bytes DESC LIMIT ?");
    $stmt->bindValue(1, $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}

/** Consumo de fotos (avatar/capa) por usuário → userId => ['bytes','count']. */
function storage_user_photos(): array {
    $out = [];
    foreach (photos_db()->query(
        "SELECT owner_id, COALESCE(SUM(bytes),0) b, COUNT(*) c
         FROM photos WHERE owner_type='user' GROUP BY owner_id") as $r) {
        $out[$r['owner_id']] = ['bytes' => (int)$r['b'], 'count' => (int)$r['c']];
    }
    return $out;
}

/** TODOS os anexos (p/ o explorador equipe → card → arquivo do TI-Dev).
    Ordenado por tamanho desc para já listar o que mais pesa primeiro. */
function storage_all_files(): array {
    return photos_db()->query(
        "SELECT id, card_id, team_id, name, mime, bytes, uploaded_by, uploaded_at
         FROM files ORDER BY bytes DESC")->fetchAll();
}

/** Maiores CONSUMIDORES por card (agrupa anexos por card). Para o TI-Dev gerenciar. */
function storage_top_cards(int $limit = 20): array {
    $stmt = photos_db()->prepare(
        "SELECT card_id, team_id, COUNT(*) AS files, COALESCE(SUM(bytes),0) AS bytes
         FROM files GROUP BY card_id ORDER BY bytes DESC LIMIT ?");
    $stmt->bindValue(1, $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll();
}
