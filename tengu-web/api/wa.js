// Redirección a WhatsApp con el número que vive en Vercel (TENGU_WA_NUMBER),
// no en el repo: el repo es público y su historia no se borra. Si la variable
// no está, falla claro (503) en vez de abrir un chat con un número inventado.
module.exports = (req, res) => {
  const num = String(process.env.TENGU_WA_NUMBER || '').replace(/\D/g, '');
  const q = req.query && typeof req.query.msg === 'string' ? req.query.msg : '';
  const msg = q.slice(0, 500);
  res.setHeader('Cache-Control', 'no-store');
  if (!num) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('WhatsApp no configurado (falta TENGU_WA_NUMBER en Vercel).');
  }
  res.statusCode = 302;
  res.setHeader('Location', 'https://wa.me/' + num + (msg ? '?text=' + encodeURIComponent(msg) : ''));
  res.end();
};
