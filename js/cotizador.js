/* ==========================================
   COTIZADOR PRO - VUELTA AL MUNDO TOURS (CON DASHBOARD Y TOTALIZADOR)
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // Adaptador localStorage que imita la API de Supabase para funcionar offline
    const LOCAL_DB_KEY = 'vam_quotes_db';
    function getLocalDB() { return JSON.parse(localStorage.getItem(LOCAL_DB_KEY) || '[]'); }
    function saveLocalDB(data) { localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(data)); }
    
    const db = {
        from: (table) => ({
            select: (cols) => ({
                eq: (field, value) => ({
                    order: (orderField, opts) => {
                        let items = getLocalDB().filter(item => item[field] === value);
                        if (opts && !opts.ascending) items.sort((a, b) => (b[orderField] || 0) - (a[orderField] || 0));
                        return Promise.resolve({ data: items, error: null });
                    }
                })
            }),
            insert: (docs) => ({
                select: () => {
                    const items = getLocalDB();
                    const newDocs = docs.map(d => ({ ...d, id: 'vam_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5) }));
                    items.push(...newDocs);
                    saveLocalDB(items);
                    return Promise.resolve({ data: newDocs, error: null });
                }
            }),
            update: (updateData) => ({
                eq: (field, value) => {
                    const items = getLocalDB();
                    const idx = items.findIndex(i => i[field] === value);
                    if (idx >= 0) Object.assign(items[idx], updateData);
                    saveLocalDB(items);
                    return Promise.resolve({ error: null });
                }
            }),
            delete: () => ({
                eq: (field, value) => {
                    const items = getLocalDB().filter(i => i[field] !== value);
                    saveLocalDB(items);
                    return Promise.resolve({ error: null });
                }
            })
        })
    };
    let currentUser = localStorage.getItem('vam_user'); // Obtener desde localStorage

    // Si no hay usuario logueado en localStorage o ya no existe en el sistema, redirigir al hub
    if (!currentUser || !VAM_CONFIG.ADVISORS[currentUser]) {
        localStorage.removeItem('vam_user');
        window.location.href = 'index.html';
        return;
    }

    // --- VARIABLES GLOBALES ---
    let pastedImages = {};
    let hotelCounter = 0;
    let cruiseCounter = 0;
    let currentEditQuoteId = null; // Null si es nueva, ID de Firestore si estamos editando
    
    const ADVISORS = VAM_CONFIG.ADVISORS;
    const CORPORATE_WPP = VAM_CONFIG.CORPORATE_WPP;

    const ICONS = {
        destination: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>',
        calendar: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>',
        moon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>',
        bed: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7h2a2 2 0 012 2v9a2 2 0 01-2 2h-2m-6 0H7a2 2 0 01-2-2V9a2 2 0 012-2h2m4-4h2a2 2 0 012 2v2H9V5a2 2 0 012-2zM9 12h6"></path></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        plane: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>'
    };

    const TERMS_AND_CONDITIONS = {
        flights: `<h3>✈️ Tiquetes Aéreos</h3><ul><li>Los valores e itinerarios cotizados están sujetos a cambios y disponibilidad por parte de las aerolíneas sin previo aviso.</li><li>Los vuelos incluidos en esta cotización son aproximados al momento de su emisión.</li><li>Para garantizar el valor y el itinerario proporcionado, se debe utilizar la <strong>Opción 2</strong> del Plan de Pagos (pago total inmediato).</li><li>Ninguna aerolínea permite separar, reservar o congelar precios sin el pago completo.</li><li>En caso de cambio de fecha, nombre del pasajero o cualquier modificación, la aerolínea aplicará penalidades según su política interna.</li><li>Niños mayores de 2 años cumplidos pagan tarifa de adulto.</li><li>Los tiquetes se emiten en tarifa básica, Si deseas adicionar equipaje de mano o de bodega, se podrá incluir posteriormente o solicitar con anticipación. Ten en cuenta que esto genera un costo adicional.</li></ul>`,
        hotels: `<h3>🏨 Hoteles</h3><ul><li>La reserva hotelera se realiza inicialmente con un pago parcial (separación).</li><li>Si deseas modificar la fecha del viaje, se validará primero la disponibilidad en el hotel. En caso de no estar disponible, se intentará mantener el valor en otro hotel de la misma categoría.</li><li>Si la nueva fecha corresponde a temporada alta y el valor se incrementa, el cliente deberá asumir la diferencia.</li><li>Niños mayores de 6 años pagan estadía en la mayoría de hoteles, de acuerdo con sus políticas.</li><li>En caso de que la garantía de 12 meses no sea suficiente y desees extenderla hasta 18 meses, esta extensión está sujeta a aprobación y puede implicar penalidades o ajustes de tarifa.</li></ul>`,
        transfers: `<h3>🚐 Traslados</h3><ul><li>Los servicios de traslado pueden ser compartidos o privados según lo especificado.</li><li>Es obligatorio informar sobre equipaje sobredimensionado o especial previo al viaje.</li><li>El tiempo máximo de espera del conductor es de 60 minutos en aeropuerto y 15 minutos en hotel.</li></ul>`
    };

    const REGIMEN_TEMPLATES = {
        'todo_incluido': `Todo incluido: Desayunos, almuerzos, cenas, snacks y bebidas ilimitadas.`,
        'pension_completa': `Pensión Completa: Desayuno, almuerzo y cena.`,
        'media_pension': `Media Pensión: Desayuno y cena.`,
        'desayuno': `Alojamiento y Desayuno.`,
        'solo_hotel': `Solo alojamiento.`
    };

    // --- ELEMENTOS DEL DOM ---
    const dashboardSection = document.getElementById('dashboard-section');
    const formTitleSection = document.getElementById('form-title-section');
    const formSection = document.getElementById('form-section');
    const confirmationSection = document.getElementById('confirmation-section');
    
    const btnCreateNew = document.getElementById('btn-create-new');
    const btnBackDashboard = document.getElementById('btn-back-dashboard');
    const btnLogout = document.getElementById('btn-logout');
    
    const form = document.getElementById('pre-reserva-form');
    const dynamicComponentsContainer = document.getElementById('dynamic-components-container');
    const confirmationComponentsContainer = document.getElementById('confirmation-components-container');
    
    const ninosSelect = document.getElementById('ninos');
    const childrenAgesContainer = document.getElementById('children-ages-container');
    const childrenAgesInputs = document.getElementById('children-ages-inputs');

    const loaderOverlay = document.getElementById('loader-overlay');
    
    // Inicializar selectores
    function initSelects() {
        // Adultos y niños
        const adultsSelect = document.getElementById('adultos');
        adultsSelect.innerHTML = '';
        for (let i = 1; i <= 20; i++) {
            const option = new Option(i, i);
            if (i === 2) option.selected = true;
            adultsSelect.add(option);
        }
        
        ninosSelect.innerHTML = '';
        for (let i = 0; i <= 10; i++) {
            const text = i === 0 ? '0' : (i === 1 ? '1 niño' : `${i} niños`);
            ninosSelect.add(new Option(text, i));
        }
    }
    
    initSelects();

    // --- LÓGICA DE EDADES DE NIÑOS ---
    ninosSelect.addEventListener('change', (e) => {
        const numChildren = parseInt(e.target.value);
        childrenAgesInputs.innerHTML = '';
        if (numChildren > 0) {
            childrenAgesContainer.style.display = 'block';
            for (let i = 1; i <= numChildren; i++) {
                childrenAgesInputs.innerHTML += `
                    <div class="form-group">
                        <label>Edad Niño ${i}</label>
                        <select class="child-age-select" required>
                            <option value="" disabled selected>Seleccionar</option>
                            ${[...Array(12).keys()].map(age => `<option value="${age}">${age} años</option>`).join('')}
                        </select>
                    </div>
                `;
            }
            // Recalcular al cambiar edades
            document.querySelectorAll('.child-age-select').forEach(sel => sel.addEventListener('change', calculateTotals));
        } else {
            childrenAgesContainer.style.display = 'none';
        }
        calculateTotals();
    });

    // --- SISTEMA DE LOGIN Y SESIÓN ---
    // Iniciar dashboard directo
    const mainWrapper = document.querySelector('.wrapper');
    if (mainWrapper) mainWrapper.style.display = 'block';
    
    document.getElementById('header-user-name').textContent = `Hola, ${ADVISORS[currentUser].name.split(' ')[0]}`;
    loadDashboard();

    btnLogout.addEventListener('click', () => {
        localStorage.removeItem('vam_user');
        window.location.href = 'index.html';
    });


    // --- DASHBOARD ---
    async function loadDashboard() {
        dashboardSection.style.display = 'block';
        formTitleSection.style.display = 'none';
        formSection.style.display = 'none';
        confirmationSection.style.display = 'none';
        
        const quotesList = document.getElementById('quotes-list');
        quotesList.innerHTML = '<p style="text-align:center;">Cargando cotizaciones...</p>';
        
        try {
            const { data: quotesData, error } = await db.from('cotizaciones_vam')
                                                         .select('*')
                                                         .eq('asesorId', currentUser)
                                                         .order('timestamp', { ascending: false });
            
            if (error) throw error;

            const allDocs = quotesData.map(item => ({
                id: item.id,
                data: () => item
            }));

            const searchQuoteInput = document.getElementById('search-quote');
            const filterData = () => {
                const term = searchQuoteInput.value.toLowerCase();
                const status = document.getElementById('filter-status').value;
                const filtered = allDocs.filter(doc => {
                    const data = doc.data();
                    const matchSearch = data.numero && data.numero.toLowerCase().includes(term) || data.cliente && data.cliente.toLowerCase().includes(term);
                    const matchStatus = status === 'Todos' || (data.estado || 'Pendiente') === status;
                    return matchSearch && matchStatus;
                });
                renderQuotes(filtered);
            };

            searchQuoteInput.addEventListener('input', filterData);
            document.getElementById('filter-status').addEventListener('change', filterData);
            
            renderQuotes(allDocs);
            
        } catch (error) {
            console.error("Error cargando dashboard: ", error);
            quotesList.innerHTML = '<p style="color:red; text-align:center;">Error al cargar datos.</p>';
        }
    }

    function renderQuotes(docs) {
        const quotesList = document.getElementById('quotes-list');
        quotesList.innerHTML = '';
        if (docs.length === 0) { quotesList.innerHTML = '<p style="grid-column: 1 / -1; text-align:center;">No hay cotizaciones que coincidan.</p>'; return; }
        
        const statusColors = { 'Pendiente': '#f39c12', 'Vendida': '#27ae60', 'Rechazada': '#c0392b' };

        docs.forEach(doc => {
            const data = doc.data();
            const date = data.timestamp ? new Date(data.timestamp).toLocaleDateString('es-ES') : 'Fecha desconocida';
            const currentStatus = data.estado || 'Pendiente';
            
            const card = document.createElement('div');
            card.className = 'quote-card';
            card.innerHTML = `
                <span class="quote-badge">${data.numero}</span>
                <h3 style="margin-top: 15px;">${data.cliente}</h3>
                <p>${data.destinosResumen || 'Cotización'}</p>
                <span class="quote-date">Creada: ${date}</span>
                
                <select class="status-select" data-id="${doc.id}" style="width: 100%; margin-top: 10px; padding: 8px; border-radius: 8px; border: none; color: white; font-weight: bold; background-color: ${statusColors[currentStatus]}; cursor: pointer;">
                    <option value="Pendiente" ${currentStatus === 'Pendiente' ? 'selected' : ''}>🟡 Pendiente</option>
                    <option value="Vendida" ${currentStatus === 'Vendida' ? 'selected' : ''}>🟢 Vendida</option>
                    <option value="Rechazada" ${currentStatus === 'Rechazada' ? 'selected' : ''}>🔴 Rechazada</option>
                </select>

                <button class="btn-duplicate" data-id="${doc.id}">📄 Duplicar</button>
                <button class="btn-delete" data-id="${doc.id}" style="background: #ffeaea; border: 1px solid #ffccc7; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: bold; color: #ff4d4f; margin-top: 10px; width: 100%; transition: background 0.2s;">🗑️ Eliminar</button>
            `;
            
            card.querySelector('.status-select').addEventListener('change', async (e) => {
                const newStatus = e.target.value;
                e.target.style.backgroundColor = statusColors[newStatus];
                try {
                    const { error } = await db.from('cotizaciones_vam').update({ estado: newStatus }).eq('id', doc.id);
                    if (error) throw error;
                } catch (error) {
                    console.error("Error actualizando estado:", error);
                    alert("No se pudo actualizar el estado.");
                }
            });

            card.querySelector('.btn-delete').addEventListener('click', async (e) => {
                e.stopPropagation(); 
                if(confirm("⚠️ ¿Estás seguro de eliminar esta cotización? Esta acción es irreversible.")) {
                    try {
                        const { error } = await db.from('cotizaciones_vam').delete().eq('id', doc.id);
                        if (error) throw error;
                        card.remove();
                    } catch (error) {
                        alert("Error al eliminar la cotización.");
                    }
                }
            });

            card.addEventListener('click', (e) => {
                if(e.target.classList.contains('btn-duplicate') || e.target.classList.contains('status-select') || e.target.classList.contains('btn-delete')) return; 
                openQuoteForEdit(doc.id, data);
            });

            card.querySelector('.btn-duplicate').addEventListener('click', (e) => {
                e.stopPropagation();
                duplicateQuote(data);
            });

            quotesList.appendChild(card);
        });
    }

    btnCreateNew.addEventListener('click', () => {
        currentEditQuoteId = null;
        initializeForm();
        dashboardSection.style.display = 'none';
        formTitleSection.style.display = 'block';
        formSection.style.display = 'block';
        window.scrollTo(0,0);
    });

    btnBackDashboard.addEventListener('click', () => {
        if(confirm("¿Seguro que quieres volver al dashboard? Los cambios no guardados se perderán.")) {
            loadDashboard();
        }
    });

    // --- FORMULARIO Y COMPONENTES DINÁMICOS ---
    function generateQuoteNumber() {
        const now = new Date();
        return `VAM-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    }

    function initializeForm() {
        form.reset();
        pastedImages = {};
        hotelCounter = 0;
        dynamicComponentsContainer.innerHTML = '';
        document.querySelectorAll('.add-section-btn').forEach(btn => btn.style.display = 'block');
        initSelects();
        document.getElementById('cotizacion-numero').value = generateQuoteNumber();
        document.getElementById('validez-cupos').value = "¡Últimos 3 cupos a este precio! Válido por 24 horas.";
        document.getElementById('no-incluye').value = "Gastos o servicios no especificados en la cotización.";
        document.getElementById('fecha-limite-pago').value = "El saldo restante debe ser pagado 45 días antes de la fecha de viaje.";
        childrenAgesContainer.style.display = 'none';
        calculateTotals();
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
            if (!template) return;
            let cloneHtml = template.innerHTML.replace(/PLACEHOLDER/g, hotelCounter);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = cloneHtml;
            const cloneNode = tempDiv.firstElementChild;
            dynamicComponentsContainer.appendChild(cloneNode);

            const nightsSelect = document.getElementById(`cantidad-noches-${hotelCounter}`);
            for (let i = 1; i <= 30; i++) {
                const option = new Option(`${i} noche${i > 1 ? 's' : ''}`, i);
                if (i === 4) option.selected = true;
                nightsSelect.add(option);
            }
            const roomsSelect = document.getElementById(`cantidad-habitaciones-${hotelCounter}`);
            for (let i = 1; i <= 10; i++) {
                const option = new Option(`${i} habitación${i > 1 ? 'es' : ''}`, i);
                if (i === 1) option.selected = true;
                roomsSelect.add(option);
            }
            
            addEventListenersToSection(cloneNode);
            
            if (hotelCounter === 1) document.querySelector(`.add-section-btn[data-section="hotel"]`).style.display = 'none';
            if (hotelCounter > 1) document.querySelector(`#hotel-form-wrapper-${hotelCounter - 1} .add-subsection-btn`).style.display = 'none';
            
        } else {
            const template = document.getElementById(`template-${sectionKey}`);
            if (!template) return;
            const clone = template.content.cloneNode(true);
            dynamicComponentsContainer.appendChild(clone);
            addEventListenersToSection(dynamicComponentsContainer.querySelector(`#${sectionKey}-form-wrapper`));
            document.querySelector(`.add-section-btn[data-section="${sectionKey}"]`).style.display = 'none';
            updateRequiredFields(sectionKey, true);
        }
        calculateTotals();
    }

    function removeSection(sectionKey) {
        if (sectionKey.startsWith('hotel-')) {
            const num = sectionKey.split('-')[1];
            const wrapper = document.getElementById(`hotel-form-wrapper-${num}`);
            if (wrapper) wrapper.remove();
            if (document.querySelectorAll('.hotel-form-wrapper').length === 0) {
                document.querySelector(`.add-section-btn[data-section="hotel"]`).style.display = 'block';
                hotelCounter = 0;
            } else {
                const lastHotel = Array.from(document.querySelectorAll('.hotel-form-wrapper')).pop();
                lastHotel.querySelector('.add-subsection-btn').style.display = 'block';
            }
        } else {
            const wrapper = document.getElementById(`${sectionKey}-form-wrapper`);
            if (wrapper) {
                wrapper.remove();
                document.querySelector(`.add-section-btn[data-section="${sectionKey}"]`).style.display = 'block';
                updateRequiredFields(sectionKey, false);
            }
        }
        calculateTotals();
    }

    function addSubSection(subSectionKey) {
        if (subSectionKey === 'hotel') addSection('hotel');
        else {
            const wrapper = document.getElementById(`${subSectionKey}-form-wrapper`);
            if (wrapper) {
                wrapper.style.display = 'block';
                document.querySelector(`.add-subsection-btn[data-subsection="${subSectionKey}"]`).style.display = 'none';
                updateRequiredFields(subSectionKey, true);
            }
        }
        calculateTotals();
    }
    
    function removeSubSection(subSectionKey) {
        const wrapper = document.getElementById(`${subSectionKey}-form-wrapper`);
        if (wrapper) {
            wrapper.style.display = 'none';
            wrapper.querySelectorAll('input').forEach(input => input.value = '');
            document.querySelector(`.add-subsection-btn[data-subsection="${subSectionKey}"]`).style.display = 'block';
            updateRequiredFields(subSectionKey, false);
        }
        calculateTotals();
    }

    function updateRequiredFields(key, isRequired) {
        (requiredFieldsConfig[key] || []).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.required = isRequired;
        });
    }

    // --- DELEGACIÓN DE EVENTOS EN EL FORMULARIO ---
    form.addEventListener('click', e => {
        const { target } = e;
        const { section, subsection, target: actionTarget } = target.dataset;
        
        if (target.matches('.add-section-btn')) addSection(section);
        if (target.matches('.remove-section-btn')) {
            if (subsection) {
                removeSubSection(subsection);
            } else {
                removeSection(section);
            }
        }
        if (target.matches('.add-subsection-btn')) {
            addSubSection(section || subsection);
        }
        if (target.matches('.remove-img-btn')) {
            const pasteArea = target.parentElement;
            const imgId = pasteArea.dataset.imgId;
            pasteArea.querySelector('img').src = '';
            pasteArea.querySelector('img').style.display = 'none';
            pasteArea.querySelector('p').style.display = 'block';
            target.style.display = 'none';
            delete pastedImages[imgId];
        }
    });

    // Validar solo números en price-inputs y actualizar totalizador
    form.addEventListener('input', e => {
        if (e.target.classList.contains('price-input')) {
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            calculateTotals();
        }
        if (e.target.id === 'pago-reserva' || e.target.id === 'adultos' || e.target.id === 'ninos') {
            calculateTotals();
        }
    });

    function handlePaste(e) {
        e.preventDefault();
        const pasteArea = e.currentTarget; 
        const imageId = pasteArea.dataset.imgId;
        const loader = pasteArea.querySelector('.loader-spinner');
        const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
        if (item) {
            loader.style.display = 'block';
            pasteArea.querySelector('p').style.display = 'none';
            const reader = new FileReader();
            reader.onload = event => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const MAX_WIDTH = 1200; // INCREASED MAX WIDTH PARA MANTENER CALIDAD
                    if (width > MAX_WIDTH) {
                        height = Math.round((height * MAX_WIDTH) / width);
                        width = MAX_WIDTH;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85); // MEJOR CALIDAD PARA TEXTO
                    
                    const previewImg = pasteArea.querySelector('img');
                    previewImg.src = compressedBase64;
                    previewImg.style.display = 'block';
                    pasteArea.querySelector('.remove-img-btn').style.display = 'flex';
                    pastedImages[imageId] = compressedBase64;
                    loader.style.display = 'none';
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(item.getAsFile());
        }
    }

    function addEventListenersToSection(sectionElement) {
        if(!sectionElement) return;
        sectionElement.querySelectorAll('.paste-area').forEach(area => area.addEventListener('paste', handlePaste));
        sectionElement.querySelectorAll('.price-input').forEach(input => input.addEventListener('input', calculateTotals));
    }

    // --- TOTALIZADOR ---
    // Construye el desglose de precios desde los formularios activos
    function buildPriceBreakdown(adults, children) {
        const breakdown = [];
        const totalPax = parseInt(adults) + parseInt(children);

        // Hoteles
        document.querySelectorAll('.hotel-form-wrapper').forEach((wrapper, idx) => {
            const num = wrapper.id.match(/\d+/)[0];
            const valor = document.getElementById(`valor-total-${num}`).value;
            const moneda = document.getElementById(`moneda-${num}`).value;
            const nombre = document.getElementById(`hotel-${num}`).value;
            if (valor) {
                const numVal = parseFloat(String(valor).replace(/[^0-9.-]+/g, ''));
                if (!isNaN(numVal) && numVal > 0) {
                    breakdown.push({ tipo: 'Hotel', nombre: nombre || `Hotel ${idx + 1}`, precio: numVal, moneda, esTotalGlobal: true, label: formatCurrency(numVal, moneda) });
                }
            }
        });

        // Vuelos
        if (document.getElementById('flights-form-wrapper')) {
            const ciudad = document.getElementById('ciudad-salida').value;
            [1, 2].forEach(i => {
                const priceAdultInput = document.getElementById(`flight-${i}-price`);
                const priceChildInput = document.getElementById(`flight-${i}-price-child`);
                const airlineInput = document.getElementById(`flight-${i}-airline`);
                const wrapper2 = document.getElementById(`flight-${i}-form-wrapper`);
                
                if (priceAdultInput && airlineInput && (i === 1 || (wrapper2 && wrapper2.style.display !== 'none'))) {
                    let totalVuelo = 0;
                    const pAdult = parseFloat(String(priceAdultInput.value).replace(/[^0-9.-]+/g, ''));
                    if (!isNaN(pAdult) && pAdult > 0) totalVuelo += pAdult;
                    
                    if (priceChildInput && priceChildInput.value) {
                        const pChild = parseFloat(String(priceChildInput.value).replace(/[^0-9.-]+/g, ''));
                        if (!isNaN(pChild) && pChild > 0) totalVuelo += pChild;
                    }
                    
                    if (totalVuelo > 0) {
                        breakdown.push({ tipo: 'Vuelos', nombre: `${airlineInput.value || `Vuelo Op.${i}`} (desde ${ciudad})`, precio: totalVuelo, moneda: 'COP', esTotalGlobal: true, label: formatCurrency(totalVuelo) });
                    }
                }
            });
        }

        // Tours
        if (document.getElementById('tours-form-wrapper')) {
            const p = parseFloat(String(document.getElementById('tour-1-price').value).replace(/[^0-9.-]+/g, ''));
            const nombre = document.getElementById('tour-1-name').value;
            if (!isNaN(p) && p > 0) {
                breakdown.push({ tipo: 'Tour', nombre: nombre || 'Tour', precio: p, moneda: 'COP', esTotalGlobal: false, label: formatCurrency(p) });
            }
        }

        // Traslados
        if (document.getElementById('transfers-form-wrapper')) {
            const p = parseFloat(String(document.getElementById('transfer-1-price').value).replace(/[^0-9.-]+/g, ''));
            const desc = document.getElementById('transfer-1-desc').value;
            if (!isNaN(p) && p > 0) {
                breakdown.push({ tipo: 'Traslado', nombre: desc || 'Traslado', precio: p, moneda: 'COP', esTotalGlobal: false, label: formatCurrency(p) });
            }
        }

        // Seguro
        if (document.getElementById('insurance-form-wrapper')) {
            const p = parseFloat(String(document.getElementById('insurance-price').value).replace(/[^0-9.-]+/g, ''));
            if (!isNaN(p) && p > 0) {
                breakdown.push({ tipo: 'Seguro', nombre: `Seguro Recomendado`, precio: p, moneda: 'COP', esTotalGlobal: false, label: formatCurrency(p) });
            }
        }

        return breakdown;
    }

    function calculateTotals() {
        const adults = parseInt(document.getElementById('adultos').value) || 1;
        const children = parseInt(document.getElementById('ninos').value) || 0;
        
        let childrenOver5 = 0;
        if (children > 0) {
            document.querySelectorAll('.child-age-select').forEach(sel => {
                if (parseInt(sel.value) > 5) childrenOver5++;
            });
        }
        
        let totalAdultos = 0;
        let totalNinos = 0;
        
        // 1. Hotel (El Asesor pone el Valor Total de Adultos y Niños > 5; Niños 0-5 no suman aquí)
        // Para simplificar la vista, todo el "Valor Total" del hotel se carga al grupo Adultos en la pre-visualización.
        document.querySelectorAll('.hotel-form-wrapper').forEach((wrapper) => {
            const match = wrapper.id.match(/\d+/);
            if (!match) return; // Ignore placeholder template
            const num = match[0];
            const valorInput = document.getElementById(`valor-total-${num}`);
            const monedaInput = document.getElementById(`moneda-${num}`);
            if (valorInput && monedaInput && valorInput.value && monedaInput.value === 'COP') {
                const numVal = parseFloat(String(valorInput.value).replace(/[^0-9.-]+/g, ''));
                if (!isNaN(numVal)) totalAdultos += numVal; 
            }
        });

        // 2. Vuelos
        if (document.getElementById('flights-form-wrapper')) {
            [1, 2].forEach(i => {
                const wrapper = document.getElementById(`flight-${i}-form-wrapper`);
                if (i === 1 || (wrapper && wrapper.style.display !== 'none')) {
                    const priceAdInput = document.getElementById(`flight-${i}-price`);
                    const priceChInput = document.getElementById(`flight-${i}-price-child`);
                    
                    if (priceAdInput && priceAdInput.value) {
                        const pAd = parseFloat(String(priceAdInput.value).replace(/[^0-9.-]+/g, ''));
                        // Multiplicar por número de adultos
                        if (!isNaN(pAd)) totalAdultos += (pAd * adults);
                    }
                    if (priceChInput && priceChInput.value && children > 0) {
                        const pCh = parseFloat(String(priceChInput.value).replace(/[^0-9.-]+/g, ''));
                        // Multiplicar por número de niños
                        if (!isNaN(pCh)) totalNinos += (pCh * children);
                    }
                }
            });
        }

        // 3. Tours, Traslados, Seguros (Precio por persona)
        let perPersonTotal = 0;
        if (document.getElementById('tours-form-wrapper')) {
            const p = parseFloat(String(document.getElementById('tour-1-price').value).replace(/[^0-9.-]+/g, ''));
            if (!isNaN(p)) perPersonTotal += p;
        }
        if (document.getElementById('transfers-form-wrapper')) {
            const p = parseFloat(String(document.getElementById('transfer-1-price').value).replace(/[^0-9.-]+/g, ''));
            if (!isNaN(p)) perPersonTotal += p;
        }
        if (document.getElementById('insurance-form-wrapper')) {
            const p = parseFloat(String(document.getElementById('insurance-price').value).replace(/[^0-9.-]+/g, ''));
            if (!isNaN(p)) perPersonTotal += p;
        }

        totalAdultos += perPersonTotal * adults;
        totalNinos += perPersonTotal * children;

        const granTotal = totalAdultos + totalNinos;

        // Actualizar UI del Totalizador (Sticky Bar)
        const totalAdultsEl = document.getElementById('total-adults');
        const totalChildrenEl = document.getElementById('total-children');
        const totalGlobalEl = document.getElementById('total-global');
        
        if (totalAdultsEl) totalAdultsEl.textContent = formatCurrency(totalAdultos);
        if (totalChildrenEl) totalChildrenEl.textContent = formatCurrency(totalNinos);
        if (totalGlobalEl) totalGlobalEl.textContent = formatCurrency(granTotal) + ' COP';

        // Calcular Segundo Pago automáticamente
        const pagoReservaInput = document.getElementById('pago-reserva');
        if (pagoReservaInput) {
            const pagoReservaVal = parseFloat(String(pagoReservaInput.value).replace(/[^0-9.-]+/g, '')) || 0;
            const segundoPago = Math.max(0, granTotal - pagoReservaVal);
            
            const pagoSegundoInput = document.getElementById('pago-segundo');
            if (pagoSegundoInput) {
                pagoSegundoInput.value = granTotal > 0 ? segundoPago : '';
            }
        }
    }

    function renderPriceBreakdown(breakdown, adults, children) {
        const desgloseEl = document.getElementById('price-view-breakdown');
        const totalEl = document.getElementById('price-view-total');
        if (!desgloseEl || !totalEl) return;

        const adultsNum = parseInt(adults) || 1;
        const childrenNum = parseInt(children) || 0;
        const totalPax = adultsNum + childrenNum;

        // Calcular gran total en COP (los USD se marcan como "ver detalle")
        let totalCOP = 0;
        let hasForeignCurrency = false;
        breakdown.forEach(item => {
            if (item.moneda === 'COP') {
                totalCOP += item.esTotalGlobal ? item.precio : (item.precio * (item.pax || adultsNum));
            } else {
                hasForeignCurrency = true;
            }
        });

        let adultPrice = 0;
        let childPrice = 0;
        const taEl = document.getElementById('total-adults');
        const tcEl = document.getElementById('total-children');
        
        if (taEl && taEl.textContent) {
            const num = parseFloat(taEl.textContent.replace(/[^0-9]/g, ''));
            if (!isNaN(num) && adultsNum > 0) adultPrice = num / adultsNum;
        }
        if (tcEl && tcEl.textContent) {
            const num = parseFloat(tcEl.textContent.replace(/[^0-9]/g, ''));
            if (!isNaN(num) && childrenNum > 0) childPrice = num / childrenNum;
        }

        // Si por alguna razón la extracción del DOM falla, usamos el promedio
        if (adultPrice === 0 && childPrice === 0 && totalCOP > 0) {
            adultPrice = totalCOP / totalPax;
            childPrice = totalCOP / totalPax;
        }

        let perPersonDesgloseHTML = `
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                <span style="font-weight: 500; font-size: 14px; opacity: 0.9;">Inversión por Adulto:</span>
                <span style="font-weight: 700; font-size: 16px; color: var(--c-brand-secondary);">${formatCurrency(adultPrice)}</span>
            </div>
        `;
        if (childrenNum > 0) {
            perPersonDesgloseHTML += `
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center; margin-top: 4px;">
                <span style="font-weight: 500; font-size: 14px; opacity: 0.9;">Inversión por Niño:</span>
                <span style="font-weight: 700; font-size: 16px; color: var(--c-brand-secondary);">${formatCurrency(childPrice)}</span>
            </div>
            `;
        }

        // Vista desglose
        const rows = breakdown.map(item => `
            <div class="price-row">
                <div class="price-row-info">
                    <span class="price-row-tipo">${item.tipo}</span>
                    <span class="price-row-nombre">${item.nombre}</span>
                </div>
                <div class="price-row-valor">${item.esTotalGlobal ? item.label : item.label + ' <small style="font-size:11px;opacity:0.7">x' + totalPax + '</small>'}</div>
            </div>`).join('');

        desgloseEl.innerHTML = `
            <div class="price-breakdown-inner">
                <h4 class="price-section-title">💰 Desglose de la Cotización</h4>
                ${rows}
                <div class="price-total-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                    ${perPersonDesgloseHTML}
                    <div style="display: flex; justify-content: space-between; width: 100%; align-items: center; border-top: 1px dashed rgba(32, 70, 40, 0.2); padding-top: 8px; margin-top: 4px; width: 100%;">
                        <span style="font-weight: 700; font-size: 15px;">Inversión Total (${totalPax} pax):</span>
                        <strong style="font-size: 20px; color: var(--c-brand-primary);">${formatCurrency(totalCOP)}${hasForeignCurrency ? ' + USD' : ''}</strong>
                    </div>
                </div>
                ${hasForeignCurrency ? '<p class="price-note">*Los valores en USD están sujetos a TRM vigente al momento del pago.</p>' : ''}
            </div>`;

        let perPersonTotalHTML = `
            <div>
                <p class="price-total-label" style="margin-bottom: 2px;">Inversión por Adulto</p>
                <p class="price-total-amount" style="font-size: 32px; margin-bottom: 0;">${formatCurrency(adultPrice)}</p>
            </div>
        `;
        if (childrenNum > 0) {
            perPersonTotalHTML += `
            <div style="margin-top: 15px;">
                <p class="price-total-label" style="margin-bottom: 2px;">Inversión por Niño</p>
                <p class="price-total-amount" style="font-size: 32px; margin-bottom: 0;">${formatCurrency(childPrice)}</p>
            </div>
            `;
        }

        // Vista total
        totalEl.innerHTML = `
            <div class="price-total-box" style="display: flex; flex-direction: column; gap: 15px; align-items: center; padding: 35px 25px;">
                ${perPersonTotalHTML}
                <div style="width: 80%; height: 1px; background: rgba(255, 255, 255, 0.25); margin: 5px 0;"></div>
                <div>
                    <p class="price-total-label" style="margin-bottom: 2px;">Inversión Total (${totalPax} pasajeros)</p>
                    <p class="price-total-amount" style="font-size: 42px; margin-bottom: 0;">${formatCurrency(totalCOP)}</p>
                    ${hasForeignCurrency ? '<p class="price-note" style="color: white; opacity: 0.9; background: none; padding: 5px 0 0 0; margin-top: 4px;">*Más costos en USD según TRM vigente.</p>' : ''}
                </div>
                <p class="price-total-pax" style="font-size: 14px; opacity: 0.85; margin-top: 5px;">
                    Para ${adultsNum} adulto${adultsNum > 1 ? 's' : ''}${childrenNum > 0 ? ` y ${childrenNum} niño${childrenNum > 1 ? 's' : ''}` : ''}
                </p>
            </div>`;
    }

    function showPriceView(view) {
        const desgloseEl = document.getElementById('price-view-breakdown');
        const totalEl = document.getElementById('price-view-total');
        const btnDesglose = document.getElementById('btn-view-desglose');
        const btnTotal = document.getElementById('btn-view-total');
        if (!desgloseEl || !totalEl) return;
        if (view === 'breakdown') {
            desgloseEl.style.display = 'block';
            totalEl.style.display = 'none';
            if (btnDesglose) { btnDesglose.classList.add('active'); btnTotal.classList.remove('active'); }
        } else {
            desgloseEl.style.display = 'none';
            totalEl.style.display = 'block';
            if (btnTotal) { btnTotal.classList.add('active'); btnDesglose.classList.remove('active'); }
        }
    }

    // Event listeners para toggle de precios (fuera del voucher)
    document.addEventListener('click', e => {
        if (e.target.id === 'btn-view-desglose') showPriceView('breakdown');
        if (e.target.id === 'btn-view-total') showPriceView('total');
    });

    // --- FORMATEO Y UTILIDADES ---
    function formatDate(dateStr) {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function formatCurrency(value, currency = 'COP') {
        const number = parseFloat(String(value).replace(/[^0-9.-]+/g, ""));
        if (isNaN(number) || !String(value).trim()) return '';
        return number.toLocaleString(currency === 'COP' ? 'es-CO' : 'en-US', { style: 'currency', currency, minimumFractionDigits: currency === 'COP' ? 0 : 2, maximumFractionDigits: currency === 'COP' ? 0 : 2 });
    }

    // --- GUARDAR Y CARGAR DESDE FIREBASE ---
    async function saveQuoteToFirestore() {
        const clientName = document.getElementById('nombre-completo').value;
        const quoteNumber = document.getElementById('cotizacion-numero').value;
        
        let destinations = [];
        document.querySelectorAll('.hotel-form-wrapper').forEach(w => {
            const num = w.id.match(/\d+/)[0];
            destinations.push(document.getElementById(`destino-${num}`).value);
        });
        
        const formData = {};
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            const key = input.id || input.name;
            if (!key) return; // Ignore inputs without id or name
            if (input.type === 'checkbox') formData[key] = input.checked;
            else formData[key] = input.value;
        });
        
        formData.pastedImages = pastedImages;

        const quoteDoc = {
            asesorId: currentUser,
            cliente: clientName,
            numero: quoteNumber,
            destinosResumen: destinations.join(', ') || 'Varios',
            timestamp: Date.now(),
            estado: 'Pendiente',
            formData: formData
        };

        const payloadSize = JSON.stringify(quoteDoc).length;
        if (payloadSize > 1000000) {
            alert("⚠️ La cotización tiene demasiadas imágenes o son muy pesadas (" + Math.round(payloadSize/1000) + "KB). Hemos intentado comprimirlas, pero por favor elimina una o dos fotos e intenta de nuevo.");
            return false;
        }

        try {
            if (currentEditQuoteId) {
                const { error } = await db.from('cotizaciones_vam').update(quoteDoc).eq('id', currentEditQuoteId);
                if (error) throw error;
            } else {
                const { data, error } = await db.from('cotizaciones_vam').insert([quoteDoc]).select();
                if (error) throw error;
                currentEditQuoteId = data[0].id;
            }
            console.log("Cotización guardada exitosamente en Supabase");
            return true;
        } catch(error) {
            console.error("Error guardando cotización:", error);
            if (window.location.protocol === 'file:') {
                console.warn("Modo local detectado. Continuando sin guardar en DB.");
                return true;
            }
            alert("Hubo un error guardando la cotización. Revisa tu conexión a internet.");
            return false;
        }
    }

    function openQuoteForEdit(id, data) {
        currentEditQuoteId = id;
        initializeForm();
        
        const fd = data.formData;
        
        let hotelNums = [];
        Object.keys(fd).forEach(k => {
            if (k.startsWith('destino-')) hotelNums.push(parseInt(k.split('-')[1]));
        });
        
        hotelNums.sort((a,b)=>a-b).forEach(num => {
            hotelCounter = num - 1;
            addSection('hotel');
        });
        
        if (fd['flight-1-airline']) addSection('flights');
        if (fd['tour-1-name']) addSection('tours');
        if (fd['transfer-1-desc']) addSection('transfers');
        if (fd['insurance-name']) addSection('insurance');

        Object.keys(fd).forEach(key => {
            if (key === 'pastedImages') {
                pastedImages = fd[key];
                Object.keys(pastedImages).forEach(imgId => {
                    const pasteArea = document.querySelector(`[data-img-id="${imgId}"]`);
                    if (pasteArea) {
                        const previewImg = pasteArea.querySelector('img');
                        previewImg.src = pastedImages[imgId];
                        previewImg.style.display = 'block';
                        pasteArea.querySelector('.remove-img-btn').style.display = 'flex';
                        pasteArea.querySelector('p').style.display = 'none';
                    }
                });
                return;
            }
            const el = document.getElementById(key);
            if(el) {
                if (el.type === 'checkbox') {
                    el.checked = fd[key] === 'true' || fd[key] === true;
                } else {
                    el.value = fd[key];
                }
            }
        });

        ninosSelect.dispatchEvent(new Event('change'));
        
        document.getElementById('cotizacion-numero').value = data.numero || generateQuoteNumber();
        
        dashboardSection.style.display = 'none';
        formTitleSection.style.display = 'block';
        formSection.style.display = 'block';
        window.scrollTo(0,0);
        
        calculateTotals();
    }

    function duplicateQuote(data) {
        currentEditQuoteId = null;
        openQuoteForEdit(null, data);
        document.getElementById('cotizacion-numero').value = generateQuoteNumber();
    }

    // --- GENERACIÓN DEL VOUCHER ---
    function populateQuote() {
        const advisor = ADVISORS[currentUser];
        const clientName = document.getElementById('nombre-completo').value;
        const quoteNumber = document.getElementById('cotizacion-numero').value;
        const adults = document.getElementById('adultos').value;
        const children = document.getElementById('ninos').value;

        document.getElementById('confirm-intro-text').textContent = `¡Hola, ${clientName.split(' ')[0].toUpperCase()}! He preparado estas opciones para tu próximo viaje.`;

        const customerBox = document.getElementById('confirm-customer-data-box');
        
        let checkInVal = document.getElementById(`fecha-viaje-1`) ? document.getElementById(`fecha-viaje-1`).value : '';
        let checkOutStr = '';
        let habitacionStr = '';
        let nochesStr = '';
        let regimenStr = '';
        let destinoStr = document.getElementById(`destino-1`) ? document.getElementById(`destino-1`).value : '';
        
        if (checkInVal && document.getElementById(`cantidad-noches-1`)) {
            const noches = parseInt(document.getElementById(`cantidad-noches-1`).value, 10) || 0;
            const checkInDate = new Date(checkInVal + 'T00:00:00');
            const checkOutDate = new Date(checkInDate);
            checkOutDate.setDate(checkOutDate.getDate() + noches);
            checkOutStr = formatDate(checkOutDate.toISOString().split('T')[0]);
            
            nochesStr = document.getElementById(`cantidad-noches-1`).options[document.getElementById(`cantidad-noches-1`).selectedIndex].text;
            habitacionStr = document.getElementById(`cantidad-habitaciones-1`).options[document.getElementById(`cantidad-habitaciones-1`).selectedIndex].text;
            regimenStr = REGIMEN_TEMPLATES[document.getElementById(`regimen-1`).value] || 'No especificado';
        }
        
        let extraInfo = '';
        if(checkInVal) {
            extraInfo = `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 0.95em;">
                         <p style="margin: 4px 0;">Destino: <strong>${destinoStr}</strong></p>
                         <p style="margin: 4px 0;">Check-In: <strong>${formatDate(checkInVal)}</strong> | Check-Out: <strong>${checkOutStr}</strong></p>
                         <p style="margin: 4px 0;">Noches: <strong>${nochesStr}</strong> | Habitaciones: <strong>${habitacionStr}</strong></p>
                         <p style="margin: 4px 0;">Plan Incluye: <strong>${regimenStr}</strong></p>
                         </div>`;
        }

        customerBox.innerHTML = `<p>Para: <strong>${clientName.toUpperCase()}</strong></p><p>Pasajeros: <strong>${adults} Adulto${adults > 1 ? 's' : ''}${children > 0 ? ` y ${children} Niño${children > 1 ? 's' : ''}` : ''}</strong></p><p>Nº Cotización: <strong>${quoteNumber}</strong> | Validez: <strong>${document.getElementById('validez-cupos').value}</strong></p>${extraInfo}`;

        document.getElementById('advisor-photo').src = advisor.photoUrl;
        document.getElementById('advisor-name').textContent = advisor.name;

        const whatsappLink = `https://wa.me/${CORPORATE_WPP}`;
        const whatsappLinksIds = ['advisor-whatsapp-btn', 'cta-reservar', 'cta-contactar', 'footer-wpp-link'];
        whatsappLinksIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const baseText = id === 'cta-reservar' ? `¡Hola ${advisor.name}! Estoy listo para reservar según la cotización *${quoteNumber}*.` : `Hola ${advisor.name}, tengo una pregunta sobre la cotización *${quoteNumber}*.`;
                el.href = `${whatsappLink}?text=${encodeURIComponent(baseText)}`;
            }
        });

        confirmationComponentsContainer.innerHTML = '';

        // HOTELES
        const hotelForms = document.querySelectorAll('.hotel-form-wrapper');
        hotelForms.forEach((form, index) => {
            const num = form.id.match(/\d+/)[0];
            let galleryHTML = [1, 2, 3].map(i => pastedImages[`hotel-${num}-foto-${i}`] ? `<img src="${pastedImages[`hotel-${num}-foto-${i}`]}">` : '').join('');
            
            confirmationComponentsContainer.innerHTML += `
                <div class="quote-option-box">
                    <div class="option-header"><h3>🏨 Opción de Hotel ${index + 1}</h3></div>
                    <div class="option-body">
                        <h4>${document.getElementById(`hotel-${num}`).value}</h4>
                        <div class="photo-gallery">${galleryHTML || '<p>No se añadieron imágenes.</p>'}</div>
                    </div>
                </div>`;
        });

        // VUELOS
        if (document.getElementById('flights-form-wrapper')) {
            const departureCity = document.getElementById('ciudad-salida').value;
            let optionsHTML = [1, 2].map(i => {
                const wrapper = document.getElementById(`flight-${i}-form-wrapper`);
                if ((i === 1 || (wrapper && wrapper.style.display !== 'none')) && document.getElementById(`flight-${i}-airline`)) {
                    const airline = document.getElementById(`flight-${i}-airline`).value; 
                    const priceAd = document.getElementById(`flight-${i}-price`).value;
                    const priceCh = document.getElementById(`flight-${i}-price-child`)?.value;
                    
                    if (airline && priceAd) {
                        return `<div style="display:flex; justify-content:space-between; align-items:center; padding: 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 8px; border: 1px solid #e2e8f0;">
                                    <div>
                                        <strong style="color: #1e293b; font-size: 14px;">Opción ${i}: ${airline}</strong>
                                        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Salida desde ${departureCity}</div>
                                    </div>
                                </div>`;
                    }
                } return '';
            }).join('');

            confirmationComponentsContainer.innerHTML += `
                <div class="component-section" style="overflow: hidden; padding: 0; border: none; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-radius: 12px;">
                    <h3 style="margin: 0; padding: 15px 20px; font-size: 18px; display:flex; align-items:center; gap: 8px; border-radius: 12px 12px 0 0;">
                        ✈️ Vuelos Sugeridos
                    </h3>
                    ${pastedImages['flight-banner-preview'] ? `<div style="background: #202124; padding: 0;"><img src="${pastedImages['flight-banner-preview']}" style="width:100%; height:auto; display:block;"></div>` : ''}
                    <div id="flight-options-confirm-container" style="padding: 20px; background: white;">
                        ${optionsHTML}
                        <p class="item-disclaimer" style="margin: 15px 0 0 0; font-size:12px; color:#94a3b8; text-align:center;">*Valores informativos, sujetos a cambio sin previo aviso por parte de la aerolínea.</p>
                    </div>
                </div>`;
        }

        // TOURS Y TRASLADOS
        ['tours', 'transfers'].forEach(type => {
            if (document.getElementById(`${type}-form-wrapper`)) {
                const imgHTML = pastedImages[`${type.slice(0, -1)}-main-photo`] ? `<div class="single-photo-container"><img src="${pastedImages[`${type.slice(0, -1)}-main-photo`]}" style="width:100%;border-radius:12px;"></div>` : '';
                const nameKey = type === 'tours' ? 'name' : 'desc';
                const desc = document.getElementById(`${type.slice(0, -1)}-1-${nameKey}`).value;
                confirmationComponentsContainer.innerHTML += `
                    <div class="component-section">
                        <h3>${type === 'tours' ? '🗺️ Tours Opcionales' : '🚐 Traslados'}</h3>
                        <div class="option-body">
                            ${imgHTML}
                            <div class="item-option">${desc}</div>
                        </div>
                    </div>`;
            }
        });

        // SEGUROS
        if (document.getElementById('insurance-form-wrapper')) {
            const name = document.getElementById('insurance-name').value;
            const coverage = document.getElementById('insurance-coverage').value;
            const price = document.getElementById('insurance-price').value;
            const details = document.getElementById('insurance-details').value;
            confirmationComponentsContainer.innerHTML += `
                <div class="component-section" style="background-color:#f0fdf4; border:1px solid #bbf7d0;">
                    <h3>🛡️ Seguro de Viaje Recomendado</h3>
                    <div class="option-body">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <h4 style="margin:0; color:#166534;">${name}</h4>
                        </div>
                        <p style="margin:0 0 10px 0;"><strong>Cobertura:</strong> ${coverage}</p>
                        <p style="margin:0; font-size:13px; color:#333;"><strong>Incluye:</strong> ${details}</p>
                    </div>
                </div>`;
        }

        const globalInput = document.getElementById('global-total');
        const confirmTotalViajeEl = document.getElementById('confirm-total-viaje');
        if (confirmTotalViajeEl) {
            confirmTotalViajeEl.textContent = globalInput?.value || globalInput?.dataset?.calculated || '';
        }
        
        // El confirmador de VUELTA AL MUNDO TOURS necesita estos campos, si no están, se puede omitir o dejar vacío
        const pagoReservaEl = document.getElementById('pago-reserva');
        const confirmPagoReserva = document.getElementById('confirm-pago-reserva');
        if(pagoReservaEl && confirmPagoReserva) confirmPagoReserva.textContent = formatCurrency(pagoReservaEl.value);
        
        const pagoSegundoEl = document.getElementById('pago-segundo');
        const confirmPagoSegundo = document.getElementById('confirm-pago-segundo');
        if(pagoSegundoEl && confirmPagoSegundo) confirmPagoSegundo.textContent = formatCurrency(pagoSegundoEl.value);
        
        // CALCULO DE OPCION 2 (CON TIQUETES)
        let flightTotal = 0;
        const flight1Ad = document.getElementById('flight-1-price') ? parseInt(document.getElementById('flight-1-price').value.replace(/\D/g, ''), 10) : 0;
        const flight1Ch = document.getElementById('flight-1-price-child') ? parseInt(document.getElementById('flight-1-price-child').value.replace(/\D/g, ''), 10) : 0;
        if (!isNaN(flight1Ad)) flightTotal += flight1Ad;
        if (!isNaN(flight1Ch)) flightTotal += flight1Ch;
        
        const opt2Box = document.getElementById('payment-option-2');
        if (flightTotal > 0 && pagoReservaEl && opt2Box) {
            opt2Box.style.display = 'block';
            const pagoReservaVal = parseInt(pagoReservaEl.value.replace(/\D/g, ''), 10) || 0;
            const confirmOp2Reserva = document.getElementById('confirm-pago-reserva-op2');
            if (confirmOp2Reserva) confirmOp2Reserva.textContent = formatCurrency((pagoReservaVal + flightTotal).toString());
            
            const confirmOp2Segundo = document.getElementById('confirm-pago-segundo-op2');
            if (confirmOp2Segundo && pagoSegundoEl) confirmOp2Segundo.textContent = formatCurrency(pagoSegundoEl.value);
        } else if (opt2Box) {
            opt2Box.style.display = 'none';
        }
        
        const fechaLimiteEl = document.getElementById('fecha-limite-pago');
        const confirmFechaLimite = document.getElementById('confirm-fecha-limite');
        if(fechaLimiteEl && confirmFechaLimite) confirmFechaLimite.textContent = fechaLimiteEl.value;
        
        const noIncluyeEl = document.getElementById('no-incluye');
        if(noIncluyeEl) document.getElementById('confirm-no-incluye').textContent = noIncluyeEl.value;

        // INYECCIÓN DE LA BARRA DE PAGOS (SOLO GRUPOS / TOTAL PERSONALIZADO)
        const isGroupBooking = document.getElementById('is-group-booking')?.checked;
        const paymentBar = document.getElementById('group-payment-bar');
        
        if (isGroupBooking && paymentBar) {
            const globalTotal = globalInput?.value || globalInput?.dataset?.calculated || '';
            const globalMessage = document.getElementById('global-message')?.value || '';
            
            paymentBar.style.display = 'flex';
            paymentBar.innerHTML = `
                <div class="payment-step" style="text-align: center; width: 100%;">
                    <span style="font-size: 16px;">Total Global de la Reserva:</span>
                    <h3 style="font-size: 28px; margin-top: 5px;">${globalTotal}</h3>
                    ${globalMessage ? `<p style="margin-top: 10px; font-size: 14px; opacity: 0.9;">${globalMessage}</p>` : ''}
                </div>
            `;
            
            // Ocultar la tabla de pagos detallada si hay un Total Global personalizado
            const summaryTable = document.querySelector('.summary-table-container');
            if (summaryTable) summaryTable.style.display = 'none';
        } else if (paymentBar) {
            paymentBar.style.display = 'none';
        }

        const adultsNum = adults || 1;
        const childrenNum = children || 0;
        const breakdown = buildPriceBreakdown(adultsNum, childrenNum);
        renderPriceBreakdown(breakdown, adultsNum, childrenNum);
        showPriceView('breakdown');

        // TÉRMINOS Y CONDICIONES
        let termsHTML = '';
        if (document.querySelector('.hotel-form-wrapper')) termsHTML += TERMS_AND_CONDITIONS.hotels;
        if (document.getElementById('flights-form-wrapper')) termsHTML += TERMS_AND_CONDITIONS.flights;
        if (document.getElementById('transfers-form-wrapper')) termsHTML += TERMS_AND_CONDITIONS.transfers;
        
        const termsContainer = document.getElementById('terms-section-confirm');
        if (termsHTML) {
            document.getElementById('confirm-terms-content').innerHTML = termsHTML;
            termsContainer.style.display = 'block';
        } else {
            termsContainer.style.display = 'none';
        }
    }

    function validateForm() {
        if (!form.checkValidity()) {
            form.reportValidity();
            alert('Por favor, completa todos los campos obligatorios.');
            return false;
        }
        if (dynamicComponentsContainer.children.length === 0) {
            alert('Debes añadir al menos un componente.');
            return false;
        }
        return true;
    }

    form.addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        if (!validateForm()) return; 
        
        document.getElementById('loader-overlay').style.display = 'flex';
        document.getElementById('loader-text').textContent = "Guardando en la nube...";

        // Guardar primero
        const success = await saveQuoteToFirestore();
        document.getElementById('loader-overlay').style.display = 'none';
        if (!success) return;

        populateQuote(); 
        formTitleSection.style.display = 'none'; 
        formSection.style.display = 'none'; 
        confirmationSection.style.display = 'block'; 
        window.scrollTo(0, 0); 
    });

    // --- PROCESAR PDF ---
    async function processQuote() {
        loaderOverlay.style.display = 'flex';
        const processQuoteBtn = document.getElementById('process-quote-btn');
        processQuoteBtn.disabled = true;
        try {
            const elementToPrint = document.getElementById('voucher-to-print');
            const canvas = await html2canvas(elementToPrint, { scale: 2, useCORS: false, logging: false, ignoreElements: (el) => el.src && typeof el.src === 'string' && el.src.includes('bold.co') });
            const pdf = new window.jspdf.jsPDF({ orientation: 'p', unit: 'px', format: [canvas.width, canvas.height] });
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, canvas.width, canvas.height);
            
            const scaleFactor = canvas.width / elementToPrint.offsetWidth;
            document.querySelectorAll('.pdf-link').forEach(element => {
                if (!element || !element.href) return;
                const rect = element.getBoundingClientRect(); const containerRect = elementToPrint.getBoundingClientRect();
                pdf.link((rect.left - containerRect.left) * scaleFactor, (rect.top - containerRect.top) * scaleFactor, rect.width * scaleFactor, rect.height * scaleFactor, { url: element.href });
            });
            
            pdf.save(`Cotizacion_${document.getElementById('cotizacion-numero').value}_${document.getElementById('nombre-completo').value.replace(/ /g, '_')}.pdf`);
            alert("¡ÉXITO!\n\nLa cotización ha sido descargada.");
            
        } catch (error) { 
            console.error("Error en el proceso:", error); 
            if (window.location.protocol === 'file:') {
                alert("Aviso Local: Los navegadores bloquean la creación del PDF por seguridad (Tainted Canvas). Usa Guardar como PDF (Ctrl+P / Cmd+P) de tu navegador para descargarlo ahora.");
                window.print();
            } else {
                alert(`Hubo un error al generar PDF: ${error.message}`); 
            }
        } finally { 
            loaderOverlay.style.display = 'none'; 
            processQuoteBtn.disabled = false; 
        }
    }

    document.getElementById('process-quote-btn').addEventListener('click', processQuote);
    
    document.getElementById('new-quote-btn').addEventListener('click', () => { 
        confirmationSection.style.display = 'none'; 
        formTitleSection.style.display = 'block'; 
        formSection.style.display = 'block'; 
        initializeForm(); 
        window.scrollTo(0, 0); 
    });

    document.getElementById('edit-quote-btn').addEventListener('click', () => {
        confirmationSection.style.display = 'none';
        formTitleSection.style.display = 'block';
        formSection.style.display = 'block';
        window.scrollTo(0, 0); 
    });

    // --- GENERAR DOSSIER IMPRIMIBLE ---
    function populatePrintDossier() {
        const advisor = ADVISORS[currentUser];
        const clientName = document.getElementById('nombre-completo').value;
        const quoteNumber = document.getElementById('cotizacion-numero').value;
        const validez = document.getElementById('validez-cupos').value;

        // PORTADA
        document.getElementById('print-client-name').textContent = clientName.toUpperCase();
        document.getElementById('print-quote-number').textContent = quoteNumber;
        document.getElementById('print-validez').textContent = validez;
        document.getElementById('print-advisor-name').textContent = advisor.name;
        document.getElementById('print-advisor-wpp').textContent = CORPORATE_WPP;

        const advisorPhotoEl = document.getElementById('print-advisor-photo');
        if (advisorPhotoEl) advisorPhotoEl.src = advisor.photoUrl;

        // SERVICIOS
        const servicesContainer = document.getElementById('print-services-container');
        servicesContainer.innerHTML = '';

        const pageHeader = `<div class="print-page-header"><img src="assets/logo.png" alt="Logo" class="print-header-logo">`;

        // HOTELES
        const hotelForms = document.querySelectorAll('.hotel-form-wrapper');
        hotelForms.forEach((form, index) => {
            const num = form.id.match(/\d+/)[0];
            const hotelName = document.getElementById(`hotel-${num}`).value;
            const destino = document.getElementById(`destino-${num}`).value;
            const fecha = formatDate(document.getElementById(`fecha-viaje-${num}`).value);
            const noches = document.getElementById(`cantidad-noches-${num}`).options[document.getElementById(`cantidad-noches-${num}`).selectedIndex].text;
            const habitaciones = document.getElementById(`cantidad-habitaciones-${num}`).options[document.getElementById(`cantidad-habitaciones-${num}`).selectedIndex].text;
            const regimen = REGIMEN_TEMPLATES[document.getElementById(`regimen-${num}`).value] || 'No especificado';

            let galleryHTML = '';
            const imgs = [1,2,3].map(i => pastedImages[`hotel-${num}-foto-${i}`]).filter(Boolean);
            if (imgs.length) {
                galleryHTML = `<div class="print-gallery">${imgs.map(s => `<img src="${s}">`).join('')}</div>`;
            }

            servicesContainer.innerHTML += `
                <div class="print-page print-service-page">
                    ${pageHeader}<span>🏨 Opción de Hotel ${index + 1}</span></div>
                    <h3 class="print-service-title">${hotelName}</h3>
                    <div class="print-service-body">
                        ${galleryHTML}
                        <div class="print-detail-grid">
                            <div class="print-detail-item"><strong>📍 Destino</strong><span>${destino}</span></div>
                            <div class="print-detail-item"><strong>📅 Fechas</strong><span>${fecha}</span></div>
                            <div class="print-detail-item"><strong>🌙 Noches</strong><span>${noches}</span></div>
                            <div class="print-detail-item"><strong>🛏️ Habitaciones</strong><span>${habitaciones}</span></div>
                        </div>
                        <div class="print-includes-box">
                            <strong>✅ Plan Incluye:</strong>
                            <p>${regimen}</p>
                        </div>
                    </div>
                </div>`;
        });

        // VUELOS
        if (document.getElementById('flights-form-wrapper')) {
            const departureCity = document.getElementById('ciudad-salida').value;
            let flightOptionsHTML = '';
            [1, 2].forEach(i => {
                const wrapper = document.getElementById(`flight-${i}-form-wrapper`);
                if ((i === 1 || (wrapper && wrapper.style.display !== 'none')) && document.getElementById(`flight-${i}-airline`)) {
                    const airline = document.getElementById(`flight-${i}-airline`).value;
                    if (airline) {
                        flightOptionsHTML += `
                            <div class="print-flight-option">
                                <div>
                                    <strong>Opción ${i}: ${airline}</strong>
                                    <div class="sub">Salida desde ${departureCity}</div>
                                </div>
                            </div>`;
                    }
                }
            });

            let flightImgHTML = '';
            if (pastedImages['flight-banner-preview']) {
                flightImgHTML = `<div style="margin-bottom:15px;"><img src="${pastedImages['flight-banner-preview']}" style="width:100%;border-radius:10px;"></div>`;
            }

            servicesContainer.innerHTML += `
                <div class="print-page print-service-page">
                    ${pageHeader}<span>✈️ Vuelos Sugeridos</span></div>
                    <div class="print-service-body">
                        ${flightImgHTML}
                        ${flightOptionsHTML}
                        <p class="print-disclaimer">*Valores informativos, sujetos a cambio sin previo aviso por parte de la aerolínea.</p>
                    </div>
                </div>`;
        }

        // TOURS
        if (document.getElementById('tours-form-wrapper')) {
            const tourName = document.getElementById('tour-1-name').value;
            let tourImgHTML = '';
            if (pastedImages['tour-main-photo']) {
                tourImgHTML = `<div style="margin-bottom:15px;"><img src="${pastedImages['tour-main-photo']}" style="width:100%;border-radius:10px;"></div>`;
            }
            servicesContainer.innerHTML += `
                <div class="print-page print-service-page">
                    ${pageHeader}<span>🗺️ Tours Opcionales</span></div>
                    <div class="print-service-body">
                        ${tourImgHTML}
                        <p>${tourName}</p>
                    </div>
                </div>`;
        }

        // TRASLADOS
        if (document.getElementById('transfers-form-wrapper')) {
            const transferDesc = document.getElementById('transfer-1-desc').value;
            let transferImgHTML = '';
            if (pastedImages['transfer-main-photo']) {
                transferImgHTML = `<div style="margin-bottom:15px;"><img src="${pastedImages['transfer-main-photo']}" style="width:100%;border-radius:10px;"></div>`;
            }
            servicesContainer.innerHTML += `
                <div class="print-page print-service-page">
                    ${pageHeader}<span>🚐 Traslados</span></div>
                    <div class="print-service-body">
                        ${transferImgHTML}
                        <p>${transferDesc}</p>
                    </div>
                </div>`;
        }

        // SEGUROS
        if (document.getElementById('insurance-form-wrapper')) {
            const insName = document.getElementById('insurance-name').value;
            const insCoverage = document.getElementById('insurance-coverage').value;
            const insDetails = document.getElementById('insurance-details').value;
            servicesContainer.innerHTML += `
                <div class="print-page print-service-page">
                    ${pageHeader}<span>🛡️ Seguro de Viaje</span></div>
                    <div class="print-service-body">
                        <div class="print-insurance-box">
                            <h4>${insName}</h4>
                            <p><strong>Cobertura:</strong> ${insCoverage}</p>
                            <p style="margin-top:8px;"><strong>Incluye:</strong> ${insDetails}</p>
                        </div>
                    </div>
                </div>`;
        }

        // RESUMEN DE PAGOS Y DESGLOSE
        const adultsNum = document.getElementById('adultos').value || 1;
        const childrenNum = document.getElementById('ninos').value || 0;
        const breakdown = buildPriceBreakdown(adultsNum, childrenNum);

        const globalInput = document.getElementById('global-total');
        const globalTotal = globalInput?.value || globalInput?.dataset?.calculated || '';
        
        const pagoReservaEl = document.getElementById('pago-reserva');
        const pagoReserva = pagoReservaEl ? formatCurrency(pagoReservaEl.value) : '';
        
        const pagoSegundoEl = document.getElementById('pago-segundo');
        const pagoSegundo = pagoSegundoEl ? formatCurrency(pagoSegundoEl.value) : '';
        
        const fechaLimiteEl = document.getElementById('fecha-limite-pago');
        const fechaLimite = fechaLimiteEl ? fechaLimiteEl.value : '';
        
        const noIncluyeEl = document.getElementById('no-incluye');
        const noIncluye = noIncluyeEl ? noIncluyeEl.value : '';

        if (breakdown.length > 0 || globalTotal) {
            let desgloseHTML = breakdown.map(item => `
                <div class="print-price-item">
                    <span>${item.tipo} - ${item.nombre}</span>
                    <strong>${item.label}</strong>
                </div>
            `).join('');

            servicesContainer.innerHTML += `
                <div class="print-page print-service-page">
                    ${pageHeader}<span>💰 Resumen de Cotización y Pagos</span></div>
                    <div class="print-service-body">
                        <div class="print-breakdown-box">
                            <h4 style="margin: 0 0 10px; font-size: 16px;">Desglose de Servicios</h4>
                            ${desgloseHTML}
                        </div>
                        <div class="print-total-box" style="margin-top: 15px; padding: 15px; background: #0d7377; color: white; border-radius: 8px; text-align: center;">
                            <span style="font-size: 14px; display: block; margin-bottom: 5px;">Total de tu Experiencia:</span>
                            <strong style="font-size: 24px;">${globalTotal}</strong>
                        </div>
                        <div class="print-payments-box" style="margin-top: 20px;">
                            <h4 style="margin: 0 0 10px; font-size: 16px; color: #0d7377;">Plan de Pagos</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <div style="background: #f8fafa; padding: 12px; border-radius: 8px; border: 1px solid #e8e8e8;">
                                    <span style="display: block; font-size: 12px; color: #666;">Valor Prereserva:</span>
                                    <strong style="font-size: 16px;">${pagoReserva}</strong>
                                </div>
                                <div style="background: #f8fafa; padding: 12px; border-radius: 8px; border: 1px solid #e8e8e8;">
                                    <span style="display: block; font-size: 12px; color: #666;">Segundo Pago:</span>
                                    <strong style="font-size: 16px;">${pagoSegundo}</strong>
                                    <span style="display: block; font-size: 11px; color: #999; margin-top: 4px;">Límite: ${fechaLimite}</span>
                                </div>
                            </div>
                        </div>
                        ${noIncluye ? `
                        <div class="print-no-incluye" style="margin-top: 20px; padding: 15px; border: 1px dashed #ccc; border-radius: 8px;">
                            <strong style="color: #d9534f; display: block; margin-bottom: 5px;">⚠️ El plan NO incluye:</strong>
                            <p style="margin: 0; font-size: 12px; white-space: pre-wrap;">${noIncluye}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>`;
        }

        // TÉRMINOS Y CONDICIONES
        let termsHTML = '';
        if (document.querySelector('.hotel-form-wrapper')) termsHTML += TERMS_AND_CONDITIONS.hotels;
        if (document.getElementById('flights-form-wrapper')) termsHTML += TERMS_AND_CONDITIONS.flights;
        if (document.getElementById('transfers-form-wrapper')) termsHTML += TERMS_AND_CONDITIONS.transfers;

        const printTermsPage = document.getElementById('print-terms-page');
        if (termsHTML) {
            document.getElementById('print-terms-content').innerHTML = termsHTML;
            printTermsPage.style.display = 'block';
        } else {
            printTermsPage.style.display = 'none';
        }
    }

    document.getElementById('print-physical-btn').addEventListener('click', () => {
        populatePrintDossier();
        setTimeout(() => { window.print(); }, 300);
    });

});
