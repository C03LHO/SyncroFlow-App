<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — logout.php
   Destrói a sessão e volta para o login.
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/lib/helpers.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/auth.php';

logout();
flash('Sessão encerrada.', 'success');
redirect('login.php');
