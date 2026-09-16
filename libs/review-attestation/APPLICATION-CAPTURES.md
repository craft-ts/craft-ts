# Application overview captures

`defineReviewAttestConfig` enables **Aperçu de l’application** alongside template
obligations and component matrices. Its contract is page × scenario × capture
point × viewport. A screenshot decision never accepts a template obligation.

## Declare a page

Keep fixtures and recipes in dedicated, imported modules. Source paths are
relative to the repository root passed to the producer and CLI.

```ts
// orders.mocks.ts
import { defineVisualHttpMocks } from '@craft-ts/style-testing';
export const ordersMocks = defineVisualHttpMocks('src/orders.mocks.ts', [
  {
    method: 'GET',
    url: '/api/orders',
    mode: 'mock',
    response: { kind: 'success', body: [{ id: '42' }] },
  },
  {
    method: 'DELETE',
    url: '/api/orders/*',
    mode: 'unused',
    reason: 'This scenario only reads orders',
  },
]);
```

```ts
// review-attest.config.ts
import { defineReviewAttestConfig } from '@craft-ts/style-testing';
import { ordersMocks } from './src/orders.mocks';
export default defineReviewAttestConfig({
  template: true,
  visual: {
    app: {
      sourceFiles: ['src/styles.css'],
      environment: 'chromium-ci-linux-v1',
      comparison: { threshold: 0.1, maxDiffPixels: 10 },
      pages: [
        {
          id: 'orders',
          route: '/orders',
          url: '/orders',
          component: 'component:src/orders.ts:Orders',
          scenarios: [
            {
              id: 'list',
              label: 'Orders',
              category: 'happy-path',
              mocks: ordersMocks,
              steps: [
                {
                  action: 'capture',
                  id: 'list',
                  expect: [
                    { kind: 'visible', target: { name: 'OrdersList' } },
                    { kind: 'count', target: { name: 'OrderRow' }, count: 1 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    matrices: [],
  },
});
```

Absent `viewports` means mobile 390×844, tablet 834×1112, desktop 1440×1000 and
wide 2560×1440. An explicit nonempty record replaces that whole list; names
are arbitrary and dimensions must be positive integers. Order is preserved.
Filters in the review application only change what is displayed.

Actions: `navigate`, `click`, `fill`, `select`, `press`, `scroll`, `wait`,
`capture`. Controls use `data-craft-name`; `context: { name, text }` narrows a
repeated control. Capture expectations assert visibility, text, count or URL.
Declare modal components in `scenario.modals` and add capture steps with their
`modal` id and a visibility expectation. Use bounded scroll steps for lazy
images, internal scroll areas and virtualized lists.

## Typed fixtures and exceptions

`defineRouteVisualHttpMocks(source, mockHttpRequestForRoute(...))` adapts the
existing typed HTTP helper, preserving its checks for successful, binary and
business exception responses. Its `unusedOrThrow` entries become `unused`;
`ignore` is refused. `defineVisualHttpMocks(source, endpoints, ...shared)`
composes fixture sets. Overlapping request matches fail: use a single
`sequence: [response1, response2]` for successive calls. Sequences fail when
exhausted. Matching includes method, absolute origin if supplied, path (`*`
for a dynamic segment), query, request headers and request body.

Exception scenarios must declare `exception: { endpoint, discriminant, expect }`
and an exception response with `kind: 'exception'` and `exception: 'TAG'`.
CraftHttpClient reports its actual resolved business exception to the isolated
capture observer. Other clients can dispatch `craft:visual-exception` with
`{ endpoint, discriminant }` from their real error-handling branch. Both mock
consumption and the runtime exception are checked, followed by the declared UI
expectations. A status code or scenario label alone is insufficient.

Architecture checks follow page, shared component and declared modal
connections. They require per-scenario endpoint treatment, successful catalogue
responses, imported fixture exports, happy paths and exception coverage.
Unresolved HTTP contracts produce a blocking diagnostic. Add `httpContracts`
entries keyed by the reported repository `file:line` when a dynamic call cannot
be resolved statically, with its `method`, `url` and `exceptions` discriminants.

## Generate

```ts
import { captureVisualApp } from '@craft-ts/style-testing/visual-app/playwright';
await captureVisualApp({
  browser,
  config: config.visual.app,
  baseURL: 'http://127.0.0.1:4200',
  rootDir: process.cwd(),
  tsconfigPath: 'tsconfig.app.json',
  reportPath: '.craft/runs/application.json',
  // additionalCaptures: existingMatrixCaptures,
});
```

Use Chromium and pin the browser, OS and fonts in CI. The adapter creates an
isolated context for every scenario/viewport, blocks service workers and
unsupported external mechanisms, installs HTTP mocks before navigation,
freezes time and randomness, removes motion/carets and waits for two identical
full-page screenshots. Stability timeout defaults to 10 seconds. External
rendering assets need local fixture bytes; undeclared application requests and
resource redirects fail. Sources, imported fixtures, recipe, viewport,
comparison policy, global `sourceFiles` and package lock contribute to freshness.
List shared shell components in `page.dependencies`.

PNG, digest and frozen HTML are written into a unique batch directory. Only a
fully successful batch replaces the report. Failure writes a sibling
`<report>.failure.json` and preserves the last successful report and artifacts.

## Review and references

The version 2 report carries screenshot evidence and capture provenance. CLI
status recomputes source provenance before admitting a capture and counts
missing expected captures. Rejected, stale or failed captures cannot acquire
an automatic acceptance. Historical version 1 reports retain digest semantics.

Comparison runs on the server with `pixelmatch` and `pngjs`, using threshold
0.1 and at most 10 differing pixels by default. Different dimensions always
require review. The current PNG, accepted reference and diff have independent
content addresses. A tolerated capture can retain its verdict, but its human
reference remains fixed. Changing comparison policy or capture environment
requires review. Screenshot review is the normal mode, not a degraded replay.

The overview lists page progress, defaults to happy paths, and offers category,
page, scenario, viewport and state filters. Global counts include hidden
exceptions and missing captures. Select captures explicitly, enter a comment,
and accept or reject them. Batch actions operate on the visible selection;
each viewport gets its own decision. Use the existing regeneration action to
rerun the producer.

Legacy `defineHappyPathHttpMocks`, `defineRouteHappyPathHttpMocks` and
`visualAppHappyPaths` remain adapters. Migrate pages to `scenarios` to use the
new screenshot subjects, which are separate from historical happy-path ids.
Automatic inference of fixtures from template branches is outside this version.

The demo fixtures keep Chivo fonts locally in `apps/demo/e2e/fixtures` with their
SIL Open Font License. They explicitly replace the Google stylesheet, the Vite
hot reload client, the development type-check indicator response and the MCP
instrumentation module. Application transport remains subject to strict matching.
