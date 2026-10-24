# Plan : historique de sessions par test e2e

## État de mise en œuvre

Lot 0 vérifié le 24 octobre 2026 : Playwright 1.64.1 inclut les annotations
dans `suites[].specs[].tests[].annotations`, y compris pour les cas générés en
boucle (fixture de démonstration du package). Deux contextes qui reçoivent le
même UUID rejoignent une session à deux participants ; les tests du store
confirment aussi qu’un UUID terminé est redirigé. Le parcours boutique → panier
→ commande a produit un export v6 gzip de **9 105 octets** (85 événements) ;
budgets retenus : 100 000 octets par session, 300 000 par test. Le sous-chemin
`@craft-ts/component/session-trace` s’importe dans Vitest en environnement
`node` et ne référence aucun global DOM.

Lots 1 à 7 : package et fixture Playwright, contrat ESLint, assertion
d’architecture, capture et métadonnées log-server, stockage versionné, trace et
comparateur, puis pilote ecommerce et trois historiques initiaux. Lot 8 est
implémenté : lecture des références, comparaison MCP et dashboard à deux replays,
avec navigation synchronisée sur les trouvailles et diagnostic par rejeu de la
référence sur le build courant. Lot 9 (documentation) est rédigé.

## Objectif

Chaque test e2e Playwright vert laisse sa session de debug craft dans un
historique propre au test. Un test simple garde la dernière ; un test flaky ou
complexe garde les N derniers parcours différents. Quand un test échoue, sa
session est comparée à cet historique et le rapport Playwright dit où le run
rouge s'écarte de ce que tous les runs verts ont en commun.

Playwright est la première cible. Rien dans les formats ne lui est propre, sauf
la fixture et le test d'architecture.

## Décisions figées

| Décision | Choix | Raison |
| --- | --- | --- |
| Qui écrit l'historique | Les runs **locaux** seulement. Avec `CI` défini, la fixture compare et n'écrit jamais. | Une référence enregistrée en CI et une autre en local ont des environnements différents, et la CI ne doit pas produire de commits. |
| Où vit l'historique | **Versionné dans git**, à côté des specs, comme les captures d'écran Playwright. | L'historique est partagé entre machines et la CI peut comparer sans cache. |
| Quand on écrit | Seulement si le **parcours normalisé est nouveau** pour ce test. | Un succès identique ne touche aucun fichier : un diff git veut dire que le parcours a changé. |
| Identité d'un test | Un `id` déclaré par le test (`craftSession({ id })`), pas son titre. | Renommer le titre ne casse pas le lien avec l'historique. |
| Format des tests | Imposé par une règle ESLint (fichier par fichier) **et** un test d'architecture (invariants globaux). | ESLint ne voit qu'un fichier : il ne peut pas prouver l'unicité des ids. |
| Session de référence | L'export portable v6 tel que le serveur le rend (`GET /sessions/:id`), compressé. | Il reste rejouable dans le dashboard et par `runReplayTest`. |

Écarté pour l'instant : épingler les sessions dans l'archive du log-server (la
fixture copie l'export tout de suite, l'archive peut se vider sans perte),
Git LFS (non installé ; le format le permettra sans changement), mise à jour
depuis la CI.

## Existant réutilisé

- **Capture** : `provideCraftDebugSessionCapture` et
  [debug-session-persistence.ts](../../libs/component/src/lib/ai/debug-session-persistence.ts).
  L'id de session vit dans `localStorage` sous
  `craft-debug-session-id:<origin>` ; la page envoie `session:sync`, le serveur
  répond `session:ready` avec l'id effectif ; la fin passe par `session:finish`
  et un accusé de réception (avec un délai), plus un `keepalive` vers
  `/sessions/:id/finish`.
- **Archive** : [debug-session-store.ts](../../apps/log-server/src/debug-session-store.ts).
  `begin()` **redirige** vers un nouvel UUID quand l'id reçu existe déjà et n'est
  plus en cours d'enregistrement (ligne ~204). Conséquence : chaque tentative
  d'un test doit imposer un UUID neuf, et la fixture doit lire l'id effectif.
- **Export portable v6** et sa validation (`validateReplayExport`).
- **Plan de replay compilé** : `compileReplayPlan` (commandes, dépendances,
  observations attendues), point de départ de la trace normalisée.
- **Scénarios et tolérances** : [debug-session-scenario.ts](../../libs/component/src/lib/ai/debug-session-scenario.ts),
  `compareReplayScenarioValue`, `runReplayTest`. Réutilisés par le comparateur
  et pour rejouer la référence sur le build courant (lot 8).
- **Config Playwright qui démarre log-server, app et dashboard sur des ports
  dédiés** : [playwright.config.ts](../../apps/debug-session-dashboard/playwright.config.ts).
- **Outillage de contrôle** : plugin ESLint `craft-ts` dans
  [libs/dev-tools/src/eslint-rules](../../libs/dev-tools/src/eslint-rules) (règles
  `.cjs`, specs vitest + `ESLint`), suites `architecture/` lancées par la cible nx
  `architecture` (`vitest.architecture.config.ts`).

Contraintes connues :

- `libs/dev-tools` est la racine du graphe nx et ne peut dépendre d'aucune lib.
  La règle ESLint (pure analyse de texte) y va ; l'assertion d'architecture va
  dans le nouveau package.
- La capture de `apps/demo` et `apps/demo-ecommerce` n'est installée qu'avec
  `import.meta.env.DEV` et un log-server en loopback. Les e2e de ce mécanisme
  tournent donc sur le serveur de dev Vite, pas sur un build de production.
- `@craft-ts/component` est une lib navigateur. La fixture tourne dans Node :
  elle ne doit importer qu'un sous-chemin pur (`./session-trace`, lot 6).

## Vue d'ensemble

```
test Playwright
  │  annotation craftSession({ id, keep, reason })
  ▼
fixture craftSessions (auto)
  ├─ avant : UUID neuf + métadonnées → addInitScript(__CRAFT_E2E_SESSION__)
  │            └─ capture : impose l'id, envoie `test` dans session:sync
  ├─ test
  └─ après : __craftDebugSession.finish() → id effectif
             GET /sessions/:id → export v6
             normalizeSessionTrace(export) → trace + empreinte
             ├─ vert + écriture autorisée + empreinte nouvelle → historique (keep N)
             └─ rouge → compareSessionTraces(trace, historique)
                        → rapport .md/.json + session jointe au rapport Playwright
```

## Formats

### Annotation de test

```ts
import { test, craftSession } from './fixtures';

test(
  'passer commande avec un code promo',
  {
    annotation: craftSession({
      id: 'cart.checkout-promo',
      keep: 5,
      reason: 'le paiement répond dans un ordre variable',
    }),
  },
  async ({ page }) => {
    /* … */
  },
);
```

`craftSession()` rend une annotation Playwright native :

```ts
{ type: 'craft-session', description: '{"id":"cart.checkout-promo","keep":5,"reason":"…"}' }
```

Règles du contrat :

- `id` : `^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$`,
  80 caractères au plus. Unique dans tout le dépôt.
- `keep` : entier de 1 à 10, 1 par défaut.
- `reason` : obligatoire si `keep > 1`, chaîne non vide.
- `capture` : `'required'` par défaut ; `'none'` pour un test qui n'ouvre pas
  d'app capturée (il garde l'annotation pour l'unicité, mais n'a pas
  d'historique).

### Arborescence de l'historique

```
<testDir>/__sessions__/
  cart.checkout-promo/
    chromium/
      history.json
      2026-10-24T15-02-11Z-3f9c2a.session.json.gz
      2026-10-26T09-40-55Z-b81d07.session.json.gz
    firefox/
      …
```

Les dossiers par projet Playwright sont disjoints : deux workers n'écrivent
jamais dans le même dossier, puisqu'un id est unique et qu'un projet exécute un
test une fois à la fois (les retries sont séquentiels).

### `history.json`

```json
{
  "format": "craft-e2e-session-history",
  "schemaVersion": 1,
  "id": "cart.checkout-promo",
  "project": "chromium",
  "keep": 5,
  "runs": [
    {
      "file": "2026-10-26T09-40-55Z-b81d07.session.json.gz",
      "traceHash": "b81d07…",
      "recordedAt": "2026-10-26T09:40:55.000Z",
      "durationMs": 8412,
      "retry": 0,
      "gitSha": "f40a123cb",
      "dirty": false,
      "title": "passer commande avec un code promo",
      "specFile": "e2e/cart.spec.ts",
      "environment": { "browser": "Chrome", "browserVersion": "141", "platform": "macOS" },
      "sizeBytes": 48211
    }
  ]
}
```

`runs` est trié du plus récent au plus ancien. JSON écrit avec des clés triées
et un retour à la ligne final pour des diffs stables.

### Fichier de session

L'export v6 rendu par `GET /sessions/:id`, sérialisé avec des clés triées puis
compressé par `zlib.gzipSync` (Node écrit un en-tête gzip à `mtime` 0, le
fichier est donc reproductible). Les miniatures ne font pas partie de l'export.

### Trace normalisée

```ts
type SessionTraceStep = Readonly<{
  /** Identité pour l'alignement, sans valeur variable. */
  key: string;
  kind: 'route' | 'interaction' | 'http' | 'invocation' | 'exception' | 'checkpoint' | 'console-error';
  /** Ce qui est comparé une fois deux pas alignés. */
  detail: Readonly<Record<string, unknown>>;
  /** Temps écoulé depuis le début : jamais dans key ni dans l'empreinte. */
  elapsedMs: number;
  participant: string;
  /** Pour revenir à l'événement d'origine dans le dashboard. */
  eventId: string;
}>;

type SessionTrace = Readonly<{
  format: 'craft-session-trace';
  schemaVersion: 1;
  steps: readonly SessionTraceStep[];
  /** sha256 de [key, detail] de chaque pas. */
  hash: string;
}>;
```

Normalisation, par type de pas :

| Pas | `key` | `detail` |
| --- | --- | --- |
| `route` | `route:<chemin sans query>` | paramètres de route, clés de query triées |
| `interaction` | `interaction:<action>:<empreinte craft de la cible>` (repli : `interactionName`) | valeur de champ si capturée |
| `http` | `http:<MÉTHODE>:<chemin>` | statut, issue (`ok`/`error`/`aborted`), clés du corps |
| `invocation` | `invocation:<adresse>` | phase terminale, tag d'exception |
| `exception` | `exception:<tag ou nom>` | message nettoyé |
| `checkpoint` | `checkpoint:<adresse de primitive>` | sha256 de la valeur stable |
| `console-error` | `console-error:<premier segment du message>` | message nettoyé |

On retire partout : UUID, nombres de plus de 6 chiffres dans les chemins
(remplacés par `:n`), horodatages, `[REDACTED]`, ids d'opération et de
participant. Les règles de tolérance existantes (`url`, `number`,
`unordered`, `ignore`) sont réutilisables pour des normalisations déclarées par
test (option `normalize` de `craftSession`, hors du premier lot).

### Rapport de comparaison

```ts
type SessionTraceComparison = Readonly<{
  baselineCount: number;
  /** Le premier invariant absent ou changé : le point de divergence. */
  firstDivergence?: SessionTraceFinding;
  findings: readonly SessionTraceFinding[];
  /** Pas qui varient déjà entre runs verts : affichés repliés. */
  noise: readonly SessionTraceStep[];
}>;

type SessionTraceFinding =
  | { kind: 'missing-invariant'; expected: SessionTraceStep; afterStep?: SessionTraceStep }
  | { kind: 'changed-invariant'; expected: SessionTraceStep; observed: SessionTraceStep; fields: readonly string[] }
  | { kind: 'new-step'; observed: SessionTraceStep; severity: 'error' | 'info' }
  | { kind: 'timing'; step: SessionTraceStep; observedMs: number; baselineRangeMs: readonly [number, number] };
```

Rendu Markdown joint au test :

```
Session comparée à 5 runs verts (cart.checkout-promo · chromium)

Divergence au pas 7/12 (stable dans 5/5 runs verts)
  attendu  http GET /api/cart → 200
  observé  http GET /api/cart → 500
Nouveau : exception craft CartLoadError (jamais vue dans l'historique)
Durée : http GET /api/products 4 200 ms (historique 80–140 ms)
Ignoré : 3 pas qui varient déjà entre runs verts

Rejouer : http://localhost:4210/#/compare?test=cart.checkout-promo&project=chromium&run=<id>
```

## Lots

Chaque lot se termine par ses tests verts et un commit. Les lots 1 à 3 ne
dépendent pas de la capture : ils peuvent avancer avant le lot 4.

### Lot 0 — Vérifications préalables (demi-journée)

But : lever les incertitudes avant d'écrire du code.

1. Vérifier que `playwright test --list --reporter=json` (1.63) rend les
   annotations déclarées dans l'objet de détails, y compris pour des tests
   générés dans une boucle et dans un `test.describe`.
2. Vérifier que deux contextes Playwright qui imposent le même id rejoignent
   bien **une** session (deux participants) tant qu'elle est `recording`, et
   qu'un id déjà terminé est redirigé (comportement de `begin()`).
3. Mesurer la taille gzip d'une session réaliste de `apps/demo-ecommerce`
   (parcours boutique → panier → commande, avec `captureInputValues`) pour fixer
   le budget par défaut.
4. Vérifier qu'un sous-chemin `@craft-ts/component/session-trace` peut être
   importé dans Node sans charger de code navigateur (exports du
   `package.json`, résolution vitest et tsconfig).

Critère de fin : quatre réponses notées en tête de ce plan, budget chiffré.

### Lot 1 — Contrat et fixture minimale

Nouveau package `libs/playwright-sessions` (`@craft-ts/playwright-sessions`),
privé tant que le pilote n'est pas validé.

Fichiers :

- `src/contract.ts` : `craftSession(options)`, `parseCraftSessionAnnotation(annotations)`,
  `CRAFT_SESSION_ANNOTATION = 'craft-session'`, validation de l'id, de `keep` et
  de `reason` (erreurs en français, qui citent le test).
- `src/mode.ts` : `resolveCraftSessionMode(env, options)` →
  `'update' | 'compare' | 'off'`.
  - `CRAFT_SESSIONS=off|compare|update` l'emporte ;
  - sinon `CI` défini → `compare` ;
  - sinon option `update` de la config (`'on-success'` par défaut → `update`).
- `src/fixture.ts` : `test = base.extend<{ craftSessionContract: … }, { craftSessions: CraftSessionsOptions }>()`.
  - option de worker `craftSessions` (`store`, `serverUrl`, `budgetBytes`,
    `update`) ;
  - fixture `auto: true` qui lit l'annotation et lève une erreur claire si elle
    manque ou est invalide. À ce lot, rien d'autre.
- `src/index.ts` : exporte `test`, `expect`, `craftSession`, les types.
- `project.json` (cibles `test`, `lint`, `typecheck`), `vitest.config.ts`,
  `tsconfig*.json`, `README.md`.

Tests (vitest) : validation de l'annotation, résolution du mode (matrice des
variables d'environnement), message d'erreur quand l'annotation manque.

Critère de fin : un spec Playwright de démonstration du package échoue sans
annotation et passe avec.

### Lot 2 — Règle ESLint `craft-ts/e2e-session-contract`

Fichiers : `libs/dev-tools/src/eslint-rules/e2e-session-contract.cjs`, son spec,
déclaration dans `index.cjs` et `index.d.cts`, nouveau preset `configs.e2e`.

Options :

```js
{ fixtureModules: ['./fixtures', '../fixtures'], allowManualContexts: false }
```

Le preset s'applique depuis l'`eslint.config.mjs` de l'app, sur
`files: ['e2e/**/*.spec.ts']`.

Signalements :

1. `test` (ou `test.describe`, `test.step`…) importé depuis `@playwright/test`
   dans un fichier couvert : « importez `test` depuis la fixture, sinon la
   session n'est pas rattachée au test ».
2. Appel `test(titre, fn)` sans objet de détails, ou objet sans
   `annotation: craftSession(...)` (seul ou dans un tableau). Suggestion (pas
   d'autofix) : insérer `craftSession({ id: '<slug du titre>' })`.
3. `craftSession` dont l'argument n'est pas un objet littéral, ou dont `id`
   n'est pas une chaîne littérale. Exception : un gabarit dont toutes les
   expressions sont des identifiants de la boucle `for…of` englobante.
4. `id` littéral au mauvais format.
5. `keep` littéral > 1 sans `reason` littéral non vide ; `keep` hors 1–10.
6. Deux `craftSession` avec le même id littéral dans le fichier.
7. `browser.newContext()` / `browser.newPage()` : utilisez
   `craftSessions.newContext()` (lot 4). Désactivable avec
   `allowManualContexts` pour les specs qui testent l'enregistreur lui-même.
8. `test.skip`/`test.fixme`/`test.only` gardent le contrat (pas d'exemption).

Tests : un cas valide et un cas invalide par signalement, boucle `for…of`,
`describe` imbriqué, alias d'import.

Critère de fin : `npx vitest run libs/dev-tools/src/eslint-rules/e2e-session-contract.spec.ts`
vert ; le preset activé sur un dossier d'exemple signale ce qu'il doit.

### Lot 3 — Assertion d'architecture

Fichier : `libs/playwright-sessions/src/architecture.ts`, exporté par
`@craft-ts/playwright-sessions/architecture`.

```ts
export async function assertE2eSessionContract(options: {
  configs: readonly string[]; // chemins des playwright.config.ts
  workspaceRoot: string;
  budgetBytes?: { session: number; test: number };
}): Promise<void>;
```

Fonctionnement : pour chaque config, `execFile('npx', ['playwright', 'test',
'--list', '--reporter=json', '-c', config])`, puis parcours des `suites` pour
obtenir chaque test avec son fichier, son chemin de titres, son projet et ses
annotations. La liste réelle couvre les tests générés dynamiquement, ce que la
règle ESLint ne peut pas voir.

Invariants vérifiés (un message par violation, tous listés avant d'échouer) :

1. Chaque test a exactement une annotation `craft-session` valide.
2. **Un id désigne un seul test** (même fichier et même chemin de titres) dans
   toutes les configs listées. Le même test présent dans plusieurs projets
   compte une fois.
3. Chaque dossier `__sessions__/<id>/` correspond à un id déclaré. Sinon :
   « historique orphelin : renommez le dossier vers le nouvel id ou supprimez-le ».
4. Chaque sous-dossier `<projet>/` correspond à un projet de la config.
5. `history.json` valide (schéma v1), `keep` égal à celui de l'annotation,
   `runs.length ≤ keep`, chaque `file` existe, aucun fichier
   `.session.json.gz` non référencé.
6. Budget : chaque session ≤ `budgetBytes.session`, chaque dossier de test ≤
   `budgetBytes.test` (valeurs du lot 0).
7. Un test `keep: 1` dont l'historique contient un run `retry > 0` : message
   d'avertissement (non bloquant) qui suggère `keep > 1` avec une `reason`.

Tests (vitest) : fixtures de dossiers et de sortie `--list` en dur pour chaque
invariant ; un test d'intégration qui lance réellement `--list` sur le spec de
démonstration du lot 1.

Critère de fin : l'assertion branchée dans une suite `architecture/` échoue sur
un id dupliqué et sur un dossier orphelin.

### Lot 4 — Capture rattachée au test

**Capture** ([debug-session-persistence.ts](../../libs/component/src/lib/ai/debug-session-persistence.ts)) :

1. Au démarrage, lire `globalThis.__CRAFT_E2E_SESSION__` (`{ id, test }`),
   posé par la fixture avec `addInitScript` avant tout script de l'app.
   - si présent et valide : utiliser `id` comme id partagé (et l'écrire sous
     la clé `localStorage` habituelle pour que les autres onglets du contexte le
     rejoignent) ;
   - ajouter `test` au message `session:sync`.
2. Exposer, seulement quand ce marqueur est présent,
   `globalThis.__craftDebugSession` :
   - `id(): string` — l'id effectif, mis à jour par `session:ready` ;
   - `finish(): Promise<'acknowledged' | 'timeout' | 'offline'>` — envoie
     `session:finish` et se résout sur l'accusé de réception existant ;
   - `mark(label: string): void` — ajoute un événement `test-marker` à la
     timeline (sert à relier un `test.step` à la session).
3. Specs : id imposé, `test` présent dans le `session:sync`, `finish()` résolu
   par l'accusé et par le délai, absence de `__craftDebugSession` sans marqueur.

**log-server** ([http-server.ts](../../apps/log-server/src/http-server.ts),
[debug-session-store.ts](../../apps/log-server/src/debug-session-store.ts)) :

1. `session:sync` accepte `test: { id, title, specFile, project, retry, gitSha }`
   (chaînes bornées à 512 caractères, `retry` entier), validé comme
   l'environnement. Stocké dans `StoredSession.test`, rendu dans le résumé et
   dans l'export (`PortableDebugSession.test`).
2. `GET /sessions?testId=<id>` filtre la liste.
3. Specs dans `debug-session-http.spec.ts` et `debug-session-store.spec.ts`.

**Fixture** (`libs/playwright-sessions/src/fixture.ts`) :

1. Avant le test : générer un UUID par tentative, construire `test`
   (`testInfo.titlePath`, `testInfo.file`, `testInfo.project.name`,
   `testInfo.retry`, `git rev-parse --short HEAD` lu une fois par worker),
   `context.addInitScript` sur le contexte par défaut.
2. Fixture `craftSessions.newContext(options)` : même script d'init, même id,
   pour les tests à plusieurs contextes (une session, plusieurs participants).
3. `craftSessions.step(label, fn)` : `test.step` + `mark()` sur chaque page
   ouverte.
4. Après le test (la fixture dépend de `context`, donc elle se termine avant
   lui) : appeler `finish()` sur chaque page encore ouverte, garder l'id
   effectif, `GET /sessions/:id`. Si la capture était requise et qu'aucune
   session n'existe : échec explicite (« l'app n'a pas installé la capture »).

Critère de fin : un spec e2e du pilote retrouve sa session par `testId` sans
comparer de listes, y compris avec deux contextes.

### Lot 5 — Stockage versionné de l'historique

Fichier : `libs/playwright-sessions/src/history-store.ts`.

```ts
export function readHistory(dir: string): SessionHistory | undefined;
export function recordRun(dir: string, input: {
  keep: number; session: PortableDebugSession; trace: SessionTrace; meta: RunMeta;
}): 'written' | 'unchanged';
export function readBaselines(dir: string): readonly Readonly<{ run: HistoryRun; session: PortableDebugSession }>[];
```

Règles d'écriture :

1. Seulement si le mode est `update` **et** `testInfo.status === 'passed'`.
2. Si `trace.hash` est déjà dans `runs` : `unchanged`, aucun fichier touché.
3. Sinon : écrire la session (clés triées, gzip), l'ajouter en tête de `runs`,
   supprimer les fichiers au-delà de `keep`, réécrire `history.json`.
4. Écriture atomique : fichier temporaire dans le même dossier puis `rename`.
5. `dirty` vient de `git status --porcelain` (lu une fois par worker).

Le chemin vient de `testInfo.project.testDir` + `__sessions__` sauf option
`store`. Les fichiers finissent dans les commits du développeur comme les
captures d'écran : rien n'est commité automatiquement.

Tests : écriture, déduplication par empreinte, rotation à `keep`, atomicité
(fichier temporaire absent après succès), stabilité octet par octet de deux
écritures du même contenu.

Critère de fin : deux runs identiques du pilote ne produisent aucun diff git ;
un parcours modifié produit exactement un fichier ajouté et `history.json`
modifié.

### Lot 6 — Trace normalisée et comparateur

Fichiers (purs, sans DOM) :

- `libs/component/src/lib/ai/debug-session-trace.ts` :
  `normalizeSessionTrace(session: PortableDebugSession): SessionTrace`.
  Construit à partir des événements et de `compileReplayPlan(session)` pour
  reprendre les adresses déjà résolues.
- `libs/component/src/lib/ai/debug-session-trace-compare.ts` :
  `compareSessionTraces(observed, baselines)` et
  `renderSessionTraceComparison(result, context): string` (Markdown).
- Sous-chemin `@craft-ts/component/session-trace` dans `package.json` (exports),
  `tsconfig` et alias vitest.

Algorithme :

1. Aligner chaque référence sur la première avec un diff de Myers sur les
   `key` ; un pas est un **invariant** s'il est aligné dans toutes les
   références avec le même `detail`. Un pas aligné partout mais dont le
   `detail` varie est un invariant de présence (seuls les champs constants sont
   comparés). Le reste est du **bruit**.
2. Aligner le run observé sur la séquence des invariants.
3. Classer : invariant absent → `missing-invariant` ; invariant aligné avec un
   champ constant différent → `changed-invariant` ; pas observé jamais vu dans
   aucune référence → `new-step` (`error` pour `exception`, `console-error`,
   `http` en statut ≥ 400, sinon `info`) ; pas commun dont `elapsedMs` dépasse
   `max(références) × 2` et `max + 500 ms` → `timing`.
4. `firstDivergence` = la première trouvaille `missing-invariant` ou
   `changed-invariant` dans l'ordre du run observé, sinon la première
   `new-step` de sévérité `error`.
5. Avec une seule référence, tout est invariant : le rapport le dit (« une seule
   référence, les variations normales ne sont pas connues »).

Tests : sessions exportées réelles (fixtures prises au lot 0) et traces
construites à la main : requête en erreur, interaction manquante, exception
nouvelle, bruit d'ordre entre deux requêtes parallèles, lenteur, une seule
référence, aucune référence.

Branchement dans la fixture : test rouge (`failed` ou `timedOut`) → lire les
références, comparer, `testInfo.attach('craft-session-diff.md', …)`,
`testInfo.attach('craft-session-diff.json', …)`,
`testInfo.attach('craft-session.json.gz', …)`, annotation
`craft-session-divergence` avec la première divergence en une ligne. Test rouge
sans historique : joindre seulement la session.

Critère de fin : sur le pilote, faire échouer volontairement l'API du panier ;
le rapport HTML Playwright montre la divergence au bon pas.

### Lot 7 — Pilote sur `apps/demo-ecommerce`

1. `apps/demo-ecommerce/playwright.config.ts` sur le modèle de celui du
   dashboard : log-server sur un port dédié (`DEBUG_SESSION_DIR` dans `tmp/`,
   miniatures désactivées), app sur un port dédié avec
   `VITE_CRAFT_LOG_SERVER_URL`, `use.craftSessions`.
2. `apps/demo-ecommerce/e2e/fixtures.ts` : réexporte `test`, `expect` et
   `craftSession` du package.
3. Trois tests : parcours boutique → panier → commande (`keep: 1`), connexion
   puis édition admin (`keep: 1`), un parcours avec deux contextes (client et
   admin) en `keep: 3` avec une `reason`.
4. `eslint.config.mjs` : preset `e2e` sur `e2e/**/*.spec.ts`, et
   `apps/demo-ecommerce/e2e/**/*.ts` ajouté aux `lintFilePatterns` de la cible
   `lint` (aujourd'hui limitée à `src/`).
5. `architecture/` : un test qui appelle `assertE2eSessionContract` sur la
   config du pilote ; nouvelle cible nx `architecture` (l'app n'en a pas encore),
   sur le modèle de `apps/debug-session-dashboard/project.json`.
6. Scripts racine : `e2e:demo-ecommerce` (comparaison ou mise à jour selon
   l'environnement), `e2e:demo-ecommerce:update` (`CRAFT_SESSIONS=update`).
7. Premier historique enregistré et commité.

Critère de fin : `CI=1 npm run e2e:demo-ecommerce` vert sans écrire ; une
régression volontaire produit un rapport lisible ; `nx run
demo-ecommerce:architecture` et `nx run demo-ecommerce:lint` verts.

### Lot 8 — Exploitation : dashboard, MCP, rejeu de la référence

1. **log-server** : `GET /e2e-sessions?root=<store>` (liste des historiques) et
   `GET /e2e-sessions/<id>/<projet>/<fichier>` en lecture seule, racine fournie
   par `CRAFT_E2E_SESSION_STORE` (liste de dossiers autorisés, jamais un
   chemin reçu du client).
2. **Dashboard** : route `#/compare?test=<id>&project=<p>&run=<sessionId>`.
   Deux replays côte à côte (référence la plus récente, run observé),
   synchronisés sur les pas alignés ; la liste des trouvailles du comparateur
   en panneau latéral ; un clic sur une trouvaille place les deux replays sur
   ce pas. Le log-server renvoie le paquet de comparaison depuis une route
   lecture seule afin que le dashboard n'enchaîne pas des lectures client
   dépendantes. Les replays utilisent des frames isolées et le bridge autorise
   l'origine configurée du dashboard.
3. **MCP** (`packages/log-mcp`) : fait — outil `sessions.compare` (`testId`,
   `project`, `sessionId`) qui rend le JSON du comparateur et le lien du
   dashboard.
4. **Tri front/back** : option de la fixture `replayBaselineOnFailure: true`.
   En cas d'échec, rejouer la référence la plus récente sur le build courant
   avec le moteur de replay du dashboard (réseau enregistré). Le rapport ajoute :
   « la référence rejoue sans écart : le front n'a pas changé ce parcours, le
   problème vient des données, du back ou de l'environnement », ou l'inverse
   avec le premier écart.

Critère de fin : `sessions.compare` produit le rapport et son lien ; la route
dashboard charge la comparaison, deux replays atteignent l'état prêt et un clic
sur une trouvaille envoie les deux demandes de repositionnement. En cas d'échec,
la fixture joint un rapport indiquant si la référence rejoue ou diverge sur le
build courant.

### Lot 9 — Documentation

- `libs/playwright-sessions/README.md` : installation, contrat, modes,
  arborescence, lecture d'un rapport, mise à jour volontaire.
- Section dans le README du dashboard (vue de comparaison) et du log-server
  (métadonnées `test`, filtre, endpoints `e2e-sessions`).
- Mise à jour de ce plan : état de mise en œuvre en tête.

## Pièges connus

- **Redirection d'id** : un UUID réutilisé après la fin d'une session est
  redirigé par le serveur. Ne jamais réutiliser l'UUID d'une tentative
  précédente ; toujours lire `__craftDebugSession.id()` après `finish()`.
- **Fin d'enregistrement** : sans `finish()` attendu, les derniers événements
  peuvent manquer si le contexte se ferme vite. La fixture doit se terminer
  avant `context` (dépendance explicite).
- **Page fermée par le test** : `finish()` n'est plus appelable ; on s'appuie
  sur le `keepalive` existant et on attend que la session passe `completed`
  avec `expect.poll` borné.
- **Capture réservée au dev** : un e2e sur un build de production n'aura pas de
  session. `capture: 'required'` le signale au lieu de passer en silence.
- **Données variables** : ids générés côté serveur dans les URL, horodatages
  dans les corps. La normalisation doit les retirer, sinon chaque run est
  « nouveau » et l'historique grossit à chaque succès. Le critère du lot 5
  (aucun diff entre deux runs identiques) est le test de cette propriété.
- **Valeurs sensibles** : `captureSensitiveInputValues` est activé en dev. Les
  sessions versionnées ne doivent contenir que des données de test ; le test
  d'architecture peut rechercher des motifs (`password`, `token`, adresses
  e-mail hors domaines de test) dans les sessions stockées (amélioration
  possible du lot 3).
- **Sous-chemin pur** : si `session-trace` importe par erreur un module qui
  touche `window`, la fixture plante dans Node. Garder ces deux fichiers sans
  import de runtime et le vérifier par un spec vitest en environnement `node`.
- **Autres sessions de travail** : ports et dossiers dédiés dans la config du
  pilote, `reuseExistingServer: false`, pour ne pas toucher aux serveurs déjà
  lancés.

## Hors périmètre

- Mise à jour de l'historique depuis la CI, ou ouverture automatique d'une PR
  de mise à jour.
- Autres lanceurs que Playwright (Cypress, WebdriverIO).
- Normalisations déclarées par test (`normalize` dans `craftSession`) : prévues
  par le format, implémentées après le pilote.
- Dérivation automatique d'un `ReplayScenario` à partir des invariants appris.

## Ordre et dépendances

```
Lot 0 ─┬─ Lot 1 ─┬─ Lot 2
       │         └─ Lot 3
       └─ Lot 4 ─── Lot 5 ─── Lot 6 ─── Lot 7 ─── Lot 8 ─── Lot 9
```

Les lots 2 et 3 peuvent avancer en parallèle de 4. Le pilote (lot 7) peut
démarrer dès le lot 5 en mode écriture seule, puis gagner la comparaison au
lot 6.

## Vérification finale

```bash
npx nx run playwright-sessions:test
npx vitest run libs/dev-tools/src/eslint-rules/e2e-session-contract.spec.ts
npx nx run craft-ts-component:test
npx vitest run --config apps/log-server/vitest.config.mts
npx nx run demo-ecommerce:lint
npx nx run demo-ecommerce:architecture
CI=1 npm run e2e:demo-ecommerce
```

Puis, à la main : casser l'API du panier, relancer en mode comparaison, ouvrir
le rapport HTML Playwright. Le lien dashboard attend la route du lot 8.
