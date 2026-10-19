# Orchestrateur et reprise forcée du replay des sessions

Date : 2026-10-16

## Contexte

Le replay compare les événements d’une session à ce que l’application fait
réellement. Si une navigation attendue n’a pas lieu, les événements du routeur
peuvent indiquer la route prévue ou atteinte, mais le clic DOM ne garde pas
nécessairement le `href` du lien. Il devient alors difficile de distinguer une
session mal capturée d’une divergence du replay et de poursuivre l’investigation
à partir de l’étape suivante.

Ce plan ajoute cinq capacités liées : orchestrer l’exécution des opérations
Craft attendues après chaque interaction, capturer la destination des clics sur
les liens, rejouer un appel Craft manquant lorsqu’il est explicitement
appelable, ramener l’application vers un point connu après un écart, et
permettre de franchir explicitement une portion divergente lorsque la session
ne contient pas assez d’informations pour la réparer.

## Objectif

Le replay dispose d’un orchestrateur qui déclenche les interactions DOM aux
temps enregistrés, observe les appels Craft qu’elles provoquent et attend les
opérations requises avant de franchir leurs dépendances. Il préserve les
chevauchements observés entre les appels indépendants. Après examen d’un écart,
l’utilisateur peut choisir une **reprise forcée** qui applique les
informations enregistrées disponibles — destination de navigation, appel
Craft attendu et point de contrôle des primitives — puis reprend le replay à
l’étape cohérente suivante. Si aucune
réparation n’est possible, l’utilisateur peut ignorer la portion divergente et
continuer depuis un point de reprise explicite. L’interface marque alors le
reste comme un replay partiel, puisqu’il ne représente plus une comparaison
fidèle de toute la session. Le replay continue d’exécuter les fonctions de
l’application et de comparer leur comportement. Pour forcer un appel, il
utilise une entrée explicitement autorisée du registre de l’application,
jamais du code ou une fonction sérialisée dans la session.

## Comportement attendu

1. À l’enregistrement d’un clic sur un lien, ajouter son `href` absolu à
   l’événement DOM, en plus du sélecteur et de l’action.
2. Passer cette URL par la même rédaction que les autres URL de session : retirer
   identifiants et secrets connus dans les paramètres. Conserver le format de
   session existant ; les anciennes sessions sans `href` restent lisibles.
3. À la première divergence, arrêter l’avancement automatique et garder le
   replay en pause. Afficher les valeurs attendue et observée ainsi que l’étape
   concernée.
4. Quand l’écart est un appel Craft attendu mais absent, proposer **Rejouer
   l’appel Craft attendu** uniquement si la cible autorise cet appel et si ses
   arguments sont rejouables. Exécuter cette entrée via le registre de
   l’application, attendre sa fin, comparer ses phases et reprendre après cet
   appel.
5. Proposer **Forcer l’état attendu et continuer** si la session fournit une
   destination ou un point de contrôle exploitable. Naviguer par le routeur
   Craft vers le `href` enregistré de même origine, restaurer les valeurs des
   primitives encore présentes, ignorer le reste de l’intervalle divergent et
   reprendre à l’étape cohérente suivante.
6. Indiquer ce qui a été appliqué. Si une autre divergence survient ensuite,
   l’afficher comme un nouvel écart.
7. Quand aucune réparation n’est disponible, proposer **Ignorer jusqu’au
   prochain point de reprise**. Le contrôleur saute uniquement jusqu’à un
   checkpoint stable déjà capturé et compatible avec l’application courante,
   puis reprend en pause. Il conserve la portion ignorée dans le rapport et
   marque les comparaisons suivantes comme partielles.
8. Après chaque interaction DOM rejouée, l’orchestrateur collecte les appels
   Craft associés, compare leur ordre et leurs phases, puis attend les
   opérations attendues avant la prochaine interaction qui en dépend. Il laisse
   progresser en parallèle les branches indépendantes enregistrées comme
   concurrentes.
9. L’orchestrateur n’attend pas un simple délai arbitraire ou quelques
   microtâches pour décider qu’une interaction est terminée. Il s’appuie sur
   les phases de début et de fin des wrappers, le temps virtuel Craft et les
   frontières router/HTTP instrumentées. Un délai maximal transforme une
   opération bloquée en écart explicite.

Une fonction n’est pas rejouable si elle n’a pas d’identifiant stable dans le
registre cible, si elle n’est pas autorisée, ou si ses arguments ne peuvent pas
être sérialisés sans perte ni fuite de secret. Si aucun appel, `href` ou point
de contrôle n’est exploitable, garder le replay en pause pour l’analyse
manuelle.

## Limites de sécurité et de portée

- Le pont n’accepte les messages que depuis sa fenêtre parente et les origines
  explicitement autorisées ; conserver ces vérifications et le handshake
  existants.
- N’utiliser que des navigations HTTP(S) de même origine vers l’application
  instrumentée. Ne pas faire de `location.assign` vers une autre application.
- Ne pas révéler ni réutiliser une URL dont les secrets ont été masqués.
- N’invoquer que des fonctions enregistrées explicitement comme rejouables dans
  l’application cible. Ne jamais évaluer du code provenant de l’export.
- Sérialiser et rédiger les arguments avec les helpers de session existants ;
  marquer une interaction non rejouable si ses arguments sont cycliques,
  non-sérialisables ou sensibles.
- Ne pas invoquer une nouvelle fois une opération qui a déjà démarré dans le
  replay. Une phase `succeeded` absente après une phase `started` signale une
  opération en attente ou en échec, pas un appel à dupliquer.
- N’autoriser le rejeu d’appels qu’avec la frontière HTTP enregistrée et
  bloquante déjà en place ; les effets non contrôlés restent hors du mode forcé.
- Restaurer uniquement des primitives connues du registre. Les entrées détruites
  ou absentes sont ignorées selon le contrat du registre.
- Le rejeu forcé d’une fonction ne remplace pas l’événement DOM d’origine et
  n’appelle pas une fonction par son simple nom. Il résout un identifiant stable
  et unique fourni par le registre de l’application.
- Garder le contrôle HTTP strict : une requête non enregistrée arrête le replay
  et n’est jamais transmise au réseau.
- Mettre en pause la persistance des événements de replay afin de ne pas créer
  une nouvelle session parasite.
- Ne jamais franchir automatiquement un écart. Le saut est une action
  explicite et ne peut pas sauter une frontière HTTP inconnue, une opération
  Craft déjà démarrée, ou un point de reprise sans checkpoint compatible.
- Après un saut, conserver l’indice de début et de fin de la portion ignorée,
  ainsi que le checkpoint utilisé. Ne pas présenter la suite comme un replay
  intégralement fidèle.
- Ne pas sérialiser globalement les appels interceptés par `provideFnWrapper` :
  cela détruirait les chevauchements légitimes et peut bloquer un appel enfant
  derrière le parent qui l’attend. L’orchestrateur suit les relations
  parent/enfant et les branches concurrentes lorsque le runtime peut les
  établir ; sinon il utilise le groupe d’interaction et l’ordre observé sans
  inventer de causalité.
- Le point de quiescence est borné aux sources instrumentées. Les tâches
  arbitraires du navigateur ou les flux externes non contrôlés ne sont pas
  réputés terminés par l’orchestrateur.

## Plan d’implémentation

### 1. Vérifier le point de départ

- Worktree de référence déjà utilisé :
  `/Users/romaingeffrault/.codex/worktrees/craftts-replay-dashboard/ng-craft`
  (branche `codex/craftts-replay-dashboard`).
- Ce worktree est actuellement **non propre** : il contient les changements du
  dashboard, de l’archive, de la capture et du replay, non commités à la date du
  2026-10-16. Le thread qui le reprend doit commencer par lire `git status` et
  préserver ces changements ; ne pas créer un autre worktree par défaut et ne
  pas réinitialiser les fichiers.
- Le présent plan a été écrit dans le checkout principal, à
  `docs/plans/debug-session-forced-recovery.md`. Le lire depuis ce chemin ou le
  recopier dans le worktree de travail avant de continuer.
- Vérifier si le dashboard, l’archive locale et le pont de replay sont déjà
  présents dans la branche choisie ou si le thread doit d’abord intégrer leur
  tranche précédente.
- Lire les contrats actuels de capture, d’export, de comparaison des écarts,
  d’injection du routeur Craft et du registre de primitives avant de modifier
  leurs interfaces.
- Les événements Craft de capture contiennent le nom, la phase, l’hôte et
  l’identifiant d’opération, mais pas les arguments. Le registre de fonctions de
  la démo sait déjà invoquer une entrée par clé et arguments
  (`apps/demo/src/app/function-registry.ts`), mais ce mécanisme est spécifique
  à la démo et n’est pas encore un contrat générique du replay. Évaluer un seam
  opt-in sans coupler `@craft-ts/component` à l’application demo.
- Cartographier le contexte de corrélation Craft existant et vérifier s’il se
  propage à travers les `await`, les appels imbriqués et les callbacks planifiés.
  Réutiliser ce mécanisme s’il conserve la parenté ; sinon ajouter un contexte
  d’exécution explicite au runtime avant de promettre une trace d’arbre fiable.

### 2. Capturer les destinations de lien

- Dans le hook de capture DOM, retrouver le lien avec `element.closest('a[href]')`
  afin de couvrir un clic sur un enfant du lien.
- Ajouter `href` uniquement si un lien est trouvé ; le traiter avec le helper
  existant de rédaction d’URL.
- Garder une lecture rétrocompatible : l’absence du champ dans les exports v1
  ou v2 existants ne doit pas invalider le replay.

### 3. Rendre les appels Craft sélectionnés rejouables

- Étendre les événements Craft avec un identifiant de registre stable,
  distinct de `operationId` (qui identifie une occurrence), et les arguments
  sérialisés/rédigés nécessaires à l’appel. Conserver le nom et les phases pour
  la comparaison.
- Ajouter une capacité opt-in au bridge de l’application cible pour résoudre
  l’identifiant vers une fonction vivante et autorisée. L’adapter de la démo
  peut s’appuyer sur son registre existant ; le protocole générique ne doit pas
  dépendre de son WebSocket MCP.
- Si l’appel ne peut pas être capturé fidèlement, marquer l’événement
  `replayable: false` avec une raison consultable, sans bloquer la capture de la
  session.
- Invoquer la fonction via son contexte Craft d’origine afin que ses
  dépendances, wrappers, effets et phases restent observables. Attendre le
  résultat avant de reprendre la comparaison.
- N’offrir l’action qu’en cas d’appel attendu absent et non démarré. Ne pas
  rejouer l’appel si une phase de démarrage observée prouve qu’il est déjà parti.

### 4. Ajouter une reprise au contrôleur de replay

- Donner à l’écart un contexte de reprise optionnel contenant l’appel attendu,
  `href` et/ou snapshot attendu, sans invalider les sessions historiques.
- Préserver les écarts existants et le fonctionnement pas-à-pas.
- Sur un écart, mettre en pause sans désinstaller immédiatement l’horloge
  virtuelle ou l’interception HTTP ; elles doivent rester actives jusqu’à la
  reprise, l’arrêt explicite ou la fin du replay.
- Ajouter des commandes explicites : rejouer un appel autorisé ou appliquer le
  contexte d’état/navigation. Repositionner le curseur après l’opération
  réellement rétablie et laisser le replay en pause.
- Les erreurs d’application du contexte doivent être retournées à l’interface
  sans masquer l’écart ni marquer la session comme terminée.

### 5. Ajouter l’orchestrateur d’interactions Craft

- Introduire un coordinateur opt-in pour le replay, relié aux wrappers Craft et
  au contrôleur. Il reçoit les interactions DOM à rejouer et le calendrier des
  événements Craft, router et HTTP de la session.
- Pour chaque interaction, créer un `interactionId`. À la capture, rattacher
  les appels Craft déclenchés à cette interaction et donner à chaque appel un
  `operationId` stable pour l’occurrence et, si le runtime le sait, un
  `parentOperationId`. Conserver le nom stable de fonction et les phases
  `started` / `succeeded` / `failed`.
- En replay, `provideFnWrapper` signale le démarrage et la fin d’une invocation
  au coordinateur. Le wrapper doit toujours déléguer une seule fois à la
  fonction d’origine et préserver sa valeur, son erreur, `this`, ses arguments
  et son contexte d’injection.
- Après le dispatch DOM, attendre l’ensemble d’opérations attendu pour cette
  interaction et faire avancer l’horloge Craft pour déclencher les tâches
  temporelles enregistrées. Une dépendance attend la fin de son parent ; des
  branches indépendantes peuvent avancer en parallèle conformément aux temps
  relatifs de capture.
- Avant chaque interaction suivante, vérifier ses dépendances. Ne pas attendre
  artificiellement la fin de toutes les branches si la capture montre qu’elles
  se chevauchent avec l’interaction suivante.
- Comparer les fonctions par identifiant stable lorsque disponible, puis par
  nom/hôte avec un statut moins précis. Comparer leur ordre causal et leurs
  phases ; signaler « non comparable précisément » si l’identifiant manque.
- Définir une politique de timeout configurable et bornée. Si une opération
  attendue ne démarre pas, ne termine pas ou si une opération inattendue
  apparaît, mettre en pause et présenter l’opération, l’interaction et la
  relation attendue.
- Exposer au dashboard l’état de l’interaction : fonctions attendues, observées,
  en cours, terminées, branches encore actives et temps virtuel courant.
- Faire de la reprise forcée et du saut des commandes de l’orchestrateur :
  après réparation, mettre à jour le curseur et le graphe d’opérations sans
  perdre les branches encore actives ni invoquer deux fois une opération.
- Si la parenté asynchrone ne peut pas être propagée de manière fiable, garder
  des groupes par interaction et rendre l’incertitude visible. Ne pas affirmer
  qu’un arbre d’appels a été comparé quand seule une séquence plate est
  disponible.

### 6. Étendre le pont d’application

- Ajouter un message dédié à la reprise forcée, soumis aux mêmes contrôles de
  source et d’origine que les messages existants.
- Capturer les capacités Craft nécessaires pendant l’initialisation du pont,
  puis les réutiliser dans les handlers de messages.
- Valider l’URL contre `location.origin`, construire une route relative
  (`pathname`, recherche et fragment) et appeler `navigateByUrl` du routeur
  Craft.
- Une fois la navigation terminée, restaurer le point de contrôle fourni par le
  replay controller et répondre avec l’index repris et les actions appliquées.
- Ajouter un message distinct pour l’invocation d’un identifiant rejouable ;
  valider l’identifiant et les arguments, puis transmettre le résultat et les
  phases observées au contrôleur. Ne pas accepter de source de fonction depuis
  l’export.

### 7. Ajouter les actions dans le dashboard

- Dans la vue détail, conserver l’affichage côte à côte de l’attendu et de
  l’observé.
- Ajouter **Rejouer l’appel Craft attendu** et **Forcer l’état attendu et
  continuer** selon les données disponibles ; masquer les actions non
  applicables.
- Ajouter **Ignorer jusqu’au prochain point de reprise** lorsqu’un checkpoint
  stable et compatible existe après l’écart. Demander une confirmation dans la
  même action uniquement si le saut abandonne une interaction attendue non
  triviale ; sinon le libellé explicite suffit.
- Après réussite, effacer l’écart résolu, afficher l’appel, la route ou le point
  de contrôle appliqué et conserver l’index exact du replay.
- Après un saut, afficher une annotation persistante « replay partiel » avec
  l’intervalle ignoré et le checkpoint de reprise. Les divergences ultérieures
  restent visibles séparément.
- Après erreur, garder l’écart affiché et expliquer pourquoi la reprise n’a pas
  pu être appliquée.

### 8. Tests, documentation et validation

- Ajouter un test unitaire du contrôleur qui vérifie la reprise au curseur
  suivant et transmet l’appel, le `href` et le snapshot attendus aux callbacks
  appropriés.
- Étendre le test E2E de capture pour vérifier que le clic de navigation
  exporte le `href` prévu.
- Ajouter un E2E qui provoque volontairement une divergence de route, vérifie
  les valeurs attendue/observée, force la navigation vers la destination
  enregistrée puis exécute l’interaction suivante.
- Ajouter un E2E qui provoque l’absence d’un appel Craft autorisé, vérifie que
  l’interface le rejoue une seule fois avec les arguments enregistrés, constate
  ses phases et poursuit à l’interaction suivante.
- Ajouter un E2E où aucune réparation directe n’est possible : le saut reprend
  au prochain checkpoint compatible, l’intervalle ignoré est affiché, la suite
  s’exécute en pause/reprise normale et le statut « replay partiel » persiste.
- Tester l’orchestrateur avec un appel enfant, deux branches réellement
  concurrentes, un appel attendu absent, une opération qui ne termine jamais,
  une erreur et une fonction sans identifiant stable. Vérifier que le wrapper
  appelle toujours la fonction d’origine une seule fois et préserve son
  contexte Craft.
- Ajouter un E2E où une interaction déclenche plusieurs opérations asynchrones
  et une navigation différée : la lecture normale et le pas-à-pas attendent les
  opérations enregistrées, puis affichent l’état final dans l’iframe avant de
  passer à l’interaction dépendante suivante.
- Tester aussi l’absence de bouton quand aucune donnée ne permet de reprendre,
  le rejet d’identifiants/arguments non autorisés, les secrets et valeurs non
  sérialisables, la reprise refusée pour une URL étrangère ou masquée, le saut
  refusé sans checkpoint ou au travers d’une frontière HTTP inconnue, le
  handshake iframe et l’absence de nouvelle session créée par le replay.
- Mettre à jour le README du dashboard et le guide Send Context :
  orchestration/corrélation des appels, limites de quiescence, champ `href`,
  appels Craft rejouables, actions explicites, limites de sécurité et
  restauration partielle du registre.
- Lancer les tests unitaires ciblés, le typecheck des packages touchés et la
  suite E2E du dashboard ; inspecter `git diff --check` et les artefacts de test.

## Critères d’acceptation

- Un clic DOM sur un lien exporte son `href` rédigé et les sessions historiques
  sans ce champ restent importables.
- Une divergence arrête le replay sans supprimer les informations de reprise.
- Pour une destination enregistrée de même origine, l’utilisateur peut forcer
  la navigation par le routeur Craft, voir le résultat, puis poursuivre au
  prochain événement DOM.
- Un appel Craft absent n’est rejoué que si l’application cible l’a autorisé,
  qu’un identifiant stable a été capturé, que ses arguments ont été conservés
  sans secrets et qu’aucune phase de démarrage n’a déjà été observée.
- Le nouvel appel repasse par les wrappers Craft et ses phases sont comparées ;
  il est exécuté une fois et aucun code n’est évalué depuis la session.
- Les primitives encore présentes sont restaurées depuis le point de contrôle ;
  les primitives disparues ne font pas échouer toute la reprise.
- Les destinations secrètes, étrangères ou non routables ne sont pas forcées.
- Une requête HTTP inconnue reste bloquante et aucune session supplémentaire
  n’est enregistrée par le replay.
- Un saut de divergence n’est proposé qu’avec un checkpoint compatible ; il
  enregistre l’intervalle ignoré et marque les comparaisons qui suivent comme
  partielles.
- Le replay attend les opérations Craft qui causent les interactions suivantes,
  respecte les phases et les chevauchements enregistrés, et n’utilise pas un
  nombre fixe de microtâches comme signal de fin.
- Un appel enfant ne peut pas être bloqué derrière son parent et deux branches
  indépendantes restent concurrentes lorsqu’elles l’étaient dans la capture.
- Les tests E2E couvrent au minimum la capture du `href`, la divergence, la
  reprise forcée, le saut contrôlé d’un intervalle et l’interaction qui suit.
