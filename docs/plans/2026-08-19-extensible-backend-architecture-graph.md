# Plan — Graphe d’architecture extensible par backend TypeScript

## Objectif

Faire évoluer le graphe d’architecture pour qu’il puisse analyser des
dépendances venant du serveur sans rendre le cœur dépendant d’EffectTS.

Le graphe doit pouvoir accueillir plusieurs backends TypeScript :

- EffectTS ;
- une autre bibliothèque d’injection ou de composition ;
- un backend propre à un repository ;
- plusieurs backends dans le même programme.

L’adapter EffectTS sera le premier cas concret. Il devra relier une server
function à ses dépendances Effect, ses `Layer`, ses sorties de données et ses
appels externes.

Le plan couvre également les données sensibles et les règles d’architecture
qui imposent une protection lorsqu’une donnée sensible atteint une sortie
externe.

## Décisions d’architecture

### 1. Séparer le moteur, les collecteurs et les règles

Le moteur central doit seulement :

- charger le programme TypeScript ;
- offrir un contexte de résolution ;
- fusionner des contributions de graphe ;
- valider l’identité des nœuds et des relations ;
- exposer le graphe aux règles et aux renderers.

La connaissance d’EffectTS, de CraftTS ou d’un autre backend doit vivre dans
un `Adapter` de collecte.

```text
Programme TypeScript
        ↓
Moteur du graphe
        ↓
Seam des collecteurs
        ├── collecteur CraftTS
        ├── collecteur server functions
        ├── Adapter EffectTS
        └── Adapter spécifique au repository
        ↓
Faits, nœuds et relations
        ↓
Règles d’architecture typées
```

Un collecteur ne doit pas modifier directement les règles. Il publie des
faits accompagnés de preuves : fichier, ligne, symbole et motif syntaxique ou
typé ayant justifié le fait.

### 2. Ouvrir le registre des types de nœuds

Le type actuel `DependencyGraphNodeKind` est une union fermée. Il doit devenir
un registre extensible par declaration merging.

Le cœur possèdera un registre de base pour ses nœuds existants. Un Adapter
pourra ajouter ses propres entrées dans le module du graphe :

```ts
declare module '@craft-ts/dev-tools/dependency-graph' {
  interface DependencyGraphNodeRegistry {
    'effect-service': EffectServiceNodeDetails;
    'effect-layer': EffectLayerNodeDetails;
    'data-classification': DataClassificationNodeDetails;
  }
}
```

Le registre devra permettre d’inférer :

- `DependencyGraphNodeKind = keyof DependencyGraphNodeRegistry` ;
- les détails associés à un `kind` ;
- un type de nœud spécialisé pour les règles ;
- les propriétés communes (`id`, `label`, `filePath`, `line`) ;
- les propriétés spécifiques d’un backend.

Le JSON généré restera ouvert et devra préserver les nœuds inconnus pour
permettre à un renderer ou à une règle d’un plugin de les consommer.

### 3. Ouvrir également le registre des relations

Les relations existantes (`depends-on`, `calls`, `contains`, etc.) ne couvrent
pas tous les besoins de data-flow. Un second registre extensible devra
permettre d’ajouter, par exemple :

- `requires-service` ;
- `provided-by-layer` ;
- `flows-data` ;
- `transforms-data` ;
- `exposes-data` ;
- `protected-by` ;
- `has-unknown-protection`.

Les relations personnalisées devront conserver une preuve et des détails
typés. Une règle ne devra pas être obligée de lire des chaînes arbitraires
dans `Record<string, unknown>`.

### 4. Exposer une API de requête générique aux règles

Les règles ne doivent pas dépendre d’une collection générée à la main pour
chaque nouveau backend. Le graphe doit fournir des primitives génériques
permettant de :

- sélectionner les nœuds par `kind` ;
- filtrer leurs détails avec le type associé au registre ;
- parcourir les relations entrantes et sortantes ;
- demander les chemins entre deux familles de nœuds ;
- récupérer les preuves d’une relation ;
- produire une violation avec chemin et preuves.

Le declaration merging doit donc modifier automatiquement le type visible par
les règles du repository. Une règle qui sélectionne `effect-service` doit
obtenir `EffectServiceNodeDetails`, et non un nœud générique non typé.

### 5. Garder les extensions runtime séparées des extensions de typage

Le declaration merging sert au typage des règles et des collecteurs. Il ne
doit pas être le mécanisme qui découvre automatiquement un collecteur à
l’exécution.

Le repository devra déclarer explicitement les collecteurs activés dans sa
configuration de graphe. Cela évite qu’un import de types active par surprise
une analyse coûteuse ou des règles inattendues.

## Adaptateur EffectTS

### Phase A — Relier les server functions aux services Effect

Étendre le collecteur server function pour exposer les handlers serveur comme
des propriétaires de dépendances.

L’Adapter Effect devra reconnaître au minimum :

```ts
yield* UserRepository;
yield* CurrentUser;
effectService(UserRepository);
```

Le résultat attendu est :

```text
server-function-server:demo.users.list
  └── requires-service → effect-service:UserRepository
```

Les formes non résolues doivent produire un fait d’incertitude plutôt que
d’être silencieusement ignorées.

### Phase B — Résoudre les `Layer`

Suivre les fournitures statiquement résolubles :

```ts
Effect.provide(effect, runtimeLayer)
Layer.succeed(CurrentUser, value)
Layer.effect(UserRepository)(repository)
Layer.mergeAll(...)
Layer.provide(...)
```

Le parcours devra distinguer :

- service requis ;
- service fourni ;
- service fourni indirectement ;
- fourniture manquante ;
- fourniture dynamique ou inconnue.

Pour le demo, le chemin attendu est :

```text
demo.users.list
  → UserRepository
  → database.layer
  → FileSystem
  → NodeFileSystem.layer
  → data/users.json
```

La résolution des `Layer` dynamiques sera explicitement limitée dans une
première version. Le graphe doit signaler la limite plutôt que prétendre avoir
résolu la dépendance.

### Phase C — Suivre les sorties externes

Identifier les sorties qui peuvent quitter le processus :

- réponse d’une server function exposée au client ;
- appel HTTP ;
- publication de message ;
- écriture dans un stockage externe ;
- logger ou exporter d’observabilité.

Chaque sortie doit devenir un nœud ou une relation suffisamment précise pour
être ciblée par une règle.

## Classification des données sensibles

### 1. Distinguer runtime et analyse statique

EffectTS fournit `Redacted` pour réduire l’exposition accidentelle d’une
valeur au runtime. Il est utile pour les secrets, mais il ne suffit pas à
classifier statiquement un champ dans le graphe.

La classification doit donc avoir deux formes complémentaires :

- un type ou une valeur runtime protectrice (`Redacted<T>` quand adapté) ;
- une annotation statique lisible par l’Adapter.

Effect Schema accepte des annotations personnalisées. Le repository pourra
déclarer par exemple :

```ts
const Email = Schema.String.pipe(
  Schema.annotations({
    sensitivity: 'personal-data',
  }),
);
```

Les catégories devront être configurables, par exemple :

- `secret` ;
- `personal-data` ;
- `financial` ;
- `health` ;
- `internal`.

### 2. Propager la classification

L’Adapter devra produire des faits lorsqu’une donnée classifiée traverse :

- un champ de schéma ;
- un objet ou un tableau ;
- une fonction ;
- le résultat d’une server function ;
- une transformation ;
- un appel externe.

Le graphe devra distinguer au minimum :

- donnée sensible conservée ;
- donnée sensible transformée ;
- donnée redacted ;
- donnée supprimée ;
- classification inconnue.

Exemple :

```text
User.email [personal-data]
  └── flows-data → getAuthenticatedUsers output
        └── exposes-data → HTTP response
```

La propagation sera d’abord conservatrice : en cas de doute, la
classification sensible est conservée.

## Politiques de sécurité personnalisables

### 1. Déclarer les capacités des middlewares

Un middleware ne sera pas reconnu comme protecteur uniquement par son nom de
variable. Le repository devra déclarer ses capacités :

```text
demo.audit-sensitive-data
  protects: [personal-data, secret]

demo.encrypt-payload
  protects: [secret, financial]
```

Les capacités pourront être associées aux nœuds middleware existants ou à des
nœuds fournis par un Adapter.

### 2. Exprimer les règles

Une règle pourra dire :

```text
Tout chemin entre une donnée de sensibilité `secret` et une sortie externe
doit traverser un middleware possédant `protects:secret`.
```

La violation devra contenir :

- la donnée d’origine ;
- le chemin de propagation ;
- la sortie externe ;
- les middlewares traversés ;
- les capacités attendues ;
- les preuves source correspondantes.

La règle sera générique. Le repository configurera les catégories, les sorties
externes et les capacités autorisées.

## Phases d’implémentation

### 1. Cartographier et verrouiller le contrat actuel

- inventorier les `DependencyGraphNodeKind` et `DependencyGraphEdgeKind` ;
- inventorier les usages directs de `node.kind` et `node.details` ;
- identifier les renderers, catalogues et règles qui supposent une union fermée ;
- ajouter des fixtures de compatibilité pour le graphe actuel ;
- documenter la version JSON et la stratégie d’évolution.

### 2. Introduire les registres ouverts

- remplacer les unions fermées par des registres augmentables ;
- typer les détails par kind ;
- ajouter un registre parallèle pour les relations ;
- conserver une représentation runtime tolérante pour les plugins externes ;
- ajouter des tests de declaration merging dans un projet fixture.

### 3. Introduire la seam des collecteurs

- définir le contexte partagé de résolution TypeScript ;
- définir le format d’une contribution : nœuds, relations, diagnostics et preuves ;
- rendre les collecteurs activables par configuration ;
- migrer progressivement les collecteurs actuels sans changer le JSON produit ;
- vérifier qu’un collecteur absent ne retire pas les nœuds fondamentaux du cœur.

### 4. Implémenter l’Adapter Effect minimal

- détecter les services `Context.Service` ;
- détecter `yield* Tag` et `effectService(Tag)` ;
- considérer les server functions comme propriétaires ;
- produire `requires-service` et les preuves ;
- ajouter le demo comme fixture de référence.

### 5. Ajouter la résolution des `Layer`

- résoudre `Effect.provide` et les compositions statiques ;
- modéliser `Layer.succeed`, `Layer.effect`, `Layer.mergeAll` et les fournitures ;
- distinguer résolution complète, partielle et inconnue ;
- ajouter les tests de cycle et de fourniture contradictoire.

### 6. Ajouter la classification et le data-flow

- définir les annotations de sensibilité ;
- lire les annotations Effect Schema ;
- ajouter le support `Redacted` comme fait runtime/statique quand il est identifiable ;
- propager les classifications ;
- créer les nœuds et relations de sortie externe ;
- produire des chemins explicables.

### 7. Ajouter les politiques de sécurité

- déclarer les capacités des middlewares ;
- créer la règle de protection des sorties sensibles ;
- rendre les catégories et capacités configurables par repository ;
- ajouter les violations avec preuves ;
- tester les cas autorisés, interdits et inconnus.

### 8. Documenter et stabiliser l’extension

- documenter l’ajout d’un Adapter TypeScript ;
- documenter le declaration merging des nœuds et relations ;
- documenter la création d’une règle typée ;
- documenter les limites de résolution statique ;
- versionner le format JSON si de nouveaux invariants sont introduits.

## Critères d’acceptation

- Le cœur compile et fonctionne sans importer EffectTS.
- Un repository peut ajouter un nouveau type de nœud par declaration merging.
- Une règle personnalisée obtient les détails typés du nouveau nœud.
- Un repository peut ajouter un nouveau type de relation sans modifier le cœur.
- Les nœuds inconnus sont conservés dans le JSON et ignorés proprement par les renderers qui ne les connaissent pas.
- Le graphe du demo relie `demo.users.list` à `UserRepository`.
- Les fournitures statiques de `UserRepository` sont visibles avec leurs preuves.
- Une donnée annotée `sensitivity: 'personal-data'` peut être suivie jusqu’à une sortie externe.
- Une règle peut exiger un middleware nommé ou une capacité de protection.
- Une violation présente un chemin, les nœuds concernés et les fichiers/lignes justificatifs.
- Les dépendances dynamiques ou non résolues sont signalées comme inconnues et ne sont pas présentées comme résolues.
- Les règles existantes du graphe restent compatibles pendant la migration.

## Risques et garde-fous

### Explosion du modèle de nœuds

Ne pas créer un kind pour chaque détail local. Un nouveau kind est justifié
lorsqu’il possède une sémantique, des règles ou un renderer propre. Les autres
informations restent dans les détails typés.

### Déclaration de types trop permissive

Le declaration merging doit ajouter des entrées à des registres documentés,
mais ne doit pas permettre de casser les invariants des nœuds et relations de
base. Les fonctions de construction valideront les champs requis au runtime.

### Fausse confiance dans la résolution Effect

Les `Layer` dynamiques, imports indirects et branches conditionnelles peuvent
empêcher une preuve complète. Le modèle doit représenter `unknown` et la règle
doit pouvoir choisir si l’inconnu est bloquant.

### Propagation trop conservatrice

Une propagation sensible par défaut peut générer du bruit. Les règles devront
permettre des transformations explicitement approuvées : redaction,
agrégation, anonymisation ou suppression.

### Couplage entre plugin et renderer

Le renderer générique doit afficher un nœud inconnu sous forme de fallback. Un
Adapter ne doit pas devoir modifier le renderer principal pour être utilisable.

## Première tranche recommandée

Commencer par les phases 1 à 4 : registres ouverts, seam des collecteurs et
liaison server function → service Effect. Cette tranche fournit le socle de
typage et prouve que le backend Effect est un Adapter parmi d’autres, sans
engager immédiatement la résolution complète des `Layer` ni le data-flow.

Les phases 5 à 7 pourront ensuite être développées sur ce socle sans réouvrir
le contrat du cœur.
