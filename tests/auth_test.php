<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — tests/auth_test.php
   Testes de autenticação SEM dependências externas (sem Composer/
   PHPUnit). Roda num banco SQLite temporário e isolado.

   Uso:  php tests/auth_test.php
   Sai com código 0 se tudo passou; 1 se houve falha (útil em CI).
   ═══════════════════════════════════════════════════════════ */

ob_start();   // adia headers (login() usa sessão/cookies) — evita warnings no CLI

$root   = dirname(__DIR__);
$tmpDir = sys_get_temp_dir() . '/sf_authtest_' . getmypid();
@mkdir($tmpDir, 0777, true);

// Config isolada apontando para um banco temporário (email desligado).
$cfg = [
    'database' => ['path' => "$tmpDir/t.db", 'photos_path' => "$tmpDir/p.db"],
    'backups'  => ['path' => "$tmpDir/backups", 'auto_interval_hours' => 99999, 'keep_count' => 1, 'encrypt' => false],
    'uploads'  => ['path' => "$tmpDir/uploads", 'max_size_mb' => 5],
    'session'  => ['name' => 'sf_test', 'duration_minutes' => 60, 'secure_cookie' => false],
    'app'      => ['name' => 'SyncroFlow', 'version' => 'test', 'poll_interval_seconds' => 5],
    'debug'    => ['display_errors' => true, 'log_errors' => false, 'log_path' => "$tmpDir/t.log"],
    'email'    => ['enabled' => false],
];
file_put_contents("$tmpDir/config.json", json_encode($cfg));
putenv("SYNCROFLOW_CONFIG=$tmpDir/config.json");
$_SERVER['REMOTE_ADDR'] = '203.0.113.9';   // IP fixo para os testes

require_once $root . '/lib/helpers.php';
require_once $root . '/lib/db.php';
require_once $root . '/lib/auth.php';

$pass = 0; $fail = 0;
function check(string $name, bool $cond): void {
    global $pass, $fail;
    if ($cond) { $pass++; echo "  ✅ $name\n"; }
    else       { $fail++; echo "  ❌ $name\n"; }
}
function throws(callable $fn): bool {
    try { $fn(); return false; } catch (Throwable $e) { return true; }
}

echo "== Cadastro / bootstrap ==\n";
$u1 = register_user('', 'Forte123!', 'Admin Um', null, 'admin@ex.com');
check('1º usuário vira TI-Dev (bootstrap)', $u1['role'] === 'ti');
check('dono do sistema definido', is_owner($u1['user_id']));
check('ID interno gerado (8+ dígitos, não digitado)', preg_match('/^\d{8,}$/', $u1['user_id']) === 1);

$u2 = register_user('', 'Outra123!', 'Fulano Dois', null, 'user2@ex.com');
check('2º usuário vira analista (não TI)', $u2['role'] === 'analista');

echo "\n== Regras de e-mail ==\n";
check('e-mail duplicado é barrado', throws(fn() => register_user('', 'Forte123!', 'X', null, 'admin@ex.com')));
check('e-mail inválido é barrado',   throws(fn() => register_user('', 'Forte123!', 'X', null, 'nao-eh-email')));

echo "\n== Política de senha forte ==\n";
foreach ([
    'curta1!'       => 'curta (<8)',
    'semmaiuscula1!'=> 'sem maiúscula',
    'SEMMINUSC1!'   => 'sem minúscula',
    'SemNumeros!'   => 'sem número',
    'SemSimbolo123' => 'sem símbolo',
] as $pw => $motivo) {
    check("rejeita senha fraca ($motivo)", password_strength_error($pw) !== null);
}
check('aceita senha forte', password_strength_error('Forte123!') === null);
check('cadastro com senha fraca é barrado', throws(fn() => register_user('', 'fraca', 'Y', null, 'y@ex.com')));

echo "\n== Login (somente e-mail) ==\n";
$r = login('admin@ex.com', 'Forte123!');
check('login com e-mail + senha corretos', $r['ok'] === true && $r['user']['role'] === 'ti');
$r = login('admin@ex.com', 'senha-errada');
check('senha errada → invalid_credentials (genérico)', !$r['ok'] && $r['error'] === 'invalid_credentials');
$r = login('nao-existe@ex.com', 'qualquer');
check('e-mail inexistente → mesmo erro genérico', !$r['ok'] && $r['error'] === 'invalid_credentials');
$r = login($u1['user_id'], 'Forte123!');
check('login pelo ID interno FALHA (email-only)', !$r['ok']);

echo "\n== Rate limiting ==\n";
$bucket = 'testip:login';
for ($i = 0; $i < 4; $i++) auth_record_attempt($bucket);
check('4 tentativas ainda NÃO bloqueiam (limite 5)', auth_rate_limited($bucket, 5, 15) === false);
auth_record_attempt($bucket);
check('5ª tentativa bloqueia', auth_rate_limited($bucket, 5, 15) === true);
auth_clear_attempts($bucket);
check('sucesso limpa o contador', auth_rate_limited($bucket, 5, 15) === false);

echo "\n== Migração de e-mail do admin (anti-lockout) ==\n";
q("UPDATE users SET email='' WHERE user_id=?", [$u1['user_id']]);   // simula conta antiga sem e-mail
require_once $root . '/lib/schema.php';
_migrate_emails_for_login(db());
$mail = scalar("SELECT email FROM users WHERE user_id=?", [$u1['user_id']]);
check('admin sem e-mail recebe um e-mail utilizável', is_string($mail) && $mail !== '');

echo "\n────────────────────────────\n";
echo ($fail === 0 ? "✅ TODOS OS TESTES PASSARAM" : "❌ HOUVE FALHAS") . " — $pass ok, $fail falha(s)\n";

// Limpeza do banco temporário
foreach (glob("$tmpDir/*") ?: [] as $f) @unlink($f);
@rmdir($tmpDir);

ob_end_flush();
exit($fail > 0 ? 1 : 0);
