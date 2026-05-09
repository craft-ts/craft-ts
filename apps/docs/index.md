---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: '@craft-ng'
  text: 'Type-Safe Reactive States Management for Angular'
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
    details: state, query, mutation, asyncProcess, and queryParam give you a complete set of reactive primitives that cover every kind of state
  - title: Tackle state complexity
    details: States are fully declarative. Use the provided insertions to handle common UX behaviors and apply logic exactly where you need them.
  - title: Create service as functions, not classes
    details: Services are just functions with a scope. Clear inputs, clear outputs. Yield them wherever you need them.
  - title: Easy to test, easy to debug
    details: A deterministic testing setup that reflects your real dependency graph. The compiler won't let your tests run until all dependencies are correctly provided or mocked.

  - title: Explicit App initialization call-back
    details: Declare inside your service what needs to be initialized before the app is rendered. No surprises, no mistakes.

  - title: Never forget to provide a service again
    details: The DI system is fully type-safe and fully inferred. If you forget to provide a service, it won't compile. So let's create a service just where you need it.

  - title: Trusted routing integration
    details: Type-safe navigation and parameter binding. If you navigate to a missing route or misspell an input name, it won't compile.

  - title: Observability and traceability by design
    details: Log what you need, where you need it. Need to trace it? Override the default logger with your own implementation and connect it to your monitoring system.

  - title: Testing that mirrors reality
    details: Mock only browser boundaries for tests that need to stay close to reality. Even for e2e tests, you can know which endpoints are called and mock them.

  - title: Deal with exceptions, not surprises
    details: Create known exceptions and handle them where you need to. No more unexpected errors breaking your app in production.
---
