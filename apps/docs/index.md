---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: '@craft-ng'
  text: 'Type-Safe Reactive State Management for Angular'
  tagline: Craft. Yield. Compile — no surprises.

  image:
    src: /assets/ng-craft-logo.png
    alt: ng-craft logo

  actions:
    - theme: brand
      text: Get started
      link: /get-started
    - theme: alt
      text: Examples
      link: /examples

features:
  - title: Same API for client, server, URL, and async state
    details: state, query, mutation, asyncProcess, and queryParam give you a complete set of reactive primitives for every kind of state.
  - title: Tackle state complexity
    details: Model complex state declaratively by deriving modifiers, reactions, and computed state. Use the provided insertions to handle common UX behaviors and apply logic exactly where you need it.
  - title: Create services as functions, not classes
    details: 'Services are just functions with a scope: clear inputs, clear outputs. Yield them wherever you need them.'

  - title: Never forget to provide a service again
    details: The DI system is fully type-safe and inferred. If you forget to provide a service, it won't compile. Create a service exactly where you need it.
  - title: Easy to test, easy to debug
    details: A deterministic testing setup that reflects your real dependency graph. The compiler won't let your tests run until all dependencies are correctly provided or mocked.
  - title: Explicit app initialization callbacks
    details: Declare within your service what must be initialized before the app renders. No surprises, no mistakes.
  - title: Trusted routing integration
    details: Type-safe navigation and parameter binding. If you navigate to a missing route or misspell an input name, it won't compile.
  - title: Query params live in the route
    details: No more syncing query params with your state. Just declare them as query parameters in your route and use them like any other state.
  - title: Observability and traceability by design
    details: Log what you need, where you need it. Need tracing? Override the default logger with your own implementation and connect it to your monitoring system.
  - title: Testing that mirrors reality
    details: Mock only browser boundaries in tests that should stay close to reality. Even in e2e tests, you can know which endpoints are called and mock them.
  - title: Deal with exceptions, not surprises
    details: Define known exceptions and handle them where needed. No more unexpected errors breaking your app in production.
  - title: Designed for DX and type safety
    details: The library is built around declarative code, which enables type safety and explicit dependency tracking.
---
