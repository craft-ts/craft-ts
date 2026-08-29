# Plan — Typechecker les specs, et le vérifier à la release

## Objectif

Faire échouer `npm run release:check` quand une assertion de type d'un fichier
`*.spec.ts` casse. Aujourd'hui elles ne sont vérifiées nulle part : les suites
vitest effacent les types, et les `tsconfig.lib.json` excluent `**/*.spec.ts`.
Une assertion `Expect<Equal<…>>` peut donc devenir rouge sans que rien ne le
dise — c'est arrivé pendant la feature i18n : cinq assertions de
`libs/component` sont passées au rouge et personne ne l'a vu.

La cible `typecheck-spec` est déjà exécutée par `release:preflight`. Le travail
restant n'est pas de câbler la porte, mais de **rendre chaque projet capable de
la franchir**, puis de lui poser la cible.

## L'état mesuré (2026-08-29)

`nx run-many` ignore silencieusement un projet qui n'a pas la cible : la
couverture, c'est donc le nombre de cibles posées — **6 sur 15**.

| projet | erreurs | nature |
| --------------------------------------------- | ------: | ------------------------------------------------------------------ |
| demo, demo-effect, quickstart-effect, i18n, i18n-effect, style | 0 | cible posée, vert |
| cli, deploy, deploy-alchemy, style-testing | 0 | cible manquante, rien d'autre à faire |
| dev-tools | 1 | `TS6304` : émission désactivée dans un projet composite |
| component | 2 | `craftUse(value.exceptions()).loader` rend `unknown` |
| effect | 178 | dont **173 `TS6059`** — `outDir` fait inférer un rootDir |
| core | 134 | dérive réelle des attentes de type, très concentrée |
| docs | 41 | longue traîne sur une vingtaine de fichiers de snippets |

## 1. Les projets déjà verts

Poser `typecheck-spec` sur `cli`, `deploy`, `deploy-alchemy`, `style-testing`,
sur le modèle de `libs/i18n/project.json` :

```json
"typecheck-spec": {
  "executor": "nx:run-commands",
  "options": { "command": "tsc -p libs/<projet>/tsconfig.spec.json --noEmit --pretty false" },
  "inputs": [
    "{workspaceRoot}/tsconfig.base.json",
    "{projectRoot}/tsconfig.spec.json",
    "{projectRoot}/src/**/*.ts"
  ],
  "cache": true
}
```

Corriger l'unique erreur de `dev-tools` — `"composite": false` dans son
`tsconfig.spec.json` — puis lui poser la cible.

**Couverture : 6 → 11 projets. Aucun arbitrage, aucun risque.**

## 2. La correction de configuration de `effect`

`libs/effect/tsconfig.spec.json` déclare un `outDir`, ce qui fait inférer un
`rootDir` au projet ; chaque fichier atteint par les `paths` (donc tout
`@craft-ts/core`) est alors signalé `TS6059`. Remplacer `outDir` par
`"noEmit": true`, exactement comme sur `libs/component`.

**178 → 5 erreurs, une ligne.**

## 3. Les corrections ciblées

- **`core/craft-guard-runtime.spec.ts` (19)** — le faux routeur est casté
  `as unknown as typeof CRAFT_ROUTER`, c'est-à-dire vers le *token*
  `InjectionToken<CraftRouterNavigationApi>`, alors que
  `runCraftRouteChainAsync` attend l'API `CraftRouteRouterLike`. L'objet
  possède déjà `createUrlTree`, `navigate` et `navigateByUrl`. Le vrai
  correctif est d'**exporter `CraftRouteRouterLike`** depuis
  `craft-guard-runtime.ts` : elle est locale, et c'est ce qui a poussé vers le
  mauvais cast.
- **`effect` (5)** — les résiduelles après l'étape 2, à traiter une par une.
- **`component` (2)** — `craftUse(value.exceptions())` rend `unknown` dans
  `composition.spec.ts`. À instruire avant de coder : c'est probablement un
  trou de typage sur la projection de `exceptions()` dans un template, donc un
  correctif dans la lib, pas un cast dans le test.

Poser ensuite la cible sur `component` et `effect`. **Couverture : 13 projets.**

## 4. La dette de `core` (arbitrages d'API)

Les 134 erreurs sont concentrées : deux fichiers en portent 50, avec une cause
unique chacun.

- **`local-storage-persister.spec.ts` (22)** — `craftResource(...)` produit un
  `CraftResourceRef<…>` et `addQueryToPersist` attend un `ResourceRef<any>`
  d'Angular. Décision à prendre : élargir la signature du persister (probable,
  puisque c'est ce que le code produit) ou changer ce que le test lui passe.
- **`query.spec.ts` (28)** — plusieurs dérives distinctes : `select` /
  `selectOrCreate` absents du résultat d'insertion, `.id` lu sur un
  `Promise<User>` (un `yield`/`await` manquant), paramètres implicitement
  `any`, une requête de service passée là où une `string` est attendue.
- **~65 restantes** sur sept fichiers (`craft-routes`, `craft-router`,
  `resource-by-id`, `async-process`, `insert-select`,
  `branded-component`, `react-on-mutation-effect`).

Poser la cible sur `core`. **Couverture : 14 projets.**

## 5. Les snippets de `docs`

41 erreurs, aucune cause unique : une à quatre par fichier, plus le conflit de
types `Plugin` entre les deux copies de Vite dans `.vitepress/config.mts`.
C'est le dernier morceau et il compte, parce que ces snippets sont **publiés** :
une erreur de type là, c'est un exemple faux dans la documentation.

Poser la cible sur `docs`. **Couverture : 15 / 15.**

## 6. Le verrou de release

Rien à câbler de plus : `release:preflight` exécute déjà `typecheck-spec`, donc
chaque cible posée entre automatiquement dans `npm run release:check`.

Une fois à 15/15, déplacer `typecheck-spec` en tête de la liste `--targets`
pour échouer tôt — aujourd'hui une erreur de type serait découverte après
`production:check`.

## Séquencement

| étape | effort | erreurs éliminées | couverture |
| --------------------------------- | ------ | ----------------: | ---------- |
| 1. projets verts + dev-tools      | ~15 min | 1 | 11/15 |
| 2. configuration `effect`         | 1 ligne | 173 | 11/15 |
| 3. corrections ciblées            | ~1 h | 26 | 13/15 |
| 4. dette `core`                   | arbitrages | 134 | 14/15 |
| 5. snippets `docs`                | longue traîne | 41 | 15/15 |

Les étapes 1 et 2 éliminent **174 des 356 erreurs** sans aucune décision à
prendre.
