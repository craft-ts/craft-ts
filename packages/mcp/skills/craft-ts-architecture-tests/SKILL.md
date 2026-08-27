---
name: craft-ts-architecture-tests
description: Use when scaffolding or running a CraftTS architecture suite (architecture/, craft-migrate-architecture, nx architecture, assertRouteDiProofs, assertDeclarativeArchitecture), when a graph smell must not recur (duplicate HTTP, feature leak, mutation without insertReactOnMutation, unarmed CanRun, craftUnique clash), or when an app that imported @craft-ts/core has no architecture/ folder at bootstrap or after craft-migrate.
---

# CraftTS architecture tests

The `architecture/` suite is the app's **graph contract**. It proves who may
depend on whom, which HTTP endpoint is owned once, which identity appears
once — without booting a browser framework. It works for framework-independent
CraftTS apps as well as migrated Angular apps.

Setup and helpers: https://ng-angular-stack.github.io/craft/guide/testing/architecture
Do not copy that page. Load it with `get_documentation_page` when you need a
signature.

## When not to use

Do **not** add an architecture rule for the feature. A new `it()` is not part
of mapping a spec onto primitives. Write application code, then **run** the
suite that already exists.

## 1. Bootstrap a new project

Prefer `craft create`, which asks for the application type first, recommends
EffectTS v4 for a full-stack backend, and then asks for agent integrations. It
generates the application, API/page example, routes, ESLint, unit tests,
architecture suite and Playwright commands together:

```shell
npx craft create my-app --effect=none --agents=codex,cursor,cloud-code
```

For an Effect v4 starter:

```shell
npx craft create my-app --effect=v4 --agents=codex
```

The generated `README.md` is the command contract. The starter's architecture
suite is ready at bootstrap; do not postpone it until after the first feature.

## 2. Bootstrap an existing project

Use at app start or as the last `craft-migrate` step, when `architecture/` is
missing.

```shell
npx craft-migrate-architecture --project tsconfig.app.json --root src --write
```

That writes the Vitest/Node suite, catalog, baseline rules, and an Nx
`architecture` target or package script. Enable the scaffolded helpers
(`assertDeclarativeArchitecture`, `assertRouteDiProofs`, and the files under
`architecture/rules/`). Point CI at `npx nx architecture <app>` (or
`npx vitest run --config vitest.architecture.config.ts`).

If this comes up **mid-feature**, report the gap and offer the scaffold. Do
not impose it.

## 3. During a feature

Run the existing suite. A failure is a graph slip in the **code** (or a
disarmed DI proof), not a missing `it()`.

```shell
npx nx architecture <app>
```

Do not add an architecture rule for the feature.

## 4. Encode a smell

When a pattern should not recur — duplicate HTTP, feature leak, mutation
with no `insertReactOnMutation`, duplicate `craftUnique`, commented `CanRun`,
`craftEffect` pushing into another primitive — freeze it.

- If `architecture/` exists, add the matching helper (or a neighbourhood
  `it()`) under `architecture/rules/`.
- If it does not, propose workflow 1 first, then the rule.

Keep the assertion next to a comment that states the **product** invariant.

| Smell | Helper |
| --- | --- |
| Duplicate `craftUnique` identity, or a non-literal argument | `assertCraftUnique` |
| Same HTTP verb+URL from two sites | `assertHttpEndpointUnique` |
| `craftComputed` calls a method or writes `source$` | `assertCraftComputedPure` |
| `depends-on` cycle | `assertNoDependencyCycles` |
| Mutation with no `insertReactOnMutation` | `assertMutationHasReactOn` |
| The five declarative checks together | `assertDeclarativeArchitecture` |
| Unarmed `CanRun` / missing route or error-screen proof | `assertRouteDiProofs` |
| `depends-on` crosses a folder allowlist | `assertPathBoundaries` |
| Two feature branches leak into each other | `noExclusiveLink` |
| Persister without `craftUnique` | `assertPersistedPrimitiveHasUnique` |
| Same `insertSelect` key twice on one host | `assertInsertSelectUnique` |
| `craftEffect` calls HTTP or a mutation | `assertCraftEffectNoNetwork` |
| Duplicate `data-craft-name` on interactive elements, or a missing / non-literal first-argument name | `assertInteractiveElementNamed` |

Custom lookups (`graph.route`, `graph.providedOn`, `outgoing`) are for
invariants the helpers do not cover.

## Red flags

| Excuse | Reality |
| --- | --- |
| "I'll add a rule for this feature first" | Rules are baseline or anti-regression, not TDD-before-feature. |
| "Too small to encode" | If it must not recur, it is a rule. |
| "We'll add architecture tests after the PR" | The smell will ship. Encode it now or say you are not encoding it. |
| "ESLint already covers this" | ESLint is local. The suite is graph-wide. |
| "The suite is missing, I'll skip it" | Offer the scaffold. Do not pretend the contract exists. |
