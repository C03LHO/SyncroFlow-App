<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — partials/_styles.php
   CSS dividido por área. A ORDEM importa (cascata) — não reordene
   sem necessidade. Incluído no <head> de todas as páginas.
   Cada arquivo vive em css/parts/.
   ═══════════════════════════════════════════════════════════ */
$root = dirname(__DIR__);
$cssParts = [
    'css/parts/01-tokens.css',          // variáveis, :root, temas
    'css/parts/02-base-layout.css',     // base, app-shell, sidebar, main
    'css/parts/03-components.css',      // botões, forms, KPIs, topbar
    'css/parts/04-dashboard-gantt.css', // dashboard, gantt, abas do painel
    'css/parts/05-board.css',           // filter-bar, kanban
    'css/parts/06-modals.css',          // modal, confirm, comentários, toast, card modal
    'css/parts/07-calendar-trophies.css', // calendário, troféus
    'css/parts/08-pages.css',           // admin, meu painel, equipes, usuários, sobre, guia, responsivo
    'css/parts/09-extras.css',          // crop, preview, datepicker, filtros de calendário, etc.
    'css/parts/10-a11y.css',            // acessibilidade: skip link, painel, modos visuais, player
];
foreach ($cssParts as $f) {
    $ver = '?v=' . (@filemtime($root . '/' . $f) ?: cfg('app.version', '1'));
    echo '  <link rel="stylesheet" href="' . url($f) . $ver . '">' . "\n";
}
