---
name: craft-ts-effect-v4
description: Build Effect v4 integrations in framework-independent CraftTS applications with typed services, Layers, queryEffect and Effect diagnostics. Use when a project selected EffectTS during craft create or when editing Effect domain code.
---

# CraftTS + Effect v4

Use this skill only when the project has selected EffectTS. The project must
use the Effect v4 line (`effect@4.0.0-rc.*` or a later v4 release), never v3
examples copied from older documentation.

## Boundary

- Domain operations return `Effect.Effect` and depend on `Context.Service`.
- Production implementations are supplied by `Layer` and registered once in
  the Craft app config.
- UI data loading uses `queryEffect`; do not call `Effect.runPromise` from a
  component or bypass the Craft reactive lifecycle.
- Install `installCraftEffectBridge()` once during bootstrap.
- Run the Effect diagnostics command from `package.json` after changing an
  Effect generator, service, schema or Layer.

## Verification

Run the focused test, `npm run effect-check`, `npm run lint`,
`npm run typecheck`, `npm run architecture`, and the E2E flow when the browser
contract changed. The architecture suite checks that Effect resources keep a
typed service boundary and that the declarative Craft graph remains intact.

Confirm symbols against the installed v4 package. Do not “fix” a v4 diagnostic
by downgrading the dependency or importing an Angular adapter.
