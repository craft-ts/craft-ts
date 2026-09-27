'use strict';

const {
  bindingOf,
  isNullish,
  isStyleModule,
  returnedExpressions,
  rootIdentifier,
} = require('./style-binding-utils.cjs');

/**
 * A `class:` binding is a sheet class, never a string.
 *
 * Without this, the visual matrix is a fiction: a class assembled at render
 * time is a visual state nothing recorded, so the matrix enumerates what the
 * sheets declare while the DOM shows something else. Partial tightness here
 * buys 0 % of the guarantee, not 90 %.
 *
 * It fires **everywhere** — element props, `attrs.class`, `host: { class }`.
 * The design system is the only way to style a component; a file that has not
 * migrated yet is exactly the file this rule is for. A deliberate bypass (a
 * third-party widget that brings its own class names) is an
 * `eslint-disable-next-line craft-ts/no-raw-class -- reason`, and that
 * directive is attested in Review Attest.
 *
 * Accepted:
 * - `sheet.key`, where `sheet` is imported from a `*.style` module;
 * - an identifier imported from a `*.style` module;
 * - a parameter, or a member of one (`inputs.tone`): a typed input, whose type
 *   the caller had to satisfy with a sheet class;
 * - a `const` bound to any of the above;
 * - an array of any of the above (two sheet classes on one element);
 * - a function whose every return is one of the above.
 */
const MAX_DEPTH = 8;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require class bindings to come from a craftStyles sheet in a *.style module.',
    },
    schema: [],
    messages: {
      rawClass:
        'A class binding must be a class from a craftStyles sheet, not a string. This one is invisible to the visual matrix, so the state it produces is one nothing will ever capture. Move the rule into a *.style.ts sheet and bind the class it returns.',
      computedClass:
        'A class binding must not be computed at render time. Every string this can produce is a visual state nobody can enumerate; make the variation an axis — when(tone.danger, [...]) — and set a data attribute instead.',
      untracedClass:
        'This class does not trace back to a sheet imported from a *.style module. Only `sheet.key` from a *.style import (or a typed input carrying one) reaches the emitted stylesheet: a sheet declared anywhere else is never evaluated by the build, and its class has no CSS.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /** 'ok' | 'rawClass' | 'computedClass' | 'untracedClass' */
    const classify = (node, depth = 0) => {
      if (!node || depth > MAX_DEPTH) return 'untracedClass';
      switch (node.type) {
        case 'Literal':
          if (isNullish(node)) return 'ok';
          return typeof node.value === 'string' ? 'rawClass' : 'computedClass';
        case 'TemplateLiteral':
          return node.expressions.length ? 'computedClass' : 'rawClass';
        case 'Identifier': {
          if (isNullish(node)) return 'ok';
          const binding = bindingOf(sourceCode, node);
          if (binding.kind === 'import') {
            return isStyleModule(binding.source) ? 'ok' : 'untracedClass';
          }
          if (binding.kind === 'param') return 'ok';
          if (binding.kind === 'const')
            return classify(binding.init, depth + 1);
          return 'untracedClass';
        }
        case 'MemberExpression': {
          if (node.computed) return 'computedClass';
          const root = rootIdentifier(node);
          if (!root) return 'untracedClass';
          const binding = bindingOf(sourceCode, root);
          if (binding.kind === 'import') {
            return isStyleModule(binding.source) ? 'ok' : 'untracedClass';
          }
          if (binding.kind === 'param') return 'ok';
          if (
            binding.kind === 'const' &&
            binding.init.type === 'CallExpression' &&
            binding.init.callee.type === 'Identifier' &&
            binding.init.callee.name === 'craftStyles'
          ) {
            // A sheet declared in a component file: the build never evaluates
            // it, so its classes have no CSS.
            return 'untracedClass';
          }
          if (binding.kind === 'const') {
            return classify(binding.init, depth + 1) === 'ok'
              ? 'ok'
              : 'untracedClass';
          }
          return 'untracedClass';
        }
        case 'ArrayExpression': {
          for (const element of node.elements) {
            if (!element) continue;
            if (element.type === 'SpreadElement') return 'computedClass';
            const verdict = classify(element, depth + 1);
            if (verdict !== 'ok') return verdict;
          }
          return 'ok';
        }
        case 'ArrowFunctionExpression':
        case 'FunctionExpression': {
          for (const returned of returnedExpressions(node)) {
            const verdict = classify(returned, depth + 1);
            if (verdict !== 'ok') {
              return verdict === 'rawClass' ? 'rawClass' : 'computedClass';
            }
          }
          return 'ok';
        }
        case 'TSAsExpression':
        case 'TSSatisfiesExpression':
        case 'TSNonNullExpression':
          return classify(node.expression, depth + 1);
        default:
          // Conditionals, `&&`, objects of booleans, calls, concatenation:
          // all of them choose a class at render time.
          return 'computedClass';
      }
    };

    return {
      Property(node) {
        if (node.parent?.type !== 'ObjectExpression') return;
        const key = node.key;
        const name =
          key.type === 'Identifier' && !node.computed
            ? key.name
            : key.type === 'Literal'
              ? key.value
              : undefined;
        if (name !== 'class') return;
        const verdict = classify(node.value);
        if (verdict !== 'ok') {
          context.report({ node: node.value, messageId: verdict });
        }
      },
    };
  },
};
