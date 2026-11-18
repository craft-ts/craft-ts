# Comparaison locale des moteurs de rendu

Ce runner compare CraftTS, React, Vue, Svelte, Solid et une implémentation DOM
native. Un adaptateur Foldkit est également disponible en campagne séparée.
C'est une comparaison locale d'une liste simple, pas une implémentation
du `js-framework-benchmark` ni un classement général des frameworks.

Les bibliothèques externes sont installées dans ce dossier, avec versions
exactes et lockfile indépendants. Le runtime CraftTS vient du worktree courant.
Le runner n'écrit pas dans les bibliothèques. Ne pas modifier les sources pendant
une campagne ; le commit, les versions et une empreinte SHA-256 des sources
mesurées sont enregistrés dans le rapport.

```sh
npm ci --prefix apps/framework-benchmark --workspaces=false --ignore-scripts
npm --prefix apps/framework-benchmark run bench
```

## Protocole

- Bundles Vite de production, même navigateur Chromium et même machine.
- Même HTML utile : contrôles natifs communs et un `div[data-row]` par ligne ;
  avec index, un `span[data-position]` supplémentaire affichant la position.
- Même CSS, mêmes données initiales et même reducer immuable partagé.
- Un composant par ligne pour les cinq frameworks ; référence DOM manuelle
  séparée. Identité par `row.id`, y compris quand l'objet d'un item est remplacé.
- React utilise `memo` et des props stables ; Vue des SFC compilés et `shallowRef` ;
  Svelte des composants compilés, `$state.raw` et un `each` avec clé ; Solid un
  `For` et un store réconcilié par `id`. Aucun `flushSync`, compilateur React,
  Suspense, routeur, backend, HMR ou virtualisation n'est ajouté.
- Boutons natifs partagés : on mesure les changements d'état et le rendu ; les
  différences entre systèmes d'événements des frameworks sont hors périmètre.
- Montage : initialisation de l'app → observation des 1 000/5 000 lignes dans
  le DOM. Imports, définitions de composants et construction du jeu de données
  initial sont déjà exécutés ; les valeurs ne mesurent pas le chargement complet.
- Interaction : clic natif → `MutationObserver` observant la nouvelle révision
  du conteneur. Le dispatch synchrone est conservé séparément. Cette borne permet
  à React, Vue et Svelte de vider leurs mises à jour naturellement ; elle ne
  représente ni le style/layout/paint, ni l'INP. Les deux frames suivantes servent
  de stabilisation et ne sont pas incluses dans le temps DOM.
- Les contrôles complets de données, position et identité DOM ont lieu après le
  chronométrage et sont exigés après chaque action, préchauffage compris.
- Ordre des frameworks mélangé avec une graine fixe, à chaque scénario/navigation.
  Nouveau contexte navigateur par navigation ; cache HTTP neuf, serveur déjà prêt.
- Par défaut : trois navigations, huit interactions mesurées par action et par
  navigation après trois de préchauffage. Filtrage et rétablissement sont séparés.
- Scénarios : 1 000 et 5 000 lignes, avec/sans index, CPU normal ; contrôle à
  1 000 lignes avec index et CPU ralenti ×4. Ce contrôle n'est pas un téléphone.
- Un compteur de DOM et un relevé de tas après collecte forcée terminent chaque
  navigation. Ce seul point ne constitue pas un test de fuite mémoire.

Le marqueur de révision est commun aux implémentations. La validation finale
rejette un framework qui le publie avant la fin réelle des données/positions.
Les nœuds de commentaire ou d'ancrage propres aux frameworks sont autorisés ;
le DOM visible et les attributs contrôlés doivent être identiques.

Les tailles de ressources sont des ressources décompressées, pas des octets
transférés sur un réseau. La référence JavaScript native est une implémentation
impérative locale ; elle ne prétend pas être optimale pour chaque action.
Angular n'est pas mesuré : il faudrait un adaptateur AOT distinct.

## Contrôle fonctionnel et options

```sh
FRAMEWORK_BENCH_CHECK=true FRAMEWORK_BENCH_RUNS=1 FRAMEWORK_BENCH_ITERATIONS=2 npm --prefix apps/framework-benchmark run bench
FRAMEWORK_BENCH_FRAMEWORKS=craft,solid,svelte npm --prefix apps/framework-benchmark run bench
FRAMEWORK_BENCH_RUNS=5 FRAMEWORK_BENCH_ITERATIONS=15 npm --prefix apps/framework-benchmark run bench
FRAMEWORK_BENCH_REPORT=tmp/my-framework-report.json npm --prefix apps/framework-benchmark run bench
```

Le contrôle rapide teste dix lignes, avec puis sans index. Le rapport est écrit
progressivement ; seul `status: "complete"` confirme la campagne entière.
Le runner s'arrête à la première donnée erronée, perte d'identité ou erreur page.
Les chiffres peuvent varier selon la machine, le JIT, la collecte et la charge ;
aucun seuil de temps arbitraire n'est imposé.

Sources des choix d'implémentation :
[React memo](https://react.dev/reference/react/memo),
[stabilité des props Vue](https://vuejs.org/guide/best-practices/performance.html#props-stability),
[Svelte $state.raw](https://svelte.dev/docs/svelte/$state#state.raw),
[Solid reconcile](https://docs.solidjs.com/reference/store-utilities/reconcile).

## Diagnostic du coût de montage

`diagnose.mjs` copie le runtime et les fixtures dans un snapshot temporaire, puis
applique des sondes séparées. Les sources Core/Component/Style du worktree ne sont
pas modifiées. Les builds de production sont préparés avant la mesure ; les
variantes sont mélangées à chaque navigation, avec la graine 535.

```sh
CRAFT_MOUNT_DIAG_MODE=counts CRAFT_MOUNT_DIAG_VARIANTS=counts,counts-inline,counts-plain CRAFT_MOUNT_DIAG_OUTPUT=tmp/mount-diagnosis-allocations node apps/framework-benchmark/diagnose.mjs
CRAFT_MOUNT_DIAG_VARIANTS=baseline,plain-effect-scope,prefix-hydration-key,scopes-and-prefix CRAFT_MOUNT_DIAG_RUNS=5 CRAFT_MOUNT_DIAG_OUTPUT=tmp/mount-diagnosis-recheck node apps/framework-benchmark/diagnose.mjs
node apps/framework-benchmark/interaction-check.mjs
```

Les compteurs recensent scopes, providers, signaux, observateurs, identités,
générateurs et travail des tableaux de nettoyage. Ces variantes instrumentées
ne servent pas à comparer les durées. L'interception d'`Error` couvre l'appel et
la construction et contient un contrôle positif pour les deux formes.

Les variantes de temps ont trois navigations et quatre interactions mesurées
par action après deux de préchauffage par défaut. `CRAFT_MOUNT_DIAG_RUNS`,
`CRAFT_MOUNT_DIAG_ITERATIONS` et `CRAFT_MOUNT_DIAG_OUTPUT` ajustent le protocole.
`CRAFT_MOUNT_DIAG_CASES` accepte une liste JSON, par exemple
`[{"rows":1000,"indexes":false},{"rows":5000,"indexes":false}]`.

Les sondes disponibles incluent :

- `baseline`, `plain-effect-scope`, `prefix-hydration-key`, `scopes-and-prefix` ;
- `indexed-cleanups`, `inline-rows`, `inline-indexed-cleanups`,
  `inline-plain-scopes`, `inline-scopes-prefix` ;
- `static-key-attribute`, `shared-injector-providers` ;
- `no-effect-reports`, `no-replay-registration`, `lazy-hydration-key` et les
  combinaisons expérimentales : elles retirent une capacité ou peuvent changer
  un contrat et servent uniquement au diagnostic.

Les contrôles vérifient données, positions, nœuds conservés, rapports d'effets,
tags complets, descripteur de replay de la racine et destruction finale. Les
comparaisons de rapports des variantes inline utilisent leur référence inline.
Les fichiers modifiés et leurs empreintes restent sous le dossier de rapport
pour revue ; les snapshots de serveurs sont supprimés en fin de campagne.
Les remplacements de source sont vérifiés et échouent si le runtime ne correspond
plus aux sondes : adapter le runner avant d'utiliser un autre commit.

`interaction-check.mjs` complète la mesure DOM par des clics natifs Playwright,
avec `isTrusted` vérifié et observation Event Timing au seuil de 16 ms. Les
notifications peuvent arriver après le clic suivant : les événements sont donc
regroupés par `interactionId` après la série et associés par `processingStart`.
Une entrée absente n'est pas une durée nulle. Les contrôles de données commencent
après deux frames pour ne pas entrer dans la durée jusqu'à la peinture. Huit
scénarios et huit clics par scénario fournissent une sonde de laboratoire,
**pas une mesure INP terrain**. Aucun prototype n'est utilisé par cette sonde.

Résultats et limites :
[diagnostic du 5 novembre](../../docs/benchmarks/2026-11-05-mount-cost-diagnosis.md).

## Foldkit uniquement

L'adaptateur Foldkit utilise **foldkit 0.170.0**, **Effect 4.1.2** et
**@foldkit/vite-plugin 0.29.0**, avec les mêmes données, reducer immuable,
contrôles natifs, DOM final, CSS et validations que les autres fixtures.
Un modèle Schema et un message `ClickedAction` alimentent `update`. Une
`Subscription` persistante reçoit les contrôles communs via `Stream.callback` ;
le coût de la queue, de `update`, de `view` et du patch est inclus dans la mesure.
Aucun dispatch privé ni flush forcé n'est utilisé.

Une fonction `rowView` produit une ligne avec `h.keyed('div')(row.id, ...)`.
`createKeyedLazy` conserve les VNodes des lignes dont les entrées sont inchangées,
comme la mémorisation explicite des props dans la fixture React. La position est
un argument du cache uniquement quand elle est affichée. Le cache conserve ses
clés : ici leur ensemble est borné aux 1 000 ou 5 000 identifiants initiaux.
Foldkit utilise des fonctions de vue, sans instance de composant par ligne.

Le build séparé applique le plugin officiel de branding des vues en production.
Il empêche ce transformateur de modifier les fixtures des autres frameworks.
Foldkit remplace son conteneur : un placeholder jetable sous `#mount` est remplacé
par `#rows`, pour garder le même observateur et le même DOM final.

```sh
FRAMEWORK_BENCH_FRAMEWORKS=foldkit FRAMEWORK_BENCH_CHECK=true FRAMEWORK_BENCH_RUNS=1 FRAMEWORK_BENCH_ITERATIONS=2 FRAMEWORK_BENCH_REPORT=tmp/foldkit-check.json node apps/framework-benchmark/run.mjs
FRAMEWORK_BENCH_FRAMEWORKS=foldkit FRAMEWORK_BENCH_REPORT=tmp/foldkit-results.json node apps/framework-benchmark/run.mjs
```

Ces commandes construisent et mesurent **uniquement Foldkit** ; le comparatif
par défaut reste inchangé. Ne pas mélanger `foldkit` avec d'autres noms dans le
même lancement. Le bundle est isolé sous `dist-foldkit/`, hors empreinte des sources.

Foldkit groupe normalement ses rendus sur `requestAnimationFrame` : les temps DOM
incluent cette attente. Les deux frames de stabilisation communes peuvent aligner
le clic sur une phase du cycle d'affichage. Un résultat autour de 16 ms n'indique
donc pas 16 ms de calcul JavaScript. Aucun score INP n'est déduit de cette mesure.

Sources : [runtime](https://foldkit.dev/core/runtime),
[mémorisation des vues](https://foldkit.dev/core/view-memoization),
[plugin de production](https://github.com/foldkit/foldkit/tree/main/packages/vite-plugin-foldkit).

[Résultats du 5 novembre](../../docs/benchmarks/2026-11-05-foldkit.md).

## Comprendre le montage CraftTS / Foldkit

`mount-paths.mjs` compare uniquement les montages CraftTS et Foldkit. Il prépare
ses builds avant les mesures : références minifiées, hooks de phases Foldkit,
contrôle sans cache de vue, puis builds lisibles pour les profils CPU. Les
compteurs DOM et profils sont séparés des navigations chronométrées de référence.
Les transformations de sonde s'appliquent pendant les builds isolés sous `tmp/`,
sans modifier les bibliothèques ou les paquets installés.

```sh
node apps/framework-benchmark/mount-paths.mjs
MOUNT_PATHS_MODE=staging MOUNT_PATHS_OUTPUT=tmp/foldkit-mount-paths-staging node apps/framework-benchmark/mount-paths.mjs
```

Le mode `staging` ne construit que CraftTS et un contrôle qui détache `#mount`
pendant le bootstrap. Il vérifie le scénario simple de données ; ce contrôle ne
préserve pas nécessairement les contrats de hooks ou de services observant la
connexion au document. Aucun changement runtime n'en est proposé automatiquement.

[Analyse des chemins de montage](../../docs/benchmarks/2026-11-05-foldkit-craft-mount-analysis.md).

## Prototype de granularité par composant

L'expérience `row-by-component.prototype.ts` utilise l'API existante : son template
lit les inputs et retourne des valeurs ordinaires. Les dépendances sont suivies
par `component-render`, et les nouvelles descriptions de nœuds sont réconciliées.
Aucune nouvelle option de stratégie n'est ajoutée au runtime.

```sh
npm --prefix apps/framework-benchmark run bench:component-prototype
```

La commande compare les bindings fins au style composant, avec/sans allègement
des scopes dans des snapshots. Elle vérifie aussi le surcroît de lectures sur
32/128 champs indépendants. Les compteurs, mesures de liste et champs indépendants
s'exécutent successivement. Par défaut : cinq navigations par cellule de liste,
quatre interactions mesurées après deux de préchauffage.

`COMPONENT_PROTOTYPE_RUNS`, `COMPONENT_PROTOTYPE_ITERATIONS` et
`COMPONENT_PROTOTYPE_OUTPUT` ajustent le protocole. `COMPONENT_PROTOTYPE_SUMMARIZE_ONLY=true`
reconstruit uniquement le résumé d'une campagne existante.

Le graphe et les rapports d'effets changent avec la stratégie composant. Les
contrôles de cibles DOM ne certifient pas le replay d'archives complètes, ni les
contrats async/pending/SSR. Le prototype ne modifie pas le renderer normal.

[Résultats et limites](../../docs/benchmarks/2026-11-05-component-granularity-prototype.md).

## Prototypes du coût minimal d'une ligne

```sh
npm --prefix apps/framework-benchmark run bench:mount-floor-prototypes
```

`mount-floor-prototypes.mjs` applique cinq sondes isolées au-dessus du template
par composant et des effets sans injecteur dédié : callback de liste déclaré pur,
propriétaire compact, inputs paresseux, plage à racine unique et fabrique DOM
préparée. Le propriétaire et les inputs sont deux sous-prototypes de la même piste.
Les combinaisons complète et sélectionnée sont mesurées séparément.

Les bibliothèques du worktree et les dépendances installées restent inchangées.
Le runner archive les sources modifiées des copies sous le dossier de sortie.
Les contrats incluent les repli multi-providers, les transitions vide/multiple,
les lectures tardives et des cibles DOM enregistrées dans la référence. Ils ne
certifient pas le replay de sessions complètes ni tous les modes async/SSR.

`MOUNT_FLOOR_OUTPUT`, `MOUNT_FLOOR_SCREEN_RUNS` et `MOUNT_FLOOR_RUNS` ajustent la
campagne. `MOUNT_FLOOR_SUMMARIZE_ONLY=true` agrège les rapports existants.
Les mesures vont jusqu'au DOM, avant peinture, et ne sont pas des scores INP.

[Résultats et limites des quatre pistes](../../docs/benchmarks/2026-11-05-mount-floor-prototypes.md).

## Campagne « runtime seul »

`runtime-only.mjs` compare plusieurs runtimes CraftTS sur **la même fixture
générique** (`src/craft/main.ts`, inchangée) : aucun marqueur de pureté, ligne
préparée ou vue inline. Chaque variante est un ref git (ou `WORKTREE`) dont
`libs/{core,component,style,test-type}` sont extraits dans un dossier temporaire ;
le worktree n'est jamais modifié. La première variante sert de référence.

```sh
RUNTIME_ONLY_VARIANTS="reference=main,candidate=WORKTREE" node apps/framework-benchmark/runtime-only.mjs
RUNTIME_ONLY_RUNS=5 RUNTIME_ONLY_OUTPUT=tmp/runtime-only/final RUNTIME_ONLY_COUNTS=true node apps/framework-benchmark/runtime-only.mjs
RUNTIME_ONLY_SKIP_TIMING=true node apps/framework-benchmark/runtime-only.mjs
```

- Builds Vite de production minifiés, un serveur statique, un contexte Chromium
  neuf par navigation, ordre des variantes mélangé (graine 611) à chaque case.
- Cases par défaut : 100, 1 000 et 5 000 lignes, avec/sans index (`RUNTIME_ONLY_CASES`).
  Montage, puis mise à jour d'une ligne, d'un dixième, inversion, filtrage et
  rétablissement chronométrés séparément ; données, positions et identité DOM
  vérifiées après chaque action, chauffe comprise.
- Tas JS après GC forcé, à la fin de la même séquence. `moduleReady` relève
  l'instant de `begin()` depuis l'origine de navigation (chargement et
  initialisation des modules).
- Contrats, sur une entrée séparée qui ne touche pas la page chronométrée :
  nombre de rapports d'effets actifs, empreinte de leurs tags (ordinaux compris),
  cibles replay de la racine et de chaque ligne avec leur statut de résolution,
  forme du DOM, puis destruction complète. Toute variante doit être identique à
  la référence, sinon la campagne s'arrête.
- `RUNTIME_ONLY_COUNTS=true` construit en plus une copie instrumentée de chaque
  runtime (injecteurs, provider records, signaux publics, cellules privées,
  computeds, effets, passages du driver de générateurs). Ces builds ne servent
  jamais aux timings.
- Taille : JS minifié et gzip de l'entrée générique seule.

## Fixture tests

From the workspace root, run `node --test apps/framework-benchmark/common.test.mjs`
to check row identities, updates, filtering and the DOM timing harness. These
tests also run in the repository's Behaviours workflow. From this directory,
the equivalent command is `npm test`.

This lab installs its comparison frameworks separately. Nx therefore does not
infer Vitest targets from its Vite configurations during workspace checks; the
fixture tests above do not need those optional comparison dependencies.
