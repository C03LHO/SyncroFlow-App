<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — lib/holidays.php
   Feriados e dias facultativos editáveis (tabela `holidays`).
   Os feriados NACIONAIS fixos e os móveis (Carnaval, Páscoa,
   Corpus Christi…) continuam CALCULADOS no front (holidays.js);
   aqui ficam os MUNICIPAIS, FACULTATIVOS e COMPENSAÇÕES.

   Recursos:
     • holiday_add()           → adiciona 1 item (com dedup por dia+cidade)
     • holidays_bulk_import()  → cola do Excel (TSV/CSV), ignora repetidos
     • holidays_all/cities()   → leitura
   ═══════════════════════════════════════════════════════════ */
require_once __DIR__ . '/db.php';

/** Lista todos os feriados cadastrados (ordenados).
 *  Não destrói nada: leitura é só leitura. Itens recorrentes primeiro; os de
 *  data específica vêm em seguida por data (os antigos afundam naturalmente). */
function holidays_all(): array {
    return all("SELECT id, name, kind, scope, uf, city, recurring, month, day, date
                FROM holidays
                ORDER BY recurring DESC, COALESCE(month, 99), COALESCE(day, 99), date, name");
}

/** Limpeza opcional de feriados de DATA específica já vencidos (não recorrentes).
 *  Chame só num job/ação explícita — NUNCA numa leitura. Retorna quantos removeu. */
function holidays_prune_past(): int {
    try {
        $today = date('Y-m-d');
        $n = (int)scalar("SELECT COUNT(*) FROM holidays WHERE recurring = 0 AND date != '' AND date < ?", [$today]);
        if ($n > 0) q("DELETE FROM holidays WHERE recurring = 0 AND date != '' AND date < ?", [$today]);
        return $n;
    } catch (Throwable $e) { return 0; }
}

/** Cidades distintas com feriado cadastrado (para filtros e autocomplete). */
function holidays_cities(): array {
    $rows = all("SELECT DISTINCT city FROM holidays WHERE city != '' ORDER BY city");
    return array_column($rows, 'city');
}

/* ── normalização + chave de deduplicação ───────────────────── */

/** Normaliza/valida um item. Lança InvalidArgumentException se inválido. */
function _holiday_normalize(array $d): array {
    $name = trim((string)($d['name'] ?? ''));
    if ($name === '') throw new InvalidArgumentException('Informe o nome do feriado.');

    $kind  = in_array(($d['kind'] ?? ''), ['feriado','facultativo','compensacao'], true)
                ? $d['kind'] : _holiday_kind_from_text((string)($d['kind'] ?? ''));
    $city  = trim((string)($d['city'] ?? ''));
    $scope = in_array(($d['scope'] ?? ''), ['nacional','estadual','municipal'], true)
                ? $d['scope'] : ($city !== '' ? 'municipal' : 'nacional');
    $uf    = strtoupper(trim((string)($d['uf'] ?? '')));
    $date  = trim((string)($d['date'] ?? ''));

    $recurring = 1; $month = null; $day = null;
    if ($date !== '') {                                   // data específica
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date))
            throw new InvalidArgumentException('Data inválida — use o formato AAAA-MM-DD.');
        $recurring = 0;
    } else {                                              // recorrente anual
        $month = (int)($d['month'] ?? 0);
        $day   = (int)($d['day'] ?? 0);
        if ($month < 1 || $month > 12 || $day < 1 || $day > 31)
            throw new InvalidArgumentException('Informe dia (1–31) e mês (1–12) válidos, ou uma data específica.');
    }
    return compact('name', 'kind', 'scope', 'uf', 'city', 'recurring', 'month', 'day', 'date');
}

/** Chave única por DIA + CIDADE (mesmo dia/cidade não duplica). */
function _holiday_key(array $r): string {
    $city = mb_strtolower(trim((string)($r['city'] ?? '')), 'UTF-8');
    return ((int)($r['recurring'] ?? 0) === 1)
        ? 'R' . (int)$r['month'] . '-' . (int)$r['day'] . '|' . $city
        : 'D' . trim((string)($r['date'] ?? '')) . '|' . $city;
}

/** Conjunto de chaves já existentes no banco. */
function _holiday_existing_keys(): array {
    $keys = [];
    foreach (all("SELECT recurring, month, day, date, city FROM holidays") as $h) {
        $keys[_holiday_key($h)] = true;
    }
    return $keys;
}

/** INSERT puro (sem dedup). Retorna o id. */
function _holiday_insert(array $n, string $by): string {
    $id = 'hol-' . bin2hex(random_bytes(5));
    q("INSERT INTO holidays (id, name, kind, scope, uf, city, recurring, month, day, date, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
       [$id, $n['name'], $n['kind'], $n['scope'], $n['uf'], $n['city'],
        $n['recurring'], $n['month'], $n['day'], $n['date'], $by, now_iso()]);
    return $id;
}

/** Adiciona 1 item. Ignora silenciosamente se já houver feriado no mesmo dia/cidade. */
function holiday_add(array $d, string $by = ''): string {
    $n = _holiday_normalize($d);
    if (isset(_holiday_existing_keys()[_holiday_key($n)]))
        throw new InvalidArgumentException('Já existe um feriado nesse dia para essa cidade — mantido o existente.');
    return _holiday_insert($n, $by);
}

/** Remove um feriado. */
function holiday_remove(string $id): void {
    q("DELETE FROM holidays WHERE id = ?", [$id]);
}

/* ── importação em massa (colar do Excel) ───────────────────── */

function _holiday_kind_from_text(string $t): string {
    $t = mb_strtolower(trim($t), 'UTF-8');
    $t = strtr($t, ['ç'=>'c','ã'=>'a','á'=>'a','â'=>'a','é'=>'e','ê'=>'e','í'=>'i','ó'=>'o','ô'=>'o','õ'=>'o','ú'=>'u']);
    if ($t === '') return 'feriado';
    if (strpos($t, 'facult') !== false) return 'facultativo';
    if (strpos($t, 'compens') !== false || strpos($t, 'ponte') !== false) return 'compensacao';
    return 'feriado';
}

/** Interpreta a célula de data: DD/MM, DD/MM/AAAA, AAAA-MM-DD, DD-MM-AAAA, DD.MM. */
function _holiday_parse_date(string $s): ?array {
    $s = trim($s);
    if ($s === '') return null;
    if (preg_match('#^(\d{4})-(\d{2})-(\d{2})$#', $s)) {
        return ['recurring' => 0, 'date' => $s, 'month' => null, 'day' => null];
    }
    if (preg_match('#^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$#', $s, $m)) {
        $d = (int)$m[1]; $mo = (int)$m[2]; $y = (int)$m[3]; if ($y < 100) $y += 2000;
        if ($mo < 1 || $mo > 12 || $d < 1 || $d > 31) return null;
        return ['recurring' => 0, 'date' => sprintf('%04d-%02d-%02d', $y, $mo, $d), 'month' => null, 'day' => null];
    }
    if (preg_match('#^(\d{1,2})[/.\-](\d{1,2})$#', $s, $m)) {
        $d = (int)$m[1]; $mo = (int)$m[2];
        if ($mo < 1 || $mo > 12 || $d < 1 || $d > 31) return null;
        return ['recurring' => 1, 'month' => $mo, 'day' => $d, 'date' => ''];
    }
    return null;
}

/** Quebra uma linha em colunas: tenta TAB (Excel), depois ; e depois , */
function _holiday_split_cols(string $line): array {
    foreach (["\t", ';'] as $sep) {
        if (strpos($line, $sep) !== false) return array_map('trim', explode($sep, $line));
    }
    if (strpos($line, ',') !== false) return array_map('trim', str_getcsv($line, ','));
    return [trim($line)];
}

/**
 * Importa em massa colando do Excel. Colunas (TAB/;/,):
 *   Data | Nome | Tipo(opcional) | Cidade(opcional)
 * - Data: DD/MM (todo ano) · DD/MM/AAAA ou AAAA-MM-DD (data única)
 * - Dia repetido (mesmo dia + cidade): IGNORADO (mantém um só).
 * Retorna ['added'=>int, 'ignored'=>int, 'errors'=>string[]].
 */
function holidays_bulk_import(string $text, string $by = ''): array {
    $seen   = _holiday_existing_keys();
    $added  = 0; $ignored = 0; $errors = [];
    $lines  = preg_split('/\r\n|\r|\n/', $text);
    $first  = true;

    foreach ($lines as $idx => $raw) {
        $line = trim($raw);
        if ($line === '') continue;

        // Pula cabeçalho do Excel (1ª linha que parece títulos)
        if ($first) {
            $first = false;
            $low = mb_strtolower($line, 'UTF-8');
            if ((strpos($low, 'data') !== false || strpos($low, 'dia') !== false)
                && (strpos($low, 'nome') !== false || strpos($low, 'feriado') !== false
                    || strpos($low, 'descri') !== false)) {
                continue;
            }
        }

        $cols = _holiday_split_cols($line);
        if (count($cols) < 2) { $errors[] = 'Linha ' . ($idx + 1) . ': formato inválido (esperado Data ⇥ Nome).'; continue; }

        $dt = _holiday_parse_date((string)$cols[0]);
        if (!$dt) { $errors[] = 'Linha ' . ($idx + 1) . ': data inválida "' . $cols[0] . '".'; continue; }

        $data = array_merge($dt, [
            'name' => (string)($cols[1] ?? ''),
            'kind' => (string)($cols[2] ?? ''),
            'city' => (string)($cols[3] ?? ''),
        ]);

        try {
            $n = _holiday_normalize($data);
        } catch (Throwable $e) {
            $errors[] = 'Linha ' . ($idx + 1) . ': ' . $e->getMessage();
            continue;
        }

        $key = _holiday_key($n);
        if (isset($seen[$key])) { $ignored++; continue; }   // dia repetido → ignora
        _holiday_insert($n, $by);
        $seen[$key] = true;
        $added++;
    }
    return ['added' => $added, 'ignored' => $ignored, 'errors' => $errors];
}
