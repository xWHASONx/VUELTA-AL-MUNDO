/* ==========================================
   PRE-RESERVA - VUELTA AL MUNDO TOURS (conectado al Hub y a la API PHP en Hostinger)
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {

    // Si no hay usuario logueado, redirigir al hub
    let currentUser = localStorage.getItem('vam_user');
    if (!currentUser || !VAM_CONFIG.ADVISORS[currentUser]) {
        localStorage.removeItem('vam_user');
        window.location.href = 'hub.html';
        return;
    }

    // Constantes de esta herramienta
    const FILE_PREFIX = 'PreReserva';
    const LINK_IDS = ['banner-vuelos', 'banner-tours', 'banner-traslados', 'footer-wpp-link'];
    let lastVoucherData = {};

    // --------------------------------------------------------
    // DOCUMENTACIÓN ADJUNTA (tiquetes, vouchers, seguros...)
    // Se suben al servidor al momento de adjuntarlos, agrupados por un código
    // de grupo que luego se enlaza con la pre-reserva al generar el comprobante.
    // --------------------------------------------------------
    const MAX_DOCS = 10;
    const escHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const nuevoGrupo = () => 'pr-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    let docsGrupo = nuevoGrupo();
    let documentos = [];       // subidos: {id, titulo, nombre, mime, tamano, token, url}
    let docsPendientes = 0;    // subidas en curso
    const docsZone = document.getElementById('docs-zone');
    const docsInput = document.getElementById('docs-input');
    const docsList = document.getElementById('docs-list');
    const docsStatus = document.getElementById('docs-status');
    const docIcono = (mime, nombre) => /pdf/.test(mime) ? '📄' : /^image\//.test(mime) ? '🖼️' : /word|msword/.test(mime) || /\.docx?$/i.test(nombre || '') ? '📝' : /excel|sheet/.test(mime) || /\.xlsx?$/i.test(nombre || '') ? '📊' : '📎';
    const tamanoTxt = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
    const tituloDesdeNombre = n => (n || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120);
    const docsEstado = (t, error) => { docsStatus.hidden = !t; docsStatus.textContent = t || ''; docsStatus.style.color = error ? '#c0392b' : '#1a4999'; };

    function pintarDocumentos() {
        docsList.querySelectorAll('.doc-item[data-id]').forEach(el => el.remove());
        documentos.forEach(d => {
            const el = document.createElement('div');
            el.className = 'doc-item'; el.dataset.id = d.id;
            el.innerHTML = `<div class="doc-ico">${docIcono(d.mime, d.nombre)}</div>
                <div class="doc-main"><input class="doc-titulo" value="${escHtml(d.titulo)}" maxlength="120" placeholder="Título que verá el cliente (ej: Tiquetes aéreos)"><div class="doc-meta">${escHtml(d.nombre)} · ${tamanoTxt(d.tamano)} · ✅ subido</div></div>
                <div class="doc-acciones"><a href="${escHtml(d.url)}" target="_blank" rel="noopener">Ver</a><button type="button" class="quitar">Quitar</button></div>`;
            const inp = el.querySelector('.doc-titulo');
            inp.addEventListener('change', async () => {
                const t = inp.value.trim() || tituloDesdeNombre(d.nombre); inp.value = t;
                try { await VAM_API.archivos.renombrar(d.id, t); d.titulo = t; } catch (e) { alert('No se pudo renombrar: ' + e.message); }
            });
            el.querySelector('.quitar').addEventListener('click', async () => {
                if (!confirm(`¿Quitar "${d.titulo}"?`)) return;
                try { await VAM_API.archivos.borrar(d.id); } catch (e) { alert('No se pudo quitar: ' + e.message); return; }
                documentos = documentos.filter(x => x.id !== d.id); pintarDocumentos();
            });
            docsList.appendChild(el);
        });
        docsEstado(documentos.length ? `${documentos.length} de ${MAX_DOCS} documentos adjuntos.` : '');
    }

    async function subirArchivos(files) {
        const lista = Array.from(files || []);
        if (!lista.length) return;
        if (!(await VAM_API.ping())) { docsEstado('Sin conexión con el servidor: no se pueden adjuntar documentos ahora.', true); return; }
        if (documentos.length + docsPendientes + lista.length > MAX_DOCS) { alert(`Máximo ${MAX_DOCS} documentos por pre-reserva.`); return; }
        for (const file of lista) {
            if (file.size > 15 * 1024 * 1024) { alert(`"${file.name}" pesa más de 15 MB. Comprímelo o divídelo.`); continue; }
            const fila = document.createElement('div');
            fila.className = 'doc-item';
            fila.innerHTML = `<div class="doc-ico">${docIcono(file.type, file.name)}</div><div class="doc-main"><b style="font-size:14px">${escHtml(tituloDesdeNombre(file.name))}</b><div class="doc-meta">${escHtml(file.name)} · ${tamanoTxt(file.size)} · subiendo…</div><div class="doc-barra"><i></i></div></div><div></div>`;
            docsList.appendChild(fila);
            docsPendientes++;
            try {
                const d = await VAM_API.archivos.subir({ asesorId: currentUser, grupo: docsGrupo, titulo: tituloDesdeNombre(file.name), file }, p => { fila.querySelector('.doc-barra i').style.width = p + '%'; });
                documentos.push(d); fila.remove(); pintarDocumentos();
            } catch (e) {
                fila.querySelector('.doc-meta').textContent = '⚠️ ' + e.message; fila.querySelector('.doc-meta').classList.add('error');
                fila.querySelector('.doc-barra').remove();
                const q = document.createElement('button'); q.type = 'button'; q.className = 'quitar'; q.textContent = 'Quitar'; q.addEventListener('click', () => fila.remove());
                fila.lastElementChild.className = 'doc-acciones'; fila.lastElementChild.appendChild(q);
            } finally { docsPendientes--; }
        }
    }
    document.getElementById('docs-pick').addEventListener('click', () => docsInput.click());
    docsInput.addEventListener('change', () => { subirArchivos(docsInput.files); docsInput.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => docsZone.addEventListener(ev, e => { e.preventDefault(); docsZone.classList.add('arrastrando'); }));
    ['dragleave', 'drop'].forEach(ev => docsZone.addEventListener(ev, e => { e.preventDefault(); docsZone.classList.remove('arrastrando'); }));
    docsZone.addEventListener('drop', e => subirArchivos(e.dataTransfer.files));
    VAM_API.ping().then(ok => { if (!ok) { docsZone.classList.add('sin-api'); docsEstado('Sin conexión con el servidor: los adjuntos no están disponibles en modo local.', true); } });
    function reiniciarDocumentos() { docsGrupo = nuevoGrupo(); documentos = []; docsList.innerHTML = ''; docsEstado(''); }

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
            grupo: docsGrupo,
            documentos: documentos.map(d => ({ id: d.id, titulo: d.titulo, nombre: d.nombre, mime: d.mime, tamano: d.tamano, url: d.url })),
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
        document.getElementById('confirm-politicas').innerHTML = VAM_LEGAL.resumen;
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
        
        // --- DOCUMENTOS ADJUNTOS (botón por documento; también son enlaces en el PDF) ---
        const docsWrapper = document.getElementById('confirm-documentos-wrapper');
        const docsCont = document.getElementById('confirm-documentos');
        docsCont.innerHTML = data.documentos.map((d, i) => `<a class="doc-btn" id="doc-link-${i}" href="${escHtml(d.url)}" target="_blank" rel="noopener">${docIcono(d.mime, d.nombre)} Ver ${escHtml(d.titulo)}</a>`).join('');
        docsWrapper.style.display = data.documentos.length ? 'block' : 'none';

        // --- WHATSAPP NUEVO ---
        const wppNumber = VAM_CONFIG.CONFIRMATION_WPP;
        const msgVuelos = (`Hola, estoy interesado en cotizar tiquetes aéreos para mi reserva a ${data.destino}. Titular: ${data.nombre}`);
        const msgTours = (`Hola, me gustaría información sobre tours y actividades para mi reserva en ${data.hotel}. Titular: ${data.nombre}`);
        const msgTraslados = (`Hola, necesito cotizar los traslados privados para mi reserva en ${data.hotel}. Titular: ${data.nombre}`);
        
        document.getElementById('banner-vuelos').href = VAM_WA(wppNumber, msgVuelos);
        document.getElementById('banner-tours').href = VAM_WA(wppNumber, msgTours);
        document.getElementById('banner-traslados').href = VAM_WA(wppNumber, msgTraslados);
        
        // WhatsApp Footer
        document.getElementById('footer-wpp-link').href = VAM_WA(wppNumber);

        // Guardar para uso de IMPRIMIBLE y para el registro en Firebase
        lastVoucherData = data;
        localStorage.setItem('vam_current_prereserva', JSON.stringify(data));
    }

    // Generar PDF y Enviar
    async function buildPdf() {
        const elementToPrint = document.getElementById('voucher-to-print');
        const canvas = await html2canvas(elementToPrint, { scale: 2, useCORS: true, logging: false });
        const pdf = new window.jspdf.jsPDF({ orientation: 'p', unit: 'px', format: [canvas.width, canvas.height] });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, canvas.width, canvas.height);
        const scaleFactor = canvas.width / elementToPrint.offsetWidth;
        const docIds = Array.from(document.querySelectorAll('#confirm-documentos .doc-btn')).map(a => a.id);
        [...LINK_IDS, ...docIds].forEach(id => addLinkToPDF(pdf, id, elementToPrint, scaleFactor));
        return pdf;
    }
    const pdfFileName = () => `${FILE_PREFIX}_VAM_${document.getElementById('nombre-completo').value.replace(/ /g, '_')}.pdf`;

    async function processVoucher() {
        if (docsPendientes > 0) { alert('Espera a que terminen de subir los documentos.'); return; }
        toggleLoader(true, "Generando PDF...");
        processBtn.disabled = true;
        try {
            const pdf = await buildPdf();
            pdf.save(pdfFileName());
            // Registro en la base de datos del servidor (si la API responde)
            if (await VAM_API.ping()) {
                toggleLoader(true, "Guardando registro...");
                const fueEdicion = !!currentEditId;
                const nuevoId = await guardarRegistro(true);
                const btnConf = document.getElementById('confirmar-btn'); if (btnConf && nuevoId) { btnConf.style.display = ''; btnConf.onclick = () => window.location.href = 'confirmador.html?pre=' + nuevoId; }
                alert("¡Listo!\n\n1. PDF descargado.\n2. Pre-reserva " + (fueEdicion ? "actualizada" : "registrada") + " en el panel (#" + nuevoId + ").");
            } else {
                alert("¡PDF descargado!\n\nNota: sin conexión con el servidor, el registro no se guardó en la base de datos.");
            }
        } catch (error) {
            console.error("Error en el proceso:", error);
            if (window.location.protocol === 'file:') {
                alert("Aviso Local: el navegador bloquea la creación del PDF (Tainted Canvas). Usa Guardar como PDF (Ctrl+P / Cmd+P).");
                window.print();
            } else {
                alert("Hubo un error: " + error.message);
            }
        } finally {
            toggleLoader(false);
            processBtn.disabled = false;
        }
    }

    async function emailVoucher() {
        const to = (document.getElementById('email').value || '').trim();
        if (!to) { alert('El comprobante no tiene correo del cliente.'); return; }
        if (!(await VAM_API.ping())) { alert('El envío de correo requiere la conexión con el servidor (API). Descarga el PDF y envíalo manualmente.'); return; }
        toggleLoader(true, "Enviando correo...");
        try {
            const pdf = await buildPdf();
            const b64 = pdf.output('datauristring').split(',')[1];
            const nombre = document.getElementById('nombre-completo').value;
            await VAM_API.correo.enviar({
                asesorId: currentUser, asesorNombre: VAM_CONFIG.ADVISORS[currentUser].name, para: to, nombreCliente: nombre,
                asunto: `Comprobante de pre-reserva - ${document.getElementById('hotel').value} - Vuelta al Mundo Tours`,
                mensaje: `Adjunto encontrarás el comprobante de tu pre-reserva en ${document.getElementById('hotel').value}.${(lastVoucherData.documentos || []).length ? ' Más abajo tienes los botones para abrir tus documentos de viaje.' : ''}\nRevisa que todos los datos estén correctos. Cualquier duda, escríbeme por WhatsApp al ${VAM_CONFIG.WPP_DISPLAY}.`,
                enlaces: (lastVoucherData.documentos || []).map(d => ({ titulo: d.titulo, url: d.url })),
                tipo: 'prereserva', referencia: document.getElementById('localizador').value || '', pdfBase64: b64, pdfNombre: pdfFileName()
            });
            alert(`✅ Comprobante enviado a ${to}\n\nUna copia queda en la Bandeja de entrada de ${VAM_CONFIG.COMPANY.salesEmail} (webmail de Hostinger).`);
        } catch (error) {
            console.error(error);
            alert('No se pudo enviar el correo: ' + error.message);
        } finally { toggleLoader(false); }
    }
    document.getElementById('email-voucher-btn').addEventListener('click', emailVoucher);
    
    // --------------------------------------------------------
    // PANEL DE REGISTROS (ver, editar, duplicar, eliminar)
    // --------------------------------------------------------
    let currentEditId = null;          // id del registro que se está editando (null = nuevo)
    const editBanner = document.getElementById('edit-banner');
    const backBtn = document.getElementById('btn-back-dashboard');
    const panel = VAM_REGISTROS.montar({
        titulo: 'Mis Pre-Reservas', nuevoLabel: '+ Nueva Pre-Reserva', store: VAM_API.prereservas, asesorId: currentUser,
        enlaces: '<a href="confirmador.html" class="action-button secondary">✅ Confirmador</a><a href="cotizador.html" class="action-button secondary">🌍 Cotizador</a>',
        tarjeta: (row) => `<span class="quote-pill naranja">Pre-reserva</span>`,
        alNuevo: () => { limpiarFormulario(); mostrarFormulario(); },
        alAbrir: (row) => abrirRegistro(row.id, false),
        alDuplicar: (row) => abrirRegistro(row.id, true)
    });
    function mostrarFormulario() {
        if (panel) panel.ocultar();
        confirmationSection.style.display = 'none';
        formTitleSection.style.display = 'block'; formSection.style.display = 'block';
        window.scrollTo(0, 0);
    }
    function mostrarPanel() {
        formTitleSection.style.display = 'none'; formSection.style.display = 'none'; confirmationSection.style.display = 'none';
        panel.mostrar(); window.scrollTo(0, 0);
    }
    function limpiarFormulario() {
        form.reset(); reiniciarDocumentos(); currentEditId = null;
        editBanner.style.display = 'none';
        document.getElementById('fecha-viaje').min = new Date().toISOString().split("T")[0];
    }
    function llenarFormulario(d) {
        const set = (elId, v) => { const el = document.getElementById(elId); if (el && v !== undefined && v !== null) el.value = v; };
        set('destino', d.destino); set('hotel', d.hotel); set('nombre-completo', d.nombre); set('documento', d.documento); set('telefono', d.telefono); set('email', d.email); set('direccion', d.direccion);
        set('fecha-viaje', d.fechaInput); set('cantidad-noches', d.noches); set('cantidad-habitaciones', d.habitaciones); set('localizador', d.localizador === 'Pendiente' ? '' : d.localizador); set('regimen', d.regimen); set('moneda', d.moneda);
        set('acompanantes', d.acompanantes); set('observaciones', d.observaciones); set('comentarios', d.comentarios); set('valor-restante', d.valorRestante);
        
    }
    async function abrirRegistro(id, duplicar) {
        toggleLoader(true, 'Cargando registro...');
        try {
            const r = await VAM_API.prereservas.get(id);
            const d = r.datos || {};
            limpiarFormulario();
            document.getElementById('fecha-viaje').min = '';   // al editar se permiten fechas ya pasadas
            llenarFormulario(d);
            if (d.grupo && !duplicar) {
                docsGrupo = d.grupo;
                try { documentos = await VAM_API.archivos.listar(d.grupo); } catch (e) { documentos = []; }
                pintarDocumentos();
            }
            currentEditId = duplicar ? null : r.id;
            editBanner.style.display = 'block';
            editBanner.innerHTML = duplicar ? `📄 <b>Duplicando</b> el registro de ${escHtml(d.nombre || '')}. Se guardará como uno nuevo.` : `✏️ <b>Editando</b> el registro #${r.id} de ${escHtml(d.nombre || '')}. Al generar y guardar se actualiza el mismo registro.`;
            mostrarFormulario();
        } catch (e) { alert('No se pudo abrir el registro: ' + e.message); }
        finally { toggleLoader(false); }
    }
    // Guarda (crea o actualiza) el registro del comprobante que está en pantalla
    async function guardarRegistro(silencioso) {
        if (!(await VAM_API.ping())) { if (!silencioso) alert('Sin conexión con el servidor: el registro no se guardó.'); return null; }
        const datos = { ...lastVoucherData, asesorNombre: VAM_CONFIG.ADVISORS[currentUser].name };
        if (currentEditId) { await VAM_API.prereservas.update(currentEditId, datos, lastVoucherData.grupo); }
        else { currentEditId = await VAM_API.prereservas.create(currentUser, datos, lastVoucherData.grupo); }
        return currentEditId;
    }
    document.getElementById('save-voucher-btn').addEventListener('click', async () => {
        toggleLoader(true, 'Guardando...');
        try { const id = await guardarRegistro(false); if (id) alert('✅ Registro guardado en el panel (#' + id + ').'); }
        catch (e) { alert('No se pudo guardar: ' + e.message); }
        finally { toggleLoader(false); }
    });
    backBtn.style.display = '';
    backBtn.addEventListener('click', () => { if (confirm('¿Volver al panel? Los cambios no guardados se perderán.')) mostrarPanel(); });
    // Al entrar: si hay API se muestra el panel; sin API, el formulario directo
    VAM_API.ping().then(ok => { const pre = new URLSearchParams(location.search).get('pre'); if (ok && panel && !pre) mostrarPanel(); });

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

    newVoucherBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        limpiarFormulario();
        if (await VAM_API.ping()) { mostrarPanel(); return; }
        confirmationSection.style.display = 'none';
        formTitleSection.style.display = 'block';
        formSection.style.display = 'block';
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
