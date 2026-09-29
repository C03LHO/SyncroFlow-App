<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — reset.php
   Página pública de REDEFINIÇÃO DE SENHA via link com token.
   Acesso: reset.php?t=selector:validator (enviado por e-mail).
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/lib/page_boot.php';
require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/auth.php';

start_session_if_needed();

$token = (string)($_POST['t'] ?? $_GET['t'] ?? '');
$valid = $token !== '' && password_reset_validate($token) !== null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $p1 = (string)($_POST['password'] ?? '');
    $p2 = (string)($_POST['password_confirm'] ?? '');
    if ($p1 !== $p2) {
        flash('As senhas não conferem.', 'error');
        redirect('reset.php?t=' . urlencode($token));
    }
    [$ok, $err] = password_reset_complete($token, $p1);
    if ($ok) {
        flash('Senha redefinida com sucesso. Faça login com a nova senha.', 'success');
        redirect('login.php');
    }
    flash($err, 'error');
    redirect('reset.php?t=' . urlencode($token));
}

$flash = get_flash();
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redefinir senha — Syncro Flow</title>
  <link rel="icon" type="image/png" href="<?= url('imagens/logo/icone.png') ?>">
  <script>(function(){try{var t=localStorage.getItem('syncro_theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
  <?php require __DIR__ . '/partials/_styles.php'; ?>
  <style>
    body { min-height:100vh; display:flex; justify-content:center; padding:24px;
      background-image:
        radial-gradient(circle at 18% 18%, rgba(0,121,109,.18), transparent 28%),
        radial-gradient(circle at 82% 12%, rgba(255,193,0,.14), transparent 24%),
        radial-gradient(circle at 75% 85%, rgba(8,145,178,.10), transparent 30%); }
    .lwrap { width:100%; max-width:440px; margin:auto; }
    .lcard { background:var(--surface); background:color-mix(in srgb, var(--surface) 74%, transparent);
      -webkit-backdrop-filter:blur(18px) saturate(140%); backdrop-filter:blur(18px) saturate(140%);
      border:1px solid var(--border); border-color:color-mix(in srgb, var(--border) 55%, transparent);
      border-radius:var(--radius-lg); padding:36px 34px;
      box-shadow:var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,.45); position:relative; overflow:hidden; animation:popIn .3s ease-out; }
    .lcard::before { content:""; position:absolute; top:0; left:0; right:0; height:4px;
      background:linear-gradient(90deg,var(--primary) 0%,var(--brand) 50%,var(--primary) 100%); }
    .lhead { text-align:center; margin-bottom:22px; }
    .lhead img { width:80px; height:80px; object-fit:contain; margin-bottom:12px; background:var(--surface-2);
      border:1px solid var(--border); border-radius:var(--radius-md); padding:10px; }
    .lhead h1 { font-size:20px; font-weight:700; color:var(--text); }
    .lhead h1 .teal { color:var(--primary); }
    .lhead p { color:var(--text-muted); font-size:12.5px; margin-top:4px; }
    .flash { padding:11px 14px; border-radius:var(--radius); font-size:13px; margin-bottom:14px; border:1px solid; }
    .flash-success { background:var(--success-soft); border-color:var(--success); color:#14532d; }
    .flash-error { background:var(--danger-soft); border-color:var(--danger); color:#7f1d1d; }
    .field { margin-bottom:14px; }
    .field label { display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:var(--text-2); margin-bottom:6px; }
    .lcard input { width:100%; padding:11px 13px; border:1px solid var(--border); border-radius:var(--radius);
      background:var(--surface-2); color:var(--text); font-size:14px; font-family:inherit; outline:none; }
    .lcard input:focus { border-color:var(--primary); background:var(--surface); box-shadow:0 0 0 3px var(--primary-soft); }
    .lbtn { width:100%; padding:12px 16px; border-radius:var(--radius); border:1px solid var(--primary-2);
      background:linear-gradient(180deg,var(--primary) 0%,var(--primary-2) 100%); color:#fff; font-size:14px;
      font-weight:700; cursor:pointer; margin-top:6px; }
    .lfoot { text-align:center; margin-top:20px; padding-top:16px; border-top:1px solid var(--border); font-size:12px; color:var(--text-muted); }
    .lfoot a { color:var(--primary); font-weight:700; text-decoration:none; }
  </style>
</head>
<body>
  <div class="lwrap">
    <div class="lcard">
      <div class="lhead">
        <img src="<?= url('imagens/logo/icone.png') ?>" alt="SyncroFlow">
        <h1><span class="teal">Syncro</span>Flow</h1>
        <p>Redefinição de senha</p>
      </div>

      <?php if ($flash): ?>
        <div class="flash flash-<?= san($flash['type']) ?>"><?= san($flash['msg']) ?></div>
      <?php endif; ?>

      <?php if ($valid): ?>
        <form method="post" autocomplete="off">
          <input type="hidden" name="t" value="<?= san($token) ?>">
          <div class="field">
            <label>Nova senha</label>
            <input type="password" name="password" required minlength="8" autofocus placeholder="Mínimo 8 caracteres">
          </div>
          <div class="field">
            <label>Confirmar nova senha</label>
            <input type="password" name="password_confirm" required minlength="8" placeholder="Repita a senha">
          </div>
          <p class="hint" style="margin:-4px 0 10px;font-size:11px;color:var(--text-muted);">🔒 Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.</p>
          <button class="lbtn" type="submit">Redefinir senha</button>
        </form>
      <?php else: ?>
        <p style="text-align:center;color:var(--text-2);font-size:14px;line-height:1.6;">
          ⛔ Este link de redefinição é <strong>inválido ou expirou</strong>.<br>
          Solicite um novo na tela de login.
        </p>
      <?php endif; ?>

      <div class="lfoot">
        <a href="<?= url('login.php') ?>">← Voltar ao login</a>
        <br>Syncro Flow v<?= san(cfg('app.version', '23.4')) ?>
      </div>
    </div>
  </div>
</body>
</html>
