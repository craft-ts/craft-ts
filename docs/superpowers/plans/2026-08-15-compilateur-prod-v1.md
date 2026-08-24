# Compilateur prod v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En build de production, réécrire les templates `craftComponent` pour (1) lifter les lectures réactives trop tôt et (2) compiler les sous-arbres 100 % statiques, sans changer le DSL auteur.

**Architecture:** Pas un compilateur TypeScript écrit from scratch. Parse + emit via **OXC** (Rust, même stack que Vite/Rolldown). Les faits de types Craft restent à `tsc` (déjà parallèle en dev). Le crate Rust `craft-compiler` expose un NAPI ; un plugin Vite `craft-ng/vite` l’appelle seulement en `command === 'build'`. Dev continue de strip-types sans ces passes.

**Tech Stack:** OXC (`oxc_parser`, `oxc_ast`, `oxc_codegen`, `oxc_allocator`), NAPI-RS, Vite 6, Vitest (golden files), TypeScript 5.9. Dépend de la sortie Angular v1 pour le DOM adapter (`createBrowserDomAdapter`) mais les goldens peuvent se tester sur l’interpreter actuel.

## Choix d’outil — Rust, mais pas « un compilateur Rust »

| Option | Verdict |
|---|---|
| Rust from scratch (lexer/parser TS) | Non. Des années, pire que tsc au début. |
| **OXC (Rust)** | **Oui.** Parser JS/TS le plus rapide aujourd’hui. Transforms custom en Rust sans repasser par JS. |
| esbuild (Go) | Aussi rapide au *bundle*, plugins sémantiques en JS → on perd l’avantage. Mauvais pour un DSL. |
| swc (Rust) | Valable, plus lent qu’OXC, plugins plus lourds. |
| ts-morph / tsc API | Déjà dans le repo. Bon pour un prototype de règles, trop lent en prod sur une app. |
| tsgo (Go) | Typecheck plus rapide, pas un moteur de rewrite. À considérer plus tard pour les *facts* de types, pas pour v1. |
| Zig / Bun | Runtime, pas une API de transform Craft. |

Plus rapide que « du Rust » n’existe pas vraiment sur le parse JS : OXC *est* ce Rust-là. Plus **efficace** : ne pas réécrire un parser, brancher des passes sur OXC, et laisser `tsc --noEmit` seul responsable du graphe yield.

v1 **n’utilise pas** le checker TypeScript pendant le rewrite. Règles syntaxiques conservatrices, alignées sur `require-reactive-template-bindings`. Si on ne peut pas prouver qu’un appel est un lecteur, on ne touche pas (l’ESLint reste la garde auteur).

## Global Constraints

- Dev (`vite serve`, Vitest) : **aucune** passe prod. Strip-types only.
- Le JS non compilé reste sémantiquement correct. Le compilateur est un accélérateur, pas une VM.
- Ne pas typer, ne pas résoudre les modules, ne pas bundler (Vite/Rolldown s’en chargent).
- Ne pas compiler `forNode` / `ifNode` / `matchNode` / `deferNode` en v1 (structure déjà scopée).
- Ne pas faire bindings spécialisés, DI AOT, matcher, SSR (plan suivant).
- Golden tests : `packages/craft-compiler/fixtures/<name>/input.ts` → `output.js`. Un diff inattendu = fail.
- `erasableSyntaxOnly` déjà vrai sur le source auteur (plan sortie Angular). Le compilateur n’a pas à downleveler des décorateurs.

## File map

| File | Responsibility |
|---|---|
| Create `packages/craft-compiler/Cargo.toml` | Crate Rust, deps oxc + napi |
| Create `packages/craft-compiler/src/lib.rs` | `compile_module(source, filename) -> String` |
| Create `packages/craft-compiler/src/lift.rs` | Passe lift des lectures |
| Create `packages/craft-compiler/src/statics.rs` | Passe sous-arbres statiques |
| Create `packages/craft-compiler/index.d.ts` | `compileModule(source: string, filename: string): string` |
| Create `packages/craft-compiler/package.json` | `@craft-ng/compiler`, bin `craft-compile` |
| Create `packages/craft-compiler/fixtures/**` | Goldens |
| Create `packages/craft-compiler/test/goldens.spec.ts` | Runner Vitest |
| Create `libs/component/src/lib/render/static-node.ts` | Runtime `staticText` / `staticElement` |
| Modify `libs/component/src/lib/render/interpreter.ts` | Monter `static-*` sans effet, sans `normalizeChildren` fonction |
| Modify `libs/component/src/index.ts` | Exporter les helpers runtime (pour le JS émis) |
| Create `libs/dev-tools/src/vite/craft-prod-compiler.ts` | Plugin Vite `apply: 'build'` |
| Modify `apps/demo` vite config (après sortie Angular) | Brancher le plugin en production |

Prérequis : sortie Angular v1 **pas bloquante** pour les goldens + runtime `static-*` (tâches 1–4). Le plugin Vite demo (tâche 5) attend le serve Vite du plan sortie Angular.

---

### Task 1: Harness OXC identité

**Files:**
- Create: `packages/craft-compiler/Cargo.toml`
- Create: `packages/craft-compiler/src/lib.rs`
- Create: `packages/craft-compiler/src/napi.rs`
- Create: `packages/craft-compiler/package.json`
- Create: `packages/craft-compiler/index.d.ts`
- Create: `packages/craft-compiler/fixtures/identity/input.ts`
- Create: `packages/craft-compiler/test/goldens.spec.ts`

**Interfaces:**
- Produces:

```ts
// packages/craft-compiler/index.d.ts
export function compileModule(source: string, filename: string): string;
```

Rust :

```rust
pub fn compile_module(source: &str, filename: &str) -> Result<String, CompileError>;
```

v1 de cette tâche : parse OXC + codegen **sans** transform (pretty-print stable). Prouve la chaîne NAPI.

- [ ] **Step 1: Write the failing golden**

`fixtures/identity/input.ts` :

```ts
import { craftComponent, p } from '@craft-ng/component';
import { state } from '@craft-ng/core';

export const Counter = craftComponent('Counter', {}, function* () {
  const counter = yield* state('counter', 0);
  return { counter };
}, ({ counter }) => p(counter));
```

`test/goldens.spec.ts` :

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileModule } from '../index.js';

describe('craft-compiler goldens', () => {
  it('identity roundtrips Counter', () => {
    const dir = join(import.meta.dirname, '../fixtures/identity');
    const input = readFileSync(join(dir, 'input.ts'), 'utf8');
    const actual = compileModule(input, 'input.ts');
    expect(actual).toContain('craftComponent');
    expect(actual).toContain('p(counter)');
  });
});
```

- [ ] **Step 2: Run `npx vitest run packages/craft-compiler/test/goldens.spec.ts`**

Expected: FAIL cannot find module `@craft-ng/compiler`

- [ ] **Step 3: Scaffold the crate**

`Cargo.toml` : `oxc_parser`, `oxc_codegen`, `oxc_allocator`, `napi`, `napi-derive`. Edition 2021. `index.d.ts` + build NAPI (`napi build --platform`).

`lib.rs` parse `SourceType::ts()`, codegen the Program unchanged.

- [ ] **Step 4: Re-run goldens**

Expected: PASS (`craftComponent` et `p(counter)` présents). Snapshot optionnel `output.js` commité une fois le pretty-print stable.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: add OXC identity compiler crate

EOF
)"
```

---

### Task 2: Runtime `staticText` / `staticElement`

**Files:**
- Create: `libs/component/src/lib/render/static-node.ts`
- Create: `libs/component/src/lib/render/static-node.spec.ts`
- Modify: `libs/component/src/lib/render/vnode.ts` (kinds `'static-text'` / `'static-element'`)
- Modify: `libs/component/src/lib/render/interpreter.ts`
- Modify: `libs/component/src/index.ts`

**Interfaces:**
- Produces:

```ts
export function staticText(value: string): CraftNode;
export function staticElement(
  tag: string,
  attrs: Readonly<Record<string, string | number | boolean>>,
  children?: readonly CraftNode[],
): CraftNode;
```

Le compilateur émet des appels à ces helpers. L’interpreter les monte comme des nœuds `text` / `element` **sans** `craftEffect`, sans `normalizeChildren` sur des fonctions.

- [ ] **Step 1: Write the failing test**

```ts
/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { staticElement, staticText } from './static-node';

describe('static nodes', () => {
  it('is not a function child (not a reactive-text binding)', () => {
    const node = staticElement('h2', {}, [staticText('Counter')]);
    expect(node).toMatchObject({ kind: 'static-element', tag: 'h2' });
  });
});
```

Ajouter dans `interpreter.spec.ts` un montage : `staticElement('p', {}, [staticText('hello')])` → `textContent === 'hello'`, et **aucun** `component / update` si on mute un signal non lu (preuve : pas d’effet).

- [ ] **Step 2: Run — FAIL module not found**

- [ ] **Step 3: Implement kinds + interpreter branch. `staticElement` ignore les yieldables ; attrs = primitives only.**

- [ ] **Step 4: Run `npx nx test ng-craft-component --testPathPattern=static-node` and interpreter spec**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add static Craft nodes for the prod compiler

EOF
)"
```

---

### Task 3: Passe lift des lectures

**Files:**
- Create: `packages/craft-compiler/src/lift.rs`
- Create: `packages/craft-compiler/fixtures/lift-text/input.ts`
- Create: `packages/craft-compiler/fixtures/lift-text/output.js`
- Create: `packages/craft-compiler/fixtures/lift-prop/input.ts`
- Create: `packages/craft-compiler/fixtures/lift-prop/output.js`
- Create: `packages/craft-compiler/fixtures/lift-skip-event/input.ts`
- Modify: `packages/craft-compiler/src/lib.rs` (appeler lift avant codegen)
- Modify: `packages/craft-compiler/test/goldens.spec.ts`

**Interfaces:**
- Consumes: AST OXC d’un module.
- Produces: réécritures **uniquement** dans le 4e argument de `craftComponent(...)` (le template).

Règles (syntaxiques, conservatrices) :

1. En position **enfant** d’un helper hyperscript (`p`, `h1`…`h6`, `span`, `button`, `div`, `label`, `li`, `td`, `th`, `pre`, `code`, `a`) :  
   - `p(counter())` → `p(() => counter())`  
   - `p(\`Count: ${counter()}\`)` → `p(() => \`Count: ${counter()}\`)`  
   - `p(obj.n())` → `p(() => obj.n())` si `obj.n` est un `CallExpression` / `TaggedTemplate` lu maintenant.
2. En position **valeur de prop** non-événement (`disabled`, `title`, `class`, `value`, `hidden`, `checked`) :  
   - `button({ disabled: isZero() }, 'x')` → `button({ disabled: () => isZero() }, 'x')`
3. **Ne pas** lifter :  
   - handlers `click` / `submit` / `input` / `change` / …  
   - arguments de `ifNode` / `forNode` / `matchNode` / `deferNode` (structure)
   - ce qui est **déjà** une arrow / `function*`  
   - `p(counter)` (déjà un lecteur)  
   - appels avec arguments `foo(1)` (ce n’est pas un lecteur Craft)

Le runtime n’a pas besoin de `yield*` ici : `() => counter()` est déjà un `CraftTextBinding` accepté (`vnode.ts`).

- [ ] **Step 1: Write goldens**

`fixtures/lift-text/input.ts` :

```ts
import { craftComponent, p, button } from '@craft-ng/component';

export const Demo = craftComponent('Demo', {}, () => ({}), ({ n, isZero }) =>
  p(`Count: ${n()}`),
);
```

`output.js` doit contenir `() => \`Count: ${n()}\`` et ne plus contenir `` p(`Count: ${n()}`) `` au top-level du template.

`fixtures/lift-skip-event/input.ts` : `button({ click: n.increment }, '+')` inchangé.

- [ ] **Step 2: Run goldens — FAIL (identity still has eager read)**

- [ ] **Step 3: Implement `lift.rs` VisitMut : trouver `CallExpression` callee `craftComponent`, 4e arg. Walk hyperscript calls by known callee names (liste des `tagHelper` dans `hyperscript.ts`). Rewrite.**

Liste des callees (copier depuis `libs/component/src/lib/hyperscript.ts`) : `a`, `article`, `aside`, `button`, `div`, `footer`, `form`, `h1`–`h6`, `header`, `img`, `input`, `label`, `li`, `main`, `nav`, `ol`, `option`, `p`, `section`, `select`, `span`, `table`, `tbody`, `td`, `textarea`, `th`, `thead`, `tr`, `ul`, `pre`, `code`.

- [ ] **Step 4: Run goldens + un test interpreter : source *émise* montée, click incrémente, le texte lifté change sans `component / update`.**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: lift eager reactive reads in craft templates

EOF
)"
```

---

### Task 4: Passe sous-arbres statiques

**Files:**
- Create: `packages/craft-compiler/src/statics.rs`
- Create: `packages/craft-compiler/fixtures/static-heading/input.ts`
- Create: `packages/craft-compiler/fixtures/static-heading/output.js`
- Create: `packages/craft-compiler/fixtures/static-mixed/input.ts`
- Modify: `packages/craft-compiler/src/lib.rs` (lift puis statics)
- Modify: `libs/component/src/lib/render/interpreter.ts` si un cas d’attrs statiques manque

**Interfaces:**
- Consumes: AST après lift.
- Produces: appels `staticText` / `staticElement` importés depuis `@craft-ng/component`.

Un nœud est statique si :

- callee ∈ tag helpers
- props absentes **ou** objet littéral dont toutes les valeurs sont des littéraux (string/number/boolean), pas de `click`, pas de fonction
- enfants absents, ou tous statiques (`staticText` / `staticElement` / string literal)

`h2('Counter')` → `staticElement('h2', {}, [staticText('Counter')])`

`div({ class: 'box' }, [h2('T'), p(counter)])` → `div({ class: 'box' }, [staticElement('h2', {}, [staticText('T')]), p(counter)])`  
(`div` n’est **pas** entièrement statique à cause de `p(counter)`.)

Ajouter l’import si absent :

```js
import { staticElement, staticText } from '@craft-ng/component';
```

- [ ] **Step 1: Write goldens static-heading + static-mixed**

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement `statics.rs`. Ordre : lift d’abord (pour ne pas figer un `n()` oublié), statics ensuite.**

- [ ] **Step 4: Run goldens. Bench manuel : fixture 200 `h2('x')` siblings, `performance.now()` mount compiled vs uncompiled (spec `statics.bench.spec.ts`, assertion `compiled <= uncompiled`, pas de seuil magique).

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: compile static hyperscript subtrees to staticElement

EOF
)"
```

---

### Task 5: Plugin Vite prod + CLI

**Files:**
- Create: `libs/dev-tools/src/vite/craft-prod-compiler.ts`
- Modify: `libs/dev-tools/package.json` exports `./vite`
- Create: `packages/craft-compiler/src/bin.rs` ou `src/bin/craft-compile.ts` (Node qui charge le NAPI)
- Modify: `apps/demo/vite.config.ts` (après sortie Angular) `command === 'build'` only
- Modify: `apps/docs/guide/components/fine-grained-reactivity.md` (une note : le compilateur prod lift aussi `p(n())`)

**Interfaces:**
- Produces:

```ts
import type { Plugin } from 'vite';

export function craftProdCompiler(): Plugin;
```

```ts
{
  name: 'craft-prod-compiler',
  apply: 'build',
  transform(code, id) {
    if (!id.endsWith('.ts') || id.includes('node_modules')) return null;
    if (!code.includes('craftComponent')) return null;
    return { code: compileModule(code, id), map: null };
  },
}
```

CLI : `npx craft-compile path/to/file.ts` écrit sur stdout (debug goldens).

- [ ] **Step 1: Test the plugin with `vite.build` on a one-file fixture app that uses `p(\`Count: ${n()}\`)` and assert the bundled source contains `() =>` wrapping the read.**

- [ ] **Step 2: Run — FAIL plugin missing**

- [ ] **Step 3: Implement plugin + wire demo production build. `apply: 'build'` strict (pas de serve).

- [ ] **Step 4: `npx nx build demo` + grep du bundle pour `staticElement` sur la page Counter.**

Expected: PASS, bundle contient `staticElement` et plus de `` `Count: ${`` eager dans le template Counter.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: run craft prod compiler in Vite production builds

EOF
)"
```

---

## Hors v1 compilateur

Bindings spécialisés, DI AOT, matcher compilé, SSR `toHTML` : `docs/superpowers/plans/2026-08-15-compilateur-prod-suite.md`.

Type-aware lift (tsc/tsgo facts) : seulement si les goldens syntaxiques ratent des cas réels (lecteurs non-call `getCount()` avec args). Ne pas l’ajouter en avance.

## Self-review

- v1 = identité OXC + runtime static + lift + statics + Vite prod. Pas de DI, pas de SSR.
- OXC choisi ; parser maison rejeté ; esbuild rejeté pour les transforms sémantiques.
- Goldens nommés, helpers runtime nommés, liste des tag helpers copiée de `hyperscript.ts`.
