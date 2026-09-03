// Eventos con asientos por zona (kaitai show / ronqueo) — endpoint público.
// GET            → eventos publicados con disponibilidad por zona
// GET ?slug=x    → un evento
// POST {slug, zona, nombre, email, telefono, cantidad, notas}
//                → reserva cupos y devuelve código TKT-XXXXXXXX en estado pendiente
// El cobro real se conecta después (Webpay Plus / MercadoPago): el ticket nace
// 'pendiente' y el restaurante lo marca 'pagado' desde el panel.
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

const str = (v, max) => (v == null ? null : String(v).slice(0, max).trim());

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!SB) return res.status(200).json({ eventos: [] });

  try {
    if (req.method === 'GET') {
      const slug = (req.query && req.query.slug) || null;
      const eventos = await rpc('tengu_eventos', { p_slug: slug ? String(slug).slice(0, 80) : null });
      return res.status(200).json({ eventos });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const nombre = str(b.nombre, 80);
      const cantidad = parseInt(b.cantidad, 10);
      if (!b.slug || !b.zona || !nombre || !cantidad)
        return res.status(200).json({ error: 'Faltan datos: evento, zona, nombre y cantidad.' });
      if (nombre.length < 2) return res.status(200).json({ error: 'Nombre demasiado corto.' });
      if (!/^[0-9a-f-]{36}$/i.test(String(b.zona)))
        return res.status(200).json({ error: 'Zona inválida.' });
      const email = str(b.email, 120);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return res.status(200).json({ error: 'Correo inválido.' });

      const r = await rpc('tengu_ticket_crear', {
        p_slug: str(b.slug, 80), p_zona: String(b.zona), p_nombre: nombre,
        p_email: email, p_telefono: str(b.telefono, 25),
        p_cantidad: cantidad, p_notas: str(b.notas, 300),
      });
      if (r && !r.error) {
        r.aviso = 'Cupos reservados. El restaurante te contactará para confirmar el pago y cerrar tu reserva.';
      }
      return res.status(200).json(r);
    }

    return res.status(405).json({ error: 'GET o POST' });
  } catch (e) {
    return res.status(200).json({ error: 'No pudimos procesar la solicitud. Intenta de nuevo.' });
  }
};
