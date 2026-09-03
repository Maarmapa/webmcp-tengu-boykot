// Prototipo del Booking Server de Reserve with Google (Actions Center,
// Reservations End-to-End) sobre el motor sandbox de Tengu.
// Implementa las formas de la spec v3 (HealthCheck, BatchAvailabilityLookup,
// CreateBooking, GetBookingStatus, etc.) SIN persistencia — es la maqueta
// técnica para la postulación de MAP al Actions Center y para Tengu OS.
// Uso: GET /api/rwg (índice y feeds de ejemplo) · POST /api/rwg {method, ...}
const R = require('./_reservas.js');

const MERCHANT = {
  merchant_id: 'tengu-w-santiago',
  name: 'Tengu',
  telephone: '+56000000000',
  geo: { unstructured_address: 'Isidora Goyenechea 3000, Local 104, Las Condes, Santiago, Chile' },
  category: 'restaurant',
};
const SERVICE = {
  merchant_id: 'tengu-w-santiago',
  service_id: 'mesa-estandar',
  name: 'Reserva de mesa',
  description: 'Reserva estándar en Tengu — cocina japonesa kappo.',
  price: { price_micros: 0, currency_code: 'CLP' },
  prepayment_type: 'NOT_SUPPORTED',
};

function hhmmToTs(fecha, hora) {
  return Math.floor(new Date(`${fecha}T${hora}:00-04:00`).getTime() / 1000);
}

async function availabilityFor(fecha, party) {
  const d = await R.disponibilidad(fecha, party);
  if (d.error || !d.abierto) return [];
  return d.slots.filter((s) => s.disponible).map((s) => ({
    start_sec: hhmmToTs(fecha, s.hora),
    duration_sec: 5400,
    spots_total: 8,
    spots_open: 1,
    resources: { party_size: party },
  }));
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Sandbox', 'tengu-rwg-prototype');

  if (req.method === 'GET') {
    return res.status(200).json({
      prototype: 'Reserve with Google — Reservations End-to-End (sandbox de Tengu / MAP)',
      spec: 'https://developers.google.com/actions-center/verticals/reservations/e2e',
      feeds: { merchants: [MERCHANT], services: [SERVICE] },
      booking_server_methods: ['HealthCheck', 'BatchAvailabilityLookup', 'CreateBooking', 'GetBookingStatus'],
      aviso: 'Sin persistencia: prototipo técnico, no crea reservas reales.',
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'GET o POST.' });

  const b = req.body || {};
  const method = b.method || '';

  if (method === 'HealthCheck') return res.status(200).json({ ok: true });

  if (method === 'BatchAvailabilityLookup') {
    // b.slot_time: [{date:'YYYY-MM-DD', party_size:N}]
    const out = await Promise.all((b.slot_time || []).map(async (q) => ({
      date: q.date, party_size: q.party_size,
      available_slots: await availabilityFor(q.date, q.party_size || 2),
    })));
    return res.status(200).json({ merchant_id: MERCHANT.merchant_id, availability: out });
  }

  if (method === 'CreateBooking') {
    const s = b.slot || {}, u = b.user_information || {};
    const fecha = s.date, hora = s.time;
    const r = await R.crearReserva({
      nombre: [u.given_name, u.family_name].filter(Boolean).join(' ') || 'Comensal',
      telefono: u.telephone, fecha, hora, personas: (s.resources && s.resources.party_size) || b.party_size || 2,
      notas: b.additional_request,
    });
    if (r.error) return res.status(200).json({ booking_failure: { cause: 'SLOT_UNAVAILABLE', description: r.error } });
    return res.status(200).json({
      booking: {
        booking_id: r.codigo, merchant_id: MERCHANT.merchant_id, service_id: SERVICE.service_id,
        start_sec: hhmmToTs(fecha, hora), duration_sec: 5400,
        party_size: r.personas, status: 'CONFIRMED',
        sandbox_notice: r.aviso,
      },
    });
  }

  if (method === 'GetBookingStatus') {
    const r = await R.estadoReserva(b.booking_id);
    if (r.error) return res.status(200).json({ booking_failure: { cause: 'BOOKING_NOT_FOUND', description: r.error } });
    return res.status(200).json({ booking_id: b.booking_id, booking_status: 'CONFIRMED', sandbox_notice: r.aviso });
  }

  return res.status(200).json({ error: `Método no soportado en el prototipo: ${method}` });
};
