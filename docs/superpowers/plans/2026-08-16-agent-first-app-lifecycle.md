# Agent-first app lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un agent (ou un non-développeur qui pilote un agent) part de zéro et obtient une app Craft NG qui compile, passe le lint, respecte son contrat de graphe, **tourne réellement dans le navigateur**, et se répare seule quand elle casse — par trois commandes : `craft new`, `craft check`, `craft doctor`.

**Architecture:** trois portes et **un seul format de diagnostic**. `craft new` pose une app canonique déjà armée (règles `craft-ng/*`, baseline `architecture/`, kit agent). `craft check` orchestre des *gates* (typecheck, lint, unit, architecture, smoke), chacun étant un adapter qui normalise sa sortie en `CraftDiagnostic[]`, et rend un rapport JSON stable + un exit code. `craft doctor` indexe une table de remèdes par code de diagnostic et applique ce qui est sûr. Les trois sont exposés en MCP par un serveur **local** livré dans `@craft-ng/dev-tools` ; `@craft-ng/mcp` reste read-only/offline (docs + skills). Le gate smoke réutilise le broker WS et l'outil `page` existants — pas de second navigateur, pas de nouveau port.

**Tech Stack:** TypeScript 5.9, Node ≥ 20.19, ts-morph (déjà dépendance de dev-tools), Vitest 4, ESLint 9 flat config, MCP SDK + Zod (déjà dans `packages/*-mcp`), `ws` (broker existant).

## Global Constraints

- **Pas de nouveau package npm.** `new` / `check` / `doctor` / `mcp` sont des sous-commandes du bin `craft` existant (`@craft-ng/dev-tools`). Seule exception admise, en toute fin de vague 1 : `create-craft-ng`, coquille de 20 lignes qui délègue à `craft new` pour rendre `npm create craft-ng` possible.
- **`@craft-ng/mcp` ne bouge pas de rôle** : docs + skills, read-only, offline. Tout ce qui écrit sur le disque ou exécute une commande vit dans le serveur MCP local de `@craft-ng/dev-tools`. Même frontière que `page` aujourd'hui.
- **Un seul type `CraftDiagnostic`.** Aucun agent ne doit jamais parser de la sortie `tsc`, `eslint` ou `vitest`. Un gate qui ne sait pas normaliser une erreur émet un diagnostic `code: 'UNPARSED_OUTPUT'` avec le texte brut — il ne l'avale pas.
- **Le scaffold ne génère jamais de code qui viole une règle `craft-ng/*`.** Prouvé par un test : `craft new` puis `craft check` doit sortir vert, dans un tmpdir, sans intervention.
- **Mode agent = non interactif.** `--yes` et `--json` n'ouvrent jamais de prompt. `--json` n'écrit **que** du JSON sur stdout (logs sur stderr).
- **Preset `angular-cli` d'abord**, `nx` ensuite. `src/` et `architecture/` sont identiques entre presets : seuls `package.json`, les tsconfig, les configs de test et le fichier de projet diffèrent. C'est ce qui rend la bascule Vite (`sortie-angular-v1`) achetable plus tard sans réécrire les templates.
- **Pas de Playwright requis** pour le gate smoke. S'il n'y a pas de client `page` connecté, le gate est `skipped` avec une raison actionnable, pas `failed` — sauf `--require-smoke`.
- **Le contrat architecture ne change pas** : baseline au bootstrap, on *exécute* pendant une feature, on ajoute un `it()` seulement pour figer un smell constaté.
- TDD, Vitest, tests colocalisés. Toutes les fixtures d'app en `mkdtemp`, jamais dans le repo, jamais de `npm install` réseau dans un test unitaire (installer via lien local / `--skip-install`).
- Docs en anglais. Ce plan et ses commentaires de code en français uniquement s'ils suivent la convention du fichier touché.

## File map

| File | Responsibility |
|---|---|
| Create `libs/dev-tools/src/scripts/diagnostics/craft-diagnostic.ts` | Types `CraftDiagnostic` / `CraftGateResult` / `CraftCheckReport` + helpers de normalisation |
| Create `libs/dev-tools/src/scripts/check/gates/typecheck-gate.ts` | `tsc --noEmit --pretty false` → diagnostics (codes `TSxxxx`) |
| Create `libs/dev-tools/src/scripts/check/gates/lint-gate.ts` | `eslint -f json` → diagnostics (code = `ruleId`, `fixable` → remède) |
| Create `libs/dev-tools/src/scripts/check/gates/vitest-gate.ts` | Unit + architecture via `--reporter=json` |
| Create `libs/dev-tools/src/scripts/check/gates/smoke-gate.ts` | Charge chaque route via `page`, console propre, contrôles nommés présents |
| Create `libs/dev-tools/src/scripts/check/run-check.ts` | Orchestrateur, ordre des gates, exit codes, `--json` |
| Create `libs/dev-tools/src/scripts/new/scaffold-app.ts` | Écriture du preset, kit agent, baseline architecture |
| Create `libs/dev-tools/src/scripts/new/templates/**` | App canonique (partagée) + fragments par preset |
| Create `libs/dev-tools/src/scripts/doctor/remedies.ts` | Table `code → CraftRemedy` (le multiplicateur) |
| Create `libs/dev-tools/src/scripts/doctor/run-doctor.ts` | Application des remèdes sûrs, boucle re-check |
| Create `libs/dev-tools/src/mcp/dev-mcp-server.ts` | Outils `craft_check`, `craft_doctor`, `craft_new` |
| Modify `libs/dev-tools/src/bin/craft.ts` | Sous-commandes `new`, `check`, `doctor`, `mcp` |
| Modify `libs/dev-tools/package.json` | `bin`, `files`, export `./diagnostics` |
| Modify `libs/dev-tools/src/scripts/routes/route-command.ts` | `route add` génère aussi le spec du composant |
| Create `packages/mcp/skills/craft-ng-build-app/SKILL.md` | Skill chapeau + definition of done |
| Modify `packages/mcp/content/agents.md`, `content/best-practices.md` | Les trois commandes deviennent le workflow imposé |
| Create `apps/docs/guide/ai/build-an-app.md` | Page publique du cycle de vie ; entrée « install » qui manque aujourd'hui |
| Modify `apps/docs/resources/ai-agents.md`, `apps/docs/learn/index.md`, `.vitepress/config.mts` | Lien vers le nouveau point d'entrée |

Hors périmètre : compilateur prod, preset Vite, SSR, hébergement/déploiement, génération de features par LLM (le plan livre les rails, pas le générateur de code métier).

## Shared types (lock these names)

```ts
// libs/dev-tools/src/scripts/diagnostics/craft-diagnostic.ts
export type CraftGateId =
  | 'typecheck'
  | 'lint'
  | 'unit'
  | 'architecture'
  | 'smoke';

export type CraftRemedy =
  | { readonly kind: 'command'; readonly run: string; readonly safe: boolean }
  | { readonly kind: 'edit'; readonly instruction: string }
  | { readonly kind: 'skill'; readonly skill: string };

export type CraftDiagnostic = {
  readonly gate: CraftGateId;
  /** 'TS2589' | 'craft-ng/no-angular-inject' | 'CRAFT_ROUTE_DI_MISSING' | 'UNPARSED_OUTPUT' */
  readonly code: string;
  readonly severity: 'error' | 'warning';
  /** POSIX, relatif à la racine de l'app. */
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  /** Une ligne, sans ANSI, sans saut de ligne. */
  readonly message: string;
  /** Traduction Craft de la cause. Absent tant que la vague 2 n'a pas indexé le code. */
  readonly cause?: string;
  readonly remedy?: CraftRemedy;
  readonly docs?: string;
};

export type CraftGateResult = {
  readonly gate: CraftGateId;
  readonly status: 'pass' | 'fail' | 'skipped';
  readonly durationMs: number;
  readonly skippedReason?: string;
  readonly diagnostics: readonly CraftDiagnostic[];
};

export type CraftCheckReport = {
  readonly version: 1;
  readonly root: string;
  readonly preset: 'angular-cli' | 'nx';
  readonly gates: readonly CraftGateResult[];
  readonly summary: {
    readonly errors: number;
    readonly warnings: number;
    readonly failedGates: readonly CraftGateId[];
  };
};
```

Exit codes de `craft check` : `0` tout vert (les `skipped` ne rougissent pas), `1` au moins un diagnostic `error`, `2` le harnais lui-même a échoué (gate impossible à lancer : tsconfig introuvable, binaire absent).

Messages verbatim (ils entrent dans les tests) :

- `no Craft app found at <path> (missing package.json or src/app)`
- `gate "<id>" cannot run: <reason>`
- `smoke skipped: no page client connected; start the dev server and open the app`
- `craft doctor applied N of M remedies; re-run craft check`
- `no remedy is registered for code "<code>"`

---

# Vague 1 — le socle mécanique

### Task 1: Contrat de diagnostic

**Files:**
- Create: `libs/dev-tools/src/scripts/diagnostics/craft-diagnostic.ts`
- Create: `libs/dev-tools/src/scripts/diagnostics/craft-diagnostic.spec.ts`
- Modify: `libs/dev-tools/src/index.ts` (réexport)
- Modify: `libs/dev-tools/package.json` (export `./diagnostics`)

**Interfaces:**
- Produces: les types ci-dessus, `buildReport(gates, context)`, `summarize(gates)`, `toRelativePosix(root, file)`, `unparsed(gate, rawOutput)`.

- [ ] **Step 1: Write the failing test** — `buildReport` compte errors/warnings et liste `failedGates` dans l'ordre des gates ; un gate `skipped` ne rougit pas le résumé ; `toRelativePosix` normalise les backslashes Windows ; `unparsed()` produit un diagnostic `code: 'UNPARSED_OUTPUT'`, `severity: 'error'`, message tronqué à 500 caractères sans casser une séquence UTF-16.
- [ ] **Step 2: Run test to verify it fails** — `npx vitest run libs/dev-tools/src/scripts/diagnostics/craft-diagnostic.spec.ts`
- [ ] **Step 3: Write minimal implementation** — types + 4 fonctions pures, aucune I/O.
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit** — `feat(dev-tools): lock the craft diagnostic contract`

### Task 2: Gate typecheck

**Files:**
- Create: `libs/dev-tools/src/scripts/check/gates/typecheck-gate.ts`
- Create: `libs/dev-tools/src/scripts/check/gates/typecheck-gate.spec.ts`

**Interfaces:**
- Consumes: liste de tsconfig (`tsconfig.app.json`, `tsconfig.spec.json`, `tsconfig.architecture.json` quand ils existent), un `runCommand` injecté (pas de spawn réel en test).
- Produces: `runTypecheckGate(options): Promise<CraftGateResult>`.

**Notes:** parser la forme `path/file.ts(12,5): error TS2589: Type instantiation is excessively deep…`. Les lignes de continuation (indentées) sont rattachées au diagnostic précédent, pas dupliquées. Un tsconfig absent → gate `skipped` avec `gate "typecheck" cannot run: tsconfig.app.json not found` **seulement** s'il n'en reste aucun ; sinon on typecheck ce qui existe.

- [ ] **Step 1: Write the failing test** — fixtures de sortie `tsc` : erreur simple, erreur multi-lignes, `TS2589`, sortie vide → `pass`, exit non nul sans ligne parsable → un `UNPARSED_OUTPUT`.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation** — un seul `tsc` par tsconfig, en parallèle, chemins normalisés relatifs à la racine.
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 3: Gate lint

**Files:**
- Create: `libs/dev-tools/src/scripts/check/gates/lint-gate.ts`
- Create: `libs/dev-tools/src/scripts/check/gates/lint-gate.spec.ts`

**Notes:** `eslint . -f json`. `code` = `ruleId` (`craft-ng/require-cascade-route-di-check`), `severity` 2 → `error`, 1 → `warning`. Si `fix` est présent sur le message ESLint, attacher dès maintenant `remedy: { kind: 'command', run: 'npx eslint . --fix', safe: true }` — c'est le seul remède connu avant la vague 2. `ruleId: null` (erreur de parsing) → `code: 'LINT_PARSE_ERROR'`. Exit code 2 d'ESLint (config cassée) → gate `fail` avec `UNPARSED_OUTPUT`, pas un crash.

- [ ] **Step 1: Write the failing test** — JSON ESLint fixture avec une règle `craft-ng/*` fixable, une non fixable, un fichier sans message, une sortie de config cassée.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 4: Gates unit et architecture

**Files:**
- Create: `libs/dev-tools/src/scripts/check/gates/vitest-gate.ts`
- Create: `libs/dev-tools/src/scripts/check/gates/vitest-gate.spec.ts`

**Notes:** une seule implémentation paramétrée par `gate: 'unit' | 'architecture'` et par fichier de config. `--reporter=json --outputFile` dans un tmpdir, jamais sur stdout (Vitest y mélange les logs de l'app). Un test rouge → un diagnostic par test échoué : `code` = `'TEST_FAILED'` pour `unit`, `'ARCHITECTURE_VIOLATION'` pour `architecture`, `message` = `<suite> > <test>: <première ligne du message d'assertion>`, `file`/`line` depuis la stack quand disponibles. **Aucun fichier de test trouvé** → `fail` pour `architecture` (la baseline est obligatoire, c'est le contrat de graphe), `skipped` pour `unit`.

- [ ] **Step 1: Write the failing test** — fixtures JSON Vitest : tout vert, un échec avec stack, un échec sans stack, zéro fichier.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 5: Orchestrateur `craft check`

**Files:**
- Create: `libs/dev-tools/src/scripts/check/run-check.ts`
- Create: `libs/dev-tools/src/scripts/check/run-check.spec.ts`
- Modify: `libs/dev-tools/src/bin/craft.ts`
- Create: `libs/dev-tools/src/bin/craft-check.ts`
- Modify: `libs/dev-tools/package.json` (`bin.craft-check`)

**Interfaces:**
- Produces: `runCheck(options): Promise<CraftCheckReport>` + exit code. Options : `root`, `gates` (sous-ensemble), `json`, `requireSmoke`, `bail`.

**Notes:** ordre fixe `typecheck → lint → unit → architecture → smoke` (du moins cher/plus informatif au plus cher). Par défaut on exécute **tous** les gates même après un rouge — un agent veut la liste complète en un aller-retour ; `--bail` pour l'inverse. Détection de la racine d'app : `package.json` + `src/app`. Le gate `smoke` n'existe pas encore : il retourne `skipped` avec `skippedReason: 'smoke gate not implemented'` jusqu'à la tâche 12 (et le test l'assert, pour que la vague 3 casse ce test volontairement).

- [ ] **Step 1: Write the failing test** — gates injectés (faux) : rapport complet, exit `0`/`1`/`2`, `--gate typecheck` n'en lance qu'un, `--json` écrit un JSON valide et rien d'autre sur stdout, app introuvable → message verbatim + exit `2`.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 6: Templates de l'app canonique

**Files:**
- Create: `libs/dev-tools/src/scripts/new/templates/shared/**`
- Create: `libs/dev-tools/src/scripts/new/templates/angular-cli/**`
- Create: `libs/dev-tools/src/scripts/new/templates/nx/**`
- Create: `libs/dev-tools/src/scripts/new/templates.spec.ts`

**Contenu partagé (`shared/`)**, une feature verticale complète et rien de plus :

```
src/main.ts
src/app/app.ts                          craftComponent racine + craftRouterOutlet
src/app/app.config.ts                   craftAppConfig : root component, router, écrans d'erreur
src/app/app.routes.ts                   craftRoutes + componentDeps + check DI + assertExhaustiveRouteExceptions
src/app/screens/home/home.ts            state + un contrôle nommé
src/app/screens/home/home.spec.ts       test par register
src/app/errors/global-error-screen.ts
src/app/errors/route-load-error-screen.ts
architecture/**                         baseline (réutilise migrate-architecture)
eslint.config.mjs                       plugin craft-ng, toutes les règles en error
AGENTS.md                               copie de packages/mcp/content/agents.md + les 3 commandes
.mcp.json                               craft-ng (docs) + craft-ng-dev (local)
README.md                               dev / check / doctor, trois lignes
```

**Notes:** ne pas inventer d'API dans les templates. Chaque fichier est dérivé de son équivalent vivant dans `apps/demo` (`app.config.ts`, `my-global-error-screen.ts`, `app.routes.ts`) réduit au strict minimum, et la preuve qu'il est correct est le gate check de la tâche 7 — pas une relecture. Le `src/` ne contient **aucune** référence à Nx ni au CLI.

- [ ] **Step 1: Write the failing test** — tous les fichiers listés existent dans le bundle de templates ; aucun template partagé ne contient `@nx/`, `nx.json`, `signal(`, `inject(`, `@Injectable`, `async ` ; `AGENTS.md` est identique au contenu de `packages/mcp/content/agents.md` (source unique, lue au build).
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation** — templates + un test dans `packages/mcp` qui casse si `content/agents.md` bouge sans que le template suive.
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 7: `craft new`

**Files:**
- Create: `libs/dev-tools/src/scripts/new/scaffold-app.ts`
- Create: `libs/dev-tools/src/scripts/new/scaffold-app.spec.ts`
- Create: `libs/dev-tools/src/bin/craft-new.ts`
- Modify: `libs/dev-tools/src/bin/craft.ts`, `libs/dev-tools/package.json`

**Interfaces:**
- Produces: `scaffoldApp({ name, root, preset, install, git, yes, json })`.

**Notes:** refuse d'écrire dans un dossier non vide sans `--force`. `--skip-install` pour les tests. La baseline `architecture/` passe par `runMigrateArchitecture` (déjà écrit) et non par une copie figée, pour qu'une nouvelle règle du catalogue arrive automatiquement dans les apps neuves. Sortie finale, en JSON si demandé : chemin, preset, prochaines commandes.

- [ ] **Step 1: Write the failing test** — dans un `mkdtemp` : scaffold `--skip-install` → arborescence attendue, `package.json` valide, dossier non vide refusé, `--json` parsable, `architecture/` non vide.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 8: La preuve — scaffold puis check est vert

**Files:**
- Create: `libs/dev-tools/tests/scaffold-check.e2e.spec.ts` (test lent, tag `@slow`, exclu du run unitaire par défaut)
- Modify: `libs/dev-tools/vitest.config.ts` (projet `e2e` séparé)
- Modify: `.github/workflows/*` (job dédié)

**Notes:** c'est **le** test qui tient toute la promesse du plan. Dans un tmpdir : `craft new` avec les packages `@craft-ng/*` liés depuis le workspace (`file:` ou Verdaccio local, déjà configuré dans `.verdaccio/`), puis `craft check --json`. Assertion : `summary.errors === 0` et `failedGates` vide (smoke `skipped` toléré). Il tourne en CI, pas à chaque `vitest`.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails** — attendu : les templates violent quelque chose. C'est le point du test.
- [ ] **Step 3: Corriger les templates jusqu'au vert** — corriger les templates, jamais désactiver une règle pour les faire passer. Si une règle `craft-ng/*` est réellement inapplicable à une app neuve, ouvrir la question dans le commit plutôt que la mettre en `off`.
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 9 (optionnelle): `npm create craft-ng`

**Files:**
- Create: `packages/create-craft-ng/{package.json,src/index.ts,README.md}`

- [ ] Coquille qui résout `@craft-ng/dev-tools` (installé à la volée) et délègue à `scaffoldApp`. Aucune logique dupliquée. Test : l'entrée exporte bien un bin et appelle le scaffold avec les arguments passés.

---

# Vague 2 — l'auto-réparation

### Task 10: Table de remèdes

**Files:**
- Create: `libs/dev-tools/src/scripts/doctor/remedies.ts`
- Create: `libs/dev-tools/src/scripts/doctor/remedies.spec.ts`

**Interfaces:**
- Produces: `remedyFor(diagnostic): CraftDiagnostic` (retourne le diagnostic enrichi de `cause`, `remedy`, `docs`).

**Contenu initial** — les codes qui coûtent réellement du temps à un agent aujourd'hui :

| Code | Cause Craft | Remède |
|---|---|---|
| `TS2589` | Cascade de routes trop profonde pour l'inférence | `command` `npx craft route split …`, `safe: false` (choix de découpe) |
| `craft-ng/require-cascade-route-di-check` | Fichier de routes sans preuve DI | `command` `npx eslint . --fix`, `safe: true` |
| `craft-ng/no-angular-inject` | Réflexe Angular dans du code Craft | `command` `npx craft-migrate-services`, `safe: false` |
| `craft-ng/prefer-craft-state` / `prefer-craft-effect` | idem | `npx craft-migrate-primitives` |
| `craft-ng/require-primitive-generator-unwrap` | Lecteur non `yield*` | `npx eslint . --fix` |
| `craft-ng/require-interactive-local-name` | Contrôle non nommé → invisible pour `page` et pour le gate smoke | `edit` : nommer le contrôle, littéral unique |
| `craft-ng/require-craft-exception-handler` | Exception déclarée non traitée | `skill` `ng-craft-routes` |
| `ARCHITECTURE_VIOLATION` | Contrat de graphe cassé | `skill` `ng-craft-architecture-tests` (+ rappel : ne pas ajouter de règle pour la feature) |
| `TEST_FAILED` | — | aucun remède, `cause` absente. Ne jamais fabriquer un remède |

Chaque entrée porte l'URL docs exacte. Une entrée sans page docs correspondante est un bug de la table.

- [ ] **Step 1: Write the failing test** — un diagnostic par code de la table ressort avec `cause`, `remedy`, `docs` ; un code inconnu ressort inchangé (pas de remède inventé) ; toutes les URLs `docs` pointent sur un fichier existant de `apps/docs` (test de lien mort, sur le disque, pas réseau).
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation** — table pure ; branchée dans `run-check` juste avant `buildReport`, pour que `craft check` renvoie déjà les remèdes.
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 11: `craft doctor [--fix]`

**Files:**
- Create: `libs/dev-tools/src/scripts/doctor/run-doctor.ts` + spec
- Create: `libs/dev-tools/src/bin/craft-doctor.ts`
- Modify: `libs/dev-tools/src/bin/craft.ts`

**Notes:** `craft doctor` = `runCheck` puis regroupement par remède. Sans `--fix` : rapport, rien d'écrit. Avec `--fix` : exécute uniquement les remèdes `safe: true`, une fois chacun (dédupliqué), puis **relance `craft check`** et rapporte l'avant/après. Une seule passe — pas de boucle jusqu'au vert, qui masquerait une régression. Sortie verbatim `craft doctor applied N of M remedies; re-run craft check`.

- [ ] **Step 1: Write the failing test** — remèdes dédupliqués ; `safe: false` listé mais jamais exécuté ; `--fix` relance le check et le rapport contient les deux résumés ; aucun diagnostic → sortie propre exit `0`.
- [ ] **Step 2–5** — implémentation, vert, commit.

### Task 12: Serveur MCP dev-tools

**Files:**
- Create: `libs/dev-tools/src/mcp/dev-mcp-server.ts` + spec
- Create: `libs/dev-tools/src/bin/craft-mcp.ts`
- Modify: template `.mcp.json` (tâche 6) pour déclarer `craft-ng-dev`
- Modify: `packages/mcp/src/mcp-server.spec.ts` (assertion : `@craft-ng/mcp` n'expose **pas** `craft_check` / `craft_doctor` / `craft_new`)

**Outils:** `craft_check({ root?, gates?, requireSmoke? })` → `CraftCheckReport` en JSON. `craft_doctor({ root?, fix? })`. `craft_new({ name, root, preset })`, annoté destructif.

- [ ] Failing test : les trois outils sont listés, relaient leurs arguments, retournent du JSON structuré (pas du texte formaté), et `@craft-ng/mcp` reste sans eux.
- [ ] Implémenter, brancher dans le scaffold, commit.

---

# Vague 3 — la preuve runtime et le workflow

### Task 13: Gate smoke

**Files:**
- Create: `libs/dev-tools/src/scripts/check/gates/smoke-gate.ts` + spec
- Modify: `libs/dev-tools/src/scripts/check/run-check.ts` (le `skipped` codé en dur saute)

**Contrat:** pour chaque chemin déclaré dans `craftRoutes` (lu via le graphe, pas par regex) : naviguer, attendre `status: 'ready'`, exiger zéro `console.error`, exiger au moins un contrôle nommé sur la page, et que la route ne rende pas l'écran d'erreur global. Diagnostics : `SMOKE_ROUTE_ERROR`, `SMOKE_CONSOLE_ERROR`, `SMOKE_NO_CONTROLS`, `SMOKE_TIMEOUT`, avec `file` = le fichier de routes et la ligne de la route fautive.

**Notes:** le gate parle au broker WS existant. Pas de client connecté → `skipped` + message verbatim, sauf `--require-smoke` qui le passe en `fail`. Nécessite que le broker expose la navigation ; si `page` ne sait pas encore naviguer, l'ajouter comme action `navigate` dans le même contrat `PageAction` — pas de second canal.

- [ ] **Step 1: Write the failing test** — broker simulé : route propre, route avec `console.error`, route sans contrôle nommé, timeout, aucun client.
- [ ] **Step 2–5** — implémentation, vert, commit.

### Task 14: Tests générés d'office

**Files:**
- Modify: `libs/dev-tools/src/scripts/routes/route-command.ts` + spec
- Modify: `libs/dev-tools/src/generators/route/**`

**Notes:** `craft route add` produit aujourd'hui la route et son check DI. Il doit produire aussi le spec du composant par register (calqué sur `apps/demo`), pour que « tester » ne soit plus une décision de l'agent. Pas de nouvelle règle d'architecture : le gate smoke couvre déjà la route ajoutée dès qu'elle est déclarée.

- [ ] Failing test : `route add` écrit le spec, le spec compile et passe dans l'app scaffoldée, `--no-spec` l'exclut.
- [ ] Implémenter, commit.

### Task 15: Skill chapeau et definition of done

**Files:**
- Create: `packages/mcp/skills/craft-ng-build-app/SKILL.md`
- Modify: `packages/mcp/content/agents.md`, `packages/mcp/content/best-practices.md`, `packages/mcp/plugin.json`
- Modify: `packages/mcp/src/mcp-server.spec.ts` (skill listée)

**Contenu:** le cycle complet — `craft new` → cartographier la demande sur les primitives (`translate-spec-to-ng-craft`) → écrire → `craft check` → `craft doctor --fix` → réparer ce qui reste avec les `remedy` → `craft check --require-smoke`. **Definition of done opposable** : `summary.errors === 0`, `failedGates` vide, gate smoke `pass` (pas `skipped`). Interdits : annoncer un succès sur une sortie filtrée, désactiver une règle pour faire passer un gate, ajouter une règle d'architecture pour une feature.

- [ ] Failing test : la skill apparaît dans `list_skills` ; `get_skill` renvoie le corps ; `best-practices.md` cite les trois commandes.
- [ ] Écrire la skill, recaler les contenus, commit.

### Task 16: Docs publiques — le point d'entrée manquant

**Files:**
- Create: `apps/docs/guide/ai/build-an-app.md`
- Modify: `apps/docs/resources/ai-agents.md` (5e couche : les commandes), `apps/docs/learn/index.md` (« You need an Angular 21 application » → `npm create craft-ng`), `apps/docs/index.md` (carte home), `.vitepress/config.mts` (sidebar)
- Create: `apps/docs/tests/build-an-app-docs.spec.ts` (calqué sur `ai-agents-docs.spec.ts`)

- [ ] Failing test docs, puis rédaction, puis `npx nx test docs` et `npx nx lint docs`.

## Verification

```sh
npx vitest run libs/dev-tools/src/scripts
npx nx test dev-tools
npx nx test docs && npx nx lint docs
npm test --workspace @craft-ng/mcp
npx vitest run --project e2e libs/dev-tools/tests/scaffold-check.e2e.spec.ts
```

Vérification humaine, une fois la vague 3 finie : dans un dossier vide, `npm create craft-ng my-app`, ouvrir l'app, demander à un agent neuf (sans ce repo en contexte) « ajoute une page de recherche paginée avec un formulaire ». Attendu : il trouve `AGENTS.md`, appelle `craft_check`, corrige via les `remedy`, et termine avec le gate smoke vert — sans qu'on lui dise aucune de ces étapes.

## Risques

- **Le figeage de l'app canonique.** Publier `craft new` fige l'arborescence et les conventions de nommage ; changer d'avis ensuite casse les apps générées. La tâche 6 est donc une décision produit, à trancher avant d'écrire les templates, pas pendant.
- **Le gate smoke dépend d'un onglet ouvert.** Choix assumé (cohérent avec `page`), mais un agent en CI n'aura jamais le smoke. Si la CI devient un besoin, l'option est un adapter Playwright derrière la même interface de gate — pas un second format de diagnostic.
- **La table de remèdes vieillit.** Un renommage de règle ESLint la désaligne en silence. Le test de la tâche 10 doit vérifier que chaque code `craft-ng/*` de la table existe encore dans `eslint-rules/index.cjs`.
