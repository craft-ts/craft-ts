const brandAngularGenDepsRequired = require('./brand-angular-gen-deps-required.cjs');
const brandAngularDepsMatch = require('./brand-angular-deps-match.cjs');
const appStartRegistryMatch = require('./app-start-registry-match.cjs');
const globalExceptionRegistryMatch = require('./global-exception-registry-match.cjs');
const componentTestGenDepsMatch = require('./component-test-gen-deps-match.cjs');
const craftMethodNameMatch = require('./craft-method-name-match.cjs');
const craftComputedNameMatch = require('./craft-computed-name-match.cjs');
const preferCraftComputed = require('./prefer-craft-computed.cjs');
const preferCraftState = require('./prefer-craft-state.cjs');
const preferCraftEffect = require('./prefer-craft-effect.cjs');
const noAngularInject = require('./no-angular-inject.cjs');
const noAngularSignalForms = require('./no-angular-signal-forms.cjs');
const provideHostNameMatchComponent = require('./provide-host-name-match-component.cjs');
const preferCraftHttpClient = require('./prefer-craft-http-client.cjs');
const preferCraftService = require('./prefer-craft-service.cjs');
const preferBrowserBoundaries = require('./prefer-browser-boundaries.cjs');
const requireComponentMonitoring = require('./require-component-monitoring.cjs');
const requireTrackOnDependentPrimitives = require('./require-track-on-dependent-primitives.cjs');
const requireAssertExhaustiveRouteExceptions = require('./require-assert-exhaustive-route-exceptions.cjs');
const preferCraftRouterOutlet = require('./prefer-craft-router-outlet.cjs');
const requirePendingComponentDiCheck = require('./require-pending-component-di-check.cjs');
const requireCraftExceptionHandler = require('./require-craft-exception-handler.cjs');
const requireExceptionComponentDiCheck = require('./require-exception-component-di-check.cjs');
const requireChildRouteMountCheck = require('./require-child-route-mount-check.cjs');

module.exports = {
  rules: {
    'app-start-registry-match': appStartRegistryMatch,
    'global-exception-registry-match': globalExceptionRegistryMatch,
    'brand-angular-gen-deps-required': brandAngularGenDepsRequired,
    'brand-angular-deps-match': brandAngularDepsMatch,
    'component-test-gen-deps-match': componentTestGenDepsMatch,
    'craft-method-name-match': craftMethodNameMatch,
    'craft-computed-name-match': craftComputedNameMatch,
    'prefer-craft-computed': preferCraftComputed,
    'prefer-craft-state': preferCraftState,
    'prefer-craft-effect': preferCraftEffect,
    'no-angular-inject': noAngularInject,
    'no-angular-signal-forms': noAngularSignalForms,
    'provide-host-name-match-component': provideHostNameMatchComponent,
    'prefer-craft-http-client': preferCraftHttpClient,
    'prefer-craft-service': preferCraftService,
    'prefer-browser-boundaries': preferBrowserBoundaries,
    'require-component-monitoring': requireComponentMonitoring,
    'require-track-on-dependent-primitives': requireTrackOnDependentPrimitives,
    'require-assert-exhaustive-route-exceptions':
      requireAssertExhaustiveRouteExceptions,
    'prefer-craft-router-outlet': preferCraftRouterOutlet,
    'require-pending-component-di-check': requirePendingComponentDiCheck,
    'require-craft-exception-handler': requireCraftExceptionHandler,
    'require-exception-component-di-check': requireExceptionComponentDiCheck,
    'require-child-route-mount-check': requireChildRouteMountCheck,
  },
};
