# @craft-ng/core

Type-safe, signal-first building blocks for Angular applications.

`@craft-ng/core` provides reactive primitives for local state, server state,
async processes, mutations, URL state, forms, services, routing and testing.

## Installation

```bash
npm install @craft-ng/core@beta
```

The current beta targets Angular 21 and requires Node.js 20.19+ (or 22.12+).

## Quick start

```ts
import { craftComputed, state } from '@craft-ng/core';

function* createCounter() {
  const counter = yield* state('counter', 0, ({ state, update }) => ({
    doubled: craftComputed(function* () {
      return (yield* state()) * 2;
    }),
    increment: () => update((value) => value + 1),
  }));

  yield* counter.increment();
  const value = yield* counter(); // 1
  const doubled = yield* counter.doubled(); // 2
  return { counter, value, doubled };
}
```

All reactive values exposed by Craft are readers delegated with `yield*`.
This includes primitive roots, derived insertions and nested resource properties
such as `yield* query.value()`, `yield* query.status()` and
`yield* query.resource.value()`. Angular signals remain internal to the
primitives. In tests and other synchronous boundaries, `craftUse(reader())`
drives the same runtime explicitly.

## Documentation

Read the [getting started tutorial](https://ng-angular-stack.github.io/craft/learn)
or browse the [API reference](https://ng-angular-stack.github.io/craft/reference/).

Coding agents should start from
[`llms.txt`](https://ng-angular-stack.github.io/craft/llms.txt) and the
[coding agents](https://ng-angular-stack.github.io/craft/resources/ai-agents)
guide (`npx -y @craft-ng/mcp@beta`).

## Related packages

- [`@craft-ng/component`](https://www.npmjs.com/package/@craft-ng/component)
  for selectorless functional components.
- [`@craft-ng/dev-tools`](https://www.npmjs.com/package/@craft-ng/dev-tools)
  for codemods, generators and ESLint rules.
- [`@craft-ng/mcp`](https://www.npmjs.com/package/@craft-ng/mcp)
  for the documentation MCP server and Agent Skills.

## Status

This package is currently in beta. APIs may change before a stable release.

## License

MIT © Romain Geffrault
