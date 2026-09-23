# Craft graph report

Graph `e83cff16dff2d0dd`: 675 nodes, 646 relations.

## Summary

| Node kind | Count |
| --- | --- |
| app-config | 1 |
| client-function-middleware | 3 |
| component | 14 |
| data-classification | 1 |
| effect-layer | 1 |
| effect-operation | 6 |
| effect-service | 4 |
| external-output | 4 |
| handshake | 4 |
| http-endpoint | 1 |
| primitive | 65 |
| property | 40 |
| route | 9 |
| route-check | 19 |
| server-function-client | 5 |
| server-function-family | 5 |
| server-function-middleware | 5 |
| server-function-server | 5 |
| service | 109 |
| source | 3 |
| styled-element | 324 |
| template-element | 43 |
| unique | 4 |

| Relation kind | Count |
| --- | --- |
| calls | 12 |
| checks | 30 |
| contains | 491 |
| depends-on | 61 |
| exposes-data | 3 |
| loads | 5 |
| provided-by-layer | 1 |
| renders | 3 |
| requires-service | 7 |
| uses-property | 33 |

### Diagnostics

| Code | Count |
| --- | --- |
| CRAFT_GRAPH_METRICS_UNKNOWN | 9 |
| styled-element-class-unresolved | 221 |

## God nodes

The nodes most depended upon (distinct incoming coupling relations).

| Node | Kind | Fan-in | Fan-out | Location |
| --- | --- | --- | --- | --- |
| craftComputed:currentUser | primitive | 6 | 1 | apps/demo-with-server-function/src/client/server-function-demo.ts:131 |
| query:portableUsersQuery.value | property | 5 | 0 | apps/demo-with-server-function/src/client/portable-server-function-demo.ts:135 |
| UserRepository | effect-service | 3 | 0 | apps/demo-with-server-function/src/server/database.ts:9 |
| query:publicProductsQuery.status | property | 3 | 0 | apps/demo-with-server-function/src/client/public-products-demo.ts:114 |
| query:usersQuery.status | property | 3 | 0 | apps/demo-with-server-function/src/client/server-function-demo.ts:179 |
| CraftRouterOutlet | component | 2 | 0 | libs/component/src/lib/craft-router-outlet.ts:20 |
| CurrentUser | effect-service | 2 | 1 | apps/demo-with-server-function/src/shared/authenticated-user.ts:14 |
| state:effectMiddlewareFilter | primitive | 2 | 0 | apps/demo-with-server-function/src/client/effect-server-middleware-demo.ts:89 |
| craftComputed:effectMiddlewareServerError | primitive | 2 | 1 | apps/demo-with-server-function/src/client/effect-server-middleware-demo.ts:104 |
| state:portableSearchInput | primitive | 2 | 0 | apps/demo-with-server-function/src/client/portable-server-function-demo.ts:122 |

## Hotspots

Score = total complexity × (1 + fan-in) × (1 + churn). Churn was not measured: pass `--churn-since` to weigh recent changes. Nodes of unknown complexity are left out.

| Node | Kind | Score | Complexity | Fan-in | Churn | Location |
| --- | --- | --- | --- | --- | --- | --- |
| query:usersQuery | primitive | 63 | 21 | 2 | — | apps/demo-with-server-function/src/client/server-function-demo.ts:138 |
| AiSendContextChat | component | 62 | 62 | 0 | — | libs/component/src/lib/ai/ai-send-context-chat.ts:161 |
| ServerFunctionDemo | component | 48 | 24 | 1 | — | apps/demo-with-server-function/src/client/server-function-demo.ts:33 |
| query:usersQuery | primitive | 27 | 9 | 2 | — | apps/demo-with-server-function/src/client/simple-list-demo.ts:148 |
| PortableServerFunctionDemo | component | 20 | 10 | 1 | — | apps/demo-with-server-function/src/client/portable-server-function-demo.ts:26 |
| SimpleListDemo | component | 20 | 10 | 1 | — | apps/demo-with-server-function/src/client/simple-list-demo.ts:39 |
| PublicProductsDemo | component | 18 | 9 | 1 | — | apps/demo-with-server-function/src/client/public-products-demo.ts:27 |
| AiSendDialog | component | 17 | 17 | 0 | — | libs/component/src/lib/ai/ai-send-dialog.ts:158 |
| EffectServerMiddlewareDemo | component | 16 | 8 | 1 | — | apps/demo-with-server-function/src/client/effect-server-middleware-demo.ts:23 |
| craftComputed:requestDetail | primitive | 12 | 6 | 1 | — | apps/demo-with-server-function/src/client/server-function-demo.ts:198 |

## Dependency cycles

_None._

## Unused primitive methods

_None._

## Documentation

JSDoc summaries and Markdown pages citing each node. Unmeasured nodes have no source range: their documentation is unknown.

| Kind | Nodes | With JSDoc | Cited by a page | Unmeasured |
| --- | --- | --- | --- | --- |
| service | 109 | 24 | 0 | 4 |
| component | 14 | 7 | 0 | 0 |
| route | 9 | 0 | 0 | 0 |
| primitive | 65 | 0 | 0 | 0 |

## Architecture violations

### mutation-react-on

- Mutation sendContextToAi has no query reacting to it (libs/component/src/lib/ai/ai-send-context-chat.ts:505).
