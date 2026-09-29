# Segurança e criptografia

## 1. Objetivo deste documento

Este documento explica, de forma direta, **como o SyncroFlow protege os dados** e responde à pergunta central:

> *"Um usuário não autorizado consegue acessar os dados?"*

## 2. Resumo executivo

- **Senhas**: nunca são guardadas em texto. Usamos **bcrypt (custo 12)** — padrão da indústria, resistente a força bruta.
- **Backups e logs**: criptografados em repouso com **AES-256-GCM** (chave de 256 bits).
- **Chave mestra**: 32 bytes aleatórios, guardada **fora da pasta web**, em arquivo oculto com permissão restrita.
- **Bancos de dados e config**: ficam **fora da raiz pública** do servidor — não são baixáveis pela URL.
- **Sessão**: cookie `HttpOnly`, `SameSite=Lax` e `Secure` (configurável para HTTPS).

**Conclusão:** um usuário não autorizado **não** consegue ler os dados sensíveis nas condições recomendadas. Ver as ressalvas na seção 8.

## 3. Senhas dos usuários

As senhas são processadas com `password_hash(..., PASSWORD_BCRYPT, ['cost' => 12])` e verificadas com `password_verify()`.

- O banco guarda apenas o **hash** (não a senha).
- O *cost* 12 torna cada tentativa de adivinhação cara, mitigando ataques de força bruta e de dicionário.
- A **resposta da pergunta de segurança** também é normalizada e guardada como hash bcrypt (custo 10).

Mesmo com acesso ao arquivo do banco, **não é possível "ler" as senhas** — só tentar quebrá-las, o que é inviável na prática para senhas razoáveis.

## 4. Criptografia em repouso (AES-256-GCM)

O módulo `lib/crypto.php` implementa criptografia autenticada **AES-256-GCM** (via extensão `openssl`).

### 4.1 Formato do dado cifrado
Cada blob tem a estrutura:

```
[ IV (12 bytes) | TAG de autenticação (16 bytes) | texto cifrado ]
```

- O **IV** (vetor de inicialização) é **aleatório por operação** (`random_bytes(12)`), evitando padrões.
- A **TAG** garante **integridade**: se o arquivo for adulterado, a descriptografia falha (não devolve dado corrompido silenciosamente).

### 4.2 O que é cifrado
- **Backups** do banco (`.db` → `.enc`), quando `backups.encrypt` está ligado.
- **Logs** de erro em repouso (cada linha vira um blob base64 opaco em `*.enc`).

## 5. A chave mestra

A chave é o ponto mais sensível do sistema.

- **Tamanho**: 32 bytes (256 bits), gerados com `random_bytes()` (gerador criptográfico).
- **Local**: `<pasta-de-dados>/.syncroflow.key` — ou seja, **junto ao banco, FORA da pasta web**.
- **Formato**: base64 em arquivo oculto, com permissão **0600** (só o dono lê/escreve).
- **Ciclo de vida**: criada automaticamente na primeira necessidade; reutilizada depois.

> **Regra de ouro:** quem tem a chave, lê os backups. Quem **não** tem a chave, vê apenas bytes inúteis. Por isso a chave **nunca** deve ficar na pasta pública nem ser versionada no Git.

## 6. Onde ficam os dados (fora da web)

Em produção, os caminhos do `config.json` apontam para **fora da raiz pública** (ex.: `C:/syncroflow-data/`):

- `syncroflow.db` — banco principal (usuários, cards, equipes, conquistas…);
- `photos.db` — banco separado de imagens (BLOBs);
- `.syncroflow.key` — chave mestra;
- backups `.enc` e logs `.enc`;
- `config.json` — configuração (também fora da web).

Como esses arquivos **não estão sob a URL pública**, não podem ser baixados digitando um endereço no navegador.

## 7. Controle de acesso na aplicação

- **Autenticação obrigatória**: toda página/endpoint exige login (`require_login`).
- **Papéis**: o acesso a recursos respeita o papel global (TI - Dev, TI - Sup, Usuário) e o papel **dentro de cada equipe**.
- **TI - Dev único**: apenas o administrador do sistema (o primeiro usuário cadastrado) é TI - Dev; o sistema se autocorrige e impede que outro usuário receba esse papel ou que o dono seja rebaixado/desativado.
- **Cadastro público nunca escolhe papel**: novos usuários entram como padrão.
- **Scripts de manutenção** (seed, init, diagnóstico) são bloqueados na web em produção (só rodam via linha de comando/localhost).

## 8. Um usuário não autorizado consegue acessar? (ressalvas honestas)

**Nas condições recomendadas, não.** Para que isso continue verdadeiro:

1. **Mantenha os dados fora da web.** Se o banco/chave forem colocados dentro da pasta pública, ficam baixáveis. (Hoje o `config.json` aponta para fora — mantenha assim.)
2. **Proteja o arquivo da chave.** Quem tiver acesso de leitura ao `.syncroflow.key` **e** aos backups `.enc` consegue descriptografar. Trate a chave como segredo máximo.
3. **Use HTTPS** e ligue `session.secure_cookie` para impedir captura de sessão na rede.
4. **`debug.display_errors` deve ficar `false`** em produção (hoje está ligado temporariamente para diagnóstico — desligue após validar).
5. **Acesso ao sistema operacional do servidor** dá acesso a tudo (chave + bancos). A criptografia protege **backups e logs em trânsito/cópias**, não substitui o controle de acesso ao servidor.

## 9. Recomendações

- Após estabilizar no servidor, **desligar `debug.display_errors`**.
- **Fazer backup da chave** `.syncroflow.key` em local seguro (sem ela, backups `.enc` antigos ficam irrecuperáveis).
- **Rotacionar senhas** do administrador periodicamente.
- Avaliar criptografar também o `photos.db` se as imagens contiverem dados sensíveis.

---
*Documento gerado automaticamente a partir do código-fonte (lib/crypto.php, lib/auth.php, lib/helpers.php). Em caso de mudança no código, regenere com `python docs/build_docs.py`.*
