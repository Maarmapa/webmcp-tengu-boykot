// Motor de reservas de Tengu — v1 con persistencia real (Supabase, schema
// aislado, funciones con secreto server-side) y fallback determinístico si las
// env vars no están. Sigue siendo entorno de PRUEBA: nadie del restaurante
// atiende estas solicitudes todavía — los avisos SANDBOX se mantienen a
// propósito hasta que el panel de sala exista y alguien lo opere.
const HORARIOS = {
  // Última sentada real (verificada en el sistema de reservas del restaurante, 29-ago-2026):
  // almuerzo 15:00 · cena 22:00 · domingo solo almuerzo · lunes cerrado
  0: [['13:00', '13:30', '14:00', '14:30', '15:00']],
  2: [['13:00', '13:30', '14:00', '14:30', '15:00'], ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00']],
  3: [['13:00', '13:30', '14:00', '14:30', '15:00'], ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00']],
  4: [['13:00', '13:30', '14:00', '14:30', '15:00'], ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00']],
  5: [['13:00', '13:30', '14:00', '14:30', '15:00'], ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00']],
  6: [['13:00', '13:30', '14:00', '14:30', '15:00'], ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00']],
};
const MESAS_POR_SLOT = 8;

const SB = process.env.TENGU_SB_URL && process.env.TENGU_SB_KEY && process.env.TENGU_SB_SECRET
  ? { url: process.env.TENGU_SB_URL, key: process.env.TENGU_SB_KEY, secret: process.env.TENGU_SB_SECRET }
  : null;

async function rpc(fn, args) {
  const r = await fetch(`${SB.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB.key, Authorization: `Bearer ${SB.key}` },
    body: JSON.stringify({ p_secret: SB.secret, ...args }),
  });
  if (!r.ok) throw new Error(`rpc ${fn}: ${r.status}`);
  return r.json();
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

function slotsDelDia(fecha) {
  const d = new Date(fecha + 'T12:00:00-04:00');
  if (isNaN(d)) return null;
  const turnos = HORARIOS[d.getUTCDay()];
  return turnos ? turnos.flat() : [];
}

async function disponibilidad(fecha, personas) {
  const slots = slotsDelDia(fecha);
  if (slots === null) return { error: 'Fecha inválida (usar YYYY-MM-DD).' };
  if (!slots.length) return { fecha, abierto: false, nota: 'Lunes cerrado.', slots: [] };
  const p = parseInt(personas || 2, 10);
  if (p < 1 || p > 12) return { error: 'Entre 1 y 12 personas (grupos mayores: por WhatsApp).' };

  let ocupadas = {};
  if (SB) {
    try { ocupadas = await rpc('tengu_disponibilidad', { p_fecha: fecha }); }
    catch (e) { ocupadas = {}; }
  } else {
    for (const h of slots) ocupadas[h] = MESAS_POR_SLOT - (hash(fecha + h) % 9);
  }
  const necesita = p > 6 ? 2 : 1;
  return {
    fecha, abierto: true, personas: p,
    slots: slots.map((h) => ({ hora: h, disponible: MESAS_POR_SLOT - (ocupadas[h] || 0) >= necesita })),
  };
}

async function crearReserva({ nombre, telefono, fecha, hora, personas, notas, origen }) {
  if (!nombre || !fecha || !hora || !personas)
    return { error: 'Faltan campos: nombre, fecha (YYYY-MM-DD), hora (HH:MM), personas.' };
  const disp = await disponibilidad(fecha, personas);
  if (disp.error) return disp;
  const slot = (disp.slots || []).find((s) => s.hora === hora);
  if (!slot) return { error: `Hora fuera de horario. Slots del día: ${(disp.slots || []).map((s) => s.hora).join(', ') || 'cerrado'}.` };
  if (!slot.disponible) return { error: `Sin mesa a las ${hora}. Alternativas: ${disp.slots.filter((s) => s.disponible).map((s) => s.hora).join(', ')}.` };

  if (SB) {
    try {
      const r = await rpc('tengu_crear_reserva', {
        p_nombre: String(nombre).slice(0, 80), p_telefono: telefono || null,
        p_fecha: fecha, p_hora: hora, p_personas: parseInt(personas, 10),
        p_notas: notas || null, p_origen: origen || 'web',
      });
      if (r.error) return r;
      return {
        codigo: r.codigo, estado: 'solicitada (entorno de prueba)',
        nombre, telefono: telefono || null, fecha, hora, personas: parseInt(personas, 10), notas: notas || null,
        aviso: 'Solicitud registrada en el sistema de PRUEBA de Tengu — todavía no la atiende nadie del restaurante. Para reservar de verdad: https://tengu-deploy.vercel.app/#reserve',
      };
    } catch (e) { /* cae al modo determinístico */ }
  }
  const codigo = 'SANDBOX-' + hash([nombre, fecha, hora, personas].join('|')).toString(36).toUpperCase();
  return {
    codigo, estado: 'confirmada (SANDBOX — no es una reserva real)',
    nombre, telefono: telefono || null, fecha, hora, personas: parseInt(personas, 10), notas: notas || null,
    aviso: 'Entorno de demostración: esta reserva NO existe en el restaurante. Para reservar de verdad: https://tengu-deploy.vercel.app/#reserve',
  };
}

async function estadoReserva(codigo) {
  if (/^TG-[0-9A-F]+$/i.test(codigo || '') && SB) {
    try {
      const r = await rpc('tengu_estado_reserva', { p_codigo: codigo });
      if (!r.error) r.aviso = 'Sistema de prueba — no atendido por el restaurante todavía.';
      return r;
    } catch (e) { return { error: 'No pude consultar el sistema. Intenta de nuevo.' }; }
  }
  if (/^SANDBOX-[0-9A-Z]+$/.test(codigo || ''))
    return { codigo, estado: 'confirmada (SANDBOX — no es una reserva real)', aviso: 'Entorno de demostración.' };
  return { error: 'Código inválido. Formato: TG-XXXXXXXX o SANDBOX-XXXXXX.' };
}

module.exports = { disponibilidad, crearReserva, estadoReserva, slotsDelDia };
