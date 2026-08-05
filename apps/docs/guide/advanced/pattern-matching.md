# Pattern matching

`craftMatch` is type-safe pattern matching over a **bare literal union** (a `string` / `number` /
`enum` union). It is the value-level counterpart of the exception-level
[`catchTag` / `catchTag.exhaustive`](/guide/advanced/program-operators) pair: one call for a single case, a
`.exhaustive` variant whose handler map is checked to cover the union **at compile time**.

**Use it when** a literal union drives a decision and forgetting a case should
be a build error — a status, a role, a mode.
**Not for** a two-way boolean; a ternary is clearer.

Use it wherever a `switch` would go — mapping a status to a label, an icon, a component input — but
with a compiler that refuses to build when you add a member to the union and forget a branch.

## Why not a plain `switch`?

A `switch` (or an object lookup) over a union has three recurring problems:

```ts
type Status = 'active' | 'idle' | 'error';

function label(status: Status) {
  switch (status) {
    case 'active':
      return 'Running';
    case 'idle':
      return 'Waiting';
    // 'error' forgotten → no error, `label` silently returns undefined
  }
}
```

| Concern                     | `switch` / object lookup                  | `craftMatch.exhaustive`           |
| --------------------------- | ----------------------------------------- | --------------------------------- |
| Missing a union member      | silent `undefined` at runtime             | **compile error**                 |
| Handler for a non-member    | silent dead code                          | **compile error**                 |
| Value passed to each branch | widened to the whole union                | narrowed to its own literal       |
| Return type                 | union incl. `undefined` unless you assert | exact union of the branch returns |

## Signature

```ts
// Single case — optional match
craftMatch<Value extends string | number, Case extends Value, R>(
  value: Value,
  matchCase: Case,
  handler: (value: Case) => R,
): R | undefined;

// Exhaustive — every union member needs a handler
craftMatch.exhaustive<Value extends string | number, R>(
  value: Value,
  handlers: { [K in Value]: (value: K) => R },
): R;
```

Exhaustiveness is enforced natively by the mapped handler type `{ [K in Value]: (value: K) => R }` —
the union members **are** the required keys, so a missing key or a key outside the union is a plain
type error, and each handler receives its own narrowed literal.

## Single case

Runs the handler only when `value` equals `matchCase`, otherwise returns `undefined`:

```ts
import { craftMatch } from '@craft-ng/core';

const status = 'active' as Status;

const spinner = craftMatch(status, 'active', () => '⏳'); // '⏳'
const nope = craftMatch(status, 'error', () => '💥'); // undefined
```

The handler's argument is narrowed to the matched literal (`'active'` above), and the result is typed
`R | undefined`.

## Exhaustive match

The handler map must cover **exactly** the union — no more, no less:

```ts
import { craftMatch } from '@craft-ng/core';

const label = (status: Status) =>
  craftMatch.exhaustive(status, {
    active: () => 'Running',
    idle: () => 'Waiting',
    error: () => 'Failed',
  });
```

Add `'pending'` to `Status` and every `craftMatch.exhaustive` over it stops compiling until you add
the branch — the exhaustiveness wall you would otherwise hand-roll with a `never` assertion in a
`switch`'s `default`.

Each handler is narrowed to its own literal, and the result is the union of the branch return types:

```ts
const view = craftMatch.exhaustive(status, {
  active: () => ({ color: 'green', text: 'Running' }),
  idle: () => ({ color: 'gray', text: 'Waiting' }),
  error: () => ({ color: 'red', text: 'Failed' }),
});
// view: { color: string; text: string }
```

### The compile errors it catches

```ts
// ❌ missing a member — the union is not fully covered
craftMatch.exhaustive(status, {
  active: () => 'Running',
  idle: () => 'Waiting',
}); // Type error: property 'error' is missing

// ❌ a handler for something outside the union
craftMatch.exhaustive(status, {
  active: () => 'Running',
  idle: () => 'Waiting',
  error: () => 'Failed',
  unknown: () => 'nope', // Type error: 'unknown' is not in Status
});
```

## With enums

A TypeScript `enum` compiles to a `string | number` union, so it works unchanged:

```ts
enum Tab {
  Overview = 'overview',
  Billing = 'billing',
  Team = 'team',
}

const title = (tab: Tab) =>
  craftMatch.exhaustive(tab, {
    [Tab.Overview]: () => 'Overview',
    [Tab.Billing]: () => 'Billing',
    [Tab.Team]: () => 'Team',
  });
```

## Scope & limits

- **Bare literal unions only.** `craftMatch` matches on the value itself, not on a discriminant
  field — it does not (yet) take a union of objects keyed by a `type` / `kind` field. Map the
  discriminant to a literal first if you need that: `craftMatch.exhaustive(shape.kind, { … })`.
- **Pure and synchronous.** Unlike [`catchTag`](/guide/advanced/program-operators), `craftMatch` is not a craft
  program: it does not `yield*` and does not track dependencies. To run a different craft program per
  branch, `yield*` inside the handler bodies of a normal generator instead.
- **No catch-all.** There is the exhaustive form (compile wall) or the single-case form (optional
  `undefined`) — there is no `.otherwise(fallback)`.

## API

| Export                                   | Purpose                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `craftMatch(value, case, handler)`       | Match a single literal; returns `R \| undefined`.                                 |
| `craftMatch.exhaustive(value, handlers)` | Match every member; compile-time exhaustive; returns the union of branch results. |
| `CraftMatchHandlers<Value, R>`           | The `{ [K in Value]: (value: K) => R }` handler-map type.                         |

## See Also

- [Program operators](/guide/advanced/program-operators) — the exception-level counterpart
- [Exceptions as values](/guide/concepts/exceptions)
