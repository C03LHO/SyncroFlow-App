<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="author" content="Aurelio Sousa">
  <title>Syncro Flow</title>
  <link rel="icon" type="image/png" href="<?= url('imagens/logo/icone.png') ?>">
  <?php $root = dirname(__DIR__); $v = fn($p) => '?v=' . (@filemtime($root . '/' . $p) ?: cfg('app.version','1')); ?>
  <?php require __DIR__ . '/_styles.php'; ?>
  <link rel="stylesheet" href="<?= url('css/tobi.css') . $v('css/tobi.css') ?>">
  <script>
    // Detector inline de tema — precisa rodar antes do paint
    (function () {
      var saved = localStorage.getItem('syncro_theme');
      var html = document.documentElement;
      var EXEC = { 'exec-light': 'light', 'exec-dark': 'dark' };
      if (saved && EXEC[saved]) {
        html.setAttribute('data-theme', EXEC[saved]);   // mesma paleta do padrão
        html.classList.add('exec-mode');                // modo sério: some o mascote (CSS)
      } else if (saved) {
        html.setAttribute('data-theme', saved);
      } else if (matchMedia('(prefers-color-scheme: dark)').matches) {
        html.setAttribute('data-theme', 'dark');
      }
    })();

    // Aplicador inline de ACESSIBILIDADE — antes do paint, sem "flash".
    // Mantém o MESMO mapeamento de js/a11y/preferences.js (A11Y_FLAGS).
    (function () {
      var FLAGS = {
        contrast: 'a11y-contrast', readableFont: 'a11y-readable-font',
        links: 'a11y-links', focusHighlight: 'a11y-focus', spacing: 'a11y-spacing',
        reading: 'a11y-reading', reduceMotion: 'a11y-reduce-motion'
      };
      var p;
      try { p = JSON.parse(localStorage.getItem('syncro_a11y') || '{}'); } catch (e) { p = {}; }
      var html = document.documentElement;
      for (var k in FLAGS) if (p[k]) html.classList.add(FLAGS[k]);
      if (p.mascot === false) html.classList.add('tobi-off');   // mascote desligado (sem flash)
      var z = Number(p.fontScale);
      if (isFinite(z) && z > 0) html.style.setProperty('--a11y-zoom', String(Math.min(1.8, Math.max(0.9, z))));
    })();
  </script>
</head>
