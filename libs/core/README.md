# @craft-ts/core

Type-safe, signal-first building blocks for Angular applications.

`@craft-ts/core` provides reactive primitives for local state, server state,
async processes, mutations, URL state, forms, services, routing and testing.

## Installation

```bash
npm install @craft-ts/core@beta
```

The current beta targets Angular 21 and requires Node.js 20.19+ (or 22.12+).

## Quick start

```ts
import { craftComputed, state } from '@craft-ts/core';

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

Read the [getting started tutorial](https://craft-ts.github.io/craft/learn)
or browse the [API reference](https://craft-ts.github.io/craft/reference/).

Coding agents should start from
[`llms.txt`](https://craft-ts.github.io/craft/llms.txt) and the
[coding agents](https://craft-ts.github.io/craft/resources/ai-agents)
guide (`npx -y @craft-ts/mcp@beta`).

## Related packages

- [`@craft-ts/component`](https://www.npmjs.com/package/@craft-ts/component)
  for selectorless functional components.
- [`@craft-ts/dev-tools`](https://www.npmjs.com/package/@craft-ts/dev-tools)
  for codemods, generators and ESLint rules.
- [`@craft-ts/mcp`](https://www.npmjs.com/package/@craft-ts/mcp)
  for the documentation MCP server and Agent Skills.

## Status

This package is currently in beta. APIs may change before a stable release.

## License

MIT © Romain Geffrault
