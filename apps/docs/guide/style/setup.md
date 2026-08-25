# Activating `@craft-ts/style`

The typed style system is not a runtime library you import and call. It is a
**build step**: a Vite plugin evaluates every `*.style.ts` in Node, deduplicates
what they registered, and emits one stylesheet. Without that plugin the
vocabulary still typechecks and still compiles — and the page renders with no
CSS at all.

This page is the one to follow before the other four.

## Install

```bash
npm install @craft-ts/style
npm install --save-dev @craft-ts/style-testing
```

`@craft-ts/style` carries the vocabulary — tokens, kinds, typed custom
properties, axes, sheets, obligations. `@craft-ts/style-testing` carries the
scenario matrix and the drivers that reach each of its points; it never ships to
the browser, so it belongs in `devDependencies`.

`@craft-ts/style` declares `@craft-ts/core` as a peer dependency, and
`@craft-ts/style-testing` declares `@craft-ts/style`. Both are `sideEffects:
false`.

## Wire the plugin

<<< @/tests/snippets/guide/style/setup/vite-config.spec.ts#plugin

`craftStyle` takes four options, all optional:

| option     | default                                          | what it decides                                          |
| ---------- | ------------------------------------------------ | -------------------------------------------------------- |
| `suffix`   | `'.style.ts'`                                    | the filename suffix that marks a module as a sheet       |
| `ignore`   | `['node_modules', 'dist', '.git', '.nx', 'tmp']` | directory names the walk never descends into             |
| `dumpPath` | none — no dump is written                        | where to write the graph dump                            |
| `alias`    | none                                             | module aliases for the **Node** evaluation of the sheets |

`alias` exists because the sheets are evaluated by a real bundler in a separate
pass, before your app's own resolution applies. In a published project, Node
resolution finds `@craft-ts/style` on its own and you can leave `alias` out. In
this monorepo the demo passes the workspace source paths — see
[`apps/demo/vite.config.ts`](https://github.com/craft-ts/craft-ts/blob/main/apps/demo/vite.config.ts),
which is the working reference for everything on this page.

Then import the emitted sheet once, at the app entry:

```ts
import 'virtual:craft-style.css';
```

If your `tsconfig` does not already know that id, declare it next to your other
ambient types:

```ts
declare module 'virtual:craft-style.css';
```

## What the plugin produces

Two artefacts, from one evaluation.

**The CSS.** Every `when(...)` and `set(...)` the sheets registered, rendered as
atomic rules and `@property` registrations, deduplicated across files, and
served under `virtual:craft-style.css`. This is the whole stylesheet: no class
is ever assembled in the browser, so what the browser gets is exactly what the
emitter proved.

**The dump**, when `dumpPath` is set. A JSON picture of the registry — classes,
atoms, and typed variables — written on _every_ emission, so it can never
describe a sheet older than the CSS that was served alongside it. The dump is
the style half of the dependency graph: it is what
[`style_impact`, `style_matrix` and `style_debt`](./testing.md#what-the-graph-adds)
read, and what the `@craft-ts/dev-tools` style queries read.

The plugin re-derives the whole sheet when a `*.style.ts` changes rather than
patching it. Atomic output is small and the emission is one bundle away; an
incremental path here would be a second source of truth about what the CSS says.

## What breaks without it

| missing                            | symptom                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| the plugin                         | no CSS at all — the classes exist as strings, nothing ever wrote their rules |
| `import 'virtual:craft-style.css'` | same, and less obviously: the plugin runs but nothing pulls its output       |
| `dumpPath`                         | `style_matrix` and the other graph queries have nothing to read and say so   |

The MCP server names the fix in its own error message: it points you back at
`craftStyle({ dumpPath })`. If you are reading this because you saw that
message, `dumpPath` is the line you are missing.

## Emitting without a Vite server

`@craft-ts/style/vite` exports the emitter itself, so a test or a script can get
the same two artefacts without standing up a dev server:

<<< @/tests/snippets/guide/style/setup/emit.spec.ts#emit

`vite` is a peer of that entry point, not a dependency: a project that builds
with something else can still call `emitStyles` without pulling Vite's types
into its own program.

## Next

- [Define your design system](./define.md) — palette, axes, theme: where `bp`,
  `scheme` and `palette` come from.
- [Tokens and typed variables](./tokens.md) — level 1.
- [Axes and the visual matrix](./variants.md) — level 2.
