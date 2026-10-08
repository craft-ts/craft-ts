/**
 * Shared knowledge about what a `craftService` exposes: the named primitives
 * its factory yields (outside `craftPrivate(...)`), each under its name.
 */

/** Creators of a named primitive, with the index of their name argument. */
const NAMED_PRIMITIVE_NAME_ARG = {
  state: 0,
  query: 0,
  mutation: 0,
  asyncProcess: 0,
  queryParams: 0,
  craftComputed: 0,
  craftMethod: 0,
  craftEffect: 0,
  craftExpose: 0,
  craftStateMachine: 0,
  source$: 0,
  fromEventToSource$: 1,
  queryEffect: 0,
  mutationEffect: 0,
  asyncProcessEffect: 0,
};

function calleeName(call) {
  const callee = call.callee;
  if (callee.type === 'Identifier') return callee.name;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return undefined;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ParenthesizedExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function isStringLiteral(node) {
  return (
    (node?.type === 'Literal' && typeof node.value === 'string') ||
    (node?.type === 'TemplateLiteral' &&
      node.expressions.length === 0 &&
      node.quasis.length === 1)
  );
}

function stringValue(node) {
  return node.type === 'Literal' ? node.value : node.quasis[0].value.cooked;
}

/** The literal name a named-primitive call declares, if any. */
function primitiveName(call) {
  const name = calleeName(call);
  if (name === undefined || !(name in NAMED_PRIMITIVE_NAME_ARG)) {
    return undefined;
  }
  const argument = call.arguments[NAMED_PRIMITIVE_NAME_ARG[name]];
  if (isStringLiteral(argument)) return stringValue(argument);
  // `craftMethod({ name: 'x', providers })`
  if (argument?.type === 'ObjectExpression') {
    const property = argument.properties.find(
      (candidate) =>
        candidate.type === 'Property' &&
        !candidate.computed &&
        candidate.key.type === 'Identifier' &&
        candidate.key.name === 'name',
    );
    if (property && isStringLiteral(property.value)) {
      return stringValue(property.value);
    }
  }
  return undefined;
}

function isNamedPrimitiveCall(node) {
  const call = unwrap(node);
  if (call?.type !== 'CallExpression') return false;
  const name = calleeName(call);
  return name !== undefined && name in NAMED_PRIMITIVE_NAME_ARG;
}

function isCraftPrivateCall(node) {
  const call = unwrap(node);
  return (
    call?.type === 'CallExpression' &&
    call.callee.type === 'Identifier' &&
    call.callee.name === 'craftPrivate'
  );
}

/** The factory of a `craftService(options, factory)` call. */
function serviceFactoryOf(call) {
  if (
    call.type !== 'CallExpression' ||
    call.callee.type !== 'Identifier' ||
    call.callee.name !== 'craftService'
  ) {
    return undefined;
  }
  return call.arguments[1];
}

/** The closest function enclosing `node` (itself excluded). */
function enclosingFunction(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'FunctionExpression' ||
      current.type === 'FunctionDeclaration' ||
      current.type === 'ArrowFunctionExpression'
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

/** `true` when `fn` is the factory given to a `craftService(...)` call. */
function isServiceFactory(fn) {
  return (
    fn?.parent?.type === 'CallExpression' &&
    serviceFactoryOf(fn.parent) === fn
  );
}

/**
 * `true` when `call` is a named primitive a `craftService` exposes: yielded at
 * the top level of the factory body, and not wrapped in `craftPrivate(...)`.
 * Renaming such a primitive renames the service's public key.
 */
function isServiceExposure(call) {
  let node = call;
  let parent = node.parent;
  while (
    parent &&
    (parent.type === 'TSAsExpression' ||
      parent.type === 'TSSatisfiesExpression' ||
      parent.type === 'ParenthesizedExpression' ||
      (parent.type === 'CallExpression' &&
        parent.callee.type === 'Identifier' &&
        parent.callee.name === 'craftUse'))
  ) {
    node = parent;
    parent = node.parent;
  }
  if (parent?.type === 'CallExpression' && isCraftPrivateCall(parent)) {
    return false;
  }
  if (parent?.type !== 'YieldExpression' || !parent.delegate) return false;
  const statement =
    parent.parent?.type === 'VariableDeclarator'
      ? parent.parent.parent
      : parent.parent;
  if (
    statement?.type !== 'VariableDeclaration' &&
    statement?.type !== 'ExpressionStatement'
  ) {
    return false;
  }
  const body = statement.parent;
  return (
    body?.type === 'BlockStatement' &&
    isServiceFactory(body.parent)
  );
}

module.exports = {
  NAMED_PRIMITIVE_NAME_ARG,
  calleeName,
  enclosingFunction,
  isCraftPrivateCall,
  isNamedPrimitiveCall,
  isServiceExposure,
  isServiceFactory,
  isStringLiteral,
  stringValue,
  primitiveName,
  serviceFactoryOf,
  unwrap,
};
