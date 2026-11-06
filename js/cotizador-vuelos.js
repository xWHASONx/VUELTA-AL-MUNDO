// js/cotizador-vuelos.js — Puente entre el buscador de Google Flights (vuelos-ui.js, módulo ES)
// y el cotizador clásico (cotizador.js). El cotizador llama a window.VAM_VUELOS cuando existe el bloque de vuelos.
import { iniciarVuelos, itinerarioHtml } from './vuelos-ui.js?v=20261026a';
import { AEROPUERTOS } from './vuelos-api.js?v=20261026a';

const dl = document.getElementById('lista-aeropuertos');
if (dl) dl.innerHTML = AEROPUERTOS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');

window.VAM_VUELOS = {
    instancia: null,
    logos: {},
    itinerarioHtml,
    // Se llama cada vez que el cotizador añade el bloque "Vuelos" (los inputs existen desde ese momento)
    montar(hooks) {
        this.logos = {};
        this.instancia = iniciarVuelos({
            ids: { origen: 'vuelos-origen', destino: 'vuelos-destino', ida: 'vuelos-ida', regreso: 'vuelos-regreso', panel: 'vuelos-panel', referencia: 'vuelos-referencia' },
            pax: hooks.pax,
            fechasPorDefecto: hooks.fechasPorDefecto,
            alElegir: hooks.alElegir,
            alQuitar: hooks.alQuitar,
            aviso: hooks.aviso,
            logos: this.logos
        });
        return this.instancia;
    },
    desmontar() { this.instancia = null; this.logos = {}; }
};
