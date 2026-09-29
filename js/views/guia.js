/* ═══ SyncroFlow — js/views/guia.js
   Tela de guia do sistema. */
import { escapeHTML, $ } from '../core/dom.js';

const SECTIONS = [
  { id:'inicio', icon:'🚀', title:'Primeiros Passos', body:[
    { h:'Navegação', p:'A barra lateral agrupa as telas por contexto: <strong>Trabalho</strong> (Quadro, Meu Dia, Meu Painel, Calendário, Ausências), <strong>Análise</strong> (Dashboard, Métricas, Gantt, Ranking &amp; Ligas), <strong>Pessoas</strong> (Equipes, Usuários) e <strong>Ajuda</strong> (Guia, Sobre). Clique para alternar — ou use as teclas <kbd>1</kbd>–<kbd>9</kbd> para as telas mais usadas.' },
    { h:'Login', p:'Você entra com <strong>e-mail</strong> + senha. A sessão dura 8 horas por padrão e o status de conexão (Online/Offline) aparece no topo da barra lateral.' },
    { h:'Seu cartão', p:'No rodapé da barra lateral, clique no <strong>seu nome</strong> para abrir o Meu Painel. O distintivo ao lado mostra o seu cargo na <em>equipe ativa</em>.' },
    { tip:'Pressione <kbd>/</kbd> para focar a busca, <kbd>N</kbd> para criar um card e <kbd>?</kbd> (Shift) para ver todos os atalhos.' },
  ]},
  { id:'equipes', icon:'👥', title:'Equipes', body:[
    { h:'Troca rápida', p:'Use o seletor de equipe no topo para alternar entre seus quadros (pessoal, organização e equipes). A aba atual é preservada ao trocar — se você está no Gantt, continua no Gantt.' },
    { h:'Cada equipe é independente', p:'Colunas, cards, avisos, metas e o "campo extra" são configurados por equipe. O cargo (Gestor / TI da equipe / Analista / Visitante) também é por equipe.' },
    { h:'Gerenciar', p:'No Quadro, abra o menu <strong>⋯ Gerenciar</strong> (visível para Gestor e TI da equipe) → <strong>Gerenciar equipe</strong> para ver membros, dados gerais, configurações e histórico. Esse mesmo menu concentra Avisos, Colunas e Sprints.' },
  ]},
  { id:'cards', icon:'🗂️', title:'Cards', body:[
    { h:'Criar', p:'Clique em "+ Novo card" no Quadro ou pressione <kbd>N</kbd>. Preencha título, responsável, prioridade, entrega, etiqueta de cor e demais campos.' },
    { h:'Mover (arrastar)', p:'Arraste o card entre colunas — a mudança aparece na hora (atualização otimista) e fica registrada no histórico do card.' },
    { h:'Pré-visualização', p:'Passe o mouse sobre qualquer card (no Quadro ou no Calendário) para ver um resumo rico sem precisar abri-lo.' },
    { h:'Subtarefas', p:'Liste etapas dentro do card. Suportam aninhamento — uma subtarefa pode ter subtarefas, e o progresso é calculado automaticamente.' },
    { h:'Progresso', p:'Ajuste o andamento do card arrastando o controle deslizante (0 a 100%). Ao concluir, ele vai a 100% sozinho.' },
    { h:'Comentários', p:'Thread com respostas aninhadas e colapsáveis. Edite e apague apenas os seus. Apagar um comentário com respostas vira <code>[apagado]</code>, preservando a thread.' },
    { tip:'Conflito ao salvar? Outro usuário editou antes. Recarregue e tente de novo — é o controle otimista de concorrência protegendo seus dados.' },
  ]},
  { id:'board', icon:'📋', title:'Quadro (Kanban)', body:[
    { h:'Indicadores', p:'No topo, três indicadores essenciais — <strong>Ativos</strong>, <strong>Atrasados</strong> e <strong>Conclusão</strong>. Toque em <strong>+ mais</strong> para revelar os secundários (Concluídos, Vence hoje, Bloqueados, Urgentes). Todos respeitam os filtros ativos.' },
    { h:'Recolher colunas', p:'Clique no <strong>‹</strong> no cabeçalho de uma coluna para recolhê-la numa faixa estreita (e <strong>›</strong> para reabrir). A preferência fica salva por equipe.' },
    { h:'Filtros', p:'O botão <strong>Filtrar</strong> abre um painel com período, responsável, prioridade, status, etiqueta, <strong>sprint</strong> e campo extra. Os filtros ativos viram "chips" removíveis numa barra que você pode <strong>recolher</strong> pelo botão ao lado para ganhar espaço.' },
    { h:'Sprints', p:'No menu <strong>⋯ Gerenciar › Sprints</strong> você cria ciclos com início e fim. Depois é só filtrar o Quadro pelo sprint para focar no ciclo atual.' },
    { h:'Avisos', p:'Em <strong>⋯ Gerenciar › Publicar aviso</strong>, Gestores e TI publicam avisos (globais ou da equipe) no topo do Quadro. Dá para <strong>agendar</strong> início e expiração, definir <strong>recorrência</strong> e <strong>editar</strong> (✏️) um aviso já publicado. Cada pessoa pode dispensá-los.' },
  ]},
  { id:'mypanel', icon:'👤', title:'Meu Painel', body:[
    { h:'Visão geral', p:'KPIs pessoais (cards ativos, concluídos, atrasados, subtarefas), próximos vencimentos, ganhos estimados e o <strong>Burndown do mês</strong> (ideal × real).' },
    { h:'Mapa de atividade', p:'O heatmap mostra suas interações nas últimas 26 semanas, com sequência (streak) e melhor dia. Ele também aparece no perfil de outros usuários.' },
    { h:'Conquistas', p:'Aba de troféus e títulos desbloqueados conforme o seu uso do sistema (concluir cards, comentar, ajudar, manter ritmo).' },
    { h:'Editar perfil', p:'Atualize nome de exibição, cargo, bio, foto e capa — com recorte de imagem embutido.' },
  ]},
  { id:'arquivados', icon:'📦', title:'Cards Arquivados', body:[
    { h:'Regra de privacidade', p:'Você vê <strong>apenas</strong> os cards que <strong>você</strong> arquivou. Cards arquivados por outros ficam invisíveis para você — garantido em 3 camadas.' },
    { h:'Como desarquivar', p:'Meu Painel → aba Arquivados → abra o card → "Desarquivar".' },
  ]},
  { id:'dashboard', icon:'📊', title:'Dashboard', body:[
    { h:'Métricas do time', p:'Throughput, distribuição por responsável e prioridade, economia/horas estimadas e insights automáticos.' },
    { h:'Filtros', p:'Use a barra de filtros para focar em um responsável, período ou prioridade.' },
  ]},
  { id:'cal-gantt', icon:'📅', title:'Calendário e Gantt', body:[
    { h:'Calendário', p:'Grade mensal com os cards que têm entrega; cada card usa a cor da sua etiqueta e marca os atrasados. Arraste um card para outro dia para reagendar (atualização imediata). Inclui feriados por cidade (busca digitável) e as Copas do Mundo.' },
    { h:'Gantt', p:'Linha do tempo por card, agrupada por coluna, com <strong>marcos</strong>. Use "Mostrar Backlog" e "Mostrar concluídos" para incluir/ocultar esses cards (concluídos vêm ocultos por padrão, para não poluir).' },
  ]},
  { id:'metricas', icon:'📊', title:'Métricas de fluxo', body:[
    { h:'O que mostra', p:'<strong>Lead time</strong> (criação → conclusão), <strong>Cycle time</strong> (1ª movimentação → conclusão), <strong>Throughput</strong> (concluídos por semana), <strong>Fluxo cumulativo (CFD)</strong> e o <strong>WIP por coluna</strong>.' },
    { h:'Para que serve', p:'Enxergar gargalos e a saúde do fluxo da equipe ao longo do tempo. Escolha o período (30/90/180 dias ou tudo) no topo.' },
  ]},
  { id:'meudia', icon:'☀️', title:'Meu Dia', body:[
    { h:'Foco no que é seu', p:'Reúne <strong>as tarefas atribuídas a você em todas as equipes</strong>, agrupadas por urgência: atrasados, para hoje, esta semana, mais tarde e sem prazo. Clique num item para abrir o card (troca de equipe automaticamente).' },
  ]},
  { id:'ferias', icon:'🗓️', title:'Ausências', body:[
    { h:'Tipos de ausência', p:'A tela de <strong>Ausências</strong> controla <strong>Férias, Atestado, Licença e Folga</strong> (e novos tipos no futuro). Cada tipo tem sua cor no mapa; o <strong>Atestado</strong> aparece com listras. Filtre por tipo nos chips do topo e busque por pessoa.' },
    { h:'Saldo (só Férias)', p:'Só <strong>Férias</strong> consome o <strong>saldo de dias</strong> da pessoa (padrão 30) e o limite de até 3 períodos. Atestado, Licença e Folga são apenas registrados, sem descontar saldo.' },
    { h:'Pedir', p:'Em "Nova ausência", escolha o <strong>tipo</strong>, o período (pelo seletor de calendário do sistema) e <strong>qual equipe vai aprovar</strong>. O total de dias é calculado automaticamente.' },
    { h:'Aprovação e gestão', p:'O <strong>Gestor ou o TI da equipe</strong> escolhida aprova/recusa. Eles também podem <strong>lançar ausências já aprovadas</strong> de outros (ex.: migrar de uma planilha) e clicar numa barra do mapa para <strong>editar ou cancelar</strong> a ausência de qualquer pessoa.' },
    { h:'Painel e mapa', p:'O painel <strong>“Por tipo de ausência”</strong> conta cada tipo no ano, e o <strong>Mapa</strong> mostra todos ao longo do ano com marcador de <strong>Hoje</strong> e botão para voltar ao ano atual.' },
  ]},
  { id:'ranking', icon:'🏆', title:'Ranking e Ligas', body:[
    { h:'XP da semana', p:'Você ganha <strong>XP</strong> concluindo cards: 10 por card concluído + 5 se for no prazo. O placar zera toda semana.' },
    { h:'Ligas (tema aquático)', p:'São 10 ligas, da mais baixa à máxima: <strong>Girino → Peixe → Caranguejo → Tartaruga → Arraia → Polvo → Golfinho → Tubarão → Kraken → Leviatã</strong> (o Leviatã é o topo — a 1ª posição).' },
    { h:'Subir e descer', p:'A virada é <strong>toda sexta-feira</strong>: os primeiros da sua liga sobem, os últimos (que ficaram sem pontuar) descem, e o resto permanece.' },
    { h:'Selos', p:'A tela também mostra seus <strong>troféus/selos</strong> já conquistados.' },
  ]},
  { id:'niveis', icon:'🎖️', title:'Níveis e cargos', body:[
    { h:'Fora das equipes: 3 níveis', p:'No sistema existem apenas três níveis globais: <strong>Usuário Padrão</strong>, <strong>TI - Sup</strong> (suporte) e <strong>TI - Dev</strong> (administração). Quem se cadastra começa como Usuário Padrão.' },
    { h:'Cargos são por equipe', p:'A hierarquia (Gestor, TI da equipe, Analista, Visitante) vale <strong>dentro de cada equipe</strong> — você pode ser Gestor numa e Analista em outra. O distintivo no sistema acompanha a equipe ativa.' },
    { h:'Como mudar de cargo', p:'O Gestor ou o TI da equipe ajusta seu cargo em <em>Equipes › Gerenciar › Membros</em>. Não há solicitação de promoção global.' },
  ]},
  { id:'temas', icon:'🎨', title:'Temas e aparência', body:[
    { h:'Escolher tema', p:'Clique no ícone de lua/tema no rodapé da barra lateral. Há temas claros e escuros, além de variações como Sage, Dusk, Sand, Dracula, Cyberpunk e Abyss.' },
    { h:'Executivos (mais sério)', p:'Os temas <strong>Executivo Claro</strong> e <strong>Executivo Escuro</strong> usam exatamente as cores dos padrões Claro/Escuro, mas deixam o sistema mais sóbrio: o mascote <strong>Tobi some</strong> por completo. Ideal para apresentações e reuniões.' },
    { h:'Acessibilidade', p:'Se o seu sistema operacional estiver com "reduzir movimento" ativado, as animações são automaticamente desligadas. O mascote também pode ser desligado em Acessibilidade.' },
  ]},
  { id:'esqueci-senha', icon:'🔑', title:'Esqueci a senha', body:[
    { h:'Link por e-mail', p:'Na tela de login → "Esqueci minha senha" → informe seu <strong>e-mail</strong> → enviamos um <strong>link de redefinição</strong> para o e-mail cadastrado.' },
    { h:'Validade do link', p:'O link vale por <strong>60 minutos</strong> e só pode ser usado uma vez. Depois disso, basta solicitar um novo.' },
    { h:'Cadastre seu e-mail', p:'A recuperação usa o e-mail informado no cadastro. Mantenha-o atualizado em <em>Meu Painel</em> para não perder o acesso.' },
  ]},
  { id:'config', icon:'⚙️', title:'Administração (TI - Dev)', body:[
    { h:'Usuários', p:'Apenas TI - Dev: criar usuários, mudar o nível global (com auditoria em <code>role_history</code>), resetar senha, ativar/desativar.' },
    { h:'Colunas e metas', p:'A configuração de colunas, metas e campos do card é feita por equipe, em <em>Equipes › Gerenciar › Configurações</em>.' },
    { h:'Manutenção', p:'Ativar/agendar o modo manutenção, com mensagem visível para todos os usuários.' },
    { h:'Backup', p:'Manuais ou <strong>automáticos diários</strong>. Cópias criptografadas (AES-256-GCM). Os mais antigos são removidos conforme a política de retenção.' },
  ]},
];

export const guia = {
  render(mount) {
    const menu = SECTIONS.map(s =>
      `<button class="guia-menu-item" data-target="guia-sec-${s.id}">${s.icon} ${escapeHTML(s.title)}</button>`
    ).join('');

    const content = SECTIONS.map(s => {
      const blocks = s.body.map(b => {
        if (b.tip) return `<div class="guia-tip">💡 <strong>Dica:</strong> ${b.tip}</div>`;
        return `<div class="guia-block">
          ${b.h ? `<div class="guia-block-h">${escapeHTML(b.h)}</div>` : ''}
          <div class="guia-block-p">${b.p || ''}</div>
        </div>`;
      }).join('');
      return `<details class="guia-section" id="guia-sec-${s.id}" open>
        <summary>
          <span class="guia-sec-icon">${s.icon}</span>
          ${escapeHTML(s.title)}
          <span class="guia-sec-chev">▾</span>
        </summary>
        <div class="guia-section-body">${blocks}</div>
      </details>`;
    }).join('');

    const mockup = `
      <div class="guia-mockup">
        <div class="guia-mockup-title">Pré-visualização do Quadro</div>
        <div class="guia-mockup-board">
          <div class="guia-mockup-col">
            <div class="guia-mockup-col-h">Backlog</div>
            <div class="guia-mockup-card">📝 Card de exemplo</div>
          </div>
          <div class="guia-mockup-col">
            <div class="guia-mockup-col-h">Em Andamento</div>
            <div class="guia-mockup-card">⚙ Em desenvolvimento</div>
          </div>
          <div class="guia-mockup-col">
            <div class="guia-mockup-col-h">Concluído</div>
            <div class="guia-mockup-card guia-mockup-done">✓ Concluído</div>
          </div>
        </div>
      </div>`;

    mount.innerHTML = `
      <div class="guia-page">
        <div class="guia-header">
          <div>
            <h1 class="guia-title">📖 Guia de uso</h1>
            <p class="guia-sub">Tutorial completo para você dominar o sistema. Use a busca abaixo ou navegue pelo índice.</p>
          </div>
          <div class="guia-header-actions">
            <input type="search" id="guia-search" placeholder="🔍 Buscar tópico…" class="guia-search">
          </div>
        </div>
        <div class="guia-layout">
          <aside class="guia-menu">
            ${menu}
            <img class="guia-tobi" src="imagens/mascote/guia.webp" alt="Tobi" draggable="false">
          </aside>
          <main class="guia-content">${mockup}${content}</main>
        </div>
      </div>`;

    // Wire menu (scroll into view + abrir detail)
    mount.querySelectorAll('.guia-menu-item').forEach(b => {
      b.onclick = () => {
        const t = document.getElementById(b.dataset.target);
        if (t) {
          if (t.tagName === 'DETAILS' && !t.open) t.open = true;
          t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
    });
    // Wire search
    const search = mount.querySelector('#guia-search');
    if (search) search.addEventListener('input', () => {
      const q = (search.value || '').toLowerCase().trim();
      mount.querySelectorAll('.guia-section').forEach(sec => {
        const text = sec.textContent.toLowerCase();
        sec.style.display = (!q || text.includes(q)) ? '' : 'none';
      });
    });
  }
};
