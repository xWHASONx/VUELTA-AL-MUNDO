<?php
// api/vuelos.php — Puente a Google Flights (SerpAPI) para el cotizador.
// La clave de SerpAPI vive en api/config.php ('serpapi_key'); nunca llega al navegador.
//
// Peticiones (POST JSON, con cabecera X-VAM-KEY igual a api_token):
//   ?accion=buscar   { origen, destino, ida, regreso|null, adultos, ninos }
//   ?accion=regreso  { origen, destino, ida, regreso, adultos, ninos, token }   token = departure_token del vuelo de ida elegido
//   ?accion=logo     { url }   devuelve { dataUrl } (solo hosts de Google) para poner el logo de la aerolínea en el PDF
//
// Respuesta de buscar/regreso:
//   { ok:true, mejores:[vuelo], otros:[vuelo], precioMinimo, nivelPrecio:'low'|'typical'|'high'|null, rangoTipico:[min,max]|null }
//   vuelo = { precio (TOTAL para los pasajeros pedidos, no por persona), duracionTotal (min), token, booking,
//             escalas:[{aeropuerto,nombre,minutos,nocturna}],
//             tramos:[{salida:{id,nombre,hora}, llegada:{id,nombre,hora}, aerolinea, logo, vuelo, avion, clase, minutos, extras:[], nocturno}] }
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require_token($CONFIG);

$key = (string)($CONFIG['serpapi_key'] ?? '');
if ($key === '' || $key === 'PENDIENTE') json_fail("Falta 'serpapi_key' en api/config.php", 500);

$accion = $_GET['accion'] ?? '';
$b = read_json();

function serp(array $params, string $key): array {
    $params += ['api_key' => $key, 'hl' => 'es', 'gl' => 'co', 'currency' => 'COP'];
    $url = 'https://serpapi.com/search.json?' . http_build_query($params);
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_FOLLOWLOCATION => true, CURLOPT_ENCODING => '']);
    $raw = curl_exec($ch);
    if ($raw === false) json_fail('SerpAPI no responde: ' . curl_error($ch), 502);
    $j = json_decode($raw, true);
    if (!is_array($j)) json_fail('Respuesta inválida de SerpAPI', 502);
    if (!empty($j['error'])) {
        $e = (string)$j['error'];
        $trad = [
            '/return_date.*earlier.*outbound_date/i' => 'La fecha de regreso no puede ser anterior a la de ida.',
            '/outbound_date.*(past|earlier than today)/i' => 'La fecha de ida ya pasó.',
            '/hasn\'t returned any results/i' => 'Google no encontró vuelos para esa ruta y fechas.',
            '/Invalid.*date/i' => 'Alguna fecha no es válida.',
        ];
        foreach ($trad as $re => $msg) if (preg_match($re, $e)) json_fail($msg, 400);
        json_fail($e, 400);
    }
    return $j;
}
function num($v) { return is_numeric($v) ? $v + 0 : null; }
function resumirVuelo(array $v): array {
    return [
        'precio' => num($v['price'] ?? null),
        'tipo' => $v['type'] ?? '',
        'duracionTotal' => num($v['total_duration'] ?? null),
        'token' => $v['departure_token'] ?? null,
        'booking' => $v['booking_token'] ?? null,
        'escalas' => array_map(fn($l) => ['aeropuerto' => $l['id'] ?? '', 'nombre' => $l['name'] ?? '', 'minutos' => num($l['duration'] ?? null), 'nocturna' => !empty($l['overnight'])], $v['layovers'] ?? []),
        'tramos' => array_map(fn($f) => [
            'salida' => ['id' => $f['departure_airport']['id'] ?? '', 'nombre' => $f['departure_airport']['name'] ?? '', 'hora' => $f['departure_airport']['time'] ?? ''],
            'llegada' => ['id' => $f['arrival_airport']['id'] ?? '', 'nombre' => $f['arrival_airport']['name'] ?? '', 'hora' => $f['arrival_airport']['time'] ?? ''],
            'aerolinea' => $f['airline'] ?? '', 'logo' => $f['airline_logo'] ?? '', 'vuelo' => $f['flight_number'] ?? '',
            'avion' => $f['airplane'] ?? '', 'clase' => $f['travel_class'] ?? '', 'minutos' => num($f['duration'] ?? null),
            'extras' => array_slice($f['extensions'] ?? [], 0, 6), 'nocturno' => !empty($f['overnight']),
        ], $v['flights'] ?? []),
    ];
}

if ($accion === 'buscar' || $accion === 'regreso') {
    $origen = strtoupper(trim((string)($b['origen'] ?? ''))); $destino = strtoupper(trim((string)($b['destino'] ?? '')));
    $ida = (string)($b['ida'] ?? ''); $regreso = (string)($b['regreso'] ?? '');
    if (!preg_match('/^[A-Z]{3}$/', $origen) || !preg_match('/^[A-Z]{3}$/', $destino) || $ida === '') json_fail('Faltan aeropuertos (código de 3 letras) o fecha de ida');
    $params = ['engine' => 'google_flights', 'departure_id' => $origen, 'arrival_id' => $destino, 'outbound_date' => $ida,
               'adults' => (int)($b['adultos'] ?? 1) ?: 1, 'children' => (int)($b['ninos'] ?? 0), 'type' => $regreso !== '' ? '1' : '2'];
    if ($regreso !== '') $params['return_date'] = $regreso;
    if ($accion === 'regreso') {
        if (empty($b['token'])) json_fail('Falta el vuelo de ida elegido (token)');
        $params['departure_token'] = (string)$b['token'];
    }
    $j = serp($params, $key);
    json_out([
        'ok' => true,
        'mejores' => array_map('resumirVuelo', $j['best_flights'] ?? []),
        'otros' => array_map('resumirVuelo', array_slice($j['other_flights'] ?? [], 0, 10)),
        'precioMinimo' => num($j['price_insights']['lowest_price'] ?? null),
        'nivelPrecio' => $j['price_insights']['price_level'] ?? null,
        'rangoTipico' => $j['price_insights']['typical_price_range'] ?? null,
    ]);
}

if ($accion === 'logo') {
    $url = (string)($b['url'] ?? '');
    $host = parse_url($url, PHP_URL_HOST) ?: '';
    $permitidos = ['www.gstatic.com', 'encrypted-tbn0.gstatic.com', 'lh3.googleusercontent.com', 'serpapi.com'];
    if (!in_array($host, $permitidos, true)) json_fail('Origen de imagen no permitido');
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => true, CURLOPT_USERAGENT => 'Mozilla/5.0']);
    $bin = curl_exec($ch);
    $tipo = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'image/png';
    if ($bin === false || strlen($bin) > 2000000) json_fail('No se pudo traer el logo', 502);
    json_out(['ok' => true, 'dataUrl' => 'data:' . $tipo . ';base64,' . base64_encode($bin)]);
}

json_fail('Acción no válida (buscar | regreso | logo)', 404);
