<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — app.php
   Shell estilo SyncroFlow: sidebar + main(topbar + content)
   STATE injetado pelo PHP (arquitetura de referência).
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/lib/page_boot.php';   // erros logados/visíveis (evita 500 em branco)
require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/hydrate.php';

$u     = require_login();
$state = build_initial_state($u);

// O shell (sidebar, topbar, STATE) deve sempre vir fresco — nunca de cache do
// navegador. Garante que mudanças de menu/atalhos apareçam no 1º reload.
if (!headers_sent()) {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
}
?>
<!DOCTYPE html>
<html lang="pt-BR" data-theme="light" data-author="Aurelio Gabriel">
<?php require __DIR__ . '/partials/_head.php'; ?>
<body>
  <a class="skip-link" href="#main">Pular para o conteúdo principal</a>

  <div class="app-shell">
    <?php require __DIR__ . '/partials/_sidebar.php'; ?>

    <main class="main">
      <?php require __DIR__ . '/partials/_topbar.php'; ?>
      <div class="content" id="main" role="region" aria-label="Conteúdo principal" tabindex="-1">
        <div class="boot-loader">Carregando…</div>
      </div>
    </main>
  </div>

  <div id="modal-mount"></div>
  <div id="toasts" role="status" aria-live="polite"></div>
  <div id="notifications-panel" hidden></div>

  <script>
    window.__STATE__  = <?= json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
    window.__CONFIG__ = {
      pollInterval: <?= (int)cfg('app.poll_interval_seconds', 5) * 1000 ?>,
      apiBase: <?= json_encode(url('api')) ?>,
      baseUrl: <?= json_encode(app_base()) ?>,
      version: <?= json_encode(cfg('app.version', '23.4')) ?>,
    };
  </script>
  <?php $aroot = __DIR__; $av = fn($p) => '?v=' . (@filemtime($aroot . '/' . $p) ?: cfg('app.version','1')); ?>
  <script type="module" src="<?= url('js/main.js') . $av('js/main.js') ?>"></script>
  <script src="<?= url('js/tobi.js') . $av('js/tobi.js') ?>" defer></script>
</body>
</html>
