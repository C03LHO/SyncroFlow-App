<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/auth.php
   Ações: me, bootstrap_status, login, logout, register, change_password.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/_bootstrap.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$body   = json_in();

// Permite enviar campos via POST form-urlencoded também (útil para curl/teste)
$param = function (string $k, $default = null) use ($body) {
    if (array_key_exists($k, $body))    return $body[$k];
    if (array_key_exists($k, $_POST))   return $_POST[$k];
    if (array_key_exists($k, $_GET))    return $_GET[$k];
    return $default;
};

switch ($action) {

    /* ─── Identidade do usuário corrente ─── */
    case 'me': {
        $u = current_user();
        if (!$u) json_out(['authenticated' => false]);
        json_out(['authenticated' => true, 'user' => $u]);
    }

    /* ─── O DB tem usuários? (decide entre login e bootstrap) ─── */
    case 'bootstrap_status': {
        json_out(['needs_bootstrap' => is_bootstrap_needed()]);
    }

    /* ─── Login ─── */
    case 'login': {
        // Credencial principal: e-mail. Aceita 'identifier'/'user_id' por compat.
        $id  = (string)$param('email', $param('identifier', ''));
        $pwd = (string)$param('password', '');
        $bucket = client_ip() . ':login';
        if (auth_rate_limited($bucket, 5, 15)) {
            error_response('Muitas tentativas de login. Aguarde alguns minutos e tente novamente.', 429, ['code' => 'rate_limited']);
        }
        $res = login($id, $pwd);
        if (!$res['ok']) {
            auth_record_attempt($bucket);
            // Mensagem única e genérica (não revela se o e-mail existe).
            error_response('E-mail ou senha inválidos.', 401, ['code' => 'invalid_credentials']);
        }
        auth_clear_attempts($bucket);
        json_out(['user' => $res['user']]);
    }

    /* ─── Logout ─── */
    case 'logout': {
        logout();
        json_out(['ok' => true]);
    }

    /* ─── Cadastro ─── *
     * v11.1: aberto ao público (sem login). Quem se cadastra recebe papel
     *        'visitante' por padrão. Para virar gestor/analista, precisa
     *        usar o fluxo de role_requests. Bootstrap (banco vazio) cria TI.
     */
    case 'register': {
        $bucket = client_ip() . ':register';
        if (auth_rate_limited($bucket, 5, 60)) {
            error_response('Muitas contas criadas deste dispositivo. Tente novamente mais tarde.', 429, ['code' => 'rate_limited']);
        }
        auth_record_attempt($bucket);
        $needsBootstrap = is_bootstrap_needed();
        // Cadastro público liberado em v11.1. Mantém o controle: o papel
        // efetivo é decidido no register_user (visitante para não-bootstrap).
        $email = trim((string)$param('email', ''));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            error_response('Informe um e-mail válido (usado para recuperar a senha).', 400);
        }
        try {
            $u = register_user(
                '',     // identificador interno SEMPRE gerado pelo servidor (nunca vem do cliente)
                (string)$param('password', ''),
                (string)$param('name', ''),
                null,   // cadastro público nunca escolhe o papel — sempre o padrão
                $email  // e-mail é a credencial de login
            );
        } catch (Throwable $e) {
            error_response($e->getMessage(), 400);
        }

        // Login automático (bootstrap e cadastro novo) — a credencial é o E-MAIL.
        login($email, (string)$param('password', ''));

        require_once __DIR__ . '/../lib/revision.php';
        bump_revision('user', $u['user_id'], 'create');
        json_out(['user' => $u]);
    }

    /* ─── Esqueci a senha — por E-MAIL (link com token) ───
     * forgot_request → cliente envia {id} (e-mail). Servidor envia
     *                  o link de redefinição se houver conta com e-mail.
     *                  Responde SEMPRE genérico (não revela se a conta existe).
     * (a redefinição em si acontece na página reset.php) */
    case 'forgot_request': {
        $bucket = client_ip() . ':forgot';
        if (auth_rate_limited($bucket, 5, 60)) {
            error_response('Muitas solicitações. Aguarde alguns minutos e tente novamente.', 429, ['code' => 'rate_limited']);
        }
        auth_record_attempt($bucket);
        $id = trim((string)$param('email', $param('id', '')));
        if ($id === '') error_response('Informe seu e-mail.', 400);
        password_reset_request($id);
        json_out(['ok' => true, 'message' => 'Se existir uma conta com e-mail cadastrado, enviamos um link de redefinição.']);
    }

    /* ─── Login automático (lembrar-me) por dispositivo ─── */
    case 'autologin_status': {
        require_login();
        json_out(['enabled' => remember_active()]);
    }
    case 'enable_autologin': {
        $u = require_login();
        remember_issue($u['user_id']);
        json_out(['ok' => true, 'enabled' => true]);
    }
    case 'disable_autologin': {
        require_login();
        remember_clear();
        json_out(['ok' => true, 'enabled' => false]);
    }

    /* ─── Troca de senha do próprio usuário ─── */
    case 'change_password': {
        $u = require_login();
        try {
            change_password($u['user_id'], (string)$param('old_password', ''), (string)$param('new_password', ''));
        } catch (Throwable $e) {
            error_response($e->getMessage(), 400);
        }
        json_out(['ok' => true]);
    }

    default:
        error_response('action_invalida', 400, ['valid' => [
            'me','bootstrap_status','login','logout','register','forgot_request',
            'autologin_status','enable_autologin','disable_autologin','change_password',
        ]]);
}
