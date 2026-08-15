# Project Index

Use installed packages and published docs. Do not assume you have the Craft NG
monorepo checked out.

## Public API

- `node_modules/@craft-ng/core`
- `node_modules/@craft-ng/component`

Confirm exported symbol names there before recommending an API.

## High-value documentation

Prefer MCP `search_documentation` / `get_documentation_page`, or the markdown
siblings of:

- https://ng-angular-stack.github.io/craft/guide/concepts/mental-model
- https://ng-angular-stack.github.io/craft/guide/state/local-state
- https://ng-angular-stack.github.io/craft/guide/state/server-state
- https://ng-angular-stack.github.io/craft/guide/state/mutations
- https://ng-angular-stack.github.io/craft/guide/state/async-process
- https://ng-angular-stack.github.io/craft/guide/state/url-state
- https://ng-angular-stack.github.io/craft/guide/concepts/insertions
- https://ng-angular-stack.github.io/craft/guide/state/react-on-mutation
- https://ng-angular-stack.github.io/craft/guide/state/pagination-placeholder
- https://ng-angular-stack.github.io/craft/guide/state/collections
- https://ng-angular-stack.github.io/craft/guide/state/persistence
- https://ng-angular-stack.github.io/craft/guide/state/select
- https://ng-angular-stack.github.io/craft/guide/app/craft-service
- https://ng-angular-stack.github.io/craft/guide/app/integrate-existing
- https://ng-angular-stack.github.io/craft/guide/testing/services
- https://ng-angular-stack.github.io/craft/guide/reactivity/on
- https://ng-angular-stack.github.io/craft/guide/reactivity/source
- https://ng-angular-stack.github.io/craft/guide/forms/
- https://ng-angular-stack.github.io/craft/resources/examples

## Best examples

The [examples](https://ng-angular-stack.github.io/craft/resources/examples) page
lists the demo routes (pagination, full user management, forms). Open those
StackBlitz links when you need a complete composition.

MCP `find_examples` searches the same Learn + examples corpus.

## Notes

- Favor symbol names from the installed package over older or shorter doc titles.
- The public insertion name is `insertLocalStoragePersister`.
- Reach for advanced exports such as `toSource`, `computedSource`, `signalSource`,
  `linkedSource`, `resourceById`, and `toInject` only when the request is
  explicitly about infrastructure or source plumbing.
