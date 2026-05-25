# @craft-ng/runtime-dev-tools

Runtime DevTools panel for craft-ng. Provides a floating overlay with:

- Chronological timeline of every method/mutation/query call
- Live state tree grouped by HostTag
- Query/mutation inspector (status, duration, cache hits) à la tanstack
- Error log correlated by correlationId

## Usage

```ts
import { provideCraftDevTools } from '@craft-ng/runtime-dev-tools';

export const appConfig = craftAppConfig({
  providers: [
    // ...
    import.meta.env.DEV && provideCraftDevTools(),
  ],
});
```

The provider is opt-in. Don't include it in production builds and the lib is fully tree-shaken.
