# Typed style system — journal d'exécution

Branche : `feat/typed-style-system`. Le plan complet (32 tâches, 5 vagues + vague 5
conditionnelle) reste le document de référence ; ce fichier ne consigne que ce que le
plan demande d'y écrire — les mesures, les décisions, et les écarts constatés entre le
plan et le dépôt réel.

## État

Dernière reprise : **2026-08-24**, merge de `main` (177 commits). Voir
« Reprise du 2026-08-24 » plus bas — le dépôt a changé de socle entre-temps.

| Vague                           | Tâches                | État                                                     |
| ------------------------------- | --------------------- | -------------------------------------------------------- |
| 0 — mécanisme de canaux         | 1, 2                  | faites                                                   |
| 0 — mesure et point de décision | 3 (steps 1 et 5), 3b  | re-mesurée le 2026-08-24, **3b toujours non déclenchée** |
| 0 — migration `CssVars`         | 3 (steps 2–4)         | non commencée                                            |
| 1 à 5                           | 4 → 32                | non commencées                                           |
| —                               | esquisse `libs/style` | hors plan, faite (voir `libs/style/README.md`)           |

L'esquisse `libs/style` n'est **pas** le package des vagues 1→3 : table de propriétés
écrite à la main, pas de plugin d'émission, pas de drivers, `seal()` en fonction libre.
Elle existe pour que les problèmes d'API sortent maintenant, et elle tourne sur les
canaux réellement commités. Le détail de ce qu'elle prouve et de ce qui lui manque est
dans son README, pas ici.

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

- **La marge a fondu.** Le coût des canaux est passé de +3,0 % à +8,1 % d'instantiations
  sans qu'une ligne de canal ne bouge : c'est la surface applicative qui a rétréci
  autour d'eux, donc leur part relative qui a grossi. Il reste 7 points avant le seuil,
  et les vagues 1→3 vont mettre une charge réelle sur des canaux aujourd'hui vides.
  **Re-mesurer à la fin de la vague 3**, quand `obligations` transporte enfin quelque
  chose — c'est là que le point de décision de la tâche 3b se jouera vraiment.
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

### À trancher avant de reprendre

- [ ] **Namespaces `unit.*` et `kind.*`.** L'esquisse a buté sur deux collisions :
      `px` est à la fois une unité et `padding-inline`, `color` à la fois une propriété
      et un kind `@property`. Elle a tranché en passant les unités sous `unit.px` /
      `unit.rem` et les kinds sous `kind.color` / `kind.length`. À entériner dans le
      plan (tâches 4, 5, 7) ou à trancher autrement — mais une seule fois.
- [ ] **Sort de l'esquisse.** Recommandation : la promouvoir fichier par fichier plutôt
      que réécrire à côté, et **garder `libs/style/example/example.spec.ts` comme filet
      de régression** pendant toute la vague 1. C'est la seule chose du dépôt qui
      prouve aujourd'hui qu'une obligation remonte et s'annule.
- [ ] **Ligne « Tech Stack » du plan.** Angular 21 n'existe plus dans le dépôt ; la
      remplacer par « Vite 7 + alien-signals » avant que quelqu'un s'appuie dessus.
- [ ] **Re-mesurer à la fin de la vague 3**, pas avant : c'est là que `obligations`
      transportera enfin une charge réelle et que le point de décision de la tâche 3b
      se jouera pour de bon.

### Tâche 3 — finir la migration `CssVars` (steps 2–4)

- [ ] Poser les six champs de `CssVarContract` sur **`accumulate`** (union pure) et
      laisser `MergeCssVarContracts` tel quel — la raison est développée dans la
      section « Tâche 3 » ci-dessus, elle n'a pas bougé avec le merge.
- [ ] Critère non négociable : `libs/component/src/lib/css-vars.spec.ts` passe **sans
      modification**. Si une spec doit changer, l'abstraction n'est pas la bonne.

### Vague 1 — niveau 1 : tokens et variables typées (tâches 4 → 11)

- [ ] **4 — kinds et treillis.** Créer le vrai package : `libs/style/project.json`
      (projet nx `craft-ts-style`, calqué sur `libs/component/project.json`),
      `package.json`, `tsconfig.lib.json`. Les `paths` sont déjà en place.
- [ ] **5 — tokens.** L'esquisse a déjà les brands nominaux à `unique symbol` dans
      `libs/style/src/lib/values.ts` ; la falsifiabilité du brand (step 3) reste à
      jouer, c'est la step la plus importante de la tâche.
- [ ] **6 — `cssVars()` et émission `@property`.** Base dans
      `libs/style/src/lib/css-vars.ts` ; manquent l'émission du bloc `@property` et le
      rejet des préfixes en double.
- [ ] **7 — table de propriétés générée.** La vraie tâche de la vague : l'esquisse a
      une douzaine de helpers écrits à la main dans `src/lib/props.ts`. Générer depuis
      MDN/webref, avec la liste d'exclusions (`overflow` en tête) et la liste des
      non-couverts. Le test de conformance générique (aucun helper exporté n'accepte
      une string) prime sur les cas écrits à la main.
- [ ] **8 — `craftStyles()`.** Existe dans l'esquisse avec un contrat de variantes déjà
      inféré ; reste à en faire l'entrée de l'émetteur (le registre `registeredClasses()`
      tient déjà les règles).
- [ ] **9 — plugin d'émission.** Vite nu : suivre le pattern des plugins `.mjs` de
      `tools/` chargés par `apps/demo/vite.config.ts`. Vérifier que ça tient aussi dans
      `apps/demo-ssr`.
- [ ] **10 — lint niveau 1** (`no-raw-css-value`, `style-file-boundary`). Les règles
      vivent dans `libs/dev-tools/src/eslint-rules/`, s'enregistrent dans `index.cjs`
      **et** dans `recommended-config.cjs`, préfixe `craft-ts/`.
- [ ] **11 — composant témoin.** `apps/demo/src/app/ui/status.component.ts`, toujours
      avec son bloc `styles:` en template literal.

### Vague 2 — niveau 2 : axes, matrice, exhaustivité (tâches 12 → 22)

- [ ] **12–13 — axes standard et axes définis.** `libs/style/src/lib/axes.ts` existe et
      porte déjà les drivers ; à éclater en `axes/standard.ts` + `axes/define.ts` et à
      générer depuis la spec.
- [ ] **14 — `when()` et contrat de variantes.** Le contrat inféré marche dans
      l'esquisse ; manquent la détection de règle morte et la forme `{ vars }`.
- [ ] **15 — budget d'axes** dans le meta de `craftComponent`
      (`libs/component/src/lib/component.ts`).
- [ ] **16 — somme sur `ifBlock`.** `if-block.ts` et `match-block.ts` existent. Meilleur
      ratio valeur/coût du plan : c'est cette tâche qui décide du budget de CI visuelle.
- [ ] **17–20 — `@craft-ts/style-testing`.** Nouveau package (donc `project.json` à
      créer aussi) : matrice, drivers, exhaustivité post-inférence, cas de contenu.
      L'esquisse a un `scenarios()` qui compte déjà juste (12 pour `badge-root`, 1 pour
      `badge-dot`) — c'est le point de départ de la tâche 17.
- [ ] **21 — lint niveau 2** (`no-raw-class`, `no-free-has`), même point d'ancrage que
      la tâche 10.
- [ ] **22 — composant témoin niveau 2** : `apps/demo/e2e/` et
      `apps/demo/playwright.config.ts` existent. **Consigner le cardinal ici** — c'est
      la première des deux mesures qui décident de la vague 5.

### Vague 3 — niveau 3 : obligations de contexte (tâches 23 → 26)

- [ ] **23 — vocabulaire d'obligations.** `libs/style/src/lib/obligations.ts` de
      l'esquisse est déjà de la bonne forme (décharge et effet CSS inséparables) ;
      manquent `clipOverflow`, `unsafeAssume` et les specs de falsifiabilité.
- [ ] **24 — propagation et scellage.** `seal()` doit passer de fonction libre à
      `craftComponent(..., { seals })`. **Dériver depuis `Template`, jamais depuis
      `CraftComponent`** — la tâche 2 a déjà payé ce TS2589, voir la section « Tâche 2 ».
      Prévoir aussi que le message d'erreur sorte en **clé** et non en valeur : dans
      l'esquisse il arrive en ligne 2 d'une erreur de douze lignes.
- [ ] **25 — axes de conteneur et élagage prouvé.**
- [ ] **26 — composant témoin niveau 3.** L'esquisse couvre déjà le cas
      (`example/back-to-top.style.ts`) ; reste à en faire de vrais composants de la demo
      et un E2E.

### Vague 4 — graphe et règles d'architecture (tâches 27 → 30)

- [ ] **27 — nœuds de style dans le graphe.**
      `libs/dev-tools/src/scripts/dependency-graph.ts` existe.
- [ ] **28 — prédicats d'architecture.** `architecture-graph.ts` existe. Écrire
      **d'abord** la règle de complétude d'extraction : une règle verte sur un graphe
      incomplet donne la même fausse confiance qu'une matrice non étanche.
- [ ] **29 — analyse d'impact et MCP.** `packages/mcp/src/mcp-server.ts` existe et
      reste read-only.
- [ ] **30 — documentation des trois niveaux** dans `apps/docs/guide/style/`.

### Vague 5 — réduction de matrice (tâches 31 → 32, CONDITIONNELLE)

- [ ] Ne pas ouvrir sans les deux mesures : matrice médiane > 24 scénarios, ou temps de
      capture CI > 10 min par PR. La première se relève en tâche 22, la seconde en fin
      de vague 4.

### Préexistants — à ne pas confondre avec une régression

- 5 specs `craft-ts-core` échouent (`state`, `insert-select`, `craft-control-flow`,
  `yieldable-insertion-method`) : présentes sur `main`, fichiers identiques.
- `apps/demo/src/app/examples/component/pending-block-exception-demo.ts` : TS2345,
  présente sur `main`, reproduite avec les fichiers de `main` remis en place.
- Un typecheck de `apps/demo` dans un worktree neuf demande d'abord
  `npx tsc -b libs/component/tsconfig.lib.json` : sans `dist/out-tsc`, les project
  references sortent des TS6305 qui n'ont rien à voir avec le code.
