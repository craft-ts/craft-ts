#!/usr/bin/env node
// Each probe is confined to a frozen temporary runtime. No library in the worktree is patched.
import assert from 'node:assert/strict';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import ts from 'typescript';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { decorateFinePreview } from './fine-plan-preview-ui.mjs';
import { applyFinePlanPrototype } from './mount-fine-plan-prototypes.mjs';
import { managedKernelPath } from './mount-binding-manager-prototypes.mjs';
import { applySyncLoweringPrototype } from './mount-sync-lowering-prototypes.mjs';
import { applyCreationPlanPrototype } from './mount-creation-plan-prototypes.mjs';
import { runFinePlanFanout } from './fine-plan-fanout.prototype.mjs';
import { applyMountShapePrototype } from './mount-shape-prototypes.mjs';
import { applyMountMorePrototype } from './mount-more-prototypes.mjs';
import { applyMountNextPrototype } from './mount-next-prototypes.mjs';
import { applyMountFloorPrototype } from './mount-floor-prototypes.mjs';
const app = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(app, '../..');
const output = resolve(
  workspace,
  process.env.CRAFT_MOUNT_DIAG_OUTPUT ?? 'tmp/mount-diagnosis',
);
const names = (
  process.env.CRAFT_MOUNT_DIAG_VARIANTS ??
  'baseline,inline-rows,static-key-attribute,no-replay-registration,lazy-hydration-key,plain-effect-scope,shared-injector-providers,no-effect-reports'
).split(',');
const mode = process.env.CRAFT_MOUNT_DIAG_MODE ?? 'timing';
const runs = Number(process.env.CRAFT_MOUNT_DIAG_RUNS ?? 3);
const iterations = Number(process.env.CRAFT_MOUNT_DIAG_ITERATIONS ?? 4);
assert(
  Number.isInteger(runs) &&
    runs > 0 &&
    Number.isInteger(iterations) &&
    iterations > 0,
);
await mkdir(output, { recursive: true });
const scratch = await mkdtemp(join(workspace, 'tmp/mount-diagnosis-'));
for (const path of [
  'libs/core',
  'libs/component',
  'libs/style',
  'libs/test-type',
  'apps/framework-benchmark',
  'tsconfig.base.json',
  'package.json',
]) {
  await cp(join(workspace, path), join(scratch, path), {
    recursive: true,
    filter: (source) =>
      !source
        .split('/')
        .some(
          (part) =>
            part === 'node_modules' ||
            part === 'dist' ||
            part === 'dist-foldkit',
        ),
  });
}
await symlink(join(workspace, 'node_modules'), join(scratch, 'node_modules'));
await symlink(
  join(app, 'node_modules'),
  join(scratch, 'apps/framework-benchmark/node_modules'),
);
const paths = {
  main: 'apps/framework-benchmark/src/craft/main.ts',
  coarse: 'apps/framework-benchmark/src/craft/row-by-component.prototype.ts',
  fanout: 'apps/framework-benchmark/src/craft/fanout-by-component.prototype.ts',
  common: 'apps/framework-benchmark/src/common.js',
  config: 'apps/framework-benchmark/vite.config.mjs',
  effect: 'libs/core/src/lib/craft-effect.ts',
  compat: 'libs/core/src/lib/host/craft-compat.ts',
  injector: 'libs/core/src/lib/host/craft-injector.ts',
  signal: 'libs/core/src/lib/host/craft-signal.ts',
  identity: 'libs/core/src/lib/craft-render-identity.ts',
  replay: 'libs/core/src/lib/craft-replay-target.ts',
  service: 'libs/core/src/lib/craft-service.ts',
  primitive: 'libs/core/src/lib/craft-primitive-gen.ts',
  generator: 'libs/core/src/lib/craft-generator-runtime.ts',
  coreIndex: 'libs/core/src/index.ts',
  use: 'libs/core/src/lib/craft-use.ts',
  reactive: 'libs/core/src/lib/reactive-read.ts',
  syncFixture: 'apps/framework-benchmark/src/craft/sync-lowering.contracts.prototype.ts',
  targetRuntime: 'libs/core/src/lib/craft-target-runtime.ts',
  componentIndex: 'libs/component/src/index.ts',
  creationFixture: 'apps/framework-benchmark/src/craft/creation-plan-fixtures.prototype.ts',
  creationContracts: 'apps/framework-benchmark/src/craft/creation-plan.contracts.prototype.ts',
  render: 'libs/component/src/lib/render/interpreter.ts',
  snapshot: 'libs/core/src/lib/take-app-snapshot.ts',
};
const original = new Map();
for (const path of Object.values(paths))
  original.set(path, await readFile(join(scratch, path), 'utf8'));
async function patch(path, from, to) {
  const text = await readFile(join(scratch, path), 'utf8');
  assert(
    text.includes(from),
    `Probe no longer matches ${path}: ${String(from).slice(0, 80)}`,
  );
  await writeFile(join(scratch, path), text.replace(from, to));
}
async function injectFunction(path, name, code, { className } = {}) {
  const text = await readFile(join(scratch, path), 'utf8');
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  let body;
  function walk(node) {
    if (
      className &&
      ts.isClassDeclaration(node) &&
      node.name?.text === className
    )
      body = node.members.find(ts.isConstructorDeclaration)?.body;
    if (
      !className &&
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name?.getText(ast) === name &&
      node.body
    )
      body = node.body;
    if (!body) ts.forEachChild(node, walk);
  }
  walk(ast);
  assert(body, `Missing function ${name ?? className} in ${path}`);
  const at = body.getStart(ast) + 1;
  await writeFile(
    join(scratch, path),
    text.slice(0, at) + '\n' + code + '\n' + text.slice(at),
  );
}
const bump = (expression) =>
  `{ const p = (globalThis as any).__craftDiag; if (p) { const k = ${expression}; p.counts[k] = (p.counts[k] ?? 0) + 1; } }`;
async function instrument() {
  if(process.env.CRAFT_SYNC_STACKS==='true')
    await injectFunction(paths.generator,'runCraftGenerator',`const p=(globalThis as any).__craftDiag;if(p){p.stacks??={};const key=new Error().stack?.split('\\n').slice(2,8).join('\\n')??'unknown';p.stacks[key]=(p.stacks[key]??0)+1;}`);
  for (const [path, name, key] of [
    [
      paths.compat,
      'createEnvironmentInjector',
      "'env:' + (_debugName ?? 'unnamed').replace(/#\\d+/g, '#')",
    ],
    [paths.injector, 'createNativeCraftInjector', "'injector.create'"],
    [paths.injector, 'createProviderRecord', "'provider.record'"],
    [
      paths.injector,
      'get',
      "'get:' + ((token as any).debugName ?? (token as any).name ?? 'anonymous')",
    ],
    [
      paths.injector,
      'getOptional',
      "'optional:' + ((token as any).debugName ?? (token as any).name ?? 'anonymous')",
    ],
    [paths.injector, 'missingProviderError', "'missing:' + tokenName(token)"],
    [
      paths.service,
      'ɵcreateHostTaggedInjector',
      "'tagged:' + hostName.replace(/#\\d+/g, '#')",
    ],
    [paths.signal, 'craftSignal', "'signal:' + typeof initial"],
    [paths.signal, 'brand', "'signal.brand'"],
    [paths.signal, 'craftComputed', "'computed'"],
    [paths.signal, 'craftWatch', "'watch'"],
    [paths.effect, 'craftEffect', "'effect:' + name"],
    [paths.identity, 'createCraftRenderIdentity', "'identity.create'"],
    [paths.identity, 'childCraftRenderIdentity', "'identity.child'"],
    [paths.identity, 'encodeHydrationSegment', "'identity.encode'"],
    [paths.replay, 'ɵregisterCraftReplayTarget', "'replay.register'"],
    [paths.replay, 'stableFingerprint', "'replay.fingerprint'"],
    [paths.primitive, 'createNamedPrimitiveGen', "'primitive:' + name"],
    [paths.service, 'createProviders', "'provider.recipe'"],
    [paths.generator, 'runCraftGenerator', "'generator.run'"],
    [paths.compat, 'ɵdestroyCraftDestroyRef', "'destroyRef.destroy'"],
  ])
    await injectFunction(path, name, bump(key));
  await patch(
    paths.compat,
    '      const index = state.callbacks.indexOf(callback);',
    `      const index = state.callbacks.indexOf(callback);
      const p = (globalThis as any).__craftDiag;
      if (p) {
        p.counts['cleanup.detach'] = (p.counts['cleanup.detach'] ?? 0) + 1;
        p.counts['cleanup.scanned'] = (p.counts['cleanup.scanned'] ?? 0) + (index < 0 ? state.callbacks.length : index + 1);
        p.counts['cleanup.shifted'] = (p.counts['cleanup.shifted'] ?? 0) + (index < 0 ? 0 : state.callbacks.length - index - 1);
      }`,
  );
  await patch(paths.generator,
    '  const wrappedFactory = craftInjector.run(() => injectFnWrapper()(factory));',
    `  const wrappedFactory = craftInjector.run(() => injectFnWrapper()(factory));
    ${bump("'factory.gen=' + isGeneratorFunction(factory) + '.adapted=' + (wrappedFactory !== factory)")}`);
  for (const className of [
    'ComponentRenderedNode',
    'ElementRenderedNode',
    'ReactiveTextRenderedNode',
    'FragmentRenderedNode',
  ])
    await injectFunction(paths.render, null, bump(JSON.stringify(className)), {
      className,
    });
}
async function mutate(name) {
  if (name === 'baseline') return;
  if(name.startsWith('counts-plan-')){
    await mutate(name.slice(7));await instrument();
    await injectFunction(paths.render,null,bump('"component.generated-record"'),{className:'PrototypeFinePlannedComponent'});
    await injectFunction(paths.render,null,bump('"component.generated-slots"'),{className:'PrototypeSlotPlannedComponent'});
    await injectFunction(paths.render,'prototypeGetSlotLayout',bump('"component.layout.get"'));
    await patch(paths.render,'    layout={plan,name:',`${bump('"component.layout.create"')}\n    layout={plan,name:`);return;
  }
  if(name==='plan-auto'||name==='plan-slots'){
    await mutate('fine-grouped');
    await applyCreationPlanPrototype(name==='plan-auto'?'record':'slots',{paths,patch,scratch,original});return;
  }
  if(name==='counts-target-fast'){await mutate('target-fast');await instrument();return;}
  if(name==='target-fast'||name==='lower-target'){
    await mutate(name==='target-fast'?'fine-grouped':'lower-fine');
    await patch(paths.targetRuntime,
      '  let next: CraftTargetWrapperRunner = function* () {',
      `  if(wrappers.length===0){
    if(autoCleanup)injector.get(DestroyRef,null)?.onDestroy(EMPTY_RELEASE);
    return EMPTY_RELEASE;
  }
  let next: CraftTargetWrapperRunner = function* () {`);
    return;
  }
  if(name.startsWith('counts-lower-')){
    await mutate(name.slice(7));await instrument();
    await injectFunction(paths.generator,'prototypeRunSync',bump('"compiler.run"'));
    await injectFunction(paths.generator,'prototypeDelegateCall',bump('"compiler.delegate"'));
    await injectFunction(paths.generator,'prototypeYieldService',bump('"compiler.service"'));
    await injectFunction(paths.generator,'prototypeYieldReactive',bump('"compiler.reactive"'));
    return;
  }
  if(name==='lower-fine'||name==='lower-generic'){
    await mutate(name==='lower-fine'?'fine-grouped':'fine-reference');
    await patch(paths.main,'begin();',"import {runSyncLoweringContracts,measureSyncLowering} from './sync-lowering.contracts.prototype';\n(globalThis as any).__runSyncLoweringContracts=runSyncLoweringContracts;\n(globalThis as any).__measureSyncLowering=measureSyncLowering;\nbegin();");
    await applySyncLoweringPrototype({paths,patch,scratch});return;
  }
  if (name.startsWith('counts-fine-')) {
    await mutate(name.slice(7));
    await instrument();
    if (name !== 'counts-fine-reference') {
      await injectFunction(paths.render, null, bump('"component.fine-plan"'), {
        className: 'PrototypeFinePlannedComponent',
      });
      await injectFunction(
        paths.render,
        'prototypeCreateBorrowedEntry',
        bump('"entry.borrowed"'),
      );
      await injectFunction(
        paths.effect,
        'prototypeCreateBindingFactory',
        bump('"effect.factory.shared"'),
      );
    }
    return;
  }
  if (name.startsWith('fine-')) {
    await mutate('shape-lean');
    if (name === 'fine-reference') {
      const source = original.get(paths.main),
        start = source.indexOf('const Row = craftComponent('),
        end = source.indexOf('const App = craftComponent(');
      await patch(
        paths.main,
        "import { RowByComponentPrototype as Row } from './row-by-component.prototype';\n",
        source.slice(start, end),
      );
      await patch(
        paths.main,
        'begin();',
        '(globalThis as any).__finePlanExpectedPerRow=settings.indexes?5:3;\nbegin();',
      );
    } else
      await applyFinePlanPrototype(name.slice(5), { paths, patch, scratch });
    return;
  }
  if (name.startsWith('counts-shape-')) {
    await mutate(name.slice(7));
    await instrument();
    await injectFunction(paths.render, null, bump("'component.planned'"), {
      className: 'PrototypePlannedComponent',
    });
    await injectFunction(
      paths.render,
      'prototypeCreateBorrowedEntry',
      bump("'entry.borrowed'"),
    );
    const src = await readFile(join(scratch, paths.injector), 'utf8');
    if (src.includes('function prototypeProviderTable'))
      await injectFunction(
        paths.injector,
        'prototypeProviderTable',
        bump("'provider.table'"),
      );
    if (src.includes('function prototypeProviderTable'))
      await patch(
        paths.injector,
        '    const tokens=providers.map(p=>p.token);',
        bump('"provider.layout.compile"') +
          '\n    const tokens=providers.map(p=>p.token);',
      );
    const renderText = await readFile(join(scratch, paths.render), 'utf8');
    if (renderText.includes('this.prototypeRoot = first ==='))
      await patch(
        paths.render,
        '      this.prototypeRoot = first ===',
        bump('"root.cache.populate"') +
          '\n      this.prototypeRoot = first ===',
      );
    if (renderText.includes('function prototypeHostProviders'))
      await injectFunction(
        paths.render,
        'prototypeHostProviders',
        bump('"provider.host.recipe"'),
      );
    if (renderText.includes('function prototypeHostProviders'))
      await patch(
        paths.render,
        '  const providers=provideHostName(`component:${name}`);',
        bump('"provider.host.compile"') +
          '\n  const providers=provideHostName(`component:${name}`);',
      );
    return;
  }
  if (name.startsWith('shape-')) {
    await mutate('more-best');
    const parts =
      name === 'shape-all'
        ? ['roots', 'layout', 'contexts', 'identities']
        : name === 'shape-lean'
          ? ['roots', 'identities', 'recipes']
          : name === 'shape-compact'
            ? ['roots', 'identities', 'recipes', 'slots']
            : [name.slice(6)];
    for (const part of parts) {
      if (part === 'recipes') await mutate('shared-injector-providers');
      await applyMountShapePrototype(part, { paths, patch, scratch });
    }
    return;
  }
  if (name.startsWith('counts-more-')) {
    await mutate(name.slice(7));
    await instrument();
    await injectFunction(paths.render, null, bump("'component.planned'"), {
      className: 'PrototypePlannedComponent',
    });
    for (const [path, fn] of [
      [paths.render, 'prototypeReadForInput'],
      [paths.render, 'prototypeStageFor'],
      [paths.render, 'prototypeCreateBorrowedEntry'],
      [paths.injector, 'prototypeProviderValue'],
      [paths.identity, 'prototypeMemoSegment'],
    ]) {
      if (
        (await readFile(join(scratch, path), 'utf8')).includes(`function ${fn}`)
      )
        await injectFunction(path, fn, bump(JSON.stringify(fn)));
    }
    if (
      (await readFile(join(scratch, paths.render), 'utf8')).includes(
        'const direct = prototypeInputReads.get(reader);',
      )
    )
      await patch(
        paths.render,
        '  const direct = prototypeInputReads.get(reader);',
        '  const direct = prototypeInputReads.get(reader);\n' +
          bump('direct ? "input.direct" : "input.fallback"'),
      );
    return;
  }
  if (name.startsWith('more-')) {
    await mutate('next-all');
    const parts =
      name === 'more-all'
        ? ['inputs', 'lazy-owner', 'value-records', 'segments', 'stage']
        : name === 'more-best'
          ? ['inputs', 'value-records', 'segments', 'ranges']
          : [name.slice(5)];
    for (const part of parts)
      await applyMountMorePrototype(part, { paths, patch, scratch });
    return;
  }
  if (name.startsWith('counts-next-')) {
    await mutate(name.slice(7));
    await instrument();
    if (
      (await readFile(join(scratch, paths.render), 'utf8')).includes(
        'class PrototypePlannedComponent',
      )
    )
      await injectFunction(paths.render, null, bump("'component.planned'"), {
        className: 'PrototypePlannedComponent',
      });
    for (const fn of [
      'prototypeRendererSignal',
      'prototypeCreateEffectRef',
      'prototypeFingerprintPath',
    ]) {
      const path =
        fn === 'prototypeCreateEffectRef'
          ? paths.effect
          : fn === 'prototypeFingerprintPath'
            ? paths.identity
            : paths.render;
      if (
        (await readFile(join(scratch, path), 'utf8')).includes(`function ${fn}`)
      )
        await injectFunction(path, fn, bump(JSON.stringify(fn)));
    }
    return;
  }
  if (name.startsWith('next-')) {
    await mutate('floor-best');
    const parts =
      name === 'next-all'
        ? ['component', 'signals', 'identity', 'effects']
        : name === 'next-runtime'
          ? ['signals', 'identity', 'effects']
          : name === 'next-lean'
            ? ['signals', 'effects']
            : [name.slice(5)];
    for (const part of parts) {
      if (part === 'identity') await mutate('prefix-hydration-key');
      await applyMountNextPrototype(part, { paths, patch, scratch });
    }
    return;
  }
  if (name.startsWith('counts-floor-')) {
    await mutate(name.slice('counts-'.length));
    await instrument();
    for (const [path, fn, key] of [
      [paths.injector, 'createPrototypeCompactOwner', 'owner.compact'],
      [paths.render, 'prototypeLazySource', 'input.lazy'],
    ])
      if (
        (await readFile(join(scratch, path), 'utf8')).includes(
          `function ${fn}(`,
        )
      )
        await injectFunction(path, fn, bump(JSON.stringify(key)));
    return;
  }
  if (name.startsWith('floor-')) {
    await mutate('component-rows-plain-scopes');
    const parts =
      name === 'floor-best'
        ? ['pure', 'ranges', 'plan']
        : name === 'floor-all'
          ? ['pure', 'owner', 'lazy', 'ranges', 'plan']
          : name === 'floor-all-no-plan'
            ? ['pure', 'owner', 'lazy', 'ranges']
            : [name.slice('floor-'.length)];
    for (const part of parts)
      await applyMountFloorPrototype(part, { paths, patch, scratch });
    return;
  }
  if (name === 'component-rows') {
    const main = await readFile(join(scratch, paths.main), 'utf8');
    const start = main.indexOf('const Row = craftComponent(');
    const end = main.indexOf('const App = craftComponent(');
    assert(start >= 0 && end > start, 'Missing row fixture');
    await writeFile(
      join(scratch, paths.main),
      main.slice(0, start) +
        "import { RowByComponentPrototype as Row } from './row-by-component.prototype';\n" +
        main.slice(end),
    );
    return;
  }
  if (name === 'component-rows-plain-scopes') {
    await mutate('component-rows');
    await mutate('plain-effect-scope');
    return;
  }
  if (name === 'counts-component' || name === 'counts-component-plain') {
    await mutate(
      name === 'counts-component'
        ? 'component-rows'
        : 'component-rows-plain-scopes',
    );
    await instrument();
    return;
  }
  if (name === 'counts') {
    await instrument();
    return;
  }
  if (name === 'inline-rows') {
    await patch(
      paths.main,
      'Row({ row, position: index })',
      `div({ 'data-row': function* () { return (yield* row()).id; } }, [settings.indexes ? span({'data-position': index}, function* () { return \`\${(yield* index()) + 1}. \`; }) : null, function* () { return (yield* row()).label; }])`,
    );
  } else if (name === 'static-key-attribute') {
    await patch(
      paths.main,
      "'data-row': function* () {\n          return (yield* inputs.row()).id;\n        },",
      "'data-row': craftUse(inputs.row()).id,",
    );
  } else if (name === 'no-replay-registration') {
    await injectFunction(
      paths.replay,
      'ɵregisterCraftReplayTarget',
      'return () => undefined;',
    );
  } else if (name === 'prefix-hydration-key') {
    await patch(
      paths.identity,
      "import { ɵcraftValueService } from './craft-service';",
      "import { ɵcraftValueService } from './craft-service';\nconst DIAG_TRUSTED_IDENTITIES = new WeakSet<CraftRenderIdentity>();",
    );
    await patch(
      paths.identity,
      `  return {
    path: normalized,
    hydrationKey: normalized.map(encodeHydrationSegment).join('/'),
  };`,
      `  const identity: CraftRenderIdentity = {
    path: normalized,
    hydrationKey: normalized.map(encodeHydrationSegment).join('/'),
  };
  DIAG_TRUSTED_IDENTITIES.add(identity);
  return identity;`,
    );
    await patch(
      paths.identity,
      '  return createCraftRenderIdentity([...parent.path, ...segments]);',
      `  const tail = segments.map(String);
  const path = [...parent.path, ...tail];
  if (!DIAG_TRUSTED_IDENTITIES.has(parent)) return createCraftRenderIdentity(path);
  const suffix = tail.map(encodeHydrationSegment).join('/');
  const identity: CraftRenderIdentity = {
    path,
    hydrationKey: tail.length ? parent.hydrationKey + (parent.path.length ? '/' : '') + suffix : parent.hydrationKey,
  };
  DIAG_TRUSTED_IDENTITIES.add(identity);
  return identity;`,
    );
  } else if (name === 'scopes-and-prefix') {
    await mutate('plain-effect-scope');
    await mutate('prefix-hydration-key');
  } else if (name === 'lazy-hydration-key') {
    await patch(
      paths.identity,
      "  return {\n    path: normalized,\n    hydrationKey: normalized.map(encodeHydrationSegment).join('/'),\n  };",
      `  let hydrationKey: string | undefined;
  return {
    path: normalized,
    get hydrationKey() { return hydrationKey ??= normalized.map(encodeHydrationSegment).join('/'); },
  };`,
    );
  } else if (name === 'plain-effect-scope') {
    await patch(
      paths.effect,
      '  DestroyRef,\n',
      '  DestroyRef,\n  EnvironmentInjector,\n',
    );
    await patch(
      paths.effect,
      `  const effectInjector = ɵcreateHostTaggedInjector(
    ownerInjector,
    \`effect:\${name}\`,
  );`,
      `  const generatorFactory = isGeneratorFunction(fnOrFactory);
  const effectInjector = generatorFactory ? ɵcreateHostTaggedInjector(ownerInjector, \`effect:\${name}\`) : ownerInjector;`,
    );
    await patch(
      paths.effect,
      '  if (isGeneratorFunction(fnOrFactory)) {',
      '  if (generatorFactory) {',
    );
    await patch(
      paths.effect,
      '    const from = effectInjector.get(ɵHOST_TAG_LIST, null) ?? [];',
      `    const nodeTags = ownerInjector.get(ɵHOST_TAG_LIST, []);
    const env = ownerInjector.get(EnvironmentInjector, null);
    const envTags = env?.get(ɵHOST_TAG_LIST, null) ?? [];
    const envOnly = envTags.filter(tag => !nodeTags.includes(tag));
    const from = generatorFactory ? (effectInjector.get(ɵHOST_TAG_LIST, null) ?? [])
      : nodeTags.length ? [...nodeTags.slice(0, -1), ...envOnly, nodeTags[nodeTags.length - 1], \`effect:\${name}\`]
      : [...envOnly, \`effect:\${name}\`];`,
    );
  } else if (name === 'shared-injector-providers') {
    const hoisted = `const DIAG_SHARED_ENV_PROVIDERS: CraftProvider[] = [
    { token: INJECTOR_TOKEN, useFactory: (injector) => injector },
    { token: ENVIRONMENT_INJECTOR_TOKEN, useFactory: (injector) => injector },
    { token: ApplicationInitStatus, useFactory: (injector) => new ApplicationInitStatus(injector.get(APP_INITIALIZER, []), (fn) => injector.run(fn)) },
  ];\n\n`;
    await patch(
      paths.compat,
      'export function createEnvironmentInjector(',
      hoisted + 'export function createEnvironmentInjector(',
    );
    await patch(
      paths.compat,
      `    { token: INJECTOR_TOKEN, useFactory: (injector) => injector },
    { token: ENVIRONMENT_INJECTOR_TOKEN, useFactory: (injector) => injector },
    {
      token: ApplicationInitStatus,
      useFactory: (injector) =>
        new ApplicationInitStatus(injector.get(APP_INITIALIZER, []), (fn) =>
          injector.run(fn),
        ),
    },`,
      '    ...DIAG_SHARED_ENV_PROVIDERS,',
    );
  } else if (name === 'no-effect-reports') {
    await patch(
      paths.effect,
      '  if (registry) {',
      '  if (false && registry) {',
    );
  } else if (name === 'indexed-cleanups') {
    await patch(
      paths.compat,
      'type DestroyRefState = {\n  callbacks: Array<() => void>;\n  closed: boolean;\n};',
      `type DiagCleanupRegistration = { callback: () => void; next?: DiagCleanupRegistration };
type DestroyRefState = {
  callbacks: Set<DiagCleanupRegistration>;
  byCallback: Map<() => void, { first: DiagCleanupRegistration; last: DiagCleanupRegistration }>;
  closed: boolean;
};`,
    );
    await patch(
      paths.compat,
      'state = { callbacks: [], closed: false };',
      'state = { callbacks: new Set(), byCallback: new Map(), closed: false };',
    );
    await patch(
      paths.compat,
      `    state.callbacks.push(callback);
    return () => {
      const index = state.callbacks.indexOf(callback);
      if (index >= 0) {
        state.callbacks.splice(index, 1);
      }
    };`,
      `    const entry: DiagCleanupRegistration = { callback };
    const queue = state.byCallback.get(callback);
    if (queue) { queue.last.next = entry; queue.last = entry; }
    else state.byCallback.set(callback, { first: entry, last: entry });
    state.callbacks.add(entry);
    return () => {
      const queue = state.byCallback.get(callback);
      if (!queue) return;
      const first = queue.first;
      state.callbacks.delete(first);
      if (first.next) queue.first = first.next;
      else state.byCallback.delete(callback);
    };`,
    );
    await patch(
      paths.compat,
      '  runCraftCleanups(state.callbacks.splice(0));',
      `  const callbacks = Array.from(state.callbacks, entry => entry.callback);
  state.callbacks.clear();
  state.byCallback.clear();
  runCraftCleanups(callbacks);`,
    );
  } else if (name === 'combined-all') {
    await mutate('combined-candidate');
    await mutate('indexed-cleanups');
  } else if (name === 'inline-plain-scopes') {
    await mutate('inline-rows');
    await mutate('plain-effect-scope');
  } else if (name === 'inline-scopes-prefix') {
    await mutate('inline-rows');
    await mutate('scopes-and-prefix');
  } else if (name === 'inline-indexed-cleanups') {
    await mutate('inline-rows');
    await mutate('indexed-cleanups');
  } else if (name === 'counts-inline') {
    await mutate('inline-rows');
    await instrument();
  } else if (name === 'counts-plain') {
    await mutate('plain-effect-scope');
    await instrument();
  } else if (name === 'combined-candidate') {
    await mutate('lazy-hydration-key');
    await mutate('plain-effect-scope');
  } else throw new Error(`Unknown probe ${name}`);
}
async function restore() {
  for (const [path, text] of original)
    await writeFile(join(scratch, path), text);
}
async function contractsBridge() {
  await patch(
    paths.common,
    'id,\n    label: `Row ${id}`,',
    'id: id + (new URLSearchParams(location.search).has("stableIds") ? 101 : 0),\n    label: `Row ${id}`,',
  );
  await patch(
    paths.main,
    '  craftAppConfig,',
    '  AppSnapshotRegistry,\n  ɵcaptureCraftReplayTarget,\n  ɵresolveCraftReplayTarget,\n  craftAppConfig,',
  );
  await patch(
    paths.main,
    '    const injector = ɵinject(ɵInjector);',
    `    const injector = ɵinject(ɵInjector);
    let registry: any;
    (globalThis as any).__craftContracts = () => {
      registry ??= ɵrunInInjectionContext(injector, () => craftUse(AppSnapshotRegistry()));
      const reports = registry.activeEffects();
      const element = document.querySelector('#rows');
      const target = element ? ɵcaptureCraftReplayTarget(element) : undefined;
      const dom = { element: 0, text: 0, comment: 0 };
      const walker = document.createTreeWalker(document.querySelector('#mount')!, NodeFilter.SHOW_ALL);
      while (walker.nextNode()) {
        const key = ({1:'element',3:'text',8:'comment'} as any)[walker.currentNode.nodeType];
        if (key) (dom as any)[key]++;
      }
      return { reports: reports.length, tags: reports.map((r: any) => [r.source, r.from]).sort(),
        dom, replay: target ? ɵresolveCraftReplayTarget(target).status : 'unregistered', descriptor: target,
        manager: (globalThis as any).__bindingManagerSnapshot?.() };
    };`,
  );
  await patch(
    paths.main,
    'bootstrapCraft({',
    'const diagnosticApp = bootstrapCraft({',
  );
  await writeFile(
    join(scratch, paths.main),
    (await readFile(join(scratch, paths.main), 'utf8')) +
      '\n(globalThis as any).__craftDestroy = () => diagnosticApp.destroy();\n' +
      (await readFile(
        join(app, 'prototype-runtime/planned-contracts.ts.txt'),
        'utf8',
      )),
  );
}
async function fingerprint() {
  const hash = createHash('sha256');
  async function walk(dir) {
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (['node_modules', 'dist'].includes(e.name)) continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) await walk(path);
      else {
        hash.update(path.slice(scratch.length));
        hash.update(await readFile(path));
      }
    }
  }
  await walk(join(scratch, 'libs'));
  await walk(join(scratch, 'apps/framework-benchmark/src'));
  return hash.digest('hex');
}
const report = {
  measuredAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspace,
    encoding: 'utf8',
  }).trim(),
  mode,
  environment: { node: process.version, cpu: cpus()[0].model },
  settings: {
    runs,
    iterations,
    warmup: 2,
    order: 'seeded shuffled variants per scenario/run',
    snapshots: true,
  },
  variants: [],
  samples: [],
  prototypeContracts: [],
};
const servers = [];
const browser = await chromium.launch({ headless: true });
report.environment.chromium = browser.version();
try {
  const selected =
    mode === 'counts'
      ? (process.env.CRAFT_MOUNT_DIAG_VARIANTS ?? 'counts').split(',')
      : names;
  for (const name of selected) {
    await restore();
    if (process.env.CRAFT_FLOOR_CONTRACTS === 'true') {
      const config = await readFile(join(scratch, paths.config), 'utf8');
      const changed = config.replace(
        /const frameworks = \[[\s\S]*?\];/,
        "const frameworks = ['craft', 'craft-floor-contracts'];",
      );
      assert(changed !== config);
      await writeFile(join(scratch, paths.config), changed);
    }
    await contractsBridge();
    await mutate(name);
    if(process.env.CRAFT_CREATION_PLAN==='true'){
      await patch(paths.common,'  return {\n    rows:', '  return Object.freeze({\n    rows:');
      await patch(paths.common,"indexes: p.get('indexes') === 'true',\n  };", "indexes: p.get('indexes') === 'true',\n  });");
      if(!name.includes('plan-'))
        await patch(paths.main,'begin();',"import {runCreationPlanContracts} from './creation-plan.contracts.prototype';\n(globalThis as any).__runCreationPlanContracts=runCreationPlanContracts;\nbegin();");
      await patch(paths.fanout,'const Fields = craftComponent(',"import {createCreationFields} from './creation-plan-fixtures.prototype';\nconst Fields = !coarse&&fieldCount===128?createCreationFields(readField):craftComponent(");
    }
    if(process.env.CRAFT_SYNC_LOWERING === 'true'&&!name.includes('lower-'))
      await patch(paths.main,'begin();',"import {runSyncLoweringContracts,measureSyncLowering} from './sync-lowering.contracts.prototype';\n(globalThis as any).__runSyncLoweringContracts=runSyncLoweringContracts;\n(globalThis as any).__measureSyncLowering=measureSyncLowering;\nbegin();");
    if (process.env.CRAFT_FINE_FANOUT === 'true') {
      const configText = await readFile(join(scratch, paths.config), 'utf8');
      await writeFile(
        join(scratch, paths.config),
        configText.replace(
          /const frameworks = \[[\s\S]*?\];/,
          "const frameworks = ['craft','craft-floor-contracts','craft-component-fanout'];",
        ),
      );
      await patch(
        paths.fanout,
        'const probe =',
        "const FanoutRoot=craftComponent('FanoutPlanRoot',{},()=>Fields());\nconst probe =",
      );
      await patch(
        paths.fanout,
        'provideCraftRootComponent(Fields)',
        'provideCraftRootComponent(FanoutRoot)',
      );
      if (name.startsWith('fine-') && name !== 'fine-reference') {
        await patch(
          paths.fanout,
          'const probe =',
          "import {independentFieldsFinePlan} from './fine-plan.prototype';\nif(params.get('strategy')==='plan') Object.defineProperty(Fields,'__prototypeFinePlan',{value:independentFieldsFinePlan(fields,readField," +
            (name !== 'fine-direct') +
            ')});\nconst probe =',
        );
      }
    }
    const hash = await fingerprint();
    const prototype = join(output, 'prototypes', name);
    await mkdir(prototype, { recursive: true });
    const modified = [];
    for (const path of original.keys()) {
      const text = await readFile(join(scratch, path), 'utf8');
      if (text !== original.get(path)) {
        await mkdir(dirname(join(prototype, path)), { recursive: true });
        await writeFile(join(prototype, path), text);
        modified.push(path);
      }
    }
    if ((name.includes('fine-') && !name.endsWith('reference')) || /(?:lower-fine|lower-target|target-fast)$/.test(name)) {
      const planPath =
        'apps/framework-benchmark/src/craft/fine-plan.prototype.ts';
      await mkdir(dirname(join(prototype, planPath)), { recursive: true });
      await writeFile(
        join(prototype, planPath),
        await readFile(join(scratch, planPath), 'utf8'),
      );
      modified.push(planPath);
    }
    if(name.includes('lower-')){
      for(const path of ['apps/framework-benchmark/src/craft/sync-lowering.manifest.json','libs/core/src/lib/sync-lowering.registry.ts']){
        await mkdir(dirname(join(prototype,path)),{recursive:true});
        await cp(join(scratch,path),join(prototype,path));modified.push(path);
      }
    }
    if(name.includes('plan-')){
      const path='apps/framework-benchmark/src/craft/creation-plan.manifest.json';
      await mkdir(dirname(join(prototype,path)),{recursive:true});await cp(join(scratch,path),join(prototype,path));modified.push(path);
    }
    if(process.env.CRAFT_CREATION_PLAN==='true')for(const path of [paths.creationFixture,paths.creationContracts]){
      if(!modified.includes(path)){await mkdir(dirname(join(prototype,path)),{recursive:true});await cp(join(scratch,path),join(prototype,path));modified.push(path);}
    }
    if (/fine-(records|manager)$/.test(name)) {
      await mkdir(dirname(join(prototype, managedKernelPath)), { recursive: true });
      await cp(join(scratch, managedKernelPath), join(prototype, managedKernelPath));
      modified.push(managedKernelPath);
    }
    const dist = join(scratch, `dist-${name}`),
      configFile = join(scratch, 'apps/framework-benchmark/vite.config.mjs');
    await build({
      configFile,
      logLevel: 'error',
      build: {
        outDir: dist,
        ...(process.env.CRAFT_SYNC_DEBUG === 'true' ? {minify:false,sourcemap:true}:{}),
        rolldownOptions: {
          input:
            process.env.CRAFT_FLOOR_CONTRACTS === 'true' ||
            process.env.CRAFT_FINE_FANOUT === 'true'
              ? {
                  craft: join(
                    scratch,
                    'apps/framework-benchmark/craft/index.html',
                  ),
                  ...(process.env.CRAFT_FINE_FANOUT === 'true'
                    ? {
                        'craft-component-fanout': join(
                          scratch,
                          'apps/framework-benchmark/craft-component-fanout/index.html',
                        ),
                      }
                    : {}),
                  'craft-floor-contracts': join(
                    scratch,
                    'apps/framework-benchmark/craft-floor-contracts/index.html',
                  ),
                }
              : join(scratch, 'apps/framework-benchmark/craft/index.html'),
        },
      },
    });
    const server = await preview({
      configFile,
      logLevel: 'error',
      build: { outDir: dist },
    });
    servers.push(server);
    report.variants.push({
      name,
      sourceSha256: hash,
      modified,
      url: `http://127.0.0.1:${server.httpServer.address().port}`,
      bundle: await (async()=>{
        const files=(await readdir(join(dist,'assets'))).filter(p=>p.endsWith('.js'));
        const data=await Promise.all(files.map(p=>readFile(join(dist,'assets',p))));
        return {jsBytes:data.reduce((n,b)=>n+b.length,0),gzipBytes:data.reduce((n,b)=>n+gzipSync(b).length,0),files:files.length};
      })(),
    });
    console.log(`Built ${name}: ${hash}`);
  }
  if (process.env.CRAFT_FINE_PREVIEW === 'true')
    await decorateFinePreview(report.variants, scratch);
  const cases = process.env.CRAFT_MOUNT_DIAG_CASES
    ? JSON.parse(process.env.CRAFT_MOUNT_DIAG_CASES)
    : mode === 'counts'
      ? [
          { rows: 1000, indexes: false },
          { rows: 1000, indexes: true },
          { rows: 5000, indexes: false },
        ]
      : [
          { rows: 1000, indexes: false },
          { rows: 1000, indexes: true },
          { rows: 5000, indexes: false },
          { rows: 5000, indexes: true },
        ];
  report.settings.cases = cases;
  if(process.env.CRAFT_CREATION_PLAN==='true'){
    report.creationContracts=[];
    for(const variant of report.variants){
      const context=await browser.newContext();
      try{
        const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack??e.message));
        await page.goto(`${variant.url}/craft/?rows=10&indexes=true&stableIds=true`);
        try{await page.waitForFunction(()=>Number.isFinite(window.__bench?.bootstrapMs),undefined,{timeout:10000});}
        catch(e){throw Error(`${variant.name}: ${errors.join(' | ')}; ${e.message}`);}
        const recorded=report.creationContracts[0]?.result;
        const result=await page.evaluate(recorded=>window.__runCreationPlanContracts(recorded),recorded);
        assert.deepEqual(errors,[]);if(variant.name.includes('plan-'))assert.equal(result.version,variant.name.endsWith('slots')?2:1,'Generated fixture did not activate');
        report.creationContracts.push({variant:variant.name,result});console.log(`Creation contracts ${variant.name}: passed`);
      }finally{await context.close();}
    }
  }
  if(report.variants.some(v=>v.name.includes('lower-'))){
    report.loweringContracts=[];
    for(const variant of report.variants.filter(v=>v.name.includes('lower-')||process.env.CRAFT_SYNC_LOWERING==='true')){
      const context=await browser.newContext();
      try{
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.stack??error.message));
        await page.goto(`${variant.url}/craft/?rows=10&indexes=true&stableIds=true`);
        try{await page.waitForFunction(()=>Number.isFinite(window.__bench?.bootstrapMs),undefined,{timeout:10000});}
        catch(error){throw new Error(`Lowered startup ${variant.name}: ${errors.join(' | ')}; ${error.message}`);}
        const result=await page.evaluate(()=>window.__runSyncLoweringContracts());
        assert.deepEqual(errors,[]);
        report.loweringContracts.push({variant:variant.name,result});
        if(process.env.CRAFT_SYNC_MICRO==='true'){
          report.micro??=[];
          report.micro.push({variant:variant.name,result:await page.evaluate(()=>window.__measureSyncLowering())});
        }
        console.log(`Lowering contracts ${variant.name}: passed`);
      }finally{await context.close();}
    }
  }
  if (process.env.CRAFT_FLOOR_CONTRACTS === 'true')
    for (const variant of report.variants) {
      const pure =
        variant.name.includes('fine-') ||
        variant.name.includes('shape-') ||
        variant.name.includes('more-') ||
        variant.name.includes('next-') ||
        variant.name.includes('floor-best') ||
        variant.name.includes('floor-pure') ||
        variant.name.includes('floor-all');
      const plan =
        variant.name.includes('fine-') ||
        variant.name.includes('shape-') ||
        variant.name.includes('more-') ||
        variant.name.includes('next-') ||
        variant.name.includes('floor-best') ||
        variant.name.includes('floor-plan') ||
        (variant.name.includes('floor-all') &&
          !variant.name.includes('no-plan'));
      for (const providers of [false, true]) {
        const context = await browser.newContext();
        try {
          const page = await context.newPage(),
            errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(
            `${variant.url}/craft-floor-contracts/?pure=${pure}&plan=${plan}&providers=${providers}`,
          );
          await page.waitForFunction(
            () => typeof globalThis.__runFloorContracts === 'function',
            undefined,
            { timeout: 10000 },
          );
          const recorded = report.prototypeContracts.find(
            (x) => x.providers === providers,
          )?.targets;
          const result = await page.evaluate(
            (recorded) => globalThis.__runFloorContracts(recorded),
            recorded,
          );
          assert.deepEqual(errors, []);
          report.prototypeContracts.push({ variant: variant.name, ...result });
          console.log(
            `Contracts ${variant.name} providers=${providers}: passed`,
          );
        } finally {
          await context.close();
        }
      }
    }
  if (process.env.CRAFT_NEXT_CONTRACTS === 'true') {
    report.plannedContracts = [];
    for (const variant of report.variants)
      for (const indexes of [false, true]) {
        const context = await browser.newContext();
        try {
          const page = await context.newPage(),
            errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          await page.goto(
            `${variant.url}/craft/?rows=10&indexes=${indexes}&stableIds=true`,
          );
          await page.waitForFunction(() =>
            Number.isFinite(window.__bench?.bootstrapMs),
          );
          const recorded = report.plannedContracts.find(
            (x) => x.indexes === indexes,
          )?.result;
          const result = await page.evaluate(
            (recorded) => window.__runPlannedContracts(recorded),
            recorded,
          );
          if (recorded) {
            assert.deepEqual(
              result.targets,
              recorded.targets,
              `Prepared replay addresses/scopes changed: ${variant.name}`,
            );
            if (
              !variant.name.includes('fine-') &&
              !report.plannedContracts.some((x) => x.variant.includes('fine-'))
            )
              assert.deepEqual(
                result.initialTags,
                recorded.initialTags,
                `Prepared effect tags changed: ${variant.name}`,
              );
          }
          if (['fine-direct', 'fine-shared'].includes(variant.name)) {
            const peer = report.plannedContracts.find(
              (x) =>
                x.indexes === indexes &&
                ['fine-direct', 'fine-shared'].includes(x.variant),
            );
            if (peer)
              assert.deepEqual(
                result.initialTags,
                peer.result.initialTags,
                'Shared effect factory changed tags',
              );
          }
          assert.deepEqual(errors, []);
          report.plannedContracts.push({
            variant: variant.name,
            indexes,
            result,
          });
          console.log(
            `Planned contracts ${variant.name} indexes=${indexes}: passed`,
          );
        } finally {
          await context.close();
        }
      }
  }
  if (
    process.env.CRAFT_FINE_FANOUT === 'true' &&
    process.env.CRAFT_FINE_PREVIEW !== 'true'
  )
    await runFinePlanFanout(browser, report.variants, report, output);
  let seed = 535;
  function shuffle(values) {
    const v = [...values];
    for (let i = v.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      let j = seed % (i + 1);
      [v[i], v[j]] = [v[j], v[i]];
    }
    return v;
  }
  for (const scenario of cases)
    for (let run = 0; run < (mode === 'counts' ? 1 : runs); run++)
      for (const variant of shuffle(report.variants)) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          reducedMotion: 'reduce',
        });
        try {
          const page = await context.newPage(),
            errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          if (mode === 'counts')
            await page.addInitScript(() => {
              window.__craftDiag = { counts: {}, errors: {} };
              const Native = Error;
              window.Error = new Proxy(Native, {
                construct(target, args, newTarget) {
                  const key = String(args[0] ?? '');
                  window.__craftDiag.errors[key] =
                    (window.__craftDiag.errors[key] ?? 0) + 1;
                  return Reflect.construct(target, args, newTarget);
                },
                apply(target, thisArg, args) {
                  const key = String(args[0] ?? '');
                  window.__craftDiag.errors[key] =
                    (window.__craftDiag.errors[key] ?? 0) + 1;
                  return Reflect.apply(target, thisArg, args);
                },
              });
            });
          await page.goto(
            `${variant.url}/craft/?rows=${scenario.rows}&indexes=${scenario.indexes}`,
          );
          await page.waitForFunction(() =>
            Number.isFinite(window.__bench?.bootstrapMs),
          );
          const startup = await page.evaluate(() => ({
            bootstrapMs: window.__bench.bootstrapMs,
            probe: window.__craftDiag ?? null,
            manager: window.__bindingManagerSnapshot?.(),
          }));
          if (
            mode === 'counts' &&
            (variant.name === 'counts-next-component' ||
              variant.name === 'counts-next-all' ||
              variant.name.startsWith('counts-more-') ||
              variant.name.startsWith('counts-shape-'))
          ) {
            assert.equal(
              startup.probe.counts['component.planned'],
              scenario.rows,
              'Prepared path not exercised',
            );
            assert.equal(
              startup.probe.counts.ComponentRenderedNode,
              1,
              'Generic row path unexpectedly used',
            );
          }
          if (
            mode === 'counts' &&
            ['counts-more-ranges', 'counts-more-best'].includes(variant.name)
          )
            assert.equal(
              startup.probe.counts.prototypeCreateBorrowedEntry,
              scenario.rows,
              'Borrowed entry path not exercised',
            );
          if (
            mode === 'counts' &&
            [
              'counts-more-inputs',
              'counts-more-all',
              'counts-more-best',
            ].includes(variant.name)
          )
            assert.equal(
              startup.probe.counts['input.direct'],
              scenario.rows * (scenario.indexes ? 2 : 1),
              'Direct input path not exercised',
            );
          if (mode === 'counts') {
            const control = await page.evaluate(() => {
              new Error('diagnostic-positive-control');
              Error('diagnostic-positive-control');
              return window.__craftDiag.errors['diagnostic-positive-control'];
            });
            assert.equal(control, 2);
          }
          if (mode === 'counts' && variant.name.startsWith('counts-shape-')) {
            assert.equal(
              startup.probe.counts['entry.borrowed'],
              scenario.rows,
              'Borrowed roots not exercised',
            );
            if (
              [
                'counts-shape-roots',
                'counts-shape-all',
                'counts-shape-lean',
                'counts-shape-compact',
              ].includes(variant.name)
            )
              assert.equal(
                startup.probe.counts['root.cache.populate'],
                scenario.rows,
                'Root cache not exercised',
              );
            if (
              [
                'counts-shape-layout',
                'counts-shape-all',
                'counts-shape-slots',
                'counts-shape-compact',
              ].includes(variant.name)
            ) {
              assert.equal(
                startup.probe.counts['provider.table'],
                scenario.rows,
                'Indexed provider table not exercised',
              );
              assert.equal(
                startup.probe.counts['provider.layout.compile'],
                1,
                'Expected one compiled layout',
              );
            }
          }
          if (
            mode === 'counts' &&
            variant.name.startsWith('counts-fine-') &&
            variant.name !== 'counts-fine-reference'
          ) {
            assert.equal(
              startup.probe.counts['component.fine-plan'],
              scenario.rows,
              'Fine creation plan not exercised',
            );
            assert.equal(
              startup.probe.counts['entry.borrowed'],
              scenario.rows,
              'Borrowed range not exercised',
            );
            assert.equal(
              startup.probe.counts['effect.factory.shared'] ?? 0,
              variant.name === 'counts-fine-direct' ? 0 : scenario.rows,
              'Shared factory activation mismatch',
            );
          }
          const actions = await page.evaluate(
            async ({ rows, indexes, iterations }) => {
              const result = [];
              let expected = Array.from({ length: rows }, (_, id) => ({
                  id,
                  label: `Row ${id}`,
                })),
                filtered = false;
              const nodes = () => [...document.querySelectorAll('[data-row]')];
              function check() {
                const actual = nodes(),
                  data = filtered
                    ? expected.filter((row) => row.id % 2 === 0)
                    : expected;
                if (actual.length !== data.length)
                  throw new Error('Wrong row count');
                actual.forEach((node, i) => {
                  if (
                    Number(node.dataset.row) !== data[i].id ||
                    node.textContent !==
                      `${indexes ? `${i + 1}. ` : ''}${data[i].label}`
                  )
                    throw new Error(`Wrong data ${i}`);
                  if (
                    indexes &&
                    Number(
                      node.querySelector('[data-position]').dataset.position,
                    ) !== i
                  )
                    throw new Error('Wrong position');
                });
              }
              const frame = () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                );
              const counts = () =>
                JSON.parse(JSON.stringify(window.__craftDiag ?? null));
              check();
              await frame();
              for (const action of [
                'update-one',
                'update-tenth',
                'reverse',
                'filter',
              ]) {
                for (let i = 0; i < iterations + 2; i++) {
                  const before = new Map(
                    nodes().map((node) => [node.dataset.row, node]),
                  );
                  const countBefore = counts();
                  if (action === 'update-one' || action === 'update-tenth')
                    expected = expected.map((row, index) =>
                      (action === 'update-one' ? index === 0 : index % 10 === 0)
                        ? { ...row, label: row.label + '!' }
                        : row,
                    );
                  else if (action === 'reverse') expected.reverse();
                  else filtered = !filtered;
                  const time = await window.__bench.run(action);
                  check();
                  for (const node of nodes())
                    if (
                      before.has(node.dataset.row) &&
                      before.get(node.dataset.row) !== node
                    )
                      throw new Error(`Lost identity ${action}`);
                  if (i >= 2)
                    result.push({
                      action:
                        action === 'filter'
                          ? filtered
                            ? 'filter'
                            : 'restore'
                          : action,
                      ...time,
                      countBefore,
                      countAfter: counts(),
                    });
                  await frame();
                }
                if (filtered) {
                  await window.__bench.run('filter');
                  filtered = false;
                  check();
                  await frame();
                }
              }
              return result;
            },
            { ...scenario, iterations: mode === 'counts' ? 2 : iterations },
          );
          const contracts = await page.evaluate(() =>
            window.__craftContracts(),
          );
          const signature = createHash('sha256')
            .update(JSON.stringify(contracts.tags))
            .digest('hex');
          delete contracts.tags;
          contracts.tagsSha256 = signature;
          const cdp = await context.newCDPSession(page);
          await cdp.send('HeapProfiler.collectGarbage');
          const memory = {
            ...(await cdp.send('Runtime.getHeapUsage')),
            ...(await cdp.send('Memory.getDOMCounters')),
          };
          await page.evaluate(() => window.__craftDestroy());
          const destroyed = await page.evaluate(() => ({
            rows: document.querySelectorAll('[data-row]').length,
            contracts: window.__craftContracts(),
            probe: window.__craftDiag ?? null,
          }));
          delete destroyed.contracts.tags;
          assert.equal(destroyed.rows, 0);
          assert.equal(destroyed.contracts.reports, 0);
          if (destroyed.manager)
            assert.deepEqual(destroyed.manager, { live: 0, queued: 0, scheduled: false });
          assert.deepEqual(errors, []);
          if (variant.name !== 'no-replay-registration')
            assert.equal(contracts.replay, 'resolved');
          else assert.equal(contracts.replay, 'unregistered');
          if (variant.name === 'no-effect-reports')
            assert.equal(contracts.reports, 0);
          report.samples.push({
            variant: variant.name,
            ...scenario,
            run,
            startup,
            actions,
            contracts,
            memory,
            destroyed,
            errors,
          });
          await writeFile(
            join(output, `${mode}.json`),
            JSON.stringify(report, null, 2) + '\n',
          );
          console.log(
            `${variant.name} rows=${scenario.rows} indexes=${scenario.indexes} run=${run + 1}: ${startup.bootstrapMs.toFixed(2)}ms, ${contracts.reports} effects, checks passed`,
          );
        } finally {
          await context.close();
        }
      }
  for (const sample of report.samples) {
    if (
      [
        'plain-effect-scope',
        'lazy-hydration-key',
        'shared-injector-providers',
        'combined-candidate',
        'indexed-cleanups',
        'combined-all',
        'prefix-hydration-key',
        'scopes-and-prefix',
        'inline-indexed-cleanups',
        'inline-plain-scopes',
        'inline-scopes-prefix',
        'component-rows-plain-scopes',
      ].includes(sample.variant)
    ) {
      const baseline = report.samples.find(
        (x) =>
          x.variant ===
            (sample.variant === 'component-rows-plain-scopes'
              ? 'component-rows'
              : sample.variant.startsWith('inline-')
                ? 'inline-rows'
                : 'baseline') &&
          x.rows === sample.rows &&
          x.indexes === sample.indexes &&
          x.run === sample.run,
      );
      if (baseline) {
        assert.equal(sample.contracts.reports, baseline.contracts.reports);
        assert.equal(
          sample.contracts.tagsSha256,
          baseline.contracts.tagsSha256,
        );
        assert.deepEqual(
          sample.contracts.descriptor,
          baseline.contracts.descriptor,
        );
      }
    }
  }
  if (process.env.CRAFT_FINE_PREVIEW === 'true') {
    console.log(
      'Fine plan preview ready. Ctrl+C stops and removes temporary runtimes.',
    );
    for (const variant of report.variants) {
      const strategy =
        variant.name === 'shape-lean'
          ? 'component'
          : variant.name === 'fine-reference'
            ? 'binding'
            : 'plan';
      console.log(
        `${variant.name} list: ${variant.url}/craft/?rows=1000&indexes=true`,
      );
      console.log(
        `${variant.name} fields: ${variant.url}/craft-component-fanout/?fields=128&strategy=${strategy}&counts=true`,
      );
    }
    await new Promise((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  }
  report.status = 'complete';
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await browser.close();
  for (const server of servers)
    await new Promise((resolve) => server.httpServer.close(resolve));
  await writeFile(
    join(output, `${mode}.json`),
    JSON.stringify(report, null, 2) + '\n',
  );
  await rm(scratch, { recursive: true, force: true });
}
console.log(`Report: ${join(output, `${mode}.json`)}`);
