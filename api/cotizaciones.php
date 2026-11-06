<?php
// api/cotizaciones.php - CRUD de cotizaciones
// GET    ?asesor=ID          -> lista (sin las imágenes) del asesor
// GET    ?id=N               -> una cotización completa
// POST   {asesorId, numero, cliente, destinosResumen, plan, estado, formData} -> crea
// PUT    ?id=N {campos}      -> actualiza
// DELETE ?id=N               -> elimina
require __DIR__ . '/bootstrap.php';
require_token($CONFIG);
$pdo = db($CONFIG);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $st = $pdo->prepare('SELECT * FROM cotizaciones WHERE id = ?');
        $st->execute([(int)$_GET['id']]);
        $row = $st->fetch();
        if (!$row) json_fail('No existe', 404);
        json_out(['ok' => true, 'data' => row_out($row, true)]);
    }
    $asesor = trim((string)($_GET['asesor'] ?? ''));
    if ($asesor === '') json_fail('Falta asesor');
    $st = $pdo->prepare('SELECT id, asesor_id, numero, cliente, destinos, plan, estado, created_at, updated_at FROM cotizaciones WHERE asesor_id = ? ORDER BY created_at DESC LIMIT 500');
    $st->execute([$asesor]);
    json_out(['ok' => true, 'data' => array_map(fn($r) => row_out($r, false), $st->fetchAll())]);
}

if ($method === 'POST') {
    $b = read_json();
    foreach (['asesorId', 'numero'] as $k) if (empty($b[$k])) json_fail("Falta $k");
    $st = $pdo->prepare('INSERT INTO cotizaciones (asesor_id, numero, cliente, destinos, plan, estado, form_data) VALUES (?,?,?,?,?,?,?)');
    $st->execute([
        (string)$b['asesorId'], (string)$b['numero'], (string)($b['cliente'] ?? ''), (string)($b['destinosResumen'] ?? ''),
        isset($b['plan']) && $b['plan'] !== '' ? (string)$b['plan'] : null, (string)($b['estado'] ?? 'Pendiente'),
        json_encode($b['formData'] ?? new stdClass(), JSON_UNESCAPED_UNICODE),
    ]);
    json_out(['ok' => true, 'id' => (int)$pdo->lastInsertId()], 201);
}

if ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) json_fail('Falta id');
    $b = read_json();
    $map = ['numero' => 'numero', 'cliente' => 'cliente', 'destinosResumen' => 'destinos', 'plan' => 'plan', 'estado' => 'estado'];
    $sets = []; $vals = [];
    foreach ($map as $in => $col) if (array_key_exists($in, $b)) { $sets[] = "$col = ?"; $vals[] = $b[$in] === '' && $col === 'plan' ? null : (string)$b[$in]; }
    if (array_key_exists('formData', $b)) { $sets[] = 'form_data = ?'; $vals[] = json_encode($b['formData'], JSON_UNESCAPED_UNICODE); }
    if (!$sets) json_fail('Nada que actualizar');
    $vals[] = $id;
    $st = $pdo->prepare('UPDATE cotizaciones SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $st->execute($vals);
    json_out(['ok' => true]);
}

if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) json_fail('Falta id');
    $pdo->prepare('DELETE FROM cotizaciones WHERE id = ?')->execute([$id]);
    json_out(['ok' => true]);
}

json_fail('Método no permitido', 405);

function row_out(array $r, bool $withData): array {
    $o = [
        'id' => (int)$r['id'], 'asesorId' => $r['asesor_id'], 'numero' => $r['numero'], 'cliente' => $r['cliente'],
        'destinosResumen' => $r['destinos'], 'plan' => $r['plan'], 'estado' => $r['estado'],
        'timestamp' => strtotime($r['created_at']) * 1000, 'updated' => strtotime($r['updated_at']) * 1000,
    ];
    if ($withData) $o['formData'] = json_decode($r['form_data'], true) ?: [];
    return $o;
}
