<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/automations.php
   Motor de automação no-code ("se → então") por equipe.
   Gatilhos: enter_column (entrou na coluna X), progress_100 (chegou a 100%).
   Ações:    set_assignee, set_priority, add_tag, notify.
   As ações NÃO disparam outras automações (sem recursão).
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/revision.php';

const AUTOMATION_TRIGGERS = ['enter_column', 'progress_100', 'card_created'];
const AUTOMATION_ACTIONS  = ['set_assignee', 'set_priority', 'add_tag', 'notify', 'move_column', 'comment', 'set_due', 'set_progress'];

/** Executa as automações da equipe do card para um gatilho. Best-effort. */
function run_automations(string $cardId, string $triggerType, string $triggerValue, string $actorName): void {
    try {
        $teamId = scalar("SELECT team_id FROM cards WHERE id = ?", [$cardId]);
        if (!$teamId) return;
        $rules = all(
            "SELECT * FROM automations WHERE team_id = ? AND enabled = 1 AND trigger_type = ?",
            [$teamId, $triggerType]
        );
        foreach ($rules as $r) {
            if ($triggerType === 'enter_column' && (string)$r['trigger_value'] !== $triggerValue) continue;
            _apply_automation_action($cardId, (string)$r['action_type'], (string)$r['action_value'], $actorName, (string)$r['name']);
        }
    } catch (Throwable $e) {
        error_log('[SyncroFlow automations] ' . $e->getMessage());
    }
}

function _apply_automation_action(string $cardId, string $action, string $value, string $actor, string $ruleName): void {
    $value = trim($value);
    $changed = false;
    switch ($action) {
        case 'set_assignee': {
            // Aceita 1+ nomes separados por vírgula: o 1º vira responsável; todos são avisados.
            $names = array_values(array_filter(array_map('trim', explode(',', $value)), fn($n) => $n !== ''));
            $primary = $names[0] ?? '';
            q("UPDATE cards SET assignee = ?, updated_at = ? WHERE id = ?", [$primary, now_iso(), $cardId]);
            _automation_history($cardId, $primary !== '' ? "Responsável → $primary (automação «$ruleName»)" : "Responsável removido (automação «$ruleName»)");
            foreach ($names as $nm) { try { notify($nm, "Automação «$ruleName» designou você a um card.", 'info', $cardId); } catch (Throwable $e) {} }
            $changed = true;
            break;
        }
        case 'set_priority':
            if (in_array($value, ['baixa', 'media', 'alta', 'urgente'], true)) {
                q("UPDATE cards SET priority = ?, updated_at = ? WHERE id = ?", [$value, now_iso(), $cardId]);
                _automation_history($cardId, "Prioridade → $value (automação «$ruleName»)");
                $changed = true;
            }
            break;
        case 'add_tag':
            if ($value !== '') {
                q("INSERT OR IGNORE INTO card_tags (card_id, tag) VALUES (?, ?)", [$cardId, $value]);
                _automation_history($cardId, "Etiqueta «$value» adicionada (automação «$ruleName»)");
                $changed = true;
            }
            break;
        case 'notify':
            // Aceita 1+ nomes separados por vírgula.
            foreach (array_filter(array_map('trim', explode(',', $value)), fn($n) => $n !== '') as $nm) {
                try { notify($nm, "Automação «$ruleName»: um card foi atualizado.", 'info', $cardId); } catch (Throwable $e) {}
            }
            break;
        case 'move_column':
            if ($value !== '' && one("SELECT 1 FROM columns WHERE id = ?", [$value])) {
                q("UPDATE cards SET column_id = ?, updated_at = ? WHERE id = ?", [$value, now_iso(), $cardId]);
                _automation_history($cardId, "Movido de coluna pela automação «$ruleName»");
                $changed = true;
            }
            break;
        case 'comment':
            if ($value !== '') {
                q("INSERT INTO comments (id, card_id, user_name, timestamp, text) VALUES (?,?,?,?,?)",
                  [uid(), $cardId, '🤖 Automação', now_iso(), $value]);
                $changed = true;
            }
            break;
        case 'set_due':
            $n = (int)$value;
            $due = gmdate('Y-m-d', strtotime(gmdate('Y-m-d')) + $n * 86400);
            q("UPDATE cards SET due_date = ?, updated_at = ? WHERE id = ?", [$due, now_iso(), $cardId]);
            _automation_history($cardId, "Prazo definido (+{$n} dias) pela automação «$ruleName»");
            $changed = true;
            break;
        case 'set_progress':
            $pg = max(0, min(100, (int)$value));
            q("UPDATE cards SET progress = ?, updated_at = ? WHERE id = ?", [$pg, now_iso(), $cardId]);
            _automation_history($cardId, "Progresso → {$pg}% pela automação «$ruleName»");
            $changed = true;
            break;
    }
    if ($changed) { try { bump_revision('card', $cardId, 'automation'); } catch (Throwable $e) {} }
}

function _automation_history(string $cardId, string $msg): void {
    try {
        q("INSERT INTO card_history (card_id, user_name, timestamp, action) VALUES (?,?,?,?)",
          [$cardId, '🤖 Automação', now_iso(), $msg]);
    } catch (Throwable $e) { /* best-effort */ }
}
