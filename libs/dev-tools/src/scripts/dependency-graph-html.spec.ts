import { describe, expect, it } from 'vitest';
import { dependencyGraphToHtml, type DependencyGraph } from './dependency-graph';

const graph: DependencyGraph = {
  version: 1,
  rootDir: '/repo',
  tsConfigFilePath: '/repo/tsconfig.json',
  nodes: [
    {
      id: 'route:home',
      kind: 'route',
      label: 'home',
      filePath: '/repo/src/routes.ts',
      line: 1,
      metrics: { fanIn: 0, fanOut: 1 },
    },
    {
      id: 'component:Home',
      kind: 'component',
      label: 'Home',
      filePath: '/repo/src/home.ts',
      line: 1,
      endLine: 9,
      metrics: {
        cyclomaticOwn: 3,
        cyclomaticTotal: 7,
        lines: 9,
        fanIn: 1,
        fanOut: 0,
        coverage: { statements: 4, covered: 3 },
      },
      doc: {
        summary: 'The landing page.',
        rationale: ['WHY: </script> must stay escaped'],
      },
    },
  ],
  edges: [{ from: 'route:home', to: 'component:Home', kind: 'loads', evidence: 'ast' }],
};

function inlineScript(html: string): string {
  return html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
}

describe('dependency explorer', () => {
  it('embeds metrics, documentation and hotspots without breaking out of the script', () => {
    const html = dependencyGraphToHtml(graph);

    expect(html).toContain('"cyclomaticTotal":7');
    expect(html).toContain('The landing page.');
    expect(html).not.toContain('</script> must');
    // 7 × (1 + fan-in 1) × (1 + churn 0); the route has no measured complexity.
    expect(html).toContain('const HOTSPOTS = [{"id":"component:Home","score":14}];');
  });

  it('offers the heat map, path search, hotspots and unknown values', () => {
    const html = dependencyGraphToHtml(graph);

    expect(html).toContain('id="heatmap"');
    for (const value of ['none', 'complexity', 'fan-in', 'coverage']) {
      expect(html).toContain(`<option value="${value}">`);
    }
    expect(html).toContain('data-path-from');
    expect(html).toContain('data-path-to');
    expect(html).toContain('id="hotspots"');
    expect(html).toContain('heat-unknown');
    expect(html).toContain('inconnu');
  });

  it('ships a script that parses', () => {
    expect(() => new Function(inlineScript(dependencyGraphToHtml(graph)))).not.toThrow();
  });
});
