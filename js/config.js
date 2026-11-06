// js/config.js
// Configuración central de VUELTA AL MUNDO TOURS
// (contraseña, WhatsApp, asesores, datos de la empresa y conexión con la API en Hostinger)

window.VAM_CONFIG = {
    ACCESS_PASSWORD: 'HOLA',

    // API PHP en el mismo hosting (carpeta api/). El token debe ser igual a 'api_token' en api/config.php
    API_BASE: 'api/',
    API_TOKEN: 'vam-95fb954c622dda8313808d11',

    // WhatsApp corporativo (el mismo de la página web). Para wa.me lleva el indicativo 57.
    CORPORATE_WPP: '573104767498',
    CONFIRMATION_WPP: '573104767498',
    WPP_DISPLAY: '310 476 7498',

    COMPANY: {
        name: 'VUELTA AL MUNDO TOURS SAS',
        nit: '901802306-9',
        rnt: '198181',
        address: 'Calle 10 # 43-55, Edificio La Juliana, piso 5, oficina 3, Cali',
        email: 'gerencia@vueltalmundotours.com.co',
        salesEmail: 'reservas@vueltalmundotours.com.co',
        web: 'https://vueltalmundotours.com.co',
        policiesUrl: 'https://vueltalmundotours.com.co/nuestras_politicas/',
        schedule: 'Lunes a viernes de 9:00 a.m. a 6:00 p.m.'
    },

    // Asesores: todos entran con la misma contraseña y eligen su perfil (avatar) en el acceso.
    ADVISORS: {
        'Ana_Sofia_Posso':    { name: 'Ana Sofía Posso',    role: 'Asesora', photoUrl: 'assets/asesores/ana_sofia_posso.jpg' },
        'Carolina_Hernandez': { name: 'Carolina Hernández', role: 'Asesora', photoUrl: 'assets/asesores/carolina_hernandez.jpg' },
        'Daniela_Cifuentes':  { name: 'Daniela Cifuentes',  role: 'Asesora', photoUrl: 'assets/asesores/daniela_cifuentes.jpg' },
        'Francia_Castillo':   { name: 'Francia Elena Castillo', role: 'Asesora', photoUrl: 'assets/asesores/francia_castillo.jpg' },
        'Laura_Salinas':      { name: 'Laura Salinas',      role: 'Asesora', photoUrl: 'assets/asesores/laura_salinas.jpg' },
        'Santiago_Martinez':  { name: 'Santiago Martínez',  role: 'Asesor',  photoUrl: 'assets/asesores/santiago_martinez.jpg' },
        'Jimmy_Camacho':      { name: 'Jimmy Camacho',      role: 'Asesor',  photoUrl: 'assets/asesores/jimmy_camacho.jpg' }
    }
};

// Construye un enlace de WhatsApp con mensaje opcional
window.VAM_WA = function (number, text) {
    const n = String(number || '').replace(/\D/g, '');
    const full = n.length === 10 ? '57' + n : n;
    return `https://wa.me/${full}` + (text ? `?text=${encodeURIComponent(text)}` : '');
};

// Formato de moneda COP/USD
window.VAM_MONEY = function (value, currency = 'COP') {
    const number = parseFloat(String(value).replace(/[^0-9.-]+/g, ''));
    if (isNaN(number) || !String(value).trim()) return '';
    return number.toLocaleString(currency === 'COP' ? 'es-CO' : 'en-US', {
        style: 'currency', currency,
        minimumFractionDigits: currency === 'COP' ? 0 : 2,
        maximumFractionDigits: currency === 'COP' ? 0 : 2
    });
};

// Protección de páginas internas: sin sesión de asesor, volver al acceso
const _path = window.location.pathname;
const _isPublic = _path === '/' || _path.endsWith('index.html') || _path.endsWith('hub.html');
if (!_isPublic && !localStorage.getItem('vam_user')) {
    window.location.href = 'index.html';
}
window.VAM_LOGOUT = function () {
    localStorage.removeItem('vam_user');
    localStorage.removeItem('vam_session');
    window.location.href = 'index.html';
};
