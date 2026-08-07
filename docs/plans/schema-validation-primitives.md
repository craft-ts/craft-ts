# Validation Standard Schema des primitives

## Objectif

Permettre à `state`, `query`, `mutation` et `asyncProcess` de valider leurs
valeurs avec un schema compatible `StandardSchemaV1`, tout en conservant une
gestion typée des erreurs de parsing et une stratégie configurable par
injection de dépendances.

`queryParams` conserve son mécanisme actuel de codec et de validation.

## API des schemas

### `state`

Le schema est déclaré dans la configuration `$self` existante :

```ts
const user = craftUse(state('user', {
    $self: {
      id: '1',
      name: 'Alice',
    },
    schema: UserSchema,
  }),
);
```

Le schema valide la valeur initiale ainsi que les valeurs produites par :

- `set` ;
- `update` ;
- `patch` ;
- les insertions ;
- une source dérivée (`computed`, `linkedSignal` ou `Signal`).

### `query`, `mutation` et `asyncProcess`

Les schemas de ressources correspondent à des configurations distinctes. Une
configuration utilise un seul schema selon l’étape qu’elle veut valider :

```ts
query('search', {
  methodSchema: SearchInputSchema,
  method: (input) => ({ term: input.term }),
  loader: loadSearchResults,
});
```

- `methodSchema` valide les arguments reçus par `call`, `mutate` ou `method`.
- `paramsSchema` valide le résultat de `params` ou d’une source réactive.
- `loaderSchema` valide les résultats de `loader`, les valeurs de `stream` et
  les écritures locales du resource.

Exemple de validation des paramètres réactifs :

```ts
query('products', {
  paramsSchema: SearchParamsSchema,
  params: loadFilters,
  loader: loadProducts,
});
```

Exemple de validation du résultat du loader :

```ts
query('products', {
  loaderSchema: SearchResultSchema,
  params: loadFilters,
  loader: loadProducts,
});
```

Les schemas peuvent transformer leurs valeurs. Chaque étape reçoit la sortie
du schema correspondant et la valeur exposée utilise la sortie de
`loaderSchema`.

```ts
const SearchInputSchema = z.object({
  term: z.string().trim().min(2),
});

const SearchParamsSchema = z.object({
  term: z.string().min(2),
  page: z.number().int().positive(),
});

const SearchResultSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
  }),
);
```

Les schemas acceptés peuvent venir de Zod, Valibot, Effect ou d’une
implémentation maison compatible avec `StandardSchemaV1`.

## Typage de `$self`

Le type de `$self` doit respecter le type d’entrée du schema :

```ts
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
});

state('user', {
  $self: {
    id: 123, // erreur TypeScript : string attendu
    name: 'Alice',
  },
  schema: UserSchema,
});
```

Le state exposé doit utiliser le type de sortie du schema :

```ts
const UserSchema = z.object({
  id: z.coerce.string(),
  name: z.string(),
});

const user = craftUse(state('user', {
    $self: {
      id: 123,
      name: 'Alice',
    },
    schema: UserSchema,
  }),
);

user().id; // string
```

Le même principe s’applique aux ressources :

- les arguments de `method` utilisent le type d’entrée de `methodSchema` ;
- `method` reçoit la sortie parsée de `methodSchema` ;
- `loader` reçoit la sortie parsée de `paramsSchema` ;
- `value()` expose la sortie de `loaderSchema`.

## States dérivés

Les states dérivés restent réactifs même lorsqu’un schema est configuré :

```ts
const price = signal(10);
const quantity = signal(2);

const total = craftUse(state('total', {
    $self: computed(() => price() * quantity()),
    schema: z.number().nonnegative(),
  }),
);

console.log(total()); // 20

quantity.set(3);

console.log(total()); // 30
```

Chaque nouvelle valeur produite par le `computed` ou le `linkedSignal` est
validée avant d’être publiée.

En cas d’échec, la policy décide si la dernière valeur valide est conservée ou
si la nouvelle valeur est acceptée.

Pour un `WritableSignal` externe, le state doit utiliser une écriture
contrôlée afin qu’une écriture directe sur le signal ne puisse pas contourner
la validation.

## Exceptions de parsing

Une validation échouée produit automatiquement une exception typée :

```ts
{
  code: 'SCHEMA_VALIDATION_ERROR',
  scope: 'parse',
  payload: {
    issues,
    value,
    primitive,
    name,
    stage,
  },
}
```

`stage` indique l’étape concernée :

```ts
type SchemaValidationStage =
  | 'method'
  | 'params'
  | 'state';
```

Les exceptions sont ajoutées au type `Exceptions` de la primitive et sont
accessibles au runtime :

```ts
searchQuery.exceptions().parse.method;
searchQuery.exceptions().parse.params;
searchQuery.exceptions().parse.state;
```

## Policy injectable développement / production

La décision est contrôlée par une policy fournie par injection de dépendances :

```ts
provideCraftSchemaValidationPolicy((context) => {
  monitoring.captureException(context.exception, {
    primitive: context.primitive,
    name: context.name,
    stage: context.stage,
    operation: context.operation,
    identifier: context.identifier,
  });

  return isDevMode()
    ? { action: 'reject' }
    : { action: 'accept' };
});
```

### Décision `reject`

- bloque l’étape suivante ;
- conserve l’ancienne valeur ;
- expose l’exception dans `exceptions().parse` ;
- n’exécute aucun effet secondaire dépendant de la nouvelle valeur.

### Décision `accept`

- laisse passer la valeur non parsée ;
- permet à l’application de continuer ;
- déclenche le monitoring ;
- ne transforme pas l’opération en erreur technique bloquante.

Une policy locale définie dans une primitive est prioritaire sur la policy
globale.

## Propriété `hasSchema`

Toutes les primitives concernées exposent :

```ts
hasSchema: Signal<boolean>;
```

Utilisation :

```ts
products.hasSchema(); // true
```

La valeur est calculée ainsi :

- `state` : `true` si `schema` est présent ;
- `query`, `mutation`, `asyncProcess` : `true` si `methodSchema`,
  `paramsSchema` ou `loaderSchema` est présent.

Le type est spécialisé lorsque la configuration est connue statiquement :

```ts
type WithSchema = Signal<true>;
type WithoutSchema = Signal<false>;
```

La propriété `hasSchema` reste présente dans les deux cas afin de fournir une
API uniforme au runtime et au typage.

## Tests

Ajouter des tests runtime et TypeScript pour :

- `$self` compatible et incompatible avec le schema ;
- schemas avec transformations ;
- `computed` et `linkedSignal` avec validation ;
- changements d’une source dérivée ;
- validation de `methodSchema`, `paramsSchema` et `loaderSchema` ;
- loaders, streams, `set`, `update` et `patch` ;
- policy `reject` en développement ;
- policy `accept` en production ;
- surcharge locale de policy ;
- appel du monitoring ;
- resources avec identifiants ;
- `hasSchema()` à `true` et `false` ;
- typage `Signal<true>` et `Signal<false>` ;
- absence de modification du mécanisme propre à `queryParams`.

## Documentation à mettre à jour

Ajouter dans la documentation des primitives :

- les trois niveaux de schema ;
- les exemples Zod, Valibot et Standard Schema ;
- les exemples avec `computed` et `linkedSignal` ;
- les erreurs de typage sur `$self` ;
- le comportement développement / production ;
- la configuration de la policy injectée ;
- l’utilisation de `hasSchema()`.
