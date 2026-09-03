// Resolución de la superficie WebMCP del navegador, compartida por los dos
// componentes que registran herramientas (`WebMCP` y `WebMCPAcciones`) para
// que jamás miren lugares distintos y una capa registre donde la otra no.
//
// `document.modelContext` es la superficie canónica del draft W3C
// (Draft Community Group Report, 26-ago-2026; el getter se mudó de Navigator
// a Document en webmachinelearning/webmcp#184). `navigator.modelContext`
// sobrevive como alias deprecado en implementaciones anteriores y en el
// polyfill @mcp-b — se acepta de fallback, nunca de preferencia.

export type SuperficieWebMCP = {
  registerTool: (t: unknown, o?: { signal?: AbortSignal }) => Promise<unknown>;
};

export function superficieWebMCP(): SuperficieWebMCP | null {
  if (typeof document === 'undefined') return null;
  const doc = document as Document & { modelContext?: Partial<SuperficieWebMCP> };
  const nav = navigator as Navigator & { modelContext?: Partial<SuperficieWebMCP> };
  const mc = doc.modelContext ?? nav.modelContext;
  return typeof mc?.registerTool === 'function' ? (mc as SuperficieWebMCP) : null;
}

/**
 * Carga la copia local del polyfill @mcp-b/global — SOLO para la demo.
 *
 * Se entra con `?webmcp` en la URL; la marca queda en sessionStorage para que
 * una navegación dura a mitad de demo no la pierda. Sin la marca, o si el
 * navegador ya trae la API, no se baja ni un byte: el polyfill pesa 285 KB y
 * un visitante normal no tiene por qué pagarlos. El archivo es vendored
 * (`public/webmcp/global.iife.js`, @mcp-b/global 5.0.1) a propósito: una demo
 * en vivo no puede depender de un CDN de terceros.
 */
export function marcadoParaDemo(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (new URLSearchParams(window.location.search).has('webmcp')) {
      window.sessionStorage.setItem('bk-webmcp-demo', '1');
      return true;
    }
    return window.sessionStorage.getItem('bk-webmcp-demo') === '1';
  } catch {
    return false;
  }
}

let cargando: Promise<void> | null = null;

export function cargarPolyfillDemo(): Promise<void> {
  if (cargando) return cargando;
  cargando = new Promise((resolver) => {
    const s = document.createElement('script');
    s.src = '/webmcp/global.iife.js';
    // Un polyfill que no carga deja todo como estaba: sin API y sin error.
    s.onload = () => resolver();
    s.onerror = () => resolver();
    document.head.appendChild(s);
  });
  return cargando;
}
