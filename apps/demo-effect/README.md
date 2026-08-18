# EffectTS + CraftTS demo

Application dedicated to concrete EffectTS and CraftTS integration examples.

## Serve

From the repository root:

```bash
npx nx serve demo-effect
```

The application starts at `http://localhost:4201` and presents a small
mocked users-and-access journey. The Effect bridge is installed globally in
`src/app/app.config.ts`; loaders return their `Effect<A, E, R>`.

The home page (`/`) demonstrates a support agent consulting a user profile.
The business outcomes are a found profile, a missing profile, an expired
session and a technical database failure. Typed Effect errors and defects are
kept distinct.

The `/access` example checks a user's access level through a shared mocked
`AccessPolicyService`. The component only calls `checkUserAccess`; the
application Layer satisfies the service requirement.

The `/team` example loads a mocked team overview. Its business operation uses
the global session Layer from `app.config.ts` and the route-scoped team Layer
from the route's `providers`. The query returns a `TeamOverview`, not the
services used to build it.

Use `queryEffect`, `mutationEffect`, and `asyncProcessEffect` at the boundary
between an Effect domain and a Craft primitive. Parameters remain synchronous
Craft values or sources: there is intentionally no `stateEffect`. Direct
`runEffect(effect)` remains available for low-level cases and allows an
explicit `assertNoRequirements`; adapters resolve `R` through the nearest
`provideLayer(...)`.

Typed `E` errors become Craft exceptions based on their `_tag`. Defects
(`Effect.die`) remain technical errors, and interruption remains cancellation.

```ts
const userQuery = yield* queryEffect('userQuery', {
  params: request,
  loader: ({ params }) => loadUser(params.scenario),
});

const saveUser = yield* mutationEffect('saveUser', {
  method: (user: UserInput) => user,
  loader: ({ params }) => persistUser(params),
});

const refresh = yield* asyncProcessEffect('refresh', {
  method: (id: string) => id,
  loader: ({ params }) => refreshUser(params),
});
```

Synchronous derivations continue to use `craftComputed`. Reactive parameters
remain synchronous and native to Craft: `stateEffect` does not exist.

## Verification

```bash
npx nx typecheck demo-effect
npx nx typecheck-spec demo-effect
npx nx test demo-effect
npx nx build demo-effect
npx nx architecture demo-effect
npx nx typecheck-architecture demo-effect
```

Le graphe statique de l’application est analysé depuis
`tsconfig.graph.json`. Depuis la racine du dépôt, `npm run graph:update` met à
jour les artefacts `craft-dependency-graph.demo-effect.{json,mmd,html}`.
Pour l’architecture seule, `npx nx architecture demo-effect` exécute les règles
Vitest regroupées dans `architecture/architecture.spec.ts`, sans démarrer
Angular. Le graphe TypeScript n’est donc construit qu’une seule fois.
