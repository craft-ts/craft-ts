import {
  defineHappyPathHttpMocks,
  defineReviewAttestConfig,
  defineVisualAppConfig,
  visualMatrix,
} from '@craft-ts/style-testing';
import { dsTheme } from './src/app/examples/design-system/foundation.style.ts';

export const reviewAttestConfig = defineReviewAttestConfig({
  visual: {
    app: defineVisualAppConfig({
      pages: [
        {
          id: 'design-system',
          route: '/design-system',
          url: '/design-system',
          component:
            'component:apps/demo/src/app/examples/design-system/design-system-demo.ts:designSystemDemo',
          mocks: defineHappyPathHttpMocks('e2e/visual-attestation.spec.ts', {}),
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
