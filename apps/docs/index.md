---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: '@craft-ng'
  text: 'Type-Safe Reactive States Management for Angular'
  tagline: Delivers excellent DX with a declarative approach and utilities that handle common logic patterns
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
  - title: 100% Type-Safe
    details: Built with TypeScript from the ground up, leveraging inference to minimize type declarations and prevent human errors.
  - title: Signal-Based
    details: Fully powered by Angular Signals with RxJS as an optional enhancement. Reactive primitives integrate seamlessly into your components and services.
  - title: Composable & Reusable
    details: Design for composition and logic reuse - localStorage sync, optimistic updates, smart loading, and more.
  - title: Granular State Management
    details: Promotes creating granular "slices" with declarative state, isolating each state piece for better maintainability.
  - title: Flexible Architecture
    details: Method-based approach that can evolve to source-based for event-driven architecture. Create global, local, or feature stores that compose effortlessly.
  - title: Frictionless DX
    details: Designed for a smooth developer experience with maximum TypeScript inference, declarative state creation, and evolutionary store composition.
---
