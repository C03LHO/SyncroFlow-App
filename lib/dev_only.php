<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/dev_only.php
   Guard reutilizável: impede que scripts de desenvolvimento/
   manutenção sejam executados pela WEB em produção. Via CLI
   (php script.php) roda sempre; pela web, só em localhost.
   Inclua no topo do script:  require_once __DIR__ . '/lib/dev_only.php';
   (defesa extra além do bloqueio no .htaccess, caso o servidor
   não honre .htaccess — ex.: nginx/IIS/PHP embutido).
   ═══════════════════════════════════════════════════════════ */
if (PHP_SAPI !== 'cli') {
    $h = strtolower($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '');
    // strpos em vez de str_starts_with: mantém compatibilidade com PHP 7.4
    $local = strpos($h, 'localhost') === 0 || strpos($h, '127.0.0.1') === 0
          || strpos($h, '[::1]') === 0 || $h === '::1';
    if (!$local) { http_response_code(404); header('Content-Type: text/plain'); exit('Not Found'); }
}
