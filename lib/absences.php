<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/absences.php
   REGISTRO CENTRAL de tipos de ausência (fonte única de verdade).

   Para adicionar um novo tipo, basta acrescentar UMA linha em
   absence_types():
     - id       : chave técnica (usada no banco)
     - label    : nome exibido
     - color    : cor do tipo (Gantt, cartões, legenda) — trocável aqui
     - striped  : true → preenchimento em listras diagonais (ex.: Atestado)
     - icon     : emoji do tipo
     - usesBalance : true → consome o saldo de dias e o limite de 3 períodos
                     (hoje só Férias). Outros tipos são apenas registrados.

   O front consome esta lista dinamicamente (vem no payload de 'list'),
   então nenhum outro componente precisa ser alterado.
   ═══════════════════════════════════════════════════════════ */

function absence_types(): array {
    return [
        ['id' => 'ferias',   'label' => 'Férias',   'color' => '#2563eb', 'striped' => false, 'icon' => '🏖️', 'usesBalance' => true],
        ['id' => 'atestado', 'label' => 'Atestado', 'color' => '#dc2626', 'striped' => true,  'icon' => '🩺', 'usesBalance' => false],
        ['id' => 'licenca',  'label' => 'Licença',  'color' => '#ea580c', 'striped' => false, 'icon' => '📄', 'usesBalance' => false],
        ['id' => 'folga',    'label' => 'Folga',    'color' => '#16a34a', 'striped' => false, 'icon' => '☕', 'usesBalance' => false],
    ];
}

/** IDs válidos (para validação de entrada). */
function absence_type_ids(): array { return array_column(absence_types(), 'id'); }

/** Um id de tipo é conhecido? Vazio/desconhecido cai em 'ferias'. */
function absence_type_valid(string $id): bool { return in_array($id, absence_type_ids(), true); }

/** Normaliza um tipo recebido — desconhecido/vazio vira 'ferias' (compatibilidade). */
function absence_type_norm(?string $id): string {
    $id = trim((string)$id);
    return absence_type_valid($id) ? $id : 'ferias';
}

/** Metadados de um tipo (fallback = Férias). */
function absence_type_meta(string $id): array {
    foreach (absence_types() as $t) if ($t['id'] === $id) return $t;
    return absence_types()[0];
}

/** Esse tipo consome saldo de dias / limite de períodos? (hoje só Férias.) */
function absence_type_uses_balance(string $id): bool {
    return (bool)absence_type_meta(absence_type_norm($id))['usesBalance'];
}

/** Rótulo do tipo (para mensagens/notificações). */
function absence_type_label(string $id): string {
    return (string)absence_type_meta(absence_type_norm($id))['label'];
}
