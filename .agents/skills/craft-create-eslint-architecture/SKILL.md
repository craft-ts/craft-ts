---
name: craft-create-eslint-architecture
description: Guide the creation of Craft ESLint rules and complementary architecture checks, including registration, default activation, autofixes, tests, and before/after documentation. Use when adding or changing a Craft ESLint rule, enforcing a source invariant, or deciding whether a check belongs in ESLint or the architecture graph.
---

# Craft ESLint and Architecture Rule Creation

Create rules that make Craft's preferred architecture easy to follow and hard to regress. Read the existing implementation and docs in the affected area first; extend their conventions instead of building a parallel rule system.

## Choose the enforcement layer

State the invariant in one sentence, then choose the narrowest layer that can prove it:

- **One file:** use an ESLint rule when the syntax, imports, names, or type information in one source file are sufficient. ESLint should give immediate editor feedback.
- **Several files or graph relationships:** use an architecture assertion when the invariant compares declarations, ownership, reachability, uniqueness, or edges across the TypeScript project. ESLint cannot reliably prove it from one file at a time.
- **Complementary checks:** use both when a local form and a project-wide consequence are distinct useful guarantees. Keep each check responsible for its own claim; do not duplicate the same diagnostic.

For example, `no-explicit-craft-template-return-type` inspects one file, while `assertCraftUnique` can detect the same persisted identity declared in different files.

Prefer a safe autofix when it preserves behaviour and the intended replacement is unambiguous. If only a human can choose correctly, provide a suggestion when possible and report an error with the detected problem, why it violates the invariant, and the preferred replacement with enough detail to apply it. Never offer a speculative autofix.

## Add an ESLint rule

1. Inspect similar rules and their tests under `libs/dev-tools/src/eslint-rules/`. Implement the rule in `<rule-name>.cjs` and its Vitest tests in `<rule-name>.spec.ts` beside it. Follow the local CommonJS plugin convention.
2. Define `meta.type`, `meta.docs.description`, `meta.schema`, stable `messageId`s, and `meta.fixable` or `meta.hasSuggestions` only when applicable. Match the smallest relevant AST node and leave valid neighbouring patterns alone. Respect typed-parser and scope conventions used by adjacent rules.
3. Cover valid code, each reported violation, boundary/false-positive cases, and the diagnostic's actionable alternative. For a fixer, assert the exact output, that lint is clean afterwards, and that a second fix pass changes nothing.
4. Register the implementation in `libs/dev-tools/src/eslint-rules/index.cjs`. Add every generally applicable Craft invariant to `recommended-config.cjs` at **`error`** severity so it is part of the base package policy. `recommended` is also extended by the `effect` preset. Do not leave a rule available only by manually naming it in each app.
5. Check the generated-app path in `libs/dev-tools/src/scripts/create/create-project.ts`: its `eslint.config.mjs` is generated with `craftRules.configs.recommended.rules` (or `effect.rules`). Update `create-project.spec.ts` if needed so a generated application's config is proven to include the rule at error severity. If a rule is genuinely optional or narrowly scoped, put it in the matching preset and document why it is not a base invariant; never silently choose `warn` or `off` for a base rule.

## Add an architecture assertion

Use architecture checks for invariants that need the whole TypeScript project or dependency graph. Read `apps/docs/guide/testing/architecture.md` and a nearby implementation/test before choosing the graph facts to inspect.

- Put reusable graph analysis/assertion code in the existing `libs/dev-tools/src/scripts/` architecture modules and export its public API through the package's existing entry points. Keep app-specific policy in that app's `architecture/architecture.spec.ts`.
- Add focused Vitest coverage and fixtures in `libs/dev-tools/tests/architecture/rules/` and `fixtures/`. Include a valid graph and graphs that violate the invariant; test the failure text for a concrete target or relationship and a useful remedy.
- Keep graph analysis deterministic and static. Reuse typed graph nodes, edges, proofs, and existing assertions instead of reparsing source or inventing a second graph vocabulary.
- If a local ESLint check complements the graph assertion, describe which local mistake it catches and which project-wide fact the architecture test proves.

## Document the rule

Update the relevant public guide alongside implementation: `apps/docs/guide/routing/eslint-rules.md` for ESLint guidance, `apps/docs/guide/testing/architecture.md` or a focused page under `apps/docs/guide/testing/architecture/` for graph rules, and the relevant concept page when it explains the preferred pattern.

Every new rule needs a concrete **before / after** example: mark the rejected code, show the preferred code, explain why it matters, and name the exact fix or replacement. State whether `eslint --fix` applies it automatically or whether the developer must make a choice. Follow the docs' imported-snippet conventions under `apps/docs/tests/snippets/` when examples should be compiled or checked.

## Completion checklist

- [ ] The invariant and enforcement layer are justified; the rule does not claim more than its analysis can prove.
- [ ] The diagnostic explains both why the pattern is wrong and what to do instead; safe autofix/suggestion coverage exists where possible.
- [ ] The plugin exports the rule, the intended preset enables it at `error`, and a newly generated app receives it automatically.
- [ ] Positive and negative tests cover the rule's boundary; cross-file guarantees have architecture tests and representative fixtures.
- [ ] Public docs show before and after code and explain the preferred path.
