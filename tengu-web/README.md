# Tengu — W Santiago

Sitio one-page del restaurante Tengu (Isidora Goyenechea 3000, local 104, edificio W Santiago).

- **Live**: https://tengu-deploy.vercel.app
- Estático puro: `index.html` + fotos. Sin build, sin dependencias.
- **Carta**: sincronizada desde la carta oficial en Gourmedia (`gour.media/tengu/`) — última sync **28-ago-2026**, 250 ítems (comida, barra, vinos, por copa, sake).
- Incluye chatbot de carta (reglas locales, sin backend) y formulario de reservas vía WhatsApp.

## Pendiente antes de considerarlo final

- Teléfono y número de WhatsApp reales (hoy placeholder).
- Confirmar horarios y textos de eventos/corporativos con el restaurante.

## Feed de Instagram (Meta)

La sección Instagram muestra un grid editorial por defecto. Para activar el feed
real de `@tengu_restaurant`:

1. La cuenta debe ser **profesional** (Business/Creator) en Instagram.
2. Crear una app en developers.facebook.com con el producto **Instagram API with
   Instagram Login** y autorizar la cuenta del restaurante (permiso
   `instagram_business_basic`).
3. Generar el **token de larga duración** (60 días) y setearlo en Vercel:
   `IG_TOKEN` (Settings → Environment Variables) + redeploy.
4. El endpoint `/api/ig` entrega los últimos posts (cache 1 h); si el token
   falta o vence, la web vuelve sola al grid editorial — nunca se ve rota.

Renovación: el token se refresca con `GET graph.instagram.com/refresh_access_token`
antes de los 60 días (pendiente automatizar cuando haya token).
