<?php
// api/ping.php - comprueba que la API y la base de datos responden
require __DIR__ . '/bootstrap.php';
require_token($CONFIG);
$dbOk = false; $dbMsg = '';
try { db($CONFIG); $dbOk = true; } catch (Throwable $e) { $dbMsg = $e->getMessage(); }
json_out(['ok' => true, 'db' => $dbOk, 'db_error' => $dbMsg, 'php' => PHP_VERSION, 'hora' => date('c')]);
