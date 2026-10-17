# Plan — fiabiliser l’enregistrement des sessions

## Objectif

Permettre à une session de rester récupérable quand la connexion entre la page
capturée et l’archive est lente, intermittente ou temporairement coupée. La
capture ne doit pas attendre le réseau et ne doit pas ralentir les actions de
l’application. Une fin de session ne doit être déclarée complète que lorsque
le serveur peut vérifier que toutes les séquences attendues ont été reçues.

Ce plan vise d’abord l’archive locale actuelle (`127.0.0.1`), puis doit rester
compatible avec un éventuel transport distant. La connexion Internet de
l’utilisateur n’intervient pas dans l’écriture locale actuelle ; elle
n’interviendra que si l’application observée fait elle-même des appels distants
ou si l’archive devient distante.

## Décisions produit

- **Aucun indicateur de capture ou d’état réseau n’est affiché dans
  l’application observée par défaut.** L’utilisateur final ne voit pas de
  badge, toast ou message de déconnexion.
- Le diagnostic visible est optionnel et destiné au développeur qui configure
  explicitement la capture. Il est désactivé par défaut et ne doit pas être
  activé implicitement par la démo ou un preset de production.
- Les détails de transmission et de complétude restent consultables dans le
  dashboard local et dans l’archive, même si l’indicateur dans la page capturée
  est désactivé.
- Le message de fermeture est un **manifeste de complétude**, pas une
  retransmission de la session. Il ne contient aucun payload d’événement.
- Le système ne conclut pas que « l’utilisateur a une connexion Internet
  instable ». Il peut seulement conclure que **la transmission vers l’archive
  a été interrompue ou retardée**. La page peut être connectée à Internet tout
  en perdant l’accès au serveur local, ou l’inverse.
- Un manifeste de fermeture envoyé par `sendBeacon`/`keepalive` est au mieux
  effort : son acceptation par le navigateur ne prouve pas sa réception par le
  serveur.

## État actuel et limites observées

- [`debug-session-persistence.ts`](../../libs/component/src/lib/ai/debug-session-persistence.ts)
  envoie les événements par WebSocket et réessaie la connexion après une
  coupure. À la reconnexion, il renvoie l’historique encore conservé dans la
  mémoire de la page ; le serveur déduplique les séquences déjà présentes.
- `send()` ignore silencieusement un message quand le WebSocket n’est pas
  ouvert. Les accusés `session:event-saved` et `session:events-saved` sont
  actuellement émis par le serveur, mais le client ne les utilise pas pour
  maintenir un point de reprise acquitté.
- Il n’existe pas de boîte d’envoi durable côté navigateur. Une fermeture ou
  un crash de page avant la reconnexion détruit les événements qui n’ont pas
  encore atteint l’archive.
- La fin (`session:finish` ou le keepalive HTTP) marque le participant comme
  terminé sans transmettre la dernière séquence attendue ni vérifier la
  continuité. « Terminé » ne garantit donc pas « complet ».
- Le serveur ([`debug-session-store.ts`](../../apps/log-server/src/debug-session-store.ts))
  déduplique `(participantId, participantSequence)` et écrit les événements
  dans un fichier JSONL append-only. Il ne maintient pas de manifeste de trous
  de séquence par participant. L’index est écrit avec un remplacement
  temporaire, tandis que les événements sont relus au redémarrage ; une ligne
  JSONL finale partiellement écrite est ignorée.
- Le serveur attribue un ordre global à l’arrivée. Si des événements anciens
  sont réémis après des événements récents déjà archivés, l’ordre global peut
  différer de l’ordre temporel d’origine. La séquence locale du participant
  permet de détecter et corriger ce cas pour une page, mais pas encore de
  reconstruire avec certitude l’ordre entre plusieurs pages.

## Modèle cible

### File locale durable

Créer une boîte d’envoi IndexedDB par origine/session/participant :

- Chaque événement capturé est ajouté à la file avec son identifiant, sa
  séquence locale, son temps monotone (`elapsedMs`) et son payload déjà
  expurgé. La sauvegarde locale ne doit pas sérialiser/reconstruire tout
  l’historique à chaque événement.
- La transmission WebSocket lit la file par lots, dans l’ordre, avec une
  taille et une fréquence bornées.
- Le serveur confirme un watermark contigu (`acknowledgedThrough`) et, si
  nécessaire, les plages manquantes. Le client supprime de la file uniquement
  les événements confirmés.
- Après reconnexion ou rechargement, le client reprend depuis le premier
  événement non acquitté. Les renvois restent idempotents avec la clé déjà
  utilisée par le serveur.
- La page ne bloque jamais une interaction utilisateur en attendant IndexedDB
  ou le réseau. Les erreurs de quota, de transaction ou d’accès à IndexedDB
  deviennent un état de complétude détectable.

### Manifeste léger de fin

À `pagehide`, tenter d’envoyer un petit manifeste HTTP `sendBeacon` (avec
fallback `fetch(..., { keepalive: true })`) contenant seulement :

- identifiant de session et de participant ;
- dernière séquence créée par la page (`lastProducedSequence`) ;
- dernier watermark acquitté connu (`acknowledgedThrough`) ;
- présence ou absence d’une erreur locale de stockage/transmission ;
- nombre ou plage de séquences en attente, si disponible ;
- version du protocole et horodatage monotone/UTC utiles au diagnostic.

Le manifeste ne contient ni événement, ni valeur de champ, ni URL détaillée.
Le serveur compare la dernière séquence attendue aux séquences réellement
présentes et inscrit l’état résultant. Un manifeste absent ne vaut pas preuve de
complétude. S’il y a des séquences manquantes, la session est conservée comme
incomplète/récupérable, et non marquée simplement « terminée ».

Ce manifeste n’est **pas** un mécanisme de récupération des événements. Il
permet de diagnostiquer une perte et de ne pas la masquer. La récupération vient
de la boîte durable et de la synchronisation au prochain démarrage de
l’application ou à la reconnexion.

### États et visibilité

Séparer au minimum :

- **état du participant** : enregistrement, fermé, interrompu ;
- **état de livraison** : à jour, en attente, en reprise, erreur ;
- **complétude** : complète, incomplète avec plages manquantes, inconnue.

Par défaut, ces états sont enregistrés et visibles dans le dashboard local,
mais n’apparaissent pas dans l’application observée. Une option explicite de
diagnostic peut les afficher dans une intégration de développement. Le texte
utilisé parle de « connexion à l’archive » ou de « synchronisation de la
capture », jamais de la qualité générale de la connexion Internet de
l’utilisateur.

## Phases de mise en œuvre

### Phase 1 — Détecter les pertes sans changer le transport

1. Suivre côté client `lastProducedSequence` et un watermark acquitté.
2. Utiliser les accusés existants pour avancer le watermark ; ajouter les
   accusés manquants pour les lots avec leur plage de séquences.
3. À la réception, le serveur calcule les séquences absentes par participant
   et refuse de déclarer la session complète si le watermark final n’est pas
   satisfait.
4. Étendre l’export et l’interface du dashboard avec la complétude et les
   plages manquantes. Les événements reçus restent inspectables et un replay
   partiel reste possible avec un avertissement explicite.
5. Ajouter le manifeste final minimal, sans payload métier.

### Phase 2 — Ajouter la boîte d’envoi IndexedDB

1. Définir une clé de stockage/version de schéma, une politique de quota et la
   migration des entrées en attente.
2. Persister les événements en arrière-plan, par transaction et sans recopier
   l’historique entier.
3. Reprendre la livraison depuis le premier événement non acquitté ; conserver
   l’ordre local et dédupliquer côté serveur.
4. Récupérer une file après rechargement et rejoindre la session partagée
   existante sans créer de doublons.
5. Traiter explicitement quota dépassé, stockage refusé, événement trop gros,
   corruption de file et fermeture avant validation d’une transaction.

### Phase 3 — Stabiliser le transport et le replay multi-onglet

1. Appliquer des tentatives de reconnexion avec délai progressif et jitter,
   sans supposer que `navigator.onLine` décrit correctement l’accès au serveur.
2. Borner les lots, le nombre d’événements en vol et la pression mémoire ;
   compresser les lots si la mesure montre un gain sans bloquer le thread UI.
3. Ordonner les événements par séquence de participant, puis fusionner les
   participants selon leurs horodatages monotones ancrés à une origine de
   session connue. Exposer une incertitude d’ordre quand les horloges ne sont
   pas comparables.
4. Distinguer une session terminée mais incomplète d’une session réellement
   interrompue ; permettre de reprendre l’envoi des files encore disponibles.

### Phase 4 — Diagnostic optionnel

1. Ajouter un paramètre explicite, désactivé par défaut, pour afficher un
   diagnostic à l’intégrateur en environnement de développement.
2. Garder le détail des erreurs de stockage et de transmission dans le
   dashboard local ; ne pas afficher automatiquement d’alerte dans la page
   capturée.
3. Vérifier que les libellés n’impliquent pas une observation ou une panne
   Internet générale lorsque seul le lien vers l’archive est en cause.

## Stratégie de test

### Tests unitaires et serveur

- Le watermark n’avance jamais au-delà d’un accusé reçu.
- Un accusé de lot couvre précisément sa plage ; doublons réémis sans doublon
  d’archive.
- Un trou de séquence est détecté même si les séquences suivantes arrivent.
- Un manifeste final sans trou donne « complète » ; un watermark inférieur à
  `lastProducedSequence` donne « incomplète » ; un manifeste absent donne
  « inconnue/interrompue », jamais une complétude supposée.
- Un message de fin minimal ne modifie pas les événements ni leurs données.
- Redémarrage du serveur : reconstruction du watermark et des trous depuis le
  JSONL ; ligne finale invalide signalée comme dégradation, sans perdre les
  lignes précédentes.
- L’index de session conserve la complétude, les erreurs de stockage et les
  plages manquantes.

### E2E avec réseau contrôlé

- Connexion lente, coupure avant envoi, coupure après envoi mais avant accusé,
  reconnexion et renvoi idempotent.
- Page rechargée/fermée pendant une coupure : récupération de la file IndexedDB
  à la prochaine ouverture et fin correctement qualifiée.
- Arrêt serveur, redémarrage, disque inaccessible simulé, quota IndexedDB
  atteint/refusé, stockage navigateur désactivé.
- Plusieurs onglets : files séparées, session partagée, participant inactif,
  fermeture d’un participant et récupération sans mélanger les séquences.
- Une action asynchrone garde son temps d’origine malgré une arrivée tardive
  au serveur ; le délai réseau ne devient pas un délai de replay.
- Vérifier que l’interface de l’application observée reste silencieuse par
  défaut ; l’option de diagnostic n’affiche l’état que lorsqu’elle est activée.
- Injecter un événement manquant ayant un effet sur l’état : le replay doit
  être marqué partiel et ne doit pas prétendre être fidèle.

## Critères d’acceptation

- Une coupure temporaire n’entraîne aucune perte si l’événement est durablement
  mis en file et que le navigateur retrouve ensuite le serveur.
- Une perte définitive est toujours détectée ou explicitement marquée comme
  inconnue ; elle n’est jamais présentée comme une session complète.
- Un utilisateur peut effectuer son parcours sans attendre le réseau de
  l’archive.
- La page observée n’affiche aucun indicateur par défaut.
- Le manifeste de fermeture est petit, expurgé et traité comme best-effort ;
  la robustesse ne dépend pas de sa livraison.
- Une session incomplète reste consultable ; le replay partiel indique où se
  trouve le trou et ne fabrique pas d’action pour le combler.

## Hors périmètre de cette première évolution

- Estimer la qualité globale de la connexion Internet de l’utilisateur.
- Récupérer un événement jamais capturé ou une file locale effacée avec les
  données du navigateur.
- Garantir une durabilité matérielle absolue en cas de panne disque ou de
  coupure électrique ; cela demanderait une stratégie d’écriture et de
  sauvegarde adaptée à la plateforme.
- Envoyer par défaut les archives vers un service distant ou activer une
  télémétrie réseau.
