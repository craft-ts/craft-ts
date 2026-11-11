# Copilot Instructions

- Craft component dependencies are inferred from the component itself. Use `ComponentDepsOf` for route checks and `loadCraftComponent` for lazy routes.
- Keep `RouteCheckedDI` / `CanRun` checks beside each route collection, including lazy child collections.
