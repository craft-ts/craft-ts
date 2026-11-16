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

`craftCompiler({ dom: 'clone' })` opts into native blueprint cloning. Blueprints
contain static DOM only and are cached weakly per adapter; readers and DOM node
references remain per instance. It is not the default because cloning is not
consistently faster than direct creation. Adapters without `cloneNode` use the
ordinary creation factory.

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
