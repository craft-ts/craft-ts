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
import { state } from '@craft-ng/core';

const { counter } = state('counter', 0, ({ update }) => ({
  increment: () => update((value) => value + 1),
}));

counter.increment();
counter(); // 1
```

## Documentation

Read the [getting started tutorial](https://ng-angular-stack.github.io/craft/learn)
or browse the [API reference](https://ng-angular-stack.github.io/craft/reference/).

## Related packages

- [`@craft-ng/component`](https://www.npmjs.com/package/@craft-ng/component)
  for selectorless functional components.
- [`@craft-ng/dev-tools`](https://www.npmjs.com/package/@craft-ng/dev-tools)
  for codemods, generators and ESLint rules.

## Status

This package is currently in beta. APIs may change before a stable release.

## License

MIT © Romain Geffrault
