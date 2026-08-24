# Typed style system Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Ce plan n'est PAS en TDD.** Chaque tâche implémente d'abord, teste ensuite. Ne pas écrire de test avant l'implémentation, ne pas « voir le test échouer » — la séquence est : construire, puis couvrir, puis vérifier que la couverture est réelle.

**Goal:** rendre la surface visuelle d'un composant **dérivable** au lieu d'être devinée. À la fin, pour n'importe quel composant, on connaît l'ensemble exhaustif des états visuels à regarder, on sait lesquels sont impossibles, et les bugs de style aujourd'hui invisibles (conteneur manquant, ancêtre qui clippe, variable qui reçoit une longueur au lieu d'une couleur) deviennent des erreurs de compilation. Le tout à coût runtime nul.

**Architecture:** un nouveau package `@craft-ng/style` porte **tout le vocabulaire** (tokens, DSL, axes, variables typées, obligations) et un plugin de build qui évalue les fichiers de style en Node pour émettre du CSS statique. `@craft-ng/core` ne gagne que **deux canaux opaques** qu'il transporte sans jamais les interpréter : `accumulate` (union en remontant l'arbre) et `obligations` (`Exclude` des décharges, `Extract` des violations). `@craft-ng/style-testing` consomme le contrat inféré pour produire une matrice de scénarios et ses drivers Playwright. `@craft-ng/dev-tools` étend le graphe existant avec les nœuds de style, alimentés par l'émission du plugin — pas par une seconde analyse AST.

**Tech Stack:** TypeScript 5.9, Angular 21, Vite 6 (plugin d'émission), Vitest 4, Playwright, ESLint 9 flat config, ts-morph (déjà dans dev-tools).

## Global Constraints

- **Les types vérifient, les valeurs émettent.** La génération de CSS ne dépend jamais du typechecker. Le plugin importe le module de style en Node et lit la valeur retournée. Toute tentative de dériver le CSS de l'API tsc est hors périmètre, définitivement.
- **Statique → classes au build ; dynamique → variables CSS typées.** Aucune classe n'est générée au runtime. Toute valeur dépendant d'un signal passe par `assign(var, …)`, jamais par une chaîne de classes calculée.
- **Aucun ensemble fermé n'est une string.** Les features CSS standard (`scroll-state`, `prefers-color-scheme`, `:has(:user-invalid)`, noms de propriétés) sont **livrées par la lib** sous forme d'accès par propriété. Une faute de frappe doit être `Property 'x' does not exist`, jamais du CSS silencieusement ignoré.
- **Aucune valeur n'est une string non plus.** Aucune signature publique du DSL n'accepte `string` — ni pour une longueur, ni pour une couleur, ni pour un mot-clé, ni pour un global. `p('blabla')` doit être une erreur de compilation, pas une règle CSS invalide ignorée par le navigateur. Cette propriété est vérifiée par un **test de conformance sur tous les helpers exportés** (tâche 7), pas par des cas écrits à la main — c'est la seule forme qui survit à une régénération de la table.
- **Le core ne connaît aucun nom CSS.** Ses deux canaux manipulent des charges opaques via `|`, `Exclude`, `Extract`. Toute la sémantique (messages d'erreur inclus) vit dans `@craft-ng/style`.
- **Le mauvais correctif doit être inexprimable, pas seulement difficile.** `overflow` n'existe pas dans le vocabulaire : le seul chemin vers `overflow: auto` est `provides(scrollPort.block)`, qui pose l'effet CSS **et** la décharge dans le même objet.
- **Aucune échappatoire silencieuse.** `unsafeAssume*`, `unsafeLength`, CSS brut : chacune propage `unproven` / `unknownCss` vers le haut et devient comptable dans le graphe. Une échappatoire qui ne remonte pas est un bug de conception.
- **Produit cartésien complet en v1.** Aucune réduction « intelligente » de matrice (critère d'interaction par propriété) tant que la vague 5 n'a pas été déclenchée par une mesure. Une couverture qui se déclare complète sans l'être est pire que pas de couverture.
- **La conjonction se fait par imbrication uniquement.** `when(a, [when(b, […])])`. Pas de forme multi-arguments équivalente : une seule façon d'écrire chaque chose.
- **`:has()` en forme libre est interdit.** Table fermée `descendant.*` livrée par la lib. Les combinateurs `+`, `~`, `:nth-child` restent autorisés : ils ne traversent pas de frontière de composant.
- **Implémentation d'abord, tests ensuite.** Vitest, specs colocalisées, specs de types via `libs/test-type`. Aucune fixture d'app hors `mkdtemp`.
- **Falsifiabilité des assertions négatives.** Ce plan repose massivement sur des tests du genre « ceci ne doit pas compiler ». Écrits après l'implémentation, ils peuvent passer sans rien vérifier. Donc, pour chaque groupe d'assertions négatives : **relâcher temporairement le type concerné et confirmer que le test échoue**, puis remettre. C'est ce qui remplace le « voir le test échouer » de TDD, et c'est la seule étape de ce plan qui n'est pas négociable pour ces cas-là.
- **Trois niveaux de garantie, adoption différenciée.** Niveau 1 (tokens + vars typées) : utile dès le premier composant. Niveau 2 (axes + matrice) : par composant. Niveau 3 (obligations) : **par route entière** — un seul maillon non couvert et la garantie n'existe pas ; l'outillage doit le dire, pas le masquer.
- Docs en anglais. Ce plan en français.

## File map

| File | Responsibility |
|---|---|
| Modify `libs/core/src/lib/render/vnode.ts` | Deux canaux opaques `accumulate` / `obligations` + leur fusion générique |
| Create `libs/core/src/lib/render/channels.ts` | `CraftChannels`, `MergeChannels`, `DischargedBy`, `ViolatedBy` — zéro sémantique |
| Modify `libs/component/src/lib/css-vars.type.ts` | Migration de `CssVars` sur le mécanisme générique (validation de l'abstraction) |
| Create `libs/style/src/lib/tokens/` | `palette`, `space`, `radii`, `text`, unités (`rem`, `px`, `ms`) |
| Create `libs/style/src/lib/kinds.ts` | `CssVarKind` calqué sur la grammaire `syntax` (`<color>`, `<length>`, `<length-percentage>`, `+`, `#`) + treillis d'assignabilité |
| Create `libs/style/src/lib/css-vars.ts` | `cssVars()` : jetons brandés, rôles, émission `@property`, `inherits: false` par défaut |
| Create `libs/style/src/lib/props/` | Table des propriétés CSS typées (`p`, `bg`, `gridCols`, `prop.opacity`, `lineStyle.solid`…) — générée, pas écrite à la main |
| Create `libs/style/src/lib/styles.ts` | `craftStyles()`, `when()`, `assign()`, contrat de variantes inféré |
| Create `libs/style/src/lib/axes/standard.ts` | `colorScheme`, `motion`, `forcedColors`, `scrollState`, `descendant` — tables fermées |
| Create `libs/style/src/lib/axes/define.ts` | `defineBreakpoints`, `defineAxis`, `defineStateAxis`, `defineContainer` |
| Create `libs/style/src/lib/obligations.ts` | `scrollPort`, `noClipping`, `containerType`, `requires()`, `provides()`, `declares()`, `clipOverflow` |
| Create `libs/style/src/lib/errors.ts` | `ContextError<Message>` + rendu des messages situés |
| Create `libs/style/src/plugin/vite.ts` | Évaluation en Node, dédup atomique, `@layer`, émission du dump graphe |
| Create `libs/style/src/eslint/` | `no-raw-class`, `no-raw-css-value`, `no-free-has`, `style-file-boundary` |
| Create `libs/style-testing/src/lib/matrix.ts` | `visualMatrix()`, cellules, identifiants stables |
| Create `libs/style-testing/src/lib/drivers.ts` | `applyScenario()` : resize, colorScheme, scroll, état DOM |
| Create `libs/style-testing/src/lib/exhaustive.ts` | `assertExhaustiveVisualMatrix()` post-inférence + `contentCases()` |
| Modify `libs/dev-tools/src/scripts/dependency-graph.ts` | Fusion du dump style, nouveaux `kind` de nœuds et d'arêtes |
| Modify `libs/dev-tools/src/scripts/architecture-graph.ts` | Prédicats `matrixSize`, `undischargedObligations`, `varsWrittenBy`, `impactedScenarios`, `unproven` |
| Create `libs/dev-tools/tests/architecture/style-architecture.spec.ts` | Règles d'architecture de style |
| Modify `apps/demo/src/app/ui/*` | Migration de 3 composants témoins |
| Create `apps/docs/guide/style/*.md` | Documentation des trois niveaux de garantie |

Hors périmètre : réduction de matrice par analyse d'interaction (vague 5, conditionnelle), SSR/critical CSS, thèmes utilisateur runtime, migration de l'ensemble de la demo.

## Shared types (lock these names)

```ts
// libs/core/src/lib/render/channels.ts — aucune sémantique CSS
export interface CraftChannels {
  readonly accumulate: unknown;
  readonly obligations: unknown;
  readonly discharges: unknown;
  readonly violates: unknown;
}

export type EmptyChannels = {
  readonly accumulate: never;
  readonly obligations: never;
  readonly discharges: never;
  readonly violates: never;
};

export type MergeChannels<L extends CraftChannels, R extends CraftChannels> = {
  readonly accumulate: L['accumulate'] | R['accumulate'];
  readonly obligations: Exclude<
    L['obligations'] | R['obligations'],
    L['discharges'] | R['discharges']
  >;
  readonly discharges: L['discharges'] | R['discharges'];
  readonly violates: L['violates'] | R['violates'];
};

/** Non vide ⇒ un nœud du chemin viole une obligation encore ouverte sous lui. */
export type PathViolations<C extends CraftChannels> = Extract<
  C['obligations'],
  C['violates']
>;
```

```ts
// libs/style/src/lib/kinds.ts
export interface CssVarKind<Syntax extends string, Value> {
  readonly syntax: Syntax;
  readonly __value?: Value;
}

export type CssVarRole = 'surface' | 'text' | 'border' | 'accent' | 'none';

export interface CssVarToken<
  Name extends `--${string}`,
  Kind extends CssVarKind<string, unknown>,
  Role extends CssVarRole,
> {
  readonly name: Name;
  readonly kind: Kind;
  readonly role: Role;
}
```

```ts
// libs/style/src/lib/styles.ts
export interface VariantContract {
  /** axe → points de coupure réellement utilisés (jamais tous les points de l'axe). */
  readonly axes: Readonly<Record<string, string>>;
  /** conditions d'ifNode qui gouvernent le sous-arbre. */
  readonly guards: Readonly<Record<string, boolean>>;
  readonly unknownCss: boolean;
  readonly unproven: string;
}
```

```ts
// libs/style-testing/src/lib/matrix.ts
export interface VisualScenario {
  /** 'md|dark|selected|footer:true' — stable, sert de nom de baseline. */
  readonly id: string;
  readonly axes: Readonly<Record<string, string>>;
  readonly guards: Readonly<Record<string, boolean>>;
  readonly content: string;
  readonly drivers: readonly ScenarioDriver[];
}
```

---

# Vague 0 — le mécanisme de canaux, validé sur l'existant

> Vague de dérisquage. Elle ne livre aucune fonctionnalité : elle prouve que le core peut porter des canaux génériques **sans coût**. Si la mesure de la tâche 3 est mauvaise, la tâche 3b déplace le coût — c'est un point de décision, pas un échec.

### Task 1: Canaux opaques dans le core

**Files:**
- Create: `libs/core/src/lib/render/channels.ts`
- Create: `libs/core/src/lib/render/channels.spec.ts`

**Interfaces:**
- Produces: `CraftChannels`, `EmptyChannels`, `MergeChannels`, `PathViolations`.

**Notes:** aucune importation depuis `@craft-ng/style`, aucun nom CSS. Le core ne sait pas ce qu'il transporte.

- [ ] **Step 1: Implémenter** — les quatre types, aucune fonction. Vérifier à la main sur un cas simple que `MergeChannels<Empty, Empty>` s'affiche bien comme `EmptyChannels` dans un hover.
- [ ] **Step 2: Écrire les tests** — specs de types (`libs/test-type`) : fusion de deux canaux vides reste vide ; `obligations` d'un enfant survit à un parent qui ne décharge pas ; une décharge côté parent retire l'obligation ; `PathViolations` est `never` sans violation et exactement l'obligation en conflit sinon ; `MergeChannels<Empty, Empty>` n'ajoute aucune instanciation.
- [ ] **Step 3: Vérifier la falsifiabilité** — remplacer `Exclude` par une union simple dans `MergeChannels` : le test de décharge doit passer au rouge. Remettre.
- [ ] **Step 4: Lancer** — `npx vitest run libs/core/src/lib/render/channels.spec.ts`
- [ ] **Step 5: Commit** — `feat(core): carry opaque contract channels through the vnode`

### Task 2: Branchement sur le vnode

**Files:**
- Modify: `libs/core/src/lib/render/vnode.ts`
- Modify: `libs/component/src/lib/hyperscript.ts` (props `provides`)
- Create: `libs/component/src/lib/channels.spec.ts`

**Interfaces:**
- Consumes: `MergeChannels`, `PathViolations`.
- Produces: `ElementNode` et `ComponentNode` portent un paramètre `Channels extends CraftChannels = EmptyChannels`.

**Notes:** le défaut `EmptyChannels` doit rendre le paramètre **invisible** dans les types affichés des composants existants.

- [ ] **Step 1: Implémenter** — paramètre de canal sur les nœuds, propagation dans `h()`, `ifNode` (les deux branches), `forNode`, `craftTemplate` et à la frontière de composant.
- [ ] **Step 2: Vérifier la non-régression** — `npx nx build demo`, puis comparer la signature imprimée par `tsc` d'un composant existant avant/après : elle ne doit pas avoir changé.
- [ ] **Step 3: Écrire les tests** — un canal posé sur un enfant remonte à travers chacun des cinq points ci-dessus ; un composant sans style expose `EmptyChannels`.
- [ ] **Step 4: Lancer** — `npx vitest run libs/component/src/lib/channels.spec.ts && npx nx test component`
- [ ] **Step 5: Commit**

### Task 3: Migration de `CssVars` et mesure — POINT DE DÉCISION

**Files:**
- Modify: `libs/component/src/lib/css-vars.type.ts`
- Modify: `libs/component/src/lib/css-vars.spec.ts`
- Create: `tools/measure-typecheck.mjs`

**Interfaces:**
- Produces: `CssVarContract` porté par le canal `accumulate` au lieu d'un paramètre dédié ; `tools/measure-typecheck.mjs` sort `{ ms, instantiations }` via `tsc --extendedDiagnostics`.

**Notes:** validation de l'abstraction sur du code déjà en production. Les specs existantes de `css-vars` doivent passer **sans modification** — si elles doivent changer, l'abstraction n'est pas la bonne. C'est le seul critère qui compte ici, et il ne demande aucun test nouveau.

- [ ] **Step 1: Mesurer la baseline** — `node tools/measure-typecheck.mjs` sur `apps/demo` **avant** toute modification. Consigner les chiffres dans ce fichier.
- [ ] **Step 2: Implémenter** — migration du contrat sur le canal.
- [ ] **Step 3: Lancer les tests existants tels quels** — `npx vitest run libs/component/src/lib/css-vars.spec.ts`. Aucune modification de spec autorisée.
- [ ] **Step 4: Ajouter un test de non-régression** — la forme des contrats publics exposés par les composants de la demo est inchangée.
- [ ] **Step 5: Mesurer après** — **critère : +15 % de `ms` ou d'`instantiations` sur la passe applicative ⇒ déclencher la tâche 3b**, et noter la décision ici avant de continuer. Le coût se déplace, la garantie ne se réduit pas.
- [ ] **Step 6: Commit** — `refactor(component): move the css-vars contract onto the generic channel`

### Task 3b (conditionnelle): Déport du coût en passe dédiée

> Déclenchée uniquement par la mesure de la tâche 3. Repli **préféré** à l'affaiblissement du mécanisme : il déplace le coût au lieu de réduire la vérification.

**Files:**
- Create: `libs/style/src/types-light/` (stubs générés)
- Create: `tsconfig.style.json` (racine) — programme strict
- Create: `tools/generate-light-types.mjs`
- Modify: `apps/demo/tsconfig.app.json` (`paths` vers les stubs)
- Modify: `libs/dev-tools/src/scripts/check/gates/` — nouveau gate `style-contract`
- Create: `libs/style/src/types-light/coverage.spec.ts`

**Interfaces:**
- Produces: deux résolutions du même code source via `paths`. Passe applicative → canaux résolus en `unknown`, coût nul. Passe `tsconfig.style.json` → canaux réels, contrats complets.

**Notes:** le découpage suit les **niveaux de garantie**, pas une frontière technique arbitraire :

| niveau | passe | pourquoi |
|---|---|---|
| 1 — valeurs typées (`p('blabla')`) | **applicative** | surcharge simple, coût négligeable, et c'est le retour immédiat qui rend le DSL utilisable |
| 2 — variantes et matrice | dédiée | vit déjà dans `*.visual.spec.ts`, hors du programme applicatif |
| 3 — obligations | dédiée | c'est la propagation par canal, donc exactement le coût mesuré |

Deux règles non négociables, sinon le déport devient un trou :

1. **Les types light sont générés, jamais écrits à la main.** Un stub maintenu manuellement dérive et finit par accepter ce que la passe stricte refuse — deux réalités de types qui divergent en silence. Le générateur remplace les slots de canaux par `unknown` et ne touche à rien d'autre.
2. **La passe stricte doit couvrir tout ce que couvre la passe applicative.** Déporter dans un programme qui n'inclut pas les fichiers concernés, c'est supprimer la vérification en croyant la déplacer.

Le gate `style-contract` dans `craft check` est **obligatoire**, pas optionnel : sans lui l'agent ne rencontre jamais l'erreur d'obligation. Coût DX assumé et à documenter : dans l'éditeur, un fichier du programme applicatif n'affiche pas les erreurs de niveau 3.

- [ ] **Step 1: Implémenter** — générateur de stubs, `tsconfig.style.json`, `paths`, gate `style-contract`.
- [ ] **Step 2: Re-mesurer** — la passe applicative doit revenir à la baseline de la tâche 3, step 1.
- [ ] **Step 3: Écrire les tests** — `coverage.spec.ts` : l'ensemble des fichiers du programme strict ⊇ celui du programme applicatif. Plus : un cas d'obligation non déchargée passe en light et **échoue** en strict, avec le même message qu'avant le déport.
- [ ] **Step 4: Vérifier la falsifiabilité** — retirer un fichier de l'`include` du programme strict : `coverage.spec.ts` doit rougir. Remettre.
- [ ] **Step 5: Commit** — `perf(style): move contract checking to a dedicated typecheck pass`

---

# Vague 1 — niveau 1 : tokens et variables typées

> Livre de la valeur en adoption partielle. À la fin de cette vague, un composant migré n'a plus aucun CSS runtime et ses variables sont typées, sans qu'aucun axe ni aucune obligation n'existe encore.

### Task 4: Kinds et treillis d'assignabilité

**Files:**
- Create: `libs/style/src/lib/kinds.ts`
- Create: `libs/style/src/lib/kinds.spec.ts`
- Create: `libs/style/project.json`, `package.json`, `tsconfig*.json`

**Interfaces:**
- Produces: `color`, `length`, `lenPct`, `num`, `angle`, `time`, `many()`, `csv()`, `oneOf()`, `Assignable<From, To>`.

**Notes:** ne pas inventer de kind que CSS ne sait pas enregistrer via `@property` — sinon la garantie runtime saute. `<length>` → `<length-percentage>` et `<integer>` → `<number>` sont assignables ; l'inverse non.

- [ ] **Step 1: Implémenter** — le package, les kinds, le treillis.
- [ ] **Step 2: Écrire les tests** — specs de types sur le treillis, cas d'échec attendus inclus ; `syntax` produit est exactement la chaîne attendue pour chaque kind.
- [ ] **Step 3: Vérifier la falsifiabilité** — rendre `Assignable` symétrique : les cas d'échec doivent rougir. Remettre.
- [ ] **Step 4: Lancer** — `npx vitest run libs/style/src/lib/kinds.spec.ts`
- [ ] **Step 5: Commit** — `feat(style): type CSS custom properties after the @property grammar`

### Task 5: Tokens de design

**Files:**
- Create: `libs/style/src/lib/tokens/palette.ts`, `space.ts`, `radii.ts`, `text.ts`, `units.ts`
- Create: `libs/style/src/lib/tokens/tokens.spec.ts`

**Interfaces:**
- Produces: `definePalette()` (paires light/dark), `space(n)`, `radii.*`, `text.*`, `rem()`, `px()`, `ms()`, `unsafeLength()`.

**Notes:** un token de palette porte ses deux valeurs et son rôle. `palette.surface.dark` est une valeur, pas une string. Les échelles sont finies : `space(4.5)` ne compile pas.

**Piège de brand à ne pas rater :** `LengthValue` et consorts doivent être des **objets nominaux** (`{ readonly [LENGTH]: true; value: … }` avec `LENGTH` un `unique symbol`), pas `string & { __length?: true }`. Avec un phantom **optionnel** sur une base `string`, `'blabla'` reste assignable et toute la garantie tombe en silence. Un phantom requis sur base `string` marche aussi, mais interdit alors la concaténation accidentelle — préférer l'objet.

**Valeurs arbitraires :** il n'y a **pas** d'équivalent au `[17px]` de Tailwind. Si une valeur manque à l'échelle, on l'ajoute à l'échelle. L'unique sortie est `unsafeLength('13px', reason)`, qui propage `unproven` et devient comptable dans le graphe (vague 4). Sans cette porte, un agent bloqué contournera le design system entièrement ; avec elle non marquée, il le contournera en silence.

- [ ] **Step 1: Implémenter** — les échelles, les brands nominaux, `unsafeLength`.
- [ ] **Step 2: Écrire les tests** — échelle fermée, rôles préservés, `space(-1)` rejeté, `'12px'` rejeté partout où une longueur est attendue, **et un test de brand explicite : `'blabla'`, `''`, `` `${number}px` `` et `String(x)` sont tous rejetés là où `LengthValue` est attendu** (spec de types). `unsafeLength` compile et pose `unproven`.
- [ ] **Step 3: Vérifier la falsifiabilité** — remplacer le brand nominal par `string & { __length?: true }` : **tous** les cas de rejet doivent passer au vert, ce qui prouve que le test mesure bien le brand. Remettre. Cette étape est la plus importante de la tâche.
- [ ] **Step 4: Lancer** — `npx vitest run libs/style/src/lib/tokens`
- [ ] **Step 5: Commit**

### Task 6: `cssVars()` et émission `@property`

**Files:**
- Create: `libs/style/src/lib/css-vars.ts`
- Create: `libs/style/src/lib/css-vars.spec.ts`

**Interfaces:**
- Produces: `cssVars(prefix, declaration)` → jetons `CssVarToken`, plus le bloc `@property` correspondant.

**Notes:** `inherits: false` par défaut (borne l'invalidation quand on réécrit au runtime). Le nom `--{prefix}-{key}` est dérivé, jamais retapé. `v.bg.or(fallback)` type le fallback contre le même kind.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — le `@property` émis contient `syntax`, `inherits`, `initial-value` ; le jeton porte kind + rôle ; `v.bg.or(space(4))` ne compile pas ; deux `cssVars` de même préfixe dans le même build lèvent une erreur.
- [ ] **Step 3: Vérifier la falsifiabilité** — élargir le paramètre de `.or()` à `unknown` : le cas de rejet doit rougir. Remettre.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit**

### Task 7: Table des propriétés CSS, générée

**Files:**
- Create: `tools/generate-css-props.mjs`
- Create: `libs/style/src/lib/props/generated.ts` (généré, commité)
- Create: `libs/style/src/lib/props/index.ts`
- Create: `libs/style/src/lib/props/props.spec.ts`

**Interfaces:**
- Produces: `p`, `px`, `py`, `bg`, `color`, `border`, `radius`, `gap`, `display.*`, `position.*`, `lineStyle.*`, `prop.*`, `global.*`, `ident()`, `cssString()`, `url()`.

**Notes:** **générée depuis les données MDN/webref**, pas écrite à la main — c'est ce qui garantit qu'aucun mot-clé n'est inventé. `overflow` est **explicitement exclu** de la génération : il n'existe que via `provides(scrollPort.*)` et `clipOverflow.*` (vague 3). La liste d'exclusions est un fichier de données, testé.

**Aucune signature générée ne contient `string`.** Trois sources de fuite à fermer explicitement dans le générateur :
1. Les **mots-clés globaux** (`inherit`, `initial`, `unset`, `revert`, `revert-layer`) sont des jetons (`global.inherit`), jamais des littéraux acceptés par le helper.
2. Les types CSS que le générateur ne sait pas modéliser (`<custom-ident>`, `<string>`, `<url>`) produisent un helper qui prend un **jeton dédié**, pas un `string` nu.
3. Un helper dont le générateur ne sait pas fermer la grammaire n'est **pas exporté** — il part dans la liste des non-couverts, testée, plutôt que d'être exporté avec un `string` par défaut.

- [ ] **Step 1: Implémenter le générateur** — plus la liste d'exclusions et la liste des non-couverts.
- [ ] **Step 2: Générer et relire** — inspecter `generated.ts` à la main : chercher toute occurrence de `: string` dans les signatures exportées. Il ne doit y en avoir aucune.
- [ ] **Step 3: Écrire les tests** — **conformance générique** : une spec itère sur **tous** les helpers exportés et vérifie qu'une string brute est rejetée pour chacun (c'est la seule forme qui reste vraie après régénération). Plus : `p('blabla')`, `bg('red')`, `gap('2')`, `radius('md')` explicitement ; les mots-clés sont des unions fermées ; les globaux ne passent que par `global.*` ; `overflow` et ses longhands absents de l'export ; la liste des non-couverts ne contient aucune propriété courante ; le générateur est idempotent.
- [ ] **Step 4: Vérifier la falsifiabilité** — ajouter à la main un helper bidon acceptant `string` dans `generated.ts` : la conformance doit le détecter. Retirer.
- [ ] **Step 5: Lancer** — `npx vitest run libs/style/src/lib/props`
- [ ] **Step 6: Commit**

### Task 8: `craftStyles()` sans axes

**Files:**
- Create: `libs/style/src/lib/styles.ts`
- Create: `libs/style/src/lib/styles.spec.ts`

**Interfaces:**
- Produces: `craftStyles(prefix, sheet)` → objet de classes brandées `CraftClass<VariantContract>`.

**Notes:** à ce stade `VariantContract` est toujours vide — volontaire, la vague 2 le remplit. Le contrat `cssVars` de chaque classe est déjà réel.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — une feuille sans condition produit un contrat vide ; les classes sont préfixées ; une classe est utilisable dans `class:` et une string y est refusée.
- [ ] **Step 3: Lancer**
- [ ] **Step 4: Commit**

### Task 9: Plugin d'émission

**Files:**
- Create: `libs/style/src/plugin/vite.ts`
- Create: `libs/style/src/plugin/emit.ts`
- Create: `libs/style/src/plugin/emit.spec.ts`

**Interfaces:**
- Consumes: modules `*.style.ts` évalués en Node.
- Produces: CSS atomique dédupliqué, ordre de couches `@layer reset, tokens, components, variants, overrides`, map `{ classKey → className }`, dump JSON pour le graphe (vague 4).

**Notes:** la dédup atomique fait croître la sortie en O(vocabulaire) et non en O(composants). Validation à l'émission : toute at-rule, tout descripteur et tout mot-clé produit doit exister dans la table de features connue, sinon **le build échoue** — c'est le filet qui rattrape ce qui aurait glissé par une échappatoire.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — deux composants déclarant `p(4)` produisent une seule règle ; l'ordre des couches est stable ; un mot-clé inconnu injecté fait échouer l'émission avec le nom du fichier ; la sortie est déterministe entre deux runs.
- [ ] **Step 3: Vérifier la falsifiabilité** — désactiver la validation de features : le test du mot-clé inconnu doit rougir. Remettre.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit**

### Task 10: Étanchéité niveau 1 (lint)

**Files:**
- Create: `libs/style/src/eslint/no-raw-css-value.ts`, `style-file-boundary.ts` + specs
- Modify: `libs/dev-tools/src/eslint-rules/index.cjs` (réexport)

**Notes:** `style-file-boundary` interdit à un `*.style.ts` d'importer du code applicatif — c'est ce qui rend l'évaluation au build possible. `no-raw-css-value` **étend** `craft-ng/no-hardcoded-design-values` aux arguments des utilitaires de style plutôt que de la dupliquer.

- [ ] **Step 1: Implémenter** les deux règles.
- [ ] **Step 2: Écrire les tests** — cas valides/invalides pour chacune, import transitif interdit inclus, message pointant vers l'alternative exacte.
- [ ] **Step 3: Lancer**
- [ ] **Step 4: Commit**

### Task 11: Composant témoin — la preuve du niveau 1

**Files:**
- Modify: `apps/demo/src/app/ui/status.component.ts`
- Create: `apps/demo/src/app/ui/status.style.ts`
- Create: `apps/demo/src/app/ui/status.component.spec.ts`

**Notes:** `status.component.ts` est le pire cas du repo — bloc `styles` en template literal, dix variables CSS non typées, `class: function*()` qui concatène `badge-${couleur}`. Le migrer prouve les deux transformations : variables typées, et chaîne calculée → jeu de classes statiques.

- [ ] **Step 1: Implémenter la migration**
- [ ] **Step 2: Vérifier à l'œil** — `npx nx build demo`, ouvrir la démo, comparer visuellement les sept statuts avec la version d'avant.
- [ ] **Step 3: Écrire les tests** — mêmes classes rendues qu'avant pour chaque statut ; aucune string de classe construite au runtime ; le CSS émis ne contient plus de `var()` non déclaré.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit** — `refactor(demo): migrate StatusComponent to the typed style system`

---

# Vague 2 — niveau 2 : axes, matrice, exhaustivité

### Task 12: Axes standard livrés

**Files:**
- Create: `libs/style/src/lib/axes/standard.ts` + spec

**Interfaces:**
- Produces: `colorScheme`, `motion`, `forcedColors`, `scrollState.{stuck,snapped,scrollable}.*`, `descendant.{userInvalid,focusVisible,checked}`.

**Notes:** **accès par propriété exclusivement**. `scrollState.stuck.blockEnd`, jamais `scrollState.stuck('block-end')`. Table générée depuis la spec. `descendant.*` est l'unique porte d'entrée vers `:has()` ; chaque entrée porte son driver de test.

- [ ] **Step 1: Implémenter** — génération de la table depuis la spec.
- [ ] **Step 2: Écrire les tests** — chaque axe expose exactement les valeurs de la spec ; une clé inexistante est une erreur de compilation ; les valeurs de `stuck` sont mutuellement exclusives dans le modèle ; chaque axe déclare un driver.
- [ ] **Step 3: Lancer**
- [ ] **Step 4: Commit**

### Task 13: Axes définis par l'utilisateur

**Files:**
- Create: `libs/style/src/lib/axes/define.ts` + spec

**Interfaces:**
- Produces: `defineBreakpoints({ sm: minInlineSize(rem(40)) })`, `defineAxis(name, values, { writes })`, `defineStateAxis(prefix, states)`, `defineContainer({ type })`.

**Notes:** `defineBreakpoints` prend des **conditions construites**, jamais des strings. `'base'` est implicite. `writes: onlyVarsOfKind(color)` contraint l'axe à la construction — c'est ce qui rendra l'orthogonalité de `colorScheme` vraie par typage plutôt que par analyse.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — breakpoints ordonnés et indexés ; `when(scheme.dark, [p(6)])` ne compile pas avec `writes: onlyVarsOfKind(color)` ; un axe d'état génère `data-{prefix}-{state}` et type `state:` côté rendu.
- [ ] **Step 3: Vérifier la falsifiabilité** — retirer la contrainte `writes` : le cas de rejet doit rougir. Remettre.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit**

### Task 14: `when()` et contrat de variantes

**Files:**
- Modify: `libs/style/src/lib/styles.ts`
- Create: `libs/style/src/lib/when.spec.ts`

**Interfaces:**
- Produces: `when(condition, declarations | { vars })`, contrat `VariantContract` inféré, `assign()`.

**Notes:** seuls les **points de coupure réellement utilisés** entrent dans le contrat. Conjonction par imbrication uniquement. La forme `{ vars }` est la seule autorisée pour un axe contraint par `writes`. Intersection d'intervalles vide sur un même axe ⇒ erreur de compilation (règle morte).

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — classe sans `when` ⇒ contrat vide ; deux `when(bp.md)` dans deux classes n'ajoutent qu'un point ; l'imbrication produit une conjonction ; `when(above(bp.lg), [when(below(bp.sm), […])])` est une erreur de règle morte.
- [ ] **Step 3: Vérifier la falsifiabilité** — désactiver la détection de règle morte : le test correspondant doit rougir. Remettre.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit** — `feat(style): infer the variant contract from nested conditions`

### Task 15: Budget d'axes par composant

**Files:**
- Modify: `libs/component/src/lib/component.ts`
- Create: `libs/component/src/lib/axes-budget.spec.ts`

**Interfaces:**
- Produces: `axes: [bp, colorScheme]` dans le meta ; utiliser un axe non déclaré est une erreur.

**Notes:** sans ce garde-fou, un composant peut faire exploser la matrice de tous ses parents sans que personne ne le décide.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — axe non déclaré rejeté ; axe déclaré mais inutilisé signalé (warning) ; le budget remonte dans le contrat du parent.
- [ ] **Step 3: Lancer**
- [ ] **Step 4: Commit**

### Task 16: Tag de branche sur `ifNode` — somme, pas produit

**Files:**
- Modify: `libs/component/src/lib/if-node.ts`, `match-node.ts`
- Create: `libs/component/src/lib/branch-variants.spec.ts`

**Interfaces:**
- Produces: contrat de la branche vraie tagué `{ [Name]: true }`, fausse `{ [Name]: false }` ; le contrat du nœud `if` est leur **somme**.

**Notes:** `ifNode` porte déjà le nom de sa condition dans son type (`Condition<Name>`) — le mécanisme s'accroche là, sans changer la signature publique. Meilleur ratio valeur/coût du plan : elle divise le nombre de captures.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — une variante déclarée uniquement dans la branche vraie n'apparaît jamais croisée avec `false` ; deux `ifNode` imbriqués produisent une somme de sommes ; `matchNode` se comporte comme un `if` n-aire.
- [ ] **Step 3: Vérifier la falsifiabilité** — remplacer la somme par un produit : le compte attendu doit diverger et le test rougir. Remettre.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit** — `feat(component): tag branch variants so if-nodes sum instead of multiply`

### Task 17: Matrice et identifiants stables

**Files:**
- Create: `libs/style-testing/src/lib/matrix.ts` + spec
- Create: `libs/style-testing/project.json`, `package.json`, `tsconfig*.json`

**Interfaces:**
- Produces: `visualMatrix(Component): readonly VisualScenario[]`.

**Notes:** calcul **au runtime** à partir des métadonnées portées par les valeurs de style. Le type ne vérifie que le cardinal et les identifiants (tâche 19). Réduction par intervalles sur les axes ordonnés ; **aucune** réduction inter-axes. Les identifiants doivent survivre à l'ajout d'un axe non lié, sinon toutes les baselines sont invalidées à chaque changement.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — deux enfants coupant à `md` et `lg` produisent 3 cellules viewport, pas 4 ; un composant sans axe produit 1 scénario ; identifiants triés et stables ; ajouter un axe n'invalide pas les identifiants existants.
- [ ] **Step 3: Lancer**
- [ ] **Step 4: Commit**

### Task 18: Drivers de scénario

**Files:**
- Create: `libs/style-testing/src/lib/drivers.ts` + spec

**Interfaces:**
- Produces: `applyScenario(page, scenario)`.

**Notes:** un axe sans driver est une erreur de configuration, pas un axe ignoré — sinon la matrice énumère des scénarios inatteignables et rend des captures identiques qui donnent une fausse couverture. Drivers : `resize`, `emulateMedia`, `scrollToEnd`, `fillInvalid`, `focus`, `setState`.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — chaque axe standard a un driver ; un axe custom sans driver fait échouer `visualMatrix` ; `applyScenario` applique les drivers dans un ordre déterministe.
- [ ] **Step 3: Lancer**
- [ ] **Step 4: Commit**

### Task 19: Assertion d'exhaustivité post-inférence

**Files:**
- Create: `libs/style-testing/src/lib/exhaustive.ts` + spec

**Interfaces:**
- Produces: `assertExhaustiveVisualMatrix(Component, baselines)`, `baselinesIn(dir)`.

**Notes:** **post-inférence obligatoirement** — une contrainte auto-référentielle sur la déclaration du composant résout l'union en `never`, exactement comme pour `assertExhaustiveRouteExceptions`. Le type ne compare que le cardinal et les identifiants.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — ajouter un `when(bp.lg, …)` sans baseline casse la compilation ; une baseline orpheline casse aussi ; un composant sans axe passe avec une seule baseline.
- [ ] **Step 3: Vérifier la falsifiabilité** — c'est le test le plus exposé au faux positif silencieux. Ajouter réellement un `when(bp.lg, …)` dans une fixture sans toucher aux baselines et confirmer l'échec de compilation avant de retirer.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit**

### Task 20: Cas de contenu

**Files:**
- Modify: `libs/style-testing/src/lib/exhaustive.ts`
- Create: `libs/style-testing/src/lib/content-cases.spec.ts`

**Interfaces:**
- Produces: `contentCases(Component, cases)` et son croisement avec la matrice.

**Notes:** la matrice couvre les *conditions*, pas les *données* — or le titre de 80 caractères, la liste vide et le prix à 7 chiffres cassent le plus souvent. Aucun type ne peut les dériver : ils se déclarent. Règle de croisement : un cas de contenu se teste sur **un seul point** de chaque axe, **sauf** sur les axes qui changent l'espace disponible (viewport, container) où le croisement est complet.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — le croisement respecte la règle ; un composant avec des `Input` obligatoires et sans `contentCases` est une erreur ; les identifiants incluent le nom du cas.
- [ ] **Step 3: Lancer**
- [ ] **Step 4: Commit**

### Task 21: Étanchéité niveau 2

**Files:**
- Create: `libs/style/src/eslint/no-raw-class.ts`, `no-free-has.ts` + specs

**Notes:** `no-raw-class` interdit `class:` avec une string ou une fonction retournant une string — sans elle, la matrice est une fiction. `no-free-has` sert de filet sur le CSS brut et renvoie vers `descendant.*`.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — cas valides/invalides, message pointant vers l'alternative exacte.
- [ ] **Step 3: Lancer**
- [ ] **Step 4: Commit**

### Task 22: Composant témoin niveau 2

**Files:**
- Create: `apps/demo/src/app/ui/card.style.ts`, `card.component.ts`, `card.visual.spec.ts`
- Create: `apps/demo/e2e/card-visual.spec.ts`

**Notes:** le composant doit exercer viewport, `colorScheme`, un axe d'état, `descendant.userInvalid` et un `ifNode` — donc produire une matrice où la somme sur la branche est visible dans le compte.

- [ ] **Step 1: Implémenter le composant**
- [ ] **Step 2: Relever le cardinal** — calculer à la main le nombre de scénarios attendu, le comparer à `visualMatrix()`, et **consigner le chiffre ici** : c'est la première des deux mesures qui décideront de la vague 5.
- [ ] **Step 3: Écrire les tests** — cardinal attendu ; la branche `footer: false` ne croise aucune variante de `s.footer` ; captures Playwright générées pour chaque scénario.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit**

---

# Vague 3 — niveau 3 : obligations de contexte

### Task 23: Vocabulaire d'obligations

**Files:**
- Create: `libs/style/src/lib/obligations.ts` + spec

**Interfaces:**
- Produces: `scrollPort.{block,inline}`, `noClipping.{block,inline}`, `containerType.{inlineSize,size,scrollState}`, `requires()`, `provides()`, `declares()`, `clipOverflow.{block,inline}`, `unsafeAssume()`.

**Notes:** **`provides(scrollPort.block)` émet l'effet CSS et la décharge dans le même objet** — c'est le cœur du dispositif. `overflow` n'existant pas dans la table de propriétés (tâche 7), c'est l'unique chemin. `requires()` s'attache à la **classe** qui en dépend, pas à la feuille entière.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — `provides` produit `overflow-block:auto` **et** `min-block-size:0` ; un `Discharge` n'est pas constructible littéralement ; `clipOverflow` porte un `violates` ; `unsafeAssume` décharge en posant `unproven`.
- [ ] **Step 3: Vérifier la falsifiabilité** — exporter un constructeur littéral de `Discharge` : le test correspondant doit rougir. Retirer.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit** — `feat(style): make the discharge and its CSS effect inseparable`

### Task 24: Propagation, violations de chemin, scellage

**Files:**
- Modify: `libs/component/src/lib/component.ts` (`seals`)
- Create: `libs/style/src/lib/errors.ts`, `seal.spec.ts`

**Interfaces:**
- Produces: `seals: [scrollPort, noClipping]`, `ContextError<Message>`, messages situés incluant le nom du composant demandeur.

**Notes:** le message d'erreur **est l'API** ici. Il doit dire *où* déclarer (« sur le composant de layout »), pourquoi pas ailleurs (« un overflow sur le parent direct créerait un second scroll port »), et nommer le demandeur. Verbeux pour un humain, exploitable par un agent.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Relire les messages produits** — copier trois erreurs réelles depuis la sortie `tsc` et vérifier qu'elles contiennent le nom du demandeur, l'instruction, et la contre-indication. Si l'une des trois ne suffit pas à corriger sans autre contexte, la réécrire avant de tester.
- [ ] **Step 3: Écrire les tests** — obligation non déchargée au scellage ⇒ erreur avec nom + instruction ; `clipOverflow` sur un nœud traversé par un `noClipping` ouvert ⇒ erreur ; décharger puis clipper au-dessus est légal.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit**

### Task 25: Axes de conteneur et élagage prouvé

**Files:**
- Modify: `libs/style-testing/src/lib/matrix.ts`
- Create: `libs/style-testing/src/lib/container-axis.spec.ts`

**Interfaces:**
- Produces: fermeture de l'axe container au composant qui le déclare ; élagage des branches inatteignables.

**Notes:** l'axe container ne propage pas au-dessus du `container-type` qui le résout. Une décharge `scrollPort.none` rend la branche `stuck` **inatteignable** : elle sort de la matrice. C'est la promesse « prouver que certaines branches n'ont pas besoin d'être testées », tenue par le parent.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — l'axe container n'apparaît pas dans le contrat du grand-parent ; `scrollPort.none` retire les scénarios `stuck` ; les valeurs de `stuck` restent mutuellement exclusives.
- [ ] **Step 3: Vérifier la falsifiabilité** — désactiver l'élagage : le compte de scénarios doit augmenter et le test rougir. Remettre.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit**

### Task 26: Composant témoin niveau 3

**Files:**
- Create: `apps/demo/src/app/ui/back-to-top.{style,component}.ts`
- Create: `apps/demo/src/app/layout/app-shell.{style,component}.ts` + specs

**Notes:** reproduit exactement le cas d'origine — sticky + `container-type: scroll-state` local, obligation `scrollPort` déchargée par le shell.

- [ ] **Step 1: Implémenter** les deux composants.
- [ ] **Step 2: Vérifier à la main** — ouvrir la démo, scroller jusqu'en bas, confirmer que le bouton apparaît. Puis retirer `provides(scrollPort.block)` du shell et confirmer que **la compilation échoue** avant tout lancement.
- [ ] **Step 3: Écrire les tests** — sans shell la compilation échoue avec le message attendu ; avec shell elle passe ; `clipOverflow` inséré dans le shell fait échouer la compilation ; E2E : le bouton apparaît après scroll.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit**

---

# Vague 4 — le graphe et les règles d'architecture

### Task 27: Nœuds de style dans le graphe

**Files:**
- Modify: `libs/style/src/plugin/emit.ts` (dump JSON)
- Modify: `libs/dev-tools/src/scripts/dependency-graph.ts`
- Create: `libs/dev-tools/src/scripts/style-graph.spec.ts`

**Interfaces:**
- Produces: nœuds `style-class`, `css-var`, `token`, `axis`, `obligation`, `branch` ; arêtes `styled-by`, `varies-on`, `declares-var`, `reads-var`, `uses-token`, `requires`, `discharges`, `gates` ; attributs `matrixSize`, `axes`, `unproven`, `unknownCss` sur les nœuds `component`.

**Notes:** **un seul graphe**, pas deux — les requêtes qui ont de la valeur sont transverses (token → classe → composant → route). Deux producteurs écrivent dedans : `craft graph` (AST + tsc) et le plugin de style (évaluation) ; jointure sur l'identité de composant. Ne pas réimplémenter une évaluation approximative du DSL dans l'extracteur AST.

- [ ] **Step 1: Implémenter** le dump et la fusion.
- [ ] **Step 2: Inspecter le graphe produit** — regénérer `craft-dependency-graph.json` sur la demo migrée et lire les nouveaux nœuds à l'œil avant d'écrire quoi que ce soit.
- [ ] **Step 3: Écrire les tests** — les nœuds et arêtes attendus existent ; la fusion est idempotente ; un composant présent dans un seul des deux producteurs est signalé, pas avalé.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit**

### Task 28: Prédicats d'architecture

**Files:**
- Modify: `libs/dev-tools/src/scripts/architecture-graph.ts`
- Create: `libs/dev-tools/tests/architecture/style-architecture.spec.ts`

**Interfaces:**
- Produces: `matrixSize(node)`, `undischargedObligations()`, `dischargers()`, `varsWrittenBy(axis)`, `tokens({unused})`, `styleClasses({neverRendered})`, `baselines({withoutScenario})`, `unproven()`, `definers(kind)`, `impactedScenarios({changed})`.

**Notes:** la **première** règle à écrire est celle qui vérifie la complétude de l'extraction (tout composant a un `styled-by`, ou figure dans une liste explicite de non-couverts). Une règle verte sur un graphe incomplet donne la même fausse confiance qu'une matrice non étanche.

- [ ] **Step 1: Implémenter** les dix prédicats.
- [ ] **Step 2: Écrire les tests** — complétude d'extraction en premier ; budget de matrice par route ; seuls les composants de layout déchargent ; `colorScheme` n'écrit que des `<color>` ; dette non croissante ; tokens et baselines orphelins.
- [ ] **Step 3: Vérifier la falsifiabilité** — retirer un `styled-by` du graphe de fixture : la règle de complétude doit rougir. Remettre.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit**

### Task 29: Analyse d'impact et exposition MCP

**Files:**
- Modify: `libs/dev-tools/src/scripts/architecture-graph.ts`
- Modify: `packages/mcp/src/mcp-server.ts` (outils read-only) + specs

**Interfaces:**
- Produces: `craft graph --impacted <paths>` et les outils MCP `style_impact`, `style_matrix`, `style_debt`.

**Notes:** c'est le gain qui paie la CI : changer `palette.accent` ne doit recapturer que les scénarios atteignables depuis ce token. Reste read-only côté `@craft-ng/mcp`, conformément à la frontière existante.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — un changement de token remonte exactement les scénarios attendus ; un changement de composant feuille remonte ses routes ; un changement hors périmètre style remonte l'ensemble (conservateur par défaut).
- [ ] **Step 3: Lancer**
- [ ] **Step 4: Commit**

### Task 30: Documentation des trois niveaux

**Files:**
- Create: `apps/docs/guide/style/index.md`, `tokens.md`, `variants.md`, `obligations.md`, `testing.md`
- Modify: `apps/docs/.vitepress/config.mts`
- Create: `apps/docs/tests/style-docs.spec.ts`

**Notes:** documenter explicitement que le niveau 3 ne s'adopte pas composant par composant. Une garantie partielle mal comprise est pire qu'une garantie absente.

- [ ] **Step 1: Écrire la doc**
- [ ] **Step 2: Écrire les tests** — les exemples de doc compilent ; les liens de nav existent ; les trois niveaux sont nommés avec leur granularité d'adoption.
- [ ] **Step 3: Lancer**
- [ ] **Step 4: Commit**

---

# Vague 5 — réduction de matrice (CONDITIONNELLE)

> **Ne pas commencer sans les deux mesures.** Déclencheurs, relevés à la fin de la vague 4 sur la demo migrée : matrice médiane par composant **> 24 scénarios**, ou temps de capture CI **> 10 min** par PR. Si les deux sont sous le seuil, cette vague ne s'ouvre pas — le problème n'existe pas.

### Task 31: Orthogonalité par construction

**Files:**
- Modify: `libs/style/src/lib/axes/define.ts`, `libs/style-testing/src/lib/matrix.ts`

**Notes:** la seule réduction inter-axes autorisée, parce qu'elle est vraie **par typage de l'axe** et non par analyse : un axe déclaré `writes: onlyVarsOfKind(color)` ne peut pas modifier le layout, donc il se croise additivement avec les axes d'espace. Zéro faux négatif possible. À faire avant toute autre réduction, et éventuellement à la place de toutes les autres.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — un axe couleur-seulement réduit le compte ; un axe non contraint ne réduit rien ; ajouter une écriture non-couleur à l'axe fait échouer la compilation avant même la réduction.
- [ ] **Step 3: Lancer**
- [ ] **Step 4: Commit**

### Task 32 (dernier recours): Analyse d'interaction par propriété

**Notes:** à n'ouvrir que si la tâche 31 n'a pas suffi. Conditions non négociables : normalisation shorthand → longhand **et** résolution des `var()` avant intersection ; liste de propriétés à effet global incluant `font-*`, `letter-spacing`, `border-width`, `writing-mode` ; **opt-in par composant** avec raison enregistrée dans le graphe, jamais par défaut ; `couple(a, b)` pour forcer un croisement. Le critère retenu n'est pas « noms de propriétés disjoints » mais : **au plus un des deux axes touche au layout, et aucun ne change la taille intrinsèque du contenu**.

- [ ] **Step 1: Implémenter**
- [ ] **Step 2: Écrire les tests** — dont, obligatoirement, le contre-exemple connu : `md` écrit `grid-template-columns`, `dark` écrit `font-weight` ⇒ le croisement **doit** être conservé.
- [ ] **Step 3: Vérifier la falsifiabilité** — relâcher le critère à « noms disjoints » : le contre-exemple doit rougir. Remettre.
- [ ] **Step 4: Lancer**
- [ ] **Step 5: Commit**

---

## Verification

```sh
npx vitest run libs/core/src/lib/render
npx vitest run libs/style libs/style-testing
npx nx test component && npx nx test dev-tools
npx nx build demo && npx nx lint demo
npx vitest run libs/dev-tools/tests/architecture
npx playwright test apps/demo/e2e/card-visual.spec.ts
npx tsc -p tsconfig.style.json --noEmit   # si la tâche 3b a été déclenchée
node tools/measure-typecheck.mjs --baseline
```

Vérification humaine, à la fin de la vague 3 : ouvrir la demo, scroller jusqu'en bas, vérifier que le bouton back-to-top apparaît. Puis retirer `provides(scrollPort.block)` du shell et vérifier que **la compilation échoue** avant même de lancer l'app — c'est le seul test qui prouve que le dispositif attrape la classe de bug qui l'a motivé.

Vérification agent, à la fin de la vague 4 : demander à un agent neuf « ajoute une bannière collante en bas de la page produit ». Attendu : il rencontre l'erreur d'obligation, lit le message, et déclare le provider **dans le shell** — pas un `overflow` au hasard.

## Risques

- **Le coût de typecheck des canaux génériques.** Traité en tâche 3 par une mesure chiffrée, avec un repli qui **déplace** le coût (tâche 3b, passe dédiée + gate) plutôt que de réduire la garantie. Le risque résiduel n'est donc plus la performance mais la **divergence entre les deux passes** — d'où les stubs générés et le test de couverture. C'est le seul risque qui peut invalider l'architecture, donc il est en vague 0.
- **Les tests écrits après l'implémentation peuvent ne rien vérifier.** C'est le risque propre au mode de travail choisi, et il est aigu ici parce que la moitié des assertions sont négatives (« ceci ne doit pas compiler ») : un tel test passe aussi bien quand la garantie existe que quand le test est mal écrit. D'où les steps « Vérifier la falsifiabilité » : ils ne sont pas optionnels, ce sont eux qui portent la valeur des tests de ce plan.
- **L'explosion d'unions dans la matrice.** Ne jamais matérialiser le produit cartésien dans un type : contrat factorisé (axes + contraintes), dépliage uniquement dans `assertExhaustiveVisualMatrix`. Le TS2589 rencontré sur les brands never-default est le précédent à ne pas rejouer.
- **La table de propriétés générée vieillit.** Un mot-clé CSS ajouté à la spec manque silencieusement. Mitigation : le générateur est rejouable en CI et un test échoue si la sortie régénérée diffère du fichier commité.
- **Un brand mal posé annule tout, sans bruit.** `string & { __length?: true }` accepte `'blabla'` : le phantom optionnel sur une base primitive ne brande rien. C'est la panne la plus coûteuse du plan parce qu'elle laisse tous les tests verts et toutes les garanties écrites. D'où le test de brand explicite en tâche 5 et le test de conformance générique en tâche 7 — les deux doivent exister, l'un vérifie le type de base, l'autre vérifie que chaque helper l'utilise vraiment.
- **L'étanchéité partielle donne 0 % de garantie, pas 90 %.** D'où les règles lint livrées **dans la même vague** que le mécanisme qu'elles scellent, jamais après.
- **Le CSS externe reste hors du modèle.** Une feuille globale, un thème tiers ou un `stylesUrl` peuvent contredire n'importe quelle preuve. Le chemin `ParsedContract` doit rester `unknownCss: true` et le graphe doit compter ces composants comme non couverts.
- **Le coût de la CI visuelle est le vrai budget.** Les milliers de captures sont le poste dominant, pas le typecheck ni le runtime. C'est pourquoi la tâche 16 (somme sur `ifNode`) et la tâche 29 (analyse d'impact) valent économiquement plus que toute la vague 5.
