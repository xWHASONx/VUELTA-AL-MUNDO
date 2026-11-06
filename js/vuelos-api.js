// vuelos-api.js — cliente del puente PHP (api/vuelos.php). Sin dependencias.
// Configura BASE y la cabecera de autenticación según el proyecto.
export const VUELOS_API = {
  base: (window.VAM_CONFIG?.API_BASE || 'api/') + 'vuelos.php',
  cabeceras: () => ({ 'Content-Type': 'application/json', 'X-VAM-KEY': window.VAM_CONFIG?.API_TOKEN || '' })
};

async function llamar(accion, cuerpo, intento = 1) {
  let r;
  try {
    r = await fetch(`${VUELOS_API.base}?accion=${accion}`, { method: 'POST', headers: VUELOS_API.cabeceras(), body: JSON.stringify(cuerpo), cache: 'no-store' });
  } catch (e) {
    if (intento < 3) { await new Promise(res => setTimeout(res, 1500 * intento)); return llamar(accion, cuerpo, intento + 1); }
    throw new Error('Sin conexión con el servidor. Intenta de nuevo.');
  }
  // 502/504: el hosting cortó la espera mientras Google respondía. Reintentar hasta 2 veces.
  if ((r.status === 502 || r.status === 504) && intento < 3) { await new Promise(res => setTimeout(res, 1500 * intento)); return llamar(accion, cuerpo, intento + 1); }
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok || j.ok === false) throw new Error(j.error || (r.status === 504 ? 'Google Flights tardó demasiado. Vuelve a intentar en unos segundos.' : `Error ${r.status}`));
  return j;
}

// Vuelos de ida (o ida+vuelta si hay regreso). Si regreso viene, cada vuelo trae `token` para pedir sus regresos.
export function buscarVuelos({ origen, destino, ida, regreso, adultos, ninos }) {
  return llamar('buscar', { origen, destino, ida, regreso: regreso || null, adultos, ninos });
}
// Regresos compatibles con la ida elegida (token = departure_token de esa ida).
export function vuelosRegreso({ origen, destino, ida, regreso, adultos, ninos, token }) {
  return llamar('regreso', { origen, destino, ida, regreso, adultos, ninos, token });
}
// Logo de aerolínea como dataURL (para que salga en el PDF generado con html2canvas).
export async function traerLogo(url) { return (await llamar('logo', { url })).dataUrl; }

// Códigos IATA para el autocompletado (datalist). Ampliar a gusto.
export const AEROPUERTOS = [
  ['MDE','Medellín · José María Córdova'],['EOH','Medellín · Olaya Herrera'],['BOG','Bogotá'],['CLO','Cali'],['CTG','Cartagena'],['BAQ','Barranquilla'],['SMR','Santa Marta'],['PEI','Pereira'],['AXM','Armenia'],['ADZ','San Andrés'],['BGA','Bucaramanga'],['CUC','Cúcuta'],['MTR','Montería'],['LET','Leticia'],
  ['PUJ','Punta Cana'],['SDQ','Santo Domingo'],['CUN','Cancún'],['SJU','San Juan, Puerto Rico'],['AUA','Aruba'],['CUR','Curazao'],['HAV','La Habana'],['VRA','Varadero'],['MBJ','Montego Bay'],['NAS','Nassau'],['PTY','Panamá · Tocumen'],['BLB','Panamá Pacífico · Balboa'],['PAC','Panamá · Albrook'],['SJO','San José, Costa Rica'],['LIR','Liberia, Costa Rica'],['GUA','Guatemala'],['SAL','San Salvador'],['LIM','Lima'],['UIO','Quito'],['GYE','Guayaquil'],['CCS','Caracas'],['SCL','Santiago de Chile'],['EZE','Buenos Aires'],['GRU','São Paulo'],['MAD','Madrid'],['BCN','Barcelona'],
  ['MIA','Miami'],['MCO','Orlando'],['FLL','Fort Lauderdale'],['JFK','Nueva York JFK'],['EWR','Nueva York Newark'],['LAX','Los Ángeles'],['YYZ','Toronto'],['MEX','Ciudad de México'],['SJD','Los Cabos'],['PVR','Puerto Vallarta'],
  ['LIM','Lima'],['CUZ','Cusco'],['UIO','Quito'],['GYE','Guayaquil'],['GPS','Galápagos Baltra'],['SCL','Santiago de Chile'],['EZE','Buenos Aires Ezeiza'],['AEP','Buenos Aires Aeroparque'],['GRU','São Paulo'],['GIG','Río de Janeiro'],['MVD','Montevideo'],['PUQ','Punta Arenas'],['LPB','La Paz'],
  ['MAD','Madrid'],['BCN','Barcelona'],['LIS','Lisboa'],['CDG','París'],['FCO','Roma'],['AMS','Ámsterdam'],['LHR','Londres Heathrow'],['IST','Estambul'],['DXB','Dubái'],['ATH','Atenas']
];
