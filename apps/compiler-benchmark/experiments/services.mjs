import {
  prepareCandidate,
  replaceOnce,
  lab,
  normalizeLabConfigs,
} from './prepare.mjs';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const runtime = 'libs/core/src/lib/craft-generator-runtime.ts';
const service = 'libs/core/src/lib/craft-service.ts';
const yieldable = 'libs/core/src/lib/yieldable.ts';
const candidates = {
  baseline: [],
  'empty-wrapper': [
    {
      file: runtime,
      change: (source) =>
        replaceOnce(
          source,
          `  const context: ServiceYieldContext = {
    name: request.name,
    providedIn: request.providedIn,`,
          `  const name = request.name;
  const providedIn = request.providedIn;
  if (wrappers.length === 0) {
    return request.resolve(injector, hostScope);
  }
  const context: ServiceYieldContext = {
    name,
    providedIn,`,
        ).replace(
          `
  if (wrappers.length === 0) {
    return context.resolve();
  }
`,
          '\n',
        ),
    },
  ],
  'bound-resolvers': [
    {
      file: service,
      change: (source) => {
        const start = source.indexOf('function createYieldRequest(');
        const end = source.indexOf('\nfunction uncapitalizeFirst(', start);
        const before = source.slice(start, end);
        let after = before.replace(
          `resolve: (service: unknown) => {`,
          `resolve: resolveExposure.bind(undefined, definition.name, exposedAs, path),\n          },\n        }\n      : {}),\n    providedIn: definition.providedIn,\n    resolve: resolveYieldRequest.bind(undefined, definition, bindings),\n  };\n}\n\nfunction resolveExposure(name: string, exposedAs: string, path: readonly string[], service: unknown) {`,
        );
        const suffix = after.indexOf(
          `\n          },\n        }\n      : {}),\n    providedIn: definition.providedIn,\n    resolve: (injector, hostScope) => {`,
        );
        if (suffix < 0) throw Error('Missing resolver suffix');
        after =
          after.slice(0, suffix).replace(/\s+\},$/, '') +
          '\n}\n\nfunction resolveYieldRequest(definition: ConcreteRuntimeDefinition, bindings: ConcreteServiceBindings | undefined, injector: Injector, hostScope: ConcreteServiceScope) {\n  assertDependencyScope(hostScope, definition.providedIn, definition.name);\n  return resolveConcreteService(definition, injector, bindings);\n}\n';
        after = after.replace(
          'exposedAs === uncapitalizeFirst(definition.name)\n              )',
          'exposedAs === uncapitalizeFirst(name)\n              )',
        );
        return replaceOnce(source, before, after);
      },
    },
  ],
  // Deliberately incorrect ceiling: contracts must demonstrate why this is rejected.
  'mark-once-ceiling': [
    {
      file: yieldable,
      change: (source) =>
        replaceOnce(
          source,
          `/** Brands direct reactive members of a runtime value with their property names. */`,
          `const performanceMarked = new WeakSet<object>();
/** Brands direct reactive members of a runtime value with their property names. */`,
        ).replace(
          `  for (const key of Reflect.ownKeys(value as object)) {`,
          `  if (performanceMarked.has(value as object)) return value;\n  performanceMarked.add(value as object);\n  for (const key of Reflect.ownKeys(value as object)) {`,
        ),
    },
  ],
  // Only frozen data objects are stable. Accessors/proxies remain observable;
  // this is a restricted experiment, not an ownership/versioning solution.
  'mark-frozen': [
    {
      file: yieldable,
      change: (source) =>
        replaceOnce(
          source,
          `/** Brands direct reactive members of a runtime value with their property names. */`,
          `const performanceMarked = new WeakSet<object>();
/** Brands direct reactive members of a runtime value with their property names. */`,
        )
          .replace(
            `  for (const key of Reflect.ownKeys(value as object)) {`,
            `  if (performanceMarked.has(value as object)) return value;
  const stable = Object.isFrozen(value) && Reflect.ownKeys(value as object).every(key => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value as object, key);
    return descriptor !== undefined && 'value' in descriptor;
  });
  for (const key of Reflect.ownKeys(value as object)) {`,
          )
          .replace(
            `  return value;\n}\n\nexport function isYieldableMethod`,
            `  if (stable) performanceMarked.add(value as object);\n  return value;\n}\n\nexport function isYieldableMethod`,
          ),
    },
  ],
};

for (const id of process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(candidates)) {
  if (!(id in candidates)) throw Error('Unknown candidate ' + id);
  const root = join(lab, 'roots', id);
  try {
    await access(join(root, 'candidate.json'));
  } catch {
    await prepareCandidate(id, candidates[id]);
  }
  await normalizeLabConfigs(root);
  await writeFile(
    join(root, 'libs/core/src/lib/performance-campaign.spec.ts'),
    await readFile(new URL('./services.contracts.ts', import.meta.url)),
  );
  console.log(root);
}
