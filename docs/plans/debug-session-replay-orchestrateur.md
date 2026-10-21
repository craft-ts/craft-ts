# Plan : replay orchestré et snapshots de reprise

## Objectif

Faire du replay un plan d’exécution explicite qui reconstruit le chemin applicatif enregistré, attend les résultats et vérifie les observations associées. Ajouter des snapshots versionnés comme points de reprise pour éviter de rejouer toute la session.

Le replay doit continuer d’utiliser les frontières applicatives normales : le routeur crée les composants, les méthodes Craft exécutent les opérations, et les adaptateurs de transport fournissent les résultats enregistrés. Il ne doit pas construire manuellement des instances de composants ni envoyer de requêtes réseau réelles en fallback.

## Principe du contrat

L’archive distingue deux catégories d’événements :

- **Commandes** : ce que le replay doit exécuter, comme naviguer, invoquer une méthode, activer un nœud différé ou restaurer un snapshot.
- **Observations** : ce que l’application a effectivement fait, comme charger une route, créer un composant, entrer en état pending, modifier un état Craft ou terminer une requête.

L’orchestrateur exécute les commandes et vérifie les observations attendues. La création des composants reste prise en charge par le routeur et le cycle normal de l’application.

## Étape 0 — Établir la base de départ

### Travail

- Relever les écarts de replay actuels et examiner les changements locaux non commités avant toute modification.
- Conserver les cas connus de navigation, mutation, état pending, transports et reprise après rechargement comme scénarios de référence.
- Documenter les limites actuelles de chaque mécanisme : commandes exécutables, observations seules et états restaurables.

### Critère de sortie

Une liste de cas représentatifs et un état du code de départ clairement identifié.

## Étape 1 — Définir un format d’événements explicite

### Travail

Concevoir un contrat d’archive versionné avec des types distincts pour les commandes et les observations.

Chaque commande devrait contenir au minimum :

- un identifiant d’opération;
- son type et sa charge utile — par exemple route, adresse de méthode et arguments;
- le temps de départ enregistré;
- ses dépendances causales;
- les conditions qui marquent sa fin;
- son état de rejouabilité, notamment si des arguments requis sont absents ou expurgés.

Les observations devraient référencer l’opération concernée lorsqu’elle est connue. Les commandes doivent conserver un graphe causal : les opérations concurrentes peuvent se chevaucher, mais leur ordre relatif doit rester déterministe.

### Critère de sortie

L’archive indique explicitement quelles actions exécuter, lesquelles peuvent avancer en parallèle et quelles observations doivent confirmer leur résultat.

## Étape 2 — Capturer les commandes aux frontières applicatives

### Travail

Ajouter ou compléter l’instrumentation là où l’application possède réellement l’action :

- appels de méthodes Craft, avec adresse, arguments et opération parent;
- navigations et tentatives de navigation, avec destination et options;
- activations de composants différés;
- démarrage, succès, échec et annulation des opérations asynchrones.

En parallèle, enregistrer la création et la destruction des composants comme **observations**. Leur identité doit permettre de les relier à une route et à une opération de replay.

### Critère de sortie

Un scénario de navigation ou d’interaction produit une commande complète, ses observations associées et une causalité exploitable. Les appels enfants ne sont ni omis ni invoqués deux fois.

## Étape 3 — Construire et valider le plan avant exécution

### Travail

Ajouter un compilateur qui transforme l’archive en graphe de commandes et de barrières. Il détecte avant l’exécution :

- les commandes sans cible ou avec des arguments incomplets;
- les routes et méthodes inconnues ou ambiguës;
- les opérations sans résultat asynchrone enregistré;
- les dépendances causales impossibles à satisfaire;
- les transports non pris en charge.

Le résultat précise si la session est entièrement rejouable, partiellement exploitable ou non rejouable, avec la cause.

### Critère de sortie

Les défauts connus de l’archive sont signalés avant que le replay ne modifie l’application.

## Étape 4 — Mettre en place l’orchestrateur

### Travail

L’orchestrateur parcourt le graphe et exécute chaque commande via son propriétaire applicatif :

- `navigate` passe par le routeur;
- `invoke` passe par le registre d’invocations Craft;
- l’activation passe par le mécanisme différé correspondant;
- les réponses HTTP et transport sont injectées par les adaptateurs enregistrés.

Il attend ensuite les conditions de fin associées : résultat du routeur, fin d’opération, observation de cycle de vie ou checkpoint d’état. Il ne passe à la suite qu’une fois la barrière satisfaite ou déclarée en échec.

La timeline conserve les temps enregistrés à l’aide d’une horloge virtuelle commune. La durée réelle peut être plus longue que celle de la capture; l’ordre causal et le temps de livraison des effets restent la référence.

### Critère de sortie

Une étape ne se termine pas uniquement parce qu’un délai est écoulé ou que la route semble affichée. Elle se termine quand son opération et ses observations attendues sont réglées.

## Étape 5 — Faire des snapshots des points de reprise versionnés

### Travail

Définir un snapshot comme un ensemble de données sérialisables et restaurables :

- route et paramètres de navigation;
- état des primitives Craft et des persisters enregistrés;
- stockages navigateur que l’application peut capturer et restaurer;
- versions de l’application et du format, ainsi que les capacités de restauration;
- opérations en cours, si leur reprise est explicitement prise en charge.

Commencer par des snapshots pris à des points stables, sans opérations asynchrones en cours. Pour le premier périmètre, reconstruire l’arbre de composants à partir de la route et de l’état restaurés, au lieu de sérialiser les instances de composants.

Chaque type d’état doit avoir un lecteur et un restaurateur. Un snapshot incomplet ou incompatible est refusé comme point de reprise fiable.

### Critère de sortie

L’application repart d’un snapshot validé, puis rejoue uniquement les commandes qui le suivent.

## Étape 6 — Adapter le dashboard et les diagnostics

### Travail

Le dashboard affiche les commandes exécutées et les observations qui les valident, avec leur état : en attente, réussi, divergent ou non rejouable. En cas d’échec, il indique la commande concernée, sa causalité, les événements attendus et observés, ainsi que l’écart de temps éventuel.

La timeline visuelle reste disponible pour montrer le contexte de la session, mais son affichage est distinct de l’exécution des commandes.

### Critère de sortie

On peut distinguer une commande non exécutée, une observation manquante, une opération encore en cours et un résultat réellement différent.

## Étape 7 — Migrer les archives et déployer par étapes

### Travail

- Introduire une nouvelle version d’archive et valider explicitement les anciennes versions.
- Convertir ou remplacer les scénarios de référence avant de retirer progressivement l’ancien chemin.
- Exécuter d’abord le nouveau moteur en mode diagnostic pour comparer les résultats.
- Choisir le nouveau moteur comme mode principal une fois les scénarios de référence acceptés.

Le périmètre initial couvre une navigation, une mutation réussie et une échouée, un chargement pending, une activation différée et une réponse transport enregistrée.

### Critère de sortie

Le replay orchestré passe les scénarios de référence, bloque les transports non enregistrés et explique les divergences à l’échelle d’une commande.

## Résultat visé

Une archive devient un plan exécutable et vérifiable : chaque commande a une cause, une frontière d’exécution et une condition de fin. Un snapshot fournit un point de départ versionné pour reprendre la session, sans promettre de restaurer des objets runtime que l’application ne sait pas sérialiser.
