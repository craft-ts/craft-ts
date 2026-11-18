# Coûts de structure : racines, injecteurs, contextes et identités

6 novembre 2026. Commit : `e135eeec9f29c8daf6031d32bec780f9c8d99d6e`. Worktree de benchmark isolé ; aucun autre framework remesuré. Aucune intégration dans les bibliothèques du checkout.

**Pas de nouveau saut au montage.** La combinaison légère gagne 2,4 % à 5 000 lignes sans index dans cette série ; avec index, les distributions se recouvrent et ne permettent pas de promettre un gain. Le résultat utile est ailleurs : le cache du nœud racine retire le surcoût observé sur les mises à jour ponctuelles, et les déclarations de providers partagées réduisent les allocations et le heap.

## Méthode

Référence remesurée : `more-best`, meilleure combinaison de la campagne précédente. Trois navigations par case au tri initial, puis cinq par case pour la confirmation. Quatre cases : 1 000 et 5 000 lignes, avec/sans index affiché. Builds minifiés de production, nouveaux contextes Chromium, ordre mélangé avec graine fixe, même machine et commit. Les imports et le modèle initial restent hors de la fenêtre de montage.

192 navigations de timing : 72 au tri initial, 120 à la confirmation. 30 navigations finales de compteurs, séparées des timings. Les deux jeux de fixtures de contrats exécutent 48 scénarios dans les campagnes de timing, plus les smokes archivés. Les actions ont deux passages de chauffe puis quatre passages mesurés par navigation. Le montage est mesuré jusqu’à l’observation des mutations DOM, avant peinture ; ce n’est pas une mesure INP.

Trois profils préalables de `more-best` sur 5 000 lignes sans index ont orienté les pistes : construction des identités, empreintes de replay, recherches DI, construction des injecteurs et copies de contexte. Les profils lisibles avec CPU ×4 servent à attribuer des fonctions, pas à fournir des pourcentages exacts du montage minifié. Sources, profil et agrégation : `tmp/mount-shape/profile/`.

## Confirmation du montage et du heap

`shape-lean` = cache des racines + identités à arité spécialisée + déclarations de providers réutilisées. `shape-compact` ajoute la table de tokens partagée à méthodes de classe ; elle n’améliore pas le bilan global.

| Lignes | Index | Référence | Combinaison légère | Avec table de tokens | Heap référence → légère |
|---:|:---:|---:|---:|---:|---:|
| 1000 | non | 23,0 ms | 23,4 ms | 23,5 ms | 8,8 → 8,4 Mio |
| 1000 | oui | 25,1 ms | 25,3 ms | 25,7 ms | 9,2 → 8,9 Mio |
| 5000 | non | 67,2 ms | 65,6 ms | 66,7 ms | 34,4 → 33,1 Mio |
| 5000 | oui | 77,9 ms | 77,0 ms | 77,9 ms | 36,0 → 34,7 Mio |

À 5 000 lignes sans index : référence 66,6–68,8 ms, légère 64,8–66,3 ms. Avec index : référence 76,5–80,9 ms, légère 75,6–79,2 ms. Les petits cas ne progressent pas ; la combinaison légère y ajoute environ 0,2–0,4 ms à la médiane. Il faut donc conserver les effets par scénario, sans annoncer un gain général sur la base du meilleur cas.

Le heap JS est relevé après les actions et un GC forcé. La réduction de la combinaison légère est d’environ 1,27 Mio sur les deux grands cas, soit 3,5–3,7 %. Il ne s’agit ni du pic mémoire ni de la mémoire native totale du DOM.

## Pistes isolées

| Piste | Campagne | 5 000 sans index | Référence | 5 000 avec index | Référence |
|---|---|---:|---:|---:|---:|
| Racines mises en cache | confirm | 67,7 ms | 67,2 ms | 78,9 ms | 77,9 ms |
| Table de tokens, méthodes par instance | screen | 68,7 ms | 66,8 ms | 79,0 ms | 77,8 ms |
| Table de tokens, méthodes partagées | confirm | 68,0 ms | 67,2 ms | 78,5 ms | 77,9 ms |
| Contextes normalisés | screen | 66,3 ms | 66,8 ms | 78,5 ms | 77,8 ms |
| Identités à un/deux segments | screen | 66,9 ms | 66,8 ms | 76,3 ms | 77,8 ms |
| Déclarations de providers partagées | confirm | 67,9 ms | 67,2 ms | 77,6 ms | 77,9 ms |

### 1. Cache du nœud racine

Une entrée de liste empruntant la racine d’un composant devait retrouver cette racine à travers plusieurs objets à chaque lecture de ses bornes. Le prototype garde le nœud natif après le patch de l’unique enfant préparé. Il réactualise le cache quand l’enfant est remplacé et l’invalide avant la promotion en fragment ordinaire. Les sorties multiples/vides restent ancrées après promotion. Les tests remplacent le type du composant en gardant la clé, inversent la liste, la vident puis la restaurent pour vérifier l’absence de racine obsolète.

Ce cache ne réduit pas le nombre de composants, d’effets ou de nœuds. Les compteurs exigent N caches de racine renseignés au montage de N lignes. Il n’améliore pas le montage seul dans la confirmation, mais retire l’essentiel du surcoût sur les actions ponctuelles.

### 2. Table des tokens partagée

Les injecteurs d’un même composant ont souvent les mêmes tokens dans le même ordre. Le prototype compile une table token → position, gardée faiblement par fonction de composant. Chaque injecteur conserve son propre tableau de records, ses valeurs, ses caches de factories, son cache de valeurs par défaut, ses enfants et ses callbacks de destruction. Aucun résultat de factory n’est partagé entre propriétaires.

La première version créait trois méthodes par table. Une seconde version utilise une classe pour partager ces méthodes. Les compteurs confirment une compilation de layout pour 1 000 tables de composants. Un changement de structure recompile le layout sans modifier ceux des injecteurs déjà montés ; les tokens inattendus disposent d’un overflow privé.

Les deux versions sont moins convaincantes que la Map native : la première ralentit les grands montages, la seconde ne gagne pas et n’économise qu’environ 0,13 Mio à 5 000 lignes par rapport à sa référence dans cette confirmation. À fonctionnalités conservées, ajouter une indirection de table n’est pas automatiquement avantageux. Ce résultat ne prouve pas qu’un scope compilé plus spécialisé serait toujours lent.

La représentation de records est privée et n’implémente que les opérations `get/set/clear` utilisées par l’injecteur natif. Son cast vers Map est propre au prototype : une éventuelle intégration demanderait une abstraction de table explicite plutôt que de publier une Map partielle.

### 3. Contextes de rendu normalisés

Le clone par spread est remplacé par un objet contenant tous les champs déclarés de RenderContext, dans un ordre fixe, puis les overrides. L’objectif était de stabiliser sa forme pour le moteur JavaScript. Les propriétés optionnelles absentes deviennent des propriétés propres valant undefined, ce qui change leur présence lors d’une énumération même si leur lecture est identique. La nouvelle forme ne donne pas de gain régulier et retient davantage de mémoire sur les grandes listes. Piste écartée.

Les tests couvrent les callbacks de boundaries, les références lexicales, les identités, les scopes et les overrides explicites vers undefined, en plus de la suite Component. Ils ne présentent pas l’énumération des propriétés comme inchangée.

### 4. Identités à arité spécialisée

Les cas à un ou deux segments évitent les passages génériques par map et join pour normaliser les segments et construire le suffixe d’hydratation. La copie de chemin par spread est conservée. Les deux conversions en string précèdent l’encodage URI dans le cas à deux segments. Les parents non construits par le runtime gardent le repli original ; les suffixes plus longs gardent le chemin générique.

Les résultats isolés sont faibles et variables. Les clés d’hydratation, les empreintes de replay, les segments vides/Unicode, le rejet immédiat d’UTF-16 invalide pour l’hydratation et les parents fournis structurellement restent couverts par les contrats existants. Les adresses sérialisées ne sont pas raccourcies et le suivi de replay n’est pas désactivé.

Le premier smoke utilisait concat pour copier le chemin. Avant les timings, cette modification a été retirée afin de garder les règles de copie précédentes. Les campagnes screen/confirm et les compteurs finaux utilisent tous la version avec spread.

### 5. Déclarations de providers réutilisées

Deux éléments invariants sont réutilisés : les trois déclarations standards d’environnement dont la factory reçoit son injecteur, et le groupe HostName/HostTagList pour une même fonction de composant et un même nom. Les données propres à chaque instance — DestroyRef, ElementRef, identité de rendu, records et résultats des factories — restent locales.

Le cache de déclarations de host est une WeakMap ; si le nom change, la déclaration est reconstruite. La factory des tags continue à lire le parent et à attribuer l’ordinal de chaque instance au moment de sa résolution. À 1 000 lignes, les appels de création de recettes de service passent de **2 018 à 1 019** : 1 000 demandes de recette de host, une seule construction. Le nombre de provider records reste **8 121** et le nombre d’injecteurs **1 014**. Il s’agit de réduire les allocations de configuration, pas de supprimer une portée DI.

Cette piste n’accélère pas le montage seule dans la confirmation ; son bénéfice le plus net est le heap, environ **34,36 → 33,02 Mio** à 5 000 lignes sans index. La campagne mesure la réutilisation du groupe host et celle des déclarations standards ensemble ; elle ne permet pas d’attribuer séparément leur part du gain.

## Actions : la régression ponctuelle est réduite

| Index | Action, 5 000 lignes | Référence | Cache de racine seul | Combinaison légère |
|:---:|---|---:|---:|---:|
| non | Une ligne | 1,3 ms | 1,0 ms | 1,0 ms |
| non | 10 % des lignes | 4,0 ms | 3,8 ms | 3,9 ms |
| non | Inversion | 5,8 ms | 5,9 ms | 5,8 ms |
| non | Filtrage | 8,2 ms | 8,3 ms | 8,3 ms |
| non | Restauration | 31,1 ms | 31,4 ms | 31,1 ms |
| oui | Une ligne | 1,2 ms | 1,0 ms | 1,0 ms |
| oui | 10 % des lignes | 4,1 ms | 4,1 ms | 4,0 ms |
| oui | Inversion | 19,4 ms | 19,0 ms | 19,0 ms |
| oui | Filtrage | 14,6 ms | 14,8 ms | 14,0 ms |
| oui | Restauration | 40,8 ms | 40,8 ms | 40,7 ms |

Sans index, une ligne passe de 1,30 à 1,05 ms pour le cache seul et 1,00 ms dans la combinaison légère. Avec index : 1,20 → 1,00 ms. L’inversion reste autour de 5,8–5,9 ms sans index et 19 ms avec index. Ces mesures avant peinture ne constituent pas une évaluation complète de la latence perçue.

## Validation

- Tous les builds et toutes les pages des campagnes de timing/compteurs passent. Données, index, ordre et conservation des nœuds contrôlés après chaque action. Aucun effet actif ni ligne DOM après destruction.
- DOM inchangé par rapport à more-best : 4 commentaires, mêmes éléments et textes ; mêmes nombres d’effets et de scopes. Hash complet des tags d’effets et descripteurs de replay identiques après la séquence. Les cibles stables enregistrées dans une variante résolvent dans les autres fixtures.
- Cache de racine, table de providers et réutilisation des déclarations sont vérifiés par des compteurs d’activation, séparés des timings. Les contrats contrôlent le vidage/restauration, les sorties multiples/vides, le remplacement du composant, les providers locaux, ElementRef et le scheduling.
- **573 tests Component passent** pour shape-lean, shape-compact et shape-all. **68 tests Core ciblés** passent pour la combinaison légère, **73** pour les variantes avec tables. Les cinq contrats supplémentaires vérifient l’isolation des valeurs/factories entre propriétaires, le changement de layout sans altérer les anciens scopes, les providers dupliqués/multi/collection, null/undefined, les erreurs, les valeurs par défaut et le nettoyage après échec.
- Diagnostics TypeScript identiques au checkout avant patches : 13 côté Core et 1 côté Component. Aucun nouveau diagnostic ; les diagnostics préexistants ne sont pas présentés comme corrigés.
- Les tests de tags/cibles et les suites Component ne certifient pas le rejeu de toutes les archives existantes. Le plan de ligne et les optimisations des campagnes précédentes restent expérimentaux. Le cache de racine ne modifie pas l’ordre d’exécution supplémentaire introduit par les plages empruntées précédentes.

## Décision proposée

Retenir le cache de racine pour corriger le surcoût introduit par les plages empruntées, et examiner séparément les déclarations de providers partagées pour réduire les allocations. Les identités à arité spécialisée sont une amélioration limitée, à évaluer avec les petits cas. Écarter les tables de tokens et la normalisation des contextes dans leur forme testée : elles ajoutent du code sans avantage global convaincant. Cette campagne ne démontre pas un nouveau saut de performances au montage.

## Reproduire et revoir

```sh
npm --prefix apps/framework-benchmark run bench:mount-shape-prototypes
node apps/framework-benchmark/verify-mount-shape.mjs
VERIFY_VARIANT=shape-compact node apps/framework-benchmark/verify-mount-shape.mjs
VERIFY_STAGE=screen VERIFY_VARIANT=shape-all node apps/framework-benchmark/verify-mount-shape.mjs
```

Variables : `MOUNT_SHAPE_OUTPUT`, `MOUNT_SHAPE_SCREEN_RUNS`, `MOUNT_SHAPE_RUNS`. `MOUNT_SHAPE_SUMMARIZE_ONLY=true` agrège les campagnes existantes. Le profiler accepte désormais CRAFT_PROFILE_OUTPUT/REPORT/VARIANT/SOURCES ; pour reproduire le profil de cette campagne, utiliser la variante more-best archivée dans tmp/mount-more/confirm.

- [Orchestration](../../apps/framework-benchmark/mount-shape.prototype.mjs), [transformations des copies](../../apps/framework-benchmark/mount-shape-prototypes.mjs), [vérification](../../apps/framework-benchmark/verify-mount-shape.mjs).
- [Première table](../../apps/framework-benchmark/prototype-runtime/provider-layout.ts.txt), [version à méthodes partagées](../../apps/framework-benchmark/prototype-runtime/provider-slots.ts.txt), [contrats DI](../../apps/framework-benchmark/prototype-runtime/shape-owner.contracts.spec.ts.txt), [invalidation de la racine](../../apps/framework-benchmark/prototype-runtime/shape-component.contracts.spec.ts.txt).
- [Statistiques, compteurs et empreintes](2026-11-06-mount-shape-summary.json). Bruts : tmp/mount-shape/{screen,confirm,counts,smoke,refine-smoke}. Tests et types : tmp/mount-shape/*tests-shape-*.log, typecheck-comparison-shape-*.json, verification-summary-shape-*.json.

Les fichiers de libs/core et libs/component du checkout restent inchangés. Aucun commit ni push effectué.
