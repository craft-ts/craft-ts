---
name: craft-ts-effect-v4
description: Build Effect v4 integrations in framework-independent CraftTS applications with typed services, Layers, queryEffect, synchronous members (SyncOp / computedEffect / syncEffect) and Effect diagnostics. Use when a project selected EffectTS during craft create or when editing Effect domain code.
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
- `Effect<A, E, R>` does not say whether running it suspends, and a service
  member hides it further: a `Layer` closes over its dependencies, so a network
  call and a pure calculation both surface as `R = never`. Declare the members
  that never suspend by putting `SyncOp` in their requirements — in the shape
  when it is written by hand, with `yield* SyncOp` when `R` is inferred.
- A declared-synchronous Effect is the only one allowed where Craft runs the
  synchronous driver. Use `computedEffect` for a derived value (the Effect
  counterpart of `craftComputed`: the factory RETURNS the Effect, the adapter
  runs it in place and yields a value, not a resource), and `syncEffect(...)`
  in a `params`, a `craftMethod` or a `state` updater. Anything that suspends
  belongs to a `loader`.
- Never declare `SyncOp` on a member that can suspend. The claim is checked by
  `craft-ts/sync-effect-body` on the body and by `Effect.runSyncExitWith` at
  runtime, which throws `CraftEffectNotSynchronous` on the first call.
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
