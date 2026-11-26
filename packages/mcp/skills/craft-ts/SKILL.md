---
name: craft-ts
description: Write and review framework-independent @craft-ts/core applications, including CSR and SSR. Use when creating or evolving a CraftTS project, adding state, query, mutation, queryParams, asyncProcess, craftService, craftComponent, craftRoutes, forms, SSR rendering or hydration, API boundaries, or coding-agent setup, and when TypeScript reports TS2589, TS2321 or TS7056 on Craft components or routes.
---

# CraftTS

You are working in a framework-independent application that depends on
`@craft-ts/core`. The default renderer is `@craft-ts/component`; Angular is not
required and must not be introduced just to solve a Craft problem.

## First steps

1. Call the CraftTS MCP tool `get_best_practices` when it is available.
2. Search docs with `search_documentation` before inventing an API.
3. Load a workflow skill with `get_skill` when the task matches:
   - `craft-ts-architecture-tests` — scaffold or run `architecture/`, or freeze a graph smell. Not before every feature.
   - `translate-spec-to-craft-ts` — map a spec onto primitives
   - `craft-ts-routes` — type-safe routes and DI checks
   - `craft-ts-service-migration` — Angular services → `craftService`
   - `migrate-to-craft-ts` — run `craft-migrate`, then finish diagnostics
   - `craft-ts-effect-v4` — use Effect v4 services, Layers, `queryEffect`, and
     the synchronous-member declaration (`SyncOp` / `computedEffect`)
   - `craft-ts-style` — the typed design system: sheets, axes, static text
     contrast, the visual matrix, context obligations
   - `craft-ts-i18n` — typed catalogues, locale parity, semantic tokens

For a project created by `craft create`, keep the generated development
surface enabled. Run `npm run logs:server` for the local JSONL ingestion
server and `npm run registry:mcp` for the browser page MCP bridge; the
generated `.mcp.json` also registers the Craft guidance and log-reader MCP
servers. Use Craft `Console.*` for entries that must be searchable through
`npm run logs:mcp`; raw `console.*` calls stay in the browser or server
process console. These facilities are development-only and must not be added
to a production provider graph.

If MCP is not configured, read https://ng-angular-stack.github.io/craft/llms.txt and the `AGENTS.md` snippet in this package (`content/agents.md`).

## Hard rules

- `yield*` every Craft reader. Use `craftUse` only at synchronous boundaries.
- `state` / `query` / `mutation` / `queryParams` / `asyncProcess` — not `signal()`.
- One insertion per primitive; compose with `craftPipe`.
- `craftService` + generated `X()` helpers. No new `inject()` / `@Injectable`.
- `craftRoutes` + `componentDeps` + a per-file DI check. Split on `TS2589`.
- Type-depth errors (see [Type-depth errors](#type-depth-errors)): never
  silence them with `any`, `@ts-ignore` or a `CraftComponent<…>` annotation.
- Use `startCraft` and `provideCraftRouter` for a browser app that may receive
  SSR HTML. It hydrates a host marked by Craft SSR and mounts a fresh client
  tree otherwise. Use `bootstrapCraft` when a fresh client mount is explicitly
  required, and `hydrateCraft` when hydration must be forced or customized.
- Use `renderCraft` for one isolated SSR request. Create a new render per
  request; never reuse its injector, platform, primitive registry, or history.
- Keep SSR data behavior explicit with `pendingNode({ ssr: 'block' | 'fallback' | 'client' })`
  or a route-level `ssr` policy. Do not let a suspended source reach SSR
  without a policy.
- Visual rules live in a `*.style.ts` sheet. Static variation becomes a class
  the emitter wrote; dynamic variation goes through a typed custom property.
  Never assemble a class string at render time — the template sets one constant
  class and a `data-*` attribute. `@craft-ts/style` is a **build step**: without
  `craftStyle()` from `@craft-ts/style/vite` in the Vite config, the sheets
  typecheck and emit nothing. Load `craft-ts-style` before touching one. When
  the project exposes `npm run style:check`, run it after changing colours,
  typography, template classes, themes, hover or another visual axis.
- Translations live in a `@craft-ts/i18n` catalogue: `defineCatalog` + `msg` for
  the reference locale, `defineLocaleLike` for every other one, so a missing key
  is a compile error. A token may validate or parse its parameter with a
  Standard Schema, and resolve its formatter from a Craft service; a project
  generated with i18n also forbids visible literals in templates. No Effect
  import — use `@craft-ts/i18n-effect` only inside an Effect program. Load
  `craft-ts-i18n` before adding a key, a locale or a token.
- Forms start with `state` + `insertForm`. Choose `insertSelectFormTree` for a
  nested field, `insertFormAttributes` for validators/visibility,
  `insertFormSchema` for whole-form validation and `insertFormSubmit` for a
  mutation. Bind the selected field with `CraftFieldDirective`; expose
  `field.exceptions` through `fieldErrorNode`, and read submission state with
  `form().submitting()` / `form().hasSubmitExceptions()`. Do not reach for
  native `FormData` as the primary form model.
- Run existing architecture tests. Do not add an architecture rule for the feature.
- Keep `npm run typecheck` in the project CI; for generated projects this is
  already wired into `.github/workflows/ci.yml` alongside the architecture
  and build checks.
- Confirm symbols against the installed `node_modules/@craft-ts/core`.

## Type-depth errors

These errors mean a type grew too deep, not that the code is wrong:

- `TS2589: Type instantiation is excessively deep and possibly infinite`;
- `TS2321: Excessive stack depth comparing types …`;
- `TS7056: The inferred type of this node exceeds the maximum length the compiler will serialize`.

First find where it comes from: the line of the error, and
`tsc --extendedDiagnostics` (instantiation count) when it is slow rather than
failing. Then pick the remedy that matches:

| Where it fires | Remedy |
| --- | --- |
| A route file, on a large `craftRoutes(...)` collection | split it into checked child collections with `loadChildren` (`craft-ts-routes`) |
| A component tree: a deep page, `cond ? A() : B()` between components, a slot, a `forNode` row, a component passed to a generic boundary | seal the component where it crosses that boundary with `sealComponent(Component)` |
| The declaration (`.d.ts`) of an exported component (TS7056) | export a sealed component: `sealComponent(Component)` |
| One huge template | split it into child components (each computes its contracts once) |

Sealing is one of these tools, not a default. `sealComponent` (from
`@craft-ts/component`) returns the component itself; only its type changes. It
keeps everything a parent checks — props and required inputs, the DI contract
(`ComponentDepsOf` / `RouteCheckedDI`), initialization and field exceptions,
the `headingSection` need, style channels, `.pipe(...)` — and drops the shape
of the rendered tree.

- Seal at the use site, keep the definition plain:
  `export const Status = craftComponent('Status', …)` in its file, and
  `const StatusRow = sealComponent(Status)` where a list, slot or condition
  needs it. A library publishing `.d.ts` re-exports the sealed component from
  its public index.
- Test the unsealed component: typed content locators
  (`result.locator('span', { content: … })`) and template contracts
  (`TemplateRendersNamedElementWhen`) stop at a sealed boundary. The test
  register (what must be mocked) is the same either way.
- Never type a component by hand (`const X: CraftComponent<Props> = Impl`, or
  `as CraftComponent<…>`): it drops the DI contract, so DI proofs and template
  test registers then fail with an "unknown component dependency contract"
  message. `craft-ts/no-craft-component-return-type` reports it. Replace it
  with `sealComponent(Impl)`, or use `SealedComponent<typeof Impl>` when a
  declaration must name the type.

Docs: `/guide/components/composition-boundaries`.
