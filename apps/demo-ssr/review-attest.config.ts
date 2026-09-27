import { defineReviewAttestConfig } from '@craft-ts/style-testing';

export const reviewAttestConfig = defineReviewAttestConfig({
  folderLayout: {
    proposal: 'apps/demo-ssr/folder-layout/folder-layout-proposal.json',
    analysis: 'apps/demo-ssr/folder-layout/folder-layout-analysis.json',
  },
});

export default reviewAttestConfig;
