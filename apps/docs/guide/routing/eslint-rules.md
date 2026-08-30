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
      'craft-ts/no-craft-use': 'error',
      'craft-ts/no-type-assertions-in-template': 'error',
      'craft-ts/no-ephemeral-template-form-state': 'error',
      'craft-ts/template-element-name-unique': 'error',
      'craft-ts/no-craft-computed-side-effects': 'error',
      'craft-ts/require-craft-method-for-yieldable-callback': 'error',
      'craft-ts/prefer-direct-yieldable-callback': 'error',
      'craft-ts/require-yieldable-reactive-read': 'error',
      'craft-ts/require-yieldable-template-method': 'error',
      'craft-ts/require-yieldable-insertion-write': 'error',
      'craft-ts/no-craft-service-component-same-file': 'error',
      'craft-ts/max-craft-declarations-per-file': 'error',
      'craft-ts/prefer-craft-http-transport': 'error',
      'craft-ts/no-injection-token': 'error',
      'craft-ts/require-primitive-derived-property': 'error',
      'craft-ts/no-async-await': 'error',
      'craft-ts/no-throw': 'error',
      'craft-ts/no-imperative-craft-resource-trigger': 'error',
      'craft-ts/no-imperative-craft-method-actions': 'error',
      'craft-ts/no-remote-work-in-craft-method': 'error',
      'craft-ts/no-type-assertions-in-resource-loader': 'error',
      'craft-ts/no-imperative-template-action-chain': 'error',
      'craft-ts/prefer-route-query-params-for-filter-state': 'error',
      'craft-ts/no-imperative-storage-in-craft-method': 'error',
      'craft-ts/no-transition-actions': 'error',
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

- `craft-ts/prefer-craft-template-blocks`: keeps `craftComponent(...)` templates declarative by rejecting ternaries, logical expressions, negations, and imperative control flow; use `ifNode(...)`, `matchNode.exhaustive(...)`, `forNode(...)`, or `deferNode(...)`
- `craft-ts/no-render-writes`: rejects detectable `set()`, `update()`, and `mutate()` calls in component templates and render bindings while allowing DOM event and `onXxx` output callbacks
- `craft-ts/require-reactive-template-bindings`: requires signals, named Craft values, and component inputs to be read inside granular binding callbacks instead of during VNode construction; static values remain valid
- `craft-ts/no-craft-use`: forbids the synchronous `craftUse(...)` escape hatch in Craft TypeScript files; use a generator and delegate the reader with `yield*` instead
- `craft-ts/no-type-assertions-in-template`: forbids `as ...` and angle-bracket type assertions in Craft templates; fix the type in the logic factory or expose a correctly typed derived value
- `craft-ts/no-ephemeral-template-form-state`: forbids `let` / `const` / `var` in the fourth argument of `craftComponent(...)` and `craftDirective(...)` (inline or a same-file identifier). Declare that state in the logic factory with `state()` or `craftComputed()` instead
- `craft-ts/template-element-name-unique`: requires named HTML helpers to use a static, unique local name within a component; use the object-first helper form for unnamed elements such as `p({ id: 'hint' }, ...)`
- `craft-ts/no-craft-computed-side-effects`: forbids writes and asynchronous work inside `craftComputed`; only reactive reads and `settled(...)` are allowed. The graph-wide counterpart is [`assertCraftComputedPure`](/guide/testing/architecture#assertcraftcomputedpure).
- `craft-ts/no-effect-outside-loaders`: keeps `params`, methods, `craftComputed(...)`, and `craftEffect(...)` synchronous by allowing Effect values and Effect service reads only in Effect loaders; `no-effect-in-params` remains as a compatibility alias
- `craft-ts/sync-effect-body`: keeps a body declared synchronous (`SyncOp` in its requirements) free of anything that may suspend — async constructors such as `Effect.sleep`/`Effect.promise`, and members nothing declares synchronous. Type-aware: the ESLint parser must use `projectService: true` or a TypeScript `project`
- `craft-ts/no-explicit-effect-type`: lets `Effect.gen` infer its complete type instead of repeating an explicit Effect annotation; contracts declared in interfaces and type aliases remain allowed
- `craft-ts/prefer-inline-effect-insertion`: keeps the `queryEffect` insertion factory inline so its resource and exception types are inferred without a separate `InsertionParams` context alias
- `craft-ts/prefer-inline-route-providers`: inlines a route provider tuple used only once by `loadCraftComponent(...)`, preserving the route-level type proof
- `craft-ts/prefer-craft-reactivity`: rejects authored signal/computed/effect/resource APIs, explicit `.subscribe()` calls, and RxJS `Subject`/`BehaviorSubject`/`ReplaySubject`; use `state`, `craftComputed`, `craftEffect`, `query`, and named `source$`/`on$` flows
- `craft-ts/prefer-craft-service`: keeps services in the `craftService(...)` model
- `craft-ts/no-craft-service-component-same-file`: forbids declaring `craftService(...)` and `craftComponent(...)` in the same file; a route-level service provider combined with a lazy-loaded component can break lazy loading, so keep them in separate files
- `craft-ts/max-craft-declarations-per-file`: reports the third and subsequent `craftComponent(...)`, `craftService(...)`, or `craftDirective(...)` declaration of the same kind in a file; keep Craft entities split across focused files
- `craft-ts/no-injection-token`: forbids authored `InjectionToken` contracts; declare them with `craftService({ name, providedIn: 'abstract' }, abstract<Contract>())`
- `craft-ts/prefer-craft-http-client`: forbids direct transport usage in favor of `CraftHttpClient`
- `craft-ts/prefer-craft-http-transport`: forbids direct `fetch()` and `XMLHttpRequest`; use `query()` for reads or `mutation()` for writes with `CraftHttpClient`
- `craft-ts/prefer-craft-input-output`: keeps component inputs and outputs in the `Input`/`Output` model used by `craftComponent(...)`
- `craft-ts/require-primitive-derived-property`: requires a `computed` or `craftComputed` that only depends on one primitive in the same component/service to be exposed by that primitive's insertion; simple cases are autofixed
- `craft-ts/no-async-await`: forbids `async` functions, `await`, and `for await...of`; use generator-based Craft primitives, `craftSleep`, and `CraftHttpClient` instead
- `craft-ts/no-throw`: forbids `throw` in Craft code and offers a Quick Fix that returns `craftException({ _tag: 'UNEXPECTED_ERROR' }, { error: ... })`; keep technical boundaries and tests outside this rule when their contracts require thrown errors
- `craft-ts/no-imperative-craft-resource-trigger`: forbids `query.call(...)`, `mutation.mutate(...)`, and `asyncProcess.method(...)` in a `craftEffect` dependency graph, including through `craftGen(...)`. The graph-wide counterpart, including `state` / `source$` writes, is [`assertCraftEffectNoImperativeSync`](/guide/testing/architecture#assertcrafteffectnoimperativesync).
- `craft-ts/no-imperative-craft-method-actions`: forbids composing multiple imperative actions in a `craftMethod`; emit a `source$` event and let the affected query react with `insertReactOnMutation(...)` instead. A handler such as `event.preventDefault()` followed by one `mutation.mutate(...)` remains valid.
- `craft-ts/no-remote-work-in-craft-method`: forbids `CraftHttpClient.*(...)` inside `craftMethod`; define the request directly in the `query` or `mutation` loader so the resource owns its remote lifecycle.
- `craft-ts/no-type-assertions-in-resource-loader`: forbids `as ...` and angle-bracket assertions inside `query`, `mutation`, and `asyncProcess` loaders; repair the request or adapter typing instead of forcing a `PromiseLike<...>` contract.
- `craft-ts/no-imperative-template-action-chain`: forbids chaining multiple Craft actions in one template event callback; emit one `source$` event and let the query, mutation, and state react through `on$`.
- `craft-ts/prefer-route-query-params-for-filter-state`: flags local `state()` declarations whose name is `filter`/`filters`; declare route-visible filters with route-level `queryParams` and feed the query reactively.
- `craft-ts/no-imperative-storage-in-craft-method`: forbids direct storage access and imperative location changes in a `craftMethod`; use `insertReactOnMutation(...)` with `optimisticUpdate: () => undefined` to clear the affected query and let its persistence follow the query state.
- `craft-ts/no-transition-actions`: forbids `query.call(...)`, `mutation.mutate(...)`, and `asyncProcess.method(...)` inside `transitionStep(...)`; validate the event and emit a source, then let the resource react to that source.
- `craft-ts/require-craft-resource-trigger-yield`: requires those triggers to use `yield*` inside generator functions, while ordinary UI callbacks may keep imperative calls
- `craft-ts/require-craft-method-for-yieldable-callback`: requires callbacks returned by a `craftComponent` factory to wrap yieldable Craft method calls in `craftMethod(...)`
- `craft-ts/prefer-direct-yieldable-callback`: replaces a template generator or generator method that only delegates `yield* callback()` with the callback reference itself (`callback` or `object.method`)
- `craft-ts/require-yieldable-reactive-read`: requires Craft reactive readers to be delegated with `yield*` inside generator functions; a function that reads a Craft reader must itself be a generator
- `craft-ts/require-yieldable-template-method`: requires yieldable Craft method calls in a `craftComponent` template to be delegated with `yield*`, or passed as a reference (`click: counter.increment`)
- `craft-ts/require-yieldable-insertion-write`: requires `set(...)`, `patch(...)`, and `update(...)` to be delegated with `yield*` when they are used inside a generator method
- `craft-ts/require-assert-exhaustive-route-exceptions`: adds the collection-level `assertExhaustiveRouteExceptions(...)` safety net
- `craft-ts/require-craft-exception-handler`: enforces `craftExceptionHandler(function* (...) {})`; simple handlers are autofixed and ambiguous raw redirects are reported for manual migration
- `craft-ts/require-exception-component-di-check`: generates O(1) `RouteExceptionComponentCheckedDI` checks for `renderComponent`, route-level `errorComponent`, `withErrorComponent`, `withRouteLoadError`, and route-local `provideRouteLoadErrorComponent`
- `craft-ts/require-pending-component-di-check`: generates the independent `RouteCheckedDI` check for each `pendingComponent`
- `craft-ts/no-raw-class`: forbids a `class:` binding that is a string, a template literal or a function, in any file that imports `@craft-ts/style`. A class assembled at render time is a visual state nothing recorded, so the [visual matrix](/guide/style/testing) would enumerate what the sheets declare while the DOM shows something else. Move the rule into the sheet and bind the class it returns; make the variation an axis and set a `data-*` attribute
- `craft-ts/no-raw-css-value`: forbids a string or number literal as an argument to a `@craft-ts/style` helper — `p('12px')`, `bg('red')`. If the scale is missing the step, add it to the scale; if the value genuinely cannot be proven, `unsafeLength('13px', reason)` compiles and makes the debt countable in the [graph](/guide/style/testing#what-the-graph-adds)
- `craft-ts/no-free-has`: forbids a hand-written `:has()` in styles. It reaches across the component boundary, so what a component looks like depends on markup it does not own — a state the matrix cannot enumerate. Use the `descendant` axis, which is a closed set and carries its own test driver
- `craft-ts/style-file-boundary`: restricts a `*.style.ts` to style-vocabulary imports. The [build plugin](/guide/style/setup) imports the file in Node to read what it registered, so an application import would run application code at build time
- `craft-ts/craft-css-token-registry`: reports a custom property registered with `@property` by two different components. A custom property may have only one owner; two silently fight over its syntax and initial value
- `craft-ts/require-effect-adapters`: requires the Effect-aware adapters — `queryEffect`, `mutationEffect`, `asyncProcessEffect` — instead of the plain primitives in an Effect application. See [Choose the right adapter](/guide/advanced/effect#choose-the-right-adapter)
- `craft-ts/craft-signal-source-name-match`: requires `signalSource(name, ...)` to take a string literal matching the variable, class property or object property it is assigned to, so the name in a trace is the name in the source. A computed name defeats the [architecture graph](/guide/testing/architecture), which reads these names statically
- `craft-ts/require-child-route-mount-check`: adds the missing `assertChildRouteMounts(...)` call + import (Quick Fix) for any `craftRoutes(...)` collection that mounts lazy `loadChildren`, so a `.withParent`-pinned child mounted under the wrong path is a compile error
- `craft-ts/require-lazy-load-with-retry`: wraps route `loadComponent` and `loadChildren` imports with the generated `withRetry(...)` loader helper while preserving a statically analyzable import specifier
- `craft-ts/require-cascade-route-di-check`: rejects any `craftRoutes(...)` collection without a same-file `ValidateCascadeRoutesFile + CanRun` proof; its autofix adds the conservative `<never, Router>` context, which should be adjusted when the mount inherits providers
- `craft-ts/global-exception-registry-match`: keeps `CraftGlobalExceptionRegistry` synchronized with handlers delegating to `globalError()`
- `craft-ts/prefer-craft-router-link`: requires `CraftRouterLink` for internal `a(..., { href: ... })` navigation; external URLs, fragment links, downloads, `_blank`, and links marked with `data-navigation: 'external'` remain native

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
ifNode(
  isReady,
  () => p('Ready'),
  () => p('Loading…'),
);

matchNode.exhaustive(query.exceptions, '_tag', {
  NOT_FOUND: () => p('Not found'),
  FORBIDDEN: () => p('Forbidden'),
});
```

This rule is for Craft's TypeScript templates. It does not rewrite external
template languages.

The same restriction applies to boolean expressions. A negation is still
application logic, even when it is used only for a DOM property:

```ts
// Incorrect: the template derives the disabled state.
button(
  {
    disabled: function* () {
      return !(yield* machine.canGoBack());
    },
  },
  'Back',
);

// Correct: derive it in the logic factory and bind the result.
const backDisabled = craftComputed('backDisabled', function* () {
  return !(yield* history.canGoBack());
});
return { backDisabled };
```

Keep the template to layout and binding. Move labels, formatted values,
validation state, and other decisions into `state()` or `craftComputed()`.

### Derived values belong to their primitive

When a computed reads only one local primitive, declare it in that primitive's
insertion. This keeps the dependency visible and lets pending/exception
boundaries name the actual source:

```ts
const users =
  yield *
  query('users', config, ({ resource }) => ({
    total: craftComputed('total', function* () {
      return (yield* settled(resource)).length;
    }),
  }));
```

Do not create `craftComputed('total', ...)` beside the query when the
computation depends only on `users`.

### Keep casts and synchronous reads out of templates

Craft templates reject both `as ...` / angle-bracket assertions and
`craftUse(...)`. Fix the type or perform the synchronous-to-reactive
conversion in the component logic, then expose a typed reader or generator to
the template:

```ts
const typedStep = machine.stepState as unknown as () => { step: Step };
return { typedStep };

// Template: no cast and no craftUse.
matchNode.exhaustive(typedStep, 'step', steps);
```

`no-craft-use` applies to Craft TypeScript files, not only the fourth
`craftComponent(...)` argument. A synchronous integration boundary may opt out
locally when its external API cannot consume a generator, but application
state and templates should use `yield*`.

### Form and accessibility diagnostics

The accessibility preset also checks the static structure of hyperscript:

- give every `label` an `htmlFor` matching the control `id`, or wrap the control;
- give named controls and helpers a unique string local name;
- use `button` or `a` for interactions instead of adding `click` to a `div`;
- add a `prefers-reduced-motion` branch whenever component CSS defines an
  animation or transition.

These checks run on Craft TypeScript templates and extracted helper factories,
so moving markup into a local function does not bypass them.

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

### Pass simple yieldable callbacks directly

`prefer-direct-yieldable-callback` removes a generator wrapper when the
template only delegates one zero-argument callback. It handles both a value
binding and a generator method:

```ts
// Before: redundant wrappers around the callbacks.
button(
  {
    *click() {
      yield* press();
    },
  },
  function* () {
    return yield* label();
  },
);

// After `eslint --fix`.
button({ click: press }, label);
```

Member callbacks are supported as well when the access is static and has no
arguments:

```ts
// Before.
span(function* () {
  return yield* counter.increment();
});

// After.
span(counter.increment);
```

The rule leaves callbacks with parameters, extra statements, or additional
computation unchanged. In those cases the generator contains behavior that
cannot be represented by passing the callback reference alone.

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

| Rule                                         | Generates                                                     |
| -------------------------------------------- | ------------------------------------------------------------- |
| `require-cascade-route-di-check`             | the same-file DI proof for a `craftRoutes(...)` collection    |
| `require-assert-exhaustive-route-exceptions` | the collection-level exhaustiveness assert                    |
| `require-child-route-mount-check`            | the `assertChildRouteMounts(...)` call and its import         |
| `require-lazy-load-with-retry`               | the `withRetry(...)` wrapper on lazy route imports            |
| `prefer-direct-yieldable-callback`           | replaces redundant generators with direct callback references |

## Adopting them progressively

On an existing codebase, enable them in waves rather than all at once:

1. **The route safety nets** — the `require-*` rules. Mostly autofixable. They
   generate the proofs; [architecture tests](/guide/testing/architecture#assertroutediproofs)
   (`assertRouteDiProofs`) fail CI if a proof is later removed or left unarmed.
2. **The architecture rules last** — `prefer-craft-service`,
   `no-craft-service-component-same-file`, `prefer-craft-http-client`,
   `require-yieldable-reactive-read`,
   `require-yieldable-template-method`, `require-yieldable-insertion-write`.
   These ask for real refactors.

The four style rules — `no-raw-class`, `no-raw-css-value`, `no-free-has`,
`style-file-boundary` — are in `craftRules.configs.recommended` at `'error'`,
and they are **gated on the import**: they fire only in files that import
`@craft-ts/style`. A component you have not migrated is not claiming the
guarantee, so nothing reports it. The day a file starts using the design system
is the day it starts being held to it — which is why enabling them on an
unmigrated codebase costs nothing.

The two migration rules also expose a VS Code quick fix that inserts a temporary
local disable comment with the intended migration note, so you can unblock a
file before doing the full refactor.

## See Also

- [Routing setup](/guide/routing/setup) — where these rules are installed
- [CLI automation](/guide/routing/automation) — the codemods they complement
- [Architecture rules](/guide/testing/architecture) — graph-wide constraints ESLint cannot see
- [Activating the style system](/guide/style/setup) — what the four style rules are guarding
