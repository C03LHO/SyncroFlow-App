import { isDoneColumn } from './state.js';
/* ═══ SyncroFlow — js/core/trophies.js
   Catálogo de troféus.
   E lógica de checagem baseada em stats do estado atual. */
import { state } from './state.js';
import { isCopaSeason } from './holidays.js';

export const RARITY_COLORS = {
  comum:     { bg: '#9CA3AF', label: 'Comum' },
  incomum:   { bg: '#10B981', label: 'Incomum' },
  raro:      { bg: '#3B82F6', label: 'Raro' },
  epico:     { bg: '#A855F7', label: 'Épico' },
  lendario:  { bg: '#F59E0B', label: 'Lendário' },
  vergonha:  { bg: '#7F1D1D', label: 'Vergonha' },
  copa:      { bg: '#009739', label: 'Copa 2026' },
};

export const TROPHIES_DEF = [
  { id:'primeiro-sangue', name:'Primeiro Sangue',          icon:'🩸', description:'Concluir o 1° card',                                     rarity:'comum',    check: s => s.totalConcluded >= 1 },
  { id:'engatinhando',    name:'Engatinhando',              icon:'🐣', description:'Concluir 5 cards',                                        rarity:'comum',    check: s => s.totalConcluded >= 5 },
  { id:'no-ritmo',        name:'No Ritmo',                  icon:'🎵', description:'Concluir 10 cards',                                       rarity:'comum',    check: s => s.totalConcluded >= 10 },
  { id:'maquina',         name:'Máquina',                   icon:'⚙️', description:'Concluir 25 cards',                                       rarity:'raro',     check: s => s.totalConcluded >= 25 },
  { id:'lendario',        name:'Lendário',                  icon:'👑', description:'Concluir 50 cards',                                       rarity:'epico',    check: s => s.totalConcluded >= 50 },
  { id:'centuriao',       name:'Centurião',                 icon:'🏛️', description:'Concluir 100 cards',                                      rarity:'lendario', check: s => s.totalConcluded >= 100 },
  { id:'sniper',          name:'Sniper',                    icon:'🎯', description:'Concluir um card exatamente na data de entrega',          rarity:'incomum',  check: s => s.concludedOnExactDate >= 1 },
  { id:'antecipado',      name:'Antecipado',                icon:'⚡', description:'Concluir um card 7+ dias antes do prazo',                rarity:'raro',     check: s => s.concludedEarly >= 1 },
  { id:'pontual-10',      name:'O Pontual',                 icon:'🕐', description:'Concluir 10 cards antes do prazo',                       rarity:'raro',     check: s => s.concludedBeforeDeadline >= 10 },
  { id:'corredor',        name:'Corredor',                  icon:'🏃', description:'7 dias consecutivos de atividade',                       rarity:'raro',     check: s => s.maxStreak >= 7 },
  { id:'maratonista',     name:'Maratonista',               icon:'🏅', description:'30 dias consecutivos de atividade',                      rarity:'epico',    check: s => s.maxStreak >= 30 },
  { id:'bombeiro',        name:'Bombeiro',                  icon:'🚒', description:'Concluir 3 cards de Alta prioridade na mesma semana',    rarity:'raro',     check: s => s.highPriorityWeekMax >= 3 },
  { id:'apagador',        name:'Apagador de Incêndio',      icon:'🔥', description:'Concluir 5 cards de Alta prioridade',                   rarity:'incomum',  check: s => s.highPriorityConcluded >= 5 },
  { id:'subtarefa-ninja', name:'Subtarefa Ninja',           icon:'🥷', description:'Concluir 50 subtarefas',                                 rarity:'raro',     check: s => s.subtasksCompleted >= 50 },
  { id:'mestre-subtarefas',name:'Mestre das Subtarefas',    icon:'🧩', description:'Concluir 100 subtarefas',                                rarity:'epico',    check: s => s.subtasksCompleted >= 100 },
  { id:'poupador',        name:'Poupador',                  icon:'🐷', description:'Registrar R$1.000+ de economia mensal',                  rarity:'incomum',  check: s => s.totalEconomy >= 1000 },
  { id:'muquirana',       name:'O Muquirana',               icon:'🤑', description:'Registrar R$10.000+ de economia',                        rarity:'lendario', check: s => s.totalEconomy >= 10000 },
  { id:'horas-roubadas',  name:'Ladrão de Horas',           icon:'⏰', description:'Registrar 100h+ salvas no sistema',                      rarity:'raro',     check: s => s.totalHoursSaved >= 100 },
  { id:'simplificador',   name:'Simplificador',             icon:'🔧', description:'Concluir 10 cards com Visão = Simplificação',            rarity:'raro',     check: s => s.simplificacaoConcluded >= 10 },
  { id:'estrategista',    name:'Estrategista',              icon:'🧠', description:'Concluir 10 cards com Visão = Projetos',                 rarity:'raro',     check: s => s.projetosConcluded >= 10 },
  { id:'comentarista',    name:'Comentarista',              icon:'💬', description:'Fazer 20 comentários em cards',                          rarity:'comum',    check: s => s.totalComments >= 20 },
  { id:'colaborador',     name:'Colaborador',               icon:'🤝', description:'Ser ajudante em 5 cards concluídos',                     rarity:'incomum',  check: s => s.helperConcluded >= 5 },
  { id:'workaholic',      name:'Workaholic Assumido',       icon:'💼', description:'Ter 10+ cards ativos ao mesmo tempo',                   rarity:'incomum',  check: s => s.maxSimultaneousActive >= 10 },
  { id:'zero-bala',       name:'Zero Bala',                 icon:'💀', description:'Deixar um card vencer por 7+ dias sem mover',           rarity:'vergonha', check: s => s.cardOverdue7Days >= 1 },
  { id:'procrastinador',  name:'Procrastinador Profissional',icon:'🛋️', description:'Ter 5 cards no Backlog por 30+ dias',                  rarity:'vergonha', check: s => s.backlogStale >= 5 },
  { id:'madrugador',      name:'Madrugador',                icon:'🦉', description:'5 atividades registradas entre 00h e 06h da manhã',     rarity:'incomum',  check: s => s.nightActivities >= 5 },
  { id:'primeiro-comentario',  name:'Primeiro Comentário',  icon:'💭', description:'Adicionou o primeiro comentário em um card',              rarity:'comum',    check: s => s.totalComments >= 1 },
  { id:'criador-responsavel',  name:'Iniciativa Própria',   icon:'✨', description:'Criou um card com você mesmo como responsável',           rarity:'comum',    check: s => s.cardsCreatedAsAssignee >= 1 },
  { id:'antes-do-prazo',       name:'Antes do Prazo',       icon:'⏰', description:'Concluiu um card antes da data de entrega',               rarity:'comum',    check: s => s.concludedBeforeDeadline >= 1 },
  { id:'taggador',             name:'Taggador',             icon:'🏷️', description:'Usou 5 tags diferentes em seus cards',                   rarity:'incomum',  check: s => s.uniqueTagsUsed >= 5 },
  { id:'organizador',          name:'Organizador',          icon:'📑', description:'Adicionou subtarefas a um card',                          rarity:'comum',    check: s => s.cardsWithSubtasks >= 1 },

  // ── Ocultos ──
  { id:'h-madrugador-login',  name:'???', icon:'🌅', description:'Conquista oculta', rarity:'raro',    hidden:true, check: s => s.loginBefore6am },
  { id:'h-noturno',           name:'???', icon:'🌙', description:'Conquista oculta', rarity:'raro',    hidden:true, check: s => s.loginAfter22h },
  { id:'h-produtivo',         name:'???', icon:'🚀', description:'Conquista oculta', rarity:'raro',    hidden:true, check: s => s.cardsConcludedSameDay >= 3 },
  { id:'h-antigo',            name:'???', icon:'🏛️', description:'Conquista oculta', rarity:'incomum', hidden:true, check: s => s.daysAsUser >= 30 },
  { id:'h-completista',       name:'???', icon:'✅', description:'Conquista oculta', rarity:'incomum', hidden:true, check: s => s.cardWithAllSubsDone >= 1 },
  { id:'h-silencioso',        name:'???', icon:'🤫', description:'Conquista oculta', rarity:'epico',   hidden:true, check: s => s.daysAsUser >= 30 && s.totalComments === 0 },
  { id:'h-maratonista-login', name:'???', icon:'🏃', description:'Conquista oculta', rarity:'epico',   hidden:true, check: s => s.loginStreak7 },
  { id:'h-velocista',         name:'???', icon:'⚡', description:'Conquista oculta', rarity:'raro',    hidden:true, check: s => s.cardsCreatedAndConcludedSameDay >= 1 },

  // ── Pacote estendido ──
  { id:'ext-fechamento-caixa', name:'Fechamento de Caixa', icon:'✅', description:'Concluir 1 card',  rarity:'comum',  check: s => s.totalConcluded >= 1 },
  { id:'ext-mao-na-roda',      name:'Mão na Roda',         icon:'🤲', description:'Concluir 5 cards', rarity:'comum',  check: s => s.totalConcluded >= 5 },
  { id:'ext-fim-fila',         name:'O Fim da Fila',       icon:'🏁', description:'Concluir 10 cards',rarity:'raro',   check: s => s.totalConcluded >= 10 },
  { id:'ext-dono-bola',        name:'O Dono da Bola',      icon:'👑', description:'Concluir 50 cards',rarity:'epico',  check: s => s.totalConcluded >= 50 },
  { id:'ext-zerou-kanban',     name:'Zerou o Kanban',      icon:'🏆', description:'Concluir 100 cards',rarity:'epico', check: s => s.totalConcluded >= 100 },
  { id:'ext-antecipado2',      name:'Antecipado',          icon:'🗓️', description:'Concluir 1 card antes do prazo',  rarity:'comum', check: s => s.concludedBeforeDeadline >= 1 },
  { id:'ext-futuro-chegou',    name:'O Futuro Chegou',     icon:'🚀', description:'Concluir 5 cards antes do prazo', rarity:'raro',  check: s => s.concludedBeforeDeadline >= 5 },
  { id:'ext-viajante-tempo',   name:'Viajante do Tempo',   icon:'⏳', description:'Concluir 10 cards antes do prazo',rarity:'epico', check: s => s.concludedBeforeDeadline >= 10 },
  { id:'ext-falante',          name:'O Falante',           icon:'💬', description:'Fazer 10 comentários',  rarity:'comum', check: s => s.totalComments >= 10 },
  { id:'ext-voz-escritorio',   name:'A Voz do Escritório', icon:'📣', description:'Fazer 50 comentários',  rarity:'raro',  check: s => s.totalComments >= 50 },
  { id:'ext-dicionario',       name:'Dicionário Ambulante',icon:'📖', description:'Fazer 100 comentários', rarity:'epico', check: s => s.totalComments >= 100 },
  { id:'ext-observador',       name:'O Observador',        icon:'👁️', description:'Concluir 5 cards sem nenhum comentário',  rarity:'comum', check: s => s.ext_cardsConcludedNoComments >= 5 },
  { id:'ext-mestre-silencio',  name:'Mestre do Silêncio',  icon:'🔇', description:'Concluir 20 cards sem nenhum comentário', rarity:'raro',  check: s => s.ext_cardsConcludedNoComments >= 20 },
  { id:'ext-lenda-quieta',     name:'A Lenda Quieta',      icon:'🔒', description:'Concluir 50 cards sem nenhum comentário', rarity:'epico', hidden:true, check: s => s.ext_cardsConcludedNoComments >= 50 },
  { id:'ext-detalhista',       name:'Detalhista',          icon:'✔️', description:'Criar 10 subtarefas',  rarity:'comum', check: s => s.ext_subtasksCreatedTotal >= 10 },
  { id:'ext-fatiador',         name:'O Fatiador',          icon:'✂️', description:'Criar 50 subtarefas',  rarity:'raro',  check: s => s.ext_subtasksCreatedTotal >= 50 },
  { id:'ext-desvendador-nos',  name:'Desvendador de Nós',  icon:'🧩', description:'Criar 100 subtarefas', rarity:'epico', check: s => s.ext_subtasksCreatedTotal >= 100 },
  { id:'ext-missao-cumprida',  name:'Missão Cumprida',     icon:'🎖️', description:'Concluir todas as subtarefas de 1 card',  rarity:'comum', check: s => s.cardWithAllSubsDone >= 1 },
  { id:'ext-sem-pontas',       name:'Sem Pontas Soltas',   icon:'🔗', description:'Concluir todas as subtarefas de 5 cards', rarity:'raro',  check: s => s.cardWithAllSubsDone >= 5 },
  { id:'ext-arrematador',      name:'O Arrematador',       icon:'📦', description:'Concluir todas as subtarefas de 10 cards',rarity:'epico', check: s => s.cardWithAllSubsDone >= 10 },
  { id:'ext-ideador',          name:'O Ideador',           icon:'💡', description:'Criar 10 cards',  rarity:'comum', check: s => s.ext_cardsCreatedTotal >= 10 },
  { id:'ext-fabrica-ideias',   name:'Fábrica de Ideias',   icon:'🏭', description:'Criar 50 cards',  rarity:'raro',  check: s => s.ext_cardsCreatedTotal >= 50 },
  { id:'ext-gerador',          name:'O Gerador',           icon:'⚙️', description:'Criar 100 cards', rarity:'epico', check: s => s.ext_cardsCreatedTotal >= 100 },
  { id:'ext-bom-samaritano',   name:'O Bom Samaritano',    icon:'💗', description:'Ser ajudante em 1 card',  rarity:'comum', check: s => s.ext_helperTotal >= 1 },
  { id:'ext-anjo-guarda',      name:'Anjo da Guarda',      icon:'🛡️', description:'Ser ajudante em 5 cards', rarity:'raro',  check: s => s.ext_helperTotal >= 5 },
  { id:'ext-heroi-silencioso', name:'O Herói Silencioso',  icon:'🙋', description:'Ser ajudante em 10 cards',rarity:'epico', hidden:true, check: s => s.ext_helperTotal >= 10 },
  { id:'ext-madrugador-cedo',  name:'O Madrugador',        icon:'🌅', description:'Acessar antes das 8h por 5 dias',  rarity:'comum', check: s => s.ext_loginsBefore8amDays >= 5 },
  { id:'ext-primeiro-fila',    name:'O Primeiro da Fila',  icon:'☕', description:'Acessar antes das 8h por 20 dias', rarity:'raro',  check: s => s.ext_loginsBefore8amDays >= 20 },
  { id:'ext-dono-chave',       name:'O Dono da Chave',     icon:'🔑', description:'Acessar antes das 8h por 50 dias', rarity:'epico', check: s => s.ext_loginsBefore8amDays >= 50 },
  { id:'ext-corujao',          name:'O Corujão',           icon:'🌙', description:'Acessar depois das 20h por 5 dias',  rarity:'comum', check: s => s.ext_loginsAfter20hDays >= 5 },
  { id:'ext-ultimo-sair',      name:'O Último a Sair',     icon:'🕒', description:'Acessar depois das 20h por 20 dias', rarity:'raro',  check: s => s.ext_loginsAfter20hDays >= 20 },
  { id:'ext-guardiao-noite',   name:'O Guardião da Noite', icon:'🌌', description:'Acessar depois das 20h por 50 dias', rarity:'epico', hidden:true, check: s => s.ext_loginsAfter20hDays >= 50 },
  { id:'ext-etiquetador',      name:'O Etiquetador',       icon:'🏷️', description:'Adicionar 10 tags em cards',  rarity:'comum', check: s => s.ext_tagsAddedTotal >= 10 },
  { id:'ext-indexador',        name:'O Indexador',         icon:'🔖', description:'Adicionar 50 tags em cards',  rarity:'raro',  check: s => s.ext_tagsAddedTotal >= 50 },
  { id:'ext-bibliotecario',    name:'O Bibliotecário',     icon:'📚', description:'Adicionar 100 tags em cards', rarity:'epico', check: s => s.ext_tagsAddedTotal >= 100 },
  { id:'ext-poupador-100',     name:'O Poupador',          icon:'🐷', description:'Registrar R$100 de economia/ganho',  rarity:'comum', check: s => s.totalEconomy >= 100 },
  { id:'ext-tesoureiro',       name:'O Tesoureiro',        icon:'👛', description:'Registrar R$500 de economia/ganho',  rarity:'raro',  check: s => s.totalEconomy >= 500 },
  { id:'ext-midas',            name:'O Midas',             icon:'💎', description:'Registrar R$1000 de economia/ganho', rarity:'epico', check: s => s.totalEconomy >= 1000 },
  { id:'ext-andarilho',        name:'O Andarilho',         icon:'↔️', description:'Mover 10 cards entre colunas',  rarity:'comum', check: s => s.ext_cardMovesTotal >= 10 },
  { id:'ext-malabarista',      name:'O Malabarista',       icon:'🔀', description:'Mover 50 cards entre colunas',  rarity:'raro',  check: s => s.ext_cardMovesTotal >= 50 },
  { id:'ext-fluxo-continuo',   name:'O Fluxo Contínuo',    icon:'🔁', description:'Mover 100 cards entre colunas', rarity:'epico', check: s => s.ext_cardMovesTotal >= 100 },
  { id:'ext-ritmo',            name:'O Ritmo',             icon:'📈', description:'Concluir 1 card/dia por 3 dias seguidos',  rarity:'comum', check: s => s.ext_dailyCompletionStreak >= 3 },
  { id:'ext-relogio',          name:'O Relógio',           icon:'⏱️', description:'Concluir 1 card/dia por 7 dias seguidos',  rarity:'raro',  check: s => s.ext_dailyCompletionStreak >= 7 },
  { id:'ext-maquina-ext',      name:'A Máquina',           icon:'🤖', description:'Concluir 1 card/dia por 30 dias seguidos', rarity:'epico', check: s => s.ext_dailyCompletionStreak >= 30 },
  { id:'ext-hacker-kanban',    name:'O Hacker do Kanban',  icon:'🕵️', description:'Descobriu 3 conquistas ocultas', rarity:'epico', hidden:true, check: s => s.ext_hiddenTrophiesUnlocked >= 3 },
  { id:'ext-faz-tudo',         name:'O Faz-Tudo',          icon:'🌀', description:'Concluir um card com subtarefa, comentário e tag', rarity:'raro', hidden:true, check: s => s.ext_fazTudoCard },
  // Conquista OCULTA: fazer amizade com o Tobi (interagir bastante com o mascote)
  { id:'h-amigo-tobi',         name:'Melhor Amigo do Tobi',icon:'🦫', description:'Conquista oculta',                                  rarity:'epico', hidden:true, check: s => s.tobiInteractions >= 30 },
  // Conquista OCULTA RARA: sacudir a barra de rolagem do Tobi rápido (terremoto!)
  { id:'terremoto',            name:'Terremoto',           icon:'🌋', description:'Conquista oculta',                                  rarity:'raro',  hidden:true, check: s => s.terremotoUnlocked },

  // ── Vergonha (engraçadas, justas e permanentes) ──
  { id:'verg-tartaruga',   name:'A Passos de Tartaruga', icon:'🐌',  description:'Deixar um card vencer sem concluir',                         rarity:'vergonha', check: s => s.overdueActiveCount >= 1 },
  { id:'verg-cemiterio',   name:'Cemitério de Cards',    icon:'🪦',  description:'Ter 5+ cards atrasados ao mesmo tempo',                       rarity:'vergonha', check: s => s.overdueActiveCount >= 5 },
  { id:'verg-congelado',   name:'Congelado no Tempo',    icon:'🧊',  description:'Ter um card atrasado há 14+ dias',                            rarity:'vergonha', check: s => s.maxOverdueDays >= 14 },
  { id:'verg-anonimo',     name:'O Anônimo',             icon:'📛',  description:'Manter um card "Sem título"',                                 rarity:'vergonha', check: s => s.untitledCards >= 1 },
  { id:'verg-sem-hora',    name:'Sem Hora pra Acabar',   icon:'🕳️', description:'Ter 3+ cards ativos sem prazo definido',                      rarity:'vergonha', check: s => s.noDuedateActive >= 3 },
  { id:'verg-fantasma',    name:'Card Fantasma',         icon:'👻',  description:'Ter 3+ cards totalmente vazios (sem descrição, subtarefa, comentário ou tag)', rarity:'vergonha', check: s => s.emptyCards >= 3 },
  { id:'verg-indeciso',    name:'Indeciso Profissional', icon:'🎢',  description:'Mover cards 150+ vezes entre colunas',                        rarity:'vergonha', check: s => s.ext_cardMovesTotal >= 150 },
  { id:'verg-silencio',    name:'Voto de Silêncio',      icon:'🤐',  description:'Concluir 15 cards sem escrever um único comentário',          rarity:'vergonha', check: s => s.ext_cardsConcludedNoComments >= 15 },

  // ── Copa 2026 (comemorativas, permanentes) ──
  // "Artilheiro" é ULTRA-RARA e limitada a 3 pessoas no sistema inteiro:
  // a posse só é confirmada pelo servidor (api/achievements.php → claim_limited),
  // que recusa a 4ª pessoa em diante. Aqui marcamos `limited: 3` para o cliente
  // tentar reivindicar quando a condição bater.
  { id:'copa-torcedor',  name:'Clima de Copa',  icon:'🎉', description:'Concluir um card durante a Copa do Mundo 2026',                 rarity:'copa', permanent:true, check: s => s.concludedDuringCopa >= 1 },
  { id:'copa-craque',    name:'Craque da Rodada',icon:'🏆', description:'Concluir 10 cards durante a Copa do Mundo 2026',                rarity:'copa', permanent:true, check: s => s.concludedDuringCopa >= 10 },
  { id:'copa-artilheiro',name:'Artilheiro',     icon:'⚽', description:'Top 3 do sistema: 25 cards concluídos durante a Copa 2026 (só 3 vagas!)', rarity:'copa', permanent:true, limited:3, check: s => s.concludedDuringCopa >= 25 },
];

/* Conquistas dessas raridades são PERMANENTES: uma vez desbloqueadas,
   nunca somem — mesmo que a condição deixe de valer (ex.: você corrigiu
   o card atrasado, mas a "vergonha" fica registrada). */
export const PERMANENT_RARITIES = new Set(['comum', 'vergonha']);
function _permaKey(me) { return 'sf_perma_trophies_' + me; }
function _loadPerma(me) {
  try { return new Set(JSON.parse(localStorage.getItem(_permaKey(me)) || '[]')); }
  catch { return new Set(); }
}
function _savePerma(me, set) {
  try { localStorage.setItem(_permaKey(me), JSON.stringify([...set])); } catch {}
}

export const TITLES_DEF = [
  { id:'novato',               name:'Novato',                     condition:'Padrão inicial' },
  { id:'cadete',               name:'Cadete',                     condition:'5 cards concluídos',                check: s => s.totalConcluded >= 5 },
  { id:'especialista',         name:'Especialista',               condition:'20 cards concluídos',               check: s => s.totalConcluded >= 20 },
  { id:'veterano',             name:'Veterano',                   condition:'50 cards concluídos',               check: s => s.totalConcluded >= 50 },
  { id:'elite',                name:'Elite',                      condition:'100 cards concluídos',              check: s => s.totalConcluded >= 100 },
  { id:'o-pontual',            name:'O Pontual',                  condition:'10 cards entregues antes do prazo', check: s => s.concludedBeforeDeadline >= 10 },
  { id:'apagador-incendio',    name:'Apagador de Incêndio',       condition:'5 cards Alta prioridade concluídos',check: s => s.highPriorityConcluded >= 5 },
  { id:'mestre-subtarefas-t',  name:'Mestre das Subtarefas',      condition:'100 subtarefas concluídas',         check: s => s.subtasksCompleted >= 100 },
  { id:'o-muquirana',          name:'O Muquirana 🤑',             condition:'R$10.000+ de economia registrada',  check: s => s.totalEconomy >= 10000 },
  { id:'ladrao-horas',         name:'Ladrão de Horas ⏰',         condition:'100h+ salvas no sistema',           check: s => s.totalHoursSaved >= 100 },
  { id:'rei-simplicidade',     name:'Rei da Simplicidade',        condition:'15+ cards Simplificação',           check: s => s.simplificacaoConcluded >= 15 },
  { id:'arquiteto',            name:'Arquiteto',                  condition:'15+ cards Projetos',                check: s => s.projetosConcluded >= 15 },
  { id:'workaholic-title',     name:'Workaholic Assumido',        condition:'10+ cards ativos simultâneos',      check: s => s.maxSimultaneousActive >= 10 },
  { id:'madrugador-title',     name:'Coruja do Sistema',          condition:'5 atividades entre 00h–06h',        check: s => s.nightActivities >= 5 },
];

/** Calcula stats simples do usuário a partir do estado. */
export function computeUserStats(me) {
  const cards = state.cards || [];
  const mine = cards.filter(c => c.assignee === me);
  const conclude = mine.filter(c => isDoneColumn(c.columnId));

  const concludedBeforeDeadline = conclude.filter(c => {
    if (!c.dueDate || !c.updatedAt) return false;
    return new Date(c.updatedAt) < new Date(c.dueDate + 'T23:59:59');
  }).length;
  const concludedEarly = conclude.filter(c => {
    if (!c.dueDate || !c.updatedAt) return false;
    const diff = (new Date(c.dueDate) - new Date(c.updatedAt)) / 86400000;
    return diff >= 7;
  }).length;

  const subsDone = mine.reduce((acc, c) => {
    const flat = (subs) => subs.reduce((a, s) => a + (s.done?1:0) + flat(s.subtasks||[]), 0);
    return acc + flat(c.subtasks || []);
  }, 0);
  const cardsWithAllSubsDone = mine.filter(c => {
    const all = (subs) => subs.length > 0 && subs.every(s => s.done && all(s.subtasks||[] || [s.done]));
    return all(c.subtasks||[]);
  }).length;

  const myComments = cards.reduce((a, c) =>
    a + (c.comments||[]).filter(cm => cm.user === me).length, 0);

  const totalEcon = mine.reduce((s,c) => s + (Number(c.gains?.economiaMes)||0), 0);
  const totalHours = mine.reduce((s,c) => s + (Number(c.gains?.horasMes)||0), 0);

  const highPriorityConcluded = conclude.filter(c => c.priority === 'alta' || c.priority === 'urgente').length;
  const simplificacaoConcluded = conclude.filter(c => c.vision === 'Simplificação').length;
  const projetosConcluded = conclude.filter(c => c.vision === 'Projetos').length;

  const uniqueTagsUsed = new Set(mine.flatMap(c => c.tags || [])).size;
  const cardsWithSubtasks = mine.filter(c => (c.subtasks||[]).length > 0).length;
  const cardsCreatedAsAssignee = mine.length;

  // ── Pacote estendido (computado quando possível) ──
  const countSubsAll = (subs) => subs.reduce((a, s) => a + 1 + countSubsAll(s.subtasks||[]), 0);
  const ext_subtasksCreatedTotal = mine.reduce((a, c) => a + countSubsAll(c.subtasks||[]), 0);
  const ext_tagsAddedTotal = mine.reduce((a, c) => a + (c.tags||[]).length, 0);
  const ext_cardsConcludedNoComments = conclude.filter(c => !(c.comments||[]).length).length;
  const ext_helperTotal = cards.filter(c => (c.helpers||[]).includes(me)).length;
  const ext_fazTudoCard = conclude.some(c => (c.subtasks||[]).length && (c.comments||[]).length && (c.tags||[]).length);
  const ext_cardMovesTotal = cards.reduce((a, c) =>
    a + (c.history||[]).filter(h => h.user === me && /mov|colun|status/i.test(h.action||'')).length, 0);

  // ── Stats para conquistas "Vergonha" (justas e computáveis do estado) ──
  const _now = new Date();
  const active = mine.filter(c => !isDoneColumn(c.columnId));
  const _overdue = (c) => c.dueDate && new Date(c.dueDate + 'T23:59:59') < _now;
  const overdueActiveCount = active.filter(_overdue).length;
  const maxOverdueDays = active.reduce((mx, c) => {
    if (!_overdue(c)) return mx;
    const d = Math.floor((_now - new Date(c.dueDate + 'T23:59:59')) / 86400000);
    return Math.max(mx, d);
  }, 0);
  const noDuedateActive = active.filter(c => !c.dueDate).length;
  const untitledCards = mine.filter(c => {
    const t = (c.title || '').trim().toLowerCase();
    return t === '' || t === 'sem título' || t === 'sem titulo';
  }).length;
  const emptyCards = mine.filter(c =>
    !(c.description || '').trim() &&
    !(c.subtasks || []).length &&
    !(c.comments || []).length &&
    !(c.tags || []).length
  ).length;

  return {
    totalConcluded: conclude.length,
    concludedBeforeDeadline,
    concludedEarly,
    concludedOnExactDate: 0,  // simplificado
    maxStreak: 0,             // backend calcularia
    highPriorityWeekMax: 0,
    highPriorityConcluded,
    subtasksCompleted: subsDone,
    cardWithAllSubsDone: cardsWithAllSubsDone,
    totalEconomy: totalEcon,
    totalHoursSaved: totalHours,
    simplificacaoConcluded,
    projetosConcluded,
    totalComments: myComments,
    helperConcluded: 0,
    cardOverdue7Days: 0,
    backlogStale: 0,
    nightActivities: 0,
    loginBefore6am: false,
    loginAfter22h: false,
    cardsConcludedSameDay: 0,
    daysAsUser: 0,
    cardsCreatedAndConcludedSameDay: 0,
    maxSimultaneousActive: mine.filter(c => !isDoneColumn(c.columnId)).length,
    cardsCreatedAsAssignee,
    cardsWithSubtasks,
    uniqueTagsUsed,
    loginStreak7: false,
    // pacote estendido
    ext_subtasksCreatedTotal,
    ext_tagsAddedTotal,
    ext_cardsConcludedNoComments,
    ext_helperTotal,
    ext_fazTudoCard,
    ext_cardMovesTotal,
    ext_cardsCreatedTotal: cardsCreatedAsAssignee,
    ext_loginsBefore8amDays: 0,
    ext_loginsAfter20hDays: 0,
    ext_dailyCompletionStreak: 0,
    ext_hiddenTrophiesUnlocked: 0,
    // vergonha
    overdueActiveCount,
    maxOverdueDays,
    noDuedateActive,
    untitledCards,
    emptyCards,
    // Copa 2026: cards concluídos dentro da janela do torneio
    concludedDuringCopa: conclude.filter(c => c.updatedAt && isCopaSeason(new Date(c.updatedAt))).length,
    // Interações com o mascote Tobi (cliques) — para a conquista oculta
    tobiInteractions: (() => { try { return parseInt(localStorage.getItem('sf_tobi_pokes') || '0', 10) || 0; } catch { return 0; } })(),
    terremotoUnlocked: (() => { try { return localStorage.getItem('sf_terremoto') === '1'; } catch { return false; } })(),
  };
}

export function getUnlockedTrophies(me) {
  const stats = computeUserStats(me);
  const liveSet = new Set(
    TROPHIES_DEF.filter(t => { try { return !!t.check(stats); } catch { return false; } }).map(t => t.id)
  );
  // Permanência: registra conquistas comuns/vergonha recém-obtidas e nunca as remove.
  const perma = _loadPerma(me);
  let changed = false;
  for (const t of TROPHIES_DEF) {
    const isPerma = PERMANENT_RARITIES.has(t.rarity) || t.permanent === true;
    // conquistas de edição limitada NÃO entram na permanência sozinhas:
    // só valem quando confirmadas pelo servidor (claimLimitedTrophies).
    if (isPerma && !t.limited && liveSet.has(t.id) && !perma.has(t.id)) {
      perma.add(t.id); changed = true;
    }
  }
  if (changed) _savePerma(me, perma);
  // União: vivas agora (exceto limitadas não confirmadas) + permanentes já conquistadas.
  return TROPHIES_DEF.filter(t => (liveSet.has(t.id) && !t.limited) || perma.has(t.id));
}

/** Reivindica no servidor as conquistas de edição limitada (ex.: Copa "Artilheiro",
 *  só 3 vagas). Deve ser chamada para o PRÓPRIO usuário logado ao abrir o painel.
 *  Retorna a lista de ids efetivamente concedidos agora. */
export async function claimLimitedTrophies(me) {
  const stats = computeUserStats(me);
  const perma = _loadPerma(me);
  const pending = TROPHIES_DEF.filter(t => t.limited && !perma.has(t.id) && (() => { try { return !!t.check(stats); } catch { return false; } })());
  if (!pending.length) return [];
  const { api } = await import('./api.js');
  const granted = [];
  for (const t of pending) {
    try {
      const r = await api.call('achievements.php', 'claim_limited', { trophyId: t.id, limit: t.limited });
      if (r && r.granted) { perma.add(t.id); granted.push(t.id); }
    } catch { /* offline/sem permissão: tenta de novo na próxima abertura */ }
  }
  if (granted.length) _savePerma(me, perma);
  return granted;
}

export function getUnlockedTitles(me) {
  const stats = computeUserStats(me);
  return TITLES_DEF.filter(t => {
    if (!t.check) return t.id === 'novato';
    try { return !!t.check(stats); } catch { return false; }
  });
}
