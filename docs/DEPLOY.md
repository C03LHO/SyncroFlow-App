# Deploy em produção

O SyncroFlow não tem etapa de build: publicar é copiar a pasta para um servidor
com PHP 7.4+ (Apache, IIS ou nginx) e criar o `config.json`.

## 1. Copiar os arquivos

Copie a pasta do projeto para o servidor, **sem** `config.local.json` e sem
`data/` (são só do ambiente local).

## 2. Criar o `config.json`

```bash
cp config.example.json config.json
```

Aponte os caminhos de dados para uma pasta **fora da raiz web**, para que banco,
chave de criptografia, backups e logs nunca possam ser baixados pela URL:

```json
"database": { "path": "/var/syncroflow-data/syncroflow.db", "photos_path": "/var/syncroflow-data/photos.db" },
"backups":  { "path": "/var/syncroflow-data/backups" },
"uploads":  { "path": "/var/syncroflow-data/uploads" },
"debug":    { "log_path": "/var/syncroflow-data/syncroflow.log", "display_errors": false }
```

No Windows, use algo como `C:/syncroflow-data/...`. A pasta é criada sozinha.

- Em HTTPS, defina `session.secure_cookie: true`.
- Ajuste `app.base_url` para o endereço público (usado nos links de e-mail).
- E-mail é opcional: com `email.enabled: false` o sistema funciona normalmente,
  só sem recuperação de senha por e-mail.

## 3. Primeiro acesso

Os dois bancos (`syncroflow.db` e `photos.db`) são criados automaticamente no
primeiro acesso. A primeira tela pede para **criar a conta de administrador**;
não existe usuário nem senha padrão no código.

Opcionalmente, valide o ambiente pela linha de comando:

```bash
php scripts/diagnostico.php   # extensões, permissões e caminhos
php scripts/init_db.php       # cria/verifica os bancos e lista as tabelas
```

## 4. Segurança

- Os scripts de `scripts/` só rodam pela linha de comando ou em `localhost`;
  em produção respondem **404** (`lib/dev_only.php`).
- `.htaccess` (Apache) e `web.config` (IIS) bloqueiam `lib/`, `partials/`,
  `data/` e arquivos sensíveis. No nginx, bloqueie as mesmas pastas na
  configuração do site.
- **Não rode `scripts/seed_demo.php` em produção** — ele cria dados fictícios.

Detalhes em [SEGURANCA.md](SEGURANCA.md).

## 5. Checagem pós-deploy

1. O site abre na tela de login, sem erro de PHP.
2. Crie a conta de administrador e entre.
3. Crie um card e troque a foto de perfil (testa os dois bancos).
4. `https://seu-dominio/scripts/seed_demo.php` responde **404**.
