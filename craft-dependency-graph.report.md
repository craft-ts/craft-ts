# Craft graph report

Graph `f88fd7ef32285dd5`: 1827 nodes, 2356 relations.

## Summary

| Node kind | Count |
| --- | --- |
| app-config | 1 |
| component | 79 |
| effect-operation | 1 |
| effect-service | 1 |
| http-endpoint | 2 |
| primitive | 224 |
| property | 257 |
| route | 88 |
| route-check | 183 |
| route-hook | 7 |
| service | 140 |
| source | 13 |
| styled-element | 681 |
| template-element | 138 |
| unique | 12 |

| Relation kind | Count |
| --- | --- |
| calls | 85 |
| checks | 185 |
| contains | 1405 |
| depends-on | 187 |
| loads | 92 |
| provides | 10 |
| reads | 1 |
| renders | 87 |
| requires-service | 1 |
| styled-by | 32 |
| triggers | 14 |
| uses-property | 257 |

### Diagnostics

| Code | Count |
| --- | --- |
| CRAFT_GRAPH_METRICS_UNKNOWN | 7 |
| styled-element-class-unresolved | 290 |

## God nodes

The nodes most depended upon (distinct incoming coupling relations).

| Node | Kind | Fan-in | Fan-out | Location |
| --- | --- | --- | --- | --- |
| StatusComponent | component | 29 | 1 | apps/demo/src/app/ui/status.component.ts:29 |
| CssVarsPageNav | component | 10 | 0 | apps/demo/src/app/examples/component/css-vars-demo.shared.ts:12 |
| state:searchInput | primitive | 5 | 0 | apps/demo/src/app/examples/primitives/debounced-web-search/debounced-web-search.ts:150 |
| User | service | 5 | 1 | apps/demo/src/app/examples/craft-service/craft-service-user-detail.ts:51 |
| TokenCard | component | 4 | 0 | apps/demo/src/app/examples/component/css-vars-required-demo.ts:13 |
| CraftRouterOutlet | component | 4 | 0 | libs/component/src/lib/craft-router-outlet.ts:20 |
| query:user | primitive | 4 | 3 | apps/demo/src/app/examples/craft/mutation/mutation.ts:44 |
| query:todos | primitive | 4 | 0 | apps/demo/src/app/examples/playground/playground.ts:139 |
| User.value | property | 4 | 0 | apps/demo/src/app/examples/craft-service/craft-service-user-detail.ts:51 |
| UserMutation | service | 4 | 1 | apps/demo/src/app/examples/craft/mutation/mutation.ts:31 |

## Hotspots

Score = total complexity × (1 + fan-in) × (1 + churn). Churn was not measured: pass `--churn-since` to weigh recent changes. Nodes of unknown complexity are left out.

| Node | Kind | Score | Complexity | Fan-in | Churn | Location |
| --- | --- | --- | --- | --- | --- | --- |
| AiSendContextChat | component | 62 | 62 | 0 | — | libs/component/src/lib/ai/ai-send-context-chat.ts:161 |
| ProfileEditorStateMachine | component | 54 | 18 | 2 | — | apps/demo/src/app/examples/primitives/state-machine/profile-editor.ts:62 |
| query:openLibrarySearch | primitive | 40 | 10 | 3 | — | apps/demo/src/app/examples/primitives/debounced-web-search/debounced-web-search.ts:193 |
| DebouncedWebSearch | component | 39 | 13 | 2 | — | apps/demo/src/app/examples/primitives/debounced-web-search/debounced-web-search.ts:146 |
| craftStateMachine:profileEditor | primitive | 36 | 18 | 1 | — | apps/demo/src/app/examples/primitives/state-machine/profile-editor.ts:68 |
| StatusComponent | component | 30 | 1 | 29 | — | apps/demo/src/app/ui/status.component.ts:29 |
| ExceptionsComponent | component | 24 | 8 | 2 | — | apps/demo/src/app/examples/primitives/exceptions/exceptions.ts:22 |
| PixelArtMatrix | component | 24 | 8 | 2 | — | apps/demo/src/app/examples/primitives/pixel-art-matrix/pixel-art-matrix.ts:39 |
| query:userQuery | primitive | 24 | 8 | 2 | — | apps/demo/src/app/examples/primitives/exceptions/exceptions.ts:79 |
| ApiService | service | 20 | 5 | 3 | — | apps/demo/src/app/examples/craft/granular-mutation/api.service.ts:14 |

## Dependency cycles

_None._

## Unused primitive methods

_None._

## Documentation

JSDoc summaries and Markdown pages citing each node. Unmeasured nodes have no source range: their documentation is unknown.

| Kind | Nodes | With JSDoc | Cited by a page | Unmeasured |
| --- | --- | --- | --- | --- |
| service | 140 | 25 | 0 | 1 |
| component | 79 | 15 | 0 | 0 |
| route | 88 | 0 | 0 | 0 |
| primitive | 224 | 0 | 0 | 0 |

## Architecture violations

### mutation-react-on

- Mutation addTodo has no query reacting to it (apps/demo/src/app/examples/primitives/full-demo/full-demo.ts:65).
- Mutation issue has no query reacting to it (apps/demo/src/app/examples/component/pending-node-exception-demo.ts:81).
- Mutation removeTodo has no query reacting to it (apps/demo/src/app/examples/primitives/full-demo/full-demo.ts:74).
- Mutation sendContextToAi has no query reacting to it (libs/component/src/lib/ai/ai-send-context-chat.ts:505).
- Mutation submitted has no query reacting to it (apps/demo/src/app/examples/primitives/forms/login-form.ts:45).
