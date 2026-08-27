# Boykot WebMCP — a real art-supply store that hands agents its tools

**The WebMCP Challenge submission.** Boykot ([boykot.cl](https://www.boykot.cl)) is a graffiti & art-materials store in Santiago de Chile, running since 2010. This repo contains the WebMCP layer that lets an AI agent operate the store's own page **through tools the site itself exposes** — instead of scraping the DOM or asking the user to delegate credentials.

**Live demo:** https://boykot-nu.vercel.app (requires a browser with the WebMCP origin trial enabled — Chrome 149+ / Edge 150+).

## What the agent gets

**Read tools** (`lib/tools.ts`) — catalog as functions: product lookup, real per-color stock (`get_color_card`: 250+ colors of a single spray line with live availability), shipping quotes. Backed by the store's public MCP (`/api/mcp`), so the data is the same the business runs on.

**Page-state tools** (`lib/acciones.ts`) — the part a remote MCP server *cannot* do, because cart and wishlist live in the viewer's session:
- `agregar_al_carro` — fills the visible cart and opens the panel
- `ver_mi_carro` — reads what this visitor has
- `guardar_en_lista` — wishlist

## Design decisions worth stealing

1. **`document.modelContext`, not `navigator.modelContext`.** Most tutorials copy each other and get this wrong; the spec repo is the source of truth. With the wrong global the whole layer silently no-ops.
2. **Tool exposure is a subtraction, not an allowlist.** `pageTools = ALL_TOOLS − SENSITIVE_TOOLS`. Allowlists age silently; subtraction keeps the default safe.
3. **Buying quotes, never executes.** The money line is explicit in the tool descriptions: filling a cart is reversible with one click, paying is not — so no tool touches checkout execution.
4. **Additive amounts.** `agregar_al_carro` treats quantities as increments, because that is how agents phrase intent ("add two more") — an absolute-set API makes the agent lie without knowing.
5. **The server decides ids.** The browser never re-implements the store's variant hashing; `get_product` returns the cart id ready to use.

## Repo layout

```
components/  WebMCP.tsx, WebMCPAcciones.tsx   — mount + tool registration (React)
lib/         tools.ts, acciones.ts (+ node --test suites, no deps)
```

These files are extracted verbatim from the store's private monorepo; the surrounding Next.js app (routes, middleware, MCP server) stays private because it carries business logic. The live deployment runs the full integration.

## Tests

```bash
node --test lib/tools.test.mjs lib/acciones.test.mjs
```

Plain `node --test` over dependency-free `.ts`/`.mjs` (Node 22 type-stripping) — including mutation-tested cart arithmetic.

---

Built by [Boykot](https://www.boykot.cl) (Mario Maldonado) with Claude Code.
