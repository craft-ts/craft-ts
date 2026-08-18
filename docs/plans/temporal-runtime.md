# Temps contrôlable et typé dans Craft

## Objectif

Introduire une représentation Craft du temps qui rende les attentes et les
politiques de répétition :

- remplaçables entre production et tests ;
- contrôlables par une horloge virtuelle ;
- rattachées au cycle de vie du module qui les crée ;
- visibles dans les générateurs et les dépendances Craft ;
- inspectables en test et en mode diagnostic ;
- protégées contre les appels directs à `setTimeout` et `setInterval`.

L’objectif n’est pas de reproduire l’API native des timers. L’objectif est que
le runtime Craft sache suspendre, reprendre, interrompre, nettoyer et observer
les programmes qui dépendent du temps.

## État de la première tranche

La première tranche est implémentée dans `@craft-ts/core` :

- `CRAFT_TEMPORAL_RUNTIME` fournit l’adapter réel et peut être remplacé par
  `VirtualCraftTemporalRuntime` avec `provideCraftTemporalRuntime(...)` ;
- `craftSleep(...)` est yieldable par le driver asynchrone ;
- `withCraftTimeout(...)`, les tâches inspectables et l’annulation liée à
  `DestroyRef` sont disponibles ;
- les schedules fixe, exponentiel et séquentiel sont disponibles ;
- `retry`, le router, les guards signalés, les `defer`, la corrélation et les
  retries de lazy loading utilisent le seam temporel ;
- `no-direct-temporal-globals` protège les modules Craft contre les timers
  globaux, en laissant l’adapter temporel être l’unique frontière native.

Les migrations RxJS, les timers de l’UI AI et la conversion complète des
tests existants restent des étapes ultérieures ; elles ne sont pas nécessaires
pour utiliser l’horloge virtuelle dans les programmes Craft asynchrones.

## Position architecturale

Le temps doit être modélisé comme une capacité du runtime, avec un seam entre
une interface temporelle et ses adapters :

```text
programme Craft
  ├── attend       → primitive yieldable de délai
  ├── se répète    → politique de schedule
  └── lit l'heure  → horloge
          │
          ▼
runtime temporel Craft
  ├── adapter réel       → navigateur / Node
  └── adapter de test    → horloge virtuelle et registre
```

Cette séparation suit le modèle d’Effect : `Clock` porte la lecture du temps
et le sommeil ; `Schedule` porte les politiques de retry, repeat et pacing ;
`TestClock` remplace l’horloge et permet d’avancer le temps de manière
déterministe.

Références :

- [Effect `Clock`](https://effect-ts.github.io/effect/effect/Clock.ts.html)
- [Effect `TestClock`](https://effect-ts.github.io/effect/effect/TestClock.ts.html)
- [Effect `Schedule`](https://raw.githubusercontent.com/Effect-TS/effect/main/packages/effect/src/Schedule.ts)

## Vocabulaire public proposé

Les noms définitifs restent à choisir pendant la conception de l’interface.
Les responsabilités attendues sont :

- **horloge** : lire le temps courant, idéalement avec une notion monotone
  pour mesurer les durées ;
- **délai** : suspendre un programme pendant une durée ;
- **timeout** : interrompre une opération à une échéance ;
- **schedule** : calculer si et quand une opération doit recommencer ;
- **registre temporel** : exposer les tâches planifiées en test ou diagnostic.

`setInterval` ne doit pas être l’abstraction métier principale. Un intervalle
est une mécanique ; le besoin réel est souvent un polling, un repeat, un retry
ou une boucle interrompable.

## Plan d’implémentation

### 1. Cartographier les usages existants

Inventorier les appels directs et les abstractions temporelles actuelles :

- `setTimeout` / `clearTimeout` ;
- `setInterval` / `clearInterval` ;
- `Date.now` / `performance.now` ;
- promesses de délai ;
- retry/backoff ;
- debounce et persistance différée ;
- polling et tâches de nettoyage ;
- délais du router et lazy loading ;
- usages RxJS de `debounceTime`, `interval` et schedulers.

Points de départ identifiés :

- `libs/core/src/lib/craft-program-operators.ts` ;
- `libs/core/src/lib/craft-load-retry.ts` ;
- `libs/core/src/lib/correlation-id.ts` ;
- `libs/core/src/lib/craft-router-outlet.ts` ;
- `libs/core/src/lib/async-process.ts` ;
- `libs/component/src/lib/render/interpreter.ts` ;
- `libs/component/src/lib/ai/send-context-to-ai.ts`.

Pour chaque usage, préciser s’il s’agit d’un :

- délai unique ;
- timeout d’interruption ;
- debounce ;
- retry ;
- repeat ;
- polling ;
- délai technique de synchronisation.

Ne pas migrer indistinctement tous les timers : cette classification détermine
le primitive ou la politique appropriée.

### 2. Définir le seam temporel

Créer un module deep qui concentre le comportement temporel derrière une
interface réduite.

L’interface devra couvrir les invariants suivants :

- un délai peut être annulé ;
- toute tâche possède un propriétaire ou une portée de cleanup ;
- les tâches arrivées à échéance sont exécutées dans un ordre défini ;
- l’annulation est idempotente ;
- un intervalle peut être arrêté sans laisser de prochaine occurrence ;
- la lecture de durée utilise une horloge monotone quand elle mesure un
  intervalle ;
- la lecture de date civile reste distincte de la mesure de durée.

L’implémentation réelle sera le seul endroit autorisé à toucher aux APIs
natives du runtime d’exécution.

### 3. Ajouter une demande temporelle yieldable

Étendre le modèle existant des générateurs Craft afin qu’un délai puisse être
yieldé comme une demande de runtime.

Le chemin conceptuel est :

```text
craftSleep(500)
  → demande temporelle yieldée
  → driver Craft suspend le programme
  → adapter temporel réveille la demande
  → driver reprend le générateur
```

Le type yieldé doit permettre au parent de connaître l’usage du temps, de la
même manière que les primitives actuelles exposent leurs dépendances via
`ServiceTrackedDepsRequest`.

À examiner dans l’implémentation actuelle :

- `libs/core/src/lib/craft-primitive-gen.ts` ;
- `libs/core/src/lib/craft-generator-runtime.ts` ;
- `libs/core/src/lib/craft-program-runtime.ts` ;
- `libs/core/src/lib/craft-service.ts` ;
- `libs/core/src/lib/craft-gen.ts`.

Le runtime possède déjà une notion de `RuntimeGuardAwaitRequest` pour
suspendre un programme sur une promesse. Le délai temporel devrait devenir un
cas explicite et contrôlé de cette mécanique, plutôt qu’une promesse anonyme
créée dans un loader.

### 4. Remonter la dépendance dans les types

Décider si l’horloge apparaît :

1. comme une dépendance Craft obligatoire dans le graphe ;
2. comme une dépendance runtime intégrée, remplaçable sans alourdir chaque
   registre de test ;
3. comme une métadonnée temporelle en plus des dépendances de services.

Recommandation initiale :

- remonter dans `Yielded` le fait qu’un programme utilise le runtime temporel ;
- conserver l’adapter réel comme valeur par défaut ;
- permettre à l’outil de test de le remplacer automatiquement ;
- exposer séparément les métadonnées de durée, de kind et de schedule ;
- ne pas utiliser `300` ou `500` comme identifiant de dépendance.

La durée peut être dynamique. La dépendance stable est « ce programme dépend
du temps », tandis que la durée est une propriété de son comportement.

Ajouter des tests de type vérifiant notamment :

- qu’un `craftService` utilisant un délai expose la capacité temporelle ;
- qu’un loader utilisant un délai la remonte au service parent ;
- qu’un module sans opération temporelle ne l’expose pas ;
- que les dépendances temporelles se propagent dans `yield*` et `.pipe(...)` ;
- que les registres de test restent ergonomiques lorsque l’adapter par défaut
  suffit.

### 5. Construire l’adapter temporel de test

L’adapter de test doit fournir une horloge virtuelle indépendante du temps
réel.

Capacités minimales :

- lire le temps courant ;
- avancer de `n` millisecondes ;
- positionner l’horloge à une valeur précise ;
- exécuter les tâches échues dans l’ordre ;
- vider les microtasks liées aux tâches exécutées ;
- inspecter les tâches en attente ;
- annuler une tâche ;
- restaurer l’état initial de l’horloge ;
- détecter les tâches restantes en fin de test.

Le comportement des échéances identiques doit être documenté, par exemple :

```text
1. échéance la plus proche ;
2. ordre de création pour les égalités ;
3. cleanup et annulation avant les nouvelles tâches ;
4. reprise des programmes après chaque tâche échue.
```

Vitest peut rester l’implémentation technique sous-jacente au début, mais
Craft doit ajouter la sémantique qui lui manque : propriétaire, portée,
identifiant, kind, échéance et état de cleanup.

### 6. Ajouter les assertions temporelles

Ajouter une façade de test orientée comportement, sans obliger chaque test à
manipuler directement `vi`.

Assertions et opérations à couvrir :

- avancer l’horloge ;
- avancer jusqu’à la prochaine tâche ;
- exécuter jusqu’à stabilisation ;
- lister les tâches d’un module ;
- vérifier une échéance attendue ;
- vérifier qu’une tâche a été annulée ;
- vérifier qu’un module ne possède plus de tâche après destruction ;
- détecter les tâches orphelines en fin de test.

Exemples de scénarios :

#### Debounce

- une nouvelle entrée annule le délai précédent ;
- une seule requête part après la durée complète ;
- aucune tâche ne reste après l’exécution.

#### Timeout

- l’opération gagne avant l’échéance ;
- l’opération est interrompue à l’échéance ;
- le timeout est annulé si l’opération gagne ;
- aucune tâche de timeout ne reste après résolution.

#### Retry

- les échéances suivent la politique de backoff ;
- la tentative finale ne programme pas de tâche supplémentaire ;
- une erreur non réessayable annule la prochaine échéance ;
- la durée totale respecte une éventuelle deadline.

#### Polling

- le polling s’arrête après le succès ;
- les ticks ne se chevauchent pas si le traitement est séquentiel ;
- la destruction arrête la prochaine occurrence ;
- un échec applique la politique prévue.

### 7. Introduire les schedules

Créer une abstraction de politique indépendante du mécanisme de timer.

Une politique doit pouvoir décider :

- continuer ou s’arrêter ;
- quelle durée attendre ;
- quel est le numéro de tentative ;
- combien de temps s’est écoulé ;
- quelle entrée ou quelle erreur a provoqué l’étape.

Premières politiques possibles :

- `once` ;
- `fixed` ;
- `exponential` ;
- `linear` ;
- `jittered` ;
- `until` ;
- `maxAttempts` ;
- `deadline`.

Le schedule ne doit pas posséder lui-même un `setInterval`. Le runtime exécute
une étape, demande au schedule la prochaine échéance, puis programme la suite
avec l’adapter temporel.

Cette forme permet d’éviter les intervalles qui continuent après destruction,
les traitements concurrents involontaires et les retries qui ignorent leur
deadline.

### 8. Gérer interruption et cleanup

Chaque tâche temporelle doit être liée à une portée Craft :

- service global ;
- service fonctionnel ;
- composant ;
- invocation d’une mutation ou d’un async process ;
- programme temporaire.

À la destruction ou à l’interruption de la portée :

- les délais sont annulés ;
- les intervals cessent de programmer la suite ;
- les programmes suspendus sont interrompus ;
- les callbacks ne peuvent plus muter un état invalide.

Ajouter des tests de cleanup avant de migrer les usages existants. C’est la
propriété qui distingue un vrai module temporel d’un simple wrapper de timer.

### 9. Ajouter la règle de contournement

Créer une règle dev-tools qui interdit les accès directs aux timers globaux
dans les modules Craft.

La règle devra :

- détecter `setTimeout`, `setInterval`, `clearTimeout` et `clearInterval` ;
- détecter les promesses de délai courantes ;
- autoriser explicitement l’implémentation temporelle ;
- produire un diagnostic proposant l’opération Craft adaptée ;
- couvrir les fichiers de production et les exemples documentaires.

Cette règle doit être ajoutée après l’existence du seam temporel, afin de ne
pas bloquer la migration avant que l’alternative soit disponible.

### 10. Migrer les usages internes

Migrer progressivement par catégorie :

1. `retry` et backoff dans `craft-program-operators.ts` ;
2. retry du lazy loading et des routes ;
3. debounce de correlation et persistance ;
4. délais de `craft-router-outlet` ;
5. async processes contenant des délais explicites ;
6. usages du composant et de l’AI context ;
7. polling et intervals éventuels.

Chaque migration doit conserver :

- la sémantique d’annulation ;
- l’ordre d’exécution ;
- le comportement avec les fake timers existants ;
- les messages et exceptions actuels ;
- la compatibilité avec `craftUse` et les drivers synchrones.

### 11. Documenter le modèle

Ajouter une documentation expliquant :

- la différence entre horloge, délai, timeout et schedule ;
- quand utiliser une attente yieldable ;
- pourquoi les callbacks de timer directs sont interdits ;
- comment avancer le temps dans un test ;
- comment vérifier l’absence de tâches orphelines ;
- comment choisir entre retry, repeat et polling ;
- la différence entre temps monotone et date civile.

Documenter également les limitations :

- throttling réel des onglets en arrière-plan ;
- différences entre microtasks et macrotasks ;
- schedulers RxJS non intégrés ;
- annulation réelle des requêtes HTTP ;
- timers créés par des APIs externes.

## Critères d’acceptation

Le plan sera considéré comme réalisé lorsque :

- aucun module Craft migré n’appelle directement les timers globaux ;
- une attente Craft est yieldable et propagée dans les dépendances ;
- l’adapter réel fonctionne dans le navigateur et dans Node ;
- l’adapter de test avance le temps sans attendre le temps réel ;
- les tâches échues sont exécutées dans un ordre documenté ;
- un test peut inspecter les tâches en attente ;
- la destruction annule les tâches liées à sa portée ;
- les tests détectent les tâches orphelines ;
- retry, repeat et polling sont exprimés par des schedules ;
- les tests de type couvrent la propagation de la dépendance temporelle ;
- les tests runtime couvrent debounce, timeout, retry et polling ;
- les docs et la règle ESLint décrivent le même modèle.

## Décisions à prendre avant implémentation

- La capacité temporelle est-elle une dépendance visible dans tous les
  registres Craft, ou un service runtime par défaut remplaçable en test ?
- Le timeout doit-il interrompre seulement le programme Craft, ou aussi
  propager une annulation vers la ressource externe (`AbortSignal`) ?
- Les schedules sont-ils des fonctions pures, des générateurs ou des valeurs
  Craft composables ?
- Le registre est-il uniquement test/dev, ou aussi exposé aux devtools runtime ?
- Le temps courant utilise-t-il `performance.now`, `Date.now` ou deux
  opérations distinctes ?
- Les schedulers RxJS doivent-ils être adaptés dès la première version ?
- Les callbacks non générateurs peuvent-ils utiliser un helper impératif, ou
  toute attente doit-elle passer par `yield*` ?

## Hors périmètre initial

- remplacement complet de RxJS ;
- horloge distribuée ou synchronisation serveur ;
- timers durables après redémarrage de l’application ;
- simulation du throttling navigateur ;
- cron et calendrier civil complexe ;
- modification immédiate de tous les tests Vitest existants.

## Ordre recommandé

1. Cartographier et classifier les usages.
2. Définir le seam horloge/adapters.
3. Ajouter une attente yieldable minimale.
4. Ajouter l’adapter de test et les assertions de cleanup.
5. Migrer `retry` et un cas de debounce représentatif.
6. Ajouter les schedules.
7. Ajouter la règle ESLint.
8. Migrer les autres usages internes.
9. Documenter et stabiliser les décisions restantes.
