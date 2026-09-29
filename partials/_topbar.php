<?php $u = $u ?? current_user() ?? ['name'=>'—','role'=>'']; ?>
<div class="topbar">
  <button class="icon-btn menu-btn" id="btn-sidebar-toggle" title="Abrir menu" aria-label="Abrir menu">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h18M3 12h18M3 17h18"/></svg>
  </button>

  <div class="page-title-block">
    <span class="crumb" id="page-crumb">SyncroFlow</span>
    <h1 id="page-title">Quadro</h1>
  </div>

  <!-- Seletor de equipe (preenchido pelo main.js a partir de state.teams) -->
  <div class="team-switcher" id="team-switcher" hidden>
    <button class="team-switcher-btn" id="team-switcher-btn" aria-haspopup="true" aria-expanded="false">
      <span class="team-switcher-icon" id="team-switcher-icon">🏢</span>
      <span class="team-switcher-name" id="team-switcher-name">SyncroFlow</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="team-switcher-menu" id="team-switcher-menu" hidden></div>
  </div>

  <div class="topbar-center">
    <div class="search-input" role="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="global-search" type="text" placeholder="Buscar cards, tags, pessoas..." autocomplete="off" aria-label="Buscar cards, tags e pessoas" aria-keyshortcuts="/">
      <kbd aria-hidden="true">/</kbd>
    </div>
  </div>

  <div class="topbar-actions">
    <span class="conn-state">
      <span class="conn-dot conn-ok" id="conn-dot"></span>
      <span id="conn-text">Conectado</span>
      <span class="text-muted">·</span>
      <span class="version-label">v<?= san(cfg('app.version', '25.0')) ?></span>
    </span>
    <button class="icon-btn" id="btn-notifications" title="Notificações" aria-label="Notificações">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <span class="badge-dot" id="notif-dot" hidden></span>
    </button>
  </div>
</div>
