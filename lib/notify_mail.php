<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/notify_mail.php
   Notificações por E-MAIL (opt-in, desativadas por padrão).

   Dois eventos:
     • Designação  — quando alguém te coloca como responsável por um card.
     • Vencimento  — quando um card seu vence em breve ou está vencido.

   Regras (todas best-effort, NUNCA derrubam a ação principal):
     - O usuário precisa ter notify_email = 1 (master, vem 0).
     - E a subpreferência do evento ligada (assign/due).
     - E um e-mail válido cadastrado.
     - E o e-mail do sistema configurado (config.json → email).
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mailer.php';

/* ─────────── Estado simples (chave/valor) ─────────── */
function app_meta_get(string $key, ?string $default = null): ?string {
    try {
        $v = scalar("SELECT value FROM app_meta WHERE key = ?", [$key]);
        return $v === false ? $default : (string)$v;
    } catch (Throwable $e) { return $default; }
}
function app_meta_set(string $key, string $value): void {
    try {
        q("INSERT INTO app_meta (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value", [$key, $value]);
    } catch (Throwable $e) { /* best-effort */ }
}

/* ─────────── URL absoluta do app (para os botões) ─────────── */
function _app_abs_url(string $path = ''): string {
    $base = rtrim((string)cfg('app.base_url', ''), '/');
    if ($base === '') {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        if ($host === '') return '';   // contexto CLI sem base configurada → sem link
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $base = $scheme . '://' . $host . rtrim(url(''), '/');
    }
    $path = ltrim($path, '/');
    return $path === '' ? $base : $base . '/' . $path;
}

/* ─────────── Resolve usuário por NOME (assignee é um nome) ─────────── */
function _mail_resolve_user_by_name(string $name): ?array {
    $name = trim($name);
    if ($name === '') return null;
    try {
        $row = one(
            "SELECT user_id, name, display_name, email,
                    notify_email, notify_email_assign, notify_email_due
             FROM users
             WHERE is_active = 1 AND (lower(name) = lower(?) OR lower(display_name) = lower(?))
             LIMIT 1",
            [$name, $name]
        );
        return $row ?: null;
    } catch (Throwable $e) { return null; }
}

/* ─────────── Dedupe de e-mails (lembretes de vencimento) ─────────── */
function _email_already_sent(string $userId, string $kind, string $refId, string $tag): bool {
    try {
        return (int)scalar(
            "SELECT COUNT(*) FROM email_log WHERE user_id=? AND kind=? AND ref_id=? AND tag=?",
            [$userId, $kind, $refId, $tag]
        ) > 0;
    } catch (Throwable $e) { return false; }
}
function _email_mark_sent(string $userId, string $kind, string $refId, string $tag): void {
    try {
        q("INSERT OR IGNORE INTO email_log (user_id, kind, ref_id, tag, sent_at) VALUES (?,?,?,?,?)",
          [$userId, $kind, $refId, $tag, now_iso()]);
    } catch (Throwable $e) { /* best-effort */ }
}

/* ═══════════════════════════════════════════════════════════
   EVENTO 1 — Designação de card
   Chamado por api/cards.php (create / update / delegate), ao lado
   da notificação in-app. Context: created | assigned | delegated.
   ═══════════════════════════════════════════════════════════ */
function mail_notify_assignment(string $assigneeName, string $actorName, string $cardId, string $context = 'assigned'): void {
    try {
        if (!mail_enabled()) return;
        $u = _mail_resolve_user_by_name($assigneeName);
        if (!$u) return;
        if ((int)($u['notify_email'] ?? 0) !== 1) return;
        if ((int)($u['notify_email_assign'] ?? 1) !== 1) return;
        $to = trim((string)($u['email'] ?? ''));
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return;

        $card = one("SELECT title, team_id, due_date FROM cards WHERE id = ?", [$cardId]);
        $title    = (string)($card['title'] ?? 'card');
        $teamName = $card ? (string)(scalar("SELECT name FROM teams WHERE id = ?", [$card['team_id'] ?? '']) ?: '') : '';
        $url      = _app_abs_url('app.php');

        $name = (string)($u['display_name'] ?: $u['name']);
        [$subject, $html] = mail_tpl_assignment($name, $actorName, $title, $teamName, $context, $url);
        mail_send($to, $subject, $html);
    } catch (Throwable $e) { /* best-effort, nunca quebra a ação */ }
}

/* Menção em comentário (@nome). Gated pelo master notify_email. Best-effort. */
function mail_notify_mention(string $mentionedName, string $actorName, string $cardId, string $cardTitle): void {
    try {
        if (!mail_enabled()) return;
        $u = _mail_resolve_user_by_name($mentionedName);
        if (!$u) return;
        if ((int)($u['notify_email'] ?? 0) !== 1) return;     // respeita o opt-in do usuário
        $to = trim((string)($u['email'] ?? ''));
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return;

        $name = (string)($u['display_name'] ?: $u['name']);
        $url  = _app_abs_url('app.php');
        $body = '<p>Olá, ' . san($name) . '.</p>'
              . '<p><strong>' . san($actorName) . '</strong> mencionou você num comentário do card:</p>'
              . mail_callout('<strong>' . san($cardTitle) . '</strong>')
              . ($url !== '' ? mail_button('Ver no SyncroFlow', $url) : '')
              . '<p style="color:#6b7d7c;font-size:13px;">Você recebe este aviso porque ativou as notificações por e-mail em Meu Painel.</p>';
        mail_send($to, '💬 Mencionaram você — SyncroFlow', mail_template('Você foi mencionado', $body, $actorName . ' mencionou você num comentário'));
    } catch (Throwable $e) { /* best-effort */ }
}

/* ═══════════════════════════════════════════════════════════
   EVENTO 2 — Vencimento de cards (lembrete)
   Varredura periódica (lazy-cron). Manda, por card/usuário/data:
     • "due_soon" — vence dentro da janela (default 48h)
     • "overdue"  — já passou da data (e não está concluído/arquivado)
   ═══════════════════════════════════════════════════════════ */
function mail_run_due_check(bool $force = false): array {
    $result = ['ran' => false, 'checked' => 0, 'sent' => 0, 'skipped_throttle' => false];
    try {
        if (!mail_enabled()) return $result;

        // Throttle: roda no máximo 1x por intervalo (salvo force).
        $intervalH = (float)cfg('email.due_check_interval_hours', 6);
        if (!$force && $intervalH > 0) {
            $last = app_meta_get('due_check_last');
            if ($last && (time() - strtotime($last)) / 3600.0 < $intervalH) {
                $result['skipped_throttle'] = true;
                return $result;
            }
        }
        app_meta_set('due_check_last', now_iso());
        $result['ran'] = true;

        $windowH = (float)cfg('email.due_window_hours', 48);
        $now = time();
        $url = _app_abs_url('app.php');

        $cards = all(
            "SELECT id, title, team_id, assignee, due_date, progress
             FROM cards
             WHERE archived = 0 AND progress < 100
               AND due_date IS NOT NULL AND due_date != ''
               AND assignee IS NOT NULL AND assignee != ''"
        );

        foreach ($cards as $c) {
            $result['checked']++;
            $ts = strtotime((string)$c['due_date']);
            if ($ts === false) continue;

            if ($ts < $now)                         $phase = 'overdue';
            elseif ($ts <= $now + $windowH * 3600)  $phase = 'due_soon';
            else continue;

            $u = _mail_resolve_user_by_name((string)$c['assignee']);
            if (!$u) continue;
            if ((int)($u['notify_email'] ?? 0) !== 1) continue;
            if ((int)($u['notify_email_due'] ?? 1) !== 1) continue;
            $to = trim((string)($u['email'] ?? ''));
            if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) continue;

            // Dedupe: 1 e-mail por card + fase + data de vencimento.
            $tag = (string)$c['due_date'];
            if (_email_already_sent($u['user_id'], $phase, $c['id'], $tag)) continue;

            $teamName = (string)(scalar("SELECT name FROM teams WHERE id = ?", [$c['team_id'] ?? '']) ?: '');
            $name     = (string)($u['display_name'] ?: $u['name']);
            $dueHuman = date('d/m/Y', $ts);

            [$subject, $html] = ($phase === 'overdue')
                ? mail_tpl_overdue($name, (string)$c['title'], $teamName, $dueHuman, $url)
                : mail_tpl_due_soon($name, (string)$c['title'], $teamName, $dueHuman, $url);

            [$ok] = mail_send($to, $subject, $html);
            if ($ok) { _email_mark_sent($u['user_id'], $phase, $c['id'], $tag); $result['sent']++; }
        }
    } catch (Throwable $e) {
        error_log('[SyncroFlow due-check] ' . $e->getMessage());
    }
    return $result;
}

/** Registra a varredura de vencimento para rodar APÓS a resposta HTTP. */
function register_due_check_hook(): void {
    static $registered = false;
    if ($registered) return;
    $registered = true;
    register_shutdown_function(function () {
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        elseif (function_exists('flush'))               @flush();
        try { mail_run_due_check(false); }
        catch (Throwable $e) { error_log('[SyncroFlow shutdown due-check] ' . $e->getMessage()); }
    });
}

/* ═══════════════════════════════════════════════════════════
   EVENTO 3 — Resumo semanal (digest)
   Lazy-cron: roda 1x por semana ISO, a partir do dia/hora configurados
   (default: segunda-feira 07h). Para cada usuário opt-in, monta um
   resumo dos cards sob sua responsabilidade:
     • Atrasados
     • Vencem nesta semana (próximos 7 dias)
     • Em andamento / sem prazo
     • Concluídos nos últimos 7 dias
   Não envia e-mail vazio (quem não tem nada agendado nem concluído).
   ═══════════════════════════════════════════════════════════ */
function _digest_collect_for_user(string $name): array {
    $today    = strtotime(date('Y-m-d') . ' 00:00:00');
    $weekAgo  = gmdate('Y-m-d\TH:i:s.000\Z', time() - 7 * 86400);

    $open = all(
        "SELECT id, title, due_date, progress, team_id
         FROM cards
         WHERE archived = 0 AND progress < 100 AND lower(assignee) = lower(?)
         ORDER BY (due_date IS NULL OR due_date = ''), due_date",
        [$name]
    );
    $overdue = []; $thisWeek = []; $later = [];
    foreach ($open as $c) {
        $due = trim((string)($c['due_date'] ?? ''));
        $ts  = $due !== '' ? strtotime($due) : false;
        if ($ts !== false && $ts < $today)                  $overdue[]  = $c;
        elseif ($ts !== false && $ts <= $today + 7 * 86400) $thisWeek[] = $c;
        else                                                 $later[]    = $c;
    }
    $doneRecent = all(
        "SELECT id, title FROM cards
         WHERE archived = 0 AND progress >= 100 AND lower(assignee) = lower(?) AND updated_at >= ?
         ORDER BY updated_at DESC LIMIT 50",
        [$name, $weekAgo]
    );
    $nothing = !$overdue && !$thisWeek && !$later && !$doneRecent;
    return compact('overdue', 'thisWeek', 'later', 'doneRecent', 'nothing');
}

function mail_run_weekly_digest(bool $force = false): array {
    $result = ['ran' => false, 'sent' => 0, 'skipped' => ''];
    try {
        if (!mail_enabled())                         { $result['skipped'] = 'mail_disabled'; return $result; }
        if (!(bool)cfg('email.digest_enabled', true)){ $result['skipped'] = 'disabled';      return $result; }

        $week = date('o-\WW'); // semana ISO, ex.: 2026-W24
        if (!$force) {
            $wd      = max(1, min(7, (int)cfg('email.digest_weekday', 1)));  // 1=segunda … 7=domingo
            $hour    = max(0, min(23, (int)cfg('email.digest_hour', 7)));
            $monday  = strtotime('monday this week 00:00:00');
            $release = $monday + ($wd - 1) * 86400 + $hour * 3600;
            if (time() < $release)                          { $result['skipped'] = 'not_due';      return $result; }
            if (app_meta_get('digest_week') === $week)      { $result['skipped'] = 'already_sent'; return $result; }
        }
        // Marca antes do loop (best-effort) para evitar envio duplo em requests concorrentes.
        app_meta_set('digest_week', $week);
        $result['ran'] = true;

        $url   = _app_abs_url('app.php');
        $users = all(
            "SELECT user_id, name, display_name, email
             FROM users
             WHERE is_active = 1 AND notify_email = 1 AND notify_email_digest = 1
               AND email IS NOT NULL AND email != ''"
        );
        foreach ($users as $usr) {
            $to = trim((string)($usr['email'] ?? ''));
            if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) continue;
            $name = (string)($usr['display_name'] ?: $usr['name']);
            // assignee é gravado pelo NOME — tenta os dois (name e display_name)
            $data = _digest_collect_for_user((string)$usr['name']);
            if ($data['nothing'] && trim((string)$usr['display_name']) !== '' && strcasecmp((string)$usr['display_name'], (string)$usr['name']) !== 0) {
                $data = _digest_collect_for_user((string)$usr['display_name']);
            }
            if ($data['nothing']) continue; // não manda e-mail vazio
            if (!$force && _email_already_sent((string)$usr['user_id'], 'digest', '', $week)) continue;

            [$subject, $html] = mail_tpl_digest($name, $data, $url);
            [$ok] = mail_send($to, $subject, $html);
            if ($ok) { _email_mark_sent((string)$usr['user_id'], 'digest', '', $week); $result['sent']++; }
        }
    } catch (Throwable $e) {
        error_log('[SyncroFlow weekly-digest] ' . $e->getMessage());
    }
    return $result;
}

/** Registra o resumo semanal para rodar APÓS a resposta HTTP. */
function register_weekly_digest_hook(): void {
    static $registered = false;
    if ($registered) return;
    $registered = true;
    register_shutdown_function(function () {
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        elseif (function_exists('flush'))               @flush();
        try { mail_run_weekly_digest(false); }
        catch (Throwable $e) { error_log('[SyncroFlow shutdown weekly-digest] ' . $e->getMessage()); }
    });
}

/* ═══════════════════════════════════════════════════════════
   TEMPLATES — retornam [assunto, htmlCompleto]
   ═══════════════════════════════════════════════════════════ */

/** Caixa de alerta (vermelha) para vencidos. */
function _mail_warn_box(string $html): string {
    return '<div style="margin:18px 0;padding:14px 16px;background:#fdeeea;border:1px solid #f3c0b3;'
         . 'border-left:4px solid #d9534f;border-radius:8px;color:#7f1d1d;font-size:15px;">' . $html . '</div>';
}

function mail_tpl_assignment(string $name, string $actor, string $cardTitle, string $teamName, string $context, string $url): array {
    $verbs = [
        'created'   => 'criou um card e designou você como responsável',
        'assigned'  => 'designou você como responsável por um card',
        'delegated' => 'delegou um card para você',
    ];
    $verb = $verbs[$context] ?? 'designou um card para você';
    $teamLine = $teamName !== ''
        ? '<br><span style="color:#5a6b6a;font-size:13px;">Equipe: ' . san($teamName) . '</span>' : '';
    $body = '<p>Olá, ' . san($name) . '.</p>'
          . '<p><strong>' . san($actor) . '</strong> ' . $verb . ':</p>'
          . mail_callout('<strong>' . san($cardTitle) . '</strong>' . $teamLine)
          . ($url !== '' ? mail_button('Abrir no SyncroFlow', $url) : '')
          . '<p style="color:#6b7d7c;font-size:13px;">Você recebe este aviso porque ativou as '
          . '<strong>notificações por e-mail de designação</strong> em Meu Painel. '
          . 'Para parar, é só desligar lá.</p>';
    return ['Você foi designado para um card — SyncroFlow',
            mail_template('Você foi designado para um card', $body, $actor . ' designou um card para você')];
}

function mail_tpl_due_soon(string $name, string $cardTitle, string $teamName, string $dueHuman, string $url): array {
    $teamLine = $teamName !== ''
        ? '<br><span style="color:#5a6b6a;font-size:13px;">Equipe: ' . san($teamName) . '</span>' : '';
    $body = '<p>Olá, ' . san($name) . '.</p>'
          . '<p>Um card sob sua responsabilidade <strong>vence em breve</strong>. Que tal dar uma olhada?</p>'
          . mail_callout('<strong>' . san($cardTitle) . '</strong><br>'
              . '<span style="color:#0f3b37;font-size:14px;">📅 Vence em <strong>' . san($dueHuman) . '</strong></span>'
              . $teamLine)
          . ($url !== '' ? mail_button('Abrir no SyncroFlow', $url) : '')
          . '<p style="color:#6b7d7c;font-size:13px;">Você recebe este aviso porque ativou as '
          . '<strong>notificações por e-mail de vencimento</strong> em Meu Painel.</p>';
    return ['⏰ Card prestes a vencer — SyncroFlow',
            mail_template('Card prestes a vencer', $body, 'Um card seu vence em ' . $dueHuman)];
}

function mail_tpl_overdue(string $name, string $cardTitle, string $teamName, string $dueHuman, string $url): array {
    $teamLine = $teamName !== ''
        ? '<br><span style="color:#7f1d1d;font-size:13px;">Equipe: ' . san($teamName) . '</span>' : '';
    $body = '<p>Olá, ' . san($name) . '.</p>'
          . '<p>Um card sob sua responsabilidade <strong>está vencido</strong>:</p>'
          . _mail_warn_box('<strong>' . san($cardTitle) . '</strong><br>'
              . '<span style="font-size:14px;">⚠️ Venceu em <strong>' . san($dueHuman) . '</strong></span>'
              . $teamLine)
          . '<p>Atualize o progresso, ajuste a data ou conclua o card para regularizar.</p>'
          . ($url !== '' ? mail_button('Resolver agora', $url) : '')
          . '<p style="color:#6b7d7c;font-size:13px;">Você recebe este aviso porque ativou as '
          . '<strong>notificações por e-mail de vencimento</strong> em Meu Painel.</p>';
    return ['🚩 Card vencido — SyncroFlow',
            mail_template('Card vencido', $body, 'Um card seu venceu em ' . $dueHuman)];
}

/** Lista compacta de cards (até $max) para o resumo. */
function _digest_card_list(array $cards, int $max = 8): string {
    if (!$cards) return '<p style="color:#8a9a99;font-size:13px;margin:2px 0 0;">— nenhum —</p>';
    $items = '';
    foreach (array_slice($cards, 0, $max) as $c) {
        $due = trim((string)($c['due_date'] ?? ''));
        $dueTxt = $due !== '' ? ' <span style="color:#8a9a99;font-size:12px;">· ' . san(date('d/m', strtotime($due))) . '</span>' : '';
        $items .= '<li style="margin:3px 0;">' . san((string)$c['title']) . $dueTxt . '</li>';
    }
    $extra = count($cards) > $max ? '<li style="margin:3px 0;color:#8a9a99;">+ ' . (count($cards) - $max) . ' outro(s)…</li>' : '';
    return '<ul style="margin:6px 0 0;padding-left:20px;color:#0f3b37;font-size:14px;">' . $items . $extra . '</ul>';
}

function mail_tpl_digest(string $name, array $data, string $url): array {
    $nOver = count($data['overdue']); $nWeek = count($data['thisWeek']);
    $nLater = count($data['later']);  $nDone = count($data['doneRecent']);

    $section = function (string $title, string $color, array $cards) {
        if (!$cards) return '';
        return '<div style="margin:16px 0 0;">'
             . '<div style="font-weight:800;color:' . $color . ';font-size:14px;">' . $title . ' (' . count($cards) . ')</div>'
             . _digest_card_list($cards) . '</div>';
    };

    $body = '<p>Olá, ' . san($name) . '.</p>'
          . '<p>Aqui está o seu <strong>resumo da semana</strong> no SyncroFlow:</p>'
          . mail_callout(
                '<table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px;color:#0f3b37;">'
              . '<tr>'
              . '<td style="text-align:center;padding:4px;"><div style="font-size:22px;font-weight:800;color:#d9534f;">' . $nOver . '</div>Atrasados</td>'
              . '<td style="text-align:center;padding:4px;"><div style="font-size:22px;font-weight:800;color:#c77700;">' . $nWeek . '</div>Esta semana</td>'
              . '<td style="text-align:center;padding:4px;"><div style="font-size:22px;font-weight:800;color:#2563eb;">' . $nLater . '</div>Em andamento</td>'
              . '<td style="text-align:center;padding:4px;"><div style="font-size:22px;font-weight:800;color:#16794f;">' . $nDone . '</div>Concluídos (7d)</td>'
              . '</tr></table>')
          . $section('🚩 Atrasados', '#b91c1c', $data['overdue'])
          . $section('⏰ Vencem esta semana', '#c77700', $data['thisWeek'])
          . $section('📋 Em andamento / sem prazo', '#2563eb', $data['later'])
          . $section('✅ Concluídos nos últimos 7 dias', '#16794f', $data['doneRecent'])
          . ($url !== '' ? mail_button('Abrir meu quadro', $url) : '')
          . '<p style="color:#6b7d7c;font-size:13px;">Você recebe este resumo porque ativou o '
          . '<strong>resumo semanal por e-mail</strong> em Meu Painel. Para parar, é só desligar lá.</p>';

    return ['🗓️ Seu resumo da semana — SyncroFlow',
            mail_template('Resumo da semana', $body, $nOver . ' atrasados · ' . $nWeek . ' vencem esta semana')];
}
