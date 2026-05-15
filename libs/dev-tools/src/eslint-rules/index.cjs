const brandAngularGenDepsRequired = require('./brand-angular-gen-deps-required.cjs');
const brandAngularDepsMatch = require('./brand-angular-deps-match.cjs');
const appStartRegistryMatch = require('./app-start-registry-match.cjs');
const componentTestGenDepsMatch = require('./component-test-gen-deps-match.cjs');
const craftMethodNameMatch = require('./craft-method-name-match.cjs');
const noAngularInject = require('./no-angular-inject.cjs');
const noAngularSignalForms = require('./no-angular-signal-forms.cjs');
const provideHostNameMatchComponent = require('./provide-host-name-match-component.cjs');
const preferCraftHttpClient = require('./prefer-craft-http-client.cjs');
const preferCraftService = require('./prefer-craft-service.cjs');
const preferBrowserBoundaries = require('./prefer-browser-boundaries.cjs');

module.exports = {
  rules: {
    'app-start-registry-match': appStartRegistryMatch,
    'brand-angular-gen-deps-required': brandAngularGenDepsRequired,
    'brand-angular-deps-match': brandAngularDepsMatch,
    'component-test-gen-deps-match': componentTestGenDepsMatch,
    'craft-method-name-match': craftMethodNameMatch,
    'no-angular-inject': noAngularInject,
    'no-angular-signal-forms': noAngularSignalForms,
    'provide-host-name-match-component': provideHostNameMatchComponent,
    'prefer-craft-http-client': preferCraftHttpClient,
    'prefer-craft-service': preferCraftService,
    'prefer-browser-boundaries': preferBrowserBoundaries,
  },
};
