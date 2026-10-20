# Plan — tolérances et évolution des scénarios de replay

Date : 2026-10-19

## Avancement

- [x] Phase 1 : inventaire des comparaisons actuelles et caractérisation des
      tolérances de snapshots. Voir
      [`../debug-session-replay-comparison-inventory.md`](../debug-session-replay-comparison-inventory.md).
- [x] Phase 2 : contrat versionné des scénarios dans un sidecar indépendant.
      Voir [`../debug-session-replay-scenario.md`](../debug-session-replay-scenario.md).
- [x] Phase 3 : règles explicites, comparaison métier stricte en mode scénario,
      fixtures HTTP strictes et présentation des tolérances dans le dashboard.
- [x] Phase 4 : `runReplayTest` et `runReplayTestOrThrow` avec verdicts
      structurés, exécution sans récupération manuelle et garde réseau.
- [x] Phase 5 : rapports de drift, proposition de recapture versionnée et états
      de cycle de vie sans mise à jour automatique des références.

## Objectif

Permettre aux scénarios de replay de rester utiles quand l’application évolue,
sans que des changements de présentation les cassent et sans qu’une tolérance
masque une régression métier.

Le replay doit distinguer clairement :

- les invariants métier qui déterminent la réussite du scénario ;
- les variations explicitement admises par ce scénario ;
- les détails de présentation conservés pour le diagnostic ;
- les incompatibilités qui nécessitent une révision ou une nouvelle capture.

Le mode de test doit rester déterministe : aucune règle permissive générale,
aucun fallback réseau réel et aucun saut de divergence ne peut produire un
résultat vert.

## Contexte actuel

- Le dashboard rejoue les sessions v5 en mode invocation. Les invocations Craft
  et les résultats des transports enregistrés conduisent le replay ; les
  événements DOM restent des repères visuels.
- Les résultats de `CraftHttpClient` et `fetch` sont rejoués. Les WebSocket et
  Worker doivent être déclarés par un adaptateur. Les transports inconnus ne
  retombent pas sur le réseau natif.
- Les cibles DOM utilisent une identité Craft opaque, avec un chemin DOM local
  et un repli visuel. Une cible absente ou ambiguë peut déjà produire une
  divergence selon le type d’interaction.
- Les checkpoints comparent l’état Craft et permettent, dans le dashboard, de
  forcer un état ou de poursuivre après un écart. Une portion sautée est
  annotée comme partielle et ne prouve pas la fidélité de l’intervalle.
- Certaines comparaisons sont déjà tolérantes : valeurs expurgées, paramètres
  d’URL triés et comparaisons partielles de certains objets. Ces règles sont
  implicites dans le code et doivent être inventoriées avant de devenir un
  contrat de test.
- Les comptes d’invocations `method:*`, `query:*` et `mutation:*` ne sont pas
  tous des critères de réussite. Le routage, les caches et le settling
  asynchrone peuvent changer leur ordre ou leur compte.

Références :

- [`apps/debug-session-dashboard/README.md`](../../apps/debug-session-dashboard/README.md)
- [`docs/plans/replay-invocation-prototype.md`](./replay-invocation-prototype.md)
- [`docs/plans/debug-session-craft-target-identity.md`](./debug-session-craft-target-identity.md)
- [`libs/component/src/lib/ai/debug-session-replay.ts`](../../libs/component/src/lib/ai/debug-session-replay.ts)
- [`libs/core/src/lib/craft-replay-target.ts`](../../libs/core/src/lib/craft-replay-target.ts)

## Décisions de conception proposées

### 1. Séparer diagnostic et verdict de test

Conserver deux usages explicites :

- **Replay de diagnostic** : animation, marqueurs DOM, inspection des événements
  et récupération manuelle. Il peut poursuivre après une divergence si le
  développeur le demande, mais le résultat indique toujours l’écart et toute
  portion sautée.
- **Replay de test** : exécution automatisable, rapide et déterministe. Toute
  divergence non couverte par une tolérance déclarée échoue le scénario. Une
  récupération ou un saut rend le scénario échoué ou partiel, jamais réussi.

Ne pas ajouter un réglage global « ignorer les différences ».

### 2. Définir les niveaux de comparaison

Chaque assertion appartient à l’un des niveaux suivants :

1. **Métier strict** — comportement, résultat API, état final, navigation ou
   message sortant qui porte le contrat du scénario. Comparaison stricte par
   défaut.
2. **Tolérance déclarée** — variation précise qui n’affecte pas le contrat,
   par exemple un champ généré, une marge numérique, un ordre sans sémantique,
   ou un délai d’animation.
3. **Présentation informative** — sélecteurs, coordonnées, structure DOM,
   viewport et détails d’animation. Utilisés pour expliquer le scénario et
   diagnostiquer, mais non bloquants pour un verdict métier sauf assertion
   visuelle explicitement ajoutée.

Une tolérance n’est jamais héritée implicitement d’une comparaison voisine.

### 3. Déclarer les tolérances dans le scénario

Associer aux scénarios de test une définition versionnée et validée comprenant
au minimum :

- un identifiant et une version de scénario ;
- les points de contrôle métier et leurs valeurs attendues ;
- les chemins/champs volontairement ignorés ou transformés avant comparaison ;
- les marges numériques, ensembles non ordonnés ou normalisations d’URL
  autorisés, lorsque nécessaires ;
- les invocations et transports significatifs ;
- la politique de recapture et la raison du changement.

Les règles sont ciblées sur un chemin de donnée, une opération, un endpoint ou
un point de contrôle. Refuser les jokers globaux et les règles qui autorisent
une valeur ou un endpoint arbitraire.

La représentation et le stockage exacts de cette définition seront établis
avant de figer un nouveau schéma d’archive. Le scénario ne doit contenir aucun
code exécutable issu de l’export.

### 4. Donner une sémantique explicite aux valeurs volatiles

Fournir des comparateurs sûrs et nommés plutôt qu’une égalité relâchée :

- **champ ignoré** : uniquement pour une valeur sans portée métier, comme un
  identifiant de corrélation si le test ne vérifie pas cette identité ;
- **champ expurgé** : le contenu capturé comme `[REDACTED]` n’impose pas la
  valeur runtime, mais la présence et la structure attendues restent
  vérifiables lorsque pertinentes ;
- **marge numérique** : valeur absolue/relative et unité explicites ;
- **collection non ordonnée** : seulement pour une collection déclarée comme
  ensemble ; les tableaux ordonnés restent comparés dans l’ordre ;
- **normalisation d’URL** : tri des paramètres et suppression des valeurs
  volatiles uniquement si la règle le nomme ; méthode, chemin et paramètres
  significatifs restent vérifiés.

Les réponses API enregistrées restent des fixtures déterministes. Une règle de
tolérance ne doit pas modifier silencieusement la fixture ni accepter toute
réponse différente.

### 5. Traiter les cibles visuelles avec une politique distincte

- Une différence de coordonnées, de CSS ou de chemin DOM local ne fait pas
  échouer un test métier par défaut.
- Un hover introuvable peut rester un avertissement visuel.
- Une action ciblée nécessaire au scénario, une identité Craft absente,
  instable ou ambiguë doit rester un échec si le scénario exige cette cible.
- Ajouter des assertions de rendu/DOM séparées lorsque l’identité, la présence,
  l’accessibilité ou la position du contrôle fait réellement partie du contrat.
- Utiliser des clés stables de collection ; ne jamais associer silencieusement
  une action à un autre élément après un tri ou un changement de DOM.

Le replay d’invocation ne rejouant pas les événements natifs, les tests qui
doivent valider les handlers de clic, de saisie, de clavier ou de scroll
continuent à utiliser une vraie automatisation navigateur.

### 6. Distinguer divergence et obsolescence du scénario

À l’échec, produire un diagnostic qui permet de classer l’événement :

- régression de l’application ;
- contrat du scénario intentionnellement modifié ;
- session obsolète ou incompatible ;
- capture incomplète/non rejouable ;
- environnement ou adaptateur manquant ;
- différence visuelle informative.

La recapture crée une proposition de mise à jour du scénario. Elle ne remplace
pas automatiquement la référence qui a échoué. Le changement d’attendu doit
être revu et accompagné d’une raison.

États de cycle de vie proposés pour un scénario :

- **actif** : rejouable et pertinent ;
- **à réviser** : divergence à qualifier ou tolérance à décider ;
- **à recapturer** : parcours/contrat intentionnellement changé ;
- **incomplet/non rejouable** : données ou adaptateurs insuffisants.

Un export tronqué, incomplet, d’une version non prise en charge, ou contenant
une opération non déterminable ne passe jamais en état actif par tolérance.

## Phases de mise en œuvre

### Phase 1 — Inventorier et caractériser les comparaisons actuelles

1. Lister les comparateurs d’état, d’invocation, de requête, de transport,
   d’identité de cible et de timeline.
2. Pour chaque comparaison, documenter le comportement exact : égalité,
   sous-ensemble, valeur expurgée, ordre ignoré, clé manquante ou différence
   seulement visuelle.
3. Repérer les tolérances susceptibles de masquer une suppression de champ,
   une invocation manquante, une requête inattendue ou un état métier modifié.
4. Ajouter des cas de référence qui démontrent les faux positifs et faux
   négatifs potentiels, sans changer le comportement avant d’avoir fixé le
   contrat.

### Phase 2 — Définir le contrat des scénarios

1. Définir le format typé de scénario et son emplacement : archive, fichier de
   test adjacent ou manifeste CI. Éviter de coupler le contrat métier au seul
   format d’événements de diagnostic.
2. Définir les assertions métier, les règles de normalisation, les tolérances
   numériques et les comparaisons de collections.
3. Définir la validation stricte des règles : chemin exact, type attendu,
   bornes, absence de secrets, aucune règle générique non bornée.
4. Décider si une version de scénario est distincte de la version de format de
   session. Elles évoluent pour des raisons différentes et devraient être
   versionnées séparément si le contrat le confirme.

### Phase 3 — Mettre les comparateurs en conformité

1. Remplacer les comportements souples implicites par des fonctions de
   comparaison nommées, couvertes par le contrat du scénario.
2. Conserver une comparaison stricte par défaut pour les données métier et les
   payloads significatifs.
3. Rendre la comparaison partielle des snapshots explicite : ignorer une clé
   uniquement si le cycle de vie du registre ou une règle du scénario le
   justifie. Signaler séparément les clés ajoutées/supprimées quand elles sont
   contractuelles.
4. Distinguer les différences de présentation des divergences bloquantes dans
   le protocole de résultat et le journal du dashboard.
5. Ne pas convertir une reprise forcée ou un saut de checkpoint en réussite.

### Phase 4 — Ajouter le mode test rapide et automatisable

1. Exposer un point d’entrée de replay utilisable par les tests automatisés,
   sans interaction manuelle avec les commandes du dashboard.
2. Avancer l’horloge virtuelle aussi vite que les opérations causales le
   permettent, tout en attendant les loaders et descendants requis.
3. Retourner un résultat structuré : réussi, échoué, partiel ou non rejouable,
   avec première divergence, attendu/observé et tolérance appliquée.
4. Faire échouer le processus CI sur divergence, session partielle, transport
   live/non déclaré, règle invalide, ou récupération manuelle.
5. Ajouter des assertions de résultat final et des assertions réseau qui
   prouvent l’absence d’appels non enregistrés.

### Phase 5 — Gérer l’évolution et la recapture

1. Permettre de rejouer une nouvelle version de l’application contre les
   scénarios actifs sans mettre à jour les attendus automatiquement.
2. Produire un rapport de drift regroupé par scénario : différences métier,
   différences tolérées, différences visuelles et incompatibilités.
3. Fournir une commande ou un flux de recapture qui prépare un diff des
   attentes et garde l’ancienne référence jusqu’à validation.
4. Enregistrer la raison, l’auteur, la version d’application et les adaptateurs
   lorsque le scénario est accepté ou recapturé.
5. Détecter les sessions anciennes, tronquées, sensibles ou non rejouables
   avant le lancement du replay.

## Stratégie de validation

### Tests unitaires

- Comparaison stricte par défaut et tolérances exactes sur des chemins ciblés.
- Champ ignoré/expurgé, marge absolue et relative, collection ordonnée et
  collection déclarée non ordonnée.
- Refus d’une tolérance invalide, trop large, ambiguë ou affectant un champ
  protégé.
- Différence de clé de snapshot ajoutée, supprimée ou modifiée selon sa
  classification.
- Normalisation d’URL qui conserve les éléments significatifs.
- État de scénario après divergence, saut, récupération, session tronquée ou
  recapture proposée.

### Intégration et E2E

- Une refonte CSS ou un déplacement de cible n’échoue pas un scénario métier
  quand seul le résultat métier est contractuel.
- Une action sur une cible Craft ambiguë échoue si l’action est requise.
- Une variation explicitement tolérée passe ; la même variation hors règle
  échoue.
- Une invocation métier manquante, une requête inattendue ou un état final
  erroné échoue même si les repères visuels correspondent.
- Une réponse API est stable et aucun appel live ne part en replay.
- Un checkpoint sauté ou une reprise forcée ne donne jamais un verdict réussi.
- La recapture propose un diff et ne remplace pas automatiquement la référence.
- Le mode rapide conserve l’ordre causal, attend les opérations nécessaires et
  retourne un rapport CI exploitable.

## Critères d’acceptation

- Les détails visuels ne font pas échouer par défaut un scénario métier.
- Les comportements métier et les frontières réseau restent stricts par
  défaut.
- Chaque tolérance est explicite, bornée, localisée et visible dans le rapport.
- Une tolérance ne peut pas convertir une donnée manquante, une session
  incomplète ou une requête inattendue en succès.
- Une divergence, une reprise, un saut ou une portion partielle ne produit
  jamais un verdict vert.
- Une recapture est une modification revue du contrat, pas un apprentissage
  automatique à partir du dernier résultat.
- Le scénario reste utile après une évolution de présentation et signale les
  évolutions métier qui demandent une décision.

## Hors périmètre

- Remplacer les E2E navigateur qui vérifient les gestes utilisateur et leurs
  handlers natifs.
- Accepter automatiquement les changements de comportement ou régénérer les
  attendus sans revue.
- Fournir un système général de mocks réseau non rattaché à des fixtures et
  adaptateurs déclarés.
- Rendre déterministe le comportement de services externes, SDK opaques ou
  APIs navigateur sans instrumentation dédiée.
