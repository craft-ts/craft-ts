#!/usr/bin/env node

import { runAngularBrandCodemod } from '../scripts/angular-brand-codemod.js';

runAngularBrandCodemod({
  log: console.log,
}).catch((error) => {
  console.error('Error running codemod:', error);
  process.exit(1);
});
