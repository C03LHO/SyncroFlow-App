<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/helpers.php
   Helpers gerais: config, sanitização, datas, ids, flash.
   ═══════════════════════════════════════════════════════════ */

/**
 * Lê um valor do config.json usando notação por ponto.
 *   cfg('database.path')
 *   cfg('app.poll_interval_seconds', 5)
 *
 * O JSON é carregado uma única vez por request.
 */
function cfg(string $path, $default = null) {
    static $config = null;
    if ($config === null) {
        $root = dirname(__DIR__);
        // Ordem de prioridade:
        //   1. SYNCROFLOW_CONFIG=/caminho/config.json (útil para testes isolados)
        //   2. config.local.json (testar localmente sem tocar no config.json)
        //   3. config.json (produção)
        //   4. config.example.json — padrões que já funcionam localmente, para o
        //      sistema rodar logo após o clone, sem nenhuma configuração.
        $envFile = getenv('SYNCROFLOW_CONFIG');
        $file = ($envFile && is_file($envFile)) ? $envFile : null;
        foreach (['config.local.json', 'config.json', 'config.example.json'] as $name) {
            if ($file === null && is_file("$root/$name")) $file = "$root/$name";
        }
        $file = $file ?? "$root/config.json";
        if (!is_file($file)) {
            throw new RuntimeException("Arquivo de config não encontrado: $file");
        }
        $raw = file_get_contents($file);
        $config = json_decode($raw, true);
        if (!is_array($config)) {
            throw new RuntimeException(basename($file) . ' inválido (JSON malformado)');
        }
        // Resolve caminhos relativos baseado na pasta do projeto
        foreach (['database.path','database.photos_path','backups.path','uploads.path','debug.log_path'] as $key) {
            [$k1, $k2] = explode('.', $key);
            if (isset($config[$k1][$k2]) && is_string($config[$k1][$k2])
                && substr($config[$k1][$k2], 0, 2) === './') {
                $config[$k1][$k2] = $root . '/' . substr($config[$k1][$k2], 2);
            }
        }
    }
    $keys = explode('.', $path);
    $val  = $config;
    foreach ($keys as $k) {
        if (!is_array($val) || !array_key_exists($k, $val)) return $default;
        $val = $val[$k];
    }
    return $val;
}

/* ───────────────────────────────────────────────────────────
   Administrador do sistema (dono): ÚNICO usuário TI - Dev.
   É DINÂMICO — o primeiro usuário TI-Dev criado (ou o valor
   definido em system_config.owner_user_id). Assim o sistema não
   depende de nenhuma matrícula fixa e funciona em qualquer
   instalação nova. O identificador interno nunca é exibido: as
   pessoas se autenticam por e-mail e são identificadas pelo nome.
   ─────────────────────────────────────────────────────────── */
function owner_user_id(): ?string {
    try {
        $v = scalar("SELECT value FROM system_config WHERE key = 'owner_user_id'");
        if ($v !== false && $v !== null && $v !== '') return (string)$v;
        // Compatibilidade: se ainda não foi gravado, o dono é o 1º TI-Dev ativo.
        $v = scalar("SELECT user_id FROM users WHERE role = 'ti' AND is_active = 1 ORDER BY created_at ASC LIMIT 1");
        if ($v !== false && $v !== null && $v !== '') return (string)$v;
    } catch (Throwable $e) { /* banco ainda indisponível — sem dono definido */ }
    return null;
}
function set_owner_user_id(string $userId): void {
    try { q("INSERT OR REPLACE INTO system_config (key, value) VALUES ('owner_user_id', ?)", [trim($userId)]); }
    catch (Throwable $e) { /* best-effort */ }
}
function is_owner(?string $userId): bool {
    if ($userId === null || trim($userId) === '') return false;
    $owner = owner_user_id();
    return $owner !== null && trim($userId) === $owner;
}

/** Escapa string para HTML em UTF-8. */
function san($v): string {
    return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
}

/** Cria uma notificação para um usuário (por nome). Silencioso se vazio/auto. */
function notify(?string $forUser, string $message, string $type = 'info', ?string $cardId = null): void {
    $forUser = trim((string)$forUser);
    if ($forUser === '') return;
    try {
        q("INSERT INTO notifications (id, message, type, target_card_id, for_user, created_at)
           VALUES (?,?,?,?,?,?)", [uid(), $message, $type, $cardId, $forUser, now_iso()]);
    } catch (Throwable $e) { /* não derruba a ação principal por causa da notificação */ }
}

/** Timestamp ISO 8601 UTC com milissegundos — formato igual ao usado no frontend antigo. */
function now_iso(): string {
    return gmdate('Y-m-d\TH:i:s.000\Z');
}

/** Gera UUID v4. */
function uid(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

/** Garante que uma pasta exista (cria recursivamente se necessário). */
function ensure_dir(string $dir): void {
    if ($dir === '' || is_dir($dir)) return;
    if (!@mkdir($dir, 0777, true) && !is_dir($dir)) {
        throw new RuntimeException("Não foi possível criar a pasta: $dir");
    }
}

/** Inicia sessão PHP nativa usando as configurações do config.json (idempotente). */
function start_session_if_needed(): void {
    if (session_status() !== PHP_SESSION_NONE) return;
    $name     = cfg('session.name', 'syncroflow_session');
    $duration = (int)cfg('session.duration_minutes', 480) * 60;
    session_name($name);
    session_set_cookie_params([
        'lifetime' => $duration,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => (bool)cfg('session.secure_cookie', false),
    ]);
    session_start();
}

/** Define uma flash message para o próximo request. */
function flash(string $msg, string $type = 'success'): void {
    start_session_if_needed();
    $_SESSION['flash'] = ['msg' => $msg, 'type' => $type];
}

/** Retorna e limpa a flash message corrente (ou null). */
function get_flash(): ?array {
    start_session_if_needed();
    if (empty($_SESSION['flash'])) return null;
    $f = $_SESSION['flash'];
    unset($_SESSION['flash']);
    return $f;
}

/**
 * Resolve o base path da aplicação dentro do site (ex: "/syncroflow").
 *
 * Detecção: helpers.php fica sempre em <app>/lib/helpers.php. Então
 * dirname(__DIR__) é o diretório do app. Subtraindo do DOCUMENT_ROOT
 * do IIS, obtemos o segmento que vai prefixar URLs.
 *
 * Sem isso, redirect('/login.php') tira o usuário do subdiretório onde
 * o app está montado e joga ele na raiz do servidor.
 */
function app_base(): string {
    static $base = null;
    if ($base !== null) return $base;

    $appDir  = str_replace('\\', '/', dirname(__DIR__));        // C:/servidor/sites/syncroflow
    $docRoot = str_replace('\\', '/', $_SERVER['DOCUMENT_ROOT'] ?? '');

    if ($docRoot && stripos($appDir, rtrim($docRoot, '/')) === 0) {
        $base = rtrim(substr($appDir, strlen(rtrim($docRoot, '/'))), '/');
    } else {
        // Fallback: deduz pelo SCRIPT_NAME (api/foo.php → /sub/api/foo.php → tira o /api/foo.php)
        $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
        $dir    = rtrim(dirname($script), '/');
        if (in_array(basename($dir), ['api', 'scripts'], true)) $dir = dirname($dir);
        $base = ($dir === '/' || $dir === '\\' || $dir === '.') ? '' : $dir;
    }

    return $base;
}

/**
 * Gera uma URL relativa à raiz do site, respeitando o subdiretório onde
 * o app está montado. Sempre prefere passar paths SEM barra inicial:
 *   url('app.php')        → "/syncroflow/app.php"
 *   url('api/cards.php')  → "/syncroflow/api/cards.php"
 *   url('css/main.css')   → "/syncroflow/css/main.css"
 *
 * Paths absolutos externos (https://..., //cdn...) passam intactos.
 */
function url(string $path = ''): string {
    if (preg_match('#^(https?:)?//#', $path)) return $path;
    return app_base() . '/' . ltrim($path, '/');
}

/**
 * Redirect inteligente: respeita o subdir do app.
 *  - `redirect('login.php')`         → /syncroflow/login.php
 *  - `redirect('https://...')`       → URL externa
 *  - `redirect('/raiz/absoluta')`    → /raiz/absoluta (escape hatch)
 */
function redirect(string $path): void {
    if (preg_match('#^(https?:)?//#', $path)) {
        header("Location: $path");
    } elseif (strpos($path, '/') === 0) {
        // Path começa com '/' → tratamos como relativo ao app (não à raiz).
        // Quem quiser raiz literal usa redirect() com URL completa.
        header('Location: ' . url($path));
    } else {
        header('Location: ' . url($path));
    }
    exit;
}

/**
 * Rótulo do nível GLOBAL (de sistema) do usuário.
 * Fora das equipes só existem 3 níveis: Usuário Padrão, TI - Sup e TI - Dev.
 * (gestor/visitante são papéis legados — tratados como Usuário Padrão.)
 */
function role_label_global(?string $role): string {
    switch ($role) {
        case 'ti':       return 'TI - Dev';
        case 'suporte':  return 'TI - Sup';
        default:         return 'Usuário Padrão'; // analista, gestor, visitante, ''
    }
}
