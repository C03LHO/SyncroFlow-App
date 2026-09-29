<p align="center">
  <img src="docs/screenshots/banner.webp" alt="SyncroFlow — Kanban com métricas, ligas e um castor que torce por você" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/PHP-7.4%2B-777BB4?logo=php&logoColor=white" alt="PHP 7.4+">
  <img src="https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/JavaScript-ES%20Modules-F7DF1E?logo=javascript&logoColor=black" alt="ES Modules">
  <img src="https://img.shields.io/badge/build-nenhum-2ea44f" alt="Sem build">
  <img src="https://img.shields.io/badge/licen%C3%A7a-MIT-blue" alt="Licença MIT">
</p>

<p align="center">
  <b>Um quadro Kanban completo, bonito e divertido — que roda em qualquer lugar com PHP.</b><br>
  Sem Composer, sem npm, sem Docker, sem etapa de build: clone, rode um comando e pronto.
</p>

<p align="center">
  <a href="#-como-rodar">Como rodar</a> ·
  <a href="#-por-dentro">Prints</a> ·
  <a href="#-conheça-o-tobi">O mascote</a> ·
  <a href="#-recursos">Recursos</a> ·
  <a href="#-documentação">Documentação</a>
</p>

<br>

<p align="center">
  <img src="docs/screenshots/quadro.webp" alt="Quadro Kanban do SyncroFlow" width="100%">
</p>

## ✨ Por que o SyncroFlow?

- 🧭 **Clareza** — quadros por equipe, filtros, raias e indicadores mostram na hora o que está andando e o que travou.
- 📈 **Resultado mensurável** — cada card registra horas e dinheiro economizados; o dashboard transforma isso em projeção mensal e anual.
- 🏆 **Ritmo** — ligas semanais, quase 100 conquistas e um mascote que comemora (e dá bronca) junto com o time.
- 🪶 **Leveza** — PHP + SQLite em uma pasta. Publicar é copiar arquivos; o banco se cria sozinho.

## 🚀 Como rodar

Você só precisa do **PHP 7.4 ou superior** (com `pdo_sqlite`, `mbstring`, `openssl` e `fileinfo`, que já vêm na maioria das instalações).

```bash
git clone https://github.com/C03LHO/SyncroFlow-App.git
cd SyncroFlow-App
php -S localhost:8000
```

Abra **http://localhost:8000** e crie sua conta — o primeiro usuário vira o administrador. Não há nada para configurar: o banco é criado automaticamente na pasta `data/`.

**Quer ver tudo preenchido?** Gere dados de demonstração (12 pessoas, 4 equipes, 31 cards):

```bash
php scripts/seed_demo.php
```

e entre com `demo01@syncroflow.local` / `demo@2026`.

## 🖼 Por dentro

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/dashboard.webp" alt="Dashboard"><br><sub><b>Dashboard</b> — health score do quadro, insights automáticos e ganhos em horas e R$.</sub></td>
    <td width="50%"><img src="docs/screenshots/card.webp" alt="Card aberto"><br><sub><b>Card</b> — subtarefas, responsáveis, datas, recorrência, ganhos e comentários.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/metricas.webp" alt="Métricas de fluxo"><br><sub><b>Métricas de fluxo</b> — lead time, cycle time, throughput, WIP, CFD e previsão de entrega.</sub></td>
    <td><img src="docs/screenshots/gantt.webp" alt="Gantt"><br><sub><b>Gantt</b> — linha do tempo por dia, semana ou mês, agrupada por coluna ou pessoa.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/calendario.webp" alt="Calendário"><br><sub><b>Calendário</b> — entregas do mês com feriados nacionais e datas comemorativas.</sub></td>
    <td><img src="docs/screenshots/meu-painel.webp" alt="Meu Painel"><br><sub><b>Meu Painel</b> — seus números, suas equipes, conquistas e atividade.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/equipes.webp" alt="Equipes"><br><sub><b>Equipes</b> — quadros isolados, cargos por equipe, convites e pedidos de entrada.</sub></td>
    <td><img src="docs/screenshots/login.webp" alt="Tela de login"><br><sub><b>Login</b> — acesso por e-mail, senha forte e recuperação por link.</sub></td>
  </tr>
</table>

### 🌙 Tema escuro e celular

<table>
  <tr>
    <td width="72%"><img src="docs/screenshots/quadro-escuro.webp" alt="Quadro no tema escuro"></td>
    <td width="28%" align="center"><img src="docs/screenshots/celular.webp" alt="SyncroFlow no celular"></td>
  </tr>
</table>

São **8 temas** (claro, escuro, sage, dusk, sand, dracula, cyberpunk e abyss) e a interface se adapta ao celular.

## 🦫 Conheça o Tobi

O **Tobi** é o castor-engenheiro que acompanha o time. Ele apresenta o sistema no primeiro acesso, vive em **pixel art na barra lateral** — onde trabalha, toma café e reage ao quadro ("socorrooo, atrasou!") — e aparece nas horas de comemorar.

<p align="center">
  <img src="imagens/mascote/feliz.webp" alt="Tobi feliz" height="130">
  <img src="imagens/mascote/esperto.webp" alt="Tobi com uma ideia" height="130">
  <img src="imagens/mascote/joinha.webp" alt="Tobi fazendo joinha" height="130">
  <img src="imagens/mascote/duvida.webp" alt="Tobi em dúvida" height="130">
  <img src="imagens/mascote/atividades.webp" alt="Tobi com a prancheta" height="130">
</p>

<p align="center">
  <img src="docs/screenshots/tour.webp" alt="Tour de boas-vindas com o Tobi" width="85%"><br>
  <sub>O tour de boas-vindas destaca cada parte da interface, passo a passo.</sub>
</p>

## 🏆 Ligas e conquistas

Toda semana, cada card concluído vale XP (bônus se foi no prazo). As pessoas sobem e descem por **10 ligas** de tema aquático:

<p align="center">
  <img src="imagens/ligas/girino.webp" alt="Girino" width="62" title="Girino">
  <img src="imagens/ligas/peixe.webp" alt="Peixe" width="62" title="Peixe">
  <img src="imagens/ligas/caranguejo.webp" alt="Caranguejo" width="62" title="Caranguejo">
  <img src="imagens/ligas/tartaruga.webp" alt="Tartaruga" width="62" title="Tartaruga">
  <img src="imagens/ligas/arraia.webp" alt="Arraia" width="62" title="Arraia">
  <img src="imagens/ligas/polvo.webp" alt="Polvo" width="62" title="Polvo">
  <img src="imagens/ligas/golfinho.webp" alt="Golfinho" width="62" title="Golfinho">
  <img src="imagens/ligas/tubarao.webp" alt="Tubarão" width="62" title="Tubarão">
  <img src="imagens/ligas/kraken.webp" alt="Kraken" width="62" title="Kraken">
  <img src="imagens/ligas/leviata.webp" alt="Leviatã" width="62" title="Leviatã">
  <br>
  <sub>Girino → Peixe → Caranguejo → Tartaruga → Arraia → Polvo → Golfinho → Tubarão → Kraken → Leviatã</sub>
</p>

Além das ligas, há **98 conquistas individuais**, **13 troféus de equipe** e títulos para exibir no perfil.

## ♿ Acessível de verdade

<img src="docs/screenshots/acessibilidade.webp" alt="Painel de acessibilidade" width="100%">

Um painel de acessibilidade sempre à mão, com perfis prontos (**baixa visão**, **leitura tranquila**, **foco no teclado**), tamanho de fonte, alto contraste, fonte mais legível, modo leitura, destaque de links e de foco, espaçamento de texto e redução de animações. Tudo também funciona pelo teclado.

## 🧩 Recursos

<table>
  <tr>
    <td valign="top" width="50%">

**Quadro e cards**
- Arrastar e soltar entre colunas, com WIP por coluna
- Filtros, raias (swimlanes) e visões salvas
- Subtarefas aninhadas com responsável e prazo
- Comentários com respostas e reações
- Etiquetas, prioridade, dependências entre cards
- Campos personalizados e modelos de card
- Cards recorrentes, arquivamento e aprovação
- Seleção em massa e busca global (<kbd>Ctrl</kbd>+<kbd>K</kbd>)

    </td>
    <td valign="top" width="50%">

**Gestão e análise**
- Múltiplas equipes com cargos por equipe
- Sprints, marcos e automações "quando… então…"
- Dashboard com health score e insights
- Métricas de fluxo e previsão de entrega
- Gantt, calendário e "Meu Dia"
- Férias e ausências com saldo por pessoa
- Mural de avisos com agendamento
- Exportação para CSV/Excel e relatório imprimível

    </td>
  </tr>
  <tr>
    <td valign="top">

**Segurança**
- Login por e-mail e senha forte obrigatória
- Senhas com bcrypt; limite de tentativas
- Sessão httpOnly e proteção contra CSRF
- Backups automáticos criptografados (AES-256-GCM)
- Dados fora da raiz web em produção

    </td>
    <td valign="top">

**Tempo real e praticidade**
- Sincronização entre usuários a cada 5 s
- Proteção contra edição simultânea do mesmo card
- Notificações no sistema e (opcional) por e-mail
- Atalhos: <kbd>N</kbd> novo card · <kbd>T</kbd> temas · <kbd>/</kbd> buscar
- Nenhuma dependência externa para instalar

    </td>
  </tr>
</table>

## 🧱 Como é feito

| Camada | Tecnologia |
|---|---|
| Backend | PHP 7.4+ com PDO — sem framework, sem Composer |
| Banco | SQLite em modo WAL (o schema se cria e se atualiza sozinho) |
| Frontend | JavaScript em ES Modules nativos + CSS modular — sem bundler |
| Sincronização | Polling a cada 5 s com *optimistic locking* por revisão |
| Testes | `php tests/auth_test.php` · CI no GitHub Actions (PHP 7.4 e 8.3) |

```
├── *.php         páginas (login, cadastro, app, admin…)
├── api/          endpoints JSON, um arquivo por área
├── lib/          regras de negócio, banco e autenticação
├── js/  css/     frontend
├── imagens/      logo, ícones, ligas e o Tobi
├── scripts/      manutenção pela linha de comando
├── tests/        testes automatizados
└── docs/         documentação
```

## 📚 Documentação

| | |
|---|---|
| [Manual do usuário](docs/MANUAL_DO_USUARIO.md) | Como usar o quadro, cards, equipes e as demais telas |
| [Deploy](docs/DEPLOY.md) | Publicar em produção (Apache, IIS ou nginx) |
| [Arquitetura](docs/ARQUITETURA.md) | Visão C4, estrutura de pastas e fluxos principais |
| [Modelo de dados](docs/MODELO_DE_DADOS.md) | Diagrama entidade-relacionamento |
| [API](docs/API.md) | Endpoints e ações |
| [Autenticação](docs/AUTENTICACAO.md) | Login, cadastro, recuperação de senha e limites |
| [Segurança](docs/SEGURANCA.md) | Criptografia, chaves e onde ficam os dados |
| [Decisões técnicas](docs/DECISOES_TECNICAS.md) | Por que o sistema é do jeito que é |

## 🤝 Contribuindo

Sugestões e melhorias são bem-vindas! O [CONTRIBUTING.md](CONTRIBUTING.md) explica como rodar, testar e o padrão de commits.

## 📄 Licença

[MIT](LICENSE) © Aurelio Sousa
