# Press Kit

Resources and information about @ngcraft for articles, presentations, and sharing.

## Project Description

### Short Description

@ngcraft is a reactive state management tool for Angular, focusing on URL, Client, and Server state with 100% type-safety and Signal-based architecture.

### Long Description

@ngcraft is a reactive state management tool designed specifically for Angular applications. It focuses on managing URL, Client, and Server state, allowing developers to concentrate on business value and user experience. Built on Angular Signals with optional RxJS support, @ngcraft provides type-safe primitives and composable stores that integrate seamlessly into your components and services. The library promotes granular, declarative state management with powerful features like automatic localStorage synchronization, optimistic updates, and smart loading states.

## Key Features

- ✅ **100% Type-Safe** - Built with TypeScript, leveraging inference to minimize manual type declarations
- ✅ **Signal-Based** - Fully powered by Angular Signals (RxJS optional)
- ✅ **Composable** - Design for composition and logic reuse
- ✅ **Granular State** - Promotes focused state slices
- ✅ **Flexible Architecture** - Method-based to source-based approaches
- ✅ **Declarative** - 100% declarative state definition
- ✅ **Frictionless DX** - Maximum TypeScript inference and intuitive API

## Logo & Brand Assets

### Logo

```
Coming soon...
```

### Brand Colors

- **Primary**: `#dd0031` (Angular Red)
- **Secondary**: `#c50026` (Darker Red)
- **Accent**: `#ff4458` (Light Red)

## Quick Example

```typescript
import { Component } from '@angular/core';
import { craft } from '@ngcraft/core';

const CounterStore = craft((store) => ({
  ...store.state({ count: 0 }),
  ...store.computed({
    double: (state) => state.count() * 2,
  }),
  ...store.methods({
    increment: (state) => state.count.update((c) => c + 1),
  }),
}));

@Component({
  selector: 'app-counter',
  template: `
    <p>Count: {{ store.count() }} | Double: {{ store.double() }}</p>
    <button (click)="store.increment()">Increment</button>
  `,
  providers: [CounterStore],
})
export class CounterComponent {
  store = inject(CounterStore);
}
```

## Installation

```shell
npm i @ngcraft/core@latest
```

## Links

- **GitHub**: [github.com/ng-angular-stack/ng-craft](https://github.com/ng-angular-stack/ng-craft)
- **Documentation**: [ng-angular-stack.github.io/craft/](https://ng-angular-stack.github.io/craft/)
- **NPM**: [npmjs.com/package/@ngcraft/core](https://npmjs.com/package/@ngcraft/core)

## Social Media

### Twitter/X

```
🚀 Introducing @ngcraft - Reactive State Management for Angular!

✅ 100% Type-Safe
✅ Signal-Based
✅ Composable & Reusable
✅ Frictionless DX

Focus on business value, not boilerplate!

Learn more: [link]
#Angular #TypeScript #StateManagement
```

### LinkedIn

```
Excited to share @ngcraft - a new reactive state management tool for Angular!

@ngcraft helps you focus on delivering business value by handling the common patterns in Angular applications. Built on Signals with 100% type safety, it offers:

• Reactive state with automatic updates
• Async method handling with loading states
• URL parameter synchronization
• Server data queries with caching
• Optimistic mutations
• localStorage persistence
• And much more!

Check it out: [link]

#Angular #WebDevelopment #TypeScript #OpenSource
```

## Testimonials

_We'd love to hear from you! Share your experience with @ngcraft._

## License

MIT License - Free for personal and commercial use

## Credits

Created and maintained by the ng-angular-stack team.

## Contact

- **Issues**: [GitHub Issues](https://github.com/ng-angular-stack/ng-craft/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ng-angular-stack/ng-craft/discussions)

---

Thank you for your interest in @ngcraft! 🙏
