# Typed style system — journal d'exécution

Branche : `feat/typed-style-system`. Le plan complet (32 tâches, 5 vagues + vague 5
conditionnelle) reste le document de référence ; ce fichier ne consigne que ce que le
plan demande d'y écrire — les mesures, les décisions, et les écarts constatés entre le
plan et le dépôt réel.

## État

Dernière mise à jour : **2026-08-25**. Vagues 1 à 4 dans `main`, sauf la tâche 29
(exposition MCP). La vague 5 reste fermée.

| Vague                           | Tâches      | État                                                  |
| ------------------------------- | ----------- | ----------------------------------------------------- |
| 0 — mécanisme de canaux         | 1, 2        | faites                                                |
| 0 — mesure et point de décision | 3, 3b       | mesurée deux fois, **3b jamais déclenchée**           |
| 0 — migration `CssVars`         | 3 steps 2–4 | **écartée** — voir « Tâche 3 » dans « Reste à faire » |
| **1 — niveau 1**                | **4 → 11**  | **faite**                                             |
| 2 — niveau 2 : axes et matrice  | 12 → 22     | **faite**                                             |
| 3 — niveau 3 : obligations      | 23 → 26     | **faite** (moitié visuelle non vérifiée)              |
| 4 — graphe et architecture      | 27 → 30     | **faite sauf 29** (MCP non exposé)                    |
| 5 — réduction de matrice        | 31 → 32     | conditionnelle, non ouverte                           |

Hors plan et fait : l'esquisse `libs/style` (promue fichier par fichier en vague 1)
et un **mini design system de démonstration** dans
`apps/demo/src/app/examples/design-system/` — la référence « à quoi ça ressemble en
vrai », avec son README.

Ce qui reste de l'esquisse : `axes.ts` et `obligations.ts`, à éclater en vague 2 et à
compléter en vague 3.

## Écarts entre la file map du plan et le dépôt

À corriger dans le plan avant d'attaquer les vagues suivantes — plusieurs chemins
n'existent pas tels quels :

- `libs/core/src/lib/render/vnode.ts` → le vnode vit dans **`libs/component`**
  (`libs/component/src/lib/render/vnode.ts`). `channels.ts` a bien été créé dans
  `libs/core/src/lib/render/` comme prévu : l'algèbre est dans le core, le câblage
  dans component.
- `libs/component/src/lib/css-vars.type.ts` existe bien (tâche 3).
- `libs/component/src/lib/if-block.ts` et `match-block.ts` existent (tâche 16).
- `packages/mcp/src/mcp-server.ts` (tâche 29) : **vérifié le 2026-08-24**, existe.
- `libs/dev-tools/src/scripts/dependency-graph.ts` et `architecture-graph.ts`
  (tâches 27–28) : vérifiés, existent.
- `apps/demo/src/app/ui/status.component.ts` (tâche 11) : vérifié, et toujours avec
  son bloc `styles:` en template literal — le pire cas du dépôt est encore là.
- `libs/style` n'a **pas** de `project.json` : l'esquisse n'est pas un projet nx. La
  tâche 4 doit le créer (nom de projet `craft-ts-style`, calqué sur
  `libs/component/project.json`). Les `paths` de `tsconfig.base.json` pointent déjà
  sur `@craft-ts/style`.
- `apps/demo/craft-eslint-rules.mjs` **ne maintient plus de liste de règles** : il
  réexporte `craftRules.configs.recommended.rules`. Une règle nouvelle s'enregistre
  donc dans `libs/dev-tools/src/eslint-rules/recommended-config.cjs`, préfixée
  `craft-ts/`. Vaut pour les tâches 10 et 21.

## Reprise du 2026-08-24 — merge de `main`

177 commits avaient atterri sur `main` depuis que la branche a été coupée. Merge fait
(pas de rebase : 6 commits à rejouer sur 177, une seule résolution vaut mieux que six,
et la branche est déjà poussée).

**Le socle a changé, et ça déborde sur le plan.** Angular a été **retiré du dépôt**
(`feat/sortie-angular-v1`) : plus aucun paquet `@angular/*`, la réactivité passe par
`alien-signals`, le build par Vite nu. Trois conséquences directes :

1. La ligne « Tech Stack : Angular 21 » du plan est morte. Toute note qui parle de
   ngtsc, du compilateur de templates ou de la laxité de `nx build demo` par rapport à
   `tsc` ne veut plus rien dire.
2. L'`import '@angular/compiler'` de `libs/style/example/example.spec.ts` a été retiré.
3. La tâche 9 (plugin d'émission) atterrit dans un **Vite nu** : les plugins de la demo
   sont des `.mjs` dans `tools/` chargés par `apps/demo/vite.config.ts`. Il y a
   maintenant aussi `apps/demo-ssr` — le plugin devra tenir dans la passe SSR, même si
   le critical CSS reste hors périmètre.

Les paquets ont été renommés `@craft-ng/*` → `@craft-ts/*`, y compris dans les fichiers
apportés par la branche. Le préfixe du plugin ESLint est passé à `craft-ts/`.

Résolutions du merge, pour mémoire :

- `tsconfig.base.json` : les `paths` de `main`, plus `@craft-ts/style`.
- `eslint-rules/index.cjs` : `main` a supprimé `prefer-craft-service` et
  `prefer-craft-input-output` ; seule `no-craft-service-component-same-file` est
  conservée, et elle est enregistrée dans `recommended-config.cjs`.
- `vnode.ts` / `types.ts` : les deux côtés — le formatage et les exports renommés de
  `main` (`ɵRAW_REACTIVE_VALUE`), les porteurs de canaux de la branche.
- `libs/dev-tools/README.md` : réécrit et raccourci sur `main`, il ne liste plus les
  règles une par une ; les 3 ajouts de la branche y sont devenus sans objet.

Vérifications après merge :

| commande                                               | résultat                    |
| ------------------------------------------------------ | --------------------------- |
| `npx tsc -p libs/style/tsconfig.spec.json --noEmit`    | ✓                           |
| `npx vitest run --config libs/style/vitest.config.mts` | ✓ 9/9                       |
| `npx nx test craft-ts-component`                       | ✓ 253/253                   |
| `npx nx test craft-ts-core`                            | 5 échecs — **préexistants** |
| `npx tsc -p apps/demo/tsconfig.app.json --noEmit`      | 1 erreur — **préexistante** |

Les deux « préexistants » ont été prouvés, pas supposés : les 5 specs core qui échouent
(`state`, `insert-select`, `craft-control-flow`, `yieldable-insertion-method`) portent
sur des fichiers **identiques au byte près** à ceux de `main` — la branche n'ajoute
qu'un export et deux fichiers neufs dans `libs/core`. Et l'erreur TS2345 de
`apps/demo/src/app/examples/component/pending-block-exception-demo.ts` se reproduit
avec les `vnode.ts` / `types.ts` de `main` remis en place.

Note d'environnement : le `.nvmrc` demande node 24.19.0 ; la reprise a tourné sous node
20.19.3 sans incident (`engines` demande `>=20.19.0`).

## Mesures

Outil : `tools/measure-typecheck.mjs`. Médiane sur N runs de
`tsc -p <project> --noEmit --extendedDiagnostics`. Baseline stockée dans
`tools/.typecheck-baseline.json`.

```sh
node tools/measure-typecheck.mjs --runs 5 --compare
```

### Tâche 3, step 1 — baseline `apps/demo/tsconfig.app.json`

|                                                | ms   | instantiations | types   | mémoire      |
| ---------------------------------------------- | ---- | -------------- | ------- | ------------ |
| baseline (3 runs)                              | 8014 | 5 503 264      | 503 416 | 1 128 381 Ko |
| baseline revérifiée, dist reconstruit (3 runs) | 7955 | 5 503 311      | 503 435 | 1 128 667 Ko |

La deuxième ligne écarte un faux positif : `apps/demo` typecheck via des _project
references_, donc son coût dépend de la fraîcheur de `dist/out-tsc`. Les deux mesures
coïncident — la fraîcheur du dist n'était pas le facteur.

### Tâche 3, step 5 — après le branchement des canaux (tâches 1 + 2)

|                | ms         | instantiations |
| -------------- | ---------- | -------------- |
| après (5 runs) | 8506       | 5 668 482      |
| **delta**      | **+6,9 %** | **+3,0 %**     |

Seuil du plan : +15 % sur l'une des deux métriques.

> **Décision : la tâche 3b n'est PAS déclenchée.** Les canaux restent dans la passe
> applicative, les erreurs d'obligation seront visibles dans l'éditeur, et le coût DX
> documenté en 3b (niveau 3 invisible dans le programme applicatif) est évité.

Piège de mesure à retenir : une médiane sur 3 runs a d'abord donné +27 % sur `ms`,
contre +6,9 % sur 5 runs, pour un delta d'instantiations inchangé à +3 %. Le temps mur
est trop bruité à cette échelle pour arbitrer seul ; **c'est le compte d'instantiations
qui décide**, le temps ne sert que de garde-fou grossier.

### Re-mesure du 2026-08-24 — après le merge de `main` (post-Angular)

Les chiffres d'août ne sont plus comparables : la sortie d'Angular a changé la surface
de types de `apps/demo` de fond en comble (9,4 M d'instantiations contre 5,5 M avant,
pour un temps deux fois plus court). Mesure refaite des deux côtés sur le même arbre —
baseline obtenue en remettant les `vnode.ts` / `types.ts` de `main`, donc sans porteur
de canal, puis retour à la branche.

|                      | ms         | instantiations | types   |
| -------------------- | ---------- | -------------- | ------- |
| sans canaux (5 runs) | 4536       | 9 376 248      | 899 265 |
| avec canaux (5 runs) | 4930       | 10 135 286     | 940 066 |
| **delta**            | **+8,7 %** | **+8,1 %**     | +4,5 %  |

> **Décision inchangée : la tâche 3b n'est PAS déclenchée.** +8,1 % reste sous le seuil
> de 15 %.

Deux choses à retenir quand même :

- **La marge a fondu, et pas pour la raison qu'on croit.** Le coût des canaux est passé
  de +3,0 % à +8,1 % d'instantiations sans qu'une ligne de canal ne bouge. Ce n'est
  **pas** un effet de dénominateur : la baseline a _grossi_ elle aussi (5,50 M → 9,38 M).
  En absolu, le coût des canaux est passé de **165 218** à **759 038** instantiations,
  soit ×4,6, quand la baseline ne faisait que ×1,7. Les canaux coûtent donc plus cher
  _par rapport à l'application_, pas seulement en proportion.

  Explication la plus plausible, **non mesurée** : sans Angular, les types de nœuds de
  CraftTS font tout le travail eux-mêmes, donc le programme de `apps/demo` contient plus
  de types de nœuds et des arbres génériques plus profonds — et le canal se dérive sur
  chacun d'eux, depuis ses props et ses enfants. À vérifier avant d'en tirer une
  conclusion : mesurer sur un projet de taille fixe plutôt que sur la demo, qui a changé
  de contenu en même temps que de socle.

  Il reste 7 points avant le seuil, et les vagues 2→3 vont mettre une charge réelle sur
  des canaux aujourd'hui vides. **Re-mesurer à la fin de la vague 3**, quand
  `obligations` transporte enfin quelque chose — c'est là que le point de décision de la
  tâche 3b se jouera vraiment, et l'hypothèse « ça croît avec le nombre de nœuds » veut
  dire que le seuil peut être franchi par une application plus grosse que la demo.

- **Le piège des 3 runs s'est reproduit, en pire.** Une première médiane sur 3 runs a
  donné **+132 %** de temps mur pour le même +8,1 % d'instantiations ; sur 5 runs le
  temps retombe à +8,7 %. C'est exactement l'avertissement déjà consigné en août :
  arbitrer sur les instantiations, jamais sur le temps.

La baseline de `tools/.typecheck-baseline.json` a été réécrite avec les chiffres
« sans canaux » ci-dessus (5 runs). Les anciennes valeurs restent lisibles dans les
deux tableaux plus haut.

## Tâche 1 — canaux opaques dans le core

`libs/core/src/lib/render/channels.ts`, spec colocalisée, 9 assertions de types.

Écarts assumés par rapport aux « Shared types » du plan :

- `MergeChannelList` (fold sur un tuple) a été remplacé par **`MergeChannelUnion`** (merge
  sur une union). Les enfants arrivent dans l'arbre sous forme d'union, pas de tuple, et
  les deux formes sont prouvées équivalentes par une spec dédiée. Une seule façon
  d'écrire chaque chose.
- Ajout de `CraftChannelsCarrier`, `ChannelsOf`, `UndischargedObligations`, et de
  `CRAFT_CHANNELS` (exporté : le `keyof` guard en a besoin, voir plus bas).

Falsifiabilité vérifiée : `Exclude` remplacé par une union simple dans `MergeChannels`
⇒ 3 assertions rouges. Remis.

## Tâche 2 — branchement sur le vnode

Points de propagation couverts : `h()`, les deux branches d'`ifBlock`, `each`
(item + empty), `craftTemplate`/`renderTemplate`, la frontière de composant. Plus les
nœuds pipés (catch, pending, field-exception, directive) — une frontière d'exception
n'est pas une frontière de style, et un canal qui disparaîtrait là serait exactement
l'échappatoire silencieuse que le plan interdit.

Trois décisions de conception qui n'étaient pas dans le plan :

1. **Un élément ne prend pas de paramètre de canal, il le dérive** de ses props et de
   ses enfants. Un paramètre en queue, même défaillé à `EmptyChannels`, est **imprimé
   dans les déclarations émises** — la première version faisait apparaître
   `import("@craft-ts/core").EmptyChannels` dans chaque `.d.ts` de la lib. En dérivant,
   les 170 `.d.ts` émis par `libs/component` sont **identiques au byte près**, sauf les
   trois fichiers réellement modifiés (`vnode`, `types`, `channels`). C'est le critère
   de non-régression de la tâche 2, step 2 — et il ne passe que sous cette forme.
   Seul `PipedCraftNodeDirective` fait exception : ce chemin efface props et enfants,
   donc le canal y transite par une prop fantôme à `unique symbol`.

2. **L'extraction se garde sur `typeof CRAFT_CHANNELS extends keyof Value`.** Un simple
   `Value extends CraftChannelsCarrier<infer C>` ne suffit pas : la propriété du porteur
   est optionnelle, donc _tout_ type passe le test, et pour un type sans site
   d'inférence — un enfant `string` — TypeScript retombe sur la contrainte et renvoie
   `CraftChannels` lui-même, dont `discharges` vaut `unknown`. Un seul
   `Exclude<…, unknown>` en aval efface alors **toutes** les obligations de l'arbre,
   silencieusement, en laissant les tests verts. C'est la panne exacte que le plan
   redoute pour les brands (« un brand mal posé annule tout, sans bruit ») ; elle s'est
   produite ici, sur le porteur. Le garde `keyof` est celui que le porteur de deps
   utilise déjà.

3. **Le canal d'un composant se calcule depuis `Template`, jamais depuis
   `CraftComponent`.** La signature d'appel de `CraftComponent` reconstruit le type
   complet du composant pour le passer à `ComponentCallNode` ; dériver le canal depuis
   ce type-là re-dérive le composant entier à chaque site d'appel, et comme les enfants
   d'un template sont eux-mêmes des nœuds de composant, ça imbrique jusqu'au TS2589
   (rencontré, puis corrigé). Lire `Template` une fois — et laisser chaque nœud enfant
   rendre le canal qu'il porte déjà — garde le travail plat. C'est la même raison qui
   fait que `ComponentCssVars` est écrit ainsi. **À rejouer tel quel en vague 3** pour
   `seals` : toute dérivation partant de `CraftComponent` rejouera le TS2589.

Falsifiabilité vérifiée : source `props` retirée d'`ElementNodeChannels` ⇒ 9 assertions
rouges. Remis.

Vérifications : `npx tsc -b libs/component/tsconfig.lib.json` ✓,
`npx tsc -p apps/demo/tsconfig.app.json --noEmit` ✓, suite component 202/202 ✓.
`npx nx build demo` échoue sur `dev-tools:build` — **préexistant**, vérifié sur l'arbre
propre avant modification.

## Tâche 3 — la contrainte connue avant de commencer

La migration de `CssVarContract` sur le canal générique n'est pas commencée. Une
lecture du code existant donne déjà la contrainte principale, à intégrer avant de
commencer :

`CraftNodeChildrenCssVars` (le merge entre frères) fait aujourd'hui une **union
champ par champ, sans annulation** : un frère qui déclare `--x` n'annule pas le
`required: '--x'` d'un autre frère. L'annulation vit ailleurs, dans
`MergeCssVarContracts`, qui est asymétrique (`declared: Left['declared']`,
`inherited: Right['inherited']`) et sert à composer _meta ⊗ template_, pas frère ⊗ frère.

Conséquence : une migration fidèle ne peut pas poser `required` sur `obligations` et
`declared` sur `discharges` — ça introduirait une annulation entre frères qui n'existe
pas et changerait le comportement. Les six champs passent sur **`accumulate`** (union
pure), et `MergeCssVarContracts` reste tel quel. C'est un résultat honnête pour la
tâche 3 : css-vars n'exerce qu'un des deux canaux, ce qui valide le transport et la
reconstruction d'une vue typée, pas la sémantique de décharge — laquelle ne sera
réellement exercée qu'en vague 3.

## Reste à faire

Vue actionnable de ce qui n'est pas fait, avec les écarts déjà constatés dans le dépôt.
Le plan reste la référence pour le _pourquoi_ de chaque tâche ; ce qui suit ne dit que
_où ça atterrit maintenant_.

### Décisions tranchées le 2026-08-24

Les quatre points ouverts de la reprise, et ce qui a été décidé.

- **Namespaces entérinés.** `unit.px` / `unit.rem` pour les unités, `kind.color` /
  `kind.length` pour les grammaires `@property`. Une **troisième** collision est
  apparue en écrivant la table générée et a été tranchée pareil : la condition de
  breakpoint est passée sous `at.minInlineSize(…)`, parce que `minInlineSize` est
  aussi une propriété CSS. Et le barème d'épaisseurs s'appelle `lineWidth`, pas
  `borderWidth`, pour la même raison.
- **Esquisse promue, pas réécrite.** `example.spec.ts` a servi de filet pendant toute
  la vague ; une seule de ses assertions a dû changer (voir « émission atomique »).
- **Ligne « Tech Stack » à corriger dans le plan** : Vite 8 + alien-signals.
- **Re-mesure à la fin de la vague 3**, comme prévu : les canaux sont encore vides.

### Tâche 3 — migration `CssVars` : écartée, et pourquoi

La migration du contrat `CssVars` sur le canal générique **n'a pas été faite**, et ce
n'est pas un report par manque de temps.

Sa seule raison d'être, écrite dans le plan, était de _valider l'abstraction_ sur du
code déjà en production. Cette validation est désormais acquise autrement, et plus
fortement : `libs/style` fait circuler de vraies obligations sur les canaux
`obligations` / `discharges`, elles s'annulent au bon nœud, et retirer
`provides(scrollPort.block)` fait échouer le typecheck. C'est la sémantique complète,
pas seulement le transport — ce que la migration `CssVars` n'aurait de toute façon pas
pu exercer, puisqu'elle ne pose que sur `accumulate` (voir « Tâche 3 » plus haut).

Ce qu'on perd : la preuve que le canal peut porter un contrat **existant** sans changer
son comportement. Ce qu'on éviterait de gagner en la faisant maintenant : un refactor à
risque sur des types de production, pour un bénéfice de démonstration. À rouvrir si la
vague 3 montre que les deux mécanismes divergent.

### Vague 1 — niveau 1 : faite

| tâche                 | livré                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 — kinds et treillis | `libs/style` est un projet nx (`craft-ts-style`) ; `kinds.ts` calqué sur la grammaire `@property`, treillis **lu sur les brands** au lieu d'une seconde table |
| 5 — tokens            | `tokens/units.ts`, `scales.ts`, `palette.ts` ; brands nominaux à `unique symbol`, échelles fermées, `definePalette` (deux valeurs + rôle), `unsafeLength`     |
| 6 — `cssVars()`       | émission `@property`, nom dérivé, `.or()` typé, préfixe dupliqué refusé, plus `set()` pour écrire une variable **statiquement** dans une feuille              |
| 7 — table générée     | `tools/generate-css-props.mjs` depuis **mdn-data** : 477 propriétés couvertes, 5 non couvertes, `overflow` exclu par construction                             |
| 8 — `craftStyles()`   | classes **atomiques** dédupliquées à la règle ; contrat de variantes inféré                                                                                   |
| 9 — plugin d'émission | `plugin/vite.ts` + `plugin/emit.ts` : évaluation en Node, `@layer`, dump JSON pour le graphe, validation des propriétés                                       |
| 10 — étanchéité       | `no-raw-css-value` et `style-file-boundary`, enregistrées dans `recommended-config.cjs`                                                                       |
| 11 — composant témoin | `status.component.ts` migré, vérifié dans le navigateur                                                                                                       |

#### Écarts assumés par rapport au plan

- **La table générée est plus large que la grammaire, jamais l'inverse.** Le lecteur de
  grammaire ferme trois formes (mot-clés fermés, type terminal, terminal + mot-clés) ;
  une alternative qu'il ne sait pas fermer est **abandonnée**, pas fatale. 124 helpers
  sont donc _plus étroits_ que CSS — `background` n'accepte qu'une couleur. C'est sûr
  dans la seule direction qui compte : un helper rétréci ne peut pas produire du CSS
  invalide, il refuse seulement des formes que CSS aurait acceptées. La liste est
  exportée (`NARROWED_PROPERTIES`) pour que le rétrécissement soit visible.
- **Un helper accepte une seule valeur là où CSS en accepte jusqu'à quatre.**
  `padding` est `<length-percentage>{1,4}` ; le helper prend une longueur. Les
  longhands couvrent le reste.
- **La classe rendue est une liste de classes atomiques**, pas `badge-root`. La seule
  assertion de l'esquisse qui a dû changer. `classKeyOf()` fait le chemin inverse pour
  la matrice de la vague 2.
- **Cascade interne à une feuille** : deux déclarations de la même propriété dans la
  même classe ne produisent **qu'un** atome, le dernier écrit. Sans ça le gagnant
  dépendait de l'ordre du CSS émis, c'est-à-dire de l'ordre alphabétique — trouvé sur
  le composant témoin, où `font(text.xs)` écrasait `lineHeight(num(1))`.
- **`mdn-data` est une devDependency**, utilisée par le générateur seul ; le paquet
  publié ne la voit pas.
- **Le plugin bundle avec `vite.build()` en mode SSR**, pas avec esbuild : Vite 8 ne
  livre plus esbuild.

#### Deux pièges qui laissaient les tests verts

1. **`sideEffects: false` mange le registre.** L'entrée synthétique du plugin importait
   les modules de style pour leurs effets de bord ; le bundler a le droit de les
   supprimer, et il l'a fait — partiellement, ce qui est pire. Elle importe maintenant
   chaque module comme **namespace** et le retient dans un export.
2. **Un runner de test intercepte `import()` dynamique.** Le bundle écrit dans un
   répertoire temporaire n'existe pas dans son graphe de modules. Il est chargé par
   `require`, qui va au système de fichiers.

#### Falsifiabilité, réellement jouée

| garantie                    | affaiblissement                                     | résultat                                  |
| --------------------------- | --------------------------------------------------- | ----------------------------------------- |
| brand nominal des longueurs | `LengthValue` → `string & { __length?: true }`      | 4 des 5 rejets de chaînes passent au vert |
| conformance de la table     | un helper `(value: string)` ajouté à `generated.ts` | l'assertion de type rouge                 |

Les deux ont été remis en état après vérification.

### Vague 2 — niveau 2 : faite

| tâche                    | livré                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12 — axes standard       | `axes/standard.ts` : `scheme`, `motion`, `forcedColors`, `contrast`, `scrollState.{stuck,snapped,scrollable}`, `descendant.*` (unique porte vers `:has()`), chaque point avec son driver |
| 13 — axes définis        | `axes/define.ts` : `defineBreakpoints` ordonnés, `above`/`below`, `defineAxis(..., { writes })`, `onlyVarsOfKind`, `defineStateAxis`, `defineContainer`                                  |
| 14 — `when()` et contrat | contrainte `writes` vérifiée au site d'appel, détection de règle morte                                                                                                                   |
| 17 — matrice             | `@craft-ts/style-testing` : `visualMatrix(sheets)`, identifiants stables                                                                                                                 |
| 18 — drivers             | `applyScenario(page, scenario)`, `orderedDrivers` comme source unique de l'ordre                                                                                                         |
| 19 — exhaustivité        | `assertExhaustiveVisualMatrix`, échoue dans les deux sens                                                                                                                                |
| 20 — cas de contenu      | `contentCases`, croisement complet seulement sur les axes d'espace                                                                                                                       |
| 21 — étanchéité          | `no-raw-class`, `no-free-has`                                                                                                                                                            |
| 22 — témoin              | matrice du design system, cardinaux consignés                                                                                                                                            |

#### Cardinaux relevés (première des deux mesures de la vague 5)

| feuille                  | scénarios |
| ------------------------ | --------- |
| `dsTheme`                | 4         |
| `dsStack`                | 1         |
| `dsButton`               | 18        |
| `dsCard`                 | 2         |
| `dsAlert`                | 6         |
| `dsMeter`                | 1         |
| la page entière composée | 72        |

Médiane 3, maximum 18, contre un déclencheur à 24 : **la vague 5 ne s'ouvre pas**.
La seconde mesure — temps de capture CI — n'existe pas : rien ne capture encore.

#### Écarts assumés

- **Pas de `visualMatrix(Component)`.** Les classes d'un composant ne sont
  connaissables qu'en le rendant, et une matrice qui raterait silencieusement la
  feuille d'un enfant serait le pire résultat possible. On nomme les feuilles.
- **Règle morte : throw à l'enregistrement, pas erreur de compilation.** Comparer
  deux positions de breakpoint au niveau des types demande leur ordre en
  littéraux, et l'ordre des clés d'un objet n'est pas un tuple. Sous le plugin,
  le throw _est_ un échec de build.
- **`no-raw-class` ne se déclenche que dans les fichiers qui importent
  `@craft-ts/style`.** Un composant non migré ne réclame pas la garantie ; le
  signaler apprendrait à désactiver la règle.
- **`colorScheme` s'appelle `scheme`** : quatrième collision avec la table
  générée, tranchée comme les trois autres.

#### Tâches 15 et 16 : déclarées, pas inférées

Le plan les place dans `libs/component` — budget sur le meta de `craftComponent`,
somme lue sur le type du nœud `ifBlock`. Elles vivent ici dans le vocabulaire de
style, pour la même raison que la matrice prend des feuilles et pas un composant :
les classes d'un composant ne sont connaissables qu'en le rendant.

Le coût de ce choix, énoncé plutôt que sous-entendu : **une branche que personne
ne déclare est comptée comme co-présente**. Le mode de défaillance est donc le
sur-échantillonnage — des captures d'états qui ne peuvent pas exister — et jamais
le sous-échantillonnage. C'est le bon sens pour une garantie de couverture.

Trois façons dont la vérification du budget s'est retrouvée silencieusement vide
pendant son écriture, chacune attrapée par le cas négatif et non par la relecture :

1. `Budget` défauté à `[]` mettait **toutes** les feuilles du dépôt hors budget.
   Le défaut est `never`, ce qui rend le budget opt-in.
2. Posée sur le paramètre `sheet`, la contrainte est évaluée pendant que `Budget`
   s'infère encore du troisième paramètre : elle ne vérifiait rien. Même piège que
   la contrainte `writes`, même correctif — vérifier là où les deux sont connus.
3. `Budget[number][string]` lit les axes déclarés sur une **union**, et `keyof`
   d'une union ce sont les clés communes à ses membres — aucune. Un budget de deux
   axes ne déclarait donc rien du tout. Il faut un paramètre nu qui distribue.

### Vague 3 — niveau 3 : faite, sauf la vérification visuelle

| tâche                        | livré                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| 23 — vocabulaire             | obligations complètes ; la charge transporte son **explication** (`Obligation<Id, Explain>`) |
| 24 — propagation et scellage | `craftComponent(name, { seals: [...] }, …)` ; message composé depuis la charge               |
| 25 — axe de conteneur        | fermé au composant qui nomme le conteneur (`resolves`), plus l'élagage par `unreachable`     |
| 26 — témoin                  | `apps/demo/.../scroll.{style,}.ts`, route `/design-system/scroll`                            |

#### Le protocole, et la frontière qu'il respecte

Le core gagne `CraftRequirement<Id, Explain>` : **un identifiant et une phrase,
deux chaînes opaques qu'il n'interprète jamais**. Il ne connaît toujours aucun
nom CSS ; ce qu'il gagne, c'est de pouvoir **citer** une charge au lieu
d'imprimer un type anonyme. Toute la sémantique reste dans `@craft-ts/style`.

#### La preuve, textuellement

Retirer `provides(scrollPort.block)` de `shell.main` fait échouer
`npx tsc -p apps/demo/tsconfig.app.json` avec :

> `ERROR_unmet_context_requirement: "'scrollPort.block' is required by this
subtree and nothing above it provides one. declare it on the layout component
that owns the scrollable area. An overflow on the direct parent would create a
second scroll port, and the sticky element would stick to the wrong container."`

Les trois parties demandées par le plan y sont : ce qui manque, où le déclarer,
et ce que ferait le mauvais correctif évident.

#### Ce qui n'est PAS vérifié

**La moitié visuelle.** Le CSS émis est correct — `overflow-block: auto` et
`container-type: scroll-state` calculent bien sur les vrais éléments, et la règle
`@container scroll-state(stuck: block-end)` est dans la feuille — mais le bouton
n'a **jamais été observé** en train d'apparaître dans le navigateur. Le fichier
témoin le dit dans son propre en-tête plutôt que de laisser croire l'inverse.

Deux trouvailles de la tentative, qui tiennent quelle que soit la cause :

- `scroll-state(stuck: …)` interroge le **conteneur**, donc l'élément qui colle
  doit être celui qui le déclare. Faire du scroll port le conteneur parse,
  s'applique, et ne matche jamais.
- Conditionner sur `display` ne peut pas se résoudre : une boîte collante de
  taille nulle n'a rien à quoi coller, donc l'état qui la révélerait ne peut pas
  se produire. `visibility` conserve la taille de l'ancre.

### Vague 4 — graphe et architecture : faite sauf la tâche 29

| tâche                        | livré                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 27 — nœuds de style          | `mergeStyleDump` : un seul graphe, deux producteurs, jointure sur l'identité de classe                                                                                                          |
| 28 — prédicats               | `extractionGaps` **en premier**, puis `matrixSizeByComponent`, `undischargedObligations`, `dischargers`, `varsWrittenBy` / `propertiesWrittenBy`, `danglingVars`, `unproven`, `impactedClasses` |
| 29 — analyse d'impact et MCP | `impactedClasses` fait ; **`craft graph --impacted` et les outils MCP ne sont pas faits**                                                                                                       |
| 30 — documentation           | `apps/docs/guide/style/` : les trois niveaux et leur granularité d'adoption                                                                                                                     |

#### Ce que le graphe répond sur la vraie application

161 nœuds, 230 arêtes. Rien d'exigé et non déchargé. `dsButton-root` à 18
scénarios — **le même nombre que le paquet de matrice atteint par un chemin
complètement différent**, ce qui est désormais asservi par un test : si les deux
producteurs divergent, l'un des deux ment sur ce que l'application affiche.

Il a aussi trouvé deux variables de thème que personne ne lit (`--ds-onAccent`,
`--ds-surface`) — que personne ne cherchait.

#### Re-mesure du coût de typecheck (le point que la vague 3 devait trancher)

|                                       | instantiations |
| ------------------------------------- | -------------- |
| `apps/demo` avec le check de scellage | 11 082 893     |
| sans le check de scellage             | 11 076 920     |
| **delta**                             | **+0,054 %**   |

**Le contrôle ne coûte rien.** Ce qui coûte, c'est la _propagation_ des canaux —
posée en vague 0, pas le fait de les lire. Le seuil de 15 % de la tâche 3b n'est
donc pas menacé par les vagues 2→4.

Attention en revanche à ne pas comparer 11,08 M au 10,14 M du 24 août : la demo a
gagné le design system, le témoin de scellage et leurs specs entre-temps. Le seul
delta valable est celui du tableau ci-dessus, mesuré sur le même arbre.

#### Reste de la vague 4

- [ ] **29 — `craft graph --impacted <paths>` et les outils MCP** (`style_impact`,
      `style_matrix`, `style_debt`). Le prédicat existe et est testé ; ce qui
      manque est la CLI et l'exposition read-only côté `packages/mcp`.

### Vague 5 — réduction de matrice (tâches 31 → 32, CONDITIONNELLE)

- [ ] Ne pas ouvrir sans les deux mesures : matrice médiane > 24 scénarios, ou temps de
      capture CI > 10 min par PR. La première se relève en tâche 22, la seconde en fin
      de vague 4.

### Préexistants — à ne pas confondre avec une régression

- 5 specs `craft-ts-core` échouent (`state`, `insert-select`, `craft-control-flow`,
  `yieldable-insertion-method`) : présentes sur `main`, fichiers identiques.
- `apps/demo/src/app/examples/component/pending-block-exception-demo.ts` : TS2345,
  présente sur `main`, reproduite avec les fichiers de `main` remis en place.
- 14 specs `demo` rouges (`granular-mutation`, `state-machine-list`, `state-machine`) :
  compte identique avec la migration du composant témoin annulée.
- `npx nx lint demo` échoue sur `app.ts` (`no-raw-user-url`,
  `no-noninteractive-element-interactions`) — fichier non touché par la branche. Les
  deux règles de style n'y produisent zéro finding.
- Un typecheck de `apps/demo` dans un worktree neuf demande d'abord
  `npx tsc -b libs/component/tsconfig.lib.json` : sans `dist/out-tsc`, les project
  references sortent des TS6305 qui n'ont rien à voir avec le code.
