# Demo app

Angular application that exercises `@craft-ng/core` examples and integration
checks. Architecture rules live next to `e2e/`, in `architecture/`.

## Serve

From the repository root:

```bash
npx nx serve demo
```

The development server starts every demo route. The TypeScript type-check runs
in parallel with Vite, with a small `Type checking in progress…` indicator in
the top-right corner of the page until it completes. If it fails, a large
overlay reports the failure while the development server remains available.

## Architecture tests

The suite in `architecture/` analyzes the demo TypeScript with
`@craft-ng/dev-tools`. App-specific lookups live in `architecture.spec.ts`.
Each common rule has its own file under `architecture/rules/`:

- `rules/craft-unique.spec.ts` — `assertCraftUnique`
- `rules/http-endpoint-unique.spec.ts` — `assertHttpEndpointUnique`
- `rules/craft-computed-pure.spec.ts` — `assertCraftComputedPure`
- `rules/no-dependency-cycles.spec.ts` — `assertNoDependencyCycles`
- `rules/declarative-architecture.spec.ts` — `assertDeclarativeArchitecture`
- `rules/exclusive-link.spec.ts` — `noExclusiveLink`
- `rules/route-di-proofs.spec.ts` — `assertRouteDiProofs` (routes + `app.config.ts`)
- `rules/mutation-react-on.spec.ts` — `assertMutationHasReactOn`
- `rules/persisted-primitive-unique.spec.ts` — `assertPersistedPrimitiveHasUnique`
- `rules/insert-select-unique.spec.ts` — `assertInsertSelectUnique`
- `rules/craft-effect-no-network.spec.ts` — `assertCraftEffectNoNetwork`
- `rules/craft-effect-no-imperative-sync.spec.ts` — `assertCraftEffectNoImperativeSync`

Run them with Nx, from the repository root:

```bash
npx nx architecture demo
```

Typecheck the suite (catalog lookups, Vitest types) with:

```bash
npx nx typecheck-architecture demo
```

The target is defined in `project.json` and runs Vitest against
`vitest.architecture.config.ts`. It does not boot Angular.

Full reference: [Architecture rules](https://ng-angular-stack.github.io/craft/guide/testing/architecture).
