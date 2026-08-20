# Adopting CraftTS progressively

You do not need to rewrite an Effect application before evaluating CraftTS. Keep
the domain programs and Layers intact, then introduce Craft at the browser
boundary one feature at a time.

## Recommended path

### 0. Establish the constraints

Before changing application code, confirm the
[compatibility matrix](/resources/effect-compatibility). In particular, check
the Effect 4 release-candidate requirement, the Node version and whether SSR is
a hard requirement.

### 1. Keep the domain in Effect

Select one existing operation with a clear type:

```ts
Effect<Output, BusinessError, RequiredServices>
```

Keep its `Context.Service`, `Layer`, tagged errors and tests. The first Craft
change should be an adapter, not a rewrite of the business logic.

### 2. Add the Craft boundary

Install `@craft-ts/effect`, install the bridge once at bootstrap, and expose the
operation through `queryEffect`, `mutationEffect` or `asyncProcessEffect`.

The component should call the domain operation. It should not resolve the
repository, call `Effect.runPromise`, start a fiber from a click handler or
duplicate the domain state in a Craft `state`.

### 3. Pilot one read-only feature

Start with a page that has:

- one query;
- one application or route Layer;
- one loading state;
- one typed business error;
- one technical error path;
- one executable test.

This exposes the real cost of the Craft UI model without mixing in forms,
optimistic updates or server-function transport.

### 4. Add writes and forms

Once the read path is stable, add `mutationEffect`, then connect it to Craft
forms and `insertReactOnMutation`. Keep validation responsibilities explicit:

- Effect Schema or `methodSchema` validates a boundary payload;
- Craft owns field state, validity and interaction;
- Effect typed errors represent business rejection;
- defects remain technical failures.

### 5. Introduce route and feature scopes

Move a Layer to the narrowest scope that owns it. Add the compile-time Effect
requirements proof for the route, and keep route providers in a named tuple so
the type checker can inspect them.

Do this after the first feature works. The proof is valuable, but introducing
it before the boundary is understood makes the first experiment look more
complex than it is.

### 6. Evaluate server functions separately

Treat the current server-function integration as a separate experiment. Its
transport, file conventions, middleware API and deployment integration are not
final. Never treat a client Layer as an authentication or authorization
boundary; the server must verify claims again.

## What can stay and what changes?

| Existing Effect application asset | During a Craft pilot |
| --- | --- |
| Domain types and business operations | Keep |
| Tagged errors and error unions | Keep; map at the Craft boundary |
| `Context.Service` contracts | Keep |
| Live and test `Layer`s | Keep; expose through `provideLayer` |
| Effect unit tests | Keep |
| Existing UI components and templates | Keep outside the pilot; replace only the selected Craft feature |
| UI loading, cancellation and rendering state | Move to Craft resources |
| URL state and form interaction | Model with Craft primitives and forms |

## Go / no-go signals

Proceed when the pilot has a clear resource boundary, an executable Layer setup
and tests that distinguish business errors from defects.

Pause and resolve the issue before expanding when:

- the project is still on Effect 3 without an isolation plan;
- SSR is mandatory but no SSR host has been selected;
- the team cannot explain which side owns a piece of state;
- every feature requires a custom bridge or manual subscription;
- typecheck time or type errors make the feedback loop unacceptable.

