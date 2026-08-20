# Plan — `craftStateMachine`

## API cible

```ts
const transitions = transitionSetup(function* (context, transit) {
  return {
    reading: transitionStep(function* () {
      yield* initStateMachine(() => transit());

      yield* afterRecomputation(
        context.externalSaveMutation.status,
        function* (status) {
          if (status === 'resolved') {
            yield* transit();
          }
        },
      );
    }),

    editing: transitionStep(function* () {
      yield* on$(
        context.touchEvent,
        function* (event) {
          yield* transit(event).pipe(
            transitionGuard(function* ({ context, event }) {
              const permissions = yield* PermissionsService();

              return (
                context.form.isValid() &&
                event.type === 'touch' &&
                (yield* permissions.canEdit())
              );
            }),
          );
        },
      );
    }),

    saving: transitionStep(function* () {
      yield* on$(context.validateEvent, () => transit());
    }),
  };
}).pipe(
  transitionGuard(function* ({ context, to }) {
    const session = yield* SessionService();

    return session.isAuthenticated() && !context.machineLocked();
  }),
);

const machine = craftStateMachine(
  function* () {
    const state1 = yield* state(...);
    const query1 = yield* query(...);
    const externalSaveMutation = yield* UserService.save();

    const touchEvent = yield* source$<TouchEvent>('touchEvent');
    const validateEvent = yield* source$<ValidateEvent>('validateEvent');

    return {
      state1,
      query1,
      externalSaveMutation,
      touchEvent,
      validateEvent,
    };
  },

  transitions,

  function* (context) {
    return {
      reading: {
        query: context.query1,
        state: context.state1,
      },

      editing: {
        state: context.state1,
      },

      saving: {
        mutation: context.externalSaveMutation,
      },
    };
  },

  function* ({ context, currentStep, stepContext }) {
    return {
      isReading: craftComputed(
        'isReading',
        () => currentStep() === 'reading',
      ),

      isSaving: craftComputed(
        'isSaving',
        () => currentStep() === 'saving',
      ),

      currentContext: craftComputed(
        'currentContext',
        () => stepContext(),
      ),
    };
  },
);
```

## Transitions

- `transitionSetup(...)` construit toutes les transitions.
- `transitionStep(...)` est uniquement un utilitaire permettant d’appliquer un pipeline local.
- `transitionStep(...).pipe(transitionGuard(...))` applique le guard aux transitions déclarées dans ce step.
- `transitionSetup(...).pipe(transitionGuard(...))` applique le guard global à toutes les transitions.
- `transit(event)` crée une tentative de transition yieldable.
- `transit(event).pipe(...)` permet d’ajouter des guards locaux à une tentative précise.
- Une transition reçoit :

  ```ts
  {
    from,
    to,
    context,
    event,
  }
  ```

## Guards

`transitionGuard` accepte une lambda ou un générateur :

```ts
transitionGuard(({ context }) => context.form.isValid());
```

```ts
transitionGuard(function* ({ context, from, to, event }) {
  const policy = yield* PolicyService();

  return policy.canTransition({ from, to, event });
});
```

Les dépendances yieldées dans les guards doivent être ajoutées au graphe de dépendances de la machine.

Le tracking doit fonctionner récursivement à travers :

```text
transitionSetup
  → transitionStep
    → on$ / afterRecomputation / initStateMachine
      → transit().pipe(...)
        → transitionGuard(...)
          → dépendances yieldées
```

## Initialisation

- Aucun `initialState` statique.
- Aucun signal dérivé dédié pour sélectionner l’état initial.
- `yield* initStateMachine(...)` est obligatoire au niveau du typage.
- Les registrations d’initialisation sont exécutées après l’installation des transitions.
- Le premier `transit()` accepté définit l’état initial.
- L’exécution reste synchrone.
- Une transition vers l’état courant est un no-op.

## Concurrence et erreurs

- Si plusieurs événements déclenchent des transitions rapprochées, le dernier `transit()` gagne.
- Aucun système de queue ou de priorité ne sera ajouté.
- Les erreurs ne participent pas au calcul des transitions.
- Les erreurs runtime de générateur ou de dépendance restent des erreurs d’exécution normales.

## Insertion finale

Le dernier paramètre reprend le principe des insertions de `state`, `query` et `mutation`.

Il permet d’ajouter :

- des valeurs dérivées ;
- des méthodes composées ;
- des sélecteurs ;
- l’historique ;
- des flags d’étape ;
- le contexte courant dérivé.

L’historique ne fera donc pas partie du cœur de la machine : il sera implémenté par composition via cette insertion.
