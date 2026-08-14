# craftMethod

Wraps a generator so it can be called like an ordinary method — from a template,
an event handler, anywhere outside the craft driver — while still resolving its
dependencies with `yield*`.

**Use it when** a click handler or a component method needs a service.
**Not inside a craft factory** — there, `yield*` works directly.

## Import

```typescript
import { craftMethod } from '@craft-ng/core';
```

## Overview

`craftMethod` is designed for component methods such as click handlers, submit handlers, and small UI orchestration callbacks.

The returned method carries the yieldable-method contract. When it is consumed
from a Craft component template, its template view can delegate it with
`yield*`; the component renderer drives the callback with the Craft generator
runtime while preserving the method's injector and wrappers.

The method runs inside the injection context captured when `craftMethod(...)` is created.

That makes it useful when a component method needs to:

- call Browser Boundaries with `yield*`
- compose crafted services through `yield* SomeService()`
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
[`craft-ng/craft-method-name-match`](/guide/routing/eslint-rules) ESLint rule
enforces the match and offers a quick fix.

## The common case — inside a Craft component

In a Craft component's logic factory there is no `this`: declare the method with
`craftMethod(name, fn)` and return it in the context.

```typescript
import { button, craftComponent, div, p } from '@craft-ng/component';
import { Console, craftMethod, state } from '@craft-ng/core';

export const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const counter = yield* state('counter', 0, ({ update }) => ({ update }));

    const increment = craftMethod('increment', function* (step = 1) {
      yield* Console.log('increment is called');
      yield* counter.update((value) => value + step);
    });

    return { counter, increment };
  },
  ({ counter, increment }) => [
    p(counter),
    button({ click: increment }, 'Increment'),
  ],
);
```

`counter` does not belong to `increment`, so the method yields
`counter.update`. Pass the method to the template (`click: increment`) rather
than wrapping `() => increment()`.

## Composing crafted services

`craftMethod` is not limited to Browser Boundaries — it consumes the same
crafted service graph as `craftService`:

```typescript
const increment = craftMethod('increment', function* (value: number) {
  return yield* CounterWorker.set(value);
});
```

::: details Angular class components — capturing `this`
In an Angular `@Component` class the generator usually needs the instance, which
is what the two `this`-aware overloads are for.

### Recommended form — capture `this`

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

### Receiver-based form

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

### Composing services from a class

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
      return yield* CounterWorker.set(value);
    },
  );
}
```

:::

## Caveats

- `craftMethod(...)` must be created inside an injection context, typically during component instantiation.
- The first argument is a required host name; it must match the property or variable name. The `craft-ng/craft-method-name-match` ESLint rule enforces this and provides a quick fix.
- `craftMethod(name, fn)` depends on the receiver used at call time. If you extract the callback, `this` is no longer guaranteed unless you bind it yourself.
- `craftMethod(name, this, fn)` is the recommended form whenever the generator reads or writes `this`.
- `onAppStart(...)` is not supported inside `craftMethod`.

## See Also

- [`Browser Boundaries`](/guide/testing/browser-boundaries)
- [`craftService`](/guide/app/craft-service)
- [`onAppStart`](/guide/app/app-start)
