# Tengu & Boykot — two real Chilean businesses your agent can actually use

**Live URLs:** https://tengu-deploy.vercel.app (restaurant) · https://boykot-nu.vercel.app (art-supply store)
**Repo:** https://github.com/Maarmapa/webmcp-tengu-boykot (MIT) — both sites with full commit history via `git subtree`; upstreams: https://github.com/Maarmapa/tengu-web · https://github.com/Maarmapa/boykot-webmcp

---

## Why this is a strong fit for WebMCP

Restaurants and specialty shops are the most-attempted and worst-served agent tasks on the
web. Every assistant can *find* a restaurant or a store; almost none can *do* anything with
one. The menu lives in a PDF, the prices are stale, the stock is a guess, and the booking or
cart widget is a third-party iframe an agent cannot reason about. So the agent guesses —
and guesses wrong about the one thing the person is paying for.

Both businesses here are real and operating: **Tengu**, a kappo restaurant in Santiago de
Chile, and **Boykot**, an art and graffiti supply store running since 2010 with ~3,000 SKUs.
Neither is a demo. The menu, the prices, the per-colour stock and the availability behind
these tools are the ones the businesses honor tonight.

The two verticals have nothing in common — and that is the point. The same pattern works
for both, which is the question a WebMCP jury is really asking: does this generalize?

## What people and agents can do together that was hard before

**The interesting tools are not the ones that read. They are the ones that stop.**

At Tengu, `preparar_reserva` fills the reservation form on the page with the party size,
date, time and name the agent gathered in conversation — **and then stops.** It does not
send. The form is left visible, filled and scrolled into view, for the human to check and
send. Sending goes through the restaurant's WhatsApp, the channel the host actually answers.

At Boykot, `agregar_al_carro` fills the visitor's own cart — the state that lives in *their*
tab, which no remote MCP server can touch — and opens the cart panel. `create_checkout` on
the page only *prepares* the cart and returns the link; paying stays a human click.

That is the division of labour we wanted: the agent does the tedious part (parsing "a table
for four next Friday, my wife doesn't eat raw fish", or turning "I want to paint leather
sneakers" into a kit with what's in stock today), and the human keeps the part that costs
money and social capital. Nothing is booked or bought behind anyone's back.

Before WebMCP the same flow required scraping our DOM — brittle, and it breaks every time we
ship — or an agent typing into fields by pixel position. Now the page declares what it can
do, and the agent uses it.

The read tools matter for a subtler reason: **grounding.** `get_carta` returns the live menu
with real CLP prices, sectioned; `get_guia` returns guides the restaurant itself wrote about
bluefin tuna, sake and kappo cooking. At Boykot, `get_color_card` returns live stock for
every one of 350+ colours of a marker line, and `plan_project` turns a project into a
buyable kit with why-each-piece and what's out of stock. An agent asked "what's the sake
situation at Tengu" or "can I get E00 today" answers from the business's own data instead
of a 2023 blog post — and the business, for the first time, is the author of what agents
say about it.

## How we implemented WebMCP

Both sites register tools on `document.modelContext` (the current draft surface;
`navigator.modelContext` is accepted only as the deprecated fallback), feature-detected so
each page degrades to a normal website when the API is absent:

```js
var mc = document.modelContext || navigator.modelContext;
if (!mc || typeof mc.registerTool !== 'function') return;
```

**Tengu** — static HTML + vanilla JS, zero npm dependencies on the page. Five tools:

| tool | what it does |
|---|---|
| `get_carta` | official menu, real CLP prices; index of sections or the detail of one |
| `buscar_plato` | search dishes, drinks, wines and sake |
| `get_guia` | long-form guides written by the restaurant (sake, bluefin, kappo) |
| `get_info` | address, hours, how to book |
| `preparar_reserva` | switches to the booking form, fills it, marks each field it touched and reports what it could not apply — never sends |

The read tools are thin proxies to the same `/api/mcp` JSON-RPC server the restaurant runs
for out-of-page agents, so a browser agent and a server agent get byte-identical answers.
One source of truth, two transports. `preparar_reserva` is page-only by nature: it acts on
the visitor's form.

**Boykot** — Next.js store. Thirteen tools in the page: the ten catalog tools of the store's
public MCP server (`search_products`, `get_product`, `get_color_card`, `plan_project`,
`search_guides`, `list_brands`, `get_quote`, `create_checkout`, `subscribe_back_in_stock`,
`get_promotions`) plus three page-state tools a remote server cannot offer
(`agregar_al_carro`, `ver_mi_carro`, `guardar_en_lista`). Two design decisions worth
stealing:

1. **Tool exposure is a subtraction, not an allowlist**: `pageTools = ALL_TOOLS −
   SENSITIVE_TOOLS`. Allowlists age silently; subtraction keeps the default safe when someone
   adds an admin tool later.
2. **Buying proposes, never executes.** The page version of `create_checkout` prepares the
   cart and returns the link; the money click is the person's.

Both sites run the API **natively** through the WebMCP origin trial (Chrome 149+ and Edge 150+
tokens in each page head). Tengu additionally ships the `@mcp-b/global` polyfill behind a
`?webmcp` flag for browsers without the trial.

**Deliberately not exposed:** anything that spends money or commits either business. No
payment, no confirmation, no cancellation, no back-office tools.

## Prior work vs. work in the submission period

Both sites existed before the challenge; **everything WebMCP was built inside the submission
period (Aug 25 – Sep 3, 2026)**:

- **Tengu** (site online since March 2026): WebMCP tools first shipped 2026-08-28
  (`1517688`), draft-surface alignment and demo polyfill 2026-08-29 (`f3e9fde`), plain return
  values 2026-08-29 (`9cf82d2`), reservation MCP sandbox 2026-08-29 (`7f05f36`), `get_guia`
  in the page and MIT license 2026-09-03. Full history in the public repo.
- **Boykot** (store online since 2010; Next.js front since 2026): WebMCP layer PRs #102–#106
  (2026-08-26/27), draft-surface + polyfill gate PR #112 (2026-09-01), origin-trial tokens
  PR #144 and agent docs PR #145 (2026-09-02). The store's full codebase is private (it holds
  the back-office); the WebMCP layer is published verbatim in `boykot-webmcp`.

## How to try it

- **Chrome 149+ / Edge 150+**: open https://tengu-deploy.vercel.app and
  https://boykot-nu.vercel.app — the tools register natively via origin trial. In other
  browsers, https://tengu-deploy.vercel.app/?webmcp loads the polyfill.
- Ask the agent: *"What sake do they have, and what's the most expensive thing on the menu?"*
  then *"Book me a table for four next Friday at 8pm, name Mario."* — watch the form fill and
  **not** send.
- At Boykot: *"I want to paint leather sneakers, what do I need and is it in stock?"* then
  *"Add the sealer to my cart."* — the cart fills, nothing is charged.

## Stack

Tengu: static HTML + vanilla JS on Vercel; the reservation engine behind it (Postgres via
`SECURITY DEFINER` functions, RLS deny-all) is exposed to agents only as a **sandbox MCP**
(`/api/reservas-mcp`) that never reaches the restaurant. Boykot: Next.js on Vercel, Supabase,
live stock from the store's ERP; the page never holds a database credential.
