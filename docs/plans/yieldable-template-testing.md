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
