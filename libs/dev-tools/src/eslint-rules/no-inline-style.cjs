'use strict';

const { parseHyperscriptCall } = require('./hyperscript-walk.cjs');
const {
  STYLE_PACKAGE,
  bindingOf,
  isNullish,
  metaObjectsOf,
  propertyNamed,
  returnedExpressions,
} = require('./style-binding-utils.cjs');

/**
 * `style:` carries typed custom properties, and nothing else.
 *
 * What varies at runtime — a colour per pixel, a bar width, an overlay
 * position — goes through a variable declared with `cssVars` and written with
 * `assign(v.x, value)`. The sheet reads the variable; the class never changes.
 * A raw `style: { display: 'none' }` is CSS no sheet declared: invisible to
 * the visual matrix, to the contrast proof and to the dependency graph.
 *
 * Accepted on `style:`: `assign(...)`, an array of them, an object spreading
 * only them, `null`/`undefined`/`false`, a conditional or `&&` whose branches
 * are all of these, a `const` bound to one, and a function whose every return
 * is one. `attrs: { style }` is always refused: it is a string by definition.
 */
const MAX_DEPTH = 8;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Restrict style bindings to typed custom properties written with assign() from @craft-ts/style.',
    },
    schema: [],
    messages: {
      rawStyle:
        "`style:` only accepts assign(...) from @craft-ts/style. Declare the varying value as a typed variable — cssVars('x', { width: kind.length(...) }) — read it in a *.style.ts sheet, and write it here with assign(v.width, value). Static CSS belongs in the sheet; a visibility toggle belongs in the template (ifBlock) or on an axis.",
      attrsStyle:
        '`attrs.style` is a raw CSS string, outside the design system. Bind `style:` with assign(...) instead.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    const isAssignCall = (node) => {
      if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier') {
        return false;
      }
      const binding = bindingOf(sourceCode, node.callee);
      return (
        binding.kind === 'import' &&
        binding.source === STYLE_PACKAGE &&
        binding.imported === 'assign'
      );
    };

    const accepted = (node, depth = 0) => {
      if (!node || depth > MAX_DEPTH) return false;
      if (isNullish(node)) return true;
      switch (node.type) {
        case 'CallExpression':
          return isAssignCall(node);
        case 'ArrayExpression':
          return node.elements.every(
            (element) => !element || accepted(element, depth + 1),
          );
        case 'ObjectExpression':
          return node.properties.every(
            (entry) =>
              entry.type === 'SpreadElement' &&
              accepted(entry.argument, depth + 1),
          );
        case 'ConditionalExpression':
          return (
            accepted(node.consequent, depth + 1) &&
            accepted(node.alternate, depth + 1)
          );
        case 'LogicalExpression':
          return accepted(node.right, depth + 1);
        case 'Identifier': {
          const binding = bindingOf(sourceCode, node);
          return binding.kind === 'const' && accepted(binding.init, depth + 1);
        }
        case 'ArrowFunctionExpression':
        case 'FunctionExpression':
          return returnedExpressions(node).every((returned) =>
            accepted(returned, depth + 1),
          );
        case 'TSAsExpression':
        case 'TSSatisfiesExpression':
        case 'TSNonNullExpression':
          return accepted(node.expression, depth + 1);
        default:
          return false;
      }
    };

    const checkProps = (props) => {
      if (!props || props.type !== 'ObjectExpression') return;
      const style = propertyNamed(props, 'style');
      if (style && !accepted(style.value)) {
        context.report({ node: style.value, messageId: 'rawStyle' });
      }
      const attrs = propertyNamed(props, 'attrs');
      const attrsStyle = attrs && propertyNamed(attrs.value, 'style');
      if (attrsStyle) {
        context.report({ node: attrsStyle, messageId: 'attrsStyle' });
      }
    };

    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (call) {
          checkProps(call.props);
          return;
        }
        for (const meta of metaObjectsOf(node)) {
          const host = propertyNamed(meta, 'host');
          if (host) checkProps(host.value);
        }
      },
    };
  },
};
