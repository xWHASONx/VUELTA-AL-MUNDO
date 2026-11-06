# Despliegue en Hostinger — Vuelta al Mundo Tours

Las herramientas son estáticas (HTML/CSS/JS) más una pequeña API en PHP con MySQL
para guardar cotizaciones, pre-reservas y enviar correos desde el buzón de Hostinger.

## 1. Crear la base de datos (hPanel)
1. hPanel → **Bases de datos → MySQL**.
2. Crear base de datos y usuario (anota nombre, usuario y contraseña).
3. El host normalmente es `localhost` (hPanel lo muestra al lado de la base).
No hay que importar nada: las tablas se crean solas la primera vez que la API responde.

## 2. Buzón de correo
- Buzón creado en hPanel → **Correos**: `reservas@vueltalmundotours.com.co`.
- SMTP: `smtp.hostinger.com`, puerto `465`, SSL.

## 3. Configurar la API
1. Copia `api/config.example.php` como `api/config.php`.
2. Completa `db` (host, name, user, pass), `smtp.pass` (contraseña del buzón) y cambia `api_token`
   por una clave larga cualquiera.
3. En `js/config.js` pon el **mismo** valor en `API_TOKEN`.

## 4. Subir los archivos
Opción A — Administrador de archivos del hPanel: sube `vuelta-al-mundo-herramientas.zip` a la carpeta
destino (por ejemplo `public_html/herramientas/`) y extráelo ahí.
Opción B — FTP/SFTP con FileZilla: sube todo el contenido de esta carpeta (menos `.git`).

Estructura esperada en el servidor:
```
herramientas/
  index.html, hub.html, cotizador.html, planes.html, prereserva.html, imprimible.html
  css/  js/  assets/
  api/  (con config.php ya completado)
```

## 5. Probar
1. Abre `https://TU-DOMINIO/herramientas/api/ping.php?key=EL_API_TOKEN` → debe responder
   `{"ok":true,"db":true,...}`. Si `db` es `false`, revisa las credenciales en `api/config.php`.
2. Abre `https://TU-DOMINIO/herramientas/` → acceso de asesores (contraseña `HOLA`).
3. Haz una cotización de prueba, descárgala y envíala por correo a tu propio buzón.

## 6. Notas
- PHP 8.x (Hostinger lo trae por defecto). Si el hosting tiene PHP 7.4, cambiar en hPanel a 8.1 o superior.
- Si las cotizaciones no se guardan, en el dashboard aparece una franja naranja "Sin conexión con la base de datos".
- Cada vez que se actualicen archivos css/js, sube el sello `?v=...` en los HTML para que el navegador
  no use caché (o pide que lo haga quien despliegue).
- `api/config.php` nunca se sube a GitHub (está en `.gitignore`).
