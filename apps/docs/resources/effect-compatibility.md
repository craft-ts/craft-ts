# Effect compatibility and maturity

This page describes the current repository contract. It is a decision aid for
teams evaluating CraftTS, not a promise that beta APIs will remain unchanged.

## Compatibility matrix

| Area | Current contract | Status |
| --- | --- | --- |
| Craft runtime | `@craft-ts/core` `0.7.0-beta.11` | Beta |
| Craft components | `@craft-ts/component` on the same Craft version | Beta |
| Effect bridge | `@craft-ts/effect` `0.7.0-beta.11` | Beta / experimental integration |
| Effect runtime | `effect` `^4.0.0-rc.112` | Effect 4 release candidate required by current Alchemy |
| Effect 3 projects | No compatibility contract | Migrate or isolate before adopting |
| Node.js | 20.19+ or 22.12+ | Required by the current docs |
| TypeScript | Use the version supported by the selected Craft beta; verify with the project lockfile | Toolchain-sensitive |
| Browser application | Vite demo and jsdom tests are covered | Experimental but executable |
| SSR | No product SSR renderer in this release | Not ready |
| Server functions | Local transport and middleware experiment | Proof of concept |
| Migration tooling | `craft-migrate` for Craft concepts | No complete Effect-specific migration |

Install all Craft packages from the same beta channel. `@craft-ts/effect` also
declares `effect` as a peer dependency, so the Effect version is part of the
application's compatibility surface.

## Maturity by capability

| Capability | What is covered today | Adoption guidance |
| --- | --- | --- |
| Effect domain programs | `Effect`, tagged errors, `Context.Service`, `Layer` | Good candidate for a pilot |
| Effect-backed reads and writes | `queryEffect`, `mutationEffect`, `asyncProcessEffect` | Pilot with real tests and a narrow feature |
| Synchronous Effect members in a computation | `SyncOp`, `computedEffect`, `syncEffect` | Declare the members that never suspend, then reuse them in `craftComputed` and `params` |
| Layer scoping | application, route, component and primitive providers | Use after the basic boundary is understood |
| Typed error mapping | `E` becomes Craft exceptions; defects stay technical errors | Suitable for explicit UI error handling |
| Effect service mocks | `mockEffectService` plus Craft registers | Suitable for focused tests |
| Static Effect graph | Effect services, operations and Layers are collected | Useful for architecture rules; still evolving |
| Server functions | `executeEffect`, middleware and local HTTP demo | Keep behind an experimental boundary |
| SSR and deployment integration | Not shipped as a product contract | Do not make it a prerequisite for adoption |

## How to read this table

The safest first adoption is browser-side, one feature, with an existing Effect
domain and an application Layer provided by Craft. Defer SSR-specific decisions
and server functions until their contracts are stable.

See [Adopting CraftTS progressively](/resources/effect-adoption) for a staged
plan and [the quickstart's verification section](/learn-effect/00-start-here#5-verify-the-boundary)
for the executable Effect demo checks.
