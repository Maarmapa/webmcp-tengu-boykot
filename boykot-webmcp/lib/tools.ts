// Qué herramientas de Boykot se exponen DENTRO de la página, vía WebMCP.
//
// WebMCP (`document.modelContext.registerTool`) es el otro extremo de lo que ya
// hace `/api/mcp`: en vez de que un cliente MCP se conecte al servidor desde
// fuera, la propia página le ofrece herramientas al agente que acompaña a la
// persona mientras navega. Las dos superficies comparten las definiciones de
// `lib/mcp-tools`, así que un agente ve los mismos nombres y esquemas por
// cualquiera de los dos caminos.
//
// La diferencia está en QUÉ se expone, y es deliberada.
//
// 1. **Las herramientas sensibles no se registran nunca.** `get_recent_orders`,
//    `get_sales_summary` y compañía son superficie de administración: viven
//    detrás de una credencial en el servidor. Una pestaña del navegador es un
//    entorno que la tienda no controla, y el agente que corre ahí es de la
//    persona, no de la tienda. Que la lista salga de `SENSITIVE_TOOLS` y no de
//    una lista escrita a mano es a propósito: si mañana alguien marca otra
//    herramienta como sensible, esta capa la excluye sola.
//
// 2. **Escribir se propone, no se ejecuta.** `create_checkout` cobra dinero.
//    Un agente puede armar el carrito y dejarlo listo, pero el clic de comprar
//    es de la persona. Acá eso no es una convención: la herramienta de escritura
//    devuelve un enlace al carrito prellenado y termina ahí.
//
// 3. **La verdad sigue siendo del servidor.** Cada `execute` llama al endpoint
//    que ya existe. La página no inventa precios ni stock, y el agente tampoco:
//    ve exactamente lo mismo que vería un cliente MCP externo.

import { SENSITIVE_TOOLS, TOOLS } from '@/lib/mcp-tools';

/** Herramientas de escritura: se pueden ofrecer, pero preparan — no cierran. */
export const HERRAMIENTAS_QUE_PROPONEN = new Set(['create_checkout']);

/**
 * Las que sí se registran en la página.
 *
 * Se calcula desde `TOOLS` quitando `SENSITIVE_TOOLS`, en vez de enumerar a
 * mano las buenas. Una lista blanca escrita a mano envejece en silencio: se
 * agrega una herramienta de administración, nadie se acuerda de esta capa, y
 * queda expuesta. Restando, el default es seguro.
 */
export function herramientasDePagina() {
  return TOOLS.filter((t) => !SENSITIVE_TOOLS.has(t.name));
}

/** Nombres, para poder afirmar cosas sobre el conjunto sin cargar el DOM. */
export function nombresDePagina(): string[] {
  return herramientasDePagina().map((t) => t.name);
}
