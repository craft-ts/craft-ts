#!/usr/bin/env node
/**
 * Type-stress generator for craft-ng.
 *
 * Usage:
 *   npx tsx tools/generate-type-stress.mts [options]
 *
 * Options:
 *   --features N               Number of lazy feature modules        (default: 10)
 *   --components-per-feature N Components per feature                (default: 10)
 *   --global-services N        Shared services injected across comps (default: 10)
 *   --local-services N         Services local to each feature        (default: 5)
 *   --services-per-component N How many services each component uses (default: 3)
 *   --http-exceptions N        Exception handlers per HTTP call      (default: 1)
 *   --service-depth N          A→B→C dependency chain length         (default: 2)
 *   --out DIR                  Output directory                      (default: apps/type-stress/src/generated)
 *
 * Example — "close to reality" enterprise app:
 *   npx tsx tools/generate-type-stress.mts \
 *     --features 20 --components-per-feature 15 --global-services 20 \
 *     --local-services 5 --services-per-component 3 \
 *     --http-exceptions 1 --service-depth 2
 *
 * Then benchmark:
 *   time npx tsc --noEmit -p apps/type-stress/tsconfig.stress.json
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function arg(name: string, fallback: number): number {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : fallback;
}
function argStr(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : fallback;
}

const CFG = {
  features: arg('features', 10),
  componentsPerFeature: arg('components-per-feature', 10),
  globalServices: arg('global-services', 10),
  localServices: arg('local-services', 5),
  servicesPerComponent: arg('services-per-component', 3),
  httpExceptions: arg('http-exceptions', 1),
  serviceDepth: arg('service-depth', 2),
  out: argStr('out', join(ROOT, 'apps/type-stress/src/generated')),
};

const TOTAL_COMPONENTS = CFG.features * CFG.componentsPerFeature;
console.log(`
Generating type-stress test:
  Features:               ${CFG.features}
  Components per feature: ${CFG.componentsPerFeature}
  Total components:       ${TOTAL_COMPONENTS}
  Global services:        ${CFG.globalServices}
  Local services/feature: ${CFG.localServices}
  Services per component: ${CFG.servicesPerComponent}
  HTTP exceptions:        ${CFG.httpExceptions}
  Service depth:          ${CFG.serviceDepth}
  Output:                 ${CFG.out}
`);

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

// ---------------------------------------------------------------------------
// Service generation
// ---------------------------------------------------------------------------

interface ServiceMeta {
  name: string;       // e.g. "GlobalService3"
  injectable: string; // e.g. "injectGlobalService3"
  yieldable: string;  // e.g. "GlobalService3ToYield"
  depName: string;    // key in ExtractDeps map, e.g. "GlobalService3"
}

function serviceMeta(name: string): ServiceMeta {
  return {
    name,
    injectable: `inject${name}`,
    yieldable: `${name}ToYield`,
    depName: name,
  };
}

/** Leaf HTTP service — no deps on other craft services */
function genLeafHttpService(meta: ServiceMeta, exceptions: number): string {
  const exceptionHandlers = Array.from({ length: exceptions }, (_, i) => `
        function* ({ status, code }) {
          if (!(yield* status(${400 + i}))) return;
          if (!(yield* code('ERR_${meta.name.toUpperCase()}_${i}'))) return;
          return craftException({ code: 'ERR_${meta.name.toUpperCase()}_${i}', scope: '${meta.name}Api' }, { field: 'f${i}' });
        },`).join('');

  return `import {
  craftException,
  CraftHttpClient,
  craftService,
  type ExtractDeps,
} from '@craft-ng/core';

interface ${meta.name}Item { id: number; label: string; }

export const {
  ${meta.injectable},
  ${meta.yieldable},
} = craftService({ name: '${meta.name}', scope: 'global' }, function* () {
  const items = yield* CraftHttpClient.get(({ response }) => ({
    url: '${meta.name.toLowerCase()}',
    success: response<${meta.name}Item[]>(),${exceptions > 0 ? `
    exceptions: [${exceptionHandlers}
    ],` : ''}
  }));

  return { items, count: () => items()?.length ?? 0 };
});

export type ${meta.name}Deps = ExtractDeps<typeof ${meta.injectable}>['${meta.depName}'];
`;
}

/** Dependent service — yields N upstream services */
function genDependentService(
  meta: ServiceMeta,
  upstreams: ServiceMeta[],
  depth: number,
): string {
  const imports = upstreams
    .map((u) => `import { ${u.yieldable} } from './${u.name}';`)
    .join('\n');

  const yields = upstreams
    .map((u) => `  yield* ${u.yieldable}(undefined, ({ count }) => ({ count }));`)
    .join('\n');

  return `import { craftService, type ExtractDeps } from '@craft-ng/core';
${imports}

export const {
  ${meta.injectable},
  ${meta.yieldable},
} = craftService({ name: '${meta.name}', scope: 'global' }, function* () {
${yields}

  return { getValue: () => 'depth-${depth}-${meta.name}' };
});

export type ${meta.name}Deps = ExtractDeps<typeof ${meta.injectable}>['${meta.depName}'];
`;
}

/** Simple service — no HTTP, no deps */
function genSimpleService(meta: ServiceMeta): string {
  return `import { craftService, type ExtractDeps } from '@craft-ng/core';

export const {
  ${meta.injectable},
  ${meta.yieldable},
} = craftService({ name: '${meta.name}', scope: 'global' }, () => {
  return { getValue: () => '${meta.name}-value', getCount: () => 42 };
});

export type ${meta.name}Deps = ExtractDeps<typeof ${meta.injectable}>['${meta.depName}'];
`;
}

// ---------------------------------------------------------------------------
// Component generation
// ---------------------------------------------------------------------------

function genComponent(
  componentName: string,
  selector: string,
  services: ServiceMeta[],
  serviceImportPaths: string[],
): string {
  const imports = services
    .map((s, i) => `import { ${s.injectable} } from '${serviceImportPaths[i]}';`)
    .join('\n');

  const fields = services
    .map((s, i) => `  _s${i} = ${s.injectable}();`)
    .join('\n');

  const template = services.map((_, i) => `{{ _s${i}.getValue?.() }}`).join(' ');

  const propertiesDeps = [
    `        _monitoring: ExtractDeps<${componentName}['_monitoring']>;`,
    ...services.map(
      (s, i) =>
        `        _s${i}: { ${s.depName}: ExtractDeps<typeof ${s.injectable}>['${s.depName}'] };`,
    ),
  ].join('\n');

  return `import { Component } from '@angular/core';
import {
  componentMonitoring,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
${imports}

@Component({
  selector: '${selector}',
  providers: [provideHostName('component:${componentName}')],
  template: \`${template}\`,
})
export class ${componentName} {
  private readonly _monitoring = componentMonitoring();
${fields}
}

export type GenDeps_${componentName} = GetDeps<{
  deps: {};
  propertiesDeps: {
${propertiesDeps}
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<${componentName}>;
}>;
`;
}

// ---------------------------------------------------------------------------
// Feature routes generation
// ---------------------------------------------------------------------------

function genFeatureRoutes(featureIdx: number, components: string[]): string {
  const imports = components
    .map((c) => `import type { GenDeps_${c} } from './${c}';`)
    .join('\n');

  const routes = components
    .map(
      (c, i) => `  {
    path: 'item-${i}',
    loadComponent: () => import('./${c}').then(m => m.${c}),
    componentDeps: {} as GenDeps_${c},
  },`,
    )
    .join('\n');

  const routeVarName = `feature${featureIdx}Routes`;

  return `import { craftRoutes } from '@craft-ng/core';
${imports}

export const { ${routeVarName} } = craftRoutes('feature${featureIdx}', [
${routes}
]);

export type Feature${featureIdx}RoutesApp = typeof ${routeVarName}.META_PATHS;
`;
}

// ---------------------------------------------------------------------------
// App routes generation
// ---------------------------------------------------------------------------

function genAppRoutes(features: number): string {
  const routes = Array.from(
    { length: features },
    (_, i) => `  {
    path: 'feature-${i}',
    loadChildren: () =>
      import('./features/feature-${i}/feature-${i}.routes').then(m => m.feature${i}Routes),
    componentDeps: {} as import('./root.component').GenDeps_RootComponent,
  },`,
  ).join('\n');

  return `import { craftRoutes } from '@craft-ng/core';

export const { stressRoutes } = craftRoutes('stress', [
${routes}
]);

declare module '@craft-ng/core' {
  interface CraftRouterRoutesRegistry {
    Stress: typeof stressRoutes.META_PATHS;
  }
}
`;
}

// ---------------------------------------------------------------------------
// Root component (minimal, just to have one non-lazy route)
// ---------------------------------------------------------------------------

function genRootComponent(): string {
  return `import { Component } from '@angular/core';
import {
  componentMonitoring,
  provideHostName,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';

@Component({
  selector: 'app-stress-root',
  providers: [provideHostName('component:RootComponent')],
  template: \`<router-outlet />\`,
})
export class RootComponent {
  private readonly _monitoring = componentMonitoring();
}

export type GenDeps_RootComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    _monitoring: ExtractDeps<RootComponent['_monitoring']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<RootComponent>;
}>;
`;
}

// ---------------------------------------------------------------------------
// tsconfig
// ---------------------------------------------------------------------------

function genTsconfig(root: string): string {
  return JSON.stringify(
    {
      extends: `${root}/tsconfig.base.json`,
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
        types: [],
      },
      include: ['src/**/*.ts'],
      angularCompilerOptions: {
        strictInjectionParameters: true,
        strictTemplates: true,
      },
    },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const OUT = CFG.out;
const APP_OUT = join(OUT, '..');

// Clean generated dir
if (existsSync(OUT)) rmSync(OUT, { recursive: true });

// --- Global services -------------------------------------------------------

const globalServiceMetas: ServiceMeta[] = [];

for (let i = 0; i < CFG.globalServices; i++) {
  const name = `GlobalService${i}`;
  const meta = serviceMeta(name);
  globalServiceMetas.push(meta);

  const isDependent = CFG.serviceDepth > 1 && i >= Math.floor(CFG.globalServices / 2);

  if (isDependent) {
    // Depends on an earlier leaf service
    const upstream = globalServiceMetas[i - Math.floor(CFG.globalServices / 2)];
    write(join(OUT, 'services', `${name}.ts`), genDependentService(meta, [upstream], 2));
  } else {
    const isSimple = i % 3 === 0;
    write(
      join(OUT, 'services', `${name}.ts`),
      isSimple ? genSimpleService(meta) : genLeafHttpService(meta, CFG.httpExceptions),
    );
  }
}

// --- Features & components -------------------------------------------------

for (let f = 0; f < CFG.features; f++) {
  // Local services for this feature
  const localServiceMetas: ServiceMeta[] = [];

  for (let s = 0; s < CFG.localServices; s++) {
    const name = `Feature${f}Service${s}`;
    const meta = serviceMeta(name);
    localServiceMetas.push(meta);

    const isDependent = CFG.serviceDepth > 1 && s === CFG.localServices - 1 && s > 0;
    if (isDependent) {
      write(
        join(OUT, 'features', `feature-${f}`, `${name}.ts`),
        genDependentService(meta, [localServiceMetas[s - 1]], 2),
      );
    } else {
      const isSimple = s % 2 === 0;
      write(
        join(OUT, 'features', `feature-${f}`, `${name}.ts`),
        isSimple ? genSimpleService(meta) : genLeafHttpService(meta, CFG.httpExceptions),
      );
    }
  }

  // Components
  const componentNames: string[] = [];

  for (let c = 0; c < CFG.componentsPerFeature; c++) {
    const componentName = `Feature${f}Comp${c}Component`;
    componentNames.push(componentName);

    // Pick services: mix global + local, up to servicesPerComponent
    const availableGlobal = globalServiceMetas.slice(
      0,
      Math.min(CFG.servicesPerComponent - 1, globalServiceMetas.length),
    );
    const localPick = localServiceMetas.slice(0, 1);
    const picked = [...availableGlobal, ...localPick].slice(0, CFG.servicesPerComponent);

    const importPaths = picked.map((s) => {
      const isGlobal = globalServiceMetas.includes(s);
      return isGlobal
        ? `../../services/${s.name}`
        : `./${s.name}`;
    });

    write(
      join(OUT, 'features', `feature-${f}`, `${componentName}.ts`),
      genComponent(
        componentName,
        `app-stress-f${f}-c${c}`,
        picked,
        importPaths,
      ),
    );
  }

  // Feature routes
  write(
    join(OUT, 'features', `feature-${f}`, `feature-${f}.routes.ts`),
    genFeatureRoutes(f, componentNames),
  );
}

// --- App routes & root -----------------------------------------------------

write(join(OUT, 'app.routes.ts'), genAppRoutes(CFG.features));
write(join(OUT, 'root.component.ts'), genRootComponent());

// --- tsconfig --------------------------------------------------------------

const relativeRoot = '../../..'; // apps/type-stress → root
write(
  join(APP_OUT, '..', 'tsconfig.stress.json'),
  genTsconfig(relativeRoot),
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const totalFiles =
  CFG.globalServices +
  CFG.features * (CFG.localServices + CFG.componentsPerFeature + 1) +
  2;

console.log(`Done — ${totalFiles} files generated.`);
console.log(`
Run benchmark:
  time npx tsc --noEmit -p apps/type-stress/tsconfig.stress.json

With trace:
  npx tsc --noEmit -p apps/type-stress/tsconfig.stress.json \\
    --generateTrace /tmp/tsc-trace-stress
  npx @typescript/analyze-trace /tmp/tsc-trace-stress 2>&1 | head -40
`);
