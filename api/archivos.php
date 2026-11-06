<?php
// api/archivos.php - adjuntos de la pre-reserva (PDF, fotos, Word, Excel)
// POST multipart {asesorId, grupo, titulo, archivo}  -> sube uno
// GET  ?grupo=X                                      -> lista del grupo
// PUT  ?id=N {titulo}                                -> renombra
// DELETE ?id=N                                       -> borra (borrado suave + archivo físico)
require __DIR__ . '/bootstrap.php';
require_token($CONFIG);
$pdo = db($CONFIG);
$method = $_SERVER['REQUEST_METHOD'];

const MAX_ARCHIVOS = 10;
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
$PERMITIDOS = [
    'pdf' => ['application/pdf'],
    'jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'], 'png' => ['image/png'], 'webp' => ['image/webp'], 'gif' => ['image/gif'],
    // Office: finfo a veces reporta el contenedor (zip / ole) en vez del tipo exacto
    'doc' => ['application/msword', 'application/x-ole-storage', 'application/CDFV2', 'application/octet-stream'],
    'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream'],
    'xls' => ['application/vnd.ms-excel', 'application/x-ole-storage', 'application/CDFV2', 'application/octet-stream'],
    'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream'],
];

$grupoOk = fn($g) => (bool)preg_match('/^[A-Za-z0-9_-]{6,60}$/', (string)$g);

if ($method === 'POST') {
    $asesor = trim((string)($_POST['asesorId'] ?? ''));
    $grupo = trim((string)($_POST['grupo'] ?? ''));
    $titulo = mb_substr(trim((string)($_POST['titulo'] ?? '')), 0, 120);
    if ($asesor === '' || !$grupoOk($grupo)) json_fail('Faltan datos del adjunto');
    if (empty($_FILES['archivo'])) json_fail('No llegó ningún archivo. El límite del servidor es ' . ini_get('upload_max_filesize') . ' por archivo.');
    $f = $_FILES['archivo'];
    if ($f['error'] !== UPLOAD_ERR_OK) {
        $msg = [UPLOAD_ERR_INI_SIZE => 'El archivo supera el límite del servidor (' . ini_get('upload_max_filesize') . ')', UPLOAD_ERR_FORM_SIZE => 'El archivo es demasiado grande', UPLOAD_ERR_PARTIAL => 'La subida se interrumpió', UPLOAD_ERR_NO_FILE => 'No se envió archivo'][$f['error']] ?? 'Error al subir (' . $f['error'] . ')';
        json_fail($msg);
    }
    if ($f['size'] > MAX_BYTES) json_fail('Cada archivo puede pesar máximo 15 MB');
    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    if (!isset($PERMITIDOS[$ext])) json_fail('Tipo no permitido (.' . $ext . '). Usa PDF, JPG, PNG, Word o Excel.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: '';
    if (!in_array($mime, $PERMITIDOS[$ext], true)) json_fail('El contenido del archivo no coincide con su extensión .' . $ext);
    $mime = $PERMITIDOS[$ext][0]; // tipo canónico para servirlo luego

    $n = (int)$pdo->query("SELECT COUNT(*) FROM archivos WHERE grupo = " . $pdo->quote($grupo) . " AND deleted_at IS NULL")->fetchColumn();
    if ($n >= MAX_ARCHIVOS) json_fail('Máximo ' . MAX_ARCHIVOS . ' documentos por pre-reserva');

    $dir = archivos_dir() . '/' . $grupo;
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $token = bin2hex(random_bytes(20));
    $ruta = $grupo . '/' . $token . '.' . $ext;
    if (!move_uploaded_file($f['tmp_name'], archivos_dir() . '/' . $ruta)) json_fail('No se pudo guardar el archivo en el servidor', 500);
    if ($titulo === '') $titulo = mb_substr(preg_replace('/[_-]+/', ' ', pathinfo($f['name'], PATHINFO_FILENAME)), 0, 120);

    $st = $pdo->prepare('INSERT INTO archivos (grupo, asesor_id, titulo, nombre_original, mime, tamano, ruta, token) VALUES (?,?,?,?,?,?,?,?)');
    $st->execute([$grupo, $asesor, $titulo, mb_substr((string)$f['name'], 0, 255), $mime, (int)$f['size'], $ruta, $token]);
    $id = (int)$pdo->lastInsertId();
    $r = $pdo->query('SELECT * FROM archivos WHERE id = ' . $id)->fetch();
    json_out(['ok' => true, 'data' => archivo_publico($r)], 201);
}

if ($method === 'GET') {
    $grupo = trim((string)($_GET['grupo'] ?? ''));
    $pre = (int)($_GET['prereserva'] ?? 0);
    if ($pre > 0) { $st = $pdo->prepare('SELECT * FROM archivos WHERE prereserva_id = ? AND deleted_at IS NULL ORDER BY id'); $st->execute([$pre]); }
    elseif ($grupoOk($grupo)) { $st = $pdo->prepare('SELECT * FROM archivos WHERE grupo = ? AND deleted_at IS NULL ORDER BY id'); $st->execute([$grupo]); }
    else json_fail('Falta grupo');
    json_out(['ok' => true, 'data' => array_map('archivo_publico', $st->fetchAll())]);
}

$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) json_fail('Falta id');
$st = $pdo->prepare('SELECT * FROM archivos WHERE id = ? AND deleted_at IS NULL'); $st->execute([$id]);
$r = $st->fetch();
if (!$r) json_fail('Documento no encontrado', 404);

if ($method === 'PUT') {
    $b = read_json();
    $titulo = mb_substr(trim((string)($b['titulo'] ?? '')), 0, 120);
    if ($titulo === '') json_fail('El título no puede estar vacío');
    $pdo->prepare('UPDATE archivos SET titulo = ? WHERE id = ?')->execute([$titulo, $id]);
    $r['titulo'] = $titulo;
    json_out(['ok' => true, 'data' => archivo_publico($r)]);
}
if ($method === 'DELETE') {
    $pdo->prepare('UPDATE archivos SET deleted_at = NOW() WHERE id = ?')->execute([$id]);
    $fisico = archivos_dir() . '/' . $r['ruta'];
    if (is_file($fisico)) @unlink($fisico);
    json_out(['ok' => true]);
}
json_fail('Método no permitido', 405);
