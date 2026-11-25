'use strict';

/**
 * The one predicate that decides whether a call may run inside a
 * `craftComputed` callback.
 *
 * `no-craft-computed-side-effects` reports every call it does not accept, and
 * `prefer-computed-local-dependency` only asks to move a dependency into a
 * computed when every call of that dependency is accepted here. Sharing the
 * predicate is what keeps the second rule from suggesting a move that the
 * first one would reject (issue #44).
 *
 * A call is accepted only on evidence:
 * - a reactive read carries the `RAW_REACTIVE_VALUE` / `INPUT_BRAND` brand or
 *   is a `CraftServiceInput`;
 * - `settled(...)` and `syncEffect(...)` are reads by contract;
 * - `CraftRouter()` and `CraftGlobalError()` are synchronous core capabilities;
 * - an i18n translator or reader carries the `CRAFT_I18N_TRANSLATION` proof:
 *   building a reader yields nothing, and a reader is a pure read when its
 *   bound dependency is a reactive read and its message resolves no service
 *   (no DI-aware token in its `CRAFT_COMPONENT_DEPS`).
 *
 * Resolving any other service is not accepted: it can instantiate the
 * implementation — and its transitive dependencies, a `craftEffect` or a
 * write among them — inside the computation, and neither an abstract
 * contract nor a service's dependency map proves that it does not (a private
 * `craftEffect` leaves no trace in the type).
 */

const REACTIVE_READ_BRAND = 'RAW_REACTIVE_VALUE';
const INPUT_BRAND = 'INPUT_BRAND';
const YIELDABLE_METHOD_BRAND = 'YIELDABLE_METHOD';
const SERVICE_YIELD_REQUEST_BRAND = 'SERVICE_YIELD_REQUEST_MARKER';
const I18N_TRANSLATION_BRAND = 'CRAFT_I18N_TRANSLATION';
const COMPONENT_DEPS_BRAND = 'CRAFT_COMPONENT_DEPS';
const CORE_PACKAGE = '@craft-ts/core';

const WRITE_METHODS = new Set([
  'add',
  'call',
  'clear',
  'decrement',
  'delete',
  'increment',
  'mutate',
  'patch',
  'refresh',
  'reload',
  'remove',
  'reset',
  'set',
  'submit',
  'unset',
  'update',
]);

// `settled(...)` reads an already-resolved async source; `syncEffect(...)` runs
// an Effect whose `R` carries `SyncOp`, so the type already proved it cannot
// suspend. Both are reads, not asynchronous work.
const ALLOWED_COMPUTED_CALLS = new Set(['settled', 'syncEffect']);

// CraftRouter and CraftGlobalError are synchronous core capabilities with no
// dependency of their own. Acquiring them is safe in a computed; navigation
// methods remain checked separately and are still rejected as writes.
const SYNC_CAPABILITIES = new Set(['CraftRouter', 'CraftGlobalError']);

const COMPUTED_READ_MESSAGES = {
  forbidden:
    'Craft computed callbacks may only read reactive Craft values or use `settled(...)` / `syncEffect(...)`; `{{call}}` is not allowed because it can write or perform asynchronous work.',
  unprovenService:
    'Craft computed callbacks may only read reactive Craft values; `{{call}}` resolves a service, and nothing proves that resolving it is a pure read. Resolving a service can instantiate its implementation inside the computation, with transitive dependencies such as a craftEffect or a write, and neither its contract nor its dependency map proves that it has none. Resolve it in the enclosing service body (`const value = yield* Service()`) and read that value inside the computed.',
  unprovenTranslationDependency:
    'Craft computed callbacks may only read reactive Craft values; `{{call}}` reads a translation whose translator is bound to a dependency that is not a reactive Craft read, so nothing proves that reading it is pure. Bind the translator to a `state`, `craftComputed` or input reader (`runtime.bind(language)`).',
  unprovenTranslationServices:
    'Craft computed callbacks may only read reactive Craft values; `{{call}}` renders a message whose DI-aware tokens resolve {{services}} inside the computation, and resolving a service is not proven to be a pure read. Read this translation in a template binding instead, or give these tokens a formatter that resolves no service.',
};

function createComputedReadSafety(context) {
  const sourceCode = context.sourceCode ?? context.getSourceCode();
  const parserServices = sourceCode.parserServices ?? context.parserServices;
  const checker = parserServices?.program?.getTypeChecker?.();
  const nodeMap = parserServices?.esTreeNodeToTSNodeMap;
  const hasTypeInfo = Boolean(checker && nodeMap);
  const importedNames = new Map();

  return {
    hasTypeInfo,
    trackImport,
    check,
    isCraftComputedCall,
    callName,
  };

  function trackImport(node) {
    if (node.source.value !== CORE_PACKAGE) return;
    for (const specifier of node.specifiers) {
      if (specifier.type !== 'ImportSpecifier') continue;
      importedNames.set(
        specifier.local.name,
        specifier.imported.name ?? specifier.imported.value,
      );
    }
  }

  function isCraftComputedCall(node) {
    return (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      (node.callee.name === 'craftComputed' ||
        importedNames.get(node.callee.name) === 'craftComputed')
    );
  }

  /**
   * `undefined` when the call is proven to be a read inside a computed;
   * otherwise the report (`messageId` + `data`) explaining what is missing.
   * Without type information only syntactic evidence is available, so every
   * call that needs a type to be proven is answered with `missingTypeInfo`.
   */
  function check(node) {
    if (isAllowedCall(node) || isSyncCapability(node)) return undefined;

    if (!hasTypeInfo) {
      return isKnownAsyncApi(node) || isKnownWriteMethod(node)
        ? forbidden(node)
        : { messageId: 'missingTypeInfo', data: {} };
    }

    const type = getCalleeType(node);
    if (isReactiveReadType(type)) return undefined;

    const translation = checkTranslation(node, type);
    if (translation !== NOT_A_TRANSLATION) return translation;

    if (isKnownAsyncApi(node) || isKnownWriteMethod(node)) {
      return forbidden(node);
    }

    if (resolvesService(type)) {
      return { messageId: 'unprovenService', data: { call: callName(node) } };
    }

    if (
      hasBrand(type, YIELDABLE_METHOD_BRAND) ||
      returnsGenerator(type) ||
      returnsPromiseLike(type)
    ) {
      return forbidden(node);
    }

    return undefined;
  }

  function forbidden(node) {
    return { messageId: 'forbidden', data: { call: callName(node) } };
  }

  function isAllowedCall(node) {
    if (node.callee.type !== 'Identifier') return false;
    return (
      ALLOWED_COMPUTED_CALLS.has(node.callee.name) ||
      ALLOWED_COMPUTED_CALLS.has(importedNames.get(node.callee.name))
    );
  }

  function isSyncCapability(node) {
    return (
      node.callee.type === 'Identifier' &&
      (SYNC_CAPABILITIES.has(node.callee.name) ||
        SYNC_CAPABILITIES.has(importedNames.get(node.callee.name)))
    );
  }

  // CraftServiceInput is a reader whose generator yields exactly one
  // ReactiveReadRequest. It is a safe dependency inside craftComputed,
  // even though the callable is not projected with the template brands.
  function isReactiveReadType(type) {
    return (
      hasBrand(type, REACTIVE_READ_BRAND) ||
      hasBrand(type, INPUT_BRAND) ||
      hasAlias(type, 'CraftServiceInput')
    );
  }

  function checkTranslation(node, type) {
    const proof = propertyType(type, I18N_TRANSLATION_BRAND);
    if (!proof) return NOT_A_TRANSLATION;

    const role = propertyType(proof, 'role');
    // Calling the translator only builds a reader: nothing is yielded yet.
    if (role?.isStringLiteral?.() && role.value === 'translator') {
      return undefined;
    }
    if (!role?.isStringLiteral?.() || role.value !== 'reader') {
      return NOT_A_TRANSLATION;
    }

    const dependency = propertyType(proof, 'dependency');
    if (!isReactiveReadType(dependency)) {
      return {
        messageId: 'unprovenTranslationDependency',
        data: { call: callName(node) },
      };
    }

    const services = componentDependencyNames(type);
    if (services.length > 0) {
      return {
        messageId: 'unprovenTranslationServices',
        data: {
          call: callName(node),
          services: services.map((name) => `\`${name}\``).join(', '),
        },
      };
    }

    return undefined;
  }

  function componentDependencyNames(type) {
    const deps = propertyType(type, COMPONENT_DEPS_BRAND);
    if (!deps) return [];
    return checker
      .getPropertiesOfType(deps)
      .map((property) => String(property.escapedName));
  }

  /** The non-nullable type of the first property whose name contains `name`. */
  function propertyType(type, name) {
    if (!type) return undefined;
    const property = checker
      .getPropertiesOfType(type)
      .find((candidate) => String(candidate.escapedName).includes(name));
    if (!property) return undefined;
    const propertyType = checker.getTypeOfSymbol
      ? checker.getTypeOfSymbol(property)
      : checker.getDeclaredTypeOfSymbol(property);
    return propertyType ? checker.getNonNullableType(propertyType) : undefined;
  }

  /** The callee returns a generator whose yields include a service request. */
  function resolvesService(type) {
    if (!type) return false;
    return (type.getCallSignatures?.() ?? []).some((signature) =>
      yieldedTypes(signature.getReturnType()).some((yielded) =>
        hasBrand(yielded, SERVICE_YIELD_REQUEST_BRAND),
      ),
    );
  }

  function yieldedTypes(type) {
    if (!type) return [];
    if (type.isUnion?.() || type.isIntersection?.()) {
      return type.types.flatMap((part) => yieldedTypes(part));
    }
    const symbol = type.aliasSymbol ?? type.getSymbol?.();
    const name = symbol && String(symbol.escapedName ?? symbol.name);
    if (name === 'Generator' && checker.getTypeArguments) {
      const [yielded] = checker.getTypeArguments(type) ?? [];
      return yielded ? [yielded] : [];
    }
    return [];
  }

  function isKnownAsyncApi(node) {
    if (node.callee.type === 'Identifier') {
      const importedName = importedNames.get(node.callee.name);
      return (
        node.callee.name === 'craftSleep' ||
        node.callee.name === 'craftUse' ||
        importedName === 'craftSleep' ||
        importedName === 'craftUse'
      );
    }

    if (
      node.callee.type !== 'MemberExpression' ||
      node.callee.object.type !== 'Identifier'
    ) {
      return false;
    }

    return (
      node.callee.object.name === 'CraftHttpClient' ||
      node.callee.object.name === 'CraftBinaryHttpClient' ||
      importedNames.get(node.callee.object.name) === 'CraftHttpClient' ||
      importedNames.get(node.callee.object.name) === 'CraftBinaryHttpClient'
    );
  }

  function isKnownWriteMethod(node) {
    if (node.callee.type !== 'MemberExpression') return false;

    const property = node.callee.computed
      ? node.callee.property.type === 'Literal'
        ? String(node.callee.property.value)
        : undefined
      : node.callee.property.type === 'Identifier'
        ? node.callee.property.name
        : undefined;

    return property ? WRITE_METHODS.has(property) : false;
  }

  function getCalleeType(node) {
    const tsNode = nodeMap.get(node.callee);
    return tsNode ? checker.getTypeAtLocation(tsNode) : undefined;
  }

  function hasBrand(type, brandName, seen = new Set()) {
    if (!type || seen.has(type)) return false;
    seen.add(type);

    if (type.isUnion?.() || type.isIntersection?.()) {
      return type.types.some((part) => hasBrand(part, brandName, seen));
    }

    return checker
      .getPropertiesOfType(type)
      .some((property) => String(property.escapedName).includes(brandName));
  }

  function hasAlias(type, aliasName) {
    if (!type) return false;
    if (type.aliasSymbol?.name === aliasName) return true;
    if (type.isUnion?.() || type.isIntersection?.()) {
      return type.types.some((part) => hasAlias(part, aliasName));
    }
    return false;
  }

  function returnsGenerator(type) {
    if (!type) return false;

    const signatures = type.getCallSignatures?.();
    if (signatures?.length) {
      return signatures.some((signature) =>
        returnsGenerator(signature.getReturnType()),
      );
    }

    const symbol = type.aliasSymbol ?? type.getSymbol?.();
    const name = symbol && String(symbol.escapedName ?? symbol.name);
    if (name === 'Generator' || name === 'YieldableInvocation') {
      return true;
    }

    if (type.isUnion?.()) {
      return type.types.some((part) => returnsGenerator(part));
    }

    return (
      checker
        .getPropertiesOfType(type)
        .some((property) => property.name === 'next') &&
      checker
        .getPropertiesOfType(type)
        .some((property) => property.name === 'return')
    );
  }

  function returnsPromiseLike(type) {
    if (!type) return false;

    const signatures = type.getCallSignatures?.();
    if (signatures?.length) {
      return signatures.some((signature) =>
        returnsPromiseLike(signature.getReturnType()),
      );
    }

    const symbol = type.aliasSymbol ?? type.getSymbol?.();
    const name = symbol && String(symbol.escapedName ?? symbol.name);
    if (name === 'Promise' || name === 'PromiseLike' || name === 'Thenable') {
      return true;
    }

    if (type.isUnion?.()) {
      return type.types.some((part) => returnsPromiseLike(part));
    }

    return checker
      .getPropertiesOfType(type)
      .some((property) => property.name === 'then');
  }

  function callName(node) {
    if (node.callee.type === 'Identifier') {
      return `${node.callee.name}()`;
    }

    if (node.callee.type === 'MemberExpression') {
      const object = sourceCode.getText(node.callee.object);
      const property = node.callee.computed
        ? sourceCode.getText(node.callee.property)
        : node.callee.property.type === 'Identifier'
          ? node.callee.property.name
          : sourceCode.getText(node.callee.property);
      return `${object}.${property}()`;
    }

    return sourceCode.getText(node.callee);
  }
}

const NOT_A_TRANSLATION = Symbol('not-a-translation');

module.exports = {
  COMPUTED_READ_MESSAGES,
  createComputedReadSafety,
};
