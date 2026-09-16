import { designSystemScenarios } from './e2e/design-system.mocks.ts';
import {
  defineReviewAttestConfig,
  defineVisualAppConfig,
  visualMatrix,
} from '@craft-ts/style-testing';
import { dsTheme } from './src/app/examples/design-system/foundation.style.ts';

export const reviewAttestConfig = defineReviewAttestConfig({
  visual: {
    app: defineVisualAppConfig({
      sourceFiles: [
        'apps/demo/src/styles.css',
        'apps/demo/src/index.html',
        'apps/demo/e2e/fixtures/Chivo.ttf',
        'apps/demo/e2e/fixtures/Chivo-Italic.ttf',
      ],
      pages: [
        {
          id: 'design-system',
          route: '/design-system',
          url: '/design-system',
          component:
            'component:apps/demo/src/app/examples/design-system/design-system-demo.ts:designSystemDemo',
          scenarios: designSystemScenarios,
        },
      ],
    }),
    matrices: [
      {
        component:
          'component:apps/demo/src/app/examples/design-system/design-system-demo.ts:designSystemDemo',
        scenarios: visualMatrix(dsTheme),
      },
    ],
  },
  template: true,
});

export default reviewAttestConfig;
