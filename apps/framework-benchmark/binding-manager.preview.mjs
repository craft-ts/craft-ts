#!/usr/bin/env node
// PROTOTYPE — compare 128 independent bindings interactively.
process.env.CRAFT_MOUNT_DIAG_VARIANTS = 'fine-grouped,fine-watch,fine-manager';
process.env.CRAFT_MOUNT_DIAG_OUTPUT = 'tmp/binding-manager-preview';
await import('./fine-plan.preview.mjs');
