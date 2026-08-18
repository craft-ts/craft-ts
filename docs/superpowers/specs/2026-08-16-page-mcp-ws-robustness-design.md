# Page MCP WebSocket robustness

## Problem

The live-page MCP already waits through `ng serve` reload (same `clientId`,
card kept ~20s). It fails in the cases that feel “WebSocket is flaky”:

- Close the demo tab and open another → old card stays `reloading`, new tab
  has a new id → `page` without `clientId` is ambiguous, or waits on the dead
  id.
- Duplicate tab copies `sessionStorage` → two sockets, same id → last hello
  kills the first → reconnect fight.
- `registry.clients` lists only OPEN sockets; `page` counts every card,
  including ghosts.
- No heartbeat: a half-open socket hangs until MCP timeout.
- Errors do not say whether the MCP is down, the tab is gone, or two live
  tabs exist.

## Goal

Same broker (`ws://127.0.0.1:3333`), same tool `page`. Make identity and
diagnostics boring: one live tab just works; several live tabs require
`clientId`; a closed tab is gone, not “reloading”.

## Locked decisions

1. **One `ready` wins.** `page` without `clientId`: if exactly one card is
   `ready` with an open socket, use it, even if other cards are `reloading` /
   `connecting`. Never “latest among several ready”.
2. **Several `ready` → explicit `clientId`.** Error lists id, status, last url.
3. **Zero `ready`, one card** (typical HMR): wait on that card (current
   timeout / reloading message).
4. **Zero `ready`, several cards:** do not wait. Error lists the ghosts.
5. **Goodbye ≠ reload.** `pagehide` with `persisted === false` sends
   `page/goodbye` and the broker **deletes** the card immediately. Socket
   close without goodbye stays `reloading` (rebuild, F5).
6. **Duplicate open id:** do not close the existing socket. Mint a new id for
   the newcomer, reply `hello/ok` with that id, the tab persists it.
7. **Heartbeat** is protocol ping from the Node `ws` server (browsers pong
   automatically). Missed pong → treat as socket close (`reloading`, not
   goodbye). Laptop sleep can recover.
8. **`registry.clients`** lists every card (including `reloading`) with
   `status`, `generation`, last url. `registry.list` / mutations still require
   an OPEN socket.
9. **No pairing button** in this slice. No new port, no CDP, no transport
   change.
10. Dev-only badge in the demo (not a named control): connected /
    reconnecting + short id.

## Error strings (verbatim)

- `page client is not connected` — zero cards
- `page client "<id>" is not connected` — unknown id (closed + goodbye, or
  never seen)
- `Multiple ready page clients; clientId is required. Available clients: <id> ready <url>, <id> ready <url>`
- `No ready page client. Reloading: <id> (last url <url>), <id> (last url <url>)`
- `page reloading since <Ns>, last url <url>, generation <g> → still <g>` —
  wait timeout on a targeted or single reloading card

## Out of scope

- “Use this tab” lease UI
- Replacing WebSocket
- Changing `page` act / goto / live-read behaviour
- Publishing `page` on `@craft-ng/mcp`
