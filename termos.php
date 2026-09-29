<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — termos.php
   Termos de Uso (MODELO). Página pública, acessível a partir do
   cadastro. Personalize o texto conforme a sua organização.
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/lib/page_boot.php';
require_once __DIR__ . '/lib/helpers.php';
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Termos de Uso — Syncro Flow</title>
  <link rel="icon" type="image/png" href="<?= url('imagens/logo/icone.png') ?>">
  <script>(function(){try{var t=localStorage.getItem('syncro_theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
  <?php require __DIR__ . '/partials/_styles.php'; ?>
  <style>
    body { padding: 32px 20px; }
    .terms-wrap { max-width: 760px; margin: 0 auto; }
    .terms-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 32px 34px; box-shadow: var(--shadow-lg);
    }
    .terms-card h1 { font-size: 24px; font-weight: 800; color: var(--text); margin-bottom: 6px; }
    .terms-card .sub { color: var(--text-muted); font-size: 13px; margin-bottom: 24px; }
    .terms-card h2 { font-size: 16px; font-weight: 700; color: var(--text); margin: 22px 0 8px; }
    .terms-card p, .terms-card li { color: var(--text-2); font-size: 14px; line-height: 1.7; }
    .terms-card ul { margin: 6px 0 0 20px; }
    .terms-note { margin-top: 24px; padding: 12px 14px; border-radius: var(--radius);
      background: var(--warning-soft); border: 1px solid var(--warning); color: var(--text-2); font-size: 13px; }
    .terms-back { display: inline-block; margin-top: 22px; color: var(--primary); font-weight: 700; text-decoration: none; }
    .terms-back:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main class="terms-wrap">
    <div class="terms-card">
      <h1>Termos de Uso</h1>
      <div class="sub">Syncro Flow · versão <?= san(cfg('app.version', '1.0')) ?></div>

      <p>Ao criar uma conta e utilizar o Syncro Flow ("o sistema"), você concorda com os termos abaixo.
         Este é um <strong>modelo</strong> genérico — adapte-o à realidade e às políticas da sua organização.</p>

      <h2>1. Aceitação</h2>
      <p>O uso do sistema implica a aceitação integral destes termos. Se você não concordar, não utilize o sistema.</p>

      <h2>2. Conta e responsabilidade</h2>
      <ul>
        <li>Você é responsável por manter a confidencialidade da sua senha.</li>
        <li>As atividades realizadas na sua conta são de sua responsabilidade.</li>
        <li>Informe dados verdadeiros no cadastro (nome e e-mail válido).</li>
      </ul>

      <h2>3. Uso adequado</h2>
      <p>Você concorda em não usar o sistema para fins ilícitos, nem tentar comprometer sua segurança,
         disponibilidade ou a privacidade de outros usuários.</p>

      <h2>4. Dados e privacidade</h2>
      <p>O sistema armazena os dados necessários ao seu funcionamento (conta, quadros, cards e métricas).
         Os dados ficam sob responsabilidade de quem opera a instalação. Consulte a política de privacidade
         da sua organização para detalhes sobre tratamento e retenção.</p>

      <h2>5. Isenção de garantias</h2>
      <p>O sistema é fornecido "como está", sem garantias de disponibilidade contínua ou ausência de erros.
         O uso é por sua conta e risco.</p>

      <h2>6. Alterações</h2>
      <p>Estes termos podem ser atualizados a qualquer momento. O uso continuado após alterações representa
         a aceitação da versão vigente.</p>

      <div class="terms-note">
        ⚠️ <strong>Modelo para personalizar.</strong> Este texto é um ponto de partida e não constitui
        aconselhamento jurídico. Ajuste-o antes de usar em produção.
      </div>

      <a class="terms-back" href="<?= url('register.php') ?>">← Voltar ao cadastro</a>
    </div>
  </main>
</body>
</html>
