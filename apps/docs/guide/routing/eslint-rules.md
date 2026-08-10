# ESLint rules

The rule set is not decoration: several checks in this documentation only work
because a rule generated or maintained the code they read. Others enforce the
architecture — no raw `inject`, no Angular `HttpClient` — and most of them
**autofix**.

**Install them once** when you set up routing and type-safe DI.
**Then lean on the quick fixes** rather than writing the boilerplate by hand.

::: warning An ESLint error is not a compile error
A missing autofix does not break the build. If you skip the quick fix after
changing a component's DI shape, `main.ts` keeps reading a stale `GenDeps_*` and
can miss a real DI error. Run `eslint --fix` in CI.
:::

The plugin is exposed from `@craft-ng/dev-tools/eslint-rules`.

Add it to your ESLint flat config:

```ts
import craftRules from '@craft-ng/dev-tools/eslint-rules';

export default [
  // keep your existing ESLint config entries
  {
    files: ['**/*.ts'],
    plugins: {
      'craft-ng': craftRules,
    },
    rules: {
      'craft-ng/brand-angular-gen-deps-required': 'error',
      'craft-ng/brand-angular-deps-match': 'error',
      'craft-ng/component-test-gen-deps-match': 'error',
      'craft-ng/no-angular-inject': 'error',
      'craft-ng/prefer-craft-template-blocks': 'error',
      'craft-ng/no-render-writes': 'error',
      'craft-ng/require-reactive-template-bindings': 'error',
      'craft-ng/prefer-craft-reactivity': 'error',
      'craft-ng/prefer-craft-service': 'error',
      'craft-ng/prefer-craft-http-client': 'error',
      'craft-ng/prefer-craft-http-transport': 'error',
      'craft-ng/prefer-craft-input-output': 'error',
      'craft-ng/require-primitive-derived-property': 'error',
      'craft-ng/no-async-await': 'error',
      'craft-ng/no-throw': 'error',
      'craft-ng/no-imperative-craft-resource-trigger': 'error',
      'craft-ng/require-craft-resource-trigger-yield': 'error',
      'craft-ng/require-assert-exhaustive-route-exceptions': 'error',
      'craft-ng/require-craft-exception-handler': 'error',
      'craft-ng/require-exception-component-di-check': 'error',
      'craft-ng/require-pending-component-di-check': 'error',
      'craft-ng/require-child-route-mount-check': 'error',
      'craft-ng/require-lazy-load-with-retry': 'error',
      'craft-ng/require-cascade-route-di-check': 'error',
      'craft-ng/global-exception-registry-match': 'error',
    },
  },
];
```

What each rule does:

- `craft-ng/brand-angular-gen-deps-required`: generates a missing `GenDeps_*` alias for Angular components, directives, and pipes through the ESLint Quick Fix
- `craft-ng/brand-angular-deps-match`: keeps existing `GenDeps_*` aliases in sync through the same ESLint Quick Fix flow
- `craft-ng/component-test-gen-deps-match`: checks `setupCraftComponentTestingByRegister(Component, {} as GenDeps_Component, ...)` pairs in tests
- `craft-ng/no-angular-inject`: forbids raw Angular `inject()` usage so dependencies go through `craftService(...)` or `toCraftService(...)`
- `craft-ng/prefer-craft-template-blocks`: keeps `craftComponent(...)` templates declarative by rejecting ternaries, logical expressions, and imperative control flow; use `ifBlock(...)`, `matchBlock.exhaustive(...)`, `each(...)`, or `defer(...)`
- `craft-ng/no-render-writes`: rejects detectable `set()`, `update()`, and `mutate()` calls in component templates and render bindings while allowing DOM event and `onXxx` output callbacks
- `craft-ng/require-reactive-template-bindings`: requires Angular Signals, named Craft values, and component inputs to be read inside granular binding callbacks instead of during VNode construction; static values remain valid
- `craft-ng/prefer-craft-reactivity`: rejects authored Angular signal/computed/effect/resource APIs, explicit `.subscribe()` calls, and RxJS `Subject`/`BehaviorSubject`/`ReplaySubject`; use `state`, `craftComputed`, `craftEffect`, `query`, and named `source$`/`on$` flows
- `craft-ng/prefer-craft-service`: forbids authored Angular `@Injectable()` / `@Service()` services in favor of `craftService(...)` and `toCraftService(...)`
- `craft-ng/prefer-craft-http-client`: forbids Angular `HttpClient` usage in favor of `CraftHttpClient`
- `craft-ng/prefer-craft-http-transport`: forbids direct `fetch()` and `XMLHttpRequest`; use `query()` for reads or `mutation()` for writes with `CraftHttpClient`
- `craft-ng/prefer-craft-input-output`: forbids Angular `input()`/`output()` and `@Input`/`@Output`; use `Input`/`Output` from `@craft-ng/component` in `craftComponent(...)`
- `craft-ng/require-primitive-derived-property`: requires a `computed` or `craftComputed` that only depends on one primitive in the same component/service to be exposed by that primitive's insertion; simple cases are autofixed
- `craft-ng/no-async-await`: forbids `async` functions, `await`, and `for await...of`; use generator-based Craft primitives, `craftSleep`, and `CraftHttpClient` instead
- `craft-ng/no-throw`: forbids `throw` in Craft code and offers a Quick Fix that returns `craftException({ code: 'UNEXPECTED_ERROR' }, { error: ... })`; keep technical boundaries and tests outside this rule when their contracts require thrown errors
- `craft-ng/no-imperative-craft-resource-trigger`: forbids `query.call(...)`, `mutation.mutate(...)`, and `asyncProcess.method(...)` in a `craftEffect` dependency graph, including through `craftGen(...)`
- `craft-ng/require-craft-resource-trigger-yield`: requires those triggers to use `yield*` inside generator functions, while ordinary UI callbacks may keep imperative calls
- `craft-ng/require-assert-exhaustive-route-exceptions`: adds the collection-level `assertExhaustiveRouteExceptions(...)` safety net
- `craft-ng/require-craft-exception-handler`: enforces `craftExceptionHandler(function* (...) {})`; simple handlers are autofixed and ambiguous raw redirects are reported for manual migration
- `craft-ng/require-exception-component-di-check`: generates O(1) `RouteExceptionComponentCheckedDI` checks for `renderComponent`, route-level `errorComponent`, `withErrorComponent`, `withRouteLoadError`, and route-local `provideRouteLoadErrorComponent`
- `craft-ng/require-pending-component-di-check`: generates the independent `RouteCheckedDI` check for each `pendingComponent`
- `craft-ng/require-child-route-mount-check`: adds the missing `assertChildRouteMounts(...)` call + import (Quick Fix) for any `craftRoutes(...)` collection that mounts lazy `loadChildren`, so a `.withParent`-pinned child mounted under the wrong path is a compile error
- `craft-ng/require-lazy-load-with-retry`: wraps route `loadComponent` and `loadChildren` imports with the generated `withRetry(...)` loader helper while preserving a statically analyzable import specifier
- `craft-ng/require-cascade-route-di-check`: rejects any `craftRoutes(...)` collection without a same-file `ValidateCascadeRoutesFile + CanRun` proof; its autofix adds the conservative `<never, Router>` context, which should be adjusted when the mount inherits providers
- `craft-ng/global-exception-registry-match`: keeps `CraftGlobalExceptionRegistry` synchronized with handlers delegating to `globalError()`

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

matchBlock.exhaustive(query.exceptions, 'code', {
  NOT_FOUND: () => p('Not found'),
  FORBIDDEN: () => p('Forbidden'),
});
```

This rule is for Craft's TypeScript templates. Angular HTML templates are not
rewritten by it.

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

Keep each read inside the callback owned by its DOM binding:

```ts
p(() => `Count: ${count()}`);
button({ disabled: () => isDisabled() }, 'Save');
div({ class: () => ({ active: isActive() }) });
```

Literal and otherwise static values are still allowed, as are reads performed
from DOM events and `onXxx` output callbacks. Because the rule is type-aware,
the ESLint parser must use `projectService: true` or a TypeScript `project`.

If your project is adopting this progressively, enable both `craft-ng/brand-angular-gen-deps-required` and `craft-ng/brand-angular-deps-match` so the same Quick Fix can generate missing aliases and refresh existing ones. `craft-ng/no-angular-inject` is an architecture-enforcement rule and may require a broader migration.

## What generates what

Three rules do more than complain — they write code you would otherwise
maintain by hand:

| Rule                                         | Generates                                                  |
| -------------------------------------------- | ---------------------------------------------------------- |
| `brand-angular-gen-deps-required`            | the missing `GenDeps_*` alias for an Angular component     |
| `brand-angular-deps-match`                   | keeps an existing `GenDeps_*` in sync                      |
| `require-cascade-route-di-check`             | the same-file DI proof for a `craftRoutes(...)` collection |
| `require-assert-exhaustive-route-exceptions` | the collection-level exhaustiveness assert                 |
| `require-child-route-mount-check`            | the `assertChildRouteMounts(...)` call and its import      |
| `require-lazy-load-with-retry`               | the `withRetry(...)` wrapper on lazy route imports         |

## Adopting them progressively

On an existing codebase, enable them in waves rather than all at once:

1. **The generators first** — `brand-angular-gen-deps-required` and
   `brand-angular-deps-match`. They only add code.
2. **The route safety nets** — the `require-*` rules. Mostly autofixable.
3. **The architecture rules last** — `no-angular-inject`, `prefer-craft-service`,
   `prefer-craft-http-client`. These ask for real refactors.

The two migration rules also expose a VS Code quick fix that inserts a temporary
local disable comment with the intended migration note, so you can unblock a
file before doing the full refactor.

## See Also

- [Routing setup](/guide/routing/setup) — where these rules are installed
- [CLI automation](/guide/routing/automation) — the codemods they complement
- [Angular brand config](/guide/routing/angular-brand-config)
