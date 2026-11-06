# Pourquoi CraftTS monte plus lentement que Foldkit

Le diagnostic pointe principalement le **nombre de structures créées pour chaque
ligne** : injecteurs, scopes d'effets, signaux, façades d'entrées et identités.
Foldkit utilise ici des fonctions de vue ordinaires sur un modèle central, puis
un patch DOM. CraftTS initialise un graphe réactif et des scopes par instance.

Une campagne limitée à ces deux frameworks confirme l'écart dans la même session.
Le contrôle hors DOM connecté ne le résout pas. Le Virtual DOM de Foldkit, ses
caches ou son usage d'Effect n'expliquent donc pas à eux seuls son montage rapide.

## Mesure commune et contrôles

Runtime CraftTS `e135eeec9f29c8daf6031d32bec780f9c8d99d6e`, Foldkit 0.170.0,
Effect 4.1.2, Vite 8.3.1, Node v22.23.0, Apple M3,
Chromium 153.0.8010.12. Bundles de production minifiés. Le runtime du worktree
et les paquets installés ne sont pas modifiés par les sondes.

Scénario commun : une ligne avec `data-row` et son libellé, sans position affichée,
1 000 ou 5 000 items. Même reducer, même CSS et mêmes données, définis avant le
chronomètre. On mesure l'initialisation jusqu'à la notification DOM, avant peinture.
Trois contextes navigateur neufs par couple framework/taille, ordre alterné.
Le texte, l'ordre et les IDs sont vérifiés après le montage.

| Lignes | CraftTS, montage | Foldkit, montage | CraftTS, tas JS après GC | Foldkit, tas JS après GC |
| -----: | ---------------: | ---------------: | -----------------------: | -----------------------: |
|  1 000 |         57,20 ms |          8,60 ms |                22,41 Mio |                 3,09 Mio |
|  5 000 |        245,50 ms |         15,90 ms |               102,89 Mio |                 5,35 Mio |

Ce sont des médianes au montage, dans cette campagne. Le tas JS exclut notamment
le stockage natif du DOM ; ce n'est pas la mémoire totale du processus.
Aucun framework tiers n'a été relancé. Les deux implémentations parcourent toute la liste ; ces deux tailles ne
prouvent pas une complexité quadratique du montage.

## 1. Les unités de travail diffèrent

### Foldkit : un modèle et un runtime pour l'application

Dans notre fixture, le démarrage initialise le runtime Effect, le modèle et la
subscription des contrôles. Le renderer appelle la vue, qui parcourt le tableau.
Chaque `rowView(row, position, h)` lit des champs ordinaires et construit des
VNode. `h.keyed('div')(row.id, ...)` donne l'identité des frères ; le patch
construit ensuite les éléments et le texte.

Le runtime dispose bien de services, scopes, fibers et structures de cycle de vie.
Dans **cette vue simple**, il ne crée pas un injecteur, une fiber Effect ou un
observateur réactif pour chaque libellé. Il n'y a ni Submodel ni Mount par ligne.
Les fonctions de vue ne sont pas des instances de composants avec scope DI.

Sources du paquet installé : `foldkit/dist/runtime/runtime.js:26`,
`runtime/renderer.js:183`, `html/index.js:1509`, `snabbdom/init.js:118`.
L'appel initial de `render(initModel, ...)` précède la boucle d'interaction ;
le délai normal de `requestAnimationFrame` des mises à jour n'explique donc
pas l'écart de montage.

### CraftTS : un sous-graphe réactif pour chaque ligne

L'entrée `forNode` crée un signal d'index, un lecteur, un contexte, un fragment
et un effet de rendu. Le composant Row crée son injecteur, ses signaux d'entrées,
ses façades/proxies et son effet de rendu. L'attribut `data-row` et le texte
créent chacun leur binding/effet. Chaque effet simple crée actuellement aussi
un injecteur taggé, alors que son exécution utilise déjà l'injecteur propriétaire.

Le [diagnostic précédent](2026-11-05-mount-cost-diagnosis.md) a compté au montage,
avec la même fixture CraftTS :

| Structure/appel CraftTS             | 1 000 lignes | 5 000 lignes |
| ----------------------------------- | -----------: | -----------: |
| Injecteurs                          |        5 017 |       25 017 |
| Enregistrements de providers        |       36 142 |      180 142 |
| Rapports d'effets actifs            |        4 003 |       20 003 |
| Signaux créés                       |        4 004 |       20 004 |
| Exécutions du moteur de générateurs |        7 009 |       35 009 |
| Créations d'identité                |        5 003 |       25 003 |
| Encodages de segments d'identité    |       34 009 |      170 009 |

Ces compteurs ne sont pas déduits du ratio de temps entre frameworks. Ils
proviennent de sondes séparées, détaillées dans le rapport précédent.
Les entrées `row`, `position` et les propriétés d'hôte ont leur signal même
quand l'index n'est pas affiché. Le signal d'index du `forNode` existe aussi.
Foldkit passe ici une valeur ordinaire ; le cache reçoit zéro si elle est inutilisée.

Les lecteurs `yield*` traversent le mécanisme générique de résolution des valeurs,
avec contexte d'injection et reconnaissance des générateurs. Le coût observé porte
sur cette chaîne et ses allocations ; aucune mesure n'isole le coût du mot-clé
JavaScript `yield*` lui-même.

## 2. Le DOM visible est identique, son infrastructure ne l'est pas

Les comptages suivants viennent de nouvelles navigations, instrumentées à part.
Les durées de ces navigations ne servent pas au classement.

| Ressource/opération au montage, 1 000 lignes | CraftTS |      Foldkit |
| -------------------------------------------- | ------: | -----------: |
| Éléments utiles créés                        |   1 001 |        1 001 |
| Nœuds texte créés                            |   1 000 |        1 000 |
| Commentaires conservés sous `#mount`         |   4 004 |            0 |
| Appels `createComment`                       |   4 004 | 1 temporaire |
| Appels `insertBefore`                        |   6 005 |            1 |
| Appels `appendChild`                         |       0 |        2 000 |

À 5 000 lignes, CraftTS conserve **20 004 commentaires**, soit 30 005 nœuds sous
`#mount`, contre 10 001 pour Foldkit. Les deux paires d'ancres par ligne proviennent
du fragment d'entrée `forNode` et du fragment de composant. Elles délimitent des
plages capables de devenir vides, multiples, suspendues ou déplacées.

Foldkit construit les descendants avec `appendChild` sur des parents détachés,
puis insère la racine ; son commentaire de remplacement est supprimé. Dans ce
montage CraftTS, les 6 005 insertions passent par des parents déjà connectés.
Cela n'implique pas 6 005 layouts : le navigateur peut regrouper ce travail.
Les compteurs couvrent les méthodes natives enveloppées, pas tous les chemins
possibles d'écriture DOM ni leurs coûts CPU.

### Contrôle causal : détacher le montage ne suffit pas

Une sonde garde **toutes** les structures CraftTS, détache seulement `#mount`
pendant le bootstrap, puis le rattache avant la notification mesurée. Le temps
inclut détachement et rattachement. Cinq navigations par cellule, ordre alterné :

| Lignes | Montage connecté | Montage détaché puis rattaché |
| -----: | ---------------: | ----------------------------: |
|  1 000 |         57,60 ms |                      55,30 ms |
|  5 000 |        236,00 ms |                     236,00 ms |

Les compteurs confirment que les insertions de la variante détachée n'ont plus
lieu dans un parent connecté. Le nombre d'ancres, d'insertions, de signaux et
l'initialisation du runtime restent identiques. À 5 000 lignes, une navigation
détachée atteint 324,10 ms ; elle est conservée dans les données. La médiane
n'indique aucun gain à cette taille. Le lien au document n'explique donc pas
l'essentiel de l'écart. Ce test ne mesure pas le gain d'une suppression des ancres.

Cette sonde n'est pas une implémentation proposée : des hooks, services ou
requêtes DOM peuvent observer `isConnected` et nécessiter le montage connecté.
Elle valide ce scénario de données, pas l'ensemble des contrats du framework.

## 3. Identités, tags et pression d'allocation

CraftTS calcule des chemins déterministes, réencode leurs segments et associe
les scopes à des tags et des cibles runtime. `childCraftRenderIdentity` recopie
et réencode aujourd'hui le chemin complet du parent. L'injecteur taggé reconstruit
ses tags, providers et inscriptions de destruction pour chaque effet.

Foldkit possède aussi des identités : clés de liste et identité de fonction
apposée aux VNode par son plugin de build. Elles ne correspondent pas au même
graphe d'adresses par binding ni aux mêmes enregistrements que CraftTS.
Ses DevTools ne sont pas configurés dans cette fixture. CraftTS conserve ses
rapports d'effets et cibles runtime en mode production dans le scénario mesuré.
La granularité et les fonctionnalités réellement initialisées diffèrent donc.

Les six profils CPU de montage, pris après les imports, confirment les familles
attendues :

- CraftTS : `createNativeCraftInjector`, `ɵcreateHostTaggedInjector`, résolution
  `get`, `encodeHydrationSegment`, `createCraftRenderIdentity`, `brand` des signaux,
  reconnaissance/exécution des générateurs, cibles replay et collecte mémoire.
- Foldkit : construction des VNode (`buildElement`, `buildVNodeData`), cache de vue,
  `createElm`, attributs et appels DOM. Le runtime Effect reste présent au démarrage.

Ces profils utilisent des bundles de production **non minifiés**, des sources maps,
un CPU ralenti ×4 et un échantillonnage de 100 µs, trois fois par framework à 5 000
lignes. Les imports sont terminés avant le déclenchement du profiler. Les noms
`(program)` et les frames sans nom restent partiellement inattribués ; on ne
convertit pas ces profils en pourcentages exacts du montage minifié. La collecte
et le tas JS plus élevé sont cohérents avec la pression d'allocation de CraftTS.

## 4. Le cache de Foldkit ne rend pas le premier montage gratuitement

Au premier montage, les entrées `createKeyedLazy` manquent toutes dans le cache.
Un contrôle remplace uniquement la consultation du cache par l'appel direct à
`rowView`, en conservant les clés et le DOM. Trois navigations par taille :

| Lignes | Foldkit de référence | Appel de vue sans cache |
| -----: | -------------------: | ----------------------: |
|  1 000 |              8,60 ms |                 7,80 ms |
|  5 000 |             15,90 ms |                14,40 ms |

Ces variantes ont été mesurées dans la même session, en blocs distincts ; l'écart
modeste n'est pas une garantie de gain. Ce contrôle confirme surtout que le cache
n'explique pas le montage rapide. Le cache sert aux mises à jour suivantes.

Avec les hooks publics `slow` de Foldkit activés seulement dans une autre sonde,
le montage de 5 000 lignes se répartit en médianes de **5,50 ms pour la vue** et
**6,90 ms pour le patch**, pour un total observé de **15,80 ms**. À 1 000 lignes :
2,90 et 2,30 ms, total 8,20 ms. Le reste comprend le démarrage et la notification.
Les médianes de phases et de total ne constituent pas une décomposition additive
exacte ; les mesures restent dans leur campagne instrumentée.

## 5. Ce que CraftTS peut en tirer

1. **Éviter les scopes dédiés des effets simples.** Le prototype précédent
   conserve les rapports et tags, passe de 5 017 à 1 014 injecteurs à 1 000 lignes
   et réduit le montage de 17 à 24 % dans sa campagne. Extraire le calcul pur des
   tags et garder les scopes pour les factories génératrices. Ce gain mesuré
   n'explique qu'une partie de l'écart total avec Foldkit.
2. **Réduire les structures d'entrées inutilisées.** Étudier l'allocation à la
   première lecture des façades/signaux et du lecteur réactif d'index, avec un
   chemin léger pour les composants sans providers ni composition. Préserver
   lectures tardives, changements d'entrée, DI et cycles de vie. Gain non mesuré.
3. **Réemployer les préfixes d'identité.** La sonde précédente, conservant
   l'encodage immédiat, donne environ 5–6 % sur les gros cas. Garder le contrat
   des parents structurels, de l'Unicode et des erreurs URI. Priorité secondaire.
4. **Spécialiser les plages à racine unique.** Les quatre ancres par ligne
   constituent une piste concrète pour diminuer créations et objets conservés.
   Il faudrait conserver les variantes vides/multiples, pending, hydratation et
   permutations. Aucun gain n'est attribué ici à cette refonte non implémentée.

Les rapports d'effets et le replay peuvent être conservés par la première piste.
Leurs suppressions isolées n'avaient donné que de petits gains dans les sondes
précédentes. Le volume des scopes et leur mise en place sont plus prometteurs.

Un compilateur pourrait générer des chemins spécialisés et certaines métadonnées,
mais le montage Foldkit observé passe par des helpers TypeScript, des VNode et
un patch runtime. Son plugin marque les identités de fonctions ; il ne transforme
pas cette vue en instructions DOM directes. Ce contre-exemple montre qu'une
réduction importante des coûts par ligne est possible dans un runtime.

## Sources et reproduction

- [Fixture CraftTS](../../apps/framework-benchmark/src/craft/main.ts).
- [Fixture Foldkit](../../apps/framework-benchmark/src/foldkit/main.ts).
- [Runner de diagnostic](../../apps/framework-benchmark/mount-paths.mjs).
- [Effets et scopes](../../libs/core/src/lib/craft-effect.ts).
- [Injecteurs taggés](../../libs/core/src/lib/craft-service.ts).
- [Composants, forNode, fragments et bindings](../../libs/component/src/lib/render/interpreter.ts).
- [Identités](../../libs/core/src/lib/craft-render-identity.ts).
- [Architecture Foldkit](https://foldkit.dev/core/architecture),
  [runtime](https://foldkit.dev/core/runtime),
  [mémorisation](https://foldkit.dev/core/view-memoization).
- [Statistiques et compteurs](2026-11-05-foldkit-craft-mount-summary.json).
- Mesures et profils : `tmp/foldkit-mount-paths/results.json`,
  `tmp/foldkit-mount-paths/*.cpuprofile`,
  `tmp/foldkit-mount-paths-staging/results.json`.

```sh
node apps/framework-benchmark/mount-paths.mjs
MOUNT_PATHS_MODE=staging MOUNT_PATHS_OUTPUT=tmp/foldkit-mount-paths-staging node apps/framework-benchmark/mount-paths.mjs
```

**58 navigations de diagnostic validées**, incluant 12 montages de référence,
4 comptages, 6 sondes de phases, 6 contrôles sans cache et 6 profils, puis
20 montages et 4 comptages pour le contrôle de détachement. Les sondes ne changent
pas les sources Core/Component ni les paquets installés ; seules les copies
construites reçoivent les transformations nécessaires. Aucun correctif runtime
intégré, aucune nouvelle campagne React/Vue/Svelte/Solid, aucun commit ni push.
