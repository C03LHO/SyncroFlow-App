<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — index.php
   Roteador minimal: decide entre login e app.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/auth.php';

if (!current_user()) {
    redirect('login.php');
}

// Placeholder caso app.php tenha sido removido por algum motivo.
if (!is_file(__DIR__ . '/app.php')) {
    $u = current_user();
    http_response_code(200);
    header('Content-Type: text/html; charset=utf-8');
    ?>
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Syncro Flow — Em construção</title>
        <link rel="icon" type="image/png" href="<?= url('imagens/logo/icone.png') ?>">
        <style>
          body { font-family:'Segoe UI',Arial,sans-serif; background:#f0f4f3;
                 color:#0f1f1e; display:flex; align-items:center; justify-content:center;
                 min-height:100vh; margin:0; padding:24px; }
          .box { background:#fff; border:1px solid #e2e8e7; border-radius:14px;
                 padding:30px 34px; max-width:520px; box-shadow:0 4px 24px rgba(0,0,0,.06); }
          h1   { color:#0a8f84; font-size:1.3rem; margin-bottom:6px; }
          p    { color:#374746; font-size:.92rem; line-height:1.6; margin-top:10px; }
          code { background:#e8f2f1; padding:1px 6px; border-radius:4px;
                 font-family:Consolas,monospace; font-size:.85rem; color:#076e65; }
          .who { background:#f8fbfb; border:1px solid #e2e8e7; border-radius:10px;
                 padding:12px 16px; margin-top:18px; font-size:.88rem; }
          .role { display:inline-block; padding:2px 9px; border-radius:999px;
                  background:#dcfce7; color:#15803d; font-size:.72rem; font-weight:700;
                  margin-left:6px; text-transform:uppercase; }
          a    { color:#0a8f84; text-decoration:none; font-weight:600; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>✅ Login funcionando</h1>
          <p>Você está autenticado. O <code>app.php</code> com o Kanban completo será criado na <strong>Fase 5</strong>.</p>
          <div class="who">
            <strong><?= san($u['name']) ?></strong>
            <span class="role"><?= san($u['role']) ?></span>
          </div>
          <p style="margin-top:18px;">
            → <a href="<?= url('logout.php') ?>">Sair</a> ·
            <a href="<?= url('api/auth.php?action=me') ?>">GET /api/auth.php?action=me</a>
          </p>
        </div>
      </body>
    </html>
    <?php
    exit;
}

redirect('app.php');
