<?php
// api/planes.php - planes precargados creados desde el cotizador (compartidos por toda la agencia)
// GET            -> lista (sin form_data)   |  GET ?id=N -> plan completo
// POST {...}     -> crea                    |  PUT ?id=N {nombre,destino,pais,precio} -> edita datos básicos
// DELETE ?id=N   -> borrado suave
require __DIR__ . '/bootstrap.php';
require_token($CONFIG);
$pdo = db($CONFIG);
$method = $_SERVER['REQUEST_METHOD'];
$id = (int)($_GET['id'] ?? 0);

if ($method === 'GET' && $id > 0) {
    $st = $pdo->prepare('SELECT * FROM planes WHERE id = ? AND deleted_at IS NULL'); $st->execute([$id]);
    $r = $st->fetch(); if (!$r) json_fail('Plan no encontrado', 404);
    $r['form_data'] = json_decode($r['form_data'], true) ?: [];
    $r['id'] = (int)$r['id']; $r['precio'] = (int)$r['precio'];
    json_out(['ok' => true, 'data' => $r]);
}
if ($method === 'GET') {
    $rows = $pdo->query('SELECT id, asesor_id, asesor_nombre, nombre, destino, pais, resumen, precio, moneda, portada, created_at FROM planes WHERE deleted_at IS NULL ORDER BY destino, nombre')->fetchAll();
    foreach ($rows as &$r) { $r['id'] = (int)$r['id']; $r['precio'] = (int)$r['precio']; }
    json_out(['ok' => true, 'data' => $rows]);
}
if ($method === 'POST') {
    $b = read_json();
    $nombre = trim((string)($b['nombre'] ?? ''));
    if ($nombre === '' || empty($b['formData']) || !is_array($b['formData'])) json_fail('Faltan el nombre del plan o los datos');
    $json = json_encode($b['formData'], JSON_UNESCAPED_UNICODE);
    if (strlen($json) > 6000000) json_fail('El plan es demasiado pesado (fotos). Quita alguna foto.');
    $st = $pdo->prepare('INSERT INTO planes (asesor_id, asesor_nombre, nombre, destino, pais, resumen, precio, moneda, portada, form_data) VALUES (?,?,?,?,?,?,?,?,?,?)');
    $st->execute([(string)($b['asesorId'] ?? ''), mb_substr((string)($b['asesorNombre'] ?? ''), 0, 120), mb_substr($nombre, 0, 160), mb_substr(trim((string)($b['destino'] ?? '')), 0, 160), mb_substr(trim((string)($b['pais'] ?? '')), 0, 120), mb_substr((string)($b['resumen'] ?? ''), 0, 255), (int)preg_replace('/\D/', '', (string)($b['precio'] ?? '0')), substr((string)($b['moneda'] ?? 'COP'), 0, 3), !empty($b['portada']) && strlen($b['portada']) < 400000 ? (string)$b['portada'] : null, $json]);
    json_out(['ok' => true, 'id' => (int)$pdo->lastInsertId()], 201);
}
if ($id <= 0) json_fail('Falta id');
if ($method === 'PUT') {
    $b = read_json();
    $campos = []; $vals = [];
    foreach (['nombre' => 160, 'destino' => 160, 'pais' => 120, 'resumen' => 255] as $k => $max) { if (isset($b[$k])) { $campos[] = "$k = ?"; $vals[] = mb_substr(trim((string)$b[$k]), 0, $max); } }
    if (isset($b['precio'])) { $campos[] = 'precio = ?'; $vals[] = (int)preg_replace('/\D/', '', (string)$b['precio']); }
    if (!$campos) json_fail('Nada que actualizar');
    $vals[] = $id;
    $pdo->prepare('UPDATE planes SET ' . implode(', ', $campos) . ' WHERE id = ? AND deleted_at IS NULL')->execute($vals);
    json_out(['ok' => true]);
}
if ($method === 'DELETE') {
    $pdo->prepare('UPDATE planes SET deleted_at = NOW() WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}
json_fail('Método no permitido', 405);
