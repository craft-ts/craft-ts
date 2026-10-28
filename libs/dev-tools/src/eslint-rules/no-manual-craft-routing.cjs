'use strict';

const ROUTE_HASH = /^#\//;
const ROUTE_HASH_PATTERN = /^\^#\\\//;
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require Craft routing APIs instead of parsing or mutating app routes through the browser URL.',
    },
    schema: [],
    messages: {
      read: 'Do not read or parse the browser URL to determine the active Craft route. Use CraftActivatedRoute and its typed path or query parameter helpers.',
      write:
        'Do not change the app route through the browser URL or History API. Use CraftRouter.navigate(...) for actions or CraftRouterLink(...) for links.',
      listen:
        'Do not subscribe to browser history events to select a Craft page. Let provideCraftRouter and CraftRouterOutlet activate the route.',
      routeLiteral:
        'Do not parse a Craft hash route by hand. Read the active route through CraftActivatedRoute and typed route parameter helpers.',
    },
  },

  create(context) {
    return {
      MemberExpression(node) {
        const property = getPropertyName(node);
        if (property === 'hash' || property === 'pathname') {
          if (
            isBrowserLocation(node.object) &&
            !(
              node.parent?.type === 'AssignmentExpression' &&
              node.parent.left === node
            )
          ) {
            context.report({ node: node.property, messageId: 'read' });
          }
          return;
        }

        if (
          (property === 'pushState' || property === 'replaceState') &&
          isHistoryObject(node.object) &&
          node.parent?.type === 'CallExpression' &&
          node.parent.arguments.length >= 3 &&
          !isNullish(node.parent.arguments[2])
        ) {
          context.report({ node: node.property, messageId: 'write' });
        }
      },

      CallExpression(node) {
        const event = getStringLiteral(node.arguments[0]);
        const sourceEvent = getStringLiteral(node.arguments[1]);
        const callee = unwrap(node.callee);
        const method =
          callee?.type === 'MemberExpression'
            ? getPropertyName(callee)
            : undefined;
        if (
          (method === 'assign' || method === 'replace') &&
          isBrowserLocation(callee.object) &&
          isInternalDestination(node.arguments[0])
        ) {
          context.report({ node: callee.property, messageId: 'write' });
          return;
        }
        const listenerEvent = method === 'listen' ? sourceEvent : event;

        if (
          ((method === 'addEventListener' || method === 'listen') &&
            (listenerEvent === 'hashchange' || listenerEvent === 'popstate') &&
            (isBrowserWindow(callee.object) || method === 'listen')) ||
          (callee?.type === 'Identifier' &&
            callee.name === 'fromEventToSource$' &&
            (sourceEvent === 'hashchange' || sourceEvent === 'popstate') &&
            isBrowserWindow(node.arguments[0]))
        ) {
          context.report({
            node:
              method === 'listen' || callee?.type === 'Identifier'
                ? node.arguments[1]
                : node.arguments[0],
            messageId: 'listen',
          });
          return;
        }

        if (
          callee?.type === 'MemberExpression' &&
          (method === 'startsWith' ||
            method === 'includes' ||
            method === 'match') &&
          isRouteHashPattern(node.arguments[0])
        ) {
          context.report({
            node: node.arguments[0],
            messageId: 'routeLiteral',
          });
        }
      },

      BinaryExpression(node) {
        if (
          (node.operator === '===' ||
            node.operator === '==' ||
            node.operator === '!==' ||
            node.operator === '!=') &&
          (isRouteHashPattern(node.left) || isRouteHashPattern(node.right))
        ) {
          const routeValue = isRouteHashPattern(node.left)
            ? node.left
            : node.right;
          context.report({ node: routeValue, messageId: 'routeLiteral' });
        }
      },

      AssignmentExpression(node) {
        const left = unwrap(node.left);
        if (
          left?.type === 'MemberExpression' &&
          isBrowserLocation(left.object) &&
          ((getPropertyName(left) === 'hash' &&
            (isRouteHashPattern(node.right) || isInternalPath(node.right))) ||
            (getPropertyName(left) === 'href' &&
              isInternalDestination(node.right)))
        ) {
          context.report({ node: left.property, messageId: 'write' });
        }
      },

      Literal(node) {
        if (node.regex && ROUTE_HASH_PATTERN.test(node.regex.pattern)) {
          context.report({ node, messageId: 'routeLiteral' });
          return;
        }
        if (typeof node.value !== 'string' || !ROUTE_HASH.test(node.value))
          return;
        if (
          node.parent?.type === 'CallExpression' &&
          !(
            node.parent.callee.type === 'MemberExpression' &&
            ['startsWith', 'includes', 'match'].includes(
              getPropertyName(node.parent.callee),
            )
          )
        ) {
          context.report({ node, messageId: 'write' });
        }
      },

      TemplateLiteral(node) {
        if (node.quasis[0]?.value.cooked?.startsWith('#/')) {
          context.report({ node, messageId: 'write' });
        }
      },
    };
  },
};

function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ChainExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function getIdentifierName(node) {
  return node?.type === 'Identifier' ? node.name : undefined;
}

function getPropertyName(node) {
  if (node?.type !== 'MemberExpression') return undefined;
  if (!node.computed) return getIdentifierName(node.property);
  return node.property.type === 'Literal' ? node.property.value : undefined;
}

function isBrowserWindow(node) {
  const expression = unwrap(node);
  return (
    expression?.type === 'Identifier' &&
    (expression.name === 'window' || expression.name === 'globalThis')
  );
}

function isBrowserLocation(node) {
  const expression = unwrap(node);
  return (
    (expression?.type === 'Identifier' && expression.name === 'location') ||
    (expression?.type === 'MemberExpression' &&
      getPropertyName(expression) === 'location' &&
      isBrowserWindow(expression.object))
  );
}

function isHistoryObject(node) {
  const expression = unwrap(node);
  return (
    (expression?.type === 'Identifier' && expression.name === 'history') ||
    (expression?.type === 'MemberExpression' &&
      getPropertyName(expression) === 'history' &&
      isBrowserWindow(expression.object))
  );
}

function getStringLiteral(node) {
  const expression = unwrap(node);
  return expression?.type === 'Literal' && typeof expression.value === 'string'
    ? expression.value
    : undefined;
}

function isRouteHashPattern(node) {
  const expression = unwrap(node);
  if (expression?.type === 'Literal' && typeof expression.value === 'string') {
    return ROUTE_HASH.test(expression.value);
  }
  if (expression?.type === 'Literal' && expression.regex) {
    return ROUTE_HASH_PATTERN.test(expression.regex.pattern);
  }
  return false;
}

function isNullish(node) {
  const expression = unwrap(node);
  return (
    (expression?.type === 'Literal' && expression.value == null) ||
    (expression?.type === 'Identifier' && expression.name === 'undefined')
  );
}

function isInternalDestination(node) {
  const expression = unwrap(node);
  if (expression?.type === 'Literal' && typeof expression.value === 'string') {
    return (
      ROUTE_HASH.test(expression.value) ||
      isInternalPath(expression) ||
      expression.value.startsWith('./') ||
      expression.value.startsWith('../')
    );
  }
  return (
    expression?.type === 'TemplateLiteral' &&
    (expression.quasis[0]?.value.cooked?.startsWith('#/') ||
      expression.quasis[0]?.value.cooked?.startsWith('/') ||
      expression.quasis[0]?.value.cooked?.startsWith('./') ||
      expression.quasis[0]?.value.cooked?.startsWith('../'))
  );
}

function isInternalPath(node) {
  const value = getStringLiteral(node);
  return Boolean(value?.startsWith('/') && !value.startsWith('//'));
}
