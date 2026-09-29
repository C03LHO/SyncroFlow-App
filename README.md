# 🌊 SyncroFlow

> Kanban para times que precisam de clareza, ritmo e ganhos mensuráveis — com métricas, gamificação e multi-equipe.

![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4?logo=php&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white)
![Sem build](https://img.shields.io/badge/build-nenhum-2ea44f)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)

SyncroFlow é um sistema web de gestão de fluxo de trabalho (Kanban) com **dashboards, métricas de fluxo, gamificação (ligas e conquistas) e múltiplas equipes**. Foi feito para ser **simples de implantar**: PHP + SQLite, sem Composer, sem npm e sem etapa de build — publicar é copiar a pasta.

## ✨ Destaques

- **Quadro Kanban** com arrastar-e-soltar, filtros, raias (swimlanes), limites de WIP, sprints e colunas recolhíveis.
- **Cards completos**: subtarefas aninhadas, comentários com reações, etiquetas, prioridade, dependências, campos personalizados e registro de ganhos (horas/economia).
- **Visualizações**: Dashboard, Gantt, Calendário, Métricas de fluxo (lead/cycle time, throughput, CFD), Meu Painel e Meu Dia.
- **Multi-equipe**: quadros isolados por equipe, com cargos por equipe, convites e férias/ausências.
- **Gamificação**: ligas semanais por XP (do Girino ao Leviatã), troféus, títulos e o mascote Tobi.
- **Segurança**: login por e-mail, senhas com bcrypt, política de senha forte, limite de tentativas, sessão httpOnly e backups criptografados (AES-256-GCM).
- **Acessibilidade**: temas claro/escuro, modo de baixa visão, leitura tranquila, redução de movimento e atalhos de teclado.

## 🚀 Como rodar

**Pré-requisito:** PHP 7.4 ou superior com as extensões `pdo_sqlite`, `mbstring`, `openssl` e `fileinfo` (já vêm habilitadas na maioria das instalações).

```bash
git clone https://github.com/C03LHO/SyncroFlow-App.git
cd SyncroFlow-App
php -S localhost:8000
```

Abra **http://localhost:8000** e crie a conta de administrador — o primeiro usuário cadastrado administra o sistema. O banco de dados é criado sozinho na pasta `data/`.

Não é preciso configurar nada para rodar localmente: sem `config.json`, o sistema usa os padrões de `config.example.json`. Para personalizar (porta, caminhos, e-mail), copie o modelo:

```bash
cp config.example.json config.json
```

### Dados de demonstração (opcional)

Para ver o sistema já preenchido, com 12 usuários, 2 equipes e cards de exemplo:

```bash
php scripts/seed_demo.php
```

Entre com `demo01@syncroflow.local` (gestora) — ou `demo02` … `demo12` — e a senha `demo@2026`.

### Testes

```bash
php tests/auth_test.php
```

## 🧱 Stack

| Camada | Tecnologia |
|---|---|
| Backend | PHP 7.4+ com PDO — sem framework, sem Composer |
| Banco | SQLite (modo WAL) |
| Frontend | JavaScript em ES Modules nativos + CSS — sem framework, sem bundler |
| Sincronização | Polling a cada 5 s com *optimistic locking* por revisão |

## 📁 Estrutura

```
├── *.php            # páginas: login, cadastro, app, admin…
├── api/             # endpoints JSON (um arquivo por área)
├── lib/             # regras de negócio, banco, autenticação
├── partials/        # pedaços de página reutilizados
├── js/  css/        # frontend
├── imagens/         # logo, ícones, ligas e mascote
├── scripts/         # manutenção via linha de comando
├── tests/           # testes automatizados
└── docs/            # documentação
```

## 📚 Documentação

| Documento | Conteúdo |
|---|---|
| [Manual do usuário](docs/MANUAL_DO_USUARIO.md) | Como usar o quadro, cards, equipes e demais telas |
| [Deploy](docs/DEPLOY.md) | Publicar em produção (Apache, IIS ou nginx) |
| [Arquitetura](docs/ARQUITETURA.md) | Visão C4, estrutura de pastas e fluxos principais |
| [Modelo de dados](docs/MODELO_DE_DADOS.md) | Diagrama ER e grupos de tabelas |
| [API](docs/API.md) | Endpoints e ações |
| [Autenticação](docs/AUTENTICACAO.md) | Login, cadastro, recuperação de senha e limites |
| [Segurança](docs/SEGURANCA.md) | Criptografia, chaves e onde ficam os dados |
| [Decisões técnicas](docs/DECISOES_TECNICAS.md) | Registros de decisão de arquitetura (ADRs) |

## 🔐 Configuração e segredos

- **Nunca** versione o `config.json` — ele guarda segredos (SMTP etc.) e já está no `.gitignore`.
- Banco, chave de criptografia, backups e logs ficam em `data/` localmente; em produção, aponte-os para fora da raiz web (veja o [Deploy](docs/DEPLOY.md)).
- O envio de e-mail é **opcional**: com `email.enabled: false` tudo funciona, exceto a recuperação de senha por e-mail.

## 🤝 Contribuindo

Veja o [CONTRIBUTING.md](CONTRIBUTING.md) para o fluxo de trabalho e o padrão de commits.

## 👤 Autor

Desenvolvido por **Aurelio Sousa** como projeto de portfólio e Trabalho de Conclusão de Curso (TCC).

## 📄 Licença

Distribuído sob a licença **MIT**. Veja [LICENSE](LICENSE).
