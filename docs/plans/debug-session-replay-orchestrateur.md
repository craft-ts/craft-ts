# Plan : replay orchestré et snapshots de reprise

## État de mise en œuvre

- Base de départ : commit `a322f80e2` sur `god-replay`, avec les modifications
  locales de capture/replay reportées dans le worktree avant toute édition.
- Scénarios de référence couverts : navigation par lien et chargement de route,
  mutations directe/réussie/échouée via `mutation.mutate()`, transitions
  pending et activation différée, transport HTTP enregistré, et reprise depuis
  un snapshot stable. Le parcours HTTP est couvert via la route lazy-layout et
  son `CraftHttpClient`; le parcours de lien rend sa route et associe ses
  observations au lien même lorsqu’Angular les émet avant son callback DOM.
- Le format d’export passe en v6. Les archives v5 restent inspectables par les
  outils qui les comprennent, mais aucune migration implicite ne les rend
  exécutables par ce moteur.
- Un compilateur pur expose les commandes, leurs dépendances, les observations
  attendues et les problèmes détectables avant exécution dans
  `debug-session-orchestrator.ts`. Le contrôleur bloque les plans incomplets et
  choisit la frontière route, invocation, activation ou interaction à partir du
  type de commande compilé.
- L’exécuteur de plan attend les observations terminales avec un délai borné et
  reçoit l’exécution, l’horloge et les événements observés par adaptateurs.
- Les snapshots v1 décrivent route, primitives et stockage. L’API
  `recordReplaySnapshot` exige zéro opération en cours; l’option
  `captureReplaySnapshots` coalesce les changements et capture les points
  stables; l’export v6 les conserve et le contrôleur sait restaurer le dernier
  snapshot validé.
- Le runtime cible prévalide les routes, méthodes Craft et activations différées
  contre ses propres registres; les cibles absentes et ambiguës bloquent le plan
  avant l’exécution.
- L’exécuteur lance en parallèle les commandes indépendantes partageant la
  même frontière de timeline, après validation de leurs dépendances.
- Le dashboard expose la liste des commandes, les observations attendues et les
  problèmes de prévalidation. Les captures existantes enregistrent aussi les
  créations/destructions de composants comme observations.

Le contrôleur fait passer chaque action de lecture par `executeReplayPlan`, qui
vérifie les dépendances compilées avant de déléguer l’action au chemin de replay
existant. Celui-ci conserve la timeline monotone, les attentes d’opérations, la
pause/reprise et le traitement des interactions manuelles. Les commandes
groupées conservent toutes les invocations racines associées à une interaction;
les invocations enfants restent exécutées par leur appel parent. Les snapshots
v1 restent explicites : l’application doit appeler `recordReplaySnapshot` à un
point stable et fournir l’état sérialisable, la route, le stockage et la version
de l’application.

Le dashboard propose un mode diagnostic activable avant le replay. Il compare
les observations runtime au plan compilé après chaque commande et inscrit les
observations manquantes ou inattendues dans l’historique. Ce mode reste
non-bloquant et utilise le même exécuteur d’invocations que le replay normal.
Le replay d’invocations reste le mode par défaut. Le scénario d’actions passe
en mode diagnostic. Le scénario de navigation par lien termine ses 13 commandes,
rend le composant de `/pending-node` et ne produit aucune note de replay. Le
compilateur réserve à un lien les observations de navigation et de chargement
dont l’URL correspond, même si leur séquence précède le callback DOM du lien.
Le résultat query « 3 people » n’est pas une assertion de ce test; il reste
vérifié par le scénario pending-block dédié.

Le périmètre n’atteint pas encore tous les critères du plan. Le préflight côté
runtime valide les routes compilées et les cibles actuellement enregistrées;
les méthodes d’une route qui n’est pas encore montée ne peuvent pas être
confirmées avant son chargement. Les barrières du moteur historique peuvent
signaler certaines observations absentes comme avertissements plutôt que faire
échouer la commande. Le parcours HTTP accepté utilise une navigation UI vers
une route stable existante qui appelle `CraftHttpClient`; la saisie de la route
de recherche Open Library n’est pas le scénario de référence de transport.

### Vérification dans le worktree

- `pnpm typecheck` passe.
- 244 tests unitaires ciblés passent : orchestrateur, replay, capture de
  formulaires, bridge, pending, interpréteur, corrélation, tokens de session et
  serveur de logs.
- Sous Chromium, les parcours d’actions (mode diagnostic), pending-block,
  route-level queryParams, guards/resolvers et transport HTTP passent. Le test
  HTTP navigue vers la route lazy-layout, vérifie la réponse capturée
  « Replay HTTP user », puis confirme que le replay termine sans requête live.
- Le scénario Chromium de navigation par lien passe: l’URL et le composant cible
  sont vérifiés après les 13 commandes et aucune note de replay n’est affichée.
- Les suites complètes de `libs/core` (1 540 tests, 1 échec attendu, 3 todo) et
  `apps/log-server` (38 tests) passent. La suite complète de `libs/component`
  compte 449 tests réussis et des échecs dans des tests de launcher et de
  remount loops; les suites ciblées du replay et de l’orchestrateur passent.

## Objectif

Faire du replay un plan d’exécution explicite qui reconstruit le chemin applicatif enregistré, attend les résultats et vérifie les observations associées. Ajouter des snapshots versionnés comme points de reprise pour éviter de rejouer toute la session.

Le replay doit continuer d’utiliser les frontières applicatives normales : le routeur crée les composants, les méthodes Craft exécutent les opérations, et les adaptateurs de transport fournissent les résultats enregistrés. Il ne doit pas construire manuellement des instances de composants ni envoyer de requêtes réseau réelles en fallback.

## Principe du contrat

L’archive distingue deux catégories d’événements :

- **Commandes** : ce que le replay doit exécuter, comme naviguer, invoquer une méthode, activer un nœud différé ou restaurer un snapshot.
- **Observations** : ce que l’application a effectivement fait, comme charger une route, créer un composant, entrer en état pending, modifier un état Craft ou terminer une requête.

L’orchestrateur exécute les commandes et vérifie les observations attendues. La création des composants reste prise en charge par le routeur et le cycle normal de l’application.

## Étape 0 — Établir la base de départ

### Travail

- Relever les écarts de replay actuels et examiner les changements locaux non commités avant toute modification.
- Conserver les cas connus de navigation, mutation, état pending, transports et reprise après rechargement comme scénarios de référence.
- Documenter les limites actuelles de chaque mécanisme : commandes exécutables, observations seules et états restaurables.

### Critère de sortie

Une liste de cas représentatifs et un état du code de départ clairement identifié.

## Étape 1 — Définir un format d’événements explicite

### Travail

Concevoir un contrat d’archive versionné avec des types distincts pour les commandes et les observations.

Chaque commande devrait contenir au minimum :

- un identifiant d’opération;
- son type et sa charge utile — par exemple route, adresse de méthode et arguments;
- le temps de départ enregistré;
- ses dépendances causales;
- les conditions qui marquent sa fin;
- son état de rejouabilité, notamment si des arguments requis sont absents ou expurgés.

Les observations devraient référencer l’opération concernée lorsqu’elle est connue. Les commandes doivent conserver un graphe causal : les opérations concurrentes peuvent se chevaucher, mais leur ordre relatif doit rester déterministe.

### Critère de sortie

L’archive indique explicitement quelles actions exécuter, lesquelles peuvent avancer en parallèle et quelles observations doivent confirmer leur résultat.

## Étape 2 — Capturer les commandes aux frontières applicatives

### Travail

Ajouter ou compléter l’instrumentation là où l’application possède réellement l’action :

- appels de méthodes Craft, avec adresse, arguments et opération parent;
- navigations et tentatives de navigation, avec destination et options;
- activations de composants différés;
- démarrage, succès, échec et annulation des opérations asynchrones.

En parallèle, enregistrer la création et la destruction des composants comme **observations**. Leur identité doit permettre de les relier à une route et à une opération de replay.

### Critère de sortie

Un scénario de navigation ou d’interaction produit une commande complète, ses observations associées et une causalité exploitable. Les appels enfants ne sont ni omis ni invoqués deux fois.

## Étape 3 — Construire et valider le plan avant exécution

### Travail

Ajouter un compilateur qui transforme l’archive en graphe de commandes et de barrières. Il détecte avant l’exécution :

- les commandes sans cible ou avec des arguments incomplets;
- les routes et méthodes inconnues ou ambiguës;
- les opérations sans résultat asynchrone enregistré;
- les dépendances causales impossibles à satisfaire;
- les transports non pris en charge.

Le résultat précise si la session est entièrement rejouable, partiellement exploitable ou non rejouable, avec la cause.

### Critère de sortie

Les défauts connus de l’archive sont signalés avant que le replay ne modifie l’application.

## Étape 4 — Mettre en place l’orchestrateur

### Travail

L’orchestrateur parcourt le graphe et exécute chaque commande via son propriétaire applicatif :

- `navigate` passe par le routeur;
- `invoke` passe par le registre d’invocations Craft;
- l’activation passe par le mécanisme différé correspondant;
- les réponses HTTP et transport sont injectées par les adaptateurs enregistrés.

Il attend ensuite les conditions de fin associées : résultat du routeur, fin d’opération, observation de cycle de vie ou checkpoint d’état. Il ne passe à la suite qu’une fois la barrière satisfaite ou déclarée en échec.

La timeline conserve les temps enregistrés à l’aide d’une horloge virtuelle commune. La durée réelle peut être plus longue que celle de la capture; l’ordre causal et le temps de livraison des effets restent la référence.

### Critère de sortie

Une étape ne se termine pas uniquement parce qu’un délai est écoulé ou que la route semble affichée. Elle se termine quand son opération et ses observations attendues sont réglées.

## Étape 5 — Faire des snapshots des points de reprise versionnés

### Travail

Définir un snapshot comme un ensemble de données sérialisables et restaurables :

- route et paramètres de navigation;
- état des primitives Craft et des persisters enregistrés;
- stockages navigateur que l’application peut capturer et restaurer;
- versions de l’application et du format, ainsi que les capacités de restauration;
- opérations en cours, si leur reprise est explicitement prise en charge.

Commencer par des snapshots pris à des points stables, sans opérations asynchrones en cours. Pour le premier périmètre, reconstruire l’arbre de composants à partir de la route et de l’état restaurés, au lieu de sérialiser les instances de composants.

Chaque type d’état doit avoir un lecteur et un restaurateur. Un snapshot incomplet ou incompatible est refusé comme point de reprise fiable.

### Critère de sortie

L’application repart d’un snapshot validé, puis rejoue uniquement les commandes qui le suivent.

## Étape 6 — Adapter le dashboard et les diagnostics

### Travail

Le dashboard affiche les commandes exécutées et les observations qui les valident, avec leur état : en attente, réussi, divergent ou non rejouable. En cas d’échec, il indique la commande concernée, sa causalité, les événements attendus et observés, ainsi que l’écart de temps éventuel.

La timeline visuelle reste disponible pour montrer le contexte de la session, mais son affichage est distinct de l’exécution des commandes.

### Critère de sortie

On peut distinguer une commande non exécutée, une observation manquante, une opération encore en cours et un résultat réellement différent.

## Étape 7 — Migrer les archives et déployer par étapes

### Travail

- Introduire une nouvelle version d’archive et valider explicitement les anciennes versions.
- Convertir ou remplacer les scénarios de référence avant de retirer progressivement l’ancien chemin.
- Exécuter d’abord le nouveau moteur en mode diagnostic pour comparer les résultats.
- Choisir le nouveau moteur comme mode principal une fois les scénarios de référence acceptés.

Le périmètre initial couvre une navigation, une mutation réussie et une échouée, un chargement pending, une activation différée et une réponse transport enregistrée.

### Critère de sortie

Le replay orchestré passe les scénarios de référence, bloque les transports non enregistrés et explique les divergences à l’échelle d’une commande.

## Résultat visé

Une archive devient un plan exécutable et vérifiable : chaque commande a une cause, une frontière d’exécution et une condition de fin. Un snapshot fournit un point de départ versionné pour reprendre la session, sans promettre de restaurer des objets runtime que l’application ne sait pas sérialiser.
