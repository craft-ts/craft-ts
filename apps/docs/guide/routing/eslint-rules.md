# ESLint rules

The rule set is not decoration: several checks in this documentation only work
because a rule generated or maintained the code they read. Others enforce the
architecture — no hidden runtime dependencies or direct transport calls — and most of them
**autofix**.

**Install them once** when you set up routing and type-safe DI.
**Then lean on the quick fixes** rather than writing the boilerplate by hand.

::: warning An ESLint error is not a compile error
A missing autofix does not break the build. If you skip the quick fix after
changing a component's DI shape, `main.ts` keeps reading a stale `GenDeps_*` and
can miss a real DI error. Run `eslint --fix` in CI.
:::

The plugin is exposed from `@craft-ts/dev-tools/eslint-rules`.

For a project using `@craft-ts/effect`, the published preset enables the Craft
rules and the Effect adapter rule in one entry:

```ts
import craftRules from '@craft-ts/dev-tools/eslint-rules';

export default [
  {
    files: ['**/*.ts'],
    ...craftRules.configs.effect,
  },
];
```

Use `craftRules.configs.recommended` for projects that do not use Effect.

Add it to your ESLint flat config:

```ts
import craftRules from '@craft-ts/dev-tools/eslint-rules';

export default [
  // keep your existing ESLint config entries
  {
    files: ['**/*.ts'],
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      'craft-ts/prefer-craft-template-blocks': 'error',
      'craft-ts/no-render-writes': 'error',
      'craft-ts/require-reactive-template-bindings': 'error',
      'craft-ts/no-craft-use-in-template': 'error',
      'craft-ts/no-ephemeral-template-form-state': 'error',
      'craft-ts/no-craft-computed-side-effects': 'error',
      'craft-ts/require-craft-method-for-yieldable-callback': 'error',
      'craft-ts/prefer-direct-yieldable-callback': 'error',
      'craft-ts/require-yieldable-reactive-read': 'error',
      'craft-ts/require-yieldable-template-method': 'error',
      'craft-ts/require-yieldable-insertion-write': 'error',
      'craft-ts/prefer-craft-http-transport': 'error',
      'craft-ts/no-injection-token': 'error',
      'craft-ts/require-primitive-derived-property': 'error',
      'craft-ts/no-async-await': 'error',
      'craft-ts/no-throw': 'error',
      'craft-ts/no-imperative-craft-resource-trigger': 'error',
      'craft-ts/require-craft-resource-trigger-yield': 'error',
      'craft-ts/require-assert-exhaustive-route-exceptions': 'error',
      'craft-ts/require-craft-exception-handler': 'error',
      'craft-ts/require-exception-component-di-check': 'error',
      'craft-ts/require-pending-component-di-check': 'error',
      'craft-ts/require-child-route-mount-check': 'error',
      'craft-ts/require-lazy-load-with-retry': 'error',
      'craft-ts/require-cascade-route-di-check': 'error',
      'craft-ts/global-exception-registry-match': 'error',
    },
  },
];
```

What each rule does:

- `craft-ts/prefer-craft-template-blocks`: keeps `craftComponent(...)` templates declarative by rejecting ternaries, logical expressions, and imperative control flow; use `ifBlock(...)`, `matchBlock.exhaustive(...)`, `each(...)`, or `defer(...)`
- `craft-ts/no-render-writes`: rejects detectable `set()`, `update()`, and `mutate()` calls in component templates and render bindings while allowing DOM event and `onXxx` output callbacks
- `craft-ts/require-reactive-template-bindings`: requires signals, named Craft values, and component inputs to be read inside granular binding callbacks instead of during VNode construction; static values remain valid
- `craft-ts/no-craft-use-in-template`: forbids the synchronous `craftUse(...)` escape hatch in Craft templates; pass the reactive reader directly, such as `status: usersQuery.currentPageStatus`
- `craft-ts/no-ephemeral-template-form-state`: forbids `let` / `const` / `var` in the fourth argument of `craftComponent(...)` and `craftDirective(...)` (inline or a same-file identifier). Declare that state in the logic factory with `state()` or `craftComputed()` instead
- `craft-ts/no-craft-computed-side-effects`: forbids writes and asynchronous work inside `craftComputed`; only reactive reads and `settled(...)` are allowed. The graph-wide counterpart is [`assertCraftComputedPure`](/guide/testing/architecture#assertcraftcomputedpure).
- `craft-ts/no-effect-in-params`: keeps `params` synchronous by rejecting Effect values and Effect service reads; use `computedEffect(...)` or an Effect-valued `method(...)` for asynchronous work
- `craft-ts/prefer-craft-reactivity`: rejects authored signal/computed/effect/resource APIs, explicit `.subscribe()` calls, and RxJS `Subject`/`BehaviorSubject`/`ReplaySubject`; use `state`, `craftComputed`, `craftEffect`, `query`, and named `source$`/`on$` flows
- `craft-ts/prefer-craft-service`: keeps services in the `craftService(...)` model
- `craft-ts/no-injection-token`: forbids authored `InjectionToken` contracts; declare them with `craftService({ name, providedIn: 'abstract' }, abstract<Contract>())`
- `craft-ts/prefer-craft-http-client`: forbids direct transport usage in favor of `CraftHttpClient`
- `craft-ts/prefer-craft-http-transport`: forbids direct `fetch()` and `XMLHttpRequest`; use `query()` for reads or `mutation()` for writes with `CraftHttpClient`
- `craft-ts/prefer-craft-input-output`: keeps component inputs and outputs in the `Input`/`Output` model used by `craftComponent(...)`
- `craft-ts/require-primitive-derived-property`: requires a `computed` or `craftComputed` that only depends on one primitive in the same component/service to be exposed by that primitive's insertion; simple cases are autofixed
- `craft-ts/no-async-await`: forbids `async` functions, `await`, and `for await...of`; use generator-based Craft primitives, `craftSleep`, and `CraftHttpClient` instead
- `craft-ts/no-throw`: forbids `throw` in Craft code and offers a Quick Fix that returns `craftException({ _tag: 'UNEXPECTED_ERROR' }, { error: ... })`; keep technical boundaries and tests outside this rule when their contracts require thrown errors
- `craft-ts/no-imperative-craft-resource-trigger`: forbids `query.call(...)`, `mutation.mutate(...)`, and `asyncProcess.method(...)` in a `craftEffect` dependency graph, including through `craftGen(...)`. The graph-wide counterpart, including `state` / `source$` writes, is [`assertCraftEffectNoImperativeSync`](/guide/testing/architecture#assertcrafteffectnoimperativesync).
- `craft-ts/require-craft-resource-trigger-yield`: requires those triggers to use `yield*` inside generator functions, while ordinary UI callbacks may keep imperative calls
- `craft-ts/require-craft-method-for-yieldable-callback`: requires callbacks returned by a `craftComponent` factory to wrap yieldable Craft method calls in `craftMethod(...)`
- `craft-ts/prefer-direct-yieldable-callback`: replaces a template generator that only returns `yield* callback()` with the callback reference itself
- `craft-ts/require-yieldable-reactive-read`: requires Craft reactive readers to be delegated with `yield*` inside generator functions; a function that reads a Craft reader must itself be a generator (`craftUse` remains the synchronous boundary)
- `craft-ts/require-yieldable-template-method`: requires yieldable Craft method calls in a `craftComponent` template to be delegated with `yield*`, or passed as a reference (`click: counter.increment`)
- `craft-ts/require-yieldable-insertion-write`: requires `set(...)`, `patch(...)`, and `update(...)` to be delegated with `yield*` when they are used inside a generator method
- `craft-ts/require-assert-exhaustive-route-exceptions`: adds the collection-level `assertExhaustiveRouteExceptions(...)` safety net
- `craft-ts/require-craft-exception-handler`: enforces `craftExceptionHandler(function* (...) {})`; simple handlers are autofixed and ambiguous raw redirects are reported for manual migration
- `craft-ts/require-exception-component-di-check`: generates O(1) `RouteExceptionComponentCheckedDI` checks for `renderComponent`, route-level `errorComponent`, `withErrorComponent`, `withRouteLoadError`, and route-local `provideRouteLoadErrorComponent`
- `craft-ts/require-pending-component-di-check`: generates the independent `RouteCheckedDI` check for each `pendingComponent`
- `craft-ts/require-child-route-mount-check`: adds the missing `assertChildRouteMounts(...)` call + import (Quick Fix) for any `craftRoutes(...)` collection that mounts lazy `loadChildren`, so a `.withParent`-pinned child mounted under the wrong path is a compile error
- `craft-ts/require-lazy-load-with-retry`: wraps route `loadComponent` and `loadChildren` imports with the generated `withRetry(...)` loader helper while preserving a statically analyzable import specifier
- `craft-ts/require-cascade-route-di-check`: rejects any `craftRoutes(...)` collection without a same-file `ValidateCascadeRoutesFile + CanRun` proof; its autofix adds the conservative `<never, Router>` context, which should be adjusted when the mount inherits providers
- `craft-ts/global-exception-registry-match`: keeps `CraftGlobalExceptionRegistry` synchronized with handlers delegating to `globalError()`

### Accessibility (`craft-ts/a11y`)

Spread `craftRules.configs.a11y.rules` to enable the WCAG 2.2 AA preset as
`error`. The rules walk **all** hyperscript in the file (`craftTemplate`,
extracted factories, `h('tag')`), not only `craftComponent` argument 3.

- `prefer-named-html-helpers`: forbids `h('img')` / `h('button')` when a named helper exists
- `require-interactive-local-name`: requires a string-literal first argument on interactive helpers; the local name is the third segment of `data-craft-name="${component}:${tag}:${localName}"`
- `img-has-alt`, `iframe-has-title`, `button-has-type`, `anchor-has-href`
- `control-has-accessible-name`, `label-has-associated-control`, `heading-has-content`
- `no-noninteractive-element-interactions`, `no-positive-tabindex`
- `valid-aria`, `role-has-required-aria`, `target-blank-noopener`
- `prefer-relative-heading`, `require-route-heading-outline`,
  `require-outlet-heading-section`, `no-heading-level-skip`
- `require-focus-visible`, `require-reduced-motion` (CSS of `craftComponent`)

See [Accessibility](/guide/components/accessibility).

The two migration rules also expose a VS Code ESLint Quick Fix suggestion that inserts a temporary local disable comment with the intended migration note when you need to unblock a file before doing the full refactor.

The template and reactivity rules are intentionally diagnostic-only: replacing a
resource or subscription can change lifecycle and error semantics, so the rule
points at the Craft primitive without applying a potentially unsafe rewrite.

### Why templates use blocks

Craft template blocks preserve the branch structure in the type-level render
contract. A ternary or `condition && node` produces only a computed value, so
the type checker cannot assert which branch renders which content. Keep derived
values and business decisions in the component's state/query layer, then make
the template express visibility explicitly:

```ts
ifBlock(
  isReady,
  () => p('Ready'),
  () => p('Loading…'),
);

matchBlock.exhaustive(query.exceptions, '_tag', {
  NOT_FOUND: () => p('Not found'),
  FORBIDDEN: () => p('Forbidden'),
});
```

This rule is for Craft's TypeScript templates. It does not rewrite external
template languages.

### Reactive values belong in binding callbacks

`require-reactive-template-bindings` uses TypeScript type information to find
reactive reads. Reading a signal while constructing a VNode would make it a
dependency of the structural component render, so the rule rejects this form:

```ts
// Incorrect: count is read by the component template.
p(`Count: ${count()}`);
button({ disabled: isDisabled() }, 'Save');
div({ class: { active: isActive() } });
```

Keep each read inside the callback owned by its DOM binding. Pass a yieldable
reader, or use a generator when the binding must format:

```ts
p(count);
p(function* () {
  return `Count: ${yield* count()}`;
});
button({ disabled: isDisabled }, 'Save');
div({ class: isActiveClass });
```

Literal and otherwise static values are still allowed, as are reads performed
from DOM events and `onXxx` output callbacks. Because the rule is type-aware,
the ESLint parser must use `projectService: true` or a TypeScript `project`.

### Yield insertion writes from generator methods

`require-yieldable-insertion-write` requires `set(...)`, `patch(...)`, and
`update(...)` calls to be delegated with `yield*` when they are used inside a
generator method:

```ts
nextPage: function* () {
  const current = yield* state();
  return yield* patch({ page: current.page + 1 });
},
```

Insertion callbacks that are not generators may return a write directly; the
insertion wrapper consumes that result for them.

## What generates what

Three rules do more than complain — they write code you would otherwise
maintain by hand:

| Rule                                         | Generates                                                  |
| -------------------------------------------- | ---------------------------------------------------------- |
| `require-cascade-route-di-check`             | the same-file DI proof for a `craftRoutes(...)` collection |
| `require-assert-exhaustive-route-exceptions` | the collection-level exhaustiveness assert                 |
| `require-child-route-mount-check`            | the `assertChildRouteMounts(...)` call and its import      |
| `require-lazy-load-with-retry`               | the `withRetry(...)` wrapper on lazy route imports         |
| `prefer-direct-yieldable-callback`           | removes redundant template generators                      |

## Adopting them progressively

On an existing codebase, enable them in waves rather than all at once:

1. **The route safety nets** — the `require-*` rules. Mostly autofixable. They
   generate the proofs; [architecture tests](/guide/testing/architecture#assertroutediproofs)
   (`assertRouteDiProofs`) fail CI if a proof is later removed or left unarmed.
2. **The architecture rules last** — `prefer-craft-service`,
   `prefer-craft-http-client`, `require-yieldable-reactive-read`,
   `require-yieldable-template-method`, `require-yieldable-insertion-write`.
   These ask for real refactors.

The two migration rules also expose a VS Code quick fix that inserts a temporary
local disable comment with the intended migration note, so you can unblock a
file before doing the full refactor.

## See Also

- [Routing setup](/guide/routing/setup) — where these rules are installed
- [CLI automation](/guide/routing/automation) — the codemods they complement
- [Architecture rules](/guide/testing/architecture) — graph-wide constraints ESLint cannot see
