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
      'Tengu\'s official menu, live prices in CLP. Carta oficial de Tengu con precios reales en CLP. No arguments returns the index of sections and categories; use {seccion} (Comida, Barra, Vinos, Vinos por copa, Sake) or {categoria} for the detail. Dish names stay in Spanish; the filters accept English (food, wine, dessert, sake).',
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
    description: 'Search dishes, cocktails, wines and sake across Tengu\'s menu. Busca platos, tragos, vinos o sakes en toda la carta. Accepts English or Spanish: tuna, salmon, shrimp, dessert, wine, sparkling all work and are matched against the Spanish menu. Returns name, price in CLP, description and category.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Texto a buscar, ej. "pulpo", "otoro", "gin", "vegetariano"' } },
      required: ['query'],
    },
  },
  {
    name: 'get_guia',
    description:
      'Long-form guides written by the restaurant itself, full text, in Spanish. Guías de autoridad escritas por Tengu. "sake" (what it is, categories, serving temperature, how to read a label, Tengu\'s cellar), "bluefin" (honmaguro cut by cut) and "kappo" (what kappo cooking is). No topic returns the index. Pass {idioma:"en"} for the restaurant\'s own English summary and outline of a guide; the full text is Spanish. This is the restaurant speaking in its own words: quote or summarise it, do not attribute to it what it does not say.',
    inputSchema: {
      type: 'object',
      properties: {
        tema: { type: 'string', enum: ['sake', 'bluefin', 'kappo'], description: 'Guía a devolver / guide to return' },
        idioma: { type: 'string', enum: ['es', 'en'], description: 'es (default) returns the full Spanish text; en returns the restaurant\'s own English summary and outline' },
      },
    },
  },
  {
    name: 'get_info',
    description: 'Address, opening hours, how to book and what the restaurant is known for. Dirección, horarios, cómo reservar y especialidad de Tengu (Isidora 3000, Las Condes, Santiago de Chile).',
    inputSchema: { type: 'object', properties: {} },
  },
];

const strip = (s) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Tolerancia de plural: "postres" y "postre" son la misma cosa.
const sing = (w) =>
  w.length > 4 && /(es|s)$/.test(w) ? w.replace(/(es|s)$/, '') : w;

// La carta vive en español. El agente ya traduce para la persona; lo que no
// puede es no encontrar. Este diccionario se aplica a la CONSULTA, nunca a los
// datos, para que la carta siga teniendo una sola fuente de verdad.
const SINONIMOS = {
  tuna: 'atun', bluefin: 'atun', salmon: 'salmon', shrimp: 'camaron',
  prawn: 'camaron', eel: 'anguila', octopus: 'pulpo', squid: 'calamar',
  scallop: 'ostion', crab: 'jaiba', roe: 'huevas', beef: 'wagyu',
  chicken: 'pollo', pork: 'cerdo', rice: 'arroz', noodle: 'ramen',
  soup: 'sopa', dessert: 'postre', sweet: 'postre', starter: 'comenzar',
  appetizer: 'comenzar', wine: 'vino', red: 'tinto', white: 'blanco',
  sparkling: 'espumante', beer: 'cerveza', cocktail: 'cocteleria',
  drink: 'bebida', water: 'agua', coffee: 'cafe', tea: 'te',
  raw: 'crudo', grilled: 'parrilla', fried: 'frito', spicy: 'picante',
  vegetarian: 'vegetariano', vegan: 'vegano', 'gluten-free': 'sin gluten',
  food: 'comida', menu: 'carta', bar: 'barra', glass: 'copa',
  bottle: 'botella', sake: 'sake', roll: 'maki', hot: 'caliente'
};

// Palabras del texto, normalizadas y sin plural, para comparar por palabra
// completa en vez de por subcadena: así "tuna" deja de matchear "aceitunas".
const palabras = (s) => strip(s).split(/[^a-z0-9]+/).filter(Boolean).map(sing);

const traducir = (q) =>
  strip(q).split(/\s+/).filter(Boolean)
    .map((w) => SINONIMOS[w] || SINONIMOS[sing(w)] || w)
    .join(' ');

// Un ítem coincide si CADA término de la consulta aparece como palabra completa
// (o como prefijo de al menos 4 letras) en su nombre, descripción o categoría.
function coincide(item, consulta) {
  const campos = palabras(`${item.n} ${item.d || ''} ${item.c} ${item.s}`);
  return consulta.split(/\s+/).filter(Boolean).every((t) => {
    const term = sing(t);
    return campos.some((w) => w === term || (term.length >= 4 && w.startsWith(term)));
  });
}

function fmtItem(i) {
  return `${i.n} — ${i.p}${i.chef ? ' ★' : ''}${i.d ? ` · ${i.d}` : ''} [${i.s} / ${i.c}]`;
}

function runTool(name, args) {
  args = args || {};
  if (name === 'get_info') return JSON.stringify(INFO, null, 2);

  if (name === 'get_guia') {
    const t = strip(args.tema || '');
    const en = strip(args.idioma || '') === 'en';
    if (!t || !GUIAS[t]) {
      return (en
        ? 'Guides written by the restaurant (use get_guia with {tema}):\n' +
          Object.entries(GUIAS).map(([k, g]) => `- ${k}: ${(g.en && g.en.titulo) || g.titulo} → ${g.url}`).join('\n')
        : 'Guías disponibles (usar get_guia con {tema}):\n' +
          Object.entries(GUIAS).map(([k, g]) => `- ${k}: ${g.titulo} → ${g.url}`).join('\n'));
    }
    const g = GUIAS[t];
    // El texto completo vive en español porque es la voz del restaurante. En
    // inglés devolvemos su propio resumen y el índice, escritos —no traducidos
    // a máquina— para que un agente responda sin inventar y sepa qué hay dentro.
    if (en && g.en) {
      return [
        `# ${g.en.titulo}`,
        '',
        g.en.resumen,
        '',
        'What is inside:',
        ...g.en.indice.map((x) => `- ${x}`),
        '',
        `The full guide is written in Spanish and lives at ${g.url}. Call get_guia with {tema:"${t}"} to read it in full; quote or summarise it, and do not attribute to the restaurant what it does not say.`,
      ].join('\n');
    }
    return g.texto;
  }

  if (name === 'get_carta') {
    let items = CARTA;
    if (args.seccion) {
      const q = palabras(traducir(args.seccion)).join(' ');
      items = items.filter((i) => palabras(i.s).join(' ') === q);
    }
    if (args.categoria) {
      const c = traducir(args.categoria);
      items = items.filter((i) => {
        const cat = palabras(i.c).join(' ');
        const q = palabras(c).join(' ');
        return cat === q || cat.includes(q) || q.includes(cat);
      });
    }
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
    const q = traducir(args.query);
    if (!q) return 'Falta query.';
    const hits = CARTA.filter((i) => coincide(i, q));
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
