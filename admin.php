<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — admin.php (v11.1, refeito)
   Painel administrativo TI. Estrutura coerente com app.php:
   app-shell > sidebar(admin) + main(topbar + content).
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/lib/page_boot.php';   // erros visíveis/logados (evita 500 em branco)
require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/rbac.php';
require_once __DIR__ . '/lib/revision.php';
require_once __DIR__ . '/lib/photos.php';   // contabilidade de armazenamento
require_once __DIR__ . '/lib/holidays.php'; // feriados/dias facultativos editáveis

$u = require_role('manage_users');
start_session_if_needed();

/* TI–Dev tem acesso à configuração crítica do sistema; TI (suporte) não. */
$isDev = can($u['role'], 'manage_system');

/* Campos padrão do card configuráveis (obrigatório/opcional/oculto).
   O título é sempre obrigatório e não entra aqui. */
const CARD_FIELD_DEFS = [
    'description'  => '📝 Descrição',
    'assignee'    => '👤 Responsável',
    'priority'    => '🚩 Prioridade',
    'startDate'   => '📅 Data de início',
    'dueDate'     => '⏰ Prazo',
    'tags'        => '🏷️ Tags',
    'label'       => '🎨 Etiqueta',
    'gains'       => '💰 Ganhos',
    'subtasks'    => '☑️ Subtarefas',
    'links'       => '🔗 Links',
    'dependencies'=> '🔀 Dependências',
];

/* ─── POST handlers ─── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $a = $_POST['action'] ?? '';
    try {
        // Ações que só o TI–Dev pode executar (config crítica do sistema)
        $devOnly = ['maintenance','card_fields','backup_create','backup_delete',
                    'storage_delete_file','storage_purge_team','storage_purge_card',
                    'email_test','email_diag','digest_now','reveal_key','cleanup_orphans'];
        if (in_array($a, $devOnly, true) && !$isDev)
            throw new RuntimeException('Apenas o TI–Dev pode alterar esta configuração do sistema.');
        switch ($a) {
            case 'storage_delete_file': {
                $fid = $_POST['file_id'] ?? '';
                $row = one("SELECT card_id FROM attachments WHERE id=?", [$fid]);
                attach_delete($fid);
                q("DELETE FROM attachments WHERE id=?", [$fid]);
                flash('Anexo excluído do armazenamento.', 'success');
                break;
            }
            case 'storage_purge_team': {
                $tid = $_POST['team_id'] ?? '';
                $cardIds = array_column(all("SELECT id FROM cards WHERE team_id=?", [$tid]), 'id');
                foreach ($cardIds as $cid) { attach_delete_by_card($cid); q("DELETE FROM attachments WHERE card_id=?", [$cid]); }
                flash('Anexos da equipe removidos.', 'success');
                break;
            }
            case 'storage_purge_card': {
                $cid = $_POST['card_id'] ?? '';
                attach_delete_by_card($cid);                       // remove BLOBs do card
                q("DELETE FROM attachments WHERE card_id=?", [$cid]); // remove metadados
                flash('Anexos do card removidos (espaço liberado).', 'success');
                break;
            }
            case 'user_create':
                register_user('', $_POST['password'] ?? '', $_POST['name'] ?? '',
                              $_POST['role'] ?? 'analista', $_POST['email'] ?? '');
                flash('Usuário criado com sucesso.', 'success'); break;

            case 'user_role':
                $vid  = $_POST['user_id'] ?? '';
                $to   = $_POST['role']    ?? 'analista';
                $row  = one("SELECT name, role FROM users WHERE user_id=?", [$vid]);
                if (!$row) throw new RuntimeException('Usuário não encontrado.');
                // Nível GLOBAL só pode ser um dos 3 (gestor/visitante são papéis por equipe).
                if (!in_array($to, ['analista','suporte','ti'], true))
                    throw new RuntimeException('Nível global inválido. Use Usuário Padrão, TI - Sup ou TI - Dev.');
                // Regra do dono: TI-Dev é exclusivo do administrador do sistema — e ele nunca é rebaixado.
                if ($to === 'ti' && !is_owner($vid))
                    throw new RuntimeException('O papel TI - Dev é exclusivo do administrador do sistema.');
                if (is_owner($vid) && $to !== 'ti')
                    throw new RuntimeException('O administrador do sistema não pode deixar de ser TI - Dev.');
                // Só TI–Dev concede/retira o papel TI–Dev ('ti').
                if (!$isDev && ($to === 'ti' || $row['role'] === 'ti'))
                    throw new RuntimeException('Apenas o TI–Dev pode atribuir ou alterar o papel TI–Dev.');
                q("UPDATE users SET role=? WHERE user_id=?", [$to, $vid]);
                q("INSERT INTO role_history (id, user_id, name, from_role, to_role, changed_by, changed_at, reason)
                   VALUES (?,?,?,?,?,?,?,?)",
                   [uid(), $vid, $row['name'], $row['role'], $to, $u['name'], now_iso(),
                    $_POST['reason'] ?? '']);
                flash('Papel atualizado.', 'success'); break;

            case 'user_reset_pwd':
                $vid = $_POST['user_id'] ?? '';
                $pwd = $_POST['new_password'] ?? '';
                if (strlen($pwd) < 6) throw new InvalidArgumentException('Senha curta demais.');
                q("UPDATE users SET password_hash=? WHERE user_id=?",
                  [password_hash($pwd, PASSWORD_BCRYPT, ['cost'=>12]), $vid]);
                flash('Senha redefinida.', 'success'); break;

            case 'user_toggle':
                $vid = $_POST['user_id'] ?? '';
                if (is_owner($vid)) throw new RuntimeException('O administrador do sistema não pode ser desativado.');
                q("UPDATE users SET is_active = 1 - is_active WHERE user_id=?", [$vid]);
                flash('Status do usuário alterado.', 'success'); break;

            case 'user_delete': {
              $vid = $_POST['user_id'] ?? '';
              if (!$vid) throw new RuntimeException('ID do usuário ausente.');
              if (is_owner($vid)) throw new RuntimeException('O administrador do sistema não pode ser excluído.');
              if ($vid === $u['user_id']) throw new RuntimeException('Você não pode excluir a sua própria conta enquanto logado.');
              // Exclusão COMPLETA: quadro pessoal (cards/colunas/equipe), linhas por
              // user_id, notificações, fotos/anexos — nada de lixo no banco.
              $res = delete_user_completely($vid);
              flash('Usuário excluído com sucesso — removidos também o quadro pessoal e '
                    . (int)$res['personal_cards'] . ' card(s) pessoa(is).', 'success');
              break;
            }

            case 'email_test': {
                require_once __DIR__ . '/lib/mailer.php';
                if (!mail_enabled())
                    throw new RuntimeException('E-mail desativado/não configurado. Preencha config.json → email e marque enabled=true.');
                $dest = trim((string)($_POST['test_to'] ?? '')) ?: (string)($u['email'] ?? '');
                if (!$dest) throw new RuntimeException('Informe um e-mail de destino para o teste.');
                [$ok, $err] = mail_send($dest,
                    'Teste de e-mail — SyncroFlow',
                    mail_template('Funcionou! ✅', '<p>Se você está lendo isto, o envio de e-mail do SyncroFlow está configurado corretamente.</p><p>Enviado em ' . san(now_iso()) . '.</p>'));
                if (!$ok) throw new RuntimeException('Falha no envio: ' . $err);
                flash('E-mail de teste enviado para ' . san($dest) . '.', 'success'); break;
            }

            case 'email_diag': {
                require_once __DIR__ . '/lib/mailer.php';
                $_SESSION['_email_diag'] = mail_diagnose();   // exibido na seção de e-mail
                flash('Diagnóstico de conectividade concluído (veja o resultado abaixo).', 'success'); break;
            }

            case 'digest_now': {
                require_once __DIR__ . '/lib/notify_mail.php';
                if (!mail_enabled())
                    throw new RuntimeException('E-mail desativado/não configurado. Preencha config.json → email e marque enabled=true.');
                $r = mail_run_weekly_digest(true);  // força, ignora o agendamento semanal
                flash('Resumo semanal disparado: ' . (int)$r['sent'] . ' e-mail(s) enviado(s) '
                      . '(usuários com a opção ligada e que tinham cards).', 'success'); break;
            }

            case 'holiday_create': {
                // TI-Dev E TI-Sup podem cadastrar (não está em $devOnly).
                holiday_add([
                    'name'  => $_POST['name'] ?? '',
                    'kind'  => $_POST['kind'] ?? 'feriado',
                    'scope' => $_POST['scope'] ?? '',
                    'uf'    => $_POST['uf'] ?? '',
                    'city'  => $_POST['city'] ?? '',
                    'month' => $_POST['month'] ?? '',
                    'day'   => $_POST['day'] ?? '',
                    'date'  => $_POST['date'] ?? '',
                ], $u['name']);
                flash('Feriado/dia facultativo cadastrado.', 'success'); break;
            }
            case 'holiday_delete': {
                holiday_remove((string)($_POST['id'] ?? ''));
                flash('Item removido do calendário.', 'success'); break;
            }
            case 'holiday_import': {
                $r = holidays_bulk_import((string)($_POST['bulk'] ?? ''), $u['name']);
                $msg = "Importação: {$r['added']} adicionado(s), {$r['ignored']} ignorado(s) por repetição";
                if (!empty($r['errors'])) {
                    $msg .= '. ' . count($r['errors']) . ' linha(s) com problema: ' . implode(' | ', array_slice($r['errors'], 0, 3));
                    if (count($r['errors']) > 3) $msg .= ' …';
                    flash($msg, $r['added'] > 0 ? 'success' : 'error');
                } else {
                    flash($msg . '.', 'success');
                }
                break;
            }

            /* ── Renomear usuário (TI-Dev E TI-Sup). strip_tags limpa nomes-payload. ── */
            case 'user_rename': {
                $vid  = (string)($_POST['user_id'] ?? '');
                $name = trim(preg_replace('/\s+/', ' ', strip_tags((string)($_POST['new_name'] ?? ''))));
                if ($vid === '' || $name === '') { flash('Informe um nome válido.', 'error'); break; }
                if (function_exists('mb_substr') && mb_strlen($name) > 80) $name = mb_substr($name, 0, 80);
                q("UPDATE users SET name = ? WHERE user_id = ?", [$name, $vid]);
                flash('Nome do usuário atualizado.', 'success');
                break;
            }

            /* ── Copa do Mundo (#6) — TI-Dev E TI-Sup ── */
            case 'wc_toggle': {
                $on = !empty($_POST['enabled']) ? '1' : '0';
                q("INSERT OR REPLACE INTO system_config (key, value) VALUES ('worldcup_enabled', ?)", [$on]);
                flash($on === '1' ? 'Modo Copa ativado — os jogos aparecem no Calendário.' : 'Modo Copa desativado.', 'success');
                break;
            }
            case 'wc_save': {
                $id    = trim((string)($_POST['id'] ?? ''));
                $date  = trim((string)($_POST['match_date'] ?? ''));
                $name  = trim((string)($_POST['name'] ?? ''));
                if ($date === '' || $name === '') { flash('Informe a data e o nome do jogo.', 'error'); break; }
                $time   = trim((string)($_POST['match_time'] ?? ''));
                $stage  = trim((string)($_POST['stage'] ?? ''));
                $brazil = !empty($_POST['brazil']) ? 1 : 0;
                $result = trim((string)($_POST['result'] ?? ''));
                if ($id === '') {
                    q("INSERT INTO worldcup_matches (id, match_date, match_time, name, stage, brazil, result, position, created_at)
                       VALUES (?,?,?,?,?,?,?,0,?)",
                      ['wc-' . bin2hex(random_bytes(5)), $date, $time, $name, $stage, $brazil, $result, gmdate('Y-m-d\TH:i:s.000\Z')]);
                    flash('Jogo adicionado.', 'success');
                } else {
                    q("UPDATE worldcup_matches SET match_date=?, match_time=?, name=?, stage=?, brazil=?, result=? WHERE id=?",
                      [$date, $time, $name, $stage, $brazil, $result, $id]);
                    flash('Jogo atualizado.', 'success');
                }
                break;
            }
            case 'wc_delete': {
                q("DELETE FROM worldcup_matches WHERE id=?", [(string)($_POST['id'] ?? '')]);
                flash('Jogo removido.', 'success');
                break;
            }

            case 'cleanup_orphans': {
                $rm = cleanup_orphan_personal_boards();
                if ($rm['teams'] === 0)
                    flash('Nenhum quadro órfão encontrado — o banco já está limpo.', 'success');
                else
                    flash("Limpeza concluída: removidos {$rm['teams']} quadro(s) pessoal(is) órfão(s), {$rm['columns']} coluna(s) e {$rm['cards']} card(s).", 'success');
                break;
            }

            case 'reveal_key': {
                // Revela a chave de criptografia dos backups (.syncroflow.key) após
                // confirmar a senha do próprio TI-Dev. Útil quando ele NÃO tem acesso
                // ao sistema de arquivos do servidor e precisa restaurar um backup .enc.
                $pwd  = (string)($_POST['key_password'] ?? '');
                $hash = scalar("SELECT password_hash FROM users WHERE user_id=?", [$u['user_id']]);
                if (!$hash || !password_verify($pwd, $hash))
                    throw new RuntimeException('Senha incorreta — a chave NÃO foi revelada.');
                require_once __DIR__ . '/lib/crypto.php';
                crypto_master_key();                      // gera a chave se ainda não existir
                $keyPath = _crypto_key_path();
                $b64 = is_file($keyPath) ? trim((string)@file_get_contents($keyPath)) : '';
                if ($b64 === '') throw new RuntimeException('Não foi possível ler a chave no servidor.');
                $_SESSION['_revealed_key'] = $b64;        // exibida uma vez na seção (limpa após render)
                flash('Chave revelada abaixo — copie e guarde em local seguro.', 'success'); break;
            }

            case 'col_create':
                q("INSERT INTO columns (id, name, color, icon, position)
                   VALUES (?,?,?,?, (SELECT COALESCE(MAX(position),-1)+1 FROM columns))", [
                    uid(), $_POST['name'] ?? 'Nova',
                    $_POST['color'] ?? '#10b981',
                    $_POST['icon']  ?? '📂',
                ]);
                flash('Coluna criada.', 'success'); break;

            case 'col_delete':
                $id = $_POST['id'] ?? '';
                if ((int)scalar("SELECT COUNT(*) FROM cards WHERE column_id=? AND archived=0",[$id]) > 0) {
                    throw new RuntimeException('Coluna tem cards ativos.');
                }
                q("DELETE FROM columns WHERE id=?", [$id]);
                flash('Coluna removida.', 'success'); break;

            case 'maintenance':
                q("UPDATE maintenance_mode SET enabled=?, message=?, scheduled_start=?, expected_return=?,
                                               activated_by=?, activated_at=? WHERE id=1", [
                    isset($_POST['enabled']) ? 1 : 0,
                    $_POST['message'] ?? '',
                    $_POST['scheduled_start'] ?? '',
                    $_POST['expected_return'] ?? '',
                    $u['name'], now_iso(),
                ]);
                flash('Modo manutenção atualizado.', 'success'); break;

            case 'team_goals':
                q("UPDATE team_goals SET weekly=?, monthly=? WHERE id=1",
                  [(int)($_POST['weekly'] ?? 0), (int)($_POST['monthly'] ?? 0)]);
                flash('Metas atualizadas.', 'success'); break;

            case 'card_fields': {
                $cfg = [];
                foreach (CARD_FIELD_DEFS as $key => $_label) {
                    $v = $_POST['cf_' . $key] ?? 'optional';
                    if (!in_array($v, ['required','optional','hidden'], true)) $v = 'optional';
                    $cfg[$key] = $v;
                }
                q("INSERT OR REPLACE INTO system_config (key, value) VALUES ('card_fields', ?)",
                  [json_encode($cfg, JSON_UNESCAPED_UNICODE)]);
                bump_revision('config', 'card_fields', 'update');
                flash('Campos do card atualizados.', 'success'); break;
            }


            case 'backup_create': {
                $dbPath = cfg('database.path');
                $bkpDir = cfg('backups.path');
                ensure_dir($bkpDir);
                $f = rtrim($bkpDir,'/\\') . DIRECTORY_SEPARATOR . 'syncroflow_' . date('Ymd_His') . '.db';
                @copy($dbPath, $f);
                q("INSERT INTO backups (id, label, created_at, created_by, revision, card_count, file_path, auto)
                   VALUES (?,?,?,?,?,?,?, 0)",
                   [uid(), $_POST['label'] ?? 'Manual', now_iso(), $u['name'],
                    (int)scalar("SELECT COALESCE(MAX(revision),0) FROM revision_log"),
                    (int)scalar("SELECT COUNT(*) FROM cards"), $f]);
                flash('Backup criado.', 'success');
                break;
            }
            case 'backup_delete': {
                $id = $_POST['id'] ?? '';
                $b = one("SELECT file_path FROM backups WHERE id=?", [$id]);
                if ($b) @unlink($b['file_path']);
                q("DELETE FROM backups WHERE id=?", [$id]);
                flash('Backup removido.', 'success');
                break;
            }

            case 'role_approve': {
                $id  = $_POST['id'] ?? '';
                $rr  = one("SELECT * FROM role_requests WHERE id=?", [$id]);
                if (!$rr) throw new RuntimeException('Solicitação não encontrada.');
                if ($rr['status'] !== 'pending') throw new RuntimeException('Já decidida.');
                if ($rr['requested_role'] === 'ti' && !is_owner($rr['user_id']))
                    throw new RuntimeException('O papel TI - Dev é exclusivo do administrador do sistema.');
                $userRow = one("SELECT name, role FROM users WHERE user_id=?", [$rr['user_id']]);
                tx(function () use ($rr, $userRow, $u, $id) {
                    q("UPDATE users SET role=? WHERE user_id=?",
                      [$rr['requested_role'], $rr['user_id']]);
                    q("UPDATE role_requests SET status='approved',
                       decided_by=?, decided_at=? WHERE id=?",
                       [$u['name'], now_iso(), $id]);
                    q("INSERT INTO role_history
                         (id, user_id, name, from_role, to_role, changed_by, changed_at, reason)
                       VALUES (?,?,?,?,?,?,?,?)",
                       [uid(), $rr['user_id'], $userRow['name'],
                        $userRow['role'], $rr['requested_role'],
                        $u['name'], now_iso(),
                        'Promoção aprovada via admin.php']);
                    q("INSERT INTO notifications
                         (id, message, type, for_user, created_at)
                       VALUES (?,?,?,?,?)",
                       [uid(),
                        'Sua promoção para ' . strtoupper($rr['requested_role']) . ' foi APROVADA.',
                        'success', $userRow['name'], now_iso()]);
                });
                flash('Promoção aprovada. Usuário agora é ' . strtoupper($rr['requested_role']) . '.', 'success');
                break;
            }
            case 'role_reject': {
                $id     = $_POST['id'] ?? '';
                $reason = trim($_POST['reason'] ?? '');
                $rr = one("SELECT * FROM role_requests WHERE id=?", [$id]);
                if (!$rr) throw new RuntimeException('Solicitação não encontrada.');
                q("UPDATE role_requests SET status='rejected',
                   decided_by=?, decided_at=?, decision_reason=? WHERE id=?",
                   [$u['name'], now_iso(), $reason, $id]);
                $userRow = one("SELECT name FROM users WHERE user_id=?", [$rr['user_id']]);
                if ($userRow) {
                    q("INSERT INTO notifications
                         (id, message, type, for_user, created_at)
                       VALUES (?,?,?,?,?)",
                       [uid(),
                        'Sua solicitação de promoção foi recusada.' . ($reason ? " Motivo: $reason" : ''),
                        'warn', $userRow['name'], now_iso()]);
                }
                flash('Solicitação recusada.', 'success');
                break;
            }
        }
    } catch (Throwable $e) {
        flash($e->getMessage(), 'error');
    }
    redirect('admin.php');
}

$flash        = get_flash();

/* ── Usuários: busca + paginação (escala para milhares) ── */
$uSearch   = trim($_GET['usearch'] ?? '');
$uPerPage  = 25;
$uPage     = max(1, (int)($_GET['upage'] ?? 1));
$uWhere    = '';
$uParams   = [];
if ($uSearch !== '') {
    $uWhere  = "WHERE name LIKE ? OR email LIKE ?";
    $uParams = ["%$uSearch%", "%$uSearch%"];
}
$uTotal    = (int)scalar("SELECT COUNT(*) FROM users $uWhere", $uParams);
$uPages    = max(1, (int)ceil($uTotal / $uPerPage));
$uPage     = min($uPage, $uPages);
$uOffset   = ($uPage - 1) * $uPerPage;
$users     = all("SELECT user_id, name, email, role, is_active, total_logins, last_login
                  FROM users $uWhere ORDER BY name LIMIT $uPerPage OFFSET $uOffset", $uParams);
$columns      = all("SELECT * FROM columns ORDER BY position");
$mainten      = one("SELECT * FROM maintenance_mode WHERE id=1");
$goals        = one("SELECT weekly, monthly FROM team_goals WHERE id=1");
$cardFieldsRaw = scalar("SELECT value FROM system_config WHERE key='card_fields'");
$cardFields    = $cardFieldsRaw ? (json_decode($cardFieldsRaw, true) ?: []) : [];
$backupsList  = all("SELECT id, label, created_at, created_by, revision, card_count, auto
                    FROM backups ORDER BY created_at DESC LIMIT 30");
$roleRequests = all("SELECT rr.*, u.name AS user_name, u.role AS current_role
                     FROM role_requests rr
                     JOIN users u ON u.user_id = rr.user_id
                     ORDER BY CASE WHEN rr.status='pending' THEN 0 ELSE 1 END, rr.requested_at DESC");
$pendingRoles = count(array_filter($roleRequests, fn($r) => $r['status'] === 'pending'));
$totalUsers   = count($users);
$totalCards   = (int)scalar("SELECT COUNT(*) FROM cards WHERE archived=0");
$totalBackups = count($backupsList);

/* ── Feriados / dias facultativos (editáveis por TI-Dev e TI-Sup) ── */
$holidaysList = holidays_all();
$MESES_PT = [1=>'Jan',2=>'Fev',3=>'Mar',4=>'Abr',5=>'Mai',6=>'Jun',7=>'Jul',8=>'Ago',9=>'Set',10=>'Out',11=>'Nov',12=>'Dez'];
$KIND_LABEL = ['feriado'=>'Feriado','facultativo'=>'Facultativo','compensacao'=>'Compensação'];
$KIND_COLOR = ['feriado'=>'var(--danger)','facultativo'=>'var(--warning)','compensacao'=>'var(--info)'];

/* ── Copa do Mundo (#6) — jogos do Brasil + placar (TI-Dev e TI-Sup) ── */
$wcEnabled = scalar("SELECT value FROM system_config WHERE key='worldcup_enabled'") === '1';
$wcMatches = all("SELECT * FROM worldcup_matches ORDER BY match_date, match_time, position");

/* ── Armazenamento (consumo + explorador de cards por equipe/usuário) ──
   Protegido: se o 2º banco (photos.db) não puder ser aberto no servidor,
   o painel NÃO quebra (500) — mostra um aviso e segue funcionando. */
$storageError = null;
try {
    $storage      = storage_overview();
    $storageFiles = storage_all_files();   // todos os anexos (BLOBs)
} catch (Throwable $e) {
    $storageError = $e->getMessage();
    $storage = ['teams'=>[], 'userPhotos'=>['bytes'=>0,'count'=>0],
                'totals'=>['files'=>0,'teamPhotos'=>0,'userPhotos'=>0,'all'=>0],
                'dbFiles'=>['main'=>0,'photos'=>0]];
    $storageFiles = [];
}

$teamNames  = []; $teamIcons = [];
foreach (all("SELECT id, name, icon FROM teams") as $t) { $teamNames[$t['id']] = $t['name']; $teamIcons[$t['id']] = $t['icon']; }
$teamNameOf = function($id) use ($teamNames) {
    if ($id === '—' || $id === '' || $id === null) return 'Sem equipe / pessoal';
    return $teamNames[$id] ?? $id;
};
$fmtBytes = function($n) {
    $n = (float)$n;
    if ($n < 1024) return $n . ' B';
    if ($n < 1048576) return number_format($n/1024, 1) . ' KB';
    if ($n < 1073741824) return number_format($n/1048576, 1) . ' MB';
    return number_format($n/1073741824, 2) . ' GB';
};

/* Explorador: TODOS os cards do sistema (mesmo sem anexos) agrupados por equipe →
   assim o TI-Dev consegue acessar/gerenciar QUALQUER card, com ou sem anexos. */
$filesByCard = [];
foreach ($storageFiles as $f) { $filesByCard[$f['card_id']][] = $f; }

$storageTree = [];   // teamKey => ['bytes','count','cards'=>[cardId=>['title','archived','bytes','count','files']]]
$ensureTeam = function($tk) use (&$storageTree) { if (!isset($storageTree[$tk])) $storageTree[$tk] = ['bytes'=>0,'count'=>0,'cards'=>[]]; };
$cardSeen = [];
foreach (all("SELECT id, title, team_id, archived FROM cards") as $c) {
    $tk = $c['team_id'] ?: '—'; $cid = $c['id']; $ensureTeam($tk);
    $files = $filesByCard[$cid] ?? [];
    $bytes = 0; foreach ($files as $f) $bytes += (int)$f['bytes'];
    $storageTree[$tk]['cards'][$cid] = ['title'=>$c['title'], 'archived'=>(int)$c['archived'], 'bytes'=>$bytes, 'count'=>count($files), 'files'=>$files];
    $storageTree[$tk]['bytes'] += $bytes; $storageTree[$tk]['count'] += count($files);
    $cardSeen[$cid] = true;
}
// anexos órfãos: o card foi removido, mas o BLOB ainda ocupa espaço
foreach ($storageFiles as $f) {
    $cid = $f['card_id']; if (isset($cardSeen[$cid])) continue;
    $tk = $f['team_id'] ?: '—'; $ensureTeam($tk);
    if (!isset($storageTree[$tk]['cards'][$cid])) $storageTree[$tk]['cards'][$cid] = ['title'=>'(card removido)','archived'=>0,'bytes'=>0,'count'=>0,'files'=>[]];
    $storageTree[$tk]['cards'][$cid]['bytes'] += (int)$f['bytes'];
    $storageTree[$tk]['cards'][$cid]['count']++;
    $storageTree[$tk]['cards'][$cid]['files'][] = $f;
    $storageTree[$tk]['bytes'] += (int)$f['bytes']; $storageTree[$tk]['count']++;
}
// cards mais pesados primeiro; empate → ordem alfabética
foreach ($storageTree as &$_tt) {
    uasort($_tt['cards'], fn($a,$b) => ($b['bytes'] <=> $a['bytes']) ?: strcasecmp($a['title'], $b['title']));
}
unset($_tt);

// ── Consumo por equipe (NÃO-pessoais; pessoais vão na seção de usuário) ──
$storageTeams = [];
foreach ($storage['teams'] as $tid => $su) {
    if (strpos((string)$tid, 'personal-') === 0) continue;
    $storageTeams[$tid] = $su;
}
foreach (all("SELECT id FROM teams WHERE type != 'personal' AND archived = 0") as $t) {
    if (!isset($storageTeams[$t['id']])) $storageTeams[$t['id']] = ['files'=>0,'fileCount'=>0,'photos'=>0,'total'=>0];
}
uasort($storageTeams, fn($a,$b) => $b['total'] <=> $a['total']);
$storageMax = 1;
foreach ($storageTeams as $t) { if ($t['total'] > $storageMax) $storageMax = $t['total']; }

/* ── Consumo por USUÁRIO (Kanban pessoal = "personal-<userId>" + fotos de perfil) ── */
$userPhotos = storage_user_photos();
$storageUsersRaw = [];   // userId => attach/photo/card counters + pkey
$noteUser = function($vid) use (&$storageUsersRaw) {
    if (!isset($storageUsersRaw[$vid])) $storageUsersRaw[$vid] =
        ['attachBytes'=>0,'attachCount'=>0,'photoBytes'=>0,'photoCount'=>0,'cardCount'=>0,'total'=>0,'pkey'=>'personal-'.$vid];
};
foreach ($storageTree as $tk => $tnode) {
    if (strpos((string)$tk, 'personal-') !== 0) continue;
    $vid = substr($tk, strlen('personal-'));
    $noteUser($vid);
    $storageUsersRaw[$vid]['attachBytes'] = $tnode['bytes'];
    $storageUsersRaw[$vid]['attachCount'] = $tnode['count'];
    $storageUsersRaw[$vid]['cardCount']   = count($tnode['cards']);
}
foreach ($userPhotos as $vid => $p) {
    $noteUser($vid);
    $storageUsersRaw[$vid]['photoBytes'] = $p['bytes'];
    $storageUsersRaw[$vid]['photoCount'] = $p['count'];
}
foreach ($storageUsersRaw as $vid => &$su) { $su['total'] = $su['attachBytes'] + $su['photoBytes']; }
unset($su);
// ordena por consumo; empate → quem tem mais cards
uasort($storageUsersRaw, fn($a,$b) => ($b['total'] <=> $a['total']) ?: ($b['cardCount'] <=> $a['cardCount']));
$userNames = [];
if ($storageUsersRaw) {
    $uids = array_keys($storageUsersRaw);
    $ph = implode(',', array_fill(0, count($uids), '?'));
    foreach (all("SELECT user_id, name FROM users WHERE user_id IN ($ph)", $uids) as $r) $userNames[$r['user_id']] = $r['name'];
}
$userStorageMax = 1;
foreach ($storageUsersRaw as $su) { if ($su['total'] > $userStorageMax) $userStorageMax = $su['total']; }

/* ── Insights automáticos (TI-Dev): "olhe isso aqui", "essa equipe consome muito"… ── */
$insights = [];
$allBytes = (int)$storage['totals']['all'];
$MB = 1048576; $GB = 1073741824;
$cardTitleById = [];
foreach ($storageTree as $tnode) foreach ($tnode['cards'] as $cid => $cn) if ($cn['title'] !== '(card removido)') $cardTitleById[$cid] = $cn['title'];

// 1) equipe que mais consome
$topTeamId = null; $topTeamBytes = 0;
foreach ($storageTeams as $tid => $su) { if ($tid === '—') continue; if ($su['total'] > $topTeamBytes) { $topTeamBytes = $su['total']; $topTeamId = $tid; } }
if ($topTeamId && $topTeamBytes > 0) {
    $pct = $allBytes > 0 ? round($topTeamBytes / $allBytes * 100) : 0;
    $insights[] = ['level' => $pct >= 50 ? 'warn' : 'info', 'icon' => '📊',
        'text' => "A equipe <strong>" . san($teamNameOf($topTeamId)) . "</strong> é a que mais consome: <strong>" . $fmtBytes($topTeamBytes) . "</strong>" . ($pct > 0 ? " (~{$pct}% do total)" : "") . "."];
}
// 2) maior anexo do sistema
if (!empty($storageFiles) && (int)$storageFiles[0]['bytes'] >= 2 * $MB) {
    $f = $storageFiles[0]; $ct = $cardTitleById[$f['card_id']] ?? '(card removido)';
    $insights[] = ['level' => (int)$f['bytes'] >= 10 * $MB ? 'alert' : 'info', 'icon' => '📎',
        'text' => "Olhe isto: o maior anexo é <strong>" . san($f['name']) . "</strong> (" . $fmtBytes($f['bytes']) . "), no card <strong>" . san($ct) . "</strong>."];
}
// 3) card que mais concentra anexos
$topCard = null;
foreach ($storageTree as $tnode) foreach ($tnode['cards'] as $cid => $cn) { if ($cn['bytes'] > 0 && (!$topCard || $cn['bytes'] > $topCard['bytes'])) $topCard = ['title' => $cn['title'], 'bytes' => $cn['bytes'], 'count' => $cn['count']]; }
if ($topCard && $topCard['count'] >= 2) {
    $insights[] = ['level' => 'info', 'icon' => '🗂️',
        'text' => "O card <strong>" . san($topCard['title']) . "</strong> concentra <strong>" . $fmtBytes($topCard['bytes']) . "</strong> em " . (int)$topCard['count'] . " anexos."];
}
// 4) anexos órfãos (card já removido)
$orphBytes = 0; $orphCount = 0;
foreach ($storageTree as $tnode) foreach ($tnode['cards'] as $cn) { if ($cn['title'] === '(card removido)') { $orphBytes += $cn['bytes']; $orphCount += $cn['count']; } }
if ($orphCount > 0) {
    $insights[] = ['level' => 'warn', 'icon' => '🧹',
        'text' => "<strong>{$orphCount}</strong> anexo" . ($orphCount > 1 ? 's' : '') . " órfão" . ($orphCount > 1 ? 's' : '') . " (de cards já excluídos) ocupando <strong>" . $fmtBytes($orphBytes) . "</strong> — dá para liberar."];
}
// 5) anexos grandes (> 5 MB)
$big = 0; foreach ($storageFiles as $f) if ((int)$f['bytes'] > 5 * $MB) $big++;
if ($big > 0) $insights[] = ['level' => 'info', 'icon' => '⚠️', 'text' => "Há <strong>{$big}</strong> anexo" . ($big > 1 ? 's' : '') . " acima de 5 MB."];
// 6) fotos de perfil dominando
$up = (int)$storage['totals']['userPhotos'];
if ($allBytes > 0 && $up > 0 && $up / $allBytes >= 0.3) {
    $insights[] = ['level' => 'info', 'icon' => '🖼️', 'text' => "Fotos de perfil são <strong>" . round($up / $allBytes * 100) . "%</strong> do armazenamento (" . $fmtBytes($up) . ")."];
}
// 7) maior consumidor individual
foreach ($storageUsersRaw as $vid => $su) { if ($su['total'] > 0) { $insights[] = ['level' => 'info', 'icon' => '👤', 'text' => "Maior consumidor individual: <strong>" . san($userNames[$vid] ?? $vid) . "</strong> (" . $fmtBytes($su['total']) . ")."]; break; } }
// 8) banco de mídia grande
$photosDb = (int)$storage['dbFiles']['photos'];
if ($photosDb >= 200 * $MB) {
    $insights[] = ['level' => $photosDb >= $GB ? 'alert' : 'warn', 'icon' => '💽',
        'text' => "O banco de mídia já está em <strong>" . $fmtBytes($photosDb) . "</strong>. Considere arquivar/limpar anexos antigos."];
}
// ordena por severidade (alert → warn → info)
$sevRank = ['alert' => 0, 'warn' => 1, 'info' => 2];
usort($insights, fn($a, $b) => $sevRank[$a['level']] <=> $sevRank[$b['level']]);

/* Drill-down de um nó: lista TODOS os cards. Cards com anexos são expansíveis
   (com a lista de arquivos + exclusão); cards sem anexos aparecem como linha
   simples — visíveis/acessíveis, mas sem nada a remover. */
$renderDrill = function(array $node) use ($isDev, $fmtBytes) {
    foreach ($node['cards'] as $ck => $cnode):
        $title  = $cnode['title'];
        $isArch = !empty($cnode['archived']);
        $tag    = $isArch ? ' <span class="stx-tag">arquivado</span>' : '';
        $hay    = mb_strtolower($title . ' ' . implode(' ', array_map(fn($x)=>$x['name'], $cnode['files'])));
        if ((int)$cnode['count'] > 0): ?>
          <details class="stx-card" data-key="card:<?= san($ck) ?>" data-search="<?= san($hay) ?>">
            <summary>
              <span class="stx-caret">▸</span>
              <span class="stx-card-name">📇 <?= san($title) . $tag ?></span>
              <span class="stx-meta"><?= (int)$cnode['count'] ?> arq.</span>
              <span class="stx-size"><?= $fmtBytes($cnode['bytes']) ?></span>
              <?php if ($isDev): ?>
                <form method="post" class="stx-inline-form needs-confirm" onclick="event.stopPropagation()" data-confirm="<?= san('Excluir TODOS os anexos do card «' . $title . '»?') ?>">
                  <input type="hidden" name="action" value="storage_purge_card">
                  <input type="hidden" name="card_id" value="<?= san($ck) ?>">
                  <button class="btn btn-xs btn-ghost stx-danger" title="Limpar anexos deste card">🗑 card</button>
                </form>
              <?php endif; ?>
            </summary>
            <ul class="stx-files">
              <?php foreach ($cnode['files'] as $f): ?>
                <li class="stx-file">
                  <span class="stx-file-name" title="<?= san($f['mime']) ?>">📎 <?= san($f['name']) ?></span>
                  <span class="stx-file-by"><?= san($f['uploaded_by'] ?? '—') ?></span>
                  <span class="stx-file-size"><?= $fmtBytes($f['bytes']) ?></span>
                  <span class="stx-file-acts">
                      <?php if ($isDev): ?>
                      <form method="post" class="stx-inline-form needs-confirm" data-confirm="<?= san('Excluir o anexo «' . $f['name'] . '»?') ?>">
                        <input type="hidden" name="action" value="storage_delete_file">
                        <input type="hidden" name="file_id" value="<?= san($f['id']) ?>">
                        <button class="btn btn-xs btn-ghost stx-danger" title="Excluir este anexo">🗑</button>
                      </form>
                    <?php endif; ?>
                  </span>
                </li>
              <?php endforeach; ?>
            </ul>
          </details>
        <?php else: ?>
          <div class="stx-card stx-card-empty" data-search="<?= san($hay) ?>">
            <span class="stx-card-name">📄 <?= san($title) . $tag ?></span>
            <span class="stx-meta">sem anexos</span>
            <span class="stx-size">—</span>
          </div>
        <?php endif;
    endforeach;
};
?>
<!DOCTYPE html>
<html lang="pt-BR" data-theme="light">
<?php require __DIR__ . '/partials/_head.php'; ?>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-logo">
          <img src="<?= url('imagens/logo/logomarca.png') ?>" alt="Syncro Flow">
        </div>
        <div class="mode-pill view" style="background:rgba(255, 193, 0, 0.25); color:#F2BF3D; border-color:rgba(255, 193, 0, 0.5);">
          <span class="dot"></span>
          <span>ADMINISTRAÇÃO</span>
        </div>
      </div>

      <nav class="nav">
        <div class="nav-section-label">Geral</div>
        <a href="<?= url('app.php') ?>" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Voltar ao app
        </a>

        <div class="nav-section-label">Configurações</div>
        <a href="#users"        class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M1 20c0-3.3 3.1-6 8-6"/><path d="M23 20c0-3.3-3.1-6-8-6"/></svg>
          Usuários <span class="nav-badge"><?= $totalUsers ?></span>
        </a>
        <a href="#storage" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></svg>
          Armazenamento <span class="nav-badge"><?= $fmtBytes($storage['totals']['all']) ?></span>
        </a>
        <a href="#holidays" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          Feriados <span class="nav-badge"><?= count($holidaysList) ?></span>
        </a>
        <a href="#worldcup" class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3l2.5 5.5L21 9l-4.5 4 1.5 6L12 16l-6 3 1.5-6L3 9l6.5-.5z"/></svg>
          Copa do Mundo <span class="nav-badge"><?= $wcEnabled ? 'ON' : count($wcMatches) ?></span>
        </a>
        <?php if ($isDev): ?>
        <a href="#backup-key"  class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Chave de backup
        </a>
        <a href="#maintenance"  class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Manutenção
        </a>
        <a href="#backups"      class="nav-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/></svg>
          Backups <span class="nav-badge"><?= $totalBackups ?></span>
        </a>
        <?php endif; ?>
      </nav>

      <div class="sidebar-footer">
        <div class="user-card">
          <div class="avatar"><?= san(strtoupper(substr($u['name'] ?? '?', 0, 1))) ?></div>
          <div class="user-info">
            <strong><?= san($u['name']) ?></strong>
            <span class="role-badge role-ti">TI</span>
          </div>
        </div>
        <div class="sidebar-actions">
          <a class="icon-btn" href="<?= url('logout.php') ?>" title="Sair">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
          </a>
        </div>
        <div class="dev-signature">SF · AG · ADMIN</div>
      </div>
    </aside>

    <main class="main">
      <div class="topbar">
        <div class="page-title-block">
          <span class="crumb">SyncroFlow</span>
          <h1>⚙️ Administração</h1>
        </div>
        <div class="topbar-spacer"></div>
        <span class="conn-state">
          <span class="conn-dot conn-ok"></span> Painel TI
        </span>
      </div>

      <div class="content">
        <?php if ($flash): ?>
          <div class="banner <?= san($flash['type']) ?>"><?= san($flash['msg']) ?></div>
        <?php endif; ?>

        <!-- KPIs admin -->
        <div class="adm-kpis">
          <div class="adm-kpi"><div class="adm-kpi-label">Usuários</div><div class="adm-kpi-value"><?= $totalUsers ?></div></div>
          <div class="adm-kpi"><div class="adm-kpi-label">Cards ativos</div><div class="adm-kpi-value"><?= $totalCards ?></div></div>
          <div class="adm-kpi"><div class="adm-kpi-label">Colunas</div><div class="adm-kpi-value"><?= count($columns) ?></div></div>
          <div class="adm-kpi"><div class="adm-kpi-label">Armazenamento</div><div class="adm-kpi-value" style="font-size:20px;"><?= $fmtBytes($storage['totals']['all']) ?></div></div>
        </div>

        <!-- ─── USUÁRIOS ─── -->
        <details id="users" class="adm-section adm-foldable" data-fold="users" <?= $uSearch !== '' ? 'open data-fold-forceopen' : '' ?>>
          <summary class="adm-section-header">
            <span class="adm-fold-caret">▸</span>
            <h2>👥 Usuários cadastrados</h2>
            <span class="adm-badge"><?= $totalUsers ?></span>
          </summary>
          <div class="adm-section-body">
            <form method="get" class="adm-user-search">
              <input class="input" type="search" name="usearch" value="<?= san($uSearch) ?>" placeholder="🔍 Buscar por nome…">
              <button class="btn btn-secondary">Buscar</button>
              <?php if ($uSearch !== ''): ?><a class="btn btn-ghost" href="?#users">Limpar</a><?php endif; ?>
              <span class="adm-user-count"><?= $uTotal ?> resultado<?= $uTotal!=1?'s':'' ?> · página <?= $uPage ?>/<?= $uPages ?></span>
            </form>
            <table class="adm-table">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Logins</th><th>Último acesso</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                <?php foreach ($users as $usr): ?>
                  <tr>
                    <td class="adm-user-name"><strong title="<?= san($usr['name']) ?>"><?= san($usr['name']) ?></strong></td>
                    <td style="font-size:12px;color:var(--text-muted);"><?= san($usr['email'] ?: '—') ?></td>
                    <td>
                      <form method="post" style="display:inline-flex;gap:6px;align-items:center;">
                        <input type="hidden" name="action" value="user_role">
                        <input type="hidden" name="user_id" value="<?= san($usr['user_id']) ?>">
                        <?php /* TI-Dev é EXCLUSIVO do dono: ele só vê 'ti' e fica travado;
                                  os demais só podem ser Usuário Padrão ou TI-Sup. */
                              $isOwnerRow = is_owner($usr['user_id']);
                              $roleOpts = $isOwnerRow ? ['ti'] : ['analista','suporte']; ?>
                        <select name="role" class="adm-select-inline" <?= $isOwnerRow ? 'disabled title="O administrador do sistema é sempre TI - Dev"' : '' ?>>
                          <?php foreach ($roleOpts as $r): ?>
                            <option value="<?= san($r) ?>" <?= $r===$usr['role']?'selected':'' ?>><?= san(ROLE_LABELS[$r] ?? $r) ?></option>
                          <?php endforeach; ?>
                        </select>
                        <?php if (!$isOwnerRow): ?><button class="btn btn-sm btn-ghost" title="Aplicar mudança">✓</button><?php endif; ?>
                      </form>
                    </td>
                    <td><?= (int)$usr['total_logins'] ?></td>
                    <td style="font-size:11px;color:var(--text-muted);"><?= san($usr['last_login'] ? date('d/m/Y H:i', strtotime($usr['last_login'])) : '—') ?></td>
                    <td>
                      <?php if ($usr['is_active']): ?>
                        <span class="adm-pill adm-pill-ok">ATIVO</span>
                      <?php else: ?>
                        <span class="adm-pill adm-pill-off">INATIVO</span>
                      <?php endif; ?>
                    </td>
                    <td>
                      <form method="post" style="display:inline;" class="needs-confirm"
                            data-confirm="<?= $usr['is_active'] ? san('Desativar a conta de ' . $usr['name'] . '? Ela não poderá mais entrar até ser reativada.') : san('Reativar a conta de ' . $usr['name'] . '?') ?>">
                        <input type="hidden" name="action" value="user_toggle">
                        <input type="hidden" name="user_id" value="<?= san($usr['user_id']) ?>">
                        <?php if ($usr['is_active']): ?>
                          <button class="btn btn-sm btn-ghost stx-danger" title="Desativar conta (bloquear acesso)">🚫 Desativar</button>
                        <?php else: ?>
                          <button class="btn btn-sm btn-ghost" style="color:var(--success);" title="Reativar conta (liberar acesso)">✅ Reativar</button>
                        <?php endif; ?>
                      </form>
                      <form method="post" style="display:inline;" onsubmit="this.new_name.value=prompt('Novo nome do usuário:'); return this.new_name.value!==null && this.new_name.value.trim().length>0;">
                        <input type="hidden" name="action" value="user_rename">
                        <input type="hidden" name="user_id" value="<?= san($usr['user_id']) ?>">
                        <input type="hidden" name="new_name" value="">
                        <button class="btn btn-sm btn-ghost" title="Editar nome">✏️</button>
                      </form>
                      <form method="post" style="display:inline;" onsubmit="this.new_password.value=prompt('Nova senha (mín 6):'); return !!this.new_password.value && this.new_password.value.length>=6;">
                        <input type="hidden" name="action" value="user_reset_pwd">
                        <input type="hidden" name="user_id" value="<?= san($usr['user_id']) ?>">
                        <input type="hidden" name="new_password" value="">
                        <button class="btn btn-sm btn-ghost" title="Resetar senha">🔑</button>
                      </form>
                      <?php if (( $isDev || ($u['role'] === 'suporte') ) && !$isOwnerRow): ?>
                        <form method="post" style="display:inline;" class="needs-confirm" data-confirm="<?= san('Excluir este usuário? Esta ação é irreversível.') ?>">
                          <input type="hidden" name="action" value="user_delete">
                          <input type="hidden" name="user_id" value="<?= san($usr['user_id']) ?>">
                          <button class="btn btn-sm btn-ghost stx-danger" title="Excluir usuário">🗑</button>
                        </form>
                      <?php endif; ?>
                    </td>
                  </tr>
                <?php endforeach; ?>
                <?php if (!$users): ?><tr><td colspan="7" class="adm-empty">Nenhum usuário encontrado.</td></tr><?php endif; ?>
              </tbody>
            </table>

            <?php if ($uPages > 1):
              $qbase = $uSearch !== '' ? 'usearch='.urlencode($uSearch).'&' : ''; ?>
              <div class="adm-pager">
                <a class="btn btn-sm btn-ghost <?= $uPage<=1?'is-disabled':'' ?>" href="?<?= $qbase ?>upage=<?= max(1,$uPage-1) ?>#users">← Anterior</a>
                <span class="adm-pager-info">Página <?= $uPage ?> de <?= $uPages ?></span>
                <a class="btn btn-sm btn-ghost <?= $uPage>=$uPages?'is-disabled':'' ?>" href="?<?= $qbase ?>upage=<?= min($uPages,$uPage+1) ?>#users">Próxima →</a>
              </div>
            <?php endif; ?>

            <details class="adm-collapse">
              <summary>+ Criar novo usuário</summary>
              <form method="post" class="adm-form">
                <input type="hidden" name="action" value="user_create">
                <div class="adm-form-grid">
                  <div class="field"><label>Nome completo</label><input class="input" name="name" required></div>
                  <div class="field"><label>E-mail</label><input class="input" type="email" name="email" required maxlength="160" placeholder="usuario@exemplo.com"></div>
                  <div class="field"><label>Senha</label><input class="input" type="password" name="password" required minlength="8"></div>
                  <div class="field">
                    <label>Papel inicial</label>
                    <select class="select" name="role">
                      <?php /* Criação NUNCA oferece TI-Dev — ele é exclusivo do dono. */
                          foreach (['analista','suporte'] as $r): ?>
                        <option value="<?= san($r) ?>" <?= $r==='analista'?'selected':'' ?>><?= san(ROLE_LABELS[$r] ?? $r) ?></option>
                      <?php endforeach; ?>
                    </select>
                  </div>
                </div>
                <button class="btn btn-primary">+ Criar usuário</button>
              </form>
            </details>
          </div>
        </details>

        <!-- ─── FERIADOS E DIAS FACULTATIVOS (TI-Dev + TI-Sup) ─── -->
        <details id="holidays" class="adm-section adm-foldable" data-fold="holidays">
          <summary class="adm-section-header">
            <span class="adm-fold-caret">▸</span>
            <h2>📅 Feriados e dias facultativos</h2>
            <span class="adm-badge"><?= count($holidaysList) ?></span>
          </summary>
          <div class="adm-section-body">
            <p class="adm-hint" style="margin-top:0;">
              Cadastre aqui os feriados <strong>municipais</strong>, <strong>dias facultativos</strong> e <strong>compensações</strong> —
              não precisa mais editar o código a cada virada de ano. Os feriados nacionais e os móveis
              (Carnaval, Páscoa, Corpus Christi…) já são calculados automaticamente.
              Deixe a <strong>cidade em branco</strong> para valer em todas.
            </p>

            <table class="adm-table">
              <thead><tr><th>Quando</th><th>Nome</th><th>Tipo</th><th>Cidade</th><th></th></tr></thead>
              <tbody>
                <?php foreach ($holidaysList as $h):
                    $quando = (int)$h['recurring'] === 1
                        ? sprintf('%02d/%s', (int)$h['day'], $MESES_PT[(int)$h['month']] ?? '?') . ' <span class="text-muted">(todo ano)</span>'
                        : san(date('d/m/Y', strtotime((string)$h['date']))); ?>
                  <tr>
                    <td><?= $quando ?></td>
                    <td><strong><?= san($h['name']) ?></strong></td>
                    <td><span class="adm-pill" style="background:var(--surface-2);color:<?= $KIND_COLOR[$h['kind']] ?? 'var(--text)' ?>;border:1px solid var(--border);"><?= san($KIND_LABEL[$h['kind']] ?? $h['kind']) ?></span></td>
                    <td><?= $h['city'] !== '' ? san($h['city']) : '<span class="text-muted">Todas</span>' ?></td>
                    <td>
                      <form method="post" style="display:inline;" class="needs-confirm" data-confirm="<?= san('Remover «' . $h['name'] . '» do calendário?') ?>">
                        <input type="hidden" name="action" value="holiday_delete">
                        <input type="hidden" name="id" value="<?= san($h['id']) ?>">
                        <button class="btn btn-sm btn-ghost stx-danger" title="Remover">🗑</button>
                      </form>
                    </td>
                  </tr>
                <?php endforeach; ?>
                <?php if (!$holidaysList): ?><tr><td colspan="5" class="adm-empty">Nenhum feriado cadastrado.</td></tr><?php endif; ?>
              </tbody>
            </table>

            <details class="adm-collapse">
              <summary>+ Adicionar feriado / dia facultativo</summary>
              <form method="post" class="adm-form">
                <input type="hidden" name="action" value="holiday_create">
                <div class="adm-form-grid">
                  <div class="field"><label>Nome</label><input class="input" name="name" required maxlength="80" placeholder="Ex: Aniversário da cidade"></div>
                  <div class="field">
                    <label>Tipo</label>
                    <select class="select" name="kind">
                      <option value="feriado">Feriado</option>
                      <option value="facultativo">Dia facultativo</option>
                      <option value="compensacao">Compensação</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Abrangência</label>
                    <select class="select" name="scope">
                      <option value="municipal">Municipal</option>
                      <option value="estadual">Estadual</option>
                      <option value="nacional">Nacional</option>
                    </select>
                  </div>
                  <div class="field"><label>Cidade <span class="text-muted">(vazio = todas)</span></label>
                    <input class="input" name="city" maxlength="60" placeholder="Ex: São Paulo" list="hol-cities" autocomplete="off">
                    <datalist id="hol-cities"><?php foreach (holidays_cities() as $c): ?><option value="<?= san($c) ?>"></option><?php endforeach; ?></datalist>
                  </div>
                </div>
                <div class="adm-form-grid">
                  <div class="field"><label>Dia</label><input class="input" type="number" name="day" min="1" max="31" placeholder="1–31"></div>
                  <div class="field">
                    <label>Mês <span class="text-muted">(repete todo ano)</span></label>
                    <select class="select" name="month">
                      <option value="">—</option>
                      <?php foreach ($MESES_PT as $mn => $ml): ?><option value="<?= $mn ?>"><?= $mn ?> · <?= $ml ?></option><?php endforeach; ?>
                    </select>
                  </div>
                  <div class="field" style="grid-column:span 2;">
                    <label>…ou data específica <span class="text-muted">(só este ano)</span></label>
                    <input class="input" type="date" name="date">
                  </div>
                </div>
                <p class="adm-hint" style="margin:0 0 10px;">Use <strong>Dia + Mês</strong> para feriados que repetem todo ano, ou a <strong>data específica</strong> para algo pontual (ex.: uma compensação só deste ano).</p>
                <button class="btn btn-primary">+ Adicionar</button>
              </form>
            </details>

            <details class="adm-collapse">
              <summary>📋 Importar do Excel (copiar e colar)</summary>
              <form method="post" class="adm-form">
                <input type="hidden" name="action" value="holiday_import">
                <p class="adm-hint" style="margin-top:0;">
                  Copie as colunas no Excel e cole abaixo. Uma data por linha, colunas separadas por
                  <strong>TAB</strong> (cola do Excel), <code>;</code> ou <code>,</code>, nesta ordem:
                  <strong>Data · Nome · Tipo · Cidade</strong>.<br>
                  • <strong>Data</strong>: <code>DD/MM</code> (repete todo ano) · <code>DD/MM/AAAA</code> ou <code>AAAA-MM-DD</code> (data única).<br>
                  • <strong>Tipo</strong> (opcional): feriado · facultativo · compensação. &nbsp; • <strong>Cidade</strong> (opcional): vazio = todas.<br>
                  • Se o <strong>mesmo dia + cidade</strong> repetir, o sistema <strong>ignora</strong> e mantém só um.
                </p>
                <textarea name="bulk" rows="8" style="width:100%;font-family:var(--mono,monospace);font-size:12.5px;"
                  placeholder="20/01&#9;Aniversário da Cidade&#9;feriado&#9;São Paulo&#10;08/12&#9;Padroeira da Cidade&#9;feriado&#9;São Paulo&#10;12/10/2026&#9;Compensação&#9;compensação&#9;Rio de Janeiro"></textarea>
                <button class="btn btn-primary" style="margin-top:10px;">📥 Importar lista</button>
              </form>
            </details>
          </div>
        </details>

        <!-- ─── COPA DO MUNDO (TI-Dev + TI-Sup) ─── -->
        <details id="worldcup" class="adm-section adm-foldable" data-fold="worldcup">
          <summary class="adm-section-header">
            <span class="adm-fold-caret">▸</span>
            <h2>⚽ Copa do Mundo</h2>
            <span class="adm-badge" style="<?= $wcEnabled ? 'background:var(--success-soft);color:var(--success);' : '' ?>"><?= $wcEnabled ? 'Modo Copa ON' : 'desligado' ?></span>
          </summary>
          <div class="adm-section-body">
            <p class="adm-hint" style="margin-top:0;">
              Cadastre os <strong>jogos do Brasil</strong> e os <strong>placares</strong> que aparecem no Calendário de todos.
              O placar é preenchido <strong>à mão</strong> após cada jogo — o servidor não acessa APIs de esporte na internet.
              Ligue o <strong>Modo Copa</strong> só na época da Copa; desligado, os jogos somem do Calendário.
            </p>

            <form method="post" class="adm-form" style="margin-bottom:14px;">
              <input type="hidden" name="action" value="wc_toggle">
              <input type="hidden" name="enabled" value="<?= $wcEnabled ? '0' : '1' ?>">
              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <span class="adm-pill" style="background:<?= $wcEnabled?'var(--success-soft)':'var(--surface-2)' ?>;color:<?= $wcEnabled?'var(--success)':'var(--text-muted)' ?>;border:1px solid var(--border);">
                  <?= $wcEnabled ? '🟢 Modo Copa LIGADO' : '⚪ Modo Copa desligado' ?>
                </span>
                <button class="btn btn-sm <?= $wcEnabled?'btn-ghost':'btn-primary' ?>"><?= $wcEnabled ? 'Desligar' : 'Ligar agora' ?></button>
              </div>
            </form>

            <table class="adm-table">
              <thead><tr><th>Data</th><th>Hora</th><th>Jogo</th><th>Fase</th><th title="É jogo do Brasil?">🇧🇷</th><th>Placar</th><th></th></tr></thead>
              <tbody>
                <?php foreach ($wcMatches as $g): $fid = 'wcedit-' . san($g['id']); ?>
                  <tr>
                    <td>
                      <form id="<?= $fid ?>" method="post">
                        <input type="hidden" name="action" value="wc_save">
                        <input type="hidden" name="id" value="<?= san($g['id']) ?>">
                      </form>
                      <input class="input" type="date" name="match_date" form="<?= $fid ?>" value="<?= san($g['match_date']) ?>" required style="min-width:140px;">
                    </td>
                    <td><input class="input" name="match_time" form="<?= $fid ?>" value="<?= san($g['match_time']) ?>" placeholder="19:00" style="width:72px;"></td>
                    <td><input class="input" name="name" form="<?= $fid ?>" value="<?= san($g['name']) ?>" required style="min-width:160px;"></td>
                    <td><input class="input" name="stage" form="<?= $fid ?>" value="<?= san($g['stage']) ?>" style="min-width:120px;"></td>
                    <td style="text-align:center;"><input type="checkbox" name="brazil" value="1" form="<?= $fid ?>" <?= (int)$g['brazil']===1?'checked':'' ?>></td>
                    <td><input class="input" name="result" form="<?= $fid ?>" value="<?= san($g['result']) ?>" placeholder="3 × 0" style="width:84px;"></td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-sm btn-primary" form="<?= $fid ?>" title="Salvar">💾</button>
                      <form method="post" style="display:inline;" class="needs-confirm" data-confirm="<?= san('Remover «' . $g['name'] . '»?') ?>">
                        <input type="hidden" name="action" value="wc_delete">
                        <input type="hidden" name="id" value="<?= san($g['id']) ?>">
                        <button class="btn btn-sm btn-ghost stx-danger" title="Remover">🗑</button>
                      </form>
                    </td>
                  </tr>
                <?php endforeach; ?>
                <?php if (!$wcMatches): ?><tr><td colspan="7" class="adm-empty">Nenhum jogo cadastrado.</td></tr><?php endif; ?>
              </tbody>
            </table>

            <details class="adm-collapse">
              <summary>+ Adicionar jogo</summary>
              <form method="post" class="adm-form">
                <input type="hidden" name="action" value="wc_save">
                <div class="adm-form-grid">
                  <div class="field"><label>Data</label><input class="input" type="date" name="match_date" required></div>
                  <div class="field"><label>Hora</label><input class="input" name="match_time" placeholder="19:00"></div>
                  <div class="field" style="grid-column:span 2;"><label>Jogo</label><input class="input" name="name" required placeholder="Brasil x Marrocos"></div>
                </div>
                <div class="adm-form-grid">
                  <div class="field" style="grid-column:span 2;"><label>Fase <span class="text-muted">(opcional)</span></label><input class="input" name="stage" placeholder="Fase de grupos · 1ª rodada"></div>
                  <div class="field"><label>Placar <span class="text-muted">(após o jogo)</span></label><input class="input" name="result" placeholder="3 × 0"></div>
                  <div class="field"><label>Jogo do Brasil?</label><label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-weight:500;"><input type="checkbox" name="brazil" value="1" checked> 🇧🇷 Sim</label></div>
                </div>
                <button class="btn btn-primary">+ Adicionar jogo</button>
              </form>
            </details>
          </div>
        </details>

        <!-- ─── NOTA: configurações por equipe ─── -->
        <section class="adm-section">
          <div class="adm-section-body">
            <p class="adm-hint" style="margin:0;">⚙️ <strong>Configurações por equipe:</strong> metas, campos do card, campo extra (antiga "Visão") e colunas do Kanban agora são definidos por <strong>cada equipe</strong> pelo gestor ou TI da equipe em <strong>Equipes › Gerenciar › Configurações</strong>.</p>
          </div>
        </section>

        <!-- ─── ARMAZENAMENTO (TI-Dev gerencia · TI-Sup visualiza) ─── -->
        <section id="storage" class="adm-section">
          <div class="adm-section-header">
            <h2>💾 Armazenamento</h2>
            <span class="adm-badge"><?= $fmtBytes($storage['totals']['all']) ?> em uso</span>
          </div>
          <div class="adm-section-body">
            <?php if ($storageError): ?>
              <div class="adm-insight alert" style="margin-bottom:14px;">
                <span class="ai-ico">⚠️</span>
                <span>Não foi possível acessar o banco de mídia (<code>photos.db</code>). O painel de armazenamento fica indisponível, mas o resto do admin funciona normalmente.<br>
                <span class="text-muted text-sm">Detalhe: <?= san($storageError) ?></span><br>
                <span class="text-muted text-sm">Verifique se a pasta de dados (<code><?= san(dirname((string)cfg('database.photos_path'))) ?></code>) tem permissão de escrita para o usuário do IIS.</span></span>
              </div>
            <?php endif; ?>
            <?php if (!$isDev): ?>
              <p class="adm-hint" style="margin-top:0;">👁️ Você (TI&nbsp;-&nbsp;Sup) pode <strong>visualizar</strong> o consumo. Apenas o TI&nbsp;-&nbsp;Dev pode excluir arquivos.</p>
            <?php endif; ?>

            <!-- Insights automáticos -->
            <div class="adm-insights">
              <div class="adm-insights-head">🤖 Insights automáticos <span class="text-muted" style="font-weight:600;">· o sistema analisou o consumo para você</span></div>
              <?php if (empty($insights)): ?>
                <div class="adm-insight ok"><span class="ai-ico">✅</span><span>Tudo sob controle — nenhum ponto de atenção de armazenamento no momento.</span></div>
              <?php else: foreach ($insights as $ins): ?>
                <div class="adm-insight <?= san($ins['level']) ?>"><span class="ai-ico"><?= $ins['icon'] ?></span><span><?= $ins['text'] /* partes dinâmicas já sanitizadas */ ?></span></div>
              <?php endforeach; endif; ?>
            </div>

            <div class="adm-kpis" style="margin-bottom:14px;">
              <div class="adm-kpi"><div class="adm-kpi-label">Total em uso</div><div class="adm-kpi-value" style="font-size:20px;"><?= $fmtBytes($storage['totals']['all']) ?></div></div>
              <div class="adm-kpi"><div class="adm-kpi-label">Anexos</div><div class="adm-kpi-value" style="font-size:20px;"><?= $fmtBytes($storage['totals']['files']) ?></div></div>
              <div class="adm-kpi"><div class="adm-kpi-label">Imagens (equipes)</div><div class="adm-kpi-value" style="font-size:20px;"><?= $fmtBytes($storage['totals']['teamPhotos']) ?></div></div>
              <div class="adm-kpi"><div class="adm-kpi-label">Imagens (perfis)</div><div class="adm-kpi-value" style="font-size:20px;"><?= $fmtBytes($storage['totals']['userPhotos']) ?></div></div>
              <div class="adm-kpi"><div class="adm-kpi-label">Banco principal</div><div class="adm-kpi-value" style="font-size:20px;"><?= $fmtBytes($storage['dbFiles']['main']) ?></div></div>
              <div class="adm-kpi"><div class="adm-kpi-label">Banco de mídia</div><div class="adm-kpi-value" style="font-size:20px;"><?= $fmtBytes($storage['dbFiles']['photos']) ?></div></div>
            </div>

            <?php if (!empty($storageTree)): ?>
              <div class="stx-toolbar" style="margin-bottom:12px;">
                <input type="search" id="stx-search" class="input" placeholder="🔎 Buscar card ou anexo em todo o sistema…" autocomplete="off">
              </div>
            <?php endif; ?>

            <details class="adm-fold" data-fold="consumo-equipe">
              <summary class="adm-fold-head">
                <span class="adm-fold-caret">▸</span>
                <h3 class="adm-sub" style="margin:0;">Consumo por equipe</h3>
                <span class="adm-fold-count"><?= count($storageTeams) ?> equipe<?= count($storageTeams)!=1?'s':'' ?></span>
              </summary>
              <div class="adm-fold-body">
            <p class="adm-hint" style="margin:0 0 10px;">
              Clique em <strong>📇 Ver cards</strong> para abrir os cards mais pesados da equipe e remover anexos específicos.
              <?php if ($isDev): ?>Como <strong>TI&nbsp;-&nbsp;Dev</strong>, você gerencia os anexos de qualquer card <strong>mesmo sem fazer parte da equipe</strong>.<?php else: ?>(apenas o TI&nbsp;-&nbsp;Dev pode excluir).<?php endif; ?>
            </p>
            <div class="adm-storage-list" id="stx-teams">
              <?php if (empty($storageTeams)): ?>
                <p class="adm-hint" style="margin:0;">Nenhum consumo registrado ainda.</p>
              <?php endif; ?>
              <?php foreach ($storageTeams as $tid => $su): if ($tid === '—' && $su['total'] <= 0) continue; /* mostra todas as equipes, mesmo com 0 */
                      $tnode = $storageTree[$tid] ?? null; ?>
                <div class="adm-storage-row stx-consumer">
                  <div class="adm-storage-head">
                    <span class="adm-storage-name"><?= san(($teamIcons[$tid] ?? '👥')) ?> <?= san($teamNameOf($tid)) ?></span>
                    <span class="adm-storage-size"><?= $fmtBytes($su['total']) ?> <span class="text-muted">(<?= (int)$su['fileCount'] ?> anexo<?= $su['fileCount']!=1?'s':'' ?>)</span></span>
                  </div>
                  <div class="adm-storage-bar"><div class="adm-storage-fill" style="width:<?= max(2, round($su['total']/$storageMax*100)) ?>%"></div></div>
                  <div class="adm-storage-foot">
                    <?php if ($tnode && count($tnode['cards']) > 0): ?>
                      <details class="stx-drill-wrap" data-key="team:<?= san($tid) ?>">
                        <summary class="stx-drill-btn">📇 Ver cards (<?= count($tnode['cards']) ?>)</summary>
                        <div class="stx-drill"><?php $renderDrill($tnode); ?></div>
                      </details>
                    <?php else: ?>
                      <span class="text-muted text-sm">Sem cards</span>
                    <?php endif; ?>
                    <?php if ($isDev && $tid !== '—' && $su['fileCount'] > 0): ?>
                      <form method="post" class="stx-inline-form needs-confirm" data-confirm="<?= san('Excluir TODOS os anexos desta equipe? Não pode ser desfeito.') ?>">
                        <input type="hidden" name="action" value="storage_purge_team">
                        <input type="hidden" name="team_id" value="<?= san($tid) ?>">
                        <button class="btn btn-sm btn-ghost" style="color:var(--danger);">🗑 Limpar anexos</button>
                      </form>
                    <?php endif; ?>
                  </div>
                </div>
              <?php endforeach; ?>
            </div>
              </div>
            </details>

            <details class="adm-fold" data-fold="consumo-usuario" style="margin-top:12px;">
              <summary class="adm-fold-head">
                <span class="adm-fold-caret">▸</span>
                <h3 class="adm-sub" style="margin:0;">Consumo por usuário</h3>
                <span class="adm-fold-count" style="text-transform:none;letter-spacing:0;">Kanban pessoal + fotos</span>
              </summary>
              <div class="adm-fold-body">
            <div class="adm-storage-list" id="stx-users">
              <?php
                $anyUser = false;
                foreach ($storageUsersRaw as $vid => $su):
                    // mostra quem tem cards no Kanban pessoal, anexos OU fotos de perfil
                    if ($su['cardCount'] <= 0 && $su['attachCount'] <= 0 && $su['photoCount'] <= 0) continue;
                    $anyUser = true;
                    $pnode = $storageTree[$su['pkey']] ?? null;
                    $uname = $userNames[$vid] ?? $vid; ?>
                <div class="adm-storage-row stx-consumer">
                  <div class="adm-storage-head">
                    <span class="adm-storage-name">🧑 <?= san($uname) ?> <span class="text-muted text-sm">@<?= san($vid) ?></span></span>
                    <span class="adm-storage-size"><?= $fmtBytes($su['total']) ?>
                      <span class="text-muted">(anexos <?= $fmtBytes($su['attachBytes']) ?> · fotos <?= $fmtBytes($su['photoBytes']) ?>)</span></span>
                  </div>
                  <div class="adm-storage-bar"><div class="adm-storage-fill" style="width:<?= max(2, round($su['total']/$userStorageMax*100)) ?>%"></div></div>
                  <div class="adm-storage-foot">
                    <?php if ($pnode && count($pnode['cards']) > 0): ?>
                      <details class="stx-drill-wrap" data-key="user:<?= san($vid) ?>">
                        <summary class="stx-drill-btn">📇 Ver cards do Kanban (<?= count($pnode['cards']) ?>)</summary>
                        <div class="stx-drill"><?php $renderDrill($pnode); ?></div>
                      </details>
                    <?php else: ?>
                      <span class="text-muted text-sm"><?= $su['photoCount'] > 0 ? 'Apenas fotos de perfil' : 'Sem cards' ?></span>
                    <?php endif; ?>
                    <?php if ($isDev && $su['attachCount'] > 0): ?>
                      <form method="post" class="stx-inline-form needs-confirm" data-confirm="<?= san('Excluir TODOS os anexos do Kanban pessoal de «' . $uname . '»? Não pode ser desfeito.') ?>">
                        <input type="hidden" name="action" value="storage_purge_team">
                        <input type="hidden" name="team_id" value="<?= san($su['pkey']) ?>">
                        <button class="btn btn-sm btn-ghost" style="color:var(--danger);">🗑 Limpar anexos</button>
                      </form>
                    <?php endif; ?>
                  </div>
                </div>
              <?php endforeach; ?>
              <?php if (!$anyUser): ?>
                <p class="adm-hint" style="margin:0;">Nenhum consumo individual registrado ainda.</p>
              <?php endif; ?>
            </div>
              </div>
            </details>
            <p class="stx-empty adm-hint" id="stx-noresult" style="display:none;margin:10px 0 0;">Nenhum card ou anexo corresponde à busca.</p>
          </div>
        </section>

        <?php if ($isDev): ?>
        <!-- ─── CHAVE DE BACKUP (.syncroflow.key) (TI-Dev) ─── -->
        <?php $revealedKey = $_SESSION['_revealed_key'] ?? null; unset($_SESSION['_revealed_key']); ?>
        <section id="backup-key" class="adm-section">
          <div class="adm-section-header">
            <h2>🗝️ Chave de backup</h2>
            <span class="adm-badge">TI - Dev</span>
          </div>
          <div class="adm-section-body">
            <p class="adm-hint" style="margin-top:0;">
              Os backups são criptografados (AES-256-GCM) com a chave <code>.syncroflow.key</code>, guardada na pasta de dados do servidor.
              Se você <strong>não tem acesso ao servidor</strong>, use esta opção para recuperar a chave e conseguir
              restaurar/descriptografar um backup <code>.enc</code> em outro lugar. Confirme sua senha para revelar.
            </p>
            <?php if ($revealedKey): ?>
              <div class="adm-insight alert" style="margin-bottom:12px;">
                <span class="ai-ico">🔓</span>
                <span>
                  Chave (Base64) — copie e guarde com segurança. <strong>Não compartilhe.</strong>
                  <code style="display:block;margin-top:8px;padding:10px;background:var(--surface-2);border:1px dashed var(--border);border-radius:8px;word-break:break-all;user-select:all;font-size:13px;"><?= san($revealedKey) ?></code>
                </span>
              </div>
            <?php endif; ?>
            <form method="post" class="adm-form" style="max-width:420px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
              <input type="hidden" name="action" value="reveal_key">
              <div class="field" style="flex:1;min-width:220px;"><label>Sua senha (confirmação)</label>
                <input class="input" type="password" name="key_password" required autocomplete="current-password" placeholder="Senha da sua conta TI - Dev"></div>
              <button class="btn btn-secondary">🗝️ Revelar chave</button>
            </form>
          </div>
        </section>

        <!-- ─── MANUTENÇÃO DO BANCO (TI-Dev) ─── -->
        <section id="db-maint" class="adm-section">
          <div class="adm-section-header">
            <h2>🧹 Manutenção do banco</h2>
            <span class="adm-badge">TI - Dev</span>
          </div>
          <div class="adm-section-body">
            <p class="adm-hint" style="margin-top:0;">
              Remove <strong>quadros pessoais órfãos</strong> — colunas e cards que ficaram no banco de
              exclusões de usuários feitas por versões antigas (o usuário saiu, mas o quadro pessoal dele
              continuou ocupando espaço). É seguro: não toca em equipes reais nem no quadro padrão.
            </p>
            <form method="post" class="needs-confirm" data-confirm="Limpar todos os quadros pessoais de usuários que não existem mais?">
              <input type="hidden" name="action" value="cleanup_orphans">
              <button class="btn btn-secondary stx-danger">🧹 Limpar dados órfãos</button>
            </form>
          </div>
        </section>


        <!-- ─── E-MAIL (TI-Dev) ─── -->
        <?php require_once __DIR__ . '/lib/mailer.php'; $mailOn = mail_enabled(); $mailProv = mail_provider(); ?>
        <section id="email-smtp" class="adm-section">
          <div class="adm-section-header">
            <h2>✉️ E-mail (<?= $mailProv === 'graph' ? 'Microsoft 365 / Graph' : 'SMTP' ?>)</h2>
            <span class="adm-badge" style="background:<?= $mailOn ? 'var(--success-soft)' : 'var(--danger-soft)' ?>;color:<?= $mailOn ? 'var(--success)' : 'var(--danger)' ?>;"><?= $mailOn ? 'CONFIGURADO' : 'DESATIVADO' ?></span>
          </div>
          <div class="adm-section-body">
            <p class="adm-hint" style="margin-top:0;">
              Status: <strong><?= $mailOn ? 'pronto para enviar' : 'não configurado' ?></strong> ·
              Motor: <code><?= san($mailProv) ?></code> ·
              Remetente: <code><?= san(cfg('email.from','—')) ?></code>.
              <?php if ($mailProv === 'graph'): ?>
                Tenant: <code><?= cfg('email.tenant_id') ? '✓ definido' : '— vazio' ?></code> ·
                Client ID: <code><?= cfg('email.client_id') ? '✓ definido' : '— vazio' ?></code> ·
                Segredo: <code><?= cfg('email.client_secret') ? '✓ definido' : '— vazio' ?></code>.
                Preencha <code>config.json → email</code> (tenant_id / client_id / client_secret) e <code>enabled=true</code> com os dados do app do Azure (Entra ID) da sua equipe de TI.
              <?php else: ?>
                Host: <code><?= san(cfg('email.host','—') ?: '—') ?>:<?= (int)cfg('email.port',0) ?></code> ·
                Segurança: <code><?= san(cfg('email.secure','—')) ?></code>.
              <?php endif; ?>
            </p>
            <?php $emailDiag = $_SESSION['_email_diag'] ?? null; unset($_SESSION['_email_diag']); ?>
            <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
              <form method="post" class="adm-form" style="max-width:420px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin:0;">
                <input type="hidden" name="action" value="email_test">
                <div class="field" style="flex:1;min-width:220px;margin:0;"><label>Enviar teste para</label>
                  <input class="input" type="email" name="test_to" placeholder="<?= san($u['email'] ?? 'voce@exemplo.com') ?>" value="<?= san($u['email'] ?? '') ?>"></div>
                <button class="btn btn-primary" <?= $mailOn ? '' : 'disabled title="Configure o SMTP primeiro"' ?>>✉️ Enviar teste</button>
              </form>
              <form method="post" style="margin:0;">
                <input type="hidden" name="action" value="email_diag">
                <button class="btn btn-secondary" title="Verifica pré-requisitos e conectividade SEM enviar">🩺 Diagnosticar conexão</button>
              </form>
              <form method="post" style="margin:0;" onsubmit="return confirm('Disparar agora o resumo semanal para todos os usuários que ativaram a opção?');">
                <input type="hidden" name="action" value="digest_now">
                <button class="btn btn-secondary" <?= $mailOn ? '' : 'disabled title="Configure o SMTP primeiro"' ?> title="Envia o resumo semanal imediatamente (ignora o agendamento)">🗓️ Enviar resumo semanal agora</button>
              </form>
            </div>
            <p class="adm-hint" style="margin:8px 0 0;">Se o teste falhar no servidor, rode o <strong>diagnóstico</strong>: ele aponta a causa provável (firewall bloqueando a porta SMTP de saída, OpenSSL ausente, etc.). O <strong>resumo semanal</strong> é enviado automaticamente toda segunda de manhã para quem ativou a opção em Meu Painel; o botão acima força o envio na hora (para testar).</p>

            <?php if ($emailDiag): ?>
              <div class="adm-insights" style="margin-top:12px;">
                <div class="adm-insights-head">🩺 Diagnóstico de e-mail · <?= $emailDiag['ok'] ? '<span style="color:var(--success);">tudo OK</span>' : '<span style="color:var(--danger);">há pontos a corrigir</span>' ?></div>
                <?php foreach ($emailDiag['lines'] as $ln): ?>
                  <div class="adm-insight <?= $ln['ok'] ? 'ok' : 'alert' ?>">
                    <span class="ai-ico"><?= $ln['ok'] ? '✅' : '❌' ?></span>
                    <span><strong><?= san($ln['label']) ?></strong><?= $ln['detail'] !== '' ? ': ' . san($ln['detail']) : '' ?></span>
                  </div>
                <?php endforeach; ?>
              </div>
            <?php endif; ?>
          </div>
        </section>

        <!-- ─── MANUTENÇÃO ─── -->
        <section id="maintenance" class="adm-section">
          <div class="adm-section-header">
            <h2>⚙️ Modo manutenção</h2>
            <?php if ($mainten['enabled']): ?>
              <span class="adm-badge adm-badge-danger">ATIVO</span>
            <?php else: ?>
              <span class="adm-badge adm-badge-ok">Desligado</span>
            <?php endif; ?>
          </div>
          <div class="adm-section-body">
            <form method="post" class="adm-form">
              <input type="hidden" name="action" value="maintenance">
              <label class="adm-switch">
                <input type="checkbox" name="enabled" <?= $mainten['enabled'] ? 'checked' : '' ?>>
                <span>Ativar modo manutenção</span>
              </label>
              <div class="field"><label>Mensagem para os usuários</label>
                <textarea name="message" rows="2" placeholder="Ex: Atualização das 22h às 23h. Salve seus cards antes."><?= san($mainten['message']) ?></textarea>
              </div>
              <div class="adm-form-grid">
                <div class="field"><label>Início agendado</label><input class="input" name="scheduled_start" type="datetime-local" value="<?= san($mainten['scheduled_start']) ?>"></div>
                <div class="field"><label>Retorno previsto</label><input class="input" name="expected_return" type="datetime-local" value="<?= san($mainten['expected_return']) ?>"></div>
              </div>
              <button class="btn btn-primary">Salvar</button>
            </form>
          </div>
        </section>
        <?php endif; /* fim seções só-Dev: card-fields, vision, maintenance */ ?>

        <?php if ($isDev): ?>
        <!-- ─── BACKUPS ─── -->
        <section id="backups" class="adm-section">
          <div class="adm-section-header">
            <h2>📦 Backups</h2>
            <span class="adm-badge"><?= $totalBackups ?> arquivo<?= $totalBackups!=1?'s':'' ?></span>
          </div>
          <div class="adm-section-body">
            <form method="post" class="adm-bk-create">
              <input type="hidden" name="action" value="backup_create">
              <input class="input" name="label" placeholder="Label (ex: pré-release v11)">
              <button class="btn btn-accent">+ Criar backup agora</button>
            </form>

            <table class="adm-table">
              <thead><tr><th>Label</th><th>Criado em</th><th>Por</th><th>Revisão</th><th>Cards</th><th>Tipo</th><th></th></tr></thead>
              <tbody>
                <?php foreach ($backupsList as $b): ?>
                  <tr>
                    <td><strong><?= san($b['label']) ?></strong></td>
                    <td><?= san(date('d/m/Y H:i', strtotime($b['created_at']))) ?></td>
                    <td><?= san($b['created_by']) ?></td>
                    <td><code><?= (int)$b['revision'] ?></code></td>
                    <td><?= (int)$b['card_count'] ?></td>
                    <td><?php if ($b['auto']): ?><span class="adm-pill" style="background:var(--info-soft);color:var(--info);">AUTO</span><?php else: ?><span class="adm-pill" style="background:var(--warning-soft);color:var(--warning);">MANUAL</span><?php endif; ?></td>
                    <td>
                      <form method="post" class="needs-confirm" data-confirm="<?= san('Remover este backup?') ?>">
                        <input type="hidden" name="action" value="backup_delete">
                        <input type="hidden" name="id" value="<?= san($b['id']) ?>">
                        <button class="btn btn-sm btn-ghost" title="Remover">✕</button>
                      </form>
                    </td>
                  </tr>
                <?php endforeach; ?>
                <?php if (!$backupsList): ?>
                  <tr><td colspan="7" class="adm-empty">Nenhum backup criado ainda.</td></tr>
                <?php endif; ?>
              </tbody>
            </table>
          </div>
        </section>
        <?php endif; /* fim Backups (só-Dev) */ ?>
      </div>
    </main>
  </div>
  <script>
    // Segmented control dos campos do card: realça a opção marcada
    document.querySelectorAll('.adm-cf-seg').forEach(seg => {
      seg.addEventListener('change', () => {
        seg.querySelectorAll('.adm-cf-opt').forEach(o => {
          o.classList.toggle('active', o.querySelector('input').checked);
        });
      });
    });

    /* ─── Seções recolhíveis (Usuários, Consumo por equipe/usuário): lembrar estado ─── */
    (function () {
      const KEY = 'sf_adm_fold';
      let st = {};
      try { st = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) {}
      const folds = [...document.querySelectorAll('details[data-fold]')];
      folds.forEach(d => {
        const k = d.dataset.fold;
        if (d.hasAttribute('data-fold-forceopen')) d.open = true;   // ex.: busca de usuário ativa
        else if (k in st) d.open = !!st[k];                         // restaura último estado
      });
      const save = () => {
        const o = {}; folds.forEach(d => { o[d.dataset.fold] = d.open; });
        try { sessionStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
      };
      folds.forEach(d => d.addEventListener('toggle', save));
    })();

    /* ─── Consumo (equipe/usuário): drill-down + busca + lembrar estado ─── */
    (function () {
      const section = document.getElementById('storage');
      if (!section) return;
      const search = document.getElementById('stx-search');
      const noResult = document.getElementById('stx-noresult');
      const KEY = 'sf_stx_open';

      // restaura quais <details> estavam abertos (sobrevive ao reload do POST)
      let open = {};
      try { open = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) {}
      section.querySelectorAll('details[data-key]').forEach(d => { if (open[d.dataset.key]) d.open = true; });
      const persist = () => {
        const o = {};
        section.querySelectorAll('details[data-key]').forEach(d => { if (d.open) o[d.dataset.key] = 1; });
        try { sessionStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
      };
      section.addEventListener('toggle', persist, true);

      // busca: filtra cards por título/arquivo em TODAS as equipes e usuários
      function applyFilter() {
        const q = (search?.value || '').trim().toLowerCase();
        let anyHit = false;
        section.querySelectorAll('.stx-consumer').forEach(row => {
          const cards = row.querySelectorAll('.stx-card');
          if (!cards.length) { row.style.display = q ? 'none' : ''; return; }
          let rowHit = false;
          cards.forEach(card => {
            const hit = !q || (card.dataset.search || '').includes(q);
            card.style.display = hit ? '' : 'none';
            if (hit && q) { card.open = true; rowHit = true; }
            else if (!q) { card.open = false; }
          });
          const name = (row.querySelector('.adm-storage-name')?.textContent || '').toLowerCase();
          if (q && name.includes(q)) rowHit = true;   // nome da equipe/usuário também casa
          row.style.display = (!q || rowHit) ? '' : 'none';
          if (rowHit) {
            anyHit = true;
            const wrap = row.querySelector('.stx-drill-wrap');
            if (wrap && q) wrap.open = true;
            const fold = row.closest('.adm-fold');     // abre a seção recolhível ao achar
            if (fold && q) fold.open = true;
          }
        });
        if (noResult) noResult.style.display = (q && !anyHit) ? '' : 'none';
      }
      search?.addEventListener('input', applyFilter);
    })();
    </script>

    <script type="module">
    // Fallback module para páginas que não carregam o bundle principal
    // Intercepta botões/formulários com data-confirm para mostrar o modal estilizado
    (function () {
      const confirmModulePath = <?= json_encode(url('js/ui/confirm.js')) ?>;

      async function showConfirm(message, danger, title='Confirmar') {
        try {
          const m = await import(confirmModulePath);
          return await m.confirmDialog({ title, message, confirmText: 'OK', cancelText: 'Cancelar', danger });
        } catch (e) {
          return confirm(message);
        }
      }

      document.addEventListener('click', (e) => {
        if (e.defaultPrevented) return;
        const btn = e.target.closest('button, input[type="submit"]');
        if (!btn) return;
        const form = btn.closest('form');
        if (!form) return;
        const msg = form.dataset.confirm;
        if (!msg) return;
        const btType = (btn.getAttribute('type') || 'submit').toLowerCase();
        if (btType === 'button') return;
        e.preventDefault();
        showConfirm(msg, !!form.querySelector('.stx-danger')).then(ok => {
          if (!ok) return;
          let tmp = null;
          try {
            if (btn.name) {
              tmp = document.createElement('input'); tmp.type = 'hidden'; tmp.name = btn.name; tmp.value = btn.value || '';
              form.appendChild(tmp);
            }
            form.submit();
          } finally { if (tmp) tmp.remove(); }
        });
      }, true);

      // fallback submit interception
      document.addEventListener('submit', (e) => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement)) return;
        const msg = form.dataset.confirm;
        if (!msg) return;
        e.preventDefault();
        showConfirm(msg, !!form.querySelector('.stx-danger')).then(ok => { if (ok) form.submit(); });
      });
    })();
    </script>
</body>
</html>
