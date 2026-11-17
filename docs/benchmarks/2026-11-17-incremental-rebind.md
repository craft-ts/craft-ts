# Rebind partiel des lignes légères

17 novembre 2026. Fondation : `b6cc4a594`. **Prototype testé et mesuré, sans
activation dans les bibliothèques de production.**

En mode `lean`, modifier les inputs d’une instance arrête puis recrée tous ses
bindings. Une ligne indexée relie donc aussi ses bindings d’index quand seul
l’objet ligne change. Le prototype conserve ces bindings lorsque le compilateur
et le renderer peuvent établir leur indépendance. Les économies ne compensent
pas clairement le suivi supplémentaire dans le cas habituel. Un contrôle
synthétique avec seize cellules d’index montre toutefois un cas favorable.

## Ce qui est prouvé

Le compilateur identifie les lectures statiques d’inputs dans des expressions
simples : lecteurs directs, retour unique, délégation, opérations primitives et
interpolation. Les alias d’inputs, accès calculés, appels inconnus, blocs de
préparation, événements, trous, `try/finally` et formes réflexives excluent le
plan partiel. Le mode standard n’émet aucune métadonnée de rebind.

Cette analyse ne suffit pas pour un objet quelconque. Le renderer ne marque
comme possédés que les objets littéraux produits par les callbacks de listes
déjà prouvés. Leurs valeurs proviennent des lecteurs de ligne et d’index créés
par Craft. Le lecteur de ligne est recréé à chaque rendu ; le lecteur d’index
conserve son identité et lit une cellule numérique privée. Une fonction fournie
par l’application n’acquiert aucune preuve de pureté par sa seule identité.

Seules les expressions primitives stables peuvent être conservées. Une
projection comme `(yield* inputs.position()).property` peut appeler un getter,
même sur un nombre. Un test reproduit le résultat obsolète de l’approche naïve,
puis vérifie le garde-fou qui relie toujours ces projections. Un input absent
n’est pas traité comme une lecture stable héritée du prototype.

Les autres appels de composants et les Proxies gardent le rebind complet. Le
test de Proxy compare la séquence des traps avec et sans le plan partiel. Le
prototype conserve un objet interne de lecteurs dont les entrées sont mises à
jour : les bindings maintenus ne retiennent pas les anciennes lignes par une
succession d’anciens objets d’inputs.

## Protocole et couverture

Apple M3, Node 25.2.1, Chromium 153.0.8010.12. Production minifiée, contextes
neufs, huit navigations par cas et variante, cinq boucles d’actions après deux
boucles d’échauffement. Les variantes d’un même cas sont adjacentes ; l’ordre
alterne par répétition et les blocs sont mélangés avec une graine fixe. La page
utilise huit navigations et trois boucles d’actions à l’échelle 2.

La source habituelle du microbenchmark a **une seule définition éligible** :
`CompilerBenchIndexedRow`. Les lignes simples, niveaux imbriqués et 128 champs
sont des contrôles sans rebind partiel. Aucun plan de la page réaliste n’est
éligible ; ses temps ne peuvent donc pas être attribués à ce mécanisme.

Le contrôle favorable a 1 000 lignes et **seize cellules répétant l’index**.
Il ne représente pas un tableau dont seize champs de données changent
indépendamment : ces champs resteraient associés à l’input `row`.

Les 96 navigations chronométrées se répartissent en 64 pour le microbenchmark
habituel, 16 pour la page et 16 pour le contrôle large. Les contrats hors
chronométrage comparent DOM, identité des lignes, index, champs indépendants et
destruction, ainsi que 47 états d’interaction de la page. Aucun test/build du
laboratoire ne tourne pendant les cohortes. Le poste reste partagé ; la
dispersion interdit de créditer les petites différences de montage comme des
gains établis.

## Mesures

Médianes, ms. Le heap est mesuré après le parcours d’actions et un GC forcé.

| Cas habituel, 5 000 lignes indexées | Référence | Prototype |
| ----------------------------------- | --------: | --------: |
| Montage                             |     43,20 |     43,70 |
| Modifier une ligne                  |      2,05 |      2,00 |
| Modifier un dixième des lignes      |      4,10 |      4,30 |
| Inverser                            |     22,68 |     22,35 |
| Filtrer                             |     13,15 |     12,00 |
| Restaurer                           |     18,40 |     17,85 |
| Heap retenu, MiB                    |     8,716 |     8,993 |

Le suivi ajoute environ 0,277 MiB, soit 3,2 %, pour ce cas. Réduire les effets et
les écritures d’index ne suffit pas à accélérer la modification d’un dixième des
lignes. Les ensembles de clés et la gestion des abonnements ont aussi un coût.
Le bundle du banc prend 1 015 octets minifiés et 275 octets gzip de plus.

| Contrôle favorable, 1 000 lignes × 16 cellules d’index | Référence | Prototype |
| ------------------------------------------------------ | --------: | --------: |
| Montage                                                |     31,45 |     32,05 |
| Modifier une ligne                                     |      0,60 |      0,60 |
| Modifier 100 lignes                                    |      1,80 |      1,05 |
| Inverser                                               |     17,28 |     17,38 |
| Filtrer                                                |     11,35 |     11,50 |
| Restaurer                                              |     18,15 |     19,15 |
| Heap retenu, MiB                                       |    11,180 |    11,267 |

Le contrôle gagne environ 42 % sur la modification de 100 lignes, mais paie
0,6 ms de montage, 1,0 ms de restauration et davantage de mémoire. Ce résultat
montre une condition d’intérêt, pas un gain général pour les tableaux.

La page passe de 44,3 à 43,0 ms au montage, avec 7,76 → 7,77 MiB après montage.
Elle n’active aucun rebind partiel : aucune accélération ne lui est attribuée.
Les lignes simples, niveaux imbriqués, distributions et toutes les actions sont
conservés dans les données. Les temps mesurent le travail JavaScript/DOM
synchrone ; ils ne mesurent pas LCP ou INP.

## Validation et décision

82 tests du compilateur et 609 tests de composants passent. Les cinq contrats
ciblés couvrent les exclusions, le maintien de l’index, les nœuds conservés,
l’inversion avec un getter observant le DOM, les traps d’un Proxy, la destruction
et le défaut des projections naïves. Les vérifications TypeScript passent.
Une correction de compatibilité de la syntaxe des tests a été suivie d’un
nouveau passage des cinq contrats. Une première validation de composants
chevauchait une régénération du candidat ; seul le passage suivant sur les
sources figées est utilisé comme preuve.

**Décision : prototype conservé, sans nouvelle option publique ni changement du
runtime.** Il profite surtout aux lignes répétant de nombreux bindings d’index,
avec un coût au montage et en mémoire. Le cas habituel ne démontre pas de gain
sur les modifications de données. Une extension aux champs d’un objet `row`
demanderait une preuve supplémentaire sur ses getters, Proxies et mutations ;
elle n’est pas implémentée par cette expérience.

```sh
node apps/compiler-benchmark/experiments/incremental-rebind.mjs
CAMPAIGN_MODE=lean CAMPAIGN_BLOCKED=true COMPILER_RUNS=8 COMPILER_CASES=rows,indexed,nested,fields COMPILER_ROWS=5000 CAMPAIGN_OUTPUT=incremental-micro node apps/compiler-benchmark/experiments/run-micro.mjs incremental-rebind-reference incremental-rebind
PAGE_RUNS=8 CAMPAIGN_OUTPUT=incremental-page node apps/compiler-benchmark/experiments/run-page.mjs incremental-rebind-reference incremental-rebind
CAMPAIGN_WIDE_INDEX=true CAMPAIGN_MODE=lean CAMPAIGN_BLOCKED=true COMPILER_RUNS=8 COMPILER_CASES=indexed COMPILER_ROWS=1000 CAMPAIGN_OUTPUT=incremental-wide-index node apps/compiler-benchmark/experiments/run-micro.mjs incremental-rebind-reference incremental-rebind
```

[Données, sources, patches et contrats](2026-11-17-incremental-rebind-summary.json).
La [campagne complète](2026-11-17-performance-campaign.json) reste ouverte.
