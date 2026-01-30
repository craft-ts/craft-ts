# toSource

Convert observables or functions into state sources.

## Import

```typescript
import { toSource } from '@ng-angular-stack/craft';
```

## Basic Usage

```typescript
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { state, toSource } from '@ng-angular-stack/craft';

// Convert observable to source
const tickSource = toSource(
  interval(1000).pipe(map((tick) => (count: number) => count + 1)),
);

const count = state(0, {
  sources: [tickSource],
});
```

## API

### From Observable

```typescript
// Observable that emits updater functions
const updates$ = new BehaviorSubject<(state: T) => T>(/* ... */);
const source = toSource(updates$);

const myState = state(initialValue, {
  sources: [source],
});
```

### From Function

```typescript
// Function that returns updater
const updater = (payload: number) => (state: number) => state + payload;
const source = toSource(updater);
```

## Examples

### Button Clicks

```typescript
import { fromEvent } from 'rxjs';

const button = document.querySelector('button')!;
const clicks$ = fromEvent(button, 'click');

const clickSource = toSource(
  clicks$.pipe(map(() => (count: number) => count + 1)),
);

const clickCount = state(0, {
  sources: [clickSource],
});
```

### Form Input

```typescript
const input = document.querySelector('input')!;
const input$ = fromEvent(input, 'input');

const inputSource = toSource(
  input$.pipe(
    map((event) => (state: string) => (event.target as HTMLInputElement).value),
  ),
);

const inputValue = state('', {
  sources: [inputSource],
});
```

### WebSocket Messages

```typescript
import { webSocket } from 'rxjs/webSocket';

const ws$ = webSocket('ws://localhost:8080');

const messageSource = toSource(
  ws$.pipe(map((message) => (state: Message[]) => [...state, message])),
);

const messages = state<Message[]>([], {
  sources: [messageSource],
});
```

## See Also

- [Source](/utils/source) - Source concept
- [stackedSource](/utils/stacked-source) - Combine multiple sources
- [sourceFromEvent](/utils/source-from-event) - Create from DOM events
