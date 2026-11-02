# Folder layout

Every file of a CraftTS app has one folder it belongs in, and that folder is
computed from the app's imports — not from file names, and not from where the
file sits today. `craft organize` proposes the moves; two baseline architecture
rules, `folder-layout-placement` and `folder-layout-layers`, keep the result in
place.

## The rule

A folder is chosen along two axes.

**Scope — who uses the file.** The app shell and every module loaded by a
`loadChildren` are *zones*. A zone reaches what its entry imports, statically
or through a `loadComponent`, without crossing into another zone. `main.ts` is
the shell's entry; a routes module is its feature's entry, named after the file
(`sessions.routes.ts` → `sessions`). Zones nest the way `loadChildren` calls
nest.

| Zones that reach the file                    | Folder                                        |
| -------------------------------------------- | --------------------------------------------- |
| the shell only                               | `app/`                                        |
| one feature only                             | `features/<feature>/` (`features/<parent>/<child>/` when nested) |
| several zones whose closest common zone is a feature | `features/<feature>/shared/<layer>/`  |
| several zones whose closest common zone is the shell | `shared/<layer>/`                     |

`main.ts` stays where the bundler expects it. A file no entry reaches is
reported, and `craft organize` proposes deleting it.

**Layer — what the file is.** Its Craft nodes decide, in this order:

| Layer         | The file declares                                               |
| ------------- | --------------------------------------------------------------- |
| `wiring`      | a route, a route hook or check, an app config — or it is a zone entry |
| `ui`          | a component or template element, or it is a `*.style.ts` file   |
| `data-access` | an HTTP endpoint or a server-function client                    |
| `state`       | a service, a primitive, a source or a property                  |
| `util`        | none of the above: types and pure functions                     |

Imports point down: `ui` → `state` → `data-access` → `util`. A file may import
its own layer or a layer below. `wiring` is exempt both ways, and `import type`
carries no dependency.

**Groups.** Inside a zone's own folder, a file one level below the zone's pages
that is the only way to reach at least three files (itself included) takes them
into a sub-folder named after it, without the zone prefix: in the `replay`
zone, `replay-stage.ts` and the timeline and thumbnails only it reaches go to
`features/replay/stage/`. Only one such level is created.

Two consequences follow from the rule itself:

- a feature never imports another feature's own file — such a file would be
  reached by two zones, so it would be shared;
- `shared/` never imports a feature's own file, for the same reason.

So the placement rule also enforces the boundaries between features.

## Propose the moves

```bash
craft organize \
  --project apps/shop/tsconfig.graph.json \
  --graph craft-dependency-graph.json \
  --out apps/shop/folder-layout
```

The command refuses an obsolete or invalid graph and never rebuilds it or moves
files. It writes `folder-layout-analysis.json` (zones, layer violations, file
metrics), `folder-layout-proposal.json` (one placement per file) and
`FOLDER_LAYOUT_REPORT.md`. `--target-root` places the proposed tree under
another folder than the project's `src/`.

Apply a reviewed proposal with `craft organize apply`: it runs `git mv` for each
move and rewrites the relative imports of every file in the project.

## Keep the layout with architecture rules

`assertDeclarativeArchitecture` runs both rules:

- `folder-layout-placement` reports each file that is not in its folder, and
  each file no entry reaches;
- `folder-layout-layers` reports each import that points up the layers.

They **warn by default**, so an app written before the rule keeps passing.
Once an app is reorganized, raise them in its architecture test:

```typescript
assertDeclarativeArchitecture(graph.graph, {
  waivers: architectureWaiverList,
  severity: {
    'folder-layout-placement': 'error',
    'folder-layout-layers': 'error',
  },
});
```

Both rules name a `file:<path>` target, so a deliberate exception is waived per
file, with its reason:

```typescript
{
  rule: 'folder-layout-layers',
  target: 'file:apps/shop/src/shared/util/labels.ts',
  reason: 'Labels read the cart state; they move to craftComputed values next.',
}
```

## Tune an organizer run

The programmatic entry point is `organizeProject`, exported by
`@craft-ts/dev-tools` and `@craft-ts/dev-tools/folder-layout`. The layout itself
is `computeFolderLayout`, which the architecture rules call too.

```ts
import { organizeProject } from '@craft-ts/dev-tools/folder-layout';

organizeProject({
  project: 'apps/shop/tsconfig.graph.json',
  graph: 'craft-dependency-graph.json',
  out: 'apps/shop/folder-layout',
  thresholds: { groupMinFiles: 4 },
  placementRules: [
    {
      id: 'app-start-services',
      when: {
        nodeKind: 'service',
        nodeDetails: { appStart: true },
      },
      scope: 'core',
      folder: 'app/app-start',
      reason: 'Runs during application bootstrap.',
    },
  ],
});
```

`thresholds.groupMinFiles` is the number of files a group needs (3 by default);
`hubFanIn` and `hubFanOut` mark hubs in the report. `weights` only rank the
related files listed with each placement.

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
      "folder": "app/app-start",
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

The organizer evaluates rules in array order, before the computed layout. A
rule matches a file when at least one Craft graph node in that file has the
selected `nodeKind` and all selected `nodeDetails` values. The first matching
rule sets the file's scope and destination. `folder` is relative to the
organizer's target root, which defaults to the app's `src/` folder when
present.

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

A placement rule only changes what `craft organize` proposes. The
`folder-layout-placement` rule checks the computed layout, so a file a
placement rule moves elsewhere needs a waiver.

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
