# Plan — composition par `pipe` et transmission typée du contexte

## Objectif

Remplacer, pour les server functions portables, la composition fluente basée
sur `.use(...)` par une composition de layers proche d’un pipeline Effectful,
sans imposer Effect au core ni au programme exécuté.

La cible est :

```ts
portableServerFunction(...)
  .pipe(
    withMatchingUser,
    mapContext(({ context }) => ({
      userId: context.user.id,
    })),
    flatMapContext(({ context }) => loadPermissions(context.userId)),
  )
  .handler(({ input, context }) => ...);
```

Chaque layer doit transmettre un envelope immuable et typé. Le handler et les
layers suivants doivent voir les enrichissements précédents sans recourir à un
`context` non typé ou à une mutation implicite.

## Périmètre de migration

### À migrer

- `apps/demo-with-server-function/src/users/portable-list.fn-serveur.ts`
- `apps/demo-with-server-function/src/users/portable-audit.mw-serveur.ts`
- la façade client et la page `/portable`, uniquement si leur contrat change
- les tests E2E de l’exemple Promise portable

L’exemple portable doit continuer à fonctionner sans importer Effect côté
server function, middleware ou adapter applicatif.

### À conserver comme références

- `list.fn-serveur.ts` : server function Effect existante ;
- `authenticated-list.fn-serveur.ts` : server function Effect avec contexte
  client et autorisation ;
- `effect-middleware-list.*` : exemple explicite de `effectServerMiddleware`.

Ces exemples ne doivent pas être artificiellement convertis vers la nouvelle
API portable. Ils servent à comparer la composition native Effect avec la
composition générique par `pipe`.

## Principes de conception

- `@craft-ts/core` ne connaît toujours aucun type runtime Effect.
- `.pipe(...)` devient le point d’entrée de la composition des server layers.
- `.handler(...)` reste le terminal du pipeline.
- Les layers ne mutent jamais le contexte existant ; ils transmettent un nouvel
  envelope.
- `input`, `clientContext` et `context` restent trois canaux distincts.
- Les enrichissements produits par une couche sont visibles dans le type des
  couches suivantes et du handler.
- Une couche peut enrichir, transformer, court-circuiter ou observer l’exécution
  aval.
- Le programme retourné reste opaque : Promise, Task, `TaskEither`, valeur
  synchrone ou autre abstraction sont branchés par un adapter.
- `.use(...)` reste compatible pendant la transition, mais les nouveaux
  exemples portables ne doivent plus l’utiliser.

## Décision à prendre pendant le spike : le rôle exact de `.pipe`

Le builder possède déjà `.pipe(...)` pour des `ServerFunctionPipe` déclaratifs,
par exemple une permission ou une exigence de contexte. Il faut éviter une
collision sémantique entre :

1. un pipe de contrat, qui ajoute une déclaration Craft ;
2. un layer de programme, qui compose une exécution et enrichit un payload.

Le spike devra comparer deux options :

```ts
// Option recommandée : les deux formes sont distinguées par leur contrat.
portableServerFunction(...)
  .pipe(requireServerPermission('users:read'))
  .pipe(withMatchingUser, mapContext(...))
  .handler(...);
```

```ts
// Option de repli si l’inférence devient ambiguë.
portableServerFunction(...)
  .pipeConfig(requireServerPermission('users:read'))
  .pipe(withMatchingUser, mapContext(...))
  .handler(...);
```

Le choix sera guidé par la lisibilité des erreurs TypeScript, la stabilité de
l’API publique et l’absence de cast `any` dans les exemples.

## Modèle de payload cible

Le modèle conceptuel est un envelope qui sépare les canaux :

```ts
type ServerEnvelope<Input, Context, ClientContext> = {
  readonly input: Input;
  readonly context: Context;
  readonly clientContext: ClientContext;
};
```

Un layer composable reçoit l’envelope courant et une continuation vers
l’envelope enrichi :

```ts
type ServerLayer<Before, Added, Program, Output> = (
  next: (envelope: ServerEnvelope<Input, Before & Added, ClientContext>) => Program,
) => (
  envelope: ServerEnvelope<Input, Before, ClientContext>,
) => Program;
```

La forme exacte sera arrêtée pendant le spike. Les invariants sont les suivants :

- `withMatchingUser` ajoute `user` au contexte ;
- `mapContext` ajoute les clés retournées par son callback ;
- `flatMapContext` peut retourner le programme choisi par l’application ;
- une couche aval reçoit le contexte cumulé, jamais seulement son propre patch ;
- le handler reçoit le contexte final cumulé.

## Sémantique des trois formes de composition

### `withXxx`

Pour les couches qui portent une règle métier, une validation, un accès DI ou
des hooks avant/après :

```ts
const withMatchingUser = serverLayer(
  'demo.matching-user',
  async ({ context, next, resolve }) => {
    const user = await resolve(CurrentUser);
    if (!user) return deny('AuthenticatedUserMissing');
    return next({ context: { user } });
  },
);
```

Le layer reste responsable de l’ordre, du court-circuit et de l’observation de
l’échec aval.

### `mapContext`

Pour une dérivation pure et synchrone :

```ts
mapContext(({ context }) => ({
  userId: context.user.id,
}))
```

Le résultat est fusionné dans le contexte existant. Une valeur scalaire isolée
ne doit pas être acceptée par défaut : elle ne donne pas de clé à inférer et
rend le payload moins lisible.

### `flatMapContext`

Pour une dérivation qui doit exécuter une Promise, une Task ou une autre valeur
de programme :

```ts
flatMapContext(({ context }) =>
  loadPermissions(context.userId).then((permissions) => ({
    permissions,
  })),
)
```

Le résultat doit être normalisé par l’adapter choisi. Le core ne doit pas
`await` une valeur dont il ne connaît pas le protocole avant d’avoir appelé cet
adapter.

## Phases d’implémentation

### Phase 1 — spike de typage

- Prototyper `ServerEnvelope`, `ServerLayer` et le fold du contexte hors de la
  surface publique.
- Vérifier l’inférence d’une chaîne : `{}` → `{ user }` → `{ user, userId }` →
  `{ user, userId, permissions }`.
- Vérifier qu’un accès à `context.user` avant `withMatchingUser` échoue avec un
  diagnostic lisible.
- Vérifier que deux layers produisant la même clé sont refusés ou signalés de
  manière explicite.
- Comparer `.pipe(ServerFunctionPipe)` et `.pipe(ServerLayer)` afin de décider
  si une surcharge suffit ou si un nom séparé est nécessaire.

### Phase 2 — runtime portable dans `@craft-ts/core`

- Introduire le contrat de layer portable et l’envelope runtime.
- Faire composer les layers passés à `.pipe(...)` dans l’ordre déclaré.
- Préserver les hooks avant/après, le court-circuit et la propagation d’erreurs.
- Réutiliser les schémas d’input et de contexte client existants.
- Faire passer le contexte cumulé au handler sans copier manuellement chaque
  patch dans le registre.
- Maintenir `.use(...)` comme adapter de compatibilité vers l’ancien moteur.
- Ne pas ajouter d’import runtime Effect au core.

### Phase 3 — opérateurs de contexte

- Ajouter `mapContext` pour les enrichissements synchrones.
- Ajouter `flatMapContext` pour les programmes opaques retournant un payload.
- Définir les règles de fusion, de collision de clés et de court-circuit.
- Vérifier que les opérateurs restent composables dans une chaîne onion avec
  un layer `withXxx`.
- Documenter la différence entre un enrichissement de contexte et un
  `clientContext` déclaré par le navigateur.

### Phase 4 — adapters non-Effect

- Conserver l’adapter natif pour les valeurs et Promise.
- Ajouter un test avec une abstraction `Task` minimale locale au test.
- Vérifier que `flatMapContext` ne dépend pas d’un `await` caché dans le core.
- Vérifier qu’une erreur du programme est observée par les layers aval et
  remontée au transport sans perdre le payload d’erreur.

### Phase 5 — migration de l’exemple portable

- Transformer `portableAudit` en layer de composition utilisable dans `.pipe`.
- Faire produire son `auditId` dans le contexte cumulé.
- Ajouter un `mapContext` ou un `flatMapContext` dans l’exemple pour montrer
  concrètement une donnée produite par une couche et consommée par la suivante.
- Migrer `portableListUsers` de `.use(portableAudit)` vers `.pipe(...)`.
- Conserver le handler Promise et l’absence d’import Effect.
- Mettre à jour la page `/portable` pour afficher le flux de payload entre les
  layers, sans introduire un second backend métier.

### Phase 6 — tests et graphe d’architecture

- Tests core : chaîne vide, enrichissement cumulatif, Promise, Task, erreur,
  court-circuit et hook après échec.
- Tests de typage : contexte absent, clé produite, collision et handler final.
- Test démo : appel client réel avec réponse filtrée et payload enrichi.
- Test de non-régression : les exemples `list`, `authenticated-list` et
  `effect-middleware-list` restent inchangés.
- Adapter le graphe pour reconnaître les layers déclarés dans `.pipe(...)` et
  conserver les liens `server-function → middleware`.
- Vérifier que l’exemple migré n’est plus catalogué comme dépendant de `.use`.

### Phase 7 — documentation et transition

- Documenter `.pipe`, `withXxx`, `mapContext` et `flatMapContext` dans l’exemple
  portable.
- Ajouter un tableau de choix : pure, Promise/Task, Effect.
- Documenter `.use(...)` comme compatibilité legacy, sans le supprimer dans ce
  changement.
- Comparer les types et l’ordre d’exécution avant/après migration.
- Décider séparément si les anciennes server functions doivent être migrées
  après validation de l’exemple portable.

## Critères d’acceptation

- L’exemple portable ne contient plus `.use(...)` pour composer son middleware.
- `withMatchingUser` peut enrichir le contexte consommé par le layer suivant.
- `mapContext` transmet des clés typées au layer suivant et au handler.
- `flatMapContext` fonctionne avec Promise et une Task de test sans Effect.
- Le core reste sans dépendance runtime Effect.
- Les erreurs et les court-circuits conservent leur payload à travers toute la
  chaîne.
- Les trois exemples Effect existants restent fonctionnels et ne sont pas
  artificiellement convertis.
- Les tests du core et de `demo-with-server-function` passent.
- Le graphe d’architecture voit la composition et son ordre.

## Hors périmètre

- Remplacer `effectServerMiddleware` ou redessiner la composition native Effect.
- Migrer `authenticated-list` ou `list` vers le runtime portable.
- Supprimer immédiatement `.use(...)` de l’API publique.
- Changer le protocole de contexte client ou les handshakes existants.
- Ajouter une nouvelle bibliothèque Task au dépôt uniquement pour la démo.
