# Folder path boundaries

`assertPathBoundaries` applies architectural allowlists and denylists to paths
inside one application. It checks graph dependencies, and can optionally check
calls:

```typescript
assertPathBoundaries(graph.graph, {
  constraints: [
    {
      source: 'src/app/features/:feature/**',
      onlyDependOn: [
        'src/app/features/:feature/**',
        'src/app/shared/**',
        'src/app/ui/**',
      ],
    },
    {
      source: 'src/app/ui/**',
      onlyDependOn: ['src/app/ui/**', 'src/app/shared/**'],
      forbidTarget: ['src/app/data/**'],
    },
  ],
});
```

## What it prevents

Without a folder rule, these imports are easy to introduce:

```text
features/users → features/cart
ui/widget      → data/users-api
```

The first couples sibling features. The second lets presentation code bypass
the domain or browser-boundary service. Both can work today and make tomorrow's
move or replacement expensive.

The `:feature` capture permits a feature to depend on its own folder while
forbidding a sibling. A denylist such as `features/**` would accidentally forbid
self-dependencies too.

## Why this is not just ESLint

Nx `depConstraints` protect project-to-project imports. This rule protects
folders within an app, including routes, services and components that belong to
the same Nx project. Structural edges such as `loads` and `renders` are ignored;
the rule is about ownership and dependency flow.

## See also

- [Craft graph vs Nx](/guide/testing/craft-graph-vs-nx)
- [Writing your own rules](/guide/testing/architecture#writing-your-own-rules)
