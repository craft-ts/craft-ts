# Plan — rendre `craftMiddleware` yieldable

## Statut

Nouvelle sémantique assumée. La compatibilité avec les middleware qui reposent
sur `next()` n’est pas un objectif.

## Objectif

Conserver un seul concept public, `craftMiddleware`, avec deux modes
d’utilisation :

```ts
// Exécution déclarative avant le handler.
serverFunction(...)
  .use(auditedRequest)
  .handler(...);
```

```ts
// Exécution locale dans le programme du handler.
const authenticatedUser = yield* matchingUser;
```

Les deux formes doivent utiliser le même middleware, les mêmes métadonnées et
les mêmes types de résultat et d’erreur.

## Décision d’architecture

`craftMiddleware` ne doit plus être fondé sur `next()`.

La nouvelle interface est une opération de requête yieldable :

- elle lit ses dépendances dans la DI ;
- elle lit le contexte client validé dans la DI ;
- elle retourne une valeur ou échoue ;
- elle peut publier un fragment de contexte lorsqu’elle est utilisée avec
  `.use(...)` ;
- elle porte toujours son id, ses schémas, ses handshakes et ses dépendances.

Les concepts suivants sont supprimés de la nouvelle API serveur :

- `next()` obligatoire ;
- composition onion ;
- hooks `after` autour du handler ;
- `MiddlewareResult` basé sur la continuation ;
- exécution implicite de la suite par appel à `next()`.

## Contrat cible

Le résultat d’un middleware doit séparer la valeur yieldée du contexte publié
par `.use(...)` :

```ts
type CraftMiddlewareResult<Value, ContextOut extends MiddlewareContext = {}> = {
  readonly value: Value;
  readonly context?: ContextOut;
};
```

Un middleware peut donc retourner une valeur simple :

```ts
const matchingUser = craftMiddleware('demo.matching-user')
  .pipe(clientContext(claimedUserHandshake))
  .server(() =>
    Effect.gen(function* () {
      const claimed = yield* ClaimedUserContext;
      const authenticatedUser = yield* CurrentUser;

      if (claimed.userId !== authenticatedUser.id) {
        return yield* new AuthenticatedUserMismatch({
          message: 'The claimed user does not match the session.',
          requestedUserId: claimed.userId,
          authenticatedUserId: authenticatedUser.id,
        });
      }

      return {
        value: authenticatedUser,
      };
    }),
  );
```

La syntaxe finale doit idéalement exposer directement la valeur :

```ts
const authenticatedUser = yield* matchingUser;
authenticatedUser.id; // User, pas CraftMiddlewareResult<User>
```

Le wrapper `{ value, context }` reste interne au runtime ou est aplati par le
constructeur. Il ne doit pas polluer la DX du handler.

## Sémantique de `.use(...)`

`.use(myMiddleware)` reste autorisé, mais ne signifie plus « ajouter une
continuation ». Il signifie :

1. exécuter le middleware une fois au début de l’invocation ;
2. arrêter l’invocation si le middleware échoue ;
3. fusionner son `context` déclaré dans le contexte du handler ;
4. mémoriser sa valeur dans le scope de la requête.

Exemple :

```ts
const auditedRequest = craftMiddleware('demo.request-audit')
  .pipe(
    clientContext(requestedByHandshake),
    clientContext(requestLocaleHandshake),
  )
  .server(() =>
    Effect.gen(function* () {
      const { requestedBy, locale } = yield* RequestClientContext;

      yield* Effect.log(
        `requestedBy=${requestedBy} locale=${locale}`,
      );

      return {
        value: undefined,
        context: { requestLocale: locale },
      };
    }),
  );
```

La server function peut continuer à l’utiliser ainsi :

```ts
serverFunction(...)
  .use(auditedRequest)
  .handler(({ context }) =>
    Effect.gen(function* () {
      context.requestLocale; // string
      // ...
    }),
  );
```

Le résultat de `auditedRequest` n’est pas nécessairement consommé directement,
mais son fragment de contexte reste disponible.

## Sémantique de `yield* myMiddleware`

`yield* myMiddleware` exécute le même programme dans le point courant du
handler et retourne sa valeur métier :

```ts
.handler(() =>
  Effect.gen(function* () {
    const user = yield* matchingUser;
    const repository = yield* UserRepository;

    return yield* repository.listForUser(user.id);
  }),
)
```

Si le même middleware est présent dans `.use(...)` et yieldé dans le handler,
le runtime doit réutiliser le résultat mémorisé de l’invocation :

```ts
serverFunction(...)
  .use(matchingUser)
  .handler(() =>
    Effect.gen(function* () {
      // Pas de double vérification dans la même requête.
      const user = yield* matchingUser;
      return user.id;
    }),
  );
```

La mémorisation est limitée à une invocation et indexée par l’id du
middleware. Une collision d’id avec des implémentations différentes doit rester
une erreur.

## Contexte client dans la DI

Le registre valide toujours le contexte client avant d’exécuter le handler,
mais il ne le passe plus comme argument obligatoire aux middleware. Il fournit
à la place des services typés par handshake :

```ts
const ClaimedUserContext = craftRequestContext(
  claimedUserHandshake,
  Schema.Struct({ userId: Schema.String }),
);

const RequestClientContext = craftRequestContext(
  requestContextHandshake,
  Schema.Struct({
    requestedBy: Schema.String,
    locale: Schema.String,
  }),
);
```

À l’entrée de l’invocation :

```ts
const requestLayer = Layer.mergeAll(
  runtimeLayer,
  Layer.succeed(ClaimedUserContext)({ userId: 'user-ada' }),
  Layer.succeed(RequestClientContext)({
    requestedBy: 'user-ada',
    locale: 'fr-FR',
  }),
);
```

Le service doit contenir la valeur annoncée par le navigateur, pas une valeur
présentée comme déjà authentifiée. `matchingUser` reste responsable de la
comparer avec `CurrentUser` avant de retourner un utilisateur de confiance.

## Dépendances de middleware

Les dépendances restent déclarées par `.pipe(...)`, mais elles ne sont plus
exécutées par `next()` :

```ts
const adminOnly = craftMiddleware('demo.admin-only').server(() =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;

    if (user.role !== 'admin') {
      return yield* new AdminRequired({
        authenticatedUserId: user.id,
      });
    }

    return { value: user };
  }),
);

const matchingUser = craftMiddleware('demo.matching-user')
  .pipe(adminOnly, clientContext(claimedUserHandshake))
  .server(() =>
    Effect.gen(function* () {
      const admin = yield* adminOnly;
      const claimed = yield* ClaimedUserContext;

      if (claimed.userId !== admin.value.id) {
        return yield* new AuthenticatedUserMismatch(/* ... */);
      }

      return { value: admin.value };
    }),
  );
```

Le runtime déduplique l’exécution par id. Le code d’un middleware qui dépend
d’un autre doit néanmoins l’exprimer explicitement par `yield*`, afin que la
valeur consommée soit visible dans le programme.

## Middleware client

Le même constructeur reste disponible côté client, mais avec le runtime Craft
client. Le terminal `.client(...)` ne reçoit plus `next()` : il retourne
directement le fragment publié.

```ts
const requestedByContext = craftMiddleware('demo.requested-by').client(
  function* () {
    const session = yield* ClientSession;
    return { requestedBy: session.userId };
  },
);
```

`.use(...)` ou `.pipe(...)` côté client ordonne les opérations et fusionne les
fragments retournés. La composition ne repose plus sur une continuation
manuelle.

La forme `yield* myMiddleware` est donc runtime-spécifique :

- côté serveur, elle yield un programme Effect ;
- côté client, elle yield un programme Craft ;
- l’interface et les métadonnées restent communes.

## Suppression de l’ancienne sémantique

Les éléments suivants doivent être retirés, et non conservés comme chemins de
compatibilité :

- `MiddlewareNext` ;
- les surcharges `.server(({ next }) => ...)` ;
- `runMiddlewareChain` basé sur l’index et `next()` ;
- les types de résultat opaques fabriqués uniquement par `next()` ;
- les tests d’ordre onion et d’after-hook ;
- les exemples documentant `Effect.exit(next())`.

Les tests doivent être réécrits pour vérifier l’ordre d’exécution des valeurs
yieldées et des middleware `.use(...)`, pas l’ordre d’une chaîne onion.

## Phases d’implémentation

### Phase 1 — fixer le nouveau contrat

- Définir `CraftMiddlewareResult` et le type yieldable serveur.
- Définir le résultat client direct.
- Décider si le wrapper `value/context` est public ou aplati.
- Supprimer les types publics liés à `next()`.
- Ajouter les tests de type pour les canaux `Success`, `Error` et `Requirements`.

### Phase 2 — runtime serveur

- Remplacer `runMiddlewareChain` par un exécuteur de programmes yieldables.
- Exécuter `.use(...)` dans l’ordre de déclaration.
- Fusionner les contextes retournés.
- Mémoriser les résultats par id et par invocation.
- Court-circuiter immédiatement sur erreur.
- Détecter les cycles de dépendances.

### Phase 3 — DI du contexte client

- Ajouter les services de contexte liés aux handshakes.
- Fournir ces services après validation par le registre.
- Conserver les diagnostics de contexte client manquant ou invalide.
- Vérifier que le contexte client ne devient jamais automatiquement un contexte
  serveur de confiance.

### Phase 4 — runtime client

- Remplacer les callbacks `.client(({ next }) => ...)` par des générateurs qui
  retournent directement un fragment.
- Fusionner les fragments dans `.use(...)` et `.pipe(...)`.
- Mettre à jour le transport et les façades client.

### Phase 5 — migration complète des usages

- Réécrire `adminOnly`, `matchingUser` et `auditedRequest`.
- Réécrire `effectAudit` sans after-hook, en gardant son erreur et son log.
- Réécrire les middleware client de `request-context.mw-client.ts`.
- Mettre à jour tous les exemples et tests qui utilisent `next()`.
- Supprimer les mentions de compatibilité avec l’ancien modèle.

### Phase 6 — outils et documentation

- Mettre à jour le graphe de dépendances pour les valeurs yieldables.
- Conserver la détection des ids, des handshakes et des dépendances transitives.
- Mettre à jour les règles de nommage et les diagnostics d’architecture.
- Documenter `.use(myMiddleware)` et `yield* myMiddleware` comme deux formes
  officielles du même contrat.

## Matrice de tests

| Cas | Attendu |
| --- | --- |
| `yield* middleware` réussi | retourne la valeur typée |
| `yield* middleware` échoué | propage l’erreur typée |
| `.use(middleware)` réussi | exécute avant le handler |
| `.use(middleware)` échoué | le handler n’est pas exécuté |
| `.use` + `yield*` du même id | une seule exécution par requête |
| contexte publié par `.use` | disponible dans `context` |
| handshakes absents | validation avant le handler |
| dépendance transitive | exécutée une seule fois |
| ids dupliqués | erreur explicite |
| middleware client | fragment direct, sans `next()` |
| absence de `next()` | erreur de compilation |

## Critères d’acceptation

- `craftMiddleware` reste le seul constructeur public de middleware.
- `yield* myMiddleware` fonctionne côté serveur et côté client dans leur runtime
  respectif.
- `.use(myMiddleware)` reste autorisé avec la nouvelle sémantique.
- Aucun runtime ne dépend d’un appel à `next()`.
- Le contexte client est obtenu par DI après validation.
- Les erreurs, handshakes, dépendances et ids restent typés et analysables.
- Les anciens middleware ne sont pas supportés par compatibilité : ils sont tous
  migrés dans le dépôt.
