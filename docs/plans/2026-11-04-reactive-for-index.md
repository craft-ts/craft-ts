# Rendre l'index de forNode réactif

Statut : implémenté, migration directe sans rétrocompatibilité. Validation et
mesures détaillées dans [le compte rendu](../benchmarks/2026-11-04-reactive-for-index.md).

## Objectif

Un changement de position doit déplacer la ligne et actualiser les bindings qui
lisent son index. Il ne doit pas réexécuter le template d'une ligne uniquement
parce que sa position change si ce template ne dépend pas de l'index.

L'affichage actuel des index est correct : CraftTS le maintient en réexécutant
les templates concernés. Le changement vise une mise à jour plus précise et
moins coûteuse, en développement comme en production.

Référence : [examens de performance](../benchmarks/2026-11-04-performance-examination.md).

## Décision d'API : remplacer le nombre par un lecteur réactif

Le deuxième argument du callback de rendu devient un lecteur yieldable en
lecture seule, fondé sur le contrat existant `InputValue<number>`.

```ts
// Ancien contrat : supprimé.
(item: InputValue<Item>, index: number) => CraftNodeChildren

// Nouveau contrat.
(item: InputValue<Item>, index: InputValue<number>) => CraftNodeChildren
```

- Aucune surcharge conservant `index: number` dans le callback de rendu.
- Aucune union `number | InputValue<number>`.
- Aucun mode legacy ni option de compatibilité.
- Aucune conversion implicite du lecteur en nombre ou en chaîne.
- Migration de tous les usages du dépôt dans le même changement.

Le callback `track(item, index)` reste une fonction de calcul de clé avec une
position numérique brute. Son contrat est distinct du callback de rendu : il
est évalué pendant la réconciliation et ne constitue pas un binding réactif.
Cette décision ne fournit pas de compatibilité avec l'ancien argument du
template. Les exemples de réordonnancement utiliseront des clés stables d'item.

## Exemples avant/après

### Afficher un numéro

```ts
// Avant : rejeté après migration.
forNode(users, { track: (user) => user.id }, (user, index) =>
  p(function* () {
    return `${index + 1}. ${(yield* user()).name}`;
  }),
);

// Après : lecture réactive de l'index au niveau du binding texte.
forNode(users, { track: (user) => user.id }, (user, index) =>
  p(function* () {
    return `${(yield* index()) + 1}. ${(yield* user()).name}`;
  }),
);
```

### Transmettre la position à un composant

```ts
// Le composant reçoit une entrée réactive, pas un nombre capturé.
const Row = craftComponent('Row', {}, (inputs: { position: Input<number> }) =>
  p(function* () {
    return `Position ${(yield* inputs.position()) + 1}`;
  }),
);

forNode(users, { track: (user) => user.id }, (_user, index) =>
  Row({ position: index }),
);
```

Les exemples décrivent le contrat implémenté. Seul l'index de `track` reste
numérique.

## 1. Verrouiller les comportements attendus par des tests

Compléter
[interpreter.spec.ts](../../libs/component/src/lib/render/interpreter.spec.ts)
avec des tests passant par de vrais templates et composants enfants.

- [x] Inversion d'une liste sans lecture de l'index : ordre correct, identité
      DOM et instances conservées, aucune réexécution des templates de ligne
      attribuable au seul changement de position.
- [x] Ligne affichant sa position : numéros corrects après inversion, insertion,
      suppression et filtrage/rétablissement.
- [x] Un binding lit l'index, un autre lit seulement l'item : vérifier quels
      bindings sont réévalués, pas seulement le texte final.
- [x] Lecteur d'index transmis à un composant enfant : valeur actualisée sans
      remplacer l'enfant ni son entrée réactive à chaque déplacement.
- [x] Modification d'un item après plusieurs déplacements : bonne ligne
      actualisée, index toujours correct.
- [x] Lecture de l'index dans le callback de template lui-même : ce callback
      devient dépendant de l'index et doit être réexécuté si nécessaire.
- [x] Listes imbriquées : index indépendants et absence de confusion de scope.
- [x] Suppression d'une entrée : destruction des effets et des abonnements liés
      à son lecteur d'index.
- [x] Liste vide, clés dupliquées et remplacement du template : garanties
      existantes conservées.

Les tests du nouveau contrat doivent d'abord échouer avec l'implémentation
actuelle. Ne pas utiliser le simple retrait de la condition d'index comme
correctif : le contrôle négatif des examens démontre qu'il produit des numéros faux.

## 2. Changer le contrat de types

Fichiers principaux :

- [for-node.ts](../../libs/component/src/lib/for-node.ts) : toutes les signatures
  du callback de rendu et le cast de stockage du descripteur.
- [render/vnode.ts](../../libs/component/src/lib/render/vnode.ts) : signature
  de `ForNode.itemTemplate` et types associés.
- [types.spec.ts](../../libs/component/src/lib/types.spec.ts) et
  [vnode.types.spec.ts](../../libs/component/src/lib/render/vnode.types.spec.ts) :
  tests de compilation.

Cas de typage à couvrir :

- [x] `yield* index()` est inféré comme `number`.
- [x] L'arithmétique directe `index + 1` échoue.
- [x] Un callback explicitement annoté `index: number` échoue.
- [x] Le passage direct du lecteur à une prop exigeant un nombre échoue.
- [x] Le passage du lecteur à une entrée réactive de nombre est accepté.
- [x] Les callbacks qui ignorent le deuxième argument restent valides.
- [x] Les dépendances, exceptions, canaux et types d'items de `forNode` restent
      correctement inférés, y compris les items deep-yieldable.

## 3. Donner à chaque entrée un index réactif stable

Modifier `ForRenderedEntry`, `ForRenderedNode.reconcile`, `renderItem` et la
planification dans
[interpreter.ts](../../libs/component/src/lib/render/interpreter.ts).

- [x] À la création d'une entrée, créer son signal d'index et son lecteur
      yieldable en lecture seule.
- [x] Conserver l'identité de ce lecteur pendant toute la vie de la clé.
- [x] Fournir ce lecteur comme deuxième argument du callback de rendu.
- [x] Lors d'un déplacement, mettre à jour le signal d'index sans placer
      automatiquement l'entrée dans `entriesToRender`.
- [x] Laisser le suivi des lectures réactives actualiser les bindings ou effets
      qui consomment réellement l'index.
- [x] Conserver les causes nécessaires de réexécution : changement d'item,
      changement du template ou entrée pas encore rendue.
- [x] Conserver initialement la stratégie existante de mise à jour de l'item.
      Ne pas remplacer son lecteur par une fonction stable qui lirait seulement
      un champ non réactif : cela pourrait masquer les mises à jour aux enfants.
- [x] Éviter que la réconciliation s'abonne accidentellement aux index qu'elle
      publie ; comparer les positions avec des lectures non suivies ou un champ
      interne distinct.
- [x] Coordonner publication des index, ordre DOM et flush des effets pour
      éviter des observations intermédiaires incohérentes. Utiliser le batching
      existant lorsque nécessaire, sans déplacer les flushs hors de leur contrat.

Le déplacement DOM reste nécessaire. L'optimisation réduit le travail de rendu
du contenu ; elle ne supprime pas la réconciliation de la collection.

## 4. Couvrir le rendu planifié, le SSR et l'hydratation

- [x] `scheduleFor` : une entrée déplacée avant son premier rendu reçoit son
      index courant, et non un index capturé lors de la planification.
- [x] Changements rapides de collection : annulation des tâches obsolètes et
      dernier état correct, sans effets résiduels.
- [x] SSR : consommation correcte du nouveau lecteur pour produire les numéros.
- [x] Hydratation : correspondance avec le HTML serveur, puis réordonnancement
      correct sans remplacement inutile du DOM hydraté.
- [x] Pas de double rendu provoqué par une publication d'index suivie d'une
      nouvelle planification de la même entrée.

## 5. Compléter TypeScript par une règle ESLint ciblée

Invariant : le lecteur d'index d'un template `forNode` ne doit pas être utilisé
comme une valeur scalaire sans lecture yieldable.

Le typage couvre les calculs numériques et les annotations incompatibles.
Il ne suffit pas pour toutes les coercitions : TypeScript peut accepter
une interpolation comme `` `${index}` `` ou `String(index)`.

Créer une règle locale, nom proposé `no-raw-for-index`, dans
`libs/dev-tools/src/eslint-rules/`.

- [x] Détecter les coercitions du lecteur en chaîne ou booléen, dont les
      interpolations et `String(index)` ; examiner également les coercitions
      du générateur retourné par `index()` sans consommation yieldable.
- [x] Reconnaître le vrai `forNode` importé, ses alias et les bindings de scope.
      Ne pas se fonder uniquement sur les noms `forNode` ou `index`.
- [x] Préserver les usages valides : `yield* index()`, binding direct du lecteur
      lorsque l'API l'accepte, transmission à une entrée réactive, lecteur
      stocké ou transmis comme tel.
- [x] Tester les listes imbriquées, les variables masquées, les alias locaux,
      les callbacks nommés et les limites de résolution. Utiliser les informations
      de types si nécessaires ; documenter les cas que l'analyse ne peut prouver.
- [x] Donner un diagnostic qui explique que l'index est un lecteur réactif et
      montre la lecture `yield* index()` dans un contexte générateur.
- [x] Ne pas proposer d'autofix qui ajoute aveuglément `yield*` hors d'un
      générateur ou qui capture une valeur au mauvais niveau de réactivité.
- [x] Enregistrer la règle dans `index.cjs` et dans `recommended-config.cjs`
      à la sévérité `error`.
- [x] Vérifier son activation dans les applications générées, y compris le
      preset Effect qui étend les règles recommandées.
- [x] Documenter les exemples rejetés et acceptés dans le guide ESLint.

La garantie est locale au code et aux types : aucune assertion du graphe
d'architecture n'est nécessaire pour cette migration.

## 6. Migrer tous les consommateurs du dépôt

- [x] Rechercher les seconds paramètres des callbacks de rendu `forNode`, y
      compris les callbacks nommés, les utilitaires et les templates imbriqués.
- [x] Remplacer les usages numériques par des lectures yieldable au niveau
      précis qui a besoin de l'index.
- [x] Migrer les entrées de composants ou contextes de templates qui transportent
      l'index : transmettre le lecteur quand la position doit rester réactive.
- [x] Mettre à jour les tests, les fixtures, les exemples, les snippets compilés,
      les générateurs et les applications de démonstration.
- [x] Mettre à jour les guides composants, réactivité fine et `scheduleFor`.
- [x] Faire passer le typecheck et ESLint ; ne pas masquer les diagnostics par
      `any`, assertions de type, désactivations de règle ou adaptateur legacy.

## 7. Refaire les mesures

- [x] Actualiser le smoke et les examens pour utiliser le vrai index réactif.
- [x] Garder une liste sans lecture de l'index et une liste affichant sa position.
- [x] Mesurer démarrage, modification d'un item, inversion et filtrage à
      1 000 et 5 000 lignes, en développement et en production.
- [x] Compter les réexécutions des templates, les mises à jour des bindings et
      vérifier l'identité DOM ainsi que les numéros finaux.
- [x] Vérifier le coût supplémentaire des signaux d'index au démarrage et en
      mémoire, ainsi que leur nettoyage après suppressions répétées.
- [x] Mesurer les scénarios avec rendu planifié et CPU ralenti.

L'expérience ignorant l'index donnait environ 145 → 7 ms pour une inversion de
5 000 lignes, mais elle était incorrecte pour les templates dépendants de l'index.
Ce chiffre indique un potentiel, pas une promesse pour l'implémentation correcte.

## Critères de fin

- [x] L'ancien contrat numérique du callback de rendu n'existe plus.
- [x] Les anciens calculs/annotations sont rejetés par TypeScript ; les
      coercitions identifiables qui lui échappent sont rejetées par ESLint.
- [x] Les lignes sans dépendance à l'index ne sont pas réexécutées uniquement
      parce que leur position change.
- [x] Les lignes dépendant de l'index restent correctes après chaque opération.
- [x] Les tests de typage, renderer, SSR/hydratation, planification et ESLint passent.
- [x] Les consommateurs et la documentation du dépôt sont migrés.
- [x] Les gains et les éventuels surcoûts sont mesurés et documentés.

## Validation et écarts documentés

Implémentation et campagne terminées. Voir le
[compte rendu](../benchmarks/2026-11-04-reactive-for-index.md) pour les mesures,
les compteurs, les coûts mémoire et les limites des observations.

Les batches ont nécessité de supprimer le double abonnement de `craftEffect`.
Les mesures de filtrage ont aussi conduit à libérer explicitement les rapports
et scopes des effets détruits, puis à isoler la closure du lecteur d'index de la
réconciliation. Les tests de régression et les mesures de nettoyage couvrent
ces corrections.

Les contrôles TypeScript et ESLint ciblés passent. Le contrôle TypeScript global
conserve exactement 430 diagnostics préexistants d'émission de déclarations,
sans nouveau diagnostic ; deux erreurs de lint de l'app de revue sont également
inchangées. Ces problèmes ne sont ni masqués ni traités par cette migration.
