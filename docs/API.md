# API

Todos os endpoints ficam em `/api/`, respondem JSON UTF-8 e exigem sessão
(cookie), exceto onde indicado. A ação é escolhida por `?action=`; o corpo das
requisições `POST` é JSON.

```js
// exemplo (é o que js/core/api.js faz)
fetch('/api/cards.php?action=move', {
  method: 'POST',
  body: JSON.stringify({ id: 'abc', columnId: 'col-2' }),
});
```

## Convenções

- **Erros**: `{ "error": "<mensagem>" }` com HTTP 4xx/5xx.
- **Mutações** devolvem a entidade atualizada e a nova `revision`.
- **Optimistic locking**: `cards.php?action=update` recebe `revisionSeen`; se o
  card mudou nesse meio-tempo, responde `409` com o estado atual em `current`.
  As demais mutações são *last-write-wins*.
- **Permissões** são verificadas por equipe (`lib/teams.php`) e por papel global
  (`lib/rbac.php`).

## Autenticação — `auth.php`

| Ação | Sessão | Corpo |
|---|---|---|
| `me`, `bootstrap_status` | — | — |
| `login` | — | `{ email, password }` · limite de 5 tentativas / 15 min por IP |
| `logout` | ✓ | — |
| `register` | — | `{ name, email, password }` · o 1º usuário vira administrador; os demais entram como visitante |
| `forgot_request` | — | `{ email }` · envia link de redefinição (se o e-mail estiver configurado) |
| `change_password` | ✓ | `{ old_password, new_password }` |
| `autologin_status`, `enable_autologin`, `disable_autologin` | ✓ | "lembrar este dispositivo" |

Detalhes em [AUTENTICACAO.md](AUTENTICACAO.md).

## Estado e sincronização

| Endpoint | Descrição |
|---|---|
| `GET state.php?team=<id>` | Snapshot completo da equipe (mesmo formato de `window.__STATE__`). |
| `GET poll.php?since=<rev>` | `304` se nada mudou; senão `{ revision, events: [...] }` com o delta. |
| `GET search.php?q=<texto>` | Busca global: `{ cards, teams, people }`. |

## Cards e itens do card

| Arquivo | Ações |
|---|---|
| `cards.php` | `list`, `get`, `my_cross_team`, `create`, `update`, `move`, `archive`, `unarchive`, `delete`, `bulk`, `duplicate`, `request_approval`, `approve`, `reject`, `delegate`, `watch`, `watch_status` |
| `subtasks.php` | `create`, `update`, `toggle`, `delete` |
| `comments.php` | `create`, `update`, `delete` (autor ou administrador) |
| `reactions.php` | `toggle` `{ commentId, emoji }` |
| `links.php` | `create`, `delete` |
| `custom_fields.php` | `list`, `create`, `update`, `reorder`, `delete` |
| `templates.php` | `list`, `create`, `delete` (modelos de card) |

## Quadro e planejamento

| Arquivo | Ações |
|---|---|
| `columns.php` | `list`, `create`, `update`, `delete` (bloqueado se houver cards ativos), `set_done`, `reorder`, `reset` |
| `sprints.php` | `list`, `create`, `update`, `delete`, `set_cards` |
| `milestones.php` | `list`, `create`, `update`, `delete` |
| `automations.php` | `list`, `create`, `update`, `delete` (regras "quando… então…") |

## Equipes e pessoas

| Arquivo | Ações |
|---|---|
| `teams.php` | `list`, `all_teams`, `get`, `create`, `update`, `update_config`, `archive`, `delete`, `members`, `add_member`, `remove_member`, `change_member_role`, `leave`, `invite`, `my_invites`, `respond_invite`, `request_join`, `pending_requests`, `respond_request`, `profile`, `compare`, `smart_goal`, `users`, `tags_list`, `tag_create`, `tag_delete`, `set_tags` |
| `users.php` | `me`, `me_update`, `find_by_email`, `list`, `get`, `profile`, `update`, `change_role`, `reset_password`, `delete` (desativa) |
| `photos.php` | `get` (GET), `upload`, `delete` — fotos de perfil e capas |
| `vacations.php` | `list`, `request`, `respond`, `acknowledge`, `cancel`, `edit`, `create_for`, `set_balance` (férias e ausências) |

## Comunicação

| Arquivo | Ações |
|---|---|
| `notifications.php` | `list`, `create`, `mark_read`, `mark_all_read`, `delete` |
| `notices.php` | `list`, `create`, `update`, `delete`, `postable_teams` (mural de avisos) |
| `holidays.php` | `list` (feriados usados no calendário) |
| `worldcup.php` | `list` (modo Copa do Mundo, opcional) |

## Métricas, gamificação e relatórios

| Endpoint | Descrição |
|---|---|
| `metrics.php` | Métricas de fluxo (lead time, cycle time, throughput, CFD). |
| `ranking.php` | Ranking de pontos da equipe. |
| `leagues.php` | Ligas (escada, liga atual); `reset` para o administrador. |
| `achievements.php` | `get_my`, `get_user`, `unlock_trophy`, `claim_limited`, `unlock_title`, `set_active_title`, `set_showcase`, `mark_seen`, `set_onboarding`, `set_standup_today` |
| `export.php?type=` | `cards_csv`, `gains_csv` (CSV para Excel) e `report` (relatório imprimível). |
| `reports.php?action=` | `cards_csv`, `standup_csv`. |

## Códigos HTTP

| Código | Quando |
|---|---|
| `400` | Parâmetros inválidos ou ação desconhecida |
| `401` | Sem sessão / credenciais inválidas |
| `403` | Sem permissão na equipe ou papel insuficiente |
| `404` | Entidade não encontrada |
| `409` | Conflito de edição (revisão desatualizada) |
| `429` | Limite de tentativas atingido |
