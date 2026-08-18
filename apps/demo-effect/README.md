# EffectTS + CraftTS demo

Application dédiée aux exemples d’intégration entre EffectTS et CraftTS.

## Serve

Depuis la racine du dépôt :

```bash
npx nx serve demo-effect
```

L’application démarre sur `http://localhost:4201` et présente l’exemple
`queryEffect`. Le bridge Effect est installé globalement dans
`src/app/app.config.ts`; les loaders retournent directement leur
`Effect<A, E, R>`.

Utiliser `queryEffect`, `mutationEffect` et `asyncProcessEffect` aux frontières
entre un domaine Effect et une primitive Craft. Les paramètres restent des
valeurs ou sources synchrones Craft : il n’existe volontairement pas de
`stateEffect`. Un `runEffect(effect)` direct reste disponible pour les cas
bas niveau et permet d’ajouter explicitement `assertNoRequirements`; pour les
adaptateurs, les besoins `R` sont résolus par le `provideLayer(...)` le plus
proche.

Les erreurs typées `E` deviennent des exceptions Craft basées sur leur `_tag`.
Les défauts (`Effect.die`) restent des erreurs techniques et l’interruption
reste une annulation.

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

Les dérivations synchrones utilisent toujours `craftComputed`. Les paramètres
réactifs restent synchrones et natifs Craft : `stateEffect` n’existe pas.

## Vérifications

```bash
npx nx typecheck demo-effect
npx nx typecheck-spec demo-effect
npx nx test demo-effect
npx nx build demo-effect
```
