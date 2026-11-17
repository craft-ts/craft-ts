# Compilateur : instances légères (`lean: true`)

17 novembre 2026. Base : `425a62db4` (`codex/optional-performance-compiler`).
Implémentation : `7d2c8f75b` ; outils de mesure : `e67e2d2f1`.

Le compilateur optionnel ne faisait presque rien gagner sur la page réaliste :
il ne couvrait que 7 définitions sur 62 et, surtout, une instance compilée
gardait tout ce que coûte une instance interprétée (injecteur propre, proxy
et cellules d'inputs, contexte de rendu par binding, cibles replay, entrée de
registre, effet de rendu complet). Le mode `lean` échange quelques
fonctionnalités d'exécution contre des instances presque nues, et compile
beaucoup plus de formes de templates.

Résultat, même cohorte : montage de la page réaliste **−33 à −34 %**,
remontage **−38 à −49 %**, tas **−46 à −53 %** ; montage de 5 000 lignes
**−68 à −69 %** face au runtime. Solid reste 2,5 à 3 fois plus rapide au
montage de la page.

## Ce que fait le mode léger

Activation : `craftCompiler({ lean: true })`. Rien ne change en
développement, en SSR, à l'hydratation, sous une frontière pending/catch, ni
avec un hook de diagnostic (traces, observateurs de lecture, wrappers) : ces
cas prennent le chemin générique comme avant.

1. **Instance légère** (`LeanComponentRenderedNode`). Les nœuds créés par le
   plan, un effet noyau par binding, et rien d'autre : rendu dans l'injecteur
   du parent, inputs reçus tels quels (lecteurs passés tels quels, primitives
   en lecteurs « settled »), aucune cible replay, aucune inscription au
   registre. Un parent qui passe d'autres inputs relie **les mêmes nœuds**.
2. **Bindings sans source réactive arrêtés** après leur premier passage
   (`ɵcraftBindingEffect` lit les dépendances du nœud Alien).
3. **Couverture élargie.** Instructions de préparation (`const … ;` avant le
   `return`), événements (y compris les méthodes `*click() {}`, même
   dispatch, mêmes hooks et noms d'interaction que l'interpréteur), toute
   expression d'attribut, et **trous** : un enfant que le compilateur ne
   connaît pas (appel de composant, `forNode`, `ifNode`, `pluck(...)`) est
   rendu par le renderer générique à sa place, avant le prochain frère
   statique. Page réaliste : **53 définitions sur 60** (7 sur 62 avant),
   **96 % des instances** montées en léger.
4. **Entrées de liste légères.** Une liste dont la factory est prouvée
   (`(row, i) => Row({ row, i })`) monte l'instance elle-même : plus de
   commentaires `craft-for:<clé>`, de fragment ni de contexte par entrée.
   Le code recopié dans un plan est lu après la passe des listes, si bien
   qu'une liste située dans un trou est spécialisée aussi.
5. **Génératrices de bindings abaissées** (`lower: false` pour désactiver) :
   `yield* x` → `ɵy(x)`, qui rend une lecture « settled » tout de suite et
   pilote le reste comme avant ; `yield* Service.membre()` →
   `ɵys(Service, 'membre')`, qui lit le membre du service résolu une fois par
   injecteur (`ɵreadServiceMember`). Refusé sous `try`, avec un `yield` nu ou
   des paramètres.

## Compromis acceptés

| Comportement | Avant | En mode léger |
| --- | --- | --- |
| `inject(Injector / ElementRef / DestroyRef)` dans un binding | celui du composant | celui du parent |
| Registre des cibles (devtools, registre IA), effets dans les snapshots | présents | absents pour ces composants |
| Adresse replay de leurs éléments | enregistrement propre | ancêtre enregistré le plus proche + chemin DOM (moins stable si la liste est réordonnée) |
| Clés de liste lisibles par l'acteur de page | commentaires `craft-for:<clé>` | absentes pour les listes légères |
| Un input change | seuls les bindings qui le lisent repartent | tous les bindings de l'instance sont reliés |
| Service lu dans un binding | résolu à chaque lecture (inscription, marquage) | résolu une fois par injecteur |

Les services `providedIn: 'function'`, les injecteurs avec wrappers de
résolution, les méthodes et les membres lus par génératrice gardent le chemin
générique. Un composant compilé n'a jamais de providers propres (métadonnées
`{}` exigées).

## Mesures

Apple M3, Chromium 153, production minifiée, même cohorte par tableau,
ordre mélangé. Les DOM sont comparés avant toute mesure (47 instantanés
d'interactions par échelle pour la page, contrats DOM, identité des lignes
conservées, index, granularité à 128 champs et destruction pour les lignes).

### Page réaliste (7 navigations, médianes, ms)

| Cas | Runtime | Compilé actuel | **Léger** | Solid |
| --- | ---: | ---: | ---: | ---: |
| Montage, échelle 1 (2 579 éléments) | 40,0 | 40,7 | **27,0** (−33 %) | 9,3 |
| Remontage, échelle 1 | 20,7 | 19,2 | **12,9** (−38 %) | 4,9 |
| Retour d'onglet, échelle 1 | 6,85 | 6,95 | **3,70** (−46 %) | 1,65 |
| Rétablir après filtre, échelle 1 | 4,25 | 4,25 | **2,55** | 1,30 |
| Tas après montage, échelle 1 | 10,3 Mio | 10,1 | **5,6** (−46 %) | 3,0 |
| Montage, échelle 2 (4 788 éléments) | 56,2 | 59,5 | **37,1** (−34 %) | 14,9 |
| Remontage, échelle 2 | 36,0 | 35,0 | **18,5** (−49 %) | 7,8 |
| Tas après montage, échelle 2 | 16,6 Mio | 16,1 | **7,8** (−53 %) | 4,2 |

Les petites mises à jour (une case, un compteur, le tri, le thème) restent
au niveau d'avant ou un peu en dessous ; aucune ne régresse.

### Lignes, 5 000 éléments (5 navigations, médianes, ms)

| Cas | Runtime | Compilé actuel | **Léger** |
| --- | ---: | ---: | ---: |
| Lignes : montage | 52,3 | 44,4 | **16,8** |
| Lignes : filtrer / rétablir | 5,2 / 20,5 | 5,7 / 15,7 | **1,8 / 4,4** |
| Lignes : tas après parcours | 25,6 Mio | 23,4 | **5,3** |
| Avec index : montage | 71,5 | 62,0 | **22,1** |
| Avec index : inverser | 19,8 | 19,5 | **12,1** |
| Quatre niveaux : montage | 103,2 | 107,3 | **33,0** |
| Quatre niveaux : rétablir | 42,8 | 40,3 | **10,6** |
| Modifier une ligne (avec index) | 1,00 | 1,00 | 1,25 |

« Modifier une ligne » reste un peu plus lent (+0,1 à +0,25 ms) : l'entrée
modifiée est reliée entièrement. Une première version était à +0,6 ms ; mettre
en cache la racine de l'entrée dans la boucle d'ordonnancement l'a ramenée là.

Attribution, même cohorte (5 000 lignes) : instance légère seule 42,4 →
23,8 ms ; entrées de liste légères 23,8 → 16,8 ms. Sur la page, abaissement
des génératrices et lecture directe des services : −2 % au montage, −6 % au
remontage (25,7 → 25,2 ms ; 13,5 → 12,7 ms) — le protocole des génératrices
n'est toujours pas le gros du coût, comme le 6 novembre.

### Poids

Entrée du banc des lignes, gzip : runtime 55 347 o, compilé actuel 59 285 o,
léger 59 452 o (+167 o face au compilé actuel). Le build du plugin passe de
~960 à ~335 ms sur ce banc (même processus, valeur indicative).

## Ce qui reste au-dessus de Solid

Profil du montage léger (page, échelle 2, CPU ×4) : un tiers de création et
d'évaluation des effets de binding (code applicatif compris), ~10 % de
création DOM native, puis les listes et conditions génériques des trous, les
composants non compilés (`App`, `FormControl`, `ProgressBar`…) et le GC. Plus
de poste dominant. Pistes suivantes : `forNode`/`ifNode` compilés dans le
plan plutôt qu'en trous, éléments de formulaire, `attrs`, et racines
multiples (les 7 définitions restantes).

## Vérifications

- `libs/compiler/src/lean.spec.ts` (8 tests) : même DOM que l'interpréteur,
  granularité, trous, événements et hooks, rebind en place, entrées de liste
  conservées à travers inversion/filtre/insertion/modification, abaissement
  refusé sous `try`, lecture de service suivie, repli en développement.
- Suites : Core 1 692, Component 607, Compiler 56 vertes ; `tsc` des specs
  du compilateur et de la surface publique du core.

## Reproduire

```sh
npm run compiler:build
COMPILER_VARIANTS=runtime,compiled,lean COMPILER_CASES=rows,indexed,nested,fields \
  COMPILER_ROWS=1000,5000 COMPILER_RUNS=5 npm run perf:compiler
PAGE_VARIANTS="runtime=craft-page,compiled=craft-page,lean=craft-page,solid=solid-page" \
  PAGE_COMPILER_LABELS=compiled,lean PAGE_COMPILER_OPTIONS='{"lean":{"lean":true}}' \
  PAGE_COUNT=false PAGE_SCALES=1,2 PAGE_RUNS=7 node apps/framework-benchmark/page-lab.mjs
COMPILER_PROFILE_OPTIONS='{"lean":true}' npm run perf:compiler:profile
```
