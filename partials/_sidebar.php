<?php $u = $u ?? current_user() ?? ['name'=>'—','role'=>'','user_id'=>'']; $role = $u['role'] ?? ''; ?>
<aside class="sidebar" id="sidebar">

  <div class="brand">
    <button class="icon-btn sidebar-close" id="btn-sidebar-close" title="Fechar menu" aria-label="Fechar menu">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
    <div class="brand-logo">
      <img src="<?= url('imagens/logo/logomarca.png') ?>" alt="Syncro Flow">
    </div>
    <div class="mode-pill online" id="sb-mode-pill" title="Status de conexão">
      <span class="dot"></span>
      <span id="sb-mode-text">Online</span>
    </div>
  </div>

  <nav class="nav" role="tablist" aria-label="Navegação principal">
    <div class="nav-section-label">Trabalho</div>
    <button type="button" class="nav-item" data-view="board" aria-pressed="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="10" rx="1"/></svg>
      Quadro <span class="nav-badge" id="nav-count-board">0</span>
    </button>
    <button type="button" class="nav-item" data-view="meudia">
      <span class="sf-ico" style="-webkit-mask-image:url('<?= url('imagens/icones/meu-dia.webp') ?>');mask-image:url('<?= url('imagens/icones/meu-dia.webp') ?>')" aria-hidden="true"></span>
      Meu Dia
    </button>
    <button type="button" class="nav-item" data-view="mypanel">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      Meu Painel
    </button>
    <button type="button" class="nav-item" data-view="calendar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>
      Calendário
    </button>
    <button type="button" class="nav-item" data-view="ferias">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18"/><path d="M8 2v4M16 2v4"/><path d="M8 14h3"/></svg>
      Ausências
    </button>

    <div class="nav-section-label" style="margin-top:8px;">Análise</div>
    <button type="button" class="nav-item" data-view="dashboard">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>
      Dashboard
    </button>
    <button type="button" class="nav-item" data-view="metrics">
      <span class="sf-ico" style="-webkit-mask-image:url('<?= url('imagens/icones/metricas.webp') ?>');mask-image:url('<?= url('imagens/icones/metricas.webp') ?>')" aria-hidden="true"></span>
      Métricas
    </button>
    <button type="button" class="nav-item" data-view="gantt">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h10M4 12h7M4 18h13M3 4v16"/></svg>
      Gantt
    </button>
    <button type="button" class="nav-item" data-view="ranking">
      <span class="sf-ico" style="-webkit-mask-image:url('<?= url('imagens/icones/ranking.webp') ?>');mask-image:url('<?= url('imagens/icones/ranking.webp') ?>')" aria-hidden="true"></span>
      Ranking
    </button>

    <div class="nav-section-label" style="margin-top:8px;">Pessoas</div>
    <button type="button" class="nav-item" data-view="equipes">
      <span class="sf-ico" style="-webkit-mask-image:url('<?= url('imagens/icones/equipes.webp') ?>');mask-image:url('<?= url('imagens/icones/equipes.webp') ?>')" aria-hidden="true"></span>
      Equipes
    </button>
    <button type="button" class="nav-item" data-view="usuarios">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="8" r="3"/><path d="M2.4 19a4.6 4.6 0 0 1 9.2 0"/><line x1="14.5" y1="8" x2="21" y2="8"/><line x1="14.5" y1="12" x2="21" y2="12"/><line x1="14.5" y1="16" x2="19" y2="16"/></svg>
      Usuários
    </button>

    <div class="nav-section-label" style="margin-top:8px;">Ajuda</div>
    <button type="button" class="nav-item" data-view="guia">
      <span class="sf-ico" style="-webkit-mask-image:url('<?= url('imagens/icones/guia.webp') ?>');mask-image:url('<?= url('imagens/icones/guia.webp') ?>')" aria-hidden="true"></span>
      Guia
    </button>
    <button type="button" class="nav-item" data-view="sobre">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.5" fill="currentColor"/></svg>
      Sobre
    </button>

    <?php if ($role === 'ti' || $role === 'suporte'): ?>
      <div class="nav-section-label" style="margin-top:8px;">Administração</div>
      <a class="nav-item" href="<?= url('admin.php') ?>">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <?= $role === 'ti' ? 'Configurações' : 'Armazenamento' ?>
      </a>
    <?php endif; ?>
  </nav>

  <div class="sidebar-footer">
    <?php require __DIR__ . '/tobi.php'; /* 🦫 mascote Tobi — vive em cima do rodapé */ ?>
    <button type="button" class="user-card" id="btn-go-mypanel" title="Abrir Meu Painel">
      <?php $uShow = trim((string)($u['display_name'] ?? '')) !== '' ? $u['display_name'] : ($u['name'] ?? '—'); ?>
      <div class="avatar"><?= san(strtoupper(substr($uShow ?: '?', 0, 1))) ?></div>
      <div class="user-info">
        <strong><?= san($uShow) ?></strong>
        <span class="role-badge role-<?= san($role) ?>"><?= san(role_label_global($role)) ?></span>
      </div>
    </button>
    <div class="sidebar-actions">
      <button class="icon-btn" id="btn-theme" title="Trocar tema">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
      <button class="icon-btn" id="btn-export" title="Exportar CSV">
        <span class="sf-ico" style="-webkit-mask-image:url('<?= url('imagens/icones/download.webp') ?>');mask-image:url('<?= url('imagens/icones/download.webp') ?>')" aria-hidden="true"></span>
      </button>
      <button class="icon-btn" id="btn-help" title="Ajuda / Atalhos">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg>
      </button>
      <a class="icon-btn" href="<?= url('logout.php') ?>" title="Sair">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
      </a>
    </div>
    <div class="dev-signature" title="Syncro Flow — Desenvolvido por Aurelio Sousa">SF · AG · v<?= san(cfg('app.version', '25.0')) ?></div>
  </div>
</aside>
<div class="sidebar-backdrop" id="sidebar-backdrop"></div>
