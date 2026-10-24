# Plan — replay déterministe des sessions Craft

Date : 2026-10-19

## Objectif

Permettre de rejouer une session d’application à partir d’un état initial et
d’une trace causale fiable. Les clics, saisies, survols et autres événements
DOM capturés servent à expliquer visuellement la session ; ils ne relancent pas
les handlers applicatifs. Le replay invoque les méthodes Craft enregistrées,
avec leurs arguments, puis fournit aux loaders les résultats asynchrones
enregistrés au temps prévu.

Le replay doit s’arrêter et signaler une divergence quand il ne peut pas
identifier sans ambiguïté une invocation, restaurer l’état requis ou associer
une réponse asynchrone. Il ne doit jamais masquer cette situation par un appel
réseau réel.

## État de départ

L’état du dépôt au moment de ce plan contient déjà :

- l’affichage des marqueurs DOM et l’invocation de méthodes racines pendant le
  replay par invocation ;
- un registre runtime pour `craftMethod` et les méthodes exposées par les
  insertions de `state`, `queryParams`, `query`, `mutation` et `asyncProcess` ;
- des snapshots de primitives, de persisters et, en mode local configuré, du
  stockage navigateur ;
- le replay temporel de `CraftHttpClient`, de `fetch`, de WebSocket et de Worker
  déclarés par adaptateur ;
- le format d’export v4.

Les lacunes principales à traiter sont la capture des arguments des méthodes
d’insertion, la sélection causale des invocations à rejouer, le moment de
capture/restauration des snapshots et l’alignement entre documentation,
format d’archive et comportement des différents modes. Les fonctionnalités
existantes doivent être conservées lorsqu’elles satisfont les critères ci-
dessous.

## Décisions de conception

1. **Une interaction DOM est une observation, pas une commande.** Le replay ne
   redispatche aucun événement `click`, `pointer*`, `mouse*`, `key*`, `input`
   ou `change` vers l’application. Il peut déplacer le curseur visuel, montrer
   la cible et restaurer une valeur de champ pour l’affichage, sans déclencher
   de handler.
2. **Les invocations Craft sont les commandes du replay.** La trace conserve
   l’adresse stable de la méthode, ses arguments sérialisés, son opération,
   son parent causal éventuel et son temps de départ. Les appels enfants déjà
   déclenchés par une racine sont exécutés par cette racine ; ils ne sont pas
   rappelés séparément.
3. **Les loaders restent actifs.** Les `query`, `mutation` et `asyncProcess`
   s’exécutent selon le chemin normal. Le replay contrôle leurs effets externes
   aux frontières de transport et réinjecte les résultats capturés.
4. **L’état est prêt avant la première exécution applicative du replay.** La
   page ne doit pas démarrer des loaders ou effets avec un état vierge, puis
   être restaurée après coup. La restauration et l’installation des gardes
   réseau précèdent l’initialisation applicative rejouée.
5. **Toute évolution incompatible du contrat d’archive incrémente sa version.**
   Le lecteur rejette les versions antérieures non prises en charge avec un
   message explicite ; aucune migration silencieuse n’est tentée.

## Phase 1 — Contrat d’invocation complet

### Travail

- Décrire un événement d’invocation commun aux méthodes `craftMethod` et aux
  méthodes d’insertion des primitives : adresse, arguments sérialisés, ID
  d’opération, parent, corrélation d’interaction et temps monotone.
- Enregistrer les arguments pour les insertions de `state`, `queryParams`,
  `query`, `mutation` et `asyncProcess`, pas uniquement pour les hôtes
  `method:`.
- Capturer les appels uniquement lorsqu’ils sont causés par une interaction
  enregistrée ou par un parent déjà causalement relié. Continuer à exclure le
  bruit de démarrage sans corrélation, sauf si une décision séparée définit le
  replay des effets de démarrage.
- Normaliser l’adresse d’invocation sans perdre l’identité d’instance. Si
  plusieurs instances correspondent à une adresse après normalisation, rendre
  l’invocation ambiguë et bloquer cette branche du replay.
- Construire le graphe parent/enfant à partir des corrélations existantes et
  marquer chaque événement comme racine, enfant exécuté par son parent ou appel
  indépendant.
- Garder les arguments sérialisables et expurgés. Une valeur non sérialisable,
  expurgée au point de rendre l’appel indéterminable ou trop volumineuse doit
  rendre l’invocation explicitement non rejouable.

### Critères de sortie

- Les appels aux cinq familles d’insertions ci-dessus produisent des
  invocations adressables avec leurs arguments.
- Une invocation enfant n’est jamais exécutée deux fois lorsqu’une racine la
  déclenche déjà.
- Un appel indépendant issu de la même interaction reste une racine distincte.
- Une adresse inconnue ou ambiguë produit un diagnostic exploitable et ne
  déclenche aucun appel approximatif.

## Phase 2 — Événements DOM strictement visuels

### Travail

- Séparer explicitement l’enregistrement d’une interaction de son affichage
  pendant le replay.
- Dans le chemin de replay actif, retirer toute redistribution d’événement
  applicatif. Cela inclut la branche spéciale des champs `valueOnly` ; la
  valeur enregistrée peut être assignée sans émettre `input` ou `change`.
- Garder les événements visuels dans la timeline et les associer à leurs
  invocations causales pour afficher le contexte au bon moment.
- Conserver la restauration de la position de scroll comme état de
  présentation. Bloquer les listeners de scroll applicatifs pendant ce
  déplacement, y compris les listeners attachés aux éléments scrollables.
- Retirer ou isoler le chemin legacy qui redispatche les événements. Une
  session rejouée par le dashboard doit toujours sélectionner explicitement le
  mode invocation ; aucun fallback DOM automatique n’est permis.

### Critères de sortie

- Un test avec listeners comptabilisant `click`, `input`, `change`, `pointer`,
  `keyboard` et `scroll` confirme qu’aucun handler applicatif n’est exécuté par
  les marqueurs du replay.
- Le curseur, les repères, les cibles et les valeurs de champ restent visibles
  pendant la lecture.
- La valeur d’un champ modifiée lors de l’enregistrement est reproduite par
  l’invocation Craft associée ou par son état restauré, sans émission DOM.

## Phase 3 — Snapshot de départ et démarrage contrôlé

### Travail

- Définir deux snapshots explicites dans le contrat :
  - l’état navigateur : `localStorage`, `sessionStorage`, cookies et bases
    IndexedDB accessibles ;
  - l’état Craft : valeurs initiales des primitives et contenus gérés par les
    persisters enregistrés.
- Capturer l’état navigateur avant le bootstrap applicatif. Capturer l’état
  Craft/persisters après leur enregistrement, mais avant la première
  interaction et avant toute mutation déclenchée par l’utilisateur.
- Ajouter un protocole de lancement qui fournit le snapshot et les résultats
  asynchrones au contexte de replay avant de démarrer les loaders. La page ne
  doit pas être rechargée dans un état intermédiaire qui exécute des requêtes
  live ou publie des effets avant la restauration.
- Installer les gardes HTTP/fetch/transport avant l’exécution des loaders de
  replay. Les requêtes de démarrage doivent consommer les réponses
  enregistrées ou échouer explicitement.
- Définir le comportement de chaque mode (URL et snapshot) et veiller à ce
  qu’ils restaurent tous deux les éléments requis du snapshot. Préciser les
  limites des stockages indisponibles, non énumérables ou non restaurables.
- Expurger les données sensibles selon une politique claire. Si les données
  capturées sont indispensables au replay mais ont été expurgées, signaler que
  la session est inspectable mais non rejouable.

### Critères de sortie

- Au premier rendu rejoué, les primitives et données persistées correspondent
  au snapshot de départ.
- Aucun loader ne voit temporairement l’état de l’application cible avant
  restauration.
- Les tests vérifient qu’aucune requête réelle ne part avant l’installation des
  réponses enregistrées.
- Une session sans snapshot requis ou avec stockage non restaurable est
  déclarée non rejouable avant l’étape concernée.

## Phase 4 — Résultats asynchrones et horloge virtuelle

### Travail

- Garder `CraftHttpClient` comme frontière HTTP principale : associer chaque
  requête à son résultat succès/échec, au contexte de requête et à son temps
  d’achèvement enregistré.
- Rendre l’association déterministe pour les requêtes simultanées. Ajouter un
  identifiant de transport/corrélation lorsque méthode, URL, paramètres et
  corps ne suffisent pas à distinguer deux requêtes identiques.
- Garder le support direct de `fetch` comme frontière explicite ; distinguer
  les réponses binaires, les erreurs et les réponses sans corps. Un appel non
  apparié échoue, sans requête live.
- Utiliser une seule horloge virtuelle pour `CraftHttpClient`, `fetch`, les
  timers Craft et les adaptateurs WebSocket/Worker. Les délais d’animation
  changent la vitesse visuelle, pas l’ordre causal ni l’heure à laquelle un
  loader reçoit son résultat.
- Vérifier que l’avancement de la timeline n’achève pas une étape avant la
  résolution des opérations causales attendues. Les branches indépendantes
  peuvent progresser séparément.
- Maintenir les adaptateurs WebSocket et Worker déclarés : faux transport,
  comparaison des messages sortants, injection des messages entrants à leur
  temps virtuel et diagnostic de divergence. Aucun transport non déclaré ne
  doit tomber sur un transport natif.
- Documenter les frontières non couvertes : XHR direct, SDK opaques, APIs
  navigateur non instrumentées et sémantique de transfert non prise en charge.

### Critères de sortie

- Les succès, erreurs et délais enregistrés sont observés au même temps
  virtuel, quelle que soit la vitesse d’animation.
- Les requêtes concurrentes identiques consomment le bon résultat.
- Une réponse absente, une divergence de message ou un transport inconnu bloque
  la branche concernée sans fallback réseau silencieux.
- L’application exécute ses loaders normaux pendant le replay et reçoit les
  réponses enregistrées à la place des résultats live.

## Phase 5 — Orchestration, diagnostics et archives

### Travail

- Construire la timeline à partir des interactions visuelles, des invocations
  racines, des snapshots, des résultats de transport et des changements d’état.
- À chaque étape, attendre les racines requises et leurs descendants avant de
  déclarer la branche terminée ou de comparer son état.
- Lors d’une divergence, afficher l’interaction source, l’adresse de méthode,
  les arguments expurgés, le parent causal, l’état attendu/observé et le
  transport impliqué.
- S’assurer qu’une pause ou un arrêt arrête les horloges et transports, nettoie
  les doubles globaux et empêche les événements de replay de polluer la
  capture de session.
- Incrémenter le format v4 seulement si le contrat d’invocation, de snapshot ou
  de timeline change de façon incompatible. Mettre à jour en même temps le
  validateur, le serveur d’archives, le dashboard, les exemples et les docs.
- Rejeter explicitement les archives tronquées, incomplètes, non sérialisables
  ou d’une version non supportée.

### Critères de sortie

- Les diagnostics identifient précisément la première divergence sans
  transformer un échec en succès apparent.
- Stop, pause, reprise et récupération laissent les transports et l’état du
  replay cohérents.
- Un export valide peut être inspecté même s’il ne peut pas être rejoué ; la
  raison de non-rejouabilité est visible.

## Phase 6 — Vérification bout en bout

### Scénarios requis

1. Un clic visuel invoque une méthode `craftMethod` avec arguments.
2. Une méthode racine appelle une insertion de mutation et une insertion de
   state ; les enfants s’exécutent une seule fois.
3. Une interaction invoque directement une méthode exposée par `queryParams`,
   `query` ou `asyncProcess`.
4. Un formulaire change une valeur : le replay ne redispatche pas `input` ni
   `change`, mais retrouve l’état attendu.
5. Un replay URL restaure local/session storage, cookies, IndexedDB, snapshot
   de primitives et persisters avant les loaders.
6. Un loader HTTP Craft réussit, échoue et attend une latence enregistrée.
7. `fetch` renvoie un résultat JSON, binaire et une erreur, sans réseau live.
8. Plusieurs requêtes HTTP identiques concurrentes sont corrélées sans
   inversion de résultats.
9. Un WebSocket et un Worker déclarés reçoivent leurs messages aux temps
   enregistrés ; messages sortants manquants ou différents produisent une
   divergence.
10. Une méthode absente, une adresse ambiguë, une archive tronquée et une
    réponse non enregistrée arrêtent explicitement le replay.

### Vérification

- Ajouter les tests unitaires au bon seam : sérialisation des arguments,
  registre, construction du graphe d’invocations, snapshots, horloge et
  correspondance des transports.
- Ajouter ou mettre à jour les E2E Chromium pour les scénarios intégrés ci-
  dessus, en vérifiant les compteurs de listeners DOM et l’absence de requêtes
  réseau non enregistrées.
- Lancer les vérifications ciblées du package core, du package component, du
  serveur d’archives et du dashboard, puis les E2E replay.
- Mettre à jour `replay-invocation-prototype.md`,
  `debug-session-websocket-worker-replay.md`, `debug-session-transports.md` et
  le README du dashboard pour qu’ils décrivent le même format, le même flux et
  les mêmes limites.

## Ordre de livraison proposé

1. Contrat d’invocation et capture des arguments des méthodes d’insertion.
2. Orchestration racine/enfant avec preuve d’absence de double invocation.
3. Suppression du redispatch DOM dans tous les chemins de replay actifs.
4. Protocole de snapshot et démarrage avant loaders.
5. Corrélation HTTP concurrente et horloge partagée avec les transports.
6. Diagnostics, E2E complets et harmonisation des documents.

Chaque phase doit laisser le replay dans un état explicitement versionné et
diagnostiquable. Une session qui ne satisfait pas le contrat de sa phase doit
être refusée avant de lancer des effets applicatifs.
