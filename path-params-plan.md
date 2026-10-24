# Plan : primitives pour les paramètres de chemin

## Objectif

Ajouter un primitive `pathParams` pour gérer chaque paramètre dynamique du chemin (`:userId`, `:page`, etc.), sur le modèle de `queryParams` : valeur réactive, codec facultatif, insertions, injection et gestion typée des erreurs.

## Forme d'API visée

Un primitive est déclaré par paramètre. La clé du record de la route le lie au segment portant le même nom. Le nom donné au primitive l'identifie dans Craft.

```ts
const userIdPathParam = pathParams('userId');

const pagePathParam = pathParams(
  'page',
  { codec: positiveIntegerCodec },
  ({ value, set }) => ({
    nextPage: function* () {
      return yield* set(value() + 1);
    },
  }),
);

craftRoute(
  'users/:userId/page/:page',
  {
    pathParams: {
      userId: userIdPathParam,
      page: pagePathParam,
    },
  },
  {
    INVALID_PAGE: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
  },
);
```

Sans codec, le primitive expose la valeur brute de l'URL comme `string`. Avec un codec, il expose la valeur décodée et encode les nouvelles valeurs lors d'une navigation. L'insertion reste disponible dans les deux cas.

## Étapes d'implémentation

### 1. Définir le contrat du primitive

- Reprendre la structure de `queryParams(name, config, insertion)`.
- Ajouter `pathParams(name, config?, insertion?)`, avec codec facultatif et comportement identité `string` par défaut.
- Définir les méthodes de lecture et d'écriture (`value`, `set`, éventuellement `update`) ainsi que le contexte des insertions.
- Définir les options de fallback et d'historique de navigation.

### 2. Implémenter le primitive

- Ajouter le primitive et ses types dans `libs/core/src/lib`.
- Réutiliser les mécanismes de primitive nommée, de valeur réactive, d'insertion et d'exceptions utilisés par `queryParams`.
- Faire en sorte qu'une mise à jour encode la valeur et navigue vers l'URL mise à jour.
- Sans codec, conserver la chaîne brute et utiliser une sérialisation identité.

### 3. Déclarer et typer les primitives sur les routes

- Étendre les types de définition de route avec un record `pathParams`.
- Lier les clés du record aux segments `:param` de la route et produire une erreur de type en cas de nom incohérent.
- Générer les helpers de route et les noms courts de destructuring dans `withProviders`.
- Préserver les helpers bruts existants durant la migration ou migrer les routes existantes vers `pathParams(name)` sans codec.

### 4. Intégrer le parsing à la gestion d'exceptions de route

- Exécuter le parsing dans le cycle de la route, avant que le composant consomme la valeur décodée.
- Faire remonter les `craftException` retournées par le codec à `handleExceptions`.
- Inclure les exceptions de parsing dans l'union typée et dans la vérification d'exhaustivité de la route.
- Définir le comportement en cas d'exception JavaScript levée par `decode` : la convertir en erreur de décodage générique ou la transmettre telle quelle.
- Si un fallback est configuré, continuer avec cette valeur et garder l'erreur consultable sur le primitive. Sans fallback, appliquer le gestionnaire d'exception de route.

### 5. Brancher l'injection

- Fournir un helper nommé par primitive dans les providers de la route.
- Permettre le destructuring dans `withProviders`, par exemple `({ UserIdPathParams, PagePathParams })`.
- Exposer également les helpers générés par `craftRoutes` pour les composants et services descendants.
- Garder ces primitives dans la portée de leur route et de ses descendants ; elles ne représentent pas un état global de navigation.

### 6. Intégrer la navigation typée

- Faire encoder les valeurs par le codec lorsqu'un primitive met à jour le paramètre courant.
- Préserver les autres segments du chemin lors de cette mise à jour.
- Transmettre les métadonnées de codec au registre utilisé par `CraftRouter.navigate`, afin qu'une navigation vers une route puisse accepter les valeurs décodées.
- Garder la navigation depuis un service app-level explicite : elle cible une route avec ses paramètres, sans injecter le primitive de la route courante.

Exemple visé depuis un service fourni à l'application :

```ts
yield* CraftRouter.navigate({
  to: 'users/:userId/page/:page',
  params: {
    userId,
    page: 3, // valeur décodée ; le codec de la route produit le segment "3"
  },
});
```

Le service app-level fournit les paramètres de destination qu'il connaît. Il n'injecte pas `PagePathParams` pour lire l'état de la route active ; l'action `nextPage()` qui dépend de cet état reste dans la portée de la route.

### 7. Documenter et valider

- Ajouter une documentation de référence et un exemple de pagination dans le chemin.
- Vérifier les cas : chaîne sans codec, valeur décodée avec codec, insertion personnalisée, mise à jour/navigation, parsing invalide, fallback, exception de route, injection par destructuring et navigation depuis l'application.
- Documenter la compatibilité avec les helpers de paramètres bruts existants.

## Décisions à confirmer avant l'implémentation

1. **Fallback :** facultatif comme dans `queryParams`, ou absent par défaut avec propagation de l'exception à la route ? Proposition : facultatif ; sans fallback, l'erreur remonte à `handleExceptions`.
2. **Exceptions levées par `decode` :** faut-il les normaliser en une exception générique de parsing, en plus des `craftException` explicitement retournées ?
3. **Historique :** `set` ajoute-t-il une entrée de navigation par défaut, avec option `replaceUrl` ?
4. **Paramètres de routes parentes :** une route enfant ne déclare que ses propres segments ; les primitives du parent restent injectables dans l'enfant par héritage DI.
5. **Segments optionnels :** décider séparément si la valeur est `T | undefined`, si un fallback est requis, ou si cette forme de segment n'est pas prise en charge.

## Fichiers probablement concernés

- `libs/core/src/lib/query-params.ts` : référence pour la structure du primitive et le décodage.
- `libs/core/src/lib/query.core.ts` : types des insertions.
- `libs/core/src/lib/craft-routes.ts` : définition de route, génération des helpers, providers et métadonnées.
- `libs/core/src/lib/craft-router.ts` : navigation typée et sérialisation des paramètres.
- `libs/core/src/index.ts` : exports publics.
- `apps/docs/guide/state/url-state.md` et documentation du routage : exemples et contrats publics.
