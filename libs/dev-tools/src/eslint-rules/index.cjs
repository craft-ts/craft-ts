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
const noCraftComputedSideEffects = require('./no-craft-computed-side-effects.cjs');
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
const requireYieldableTemplateMethod = require('./require-yieldable-template-method.cjs');
const requireCraftMethodForYieldableCallback = require('./require-craft-method-for-yieldable-callback.cjs');
const requireYieldableReactiveRead = require('./require-yieldable-reactive-read.cjs');
const requireYieldableInsertionWrite = require('./require-yieldable-insertion-write.cjs');
const preferDirectYieldableCallback = require('./prefer-direct-yieldable-callback.cjs');
const noCraftUseInTemplate = require('./no-craft-use-in-template.cjs');
const noEphemeralTemplateFormState = require('./no-ephemeral-template-form-state.cjs');
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
const noThrow = require('./no-throw.cjs');
const noRenderWrites = require('./no-render-writes.cjs');
const requireReactiveTemplateBindings = require('./require-reactive-template-bindings.cjs');
const craftCssVarsContract = require('./craft-css-vars-contract.cjs');
const craftStylesScopeSafe = require('./craft-styles-scope-safe.cjs');
const craftCssVarNaming = require('./craft-css-var-naming.cjs');
const craftCssTokenRegistry = require('./craft-css-token-registry.cjs');
const noHardcodedDesignValues = require('./no-hardcoded-design-values.cjs');
const noImportantInComponentStyles = require('./no-important-in-component-styles.cjs');
const preferNamedHtmlHelpers = require('./prefer-named-html-helpers.cjs');
const imgHasAlt = require('./img-has-alt.cjs');
const controlHasAccessibleName = require('./control-has-accessible-name.cjs');
const labelHasAssociatedControl = require('./label-has-associated-control.cjs');
const noNoninteractiveElementInteractions = require('./no-noninteractive-element-interactions.cjs');
const anchorHasHref = require('./anchor-has-href.cjs');
const buttonHasType = require('./button-has-type.cjs');
const requireInteractiveLocalName = require('./require-interactive-local-name.cjs');
const iframeHasTitle = require('./iframe-has-title.cjs');
const headingHasContent = require('./heading-has-content.cjs');
const preferRelativeHeading = require('./prefer-relative-heading.cjs');
const requireRouteHeadingOutline = require('./require-route-heading-outline.cjs');
const requireOutletHeadingSection = require('./require-outlet-heading-section.cjs');
const noHeadingLevelSkip = require('./no-heading-level-skip.cjs');
const noPositiveTabindex = require('./no-positive-tabindex.cjs');
const validAria = require('./valid-aria.cjs');
const roleHasRequiredAria = require('./role-has-required-aria.cjs');
const targetBlankNoopener = require('./target-blank-noopener.cjs');
const requireFocusVisible = require('./require-focus-visible.cjs');
const requireReducedMotion = require('./require-reduced-motion.cjs');

const plugin = {
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
    'no-craft-computed-side-effects': noCraftComputedSideEffects,
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
    'require-yieldable-template-method': requireYieldableTemplateMethod,
    'require-craft-method-for-yieldable-callback':
      requireCraftMethodForYieldableCallback,
    'require-yieldable-reactive-read': requireYieldableReactiveRead,
    'require-yieldable-insertion-write': requireYieldableInsertionWrite,
    'prefer-direct-yieldable-callback': preferDirectYieldableCallback,
    'no-craft-use-in-template': noCraftUseInTemplate,
    'no-ephemeral-template-form-state': noEphemeralTemplateFormState,
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
    'no-throw': noThrow,
    'no-render-writes': noRenderWrites,
    'require-reactive-template-bindings': requireReactiveTemplateBindings,
    'craft-css-vars-contract': craftCssVarsContract,
    'craft-styles-scope-safe': craftStylesScopeSafe,
    'craft-css-var-naming': craftCssVarNaming,
    'craft-css-token-registry': craftCssTokenRegistry,
    'no-hardcoded-design-values': noHardcodedDesignValues,
    'no-important-in-component-styles': noImportantInComponentStyles,
    'prefer-named-html-helpers': preferNamedHtmlHelpers,
    'img-has-alt': imgHasAlt,
    'control-has-accessible-name': controlHasAccessibleName,
    'label-has-associated-control': labelHasAssociatedControl,
    'no-noninteractive-element-interactions': noNoninteractiveElementInteractions,
    'anchor-has-href': anchorHasHref,
    'button-has-type': buttonHasType,
    'require-interactive-local-name': requireInteractiveLocalName,
    'iframe-has-title': iframeHasTitle,
    'heading-has-content': headingHasContent,
    'prefer-relative-heading': preferRelativeHeading,
    'require-route-heading-outline': requireRouteHeadingOutline,
    'require-outlet-heading-section': requireOutletHeadingSection,
    'no-heading-level-skip': noHeadingLevelSkip,
    'no-positive-tabindex': noPositiveTabindex,
    'valid-aria': validAria,
    'role-has-required-aria': roleHasRequiredAria,
    'target-blank-noopener': targetBlankNoopener,
    'require-focus-visible': requireFocusVisible,
    'require-reduced-motion': requireReducedMotion,
  },
};

const a11yRuleSeverity = {
  'craft-ng/prefer-named-html-helpers': 'error',
  'craft-ng/img-has-alt': 'error',
  'craft-ng/control-has-accessible-name': 'error',
  'craft-ng/label-has-associated-control': 'error',
  'craft-ng/no-noninteractive-element-interactions': 'error',
  'craft-ng/anchor-has-href': 'error',
  'craft-ng/button-has-type': 'error',
  'craft-ng/require-interactive-local-name': 'error',
  'craft-ng/iframe-has-title': 'error',
  'craft-ng/heading-has-content': 'error',
  'craft-ng/prefer-relative-heading': 'error',
  'craft-ng/require-route-heading-outline': 'error',
  'craft-ng/require-outlet-heading-section': 'error',
  'craft-ng/no-heading-level-skip': 'error',
  'craft-ng/no-positive-tabindex': 'error',
  'craft-ng/valid-aria': 'error',
  'craft-ng/role-has-required-aria': 'error',
  'craft-ng/target-blank-noopener': 'error',
  'craft-ng/require-focus-visible': 'error',
  'craft-ng/require-reduced-motion': 'error',
};

plugin.configs = {
  a11y: {
    plugins: { 'craft-ng': plugin },
    rules: a11yRuleSeverity,
  },
};

module.exports = plugin;
