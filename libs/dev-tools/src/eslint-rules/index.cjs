const appStartRegistryMatch = require('./app-start-registry-match.cjs');
const globalExceptionRegistryMatch = require('./global-exception-registry-match.cjs');
const craftMethodNameMatch = require('./craft-method-name-match.cjs');
const craftComputedNameMatch = require('./craft-computed-name-match.cjs');
const craftSourceNameMatch = require('./craft-source-name-match.cjs');
const craftSignalSourceNameMatch = require('./craft-signal-source-name-match.cjs');
const noCraftComputedSideEffects = require('./no-craft-computed-side-effects.cjs');
const provideHostNameMatchComponent = require('./provide-host-name-match-component.cjs');
const preferCraftHttpTransport = require('./prefer-craft-http-transport.cjs');
const noCraftServiceComponentSameFile = require('./no-craft-service-component-same-file.cjs');
const noRawCssValue = require('./no-raw-css-value.cjs');
const noRawClass = require('./no-raw-class.cjs');
const noFreeHas = require('./no-free-has.cjs');
const styleFileBoundary = require('./style-file-boundary.cjs');
const preferBrowserBoundaries = require('./prefer-browser-boundaries.cjs');
const requireComponentMonitoring = require('./require-component-monitoring.cjs');
const requirePrimitiveGeneratorUnwrap = require('./require-primitive-generator-unwrap.cjs');
const requireYieldableTemplateMethod = require('./require-yieldable-template-method.cjs');
const requireCraftMethodForYieldableCallback = require('./require-craft-method-for-yieldable-callback.cjs');
const requireYieldableReactiveRead = require('./require-yieldable-reactive-read.cjs');
const requireYieldableInsertionWrite = require('./require-yieldable-insertion-write.cjs');
const preferDirectYieldableCallback = require('./prefer-direct-yieldable-callback.cjs');
const noCraftUseInTemplate = require('./no-craft-use-in-template.cjs');
const noCraftUse = require('./no-craft-use.cjs');
const noTypeAssertionsInTemplate = require('./no-type-assertions-in-template.cjs');
const noEphemeralTemplateFormState = require('./no-ephemeral-template-form-state.cjs');
const requireAssertExhaustiveRouteExceptions = require('./require-assert-exhaustive-route-exceptions.cjs');
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
const noImperativeCraftResourceTrigger = require('./no-imperative-craft-resource-trigger.cjs');
const noTransitionActions = require('./no-transition-actions.cjs');
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
const requireEffectAdapters = require('./require-effect-adapters.cjs');
const syncEffectBody = require('./sync-effect-body.cjs');
const serverFunctionClientMatch = require('./server-function-client-match.cjs');
const noInvalidInsertionPipe = require('./no-invalid-insertion-pipe.cjs');
const noRedundantPrimitiveInsertion = require('./no-redundant-primitive-insertion.cjs');
const noEffectOutsideLoaders = require('./no-effect-outside-loaders.cjs');
const noExplicitEffectType = require('./no-explicit-effect-type.cjs');
const preferInlineEffectInsertion = require('./prefer-inline-effect-insertion.cjs');
const preferInlineRouteProviders = require('./prefer-inline-route-providers.cjs');
const preferQueryMethodOverStateTrigger = require('./prefer-query-method-over-state-trigger.cjs');
const noInjectionToken = require('./no-injection-token.cjs');
const noManualRouteProviderList = require('./no-manual-route-provider-list.cjs');
const noWidenedRouteProviderContext = require('./no-widened-route-provider-context.cjs');
const requireRouteSecurityPolicy = require('./require-route-security-policy.cjs');
const requireServerFunctionTimeout = require('./require-server-function-timeout.cjs');
const noAuthTokenInLocalStorage = require('./no-auth-token-in-local-storage.cjs');
const noRawUserUrl = require('./no-raw-user-url.cjs');
const noUnsafeTransferState = require('./no-unsafe-transfer-state.cjs');
const noUnsafeHtml = require('./no-unsafe-html.cjs');
const noTrustForwardedHeaders = require('./no-trust-forwarded-headers.cjs');
const recommendedRules = require('./recommended-config.cjs');
const securityRules = require('./security-config.cjs');

const plugin = {
  rules: {
    'app-start-registry-match': appStartRegistryMatch,
    'global-exception-registry-match': globalExceptionRegistryMatch,
    'craft-method-name-match': craftMethodNameMatch,
    'craft-computed-name-match': craftComputedNameMatch,
    'craft-source-name-match': craftSourceNameMatch,
    'craft-signal-source-name-match': craftSignalSourceNameMatch,
    'no-craft-computed-side-effects': noCraftComputedSideEffects,
    'provide-host-name-match-component': provideHostNameMatchComponent,
    'prefer-craft-http-transport': preferCraftHttpTransport,
    'no-craft-service-component-same-file': noCraftServiceComponentSameFile,
    'no-raw-css-value': noRawCssValue,
    'no-raw-class': noRawClass,
    'no-free-has': noFreeHas,
    'style-file-boundary': styleFileBoundary,
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
    'no-craft-use': noCraftUse,
    'no-type-assertions-in-template': noTypeAssertionsInTemplate,
    'no-ephemeral-template-form-state': noEphemeralTemplateFormState,
    'require-assert-exhaustive-route-exceptions':
      requireAssertExhaustiveRouteExceptions,
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
    'no-imperative-craft-resource-trigger': noImperativeCraftResourceTrigger,
    'no-transition-actions': noTransitionActions,
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
    'no-noninteractive-element-interactions':
      noNoninteractiveElementInteractions,
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
    'require-effect-adapters': requireEffectAdapters,
    'sync-effect-body': syncEffectBody,
    'server-function-client-match': serverFunctionClientMatch,
    'no-invalid-insertion-pipe': noInvalidInsertionPipe,
    'no-redundant-primitive-insertion': noRedundantPrimitiveInsertion,
    'no-effect-outside-loaders': noEffectOutsideLoaders,
    'no-explicit-effect-type': noExplicitEffectType,
    'prefer-inline-effect-insertion': preferInlineEffectInsertion,
    'prefer-inline-route-providers': preferInlineRouteProviders,
    // Backwards-compatible alias; use no-effect-outside-loaders in new configs.
    'no-effect-in-params': noEffectOutsideLoaders,
    'prefer-query-method-over-state-trigger': preferQueryMethodOverStateTrigger,
    'no-injection-token': noInjectionToken,
    'no-manual-route-provider-list': noManualRouteProviderList,
    'no-widened-route-provider-context': noWidenedRouteProviderContext,
    'require-route-security-policy': requireRouteSecurityPolicy,
    'require-server-function-timeout': requireServerFunctionTimeout,
    'no-auth-token-in-local-storage': noAuthTokenInLocalStorage,
    'no-raw-user-url': noRawUserUrl,
    'no-unsafe-transfer-state': noUnsafeTransferState,
    'no-unsafe-html': noUnsafeHtml,
    'no-trust-forwarded-headers': noTrustForwardedHeaders,
  },
};

const a11yRuleSeverity = {
  'craft-ts/prefer-named-html-helpers': 'error',
  'craft-ts/img-has-alt': 'error',
  'craft-ts/control-has-accessible-name': 'error',
  'craft-ts/label-has-associated-control': 'error',
  'craft-ts/no-noninteractive-element-interactions': 'error',
  'craft-ts/anchor-has-href': 'error',
  'craft-ts/button-has-type': 'error',
  'craft-ts/require-interactive-local-name': 'error',
  'craft-ts/iframe-has-title': 'error',
  'craft-ts/heading-has-content': 'error',
  'craft-ts/prefer-relative-heading': 'error',
  'craft-ts/require-route-heading-outline': 'error',
  'craft-ts/require-outlet-heading-section': 'error',
  'craft-ts/no-heading-level-skip': 'error',
  'craft-ts/no-positive-tabindex': 'error',
  'craft-ts/valid-aria': 'error',
  'craft-ts/role-has-required-aria': 'error',
  'craft-ts/target-blank-noopener': 'error',
  'craft-ts/require-focus-visible': 'error',
  'craft-ts/require-reduced-motion': 'error',
};

plugin.configs = {
  recommended: {
    plugins: { 'craft-ts': plugin },
    rules: { ...recommendedRules, ...securityRules },
  },
  effect: {
    plugins: { 'craft-ts': plugin },
    rules: {
      ...recommendedRules,
      ...securityRules,
      'craft-ts/require-effect-adapters': 'error',
      'craft-ts/sync-effect-body': 'error',
      'craft-ts/no-effect-outside-loaders': 'error',
      'craft-ts/no-explicit-effect-type': 'error',
      'craft-ts/prefer-inline-effect-insertion': 'error',
    },
  },
  a11y: {
    plugins: { 'craft-ts': plugin },
    rules: a11yRuleSeverity,
  },
  // Conservé pour activer le préréglage seul, sur un projet qui ne prend pas
  // `recommended` (une lib partagée, un dossier d'outillage).
  security: {
    plugins: { 'craft-ts': plugin },
    rules: securityRules,
  },
};

module.exports = plugin;
