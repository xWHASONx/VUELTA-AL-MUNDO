<?php
// api/documento.php?t=TOKEN[&d=1] - abre un documento adjunto por su enlace secreto (sin llave: el token es la llave)
require __DIR__ . '/bootstrap.php';

function pagina_error(string $msg, int $code = 404): void {
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Documento no disponible</title></head>'
        . '<body style="margin:0;background:#1a4999;font-family:Arial,sans-serif;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px">'
        . '<div><div style="font-size:52px">📄</div><h1 style="font-size:22px;margin:10px 0">' . htmlspecialchars($msg) . '</h1>'
        . '<p style="color:#cbd5e1">Escríbenos por WhatsApp al <a href="https://wa.me/573104767498" style="color:#FF7F00;font-weight:bold">310 476 7498</a> y te lo reenviamos.</p>'
        . '<p style="font-size:12px;color:#94a3b8">Vuelta al Mundo Tours SAS · RNT 198181</p></div></body></html>';
    exit;
}

$t = (string)($_GET['t'] ?? '');
if (!preg_match('/^[a-f0-9]{40}$/', $t)) pagina_error('Enlace inválido');
try { $pdo = db($CONFIG); } catch (Throwable $e) { pagina_error('Servicio no disponible en este momento', 503); }
$st = $pdo->prepare('SELECT * FROM archivos WHERE token = ? AND deleted_at IS NULL'); $st->execute([$t]);
$r = $st->fetch();
if (!$r) pagina_error('Este documento ya no está disponible');
$ruta = archivos_dir() . '/' . $r['ruta'];
if (!is_file($ruta)) pagina_error('El archivo no se encuentra en el servidor');

try { $pdo->prepare('UPDATE archivos SET vistas = vistas + 1, ultima_vista = NOW() WHERE id = ?')->execute([(int)$r['id']]); } catch (Throwable $e) {}

$ext = pathinfo($r['ruta'], PATHINFO_EXTENSION);
$nombre = preg_replace('/[^A-Za-z0-9 ._()-]/u', '', $r['titulo'] ?: 'documento') ?: 'documento';
$inline = empty($_GET['d']) && in_array($r['mime'], ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'], true);
header_remove('Content-Type');
header('Content-Type: ' . $r['mime']);
header('Content-Length: ' . filesize($ruta));
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $nombre . '.' . $ext . '"');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: private, max-age=3600');
readfile($ruta);
