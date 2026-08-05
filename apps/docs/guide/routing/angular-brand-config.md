# Angular brand config

The `craft-brand` codemod reads a component's Angular metadata to generate its
`GenDeps_*`. When a symbol's real dependency isn't visible in that metadata — a
pipe that needs a service, a library that provides implicitly — a project-level
`craft-brand.config.ts` tells the codemod about it.

**Use it when** a generated `GenDeps_*` is missing a dependency you know exists.
**Not as a first step** — the default rules cover most of Angular, including
`@angular/router`.

`@craft-ng/dev-tools` can augment generated `GenDeps` from Angular metadata with a project-level `craft-brand.config.ts`.

This is useful when a standalone import implies an extra DI dependency that does not belong to your component code directly.

## What It Solves

Some third-party Angular APIs are visible in `imports`, but the actual runtime dependency sits elsewhere.

Typical example:

- `TranslatePipe` is imported in the component
- `TranslateService` is the provider you want to track explicitly

Instead of repeating that rule in every component, you can register it once in your project config.

## Config File

Create a `craft-brand.config.ts` file at the root of your app or library:

```ts
import { defineAngularBrandConfig } from '@craft-ng/dev-tools';

export default defineAngularBrandConfig({
  importAugmentations: [
    {
      match: {
        module: '@ngx-translate/core',
        symbols: ['TranslatePipe'],
        metadata: ['imports'],
      },
      deps: [{ key: 'TranslateService', symbol: 'TranslateService' }],
      missingProvider: [
        { key: 'TranslateService', symbol: 'TranslateService' },
      ],
    },
  ],
});
```

The codemod auto-discovers `craft-brand.config.ts`, and both `brand-angular-gen-deps-required` and `brand-angular-deps-match` use the same config so lint and generated types stay aligned.

## Matching Rules

Each `importAugmentations` entry is declarative:

- `match.module`: package name to match
- `match.symbols`: optional exported symbols that trigger the rule
- `match.metadata`: where the symbol must be used, currently `imports` and `hostDirectives`
- `deps`: extra entries added to generated `GenDeps`
- `missingProvider`: extra entries added to generated `missingProvider`

Only actual Angular metadata usage is matched. A plain TypeScript import in the file is ignored if it is not used in `imports` or `hostDirectives`.

## Generated Result

For a standalone component like this:

```ts
import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [TranslatePipe],
  template: `{{ 'home.title' | translate }}`,
})
export class HomeComponent {}
```

The generated dependency shape can include:

```ts
type GenDeps_HomeComponent = GetDeps<{
  deps: {
    TranslatePipe: TranslatePipe;
    TranslateService: TranslateService;
  };
  provided: {};
  missingProvider: {
    TranslateService: TranslateService;
  };
  publicProperties: GetPublicComponentProperties<HomeComponent>;
}>;
```

That keeps the template import and the implicit provider explicit in the same generated type.

## Built-in Router Behavior

`@angular/router` already has a built-in augmentation rule in the codemod.

If a symbol from `@angular/router` is used in Angular metadata, the codemod can automatically associate it with `Router` in generated dependencies. Project config uses the same augmentation mechanism for your own libraries.

## Notes

- The config file is `TypeScript` only in this iteration.
- Rules are declarative only.
- `symbol` must be a normal importable type name.
- This feature augments generated types; it does not change Angular runtime metadata.

## See Also

- [`toCraftService`](/guide/app/integrate-existing)
- [`Browser Boundaries`](/guide/testing/browser-boundaries)
