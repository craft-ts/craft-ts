# Craft graph report

Graph `15eb5c3bafc8331b`: 549 nodes, 495 relations.

## Summary

| Node kind | Count |
| --- | --- |
| app-config | 1 |
| component | 15 |
| effect-layer | 7 |
| effect-operation | 11 |
| effect-service | 8 |
| http-endpoint | 1 |
| primitive | 58 |
| property | 36 |
| route | 7 |
| route-check | 21 |
| route-hook | 4 |
| service | 111 |
| source | 3 |
| styled-element | 225 |
| template-element | 41 |

| Relation kind | Count |
| --- | --- |
| calls | 12 |
| checks | 14 |
| contains | 371 |
| depends-on | 34 |
| loads | 7 |
| provided-by-layer | 6 |
| renders | 3 |
| requires-service | 12 |
| uses-property | 36 |

### Diagnostics

| Code | Count |
| --- | --- |
| CRAFT_GRAPH_METRICS_UNKNOWN | 5 |
| styled-element-class-unresolved | 149 |

## God nodes

The nodes most depended upon (distinct incoming coupling relations).

| Node | Kind | Fan-in | Fan-out | Location |
| --- | --- | --- | --- | --- |
| TodoStore | effect-service | 4 | 1 | apps/demo-effect/src/app/examples/effect/effect-playground-domain.ts:20 |
| queryEffect:receiptQuery | primitive | 4 | 2 | apps/demo-effect/src/app/examples/effect/effect-i18n.ts:81 |
| queryEffect:teamOverviewQuery.value | property | 4 | 0 | apps/demo-effect/src/app/examples/effect/effect-team-overview-layer-scope.ts:44 |
| TodoStore | service | 4 | 0 | apps/demo-effect/src/app/examples/effect/effect-playground-domain.ts:20 |
| queryEffect:accessQuery.value | property | 3 | 0 | apps/demo-effect/src/app/examples/effect/effect-access-check-shared-service.ts:49 |
| CraftRouterOutlet | component | 2 | 0 | libs/component/src/lib/craft-router-outlet.ts:20 |
| CartPricing | effect-service | 2 | 1 | apps/demo-effect/src/app/examples/effect/effect-pricing-domain.ts:43 |
| state:titleInput | primitive | 2 | 0 | apps/demo-effect/src/app/examples/effect/effect-playground.ts:129 |
| queryEffect:accessQuery.hasValue | property | 2 | 0 | apps/demo-effect/src/app/examples/effect/effect-access-check-shared-service.ts:44 |
| state:titleInput.clearTitle | property | 2 | 0 | apps/demo-effect/src/app/examples/effect/effect-playground.ts:129 |

## Hotspots

Score = total complexity × (1 + fan-in) × (1 + churn). Churn was not measured: pass `--churn-since` to weigh recent changes. Nodes of unknown complexity are left out.

| Node | Kind | Score | Complexity | Fan-in | Churn | Location |
| --- | --- | --- | --- | --- | --- | --- |
| AiSendContextChat | component | 62 | 62 | 0 | — | libs/component/src/lib/ai/ai-send-context-chat.ts:161 |
| AiSendDialog | component | 17 | 17 | 0 | — | libs/component/src/lib/ai/ai-send-dialog.ts:158 |
| CraftMatch | service | 11 | 11 | 0 | — | libs/core/src/lib/craft-router-tokens.ts:126 |
| EffectSharedServiceComponent | component | 10 | 5 | 1 | — | apps/demo-effect/src/app/examples/effect/effect-access-check-shared-service.ts:19 |
| EffectLayerScopeComponent | component | 10 | 5 | 1 | — | apps/demo-effect/src/app/examples/effect/effect-team-overview-layer-scope.ts:19 |
| EffectI18nComponent | component | 6 | 3 | 1 | — | apps/demo-effect/src/app/examples/effect/effect-i18n.ts:36 |
| EffectPlaygroundComponent | component | 6 | 3 | 1 | — | apps/demo-effect/src/app/examples/effect/effect-playground.ts:31 |
| CraftRouterOutlet | component | 6 | 2 | 2 | — | libs/component/src/lib/craft-router-outlet.ts:20 |
| state:locale | primitive | 6 | 3 | 1 | — | apps/demo-effect/src/app/examples/effect/effect-i18n.ts:56 |
| queryEffect:accessQuery | primitive | 5 | 5 | 0 | — | apps/demo-effect/src/app/examples/effect/effect-access-check-shared-service.ts:37 |

## Dependency cycles

_None._

## Unused primitive methods

_None._

## Documentation

JSDoc summaries and Markdown pages citing each node. Unmeasured nodes have no source range: their documentation is unknown.

| Kind | Nodes | With JSDoc | Cited by a page | Unmeasured |
| --- | --- | --- | --- | --- |
| service | 111 | 22 | 0 | 8 |
| component | 15 | 9 | 0 | 0 |
| route | 7 | 0 | 0 | 0 |
| primitive | 58 | 0 | 0 | 0 |

## Architecture violations

### mutation-react-on

- Mutation sendContextToAi has no query reacting to it (libs/component/src/lib/ai/ai-send-context-chat.ts:505).
