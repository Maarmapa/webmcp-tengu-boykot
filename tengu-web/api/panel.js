// Panel de sala v0 — API protegida con clave (env TENGU_PANEL_PASS).
// GET ?fecha=YYYY-MM-DD → reservas del día · POST {codigo, estado} → actualizar.
// La clave nunca viaja en el HTML: el panel la pide una vez y la manda en header.
const SB = process.env.TENGU_SB_URL && process.env.TENGU_SB_KEY && process.env.TENGU_SB_SECRET
  ? { url: process.env.TENGU_SB_URL, key: process.env.TENGU_SB_KEY, secret: process.env.TENGU_SB_SECRET }
  : null;
const PASS = process.env.TENGU_PANEL_PASS;

async function rpc(fn, args) {
  const r = await fetch(`${SB.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB.key, Authorization: `Bearer ${SB.key}` },
    body: JSON.stringify({ p_secret: SB.secret, ...args }),
  });
  if (!r.ok) throw new Error(`rpc ${fn}: ${r.status}`);
  return r.json();
}

function hoyChile() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!SB || !PASS) return res.status(503).json({ error: 'Panel no configurado.' });

  const auth = req.headers.authorization || '';
  const ok = auth.startsWith('Basic ') &&
    Buffer.from(auth.slice(6), 'base64').toString() === `tengu:${PASS}`;
  if (!ok) {
    try {
      const tr = await fetch(`${SB.url}/rest/v1/rpc/tengu_tick_panel_fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SB.key, Authorization: `Bearer ${SB.key}` },
        body: JSON.stringify({ p_secret: SB.secret }),
      });
      const tj = await tr.json();
      if (tj && tj.permitido === false) return res.status(429).json({ error: 'Panel bloqueado por hoy (demasiados intentos fallidos).' });
    } catch (e) {}
    await new Promise((r2) => setTimeout(r2, 900));
    res.setHeader('WWW-Authenticate', 'Basic realm="Tengu Sala"');
    return res.status(401).json({ error: 'Clave incorrecta.' });
  }

  try {
    if (req.method === 'GET') {
      if (req.query && req.query.vista === 'eventos') {
        const eventos = await rpc('tengu_eventos_admin', {});
        return res.status(200).json({ eventos });
      }
      const fecha = (req.query && req.query.fecha) || hoyChile();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'fecha inválida' });
      const reservas = await rpc('tengu_listar_dia', { p_fecha: fecha });
      return res.status(200).json({ fecha, reservas });
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.evento && b.estado) {
        const r = await rpc('tengu_evento_estado', { p_slug: String(b.evento), p_estado: String(b.estado) });
        return res.status(200).json(r);
      }
      if (b.accion === 'guardar_evento') {
        const r = await rpc('tengu_evento_guardar', {
          p_slug: String(b.slug || ''), p_nombre: String(b.nombre || ''),
          p_subtitulo: b.subtitulo || null, p_descripcion: b.descripcion || null,
          p_fecha: String(b.fecha || ''), p_hora: String(b.hora || ''),
        });
        return res.status(200).json(r);
      }
      if (b.accion === 'guardar_zona') {
        const r = await rpc('tengu_zona_guardar', {
          p_zona: String(b.zona || ''), p_nombre: String(b.nombre || ''),
          p_descripcion: b.descripcion || null,
          p_precio: parseInt(b.precio, 10), p_cupos: parseInt(b.cupos, 10),
        });
        return res.status(200).json(r);
      }
      if (b.accion === 'crear_evento') {
        const r = await rpc('tengu_evento_crear', {
          p_slug: String(b.slug || ''), p_nombre: String(b.nombre || ''),
          p_fecha: String(b.fecha || ''), p_hora: String(b.hora || ''),
        });
        return res.status(200).json(r);
      }
      if (b.ticket && b.estado) {
        const r = await rpc('tengu_ticket_estado_set', { p_codigo: String(b.ticket), p_estado: String(b.estado) });
        return res.status(200).json(r);
      }
      const { codigo, estado } = b;
      if (!codigo || !estado) return res.status(400).json({ error: 'faltan codigo y estado' });
      const r = await rpc('tengu_actualizar_estado', { p_codigo: String(codigo), p_estado: String(estado) });
      return res.status(200).json(r);
    }
    return res.status(405).json({ error: 'GET o POST' });
  } catch (e) {
    return res.status(200).json({ error: 'Error consultando el sistema.' });
  }
};
