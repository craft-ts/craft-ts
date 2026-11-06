#!/usr/bin/env node
// PROTOTYPE — interactive generic/manual/generated-plan comparison.
process.env.CRAFT_CREATION_PLAN='true';
process.env.CRAFT_MOUNT_DIAG_VARIANTS='fine-reference,fine-grouped,plan-slots';
process.env.CRAFT_MOUNT_DIAG_OUTPUT='tmp/creation-plan/preview';
await import('./fine-plan.preview.mjs');
