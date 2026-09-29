<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — init_db.php
   Interface visual para a função ensure_schema() (que vive em
   lib/schema.php e roda AUTOMATICAMENTE em toda primeira
   conexão via lib/db.php).

   Importante: você nunca precisa rodar este arquivo
   manualmente — o sistema cria o banco sozinho na primeira
   request. Este arquivo serve apenas para:
     · validação visual durante o deploy;
     · forçar a reaplicação das auto-migrations.
   ═══════════════════════════════════════════════════════════ */

require_once dirname(__DIR__) . '/lib/dev_only.php';   // 🔒 bloqueia acesso web em produção

require_once dirname(__DIR__) . '/lib/helpers.php';
require_once dirname(__DIR__) . '/lib/db.php';      // ← já dispara ensure_schema() na 1ª conexão
require_once dirname(__DIR__) . '/lib/schema.php';
require_once dirname(__DIR__) . '/lib/photos.php';  // 2º banco: imagens/anexos (photos.db)

try {
    // ── 1) Banco PRINCIPAL (syncroflow.db) ──
    // db() já garante o schema. Pra capturar mensagens, chamamos
    // ensure_schema explicitamente também — se já rodou, devolve cacheado.
    $pdo = db();
    $result = ensure_schema($pdo);
    $messages = $result['messages'] ?? [];
    if (empty($messages)) {
        $messages[] = 'Banco principal já estava pronto. Nenhuma mudança aplicada.';
    }
    $mainTables = array_column($pdo->query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )->fetchAll(PDO::FETCH_ASSOC), 'name');
    $messages[] = 'Banco principal: ' . count($mainTables) . ' tabela(s).';

    // ── 2) Banco de MÍDIA (photos.db) ── cria photos + files (IF NOT EXISTS)
    $pdb = photos_db();
    $photoTables = array_column($pdb->query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )->fetchAll(PDO::FETCH_ASSOC), 'name');
    $messages[] = 'Banco de mídia (photos.db) pronto — tabelas: ' . (implode(', ', $photoTables) ?: '—') . '.';
} catch (Throwable $e) {
    http_response_code(500);
    echo '<!DOCTYPE html><meta charset="UTF-8"><title>Erro</title>';
    echo '<pre style="font-family:Consolas,monospace;padding:20px;color:#7f1d1d;background:#fee2e2;">';
    echo "Erro ao inicializar banco SQLite:\n\n" . san($e->getMessage());
    echo '</pre>';
    exit;
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>init_db — SyncroFlow</title>
  <style>
    body { font-family:'Segoe UI',Arial,sans-serif; background:#f0f4f3; color:#0f1f1e;
           padding:40px 24px; max-width:720px; margin:0 auto; }
    h1   { color:#0a8f84; font-size:1.4rem; margin-bottom:6px; }
    .sub { color:#7a9594; font-size:.9rem; margin-bottom:24px; }
    .card{ background:#fff; border:1px solid #e2e8e7; border-radius:12px;
           padding:22px 26px; box-shadow:0 1px 4px rgba(0,0,0,.06); }
    .ok  { color:#15803d; font-weight:700; }
    ul   { margin:14px 0 0 22px; line-height:1.9; }
    a    { color:#0a8f84; font-weight:600; text-decoration:none; }
    a:hover { text-decoration:underline; }
    code { background:#e8f2f1; padding:1px 6px; border-radius:4px;
           font-family:Consolas,monospace; font-size:.85rem; color:#076e65; }
    .info { background:#fff3cd; border:1px solid #ffc107; border-radius:8px;
            padding:12px 16px; font-size:.85rem; color:#7a4f00; margin-top:14px; }
  </style>
</head>
<body>
  <h1>✅ SyncroFlow — banco pronto</h1>
  <p class="sub">A função <code>ensure_schema()</code> já rodou. Idempotente: pode ser executada quantas vezes for necessário.</p>

  <div class="card">
    <span class="ok">Banco principal</span>: <code><?= san(cfg('database.path')) ?></code><br>
    <span class="ok">Banco de mídia</span>: <code><?= san(photos_db_path()) ?></code>
    <ul>
      <?php foreach ($messages as $m): ?>
        <li><?= san($m) ?></li>
      <?php endforeach; ?>
    </ul>
    <p style="margin-top:18px;">
      Próximos passos:<br>
      → <a href="<?= url('scripts/diagnostico.php') ?>">Rodar diagnóstico</a><br>
      → <a href="<?= url('login.php') ?>">Ir para login</a>
    </p>

    <div class="info">
      💡 <strong>Você não precisa mais rodar este script manualmente.</strong>
      O <code>ensure_schema()</code> é chamado automaticamente em toda primeira
      conexão (via <code>lib/db.php</code>). Basta acessar
      <code><?= san(url('login.php')) ?></code> direto que tudo se monta.
    </div>
  </div>
</body>
</html>
