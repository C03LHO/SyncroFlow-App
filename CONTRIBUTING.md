# Contribuindo com o SyncroFlow

Obrigado pelo interesse em contribuir! Este guia resume o fluxo de trabalho.

## Pré-requisitos

- **PHP 7.4+** (com `pdo_sqlite`, `mbstring`, `openssl`, `fileinfo`).
- Opcional: **Node.js** apenas para `node --check` em arquivos `.js` (não há build).

## Configurando o ambiente

```bash
git clone <seu-fork> syncroflow && cd syncroflow
php -S localhost:8000
# abra http://localhost:8000 e crie o administrador no primeiro acesso
php scripts/seed_demo.php   # opcional: popula dados de demonstração
```

Sem `config.json`, o sistema usa os padrões de `config.example.json`. Para testar
outra configuração sem mexer no `config.json`, crie um `config.local.json`
(ignorado pelo Git), que tem prioridade.

## Rodando as verificações antes de abrir um PR

```bash
# Lint de sintaxe PHP em todos os arquivos alterados
php -l caminho/do/arquivo.php

# Testes automatizados
php tests/auth_test.php

# (opcional) checagem de sintaxe dos módulos JS alterados
node --check caminho/do/arquivo.js
```

O CI (GitHub Actions) roda o lint de PHP de todo o projeto e os testes a cada push/PR.

## Padrão de commits — Conventional Commits

Use o prefixo adequado no título do commit:

| Prefixo | Quando usar |
|---|---|
| `feat:` | nova funcionalidade |
| `fix:` | correção de bug |
| `refactor:` | mudança de código sem alterar comportamento |
| `style:` | formatação / CSS / espaços (sem lógica) |
| `docs:` | documentação |
| `test:` | testes |
| `chore:` | infra, build, dependências, tarefas gerais |

Exemplo: `feat(board): adiciona filtro por sprint no quadro`.

Faça **commits atômicos** (uma mudança lógica por commit) com mensagens claras.

## Estilo de código

- **PHP**: siga o estilo existente (PDO direto, funções pequenas, sem framework). Escape saída para HTML com `san()`. Use *prepared statements* sempre.
- **JavaScript**: ES Modules nativos, sem dependências externas. Escape conteúdo dinâmico com `escapeHTML()`.
- **CSS**: use as *custom properties* (variáveis) definidas em `css/parts/01-tokens.css`.
- **Segurança**: valide entradas, nunca concatene SQL, nunca exponha segredos.

## Abrindo um Pull Request

1. Crie uma branch a partir da `main`: `git checkout -b feat/minha-feature`.
2. Faça os commits atômicos.
3. Garanta que `php tests/auth_test.php` passa e que não há erros de lint.
4. Abra o PR descrevendo **o quê** e **por quê**.

## Reportando bugs

Abra uma *issue* com: passos para reproduzir, comportamento esperado x observado, versão do PHP e do sistema operacional.
