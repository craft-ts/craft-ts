# Plan : hooks de style explicites et vérifiés (craft-ng)

## Objectif

Transposer à craft-ng la philosophie du document source :

> **Un hook CSS doit être explicite, et tout hook déclaré doit être réellement
> consommé par le template du composant.**

Deux règles complémentaires :

1. `prefer-explicit-style-hooks` — un sélecteur part d'un hook explicite
   (classe, attribut, `data-craft-name`, `:scope`), pas de la forme du DOM.
2. `no-unused-style-hooks` — tout hook déclaré dans les styles d'un composant
   doit pouvoir correspondre à un nœud de son template hyperscript.

## Ce que le contexte craft change par rapport au document source

Le document raisonne sur des templates HTML Angular et propose Stylelint pour
la règle 1, ESLint + parser Angular pour la règle 2. Dans craft, quatre faits
changent la donne :

1. **Le template est du TypeScript.** `craftComponent(name, meta, factory,
   template)` reçoit un arbre hyperscript en 4ᵉ argument
   (`libs/component/src/lib/hyperscript.ts`). Aucun parser de template n'est
   nécessaire : la règle 2 devient une analyse d'AST TS, comme
   `template-element-name-unique.cjs` le fait déjà.
2. **Le CSS vit à deux endroits, tous deux atteignables depuis le fichier TS.**
   `meta.styles` (littéral de gabarit dans le TS) et `meta.stylesUrl`
   (`import styles from './x.css' with { loader: 'text' }`). Le lien
   composant → feuille est donc statique et local, contrairement à
   `styleUrl` d'Angular vu depuis Stylelint.
3. **L'encapsulation est native, par `@scope`.**
   `scopeCss` (`libs/component/src/lib/render/style-scope.ts`) émet
   `@scope ([data-craft-root~="Nom"]) to ([data-craft-root] *)`. `:scope` est
   la racine du composant (l'équivalent de `:host`), et le `data-craft-root`
   n'est posé que sur les éléments racines du template
   (`interpreter.ts:1315`, `interpreter.ts:3966`). La surface exacte d'une
   feuille est donc connue : le template propre du composant, sous-arbres des
   composants craft imbriqués exclus.
4. **Les styles d'une directive composée sont scopés au composant hôte.**
   `acquireStyles` scope *tous* les `styleOwners` avec le scope du composant
   (`interpreter.ts:388-393`). La feuille à analyser pour un composant est donc
   `meta.styles` + `meta.stylesUrl` + les styles des directives composées.

Conséquence directe : **les deux règles sont des règles ESLint du plugin
`craft-ng`**, pas de Stylelint.

### Alternative écartée : un plugin Stylelint

Rejetée pour trois raisons : la moitié du CSS est dans des littéraux TS que
Stylelint ne voit pas ; depuis un `.css`, on ne peut pas remonter au composant
qui l'importe (donc la règle 2 est impossible) ; et cela ajouterait une
toolchain entière au dépôt, qui n'a aujourd'hui aucune dépendance Stylelint.

## Décisions

- Deux règles `.cjs` dans `libs/dev-tools/src/eslint-rules/`, plus un module
  utilitaire partagé, selon la convention existante (un `.cjs` + un
  `.spec.ts` par règle, enregistrement dans `index.cjs`).
- Analyse CSS avec `postcss` + `postcss-selector-parser` (présents en
  transitif, à déclarer explicitement — voir « Dépendances »).
- La lecture d'un `.css` référencé par `stylesUrl` se fait sur disque, avec un
  cache invalidé par `mtime`. Le rapport ESLint est ancré sur la propriété
  `stylesUrl` et cite `chemin.css:ligne:colonne` dans le message, ESLint ne
  pouvant pas rapporter dans un autre fichier que celui linté.
- **Surface de template = le fichier**, pas le seul argument 4. Un composant
  craft s'écrit avec des `craftTemplate(...)`, des fragments extraits en
  constantes et des helpers locaux ; restreindre la collecte à l'argument 4
  produirait des faux positifs. Une option `scope: 'file' | 'component'`
  (défaut `'file'`) laisse la porte ouverte.
- **Trois états**, comme dans le document source : *certainement utilisé* →
  valide ; *certainement inutilisé* → erreur ; *possiblement dynamique* →
  silence.
- La règle 2 ne vérifie **que les hooks** (classes, `[data-*]`, `[aria-*]`,
  `#id`, `[data-craft-name]`). Les sélecteurs de type sont l'affaire de la
  règle 1 ; les vérifier deux fois produirait des messages redondants.
- Les pseudo-classes structurelles (`:nth-of-type`, `:first-child`) ne sont
  jamais « prouvées » : on vérifie seulement le hook porteur. `each()` rend le
  nombre d'éléments indécidable, exactement comme `@for` côté Angular.
- `contentStyles` est **hors périmètre** des deux règles : ces styles ciblent
  un fragment projeté par l'appelant, pas le template du composant
  (`types.ts` : `ContentStyles`, `acquireContentStyle`). Les signaler
  reviendrait à produire du bruit systématique.

## Règle 1 — `prefer-explicit-style-hooks`

### Principe

Chaque compound selector doit contenir un hook explicite. Sont des hooks :
une classe, un attribut, un id, `:scope`, `&` (héritant du parent en CSS
imbriqué), `:root`.

Sont signalés : les sélecteurs de type nus (`p {}`), et tout compound composé
uniquement d'un type, même raffiné par un hook en amont (`.content p`,
`:scope > header`, `.card div span`). Le raffinement structurel *d'un hook*
reste valide : `.paragraph:hover`, `.paragraph + .paragraph`,
`.paragraph:nth-of-type(2)`, `.card-title::before`, `:scope`, `:scope::before`.

### Ajouts spécifiques craft

- **`[data-craft-name="…"]` est un hook de première classe.** Le renderer pose
  cet attribut à partir du nom local d'un élément nommé — `button('save', {},
  …)` produit `data-craft-name="save"` (`interpreter.ts:1538-1545`). C'est le
  hook explicite *déjà présent* dans les templates craft, et le message de la
  règle doit le proposer quand l'élément visé porte un nom local.
- **`[data-craft-root]` et `[data-craft-content]` sont interdits** dans un
  sélecteur applicatif : ils sont réservés au renderer (le runtime rejette déjà
  leur écriture côté template, `interpreter.ts:1264`) et la doc `styles.md`
  demande de ne jamais les poser soi-même. Message dédié.
- **`:host` est signalé avec autofix vers `:scope`.** C'est l'angularisme le
  plus probable dans une migration. L'autofix n'est appliqué que lorsque le CSS
  est un littéral inline (`meta.styles`) ; pour un `.css`, une *suggestion*
  textuelle uniquement.

### Exemptions

- Option `exempt: string[]` (défaut `[]`) : liste de sélecteurs conteneurs
  (`['.rich-text']`) sous lesquels les sélecteurs de type sont autorisés —
  contenu riche dont le HTML n'est pas contrôlé.
- Les at-rules non scopables (`@keyframes`, `@font-face`, `@property`,
  `@counter-style`, …) sont ignorées : leurs « sélecteurs » n'en sont pas. La
  liste `UNSCOPABLE_BLOCKS` de `style-scope.ts` est la référence à réutiliser.
- Aucune exemption pour les resets globaux : la règle ne lit que le CSS de
  composant. `apps/demo/src/styles.css` n'est jamais analysé.

### Messages

```text
Avoid styling "p" through its DOM context.
Use an explicit styling hook such as ".paragraph", or the element's craft name
via [data-craft-name="…"].
```

```text
"[data-craft-root]" is reserved for the Craft renderer. Style the component
root with ":scope".
```

```text
":host" is an Angular selector. Craft component roots are matched with
":scope".
```

## Règle 2 — `no-unused-style-hooks`

### Principe

Un hook déclaré dans les styles d'un composant doit correspondre à un nœud
produit par son template.

### Collecte des hooks du template

Parcours de l'AST du fichier, en collectant sur chaque appel d'helper
hyperscript (`div`, `span`, `button`, … ainsi que `h(...)` et
`customElement(...)`) :

| Source | Hook produit |
| --- | --- |
| `class: 'a b'` | classes `a`, `b` |
| `` class: `a b-${x}` `` | classe `a`, **préfixe dynamique** `b-` |
| `class: ['a', cond && 'b']` | classes `a`, `b` |
| `class: { 'todo-item': true, completed: c }` | classes `todo-item`, `completed` |
| `class: c ? 'a' : 'b'` | classes `a`, `b` |
| `class: () => …` / callback yieldable | descente dans le corps, mêmes règles |
| `class: someIdentifier` non résoluble | marque *source de classes inconnue* |
| `id: 'x'` | `#x` |
| `'data-state': 'active'` | `[data-state]`, `[data-state="active"]` |
| `attrs: { 'data-x': 'y' }` | idem |
| helper nommé `button('save', …)` | `[data-craft-name="save"]` |
| `meta.host: { class: 'demo-host' }` | classe `demo-host` sur la racine |

Les corps de `ifBlock`, `each`, `matchBlock`, `catchBlock`,
`fieldExceptionBlock`, `defer` et les `craftTemplate(...)` du fichier sont
parcourus comme le reste : un hook n'y est pas moins utilisé.

Comme `template-element-name-unique.cjs`, le parcours **s'arrête** en entrant
dans un `craftComponent(...)` imbriqué : c'est aussi la frontière de `@scope`.

### Les trois états

- **Certainement utilisé** — le hook figure dans la table ci-dessus.
- **Possiblement dynamique** — le hook commence par un préfixe dynamique
  collecté (`badge-` couvre `.badge-red`, `.badge-green`, …), ou le fichier
  contient une source de classes inconnue. Dans le second cas, la règle se tait
  sur *tous* les sélecteurs de classe du composant, mais continue de vérifier
  les hooks d'attribut et de nom craft.
- **Certainement inutilisé** — sinon, erreur.

Cas réel du dépôt à ne pas casser :
`apps/demo/src/app/ui/status.component.ts` déclare `.badge-gray` … `.badge-blue`
et écrit `` class: `badge badge-${color}` ``. Le préfixe dynamique `badge-`
doit rendre ces cinq sélecteurs silencieux. Une raffinement ultérieur possible
— résoudre les littéraux constants du module (`STATUS_VIEW`) pour prouver les
cinq valeurs — n'est pas requis pour la première version.

### Frontières à respecter

- Un composant enfant appelé dans le template n'est pas une source de hooks :
  ses classes internes sont hors scope `@scope`.
- Une directive appliquée par `.pipe(Directive)` peut ajouter des classes
  (`(baseTemplate) => (context) => baseTemplate(context, { class: 'highlight' })`,
  cf. `styles.md`). Si la directive est définie dans le fichier, ses classes
  sont collectées ; si elle est importée, la règle marque *source de classes
  inconnue*.
- Un composant multi-racine et l'accumulation de tokens
  (`scopeTokens`, `interpreter.ts:2832`) ne changent rien à la règle 2, qui ne
  raisonne que sur les hooks.

### Relations structurelles

Version 1 : `.card .title` est considéré utilisé dès lors que `.card` et
`.title` existent chacun dans le fichier. La vérification d'ascendance
(descendant / enfant direct) demandée par le document source est une extension
possible — l'arbre hyperscript la rend faisable, mais `ifBlock`/`each` et les
fragments extraits en constantes la rendent bruyante. À traiter dans une phase
ultérieure derrière une option `checkCombinators: boolean` (défaut `false`).

### Message

```text
Unused style hook ".description": no node in this component's template can
match it.
```

## Modules et fichiers

```text
libs/dev-tools/src/eslint-rules/
  craft-style-source.cjs        # meta.styles + meta.stylesUrl → { css, origin }
  craft-style-selectors.cjs     # postcss → sélecteurs aplatis (nesting résolu)
  craft-template-hooks.cjs      # AST hyperscript → hooks + préfixes dynamiques
  prefer-explicit-style-hooks.cjs
  prefer-explicit-style-hooks.spec.ts
  no-unused-style-hooks.cjs
  no-unused-style-hooks.spec.ts
  index.cjs                     # enregistrement des deux règles
```

Fichiers touchés hors règles :

- `apps/demo/craft-eslint-rules.mjs` — activation en `warn` d'abord.
- `apps/docs/guide/routing/eslint-rules.md` — liste des règles.
- `apps/docs/guide/components/styles.md` — section « hooks explicites »
  renvoyant aux deux règles.
- `libs/dev-tools/package.json` — dépendances (ci-dessous).

## Dépendances

`postcss` et `postcss-selector-parser` sont aujourd'hui présents en transitif
(via `cssnano`). Le plugin étant publié sous `@craft-ng/dev-tools`, ils doivent
devenir des `dependencies` explicites de `libs/dev-tools/package.json` (les
règles sont chargées en CJS chez le consommateur), et des `devDependencies` du
dépôt racine. Aucune autre dépendance nouvelle.

## Étapes

1. **`craft-style-source.cjs`** — extraire le CSS d'un `craftComponent` /
   `craftDirective` : littéral de gabarit sans expression, tableau de
   littéraux, ou identifiant importé d'un `.css` via `with { loader: 'text' }`
   (résolution relative à `context.filename`, lecture disque, cache `mtime`).
   Retourne aussi l'`origin` pour situer les positions dans les messages.
2. **`craft-style-selectors.cjs`** — postcss : aplatir le nesting (`&`),
   ignorer les at-rules non scopables, retourner pour chaque règle la liste de
   ses sélecteurs décomposés en compounds, avec position source.
3. **Règle 1** + spec. Elle ne dépend que des étapes 1 et 2 ; elle est donc
   livrable et activable seule.
4. **`craft-template-hooks.cjs`** — collecte des hooks et des préfixes
   dynamiques, en réutilisant la liste d'helpers et le `walk` avec arrêt sur
   `craftComponent` imbriqué de `template-element-name-unique.cjs` (extraire
   ce walk dans le module partagé plutôt que le dupliquer).
5. **Règle 2** + spec.
6. **Enregistrement** dans `index.cjs`, activation `warn` dans
   `apps/demo/craft-eslint-rules.mjs`, mesure du bruit réel sur la démo.
7. **Correction des violations de la démo**, puis passage en `error` si le
   volume le permet ; sinon désactivations ciblées et documentées, comme les
   blocs d'exception existants du config démo.
8. **Documentation** : entrée dans `eslint-rules.md`, section dans
   `styles.md`.

## Vérification

```bash
npx nx test dev-tools
```

Si nx est indisponible (cf. mémoire du dépôt sur les cassures nx) :

```bash
npx vitest run --config libs/dev-tools/vitest.config.mts
```

Mesure du bruit sur du code réel — les composants de `apps/demo` couvrent les
deux formes de CSS, `host.class`, `class` objet (`playground.ts:299`), classe
dynamique par gabarit (`status.component.ts:33`) et `:scope` :

```bash
npx nx lint demo
```

Le build du package doit rester correct : les globs d'assets de
`libs/dev-tools/project.json` couvrent déjà `**/*.cjs`, aucun ajout n'est
nécessaire, mais il faut le confirmer :

```bash
npx nx build dev-tools
```

## Limites connues

- **Fraîcheur du CSS externe.** Modifier un `.css` ne redéclenche pas le lint
  du `.ts` dans un éditeur : ESLint ne connaît pas cette dépendance. Le lint
  CLI/CI est correct ; l'éditeur peut afficher un résultat périmé jusqu'à la
  prochaine frappe dans le TS.
- **Position des rapports pour un `.css`.** Le message cite `fichier.css:l:c`
  mais l'ancre reste la propriété `stylesUrl`.
- **`contentStyles` non vérifié** — ces styles ciblent le fragment de
  l'appelant.
- **Pas de vérification d'ascendance** en version 1 (`checkCombinators`
  désactivée).
- **Classes venant d'une directive importée** : la règle 2 se met en mode
  silencieux sur les classes plutôt que produire des faux positifs.
