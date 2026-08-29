## 0.7.0-beta.21 (2026-08-29)

### 🩹 Fixes

- exclude vendored references from nx graph ([1796136b8](https://github.com/craft-ts/craft-ts/commit/1796136b8))

### ❤️ Thank You

- Romain

## 0.7.0-beta.20 (2026-08-29)

### 🚀 Features

- **dev-tools:** limit craft declarations per file ([2000dc3e](https://github.com/craft-ts/craft-ts/commit/2000dc3e))

### 🩹 Fixes

- **architecture:** index fnUntraced Effect operations ([a547dfd1](https://github.com/craft-ts/craft-ts/commit/a547dfd1))
- **core:** close the type holes the spec type-check uncovered ([7b83102b](https://github.com/craft-ts/craft-ts/commit/7b83102b))
- **demo:** satisfy Craft lint rules ([10ef7a4e](https://github.com/craft-ts/craft-ts/commit/10ef7a4e))
- **docs:** keep reactive snippet bindings granular ([a118c458](https://github.com/craft-ts/craft-ts/commit/a118c458))
- **effect:** align examples and starters with Effect patterns ([106b87f4](https://github.com/craft-ts/craft-ts/commit/106b87f4))
- **effect:** type todo mutation failures ([7abcef32](https://github.com/craft-ts/craft-ts/commit/7abcef32))

### ❤️ Thank You

- Claude Opus 5
- Romain

## 0.7.0-beta.19 (2026-08-28)

This was a version bump only, there were no code changes.

## 0.7.0-beta.18 (2026-08-27)

### 🩹 Fixes

- infer generator query params correctly ([5e064392](https://github.com/craft-ts/craft-ts/commit/5e064392))
- allow demo cache reset reload ([3a32ddab](https://github.com/craft-ts/craft-ts/commit/3a32ddab))
- make demo architecture release-safe ([ad8f063f](https://github.com/craft-ts/craft-ts/commit/ad8f063f))

### ❤️ Thank You

- Romain

## 0.7.0-beta.17 (2026-08-26)

### 🩹 Fixes

- sync standalone demo style dependencies ([7ed98948](https://github.com/craft-ts/craft-ts/commit/7ed98948))

### ❤️ Thank You

- Romain

## 0.7.0-beta.16 (2026-08-26)

This was a version bump only, there were no code changes.

## 0.7.0-beta.15 (2026-08-26)

### 🚀 Features

- render Craft nodes through a native DOM adapter ([316c7390](https://github.com/craft-ts/craft-ts/commit/316c7390))
- run craftHttpClient on fetch ([97cc30f6](https://github.com/craft-ts/craft-ts/commit/97cc30f6))
- run craft reactivity on alien-signals ([77d2023c](https://github.com/craft-ts/craft-ts/commit/77d2023c))
- replace Angular EnvironmentInjector with CraftInjector ([57ababc6](https://github.com/craft-ts/craft-ts/commit/57ababc6))
- replace Angular Router with a Craft history matcher ([de4b1b85](https://github.com/craft-ts/craft-ts/commit/de4b1b85))
- list reloading page clients so agents can see ghosts ([c1864131](https://github.com/craft-ts/craft-ts/commit/c1864131))
- drop Angular peers from core and ship @craft-ng/angular ([e508a56a](https://github.com/craft-ts/craft-ts/commit/e508a56a))
- delete the Angular island and run the core suite without Angular ([2820439c](https://github.com/craft-ts/craft-ts/commit/2820439c))
- boot, build and serve the demo without Angular ([de1808c8](https://github.com/craft-ts/craft-ts/commit/de1808c8))
- add Effect server function architecture demo ([ef34067e](https://github.com/craft-ts/craft-ts/commit/ef34067e))
- enforce Effect v4 diagnostics ([d4147d7d](https://github.com/craft-ts/craft-ts/commit/d4147d7d))
- detect server functions defined outside *.fn-serveur.ts files ([454e6ef0](https://github.com/craft-ts/craft-ts/commit/454e6ef0))
- add SSR and hydration runtime ([803b66a0](https://github.com/craft-ts/craft-ts/commit/803b66a0))
- pass npm OTP during release ([10b7c4c6](https://github.com/craft-ts/craft-ts/commit/10b7c4c6))
- make craftMiddleware yieldable ([59c24215](https://github.com/craft-ts/craft-ts/commit/59c24215))
- seal level 2 and record the matrix of the design system ([e80bcffc](https://github.com/craft-ts/craft-ts/commit/e80bcffc))
- context obligations that stop the build — wave 3, tasks 23 to 26 ([721d90c0](https://github.com/craft-ts/craft-ts/commit/721d90c0))
- style queries from the CLI and from MCP — wave 4, task 29 ([9d98b496](https://github.com/craft-ts/craft-ts/commit/9d98b496))
- **component:** propagate contract channels through every node ([b489b88b](https://github.com/craft-ts/craft-ts/commit/b489b88b))
- **component:** add scheduled each rendering ([2d7833b5](https://github.com/craft-ts/craft-ts/commit/2d7833b5))
- **core:** carry opaque contract channels through the vnode ([1460885c](https://github.com/craft-ts/craft-ts/commit/1460885c))
- **core:** craftStateMachine ([d6b5a6f5](https://github.com/craft-ts/craft-ts/commit/d6b5a6f5))
- **core:** accept bare transitions without transitionSetup ([04410fcd](https://github.com/craft-ts/craft-ts/commit/04410fcd))
- **core:** addressable primitive registry ([cc4cab6f](https://github.com/craft-ts/craft-ts/commit/cc4cab6f))
- **core:** machine history and back navigation ([da6c755c](https://github.com/craft-ts/craft-ts/commit/da6c755c))
- **core:** persist a machine history across a reload ([58ade6b3](https://github.com/craft-ts/craft-ts/commit/58ade6b3))
- **core:** mark replay writes, and stop poisoning unsettled resources ([2ec0e604](https://github.com/craft-ts/craft-ts/commit/2ec0e604))
- **core:** freeze a resource's params while its value is being restored ([fdaf15f7](https://github.com/craft-ts/craft-ts/commit/fdaf15f7))
- **core:** restore a resource without detaching it from its loader ([6f326bc9](https://github.com/craft-ts/craft-ts/commit/6f326bc9))
- **core:** tell apart hosts that can exist several times ([cace8434](https://github.com/craft-ts/craft-ts/commit/cace8434))
- **core:** do not record a moment identical to the current one ([4b37a5fd](https://github.com/craft-ts/craft-ts/commit/4b37a5fd))
- **demo:** add the yield* Effect example, with a live pump trace ([347aa2df](https://github.com/craft-ts/craft-ts/commit/347aa2df))
- **demo:** profile editor state machine example ([273333c9](https://github.com/craft-ts/craft-ts/commit/273333c9))
- **demo:** history and back navigation on the profile editor ([84e3af6d](https://github.com/craft-ts/craft-ts/commit/84e3af6d))
- **demo:** one state machine per row ([94f743ed](https://github.com/craft-ts/craft-ts/commit/94f743ed))
- **demo:** a mini design system built on @craft-ts/style ([a649c205](https://github.com/craft-ts/craft-ts/commit/a649c205))
- **demo-effect:** route the sync/async members example and unblock syncEffect ([8f134944](https://github.com/craft-ts/craft-ts/commit/8f134944))
- **dev-tools:** prevent colocated craft services and components ([f6ee5d32](https://github.com/craft-ts/craft-ts/commit/f6ee5d32))
- **dev-tools:** extend architecture graph backends ([cd59da6e](https://github.com/craft-ts/craft-ts/commit/cd59da6e))
- **dev-tools:** make craftStateMachine a host in the dependency graph ([8f62caae](https://github.com/craft-ts/craft-ts/commit/8f62caae))
- **dev-tools:** style nodes in the graph, and the predicates over them ([f1d99ed6](https://github.com/craft-ts/craft-ts/commit/f1d99ed6))
- **effect:** wave-0 throwaway prototype — yield* Effect in the craft pump ([cfdbaa49](https://github.com/craft-ts/craft-ts/commit/cfdbaa49))
- **effect:** wave 2 — the @craft-ts/effect bridge, on Effect v4 ([d2697034](https://github.com/craft-ts/craft-ts/commit/d2697034))
- **effect:** wave 3, and close the 2.6 scope leak ([39a4e715](https://github.com/craft-ts/craft-ts/commit/39a4e715))
- **effect:** close finding 0.1-b — Effect errors checked at compile time ([407eb146](https://github.com/craft-ts/craft-ts/commit/407eb146))
- **effect:** task 3.3 — fine dependency-graph edges, completing wave 3 ([0b088eb9](https://github.com/craft-ts/craft-ts/commit/0b088eb9))
- ⚠️  **effect:** task 1.4 — service scope becomes providedIn ([f5b19d14](https://github.com/craft-ts/craft-ts/commit/f5b19d14))
- ⚠️  **effect:** land wave 1 — _tag discriminant and providedIn scope ([d81618e4](https://github.com/craft-ts/craft-ts/commit/d81618e4))
- **effect:** add Effect-aware Craft adapters ([3a037252](https://github.com/craft-ts/craft-ts/commit/3a037252))
- **effect:** add Effect quickstart and adapter boundaries ([395b2880](https://github.com/craft-ts/craft-ts/commit/395b2880))
- **effect:** restrict Effect usage to loaders ([f5fe9d05](https://github.com/craft-ts/craft-ts/commit/f5fe9d05))
- **effect:** computedEffect becomes the Effect counterpart of craftComputed ([0aded2d3](https://github.com/craft-ts/craft-ts/commit/0aded2d3))
- **mcp:** treat architecture tests as the agent graph contract ([e48effa3](https://github.com/craft-ts/craft-ts/commit/e48effa3))
- **server-functions:** client boundary V2 — client middleware, client context, craftHandshake ([ec044d1a](https://github.com/craft-ts/craft-ts/commit/ec044d1a))
- **server-functions:** craftHandshakeMiddleware remplace requireClientDI ([83e1ddd9](https://github.com/craft-ts/craft-ts/commit/83e1ddd9))
- **style:** sketch the design system so the API problems surface now ([ae7e5901](https://github.com/craft-ts/craft-ts/commit/ae7e5901))
- **style:** turn the sketch into the package — wave 1 of the plan ([bf23cdae](https://github.com/craft-ts/craft-ts/commit/bf23cdae))
- **style:** seal level 1 with lint rules and migrate the witness component ([d5a422bd](https://github.com/craft-ts/craft-ts/commit/d5a422bd))
- **style:** the axis vocabulary — wave 2, tasks 12 to 14 ([cc1cb6bc](https://github.com/craft-ts/craft-ts/commit/cc1cb6bc))
- **style:** the axis budget and the branch sum — wave 2 complete ([fd112467](https://github.com/craft-ts/craft-ts/commit/fd112467))
- **style-testing:** the visual matrix — wave 2, tasks 17 to 20 ([92f23fc6](https://github.com/craft-ts/craft-ts/commit/92f23fc6))

### 🩹 Fixes

- stop leaking Angular types from craft public indexes ([1fcc0de6](https://github.com/craft-ts/craft-ts/commit/1fcc0de6))
- keep SignalSource yieldable and HostSignal readonly ([4568fc9a](https://github.com/craft-ts/craft-ts/commit/4568fc9a))
- keep defer interaction listening on non-element parents ([4009ed18](https://github.com/craft-ts/craft-ts/commit/4009ed18))
- preserve HTTP error status and repeated query params ([029955af](https://github.com/craft-ts/craft-ts/commit/029955af))
- connect Craft and Angular reactive graphs ([57a6dead](https://github.com/craft-ts/craft-ts/commit/57a6dead))
- preserve Angular signal consumers during Craft swap ([970da148](https://github.com/craft-ts/craft-ts/commit/970da148))
- retrace mixed Angular and Craft effect graphs ([b3e81262](https://github.com/craft-ts/craft-ts/commit/b3e81262))
- lazy Craft-to-Angular computed invalidation ([032b0a78](https://github.com/craft-ts/craft-ts/commit/032b0a78))
- evaluate craftComputed once per invalidation ([754254a3](https://github.com/craft-ts/craft-ts/commit/754254a3))
- recover thrown craftComputed and restore craftWatch options ([b88138a2](https://github.com/craft-ts/craft-ts/commit/b88138a2))
- restore Angular injection context in host injector run ([c34846c4](https://github.com/craft-ts/craft-ts/commit/c34846c4))
- keep interpreter queries and derived readers live ([7e3ca19c](https://github.com/craft-ts/craft-ts/commit/7e3ca19c))
- destroy linked Craft watches and finish TestBed migration ([d6566282](https://github.com/craft-ts/craft-ts/commit/d6566282))
- destroy linked Craft watches on resource and form eviction ([0e922b43](https://github.com/craft-ts/craft-ts/commit/0e922b43))
- destroy parallel form field state on eviction ([1e6d676f](https://github.com/craft-ts/craft-ts/commit/1e6d676f))
- bind parallel form item injectors to form DestroyRef ([e0cd77c8](https://github.com/craft-ts/craft-ts/commit/e0cd77c8))
- drop the page MCP client card on goodbye, not on every socket close ([8f204b85](https://github.com/craft-ts/craft-ts/commit/8f204b85))
- target the single ready page tab even when a reloading card remains ([c5c34c8b](https://github.com/craft-ts/craft-ts/commit/c5c34c8b))
- assign a new page clientId instead of evicting an already-open tab ([a432f387](https://github.com/craft-ts/craft-ts/commit/a432f387))
- treat a silent page WebSocket as reloading via protocol ping ([e5256f19](https://github.com/craft-ts/craft-ts/commit/e5256f19))
- load lazy route components and keep param signals live ([05d0672d](https://github.com/craft-ts/craft-ts/commit/05d0672d))
- wait for hello/ok, goodbye on tab close, and back off page MCP reconnects ([71ce4d27](https://github.com/craft-ts/craft-ts/commit/71ce4d27))
- resolve loadChildren and flush view transitions synchronously ([afed71f5](https://github.com/craft-ts/craft-ts/commit/afed71f5))
- keep page MCP navigate optional and destroy the badge on stop ([29947f59](https://github.com/craft-ts/craft-ts/commit/29947f59))
- stop stay loops and query remounts on Craft matches ([f64463a6](https://github.com/craft-ts/craft-ts/commit/f64463a6))
- say page targets one ready tab and wire demo navigate for goto ([5827e913](https://github.com/craft-ts/craft-ts/commit/5827e913))
- slice Craft matches per nested outlet depth ([61d43048](https://github.com/craft-ts/craft-ts/commit/61d43048))
- reuse parent outlets and honor Craft redirects ([52a4584b](https://github.com/craft-ts/craft-ts/commit/52a4584b))
- keep in-flight loadComponent across match reuse ([5c6eba9d](https://github.com/craft-ts/craft-ts/commit/5c6eba9d))
- close Craft router seam without Angular Router ([450f979c](https://github.com/craft-ts/craft-ts/commit/450f979c))
- isolate view-transition state and skipLocationChange url ([6ecb805c](https://github.com/craft-ts/craft-ts/commit/6ecb805c))
- clear view-transition state on skip and recover without Angular Router ([2caa38f7](https://github.com/craft-ts/craft-ts/commit/2caa38f7))
- subscribe Craft router trace to CRAFT_ROUTER events ([43726581](https://github.com/craft-ts/craft-ts/commit/43726581))
- move remaining Angular islands and restore TestBed tests ([b10e83e3](https://github.com/craft-ts/craft-ts/commit/b10e83e3))
- close Angular island cut without runtime require ([73df561d](https://github.com/craft-ts/craft-ts/commit/73df561d))
- restore DestroyRef on the Angular island ([d98612f9](https://github.com/craft-ts/craft-ts/commit/d98612f9))
- restore lib typecheck, CI coverage, and router contracts ([11b78e6e](https://github.com/craft-ts/craft-ts/commit/11b78e6e))
- keep TestBed remainder off CI until ngc is green ([8b581470](https://github.com/craft-ts/craft-ts/commit/8b581470))
- import CraftPendingComponentHost from @craft-ng/angular ([7fd880ee](https://github.com/craft-ts/craft-ts/commit/7fd880ee))
- treat Angular injection context as in-context for craftEffect ([c0fe4242](https://github.com/craft-ts/craft-ts/commit/c0fe4242))
- survive a destroyed Angular host injector and load templates as text ([7dba1804](https://github.com/craft-ts/craft-ts/commit/7dba1804))
- break the core<->angular build cycle and restore the interpreter suite ([56390ed6](https://github.com/craft-ts/craft-ts/commit/56390ed6))
- build both packages without Angular in the output ([c0fd44c7](https://github.com/craft-ts/craft-ts/commit/c0fd44c7))
- typecheck the demo cleanly ([820abcab](https://github.com/craft-ts/craft-ts/commit/820abcab))
- make a bound <select> show the value it is bound to ([ad110b12](https://github.com/craft-ts/craft-ts/commit/ad110b12))
- keep server function demo dependency free ([3e1b1b8b](https://github.com/craft-ts/craft-ts/commit/3e1b1b8b))
- support first publication after package rename ([aa8e9782](https://github.com/craft-ts/craft-ts/commit/aa8e9782))
- make demo release sync idempotent ([edcd82be](https://github.com/craft-ts/craft-ts/commit/edcd82be))
- push release commits before publishing ([a391b5ee](https://github.com/craft-ts/craft-ts/commit/a391b5ee))
- stabilize release validation ([caac4c93](https://github.com/craft-ts/craft-ts/commit/caac4c93))
- resume partial package releases ([72cf096b](https://github.com/craft-ts/craft-ts/commit/72cf096b))
- **component:** let a pendingBlock survive a synchronous suspension ([428603f0](https://github.com/craft-ts/craft-ts/commit/428603f0))
- **core:** keep the persister independent of effect timing ([aae62441](https://github.com/craft-ts/craft-ts/commit/aae62441))
- **core:** keep sibling dependency maps when a primitive has none ([7f30357c](https://github.com/craft-ts/craft-ts/commit/7f30357c))
- **correlation-id:** stop every binding from depending on the correlation id ([eda8dceb](https://github.com/craft-ts/craft-ts/commit/eda8dceb))
- **demo:** give the pagination demos the boundary they were missing ([d16e4d9c](https://github.com/craft-ts/craft-ts/commit/d16e4d9c))
- **demo:** restore the btn class on the pagination buttons ([b287029b](https://github.com/craft-ts/craft-ts/commit/b287029b))
- **demo:** pass direct yieldable callback lint ([b7784800](https://github.com/craft-ts/craft-ts/commit/b7784800))
- **effect:** route httpDeps were silently empty after the scope rename ([b8adf791](https://github.com/craft-ts/craft-ts/commit/b8adf791))
- **effect:** six more silently-broken type positions, found by sweeping ([1149e617](https://github.com/craft-ts/craft-ts/commit/1149e617))
- **effect:** merge main, and purge the old API the compiler could not see ([b1076de2](https://github.com/craft-ts/craft-ts/commit/b1076de2))
- **mutation:** run the loader once per call, on the right params ([e4f1075a](https://github.com/craft-ts/craft-ts/commit/e4f1075a))
- **pagination:** keep the previous rows while the next page loads ([d4b416c5](https://github.com/craft-ts/craft-ts/commit/d4b416c5))
- **pagination:** make `state` agree with the rows on screen ([7e26f84e](https://github.com/craft-ts/craft-ts/commit/7e26f84e))
- **router:** keep the route component alive across a param change ([6d993304](https://github.com/craft-ts/craft-ts/commit/6d993304))
- **signals:** stop alien-signals from overruling craft's own semantics ([5c95e956](https://github.com/craft-ts/craft-ts/commit/5c95e956))
- **signals:** let a self-referential read stay undefined, not throw ([d11dbe6a](https://github.com/craft-ts/craft-ts/commit/d11dbe6a))
- **style:** give the plugin's imports real specifiers ([f9e0d929](https://github.com/craft-ts/craft-ts/commit/f9e0d929))

### 🔥 Performance

- **insert-select:** stop a selected item from depending on the whole collection ([21471f16](https://github.com/craft-ts/craft-ts/commit/21471f16))

### ⚠️  Breaking Changes

- **effect:** land wave 1 — _tag discriminant and providedIn scope  ([d81618e4](https://github.com/craft-ts/craft-ts/commit/d81618e4))
  two public API renames.
    craftException({ code }) -> craftException({ _tag })
    craftService({ scope })  -> craftService({ providedIn })
  Everything the Effect dossier needed is now on one branch: waves 0 through 3,
  finding 0.1-b closed, and the 2.6 scope leak fixed.
  Measured before merging (tools/effect-typecost/bench-wave1.mjs):
    type-check   published build -0.00% instantiations; component specs -0.03%;
                 effect specs -0.04% (marginally CHEAPER, because
                 EffectExceptionOf collapsed from a transposition to the
                 identity once craft adopted _tag). Core specs read +0.89%, but
                 that program carries 32 diagnostics more than its baseline and
                 TypeScript explores further in error recovery — the figure is
                 confounded, not a cost.
    runtime      identical. Discrimination is 6.8 ns/op on both sides; the
                 apparent +7.5% on isCraftException sits inside the reference
                 branch's own noise band (11.9-13.3 ns over three runs).
  MIGRATION HAZARD, and it is not visible in those numbers. `scope ->
  providedIn` fails loudly: the field is required, so every call site errors.
  `code -> _tag` can fail SILENTLY: exception plumbing written as
  `X extends { code: infer C }` or `Extract<X, { readonly code: string }>`
  resolves to `never` instead of erroring. That is how route exhaustiveness
  stayed switched off across several commits here while every library test
  passed. Anyone with generic types over craft exceptions should grep for those
  two shapes before trusting a green build.
  tools/craft-migrate-errors/ ships the codemod that did ~90% of this.
- **effect:** task 1.4 — service scope becomes providedIn  ([f5b19d14](https://github.com/craft-ts/craft-ts/commit/f5b19d14))

### ❤️ Thank You

- Claude Opus 5
- Claude Sonnet 5
- Cursor @cursoragent
- Romain

## 0.7.0-beta.14 (2026-08-26)

### 🚀 Features

- render Craft nodes through a native DOM adapter ([316c7390](https://github.com/craft-ts/craft-ts/commit/316c7390))
- run craftHttpClient on fetch ([97cc30f6](https://github.com/craft-ts/craft-ts/commit/97cc30f6))
- run craft reactivity on alien-signals ([77d2023c](https://github.com/craft-ts/craft-ts/commit/77d2023c))
- replace Angular EnvironmentInjector with CraftInjector ([57ababc6](https://github.com/craft-ts/craft-ts/commit/57ababc6))
- replace Angular Router with a Craft history matcher ([de4b1b85](https://github.com/craft-ts/craft-ts/commit/de4b1b85))
- list reloading page clients so agents can see ghosts ([c1864131](https://github.com/craft-ts/craft-ts/commit/c1864131))
- drop Angular peers from core and ship @craft-ng/angular ([e508a56a](https://github.com/craft-ts/craft-ts/commit/e508a56a))
- delete the Angular island and run the core suite without Angular ([2820439c](https://github.com/craft-ts/craft-ts/commit/2820439c))
- boot, build and serve the demo without Angular ([de1808c8](https://github.com/craft-ts/craft-ts/commit/de1808c8))
- add Effect server function architecture demo ([ef34067e](https://github.com/craft-ts/craft-ts/commit/ef34067e))
- enforce Effect v4 diagnostics ([d4147d7d](https://github.com/craft-ts/craft-ts/commit/d4147d7d))
- detect server functions defined outside *.fn-serveur.ts files ([454e6ef0](https://github.com/craft-ts/craft-ts/commit/454e6ef0))
- add SSR and hydration runtime ([803b66a0](https://github.com/craft-ts/craft-ts/commit/803b66a0))
- pass npm OTP during release ([10b7c4c6](https://github.com/craft-ts/craft-ts/commit/10b7c4c6))
- make craftMiddleware yieldable ([59c24215](https://github.com/craft-ts/craft-ts/commit/59c24215))
- seal level 2 and record the matrix of the design system ([e80bcffc](https://github.com/craft-ts/craft-ts/commit/e80bcffc))
- context obligations that stop the build — wave 3, tasks 23 to 26 ([721d90c0](https://github.com/craft-ts/craft-ts/commit/721d90c0))
- style queries from the CLI and from MCP — wave 4, task 29 ([9d98b496](https://github.com/craft-ts/craft-ts/commit/9d98b496))
- **component:** propagate contract channels through every node ([b489b88b](https://github.com/craft-ts/craft-ts/commit/b489b88b))
- **component:** add scheduled each rendering ([2d7833b5](https://github.com/craft-ts/craft-ts/commit/2d7833b5))
- **core:** carry opaque contract channels through the vnode ([1460885c](https://github.com/craft-ts/craft-ts/commit/1460885c))
- **core:** craftStateMachine ([d6b5a6f5](https://github.com/craft-ts/craft-ts/commit/d6b5a6f5))
- **core:** accept bare transitions without transitionSetup ([04410fcd](https://github.com/craft-ts/craft-ts/commit/04410fcd))
- **core:** addressable primitive registry ([cc4cab6f](https://github.com/craft-ts/craft-ts/commit/cc4cab6f))
- **core:** machine history and back navigation ([da6c755c](https://github.com/craft-ts/craft-ts/commit/da6c755c))
- **core:** persist a machine history across a reload ([58ade6b3](https://github.com/craft-ts/craft-ts/commit/58ade6b3))
- **core:** mark replay writes, and stop poisoning unsettled resources ([2ec0e604](https://github.com/craft-ts/craft-ts/commit/2ec0e604))
- **core:** freeze a resource's params while its value is being restored ([fdaf15f7](https://github.com/craft-ts/craft-ts/commit/fdaf15f7))
- **core:** restore a resource without detaching it from its loader ([6f326bc9](https://github.com/craft-ts/craft-ts/commit/6f326bc9))
- **core:** tell apart hosts that can exist several times ([cace8434](https://github.com/craft-ts/craft-ts/commit/cace8434))
- **core:** do not record a moment identical to the current one ([4b37a5fd](https://github.com/craft-ts/craft-ts/commit/4b37a5fd))
- **demo:** add the yield* Effect example, with a live pump trace ([347aa2df](https://github.com/craft-ts/craft-ts/commit/347aa2df))
- **demo:** profile editor state machine example ([273333c9](https://github.com/craft-ts/craft-ts/commit/273333c9))
- **demo:** history and back navigation on the profile editor ([84e3af6d](https://github.com/craft-ts/craft-ts/commit/84e3af6d))
- **demo:** one state machine per row ([94f743ed](https://github.com/craft-ts/craft-ts/commit/94f743ed))
- **demo:** a mini design system built on @craft-ts/style ([a649c205](https://github.com/craft-ts/craft-ts/commit/a649c205))
- **demo-effect:** route the sync/async members example and unblock syncEffect ([8f134944](https://github.com/craft-ts/craft-ts/commit/8f134944))
- **dev-tools:** prevent colocated craft services and components ([f6ee5d32](https://github.com/craft-ts/craft-ts/commit/f6ee5d32))
- **dev-tools:** extend architecture graph backends ([cd59da6e](https://github.com/craft-ts/craft-ts/commit/cd59da6e))
- **dev-tools:** make craftStateMachine a host in the dependency graph ([8f62caae](https://github.com/craft-ts/craft-ts/commit/8f62caae))
- **dev-tools:** style nodes in the graph, and the predicates over them ([f1d99ed6](https://github.com/craft-ts/craft-ts/commit/f1d99ed6))
- **effect:** wave-0 throwaway prototype — yield* Effect in the craft pump ([cfdbaa49](https://github.com/craft-ts/craft-ts/commit/cfdbaa49))
- **effect:** wave 2 — the @craft-ts/effect bridge, on Effect v4 ([d2697034](https://github.com/craft-ts/craft-ts/commit/d2697034))
- **effect:** wave 3, and close the 2.6 scope leak ([39a4e715](https://github.com/craft-ts/craft-ts/commit/39a4e715))
- **effect:** close finding 0.1-b — Effect errors checked at compile time ([407eb146](https://github.com/craft-ts/craft-ts/commit/407eb146))
- **effect:** task 3.3 — fine dependency-graph edges, completing wave 3 ([0b088eb9](https://github.com/craft-ts/craft-ts/commit/0b088eb9))
- ⚠️  **effect:** task 1.4 — service scope becomes providedIn ([f5b19d14](https://github.com/craft-ts/craft-ts/commit/f5b19d14))
- ⚠️  **effect:** land wave 1 — _tag discriminant and providedIn scope ([d81618e4](https://github.com/craft-ts/craft-ts/commit/d81618e4))
- **effect:** add Effect-aware Craft adapters ([3a037252](https://github.com/craft-ts/craft-ts/commit/3a037252))
- **effect:** add Effect quickstart and adapter boundaries ([395b2880](https://github.com/craft-ts/craft-ts/commit/395b2880))
- **effect:** restrict Effect usage to loaders ([f5fe9d05](https://github.com/craft-ts/craft-ts/commit/f5fe9d05))
- **effect:** computedEffect becomes the Effect counterpart of craftComputed ([0aded2d3](https://github.com/craft-ts/craft-ts/commit/0aded2d3))
- **mcp:** treat architecture tests as the agent graph contract ([e48effa3](https://github.com/craft-ts/craft-ts/commit/e48effa3))
- **server-functions:** client boundary V2 — client middleware, client context, craftHandshake ([ec044d1a](https://github.com/craft-ts/craft-ts/commit/ec044d1a))
- **server-functions:** craftHandshakeMiddleware remplace requireClientDI ([83e1ddd9](https://github.com/craft-ts/craft-ts/commit/83e1ddd9))
- **style:** sketch the design system so the API problems surface now ([ae7e5901](https://github.com/craft-ts/craft-ts/commit/ae7e5901))
- **style:** turn the sketch into the package — wave 1 of the plan ([bf23cdae](https://github.com/craft-ts/craft-ts/commit/bf23cdae))
- **style:** seal level 1 with lint rules and migrate the witness component ([d5a422bd](https://github.com/craft-ts/craft-ts/commit/d5a422bd))
- **style:** the axis vocabulary — wave 2, tasks 12 to 14 ([cc1cb6bc](https://github.com/craft-ts/craft-ts/commit/cc1cb6bc))
- **style:** the axis budget and the branch sum — wave 2 complete ([fd112467](https://github.com/craft-ts/craft-ts/commit/fd112467))
- **style-testing:** the visual matrix — wave 2, tasks 17 to 20 ([92f23fc6](https://github.com/craft-ts/craft-ts/commit/92f23fc6))

### 🩹 Fixes

- stop leaking Angular types from craft public indexes ([1fcc0de6](https://github.com/craft-ts/craft-ts/commit/1fcc0de6))
- keep SignalSource yieldable and HostSignal readonly ([4568fc9a](https://github.com/craft-ts/craft-ts/commit/4568fc9a))
- keep defer interaction listening on non-element parents ([4009ed18](https://github.com/craft-ts/craft-ts/commit/4009ed18))
- preserve HTTP error status and repeated query params ([029955af](https://github.com/craft-ts/craft-ts/commit/029955af))
- connect Craft and Angular reactive graphs ([57a6dead](https://github.com/craft-ts/craft-ts/commit/57a6dead))
- preserve Angular signal consumers during Craft swap ([970da148](https://github.com/craft-ts/craft-ts/commit/970da148))
- retrace mixed Angular and Craft effect graphs ([b3e81262](https://github.com/craft-ts/craft-ts/commit/b3e81262))
- lazy Craft-to-Angular computed invalidation ([032b0a78](https://github.com/craft-ts/craft-ts/commit/032b0a78))
- evaluate craftComputed once per invalidation ([754254a3](https://github.com/craft-ts/craft-ts/commit/754254a3))
- recover thrown craftComputed and restore craftWatch options ([b88138a2](https://github.com/craft-ts/craft-ts/commit/b88138a2))
- restore Angular injection context in host injector run ([c34846c4](https://github.com/craft-ts/craft-ts/commit/c34846c4))
- keep interpreter queries and derived readers live ([7e3ca19c](https://github.com/craft-ts/craft-ts/commit/7e3ca19c))
- destroy linked Craft watches and finish TestBed migration ([d6566282](https://github.com/craft-ts/craft-ts/commit/d6566282))
- destroy linked Craft watches on resource and form eviction ([0e922b43](https://github.com/craft-ts/craft-ts/commit/0e922b43))
- destroy parallel form field state on eviction ([1e6d676f](https://github.com/craft-ts/craft-ts/commit/1e6d676f))
- bind parallel form item injectors to form DestroyRef ([e0cd77c8](https://github.com/craft-ts/craft-ts/commit/e0cd77c8))
- drop the page MCP client card on goodbye, not on every socket close ([8f204b85](https://github.com/craft-ts/craft-ts/commit/8f204b85))
- target the single ready page tab even when a reloading card remains ([c5c34c8b](https://github.com/craft-ts/craft-ts/commit/c5c34c8b))
- assign a new page clientId instead of evicting an already-open tab ([a432f387](https://github.com/craft-ts/craft-ts/commit/a432f387))
- treat a silent page WebSocket as reloading via protocol ping ([e5256f19](https://github.com/craft-ts/craft-ts/commit/e5256f19))
- load lazy route components and keep param signals live ([05d0672d](https://github.com/craft-ts/craft-ts/commit/05d0672d))
- wait for hello/ok, goodbye on tab close, and back off page MCP reconnects ([71ce4d27](https://github.com/craft-ts/craft-ts/commit/71ce4d27))
- resolve loadChildren and flush view transitions synchronously ([afed71f5](https://github.com/craft-ts/craft-ts/commit/afed71f5))
- keep page MCP navigate optional and destroy the badge on stop ([29947f59](https://github.com/craft-ts/craft-ts/commit/29947f59))
- stop stay loops and query remounts on Craft matches ([f64463a6](https://github.com/craft-ts/craft-ts/commit/f64463a6))
- say page targets one ready tab and wire demo navigate for goto ([5827e913](https://github.com/craft-ts/craft-ts/commit/5827e913))
- slice Craft matches per nested outlet depth ([61d43048](https://github.com/craft-ts/craft-ts/commit/61d43048))
- reuse parent outlets and honor Craft redirects ([52a4584b](https://github.com/craft-ts/craft-ts/commit/52a4584b))
- keep in-flight loadComponent across match reuse ([5c6eba9d](https://github.com/craft-ts/craft-ts/commit/5c6eba9d))
- close Craft router seam without Angular Router ([450f979c](https://github.com/craft-ts/craft-ts/commit/450f979c))
- isolate view-transition state and skipLocationChange url ([6ecb805c](https://github.com/craft-ts/craft-ts/commit/6ecb805c))
- clear view-transition state on skip and recover without Angular Router ([2caa38f7](https://github.com/craft-ts/craft-ts/commit/2caa38f7))
- subscribe Craft router trace to CRAFT_ROUTER events ([43726581](https://github.com/craft-ts/craft-ts/commit/43726581))
- move remaining Angular islands and restore TestBed tests ([b10e83e3](https://github.com/craft-ts/craft-ts/commit/b10e83e3))
- close Angular island cut without runtime require ([73df561d](https://github.com/craft-ts/craft-ts/commit/73df561d))
- restore DestroyRef on the Angular island ([d98612f9](https://github.com/craft-ts/craft-ts/commit/d98612f9))
- restore lib typecheck, CI coverage, and router contracts ([11b78e6e](https://github.com/craft-ts/craft-ts/commit/11b78e6e))
- keep TestBed remainder off CI until ngc is green ([8b581470](https://github.com/craft-ts/craft-ts/commit/8b581470))
- import CraftPendingComponentHost from @craft-ng/angular ([7fd880ee](https://github.com/craft-ts/craft-ts/commit/7fd880ee))
- treat Angular injection context as in-context for craftEffect ([c0fe4242](https://github.com/craft-ts/craft-ts/commit/c0fe4242))
- survive a destroyed Angular host injector and load templates as text ([7dba1804](https://github.com/craft-ts/craft-ts/commit/7dba1804))
- break the core<->angular build cycle and restore the interpreter suite ([56390ed6](https://github.com/craft-ts/craft-ts/commit/56390ed6))
- build both packages without Angular in the output ([c0fd44c7](https://github.com/craft-ts/craft-ts/commit/c0fd44c7))
- typecheck the demo cleanly ([820abcab](https://github.com/craft-ts/craft-ts/commit/820abcab))
- make a bound <select> show the value it is bound to ([ad110b12](https://github.com/craft-ts/craft-ts/commit/ad110b12))
- keep server function demo dependency free ([3e1b1b8b](https://github.com/craft-ts/craft-ts/commit/3e1b1b8b))
- support first publication after package rename ([aa8e9782](https://github.com/craft-ts/craft-ts/commit/aa8e9782))
- make demo release sync idempotent ([edcd82be](https://github.com/craft-ts/craft-ts/commit/edcd82be))
- push release commits before publishing ([a391b5ee](https://github.com/craft-ts/craft-ts/commit/a391b5ee))
- stabilize release validation ([caac4c93](https://github.com/craft-ts/craft-ts/commit/caac4c93))
- resume partial package releases ([72cf096b](https://github.com/craft-ts/craft-ts/commit/72cf096b))
- **component:** let a pendingBlock survive a synchronous suspension ([428603f0](https://github.com/craft-ts/craft-ts/commit/428603f0))
- **core:** keep the persister independent of effect timing ([aae62441](https://github.com/craft-ts/craft-ts/commit/aae62441))
- **core:** keep sibling dependency maps when a primitive has none ([7f30357c](https://github.com/craft-ts/craft-ts/commit/7f30357c))
- **correlation-id:** stop every binding from depending on the correlation id ([eda8dceb](https://github.com/craft-ts/craft-ts/commit/eda8dceb))
- **demo:** give the pagination demos the boundary they were missing ([d16e4d9c](https://github.com/craft-ts/craft-ts/commit/d16e4d9c))
- **demo:** restore the btn class on the pagination buttons ([b287029b](https://github.com/craft-ts/craft-ts/commit/b287029b))
- **effect:** route httpDeps were silently empty after the scope rename ([b8adf791](https://github.com/craft-ts/craft-ts/commit/b8adf791))
- **effect:** six more silently-broken type positions, found by sweeping ([1149e617](https://github.com/craft-ts/craft-ts/commit/1149e617))
- **effect:** merge main, and purge the old API the compiler could not see ([b1076de2](https://github.com/craft-ts/craft-ts/commit/b1076de2))
- **mutation:** run the loader once per call, on the right params ([e4f1075a](https://github.com/craft-ts/craft-ts/commit/e4f1075a))
- **pagination:** keep the previous rows while the next page loads ([d4b416c5](https://github.com/craft-ts/craft-ts/commit/d4b416c5))
- **pagination:** make `state` agree with the rows on screen ([7e26f84e](https://github.com/craft-ts/craft-ts/commit/7e26f84e))
- **router:** keep the route component alive across a param change ([6d993304](https://github.com/craft-ts/craft-ts/commit/6d993304))
- **signals:** stop alien-signals from overruling craft's own semantics ([5c95e956](https://github.com/craft-ts/craft-ts/commit/5c95e956))
- **signals:** let a self-referential read stay undefined, not throw ([d11dbe6a](https://github.com/craft-ts/craft-ts/commit/d11dbe6a))
- **style:** give the plugin's imports real specifiers ([f9e0d929](https://github.com/craft-ts/craft-ts/commit/f9e0d929))

### 🔥 Performance

- **insert-select:** stop a selected item from depending on the whole collection ([21471f16](https://github.com/craft-ts/craft-ts/commit/21471f16))

### ⚠️  Breaking Changes

- **effect:** land wave 1 — _tag discriminant and providedIn scope  ([d81618e4](https://github.com/craft-ts/craft-ts/commit/d81618e4))
  two public API renames.
    craftException({ code }) -> craftException({ _tag })
    craftService({ scope })  -> craftService({ providedIn })
  Everything the Effect dossier needed is now on one branch: waves 0 through 3,
  finding 0.1-b closed, and the 2.6 scope leak fixed.
  Measured before merging (tools/effect-typecost/bench-wave1.mjs):
    type-check   published build -0.00% instantiations; component specs -0.03%;
                 effect specs -0.04% (marginally CHEAPER, because
                 EffectExceptionOf collapsed from a transposition to the
                 identity once craft adopted _tag). Core specs read +0.89%, but
                 that program carries 32 diagnostics more than its baseline and
                 TypeScript explores further in error recovery — the figure is
                 confounded, not a cost.
    runtime      identical. Discrimination is 6.8 ns/op on both sides; the
                 apparent +7.5% on isCraftException sits inside the reference
                 branch's own noise band (11.9-13.3 ns over three runs).
  MIGRATION HAZARD, and it is not visible in those numbers. `scope ->
  providedIn` fails loudly: the field is required, so every call site errors.
  `code -> _tag` can fail SILENTLY: exception plumbing written as
  `X extends { code: infer C }` or `Extract<X, { readonly code: string }>`
  resolves to `never` instead of erroring. That is how route exhaustiveness
  stayed switched off across several commits here while every library test
  passed. Anyone with generic types over craft exceptions should grep for those
  two shapes before trusting a green build.
  tools/craft-migrate-errors/ ships the codemod that did ~90% of this.
- **effect:** task 1.4 — service scope becomes providedIn  ([f5b19d14](https://github.com/craft-ts/craft-ts/commit/f5b19d14))

### ❤️ Thank You

- Claude Opus 5
- Claude Sonnet 5
- Cursor @cursoragent
- Romain

## 0.7.0-beta.13 (2026-08-21)

### 🚀 Features

- render Craft nodes through a native DOM adapter ([316c7390](https://github.com/craft-ts/craft-ts/commit/316c7390))
- run craftHttpClient on fetch ([97cc30f6](https://github.com/craft-ts/craft-ts/commit/97cc30f6))
- run craft reactivity on alien-signals ([77d2023c](https://github.com/craft-ts/craft-ts/commit/77d2023c))
- replace Angular EnvironmentInjector with CraftInjector ([57ababc6](https://github.com/craft-ts/craft-ts/commit/57ababc6))
- replace Angular Router with a Craft history matcher ([de4b1b85](https://github.com/craft-ts/craft-ts/commit/de4b1b85))
- list reloading page clients so agents can see ghosts ([c1864131](https://github.com/craft-ts/craft-ts/commit/c1864131))
- drop Angular peers from core and ship @craft-ng/angular ([e508a56a](https://github.com/craft-ts/craft-ts/commit/e508a56a))
- delete the Angular island and run the core suite without Angular ([2820439c](https://github.com/craft-ts/craft-ts/commit/2820439c))
- boot, build and serve the demo without Angular ([de1808c8](https://github.com/craft-ts/craft-ts/commit/de1808c8))
- add Effect server function architecture demo ([ef34067e](https://github.com/craft-ts/craft-ts/commit/ef34067e))
- enforce Effect v4 diagnostics ([d4147d7d](https://github.com/craft-ts/craft-ts/commit/d4147d7d))
- detect server functions defined outside *.fn-serveur.ts files ([454e6ef0](https://github.com/craft-ts/craft-ts/commit/454e6ef0))
- add SSR and hydration runtime ([803b66a0](https://github.com/craft-ts/craft-ts/commit/803b66a0))
- pass npm OTP during release ([10b7c4c6](https://github.com/craft-ts/craft-ts/commit/10b7c4c6))
- **component:** add scheduled each rendering ([2d7833b5](https://github.com/craft-ts/craft-ts/commit/2d7833b5))
- **core:** craftStateMachine ([d6b5a6f5](https://github.com/craft-ts/craft-ts/commit/d6b5a6f5))
- **core:** accept bare transitions without transitionSetup ([04410fcd](https://github.com/craft-ts/craft-ts/commit/04410fcd))
- **core:** addressable primitive registry ([cc4cab6f](https://github.com/craft-ts/craft-ts/commit/cc4cab6f))
- **core:** machine history and back navigation ([da6c755c](https://github.com/craft-ts/craft-ts/commit/da6c755c))
- **core:** persist a machine history across a reload ([58ade6b3](https://github.com/craft-ts/craft-ts/commit/58ade6b3))
- **core:** mark replay writes, and stop poisoning unsettled resources ([2ec0e604](https://github.com/craft-ts/craft-ts/commit/2ec0e604))
- **core:** freeze a resource's params while its value is being restored ([fdaf15f7](https://github.com/craft-ts/craft-ts/commit/fdaf15f7))
- **core:** restore a resource without detaching it from its loader ([6f326bc9](https://github.com/craft-ts/craft-ts/commit/6f326bc9))
- **core:** tell apart hosts that can exist several times ([cace8434](https://github.com/craft-ts/craft-ts/commit/cace8434))
- **core:** do not record a moment identical to the current one ([4b37a5fd](https://github.com/craft-ts/craft-ts/commit/4b37a5fd))
- **demo:** add the yield* Effect example, with a live pump trace ([347aa2df](https://github.com/craft-ts/craft-ts/commit/347aa2df))
- **demo:** profile editor state machine example ([273333c9](https://github.com/craft-ts/craft-ts/commit/273333c9))
- **demo:** history and back navigation on the profile editor ([84e3af6d](https://github.com/craft-ts/craft-ts/commit/84e3af6d))
- **demo:** one state machine per row ([94f743ed](https://github.com/craft-ts/craft-ts/commit/94f743ed))
- **dev-tools:** extend architecture graph backends ([cd59da6e](https://github.com/craft-ts/craft-ts/commit/cd59da6e))
- **dev-tools:** make craftStateMachine a host in the dependency graph ([8f62caae](https://github.com/craft-ts/craft-ts/commit/8f62caae))
- **effect:** wave-0 throwaway prototype — yield* Effect in the craft pump ([cfdbaa49](https://github.com/craft-ts/craft-ts/commit/cfdbaa49))
- **effect:** wave 2 — the @craft-ts/effect bridge, on Effect v4 ([d2697034](https://github.com/craft-ts/craft-ts/commit/d2697034))
- **effect:** wave 3, and close the 2.6 scope leak ([39a4e715](https://github.com/craft-ts/craft-ts/commit/39a4e715))
- **effect:** close finding 0.1-b — Effect errors checked at compile time ([407eb146](https://github.com/craft-ts/craft-ts/commit/407eb146))
- **effect:** task 3.3 — fine dependency-graph edges, completing wave 3 ([0b088eb9](https://github.com/craft-ts/craft-ts/commit/0b088eb9))
- ⚠️  **effect:** task 1.4 — service scope becomes providedIn ([f5b19d14](https://github.com/craft-ts/craft-ts/commit/f5b19d14))
- ⚠️  **effect:** land wave 1 — _tag discriminant and providedIn scope ([d81618e4](https://github.com/craft-ts/craft-ts/commit/d81618e4))
- **effect:** add Effect-aware Craft adapters ([3a037252](https://github.com/craft-ts/craft-ts/commit/3a037252))
- **effect:** add Effect quickstart and adapter boundaries ([395b2880](https://github.com/craft-ts/craft-ts/commit/395b2880))
- **effect:** restrict Effect usage to loaders ([f5fe9d05](https://github.com/craft-ts/craft-ts/commit/f5fe9d05))
- **mcp:** treat architecture tests as the agent graph contract ([e48effa3](https://github.com/craft-ts/craft-ts/commit/e48effa3))
- **server-functions:** client boundary V2 — client middleware, client context, craftHandshake ([ec044d1a](https://github.com/craft-ts/craft-ts/commit/ec044d1a))
- **server-functions:** craftHandshakeMiddleware remplace requireClientDI ([83e1ddd9](https://github.com/craft-ts/craft-ts/commit/83e1ddd9))

### 🩹 Fixes

- stop leaking Angular types from craft public indexes ([1fcc0de6](https://github.com/craft-ts/craft-ts/commit/1fcc0de6))
- keep SignalSource yieldable and HostSignal readonly ([4568fc9a](https://github.com/craft-ts/craft-ts/commit/4568fc9a))
- keep defer interaction listening on non-element parents ([4009ed18](https://github.com/craft-ts/craft-ts/commit/4009ed18))
- preserve HTTP error status and repeated query params ([029955af](https://github.com/craft-ts/craft-ts/commit/029955af))
- connect Craft and Angular reactive graphs ([57a6dead](https://github.com/craft-ts/craft-ts/commit/57a6dead))
- preserve Angular signal consumers during Craft swap ([970da148](https://github.com/craft-ts/craft-ts/commit/970da148))
- retrace mixed Angular and Craft effect graphs ([b3e81262](https://github.com/craft-ts/craft-ts/commit/b3e81262))
- lazy Craft-to-Angular computed invalidation ([032b0a78](https://github.com/craft-ts/craft-ts/commit/032b0a78))
- evaluate craftComputed once per invalidation ([754254a3](https://github.com/craft-ts/craft-ts/commit/754254a3))
- recover thrown craftComputed and restore craftWatch options ([b88138a2](https://github.com/craft-ts/craft-ts/commit/b88138a2))
- restore Angular injection context in host injector run ([c34846c4](https://github.com/craft-ts/craft-ts/commit/c34846c4))
- keep interpreter queries and derived readers live ([7e3ca19c](https://github.com/craft-ts/craft-ts/commit/7e3ca19c))
- destroy linked Craft watches and finish TestBed migration ([d6566282](https://github.com/craft-ts/craft-ts/commit/d6566282))
- destroy linked Craft watches on resource and form eviction ([0e922b43](https://github.com/craft-ts/craft-ts/commit/0e922b43))
- destroy parallel form field state on eviction ([1e6d676f](https://github.com/craft-ts/craft-ts/commit/1e6d676f))
- bind parallel form item injectors to form DestroyRef ([e0cd77c8](https://github.com/craft-ts/craft-ts/commit/e0cd77c8))
- drop the page MCP client card on goodbye, not on every socket close ([8f204b85](https://github.com/craft-ts/craft-ts/commit/8f204b85))
- target the single ready page tab even when a reloading card remains ([c5c34c8b](https://github.com/craft-ts/craft-ts/commit/c5c34c8b))
- assign a new page clientId instead of evicting an already-open tab ([a432f387](https://github.com/craft-ts/craft-ts/commit/a432f387))
- treat a silent page WebSocket as reloading via protocol ping ([e5256f19](https://github.com/craft-ts/craft-ts/commit/e5256f19))
- load lazy route components and keep param signals live ([05d0672d](https://github.com/craft-ts/craft-ts/commit/05d0672d))
- wait for hello/ok, goodbye on tab close, and back off page MCP reconnects ([71ce4d27](https://github.com/craft-ts/craft-ts/commit/71ce4d27))
- resolve loadChildren and flush view transitions synchronously ([afed71f5](https://github.com/craft-ts/craft-ts/commit/afed71f5))
- keep page MCP navigate optional and destroy the badge on stop ([29947f59](https://github.com/craft-ts/craft-ts/commit/29947f59))
- stop stay loops and query remounts on Craft matches ([f64463a6](https://github.com/craft-ts/craft-ts/commit/f64463a6))
- say page targets one ready tab and wire demo navigate for goto ([5827e913](https://github.com/craft-ts/craft-ts/commit/5827e913))
- slice Craft matches per nested outlet depth ([61d43048](https://github.com/craft-ts/craft-ts/commit/61d43048))
- reuse parent outlets and honor Craft redirects ([52a4584b](https://github.com/craft-ts/craft-ts/commit/52a4584b))
- keep in-flight loadComponent across match reuse ([5c6eba9d](https://github.com/craft-ts/craft-ts/commit/5c6eba9d))
- close Craft router seam without Angular Router ([450f979c](https://github.com/craft-ts/craft-ts/commit/450f979c))
- isolate view-transition state and skipLocationChange url ([6ecb805c](https://github.com/craft-ts/craft-ts/commit/6ecb805c))
- clear view-transition state on skip and recover without Angular Router ([2caa38f7](https://github.com/craft-ts/craft-ts/commit/2caa38f7))
- subscribe Craft router trace to CRAFT_ROUTER events ([43726581](https://github.com/craft-ts/craft-ts/commit/43726581))
- move remaining Angular islands and restore TestBed tests ([b10e83e3](https://github.com/craft-ts/craft-ts/commit/b10e83e3))
- close Angular island cut without runtime require ([73df561d](https://github.com/craft-ts/craft-ts/commit/73df561d))
- restore DestroyRef on the Angular island ([d98612f9](https://github.com/craft-ts/craft-ts/commit/d98612f9))
- restore lib typecheck, CI coverage, and router contracts ([11b78e6e](https://github.com/craft-ts/craft-ts/commit/11b78e6e))
- keep TestBed remainder off CI until ngc is green ([8b581470](https://github.com/craft-ts/craft-ts/commit/8b581470))
- import CraftPendingComponentHost from @craft-ng/angular ([7fd880ee](https://github.com/craft-ts/craft-ts/commit/7fd880ee))
- treat Angular injection context as in-context for craftEffect ([c0fe4242](https://github.com/craft-ts/craft-ts/commit/c0fe4242))
- survive a destroyed Angular host injector and load templates as text ([7dba1804](https://github.com/craft-ts/craft-ts/commit/7dba1804))
- break the core<->angular build cycle and restore the interpreter suite ([56390ed6](https://github.com/craft-ts/craft-ts/commit/56390ed6))
- build both packages without Angular in the output ([c0fd44c7](https://github.com/craft-ts/craft-ts/commit/c0fd44c7))
- typecheck the demo cleanly ([820abcab](https://github.com/craft-ts/craft-ts/commit/820abcab))
- make a bound <select> show the value it is bound to ([ad110b12](https://github.com/craft-ts/craft-ts/commit/ad110b12))
- keep server function demo dependency free ([3e1b1b8b](https://github.com/craft-ts/craft-ts/commit/3e1b1b8b))
- support first publication after package rename ([aa8e9782](https://github.com/craft-ts/craft-ts/commit/aa8e9782))
- make demo release sync idempotent ([edcd82be](https://github.com/craft-ts/craft-ts/commit/edcd82be))
- push release commits before publishing ([a391b5ee](https://github.com/craft-ts/craft-ts/commit/a391b5ee))
- **component:** let a pendingNode survive a synchronous suspension ([428603f0](https://github.com/craft-ts/craft-ts/commit/428603f0))
- **core:** keep the persister independent of effect timing ([aae62441](https://github.com/craft-ts/craft-ts/commit/aae62441))
- **core:** keep sibling dependency maps when a primitive has none ([7f30357c](https://github.com/craft-ts/craft-ts/commit/7f30357c))
- **correlation-id:** stop every binding from depending on the correlation id ([eda8dceb](https://github.com/craft-ts/craft-ts/commit/eda8dceb))
- **demo:** give the pagination demos the boundary they were missing ([d16e4d9c](https://github.com/craft-ts/craft-ts/commit/d16e4d9c))
- **demo:** restore the btn class on the pagination buttons ([b287029b](https://github.com/craft-ts/craft-ts/commit/b287029b))
- **effect:** route httpDeps were silently empty after the scope rename ([b8adf791](https://github.com/craft-ts/craft-ts/commit/b8adf791))
- **effect:** six more silently-broken type positions, found by sweeping ([1149e617](https://github.com/craft-ts/craft-ts/commit/1149e617))
- **effect:** merge main, and purge the old API the compiler could not see ([b1076de2](https://github.com/craft-ts/craft-ts/commit/b1076de2))
- **mutation:** run the loader once per call, on the right params ([e4f1075a](https://github.com/craft-ts/craft-ts/commit/e4f1075a))
- **pagination:** keep the previous rows while the next page loads ([d4b416c5](https://github.com/craft-ts/craft-ts/commit/d4b416c5))
- **pagination:** make `state` agree with the rows on screen ([7e26f84e](https://github.com/craft-ts/craft-ts/commit/7e26f84e))
- **router:** keep the route component alive across a param change ([6d993304](https://github.com/craft-ts/craft-ts/commit/6d993304))
- **signals:** stop alien-signals from overruling craft's own semantics ([5c95e956](https://github.com/craft-ts/craft-ts/commit/5c95e956))
- **signals:** let a self-referential read stay undefined, not throw ([d11dbe6a](https://github.com/craft-ts/craft-ts/commit/d11dbe6a))

### 🔥 Performance

- **insert-select:** stop a selected item from depending on the whole collection ([21471f16](https://github.com/craft-ts/craft-ts/commit/21471f16))

### ⚠️  Breaking Changes

- **effect:** land wave 1 — _tag discriminant and providedIn scope  ([d81618e4](https://github.com/craft-ts/craft-ts/commit/d81618e4))
  two public API renames.
    craftException({ code }) -> craftException({ _tag })
    craftService({ scope })  -> craftService({ providedIn })
  Everything the Effect dossier needed is now on one branch: waves 0 through 3,
  finding 0.1-b closed, and the 2.6 scope leak fixed.
  Measured before merging (tools/effect-typecost/bench-wave1.mjs):
    type-check   published build -0.00% instantiations; component specs -0.03%;
                 effect specs -0.04% (marginally CHEAPER, because
                 EffectExceptionOf collapsed from a transposition to the
                 identity once craft adopted _tag). Core specs read +0.89%, but
                 that program carries 32 diagnostics more than its baseline and
                 TypeScript explores further in error recovery — the figure is
                 confounded, not a cost.
    runtime      identical. Discrimination is 6.8 ns/op on both sides; the
                 apparent +7.5% on isCraftException sits inside the reference
                 branch's own noise band (11.9-13.3 ns over three runs).
  MIGRATION HAZARD, and it is not visible in those numbers. `scope ->
  providedIn` fails loudly: the field is required, so every call site errors.
  `code -> _tag` can fail SILENTLY: exception plumbing written as
  `X extends { code: infer C }` or `Extract<X, { readonly code: string }>`
  resolves to `never` instead of erroring. That is how route exhaustiveness
  stayed switched off across several commits here while every library test
  passed. Anyone with generic types over craft exceptions should grep for those
  two shapes before trusting a green build.
  tools/craft-migrate-errors/ ships the codemod that did ~90% of this.
- **effect:** task 1.4 — service scope becomes providedIn  ([f5b19d14](https://github.com/craft-ts/craft-ts/commit/f5b19d14))

### ❤️ Thank You

- Claude Opus 5
- Claude Sonnet 5
- Cursor @cursoragent
- Romain

## 0.7.0-beta.12 (2026-08-21)

### 🚀 Features

- render Craft nodes through a native DOM adapter ([316c7390](https://github.com/craft-ts/craft-ts/commit/316c7390))
- run craftHttpClient on fetch ([97cc30f6](https://github.com/craft-ts/craft-ts/commit/97cc30f6))
- run craft reactivity on alien-signals ([77d2023c](https://github.com/craft-ts/craft-ts/commit/77d2023c))
- replace Angular EnvironmentInjector with CraftInjector ([57ababc6](https://github.com/craft-ts/craft-ts/commit/57ababc6))
- replace Angular Router with a Craft history matcher ([de4b1b85](https://github.com/craft-ts/craft-ts/commit/de4b1b85))
- list reloading page clients so agents can see ghosts ([c1864131](https://github.com/craft-ts/craft-ts/commit/c1864131))
- drop Angular peers from core and ship @craft-ng/angular ([e508a56a](https://github.com/craft-ts/craft-ts/commit/e508a56a))
- delete the Angular island and run the core suite without Angular ([2820439c](https://github.com/craft-ts/craft-ts/commit/2820439c))
- boot, build and serve the demo without Angular ([de1808c8](https://github.com/craft-ts/craft-ts/commit/de1808c8))
- add Effect server function architecture demo ([ef34067e](https://github.com/craft-ts/craft-ts/commit/ef34067e))
- enforce Effect v4 diagnostics ([d4147d7d](https://github.com/craft-ts/craft-ts/commit/d4147d7d))
- detect server functions defined outside *.fn-serveur.ts files ([454e6ef0](https://github.com/craft-ts/craft-ts/commit/454e6ef0))
- add SSR and hydration runtime ([803b66a0](https://github.com/craft-ts/craft-ts/commit/803b66a0))
- pass npm OTP during release ([10b7c4c6](https://github.com/craft-ts/craft-ts/commit/10b7c4c6))
- **component:** add scheduled each rendering ([2d7833b5](https://github.com/craft-ts/craft-ts/commit/2d7833b5))
- **core:** craftStateMachine ([d6b5a6f5](https://github.com/craft-ts/craft-ts/commit/d6b5a6f5))
- **core:** accept bare transitions without transitionSetup ([04410fcd](https://github.com/craft-ts/craft-ts/commit/04410fcd))
- **core:** addressable primitive registry ([cc4cab6f](https://github.com/craft-ts/craft-ts/commit/cc4cab6f))
- **core:** machine history and back navigation ([da6c755c](https://github.com/craft-ts/craft-ts/commit/da6c755c))
- **core:** persist a machine history across a reload ([58ade6b3](https://github.com/craft-ts/craft-ts/commit/58ade6b3))
- **core:** mark replay writes, and stop poisoning unsettled resources ([2ec0e604](https://github.com/craft-ts/craft-ts/commit/2ec0e604))
- **core:** freeze a resource's params while its value is being restored ([fdaf15f7](https://github.com/craft-ts/craft-ts/commit/fdaf15f7))
- **core:** restore a resource without detaching it from its loader ([6f326bc9](https://github.com/craft-ts/craft-ts/commit/6f326bc9))
- **core:** tell apart hosts that can exist several times ([cace8434](https://github.com/craft-ts/craft-ts/commit/cace8434))
- **core:** do not record a moment identical to the current one ([4b37a5fd](https://github.com/craft-ts/craft-ts/commit/4b37a5fd))
- **demo:** add the yield* Effect example, with a live pump trace ([347aa2df](https://github.com/craft-ts/craft-ts/commit/347aa2df))
- **demo:** profile editor state machine example ([273333c9](https://github.com/craft-ts/craft-ts/commit/273333c9))
- **demo:** history and back navigation on the profile editor ([84e3af6d](https://github.com/craft-ts/craft-ts/commit/84e3af6d))
- **demo:** one state machine per row ([94f743ed](https://github.com/craft-ts/craft-ts/commit/94f743ed))
- **dev-tools:** extend architecture graph backends ([cd59da6e](https://github.com/craft-ts/craft-ts/commit/cd59da6e))
- **dev-tools:** make craftStateMachine a host in the dependency graph ([8f62caae](https://github.com/craft-ts/craft-ts/commit/8f62caae))
- **effect:** wave-0 throwaway prototype — yield* Effect in the craft pump ([cfdbaa49](https://github.com/craft-ts/craft-ts/commit/cfdbaa49))
- **effect:** wave 2 — the @craft-ts/effect bridge, on Effect v4 ([d2697034](https://github.com/craft-ts/craft-ts/commit/d2697034))
- **effect:** wave 3, and close the 2.6 scope leak ([39a4e715](https://github.com/craft-ts/craft-ts/commit/39a4e715))
- **effect:** close finding 0.1-b — Effect errors checked at compile time ([407eb146](https://github.com/craft-ts/craft-ts/commit/407eb146))
- **effect:** task 3.3 — fine dependency-graph edges, completing wave 3 ([0b088eb9](https://github.com/craft-ts/craft-ts/commit/0b088eb9))
- ⚠️  **effect:** task 1.4 — service scope becomes providedIn ([f5b19d14](https://github.com/craft-ts/craft-ts/commit/f5b19d14))
- ⚠️  **effect:** land wave 1 — _tag discriminant and providedIn scope ([d81618e4](https://github.com/craft-ts/craft-ts/commit/d81618e4))
- **effect:** add Effect-aware Craft adapters ([3a037252](https://github.com/craft-ts/craft-ts/commit/3a037252))
- **effect:** add Effect quickstart and adapter boundaries ([395b2880](https://github.com/craft-ts/craft-ts/commit/395b2880))
- **effect:** restrict Effect usage to loaders ([f5fe9d05](https://github.com/craft-ts/craft-ts/commit/f5fe9d05))
- **mcp:** treat architecture tests as the agent graph contract ([e48effa3](https://github.com/craft-ts/craft-ts/commit/e48effa3))
- **server-functions:** client boundary V2 — client middleware, client context, craftHandshake ([ec044d1a](https://github.com/craft-ts/craft-ts/commit/ec044d1a))
- **server-functions:** craftHandshakeMiddleware remplace requireClientDI ([83e1ddd9](https://github.com/craft-ts/craft-ts/commit/83e1ddd9))

### 🩹 Fixes

- stop leaking Angular types from craft public indexes ([1fcc0de6](https://github.com/craft-ts/craft-ts/commit/1fcc0de6))
- keep SignalSource yieldable and HostSignal readonly ([4568fc9a](https://github.com/craft-ts/craft-ts/commit/4568fc9a))
- keep defer interaction listening on non-element parents ([4009ed18](https://github.com/craft-ts/craft-ts/commit/4009ed18))
- preserve HTTP error status and repeated query params ([029955af](https://github.com/craft-ts/craft-ts/commit/029955af))
- connect Craft and Angular reactive graphs ([57a6dead](https://github.com/craft-ts/craft-ts/commit/57a6dead))
- preserve Angular signal consumers during Craft swap ([970da148](https://github.com/craft-ts/craft-ts/commit/970da148))
- retrace mixed Angular and Craft effect graphs ([b3e81262](https://github.com/craft-ts/craft-ts/commit/b3e81262))
- lazy Craft-to-Angular computed invalidation ([032b0a78](https://github.com/craft-ts/craft-ts/commit/032b0a78))
- evaluate craftComputed once per invalidation ([754254a3](https://github.com/craft-ts/craft-ts/commit/754254a3))
- recover thrown craftComputed and restore craftWatch options ([b88138a2](https://github.com/craft-ts/craft-ts/commit/b88138a2))
- restore Angular injection context in host injector run ([c34846c4](https://github.com/craft-ts/craft-ts/commit/c34846c4))
- keep interpreter queries and derived readers live ([7e3ca19c](https://github.com/craft-ts/craft-ts/commit/7e3ca19c))
- destroy linked Craft watches and finish TestBed migration ([d6566282](https://github.com/craft-ts/craft-ts/commit/d6566282))
- destroy linked Craft watches on resource and form eviction ([0e922b43](https://github.com/craft-ts/craft-ts/commit/0e922b43))
- destroy parallel form field state on eviction ([1e6d676f](https://github.com/craft-ts/craft-ts/commit/1e6d676f))
- bind parallel form item injectors to form DestroyRef ([e0cd77c8](https://github.com/craft-ts/craft-ts/commit/e0cd77c8))
- drop the page MCP client card on goodbye, not on every socket close ([8f204b85](https://github.com/craft-ts/craft-ts/commit/8f204b85))
- target the single ready page tab even when a reloading card remains ([c5c34c8b](https://github.com/craft-ts/craft-ts/commit/c5c34c8b))
- assign a new page clientId instead of evicting an already-open tab ([a432f387](https://github.com/craft-ts/craft-ts/commit/a432f387))
- treat a silent page WebSocket as reloading via protocol ping ([e5256f19](https://github.com/craft-ts/craft-ts/commit/e5256f19))
- load lazy route components and keep param signals live ([05d0672d](https://github.com/craft-ts/craft-ts/commit/05d0672d))
- wait for hello/ok, goodbye on tab close, and back off page MCP reconnects ([71ce4d27](https://github.com/craft-ts/craft-ts/commit/71ce4d27))
- resolve loadChildren and flush view transitions synchronously ([afed71f5](https://github.com/craft-ts/craft-ts/commit/afed71f5))
- keep page MCP navigate optional and destroy the badge on stop ([29947f59](https://github.com/craft-ts/craft-ts/commit/29947f59))
- stop stay loops and query remounts on Craft matches ([f64463a6](https://github.com/craft-ts/craft-ts/commit/f64463a6))
- say page targets one ready tab and wire demo navigate for goto ([5827e913](https://github.com/craft-ts/craft-ts/commit/5827e913))
- slice Craft matches per nested outlet depth ([61d43048](https://github.com/craft-ts/craft-ts/commit/61d43048))
- reuse parent outlets and honor Craft redirects ([52a4584b](https://github.com/craft-ts/craft-ts/commit/52a4584b))
- keep in-flight loadComponent across match reuse ([5c6eba9d](https://github.com/craft-ts/craft-ts/commit/5c6eba9d))
- close Craft router seam without Angular Router ([450f979c](https://github.com/craft-ts/craft-ts/commit/450f979c))
- isolate view-transition state and skipLocationChange url ([6ecb805c](https://github.com/craft-ts/craft-ts/commit/6ecb805c))
- clear view-transition state on skip and recover without Angular Router ([2caa38f7](https://github.com/craft-ts/craft-ts/commit/2caa38f7))
- subscribe Craft router trace to CRAFT_ROUTER events ([43726581](https://github.com/craft-ts/craft-ts/commit/43726581))
- move remaining Angular islands and restore TestBed tests ([b10e83e3](https://github.com/craft-ts/craft-ts/commit/b10e83e3))
- close Angular island cut without runtime require ([73df561d](https://github.com/craft-ts/craft-ts/commit/73df561d))
- restore DestroyRef on the Angular island ([d98612f9](https://github.com/craft-ts/craft-ts/commit/d98612f9))
- restore lib typecheck, CI coverage, and router contracts ([11b78e6e](https://github.com/craft-ts/craft-ts/commit/11b78e6e))
- keep TestBed remainder off CI until ngc is green ([8b581470](https://github.com/craft-ts/craft-ts/commit/8b581470))
- import CraftPendingComponentHost from @craft-ng/angular ([7fd880ee](https://github.com/craft-ts/craft-ts/commit/7fd880ee))
- treat Angular injection context as in-context for craftEffect ([c0fe4242](https://github.com/craft-ts/craft-ts/commit/c0fe4242))
- survive a destroyed Angular host injector and load templates as text ([7dba1804](https://github.com/craft-ts/craft-ts/commit/7dba1804))
- break the core<->angular build cycle and restore the interpreter suite ([56390ed6](https://github.com/craft-ts/craft-ts/commit/56390ed6))
- build both packages without Angular in the output ([c0fd44c7](https://github.com/craft-ts/craft-ts/commit/c0fd44c7))
- typecheck the demo cleanly ([820abcab](https://github.com/craft-ts/craft-ts/commit/820abcab))
- make a bound <select> show the value it is bound to ([ad110b12](https://github.com/craft-ts/craft-ts/commit/ad110b12))
- keep server function demo dependency free ([3e1b1b8b](https://github.com/craft-ts/craft-ts/commit/3e1b1b8b))
- support first publication after package rename ([aa8e9782](https://github.com/craft-ts/craft-ts/commit/aa8e9782))
- make demo release sync idempotent ([edcd82be](https://github.com/craft-ts/craft-ts/commit/edcd82be))
- **component:** let a pendingNode survive a synchronous suspension ([428603f0](https://github.com/craft-ts/craft-ts/commit/428603f0))
- **core:** keep the persister independent of effect timing ([aae62441](https://github.com/craft-ts/craft-ts/commit/aae62441))
- **core:** keep sibling dependency maps when a primitive has none ([7f30357c](https://github.com/craft-ts/craft-ts/commit/7f30357c))
- **correlation-id:** stop every binding from depending on the correlation id ([eda8dceb](https://github.com/craft-ts/craft-ts/commit/eda8dceb))
- **demo:** give the pagination demos the boundary they were missing ([d16e4d9c](https://github.com/craft-ts/craft-ts/commit/d16e4d9c))
- **demo:** restore the btn class on the pagination buttons ([b287029b](https://github.com/craft-ts/craft-ts/commit/b287029b))
- **effect:** route httpDeps were silently empty after the scope rename ([b8adf791](https://github.com/craft-ts/craft-ts/commit/b8adf791))
- **effect:** six more silently-broken type positions, found by sweeping ([1149e617](https://github.com/craft-ts/craft-ts/commit/1149e617))
- **effect:** merge main, and purge the old API the compiler could not see ([b1076de2](https://github.com/craft-ts/craft-ts/commit/b1076de2))
- **mutation:** run the loader once per call, on the right params ([e4f1075a](https://github.com/craft-ts/craft-ts/commit/e4f1075a))
- **pagination:** keep the previous rows while the next page loads ([d4b416c5](https://github.com/craft-ts/craft-ts/commit/d4b416c5))
- **pagination:** make `state` agree with the rows on screen ([7e26f84e](https://github.com/craft-ts/craft-ts/commit/7e26f84e))
- **router:** keep the route component alive across a param change ([6d993304](https://github.com/craft-ts/craft-ts/commit/6d993304))
- **signals:** stop alien-signals from overruling craft's own semantics ([5c95e956](https://github.com/craft-ts/craft-ts/commit/5c95e956))
- **signals:** let a self-referential read stay undefined, not throw ([d11dbe6a](https://github.com/craft-ts/craft-ts/commit/d11dbe6a))

### 🔥 Performance

- **insert-select:** stop a selected item from depending on the whole collection ([21471f16](https://github.com/craft-ts/craft-ts/commit/21471f16))

### ⚠️  Breaking Changes

- **effect:** land wave 1 — _tag discriminant and providedIn scope  ([d81618e4](https://github.com/craft-ts/craft-ts/commit/d81618e4))
  two public API renames.
    craftException({ code }) -> craftException({ _tag })
    craftService({ scope })  -> craftService({ providedIn })
  Everything the Effect dossier needed is now on one branch: waves 0 through 3,
  finding 0.1-b closed, and the 2.6 scope leak fixed.
  Measured before merging (tools/effect-typecost/bench-wave1.mjs):
    type-check   published build -0.00% instantiations; component specs -0.03%;
                 effect specs -0.04% (marginally CHEAPER, because
                 EffectExceptionOf collapsed from a transposition to the
                 identity once craft adopted _tag). Core specs read +0.89%, but
                 that program carries 32 diagnostics more than its baseline and
                 TypeScript explores further in error recovery — the figure is
                 confounded, not a cost.
    runtime      identical. Discrimination is 6.8 ns/op on both sides; the
                 apparent +7.5% on isCraftException sits inside the reference
                 branch's own noise band (11.9-13.3 ns over three runs).
  MIGRATION HAZARD, and it is not visible in those numbers. `scope ->
  providedIn` fails loudly: the field is required, so every call site errors.
  `code -> _tag` can fail SILENTLY: exception plumbing written as
  `X extends { code: infer C }` or `Extract<X, { readonly code: string }>`
  resolves to `never` instead of erroring. That is how route exhaustiveness
  stayed switched off across several commits here while every library test
  passed. Anyone with generic types over craft exceptions should grep for those
  two shapes before trusting a green build.
  tools/craft-migrate-errors/ ships the codemod that did ~90% of this.
- **effect:** task 1.4 — service scope becomes providedIn  ([f5b19d14](https://github.com/craft-ts/craft-ts/commit/f5b19d14))

### ❤️ Thank You

- Claude Opus 5
- Claude Sonnet 5
- Cursor @cursoragent
- Romain

## 0.7.0-beta.11 (2026-08-15)

### 🚀 Features

- **mcp:** ship a consumer MCP server, Agent Skills, and llms.txt ([690579d](https://github.com/craft-ts/craft-ts/commit/690579d))

### 🩹 Fixes

- **release:** version @craft-ts/mcp from its package.json ([f56c276](https://github.com/craft-ts/craft-ts/commit/f56c276))
- **release:** allow package-lock.json in the version bump ([bde68e9](https://github.com/craft-ts/craft-ts/commit/bde68e9))
- **release:** pack @craft-ts/mcp from an absolute path ([f112973](https://github.com/craft-ts/craft-ts/commit/f112973))

### ❤️ Thank You

- Cursor @cursoragent
- Romain

## 0.7.0-beta.10 (2026-08-15)

### 🩹 Fixes

- **component:** keep DOM listeners across patches and inherit parent route props ([51d1ae7](https://github.com/craft-ts/craft-ts/commit/51d1ae7))

### ❤️ Thank You

- Cursor @cursoragent
- Romain

## 0.7.0-beta.9 (2026-08-15)

### 🚀 Features

- **component:** add fieldControl a11y prop bundles ([0b24c02](https://github.com/craft-ts/craft-ts/commit/0b24c02))
- **component:** add disclosureControl ARIA linking ([c775e33](https://github.com/craft-ts/craft-ts/commit/c775e33))
- **component:** add buttonControl with opt-in keepFocusable ([27f80e6](https://github.com/craft-ts/craft-ts/commit/27f80e6))
- **component:** keep liveRegion mounted as an optional landmark ([db7403e](https://github.com/craft-ts/craft-ts/commit/db7403e))
- **component:** add getByRole and getByLabel template queries ([d0aacf4](https://github.com/craft-ts/craft-ts/commit/d0aacf4))
- **component:** add clickFocus for gesture-sync focusing ([410cf00](https://github.com/craft-ts/craft-ts/commit/410cf00))
- **core:** sync document lang and dir through BrowserDocument ([b65847b](https://github.com/craft-ts/craft-ts/commit/b65847b))

### 🩹 Fixes

- **component:** serialize htmlFor and boolean aria attributes ([2ddc6c2](https://github.com/craft-ts/craft-ts/commit/2ddc6c2))
- **component:** serialize boolean false on aria attributes ([594fc43](https://github.com/craft-ts/craft-ts/commit/594fc43))
- **component:** treat an explicit empty liveRegion label as provided ([1b6d4c1](https://github.com/craft-ts/craft-ts/commit/1b6d4c1))
- **component:** tighten getByRole errors and accessible names ([450eb2d](https://github.com/craft-ts/craft-ts/commit/450eb2d))
- **component:** restore RegExp lastIndex after getByRole name match ([85df08f](https://github.com/craft-ts/craft-ts/commit/85df08f))
- **component:** hide closed disclosure panels and clear label htmlFor ([5f04420](https://github.com/craft-ts/craft-ts/commit/5f04420))
- **core:** yield insertion state reads and writes ([83c9a18](https://github.com/craft-ts/craft-ts/commit/83c9a18))
- **core:** attach runtime meta to abstract inject helpers ([aeb0dc2](https://github.com/craft-ts/craft-ts/commit/aeb0dc2))

### ❤️ Thank You

- Cursor @cursoragent
- Romain

## 0.7.0-beta.8 (2026-08-13)

This was a version bump only, there were no code changes.

## 0.7.0-beta.7 (2026-08-13)

### 🚀 Features

- **component:** CSS variables contract for craft components ([dc6d2e8](https://github.com/craft-ts/craft-ts/commit/dc6d2e8))
- **component:** settledValue + pendingNode, type-safe suspension ([15a77ab](https://github.com/craft-ts/craft-ts/commit/15a77ab))
- **component:** pendingNode reloading slot, and reliable boundary recovery ([7dbf767](https://github.com/craft-ts/craft-ts/commit/7dbf767))

### ❤️ Thank You

- Claude Opus 5
- Romain

## 0.7.0-beta.6 (2026-08-12)

### 🚀 Features

- **forms:** support composed field insertions ([9dff8d8](https://github.com/craft-ts/craft-ts/commit/9dff8d8))
- **forms:** enforce grouped exception handling ([d807b88](https://github.com/craft-ts/craft-ts/commit/d807b88))

### ❤️ Thank You

- Romain

## 0.7.0-beta.5 (2026-08-11)

This was a version bump only, there were no code changes.

## 0.7.0-beta.4 (2026-08-11)

### 🩹 Fixes

- **release:** disable target log forwarding ([d34036b](https://github.com/craft-ts/craft-ts/commit/d34036b))

### ❤️ Thank You

- Romain

## 0.7.0-beta.3 (2026-08-11)

### 🩹 Fixes

- **release:** keep correlation tracking disabled in target ([72c35d8](https://github.com/craft-ts/craft-ts/commit/72c35d8))

### ❤️ Thank You

- Romain

## 0.7.0-beta.2 (2026-08-11)

### 🚀 Features

- add yieldable template contracts ([da8ebf1](https://github.com/craft-ts/craft-ts/commit/da8ebf1))
- add fine-grained component reactivity ([31c1a78](https://github.com/craft-ts/craft-ts/commit/31c1a78))
- **component:** merge component host properties ([099883b](https://github.com/craft-ts/craft-ts/commit/099883b))
- **component:** infer Angular directive inputs from node props ([50546af](https://github.com/craft-ts/craft-ts/commit/50546af))
- **component:** support configured Angular directive pipes ([e1076eb](https://github.com/craft-ts/craft-ts/commit/e1076eb))
- **component:** add scoped style registry and customization docs ([55f6432](https://github.com/craft-ts/craft-ts/commit/55f6432))
- **core:** add craftLazy for lazy service imports; rename untilSettled → craftUntilSettled ([c23c616](https://github.com/craft-ts/craft-ts/commit/c23c616))
- **core:** add craftMatch for exhaustive literal-union pattern matching ([1b2197c](https://github.com/craft-ts/craft-ts/commit/1b2197c))
- **core:** add Craft runtime registry ([02181ea](https://github.com/craft-ts/craft-ts/commit/02181ea))
- **core:** add Standard Schema validation primitives ([dfe47a4](https://github.com/craft-ts/craft-ts/commit/dfe47a4))
- **core:** add typed insertion pipes ([79d0ec9](https://github.com/craft-ts/craft-ts/commit/79d0ec9))
- **dev-tools:** add template migration tooling ([5e2ae2e](https://github.com/craft-ts/craft-ts/commit/5e2ae2e))
- **dev-tools:** enforce Craft HTTP transports ([a75157c](https://github.com/craft-ts/craft-ts/commit/a75157c))
- **dev-tools:** forbid Angular input output APIs ([4a37fd9](https://github.com/craft-ts/craft-ts/commit/4a37fd9))
- **dev-tools:** enforce yielded resource triggers ([2c240a8](https://github.com/craft-ts/craft-ts/commit/2c240a8))
- **graph:** polish dependency graph visualization ([fa25d06](https://github.com/craft-ts/craft-ts/commit/fa25d06))
- **release:** actionable git sync errors with fix commands ([e5892e6](https://github.com/craft-ts/craft-ts/commit/e5892e6))
- **routes:** make guarded data yieldable ([dddcd43](https://github.com/craft-ts/craft-ts/commit/dddcd43))
- **tooling:** add local log server and logs MCP server ([70849b6](https://github.com/craft-ts/craft-ts/commit/70849b6))

### 🩹 Fixes

- preserve demo template input state ([29efc15](https://github.com/craft-ts/craft-ts/commit/29efc15))
- **component:** accept literal element nodes ([28c7520](https://github.com/craft-ts/craft-ts/commit/28c7520))
- **demo:** use craft query status type ([c79a51d](https://github.com/craft-ts/craft-ts/commit/c79a51d))
- **demo:** keep app start callback synchronous ([c2939da](https://github.com/craft-ts/craft-ts/commit/c2939da))
- **release:** sync internal dependencies and demo tooling ([812fd0e](https://github.com/craft-ts/craft-ts/commit/812fd0e))

### ❤️ Thank You

- Claude
- Claude Opus 4.8
- Romain

## 0.7.0-beta.1 (2026-08-11)

### 🚀 Features

- add yieldable template contracts ([da8ebf1](https://github.com/craft-ts/craft-ts/commit/da8ebf1))
- add fine-grained component reactivity ([31c1a78](https://github.com/craft-ts/craft-ts/commit/31c1a78))
- **component:** merge component host properties ([099883b](https://github.com/craft-ts/craft-ts/commit/099883b))
- **component:** infer Angular directive inputs from node props ([50546af](https://github.com/craft-ts/craft-ts/commit/50546af))
- **component:** support configured Angular directive pipes ([e1076eb](https://github.com/craft-ts/craft-ts/commit/e1076eb))
- **component:** add scoped style registry and customization docs ([55f6432](https://github.com/craft-ts/craft-ts/commit/55f6432))
- **core:** add craftLazy for lazy service imports; rename untilSettled → craftUntilSettled ([c23c616](https://github.com/craft-ts/craft-ts/commit/c23c616))
- **core:** add craftMatch for exhaustive literal-union pattern matching ([1b2197c](https://github.com/craft-ts/craft-ts/commit/1b2197c))
- **core:** add Craft runtime registry ([02181ea](https://github.com/craft-ts/craft-ts/commit/02181ea))
- **core:** add Standard Schema validation primitives ([dfe47a4](https://github.com/craft-ts/craft-ts/commit/dfe47a4))
- **core:** add typed insertion pipes ([79d0ec9](https://github.com/craft-ts/craft-ts/commit/79d0ec9))
- **dev-tools:** add template migration tooling ([5e2ae2e](https://github.com/craft-ts/craft-ts/commit/5e2ae2e))
- **dev-tools:** enforce Craft HTTP transports ([a75157c](https://github.com/craft-ts/craft-ts/commit/a75157c))
- **dev-tools:** forbid Angular input output APIs ([4a37fd9](https://github.com/craft-ts/craft-ts/commit/4a37fd9))
- **dev-tools:** enforce yielded resource triggers ([2c240a8](https://github.com/craft-ts/craft-ts/commit/2c240a8))
- **graph:** polish dependency graph visualization ([fa25d06](https://github.com/craft-ts/craft-ts/commit/fa25d06))
- **release:** actionable git sync errors with fix commands ([e5892e6](https://github.com/craft-ts/craft-ts/commit/e5892e6))
- **routes:** make guarded data yieldable ([dddcd43](https://github.com/craft-ts/craft-ts/commit/dddcd43))
- **tooling:** add local log server and logs MCP server ([70849b6](https://github.com/craft-ts/craft-ts/commit/70849b6))

### 🩹 Fixes

- preserve demo template input state ([29efc15](https://github.com/craft-ts/craft-ts/commit/29efc15))
- **component:** accept literal element nodes ([28c7520](https://github.com/craft-ts/craft-ts/commit/28c7520))
- **demo:** use craft query status type ([c79a51d](https://github.com/craft-ts/craft-ts/commit/c79a51d))
- **release:** sync internal dependencies and demo tooling ([812fd0e](https://github.com/craft-ts/craft-ts/commit/812fd0e))

### ❤️ Thank You

- Claude
- Claude Opus 4.8
- Romain

## 0.6.0-beta.5 (2026-07-27)

### 🚀 Features

- add yieldable template contracts ([da8ebf1](https://github.com/craft-ts/craft-ts/commit/da8ebf1))
- **component:** merge component host properties ([099883b](https://github.com/craft-ts/craft-ts/commit/099883b))
- **component:** infer Angular directive inputs from node props ([50546af](https://github.com/craft-ts/craft-ts/commit/50546af))
- **component:** support configured Angular directive pipes ([e1076eb](https://github.com/craft-ts/craft-ts/commit/e1076eb))
- **component:** add scoped style registry and customization docs ([55f6432](https://github.com/craft-ts/craft-ts/commit/55f6432))
- **core:** add craftLazy for lazy service imports; rename untilSettled → craftUntilSettled ([c23c616](https://github.com/craft-ts/craft-ts/commit/c23c616))
- **core:** add craftMatch for exhaustive literal-union pattern matching ([1b2197c](https://github.com/craft-ts/craft-ts/commit/1b2197c))
- **release:** actionable git sync errors with fix commands ([e5892e6](https://github.com/craft-ts/craft-ts/commit/e5892e6))
- **tooling:** add local log server and logs MCP server ([70849b6](https://github.com/craft-ts/craft-ts/commit/70849b6))

### 🩹 Fixes

- **component:** accept literal element nodes ([28c7520](https://github.com/craft-ts/craft-ts/commit/28c7520))

### ❤️ Thank You

- Claude
- Claude Opus 4.8
- Romain

## 0.6.0-beta.4 (2026-07-23)

### 🚀 Features

- **core:** add craftLazy for lazy service imports; rename untilSettled → craftUntilSettled ([c23c616](https://github.com/craft-ts/craft-ts/commit/c23c616))
- **release:** actionable git sync errors with fix commands ([e5892e6](https://github.com/craft-ts/craft-ts/commit/e5892e6))

### ❤️ Thank You

- Claude Opus 4.8
- Romain

## 0.6.0-beta.2 (2026-07-20)

This was a version bump only, there were no code changes.

## 0.6.0-beta.1 (2026-07-20)

### 🚀 Features

- Enhance craft-service with provided input handling and branded service providers ([e3507f8](https://github.com/craft-ts/craft-ts/commit/e3507f8))
- add demo component for sending context to AI ([296c10e](https://github.com/craft-ts/craft-ts/commit/296c10e))
- add track functionality for dependency management in craftService ([56009ea](https://github.com/craft-ts/craft-ts/commit/56009ea))
- enhance route and service handling with typed providers and yield support ([c36489c](https://github.com/craft-ts/craft-ts/commit/c36489c))
- add route providers documentation and enhance abstract service functionality ([8c3a4db](https://github.com/craft-ts/craft-ts/commit/8c3a4db))
- implement generator-based redirectTo for type-safe dependency tracking in routes ([8223b4e](https://github.com/craft-ts/craft-ts/commit/8223b4e))
- introduce craftGen for reusable generator factories and enhance routing guards ([45e8f39](https://github.com/craft-ts/craft-ts/commit/45e8f39))
- enhance routing guards to support observables and async results ([6b2a770](https://github.com/craft-ts/craft-ts/commit/6b2a770))
- update version to 0.5.1-beta.0 in package.json ([5b2cace](https://github.com/craft-ts/craft-ts/commit/5b2cace))
- add per-file DI checks and ESLint workflow documentation ([f097662](https://github.com/craft-ts/craft-ts/commit/f097662))
- **core:** infrastructure CraftPrimitiveGen + craftUse ([03e2fc6](https://github.com/craft-ts/craft-ts/commit/03e2fc6))
- ⚠️  **core:** state/query/mutation/asyncProcess/queryParam retournent un générateur ([847ae73](https://github.com/craft-ts/craft-ts/commit/847ae73))
- ⚠️  **core:** suppression de track() ([f8780ce](https://github.com/craft-ts/craft-ts/commit/f8780ce))
- **core:** re-run loader on every imperative method call ([d72118d](https://github.com/craft-ts/craft-ts/commit/d72118d))
- **dev-tools:** codemod migrate-primitive-generators ([25c08b7](https://github.com/craft-ts/craft-ts/commit/25c08b7))
- **dev-tools:** règle require-primitive-generator-unwrap + maj des codemods ([3655a7e](https://github.com/craft-ts/craft-ts/commit/3655a7e))
- **forms:** type submit exception rules ([608753c](https://github.com/craft-ts/craft-ts/commit/608753c))
- **release:** add local multi-repo release command ([1ba0436](https://github.com/craft-ts/craft-ts/commit/1ba0436))
- **routes:** implement exhaustive route exception handling and child route mounting checks ([9bb55e5](https://github.com/craft-ts/craft-ts/commit/9bb55e5))

### 🩹 Fixes

- using afterRecomputation with readonly source ([ae220a7](https://github.com/craft-ts/craft-ts/commit/ae220a7))
- improve documentation clarity and correct typos across multiple files ([52859fb](https://github.com/craft-ts/craft-ts/commit/52859fb))
- **release:** install dependencies before local builds ([cd65e34](https://github.com/craft-ts/craft-ts/commit/cd65e34))

### ⚠️  Breaking Changes

- **core:** suppression de track()  ([f8780ce](https://github.com/craft-ts/craft-ts/commit/f8780ce))
- **core:** state/query/mutation/asyncProcess/queryParam retournent un générateur  ([847ae73](https://github.com/craft-ts/craft-ts/commit/847ae73))

### ❤️ Thank You

- Claude Fable 5
- Claude Opus 4.8
- Romain

## 0.1.0 (2026-03-29)

### 🚀 Features

- **core:** extract insert select changes ([6dcca39](https://github.com/craft-ts/craft-ts/commit/6dcca39))
- **exceptions:** add exceptions component and routing ([c3f12df](https://github.com/craft-ts/craft-ts/commit/c3f12df))

### 🩹 Fixes

- **core:** add missing insert-select implementation ([ae8dc4a](https://github.com/craft-ts/craft-ts/commit/ae8dc4a))

### ❤️ Thank You

- Romain

## 0.0.2 (2026-02-13)

### 🚀 Features

- enhance craft state management with detailed documentation and examples ([3125de5](https://github.com/craft-ts/craft-ts/commit/3125de5))
- enhance async methods tests and add detailed documentation for craft store functionality ([63bafe8](https://github.com/craft-ts/craft-ts/commit/63bafe8))
- add entities utilities and backlog documentation ([aff8650](https://github.com/craft-ts/craft-ts/commit/aff8650))
- enhance pagination placeholder data and add utility functions for entity management ([b589378](https://github.com/craft-ts/craft-ts/commit/b589378))
- enhance resource tracking and management in resourceById implementation ([6760d2a](https://github.com/craft-ts/craft-ts/commit/6760d2a))
- add comprehensive planning for 40 LinkedIn posts promoting craft-ts ([f3f0877](https://github.com/craft-ts/craft-ts/commit/f3f0877))

### 🩹 Fixes

- enable scoped store provider in test setup ([b1ecd7b](https://github.com/craft-ts/craft-ts/commit/b1ecd7b))

### ❤️ Thank You

- Romain
