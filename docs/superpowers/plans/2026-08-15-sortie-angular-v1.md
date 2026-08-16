# Sortie Angular v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@craft-ng/core` et `@craft-ng/component` s’exécutent, se testent et se servent sans aucune peer `@angular/*` ; Angular ne survit que dans `@craft-ng/angular`.

**Architecture:** Cinq seams host (réactivité, injector, DOM, HTTP, router) avec Angular comme premier adapter, puis un adapter natif. Le DSL `yield*` / `craftComponent` / `craftRoutes` ne change pas. Dev = oxc/esbuild strip-types + `tsc --noEmit` parallèle. Le compilateur prod (lift des lectures, sous-arbres statiques, DI AOT, SSR HTML) est **hors v1**.

**Tech Stack:** TypeScript 5.9 (`erasableSyntaxOnly`), Vitest + jsdom, Vite, alien-signals (ou équivalent au contrat des specs `state` / `query` / `craftComputed`), `fetch` + `AbortSignal`, History API.

## Global Constraints

- Pas de rename npm (`@craft-ng/*` reste). Pas de rewrite du DSL, de l’interpreter (algorithme), ni du graphe de types.
- Une phase n’est terminée que si le seam visé n’importe plus `@angular/*` dans les fichiers de production concernés.
- Encapsuler d’abord à perf constante, swap ensuite, mesurer (bancs Counter bundle / `each` 1000 / Vitest setup).
- `erasableSyntaxOnly: true` sur core, component, demo dès que les décorateurs sont partis. Interdit : `enum`, `namespace`, parameter properties, décorateurs.
- `@craft-ng/angular` est un package durable (îles Angular), pas un pont jetable.
- Hors v1 : compilateur prod, virtualisation de `each`, SSR produit, rename, RxJS-like library.
- Tests : TDD, interface publique, Vitest. Commandes actuelles `npx nx test ng-craft-core --testPathPattern=<file>` jusqu’à la tâche 9 ; ensuite `npx vitest run <file>`.
- Ne pas optimiser `query` et le scheduler **en même temps** qu’un wrap.

## File map

| File | Responsibility |
|---|---|
| Create `libs/core/src/lib/host/craft-signal.ts` | Interface réactive Craft + adapter (Angular puis alien-signals) |
| Create `libs/core/src/lib/host/craft-injector.ts` | `CraftToken`, `CraftInjector`, `runInCraftContext` |
| Create `libs/core/src/lib/host/craft-dom.ts` | Adapter DOM (`createElement`, `setProperty`, `listen`, `setValue`) |
| Create `libs/core/src/lib/host/craft-http.ts` | Transport `fetch` derrière `craftHttpClient` |
| Create `libs/core/src/lib/host/craft-router-runtime.ts` | History + matcher + outlet, même interface `craftRoutes` |
| Create `libs/angular/` | Package `@craft-ng/angular` : `toCraftService`, `angular()`, hosts, TestBed, Legacy* |
| Modify `libs/core/src/index.ts` | Plus aucun type `@angular/*` réexporté |
| Modify `libs/core/package.json` | Peer Angular retirées en dernière tâche |
| Modify `libs/component/src/lib/render/interpreter.ts` | Consomme `craft-dom` + `craft-injector`, plus `Renderer2` |
| Modify `libs/component/src/lib/bridge.ts` | Hosts Angular → `@craft-ng/angular` |
| Modify `libs/core/src/lib/setup-craft-service-test.ts` | jsdom + injector Craft, plus TestBed |
| Modify `tsconfig.base.json` | `erasableSyntaxOnly`, plus `experimentalDecorators` |
| Modify `apps/demo/project.json` | Vite serve, `tsc --noEmit` parallèle |
| Modify `apps/docs/guide/concepts/vs-angular.md` | Craft n’est plus « on top of Angular » |

Hors map v1 (plans suivants) : transform hyperscript prod, SSR `toHTML`, virtualisation.

---

### Task 1: Sceller l’index public

**Files:**
- Create: `libs/core/src/lib/host/public-surface.spec.ts`
- Modify: `libs/core/src/index.ts`
- Modify: `libs/core/src/lib/reactive-read.ts` (commentaire `RAW_REACTIVE_VALUE` : « raw host signal », plus « Angular »)
- Modify: `libs/core/src/lib/signal-source.ts` (ne plus étendre `Signal` Angular)
- Modify: `libs/component/src/lib/types.ts` (remplacer `import type { Provider, Signal } from '@angular/core'`)
- Modify: `libs/component/src/lib/render/vnode.ts` (même chose pour `Injector` / `Type`)

**Interfaces:**
- Consumes: exports actuels de `@craft-ng/core` / `@craft-ng/component`.
- Produces: aucun symbole public nommé `Signal`, `Injector`, `Provider`, `Type` (Angular), `EffectRef`, `HttpClient`, `HttpParams`, `ApplicationConfig`. Les lecteurs publics restent `YieldableReactiveValue`. `RAW_REACTIVE_VALUE` reste interne (non exporté depuis `index.ts`, ou export `ɵ`).

- [ ] **Step 1: Write the failing test**

```ts
// libs/core/src/lib/host/public-surface.spec.ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const coreIndex = join(dirname(fileURLToPath(import.meta.url)), '../../index.ts');

describe('public surface', () => {
  it('does not mention @angular in the package index', () => {
    const source = readFileSync(coreIndex, 'utf8');
    expect(source).not.toMatch(/@angular\//);
  });
});
```

Créer aussi `libs/core/src/lib/host/public-surface-types.spec.ts` qui compile un consommateur :

```ts
import type { YieldableReactiveValue } from '@craft-ng/core';
type _Assert = YieldableReactiveValue<number, 'n'>;
// @ts-expect-error Angular Signal must not leak from the public index
import type { Signal } from '@craft-ng/core';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test ng-craft-core --testPathPattern=public-surface`
Expected: FAIL — `index.ts` ne mentionne pas Angular directement mais des modules réexportés tirent `Signal` / `Provider`. Le `@ts-expect-error` ne se déclenche pas encore (Signal est peut-être absent par nom mais fuité transitivement). Ajuster le test pour un `tsc` d’un fichier fixture `apps/docs/tests/snippets/public-api/no-angular-signal.ts` qui fait `import { Signal } from '@craft-ng/core'` et doit échouer.

- [ ] **Step 3: Write minimal implementation**

Remplacer dans `signal-source.ts` :

```ts
export type SignalSource<T> = YieldableReactiveValue<T | undefined, string> & {
  // plus d'intersection avec Signal d'@angular/core
};
```

Dans `types.ts` / `vnode.ts` component : introduire des alias locaux temporaires

```ts
export type CraftProvider = unknown;
export type CraftHostInjector = unknown;
```

sans importer `@angular/core`. Les implémentations internes peuvent encore importer Angular **tant que ce n’est pas `index.ts`**.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test ng-craft-core --testPathPattern=public-surface` et `npx nx typecheck demo`
Expected: PASS. Demo et docs snippets compilent encore.

- [ ] **Step 5: Commit**

```bash
git add libs/core/src/index.ts libs/core/src/lib/host libs/core/src/lib/signal-source.ts libs/core/src/lib/reactive-read.ts libs/component/src/lib/types.ts libs/component/src/lib/render/vnode.ts
git commit -m "$(cat <<'EOF'
fix: stop leaking Angular types from craft public indexes

EOF
)"
```

---

### Task 2: Module `craftSignal` (wrap, impl Angular)

**Files:**
- Create: `libs/core/src/lib/host/craft-signal.ts`
- Create: `libs/core/src/lib/host/craft-signal.spec.ts`
- Modify: `libs/core/src/lib/state.ts` (`signal` / `computed` / `linkedSignal` → `craftSignal` / `craftComputed` / `craftLinkedSignal`)
- Modify: `libs/core/src/lib/craft-computed.ts`, `craft-effect.ts`, `reactive-read.ts` (`isSignal` → `isCraftSignal`)

**Interfaces:**
- Consumes: rien de public nouveau pour l’auteur.
- Produces:

```ts
export const CRAFT_SIGNAL = Symbol('craft-signal');

export type CraftSignal<T> = (() => T) & {
  readonly [CRAFT_SIGNAL]: true;
};

export type CraftWritableSignal<T> = CraftSignal<T> & {
  set(value: T): void;
  update(fn: (value: T) => T): void;
};

export function craftSignal<T>(
  initial: T,
  options?: { readonly equal?: (a: T, b: T) => boolean; readonly debugName?: string },
): CraftWritableSignal<T>;

export function craftComputed<T>(compute: () => T): CraftSignal<T>;
export function craftLinkedSignal<T>(options: {
  source: () => unknown;
  computation: () => T;
}): CraftWritableSignal<T>;
export function craftWatch(fn: () => void | (() => void)): { destroy(): void };
export function untracked<T>(fn: () => T): T;
export function isCraftSignal(value: unknown): value is CraftSignal<unknown>;
```

Dans cette tâche, `craftSignal.ts` réexporte une implémentation qui appelle encore `signal` / `computed` / `effect` / `linkedSignal` d’Angular. Les specs `state.spec.ts` existantes doivent rester vertes sans changement d’assertion.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { craftSignal, craftComputed, isCraftSignal, untracked } from './craft-signal';

describe('craftSignal', () => {
  it('notifies a computed when the source updates', () => {
    const count = craftSignal(0);
    const doubled = craftComputed(() => count() * 2);
    expect(doubled()).toBe(0);
    count.set(2);
    expect(doubled()).toBe(4);
    expect(isCraftSignal(doubled)).toBe(true);
  });

  it('untracked does not subscribe', () => {
    const count = craftSignal(0);
    const seen = craftComputed(() => untracked(() => count()));
    expect(seen()).toBe(0);
    count.set(1);
    expect(seen()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test ng-craft-core --testPathPattern=host/craft-signal`
Expected: FAIL cannot find module `./craft-signal`

- [ ] **Step 3: Write minimal implementation**

```ts
import {
  computed,
  effect,
  linkedSignal,
  signal,
  untracked as ngUntracked,
  isSignal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { CRAFT_SIGNAL, type CraftSignal, type CraftWritableSignal } from './craft-signal.types';

export function craftSignal<T>(initial: T, options?: { equal?: (a: T, b: T) => boolean }): CraftWritableSignal<T> {
  const inner = signal(initial, options) as WritableSignal<T>;
  return brandWritable(inner);
}
// craftComputed / craftWatch / untracked / isCraftSignal wrap computed, effect, ngUntracked, isSignal
```

Brander `RAW_REACTIVE_VALUE` sur le même objet pour que `reactive-read.ts` continue de fonctionner.

- [ ] **Step 4: Run tests**

Run: `npx nx test ng-craft-core --testPathPattern=host/craft-signal` puis `npx nx test ng-craft-core --testPathPattern=state.spec`
Expected: PASS. Comportement `state` inchangé.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: wrap Angular signals behind craftSignal

EOF
)"
```

---

### Task 3: Module `CraftInjector` (wrap, impl Angular)

**Files:**
- Create: `libs/core/src/lib/host/craft-injector.ts`
- Create: `libs/core/src/lib/host/craft-injector.spec.ts`
- Modify: `libs/core/src/lib/craft-service.ts` (`inject` / `runInInjectionContext` / `InjectionToken` / `createEnvironmentInjector` → API Craft)
- Modify: `libs/core/src/lib/craft-generator-runtime.ts`
- Modify: `libs/component/src/lib/factory-runtime.ts`

**Interfaces:**
- Produces:

```ts
export type CraftToken<T> = {
  readonly debugName: string;
  readonly [CraftTokenBrand]: T;
};

export function craftToken<T>(debugName: string): CraftToken<T>;

export type CraftProvider<T = unknown> =
  | { token: CraftToken<T>; useValue: T }
  | { token: CraftToken<T>; useFactory: (injector: CraftInjector) => T };

export interface CraftInjector {
  get<T>(token: CraftToken<T>): T;
  getOptional<T>(token: CraftToken<T>): T | null;
  run<T>(fn: () => T): T;
  createChild(providers: readonly CraftProvider[]): CraftInjector;
}

export function createCraftInjector(providers: readonly CraftProvider[]): CraftInjector;
export function getCurrentCraftInjector(): CraftInjector;
```

Cette tâche : `createCraftInjector` wrappe `Injector.create` / `createEnvironmentInjector`. Les tokens Craft portent un `InjectionToken` Angular en interne (`WeakMap`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { craftToken, createCraftInjector } from './craft-injector';

describe('CraftInjector', () => {
  it('resolves a value in a child without leaking to the parent', () => {
    const Name = craftToken<string>('Name');
    const root = createCraftInjector([]);
    const child = root.createChild([{ token: Name, useValue: 'craft' }]);
    expect(child.get(Name)).toBe('craft');
    expect(child.getOptional(Name)).toBe('craft');
    expect(root.getOptional(Name)).toBeNull();
  });

  it('run() makes getCurrentCraftInjector available', () => {
    const root = createCraftInjector([]);
    const seen = root.run(() => getCurrentCraftInjector());
    expect(seen).toBe(root);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test ng-craft-core --testPathPattern=host/craft-injector`
Expected: FAIL module not found

- [ ] **Step 3: Implement Angular-backed injector + migrate `runInInjectionContext` call sites in `craft-generator-runtime.ts` and `factory-runtime.ts` to `injector.run()`**

- [ ] **Step 4: Run `npx nx test ng-craft-core --testPathPattern=craft-service.spec` and `host/craft-injector`**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: wrap Angular DI behind CraftInjector

EOF
)"
```

---

### Task 4: Adapter DOM natif + extraire `angular()`

**Files:**
- Create: `libs/core/src/lib/host/craft-dom.ts`
- Create: `libs/core/src/lib/host/craft-dom.spec.ts`
- Modify: `libs/component/src/lib/render/interpreter.ts` (paramètre `renderer: CraftDomAdapter` au lieu de `Renderer2`)
- Create: `libs/angular/src/lib/angular.ts` (déplacer `angular()`, `directive()`, `AngularMount`, `CraftAngularDirectiveHost`)
- Modify: `libs/component/src/lib/angular.ts` (réexport déprécié depuis `@craft-ng/angular` **ou** laisser un shim qui throw hors adapter)
- Modify: `libs/component/src/lib/angular-host.ts` → package angular
- Modify: `libs/component/src/index.ts` (ne plus exporter `angular` / `directive` depuis component, ou les marquer deprecated)

**Interfaces:**
- Produces:

```ts
export interface CraftDomAdapter {
  createElement(tag: string): Element;
  createText(value: string): Text;
  appendChild(parent: Node, child: Node): void;
  insertBefore(parent: Node, child: Node, before: Node | null): void;
  removeChild(parent: Node, child: Node): void;
  setAttribute(el: Element, name: string, value: string): void;
  removeAttribute(el: Element, name: string): void;
  setProperty(el: Element, name: string, value: unknown): void;
  setValue(node: Text, value: string): void;
  listen(target: Element, event: string, handler: EventListener): () => void;
}

export function createBrowserDomAdapter(document: Document): CraftDomAdapter;
```

`createBrowserDomAdapter` utilise `document.createElement` / `addEventListener`. Plus de `Renderer2` sur le chemin Craft pur.

- [ ] **Step 1: Write the failing test** (jsdom)

```ts
/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { createBrowserDomAdapter } from './craft-dom';

describe('createBrowserDomAdapter', () => {
  it('creates, patches and removes a text node', () => {
    const dom = createBrowserDomAdapter(document);
    const p = dom.createElement('p');
    const text = dom.createText('a');
    dom.appendChild(p, text);
    dom.setValue(text, 'b');
    expect(p.textContent).toBe('b');
    dom.removeChild(p, text);
    expect(p.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx nx test ng-craft-core --testPathPattern=host/craft-dom`
Expected: FAIL

- [ ] **Step 3: Implement adapter + brancher `interpreter.ts` `RenderContext.renderer`**

`AngularMount` et `createComponent` / `ApplicationRef` / `detectChanges` déménagent dans `libs/angular`. L’interpreter Craft n’importe plus `@angular/core`.

- [ ] **Step 4: Run `npx nx test ng-craft-component --testPathPattern=interpreter.spec`**

Expected: les tests Craft (hyperscript, bindings) PASS. Les tests qui montent `@Component` Angular bougent vers `libs/angular` ou restent skippés jusqu’à la tâche 11.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: render Craft nodes through a native DOM adapter

EOF
)"
```

---

### Task 5: `craftHttpClient` sur `fetch`

**Files:**
- Create: `libs/core/src/lib/host/craft-http.ts`
- Modify: `libs/core/src/lib/craft-http-client.ts` (plus `@angular/common/http`, plus `firstValueFrom`)
- Modify: `libs/core/src/lib/craft-http-client.spec.ts` (mock `fetch` au lieu de `HttpClient`)

**Interfaces:**
- Produces: les types publics `CraftHttpClientJsonOptions` n’exposent plus `HttpHeaders` / `HttpParams` / `HttpContext`. Remplacer par `Record<string, string>` et `URLSearchParams`.

```ts
export type CraftHttpRequest = {
  url: string;
  method: string;
  headers?: Readonly<Record<string, string>>;
  params?: Readonly<Record<string, string | number | boolean | undefined>>;
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
};

export type CraftHttpResponse<T> = {
  status: number;
  body: T;
};
```

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { craftFetchTransport } from './craft-http';

describe('craftFetchTransport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps a JSON 200 to a body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    const result = await craftFetchTransport({ url: '/x', method: 'GET' });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Replace `HttpClient` + `firstValueFrom` in `craft-http-client.ts` by `craftFetchTransport`. Keep `craftException` mapping for status ≥ 400.**

- [ ] **Step 4: Run `npx nx test ng-craft-core --testPathPattern=craft-http-client`**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: run craftHttpClient on fetch

EOF
)"
```

---

### Task 6: Swap signaux → alien-signals

**Files:**
- Modify: `libs/core/src/lib/host/craft-signal.ts` (plus d’import `@angular/core`)
- Modify: `libs/core/package.json` (dependency `alien-signals`, pas encore retirer Angular — injector/router s’en servent encore)
- Modify: `libs/core/src/lib/craft-resource.ts` / `query.ts` : cesser d’appeler `resource()` Angular ; garder le contrat `query` (status, exceptions, `settledValue`) avec un loader Craft

**Interfaces:**
- Consumes: Task 2 (`craftSignal` / `craftComputed` / `craftWatch` / `untracked`).
- Produces: même API, implémentation sans Angular. `query` n’utilise plus `ResourceRef`.

- [ ] **Step 1: Rejouer `host/craft-signal.spec.ts` et `state.spec.ts` comme contrat. Ajouter un test `query` sans `resource()` Angular : loader sync + exception déclarée.**

- [ ] **Step 2: Run `state.spec` / `craft-computed.spec` / `query.spec` — expected FAIL or still green on Angular impl**

- [ ] **Step 3: Implement with `alien-signals` (`signal`, `computed`, `effect`, `untracked`). Mapper `craftLinkedSignal` sur computed + writable. Réécrire le minimum de `query.ts` pour le status machine Craft (`idle` / `loading` / `resolved` / exception) sans `resource()`.**

Ne pas fusionner un nouveau scheduler rAF ici. Le flush reste celui d’alien-signals (microtask). Documenter le cas `startViewTransition` comme dette (tâche router).

- [ ] **Step 4: Run the primitive specs**

Run: `npx nx test ng-craft-core --testPathPattern='state.spec|craft-computed.spec|query.spec|mutation.spec|async-process.spec'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: run craft reactivity on alien-signals

EOF
)"
```

---

### Task 7: Injector natif

**Files:**
- Modify: `libs/core/src/lib/host/craft-injector.ts` (plus `@angular/core`)
- Modify: `libs/core/src/lib/craft-service.ts` (tokens = `CraftToken`, plus `InjectionToken`)
- Modify: `libs/core/src/lib/component-register.ts` (objet / `craftService`, plus `@Injectable`)
- Modify: `libs/component/src/lib/render/style-registry.ts` (pareil)
- Modify: `libs/core/src/lib/craft-a11y.ts` (title strategy sans `@Injectable`)
- Modify: `libs/core/src/lib/send-context-to-ai.ts`, `libs/component/src/lib/ai/send-context-to-ai.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces: `createCraftInjector` = map parentale + `run()` via une stack TLS (`AsyncLocalStorage` en Node, variable module en browser). `createChild` = nouvelle map qui délègue au parent. **Pas** de `createEnvironmentInjector`.

`@Injectable` disparaît de core/component. `ComponentRegister` devient :

```ts
export function createComponentRegister(): { next(): number } {
  let counter = 0;
  return {
    next() {
      counter += 1;
      return counter;
    },
  };
}

export const COMPONENT_REGISTER = craftToken<{ next(): number }>('ComponentRegister');
```

- [ ] **Step 1: Étendre `craft-injector.spec.ts` : factory provider, optional, child override, `run()` imbriqué.**

- [ ] **Step 2: Run — FAIL on Angular-only behavior we want to drop (e.g. `providedIn: 'root'`).**

- [ ] **Step 3: Implement native injector. Migrate `craft-service.ts` token creation. Delete `@Injectable` classes listed in Files.**

- [ ] **Step 4: Run `npx nx test ng-craft-core --testPathPattern=craft-service.spec` and `setup-craft-service-test.spec`**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: replace Angular EnvironmentInjector with CraftInjector

EOF
)"
```

---

### Task 8: Tests sans TestBed

**Files:**
- Modify: `libs/core/src/lib/setup-craft-service-test.ts`
- Modify: `libs/core/src/lib/setup-craft-service-testing-by-register.ts`
- Modify: `libs/component/src/lib/testing.ts`
- Modify: every `*.spec.ts` that importe `TestBed` **dans core/component** pour les chemins Craft pur (pas les fixtures Angular destinées à `libs/angular`)

**Interfaces:**
- Consumes: `createCraftInjector`, `createBrowserDomAdapter`, `mountInterpretedComponent` (déjà dans interpreter).
- Produces: `setupCraftServiceTest` n’importe plus `@angular/core/testing`. `renderCraftComponent` dans `testing.ts` monte via l’interpreter + jsdom.

```ts
export function setupCraftServiceTest(options: {
  providers: readonly CraftProvider[];
}): { injector: CraftInjector };
```

Le typage des registers (mocks obligatoires) **ne change pas**.

- [ ] **Step 1: Write a new spec `setup-craft-service-test.host.spec.ts` that boots a `craftService` with `createCraftInjector` only, no TestBed, and reads a `state`.**

- [ ] **Step 2: Run — FAIL until setup is rewritten.**

- [ ] **Step 3: Rewrite setup helpers. Keep the public function names. Internally: `createCraftInjector` + `injector.run()`.**

- [ ] **Step 4: Run `npx nx test ng-craft-core` and `npx nx test ng-craft-component`**

Expected: PASS for Craft specs. Specs `@Component` restantes : déplacer ou skip avec commentaire `moved to @craft-ng/angular`.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
test: boot craft tests without TestBed

EOF
)"
```

---

### Task 9: Router Craft

**Files:**
- Create: `libs/core/src/lib/host/craft-router-runtime.ts`
- Create: `libs/core/src/lib/host/craft-router-runtime.spec.ts`
- Modify: `libs/core/src/lib/craft-routes.ts` (compiler vers le runtime Craft, plus vers `Route` Angular)
- Modify: `libs/core/src/lib/craft-router.ts` (`provideCraftRouter` ne wrappe plus `provideRouter`)
- Modify: `libs/core/src/lib/craft-router-outlet.ts` (plus `RouterOutletContract`, `ActivatedRoute`, `combineLatest`)
- Modify: `libs/component/src/lib/craft-router-outlet.ts`
- Modify: `libs/core/src/lib/query-params.ts` (signals de route, plus `ActivatedRoute`)
- Move: `LegacyCraftRouterLink` → `libs/angular`

**Interfaces:**
- Consumes: `craftRoutes` / `craftRoute` **inchangés** pour l’auteur (paths typés, guards generators, pending, exceptions).
- Produces:

```ts
export type CraftLocation = {
  pathname: string;
  search: string;
  hash: string;
};

export interface CraftHistory {
  get(): CraftLocation;
  listen(fn: (location: CraftLocation) => void): () => void;
  push(url: string): void;
  replace(url: string): void;
}

export function createBrowserHistory(window: Window): CraftHistory;

export function matchCraftRoutes(
  routes: unknown, // the existing craftRoutes result
  location: CraftLocation,
): CraftMatch | null;
```

Outlet : commit URL immédiat, stay / blank / pending inchangés (`CRAFT_STAY_MS` etc.). View transitions : flush **sync** des signaux dans le callback `startViewTransition` (plus de `ApplicationRef.tick`).

- [ ] **Step 1: Test matcher + history in jsdom (push `/a` → match path `a`, query string → `queryParams` primitive).**

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement matcher (segment / `:param` / `**`) and outlet controller against `CraftHistory`. Port `craft-routes.spec.ts` / `craft-router-outlet.spec.ts` / `query-params.spec.ts` une spec à la fois. Ne pas porter `provideRouter`.**

- [ ] **Step 4: Run routing specs + demo typecheck**

Expected: PASS. Demo navigue sans `@angular/router` sur les routes Craft.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: replace Angular Router with a Craft history matcher

EOF
)"
```

Cette tâche est XL : si elle dépasse une session, la découper en 9a matcher, 9b outlet/pending, 9c queryParams, 9d demo. Ne pas merger un matcher sans outlet.

---

### Task 10: Syntaxe érasable + dual pipeline dev

**Files:**
- Modify: `tsconfig.base.json` (`erasableSyntaxOnly: true`, `experimentalDecorators: false`, `emitDecoratorMetadata: false`)
- Modify: `libs/core/src/lib/standard-schema.ts` (namespace → interfaces imbriquées)
- Modify: `libs/core/src/lib/temporal-runtime.ts`, `libs/core/src/lib/craft-gen.ts` (parameter properties → champs)
- Modify: remaining `@Component` / `@Directive` / `@Injectable` in core/component (doivent déjà être partis après 4, 7, 9 ; sinon move to `libs/angular`)
- Modify: `libs/core/project.json`, `libs/component/project.json` (test: `nx:run-commands` `npx vitest run`, plus `@nx/angular:unit-test`)
- Modify: `apps/demo/project.json` (serve Vite ; target `typecheck` déjà présent — le laisser tourner **en parallèle** du serve)
- Create: `apps/demo/vite.config.ts`
- Modify: `tools/serve-demo.mjs` (spawn Vite, plus `@angular/build:dev-server` comme chemin par défaut)

**Interfaces:**
- Produces: `npx vitest run libs/core/src/lib/state.spec.ts` sans Angular compiler. `vite` sert la demo. `tsc -p apps/demo/tsconfig.app.json --noEmit` est un process séparé.

- [ ] **Step 1: Enable `erasableSyntaxOnly` in a fixture tsconfig and run `tsc` — list remaining errors. Fix namespace + parameter properties first.**

- [ ] **Step 2: `npx tsc -p libs/core/tsconfig.lib.json --noEmit` expected FAIL on remaining decorators if any.**

- [ ] **Step 3: Delete last decorators or move them. Point test/serve to Vitest/Vite. Keep `demo:typecheck` as a second Nx target, not a blocker of `demo:serve`.**

- [ ] **Step 4: Run**

```bash
npx vitest run libs/core/src/lib/state.spec.ts
npx tsc -p libs/core/tsconfig.lib.json --noEmit
```

Expected: vitest PASS in seconds without ngc ; tsc PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
build: serve and test by stripping types, typecheck in parallel

EOF
)"
```

---

### Task 11: Package `@craft-ng/angular` + coupure des peers

**Files:**
- Create: `libs/angular/package.json` (`@craft-ng/angular`, peers `@angular/core` `^21`, `@angular/router`, `@craft-ng/core`, `@craft-ng/component`)
- Create: `libs/angular/src/index.ts` — `toCraftService`, `injectService`, `angular()`, `directive()`, `LegacyCraftRouterLink`, `LegacyCraftFieldDirective`, hosts `bridge`, `CraftAngularDirectiveHost`
- Move from core/component the symbols listed above
- Modify: `libs/core/package.json` / `libs/component/package.json` — retirer peers `@angular/*`. Garder `rxjs` **uniquement** s’il reste un import prod ; sinon le retirer aussi
- Modify: `apps/docs/guide/concepts/vs-angular.md`, `README.md`, `apps/docs/guide/app/integrate-existing.md`
- Modify: `apps/docs/resources/roadmap.md` (SSR = host Craft, plus Angular SSR)

**Interfaces:**
- Produces: `@craft-ng/core` `peerDependencies` sans Angular. Import auteur type :

```ts
import { toCraftService } from '@craft-ng/angular';
import { angular } from '@craft-ng/angular';
```

- [ ] **Step 1: Grep `from '@angular/` in `libs/core/src` and `libs/component/src` excluding `*.spec.ts` that still live in angular. Expected after this task: zero matches in production files.**

Write `libs/core/src/lib/host/no-angular-imports.spec.ts` :

```ts
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('core production sources', () => {
  it('do not import @angular', () => {
    const out = execSync(
      "rg -l \"from '@angular/\" libs/core/src libs/component/src --glob '!*.spec.ts' || true",
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe('');
  });
});
```

- [ ] **Step 2: Run — FAIL until moves complete**

- [ ] **Step 3: Move Angular adapters. Remove peer deps. Update docs: Craft is the runtime ; Angular is an optional island.**

- [ ] **Step 4: Run full `npx nx test ng-craft-core && npx nx test ng-craft-component && npx nx typecheck demo` plus le grep spec**

Expected: PASS. `npm pack` de core n’a plus `@angular` en peer.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: drop Angular peers from core and ship @craft-ng/angular

EOF
)"
```

---

## Hors v1 (plans suivants, ne pas commencer ici)

- Compilateur prod v1 (lift + sous-arbres statiques, OXC) : `docs/superpowers/plans/2026-08-15-compilateur-prod-v1.md`
- Suite compilateur (bindings spécialisés, DI AOT, matcher, SSR) : `docs/superpowers/plans/2026-08-15-compilateur-prod-suite.md`
- Virtualisation `each`.
- Scheduler rAF / priorités (sauf le flush sync view-transition déjà dans la tâche 9).
- Rename `@craft-ng` → `@craft`.

## Bancs à poser dès la tâche 2 (ne pas attendre la fin)

| Banc | Commande / lieu | Quand ça doit bouger |
|---|---|---|
| Bundle demo Counter | `npx nx build demo` puis taille `dist/apps/demo` JS initial | Tâches 4, 5, 11 |
| Update 1000 `each` | spec interpreter existante + `performance.now()` | Tâches 4, 6 |
| `setupCraftServiceTest` | durée `npx vitest run libs/core/src/lib/setup-craft-service-test.spec.ts` | Tâche 8 |

Mesurer avant/après chaque swap. Ne pas « optimiser » pendant un wrap.

---

## Self-review

- Couverture : sceller, wrap signaux, wrap DI, DOM, HTTP, swap signaux, injector natif, tests, router, dual pipeline, coupure peers, docs. Compilateur prod explicitement hors v1.
- Pas de TBD. Interfaces nommées. Fichiers existants cités.
- `craftSignal` / `CraftInjector` / `CraftDomAdapter` / `CraftHistory` sont les contrats que les tâches 6–9 consomment tels quels.
