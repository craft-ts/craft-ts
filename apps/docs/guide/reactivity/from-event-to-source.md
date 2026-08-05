# fromEventToSource$

Turns a DOM event into a readonly [`source$`](/guide/reactivity/source), with
automatic cleanup.

**Use it when** a primitive should react to something happening on the page:
a scroll, a key, a window resize.

## Overview

`fromEventToSource$` bridges DOM events with craft-ng's reactive system by combining:

- Event conversion to `ReadonlySource$` emissions
- Automatic event listener cleanup via `DestroyRef`
- Optional event payload transformation
- Signal-based reactive access to the last emitted value
- Manual disposal capability for dynamic use cases

## Import

```typescript
import { fromEventToSource$ } from '@craft-ng/core';
```

The component examples below also use the hyperscript helpers:

```typescript
import { button, craftComponent, div, each, form, input, p } from '@craft-ng/component';
```

## Signature

```typescript
function fromEventToSource$<T>(
  target: EventTarget,
  eventName: string,
  options?: {
    event?: boolean | AddEventListenerOptions;
    computedValue?: never;
  },
): FromEventToSource$<T>;

function fromEventToSource$<T, ComputedValue>(
  target: EventTarget,
  eventName: string,
  options?: {
    event?: boolean | AddEventListenerOptions;
    computedValue: (event: T) => ComputedValue;
  },
): FromEventToSource$<ComputedValue>;
```

### Parameters

- **`target`** - The DOM element or event target to listen to (HTMLElement, Window, Document, etc.)
- **`eventName`** - The event name to listen for ('click', 'input', 'scroll', etc.)
- **`options`** (optional)
  - **`event`** - Event listener options (capture, passive, once, etc.)
  - **`computedValue`** - Function to transform the event before emission

### Returns

`FromEventToSource$<T>` - A readonly source with:

- **`subscribe(callback: (value: T) => void)`** - Subscribe to event emissions
- **`value: Signal<T | undefined>`** - Read-only signal containing the last emitted value
- **`dispose()`** - Method to manually remove the event listener

The result is also a named yieldable primitive. The yielded source remains
readonly and keeps `dispose()`:

```typescript
const clickSource = fromEventToSource$(button, 'click');
const { click } = yield* clickSource;

click.subscribe((event) => console.log(event));
click.dispose();
```

## Types

### FromEventToSource$

```typescript
type FromEventToSource$<T> = ReadonlySource$<T> & {
  dispose: () => void;
} & NamedCraftPrimitiveGen<
    string,
    ReadonlySource$<T> & {
      dispose: () => void;
    }
  >;
```

### ReadonlySource$

```typescript
type ReadonlySource$<T> = {
  subscribe: (callback: (value: T) => void) => Subscription;
  value: Signal<T | undefined>;
};
```

## Key Features

### Source services and dependency tracking

Expose the event source through a `craftService` when consumers should depend
on the event handle:

```typescript
const { Click } = craftService(
  { name: 'Click', scope: 'global' },
  function* () {
    const { click } = yield* fromEventToSource$(button, 'click');
    return click;
  },
);

const { counter } = yield* state('counter', 0, ({ set }) => ({
  click: on$(Click, () => set(1)),
}));
```

`on$(Click, ...)` tracks `Click`. Calling `dispose()` only removes the DOM
listener and does not alter dependency metadata.

### Automatic Cleanup

Event listeners are automatically removed when the injection context is destroyed:

```typescript
export const Demo = craftComponent(
  'Demo',
  {},
  function* () {
    const keydown$ = fromEventToSource$<KeyboardEvent>(document, 'keydown');

    // the listener is removed automatically when the component is destroyed
    return { keydown$ };
  },
  () => p('Press any key'),
);
```

### Signal Integration

Access the last emitted value reactively via the `value` signal:

```typescript
const input$ = fromEventToSource$(inputElement, 'input', {
  computedValue: (event: Event) => (event.target as HTMLInputElement).value,
});

// Use in template or computed
const trimmedValue = computed(() => input$.value()?.trim() ?? '');
```

### Event Transformation

Transform events before emission using `computedValue`:

```typescript
const resize$ = fromEventToSource$(window, 'resize', {
  computedValue: () => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }),
});

// resize$.value() returns { width: number; height: number } | undefined
```

### Integration with State

Use with `on$()` to trigger state updates on DOM events:

```typescript
import { state, on$, fromEventToSource$ } from '@craft-ng/core';

const button = document.querySelector('button')!;
const click$ = fromEventToSource$<MouseEvent>(button, 'click');

const { counter } = state('counter', 0, ({ update }) => ({
  increment: on$(click$, () => update((count) => count + 1)),
}));
```

## Examples

### Basic Click Counter

```typescript
import { craftComponent, p } from '@craft-ng/component';
import { fromEventToSource$, on$, state } from '@craft-ng/core';

export const Clicker = craftComponent(
  'Clicker',
  {},
  function* () {
    const click$ = fromEventToSource$<MouseEvent>(document, 'click');

    const { clicks } = yield* state('clicks', 0, ({ update }) => ({
      // bound to the source, so NOT exposed on the ref
      increment: on$(click$, () => update((count) => count + 1)),
    }));

    return { clicks };
  },
  ({ clicks }) => p(() => `Clicks: ${clicks()}`),
);
```

### Input Value Tracking

```typescript
export const Search = craftComponent(
  'Search',
  {},
  function* () {
    const input$ = fromEventToSource$(document, 'input', {
      computedValue: (event: Event) => (event.target as HTMLInputElement).value,
    });

    // reactive access to the current input value
    return { searchTerm: input$.value };
  },
  ({ searchTerm }) => [
    input({ type: 'text', placeholder: 'Search…' }),
    p(() => `You typed: ${searchTerm() || 'nothing yet'}`),
  ],
);
```

### Window Scroll Tracking

```typescript
export const InfiniteScroll = craftComponent(
  'InfiniteScroll',
  {},
  function* () {
    const scroll$ = fromEventToSource$(window, 'scroll', {
      computedValue: () => ({
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: window.innerHeight,
      }),
      event: { passive: true }, // optimize performance
    });

    scroll$.subscribe((data) => {
      const nearBottom =
        data.scrollY + data.clientHeight >= data.scrollHeight - 100;

      if (nearBottom) {
        loadMoreData();
      }
    });

    return { scrollPosition: scroll$.value };
  },
  ({ scrollPosition }) =>
    div(p(() => `Scroll position: ${scrollPosition()?.scrollY}`)),
);
```

### Window Resize Handling

```typescript
export const Responsive = craftComponent(
  'Responsive',
  {},
  function* () {
    const resize$ = fromEventToSource$(window, 'resize', {
      computedValue: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    });

    const dimensions = resize$.value;

    return {
      dimensions,
      isMobile: computed(() => {
        const dims = dimensions();
        return dims ? dims.width < 768 : false;
      }),
    };
  },
  ({ dimensions }) =>
    div(p(() => `Viewport: ${dimensions()?.width} x ${dimensions()?.height}`)),
);
```

### Keyboard Shortcuts

```typescript
interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export const Shortcuts = craftComponent(
  'Shortcuts',
  {},
  function* () {
    const save = () => console.log('Save triggered');
    const undo = () => console.log('Undo triggered');

    const keydown$ = fromEventToSource$(document, 'keydown', {
      computedValue: (event: KeyboardEvent) => ({
        key: event.key,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      }),
    });

    keydown$.subscribe((shortcut) => {
      if (shortcut.ctrlKey && shortcut.key === 's') save();
      else if (shortcut.ctrlKey && shortcut.key === 'z') undo();
    });

    return {};
  },
  () => p('Try Ctrl+S or Ctrl+Z'),
);
```

### Dynamic Element Listening

```typescript
export const Dynamic = craftComponent(
  'Dynamic',
  {},
  function* (items: Input<readonly Item[]>) {
    let currentListener$: FromEventToSource$<MouseEvent> | undefined;

    const attachListener = (element: HTMLElement) => {
      // remove the previous listener, if any
      currentListener$?.dispose();

      currentListener$ = fromEventToSource$<MouseEvent>(element, 'click');
      currentListener$.subscribe((event) => {
        console.log('Element clicked:', event);
      });
    };

    return { items, attachListener };
  },
  ({ items, attachListener }) =>
    each(
      () => items(),
      { track: (item) => item.id },
      (item) =>
        div(
          button(
            { click: (event) => attachListener(event.target as HTMLElement) },
            'Attach listener',
          ),
        ),
    ),
);
```

### Mouse Position Tracker

```typescript
interface Position {
  x: number;
  y: number;
}

export const CursorTracker = craftComponent(
  'CursorTracker',
  {},
  function* () {
    const mouseMove$ = fromEventToSource$(document, 'mousemove', {
      computedValue: (event: MouseEvent) => ({
        x: event.clientX,
        y: event.clientY,
      }),
      event: { passive: true },
    });

    return { position: mouseMove$.value };
  },
  ({ position }) =>
    div(p(() => `Mouse position: ${position()?.x}, ${position()?.y}`)),
);
```

### Form Submission

```typescript
export const SubmitDemo = craftComponent(
  'SubmitDemo',
  {},
  function* () {
    const submit$ = fromEventToSource$(document, 'submit', {
      computedValue: (event: Event) => {
        event.preventDefault();
        const formData = new FormData(event.target as HTMLFormElement);
        return Object.fromEntries(formData);
      },
    });

    const { formData } = yield* state(
      'formData',
      null as Record<string, unknown> | null,
      ({ set }) => ({
        // bound to the source, so NOT exposed on the ref
        handleSubmit: on$(submit$, (data) => set(data)),
      }),
    );

    return { formData };
  },
  ({ formData }) =>
    form([
      input({ type: 'text', name: 'username' }),
      button({ type: 'submit' }, 'Submit'),
      p(() => JSON.stringify(formData())),
    ]),
);
```

## Comparison with sourceFromEvent

| Feature       | `fromEventToSource$`                                        | `sourceFromEvent`                                |
| ------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| Return type   | `ReadonlySource$<T>` (with `subscribe`, `value`, `dispose`) | `SignalSource<T>` (with `set`, mutation methods) |
| Modification  | Read-only, no `emit` method                                 | Writable via `set` method                        |
| Use case      | Event observation and subscription                          | Event-driven source with manual control          |
| Signal access | ✅ via `value` property                                     | ✅ as direct signal                              |
| Subscription  | ✅ via `subscribe` method                                   | ❌ (uses `afterRecomputation()`)                 |

## Best Practices

### Use Passive Event Listeners

For scroll and mouse events, use `passive: true` to improve performance:

```typescript
const scroll$ = fromEventToSource$(window, 'scroll', {
  computedValue: () => window.scrollY,
  event: { passive: true },
});
```

### Extract Only Needed Data

Transform events to extract only the data you need:

```typescript
// ❌ Bad - stores entire event object
const click$ = fromEventToSource$<MouseEvent>(button, 'click');

// ✅ Good - extracts only needed properties
const click$ = fromEventToSource$(button, 'click', {
  computedValue: (event: MouseEvent) => ({
    x: event.clientX,
    y: event.clientY,
  }),
});
```

### Cleanup Dynamic Listeners

For dynamic elements, manually dispose of listeners:

```typescript
private listener$?: FromEventToSource$<Event>;

attachToElement(element: HTMLElement) {
  this.listener$?.dispose(); // Clean up previous
  this.listener$ = fromEventToSource$(element, 'click');
}

ngOnDestroy() {
  this.listener$?.dispose();
}
```

### Combine with State Management

Integrate with state management using `on$()`:

```typescript
const input$ = fromEventToSource$(inputElement, 'input', {
  computedValue: (e: Event) => (e.target as HTMLInputElement).value,
});

const { searchResults } = state('searchResults', [], ({ set }) => ({
  search: on$(input$, async (term) => {
    const results = await api.search(term);
    set(results);
  }),
}));
```

## Common Patterns

### Debounced Input

```typescript
import { debounceTime } from 'rxjs/operators';

const input$ = fromEventToSource$(inputElement, 'input', {
  computedValue: (e: Event) => (e.target as HTMLInputElement).value,
});

// Use with rxjs operators if needed
from(input$).pipe(
  debounceTime(300),
  subscribe((value) => console.log(value)),
);
```

### Multiple Event Handlers

```typescript
const buttonClick$ = fromEventToSource$(button, 'click');
const buttonHover$ = fromEventToSource$(button, 'mouseenter');

buttonClick$.subscribe(() => console.log('Clicked'));
buttonHover$.subscribe(() => console.log('Hovered'));
```

### Conditional Event Processing

```typescript
const keydown$ = fromEventToSource$(document, 'keydown', {
  computedValue: (event: KeyboardEvent) => event.key,
});

keydown$.subscribe((key) => {
  if (key === 'Escape') {
    this.closeModal();
  } else if (key === 'Enter') {
    this.submit();
  }
});
```

## Notes

- Must be called within an Angular injection context
- Event listeners are automatically removed on component destruction
- Returns a **readonly** source - no `emit` method is exposed
- The `value` signal is `undefined` until the first event is emitted
- Use `dispose()` for manual cleanup when needed

## See Also

- [source$](/guide/reactivity/source) - Event emitter with signal tracking
- [sourceFromEvent](/guide/reactivity/source-from-event) - Writable source from events
- [on$](/guide/reactivity/on) - Subscribe to sources in state management
- [state](/guide/state/local-state) - State primitive with source integration
