import { assertVisualHappyPathArchitecture } from '@craft-ts/dev-tools';
import { reviewAttestConfig } from '../../src/review-app.happy-path';
import { loadArchitectureGraph } from '../load-graph';

describe('assertVisualHappyPathArchitecture', () => {
  it('covers pages, scenarios, fixtures, declared modals and configured viewports', () => {
    const graph = loadArchitectureGraph();
    const visualApp = reviewAttestConfig.visual?.app;
    if (!visualApp) throw new Error('review-attest config has no visual app.');
    assertVisualHappyPathArchitecture(graph.graph, visualApp);
  });
});
