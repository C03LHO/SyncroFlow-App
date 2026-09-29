import { isDoneColumn } from './state.js';
/* ═══ SyncroFlow — js/core/cardhelpers.js (v12)
   Helpers do card modal:
   - gerar descrição automática
   - gerar tags inteligentes
   - templates de subtarefa
   - paleta de cores de etiqueta
   - sugestões de planejamento */
import { state } from './state.js';

export const CHECKLIST_TEMPLATES = [
  { name: 'Revisão de projeto', items: ['Definir escopo', 'Identificar stakeholders', 'Revisar cronograma', 'Validar orçamento', 'Aprovar entregáveis'] },
  { name: 'Deploy / Entrega',   items: ['Revisar código', 'Executar testes', 'Atualizar documentação', 'Aprovar em homologação', 'Deploy em produção', 'Monitorar após deploy'] },
  { name: 'Onboarding',         items: ['Criar acesso ao sistema', 'Apresentar equipe', 'Enviar materiais de treinamento', 'Agendar reunião de alinhamento', 'Revisar após 1ª semana'] },
  { name: 'Análise de dados',   items: ['Coletar dados', 'Limpar e validar dados', 'Análise exploratória', 'Gerar relatório', 'Apresentar resultados'] },
  { name: 'Reunião',            items: ['Definir pauta', 'Confirmar participantes', 'Preparar material', 'Conduzir reunião', 'Registrar atas', 'Acompanhar ações'] },
];

export const COLOR_PALETTE = [
  { id: '',       label: 'Sem cor',  hex: null },
  { id: 'gold',   label: 'Dourado',  hex: '#D4A017' },
  { id: 'blue',   label: 'Azul',     hex: '#2563EB' },
  { id: 'green',  label: 'Verde',    hex: '#16A34A' },
  { id: 'red',    label: 'Vermelho', hex: '#DC2626' },
  { id: 'purple', label: 'Roxo',     hex: '#7C3AED' },
  { id: 'teal',   label: 'Ciano',    hex: '#0D9488' },
  { id: 'orange', label: 'Laranja',  hex: '#EA580C' },
];

/** Hex de uma cor da paleta (id ou hex direto). */
export function paletteHex(colorVal) {
  if (!colorVal) return null;
  if (colorVal.startsWith('#')) return colorVal;
  const p = COLOR_PALETTE.find(p => p.id === colorVal);
  return p ? p.hex : null;
}

/** Gera uma descrição estruturada e contextual a partir dos dados do card. */
export function generateDescription(ctx) {
  const title = String(ctx.title || '').trim();
  if (!title) return '';

  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const norm = (title + ' ' + (ctx.tags || []).join(' ')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const priority = ctx.priority || 'media';
  const subs = Array.isArray(ctx.subtasks) ? ctx.subtasks.filter(s => s && s.title) : [];
  const tags = Array.isArray(ctx.tags) ? ctx.tags : [];

  // Detecta o "tipo" de iniciativa para um verbo de objetivo mais natural
  const TYPES = [
    { re:/\b(deploy|release|implant|public|produc)/, verb:'Implantar', noun:'a entrega', crit:['Validar em homologação','Plano de rollback definido','Monitoramento pós-deploy'] },
    { re:/\b(bug|erro|falha|corrig|fix|hotfix)/,     verb:'Corrigir',  noun:'a falha',   crit:['Causa-raiz identificada','Correção testada','Sem regressões'] },
    { re:/\b(analis|relat[oó]rio|dados|dashboard|m[eé]trica)/, verb:'Analisar', noun:'os dados', crit:['Fontes de dados validadas','Conclusões documentadas','Resultados apresentados'] },
    { re:/\b(document|manual|guia|procedimento)/,    verb:'Documentar', noun:'o material', crit:['Conteúdo revisado','Aprovado pelos envolvidos','Publicado no local oficial'] },
    { re:/\b(reuni|alinhamento|workshop|treinamento|onboard)/, verb:'Conduzir', noun:'a atividade', crit:['Participantes confirmados','Material preparado','Ações registradas'] },
    { re:/\b(melhoria|otimiz|refator|simplific|process)/, verb:'Otimizar', noun:'o processo', crit:['Ganho mensurado','Validado com a área','Documentado'] },
    { re:/\b(implement|desenvolv|criar|construir|feature|funcionalidade)/, verb:'Desenvolver', noun:'a solução', crit:['Critérios de aceite atendidos','Testado','Revisado'] },
  ];
  const type = TYPES.find(t => t.re.test(norm));
  const verb = type ? type.verb : 'Conduzir';

  const visionCtx = {
    'Projetos': 'no contexto do portfólio de projetos',
    'Simplificação': 'com foco em simplificação de processos',
  }[ctx.vision] || 'alinhado às prioridades da equipe';

  const fmtBR = (iso) => iso && /^\d{4}-\d{2}-\d{2}/.test(iso)
    ? iso.slice(0,10).split('-').reverse().join('/') : '';

  const lines = [];

  // 🎯 Objetivo
  lines.push(`🎯 Objetivo`);
  lines.push(`${verb} "${cap(title)}", ${visionCtx}.`);

  // 📋 Contexto (prioridade + status)
  const prioTxt = {
    urgente: 'Prioridade URGENTE — exige ação imediata e acompanhamento próximo.',
    alta: 'Prioridade alta — deve avançar com atenção prioritária.',
    media: 'Prioridade média — encaixar no fluxo normal de trabalho.',
    baixa: 'Prioridade baixa — tratar conforme disponibilidade.',
  }[priority];
  const ctxParts = [prioTxt];
  if (ctx.columnName) ctxParts.push(`Situação atual: ${ctx.columnName}.`);
  lines.push('', `📋 Contexto`, ctxParts.join(' '));

  // 🧩 Escopo (subtarefas)
  if (subs.length) {
    lines.push('', `🧩 Escopo`);
    subs.slice(0, 8).forEach(s => lines.push(`• ${s.title}`));
    if (subs.length > 8) lines.push(`• … e mais ${subs.length - 8} item(ns).`);
  }

  // 👥 Responsável e prazo
  const rp = [];
  if (ctx.assignee) rp.push(`Responsável: ${ctx.assignee}.`);
  if (ctx.startDate && ctx.dueDate) rp.push(`Período: ${fmtBR(ctx.startDate)} → ${fmtBR(ctx.dueDate)}.`);
  else if (ctx.dueDate) rp.push(`Prazo de entrega: ${fmtBR(ctx.dueDate)}.`);
  if (rp.length) lines.push('', `👥 Responsável & prazo`, rp.join(' '));

  // ✅ Critérios de aceite
  const crit = (type ? type.crit : ['Critérios de aceite definidos e validados','Entregável revisado pelos envolvidos','Qualidade garantida na execução']);
  lines.push('', `✅ Critérios de aceite`);
  crit.forEach(c => lines.push(`• ${c}`));

  // 💰 Ganhos esperados
  const g = ctx.gains || {};
  const num = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };
  const horas = num(g.horasMes) || num(g.horasAno);
  const econ = num(g.economiaMes) || num(g.economiaAno);
  if (horas || econ) {
    const gp = [];
    if (num(g.horasMes)) gp.push(`${num(g.horasMes)}h/mês economizadas`);
    else if (num(g.horasAno)) gp.push(`${num(g.horasAno)}h/ano economizadas`);
    if (num(g.economiaMes)) gp.push(`R$ ${num(g.economiaMes).toLocaleString('pt-BR')}/mês`);
    else if (num(g.economiaAno)) gp.push(`R$ ${num(g.economiaAno).toLocaleString('pt-BR')}/ano`);
    lines.push('', `💰 Ganhos esperados`, gp.join(' · ') + '.');
  }

  // 🏷️ Tags
  if (tags.length) lines.push('', `🏷️ ${tags.map(t => '#' + t).join(' ')}`);

  return lines.join('\n').trim();
}

/** Gera tags inteligentes a partir do título + descrição. */
export function generateSmartTags(ctx) {
  const raw = String((ctx.title || '') + ' ' + (ctx.description || ''))
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const stop = new Set(['e','de','do','da','dos','das','o','a','os','as','para','com','por','em','no','na','nos','nas','um','uma','se','ao','como','que','sao','ser','ter','foi','sobre','entre','ate','sem','mais','tambem','caso','seja','dados','projeto','projetos','atividade','este','esta','isso','esse','essa','aqui','onde','quando','objetivo','entrega','execucao','andamento','foco','time','qual','sera']);
  const contextMap = [
    [/\b(deploy|produc|release|homolog)/, 'deploy'],
    [/\b(bug|erro|corre|fix|hotfix)/, 'correção'],
    [/\b(doc|documenta)/, 'documentação'],
    [/\b(reuni|alinhamento|meeting)/, 'reunião'],
    [/\b(analise|análise|relatorio|relatório|dados)/, 'análise'],
    [/\b(treino|treinamento|onboard)/, 'treinamento'],
    [/\b(urgent|cr[ií]tico|emerg)/, 'urgente'],
    [/\b(melhoria|otimiz|refator)/, 'melhoria'],
  ];
  const tags = new Set();
  contextMap.forEach(([re, tag]) => { if (re.test(raw)) tags.add(tag); });
  // palavras relevantes (>4 letras, não stopword)
  raw.split(/[^a-z0-9]+/).filter(w => w.length > 4 && !stop.has(w)).slice(0, 4).forEach(w => tags.add(w));
  return Array.from(tags).slice(0, 6);
}

/** Sugestões de planejamento (cards novos). */
export function buildPlanningSuggestions(titleVal) {
  const t = (titleVal || '').toLowerCase();
  const all = state.cards || [];
  const sug = [];
  const highKws = ['urgente','crítico','critico','bloqueado','emergência','emergencia','hotfix'];
  const lowKws  = ['doc','documentação','documentacao','cleanup','melhoria','refactor','refator'];
  if (highKws.some(k => t.includes(k))) sug.push({ field:'priority', val:'alta', label:'🔴 Alta prioridade' });
  else if (lowKws.some(k => t.includes(k))) sug.push({ field:'priority', val:'baixa', label:'🟢 Baixa prioridade' });

  // responsável com menor carga
  const workload = {};
  all.filter(c => !c.archived && !isDoneColumn(c.columnId)).forEach(c => { if (c.assignee) workload[c.assignee] = (workload[c.assignee]||0)+1; });
  const me = state.currentUser?.name;
  const users = Object.values(state.users || {}).map(u => u.name).filter(n => n && n !== me);
  if (users.length) {
    const lightest = users.slice().sort((a,b) => (workload[a]||0)-(workload[b]||0))[0];
    sug.push({ field:'assignee', val:lightest, label:'👤 ' + lightest + ' (' + (workload[lightest]||0) + ' cards)' });
  }
  // prazo médio
  const done = all.filter(c => isDoneColumn(c.columnId) && c.startDate && c.dueDate).slice(-10);
  if (done.length >= 2) {
    const avg = Math.round(done.reduce((s,c) => s + (new Date(c.dueDate) - new Date(c.startDate+'T00:00:00'))/86400000, 0) / done.length);
    const d = new Date(); d.setDate(d.getDate() + Math.max(1, avg));
    sug.push({ field:'dueDate', val: d.toISOString().slice(0,10), label:'📅 ' + d.toLocaleDateString('pt-BR') + ' (média: ' + avg + 'd)' });
  }
  // tags existentes que casam com o título
  const allTags = Array.from(new Set(all.flatMap(c => c.tags || [])));
  allTags.filter(tag => t.includes(tag.toLowerCase())).slice(0,3).forEach(tag => sug.push({ field:'tag', val:tag, label:'#'+tag }));
  return sug;
}

export function visionEnabled() { return !!(state.visionConfig && state.visionConfig.enabled); }
export function visionLabel()   { return (state.visionConfig && state.visionConfig.label) || 'Campo extra'; }
export function visionRequired(){ return !!(state.visionConfig && state.visionConfig.required); }
export function visionOptions() { return (state.visionConfig && state.visionConfig.options) || []; }
