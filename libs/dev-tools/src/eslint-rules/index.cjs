const brandAngularGenDepsRequired = require('./brand-angular-gen-deps-required.cjs');
const brandAngularDepsMatch = require('./brand-angular-deps-match.cjs');
const appStartRegistryMatch = require('./app-start-registry-match.cjs');
const noAngularInject = require('./no-angular-inject.cjs');
const preferCraftHttpClient = require('./prefer-craft-http-client.cjs');
const preferCraftService = require('./prefer-craft-service.cjs');
const preferBrowserBoundaries = require('./prefer-browser-boundaries.cjs');

module.exports = {
  rules: {
    'app-start-registry-match': appStartRegistryMatch,
    'brand-angular-gen-deps-required': brandAngularGenDepsRequired,
    'brand-angular-deps-match': brandAngularDepsMatch,
    'no-angular-inject': noAngularInject,
    'prefer-craft-http-client': preferCraftHttpClient,
    'prefer-craft-service': preferCraftService,
    'prefer-browser-boundaries': preferBrowserBoundaries,
  },
};
