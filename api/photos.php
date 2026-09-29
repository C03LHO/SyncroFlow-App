<?php
/* ═══════════════════════════════════════════════════════════
   SyncroFlow — api/photos.php (v12)
   Upload/serve de avatar e capa (usuário ou equipe).
   Imagens vivem no 2º SQLite (photos.db).

   - get:    público p/ logados (stream da imagem)
   - upload: dono do perfil, ou TI, ou gestor da equipe
   - delete: idem upload
   ═══════════════════════════════════════════════════════════ */

require_once __DIR__ . '/_bootstrap.php';
require_once __DIR__ . '/../lib/photos.php';
require_once __DIR__ . '/../lib/teams.php';

$action = $_GET['action'] ?? 'get';

/* ─── GET é o único que pode responder não-JSON (stream) ─── */
if ($action === 'get') {
    require_login();
    $ot = (string)($_GET['t'] ?? '');
    $oi = (string)($_GET['o'] ?? '');
    $k  = (string)($_GET['k'] ?? 'avatar');
    $p = photo_get($ot, $oi, $k);
    if (!$p) { http_response_code(404); exit; }
    header('Content-Type: ' . $p['mime']);
    header('Cache-Control: private, max-age=300');
    header('Content-Length: ' . strlen($p['data']));
    echo $p['data'];
    exit;
}

$u = require_login();
$ot = (string)($_POST['t'] ?? $_GET['t'] ?? '');
$oi = (string)($_POST['o'] ?? $_GET['o'] ?? '');
$k  = (string)($_POST['k'] ?? $_GET['k'] ?? 'avatar');

/** Pode editar fotos deste owner? */
function _can_edit_photo(array $u, string $ot, string $oi): bool {
    if ($u['role'] === 'ti') return true;
    if ($ot === 'user') return $oi === $u['user_id'];
    if ($ot === 'team') {
        $r = effective_team_role($oi, $u);
        return $r === 'gestor';
    }
    return false;
}

if (!in_array($ot, ['user','team'], true) || $oi === '') error_response('parametros_invalidos', 400);
if (!in_array($k, ['avatar','cover'], true)) error_response('kind_invalido', 400);
// Capa só existe para EQUIPE. Usuário tem apenas foto (avatar) — sem capa.
if ($ot === 'user' && $k === 'cover') error_response('Usuário não tem capa.', 400);
if (!_can_edit_photo($u, $ot, $oi)) error_response('Sem permissão para alterar esta imagem.', 403);

switch ($action) {

/* ╔═══════════════════════════════════════════════════════════════════╗
   ║  DESABILITADO: AÇÕES DE UPLOAD E DELETE DE FOTOS (ERRO HTTP 500) ║
   ║  - case 'upload'                                                 ║
   ║  - case 'delete'                                                 ║
   ║  Data: 2026-06-09 - Investigação em andamento                    ║
   ║  Ao reabilitar, remova este comentário                           ║
   ╚═══════════════════════════════════════════════════════════════════╝

case 'upload': {
    if (empty($_FILES['file'])) error_response('arquivo_ausente', 400);
    $f = $_FILES['file'];
    if ($f['error'] !== UPLOAD_ERR_OK) error_response('erro_upload_' . $f['error'], 400);

    // Limite por tipo (avatar 2MB, cover 4MB)
    $maxMb = $k === 'cover' ? 4 : 2;
    if ($f['size'] > $maxMb * 1024 * 1024) error_response("Imagem grande demais (máx ${maxMb}MB).", 400);

    // Valida tipo real
    $info = @getimagesize($f['tmp_name']);
    if (!$info) error_response('Arquivo não é uma imagem válida.', 400);
    $mime = $info['mime'];
    if (!in_array($mime, ['image/png','image/jpeg','image/webp','image/gif'], true)) {
        error_response('Formato não suportado (use PNG, JPG, WEBP ou GIF).', 400);
    }
    
    $data = @file_get_contents($f['tmp_name']);
    if ($data === false) error_response('Não foi possível ler o arquivo enviado.', 500);

    // 1) Grava o BLOB no 2º banco (photos.db)
    try {
        $publicUrl = photo_store($ot, $oi, $k, $mime, $data);
    } catch (Throwable $e) {
        crypto_log("photo_store falhou: " . $e->getMessage() . " @ " . $e->getFile() . ':' . $e->getLine());
        error_response('Falha ao gravar a imagem no banco de mídia (photos.db). '
            . 'Verifique se a pasta de dados tem permissão de escrita para o usuário do servidor.', 500);
    }

    // 2) Atualiza o ponteiro de URL na coluna CERTA (avatar vs capa)
    try {
        $urlWithTimestamp = $publicUrl . '&v=' . time();
        if ($ot === 'user') {
            q("UPDATE users SET avatar_url = ? WHERE user_id = ?", [$urlWithTimestamp, $oi]);
        } elseif ($k === 'cover') {
            q("UPDATE teams SET cover_url = ? WHERE id = ?", [$urlWithTimestamp, $oi]);
        } else { // team + avatar
            q("UPDATE teams SET avatar_url = ? WHERE id = ?", [$urlWithTimestamp, $oi]);
        }
        json_out(['ok' => true, 'url' => $urlWithTimestamp]);
    } catch (Throwable $e) {
        crypto_log("update URL de foto falhou: " . $e->getMessage() . " @ " . $e->getFile() . ':' . $e->getLine());
        error_response('Imagem gravada, mas falhou ao atualizar o registro. Recarregue a página.', 500);
    }
}

case 'delete': {
    try {
        photo_delete($ot, $oi, $k);
        
        // Usa whitelisting explícito de colunas
        if ($ot === 'user') {
            q("UPDATE users SET avatar_url = '' WHERE user_id = ?", [$oi]);
        } else {
            q("UPDATE teams SET cover_url = '' WHERE id = ?", [$oi]);
        }
        json_out(['ok' => true]);
    } catch (Throwable $e) {
        crypto_log("Erro ao deletar foto: " . $e->getMessage() . " @ " . $e->getFile() . ':' . $e->getLine());
        error_response('Erro ao deletar a imagem.', 500);
    }
}
*/

default:
    error_response('action_invalida', 400);
}
