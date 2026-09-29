<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/notices.php
   Lógica de VISIBILIDADE de avisos, compartilhada entre a API
   (api/notices.php) e a hidratação inicial (lib/hydrate.php) —
   assim um aviso agendado nunca aparece antes da hora em nenhum
   dos dois caminhos.
   ═══════════════════════════════════════════════════════════ */

/**
 * Um aviso está visível agora?
 *  - Sem recorrência: visível entre starts_at (ou sempre) e expires_at.
 *  - Com recorrência (daily/weekly/monthly): o intervalo [starts_at, expires_at]
 *    define a "janela" (hora do dia + dia da semana/mês). A cada período a janela
 *    se repete até recur_until.
 * Retorna bool. Datas em ISO 8601 (UTC). Tudo comparado em timestamps.
 */
if (!function_exists('_notice_visible_now')) {
function _notice_visible_now(array $n, int $nowTs): bool {
    $rec = $n['recurrence'] ?? 'none';
    $start = !empty($n['starts_at'])  ? strtotime($n['starts_at'])  : null;
    $end   = !empty($n['expires_at']) ? strtotime($n['expires_at']) : null;

    if ($rec === 'none' || $rec === '' || $rec === null) {
        if ($start !== null && $nowTs < $start) return false; // ainda não começou
        if ($end   !== null && $nowTs >= $end)  return false; // já terminou
        return true;
    }
    // Recorrente: precisa de janela base bem definida.
    if ($start === null) return $end === null || $nowTs < $end;
    $until = !empty($n['recur_until']) ? strtotime($n['recur_until']) : null;
    if ($until !== null && $nowTs > $until) return false;
    if ($nowTs < $start) return false; // antes da 1ª ocorrência
    $dur = ($end !== null && $end > $start) ? ($end - $start) : 3600; // janela; default 1h

    // A janela diária é definida pela hora do dia do início.
    $sd = getdate($start);
    $nd = getdate($nowTs);
    $secOfDay  = fn(array $d) => $d['hours'] * 3600 + $d['minutes'] * 60 + $d['seconds'];
    $startSec  = $secOfDay($sd);
    $nowSec    = $secOfDay($nd);
    $inDaily   = ($nowSec >= $startSec) && ($nowSec < $startSec + $dur);
    // janelas que cruzam a meia-noite
    if (!$inDaily && $startSec + $dur > 86400) {
        $inDaily = $nowSec < ($startSec + $dur - 86400);
    }
    if (!$inDaily) return false;

    if ($rec === 'daily')   return true;
    if ($rec === 'weekly')  return (int)$sd['wday']  === (int)$nd['wday'];
    if ($rec === 'monthly') return (int)$sd['mday']  === (int)$nd['mday'];
    return true;
}
}
