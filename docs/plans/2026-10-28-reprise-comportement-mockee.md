# Reprise comportementale mockée

## Analyse de la reprise observée

Dans `Reprendre la session avant l’évén. ኟ`, l'objectif s'est précisé en
retrouvant la formule « La pause café », avec croissant et donut sélectionnés,
puis en laissant la personne faire elle-même l'ajout au panier. L'agent a
d'abord échoué sur un onglet déjà marqué replay, a ouvert un onglet propre,
puis a reconstruit l'écran et sauvé un checkpoint temporaire. La conversation
ne contient ni `recipe.save` ni `recipe.run` : aucun script réutilisable n'a
été livré ou vérifié. L'expiration annoncée était celle du checkpoint, pas une
garantie de répétabilité.

## Modèle visé

- **Reprise fonctionnelle** : retrouver le point sur le serveur courant et
  continuer avec les données réelles, dans la barrière d'écriture existante.
- **Test comportemental mocké** : exploiter l'état et les réponses enregistrés
  pour atteindre le point, puis choisir les résultats des prochains appels
  Craft sans envoyer de requêtes aux API de l'application.
- **Choix ponctuel** : `recipe.run` ou `recipe.network` reçoit `mockChoices`.
- **Choix mémorisé** : la recette conserve `defaultCaseId`; les cas doivent
  couvrir au moins un succès et un échec pour chaque appel déclaré.
- **Connexion réelle puis mocks** : une étape de recette
  `{ "type": "network", "mode": "mocked" }` placée après le relais humain
  maintient la connexion réelle, puis active les mocks avant le parcours testé.
- **Échec fermé** : tout appel Craft non déclaré et tout `fetch`/XHR applicatif
  non-Craft échoue en mode mocké. Le serveur de logs reste joignable pour
  enregistrer l'exécution.

## Première tranche livrée

- Le skill et le prompt MCP demandent si l'objectif est une reprise réelle ou
  un test comportemental isolé.
- Le modèle de recette stocke un profil réseau versionné implicitement avec
  ses cas `success`, `exception` et `failure` ; le serveur refuse les profils
  mockés sans succès ou échec.
- `recipe.run` accepte des remplacements ponctuels et garde les choix pendant
  une exécution supervisée. `recipe.network` active le profil après la
  restauration d'un checkpoint valide, sans rejouer la recette.
- Les clients HTTP Craft et `createServerFunctionClient` passent par la
  barrière de reprise. Les requêtes non-Craft de l'application restent
  bloquées.

## Intégrations à faire ensuite

Les règles `visual.app` du graphe couvrent déjà des fixtures d'API et des
exceptions pour leurs scénarios, mais le stockage durable des recettes est
séparé de ce graphe. Cette tranche garde les valeurs des cas dans la recette :
elle ne les importe pas encore depuis les fichiers de fixtures validés par le
graphe et ne peut donc pas vérifier que chaque discriminant déclaré par un
contrat API possède son cas exact. La suite devrait remplacer ces valeurs par
des références à un catalogue de fixtures typé, puis faire vérifier les
références par le graphe.

La sélection est pilotée par l'agent au moyen de `mockChoices`; cette tranche
n'ajoute pas encore de sélecteur visuel au dashboard. Le dashboard conserve le
suivi de reprise et d'exécution de recettes.
