/* js/imprimible.js - Lógica para cargar datos y preparar impresión */

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Validar sesión de asesor
    let currentUser = localStorage.getItem('vam_user');
    if (!currentUser || !VAM_CONFIG.ADVISORS[currentUser]) {
        localStorage.removeItem('vam_user');
        window.location.href = 'hub.html';
        return;
    }

    // Header setup
    const headerUserName = document.getElementById('header-user-name');
    if (headerUserName) {
        headerUserName.textContent = `Hola, ${VAM_CONFIG.ADVISORS[currentUser].name.split(' ')[0]}`;
    }
    
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('vam_user');
            window.location.href = 'hub.html';
        });
    }

    const advisorName = VAM_CONFIG.ADVISORS[currentUser].name;

    // 2. Cargar datos de la Pre-reserva
    const dataString = localStorage.getItem('vam_current_prereserva');
    const dataStatus = document.getElementById('data-status');

    const mainWrapper = document.querySelector('.wrapper');
    if (mainWrapper) mainWrapper.style.display = 'block';

    if (!dataString) {
        dataStatus.textContent = '⚠️ No hay datos cargados (Haz primero una pre-reserva)';
        dataStatus.style.color = '#ff6b6b';
        // Llenar con datos de prueba para que no se vea feo si entran directo
        populateDocument({
            nombre: "Cliente de Prueba",
            documento: "123456789",
            destino: "Destino de Prueba",
            hotel: "Hotel Ejemplo Resort",
            regimen: "Todo incluido",
            fechaInput: "2026-12-01",
            noches: "4",
            habitaciones: "1",
            localizador: "PDTE-123",
            acompanantes: "Ninguno",
            comentarios: "Ninguno"
        }, advisorName);
    } else {
        try {
            const data = JSON.parse(dataString);
            dataStatus.textContent = '✅ Datos cargados correctamente';
            dataStatus.style.color = '#4caf50';
            populateDocument(data, advisorName);
        } catch(e) {
            console.error("Error parseando datos", e);
            dataStatus.textContent = '❌ Error al cargar datos';
        }
    }

    // 3. Función para poblar el HTML
    function populateDocument(data, advisor) {
        // Portada
        document.getElementById('cover-client-name').textContent = data.nombre.toUpperCase();
        document.getElementById('cover-dest-name').textContent = data.destino;
        document.getElementById('cover-advisor-name').textContent = advisor;

        // Detalles
        document.getElementById('det-localizador').textContent = data.localizador || 'Pendiente';
        document.getElementById('det-destino').textContent = data.destino;
        document.getElementById('det-hotel').textContent = data.hotel;
        document.getElementById('det-regimen').textContent = data.regimen;
        
        // Fechas
        const checkIn = new Date(data.fechaInput + 'T00:00:00');
        const checkOut = new Date(checkIn);
        checkOut.setDate(checkOut.getDate() + parseInt(data.noches, 10));
        
        document.getElementById('det-checkin').textContent = checkIn.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('det-checkout').textContent = checkOut.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
        
        document.getElementById('det-noches').textContent = `${data.noches} noche(s)`;
        document.getElementById('det-habitaciones').textContent = data.habitaciones;
        
        // Pasajeros
        document.getElementById('det-titular').textContent = data.nombre;
        document.getElementById('det-doc').textContent = data.documento;
        document.getElementById('det-acompanantes').textContent = data.acompanantes.trim() || 'No se registraron acompañantes.';
        
        // Valor Restante
        if (data.valorRestante && data.moneda) {
            const number = parseFloat(String(data.valorRestante).replace(/[^0-9.-]+/g, ""));
            let valorFormateado = "0";
            if (!isNaN(number)) {
                const options = data.moneda === 'COP' ? { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 } : { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 };
                valorFormateado = number.toLocaleString(data.moneda === 'COP' ? 'es-CO' : 'en-US', options);
            }
            document.getElementById('det-valor-restante').textContent = `${valorFormateado} ${data.moneda}`;
        } else {
            const el = document.getElementById('det-valor-restante');
            if(el) el.textContent = 'Pendiente';
        }
        
        const comentariosText = data.comentarios ? data.comentarios.trim() : '';
        const commentsPage = document.getElementById('comments-page');
        if (comentariosText) {
            document.getElementById('det-comentarios').textContent = comentariosText;
            commentsPage.style.display = 'block';
        } else {
            commentsPage.style.display = 'none';
        }

        // Firmas y Garantía
        document.getElementById('sig-advisor').textContent = advisor;
        document.getElementById('sig-client-doc').textContent = data.documento;
        document.getElementById('war-client').textContent = data.nombre;
        document.getElementById('war-loc').textContent = data.localizador || 'PENDIENTE';

        // Agradecimiento
        document.getElementById('thanks-advisor').textContent = advisor;
    }

    // 4. Lógica para pegar la imagen de portada
    const coverPasteArea = document.getElementById('cover-paste-area');
    const coverPreview = document.getElementById('cover-preview');
    const pdfCoverImg = document.getElementById('pdf-cover-img');
    const pdfCoverPlaceholder = document.getElementById('pdf-cover-placeholder');
    const presetButtons = document.querySelectorAll('.btn-preset');

    // Función para actualizar la imagen
    const updateCoverImage = (imgSrc) => {
        coverPreview.src = imgSrc;
        coverPreview.style.display = 'block';
        pdfCoverImg.src = imgSrc;
        pdfCoverImg.style.display = 'block';
        pdfCoverPlaceholder.style.display = 'none';
    };

    // Botones de prediseño
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const imgSrc = btn.getAttribute('data-img');
            updateCoverImage(imgSrc);
            coverPasteArea.querySelector('p').textContent = "Prediseño seleccionado. Puedes pegar otra imagen para reemplazarla.";
        });
    });

    // Pegar imagen
    coverPasteArea.addEventListener('paste', (e) => {
        e.preventDefault();
        const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
        if (item) {
            const reader = new FileReader();
            reader.onload = event => {
                const base64Image = event.target.result;
                updateCoverImage(base64Image);
                coverPasteArea.querySelector('p').textContent = "Imagen personalizada cargada. Pega otra para reemplazarla.";
            };
            reader.readAsDataURL(item.getAsFile());
        }
    });

});
