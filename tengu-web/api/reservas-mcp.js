// MCP de RESERVAS de Tengu — 🧪 SANDBOX de demostración (sin persistencia).
// Separado del MCP de solo lectura (/api/mcp) a propósito: acá un agente puede
// ensayar el flujo completo consultar → reservar → verificar, pero NADA de lo
// que haga llega al restaurante. Endpoint: POST /api/reservas-mcp (JSON-RPC).
const R = require('./_reservas.js');

const AVISO = '🧪 SANDBOX: entorno de demostración — las reservas creadas acá NO existen en el restaurante. Para reservar de verdad: https://tengu-deploy.vercel.app/#reserve (formulario + WhatsApp).';

const TOOLS = [
  {
    name: 'consultar_disponibilidad',
    description: `${AVISO} Consulta los horarios de mesa disponibles en Tengu para una fecha y número de personas.`,
    inputSchema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        personas: { type: 'integer', minimum: 1, maximum: 12 },
      },
      required: ['fecha', 'personas'],
    },
  },
  {
    name: 'crear_reserva',
    description: `${AVISO} Crea una reserva de demostración y devuelve un código SANDBOX. Úsala solo para probar el flujo agéntico.`,
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' }, telefono: { type: 'string' },
        fecha: { type: 'string', description: 'YYYY-MM-DD' }, hora: { type: 'string', description: 'HH:MM' },
        personas: { type: 'integer', minimum: 1, maximum: 12 }, notas: { type: 'string' },
      },
      required: ['nombre', 'fecha', 'hora', 'personas'],
    },
  },
  {
    name: 'estado_reserva',
    description: `${AVISO} Consulta el estado de una reserva sandbox por su código SANDBOX-XXXX.`,
    inputSchema: { type: 'object', properties: { codigo: { type: 'string' } }, required: ['codigo'] },
  },
];

async function runTool(name, a) {
  a = a || {};
  if (name === 'consultar_disponibilidad') return JSON.stringify(await R.disponibilidad(a.fecha, a.personas), null, 1);
  if (name === 'crear_reserva') return JSON.stringify(await R.crearReserva({...a, origen: 'mcp'}), null, 1);
  if (name === 'estado_reserva') return JSON.stringify(await R.estadoReserva(a.codigo), null, 1);
  throw { code: -32602, message: `Tool desconocida: ${name}` };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'MCP de reservas (SANDBOX): usar POST con JSON-RPC 2.0.' });

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
          serverInfo: { name: 'tengu-reservas-sandbox', version: '0.1.0' },
          instructions: AVISO + ' Flujo: consultar_disponibilidad → crear_reserva → estado_reserva.',
        });
      case 'ping': return reply(msg.id, {});
      case 'tools/list': return reply(msg.id, { tools: TOOLS });
      case 'tools/call': {
        const { name, arguments: args } = msg.params || {};
        try { return reply(msg.id, { content: [{ type: 'text', text: await runTool(name, args) }], isError: false }); }
        catch (e) {
          if (e && e.code) return fail(msg.id, e.code, e.message);
          return reply(msg.id, { content: [{ type: 'text', text: 'Error interno del tool.' }], isError: true });
        }
      }
      default: return fail(msg.id, -32601, `Método no soportado: ${msg.method}`);
    }
  } catch (e) { return fail(null, -32603, 'Error interno'); }
};
