const {
  isStringLiteral,
  stringValue,
  unwrap,
} = require('./craft-service-exposure-utils.cjs');

const SERVICE_PRIMITIVES = new Set([
  'state',
  'queryParams',
  'mutation',
  'query',
  'asyncProcess',
]);

function yieldedCall(node) {
  const yielded = unwrap(node);
  if (yielded?.type !== 'YieldExpression' || !yielded.delegate) return undefined;
  return unwrapYieldedCall(yielded.argument);
}

function unwrapYieldedCall(node) {
  const call = unwrap(node);
  if (call?.type !== 'CallExpression') return undefined;
  if (calleeName(call) === 'craftPrivate' && call.arguments.length === 1) {
    return unwrapYieldedCall(call.arguments[0]);
  }
  return call;
}

function isServiceName(name, exposedName) {
  return (
    name &&
    name[0] === name[0].toUpperCase() &&
    exposedName === name[0].toLowerCase() + name.slice(1)
  );
}

function calleeName(call) {
  const callee = call?.callee;
  if (callee?.type === 'Identifier') return callee.name;
  if (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return undefined;
}

function isCraftExpose(call) {
  return (
    call?.type === 'CallExpression' &&
    call.callee.type === 'Identifier' &&
    call.callee.name === 'craftExpose'
  );
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer direct service yields and existing nested primitive members over redundant craftExpose wrappers.',
      url: 'https://craft-ts.github.io/craft/guide/routing/eslint-rules#avoid-flattening-primitive-members-with-craftexpose',
    },
    schema: [],
    messages: {
      directService:
        'This craftExpose only republishes the service under its own name. Yield the service directly instead.',
      propertyShortcut:
        'This craftExpose republishes a member from a yielded service. Yield the member directly with {{service}}.{{property}}().',
      primitiveResult:
        'This craftExpose republishes a named {{primitive}}. The primitive is already exposed by its own name; remove craftExpose.',
      existingPrimitiveMember:
        'This craftExpose republishes "{{service}}.{{property}}", which is already part of the service API. Remove craftExpose and use the nested path directly.',
      insidePrimitive:
        'Inside {{primitive}}, do not use craftExpose. Yield the value from the craftService body and expose it there.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (!isCraftExpose(node) || node.arguments.length < 2) return;
        const enclosingPrimitive = findEnclosingPrimitive(node);
        if (enclosingPrimitive) {
          context.report({
            node,
            messageId: 'insidePrimitive',
            data: { primitive: enclosingPrimitive },
          });
          return;
        }
        const [nameNode, valueNode] = node.arguments;
        if (!isStringLiteral(nameNode)) return;
        const exposedName = stringValue(nameNode);
        const directCall = yieldedCall(valueNode);

        const memberExposure = findExistingPrimitiveMember(
          valueNode,
          node,
          sourceCode,
        );
        if (memberExposure) {
          context.report({
            node,
            messageId: 'existingPrimitiveMember',
            data: memberExposure,
          });
          return;
        }

        const directPrimitive = primitiveCall(directCall);
        if (directPrimitive?.name === exposedName) {
          context.report({
            node,
            messageId: 'primitiveResult',
            data: { primitive: directPrimitive.primitive },
          });
          return;
        }

        if (directCall) {
          const dependencyName = calleeName(directCall);
          if (isServiceName(dependencyName, exposedName)) {
            context.report({ node, messageId: 'directService' });
          }
          return;
        }

        if (valueNode.type !== 'Identifier') return;
        const variable = findBinding(valueNode, sourceCode);
        const initCall = yieldedCall(variable?.init);
        const initPrimitive = primitiveCall(initCall);
        if (initPrimitive?.name === exposedName) {
          context.report({
            node,
            messageId: 'primitiveResult',
            data: { primitive: initPrimitive.primitive },
          });
          return;
        }
        const pattern = variable?.id;
        const dependencyName = calleeName(initCall);
        if (pattern?.type === 'Identifier' && isServiceName(dependencyName, exposedName)) {
          context.report({ node, messageId: 'directService' });
          return;
        }
        if (!initCall || pattern?.type !== 'ObjectPattern') return;
        const property = pattern.properties.find(
          (candidate) =>
            candidate.type === 'Property' &&
            candidate.value.type === 'Identifier' &&
            candidate.value.name === valueNode.name &&
            (candidate.key.type === 'Identifier' ||
              (candidate.key.type === 'Literal' &&
                typeof candidate.key.value === 'string')),
        );
        const propertyName =
          property?.key.type === 'Identifier'
            ? property.key.name
            : property?.key.value;
        const serviceName = dependencyName;
        // A lowercase call in this position is commonly a yieldable input
        // reader (`task()`), not a generated service helper. Its value members
        // are intentionally exposed with craftExpose.
        if (
          !propertyName ||
          exposedName !== propertyName ||
          !serviceName ||
          serviceName[0] !== serviceName[0].toUpperCase()
        ) {
          return;
        }

        context.report({
          node,
          messageId: 'propertyShortcut',
          data: { service: serviceName, property: propertyName },
        });
      },
    };
  },
};

function primitiveCall(call) {
  const primitive = calleeName(call);
  if (!primitive || !SERVICE_PRIMITIVES.has(primitive)) return undefined;
  const name = call.arguments?.[0];
  if (!isStringLiteral(name)) return undefined;
  return { primitive, name: stringValue(name) };
}

function findExistingPrimitiveMember(
  valueNode,
  exposeNode,
  sourceCode,
) {
  const member = unwrap(valueNode);
  if (member?.type !== 'MemberExpression') return undefined;

  const property = staticMemberName(member);
  const owner = unwrap(member.object);
  if (!property || owner?.type !== 'Identifier') {
    return undefined;
  }

  const variable = findBinding(owner, sourceCode);
  if (
    !variable?.init ||
    variable.range?.[1] >= exposeNode.range?.[0] ||
    isPrivateYield(variable.init)
  ) {
    return undefined;
  }

  const primitive = primitiveCall(yieldedCall(variable.init));
  if (
    !primitive ||
    !primitiveReturnsMember(primitive.primitive, variable.init, property)
  ) {
    return undefined;
  }

  return { service: primitive.name, property };
}

function staticMemberName(member) {
  if (!member.computed && member.property.type === 'Identifier') {
    return member.property.name;
  }
  if (
    member.computed &&
    member.property.type === 'Literal' &&
    typeof member.property.value === 'string'
  ) {
    return member.property.value;
  }
  return undefined;
}

function isPrivateYield(node) {
  const yielded = unwrap(node);
  if (yielded?.type !== 'YieldExpression' || !yielded.delegate) return false;
  const argument = unwrap(yielded.argument);
  return (
    argument?.type === 'CallExpression' &&
    argument.callee.type === 'Identifier' &&
    argument.callee.name === 'craftPrivate'
  );
}

function primitiveReturnsMember(expectedPrimitive, init, propertyName) {
  const call = yieldedCall(init);
  if (calleeName(call) !== expectedPrimitive) return false;
  const callback = unwrap(call.arguments?.[2]);
  if (
    callback?.type !== 'ArrowFunctionExpression' &&
    callback?.type !== 'FunctionExpression'
  ) {
    return false;
  }

  const body = unwrap(callback.body);
  let returned = body;
  if (body?.type === 'BlockStatement') {
    const returns = body.body.filter(
      (statement) => statement.type === 'ReturnStatement',
    );
    if (returns.length !== 1) return false;
    returned = unwrap(returns[0].argument);
  }
  if (returned?.type !== 'ObjectExpression') return false;

  return returned.properties.some((candidate) => {
    if (candidate.type !== 'Property') return false;
    if (!candidate.computed && candidate.key.type === 'Identifier') {
      return candidate.key.name === propertyName;
    }
    return (
      candidate.key.type === 'Literal' &&
      typeof candidate.key.value === 'string' &&
      candidate.key.value === propertyName
    );
  });
}

function findEnclosingPrimitive(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'CallExpression') {
      const name = calleeName(current);
      if (name && SERVICE_PRIMITIVES.has(name)) return name;
    }
    current = current.parent;
  }
  return undefined;
}

function findBinding(identifier, sourceCode) {
  const scope = sourceCode.getScope(identifier);
  let current = scope;
  while (current) {
    const variable = current.set.get(identifier.name);
    if (variable) {
      const definition = variable.defs.find(
        (candidate) => candidate.type === 'Variable',
      );
      return definition?.node;
    }
    current = current.upper;
  }
  return undefined;
}
