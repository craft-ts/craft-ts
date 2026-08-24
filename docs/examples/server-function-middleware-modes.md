# Middleware yieldable de server function

`craftMiddleware` est l’unique constructeur public. Un middleware serveur
retourne un `CraftMiddlewareResult` dans son programme Effect :

```ts
const matchingUser = craftMiddleware('demo.matching-user')
  .pipe(clientContext(claimedUserHandshake))
  .server(() =>
    Effect.gen(function* () {
      const claimed = yield* ClaimedUserContext;
      const authenticated = yield* CurrentUser;

      if (claimed.userId !== authenticated.id) {
        return yield* new AuthenticatedUserMismatch({
          requestedUserId: claimed.userId,
          authenticatedUserId: authenticated.id,
        });
      }

      return { value: authenticated };
    }),
  );
```

Le résultat métier est directement yieldable :

```ts
const users = serverFunction('users.list', inputSchema)
  .handler(() =>
    Effect.gen(function* () {
      const user = yield* matchingUser;
      return yield* UserRepository.listForUser(user.id);
    }),
  );
```

## `.use(...)`

`.use(middleware)` exécute le middleware au début de l’invocation, fusionne son
`context` et mémorise sa valeur. Une lecture ultérieure du même middleware par
`yield*` réutilise cette valeur dans la même requête.

```ts
const audited = craftMiddleware('demo.audit').server(() =>
  Effect.gen(function* () {
    yield* Effect.log('request audited');
    return { value: undefined, context: { auditId: crypto.randomUUID() } };
  }),
);

serverFunction('users.list', inputSchema)
  .use(audited)
  .handler(({ context }) => Effect.succeed(context.auditId));
```

Les dépendances déclarées avec `.pipe(...)` sont des dépendances de graphe ;
le programme doit toujours les consommer explicitement avec `yield*`. Le
runtime les déduplique par id et rejette les implémentations concurrentes ou
les cycles.

## Contexte annoncé par le navigateur

Un handshake décrit le schéma partagé, et `craftRequestContext` expose sa
valeur validée comme service Effect de la requête :

```ts
const claimedUserHandshake = craftHandshake(
  'demo.claimed-user',
  claimedUserSchema,
);
const ClaimedUserContext = craftRequestContext(claimedUserHandshake);
```

Le registre valide le contexte avant le handler et le fournit au programme.
Cette valeur reste une déclaration du navigateur : elle ne devient pas une
preuve tant qu’un middleware ne l’a pas comparée à `CurrentUser`.

## Middleware client

Le terminal `.client(...)` retourne directement son fragment, sans `next()` :

```ts
const requestedByContext = craftMiddleware('demo.requested-by')
  .provides(requestedByHandshake)
  .client(function* () {
    const session = yield* ClientSession();
    return { requestedBy: session.userId };
  });
```

`.use(...)`, `.pipe(...)` et `yield*` suivent la même règle de valeur côté
client, avec le runtime Craft au lieu d’Effect.

Il n’existe plus de continuation `next`, de composition onion ni de hook
`after` dans ce contrat.
