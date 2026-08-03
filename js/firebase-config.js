// firebase-config.js
// Configuración de Vuelta al Mundo Tours

window.VAM_CONFIG = {
    ACCESS_PASSWORD: 'HOLA',
    CORPORATE_WPP: '3122226269',
    CONFIRMATION_WPP: '3122226269',
    ADVISORS: {
        'Ana_Sofia_Posso': { name: 'Ana Sofía Posso', photoUrl: 'https://i.imgur.com/eg2dk3J.jpeg' }
    },
    FIREBASE: {
        apiKey: "PENDIENTE",
        authDomain: "PENDIENTE.firebaseapp.com",
        projectId: "PENDIENTE",
        storageBucket: "PENDIENTE.appspot.com",
        messagingSenderId: "PENDIENTE",
        appId: "PENDIENTE"
    },
    COLLECTION: 'cotizaciones_vam'
};

// Check auth on all protected pages except index and hub
const _path = window.location.pathname;
const _isPublic = _path === '/' || _path.endsWith('index.html') || _path.endsWith('hub.html');
if (!_isPublic) {
    if (!localStorage.getItem('vam_user')) {
        window.location.href = 'index.html';
    }
}
