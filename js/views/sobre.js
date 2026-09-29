/* ═══ SyncroFlow — js/views/sobre.js
   Tela "Sobre" do sistema. */
import { state } from '../core/state.js';
import { escapeHTML } from '../core/dom.js';
import { fmtDateTime } from '../core/format.js';

const BENEFITS = [
  { i:'🎯', t:'Centralização total',     d:'Acabe com planilhas soltas e e-mails perdidos. Todas as iniciativas vivem num único quadro, com responsáveis, prazos e prioridades visíveis para todos.' },
  { i:'💰', t:'Ganhos que viram número', d:'Cada card registra economia mensal/anual e horas poupadas. A liderança enxerga o retorno do time em reais — não em achismos.' },
  { i:'👁️', t:'Visibilidade executiva',  d:'Dashboard, Gantt, calendário e Burndown mostram a saúde dos projetos em tempo real, prontos para qualquer reunião de status.' },
  { i:'🧾', t:'Governança e auditoria',  d:'Histórico imutável por card, comentários encadeados e trilha completa de quem fez o quê e quando — conformidade sem esforço.' },
  { i:'⚡', t:'Decisão mais rápida',     d:'Filtros, alertas de atraso e projeção de risco destacam o que precisa de atenção agora, reduzindo o tempo entre o problema e a ação.' },
  { i:'🔐', t:'Segurança por papel',     d:'Permissões granulares por sistema e por equipe garantem que cada pessoa veja e altere apenas o que lhe compete.' },
  { i:'🏢', t:'Multi-equipe escalável',  d:'Estilo Trello corporativo: cada área tem seu espaço isolado, e a TI mantém a visão consolidada de toda a organização.' },
  { i:'🏆', t:'Engajamento do time',     d:'Troféus, títulos e metas transformam boas práticas em hábito, elevando a adesão e a qualidade da operação.' },
];

const FEATURES = [
  { i:'🗂️', t:'Quadro Kanban',   d:'Arrastar-e-soltar otimista, painel de filtros com sprints, WIP limits e colunas recolhíveis.' },
  { i:'🃏', t:'Cards ricos',      d:'Subtarefas aninhadas, etiquetas de cor, prioridade, ganhos e pré-visualização ao passar o mouse.' },
  { i:'💬', t:'Comentários',      d:'Threads com respostas aninhadas, colapso e reações por emoji.' },
  { i:'📊', t:'Dashboard',        d:'KPIs, throughput, distribuição por responsável/prioridade e insights automáticos.' },
  { i:'📅', t:'Calendário',       d:'Grade mensal com cores por etiqueta, reagendamento arrastando o card, feriados por cidade e Copas do Mundo.' },
  { i:'📈', t:'Gantt',            d:'Linha do tempo por card, agrupada por coluna, com marcos e filtro de concluídos.' },
  { i:'📊', t:'Métricas de fluxo',d:'Lead time, cycle time, throughput e fluxo cumulativo (CFD).' },
  { i:'☀️', t:'Meu Dia',          d:'Suas tarefas de todas as equipes, agrupadas por urgência de prazo.' },
  { i:'🗓️', t:'Ausências',        d:'Férias, Atestado, Licença e Folga (extensível). Mapa colorido por tipo, painel por tipo, filtros e aprovação por gestor/TI da equipe.' },
  { i:'👤', t:'Meu Painel',       d:'KPIs pessoais, Burndown do mês e mapa de atividade (heatmap) com sequência.' },
  { i:'👥', t:'Multi-equipe',     d:'Quadros isolados por equipe, troca rápida e cargos por equipe.' },
  { i:'🛡️', t:'Permissões',       d:'Níveis globais (Usuário Padrão, TI - Sup, TI - Dev) e cargos por equipe.' },
  { i:'🏆', t:'Ranking & Ligas',  d:'Placar semanal por XP e ligas temáticas aquáticas (Girino → Leviatã) com promoção e rebaixamento toda sexta.' },
  { i:'🎖️', t:'Conquistas',       d:'Troféus e títulos desbloqueáveis conforme o uso.' },
  { i:'🎨', t:'Temas',            d:'Vários temas claros e escuros, com respeito a "reduzir movimento".' },
  { i:'🔐', t:'Backup seguro',    d:'Cópias automáticas diárias, criptografadas em AES-256-GCM.' },
];

export const sobre = {
  render(mount) {
    const ai = (state.system && state.system.aboutInfo) || { teamName:'SyncroFlow', docsUrl:'' };
    const totalUsers = Object.keys(state.users || {}).length;
    const totalCards = (state.cards || []).length;
    const version    = window.__CONFIG__?.version || '25.0';

    const hero = `
      <section class="sobre-hero">
        <img class="sobre-hero-tobi" src="imagens/mascote/sobre.webp" alt="Tobi tomando café" draggable="false">
        <h1 class="sobre-hero-title">Syncro Flow</h1>
        <p class="sobre-hero-tagline">Kanban para times que precisam de clareza, ritmo e ganhos mensuráveis.</p>
        <div class="sobre-hero-version">Versão <strong>v${escapeHTML(version)}</strong></div>
      </section>`;

    const why = `
      <section class="sobre-section">
        <h2 class="sobre-h2">Por que usar</h2>
        <p class="sobre-sub">Mais que um quadro de tarefas: uma plataforma de gestão que conecta a execução do time aos resultados que a sua organização quer ver.</p>
        <div class="sobre-cards">
          ${BENEFITS.map(b => `
            <div class="sobre-card">
              <div class="sobre-card-icon">${b.i}</div>
              <div class="sobre-card-title">${escapeHTML(b.t)}</div>
              <div class="sobre-card-desc">${escapeHTML(b.d)}</div>
            </div>`).join('')}
        </div>
      </section>`;

    const funcs = `
      <section class="sobre-section">
        <h2 class="sobre-h2">Funcionalidades</h2>
        <div class="sobre-features">
          ${FEATURES.map(f => `
            <div class="sobre-feature">
              <div class="sobre-feature-icon">${f.i}</div>
              <div>
                <div class="sobre-feature-title">${escapeHTML(f.t)}</div>
                <div class="sobre-feature-desc">${escapeHTML(f.d)}</div>
              </div>
            </div>`).join('')}
        </div>
      </section>`;

    const footer = `
      <section class="sobre-footer">
        <div class="sobre-footer-row"><span>Desenvolvido por:</span><strong>Aurelio Sousa</strong></div>
        ${ai.docsUrl ? `<div class="sobre-footer-row"><span>Documentação:</span><a href="${escapeHTML(ai.docsUrl)}" target="_blank" rel="noopener">${escapeHTML(ai.docsUrl)}</a></div>` : ''}
        <div class="sobre-footer-row"><span>Versão:</span><strong>v${escapeHTML(version)}</strong></div>
        <div class="sobre-footer-row"><span>Build:</span><strong>SF-AG-2026-V24</strong></div>
        <div class="sobre-footer-row"><span>Usuários cadastrados:</span><strong>${totalUsers}</strong></div>
        <div class="sobre-footer-row"><span>Cards no sistema:</span><strong>${totalCards}</strong></div>
        <div class="sobre-footer-row"><span>Servidor:</span><strong>${escapeHTML(location.host)}</strong></div>
        <div class="sobre-footer-row" style="grid-column:1/-1;color:var(--text-muted);font-size:11px;text-align:center;justify-content:center;border-top:1px solid var(--border);padding-top:10px;margin-top:6px;">© 2026 — SyncroFlow · Todos os direitos reservados</div>
      </section>`;

    mount.innerHTML = `<div class="sobre-page">${hero}${why}${funcs}${footer}</div>`;
  }
};
