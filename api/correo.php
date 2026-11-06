<?php
// api/correo.php - envía un documento (PDF en base64) al cliente por el SMTP de Hostinger
// POST {asesorId, para, nombreCliente, asunto, mensaje, tipo, referencia, pdfBase64, pdfNombre}
require __DIR__ . '/bootstrap.php';
require_token($CONFIG);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_fail('Método no permitido', 405);

require __DIR__ . '/lib/Exception.php';
require __DIR__ . '/lib/PHPMailer.php';
require __DIR__ . '/lib/SMTP.php';

$b = read_json();
$para = filter_var(trim((string)($b['para'] ?? '')), FILTER_VALIDATE_EMAIL);
if (!$para) json_fail('Correo del cliente inválido');
$smtp = $CONFIG['smtp'];
if (($smtp['pass'] ?? 'PENDIENTE') === 'PENDIENTE') json_fail('Correo saliente sin configurar en api/config.php', 500);

$asunto = trim((string)($b['asunto'] ?? 'Tu propuesta de viaje - Vuelta al Mundo Tours'));
$nombre = trim((string)($b['nombreCliente'] ?? ''));
$mensaje = trim((string)($b['mensaje'] ?? ''));
$asesorNombre = trim((string)($b['asesorNombre'] ?? 'Tu asesor'));

$docsHtml = '';
$enlaces = is_array($b['enlaces'] ?? null) ? $b['enlaces'] : [];
if ($enlaces) {
    $docsHtml = '<div style="margin:18px 0;padding:16px;background:#f1f7fe;border:1px solid #cfe5fb;border-radius:12px"><p style="margin:0 0 10px;font-weight:bold;color:#1a4999">📎 Tus documentos</p><p style="margin:0 0 12px;font-size:13px;color:#475569">Toca cada botón para abrir o descargar el documento.</p>';
    foreach (array_slice($enlaces, 0, 20) as $e) {
        $u = (string)($e['url'] ?? ''); $ti = trim((string)($e['titulo'] ?? 'Documento'));
        if (!preg_match('#^https?://#', $u)) continue;
        $docsHtml .= '<a href="' . htmlspecialchars($u) . '" style="display:inline-block;background:#1F9DF5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold;margin:0 8px 8px 0">📄 ' . htmlspecialchars($ti) . '</a>';
    }
    $docsHtml .= '</div>';
}
$html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">'
    . '<div style="background:#1a4999;padding:22px;text-align:center;border-bottom:4px solid #FF7F00"><span style="color:#fff;font-size:20px;font-weight:bold">VUELTA AL MUNDO TOURS</span></div>'
    . '<div style="padding:24px;font-size:15px;line-height:1.6">'
    . '<p>Hola ' . htmlspecialchars($nombre ?: '') . ',</p>'
    . '<p>' . nl2br(htmlspecialchars($mensaje ?: 'Adjunto encontrarás el documento de tu viaje. Cualquier duda, escríbenos por WhatsApp.')) . '</p>'
    . $docsHtml
    . '<p style="margin-top:22px">' . htmlspecialchars($asesorNombre) . '<br><span style="color:#64748b">Vuelta al Mundo Tours SAS · RNT 198181</span><br>'
    . '<a href="https://wa.me/573104767498" style="color:#1F9DF5">WhatsApp 310 476 7498</a></p>'
    . '</div><div style="background:#f8fafc;padding:14px;text-align:center;font-size:12px;color:#64748b">Calle 10 # 43-55, Edificio La Juliana, Cali · <a href="https://vueltalmundotours.com.co/nuestras_politicas/" style="color:#1F9DF5">Políticas</a></div></div>';

$mail = new PHPMailer\PHPMailer\PHPMailer(true);
$ok = false; $err = null;
try {
    $mail->isSMTP();
    $mail->Host = $smtp['host'];
    $mail->SMTPAuth = true;
    $mail->Username = $smtp['user'];
    $mail->Password = $smtp['pass'];
    $mail->SMTPSecure = $smtp['secure'] === 'tls' ? PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS : PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
    $mail->Port = (int)$smtp['port'];
    $mail->CharSet = 'UTF-8';
    $mail->setFrom($smtp['user'], $smtp['from_name'] ?? 'Vuelta al Mundo Tours');
    if (!empty($smtp['reply_to'])) $mail->addReplyTo($smtp['reply_to']);
    $mail->addAddress($para, $nombre);
    $mail->Subject = $asunto;
    $mail->isHTML(true);
    $mail->Body = $html;
    $mail->AltBody = strip_tags(str_replace('<br>', "\n", $html));
    if (!empty($b['pdfBase64'])) {
        $bin = base64_decode(preg_replace('#^data:.*?;base64,#', '', (string)$b['pdfBase64']), true);
        if ($bin === false) json_fail('PDF inválido');
        $mail->addStringAttachment($bin, (string)($b['pdfNombre'] ?? 'documento.pdf'), 'base64', 'application/pdf');
    }
    // Copia oculta al buzón de la agencia para que el envío se vea en la bandeja de entrada
    if (!isset($smtp['copia_oculta']) || $smtp['copia_oculta'] !== false) $mail->addBCC($smtp['copia_oculta'] ?? $smtp['user']);
    $mail->send();
    $ok = true;
    // Además, intentar guardar el mensaje en la carpeta "Enviados" del webmail (si el hosting tiene IMAP)
    if (function_exists('imap_open')) {
        try {
            $imapHost = '{' . ($smtp['imap_host'] ?? 'imap.hostinger.com') . ':993/imap/ssl}';
            $box = @imap_open($imapHost, $smtp['user'], $smtp['pass'], 0, 1);
            if ($box) {
                $carpeta = null;
                foreach ((array)@imap_list($box, $imapHost, '*') as $c) { if (preg_match('/(Sent|Enviados)$/i', $c)) { $carpeta = $c; break; } }
                if ($carpeta) @imap_append($box, $carpeta, $mail->getSentMIMEMessage(), '\\Seen');
                @imap_close($box);
            }
        } catch (Throwable $e) { /* opcional */ }
    }
} catch (Throwable $e) {
    $err = $e->getMessage();
}

try {
    $pdo = db($CONFIG);
    $pdo->prepare('INSERT INTO correos (asesor_id, destinatario, asunto, tipo, referencia, ok, error) VALUES (?,?,?,?,?,?,?)')
        ->execute([(string)($b['asesorId'] ?? ''), $para, $asunto, (string)($b['tipo'] ?? ''), (string)($b['referencia'] ?? ''), $ok ? 1 : 0, $err ? substr($err, 0, 500) : null]);
} catch (Throwable $e) { /* el registro es opcional */ }

if (!$ok) json_fail('No se pudo enviar el correo: ' . $err, 502);
json_out(['ok' => true]);
