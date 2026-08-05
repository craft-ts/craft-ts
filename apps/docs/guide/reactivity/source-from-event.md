# sourceFromEvent

Creates a [`source$`](/guide/reactivity/source) from DOM events or event
emitters.

**Use it when** the event's origin is an emitter or an element you already hold,
rather than a target resolved lazily — for that, see
[`fromEventToSource$`](/guide/reactivity/from-event-to-source).

## Import

```typescript
import { sourceFromEvent } from '@craft-ng/core';
```

## Basic Usage

```typescript
import { state, sourceFromEvent } from '@craft-ng/core';

const button = document.querySelector('button')!;

// Create source from button clicks
const clickSource = sourceFromEvent(
  button,
  'click',
  () => (count: number) => count + 1,
);

const { clickCount } = state('clickCount', 0, {
  sources: [clickSource],
});
```

## API

```typescript
function sourceFromEvent<T, E extends Event>(
  target: EventTarget,
  eventName: string,
  mapper: (event: E) => (state: T) => T,
): Observable<(state: T) => T>;
```

## Examples

### Inside a Craft component

`sourceFromEvent` takes an `EventTarget` you already hold. Inside a component
that usually means a document- or window-level target, since the component's own
elements are better handled with a plain event prop:

```typescript
import { craftComponent, p } from '@craft-ng/component';
import { sourceFromEvent, state } from '@craft-ng/core';

export const KeyCounter = craftComponent(
  'KeyCounter',
  {},
  function* () {
    const keySource = sourceFromEvent(
      document,
      'keydown',
      () => (count: number) => count + 1,
    );

    const { keys } = yield* state('keys', 0, { sources: [keySource] });

    return { keys };
  },
  ({ keys }) => p(() => `Keys pressed: ${keys()}`),
);
```

::: tip For the component's own elements, use an event prop
`button({ click: () => counter.increment() }, 'Click me')` is simpler and needs
no target. Reach for `sourceFromEvent` when the event comes from outside the
component's own markup, or when several states must react to the same event.
:::

### Input Changes

```typescript
const input = document.querySelector('input')!;

const inputSource = sourceFromEvent(
  input,
  'input',
  (event: Event) => () => (event.target as HTMLInputElement).value,
);

const { inputValue } = state('inputValue', '', {
  sources: [inputSource],
});
```

### Mouse Position

```typescript
interface Position {
  x: number;
  y: number;
}

const mouseMoveSource = sourceFromEvent(
  document,
  'mousemove',
  (event: MouseEvent) => () => ({
    x: event.clientX,
    y: event.clientY,
  }),
);

const { mousePosition } = state<Position>(
  'mousePosition',
  { x: 0, y: 0 },
  {
    sources: [mouseMoveSource],
  },
);
```

### Keyboard Input

```typescript
const keySource = sourceFromEvent(
  document,
  'keydown',
  (event: KeyboardEvent) => (keys: string[]) => [...keys, event.key],
);

const { pressedKeys } = state<string[]>('pressedKeys', [], {
  sources: [keySource],
});
```

### Scroll Position

```typescript
const scrollSource = sourceFromEvent(
  window,
  'scroll',
  () => () => window.scrollY,
);

const { scrollPosition } = state('scrollPosition', 0, {
  sources: [scrollSource],
});
```

### Form Submit

```typescript
const form = document.querySelector('form')!;

interface FormData {
  name: string;
  email: string;
}

const submitSource = sourceFromEvent(form, 'submit', (event: Event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  return () => ({
    name: formData.get('name') as string,
    email: formData.get('email') as string,
  });
});

const { formState } = state<FormData>(
  'formState',
  { name: '', email: '' },
  {
    sources: [submitSource],
  },
);
```

### Window Resize

```typescript
interface WindowSize {
  width: number;
  height: number;
}

const resizeSource = sourceFromEvent(window, 'resize', () => () => ({
  width: window.innerWidth,
  height: window.innerHeight,
}));

const { windowSize } = state<WindowSize>(
  'windowSize',
  { width: window.innerWidth, height: window.innerHeight },
  {
    sources: [resizeSource],
  },
);
```

## With Operators

```typescript
import { debounceTime, map } from 'rxjs/operators';

const input = document.querySelector('input')!;

// Debounced input with RxJS operators
const debouncedInputSource = sourceFromEvent(
  input,
  'input',
  (event: Event) => () => (event.target as HTMLInputElement).value,
).pipe(debounceTime(300));

const { searchQuery } = state('searchQuery', '', {
  sources: [debouncedInputSource],
});
```

## Best Practices

✅ **Cleanup automatically handled** - Sources unsubscribe when state is destroyed
✅ **Use with throttle/debounce** - For high-frequency events
✅ **Extract to reusable functions** - Create helper functions for common patterns
✅ **Type your events** - Use specific event types (MouseEvent, KeyboardEvent)

## See Also

- [`source$`](/guide/reactivity/source) - Create reactive sources
