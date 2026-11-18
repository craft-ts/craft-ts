# Optional CraftTS compiler

The compiler is a build-time acceleration. CraftTS and existing applications
continue to work without installing or configuring it.

```sh
npm install --save-dev @craft-ts/compiler
```

```ts
import { defineConfig } from 'vite';
import { craftCompiler } from '@craft-ts/compiler/vite';

export default defineConfig({
  plugins: [
    craftCompiler({
      onReport(filename, components) {
        console.log(filename, components);
      },
    }),
  ],
});
```

The plugin transforms `.ts`, `.mts` and `.cts` before TypeScript stripping during client builds. It does not
run during `vite serve`, tests, or SSR builds. No compiler or TypeScript parser
is imported by the browser. Use matching versions of compiler and component.

The first version recognizes direct `craftComponent(name, {}, template)`
templates with one native element root, a fixed tree of supported HTML helpers,
static arrays and text, scalar attributes, classes, and independent inline
callbacks or input readers. It generates a shared DOM creation factory and
binding layout. Proven single-component list callbacks also avoid their
intermediate reactive effect and range comments. This list pass can be disabled
with `craftCompiler({ lists: false })`. It preserves the original template for fallback and leaves all
public types and generator callbacks intact.

Closed `attrs: { ... }` records can also compile. Their keys must be explicit
and use the existing `id`, `title`, `role`, `type`, `data-*` or `aria-*`
support. Unknown records, getters, spreads, computed keys, collisions and
reserved `data-craft-*` names retain the generic renderer. `h('div', props,
children)` and import aliases compile when the quoted tag belongs to the same
supported HTML set; dynamic tags and ambiguous overloads remain generic.
Helper calls with `null` properties also retain their actual generic behavior
instead of assuming that `null` means an empty props object.

In lean plans, reactive values read while constructing the template are
tracked separately from deferred binding callbacks. A change to such a value
rebinds the existing tree and patches its generic children; an ordinary
binding update keeps its own effect. Opaque reader factories are evaluated in
that source phase, and an effect with no reactive reads is released after
its first run. Eager expressions keep their source order across attributes,
event listeners and generic children. These plans use internal ABI version 2;
an older component runtime ignores them and renders the original template.
When object or callback inputs require an owned component, a source-watched
plan also keeps the generic template so its eager reads retain their effect.
The [attrs/h campaign](../../docs/benchmarks/2026-11-18-attrs-properties.md)
records the contracts, measurements and rejected intermediate prototypes.

Unknown structure, providers, composition, setup statements, events, styles,
controls with special mounting behavior, arbitrary helper calls, namespaces,
spread/computed properties, and receiver-dependent code use the generic renderer.
A compiled child can coexist with generic parents, lists and siblings.

At runtime, compiled rendering is used only in production browser creation,
without call-site host properties or active diagnostic hooks. Development,
SSR, hydration, pending/catch/field boundaries, factory wrappers/observers,
reactive-read observers and template tracing keep the generic path. Replacing a
template invalidates its plan. Component injectors, input shells, CSS scopes,
DOM replay addresses and cleanup ownership are preserved. Existing replay
archives have not been certified against this compiler.

Known initial-mount limitation: both compiled modes evaluate initial bindings
before attaching their tree. A callback that queries the connected DOM can
therefore observe a different initial value than the generic renderer, even
when its syntax compiles. Keep views that depend on this observation on the
generic renderer. The [reproduced counterexamples](../../docs/benchmarks/2026-11-17-multiple-roots.md)
cover both the current single-root compiler and the unmerged multiple-root experiment.

`craftCompiler({ dom: 'clone' })` opts into native blueprint cloning. Blueprints
contain static DOM only and are cached weakly per adapter; readers and DOM node
references remain per instance. It is not the default because cloning is not
consistently faster than direct creation. Adapters without `cloneNode` use the
ordinary creation factory.

## Imported list components: `imports: true`

`craftCompiler({ lean: true, imports: true })` also specializes a list callback
that only forwards its arguments to a directly imported component:

```ts
// row.ts
import { craftComponent, div, type Input } from '@craft-ts/component';
type RowData = { id: number; label: string };
export const Row = craftComponent(
  'Row',
  {},
  (inputs: { row: Input<RowData> }) =>
    div(function* () {
      return (yield* inputs.row()).label;
    }),
);

// app.ts
import { forNode } from '@craft-ts/component';
import { Row } from './row';
const rows = [{ id: 1, label: 'First row' }];
const list = forNode(rows, { track: (row) => row.id }, (row) => Row({ row }));
```

This option is off by default. The Vite plugin uses its resolver and loaded
module sources to prove the exported constant and an acyclic application import
graph. Import aliases are allowed. Mutable exports, barrels, default/namespace
exports, dynamic imports, `require`, import attributes and unresolved or external
dependencies retain the ordinary path. Whole `import type` declarations are
ignored; inline type specifiers and empty imports remain conservative graph
edges because they can preserve side effects with `verbatimModuleSyntax`.

The graph is cleared for each build and its dependencies are watched. A rebuild
that changes an export from `const` to `let` removes the specialization.
Development and SSR remain untouched. `lists: false` disables list
specialization, including imported factories. Without `lean`, the ordinary
compiled component owners remain; with `lean`, the existing light-instance
trade-offs below also apply to these lists.

## Light instances: `lean: true` (opt-in trade-offs)

`craftCompiler({ lean: true })` gives up a few runtime features of compiled
components in exchange for much cheaper instances. Development, SSR,
hydration, boundaries and diagnostic hooks still take the generic path, as
above. What changes for a compiled component in a production browser build:

- **No injector of its own.** Its bindings, events and children render in the
  parent's injector: `inject(Injector)`, `ElementRef` or `DestroyRef` read
  from a binding see the parent's. Its metadata is `{}`, so it never had
  providers of its own.
- **No registry entry and no replay record.** It does not appear among the
  registered targets (devtools, AI registry), its binding effects are not in
  app snapshots, and a session capture addresses its elements through the
  nearest recorded ancestor and the DOM path, which is less stable when a
  list is reordered.
- **Inputs as given.** No input proxy or cells: when a parent passes other
  input values, the same nodes are bound again, so every binding of that
  instance runs again, not only those reading the changed input.
- **Light list entries.** A proven single-component list item is the
  instance itself: no `craft-for:<key>` comments (the page actor of the
  devtools cannot read these keys), no context of its own.
- **More shapes compile.** Setup declarations before the `return`, events
  (including `*click() {}` methods, with the same hooks and interaction
  names), any attribute expression, and _holes_: any child the compiler does
  not know (a component call, `forNode`, `ifNode`, a helper call) is rendered
  by the generic renderer at its place.
- **Binding generators become plain functions** (`lower: false` keeps
  them): `yield* x` reads a settled value at once and drives anything else
  like before; `yield* Service.member()` reads the member of the service
  resolved once per injector. A `yield*` under `try`, a bare `yield` or a
  generator with parameters is kept as written.
- **Bindings without reactive reads** stop after their first run.

`compileModule(source, filename, options)` from `@craft-ts/compiler` also exposes the
standalone transform, high-resolution source map and per-component decisions.
Unsupported syntax is reported as `fallback` with a reason, never silently
rewritten using assumptions about purity.

From the repository:

```sh
npm run compiler:build
npm run compiler:test
npm run perf:compiler
```

See [the benchmark](../../apps/compiler-benchmark/README.md) for methodology and
controls. This is an initial compiler: inspect coverage and measure a real
application before choosing to enable it. It trades additional generated code
for reduced mounting work; faster mounting alone does not guarantee a faster
navigation on every device.
