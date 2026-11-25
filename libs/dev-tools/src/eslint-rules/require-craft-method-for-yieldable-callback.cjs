const { templateRegions } = require('./craft-template-region.cjs');
const { HOST_EVENT_NAMES } = require('./component-host-properties.cjs');

/**
 * Whether the runtime binds a function under `key` as a DOM event listener.
 *
 * Mirrors `eventNameFor` in `libs/component/src/lib/render/interpreter.ts`: a
 * listener is bound for a known event name (`click`) or for any `onXxx` key
 * (`onClick`, `onDragStart`). Every other function-valued property — the
 * handlers of `matchNode`, the `render` of `forNode`, a slot — is a render
 * callback, never an event handler.
 */
function isEventPropName(key) {
  return HOST_EVENT_NAMES.has(key) || /^on[A-Z]/.test(key);
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require callbacks bound in a craftComponent template to use craftMethod when they call yieldable Craft methods.',
    },
    schema: [],
    messages: {
      requireCraftMethod:
        "Callback '{{name}}' calls a yieldable Craft method and must be created with `craftMethod(...)`.",
      missingTypeInfo:
        'This rule requires TypeScript type information to identify yieldable Craft methods.',
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
          node.arguments.length < 3
        ) {
          return;
        }

        inspectFactory(node.arguments[2]);
      },
    };

    function inspectFactory(factory) {
      const localFunctions = collectLocalFunctions(factory);
      // A callback only reaches the runtime as an event through a binding the
      // template declares — `{ click: … }` or a component output — so that is
      // where the rule looks. Render callbacks are left alone (issue #50).
      for (const property of collectBoundProperties(factory)) {
        if (!isEventBinding(property)) continue;
        const callback = resolveCallback(property.value, localFunctions);
        if (!callback || callback.generator) continue;

        const yieldableCalls = [];
        walkFunctionBody(callback, (node) => {
          if (node.type === 'CallExpression' && isDirectYieldableCall(node)) {
            yieldableCalls.push(node);
          }
        });

        if (yieldableCalls.length === 0) continue;

        context.report({
          node: callback,
          messageId: 'requireCraftMethod',
          data: { name: callbackName(property) },
        });
      }
    }

    function collectBoundProperties(factory) {
      const properties = [];
      if (!factory) return properties;
      for (const region of templateRegions(factory)) {
        collectFrom(region, properties);
      }
      return properties;
    }

    function collectFrom(region, properties) {
      walk(region, (node) => {
        if (node.type !== 'ObjectExpression') return undefined;
        for (const property of node.properties) {
          if (property.type === 'Property') properties.push(property);
        }
        return undefined;
      });
    }

    function isEventBinding(property) {
      if (property.computed) return false;
      const name = getPropertyName(property);
      if (isEventPropName(name)) return true;
      return isComponentOutputBinding(property, name);
    }

    // `Component({ press: … })`: a component declares its outputs with the
    // branded `Output<Handler>` type on its template inputs. The call-site props
    // erase the brand, so read it back from the component's template, the same
    // way the dependency graph recognises an output binding.
    function isComponentOutputBinding(property, name) {
      const object = property.parent;
      const call = object?.parent;
      if (
        object?.type !== 'ObjectExpression' ||
        call?.type !== 'CallExpression' ||
        call.arguments[0] !== object
      ) {
        return false;
      }

      const calleeNode = esTreeNodeToTSNodeMap.get(call.callee);
      if (!calleeNode) return false;
      const componentType = checker.getTypeAtLocation(calleeNode);
      const definition = findBrandedProperty(componentType, 'CRAFT_COMPONENT');
      if (!definition) return false;

      const template = checker
        .getTypeOfSymbolAtLocation(definition, calleeNode)
        .getProperty?.('template');
      if (!template) return false;
      // The template type intersects the generic `ComponentTemplate` signature
      // with the authored one, so every signature is a candidate.
      return checker
        .getTypeOfSymbolAtLocation(template, calleeNode)
        .getNonNullableType()
        .getCallSignatures()
        .some((signature) => {
          const inputs = signature.getParameters()[0];
          if (!inputs) return false;

          const input = checker
            .getTypeOfSymbolAtLocation(inputs, calleeNode)
            .getNonNullableType()
            .getProperty(name);
          if (!input) return false;

          const inputType = checker
            .getTypeOfSymbolAtLocation(input, calleeNode)
            .getNonNullableType();
          return findBrandedProperty(inputType, 'OUTPUT_BRAND') !== undefined;
        });
    }

    function findBrandedProperty(type, brand) {
      return checker
        .getPropertiesOfType(type)
        .find((symbol) =>
          String(symbol.escapedName ?? symbol.name).startsWith(`__@${brand}@`),
        );
    }

    function callbackName(property) {
      return property.value.type === 'Identifier'
        ? property.value.name
        : getPropertyName(property);
    }

    function collectLocalFunctions(factory) {
      const localFunctions = new Map();
      if (!factory) return localFunctions;

      if (
        factory.type === 'ArrowFunctionExpression' &&
        factory.body.type === 'ObjectExpression'
      ) {
        return localFunctions;
      }

      walkFunctionBody(factory.body, (node) => {
        if (node.type === 'FunctionDeclaration' && node.id) {
          localFunctions.set(node.id.name, node);
          return 'skip';
        }

        if (
          node.type === 'VariableDeclarator' &&
          node.id.type === 'Identifier' &&
          node.init &&
          isFunctionNode(node.init)
        ) {
          localFunctions.set(node.id.name, node.init);
        }
      });

      return localFunctions;
    }

    function resolveCallback(value, localFunctions) {
      if (isFunctionNode(value)) {
        return value;
      }

      if (value?.type === 'Identifier') {
        return localFunctions.get(value.name);
      }

      return undefined;
    }

    // A call that hands back an invocation has to be driven. A craftMethod
    // carries the same brand but runs when it is called — it is already the fix
    // this rule asks for, so the brand alone is not the defect.
    function isDirectYieldableCall(node) {
      const tsNode = esTreeNodeToTSNodeMap.get(node.callee);
      if (!tsNode) return false;

      const calleeType = checker.getTypeAtLocation(tsNode);
      const signature = calleeType.getCallSignatures?.()[0];
      return signature ? returnsGenerator(signature.getReturnType()) : false;
    }

    function returnsGenerator(type) {
      const symbol = type.aliasSymbol ?? type.getSymbol?.();
      const name = symbol && String(symbol.escapedName ?? symbol.name);
      if (name === 'Generator' || name === 'YieldableInvocation') {
        return true;
      }

      if (type.isUnion?.()) {
        return type.types.every((part) => returnsGenerator(part));
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

    function getPropertyName(property) {
      if (property.key.type === 'Identifier') return property.key.name;
      if (property.key.type === 'Literal') return String(property.key.value);
      return '<anonymous>';
    }

    function walkFunctionBody(node, visit) {
      walk(node, (child) => {
        if (child !== node && isFunctionNode(child)) {
          return 'skip';
        }
        return visit(child);
      });
    }

    function walk(node, visit) {
      if (!node || typeof node.type !== 'string') return;
      if (visit(node) === 'skip') return;

      const keys = sourceCode.visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach((item) => walk(item, visit));
        } else {
          walk(child, visit);
        }
      }
    }

    function isFunctionNode(node) {
      return (
        node?.type === 'ArrowFunctionExpression' ||
        node?.type === 'FunctionExpression' ||
        node?.type === 'FunctionDeclaration'
      );
    }
  },
};
