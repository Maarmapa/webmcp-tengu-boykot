// Qué se expone en la página, y sobre todo qué no.
//
// La prueba que importa es la tercera: ninguna herramienta sensible puede
// terminar registrada en el navegador. Es el mismo tipo de guarda que
// storefront-mcp tiene contra las herramientas de borrado — una regla que se
// verifica sola en vez de confiarse a que alguien la recuerde.
//
//   node --test lib/webmcp/tools.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Los módulos son TypeScript y este proyecto no tiene runner de TS, así que se
// leen como texto y se extraen los nombres. Es menos elegante que importarlos,
// y a cambio corre en cualquier parte sin instalar nada.
const fuente = fs.readFileSync(new URL('../mcp-tools.ts', import.meta.url), 'utf8');

function nombresDeclarados() {
  return [...fuente.matchAll(/name: '([a-z0-9_.]+)'/g)].map((m) => m[1]);
}

function sensibles() {
  const bloque = fuente.match(/SENSITIVE_TOOLS = new Set\(\[([\s\S]*?)\]\)/);
  return [...bloque[1].matchAll(/'([a-z0-9_.]+)'/g)].map((m) => m[1]);
}

test('el catálogo declara herramientas y algunas están marcadas sensibles', () => {
  assert.ok(nombresDeclarados().length >= 10);
  assert.ok(sensibles().length > 0);
});

test('ninguna herramienta sensible se expone en la página', () => {
  // La selección es una resta, no una lista blanca: TOOLS menos SENSITIVE_TOOLS.
  // Si mañana alguien marca otra como sensible, sale sola de la página.
  const enPagina = nombresDeclarados().filter((n) => !sensibles().includes(n));
  for (const s of sensibles()) {
    assert.ok(
      !enPagina.includes(s),
      `${s} está marcada sensible y no puede registrarse en el navegador`,
    );
  }
});

test('la selección se calcula restando, no enumerando a mano', () => {
  // Una lista blanca escrita a mano envejece en silencio. Si este archivo pasa
  // a enumerar nombres, el default deja de ser seguro.
  const seleccion = fs.readFileSync(new URL('./tools.ts', import.meta.url), 'utf8');
  assert.match(seleccion, /SENSITIVE_TOOLS\.has\(t\.name\)/);
  assert.doesNotMatch(seleccion, /const LISTA_BLANCA|ALLOWED_TOOLS\s*=\s*\[/);
});

test('create_checkout está declarada como que propone, no ejecuta', () => {
  const seleccion = fs.readFileSync(new URL('./tools.ts', import.meta.url), 'utf8');
  assert.match(seleccion, /HERRAMIENTAS_QUE_PROPONEN[\s\S]*?'create_checkout'/);
});

test('el componente no llama al checkout del servidor', () => {
  // El punto entero de "proponer, no ejecutar": la herramienta de compra
  // construye un enlace y termina. Si algún día alguien la conecta a /api/mcp
  // como las demás, esto falla.
  const comp = fs.readFileSync(new URL('../../components/WebMCP.tsx', import.meta.url), 'utf8');
  assert.match(comp, /propone \? proponerCarrito\(args\)/);
  assert.match(comp, /llamarMcp\('get_quote'/);
  assert.match(comp, /enlaceCarritoPrefill/);
});

test('cada execute reenvía al MCP del propio sitio, sin segunda implementación', () => {
  const comp = fs.readFileSync(new URL('../../components/WebMCP.tsx', import.meta.url), 'utf8');
  assert.match(comp, /fetch\('\/api\/mcp'/);
  assert.match(comp, /method: 'tools\/call'/);
});

test('usa document.modelContext, que es la API vigente', () => {
  // La resolución vive en UN solo lugar (lib/webmcp/superficie.ts) para que
  // las dos capas jamás miren superficies distintas. `document` es la canónica
  // del draft; `navigator` solo se acepta como alias deprecado de fallback —
  // nunca de preferencia — y ningún componente lo toca directo.
  const sup = fs.readFileSync(new URL('./superficie.ts', import.meta.url), 'utf8');
  assert.match(sup, /doc\.modelContext \?\? nav\.modelContext/);
  const comp = fs.readFileSync(new URL('../../components/WebMCP.tsx', import.meta.url), 'utf8');
  assert.match(comp, /superficieWebMCP\(\)/);
  assert.doesNotMatch(comp, /navigator\.modelContext/);
  const acciones = fs.readFileSync(new URL('../../components/WebMCPAcciones.tsx', import.meta.url), 'utf8');
  assert.match(acciones, /superficieWebMCP\(\)/);
  assert.doesNotMatch(acciones, /navigator\.modelContext/);
});

test('degrada en silencio si el navegador no trae WebMCP', () => {
  // Y la única puerta al polyfill es el flag explícito de demo: sin `?webmcp`
  // un visitante normal no baja los 285 KB ni ve superficie nueva.
  const comp = fs.readFileSync(new URL('../../components/WebMCP.tsx', import.meta.url), 'utf8');
  assert.match(comp, /if \(!mc && marcadoParaDemo\(\)\)/);
  assert.match(comp, /if \(!mc \|\| !vivo\) return;/);
});

test('los registros se sueltan al desmontar', () => {
  const comp = fs.readFileSync(new URL('../../components/WebMCP.tsx', import.meta.url), 'utf8');
  assert.match(comp, /new AbortController\(\)/);
  assert.match(comp, /control\.abort\(\)/);
});

test('las tools de la página devuelven valores planos, no el envoltorio de MCP', () => {
  // El spec define `callback ToolExecuteCallback = Promise<any>` y el navegador
  // serializa a JSON lo que se retorne: no hay ModelContextToolResult. El
  // `{content:[{type:'text'}]}` es el formato de MCP POR EL CABLE — reenviarlo
  // desde la página le da al agente el envoltorio del transporte en vez de la
  // respuesta. El único lugar donde ese formato puede aparecer es al
  // DESENVOLVER lo que contesta el MCP remoto.
  const comp = fs.readFileSync(new URL('../../components/WebMCP.tsx', import.meta.url), 'utf8');
  const acciones = fs.readFileSync(new URL('../../components/WebMCPAcciones.tsx', import.meta.url), 'utf8');
  // Se miran los COMENTARIOS aparte: la nota que explica por qué no se usa el
  // envoltorio nombra al envoltorio, y un grep ingenuo se caza a sí mismo.
  const soloCodigo = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const src of [comp, acciones]) {
    assert.doesNotMatch(soloCodigo(src), /content:\s*\[\s*\{\s*type:\s*'text'/);
    assert.match(src, /type Respuesta = string/);
  }
  // Y la costura que desenvuelve la respuesta remota sigue existiendo.
  assert.match(comp, /datos\?\.result\?\.content/);
});
