<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — register.php (v11.1)
   Cadastro público com pergunta de segurança. Default: visitante.
   Promoção para gestor/analista passa por role_requests.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/lib/page_boot.php';   // erros logados/visíveis (evita 500 em branco)
require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/auth.php';

start_session_if_needed();
if (current_user()) redirect('app.php');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $first  = trim($_POST['first_name'] ?? '');
    $last   = trim($_POST['last_name'] ?? '');
    $email  = trim($_POST['email'] ?? '');
    $pwd    = (string)($_POST['password'] ?? '');
    $pwd2   = (string)($_POST['password_confirm'] ?? '');

    if ($pwd !== $pwd2) {
        flash('As senhas não conferem.', 'error');
        redirect('register.php');
    }
    if ($first === '' || $last === '') {
        flash('Informe nome e sobrenome.', 'error');
        redirect('register.php');
    }
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        flash('Informe um e-mail válido (usado para recuperar a senha).', 'error');
        redirect('register.php');
    }
    if (empty($_POST['accept_terms'])) {
        flash('Você precisa aceitar os Termos de Uso para criar a conta.', 'error');
        redirect('register.php');
    }
    $fullName = $first . ' ' . $last;
    try {
        // Identificador interno SEMPRE gerado pelo servidor (nunca vem do formulário).
        $u = register_user('', $pwd, $fullName, null, $email);
        // E-mail de boas-vindas (best-effort, não bloqueia o cadastro)
        try {
            require_once __DIR__ . '/lib/mailer.php';
            if (mail_enabled()) {
                $body = '<p>Olá, ' . san($first) . '! 👋</p>'
                      . '<p>Sua conta no <strong>SyncroFlow</strong> foi criada com sucesso.</p>'
                      . '<p>Guarde este e-mail: é por ele que você recupera a senha, se precisar.</p>';
                mail_send($email, 'Bem-vindo(a) ao SyncroFlow 🦫', mail_template('Conta criada com sucesso', $body, 'Sua conta no SyncroFlow foi criada'));
            }
        } catch (Throwable $e) { /* ignora falha de e-mail */ }
        login($email, $pwd);   // credencial é o e-mail
        flash('Cadastro concluído. Você entrou como ' . strtoupper($u['role']) . '.', 'success');
        redirect('app.php');
    } catch (Throwable $e) {
        flash($e->getMessage(), 'error');
        redirect('register.php');
    }
}
$flash = get_flash();
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cadastro — Syncro Flow</title>
  <link rel="icon" type="image/png" href="<?= url('imagens/logo/icone.png') ?>">
  <script>(function(){try{var t=localStorage.getItem('syncro_theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
  <script>
    /* Acessibilidade: aplica preferências salvas ANTES do paint (sem flash). */
    (function(){
      var F={contrast:'a11y-contrast',readableFont:'a11y-readable-font',links:'a11y-links',focusHighlight:'a11y-focus',spacing:'a11y-spacing',reading:'a11y-reading',reduceMotion:'a11y-reduce-motion'};
      var p;try{p=JSON.parse(localStorage.getItem('syncro_a11y')||'{}');}catch(e){p={};}
      var h=document.documentElement;for(var k in F)if(p[k])h.classList.add(F[k]);
      var z=Number(p.fontScale);if(isFinite(z)&&z>0)h.style.setProperty('--a11y-zoom',String(Math.min(1.8,Math.max(0.9,z))));
    })();
  </script>
  <?php require __DIR__ . '/partials/_styles.php'; ?>
  <style>
    body {
      min-height: 100vh; display: flex;
      justify-content: center;
      padding: 24px;
      background-image:
        radial-gradient(circle at 18% 18%, rgba(0, 121, 109, 0.18), transparent 28%),
        radial-gradient(circle at 82% 12%, rgba(255, 193, 0, 0.14), transparent 24%),
        radial-gradient(circle at 75% 85%, rgba(8, 145, 178, 0.10), transparent 30%);
    }
    .lwrap { width: 100%; max-width: 520px; margin: auto; }
    .auth-theme-btn {
      position: fixed; top: 16px; right: 16px; z-index: 50;
      width: 40px; height: 40px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      background: var(--surface); border: 1px solid var(--border);
      color: var(--text-2); cursor: pointer; font-size: 18px;
      box-shadow: var(--shadow-sm); transition: all var(--transition);
    }
    .auth-theme-btn:hover { color: var(--primary); border-color: var(--primary); transform: translateY(-1px); }
    .lcard {
      background: var(--surface);                                          /* fallback sólido */
      background: color-mix(in srgb, var(--surface) 74%, transparent);     /* vidro fosco */
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      backdrop-filter: blur(18px) saturate(140%);
      border: 1px solid var(--border);
      border-color: color-mix(in srgb, var(--border) 55%, transparent);
      border-radius: var(--radius-lg);
      padding: 32px 30px;
      box-shadow: var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.45);
      position: relative; overflow: hidden;
      animation: popIn .3s ease-out;
    }
    .lcard::before {
      content: ""; position: absolute;
      top: 0; left: 0; right: 0; height: 4px;
      background: linear-gradient(90deg, var(--primary) 0%, var(--brand) 50%, var(--primary) 100%);
    }
    .lhead { text-align: center; margin-bottom: 22px; }
    .lhead img {
      width: 80px; height: 80px;
      object-fit: contain;
      margin-bottom: 12px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 10px;
    }
    .lhead h1 { font-size: 20px; font-weight: 700; color: var(--text); letter-spacing: -0.3px; }
    .lhead h1 .teal { color: var(--primary); }
    .lhead p { color: var(--text-muted); font-size: 12.5px; margin-top: 4px; }

    .flash {
      padding: 11px 14px;
      border-radius: var(--radius);
      font-size: 13px;
      margin-bottom: 14px;
      border: 1px solid;
    }
    .flash-success { background: var(--success-soft); border-color: var(--success); color: #14532d; }
    .flash-error   { background: var(--danger-soft); border-color: var(--danger); color: #7f1d1d; }

    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 480px) { .row2 { grid-template-columns: 1fr; } }

    .lfoot {
      text-align: center;
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      font-size: 12px; color: var(--text-muted);
    }
    .lfoot a { color: var(--primary); font-weight: 700; }
    .lfoot a:hover { text-decoration: underline; }
    .hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; display: block; }
  </style>
</head>
<body>
  <a class="skip-link" href="#main">Pular para o conteúdo</a>
  <button type="button" id="auth-theme-btn" class="auth-theme-btn" title="Trocar tema" aria-label="Trocar tema">🎨</button>
  <main class="lwrap" id="main" tabindex="-1">
    <div class="lcard">
      <div class="lhead">
        <img src="<?= url('imagens/logo/icone.png') ?>" alt="SyncroFlow">
        <h1><span class="teal">Syncro</span>Flow — Cadastro</h1>
        <p>Crie sua conta. Nível inicial: <strong>Usuário Padrão</strong>. O cargo em cada equipe é definido pelo gestor.</p>
      </div>

      <?php if ($flash): ?>
        <div class="flash flash-<?= san($flash['type']) ?>"><?= san($flash['msg']) ?></div>
      <?php endif; ?>

      <form method="post" autocomplete="off">
        <div class="row2">
          <div class="field">
            <label>Nome</label>
            <input class="input" name="first_name" required maxlength="50" autofocus>
          </div>
          <div class="field">
            <label>Sobrenome</label>
            <input class="input" name="last_name" required maxlength="80">
          </div>
        </div>
        <div class="row2">
          <div class="field">
            <label>Senha</label>
            <input class="input" type="password" name="password"
                   required minlength="8" placeholder="Mín. 8 caracteres">
          </div>
          <div class="field">
            <label>Confirmar senha</label>
            <input class="input" type="password" name="password_confirm"
                   required minlength="8">
          </div>
        </div>
        <div class="hint" style="margin:-6px 0 10px;">🔒 Senha forte: mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.</div>
        <div class="field">
          <label>E-mail</label>
          <input class="input" name="email" type="email" required maxlength="160"
                 value="<?= san($_POST['email'] ?? '') ?>" placeholder="voce@exemplo.com">
          <div class="hint">Usado para <strong>recuperar a senha</strong> e receber avisos. Pode ser pessoal ou corporativo.</div>
        </div>
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text-2);margin:4px 0 14px;cursor:pointer;user-select:none;line-height:1.5;">
          <input type="checkbox" name="accept_terms" value="1" required style="width:auto;margin-top:2px;accent-color:var(--primary);">
          <span>Li e aceito os <a href="<?= url('termos.php') ?>" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700;">Termos de Uso</a>.</span>
        </label>
        <button class="btn btn-primary" style="width:100%; padding:11px;" type="submit">
          Criar conta
        </button>
      </form>

      <div class="lfoot">
        Já tem conta? <a href="<?= url('login.php') ?>">Entrar</a>
        <br>Syncro Flow v<?= san(cfg('app.version', '23.4')) ?>
      </div>
    </div>
  </main>
  <script src="<?= url('js/auth-theme.js') ?>"></script>
  <script type="module" src="<?= url('js/a11y/index.js') ?>?v=<?= @filemtime(__DIR__ . '/js/a11y/index.js') ?>"></script>
</body>
</html>
