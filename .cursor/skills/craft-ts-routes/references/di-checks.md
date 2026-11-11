# Route DI checks

Use `ComponentDepsOf` directly on the Craft component. A separate generated alias can become stale
and must not be used as the input to `RouteCheckedDI`.

```ts
import type { CanRun, RouteCheckedDI } from '@craft-ts/core';

type DetailDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./detail'))['default']>,
  AppProvidedNames | 'FeatureStore',
  AppProvidedValues,
  'Detail'
>;
type _CanRunDetail = CanRun<DetailDI>;
```

For lazy components, `loadCraftComponent` carries the same inferred contract onto the route. Keep
one DI check in every `craftRoutes` file, including collections mounted through `loadChildren`.
