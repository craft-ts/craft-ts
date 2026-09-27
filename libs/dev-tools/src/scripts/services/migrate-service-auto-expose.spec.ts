import { Project, QuoteKind } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import {
  migrateServiceAutoExposeInFile,
  type ServiceExposeDiagnostic,
} from './migrate-service-auto-expose';

function migrate(source: string): {
  output: string;
  diagnostics: ServiceExposeDiagnostic[];
} {
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: { quoteKind: QuoteKind.Single },
  });
  const file = project.createSourceFile('/app/service.ts', source.trimStart());
  const diagnostics: ServiceExposeDiagnostic[] = [];
  migrateServiceAutoExposeInFile(file, diagnostics);
  return { output: file.getFullText(), diagnostics };
}

describe('migrate-service-auto-expose', () => {
  it('consumes craftComputed, craftMethod and craftEffect, naming unnamed computeds', () => {
    const { output } = migrate(`
import { craftComputed, craftEffect, craftMethod, craftService, state } from '@craft-ts/core';

export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
  const items = yield* state('items', [] as string[]);
  const count = craftComputed(function* () { return (yield* items()).length; });
  const reset = craftMethod('reset', function* () {});
  craftEffect('log', () => undefined);
  return { items, count, reset };
});

export class Page {
  readonly total = craftComputed('total', this, () => 1);
}
`);

    expect(output).toBe(`import { craftComputed, craftEffect, craftMethod, craftService, state, craftUse, craftPrivate } from '@craft-ts/core';

export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
  const items = yield* state('items', [] as string[]);
  yield* craftComputed('count', function* () { return (yield* items()).length; });
  yield* craftMethod('reset', function* () {});
  yield* craftPrivate(craftEffect('log', () => undefined));
});

export class Page {
  readonly total = craftUse(craftComputed('total', this, () => 1));
}
`);
  });

  it('keeps the unreturned primitives private and the read bindings', () => {
    const { output, diagnostics } = migrate(`
import { craftService, state } from '@craft-ts/core';

export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
  const draft = yield* state('draft', '');
  const items = yield* state('items', [] as string[], ({ set }) => ({
    reset: () => set([draft()]),
  }));
  return { items };
});
`);

    expect(diagnostics).toEqual([]);
    expect(output).toContain(
      "const draft = yield* craftPrivate(state('draft', ''));",
    );
    expect(output).toContain("yield* state('items', [] as string[]");
    expect(output).not.toContain('return');
  });

  it('renames a primitive exposed under another key at its source', () => {
    const { output } = migrate(`
import { craftService, query } from '@craft-ts/core';

export const { Users } = craftService({ name: 'Users', providedIn: 'global' }, function* () {
  const list = yield* query('userList', { params: () => true, loader: function* () { return []; } });
  return { users: list };
});
`);

    expect(output).toContain("yield* query('users', {");
    expect(output).not.toContain('userList');
  });

  it('exposes functions, craftGen members, constants and flattened members with craftExpose', () => {
    const { output, diagnostics } = migrate(`
import { craftGen, craftService, state } from '@craft-ts/core';
import { Api } from './api';

export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
  const api = yield* Api();
  const items = yield* state('items', [] as string[], ({ set }) => ({
    clear: () => set([]),
  }));
  return {
    add: craftGen(function* (title: string) {
      yield* items.update((list) => [...list, title]);
    }),
    format: (value: number): string => String(value),
    label: 'Todos',
    clear: items.clear,
    load() {
      return api.load();
    },
  };
});
`);

    expect(diagnostics).toEqual([]);
    expect(output).toContain(`  yield* craftExpose('add', craftGen(function* (title: string) {
    yield* items.update((list) => [...list, title]);
  }));`);
    expect(output).toContain(
      "yield* craftExpose('format', (value: number): string => String(value));",
    );
    expect(output).toContain("yield* craftExpose('label', 'Todos');");
    expect(output).toContain("yield* craftExpose('clear', items.clear);");
    expect(output).toContain(`yield* craftExpose('load', function () {
    return api.load();
  });`);
    expect(output).toContain(
      "const items = yield* craftPrivate(state('items'",
    );
  });

  it('reports a primitive returned alone and leaves it untouched', () => {
    const source = `
import { craftService, state } from '@craft-ts/core';

export const { Counter } = craftService({ name: 'Counter', providedIn: 'global' }, function* () {
  const counter = yield* state('counter', 0);
  return counter;
});
`;
    const { output, diagnostics } = migrate(source);

    expect(output).toBe(source.trimStart());
    expect(diagnostics).toMatchObject([
      { code: 'SERVICE_EXPOSE_MANUAL', service: 'Counter', manual: true },
    ]);
  });

  it('reports a spread and keeps it in the return', () => {
    const { output, diagnostics } = migrate(`
import { craftService, state } from '@craft-ts/core';
import { Api } from './api';

export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
  const api = yield* Api();
  const items = yield* state('items', []);
  return { items, ...api };
});
`);

    expect(diagnostics).toHaveLength(1);
    expect(output).toContain('return { ...api };');
    expect(output).toContain("yield* state('items', []);");
  });

  it('turns a plain factory into a generator', () => {
    const { output } = migrate(`
import { craftService } from '@craft-ts/core';

export const { Config } = craftService({ name: 'Config', providedIn: 'global' }, () => ({
  retries: 3,
}));
`);

    expect(output).toContain('function* () {');
    expect(output).toContain("yield* craftExpose('retries', 3);");
    expect(output).not.toContain('=>');
  });

  it('is idempotent', () => {
    const { output } = migrate(`
import { craftService, state } from '@craft-ts/core';

export const { Todo } = craftService({ name: 'Todo', providedIn: 'global' }, function* () {
  const draft = yield* state('draft', '');
  const items = yield* state('items', [] as string[]);
  return { items };
});
`);

    expect(migrate(output).output).toBe(output);
  });

  it('leaves the low-level craftComputed of host/craft-signal alone', () => {
    const source = `
import { craftComputed } from './host/craft-signal';

export const doubled = craftComputed(() => 2);
`;

    expect(migrate(source).output).toBe(source.trimStart());
  });
});
