# craftRegisterFor

`craftRegisterFor` expose, dans une portée d'injection Craft, les services,
composants et directives actuellement vivants. C'est utile lorsqu'un parent
doit piloter plusieurs enfants sans leur faire remonter une API spécifique :
compteurs, lecteurs audio, éléments sélectionnés, validations, etc.

## Déclarer un registre

Le registre est typé à partir des cibles Craft autorisées :

```ts
import { craftRegisterFor } from '@craft-ng/core';

const { RegisterFor, provideRegisterFor } = craftRegisterFor([
  Counter,
  CounterChild,
]);
```

Il faut ajouter les providers retournés par `provideRegisterFor()` dans la
portée qui doit observer les instances :

```ts
export const RegisterForDemo = craftComponent({
  name: 'RegisterForDemo',
  providers: [
    ...provideRegisterFor(),
  ],
  // ...
});
```

Par défaut, le registre inclut aussi les services `global` résolus sous cette
portée. Pour limiter l'observation aux services de portée compatible avec le
parent :

```ts
craftRegisterFor([Counter], { includeGlobal: false });
```

Une même cible ne doit apparaître qu'une fois dans la liste. Son nom Craft
forme le nom du groupe (`Counter` devient `RegisterFor.Counter`).

## Lire un groupe

Les groupes sont yieldables depuis une factory Craft. Leur signal vaut
`undefined` tant qu'aucune instance n'est enregistrée, puis redevient
`undefined` quand la dernière instance est détruite :

```ts
const counters = yield* RegisterFor.Counter();

const incrementAll = () => {
  counters()?.forEach(({ ref }) => ref.increment());
};
```

Chaque entrée contient :

- `ref` : la valeur produite par le service, ou le contexte retourné par la
  factory du composant/directive ;
- `hostName` : le nom de la portée hôte qui a créé l'entrée.

On peut aussi récupérer tous les groupes avec `yield* RegisterFor()` :

```ts
const groups = yield* RegisterFor();
const children = groups.CounterChild();
```

Le signal est vivant : le parent n'a pas besoin de se réabonner lorsqu'un
enfant apparaît ou disparaît.

## Cycle de vie et références

Les services sont enregistrés au moment où leur yield est résolu. Le runtime
attache automatiquement leur retrait à la destruction de l'injecteur qui les
porte.

Les composants et directives Craft étant des factories fonctionnelles, ils
n'ont pas d'instance de classe à exposer. `ref` est donc leur contexte de
factory. Pour une directive utilisée avec `.pipe(...)`, le contexte du
composant final est exposé, car c'est la portée d'exécution partagée par la
directive.

Les directives appliquées à un élément ont un `hostName` dédié, généré à
partir du nom de la directive et d'un identifiant d'instance. Les composants
ont le même format. Ces noms servent à distinguer deux instances identiques
et peuvent être utilisés pour du diagnostic ou de l'observabilité.

Les entrées sont retirées automatiquement dans les deux cas : destruction du
composant/directive, destruction de sa portée DI, ou remplacement d'une
composition.

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
