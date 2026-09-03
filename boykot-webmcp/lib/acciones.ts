// Las herramientas que actúan sobre TU página, no sobre el servidor.
//
// El resto de la capa WebMCP reenvía a `/api/mcp`: son las mismas preguntas que
// contestaría un cliente MCP externo, hechas desde el navegador. Útil, pero un
// cliente externo hace lo mismo — nada de eso necesita WebMCP.
//
// Esto sí. El carro y la lista de deseos viven en la sesión de quien está
// mirando la página: un servidor MCP no los conoce y no puede tocarlos. Que el
// agente pueda llenarte el carro y que se abra el panel delante tuyo es lo que
// solo existe cuando el sitio le entrega herramientas al agente que ya está
// adentro.
//
// La línea de siempre se sostiene: **el carro se llena, la compra la confirma
// la persona.** Ninguna de estas herramientas cobra, ni crea un pre-pedido, ni
// toca `create_checkout`. Llenar un carro es reversible con un clic y no mueve
// plata; por eso puede hacerlo el agente. Pagar, no.
//
// Sin imports a propósito: la aritmética de cantidades decide qué queda en tu
// carro, así que se prueba ejecutándola (`node --test` corre este archivo
// directo por type stripping), no leyéndola con expresiones regulares.

export interface ProductoParaCarro {
  slug: string;
  name: string;
  price_clp: number | null;
  image: string | null;
  /** El id que usa el carro: el de BSale si existe, si no el hash del slug.
   *  Lo decide el servidor (`get_product`) para que el cliente no tenga que
   *  reimplementar ese hash — ya está duplicado dos veces y con eso basta. */
  cart_variant_id: number | null;
}

export interface LineaDeCarro {
  variant_id: number;
  product_id: number;
  unit_price_clp: number;
  name: string;
  image_url?: string;
  slug: string;
  /** Cantidad ABSOLUTA que queda en el carro (actual + pedida). */
  qty: number;
}

/** Tope por línea, el mismo del carro prellenado de la tienda. */
export const MAX_QTY_POR_LINEA = 20;

/**
 * Convierte un producto + una cantidad pedida en la línea que espera el carro.
 *
 * `qty` es ABSOLUTA para `useCart().setItem`, pero el agente dice "agregá dos",
 * no "dejá dos". Sumar acá es la diferencia entre agregar y pisar: sin esto,
 * pedir dos veces "agregá uno" deja uno solo y el agente jura que puso dos.
 *
 * Devuelve null cuando el producto no alcanza para una línea honesta: sin id no
 * hay dónde ponerlo, y sin precio la línea mentiría el total del carro.
 */
export function lineaDeCarro(
  producto: ProductoParaCarro,
  qtyActual: number,
  qtyPedida: number,
): LineaDeCarro | null {
  if (producto.cart_variant_id == null) return null;
  if (producto.price_clp == null || producto.price_clp <= 0) return null;

  const pedida = Math.floor(Number(qtyPedida));
  if (!Number.isFinite(pedida) || pedida <= 0) return null;

  const actual = Number.isFinite(qtyActual) && qtyActual > 0 ? Math.floor(qtyActual) : 0;
  const total = Math.min(actual + pedida, MAX_QTY_POR_LINEA);
  // Ya estaba en el tope: no hay nada que agregar, y decir que sí sería mentir.
  if (total <= actual) return null;

  return {
    variant_id: producto.cart_variant_id,
    product_id: 0,
    unit_price_clp: producto.price_clp,
    name: producto.name,
    image_url: producto.image ?? undefined,
    slug: producto.slug,
    qty: total,
  };
}

/** Definición WebMCP de una herramienta de página (sin su `execute`). */
export interface HerramientaDePagina {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const ESQUEMA_ITEMS = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'Productos a agregar (máx. 20 líneas): cada uno con el slug del catálogo y la cantidad.',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Slug del producto, ej "marcador-copic-sketch-e00". Sale de search_products.' },
          qty: { type: 'number', description: 'Cuántas unidades AGREGAR (se suman a las que ya haya, 1 por defecto).' },
        },
        required: ['slug'],
      },
    },
  },
  required: ['items'],
} as const;

/**
 * Las tres herramientas de página.
 *
 * Las descripciones dicen explícitamente que no cobran. Un agente que no sabe
 * dónde termina su permiso pregunta de más o hace de más; decírselo en la
 * descripción es más barato que las dos cosas.
 */
export const ACCIONES_DE_PAGINA: HerramientaDePagina[] = [
  {
    name: 'agregar_al_carro',
    description:
      'Agrega productos al carro de la persona que está mirando la página, acá y ahora: el ' +
      'carro se llena a la vista y se abre el panel. NO cobra, NO crea pedido y NO pide datos ' +
      'de pago — solo deja el carro armado para que la persona revise y pague si quiere. Los ' +
      'precios y el stock los pone la tienda, no vos. Usá search_products antes para tener el ' +
      'slug correcto.',
    inputSchema: ESQUEMA_ITEMS as unknown as Record<string, unknown>,
  },
  {
    name: 'ver_mi_carro',
    description:
      'Muestra lo que la persona tiene AHORA en su carro en esta pestaña, con cantidades y ' +
      'total. Es el estado de su sesión, no del catálogo: nadie más que esta página lo sabe. ' +
      'Úsalo antes de agregar, para no repetir lo que ya está.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'guardar_en_lista',
    description:
      'Guarda un producto en la lista de deseos de la persona, en esta pestaña. Para cuando ' +
      'quiere anotarlo sin comprarlo todavía. No cobra ni reserva nada.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Slug del producto a guardar.' },
      },
      required: ['slug'],
    },
  },
];

export function nombresDeAcciones(): string[] {
  return ACCIONES_DE_PAGINA.map((a) => a.name);
}
