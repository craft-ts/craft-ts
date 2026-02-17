# fromEventToSource$

Converts DOM events to a readonly source stream with automatic cleanup and signal-based value tracking.

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

## Types

### FromEventToSource$

```typescript
type FromEventToSource$<T> = ReadonlySource$<T> & {
  dispose: () => void;
};
```

### ReadonlySource$

```typescript
type ReadonlySource$<T> = {
  subscribe: (callback: (value: T) => void) => Subscription;
  value: Signal<T | undefined>;
};
```

## Key Features

### Automatic Cleanup

Event listeners are automatically removed when the injection context is destroyed:

```typescript
@Component({
  selector: 'app-demo',
  template: '<button #btn>Click me</button>',
})
export class DemoComponent {
  @ViewChild('btn', { read: ElementRef }) button!: ElementRef;

  click$ = fromEventToSource$<MouseEvent>(this.button.nativeElement, 'click');

  // Listener is automatically removed when component is destroyed
}
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

const counter = state(0, ({ update }) => ({
  increment: on$(click$, () => update((count) => count + 1)),
}));
```

## Examples

### Basic Click Counter

```typescript
import { Component, ElementRef, ViewChild } from '@angular/core';
import { state, on$, fromEventToSource$ } from '@craft-ng/core';

@Component({
  selector: 'app-clicker',
  template: `
    <button #btn>Click me</button>
    <p>Clicks: {{ clicks() }}</p>
  `,
})
export class ClickerComponent {
  @ViewChild('btn', { read: ElementRef })
  button!: ElementRef<HTMLButtonElement>;

  click$ = fromEventToSource$<MouseEvent>(this.button.nativeElement, 'click');

  clicks = state(0, ({ update }) => ({
    increment: on$(this.click$, () => update((count) => count + 1)),
  }));
}
```

### Input Value Tracking

```typescript
@Component({
  selector: 'app-search',
  template: `
    <input #searchInput type="text" placeholder="Search..." />
    <p>You typed: {{ searchTerm() || 'nothing yet' }}</p>
  `,
})
export class SearchComponent {
  @ViewChild('searchInput', { read: ElementRef })
  input!: ElementRef<HTMLInputElement>;

  input$ = fromEventToSource$(this.input.nativeElement, 'input', {
    computedValue: (event: Event) => {
      const target = event.target as HTMLInputElement;
      return target.value;
    },
  });

  // Reactive access to current input value
  searchTerm = this.input$.value;
}
```

### Window Scroll Tracking

```typescript
@Component({
  selector: 'app-infinite-scroll',
  template: `
    <div>
      <p>Scroll position: {{ scrollPosition()?.scrollY }}</p>
      <!-- Content -->
    </div>
  `,
})
export class InfiniteScrollComponent implements OnInit {
  scroll$ = fromEventToSource$(window, 'scroll', {
    computedValue: () => ({
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: window.innerHeight,
    }),
    event: { passive: true }, // Optimize performance
  });

  scrollPosition = this.scroll$.value;

  ngOnInit() {
    this.scroll$.subscribe((data) => {
      const nearBottom =
        data.scrollY + data.clientHeight >= data.scrollHeight - 100;

      if (nearBottom) {
        this.loadMoreData();
      }
    });
  }

  loadMoreData() {
    // Load more content
  }
}
```

### Window Resize Handling

```typescript
@Component({
  selector: 'app-responsive',
  template: `
    <div>
      <p>Viewport: {{ dimensions()?.width }} x {{ dimensions()?.height }}</p>
    </div>
  `,
})
export class ResponsiveComponent {
  resize$ = fromEventToSource$(window, 'resize', {
    computedValue: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }),
  });

  dimensions = this.resize$.value;

  // Computed breakpoint
  isMobile = computed(() => {
    const dims = this.dimensions();
    return dims ? dims.width < 768 : false;
  });
}
```

### Keyboard Shortcuts

```typescript
interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

@Component({
  selector: 'app-shortcuts',
  template: '...',
})
export class ShortcutsComponent implements OnInit {
  keydown$ = fromEventToSource$(document, 'keydown', {
    computedValue: (event: KeyboardEvent) => ({
      key: event.key,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    }),
  });

  ngOnInit() {
    this.keydown$.subscribe((shortcut) => {
      if (shortcut.ctrlKey && shortcut.key === 's') {
        this.save();
      } else if (shortcut.ctrlKey && shortcut.key === 'z') {
        this.undo();
      }
    });
  }

  save() {
    console.log('Save triggered');
  }

  undo() {
    console.log('Undo triggered');
  }
}
```

### Dynamic Element Listening

```typescript
@Component({
  selector: 'app-dynamic',
  template: `
    <div *ngFor="let item of items">
      <button (click)="attachListener($event.target)">Attach listener</button>
    </div>
  `,
})
export class DynamicComponent {
  private currentListener$?: FromEventToSource$<MouseEvent>;

  attachListener(element: HTMLElement) {
    // Remove previous listener if exists
    this.currentListener$?.dispose();

    // Attach to new element
    this.currentListener$ = fromEventToSource$<MouseEvent>(element, 'click');

    this.currentListener$.subscribe((event) => {
      console.log('Element clicked:', event);
    });
  }

  ngOnDestroy() {
    // Manual cleanup if needed
    this.currentListener$?.dispose();
  }
}
```

### Mouse Position Tracker

```typescript
interface Position {
  x: number;
  y: number;
}

@Component({
  selector: 'app-cursor-tracker',
  template: `
    <div>
      <p>Mouse position: {{ position()?.x }}, {{ position()?.y }}</p>
    </div>
  `,
})
export class CursorTrackerComponent {
  mouseMove$ = fromEventToSource$(document, 'mousemove', {
    computedValue: (event: MouseEvent) => ({
      x: event.clientX,
      y: event.clientY,
    }),
    event: { passive: true },
  });

  position = this.mouseMove$.value;
}
```

### Form Submission

```typescript
@Component({
  selector: 'app-form',
  template: `
    <form #form>
      <input type="text" name="username" />
      <button type="submit">Submit</button>
    </form>
  `,
})
export class FormComponent {
  @ViewChild('form', { read: ElementRef }) form!: ElementRef<HTMLFormElement>;

  submit$ = fromEventToSource$(this.form.nativeElement, 'submit', {
    computedValue: (event: Event) => {
      event.preventDefault();
      const formData = new FormData(event.target as HTMLFormElement);
      return Object.fromEntries(formData);
    },
  });

  formData = state<Record<string, unknown> | null>(null, ({ set }) => ({
    handleSubmit: on$(this.submit$, (data) => set(data)),
  }));
}
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

const searchResults = state([], ({ set }) => ({
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

- [source$](./source$.md) - Event emitter with signal tracking
- [sourceFromEvent](./source-from-event.md) - Writable source from events
- [on$](./on$.md) - Subscribe to sources in state management
- [state](../primitives/state.md) - State primitive with source integration
