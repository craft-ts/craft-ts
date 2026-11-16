# Compilateur optionnel : gains, limites et regroupement de composants

16 novembre 2026. Base : `55ca57929`, branche
`claude/craft-ts-performance-16a01f`. Implémentation : `167149bc6` sur
`codex/optional-performance-compiler` ; correctif de batch indépendant :
`97814031b`. [Données et distributions complètes](2026-11-16-optional-compiler-summary.json).

Le premier compilateur est intégré et reste optionnel. Sur 5 000 lignes,
les options par défaut réduisent le montage de **24,5 % sans index** et de
**16,2 % avec index**. Sur la page réaliste, le montage reste pratiquement
inchangé : cette version ne produit des plans que pour 7 définitions sur 62.
Le bénéfice dépend donc de la couverture et du parcours ; il ne justifie pas
une activation globale sans mesurer l'application.

## Ce qui est livré

`@craft-ts/compiler/vite` expose `craftCompiler()`, à ajouter explicitement
aux plugins Vite. Aucun package existant ne dépend du compilateur. Le build
client génère des fabriques DOM et une disposition des bindings depuis les
templates ordinaires. Il garde les templates originaux pour le repli.

Une seconde passe prouve les factories de listes qui transmettent directement
l'item/index à un composant local constant. Elle permet de supprimer l'effet
intermédiaire `for-item` et d'utiliser une plage à racine unique. Les callbacks
arbitraires ne sont pas déclarés purs. Les inputs et chaque binding gardent
leurs abonnements propres.

Le clonage natif de blueprints est disponible avec `dom: 'clone'`. Il ne devient
pas le défaut : ses résultats sont irréguliers et son code généré est plus gros.
La fabrique conserve un injecteur natif par composant, les scopes CSS, les
identités des éléments et l'ownership de destruction.

L'analyse emploie l'AST TypeScript et une liaison des symboles limitée au module
virtuel. Elle ne charge pas les imports ni les types du projet et n'exécute pas
le code applicatif. Les source maps sont conservées. Le rapport de compilation
indique les définitions éligibles et les motifs de repli ; une définition éligible
peut encore utiliser le chemin générique selon le contexte runtime.

Développement, serve, tests et builds SSR restent génériques. SSR/hydratation,
instrumentation, boundaries, composition, providers, host props et constructions
non reconnues prennent également le chemin existant. Les détails et commandes
sont dans le [README du package](../../libs/compiler/README.md).

## Méthode et reproductibilité

Apple M3, macOS/Darwin 23.6.0, Node 25.2.1, Chromium 153.0.8010.12, Vite 8.3.1.
Même source applicative et même runtime pour toutes les variantes ; seul le
plugin et ses options changent. Le correctif de batch est présent partout.

La campagne principale comprend **364 navigations chronométrées** : sept contextes
frais par variante/case, ordre mélangé avec une graine fixe, cinq boucles d'actions
après deux échauffements. Les compteurs de lectures sont activés dans d'autres
navigations. Le harness vérifie l'équivalence du DOM, les nœuds conservés, les
index après déplacement, la destruction et exactement une lecture sur 128
champs indépendants.

Les tableaux donnent les médianes. Le JSON conserve chaque observation et les
min/max. Le montage entoure `bootstrapCraft` ; les mises à jour s'arrêtent au
microtask suivant, après le travail réactif. La navigation jusqu'au DOM prêt
inclut le chargement et l'évaluation des modules sur un serveur local. Les deux
`requestAnimationFrame` sont seulement une occasion de rendu, pas une mesure
certifiée de première peinture ou de LCP. Aucune extrapolation à un réseau mobile,
à un autre moteur ou à un appareil plus lent n'est faite.

Les bundles chronométrés ont été reconstruits depuis `167149bc6` et comparés
**octet pour octet** aux quatre variantes, ainsi qu'aux deux builds de la page
réaliste. Le JSON conserve les empreintes des bundles et des sources de cette
reconstruction. Les timings antérieurs aux commits ne sont donc pas rattachés
à un candidat non identifiable.

```sh
npm run compiler:build
COMPILER_RUNS=7 COMPILER_ITERATIONS=5 \
  COMPILER_OUTPUT=tmp/compiler-final npm run perf:compiler

PAGE_VARIANTS=runtime=craft-page,compiled=craft-page \
  PAGE_COMPILER_LABELS=compiled PAGE_COUNT=false PAGE_SCALES=1,2 \
  PAGE_RUNS=7 PAGE_ITERATIONS=6 PAGE_OUTPUT=tmp/compiler-page-final \
  node apps/framework-benchmark/page-lab.mjs
```

## Montage avec les options par défaut

Temps en millisecondes. Une réduction négative est une régression.

| Cas                               | Taille | Runtime | Compilé | Réduction |
| --------------------------------- | -----: | ------: | ------: | --------: |
| Lignes sans index                 |    100 |     8,1 |     6,5 |    19,8 % |
| Lignes sans index                 |  1 000 |    21,2 |    18,1 |    14,6 % |
| Lignes sans index                 |  5 000 |    66,4 |    50,1 |    24,5 % |
| Lignes avec index                 |    100 |     8,6 |     6,9 |    19,8 % |
| Lignes avec index                 |  1 000 |    28,6 |    20,9 |    26,9 % |
| Lignes avec index                 |  5 000 |    84,1 |    70,5 |    16,2 % |
| Quatre niveaux de composants      |    100 |    11,2 |    10,8 |     3,6 % |
| Quatre niveaux de composants      |  1 000 |    39,0 |    41,5 |    −6,4 % |
| Quatre niveaux de composants      |  5 000 |   149,8 |   121,7 |    18,8 % |
| Un panneau de champs indépendants |    128 |     4,2 |     4,5 |    −7,1 % |

Le panneau n'est monté qu'une fois par navigation et les écarts de quelques
dixièmes de milliseconde sont fragiles. Sa preuve utile est la granularité :
modifier le premier ou le dernier champ ne relit que ce champ, dans toutes les
variantes. Cette campagne ne démontre pas une accélération générale des petits
composants ou de toutes les profondeurs d'arbre.

À 5 000 lignes sans index, le temps local navigation → DOM prêt passe de
89,8 à 67,7 ms ; avec index, de 105,0 à 94,5 ms. Les observations avec deux frames
et leurs distributions restent dans le JSON, sans les assimiler à une peinture.

## Attribuer les gains et évaluer le clonage

Toutes ces variantes sont mesurées dans la même cohorte.

| Montage de 5 000 éléments                 | Runtime | Fabriques DOM seules | DOM + listes prouvées | DOM + listes + clones |
| ----------------------------------------- | ------: | -------------------: | --------------------: | --------------------: |
| Lignes sans index                         |    66,4 |                 56,5 |                  50,1 |                  57,4 |
| Lignes avec index                         |    84,1 |                 76,8 |                  70,5 |                  69,4 |
| Quatre niveaux, seule la feuille éligible |   149,8 |                122,1 |                 121,7 |                 121,7 |

La spécialisation des listes apporte un complément mesurable à la création DOM
sur les lignes simples. Les pourcentages des passes ne s'additionnent pas.
Le clonage ralentit le cas sans index face à la création directe et ne gagne que
1,1 ms avec index dans cette série. Son blueprint est construit au premier besoin,
dans la fenêtre de montage ; aucune préparation n'est cachée avant le chronomètre.

Heap après le même parcours d'actions puis GC, en Mio : sans index,
**25,65 → 23,37** avec les options par défaut ; avec index,
**33,40 → 29,83**. Le nombre de propriétaires DI n'est pas fusionné.

## Mises à jour : bénéfices et régressions

Médianes en millisecondes, 5 000 lignes, options par défaut.

| Action              | Sans index runtime | Sans index compilé | Avec index runtime | Avec index compilé |
| ------------------- | -----------------: | -----------------: | -----------------: | -----------------: |
| Modifier une ligne  |                1,1 |                1,2 |                1,0 |                1,1 |
| Modifier un dixième |                4,8 |                4,4 |                4,2 |                4,0 |
| Inverser            |               7,45 |               7,75 |              27,25 |               24,2 |
| Filtrer             |                5,6 |                7,0 |               17,4 |               16,9 |
| Restaurer           |               24,3 |               16,2 |               34,6 |               33,6 |

Le remontage partiel profite de la création spécialisée. **Le filtrage sans
index régresse de 25 %**, et les petites modifications ne gagnent pas de façon
convaincante. Ce compromis est conservé explicitement : le montage est la
priorité, et `lists: false` reste disponible pour une mesure applicative.
Une investigation du coût de destruction des plages à racine unique est une
suite utile ; cette campagne n'en établit pas la cause.

## Une vraie page : couverture encore limitée

La page d'administration existante emploie composants, services, formulaires,
menus, filtres, tableaux, onglets et événements. Les deux builds sont identiques
après **47 snapshots par taille et par variante**, y compris les interactions UI.
Sept navigations par variante/taille servent ensuite aux timings, avec six
boucles après deux échauffements. Aucun comptage par proxy ne participe à cette
vérification, car ces proxies désactiveraient le chemin compilé.

| Cas                                 |   Runtime |   Compilé |
| ----------------------------------- | --------: | --------: |
| Montage, taille 1, 2 579 éléments   |   39,9 ms |   40,8 ms |
| Montage, taille 2, 4 788 éléments   |   58,8 ms |   58,3 ms |
| Tri, taille 2                       |   1,95 ms |   1,70 ms |
| Changement d'onglet, taille 2       |   8,40 ms |   7,40 ms |
| Restauration après filtre, taille 2 |   8,10 ms |   7,65 ms |
| Heap après montage, taille 2        | 16,54 Mio | 16,09 Mio |

Il n'y a pas de gain de montage convaincant sur cette page. Les définitions
éligibles sont `Icon`, `Badge`, `Avatar`, `Tag`, `Timestamp`, `EmptyState` et le
`FieldError` partagé : **7 sur 62** inspectées. Les factories `pluck`/`derive`,
les événements, `attrs`, les contrôles spéciaux et les appels à d'autres
composants empêchent encore la compilation de nombreuses définitions. Étendre
cette couverture a davantage d'intérêt que d'annoncer les gains du microbenchmark
comme un gain général de l'application.

## Poids du code et coût du build

Totaux JS de l'entrée du microbenchmark, qui contient les différentes fixtures.

| Variante             |     JS minifié |    Somme gzip |
| -------------------- | -------------: | ------------: |
| Runtime              | 184 535 octets | 53 716 octets |
| Fabriques DOM seules |        207 243 |        57 529 |
| Options par défaut   |        207 300 |        57 553 |
| Clonage              |        213 982 |        58 932 |

Les options par défaut ajoutent **3 837 octets gzip** à cette entrée. Le panneau
de 128 champs déroule beaucoup de code et le template de repli est conservé.
Le package Node du compilateur et le parseur TypeScript ne sont pas embarqués
par le navigateur.

Même sans plugin, l'infrastructure de rendu et le correctif partagé ajoutent
**4 254 octets minifiés / 1 192 octets gzip** face au runtime du commit de base,
sur la même source de fixture. Le caractère optionnel ne signifie donc pas
zéro octet de support runtime dans cette première version. Isoler davantage ce
support dans un module activé par le compilateur serait une amélioration utile.

Les appels Vite chronométrés ont pris environ 150–186 ms selon la variante,
mais ils partagent un processus et des caches. Le chargement initial du plugin
et de TypeScript précède ce timer : ces chiffres ne mesurent pas un démarrage
CLI à froid et ne suffisent pas à attribuer un surcoût de build précis.
Les tailles des builds de la page réaliste incluent aussi les autres entrées du
laboratoire multi-framework ; elles ne sont pas présentées comme son poids chargé.

## Regrouper les composants : potentiel réel, contrat à préserver

Le contrôle `nested` et le contrôle `flat` produisent le même DOM natif :
quatre propriétaires par item dans le premier, un seul dans le second. Sans
compilateur, à 5 000 items, ils montent en **149,8 et 76,8 ms** : environ 49 %
de durée en moins dans le contrôle aplati.

C'est un plafond expérimental, pas une réécriture livrée ni un gain attribué au
plugin. Aplatir change les frontières DI, la destruction, les scopes CSS et les
adresses de composants. La direction préférable est d'assembler une fabrique DOM
commune parent/enfants **en conservant leurs propriétaires logiques**, puis de
mesurer si des propriétaires légers peuvent remplacer des injecteurs physiques
sans changer ces contrats. Le [plan de suite](../plans/2026-11-16-optional-compiler.md)
détaille les preuves et les autres pistes prioritaires.

## Vérifications et problème indépendant corrigé

- 48 tests du compilateur : transformations, alias et scopes, source maps, listes
  prouvées, granularité, inputs, clones, DI, destruction avec erreur, invalidation,
  repli instrumenté, SSR/hydratation et parité d'adresses d'éléments.
- Suite Component : 607 tests réussis ; suite Core : 1 684 tests réussis, un échec
  attendu et trois TODO préexistants ; huit tests ciblés de batch réussis, dont
  les deux nouvelles régressions.
- TypeScript Core/Component/Compiler et specs Compiler, lint Compiler, 44 tests
  de tooling/release, build Nx et création/import du package distribué validés.
- Aucun replay d'archives historiques n'a été effectué : aucune compatibilité
  générale avec ces archives n'est affirmée.

Le dépassement de pile de `craftBatch` se reproduisait aussi sans compilateur
sur 5 000 lignes à quatre niveaux. Un test de 6 000 cellules le réduit à la
publication réentrante de batches. Les fins de batches sont maintenant équilibrées
après le drain actif, toujours de façon synchrone, y compris après erreur. Les
anciennes campagnes arrêtées sur cette erreur ont été écartées des résultats.
