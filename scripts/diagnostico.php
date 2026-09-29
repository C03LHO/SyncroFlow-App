<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — diagnostico.php
   Roda UMA vez
   para validar o ambiente. APAGUE após o uso.
   ═══════════════════════════════════════════════════════════ */

require_once dirname(__DIR__) . '/lib/dev_only.php';   // 🔒 bloqueia acesso web em produção

// Tenta carregar helpers (cfg) — se config.json estiver quebrado, segue mesmo assim.
$configError = null;
try {
    require_once dirname(__DIR__) . '/lib/helpers.php';
    cfg('app.version'); // força carga
} catch (Throwable $e) {
    $configError = $e->getMessage();
}

function _san($s) { return htmlspecialchars(trim((string)$s), ENT_QUOTES, 'UTF-8'); }

/* ---------- Coleta de dados ---------- */
$phpVersion    = phpversion();
$phpVersionOk  = version_compare($phpVersion, '7.4.0', '>=');
$sapi          = php_sapi_name();
$phpIni        = php_ini_loaded_file();
$dir           = dirname(__DIR__);

$extPdo        = extension_loaded('pdo');
$extPdoSqlite  = extension_loaded('pdo_sqlite');
$extSqlite3    = extension_loaded('sqlite3');
$extJson       = extension_loaded('json');
$extMbstring   = extension_loaded('mbstring');
$extOpenSSL    = extension_loaded('openssl');
$extFileinfo   = extension_loaded('fileinfo');
$pdoDrivers    = (class_exists('PDO')) ? PDO::getAvailableDrivers() : [];
$hasSqlite     = in_array('sqlite', $pdoDrivers);

$dirWritable   = is_writable($dir);
$testWrite     = false;
if ($dirWritable) {
    $tmp = $dir . '/syncro_writetest_' . time() . '.tmp';
    $testWrite = (@file_put_contents($tmp, 'ok') !== false);
    if ($testWrite) @unlink($tmp);
}

$configExists  = is_file(dirname(__DIR__) . '/config.json');
$configParseOk = false;
$dbPath        = $backupsPath = $uploadsPath = null;
if ($configExists && !$configError) {
    $configParseOk = true;
    $dbPath      = cfg('database.path');
    $backupsPath = cfg('backups.path');
    $uploadsPath = cfg('uploads.path');
}

$dbDir         = $dbPath ? dirname($dbPath) : null;
$dbDirExists   = $dbDir && is_dir($dbDir);
$dbDirWritable = $dbDir && is_dir($dbDir) && is_writable($dbDir);
$dbExists      = $dbPath && file_exists($dbPath);
$dbWritable    = $dbExists && is_writable($dbPath);

$backupsDirOk  = $backupsPath && is_dir($backupsPath);
$uploadsDirOk  = $uploadsPath && is_dir($uploadsPath);

$sessionSavePath = session_save_path() ?: sys_get_temp_dir();
$sessionWritable = is_writable($sessionSavePath);

// Tenta abrir o banco e contar tabelas/usuários (não falha silenciosamente)
$dbTablesCount = null;
$dbUserCount   = null;
$dbOpenError   = null;
if ($extPdoSqlite && $dbExists) {
    try {
        $pdo = new PDO("sqlite:$dbPath");
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $dbTablesCount = (int)$pdo->query("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")->fetchColumn();
        $hasUsers = (int)$pdo->query("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users'")->fetchColumn();
        if ($hasUsers) {
            $dbUserCount = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        }
    } catch (Throwable $e) {
        $dbOpenError = $e->getMessage();
    }
}

/* ---------- Cenário final ---------- */
$blocks = [];
if (!$phpVersionOk)       $blocks[] = 'php_version';
if (!$extPdoSqlite)       $blocks[] = 'pdo_sqlite';
if (!$extJson)            $blocks[] = 'json';
if (!$extMbstring)        $blocks[] = 'mbstring';
if (!$extOpenSSL)         $blocks[] = 'openssl';
if (!$configExists)       $blocks[] = 'config_missing';
elseif (!$configParseOk)  $blocks[] = 'config_invalid';
if ($dbDir && !$dbDirWritable && $configParseOk) $blocks[] = 'db_dir';

$cenario = empty($blocks) ? 'tudo_ok' : 'pendencias';
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Diagnóstico — SyncroFlow</title>
  <style>
    :root{--teal:#0a8f84;--teal-d:#076e65;--bg:#f0f4f3;--card:#fff;--border:#e2e8e7;
      --text:#0f1f1e;--ts:#374746;--tm:#7a9594;}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:var(--bg);padding:30px 20px;color:var(--ts)}
    h1{font-size:1.3rem;color:var(--teal);margin-bottom:5px}
    .sub{color:var(--tm);font-size:.88rem;margin-bottom:26px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:12px;
      padding:18px 22px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);max-width:900px}
    .card h2{font-size:.95rem;font-weight:700;color:var(--text);margin-bottom:12px;
      padding-bottom:9px;border-bottom:1px solid var(--border)}
    .row{display:flex;align-items:flex-start;gap:14px;
      padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:.88rem}
    .row:last-child{border-bottom:none}
    .lbl{font-weight:600;color:var(--ts);min-width:220px;flex-shrink:0}
    .val{color:var(--ts);word-break:break-all}
    .ok{color:#15803d;font-weight:700}
    .warn{color:#b45309;font-weight:700}
    .fail{color:#dc2626;font-weight:700}
    .box{background:#f8fbfb;border:1px solid var(--border);border-radius:8px;
      padding:14px 18px;font-size:.87rem;line-height:1.75}
    .box code{background:#e8f2f1;padding:1px 6px;border-radius:4px;
      font-family:Consolas,monospace;font-size:.84rem;color:var(--teal-d)}
    .tag{display:inline-block;padding:2px 9px;border-radius:999px;
      font-size:.74rem;font-weight:700;margin:2px}
    .tag-ok{background:#dcfce7;color:#15803d}
    .tag-warn{background:#fef3c7;color:#92400e}
    .tag-fail{background:#fee2e2;color:#dc2626}
    .result-ok{background:#dcfce7;border-color:#bbf7d0;color:#14532d}
    .result-warn{background:#fef3c7;border-color:#fde68a;color:#78350f}
    .result-fail{background:#fee2e2;border-color:#fecaca;color:#7f1d1d}
    .warn-box{background:#fff3cd;border:1px solid #ffc107;border-radius:8px;
      padding:12px 16px;font-size:.83rem;color:#7a4f00;margin-top:16px;max-width:900px}
    @media(max-width:600px){.lbl{min-width:140px}.row{flex-direction:column;gap:4px}}
  </style>
</head>
<body>

<h1>🔍 Diagnóstico do Servidor — SyncroFlow</h1>
<p class="sub">Rode este arquivo uma vez para validar o ambiente. Apague depois.</p>

<!-- 1. PHP -->
<div class="card">
  <h2>1. Informações do PHP</h2>
  <div class="row">
    <span class="lbl">Versão PHP</span>
    <span class="val <?= $phpVersionOk ? 'ok' : 'fail' ?>">
      <?= _san($phpVersion) ?> <?= $phpVersionOk ? '✓ OK' : '✗ Requer 7.4+' ?>
    </span>
  </div>
  <div class="row"><span class="lbl">Interface (SAPI)</span><span class="val"><?= _san($sapi) ?></span></div>
  <div class="row"><span class="lbl">php.ini ativo</span><span class="val"><?= _san($phpIni ?: 'Não localizado') ?></span></div>
  <div class="row"><span class="lbl">Pasta do site</span><span class="val"><?= _san($dir) ?></span></div>
</div>

<!-- 2. Extensões -->
<div class="card">
  <h2>2. Extensões obrigatórias</h2>
  <?php
    $exts = [
      'pdo'        => [$extPdo,       'base do PDO'],
      'pdo_sqlite' => [$extPdoSqlite, 'driver SQLite — sem isso o app não roda'],
      'sqlite3'    => [$extSqlite3,   'opcional, mas recomendada'],
      'json'       => [$extJson,      'serialização — obrigatória'],
      'mbstring'   => [$extMbstring,  'strings UTF-8 — obrigatória'],
      'openssl'    => [$extOpenSSL,   'sessão segura — obrigatória'],
      'fileinfo'   => [$extFileinfo,  'upload de anexos — recomendada'],
    ];
    foreach ($exts as $name => [$loaded, $note]):
  ?>
    <div class="row">
      <span class="lbl"><?= _san($name) ?></span>
      <span class="val <?= $loaded ? 'ok' : 'fail' ?>">
        <?= $loaded ? '✓ Carregada' : '✗ NÃO carregada' ?>
        <span style="color:var(--tm);font-weight:400;"> — <?= _san($note) ?></span>
      </span>
    </div>
  <?php endforeach; ?>
  <div class="row">
    <span class="lbl">Drivers PDO</span>
    <span class="val">
      <?php if (empty($pdoDrivers)): ?><span class="fail">Nenhum</span><?php else: ?>
        <?php foreach ($pdoDrivers as $d): ?>
          <span class="tag <?= $d==='sqlite' ? 'tag-ok' : 'tag-warn' ?>">
            <?= $d==='sqlite' ? '✓ ' : '' ?><?= _san($d) ?>
          </span>
        <?php endforeach; ?>
      <?php endif; ?>
    </span>
  </div>
</div>

<!-- 3. config.json -->
<div class="card">
  <h2>3. config.json</h2>
  <div class="row">
    <span class="lbl">Arquivo existe</span>
    <span class="val <?= $configExists ? 'ok' : 'fail' ?>">
      <?= $configExists ? '✓ Sim' : '✗ Não' ?>
    </span>
  </div>
  <div class="row">
    <span class="lbl">JSON parseável</span>
    <span class="val <?= $configParseOk ? 'ok' : 'fail' ?>">
      <?= $configParseOk ? '✓ OK' : '✗ Inválido' ?>
      <?php if ($configError): ?> — <?= _san($configError) ?><?php endif; ?>
    </span>
  </div>
  <?php if ($configParseOk): ?>
    <div class="row"><span class="lbl">database.path</span><span class="val"><?= _san($dbPath) ?></span></div>
    <div class="row"><span class="lbl">backups.path</span><span class="val"><?= _san($backupsPath) ?></span></div>
    <div class="row"><span class="lbl">uploads.path</span><span class="val"><?= _san($uploadsPath) ?></span></div>
  <?php endif; ?>
</div>

<!-- 4. Permissões -->
<div class="card">
  <h2>4. Permissões de escrita</h2>
  <div class="row">
    <span class="lbl">Pasta do site gravável</span>
    <span class="val <?= $dirWritable ? 'ok' : 'fail' ?>">
      <?= $dirWritable ? '✓ Sim' : '✗ NÃO' ?>
    </span>
  </div>
  <div class="row">
    <span class="lbl">Teste real de escrita</span>
    <span class="val <?= $testWrite ? 'ok' : 'fail' ?>">
      <?= $testWrite ? '✓ Arquivo criado e apagado' : '✗ Falhou' ?>
    </span>
  </div>
  <?php if ($dbDir): ?>
    <div class="row">
      <span class="lbl">Pasta do banco existe</span>
      <span class="val <?= $dbDirExists ? 'ok' : 'warn' ?>">
        <?= $dbDirExists ? '✓ Sim — ' . _san($dbDir) : '⚠ Não — será criada por scripts/init_db.php' ?>
      </span>
    </div>
    <div class="row">
      <span class="lbl">Pasta do banco gravável</span>
      <span class="val <?= $dbDirWritable ? 'ok' : 'fail' ?>">
        <?= $dbDirWritable ? '✓ Sim' : '✗ NÃO — IIS_IUSRS precisa de gravação' ?>
      </span>
    </div>
  <?php endif; ?>
  <div class="row">
    <span class="lbl">session.save_path</span>
    <span class="val <?= $sessionWritable ? 'ok' : 'warn' ?>">
      <?= _san($sessionSavePath) ?> <?= $sessionWritable ? '✓' : '⚠ não gravável' ?>
    </span>
  </div>
</div>

<!-- 5. Banco -->
<div class="card">
  <h2>5. Banco SyncroFlow</h2>
  <div class="row">
    <span class="lbl">syncroflow.db existe</span>
    <span class="val <?= $dbExists ? 'ok' : 'warn' ?>">
      <?= $dbExists ? '✓ Sim — ' . _san($dbPath) : '⚠ Não (rode php scripts/init_db.php para criar)' ?>
    </span>
  </div>
  <?php if ($dbExists): ?>
    <div class="row">
      <span class="lbl">Gravável</span>
      <span class="val <?= $dbWritable ? 'ok' : 'fail' ?>">
        <?= $dbWritable ? '✓ Sim' : '✗ NÃO' ?>
      </span>
    </div>
    <?php if ($dbOpenError): ?>
      <div class="row"><span class="lbl">Abrir via PDO</span><span class="val fail">✗ <?= _san($dbOpenError) ?></span></div>
    <?php elseif ($dbTablesCount !== null): ?>
      <div class="row"><span class="lbl">Tabelas</span><span class="val ok">✓ <?= $dbTablesCount ?> tabela(s)</span></div>
      <div class="row">
        <span class="lbl">Usuários cadastrados</span>
        <span class="val <?= ($dbUserCount ?? 0) > 0 ? 'ok' : 'warn' ?>">
          <?php if ($dbUserCount === null): ?>Tabela `users` ainda não existe<?php else: ?>
            <?= $dbUserCount ?> usuário(s) <?= $dbUserCount === 0 ? '— primeiro login criará o TI' : '' ?>
          <?php endif; ?>
        </span>
      </div>
    <?php endif; ?>
  <?php endif; ?>
</div>

<!-- 6. Recomendação -->
<div class="card">
  <h2>6. 🌟 Recomendação</h2>
  <div class="box <?= $cenario === 'tudo_ok' ? 'result-ok' : 'result-warn' ?>">
    <?php if ($cenario === 'tudo_ok'): ?>
      <strong>✓ Ambiente OK.</strong><br><br>
      Rode <code>php scripts/init_db.php</code> para criar o banco (se ainda não rodou) e em seguida <code>login.php</code>
      para cadastrar o primeiro usuário (vira TI automaticamente).<br><br>
      Quando o sistema estiver em uso, <strong>apague este diagnóstico</strong> por segurança.
    <?php else: ?>
      <strong>⚠ Pendências detectadas:</strong>
      <ul style="margin:10px 0 0 22px;line-height:1.9;">
        <?php foreach ($blocks as $b): ?>
          <li>
            <?php
              switch ($b) {
                case 'php_version':    echo 'PHP 7.4+ obrigatório. Atualize a versão no IIS.'; break;
                case 'pdo_sqlite':     echo 'Habilite <code>extension=pdo_sqlite</code> no php.ini e rode <code>iisreset</code>.'; break;
                case 'json':           echo 'Habilite <code>extension=json</code> no php.ini.'; break;
                case 'mbstring':       echo 'Habilite <code>extension=mbstring</code> no php.ini.'; break;
                case 'openssl':        echo 'Habilite <code>extension=openssl</code> no php.ini.'; break;
                case 'config_missing': echo 'Crie o arquivo <code>config.json</code> na raiz (use o modelo do repositório).'; break;
                case 'config_invalid': echo 'JSON do <code>config.json</code> está malformado — corrija a sintaxe.'; break;
                case 'db_dir':         echo 'Dê permissão de escrita em <code>' . _san($dbDir) . '</code> para o usuário do IIS (IIS_IUSRS).'; break;
              }
            ?>
          </li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>
  </div>
</div>

<div class="warn-box">
  ⚠ <strong>Apague <code>diagnostico.php</code> após validar o ambiente.</strong>
  Ele exibe informações internas do servidor.
</div>

</body>
</html>
