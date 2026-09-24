# Typed style system — journal d'exécution

Branche : `feat/typed-style-system`. Le plan complet (32 tâches, 5 vagues + vague 5
conditionnelle) reste le document de référence ; ce fichier ne consigne que ce que le
plan demande d'y écrire — les mesures, les décisions, et les écarts constatés entre le
plan et le dépôt réel.

## État

Dernière mise à jour : **2026-08-25**. **Les vagues 1 à 4 sont dans `main`.**
La vague 5 reste fermée : médiane 1, maximum 18, seuil 24.

La moitié visuelle du témoin de niveau 3 n'est plus une réserve : le
2026-08-25, `npx playwright test --config apps/demo/playwright.config.ts
--project=chromium e2e/scroll-state-witness.spec.ts` passe dans Chromium — le
bouton est masqué au départ, puis visible après le driver
`{ kind: 'scroll', to: 'end' }` appliqué par `applyScenario`.

| Vague                           | Tâches      | État                                                  |
| ------------------------------- | ----------- | ----------------------------------------------------- |
| 0 — mécanisme de canaux         | 1, 2        | faites                                                |
| 0 — mesure et point de décision | 3, 3b       | mesurée deux fois, **3b jamais déclenchée**           |
| 0 — migration `CssVars`         | 3 steps 2–4 | **écartée** — voir « Tâche 3 » dans « Reste à faire » |
| **1 — niveau 1**                | **4 → 11**  | **faite**                                             |
| 2 — niveau 2 : axes et matrice  | 12 → 22     | **faite**                                             |
| 3 — niveau 3 : obligations      | 23 → 26     | **faite**, moitié visuelle comprise                   |
| 4 — graphe et architecture      | 27 → 30     | **faite**                                             |
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
- `libs/component/src/lib/if-node.ts` et `match-node.ts` existent (tâche 16).
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
`apps/demo/src/app/examples/component/pending-node-exception-demo.ts` se reproduit
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

Points de propagation couverts : `h()`, les deux branches d'`ifNode`, `forNode`
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
somme lue sur le type du nœud `ifNode`. Elles vivent ici dans le vocabulaire de
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

### Vague 3 — niveau 3 : faite, compilation et rendu vérifiés

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

Rien pour ce témoin, et ce n'est plus une affirmation sur parole : l'e2e a été
lancé le 2026-08-25 et passe. La compilation et le rendu sont couverts : retirer
`provides(scrollPort.block)` de `shell.main` fait échouer `tsc` avec le nom de
l'obligation, et `apps/demo/e2e/scroll-state-witness.spec.ts` vérifie dans
Chromium que le bouton est masqué au départ puis visible après le driver
`{ kind: 'scroll', to: 'end' }` de l'axe `scrollState.stuck`.

Le détail de layout est important : l'ancre sticky reste un conteneur
`container-type: scroll-state`, tandis que le shell lui ajoute un espace final
typé. Sans cet espace, l'ancre dernier enfant reste collée au `block-end` même
à la limite de défilement ; le témoin ne change alors jamais d'état. La règle
utilise `visibility` pour conserver la taille nécessaire au collage, et masque
le seul état transitoire `stuck: block-end`.

### Vague 4 — graphe et architecture : faite

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

#### Deux décisions d'empaquetage, à contester si besoin

1. **`packages/mcp` pose `"paths": {}`.** Ce paquet se construit et se publie
   seul, et les `paths` du workspace tiraient les **sources** des libs dans son
   programme, sous sa résolution plus stricte. Il résout maintenant ses
   dépendances comme le ferait un consommateur.
2. **Du coup les outils de style résolvent `@craft-ts/dev-tools/style-report` à
   l'appel** et le décrivent par trois signatures locales. La logique reste à un
   seul endroit et est _appelée_, jamais copiée ; ce qui est dupliqué, ce sont
   trois signatures. L'alternative était d'ajouter `libs/dev-tools` aux
   workspaces npm — remodeler le dépôt pour un outil.

#### Ce que la CLI répond aujourd'hui

```
craft-graph --style-matrix   → total 53, médiane 1, plus grand dsButton-root (18)
craft-graph --impacted --ds-accent
                             → dsAlert-root, dsButton-root, dsMeter-fill, dsTheme-root
craft-graph --style-debt     → 0 dette, 0 obligation ouverte, 2 variables non lues
```

### Vague 5 — réduction de matrice (tâches 31 → 32, CONDITIONNELLE)

- [ ] Ne pas ouvrir sans les deux mesures : matrice médiane > 24 scénarios, ou temps de
      capture CI > 10 min par PR. La première se relève en tâche 22, la seconde en fin
      de vague 4.

### Préexistants — à ne pas confondre avec une régression

- 5 specs `craft-ts-core` échouent (`state`, `insert-select`, `craft-control-flow`,
  `yieldable-insertion-method`) : présentes sur `main`, fichiers identiques.
- `apps/demo/src/app/examples/component/pending-node-exception-demo.ts` : TS2345,
  présente sur `main`, reproduite avec les fichiers de `main` remis en place.
- 14 specs `demo` rouges (`granular-mutation`, `state-machine-list`, `state-machine`) :
  compte identique avec la migration du composant témoin annulée.
- `npx nx lint demo` échoue sur `app.ts` (`no-raw-user-url`,
  `no-noninteractive-element-interactions`) — fichier non touché par la branche. Les
  deux règles de style n'y produisent zéro finding.
- Un typecheck de `apps/demo` dans un worktree neuf demande d'abord
  `npx tsc -b libs/component/tsconfig.lib.json` : sans `dist/out-tsc`, les project
  references sortent des TS6305 qui n'ont rien à voir avec le code.

## Style uniquement par le design system — lot 0 (2026-09-23)

Branche `feat/style-only-design-system`. Objectif : que plus aucun `.css` ne soit
nécessaire. Le lot 0 ajoute au vocabulaire ce que les `styles.css` des apps portaient
encore.

### Ajouté

- **Couches `craft.*`** fixées par l'émetteur :
  `craft.reset, craft.base, craft.tokens, craft.global, craft.components, craft.variants, craft.overrides`.
  Écart avec le plan : il listait 4 couches. Les 3 couches existantes (`tokens`,
  `variants`, `overrides`) sont conservées sous le préfixe `craft.`, parce que le
  solveur de contraste et la spécificité des variantes en dépendent.
- **Reset** (`lib/global/reset.ts`) et **base** (`lib/global/base.ts`), écrits avec le
  vocabulaire typé, actifs par défaut (`craftStyle({ reset, base })`). La base porte
  `color-scheme` par l'axe `scheme`, `:focus-visible`, `accent-color`, `::selection`,
  `scroll-behavior`, et la neutralisation en `!important` sous `motion.reduced` : un
  important dans la couche la plus précoce bat toutes les couches suivantes. Le
  drapeau `important` est interne, aucun helper public ne le pose.
- **Variables du socle** `craftBase.*` : construites par `defineVarTokens`, la moitié
  pure de `cssVars` (sans registre). Leurs `@property` sont émis par le socle
  lui-même, sinon les dumps et les specs qui réinitialisent le registre
  dépendraient de l'ordre d'import.
- **`craftGlobalStyles(prefix, { root, elements })`**, couche `craft.global` ; les
  sélecteurs sont fermés sur `keyof HTMLElementTagNameMap`.
- **`defineFont`** + `googleFont` / `localFont`. Liens `<head>` via
  `transformIndexHtml` et `virtual:craft-style-head` pour le SSR, `@font-face` pour
  les fichiers locaux. `adjustFallback` est **calculé à partir de métriques
  fournies** (format capsize) : aucun parseur de police dans les dépendances, donc
  Arial est livré et une autre face se passe avec ses métriques.
- **`pseudo.*`** (`before/after/placeholder/marker/selection/backdrop`) et
  `pseudo.content.*`. Un `::before`/`::after` sans `content` au niveau supérieur est
  une erreur de type. Le dump porte `pseudoElement`, et le solveur de contraste
  écarte ces atomes de la peinture de l'élément.
- **`keyframes` / `animate` / `transitions` / `easing`**. Écart de nom avec le plan
  (`animation`/`transition`) : ces deux noms appartiennent déjà aux helpers générés,
  on applique la règle de collision par namespace.

### Inventaire 0.c

Relevé par `rg` sur les 23 `.css` hors docs (5 792 lignes).

| Fonctionnalité | Occurrences | Décision |
|---|---|---|
| `::before` / `::after` / `::placeholder` / `::marker` | 10 / 9 / 3 / 1 | couverts par `pseudo.*` |
| `@keyframes` | 25 | couvert par `keyframes` + `animate` |
| `@import` (polices) | 3 | couvert par `defineFont` |
| `@media` | 23 | axes existants (points de rupture, `scheme`, `motion`) |
| `:hover` | 58 | axe `interaction.hover` existant |
| `:focus-visible` / `:focus` / `:disabled` / `:active` | 33 / 11 / 23 / 1 | **manque**. Axes d'état à ajouter dans `interaction` (driver `selfState`), avec leurs drivers dans `style-testing`. À faire en tête du lot 5, quand la migration les consomme. Beaucoup de `:focus-visible` disparaissent : le socle les couvre |
| `:last-child` / `:first-child` / `:empty` / `:not(` | 15 / 2 / 2 / 7 | pas de helper. Bordures et marges de fin de liste → `gap` ; `:empty` → rendu conditionnel. Un sélecteur structurel libre n'est pas un axe énumérable |
| `scale(` / `rotate(` (transform) | 21 / 14 | propriétés individuelles `scale`, `rotate`, `translate` déjà dans la table |
| `box-shadow` | — | **manque** : table rétrécie à `none`. Échelle `shadow.*` à ajouter |
| `linear-/radial-/repeating-linear-gradient(` | 13 | **manque** : `backgroundImage` n'accepte que `url`. Constructeur `gradient.*` typé à ajouter |
| `calc(` / `min(` / `clamp(` / `minmax(` / `repeat(` | 15 / 13 / 12 / 16 / 3 | **manque** : fonctions de longueur typées (`clamp(a, b, c)` sur `LengthValue`) et pistes de grille |
| `rgba(` / `rgb(` / `color-mix(` | 25 / 14 / 4 | tokens de palette. Une transparence devient un token, pas une fonction à l'usage |
| `attr(` / `url(` | 3 / 3 | `pseudo.content` et `url()` existants |

Les quatre **manques** (états `interaction`, `shadow`, `gradient`, fonctions de
longueur et de grille) bloquent les apps qui les utilisent. Ils sont à combler avant
leur migration au lot 5, sur le même patron (namespace, valeur brandée, pas de
`string`).

## Style uniquement par le design system — lot 1 (2026-09-23)

Règles ESLint obligatoires, `error` dans `recommended`.

- **`no-raw-class` inconditionnelle.** Plus de garde sur l'import. Elle trace la
  valeur jusqu'à sa source, sans typage (`style-binding-utils.cjs`) : import d'un
  module `*.style`, paramètre ou membre de paramètre (entrée typée), `const`, tableau,
  fonction dont tous les `return` sont acceptables. Trois messages : `rawClass`,
  `computedClass`, et `untracedClass`. Ce dernier couvre notamment une sheet déclarée
  hors `*.style.ts` : le plugin ne l'évalue jamais, donc sa classe n'a pas de CSS.
- **`no-inline-style`.** Seuls les props hyperscript et `host` sont lus, parce que
  `style:` apparaît ailleurs dans le code (`Intl.NumberFormat`). `assign` doit venir
  de `@craft-ts/style` : un `assign` homonyme est refusé.
- **`no-component-css`.** Refuse `styles` / `stylesUrl` / `contentStyles` du meta et
  les imports `.css`, y compris `?inline` et `import()`.
- **Raison obligatoire** : ajoutée à `no-forbidden-eslint-disable`, qui passe dans
  `recommended`. Liste par défaut : les six règles de style ; extensible par options
  ou par `reasonRequiredRules` dans la politique. **Limite trouvée** : un
  `eslint-disable` global désactive aussi cette règle, et son rapport est avalé.
  C'est le lot 3 (Review Attest) qui doit lister les directives globales.
- **Preset `legacyComponentCss`** : il reçoit les 8 règles qui lisent le CSS de meta.
  Chaque app non migrée le réactive dans son bloc `TODO(style-only)`, pour ne rien
  perdre pendant la transition. Dans `demo-with-server-function`, les deux `off`
  (`require-focus-visible` / `require-reduced-motion`) ont été déplacés dans ce bloc.
- `ComponentMeta.styles/stylesUrl/cssVars/contentStyles` et `DirectiveMeta.styles/stylesUrl`
  sont marqués `@deprecated`.

Relevé des trois règles avant les overrides (hors specs) : quickstart-effect 3,
demo-ssr 60, demo-with-server-function 181, demo-effect 100, demo 317,
attestation-app 259, libs/component 77.

À reprendre au lot 5 : **`demo-ssr` et `libs/component` ne prennent pas
`recommended`**. Les règles ne s'y appliquent donc pas du tout, et leur migration
doit ajouter le preset.

## Style uniquement par le design system — lot 2 (2026-09-23)

Règles d'architecture obligatoires et dérogations.

- **Violations ciblées.** `architectureReport(graph, { waivers })` renvoie les
  violations et ce qui a été dérogé. `architectureViolations` et
  `assertDeclarativeArchitecture` passent par lui. Les règles historiques sont des
  assertions sur tout le graphe, qui lèvent un texte unique : elles ne portent pas de
  cible, et seule une dérogation `'*'` peut les excuser. Une dérogation ciblée sur
  l'une d'elles est refusée, avec un message qui le dit.
- **Quatre règles** (`architecture-style-rules.ts`), ajoutées à la liste de base :
  - `style-only-design-system` : classe non résolue (sauf entrée typée `CraftClass`),
    sheet déclarée hors `*.style.ts`, classe absente du dump, dump non fusionné,
    `meta.styles/stylesUrl/contentStyles`, import `.css` dans un fichier de
    composant ;
  - `style-obligations-discharged` ;
  - `no-dangling-css-vars` : lecture non déclarée, et déclaration jamais lue, où une
    lecture globale compte ;
  - `no-global-stylesheet` : import `.css` depuis un fichier d'entrée, ou
    `<link rel="stylesheet">` dans `index.html` / `src/index.html`.

  **Écart** : le plan disait de réutiliser `extractionGaps`. Mais cette fonction
  contient `component-without-style-class`, qui aurait mis en faute un composant de
  pure composition. Seule la partie « classe absente du dump » est reprise.
- **Extracteur** : `styled-element` gagne `sheetOutsideStyleModule` et
  `classTypedAsSheetClass`. La classe est reconnue par le nom d'alias `CraftClass`, ou
  par le type de retour d'une fonction ou d'un générateur.
- **Dump** : champ `globalReads` (variables lues par les styles globaux et les
  keyframes) ; les `craftBase.*` sont listées dans `vars` quand la base est active.
  `loadStyleDump(rootDir)` est extrait du plugin.
- **Dérogations** : `ArchitectureWaiver { rule, target, reason }`, typées contre le
  catalog par `defineArchitectureWaivers(catalog, [...])`. Une raison vide est
  refusée, une dérogation périmée devient une violation. `architectureWaivers(dir)`
  lit `architecture/waivers.ts` **statiquement**, pour la CLI, le MCP et bientôt
  l'attestation.
- **CLI** `craft-architecture-check` : `--style-dump`, `--project-dir`, et lecture
  des dérogations. Testée à la main sur quickstart-effect : il ne reste que
  `mutation-react-on` (`sendContextToAi`), parce que la CLI n'a pas d'option `allow`.
  Probablement déjà le cas sur `main`, mais pas vérifié.
- **MCP** `graph.violations` : applique les dérogations du projet et renvoie `waived`.
- **Apps** : les 6 loaders fusionnent le dump et deviennent `async`. Le catalog reste
  construit **sans** le dump, pour que son hash ne bouge pas. Chaque app a un
  `architecture/waivers.ts`. Les dérogations `TODO(style-only)` sont ciblées quand
  c'est possible (fichier d'entrée, `index.html`, `css-var:--ds-surface`).
  Les `catalog.ts` versionnés ont été régénérés : ils étaient déjà périmés (services
  de `libs/component` manquants).
- **attestation-app** : 4 specs `rules/` échouent sur du code que cette branche n'a pas
  touché (nommage interactif, méthode `collapseSide` inutilisée, params de ressource,
  parcours visuels). Je n'ai pas comparé avec `main`. Sa spec globale déroge à
  `no-unused-primitive-methods` avec cette raison explicite.

À reprendre au lot 5 : le générateur `create-project` émet encore des loaders
synchrones, sans dump ni `waivers.ts`.

## Style uniquement par le design system — lot 3 (2026-09-23)

Review Attest : chaque contournement est un sujet à décider.

- **Sujets** `eslint-disable` et `architecture-waiver` dans `@craft-ts/attest`.
  - L'id d'une directive devient `eslint-disable:<file>:<rule>:<ordinal>`. Celui d'une
    dérogation est `architecture-waiver:<project>:<rule>:<target>`.
  - L'evidence d'une directive se limite à la directive, sa raison et l'extrait des
    lignes qu'elle neutralise. Elle ne contient ni numéro de ligne ni le reste du
    fichier : une modification ailleurs dans le fichier ne renvoie pas le sujet en
    revue ; une nouvelle raison ou un changement du code neutralisé, si. Même
    principe pour une dérogation, dont l'evidence est règle + cible + raison.
  - Il n'y a pas de tranche de code à rejouer : l'empreinte est l'evidence elle-même.
- **Écart** : le scanner de `dev-tools` n'importe pas `EslintDisableInput` depuis
  `@craft-ts/attest`, car `dev-tools` est la racine du graphe nx. C'est la CLI, qui
  importe les deux, qui garantit par typage que les deux formes s'accordent.
- **Scanner** : il lit désormais le fichier **parsé**. Un simple scan de tokens perd sa
  position après un `${` et prenait une directive écrite dans un template literal de
  spec pour un vrai commentaire. Vu en conditions réelles, le test est rouge sur
  l'ancien scanner. Sur ce dépôt : 120 directives, dont les `eslint-disable` globaux,
  que la règle ESLint ne peut pas voir (limite du lot 1).
- **CLI** : `--kind eslint-disable | architecture-waiver`, et inclusion dans `all` et
  `devtools`. La config `review-attest` gagne `bypasses: false | { styleDump }`. Les
  dérogations de tous les `architecture/waivers.ts` du dépôt sont collectées.
- **App de revue** :
  - onglet **Contournements** (`bypasses-view.ts`), avec filtre par règle, extrait et
    raison ; une raison absente est mise en avant ;
  - **indicateur d'adoption** (`styleAdoption`, calculé à partir des violations de
    `style-only-design-system`, pour que l'indicateur et la vérification ne puissent
    pas diverger). Chaque composant restant affiche la raison de sa dérogation ;
  - dans la file de revue, les cartes de contournement ont leur propre présentateur.

  La vue est écrite avec une sheet `bypasses-view.style.ts`, sans classe brute.
  Constaté dans le navigateur : l'app de revue affiche 2 composants adoptés sur 12
  (les deux nouveaux) ; accepter une carte écrit bien l'attestation dans le ledger.
- **Deux trouvailles** :
  - Une entrée de composant nommée `title` est avalée comme attribut HTML de l'hôte, et
    **toutes les entrées suivantes se décalent**, sans aucune erreur. Contourné en
    renommant l'entrée ; à signaler au framework.
  - La table générée n'a pas de famille générique `monospace` (seulement
    `ui-monospace`, que seul Safari résout). Ajout de `systemFontStack` et
    `monospaceStack` dans `font.ts`. C'est un **5e manque** du vocabulaire, pour la
    liste du lot 5.
- **Vérifications** : e2e de l'app de revue, 12 tests verts sur 16. Les 4 échecs ne
  touchent pas aux contournements : `template-agent` vise une API absente de `HEAD`,
  et la capture visuelle bute sur une requête `/api/template-detail` que le parcours
  ne simule pas (même cause que `visual-happy-paths`).
- Hors périmètre, comme prévu : l'éditeur de politique (`eslint-applied-rules.ts`).

## Style uniquement par le design system — lot 4 (2026-09-23)

Les composants internes de `@craft-ts/component` passent sur des sheets.

- **Migrés** : l'overlay IA (menu contextuel, lanceur, boîte de dialogue, chat), le
  pending par défaut (`craft-defaults`) et le skip-link. `ai-overlay-theme.ts` (le
  thème en texte CSS) est supprimé. Les variables de thème **gardent leurs noms**
  (`--craft-ai-bg`, `--craft-ai-launcher-right`…) : une app qui les surcharge continue
  de fonctionner.
- **Classes calculées devenues des axes** : état « copié », ton des boutons, phase de la
  timeline. Les bascules de visibilité passent par l'attribut `hidden`, et la position
  (menu, glisser du chat) par `cssVars` + `assign`. Le code de comportement retrouve le
  panneau par un attribut stable (`data-ai-chat`), plus par une classe de style. Les
  attributs `data-craft-*` sont réservés au moteur de rendu.
- **Vocabulaire comblé** (4 manques de l'inventaire sur 5) :
  - `interaction.focus` / `active` / `disabled`, avec leurs drivers (`holdPointer`
    optionnel sur le harnais) ;
  - `shadow(...)`, `math.min/max/clamp`, `tracks.autoFit/autoFill/equal` ;
  - `systemFontStack`, qui sait maintenant écrire `system-ui` et `-apple-system` sans
    guillemets, et `systemUiStack`.

  Reste `gradient`.
- **Plugin** : option `include` (nom de paquet ou chemin) ; `@craft-ts/component` est
  inclus par défaut dès qu'il est résolvable, et les `*.style.js` publiés sont reconnus.
  Dans le monorepo, les apps listent `libs/component/src` par chemin, et les loaders
  d'architecture aussi.
- **Trouvaille majeure, `isolated`** : un style mis en couche perd face à **n'importe
  quelle** feuille non mise en couche. Vu en vrai : le `button, select { color:
  inherit }` hérité de l'app de revue repeignait le texte du lanceur en sombre sur fond
  bleu. Le chrome qu'une lib monte chez un hôte inconnu doit y résister, comme le
  faisait son ancien CSS scopé. `craftStyles(..., { isolated: true })` émet donc la
  sheet **hors couche**, après les couches, avec des atomes jamais partagés (préfixe
  `i-`). Sinon, un atome partagé sortirait la classe d'une app de sa couche, par-dessus
  ses propres variantes. Toutes les sheets du chrome du framework sont isolées. Vérifié
  dans le navigateur : texte blanc, police système, 13 px, en clair comme en sombre.
- **Même piège, entre deux classes du même élément** : deux atomes non conditionnels sur
  la même propriété se départagent par le nom de classe, pas par l'intention. Le thème
  de l'overlay ne porte donc plus que des variables ; couleur et police vont dans la
  classe de chaque racine. À surveiller : une règle qui détecte ces conflits entre
  classes d'un même élément serait utile.
- **Apps** : les quatre apps qui n'avaient pas le plugin l'ont reçu, avec
  `reset: false, base: false` et un `TODO(style-only)`, plus l'import de
  `virtual:craft-style.css`, pour que leur overlay garde son style.
- `component` dépend de `@craft-ts/style` (peerDependency, référence tsconfig, alias
  vitest). La référence inverse `style` → `component` est retirée : elle ne servait à
  rien et aurait créé un cycle.
- **Vérifications** :
  - `component` a été comparé à `HEAD` dans un worktree jetable, supprimé depuis : les
    **25 mêmes échecs**, déjà présents ;
  - les 7 tests qui lisaient le CSS de meta sont réécrits sur le registre des sheets ;
  - les specs d'architecture des 5 apps passent ;
  - `quickstart-effect` ne démarre pas, et c'est aussi le cas sur `HEAD` (« no root
    component »).
- Restent dans `libs/component`, sans être du style : les deux `styles` de
  `testing.ts`, qui recopient le meta d'un composant.

## Style uniquement par le design system — lot 5 (en cours, 2026-09-23)

Migration des projets, dans l'ordre du plan.

- **quickstart-effect** : fait. `foundation.style.ts` porte une palette, le thème du
  document (`craftGlobalStyles`) et la classe d'erreur. `styles.css` est supprimé, le
  socle (reset + base) est actif, il n'y a plus de dérogation ni de bloc
  `TODO(style-only)`.
- **demo-ssr** : fait.
  - Le vrai design était le `styles:` inline d'`App`. `styles.css` était en grande
    partie mort : classes sans usage, `html[data-navigation]` que personne ne pose.
    Tout tient maintenant dans `ssr-lab.style.ts` : une palette, un thème en variables
    (clair par défaut, sombre en un seul bloc sur `:root`), les sheets `shell`, `page`
    et `pipeline`. Deux axes d'état : `data-ssrCard`, `data-ssrBadge`.
  - L'indicateur de typecheck, en DOM brut, a sa propre sheet ; `data-status` devient
    `data-typecheck`.
  - Polices système au lieu de Manrope et DM Mono : la CSP de production
    (`font-src 'self'`) bloquait déjà l'`@import` Google Fonts.
  - En dev, le HTML serveur lie `/@id/__x00__virtual:craft-style.css?direct` : le plugin
    accepte désormais une query sur l'id virtuel.
  - Preset ESLint `style` (les règles de style de `recommended`, seules) : demo-ssr le
    prend, sans prendre tout `recommended`.
- **Vocabulaire ajouté** :
  - `ariaCurrent.page`, axe standard qui lit l'`aria-current` posé par le routeur ;
  - `tracks.fr` / `tracks.list`, des pistes en `fr` que seul un track list accepte ;
  - `tracks` rejoint les espaces de noms de constructeurs de `no-raw-css-value`, et
    `systemFontStack` ses fonctions à primitives.
- **Bloquant en amont, hors de ce lot** : le rendu SSR échoue sur `HEAD`. Dans
  `server-render.ts` et `hydrate.ts`, `ɵinjectCraftRootComponent()` est appelé hors du
  contexte d'injection (`a0e3e991e` n'a corrigé que `bootstrap.ts`). Derrière, les
  services `toProvide` non fournis lèvent au lieu de prendre leur valeur par défaut.
  demo-ssr a donc été vérifié sur une page statique qui reprend son balisage avec les
  vraies classes et le CSS construit, en clair, en sombre et en mobile.
- **demo-with-server-function** : fait.
  - Chacun des cinq écrans recopiait le même CSS : un thème sombre, puis un thème clair
    écrit après lui qui gagnait partout. Le rendu réel était le clair, avec la bande
    `.flow` masquée. Tout tient maintenant dans une seule `demo.style.ts` :
    - une palette, avec le clair par défaut et l'ancien sombre en `scheme.dark` ;
    - les sheets `demoNav`, `demoPage` et `statusPage` ;
    - deux axes d'état : `data-demoButton`, `data-statusLink`.
  - La bande `.flow` (morte) et ses `flowStep` sont retirés.
  - Les quatre `eslint-disable no-hardcoded-design-values` disparaissent avec le CSS.
- **Bug de la lib corrigé** : `clipOverflow` (canal `violates`) enregistrait la
  violation sans **émettre** son `overflow-*: clip`. La troncature ne s'appliquait donc
  jamais, y compris dans le chat IA du lot 4. Spec ajoutée.
- **`tracks.minmax`** : sans `minmax(0, …)`, une piste `fr` ou la colonne implicite
  `auto` d'une grille prend la largeur min-content d'un contenu insécable (ellipses,
  `nowrap`) et déborde. Vu en vrai en mobile.
- **Même blocage en amont, côté client** : sans SSR, le contenu routé échoue lui aussi
  sur `No provider for Craft token "CraftPendingComponentServiceToken"`. Seul le shell
  s'affiche. Vérification faite sur une page statique, avec les vraies classes et le
  CSS construit : clair et sombre en desktop, clair en mobile.
- **demo-effect** : fait.
  - Les sept exemples répétaient la même carte, chacun avec sa teinte. La carte est
    écrite une fois dans `effect-demo.style.ts`. La teinte est un axe d'état
    (`data-exampleTint`) qui pose les variables de thème de la carte ; la teinte neutre
    en fournit les valeurs initiales. Trois autres axes : l'encadré
    (`data-exampleNote`), les boutons carré ou fantôme (`data-exampleButton`) et le
    todo terminé (`data-exampleTodo`, avec une table de correspondance plutôt qu'un
    ternaire, interdit dans un template).
  - Chivo passe par `defineFont` : le `<link>` de `index.html` et l'`@import` de
    `styles.css` disparaissent, et le plugin injecte preconnect et preload. La
    dérogation `no-global-stylesheet` sur `index.html` tombe aussi.
  - Une spec visait `.shipping-spinner` : elle cible maintenant `[aria-hidden]`.
- **Vocabulaire** : `ariaPressed.pressed` (bouton bascule), sur le modèle
  d'`ariaCurrent`.
- **Reset** : `[hidden]:not([hidden='until-found']) { display: none !important }`.
  Sans cette règle, toute classe qui pose un `display` ré-affiche un élément `hidden`
  (vu sur le « × » de l'indicateur de typecheck ; l'overlay IA du lot 4 bascule aussi
  par `hidden`). Un `!important` dans la première couche est la seule chose qu'aucune
  couche suivante ni aucune feuille hors couche ne peut battre.
- Vérifications :
  - erreurs tsc identiques à `HEAD`, fichier par fichier (script
    `compare_head.py`) ;
  - specs de l'app (15) et d'architecture (17) vertes ;
  - shell vérifié dans le vrai serveur de dev, cartes sur une page statique.
- **demo** : fait.
  - Choix de Romain : une sheet d'exemple commune plutôt qu'une traduction fidèle, et
    une réécriture des démos `css-vars-*` sur `@craft-ts/style`.
  - `examples/shared/example.style.ts` contient :
    - la carte (une variante sombre pose des variables que les enfants lisent), le
      titre, le texte (tons), le code, les notes, les actions ;
    - les boutons (tons), les champs (axe `wide`), le tableau, la pagination, la liste,
      les alertes (tons) ;
    - le héros, les tuiles, les définitions, etc.
  - Les paires craft/primitives partagent cette sheet, et leurs 17 `.css` sont
    supprimés. Ce qui n'appartient qu'à un exemple reste à côté de lui :
    - `pixel.style.ts` : la couleur de cellule par `assign`, avec une table hex →
      jeton de palette ;
    - `editor.style.ts` : les étapes en axe `data-editorStep` ;
    - `task-board.style.ts`, `debounced-web-search.style.ts` ;
    - `view-transitions.style.ts` : le dégradé et le `view-transition-name` par
      `assign`, et les données photo perdent leur chaîne CSS.
  - Shell (`demo-shell.style.ts`) : Chivo par `defineFont`, et la position du
    lanceur IA par `set(craftAiLauncherPosition.right, …)` sur `:root`.
    `src/styles.css` et les deux liens Google Fonts de `index.html` disparaissent.
  - `css-vars-*` est réécrit. La démo montre :
    - la valeur par instance (axe de variante qui fait `set`, le reste gardant la
      valeur initiale) ;
    - `inherits: true` ;
    - le transfert : le parent fait `set(enfant, parent)`, l'appelant surcharge
      dans sa propre sheet ;
    - `@property` : un pourcentage enregistré, écrit par `assign`, qui s'anime.

    `contentStyles` et `allowContainerStyles` sont retirés de la démo de projection.
    Le contrat de slot passe d'une classe à `data-projection` : une classe de sheet
    est une liste d'atomes, pas un nom qu'un sélecteur peut exiger.
  - La dérogation `--ds-surface` tombe : la racine du thème peint sa surface et son
    encre.
  - Tests : les sélecteurs de classe (`.pixel-cell`, `.demo-nav__toggle`,
    `.action-btn`, `.design-system-host`…) passent à des `data-testid`, e2e compris.
    Les pixels se lisent maintenant sur `--pixel-fill`.
- **Ajouts à la lib** :
  - `gradient.linear/radial`, `ImageValue`, `kind.image`, `bgImage` : `gradient`
    était le dernier manque du vocabulaire ;
  - `tracks.minmax` ;
  - `@craft-ts/component/style` : un point d'entrée qui ne contient que des jetons
    (`craftAiLauncherPosition`), autorisé par `style-file-boundary` ;
  - `assign` ajouté aux appels de présentation de
    `require-reactive-template-bindings`.
- **Piège** : une valeur initiale `@property` en `rem` n'est pas indépendante du calcul,
  et le navigateur abandonne tout l'enregistrement. L'architecture l'attrape ; donner
  une valeur initiale en `px`.
- Vérifications demo :
  - lint à 0 ;
  - architecture 19/19 ;
  - tsc sans nouvelle erreur ;
  - specs : les **mêmes 20 échecs** que `HEAD`, mesurés sur un extrait `git archive`
    de `HEAD` dans `tmp/baseline`, supprimé depuis ;
  - `vite build` OK.

  e2e non lancés : le rendu routé est cassé en amont.
- **attestation-app** : fait (choix de Romain : migration complète maintenant).
  - Les 2 300 lignes de `styles.css` sont réparties en sheets par zone :
    - `review-app.style.ts` : palette clair/sombre, ~38 variables de thème, globaux, et
      le choix explicite du thème en axe `data-reviewTheme` sur le shell ;
    - `review-shell`, `view-tabs`, `review-controls`, `review-inventory`,
      `review-card`, `annotation`, `folder-layout`, `tier-legend`,
      `application-overview`.
  - Axes d'état : `data-reviewKind` (masque selon le type de carte),
    `data-reviewAction`, `data-reviewNotice`, `data-zoom`, `data-reasonNote`, les états
    de ligne du folder-layout (`rowKind`, `rowStatus`, `rowCollision`, `rowLinked`,
    `rowLocated`). La bande de sélection et le pli passent par `assign` sur
    `evidenceBox`. Les infobulles sont des `::after` avec `content: attr(...)`.
  - `browser-adapter.ts` pose `data-rowLinked` et `data-rowLocated` avec
    `setAttribute` : `dataset.rowLinked` écrirait `data-row-linked`, que l'axe ne lit pas.
  - `template-review-group.ts` n'est importé nulle part, et ses erreurs tsc existent déjà
    sur `HEAD`. Ses classes sans CSS sont retirées, et les `data-testid` sont posés là où
    l'e2e visait une classe.
  - Les e2e (`attestation-app/e2e`, `review-attestation/e2e`) visent maintenant des
    `data-testid` et des attributs d'état. Sont exclues les classes de la page
    rejouée (`.title`, `.body`…), qui appartiennent à la fixture.
  - Écarts assumés avec le rendu de `HEAD` : dans `HEAD`, la feuille hors couche écrasait
    `decisionStyles.primary`, et Accepter s'affichait en contour. Il est maintenant plein,
    comme le dit la sheet qui porte la preuve de contraste. « Vues d'attestation » et
    « Zoom » suivent le style que le CSS voulait, et que ses sélecteurs ratent.
  - La dérogation `no-global-stylesheet`, celle de `style-only-design-system` et le bloc
    `TODO(style-only)` d'ESLint sont retirés.
- **Deux bugs de la lib trouvés en comparant avec `HEAD`** :
  - Le nom d'un atome hachait `axe:point` sans la condition. Deux sheets avec chacune
    un breakpoint `wide` (761 px et 901 px) obtenaient donc la même classe, et la
    première enregistrée gagnait. `below(bp.x)` et `bp.x` étaient confondus eux aussi.
    L'identité hachée inclut maintenant la condition ouverte. Spec ajoutée.
  - `clipOverflow` pose `overflow: clip`, qui ne crée pas de conteneur de défilement.
    Le minimum automatique d'un élément de grille ou de flex reste donc la largeur de son
    texte, et l'ellipse ne tronque rien. Il faut `minWidth(0)` avec (fait dans les
    helpers `ellipsis`).
- **Vocabulaire** : `ariaInvalid.true` (anneau d'erreur du motif), `ariaCurrent.true`,
  `gradient.repeatingLinear/Conic`, `bgImage` multi-couches, `bgSize`, `bgPosition`,
  `backdropBlur`, `uaScheme`, `spanAllColumns`, `pseudo.content.attr`.
- **Corrigé au passage** : `apps/demo/review-attest.config.ts` pointait encore vers
  `apps/demo/src/styles.css`, supprimé au lot précédent.
- Vérifications attestation-app :
  - tsc et lint identiques à `HEAD` (les erreurs restantes sont préexistantes :
    `bypasses-view`, liens `a()` de `review-app`) ;
  - architecture : les 4 mêmes échecs que `HEAD` ;
  - specs de l'app (13) et de contraste vertes ;
  - `vite build` OK ;
  - rendu comparé à `HEAD` dans le vrai serveur de revue (`startReviewServer`), en clair,
    en sombre, à 800 et 1 100 px.
- **Scaffold `create-project`** : fait.
  - Plus de `src/styles.css` ni de chemin `typedCss` : l'option disparaît de la config,
    du CLI (`--typed-css` est accepté sans effet, `--no-typed-css` lève une erreur qui
    explique pourquoi) et de la question interactive. `@craft-ts/style`,
    `style:check`, le preset ESLint `typedCss` et le plugin sont toujours là, avec ou
    sans design system.
  - `src/app/app.style.ts` remplace la feuille globale :
    - `craftGlobalStyles('page')` pour `body`, `a` et `label` ;
    - la sheet `shell` : `root`, `link`, `content`, `nav`, `main` et `badge` (le badge
      expérimental passe par une classe au lieu de `'starter-experimental-badge'`).
  - L'indicateur de typecheck a sa sheet. Son état d'échec est l'axe
    `data-typecheck`. Au passage, son `as` et un `eslint-disable` inutile sont retirés.
  - Couleurs sur les classes, et pas seulement sur `body` : le solveur de contraste
    ignore les règles globales. Liens de la nav, `main` et, sans design system, les
    pages routées (analysées seules) étaient « indéterminés ». `style:check` échouait
    donc sur le starter généré. Le shell porte maintenant ses couleurs, et les pages
    sans design system passent par `shell.content`.
  - Suite d'architecture émise par `migrate-architecture` quand le projet dépend de
    `@craft-ts/style` : loader asynchrone qui fusionne le dump (`loadStyleDump`,
    alias résolu par `createRequire`, `@craft-ts/component` inclus par défaut),
    `waivers.ts` (jamais écrasé par une nouvelle exécution) et `architecture.spec.ts`
    qui appelle `assertArchitecture` avec les dérogations.
- **Bug de la lib** : `findProjectStyleModules` dédoublonnait par chemin, pas par
  chemin réel. Un paquet atteint à la fois par défaut et par un `include` explicite,
  ou derrière un lien symbolique (pnpm), était évalué deux fois : `cssVars: prefix
  'craft-ai' is already declared`. Spec ajoutée.
- Vérification sur des projets **générés pour de vrai**. Les paquets locaux sont
  construits par `tsc` et liés dans `node_modules/@craft-ts` (harnais
  `scaffold-harness.mjs` du scratchpad) :
  - starter standard : `vite build` OK, contraste 16/16 prouvé, architecture 17/17 ;
  - sans design system : lint à 0 erreur, build OK, contraste 18/18, architecture
    17/17 ;
  - domain-first : build OK, contraste 6/6.
  - Défauts préexistants, sans rapport avec le style (tâche proposée à part) :
    - `components.ts` du starter déclare 5 composants (`max-craft-declarations-per-file`) ;
    - les routes domain-first n'ont pas `assertExhaustiveRouteExceptions` ;
    - erreurs tsc de `app.config.ts`/`app.routes.ts`, les mêmes que sur les apps du
      dépôt.
- **Générateur de route** : fait. Il n'émettait déjà ni `.css` ni `styles`. Le
  composant qu'il crée a maintenant sa sheet `<nom>.style.ts` (`craftStyles` avec une
  classe `root`) et la pose sur son élément. Vérifié : spec 9/9, et les deux fichiers
  émis passent le lint et le typecheck d'un starter généré.
- **Docs (`apps/docs`)** : fait.
  - `guide/components/styles.md` devient « Styling a component: the only way » :
    - la forme : une sheet, puis un composant avec un axe `data-*` et `assign` ;
    - où va chaque chose ;
    - ce qui refuse les autres voies (règles ESLint et d'architecture) ;
    - l'unique contournement, raisonné et attesté (vue Bypasses).
  - `css-variables.md` est réécrite sur `cssVars` de `@craft-ts/style` : valeur par
    instance par variante, héritage, transfert parent → enfant, `assign`,
    `@property` émis. `meta.cssVars` est présenté comme déprécié.
  - `customization.md` : la classe de host vient d'une sheet, les directives
    ajoutent leur classe, et « How a parent reaches a child » passe par une
    variable héritée. La section `@scope` est retirée.
  - `content-projection.md` : le contrat de slot passe par `data-slot` au lieu
    d'une classe, et le cadre est stylé par sa sheet ; `contentStyles` et
    `allowContainerStyles` sont retirés de la page, `example-12` est supprimé.
  - `components/index.md`, `learn/01`, `fine-grained-reactivity`,
    `pagination-placeholder`, `route-load-errors`, `testing/components` : plus de
    `styles:` ni de classe littérale.
  - Axes ARIA documentés dans `style/define.md`, constructeurs de valeurs (dégradés,
    `bgImage`, `uaScheme`, `spanAllColumns`, `pseudo.content.attr`) dans
    `style/tokens.md`. `variants.md` disait encore « no-raw-class dans les fichiers
    qui importent le paquet » ; c'est corrigé.
  - Snippets : le bloc `TODO(style-only)` d'ESLint est retiré. Les 9 snippets
    fautifs sont migrés : de vraies sheets `*.style.ts` à côté, et des specs qui
    montent le composant et vérifient classe, attribut et variable (lint 0).
    Suite docs : 173 tests verts. Un seul fichier échoue, préexistant et hors
    sujet : `send-context-webhook` importe `provideSendContextEventEnricher`, que
    `libs/core` n'exporte pas.
  - `require-reactive-template-bindings` accepte `unit.*(...)` dans un binding :
    c'est la valeur typée qu'écrit `assign`, de la présentation au même titre.
    Spec ajoutée.
  - `TODO(style-only)` ne subsiste plus que dans ce journal (commentaires et
    raisons de specs reformulés, `APPLICATION-CAPTURES.md` corrigé).
- **Vérification finale** (en cours) :
  - `git grep "TODO(style-only)"` ne trouve plus que ce journal.
  - `craft-graph --style-debt` a été lancé sur les 6 apps, avec un dump produit par
    `loadStyleDump`, comme dans les loaders d'architecture. Résultat : 0 obligation
    non déchargée, 0 variable non lue ou non déclarée, 0 trou d'extraction.
    La seule dette est l'échappatoire motivée du skip-link (hors écran, pas
    caché, pour rester focalisable).
  - Bug corrigé au passage : `danglingVars`, qu'utilise le rapport de dette,
    comptait comme « non lues » les variables que le socle lit depuis une règle
    globale (`--craft-focusRing`…), alors que la règle `no-dangling-css-vars` les
    excluait. Le filtre vit maintenant dans `danglingVars` ; les deux s'accordent,
    et une spec a été ajoutée.
  - ESLint sur les 8 projets touchés par le style : 0 erreur partout.
    attestation-app avait 51 erreurs qui existaient déjà sur `HEAD` ; elles sont
    corrigées :
    - `bypasses-view.ts` (écrit au lot 4) : les textes dérivés quittent le template ;
      `rules` et `shown` passent dans l'insertion du filtre `ruleFilter` ; le
      comptage n'utilise plus `Map.set`, et le `as const` de sa sheet est retiré ;
    - `view-tabs.ts` : `aria-pressed` des deux derniers onglets passe par des
      `craftComputed`, comme les autres ;
    - `review-app.ts` : les 7 liens vers l'IDE reçoivent un nom local unique,
      `data-navigation="external"`, et `safeUrl` sur leur `href` (une URL relative
      `/api/open-in-ide?…`, que `safeUrl` accepte).
  - Specs d'architecture : quickstart-effect 4/4, demo-ssr 18/18,
    demo-with-server-function 24/24, demo-effect 17/17, demo 19/19. attestation-app
    passe de 4 échecs à 3 (le nommage des liens corrige
    `interactive-element-named`). Les 3 restants existaient déjà et n'ont pas de
    lien avec le style : `collapseSide` et ses voisines sont appelées depuis un
    helper `tree()` que l'analyseur ne suit pas, un paramètre de ressource vient
    d'un state, et un mock `/api/template-detail` manque. Tâche proposée à part.
  - **Lot 5 terminé** côté style.
