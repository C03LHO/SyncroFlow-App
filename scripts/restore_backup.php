<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — restore_backup.php  (CLI apenas)
   Descriptografa um backup .db.enc de volta para um .db.

   Uso:
     php scripts/restore_backup.php --in=C:/syncroflow-data/backups/syncroflow_20260101_120000.db.enc --out=C:/syncroflow-data/syncroflow.db

   PARE o site no IIS antes de sobrescrever o banco em produção.
   ═══════════════════════════════════════════════════════════ */

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Apenas CLI.\n"); }

require_once dirname(__DIR__) . '/lib/helpers.php';
require_once dirname(__DIR__) . '/lib/crypto.php';

function arg($flag, $def = null) {
    foreach ($_SERVER['argv'] as $a) {
        if (strpos($a, "--$flag=") === 0) return substr($a, strlen($flag) + 3);
    }
    return $def;
}

$in  = arg('in');
$out = arg('out');
if (!$in || !is_file($in)) { exit("✗ Informe --in=<arquivo .db.enc> válido.\n"); }
if (!$out)                  { exit("✗ Informe --out=<destino .db>.\n"); }

try {
    if (substr($in, -4) === '.enc') {
        crypto_decrypt_file($in, $out);
        echo "✓ Backup descriptografado em: $out\n";
    } else {
        copy($in, $out);
        echo "✓ Backup (não criptografado) copiado para: $out\n";
    }
    echo "→ Reinicie o site no IIS para carregar o banco restaurado.\n";
} catch (Throwable $e) {
    echo "✗ Erro: " . $e->getMessage() . "\n";
    exit(1);
}
