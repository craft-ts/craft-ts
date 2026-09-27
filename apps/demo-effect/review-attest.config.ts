import { defineReviewAttestConfig } from '@craft-ts/style-testing';

export const reviewAttestConfig = defineReviewAttestConfig({
  template: true,
  folderLayout: {
    proposal: 'apps/demo-effect/folder-layout/folder-layout-proposal.json',
    analysis: 'apps/demo-effect/folder-layout/folder-layout-analysis.json',
  },
});

export default reviewAttestConfig;
