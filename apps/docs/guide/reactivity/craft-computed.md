# craftComputed

A yieldable reactive value that can read Craft dependencies and other reactive
Craft values with `yield*`.

**Use it when** a derived value needs a service.
Use Angular's `computed` only inside Craft's implementation. Application code
uses `craftComputed` so every reactive dependency can be traced consistently.

## Import

```typescript
import { craftComputed } from '@craft-ng/core';
```

## Overview

`craftComputed` wraps Angular `computed(...)` internally and exposes a yieldable
reader in both modes:

- plain computation: `craftComputed(name, () => value)`
- generator factory: `craftComputed(name, function* () { ...; return value; })`

The generator is replayed on every recomputation. It may read services,
primitive roots, other computed values, or nested resource properties.

## Signatures

```typescript
function craftComputed<Name extends string, T>(
  name: Name,
  computation: () => T,
  options?: CreateComputedOptions<T>,
): YieldableReactiveValue<T, Name>;

function craftComputed<Name extends string, Yielded, T>(
  name: Name,
  factory: () => Generator<Yielded, T, unknown>,
  options?: CreateComputedOptions<T>,
): YieldableReactiveValue<T, Name>;
```

The first argument is the **host name** outside an insertion and must match the
property (or variable) the computed is assigned to. Inside an insertion it may
be omitted: Craft uses the insertion key automatically. The name tags the
injector context, reactive graph and dev-tools snapshots. The
[`craft-ng/craft-computed-name-match`](/guide/routing/setup) ESLint rule
enforces the match and offers a quick fix.

## Plain Computation

Use this form when no `yield*` dependencies are needed.

```typescript
import { signal } from '@angular/core';
import { craftComputed } from '@craft-ng/core';

class CounterComponent {
  readonly count = signal(0);
  readonly doubled = craftComputed('doubled', () => this.count() * 2);
}

const value = yield * component.doubled();
```

## Generator Computation

Use this form when the computed needs crafted dependencies.

```typescript
import { signal } from '@angular/core';
import { craftComputed, craftService } from '@craft-ng/core';

const { Multiplier } = craftService(
  { name: 'Multiplier', scope: 'function' },
  () => ({ factor: 3 }),
);

class CounterComponent {
  readonly count = signal(0);

  readonly tripled = craftComputed('tripled', function* () {
    const multiplier = yield* Multiplier();
    return this.count() * multiplier.factor;
  });
}
```

Inside an insertion, reactive reads are yieldable and the insertion key supplies
the name:

```typescript
const counter =
  yield *
  state('counter', 1, ({ state }) => ({
    doubled: craftComputed(function* () {
      return (yield* state()) * 2;
    }),
  }));

const doubled = yield * counter.doubled();
```

## Caveats

- `craftComputed(...)` must be created inside an injection context.
- Unknown yielded values are rejected with a `craftComputed`-specific error.
- `onAppStart(...)` is not supported inside `craftComputed(...)`.

## Typing

Both forms return `YieldableReactiveValue<T>`. The raw Angular signal stays
internal to Craft.

When using a generator, yielded dependencies are tracked and can be extracted with `ExtractDeps<...>`.

## See Also

- [`craftMethod`](/guide/reactivity/craft-method)
- [`craftEffect`](/guide/reactivity/craft-effect)
- [`craftService`](/guide/app/craft-service)
- [`onAppStart`](/guide/app/app-start)
