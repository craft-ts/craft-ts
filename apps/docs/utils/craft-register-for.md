# craftRegisterFor

`craftRegisterFor` expose, dans une portée d'injection Craft, les services,
composants et directives actuellement vivants. C'est utile lorsqu'un parent
doit piloter plusieurs enfants sans leur faire remonter une API spécifique :
compteurs, lecteurs audio, éléments sélectionnés, validations, etc.

## Déclarer un registre

Le registre est typé à partir des cibles Craft autorisées :

```ts
import { craftRegisterFor } from '@craft-ng/core';

const { RegisterForCounter, provideRegisterForCounter } = craftRegisterFor(
  'Counter',
  [Counter, CounterChild],
);
```

Le premier argument est le nom obligatoire du registre. Il génère les deux
helpers publics `RegisterForCounter` et `provideRegisterForCounter`. Cette
convention permet d'utiliser plusieurs registres dans la même portée sans
collision de noms.

Lorsqu'un registre ne contient qu'une seule cible, l'array peut être omis :

```ts
const { RegisterForCounter } = craftRegisterFor(
  'Counter',
  Counter,
  ({ Counter }) => ({
    total: computed(() => Counter()?.length ?? 0),
  }),
);

const counters = yield * RegisterForCounter();
const total = computed(() => counters()?.length ?? 0);
```

Si une projection utilise plusieurs groupes, les cibles doivent toutes être
déclarées :

```ts
craftRegisterFor(
  'Counter',
  [Counter, CounterChild],
  ({ Counter, CounterChild }) => ({
    total: computed(() => Counter()?.length ?? 0),
    incrementAll: () => CounterChild()?.forEach(({ ref }) => ref.increment()),
  }),
);
```

Il faut ajouter les providers retournés par `provideRegisterForCounter()` dans la
portée qui doit observer les instances :

```ts
export const RegisterForDemo = craftComponent({
  name: 'RegisterForDemo',
  providers: [provideRegisterForCounter()],
  // ...
});
```

Par défaut, le registre inclut aussi les services `global` résolus sous cette
portée. Pour limiter l'observation aux services de portée compatible avec le
parent :

```ts
craftRegisterFor('Counter', [Counter], { includeGlobal: false });
```

Une même cible ne doit apparaître qu'une fois dans la liste. La première cible
est accessible directement via `RegisterForCounter()`. Les cibles
supplémentaires restent accessibles via une propriété, par exemple
`RegisterForCounter.CounterChild()`.

## Exemple complet : piloter des composants enfants

Un service `toProvide` peut être créé par chaque enfant, puis observé par le
parent qui fournit le registre :

```ts
const { Counter, provideCounter } = craftService(
  { name: 'Counter', scope: 'toProvide' },
  function* () {
    const { counter, increment, decrement } = yield* state(
      'counter',
      0,
      ({ update }) => ({
        increment: () => update((value) => value + 1),
        decrement: () => update((value) => value - 1),
      }),
    );

    return { counter, increment, decrement };
  },
);

const CounterChild = craftComponent(
  'CounterChild',
  { providers: [provideCounter()] },
  function* () {
    return yield* Counter();
  },
  ({ counter }) => div(String(counter())),
);

const { RegisterForCounter, provideRegisterForCounter } = craftRegisterFor(
  'Counter',
  [Counter, CounterChild],
);

const CounterBoard = craftComponent(
  'CounterBoard',
  { providers: [provideRegisterForCounter()] },
  function* () {
    const counters = yield* RegisterForCounter();
    const children = yield* RegisterForCounter.CounterChild();

    return {
      incrementAll: () => counters()?.forEach(({ ref }) => ref.increment()),
      childCount: computed(() => children()?.length ?? 0),
    };
  },
  ({ incrementAll, childCount }) =>
    section([
      button({ click: incrementAll }, 'Incrémenter tous les enfants'),
      p(() => `Enfants actifs : ${childCount()}`),
      each([1, 2, 3], () => CounterChild({})),
    ]),
);
```

Quand un enfant est ajouté, son `Counter` apparaît dans le groupe. Quand il
est retiré du DOM, le groupe est mis à jour automatiquement.

## Lire un groupe

Les groupes sont yieldables depuis une factory Craft. Leur signal vaut
`undefined` tant qu'aucune instance n'est enregistrée, puis redevient
`undefined` quand la dernière instance est détruite :

```ts
const counters = yield * RegisterForCounter();

const incrementAll = () => {
  counters()?.forEach(({ ref }) => ref.increment());
};
```

::: warning
La compilation vérifie que la cible fournie à `craftRegisterFor` est un
service, composant ou directive Craft valide, mais elle ne peut pas vérifier
qu'une instance sera réellement créée à l'exécution. Pour l'instant, si aucun
service, composant ou directive enregistré n'existe dans le code exécuté, il
n'y a pas d'erreur de compilation ni d'erreur runtime : le signal vaut
simplement `undefined`.
:::

Chaque entrée contient :

- `ref` : la valeur produite par le service, ou le contexte retourné par la
  factory du composant/directive ;
- `hostName` : le nom de la portée hôte qui a créé l'entrée.

La fonction principale correspond à la première cible déclarée. Pour une cible
supplémentaire, utilisez sa propriété dédiée :

```ts
const counters = yield * RegisterForCounter();
const children = yield * RegisterForCounter.CounterChild();
```

Le signal est vivant : le parent n'a pas besoin de se réabonner lorsqu'un
enfant apparaît ou disparaît.

## Partial exposure

Comme pour `craftService`, un groupe peut exposer uniquement la façade dont le
composant parent a besoin. Le premier argument reste `undefined` pour garder
une syntaxe compatible avec les helpers yieldables, et `$self` représente le
signal complet du groupe :

```ts
const childComponents =
  yield *
  RegisterForCounter.CounterChild(undefined, ({ $self }) => ({
    total: computed(() => $self()?.length ?? 0),
    incrementAll: () => $self()?.forEach(({ ref }) => ref.increment()),
    decrementAll: () => $self()?.forEach(({ ref }) => ref.decrement()),
  }));
```

Le parent ne conserve alors que `total`, `incrementAll` et `decrementAll`.
La dépendance reste précise : les `computed` lisent le signal du groupe, et
les instances sont toujours ajoutées ou retirées automatiquement du registre.

## Propriétés dérivées du registre

Pour partager des projections communes, le second paramètre de
`craftRegisterFor` reçoit directement les signaux des groupes :

```ts
const { RegisterForCounter, provideRegisterForCounter } = craftRegisterFor(
  'Counter',
  [Counter, CounterChild],
  ({ Counter, CounterChild }) => ({
    totalCounter: computed(() => Counter()?.length ?? 0),
    incrementAllCounterChild: () =>
      CounterChild()?.forEach(({ ref }) => ref.increment()),
    decrementAllCounterChild: () =>
      CounterChild()?.forEach(({ ref }) => ref.decrement()),
  }),
);
```

Chaque propriété dérivée devient un helper yieldable :

```ts
const totalCounter = yield * RegisterForCounter.totalCounter();
const incrementAll = yield * RegisterForCounter.incrementAllCounterChild();

console.log(totalCounter());
incrementAll();
```

Pour un registre mono-cible, l'appel principal retourne aussi le signal
enrichi avec ces propriétés dérivées. La valeur reste donc callable pour lire
les entrées brutes, tout en exposant `total` et les méthodes ajoutées :

```ts
const childComponents = yield * RegisterForCounterChild();

const entries = childComponents();
const total = childComponents.total();
childComponents.incrementAllChildCounter();
childComponents.decrementAllChildCounter();
```

Dans un template Craft, on transmet directement une méthode à un événement et
on appelle les signaux dans une callback réactive :

```ts
button({ click: childComponents.incrementAllChildCounter }, 'Incrémenter tous');
span(() => `Enfants : ${childComponents.total()}`);
```

Le groupe principal (`RegisterForCounter()`), les groupes supplémentaires et les
propriétés dérivées peuvent être utilisés ensemble. Les propriétés dérivées sont calculées une fois par
injecteur de registre et conservent les signaux réactifs fournis par les
groupes.

## Enregistrer une directive

Les directives Craft peuvent également être ajoutées à la liste des cibles :

```ts
const { RegisterForCounter } = craftRegisterFor('Counter', [
  CounterChild,
  CounterDebugDirective,
]);

const debugEntries = yield * RegisterForCounter.CounterDebugDirective();
debugEntries()?.forEach(({ hostName, ref }) => {
  console.debug('directive active', hostName, ref);
});
```

Une directive fonctionnelle n'ayant pas d'instance de classe, `ref` correspond
au contexte de factory du composant décoré. Son `hostName` reste spécifique à
la directive et à son instance, ce qui permet de distinguer plusieurs
directives identiques sur le même écran.

## Cycle de vie et références

Les services sont enregistrés au moment où leur yield est résolu. Le runtime
attache automatiquement leur retrait à la destruction de l'injecteur qui les
porte.

Les composants et directives Craft étant des factories fonctionnelles, ils
n'ont pas d'instance de classe à exposer. `ref` est donc leur contexte de
factory. Pour une directive utilisée avec `.pipe(...)`, le contexte du
composant final est exposé, car c'est la portée d'exécution partagée par la
directive.

Chaque composant Craft reçoit automatiquement un host tag de la forme
`component:<NomDuComposant>#<id>`. Il n'est donc pas nécessaire d'ajouter
`provideHostName` dans les providers du composant. Ce provider reste utile si
un cas particulier doit surcharger le nom automatique.

Les directives appliquées à un élément ont un `hostName` dédié, généré à
partir du nom de la directive et d'un identifiant d'instance. Les composants
ont le même format. Ces noms servent à distinguer deux instances identiques
et peuvent être utilisés pour du diagnostic ou de l'observabilité.

Les entrées sont retirées automatiquement dans les deux cas : destruction du
composant/directive, destruction de sa portée DI, ou remplacement d'une
composition.

## Wrapper DI des composants et directives

Le runtime expose un pipeline de wrappers multi-providers pour personnaliser
l'enregistrement de chaque composant ou directive créé. `craftRegisterFor`
utilise lui-même ce mécanisme ; un autre registre peut donc utiliser le même
point d'extension sans modifier l'interpréteur.

```ts
import { HOST_TAG_LIST, provideCraftTargetWrapper } from '@craft-ng/core';

const provideTagBasedRegistration = provideCraftTargetWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (context, next) {
    const tags = context.injector.get(HOST_TAG_LIST, []);

    return yield* next({
      hostName:
        tags.length === 0
          ? context.hostName
          : `${tags.join('/')}/${context.hostName}`,
    });
  },
);
```

Le wrapper reçoit le contexte de création : `target`, `kind`, `name`, `ref`,
`hostName` et `injector`. `next(...)` poursuit la chaîne et permet de modifier
le `hostName` transmis aux wrappers suivants. L'identité (`target`, `kind`,
`name`) et la référence (`ref`) restent immuables. `next(...)` retourne une fonction de
libération, que le wrapper doit conserver s'il ajoute lui-même une ressource :

```ts
provideCraftTargetWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (context, next) {
    const audit = yield* AuditService();
    audit.recordTarget(context.name);

    const releaseNext = yield* next();
    const stopObserving = observeTarget(context);

    return () => {
      stopObserving();
      releaseNext();
    };
  },
);
```

Pour un simple enrichissement du contexte, aucun cleanup manuel n'est
nécessaire :

```ts
provideCraftTargetWrapper(
  'Warning: dependency injection here is not type-safe and may fail at runtime',
  function* (context, next) {
    return yield* next({ hostName: `tag:${context.hostName}` });
  },
);
```

## Wrapper de chaque yield de service

`provideServiceYieldWrapper` est le point d'extension bas niveau utilisé par
`craftRegisterFor`. Il enveloppe chaque résolution d'un service Craft dans la
portée où le yield est exécuté. Le mécanisme est volontairement proche de
`provideFnWrapper`, mais il ne concerne que les yields de services.

```ts
import {
  provideServiceYieldWrapper,
  type ServiceYieldContext,
} from '@craft-ng/core';

function* reportServiceYield(
  context: ServiceYieldContext,
  next: () => Generator<unknown, unknown, unknown>,
) {
  const startedAt = performance.now();
  const value = yield* next();

  console.debug('service resolved', {
    name: context.name,
    hostScope: context.hostScope,
    duration: performance.now() - startedAt,
  });

  return value;
}

export const providers = [
  provideServiceYieldWrapper(
    'Warning: the wrapper runs in the current Craft injection context.',
    reportServiceYield,
  ),
];
```

`context.resolve()` résout le service réel. Le wrapper peut appeler `next()`
pour conserver la chaîne des wrappers, ou ajouter un traitement avant/après.
Les wrappers sont composés dans l'ordre d'enregistrement : le premier est le
plus extérieur.

Le contexte fournit `name`, `scope`, `hostScope`, `injector` et `resolve`.
Comme pour `provideFnWrapper`, ce hook est adapté aux préoccupations
transverses — registre, métriques, traces, diagnostic — et non à la logique
métier.

## Réutiliser le mécanisme

Le registre repose sur deux briques séparées :

1. le wrapper de yield observe les services lorsqu'ils sont effectivement
   résolus ;
2. le runtime des composants/directives signale leur création et attache le
   nettoyage à leur cycle de vie.

Un nouvel outil peut réutiliser `provideServiceYieldWrapper` pour observer les
services sans utiliser `craftRegisterFor`. Pour les cibles fonctionnelles
Craft, le runtime expose aussi les primitives internes de registration afin
de construire une autre vue spécialisée ; `craftRegisterFor` reste l'API
recommandée pour un usage applicatif.

::: warning
`craftRegisterFor` ne détecte pas les classes Angular arbitraires. Il cible
les `craftService`, `craftComponent` et `craftDirective`, dont le runtime
connaît la portée et le cycle de vie.
:::
