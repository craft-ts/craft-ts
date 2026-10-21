# Plan : fiabiliser complètement l’enregistrement et le rejeu des sessions

## Objectif

Le rejeu doit reproduire le chemin applicatif enregistré, y compris les
mutations, leurs états asynchrones et les chargements de route. Il doit
réutiliser les réponses HTTP enregistrées et ne jamais envoyer une requête
réseau live pendant le rejeu.

La compatibilité avec les anciennes versions d’archives n’est pas une
contrainte. Le format d’événements peut être simplifié ou changé si cela rend
le contrat plus clair et le rejeu plus fidèle.

## Divergences à traiter

- Session `474b5aea-01a1-4a88-8707-1acbb23773dc` : les mutations `issue`
  réussie et rejetée sont tracées, mais ne sont pas toujours rejouées comme
  invocations. La transition pending « Re-issuing… » peut alors manquer.
- Session `44da41c7-1de6-484b-bfef-b833b71d1875` : vérifier si les mutations
  ont la même cause ou si un handler parent les déclenche déjà pendant le
  rejeu.
- Des chargements de routes (`pending-node`, `pending-node/exception`,
  `query/:userId`) sont présents dans l’archive et les routes apparaissent,
  mais le rejeu peut signaler qu’il n’a pas observé leurs événements.
- Les notes du replay doivent différencier une action non exécutée, une
  observation perdue ou mal corrélée, et une vraie divergence de résultat.

## Plan de travail

### 1. Établir un diagnostic de référence

- Rejouer les deux archives et relever, pour chaque note, l’interaction, la
  corrélation, l’identifiant d’opération, les phases enregistrées et les phases
  observées.
- Classer chaque note comme déclenchement manquant, mauvaise corrélation,
  événement observé hors fenêtre, divergence d’état ou simple différence de
  timing.
- Conserver ces archives comme entrées de régression, même si leur format doit
  évoluer pour la suite.

**Résultat attendu :** une liste causale des divergences, sans assimiler une
route visible à une route dont le cycle de chargement a été correctement
comparé.

### 2. Définir un contrat d’événement de rejeu unique

- Décrire chaque invocation avec un identifiant d’opération, son adresse
  invocable, ses arguments sérialisés, sa corrélation et son opération parent
  éventuelle.
- Décrire chaque opération asynchrone avec un identifiant stable et ses phases
  `started`, `succeeded` ou `failed`.
- Refuser explicitement les arguments non sérialisables ou expurgés qui ne
  permettent pas de rejouer l’invocation.
- Retirer les voies de rejeu héritées qui dupliquent ou contournent ce contrat.
- Faire évoluer la version du format d’archive au besoin. Les anciennes
  archives pourront être déclarées incompatibles; aucune couche de
  rétrocompatibilité n’est requise.

**Résultat attendu :** une seule règle pour capturer, valider, invoquer et
comparer les événements.

### 3. Rejouer les mutations sans rejouer le réseau réel

- Exposer `mutation.mutate()` comme invocation rejouable, avec les mêmes
  arguments et le même contexte d’injection que pendant l’enregistrement.
- Préserver la causalité entre un handler parent et la mutation enfant, afin
  que le contrôleur n’invoque pas deux fois la mutation.
- Rejouer normalement le cycle du primitive : paramètres, état pending,
  résultat ou erreur, et mise à jour de l’état métier.
- Faire passer toutes les requêtes par le transport HTTP de replay, qui fournit
  les réponses enregistrées et échoue si aucune fixture ne correspond. Aucune
  requête live ne doit servir de fallback.

**Résultat attendu :** les mutations `issue` réussie et rejetée reproduisent
leur cycle complet, y compris « Re-issuing… », sans effet réseau externe.

### 4. Corréler correctement les chargements de route

- Capturer les phases de chargement des composants et des enfants de route,
  avec l’identité de route, l’URL cible, l’identifiant de corrélation et
  l’identifiant d’opération.
- Associer les phases observées au même cycle, y compris en cas de chargements
  répétés ou de nouvelle tentative.
- Comparer les événements de route sur toute la durée du run. Les chargements
  émis pendant la reprise du bootstrap ne doivent pas être oubliés parce qu’ils
  précèdent la première interaction.
- Ne consommer chaque opération observée qu’une seule fois. Ne pas associer un
  résultat à un autre chargement de même chemin.
- Séparer l’observation du chargement de la navigation visible : une route
  affichée ne prouve pas, à elle seule, que la bonne opération a été corrélée.

**Résultat attendu :** les trois chargements cités sont soit associés à leurs
phases observées, soit signalés avec la raison exacte de leur absence.

### 5. Corréler les transitions pending

- Émettre un cycle explicite pour chaque transition : source, mode, identifiant
  d’opération, affichage du fallback, puis état final ou destruction.
- Relier ces événements à l’invocation ou au chargement qui les a causés.
- Comparer le début et la fin d’une transition au niveau de l’opération, pas
  seulement par nom de source ou proximité temporelle.
- Distinguer « transition jamais lancée », « fallback non rendu », « opération
  terminée avant affichage » et « fin non observée ».

**Résultat attendu :** une note sur « Re-issuing… » indique si la mutation a
manqué, si l’état pending a été trop bref ou si le fallback n’a pas été rendu.

### 6. Améliorer les diagnostics présentés dans le dashboard

- Pour chaque divergence, afficher l’événement attendu et son meilleur candidat
  observé, avec leur corrélation et leur identifiant d’opération.
- Employer des catégories distinctes : invocation non exécutée, observation
  absente, corrélation ambiguë, ordre différent ou résultat différent.
- Ne pas présenter une absence d’observation comme la preuve d’un échec de
  navigation.
- Garder les notes actionnables : indiquer quelle frontière d’instrumentation
  ou quel événement manque.

**Résultat attendu :** une note explique une divergence vérifiable et ne
surinterprète pas les traces.

### 7. Verrouiller les comportements par des scénarios de régression

- Ajouter des cas pour les mutations directes et déclenchées par un handler,
  les réponses HTTP réussies et échouées, et l’absence de fixture HTTP.
- Couvrir les chargements de route observés pendant le bootstrap, les routes
  répétées, les nouvelles tentatives et les opérations concurrentes.
- Couvrir une transition pending visible, trop brève pour rendre le fallback,
  échouée et détruite.
- Rejouer les deux sessions de référence après conversion au nouveau format,
  ou remplacer leurs traces par des fixtures équivalentes si elles sont
  incompatibles.
- Vérifier qu’aucune requête live ne part et qu’une fixture manquante arrête le
  rejeu avec une erreur explicite.

**Résultat attendu :** le replay reproduit les scénarios causaux et chaque
absence d’événement est détectée au bon niveau.

## Correctifs déjà amorcés

- `mutation.mutate()` est enveloppé et enregistré comme invocation `method:mutate`.
- La comparaison des chargements de route consulte les événements observés
  depuis le début du run, y compris ceux reçus avant la première interaction.
- Ces changements ont passé une compilation TypeScript ciblée. Les scénarios de
  régression restent à ajouter et à exécuter.

## Critères de fin

- Les mutations enregistrées sont réexécutées une seule fois avec leurs
  arguments, et les réponses HTTP viennent exclusivement des fixtures.
- Chaque chargement de route attendu est associé à une opération observée, ou
  produit un diagnostic précis.
- Chaque transition pending est comparée à son opération causale.
- Les anciennes archives peuvent être refusées si elles ne satisfont pas le
  nouveau contrat.
- Les deux sessions de référence ne produisent plus de fausses absences
  d’événements; toute divergence restante correspond à une différence réelle
  du replay.
