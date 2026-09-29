<?php
/* ═══════════════════════════════════════════════════════════
   Tobi — mascote pixel-art do SyncroFlow 🦫  (markup)
   Inclua este partial como PRIMEIRO filho de <div class="sidebar-footer">.
   O CSS (css/tobi.css) e o JS (js/tobi.js) cuidam
   do resto. As posições dos móveis são definidas pelo JS (CONFIG).

   Para DESLIGAR o Tobi: basta não incluir este partial.
   ═══════════════════════════════════════════════════════════ */
?>
<div class="tobi-scene" id="tobi-scene">
  <div class="tobi-floor"></div>

  <!-- máquina de café -->
  <div class="tobi-cm">
    <div class="tb-cm-top"></div><div class="tb-cm-screen"></div><div class="tb-cm-btn"></div>
    <div class="tb-cm-group"></div><div class="tb-cm-spout"></div><div class="tb-cm-tray"></div>
  </div>

  <!-- lixeira -->
  <div class="tobi-trash" id="tobi-trash"><div class="tb-tlid"></div><div class="tb-can"></div></div>

  <!-- cadeira -->
  <div class="tobi-chair" id="tobi-chair"><div class="tb-back"></div><div class="tb-seat"></div><div class="tb-leg"></div></div>

  <!-- sofá -->
  <div class="tobi-sofa">
    <div class="tb-slegL"></div><div class="tb-slegR"></div><div class="tb-base"></div>
    <div class="tb-sback"></div><div class="tb-sseat"></div><div class="tb-armL"></div><div class="tb-armR"></div>
  </div>

  <!-- bancada + notebook -->
  <div class="tobi-desk">
    <div class="tb-top"></div><div class="tb-legB"></div><div class="tb-legF"></div>
    <div class="tb-kb"></div><div class="tb-lid"></div>
  </div>

  <!-- mochila parada no pé da mesa -->
  <div class="tobi-backpack" id="tobi-backpack">
    <div class="tb-bp-body"></div><div class="tb-bp-pocket"></div>
    <div class="tb-bp-strap"></div><div class="tb-bp-top"></div>
  </div>

  <!-- copo descartado -->
  <div class="tobi-cup" id="tobi-cup"></div>

  <!-- o Tobi -->
  <div class="tobi" id="tobi" data-state="work">
    <div class="tobi-bubble" id="tobi-bubble">sou o Tobi</div>
    <canvas id="tobi-canvas" width="54" height="60" aria-hidden="true"></canvas>
  </div>
</div>
