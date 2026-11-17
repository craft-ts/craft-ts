# Fusion de bindings scalaires : gain ciblé, prototype refusé

17 novembre 2026. Référence : `70a51b49e`. Aucun changement du runtime de
production. Les [données](2026-11-17-scalar-fusion-summary.json) conservent
256 navigations, les deux versions du prototype, leurs sources, contrats,
patches, bundles et différences appariées.

Partager un effet entre des bindings consécutifs lisant le même index peut
réduire fortement leur mémoire. Le cas favorable gagne ici 13 % au montage
et 40 % de tas retenu. Mais une référence de lecteur connue à l'enregistrement
ne prouve pas qu'un binding conservera cette source. Un contre-exemple change
le nombre d'appels applicatifs. **Ce prototype est refusé comme optimisation
générale**, malgré son résultat favorable sur des inputs stables.

## Ce qui est essayé

Le compilateur annote les inputs directs et les génératrices constituées
d'un seul `return yield* inputs.nom()`. Seuls les groupes consécutifs vers
du texte, `data-*` ou `aria-*` peuvent partager leur effet. Préparation,
événements et trous désactivent le plan de fusion. Projections d'objet,
arithmétique, aliases, appels supplémentaires et `try/finally` ne sont pas
fusionnés.

Une WeakSet privée reconnaît les lecteurs numériques d'index créés par le
renderer et les lecteurs de constantes primitives issus de la normalisation
des inputs légers. Les fonctions applicatives inconnues restent séparées.
Les lectures et écritures originales gardent leur ordre : le prototype partage
l'effet propriétaire, il ne remplace pas toutes les lectures par un résultat
mis en cache.

La première version enregistrait tous les lecteurs d'index. Elle ajoutait
environ 0,25 Mio à 5 000 lignes même sans plugin. La seconde limite cet
enregistrement aux factories de listes légères prouvées dont le plan peut
fusionner ; elle garde aussi la boucle de bindings ordinaire pour les autres
plans. Les deux cohortes restent archivées séparément. Leurs valeurs absolues
ne sont pas comparées pour attribuer une accélération.

## Contrôle favorable : 1 000 lignes, seize cellules d'index

Chaque cellule répète le même index numérique, en attribut et en texte,
avec les composants Craft habituels. Ce n'est pas un tableau de seize champs
indépendants. Huit navigations par variante, cinq boucles ; médianes en ms
et Mio, seconde version :

| Mesure                   | Référence | Fusion ciblée |
| ------------------------ | --------: | ------------: |
| Montage                  |     25,65 |         22,25 |
| Inversion                |     14,10 |         11,75 |
| Filtrage                 |      8,75 |          7,45 |
| Restauration             |     12,40 |         11,40 |
| Modifier une ligne       |      0,50 |          0,60 |
| Modifier 100 lignes      |      1,60 |          1,40 |
| Tas après parcours et GC |    11,124 |         6,691 |

Les huit différences de montage appariées sont favorables ; leur médiane
est −3,45 ms. Le test à trois lignes compte six créations d'effet de moins
pour les trois lectures d'index par ligne. La fixture à seize cellules a
trente-deux lectures d'index consécutives par ligne, dont l'effet est partagé.
Bundle favorable : +1 744 octets JS et +395 gzip.

## Contrôles ordinaires et page réaliste

La couverture potentielle de fusion est **nulle** dans les sources ordinaires
du microbanc et les treize modules de la page. Leurs projections, calculs et
frontières ne correspondent pas au motif ciblé. Les écarts suivants mesurent
donc le coût résiduel du prototype, pas un bénéfice de fusion.

| Cas                          | Montage référence / prototype | Tas référence / prototype |
| ---------------------------- | ----------------------------: | ------------------------: |
| 5 000 lignes simples         |                 16,55 / 16,30 |             4,942 / 4,946 |
| 5 000 lignes indexées        |                 21,50 / 22,55 |             8,729 / 9,344 |
| 5 000 lignes, quatre niveaux |                 31,00 / 31,30 |           16,635 / 16,632 |
| 128 champs indépendants      |                   3,15 / 3,25 |             1,878 / 1,884 |
| Page, échelle 2 : montage    |                 34,30 / 34,50 |    7,71 / 7,86 au montage |

Sur la page, 47 instantanés sont identiques. Thème 1,55 / 1,63 ms,
remontage 19,40 / 18,40 ms ; le tas après parcours passe de 8,82 à 8,96 Mio.
Aucun gain de montage n'est établi. Les lignes indexées prennent environ
0,615 Mio supplémentaires, sans fusion utile. Le microbanc ordinaire ajoute
1 015 octets JS, 355 gzip ; la page ajoute 1 089 octets JS, 305 gzip.

Sans plugin, la seconde version ne conserve plus le surcoût de 0,25 Mio
observé dans le premier écran : les médianes restent à environ 25,66 Mio
pour les lignes et 33,41 pour les indexées. Cela ne démontre aucune accélération.
Les différences de montage appariées ont une médiane de **+1,0 ms** pour les
lignes et **+1,1 ms** pour les indexées, malgré des différences de médianes
marginales de signe opposé. Seulement deux et trois paires sur huit sont
plus rapides. Le bundle sans plugin ajoute 992 octets JS, 311 gzip.

## Pourquoi la preuve ne suffit pas

Un dernier binding remplace `inputs.position` par un lecteur applicatif après
la création du groupe d'index. Une inversion fait alors lire à ce groupe une
fonction alternant entre deux états réactifs. Quand l'un change ensuite :

- Le mode léger de référence appelle le lecteur **deux fois**.
- Le prototype l'appelle **quatre fois** ; sa granularité et son résultat
  peuvent différer.

Le test archive cette divergence attendue. La WeakSet prouve l'origine du
lecteur initial, pas la stabilité de la propriété lue par chaque binding.
Le compilateur ne prouve pas actuellement l'absence de remplacement ou de
capture de l'objet d'inputs. Les bons résultats de la fixture stable constituent
donc un plafond conditionnel, pas une optimisation activable pour tous les
programmes acceptés. Il faudrait renforcer cette preuve et supprimer les
surcoûts des cas ordinaires avant d'envisager une intégration.

## Validation et reproduction

La version ciblée passe la suite Compiler à 94 tests et Component à 609.
Après ajout du contre-exemple, les sept contrats ciblés et le contrôle
TypeScript des specs passent. Un de ces sept contrats **démontre la
non-équivalence** ; leur réussite ne valide donc pas une activation générale.
Les six autres couvrent les refus syntaxiques, le nombre d'effets, l'identité,
les mises à jour, l'ordre observé dans le DOM, les fonctions inconnues,
les probes de Proxy, les conversions primitives et la destruction.

Apple M3, Node 25.2.1, Chromium 153.0.8010.12. Builds production minifiés,
contextes frais, huit navigations par variante et cas, ordre déterministe,
blocs adjacents équilibrés pour les microbancs. Aucun test ou build concurrent
pendant les cohortes. Chaque version totalise 64 navigations ordinaires,
16 favorables, 16 de page et 32 sans plugin. Les durées mesurent le JS/DOM
synchrone ; le tas JS après GC exclut la mémoire native du DOM.

```sh
node apps/compiler-benchmark/experiments/scalar-fusion.mjs
node apps/compiler-benchmark/experiments/validate-scalar-fusion.mjs
COMPILER_RUNS=8 COMPILER_ROWS=5000 COMPILER_CASES=rows,indexed,nested,fields \
  COMPILER_ITERATIONS=5 CAMPAIGN_BLOCKED=true CAMPAIGN_OUTPUT=scalar-fusion-micro \
  node apps/compiler-benchmark/experiments/run-micro.mjs scalar-fusion-reference scalar-fusion-gated
cp tmp/performance-campaign/micro.mjs tmp/performance-campaign/scalar-fusion-micro/runner.mjs
COMPILER_RUNS=8 COMPILER_ROWS=1000 COMPILER_CASES=indexed COMPILER_ITERATIONS=5 \
  CAMPAIGN_BLOCKED=true CAMPAIGN_FUSION_FIXTURE=true CAMPAIGN_OUTPUT=scalar-fusion-wide \
  node apps/compiler-benchmark/experiments/run-micro.mjs scalar-fusion-reference scalar-fusion-gated
cp tmp/performance-campaign/micro.mjs tmp/performance-campaign/scalar-fusion-wide/runner.mjs
PAGE_RUNS=8 PAGE_ITERATIONS=3 PAGE_SCALES=2 CAMPAIGN_OUTPUT=scalar-fusion-page \
  node apps/compiler-benchmark/experiments/run-page.mjs scalar-fusion-reference scalar-fusion-gated
COMPILER_RUNS=8 COMPILER_ROWS=5000 COMPILER_CASES=rows,indexed COMPILER_ITERATIONS=5 \
  CAMPAIGN_BLOCKED=true CAMPAIGN_MODE=runtime CAMPAIGN_OUTPUT=scalar-fusion-runtime \
  node apps/compiler-benchmark/experiments/run-micro.mjs scalar-fusion-reference scalar-fusion-gated
cp tmp/performance-campaign/micro.mjs tmp/performance-campaign/scalar-fusion-runtime/runner.mjs
```

Pour reproduire le premier écran, remplacer `scalar-fusion-gated` par
`scalar-fusion`, garder chaque sortie dans un répertoire distinct et conserver
son runner. Les données archivées gardent aussi le source exact du premier
matérialiseur et les résultats des tests exécutés à ce moment-là.
La campagne globale reste [en cours](2026-11-17-performance-campaign.json).
