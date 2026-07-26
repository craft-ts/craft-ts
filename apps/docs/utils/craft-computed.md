# craftComputed

Creates computed signals that can resolve craft dependencies with `yield*`.

## Import

```typescript
import { craftComputed } from '@craft-ng/core';
```

## Overview

`craftComputed` is a thin wrapper around Angular `computed(...)` with two modes:

- plain computation: `craftComputed(name, () => value)`
- generator factory: `craftComputed(name, function* () { ...; return () => value; })`

The generator mode resolves DI dependencies once (when the computed is created), then returns the computation function used by Angular signals.

## Signatures

```typescript
function craftComputed<Name extends string, T>(
  name: Name,
  computation: () => T,
  options?: CreateComputedOptions<T>,
): Signal<T>;

function craftComputed<Name extends string, Yielded, T>(
  name: Name,
  factory: () => Generator<Yielded, () => T, unknown>,
  options?: CreateComputedOptions<T>,
): Signal<T>;
```

The first argument is the **host name**: it is required and must match the
property (or variable) the computed is assigned to. It is the value used to
tag the injector context and to label dev-tools snapshots. The
[`craft-ng/craft-computed-name-match`](/type-safe-di-routes/setup) ESLint rule
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
    return () => this.count() * multiplier.factor;
  });
}
```

## Caveats

- `craftComputed(...)` must be created inside an injection context.
- In generator mode, only craft service dependencies are supported as yielded values.
- `onAppStart(...)` is not supported inside `craftComputed(...)`.

## Typing

Both forms return an Angular `Signal<T>`.

When using a generator, yielded dependencies are tracked and can be extracted with `ExtractDeps<...>`.

## See Also

- [`craftMethod`](/utils/craft-method)
- [`craftEffect`](/utils/craft-effect)
- [`craftService`](/store/craft-service)
- [`onAppStart`](/utils/on-app-start)
