<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/_bootstrap.php
   Include comum para todos os endpoints da API.
   - Carrega helpers, db, auth, rbac, json.
   - Configura tratamento de erro coerente com JSON.
   - Define headers padrão.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/rbac.php';
require_once __DIR__ . '/../lib/json.php';
require_once __DIR__ . '/../lib/crypto.php';

ini_set('display_errors', (bool)cfg('debug.display_errors', false) ? '1' : '0');
ini_set('log_errors',     (bool)cfg('debug.log_errors', true)      ? '1' : '0');
$logPath = cfg('debug.log_path');
if ($logPath) ini_set('error_log', $logPath);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// ─── Proteção CSRF ───
// Requisições que ALTERAM estado (POST/PUT/PATCH/DELETE) precisam do header
// X-Requested-With (o front sempre envia). Esse header NÃO pode ser definido
// por um site malicioso sem disparar preflight CORS — logo, bloqueia CSRF.
// Some-se a isso o cookie de sessão SameSite=Lax. GET (leitura) não é afetado.
$_method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if (!in_array($_method, ['GET', 'HEAD', 'OPTIONS'], true)) {
    $_xrw = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    if (strcasecmp($_xrw, 'XMLHttpRequest') !== 0) {
        http_response_code(403);
        echo json_encode(['error' => 'csrf', 'message' => 'Requisição bloqueada (origem não confiável).'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// Qualquer erro/exceção não tratado vira JSON 500 padronizado
set_exception_handler(function (Throwable $e) {
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    // Log criptografado em repouso (.log.enc) — sem vazar stack em texto puro
    crypto_log($e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    echo json_encode([
        'error'   => 'server_error',
        'message' => cfg('debug.display_errors', false) ? $e->getMessage() : 'Erro interno do servidor.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
});
