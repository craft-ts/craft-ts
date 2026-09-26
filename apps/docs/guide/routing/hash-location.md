# Fixed URL routing with hashes

Use `withHashLocation()` when a client application must stay at the same
browser path and the static host only serves `/`:

```ts
import { provideCraftRouter, withHashLocation } from '@craft-ts/core';

provideCraftRouter(appRoutes.toRoutes(), withHashLocation());
```

The router stores its path, query parameters and fragment after the first `#`:
`/#/products/42?page=2#details`. Route declarations, typed params and query
params stay the same. Links, navigation, redirects, active-link checks and
browser history use the selected strategy. `navigateByUrl` accepts both an
internal URL such as `/products/42?page=2` and its hash form.

Path routing remains the default. Hash routing is for client-rendered apps:
the browser does not send the fragment to the server, so SSR cannot choose a
route from it.
