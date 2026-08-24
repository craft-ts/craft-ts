const STYLE_MODULE = '@craft-ts/style';

/**
 * A style helper never takes a literal.
 *
 * The types already say so — no generated signature accepts a `string` — so
 * this rule is not a second guard against the same mistake. It exists for the
 * two places typing cannot reach: a value flowing in through `any`, and code
 * that has not been typechecked yet while it is being written. The message
 * points at the exact replacement, because a rule that only says "no" sends an
 * agent looking for a way round.
 *
 * It extends `no-hardcoded-design-values` to style-helper arguments rather than
 * duplicating it: same intent, one more position.
 */
const REPLACEMENTS = {
  length: 'a scale step or a unit — space(4), unit.rem(1.5), radii.md',
  color: 'a palette token — palette.surface.raised',
  keyword: 'the keyword member — display.flex, position.sticky',
};

const GLOBAL_KEYWORDS = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
]);

const LENGTH_LIKE = /^-?\d*\.?\d+(px|rem|em|%|vh|vw|ch|ex|pt|cm|mm|in)$/;
const COLOR_LIKE = /^(#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|hsla|var\()/;

/**
 * Helpers whose argument is legitimately a primitive.
 *
 * `space(4)` is how a scale step is written, `cssVars('badge', …)` takes a
 * name, `unsafeLength('13px', reason)` is the marked way out. Flagging these
 * would teach people to disable the rule, which costs more than the rule buys.
 */
const TAKES_PRIMITIVES = new Set([
  'space',
  'num',
  'int',
  'ident',
  'cssString',
  'url',
  'unsafeLength',
  'unsafeAssume',
  'oneOf',
  'craftStyles',
  'cssVars',
  'definePalette',
  'defineStateAxis',
  'defineBreakpoints',
  'defineAxis',
]);

/** Namespaces whose members are value constructors: `unit.px(4)`, `at.…`. */
const PRIMITIVE_NAMESPACES = new Set(['unit', 'kind', 'at']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow string and number literals as arguments to @craft-ts/style helpers.',
    },
    schema: [],
    messages: {
      rawValue:
        "'{{value}}' is a raw CSS value, not a design-system value. Pass {{replacement}} instead. If the scale is missing the value, add it to the scale; if it genuinely cannot be proven, use unsafeLength('{{value}}', reason) so the debt is countable.",
      rawGlobal:
        "'{{value}}' is a CSS-wide keyword; pass it as a token — global.{{token}}(prop.<name>) — so no helper has to accept a string.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const styleImports = new Set();
    const namespaces = new Set();

    const replacementFor = (value) => {
      if (typeof value === 'number') return REPLACEMENTS.length;
      if (COLOR_LIKE.test(value)) return REPLACEMENTS.color;
      if (LENGTH_LIKE.test(value)) return REPLACEMENTS.length;
      return REPLACEMENTS.keyword;
    };

    const isStyleHelper = (callee) => {
      if (callee.type === 'Identifier') {
        return (
          styleImports.has(callee.name) && !TAKES_PRIMITIVES.has(callee.name)
        );
      }
      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier'
      ) {
        const object = callee.object.name;
        if (PRIMITIVE_NAMESPACES.has(object)) return false;
        if (namespaces.has(object)) {
          // `style.space(4)` through a namespace import is still a value
          // constructor; the member name is what decides.
          return (
            callee.property.type === 'Identifier' &&
            !TAKES_PRIMITIVES.has(callee.property.name) &&
            !PRIMITIVE_NAMESPACES.has(callee.property.name)
          );
        }
        return styleImports.has(object);
      }
      return false;
    };

    return {
      ImportDeclaration(node) {
        if (node.source.value !== STYLE_MODULE) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            namespaces.add(specifier.local.name);
          } else if (specifier.type === 'ImportSpecifier') {
            styleImports.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (!isStyleHelper(node.callee)) return;
        for (const argument of node.arguments) {
          const isLiteral =
            argument.type === 'Literal' &&
            (typeof argument.value === 'string' ||
              typeof argument.value === 'number');
          const isTemplate =
            argument.type === 'TemplateLiteral' && argument.quasis.length > 0;
          if (!isLiteral && !isTemplate) continue;

          const value = isLiteral
            ? argument.value
            : sourceCode.getText(argument).slice(1, -1);

          if (typeof value === 'string' && GLOBAL_KEYWORDS.has(value)) {
            context.report({
              node: argument,
              messageId: 'rawGlobal',
              data: {
                value,
                token: value.replace(/-([a-z])/g, (_, char) =>
                  char.toUpperCase(),
                ),
              },
            });
            continue;
          }

          context.report({
            node: argument,
            messageId: 'rawValue',
            data: { value: String(value), replacement: replacementFor(value) },
          });
        }
      },
    };
  },
};
