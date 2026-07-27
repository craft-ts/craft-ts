# Méthodes yieldables et tests de templates au niveau des types

## Objectif

Permettre l’écriture de callbacks de template sous forme de générateurs :

```ts
button({
  *click() {
    yield* context.counter.increment(2);
  },
}, '+');
```

Les méthodes déclarées dans les primitives conservent leur syntaxe actuelle,
mais sont automatiquement exposées comme des méthodes yieldables et brandées.

Le plan inclut également `SetupTestComponentTemplate`, un resolver récursif
exécuté uniquement au niveau des types.

## Plan d’implémentation

### 1. Contrats types communs

- Définir le brand commun des méthodes yieldables.
- Conserver le nom, les arguments, le type de retour et les valeurs yieldées.
- Définir les callbacks générateurs pour les événements DOM et les outputs.
- Distinguer les callbacks impératifs des callbacks de rendu pur.

### 2. Adaptateur des méthodes exposées

- Ajouter un utilitaire qui transforme une fonction synchrone en générateur.
- Déléguer automatiquement lorsqu’une méthode retourne déjà un générateur.
- Préserver les injectors locaux, les providers et les wrappers existants.
- Utiliser les utilitaires de génération existants au lieu de dupliquer le driver.

### 3. Migration des primitives

Adapter sans modifier la syntaxe de déclaration :

- `craftMethod`
- `state`
- `query`
- `mutation`
- `asyncProcess`
- `queryParams`

Les appels exposés retourneront désormais des générateurs. Les appels
impératifs hors template devront être pilotés explicitement par `craftUse` ou
un exécuteur équivalent.

### 4. Callbacks de template

- Exécuter les callbacks DOM générateurs avec le driver Craft.
- Rendre les callbacks `Output` des sous-composants yieldables.
- Adapter les outputs Angular.
- Rejeter les callbacks impératifs non générateurs selon le nouveau contrat.
- Garder synchrones les callbacks de rendu : texte, classes, styles, `each`,
  `defer.resolve`, etc.

### 5. Préservation des VNodes

Conserver dans les types des VNodes :

- le tag littéral (`'button'`) ;
- les props exactes ;
- les enfants statiques ;
- la référence exacte du composant enfant ;
- les callbacks brandés et leurs arguments.

### 6. `SetupTestComponentTemplate` type-only

Proposer une API de ce type :

```ts
type CounterTemplateTest = SetupTestComponentTemplate<
  typeof Counter,
  [typeof CounterButton, typeof PlusIcon]
>;
```

Le resolver devra :

- récupérer le template depuis chaque référence de composant ;
- parcourir récursivement les `ComponentNode` ;
- vérifier que chaque sous-composant est déclaré dans le registre ;
- vérifier les props et callbacks transmis ;
- détecter les références manquantes ;
- éviter les boucles avec une liste de composants déjà visités.

Aucun DOM, `TestBed`, factory ou provider runtime ne sera utilisé.

### 7. Assertions de contrat

Ajouter des assertions permettant de vérifier :

- la présence d’un élément ;
- son nom statique ;
- son événement ;
- la méthode brandée utilisée ;
- les arguments passés à cette méthode ;
- l’utilisation correcte des sous-composants.

### 8. Limites et diagnostics

Traiter explicitement :

- les composants récursifs ;
- les unions de composants dynamiques ;
- les branches conditionnelles ;
- les listes et templates différés ;
- les composants Angular externes ;
- la profondeur maximale d’instanciation TypeScript ;
- les messages d’erreur de résolution.

### 9. Migration et validation

- Migrer les tests et exemples existants vers les callbacks générateurs.
- Ajouter les tests de type et les tests runtime du driver.
- Documenter les méthodes yieldables et `SetupTestComponentTemplate`.
- Valider TypeScript, les tests des packages et les builds Angular.

## Extension : visibilité conditionnelle et éléments nommés

### Branding des valeurs réactives

Les valeurs réactives exposées par les primitives doivent être brandées avec
le nom de leur propriété, comme les méthodes déjà yieldables :

```ts
const { counter } = yield* state(0, ({ state, update }) => ({
  disabled: computed(() => state() % 2 === 0),
  increment: () => update((value) => value + 1),
}));
```

`counter.disabled` doit conserver le nom `disabled`, rester un signal
appelable directement et devenir consommable avec `yield*` dans un template.
Le même mécanisme doit être partagé par `state`, `query`, `mutation`,
`asyncProcess` et `queryParams`. Les valeurs déjà brandées par `craftComputed`
doivent conserver leur branding sans être marquées deux fois.

Les valeurs comme `isAuth` et `isManager` arrivent déjà brandées depuis leur
service. C’est `ifBlock(...)` qui les transforme en dépendances conditionnelles
du template ; l’utilisateur ne construit pas directement un
`ConditionBranded`.

### Blocs conditionnels

Ajouter une primitive :

```ts
ifBlock(condition, whenTrue, whenFalse?);
```

La condition doit être une valeur Craft nommée et yieldable. Le `IfBlockNode`
conserve le nom de la condition et les deux branches afin que le resolver de
template puisse accumuler les dépendances de visibilité.

### Éléments nommés

Les helpers HTML acceptent un nom local :

```ts
button('increment', props, '+');
```

Le nom est conservé dans le VNode et rendu dans le DOM avec un attribut stable,
par exemple `data-craft-name="increment"`. Le `hostTag` reste réservé au
tracking runtime et n’est pas utilisé comme identifiant DOM.

L’identité complète d’un élément est :

```text
ComponentName:tag:localName
```

Exemple d’assertion :

```ts
type AManagerLoggedInCanIncrementTheCounter = Expect<
  Equal<
    TemplateRendersNamedElementWhen<
      CounterTemplate,
      'Counter:button:increment',
      {
        when: {
          isAuth: true;
          isManager: true;
        };
      }
    >,
    true
  >
>;
```

Le nom du composant distingue les éléments homonymes de composants enfants.

### État des listes

Une liste issue d’une primitive conserve également son nom. `each` ajoute au
chemin de visibilité :

- `counterList: 'nonEmpty'` pour le template d’un item ;
- `counterList: 'empty'` pour le template vide.

Un élément dans un `each` peut donc être vérifié avec les conditions combinées
des blocs parents et l’état de la liste.

### Règles ESLint

Ajouter `craft-ng/template-element-name-unique` afin d’interdire deux
déclarations ayant la même clé `tag:localName` dans le template d’un même
composant. Les templates de composants enfants ont leur propre namespace.

La règle doit inspecter les branches conditionnelles et exiger un nom littéral
statiquement déterminable. Une seule déclaration dans le template d’un `each`
reste valide, même si elle est rendue plusieurs fois à l’exécution.
