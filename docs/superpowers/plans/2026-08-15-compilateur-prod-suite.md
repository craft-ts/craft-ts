# Compilateur prod suite — bindings, DI AOT, matcher, SSR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Après le compilateur prod v1, spécialiser le hot path : bindings DOM directs, `yield*` globaux résolus à la compile, table de routes compilée, et génération HTML pour le SSR.

**Architecture:** Mêmes passes OXC (`packages/craft-compiler`). Chaque tâche ajoute une passe Rust + un runtime minimal. Le JS non compilé reste correct (interpreter, `CraftInjector.get`, matcher runtime, pas de SSR). Prérequis : [sortie Angular v1](./2026-08-15-sortie-angular-v1.md) (DOM adapter, injector, history matcher) et [compilateur prod v1](./2026-08-15-compilateur-prod-v1.md) (`compileModule`, `staticElement`, plugin Vite).

**Tech Stack:** OXC + NAPI déjà posés, `CraftDomAdapter`, `CraftInjector` / `craftToken`, `matchCraftRoutes` / `CraftHistory`, `fetch`. Pas de nouveau langage.

## Global Constraints

- Une passe = un golden + un runtime helper. Ne pas fusionner les quatre dans un seul PR.
- Dev serve : toujours sans ces passes (sauf SSR *preview* opt-in, tâche 4).
- DI AOT seulement pour `scope: 'global'` et `scope: 'function'` **sans** override runtime. `abstract` / `toProvide` restent dynamiques.
- SSR v1 = HTML string + hydration par **re-mount** Craft (pas de resumability). Attrs `data-craft-hk` stables.
- Matcher compilé : même sémantique que `matchCraftRoutes` (segments, `:param`, `**`, pending inchangé).
- Interdiction : réécrire le graphe de types, virtualiser `each`, scheduler rAF (sauf flush déjà fait pour view transitions).

## File map

| File | Responsibility |
|---|---|
| Create `packages/craft-compiler/src/bindings.rs` | `p(counter)` → `bindText(el, counter)` |
| Create `libs/component/src/lib/render/specialized-bindings.ts` | Runtime `bindText` / `bindAttr` / `bindProp` |
| Create `packages/craft-compiler/src/di_aot.rs` | `yield* Counter()` global → identifiant module |
| Create `libs/core/src/lib/host/di-aot-registry.ts` | Table `serviceName → instance` remplie au bootstrap |
| Create `packages/craft-compiler/src/routes.rs` | `craftRoutes(...)` → fonction `match_demo(pathname)` |
| Modify `libs/core/src/lib/host/craft-router-runtime.ts` | Accrocher matcher compilé si présent |
| Create `packages/craft-compiler/src/ssr.rs` | Template → `renderToString` |
| Create `libs/component/src/lib/render/render-to-string.ts` | Interpreter HTML (DOM adapter virtuel) |
| Modify `packages/craft-compiler/src/lib.rs` | Ordre des passes (voir ci-dessous) |
| Modify `libs/dev-tools/src/vite/craft-prod-compiler.ts` | Flags par passe |

Ordre des passes dans `compile_module` :

```text
lift → statics → bindings → di_aot → routes → (ssr emit à part, fichier `*.ssr.js`)
```

SSR n’écrase pas le module client : second artifact.

---

### Task 1: Bindings spécialisés

**Files:**
- Create: `libs/component/src/lib/render/specialized-bindings.ts`
- Create: `libs/component/src/lib/render/specialized-bindings.spec.ts`
- Create: `packages/craft-compiler/src/bindings.rs`
- Create: `packages/craft-compiler/fixtures/bind-text/input.ts`
- Create: `packages/craft-compiler/fixtures/bind-text/output.js`
- Modify: `packages/craft-compiler/src/lib.rs`
- Modify: `libs/component/src/index.ts`

**Interfaces:**
- Consumes: `CraftDomAdapter`, `craftWatch` (host réactivité, plan sortie Angular).
- Produces:

```ts
export function bindText(
  node: Text,
  read: () => unknown,
  watch: (fn: () => void) => { destroy(): void },
): { destroy(): void };

export function bindProp(
  el: Element,
  prop: string,
  read: () => unknown,
  watch: (fn: () => void) => { destroy(): void },
): { destroy(): void };

export function bindAttr(
  el: Element,
  name: string,
  read: () => unknown,
  watch: (fn: () => void) => { destroy(): void },
): { destroy(): void };
```

Implémentation : `watch(() => { const v = read(); /* setValue / setProperty / setAttribute */ })`. **Aucun** `executeTemplateCallback`, aucun générateur.

Passe compilateur : après statics, dans le template `craftComponent` :

- `p(counter)` où `counter` est un `Identifier` (pas un call, pas un literal) → le parent compilé crée le `Text` et appelle `bindText(text, counter, watch)`
- `button({ disabled: isZero, click: inc }, 'x')` → `disabled` via `bindProp`, `click` reste `listen`, label `'x'` déjà `staticText`

v1 de cette passe : seulement enfant Identifier / MemberExpression **sans call**, et props Identifier. Les `function*` de binding restent à l’interpreter.

Le compilateur ne peut pas émettre `bindText` tout seul sans inliner le montage. Stratégie **pragmatic** : émettre un nœud runtime

```ts
export function boundText(read: () => unknown): CraftNode;
export function boundElement(
  tag: string,
  binds: Readonly<Record<string, () => unknown>>,
  events: Readonly<Record<string, EventListener>>,
  children: readonly CraftNode[],
): CraftNode;
```

L’interpreter, voyant `kind: 'bound-text'`, fait `bindText` au lieu de `ReactiveTextRenderedNode` + `executeTemplateCallback`.

C’est le bon seam : une passe AST simple (`p(ident)` → `boundText(ident)`) + un chemin interpreter court.

- [ ] **Step 1: Write runtime test**

```ts
/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { boundText } from './specialized-bindings';
import { craftSignal } from '@craft-ng/core';

describe('boundText', () => {
  it('patches only the text node when the reader changes', () => {
    const n = craftSignal(0);
    const node = boundText(n);
    expect(node).toMatchObject({ kind: 'bound-text' });
  });
});
```

Golden `p(counter)` → `boundText(counter)`.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `boundText` / `boundElement` in interpreter (reuse `createBrowserDomAdapter.setValue`). Implement `bindings.rs` rewrite of hyperscript Identifier children.**

- [ ] **Step 4: Port `interpreter.spec.ts` « updates only the reactive text binding » onto a **compiled** fixture. Assert `executeTemplateCallback` is not on the stack (spy). Run goldens.**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: compile identifier template reads to boundText

EOF
)"
```

---

### Task 2: DI AOT (scopes `global` / `function`)

**Files:**
- Create: `libs/core/src/lib/host/di-aot-registry.ts`
- Create: `libs/core/src/lib/host/di-aot-registry.spec.ts`
- Create: `packages/craft-compiler/src/di_aot.rs`
- Create: `packages/craft-compiler/fixtures/di-global/input.ts`
- Create: `packages/craft-compiler/fixtures/di-global/output.js`
- Modify: `libs/core/src/lib/craft-generator-runtime.ts` (hook : si le yield a un ident AOT, skip `injector.get`)
- Modify: `packages/craft-compiler/src/lib.rs`

**Interfaces:**
- Consumes: `craftService({ name, scope: 'global' | 'function' })` tel qu’écrit aujourd’hui.
- Produces:

```ts
export const CRAFT_AOT_GLOBALS: unique symbol;

export function registerAotGlobal(name: string, instance: unknown): void;
export function getAotGlobal(name: string): unknown | undefined;
```

Passe : dans un `function*` de `craftService` / `craftComponent` factory, `yield* Foo()` où `Foo` est un identifiant importé dont la définition dans le **même graphe de fichiers du build** est `craftService({ name: 'Foo', scope: 'global' }, ...)` :

```ts
// avant
const api = yield* Foo();
// après
const api = getAotGlobal('Foo');
```

Le bootstrap (premier `provide` / `createCraftInjector` root) appelle encore la factory une fois et `registerAotGlobal('Foo', instance)`.

**Ne pas AOT :** `abstract`, `toProvide`, `manuallyProvidedAtRoot`, yields partiels `Foo.bar()`, overrides `SERVICE_RUNTIME_OVERRIDES` (tests). Si un test register mock `Foo`, `getAotGlobal` doit lire l’override — donc `getAotGlobal` consulte d’abord `SERVICE_RUNTIME_OVERRIDES`.

v1 AOT **intra-module + imports statiques** seulement. Pas d’analyse cross-chunk lazy. Un `craftLazy` reste dynamique.

- [ ] **Step 1: Golden**

```ts
const { Foo } = craftService({ name: 'Foo', scope: 'global' }, function* () {
  return { ping: () => 1 };
});
const { Bar } = craftService({ name: 'Bar', scope: 'global' }, function* () {
  const foo = yield* Foo();
  return foo;
});
```

`output.js` pour `Bar` : `getAotGlobal('Foo')`, plus de `yield* Foo()`.

Test runtime : `setupCraftServiceTest` avec override `Foo` → `getAotGlobal` voit le mock.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement registry + rewrite. `di_aot.rs` résout les `craftService({ name: '…', scope: 'global' })` du fichier et des imports dont la source est dans `filename` graph passé par le plugin (liste `importedIds` Vite). Sans graph (CLI fichier unique) : AOT intra-fichier only.**

- [ ] **Step 4: Run `craft-service.spec` existant + golden. Un spec « override in test still wins ».**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: AOT global craftService yields to a bootstrap registry

EOF
)"
```

---

### Task 3: Matcher de routes compilé

**Files:**
- Create: `packages/craft-compiler/src/routes.rs`
- Create: `packages/craft-compiler/fixtures/routes-trie/input.ts`
- Create: `packages/craft-compiler/fixtures/routes-trie/output.js`
- Modify: `libs/core/src/lib/host/craft-router-runtime.ts`
- Modify: `libs/core/src/lib/craft-routes.ts` (hook `ɵcompiledMatcher` optionnel)

**Interfaces:**
- Consumes: `matchCraftRoutes` runtime (sortie Angular v1).
- Produces: pour un `craftRoutes('demo', [ ... ])`, émettre

```ts
export function match_demo(pathname: string): {
  path: string;
  params: Record<string, string>;
} | null;
```

implémenté comme chaîne de tests (pas de table Angular) :

```ts
export function match_demo(pathname: string) {
  const segs = pathname.split('/').filter(Boolean);
  if (segs.length === 1 && segs[0] === 'about') return { path: 'about', params: {} };
  if (segs.length === 2 && segs[0] === 'users') return { path: 'users/:id', params: { id: segs[1] } };
  return null;
}
```

`craft-router-runtime` : `const match = routes[COMPILED_MATCHER]?.(pathname) ?? matchCraftRoutes(routes, location)`.

Wildcards `**` : dernier `return { path: '**', params: { splat: segs.slice(i).join('/') } }`.

Ne pas compiler guards / pending / lazy : le match ne fait que path + params. Le reste du runtime outlet inchangé.

- [ ] **Step 1: Golden avec `about`, `users/:id`, `**`. Test runtime : compiled matcher === `matchCraftRoutes` sur 20 URLs (table dans le spec).**

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `routes.rs` : trouver `craftRoutes(`, extraire `path:` string literals (ignorer computed paths — skip la route, fallback runtime). Generate `match_<name>`.**

- [ ] **Step 4: Run `craft-routes.spec` + golden. Bench 1000 `match` compiled vs runtime, assertion compiled ≤ runtime.**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: compile craftRoutes path tables to a match function

EOF
)"
```

---

### Task 4: SSR `renderToString`

**Files:**
- Create: `libs/component/src/lib/render/render-to-string.ts`
- Create: `libs/component/src/lib/render/render-to-string.spec.ts`
- Create: `libs/core/src/lib/host/ssr-document.ts` (adapter DOM string, pas jsdom obligatoire)
- Create: `packages/craft-compiler/src/ssr.rs` (optionnel v1 : peut n’être qu’un entry `export function renderDemo(url)` généré)
- Create: `packages/craft-compiler/fixtures/ssr-counter/input.ts`
- Modify: `libs/dev-tools/src/vite/craft-prod-compiler.ts` (`generateBundle` émet `*.ssr.js`)
- Modify: `apps/docs/resources/roadmap.md` (SSR Craft, plus Angular)

**Interfaces:**
- Consumes: interpreter + `CraftDomAdapter` + `createCraftInjector` + matcher (compilé ou runtime).
- Produces:

```ts
export type RenderToStringOptions = {
  url: string;
  injector: CraftInjector;
};

export function renderToString(
  root: CraftComponent<any>,
  options: RenderToStringOptions,
): Promise<string>;
```

Adapter SSR :

```ts
export function createStringDomAdapter(): CraftDomAdapter & { serialize(): string };
```

`createElement` alloue un nœud virtuel `{ tag, attrs, children }`. `serialize()` → HTML. Bindings : lire la valeur **une fois** (pas de `watch` persistant). `pendingBlock` : rendre le fallback ou attendre `craftUntilSettled` (réutiliser le runtime settled déjà dans core).

Hydration v1 : le client **remonte** le composant (wipe + mount). Attribut `data-craft-root` sur le host. Pas de morph DOM (plus tard).

`ssr.rs` v1 : générer un module

```js
export async function render(url, injector) {
  const match = match_demo(new URL(url, 'http://local').pathname);
  // import root component, renderToString
}
```

seulement si le fichier contient `craftRoutes`. Sinon skip.

- [ ] **Step 1: Write `render-to-string.spec.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { craftComponent, p, h2 } from '@craft-ng/component';
import { createCraftInjector } from '@craft-ng/core';
import { renderToString } from './render-to-string';

const Page = craftComponent('Page', {}, () => ({}), () => [h2('Hello'), p('world')]);

describe('renderToString', () => {
  it('serializes static markup', async () => {
    const html = await renderToString(Page, {
      url: '/',
      injector: createCraftInjector([]),
    });
    expect(html).toContain('<h2>Hello</h2>');
    expect(html).toContain('<p>world</p>');
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement string DOM adapter + `renderToString` walking the same interpreter mount path. Do not use jsdom. Then add compiled static nodes path (already `staticElement`). Then Vite emit `render` for demo.**

- [ ] **Step 4: Spec : Counter with `state(0)` SSR shows `0`. `pendingBlock` on a slow query : wait until settled or render fallback — pick **wait until settled** with a 2s test timeout for the spec, fallback documented as follow-up if timeout.**

Expected: PASS. Demo : script `ssr:demo` qui imprime `/` en HTML.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: render Craft components to HTML strings

EOF
)"
```

---

## Hors de ce plan

- Hydration fine (reprise des nœuds).
- Resumability / islands.
- Type-aware DI AOT cross-project.
- Virtualisation `each`.
- Streaming HTML chunked (`ReadableStream`) — v2 SSR.

## Self-review

- Quatre tâches indépendamment shippables, ordre bindings → DI → matcher → SSR (SSR profite des statics + matcher).
- Runtime helpers nommés (`boundText`, `getAotGlobal`, `match_<name>`, `renderToString`).
- Prérequis explicitement liés aux deux autres plans.
- OXC conservé ; pas de second langage.
