# Live-page MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single MCP tool `page` on `@ng-craft/function-registry-mcp` that reads and drives named controls on the already-open `ng serve` tab, then document it without putting `page` in `@craft-ng/mcp`.

**Architecture:** The existing WS broker (`ws://127.0.0.1:3333`) keeps a client card across reload. The browser publishes a `page/surface` of `data-craft-name` controls and executes `page` requests (fill / click / press) in-page. The MCP tool `page` waits for `ready` (no agent-side polling), optionally runs `act`, then returns the requested detail. Registry tools stay on the same process and keep their contract except sharing the broker.

**Tech Stack:** TypeScript, `ws`, MCP SDK + Zod, Angular/jsdom Vitest in the demo, Playwright e2e, VitePress docs.

## Global Constraints

- Same broker, same `clientId` `sessionStorage`, no new port, no new npm package.
- Tool name is `page`; WS method is `page`. Registry tools stay `registry.*`.
- `clientId` omitted only when exactly one client card exists; never “latest”.
- Default `detail` is `'controls'`. `'dom-styles'` is opt-in. Cap 256 KiB JSON.
- Default `timeoutMs` is `20_000`. Timeout text: `page reloading since …, last url …, generation N → still N`.
- `id` is the literal `data-craft-name` (local name). Do not prefix with component.
- No `page` tool and no WS in `@craft-ng/mcp`.
- Dev only. Docs in English. Snippets only for named hyperscript, not MCP dumps.
- Do not change `registry.*` contracts except what coexistence on the broker requires (`registry.clients` still lists only OPEN sockets).

## File map

- `packages/function-registry-mcp/src/protocol.ts` — page types + method `'page'`
- `packages/function-registry-mcp/src/bridge-broker.ts` — client status, surface cache, `page` wait
- `packages/function-registry-mcp/src/mcp-server.ts` — tool `page`
- `apps/demo/src/app/page-actor.ts` — collect / act / dom-styles
- `apps/demo/src/app/function-registry-bridge.ts` — hello + surface + `page` handler
- Tests colocated; e2e `apps/demo/e2e/page-mcp.spec.ts`
- Docs: `apps/docs/index.md`, `apps/docs/guide/ai/dev-page.md`, sidebar, `resources/ai-agents.md`, `reference/index.md`
- Skills: `.agents/skills/ng-craft-dev-page-mcp/` + pointer in registry skill
- `packages/function-registry-mcp/README.md`, `packages/mcp/content/best-practices.md`, `content/agents.md`

## Shared types (lock these names)

```ts
type PageMatch = { readonly index?: number; readonly track?: string };

type PageAction =
  | { readonly id: string; readonly fill: unknown; readonly match?: PageMatch }
  | { readonly id: string; readonly press?: string; readonly match?: PageMatch }
  | { readonly id: string; readonly match?: PageMatch };

type PageParams = {
  readonly clientId?: string;
  readonly act?: readonly PageAction[];
  readonly detail?: 'controls' | 'dom-styles';
  readonly styles?: readonly string[];
  readonly timeoutMs?: number;
};

type PageControl = {
  readonly id: string;
  readonly role: string;
  readonly name: string;
  readonly value?: unknown;
  readonly enabled: boolean;
  readonly index: number;
  readonly track?: string;
};

type PageControls = {
  readonly generation: number;
  readonly surfaceRev: number;
  readonly url: string;
  readonly title?: string;
  readonly status: 'ready';
  readonly controls: readonly PageControl[];
};
```

Error strings (verbatim):

- `page client is not connected`
- `Multiple page clients are connected; clientId is required. Available clients: …`
- `page client "<id>" is not connected`
- `control "<id>" is not available`
- `control "<id>" is ambiguous (N instances); pass match.index or match.track`
- `control "<id>" is disabled`
- `fill is not supported on role "<role>"`
- `page reloading since <Ns>, last url <url>, generation <g> → still <g>`
- `dom-styles exceeds size cap`

Default style whitelist: `display`, `visibility`, `opacity`, `color`, `background-color`, `font-size`, `overflow`, `position`.

---

### Task 1: Broker client lifecycle

**Files:**
- Modify: `packages/function-registry-mcp/src/protocol.ts`
- Modify: `packages/function-registry-mcp/src/bridge-broker.ts`
- Test: `packages/function-registry-mcp/src/bridge-broker.spec.ts`

**Produces:** `ClientStatus = 'reloading' | 'connecting' | 'ready'`; `generation` +1 on hello; card kept on close; `page/surface` stored; `registry.clients` still OPEN-only.

- [ ] Write failing tests: disconnect keeps the card; hello increments `generation` and sets `connecting`; first `page/surface` sets `ready` and bumps `surfaceRev`; unknown `clientId` for `page` throws `page client is not connected`; two cards require `clientId`.
- [ ] Implement the lifecycle in the broker.
- [ ] Run `npm test --workspace @ng-craft/function-registry-mcp`

### Task 2: Broker `page` request (memory + wait + forward)

**Files:**
- Modify: `packages/function-registry-mcp/src/bridge-broker.ts`
- Test: `packages/function-registry-mcp/src/bridge-broker.spec.ts`

**Produces:** `request('page', params)` waits until `ready` (no sleep in the MCP client), returns cached surface when `act` is omitted, forwards `act` then returns the browser result, times out with the reloading message, retries in-flight `page` after reconnect.

- [ ] Write failing tests for memory read, wait across close+hello+surface, timeout, act forward, disconnect-during-act wait.
- [ ] Implement waiters + `page` forwarding.
- [ ] Run the broker tests.

### Task 3: MCP tool `page`

**Files:**
- Modify: `packages/function-registry-mcp/src/mcp-server.ts`
- Test: `packages/function-registry-mcp/src/mcp-server.spec.ts`

- [ ] Failing test: tool list includes `page`; call relays `page` with `clientId` / `act` / `detail` / `styles` / `timeoutMs`; `act` present ⇒ `destructiveHint: true` is not required per-call — annotate as mutating when the schema allows `act`.
- [ ] Register the tool. Schema: optional `clientId`, `act` array, `detail` enum, `styles` string array, `timeoutMs` number.
- [ ] Assert `packages/mcp/src/mcp-server.ts` still has no `page` tool (existing spec already lists tools).

### Task 4: In-page actor

**Files:**
- Create: `apps/demo/src/app/page-actor.ts`
- Test: `apps/demo/src/app/page-actor.spec.ts`

**Produces:** `collectPageControls(root)`, `applyPageActions(root, act)`, `captureDomStyles(root, styles?)`.

Fill: set `value`/`checked` then one `input` or `change`, then `blur` (covers CraftFieldDirective). Click: `click()` if enabled. Ambiguous id without `match` errors and lists index/track. Batch stops on first error. `track` from ancestor comment `craft-each:<key>:start`. `dom-styles` includes `display:none` nodes; `styles: []` omits computed styles; default whitelist; throw `dom-styles exceeds size cap` above 256 KiB.

- [ ] Write failing actor tests (field fill+touched, `*input` fill, named button click, batch stop-on-error, each ambiguity + index, whitelist, hidden node, default controls have no DOM tree).
- [ ] Implement the actor.
- [ ] Run `npx nx test demo -- src/app/page-actor.spec.ts` (or the demo unit-test target).

### Task 5: Bridge integration

**Files:**
- Modify: `apps/demo/src/app/function-registry-bridge.ts`
- Test: `apps/demo/src/app/function-registry-bridge.spec.ts`

On socket open: hello + registry snapshot + `page/surface`. Observe DOM and republish surface (debounce via microtask). Handle `method === 'page'`: run `act` if present, then return `controls` or `dom-styles`. After `act`, wait until requested ids exist (internal navigation) before returning.

- [ ] Failing tests: `page` request with fill+click returns controls; invalid method still ignored for registry; surface message shape.
- [ ] Wire actor into the bridge.
- [ ] Run demo bridge tests.

### Task 6: E2E login

**Files:**
- Create: `apps/demo/e2e/page-mcp.spec.ts`

- [ ] Playwright: connect a test WS like the override spec, `goto /login-form`, send `page` with fill email, fill password, click `submit`. Assert success text without a full page reload.

### Task 7: Docs, skills, published MCP copy

**Files:** as in the spec (home card first, Guide page, sidebar « Coding agents », ai-agents 4th layer, reference line, local skill, registry skill one-liner, best-practices/agents.md sentence, function-registry README, llmstxt details sentence, docs content spec, snippet for named `button('save', …)` only).

- [ ] Add docs + tests (`apps/docs/tests/dev-page-docs.spec.ts` mirroring `ai-agents-docs.spec.ts`).
- [ ] Confirm `packages/mcp/src/mcp-server.ts` has no `page` tool.
- [ ] `npx nx test docs` and `npx nx lint docs`.

## Verification

```sh
npm test --workspace @ng-craft/function-registry-mcp
npx nx test demo
npx nx test docs
npx nx lint docs
```

E2E: `npx nx e2e demo` (or the page-mcp spec file) when the demo server can run.
