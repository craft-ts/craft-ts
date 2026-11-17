# Campagne de vérification des pistes de performance

Référence figée : `89f1e46de`. Branche : `codex/all-performance-experiments`.
Implémentation des listes locales : `cd3d220e9`.
La campagne reste **en cours**. Son [inventaire](2026-11-17-performance-campaign.json)
contient 27 pistes ; ce rapport couvre quatre nouveaux essais mesurés, deux
prototypes de cache refusés et l'audit de trois campagnes précédentes.
Les [données](2026-11-17-performance-campaign-summary.json) conservent les
échantillons, les décisions, les contrats, les empreintes et les méthodes.

## Changement retenu : listes de composants locaux

Le compilateur reconnaît maintenant les constantes locales de composants, par
leur symbole TypeScript. Deux fonctions peuvent chacune déclarer `const Row`
sans collision. Le callback doit toujours se limiter à transmettre ses inputs.
L'extension s'applique aux modes compilés existants ; le compilateur reste
optionnel et le mode `lean` conserve ses compromis documentés.

Le compilateur refuse une spécialisation qui lirait la constante trop tôt :
descripteur créé avant son initialisation, récursion dans son initialiseur,
fonction déclarée susceptible d'être appelée par hoisting. Le repli reste
conservateur, même si certains programmes pourraient être spécialisés avec une
analyse plus poussée du flot d'exécution. Ce garde-fou corrige aussi un cas
possible avec une constante de module et une fonction de création hoistée.

Même application pour les deux variantes : les définitions sont placées dans
une fonction de construction. La référence compile déjà leurs templates mais
ne spécialise pas leurs listes. Les chiffres suivants mesurent donc le gain
de **couverture des listes locales**, sans le confondre avec le gain total du
compilateur face au runtime.

5 000 lignes, cinq navigations par variante, médianes :

| Mesure                        |      Référence |     Extension locale |
| ----------------------------- | -------------: | -------------------: |
| Montage sans index            |        20,2 ms |  **13,9 ms** (−31 %) |
| Inversion sans index          |        5,35 ms |              3,70 ms |
| Filtrage / restauration       | 2,70 / 5,60 ms |       1,60 / 3,90 ms |
| Modifier une ligne sans index |        0,80 ms |              1,00 ms |
| Tas après parcours et GC      |       8,77 Mio | **4,96 Mio** (−43 %) |
| Montage avec index            |        30,0 ms |  **20,1 ms** (−33 %) |
| Inversion avec index          |       14,45 ms |              9,50 ms |
| Tas avec index                |      12,17 Mio |             8,72 Mio |

La petite modification d'une ligne sans index reste légèrement plus lente,
comme les entrées lean déjà spécialisées au niveau du module. Les 128 champs
indépendants conservent leurs lectures séparées. Le JS de cette fixture passe
de 214 816 à 214 902 octets ; gzip de 59 314 à 59 336 octets (+22).

Sur la page réaliste, sept navigations et 47 instantanés d'interactions
confirment le même comportement. Le montage passe de 36,4 à 35,5 ms, le tas
reste à 7,76 Mio. Les distributions se recouvrent : **aucun gain sur cette
page n'est attribué à l'extension**, dont la couverture supplémentaire n'y
constitue pas la charge utile. Les pourcentages des deux tableaux ne
s'additionnent pas aux campagnes précédentes.

## Allocations des requêtes de service

Deux candidats compatibles passent chacun les sept nouveaux contrats et la
suite Core complète :

- **Sans wrapper** : lire les métadonnées dans le même ordre, puis résoudre
  directement sans créer l'objet contexte et sa fermeture.
- **Résolveurs partagés** : fonctions communes liées avec `bind`, qui conservent
  les arguments, l'arité et l'indépendance du receiver des anciennes flèches.

La première cohorte de page semblait favorable : montage 36,6 → 32,9 ms sans
contexte, ou 33,9 ms avec les résolveurs partagés. La confirmation à sept
navigations réduit le premier écart à **36,4 → 35,9 ms**. Le gain de montage
initial n'est donc pas confirmé.

Un banc ciblé, sept navigations par cas et variante, effectue 10 000 opérations
par boucle, après deux échauffements. Il vérifie le résultat et l'unicité de
l'instance de service ; un contrôle active un wrapper de résolution.

| Sans wrapper, 10 000 opérations |   Référence | Sans contexte | Résolveurs liés |
| ------------------------------- | ----------: | ------------: | --------------: |
| Créer des requêtes conservées   |      2,0 ms |        2,0 ms |          2,1 ms |
| Résoudre le service             |      4,3 ms |        4,4 ms |          4,6 ms |
| Lire par raccourci              |      4,6 ms |        4,7 ms |          4,8 ms |
| Tas supplémentaire après GC     | 2 267 660 o |   2 264 684 o |     2 228 116 o |

Les résolveurs liés économisent environ quatre octets par requête conservée,
pour un léger recul temporel. Avec wrapper, la résolution passe de 11,6 à
13,0 ms pour ce candidat. **Aucun de ces deux changements n'est intégré** :
le premier manque de bénéfice établi, le second ne justifie pas son compromis.
Leurs tailles et les distributions complètes figurent dans les données.

## Marquage des services : deux caches refusés

Le cache « objet déjà vu » donne un plafond intéressant : sur la page, thème
3,15 → 2,05 ms et restauration après filtre 4,9 → 4,3 ms. Mais il échoue sur
trois contrats : ajout/remplacement de membres réactifs, getters relus, accès
observables aux proxies. Un cache restreint aux objets gelés avec propriétés
de données échoue lui aussi sur les proxies, et ne donne pas de gain net.

Ces chiffres décrivent **des candidats incompatibles**, exclus du produit.
L'égalité des 47 instantanés de cette page ne suffit pas à les rendre corrects.
La piste d'objets possédés par Craft avec invalidation versionnée reste ouverte ;
ces deux expériences ne la valident pas.

## Bindings résolus sans effet : prototype limité

Un WeakMap reconnaît uniquement les lecteurs de constantes primitives créés
par Craft. Le compilateur annote les inputs directs et les génératrices
constituées d'un unique retour délégué à un input. Un binding ainsi prouvé
applique sa valeur sans créer d'effet Alien. Les fonctions arbitraires, les
lecteurs réactifs, les valeurs objets et leurs propriétés restent génériques.
Le prototype ne sonde ni callbacks ni getters pour essayer de prouver leur pureté.

Sept navigations par variante, 5 000 lignes :

| Cas                                       | Montage avant / après | Tas avant / après |
| ----------------------------------------- | --------------------: | ----------------: |
| Lignes ordinaires avec propriétés d'objet |        14,5 / 14,6 ms | 4,937 / 4,937 Mio |
| Lignes avec index réactif                 |        19,9 / 20,0 ms | 8,716 / 8,753 Mio |
| Fixture d'inputs primitifs directs        |    **19,5 / 18,3 ms** | 8,439 / 8,487 Mio |
| Page réaliste                             |        36,2 / 36,2 ms |   7,76 / 7,77 Mio |

Le gain d'environ 6 % sur la fixture ciblée ne se retrouve pas sur la page.
Le montage ajoute aussi un peu de mémoire et environ 112–119 octets gzip sur
les bancs des lignes. **Prototype conservé dans le laboratoire, pas activé.**
Il passe Core (1 709 tests rapportés), Component (609) et Compiler (58), plus
les contrats navigateur. Ces comptes Core incluent un échec attendu existant ;
trois TODO restent présents.

## Méthode et vérifications

Apple M3, Node 25.2.1, Chromium 153.0.8010.12. Builds production minifiés,
contextes frais et ordre mélangé avec graine fixe. Les tests et diagnostics
ne sont pas exécutés pendant les cohortes finales de timing. Un premier écran
des bindings a été écarté à cause d'un chevauchement possible avec les tests ;
seules les répétitions suivantes à sept navigations sont archivées ici.

Le montage mesure le bootstrap JavaScript, et les actions le travail JS/DOM
jusqu'aux microtâches ; ce ne sont pas des mesures LCP, réseau, layout ou paint.
Le heap correspond au JS retenu après GC explicite. Les durées des builds,
exécutés dans un même processus, sont sensibles à l'ordre et au cache : aucune
accélération de build n'est déduite de ces durées.

Les candidats sont reconstruits depuis le commit de référence sous
`tmp/performance-campaign/roots`. Leurs tests utilisent leurs propres imports
relatifs ; leurs bundles utilisent leurs bibliothèques **et leur plugin**.
Les références TypeScript vers les autres projets absents sont retirées
uniquement dans ces copies ; les options de compilation restent identiques.

Le compilateur intégré passe **63 tests**, le contrôle TypeScript de ses specs
et son build. Six tests nouveaux couvrent les constantes locales, les collisions,
les masquages et l'ordre d'initialisation. Les tests navigateur vérifient le
DOM, les identités conservées, les index, la granularité et la destruction.
Les sorties intégrées des 13 sources de la page et du banc local sont identiques
octet par octet à celles du candidat mesuré. Le lint ne relève aucune erreur
et conserve cinq avertissements existants ; le contrôle NX des frontières est
ignoré faute de ProjectGraph en cache. Aucune dépendance de projet n'est ajoutée.

## Reproduire les essais

Depuis la racine du dépôt, avec les dépendances installées :

```sh
node apps/compiler-benchmark/experiments/services.mjs
node apps/compiler-benchmark/experiments/local-lists.mjs
node apps/compiler-benchmark/experiments/effectless.mjs
node apps/compiler-benchmark/experiments/test-services.mjs
node apps/compiler-benchmark/experiments/test-services.mjs --full baseline empty-wrapper bound-resolvers effectless

CAMPAIGN_LOCAL_FIXTURE=true COMPILER_CASES=rows,indexed,fields COMPILER_ROWS=5000 \
  node apps/compiler-benchmark/experiments/run-micro.mjs baseline local-lists
node apps/compiler-benchmark/experiments/run-services.mjs baseline empty-wrapper bound-resolvers mark-once-ceiling mark-frozen
PAGE_RUNS=7 CAMPAIGN_OUTPUT=confirmation-page \
  node apps/compiler-benchmark/experiments/run-page.mjs baseline empty-wrapper local-lists
COMPILER_RUNS=7 COMPILER_CASES=rows,indexed,fields COMPILER_ROWS=5000 \
  CAMPAIGN_OUTPUT=effectless-ordinary-confirmed \
  node apps/compiler-benchmark/experiments/run-micro.mjs baseline effectless
COMPILER_RUNS=7 CAMPAIGN_SCALAR_FIXTURE=true COMPILER_CASES=rows,fields COMPILER_ROWS=5000 \
  CAMPAIGN_OUTPUT=effectless-scalars-confirmed \
  node apps/compiler-benchmark/experiments/run-micro.mjs baseline effectless
PAGE_RUNS=7 CAMPAIGN_OUTPUT=effectless-page \
  node apps/compiler-benchmark/experiments/run-page.mjs baseline effectless
```

Les deux candidats de cache doivent échouer aux contrats indiqués : c'est la
raison de leur refus. Les autres sources applicatives et l'ancien prototype
impératif restent absents des mutations de production.

## Suite encore ouverte

Le manifeste distingue les essais terminés des tâches restantes : fusion de
bindings, rebinds partiels, imports intermodules, couverture des templates et
structures, fabriques DOM communes, fragments, injecteurs, bundle, hydratation,
OXC, CSS, virtualisation et montage progressif. L'ablation lean historique
nécessite aussi de réarchiver ses données brutes. Le marquage versionné reste
partiel. **Cette livraison n'achève pas l'objectif de mesurer toutes les pistes.**
