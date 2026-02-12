# stackedSource

Combine multiple sources into a single source stream.

## Import

```typescript
import { stackedSource } from '@craft-ng/core';
```

## Basic Usage

```typescript
import { Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { state, stackedSource } from '@craft-ng/core';

const add$ = new Subject<number>();
const multiply$ = new Subject<number>();
const reset$ = new Subject<void>();

const combinedSource = stackedSource(
  add$.pipe(map((n) => (state: number) => state + n)),
  multiply$.pipe(map((n) => (state: number) => state * n)),
  reset$.pipe(map(() => () => 0)),
);

const value = state(1, {
  sources: [combinedSource],
});

// Usage
add$.next(5); // value() === 6
multiply$.next(2); // value() === 12
reset$.next(); // value() === 0
```

## API

```typescript
function stackedSource<T>(
  ...sources: Array<Observable<(state: T) => T>>
): Observable<(state: T) => T>;
```

## Examples

### Counter with Multiple Actions

```typescript
import { Subject } from 'rxjs';

const increment$ = new Subject<void>();
const decrement$ = new Subject<void>();
const reset$ = new Subject<void>();
const set$ = new Subject<number>();

const counterSource = stackedSource(
  increment$.pipe(map(() => (n: number) => n + 1)),
  decrement$.pipe(map(() => (n: number) => n - 1)),
  reset$.pipe(map(() => () => 0)),
  set$.pipe(map((value) => () => value)),
);

const count = state(0, {
  sources: [counterSource],
});
```

### Todo List with CRUD Operations

```typescript
interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

const addTodo$ = new Subject<Todo>();
const removeTodo$ = new Subject<number>();
const toggleTodo$ = new Subject<number>();
const clearCompleted$ = new Subject<void>();

const todosSource = stackedSource(
  addTodo$.pipe(map((todo) => (todos: Todo[]) => [...todos, todo])),
  removeTodo$.pipe(
    map((id) => (todos: Todo[]) => todos.filter((t) => t.id !== id)),
  ),
  toggleTodo$.pipe(
    map(
      (id) => (todos: Todo[]) =>
        todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    ),
  ),
  clearCompleted$.pipe(
    map(() => (todos: Todo[]) => todos.filter((t) => !t.completed)),
  ),
);

const todos = state<Todo[]>([], {
  sources: [todosSource],
});
```

### Form State Management

```typescript
const updateName$ = new Subject<string>();
const updateEmail$ = new Subject<string>();
const resetForm$ = new Subject<void>();

interface FormState {
  name: string;
  email: string;
}

const formSource = stackedSource(
  updateName$.pipe(map((name) => (form: FormState) => ({ ...form, name }))),
  updateEmail$.pipe(map((email) => (form: FormState) => ({ ...form, email }))),
  resetForm$.pipe(map(() => () => ({ name: '', email: '' }))),
);

const form = state<FormState>(
  { name: '', email: '' },
  {
    sources: [formSource],
  },
);
```

## Benefits

✅ **Single source of truth** - All updates flow through one stream
✅ **Easier debugging** - One place to observe all state changes
✅ **Type safety** - TypeScript ensures all sources match state type
✅ **Composable** - Combine related actions logically

## Best Practices

✅ **Group related actions** - Stack sources that operate on the same state
✅ **Use descriptive names** - Clear action subjects (add$, remove$, etc.)
✅ **Keep sources pure** - No side effects in updater functions
✅ **Consider performance** - Don't stack too many high-frequency sources

## See Also

- [Source](/utils/source) - Source concept
- [toSource](/utils/to-source) - Convert to sources
- [sourceFromEvent](/utils/source-from-event) - Create from DOM events
