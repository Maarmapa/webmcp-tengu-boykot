// Las herramientas que tocan TU carro, no el catálogo.
//
// Es la parte de WebMCP que un servidor MCP no puede hacer: el carro y la lista
// de deseos viven en la sesión de quien mira la página. Y es también la parte
// con más formas silenciosas de fallar — sumar mal deja al agente jurando que
// puso dos unidades cuando puso una.
//
// La aritmética se EJECUTA (acciones.ts no importa nada, así que node --test la
// corre directo). El cableado, que necesita React y el DOM, se comprueba sobre
// el texto fuente.
//
//   node --test lib/webmcp/acciones.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACCIONES_DE_PAGINA, MAX_QTY_POR_LINEA, lineaDeCarro, nombresDeAcciones } from './acciones.ts';

const comp = fs.readFileSync(new URL('../../components/WebMCPAcciones.tsx', import.meta.url), 'utf8');
const webmcp = fs.readFileSync(new URL('../../components/WebMCP.tsx', import.meta.url), 'utf8');
const mcp = fs.readFileSync(new URL('../../app/api/mcp/route.ts', import.meta.url), 'utf8');

const PRODUCTO = {
  slug: 'marcador-copic-sketch-e00',
  name: 'Copic Sketch E00',
  price_clp: 4990,
  image: 'https://boykot.cl/x.jpg',
  cart_variant_id: 123,
};

// ── La aritmética, ejecutada ──────────────────────────────────────────

test('agregar SUMA a lo que ya hay, no lo pisa', () => {
  // `setItem` recibe una cantidad absoluta, pero el agente dice "agregá dos".
  // Pisando, dos llamadas de "agregá uno" dejan una sola unidad y el agente
  // informa que puso dos: miente sin enterarse.
  assert.equal(lineaDeCarro(PRODUCTO, 3, 2).qty, 5);
  assert.equal(lineaDeCarro(PRODUCTO, 0, 1).qty, 1);
});

test('la línea lleva el id que decide el servidor', () => {
  assert.equal(lineaDeCarro(PRODUCTO, 0, 1).variant_id, 123);
});

test('sin id no hay línea', () => {
  // Sin `cart_variant_id` no hay dónde ponerlo; inventar uno acá sería
  // reimplementar el hash del slug en una tercera copia.
  assert.equal(lineaDeCarro({ ...PRODUCTO, cart_variant_id: null }, 0, 1), null);
});

test('sin precio tampoco: una línea sin precio miente el total', () => {
  assert.equal(lineaDeCarro({ ...PRODUCTO, price_clp: null }, 0, 1), null);
  assert.equal(lineaDeCarro({ ...PRODUCTO, price_clp: 0 }, 0, 1), null);
});

test('una qty basura no se convierte en 1', () => {
  // Mismo criterio que create_checkout: {qty:0} es "no lo quiero", y cobrarle
  // una unidad por eso es inventarle una compra a la persona.
  for (const q of [0, -3, NaN, 'dos']) {
    assert.equal(lineaDeCarro(PRODUCTO, 0, q), null, `qty=${String(q)}`);
  }
});

test('el tope por línea se respeta y no se miente', () => {
  assert.equal(lineaDeCarro(PRODUCTO, 19, 5).qty, MAX_QTY_POR_LINEA);
  // Ya en el tope: no hay nada que agregar, así que no se devuelve una línea
  // que diga que sí. Un "listo, agregado" sin cambio es peor que un "no pude".
  assert.equal(lineaDeCarro(PRODUCTO, MAX_QTY_POR_LINEA, 1), null);
});

test('las tres acciones tienen nombre, descripción y esquema', () => {
  assert.deepEqual(nombresDeAcciones(), ['agregar_al_carro', 'ver_mi_carro', 'guardar_en_lista']);
  for (const a of ACCIONES_DE_PAGINA) {
    assert.ok(a.description.length > 40, `${a.name} sin descripción útil`);
    assert.equal(a.inputSchema.type, 'object');
  }
});

test('las descripciones le dicen al agente dónde termina su permiso', () => {
  // Un agente que no sabe si puede cobrar, pregunta de más o hace de más.
  const agregar = ACCIONES_DE_PAGINA.find((a) => a.name === 'agregar_al_carro');
  assert.match(agregar.description, /NO cobra/);
  assert.match(agregar.description, /NO crea pedido/);
});

// ── El cableado ───────────────────────────────────────────────────────

test('ninguna acción toca el camino de la plata', () => {
  assert.doesNotMatch(comp, /create_checkout/);
  assert.doesNotMatch(comp, /payment|mercadopago|checkout/i);
});

test('el carro se llena a la vista, nunca en silencio', () => {
  // Un agente que te cambia el carro sin que lo veas es justo lo que no
  // queremos que se pueda hacer.
  assert.match(comp, /openDrawer: true/);
});

test('el navegador no reimplementa el hash del id de carro', () => {
  // 5381 es la semilla djb2. Si aparece acá, hay una tercera copia del hash
  // esperando a desincronizarse de las otras dos.
  assert.doesNotMatch(comp, /5381/);
  assert.match(comp, /cart_variant_id/);
  assert.match(mcp, /cart_variant_id: slugVariantId\(p\.slug\)/);
});

test('los execute leen el estado de ahora, no el del primer render', () => {
  // Sin la referencia viva, un tool registrado al cargar la página suma sobre
  // el carro vacío del primer render y borra lo que la persona agregó después.
  assert.match(comp, /vivo\.current\.qtys/);
  assert.match(comp, /vivo\.current\.setItem/);
});

test('los hooks solo se montan si el navegador trae WebMCP', () => {
  // useCart() consulta /api/cart al montar: hacerlo en cada visita del sitio,
  // por una API que casi ningún navegador trae, es cobrarle a todo el mundo.
  assert.match(webmcp, /useSyncExternalStore\(noCambia, hayWebMCP/);
  assert.match(webmcp, /soportado \? <WebMCPAcciones \/> : null/);
  assert.doesNotMatch(webmcp, /useCart/);
});
