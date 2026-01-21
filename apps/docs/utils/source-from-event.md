# sourceFromEvent

Create a source from DOM events or event emitters.

## Import

```typescript
import { sourceFromEvent } from '@ng-craft/core';
```

## Basic Usage

```typescript
import { state, sourceFromEvent } from '@ng-craft/core';

const button = document.querySelector('button')!;

// Create source from button clicks
const clickSource = sourceFromEvent(
  button,
  'click',
  () => (count: number) => count + 1,
);

const clickCount = state(0, {
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

### Button Clicks

```typescript
@Component({
  selector: 'app-clicker',
  template: `
    <button #btn>Click me</button>
    <p>Clicks: {{ clicks() }}</p>
  `,
})
export class ClickerComponent {
  @ViewChild('btn', { static: true }) button!: ElementRef<HTMLButtonElement>;

  clicks = state(0);

  ngAfterViewInit() {
    const clickSource = sourceFromEvent(
      this.button.nativeElement,
      'click',
      () => (count: number) => count + 1,
    );

    // Connect source to state
    this.clicks = state(0, {
      sources: [clickSource],
    });
  }
}
```

### Input Changes

```typescript
const input = document.querySelector('input')!;

const inputSource = sourceFromEvent(
  input,
  'input',
  (event: Event) => () => (event.target as HTMLInputElement).value,
);

const inputValue = state('', {
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

const mousePosition = state<Position>(
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

const pressedKeys = state<string[]>([], {
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

const scrollPosition = state(0, {
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

const formState = state<FormData>(
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

const windowSize = state<WindowSize>(
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

const searchQuery = state('', {
  sources: [debouncedInputSource],
});
```

## Best Practices

✅ **Cleanup automatically handled** - Sources unsubscribe when state is destroyed
✅ **Use with throttle/debounce** - For high-frequency events
✅ **Extract to reusable functions** - Create helper functions for common patterns
✅ **Type your events** - Use specific event types (MouseEvent, KeyboardEvent)

## See Also

- [Source](/utils/source) - Source concept
- [toSource](/utils/to-source) - Convert observables to sources
- [stackedSource](/utils/stacked-source) - Combine multiple sources
