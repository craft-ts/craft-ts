const REACTIVE_BRANDS = ['SIGNAL', 'YIELDABLE_VALUE', 'INPUT_BRAND'];
const { NAMED_HTML_HELPERS } = require('./html-helpers.cjs');
const STRUCTURAL_HELPERS = new Set([
  'catchNode',
  'content',
  'deferNode',
  'forNode',
  'heading',
  'headingSection',
  'ifNode',
  'liveRegion',
  'matchNode',
  'renderContent',
  'renderTemplate',
]);
const RENDER_HELPERS = new Set(['customElement', 'h', ...NAMED_HTML_HELPERS]);
const EVENT_NAMES = new Set([
  'blur',
  'change',
  'click',
  'dblclick',
  'focus',
  'input',
  'keydown',
  'keypress',
  'keyup',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'reset',
  'scroll',
  'submit',
]);
const EAGER_CALLBACK_METHODS = new Set([
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flatMap',
  'forEach',
  'map',
  'reduce',
  'reduceRight',
  'some',
  'sort',
]);
const PRESENTATION_FUNCTIONS = new Set(['Boolean', 'Number', 'String']);
const PRESENTATION_METHODS = new Set([
  'charAt',
  'join',
  'padEnd',
  'padStart',
  'slice',
  'substring',
  'toLowerCase',
  'toString',
  'toUpperCase',
  'trim',
]);
const SAFE_TEMPLATE_CALLS = new Set([
  'safeUrl',
  'safeResourceUrl',
  'safeUrlList',
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require reactive values rendered by Craft components to be read inside granular binding callbacks.',
    },
    schema: [],
    messages: {
      directRead:
        'Do not read a reactive value directly while building a Craft template. Wrap the rendered expression in a binding callback, for example `() => value()`.',
      derivedCall:
        'Do not call a derived business helper from a reactive Craft template binding. Move the derivation to state(), craftComputed(), or query(), then bind the resulting value.',
      missingTypeInfo:
        'This rule requires TypeScript type information to identify reactive template values.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const parserServices = sourceCode.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker?.();
    const esTreeNodeToTSNodeMap = parserServices?.esTreeNodeToTSNodeMap;
    let reportedMissingTypeInfo = false;

    return {
      Program() {
        if (!checker || !esTreeNodeToTSNodeMap) {
          context.report({
            node: sourceCode.ast,
            messageId: 'missingTypeInfo',
          });
          reportedMissingTypeInfo = true;
        }
      },

      CallExpression(node) {
        if (
          reportedMissingTypeInfo ||
          !checker ||
          !esTreeNodeToTSNodeMap ||
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'craftComponent' ||
          node.arguments.length < 4
        ) {
          return;
        }
        inspectTemplate(node.arguments[3]);
      },
    };

    function inspectTemplate(template) {
      walk(template, (node) => {
        if (node !== template && isNestedCraftComponent(node)) {
          return 'skip';
        }
        if (
          node.type !== 'CallExpression' ||
          isInsideEventOrAction(node, template)
        ) {
          return;
        }

        if (node.arguments.length === 0 && isReactiveRead(node)) {
          if (!isInsideBindingOrAction(node, template)) {
            context.report({ node, messageId: 'directRead' });
          }
          return;
        }

        if (
          node.arguments.length > 0 &&
          isInsideReactiveBinding(node, template) &&
          !isPresentationCall(node) &&
          containsReactiveRead(node)
        ) {
          context.report({ node, messageId: 'derivedCall' });
        }
      });
    }

    function containsReactiveRead(node) {
      let found = false;
      walk(node, (candidate) => {
        if (
          candidate !== node &&
          candidate.type === 'CallExpression' &&
          candidate.arguments.length === 0 &&
          isReactiveRead(candidate)
        ) {
          found = true;
          return 'skip';
        }
      });
      return found;
    }

    function isPresentationCall(node) {
      if (node.callee.type === 'Identifier') {
        return (
          PRESENTATION_FUNCTIONS.has(node.callee.name) ||
          SAFE_TEMPLATE_CALLS.has(node.callee.name)
        );
      }
      return (
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.property.type === 'Identifier' &&
        PRESENTATION_METHODS.has(node.callee.property.name)
      );
    }

    function isReactiveRead(node) {
      const tsNode = esTreeNodeToTSNodeMap.get(node.callee);
      if (!tsNode) return false;
      return hasReactiveBrand(checker.getTypeAtLocation(tsNode), new Set());
    }

    function hasReactiveBrand(type, seen) {
      if (!type || seen.has(type)) return false;
      seen.add(type);
      if (type.isUnion?.() || type.isIntersection?.()) {
        return type.types.some((part) => hasReactiveBrand(part, seen));
      }
      return checker
        .getPropertiesOfType(type)
        .some((property) =>
          REACTIVE_BRANDS.some((brand) =>
            String(property.escapedName ?? property.name).includes(brand),
          ),
        );
    }

    function isInsideBindingOrAction(node, template) {
      let current = node.parent;
      while (current && current !== template) {
        if (isFunctionNode(current)) {
          if (isEventOrOutputCallback(current)) return true;
          if (isReactiveBindingFunction(current)) return true;
        }
        current = current.parent;
      }
      return false;
    }

    function isInsideReactiveBinding(node, template) {
      let current = node.parent;
      while (current && current !== template) {
        if (isFunctionNode(current)) {
          return isReactiveBindingFunction(current);
        }
        current = current.parent;
      }
      return false;
    }

    function isInsideEventOrAction(node, template) {
      let current = node.parent;
      while (current && current !== template) {
        if (isFunctionNode(current) && isEventOrOutputCallback(current)) {
          return true;
        }
        current = current.parent;
      }
      return false;
    }

    function isReactiveBindingFunction(fn) {
      const renderCall = enclosingRenderCall(fn);
      if (!renderCall) return !isEagerCollectionCallback(fn);
      const name = callName(renderCall);
      return !isStructuralTemplateFunction(fn, renderCall, name);
    }

    function isEagerCollectionCallback(fn) {
      const call = fn.parent;
      return Boolean(
        call?.type === 'CallExpression' &&
          call.callee.type === 'MemberExpression' &&
          !call.callee.computed &&
          call.callee.property.type === 'Identifier' &&
          EAGER_CALLBACK_METHODS.has(call.callee.property.name),
      );
    }

    function isStructuralTemplateFunction(fn, call, name) {
      const argument = directArgumentContaining(fn, call);
      const argumentIndex = argument ? call.arguments.indexOf(argument) : -1;
      const key = enclosingPropertyName(fn, call);

      if (name === 'forNode') {
        return argumentIndex === 2 || key === 'empty';
      }
      if (name === 'ifNode') {
        return argumentIndex === 1 || argumentIndex === 2;
      }
      if (name === 'deferNode') {
        return ['resolve', 'placeholder', 'loading', 'error'].includes(key);
      }
      if (name === 'exhaustive') {
        return argumentIndex !== 0;
      }
      return Boolean(name && STRUCTURAL_HELPERS.has(name));
    }

    function directArgumentContaining(node, call) {
      let current = node;
      while (current?.parent && current.parent !== call) {
        current = current.parent;
      }
      return current?.parent === call ? current : undefined;
    }

    function enclosingPropertyName(node, call) {
      let current = node.parent;
      while (current && current !== call) {
        if (current.type === 'Property') return propertyName(current);
        current = current.parent;
      }
      return undefined;
    }

    function enclosingRenderCall(node) {
      let current = node.parent;
      while (current) {
        if (current.type === 'CallExpression') {
          return isRenderCall(current) ? current : undefined;
        }
        if (
          current.type !== 'Property' &&
          current.type !== 'ObjectExpression' &&
          current.type !== 'ArrayExpression' &&
          current.type !== 'SpreadElement' &&
          current.type !== 'TSAsExpression' &&
          current.type !== 'TSSatisfiesExpression' &&
          current.type !== 'ChainExpression'
        ) {
          return undefined;
        }
        current = current.parent;
      }
      return undefined;
    }

    function isRenderCall(node) {
      const name = callName(node);
      if (name && (RENDER_HELPERS.has(name) || STRUCTURAL_HELPERS.has(name))) {
        return true;
      }
      if (name === 'exhaustive') return true;
      return (
        node.callee.type === 'Identifier' &&
        /^[A-Z]/.test(node.callee.name) &&
        ![
          'Array',
          'BigInt',
          'Boolean',
          'Date',
          'Number',
          'Object',
          'String',
        ].includes(node.callee.name)
      );
    }

    function callName(node) {
      if (node.callee.type === 'Identifier') return node.callee.name;
      if (
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.property.type === 'Identifier'
      ) {
        return node.callee.property.name;
      }
      return undefined;
    }

    function isEventOrOutputCallback(fn) {
      const property = fn.parent;
      if (property?.type !== 'Property' || property.value !== fn) return false;
      const name = propertyName(property);
      return Boolean(name && (EVENT_NAMES.has(name) || /^on[A-Z]/.test(name)));
    }

    function propertyName(property) {
      if (property.computed) return undefined;
      if (property.key.type === 'Identifier') return property.key.name;
      return property.key.type === 'Literal' &&
        typeof property.key.value === 'string'
        ? property.key.value
        : undefined;
    }

    function isNestedCraftComponent(node) {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'craftComponent'
      );
    }

    function isFunctionNode(node) {
      return (
        node?.type === 'ArrowFunctionExpression' ||
        node?.type === 'FunctionExpression'
      );
    }

    function walk(node, visitor) {
      if (!node || typeof node.type !== 'string') return;
      if (visitor(node) === 'skip') return;
      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach((entry) => walk(entry, visitor));
        } else {
          walk(child, visitor);
        }
      }
    }
  },
};
