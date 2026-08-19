# Demo app

Craft application that exercises `@craft-ts/core` examples and integration
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
`@craft-ts/dev-tools`. All lookups and rules live in the single
`architecture/architecture.spec.ts` file so the graph is analyzed only once
per Vitest run. The file contains:

- unique `craftUnique` and HTTP endpoint ownership;
- pure computeds, dependency cycles, route DI proofs and mutation reactions;
- persistence, `insertSelect`, Effect and interactive-element constraints;
- declarative architecture and exclusive feature-link checks.

Run them with Nx, from the repository root:

```bash
npx nx architecture demo
```

Typecheck the suite (catalog lookups, Vitest types) with:

```bash
npx nx typecheck-architecture demo
```

The target is defined in `project.json` and runs Vitest against
`vitest.architecture.config.ts`. It does not boot the application runtime.

Full reference: [Architecture rules](https://craft-ts.github.io/craft/guide/testing/architecture).
