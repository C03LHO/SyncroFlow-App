<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — seed_demo.php
   Popula o sistema com um cenário REAL controlado: usuários,
   equipes, membros, colunas, cards (com datas/prioridades/ganhos/
   tags), subtarefas, comentários e histórico.

   Uso (CLI):  php scripts/seed_demo.php
        ou navegador:  /scripts/seed_demo.php?key=seed-syncro
   Idempotente: limpa os dados demo anteriores (prefixo demo-) e recria.
   NÃO mexe no administrador do sistema nem em dados não-demo.
   ═══════════════════════════════════════════════════════════ */

require_once dirname(__DIR__) . '/lib/dev_only.php';   // 🔒 bloqueia acesso web em produção
require_once dirname(__DIR__) . '/lib/db.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
    if (($_GET['key'] ?? '') !== 'seed-syncro') { http_response_code(403); exit("Acesso negado. Use ?key=seed-syncro\n"); }
}

$log = [];
function out($m) { global $log; $log[] = $m; echo $m . "\n"; }

$now = now_iso();
$today = new DateTime('today');
function iso_days($n) { $d = new DateTime('today'); $d->modify(($n>=0?'+':'').$n.' days'); return $d->format('Y-m-d'); }
function ts_days($n) { $d = new DateTime(); $d->modify(($n>=0?'+':'').$n.' days'); return $d->format('Y-m-d\TH:i:s.000\Z'); }
function pick($arr) { return $arr[array_rand($arr)]; }

/* ─── 0) Limpa dados demo anteriores ─── */
tx(function () {
    $demoTeams = array_column(all("SELECT id FROM teams WHERE id LIKE 'demo-%'"), 'id');
    foreach ($demoTeams as $tid) {
        $cardIds = array_column(all("SELECT id FROM cards WHERE team_id=?", [$tid]), 'id');
        foreach ($cardIds as $cid) {
            q("DELETE FROM comments WHERE card_id=?", [$cid]);
            q("DELETE FROM subtasks WHERE card_id=?", [$cid]);
            q("DELETE FROM card_history WHERE card_id=?", [$cid]);
        }
        q("DELETE FROM cards WHERE team_id=?", [$tid]);
        q("DELETE FROM columns WHERE team_id=?", [$tid]);
        q("DELETE FROM team_members WHERE team_id=?", [$tid]);
        q("DELETE FROM teams WHERE id=?", [$tid]);
    }
    // usuários demo
    $demoUsers = array_column(all("SELECT user_id FROM users WHERE user_id LIKE '9%' AND name LIKE '%(demo)%'"), 'user_id');
    foreach ($demoUsers as $uid) {
        q("DELETE FROM team_members WHERE user_id=?", [$uid]);
        q("DELETE FROM teams WHERE id=?", ['personal-'.$uid]);
        q("DELETE FROM users WHERE user_id=?", [$uid]);
    }
});
out("• Dados demo anteriores limpos.");

/* ─── 1) Usuários demo ─── */
$hash = password_hash('demo@2026', PASSWORD_BCRYPT, ['cost' => 10]);
$people = [
    ['900000001','Mariana Lopes','gestor','Produto'],
    ['900000002','Carlos Eduardo Reis','gestor','Operações'],
    ['900000003','Fernanda Alves','analista','Desenvolvimento'],
    ['900000004','Rafael Monteiro','analista','Desenvolvimento'],
    ['900000005','Juliana Castro','analista','Design'],
    ['900000006','Bruno Tavares','analista','Suporte'],
    ['900000007','Patrícia Gomes','analista','Qualidade'],
    ['900000008','Diego Fernandes','analista','Infraestrutura'],
    ['900000009','Aline Ribeiro','analista','TI'],
    ['900000010','Thiago Martins','analista','Dados'],
    ['900000011','Camila Souza','analista','Marketing'],
    ['900000012','Gustavo Pereira','visitante','Financeiro'],
];
$insUser = "INSERT OR REPLACE INTO users (user_id, password_hash, name, email, role, job_title, department, color, active_title, onboarding_done, total_logins, last_login, created_at, is_active)
            VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,1)";
foreach ($people as [$id,$name,$role,$dept]) {
    // Login é por e-mail: demo01@syncroflow.local … demo12@syncroflow.local
    q($insUser, [$id, $hash, $name.' (demo)', 'demo'.substr($id, -2).'@syncroflow.local', $role, $dept, $dept,
                 pick(['#2563EB','#7C3AED','#16A34A','#EA580C','#0D9488','#DB2777']),
                 pick(['novato','cadete','especialista','veterano']),
                 rand(5,120), ts_days(-rand(0,6)), ts_days(-rand(40,400))]);
}
out("• ".count($people)." usuários demo criados (senha: demo@2026).");

/* ─── 2) Equipes demo ─── */
$teams = [
    ['demo-app','Lançamento do App','Nova versão do aplicativo móvel','🚀','#2563EB',
      ['900000001'=>'gestor','900000009'=>'ti','900000003'=>'analista','900000004'=>'analista','900000005'=>'analista','900000012'=>'visitante']],
    ['demo-suporte','Suporte & Operações','Atendimento ao cliente e estabilidade da plataforma','🛠️','#EA580C',
      ['900000002'=>'gestor','900000006'=>'analista','900000008'=>'analista','900000010'=>'analista']],
    ['demo-marketing','Marketing & Growth','Campanhas, conteúdo e crescimento','📣','#16A34A',
      ['900000001'=>'gestor','900000007'=>'analista','900000011'=>'analista','900000005'=>'analista']],
    ['demo-pessoas','Pessoas & Cultura','Contratação, integração e bem-estar do time','🌱','#0D9488',
      ['900000002'=>'gestor','900000011'=>'analista','900000003'=>'analista']],
];
$cols = [
    ['backlog','Backlog',1,0,'#6b7280','📥'],
    ['andamento','Em Andamento',0,1,'#f59e0b','⚙️'],
    ['revisao','Em Revisão',0,2,'#3b82f6','🔍'],
    ['concluido','Concluído',0,3,'#10b981','✅'],
];
foreach ($teams as [$tid,$tname,$desc,$icon,$color,$members]) {
    q("INSERT INTO teams (id,name,description,type,owner_user_id,color,icon,created_at,archived)
       VALUES (?,?,?,'team',?,?,?,?,0)",
       [$tid,$tname,$desc, array_key_first($members), $color, $icon, ts_days(-rand(120,360))]);
    foreach ($members as $vid=>$rl)
        q("INSERT INTO team_members (team_id,user_id,role,joined_at,added_by) VALUES (?,?,?,?,?)",
          [$tid,$vid,$rl, ts_days(-rand(30,300)), 'seed']);
    foreach ($cols as [$cid,$cname,$bk,$pos,$ccolor,$cicon])
        q("INSERT INTO columns (id,team_id,name,is_backlog,position,color,icon) VALUES (?,?,?,?,?,?,?)",
          ["$tid-$cid",$tid,$cname,$bk,$pos,$ccolor,$cicon]);
}
out("• ".count($teams)." equipes demo criadas com colunas e membros.");

/* ─── 3) Cards + subtarefas + comentários + histórico ─── */
$titlesByTeam = [
  'demo-app'=>['Tela de onboarding','Login com e-mail e senha','Carrinho de compras','Integração com pagamentos','Notificações push','Testes de usabilidade','Modo escuro','Publicação nas lojas','Revisão de acessibilidade','Performance da tela inicial'],
  'demo-suporte'=>['Base de conhecimento','Automação de respostas','Monitoramento de erros','Backup semanal dos servidores','Pesquisa de satisfação','Atualização de dependências','Reduzir tempo de resposta','Escala de plantão'],
  'demo-marketing'=>['Campanha de lançamento','Calendário de posts','Nova landing page','Newsletter mensal','Estudo de concorrentes','Vídeo de demonstração','Webinar com clientes'],
  'demo-pessoas'=>['Processo seletivo de designers','Kit de boas-vindas','Pesquisa de clima','Plano de carreira','Semana de integração','Programa de mentoria'],
];
$colKeys = ['backlog','andamento','revisao','concluido'];
$prios = ['baixa','media','alta','urgente'];
$visions = ['','Produto','Crescimento'];
$tagPool = ['mobile','crítico','ux','urgente','melhoria','backend','custo','prazo','segurança','qualidade','conteúdo','dados'];
$subPool = ['Levantar requisitos','Aprovar orçamento','Validar com a área','Executar','Documentar','Revisar entrega','Comunicar stakeholders','Homologar'];
$commentPool = ['Avançando conforme o planejado.','Precisamos alinhar com o time de design.','Aguardando aprovação do gestor.','Risco de atraso: depende de outra equipe.','Concluído antes do prazo! 🎉','Vamos revisar o escopo amanhã.','Bloqueado: falta liberação de acesso.','Ótimo trabalho, equipe!'];

$totalCards = 0; $totalComments = 0; $totalSubs = 0;
foreach ($teams as [$tid,$tname,$desc,$icon,$color,$members]) {
    $memberIds = array_keys($members);
    $assignables = array_values(array_filter($memberIds, fn($v) => $members[$v] !== 'visitante'));
    $titles = $titlesByTeam[$tid];
    foreach ($titles as $idx => $title) {
        $colKey = pick($colKeys);
        // distribui: ~30% concluído, resto espalhado
        if ($idx % 10 < 3) $colKey = 'concluido';
        elseif ($idx % 10 < 5) $colKey = 'backlog';
        $done = $colKey === 'concluido';
        $assignee = $assignables ? all("SELECT name FROM users WHERE user_id=?", [pick($assignables)])[0]['name'] : '';
        $start = iso_days(-rand(5,60));
        $due   = $done ? iso_days(-rand(1,20)) : iso_days(rand(-10,45)); // alguns atrasados
        $prio = pick($prios);
        $progress = $done ? 100 : pick([0,10,25,40,60,75,90]);
        $cid = 'demo-card-' . substr(md5($tid.$title), 0, 12);
        $createdTs = ts_days(-rand(20,90));
        $econMes = pick([0,0,500,1200,3000,8000,15000]);
        $horasMes = pick([0,0,8,16,40,80]);
        q("INSERT INTO cards (id,team_id,column_id,title,description,assignee,start_date,due_date,
              projection_status,priority,progress,progress_mode,vision,color,archived,
              gains_horas_mes,gains_economia_mes,gains_qualitativo,revision,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?, 'manual', ?, ?, 0, ?, ?, '[]', 1, ?, ?)", [
            $cid, $tid, "$tid-$colKey", $title,
            'Iniciativa da equipe '.$tname.'. '.pick(['Escopo definido com o time.','Alinhado ao planejamento do trimestre.','Demanda prioritária do período.']),
            $assignee, $start, $due,
            ($due < $today->format('Y-m-d') && !$done) ? 'atrasado' : 'no-prazo',
            $prio, $progress, pick($visions),
            pick(['','','#2563EB','#16A34A','#EA580C','#DC2626']),
            $horasMes, $econMes, $createdTs, ts_days(-rand(0,15)),
        ]);
        $totalCards++;

        // tags (1-3)
        // (tags ficam em tabela própria? aqui o schema usa coluna? verificamos: cards não tem tags; tags via card_tags)
        // subtarefas (0-5)
        $nsub = rand(0,5);
        for ($s=0; $s<$nsub; $s++) {
            $sdone = $done ? 1 : (rand(0,1));
            q("INSERT INTO subtasks (id,card_id,parent_subtask_id,title,done,position) VALUES (?,?,NULL,?,?,?)",
              ['demo-sub-'.uid(), $cid, pick($subPool), $sdone, $s]);
            $totalSubs++;
        }
        // comentários (0-4)
        $ncom = rand(0,4);
        for ($k=0; $k<$ncom; $k++) {
            q("INSERT INTO comments (id,card_id,user_name,timestamp,text) VALUES (?,?,?,?,?)",
              ['demo-com-'.uid(), $cid,
               all("SELECT name FROM users WHERE user_id=?", [pick($memberIds)])[0]['name'],
               ts_days(-rand(0,18)), pick($commentPool)]);
            $totalComments++;
        }
        // histórico (id é AUTOINCREMENT — não informar)
        q("INSERT INTO card_history (card_id,user_name,timestamp,action) VALUES (?,?,?,?)",
          [$cid, $assignee ?: 'sistema', $createdTs, 'Card criado']);
        if ($done)
            q("INSERT INTO card_history (card_id,user_name,timestamp,action) VALUES (?,?,?,?)",
              [$cid, $assignee ?: 'sistema', ts_days(-rand(0,10)), 'Movido para Concluído']);
    }
}
out("• $totalCards cards, $totalSubs subtarefas, $totalComments comentários criados.");

/* ─── 4) Tags (se houver tabela card_tags) ─── */
try {
    $hasTags = scalar("SELECT name FROM sqlite_master WHERE type='table' AND name='card_tags'");
    if ($hasTags) {
        foreach (all("SELECT id FROM cards WHERE id LIKE 'demo-card-%'") as $row) {
            $n = rand(0,3);
            $used = [];
            for ($i=0;$i<$n;$i++) { $t = pick($tagPool); if(in_array($t,$used))continue; $used[]=$t;
                try { q("INSERT INTO card_tags (card_id,tag) VALUES (?,?)", [$row['id'],$t]); } catch (Exception $e) {} }
        }
        out("• Tags atribuídas aos cards demo.");
    }
} catch (Exception $e) { /* sem tabela de tags */ }

/* ─── 5) Mural de avisos demo ─── */
try {
    q("DELETE FROM notices WHERE id LIKE 'demo-%'");
    q("INSERT INTO notices (id,text,type,author,team_id,created_at) VALUES (?,?,?,?,?,?)",
      ['demo-n1','Reunião de status toda segunda às 9h.','info','Mariana Lopes','demo-app',$now]);
    q("INSERT INTO notices (id,text,type,author,team_id,created_at) VALUES (?,?,?,?,?,?)",
      ['demo-n2','Janela de manutenção dos servidores no sábado às 22h.','warn','Carlos Eduardo Reis','demo-suporte',$now]);
    out("• Avisos demo publicados.");
} catch (Exception $e) {}

/* ─── 6) Bump de revisão p/ clientes recarregarem ─── */
try { require_once dirname(__DIR__) . '/lib/revision.php'; bump_revision('system','seed','reload'); } catch (Exception $e) {}

out("");
out("✅ Seed concluído. Login dos demos: demoNN@syncroflow.local (NN = 01…12) / senha demo@2026");
out("   Gestores: demo01 (Mariana), demo02 (Carlos) · TI de equipe: demo09 (Aline)");
