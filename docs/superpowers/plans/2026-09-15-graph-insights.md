# Graphe CraftTS enrichi : métriques, rapport, couverture, documentation, explorateur et MCP — plan d'implémentation

> **État au 15 septembre 2026 : à faire.** Rien n'est implémenté.

## Contexte

Une comparaison avec Graphify (graphe de connaissances pour agents IA) et
SonarQube a fait ressortir des fonctionnalités qui gagnent à vivre **dans** le
graphe CraftTS, parce qu'elles y sont rattachées à un concept Craft (route,
service, primitive) plutôt qu'à un fichier.

Fonctionnalités retenues :

| # | Fonctionnalité | Inspirée de | Lot |
|---|---|---|---|
| 1 | Métriques par nœud : complexité cyclomatique, lignes, fan-in / fan-out | Sonar | A |
| 2 | Points chauds et god nodes | Graphify, Sonar | A |
| 3 | Rapport `GRAPH_REPORT` (Markdown + JSON) | Graphify | B |
| 7 | MCP de requêtes sur le graphe, utilisable dans les projets externes | Graphify | F |
| 8 | Couverture de tests par nœud et par route | Sonar | C |
| 10 | Explorateur HTML enrichi : carte de chaleur, recherche de chemin | Graphify | E |
| 11 | JSDoc, commentaires de justification et pages de doc reliées aux nœuds | Graphify | D |

## Objectif

Qu'un humain ou un agent, dans **n'importe quel projet qui utilise craft-ts**,
puisse :

- savoir quels nœuds sont complexes, centraux, peu couverts ou non documentés ;
- lire un rapport synthétique de l'architecture ;
- interroger le graphe via MCP (nœud, voisins, chemin, impact, violations) ;
- poser des seuils de métriques dans sa suite `architecture/`.

## Invariants

- **Déterministe.** Aucune extraction par LLM, aucune arête « ambiguë ».
- **Inconnu n'est pas zéro.** Un nœud sans étendue de source, ou absent du
  rapport de couverture, n'a pas de métrique : champ absent et entrée dans
  `graph.diagnostics`, jamais `0` ni `100 %`.
- **Compatibilité JSON.** `version: 1` reste inchangé ; tous les nouveaux
  champs sont optionnels. `graphHash` ne hache que les identifiants de nœuds et
  les arêtes ([architecture-graph.ts:151](../../../libs/dev-tools/src/scripts/architecture-graph.ts)),
  donc les métriques ne le font pas bouger.
- **`@craft-ts/dev-tools` reste la racine du graphe nx** : il n'importe aucune
  autre lib du dépôt.
- **Utilisable hors du dépôt** : tout passe par des packages publiés
  (`@craft-ts/dev-tools` et le nouveau `@craft-ts/graph-mcp`).

## Architecture

```text
            analyzeDependencyGraph (ts-morph + type checker)
                              │
          addNode(source) ────┼──── métriques brutes (points de décision, lignes)
                              │     JSDoc / commentaires WHY
                              ▼
                     DependencyGraph (JSON v1)
                              │
     ┌────────────────┬───────┴────────┬──────────────────┐
     ▼                ▼                ▼                  ▼
 passe métriques  applyCoverage   collecteur docs    architectureViolations
 (propre/total,   (coverage-      Markdown           (non levant)
  fan-in/out)      final.json)    (opt-in)
     └────────────────┴───────┬────────┴──────────────────┘
                              ▼
                     graphe enrichi
          ┌──────────────┬────┴─────────┬──────────────────┐
          ▼              ▼              ▼                  ▼
   graphReport      explorateur    assertMetric-      @craft-ts/graph-mcp
   (.report.md /    HTML           Thresholds         (projets externes)
    .report.json)                  (suite architecture/)
```

## Décisions

1. **Les métriques sont un champ optionnel de premier niveau `metrics`** sur
   `DependencyGraphNode`, comme `endLine` et `sourceHash`, et non dans
   `details`, qui porte le vocabulaire propre à chaque type de nœud.
2. **Chaque point de décision (et chaque instruction couverte) est attribué au
   nœud le plus interne dont l'étendue le contient.** La valeur « propre » d'un
   nœud est exacte ; la valeur « totale » est la somme sur la fermeture
   `contains`. Les agrégats par route se font sans double comptage.
3. **Le MCP est un nouveau package `@craft-ts/graph-mcp`** (bin
   `craft-ts-graph-mcp`), sur le modèle de `@craft-ts/log-mcp`. Il s'exécute dans
   le projet de l'utilisateur, peut lire **et** reconstruire le graphe.
   `@craft-ts/mcp` reste consacré à la doc et aux skills, hors ligne.
4. **La couverture se lit, elle ne se produit pas** : entrée = rapport Istanbul
   `coverage-final.json` (`vitest run --coverage --coverage.reporter=json`).
5. **Les pages de doc passent par un collecteur opt-in**, via le contrat
   `collectors` existant ([dependency-graph.ts:219](../../../libs/dev-tools/src/scripts/dependency-graph.ts)).
6. **Fonctions pures d'abord.** Tout ce qui lit git ou le disque (fréquence de
   modification, rapport de couverture) reste dans les binaires et le MCP ; les
   fonctions de `scripts/` reçoivent des données.
7. **Aucun seuil par défaut.** Les seuils de métriques sont opt-in dans la suite
   `architecture/` du projet.

## Lot A — Métriques par nœud et points chauds (1, 2)

### A1. Inventaire des étendues de source

`addNode` ne reçoit la déclaration (`source`) que sur une partie de ses 31 appels
([dependency-graph.ts:5720](../../../libs/dev-tools/src/scripts/dependency-graph.ts)).

- Compter, sur les graphes de `apps/demo`, `apps/demo-effect` et
  `apps/demo-with-server-function`, les nœuds avec `endLine` par `kind`.
- Passer `source` aux appels qui ont la déclaration en main et ne la
  transmettent pas.
- Consigner dans ce plan les types de nœuds qui resteront sans étendue.

### A2. Calcul des métriques

- Nouveau module `libs/dev-tools/src/scripts/graph-metrics.ts` :
  - `cyclomaticDecisionPoints(source: Node): readonly number[]` : positions des
    `if`, `?:`, `case`, `for`/`for…of`/`for…in`, `while`, `do`, `catch`, `&&`,
    `||`, `??` ;
  - type `DependencyGraphNodeMetrics` :
    `{ cyclomaticOwn; cyclomaticTotal; lines; fanIn; fanOut; coverage? }`.
- Dans `addNode`, conserver les positions de points de décision et `lines`
  (`endLine - line + 1`) à côté de `sourceHash`.
- Passe finale dans `analyzeDependencyGraph` (après fusion des collecteurs) :
  - attribution de chaque point de décision au nœud le plus interne ;
  - `cyclomaticTotal` via la fermeture `contains` ;
  - `fanIn` / `fanOut` sur une constante `COUPLING_EDGES` (arêtes de dépendance
    de `PRODUCES_FORWARD` et `PRODUCES_BACKWARD` de
    [code-slice.ts:38](../../../libs/dev-tools/src/scripts/code-slice.ts), sans
    `contains`) ;
  - diagnostic `CRAFT_GRAPH_METRICS_UNKNOWN` pour les nœuds sans étendue.

### A3. Points chauds et god nodes

Dans `graph-metrics.ts` :

- `godNodes(graph, { limit })` : tri par `fanIn` décroissant, puis par `id` ;
- `graphHotspots(graph, { churn?: ReadonlyMap<string, number>; limit })` :
  score = `cyclomaticTotal × (1 + fanIn) × (1 + churn)` ;
- lecture de la fréquence de modification (`git log --since … --name-only`)
  uniquement dans `craft-graph.ts`.

### A4. Seuils dans la suite `architecture/`

Dans `architecture-graph.ts`, sur le modèle de `pathBoundaryViolations` :

- `metricThresholdViolations(graph, { max: { cyclomaticOwn?, cyclomaticTotal?, fanIn?, fanOut?, lines? }, kinds?, allow? })` ;
- `assertMetricThresholds(graph, options)` ;
- export via le sous-chemin `@craft-ts/dev-tools/architecture-graph`.

**Tests** : `graph-metrics.spec.ts`, projet temporaire comme dans
[dependency-graph-extension.spec.ts](../../../libs/dev-tools/src/scripts/dependency-graph-extension.spec.ts).
Cas : chaque type de point de décision, attribution à une primitive imbriquée
dans un composant, fan-in / fan-out, nœud sans étendue (champ absent et
diagnostic), `graphHash` identique avant et après.

## Lot B — Rapport (3)

### B1. Violations sans exception

`assertDeclarativeArchitecture`
([architecture-graph.ts:3699](../../../libs/dev-tools/src/scripts/architecture-graph.ts))
collecte des messages en attrapant les erreurs de chaque `assert*`.

- Extraire `architectureViolations(graph, { target })` qui renvoie
  `{ rule: string; messages: string[] }[]`.
- `assertArchitecture` et `assertDeclarativeArchitecture` s'appuient dessus,
  sans changement de comportement.

### B2. Réutiliser les globs de chemins

Exporter `matchPathGlob`
([architecture-graph.ts:3778](../../../libs/dev-tools/src/scripts/architecture-graph.ts)).

### B3. Construction du rapport

Nouveau module `libs/dev-tools/src/scripts/graph-report.ts` :

- `graphReport(graph, { featureGlob?, churn?, limit? }): GraphReport`, avec les
  sections :
  - résumé : nombre de nœuds par `kind`, arêtes, diagnostics ;
  - god nodes et points chauds (lot A) ;
  - cycles : `dependencyCycleViolations` (:1745) ;
  - méthodes inutilisées : `unusedPrimitiveMethodViolations` (:1649) ;
  - arêtes entre features, si `featureGlob` est fourni (B2) ;
  - violations d'architecture (B1) ;
  - couverture par route, si le lot C est appliqué ;
  - nœuds publics non documentés, si le lot D est appliqué.
- `formatGraphReportMarkdown(report): string`.
- Tri stable partout, pour que deux rapports se comparent.

### B4. CLI

Dans [craft-graph.ts](../../../libs/dev-tools/src/bin/craft-graph.ts) et
`writeDependencyGraph` ([dependency-graph.ts:522](../../../libs/dev-tools/src/scripts/dependency-graph.ts)) :

- format `report` → `<out>.report.md` et `<out>.report.json` ; inclus dans `all` ;
- options `--feature-glob <glob>` et `--churn-since <date>` ;
- mise à jour de `printHelp`.

**Tests** : `graph-report.spec.ts` sur des graphes construits à la main (sans
ts-morph) ; instantané du Markdown.

## Lot C — Couverture par nœud et par route (8)

### C1. Application du rapport Istanbul

Nouveau module `libs/dev-tools/src/scripts/graph-coverage.ts` :

- `applyCoverage(graph, coverageFinal): DependencyGraph` : pour chaque fichier
  du rapport, attribuer chaque instruction (`statementMap` / `s`) au nœud le plus
  interne (décision 2) ; renseigner `metrics.coverage = { statements, covered }` ;
- fichier absent du rapport ou nœud sans étendue → pas de champ, diagnostic
  `CRAFT_GRAPH_COVERAGE_UNKNOWN`.

### C2. Agrégat par route

- `routeCoverage(graph)` : pour chaque route, `sliceOf(createSliceIndex(graph), routeId)`
  ([code-slice.ts:159](../../../libs/dev-tools/src/scripts/code-slice.ts), :240),
  puis somme des instructions propres des nœuds de la slice.
- Une route dont une partie de la slice est inconnue affiche la part connue
  **et** le nombre de nœuds inconnus.

### C3. CLI

`craft graph --coverage <coverage-final.json>` : enrichit le JSON, le rapport et
l'explorateur.

**Tests** : `graph-coverage.spec.ts` avec un `coverage-final.json` écrit à la
main ; cas des nœuds imbriqués, d'un fichier absent et d'une route à slice
partiellement inconnue.

## Lot D — Justifications et documentation (11)

### D1. JSDoc et commentaires de justification

- Champ optionnel `doc?: { summary?: string; tags?: Record<string, string[]>; rationale?: string[] }`
  sur `DependencyGraphNode`.
- Calculé dans `addNode` à partir de `source` : JSDoc de la déclaration ou de la
  `VariableStatement` englobante (cas `export const users = craftQuery(…)`) ;
  commentaires `// WHY:`, `// NOTE:`, `// HACK:` dans l'étendue.

### D2. Collecteur de pages Markdown (opt-in)

- `createMarkdownDocsCollector({ include: readonly string[] })`, exporté par
  `@craft-ts/dev-tools/dependency-graph`.
- Ajouts aux registres
  ([dependency-graph.ts:34](../../../libs/dev-tools/src/scripts/dependency-graph.ts), :90) :
  nœud `doc-page` (label = premier titre), arête `documents`.
- Une page documente un nœud quand elle cite son label en code inline
  (`` `UserService` ``) et que ce label désigne **un seul** nœud parmi
  `service`, `component`, `route`, `primitive`.
- Plusieurs correspondances → diagnostic `CRAFT_GRAPH_DOC_AMBIGUOUS`, aucune
  arête.

### D3. CLI et règle

- `craft graph --docs <glob>` (répétable).
- `undocumentedNodeViolations(graph, { kinds, requireDocPage? })` et
  `assertNodesDocumented` dans `architecture-graph.ts`.

**Tests** : projet temporaire avec JSDoc, commentaire `WHY`, pages Markdown dont
une ambiguë.

## Lot E — Explorateur HTML (10)

Dans `dependencyGraphToHtml`
([dependency-graph.ts:608](../../../libs/dev-tools/src/scripts/dependency-graph.ts)),
en gardant un fichier autonome, sans ressource externe :

- **E1. Panneau de détails** (`renderDetails`, :1178) : métriques propres et
  totales, couverture, résumé JSDoc, justifications, pages de doc liées.
  Les valeurs inconnues s'affichent « inconnu », jamais « 0 ».
- **E2. Carte de chaleur** : sélecteur dans la barre du haut (aucune /
  complexité / fan-in / couverture), qui colore les cartes de nœuds ; motif
  distinct pour « inconnu ».
- **E3. Recherche de chemin** : boutons « chemin depuis » / « chemin vers » dans
  les détails, parcours en largeur dans la page avec la même sémantique que
  `dependencyGraphPathsBetween` (:567), surlignage du chemin.
- **E4. Statistiques** (`renderStats`, :1201) : nombre de points chauds et de
  nœuds non couverts.

**Tests** : assertions sur le HTML généré dans `dependency-graph.spec.ts`
(données sérialisées, présence des contrôles) ; vérification visuelle dans le
navigateur sur le graphe de `apps/demo`.

## Lot F — MCP graphe pour les projets externes (7)

### F1. Package

`packages/graph-mcp`, structure copiée de `packages/log-mcp` :

- `package.json` : nom `@craft-ts/graph-mcp`, bin `craft-ts-graph-mcp`,
  dépendances `@modelcontextprotocol/sdk`, `zod`, `@craft-ts/dev-tools` ;
- `tsconfig.json` (NodeNext), `vitest.config.mts`, `README.md` ;
- `src/main.ts` (transport stdio, comme
  [log-mcp/src/main.ts](../../../packages/log-mcp/src/main.ts)).

### F2. Chargement du graphe

`src/graph-store.ts` :

- configuration par variables d'environnement :
  - `CRAFT_GRAPH_ROOT` (défaut : `cwd`) ;
  - `CRAFT_GRAPH_TSCONFIG` (défaut : premier trouvé parmi `tsconfig.graph.json`,
    `tsconfig.app.json`, `tsconfig.json`) ;
  - `CRAFT_GRAPH_FILE` (défaut : `craft-dependency-graph.json`) ;
  - `CRAFT_GRAPH_COVERAGE`, `CRAFT_GRAPH_DOCS` ;
- lit le JSON s'il existe, sinon construit le graphe avec
  `analyzeDependencyGraph`, puis applique couverture et docs ;
- cache en mémoire ;
- indicateur minimal de péremption : date du JSON antérieure au fichier source
  le plus récent du programme → `stale: true` dans chaque réponse. (La gestion
  complète de la fraîcheur — manifeste, `--watch`, hooks — reste hors périmètre.)

### F3. Outils

`src/mcp-server.ts`, tous en `readOnlyHint` sauf `graph.rebuild` :

| Outil | Entrée | Réponse | Brique réutilisée |
|---|---|---|---|
| `graph.status` | — | chemin, date, `stale`, comptes, diagnostics | — |
| `graph.rebuild` | — | comptes après reconstruction | `analyzeDependencyGraph` |
| `graph.search` | `text`, `kind?`, `limit?` | nœuds correspondants | — |
| `graph.node` | `id` ou `label` + `kind`, `includeSource?` | nœud, métriques, doc, arêtes entrantes et sortantes avec preuves, extrait de code | `line` / `endLine` |
| `graph.neighbors` | `id`, `depth ≤ 3`, `edgeKinds?`, `direction?` | sous-graphe | — |
| `graph.path` | `from`, `to`, `maxDepth?` | chemins | `dependencyGraphPathsBetween` |
| `graph.impact` | `id` | nœuds dont la slice contient `id` | nouvelle `impactOf` dans `code-slice.ts` (fermeture inverse) |
| `graph.hotspots` | `limit?` | points chauds et god nodes | lot A |
| `graph.report` | `featureGlob?` | rapport JSON | lot B |
| `graph.violations` | `target?` | violations par règle | `architectureViolations` (B1) |

Toutes les listes acceptent `limit` et signalent `truncated`.

### F4. Release

Déclarer le package comme `@craft-ts/log-mcp` :

- [tools/release.mjs](../../../tools/release.mjs) (liste vers la ligne 109) et
  `tools/release.test.mjs` ;
- tableau de [RELEASING.md](../../../RELEASING.md) (ligne 23) ;
- projets de release dans [nx.json](../../../nx.json) (ligne 92) ;
- script `graph:mcp` dans le `package.json` racine.

### F5. Projets générés et projets existants

Dans [create-project.ts](../../../libs/dev-tools/src/scripts/create/create-project.ts) :

- dépendance `@craft-ts/graph-mcp` (vers la ligne 446) ;
- script `graph:mcp` (vers la ligne 389) ;
- entrée `"craft-ts-graph": { "command": "npx", "args": ["craft-ts-graph-mcp"] }`
  dans `.mcp.json` (vers la ligne 2920) ;
- textes du README généré (lignes 167 et 3038) ;
- `create-project.spec.ts`.

Pour un projet existant : extrait `.mcp.json` à copier, documenté au lot G.

### F6. Skill agent

`.agents/skills/craft-ts-graph-mcp/SKILL.md`, sur le modèle de
`.agents/skills/craft-ts-logs-mcp/` : quand interroger le graphe, quels outils
enchaîner (`graph.status` → `graph.node` → `graph.impact`), comment traiter
`stale`.

**Tests** :

- `mcp-server.spec.ts` avec `InMemoryTransport`, comme
  [log-mcp/src/mcp-server.spec.ts](../../../packages/log-mcp/src/mcp-server.spec.ts),
  sur un graphe JSON de fixture ;
- `graph-store.spec.ts` sur un projet temporaire (construction, lecture du JSON,
  détection `stale`) ;
- `code-slice.spec.ts` : cas de `impactOf`.

## Lot G — Documentation

La documentation du site est en anglais.

- [architecture.md](../../../apps/docs/guide/testing/architecture.md) : section
  « Metric thresholds » (`assertMetricThresholds`, `assertNodesDocumented`).
- Nouvelle page `apps/docs/guide/testing/graph-insights.md` : métriques, points
  chauds, rapport, couverture par route, collecteur de docs, explorateur ; entrée
  dans la barre latérale de `apps/docs/.vitepress/config.mts` à côté de
  « Extensible architecture graph ».
- [extensible-architecture-graph.md](../../../apps/docs/guide/testing/extensible-architecture-graph.md),
  section « Rendering and JSON compatibility » : champs optionnels `metrics` et
  `doc`, types `doc-page` et `documents`.
- [mcp-tools.md](../../../apps/docs/guide/ai/mcp-tools.md) : section
  « Graph MCP: `@craft-ts/graph-mcp` », extrait `.mcp.json` pour un projet
  existant, mise à jour de « Which server should an agent use? » ;
  `apps/docs/tests/ai-agents-docs.spec.ts`.
- L'index `packages/mcp/content/docs-index.json` est régénéré par le build de
  `packages/mcp`.

## Ordre et dépendances

```text
A1 → A2 → A3 → A4
      │
      ├──→ B1 → B2 → B3 → B4
      │               │
      ├──→ C1 → C2 → C3 ───┐
      │                    │
      └──→ D1 → D2 → D3 ───┤
                           ▼
                  E (explorateur)

B ──→ F (MCP) ──→ ajout couverture / docs quand C et D sont livrés
G avance avec chaque lot
```

Ordre proposé : **A → B → F → C → D → E**, la documentation (G) au fil de l'eau.
Le MCP arrive tôt parce que c'est la fonctionnalité la plus utile aux agents.

## Vérification

Vitest exige Node 22 dans ce dépôt (Node 20 actuellement installé).

1. **Tests unitaires** : suites Vitest de `libs/dev-tools`
   (`libs/dev-tools/vitest.config.mts`) et de `packages/graph-mcp`.
2. **Non-régression** :
   - suites `architecture/` des apps (`apps/quickstart-effect`,
     `apps/demo-with-server-function`) inchangées ;
   - `graphHash` identique avant et après sur les graphes des apps de démo.
3. **Bout en bout dans le dépôt** :
   - `node tools/update-graph.mjs` (rebuild dev-tools et graphes des trois apps
     en `--format all`) ;
   - lire `craft-dependency-graph.report.md` : points chauds et cycles plausibles ;
   - `vitest run --coverage --coverage.reporter=json` sur `apps/demo`, puis
     `craft graph --coverage coverage/coverage-final.json` : couverture par route
     présente ;
   - ouvrir `craft-dependency-graph.html` dans le navigateur : carte de chaleur,
     recherche de chemin, panneau de détails.
4. **Projet externe** :
   - `craft create` dans un dossier temporaire, avec les tarballs locaux
     (`npm pack`) de `@craft-ts/dev-tools` et `@craft-ts/graph-mcp` ;
   - vérifier que `.mcp.json` contient `craft-ts-graph` ;
   - lancer `npx craft-ts-graph-mcp` avec un petit client stdio
     (`@modelcontextprotocol/sdk`) et appeler `graph.status`, `graph.node`,
     `graph.path`, `graph.impact`, `graph.violations` ;
   - modifier un fichier source : `graph.status` passe à `stale: true`, puis
     `graph.rebuild` le remet à `false`.
5. **Documentation** : `apps/docs/tests/ai-agents-docs.spec.ts` et build du site.

## Hors périmètre

- Diff de graphe entre commits et quality gate sur le nouveau code.
- Gestion complète de la fraîcheur : manifeste de hash, `craft graph --check`,
  `--watch`, hooks git (seul l'indicateur `stale` du MCP est prévu).
- Commentaires automatiques sur les PR.
- Règles génériques, duplication, secrets, dépendances vulnérables : à déléguer
  (`eslint-plugin-sonarjs`, jscpd, gitleaks, `npm audit` / OSV-Scanner).
- Extraction par LLM, regroupement en communautés, multi-langages, images et PDF.

## Questions ouvertes

- Formule des points chauds : garder `cyclomaticTotal × (1 + fanIn) × (1 + churn)`
  ou pondérer par la couverture quand elle est connue ?
- `graph.rebuild` doit-il être désactivable (variable d'environnement) pour les
  usages en CI où le MCP ne doit que lire ?
- Faut-il ajouter `graph:report` aux scripts des projets générés par
  `craft create` ?
