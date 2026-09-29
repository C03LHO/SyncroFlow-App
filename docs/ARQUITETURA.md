# Arquitetura

Visão arquitetural do sistema no modelo **C4** (Contexto → Contêiner → Componente).

## Resumo

SyncroFlow é uma aplicação web **monolítica e server-rendered**, deliberadamente simples de implantar: **PHP + SQLite, sem etapa de build**. O backend expõe endpoints JSON sob `/api/`, e o frontend é composto por **ES Modules nativos** que consomem esses endpoints e recebem o estado inicial injetado pelo PHP (`window.__STATE__`). A sincronização entre usuários é feita por **polling** com *optimistic locking* por número de revisão.

## Nível 1 — Contexto

```mermaid
flowchart TB
    U[👤 Usuário<br/>gestor / analista / visitante]
    A[👤 Administrador<br/>TI-Dev]
    subgraph SF[Sistema SyncroFlow]
      APP[Aplicação web de Kanban<br/>métricas + gamificação]
    end
    MAIL[(Servidor SMTP<br/>opcional)]

    U -->|cria e move cards, comenta,<br/>acompanha métricas| APP
    A -->|gerencia usuários, equipes,<br/>configuração e backups| APP
    APP -->|recuperação de senha,<br/>avisos por e-mail| MAIL
```

## Nível 2 — Contêineres

```mermaid
flowchart TB
    subgraph Browser[Navegador]
      FE[Frontend<br/>ES Modules + CSS<br/>js/core · views · modals · ui]
    end
    subgraph Server[Servidor Web · PHP]
      PAGES[Páginas PHP<br/>login · app · admin · register]
      API[API JSON<br/>api/*.php ?action=…]
      LIB[Camada de domínio<br/>lib/*.php]
    end
    DB[(SQLite · WAL<br/>syncroflow.db)]
    PHOTOS[(SQLite<br/>photos.db · BLOBs)]

    FE -->|window.__STATE__ inicial| PAGES
    FE -->|fetch /api/*.php| API
    FE -->|polling /api/poll.php a cada 5s| API
    API --> LIB
    PAGES --> LIB
    LIB --> DB
    LIB --> PHOTOS
```

## Nível 3 — Componentes (backend)

```mermaid
flowchart LR
    B[api/_bootstrap.php<br/>headers, CSRF, erros] --> AUTH[lib/auth.php<br/>login, sessão, RBAC]
    B --> RBAC[lib/rbac.php<br/>permissões globais]
    AUTH --> DBH[lib/db.php<br/>PDO singleton]
    DBH --> SCHEMA[lib/schema.php<br/>auto-migrations]
    API1[api/cards.php] --> HYD[lib/hydrate.php<br/>monta objetos p/ o front]
    API1 --> REV[lib/revision.php<br/>cursor de polling]
    API1 --> TEAMS[lib/teams.php<br/>papéis por equipe]
    API1 --> DBH
    POLL[api/poll.php] --> REV
    POLL --> HYD
```

## Princípios de projeto

1. **Sem build.** Deploy = copiar a pasta. Nenhum bundler, nenhuma dependência instalável.
2. **Arquivos planos.** Cada `api/<entidade>.php` cuida de uma área, roteada por `?action=`.
3. **Auto-migrations permissivas.** `ALTER TABLE` em `try/catch`; o schema se monta sozinho no primeiro acesso.
4. **Estado injetado.** O PHP injeta `window.__STATE__` — o boot não faz *fetch* inicial.
5. **Optimistic locking.** Cada card tem `revision`; um PATCH conflitante recebe `409`.
6. **Polling barato.** `MAX(revision)` menor que o cursor do cliente → `304 Not Modified`.

## Concorrência e sincronização

O servidor é a fonte da verdade. Clientes fazem *polling* de `/api/poll.php?since=<rev>` a cada 5s; o servidor consolida as mudanças por entidade e devolve apenas o delta. Conflitos de edição de card são resolvidos por *optimistic locking* (campo `revision`).

## Estrutura de pastas

```
├── index.php  login.php  register.php  reset.php  logout.php  termos.php
├── app.php                  # aplicação (injeta window.__STATE__)
├── admin.php                # painel de administração
├── api/                     # endpoints JSON — um arquivo por área (?action=…)
├── lib/                     # domínio: db, schema, auth, rbac, teams, hydrate, leagues…
├── partials/                # pedaços de página: <head>, sidebar, topbar
├── js/                      # frontend em ES Modules (sem build)
│   ├── core/                # estado, API, roteador, regras de negócio no cliente
│   ├── views/               # uma tela por arquivo (quadro, dashboard, gantt…)
│   ├── modals/  ui/  a11y/  # modal do card, componentes, acessibilidade
│   └── tobi.js              # mascote animado
├── css/                     # CSS modular (parts/01-tokens … 10-a11y) + tobi.css
├── imagens/                 # logo, ícones, ligas e mascote (WebP)
├── scripts/                 # manutenção via linha de comando (init_db, seed_demo…)
├── tests/                   # testes automatizados (PHP puro)
└── docs/                    # esta documentação
```

## Fluxos principais

O fluxo completo de autenticação está em [AUTENTICACAO.md](AUTENTICACAO.md).

### Login (resumo)

```mermaid
sequenceDiagram
    participant U as Usuário
    participant L as login.php
    participant A as lib/auth.php
    participant DB as SQLite

    U->>L: POST e-mail + senha
    L->>A: rate limit (5 / 15 min por IP)?
    L->>A: login(email, senha)
    A->>DB: SELECT ... WHERE lower(email)=?
    A->>A: password_verify()
    alt Credenciais OK
        A->>DB: cria sessão + last_login
        L-->>U: 302 → app.php
    else Falha
        A->>DB: registra tentativa
        L-->>U: erro genérico ("E-mail ou senha inválidos")
    end
```

### Boot da aplicação (estado injetado)

```mermaid
sequenceDiagram
    participant U as Navegador
    participant APP as app.php
    participant H as lib/hydrate.php
    participant DB as SQLite

    U->>APP: GET /app.php (com sessão)
    APP->>H: build_initial_state(usuário)
    H->>DB: consulta equipes, colunas, cards, config…
    H-->>APP: snapshot do estado
    APP-->>U: HTML + window.__STATE__ (sem fetch inicial)
    U->>U: js/main.js lê o estado e monta a UI
    U->>APP: inicia polling /api/poll.php a cada 5s
```

### Mover um card (com optimistic locking e polling)

```mermaid
sequenceDiagram
    participant U1 as Usuário A
    participant API as api/cards.php
    participant REV as revision_log
    participant U2 as Usuário B (polling)

    U1->>API: POST ?action=move { id, columnId }
    API->>API: verifica permissão na equipe
    API->>API: UPDATE cards SET column_id, revision+1
    API->>REV: bump_revision('card', id, 'move')
    API-->>U1: 200 { card, revision }
    Note over U2: a cada 5s
    U2->>API: GET /api/poll.php?since=<rev>
    API->>REV: há revisão > since?
    alt Nada mudou
        API-->>U2: 304 Not Modified
    else Houve mudança
        API-->>U2: { revision, events:[card atualizado] }
        U2->>U2: aplica o delta na UI
    end
```

### Conflito de edição (409)

```mermaid
sequenceDiagram
    participant U as Usuário
    participant API as api/cards.php

    U->>API: PATCH ?action=update { id, revisionSeen, … }
    alt revisionSeen == revisão atual
        API-->>U: 200 (atualizado)
    else revisionSeen desatualizada
        API-->>U: 409 conflito { current: estado fresco }
        U->>U: mostra o estado atual e pede para refazer
    end
```

Veja também: [MODELO_DE_DADOS.md](MODELO_DE_DADOS.md) · [DECISOES_TECNICAS.md](DECISOES_TECNICAS.md) · [API.md](API.md)
