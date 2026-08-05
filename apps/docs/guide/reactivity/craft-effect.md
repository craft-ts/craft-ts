# craftEffect

An `effect` that can resolve craft dependencies with `yield*`.

**Use it when** a side effect needs a service.
**Not as a way to sync state** — if a value is a function of another, derive it
with `computed` instead of writing it from an effect.

## Import

```typescript
import { craftEffect } from '@craft-ng/core';
```

```typescript
craftEffect('myEffect', function* () {
  const counter = yield* Counter();
  // do some stuff
});
```

## See Also

- [craftComputed](/guide/reactivity/craft-computed)
- [craftMethod](/guide/reactivity/craft-method)
- [Local state](/guide/state/local-state) — deriving instead of writing from an effect
