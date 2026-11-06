<?php
// api/confirmaciones.php - registro de comprobantes de reserva confirmada y pagada
// POST {asesorId, datos:{...}, grupo} -> guarda   |   GET ?asesor=ID -> lista
require __DIR__ . '/bootstrap.php';
require_token($CONFIG);
$pdo = db($CONFIG);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $b = read_json();
    if (empty($b['asesorId']) || empty($b['datos']) || !is_array($b['datos'])) json_fail('Faltan datos');
    $d = $b['datos'];
    $valor = (int)preg_replace('/\D/', '', (string)($d['valorPagado'] ?? '0'));
    $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($d['fechaPago'] ?? '')) ? $d['fechaPago'] : null;
    $st = $pdo->prepare('INSERT INTO confirmaciones (asesor_id, prereserva_id, cliente, hotel, destino, localizador, valor_pagado, moneda, medio_pago, fecha_pago, datos) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    $st->execute([(string)$b['asesorId'], !empty($d['prereservaId']) ? (int)$d['prereservaId'] : null, (string)($d['nombre'] ?? ''), (string)($d['hotel'] ?? ''), (string)($d['destino'] ?? ''), (string)($d['localizador'] ?? ''), $valor, substr((string)($d['moneda'] ?? 'COP'), 0, 3), (string)($d['medioPago'] ?? ''), $fecha, json_encode($d, JSON_UNESCAPED_UNICODE)]);
    $id = (int)$pdo->lastInsertId();
    $grupo = (string)($b['grupo'] ?? '');
    if (preg_match('/^[A-Za-z0-9_-]{6,60}$/', $grupo)) $pdo->prepare('UPDATE archivos SET prereserva_id = ? WHERE grupo = ? AND prereserva_id IS NULL')->execute([!empty($d['prereservaId']) ? (int)$d['prereservaId'] : $id, $grupo]);
    json_out(['ok' => true, 'id' => $id], 201);
}
if ($method === 'GET' && !empty($_GET['id'])) {
    $st = $pdo->prepare('SELECT * FROM confirmaciones WHERE id = ?'); $st->execute([(int)$_GET['id']]);
    $r = $st->fetch(); if (!$r) json_fail('Confirmación no encontrada', 404);
    $r['datos'] = json_decode($r['datos'], true) ?: []; $r['id'] = (int)$r['id'];
    json_out(['ok' => true, 'data' => $r]);
}
if ($method === 'GET') {
    $asesor = trim((string)($_GET['asesor'] ?? ''));
    if ($asesor === '') json_fail('Falta asesor');
    $st = $pdo->prepare('SELECT id, prereserva_id, cliente, hotel, destino, localizador, valor_pagado, moneda, medio_pago, fecha_pago, created_at FROM confirmaciones WHERE asesor_id = ? ORDER BY created_at DESC LIMIT 500');
    $st->execute([$asesor]);
    json_out(['ok' => true, 'data' => $st->fetchAll()]);
}
$id = (int)($_GET['id'] ?? 0);
if ($id <= 0) json_fail('Falta id');
if ($method === 'PUT') {
    $b = read_json();
    if (empty($b['datos']) || !is_array($b['datos'])) json_fail('Faltan datos');
    $d = $b['datos'];
    $valor = (int)preg_replace('/\D/', '', (string)($d['valorPagado'] ?? '0'));
    $fecha = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($d['fechaPago'] ?? '')) ? $d['fechaPago'] : null;
    $st = $pdo->prepare('UPDATE confirmaciones SET cliente = ?, hotel = ?, destino = ?, localizador = ?, valor_pagado = ?, moneda = ?, medio_pago = ?, fecha_pago = ?, datos = ? WHERE id = ?');
    $st->execute([(string)($d['nombre'] ?? ''), (string)($d['hotel'] ?? ''), (string)($d['destino'] ?? ''), (string)($d['localizador'] ?? ''), $valor, substr((string)($d['moneda'] ?? 'COP'), 0, 3), (string)($d['medioPago'] ?? ''), $fecha, json_encode($d, JSON_UNESCAPED_UNICODE), $id]);
    json_out(['ok' => true]);
}
if ($method === 'DELETE') {
    $pdo->prepare('DELETE FROM confirmaciones WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}
json_fail('Método no permitido', 405);
