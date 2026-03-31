# @craft-ng/core

**Reactive State Management for Angular** - Type-safe, signal-based utilities for composable and reusable state management.

## 🎯 About

`@craft-ng/core` is a reactive state management library designed specifically for Angular applications. It focuses on URL, Client, and Server state management, allowing you to concentrate on business value and user experience.

### Core concepts

1. There are **Primitives**, built on top of signals, each encapsulate their own state and logic.  
2. They can be used directly in both components and services.  
3. They all follow the same pattern: `primitive(config, insertion1, insertion2, ...)`.  
4. Insertions are used to extend behavior (modifiers, reactions, derived state, method-based or event-based logic, etc.).  
5. This pattern, combined with `insert...` utilities from **craft-ng**, enables a high level of composition, making it easy to scale from simple to complex use cases.  
6. A `craft` store is available to orchestrate these primitives. It can be composed with other stores and is itself fully composable.  

### Why @craft-ng/core?

- **100% Signals** - Built on Angular Signals, RxJS is optional
- **Reactive Primitives** - `state`, `asyncState`, `queryParam`, `query`, `mutation` and `asyncProcess` for a better developer experience
- **Composition & Reusability** - Use insertions to compose your logic (localStorage sync, optimistic updates, smart loading states, etc.)
- **Flexible Architecture** - Method-based, source-based, or hybrid approach to fit your needs
- **Granular & Declarative State Management** - Promotes creating isolated states for better maintainability and testability

## 🚀 Installation

```bash
npm i @craft-ng/core@latest
```

## 📖 Documentation

Full documentation is available at: **[ng-craft.dev](https://ng-craft.dev)** _(coming soon)_

### Quick Start

```typescript
import { Component } from '@angular/core';
import { state } from '@craft-ng/core';

@Component({
  selector: 'app-counter',
  template: `
    <div>
      <p>Count: {{ counter() }}</p>
      <button (click)="counter.increment()">+1</button>
      <button (click)="counter.reset()">Reset</button>
    </div>
  `,
})
export class CounterComponent {
  counter = state(
    0,
    ({ update, set }) => ({
      increment: () => update((current) => current + 1),
      reset: () => set(0),
    }),
    ({ state }) => ({
      isOdd: computed(() => state() % 2 === 1),
    }),
  );
}
```

## 💎 Key Features

### Reactive Primitives

- **`state`** - Reactive state based on Signals
- **`query`** - Async data fetching management
- **`mutation`** - Async operations with state management
- **`queryParam`** - State synchronization with URL parameters
- **`asyncProcess`** - Async process management

### Insertions for Composition

Compose your logic with reusable insertions:

```typescript
import { state, insertLocalStorage } from '@craft-ng/core';

const myState = state(
  0,
  insertLocalStoragePersister({
    storeName: 'myStore',
    key: 'myState',
  }),
);
```

### Composable Stores

Create global, local, or feature stores:

```typescript
const { injectUserGlobalCraft } = craft(
  {
    name: 'userGlobal',
    providedIn: 'root',
  },
  craftQuery('user', () =>
    query({
      params: () => userId(),
      loader: async ({ params }) => fetchUser(params),
    }),
  ),
  craftMutations(() => ({
    updateEmail: mutation({
      method: (email: string) => ({ email }),
      loader: async ({ params }) => updateUserEmail(params),
    }),
  })),
);
```

## 📝 License

MIT © [Romain Geffrault](https://github.com/ng-angular-stack)

## 🔗 Links

- [GitHub Repository](https://github.com/ng-angular-stack/ng-craft)
- [NPM Package](https://www.npmjs.com/package/@craft-ng/core)
- Documentation (coming soon)

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or pull request.

---

**Built with ❤️ for the Angular community**
