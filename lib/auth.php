<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/auth.php
   Login real (e-mail + senha bcrypt) com sessão PHP nativa.
   
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/rbac.php';

/**
 * Retorna o usuário logado (assoc array) ou null se não houver sessão válida.
 * Cacheado por request.
 */
function current_user(): ?array {
    static $cache = false; // false = ainda não consultado
    if ($cache !== false) return $cache;

    start_session_if_needed();
    if (empty($_SESSION['user_id'])) {
        // Sem sessão → tenta login automático via token "lembrar-me" (cookie).
        if (!remember_try_login()) { $cache = null; return null; }
    }

    $u = one(
        "SELECT user_id, name, display_name, email, bio, role, color,
                profile_title, active_title, onboarding_done, last_standup_date,
                job_title, department, avatar_url, cover_url,
                notify_email, notify_email_assign, notify_email_due
         FROM users
         WHERE user_id = ? AND is_active = 1",
        [$_SESSION['user_id']]
    );

    if (!$u) {
        // Sessão órfã — usuário foi removido/desativado
        session_destroy();
        $cache = null;
        return null;
    }

    $cache = $u;
    return $u;
}

/* ═══════════════════════════════════════════════════════════
   Login automático seguro ("lembrar-me") — por dispositivo.
   NÃO guardamos a senha. Usamos um token selector:validator:
   o cookie carrega ambos; o banco guarda só o HASH do validator.
   Roubar o banco NÃO revela o token (precisa do validator em claro).
   ═══════════════════════════════════════════════════════════ */
const REMEMBER_COOKIE = 'syncroflow_remember';
const REMEMBER_DAYS    = 30;

/** Emite um token e grava o cookie. Chamar com o usuário já autenticado. */
function remember_issue(string $user_id): void {
    $selector  = bin2hex(random_bytes(9));
    $validator = bin2hex(random_bytes(32));
    $expires   = time() + REMEMBER_DAYS * 86400;
    q("INSERT OR REPLACE INTO auth_tokens (selector, validator_hash, user_id, expires_at, created_at, user_agent)
       VALUES (?,?,?,?,?,?)",
      [$selector, hash('sha256', $validator), $user_id, gmdate('Y-m-d\TH:i:s\Z', $expires), now_iso(),
       substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 250)]);
    setcookie(REMEMBER_COOKIE, $selector . ':' . $validator, [
        'expires'  => $expires,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => (bool)cfg('session.secure_cookie', false),
    ]);
}

/** Revoga o token deste dispositivo e limpa o cookie. */
function remember_clear(): void {
    $raw = $_COOKIE[REMEMBER_COOKIE] ?? '';
    if ($raw && strpos($raw, ':') !== false) {
        [$selector] = explode(':', $raw, 2);
        try { q("DELETE FROM auth_tokens WHERE selector = ?", [$selector]); } catch (Throwable $e) {}
    }
    setcookie(REMEMBER_COOKIE, '', ['expires' => time() - 3600, 'path' => '/']);
    unset($_COOKIE[REMEMBER_COOKIE]);
}

/** Existe token válido neste dispositivo? (para a UI mostrar o estado) */
function remember_active(): bool {
    $raw = $_COOKIE[REMEMBER_COOKIE] ?? '';
    if (!$raw || strpos($raw, ':') === false) return false;
    [$selector] = explode(':', $raw, 2);
    $row = one("SELECT expires_at FROM auth_tokens WHERE selector = ?", [$selector]);
    return $row && strtotime($row['expires_at']) > time();
}

/** Tenta autenticar via cookie "lembrar-me". Retorna true se logou. */
function remember_try_login(): bool {
    $raw = $_COOKIE[REMEMBER_COOKIE] ?? '';
    if (!$raw || strpos($raw, ':') === false) return false;
    [$selector, $validator] = explode(':', $raw, 2);
    if ($selector === '' || $validator === '') return false;

    $row = one("SELECT validator_hash, user_id, expires_at FROM auth_tokens WHERE selector = ?", [$selector]);
    if (!$row) return false;
    if (strtotime($row['expires_at']) <= time()) {           // expirado → limpa
        try { q("DELETE FROM auth_tokens WHERE selector = ?", [$selector]); } catch (Throwable $e) {}
        return false;
    }
    if (!hash_equals($row['validator_hash'], hash('sha256', $validator))) {
        // validator errado → possível roubo do selector: revoga por segurança
        try { q("DELETE FROM auth_tokens WHERE selector = ?", [$selector]); } catch (Throwable $e) {}
        return false;
    }
    // confere se o usuário ainda existe e está ativo
    if (!one("SELECT 1 FROM users WHERE user_id = ? AND is_active = 1", [$row['user_id']])) return false;

    // OK → cria sessão e rotaciona o validator (mitiga replay)
    start_session_if_needed();
    session_regenerate_id(true);
    $_SESSION['user_id']  = $row['user_id'];
    $_SESSION['login_at'] = time();
    $newValidator = bin2hex(random_bytes(32));
    $expires = time() + REMEMBER_DAYS * 86400;
    q("UPDATE auth_tokens SET validator_hash = ?, expires_at = ? WHERE selector = ?",
      [hash('sha256', $newValidator), gmdate('Y-m-d\TH:i:s\Z', $expires), $selector]);
    setcookie(REMEMBER_COOKIE, $selector . ':' . $newValidator, [
        'expires' => $expires, 'path' => '/', 'httponly' => true,
        'samesite' => 'Lax', 'secure' => (bool)cfg('session.secure_cookie', false),
    ]);
    return true;
}

/** Detecta se a request veio de uma rota /api/ ou XHR. */
function is_api_request(): bool {
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    if (strpos($uri, '/api/') !== false) return true;
    $xhr = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    return strtolower($xhr) === 'xmlhttprequest';
}

/**
 * Garante que o usuário está logado.
 * - Em API: responde 401 JSON e encerra.
 * - Em página: redireciona para /login.php.
 */
function require_login(): array {
    $u = current_user();
    if ($u) return $u;

    if (is_api_request()) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'unauthenticated'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    redirect('login.php');
}

/**
 * Garante que o usuário tem permissão para uma ação.
 * Retorna o usuário (assoc) se autorizado; caso contrário 403.
 */
function require_role(string $action): array {
    $u = require_login();
    if (!can($u['role'], $action)) {
        if (is_api_request()) {
            http_response_code(403);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'error' => 'forbidden',
                'required' => $action,
                'role' => $u['role'],
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        http_response_code(403);
        die('Permissão insuficiente: ' . san($action));
    }
    return $u;
}

/** True se ainda não existe nenhum usuário cadastrado (bootstrap). */
function is_bootstrap_needed(): bool {
    return ((int)scalar("SELECT COUNT(*) FROM users")) === 0;
}

/**
 * Validação do identificador interno.
 * v11.1 — aceita até 10 caracteres alfanuméricos (letras + dígitos),
 * para acomodar identificadores que não são puramente numéricos.
 */
function is_valid_user_id(string $v): bool {
    // Apenas dígitos, de 1 a 10 caracteres.
    return (bool)preg_match('/^\d{1,10}$/', trim($v));
}

/**
 * Gera um identificador interno numérico de 8 dígitos que ainda não exista.
 * O usuário NUNCA vê nem digita esse id — ele autentica por e-mail; o id é só
 * a chave interna que liga as tabelas.
 */
function generate_unique_user_id(): string {
    for ($i = 0; $i < 50; $i++) {
        $candidate = (string)random_int(10000000, 99999999);   // 8 dígitos
        if (!scalar("SELECT 1 FROM users WHERE user_id = ?", [$candidate])) {
            return $candidate;
        }
    }
    // Fallback (colisão praticamente impossível): 10 dígitos.
    return (string)random_int(1000000000, 9999999999);
}

/**
 * Valida a FORÇA da senha. Retorna a mensagem de erro (string) ou null se OK.
 * Política: mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.
 * Fonte única — usada no cadastro, na troca e na redefinição de senha.
 */
function password_strength_error(string $pwd): ?string {
    if (strlen($pwd) < 8)                    return 'A senha precisa de pelo menos 8 caracteres.';
    if (!preg_match('/[A-Z]/', $pwd))        return 'A senha precisa de ao menos uma letra MAIÚSCULA.';
    if (!preg_match('/[a-z]/', $pwd))        return 'A senha precisa de ao menos uma letra minúscula.';
    if (!preg_match('/\d/', $pwd))           return 'A senha precisa de ao menos um número.';
    if (!preg_match('/[^A-Za-z0-9]/', $pwd)) return 'A senha precisa de ao menos um símbolo (ex.: !@#$%).';
    return null;
}

/* ═══════════════════════════════════════════════════════════
   Rate limiting simples (SQLite) para login / cadastro / recuperação.
   Conta tentativas por "bucket" (ex.: "<ip>:login") numa janela de
   tempo. Sem dependências externas — usa a tabela auth_attempts.
   ═══════════════════════════════════════════════════════════ */
function client_ip(): string {
    return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}
/** True se o bucket estourou o limite de tentativas na janela (em minutos). */
function auth_rate_limited(string $bucket, int $max, int $windowMin): bool {
    $since = gmdate('Y-m-d\TH:i:s.000\Z', time() - $windowMin * 60);
    try {
        return (int)scalar("SELECT COUNT(*) FROM auth_attempts WHERE bucket = ? AND at >= ?",
                           [$bucket, $since]) >= $max;
    } catch (Throwable $e) { return false; }   // sem tabela → não bloqueia
}
/** Registra uma tentativa (falha) no bucket + limpeza oportunista de antigas. */
function auth_record_attempt(string $bucket): void {
    try {
        q("INSERT INTO auth_attempts (bucket, at) VALUES (?, ?)", [$bucket, now_iso()]);
        q("DELETE FROM auth_attempts WHERE at < ?", [gmdate('Y-m-d\TH:i:s.000\Z', time() - 24 * 3600)]);
    } catch (Throwable $e) { /* best-effort */ }
}
/** Limpa as tentativas de um bucket (chamar após sucesso). */
function auth_clear_attempts(string $bucket): void {
    try { q("DELETE FROM auth_attempts WHERE bucket = ?", [$bucket]); } catch (Throwable $e) {}
}

/**
 * Autentica por E-MAIL + senha (única credencial do sistema). Erro sempre
 * genérico ('invalid_credentials') para não revelar se a conta existe
 * (anti-enumeração). Em sucesso, registra last_login e user_login_history.
 */
function login(string $email, string $password): array {
    $email    = trim($email);
    $password = (string)$password;

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return ['ok' => false, 'error' => 'invalid_credentials'];
    }

    $u = one("SELECT user_id, password_hash, name, role, is_active FROM users WHERE lower(email) = lower(?)", [$email]);

    // Resposta única para "não existe", "inativo" e "senha errada" (anti-enumeração).
    if (!$u || !(int)$u['is_active'] || !password_verify($password, $u['password_hash'])) {
        return ['ok' => false, 'error' => 'invalid_credentials'];
    }

    start_session_if_needed();
    session_regenerate_id(true);
    $_SESSION['user_id']  = $u['user_id'];
    $_SESSION['login_at'] = time();

    q("UPDATE users SET last_login = ?, total_logins = total_logins + 1 WHERE user_id = ?",
      [now_iso(), $u['user_id']]);

    q("INSERT INTO user_login_history (user_id, login_at, user_agent, ip_address)
       VALUES (?, ?, ?, ?)",
      [
          $u['user_id'],
          now_iso(),
          substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 250),
          $_SERVER['REMOTE_ADDR'] ?? '',
      ]);

    return [
        'ok'   => true,
        'user' => [
            'user_id' => $u['user_id'],
            'name'    => $u['name'],
            'role'    => $u['role'],
        ],
    ];
}

/** Destrói a sessão atual. */
function logout(): void {
    start_session_if_needed();
    remember_clear();              // revoga o login automático deste dispositivo
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(
            session_name(), '', time() - 42000,
            $p['path'], $p['domain'], $p['secure'], $p['httponly']
        );
    }
    session_destroy();
}

/**
 * Cria um usuário.
 *  - Se for o primeiro do banco, força papel 'ti' (bootstrap).
 *  - Senão, nível padrão é 'analista' (Usuário Padrão).
 *    O cargo dentro de cada equipe é definido pelo gestor/TI da equipe.
 *  - $securityQuestion + $securityAnswer são obrigatórios em cadastros
 *    novos (usados pelo "Esqueci a senha"); opcionais via admin TI.
 */
function register_user(
    string $user_id, string $password, string $name,
    ?string $role = null,
    string $email = ''
): array {
    $user_id = trim($user_id);
    $name    = trim($name);
    $email   = trim($email);

    // O identificador interno é GERADO automaticamente (o usuário nunca o digita
    // — autentica por e-mail). Só é informado em fluxos internos/legados (admin).
    if ($user_id === '') {
        $user_id = generate_unique_user_id();
    } elseif (!is_valid_user_id($user_id)) {
        throw new InvalidArgumentException('Identificador interno inválido.');
    }
    if ($pwErr = password_strength_error($password))
        throw new InvalidArgumentException($pwErr);
    if ($name === '')
        throw new InvalidArgumentException('Nome obrigatório.');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL))
        throw new InvalidArgumentException('Informe um e-mail válido.');
    // E-mail é a credencial de login → precisa ser único (ignora vazios legados).
    if ($email !== '' && (int)scalar("SELECT COUNT(*) FROM users WHERE lower(email) = lower(?)", [$email]) > 0)
        throw new InvalidArgumentException('Já existe uma conta com esse e-mail.');

    if ((int)scalar("SELECT COUNT(*) FROM users WHERE user_id = ?", [$user_id]) > 0) {
        throw new InvalidArgumentException('Identificador interno já em uso. Tente novamente.');
    }

    // Primeiro usuário do sistema (bootstrap) vira o ADMINISTRADOR (TI-Dev) e é
    // gravado como dono. Depois disso, ninguém mais recebe 'ti' pelo cadastro —
    // a promoção passa por role_requests (aprovada pelo próprio administrador).
    $isBootstrap = is_bootstrap_needed();
    if ($isBootstrap) {
        $finalRole = 'ti';
    } else {
        $finalRole = $role ?? 'analista';
        if ($finalRole === 'ti') $finalRole = 'analista';   // TI-Dev só no bootstrap
    }

    if (!in_array($finalRole, all_roles(), true)) {
        throw new InvalidArgumentException('Papel inválido.');
    }

    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

    q("INSERT INTO users (user_id, password_hash, name, role, email, created_at)
       VALUES (?, ?, ?, ?, ?, ?)",
      [$user_id, $hash, $name, $finalRole, $email, now_iso()]);

    // O primeiro usuário (bootstrap) é gravado como dono do sistema.
    if ($isBootstrap) set_owner_user_id($user_id);

    // Vincula automaticamente às equipes onde a pessoa foi pré-cadastrada
    // (por identificador interno ou e-mail) em "pessoas externas". Best-effort.
    try { _link_extra_people_on_register($user_id, $email); } catch (Throwable $e) { /* não bloqueia o cadastro */ }

    return [
        'user_id' => $user_id,
        'name'    => $name,
        'role'    => $finalRole,
        'email'   => $email,
    ];
}

/**
 * Ao registrar um usuário, procura em todas as equipes a lista de "pessoas
 * externas" (extra_people). Se alguma entrada casar pelo identificador interno OU pelo e-mail,
 * adiciona o usuário como membro (analista) e remove a entrada da lista de
 * pendentes da equipe. Idempotente e best-effort.
 */
function _link_extra_people_on_register(string $userId, string $email): void {
    $emailLc = mb_strtolower(trim($email), 'UTF-8');
    $vidLc   = mb_strtolower(trim($userId), 'UTF-8');
    $teams = all("SELECT id, extra_people FROM teams
                  WHERE extra_people IS NOT NULL AND extra_people != '' AND extra_people != '[]'");
    foreach ($teams as $t) {
        $people = json_decode($t['extra_people'] ?: '[]', true);
        if (!is_array($people)) continue;
        $kept = []; $matched = false;
        foreach ($people as $p) {
            if (is_string($p)) { $kept[] = $p; continue; }   // forma antiga (só nome) → não casa
            if (!is_array($p)) continue;
            $pid = mb_strtolower(trim((string)($p['userId'] ?? '')), 'UTF-8');
            $pem = mb_strtolower(trim((string)($p['email'] ?? '')), 'UTF-8');
            $hit = ($pid !== '' && $pid === $vidLc) || ($pem !== '' && $emailLc !== '' && $pem === $emailLc);
            if ($hit) {
                $matched = true;
                q("INSERT OR IGNORE INTO team_members (team_id, user_id, role, joined_at, added_by)
                   VALUES (?,?,?,?,?)", [$t['id'], $userId, 'analista', now_iso(), 'Auto (pré-cadastro)']);
            } else {
                $kept[] = $p;
            }
        }
        if ($matched) {
            q("UPDATE teams SET extra_people = ? WHERE id = ?",
              [json_encode(array_values($kept), JSON_UNESCAPED_UNICODE), $t['id']]);
        }
    }
}

/**
 * Normaliza a resposta da pergunta de segurança antes do hash:
 * trim, minúsculas, colapsa espaços. Assim "Maria Silva" e "  maria  silva  "
 * batem.
 */
function _normalize_security_answer(string $answer): string {
    $a = mb_strtolower(trim($answer), 'UTF-8');
    return preg_replace('/\s+/u', ' ', $a);
}

/** Verifica resposta da pergunta de segurança. */
function verify_security_answer(string $user_id, string $answer): bool {
    $row = one("SELECT security_answer_hash FROM users WHERE user_id = ? AND is_active = 1",
               [$user_id]);
    if (!$row || !$row['security_answer_hash']) return false;
    return password_verify(_normalize_security_answer($answer), $row['security_answer_hash']);
}

/** Define nova senha — usado no fluxo "Esqueci a senha". */
function reset_password_after_security_check(string $user_id, string $newPassword): void {
    if ($pwErr = password_strength_error($newPassword))
        throw new InvalidArgumentException($pwErr);
    $hash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
    q("UPDATE users SET password_hash = ? WHERE user_id = ?", [$hash, $user_id]);
    _mail_password_changed($user_id);   // confirmação por e-mail (best-effort)
}

/** Envia confirmação de alteração de senha, se o e-mail estiver habilitado e o
 *  usuário tiver endereço cadastrado. Nunca interrompe o fluxo em caso de falha. */
function _mail_password_changed(string $user_id): void {
    try {
        require_once __DIR__ . '/mailer.php';
        if (!mail_enabled()) return;
        $row = one("SELECT name, email FROM users WHERE user_id = ?", [$user_id]);
        $to = trim((string)($row['email'] ?? ''));
        if ($to === '') return;
        $body = '<p>Olá, ' . htmlspecialchars($row['name'] ?? '', ENT_QUOTES, 'UTF-8') . '.</p>'
              . '<p>A senha da sua conta no SyncroFlow foi <strong>alterada</strong> em ' . htmlspecialchars(now_iso(), ENT_QUOTES, 'UTF-8') . '.</p>'
              . '<p>Se <strong>não</strong> foi você, procure o administrador (TI - Dev) imediatamente.</p>';
        mail_send($to, 'Sua senha do SyncroFlow foi alterada', mail_template('Senha alterada', $body));
    } catch (Throwable $e) { /* best-effort */ }
}

/* ═══════════════════════════════════════════════════════════
   Recuperação de senha por E-MAIL (link com token).
   Token = selector:validator. Guardamos só o HASH do validator.
   ═══════════════════════════════════════════════════════════ */
const PWRESET_TTL_MIN = 60;   // validade do link (minutos)

/** URL absoluta da página de redefinição (com o token). */
function _pwreset_link(string $selector, string $validator): string {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . '://' . $host . url('reset.php') . '?t=' . $selector . ':' . $validator;
}

/**
 * Solicita redefinição: acha o usuário pelo e-mail; se tiver e-mail,
 * gera token e envia o link. Retorna sempre genérico (não revela se existe).
 */
function password_reset_request(string $idOrEmail): void {
    $idOrEmail = trim($idOrEmail);
    if ($idOrEmail === '') return;
    $row = one("SELECT user_id, name, email FROM users
                WHERE is_active = 1 AND (user_id = ? OR lower(email) = lower(?)) LIMIT 1",
               [$idOrEmail, $idOrEmail]);
    $to = trim((string)($row['email'] ?? ''));
    if (!$row || $to === '') return;   // sem usuário ou sem e-mail → silencioso

    $selector  = bin2hex(random_bytes(9));
    $validator = bin2hex(random_bytes(32));
    $expires   = gmdate('Y-m-d\TH:i:s\Z', time() + PWRESET_TTL_MIN * 60);
    // 1 token ativo por usuário (limpa os antigos)
    try { q("DELETE FROM password_resets WHERE user_id = ?", [$row['user_id']]); } catch (Throwable $e) {}
    q("INSERT INTO password_resets (selector, validator_hash, user_id, expires_at, created_at)
       VALUES (?,?,?,?,?)", [$selector, hash('sha256', $validator), $row['user_id'], $expires, now_iso()]);

    try {
        require_once __DIR__ . '/mailer.php';
        if (!mail_enabled()) return;
        $link = _pwreset_link($selector, $validator);
        $body = '<p>Olá, ' . htmlspecialchars($row['name'] ?? '', ENT_QUOTES, 'UTF-8') . '.</p>'
              . '<p>Recebemos um pedido para redefinir a senha da sua conta no SyncroFlow. '
              . 'Clique no botão abaixo para criar uma nova senha (o link vale por ' . PWRESET_TTL_MIN . ' minutos):</p>'
              . mail_button('Redefinir minha senha', $link)
              . '<p style="color:#6b7d7c;font-size:13px;">Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.</p>';
        mail_send($to, 'Redefinição de senha — SyncroFlow', mail_template('Redefinir sua senha', $body, 'Link para redefinir sua senha no SyncroFlow'));
    } catch (Throwable $e) { /* best-effort */ }
}

/** Valida o token (selector:validator). Retorna user_id ou null. */
function password_reset_validate(string $token): ?string {
    $token = trim($token);
    if ($token === '' || strpos($token, ':') === false) return null;
    [$selector, $validator] = explode(':', $token, 2);
    if ($selector === '' || $validator === '') return null;
    $row = one("SELECT validator_hash, user_id, expires_at FROM password_resets WHERE selector = ?", [$selector]);
    if (!$row) return null;
    if (strtotime($row['expires_at']) <= time()) {
        try { q("DELETE FROM password_resets WHERE selector = ?", [$selector]); } catch (Throwable $e) {}
        return null;
    }
    if (!hash_equals($row['validator_hash'], hash('sha256', $validator))) return null;
    return $row['user_id'];
}

/** Completa a redefinição: valida token, troca a senha e invalida o token. */
function password_reset_complete(string $token, string $newPassword): array {
    if ($pwErr = password_strength_error($newPassword))
        return [false, $pwErr];
    $vid = password_reset_validate($token);
    if (!$vid) return [false, 'Link inválido ou expirado. Solicite um novo.'];
    $hash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
    q("UPDATE users SET password_hash = ? WHERE user_id = ?", [$hash, $vid]);
    [$selector] = explode(':', $token, 2);
    try { q("DELETE FROM password_resets WHERE selector = ?", [$selector]); } catch (Throwable $e) {}
    _mail_password_changed($vid);
    return [true, ''];
}

/** Pergunta de segurança cadastrada para um user_id (sem revelar a resposta). */
function get_security_question(string $user_id): ?string {
    $row = one("SELECT security_question FROM users
                WHERE user_id = ? AND is_active = 1 AND security_question != ''",
               [$user_id]);
    return $row ? $row['security_question'] : null;
}

/** Troca a senha do usuário logado. Lança exceção em erro. */
function change_password(string $user_id, string $old_password, string $new_password): void {
    if ($pwErr = password_strength_error($new_password)) {
        throw new InvalidArgumentException($pwErr);
    }
    $row = one("SELECT password_hash FROM users WHERE user_id = ?", [$user_id]);
    if (!$row) throw new RuntimeException('Usuário não encontrado.');
    if (!password_verify($old_password, $row['password_hash'])) {
        throw new InvalidArgumentException('Senha atual incorreta.');
    }
    $hash = password_hash($new_password, PASSWORD_BCRYPT, ['cost' => 12]);
    q("UPDATE users SET password_hash = ? WHERE user_id = ?", [$hash, $user_id]);
}

/**
 * Exclui um usuário e TODO o conteúdo exclusivamente dele, em uma transação.
 * Evita lixo no banco ("registros órfãos").
 *
 * Remove:
 *  - Quadro PESSOAL (personal-<vid>): filhos dos cards, cards, colunas, equipe, membros.
 *  - Linhas por user_id: membros/convites de equipe, tokens, troféus, títulos,
 *    desempenho, histórico de login, resets de senha, histórico/solicitações de
 *    papel, pedidos de acesso, log de e-mail.
 *  - Linhas por NOME: notificações destinadas a ele; esvazia o responsável
 *    (assignee) dos cards de equipes (assignee guarda o NOME, não o user_id).
 *  - Fotos (avatar/cover) e anexos no 2º banco (BLOBs).
 *
 * Retorna um resumo (para auditoria/flash).
 */
function delete_user_completely(string $vid): array {
    $vid = trim($vid);
    if ($vid === '') throw new InvalidArgumentException('ID do usuário ausente.');
    if (is_owner($vid)) throw new RuntimeException('O administrador do sistema não pode ser excluído.');

    $name = (string)(scalar("SELECT name FROM users WHERE user_id = ?", [$vid]) ?: '');
    $personalTeam   = 'personal-' . $vid;
    $personalCards  = array_column(all("SELECT id FROM cards WHERE team_id = ?", [$personalTeam]), 'id');

    tx(function () use ($vid, $name, $personalTeam, $personalCards) {
        // 1) Quadro pessoal — filhos dos cards, cards, colunas, equipe
        if ($personalCards) {
            $ph = implode(',', array_fill(0, count($personalCards), '?'));
            foreach (['subtasks','comments','card_history','card_tags','card_requested_by',
                      'card_helpers','links','attachments','card_custom_values'] as $tbl) {
                try { q("DELETE FROM $tbl WHERE card_id IN ($ph)", $personalCards); } catch (Throwable $e) {}
            }
            try { q("DELETE FROM comment_reactions WHERE comment_id IN (SELECT id FROM comments WHERE card_id IN ($ph))", $personalCards); } catch (Throwable $e) {}
            try { q("DELETE FROM card_blocks WHERE blocker_card_id IN ($ph) OR blocked_card_id IN ($ph)", array_merge($personalCards, $personalCards)); } catch (Throwable $e) {}
        }
        try { q("DELETE FROM cards   WHERE team_id = ?", [$personalTeam]); } catch (Throwable $e) {}
        try { q("DELETE FROM columns WHERE team_id = ?", [$personalTeam]); } catch (Throwable $e) {}
        try { q("DELETE FROM teams   WHERE id = ?",      [$personalTeam]); } catch (Throwable $e) {}

        // 2) Linhas por user_id (idempotente / best-effort)
        foreach (['team_members','team_invites','auth_tokens','trophies','titles',
                  'monthly_performance','user_login_history','password_resets',
                  'role_history','role_requests','access_requests','email_log'] as $tbl) {
            try { q("DELETE FROM $tbl WHERE user_id = ?", [$vid]); } catch (Throwable $e) {}
        }

        // 3) Por NOME: notificações dele + esvazia responsável dos cards de equipes
        if ($name !== '') {
            try { q("DELETE FROM notifications WHERE for_user = ?", [$name]); } catch (Throwable $e) {}
            try { q("UPDATE cards SET assignee = '' WHERE assignee = ?", [$name]); } catch (Throwable $e) {}
        }

        // 4) O usuário em si
        q("DELETE FROM users WHERE user_id = ?", [$vid]);
    });

    // 5) BLOBs no 2º banco (fotos do perfil + anexos dos cards pessoais)
    try {
        require_once __DIR__ . '/photos.php';
        try { photo_delete('user', $vid, 'avatar'); } catch (Throwable $e) {}
        try { photo_delete('user', $vid, 'cover'); }  catch (Throwable $e) {}
        foreach ($personalCards as $cid) { try { attach_delete_by_card($cid); } catch (Throwable $e) {} }
    } catch (Throwable $e) { /* best-effort */ }

    return ['user_id' => $vid, 'name' => $name, 'personal_cards' => count($personalCards)];
}

/**
 * Limpa "quadros pessoais" ÓRFÃOS — equipes personal-<vid> (com seus cards,
 * colunas e filhos) cujo usuário dono NÃO existe mais. É o lixo deixado por
 * exclusões de usuário do código antigo (que não removia o quadro pessoal),
 * o que inflava a contagem de colunas/cards no banco.
 * Seguro: NÃO toca em equipes reais nem no quadro padrão. Idempotente.
 */
function cleanup_orphan_personal_boards(): array {
    $removed = ['teams' => 0, 'columns' => 0, 'cards' => 0];
    $orphans = all(
        "SELECT id FROM teams
         WHERE type = 'personal'
           AND COALESCE(NULLIF(owner_user_id, ''), substr(id, length('personal-') + 1))
               NOT IN (SELECT user_id FROM users)"
    );
    foreach ($orphans as $o) {
        $tid = $o['id'];
        $cardIds = array_column(all("SELECT id FROM cards WHERE team_id = ?", [$tid]), 'id');
        $removed['cards']   += count($cardIds);
        $removed['columns'] += (int)scalar("SELECT COUNT(*) FROM columns WHERE team_id = ?", [$tid]);
        tx(function () use ($tid, $cardIds) {
            if ($cardIds) {
                $ph = implode(',', array_fill(0, count($cardIds), '?'));
                foreach (['subtasks','comments','card_history','card_tags','card_requested_by',
                          'card_helpers','links','attachments','card_custom_values'] as $t) {
                    try { q("DELETE FROM $t WHERE card_id IN ($ph)", $cardIds); } catch (Throwable $e) {}
                }
                try { q("DELETE FROM comment_reactions WHERE comment_id IN (SELECT id FROM comments WHERE card_id IN ($ph))", $cardIds); } catch (Throwable $e) {}
                try { q("DELETE FROM card_blocks WHERE blocker_card_id IN ($ph) OR blocked_card_id IN ($ph)", array_merge($cardIds, $cardIds)); } catch (Throwable $e) {}
            }
            q("DELETE FROM cards        WHERE team_id = ?", [$tid]);
            q("DELETE FROM columns      WHERE team_id = ?", [$tid]);
            q("DELETE FROM team_members WHERE team_id = ?", [$tid]);
            q("DELETE FROM teams        WHERE id = ?",      [$tid]);
        });
    }
    $removed['teams'] = count($orphans);
    return $removed;
}
