<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/export.php
   Exportações (download direto, GET):
     ?type=cards_csv&team=<id>   → planilha de cards (abre no Excel)
     ?type=gains_csv&team=<id>   → consolidado de ganhos + linha TOTAL
     ?type=report&team=<id>      → relatório imprimível (PDF)
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/teams.php';

$u = require_login();
$type = $_GET['type'] ?? '';

/* envia cabeçalhos de download (sobrescreve o Content-Type JSON do _bootstrap) */
function _dl_headers(string $mime, string $filename): void {
    header('Content-Type: ' . $mime . '; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Cache-Control: no-store');
}
function _csv_line(array $cols): string {
    $out = [];
    foreach ($cols as $c) {
        $c = (string)$c;
        if (preg_match('/[";\n\r]/', $c)) $c = '"' . str_replace('"', '""', $c) . '"';
        $out[] = $c;
    }
    return implode(';', $out) . "\r\n";   // ; = separador que o Excel pt-BR entende
}
/** Data ISO (YYYY-MM-DD) → DD/MM/AAAA (formato pt-BR). */
function _csv_d($iso): string {
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})/', (string)$iso, $m)) return '';
    return "{$m[3]}/{$m[2]}/{$m[1]}";
}
/** Número com vírgula decimal (pt-BR). Vazio quando 0/nulo. */
function _csv_num($v): string {
    if ($v === null || $v === '') return '';
    $f = (float)$v;
    if ($f == 0.0) return '';
    return (floor($f) == $f) ? number_format($f, 0, ',', '.') : number_format($f, 2, ',', '.');
}

$PRIO = ['baixa'=>'Baixa','media'=>'Média','alta'=>'Alta','urgente'=>'Urgente'];
$STAT = ['no-prazo'=>'No prazo','em-risco'=>'Em risco','atrasado'=>'Atrasado'];

if ($type === 'cards_csv' || $type === 'gains_csv') {
    $teamId = (string)($_GET['team'] ?? '');
    if ($teamId === '') error_response('Equipe obrigatória.', 400);
    if (!is_team_member($teamId, $u['user_id']) && !in_array($u['role'], ['ti','suporte'], true))
        error_response('Sem permissão para exportar esta equipe.', 403);

    $teamName = (string)(scalar("SELECT name FROM teams WHERE id=?", [$teamId]) ?: 'equipe');
    $rows = all("SELECT c.*, col.name AS column_name
                 FROM cards c LEFT JOIN columns col ON col.id = c.column_id
                 WHERE c.team_id = ? AND c.archived = 0
                 ORDER BY col.position, c.title", [$teamId]);
    // tags por card
    $tagsBy = [];
    if ($rows) {
        $ids = array_column($rows, 'id'); $ph = implode(',', array_fill(0, count($ids), '?'));
        foreach (all("SELECT card_id, tag FROM card_tags WHERE card_id IN ($ph)", $ids) as $t)
            $tagsBy[$t['card_id']][] = $t['tag'];
    }
    $slug = preg_replace('/[^a-z0-9]+/i', '_', mb_strtolower($teamName, 'UTF-8'));
    $stamp = date('Ymd');

    if ($type === 'cards_csv') {
        _dl_headers('text/csv', "cards_{$slug}_{$stamp}.csv");
        echo "\xEF\xBB\xBF";   // BOM UTF-8 (acentos no Excel)
        echo _csv_line(['Título','Coluna','Responsável','Prioridade','Projeção','Progresso (%)','Início','Prazo','Tags','Horas/mês','Economia/mês (R$)']);
        foreach ($rows as $r) {
            echo _csv_line([
                $r['title'], $r['column_name'] ?? '', $r['assignee'] ?? '',
                $PRIO[$r['priority']] ?? $r['priority'], $STAT[$r['projection_status']] ?? $r['projection_status'],
                (int)$r['progress'], _csv_d($r['start_date'] ?? ''), _csv_d($r['due_date'] ?? ''),
                implode(', ', $tagsBy[$r['id']] ?? []),
                _csv_num($r['gains_horas_mes']),
                _csv_num($r['gains_economia_mes']),
            ]);
        }
        exit;
    }

    // gains_csv — consolidado + TOTAL
    _dl_headers('text/csv', "ganhos_{$slug}_{$stamp}.csv");
    echo "\xEF\xBB\xBF";
    echo _csv_line(['Card','Responsável','Horas/mês','Horas/ano','Economia/mês (R$)','Economia/ano (R$)','Ganhos qualitativos']);
    $thm=0; $tha=0; $tem=0; $tea=0;
    foreach ($rows as $r) {
        $hm=(float)$r['gains_horas_mes']; $ha=(float)$r['gains_horas_ano'];
        $em=(float)$r['gains_economia_mes']; $ea=(float)$r['gains_economia_ano'];
        $thm+=$hm; $tha+=$ha; $tem+=$em; $tea+=$ea;
        $qual = '';
        $qj = json_decode($r['gains_qualitativo'] ?? '[]', true);
        if (is_array($qj)) $qual = implode(' | ', $qj);
        echo _csv_line([$r['title'], $r['assignee'] ?? '',
            _csv_num($hm), _csv_num($ha), _csv_num($em), _csv_num($ea), $qual]);
    }
    echo _csv_line(['TOTAL','', _csv_num($thm) ?: '0', _csv_num($tha) ?: '0', _csv_num($tem) ?: '0', _csv_num($tea) ?: '0', '']);
    exit;
}

if ($type === 'report') {
    // Relatório imprimível (Ctrl+P → Salvar como PDF). HTML simples e limpo.
    $teamId = (string)($_GET['team'] ?? '');
    if ($teamId === '') error_response('Equipe obrigatória.', 400);
    if (!is_team_member($teamId, $u['user_id']) && !in_array($u['role'], ['ti','suporte'], true))
        error_response('Sem permissão.', 403);
    $teamName = (string)(scalar("SELECT name FROM teams WHERE id=?", [$teamId]) ?: 'Equipe');
    $rows = all("SELECT c.*, col.name AS column_name
                 FROM cards c LEFT JOIN columns col ON col.id = c.column_id
                 WHERE c.team_id = ? AND c.archived = 0
                 ORDER BY col.position, c.title", [$teamId]);
    $thm=0;$tem=0;$done=0;$over=0; $today=date('Y-m-d');
    foreach ($rows as $r) {
        $thm += (float)$r['gains_horas_mes']; $tem += (float)$r['gains_economia_mes'];
        if ((int)$r['progress'] >= 100) $done++;
        if (!empty($r['due_date']) && $r['due_date'] < $today && (int)$r['progress'] < 100) $over++;
    }
    $e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $progDone = count($rows) ? round($done / count($rows) * 100) : 0;
    // Projeção correta (concluído = no prazo)
    $calcStat = function ($r) use ($today) {
        if ((int)$r['progress'] >= 100) return 'no-prazo';
        $due = (string)($r['due_date'] ?? '');
        if ($due === '') return 'no-prazo';
        if ($due < $today) return 'atrasado';
        return ((strtotime($due) - strtotime($today)) / 86400 <= 2) ? 'em-risco' : 'no-prazo';
    };
    $prioColor = ['urgente'=>'#dc2626','alta'=>'#ea580c','media'=>'#2563eb','baixa'=>'#16a34a'];
    $statColor = ['no-prazo'=>'#16a34a','em-risco'=>'#d97706','atrasado'=>'#dc2626'];
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório — ' . $e($teamName) . '</title>';
    echo '<style>
      *{box-sizing:border-box}
      body{font-family:"Segoe UI",Arial,sans-serif;color:#1f2d2c;margin:0;font-size:12.5px;background:#fff}
      .wrap{max-width:1000px;margin:0 auto;padding:0 26px 40px}
      .topbar{background:linear-gradient(120deg,#0a5c54 0%,#0e7d6f 60%,#13a08c 100%);color:#fff;padding:24px 26px;margin-bottom:22px}
      .topbar .brandrow{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;max-width:1000px;margin:0 auto}
      .topbar .kick{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;opacity:.85;font-weight:700}
      .topbar h1{font-size:24px;margin:4px 0 0;font-weight:800}
      .topbar .meta{text-align:right;font-size:11.5px;opacity:.92;line-height:1.5}
      .topbar .logo{font-size:18px;font-weight:800;letter-spacing:.5px}
      .kpis{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px}
      .kpi{flex:1;min-width:130px;border:1px solid #e2e8e7;border-left:4px solid var(--c,#0e7d6f);border-radius:12px;padding:12px 16px;background:#fff}
      .kpi b{display:block;font-size:24px;font-weight:800;color:var(--c,#0e7d6f);line-height:1.1}
      .kpi span{font-size:10.5px;color:#6b7d7c;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
      .sec{font-size:13px;font-weight:800;color:#0a5c54;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #e2e8e7}
      table{width:100%;border-collapse:collapse;margin-top:4px}
      thead{display:table-header-group}
      th{text-align:left;padding:8px 10px;background:#f1f5f5;color:#5a6b6a;text-transform:uppercase;font-size:9.5px;letter-spacing:.5px;border-bottom:2px solid #e2e8e7}
      td{padding:7px 10px;border-bottom:1px solid #eef2f1;font-size:11.5px;vertical-align:middle}
      tr{page-break-inside:avoid}
      tbody tr:nth-child(even){background:#fafcfb}
      .pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700;color:#fff;white-space:nowrap}
      .pbar{position:relative;width:80px;height:8px;border-radius:999px;background:#eef2f1;display:inline-block;vertical-align:middle;overflow:hidden}
      .pbar i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:#0e7d6f}
      .pnum{font-size:10.5px;color:#6b7d7c;margin-left:6px;font-variant-numeric:tabular-nums}
      .num{text-align:right;font-variant-numeric:tabular-nums}
      .muted{color:#9aa6a5}
      .foot{margin-top:18px;font-size:10.5px;color:#9aa6a5;text-align:center}
      .pbtn{padding:8px 16px;border:0;background:#fff;color:#0a5c54;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px}
      @media print{ .wrap{padding:0 12px} .topbar{-webkit-print-color-adjust:exact;print-color-adjust:exact} .pbtn{display:none} .kpi,.pill,.pbar,.pbar i,thead th,tbody tr:nth-child(even){-webkit-print-color-adjust:exact;print-color-adjust:exact} }
    </style></head><body onload="setTimeout(function(){window.print()},250)">';
    echo '<div class="topbar"><div class="brandrow">'
       . '<div><div class="kick">Relatório da equipe</div><h1>' . $e($teamName) . '</h1></div>'
       . '<div class="meta"><div class="logo">⬡ SyncroFlow</div>' . $e(date('d/m/Y \à\s H:i')) . '<br>'
       . '<button class="pbtn" onclick="window.print()">🖨️ Imprimir / PDF</button></div>'
       . '</div></div>';
    echo '<div class="wrap">';
    echo '<div class="kpis">'
       . '<div class="kpi" style="--c:#0e7d6f"><b>' . count($rows) . '</b><span>Cards ativos</span></div>'
       . '<div class="kpi" style="--c:#16a34a"><b>' . $done . '</b><span>Concluídos (' . $progDone . '%)</span></div>'
       . '<div class="kpi" style="--c:#dc2626"><b>' . $over . '</b><span>Atrasados</span></div>'
       . '<div class="kpi" style="--c:#2563eb"><b>' . number_format($thm, 0, ',', '.') . 'h</b><span>Horas/mês</span></div>'
       . '<div class="kpi" style="--c:#8b5cf6"><b>R$ ' . number_format($tem, 0, ',', '.') . '</b><span>Economia/mês</span></div>'
       . '</div>';
    echo '<div class="sec">Cards (' . count($rows) . ')</div>';
    echo '<table><thead><tr><th>Título</th><th>Coluna</th><th>Responsável</th><th>Prioridade</th><th>Projeção</th><th>Prazo</th><th>Progresso</th></tr></thead><tbody>';
    foreach ($rows as $r) {
        $pr = $r['priority']; $st = $calcStat($r); $pg = (int)$r['progress'];
        echo '<tr>'
           . '<td><strong>' . $e($r['title']) . '</strong></td>'
           . '<td>' . $e($r['column_name'] ?: '—') . '</td>'
           . '<td>' . $e($r['assignee'] ?: '—') . '</td>'
           . '<td><span class="pill" style="background:' . ($prioColor[$pr] ?? '#64748b') . '">' . $e($PRIO[$pr] ?? $pr) . '</span></td>'
           . '<td><span class="pill" style="background:' . ($statColor[$st] ?? '#64748b') . '">' . $e($STAT[$st] ?? $st) . '</span></td>'
           . '<td>' . ($r['due_date'] ? $e(_csv_d($r['due_date'])) : '<span class="muted">—</span>') . '</td>'
           . '<td><span class="pbar"><i style="width:' . $pg . '%"></i></span><span class="pnum">' . $pg . '%</span></td>'
           . '</tr>';
    }
    if (!$rows) echo '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Nenhum card ativo nesta equipe.</td></tr>';
    echo '</tbody></table>';
    echo '<div class="foot">Gerado pelo SyncroFlow · ' . $e(date('d/m/Y H:i')) . '</div>';
    echo '</div></body></html>';
    exit;
}

error_response('type_invalido', 400);
