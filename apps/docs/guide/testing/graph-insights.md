# Graph insights

The dependency graph behind the [architecture rules](/guide/testing/architecture)
also measures what it models. Complexity, size and coupling are attached to the
nodes a CraftTS developer reasons about — a route, a service, a primitive —
rather than to files, and they feed a report, metric thresholds and the
[graph MCP server](/guide/ai/mcp-tools#graph-mcp-craft-ts-graph-mcp).

Everything is computed statically and deterministically from the TypeScript
program. Nothing is sampled at runtime and nothing is guessed.

## Metrics

Each node carries a `metrics` field:

| Metric            | Meaning                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `cyclomaticOwn`   | `1 +` the decision points of the node itself                                               |
| `cyclomaticTotal` | `1 +` the decision points of the node and of everything it `contains`                      |
| `lines`           | Lines of the declaration                                                                   |
| `fanIn`           | Distinct nodes that depend on it (`loads`, `renders`, `depends-on`, `calls`, `reads`…)     |
| `fanOut`          | Distinct nodes it depends on                                                               |

Decision points are `if`, `?:`, `case`, `for`, `for…of`, `for…in`, `while`,
`do`, `catch`, `&&`, `||` and `??`. Each one is credited to the **innermost**
node whose source contains it. A `craftComputed` declared inside a component
keeps its own branches; the component counts them only in its total. Nothing is
counted twice.

`contains` is structure, not coupling: a service owning a primitive does not
raise its fan-out.

### Unknown is not zero

Some nodes have no source range of their own: an HTTP endpoint aggregates call
sites, a synthesised route check shares its alias, an Effect layer comes from a
separate collector. Those nodes have `fanIn` and `fanOut` but no complexity and
no line count — the fields are absent. The graph adds one
`CRAFT_GRAPH_METRICS_UNKNOWN` diagnostic per unmeasured kind, and every
consumer below leaves unknown values out instead of treating them as simple.

## God nodes and hotspots {#hotspots}

**God nodes** are the nodes most depended upon: highest `fanIn` first.

**Hotspots** combine complexity, centrality and change:

```text
score = cyclomaticTotal × (1 + fanIn) × (1 + churn)
```

`churn` is the number of commits touching the node's file since a date, read
from git. Without it, the score ranks complex central code. Template elements
are left out of the report rankings by default: an element's total includes
every element nested in it, so a single component's markup would fill the list.

```typescript
import { godNodes, graphHotspots } from '@craft-ts/dev-tools/graph-metrics';

graphHotspots(graph, { limit: 5, kinds: ['service', 'component'] });
```

## Report {#report}

```shell
npx craft graph \
  --project apps/shop/tsconfig.graph.json \
  --root . \
  --out craft-dependency-graph \
  --format report \
  --feature-glob 'apps/shop/src/features/:feature/**' \
  --churn-since '3 months ago'
```

`--format report` writes `craft-dependency-graph.report.md` and
`craft-dependency-graph.report.json`; `--format all` writes them next to the JSON
graph and the HTML explorer. The report contains:

- a summary: nodes and relations per kind, diagnostics per code;
- god nodes and hotspots;
- dependency cycles and unused primitive methods;
- relations between features, when `--feature-glob` names the feature with a
  `:name` capture;
- the violations of the rules `assertArchitecture` enforces, grouped by rule;
- coverage per route, when a coverage report is applied with `--coverage`;
- documentation per kind, when JSDoc or Markdown pages were collected.

Every section is sorted and every id is relative to the root, so two reports of
the same code are identical whatever the checkout path. Commit the Markdown file
if you want architecture changes to show up in review.

The same data is available in code:

```typescript
import { formatGraphReportMarkdown, graphReport } from '@craft-ts/dev-tools/graph-report';
import { architectureViolations } from '@craft-ts/dev-tools/architecture-graph';

const report = graphReport(graph, { featureGlob: 'src/features/:feature/**' });
const violations = architectureViolations(graph); // [{ rule, messages }]
```

## Coverage per node and per route

The graph reads test coverage; it does not produce it. Write an Istanbul report
with Vitest, then hand it to the graph:

```shell
npx vitest run --coverage --coverage.reporter=json
npx craft graph --project apps/shop/tsconfig.graph.json --root . \
  --format all --coverage coverage/coverage-final.json
```

Each statement is credited to the innermost node whose lines contain it, and
the node gets `metrics.coverage = { statements, covered }` for its own
statements. A route's coverage sums the nodes of its code slice — everything
that can change what it renders — without counting a statement twice.

Coverage is never guessed:

- a node without a line range, or in a file the report does not mention, has
  no `coverage` field. `CRAFT_GRAPH_COVERAGE_UNKNOWN` diagnostics count them per
  kind;
- a route lists how many nodes of its slice are unknown next to its percentage,
  which only describes the measured part.

```typescript
import { applyCoverage, routeCoverage } from '@craft-ts/dev-tools/graph-coverage';

const covered = applyCoverage(graph, JSON.parse(readFileSync(reportPath, 'utf8')));
routeCoverage(covered); // [{ label, statements, covered, unknownNodes, … }]
```

## Documentation

Each node carries a `doc` field when its declaration has something to say:

```typescript
/**
 * Loads and caches the signed-in user.
 * @remarks Shared by every page.
 */
export const { injectUserService } = craftService(/* … */, function* () {
  // WHY: the session expires silently, so reload on focus.
  const user = yield* query(/* … */);
});
```

- `summary` and `tags` come from the JSDoc of the declaration, or of the
  statement around it (`export const x = craftQuery(…)`).
- `rationale` collects the `// WHY:`, `// NOTE:` and `// HACK:` comments, each
  credited to the innermost node that contains it: the comment above `user`
  belongs to the query, not to the service.

Markdown pages join the graph through an opt-in collector, from the CLI with
`--docs 'docs/**/*.md'` (repeatable) or in code with
`createMarkdownDocsCollector({ include })`. Each page becomes a `doc-page` node
labelled by its first heading. A page `documents` a node when it cites the
node's label in inline code — `` `UserService` `` — and that label names exactly
one route, component, service or primitive. A label shared by several nodes
produces a `markdown-docs/CRAFT_GRAPH_DOC_AMBIGUOUS` diagnostic and no relation.
Fenced code blocks are ignored.

See [Documentation rules](/guide/testing/architecture#documentation-rules) to
require them.

## Thresholds

Metrics become rules with `assertMetricThresholds`, opt-in and scoped by kind.
See [Metric thresholds](/guide/testing/architecture/metric-thresholds) for
before-and-after examples.

## Explorer

`craft graph --format html` (or `all`) writes a self-contained explorer. On top
of the route view it shows:

- in the details panel, the node's metrics, coverage, JSDoc, justification
  comments and the pages that document it — unknown values read "inconnu",
  never `0`;
- a heat map selector (complexity, fan-in, coverage) that colours the node
  cards, with a striped pattern for unknown values;
- "path from" and "path to" buttons that highlight the shortest chain of
  relations between two nodes, following their direction;
- the ten hotspots in the sidebar, and their count next to the uncovered nodes
  in the header.

## Agents

`@craft-ts/graph-mcp` exposes the graph, the metrics, the report and the impact
of a change to an AI agent working in your project. See
[MCP tools](/guide/ai/mcp-tools#graph-mcp-craft-ts-graph-mcp).
