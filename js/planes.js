// js/planes.js
// Planes hoteleros precargados de VUELTA AL MUNDO TOURS.
// El asesor elige destino > hotel y el cotizador se abre ya diligenciado.
// Precio: por persona, en COP. Fotos: assets/hoteles/<slug>/1.jpg, 2.jpg, 3.jpg
// (si falta alguna foto se muestra la portada genérica del destino).
//
// Todos los planes: 5 días / 4 noches, 1.990.000 por persona, todo incluido (confirmado por el cliente el 15/09/2026).
// Cuando el cliente confirme sus planes reales, editar aquí (precio, noches, régimen, incluye).

window.VAM_PLANES = {
    precioDefault: 1990000,
    destinos: [
        {
            id: 'punta-cana', nombre: 'Punta Cana', pais: 'República Dominicana', emoji: '🌴',
            hoteles: [
                { slug: 'occidental-caribe',       nombre: 'Occidental Caribe' },
                { slug: 'occidental-punta-cana',   nombre: 'Occidental Punta Cana' },
                { slug: 'explore-turquesa',        nombre: 'Bahia Principe Explore Turquesa' },
                { slug: 'explore-gran-punta-cana', nombre: 'Bahia Principe Explore Punta Cana' },
                { slug: 'vista-sol',               nombre: 'Vista Sol Punta Cana Beach Resort & Spa' },
                { slug: 'whala-bavaro',            nombre: 'whala!bávaro' },
                { slug: 'impressive-punta-cana',   nombre: 'Impressive Punta Cana' }
            ]
        },
        {
            id: 'cancun', nombre: 'Cancún', pais: 'México', emoji: '🏖️',
            hoteles: [
                { slug: 'solymar',             nombre: 'Solymar Cancún Beach Resort' },
                { slug: 'all-ritmo',           nombre: 'All Ritmo Cancún Resort & Waterpark' },
                { slug: 'occidental-tucancun', nombre: 'Occidental Tucancún' },
                { slug: 'costa-cancun',        nombre: 'Occidental Costa Cancún' },
                { slug: 'gr-solaris',          nombre: 'GR Solaris Cancún' }
            ]
        },
        {
            id: 'panama', nombre: 'Panamá Playa y Ciudad', pais: 'Panamá', emoji: '🇵🇦',
            hoteles: [
                { slug: 'gran-evenia-bijao', nombre: 'Gran Evenia Bijao + Hotel Ojos del Río', combo: 'PANAMA', playa: { slug: 'gran-evenia-bijao', nombre: 'Gran Evenia Bijao' } },
                { slug: 'grand-decameron',   nombre: 'Grand Decameron Panamá + Hotel Ojos del Río', combo: 'PANAMA', playa: { slug: 'grand-decameron', nombre: 'Grand Decameron Panamá' } },
                { slug: 'playa-blanca',      nombre: 'Playa Blanca Hotel & Resort + Hotel Ojos del Río', combo: 'PANAMA', playa: { slug: 'playa-blanca', nombre: 'Playa Blanca Hotel & Resort' } }
            ]
        }
    ],
    // Plan combinado de Panamá (lo que la agencia ya vende): 2 noches playa + 2 noches ciudad + tours + traslados
    combos: {
        PANAMA: {
            titulo: 'Panamá combinado + tours',
            ciudad: { slug: 'ojos-del-rio', nombre: 'Hotel Ojos del Río' },
            playaNoches: 2, playaRegimen: 'todo_incluido',
            playaIncluye: 'Hotel 5 estrellas · 2 noches en playa. Desayunos, almuerzos, cenas, snacks, bebidas ilimitadas, actividades y shows.',
            ciudadNoches: 2, ciudadRegimen: 'desayuno',
            ciudadIncluye: 'Hotel 4 estrellas · 2 noches en ciudad. Desayunos, propinas e impuestos.',
            tour: { nombre: 'Gira por la ciudad y Canal de Panamá', desc: 'Recorrido por la ciudad de Panamá y visita al Canal de Panamá. Incluido en el plan.' },
            traslados: { desc: 'Traslados aeropuerto · hotel de playa · hotel de ciudad · aeropuerto', foto: 'assets/planes/traslados-panama.jpg' },
            incluye: 'Alojamiento en acomodación doble, alimentación según hotel, gira por la ciudad, Canal de Panamá, traslados, propinas e impuestos.',
            noIncluye: 'Tiquetes aéreos, seguro de viaje, gastos no especificados en la cotización.'
        }
    },
    // Valores por defecto de todos los planes (se pueden sobreescribir por hotel con las mismas llaves)
    defaults: {
        precioPorPersona: 1990000,
        moneda: 'COP',
        noches: 4,
        habitaciones: 1,
        adultos: 2,
        ninos: 0,
        regimen: 'todo_incluido',
        incluye: '5 días / 4 noches de alojamiento en acomodación doble, plan todo incluido.',
        noIncluye: 'Tiquetes aéreos, traslados, tours, seguro de viaje, gastos no especificados.',
        validez: 'Tarifa sujeta a disponibilidad al momento de la reserva.'
    }
};

// Utilidades
window.VAM_PLANES.buscar = function (slug) {
    for (const d of VAM_PLANES.destinos) {
        const h = d.hoteles.find(x => x.slug === slug);
        if (h) return { destino: d, hotel: Object.assign({}, VAM_PLANES.defaults, h) };
    }
    return null;
};
window.VAM_PLANES.fotos = function (slug) {
    return [1, 2, 3].map(i => `assets/hoteles/${slug}/${i}.jpg`);
};
// Fotos para la tarjeta de un plan (en combos: 2 de playa + 1 de ciudad)
window.VAM_PLANES.fotosPlan = function (h) {
    if (h.combo) { const c = VAM_PLANES.combos[h.combo]; return [`assets/hoteles/${h.playa.slug}/1.jpg`, `assets/hoteles/${h.playa.slug}/2.jpg`, `assets/hoteles/${c.ciudad.slug}/1.jpg`]; }
    return VAM_PLANES.fotos(h.slug);
};
