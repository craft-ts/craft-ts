# Deep-yieldable : projections typées avec dépendance source

## Objectif

Permettre l’écriture directe de projections réactives imbriquées :

```ts
div({
  'data-user-id': user.id,
}, [
  span(user.name),
]);
```

Dans cet exemple, `user.id` doit être simultanément :

- un lecteur yieldable consommable par le renderer ou par `yield*` ;
- typé comme `number` après résolution ;
- porteur de la dépendance vers la source `user` ;
- porteur du chemin réactif `user.id` pour le diagnostic, le traçage et les tests ;
- lazy, afin qu’aucune lecture de `user` ne survienne lors de la construction du VNode.

La fonctionnalité est opt-in : un lecteur ne devient deep-yieldable qu’après un appel explicite à `deepYieldable(...)`. Cela évite d’imposer un Proxy récursif, un cache de projections et une expansion de types à tous les readers du framework.

La fonctionnalité doit fonctionner pour :

- les valeurs exposées par `state`, `query`, `mutation`, `asyncProcess` et `queryParams` ;
- les valeurs dérivées dans les insertions de primitives ;
- les valeurs produites par `craftComputed` ;
- les `Input<T>` de composants fonctionnels lorsqu’ils sont explicitement adaptés par `deepYieldable(...)`.

## Hors périmètre

- Ajouter des helpers `pick`, `map` ou une API dédiée au template.
- Modifier le modèle général des dépendances de services.
- Rendre automatiquement yieldables les méthodes métier d’un objet.
- Définir immédiatement un comportement complet pour toutes les classes natives, `Date`, `Map`, `Set` et les objets mutables arbitraires.

## Principe de conception

Le modèle doit distinguer la valeur projetée de sa source :

```ts
DeepYieldableValue<Value, Source, Path>
```

La source ne doit pas être uniquement le type métier `User`. Elle doit être un token nominal ou un descripteur de lecteur permettant d’identifier le lecteur racine.

Le nom local de variable (`user`) ne peut pas être inféré par TypeScript. Le nom `user` pourra donc être conservé dans l’identité runtime et le chemin de diagnostic, tandis que le typage utilisera un token de source stable.

`deepYieldable(...)` est un adaptateur, pas un calcul métier :

```ts
deepYieldable(reader)
```

retourne le reader sous une forme deep-yieldable. Il ne doit pas créer un `craftComputed` supplémentaire.

La règle d’utilisation est donc :

```ts
// Reader déjà dérivé : adaptation directe.
fineState: deepYieldable(state),

// Nouveau calcul : computed d’abord, adaptation ensuite.
fineState: deepYieldable(
  craftComputed('fineState', function* () {
    return ...;
  }),
),
```

La forme suivante est à éviter :

```ts
fineState: craftComputed(deepYieldable(state));
```

Elle mélange deux responsabilités et ajoute un computed de forwarding sans transformation métier.

## Contrat de type proposé

Ajouter un carrier privé ou exporté au niveau de `libs/core/src/lib/reactive-read.ts` :

```ts
declare const YIELDABLE_DEPENDENCY: unique symbol;

type YieldableDependency<Source, Path extends string> = {
  readonly [YIELDABLE_DEPENDENCY]?: {
    readonly source: Source;
    readonly path: Path;
  };
};
```

Définir ensuite une forme récursive pour les propriétés de données :

```ts
type DeepYieldableValue<
  Value,
  Source,
  Path extends string,
> = Yieldable<[], Value, unknown> &
  YieldableDependency<Source, Path> &
  (Value extends object
    ? DeepYieldableObject<Value, Source, Path>
    : {});

type DeepYieldableObject<
  Value extends object,
  Source,
  Path extends string,
> = {
  readonly [Key in keyof Value]: DeepYieldableValue<
    Value[Key],
    Source,
    `${Path}.${Extract<Key, string>}`
  >;
};
```

Le type final devra être ajusté pour :

- préserver les propriétés réservées (`YIELDABLE_VALUE`, `RAW_REACTIVE_VALUE`, `REACTIVE_VALUE_TYPE`) ;
- éviter de projeter les fonctions comme des objets de données ;
- préserver les propriétés optionnelles et readonly ;
- traiter `null` et `undefined` sans perte de type ;
- limiter la récursion à une profondeur sûre pour éviter les erreurs `TS2589` ;
- définir explicitement la politique pour les tableaux et tuples.

Le résultat attendu est conceptuellement :

```ts
type UserIdReader = typeof user.id;

// UserIdReader :
// Yieldable<[], number, unknown> &
// { [YIELDABLE_DEPENDENCY]?: { source: UserSource; path: 'user.id' } }
```

## Propagation dans les `craftComputed`

`craftComputed` utilise déjà `createYieldableReactiveValue`. Il faut exploiter ce point commun plutôt que créer un traitement spécifique dans chaque primitive.

Lorsqu’un `craftComputed` lit une projection :

```ts
const userId = craftComputed('userId', function* () {
  return yield* user.id();
});
```

son type doit conserver les dépendances réactives extraites de la signature yieldable de `user.id`.

Prévoir un carrier de dépendances réactives distinct des dépendances de services :

```ts
type ReactiveDependencyMap = Readonly<{
  readonly source: unknown;
  readonly path: string;
}>;
```

Puis :

1. extraire les carriers présents dans `Yielded` du générateur `craftComputed` ;
2. les fusionner dans le type du résultat computed ;
3. conserver ces informations lorsque le computed est rendu ou réutilisé par un autre computed ;
4. ne pas les mélanger avec `SERVICE_HELPER_DEPENDENCIES` ni avec `ComponentDeps`.

Le runtime devra simultanément continuer à relayer la lecture réelle vers la source racine :

```ts
function* projectedReader() {
  const value = yield* source();
  return value[key];
}
```

## Runtime deep-yieldable

### Utilitaire public explicite

Ajouter un utilitaire public, idéalement dans `libs/core/src/lib/reactive-read.ts` :

```ts
export function deepYieldable<Reader>(
  reader: Reader,
): DeepYieldableReaderOf<Reader>;
```

La signature publique devra récupérer automatiquement la source et le chemin déjà portés par `reader`, sans demander à l’appelant de répéter ces paramètres.

Exemple cible :

```ts
const user = deepYieldable(rawUser);

user.id;            // lecteur yieldable de number
user.profile.name;  // lecteur yieldable de string
yield* user.id();   // lecture ciblée
```

Sans appel à `deepYieldable`, le reader conserve son comportement actuel et sa valeur objet reste une valeur normale lorsqu’elle est résolue.

### Point d’entrée commun

Introduire une primitive interne dédiée dans :

- `libs/core/src/lib/reactive-read.ts`

Ne pas rendre automatiquement chaque résultat de `createYieldableReactiveValue` deep-yieldable. `createYieldableReactiveValue` doit continuer à créer le reader de base ; `deepYieldable` construit la façade récursive uniquement à la demande.

Le wrapper devra :

- conserver l’appel racine existant (`reader()` puis `yield* reader()` selon le contrat) ;
- intercepter les propriétés de données absentes du reader racine ;
- créer une projection yieldable stable pour chaque propriété ;
- mémoriser les projections par source et chemin ;
- transmettre l’identité runtime avec `path: 'user.id'` ;
- éviter de remplacer les propriétés natives et les symbols internes ;
- retourner les mêmes projections pour deux accès successifs au même chemin.

### Projection

Pour une propriété `id`, le proxy doit produire un reader équivalent à :

```ts
function* readId() {
  const value = yield* rootReader();
  return value?.id;
}
```

La projection doit être réutilisable dans les trois contextes suivants :

```ts
div({ 'data-user-id': user.id });

const id = yield* user.id();

const id = craftUse(user.id());
```

`craftUse` restera réservé aux contextes impératifs et ne devra pas être introduit dans les templates.

### Réutilisation de la façade existante

`createYieldableReactiveFacade` et `YieldableReactiveProperties` existent déjà dans `reactive-read.ts`. Avant d’ajouter une nouvelle façade, déterminer si leur responsabilité peut être étendue :

- aujourd’hui, elles adaptent principalement les propriétés signalées d’un output ;
- la nouvelle capacité doit également projeter les propriétés de la valeur portée par un reader objet ;
- les propriétés existantes d’un output (`status`, `value`, `select`, `reload`, etc.) doivent rester prioritaires sur les projections dynamiques.

Éviter les doubles proxies et les changements d’identité qui casseraient les caches ou les accès aux symbols internes.

## Intégration des primitives

Les primitives doivent rendre `deepYieldable` utilisable dans leurs points d’exposition, sans adapter implicitement tous les readers :

- `state` dans `libs/core/src/lib/state.ts` ;
- `query` et `query.core` ;
- `mutation` ;
- `async-process` ;
- `query-params` ;
- insertions typées et `insertSelect`.

Exemple recommandé pour un reader déjà existant :

```ts
const users = yield* state(
  'users',
  initialUsers,
  ({ state }) => ({
    fineState: deepYieldable(state),
  }),
);
```

Pour une valeur effectivement calculée :

```ts
const users = yield* state(
  'users',
  initialUsers,
  ({ state }) => ({
    fineState: deepYieldable(
      craftComputed('fineState', function* () {
        return (yield* state()).selected;
      }),
    ),
  }),
);
```

Les valeurs dérivées d’une insertion doivent conserver leur source et leur chemin :

```ts
const users = yield* state('users', initialUsers, ({ state }) => ({
  selected: craftComputed('selected', function* () {
    return ...;
  }),
}));

users.selected.id;
```

Le type de `users.selected.id` doit pointer vers `users.selected` comme source intermédiaire, tout en permettant au runtime de retracer la chaîne complète jusqu’à `users`.

### Insertion `insertDeepYieldable()`

Ajouter une insertion opt-in pour les cas où le reader racine de la primitive doit directement exposer ses propriétés deep-yieldable :

```ts
const user = yield* state(
  'user',
  initialUser,
  insertDeepYieldable(),
);

user.id;
user.profile.name;
```

La forme recommandée est donc :

```ts
state(..., insertDeepYieldable());
query(..., insertDeepYieldable());
```

et non :

```ts
state(..., ({ state }) => ({
  fineState: craftComputed(deepYieldable(state)),
}));
```

Cette dernière forme crée un niveau d’API intermédiaire et mélange le rôle d’une insertion avec celui d’un computed.

`insertDeepYieldable()` devra être un marqueur d’insertion typé, compris par la primitive au moment de construire son reader public :

```ts
declare const DEEP_YIELDABLE_INSERTION: unique symbol;

type DeepYieldableInsertion = {
  readonly [DEEP_YIELDABLE_INSERTION]: true;
};
```

La primitive devra :

1. détecter ce marqueur parmi ses insertions ;
2. conserver les outputs ordinaires des autres insertions ;
3. appliquer `deepYieldable(...)` au reader public final ;
4. conserver les propriétés exposées par les insertions (`reload`, méthodes, `status`, etc.) ;
5. modifier conditionnellement le type public de la primitive pour exposer `DeepYieldableReader<State>` lorsque le marqueur est présent.

La propagation devra aussi fonctionner lorsque l’insertion est composée :

```ts
state(
  'user',
  initialUser,
  insertStatePipe(
    insertDeepYieldable(),
    otherInsertion(),
  ),
);
```

`insertStatePipe`, `insertQueryPipe` et les pipes équivalents devront donc conserver le carrier `DEEP_YIELDABLE_INSERTION` si l’un de leurs membres le porte.

Cette insertion doit rester distincte de `deepYieldable(reader)` :

- `deepYieldable(reader)` adapte explicitement une valeur dérivée ou un computed ;
- `insertDeepYieldable()` demande à une primitive d’adapter son reader racine final.

## Intégration de `Input<T>`

`Input<T>` est actuellement un lecteur yieldable construit dans `ComponentRenderedNode` de :

- `libs/component/src/lib/types.ts` ;
- `libs/component/src/lib/render/interpreter.ts`.

Le shell d’input ne doit pas devenir deep-yieldable automatiquement. Il doit pouvoir être adapté explicitement sans casser :

- l’appel existant `user()` ;
- `yield* user()` ;
- les inputs de contenu ;
- les composants à factory mono-argument ;
- les proxys de contexte de déclaration ;
- les mises à jour de props.

Exemple cible :

```ts
const userCard = craftComponent(
  'userCard',
  {},
  (user: Input<DemoUser>) => ({
    user: deepYieldable(user),
  }),
  ({ user }) =>
    div({ 'data-user-id': user.id }, [
      span(user.name),
    ]),
);
```

Une adaptation automatique dans le renderer pourrait être étudiée plus tard, mais elle ne fait pas partie de la première version : l’opt-in doit rester visible dans le code source.

Le wrapper d’input devra utiliser le nom de prop disponible au runtime pour construire l’identité :

```text
component:UserCard → input:user → user.id
```

Le type de `Input<T>` devra recevoir ou exposer un token de source suffisamment précis pour que les propriétés projetées conservent cette dépendance dans leur signature. Ne pas compter sur le nom local de paramètre TypeScript pour obtenir cette information.

## Intégration du typage des templates

Vérifier et adapter les projections de contexte dans :

- `libs/component/src/lib/types.ts` ;
- `libs/component/src/lib/render/vnode.ts` ;
- `libs/component/src/lib/template-contract.ts`.

Le système doit reconnaître `user.id` comme un callback yieldable retournant `number`, tout en conservant les carriers nécessaires pour les diagnostics et la propagation des dépendances.

Vérifier particulièrement :

- les attributs `data-*` et `aria-*` ;
- les propriétés DOM primitives ;
- les classes et styles ;
- les children texte (`span(user.name)`) ;
- les callbacks générateurs explicites ;
- les composants enfants qui reçoivent une projection yieldable.

## Tests de types

Ajouter des tests dans :

- `libs/core/src/lib/reactive-read.spec.ts` ;
- `libs/core/src/lib/craft-computed.spec.ts` ;
- `libs/component/src/lib/types.spec.ts`.

Cas à couvrir :

```ts
interface User {
  readonly id: number;
  readonly profile: {
    readonly name: string;
  };
}
```

- `user.id` résout en `number` ;
- `user.profile.name` résout en `string` ;
- une propriété inexistante est refusée ;
- les propriétés optionnelles deviennent `undefined` si nécessaire ;
- le carrier de `user.id` contient la source racine et le chemin `user.id` ;
- le carrier de `user.profile.name` conserve la même source et le chemin complet ;
- un computed qui lit `user.id` expose la dépendance réactive ;
- deux sources différentes restent distinguables même si elles portent le même type métier.
- `insertDeepYieldable()` modifie le type public de la primitive ;
- l’absence de `insertDeepYieldable()` conserve le type et le comportement actuels ;
- le carrier reste présent lorsqu’une insertion est composée par un pipe.

## Tests runtime

Ajouter des tests dans :

- `libs/core/src/lib/reactive-read.spec.ts` ;
- `libs/core/src/lib/craft-computed.spec.ts` ;
- `libs/component/src/lib/render/interpreter.spec.ts` ;
- éventuellement `libs/component/src/lib/testing.spec.ts` pour les composants fonctionnels.

Vérifier :

- `user.id` est lazy ;
- la projection relit `user` quand la source change ;
- une modification de `user.id` met à jour le binding DOM ;
- une modification de `user.name` ne modifie pas l’attribut `data-user-id` ;
- `user.id` et `user.profile.name` conservent des readers stables ;
- deux accès à `user.id` partagent le cache attendu ;
- les symbols internes et propriétés natives restent accessibles ;
- les projections imbriquées ne déclenchent pas de lecture eager lors de la construction du template ;
- la chaîne de dépendances observable contient la source racine et les chemins projetés ;
- `state(..., insertDeepYieldable())` expose directement `state.id` ;
- `query(..., insertDeepYieldable())` expose directement les projections du reader query ;
- les propriétés d’insertions existantes restent accessibles après l’adaptation du reader racine.

## Compatibilité et migration

L’implémentation doit être additive :

- les générateurs explicites existants continuent de fonctionner ;
- les lecteurs yieldable simples restent valides ;
- les valeurs primitives ne reçoivent pas de proxy inutile ;
- les readers existants conservent leur identité et leurs symbols ;
- aucune règle ESLint ne doit imposer `pick`, `map` ou une nouvelle syntaxe.

Mettre à jour les exemples concernés, notamment :

- `apps/demo/src/app/examples/component/component-demo.ts` ;
- la documentation de la réactivité fine dans `apps/docs/guide/components/fine-grained-reactivity.md` ;
- la documentation des composants dans `apps/docs/guide/components/index.md`.

## Ordre d’implémentation

1. Définir les carriers et le type récursif avec une profondeur bornée.
2. Définir et exporter l’utilitaire explicite `deepYieldable`.
3. Ajouter les tests de type isolés pour source, chemin et valeur résolue.
4. Implémenter le reader de projection et son cache.
5. Réutiliser ou factoriser la façade existante sans modifier le comportement par défaut des readers.
6. Intégrer explicitement `deepYieldable` dans les valeurs dérivées des primitives.
7. Ajouter le marqueur et l’insertion `insertDeepYieldable()`.
8. Propager ce marqueur dans `insertStatePipe`, `insertQueryPipe` et les pipes équivalents.
9. Modifier les signatures publiques des primitives pour refléter le mode deep-yieldable.
10. Intégrer explicitement `deepYieldable` autour des résultats `craftComputed`.
11. Permettre l’adaptation explicite des shells `Input<T>` du renderer.
12. Adapter la projection du contexte/template et les contrats de bindings.
13. Ajouter les tests DOM et de propagation réactive.
14. Migrer l’exemple `component-demo` vers `insertDeepYieldable()` puis `user.id` et `user.name`.
15. Mettre à jour la documentation et lancer la suite ciblée puis la suite complète.

## Critères d’acceptation

La fonctionnalité sera considérée comme terminée lorsque ce code sera valide et réactif :

```ts
const userCard = craftComponent(
  'userCard',
  {},
  (user: Input<DemoUser>) => ({
    user: deepYieldable(user),
  }),
  ({ user }) =>
    div({
      'data-user-id': user.id,
    }, [
      span(user.name),
    ]),
);
```

Et lorsque le type et le runtime pourront tous deux répondre :

```text
Quelle est la valeur ?       number
De quelle source dépend-elle ? user
Quel est son chemin ?        user.id
Est-elle lazy ?              oui
Se met-elle à jour ?         oui
```
