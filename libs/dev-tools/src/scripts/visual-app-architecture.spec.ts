import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import {
  visualHappyPathArchitectureViolations,
  type VisualHappyPathArchitectureConfig,
} from './architecture-graph.js';
import type { DependencyGraph } from './dependency-graph.js';

it('checks scenario-specific imports, reachable HTTP endpoints and business exceptions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'visual-architecture-'));
  try {
    await writeFile(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'es2022',
          module: 'esnext',
          moduleResolution: 'bundler',
        },
        include: ['*.ts'],
      }),
    );
    await writeFile(
      join(root, 'page.mocks.ts'),
      'export const responses = { endpoints: [] };',
    );
    await writeFile(
      join(root, 'unused.mocks.ts'),
      'export const responses = { endpoints: [] };',
    );
    await writeFile(
      join(root, 'recipes.ts'),
      `import { responses as fixtures } from './page.mocks';
      export const recipes = [{ id: 'happy', category: 'happy-path', mocks: fixtures }, { id: 'conflict', category: 'exception', mocks: fixtures }];`,
    );
    const component = 'component:page.ts:Page';
    const modal = 'component:modal.ts:Modal';
    const graph: DependencyGraph = {
      version: 1,
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
      nodes: [
        {
          id: component,
          kind: 'component',
          label: 'Page',
          filePath: join(root, 'page.ts'),
        },
        {
          id: modal,
          kind: 'component',
          label: 'Modal',
          filePath: join(root, 'modal.ts'),
        },
        {
          id: 'route',
          kind: 'route',
          label: '/',
          details: { path: '', hasComponent: true },
        },
        {
          id: 'orders',
          kind: 'http-endpoint',
          label: 'GET /orders',
          details: { method: 'GET', url: '/orders', exceptions: ['Conflict'] },
        },
        {
          id: 'details',
          kind: 'http-endpoint',
          label: 'GET /details',
          details: { method: 'GET', url: '/details' },
        },
      ],
      edges: [
        { from: component, to: 'orders', kind: 'calls', evidence: 'ast' },
        { from: modal, to: 'details', kind: 'calls', evidence: 'ast' },
      ],
    };
    const successful = {
      method: 'GET',
      url: '/orders',
      mode: 'mock',
      response: { kind: 'success' },
    };
    const detail = {
      method: 'GET',
      url: '/details',
      mode: 'mock',
      response: { kind: 'success' },
    };
    const config: VisualHappyPathArchitectureConfig = {
      viewports: { custom: { width: 400, height: 800 } },
      pages: [
        {
          id: 'home',
          route: '/',
          url: '/',
          component,
          scenarios: [
            {
              id: 'happy',
              category: 'happy-path',
              mocks: {
                sources: ['page.mocks.ts'],
                endpoints: [successful, detail],
              },
              modals: [{ id: 'dialog', component: modal }],
              steps: [{ action: 'capture', id: 'dialog', modal: 'dialog' }],
            },
            {
              id: 'conflict',
              category: 'exception',
              mocks: {
                sources: ['page.mocks.ts'],
                endpoints: [
                  {
                    ...successful,
                    response: { kind: 'exception', exception: 'Conflict' },
                  },
                ],
              },
              exception: { endpoint: 'GET /orders', discriminant: 'Conflict' },
              steps: [{ action: 'capture', id: 'error' }],
            },
          ],
        },
      ],
    };
    expect(visualHappyPathArchitectureViolations(graph, config)).toEqual([]);
    const first = config.pages[0]!;
    const scenario = first.scenarios![0]!;
    const missing = {
      ...config,
      pages: [
        {
          ...first,
          scenarios: [
            {
              ...scenario,
              mocks: { sources: ['page.mocks.ts'], endpoints: [successful] },
            },
          ],
        },
      ],
    };
    const problems = visualHappyPathArchitectureViolations(graph, missing);
    expect(
      problems.some(
        (p) => p.kind === 'missing-http-mock' && p.message.includes('/details'),
      ),
    ).toBe(true);
    expect(problems.some((p) => p.kind === 'missing-exception')).toBe(true);
    const fakeImport = {
      ...config,
      pages: [
        {
          ...first,
          scenarios: [
            {
              ...scenario,
              mocks: {
                sources: ['unused.mocks.ts'],
                endpoints: [successful, detail],
              },
            },
          ],
        },
      ],
    };
    expect(
      visualHappyPathArchitectureViolations(graph, fakeImport).some(
        (p) => p.kind === 'fixture-file',
      ),
    ).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
