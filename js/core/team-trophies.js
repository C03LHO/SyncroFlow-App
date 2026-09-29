/* ═══ SyncroFlow — js/core/team-trophies.js
   Troféus de EQUIPE — diferentes das conquistas individuais.
   São muito mais difíceis e exigem esforço coletivo de todos os
   membros. Avaliados sobre as estatísticas agregadas da equipe
   (lib/teams.php › team_stats). Quando conquistados, aparecem no
   Perfil da Equipe e no perfil de cada membro. */

export const TEAM_TROPHY_RARITY = {
  raro:     { bg: '#3B82F6', label: 'Raro' },
  epico:    { bg: '#A855F7', label: 'Épico' },
  lendario: { bg: '#F59E0B', label: 'Lendário' },
  mitico:   { bg: '#EF4444', label: 'Mítico' },
};

export const TEAM_TROPHIES = [
  // Volume coletivo de entregas
  { id:'t-centena',     name:'Centena Coletiva',   icon:'💯', rarity:'raro',     description:'A equipe concluiu 100 cards juntos.',                 check: s => s.concluded >= 100 },
  { id:'t-imparavel',   name:'Imparável',          icon:'🔥', rarity:'epico',    description:'250 cards concluídos pela equipe.',                   check: s => s.concluded >= 250 },
  { id:'t-meio-milhar', name:'Meio Milhar',        icon:'🏅', rarity:'lendario', description:'500 cards concluídos — uma máquina de entregas.',     check: s => s.concluded >= 500 },
  { id:'t-milhar',      name:'Lenda Viva',         icon:'👑', rarity:'mitico',   description:'1.000 cards concluídos pela equipe.',                 check: s => s.concluded >= 1000 },

  // Ganhos financeiros coletivos
  { id:'t-cofre',       name:'Cofre de Ouro',      icon:'🏦', rarity:'epico',    description:'R$100.000+ em economia mensal agregada.',             check: s => s.economyMonth >= 100000 },
  { id:'t-fortuna',     name:'Fortuna Coletiva',   icon:'💎', rarity:'mitico',   description:'R$1.000.000+ em economia mensal agregada.',           check: s => s.economyMonth >= 1000000 },
  { id:'t-mil-horas',   name:'Mil Horas',          icon:'⏱️', rarity:'lendario', description:'1.000h+ economizadas pela equipe.',                   check: s => s.hoursMonth >= 1000 },

  // Colaboração
  { id:'t-forca-tarefa',name:'Força-Tarefa',       icon:'👥', rarity:'raro',     description:'10+ membros na equipe.',                              check: s => s.members >= 10 },
  { id:'t-sinergia',    name:'Sinergia',           icon:'💬', rarity:'epico',    description:'500+ comentários trocados nos cards da equipe.',      check: s => s.comments >= 500 },
  { id:'t-exercito',    name:'Exército de Tarefas',icon:'🧩', rarity:'lendario', description:'1.000+ subtarefas concluídas pela equipe.',           check: s => s.subtasksDone >= 1000 },
  { id:'t-todos-juntos',name:'Todos a Bordo',      icon:'🤝', rarity:'epico',    description:'8+ membros diferentes concluíram cards.',             check: s => s.contributors >= 8 },

  // Disciplina / consistência
  { id:'t-zero-atraso', name:'Zero Atrasos',       icon:'🛡️', rarity:'lendario', description:'50+ cards concluídos e NENHUM card atrasado.',        check: s => s.concluded >= 50 && s.overdue === 0 },
  { id:'t-veterana',    name:'Equipe Veterana',    icon:'🎖️', rarity:'epico',    description:'1 ano de estrada e 100+ entregas.',                   check: s => s.ageDays >= 365 && s.concluded >= 100 },
];

/** Avalia quais troféus a equipe conquistou, a partir das stats. */
export function getTeamTrophies(stats) {
  if (!stats) return [];
  return TEAM_TROPHIES.filter(t => { try { return !!t.check(stats); } catch { return false; } });
}
