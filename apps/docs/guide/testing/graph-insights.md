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
- the violations of the rules `assertArchitecture` enforces, grouped by rule.

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

## Thresholds

Metrics become rules with `assertMetricThresholds`, opt-in and scoped by kind.
See [Metric thresholds](/guide/testing/architecture#metric-thresholds).

## Agents

`@craft-ts/graph-mcp` exposes the graph, the metrics, the report and the impact
of a change to an AI agent working in your project. See
[MCP tools](/guide/ai/mcp-tools#graph-mcp-craft-ts-graph-mcp).
