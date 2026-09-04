import {
  type Tree,
  addProjectConfiguration,
  updateProjectConfiguration,
  readProjectConfiguration,
  formatFiles,
  logger,
} from '@nx/devkit';

type DiMode = 'central' | 'cascade' | 'both';

interface Schema {
  features: number;
  componentsPerFeature: number;
  globalServices: number;
  localServices: number;
  servicesPerComponent: number;
  httpExceptions: number;
  serviceDepth: number;
  diMode: DiMode;
}

interface ServiceMeta {
  name: string;
  injectable: string;
  yieldable: string;
  depName: string;
}

function serviceMeta(name: string): ServiceMeta {
  return { name, injectable: `inject${name}`, yieldable: `${name}ToYield`, depName: name };
}

// ---------------------------------------------------------------------------
// Code generators
// ---------------------------------------------------------------------------

/** scope: 'toProvide' service — must be explicitly provided */
function genToProvideService(meta: ServiceMeta): string {
  return `import { craftService, type ExtractDeps } from '@craft-ts/core';

export const {
  ${meta.injectable},
  ${meta.yieldable},
  provide${meta.name},
} = craftService(
  { name: '${meta.name}', scope: 'toProvide' },
  () => ({ getValue: () => '${meta.name}-value' }),
);

export type ${meta.name}Deps = ExtractDeps<typeof ${meta.injectable}>['${meta.depName}'];
`;
}

function genLeafHttpService(meta: ServiceMeta, exceptions: number): string {
  const handlers = Array.from(
    { length: exceptions },
    (_, i) => `
        function* ({ status, code }) {
          if (!(yield* status(${400 + i}))) return;
          if (!(yield* code('ERR_${meta.name.toUpperCase()}_${i}'))) return;
          return craftException({ code: 'ERR_${meta.name.toUpperCase()}_${i}', scope: '${meta.name}Api' }, { field: 'f${i}' });
        },`,
  ).join('');

  return `import { craftException, CraftHttpClient, craftService, type ExtractDeps } from '@craft-ts/core';

interface ${meta.name}Item { id: number; label: string; }

export const { ${meta.injectable}, ${meta.yieldable} } = craftService(
  { name: '${meta.name}', scope: 'global' },
  function* () {
    const items = yield* CraftHttpClient.get(({ response }) => ({
      url: '${meta.name.toLowerCase()}',
      success: response<${meta.name}Item[]>(),${exceptions > 0 ? `\n      exceptions: [${handlers}\n      ],` : ''}
    }));
    return { items, getValue: () => '${meta.name}-value' };
  },
);

export type ${meta.name}Deps = ExtractDeps<typeof ${meta.injectable}>['${meta.depName}'];
`;
}

function genDependentService(meta: ServiceMeta, upstreams: ServiceMeta[], depth: number): string {
  const imports = upstreams.map((u) => `import { ${u.yieldable} } from './${u.name}';`).join('\n');
  const yields = upstreams
    .map((u) => `    yield* ${u.yieldable}(undefined, ({ getValue }) => ({ getValue }));`)
    .join('\n');

  return `import { craftService, type ExtractDeps } from '@craft-ts/core';
${imports}

export const { ${meta.injectable}, ${meta.yieldable} } = craftService(
  { name: '${meta.name}', scope: 'global' },
  function* () {
${yields}
    return { getValue: () => 'depth-${depth}-${meta.name}' };
  },
);

export type ${meta.name}Deps = ExtractDeps<typeof ${meta.injectable}>['${meta.depName}'];
`;
}

function genSimpleService(meta: ServiceMeta): string {
  return `import { craftService, type ExtractDeps } from '@craft-ts/core';

export const { ${meta.injectable}, ${meta.yieldable} } = craftService(
  { name: '${meta.name}', scope: 'global' },
  () => ({ getValue: () => '${meta.name}-value', getCount: () => 42 }),
);

export type ${meta.name}Deps = ExtractDeps<typeof ${meta.injectable}>['${meta.depName}'];
`;
}

function genComponent(
  componentName: string,
  selector: string,
  services: ServiceMeta[],
  importPaths: string[],
  localService: ServiceMeta | null = null,
  routeInjectedService: ServiceMeta | null = null,
): string {
  // `localService` is provided AT the component level (in @Component.providers).
  // `routeInjectedService` is INJECTED by the component but provided at the
  // ROUTE level (its `providers: [...]` array). This makes the cascade DI
  // check meaningful: if the user removes the route-level provider, the
  // injection in the component will fail validation.
  const allServices = [
    ...services,
    ...(localService ? [localService] : []),
    ...(routeInjectedService ? [routeInjectedService] : []),
  ];
  const allImportPaths = [
    ...importPaths,
    ...(localService ? [`./${localService.name}`] : []),
    ...(routeInjectedService ? [`./${routeInjectedService.name}`] : []),
  ];

  const imports = allServices
    .map((s, i) => {
      // Only the localService needs its `provide*` import (the component
      // provides it). The routeInjectedService is provided BY THE ROUTE, so
      // the component only imports its `inject*`.
      const extra = s === localService ? `, provide${s.name}` : '';
      return `import { ${s.injectable}${extra} } from '${allImportPaths[i]}';`;
    })
    .join('\n');

  const fields = allServices.map((s, i) => `  _s${i} = ${s.injectable}();`).join('\n');
  const template = allServices.map((_, i) => `{{ _s${i}.getValue() }}`).join(' ');

  const propDeps = [
    `        _monitoring: ExtractDeps<${componentName}['_monitoring']>;`,
    ...allServices.map(
      (s, i) => `        _s${i}: { ${s.depName}: ExtractDeps<typeof ${s.injectable}>['${s.depName}'] };`,
    ),
  ].join('\n');

  // Only the local service goes in `provided`. The route-injected service
  // does NOT — it must be resolved via the cascade (route's `providers`).
  const localProvided = localService
    ? `\n    ${localService.name}: ReturnType<typeof provide${localService.name}>;`
    : '';

  return `import { Component } from '@angular/core';
import {
  componentMonitoring,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ts/core';
${imports}

@Component({
  selector: '${selector}',
  providers: [provideHostName('component:${componentName}')${localService ? `, provide${localService.name}()` : ''}],
  template: \`${template}\`,
})
export class ${componentName} {
  private readonly _monitoring = componentMonitoring();
${fields}
}

export type GenDeps_${componentName} = GetDeps<{
  deps: {};
  propertiesDeps: {
${propDeps}
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;${localProvided}
  };
  publicProperties: GetPublicComponentProperties<${componentName}>;
}>;
`;
}

function genFeatureRoutes(
  featureIdx: number,
  components: string[],
  routeService: ServiceMeta | null = null,
  diMode: DiMode = 'central',
): string {
  const compImports = components
    .map((c) => `import type { GenDeps_${c} } from './${c}';`)
    .join('\n');
  const serviceImport = routeService
    ? `\nimport { provide${routeService.name} } from './${routeService.name}';`
    : '';
  const routeProviders = routeService ? `\n    providers: [provide${routeService.name}()],` : '';
  const componentRoutes = components
    .map(
      (c, i) => `  {
    path: 'item-${i}',${routeProviders}
    loadComponent: () => import('./${c}').then(m => m.${c}),
    componentDeps: {} as GenDeps_${c},
  },`,
    )
    .join('\n');

  // Cascade mode emits a SINGLE type alias per file that aggregates the
  // RouteCheckedDI check across every route in this file. Zero per-component
  // boilerplate, and the type-alias form is lazy enough to avoid the circular
  // resolution that a runtime-call helper would trigger
  // (app.config ↔ app.routes via loadChildren).
  if (diMode === 'cascade' || diMode === 'both') {
    return `import { craftRoutes } from '@craft-ts/core';
import type { CanRun, ValidateCascadeRoutesFile } from '@craft-ts/core';
${compImports}${serviceImport}
import type { AppProvidedNames, AppProvidedValues } from '../../../app.config';

export const { feature${featureIdx}Routes } = craftRoutes('feature${featureIdx}', [
${componentRoutes}
]);

// --- Cascade DI check (one alias for the whole file) -----------------------

type _CheckFeature${featureIdx}DI = ValidateCascadeRoutesFile<
  AppProvidedNames,
  AppProvidedValues,
  typeof feature${featureIdx}Routes
>;
type _CanRunFeature${featureIdx} = CanRun<_CheckFeature${featureIdx}DI>;
`;
  }

  return `import { craftRoutes } from '@craft-ts/core';
${compImports}${serviceImport}

export const { feature${featureIdx}Routes } = craftRoutes('feature${featureIdx}', [
${componentRoutes}
]);
`;
}

function genAppRoutes(features: number): string {
  const routes = Array.from(
    { length: features },
    (_, i) => `  {
    path: 'feature-${i}',
    loadChildren: () =>
      import('./features/feature-${i}/feature-${i}.routes').then(m => m.feature${i}Routes),
  },`,
  ).join('\n');

  return `import { craftRoutes } from '@craft-ts/core';

export const { stressRoutes } = craftRoutes('stress', [
${routes}
]);

declare module '@craft-ts/core' {
  interface CraftRouterRoutesRegistry {
    Stress: typeof stressRoutes.META_PATHS;
  }
}
`;
}

function genEslintConfig(): string {
  return `import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';

export default [
  ...baseConfig,
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.ts'],
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      'craft-ts/craft-method-name-match': 'error',
      'craft-ts/provide-host-name-match-component': 'error',
      'craft-ts/prefer-browser-boundaries': 'error',
      'craft-ts/app-start-registry-match': 'error',
      'craft-ts/require-component-monitoring': 'error',
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: ['**/*.html'],
    rules: {},
  },
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {},
  },
  {
    // main.ts bootstraps outside Angular DI — console.error is intentional
    files: ['**/main.ts'],
    rules: {
      'craft-ts/prefer-browser-boundaries': 'off',
    },
  },
];
`;
}

// ---------------------------------------------------------------------------
// Static app shell files (written once, not inside generated/)
// ---------------------------------------------------------------------------

function genIndexHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>type-stress</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>
`;
}

function genAppComponent(): string {
  return `import { Component } from '@angular/core';
import { RouterOutlet, type Router } from '@angular/router';
import {
  componentMonitoring,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ts/core';
import { injectStressAppService, provideStressAppService } from './generated/services/StressAppService';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  providers: [provideHostName('component:AppComponent'), provideStressAppService()],
  template: \`<router-outlet />\`,
})
export class AppComponent {
  private readonly _monitoring = componentMonitoring();
  readonly _appService = injectStressAppService();
}

export type GenDeps_AppComponent = GetDeps<{
  deps: {
    RouterOutlet: RouterOutlet;
    Router: Router;
  };
  propertiesDeps: {
    _monitoring: ExtractDeps<AppComponent['_monitoring']>;
    _appService: { StressAppService: ExtractDeps<typeof injectStressAppService>['StressAppService'] };
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
    StressAppService: ReturnType<typeof provideStressAppService>;
  };
  publicProperties: GetPublicComponentProperties<AppComponent>;
  missingProvider: {
    Router: Router;
  };
}>;
`;
}

function genAppConfig(): string {
  return `import {
  craftAppConfig,
  provideCraftRouter,
  type AppProvidedServiceNamesOf,
  type AppProvidedDependencyValuesOf,
} from '@craft-ts/core';
import { withComponentInputBinding } from '@angular/router';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { stressRoutes } from './generated/app.routes';
import { provideStressAppService } from './generated/services/StressAppService';

export const appConfig = craftAppConfig({
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideCraftRouter(stressRoutes.toRoutes(), withComponentInputBinding()),
    provideStressAppService(),
  ],
});

// Cascade DI helpers — exported unconditionally (cheap, used only when
// downstream files opt-in via the cascade mode).
export type AppProvidedNames = AppProvidedServiceNamesOf<typeof appConfig>;
export type AppProvidedValues = AppProvidedDependencyValuesOf<typeof appConfig>;
`;
}

function genMainTs(diMode: DiMode = 'central'): string {
  // In 'cascade' mode the central check is omitted — each generated component
  // performs its own RouteCheckedDI / CanRun. In 'central' and 'both' it is
  // emitted as today.
  const emitCentral = diMode === 'central' || diMode === 'both';

  const imports = emitCentral
    ? `import { toApplicationConfig, AppCheckedDI, CanRun } from '@craft-ts/core';`
    : `import { toApplicationConfig } from '@craft-ts/core';`;

  const centralBlock = emitCentral
    ? `
type CheckAppDI = AppCheckedDI<GenDeps_AppComponent, typeof stressRoutes.META_DATA>;
type _CanRun = CanRun<CheckAppDI>;
`
    : '';

  const appComponentImport = emitCentral
    ? `import { AppComponent, type GenDeps_AppComponent } from './app.component';`
    : `import { AppComponent } from './app.component';`;

  return `import { bootstrapApplication } from '@angular/platform-browser';
${imports}
import { appConfig } from './app.config';
import { stressRoutes } from './generated/app.routes';
${appComponentImport}

bootstrapApplication(AppComponent, toApplicationConfig(appConfig)).catch(console.error);
${centralBlock}`;
}

// ---------------------------------------------------------------------------
// Generator entry point
// ---------------------------------------------------------------------------

export default async function typeStressGenerator(tree: Tree, options: Schema) {
  const cfg: Required<Schema> = {
    features: options.features ?? 10,
    componentsPerFeature: options.componentsPerFeature ?? 10,
    globalServices: options.globalServices ?? 10,
    localServices: options.localServices ?? 5,
    servicesPerComponent: options.servicesPerComponent ?? 3,
    httpExceptions: options.httpExceptions ?? 1,
    serviceDepth: options.serviceDepth ?? 2,
    diMode: options.diMode ?? 'central',
  };

  const total = cfg.features * cfg.componentsPerFeature;
  const root = 'apps/type-stress/src/generated';

  logger.info(`Generating type-stress: ${cfg.features} features × ${cfg.componentsPerFeature} components = ${total} total`);

  // --- App-level toProvide service ------------------------------------------

  const appServiceMeta = serviceMeta('StressAppService');
  tree.write(`${root}/services/${appServiceMeta.name}.ts`, genToProvideService(appServiceMeta));

  // --- Global services ------------------------------------------------------

  const globalMetas: ServiceMeta[] = [];

  for (let i = 0; i < cfg.globalServices; i++) {
    const meta = serviceMeta(`GlobalService${i}`);
    globalMetas.push(meta);

    const isDependent = cfg.serviceDepth > 1 && i >= Math.floor(cfg.globalServices / 2);
    if (isDependent) {
      const upstream = globalMetas[i - Math.floor(cfg.globalServices / 2)];
      tree.write(`${root}/services/${meta.name}.ts`, genDependentService(meta, [upstream], 2));
    } else {
      const content = i % 3 === 0 ? genSimpleService(meta) : genLeafHttpService(meta, cfg.httpExceptions);
      tree.write(`${root}/services/${meta.name}.ts`, content);
    }
  }

  // --- Features & components ------------------------------------------------

  for (let f = 0; f < cfg.features; f++) {
    const localMetas: ServiceMeta[] = [];

    for (let s = 0; s < cfg.localServices; s++) {
      const meta = serviceMeta(`Feature${f}Service${s}`);
      localMetas.push(meta);

      const isDependent = cfg.serviceDepth > 1 && s === cfg.localServices - 1 && s > 0;
      const content = isDependent
        ? genDependentService(meta, [localMetas[s - 1]], 2)
        : s % 2 === 0
          ? genSimpleService(meta)
          : genLeafHttpService(meta, cfg.httpExceptions);

      tree.write(`${root}/features/feature-${f}/${meta.name}.ts`, content);
    }

    // Route-level toProvide service (one per feature)
    const routeServiceMeta = serviceMeta(`Feature${f}RouteService`);
    tree.write(
      `${root}/features/feature-${f}/${routeServiceMeta.name}.ts`,
      genToProvideService(routeServiceMeta),
    );

    // Component-level toProvide service (one per feature, provided per component)
    const compServiceMeta = serviceMeta(`Feature${f}CompService`);
    tree.write(
      `${root}/features/feature-${f}/${compServiceMeta.name}.ts`,
      genToProvideService(compServiceMeta),
    );

    const componentNames: string[] = [];

    for (let c = 0; c < cfg.componentsPerFeature; c++) {
      const componentName = `Feature${f}Comp${c}Component`;
      componentNames.push(componentName);

      const globalPick = globalMetas.slice(0, Math.min(cfg.servicesPerComponent - 1, globalMetas.length));
      const localPick = localMetas.slice(0, 1);
      const picked = [...globalPick, ...localPick].slice(0, cfg.servicesPerComponent);

      const importPaths = picked.map((s) =>
        globalMetas.includes(s) ? `../../services/${s.name}` : `./${s.name}`,
      );

      tree.write(
        `${root}/features/feature-${f}/${componentName}.ts`,
        genComponent(componentName, `app-stress-f${f}-c${c}`, picked, importPaths, compServiceMeta, routeServiceMeta),
      );
    }

    tree.write(
      `${root}/features/feature-${f}/feature-${f}.routes.ts`,
      genFeatureRoutes(f, componentNames, routeServiceMeta, cfg.diMode),
    );
  }

  // --- Generated entry points -----------------------------------------------

  tree.write(`${root}/app.routes.ts`, genAppRoutes(cfg.features));

  // --- Static app shell (written once, stable across re-generations) --------

  tree.write('apps/type-stress/src/index.html', genIndexHtml());
  tree.write('apps/type-stress/src/main.ts', genMainTs(cfg.diMode));
  tree.write('apps/type-stress/src/app.config.ts', genAppConfig());
  tree.write('apps/type-stress/src/app.component.ts', genAppComponent());
  tree.write('apps/type-stress/src/styles.css', '');

  // --- tsconfig -------------------------------------------------------------

  const tsconfig = {
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      outDir: '../../dist/out-tsc',
      strict: true,
      noImplicitOverride: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      isolatedModules: true,
      target: 'es2022',
      emitDecoratorMetadata: false,
      module: 'preserve',
      moduleResolution: 'bundler',
      types: [],
    },
    include: ['src/**/*.ts'],
    angularCompilerOptions: {
      strictInjectionParameters: true,
      strictTemplates: true,
    },
  };

  tree.write('apps/type-stress/tsconfig.app.json', JSON.stringify(tsconfig, null, 2));

  const tsconfigProject = {
    extends: '../../tsconfig.base.json',
    compilerOptions: {
      strict: true,
      noImplicitOverride: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      isolatedModules: true,
      target: 'es2022',
      emitDecoratorMetadata: false,
      module: 'preserve',
      moduleResolution: 'bundler',
    },
    angularCompilerOptions: {
      strictInjectionParameters: true,
      strictTemplates: true,
    },
    files: [],
    include: [],
    references: [{ path: './tsconfig.app.json' }],
  };

  tree.write('apps/type-stress/tsconfig.json', JSON.stringify(tsconfigProject, null, 2));
  tree.write('apps/type-stress/eslint.config.mjs', genEslintConfig());

  // --- project.json ---------------------------------------------------------

  const projectConfig = {
    root: 'apps/type-stress',
    projectType: 'application',
    sourceRoot: 'apps/type-stress/src',
    tags: ['type-stress'],
    targets: {
      build: {
        executor: '@angular/build:application',
        outputs: ['{options.outputPath}'],
        options: {
          outputPath: 'dist/apps/type-stress',
          browser: 'apps/type-stress/src/main.ts',
          tsConfig: 'apps/type-stress/tsconfig.app.json',
          styles: ['apps/type-stress/src/styles.css'],
        },
        configurations: {
          production: { optimization: true, outputHashing: 'all' },
          development: { optimization: false, sourceMap: true },
        },
        defaultConfiguration: 'production',
      },
      serve: {
        continuous: true,
        executor: '@angular/build:dev-server',
        configurations: {
          production: { buildTarget: 'type-stress:build:production' },
          development: { buildTarget: 'type-stress:build:development' },
        },
        defaultConfiguration: 'development',
      },
      lint: {
        executor: '@nx/eslint:lint',
      },
      typecheck: {
        executor: 'nx:run-commands',
        options: {
          command: 'npx tsc --noEmit -p apps/type-stress/tsconfig.app.json',
          cwd: '{workspaceRoot}',
        },
      },
      benchmark: {
        executor: 'nx:run-commands',
        options: {
          command: 'time npx tsc --noEmit -p apps/type-stress/tsconfig.app.json',
          cwd: '{workspaceRoot}',
        },
      },
      trace: {
        executor: 'nx:run-commands',
        options: {
          commands: [
            'npx tsc --noEmit -p apps/type-stress/tsconfig.app.json --generateTrace /tmp/tsc-trace-stress',
            'npx @typescript/analyze-trace /tmp/tsc-trace-stress 2>&1 | head -50',
          ],
          parallel: false,
          cwd: '{workspaceRoot}',
        },
      },
    },
  } as const;

  try {
    readProjectConfiguration(tree, 'type-stress');
    updateProjectConfiguration(tree, 'type-stress', projectConfig);
  } catch {
    addProjectConfiguration(tree, 'type-stress', projectConfig);
  }

  await formatFiles(tree);

  const fileCount =
    1 + // StressAppService
    cfg.globalServices +
    cfg.features * (cfg.localServices + 2 + cfg.componentsPerFeature + 1) + // +2 for route/comp toProvide services
    2;

  logger.info(`
✓ ${fileCount} files generated in apps/type-stress/

Dev:
  nx serve type-stress             → app Angular serveable sur localhost
  nx build type-stress             → build de production

Type benchmark:
  nx run type-stress:typecheck     → tsc --noEmit
  nx run type-stress:benchmark     → avec time
  nx run type-stress:trace         → trace + analyze
`);
}
