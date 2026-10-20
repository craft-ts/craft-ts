# Replay sémantique des appuis longs

**Statut : stratégie proposée, non implémentée.** Ce plan conserve le contrat
du replay par invocation : les événements natifs servent de repères et ne sont
pas redistribués à l’application.

## Problème concret

Dans `apps/demo/src/app/examples/primitives/pixel-art-matrix/long-press.directive.ts`,
un `pointerdown` démarre un timer. À son échéance, la directive exécute
`onLongPress`, qui appelle `PixelArtMatrixView.grid.paintColumn`. Le replay ne
redistribue pas `pointerdown`, donc le timer et le handler ne repartent pas.
Aujourd’hui, cet appel peut aussi manquer de `correlationId` : le listener
`Renderer.listen` de la directive n’est pas un `CraftDomEventHook`.

## Architecture concernée

1. **Directive et geste** — `longPress` possède le timer, sait quand le seuil
   est atteint et connaît l’élément hôte. C’est le bon endroit pour émettre un
   repère au moment exact du déclenchement. Un appui relâché ou annulé avant le
   seuil ne produit pas de repère de long press.
2. **Corrélation** — `provideCorrelationIdTracking()` fournit
   `CorrelationIdService.generateAndSet(...)`. Son `FnWrapper` place
   `lastCorrelationId` dans `getCurrentStartCorrelationId()` pendant
   l’exécution d’un générateur Craft. Le wrapper de capture de
   `send-context-to-ai.ts` utilise cet identifiant pour rattacher les méthodes
   Craft à une interaction.
3. **Invocation Craft** — les méthodes et leurs arguments sont capturés dans
   `send-context-to-ai.ts`. `rootReplayInvocationEvents()` détermine les racines
   qui seront invoquées par le replay ; les descendants restent exécutés par
   leur parent.
4. **Timeline et interface** — `debug-session-replay.ts` traite les étapes,
   `debug-session-replay-bridge.ts` résout les méthodes et
   `apps/debug-session-dashboard/src/replay-model.ts` présente les libellés.

## Stratégie retenue

Au seuil du timer, avant d’appeler `onLongPress` :

1. Créer un nouvel identifiant de corrélation avec un préfixe descriptif, par
   exemple `long-press`.
2. Capturer un événement sémantique `gesture` nommé `longPress`, avec cet
   identifiant, l’identité de replay de l’élément, la durée configurée et le
   temps de déclenchement. L’événement marque l’action dans la timeline ; il ne
   contient pas une commande qui réexécute le handler.
3. Exécuter le handler normalement. Les méthodes Craft qu’il appelle sont alors
   enregistrées avec le même `correlationId`, leurs adresses et leurs arguments.
4. Au replay, traiter `gesture:longPress` comme une étape de timeline
   visuelle. Ne redistribuer ni `pointerdown`, ni `pointerup`, ni `click`, et ne
   pas rappeler `onLongPress`. Rejouer uniquement les racines Craft associées à
   cette étape, par leur adresse et leurs arguments enregistrés.

Ainsi, `paintColumn(columnIndex, color)` s’exécute une fois au replay. Le
callback de directive ne peut pas le lancer une seconde fois, puisqu’il n’est
jamais appelé pendant le replay. Cette règle reste vraie si le handler appelle
plusieurs racines Craft distinctes : chacune est rejouée une fois, et ses
descendants ne sont pas invoqués séparément.

Si le repère `gesture` n’a aucune invocation Craft rejouable dans son intervalle,
le replay continue avec un avertissement clair : l’appui long a été enregistré,
mais son effet dépend d’un handler natif ou d’un appel dont les données ne sont
pas disponibles. Il ne tente pas d’exécuter le handler comme solution de
secours.

La méthode reste soumise aux prérequis existants du replay d’invocation : la
capture des arguments doit être activée pour une session locale loopback. Sans
ces métadonnées, le repère explique le geste, mais ne fournit pas une commande
rejouable.

## Pourquoi ne pas rejouer le handler

Rappeler le handler peut réexécuter les mêmes méthodes que le graphe
d’invocations rejouera ensuite, doubler les mutations, ou produire des effets
externes qui ne sont pas représentés par les événements Craft. Le handler peut
aussi lire un événement natif, un état DOM ou une fermeture qui n’existe plus
dans le même état au replay. Les arguments capturés sur la méthode Craft sont
le contrat reproductible ; la logique d’orchestration du geste ne l’est pas.

Ce choix ne prend pas en charge un `onLongPress` qui ne fait que modifier le
DOM ou appeler une API navigateur non instrumentée. Ce cas doit être marqué
comme non rejouable, à moins qu’il ne soit converti en méthode Craft observable.

## Étapes d’implémentation

1. Ajouter une petite API interne de capture de geste, utilisable sans rendre
   les directives dépendantes de tout le module de replay. Elle doit être
   inactive hors d’une session enregistrée.
2. Dans `longPress`, générer l’identifiant au déclenchement du timer, capturer
   `gesture:longPress`, puis exécuter le handler sous ce contexte de corrélation.
   Garder inchangées l’annulation du timer et la suppression du click de fin.
3. Ajouter `gesture` à la validation et à `getReplaySteps`. L’étape porte
   l’identité visuelle et le lien de corrélation, mais ne distribue jamais
   d’événement DOM et n’appelle aucun handler.
4. Dans l’intervalle suivant cette étape, sélectionner les racines Craft du
   même `correlationId`. Éviter qu’elles soient aussi rattachées à l’étape
   visuelle précédente. Afficher l’avertissement dédié quand aucune racine
   exploitable n’est présente.
5. Ajouter un libellé `Appui long` dans le modèle du dashboard et afficher la
   cible enregistrée comme repère visuel.
6. Vérifier le comportement et décider si l’événement `gesture` tient dans le
   format v5 extensible. Incrémenter la version seulement si la validation ou
   la structure requise change.

## Scénarios d’acceptation

- Appui maintenu au-delà du seuil : un événement `gesture:longPress` précède
  les appels Craft capturés et porte leur `correlationId`.
- Rejeu de l’exemple pixel art : la timeline montre le geste, les cases de la
  colonne sont peintes par l’invocation de `paintColumn`, et la méthode est
  appelée exactement une fois. Aucun listener `pointerdown`, `pointerup` ou
  `click` de l’application n’est exécuté par le replay.
- Relâchement, sortie de cible ou `pointercancel` avant le seuil : aucun geste
  déclenché ni méthode associée n’est enregistré/rejoué.
- Handler avec plusieurs appels Craft racines : chaque racine est rejouée une
  seule fois, dans l’ordre de la timeline ; les appels enfants ne sont pas
  doublés.
- Aucun appel Craft, invocation absente ou identité de méthode ambiguë : le
  diagnostic est explicite et aucun handler DOM n’est appelé en repli.
- Un click normal après un appui trop court reste un click visuel ordinaire ;
  le click supprimé après un long press reste supprimé lors de la capture.

## Stratégie pour les autres limites

Le même principe peut couvrir des handlers natifs de scroll, hover ou saisie,
mais seulement quand l’application les instrumente explicitement. Il ne faut
pas distribuer leurs événements natifs au replay.

### Scroll, hover et saisie

Ajouter une API interne commune, par exemple
`runCraftReplayTrigger({ name, target, detail }, handler)`, que les directives
ou listeners peuvent appeler quand leur handler métier s’exécute. Elle crée un
`correlationId`, enregistre un repère sémantique du déclencheur, puis appelle le
handler normalement pendant la capture. Les invocations Craft produites par le
handler héritent de cet identifiant.

Au replay, le repère ordonne les invocations associées, mais ne redistribue pas
`scroll`, `pointerover`/`pointerout`, `input` ou `change` et ne rappelle pas le
handler natif. Les positions de scroll et valeurs de champs restent des
restaurations de présentation. Un listener non instrumenté, ou un effet qui
n’appelle aucune méthode Craft rejouable, reste signalé comme non rejouable.

Application par famille :

- **Scroll** : garder l’échantillonnage des positions pour l’affichage. Un
  chargement infini doit envelopper son effet métier avec l’API sémantique ; ne
  pas créer une commande pour chaque événement `scroll` à haute fréquence.
- **Hover** : garder `hover:enter`/`hover:leave` comme repères visuels. Un effet
  métier sur entrée/sortie doit déclarer son déclencheur avec l’API ; le replay
  invoque ses racines Craft sans envoyer de `pointerover`/`pointerout`.
- **Saisie** : garder la capture opt-in et les règles de données sensibles. Les
  valeurs capturées ne déclenchent pas de logique métier ; un traitement natif
  doit exposer son effet comme invocation Craft corrélée. Les handlers de
  formulaires déjà pris en charge via les hooks Craft restent dans leur chemin
  d’invocation habituel.

La première version de cette API doit borner son contrat aux appels Craft
exécutés dans le contexte du handler ou du générateur. Les callbacks différés
après une frontière asynchrone nécessitent un contexte de corrélation propagé ;
ne pas leur attribuer l’identifiant global de la dernière interaction, qui
pourrait être obsolète.

### Chargement différé des routes

Traiter `loadCraftComponent` et `loadChildren` comme des frontières de chargement
asynchrones, séparées des gestes DOM. Ajouter un événement `route-load` avec
l’identité stable de la route, le début, la fin et l’issue (`loaded` ou `error`),
ainsi que le lien vers la navigation qui l’a déclenché.

Au replay, rejouer la navigation par le routeur et laisser le callback de
chargement exécuter l’`import()` du build courant. Comparer son issue et son
ordre à l’enregistrement ; ne pas prétendre restaurer le module chargé depuis
l’archive, car un namespace JavaScript ne peut pas être sérialisé. En cas de
différence, d’échec ou d’identité de route introuvable, produire un diagnostic
dédié. Les retries doivent rester pilotés par la politique `withRetry` existante
et leur issue finale doit être vérifiée.

## Ordre de mise en œuvre proposé

1. Livrer et valider le chemin `longPress` sur l’exemple pixel art, notamment la
   corrélation et l’absence de double invocation.
2. Extraire son mécanisme de capture/corrélation dans
   `runCraftReplayTrigger`, puis l’appliquer à un exemple explicite de scroll,
   hover et saisie. Garder les événements natifs et la présentation hors du
   chemin de commande.
3. Instrumenter séparément `loadCraftComponent` et `loadChildren` avec des
   événements `route-load`, puis tester navigation, issue, erreur et retry avec
   un vrai callback différé.
4. Ajouter un scénario par famille et vérifier qu’aucun handler DOM n’est
   redistribué, qu’aucun appel Craft n’est doublé, et que les effets natifs non
   instrumentés sont diagnostiqués.

Le détail du contrat actuel — notamment la restauration visuelle du scroll et
des champs — reste dans
[`replay-invocation-prototype.md`](./replay-invocation-prototype.md).
