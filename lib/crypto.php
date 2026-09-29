<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/crypto.php
   Criptografia AES-256-GCM em PHP puro (extensão openssl).
   Usado para proteger backups (.db) e o log em repouso.

   A chave mestra é gerada uma vez e guardada FORA da pasta web
   (na pasta de dados), com nome oculto. Mesmo que alguém baixe
   um backup .enc, sem a chave os dados são inúteis.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/helpers.php';

/** Caminho do arquivo de chave (fora da web, junto ao banco). */
function _crypto_key_path(): string {
    $dbDir = dirname(cfg('database.path'));
    return rtrim($dbDir, '/\\') . DIRECTORY_SEPARATOR . '.syncroflow.key';
}

/**
 * Retorna a chave mestra (32 bytes). Gera na primeira chamada.
 * A chave é binária, armazenada em base64 no arquivo.
 */
function crypto_master_key(): string {
    static $key = null;
    if ($key !== null) return $key;

    $path = _crypto_key_path();
    if (is_file($path)) {
        $raw = trim((string)@file_get_contents($path));
        $decoded = base64_decode($raw, true);
        if ($decoded !== false && strlen($decoded) === 32) {
            $key = $decoded;
            return $key;
        }
    }
    // Gera nova chave
    $key = random_bytes(32);
    ensure_dir(dirname($path));
    @file_put_contents($path, base64_encode($key));
    @chmod($path, 0600);
    return $key;
}

/** Disponível? (extensão openssl carregada) */
function crypto_available(): bool {
    return function_exists('openssl_encrypt') && in_array('aes-256-gcm', openssl_get_cipher_methods(), true);
}

/**
 * Criptografa bytes → blob binário [iv(12) | tag(16) | ciphertext].
 */
function crypto_encrypt(string $plain): string {
    $key = crypto_master_key();
    $iv  = random_bytes(12);
    $tag = '';
    $ct  = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    if ($ct === false) throw new RuntimeException('Falha ao criptografar.');
    return $iv . $tag . $ct;
}

/** Descriptografa blob produzido por crypto_encrypt(). */
function crypto_decrypt(string $blob): string {
    $key = crypto_master_key();
    $iv  = substr($blob, 0, 12);
    $tag = substr($blob, 12, 16);
    $ct  = substr($blob, 28);
    $pt  = openssl_decrypt($ct, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($pt === false) throw new RuntimeException('Falha ao descriptografar (chave ou arquivo inválido).');
    return $pt;
}

/** Criptografa um arquivo gerando <destino>. Remove o plaintext de origem se $removeSource. */
function crypto_encrypt_file(string $src, string $dest, bool $removeSource = true): void {
    $data = @file_get_contents($src);
    if ($data === false) throw new RuntimeException("Não foi possível ler: $src");
    @file_put_contents($dest, crypto_encrypt($data));
    @chmod($dest, 0600);
    if ($removeSource) @unlink($src);
}

/** Descriptografa um arquivo .enc para um destino. */
function crypto_decrypt_file(string $src, string $dest): void {
    $blob = @file_get_contents($src);
    if ($blob === false) throw new RuntimeException("Não foi possível ler: $src");
    @file_put_contents($dest, crypto_decrypt($blob));
}

/**
 * Append de uma linha de log criptografada (uma linha = um blob base64).
 * Mantém o arquivo "tailável" linha-a-linha, mas cada linha é opaca.
 */
function crypto_log(string $line): void {
    if (!cfg('debug.log_errors', true)) return;
    $path = cfg('debug.log_path');
    if (!$path) return;
    try {
        $entry = '[' . now_iso() . '] ' . $line;
        $enc = base64_encode(crypto_encrypt($entry));
        @file_put_contents($path . '.enc', $enc . "\n", FILE_APPEND | LOCK_EX);
    } catch (Throwable $e) { /* best-effort */ }
}
