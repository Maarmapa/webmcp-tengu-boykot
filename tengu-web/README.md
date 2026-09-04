# Tengu — Isidora 3000

Sitio one-page del restaurante Tengu (Isidora Goyenechea 3000, local 104, Las Condes).

- **Live**: https://tengu-deploy.vercel.app
- Estático puro: `index.html` + fotos. Sin build, sin dependencias.
- **Carta**: sincronizada desde la carta oficial en Gourmedia (`gour.media/tengu/`) — última sync **28-ago-2026**, 250 ítems (comida, barra, vinos, por copa, sake).
- Incluye chatbot de carta (reglas locales, con fallback a `/api/oraculo`), formulario de reservas vía WhatsApp y **tools WebMCP** (ver abajo). Licencia MIT.

## WebMCP — el restaurante como herramientas para agentes

La página registra **5 tools** en `document.modelContext` (`navigator.modelContext`
solo como alias deprecado), con detección de la API: sin ella, es un sitio normal.

| tool | qué hace |
|---|---|
| `get_carta` | carta oficial con precios reales en CLP; índice de secciones o el detalle de una |
| `buscar_plato` | busca platos, tragos, vinos y sakes |
| `get_guia` | guías escritas por el restaurante (sake, bluefin, kappo), texto completo |
| `get_info` | dirección, horarios, cómo reservar |
| `preparar_reserva` | abre el formulario de reserva, lo llena, marca cada campo que tocó y dice qué no pudo aplicar — **nunca envía**: la persona revisa y envía por WhatsApp |

- Las cuatro de lectura son proxies finos a `POST /api/mcp` (JSON-RPC, mismo servidor
  para agentes fuera de la página): navegador y servidor leen lo mismo.
- **Cómo probarlo**: Chrome 149+ o Edge 150+ traen la API por origin trial (tokens en el
  `<head>`, solo válidos para `tengu-deploy.vercel.app`). En otros navegadores,
  `https://tengu-deploy.vercel.app/?webmcp` carga el polyfill `@mcp-b/global` (vendored
  en `webmcp-global.iife.js`). En la consola: `typeof document.modelContext` → `"object"`.
- **Deliberadamente no expuesto**: nada que gaste dinero o comprometa al restaurante. El
  motor de reservas en Postgres se ofrece a agentes solo como **sandbox**
  (`POST /api/reservas-mcp`), que no llega al restaurante.
- Submission a The WebMCP Challenge (sep-2026) junto con Boykot:
  https://github.com/Maarmapa/webmcp-tengu-boykot (texto y cómo probar, en inglés).

## Configuración en Vercel

- `TENGU_WA_NUMBER`: número de WhatsApp del restaurante (solo dígitos con código de
  país). Lo usa `/api/wa`, que redirige a `wa.me`; sin la variable responde 503. **El
  número no vive en el repo.**
- `IG_TOKEN`: ver más abajo.

## Pendiente antes de considerarlo final

- Confirmar horarios y textos de eventos/corporativos con el restaurante.
- Horas de almuerzo en el selector de reservas (hoy solo cena).

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
