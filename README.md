# Tengu & Boykot — two real Chilean businesses your agent can actually use

Submission to **The WebMCP Challenge** (Devpost, Aug 25 – Sep 4, 2026). One pattern, two
businesses that have nothing in common: a kappo restaurant and an art-supply store expose
their menu, catalog, stock and forms as WebMCP tools — and **the tools that matter stop
before committing you**: the agent fills the reservation or the cart and leaves it for the
human to send or pay.

| | Tengu (restaurant) | Boykot (art-supply store) |
|---|---|---|
| Live | https://tengu-deploy.vercel.app | https://boykot-nu.vercel.app |
| Tools in the page | 5 (`get_carta`, `buscar_plato`, `get_guia`, `get_info`, `preparar_reserva`) | 13 (10 catalog + `agregar_al_carro`, `ver_mi_carro`, `guardar_en_lista`) |
| Surface | `document.modelContext` (polyfill behind `?webmcp`) | `document.modelContext`, **native via origin trial** (Chrome 149+ / Edge 150+) |
| Code | [`tengu-web/`](./tengu-web) — complete static site | [`boykot-webmcp/`](./boykot-webmcp) — the store's WebMCP layer (store codebase is private) |
| Upstream repo (full history) | https://github.com/Maarmapa/tengu-web | https://github.com/Maarmapa/boykot-webmcp |

Both folders are `git subtree` copies of the upstream repos **with their commit history
preserved**, so the work done inside the submission period is verifiable here:
`git log --since=2026-08-25 -- tengu-web` and `git log --since=2026-08-25 -- boykot-webmcp`.

- **Submission text:** [`SUBMISSION.md`](./SUBMISSION.md)
- **How to try it:** open the live URLs in Chrome 149+/Edge 150+ (Boykot registers natively);
  for Tengu enable `chrome://flags/#enable-webmcp-testing` or open
  https://tengu-deploy.vercel.app/?webmcp. Then ask the agent for the sake list and to
  *"book a table for four next Friday at 8pm"* — watch the form fill and **not** send.
- **License:** MIT (this repo and both upstreams).
