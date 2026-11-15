# Renderer « à la demande » — plancher du modèle d'écriture et six lots

13–15 novembre 2026. Branche `claude/craft-ts-performance-16a01f`, partie de `main` = `a649951a9` (0.11.0) dans laquelle `perf/runtime-transparent` a été fusionnée. Apple M3, Node v22.23.3, Chromium Playwright, builds Vite de production minifiés.

**La même application, sans en changer une ligne, se monte ~4,4 fois plus vite sur un renderer minimal : le modèle d'écriture n'est pas le problème, la comptabilité du renderer l'est.** Six lots appliqués au vrai renderer en récupèrent une bonne part ; les chiffres ci-dessous sont ceux des cinq premiers. Sur la fixture générique, dans une même cohorte mesurée machine calme (section 4 quater) :

| | `main` 0.11.0 | + runtime transparent | + ces cinq lots | Plancher | Solid |
|---|---:|---:|---:|---:|---:|
| Montage, 1 000 lignes | 59,4 ms | 39,2 ms | **23,6 ms** | 8,8 ms | 5,9 ms |
| Montage, 5 000 lignes | 238,5 ms | 135,1 ms | **59,0 ms** | 24,9 ms | 18,2 ms |
| Rétablir 2 500 lignes sur 5 000 | 92,8 ms | 60,5 ms | **22,3 ms** | 17,9 ms | 12,4 ms |
| Tas après GC, 5 000 lignes | 106,5 Mio | 60,6 Mio | **28,7 Mio** | 13,5 Mio | 11,5 Mio |

Le sixième lot, mesuré dans une cohorte suivante, baisse encore la mémoire (tas à 27,3 Mio, 9,4 Ko alloués par ligne au montage contre 30,3 au départ) sans gain de temps mesurable (section 4 quinquies). Rien n'est commité ni poussé.

## 1. Où part le temps

Fixture générique de `apps/framework-benchmark` (un composant par ligne, `forNode` à clés, bindings génératrices), 1 000 lignes sans index, médiane de 5 navigations :

| Implémentation | Montage | Une ligne | 10 % | Inversion | Filtrer | Rétablir | Tas après GC |
|---|---:|---:|---:|---:|---:|---:|---:|
| CraftTS (branche fusionnée) | 42,9 ms | 0,70 | 4,80 | 4,65 | 5,20 | 14,6 | 14,3 Mio |
| Solid + store | 6,5 ms | 1,50 | 2,45 | 3,15 | 1,65 | 3,9 | 3,5 Mio |
| DOM natif | 1,5 ms | 0,45 | 0,80 | 2,45 | 1,00 | 1,2 | 1,4 Mio |

Les mises à jour ciblées sont déjà au niveau des autres. L'écart est dans la création et la destruction.

Le profil CPU du montage de 5 000 lignes est plat : aucune fonction ne dépasse 6 % en temps propre. Les opérations DOM réelles pèsent environ 10 ms sur 127. Le reste est de la comptabilité JavaScript, et le ramasse-miettes en prend 16 à 30 % selon les navigations. L'échantillonnage des allocations donne **30,3 Ko alloués par ligne** au montage.

## 2. POC « plancher » : la même app sur un renderer minimal

[`src/craft-floor/component.ts`](../../apps/framework-benchmark/src/craft-floor/component.ts) réimplémente `craftComponent`, `div`, `span`, `forNode` et `bootstrapCraft` en ~450 lignes. La fixture [`src/craft-floor/main.ts`](../../apps/framework-benchmark/src/craft-floor/main.ts) est celle de `src/craft/main.ts` à une ligne d'import près. Services, DI, signaux et driver de génératrices sont ceux du vrai noyau.

Il garde la même structure réactive que le renderer de production : un effet par entrée de liste, un par composant, un par binding. Il retire les identités de rendu, les cibles replay, les rapports d'effets, les traces, l'injecteur des composants sans provider, les paires de commentaires et les contextes recopiés.

| 1 000 lignes sans index | Montage | Rétablir | Tas après GC | Alloué par ligne |
|---|---:|---:|---:|---:|
| CraftTS (branche fusionnée) | 45,4 ms | 14,2 ms | 14,2 Mio | 30,3 Ko |
| Plancher | 10,2 ms | 4,25 ms | 4,25 Mio | 4,5 Ko |
| Solid | 6,7 ms | 3,55 ms | 3,5 Mio | — |

Ce n'est pas un renderer utilisable : ni SSR, ni hydratation, ni directives, ni événements, ni frontières. Il mesure une borne : hyperscript, génératrices et un composant par ligne coûtent ~10 ms, pas 45. Un gain d'ordre ×3 à ×4 est donc atteignable sans compilateur, sans changer l'écriture des applications et sans changer de langage.

### Sur WebAssembly

Aucun POC WebAssembly n'a été fait, et les mesures ci-dessus expliquent pourquoi il ne serait pas prioritaire :

- les opérations DOM (le seul travail qu'un module Wasm ne peut pas faire lui-même) pèsent moins de 10 % du montage, et la référence DOM native en JavaScript est déjà à 1,5 ms ;
- le noyau réactif (alien-signals) pèse 2 à 3 % du profil : un noyau Wasm infiniment rapide gagnerait au plus cela ;
- le reste est de la comptabilité autour de fermetures JavaScript (templates, bindings, services de l'application), qu'un module Wasm ne peut ni exécuter ni stocker sans repasser par JavaScript.

Le plancher montre que le facteur 4 est disponible en JavaScript. Rust reste pertinent pour un outil de compilation, pas pour le runtime.

## 3. Ce qui a été changé dans le vrai renderer

Chaque lot garde les contrats : mêmes rapports d'effets (sources, tags, ordinaux), mêmes adresses replay, même DOM, mêmes erreurs. Ce qui change est le moment où le travail est fait.

**Lot 1 — identités et cibles replay à la demande.**
- [`craft-render-identity.ts`](../../libs/core/src/lib/craft-render-identity.ts) : une identité garde ses segments et calcule `path` et `hydrationKey` à la première lecture. La validation d'un segment mal formé reste immédiate (`isWellFormed`).
- [`craft-replay-target.ts`](../../libs/core/src/lib/craft-replay-target.ts) : monter un élément lie un enregistrement dans la liste de son arbre de rendu. L'empreinte de l'adresse est calculée par la première capture ou résolution. Les arbres sont tenus faiblement : un arbre abandonné sans `destroy` ne retient rien.
- Contexte de rendu à forme fixe (`RenderContextState`) au lieu d'objets décomposés.

**Lot 2 — effets de rendu compacts, résolutions par injecteur.**
- `ɵCraftRenderEffect` ([`craft-effect.ts`](../../libs/core/src/lib/craft-effect.ts)) : l'effet d'un binding est un objet ; son rapport est construit quand un snapshot le lit.
- `RenderAmbient` ([`interpreter.ts`](../../libs/component/src/lib/render/interpreter.ts)) : registre d'effets, tags du propriétaire, mode d'exécution et wrappers de fonctions sont résolus une fois par injecteur, dans l'ordre où ils l'étaient. Un composant qui ne déclare aucun provider les hérite de son parent.
- [`craft-generator-runtime.ts`](../../libs/core/src/lib/craft-generator-runtime.ts) : une génératrice qui retourne sans céder (lecture d'un input, d'un index) ne passe plus par le driver. `isGeneratorFunction` répond sans `toString` pour une fonction ordinaire.
- [`craft-injector.ts`](../../libs/core/src/lib/host/craft-injector.ts) : un jeton sans fabrique par défaut n'ouvre plus de contexte d'injection à chaque niveau de la chaîne.

**Lot 3 — allocations par ligne.**
- Injecteur natif réécrit en classe à déclarations sans état. Les providers du scope d'un composant sont préparés une fois par définition (`ɵprepareEnvironmentProviders`) et partagés ; chaque injecteur ne garde que ce que ses fabriques ont construit. L'identité de rendu et l'`ElementRef` sont lus sur l'instance au moment où on les demande.
- Enveloppes d'inputs créées à la première lecture ; gestionnaires de `Proxy` en classes ; `yieldableInvocation` sans génératrice.
- `Map`, `Set` et tableaux créés seulement quand ils servent (attributs, écouteurs, bindings, noms de contenu, `seen`).

Alloué par ligne au montage (5 000 lignes, échantillonnage) : **30,3 Ko → 13,9 Ko**. Plancher : 4,5 Ko.

## 4. Mesures

Runner : [`lab.mjs`](../../apps/framework-benchmark/lab.mjs). Contexte Chromium neuf par navigation, ordre des variantes mélangé, 7 navigations par case, médianes. Actions : 2 de chauffe puis 6 mesurées. « Référence » est la branche fusionnée avant ces lots (elle contient déjà le lot « runtime transparent »).

| Lignes | Index | Montage | 10 % | Filtrer | Rétablir | Tas après GC |
|---:|:---:|---:|---:|---:|---:|---:|
| 1 000 | non | 43,9 → **28,1** (−36 %) | 4,25 → 3,40 | 4,05 → 3,05 | 12,7 → 7,25 | 14,3 → 8,9 Mio |
| 1 000 | oui | 52,6 → **32,3** (−39 %) | 3,40 → 3,00 | 8,45 → 6,65 | 18,8 → 11,9 | 18,4 → 11,1 Mio |
| 5 000 | non | 153,9 → **74,7** (−51 %) | 8,70 → 5,25 | 18,9 → 13,6 | 62,7 → 36,1 | 60,6 → 33,7 Mio |
| 5 000 | oui | 212,4 → **102,0** (−52 %) | 11,3 → 6,85 | 40,0 → 29,0 | 101,6 → 52,7 | 81,1 → 45,1 Mio |

Dans la même cohorte, à 1 000 lignes sans index : plancher 9,9 ms, Solid 6,2 ms, DOM natif 1,5 ms. La mise à jour d'une ligne et l'inversion ne bougent pas (0,5 ms et 3,35 ms).

Gain cumulé depuis `main` 0.11.0, dans une cohorte séparée (machine plus chargée, charge moyenne 6 à 8 : les valeurs à 5 000 lignes y sont gonflées pour toutes les variantes) :

| Lignes | `main` 0.11.0 | + runtime transparent | + ces trois lots | Solid |
|---:|---:|---:|---:|---:|
| 100 | 15,6 ms | 12,7 ms | **11,0 ms** | 1,7 ms |
| 1 000 | 57,7 ms | 40,5 ms | **27,2 ms** | 5,9 ms |
| 5 000 | 402 ms | 227 ms | **123 ms** | 31,7 ms |

Une série intermédiaire, mesurée pendant qu'un autre processus occupait ~300 % de CPU, a été écartée.

## 4 bis. Lot 4 — destruction, déplacements, ancres

**Ce qui change.**
- **Entrées de liste créées à leur place** ([`interpreter.ts`](../../libs/component/src/lib/render/interpreter.ts), `ForRenderedNode.reconcile`). Les nouvelles entrées étaient toutes créées en fin de conteneur, puis la passe d'ordre déplaçait les lignes *existantes* autour d'elles : rétablir 2 500 lignes déplaçait les 2 500 autres. La passe d'ordre crée maintenant chaque nouvelle entrée devant sa suivante. Pendant l'hydratation, l'ordre de création reste celui du document.
- **Destruction sans allocation** pour les nœuds texte, élément, fragment et composant : un drapeau au lieu du `WeakSet`, les libérations écrites en ligne au lieu d'un tableau de fermetures. Toutes s'exécutent toujours avant qu'une erreur ne remonte. Un élément détruit ne retire plus ses descendants du DOM un par un : ils partent avec lui.
- **Ancres de composant optionnelles.** En rendu client, un composant dont la sortie est un seul élément n'a plus de paire de commentaires : l'élément est toute la plage. La paire apparaît autour de lui dès que la sortie devient vide, multiple ou d'une autre nature, et le reste ensuite. Le rendu serveur et l'hydratation gardent leurs commentaires. Les commentaires des entrées de liste sont conservés : l'acteur de page des dev tools lit `craft-for:<clé>:start`.
- Un nœud texte ne recopie plus de contexte pour une identité qu'il ne lit qu'à l'hydratation. Cellules privées sans fermetures par cellule. `pipe` porté par un prototype partagé au lieu d'un `defineProperty` par nœud. État de `DestroyRef` sur l'objet plutôt que dans une `WeakMap`. Premier résultat de fabrique d'un injecteur gardé sans `Map`. Tags du propriétaire sans copie quand l'injecteur est son propre environnement.

**Mesures.** La machine était chargée pendant toute cette partie (charge moyenne 7 à 34 selon les séries) : les temps absolus sont gonflés et je ne donne que le rapport à la référence, mesuré dans la même cohorte mélangée. Quatre cohortes concordent sur le filtrage et le rétablissement, et sur l'inversion à 5 000 lignes.

| 5 000 lignes sans index, part de la référence | Avant le lot 4 | Après le lot 4 |
|---|---:|---:|
| Montage | 49 % | 50 % |
| Inversion | 94 % | 60 % |
| Filtrage | 72 % | 37 % |
| Rétablissement | 58 % | 34 % |

Dernière cohorte (7 navigations, six variantes dont `main` 0.11.0), en part de la référence « runtime transparent » :

| Lignes | Index | Montage | 10 % | Inversion | Filtrage | Rétablissement |
|---:|:---:|---:|---:|---:|---:|---:|
| 1 000 | non | 60 % | 56 % | 109 % | 39 % | 36 % |
| 1 000 | oui | 55 % | 58 % | 91 % | 40 % | 40 % |
| 5 000 | non | 43 % | 47 % | 64 % | 37 % | 35 % |
| 5 000 | oui | 44 % | 48 % | 61 % | 37 % | 39 % |

Dans cette cohorte, par rapport à `main` 0.11.0 : montage à 35 % (1 000 lignes) et 24 % (5 000 lignes), rétablissement à 33 % et 20 %.

L'inversion ne gagne qu'à 5 000 lignes ; à 1 000 lignes elle reste dans le bruit. Le gain de montage propre au lot 4 n'est pas établi : selon la série, il va de nul à une dizaine de points. Deux grandeurs ne dépendent pas de la charge :

| | Avant le lot 4 | Après |
|---|---:|---:|
| Tas après GC, 1 000 lignes | 8,88 Mio | 8,26 Mio |
| Tas après GC, 5 000 lignes | 33,7 Mio | 30,6 Mio |
| Tas après GC, 5 000 lignes avec index | 45,1 Mio | 40,6 Mio |
| Alloué par ligne au montage | 13,9 Ko | 12,8 Ko |
| Commentaires pour 30 lignes | 124 | 62 |

À refaire sur machine calme avant de publier un chiffre de temps pour ce lot.

## 4 ter. Lot 5 — instance de composant, bindings, résolutions

**Ce qui change.**
- **Injecteur** ([`craft-injector.ts`](../../libs/core/src/lib/host/craft-injector.ts)) : la présence d'un fallback est lue une fois à l'entrée de `get`, puis la chaîne des parents est parcourue sans objet `arguments` à chaque niveau ; la détection de cycle ne crée plus de fermeture par résolution.
- **Registre d'effets** ([`take-app-snapshot.ts`](../../libs/core/src/lib/take-app-snapshot.ts)) : les effets vivants sont une liste chaînée dans l'ordre de suivi, au lieu d'un `Set`. L'ordre des rapports est inchangé.
- **Effet de rendu** : démarré sans fermeture par effet.
- **`isGenerator`** ([`craft-generator-runtime.ts`](../../libs/core/src/lib/craft-generator-runtime.ts)) : un objet génératrice est reconnu par le prototype que toutes partagent, avant la lecture de `next` qui voyait toutes les formes d'objets.
- **Bindings d'attribut** ([`interpreter.ts`](../../libs/component/src/lib/render/interpreter.ts)) : un objet `AttributeBinding` par attribut lié au lieu de trois fermetures et d'un enregistrement ; noms de binding et d'effet construits une fois par nom d'attribut ; au premier rendu d'un élément, les attributs sont lus directement, sans `Map`. Un binding inchangé ne crée plus de fermetures à chaque patch.
- **Composant** : un contexte de moins par instance (celui du composant devient celui de sa vue), un autre de moins pour son élément racine (la portée racine est effacée à la création du contexte de chaque enfant), l'adaptateur de fonctions déjà résolu est passé au rendu du template, la fusion de props d'hôte vides ne crée plus rien, et les enregistrements de cible sans directive ne passent plus par `flatMap`.
- **Liste** : sous le planificateur synchrone, une entrée est rendue directement, sans tâche à remettre.
- Éléments et nœuds texte créés sans objet intermédiaire en rendu client ; `normalizeChildren` sans fermeture.

**Mesure indépendante de la charge.** Alloué par ligne au montage : 12,6 Ko → **10,1 Ko**. Les temps sont en section 4 quater.

**Laissé de côté, à décider.**
- `ɵrunCraftTargetWrappers` inscrit un release vide au `DestroyRef` de chaque composant quand aucun wrapper n'existe (~150 octets par instance). Un test du 6 novembre affirme cette inscription : je ne l'ai pas retirée.
- `hostPropsFromComponentProps` crée un objet neuf à chaque patch, ce qui relance le template du composant à chaque mise à jour venue du parent, même sans prop d'hôte. Rendre l'objet vide stable supprimerait ces rendus ; c'est un changement de comportement.
- Le lecteur d'item d'une entrée de liste est une fonction génératrice : chaque lecture crée un objet génératrice. Le remplacer change la nature de ce que reçoit le template.

## 4 quater. Mesure après le lot 5, machine calme

15 novembre 2026, charge moyenne 4 à 5 du début à la fin. Six variantes mélangées à chaque navigation, 7 navigations par case, médianes. Cette cohorte contient à la fois `main`, le lot « runtime transparent » et les cinq premiers lots ; elle remplace, pour les temps absolus, les ratios sous charge des sections 4 bis et 4 ter.

**1 000 lignes sans index** (ms, tas en Mio)

| | Montage | Une ligne | 10 % | Inversion | Filtrer | Rétablir | Tas |
|---|---:|---:|---:|---:|---:|---:|---:|
| `main` 0.11.0 | 59,4 | 0,75 | 6,55 | 4,85 | 7,55 | 23,25 | 23,4 |
| + runtime transparent | 39,2 | 0,75 | 4,70 | 4,75 | 5,10 | 14,55 | 14,2 |
| + cinq lots | **23,6** | 0,60 | 2,95 | 3,70 | 2,15 | 6,30 | 7,8 |
| Plancher | 8,8 | 0,60 | 1,50 | 2,30 | 1,20 | 4,40 | 4,2 |
| Solid | 5,9 | 1,65 | 2,75 | 3,50 | 1,75 | 4,25 | 3,5 |
| DOM natif | 1,5 | 0,45 | 0,80 | 2,30 | 1,05 | 1,20 | 1,4 |

**5 000 lignes sans index**

| | Montage | Une ligne | 10 % | Inversion | Filtrer | Rétablir | Tas |
|---|---:|---:|---:|---:|---:|---:|---:|
| `main` 0.11.0 | 238,5 | 1,55 | 19,15 | 17,55 | 35,55 | 92,8 | 106,5 |
| + runtime transparent | 135,1 | 1,40 | 11,00 | 18,05 | 18,25 | 60,5 | 60,6 |
| + cinq lots | **59,0** | 1,40 | 6,80 | 11,70 | 7,45 | 22,25 | 28,7 |
| Plancher | 24,9 | 1,55 | 3,80 | 6,50 | 4,15 | 17,9 | 13,5 |
| Solid | 18,2 | 5,55 | 6,95 | 10,80 | 5,45 | 12,4 | 11,5 |
| DOM natif | 6,1 | 1,35 | 2,05 | 6,45 | 2,65 | 3,4 | 1,9 |

**Avec index affiché** : montage 75,9 → 50,1 → **27,6 ms** à 1 000 lignes (Solid 7,4) et 309,4 → 189,8 → **77,8 ms** à 5 000 (Solid 25,3) ; rétablissement à 5 000 lignes 147,1 → 95,8 → **35,2 ms** (Solid 21,1).

Lecture :
- **Montage** : divisé par 2,5 à 1 000 lignes et par 4 à 5 000 depuis `main`. Il reste 2,4 à 2,7 fois le plancher et 3 à 4 fois Solid.
- **Mises à jour** : une ligne modifiée était déjà au niveau des autres. Dix pour cent des lignes et l'inversion sont maintenant au niveau de Solid ; le filtrage est à 1,2 à 1,4 fois Solid et le rétablissement à 1,5 à 1,8 fois.
- **Mémoire** : le tas après GC est divisé par 3 à 3,7 depuis `main` ; il reste 2,2 à 2,5 fois celui de Solid.

## 4 quinquies. Lot 6 — contexte en deux parties, coûts ponctuels

**Ce qui change.**
- **Contexte de rendu séparé en deux** ([`interpreter.ts`](../../libs/component/src/lib/render/interpreter.ts)). Une *position* porte ce qui change d'un nœud au suivant : identité, stabilité de l'adresse replay, portée racine du composant, rendu en cours de trace. Un *environnement* porte le reste (renderer, injecteur, composant, frontières, hydratation) et n'est recopié que lorsqu'une dérivation le modifie, c'est-à-dire une fois par composant ou par frontière. Dériver le contexte d'un enfant copie cinq champs au lieu de vingt-cinq. L'interface `RenderContext` est inchangée : les champs de l'environnement se lisent par des accesseurs.
- **Source profonde d'une liste** : `isDeepYieldable(source)` était redemandé à chaque rendu de ligne, à travers le `Proxy` du raccourci de service ; il l'est une fois par source.
- **Wrappers de cible** : cherchés une fois par injecteur, hérités par un composant sans provider, au lieu d'une remontée de la chaîne à chaque instance. L'inscription du release vide au `DestroyRef` est conservée.
- **Tags du propriétaire** : la liste de tags qu'un composant lit pour son nom d'hôte sert aussi à ses effets, sans seconde lecture.
- **Enveloppe d'input** : le marqueur « méthode yieldable » est répondu par le gestionnaire du `Proxy` au lieu d'un `defineProperty` par enveloppe. Le marqueur n'est consulté qu'avec `in`.

**Mesure indépendante de la charge.** Alloué par ligne au montage : 10,1 Ko → **9,4 Ko**. Les temps suivent.

**Écarté.** Les cellules privées (~110 octets chacune, trois par ligne) : les alléger davantage demande de changer leur forme d'appel et de réécrire la spec posée le 6 novembre.

**Temps, même protocole que la section 4 quater** (15 novembre, charge 12 au lancement puis 5 à 6 ; le premier cas, 1 000 lignes sans index, a démarré sous charge) :

| Lignes | Index | Montage | 10 % | Inversion | Filtrer | Rétablir | Tas |
|---:|:---:|---:|---:|---:|---:|---:|---:|
| 1 000 | non | 25,1 ms | 2,65 | 2,85 | 2,20 | 4,85 | 7,6 Mio |
| 1 000 | oui | 28,0 ms | 1,95 | 6,25 | 4,35 | 8,10 | 9,2 Mio |
| 5 000 | non | 58,1 ms | 6,20 | 12,05 | 7,55 | 21,85 | 27,3 Mio |
| 5 000 | oui | 76,5 ms | 7,85 | 28,30 | 17,85 | 35,50 | 35,5 Mio |

Dans cette cohorte, `main` est à 62,9 / 81,0 / 242,5 / 331,1 ms de montage, Solid à 6,1 / 7,7 / 18,8 / 25,2 ms.

**Le lot 6 ne produit pas de gain de temps mesurable.** À 5 000 lignes le montage passe de 59,0 à 58,1 ms et de 77,8 à 76,5 ms entre les deux cohortes : c'est dans le bruit. Ce qu'il apporte est en mémoire : tas après GC 28,7 → 27,3 Mio et 37,4 → 35,5 Mio à 5 000 lignes, 7,8 → 7,6 Mio à 1 000, et 7 % d'allocations en moins au montage. La séparation du contexte vaut surtout pour les arbres profonds, où chaque nœud recopiait vingt-cinq champs ; la fixture, une liste plate, la met peu à l'épreuve.

## 4 sexies. Deux changements de comportement, décidés le 15 novembre

Les deux premiers points laissés de côté en section 4 ter sont faits, à la demande. Le troisième (lecteur d'item générateur) ne l'est pas.

**Le template d'un composant ne se relance plus à chaque rendu de son parent.** `ComponentRenderedNode.patch` publiait à chaque fois un objet neuf de props d'hôte ; le composant y lisait un changement et réexécutait son template, inputs inchangés. Les props d'hôte ne sont maintenant publiées que si elles diffèrent : mêmes clés, mêmes valeurs au sens de `Object.is`. Un objet `class` ou `style` littéral, ou un écouteur recréé par le parent, reste une différence, comme avant.

- Ce qui change pour une application : un template qui comptait sur cette relance pour relire une valeur non réactive (variable de module, horloge) ne se rafraîchit plus quand son parent se redessine. Un input qu'il lit, lui, le relance toujours.
- Un composant composé (`withProviders`…) dont ni les inputs ni les props d'hôte ne changent ne reconstruit plus son injecteur à chaque rendu du parent.
- Conséquence observable dans les rapports : les effets de binding d'un composant mis à jour ne sont plus détruits puis recréés. Après une séquence d'actions, les rapports d'effets sont les mêmes (sources et tags), dans un autre ordre.

**Plus d'inscription d'un release vide.** Sans wrapper de cible, `ɵregisterCraftTarget` rend toujours le même release vide, mais ne l'inscrit plus au `DestroyRef` du propriétaire. Le test du 6 novembre qui affirmait cette inscription affirme maintenant son absence.

**Mesure**, face à l'état des six lots, même cohorte, 9 navigations, charge 14 au lancement puis 6 (Solid à 6,8 / 19,1 / 25,3 ms de montage) :

| Lignes | Index | 10 % des lignes | Montage | Tas après GC |
|---:|:---:|---:|---:|---:|
| 1 000 | non | 2,70 → **2,00 ms** (−26 %) | 24,1 → 24,6 ms | 7,56 → 7,41 Mio |
| 5 000 | non | 6,00 → **5,00 ms** (−17 %) | 59,8 → 58,0 ms | 27,3 → 26,7 Mio |
| 5 000 | oui | 7,60 → **5,40 ms** (−29 %) | 75,6 → 75,8 ms | 35,5 → 35,0 Mio |

Mettre à jour un dixième des lignes passe sous Solid dans les trois cas (2,40 / 7,15 / 6,50 ms). Le montage, la mise à jour d'une seule ligne, l'inversion, le filtrage et le rétablissement ne bougent pas au-delà du bruit. La baisse de tas, de l'ordre de 2 %, vient du release vide.

Deux nouveaux tests couvrent le premier point : le template ne se relance pas quand le parent se redessine à l'identique, il se relance quand une prop d'hôte change, apparaît ou disparaît, et un input modifié met à jour son binding sans relancer le template. Le premier échoue si l'on retire le changement.

## 5. Validation

- Core : 1 675 tests réussis sur 168 fichiers, 1 échec attendu et 3 todo inchangés. Component : 604 sur 59 fichiers, dont deux nouveaux pour la section 4 sexies et cinq pour le lot 4 (composant sans ancres, passage à vide / multiple / autre nœud, liste à clés qui bouge autour d'une ligne qui change de forme, lignes rétablies sans déplacer celles restées).
- Types : `tsconfig.spec.json` de Core et Component, `tsconfig.public-surface.json`, et `erasableSyntaxOnly` sur les fichiers touchés.
- ESLint : mêmes comptes d'erreurs et d'avertissements qu'à `HEAD` sur les 14 fichiers source de bibliothèque modifiés (hors `index.ts` et spec).
- Contrats navigateur du runner `runtime-only.mjs` (référence `HEAD`, candidat = arbre de travail) : 123 rapports d'effets sans index et 183 avec, mêmes empreintes, cibles replay résolues, zéro rapport après destruction. Après les lots 1 à 3 le DOM est identique. Après le lot 4, seul le nombre de commentaires diffère (124 → 62) ; le runner a pour cela une option explicite, `RUNTIME_ONLY_COMMENTS_MAY_CHANGE=true`, qui compare tout le reste et affiche l'écart. Après la section 4 sexies, l'ordre des rapports relevés après les actions diffère aussi ; `RUNTIME_ONLY_EXERCISED_ORDER_MAY_CHANGE=true` les compare comme un ensemble, chacun avec sa source et ses tags, et ils sont identiques.
- [`craft-render-identity.spec.ts`](../../libs/core/src/lib/craft-render-identity.spec.ts) compare désormais `path` et `hydrationKey` au lieu des objets, et couvre `ɵchildCraftRenderIdentity` et la sérialisation JSON.

## 6. Coûts et limites

- **Taille** : l'entrée de la fixture passe de 176 549 à 193 258 octets minifiés (51 499 → 56 245 gzip), dont 2 927 octets pour le lot 4, 2 021 pour le lot 5 et 2 390 pour le lot 6. Les anciens chemins restent pour les composants composés ou recevant des providers additionnels.
- **DOM observable** : un composant à racine unique n'a plus de commentaires `craft-component` en rendu client. Un outil ou un test qui compterait les nœuds enfants ou lirait ces commentaires verrait la différence ; aucun n'a été trouvé dans le dépôt.
- **Erreurs de nettoyage** : quand trois libérations ou plus échouent dans des groupes différents d'un même nœud, l'`AggregateError` est désormais à plat au lieu d'être imbriquée.
- **Première capture replay** : les empreintes des éléments vivants sont calculées à la première capture ou résolution, puis seulement pour les nouveaux éléments. Une session enregistrée paie donc ce coût à son premier événement, plus au montage.
- **Formatage** : Prettier a aussi reformaté des lignes déjà non conformes à `HEAD` dans `vnode.ts` (57), `fn-wrapper.ts` (20), `craft-render-identity.ts`, `craft-signal.ts`, `craft-replay-target.ts` et `craft-generator-runtime.ts`.
- Une machine, un navigateur, une fixture de liste. Mesures avant peinture, pas d'INP.
- SSR et hydratation sont couverts par la suite Component, pas par une mesure navigateur. Aucune application de démonstration n'a été lancée ni rejouée de bout en bout.
- La compatibilité avec des archives de sessions replay existantes n'a pas été vérifiée sur des sessions réelles : seule l'égalité des adresses avec la référence l'est.

## 7. Ce qui reste jusqu'au plancher

Pistes lues dans les 9,4 Ko encore alloués par ligne (plancher : 4,5 Ko) et dans le dernier profil, où le ramasse-miettes pèse un tiers du montage et l'évaluation des bindings génératrices un quart ; aucune n'est mesurée, l'ordre est une estimation :

1. **Le lecteur d'item générateur** des listes, dernier des trois points « à décider » de la section 4 ter.
2. **Génératrices de l'écriture** : ~1,4 Ko par ligne en objets génératrices et résultats d'itération (bindings, lecteurs d'item et d'index). Le plancher paie la même chose ; seul un compilateur, ou des lecteurs non générateurs, le retire.
3. **Composant** : ~0,7 Ko pour l'objet et ~0,4 Ko pour les enveloppes d'inputs (`Proxy`, fermetures).
4. **Cellules privées** : ~115 octets chacune, trois par ligne.
5. **Effet d'entrée de liste** : un effet par entrée, qui pourrait disparaître quand le callback ne lit rien de réactif.
6. **Ancres des entrées de liste** : deux commentaires par ligne restent ; les retirer demande de donner à l'acteur de page un autre moyen de lire la clé.

Au-delà du plancher, pour rejoindre Solid, il faut cesser d'interpréter le template à chaque instance : c'est le compilateur de plans de la campagne du 6 novembre. Il devient plus rentable une fois ces coûts retirés, puisqu'il ne butera plus sur l'injecteur ni sur les enregistrements.

## Reproduire

```sh
cd apps/framework-benchmark
LAB_VARIANTS="craft,craft-floor,solid,vanilla" LAB_RUNS=7 node lab.mjs
LAB_VARIANTS="ref=craft@/chemin/vers/une/autre/racine,now=craft" node lab.mjs
LAB_VARIANTS=craft LAB_PROFILE=craft LAB_CASES='[{"rows":5000,"indexes":false}]' node lab.mjs
LAB_VARIANTS=craft LAB_PROFILE=craft LAB_ALLOCATIONS=true node lab.mjs
```

La racine d'une variante `label=entrée@racine` doit contenir `libs/{core,component,style,test-type}` et `tsconfig.base.json`, sous le dépôt pour que `node_modules` se résolve (par exemple `git archive <ref> libs/core libs/component libs/style libs/test-type tsconfig.base.json | tar -x -C tmp/perf-lab/<nom>`).
