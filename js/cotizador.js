/* ==========================================
   COTIZADOR - VUELTA AL MUNDO TOURS
   Precios por persona, sin calculadora. Dos opciones de compra manuales.
   Guarda en Firebase (Firestore) si está configurado; si no, en el navegador.
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {

    // --- CAPA DE DATOS ---
    // API PHP + MySQL en Hostinger (js/api.js). Si no responde, modo local en el navegador.
    const LOCAL_DB_KEY = 'vam_quotes_db';
    const getLocalDB = () => JSON.parse(localStorage.getItem(LOCAL_DB_KEY) || '[]');
    const saveLocalDB = (d) => localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(d));
    const localStore = {
        async list(asesorId) { return getLocalDB().filter(q => q.asesorId === asesorId).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); },
        async get(id) { return getLocalDB().find(q => q.id === id) || null; },
        async create(doc) { const items = getLocalDB(); const id = 'local_' + Date.now(); items.push({ ...doc, id }); saveLocalDB(items); return id; },
        async update(id, patch) { const items = getLocalDB(); const i = items.findIndex(q => q.id === id); if (i >= 0) Object.assign(items[i], patch); saveLocalDB(items); },
        async remove(id) { saveLocalDB(getLocalDB().filter(q => q.id !== id)); }
    };
    let store = localStore;
    let modoLocal = true;
    async function initStore() {
        const ok = await VAM_API.ping();
        if (ok) { store = VAM_API.cotizaciones; modoLocal = false; }
        console.info(modoLocal ? 'Cotizador: API no disponible, modo local.' : 'Cotizador: conectado a la API (Hostinger).');
        const b = document.getElementById('modo-banner');
        if (b) b.style.display = modoLocal ? 'block' : 'none';
    }

    // --- SESIÓN ---
    const currentUser = localStorage.getItem('vam_user');
    if (!currentUser || !VAM_CONFIG.ADVISORS[currentUser]) {
        localStorage.removeItem('vam_user');
        window.location.href = 'index.html';
        return;
    }
    const ADVISORS = VAM_CONFIG.ADVISORS;
    const CORPORATE_WPP = VAM_CONFIG.CORPORATE_WPP;
    const COMPANY = VAM_CONFIG.COMPANY;

    // --- ESTADO ---
    let pastedImages = {};
    let hotelCounter = 0;
    let currentEditQuoteId = null;
    let currentPlan = null; // plan precargado en uso (o null)
    let vuelosDetalles = {}; // itinerarios elegidos en Google Flights por opción (1, 2)
    let vuelosReferencia = null;

    const REGIMEN_TEMPLATES = {
        'todo_incluido': 'Todo incluido: desayunos, almuerzos, cenas, snacks y bebidas.',
        'pension_completa': 'Pensión completa: desayuno, almuerzo y cena.',
        'media_pension': 'Media pensión: desayuno y cena.',
        'desayuno': 'Alojamiento y desayuno.',
        'solo_hotel': 'Solo alojamiento.'
    };
    const REGIMEN_LABEL = { 'todo_incluido': 'Todo incluido', 'pension_completa': 'Pensión completa', 'media_pension': 'Media pensión', 'desayuno': 'Hotel y desayuno', 'solo_hotel': 'Solo hotel' };

    // --- DOM ---
    const dashboardSection = document.getElementById('dashboard-section');
    const formTitleSection = document.getElementById('form-title-section');
    const formSection = document.getElementById('form-section');
    const confirmationSection = document.getElementById('confirmation-section');
    const form = document.getElementById('pre-reserva-form');
    const dynamicComponentsContainer = document.getElementById('dynamic-components-container');
    const confirmationComponentsContainer = document.getElementById('confirmation-components-container');
    const loaderOverlay = document.getElementById('loader-overlay');
    const planBanner = document.getElementById('plan-banner');

    function initSelects() {
        const adultsSelect = document.getElementById('adultos');
        adultsSelect.innerHTML = '';
        for (let i = 1; i <= 20; i++) { const o = new Option(i, i); if (i === 2) o.selected = true; adultsSelect.add(o); }
        const ninosSelect = document.getElementById('ninos');
        ninosSelect.innerHTML = '';
        for (let i = 0; i <= 10; i++) ninosSelect.add(new Option(i === 0 ? '0' : (i === 1 ? '1 niño' : `${i} niños`), i));
    }
    initSelects();

    document.querySelector('.wrapper').style.display = 'block';
    document.getElementById('header-user-name').textContent = `Hola, ${ADVISORS[currentUser].name.split(' ')[0]}`;
    document.getElementById('btn-logout').addEventListener('click', VAM_LOGOUT);

    // --- UTILIDADES ---
    const money = (v, c = 'COP') => VAM_MONEY(v, c);
    const isZero = v => !(parseFloat(String(v).replace(/[^0-9.]/g, '')) > 0);
    const priceOrIncluded = (v, c = 'COP', suffix = ' <small>/ persona</small>') => isZero(v) ? 'Incluido en el plan' : money(v, c) + suffix;
    function formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    function generateQuoteNumber() {
        const n = new Date();
        return `VAM-${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}-${String(n.getHours()).padStart(2, '0')}${String(n.getMinutes()).padStart(2, '0')}`;
    }
    const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    const selText = id => { const el = document.getElementById(id); return el ? el.options[el.selectedIndex].text : ''; };
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const nl2br = s => esc(s).replace(/\n/g, '<br>');

    // --- DASHBOARD ---
    let dashboardListenersBound = false;
    let allDocs = [];
    async function loadDashboard() {
        dashboardSection.style.display = 'block';
        formTitleSection.style.display = 'none';
        formSection.style.display = 'none';
        confirmationSection.style.display = 'none';
        const quotesList = document.getElementById('quotes-list');
        quotesList.innerHTML = '<p style="text-align:center;">Cargando cotizaciones...</p>';
        try {
            allDocs = await store.list(currentUser);
            if (!dashboardListenersBound) {
                document.getElementById('search-quote').addEventListener('input', filterDashboard);
                document.getElementById('filter-status').addEventListener('change', filterDashboard);
                dashboardListenersBound = true;
            }
            filterDashboard();
        } catch (error) {
            console.error('Error cargando dashboard: ', error);
            quotesList.innerHTML = '<p style="color:#ff6b6b; text-align:center;">Error al cargar datos.</p>';
        }
    }
    function filterDashboard() {
        const term = document.getElementById('search-quote').value.toLowerCase();
        const status = document.getElementById('filter-status').value;
        renderQuotes(allDocs.filter(d => {
            const matchSearch = (d.numero || '').toLowerCase().includes(term) || (d.cliente || '').toLowerCase().includes(term);
            const matchStatus = status === 'Todos' || (d.estado || 'Pendiente') === status;
            return matchSearch && matchStatus;
        }));
    }
    function renderQuotes(docs) {
        const quotesList = document.getElementById('quotes-list');
        quotesList.innerHTML = '';
        if (docs.length === 0) { quotesList.innerHTML = '<p style="grid-column: 1 / -1; text-align:center;">No hay cotizaciones que coincidan.</p>'; return; }
        const statusColors = { 'Pendiente': '#FF7F00', 'Vendida': '#27ae60', 'Rechazada': '#c0392b' };
        docs.forEach(data => {
            const date = data.timestamp ? new Date(data.timestamp).toLocaleDateString('es-CO') : 'Fecha desconocida';
            const currentStatus = data.estado || 'Pendiente';
            const card = document.createElement('div');
            card.className = 'quote-card';
            card.innerHTML = `
                <span class="quote-badge">${esc(data.numero)}</span>
                <h3>${esc(data.cliente)}</h3>
                <p>${esc(data.destinosResumen || 'Cotización')}${data.plan ? ' · <em>Plan precargado</em>' : ''}</p>
                <span class="quote-date">Creada: ${date}</span>
                <select class="status-select" style="background-color: ${statusColors[currentStatus]};">
                    <option value="Pendiente" ${currentStatus === 'Pendiente' ? 'selected' : ''}>🟡 Pendiente</option>
                    <option value="Vendida" ${currentStatus === 'Vendida' ? 'selected' : ''}>🟢 Vendida</option>
                    <option value="Rechazada" ${currentStatus === 'Rechazada' ? 'selected' : ''}>🔴 Rechazada</option>
                </select>
                <div class="quote-card-actions">
                    <button class="btn-duplicate">📄 Duplicar</button>
                    <button class="btn-delete">🗑️ Eliminar</button>
                </div>`;
            card.querySelector('.status-select').addEventListener('change', async (e) => {
                e.stopPropagation();
                e.target.style.backgroundColor = statusColors[e.target.value];
                try { await store.update(data.id, { estado: e.target.value }); data.estado = e.target.value; } catch (err) { alert('No se pudo actualizar el estado: ' + err.message); }
            });
            card.querySelector('.status-select').addEventListener('click', e => e.stopPropagation());
            card.querySelector('.btn-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm('⚠️ ¿Eliminar esta cotización? Esta acción es irreversible.')) {
                    try { await store.remove(data.id); allDocs = allDocs.filter(d => d.id !== data.id); card.remove(); } catch (err) { alert('Error al eliminar la cotización: ' + err.message); }
                }
            });
            card.querySelector('.btn-duplicate').addEventListener('click', async (e) => { e.stopPropagation(); duplicateQuote(await fullDoc(data)); });
            card.addEventListener('click', async () => { const full = await fullDoc(data); openQuoteForEdit(full.id, full); });
            quotesList.appendChild(card);
        });
    }

    // En la API la lista viene sin formulario; se pide completo al abrir
    async function fullDoc(data) {
        if (data.formData) return data;
        try { return await store.get(data.id); } catch (err) { alert('No se pudo cargar la cotización: ' + err.message); return data; }
    }

    document.getElementById('btn-create-new').addEventListener('click', () => {
        currentEditQuoteId = null;
        currentPlan = null;
        initializeForm();
        showForm();
    });
    document.getElementById('btn-back-dashboard').addEventListener('click', () => {
        if (confirm('¿Volver al dashboard? Los cambios no guardados se perderán.')) loadDashboard();
    });
    function showForm() {
        dashboardSection.style.display = 'none';
        confirmationSection.style.display = 'none';
        formTitleSection.style.display = 'block';
        formSection.style.display = 'block';
        window.scrollTo(0, 0);
    }

    // --- FORMULARIO ---
    function initializeForm() {
        form.reset();
        pastedImages = {};
        vuelosDetalles = {}; vuelosReferencia = null;
        hotelCounter = 0;
        dynamicComponentsContainer.innerHTML = '';
        document.querySelectorAll('.add-section-btn').forEach(btn => btn.style.display = 'block');
        initSelects();
        document.getElementById('cotizacion-numero').value = generateQuoteNumber();
        document.getElementById('validez-cupos').value = 'Tarifa sujeta a disponibilidad al momento de la reserva.';
        document.getElementById('no-incluye').value = 'Impuestos o cargos que puedan aplicar en el destino, gastos o servicios no especificados en la cotización.';
        planBanner.style.display = 'none';
    }

    const requiredFieldsConfig = {
        'flights': ['ciudad-salida', 'flight-1-airline', 'flight-1-price'],
        'tours': ['tour-1-name', 'tour-1-price'],
        'transfers': ['transfer-1-desc', 'transfer-1-price'],
        'insurance': ['insurance-name', 'insurance-price']
    };

    function addSection(sectionKey) {
        if (sectionKey === 'hotel') {
            hotelCounter++;
            const template = document.getElementById('template-hotel');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = template.innerHTML.replace(/PLACEHOLDER/g, hotelCounter);
            const cloneNode = tempDiv.firstElementChild;
            dynamicComponentsContainer.appendChild(cloneNode);
            const nightsSelect = document.getElementById(`cantidad-noches-${hotelCounter}`);
            for (let i = 1; i <= 30; i++) { const o = new Option(`${i} noche${i > 1 ? 's' : ''}`, i); if (i === 4) o.selected = true; nightsSelect.add(o); }
            const roomsSelect = document.getElementById(`cantidad-habitaciones-${hotelCounter}`);
            for (let i = 1; i <= 10; i++) { const o = new Option(`${i} habitación${i > 1 ? 'es' : ''}`, i); if (i === 1) o.selected = true; roomsSelect.add(o); }
            addEventListenersToSection(cloneNode);
            if (hotelCounter === 1) document.querySelector('.add-section-btn[data-section="hotel"]').style.display = 'none';
            if (hotelCounter > 1) document.querySelector(`#hotel-form-wrapper-${hotelCounter - 1} .add-subsection-btn`).style.display = 'none';
        } else {
            const template = document.getElementById(`template-${sectionKey}`);
            if (!template) return;
            dynamicComponentsContainer.appendChild(template.content.cloneNode(true));
            addEventListenersToSection(dynamicComponentsContainer.querySelector(`#${sectionKey}-form-wrapper`));
            document.querySelector(`.add-section-btn[data-section="${sectionKey}"]`).style.display = 'none';
            updateRequiredFields(sectionKey, true);
            if (sectionKey === 'flights') montarBuscadorVuelos();
        }
    }
    function removeSection(sectionKey) {
        if (sectionKey.startsWith('hotel-')) {
            const num = sectionKey.split('-')[1];
            const wrapper = document.getElementById(`hotel-form-wrapper-${num}`);
            if (wrapper) wrapper.remove();
            if (document.querySelectorAll('.hotel-form-wrapper').length === 0) {
                document.querySelector('.add-section-btn[data-section="hotel"]').style.display = 'block';
                hotelCounter = 0;
            } else {
                Array.from(document.querySelectorAll('.hotel-form-wrapper')).pop().querySelector('.add-subsection-btn').style.display = 'block';
            }
        } else {
            const wrapper = document.getElementById(`${sectionKey}-form-wrapper`);
            if (wrapper) {
                wrapper.remove();
                document.querySelector(`.add-section-btn[data-section="${sectionKey}"]`).style.display = 'block';
                updateRequiredFields(sectionKey, false);
                if (sectionKey === 'flights') { vuelosDetalles = {}; vuelosReferencia = null; if (window.VAM_VUELOS) VAM_VUELOS.desmontar(); }
            }
        }
    }
    function addSubSection(key) {
        if (key === 'hotel') { addSection('hotel'); return; }
        const wrapper = document.getElementById(`${key}-form-wrapper`);
        if (wrapper) {
            wrapper.style.display = 'block';
            document.querySelector(`.add-subsection-btn[data-subsection="${key}"]`).style.display = 'none';
            updateRequiredFields(key, true);
        }
    }
    function removeSubSection(key) {
        const wrapper = document.getElementById(`${key}-form-wrapper`);
        if (wrapper) {
            wrapper.style.display = 'none';
            wrapper.querySelectorAll('input').forEach(i => i.value = '');
            document.querySelector(`.add-subsection-btn[data-subsection="${key}"]`).style.display = 'block';
            updateRequiredFields(key, false);
        }
    }
    function updateRequiredFields(key, isRequired) {
        (requiredFieldsConfig[key] || []).forEach(id => { const el = document.getElementById(id); if (el) el.required = isRequired; });
    }

    form.addEventListener('click', e => {
        const { target } = e;
        const { section, subsection } = target.dataset;
        if (target.matches('.add-section-btn')) addSection(section);
        if (target.matches('.remove-section-btn')) { if (subsection) removeSubSection(subsection); else removeSection(section); }
        if (target.matches('.add-subsection-btn')) addSubSection(section || subsection);
        if (target.matches('.remove-img-btn')) {
            const pasteArea = target.parentElement;
            pasteArea.querySelector('img').src = '';
            pasteArea.querySelector('img').style.display = 'none';
            pasteArea.querySelector('p').style.display = 'block';
            target.style.display = 'none';
            delete pastedImages[pasteArea.dataset.imgId];
        }
    });
    form.addEventListener('input', e => {
        if (e.target.classList.contains('price-input')) e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });

    function setPastedImage(imageId, dataUrl) {
        const pasteArea = document.querySelector(`[data-img-id="${imageId}"]`);
        pastedImages[imageId] = dataUrl;
        if (!pasteArea) return;
        const img = pasteArea.querySelector('img');
        img.src = dataUrl; img.style.display = 'block';
        pasteArea.querySelector('.remove-img-btn').style.display = 'flex';
        pasteArea.querySelector('p').style.display = 'none';
        const loader = pasteArea.querySelector('.loader-spinner'); if (loader) loader.style.display = 'none';
    }
    function compressImage(src, cb) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            const MAX_WIDTH = 1000;
            if (width > MAX_WIDTH) { height = Math.round(height * MAX_WIDTH / width); width = MAX_WIDTH; }
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            cb(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => cb(null);
        img.src = src;
    }
    function handlePaste(e) {
        e.preventDefault();
        const pasteArea = e.currentTarget;
        const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
        if (!item) return;
        pasteArea.querySelector('.loader-spinner').style.display = 'block';
        pasteArea.querySelector('p').style.display = 'none';
        const reader = new FileReader();
        reader.onload = ev => compressImage(ev.target.result, data => data && setPastedImage(pasteArea.dataset.imgId, data));
        reader.readAsDataURL(item.getAsFile());
    }
    function addEventListenersToSection(sectionElement) {
        if (!sectionElement) return;
        sectionElement.querySelectorAll('.paste-area').forEach(area => area.addEventListener('paste', handlePaste));
    }

    // --- BUSCADOR GOOGLE FLIGHTS ---
    function montarBuscadorVuelos() {
        if (!window.VAM_VUELOS || !document.getElementById('vuelos-origen')) return;
        const inst = VAM_VUELOS.montar({
            pax: () => ({ adultos: +val('adultos') || 1, ninos: +val('ninos') || 0 }),
            fechasPorDefecto: () => {
                const h = collectHotels()[0];
                return h ? { ida: h.checkIn || '', regreso: h.checkOut || '' } : {};
            },
            alElegir: ({ opcion, texto, precioPersona, detalles }) => {
                if (opcion === 2) addSubSection('flight-2');
                const a = document.getElementById(`flight-${opcion}-airline`); if (a) a.value = texto;
                const pr = document.getElementById(`flight-${opcion}-price`); if (pr) pr.value = String(Math.round(precioPersona || 0));
                vuelosDetalles[opcion] = detalles;
                vuelosReferencia = inst.referencia();
                // Llevar la vista a la opción llenada y resaltarla para que se note el cambio
                const caja = (a && a.closest('.sub-fieldset')) || null;
                if (caja) {
                    caja.classList.remove('campo-lleno'); void caja.offsetWidth; caja.classList.add('campo-lleno');
                    setTimeout(() => { try { caja.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }, 350);
                }
            },
            alQuitar: (opcion) => {
                delete vuelosDetalles[opcion];
                vuelosReferencia = null;
                ['airline', 'price', 'price-child'].forEach(k => { const el = document.getElementById(`flight-${opcion}-${k}`); if (el) el.value = ''; });
            },
            aviso: (t, tipo) => { const b = planBanner; b.style.display = 'block'; b.innerHTML = (tipo === 'error' ? '⚠️ ' : '✈️ ') + esc(t); }
        });
        if (Object.keys(vuelosDetalles).length) inst.restaurar(vuelosDetalles, vuelosReferencia);
    }

    // --- PLANES PRECARGADOS ---
    function loadPlanIntoForm(planData) {
        currentEditQuoteId = null;
        currentPlan = planData;
        initializeForm();
        const h = planData.hotel;
        const combo = h.combo ? VAM_PLANES.combos[h.combo] : null;
        const isoPlus = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0]; };

        addSection('hotel');
        document.getElementById('destino-1').value = `${planData.destino}, ${planData.pais}`;
        document.getElementById('moneda-1').value = h.moneda;
        document.getElementById('cantidad-habitaciones-1').value = h.habitaciones;
        document.getElementById('valor-total-1').value = h.precioPorPersona;
        document.getElementById('fecha-viaje-1').value = isoPlus(30);

        if (combo) {
            // Hotel de playa (todo incluido) + hotel de ciudad (desayuno) + tour + traslados incluidos
            document.getElementById('destino-1').value = `${planData.pais} · Playa`;
            document.getElementById('hotel-1').value = h.playa.nombre;
            document.getElementById('regimen-1').value = combo.playaRegimen;
            document.getElementById('cantidad-noches-1').value = combo.playaNoches;
            document.getElementById('incluye-1').value = combo.playaIncluye;
            VAM_PLANES.fotos(h.playa.slug).forEach((src, i) => compressImage(src, data => { if (data) setPastedImage(`hotel-1-foto-${i + 1}`, data); }));

            addSection('hotel');
            document.getElementById('destino-2').value = `${planData.pais} · Ciudad`;
            document.getElementById('hotel-2').value = combo.ciudad.nombre;
            document.getElementById('regimen-2').value = combo.ciudadRegimen;
            document.getElementById('cantidad-noches-2').value = combo.ciudadNoches;
            document.getElementById('cantidad-habitaciones-2').value = h.habitaciones;
            document.getElementById('moneda-2').value = h.moneda;
            document.getElementById('valor-total-2').value = '0';
            document.getElementById('fecha-viaje-2').value = isoPlus(30 + combo.playaNoches);
            document.getElementById('incluye-2').value = combo.ciudadIncluye;
            VAM_PLANES.fotos(combo.ciudad.slug).forEach((src, i) => compressImage(src, data => { if (data) setPastedImage(`hotel-2-foto-${i + 1}`, data); }));

            addSection('tours');
            document.getElementById('tour-1-name').value = combo.tour.nombre;
            document.getElementById('tour-1-desc').value = combo.tour.desc;
            document.getElementById('tour-1-price').value = '0';

            addSection('transfers');
            document.getElementById('transfer-1-desc').value = combo.traslados.desc;
            document.getElementById('transfer-1-price').value = '0';
            if (combo.traslados.foto) compressImage(combo.traslados.foto, data => { if (data) setPastedImage('transfer-main-photo', data); });

            document.getElementById('no-incluye').value = combo.noIncluye;
        } else {
            document.getElementById('hotel-1').value = h.nombre;
            document.getElementById('regimen-1').value = h.regimen;
            document.getElementById('cantidad-noches-1').value = h.noches;
            document.getElementById('incluye-1').value = h.incluye;
            document.getElementById('no-incluye').value = h.noIncluye;
            VAM_PLANES.fotos(planData.slug).forEach((src, i) => compressImage(src, data => { if (data) setPastedImage(`hotel-1-foto-${i + 1}`, data); }));
        }

        document.getElementById('adultos').value = h.adultos;
        document.getElementById('ninos').value = h.ninos;
        document.getElementById('validez-cupos').value = h.validez;
        document.getElementById('opcion1-valor').value = h.precioPorPersona;
        document.getElementById('opcion1-moneda').value = h.moneda;
        document.getElementById('cliente-email').value = '';
        planBanner.style.display = 'block';
        planBanner.innerHTML = `🏨 <strong>Plan precargado:</strong> ${esc(combo ? combo.titulo + ' · ' + h.nombre : h.nombre)} · ${esc(planData.destino)} · ${money(h.precioPorPersona, h.moneda)} por persona. Solo escribe el nombre del cliente, ajusta la fecha si hace falta y genera.`;
        showForm();
        setTimeout(() => document.getElementById('nombre-completo').focus(), 200);
    }
    // Plan precargado creado por el equipo (guardado en la base de datos desde el cotizador)
    async function loadDbPlan(id) {
        loaderOverlay.style.display = 'flex'; document.getElementById('loader-text').textContent = 'Cargando plan...';
        try {
            const p = await VAM_API.planes.get(id);
            openQuoteForEdit(null, { formData: p.form_data || {}, numero: generateQuoteNumber() });
            currentEditQuoteId = null;
            currentPlan = { slug: 'plan-' + p.id, nombre: p.nombre };
            ['nombre-completo', 'documento', 'telefono', 'cliente-email'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            planBanner.style.display = 'block';
            planBanner.innerHTML = `⭐ <strong>Plan precargado:</strong> ${esc(p.nombre)} · ${esc(p.destino)} · ${money(p.precio, p.moneda)} por persona. Creado por ${esc(p.asesor_nombre || 'el equipo')}. Solo escribe el nombre del cliente, ajusta fechas y genera.`;
            setTimeout(() => document.getElementById('nombre-completo').focus(), 200);
        } catch (e) { alert('No se pudo cargar el plan: ' + e.message); loadDashboard(); }
        finally { loaderOverlay.style.display = 'none'; }
    }
    function checkPlanParam() {
        const params = new URLSearchParams(window.location.search);
        const planId = params.get('planId');
        if (planId) { loadDbPlan(planId); history.replaceState({}, '', 'cotizador.html'); return; }
        const slug = params.get('plan');
        if (!slug) { loadDashboard(); return; }
        let planData = null;
        try { planData = JSON.parse(localStorage.getItem('vam_plan_precargado') || 'null'); } catch (e) { }
        if (!planData || planData.slug !== slug) {
            const found = VAM_PLANES.buscar(slug);
            if (found) planData = { destino: found.destino.nombre, pais: found.destino.pais, slug, hotel: found.hotel };
        }
        if (planData) loadPlanIntoForm(planData); else loadDashboard();
        history.replaceState({}, '', 'cotizador.html');
    }
    initStore().then(checkPlanParam);

    // --- GUARDAR COMO PLAN PRECARGADO (compartido con todo el equipo) ---
    function miniatura(dataUrl, cb) {
        if (!dataUrl) return cb(null);
        const img = new Image();
        img.onload = () => { const c = document.createElement('canvas'); const w = 480, hgt = Math.round(img.height * w / img.width); c.width = w; c.height = hgt; c.getContext('2d').drawImage(img, 0, 0, w, hgt); cb(c.toDataURL('image/jpeg', 0.7)); };
        img.onerror = () => cb(null);
        img.src = dataUrl;
    }
    document.getElementById('save-plan-btn').addEventListener('click', async () => {
        if (dynamicComponentsContainer.children.length === 0) { alert('Añade al menos un hotel o servicio antes de guardar el plan.'); return; }
        if (!(await VAM_API.ping())) { alert('Guardar planes requiere conexión con el servidor.'); return; }
        const hoteles = [...document.querySelectorAll('.hotel-form-wrapper')].map(w => val(`hotel-${w.id.match(/\d+/)[0]}`)).filter(Boolean);
        const destinoDef = val('destino-1') || '';
        const nombre = prompt('Nombre del plan (lo verá todo el equipo):', hoteles[0] ? `${hoteles.join(' + ')}` : '');
        if (nombre === null || !nombre.trim()) return;
        const destino = prompt('Destino (para agruparlo en Planes precargados):', destinoDef);
        if (destino === null) return;
        const fd = collectFormData();
        ['nombre-completo', 'documento', 'telefono', 'cliente-email', 'cotizacion-numero'].forEach(k => { delete fd[k]; });
        const servicios = [];
        if (hoteles.length) servicios.push(hoteles.length === 1 ? 'Hotel' : hoteles.length + ' hoteles');
        if (fd['flight-1-airline']) servicios.push('vuelos'); if (fd['tour-1-name']) servicios.push('tours'); if (fd['transfer-1-desc']) servicios.push('traslados'); if (fd['insurance-name']) servicios.push('seguro');
        loaderOverlay.style.display = 'flex'; document.getElementById('loader-text').textContent = 'Guardando plan...';
        miniatura(pastedImages['hotel-1-foto-1'] || pastedImages['main-photo'] || null, async (portada) => {
            try {
                const id = await VAM_API.planes.create({
                    asesorId: currentUser, asesorNombre: VAM_CONFIG.ADVISORS[currentUser].name,
                    nombre: nombre.trim(), destino: destino.trim(), pais: '', resumen: servicios.join(' · '),
                    precio: val('opcion1-valor') || '0', moneda: val('opcion1-moneda') || 'COP', portada, formData: fd
                });
                alert(`⭐ Plan "${nombre.trim()}" guardado (#${id}).\n\nYa aparece en Planes precargados para todos los asesores.`);
            } catch (e) { alert('No se pudo guardar el plan: ' + e.message); }
            finally { loaderOverlay.style.display = 'none'; }
        });
    });

    // --- GUARDAR / CARGAR ---
    function collectFormData() {
        const formData = {};
        form.querySelectorAll('input, select, textarea').forEach(input => {
            const key = input.id || input.name;
            if (!key) return;
            formData[key] = input.type === 'checkbox' ? input.checked : input.value;
        });
        formData.pastedImages = pastedImages;
        formData.vuelosDetalles = vuelosDetalles;
        formData.vuelosReferencia = vuelosReferencia;
        formData.vuelosLogos = window.VAM_VUELOS ? VAM_VUELOS.logos : {};
        return formData;
    }
    async function saveQuote() {
        const destinations = [];
        document.querySelectorAll('.hotel-form-wrapper').forEach(w => destinations.push(val(`destino-${w.id.match(/\d+/)[0]}`)));
        const quoteDoc = {
            asesorId: currentUser,
            cliente: val('nombre-completo'),
            numero: val('cotizacion-numero'),
            destinosResumen: destinations.filter(Boolean).join(', ') || 'Varios',
            plan: currentPlan ? currentPlan.slug : null,
            timestamp: Date.now(),
            estado: 'Pendiente',
            formData: collectFormData()
        };
        const payloadSize = JSON.stringify(quoteDoc).length;
        if (payloadSize > 3500000) {
            alert('⚠️ La cotización tiene demasiadas imágenes o son muy pesadas (' + Math.round(payloadSize / 1000) + 'KB). Elimina una o dos fotos e intenta de nuevo.');
            return false;
        }
        try {
            if (currentEditQuoteId) {
                const { timestamp, estado, ...patch } = quoteDoc;
                await store.update(currentEditQuoteId, patch);
            } else {
                currentEditQuoteId = await store.create(quoteDoc);
            }
            return true;
        } catch (error) {
            console.error('Error guardando cotización:', error);
            alert('Hubo un error guardando la cotización: ' + error.message);
            return false;
        }
    }
    function openQuoteForEdit(id, data) {
        currentEditQuoteId = id;
        currentPlan = data.plan ? { slug: data.plan } : null;
        initializeForm();
        const fd = data.formData || {};
        vuelosDetalles = fd.vuelosDetalles || {};
        vuelosReferencia = fd.vuelosReferencia || null;
        const hotelNums = Object.keys(fd).filter(k => k.startsWith('destino-')).map(k => parseInt(k.split('-')[1])).sort((a, b) => a - b);
        hotelNums.forEach(num => { hotelCounter = num - 1; addSection('hotel'); });
        if (fd['flight-1-airline']) addSection('flights');
        if (fd['flight-2-airline']) addSubSection('flight-2');
        if (window.VAM_VUELOS && fd.vuelosLogos) Object.assign(VAM_VUELOS.logos, fd.vuelosLogos);
        if (fd['tour-1-name']) addSection('tours');
        if (fd['transfer-1-desc']) addSection('transfers');
        if (fd['insurance-name']) addSection('insurance');
        Object.keys(fd).forEach(key => {
            if (key === 'pastedImages') { Object.entries(fd[key] || {}).forEach(([imgId, src]) => setPastedImage(imgId, src)); return; }
            if (key === 'vuelosDetalles' || key === 'vuelosReferencia' || key === 'vuelosLogos') return;
            const el = document.getElementById(key);
            if (el) { if (el.type === 'checkbox') el.checked = fd[key] === true || fd[key] === 'true'; else el.value = fd[key]; }
        });
        document.getElementById('cotizacion-numero').value = data.numero || generateQuoteNumber();
        showForm();
    }
    function duplicateQuote(data) {
        openQuoteForEdit(null, data);
        currentEditQuoteId = null;
        document.getElementById('cotizacion-numero').value = generateQuoteNumber();
    }

    // --- DATOS DEL PLAN (comunes al voucher y al imprimible) ---
    function collectHotels() {
        return Array.from(document.querySelectorAll('.hotel-form-wrapper')).map((w, index) => {
            const n = w.id.match(/\d+/)[0];
            const checkIn = val(`fecha-viaje-${n}`);
            const noches = parseInt(val(`cantidad-noches-${n}`), 10) || 0;
            let checkOut = '';
            if (checkIn) { const d = new Date(checkIn + 'T00:00:00'); if (!isNaN(d)) { d.setDate(d.getDate() + noches); checkOut = d.toISOString().split('T')[0]; } }
            return {
                index: index + 1, destino: val(`destino-${n}`), nombre: val(`hotel-${n}`),
                regimen: REGIMEN_LABEL[val(`regimen-${n}`)] || '', regimenDesc: REGIMEN_TEMPLATES[val(`regimen-${n}`)] || '',
                precio: val(`valor-total-${n}`), moneda: val(`moneda-${n}`),
                checkIn, checkOut, nochesTxt: (noches ? `${noches + 1} días / ${noches} noche${noches > 1 ? 's' : ''}` : selText(`cantidad-noches-${n}`)), habitacionesTxt: selText(`cantidad-habitaciones-${n}`),
                acomodacion: val(`acomodacion-${n}`), incluye: val(`incluye-${n}`),
                fotos: [1, 2, 3].map(i => pastedImages[`hotel-${n}-foto-${i}`]).filter(Boolean)
            };
        });
    }
    function collectFlights() {
        if (!document.getElementById('flights-form-wrapper')) return null;
        const options = [1, 2].map(i => {
            const wrapper = document.getElementById(`flight-${i}-form-wrapper`);
            if (i === 2 && (!wrapper || wrapper.style.display === 'none')) return null;
            if (!val(`flight-${i}-airline`)) return null;
            return { n: i, airline: val(`flight-${i}-airline`), adulto: val(`flight-${i}-price`), nino: val(`flight-${i}-price-child`), itinerario: vuelosDetalles[i] || null };
        }).filter(Boolean);
        return { salida: val('ciudad-salida'), banner: pastedImages['flight-banner-preview'], options };
    }
    function collectSimple() {
        return {
            tour: document.getElementById('tours-form-wrapper') ? { nombre: val('tour-1-name'), precio: val('tour-1-price'), desc: val('tour-1-desc'), foto: pastedImages['tour-main-photo'] } : null,
            traslado: document.getElementById('transfers-form-wrapper') ? { desc: val('transfer-1-desc'), precio: val('transfer-1-price'), foto: pastedImages['transfer-main-photo'] } : null,
            seguro: document.getElementById('insurance-form-wrapper') ? { nombre: val('insurance-name'), cobertura: val('insurance-coverage'), precio: val('insurance-price'), detalle: val('insurance-details') } : null
        };
    }
    function collectOptions() {
        return {
            op1: val('opcion1-valor'), op1m: val('opcion1-moneda'),
            op2: val('opcion2-valor'), op2m: val('opcion2-moneda'),
            noIncluye: val('no-incluye')
        };
    }
    function paxText() {
        const a = parseInt(val('adultos')) || 1, c = parseInt(val('ninos')) || 0;
        return `${a} adulto${a > 1 ? 's' : ''}${c > 0 ? ` y ${c} niño${c > 1 ? 's' : ''}` : ''}`;
    }
    function companyLegalHTML() {
        return `<span><strong>${COMPANY.name}</strong></span><span>NIT ${COMPANY.nit} · RNT ${COMPANY.rnt}</span><span>${COMPANY.address}</span><span>WhatsApp ${VAM_CONFIG.WPP_DISPLAY} · ${COMPANY.email}</span>`;
    }

    // --- VOUCHER ---
    function populateQuote() {
        const advisor = ADVISORS[currentUser];
        const clientName = val('nombre-completo');
        const quoteNumber = val('cotizacion-numero');

        document.getElementById('confirm-intro-text').textContent = `¡Hola, ${clientName.split(' ')[0]}! Preparé esta propuesta para tu próximo viaje.`;
        document.getElementById('confirm-customer-data-box').innerHTML =
            `<p>Para: <strong>${esc(clientName.toUpperCase())}</strong></p><p>Pasajeros: <strong>${paxText()}</strong></p><p>Nº Cotización: <strong>${esc(quoteNumber)}</strong></p><p>Validez: <strong>${esc(val('validez-cupos'))}</strong></p>`;

        document.getElementById('advisor-photo').src = advisor.photoUrl;
        document.getElementById('advisor-name').textContent = advisor.name;
        document.getElementById('advisor-role-label').textContent = `Preparado por tu ${(advisor.role || 'asesor').toLowerCase()} de viajes:`;

        const msgReservar = `¡Hola ${advisor.name}! Quiero reservar según la cotización *${quoteNumber}*.`;
        const msgPregunta = `Hola ${advisor.name}, tengo una pregunta sobre la cotización *${quoteNumber}*.`;
        document.getElementById('advisor-whatsapp-btn').href = VAM_WA(CORPORATE_WPP, msgPregunta);
        document.getElementById('cta-reservar').href = VAM_WA(CORPORATE_WPP, msgReservar);
        document.getElementById('cta-contactar').href = VAM_WA(CORPORATE_WPP, msgPregunta);

        let html = '';
        collectHotels().forEach(h => {
            const gallery = h.fotos.length ? `<div class="photo-gallery">${h.fotos.map(s => `<img src="${s}">`).join('')}</div>` : '';
            html += `
                <div class="quote-option-box">
                    <div class="option-header"><h3>🏨 ${esc(h.destino)}</h3><span class="option-price">${priceOrIncluded(h.precio, h.moneda)}</span></div>
                    <div class="option-body">
                        <h4>${esc(h.nombre)}</h4>
                        ${gallery}
                        <div class="details-grid">
                            <div class="data-item"><div class="data-item-content"><strong>Check-in</strong><p>${formatDate(h.checkIn)}</p></div></div>
                            <div class="data-item"><div class="data-item-content"><strong>Check-out</strong><p>${h.checkOut ? formatDate(h.checkOut) : 'N/A'}</p></div></div>
                            <div class="data-item"><div class="data-item-content"><strong>Noches</strong><p>${esc(h.nochesTxt)}</p></div></div>
                            <div class="data-item"><div class="data-item-content"><strong>Habitaciones</strong><p>${esc(h.habitacionesTxt)}${h.acomodacion ? ' · ' + esc(h.acomodacion) : ''}</p></div></div>
                            <div class="data-item full-width"><div class="data-item-content"><strong>Plan</strong><p>${esc(h.regimenDesc || h.regimen)}</p></div></div>
                            ${h.incluye ? `<div class="data-item full-width"><div class="data-item-content"><strong>Incluye</strong><p>${nl2br(h.incluye)}</p></div></div>` : ''}
                        </div>
                    </div>
                </div>`;
        });

        const fl = collectFlights();
        if (fl) {
            html += `
                <div class="component-section">
                    <h3>✈️ Vuelos sugeridos</h3>
                    ${fl.banner ? `<div class="banner-img"><img src="${fl.banner}"></div>` : ''}
                    <div class="option-body">
                        ${fl.options.map(o => `
                            <div class="flight-option">
                                <div><strong>Opción ${o.n}${o.itinerario ? '' : ': ' + esc(o.airline)}</strong><div class="sub">Salida desde ${esc(fl.salida)}</div></div>
                                <div class="flight-price">${money(o.adulto)} <small>/ adulto</small>${o.nino ? `<br>${money(o.nino)} <small>/ niño</small>` : ''}</div>
                            </div>
                            ${o.itinerario && window.VAM_VUELOS ? VAM_VUELOS.itinerarioHtml(o.itinerario, o.n, false, VAM_VUELOS.logos) : ''}`).join('')}
                        <p class="item-disclaimer">*Valores informativos, sujetos a cambio sin previo aviso por parte de la aerolínea.</p>
                    </div>
                </div>`;
        }
        const s = collectSimple();
        if (s.tour) html += `
            <div class="component-section"><h3>🗺️ Tour opcional</h3><div class="option-body">
                ${s.tour.foto ? `<div class="single-photo-container"><img src="${s.tour.foto}"></div>` : ''}
                <div class="item-option"><div><strong>${esc(s.tour.nombre)}</strong>${s.tour.desc ? `<div class="sub">${nl2br(s.tour.desc)}</div>` : ''}</div><span class="item-price">${priceOrIncluded(s.tour.precio)}</span></div>
            </div></div>`;
        if (s.traslado) html += `
            <div class="component-section"><h3>🚐 Traslados</h3><div class="option-body">
                ${s.traslado.foto ? `<div class="single-photo-container"><img src="${s.traslado.foto}"></div>` : ''}
                <div class="item-option"><strong>${esc(s.traslado.desc)}</strong><span class="item-price">${priceOrIncluded(s.traslado.precio)}</span></div>
            </div></div>`;
        if (s.seguro) html += `
            <div class="component-section insurance"><h3>🛡️ Seguro de viaje recomendado</h3><div class="option-body">
                <div class="item-option"><strong>${esc(s.seguro.nombre)}</strong><span class="item-price">${money(s.seguro.precio)} <small>/ persona</small></span></div>
                ${s.seguro.cobertura ? `<p><strong>Cobertura:</strong> ${esc(s.seguro.cobertura)}</p>` : ''}
                ${s.seguro.detalle ? `<p><strong>Incluye:</strong> ${nl2br(s.seguro.detalle)}</p>` : ''}
            </div></div>`;
        confirmationComponentsContainer.innerHTML = html;

        // Opciones de compra
        const op = collectOptions();
        document.getElementById('confirm-opcion1').innerHTML = `${money(op.op1, op.op1m)} <small>/ persona</small>`;
        const card2 = document.getElementById('option-card-2');
        if (op.op2) { card2.style.display = 'flex'; document.getElementById('confirm-opcion2').innerHTML = `${money(op.op2, op.op2m)} <small>/ persona</small>`; }
        else card2.style.display = 'none';
        document.getElementById('confirm-no-incluye').textContent = op.noIncluye;

        // Condiciones (políticas oficiales de la agencia)
        document.getElementById('confirm-terms-content').innerHTML = VAM_LEGAL.resumen;
        document.getElementById('company-legal-details').innerHTML = companyLegalHTML();
    }

    function validateForm() {
        if (!form.checkValidity()) { form.reportValidity(); alert('Por favor, completa todos los campos obligatorios.'); return false; }
        if (dynamicComponentsContainer.children.length === 0) { alert('Debes añadir al menos un componente (hotel, vuelos, tours...).'); return false; }
        return true;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateForm()) return;
        loaderOverlay.style.display = 'flex';
        document.getElementById('loader-text').textContent = 'Guardando...';
        const ok = await saveQuote();
        loaderOverlay.style.display = 'none';
        if (!ok) return;
        populateQuote();
        formTitleSection.style.display = 'none';
        formSection.style.display = 'none';
        confirmationSection.style.display = 'block';
        window.scrollTo(0, 0);
    });

    // --- PDF ---
    async function buildPdf() {
        const el = document.getElementById('voucher-to-print');
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false });
        const pdf = new window.jspdf.jsPDF({ orientation: 'p', unit: 'px', format: [canvas.width, canvas.height] });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, canvas.width, canvas.height);
        const scale = canvas.width / el.offsetWidth;
        const cRect = el.getBoundingClientRect();
        document.querySelectorAll('.pdf-link').forEach(a => {
            if (!a.href) return;
            const r = a.getBoundingClientRect();
            pdf.link((r.left - cRect.left) * scale, (r.top - cRect.top) * scale, r.width * scale, r.height * scale, { url: a.href });
        });
        return pdf;
    }
    const pdfFileName = () => `Cotizacion_${val('cotizacion-numero')}_${val('nombre-completo').replace(/ /g, '_')}.pdf`;

    async function processQuote() {
        loaderOverlay.style.display = 'flex';
        document.getElementById('loader-text').textContent = 'Generando PDF...';
        const btn = document.getElementById('process-quote-btn');
        btn.disabled = true;
        try {
            const pdf = await buildPdf();
            pdf.save(pdfFileName());
        } catch (error) {
            console.error('Error generando PDF:', error);
            if (window.location.protocol === 'file:') { alert('Abre la herramienta desde el servidor web (no como archivo local) para descargar el PDF. Mientras tanto se abre la impresión.'); window.print(); }
            else alert(`Hubo un error al generar el PDF: ${error.message}`);
        } finally {
            loaderOverlay.style.display = 'none';
            btn.disabled = false;
        }
    }

    async function emailQuote() {
        const advisor = ADVISORS[currentUser];
        let to = val('cliente-email').trim();
        if (!to) to = (prompt('Correo del cliente:') || '').trim();
        if (!to) return;
        if (!VAM_API.isAvailable()) { alert('El envío de correo requiere la conexión con el servidor (API). Descarga el PDF y envíalo manualmente.'); return; }
        loaderOverlay.style.display = 'flex';
        document.getElementById('loader-text').textContent = 'Enviando correo...';
        try {
            const pdf = await buildPdf();
            const b64 = pdf.output('datauristring').split(',')[1];
            await VAM_API.correo.enviar({
                asesorId: currentUser, asesorNombre: advisor.name, para: to, nombreCliente: val('nombre-completo'),
                asunto: `Tu propuesta de viaje ${val('cotizacion-numero')} - Vuelta al Mundo Tours`,
                mensaje: `Te comparto la propuesta de viaje que preparamos para ti (cotización ${val('cotizacion-numero')}). La encuentras adjunta en PDF.\nSi quieres reservar o tienes preguntas, escríbeme por WhatsApp al ${VAM_CONFIG.WPP_DISPLAY}.`,
                tipo: 'cotizacion', referencia: val('cotizacion-numero'), pdfBase64: b64, pdfNombre: pdfFileName()
            });
            alert(`✅ Cotización enviada a ${to}\n\nUna copia queda en la Bandeja de entrada de ${VAM_CONFIG.COMPANY.salesEmail} (webmail de Hostinger).`);
        } catch (error) {
            console.error(error);
            alert('No se pudo enviar el correo: ' + error.message);
        } finally { loaderOverlay.style.display = 'none'; }
    }
    document.getElementById('process-quote-btn').addEventListener('click', processQuote);
    document.getElementById('email-quote-btn').addEventListener('click', emailQuote);
    document.getElementById('new-quote-btn').addEventListener('click', () => { currentEditQuoteId = null; currentPlan = null; initializeForm(); showForm(); });
    document.getElementById('edit-quote-btn').addEventListener('click', showForm);

    // Itinerario en texto para el imprimible (sin logos ni gráficos)
    function itinerarioTexto(det) {
        const dur = m => m ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : '';
        const tramo = (t, tit) => {
            if (!t || !t.tramos || !t.tramos.length) return '';
            const p = t.tramos[0], u = t.tramos[t.tramos.length - 1];
            const aer = [...new Set(t.tramos.map(x => x.aerolinea).filter(Boolean))].join(' + ');
            const esc2 = t.escalas && t.escalas.length ? `${t.escalas.length} escala${t.escalas.length > 1 ? 's' : ''} (${t.escalas.map(e => e.aeropuerto + (e.minutos ? ' ' + dur(e.minutos) : '')).join(', ')})` : 'directo';
            return `<span class="sub"><strong>${tit}</strong> ${formatDate(t.fecha)} · ${esc(p.salida)} ${esc(p.horaSalida)} → ${esc(u.llegada)} ${esc(u.horaLlegada)}${t.tramos.some(x => x.nocturno) ? ' (+1)' : ''} · ${dur(t.minutos)} · ${esc2} · ${esc(aer)}${t.tramos.some(x => x.vuelo) ? ' ' + t.tramos.map(x => esc(x.vuelo)).filter(Boolean).join(', ') : ''}</span>`;
        };
        const eq = [...new Set([...(det.ida?.equipaje || []), ...(det.regreso?.equipaje || [])])];
        return tramo(det.ida, 'Ida') + tramo(det.regreso, 'Regreso') + `<span class="sub">Equipaje: ${eq.length ? esc(eq.join(' · ')) : 'Tarifa Basic'}</span>`;
    }

    // --- IMPRIMIBLE CORPORATIVO (carta, sin fotos) ---
    function populatePrintDossier() {
        const advisor = ADVISORS[currentUser];
        const hotels = collectHotels();
        const fl = collectFlights();
        const s = collectSimple();
        const op = collectOptions();
        const hoy = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
        const header = (kind, sub) => `<div class="doc-header"><img src="assets/logo/logo-horizontal-blanco.png" alt="Vuelta al Mundo Tours"><div class="doc-kind"><h1>${kind}</h1><p>${sub}</p></div></div>`;
        const footer = () => `<div class="doc-footer"><span><strong>${COMPANY.name}</strong> · NIT ${COMPANY.nit} · RNT ${COMPANY.rnt} · ${COMPANY.address}</span><span class="page-no">${COMPANY.web.replace('https://', '')}</span></div>`;
        const numero = val('cotizacion-numero');

        let rows = '';
        hotels.forEach(h => {
            rows += `<tr><th>Destino</th><td>${esc(h.destino)}</td></tr>
                <tr><th>Hotel</th><td>${esc(h.nombre)}</td></tr>
                <tr><th>Fechas</th><td>${formatDate(h.checkIn)}${h.checkOut ? ' al ' + formatDate(h.checkOut) : ''}<span class="sub">${esc(h.nochesTxt)}</span></td></tr>
                <tr><th>Habitaciones</th><td>${esc(h.habitacionesTxt)}${h.acomodacion ? ' · acomodación ' + esc(h.acomodacion) : ''}</td></tr>
                <tr><th>Plan</th><td>${esc(h.regimen)}</td></tr>
                ${h.incluye ? `<tr><th>Incluye</th><td>${nl2br(h.incluye)}</td></tr>` : ''}
                <tr><th>Precio por persona</th><td class="precio">${priceOrIncluded(h.precio, h.moneda, '')}</td></tr>`;
        });

        let servicios = '';
        if (fl) fl.options.forEach(o => servicios += `<tr><td>Vuelos · Opción ${o.n}${o.itinerario ? '' : ': ' + esc(o.airline)}<span class="sub">Salida desde ${esc(fl.salida)}. Valores informativos, sujetos a cambio por la aerolínea.</span>${o.itinerario ? itinerarioTexto(o.itinerario) : ''}</td><td class="precio">${money(o.adulto)} / adulto${o.nino ? `<span class="sub">${money(o.nino)} / niño</span>` : ''}</td></tr>`);
        if (s.tour) servicios += `<tr><td>Tour · ${esc(s.tour.nombre)}${s.tour.desc ? `<span class="sub">${nl2br(s.tour.desc)}</span>` : ''}</td><td class="precio">${priceOrIncluded(s.tour.precio, 'COP', ' / persona')}</td></tr>`;
        if (s.traslado) servicios += `<tr><td>Traslado · ${esc(s.traslado.desc)}</td><td class="precio">${priceOrIncluded(s.traslado.precio, 'COP', ' / persona')}</td></tr>`;
        if (s.seguro) servicios += `<tr><td>Seguro de viaje · ${esc(s.seguro.nombre)}${s.seguro.cobertura ? `<span class="sub">Cobertura: ${esc(s.seguro.cobertura)}</span>` : ''}</td><td class="precio">${money(s.seguro.precio)} / persona</td></tr>`;

        const page1 = `<div class="doc-page">
            ${header('Propuesta de viaje', `Cotización Nº ${esc(numero)}`)}
            <div class="doc-body">
                <div class="doc-meta">
                    <div><span>Cliente</span><strong>${esc(val('nombre-completo'))}</strong></div>
                    <div><span>Pasajeros</span><strong>${paxText()}</strong></div>
                    <div><span>Fecha de emisión</span><strong>${hoy}</strong></div>
                    <div><span>Asesor</span><strong>${esc(advisor.name)}</strong></div>
                    <div><span>WhatsApp</span><strong>${VAM_CONFIG.WPP_DISPLAY}</strong></div>
                    <div><span>Validez</span><strong>${esc(val('validez-cupos'))}</strong></div>
                </div>
                ${rows ? `<div class="doc-section">Detalle del plan</div><table class="doc-table">${rows}</table>` : ''}
                ${servicios ? `<div class="doc-section">Servicios adicionales</div><table class="doc-table servicios">${servicios}</table>` : ''}
            </div>
            ${footer()}
        </div>
        <div class="doc-page">
            ${header('Opciones de compra', `Cotización Nº ${esc(numero)}`)}
            <div class="doc-body">
                <div class="doc-section">Opciones de compra · valores por persona</div>
                <div class="doc-options ${op.op2 ? '' : 'single'}">
                    <div class="doc-option"><small>Opción 1</small><span>Plan sin vuelos</span><strong>${money(op.op1, op.op1m)}</strong><em>por persona</em></div>
                    ${op.op2 ? `<div class="doc-option destacada"><small>Opción 2</small><span>Plan con vuelos incluidos</span><strong>${money(op.op2, op.op2m)}</strong><em>por persona</em></div>` : ''}
                </div>
                <div class="doc-box alerta"><strong>El plan no incluye:</strong> ${nl2br(op.noIncluye)}</div>
                <div class="doc-contact"><div><strong>¿Listo para reservar?</strong>Escríbenos indicando la cotización Nº ${esc(numero)}. Atención de lunes a viernes de 9:00 a.m. a 6:00 p.m.</div><div class="wa">WhatsApp ${VAM_CONFIG.WPP_DISPLAY}</div></div>
            </div>
            ${footer()}
        </div>`;
        const page2 = `<div class="doc-page">
            ${header('Términos y condiciones', `Cotización Nº ${esc(numero)}`)}
            <div class="doc-body"><div class="doc-legal">${VAM_LEGAL.completo}</div>
            <p class="doc-hint" style="margin-top:4mm">Políticas completas en ${COMPANY.policiesUrl}</p></div>
            ${footer()}
        </div>`;
        document.getElementById('print-dossier').innerHTML = page1 + page2;
    }
    document.getElementById('print-physical-btn').addEventListener('click', () => {
        populatePrintDossier();
        setTimeout(() => window.print(), 300);
    });
});
