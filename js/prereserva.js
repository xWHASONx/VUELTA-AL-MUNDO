/* ==========================================
   PRE-RESERVA VUELTA AL MUNDO TOURS (CONECTADO AL HUB)
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {

    // Si no hay usuario logueado, redirigir al hub
    let currentUser = localStorage.getItem('vam_user');
    if (!currentUser || !VAM_CONFIG.ADVISORS[currentUser]) {
        localStorage.removeItem('vam_user');
        window.location.href = 'hub.html';
        return;
    }

    // --------------------------------------------------------
    // 1. CONFIGURACIÓN DE CORREO (EMAILJS) - VIVANTURA
    // --------------------------------------------------------
    const EMAILJS_SERVICE_ID = 'service_1q1q1l9';
    const EMAILJS_PUBLIC_KEY = 'Bwz_ooLl9-P5SjDQA';
    const EMAILJS_TEMPLATE_ID = 'template_i7zwj8u';
    
    emailjs.init(EMAILJS_PUBLIC_KEY);

    // --------------------------------------------------------
    // 2. CONFIGURACIÓN DE SUPABASE
    // --------------------------------------------------------
    let supabaseClient = null; // Desactivado temporalmente hasta configurar Firebase

    // --------------------------------------------------------
    // 3. LÓGICA DEL SISTEMA
    // --------------------------------------------------------
    const form = document.getElementById('pre-reserva-form');
    const formTitleSection = document.getElementById('form-title-section');
    const formSection = document.getElementById('form-section');
    const confirmationSection = document.getElementById('confirmation-section');
    const processBtn = document.getElementById('process-voucher-btn');
    const newVoucherBtn = document.getElementById('new-voucher-btn');
    const mainWrapper = document.querySelector('.wrapper');
    
    // Header setup (if elements exist)
    const headerUserName = document.getElementById('header-user-name');
    if (headerUserName) {
        headerUserName.textContent = `Hola, ${VAM_CONFIG.ADVISORS[localStorage.getItem('vam_user')].name.split(' ')[0]}`;
    }
    
    // Botones del header
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('vam_user');
            window.location.href = 'hub.html';
        });
    }
    
    const btnBackDashboard = document.getElementById('btn-back-dashboard');
    if (btnBackDashboard) {
        btnBackDashboard.addEventListener('click', () => {
            window.location.href = 'hub.html';
        });
    }

    // Mostrar el wrapper (ya no hay overlay)
    mainWrapper.style.display = 'block';

    // Funciones Auxiliares
    const toggleLoader = (show, text = "Generando PDF...") => {
        const loaderTextElement = document.getElementById('loader-text');
        if (loaderTextElement) loaderTextElement.textContent = text;
        const loaderOverlayElement = document.getElementById('loader-overlay');
        if(loaderOverlayElement) loaderOverlayElement.style.display = show ? 'flex' : 'none';
    };
    
    function formatDate(date) { return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }); }

    function formatCurrency(value, currency) {
        const number = parseFloat(String(value).replace(/[^0-9.-]+/g, ""));
        if (isNaN(number)) { return currency === 'COP' ? '$ 0 COP' : '$ 0.00 USD'; }
        const options = currency === 'COP' ? { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 } : { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 };
        return number.toLocaleString(currency === 'COP' ? 'es-CO' : 'en-US', options);
    }
    
    function addLinkToPDF(pdf, elementId, container, scaleFactor) {
        const element = document.getElementById(elementId);
        if (!element || !element.href) return;
        const rect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const x = (rect.left - containerRect.left) * scaleFactor;
        const y = (rect.top - containerRect.top) * scaleFactor;
        const w = rect.width * scaleFactor;
        const h = rect.height * scaleFactor;
        pdf.link(x, y, w, h, { url: element.href });
    }

    // Rellenar datos en el voucher
    function populateVoucher() {
        const data = {
            destino: document.getElementById('destino').value, nombre: document.getElementById('nombre-completo').value, documento: document.getElementById('documento').value, 
            telefono: document.getElementById('telefono').value, email: document.getElementById('email').value, direccion: document.getElementById('direccion').value,
            fechaInput: document.getElementById('fecha-viaje').value, noches: document.getElementById('cantidad-noches').value, hotel: document.getElementById('hotel').value, localizador: document.getElementById('localizador').value || 'Pendiente', 
            habitaciones: document.getElementById('cantidad-habitaciones').value, valorRestante: document.getElementById('valor-restante').value, moneda: document.getElementById('moneda').value, regimen: document.getElementById('regimen').value, acompanantes: document.getElementById('acompanantes').value, observaciones: document.getElementById('observaciones').value,
            comentarios: document.getElementById('comentarios').value,
        };
        const nochesInt = parseInt(data.noches, 10);
        const checkInDate = new Date(data.fechaInput + 'T00:00:00');
        const checkOutDate = new Date(checkInDate);
        checkOutDate.setDate(checkOutDate.getDate() + nochesInt);
        const fechaCheckInFormateada = formatDate(checkInDate);
        const fechaCheckOutFormateada = formatDate(checkOutDate);
        const valorFormateado = formatCurrency(data.valorRestante, data.moneda) + ' ' + data.moneda;
        const habitacionesInt = parseInt(data.habitaciones, 10);
        const habitacionesTexto = `${habitacionesInt} ${habitacionesInt > 1 ? 'habitaciones' : 'habitación'}`;

        let planDescription = '';
        switch(data.regimen) {
            case 'Solo hotel': planDescription = '<strong>Plan Incluye:</strong> Alojamiento según las noches estipuladas.'; break;
            case 'Hotel y desayuno': planDescription = '<strong>Plan Incluye:</strong> Alojamiento y Desayuno diario.'; break;
            case 'Media Pensión': planDescription = '<strong>Plan Incluye:</strong> Alojamiento, Desayuno y una comida principal.'; break;
            case 'Pensión Completa': planDescription = '<strong>Plan Incluye:</strong> Alojamiento, Desayuno, Almuerzo y Cena.'; break;
            case 'Todo incluido': planDescription = '<strong>Plan Incluye:</strong> Alojamiento, todas las comidas, bebidas y snacks ilimitados.'; break;
        }
        document.getElementById('confirm-nombre-intro').textContent = data.nombre;
        document.getElementById('confirm-destino').textContent = data.destino;
        document.getElementById('confirm-hotel').textContent = data.hotel;
        document.getElementById('confirm-localizador').textContent = data.localizador;
        document.getElementById('confirm-regimen').textContent = data.regimen;
        document.getElementById('confirm-habitaciones').textContent = habitacionesTexto;
        document.getElementById('confirm-nombre').textContent = data.nombre;
        document.getElementById('confirm-documento').textContent = data.documento;
        document.getElementById('confirm-telefono').textContent = data.telefono;
        document.getElementById('confirm-email').textContent = data.email;
        document.getElementById('confirm-direccion').textContent = data.direccion.trim() || 'No especificada';
        document.getElementById('confirm-acompanantes').textContent = data.acompanantes.trim() || 'No especificado';
        document.getElementById('confirm-checkin').textContent = fechaCheckInFormateada;
        document.getElementById('confirm-checkout').textContent = fechaCheckOutFormateada;
        document.getElementById('confirm-noches').textContent = `${nochesInt} ${nochesInt > 1 ? 'noches' : 'noche'}`;
        document.getElementById('confirm-observaciones').textContent = data.observaciones.trim() || 'Ninguna';
        document.getElementById('confirm-plan-incluye').innerHTML = planDescription;
        document.getElementById('confirm-valor-restante').textContent = valorFormateado;
        
        // --- COMENTARIOS / REQUERIMIENTOS ---
        const comentariosWrapper = document.getElementById('confirm-comentarios-wrapper');
        const comentariosText = data.comentarios.trim();
        if (comentariosText) {
            document.getElementById('confirm-comentarios').textContent = comentariosText;
            comentariosWrapper.style.display = 'flex';
        } else {
            comentariosWrapper.style.display = 'none';
        }
        
        // --- WHATSAPP NUEVO ---
        const wppNumber = VAM_CONFIG.CONFIRMATION_WPP;
        const msgVuelos = encodeURIComponent(`Hola, estoy interesado en cotizar tiquetes aéreos para mi reserva a ${data.destino}. Titular: ${data.nombre}`);
        const msgTours = encodeURIComponent(`Hola, me gustaría información sobre tours y actividades para mi reserva en ${data.hotel}. Titular: ${data.nombre}`);
        const msgTraslados = encodeURIComponent(`Hola, necesito cotizar los traslados privados para mi reserva en ${data.hotel}. Titular: ${data.nombre}`);
        
        document.getElementById('banner-vuelos').href = `https://wa.me/${wppNumber}?text=${msgVuelos}`;
        document.getElementById('banner-tours').href = `https://wa.me/${wppNumber}?text=${msgTours}`;
        document.getElementById('banner-traslados').href = `https://wa.me/${wppNumber}?text=${msgTraslados}`;
        
        // WhatsApp Footer
        document.getElementById('footer-wpp-link').href = `https://wa.me/${wppNumber}`;

        // Guardar para uso de IMPRIMIBLE
        localStorage.setItem('vam_current_prereserva', JSON.stringify(data));
    }

    // Generar PDF y Enviar
    async function processVoucher() {
        if (!supabaseClient) {
            alert("⚠️ Error: Supabase no conectó correctamente. Revisa la consola.");
        }
        
        toggleLoader(true, "Generando PDF...");
        processBtn.disabled = true;

        try {
            const elementToPrint = document.getElementById('voucher-to-print');
            const canvas = await html2canvas(elementToPrint, { scale: 2, useCORS: false, logging: false, ignoreElements: (el) => el.src && typeof el.src === 'string' && el.src.includes('bold.co') });
            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const pdf = new window.jspdf.jsPDF({
                orientation: 'p',
                unit: 'px',
                format: [imgWidth, imgHeight]
            });

            pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
            
            const scaleFactor = imgWidth / elementToPrint.offsetWidth;
            addLinkToPDF(pdf, 'banner-vuelos', elementToPrint, scaleFactor);
            addLinkToPDF(pdf, 'banner-tours', elementToPrint, scaleFactor);
            addLinkToPDF(pdf, 'banner-traslados', elementToPrint, scaleFactor);
            addLinkToPDF(pdf, 'footer-wpp-link', elementToPrint, scaleFactor);
            
            const nombreCliente = document.getElementById('nombre-completo').value;
            const localFileName = `Comprobante_${nombreCliente.replace(/ /g, '_')}.pdf`;
            
            // 1. Guardar PDF Localmente
            pdf.save(localFileName);
            
            // 2. Subir a Supabase y Enviar Correo
            if (supabaseClient) {
                const pdfBlob = pdf.output('blob');
                const fileName = `comprobantes/Comprobante_${nombreCliente.replace(/ /g, '_')}_${Date.now()}.pdf`;
                
                toggleLoader(true, "Subiendo archivo a la nube...");
                
                // Subir a Supabase Storage (bucket 'comprobantes')
                const { data, error: uploadError } = await supabaseClient.storage
                    .from('comprobantes')
                    .upload(fileName, pdfBlob, {
                        contentType: 'application/pdf',
                        upsert: true
                    });
                
                if (uploadError) throw uploadError;

                // Obtener URL pública
                const { data: linkData } = supabaseClient.storage
                    .from('comprobantes')
                    .getPublicUrl(fileName);
                
                const downloadURL = linkData.publicUrl;
                
                toggleLoader(true, "Enviando correo al cliente...");
                
                // Envío de correo con EmailJS
                const templateParams = {
                    nombre_cliente: nombreCliente,
                    nombre_hotel: document.getElementById('hotel').value,
                    to_email: document.getElementById('email').value,
                    download_link: downloadURL
                };
                
                await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
                alert("¡ÉXITO TOTAL!\n\n1. PDF descargado.\n2. Archivo guardado en la nube.\n3. Correo enviado.");
            } else {
                alert("¡PDF DESCARGADO!\n\nNota: No se envió el correo porque Supabase no respondió.");
            }

        } catch (error) {
            console.error("Error en el proceso:", error);
            if (window.location.protocol === 'file:') {
                alert("Aviso Local: Los navegadores bloquean la creación del PDF por seguridad (Tainted Canvas). Usa Guardar como PDF (Ctrl+P / Cmd+P) de tu navegador para descargarlo ahora.");
                window.print();
            } else {
                alert("Hubo un error. Revisa la consola (F12) para más detalles.");
            }
        } finally {
            toggleLoader(false);
            processBtn.disabled = false;
        }
    }
    
    // Event Listeners
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        populateVoucher();
        formTitleSection.style.display = 'none';
        formSection.style.display = 'none';
        confirmationSection.style.display = 'block';
        window.scrollTo(0, 0);
    });

    processBtn.addEventListener('click', processVoucher);

    newVoucherBtn.addEventListener('click', (e) => {
        e.preventDefault();
        confirmationSection.style.display = 'none';
        formTitleSection.style.display = 'block';
        formSection.style.display = 'block';
        form.reset();
        document.getElementById('fecha-viaje').min = new Date().toISOString().split("T")[0];
        window.scrollTo(0, 0);
    });

    document.getElementById('valor-restante').addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
    document.getElementById('fecha-viaje').min = new Date().toISOString().split("T")[0];
    initAutocomplete();
});

// Función de Mapas (Global)
function initAutocomplete() {
    const destinoInput = document.getElementById('destino');
    const hotelInput = document.getElementById('hotel');
    
    let hotelAutocomplete = null;
    
    if (typeof initCustomAutocomplete !== 'undefined') {
        // Inicializar Destino (Ciudades)
        initCustomAutocomplete(destinoInput, {
            onSelect: (place) => {
                // Cuando se selecciona una ciudad, se sesgan los resultados de los hoteles a esa coordenada
                if (place.lat && place.lon && hotelAutocomplete) {
                    hotelAutocomplete.setBias({ lat: place.lat, lon: place.lon });
                }
            }
        });

        // Inicializar Hotel (Establecimientos)
        hotelAutocomplete = initCustomAutocomplete(hotelInput);
    }
}
