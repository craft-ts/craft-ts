# Plan — rejouer les WebSocket et les Web Worker

Date : 2026-10-19

## Objectif

Étendre le replay déterministe aux communications persistantes et aux messages
asynchrones qui ne passent pas par `CraftHttpClient` ou `fetch`. Le replay doit
réutiliser les messages réellement observés, leur ordre et leur temps virtuel,
sans ouvrir de connexion réseau ni relancer un worker réel.

Les clics, hovers et scrolls associés restent des marqueurs visuels : le replay
ne redispatche pas ces événements DOM. Il appelle les méthodes Craft enregistrées
avec leurs arguments capturés. Quand ces méthodes créent un socket ou un worker,
l’adaptateur de replay simule leur frontière de communication et nourrit
l’application avec les messages enregistrés.

## État actuel

L’implémentation décrite ici est disponible dans le format v5 :

- `CraftHttpClient` enregistre le contexte et le résultat ; le loader s’exécute
  pendant le replay et reçoit le résultat enregistré à son temps virtuel.
- `fetch` direct est capturé/rejoué, y compris les réponses binaires.
- `provideCraftReplayTransports`, `craftWebSocketReplay` et
  `craftWorkerReplay` déclarent les frontières applicatives. Le replay remplace
  les constructeurs natifs par des doubles, compare les messages sortants et
  injecte les messages entrants sur l’horloge virtuelle.
- Les clics, saisies, hovers et scrolls sont des marqueurs de présentation ;
  le dashboard ne redispatche pas ces événements.
- Le dashboard rejette les exports v1–v4 au replay. Le contrat et les limites
  courantes sont documentés dans
  [`debug-session-transports.md`](../debug-session-transports.md) et
  [`replay-invocation-prototype.md`](./replay-invocation-prototype.md).

## Décisions d’architecture

### Un DSL déclaratif, des adaptateurs applicatifs

Fournir un DSL de configuration Craft qui déclare les frontières à instrumenter
et les fonctions de conversion des messages. La définition active est installée
par l’application au démarrage ; l’export de session ne contient que les
identifiants déclarés et les données sérialisées. Il ne contient jamais de code
exécutable ni de fonction fournie par l’export.

Esquisse d’API, à valider pendant la première phase :

```ts
provideCraftReplayTransports(
  craftWebSocketReplay({
    id: 'notifications',
    match: (url) => new URL(url).pathname === '/api/notifications',
    serialize: serializeNotificationFrame,
    redact: redactNotificationFrame,
  }),
  craftWorkerReplay({
    id: 'search-index',
    match: (url) =>
      new URL(url, location.href).pathname.endsWith('/search.worker.js'),
    serialize: serializeSearchMessage,
    redact: redactSearchMessage,
  }),
);
```

Le DSL doit rester déclaratif pour l’identité et les options de transport, avec
des fonctions d’encodage/d’expurgation exécutées uniquement dans l’application
enregistrée. Il ne doit pas prétendre transformer n’importe quel SDK opaque en
transport déterministe sans que l’application fournisse un adaptateur.

### Contrat de session

Ajouter un événement de transport spécialisé (ou des événements `custom`
versionnés) qui porte au minimum :

- `transportId` stable, déclaré dans le DSL ;
- `connectionId`/`workerId` pour distinguer plusieurs instances ;
- direction (`outgoing` ou `incoming`) et type de message ;
- numéro de séquence local à l’instance ;
- heure monotone de l’événement ;
- contenu sérialisé et déjà expurgé, ou une raison explicite indiquant pourquoi
  il ne peut pas être rejoué ;
- métadonnées de cycle de vie nécessaires (open/close/error pour un socket,
  création/termination/erreur pour un worker).

Le contrôleur regroupe les messages par instance et les aligne avec les appels
Craft et interactions qui les ont causés via les corrélations existantes. Les
événements entre instances restent indépendants si aucune causalité fiable n’est
disponible ; ne pas inventer un ordre global à partir du seul ordre d’arrivée.

Toute évolution de schéma est validée avant replay : identifiants, séquences,
direction, horodatages, taille et codec doivent être valides. Incrémenter la
version du format lors de l’introduction du contrat et rejeter les exports v1–v4
dans le replay, sans tenter de migration implicite. Le contrat courant est v5.

## Comportement WebSocket visé

### Capture

- Instrumenter uniquement les sockets reconnues par un adaptateur déclaré.
- Enregistrer l’URL expurgée, les options utiles, les transitions de cycle de
  vie, les messages envoyés/reçus et leur ordre/temps.
- Prendre en charge explicitement les frames texte et binaires avec codecs
  déclarés ; borner leur taille et signaler les frames non sérialisables.
- Enregistrer le résultat du `close` (code, raison expurgée, propreté) et les
  erreurs observables, sans capturer de secrets des headers/protocoles.

### Replay

- Créer une implémentation simulée compatible avec la surface utilisée par
  l’application (`readyState`, événements, `send`, `close`, `addEventListener`,
  `onmessage`, etc.). Elle ne crée jamais de WebSocket natif.
- À `send`, comparer le message produit à la prochaine frame sortante attendue.
  Une divergence devient un écart de replay ; le message n’est jamais transmis
  au serveur réel.
- Émettre les frames entrantes enregistrées au temps virtuel indiqué, avec les
  transitions `open`/`close`/`error` correspondantes.
- Si l’application crée le socket plus tard que prévu, retenir les événements
  entrants déjà dus jusqu’à ce que son instance simulée soit prête, sans les
  déplacer dans le temps observé par l’application.
- Maintenir des curseurs séparés par `connectionId` pour prendre en charge
  plusieurs sockets concurrents.

## Comportement Web Worker visé

### Capture

- Instrumenter les workers reconnus par un adaptateur déclaré, y compris le
  type (`classic`/`module`) et l’identité de script sans URL secrète.
- Enregistrer la création, les messages `postMessage` dans les deux directions,
  les transferts sérialisables, `error`/`messageerror` et `terminate`.
- Utiliser le codec déclaré pour les objets applicatifs et les données binaires.
  Les objets non transférables/non sérialisables sont marqués non rejouables.

### Replay

- Fournir un faux worker à l’application : aucun thread ou script worker réel
  n’est démarré.
- Comparer les messages envoyés au worker à la séquence attendue ; émettre les
  messages worker-vers-page capturés à leur temps virtuel.
- Conserver les sémantiques visibles nécessaires (`onmessage`, écouteurs,
  `postMessage`, `terminate`, `onerror`) et signaler clairement les API non
  couvertes, notamment les transferts dont la sémantique de détachement est
  requise.
- Donner à chaque instance son curseur et son cycle de vie propres, sans
  confondre plusieurs workers de même script.

## Orchestration et divergences

L’orchestrateur doit attendre les opérations nécessaires avant d’avancer au
prochain pas causal. Pour chaque instance, il suit séparément : création,
messages sortants attendus, messages entrants à émettre et fermeture. Les
appels Craft parent/enfant utilisent les corrélations existantes ; les branches
indépendantes peuvent progresser en parallèle.

Une frame sortante absente, supplémentaire, mal ordonnée ou différente suspend
le replay à cette frontière et expose l’attendu, l’observé, l’instance et
l’événement correspondant. Une frame entrante manquante dans l’export, un codec
inconnu ou une instance non résolue rend le transport non rejouable et doit être
signalé avant ou pendant le pas concerné. Aucun écart ne doit déclencher un
fallback réseau silencieux.

L’heure enregistrée décrit le temps entre étapes dans la session ; la vitesse de
lecture affecte seulement l’animation du replay. Les réponses/messages attendus
restent pilotés par le temps virtuel, pas par des temporisateurs réels arbitraires.

## Phases d’implémentation

### Phase 1 — Contrat commun et DSL

1. Examiner l’orchestrateur, le contexte de corrélation, les codecs de session,
   la rédaction et les limites de taille existantes.
2. Définir l’interface d’adaptateur, les événements/version, les règles de
   sérialisation et les écarts normalisés, sans implémenter deux mécanismes
   distincts d’horloge ou de validation.
3. Ajouter l’enregistrement des adaptateurs dans le runtime cible et le
   branchement avec la session active/replay active.
4. Définir l’arrêt/nettoyage des intercepteurs, des instances simulées et des
   curseurs à l’arrêt ou à l’échec du replay.

### Phase 2 — Adaptateur WebSocket

1. Capturer les cycles de vie et frames d’un socket de test déclaré.
2. Implémenter la simulation, l’horloge virtuelle et la comparaison des frames.
3. Tester plusieurs sockets, frames binaires, fermeture, erreur, retard de
   connexion, frame inattendue, donnée trop volumineuse et absence de fallback
   réseau.
4. Ajouter un E2E qui enregistre une interaction déclenchant le socket, puis
   vérifie que le clic reste visuel, que la méthode Craft est invoquée, que le
   faux socket émet les réponses capturées et qu’aucun serveur live n’est
   contacté.

### Phase 3 — Adaptateur Web Worker

1. Capturer les messages et cycles de vie d’un worker reconnu.
2. Implémenter le faux worker et le contrôle des messages dans les deux sens.
3. Tester les workers multiples, les codecs, les données binaires,
   `terminate`, erreurs, transferts non pris en charge et divergences d’ordre.
4. Ajouter un E2E comparable au cas WebSocket, avec une assertion qu’aucun vrai
   worker n’est instancié pendant le replay.

### Phase 4 — Intégration, diagnostic et documentation

1. Ajouter les divergences transport au panneau replay et aux diagnostics
   exportés (transport, instance, direction, séquence, attendu/observé).
2. Vérifier que la rétention/troncature de session couvre aussi les gros
   payloads binaires et qu’un export tronqué reste explicitement non rejouable.
3. Documenter comment déclarer un adaptateur, les codecs disponibles et les
   limites propres à chaque transport.
4. Lancer les tests unitaires des codecs/adaptateurs/orchestrateur et les E2E
   Chromium des scénarios WebSocket et Worker, ainsi que les suites de replay
   existantes.

## Critères d’acceptation

- Un replay n’ouvre jamais de connexion WebSocket réelle et ne démarre jamais
  de Web Worker réel pour une frontière déclarée.
- Les messages sortants sont vérifiés contre la session ; les messages entrants
  sont injectés au bon temps virtuel et dans le bon ordre par instance.
- Les clics/scrolls/hovers montrés dans le replay ne redispatchent aucun
  événement DOM applicatif ; l’appel Craft enregistré et l’adaptateur simulent
  leurs effets.
- Une divergence est visible et bloque l’avancement de cette branche sans
  empêcher les branches indépendantes de progresser.
- Données sensibles, payloads trop grands, formats binaires non gérés et
  transports non déclarés sont expurgés ou déclarés non rejouables ; aucun
  fallback vers le réseau/worker live n’est possible en replay.
- Les tests unitaires et E2E couvrent les chemins nominaux et les écarts décrits
  ci-dessus.

## Hors périmètre

- Intercepter ou rendre déterministe un SDK opaque sans adaptateur fourni par
  l’application.
- Rejouer le code du serveur WebSocket ou le calcul interne du Web Worker : le
  replay vérifie les sorties émises par la page et injecte les entrées capturées.
- Garantir le comportement de toute API navigateur non déclarée par un
  adaptateur.
