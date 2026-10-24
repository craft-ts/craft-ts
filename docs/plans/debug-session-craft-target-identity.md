# Identité de cible Craft pour le replay

Date : 2026-10-19

## Objectif

Remplacer progressivement les sélecteurs CSS calculés au moment de la capture
par une identité de cible fournie par le runtime Craft. Au replay, cette
identité est résolue vers le nœud DOM actuellement rendu. La résolution doit
rester fiable quand le DOM est remounté, que des listes changent d’ordre ou que
la navigation remplace une partie de l’arbre.

Cette identité sert à retrouver une cible et à afficher les interactions
capturées. Elle ne déclenche aucun handler DOM : les effets applicatifs restent
produits par les invocations Craft enregistrées et rejouées explicitement.
Cette évolution complète l’enregistrement des invocations ; elle ne le réduit
pas aux `craftMethod`. Les méthodes exposées par les insertions `state`,
`queryParams`, `query`, `mutation` et `asyncProcess` restent dans le contrat de
replay.

## Pourquoi

Le sélecteur courant décrit la forme du DOM observée à la capture. Les chemins
`body > ... > nth-of-type(...)` deviennent faux après un remount ou un
changement de structure. Un sélecteur peut aussi être syntaxiquement valide,
mais pointer sur un autre élément après un changement d’ordre. Le runtime Craft
connaît mieux les composants, leurs hôtes et les clés de collection ; cette
connaissance doit devenir la source de vérité pour l’identité des cibles.

La capture d’interaction utilise aujourd’hui
`ɵstableReplaySelector()` dans `libs/core/src/lib/send-context-to-ai.tokens.ts`.
L’interpréteur expose déjà certains noms de nœuds via `data-craft-name` et
calcule des clés de collection (`track`) dans
`libs/component/src/lib/render/interpreter.ts`. Ces informations ne forment
toutefois pas encore un contrat runtime unique, stable et résoluble pour le
replay.

## Contrat cible à concevoir

Ajouter au runtime un fournisseur/résolveur de cible avec un contrat conceptuel
équivalent à :

```ts
type CraftReplayTarget = {
  runtimeId: string;
  componentPath: readonly CraftReplayComponentSegment[];
  localTargetPath: readonly CraftReplayTargetSegment[];
  fallback?: {
    selector?: string;
    clientX?: number;
    clientY?: number;
  };
};

type CraftReplayComponentSegment = {
  component: string;
  instanceKey?: string;
  collectionKey?: string;
};
```

Ce schéma est indicatif : les noms et le découpage exacts devront suivre les
identités réellement disponibles dans Craft. Il faut distinguer :

- l’identité d’un type de composant de celle de son instance ;
- l’adresse de l’instance dans l’arbre de composants ;
- la clé stable d’un élément dans une collection répétée ;
- le chemin local entre l’hôte du composant et l’élément DOM interactif ;
- l’identité d’occurrence d’un événement, qui reste distincte de celle de sa
  cible.

L’identité doit être opaque, déterministe dans la session et sans texte visible,
valeur de formulaire, secret ou donnée applicative sensible. Les sélecteurs CSS
et coordonnées restent des informations de diagnostic et de repli, pas la clé
principale de résolution.

## Règles de résolution

1. À la capture, demander au runtime Craft l’identité de la cible DOM la plus
   proche qui possède un propriétaire Craft résoluble, puis enregistrer aussi
   son chemin DOM local et ses coordonnées de viewport.
2. Au replay, résoudre l’identité vers le nœud actuellement monté. Vérifier
   l’unicité du résultat et son appartenance à l’instance Craft attendue.
3. Une navigation ou un remount invalide les références DOM déjà résolues ; le
   replay résout de nouveau l’identité au moment de chaque interaction.
4. Si un composant n’est pas encore monté, attendre une frontière de timeline
   explicitement enregistrée (navigation, invocation ou création de composant)
   puis réessayer avec un délai borné. Ne pas attendre indéfiniment.
5. Une cible DOM absente pour un hover reste une étape visuelle : afficher le
   repère aux coordonnées enregistrées, avertir et continuer. Une cible absente
   pour un clic, une saisie ou une action qui doit adresser un élément doit
   produire une divergence explicite et mettre le replay en pause.
6. Si la cible ne peut pas être résolue sans ambiguïté, ne jamais choisir le
   premier élément correspondant. Fournir le diagnostic et conserver le repli
   visuel quand il est pertinent.

## Identités et cas difficiles

### Composants répétés et listes

- Préférer la clé déclarée par l’application et déjà utilisée par le runtime
  pour suivre l’élément de collection.
- Ne pas utiliser l’index seul : il change quand la liste est triée ou filtrée.
- Définir le comportement quand une collection n’a pas de clé stable. Le runtime
  doit marquer l’identité comme instable ou ambiguë ; le replay ne doit pas
  prétendre qu’elle est fiable.
- Tester deux instances du même composant, y compris avec le même nom de
  composant, et les réordonnancements/inserts/suppressions de lignes.

### Enfants DOM natifs, portails et Shadow DOM

- Définir comment identifier un bouton natif rendu à l’intérieur d’un composant
  sans exposer une API Craft dédiée à ce bouton.
- Définir si les portails font partie du chemin du propriétaire logique ou du
  chemin DOM physique, et comment plusieurs racines sont distinguées.
- Traiter explicitement les racines Shadow DOM ouvertes. Les racines fermées ou
  DOM externes non instrumentés restent hors garantie et utilisent le repli
  disponible.

### Navigation, destruction et recréation

- L’identité est résolue après que la route cible soit prête, pas avant le
  départ de la navigation.
- Les états de route ne réutilisent pas par erreur une identité d’instance
  détruite qui aurait le même nom de composant.
- Une identité de cible ne doit pas elle-même déclencher la route. Le replay
  applique l’invocation de navigation enregistrée, attend la frontière router,
  puis résout la cible dans l’arbre rendu suivant.

## Format de session

- Ajouter le descripteur de cible au contrat des événements `dom`, `hover` et,
  si utile, `scroll`.
- Incrémenter la version d’archive lorsque le nouveau champ devient obligatoire
  pour le mode de replay qui s’appuie sur l’identité runtime.
- Aucune rétrocompatibilité ni migration automatique : rejeter explicitement
  les anciennes versions non prises en charge et demander une nouvelle capture.
- Pendant une éventuelle période de transition interne, le sélecteur peut être
  conservé pour le diagnostic et le repère visuel, sans être utilisé comme
  résolution silencieuse d’une cible Craft ambiguë.
- Refuser ou signaler les identités non sérialisables, trop volumineuses ou
  ambiguës au lieu de tronquer silencieusement leurs segments.

## Étapes d’implémentation

### 1. Inventorier les identités existantes

- Cartographier les identifiants d’instance, propriétaires de nœuds, clés de
  collection et cycle de vie de l’interpréteur Craft.
- Repérer comment les nœuds sont créés, détruits et réassociés pendant un
  remount, un changement de route ou une mise à jour de liste.
- Décrire les limites de résolution : DOM natif hors Craft, portails, racines
  Shadow DOM, contenu tiers.
- Décider si l’identifiant doit être directement stocké dans le DOM, résolu par
  une WeakMap du runtime, ou exposé via les deux mécanismes.

### 2. Définir le contrat et les invariants

- Établir le type public minimal capture/résolution et l’endroit où le runtime
  maintient son index vivant.
- Fixer la stabilité attendue pour une instance, une clé de liste et une
  navigation, ainsi que les conditions d’ambiguïté.
- Garantir que les identifiants n’encodent pas de données privées et ne
  modifient pas le rendu fonctionnel de l’application.
- Définir un index invalidé lors de la destruction afin de ne jamais retourner
  un élément DOM détaché.

### 3. Ajouter le résolveur au runtime

- Associer les nœuds DOM interactifs à leur propriétaire Craft et à leur
  chemin local.
- Inclure les clés de collection du mécanisme de suivi quand elles existent.
- Exposer une API de capture sur l’événement DOM et une API de résolution au
  replay, sans coupler le runtime à l’application dashboard.
- Ajouter des diagnostics pour les segments inconnus, propriétaires détruits,
  clés manquantes et résultats multiples.

### 4. Enregistrer et consommer les identités

- Enregistrer le descripteur sur les événements d’interaction avec le chemin
  CSS et les coordonnées comme données secondaires.
- Lors du replay, essayer d’abord le résolveur Craft et vérifier la cible.
- Préserver la séparation entre le repère visuel et les invocations Craft :
  aucun `click`, `pointer`, `input` ou `change` redispatché vers l’application.
- Appliquer le traitement hover tolérant déjà prévu ; garder les divergences
  strictes pour les actions nécessitant une cible fonctionnelle.

### 5. Versionner et expliquer les sessions incompatibles

- Mettre à jour les validateurs, types, exports, import UI et messages d’erreur.
- Appliquer la politique du dépôt : pas de lecture rétrocompatible automatique.
- Ajouter une indication claire qu’une session doit être recapturée si sa
  version n’est pas prise en charge.

## Tests requis

### Unitaires du runtime

- capture/résolution d’un nœud Craft simple et d’un enfant DOM natif ;
- distinction de deux instances du même composant ;
- résolution d’une ligne par sa clé après réordonnancement de liste ;
- mise à jour et destruction/remount d’une cible sans référence DOM périmée ;
- résultat absent et résultat ambigu ;
- données privées absentes de l’identité sérialisée ;
- fallback hover aux coordonnées enregistrées sans dispatch DOM.

### Intégration

- navigation : l’identité de l’ancienne route n’est pas réutilisée et la
  nouvelle cible est résolue après que l’invocation route ait terminé ;
- composant conditionnel : résoudre une cible créée par une invocation
  précédente ;
- composant répété : préserver l’identité quand la liste est réordonnée ;
- cible absente pour clic : divergence avec diagnostic, sans appel approximatif ;
- cible absente pour hover : avertissement, marqueur et poursuite de la
  timeline ;
- le replay n’émet aucun événement DOM applicatif pour afficher les interactions.

### E2E

- rejouer une session avec hover et clic dans une liste réordonnée et vérifier
  que les repères visent les bons éléments ;
- naviguer entre deux routes dont les composants ont les mêmes noms, puis
  vérifier que l’identité est résolue dans la route correcte ;
- remonter un composant entre capture et replay et vérifier la résolution sur
  le nouveau nœud DOM ;
- vérifier qu’une ambiguïté ou une identité invalide affiche une divergence
  exploitable plutôt que d’arrêter sans diagnostic ;
- vérifier les versions d’export : version courante acceptée, versions anciennes
  rejetées avec un message de recapture.

## Critères d’acceptation

- Les interactions Craft sont résolues indépendamment des changements de
  structure DOM non sémantiques.
- Une liste réordonnée conserve l’identité de la ligne grâce à sa clé stable.
- Une navigation ou un remount entraîne une nouvelle résolution contre l’arbre
  courant.
- Les cas sans identité stable ou ambigus sont explicitement signalés, jamais
  associés arbitrairement à un autre nœud.
- Les hovers absents restent visibles par coordonnées et ne bloquent pas les
  étapes suivantes.
- Le replay reste sans effet secondaire DOM : les invocations Craft enregistrées
  sont la source des changements applicatifs.
- Les tests unitaires, d’intégration et E2E couvrent ces invariants.
