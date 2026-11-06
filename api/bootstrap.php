<?php
// api/bootstrap.php - utilidades comunes de la API (JSON, config, base de datos, seguridad)
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function json_out($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function json_fail(string $msg, int $code = 400): void { json_out(['ok' => false, 'error' => $msg], $code); }

set_exception_handler(function (Throwable $e) {
    json_fail('Error del servidor: ' . $e->getMessage(), 500);
});

$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) json_fail('Falta api/config.php. Copia config.example.php y completa los datos.', 500);
$CONFIG = require $configFile;

// Seguridad básica: la llave debe coincidir con la del frontend
function require_token(array $config): void {
    $sent = $_SERVER['HTTP_X_VAM_KEY'] ?? ($_GET['key'] ?? '');
    if (!hash_equals((string)$config['api_token'], (string)$sent)) json_fail('No autorizado', 401);
}


function read_json(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $data = json_decode($raw, true);
    if (!is_array($data)) json_fail('JSON inválido');
    return $data;
}

function db(array $config): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = $config['db'];
    if (($c['name'] ?? 'PENDIENTE') === 'PENDIENTE') json_fail('Base de datos sin configurar en api/config.php', 500);
    $dsn = "mysql:host={$c['host']};dbname={$c['name']};charset={$c['charset']}";
    $pdo = new PDO($dsn, $c['user'], $c['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    ensure_schema($pdo);
    return $pdo;
}

// Crea las tablas la primera vez (no hay que importar nada a mano)
function ensure_schema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS cotizaciones (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        asesor_id VARCHAR(80) NOT NULL,
        numero VARCHAR(40) NOT NULL,
        cliente VARCHAR(160) NOT NULL DEFAULT '',
        destinos VARCHAR(255) NOT NULL DEFAULT '',
        plan VARCHAR(80) NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
        form_data LONGTEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_asesor (asesor_id),
        INDEX idx_numero (numero)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS prereservas (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        asesor_id VARCHAR(80) NOT NULL,
        cliente VARCHAR(160) NOT NULL DEFAULT '',
        hotel VARCHAR(200) NOT NULL DEFAULT '',
        destino VARCHAR(200) NOT NULL DEFAULT '',
        localizador VARCHAR(80) NOT NULL DEFAULT '',
        datos LONGTEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_asesor (asesor_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS confirmaciones (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        asesor_id VARCHAR(80) NOT NULL,
        prereserva_id INT UNSIGNED NULL,
        cliente VARCHAR(160) NOT NULL DEFAULT '',
        hotel VARCHAR(200) NOT NULL DEFAULT '',
        destino VARCHAR(200) NOT NULL DEFAULT '',
        localizador VARCHAR(80) NOT NULL DEFAULT '',
        valor_pagado BIGINT NOT NULL DEFAULT 0,
        moneda VARCHAR(3) NOT NULL DEFAULT 'COP',
        medio_pago VARCHAR(60) NOT NULL DEFAULT '',
        fecha_pago DATE NULL,
        datos LONGTEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_asesor (asesor_id),
        INDEX idx_prereserva (prereserva_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    // Planes precargados creados por los asesores desde el cotizador (compartidos por toda la agencia)
    $pdo->exec("CREATE TABLE IF NOT EXISTS planes (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        asesor_id VARCHAR(80) NOT NULL,
        asesor_nombre VARCHAR(120) NOT NULL DEFAULT '',
        nombre VARCHAR(160) NOT NULL,
        destino VARCHAR(160) NOT NULL DEFAULT '',
        pais VARCHAR(120) NOT NULL DEFAULT '',
        resumen VARCHAR(255) NOT NULL DEFAULT '',
        precio BIGINT NOT NULL DEFAULT 0,
        moneda VARCHAR(3) NOT NULL DEFAULT 'COP',
        portada MEDIUMTEXT NULL,
        form_data LONGTEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        INDEX idx_destino (destino)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS correos (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        asesor_id VARCHAR(80) NOT NULL,
        destinatario VARCHAR(200) NOT NULL,
        asunto VARCHAR(255) NOT NULL,
        tipo VARCHAR(40) NOT NULL DEFAULT '',
        referencia VARCHAR(80) NOT NULL DEFAULT '',
        ok TINYINT(1) NOT NULL DEFAULT 0,
        error VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    // Documentos adjuntos a una pre-reserva (tiquetes, vouchers, seguros...). Se sirven por enlace secreto (documento.php?t=TOKEN)
    $pdo->exec("CREATE TABLE IF NOT EXISTS archivos (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        grupo VARCHAR(60) NOT NULL,
        prereserva_id INT UNSIGNED NULL,
        asesor_id VARCHAR(80) NOT NULL,
        titulo VARCHAR(120) NOT NULL DEFAULT '',
        nombre_original VARCHAR(255) NOT NULL,
        mime VARCHAR(100) NOT NULL,
        tamano INT UNSIGNED NOT NULL DEFAULT 0,
        ruta VARCHAR(255) NOT NULL,
        token CHAR(40) NOT NULL,
        vistas INT UNSIGNED NOT NULL DEFAULT 0,
        ultima_vista DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL,
        UNIQUE KEY uk_token (token),
        INDEX idx_grupo (grupo),
        INDEX idx_prereserva (prereserva_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

// Carpeta privada donde se guardan los adjuntos (bloqueada por .htaccess; solo documento.php la lee)
function archivos_dir(): string {
    $dir = __DIR__ . '/archivos';
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $ht = $dir . '/.htaccess';
    if (!file_exists($ht)) file_put_contents($ht, "Require all denied\nOrder deny,allow\nDeny from all\n");
    return $dir;
}
// URL pública absoluta de un documento (para el voucher, el PDF y el correo)
function documento_url(string $token): string {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $base = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'), '/');
    return $base . '/documento.php?t=' . $token;
}
function archivo_publico(array $r): array {
    return ['id' => (int)$r['id'], 'titulo' => $r['titulo'], 'nombre' => $r['nombre_original'], 'mime' => $r['mime'], 'tamano' => (int)$r['tamano'], 'token' => $r['token'], 'url' => documento_url($r['token']), 'vistas' => (int)($r['vistas'] ?? 0), 'creado' => $r['created_at'] ?? null];
}
