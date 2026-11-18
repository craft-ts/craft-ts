# Prototypes du coût minimal d'une ligne — 5 novembre 2026

**Trois pistes donnent un gain : supprimer l'effet d'une entrée explicitement
pure, réduire les ancres de composant et préparer la fabrique DOM de la ligne.**
Le propriétaire compact et les entrées paresseuses réduisent certaines allocations,
mais ne donnent pas de gain de montage stable dans les implémentations testées.

La combinaison retenue exclut ces deux derniers changements. Elle améliore le
montage d'environ **19 à 27 % supplémentaires** face aux deux optimisations déjà
mesurées (template au niveau du composant et effets simples sans injecteur dédié).
À 5 000 lignes avec index : **163,40 → 119,80 ms**. Face au runtime initial de la
même campagne, le montage passe de **301,90 à 119,80 ms**.

## Périmètre

- Commit **`e135eeec9f29c8daf6031d32bec780f9c8d99d6e`**, Apple M3,
  Node **v22.23.0**, Chromium **153.0.8010.12**.
- Bundles Vite 8.3.1 de production, CPU normal, mêmes données/reducer/CSS et DOM
  utile que les expériences précédentes. Les durées s'arrêtent à la notification
  DOM, avant peinture. Ni chargement complet, ni INP terrain.
- Toutes les modifications de bibliothèques s'appliquent uniquement à des copies
  temporaires. Le runtime du worktree reste inchangé.
- Tri initial : huit variantes × quatre configurations × trois navigations,
  soit **96 navigations**. Confirmation : quatre variantes × quatre configurations
  × cinq navigations, soit **80 navigations**.
- Quatre interactions mesurées par famille après deux de préchauffage ; filtrage
  et rétablissement séparés. Nouveau contexte navigateur par navigation ; ordre
  mélangé avec graine 535. Médianes groupées, sans seuil arbitraire de réussite.
- Comptages distincts : **24 navigations instrumentées**. Leurs temps ne servent
  pas au classement. Les builds sont préparés avant les mesures.
- Données, ordre, positions, identité DOM, absence d'erreurs page, résolution de
  la cible racine et destruction finale vérifiées après les actions.

La référence optimisée utilise un template au niveau du composant : lire les
inputs directement, puis retourner des valeurs ordinaires. Ces prototypes
n'établissent donc pas le gain de chaque piste avec tous les styles de template.

## 1. Entrée `forNode` explicitement pure

Le callback de notre fixture retourne `Row({row, position:index})` sans lire les
valeurs. Le prototype lui ajoute une marque explicite. Le renderer exécute ce
callback sans créer son effet `for-item` ; les effets des composants et des
bindings descendants restent indépendants. Un callback non marqué conserve le
chemin réactif actuel.

Il s'agit d'un **contrat opt-in**, pas d'une détection automatique de pureté. Un
callback qui lit lui-même un signal ne doit pas être marqué. Le contrôle vérifie
qu'un autre callback, non marqué et lisant un signal externe, continue de réagir.

À 1 000 lignes, les effets actifs passent de **2 003 à 1 003**. La liste conserve
l'effet qui observe sa collection, les propriétaires des lignes et leur nettoyage.
Le tri initial donne un gain isolé d'environ **4 à 9 %** selon la configuration.
La gestion async/pending ou les services à effets de bord dans un callback marqué
ne sont pas certifiés par cette expérience synchrone.

## 2. Propriétaire compact et entrées paresseuses

Deux sous-prototypes isolent cette piste.

**Propriétaire compact.** Un composant de la fixture sans providers locaux ni
composition utilise une table bornée de providers avec des slots de résolution,
un stockage paresseux pour ses enfants et les valeurs par défaut. Il conserve
`get`, `getOptional`, `run`, `createChild`, son DestroyRef et son lien au parent.
Les factories restent mises en cache. Les providers multiples, les doublons et
les ensembles complexes reprennent l'injecteur complet. Les composants de la
fixture ayant des providers explicites ne prennent pas ce chemin.

À 1 000 lignes, on observe **14 injecteurs complets et 1 000 propriétaires
compacts**, et non quatorze propriétaires au total. Les entrées de providers sont
toujours présentes dans les tables compactes ; le compteur de `createProviderRecord`
mesure seulement les wrappers des injecteurs complets.

**Entrées paresseuses.** Les valeurs d'inputs restent dans des slots ordinaires
jusqu'à leur première lecture, puis leur signal est créé. Les façades d'input
sont également créées à la demande. Une écriture avant la première lecture
remplace le slot, ce que le contrôle de lecture tardive vérifie. À 1 000 lignes
sans index, le nombre de signaux passe de **4 004 à 3 004** : l'input `position`
inutilisé ne matérialise plus son signal. L'index du `forNode` existe toujours.

**Résultat : pas de gain de temps stable.** Le propriétaire compact est légèrement
plus lent dans le tri initial, malgré sa mémoire réduite. La table linéaire de
lookup est une hypothèse pour ce coût ; ce sous-mécanisme n'a pas été isolé par
une expérience supplémentaire. Les entrées paresseuses sont proches de la
référence, avec certaines régressions. Ces résultats ne valident pas une adoption
pour accélérer le montage ; ils ne condamnent pas toute autre implémentation
possible d'un propriétaire léger.

## 3. Plage de composant à racine unique

Le prototype laisse le composant de ligne utiliser directement son unique racine
DOM, sans sa paire de commentaires. La paire du `forNode` reste présente :
**4 004 → 2 004 commentaires** à 1 000 lignes. Il ne supprime pas toutes les ancres.

Si la sortie devient vide, multiple ou d'un autre type, la plage est promue vers
le fragment habituel avec deux ancres. Les descendants déjà montés sont transférés
à cette plage ; les contextes et la destruction restent gérés par le renderer.
Le contrôle effectue une inversion avant les transitions vide → multiple → simple.
L'hydratation, le SSR et l'émission de clés conservent le chemin classique.

Le gain de montage isolé est **modeste, environ 1 à 3 %** dans le tri initial.
Il existe aussi moins de nœuds et de structures à déplacer lors des permutations.
Les cas généraux de projection, directives, détachement de pending et animations
ne sont pas certifiés par cette spécialisation du composant de benchmark.

## 4. Fabrique préparée par définition de ligne

Une fabrique écrite à la main conserve un squelette DOM par document et forme
(avec/sans index), puis le clone. Chaque instance écrit ses valeurs dans les
attributs et nœuds texte connus. Elle remplace le parcours générique du sous-arbre
et évite de produire ses descriptions détaillées à chaque rendu.

Le composant conserve ses inputs, son propriétaire, son effet et ses traces de
rendu. La fabrique réenregistre les cibles de replay de la racine et du span de
position avec les chemins attendus. La destruction libère ces inscriptions.
Les valeurs sont écrites comme texte/attributs ; le HTML du squelette est constant.

Le tri initial donne environ **6 à 15 % de gain isolé**. Il s'agit de la piste
isolée la plus convaincante dans ces mesures.

**Limite de portée : cette fabrique ne traite que notre forme de ligne.** Elle
n'est pas un compilateur général, ni un fast path certifié pour les événements,
styles, slots et attributs supplémentaires. Les composants non marqués continuent
avec le renderer générique. Le chemin SSR/hydratation marqué possède une expansion
vers des descriptions ordinaires ; sa compatibilité complète n'est pas démontrée.

## Tri initial : effets isolés

Millisecondes médianes sur trois navigations. Ces chiffres ne se mélangent pas
avec les médianes de confirmation à cinq navigations plus bas.

| Prototype ajouté aux deux optimisations précédentes | 1 000 sans index | 1 000 avec index | 5 000 sans index | 5 000 avec index |
| --------------------------------------------------- | ---------------: | ---------------: | ---------------: | ---------------: |
| Référence déjà optimisée                            |            36,40 |            41,10 |           132,80 |           161,00 |
| Entrée déclarée pure                                |            35,10 |            38,90 |           120,90 |           148,00 |
| Propriétaire compact                                |            37,90 |            41,90 |           136,90 |           162,70 |
| Entrées paresseuses                                 |            36,60 |            42,40 |           132,40 |           163,30 |
| Plage à racine unique                               |            36,10 |            40,40 |           128,60 |           157,50 |
| Fabrique préparée                                   |            34,20 |            35,90 |           117,00 |           136,20 |
| Tous sauf fabrique                                  |            35,40 |            39,90 |           115,80 |           148,60 |
| Tous                                                |            30,70 |            34,90 |           104,10 |           123,00 |

## Confirmation de la combinaison retenue

La variante retenue, `floor-best`, combine \*\*entrée pure + plage à racine unique

- fabrique préparée\*\*, au-dessus des deux optimisations précédentes. `floor-all`
  ajoute le propriétaire compact et les entrées paresseuses. Les gains ne sont pas
  additifs. Les relevés de tas après collecte ne représentent ni le pic mémoire,
  ni toute la mémoire native du DOM, ni une preuve d'absence de fuite.

### 1 000 lignes sans index

| Variante                       | Montage | Un item | 10 % des items | Inversion | Filtrer | Rétablir | Tas JS après GC |
| ------------------------------ | ------: | ------: | -------------: | --------: | ------: | -------: | --------------: |
| Runtime initial                |   55,80 |    0,50 |           6,10 |      4,45 |    7,60 |    24,00 |       23,13 Mio |
| Deux optimisations précédentes |   37,40 |    0,50 |           3,60 |      4,35 |    4,05 |    16,45 |       11,83 Mio |
| Pur + plages + fabrique        |   30,20 |    0,50 |           3,60 |      3,80 |    3,20 |    12,65 |       10,42 Mio |
| Tous les prototypes            |   31,10 |    0,50 |           2,65 |      3,55 |    3,40 |    12,50 |        9,81 Mio |

### 1 000 lignes avec index

| Variante                       | Montage | Un item | 10 % des items | Inversion | Filtrer | Rétablir | Tas JS après GC |
| ------------------------------ | ------: | ------: | -------------: | --------: | ------: | -------: | --------------: |
| Runtime initial                |   70,90 |    0,50 |           6,90 |      9,75 |   13,20 |    32,10 |       31,21 Mio |
| Deux optimisations précédentes |   43,00 |    0,50 |           3,70 |     10,25 |    8,90 |    19,65 |       13,09 Mio |
| Pur + plages + fabrique        |   34,50 |    0,50 |           2,45 |      7,55 |    5,80 |    17,30 |       10,95 Mio |
| Tous les prototypes            |   35,40 |    0,45 |           2,55 |      7,45 |    5,65 |    16,35 |       10,82 Mio |

### 5 000 lignes sans index

| Variante                       | Montage | Un item | 10 % des items | Inversion | Filtrer | Rétablir | Tas JS après GC |
| ------------------------------ | ------: | ------: | -------------: | --------: | ------: | -------: | --------------: |
| Runtime initial                |  231,90 |    1,10 |          16,10 |     14,40 |   36,10 |    91,05 |      105,02 Mio |
| Deux optimisations précédentes |  135,00 |    1,10 |           8,80 |     15,90 |   16,80 |    60,75 |       49,12 Mio |
| Pur + plages + fabrique        |  105,10 |    1,10 |           5,80 |     10,00 |   10,55 |    49,15 |       42,43 Mio |
| Tous les prototypes            |  105,30 |    1,00 |           5,65 |     10,55 |   11,25 |    47,50 |       39,24 Mio |

### 5 000 lignes avec index

| Variante                       | Montage | Un item | 10 % des items | Inversion | Filtrer | Rétablir | Tas JS après GC |
| ------------------------------ | ------: | ------: | -------------: | --------: | ------: | -------: | --------------: |
| Runtime initial                |  301,90 |    1,10 |          18,95 |     39,30 |   58,90 |   145,25 |      146,37 Mio |
| Deux optimisations précédentes |  163,40 |    1,00 |          10,15 |     42,65 |   36,75 |    90,05 |       55,84 Mio |
| Pur + plages + fabrique        |  119,80 |    1,00 |           6,10 |     31,45 |   22,30 |    66,75 |       45,05 Mio |
| Tous les prototypes            |  123,70 |    1,00 |           6,05 |     31,60 |   23,55 |    67,90 |       44,25 Mio |

La combinaison retenue réduit le montage et plusieurs interactions dans ces
scénarios. Les différences avec la combinaison complète restent petites ; la
version sans propriétaire compact/inputs paresseux évite leur complexité et est
plus rapide au montage sur les quatre cellules de confirmation. La version
complète garde un avantage de mémoire ponctuel et parfois de durée d'interaction.
Ces observations ne justifient pas une garantie générale sur d'autres apps.

## Vérifications fonctionnelles et reproductibilité

Les rapports principaux et le contrôle final contiennent **30 scénarios de
contrats navigateur**, avec et sans providers locaux. Ils vérifient notamment :

- provider parent/local, `skipSelf`, absence optionnelle, ElementRef, identité et
  tags du composant, conservation de son propriétaire après mise à jour ;
- entrée modifiée avant sa première lecture, callback réactif non marqué,
  permutation avec conservation du nœud de ligne et des cibles ;
- transitions de sortie vide/multiple/simple, suppression d'une ligne avec
  nettoyage de son seul propriétaire, rejet de nouveaux enfants après destruction ;
- disparition des lignes et des rapports d'effets à la destruction complète.

Les six descripteurs DOM initiaux de chaque scénario sont identiques entre les
variantes pour le même cas de providers. Le contrôle final réutilise effectivement
ceux enregistrés dans la référence : **24 cibles résolues dans les variantes
candidates**, en vérifiant l'élément obtenu. Il ne s'agit pas du replay d'une
archive complète de session. La suppression des effets `for-item` modifie le
graphe et les rapports ; la fabrique remplace des structures internes. Les traces
et toutes les archives ne sont donc pas promises identiques.

Dans une copie séparée avec tous les prototypes :

- **564 tests Component réussis**, dont les suites renderer, replay et SSR existantes ;
- **8 contrats DI/cycle de vie réussis** : cache de factory et héritage, fallback
  multi/doublons, cycles détectés sans empoisonner une seconde tentative, destruction
  enfant avant parent et poursuite des nettoyages malgré une erreur ;
- ces huit contrats passent aussi avec l'implémentation de référence ;
- typecheck : les **13 diagnostics Core et 1 diagnostic Component** sont identiques
  à la référence après normalisation des chemins. Aucune erreur supplémentaire.

Le typecheck du premier prototype exposait une perte de narrowing du paramètre
`node` modifié dans une branche du renderer. Deux assertions de type l'ont corrigée.
Le JavaScript émis avant/après est identique, vérifié par transpilation et empreinte.
Le contrôle navigateur final utilise les sources corrigées. Cela ne rend pas les
typechecks globaux verts : les diagnostics préexistants restent présents.
Les suites générales seules ne suffiraient pas à tester nos fast paths ciblés :
les scénarios navigateur et contrats spécifiques sont donc nécessaires.

## Profil complémentaire : coûts restants

Trois profils supplémentaires de `floor-best`, à 5 000 lignes sans index, ont été
capturés après les imports, sur un bundle de production non minifié, CPU ×4,
échantillonnage 100 µs. Le contenu des 5 000 lignes est vérifié à chaque fois.
Leurs durées ne servent pas au classement et les frames `(program)`/anonymes
restent partiellement inattribuées.

Parmi les principaux hotspots nommés figurent `brand` des signaux,
`encodeHydrationSegment`, `createCraftRenderIdentity`,
`ɵregisterCraftReplayTarget`, `stableFingerprint`, les lookups d'injection,
`ComponentRenderedNode` et `createNamedPrimitiveGen`. Les compteurs du prototype
retenu gardent 4 003 créations d'identité et 25 009 encodages pour 1 000 lignes
sans index, ainsi que 1 001 créations de primitive `component-render`.

Cela suggère quatre expériences suivantes, sans gain encore mesuré :

1. Des signaux privés au renderer avec moins d'enveloppes et de marquage, tout en
   conservant le contrat des signaux publics, l'égalité et les nettoyages.
2. Une voie interne créant directement les refs d'effets, avec les mêmes rapports
   et tags, sans fabriquer puis consommer un générateur de primitive uniquement
   pour retourner cette ref. Le protocole public `yield*` resterait disponible.
3. Réutiliser les identités déjà calculées par entrée, leurs préfixes et les
   étapes de construction des adresses de replay. Les empreintes sérialisées des
   archives devraient rester exactement identiques ; changer l'algorithme ou
   différer l'indexation demanderait des contrôles distincts.
4. Étendre le plan préparé au composant lui-même : la fabrique actuelle prépare
   le sous-arbre DOM mais conserve le constructeur générique de composant, ses
   entrées/proxies, son injecteur et ses métadonnées. Un chemin explicitement
   spécialisé pourrait préparer ces opérations pour les formes compatibles,
   avec repli vers le chemin complet lorsque des fonctionnalités l'exigent.

Profils bruts : `tmp/mount-floor/remaining-profile/*.cpuprofile` ; agrégation :
`tmp/mount-floor/remaining-profile/summary.json` ; runner de cette sonde ciblée :
`tmp/mount-floor/remaining-profile.mjs`. Aucun de ces profils ne permet d'attribuer
un pourcentage exact du montage minifié à une seule famille de coûts.

## Reproduire et revoir

```sh
npm --prefix apps/framework-benchmark run bench:mount-floor-prototypes
```

La commande exécute les compteurs, le tri initial, la confirmation, les compteurs
de la combinaison retenue et le contrôle final, successivement. `MOUNT_FLOOR_OUTPUT`,
`MOUNT_FLOOR_SCREEN_RUNS` et `MOUNT_FLOOR_RUNS` ajustent le protocole.
`MOUNT_FLOOR_SUMMARIZE_ONLY=true` agrège une campagne existante.
Les tests supplémentaires ont été exécutés dans une copie de vérification dédiée,
pas automatiquement par cette commande de benchmark.

- [Orchestration](../../apps/framework-benchmark/mount-floor.prototype.mjs).
- [Transformations des snapshots](../../apps/framework-benchmark/mount-floor-prototypes.mjs).
- [Propriétaire compact](../../apps/framework-benchmark/prototype-runtime/compact-owner.ts.txt).
- [Plage à racine unique](../../apps/framework-benchmark/prototype-runtime/single-root-range.ts.txt).
- [Fabrique préparée](../../apps/framework-benchmark/prototype-runtime/prepared-row.ts.txt).
- [Contrats navigateur](../../apps/framework-benchmark/src/craft/floor-contracts.prototype.ts).
- [Statistiques, compteurs, empreintes et descripteurs](2026-11-05-mount-floor-summary.json).
- Bruts : `tmp/mount-floor/timing/timing.json`, `refine/timing.json`,
  `counts/counts.json`, `best-counts/counts.json`, `final-check/timing.json`.
- Tests : `tmp/mount-floor/component-tests.log`, `compact-owner-tests.log`,
  `baseline-compact-owner-tests.log`, `typecheck-comparison.json`, `type-only-fix.json`.

Les prototypes restent explicitement expérimentaux. Les sources normales de
`libs/core` et `libs/component` sont inchangées. Aucun correctif n'est intégré,
aucun commit ni push n'est effectué.
