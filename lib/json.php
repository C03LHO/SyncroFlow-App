<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/json.php
   Helpers para endpoints JSON (entrada e saída).
   ═══════════════════════════════════════════════════════════ */

/** Lê o body como JSON e devolve array (ou [] se vazio/inválido). */
function json_in(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/** Envia resposta JSON e encerra o script. */
function json_out($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    // JSON_INVALID_UTF8_SUBSTITUTE: um byte inválido isolado (ex.: dado legado
    // mal-codificado) vira ' ' em vez de fazer json_encode devolver false e
    // zerar a resposta inteira (corpo vazio) — blindagem para todos os endpoints.
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

/** Resposta padronizada de erro. */
function error_response(string $msg, int $status = 400, array $extra = []): void {
    json_out(array_merge(['error' => $msg], $extra), $status);
}
