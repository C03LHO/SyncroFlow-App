<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — login.php
   Tela de login com fluxo automático de bootstrap (quando
   o banco ainda não tem nenhum usuário, vira tela de
   "Criar primeiro administrador"). Estilo de referência: POST
   → flash → redirect → render.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/lib/page_boot.php';   // erros logados/visíveis (evita 500 em branco)
require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/auth.php';

start_session_if_needed();

// Já logado → vai pro app
if (current_user()) {
    redirect('app.php');
}

$needsBootstrap = is_bootstrap_needed();
$action         = $_POST['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    /* ─── Bootstrap: cadastro do primeiro usuário (administrador) ─── */
    if ($action === 'bootstrap' && $needsBootstrap) {
        $name  = trim($_POST['name']  ?? '');
        $email = trim($_POST['email'] ?? '');
        $pwd   = (string)($_POST['password']         ?? '');
        $pwd2  = (string)($_POST['password_confirm'] ?? '');

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            flash('Informe um e-mail válido — ele será o seu login de administrador.', 'error');
            redirect('login.php');
        }
        if ($pwd !== $pwd2) {
            flash('As senhas não conferem.', 'error');
            redirect('login.php');
        }
        try {
            // ID interno gerado automaticamente; o 1º usuário vira TI-Dev/dono.
            $u = register_user('', $pwd, $name, null, $email);
            login($email, $pwd);
            flash('Bem-vindo, ' . $u['name'] . '! Você é o administrador do sistema.', 'success');
            redirect('app.php');
        } catch (Throwable $e) {
            flash($e->getMessage(), 'error');
            redirect('login.php');
        }
    }

    /* ─── Login normal (por e-mail) ─── */
    if ($action === 'login' && !$needsBootstrap) {
        $id  = trim($_POST['email'] ?? ($_POST['identifier'] ?? ''));
        $pwd = (string)($_POST['password'] ?? '');
        $bucket = client_ip() . ':login';
        if (auth_rate_limited($bucket, 5, 15)) {
            flash('Muitas tentativas de login. Aguarde alguns minutos e tente novamente.', 'error');
            redirect('login.php');
        }
        $res = login($id, $pwd);
        if ($res['ok']) {
            auth_clear_attempts($bucket);
            redirect('app.php');
        }
        auth_record_attempt($bucket);
        // Mensagem única e genérica (não revela se a conta existe) — anti-enumeração.
        flash('E-mail ou senha inválidos.', 'error');
        redirect('login.php');
    }
}

$flash = get_flash();
$pageTitle = $needsBootstrap ? 'Criar administrador' : 'Entrar';
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= san($pageTitle) ?> — Syncro Flow</title>
  <link rel="icon" type="image/png" href="<?= url('imagens/logo/icone.png') ?>">
  <!-- Aplica o tema salvo ANTES de pintar (evita "flash" de tema errado) -->
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
      justify-content: center;            /* vertical: via margin:auto no .lwrap (não corta o topo) */
      padding: 24px;
      background-image:
        radial-gradient(circle at 18% 18%, rgba(0, 121, 109, 0.18), transparent 28%),
        radial-gradient(circle at 82% 12%, rgba(255, 193, 0, 0.14), transparent 24%),
        radial-gradient(circle at 75% 85%, rgba(8, 145, 178, 0.10), transparent 30%);
    }
    /* margin:auto centraliza quando há espaço e NUNCA corta o topo quando falta
       (o conteúdo passa a rolar normalmente). Corrige a logo cortada em telas baixas. */
    .lwrap { width: 100%; max-width: 440px; margin: auto; }
    /* Botão de tema flutuante */
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
      padding: 36px 34px;
      box-shadow: var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.45);
      position: relative; overflow: hidden;
      animation: popIn .3s ease-out;
    }
    .lcard::before {
      content: ""; position: absolute;
      top: 0; left: 0; right: 0; height: 4px;
      background: linear-gradient(90deg, var(--primary) 0%, var(--brand) 50%, var(--primary) 100%);
    }
    .lhead { text-align: center; margin-bottom: 24px; }
    .lhead img {
      width: 96px; height: 96px;
      object-fit: contain;
      margin-bottom: 14px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 12px;
    }
    .lhead h1 {
      font-size: 22px; font-weight: 700;
      color: var(--text);
      letter-spacing: -0.3px;
      margin-bottom: 4px;
    }
    .lhead h1 .teal { color: var(--primary); }
    .lhead p { color: var(--text-muted); font-size: 13px; }

    .flash {
      padding: 11px 14px;
      border-radius: var(--radius);
      font-size: 13px;
      margin-bottom: 16px;
      border: 1px solid;
      animation: slideDown .25s ease-out;
    }
    .flash-success { background: var(--success-soft); border-color: var(--success); color: #14532d; }
    .flash-error   { background: var(--danger-soft);  border-color: var(--danger);  color: #7f1d1d; }

    .lbtn {
      width: 100%; padding: 12px 16px;
      border-radius: var(--radius-md);
      border: 1px solid var(--primary-2);
      background: linear-gradient(180deg, var(--primary) 0%, var(--primary-2) 100%);
      color: #fff;
      font-size: 14px; font-weight: 700;
      letter-spacing: 0.3px;
      cursor: pointer;
      box-shadow: 0 1px 0 rgba(255,255,255,0.18) inset, 0 2px 6px rgba(0, 121, 109, 0.20);
      transition: all var(--transition);
      margin-top: 6px;
    }
    .lbtn:hover {
      background: linear-gradient(180deg, var(--primary-2) 0%, var(--primary-deep) 100%);
      transform: translateY(-1px);
      box-shadow: 0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 14px rgba(0, 121, 109, 0.32);
    }

    .lfoot {
      text-align: center;
      margin-top: 22px;
      padding-top: 18px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.8;
    }
    .lfoot a {
      color: var(--primary);
      font-weight: 700;
      text-decoration: none;
    }
    .lfoot a:hover { text-decoration: underline; }

    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      background: var(--brand-soft);
      color: var(--brand-deep);
      font-size: 10.5px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 14px;
    }

    .hint {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Inputs do login/bootstrap padronizados com o resto do site */
    .field { margin-bottom: 14px; }
    .field label {
      display: block;
      font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.5px;
      color: var(--text-2);
      margin-bottom: 6px;
    }
    .lcard input[type="text"],
    .lcard input[type="password"],
    .lcard input[type="search"],
    .lcard input:not([type]),
    .lcard .input {
      width: 100%;
      padding: 11px 13px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-2);
      color: var(--text);
      font-size: 14px;
      font-family: inherit;
      outline: none;
      transition: border-color var(--transition), box-shadow var(--transition), background var(--transition);
    }
    .lcard input:focus, .lcard .input:focus {
      border-color: var(--primary);
      background: var(--surface);
      box-shadow: 0 0 0 3px var(--primary-soft);
    }
    .lcard input::placeholder { color: var(--text-soft); }
  </style>
</head>
<body>
  <a class="skip-link" href="#main">Pular para o conteúdo</a>
  <button type="button" id="auth-theme-btn" class="auth-theme-btn" title="Trocar tema" aria-label="Trocar tema">🎨</button>
  <main class="lwrap" id="main" tabindex="-1">
    <div class="lcard">
      <div class="lhead">
        <img src="<?= url('imagens/logo/icone.png') ?>" alt="SyncroFlow">
        <h1><span class="teal">Syncro</span>Flow</h1>
        <p>Gestão Estratégica de Kanban</p>
      </div>

      <?php if ($flash): ?>
        <div class="flash flash-<?= san($flash['type']) ?>"><?= san($flash['msg']) ?></div>
      <?php endif; ?>

      <?php if ($needsBootstrap): ?>
        <div style="text-align:center;">
          <span class="badge">PRIMEIRO ACESSO</span>
        </div>
        <p style="text-align:center; font-size:.85rem; color:var(--tm); margin-bottom:18px;">
          Nenhum usuário cadastrado. Crie o primeiro — ele será o <strong>administrador (TI)</strong>.
        </p>
        <form method="post" autocomplete="off">
          <input type="hidden" name="action" value="bootstrap">
          <div class="field">
            <label>Nome</label>
            <input name="name" required maxlength="100" autofocus placeholder="Seu nome completo">
          </div>
          <div class="field">
            <label>E-mail</label>
            <input type="email" name="email" required maxlength="160"
                   autocomplete="email" placeholder="voce@exemplo.com">
            <span class="hint">Será o seu login de administrador.</span>
          </div>
          <div class="field">
            <label>Senha</label>
            <input type="password" name="password" required minlength="8" placeholder="Mínimo 8 caracteres">
          </div>
          <div class="field">
            <label>Confirmar senha</label>
            <input type="password" name="password_confirm" required minlength="8" placeholder="Repita a senha">
          </div>
          <p class="hint" style="margin:-4px 0 10px;">🔒 Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.</p>
          <button class="lbtn" type="submit">Criar administrador</button>
        </form>
      <?php else: ?>
        <!-- Modo: login normal (autocomplete ON → navegador oferece salvar senha) -->
        <form method="post" autocomplete="on" id="form-login">
          <input type="hidden" name="action" value="login">
          <div class="field">
            <label>E-mail</label>
            <input type="email" name="email" id="login-email" required maxlength="160"
                   autocomplete="username" autofocus placeholder="voce@exemplo.com">
          </div>
          <div class="field">
            <label>Senha</label>
            <input type="password" name="password" autocomplete="current-password" required placeholder="Sua senha">
          </div>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2);margin:4px 0 10px;cursor:pointer;user-select:none;">
            <input type="checkbox" id="login-remember" style="width:auto;margin:0;accent-color:var(--primary);">
            Lembrar meu e-mail neste dispositivo
          </label>
          <button class="lbtn" type="submit">Entrar</button>
        </form>

        <!-- Modo: recuperar senha por e-mail (oculto até clicar) -->
        <div id="forgot-panel" hidden>
          <h2 style="font-size:1rem;color:var(--text);margin:6px 0 4px;">Recuperar senha</h2>
          <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:12px;">
            Informe seu <strong>e-mail</strong>. Enviaremos um link de redefinição para o e-mail cadastrado.
          </p>
          <div class="flash flash-error" id="forgot-error" hidden></div>
          <div class="flash flash-success" id="forgot-ok" hidden></div>

          <div id="forgot-form">
            <div class="field">
              <label>E-mail</label>
              <input class="input" id="forgot-id" maxlength="160"
                     placeholder="Seu e-mail">
            </div>
            <button class="lbtn" type="button" id="forgot-send">Enviar link de redefinição</button>
          </div>

          <p style="text-align:center;margin-top:10px;">
            <a href="#" id="forgot-cancel" style="font-size:.78rem;color:var(--text-muted);">
              ← Voltar ao login
            </a>
          </p>
        </div>
      <?php endif; ?>

      <div class="lfoot">
        <?php if (!$needsBootstrap): ?>
          <a href="#" id="forgot-link">Esqueci minha senha</a> ·
          <a href="<?= url('register.php') ?>">Criar conta</a><br>
        <?php endif; ?>
        Syncro Flow v<?= san(cfg('app.version', '23.4')) ?>
      </div>
    </div>
  </main>

  <script src="<?= url('js/auth-theme.js') ?>"></script>
  <script type="module" src="<?= url('js/a11y/index.js') ?>?v=<?= @filemtime(__DIR__ . '/js/a11y/index.js') ?>"></script>
  <script>
    // ═══ Lembrar e-mail neste dispositivo ═══
    (function () {
      const emailInput = document.getElementById('login-email');
      const remember   = document.getElementById('login-remember');
      const form       = document.getElementById('form-login');
      if (!emailInput || !remember || !form) return;
      const saved = localStorage.getItem('syncro_remember_email');
      if (saved) {
        emailInput.value = saved;
        remember.checked = true;
        // foca a senha já que o e-mail veio preenchido
        const pwd = form.querySelector('input[type="password"]');
        if (pwd) setTimeout(() => pwd.focus(), 60);
      }
      form.addEventListener('submit', () => {
        if (remember.checked) localStorage.setItem('syncro_remember_email', emailInput.value.trim());
        else localStorage.removeItem('syncro_remember_email');
      });
    })();

    // ═══ Fluxo "Esqueci a senha" — envia link por e-mail ═══
    (function () {
      const $ = (id) => document.getElementById(id);
      const formLogin   = $('form-login');
      const forgotPanel = $('forgot-panel');
      const link        = $('forgot-link');
      const cancel      = $('forgot-cancel');
      const errBox      = $('forgot-error');
      const okBox       = $('forgot-ok');
      const sendBtn     = $('forgot-send');
      if (!link) return;  // bootstrap (sem o link)

      const apiBase = <?= json_encode(url('api')) ?>;

      function err(msg) { errBox.textContent = msg; errBox.hidden = !msg; }
      function ok(msg)  { okBox.textContent = msg;  okBox.hidden = !msg; }
      async function api(action, body) {
        const r = await fetch(`${apiBase}/auth.php?action=${action}`, {
          method: 'POST', credentials: 'same-origin',
          headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
          body: JSON.stringify(body || {})
        });
        const data = await r.json().catch(()=>({}));
        return { ok: r.ok, status: r.status, data };
      }

      link.onclick = (e) => {
        e.preventDefault();
        formLogin.hidden = true;
        forgotPanel.hidden = false;
        err(''); ok('');
        $('forgot-form').hidden = false;
        $('forgot-id').focus();
      };
      cancel.onclick = (e) => {
        e.preventDefault();
        forgotPanel.hidden = true;
        formLogin.hidden = false;
        err(''); ok('');
      };

      sendBtn.onclick = async () => {
        err(''); ok('');
        const id = $('forgot-id').value.trim();
        if (!id) { err('Informe seu e-mail.'); return; }
        sendBtn.disabled = true;
        const prev = sendBtn.textContent;
        sendBtn.textContent = 'Enviando…';
        const r = await api('forgot_request', { id });
        sendBtn.disabled = false;
        sendBtn.textContent = prev;
        if (!r.ok) { err((r.data && r.data.error) || 'Falha ao enviar. Tente novamente.'); return; }
        // Resposta sempre genérica (não revela se a conta existe)
        $('forgot-form').hidden = true;
        ok((r.data && r.data.message) ||
           'Se existir uma conta com e-mail cadastrado, enviamos um link de redefinição. Verifique sua caixa de entrada.');
      };

      // Enter no campo dispara o envio
      $('forgot-id').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sendBtn.click(); }
      });
    })();
  </script>
</body>
</html>
