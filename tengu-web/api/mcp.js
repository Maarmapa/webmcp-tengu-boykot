// MCP server de Tengu (Model Context Protocol, Streamable HTTP, sin dependencias).
// Permite que agentes de IA consulten la carta real y los datos del restaurante.
// Endpoint: POST /api/mcp (JSON-RPC 2.0). Solo lectura — no ejecuta reservas.
const CARTA = require('./_carta.js');
const GUIAS = require('./_guias.js');

const INFO = {
  nombre: 'Tengu',
  tipo: 'Restaurante japonés kappo',
  direccion: 'Isidora Goyenechea 3000, Local 104, Las Condes, Santiago de Chile ',
  horarios: 'Martes a sábado: almuerzo 13:00 a 15:00 y cena 19:00 a 22:00 (últimas horas de entrada). Domingo: solo almuerzo, 13:00 a 15:00. Lunes cerrado.',
  web: 'https://tengu-deploy.vercel.app',
  instagram: 'https://www.instagram.com/tengu_restaurant/',
  como_reservar: 'Formulario en la sección Reservas de la web (confirmación por WhatsApp) o WhatsApp directo desde el sitio.',
  especialidad: 'Programa de Honmaguro (atún bluefin de aleta azul): nigiris de akami, chutoro y otoro, sashimi de maguro de 6 a 25 cortes. Cava de sake y de vinos.',
};

const TOOLS = [
  {
    name: 'get_carta',
    description:
      'Carta oficial de Tengu (sincronizada con la carta vigente). Sin argumentos devuelve el índice de secciones y categorías con conteos. Con "seccion" devuelve todos los platos de esa sección; "categoria" filtra más fino.',
    inputSchema: {
      type: 'object',
      properties: {
        seccion: { type: 'string', enum: ['Comida', 'Barra', 'Vinos', 'Vinos por copa', 'Sake'], description: 'Sección de la carta' },
        categoria: { type: 'string', description: 'Categoría dentro de la sección, ej. "Makis", "Sashimi", "GIN"' },
      },
    },
  },
  {
    name: 'buscar_plato',
    description: 'Busca platos, tragos, vinos o sakes por nombre o descripción en toda la carta de Tengu. Devuelve nombre, precio, sección y descripción.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Texto a buscar, ej. "pulpo", "otoro", "gin", "vegetariano"' } },
      required: ['query'],
    },
  },
  {
    name: 'get_guia',
    description:
      'Guías de autoridad escritas por Tengu, con contenido completo y verificado. "sake": qué es el sake, categorías (junmai, ginjo, daiginjo, nigori), temperatura de servicio, cómo leer una etiqueta y la cava real de Tengu. "bluefin": el atún honmaguro, los cortes akami/chutoro/otoro, el ronqueo o kaitai, maduración y cómo comerlo. "kappo": qué es la cocina kappo y su diferencia con kaiseki, izakaya, sushiya y omakase. Sin argumentos lista las disponibles.',
    inputSchema: {
      type: 'object',
      properties: { tema: { type: 'string', enum: ['sake', 'bluefin', 'kappo'], description: 'Guía a devolver' } },
    },
  },
  {
    name: 'get_info',
    description: 'Información del restaurante Tengu: dirección, horarios, cómo reservar, especialidad, Instagram.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const strip = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function fmtItem(i) {
  return `${i.n} — ${i.p}${i.chef ? ' ★' : ''}${i.d ? ` · ${i.d}` : ''} [${i.s} / ${i.c}]`;
}

function runTool(name, args) {
  args = args || {};
  if (name === 'get_info') return JSON.stringify(INFO, null, 2);

  if (name === 'get_guia') {
    const t = strip(args.tema || '');
    if (!t || !GUIAS[t]) {
      return 'Guías disponibles (usar get_guia con {tema}):\n' +
        Object.entries(GUIAS).map(([k, g]) => `- ${k}: ${g.titulo} → ${g.url}`).join('\n');
    }
    return GUIAS[t].texto;
  }

  if (name === 'get_carta') {
    let items = CARTA;
    if (args.seccion) items = items.filter((i) => strip(i.s) === strip(args.seccion));
    if (args.categoria) items = items.filter((i) => strip(i.c).includes(strip(args.categoria)));
    if (!args.seccion && !args.categoria) {
      const idx = {};
      for (const i of CARTA) {
        idx[i.s] = idx[i.s] || {};
        idx[i.s][i.c] = (idx[i.s][i.c] || 0) + 1;
      }
      return (
        'Carta de Tengu — índice (usar get_carta con {seccion} o {categoria} para el detalle):\n' +
        Object.entries(idx)
          .map(([s, cats]) => `\n## ${s}\n` + Object.entries(cats).map(([c, n]) => `- ${c} (${n})`).join('\n'))
          .join('\n')
      );
    }
    if (!items.length) return 'Sin resultados para ese filtro. Llamá get_carta sin argumentos para ver el índice.';
    return items.map(fmtItem).join('\n');
  }

  if (name === 'buscar_plato') {
    const q = strip(args.query);
    if (!q) return 'Falta query.';
    const hits = CARTA.filter((i) => strip(i.n).includes(q) || strip(i.d || '').includes(q) || strip(i.c).includes(q));
    return hits.length ? hits.slice(0, 40).map(fmtItem).join('\n') : `Nada en la carta para "${args.query}".`;
  }

  throw { code: -32602, message: `Tool desconocida: ${name}` };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'MCP server de Tengu: usar POST con JSON-RPC 2.0 (Streamable HTTP).' });

  const msg = req.body;
  const reply = (id, result) => res.status(200).json({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => res.status(200).json({ jsonrpc: '2.0', id, error: { code, message } });

  try {
    if (!msg || !msg.method) return fail(msg && msg.id, -32600, 'Request inválida');
    if (msg.method.startsWith('notifications/')) return res.status(202).end();

    switch (msg.method) {
      case 'initialize':
        return reply(msg.id, {
          protocolVersion: (msg.params && msg.params.protocolVersion) || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'tengu-mcp', version: '1.0.0' },
          instructions:
            'MCP oficial del restaurante Tengu (Isidora 3000, Chile). Solo lectura: carta real con precios en CLP, información y horarios. Para reservar, dirigir al usuario a la web o WhatsApp del restaurante.',
        });
      case 'ping':
        return reply(msg.id, {});
      case 'tools/list':
        return reply(msg.id, { tools: TOOLS });
      case 'tools/call': {
        const { name, arguments: args } = msg.params || {};
        try {
          const text = runTool(name, args);
          return reply(msg.id, { content: [{ type: 'text', text }], isError: false });
        } catch (e) {
          if (e && e.code) return fail(msg.id, e.code, e.message);
          return reply(msg.id, { content: [{ type: 'text', text: 'Error interno del tool.' }], isError: true });
        }
      }
      default:
        return fail(msg.id, -32601, `Método no soportado: ${msg.method}`);
    }
  } catch (e) {
    return fail(null, -32603, 'Error interno');
  }
};
