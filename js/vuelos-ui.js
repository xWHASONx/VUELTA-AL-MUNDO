// vuelos-ui.js — Búsqueda automática en Google Flights + itinerario para el PDF.
// Autocontenido: trae sus propios helpers. Se conecta al formulario con iniciarVuelos(opciones).
//
//   import { iniciarVuelos, itinerarioHtml } from './vuelos-ui.js';
//   const vuelos = iniciarVuelos({
//     ids: { origen:'vuelos-origen', destino:'vuelos-destino', ida:'vuelos-ida', regreso:'vuelos-regreso', panel:'vuelos-panel', referencia:'vuelos-referencia' },
//     pax: () => ({ adultos: 2, ninos: 0 }),                 // pasajeros actuales del formulario
//     fechasPorDefecto: () => ({ ida: '2026-11-15', regreso: '2026-11-19' }),  // opcional: del hotel
//     alElegir: ({ opcion, texto, precioTotal, detalles }) => { /* llenar la opción N del formulario */ },
//     alQuitar: (opcion) => { /* vaciar la opción N */ },
//     aviso: (texto, tipo) => {},                              // opcional
//     logos: {},                                               // objeto donde se guardan logos como dataURL (para el PDF)
//   });
//   // Para el PDF: itinerarioHtml(detalles, opcion, numerar, logos)
import { buscarVuelos, vuelosRegreso, traerLogo } from './vuelos-api.js?v=20260922c';

// ---------- helpers ----------
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dinero = (n) => (Number(n) || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const miles = (n) => Math.round(Number(n) || 0).toLocaleString('es-CO');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const fechaLarga = (iso) => { const d = new Date(String(iso).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? String(iso) : d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); };
const fechaCorta = (iso) => { const d = new Date(String(iso).slice(0, 10) + 'T00:00:00'); return isNaN(d) ? String(iso) : d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }); };
const rebote = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const hhmm = (t) => (t || '').split(' ')[1] || t || '';
const duracion = (m) => m ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : '';
const ICONO_MALETA = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m-8 0h10a2 2 0 012 2v9a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2zm2 0v13m4-13v13"/></svg>';

// Caché 24 h en localStorage: repetir la misma búsqueda no gasta otra consulta de SerpAPI.
const cache = new Map();
function conCache(clave, fn) {
  if (!cache.has(clave)) {
    try { const g = JSON.parse(localStorage.getItem('vuelos:cache:' + clave) || 'null'); if (g && Date.now() - g.t < 86400000) cache.set(clave, Promise.resolve(g.v)); } catch {}
  }
  if (!cache.has(clave)) {
    const pr = fn().then(v => { try { localStorage.setItem('vuelos:cache:' + clave, JSON.stringify({ t: Date.now(), v })); } catch {} return v; });
    pr.catch(() => cache.delete(clave));
    cache.set(clave, pr);
  }
  return cache.get(clave);
}

const CERRAR = `<button type="button" class="vu-btn secundario" data-cerrar-panel style="margin-top:8px">Cerrar</button>`;
const CANCELAR = `<button type="button" class="vu-btn secundario" data-cancelar-vuelos="1">Cancelar</button>`;

function contador(panel) {
  const b = panel.querySelector('.vu-seg'); if (!b) return; const t0 = Date.now();
  const id = setInterval(() => { if (!panel.contains(b)) { clearInterval(id); return; } b.textContent = Math.round((Date.now() - t0) / 1000) + ' s'; }, 500);
}
function enfocar(panel) { try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {} }

export function iniciarVuelos(op) {
  const $ = (k) => document.getElementById(op.ids[k]);
  const aviso = op.aviso || ((t) => console.log(t));
  const logos = op.logos || {};
  let estado = { clave: null, q: null, resultados: null, resultadosIda: null, modo: 'ida', idaElegida: null, referencia: null };
  const detalles = {}; // opcion -> { ida, regreso }

  function datosQ(silencioso) {
    const origen = ($('origen').value || '').trim().toUpperCase(), destino = ($('destino').value || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(origen) || !/^[A-Z]{3}$/.test(destino)) { if (!silencioso) aviso('Escribe los códigos de aeropuerto (3 letras, ej. MDE y PUJ).', 'error'); return null; }
    let ida = $('ida').value, regreso = $('regreso').value;
    if (!ida && op.fechasPorDefecto) { const f = op.fechasPorDefecto() || {}; if (f.ida) { ida = f.ida; $('ida').value = ida; if (!regreso && f.regreso) { regreso = f.regreso; $('regreso').value = regreso; } } }
    if (!ida) { if (!silencioso) aviso('Escribe la fecha de ida.', 'error'); return null; }
    const fechaOk = f => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + 'T00:00:00')) && +f.slice(0, 4) >= 2024;
    if (!fechaOk(ida)) { aviso('La fecha de ida no es válida. Revisa el año.', 'error'); return null; }
    if (regreso && !fechaOk(regreso)) { aviso('La fecha de regreso no es válida. Revisa el año.', 'error'); return null; }
    const hoy = new Date().toISOString().slice(0, 10);
    if (ida < hoy) { aviso('La fecha de ida ya pasó. Elige una fecha futura.', 'error'); return null; }
    if (regreso && regreso < ida) { aviso('La fecha de regreso no puede ser anterior a la de ida.', 'error'); return null; }
    const p = op.pax ? op.pax() : { adultos: 1, ninos: 0 };
    return { origen, destino, ida, regreso: regreso || null, adultos: +p.adultos || 1, ninos: +p.ninos || 0 };
  }
  const paxActual = () => { const p = op.pax ? op.pax() : { adultos: 1, ninos: 0 }; return ((+p.adultos || 0) + (+p.ninos || 0)) || 1; };

  function tarjeta(v, i, lista, q, modo) {
    const pax = paxActual(); const tramos = v.tramos || []; const p = tramos[0], u = tramos[tramos.length - 1];
    const aerolineas = [...new Set(tramos.map(t => t.aerolinea))].join(' + ');
    const escalas = v.escalas?.length ? `${plural(v.escalas.length, 'escala', 'escalas')} (${v.escalas.map(e => `${e.aeropuerto} ${duracion(e.minutos)}`).join(', ')})` : 'Directo';
    return `
    <div class="vuelo ${i === 0 && lista === 'mejores' ? 'mejor' : ''}">
      <div class="vuelo-info">
        ${p?.logo ? `<img src="${esc(p.logo)}" alt="" referrerpolicy="no-referrer">` : ''}
        <div>
          <b>${esc(aerolineas)}</b> <small>${tramos.map(t => esc(t.vuelo || '')).filter(Boolean).join(' · ')}</small>
          <span>${esc(p?.salida?.id || '')} ${hhmm(p?.salida?.hora)} → ${esc(u?.llegada?.id || '')} ${hhmm(u?.llegada?.hora)}${tramos.some(t => t.nocturno) ? ' (+1 día)' : ''} · ${duracion(v.duracionTotal)} · ${escalas}</span>
          ${p?.extras?.length ? `<small>${p.extras.slice(0, 3).map(esc).join(' · ')}</small>` : ''}
        </div>
      </div>
      <div class="vuelo-precio">
        <strong>${v.precio ? dinero(v.precio) : '—'}</strong><small>total ${pax} pax${q.regreso ? ' · ida y vuelta' : ''}</small>
        ${v.precio ? `<em>${dinero(v.precio / pax)} por persona</em>` : ''}
        <div class="vuelo-botones">
          ${modo === 'ida' && q.regreso && v.token ? `<button type="button" class="vu-btn primario" data-regreso-vuelo="${i}" data-lista="${lista}">Elegir esta ida y ver regresos ›</button>` : ''}
          <button type="button" class="vu-btn ${modo === 'ida' && q.regreso && v.token ? 'secundario' : 'primario'}" data-elegir-vuelo="${i}" data-lista="${lista}" data-opcion="1">${modo === 'regreso' ? 'Elegir este regreso → Opción 1' : (q.regreso && v.token ? 'Solo ida → Opción 1' : 'Usar como opción 1')}</button>
          <button type="button" class="vu-btn secundario" data-elegir-vuelo="${i}" data-lista="${lista}" data-opcion="2">${modo === 'regreso' ? '→ Opción 2' : (q.regreso && v.token ? 'Solo ida → Opción 2' : 'Opción 2')}</button>
        </div>
      </div>
    </div>`;
  }
  function pintar(r, q, modo) {
    const panel = $('panel'); const total = (r.mejores?.length || 0) + (r.otros?.length || 0);
    setTimeout(() => enfocar(panel), 50);
    if (!total) { panel.innerHTML = `<div class="nota">Google no muestra vuelos para esa ruta y fechas. Revisa los códigos o prueba otra fecha.</div>${CERRAR}`; return; }
    const pax = paxActual();
    panel.innerHTML = `
    <div class="comparacion-cab"><b>${modo === 'regreso' ? `Regreso ${q.destino} → ${q.origen} · ${fechaCorta(q.regreso)}` : `${q.origen} → ${q.destino} · ${fechaCorta(q.ida)}${q.regreso ? ` → ${fechaCorta(q.regreso)}` : ' · solo ida'}`} · ${pax} pax</b>${r.nivelPrecio ? `<span class="etiqueta ${r.nivelPrecio === 'low' ? 'ok' : r.nivelPrecio === 'high' ? 'pendiente' : ''}">precio ${r.nivelPrecio === 'low' ? 'bajo' : r.nivelPrecio === 'high' ? 'alto' : 'típico'} para la ruta</span>` : ''}</div>
    ${modo === 'regreso' && estado.idaElegida ? `<div class="nota ok" style="margin-bottom:10px"><span>✓</span><div>Ida elegida: <b>${esc(estado.idaElegida.texto)}</b>. Ahora elige el regreso.</div><button type="button" class="vu-btn secundario" data-ver-vuelos="1" style="margin-left:auto">‹ Cambiar ida</button></div>` : ''}
    ${r.mejores?.length ? `<p class="ayuda" style="margin:0 0 6px"><b>Mejores según Google</b> (precio, duración y escalas)</p><div class="vuelos">${r.mejores.map((v, i) => tarjeta(v, i, 'mejores', q, modo)).join('')}</div>` : ''}
    ${r.otros?.length ? `<p class="ayuda" style="margin:10px 0 6px">Otras opciones</p><div class="vuelos">${r.otros.slice(0, 5).map((v, i) => tarjeta(v, i, 'otros', q, modo)).join('')}</div>` : ''}
    ${r.rangoTipico ? `<p class="ayuda" style="margin-top:8px">Rango típico de Google para esta ruta: ${dinero(r.rangoTipico[0])} – ${dinero(r.rangoTipico[1])} (total ${pax} pax).</p>` : ''}
    ${CERRAR}`;
  }
  async function buscar() {
    const q = datosQ(true); if (!q) return;
    const clave = `vuelos|${q.origen}|${q.destino}|${q.ida}|${q.regreso || ''}|${q.adultos}|${q.ninos}`;
    if (estado.clave === clave) return;
    estado = { ...estado, clave, q, modo: 'ida', idaElegida: null };
    const panel = $('panel'); panel.hidden = false;
    panel.innerHTML = `<div class="panel-cargando"><div class="spinner"></div> <span>Buscando ${q.origen} → ${q.destino} en Google Flights… <small>(suele tardar 2 a 10 segundos)</small> <b class="vu-seg">0 s</b></span> ${CANCELAR}</div>`;
    contador(panel);
    enfocar(panel);
    try {
      const r = await conCache(clave, () => buscarVuelos(q));
      if (estado.clave !== clave) return;
      estado.resultados = r; estado.resultadosIda = r; pintar(r, q, 'ida');
    } catch (err) { estado.clave = null; panel.innerHTML = `<div class="nota"><span>⚠️</span><div><b>No se pudo buscar.</b> ${esc(err.message)}</div></div>${CERRAR}`; }
  }
  const textoVuelo = (v) => { const t = v.tramos || []; const p = t[0], u = t[t.length - 1]; return `${[...new Set(t.map(x => x.aerolinea))].join(' + ')} ${p?.salida?.id || ''} ${hhmm(p?.salida?.hora)} → ${u?.llegada?.id || ''} ${hhmm(u?.llegada?.hora)} · ${v.escalas?.length ? plural(v.escalas.length, 'escala', 'escalas') : 'directo'}`; };
  async function verRegresos(lista, i) {
    const v = estado.resultados?.[lista]?.[i]; if (!v?.token) return;
    const q = estado.q; const panel = $('panel');
    estado.idaElegida = { vuelo: v, texto: textoVuelo(v) };
    panel.innerHTML = `<div class="panel-cargando"><div class="spinner"></div> <span>Ida elegida: <b>${esc(estado.idaElegida.texto)}</b><br>Buscando vuelos de regreso para esa ida… <small>(suele tardar 5 a 10 segundos)</small> <b class="vu-seg">0 s</b></span> ${CANCELAR}</div>`;
    contador(panel);
    enfocar(panel);
    try {
      const r = await conCache(`regreso|${v.token}|${q.regreso}`, () => vuelosRegreso({ ...q, token: v.token }));
      if (estado.clave === 'cancelada') return;
      estado.resultados = r; estado.modo = 'regreso'; pintar(r, q, 'regreso');
    } catch (err) { panel.innerHTML = `<div class="nota"><span>⚠️</span><div><b>No se pudo buscar el regreso.</b> ${esc(err.message)}</div></div>${CERRAR}`; }
  }
  const resumen = (v, fecha) => ({
    fecha, minutos: v.duracionTotal || null,
    tramos: (v.tramos || []).map(t => ({ salida: t.salida?.id || '', salidaNombre: t.salida?.nombre || '', horaSalida: hhmm(t.salida?.hora), llegada: t.llegada?.id || '', llegadaNombre: t.llegada?.nombre || '', horaLlegada: hhmm(t.llegada?.hora), aerolinea: t.aerolinea || '', logo: t.logo || '', vuelo: t.vuelo || '', minutos: t.minutos || null, nocturno: !!t.nocturno })),
    escalas: (v.escalas || []).map(e => ({ aeropuerto: e.aeropuerto || '', nombre: e.nombre || '', minutos: e.minutos || null })),
    equipaje: [...new Set((v.tramos || []).flatMap(t => t.extras || []).filter(x => /equipaje|maleta|bag|carry|checked/i.test(x)))]
  });
  function elegir(lista, i, opcion) {
    const v = estado.resultados?.[lista]?.[i]; if (!v) return;
    const q = estado.q; const pax = paxActual();
    const det = estado.modo === 'regreso' && estado.idaElegida
      ? { ida: resumen(estado.idaElegida.vuelo, q.ida), regreso: resumen(v, q.regreso) }
      : { ida: resumen(v, q.ida), regreso: null, idaVuelta: !!q.regreso };
    detalles[opcion] = det;
    [...(det.ida?.tramos || []), ...(det.regreso?.tramos || [])].forEach(t => { if (t.logo && !logos[`logo-${t.aerolinea}`]) traerLogo(t.logo).then(d => { logos[`logo-${t.aerolinea}`] = d; }).catch(() => {}); });
    const texto = estado.modo === 'regreso' && estado.idaElegida ? `Ida: ${estado.idaElegida.texto} · Regreso: ${textoVuelo(v)}` : `${textoVuelo(v)}${q.regreso ? ' · ida y vuelta' : ''}`;
    estado.referencia = { opcion, precioTotal: v.precio || null, precioPersona: v.precio ? v.precio / pax : null, pax, fecha: new Date().toISOString(), texto };
    pintarReferencia();
    $('panel').hidden = true;
    op.alElegir && op.alElegir({ opcion, texto, precioTotal: v.precio || 0, precioPersona: v.precio ? v.precio / pax : 0, detalles: det, origen: q.origen });
    aviso(`Opción ${opcion} llenada con ${estado.modo === 'regreso' ? 'ida y regreso' : 'el vuelo'} elegido. Ajusta el precio si vendes con otro valor.`, 'ok');
  }
  function pintarReferencia() {
    const et = $('referencia'); if (!et) return; const r = estado.referencia;
    if (!r) { et.hidden = true; et.innerHTML = ''; return; }
    et.hidden = false; et.className = 'referencia-vuelos';
    et.innerHTML = `<span class="etiqueta ok">Google Flights: ${r.precioTotal ? dinero(r.precioTotal) : '—'} (${r.pax} pax) · opción ${r.opcion}</span>
      <button type="button" class="vu-btn secundario" data-ver-vuelos="1">Ver vuelos</button>
      <button type="button" class="vu-btn peligro" data-quitar-vuelo="${r.opcion}">Quitar elegido</button>
      <div class="nota ok" style="width:100%;margin-top:6px"><span>✓</span><div><b>Opción de vuelo ${r.opcion} llena</b> con ${esc(r.texto)}${r.precioPersona ? ` · <b>${dinero(Math.round(r.precioPersona))} por persona</b>` : ''}. Revísala abajo en "Opción de vuelo ${r.opcion}"; el precio se puede ajustar.</div></div>`;
  }

  // Eventos
  const auto = rebote(buscar, 900);
  ['origen', 'destino', 'ida', 'regreso'].forEach(k => { $(k).addEventListener('input', auto); $(k).addEventListener('change', auto); });
  document.addEventListener('click', e => {
    const raiz = $('panel')?.closest('form') || document;
    if (!raiz.contains(e.target)) return;
    const c = e.target.closest('[data-cancelar-vuelos]'); if (c) { estado.clave = 'cancelada'; $('panel').hidden = true; return; }
    const x = e.target.closest('[data-cerrar-panel]'); if (x && $('panel').contains(x)) { $('panel').hidden = true; return; }
    const r = e.target.closest('[data-regreso-vuelo]'); if (r) { verRegresos(r.dataset.lista, +r.dataset.regresoVuelo); return; }
    const el = e.target.closest('[data-elegir-vuelo]'); if (el) { elegir(el.dataset.lista, +el.dataset.elegirVuelo, +el.dataset.opcion); return; }
    const ver = e.target.closest('[data-ver-vuelos]'); if (ver) { if (estado.resultadosIda && estado.q) { estado.modo = 'ida'; estado.resultados = estado.resultadosIda; $('panel').hidden = false; pintar(estado.resultadosIda, estado.q, 'ida'); } else { estado.clave = null; buscar(); } return; }
    const qv = e.target.closest('[data-quitar-vuelo]'); if (qv) { const o = +qv.dataset.quitarVuelo; delete detalles[o]; estado.referencia = null; pintarReferencia(); op.alQuitar && op.alQuitar(o); estado.clave = null; buscar(); }
  });

  return {
    detalles,                              // { 1: {ida, regreso}, 2: … } para guardar con la cotización y pintar el PDF
    referencia: () => estado.referencia,   // precio de Google elegido (privado)
    restaurar: (det, ref) => { Object.assign(detalles, det || {}); estado.referencia = ref || null; estado.clave = 'cargada'; pintarReferencia(); },
    rebuscar: () => { estado.clave = null; buscar(); }
  };
}

// ---------- Itinerario para el PDF ----------
function tramoHtml(t, titulo, logos) {
  const p = t.tramos[0], u = t.tramos[t.tramos.length - 1]; if (!p) return '';
  const aerolineas = [...new Set(t.tramos.map(x => x.aerolinea).filter(Boolean))];
  const imgs = aerolineas.map(a => logos?.[`logo-${a}`] ? `<img src="${logos[`logo-${a}`]}" alt="">` : '').join('');
  const escalas = t.escalas.length ? `${plural(t.escalas.length, 'escala', 'escalas')}: ${t.escalas.map(e => `${esc(e.aeropuerto)}${e.minutos ? ` (${duracion(e.minutos)} de espera)` : ''}`).join(', ')}` : 'Vuelo directo';
  const fecha = fechaLarga(t.fecha);
  return `
    <div class="itin">
      <div class="itin-cab"><span class="itin-tipo">${titulo}</span><span class="itin-fecha">${fecha.charAt(0).toUpperCase() + fecha.slice(1)}</span></div>
      <div class="itin-linea">
        <div class="itin-punto"><strong>${esc(p.horaSalida)}</strong><b>${esc(p.salida)}</b><small>${esc(p.salidaNombre)}</small></div>
        <div class="itin-medio"><span class="itin-dur">${t.minutos ? duracion(t.minutos) : ''}</span><div class="itin-barra">${t.escalas.map(() => '<i></i>').join('')}</div><span class="itin-esc">${escalas}</span></div>
        <div class="itin-punto der"><strong>${esc(u.horaLlegada)}${t.tramos.some(x => x.nocturno) ? '<sup>+1</sup>' : ''}</strong><b>${esc(u.llegada)}</b><small>${esc(u.llegadaNombre)}</small></div>
      </div>
      <div class="itin-pie">${imgs}<span>${aerolineas.map(esc).join(' + ')}${t.tramos.some(x => x.vuelo) ? ` · ${t.tramos.map(x => esc(x.vuelo)).filter(Boolean).join(', ')}` : ''}</span></div>
    </div>`;
}
// det = detalles[opcion]; numerar = true muestra "Opción N" arriba; logos = objeto con dataURLs
export function itinerarioHtml(det, opcion, numerar, logos) {
  const equipaje = [...new Set([...(det.ida?.equipaje || []), ...(det.regreso?.equipaje || [])])];
  return `
    <div class="doc-vuelo">
      ${numerar ? `<div class="doc-vuelo-op">Opción ${opcion}</div>` : ''}
      ${det.ida ? tramoHtml(det.ida, 'Ida', logos) : ''}
      ${det.regreso ? tramoHtml(det.regreso, 'Regreso', logos) : ''}
      <div class="itin-equipaje">${ICONO_MALETA}<span>${equipaje.length ? esc(equipaje.join(' · ')) : 'Tarifa Basic'}</span></div>
    </div>`;
}
