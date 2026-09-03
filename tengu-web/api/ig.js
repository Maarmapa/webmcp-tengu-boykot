// Feed de Instagram vía Meta (Instagram API with Instagram Login).
// Requiere env IG_TOKEN: token de larga duración (60 días) de la cuenta
// profesional @tengu_restaurant. Sin token responde {ready:false} y la web
// muestra el grid editorial. Renovación del token: ver README.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const token = process.env.IG_TOKEN;
  if (!token) return res.status(200).json({ ready: false });

  try {
    const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink';
    const r = await fetch(
      `https://graph.instagram.com/me/media?fields=${fields}&limit=12&access_token=${encodeURIComponent(token)}`
    );
    if (!r.ok) return res.status(200).json({ ready: false });
    const j = await r.json();
    const media = (j.data || [])
      .map(m => ({
        src: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
        permalink: m.permalink,
        caption: (m.caption || '').slice(0, 90),
        video: m.media_type === 'VIDEO',
      }))
      .filter(m => m.src)
      .slice(0, 8);
    return res.status(200).json({ ready: media.length >= 4, media });
  } catch (e) {
    return res.status(200).json({ ready: false });
  }
};
