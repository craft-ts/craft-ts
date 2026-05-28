# Setup

This guide assumes you are integrating type-safe DI/routes into an Angular app that consumes `@craft-ng/core`.

## Prerequisites

Install the runtime package and the dev tooling in your app:

```bash
npm install @craft-ng/core
npm install -D @craft-ng/dev-tools
```

## 1. Add the app-level type check in `src/main.ts`

::: warning
The current approach is "central-based" and has some limitations due to TypeScript typing context limitations.
I will change this setup in favor of a cascading approach.
:::

Your `main.ts` is where the final app-wide DI check happens.

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { AppCheckedDI, CanRun, toApplicationConfig } from '@craft-ng/core';
import { appConfig } from './app/app.config';
import { AppComponent, GenDeps_AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, toApplicationConfig(appConfig)).catch(
  (err) => console.error(err),
);

type CheckAppDI = AppCheckedDI<
  GenDeps_AppComponent,
  typeof appConfig.APP_CONFIG_META_DATA
>;
type _CanRun = CanRun<CheckAppDI>;
```

`AppCheckedDI` compares:

- the generated dependencies of your root component
- the generated dependencies declared on every route
- the providers resolved by `craftAppConfig(...)`

If a route depends on a service that is not provided, or if a routed component expects an input that the route does not supply, `_CanRun` turns that mismatch into a TypeScript error in `main.ts`.

Typical errors look like:

- `Injected Counter is not provided in path: "some-path"`
- `Input "userId" is not provided in path: "some-path"`

## 2. Wrap your routes with `craftRoutes`

Do not export a plain Angular `Routes` array directly. Wrap it in `craftRoutes(...)` and declare `componentDeps` on each route component.

```ts
import { craftRoutes } from '@craft-ng/core';

export const { appRoutes } = craftRoutes('app', [
  {
    path: '',
    loadComponent: () => import('./test'),
    componentDeps: {} as import('./test').GenDeps_TestComponent,
  },
]);
```

The important part is:

```ts
componentDeps: {} as import('./test').GenDeps_TestComponent,
```

That line connects the generated `GenDeps_*` type of the component to the route metadata checked later by `AppCheckedDI`.

Then wire the crafted routes into your application config:

```ts
import { craftAppConfig } from '@craft-ng/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { appRoutes } from './app.routes';

export const appConfig = craftAppConfig({
  routingDeps: appRoutes.META_DATA,
  providers: [provideRouter(appRoutes.toRoutes(), withComponentInputBinding())],
});
```

Notes:

- `appRoutes.toRoutes()` gives Angular the real runtime routes.
- `appRoutes.META_DATA` gives `craftAppConfig(...)` the compile-time route dependency graph.
- For lazy routes, `loadChildren` should return the named route tree exported by the child collection, for example `childRoutes.childRoutes`.

## 3. Run the Angular brand codemod through the published script

Add a script in your app:

```json
{
  "scripts": {
    "craft:brand": "craft-brand --root src/app"
  }
}
```

Then run:

```bash
npm run craft:brand
```

This is the step that creates the initial `GenDeps_*` aliases in your component files, for example:

```ts
export type GenDeps_TestComponent = GetDeps<{
  deps: {
    CommonModule: CommonModule;
    Counter: GetInjectedServiceDependencies<typeof injectCounter>;
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<TestComponent>;
}>;
```

Adjust `--root` to your real source root:

- `src/app` for a standard Angular app
- `projects/my-app/src/app` for a workspace app
- `libs/my-feature/src` for a library

If you use a project-level `craft-brand.config.ts`, you can extend the script:

```json
{
  "scripts": {
    "craft:brand": "craft-brand --root src/app --config ./craft-brand.config.ts"
  }
}
```

## 4. Install the exposed ESLint rules

The plugin is exposed from `@craft-ng/dev-tools/eslint-rules`.

Add it to your ESLint flat config:

```ts
import craftRules from '@craft-ng/dev-tools/eslint-rules';

export default [
  // keep your existing ESLint config entries
  {
    files: ['**/*.ts'],
    plugins: {
      'craft-ng': craftRules,
    },
    rules: {
      'craft-ng/brand-angular-gen-deps-required': 'error',
      'craft-ng/brand-angular-deps-match': 'error',
      'craft-ng/component-test-gen-deps-match': 'error',
      'craft-ng/no-angular-inject': 'error',
      'craft-ng/prefer-craft-service': 'error',
      'craft-ng/prefer-craft-http-client': 'error',
    },
  },
];
```

What each rule does:

- `craft-ng/brand-angular-gen-deps-required`: generates a missing `GenDeps_*` alias for Angular components, directives, and pipes through the ESLint Quick Fix
- `craft-ng/brand-angular-deps-match`: keeps existing `GenDeps_*` aliases in sync through the same ESLint Quick Fix flow
- `craft-ng/component-test-gen-deps-match`: checks `setupCraftComponentTestingByRegister(Component, {} as GenDeps_Component, ...)` pairs in tests
- `craft-ng/no-angular-inject`: forbids raw Angular `inject()` usage so dependencies go through `craftService(...)` or `toCraftService(...)`
- `craft-ng/prefer-craft-service`: forbids authored Angular `@Injectable()` / `@Service()` services in favor of `craftService(...)` and `toCraftService(...)`
- `craft-ng/prefer-craft-http-client`: forbids Angular `HttpClient` usage in favor of `CraftHttpClient`

The two migration rules also expose a VS Code ESLint Quick Fix suggestion that inserts a temporary local disable comment with the intended migration note when you need to unblock a file before doing the full refactor.

If your project is adopting this progressively, enable both `craft-ng/brand-angular-gen-deps-required` and `craft-ng/brand-angular-deps-match` so the same Quick Fix can generate missing aliases and refresh existing ones. `craft-ng/no-angular-inject` is an architecture-enforcement rule and may require a broader migration.

## 5. When a component changes, regenerate `GenDeps` with the Quick Fix

After changing a component's DI-related shape, refresh its generated alias.

Typical triggers:

- adding or removing `inject(...)`
- changing constructor injection
- changing component `imports`
- changing `providers`
- changing `viewProviders`

Recommended workflow:

- first generation or bulk refactor: `npm run craft:brand`
- one file without `GenDeps_*`: trigger the VS Code ESLint Quick Fix on `craft-ng/brand-angular-gen-deps-required`
- one file with `GenDeps_*`: trigger the VS Code ESLint Quick Fix on `craft-ng/brand-angular-deps-match`
- CLI alternative for one file: `eslint --fix src/app/feature/my-component.ts`

Important limits:

- the Quick Fix only handles the current file
- if you rename the component class, rerun the generator so the `GenDeps_*` alias name stays aligned

:::warning
An Eslint error does not trigger a compilation error, so make sure to run the Quick Fix or `eslint --fix` after changing a component's DI shape. Otherwise, `main.ts` will not see the updated `GenDeps_*` and may miss real DI errors.
:::

## See Also

- [`Angular Brand Config`](/type-safe-di-routes/angular-brand-config)
- [`craftService`](/store/craft-service)
- [`toCraftService`](/store/to-craft-service)
