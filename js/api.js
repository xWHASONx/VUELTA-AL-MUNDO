// js/api.js
// Cliente de la API PHP (carpeta api/) alojada en el Hostinger del cliente.
// Si la API no responde (por ejemplo al abrir las herramientas sin servidor PHP),
// las páginas siguen funcionando en "modo local" guardando en el navegador.

window.VAM_API = (function () {
    const base = VAM_CONFIG.API_BASE || 'api/';
    const headers = { 'Content-Type': 'application/json', 'X-VAM-KEY': VAM_CONFIG.API_TOKEN || '' };
    let available = null; // null = sin probar, true/false

    async function request(path, { method = 'GET', body = null, timeout = 60000 } = {}) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeout);
        try {
            const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : null, signal: ctrl.signal, cache: 'no-store' });
            const text = await res.text();
            let data;
            try { data = JSON.parse(text); } catch (e) { throw new Error('La API no devolvió JSON (¿falta PHP o api/config.php?)'); }
            if (!res.ok || data.ok === false) throw new Error(data.error || `Error ${res.status}`);
            return data;
        } finally { clearTimeout(t); }
    }

    // Comprueba una sola vez si la API (y su base de datos) está disponible
    async function ping() {
        if (available !== null) return available;
        try {
            const r = await request('ping.php', { timeout: 6000 });
            available = !!(r.ok && r.db);
            if (r.ok && !r.db) console.warn('API viva pero sin base de datos:', r.db_error);
        } catch (e) {
            available = false;
            console.info('API no disponible, modo local:', e.message);
        }
        return available;
    }

    return {
        ping,
        isAvailable: () => available === true,
        cotizaciones: {
            list: (asesorId) => request(`cotizaciones.php?asesor=${encodeURIComponent(asesorId)}`).then(r => r.data),
            get: (id) => request(`cotizaciones.php?id=${encodeURIComponent(id)}`).then(r => r.data),
            create: (doc) => request('cotizaciones.php', { method: 'POST', body: doc }).then(r => r.id),
            update: (id, patch) => request(`cotizaciones.php?id=${encodeURIComponent(id)}`, { method: 'PUT', body: patch }),
            remove: (id) => request(`cotizaciones.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        },
        prereservas: {
            create: (asesorId, datos, grupo) => request('prereservas.php', { method: 'POST', body: { asesorId, datos, grupo: grupo || null } }).then(r => r.id),
            list: (asesorId) => request(`prereservas.php?asesor=${encodeURIComponent(asesorId)}`).then(r => r.data),
            get: (id) => request(`prereservas.php?id=${encodeURIComponent(id)}`).then(r => r.data),
            update: (id, datos, grupo) => request(`prereservas.php?id=${encodeURIComponent(id)}`, { method: 'PUT', body: { datos, grupo: grupo || null } }),
            remove: (id) => request(`prereservas.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        },
        confirmaciones: {
            create: (asesorId, datos, grupo) => request('confirmaciones.php', { method: 'POST', body: { asesorId, datos, grupo: grupo || null } }).then(r => r.id),
            list: (asesorId) => request(`confirmaciones.php?asesor=${encodeURIComponent(asesorId)}`).then(r => r.data),
            get: (id) => request(`confirmaciones.php?id=${encodeURIComponent(id)}`).then(r => r.data),
            update: (id, datos) => request(`confirmaciones.php?id=${encodeURIComponent(id)}`, { method: 'PUT', body: { datos } }),
            remove: (id) => request(`confirmaciones.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        },
        // Planes precargados creados desde el cotizador (compartidos por toda la agencia)
        planes: {
            list: () => request('planes.php').then(r => r.data),
            get: (id) => request(`planes.php?id=${encodeURIComponent(id)}`).then(r => r.data),
            create: (plan) => request('planes.php', { method: 'POST', body: plan, timeout: 120000 }).then(r => r.id),
            update: (id, patch) => request(`planes.php?id=${encodeURIComponent(id)}`, { method: 'PUT', body: patch }),
            remove: (id) => request(`planes.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        },
        correo: {
            enviar: (payload) => request('correo.php', { method: 'POST', body: payload, timeout: 90000 })
        },
        // Documentos adjuntos (PDF, fotos, Word, Excel) de una pre-reserva
        archivos: {
            listar: (grupo) => request(`archivos.php?grupo=${encodeURIComponent(grupo)}`).then(r => r.data),
            renombrar: (id, titulo) => request(`archivos.php?id=${encodeURIComponent(id)}`, { method: 'PUT', body: { titulo } }).then(r => r.data),
            borrar: (id) => request(`archivos.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
            // Subida con progreso (XMLHttpRequest, porque fetch no informa el avance)
            subir: ({ asesorId, grupo, titulo, file }, onProgress) => new Promise((resolve, reject) => {
                const fd = new FormData();
                fd.append('asesorId', asesorId); fd.append('grupo', grupo); fd.append('titulo', titulo || ''); fd.append('archivo', file, file.name);
                const xhr = new XMLHttpRequest();
                xhr.open('POST', base + 'archivos.php');
                xhr.setRequestHeader('X-VAM-KEY', VAM_CONFIG.API_TOKEN || '');
                xhr.timeout = 180000;
                xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
                xhr.onload = () => {
                    let data; try { data = JSON.parse(xhr.responseText); } catch (e) { return reject(new Error(xhr.status === 413 ? 'El archivo es demasiado grande para el servidor' : 'Respuesta inválida del servidor (' + xhr.status + ')')); }
                    if (xhr.status >= 200 && xhr.status < 300 && data.ok) resolve(data.data); else reject(new Error(data.error || ('Error ' + xhr.status)));
                };
                xhr.onerror = () => reject(new Error('Sin conexión con el servidor'));
                xhr.ontimeout = () => reject(new Error('La subida tardó demasiado'));
                xhr.send(fd);
            })
        }
    };
})();
