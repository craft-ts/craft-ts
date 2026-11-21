# Suite des recherches : nettoyages, profils et couverture réelle

17 novembre 2026. Référence : `e4db1e2c6`, première version du compilateur
optionnel. Candidat retenu : `260a12489`, après les commits `0b158aee4` et
`5e66d1732`. [Données, distributions et essais séparés](2026-11-17-compiler-followup-summary.json).

Le gain retenu concerne surtout les parcours qui détruisent puis recréent
beaucoup de composants : sur 5 000 lignes sans index, la restauration passe de
**13,9 à 10,1 ms (−27,3 %)**. Le filtrage gagne environ 5–6 % dans la confirmation.
Le montage ne progresse pas de façon convaincante sur la page réaliste. Ces
résultats ne s'ajoutent pas aux pourcentages de la campagne du 16 novembre.

## Changements conservés et vérifications

La destruction des composants compilés suit maintenant des boucles directes,
comme le renderer générique. Elle ne fabrique plus de tableaux de callbacks via
`splice().map(...)` ni de fermetures pour chaque ressource. L'ordre des groupes,
la poursuite après erreur et leurs erreurs agrégées sont conservés.

L'état de destruction reste dans le mécanisme partagé de `destroyCraftOwner`.
L'entrée interne `ɵbeginCraftOwnerDestruction` permet de marquer le propriétaire
avant de le nettoyer directement, avec les mêmes garanties de réentrance et
d'idempotence. Aucun champ supplémentaire n'est ajouté à chaque instance.
Un premier essai avec un booléen par instance est conservé dans les données
intermédiaires ; ses meilleurs chiffres ne sont pas présentés comme ceux du
candidat final.

`runCraftCleanups` alloue aussi sa liste d'erreurs au premier échec. Les valeurs
levées `undefined`, `null`, `false`, `0` et les objets restent transmises telles
quelles ; tous les autres callbacks sont exécutés. L'essai isolé de ce changement
ne démontre pas un gain temporel substantiel : il est retenu comme réduction
simple d'allocations temporaires, sans lui attribuer le gain total.

Validation : 1 692 tests Core réussis, un échec attendu et trois TODO existants ;
607 tests Component et 48 tests Compiler réussis. TypeScript des bibliothèques
et des specs Compiler passe. Le lint ne relève aucune erreur sur les fichiers
modifiés ; les avertissements préexistants du renderer restent présents.
Les contrats navigateur vérifient le même DOM, les nœuds conservés, les index,
les lectures indépendantes et la destruction.

## Comparaison finale des mises à jour

Apple M3, Node 25.2.1, Chromium 153.0.8010.12. Même application, même plugin et
mêmes options. La référence utilise les bibliothèques figées de `e4db1e2c6` ;
le candidat utilise `260a12489`. Sept navigations fraîches par case/variante,
ordre mélangé, cinq boucles après deux échauffements : **28 navigations** dans
cette confirmation. Les profils CPU et les compteurs ne participent pas aux timings.

Temps médians en millisecondes, 5 000 lignes :

| Action              | Sans index avant | Sans index après | Avec index avant | Avec index après |
| ------------------- | ---------------: | ---------------: | ---------------: | ---------------: |
| Montage             |             36,7 |             36,4 |             50,2 |             49,6 |
| Modifier une ligne  |              0,9 |              0,9 |              0,9 |              0,9 |
| Modifier un dixième |              2,6 |              2,4 |              2,7 |              2,7 |
| Inverser            |             5,30 |             5,15 |             17,0 |             16,8 |
| Filtrer             |              4,2 |              4,0 |             11,7 |             11,0 |
| Restaurer           |             13,9 |             10,1 |             24,5 |             24,8 |

La restauration avec index reste légèrement plus lente dans cette série
(+1,2 %), et les petites mises à jour changent peu. Le heap après parcours/GC
reste comparable : 23,33 → 23,34 Mio sans index et 29,82 → 29,85 Mio avec index.
Réduire les allocations temporaires n'implique pas une baisse du heap conservé.

Sur cette entrée de benchmark, le JS minifié passe de 207 300 à 207 586 octets ;
la somme gzip, de 57 553 à 57 611 octets : **+58 octets gzip**. Ces tailles couvrent
l'entrée commune des fixtures, pas une application arbitraire.

L'ablation précédente distingue création de callbacks de nettoyage et liste
d'erreurs paresseuse. Elle utilisait encore le booléen par instance : le filtrage
sans index y passait de 4,1 à 3,4 ms. La version finale conserve la structure des
instances et le marquage partagé du runtime ; son gain de filtrage est plus
modéré. Les deux étapes et leurs distributions sont archivées séparément.

## Page réaliste : bénéfices modestes et limites

Les deux variantes restent identiques après 47 snapshots d'interactions par
taille et par variante. Sept navigations par variante/taille et cinq boucles
après deux échauffements servent aux mesures suivantes :

| Cas                           |   Avant |   Après |
| ----------------------------- | ------: | ------: |
| Montage, taille 1             | 35,8 ms | 36,1 ms |
| Filtrage, taille 1            |  1,3 ms |  1,2 ms |
| Changement d'onglet, taille 1 |  5,2 ms |  4,8 ms |
| Remontage, taille 1           | 20,8 ms | 20,1 ms |
| Montage, taille 2             | 51,6 ms | 52,3 ms |
| Filtrage, taille 2            |  2,2 ms |  2,1 ms |
| Remontage, taille 2           | 35,2 ms | 34,4 ms |

La médiane de montage augmente de 0,3 et 0,7 ms : aucun gain de montage n'est
revendiqué. Les autres écarts sur cette page sont modestes, avec des distributions
qui se recouvrent. L'effet établi le plus net reste la restauration des grandes
listes sans index dans le benchmark dédié.

Les timings des rapports du 16 et du 17 novembre ne doivent pas être comparés
comme des variantes d'une seule cohorte : cache, température et charge de la
machine peuvent varier. Seuls les avant/après de chaque campagne sont utilisés
pour les conclusions ci-dessus. Il ne s'agit ni de mesures LCP, ni de réseau
contraint, ni d'une promesse pour tous les navigateurs.

## Une découverte utile : 7 définitions ne signifient pas 7 instances

Le précédent rapport comptait 7 définitions éligibles sur 62. Un nouveau compteur
placé dans les constructeurs réels du renderer, sans proxy de composant qui
invaliderait la compilation, mesure les constructions initiales :

| Taille | Constructions totales | Chemin compilé | Part compilée |
| ------ | --------------------: | -------------: | ------------: |
| 1      |                 1 735 |            717 |        41,3 % |
| 2      |                 3 259 |          1 378 |        42,3 % |

Ce comptage est un build instrumenté distinct, jamais chronométré. Il mesure des
constructions, pas leur part du temps CPU. Il affine la priorité : davantage de
définitions reste utile, mais près de 42 % des constructions utilisent déjà le
chemin compilé. Le travail conservé dans les bindings, le driver et la DI reste
important même pour ces composants.

Les trois familles génériques les plus fréquentes à la taille 2 sont :

| Composant    | Constructions | Blocage actuel                              |
| ------------ | ------------: | ------------------------------------------- |
| `IconButton` |           240 | Événement et sous-composant `Icon`          |
| `Button`     |           196 | Méthode d'événement dans les propriétés DOM |
| `Counter`    |           192 | Sous-composant `Icon`                       |

Ces trois familles représentent 628 constructions, environ 19,3 % du total.
Cela donne une cible plus concrète que le seul nombre de définitions manquantes.

## Piste testée puis écartée

Un raccourci pour `injector.run` lorsque le même injecteur est déjà actif dans
le navigateur a été essayé. Le chemin Node/AsyncLocalStorage restait inchangé.
L'ablation à cinq navigations par case n'a pas montré de bénéfice régulier : le
montage des lignes simples passait de 36,6 à 37,4 ms, celui des lignes avec index
de 49,5 à 50,6 ms. La page réelle ne confirmait pas de gain général non plus.

Ce raccourci n'est pas dans le code livré. Son
[patch expérimental](2026-11-17-compiler-followup-experiments/same-context.patch)
et les distributions sont conservés pour éviter de refaire l'essai sans raison.

## Autres moyens à investiguer, par priorité

Les profils CPU nommés utilisent trois montages à la taille 2, en production non
minifiée et avec ralentissement CPU x4. Les frames du driver (`drivePendingGenerator`,
`ɵexecuteFactoryIn`), de résolution des services, de `markNamedReactiveProperties`
et de `patchProperties` ressortent ; le filtrage montre aussi la destruction.
L'échantillonnage, le code non minifié et le temps natif/idle empêchent d'en déduire
des pourcentages d'attribution exacts. Ce sont des indices pour les expériences.

1. **Compiler les événements et des emplacements de sous-composants.** Commencer
   par `Button`, `IconButton` et `Counter`, en partageant le moteur actuel des
   propriétés/événements. Conserver hooks, actions, validation, noms d'interaction,
   scopes CSS, identités et propriétaires DI. Les 628 constructions identifiées
   donnent un cas réel pour vérifier le gain, sans promettre qu'il sera
   proportionnel au comptage.
2. **Préparer les accès répétés aux services.** Un binding compilé pourrait éviter
   de recréer une requête yield et de refaire certains intermédiaires pour une
   lecture statiquement connue. Garder le vrai injecteur, les overrides, les
   services de scope `function`, les bindings d'appel et les observateurs. Un cache
   global par nom de service ne préserverait pas ces contrats.
3. **Réduire les scans de marquage des propriétés.** Le runtime rescane les membres
   de services à leur résolution. Étudier un cache versionné pour les objets
   d'exposition possédés par Craft ; conserver le chemin complet pour les objets
   fournis, modifiés ou dotés de getters. Un simple WeakSet « déjà vu » changerait
   le comportement des objets mutables : cette réécriture n'est pas retenue.
4. **Lowering limité de bindings prouvés.** Transformer des lectures simples
   d'inputs ou de primitifs connus en accès directs, avec un IR conservant
   suspension, erreurs et `try/finally`. Repli pour les lecteurs arbitraires et
   l'instrumentation. Un type `Input<number>` ne prouve pas qu'une fonction est
   pure ; les getters et lectures ne doivent pas être fusionnés par hypothèse.
5. **Isoler le support du compilateur dans le bundle sans plugin.** La première
   campagne a mesuré environ 1,2 Kio gzip de support/correctifs partagés face à
   la branche de base. Tester une inscription de renderer et un découpage de
   modules permettant davantage de tree-shaking, puis mesurer le build distribué.
6. **Fabriques DOM communes parent/enfants, propriétaires conservés.** C'est la
   direction pertinente pour l'idée de regroupement. Le contrôle aplati du
   16 novembre est un plafond expérimental, pas une transformation équivalente.
   Grouper systématiquement les insertions dans un DocumentFragment exige aussi
   de prouver qu'aucun callback n'observe le DOM intermédiaire ou `ElementRef`.

Ces pistes ne sont pas annoncées comme implémentées. Elles ont maintenant des
cibles de code, des contrats et des cas de mesure explicites.

## Reproduire

Le harness accepte désormais `label=mode@racineDesBibliothèques`, pour comparer
la même application à plusieurs runtimes figés.

```sh
mkdir -p tmp/compiler-followup/reference
git archive e4db1e2c6 libs/core libs/component libs/style \
  tsconfig.base.json tsconfig.json package.json \
  | tar -x -C tmp/compiler-followup/reference

COMPILER_VARIANTS='before=compiled@tmp/compiler-followup/reference,after=compiled' \
  COMPILER_CASES=rows,indexed COMPILER_ROWS=5000 COMPILER_RUNS=7 \
  COMPILER_ITERATIONS=5 npm run perf:compiler

COMPILER_PROFILE_LIB_ROOT=tmp/compiler-followup/reference \
  npm run perf:compiler:profile

node docs/benchmarks/2026-11-17-compiler-followup-experiments/count-mounts.mjs
```

Le [README du benchmark](../../apps/compiler-benchmark/README.md) décrit également
la comparaison de page. Les données archivées comprennent les profils nommés,
les ablations intermédiaires, les 28 navigations de confirmation, les mesures de
page, les compteurs et les empreintes des sources. Les empreintes du candidat
ont été comparées au commit et celles de la référence au checkout figé.
