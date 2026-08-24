# Support des resolvers craft, avec `query()` explicitement gérée

// TODO THINK about parallel route grouepd queries / query preserved (not destroyed)

## Résumé

Étendre `craftRoutes` pour supporter `resolve` au format craft, avec trois capacités en une seule passe :

- chaque resolver de route accepte une fonction ou une génératrice
- les dépendances des resolvers générateurs remontent dans `META_DATA` / `APP_CONFIG_META_DATA`
- une route expose `injectMyRouteResolverData()` et les clés résolues satisfont aussi les inputs du composant

Pour les `query()` craft-ts, le choix retenu est strict :

- un resolver ne pourra pas retourner une `query()` brute
- il devra retourner `resolveQuery(queryRef, handlers)`
- `handlers` rendra obligatoire une stratégie explicite pour `error`, et pour `exception` quand la query a des exceptions typées

## API publique

Dans [`/Users/romaingeffrault/Documents/projects/prive/craft-ts/libs/core/src/lib/craft-routes.ts`](/Users/romaingeffrault/Documents/projects/prive/craft-ts/libs/core/src/lib/craft-routes.ts), retirer `resolve` de `AngularRouteBase` et le réintroduire au format craft :

- `resolve?: Record<string, CraftRouteResolver>`
- `CraftRouteResolver` accepte une fonction ou une génératrice
- retour autorisé :
  - `T | RedirectCommand`
  - `Promise<T | RedirectCommand>`
  - `Observable<T | RedirectCommand>`
  - `ResolvedQueryResult<T>` produit par `resolveQuery(...)`

Ajouter un helper exporté :

- `resolveQuery(queryRef, handlers)`

Contrat de `resolveQuery` :

- n’accepte que des queries simples auto-start non groupées
- pas de query avec `identifier`
- pas de query `method` idle
- `handlers.error` est obligatoire
- `handlers.exception` est obligatoire si la query expose une union d’exceptions non `never`
- les handlers retournent uniquement `T | RedirectCommand | Promise<T | RedirectCommand> | Observable<T | RedirectCommand>`

Ajouter le helper route-level :

- `injectMyRouteResolverData(): Signal<ResolvedRouteData>`

Conserver la séparation choisie précédemment :

- `injectMyRouteData()` = uniquement `data` statique
- `injectMyRouteResolverData()` = uniquement `resolve`
- pour les inputs composant, `resolve` et `data` sont tous deux pris en compte
- en cas de collision, `resolve` gagne sur `data`

Exporter aussi `resolveQuery` depuis [`/Users/romaingeffrault/Documents/projects/prive/craft-ts/libs/core/src/index.ts`](/Users/romaingeffrault/Documents/projects/prive/craft-ts/libs/core/src/index.ts).

## Implémentation

### Wrapping des resolvers

- chaque entrée de `resolve` est transformée en `ResolveFn` Angular
- exécuter fonction/génératrice via `craftService({ scope: 'function' })`
- laisser passer les retours Angular officiels inchangés
- reconnaître `ResolvedQueryResult<T>` et le normaliser en `Observable<T | RedirectCommand>`

### Runtime de `resolveQuery`

- `resolveQuery` retourne un objet brandé interne, pas une `QueryRef`
- le normaliseur attend un état terminal de la query
- traiter comme succès terminal : `status() === 'resolved'` ou `status() === 'local'`, sans exception ni error
- traiter comme erreur terminale : `error()` défini ou `status() === 'error'`
- traiter comme exception terminale : `hasException() === true`
- sur succès, retourner `value()` comme valeur résolue
- sur erreur, appeler `handlers.error`
- sur exception, appeler `handlers.exception` avec l’exception courante
- si quelqu’un force une `query()` brute dans un resolver via cast, lever une erreur runtime claire indiquant qu’il faut utiliser `resolveQuery(...)`

### Typage des données résolues

- `ResolvedRouteData<RouteDefinition>` doit unwrap :
  - génératrice
  - `Promise`
  - `Observable`
  - `ResolvedQueryResult<T>` vers `T`
- exclure `RedirectCommand` du type exposé par `injectMyRouteResolverData()` et des inputs composant
- garder `resolve` prioritaire sur `data` pour la satisfaction typée des inputs

### Dépendances et helpers route

- agréger les deps des resolvers générateurs avec la même mécanique que les guards
- fusionner ces deps dans `deps` route-level, puis retirer les providers déjà satisfaits par la route
- enregistrer un nouveau route value service `...ResolverData`
- `injectMyRouteData()` doit filtrer `ActivatedRoute.data` aux seules clés statiques
- `injectMyRouteResolverData()` doit filtrer `ActivatedRoute.data` aux seules clés résolues

## Patterns à supporter et documenter

Pattern recommandé, redirection sur erreur technique et switch métier sur exception :

```ts
resolve: {
  user: function* () {
    const api = yield* UsersApiToYield();
    const router = yield* RouterToYield();

    return resolveQuery(
      query({
        params: () => route.params['userId'],
        loader: ({ params }) => api.getUser(params),
      }),
      {
        error: ({ error }) =>
          new RedirectCommand(router.createUrlTree(['/error'])),
        exception: ({ exception }) => {
          switch (exception.code) {
            case 'UserNotFoundException':
              return new RedirectCommand(router.createUrlTree(['/404']));
            case 'UserAccessForbiddenException':
              return new RedirectCommand(router.createUrlTree(['/login']));
          }
        },
      },
    );
  },
}
```

Pattern fallback local :

- `error` ou `exception` retournent une valeur de fallback du même type que la query au lieu d’une redirection

Pattern factorisé :

- extraire une policy réutilisable `const withRouteQueryPolicy = <T>(queryRef) => resolveQuery(queryRef, ...)`

## Tests

Dans [`/Users/romaingeffrault/Documents/projects/prive/craft-ts/libs/core/src/lib/craft-routes.spec.ts`](/Users/romaingeffrault/Documents/projects/prive/craft-ts/libs/core/src/lib/craft-routes.spec.ts) :

- typage :
  - `resolve` accepte fonction sync, génératrice, `Promise`, `Observable`, `resolveQuery(...)`
  - `resolveQuery` accepte une query simple auto-start
  - `resolveQuery` refuse une query groupée `identifier`
  - `resolveQuery` refuse une query `method`
  - `resolveQuery` exige `error`
  - `resolveQuery` exige `exception` quand la query a des exceptions typées
  - une `query()` brute n’est pas acceptée comme retour de resolver
  - `injectMyRouteResolverData()` est exposé avec le bon type
  - `injectMyRouteData()` reste statique-only
  - les clés `resolve` satisfont les inputs composant
  - si une clé existe dans `data` et `resolve`, la version `resolve` gagne
  - les deps d’un resolver générateur apparaissent dans `META_DATA`
  - elles disparaissent si déjà couvertes par `route.providers`

- runtime :
  - `toRoutes()` produit bien un objet Angular `resolve`
  - un resolver générateur peut `yield*` plusieurs services
  - `resolveQuery` attend la réussite de la query puis résout sa valeur
  - `resolveQuery` traite `status === 'local'` comme succès
  - `resolveQuery` redirige via `error`
  - `resolveQuery` redirige ou fallback via `exception`
  - une `query()` brute forcée par cast jette une erreur claire
  - `injectMyRouteResolverData()` n’expose que les clés résolues et reste réactif
  - `injectMyRouteData()` sur une route mixte n’expose que les clés statiques

Dans [`/Users/romaingeffrault/Documents/projects/prive/craft-ts/libs/core/src/lib/craft-app-config.spec.ts`](/Users/romaingeffrault/Documents/projects/prive/craft-ts/libs/core/src/lib/craft-app-config.spec.ts) :

- un resolver générateur enrichit `APP_CONFIG_META_DATA.missingProvider`
- idem quand le resolver retourne `resolveQuery(query(...), ...)`

## Hypothèses retenues

- le support “query dans resolver” passe par `resolveQuery(...)`, pas par `return query(...)` brut
- seuls les resolvers générateurs remontent automatiquement des deps typées
- seule la valeur finale de la query est injectée dans `ResolverData`, jamais la `QueryRef`
- `resolveQuery` est limité à une query simple auto-déclenchée non groupée
- `handlers.error` et `handlers.exception` doivent retourner le même type métier que la query, ou un `RedirectCommand`
