# Plan — Adaptateurs EffectTS pour CraftTS

## Objectif

Créer une couche d’adaptateurs EffectTS au-dessus des primitives CraftTS afin de réduire le boilerplate et d’imposer une intégration cohérente dans `demo-effect`.

## 1. Définir l’API publique

Créer dans `@craft-ts/effect` :

- `queryEffect(...)`
- `mutationEffect(...)`
- `asyncProcessEffect(...)`
- éventuellement `computedEffect(...)`

Exemple :

```ts
const userQuery = yield* queryEffect('userQuery', {
  params: request,
  loader: ({ params }) => loadUser(params.scenario),
});
```

`runEffect(...)` restera disponible pour les cas avancés ou non couverts.

## 2. Ajouter un helper interne commun

Créer un helper qui transforme automatiquement un callback Effect en generator CraftTS :

```ts
function effectLoader(callback) {
  return function* (context) {
    return yield* runEffect(callback(context));
  };
}
```

Il devra préserver :

- le type de résultat `A` ;
- les erreurs Effect `E` ;
- leur propagation vers les exceptions CraftTS ;
- les éventuelles contraintes d’environnement `R`.

## 3. Implémenter les adaptateurs principaux

### `queryEffect`

Adapter automatiquement le `loader`.

### `mutationEffect`

Adapter l’opération Effect de la mutation.

### `asyncProcessEffect`

Adapter le `loader` Effect.

Les paramètres resteront synchrones et natifs CraftTS :

```ts
params: request
```

Un Effect ne devra pas être utilisé directement comme paramètre réactif.

## 4. Définir le comportement de `state`

Ne pas créer `stateEffect`.

`state` doit rester synchrone :

```ts
const request = yield* state(...);
```

Pour déclencher un Effect depuis un état :

```text
state → queryEffect
state → asyncProcessEffect
```

## 5. Ajouter une règle ESLint dédiée à `demo-effect`

La règle devra imposer l’utilisation des adaptateurs Effect-aware.

Elle devra :

- interdire `query(...)` directement ;
- imposer `queryEffect(...)` ;
- interdire `mutation(...)` directement ;
- imposer `mutationEffect(...)` ;
- interdire `asyncProcess(...)` directement ;
- imposer `asyncProcessEffect(...)` ;
- interdire les imports directs correspondants depuis `@craft-ts/core` ;
- autoriser `state(...)` ;
- autoriser `runEffect(...)` pour les cas bas niveau ;
- autoriser les tests et le code interne de `@craft-ts/effect`.

Message attendu :

```text
Use queryEffect(...) in demo-effect instead of query(...).
Effect demos must use the Effect-aware CraftTS adapters.
```

La règle devra être active uniquement dans `apps/demo-effect`.

## 6. Traiter les dérivations

Évaluer l’ajout de `computedEffect(...)` uniquement pour les dérivations retournant réellement un `Effect`.

Les dérivations synchrones continueront d’utiliser `craftComputed`.

Les dérivations dépendant d’une primitive devront rester dans l’insertion de cette primitive :

```ts
queryEffect('userQuery', config, ({ resource }) => ({
  userName: computedEffect('userName', () => ...),
}));
```

## 7. Ajouter les tests

Pour chaque adaptateur, tester :

- succès Effect → valeur CraftTS ;
- `Effect.fail` → exception CraftTS ;
- `Effect.die` → erreur technique ;
- interruption ;
- propagation des types d’erreur ;
- exhaustivité des handlers de route.

Pour la règle ESLint, tester :

- détection des imports directs ;
- détection des appels directs ;
- acceptation des nouveaux adaptateurs ;
- autorisation de `state` ;
- autorisation de `runEffect` ;
- activation limitée à `demo-effect`.

## 8. Migrer `demo-effect`

Remplacer :

```ts
loader: function* ({ params }) {
  return yield* runEffect(loadUser(params.scenario));
}
```

par :

```ts
loader: ({ params }) => loadUser(params.scenario)
```

via `queryEffect`.

Le bridge global restera installé une seule fois dans :

```text
apps/demo-effect/src/app/app.config.ts
```

## 9. Documenter les usages

Documenter :

- quand utiliser `queryEffect` ;
- quand utiliser `mutationEffect` ;
- quand utiliser `asyncProcessEffect` ;
- quand utiliser directement `runEffect` ;
- pourquoi `stateEffect` n’existe pas ;
- comment les erreurs Effect deviennent des exceptions CraftTS ;
- comment fournir un environnement Effect avec `provideLayer`.

## 10. Vérification finale

```bash
npx nx run effect:test
npx nx run demo-effect:typecheck
npx nx run demo-effect:typecheck-spec
npx nx run demo-effect:lint
npx nx run demo-effect:test
npx nx run demo-effect:build
```
