# 8. Test the graph

**Goal:** test Effect programs, their Layers and the Craft boundary without
mocking the whole application.

## Test an Effect service with a partial mock

`mockEffectService` provides a Layer and makes every unstubbed member fail
loudly if the test accidentally uses it:

```typescript
import { Effect } from 'effect';
import { mockEffectService } from '@craft-ts/effect';

const register = {
  AccessPolicyService: mockEffectService(AccessPolicyService, {
    decide: () => Effect.succeed(expectedDecision),
  }),
};
```

For production-like tests, provide the real Layer. For focused tests, stub only
the selected members and let `UnstubbedEffectMember` expose an unexpected read.

## Test the Craft service or component by register

Craft tests still use a register derived from the Craft dependency graph:

```typescript
const { sut } = await setupCraftServiceTestingByRegister(
  AccessDecisionService,
  {
    AccessPolicyService: mockEffectService(AccessPolicyService, {
      decide: () => Effect.succeed(expectedDecision),
    }),
  },
);
```

The exact register also includes regular Craft services, `'real'`,
`'notReached'` or `provideX()` entries when those nodes are reachable. Effect
service mocks cover the Effect side; the Craft register proves the full graph is
accounted for.

## Test the bridge and adapters

Install and dispose the bridge per test suite:

```typescript
let dispose: () => void;

beforeEach(() => {
  dispose = installCraftEffectBridge();
});

afterEach(() => {
  dispose();
});
```

Cover at least one example of each channel: a typed failure becomes a Craft
exception, `Effect.die` rejects as a technical error, and aborting the owning
resource interrupts the Effect.

## Architecture checks

The static graph can enforce the important boundaries. The Effect demo checks
that Effect loaders do not perform imperative synchronous writes or network
calls outside the intended boundary, and that server-function families remain
coherent. Keep those checks beside the app's architecture tests.

## What you gained

Tests that mirror the real Craft and Effect graphs: real composition by default,
narrow mocks at the boundary, and architecture rules for the invariants that
types alone cannot keep armed.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 7. Build forms and validate boundaries](/learn-effect/07-forms-validation)

[9. Call server functions — POC →](/learn-effect/09-server-functions)

</div>
