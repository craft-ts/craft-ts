# craftMethod

Creates component-friendly generator handlers that can use `yield*` with the craft runtime.

## Import

```typescript
import { craftMethod } from '@craft-ng/core';
```

## Overview

`craftMethod` is designed for component methods such as click handlers, submit handlers, and small UI orchestration callbacks.

The method runs inside the injection context captured when `craftMethod(...)` is created.

That makes it useful when a component method needs to:

- call Browser Boundaries with `yield*`
- compose crafted services through `yield* SomeServiceToYield()`
- keep the handler colocated with component-local signals

**All dependencies are cached, which helps to detect missing providers at compile time.**

## Signatures

```typescript
function craftMethod<Name extends string, This, Args extends unknown[], Result>(
  name: Name,
  factory: (this: This, ...args: Args) => Generator<unknown, Result, unknown>,
): (this: This, ...args: Args) => Result;

function craftMethod<Name extends string, This, Args extends unknown[], Result>(
  name: Name,
  self: This,
  factory: (this: This, ...args: Args) => Generator<unknown, Result, unknown>,
): (...args: Args) => Result;
```

The first argument is the **host name**: it is required and must match the
property (or variable) the method is assigned to. It is the value used to tag
the injector context — same role as `provideHostName(...)`. The
[`craft-ng/craft-method-name-match`](/type-safe-di-routes/setup) ESLint rule
enforces the match and offers a quick fix.

## Recommended Form: Capture `this`

Use `craftMethod(name, this, fn)` when the generator needs component state.

```typescript
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Console, craftMethod } from '@craft-ng/core';

@Component({
  selector: 'app-counter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>{{ counter() }}</p>
    <button (click)="increment()">Increment</button>
  `,
})
export class CounterComponent {
  readonly counter = signal(0);

  readonly increment = craftMethod('increment', this, function* (step = 1) {
    yield* Console.log('increment is called');
    this.counter.update((value) => value + step);
  });
}
```

This overload captures the instance once, so the callback still works after extraction:

```typescript
const increment = component.increment;
increment();
```

## Receiver-Based Form

Use `craftMethod(name, fn)` when you want the exact `(click)="increment()"` shape and are fine with the receiver-dependent behavior.

In strict TypeScript, annotate `this` explicitly inside the generator:

```typescript
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Console, craftMethod } from '@craft-ng/core';

@Component({
  selector: 'app-counter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button (click)="increment(2)">Increment</button>`,
})
export class CounterComponent {
  readonly counter = signal(0);

  readonly increment = craftMethod(
    'increment',
    function* (this: CounterComponent, step = 1) {
      yield* Console.log('increment is called');
      this.counter.update((value) => value + step);
      return this.counter();
    },
  );
}
```

## Compose Crafted Services

`craftMethod` is not limited to Browser Boundaries. It can consume the same crafted service graph as `craftService`.

```typescript
@Component({
  selector: 'app-counter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button (click)="increment()">Increment</button>`,
})
export class CounterComponent {
  readonly increment = craftMethod(
    'increment',
    this,
    function* (value: number) {
      return yield* CounterWorkerToYield.set(value);
    },
  );
}
```

## Caveats

- `craftMethod(...)` must be created inside an injection context, typically during component instantiation.
- The first argument is a required host name; it must match the property or variable name. The `craft-ng/craft-method-name-match` ESLint rule enforces this and provides a quick fix.
- `craftMethod(name, fn)` depends on the receiver used at call time. If you extract the callback, `this` is no longer guaranteed unless you bind it yourself.
- `craftMethod(name, this, fn)` is the recommended form whenever the generator reads or writes `this`.
- `onAppStart(...)` is not supported inside `craftMethod`.

## See Also

- [`Browser Boundaries`](/type-safe-di-routes/browser-boundaries)
- [`craftService`](/store/craft-service)
- [`onAppStart`](/utils/on-app-start)
