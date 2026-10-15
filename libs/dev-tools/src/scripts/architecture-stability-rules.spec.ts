/**
 * `route-needs-stability-test` and `looping-async-process-needs-budget`: both
 * warn by default, read the project's tests, and are waived per target.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  DependencyGraph,
  DependencyGraphNode,
} from './dependency-graph.ts';
import { architectureReport } from './architecture-graph.ts';
import type { ArchitectureWaiver } from './architecture-waivers.ts';

let projectDir = '';
beforeAll(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'craft-stability-rules-'));
  writeFileSync(join(projectDir, 'tsconfig.json'), JSON.stringify({ files: [] }));
  mkdirSync(join(projectDir, 'src'), { recursive: true });
  writeFileSync(
    join(projectDir, 'src', 'poller.ts'),
    [
      "import { asyncProcess, craftSleep } from '@craft-ts/core';",
      'export const follow = asyncProcess("follow", {',
      '  method: (everyMs: number) => everyMs,',
      '  loader: function* ({ params }) {',
      '    while (yield* following()) {',
      '      yield* craftSleep(params);',
      '    }',
      '  },',
      '});',
      'export const once = asyncProcess("once", {',
      '  method: (id: string) => id,',
      '  loader: function* ({ params }) { return params; },',
      '});',
      '',
    ].join('\n'),
  );
});
afterAll(() => rmSync(projectDir, { recursive: true, force: true }));

const route = (path: string, hasComponent = true): DependencyGraphNode => ({
  id: `route:${path}`,
  kind: 'route',
  label: `app:${path}`,
  filePath: join(projectDir, 'src', 'app.routes.ts'),
  line: 3,
  details: { collection: 'app', path, hasComponent },
});

const asyncProcessNode = (name: string, line: number): DependencyGraphNode => ({
  id: `primitive:${name}`,
  kind: 'primitive',
  label: `asyncProcess:${name}`,
  filePath: join(projectDir, 'src', 'poller.ts'),
  line,
  details: { primitive: 'asyncProcess', name, ownerId: 'x' },
});

const graphOf = (...nodes: DependencyGraphNode[]): DependencyGraph => ({
  version: 1,
  rootDir: projectDir,
  tsConfigFilePath: join(projectDir, 'tsconfig.json'),
  nodes,
  edges: [],
});

const warnings = (graph: DependencyGraph, rule: string, options = {}) =>
  architectureReport(graph, options)
    .warnings.filter((entry) => entry.rule === rule)
    .flatMap((entry) => entry.messages);

const writeTest = (name: string, body: string) =>
  writeFileSync(join(projectDir, 'src', name), body);

beforeEach(() => {
  rmSync(join(projectDir, 'src', 'pages.spec.ts'), { force: true });
});

describe('route-needs-stability-test', () => {
  it('warns about a routed page no stability test mounts', () => {
    const [message] = warnings(
      graphOf(route('sessions')),
      'route-needs-stability-test',
    );
    expect(message).toContain('route app:sessions has no stability test');
    expect(message).toContain("expectRouteToSettle(routes, '/sessions')");
  });

  it('is satisfied by a test naming the url, including a parameterised one', () => {
    writeTest(
      'pages.spec.ts',
      [
        "await expectRouteToSettle(routes, '/sessions?tab=a');",
        "await expectRouteToSettle(routes, '/sessions/42/detail');",
        "await expectPageToSettleInBrowser(page, 'http://localhost/');",
        "await expectRouteToSettle(routes, '/');",
      ].join('\n'),
    );
    expect(
      warnings(
        graphOf(route('sessions'), route('sessions/:id/detail'), route('')),
        'route-needs-stability-test',
      ),
    ).toEqual([]);
  });

  it('is not satisfied by a url that only shares a prefix', () => {
    writeTest('pages.spec.ts', "await expectRouteToSettle(routes, '/sessions-archive');");
    expect(
      warnings(graphOf(route('sessions')), 'route-needs-stability-test'),
    ).toHaveLength(1);
  });

  it('ignores redirects, wildcards and routes it cannot name', () => {
    expect(
      warnings(
        graphOf(route('old', false), route('**'), route('<dynamic>')),
        'route-needs-stability-test',
      ),
    ).toEqual([]);
  });

  it('can be raised to an error and waived per route', () => {
    const graph = graphOf(route('sessions'), route('settings'));
    const raised = architectureReport(graph, {
      severity: { 'route-needs-stability-test': 'error' },
    });
    expect(raised.violations.map((entry) => entry.rule)).toContain(
      'route-needs-stability-test',
    );
    const waived = architectureReport(graph, {
      severity: { 'route-needs-stability-test': 'error' },
      waivers: [
        {
          rule: 'route-needs-stability-test',
          target: 'route:app:sessions',
          reason: 'Covered by the dashboard end-to-end suite.',
        } as ArchitectureWaiver,
      ],
    });
    expect(waived.waived.map((entry) => entry.target)).toEqual(['route:app:sessions']);
    expect(waived.violations.flatMap((entry) => entry.messages).join('\n')).toContain(
      'app:settings',
    );
  });
});

describe('looping-async-process-needs-budget', () => {
  it('warns about an asyncProcess that loops, not one that returns', () => {
    const messages = warnings(
      graphOf(asyncProcessNode('follow', 2), asyncProcessNode('once', 10)),
      'looping-async-process-needs-budget',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('asyncProcess:follow loops');
    expect(messages[0]).toContain("budget.perKey");
  });

  it('is satisfied by a budget naming the primitive, or a glob over it', () => {
    writeTest(
      'pages.spec.ts',
      "await expectRouteToSettle(routes, '/x', { budget: { perKey: { 'asyncProcess:follow': { loaderRuns: 2 } } } });",
    );
    expect(
      warnings(graphOf(asyncProcessNode('follow', 2)), 'looping-async-process-needs-budget'),
    ).toEqual([]);

    writeTest(
      'pages.spec.ts',
      "await expectRouteToSettle(routes, '/x', { budget: { perKey: { 'asyncProcess:*': { loaderRuns: 2 } } } });",
    );
    expect(
      warnings(graphOf(asyncProcessNode('follow', 2)), 'looping-async-process-needs-budget'),
    ).toEqual([]);
  });

  it('does not take a budget written outside a stability call', () => {
    writeTest('pages.spec.ts', "const unrelated = 'asyncProcess:follow';");
    expect(
      warnings(graphOf(asyncProcessNode('follow', 2)), 'looping-async-process-needs-budget'),
    ).toHaveLength(1);
  });
});
