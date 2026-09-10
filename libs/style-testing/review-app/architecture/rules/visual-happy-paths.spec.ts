import { assertVisualHappyPathArchitecture } from '@craft-ts/dev-tools';
import { reviewAttestConfig } from '../../src/review-app.happy-path';
import { loadArchitectureGraph } from '../load-graph';

describe('assertVisualHappyPathArchitecture', () => {
  it('covers every page and Craft HTTP endpoint at mobile and desktop sizes', () => {
    const graph = loadArchitectureGraph();
    const visualApp = reviewAttestConfig.visual?.app;
    if (!visualApp) throw new Error('review-attest config has no visual app.');
    assertVisualHappyPathArchitecture(graph.graph, visualApp);
  });
});
