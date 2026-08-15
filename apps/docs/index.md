---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: '@craft-ng/core'
  text: 'Type-safe Angular, by construction.'
  tagline: Fine-grained reactivity. Declare. Yield. Derive. Compile — no surprises.

  image:
    src: /assets/ng-craft-logo.png
    alt: ng-craft logo

  actions:
    - theme: brand
      text: Start the tutorial
      link: /learn/
    - theme: alt
      text: Guide
      link: /guide/
    - theme: alt
      text: Examples
      link: /resources/examples

features:
  - title: Agents drive the tab you already have open
    details: In development the running app publishes its named controls. A coding agent fills, clicks and inspects that page — no second browser, no DOM reverse-engineering. Unique among frontend frameworks.
    link: /guide/ai/dev-page
  - title: Fine-grained reactivity
    details: A signal read inside a binding invalidates only that text, property, class or style. Sibling bindings and the component template stay untouched.
    link: /guide/components/fine-grained-reactivity
  - title: One API for every kind of state
    details: state, query, mutation, queryParams and asyncProcess share the same shape — a name, a config, insertions. Learn one and you know all five.
  - title: Highly composable
    details: State composes with insertions, components with directives, and both through .pipe(...) — storage persistence, optimistic updates, forms, permissions. Library behaviour and yours are the same kind of function.
  - title: Services are functions, not classes
    details: 'A service is a factory with a name and a scope: clear inputs, clear outputs. Yield it where you need it — no @Injectable, no constructor.'
  - title: Selectorless, tagless components
    details: 'Children are referenced lexically, not by a string selector — rename one and the compiler follows. And nothing extra reaches the DOM: no host element wraps your markup, so the tree you write is the tree that renders.'
  - title: Forget a provider and it won't compile
    details: Dependencies are tracked in the type system. A missing service, a misspelled route input or an unhandled exception stops the build, not the user.
  - title: Exceptions as values
    details: A declared failure is returned, not thrown — it travels through types instead of the stack. The compiler knows every code a route can produce, and tells you when one is unhandled or handled for nothing.
  - title: Forms derived from state
    details: The field tree, the validity and the error types are consequences of your state and your mutation, so they cannot drift apart from them.
  - title: Tests that mirror the real graph
    details: The test register is derived from actual dependencies. Keep the app real and mock only the browser boundaries — "I forgot to mock that" becomes a compile error.
  - title: Assert what a template renders, at compile time
    details: Type-level tests prove an element only appears under a condition, that a binding is the one you think, that a list item renders its label — no TestBed, no DOM, no fixture.
  - title: Templates are functions, not a dialect
    details: 'Markup is typed hyperscript: each, ifBlock, matchBlock and defer instead of @for, @if, @switch and @defer. No template compiler, no parse errors — your editor refactors a template exactly like it refactors code.'
  - title: Built for observability
    details: 'Declarative code is instrumentable code: one provider adds structured logs, correlation ids, per-service timing or a snapshot of the live dependency graph — across the whole app, without touching a single call site. Fast to debug, easy to trace and monitor.'
  - title: Architecture as a graph
    details: 'The static Craft graph makes architecture enforceable: keep this feature from depending on that one, keep file kinds in their lanes, or allow an endpoint to be called only once. Ordinary Vitest assertions — see the shape of the system, then teach it its boundaries.'
    link: /guide/testing/architecture
---

## Packages

The toolkit is split into focused packages. They are currently published on the
`beta` channel. Coding agents should start from
[`llms.txt`](https://ng-angular-stack.github.io/craft/llms.txt) and the
[coding agents](/resources/ai-agents) guide.

| Package                                                                    | Purpose                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`@craft-ng/core`](https://www.npmjs.com/package/@craft-ng/core)           | Reactive primitives, services, forms, routing and testing utilities |
| [`@craft-ng/component`](https://www.npmjs.com/package/@craft-ng/component) | Selectorless functional components and typed hyperscript templates  |
| [`@craft-ng/dev-tools`](https://www.npmjs.com/package/@craft-ng/dev-tools) | Codemods, generators, CLI commands and ESLint rules                 |
| [`@craft-ng/mcp`](https://www.npmjs.com/package/@craft-ng/mcp)             | MCP server, Agent Skills and `llms.txt` helpers for coding agents   |

<AuthorNote />
