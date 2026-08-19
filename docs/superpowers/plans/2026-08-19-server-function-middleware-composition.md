# Plan — composition portable des middleware de server functions

## Objectif

Ajouter une nouvelle façon de composer les middleware des server functions,
avec deux modes explicites :

1. un mode portable, sans dépendance runtime à EffectTS, compatible avec une
   autre bibliothèque d’exécution ou avec des valeurs/promesses natives ;
2. un mode EffectTS, fourni par `@craft-ts/effect`, qui compose les programmes
   avec `Layer`, `provide` et des combinators Effect.

Le backend actuel ne doit pas être réécrit en deux implémentations. Le même
contrat de server function doit pouvoir être exécuté par le registre actuel,
avec ou sans adaptateur Effect.

## Principes non négociables

- `@craft-ts/core` ne doit pas importer de valeur Effect à l’exécution.
- EffectTS ne doit pas être obligatoire pour utiliser les server functions.
- Le mode portable doit pouvoir accueillir une autre bibliothèque de programme
  asynchrone, par exemple une monade `Task`, `Promise`, `fp-ts`, `neverthrow` ou
  une implémentation interne.
- Le mode Effect doit conserver l’inférence de `A`, `E` et `R`.
- `Layer`/`provide` doivent rester réservés à l’environnement Effect.
- Le contexte client transporté doit rester séparé des valeurs prouvées côté
  serveur.
- Les middleware onion avec `before`, `next`, `after` et court-circuit doivent
  rester possibles dans les deux modes.
- L’ancienne forme `.use(...)` reste supportée pendant la transition ; elle ne
  sera pas présentée comme la nouvelle composition Effect-native.

## État actuel à préserver

Le code actuel possède déjà deux familles qui ne doivent pas être confondues :

- le middleware serveur, exécuté par `runMiddlewareChain` ;
- le middleware client, exécuté par la pompe des générateurs Craft.

`.use(...)` est actuellement une déclaration Craft de dépendance dans le graphe.
Ce n’est pas un opérateur EffectTS. `.provides(...)` côté client est un contrat
de publication sur le transport ; ce n’est pas `Effect.provide`.

Références :

- `libs/core/src/lib/server-function-middleware.ts`
- `libs/core/src/lib/client-function-middleware.ts`
- `libs/effect/src/lib/effect-level.ts`
- `libs/effect/src/lib/run-effect.ts`

## Cible conceptuelle

```text
                 contrat Craft / registre / transport
                              │
                  ┌───────────┴───────────┐
                  │                       │
       mode portable                 mode EffectTS
       programme externe              Effect<A, E, R>
       adapter fourni par l’app       Layer + provide
                  │                       │
                  └───────────┬───────────┘
                              │
                    même server function
```

La seam commune porte uniquement sur :

- l’identifiant du middleware ;
- l’ordre de composition ;
- les schémas d’input et de contexte client ;
- le contexte serveur produit ;
- le contrat d’exécution du programme.

## Nouvelle surface portable

Créer dans `@craft-ts/core` une surface qui ne connaît pas le type concret du
programme :

```ts
type ServerProgram<Success = unknown, Failure = unknown> = unknown;

type PortableServerMiddleware<Program = unknown> = {
  readonly id: string;
  readonly run: (context: {
    readonly input: unknown;
    readonly context: Record<string, unknown>;
    readonly clientContext: Record<string, unknown>;
    readonly next: (patch: {
      readonly context: Record<string, unknown>;
    }) => Program;
  }) => Program;
};
```

La forme publique exacte reste à valider par un spike de typage. Le point
important est que le core ne présume ni `Effect`, ni `Promise`, ni une autre
monade. Un adapter fournit la façon d’exécuter le programme retourné.

Le registre conservera son mécanisme d’exécution générique :

```ts
createServer({
  functions,
  execute: program => adapter.run(program),
});
```

Le mode portable devra inclure un adapter minimal :

```ts
const nativeAdapter = {
  run(value: unknown) {
    return value;
  },
};
```

et un exemple avec une autre abstraction asynchrone :

```ts
const taskAdapter = {
  run(task: Task<unknown>) {
    return task.run();
  },
};
```

L’adapter ne doit pas être caché dans le core : c’est lui qui possède la
connaissance du programme choisi par l’application.

## Nouvelle surface Effect

Créer dans `@craft-ts/effect` un helper qui construit le middleware portable et
offre les primitives Effect attendues :

```ts
const authenticated = effectServerMiddleware(
  'auth.authenticated',
  ({ next }) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser;

      if (user.role !== 'admin') {
        return yield* new AdminRequired({
          authenticatedUserId: user.id,
        });
      }

      return yield* Effect.provide(
        next(),
        Layer.succeed(AuthenticatedUser)(user),
      );
    }),
);
```

La composition Effect ne doit pas nécessiter `.use(authenticated)` :

```ts
const program = Effect.gen(function* () {
  const user = yield* AuthenticatedUser;
  const audit = yield* AuditContext;
  const repository = yield* UserRepository;

  return yield* repository.list(user.id, audit.auditId);
}).pipe(
  withAudit,
  withAuthenticatedUser,
  Effect.provide(AppLive),
);
```

Deux formes sont à évaluer pendant le spike :

```ts
// combinator direct, très proche de pipe
const program = handler.pipe(withAudit, withAuthenticatedUser);
```

```ts
// construction explicite d’un programme composé
const program = composeEffect(
  [withAuthenticatedUser, withAudit],
  handler,
);
```

La première forme est préférable si l’inférence de `R` et `E` reste lisible.

## Ce qui reste spécifique à Craft

Le transport client ne doit pas être déguisé en `Layer` :

```ts
const requestContext = craftClientContextMiddleware(
  requestLocaleHandshake,
  function* () {
    const session = yield* ClientSession();
    return { locale: session.locale };
  },
);
```

Le handshake reste responsable de :

- la forme sérialisée ;
- la validation côté serveur ;
- la correspondance client/serveur ;
- la séparation entre valeur déclarée par le navigateur et valeur prouvée par
  le serveur.

L’adaptateur Effect peut permettre de `yield*` un Effect dans ce générateur,
mais il ne transforme pas le handshake en `Layer` réseau.

## Phases d’implémentation

### Phase 1 — spike de typage et de runtime

- Créer un prototype hors surface publique avec un programme abstrait.
- Vérifier la composition onion avec une valeur synchrone, une `Promise` et une
  abstraction externe minimale.
- Mesurer ce que le core peut inférer sans connaître `A`, `E` et `R`.
- Décider si le contrat portable doit être entièrement runtime-générique ou si
  l’interface portable doit seulement définir la continuation et déléguer le
  typage riche à l’adapter.

### Phase 2 — primitive portable dans le core

- Introduire le type et le constructeur portable.
- Réutiliser l’aplatissement et la déduplication par id existants.
- Permettre une server function sans Effect avec middleware.
- Conserver les validations input/client-context et les diagnostics de graphe.
- Ajouter les tests synchrones, `Promise` et court-circuit.

### Phase 3 — adaptateur Effect

- Ajouter `effectServerMiddleware(...)` dans `@craft-ts/effect`.
- Ajouter les helpers de composition `with...` ou `composeEffect(...)`.
- Propager `Effect` `A`, `E` et `R` jusqu’au handler.
- Utiliser `Layer` pour les dépendances applicatives et `Effect.provide` pour
  l’environnement.
- Utiliser `Effect.exit` pour les hooks `after` qui doivent observer l’échec.
- Refuser les `Layer` construits implicitement par requête lorsque cela crée un
  scope ou une memoization non maîtrisée.

### Phase 4 — intégration du registre

- Faire accepter au registre un adapter de programme explicite.
- Garder le chemin existant `execute(value)` rétrocompatible.
- Ajouter une configuration `executeEffect` dans `@craft-ts/effect`, sans
  importer Effect depuis `@craft-ts/core`.
- Vérifier la résolution des `Layer` applicatifs et la fermeture des scopes.

### Phase 5 — exemples dans la démo

- Ajouter un exemple portable sans adapter Effect.
- Ajouter un exemple portable avec `Promise` ou `Task`.
- Ajouter un exemple Effect avec `Layer`, `Effect.provide`, `Effect.exit` et
  composition par `pipe`.
- Ajouter un exemple de server function partagé par les deux modes afin de
  montrer qu’il n’existe pas un second backend métier.
- Ajouter une section README avec les critères de choix.

### Phase 6 — migration progressive

- Ne pas modifier immédiatement les middleware actuels.
- Ajouter des wrappers de compatibilité depuis l’ancienne forme vers la nouvelle.
- Migrer un seul cas d’audit et un seul cas d’autorisation.
- Comparer les types, l’ordre d’exécution, les erreurs et les scopes.
- Décider ensuite si l’ancienne forme reste publique ou devient legacy.

## Critères d’acceptation

- Une server function peut utiliser le mode portable sans installer Effect.
- Une autre bibliothèque de programme peut être branchée par un adapter local.
- Le même registre peut exécuter un programme portable ou un `Effect`.
- Une server function Effect conserve ses canaux `A`, `E` et `R`.
- `Layer.mergeAll`, `Layer.provide` et `Effect.provide` sont les seuls
  mécanismes de fourniture d’environnement Effect.
- Aucun `.use(...)` n’est nécessaire dans l’exemple Effect-native.
- Le transport client continue d’utiliser les handshakes et la validation
  existants.
- Les hooks `after`, les court-circuits et les erreurs taguées restent testés.

## Vérification prévue

```bash
npx nx run core:test
npx nx run effect:test
npx nx run demo-with-server-function:typecheck
npx nx run demo-with-server-function:test
npx nx run demo-with-server-function:architecture
npm run effect:check
```

