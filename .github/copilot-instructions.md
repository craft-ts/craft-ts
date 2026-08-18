# Copilot Instructions

- `GenDeps_* = GetDeps<...>` is generated source code, not runtime state.
- After changing Angular `inject(...)`, constructor injection, metadata `imports`, `providers`, or `viewProviders`, verify that the file's `GenDeps_*` alias is still aligned.
- For a single file without `GenDeps_*`, prefer the ESLint Quick Fix from `craft-ts/brand-angular-gen-deps-required`.
- For a single file with `GenDeps_*`, prefer the ESLint Quick Fix from `craft-ts/brand-angular-deps-match` or run `eslint --fix path/to/file.ts`.
- For a larger refresh, run `craft-brand --root <source-root>`.
- Do not hand-edit generated `GenDeps_*` blocks unless you are intentionally updating them through the codemod or ESLint autofix flow.
