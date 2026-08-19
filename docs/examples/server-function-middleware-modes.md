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

Le core expose une composition dont le programme est fourni par l'application.
Dans cet exemple, le programme est une `Promise`. Les couches sont composées par
`.pipe(...)`, et chacune voit le contexte cumulé par les précédentes.

```ts
const withAuthenticatedUser = serverLayer(
  'auth.authenticated',
  async ({ next, resolve }) => {
    const user = resolve(CurrentUser);

    if (user.role !== 'admin') {
      throw new AdminRequired({ authenticatedUserId: user.id });
    }

    // Le type de retour porte l'enrichissement : l'aval lit `context.user`
    // typé `User`, sans cast et sans redéclaration.
    return next({ context: { user } });
  },
);

const audited = serverLayerReading<{ readonly user: User }>()(
  'audit.request',
  async ({ context, next }) => {
    const auditId = crypto.randomUUID();
    const startedAt = Date.now();

    try {
      return await next({ context: { auditId } });
    } finally {
      // Le hook après s'exécute aussi bien sur succès que sur échec aval.
      console.log({
        auditId,
        userId: context.user.id,
        duration: Date.now() - startedAt,
      });
    }
  },
);
```

La server function reste indépendante d'Effect :

```ts
const listUsers = portableServerFunction('users.list', ListUsersInput, {
  exposure: 'client',
})
  .pipe(
    withAuthenticatedUser,
    audited,
    // Dérivation pure : les clés retournées sont fusionnées dans le contexte.
    mapContext(({ input, context }) => ({
      scopedFilter: `${context.user.id}:${input.filter}`,
    })),
    // Dérivation par programme : le core ne séquence rien lui-même, il passe
    // la continuation au `chain` du protocole choisi (Promise par défaut).
    flatMapContext(({ context }) => loadPermissions(context.user.id)),
  )
  .handler(async ({ context }) => {
    const repository = /* … */ undefined as unknown as UserRepository;

    return repository.list(context.scopedFilter, context.user.id);
  });
```

Le contexte se lit dans l'ordre déclaré, et chaque étape ne voit que ce qui a
déjà été produit :

```txt
{}
  -> { user }
  -> { user, auditId }
  -> { user, auditId, scopedFilter }
  -> { user, auditId, scopedFilter, permissions }
```

Une couche qui redéclare une clé déjà produite est refusée au site du
`.pipe(...)`, et le diagnostic nomme la clé fautive. Une dérivation qui retourne
un scalaire l'est aussi : sans clé, l'aval ne saurait pas sous quel nom la lire.

L'adapter choisi par l'application exécute les `Promise` :

```ts
createServer({
  functions: [listUsers],
  execute: value => value,
});
```

Une application utilisant `Task`, `TaskEither` ou une autre bibliothèque
remplace uniquement cet adapter, et passe le `chain` correspondant à
`flatMapContext`. Pour que le canal de succès de ce protocole reste lisible au
niveau des types, son type porte `ServerProgramSuccess<A>` :

```ts
type Task<A> = { readonly run: () => Promise<A> } & ServerProgramSuccess<A>;

const taskChain: ServerProgramChain<Task<any>> = (program, continuation) => ({
  run: async () => continuation(await program.run()).run(),
});

flatMapContext(({ context }) => loadTask(context.user.id), taskChain);
```

Le contrat métier ne change pas.

`.use(portableServerMiddleware(...))` reste accepté, pour compatibilité : c'est
le moteur historique, dont le contexte publié est un `MiddlewareContext`, donc
lu en `unknown` par l'aval. C'est précisément ce que `.pipe(...)` corrige.

## Mode Effect : même backend, composition plus concise

Dans le mode Effect, les valeurs produites par les middleware sont des services
Effect et les dépendances applicatives sont fournies par `Layer`.

Pour un middleware serveur Craft qui ne fait qu'ajouter un contexte sans
dépendance Effect, la forme courte ne nécessite pas `next()` :

```ts
const withRequestMetadata = craftMiddleware('request.metadata').server(() => ({
  context: { source: 'authenticated-list' },
}));
```

Le runtime fusionne cette enveloppe et continue la chaîne. La forme accepte
aussi une `Promise` de l'enveloppe. Dès qu'un middleware retourne un programme
Effect — pour du DI, un échec typé ou un hook après — il conserve `next()` afin
que le core, qui ne dépend pas du runtime Effect, puisse composer le programme.

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
| dérivation pure d'une clé de contexte | `mapContext` | `Effect.map` |
| dérivation par programme | `flatMapContext` | `Effect.flatMap` |
| autre bibliothèque d’effets | oui | non |
| inférence `A` / `E` / `R` Effect | non | oui |
| composition `Layer` / `provide` | non | oui |
| hook onion `after` | oui | oui |
| même repository métier | oui | oui |
