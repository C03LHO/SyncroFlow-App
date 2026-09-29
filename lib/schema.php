<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/schema.php
   Schema completo + auto-migrations + bootstrap mínimo.

   Filosofia: chamado AUTOMATICAMENTE pela
   função db() na primeira conexão. Se o banco não existe, é
   criado. Se algumas tabelas faltam, são criadas. Se já está
   tudo pronto, é uma checagem ~3ms e devolve cacheada.

   Por isso o usuário NUNCA precisa rodar init_db.php manualmente
   antes do primeiro acesso — basta abrir o app no navegador e
   tudo se monta sozinho.
   ═══════════════════════════════════════════════════════════ */

/**
 * Garante que o schema completo está presente.
 * Retorna array de mensagens (vazio se já estava tudo pronto).
 *
 * @param  PDO  $pdo
 * @return array{cached:bool, messages:array<string>}
 */
function ensure_schema(PDO $pdo): array {
    static $done = false;
    if ($done) return ['cached' => true, 'messages' => []];

    $messages = [];

    // Quick-check: se a tabela `users` já existe, pulamos os CREATEs
    // (eles são IF NOT EXISTS, mas pular economiza ~2ms por request).
    $usersExists = (int)$pdo
        ->query("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users'")
        ->fetchColumn();

    if (!$usersExists) {
        _create_tables($pdo);
        $messages[] = 'Schema completo criado.';
    }

    // Tabelas de equipe — sempre garantidas (IF NOT EXISTS), inclusive em
    // bancos antigos que já tinham `users` (onde _create_tables não roda).
    _ensure_team_tables($pdo);

    // Auto-migrations — sempre rodam (são baratas, falham com try/catch)
    _run_auto_migrations($pdo);

    // Login por e-mail: garante que todo usuário ativo tenha um e-mail utilizável
    // (o dono sem e-mail recebe admin@syncroflow.local) — evita lockout na migração
    // de contas antigas que não tinham e-mail. Idempotente.
    _migrate_emails_for_login($pdo);

    // Feriados/dias facultativos editáveis pelo admin — semeia 1x se vazio
    _seed_holidays_if_empty($pdo);

    // Copa do Mundo — flag "Modo Copa" + jogos do Brasil 2026 (modelo editável)
    _seed_worldcup_if_empty($pdo);

    // Relaxa o CHECK de users.role (permite novos papéis como 'suporte')
    _migrate_user_role_check($pdo);

    // Bootstrap de colunas e usuário TI — só se necessário
    $bootstrapMsgs = _bootstrap_if_empty($pdo);
    $messages = array_merge($messages, $bootstrapMsgs);

    // v12 — migração multi-equipe (idempotente, preserva dados)
    $teamMsgs = _migrate_teams($pdo);
    $messages = array_merge($messages, $teamMsgs);

    // Pastas auxiliares (uploads, backups) com .htaccess de bloqueio
    _ensure_aux_dirs($messages);

    $done = true;
    return ['cached' => false, 'messages' => $messages];
}

/* ═══════════════════════════════════════════════════════════
   1. CREATE TABLE IF NOT EXISTS — schema completo
   ═══════════════════════════════════════════════════════════ */
function _create_tables(PDO $pdo): void {
    /* ─── Identidade ─── */
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        user_id           TEXT PRIMARY KEY,
        password_hash     TEXT NOT NULL,
        name              TEXT NOT NULL,
        role              TEXT NOT NULL DEFAULT 'analista'
                            CHECK (role IN ('ti','gestor','analista','visitante')),
        job_title         TEXT DEFAULT '',
        department        TEXT DEFAULT '',
        reports_to        TEXT REFERENCES users(user_id) ON DELETE SET NULL,
        color             TEXT DEFAULT '',
        profile_title     TEXT,
        active_title      TEXT DEFAULT 'novato',
        onboarding_done   INTEGER NOT NULL DEFAULT 0,
        last_standup_date TEXT DEFAULT '',
        seen_achievements TEXT DEFAULT '[]',
        total_logins      INTEGER NOT NULL DEFAULT 0,
        last_login        TEXT,
        created_at        TEXT NOT NULL,
        is_active         INTEGER NOT NULL DEFAULT 1
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS user_login_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    TEXT NOT NULL,
        login_at   TEXT NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_login_history_user
                ON user_login_history(user_id, login_at DESC)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS access_requests (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL,
        name             TEXT NOT NULL,
        requested_at     TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected')),
        approved_by      TEXT,
        approved_at      TEXT,
        rejection_reason TEXT
    )");

    /* ─── Solicitações de promoção de nível ─── */
    $pdo->exec("CREATE TABLE IF NOT EXISTS role_requests (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL,
        requested_role   TEXT NOT NULL
                           CHECK (requested_role IN ('gestor','analista')),
        justification    TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected')),
        requested_at     TEXT NOT NULL,
        decided_by       TEXT,
        decided_at       TEXT,
        decision_reason  TEXT,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_role_requests_status
                ON role_requests(status, requested_at DESC)");

    /* ─── Kanban ─── */
    $pdo->exec("CREATE TABLE IF NOT EXISTS columns (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        wip_limit  INTEGER,
        is_backlog INTEGER NOT NULL DEFAULT 0,
        color      TEXT DEFAULT '',
        icon       TEXT DEFAULT '',
        position   INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_columns_position ON columns(position)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS cards (
        id                       TEXT PRIMARY KEY,
        column_id                TEXT NOT NULL,
        title                    TEXT NOT NULL,
        description              TEXT DEFAULT '',
        assignee                 TEXT DEFAULT '',
        start_date               TEXT,
        due_date                 TEXT,
        projection_status        TEXT DEFAULT 'no-prazo',
        priority                 TEXT NOT NULL DEFAULT 'media'
                                   CHECK (priority IN ('baixa','media','alta','urgente')),
        progress                 INTEGER NOT NULL DEFAULT 0
                                   CHECK (progress BETWEEN 0 AND 100),
        progress_mode            TEXT NOT NULL DEFAULT 'manual'
                                   CHECK (progress_mode IN ('manual','auto')),
        vision                   TEXT DEFAULT '',
        color                    TEXT DEFAULT '',
        archived                 INTEGER NOT NULL DEFAULT 0,
        archived_by              TEXT,
        archived_at              TEXT,
        awaiting_approval        INTEGER NOT NULL DEFAULT 0,
        approval_requested_by    TEXT DEFAULT '',
        approval_requested_at    TEXT DEFAULT '',
        gains_horas_mes          REAL,
        gains_horas_ano          REAL,
        gains_horas_source       TEXT,
        gains_economia_mes       REAL,
        gains_economia_ano       REAL,
        gains_econ_source        TEXT,
        gains_qualitativo        TEXT DEFAULT '[]',
        revision                 INTEGER NOT NULL DEFAULT 1,
        created_at               TEXT NOT NULL,
        updated_at               TEXT NOT NULL,
        updated_by_user_id       TEXT,
        FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE RESTRICT
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_cards_column   ON cards(column_id, archived)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_cards_assignee ON cards(assignee)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_cards_due      ON cards(due_date) WHERE archived = 0");

    $pdo->exec("CREATE TABLE IF NOT EXISTS card_tags (
        card_id TEXT NOT NULL, tag TEXT NOT NULL,
        PRIMARY KEY (card_id, tag),
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS card_requested_by (
        card_id TEXT NOT NULL, person_name TEXT NOT NULL,
        PRIMARY KEY (card_id, person_name),
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS card_helpers (
        card_id TEXT NOT NULL, person_name TEXT NOT NULL,
        PRIMARY KEY (card_id, person_name),
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS card_blocks (
        blocker_card_id TEXT NOT NULL,
        blocked_card_id TEXT NOT NULL,
        PRIMARY KEY (blocker_card_id, blocked_card_id),
        CHECK (blocker_card_id != blocked_card_id),
        FOREIGN KEY (blocker_card_id) REFERENCES cards(id) ON DELETE CASCADE,
        FOREIGN KEY (blocked_card_id) REFERENCES cards(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_card_blocks_blocked ON card_blocks(blocked_card_id)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS subtasks (
        id                TEXT PRIMARY KEY,
        card_id           TEXT NOT NULL,
        parent_subtask_id TEXT,
        title             TEXT NOT NULL,
        done              INTEGER NOT NULL DEFAULT 0,
        assignee          TEXT DEFAULT '',
        due_date          TEXT,
        position          INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_subtask_id) REFERENCES subtasks(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_subtasks_card   ON subtasks(card_id, position)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_subtasks_parent ON subtasks(parent_subtask_id)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS comments (
        id        TEXT PRIMARY KEY,
        card_id   TEXT NOT NULL,
        user_name TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        text      TEXT NOT NULL,
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_comments_card ON comments(card_id, timestamp DESC)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS comment_reactions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id TEXT NOT NULL,
        user_name  TEXT NOT NULL,
        emoji      TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (comment_id, user_name, emoji),
        FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS card_history (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id   TEXT NOT NULL,
        user_name TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        action    TEXT NOT NULL,
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_card_history_card ON card_history(card_id, timestamp DESC)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_card_history_time ON card_history(timestamp)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS attachments (
        id          TEXT PRIMARY KEY,
        card_id     TEXT NOT NULL,
        name        TEXT NOT NULL,
        type        TEXT DEFAULT '',
        size        INTEGER DEFAULT 0,
        uploaded_at TEXT NOT NULL,
        uploaded_by TEXT DEFAULT '',
        file_path   TEXT,
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS links (
        id       TEXT PRIMARY KEY,
        card_id  TEXT NOT NULL,
        url      TEXT NOT NULL,
        title    TEXT DEFAULT '',
        added_at TEXT NOT NULL,
        added_by TEXT DEFAULT '',
        FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    )");

    /* ─── Customização e pessoas ─── */
    $pdo->exec("CREATE TABLE IF NOT EXISTS custom_fields (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        type       TEXT NOT NULL CHECK (type IN ('text','number','date','select')),
        options    TEXT DEFAULT '[]',
        created_by TEXT,
        created_at TEXT NOT NULL,
        position   INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS card_custom_values (
        card_id  TEXT NOT NULL,
        field_id TEXT NOT NULL,
        value    TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (card_id, field_id),
        FOREIGN KEY (card_id)  REFERENCES cards(id)         ON DELETE CASCADE,
        FOREIGN KEY (field_id) REFERENCES custom_fields(id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS people (
        id   TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        role TEXT DEFAULT ''
    )");

    /* ─── Notificações ─── */
    $pdo->exec("CREATE TABLE IF NOT EXISTS notifications (
        id             TEXT PRIMARY KEY,
        message        TEXT NOT NULL,
        type           TEXT NOT NULL DEFAULT 'info'
                         CHECK (type IN ('info','warn','error','success')),
        target_card_id TEXT,
        action_label   TEXT,
        for_user       TEXT,
        created_at     TEXT NOT NULL,
        read           INTEGER NOT NULL DEFAULT 0,
        read_at        TEXT,
        FOREIGN KEY (target_card_id) REFERENCES cards(id) ON DELETE SET NULL
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_notif_for_user
                ON notifications(for_user, read, created_at DESC)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS notices (
        id         TEXT PRIMARY KEY,
        text       TEXT NOT NULL,
        type       TEXT NOT NULL DEFAULT 'info',
        author     TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        edited_at  TEXT,
        edited_by  TEXT
    )");

    /* ─── Tokens "lembrar-me" (login automático seguro por dispositivo) ───
       Padrão selector:validator — guardamos só o HASH do validator. */
    $pdo->exec("CREATE TABLE IF NOT EXISTS auth_tokens (
        selector       TEXT PRIMARY KEY,
        validator_hash TEXT NOT NULL,
        user_id        TEXT NOT NULL,
        expires_at     TEXT NOT NULL,
        created_at     TEXT NOT NULL,
        user_agent     TEXT DEFAULT ''
    )");

    /* ─── Gamificação, histórico, performance, snapshots, backups ─── */
    $pdo->exec("CREATE TABLE IF NOT EXISTS trophies (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     TEXT NOT NULL,
        trophy_id   TEXT NOT NULL,
        unlocked_at TEXT NOT NULL,
        UNIQUE (user_id, trophy_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS titles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     TEXT NOT NULL,
        title_id    TEXT NOT NULL,
        unlocked_at TEXT NOT NULL,
        UNIQUE (user_id, title_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS role_history (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        name       TEXT NOT NULL,
        from_role  TEXT NOT NULL,
        to_role    TEXT NOT NULL,
        changed_by TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        reason     TEXT DEFAULT ''
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_role_history_user
                ON role_history(user_id, changed_at DESC)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS monthly_performance (
        user_id      TEXT NOT NULL,
        month        TEXT NOT NULL,
        concluded    INTEGER NOT NULL DEFAULT 0,
        economy      REAL NOT NULL DEFAULT 0,
        hours_saved  REAL NOT NULL DEFAULT 0,
        avg_progress REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, month),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS weekly_snapshots (
        id           TEXT PRIMARY KEY,
        week_label   TEXT NOT NULL,
        week_number  INTEGER NOT NULL,
        year         INTEGER NOT NULL,
        generated_at TEXT NOT NULL,
        stats        TEXT NOT NULL,
        UNIQUE (year, week_number)
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS backups (
        id         TEXT PRIMARY KEY,
        label      TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by TEXT,
        revision   INTEGER NOT NULL,
        card_count INTEGER NOT NULL,
        file_path  TEXT NOT NULL,
        auto       INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at DESC)");

    /* ─── Singletons ─── */
    $pdo->exec("CREATE TABLE IF NOT EXISTS team_goals (
        id      INTEGER PRIMARY KEY CHECK (id = 1),
        weekly  INTEGER NOT NULL DEFAULT 0,
        monthly INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec("INSERT OR IGNORE INTO team_goals (id, weekly, monthly) VALUES (1, 0, 0)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS vision_config (
        id       INTEGER PRIMARY KEY CHECK (id = 1),
        enabled  INTEGER NOT NULL DEFAULT 1,
        label    TEXT NOT NULL DEFAULT 'Visão',
        required INTEGER NOT NULL DEFAULT 1,
        options  TEXT NOT NULL DEFAULT '[\"Projetos\",\"Simplificação\"]'
    )");
    $pdo->exec("INSERT OR IGNORE INTO vision_config (id) VALUES (1)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS maintenance_mode (
        id              INTEGER PRIMARY KEY CHECK (id = 1),
        enabled         INTEGER NOT NULL DEFAULT 0,
        message         TEXT DEFAULT '',
        scheduled_start TEXT DEFAULT '',
        expected_return TEXT DEFAULT '',
        activated_by    TEXT DEFAULT '',
        activated_at    TEXT DEFAULT '',
        dismissed_by    TEXT NOT NULL DEFAULT '[]'
    )");
    $pdo->exec("INSERT OR IGNORE INTO maintenance_mode (id) VALUES (1)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS duplicate_detection (
        id        INTEGER PRIMARY KEY CHECK (id = 1),
        enabled   INTEGER NOT NULL DEFAULT 1,
        threshold TEXT NOT NULL DEFAULT 'medium'
                    CHECK (threshold IN ('low','medium','high'))
    )");
    $pdo->exec("INSERT OR IGNORE INTO duplicate_detection (id) VALUES (1)");

    $pdo->exec("CREATE TABLE IF NOT EXISTS system_config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )");

    /* ─── Revision log (base do polling) ─── */
    $pdo->exec("CREATE TABLE IF NOT EXISTS revision_log (
        revision            INTEGER PRIMARY KEY AUTOINCREMENT,
        modified_at         TEXT NOT NULL,
        modified_by_user_id TEXT,
        modified_by_name    TEXT,
        entity_type         TEXT,
        entity_id           TEXT,
        action              TEXT
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_revision_at ON revision_log(modified_at DESC)");

    _ensure_team_tables($pdo);
}

/* ═══════════════════════════════════════════════════════
   v12 — MULTI-EQUIPE (estilo Trello) — tabelas
   Função própria para ser chamada também em bancos antigos.
   ═══════════════════════════════════════════════════════ */
function _ensure_team_tables(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS teams (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        description   TEXT DEFAULT '',
        type          TEXT NOT NULL DEFAULT 'team'
                        CHECK (type IN ('team','personal','default')),
        owner_user_id TEXT,
        avatar_url    TEXT DEFAULT '',
        cover_url     TEXT DEFAULT '',
        color         TEXT DEFAULT '#00796D',
        icon          TEXT DEFAULT '👥',
        created_at    TEXT NOT NULL,
        archived      INTEGER NOT NULL DEFAULT 0
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_teams_type ON teams(type, archived)");

    // role: gestor | ti | analista | visitante  (validado na aplicação, sem CHECK
    // restritivo para permitir evoluir os papéis sem rebuild de tabela)
    $pdo->exec("CREATE TABLE IF NOT EXISTS team_members (
        team_id   TEXT NOT NULL,
        user_id   TEXT NOT NULL,
        role      TEXT NOT NULL DEFAULT 'analista',
        joined_at TEXT NOT NULL,
        added_by  TEXT,
        PRIMARY KEY (team_id, user_id)
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)");

    // Migração: rebuild de team_members antigo que tinha CHECK sem o papel 'ti'.
    try {
        $sqlDef = $pdo->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='team_members'")->fetchColumn();
        if ($sqlDef && stripos($sqlDef, 'CHECK') !== false && strpos($sqlDef, "'ti'") === false) {
            $pdo->exec("PRAGMA foreign_keys=OFF");
            $pdo->exec("CREATE TABLE team_members__new (
                team_id TEXT NOT NULL, user_id TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'analista',
                joined_at TEXT NOT NULL, added_by TEXT,
                PRIMARY KEY (team_id, user_id))");
            $pdo->exec("INSERT INTO team_members__new (team_id,user_id,role,joined_at,added_by)
                        SELECT team_id,user_id,role,joined_at,added_by FROM team_members");
            $pdo->exec("DROP TABLE team_members");
            $pdo->exec("ALTER TABLE team_members__new RENAME TO team_members");
            $pdo->exec("CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)");
        }
    } catch (Exception $e) { /* ignora — best-effort */ }

    $pdo->exec("CREATE TABLE IF NOT EXISTS team_invites (
        id          TEXT PRIMARY KEY,
        team_id     TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        direction   TEXT NOT NULL DEFAULT 'invite'
                      CHECK (direction IN ('invite','request')),
        role        TEXT NOT NULL DEFAULT 'analista',
        status      TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','accepted','rejected')),
        created_by  TEXT,
        created_at  TEXT NOT NULL,
        decided_at  TEXT
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_team_invites_user ON team_invites(user_id, status)");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_team_invites_team ON team_invites(team_id, status)");
}

/* ═══════════════════════════════════════════════════════════
   2. AUTO-MIGRATIONS — sempre rodam, ignoram erro de coluna já existente
       ADICIONE NOVOS ALTER TABLE AQUI EM RELEASES FUTURAS.
   ═══════════════════════════════════════════════════════════ */
/**
 * Reconstrói a tabela `users` removendo o CHECK restritivo de `role`,
 * para permitir papéis novos (ex.: 'suporte') sem violar a constraint.
 * Idempotente: só age se o CHECK antigo (sem 'suporte') existir.
 */
function _migrate_user_role_check(PDO $pdo): void {
    try {
        $sql = $pdo->query("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'")->fetchColumn();
        if (!$sql) return;
        if (stripos($sql, 'CHECK') === false || strpos($sql, "'suporte'") !== false) return; // já ok
        // Remove a cláusula CHECK (role IN (...)) preservando o resto da coluna
        $newSql = preg_replace('/CHECK\s*\(\s*role\s+IN\s*\([^)]*\)\s*\)/i', '', $sql);
        if (!$newSql || $newSql === $sql) return;
        $newSql = preg_replace('/CREATE TABLE\s+"?users"?/i', 'CREATE TABLE users__new', $newSql, 1);

        $cols = array_map(fn($c) => $c['name'], $pdo->query("PRAGMA table_info(users)")->fetchAll(PDO::FETCH_ASSOC));
        $colList = implode(',', $cols);

        $pdo->exec("PRAGMA foreign_keys=OFF");
        $pdo->exec($newSql);
        $pdo->exec("INSERT INTO users__new ($colList) SELECT $colList FROM users");
        $pdo->exec("DROP TABLE users");
        $pdo->exec("ALTER TABLE users__new RENAME TO users");
        $pdo->exec("PRAGMA foreign_keys=ON");
    } catch (Exception $e) { /* best-effort */ }
}

function _run_auto_migrations(PDO $pdo): void {
    $migrations = [
        // Garantia: se uma instalação antiga tiver users mas NÃO tiver
        // role_requests (adicionado em release posterior), criamos
        // a tabela aqui para evitar erros "no such table" ao abrir
        // a página de administração.
        "CREATE TABLE IF NOT EXISTS role_requests (\n        id               TEXT PRIMARY KEY,\n        user_id          TEXT NOT NULL,\n        requested_role   TEXT NOT NULL CHECK (requested_role IN ('gestor','analista')),\n        justification    TEXT NOT NULL,\n        status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),\n        requested_at     TEXT NOT NULL,\n        decided_by       TEXT,\n        decided_at       TEXT,\n        decision_reason  TEXT,\n        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE\n    )",
        "CREATE INDEX IF NOT EXISTS idx_role_requests_status ON role_requests(status, requested_at DESC)",
        // v11.0 → v11.x:
        "ALTER TABLE columns ADD COLUMN color TEXT DEFAULT '#10b981'",
        "ALTER TABLE columns ADD COLUMN icon  TEXT DEFAULT '📂'",
        // v11.1 — cadastro com pergunta de segurança
        "ALTER TABLE users ADD COLUMN security_question TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN security_answer_hash TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''",
        // v12 — multi-equipe + perfil
        "ALTER TABLE cards   ADD COLUMN team_id TEXT",
        "ALTER TABLE columns ADD COLUMN team_id TEXT",
        "ALTER TABLE users   ADD COLUMN email TEXT DEFAULT ''",
        "ALTER TABLE users   ADD COLUMN cover_url TEXT DEFAULT ''",
        "ALTER TABLE users   ADD COLUMN bio TEXT DEFAULT ''",
        // v12.1 — mural de avisos com escopo de equipe (NULL = global)
        "ALTER TABLE notices ADD COLUMN team_id TEXT",
        // v13 — configurações POR EQUIPE (metas, campos do card, campo extra)
        "ALTER TABLE teams ADD COLUMN goal_weekly INTEGER DEFAULT 0",
        "ALTER TABLE teams ADD COLUMN goal_monthly INTEGER DEFAULT 0",
        "ALTER TABLE teams ADD COLUMN card_fields TEXT DEFAULT ''",
        "ALTER TABLE teams ADD COLUMN extra_field TEXT DEFAULT ''",
        // v13 — respostas encadeadas de comentários
        "ALTER TABLE comments ADD COLUMN parent_id TEXT",
        // v14 — notificações acionáveis (pedidos/convites com Aceitar/Recusar)
        "ALTER TABLE notifications ADD COLUMN kind TEXT DEFAULT ''",
        "ALTER TABLE notifications ADD COLUMN ref_id TEXT DEFAULT ''",
        // v23 — campos personalizados POR EQUIPE (modular): escopo + comportamento
        "ALTER TABLE custom_fields ADD COLUMN team_id TEXT",
        "ALTER TABLE custom_fields ADD COLUMN required INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE custom_fields ADD COLUMN hidden   INTEGER NOT NULL DEFAULT 0",
        // v23.4 — Mural: agendamento (início), término já existe (expires_at) e recorrência
        "ALTER TABLE notices ADD COLUMN starts_at  TEXT",
        "ALTER TABLE notices ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'", // none|daily|weekly|monthly
        "ALTER TABLE notices ADD COLUMN recur_until TEXT",
        // v23.4 — Destaque de conquistas no perfil (prateleira): JSON {t:[ids], tt:[ids]}
        "ALTER TABLE users ADD COLUMN showcase TEXT DEFAULT ''",
        // v23.4 — Tokens "lembrar-me" (login automático). CREATE idempotente p/ bancos já existentes.
        "CREATE TABLE IF NOT EXISTS auth_tokens (selector TEXT PRIMARY KEY, validator_hash TEXT NOT NULL, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, user_agent TEXT DEFAULT '')",
        // v23.4 — Meta inteligente automática (auto-ajuste quando houver histórico)
        "ALTER TABLE teams ADD COLUMN smart_goal_auto INTEGER NOT NULL DEFAULT 0",
        // v23.4 — Recuperação de senha por e-mail (link com token)
        "CREATE TABLE IF NOT EXISTS password_resets (selector TEXT PRIMARY KEY, validator_hash TEXT NOT NULL, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)",
        // v23.5 — Notificações por E-MAIL (opt-in). MASTER vem DESATIVADO (0);
        // o usuário liga em Meu Painel. Subpreferências começam ligadas, mas só
        // valem quando o master está ligado.
        "ALTER TABLE users ADD COLUMN notify_email        INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN notify_email_assign INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE users ADD COLUMN notify_email_due    INTEGER NOT NULL DEFAULT 1",
        // v23.5 — Registro de e-mails enviados (evita reenvio de lembretes) e
        // estado de jobs (ex.: última varredura de vencimento).
        "CREATE TABLE IF NOT EXISTS email_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL, ref_id TEXT DEFAULT '', tag TEXT DEFAULT '', sent_at TEXT NOT NULL)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_email_log_dedupe ON email_log (user_id, kind, ref_id, tag)",
        "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)",
        // v23.6 — Feriados e dias facultativos editáveis pelo admin (TI-Dev/TI-Sup).
        // recurring=1 → repete todo ano via (month, day). recurring=0 → data única (date 'YYYY-MM-DD').
        // city='' → vale para todas as cidades. kind: feriado|facultativo|compensacao.
        "CREATE TABLE IF NOT EXISTS holidays (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'feriado', scope TEXT NOT NULL DEFAULT 'nacional', uf TEXT DEFAULT '', city TEXT DEFAULT '', recurring INTEGER NOT NULL DEFAULT 1, month INTEGER, day INTEGER, date TEXT DEFAULT '', created_by TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '')",
        "CREATE INDEX IF NOT EXISTS idx_holidays_city ON holidays(city)",
        // v23.6 — Pessoas externas da equipe (não-usuários) p/ responsável/solicitante/ajudante
        "ALTER TABLE teams ADD COLUMN extra_people TEXT DEFAULT '[]'",
        // v23.6 — Campo personalizado pode virar FILTRO na barra do quadro
        "ALTER TABLE custom_fields ADD COLUMN as_filter INTEGER NOT NULL DEFAULT 0",
        // v23.7 — Novas funcionalidades
        "CREATE TABLE IF NOT EXISTS card_watchers (card_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT '', PRIMARY KEY (card_id, user_id))",
        "ALTER TABLE cards ADD COLUMN est_hours REAL",
        "ALTER TABLE cards ADD COLUMN spent_hours REAL",
        "ALTER TABLE cards ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'",     // none|daily|weekly|monthly
        "ALTER TABLE cards ADD COLUMN recur_done INTEGER NOT NULL DEFAULT 0",       // já gerou a próxima ocorrência?
        "ALTER TABLE cards ADD COLUMN sprint_id TEXT",
        "CREATE TABLE IF NOT EXISTS card_templates (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', created_by TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '')",
        "CREATE TABLE IF NOT EXISTS sprints (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, start_date TEXT, end_date TEXT, goal INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT '')",
        "CREATE TABLE IF NOT EXISTS milestones (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, date TEXT NOT NULL, color TEXT DEFAULT '#d97757', created_at TEXT NOT NULL DEFAULT '')",
        // v23.7 — Resumo semanal por e-mail (subpreferência; só vale com notify_email=1)
        "ALTER TABLE users ADD COLUMN notify_email_digest INTEGER NOT NULL DEFAULT 1",
        // v23.7 — Sistema de Ligas (estilo Duolingo, temático aquático). Liga 1=Girino … 10=Leviatã.
        "ALTER TABLE users ADD COLUMN league_tier INTEGER NOT NULL DEFAULT 1",
        // v25.0 — Campo personalizado pode aparecer como BADGE no card do quadro (máx. 2 por equipe).
        "ALTER TABLE custom_fields ADD COLUMN show_on_card INTEGER NOT NULL DEFAULT 0",
        // v25.0 — Automação no-code (gatilho → ação) por equipe.
        "CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, trigger_type TEXT NOT NULL, trigger_value TEXT DEFAULT '', action_type TEXT NOT NULL, action_value TEXT DEFAULT '', created_by TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '')",
        // v25.1 — Coluna "Concluído" agora é definida por FLAG (is_done), não mais por
        // "última posição". E as colunas padrão (is_default) não podem ser excluídas.
        "ALTER TABLE columns ADD COLUMN is_done    INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE columns ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0",
        // Backfill idempotente: para cada equipe SEM coluna marcada como concluída,
        // marca a de maior posição (preserva exatamente o comportamento anterior).
        "UPDATE columns SET is_done = 1 WHERE id IN (
            SELECT c.id FROM columns c
            WHERE c.position = (SELECT MAX(c2.position) FROM columns c2 WHERE IFNULL(c2.team_id,'') = IFNULL(c.team_id,''))
              AND NOT EXISTS (SELECT 1 FROM columns c3 WHERE IFNULL(c3.team_id,'') = IFNULL(c.team_id,'') AND c3.is_done = 1)
         )",
        // Backfill: protege as colunas originais (backlog, concluída e as criadas no
        // padrão -col0/-col1/-col2) contra exclusão. Idempotente.
        "UPDATE columns SET is_default = 1
           WHERE is_backlog = 1 OR is_done = 1
              OR id LIKE '%-col0' OR id LIKE '%-col1' OR id LIKE '%-col2'
              OR id IN ('backlog','andamento','concluido')",
        // v25.2 — Categorias/Tags de EQUIPE. Catálogo de nomes (só TI-Dev/TI-Sup criam);
        // a atribuição é N:N (team_tag_map) — hoje a UI usa 1, mas o modelo já aceita várias.
        "CREATE TABLE IF NOT EXISTS team_tags (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT DEFAULT '#00796D', created_by TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '')",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_team_tags_name ON team_tags(LOWER(name))",
        "CREATE TABLE IF NOT EXISTS team_tag_map (team_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY (team_id, tag_id))",
        // Categoria padrão "Coordenação" + backfill para equipes não-pessoais sem categoria.
        "INSERT OR IGNORE INTO team_tags (id, name, color, created_by, created_at) VALUES ('tag-coordenacao','Coordenação','#00796D','system','')",
        "INSERT OR IGNORE INTO team_tag_map (team_id, tag_id)
           SELECT t.id, 'tag-coordenacao' FROM teams t
           WHERE t.type <> 'personal'
             AND NOT EXISTS (SELECT 1 FROM team_tag_map m WHERE m.team_id = t.id)",
        // v26 — Copa do Mundo: jogos do Brasil + placar, editáveis pelo admin (#6).
        "CREATE TABLE IF NOT EXISTS worldcup_matches (id TEXT PRIMARY KEY, match_date TEXT NOT NULL, match_time TEXT DEFAULT '', name TEXT NOT NULL, stage TEXT DEFAULT '', brazil INTEGER NOT NULL DEFAULT 1, result TEXT DEFAULT '', position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT '')",
        "CREATE INDEX IF NOT EXISTS idx_worldcup_date ON worldcup_matches(match_date)",
        // v26 — Controle de Férias (#10): férias GLOBAIS por pessoa (pede 1x, vale em
        // todas as equipes). Saldo global em users.vacation_days; aprovação pelo gestor
        // direto (users.reports_to) com fallback p/ Gestor/TI da equipe. overlap_ack:
        // gestor marcou "ok, sem problema" para a sobreposição.
        "ALTER TABLE team_members ADD COLUMN vacation_days INTEGER NOT NULL DEFAULT 30",
        "ALTER TABLE users ADD COLUMN vacation_days INTEGER NOT NULL DEFAULT 30",
        "CREATE TABLE IF NOT EXISTS vacations (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, user_id TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, days INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', reason TEXT DEFAULT '', decided_by TEXT DEFAULT '', decided_at TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '')",
        "ALTER TABLE vacations ADD COLUMN overlap_ack INTEGER NOT NULL DEFAULT 0",
        "CREATE INDEX IF NOT EXISTS idx_vacations_team ON vacations(team_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_vacations_user ON vacations(user_id)",
        // v26.1 — Aviso: guardar o AUTOR por ID estável (user_id) para restringir a
        // edição/exclusão a quem publicou (nome pode ser renomeado). Backfill por nome.
        "ALTER TABLE notices ADD COLUMN author_id TEXT DEFAULT ''",
        "UPDATE notices SET author_id = (SELECT u.user_id FROM users u WHERE u.name = notices.author)
           WHERE IFNULL(author_id,'') = '' AND author IS NOT NULL",
        // v26.2 — Duração MÁXIMA que um aviso pode ficar visível (horas). Padrão 48h;
        // só o TI da equipe altera (via update_config). Enforcement clampa expires_at.
        "ALTER TABLE teams ADD COLUMN notice_max_hours INTEGER NOT NULL DEFAULT 48",
        // v27 — Controle de AUSÊNCIAS: a tabela vacations vira genérica com um TIPO.
        // Os registros existentes (férias) recebem 'ferias' automaticamente (default).
        "ALTER TABLE vacations ADD COLUMN type TEXT NOT NULL DEFAULT 'ferias'",
        "CREATE INDEX IF NOT EXISTS idx_vacations_type ON vacations(type, status)",
        // v27.1 — Subtarefa pode entrar num SPRINT (controle de progresso mais fino).
        "ALTER TABLE subtasks ADD COLUMN sprint_id TEXT",
        "CREATE INDEX IF NOT EXISTS idx_subtasks_sprint ON subtasks(sprint_id)",
        // v28 — rate limiting de autenticação (login / cadastro / recuperação de senha)
        "CREATE TABLE IF NOT EXISTS auth_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, bucket TEXT NOT NULL, at TEXT NOT NULL)",
        "CREATE INDEX IF NOT EXISTS idx_auth_attempts ON auth_attempts(bucket, at)",
        // v28 — solicitações de acesso passam a identificar a pessoa por E-MAIL
        // (a credencial do sistema), e não mais por um identificador interno.
        "ALTER TABLE access_requests ADD COLUMN email TEXT DEFAULT ''",
        // (próximas releases anexam aqui)
    ];
    foreach ($migrations as $sql) {
        try { $pdo->exec($sql); }
        catch (Exception $e) { /* coluna já existe — ignorar */ }
    }
}

/* Login por e-mail: usuários ativos SEM e-mail recebem um endereço utilizável,
   para que a autenticação por e-mail nunca tranque ninguém para fora.
   - O dono (1º TI-Dev) recebe admin@syncroflow.local (ou um sufixo se ocupado).
   - Os demais recebem um placeholder único (usuario-<id>@local.invalid) que o
     próprio usuário troca depois em Meu Painel.
   Idempotente: só age em quem está sem e-mail. */
function _migrate_emails_for_login(PDO $pdo): void {
    try {
        $owner = $pdo->query("SELECT user_id FROM users
                              WHERE role='ti' AND is_active=1 AND (email IS NULL OR email='')
                              ORDER BY created_at ASC LIMIT 1")->fetchColumn();
        if ($owner) {
            $taken = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE lower(email)='admin@syncroflow.local'")->fetchColumn();
            $mail  = $taken ? ('admin+' . $owner . '@syncroflow.local') : 'admin@syncroflow.local';
            $st = $pdo->prepare("UPDATE users SET email=? WHERE user_id=?");
            $st->execute([$mail, $owner]);
        }
    } catch (Throwable $e) { /* best-effort */ }
    try {
        $pdo->exec("UPDATE users SET email = 'usuario-' || user_id || '@local.invalid'
                    WHERE is_active=1 AND (email IS NULL OR email='')");
    } catch (Throwable $e) { /* best-effort */ }
}

/* Semeia a tabela `holidays` na 1ª vez (migra os feriados que antes ficavam
   fixos no código). Idempotente: só insere se a tabela estiver vazia. */
function _seed_holidays_if_empty(PDO $pdo): void {
    try {
        $n = (int)$pdo->query("SELECT COUNT(*) FROM holidays")->fetchColumn();
        if ($n > 0) return;
    } catch (Exception $e) { return; }   // tabela ainda não existe

    // [mês, dia, nome, tipo, cidade]  — feriados NACIONAIS brasileiros, recorrentes (anual).
    // Cidade vazia = vale para todas. Feriados municipais/estaduais podem ser
    // adicionados livremente pelo painel de administração.
    $seed = [
        [1,  1,  'Confraternização Universal', 'feriado', ''],
        [4,  21, 'Tiradentes',                 'feriado', ''],
        [5,  1,  'Dia do Trabalho',            'feriado', ''],
        [9,  7,  'Independência do Brasil',    'feriado', ''],
        [10, 12, 'Nossa Senhora Aparecida',    'feriado', ''],
        [11, 2,  'Finados',                    'feriado', ''],
        [11, 15, 'Proclamação da República',   'feriado', ''],
        [11, 20, 'Dia da Consciência Negra',   'feriado', ''],
        [12, 25, 'Natal',                      'feriado', ''],
    ];
    $now = gmdate('Y-m-d\TH:i:s.000\Z');
    $stmt = $pdo->prepare("INSERT INTO holidays
        (id, name, kind, scope, uf, city, recurring, month, day, date, created_by, created_at)
        VALUES (?,?,?,?,?,?,1,?,?,'', 'seed', ?)");
    foreach ($seed as [$mo, $da, $nm, $kd, $ct]) {
        $scope = $ct === '' ? 'nacional' : 'municipal';
        $id = sprintf('hol-%02d%02d-%s', $mo, $da, substr(md5($nm . '|' . $ct), 0, 8));
        try { $stmt->execute([$id, $nm, $kd, $scope, '', $ct, $mo, $da, $now]); }
        catch (Exception $e) { /* ignora duplicado */ }
    }
}

/* Copa do Mundo (#6): garante a flag "Modo Copa" e semeia os jogos do Brasil
   de 2026 como MODELO editável (placar à mão pelo admin). Idempotente. */
function _seed_worldcup_if_empty(PDO $pdo): void {
    // Flag "Modo Copa" — liga por padrão (estamos na janela da Copa 2026).
    try { $pdo->exec("INSERT OR IGNORE INTO system_config (key, value) VALUES ('worldcup_enabled', '1')"); }
    catch (Exception $e) { return; }   // tabela ainda não existe
    try {
        $n = (int)$pdo->query("SELECT COUNT(*) FROM worldcup_matches")->fetchColumn();
        if ($n > 0) return;
    } catch (Exception $e) { return; }

    // [data, hora, nome, fase, brasil]  — placar começa vazio (preenchido depois)
    $seed = [
        ['2026-06-11', '',      'Abertura da Copa 2026',  'Cerimônia',                  0],
        ['2026-06-13', '19:00', 'Brasil x Marrocos',      'Fase de grupos · 1ª rodada', 1],
        ['2026-06-19', '21:30', 'Brasil x Haiti',         'Fase de grupos · 2ª rodada', 1],
        ['2026-06-24', '19:00', 'Escócia x Brasil',       'Fase de grupos · 3ª rodada', 1],
        ['2026-07-19', '',      'Final da Copa 2026',     'Final',                      0],
    ];
    $now = gmdate('Y-m-d\TH:i:s.000\Z');
    $stmt = $pdo->prepare("INSERT INTO worldcup_matches
        (id, match_date, match_time, name, stage, brazil, result, position, created_at)
        VALUES (?,?,?,?,?,?, '', ?, ?)");
    $pos = 0;
    foreach ($seed as [$d, $t, $nm, $st, $br]) {
        $id = 'wc-' . substr(md5($d . '|' . $nm), 0, 10);
        try { $stmt->execute([$id, $d, $t, $nm, $st, $br, $pos++, $now]); }
        catch (Exception $e) { /* ignora duplicado */ }
    }
}

/* ═══════════════════════════════════════════════════════════
   3. BOOTSTRAP — colunas padrão + admin TI inicial
   ═══════════════════════════════════════════════════════════ */
function _bootstrap_if_empty(PDO $pdo): array {
    $messages = [];

    $totalCols = (int)$pdo->query("SELECT COUNT(*) FROM columns")->fetchColumn();
    if ($totalCols === 0) {
        $stmt = $pdo->prepare("INSERT INTO columns (id, name, is_backlog, position, color, icon)
                               VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute(['backlog',     'Backlog',     1, 0, '#6b7280', '📥']);
        $stmt->execute(['em-andamento','Em Andamento',0, 1, '#f59e0b', '⚙️']);
        $stmt->execute(['concluido',   'Concluído',   0, 2, '#10b981', '✅']);
        $messages[] = 'Colunas padrão criadas (Backlog · Em Andamento · Concluído).';
    }

    // Sem administrador padrão com credenciais fixas: numa instalação nova
    // (banco sem usuários), a tela de login exibe o "primeiro acesso" para
    // criar a conta de administrador. O primeiro usuário vira TI-Dev e é
    // gravado como dono do sistema (ver register_user + set_owner_user_id).
    // Isso evita senha padrão no código e vincula o dono à instalação.

    return $messages;
}

/* ═══════════════════════════════════════════════════════════
   3b. MIGRAÇÃO MULTI-EQUIPE (v12) — idempotente, sem perder dados
   - Cria a equipe padrão "Projetos" e adota cards/colunas órfãos.
   - Garante todo usuário como membro da equipe padrão.
   - Cria a equipe pessoal de cada usuário (+ 3 colunas pessoais).
   ═══════════════════════════════════════════════════════════ */
function _migrate_teams(PDO $pdo): array {
    // Só roda se as tabelas/colunas de equipe já existem
    $hasTeams = (int)$pdo->query("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='teams'")->fetchColumn();
    if (!$hasTeams) return [];

    $msgs = [];
    $now = gmdate('Y-m-d\TH:i:s.000\Z');
    $DEFAULT = 'team-default';

    $roleMap = function ($globalRole) {
        return [
            'ti'        => 'gestor',
            'gestor'    => 'gestor',
            'analista'  => 'analista',
            'visitante' => 'visitante',
        ][$globalRole] ?? 'analista';
    };

    $users = $pdo->query("SELECT user_id, role FROM users WHERE is_active = 1")->fetchAll(PDO::FETCH_ASSOC);

    // 1/2/3) RESGATE DE DADOS LEGADOS (one-shot):
    //   Só criamos a equipe "Projetos" se existirem cards/colunas órfãos
    //   (instalação single-board antiga). NÃO existe mais "equipe padrão"
    //   automática: novos usuários NÃO são vinculados a nenhuma equipe comum —
    //   começam apenas com o quadro pessoal e fazem o tour de onboarding.
    $orphanCols  = (int)$pdo->query("SELECT COUNT(*) FROM columns WHERE team_id IS NULL")->fetchColumn();
    $orphanCards = (int)$pdo->query("SELECT COUNT(*) FROM cards WHERE team_id IS NULL")->fetchColumn();
    if ($orphanCols || $orphanCards) {
        $hasDefault = (int)$pdo->query("SELECT COUNT(*) FROM teams WHERE id='$DEFAULT'")->fetchColumn();
        if (!$hasDefault) {
            $pdo->prepare("INSERT INTO teams (id, name, description, type, owner_user_id, color, icon, created_at)
                           VALUES (?, 'Projetos', 'Quadro migrado da versão anterior', 'team', NULL, '#00796D', '🏢', ?)")
                ->execute([$DEFAULT, $now]);
            $msgs[] = 'Equipe "Projetos" criada para resgatar dados legados.';
        }
        if ($orphanCols)  { $pdo->exec("UPDATE columns SET team_id='$DEFAULT' WHERE team_id IS NULL"); $msgs[] = "$orphanCols coluna(s) legada(s) migrada(s)."; }
        if ($orphanCards) { $pdo->exec("UPDATE cards SET team_id='$DEFAULT' WHERE team_id IS NULL"); $msgs[] = "$orphanCards card(s) legado(s) migrado(s)."; }
        // Vincula os usuários existentes APENAS nesta migração legada (one-shot).
        $insMember = $pdo->prepare("INSERT OR IGNORE INTO team_members (team_id, user_id, role, joined_at, added_by)
                                    VALUES (?, ?, ?, ?, 'sistema')");
        foreach ($users as $usr) {
            $insMember->execute([$DEFAULT, $usr['user_id'], $roleMap($usr['role']), $now]);
        }
    }

    // 4) Equipe pessoal por usuário (+ 3 colunas pessoais)
    $insTeam = $pdo->prepare("INSERT OR IGNORE INTO teams (id, name, description, type, owner_user_id, color, icon, created_at)
                              VALUES (?, ?, 'Quadro pessoal', 'personal', ?, '#6244A0', '👤', ?)");
    $insPcol = $pdo->prepare("INSERT OR IGNORE INTO columns (id, name, is_backlog, position, color, icon, team_id)
                              VALUES (?, ?, ?, ?, ?, ?, ?)");
    $insPersonalMember = $pdo->prepare("INSERT OR IGNORE INTO team_members (team_id, user_id, role, joined_at, added_by)
                                        VALUES (?, ?, 'gestor', ?, 'sistema')");
    $createdPersonal = 0;
    foreach ($users as $usr) {
        $pid = 'personal-' . $usr['user_id'];
        $exists = (int)$pdo->query("SELECT COUNT(*) FROM teams WHERE id='" . str_replace("'","''",$pid) . "'")->fetchColumn();
        if ($exists) continue;
        $insTeam->execute([$pid, 'Meu Quadro', $usr['user_id'], $now]);
        $insPersonalMember->execute([$pid, $usr['user_id'], $now]);
        $insPcol->execute(["$pid-afazer",     'A Fazer',      1, 0, '#6b7280', '📋', $pid]);
        $insPcol->execute(["$pid-andamento",  'Em Andamento', 0, 1, '#f59e0b', '⚙️', $pid]);
        $insPcol->execute(["$pid-concluido",  'Concluído',    0, 2, '#10b981', '✅', $pid]);
        $createdPersonal++;
    }
    if ($createdPersonal) $msgs[] = "$createdPersonal quadro(s) pessoal(is) criado(s).";

    return $msgs;
}

/* ═══════════════════════════════════════════════════════════
   4. PASTAS AUXILIARES — backups e uploads + .htaccess
   ═══════════════════════════════════════════════════════════ */
function _ensure_aux_dirs(array &$messages): void {
    foreach (['backups.path', 'uploads.path'] as $key) {
        $path = cfg($key);
        if (!$path) continue;
        if (!is_dir($path)) {
            try { ensure_dir($path); $messages[] = "Pasta criada: $path"; }
            catch (Throwable $e) { /* sem permissão; ignorar silenciosamente */ }
        }
        $ht = rtrim($path, '/\\') . DIRECTORY_SEPARATOR . '.htaccess';
        if (is_dir($path) && !file_exists($ht)) {
            @file_put_contents($ht, "Require all denied\n");
        }
    }
}
