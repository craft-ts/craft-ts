# Folder layout organizer

`craft organize` analyzes a fresh Craft dependency graph and proposes a folder
layout. It does not move files. The default placement follows route ownership
and application-shell reachability; project-specific rules can add known
architectural constraints without changing those defaults for other projects.

## Tune an organizer run

The programmatic entry point is `organizeProject`, exported by
`@craft-ts/dev-tools` and `@craft-ts/dev-tools/folder-layout`:

```ts
import { organizeProject } from '@craft-ts/dev-tools/folder-layout';

organizeProject({
  project: 'apps/shop/tsconfig.graph.json',
  graph: 'craft-dependency-graph.json',
  out: 'apps/shop/folder-layout',
  weights: { calls: 4 },
  thresholds: { maxDepth: 2 },
  placementRules: [
    {
      id: 'app-start-services',
      when: {
        nodeKind: 'service',
        nodeDetails: { appStart: true },
      },
      scope: 'core',
      folder: 'core/app-start',
      reason: 'Runs during application bootstrap.',
    },
  ],
});
```

`weights` adjusts the relative influence of graph relations. `thresholds`
controls the maximum proposed feature depth and the fan-in/fan-out values that
mark hubs. Omitted values keep their defaults.

## Keep project rules in JSON

The CLI accepts the same `weights`, `thresholds`, and `placementRules` in a
JSON file passed with `--config`:

```json
{
  "placementRules": [
    {
      "id": "app-start-services",
      "when": {
        "nodeKind": "service",
        "nodeDetails": { "appStart": true }
      },
      "scope": "core",
      "folder": "core/app-start",
      "reason": "Runs during application bootstrap."
    }
  ]
}
```

```bash
craft organize \
  --project apps/shop/tsconfig.graph.json \
  --graph craft-dependency-graph.json \
  --config apps/shop/organizer.config.json \
  --out apps/shop/folder-layout
```

The organizer evaluates rules in array order, before its default ownership
classification. A rule matches a file when at least one Craft graph node in
that file has the selected `nodeKind` and all selected `nodeDetails` values.
The first matching rule sets the file's scope and destination. `folder` is
relative to the organizer's target root, which defaults to the app's `src/`
folder when present.

Rules need a unique `id`, a `nodeKind`, optional `nodeDetails`, a scope
(`feature-local`, `parent-shared`, `global-shared`, `core`, or `unresolved`), a
safe relative `folder`, and a human-readable `reason`. In TypeScript,
`nodeKind` narrows `nodeDetails`; for `service`, keys and values are checked
against the service metadata (`appStart` and `browserBoundary` are booleans).
The JSON CLI validates known service detail keys and value types at runtime.
The reason appears with the file's proposal. Resolved rules are written to
`folder-layout-analysis.json` and contribute to the proposal's `configHash`, so
changing policy produces a distinct review artifact. A matching explicit rule
has confidence `1`; destination collisions still require review.

### File-level behavior

The organizer proposes moves for whole files. If one service in a file matches
a rule, the entire file receives that placement. Keep declarations with
different folder policies in separate files. If several rules match a file,
the first rule wins; put narrower matchers first.

## Demo policy: app-start services

The dependency graph records `appStart: true` on Craft service nodes. The demo
uses that fact in `apps/demo/organizer.config.json` to place matching source
files under `src/core/app-start/`. This policy is passed only by the demo's
`attest:demo:folder-layout` command, so it does not change the organizer's
defaults for other applications.

To regenerate the proposal:

```bash
npm run attest:demo:folder-layout
```

The command refreshes the read-only analysis and proposal artifacts. Apply a
proposal separately with `craft organize apply` after reviewing it.
