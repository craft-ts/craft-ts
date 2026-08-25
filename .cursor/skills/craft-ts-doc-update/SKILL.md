---
name: craft-ts-doc-update
description: Author and update craft-ts VitePress docs in apps/docs — page shape, Learn vs Guide sections, and tested snippet regions (`<<<`). Use when editing apps/docs markdown, adding or converting TypeScript examples, touching tests/snippets, or when the user mentions documentation, a learn/guide page, or "mettre à jour la doc".
---

# Updating craft-ts docs

Docs live in `apps/docs` (VitePress). English only. The **spec is the source of truth** for complete examples; Markdown imports a named region. GitHub shows `<<<`, not the code — that is accepted.

If this skill and the installed APIs disagree, prefer `apps/docs` pages that already use `<<<` and the corresponding spec under `apps/docs/tests/snippets/`.

## Where a page belongs

| Section | Path | Job |
|---|---|---|
| **Learn** | `learn/NN-….md` | One idea per step. Numbered. Progressive. Ends with prev/next. |
| **Guide** | `guide/<topic>/….md` | Task-oriented. One API or decision per page. |
| **Reference** | `reference/` | Index of names → guide pages. Do not dump tutorials here. |
| **Resources** | `resources/` | Migration, examples, roadmap — not API teaching. |

Add a new Guide/Learn page to the sidebar in `apps/docs/.vitepress/config.mts`. Outline depth is `[2, 3]`.

## Page shape

### Learn

```markdown
# N. Title

**Goal:** one sentence — what the reader can do after this step.

## … sections that introduce one mechanism each …

## What you gained

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← previous](/learn/…)

[next →](/learn/…)

</div>
```

Keep ellipses, anti-examples, and 1–5 line signatures **inline**. Extract only complete, copy-pasteable modules.

### Guide

```markdown
# API or task name

A service/component/primitive is … — not a class.

**Use it when** …
**Not when** … — link the alternative.

## Import          (short fence, usually inline)
## The common case (extracted snippet)
## Variants / pitfalls
## See Also        (links, not a second tutorial)
```

Use `::: warning`, `::: tip`, `::: details` for caveats. Contrast with Angular in a table when it prevents a wrong reflex (`inject()`, `@Input()`, `signal()`).

Do **not** document `injectX`, `XToYield`, `MaybeSignal`, or `toValue()` as the way to write Craft. Current inputs:

- Component: factory params typed `Input<T>` / `Output<H>`, consumed with `yield*`.
- Service: `function* (inputs: { x: CraftServiceInput<T> })`, consumed with `yield* inputs.x()`. The call site may pass a value, an Angular signal, or a Craft reader; the factory always yields the reader.
- Authored reactivity: `state` / `craftComputed(function*)`, never `signal()` / `computed()` / `linkedSignal()`.
- `signal()` is OK only in Angular-class interop (`integrate-existing`, class examples in `craft-method` / `craft-computed`) and in template-test harness (`markYieldableValue(signal(...), 'name')`).

## Snippets — why they exist

A Markdown fence is invisible to CI. A snippet spec is linted with the same Craft rules as the demo (`craftDemoRules`) and loaded by Vitest. If the public API moves, **complete examples fail in `nx test docs` / `nx lint docs`** instead of rotting on the site.

That is the whole point. Incomplete fragments cannot give that guarantee — leave them inline.

## Extract vs keep inline

**Extract** when the example is a complete `craftComponent` / `craftService` / `craftDirective` / `craftRoutes` / `craftAppConfig` module (imports included, no `/* … */`, no `✗`).

**Keep inline** when it is any of:

- `shell`, a signature, 1–5 lines, `declare module`
- ellipsis `/* … */` / `// …`
- anti-example (`inject()`, raw `fetch`, ternary in a template, typo `navigate`)
- top-level `yield*` fragment (not inside `function*`)
- relative imports (`./foo`) that are not part of the snippet tree
- Zod / deps the docs app does not ship
- Angular wrapping (`toCraftService` around `HttpClient`, class + `signal()`)

If an example uses a **forbidden** API but is **not** an anti-example, **update it** (e.g. `signal()` → `state()`, `MaybeSignal` → `CraftServiceInput`) then extract. Do not hide a stale API by leaving it inline.

## How to extract

1. Spec path mirrors the page: `apps/docs/tests/snippets/<learn-or-guide>/<page-without-md>/<slug>.spec.ts`
2. Slug = exported name (`tasks-component`, `current-user`). If two `Counter`s share a page, **different files and region names** (`counter-nested`, `counter-auth`). Never overwrite.
3. Region markers **must repeat the name**. Bare `#endregion` makes VitePress dump the whole file (harness included).

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useSnippetHarness } from '../../../snippet-harness'; // depth = dirs under tests/snippets/

useSnippetHarness();

// #region current-user
import { craftService, state } from '@craft-ts/core';
// … complete example, including its imports …
// #endregion current-user

describe('guide/app/expose-api.md #current-user', () => {
  it('…asserts real behaviour…', async () => { /* see Tests */ });
});
```

4. In Markdown, replace the fence with:

```
<<< @/tests/snippets/guide/app/expose-api/current-user.spec.ts#current-user
```

`@/` is the `apps/docs` root. No extra fence around `<<<`.

5. **Inside the region:** example imports, types, the `craft*` declaration. **Outside:** Vitest, `useSnippetHarness`, `it()`. Comments between harness imports and the region are fine.

Full template: [snippet-spec.md](snippet-spec.md).

## Tests — what actually protects the page

| Layer | Command | Catches |
|---|---|---|
| Vitest import | `npx nx test docs` | Parse / missing import / throw at module load |
| Real `it()` | same | Factory actually runs (`setupCraftComponentLogicTest`, `setupCraftServiceTestingByRegister`) |
| ESLint Craft | `npx nx lint docs` | `signal()` vs `state()`, `inject()`, ternary template, HTTP, a11y, `button` type |
| `snippet-imports.spec.ts` | included in test docs | every `<<<` resolves; no orphan region |
| Content tests | `tests/browser-boundaries-docs.spec.ts` | headings / quotes; use `readDoc()` so `<<<` inlines the region |

**Prefer a real assertion** (Learn 01–03, `Tasks` / `UserCard`, `CurrentUser`, OmitInputs). `expect(true).toBe(true)` only proves the file loaded.

Vitest does **not** typecheck (esbuild). A wrong `Input` / `CraftServiceInput` / `query()` arity can stay green. Lint + a running factory are the current filet. Do not claim `tsc` covers snippets unless a `docs:typecheck` target exists.

When a docs-content `toContain('yield* …')` would break after extraction, the page is already read with `readDoc('../guide/…')` from `apps/docs/tests/read-doc.ts`. Use that helper for new content tests.

## Authoring rules for example code

- `button({ type: 'button', … })` (or `button('name', { type: 'button', … })`) — `craft-ts/button-has-type`.
- No `signal()` / `computed()` / `inject()` in authored Craft.
- Service changing inputs: `CraftServiceInput<T>` + `yield* inputs.x()`. Pass a reader at the call site (`startAt` from `state`), not a bare `5`, if the factory `yield*`s the input.
- Template structure: `ifNode` / `matchNode` / `forNode`, not a ternary that creates nodes.
- Unique region names per page. `#endregion <same-name>`.

## Workflow checklist

```
- [ ] Right tree (learn / guide / reference / resources) and sidebar if new
- [ ] Goal / Use it when / Not when present where the page type requires it
- [ ] Complete examples extracted; fragments and anti-examples inline
- [ ] Stale APIs rewritten before extract (not parked inline)
- [ ] Region name on both #region and #endregion
- [ ] Markdown uses <<< @/tests/snippets/…#region
- [ ] it() instantiates the component/service when feasible
- [ ] npx nx test docs
- [ ] npx nx lint docs
```

## See also

- Snippet file template: [snippet-spec.md](snippet-spec.md)
- Existing Learn specs: `apps/docs/tests/snippets/learn/`
- Existing Guide specs: `apps/docs/tests/snippets/guide/`
- Craft ESLint set applied to snippets: `apps/demo/craft-eslint-rules.mjs`
