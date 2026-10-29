/**
 * `no-unused-service`: a warning, switchable from the rule, waivable per
 * service. Run on literal graphs — the reference count itself is covered in
 * `dependency-graph.spec.ts`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  DependencyGraph,
  DependencyGraphNode,
} from './dependency-graph.ts';
import {
  architectureReport,
  assertDeclarativeArchitecture,
} from './architecture-graph.ts';
import { fnWrapperDiFindings } from './architecture-service-rules.ts';
import type { ArchitectureWaiver } from './architecture-waivers.ts';

// Other rules read the project's tsconfig from disk, so the graph points at a
// real one (with nothing to compile) rather than a made-up path.
let projectDir = '';
beforeAll(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'craft-service-rules-'));
  writeFileSync(
    join(projectDir, 'tsconfig.json'),
    JSON.stringify({ files: [] }),
  );
});
afterAll(() => rmSync(projectDir, { recursive: true, force: true }));

const service = (
  label: string,
  details: Record<string, unknown> = {},
  filePath = join(projectDir, 'src', `${label}.ts`),
): DependencyGraphNode => ({
  id: `service:${label}`,
  kind: 'service',
  label,
  filePath,
  line: 4,
  details: {
    helpers: [label, `provide${label}`],
    accessCount: 0,
    provideCount: 1,
    appStart: false,
    ...details,
  },
});

const graphOf = (...nodes: DependencyGraphNode[]): DependencyGraph => ({
  version: 1,
  rootDir: projectDir,
  tsConfigFilePath: join(projectDir, 'tsconfig.json'),
  nodes,
  edges: [],
});

const waiver = (target: string, reason = 'Kept for the demo.') =>
  ({ rule: 'no-unused-service', target, reason }) as ArchitectureWaiver;

const warned = (graph: DependencyGraph, options = {}) =>
  architectureReport(graph, options).warnings.flatMap((entry) =>
    entry.rule === 'no-unused-service' ? entry.messages : [],
  );

afterEach(() => vi.restoreAllMocks());

describe('no-unused-service', () => {
  it('warns about a service nothing reads, and does not fail the check', () => {
    const graph = graphOf(service('Dead'), service('Read', { accessCount: 3 }));

    const report = architectureReport(graph);

    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]?.messages).toEqual([
      expect.stringContaining('Service Dead (src/Dead.ts:4)'),
    ]);
    expect(report.warnings[0]?.messages[0]).toContain('provided but');
    expect(report.violations).toEqual([]);
  });

  it('says "declared" rather than "provided" for a service no one provides', () => {
    const [message] = warned(graphOf(service('Orphan', { provideCount: 0 })));

    expect(message).toContain('declared and never used');
  });

  it('never reports a service that runs at app start', () => {
    expect(warned(graphOf(service('Boot', { appStart: true })))).toEqual([]);
  });

  it('never reports a library service, or one with no named accessor', () => {
    expect(
      warned(
        graphOf(
          service('FromLib', {}, join(projectDir, '..', 'lib', 'from-lib.ts')),
          service('Anonymous', { helpers: [] }),
        ),
      ),
    ).toEqual([]);
  });

  it('can be switched off from the rule', () => {
    const graph = graphOf(service('Dead'));

    const report = architectureReport(graph, {
      severity: { 'no-unused-service': 'off' },
    });

    expect(report.warnings).toEqual([]);
    expect(report.violations).toEqual([]);
  });

  it('can be raised to an error', () => {
    const report = architectureReport(graphOf(service('Dead')), {
      severity: { 'no-unused-service': 'error' },
    });

    expect(report.warnings).toEqual([]);
    expect(report.violations.map((entry) => entry.rule)).toEqual([
      'no-unused-service',
    ]);
  });

  it('is waived per service, with the reason kept', () => {
    const graph = graphOf(service('Dead'), service('Other'));

    const report = architectureReport(graph, {
      waivers: [waiver('service:Dead')],
    });

    expect(report.warnings[0]?.messages).toEqual([
      expect.stringContaining('Service Other'),
    ]);
    expect(report.waived).toEqual([
      expect.objectContaining({
        rule: 'no-unused-service',
        target: 'service:Dead',
        reason: 'Kept for the demo.',
      }),
    ]);
  });

  it('refuses a stale waiver, since the service is read now', () => {
    const graph = graphOf(service('Read', { accessCount: 2 }));

    const report = architectureReport(graph, {
      waivers: [waiver('service:Read')],
    });

    expect(report.violations).toEqual([
      expect.objectContaining({
        rule: 'architecture-waivers',
        messages: [expect.stringContaining('is stale')],
      }),
    ]);
  });

  it('does not read the waivers of a rule that is off', () => {
    const report = architectureReport(
      graphOf(service('Read', { accessCount: 1 })),
      {
        waivers: [waiver('service:Read')],
        severity: { 'no-unused-service': 'off' },
      },
    );

    expect(report.violations).toEqual([]);
  });

  it('prints its warnings from the aggregate assertion without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() =>
      assertDeclarativeArchitecture(graphOf(service('Dead'))),
    ).not.toThrow();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('warning no-unused-service: Service Dead'),
    );
  });
});

describe('fn-wrapper-di', () => {
  const wrapper = (): DependencyGraphNode => ({
    id: 'fn-wrapper:app.ts:10:0',
    kind: 'fn-wrapper',
    label: 'provideFnWrapper@app.ts:10',
    filePath: join(projectDir, 'src', 'app.ts'),
    line: 10,
    details: { callbackResolved: true, dependencyCount: 1 },
  });

  it('reports dependencies with a narrower scope for manual review', () => {
    const scoped = service('RouteContext', { scope: 'toProvide' });
    const graph = graphOf(wrapper(), scoped);
    graph.edges.push({
      from: wrapper().id,
      to: scoped.id,
      kind: 'depends-on',
      evidence: 'ast',
    });

    const report = architectureReport(graph, {
      severity: { 'fn-wrapper-di': 'warn' },
    });

    const findings = report.warnings.find(
      (entry) => entry.rule === 'fn-wrapper-di',
    );
    expect(findings?.messages).toEqual([
      expect.stringContaining("RouteContext (providedIn: 'toProvide')"),
    ]);
    expect(findings?.messages[0]).toContain('every such context');

    const errorReport = architectureReport(graph, {
      severity: { 'fn-wrapper-di': 'error' },
    });
    expect(errorReport.violations[0]?.rule).toBe('fn-wrapper-di');
    expect(
      errorReport.warnings.some((entry) => entry.rule === 'fn-wrapper-di'),
    ).toBe(false);

    const waived = architectureReport(graph, {
      severity: { 'fn-wrapper-di': 'error' },
      waivers: [
        {
          rule: 'fn-wrapper-di',
          target: 'fn-wrapper:provideFnWrapper@app.ts:10',
          reason: 'This wrapper is only installed under the feature injector.',
        },
      ],
    });
    expect(waived.violations).toEqual([]);
    expect(waived.waived[0]?.reason).toContain('feature injector');
  });

  it('treats globally scoped and app-config provided services as safe', () => {
    const globalService = service('GlobalContext', { scope: 'global' });
    const rootService = service('RootContext', { scope: 'toProvide' });
    const appConfig: DependencyGraphNode = {
      id: 'app-config:root',
      kind: 'app-config',
      label: 'root',
    };
    const graph = graphOf(wrapper(), globalService, rootService, appConfig);
    graph.edges.push(
      {
        from: wrapper().id,
        to: globalService.id,
        kind: 'depends-on',
        evidence: 'ast',
      },
      {
        from: wrapper().id,
        to: rootService.id,
        kind: 'depends-on',
        evidence: 'ast',
      },
      {
        from: appConfig.id,
        to: rootService.id,
        kind: 'provides',
        evidence: 'type',
      },
    );

    expect(fnWrapperDiFindings(graph)).toEqual([]);
  });

  it('is disabled by default and reports unresolved callbacks when enabled', () => {
    const unresolved = wrapper();
    unresolved.details = { callbackResolved: false };
    const graph = graphOf(unresolved);

    expect(architectureReport(graph).warnings).toEqual([]);
    expect(
      architectureReport(graph, { severity: { 'fn-wrapper-di': 'warn' } })
        .warnings,
    ).toEqual([
      expect.objectContaining({
        rule: 'fn-wrapper-di',
        messages: [expect.stringContaining('Could not resolve the callback')],
      }),
    ]);
  });

  it('reports raw injection helpers that are outside the service graph', () => {
    const injected = wrapper();
    injected.details = {
      callbackResolved: true,
      unresolvedInjectionCalls: ['injectExternalToken'],
    };

    expect(fnWrapperDiFindings(graphOf(injected))).toEqual([
      expect.objectContaining({
        target: 'fn-wrapper:provideFnWrapper@app.ts:10',
        message: expect.stringContaining('injectExternalToken'),
      }),
    ]);
  });
});
