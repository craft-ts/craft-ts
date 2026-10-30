# Contrats codec et catalogue de scénarios pour les recettes

## Objectif

Rendre les appels externes assez explicites pour qu'une recette puisse choisir
un scénario métier, construire des données valides et fournir la réponse au
format exact attendu par l'application. La création d'une recette doit devenir
plus déterministe, plus courte et vérifiable avant qu'elle soit proposée comme
relançable.

Ce plan prolonge l'intégration laissée ouverte dans
[`2026-10-28-reprise-comportement-mockee.md`](./2026-10-28-reprise-comportement-mockee.md) :
les recettes ne copient plus toutes leurs réponses mockées en texte libre ;
elles peuvent référencer des scénarios typés et documentés.

## Problèmes observés

- Un identifiant d'appel stable ne décrit pas à lui seul les réponses possibles
  ni leur signification métier.
- Un schéma de validation seul ne garantit pas le bon format au transport. Par
  exemple, une fonction peut renvoyer une chaîne JSON qui sera décodée en objet
  dans le client. Un mock placé à la frontière réseau doit respecter le format
  reçu par le client.
- Les recettes doivent aujourd'hui retrouver les identifiants d'état, préparer
  l'état manquant et reconstituer à la main des mocks cohérents entre eux.
- Une recette peut être enregistrée sans avoir prouvé que ses prérequis,
  attentes et données simulées fonctionnent dans un onglet neuf.
- Un skill peut expliquer la bonne méthode, mais ses instructions ne remplacent
  pas des contrats vérifiables par les outils.

## Décisions proposées

1. Chaque frontière réseau Craft possède un contrat codec qui décrit les
   valeurs métier et leur représentation transport, avec un décodage entrant et
   un encodage sortant explicites.
2. Les scénarios sont déclarés à côté de leur propriétaire métier. Chaque cas
   a un identifiant stable, un titre, une description de l'intention, une
   catégorie de résultat et une fabrique de données typées.
3. Les builders simples peuvent être générés comme squelettes depuis les
   schémas. Les builders qui expriment des invariants métier (relations entre
   identifiants, rôles, permissions, états liés) restent écrits ou validés par
   le domaine ; ils ne sont pas inventés par une génération générique.
4. Les règles statiques assurent la couverture des frontières et la présence
   des contrats. Elles ne prétendent pas prouver qu'un parcours UI fonctionne.
5. L'agent interroge un catalogue compact à la demande. Le skill décrit le
   processus ; il ne contient pas une copie complète des scénarios de chaque
   application.
6. Une recette n'est annoncée comme relançable qu'après une prévalidation
   depuis un onglet neuf, sans écriture réelle si son objectif l'interdit.

## Vocabulaire

- **Frontière externe** : appel sortant de l'application vers une API ou un
  serveur, identifié par l'architecture (server function Craft, client HTTP
  Craft, puis autres transports explicitement pris en charge).
- **Type métier** : valeur utilisée par l'application après décodage.
- **Valeur transport** : entrée ou réponse effectivement sérialisée sur le
  réseau.
- **Codec** : contrat exécutable qui encode la valeur métier vers le transport
  et décode le transport vers la valeur métier.
- **Scénario** : cas nommé d'un appel externe (succès, erreur métier,
  exception Craft ou panne transport) et sa conséquence attendue.
- **Builder** : fabrique déterministe d'une valeur métier valide, avec des
  variantes contrôlées pour le scénario.

## Architecture cible

```text
déclaration de l'appel + codec + erreurs exposées
                    │
                    ├── ESLint : contrat local présent et exploitable
                    ├── graphe : chaque frontière a un contrat/catalogue unique
                    └── catalogue de scénarios : cas nommés + builders métier
                                      │
                        MCP de découverte ciblée
                                      │
                           génération de recette
                                      │
            résolution des références → encode transport → prévalidation
                                      │
                     recette vérifiée et relançable
```

## Étapes

### 1. Inventorier les frontières et figer le contrat codec

- Recenser les formes d'appels externes déjà reconnues par le graphe :
  `serverFunction`, clients HTTP Craft et autres frontières pertinentes.
- Définir pour chaque forme où réside le codec et quelles valeurs il expose :
  entrée métier, entrée transport, sortie transport, sortie métier, erreurs
  déclarées.
- Définir le mécanisme d'exception pour les cas où l'application ne peut pas
  encoder/décoder (par exemple protocole opaque ou API tierce non contrôlée).
- Préciser la limite de la première version : aucune requête `fetch`/XHR
  arbitraire ne devient mockable implicitement ; elle reste bloquée en mode
  mocké jusqu'à déclaration explicite.

**Sortie :** une note de contrat avec des exemples valides et invalides pour
une server function et un client HTTP Craft.

### 2. Ajouter la règle ESLint de codec

- Ajouter une règle locale qui refuse une déclaration d'appel externe sans
  codec explicite ou sans exemption motivée et limitée.
- Le codec doit exposer les deux conversions nécessaires, pas uniquement une
  validation de forme.
- Le diagnostic indique l'appel, le côté manquant (encodage ou décodage) et le
  remplacement attendu. Pas d'autofix si le bon schéma métier ne peut pas être
  déduit sans risque.
- Activer la règle au niveau `error` dans le preset Craft recommandé, pour que
  les nouveaux projets l'héritent aussi.
- Documenter explicitement le bénéfice secondaire : les codecs rendent les
  scénarios de recettes encodables et décodables de façon déterministe.

**Sortie :** un appel sans codec échoue au lint ; un codec complet passe. Les
cas de faux positif et d'exemption sont couverts.

### 3. Compléter la garantie avec le graphe d'architecture

- Étendre les analyses existantes pour associer chaque frontière externe à son
  identité stable, son codec et son propriétaire.
- Refuser les appels non inventoriés, les identifiants dupliqués et les
  déclarations de scénario orphelines.
- Vérifier que les codecs et scénarios sont référencés depuis la même opération
  que celle qu'ils décrivent.
- Garder l'analyse déterministe et statique ; ne pas prétendre valider la
  cohérence métier du contenu dynamique.

**Sortie :** le graphe donne une liste exhaustive des appels externes et
échoue quand une relation entre fichiers manque ou est ambiguë.

### 4. Déclarer les scénarios et builders

- Ajouter une structure de catalogue par opération avec : identifiant, libellé,
  description de l'intention, catégorie (`success`, erreur métier, exception
  Craft, panne transport), builder et éventuelles transitions vers le cas
  attendu d'un appel ultérieur.
- Distinguer clairement données typées métier et réponse brute au transport.
  Le runtime de recette applique le codec pour produire la réponse brute au bon
  format.
- Fournir des builders partagés pour les concepts communs (compte/persona,
  rôles, catalogue, panier, identifiants liés), sans créer un générateur
  universel de données métier.
- Décrire les jeux de données avec des phrases orientées comportement :
  « compte staff : peut consulter les commandes, ne peut pas modifier le
  catalogue » plutôt qu'un simple nom de cas opaque.
- Ne jamais inclure de vrais jetons, mots de passe ou données personnelles dans
  les fixtures. Les identités de test restent synthétiques ; une vraie
  connexion conserve son handoff humain.

**Sortie :** chaque scénario référencé est reproductible et fournit des valeurs
qui passent son codec ainsi que les invariants métier déclarés.

### 5. Publier un catalogue compact pour les agents

- Exposer une découverte à la demande, sous forme d'outil MCP ou de ressource :
  - recherche/listage par route, appel ou domaine ;
  - détail d'un appel avec codec, scénarios disponibles, descriptions et
    références de builders ;
  - récupération du seul scénario nécessaire à la recette.
- Garder le résultat de recherche compact ; charger les détails des scénarios
  uniquement quand ils sont utiles.
- Éviter de générer un skill complet à chaque changement d'API. Le skill
  `craft-ts-guided-resume` reste le guide de procédure ; le catalogue MCP reste
  la source de vérité applicative.
- Le catalogue porte une version ou une empreinte stable afin que les recettes
  puissent détecter une référence périmée et afficher une erreur réparable.

**Sortie :** l'agent peut découvrir les actions et scénarios pertinents sans
charger toutes les fixtures dans son contexte.

### 6. Faire référencer les scénarios par les recettes

- Faire évoluer le profil réseau de recette pour accepter une référence stable
  (`operationId` + `scenarioId`) en complément ou à la place d'une réponse
  copiée dans le document.
- Résoudre la référence au lancement, construire les valeurs métier et les
  encoder au niveau transport.
- Permettre les variantes contrôlées (par exemple rôle admin/staff, donnée
  absente/présente) sans copier-coller de gros payloads dans chaque recette.
- Garder une option de snapshot versionné si une recette doit rester figée
  malgré l'évolution du catalogue ; stocker la version ou l'empreinte du
  scénario utilisée.

**Sortie :** la recette exprime le comportement attendu et choisit les scénarios
par nom ; elle ne réimplémente ni les builders ni la sérialisation.

### 7. Prévalider avant de marquer une recette « vérifiée »

- À l'enregistrement, valider statiquement : références connues, étapes
  supportées, `defaultCaseId` valide, appels couverts en mode mocké, attentes
  essentielles présentes, codecs compatibles.
- Depuis un onglet neuf, lancer une prévalidation contrôlée qui vérifie les
  routes, états nécessaires, mocks résolus et attentes de la recette.
- Refuser une recette sans état de départ prouvé. `goto` seul ne restaure pas
  les primitives, le storage ni les entités serveur.
- Exiger une pause `handoff` sans condition déjà vraie quand la personne doit
  observer l'écran. Pour les résultats visuels essentiels, prévoir des attentes
  sur les contrôles/textes accessibles ou déclarer clairement la limite.
- Confirmer `app.writes` vide lorsque `objective.mayWrite` est faux.
- Distinguer les statuts `brouillon`, `prévalidation échouée` et `vérifiée` dans
  le stockage et le dashboard. Une recette en échec reste réparable depuis
  l'étape fautive sans affaiblir ses attentes essentielles.

**Sortie :** aucune recette n'est présentée comme prête à relancer avant un run
qui a atteint les attentes essentielles et son point d'observation.

### 8. Migrer une application pilote et documenter

- Migrer d'abord `apps/demo-ecommerce` : catalogue, authentification, lecture
  d'administration et mutations protégées.
- Déclarer les scénarios de succès, rôles autorisés/interdits, erreurs métier
  et panne transport utiles à ces parcours.
- Remplacer les encodages/décodages manuels opaques par les codecs retenus, sans
  changer le comportement observable voulu.
- Documenter la règle dans le guide ESLint, le catalogue et le guide des
  recettes ; montrer avant/après et expliquer que le codec sert aussi à
  produire les mocks des recettes.
- Mettre à jour le plan
  [`2026-10-28-reprise-comportement-mockee.md`](./2026-10-28-reprise-comportement-mockee.md)
  quand la liaison catalogue-recettes est effectivement livrée.

**Sortie :** un parcours multi-rôles est généré, prévalidé, relancé depuis un
onglet neuf et reste isolé des données réelles.

### 9. Garder skills, prompts, outils MCP et documentation alignés

Traiter le catalogue codec/scénarios comme la source de vérité des données
d'application, et le skill comme la source de vérité du processus de reprise.
Ne pas maintenir une troisième copie manuelle des identifiants et payloads dans
les descriptions MCP.

| Changement | Artefacts à mettre à jour |
|---|---|
| Contrat d'un appel ou codec | Déclaration du contrat, catalogue généré, validation du codec ; pas de changement au skill sauf si la procédure change |
| Nouveau scénario, builder ou permission | Catalogue de scénarios, descriptions orientées comportement, compatibilité des références de recettes |
| Sémantique ou paramètres d'un outil MCP | Schéma et description dans `packages/function-registry-mcp`, tests du contrat MCP, invite `packages/log-mcp/src/resume-prompt.ts`, skill guided-resume et guide public si le workflow visible change |
| Étapes, prérequis ou stratégie de validation d'une recette | `craft-ts-guided-resume/SKILL.md`, invite MCP, guide public et évaluations de parcours agent |
| Convention de création ou de test des règles ESLint/architecture | Skill `craft-create-eslint-architecture`, guide de règles et modèles de tests |

- Garder dans le skill les décisions procédurales stables : interroger le
  catalogue, ne pas inventer de mock, valider depuis un onglet neuf, vérifier
  les attentes et laisser une pause observable lorsque nécessaire.
- Garder dans l'outil MCP une description courte de son contrat. Charger les
  détails d'un codec ou scénario depuis le catalogue à la demande.
- Éviter les mises à jour artificielles du skill pour chaque nouvelle API. Si
  le processus n'a pas changé, le catalogue et son empreinte suffisent.
- Ajouter un contrôle de fraîcheur qui régénère le catalogue et échoue en CI si
  les artefacts suivis ne correspondent plus aux contrats source.
- Vérifier les références de scénarios enregistrées : un scénario retiré est
  déprécié avec une migration ou invalide la recette avec une erreur explicite,
  jamais remplacé silencieusement par un autre jeu de données.
- Ajouter des évaluations synthétiques de l'agent sur quelques tâches
  représentatives. Elles vérifient qu'il consulte les bons outils, sélectionne
  un scénario déclaré, n'invente pas de réponse transport, prévalide la recette
  et n'annonce pas comme vérifiée une exécution incomplète.
- À chaque changement de schéma d'outil MCP, vérifier que l'invite MCP et le
  skill n'enseignent pas des paramètres ou étapes qui n'existent plus. À chaque
  changement de workflow, vérifier que les descriptions MCP ne prescrivent pas
  l'ancien chemin.

**Sortie :** chaque modification du contrat d'exécution met à jour ses
consommateurs concernés, tandis que l'ajout de données ne force pas à recopier
le catalogue dans le skill. La CI détecte les artefacts générés périmés et les
références de recette cassées.

## Critères d'acceptation

- Chaque appel externe Craft ciblé possède un codec qui sait encoder et
  décoder, ou une exemption documentée.
- Le graphe énumère les frontières et détecte les contrats/scénarios absents,
  dupliqués ou orphelins.
- Les cas métier décrivent leur intention, couvrent les permissions pertinentes
  et distinguent une erreur métier d'une panne de transport.
- Les builders produisent des données métier cohérentes ; le codec génère le
  format exact utilisé à la frontière réseau.
- L'agent peut trouver un scénario pertinent par une requête MCP ciblée, sans
  recevoir tout le catalogue.
- La recette référence des scénarios versionnés, prépare son état dans un
  onglet neuf, passe ses attentes essentielles et laisse une pause observable
  si demandé.
- En mode sans écriture, aucun appel d'écriture réel n'est envoyé.
- Le dashboard distingue une recette sauvegardée d'une recette vérifiée et
  donne l'étape précise en cas d'échec.
- Une modification de contrat ne laisse pas le catalogue généré, les recettes,
  les outils MCP, l'invite MCP ou le skill avec des informations contradictoires.
- Une évolution de données seule n'exige pas une modification du skill ; les
  agents obtiennent les nouveaux détails à la demande depuis le catalogue.

## Hors périmètre de la première version

- Générer automatiquement des builders complets pour tout modèle métier.
- Transformer chaque appel externe arbitraire (SDK tiers, `fetch` direct,
  WebSocket) en appel mockable sans déclaration explicite.
- Générer un skill par application ou embarquer toutes les données dans les
  prompts de l'agent.
- Garantir qu'un scénario de données suffit à prouver le comportement visuel de
  l'interface : cela reste le rôle du run de prévalidation et des attentes UI.

## Ordre recommandé

1. Contrat codec et inventaire des frontières.
2. Règle ESLint locale et assertion de graphe complémentaire.
3. Catalogue de scénarios et builders métier du pilote e-commerce.
4. Découverte MCP et références de scénarios dans les recettes.
5. Prévalidation obligatoire, statuts et retour d'erreur dans le dashboard.
6. Migration/documentation du pilote et règles de fraîcheur pour le catalogue,
   les outils MCP et les skills.
7. Évaluations synthétiques de l'agent, puis décision d'étendre les transports.
