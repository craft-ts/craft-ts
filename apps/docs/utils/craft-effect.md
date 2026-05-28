# craftEffect

Creates effect-friendly generator handlers that can use `yield*` with the craft runtime.

## Import

```typescript
import { craftEffect } from '@craft-ng/core';
```

```typescript
craftEffect('myEffect', function* () {
  const counter = yield* CounterToYield();
  // do some stuff
});
```
