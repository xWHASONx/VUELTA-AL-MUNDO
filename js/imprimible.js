/* js/imprimible.js - Imprimible corporativo de la pre-reserva (carta, sin fotos) */

document.addEventListener('DOMContentLoaded', () => {
    const currentUser = localStorage.getItem('vam_user');
    if (!currentUser || !VAM_CONFIG.ADVISORS[currentUser]) {
        localStorage.removeItem('vam_user');
        window.location.href = 'index.html';
        return;
    }
    const advisor = VAM_CONFIG.ADVISORS[currentUser];
    const COMPANY = VAM_CONFIG.COMPANY;
    const dataStatus = document.getElementById('data-status');

    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const nl2br = s => esc(s).replace(/\n/g, '<br>');
    const fmtDate = d => d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

    const esConfirmacion = new URLSearchParams(location.search).get('tipo') === 'confirmacion';
    const backBtn = document.getElementById('back-btn');
    if (esConfirmacion && backBtn) { backBtn.textContent = '← Volver al Confirmador'; backBtn.onclick = () => window.location.href = 'confirmador.html'; }
    let data = null;
    try { data = JSON.parse(localStorage.getItem(esConfirmacion ? 'vam_current_confirmacion' : 'vam_current_prereserva') || 'null'); } catch (e) { }
    if (!data) {
        dataStatus.textContent = esConfirmacion ? '⚠️ No hay datos: genera primero una confirmación' : '⚠️ No hay datos: genera primero una pre-reserva';
        dataStatus.style.color = '#ffb86b';
        data = { nombre: 'Cliente de prueba', documento: '0000000', telefono: '', email: '', direccion: '', destino: 'Destino de prueba', hotel: 'Hotel de prueba', regimen: 'Todo incluido', fechaInput: '2026-12-01', noches: '4', habitaciones: '1', localizador: 'Pendiente', acompanantes: '', observaciones: '', comentarios: '', valorRestante: '0', moneda: 'COP' };
    } else {
        dataStatus.textContent = esConfirmacion ? '✅ Datos de la confirmación cargados' : '✅ Datos de la pre-reserva cargados';
        dataStatus.style.color = '#7ee787';
    }

    const noches = parseInt(data.noches, 10) || 0;
    const checkIn = new Date(data.fechaInput + 'T00:00:00');
    const checkOut = new Date(checkIn); checkOut.setDate(checkOut.getDate() + noches);
    const saldo = data.valorRestante ? `${VAM_MONEY(data.valorRestante, data.moneda || 'COP')} ${data.moneda || 'COP'}` : 'Pendiente';
    const pagado = data.valorPagado ? `${VAM_MONEY(data.valorPagado, data.moneda || 'COP')} ${data.moneda || 'COP'}` : '—';
    const fechaPago = data.fechaPago ? fmtDate(new Date(data.fechaPago + 'T00:00:00')) : '—';
    const hoy = fmtDate(new Date());
    const ref = data.localizador && data.localizador !== 'Pendiente' ? data.localizador : '';

    const header = (kind, sub) => `<div class="doc-header"><img src="assets/logo/logo-horizontal-blanco.png" alt="Vuelta al Mundo Tours"><div class="doc-kind"><h1>${kind}</h1><p>${sub}</p></div></div>`;
    const footer = (n, total) => `<div class="doc-footer"><span><strong>${COMPANY.name}</strong> · NIT ${COMPANY.nit} · RNT ${COMPANY.rnt} · ${COMPANY.address}</span><span class="page-no">${n} / ${total}</span></div>`;
    const acompanantes = (data.acompanantes || '').trim();

    const page1 = `<div class="doc-page">
        ${header(esConfirmacion ? 'Confirmación de reserva' : 'Comprobante de pre-reserva', ref ? `Localizador ${esc(ref)}` : `Emitido el ${hoy}`)}
        <div class="doc-body">
            <div class="doc-meta">
                <div><span>Titular</span><strong>${esc(data.nombre)}</strong></div>
                <div><span>Documento</span><strong>${esc(data.documento)}</strong></div>
                <div><span>Fecha de emisión</span><strong>${hoy}</strong></div>
                <div><span>Asesor</span><strong>${esc(advisor.name)}</strong></div>
                <div><span>WhatsApp</span><strong>${VAM_CONFIG.WPP_DISPLAY}</strong></div>
                <div><span>Localizador</span><strong>${esc(data.localizador || 'Pendiente')}</strong></div>
            </div>
            <div class="doc-section">Reserva</div>
            <table class="doc-table">
                <tr><th>Destino</th><td>${esc(data.destino)}</td></tr>
                <tr><th>Hotel</th><td>${esc(data.hotel)}</td></tr>
                <tr><th>Fechas</th><td>${fmtDate(checkIn)} al ${fmtDate(checkOut)}<span class="sub">${noches + 1} días / ${noches} noche${noches === 1 ? '' : 's'}</span></td></tr>
                <tr><th>Habitaciones</th><td>${esc(data.habitaciones)}</td></tr>
                <tr><th>Plan</th><td>${esc(data.regimen)}</td></tr>
                ${(data.documentos || []).length ? `<tr><th>Documentos</th><td>${data.documentos.map(d => esc(d.titulo)).join(' · ')}<span class="sub">Entregados en formato digital en el comprobante y por correo (${data.documentos.length} archivo${data.documentos.length === 1 ? '' : 's'}).</span></td></tr>` : ''}
            </table>
            ${esConfirmacion
                ? `<div class="doc-saldo doc-pagado"><span>Estado: reserva confirmada y pagada en su totalidad</span><strong>${pagado}</strong></div>
                   <table class="doc-table"><tr><th>Fecha del pago</th><td>${fechaPago}</td></tr><tr><th>Medio de pago</th><td>${esc(data.medioPago || '—')}${data.referenciaPago ? ` · Ref. ${esc(data.referenciaPago)}` : ''}</td></tr></table>`
                : `<div class="doc-saldo"><span>Saldo restante (parte hotelera)</span><strong>${saldo}</strong></div>`}
            <div class="doc-section">Viajeros</div>
            <table class="doc-table">
                <tr><th>Titular</th><td>${esc(data.nombre)} · Doc. ${esc(data.documento)}</td></tr>
                <tr><th>Contacto</th><td>${esc(data.telefono)}${data.email ? ' · ' + esc(data.email) : ''}</td></tr>
                ${data.direccion ? `<tr><th>Dirección</th><td>${esc(data.direccion)}</td></tr>` : ''}
                <tr><th>Acompañantes</th><td>${acompanantes ? nl2br(acompanantes) : 'No se registraron acompañantes.'}</td></tr>
                ${(data.observaciones || '').trim() ? `<tr><th>Notas</th><td>${nl2br(data.observaciones)}</td></tr>` : ''}
                ${(data.comentarios || '').trim() ? `<tr><th>Requerimientos</th><td>${nl2br(data.comentarios)}</td></tr>` : ''}
            </table>
            <div class="doc-contact"><div><strong>Atención al cliente</strong>Lunes a viernes de 9:00 a.m. a 6:00 p.m. · ${COMPANY.email}</div><div class="wa">WhatsApp ${VAM_CONFIG.WPP_DISPLAY}</div></div>
        </div>
        ${footer(1, 2)}
    </div>`;

    const page2 = `<div class="doc-page">
        ${header('Políticas y aceptación', ref ? `Localizador ${esc(ref)}` : esc(data.nombre))}
        <div class="doc-body">
            <div class="doc-legal">${VAM_LEGAL.condicionesVenta}${VAM_LEGAL.cancelaciones}${VAM_LEGAL.responsabilidad}${VAM_LEGAL.infancia}</div>
            <p class="doc-acceptance">Con la firma de este documento, el titular declara haber leído, comprendido y aceptado las políticas de VUELTA AL MUNDO TOURS SAS aquí descritas y las publicadas en ${COMPANY.policiesUrl}, asumiendo las obligaciones de los acompañantes relacionados en la página anterior.</p>
            <div class="doc-signatures">
                <div class="doc-signature"><div class="line"></div><strong>${esc(data.nombre)}</strong>Titular · Doc. ${esc(data.documento)}<br>Fecha: ____________________</div>
                <div class="doc-signature"><div class="line"></div><strong>${esc(advisor.name)}</strong>${esc(advisor.role || 'Asesor')} · ${COMPANY.name}<br>Fecha: ____________________</div>
            </div>
        </div>
        ${footer(2, 2)}
    </div>`;

    document.getElementById('print-document').innerHTML = page1 + page2;
});
