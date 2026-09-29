# Modelo de dados

O banco é **SQLite** (modo WAL). Todo o schema é criado e evoluído
automaticamente por `lib/schema.php` (auto-migrations idempotentes). Abaixo, o
modelo entidade-relacionamento das entidades centrais (o banco tem ~30 tabelas;
o diagrama foca no núcleo).

## Convenções

- **IDs**: UUID v4 em TEXT (`uid()`); o identificador de usuário (`user_id`) é um
  número interno gerado automaticamente.
- **Timestamps**: ISO-8601 UTC em TEXT (`now_iso()`).
- **Booleanos**: INTEGER 0/1.
- **Listas**: JSON em TEXT quando cabível.

## Diagrama ER (núcleo)

```mermaid
erDiagram
    USERS ||--o{ TEAM_MEMBERS : participa
    TEAMS ||--o{ TEAM_MEMBERS : tem
    TEAMS ||--o{ COLUMNS : contem
    TEAMS ||--o{ CARDS : contem
    COLUMNS ||--o{ CARDS : agrupa
    CARDS ||--o{ SUBTASKS : tem
    SUBTASKS ||--o{ SUBTASKS : aninha
    CARDS ||--o{ COMMENTS : tem
    COMMENTS ||--o{ COMMENT_REACTIONS : recebe
    CARDS ||--o{ CARD_HISTORY : registra
    CARDS ||--o{ LINKS : referencia
    USERS ||--o{ TROPHIES : conquista
    USERS ||--o{ TITLES : desbloqueia

    USERS {
      TEXT user_id PK "id interno gerado"
      TEXT email "credencial de login (único)"
      TEXT password_hash "bcrypt cost 12"
      TEXT name
      TEXT role "ti | suporte | analista | visitante"
      INTEGER league_tier "1..10 (ligas)"
      INTEGER is_active
    }
    TEAMS {
      TEXT id PK
      TEXT name
      TEXT type "team | personal | default"
      TEXT owner_user_id FK
    }
    TEAM_MEMBERS {
      TEXT team_id FK
      TEXT user_id FK
      TEXT role "gestor | ti | analista | visitante"
    }
    COLUMNS {
      TEXT id PK
      TEXT team_id FK
      TEXT name
      INTEGER position
      INTEGER is_done
    }
    CARDS {
      TEXT id PK
      TEXT team_id FK
      TEXT column_id FK
      TEXT title
      TEXT assignee "nome"
      TEXT priority
      INTEGER progress
      INTEGER revision "optimistic locking"
      TEXT due_date
    }
    SUBTASKS {
      TEXT id PK
      TEXT card_id FK
      TEXT parent_subtask_id FK "recursivo"
      INTEGER done
    }
    COMMENTS {
      TEXT id PK
      TEXT card_id FK
      TEXT user_name
      TEXT text
    }
```

## Grupos de tabelas (visão geral)

| Grupo | Tabelas principais |
|---|---|
| Identidade | `users`, `user_login_history`, `access_requests`, `role_requests`, `auth_tokens`, `password_resets`, `auth_attempts` |
| Equipes | `teams`, `team_members`, `team_invites` |
| Kanban | `columns`, `cards`, `subtasks`, `comments`, `comment_reactions`, `card_history`, `card_tags`, `card_requested_by`, `card_helpers`, `card_blocks`, `card_watchers`, `links`, `custom_fields`, `card_custom_values` |
| Gamificação/métricas | `trophies`, `titles`, `monthly_performance`, `weekly_snapshots`, `role_history` |
| Produtividade | `sprints`, `milestones`, `card_templates`, `automations`, `vacations`, `holidays` |
| Notificações | `notifications`, `notices` |
| Sistema | `system_config`, `revision_log`, `backups`, `email_log`, `app_meta` |

## Sincronização

A tabela `revision_log` funciona como **cursor de polling**: cada mutação
registra uma linha, e `MAX(revision)` é o ponto de comparação usado por
`/api/poll.php`. Cards têm `revision` própria para *optimistic locking*.

## Segundo banco

Fotos de perfil e capas de equipe ficam em um **segundo arquivo SQLite** (`photos.db`)
como BLOBs, para manter o banco principal enxuto.
