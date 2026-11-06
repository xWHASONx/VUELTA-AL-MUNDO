// js/registros.js
// Panel (dashboard) compartido para Pre-Reserva y Confirmador: lista los registros guardados
// del asesor, permite buscar, abrirlos para editar, duplicar y eliminar.
// Uso: VAM_REGISTROS.montar({ titulo, nuevoLabel, store, asesorId, alAbrir(row), alNuevo(), alDuplicar(row), tarjeta(row) })

window.VAM_REGISTROS = (function () {
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fecha = v => { if (!v) return ''; const d = new Date(String(v).replace(' ', 'T')); return isNaN(d) ? String(v) : d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }); };

    function montar(op) {
        const sec = document.getElementById('dashboard-section');
        if (!sec) return null;
        const user = VAM_CONFIG.ADVISORS[op.asesorId] || {};
        sec.innerHTML = `
            <header class="header">
                <img src="assets/logo/logo-vertical-blanco.png" alt="Vuelta al Mundo Tours">
                <div class="header-user-info">
                    <a href="hub.html" class="header-link">← Hub</a>
                    <span>Hola, ${esc((user.name || '').split(' ')[0])}</span>
                    <button class="btn-logout" data-logout>Cerrar Sesión</button>
                </div>
            </header>
            <div class="dashboard-header">
                <h2>${esc(op.titulo)}</h2>
                <div class="dashboard-actions">${op.enlaces || ''}<button class="action-button download" data-nuevo>${esc(op.nuevoLabel || '+ Nuevo')}</button></div>
            </div>
            <div class="dashboard-controls">
                <input type="text" data-buscar placeholder="🔍 Buscar por cliente, hotel, destino o localizador...">
                <select data-orden><option value="reciente">🕒 Más recientes primero</option><option value="antiguo">🕒 Más antiguos primero</option><option value="cliente">🔤 Por cliente</option></select>
            </div>
            <div class="plan-banner" data-banner hidden></div>
            <div class="quotes-grid" data-lista></div>`;
        const lista = sec.querySelector('[data-lista]'), buscar = sec.querySelector('[data-buscar]'), orden = sec.querySelector('[data-orden]'), banner = sec.querySelector('[data-banner]');
        sec.querySelector('[data-logout]').addEventListener('click', () => { localStorage.removeItem('vam_user'); window.location.href = 'index.html'; });
        sec.querySelector('[data-nuevo]').addEventListener('click', () => op.alNuevo && op.alNuevo());
        let rows = [];

        function pintar() {
            const t = buscar.value.trim().toLowerCase();
            let r = rows.filter(x => !t || [x.cliente, x.hotel, x.destino, x.localizador].some(v => (v || '').toLowerCase().includes(t)));
            const o = orden.value;
            r.sort((a, b) => o === 'cliente' ? (a.cliente || '').localeCompare(b.cliente || '') : o === 'antiguo' ? String(a.created_at).localeCompare(String(b.created_at)) : String(b.created_at).localeCompare(String(a.created_at)));
            lista.innerHTML = '';
            if (!r.length) { lista.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,.8)">${rows.length ? 'Ningún registro coincide con la búsqueda.' : 'Aún no hay registros. Crea el primero con el botón de arriba.'}</p>`; return; }
            r.forEach(row => {
                const card = document.createElement('div'); card.className = 'quote-card';
                card.innerHTML = `
                    <span class="quote-badge">${esc(row.localizador || ('#' + row.id))}</span>
                    <h3>${esc(row.cliente || 'Sin nombre')}</h3>
                    <p>${esc(row.hotel || '')}${row.destino ? ' · ' + esc(row.destino) : ''}</p>
                    ${op.tarjeta ? op.tarjeta(row) : ''}
                    <span class="quote-date">Creado: ${fecha(row.created_at)}</span>
                    <div class="quote-card-actions">
                        <button class="btn-open">✏️ Abrir / editar</button>
                        ${op.alDuplicar ? '<button class="btn-duplicate">📄 Duplicar</button>' : ''}
                        <button class="btn-delete">🗑️</button>
                    </div>`;
                card.addEventListener('click', () => op.alAbrir(row));
                card.querySelector('.btn-open').addEventListener('click', e => { e.stopPropagation(); op.alAbrir(row); });
                const dup = card.querySelector('.btn-duplicate'); if (dup) dup.addEventListener('click', e => { e.stopPropagation(); op.alDuplicar(row); });
                card.querySelector('.btn-delete').addEventListener('click', async e => {
                    e.stopPropagation();
                    if (!confirm(`⚠️ ¿Eliminar el registro de ${row.cliente || 'este cliente'}? Esta acción no se puede deshacer.`)) return;
                    try { await op.store.remove(row.id); rows = rows.filter(x => x.id !== row.id); pintar(); } catch (err) { alert('No se pudo eliminar: ' + err.message); }
                });
                lista.appendChild(card);
            });
        }
        buscar.addEventListener('input', pintar); orden.addEventListener('change', pintar);

        async function cargar() {
            lista.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,.8)">Cargando…</p>';
            try { rows = await op.store.list(op.asesorId); banner.hidden = true; pintar(); }
            catch (e) { banner.hidden = false; banner.textContent = '⚠️ No se pudieron cargar los registros: ' + e.message; lista.innerHTML = ''; }
        }
        return { cargar, mostrar() { sec.style.display = 'block'; cargar(); }, ocultar() { sec.style.display = 'none'; } };
    }
    return { montar };
})();
