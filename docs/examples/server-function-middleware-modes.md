# Exemples — deux modes de middleware de server function

Ces exemples décrivent la cible proposée par
`docs/superpowers/plans/2026-08-19-server-function-middleware-composition.md`.
Ils montrent le même traitement métier avec deux modes d’exécution.

## Contrat métier commun

Le contrat, le repository et les erreurs sont communs aux deux modes :

```ts
const ListUsersInput = Schema.toStandardSchemaV1(
  Schema.Struct({ filter: Schema.String }),
);

class AdminRequired extends Data.TaggedError('AdminRequired')<{
  readonly authenticatedUserId: string;
}> {}

type User = {
  readonly id: string;
  readonly role: 'admin' | 'member';
};

interface UserRepository {
  list(filter: string, userId: string): unknown;
}
```

Le backend métier ne se duplique pas. Seul le programme qui l’entoure varie.

## Mode portable : aucune dépendance runtime à Effect

Le core expose un middleware portable dont le programme est fourni par
l’application. Dans cet exemple, le programme est une `Promise`.

```ts
type PortableContext = {
  readonly input: unknown;
  readonly context: Record<string, unknown>;
  readonly next: (patch: {
    readonly context: Record<string, unknown>;
  }) => Promise<unknown>;
};

const authenticated = portableServerMiddleware(
  'auth.authenticated',
  async ({ next, resolve }) => {
    const user = resolve(CurrentUser);

    if (user.role !== 'admin') {
      throw new AdminRequired({
        authenticatedUserId: user.id,
      });
    }

    return next({
      context: { user },
    });
  },
);

const audited = portableServerMiddleware(
  'audit.request',
  async ({ context, next }) => {
    const auditId = crypto.randomUUID();
    const startedAt = Date.now();

    try {
      return await next({
        context: { auditId },
      });
    } finally {
      console.log({
        auditId,
        userId: (context.user as User).id,
        duration: Date.now() - startedAt,
      });
    }
  },
);
```

La server function peut rester indépendante d’Effect :

```ts
const listUsers = portableServerFunction(
  'users.list',
  ListUsersInput,
  async ({ input, context, resolve }) => {
    const repository = resolve(UserRepository);

    return repository.list(
      input.filter,
      (context.user as User).id,
    );
  },
  [authenticated, audited],
);
```

L’adapter choisi par l’application exécute les `Promise` :

```ts
createServer({
  functions: [listUsers],
  execute: value => value,
});
```

Une application utilisant `Task`, `TaskEither` ou une autre bibliothèque
remplace uniquement cet adapter et les implémentations de middleware. Le
contrat métier ne change pas.

## Mode Effect : même backend, composition plus concise

Dans le mode Effect, les valeurs produites par les middleware sont des services
Effect et les dépendances applicatives sont fournies par `Layer`.

```ts
class AuthenticatedUser extends Context.Service<
  AuthenticatedUser,
  User
>()('request/AuthenticatedUser') {}

class AuditContext extends Context.Service<
  AuditContext,
  { readonly auditId: string }
>()('request/AuditContext') {}
```

Le middleware d’autorisation :

```ts
const withAuthenticatedUser = <A, E, R>(
  next: Effect.Effect<A, E, R | AuthenticatedUser>,
) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser;

    if (user.role !== 'admin') {
      return yield* new AdminRequired({
        authenticatedUserId: user.id,
      });
    }

    return yield* Effect.provide(
      next,
      Layer.succeed(AuthenticatedUser)(user),
    );
  });
```

Le middleware d’audit conserve son hook après :

```ts
const withAudit = <A, E, R>(
  next: Effect.Effect<A, E, R | AuthenticatedUser | AuditContext>,
) =>
  Effect.gen(function* () {
    const user = yield* AuthenticatedUser;
    const auditId = crypto.randomUUID();

    const exit = yield* Effect.exit(
      Effect.provide(
        next,
        Layer.succeed(AuditContext)({ auditId }),
      ),
    );

    yield* Effect.log(
      `user=${user.id} audit=${auditId} failed=${Exit.isFailure(exit)}`,
    );

    return yield* exit;
  });
```

Composition par `pipe`, sans `.use(...)` :

```ts
const program = Effect.gen(function* () {
  const user = yield* AuthenticatedUser;
  const audit = yield* AuditContext;
  const repository = yield* UserRepository;

  return yield* repository.list(input.filter, user.id, audit.auditId);
}).pipe(
  withAudit,
  withAuthenticatedUser,
  Effect.provide(AppLive),
);
```

L’adaptateur `@craft-ts/effect` exécute ce programme :

```ts
createServer({
  functions: [listUsers],
  execute: value =>
    Effect.runPromise(
      value.pipe(Effect.provide(AppLive)),
    ),
});
```

## Ce qui ne change pas

Le contexte envoyé par le navigateur reste un handshake Craft :

```ts
const requestLocale = craftHandshake(
  'request.locale',
  Schema.toStandardSchemaV1(
    Schema.Struct({ locale: Schema.String }),
  ),
);
```

Une `Layer` Effect ne remplace pas ce contrat : elle ne décrit ni le format
transporté, ni la validation du navigateur, ni la correspondance entre les deux
programmes client et serveur.

## Choix du mode

| Besoin | Mode portable | Mode Effect |
|---|---:|---:|
| zéro runtime Effect | oui | non |
| autre bibliothèque d’effets | oui | non |
| inférence `A` / `E` / `R` Effect | non | oui |
| composition `Layer` / `provide` | non | oui |
| hook onion `after` | oui | oui |
| même repository métier | oui | oui |

