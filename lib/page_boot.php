<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/page_boot.php
   Bootstrap das PÁGINAS (admin.php, app.php, login.php, register.php,
   index.php) — diferente do api/_bootstrap.php (que responde JSON).

   - Aplica display_errors/log_errors a partir do config.json (as páginas
     NÃO herdavam isso, por isso um erro vinha como "500" em branco do IIS).
     Para diagnosticar em produção: ponha "debug.display_errors": true no
     config.json do servidor, recarregue, e o erro real aparece na tela.
   - Sempre registra erros fatais no log configurado (texto), para que o
     TI-Dev consiga ler a causa mesmo com display_errors desligado.
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/helpers.php';

$__sf_debug = (bool) cfg('debug.display_errors', false);
@ini_set('display_errors', $__sf_debug ? '1' : '0');
@ini_set('log_errors', cfg('debug.log_errors', true) ? '1' : '0');
$__sf_log = cfg('debug.log_path');
if ($__sf_log) { @ini_set('error_log', $__sf_log); }
error_reporting(E_ALL);

// Garante que erros fatais sejam registrados (e visíveis se debug ligado),
// evitando a tela 500 totalmente em branco do IIS sem pista nenhuma.
register_shutdown_function(function () use ($__sf_debug) {
    $e = error_get_last();
    if (!$e || !in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) return;
    @error_log('[SyncroFlow][FATAL] ' . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
    if ($__sf_debug && !headers_sent()) {
        http_response_code(500);
        echo "\n<pre style=\"white-space:pre-wrap;background:#fef2f2;border:1px solid #fecaca;color:#7f1d1d;padding:14px;margin:20px;border-radius:8px;font:13px Consolas,monospace;\">";
        echo "ERRO FATAL:\n" . htmlspecialchars($e['message'], ENT_QUOTES, 'UTF-8');
        echo "\n@ " . htmlspecialchars($e['file'] . ':' . $e['line'], ENT_QUOTES, 'UTF-8') . "</pre>";
    }
});
