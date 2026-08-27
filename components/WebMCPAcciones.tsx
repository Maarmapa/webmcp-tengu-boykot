'use client';

// Registra las herramientas que actúan sobre la página: el carro y la lista de
// deseos de quien está mirando (ver `lib/webmcp/acciones`).
//
// Va en un componente aparte de `WebMCP` por una razón concreta: `useCart()`
// consulta `/api/cart` al montar. Si esto viviera en el componente que el
// layout renderiza siempre, cada visita del sitio pagaría esa consulta por una
// función que hoy casi ningún navegador puede usar. `WebMCP` monta esto solo
// cuando `document.modelContext` existe de verdad.

import { useEffect, useRef } from 'react';
import { useCart } from '@/lib/use-cart';
import { useWishlist } from '@/lib/use-wishlist';
import { ACCIONES_DE_PAGINA, lineaDeCarro, type ProductoParaCarro } from '@/lib/webmcp/acciones';

type Respuesta = { content: Array<{ type: 'text'; text: string }> };

function texto(valor: unknown): Respuesta {
  const cuerpo = typeof valor === 'string' ? valor : JSON.stringify(valor, null, 2);
  return { content: [{ type: 'text', text: cuerpo }] };
}

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;

/**
 * Ficha del producto, pedida al MCP del propio sitio.
 *
 * La página no inventa precios ni ids: los pide al mismo endpoint que le
 * contesta a un cliente MCP externo. `cart_variant_id` viene de ahí a
 * propósito — el id del carro es un hash del slug que ya está escrito dos
 * veces en el repo, y una tercera copia en el navegador era la forma segura de
 * que algún día dejaran de coincidir.
 */
async function fichaDeProducto(slug: string): Promise<ProductoParaCarro | null> {
  try {
    const r = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: 'get_product', arguments: { slug } },
      }),
    });
    if (!r.ok) return null;
    const datos = await r.json();
    const bruto = datos?.result?.content?.[0]?.text;
    if (typeof bruto !== 'string') return null;
    const p = JSON.parse(bruto) as ProductoParaCarro & { error?: string };
    return p?.error ? null : p;
  } catch {
    return null;
  }
}

export default function WebMCPAcciones() {
  const { qtys, cart, setItem } = useCart();
  const wishlist = useWishlist();

  // Los `execute` se registran una sola vez, pero tienen que ver el estado de
  // AHORA: sin la referencia, un tool registrado al cargar la página sumaría
  // sobre el carro vacío del primer render y borraría lo que la persona agregó
  // después. Por eso el registro no depende del estado — lo lee al ejecutarse.
  const vivo = useRef({ qtys, cart, setItem, wishlist });
  // Sin lista de dependencias: corre después de CADA render, que es justo lo
  // que se necesita para que la referencia esté siempre al día. (Escribirla
  // durante el render sería más corto y está prohibido, con razón.)
  useEffect(() => {
    vivo.current = { qtys, cart, setItem, wishlist };
  });

  useEffect(() => {
    const doc = document as Document & {
      modelContext?: {
        registerTool: (t: unknown, o?: { signal?: AbortSignal }) => Promise<unknown>;
      };
    };
    if (!doc.modelContext?.registerTool) return;

    const control = new AbortController();

    async function agregarAlCarro(args: unknown): Promise<Respuesta> {
      const items = (args as { items?: Array<{ slug?: string; qty?: number }> })?.items ?? [];
      if (items.length === 0) {
        return texto('No me pasaste productos. Cada item necesita el slug del catálogo (usá search_products para encontrarlo) y opcionalmente qty.');
      }

      const puestos: string[] = [];
      const fallaron: string[] = [];

      for (const item of items.slice(0, 20)) {
        const slug = String(item?.slug ?? '').trim();
        if (!slug) { fallaron.push('(item sin slug)'); continue; }

        const ficha = await fichaDeProducto(slug);
        if (!ficha) { fallaron.push(`${slug}: no existe en el catálogo vendible`); continue; }

        const linea = lineaDeCarro(ficha, vivo.current.qtys[ficha.cart_variant_id ?? -1] ?? 0, Number(item?.qty ?? 1));
        if (!linea) { fallaron.push(`${slug}: no se pudo agregar (sin precio, sin id, o ya está en el tope por línea)`); continue; }

        // openDrawer: que la persona VEA lo que el agente puso. Un carro que
        // cambia en silencio es exactamente lo que no queremos que un agente
        // pueda hacer.
        await vivo.current.setItem({ ...linea, openDrawer: true });
        puestos.push(`${ficha.name} ×${linea.qty} (${clp(ficha.price_clp ?? 0)} c/u)`);
      }

      if (puestos.length === 0) {
        return texto(`No pude agregar nada:\n- ${fallaron.join('\n- ')}`);
      }
      return texto(
        `Listo, en el carro (se abrió el panel para que lo vea):\n- ${puestos.join('\n- ')}` +
        (fallaron.length ? `\n\nNo entraron:\n- ${fallaron.join('\n- ')}` : '') +
        '\n\nEl carro está armado, NO comprado: el pago lo confirma la persona.',
      );
    }

    function verMiCarro(): Respuesta {
      const c = vivo.current.cart;
      const lineas = Array.isArray(c?.items) ? c.items : [];
      if (lineas.length === 0) {
        return texto('El carro está vacío en esta pestaña.');
      }
      return texto(
        'En el carro ahora:\n' +
        lineas.map((i) => `- ${i.name} ×${i.qty} — ${clp(i.unit_price_clp * i.qty)}`).join('\n') +
        `\n\nSubtotal: ${clp(c?.subtotal_clp ?? 0)} (el envío se calcula en la caja).`,
      );
    }

    async function guardarEnLista(args: unknown): Promise<Respuesta> {
      const slug = String((args as { slug?: string })?.slug ?? '').trim();
      if (!slug) return texto('Falta el slug del producto.');

      const ficha = await fichaDeProducto(slug);
      if (!ficha) return texto(`No encontré "${slug}" en el catálogo vendible.`);

      const p = ficha as ProductoParaCarro & { brand?: string | null };
      await vivo.current.wishlist.add({
        slug: ficha.slug,
        name: ficha.name,
        image: ficha.image,
        price: ficha.price_clp,
        brand: p.brand ?? null,
      });
      return texto(`Guardado en la lista de deseos: ${ficha.name}. No se cobró ni se reservó nada.`);
    }

    const ejecutar: Record<string, (args: unknown) => Promise<Respuesta> | Respuesta> = {
      agregar_al_carro: agregarAlCarro,
      ver_mi_carro: verMiCarro,
      guardar_en_lista: guardarEnLista,
    };

    for (const accion of ACCIONES_DE_PAGINA) {
      const correr = ejecutar[accion.name];
      if (!correr) continue;
      doc.modelContext
        .registerTool({ ...accion, execute: correr }, { signal: control.signal })
        .catch(() => {});
    }

    return () => control.abort();
  }, []);

  return null;
}
