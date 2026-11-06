<?php
// api/config.example.php
// Copia este archivo como config.php (en esta misma carpeta) y completa los datos.
// config.php NO se sube a GitHub (está en .gitignore).

return [
    // Base de datos MySQL creada en el hPanel de Hostinger (Bases de datos > MySQL)
    'db' => [
        'host'    => 'localhost',
        'name'    => 'PENDIENTE',   // ej: u123456789_vam
        'user'    => 'PENDIENTE',   // ej: u123456789_vam
        'pass'    => 'PENDIENTE',
        'charset' => 'utf8mb4',
    ],

    // Llave que el navegador envía en cada petición (debe ser la misma que API_TOKEN en js/config.js)
    'api_token' => 'vam-2026-cambiar',
    // Clave de SerpAPI para el buscador de vuelos (https://serpapi.com/manage-api-key). Plan gratis: 250 búsquedas/mes.
    'serpapi_key' => 'PENDIENTE',

    // Correo saliente (buzón creado en Hostinger > Correos)
    'smtp' => [
        'host'      => 'smtp.hostinger.com',
        'port'      => 465,
        'secure'    => 'ssl',
        'user'      => 'reservas@vueltalmundotours.com.co',
        'pass'      => 'PENDIENTE',
        'from_name' => 'Vuelta al Mundo Tours',
        'reply_to'  => 'gerencia@vueltalmundotours.com.co',
        // Copia oculta de cada envío (por defecto el mismo buzón, para verlos en la bandeja de entrada). false = sin copia
        'copia_oculta' => 'reservas@vueltalmundotours.com.co',
        'imap_host' => 'imap.hostinger.com', // para guardar copia en "Enviados" del webmail
    ],
];
