'use client';

// Registra las herramientas de Boykot DENTRO de la página, para el agente que
// acompaña a la persona mientras navega (WebMCP,
// `document.modelContext.registerTool`).
//
// El sitio ya expone `/api/mcp` para clientes MCP externos. Esto es el otro
// extremo del mismo puente: mismo catálogo, mismos nombres, mismos esquemas —
// pero disponible sin que nadie configure un servidor, mientras la página está
// abierta.
//
// Tres decisiones que se sostienen solas:
//
// 1. **Cada `execute` reenvía a `/api/mcp`.** No hay una segunda
//    implementación de ninguna herramienta. La página no calcula precios ni
//    stock: pregunta al mismo endpoint que responde a un cliente externo, y
//    devuelve lo que ese endpoint diga. Si el catálogo cambia, las dos
//    superficies cambian juntas porque son la misma.
//
// 2. **Comprar se propone, no se ejecuta.** `create_checkout` mueve dinero.
//    Acá el agente arma el carrito y devuelve el enlace listo; el clic es de la
//    persona. No es una advertencia en la descripción: la herramienta
//    literalmente no llama al checkout.
//
// 3. **Si el navegador no trae WebMCP, esto no existe.** Chrome 149 y Edge 150
//    lo tienen tras un origin trial; el resto no. Sin la API, el componente no
//    hace nada y no rompe la página.

import { useEffect } from 'react';
import { enlaceCarritoPrefill } from '@/lib/carrito-prefill';
import { HERRAMIENTAS_QUE_PROPONEN, herramientasDePagina } from '@/lib/webmcp/tools';

/** Respuesta que WebMCP espera de un `execute`. */
type Respuesta = { content: Array<{ type: 'text'; text: string }> };

function texto(valor: unknown): Respuesta {
  const cuerpo = typeof valor === 'string' ? valor : JSON.stringify(valor, null, 2);
  return { content: [{ type: 'text', text: cuerpo }] };
}

/**
 * Llama a una herramienta del MCP del propio sitio.
 *
 * Se usa la misma ruta JSON-RPC que un cliente externo. Un error de red o del
 * servidor vuelve como texto explicando qué pasó: dejar que la promesa se
 * rechace le daría al agente un fallo sin causa, y adivinar es peor que decir
 * "no pude".
 */
async function llamarMcp(nombre: string, args: unknown): Promise<Respuesta> {
  try {
    const r = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: nombre, arguments: args ?? {} },
      }),
    });

    if (!r.ok) {
      return texto(`No pude consultar el catálogo (HTTP ${r.status}). La tienda respondió mal, no es un problema de lo que pediste.`);
    }

    const datos = await r.json();
    if (datos?.error) {
      return texto(`El catálogo rechazó la consulta: ${datos.error.message ?? 'sin detalle'}`);
    }
    // El servidor ya devuelve la forma { content: [...] }.
    if (datos?.result?.content) return datos.result as Respuesta;
    return texto(datos?.result ?? datos);
  } catch (e) {
    const causa = e instanceof Error ? e.message : String(e);
    return texto(`No pude alcanzar el catálogo: ${causa}`);
  }
}

/**
 * `create_checkout` en la página: cotiza de verdad y se detiene antes de cobrar.
 *
 * Por qué no se reenvía al `create_checkout` del servidor, como todas las
 * demás: esa ruta crea un pre-pedido real y un link de Mercado Pago cuando
 * `MCP_CHECKOUT_LIVE` está encendido, y ese candado se lee DENTRO de la ruta —
 * desde el navegador no hay forma de exigir el modo dry. Un agente no puede
 * quedar a un flag de distancia de generar pedidos reales sin que nadie mire.
 *
 * Así que se usa `get_quote`, que existe justo para esto: cotiza contra el
 * catálogo y el stock reales, no cobra, y devuelve el total. El agente obtiene
 * la verdad del servidor —precios que no inventó, líneas consolidadas,
 * disponibilidad verificada— y el enlace al carrito. El clic de pagar es de la
 * persona.
 */
async function proponerCarrito(args: unknown): Promise<Respuesta> {
  const lineas = (args as { items?: Array<{ sku?: string; slug?: string; qty?: number }> })?.items ?? [];

  // Los nombres son los del esquema de `create_checkout` (sku / slug / qty),
  // para que el agente no tenga que aprender dos vocabularios.
  const enlace = enlaceCarritoPrefill(
    lineas.map((l) => ({
      slug: String(l?.slug ?? ''),
      sku: l?.sku ?? null,
      qty: Number(l?.qty ?? 1),
    })),
    { ref: 'webmcp' },
  );

  if (!enlace) {
    return texto('No pude armar el carrito: ninguna de las líneas tenía un producto válido. Pídeme buscar el producto primero con search_products.');
  }

  // La cotización viene del servidor: precios y disponibilidad que la página no
  // calculó ni el modelo inventó.
  const cotizacion = await llamarMcp('get_quote', {
    items: lineas.map((l) => ({ slug: l?.slug, qty: Number(l?.qty ?? 1) })),
    ref: 'webmcp',
  });
  const detalle = cotizacion.content?.[0]?.text ?? 'sin detalle';

  return texto(
    'Carrito COTIZADO, no comprado. La compra la confirma la persona, no el agente.\n\n' +
    `Cotización del servidor (precios y stock reales):\n${detalle}\n\n` +
    `Enlace con los productos ya cargados: ${enlace}\n\n` +
    'Ábrelo para que revise el total y complete el pago.',
  );
}

export default function WebMCP() {
  useEffect(() => {
    const doc = document as Document & {
      modelContext?: {
        registerTool: (t: unknown, o?: { signal?: AbortSignal }) => Promise<unknown>;
      };
    };

    // Sin la API no hay nada que hacer. Ni un warning: la inmensa mayoría de
    // los navegadores todavía no la trae, y no es un error del sitio.
    if (!doc.modelContext?.registerTool) return;

    const control = new AbortController();

    for (const herramienta of herramientasDePagina()) {
      const propone = HERRAMIENTAS_QUE_PROPONEN.has(herramienta.name);

      doc.modelContext
        .registerTool(
          {
            name: herramienta.name,
            description: propone
              ? `${herramienta.description} Prepara el carrito y devuelve el enlace: la compra la confirma la persona.`
              : herramienta.description,
            inputSchema: herramienta.inputSchema,
            execute: (args: unknown) =>
              propone ? proponerCarrito(args) : llamarMcp(herramienta.name, args),
          },
          { signal: control.signal },
        )
        // Un registro que falla —permiso denegado por Permissions-Policy, por
        // ejemplo— no puede tumbar el render. Se ignora esa herramienta.
        .catch(() => {});
    }

    // Al desmontar, se abortan todos los registros de una vez.
    return () => control.abort();
  }, []);

  return null;
}
