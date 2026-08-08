const brandAngularGenDepsRequired = require('./brand-angular-gen-deps-required.cjs');
const brandAngularDepsMatch = require('./brand-angular-deps-match.cjs');
const appStartRegistryMatch = require('./app-start-registry-match.cjs');
const globalExceptionRegistryMatch = require('./global-exception-registry-match.cjs');
const componentTestGenDepsMatch = require('./component-test-gen-deps-match.cjs');
const craftMethodNameMatch = require('./craft-method-name-match.cjs');
const craftComputedNameMatch = require('./craft-computed-name-match.cjs');
const craftSourceNameMatch = require('./craft-source-name-match.cjs');
const craftSignalSourceNameMatch = require('./craft-signal-source-name-match.cjs');
const preferCraftComputed = require('./prefer-craft-computed.cjs');
const preferCraftState = require('./prefer-craft-state.cjs');
const preferCraftEffect = require('./prefer-craft-effect.cjs');
const noAngularInject = require('./no-angular-inject.cjs');
const noAngularSignalForms = require('./no-angular-signal-forms.cjs');
const provideHostNameMatchComponent = require('./provide-host-name-match-component.cjs');
const preferCraftHttpClient = require('./prefer-craft-http-client.cjs');
const preferCraftHttpTransport = require('./prefer-craft-http-transport.cjs');
const preferCraftInputOutput = require('./prefer-craft-input-output.cjs');
const preferCraftService = require('./prefer-craft-service.cjs');
const preferBrowserBoundaries = require('./prefer-browser-boundaries.cjs');
const requireComponentMonitoring = require('./require-component-monitoring.cjs');
const requirePrimitiveGeneratorUnwrap = require('./require-primitive-generator-unwrap.cjs');
const requireAssertExhaustiveRouteExceptions = require('./require-assert-exhaustive-route-exceptions.cjs');
const preferCraftRouterOutlet = require('./prefer-craft-router-outlet.cjs');
const requirePendingComponentDiCheck = require('./require-pending-component-di-check.cjs');
const requireCraftExceptionHandler = require('./require-craft-exception-handler.cjs');
const requireExceptionComponentDiCheck = require('./require-exception-component-di-check.cjs');
const requireChildRouteMountCheck = require('./require-child-route-mount-check.cjs');
const requireLazyLoadWithRetry = require('./require-lazy-load-with-retry.cjs');
const requireCascadeRouteDiCheck = require('./require-cascade-route-di-check.cjs');
const craftComponentNameMatch = require('./craft-component-name-match.cjs');
const craftDirectiveNameMatch = require('./craft-directive-name-match.cjs');
const templateElementNameUnique = require('./template-element-name-unique.cjs');
const preferCraftTemplateBlocks = require('./prefer-craft-template-blocks.cjs');
const preferCraftReactivity = require('./prefer-craft-reactivity.cjs');
const noImperativeCraftResourceTrigger = require('./no-imperative-craft-resource-trigger.cjs');
const requireCraftResourceTriggerYield = require('./require-craft-resource-trigger-yield.cjs');
const noDirectTemporalGlobals = require('./no-direct-temporal-globals.cjs');
const requirePrimitiveDerivedProperty = require('./require-primitive-derived-property.cjs');
const noAsyncAwait = require('./no-async-await.cjs');
const requirePrimitiveContext = require('./require-primitive-context.cjs');

module.exports = {
  rules: {
    'app-start-registry-match': appStartRegistryMatch,
    'global-exception-registry-match': globalExceptionRegistryMatch,
    'brand-angular-gen-deps-required': brandAngularGenDepsRequired,
    'brand-angular-deps-match': brandAngularDepsMatch,
    'component-test-gen-deps-match': componentTestGenDepsMatch,
    'craft-method-name-match': craftMethodNameMatch,
    'craft-computed-name-match': craftComputedNameMatch,
    'craft-source-name-match': craftSourceNameMatch,
    'craft-signal-source-name-match': craftSignalSourceNameMatch,
    'prefer-craft-computed': preferCraftComputed,
    'prefer-craft-state': preferCraftState,
    'prefer-craft-effect': preferCraftEffect,
    'no-angular-inject': noAngularInject,
    'no-angular-signal-forms': noAngularSignalForms,
    'provide-host-name-match-component': provideHostNameMatchComponent,
    'prefer-craft-http-client': preferCraftHttpClient,
    'prefer-craft-http-transport': preferCraftHttpTransport,
    'prefer-craft-input-output': preferCraftInputOutput,
    'prefer-craft-service': preferCraftService,
    'prefer-browser-boundaries': preferBrowserBoundaries,
    'require-component-monitoring': requireComponentMonitoring,
    'require-primitive-generator-unwrap': requirePrimitiveGeneratorUnwrap,
    'require-assert-exhaustive-route-exceptions':
      requireAssertExhaustiveRouteExceptions,
    'prefer-craft-router-outlet': preferCraftRouterOutlet,
    'require-pending-component-di-check': requirePendingComponentDiCheck,
    'require-craft-exception-handler': requireCraftExceptionHandler,
    'require-exception-component-di-check': requireExceptionComponentDiCheck,
    'require-child-route-mount-check': requireChildRouteMountCheck,
    'require-lazy-load-with-retry': requireLazyLoadWithRetry,
    'require-cascade-route-di-check': requireCascadeRouteDiCheck,
    'craft-component-name-match': craftComponentNameMatch,
    'craft-directive-name-match': craftDirectiveNameMatch,
    'template-element-name-unique': templateElementNameUnique,
    'prefer-craft-template-blocks': preferCraftTemplateBlocks,
    'prefer-craft-reactivity': preferCraftReactivity,
    'no-imperative-craft-resource-trigger': noImperativeCraftResourceTrigger,
    'require-craft-resource-trigger-yield': requireCraftResourceTriggerYield,
    'no-direct-temporal-globals': noDirectTemporalGlobals,
    'require-primitive-derived-property': requirePrimitiveDerivedProperty,
    'no-async-await': noAsyncAwait,
    'require-primitive-context': requirePrimitiveContext,
  },
};
