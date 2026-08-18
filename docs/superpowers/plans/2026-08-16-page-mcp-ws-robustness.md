# Page MCP WebSocket robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live-page MCP WebSocket boring: a closed tab is gone, one live tab is targeted without `clientId`, duplicate tabs get a new id instead of fighting, and errors name the actual situation.

**Architecture:** Keep `ws://127.0.0.1:3333` and the existing `page` / `registry.*` tools. The broker owns client-card lifecycle (goodbye vs reload, one-ready resolution, duplicate-id assign, protocol ping). The in-page bridge sends `page/goodbye` on real tab close, waits for `hello/ok` before snapshot/surface, backs off reconnects, and shows a non-interactive status badge. Spec: `docs/superpowers/specs/2026-08-16-page-mcp-ws-robustness-design.md`.

**Tech Stack:** TypeScript, `ws` 8.18, Vitest, jsdom for the demo bridge, VitePress docs.

## Global Constraints

- Same broker host/port, same `sessionStorage` key `ng-craft.function-registry.client-id`.
- Never pick “the latest” among several **ready** tabs.
- One `ready` tab wins even if `reloading` cards remain.
- Goodbye deletes the card immediately; socket close without goodbye stays `reloading` (TTL 20s, unchanged).
- Heartbeat is Node `socket.ping()` / `pong` (no app-level ping JSON). Defaults: interval 5s, stale 15s.
- `registry.list` / mutations still require an OPEN socket. `registry.clients` lists every card.
- No pairing button, no CDP, no new npm package, no `page` on `@craft-ng/mcp`.
- Docs English. Named interactive helpers stay unique; the MCP badge must not use `a` / `button` / `input` with a local name.
- Error strings: copy verbatim from the spec.
- TDD: red → green per task. Do not change `page` act / goto / live-read.

## File map

- Modify: `packages/function-registry-mcp/src/protocol.ts` — `RegistryClient` fields; `hello/ok`; `page/goodbye`
- Modify: `packages/function-registry-mcp/src/bridge-broker.ts` — lifecycle, resolve, ping, `clients` getter
- Modify: `packages/function-registry-mcp/src/bridge-broker.spec.ts` — new behaviours
- Modify: `packages/function-registry-mcp/src/mcp-server.ts` — `registry.clients` description
- Modify: `apps/demo/src/app/function-registry-bridge.ts` — hello/ok, goodbye, backoff, badge
- Modify: `apps/demo/src/app/function-registry-bridge.spec.ts`
- Modify: `apps/docs/guide/ai/dev-page.md` + `apps/docs/tests/dev-page-docs.spec.ts`
- Modify: `.cursor/skills/ng-craft-dev-page-mcp/SKILL.md` and `.agents/skills/ng-craft-dev-page-mcp/SKILL.md`
- Modify: `packages/function-registry-mcp/README.md`

---

### Task 1: Goodbye drops the card immediately

**Files:**
- Modify: `packages/function-registry-mcp/src/protocol.ts`
- Modify: `packages/function-registry-mcp/src/bridge-broker.ts`
- Test: `packages/function-registry-mcp/src/bridge-broker.spec.ts`

**Interfaces:**
- Consumes: existing `hello` / `page/surface` / close → `reloading`
- Produces: `{ type: 'page/goodbye'; clientId: string }` deletes the card; `page` without `clientId` then targets the remaining ready tab (Task 2). Close without goodbye still `reloading`.

- [ ] **Step 1: Write the failing tests**

Add after the existing disconnect/reload tests in `bridge-broker.spec.ts`:

```ts
  it('deletes the client card on page/goodbye instead of keeping it reloading', async () => {
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      controls: [control('email')],
    });
    await vi.waitFor(async () => {
      await expect(broker.request('page')).resolves.toMatchObject({
        status: 'ready',
      });
    });

    app.send(JSON.stringify({ type: 'page/goodbye', clientId: 'app-a' }));
    await vi.waitFor(async () => {
      await expect(broker.request('page')).rejects.toThrow(
        'page client is not connected',
      );
    });
  });

  it('keeps the card reloading when the socket closes without goodbye', async () => {
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      controls: [control('email')],
    });
    await vi.waitFor(async () => {
      await expect(broker.request('page')).resolves.toMatchObject({
        status: 'ready',
      });
    });

    app.close();
    await expect(
      broker.request('page', { timeoutMs: 80 }),
    ).rejects.toThrow(
      /page reloading since .+s, last url \/login-form, generation 1 → still 1/,
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @ng-craft/function-registry-mcp`

Expected: FAIL — goodbye is ignored, first test still sees the card (ready or reloading), not `page client is not connected`.

- [ ] **Step 3: Implement goodbye**

In `protocol.ts` add nothing required for TS consumers beyond documenting the message in a type:

```ts
export type PageGoodbye = Readonly<{
  type: 'page/goodbye';
  clientId: string;
}>;
```

In `#handleMessage`, before the `clientId === undefined` return, handle goodbye using the socket mapping (do not trust a mismatched payload id):

```ts
    if (record['type'] === 'page/goodbye') {
      const mappedId = this.#socketClientIds.get(socket);
      if (mappedId === undefined) {
        return;
      }
      this.#dropClient(mappedId, 'page client is not connected');
      return;
    }
```

Extract `#dropClient(clientId, waiterMessage)`: clear expire timer, reject ready waiters and pending calls, `#clients.delete`, do not call `socket.close()` from goodbye (the tab is going away). Socket `close` handler: if the card is already gone, return; else existing `reloading` + TTL path.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @ng-craft/function-registry-mcp`

Expected: PASS (existing reload-wait tests still pass).

- [ ] **Step 5: Commit**

```bash
git add packages/function-registry-mcp/src/protocol.ts packages/function-registry-mcp/src/bridge-broker.ts packages/function-registry-mcp/src/bridge-broker.spec.ts
git commit -m "$(cat <<'EOF'
fix: drop the page MCP client card on goodbye, not on every socket close

EOF
)"
```

---

### Task 2: `page` targets the single ready tab among ghosts

**Files:**
- Modify: `packages/function-registry-mcp/src/bridge-broker.ts` (`#resolvePageClient`)
- Test: `packages/function-registry-mcp/src/bridge-broker.spec.ts`

**Interfaces:**
- Consumes: Task 1 cards (`ready` / `reloading`)
- Produces: resolution rules and error strings from the spec

- [ ] **Step 1: Write the failing tests**

```ts
  it('uses the ready tab when another card is still reloading', async () => {
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      controls: [control('email')],
    });
    await vi.waitFor(async () => {
      await expect(broker.request('page')).resolves.toMatchObject({
        status: 'ready',
      });
    });

    app.close();
    await vi.waitFor(() => expect(broker.clients).toHaveLength(0));

    const { port } = broker.address();
    const replacement = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => replacement.once('open', resolve));
    echoPage(replacement);
    replacement.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-b',
        pageUrl: 'http://localhost/',
      }),
    );
    publishSurface(replacement, {
      clientId: 'app-b',
      url: '/',
      controls: [control('navToggle')],
    });

    await expect(broker.request('page')).resolves.toMatchObject({
      url: '/',
      controls: [expect.objectContaining({ id: 'navToggle' })],
    });
    replacement.close();
  });

  it('requires clientId when two tabs are ready', async () => {
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      controls: [control('email')],
    });
    await vi.waitFor(async () => {
      await expect(broker.request('page')).resolves.toMatchObject({
        status: 'ready',
      });
    });

    const { port } = broker.address();
    const appB = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => appB.once('open', resolve));
    echoPage(appB);
    appB.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-b',
        pageUrl: 'http://localhost/',
      }),
    );
    publishSurface(appB, {
      clientId: 'app-b',
      url: '/',
      controls: [control('navToggle')],
    });
    await vi.waitFor(async () => {
      await expect(
        broker.request('page', { clientId: 'app-b' }),
      ).resolves.toMatchObject({ url: '/' });
    });

    await expect(broker.request('page')).rejects.toThrow(
      'Multiple ready page clients; clientId is required. Available clients: app-a ready /login-form, app-b ready /',
    );
    appB.close();
  });

  it('does not wait when several cards are reloading and none is ready', async () => {
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      controls: [control('email')],
    });
    await vi.waitFor(async () => {
      await expect(broker.request('page')).resolves.toMatchObject({
        status: 'ready',
      });
    });
    const { port } = broker.address();
    const appB = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => appB.once('open', resolve));
    appB.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-b',
        pageUrl: 'http://localhost/',
      }),
    );
    await vi.waitFor(() => expect(broker.clients.length).toBeGreaterThan(1));
    app.close();
    appB.close();

    await expect(broker.request('page', { timeoutMs: 80 })).rejects.toThrow(
      /No ready page client\. Reloading: /,
    );
  });
```

Note: after `app.close()` the current `clients` getter hides the ghost. The first test uses that. If Task 5 has not landed yet, `broker.clients` length 0 after close is correct.

Update the existing two-client page test that expects:

`Multiple page clients are connected; clientId is required. Available clients: app-a, app-b`

to the new **ready** wording (both are hello-only / not ready until surface). That test currently hellos `app-b` without a surface — after this task it should either publish surfaces for both and expect the new string, or hello-only `app-b` (status `connecting`) and expect `page` to use `app-a` if `app-a` is ready. Align it with “one ready wins”: publish surface on `app-a` first, hello `app-b` without surface, `page` without id still returns `app-a`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace @ng-craft/function-registry-mcp`

Expected: FAIL on the first new test (ambiguity because of the reloading ghost) and/or the old multiple-clients string.

- [ ] **Step 3: Implement `#resolvePageClient`**

```ts
  #resolvePageClient(clientId: string | undefined): ClientConnection {
    if (clientId !== undefined) {
      const client = this.#clients.get(clientId);
      if (client === undefined) {
        throw new Error(`page client "${clientId}" is not connected`);
      }
      return client;
    }
    const cards = [...this.#clients.values()];
    const ready = cards.filter(
      (client) => client.status === 'ready' && isSocketOpen(client.socket),
    );
    if (ready.length === 1) {
      return ready[0] as ClientConnection;
    }
    if (ready.length > 1) {
      throw new Error(
        `Multiple ready page clients; clientId is required. Available clients: ${ready
          .map((client) => `${client.clientId} ready ${client.pageUrl ?? ''}`)
          .join(', ')}`,
      );
    }
    if (cards.length === 0) {
      throw new Error('page client is not connected');
    }
    if (cards.length === 1) {
      return cards[0] as ClientConnection;
    }
    throw new Error(
      `No ready page client. Reloading: ${cards
        .map(
          (client) =>
            `${client.clientId} (last url ${client.pageUrl ?? 'unknown'})`,
        )
        .join(', ')}`,
    );
  }
```

Sort ids in error strings (`localeCompare`) so the two-ready test is stable.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @ng-craft/function-registry-mcp`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/function-registry-mcp/src/bridge-broker.ts packages/function-registry-mcp/src/bridge-broker.spec.ts
git commit -m "$(cat <<'EOF'
fix: target the single ready page tab even when a reloading card remains

EOF
)"
```

---

### Task 3: Duplicate `clientId` gets a new id, does not kill the first tab

**Files:**
- Modify: `packages/function-registry-mcp/src/protocol.ts`
- Modify: `packages/function-registry-mcp/src/bridge-broker.ts` (`#registerClient`)
- Test: `packages/function-registry-mcp/src/bridge-broker.spec.ts`

**Interfaces:**
- Consumes: `hello` with `clientId`
- Produces: always `{ type: 'hello/ok', clientId: string }` after hello. If the id already has an **open** socket on another connection, `clientId` in `hello/ok` is a new UUID; the first socket stays up.

- [ ] **Step 1: Write the failing test**

```ts
  it('assigns a new clientId when a second socket hellos with an id that is already open', async () => {
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      controls: [control('email')],
    });
    await vi.waitFor(async () => {
      await expect(broker.request('page')).resolves.toMatchObject({
        status: 'ready',
      });
    });

    const { port } = broker.address();
    const duplicate = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => duplicate.once('open', resolve));
    const assigned = new Promise<string>((resolve) => {
      duplicate.on('message', (raw) => {
        const message = JSON.parse(raw.toString()) as {
          type?: string;
          clientId?: string;
        };
        if (message.type === 'hello/ok' && message.clientId !== undefined) {
          resolve(message.clientId);
        }
      });
    });
    duplicate.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'app-a',
        pageUrl: 'http://localhost/',
      }),
    );
    const newId = await assigned;
    expect(newId).not.toBe('app-a');
    expect(app.readyState).toBe(WebSocket.OPEN);

    echoPage(duplicate);
    publishSurface(duplicate, {
      clientId: newId,
      url: '/',
      controls: [control('navToggle')],
    });

    await expect(
      broker.request('page', { clientId: 'app-a' }),
    ).resolves.toMatchObject({ url: '/login-form' });
    await expect(
      broker.request('page', { clientId: newId }),
    ).resolves.toMatchObject({ url: '/' });
    duplicate.close();
  });
```

Also assert that a normal hello (no conflict) receives `hello/ok` with the same id — extend `beforeEach` or add a small test that reads the first message after hello.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @ng-craft/function-registry-mcp`

Expected: FAIL — current `#registerClient` closes `previous.socket` and reuses `app-a`.

- [ ] **Step 3: Implement assign + `hello/ok`**

```ts
export type HelloOk = Readonly<{
  type: 'hello/ok';
  clientId: string;
}>;
```

In `#registerClient`:

- If `previous` exists, socket is OPEN, and `previous.socket !== socket`: `clientId = randomUUID()` (do not close previous).
- Else: keep `hello.clientId` (reconnect of the same tab after close — previous is `reloading`, socket undefined). That path still increments `generation` and reuses the id.
- Map the **new** socket to the chosen id, send `JSON.stringify({ type: 'hello/ok', clientId })`.
- Same-tab reconnect (`previous.socket` not open): keep existing close-old-if-any behaviour only when the old socket is not open (it should already be undefined).

Do not send `hello/ok` before the card is in `#clients`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @ng-craft/function-registry-mcp`

Expected: PASS. Existing reconnect-same-id test (close + hello `app-a`) still reuses `app-a` because the first socket is not OPEN.

- [ ] **Step 5: Commit**

```bash
git add packages/function-registry-mcp/src/protocol.ts packages/function-registry-mcp/src/bridge-broker.ts packages/function-registry-mcp/src/bridge-broker.spec.ts
git commit -m "$(cat <<'EOF'
fix: assign a new page clientId instead of evicting an already-open tab

EOF
)"
```

---

### Task 4: Protocol ping drops stale sockets as reloading

**Files:**
- Modify: `packages/function-registry-mcp/src/bridge-broker.ts` constructor + connection handler
- Test: `packages/function-registry-mcp/src/bridge-broker.spec.ts`

**Interfaces:**
- Consumes: open `ws` sockets
- Produces: constructor options `heartbeatIntervalMs` (default `5_000`) and `heartbeatTimeoutMs` (default `15_000`). No pong within timeout → `socket.terminate()`, card becomes `reloading` (not goodbye).

- [ ] **Step 1: Write the failing test**

```ts
  it('marks a client reloading when it stops answering ping', async () => {
    broker = new RegistryBridgeBroker({
      port: 0,
      requestTimeoutMs: 500,
      heartbeatIntervalMs: 30,
      heartbeatTimeoutMs: 80,
    });
    await broker.ready();
    const { port } = broker.address();
    const silent = new WebSocket(`ws://127.0.0.1:${port}`, { autoPong: false });
    await new Promise<void>((resolve) => silent.once('open', resolve));
    echoPage(silent);
    silent.send(
      JSON.stringify({
        type: 'hello',
        role: 'registry-app',
        clientId: 'silent',
        pageUrl: 'http://localhost/login-form',
      }),
    );
    publishSurface(silent, {
      clientId: 'silent',
      url: '/login-form',
      controls: [control('email')],
    });
    await vi.waitFor(async () => {
      await expect(
        broker.request('page', { clientId: 'silent' }),
      ).resolves.toMatchObject({ status: 'ready' });
    });

    await expect(
      broker.request('page', { clientId: 'silent', timeoutMs: 200 }),
    ).rejects.toThrow(/page reloading since /);
    silent.close();
  });
```

The existing `beforeEach` already constructs `broker`. Restructure this test in its own `describe` with its own broker so it does not fight `afterEach`, or close/recreate broker at the start of the test (mirror how `afterEach` works: close `app` first if needed). Preferred: nested `describe('heartbeat')` with its own `beforeEach`/`afterEach`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @ng-craft/function-registry-mcp`

Expected: FAIL — the silent client stays `ready` and `page` still forwards (or hangs until 200ms with a different error).

- [ ] **Step 3: Implement ping**

On each connection, after hello (once the card exists), `setInterval` → `socket.ping()`. On `pong`, store `lastPongAt = Date.now()`. If `Date.now() - lastPongAt > heartbeatTimeoutMs`, `socket.terminate()`. Clear the interval on socket `close`. Treat `lastPongAt` as `Date.now()` at hello so a slow first ping does not kill a healthy tab.

Pass the new options through the constructor next to `requestTimeoutMs`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @ng-craft/function-registry-mcp`

Expected: PASS. Default interval 5s must not flake existing 500ms tests (do not ping in tests that use the default broker unless 5s elapses).

- [ ] **Step 5: Commit**

```bash
git add packages/function-registry-mcp/src/bridge-broker.ts packages/function-registry-mcp/src/bridge-broker.spec.ts
git commit -m "$(cat <<'EOF'
fix: treat a silent page WebSocket as reloading via protocol ping

EOF
)"
```

---

### Task 5: `registry.clients` lists status for every card

**Files:**
- Modify: `packages/function-registry-mcp/src/protocol.ts` (`RegistryClient`)
- Modify: `packages/function-registry-mcp/src/bridge-broker.ts` (`clients` getter)
- Modify: `packages/function-registry-mcp/src/mcp-server.ts` (tool description)
- Test: `packages/function-registry-mcp/src/bridge-broker.spec.ts`

**Interfaces:**
- Consumes: `ClientStatus`
- Produces:

```ts
export type RegistryClient = Readonly<{
  clientId: string;
  connectedAt: string;
  status: 'reloading' | 'connecting' | 'ready';
  generation: number;
  pageUrl?: string;
  pageTitle?: string;
  entryCount: number;
  logCount: number;
}>;
```

- [ ] **Step 1: Write the failing test**

```ts
  it('lists reloading cards on registry.clients with status', async () => {
    publishSurface(app, {
      clientId: 'app-a',
      url: '/login-form',
      controls: [control('email')],
    });
    await vi.waitFor(async () => {
      await expect(broker.request('page')).resolves.toMatchObject({
        status: 'ready',
      });
    });
    app.close();
    await expect(broker.request('registry/clients')).resolves.toEqual([
      expect.objectContaining({
        clientId: 'app-a',
        status: 'reloading',
        generation: 1,
        pageUrl: '/login-form',
      }),
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @ng-craft/function-registry-mcp`

Expected: FAIL — `clients` currently filters to OPEN sockets, so the list is `[]`.

- [ ] **Step 3: Implement**

`get clients()`: map **all** `#clients` values (no OPEN filter). Include `status` and `generation`. Keep `#resolveRegistryClient` / `#requireRegistryClient` requiring an open socket so `registry.list` does not target a ghost.

Update the `registry.clients` tool description to: `List every page/registry client card (ready, connecting, reloading). Pass clientId to page and registry.* when more than one card is ready.`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace @ng-craft/function-registry-mcp`

Expected: PASS. Fix any existing test that assumed `broker.clients` length 0 after `app.close()` (Task 2 used that). After this task, length stays 1 with `status: 'reloading'`. Update those assertions to `status: 'reloading'` instead of length 0.

- [ ] **Step 5: Commit**

```bash
git add packages/function-registry-mcp/src/protocol.ts packages/function-registry-mcp/src/bridge-broker.ts packages/function-registry-mcp/src/bridge-broker.spec.ts packages/function-registry-mcp/src/mcp-server.ts
git commit -m "$(cat <<'EOF'
feat: list reloading page clients so agents can see ghosts

EOF
)"
```

---

### Task 6: In-page bridge — hello/ok, goodbye, backoff, badge

**Files:**
- Modify: `apps/demo/src/app/function-registry-bridge.ts`
- Test: `apps/demo/src/app/function-registry-bridge.spec.ts`

**Interfaces:**
- Consumes: `hello/ok`, `page/goodbye`
- Produces: `startFunctionRegistryBridge` still returns `() => void`. On `hello/ok`, persist `clientId` if it changed. On `pagehide` with `persisted === false`, send goodbye. Reconnect delay: `min(10_000, 1000 * 2 ** attempt) + random * 250`, reset attempt on `onopen`. Badge: element `#mcp-page-bridge-status`, **no** `data-craft-name`.

- [ ] **Step 1: Write the failing tests**

In `function-registry-bridge.spec.ts` (jsdom). Export small helpers if needed (`persistAssignedClientId`, `shouldSendGoodbye`, `nextReconnectDelayMs`) rather than constructing a real WebSocket.

```ts
  it('persists a broker-assigned client id', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const first = createFunctionRegistryClientId(storage, () => 'original-id');
    persistAssignedClientId(storage, 'assigned-id');
    expect(first).toBe('original-id');
    expect(createFunctionRegistryClientId(storage, () => 'other')).toBe(
      'assigned-id',
    );
  });

  it('sends goodbye only when the tab is discarded, not when it is frozen', () => {
    expect(shouldSendGoodbye({ persisted: false })).toBe(true);
    expect(shouldSendGoodbye({ persisted: true })).toBe(false);
  });

  it('backs off reconnect delay up to 10s', () => {
    expect(nextReconnectDelayMs(0, () => 0)).toBe(1000);
    expect(nextReconnectDelayMs(1, () => 0)).toBe(2000);
    expect(nextReconnectDelayMs(4, () => 0)).toBe(10000);
    expect(nextReconnectDelayMs(8, () => 0)).toBe(10000);
  });
```

Export:

```ts
export const FUNCTION_REGISTRY_CLIENT_ID_STORAGE_KEY =
  'ng-craft.function-registry.client-id';

export function persistAssignedClientId(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  clientId: string,
): void {
  storage.setItem(FUNCTION_REGISTRY_CLIENT_ID_STORAGE_KEY, clientId);
}

export function shouldSendGoodbye(event: Pick<PageTransitionEvent, 'persisted'>): boolean {
  return event.persisted === false;
}

export function nextReconnectDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const exp = Math.min(10_000, 1000 * 2 ** attempt);
  return exp + Math.floor(random() * 250);
}
```

(`FUNCTION_REGISTRY_CLIENT_ID_STORAGE_KEY` is currently file-private — export it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx nx test demo -- --include='**/function-registry-bridge.spec.ts'`

Expected: FAIL — helpers not exported / not defined.

- [ ] **Step 3: Implement bridge wiring**

- `onopen`: send **only** `hello` (plus existing fields). Do not send snapshot/surface yet.
- `onmessage`: if JSON `type === 'hello/ok'` and `clientId` is a string, `persistAssignedClientId`, update the closure `clientId`, then send snapshot + surface with that id. Then parse other messages as today (`respondToBridgeMessage`).
- `pagehide` listener: if `shouldSendGoodbye(event)` and socket OPEN, `sendJson({ type: 'page/goodbye', clientId })`.
- `onclose` / connect failure: `attempt += 1`, `setTimeout(connect, nextReconnectDelayMs(attempt))`. `onopen`: `attempt = 0`.
- Badge: `ensureMcpPageBadge()` creates `#mcp-page-bridge-status` as a `div` appended to `document.body` if missing. Text: `MCP page: connected · <first 8 of id>` on hello/ok; `MCP page: reconnecting` on close. CSS inline, bottom-left, `pointer-events: none`, `aria-live="polite"`. Never set `data-craft-name`. Destroy on `stopBridge`.

Keep `navigate` / `getPageInfo` behaviour from the previous slice.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx nx test demo -- --include='**/function-registry-bridge.spec.ts'`

Expected: PASS

Optional smoke: `cd apps/demo && npx playwright test e2e/page-mcp.spec.ts --project=chromium` — hello/ok delay must not break fill+goto. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/demo/src/app/function-registry-bridge.ts apps/demo/src/app/function-registry-bridge.spec.ts
git commit -m "$(cat <<'EOF'
fix: wait for hello/ok, goodbye on tab close, and back off page MCP reconnects

EOF
)"
```

---

### Task 7: Docs and skills

**Files:**
- Modify: `apps/docs/guide/ai/dev-page.md`
- Modify: `apps/docs/tests/dev-page-docs.spec.ts`
- Modify: `.cursor/skills/ng-craft-dev-page-mcp/SKILL.md`
- Modify: `.agents/skills/ng-craft-dev-page-mcp/SKILL.md`
- Modify: `packages/function-registry-mcp/README.md`

**Interfaces:**
- Consumes: error strings and resolution rules from the spec
- Produces: agent instructions that match Task 2–6

- [ ] **Step 1: Write the failing docs test**

In `dev-page-docs.spec.ts`:

```ts
  it('explains one ready tab vs several and goodbye vs reload', () => {
    expect(page).toContain('One ready tab');
    expect(page).toContain('page/goodbye');
    expect(page).toContain('Multiple ready page clients');
    expect(page).toContain('registry.clients');
    const cursorSkill = readFileSync(
      join(repoRoot, '.cursor/skills/ng-craft-dev-page-mcp/SKILL.md'),
      'utf8',
    );
    expect(cursorSkill).toContain('page client "');
    expect(cursorSkill).toContain('Never guess');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config apps/docs/vitest.config.mts tests/dev-page-docs.spec.ts`

Expected: FAIL — guide/skill missing those phrases.

- [ ] **Step 3: Update copy**

Guide (`dev-page.md`), after “Connect the local MCP”:

- Each tab has a `clientId` in `sessionStorage`. Duplicating a tab copies it; the broker assigns a new id (`hello/ok`) so the two tabs do not fight.
- Omit `clientId` when **exactly one tab is `ready`**. A ghost `reloading` card (HMR, F5) does not count. Two `ready` tabs → pass `clientId` from `registry.clients` (id, status, url). Never pick “latest”.
- Closing the tab sends `page/goodbye`; the card is dropped. Opening a new tab is a new id. If `page client "<id>" is not connected`, call `registry.clients` and retry without id when a single ready remains.
- Closing without goodbye (crash) looks like reload for up to 20s.

Skill (both copies): same rules in the Fast path. If `page client "<id>" is not connected`, list clients and retry. If `Multiple ready page clients`, pass `clientId`. Do not poll through `reloading`.

README: one paragraph matching the guide.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --config apps/docs/vitest.config.mts tests/dev-page-docs.spec.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/docs/guide/ai/dev-page.md apps/docs/tests/dev-page-docs.spec.ts .cursor/skills/ng-craft-dev-page-mcp/SKILL.md .agents/skills/ng-craft-dev-page-mcp/SKILL.md packages/function-registry-mcp/README.md docs/superpowers/specs/2026-08-16-page-mcp-ws-robustness-design.md docs/superpowers/plans/2026-08-16-page-mcp-ws-robustness.md
git commit -m "$(cat <<'EOF'
docs: explain page MCP tab identity, goodbye, and ready vs reloading

EOF
)"
```

---

## Self-review

**Spec coverage:** goodbye (T1), one-ready (T2), multi-ready error (T2), no-ready multi-ghost (T2), duplicate id (T3), heartbeat (T4), clients list (T5), hello/ok + goodbye + backoff + badge (T6), docs/skill (T7). No pairing button. No transport change.

**Placeholders:** none.

**Types:** `hello/ok`, `page/goodbye`, `RegistryClient.status` / `generation` used consistently. Error strings match the spec verbatim.
