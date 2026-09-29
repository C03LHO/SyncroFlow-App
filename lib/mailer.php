<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/mailer.php
   Envio de e-mail com DOIS motores (config.json → email.provider):

   • "graph"  → Microsoft 365 / OAuth2 (RECOMENDADO para Microsoft 365).
                Usa a API do Microsoft Graph (app-only, client credentials):
                pega um token e faz POST /sendMail por HTTPS. Sem SMTP, sem
                senha de usuário — só registro de app no Azure (Entra ID).
                Precisa em config.json → email:
                  provider:"graph", tenant_id, client_id, client_secret, from
                E no Azure: app com permissão de APLICAÇÃO "Mail.Send"
                (com consentimento do admin). Opcional: Application Access
                Policy restringindo a caixa 'from'.

   • "smtp"   → SMTP básico (host/porta/usuário/senha) — para relays que
                ainda aceitam AUTH LOGIN. (M365 NÃO aceita mais senha simples.)

   Uso (igual para os dois):
     [$ok, $err] = mail_send($to, $subject, $htmlBody);
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/helpers.php';

/** Motor configurado (graph | smtp). Default: graph (M365/OAuth2). */
function mail_provider(): string {
    $p = strtolower(trim((string)cfg('email.provider', 'graph')));
    return $p === 'smtp' ? 'smtp' : 'graph';
}

/** E-mail está configurado e ligado? (depende do motor) */
function mail_enabled(): bool {
    if (!(bool)cfg('email.enabled', false)) return false;
    if (trim((string)cfg('email.from', '')) === '') return false;
    if (mail_provider() === 'graph') {
        return trim((string)cfg('email.tenant_id', '')) !== ''
            && trim((string)cfg('email.client_id', '')) !== ''
            && trim((string)cfg('email.client_secret', '')) !== '';
    }
    return trim((string)cfg('email.host', '')) !== '';
}

/**
 * Envia um e-mail. Retorna [bool $ok, string $erro]. Nunca lança.
 */
function mail_send(string $to, string $subject, string $htmlBody, string $textAlt = ''): array {
    if (!mail_enabled()) return [false, 'E-mail desativado ou não configurado (config.json → email).'];
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return [false, "Destinatário inválido: $to"];
    return mail_provider() === 'graph'
        ? _mail_send_graph($to, $subject, $htmlBody)
        : _mail_send_smtp($to, $subject, $htmlBody, $textAlt);
}

/* ─────────────────────────────────────────────────────────────
   MOTOR 1 — Microsoft Graph (OAuth2 app-only)
   ───────────────────────────────────────────────────────────── */
function _mail_send_graph(string $to, string $subject, string $htmlBody): array {
    if (!function_exists('curl_init')) return [false, 'Extensão cURL ausente (necessária p/ Microsoft Graph).'];
    $from    = trim((string)cfg('email.from'));
    $timeout = (int)cfg('email.timeout', 15);

    [$token, $terr] = _graph_token($timeout);
    if (!$token) return [false, 'OAuth2 (token): ' . $terr];

    $payload = [
        'message' => [
            'subject' => $subject,
            'body'    => ['contentType' => 'HTML', 'content' => $htmlBody],
            'toRecipients' => [['emailAddress' => ['address' => $to]]],
        ],
        'saveToSentItems' => false,
    ];
    $url = 'https://graph.microsoft.com/v1.0/users/' . rawurlencode($from) . '/sendMail';
    [$code, $resp, $err] = _http_post_json($url, json_encode($payload), [
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json',
    ], $timeout);

    if ($err) return [false, "Graph (rede): $err"];
    if ($code === 202) return [true, ''];
    // tenta extrair a mensagem de erro do Graph
    $j = json_decode($resp, true);
    $msg = $j['error']['message'] ?? ('HTTP ' . $code . ' ' . substr((string)$resp, 0, 300));
    return [false, "Graph (envio): $msg"];
}

/** Obtém token app-only (client credentials). Cacheia por request. */
function _graph_token(int $timeout = 15): array {
    static $cache = null;
    if ($cache !== null) return $cache;
    $tenant = trim((string)cfg('email.tenant_id'));
    $cid    = trim((string)cfg('email.client_id'));
    $secret = trim((string)cfg('email.client_secret'));
    $url = "https://login.microsoftonline.com/$tenant/oauth2/v2.0/token";
    $body = http_build_query([
        'client_id'     => $cid,
        'client_secret' => $secret,
        'scope'         => 'https://graph.microsoft.com/.default',
        'grant_type'    => 'client_credentials',
    ]);
    [$code, $resp, $err] = _http_post_json($url, $body, ['Content-Type: application/x-www-form-urlencoded'], $timeout);
    if ($err) { $cache = [null, $err]; return $cache; }
    $j = json_decode($resp, true);
    if ($code === 200 && !empty($j['access_token'])) { $cache = [$j['access_token'], '']; return $cache; }
    $msg = $j['error_description'] ?? $j['error'] ?? ('HTTP ' . $code);
    $cache = [null, is_array($msg) ? json_encode($msg) : (string)$msg];
    return $cache;
}

/** POST HTTPS genérico via cURL. Retorna [http_code, body, curl_error]. */
function _http_post_json(string $url, string $body, array $headers, int $timeout): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $resp = curl_exec($ch);
    $err  = $resp === false ? curl_error($ch) : '';
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, (string)$resp, $err];
}

/* ─────────────────────────────────────────────────────────────
   MOTOR 2 — SMTP básico (sockets, AUTH LOGIN) — alternativa
   ───────────────────────────────────────────────────────────── */
function _mail_send_smtp(string $to, string $subject, string $htmlBody, string $textAlt = ''): array {
    $host    = (string)cfg('email.host');
    $port    = (int)cfg('email.port', 587);
    $secure  = strtolower((string)cfg('email.secure', 'tls'));   // tls | ssl | none
    $user    = (string)cfg('email.username', '');
    $pass    = (string)cfg('email.password', '');
    $from     = (string)cfg('email.from');
    $fromName = (string)cfg('email.from_name', 'SyncroFlow');
    $timeout  = (int)cfg('email.timeout', 12);

    $transport = ($secure === 'ssl') ? "ssl://$host" : $host;
    $errno = 0; $errstr = '';
    $fp = @stream_socket_client("$transport:$port", $errno, $errstr, $timeout,
        STREAM_CLIENT_CONNECT, stream_context_create(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]));
    if (!$fp) return [false, "Conexão SMTP falhou ($errno): $errstr"];
    stream_set_timeout($fp, $timeout);

    $read = function () use ($fp) {
        $data = '';
        while (($line = fgets($fp, 512)) !== false) {
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $data;
    };
    $cmd = function (string $c, ?string $expect = null) use ($fp, $read) {
        if ($c !== '') fwrite($fp, $c . "\r\n");
        $resp = $read();
        if ($expect !== null && strncmp($resp, $expect, strlen($expect)) !== 0) return [false, trim($resp)];
        return [true, trim($resp)];
    };

    try {
        [$ok, $msg] = $cmd('', '220');                 if (!$ok) return [false, "Saudação: $msg"];
        $ehlo = 'EHLO ' . (gethostname() ?: 'localhost');
        [$ok, $msg] = $cmd($ehlo, '250');              if (!$ok) return [false, "EHLO: $msg"];
        if ($secure === 'tls') {
            [$ok, $msg] = $cmd('STARTTLS', '220');      if (!$ok) return [false, "STARTTLS: $msg"];
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT
                    | STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT)) {
                return [false, 'Falha ao negociar TLS.'];
            }
            [$ok, $msg] = $cmd($ehlo, '250');           if (!$ok) return [false, "EHLO pós-TLS: $msg"];
        }
        if ($user !== '') {
            [$ok, $msg] = $cmd('AUTH LOGIN', '334');     if (!$ok) return [false, "AUTH: $msg"];
            [$ok, $msg] = $cmd(base64_encode($user), '334'); if (!$ok) return [false, "Usuário: $msg"];
            [$ok, $msg] = $cmd(base64_encode($pass), '235'); if (!$ok) return [false, "Senha/auth recusada: $msg"];
        }
        [$ok, $msg] = $cmd("MAIL FROM:<$from>", '250'); if (!$ok) return [false, "MAIL FROM: $msg"];
        [$ok, $msg] = $cmd("RCPT TO:<$to>", '250');     if (!$ok) return [false, "RCPT TO: $msg"];
        [$ok, $msg] = $cmd('DATA', '354');              if (!$ok) return [false, "DATA: $msg"];

        $boundary = 'sf_' . bin2hex(random_bytes(8));
        if ($textAlt === '') $textAlt = trim(preg_replace('/\s+/', ' ', strip_tags($htmlBody)));
        // Message-ID com o domínio do REMETENTE (não o do servidor SMTP) — mais legítimo p/ filtros.
        $fromDomain = strpos($from, '@') !== false ? substr(strrchr($from, '@'), 1) : $host;
        $headers = [
            'From: ' . _mail_encode_name($fromName) . " <$from>",
            "To: <$to>",
            "Reply-To: <$from>",
            'Subject: ' . _mail_encode_header($subject),
            'MIME-Version: 1.0',
            'Date: ' . date('r'),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $fromDomain . '>',
            'X-Mailer: SyncroFlow',
            'Auto-Submitted: auto-generated',
            "Content-Type: multipart/alternative; boundary=\"$boundary\"",
        ];
        $bodyData  = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n" . $textAlt . "\r\n";
        $bodyData .= "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n" . $htmlBody . "\r\n";
        $bodyData .= "--$boundary--\r\n";
        $data = implode("\r\n", $headers) . "\r\n\r\n" . $bodyData;
        $data = preg_replace('/^\./m', '..', $data);
        [$ok, $msg] = $cmd($data . "\r\n.", '250');     if (!$ok) return [false, "Envio: $msg"];
        $cmd('QUIT');
        fclose($fp);
        return [true, ''];
    } catch (Throwable $e) {
        @fclose($fp);
        return [false, 'Exceção: ' . $e->getMessage()];
    }
}

function _mail_encode_header(string $s): string {
    return preg_match('/[^\x20-\x7e]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}
function _mail_encode_name(string $s): string { return _mail_encode_header($s); }

/**
 * Template HTML responsivo e à prova de Outlook (layout em tabela, estilos
 * inline). Use $preheader para o "preview" que aparece na lista de e-mails.
 */
function mail_template(string $title, string $bodyHtml, string $preheader = ''): string {
    $t  = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $ph = htmlspecialchars($preheader !== '' ? $preheader : strip_tags($title), ENT_QUOTES, 'UTF-8');
    $year = date('Y');
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">'
      . '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' . $t . '</title></head>'
      . '<body style="margin:0;padding:0;background:#eef3f4;">'
      . '<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">' . $ph . '</span>'
      . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f4;padding:24px 12px;">'
      . '<tr><td align="center">'
      . '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8e7;font-family:\'Segoe UI\',Roboto,Arial,sans-serif;">'
      // ── Cabeçalho da marca ──
      . '<tr><td style="background:#0a8f84;padding:22px 28px;">'
      .   '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
      .     '<td style="font-size:22px;line-height:1;">🦫</td>'
      .     '<td style="padding-left:10px;color:#ffffff;font-size:18px;font-weight:700;">SyncroFlow'
      .       '<div style="font-size:11px;font-weight:600;color:#bfe6e2;letter-spacing:.4px;text-transform:uppercase;">Gestão de Fluxo de Trabalho</div>'
      .     '</td>'
      .   '</tr></table>'
      . '</td></tr>'
      // faixa de destaque (degradê via blocos sólidos p/ compatibilidade)
      . '<tr><td style="height:4px;background:#d97757;font-size:0;line-height:0;">&nbsp;</td></tr>'
      // ── Corpo ──
      . '<tr><td style="padding:28px;color:#1f2d2c;font-size:15px;line-height:1.65;">'
      .   '<h1 style="margin:0 0 14px;color:#076e65;font-size:20px;line-height:1.3;">' . $t . '</h1>'
      .   $bodyHtml
      . '</td></tr>'
      // ── Rodapé ──
      . '<tr><td style="padding:16px 28px;background:#f1f5f5;border-top:1px solid #e2e8e7;color:#7a9594;font-size:12px;line-height:1.5;">'
      .   'Mensagem automática do <strong style="color:#5a6b6a;">SyncroFlow</strong>.<br>'
      .   'Você está recebendo porque possui uma conta no sistema. Não responda este e-mail.'
      .   '<div style="margin-top:8px;color:#9fb0af;">© ' . $year . ' SyncroFlow</div>'
      . '</td></tr>'
      . '</table>'
      . '</td></tr></table></body></html>';
}

/** Botão "bulletproof" (funciona no Outlook). Use dentro do bodyHtml. */
function mail_button(string $text, string $url): string {
    $t = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    $u = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>'
      . '<td align="center" bgcolor="#0a8f84" style="border-radius:8px;">'
      . '<a href="' . $u . '" target="_blank" style="display:inline-block;padding:12px 26px;font-family:\'Segoe UI\',Arial,sans-serif;'
      . 'font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">' . $t . '</a>'
      . '</td></tr></table>';
}

/**
 * Diagnóstico de e-mail SEM enviar: confere pré-requisitos e CONECTIVIDADE.
 * Resolve a dúvida "configurei mas não envia no servidor" — normalmente é
 * firewall bloqueando a porta SMTP de saída, ou a extensão OpenSSL ausente.
 * Retorna ['ok'=>bool, 'lines'=>[['ok'=>bool,'label'=>..,'detail'=>..], ...]].
 */
function mail_diagnose(): array {
    $lines = [];
    $add = function (bool $ok, string $label, string $detail = '') use (&$lines) {
        $lines[] = ['ok' => $ok, 'label' => $label, 'detail' => $detail];
    };

    $add((bool)cfg('email.enabled', false), 'email.enabled', ((bool)cfg('email.enabled', false)) ? 'ligado' : 'DESLIGADO em config.json');
    $provider = mail_provider();
    $add(true, 'Motor (provider)', $provider);
    $add(true, 'PHP', PHP_VERSION . ' · SAPI ' . PHP_SAPI);

    if ($provider === 'graph') {
        $hasCurl = function_exists('curl_init');
        $add($hasCurl, 'Extensão cURL', $hasCurl ? 'disponível' : 'AUSENTE (necessária para o Microsoft Graph)');
        foreach (['tenant_id','client_id','client_secret'] as $k) {
            $v = trim((string)cfg("email.$k", ''));
            $add($v !== '', "email.$k", $v !== '' ? 'definido' : 'vazio');
        }
        if ($hasCurl) {
            [$tok, $err] = _graph_token((int)cfg('email.timeout', 15));
            $add((bool)$tok, 'Token OAuth2 (Graph)', $tok ? 'obtido com sucesso' : ('falhou: ' . $err));
        }
        return ['ok' => !in_array(false, array_column($lines, 'ok'), true), 'lines' => $lines];
    }

    // ── SMTP ──
    $host    = trim((string)cfg('email.host', ''));
    $port    = (int)cfg('email.port', 587);
    $secure  = strtolower((string)cfg('email.secure', 'tls'));
    $timeout = (int)cfg('email.timeout', 12);
    $add($host !== '', 'email.host', $host !== '' ? "$host:$port (segurança: $secure)" : 'vazio');
    $hasSsl = extension_loaded('openssl');
    $add($hasSsl || $secure === 'none', 'Extensão OpenSSL', $hasSsl ? 'disponível' : 'AUSENTE (necessária para TLS/SSL)');

    if ($host !== '') {
        $t0 = microtime(true);
        $transport = ($secure === 'ssl') ? "ssl://$host" : $host;
        $errno = 0; $errstr = '';
        $fp = @stream_socket_client("$transport:$port", $errno, $errstr, $timeout,
            STREAM_CLIENT_CONNECT, stream_context_create(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]));
        $ms = round((microtime(true) - $t0) * 1000);
        if (!$fp) {
            $add(false, "Conexão TCP $host:$port",
                "FALHOU ($errno): $errstr — provável BLOQUEIO de firewall de saída na rede do servidor (a porta $port não sai).");
        } else {
            stream_set_timeout($fp, $timeout);
            $greet = (string)fgets($fp, 512);
            $add(strncmp($greet, '220', 3) === 0, "Conexão SMTP $host:$port", "conectou em {$ms}ms · saudação: " . trim($greet));
            if ($secure === 'tls') {
                fwrite($fp, "EHLO syncroflow\r\n");
                while (($l = fgets($fp, 512)) !== false) { if (isset($l[3]) && $l[3] === ' ') break; }
                fwrite($fp, "STARTTLS\r\n");
                $st = (string)fgets($fp, 512);
                $okTls = strncmp($st, '220', 3) === 0
                    && @stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT
                        | STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT);
                $add($okTls, 'STARTTLS', $okTls ? 'negociado com sucesso' : ('falhou: ' . trim($st)));
            }
            @fwrite($fp, "QUIT\r\n");
            @fclose($fp);
        }
    }
    return ['ok' => !in_array(false, array_column($lines, 'ok'), true), 'lines' => $lines];
}

/** Caixa de destaque (ex.: senha temporária, código). Use dentro do bodyHtml. */
function mail_callout(string $html): string {
    return '<div style="margin:18px 0;padding:14px 16px;background:#eef7f6;border:1px solid #bfe0db;'
      . 'border-left:4px solid #0a8f84;border-radius:8px;color:#0f3b37;font-size:15px;">' . $html . '</div>';
}
