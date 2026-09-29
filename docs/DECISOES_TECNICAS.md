# Decisões técnicas (ADRs)

Registros de decisão de arquitetura (*Architecture Decision Records*). Cada ADR
descreve o **contexto**, a **decisão** e as **consequências**.

---

## ADR-001 — PHP + SQLite, sem framework

**Contexto.** O sistema precisa ser fácil de implantar em ambientes internos
variados (IIS/Apache/nginx), sem infraestrutura pesada, e mantido por poucas
pessoas.

**Decisão.** Usar **PHP puro (PDO) + SQLite**, sem framework, sem Composer.

**Consequências.**
- ✅ Deploy trivial (copiar a pasta); banco em arquivo, sem servidor de BD.
- ✅ Curva de aprendizado baixa; sem cadeia de dependências para auditar.
- ⚠️ Menos "trilhos" que um framework — convenções ficam por conta do projeto.
- ⚠️ SQLite é ótimo para times pequenos/médios; cargas muito concorrentes
  exigiriam migração para Postgres/MySQL (o uso de PDO facilita isso).

---

## ADR-002 — Sem etapa de build no frontend

**Contexto.** Evitar `npm`, bundlers e a manutenção de *toolchains* de frontend.

**Decisão.** Usar **ES Modules nativos** do navegador e CSS com *custom
properties*. O estado inicial é injetado pelo PHP (`window.__STATE__`).

**Consequências.**
- ✅ Zero build; o que está no repositório é o que roda.
- ✅ Boot rápido (sem *fetch* inicial de estado).
- ⚠️ Sem *tree-shaking*/minificação automática; mitigado por *lazy import* de módulos.

---

## ADR-003 — Sessão em cookie httpOnly (não JWT)

**Contexto.** Autenticar usuários numa aplicação server-rendered de servidor único.

**Decisão.** Usar **sessão nativa do PHP** com cookie `httpOnly` + `SameSite=Lax`
(e `secure` em produção HTTPS). Um token "lembrar-me" por dispositivo usa o padrão
*selector:validator* (o banco guarda só o hash do *validator*).

**Consequências.**
- ✅ Simples, integrado ao RBAC e ao polling; cookie httpOnly é imune a leitura por JS (XSS).
- ✅ *Logout* invalida de fato a sessão no servidor.
- ⚠️ Estado de sessão no servidor (não *stateless*); aceitável para servidor único.
- 🔎 JWT foi descartado por adicionar complexidade (refresh, revogação) sem ganho neste contexto.

---

## ADR-004 — Login por e-mail; identificador interno oculto

**Contexto.** O sistema começou com login por um identificador numérico.
Para uso público e genérico, isso não faz sentido.

**Decisão.** A credencial é **e-mail + senha**. O identificador interno
(`user_id`, chave primária) é **gerado automaticamente** e nunca exibido; as
pessoas são identificadas pelo **nome**.

**Consequências.**
- ✅ Genérico e familiar; sem exposição de identificadores internos.
- ✅ Compatível com futura adição de login social (o provedor fornece o e-mail).
- ⚠️ Contas antigas sem e-mail exigiram uma migração idempotente anti-lockout.
- ✅ A coluna `user_id` é só uma chave surrogate interna.

---

## ADR-005 — Optimistic locking + polling para concorrência

**Contexto.** Vários usuários editam o mesmo quadro simultaneamente.

**Decisão.** Cada card tem um campo `revision`. Atualizações enviam
`revisionSeen`; se estiver desatualizado, o servidor responde `409` com o estado
atual. A sincronização entre clientes é por **polling** de `/api/poll.php` a cada 5s.

**Consequências.**
- ✅ Sem locks pessimistas nem dependências de tempo real (WebSocket).
- ✅ Polling barato: `304` quando nada mudou.
- ⚠️ Latência de até ~5s para ver mudanças de terceiros (aceitável para o caso de uso).

---

## ADR-006 — Rate limiting em SQLite

**Contexto.** Proteger login/cadastro/recuperação contra força-bruta e spam, sem
infraestrutura adicional (Redis).

**Decisão.** Tabela `auth_attempts` + funções que contam tentativas por
`"<ip>:<ação>"` numa janela de tempo.

**Consequências.**
- ✅ Sem dependências externas; funciona no mesmo banco.
- ⚠️ Contagem por IP (não distribuída); suficiente para servidor único.
