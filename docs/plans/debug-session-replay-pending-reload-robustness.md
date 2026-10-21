# Plan — fiabiliser le replay des états pending, des activations différées et des reloads

Date : 2026-10-20

## But de cette passation

Ce document donne le contexte nécessaire pour continuer l’investigation et mettre en place les corrections dans une autre conversation. Il concerne les problèmes observés pendant le replay de la session ci-dessous, en particulier les diagnostics `defer`, les chargements de route, les états pending et le rechargement/navigation.

- Session : `801fb480-a27a-48ca-b44b-851f04b0c1c4`
- URL du dashboard : `http://localhost:4210/#/sessions/801fb480-a27a-48ca-b44b-851f04b0c1c4`
- Archive disponible pendant l’investigation : `http://127.0.0.1:4319/sessions/801fb480-a27a-48ca-b44b-851f04b0c1c4`
- Projet : `ng-craft`

Le replay a fini par atteindre **328/328 étapes · terminé**, sans différence d’état détectée, et l’application était rendue sur `/query/1`. Le problème restant n’était donc pas un arrêt complet du replay : il s’agissait de diagnostics trompeurs, de transitions de présentation non vérifiées et de certaines associations d’événements qui ne sont pas suffisamment fiables.

## État du dépôt et travail déjà effectué

### Correction déjà présente

Dans `libs/component/src/lib/ai/debug-session-replay.ts`, le validateur accepte maintenant `routePath: ''`, valeur légitime pour la route racine, émise par le runtime. Il donne aussi des diagnostics distincts pour le payload, la phase, le chemin, l’URL, l’identifiant d’opération et l’issue d’un chargement de route.

Dans `libs/component/src/lib/ai/debug-session-replay.spec.ts`, deux cas couvrent l’acceptation du chemin vide de la route racine et un diagnostic précis quand `routePath` a un type invalide.

La session échouait initialement à l’événement 2 avec `Route load event 2 has invalid route identity or outcome.` Cette validation rejetait le chemin vide alors que la capture le produisait pour la racine. Avec une copie diagnostique de l’archive où ce chemin était normalisé, les 874 événements passaient la validation. La correction du validateur traite donc un défaut réel de compatibilité capture/lecture.

### Modifications locales à préserver

Au moment de rédiger cette passation, `git status` contient aussi des modifications locales dans :

- `apps/debug-session-dashboard/src/replay-labels.ts`
- `apps/debug-session-dashboard/src/replay-model.ts`
- `apps/debug-session-dashboard/src/replay-stage.ts`
- `apps/debug-session-dashboard/src/replay-state.ts`

Elles ajoutent un indicateur de progression selon le temps enregistré. Elles ne font pas partie du plan pending/reload. Les laisser intactes et ne pas remplacer ou réinitialiser ces changements.

Les modifications de validation et de spécification citées plus haut sont également locales. Il existe aussi dans la version locale de `debug-session-replay.ts` un cast `payload['selector'] as string` autour de `waitForReplayTarget`; préserver ce changement préexistant, sauf preuve qu’il est incompatible avec le travail.

Les tests déjà ajoutés n’ont pas été exécutés dans l’investigation précédente.

## Observations de la session

### 1. Activation différée : avertissement probablement faux

La session contient deux interactions `loadDeferred` :

- clic à la séquence 182, suivi de `defer.started` à 183 et de la fin à 186 ;
- clic à la séquence 409, suivi de `defer.started` à 410 et de la fin à 411.

La fonction de contrôle `deferredActivationRecorded` dans `libs/component/src/lib/ai/debug-session-replay.ts` exige actuellement que l’activation se trouve strictement avant `followingInteraction`. Or le replay traite lui-même `defer.started` comme une étape rejouable. Si cet événement est exactement l’interaction suivante, la condition `candidate.sequence < followingInteraction.sequence` le rejette. Cela explique le message observé :

> Aucun appel Craft ni activation différée enregistrés après le clic `componentDemo:button:loadDeferred:click`.

À corriger en déterminant clairement la frontière de l’intervalle : une activation `defer.started` directement associée au clic doit être incluse, sans absorber une activation appartenant à l’interaction suivante. Ajouter des cas où le defer est l’étape suivante, où une autre interaction s’intercale et où il n’y a réellement aucune activation.

### 2. Chargements de route : succès observé, démarrage annoncé absent

Le journal du replay a signalé que les chargements `i18n`, `pending-node` et `query/:userId` avaient démarré dans l’enregistrement mais n’étaient pas observés au replay. Pourtant, les routes correspondantes se sont chargées et le replay a terminé.

La capture `craft-route-load-error.ts` émet les phases `started`, `succeeded` et `failed`, avec un `operationId`, un `routePath` et une `targetUrl`. Le récepteur de replay dans `debug-session-replay.ts` observe les événements marqués replay et les compare notamment par `routePath`. La session contient les phases de succès; le diagnostic « démarrage non observé » indique donc une différence de capture/observation ou d’appariement, pas une preuve que la navigation a échoué. La cause précise n’a pas été établie avec certitude.

Amélioration visée : apparier les phases par `operationId` et route, valider les invariants de phase, puis ne rapporter que les phases effectivement manquantes. Le diagnostic devrait afficher l’opération et préciser si le chargement a finalement réussi ou échoué.

### 3. Pending node : cycle async capturé, transition visuelle absente

Dans `pending-node-demo.ts`, le loader `users` attend environ 900 ms, la méthode de reload appelle `users.call`, et l’interface utilise `pendingNode` pour afficher « Loading teams… » pendant l’attente.

Dans cette session :

- le chargement de la route `pending-node` commence vers 27,150 s et réussit vers 27,220 s ;
- `query:users` commence vers 27,234 s et se termine vers 28,139 s ;
- le clic Reload se produit vers 28,543 s ;
- l’appel `method:reload` suit vers 28,545 s ;
- la requête se termine vers 29,453 s, soit environ 908 ms après son départ.

Le travail async et son délai sont donc bien représentés. En revanche, aucun événement dédié ne prouve que l’état pending a été rendu/visible, ni quand il a cessé de l’être. Le replay peut terminer correctement tout en ne reproduisant pas cette partie de l’expérience utilisateur.

Amélioration visée : décider si le contrat doit enregistrer les transitions de pending (`pending=true/false`) ou si le replay peut les vérifier par une assertion d’état/rendu. Éviter de capturer chaque frame ou chaque changement intermédiaire sans nécessité. Capturer des transitions bornées et sémantiques, liées à l’opération async, est préférable.

### 4. Identifiants de corrélation des clics : indices de valeur périmée

Plusieurs événements DOM ont un `correlationId` qui semble provenir de l’interaction précédente :

- le clic `loadDeferred` séq. 182 porte un identifiant associé au clic `addUser` ; `defer.started` séq. 183, lui, correspond au clic `loadDeferred` ;
- le clic `loadDeferred` séq. 409 semble porter l’identifiant du lien de navigation précédent ; `defer.started` séq. 410 porte celui de `loadDeferred` ;
- le clic Reload séq. 617 porte un identifiant `App:a:navLink:click`, tandis que les invocations de reload portent un identifiant `pendingNodeDemo:button:reload:click:...`.

Il faut d’abord trouver où le contexte est attribué, propagé et réinitialisé : le bug peut venir d’un contexte asynchrone conservé trop longtemps, d’un ordre de capture incorrect ou d’un identifiant DOM calculé à partir du mauvais événement. Ne pas supposer une cause précise avant d’avoir suivi le code de capture jusqu’aux événements de cette session.

### 5. Fenêtre d’invocation du clic Reload : appels possiblement mélangés

Le replay choisit les invocations racines à partir d’événements Craft compris entre l’interaction courante et l’interaction rejouable suivante. Cette logique se trouve autour de `rootReplayInvocationEvents` et de la construction des intervalles dans `debug-session-replay.ts`.

Après le clic Reload séq. 617 et avant la prochaine interaction rejouable (pointerdown séq. 670), l’archive contient aussi `method:addUser` et `method:remove` (séq. 647–658). Leurs `correlationId` semblent encore liés au clic Reload. Il n’y a pas de chargement de la route racine correspondant à une navigation root à ce moment-là. Cela rend l’attribution ambiguë : le replay linéaire a tout de même terminé avec zéro différence d’état, mais la trace ne suffit pas à conclure que ces appels ont réellement été causés par Reload.

Examiner si ces événements viennent d’une action navigateur non capturée, d’un contexte de corrélation qui fuit, ou d’une autre frontière manquante. Ne pas les classer comme causalement liés à Reload sans élément supplémentaire.

### 6. Cibles Craft absentes : perte de fidélité visuelle

Le journal contenait un avertissement de cible Craft manquante pour une interaction et un hover. Le replay a utilisé les coordonnées enregistrées. Cela réduit la fidélité du repère visuel; ce n’est pas en soi la preuve que l’invocation applicative a échoué. Préserver cette distinction dans les diagnostics.

### 7. Limites de télémétrie

Les logs disponibles via le serveur local couvraient une période antérieure à cette session et ne permettaient pas d’expliquer ces événements. Les constats ci-dessus viennent de l’archive de la session et du journal de replay. Ne pas présenter les logs du serveur comme une preuve pour cette session.

## Décision de conception sur la causalité

L’utilisateur a relevé qu’une trace ordonnée et déterministe peut suffire pour un replay linéaire. C’est juste : un identifiant causal universel ne rend pas la trace plus déterministe par lui-même et n’est pas une condition préalable au replay séquentiel.

Le replay actuel utilise toutefois les bornes entre interactions pour choisir les appels Craft qui appartiennent à chacune. Les opérations async peuvent se chevaucher; une simple fenêtre temporelle peut alors attribuer un appel à la mauvaise interaction. L’ordre total indique **quand** les événements sont arrivés; une causalité explicite aide à répondre à **quelle interaction** les a déclenchés.

Décision pour le plan :

1. Corriger d’abord l’attribution/capture des `correlationId` existants et les bornes de regroupement. C’est le défaut directement observé.
2. Ajouter une propagation explicite de contexte d’interaction aux appels asynchrones seulement si les cas concurrents restent ambigus après la correction, ou si le replay doit supporter seek/reprise/branches parallèles.
3. Garder le replay strictement séquentiel déterministe quand la trace permet de le faire. Pour une ancienne session réellement ambiguë, signaler la branche comme partielle au lieu de lancer une invocation incertaine.

## Mise en place

Le replay reconnaît maintenant un `defer.started` qui est exactement l’étape
rejouable suivant le clic. Les clics et le hook de corrélation partagent un ID
stocké sur l’événement DOM, et une invocation Craft/HTTP dont l’ID diffère ou
manque n’est pas attribuée au clic; le replay émet un avertissement pour ces
appels. Les opérations de route sont appariées par leur ID observé dans le
replay, puis par phase et chemin, avec un diagnostic qui nomme l’opération et
son issue attendue. Les `pendingNode` enregistrent des transitions bornées par
opération et source, avec un indicateur de rendu du fallback, sans valeur
métier. Un appel `BrowserLocationService.reload` est traité comme une frontière
de session et n’est pas exécuté; une cible Craft venant d’un autre runtime
arrête aussi la branche avec un diagnostic explicite.

La propagation d’ID dans des callbacks asynchrones déjà lancés n’a pas été
étendue : ce travail exige un cas concurrent démontrant où le contexte est
perdu. Le retour/avance navigateur n’a pas de déclencheur de replay dédié.
L’archive de session citée ci-dessus n’a pas pu être rejouée dans cette
exécution, car le serveur local `127.0.0.1:4319` n’était pas démarré. Les
régressions unitaires ciblées couvrent les comportements ajoutés; le replay de
cette archive reste à effectuer dans son environnement d’origine.

## Plan d’implémentation priorisé

### Étape 1 — Corriger l’avertissement defer

- Réviser `deferredActivationRecorded` et sa relation à `followingInteraction`.
- Formaliser l’inclusion/exclusion des bornes de l’intervalle, plutôt que de corriger seulement la chaîne du message.
- Ajouter les régressions : defer juste après le clic, defer plus tard avant l’interaction suivante, defer après l’interaction suivante, activation manquante.
- Résultat attendu : les deux clics `loadDeferred` de cette session ne produisent plus de faux avertissement.

### Étape 2 — Diagnostiquer et réparer la propagation des corrélations

- Tracer la création d’un ID de clic, son affectation à l’événement DOM et sa propagation aux invocations Craft, navigations et callbacks async.
- Définir la durée de vie du contexte : création au début de l’interaction, propagation explicite aux tâches async causées, puis fermeture; aucun contexte d’interaction ne doit être réutilisé par le prochain clic.
- Vérifier les cas clics rapides/consécutifs, deux appels async concurrents et callback après navigation.
- Rejeter ou marquer explicitement les événements sans attribution fiable; ne pas réutiliser silencieusement le dernier ID connu.
- Ajouter un test de contrat sur le pipeline capture qui vérifie qu’un clic, son invocation et son activation différée ont le même ID attendu, et que le clic suivant en obtient un autre.

### Étape 3 — Fermer correctement les groupes d’invocation

- Documenter la règle exacte qui définit une invocation racine et sa fenêtre.
- Vérifier qu’une interaction suivante ferme bien la fenêtre, sans inclure les appels qui lui appartiennent.
- Utiliser les IDs fiables existants pour attribuer les appels quand ils sont présents; garder la séquence comme ordre de lecture.
- Lorsqu’un groupe contient des appels contradictoires ou sans attribution fiable, produire un diagnostic d’ambiguïté et marquer la branche partielle plutôt que rejouer des commandes incertaines.
- N’introduire des IDs causaux supplémentaires qu’en résultat de cette analyse, et uniquement aux frontières où le contexte est réellement perdu.

### Étape 4 — Ajouter une observation sémantique des états pending

- Inventorier les sources de pending utilisées par `pendingNode` et les primitives async pertinentes.
- Choisir un événement de transition borné par opération, par exemple `pending.started` et `pending.settled`, avec l’identité de l’opération, l’adresse du nœud et le temps monotone.
- Ne pas enregistrer les valeurs métier ni chaque frame de rendu.
- À la lecture, comparer transition attendue et observée; distinguer un appel async correct d’un état pending non rendu ou rendu trop tard.
- Ajouter un cas avec la latence de 900 ms de `pending-node-demo.ts`, ainsi que résolution immédiate et erreur.

### Étape 5 — Renforcer l’observation des routes et reloads navigateur

- Examiner les événements `route-load` émis pendant la capture et le replay; apparier `started`/`succeeded`/`failed` par `operationId`, route et phase.
- Ajouter des diagnostics cohérents pour chaque opération : démarrée, terminée, échouée, ou phase manquante. Éviter l’avertissement générique « started non observé » quand le résultat correspondant est visible.
- Inventorier les frontières navigateur réellement nécessaires : navigation Angular, `popstate`/back-forward, reload document, `pagehide`/`pageshow` et réinitialisation du runtime. Ne capturer que les transitions prises en charge et utiles au contrat du replay.
- Déterminer si un reload complet est un point de reprise, une nouvelle session, ou une frontière non rejouable. Le contrat doit être explicite; ne pas simuler un reload en rejouant des invocations d’intervalle.
- Ajouter une régression pour retour navigateur et reload, avec absence de double exécution au redémarrage.

### Étape 6 — Relancer la session et mesurer le résultat

- Rejouer l’archive `801fb480-a27a-48ca-b44b-851f04b0c1c4` dans les mêmes conditions que l’investigation précédente.
- Vérifier les deux activations différées, le cycle pending/reload, les phases de route, les corrélations autour de séq. 617–670 et l’état final.
- Résultat visé : zéro faux avertissement; chaque divergence restante indique l’événement/opération concerné et la branche impactée; aucune invocation ambiguë n’est rejouée silencieusement.
- Ajouter des cas de régression ciblés aux suites existantes. Exécuter les validations prévues par le dépôt après les changements. Les tests de la correction de route racine déjà présents n’avaient pas encore été exécutés à la fin de l’investigation précédente.

## Fichiers et zones de code à examiner

- `libs/component/src/lib/ai/debug-session-replay.ts`
  - validation des événements `route-load` ;
  - intervalle `followingInteraction` ;
  - avertissement `deferredActivationRecorded` ;
  - sélection `rootReplayInvocationEvents` ;
  - `isReplayStep` ;
  - observation des événements de route pendant le replay.
- `libs/component/src/lib/ai/debug-session-replay.spec.ts`
  - tests du format et du contrôleur de replay ;
  - inclut déjà les tests ajoutés pour la route racine vide et le diagnostic de chemin invalide.
- `libs/core/src/lib/craft-route-load-error.ts`
  - capture des phases de chargement de route et du flag de replay.
- `libs/core/src/lib/send-context-to-ai.tokens.ts`
  - capture des événements et identités/sélecteurs de cibles si nécessaire.
- `pending-node-demo.ts` (chercher son emplacement avec `rg --files`)
  - exemple du loader `craftSleep(900)`, méthode reload et rendu `pendingNode`.
- Documentation existante à lire avant de changer le contrat :
  - `docs/plans/debug-session-replay-deterministe.md` ;
  - `docs/plans/debug-session-craft-target-identity.md` ;
  - `docs/debug-session-replay-scenario.md`.

## Garde-fous de conception

- Une interaction DOM observée n’est pas redispatchée vers l’application. Les commandes applicatives rejouées sont les invocations Craft.
- L’ordre temporel de la trace reste l’autorité sur l’ordre du replay. L’association causale sert à grouper/diagnostiquer les appels, pas à remplacer la séquence.
- Ne pas ajouter une propagation globale d’identifiants par anticipation. Prouver avec un cas async concurrent qu’elle résout une ambiguïté réelle.
- Ne pas confondre absence d’un repère DOM, absence de transition visuelle, absence d’invocation et échec de navigation : ce sont quatre diagnostics distincts.
- Ne jamais déclencher un appel applicatif approximatif pour compenser une archive ambiguë. Signaler un replay partiel avec l’événement manquant.
- Incrémenter la version d’archive uniquement si le contrat enregistré change de manière incompatible; mettre à jour simultanément capture, validation, dashboard, serveur d’archives et documentation.

## Critères d’acceptation globaux

- La route racine vide reste acceptée et les tests déjà ajoutés passent.
- Les activations `defer` immédiatement après leur clic sont reconnues sans faux positif.
- L’identifiant d’un clic n’est jamais repris par le clic suivant; les appels async ont une association vérifiable ou sont explicitement ambigus.
- Les fenêtres d’invocation n’absorbent pas les appels d’une interaction ultérieure.
- Le cycle pending est vérifiable sans capturer de données métier inutiles.
- Les phases de route s’apparient par opération et donnent un diagnostic expliquant le résultat réel.
- Reload et historique navigateur ont un contrat explicite et ne produisent ni appels doublés ni attribution silencieuse.
- Le replay garde son ordre déterministe et marque comme partielle toute branche qui ne peut pas être rejouée avec confiance.
